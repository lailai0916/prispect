import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import type {
  DecisionDetail,
  DecisionInput,
  DecisionVersion,
} from '../shared/decision-contracts.js';
import { evaluateDecision } from '../server/decision-engine.js';
import { renderDecisionExport } from '../shared/decision-export.js';
import { deriveDecisionChanges } from '../shared/decision-change.js';

const input = (): DecisionInput => ({
  title: '合成离线核查',
  purpose: 'external',
  transactionEntity: '合成商家',
  tradingName: '合成品牌',
  reportTaskId: null,
  promise: '退款只是承诺',
  claims: [{ id: 'refund', text: '随时退款', target: 'refunded' }],
  datedCash: null,
  external: {
    asOf: '2026-10-03',
    totalAmount: '100',
    payeeEntity: '合成商家',
    refundEntity: '合成商家',
    alreadyPaid: '20',
    deliveredAmount: '10',
    actualRefund: '0',
    proposedAmount: null,
    alternativeAmount: null,
    exposureLimit: '30',
  },
});
const version = (value = input()): DecisionVersion => ({
  revision: 1,
  createdAt: '2026-10-03T00:00:00Z',
  reason: 'created',
  input: value,
  evidence: [],
});
function detail(v = version()): DecisionDetail {
  return {
    decision: {
      id: 'synthetic-private-decision',
      title: v.input.title,
      purpose: v.input.purpose,
      transactionEntity: v.input.transactionEntity,
      currentRevision: v.revision,
      createdAt: v.createdAt,
      updatedAt: v.createdAt,
    },
    version: v,
    evaluation: evaluateDecision(v, { tasks: [], materials: [] }),
    revisions: [{ revision: v.revision, createdAt: v.createdAt, reason: v.reason }],
  };
}

test('offline export escapes saved text in every table and quote, with no executable or remote content', () => {
  const d = detail(),
    payload =
      '</td><script>globalThis.exportAttack=1</script><img src="https://example.com/leak" onerror="attack()">&"\'';
  d.version.input.title = payload;
  d.version.input.promise = payload;
  d.version.input.claims![0]!.text = payload;
  d.version.evidence.push({
    id: 'ev',
    slot: 'refunded',
    kind: 'counterparty-statement',
    entity: payload,
    asOf: null,
    quote: payload,
    sourceLabel: payload,
    values: { terms: payload },
    state: 'active',
    createdAt: d.version.createdAt,
  });
  const html = renderDecisionExport(d),
    $ = load(html);
  assert.equal($('script,img,iframe,link,form,a').length, 0);
  assert.equal($('[onclick],[onerror]').length, 0);
  assert.equal($('title').text(), `${payload} · Prispect`);
  assert.ok($('body').text().includes(payload));
  assert.equal(
    $('meta[http-equiv="Content-Security-Policy"]').attr('content'),
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"
  );
  assert.match(html, /原件文件未打包/);
});
test('the inverse payment ceiling remains available without proposed amounts and does not certify records', () => {
  const $ = load(renderDecisionExport(detail()));
  const section = $('section').filter((_, el) =>
    $(el).find('h2').text().startsWith('付款条件反求')
  );
  assert.match(section.text(), /20\.00/);
  assert.match(section.text(), /未知 · 依据或条件不齐/);
  assert.match(section.text(), /交易总额与上限仍是输入条件/);
  assert.match(section.text(), /不是付款批准或推荐/);
});
test('a current exposure above the chosen limit exports a stopped state, not a zero ceiling', () => {
  const d = detail();
  d.version.input.external!.exposureLimit = '5';
  d.evaluation = evaluateDecision(d.version, { tasks: [], materials: [] });
  const $ = load(renderDecisionExport(d));
  const rows = $('section')
    .filter((_, el) => $(el).find('h2').text().startsWith('付款条件反求'))
    .find('tbody tr');
  assert.match(rows.eq(0).text(), /无非负解/);
  assert.equal(rows.eq(0).find('td').eq(2).text(), '未知或未提供');
  assert.equal(rows.eq(0).find('td').eq(4).text(), '5.00');
});
test('cash exports retain day-end success and the distinct outflows-first shortfall, event and threshold basis', () => {
  const value = input();
  value.purpose = 'handover';
  value.external = null;
  value.claims = [];
  value.datedCash = {
    asOf: '2026-10-03',
    openingCash: '20',
    cashFloor: '0',
    proposedAmount: '100',
    proposedDay: 5,
    alternativeDay: 6,
    flows: [
      {
        id: 'receipt',
        label: '合成同日回款',
        direction: 'in',
        day: 5,
        amount: '120',
        flexibility: 'fixed',
      },
    ],
  };
  const $ = load(renderDecisionExport(detail(version(value))));
  assert.match($('body').text(), /所列日末检查点未低于底线/);
  assert.match($('body').text(), /同日顺序影响底线/);
  assert.match($('body').text(), /-80\.00/);
  assert.match($('body').text(), /付款优先最大缺口/);
  assert.match($('body').text(), /receipt/);
  assert.match($('body').text(), /固定事件/);
});
test('statement exports retain unsupported-target and historical-explanation boundaries', () => {
  const d = detail();
  d.version.input.claims = [
    { id: 'old', text: '当前现金充裕', target: 'opening-cash' },
    { id: 'collections', text: '回款只是暂缓', target: 'collections' },
  ];
  const text = load(renderDecisionExport(d))('body').text();
  assert.match(text, /目标不适用于本事项类型，请在编辑时重新选择/);
  assert.match(text, /历史财务信号不适用；材料状态不裁定经营原因/);
  assert.match(text, /字段可核对不认证原话真实/);
});
test('exports use the frozen saved version and label adjacent comparisons under current rules', () => {
  const a = version(),
    b = structuredClone(a);
  b.revision = 2;
  b.input.external!.actualRefund = null;
  const d = detail(b);
  d.changes = deriveDecisionChanges(
    a,
    b,
    evaluateDecision(a, { tasks: [], materials: [] }),
    d.evaluation
  );
  const html = renderDecisionExport(d),
    $ = load(html);
  b.input.title = '后来编辑';
  assert.equal($('h1').text(), '合成离线核查');
  assert.match($('body').text(), /V1 → V2/);
  assert.match($('body').text(), /未重新取证，不表示企业经济变化/);
  assert.match($('body').text(), /实际到账退款 \(CNY\)/);
  assert.match($('body').text(), /未知或未提供/);
});
