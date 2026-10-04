import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAssistantSuggestions,
  type AssistantSuggestion,
} from '../shared/assistant-suggestions.js';
import type { CompanyRecordSummary } from '../shared/company-workspace.js';
import { getProductKnowledgeRecords } from '../shared/product-knowledge.js';

function record(
  id: string,
  name: string,
  code: string,
  year: number,
  createdAt: string
): CompanyRecordSummary {
  return {
    id,
    name,
    input: { securityCode: code, orgId: `issuer-${code}`, year },
    status: 'ready',
    createdAt,
  };
}

const hangzhou2024 = record(
  'hangzhou-2024',
  '杭州银行',
  '600926',
  2024,
  '2026-10-01T12:00:00.000Z'
);
const hangzhou2023 = record(
  'hangzhou-2023',
  '杭州银行',
  '600926',
  2023,
  '2026-10-03T12:00:00.000Z'
);
const pingan = record('pingan', '平安银行', '000001', 2024, '2026-10-02T12:00:00.000Z');
const steel = record('steel', '杭州钢铁', '600126', 2024, '2026-10-04T12:00:00.000Z');
const records = [hangzhou2024, hangzhou2023, pingan, steel];

function companyOptions(options: AssistantSuggestion[]) {
  return options.filter((option) => option.kind === 'company');
}

test('document hints use actual localized titles and chapter URLs without general fallbacks', () => {
  for (const [query, locale, expected] of [
    ['AI 训练', 'zh', '/docs/privacy#ai'],
    ['如何开始公司研究？', 'zh', '/docs/guide#start'],
    ['AI training', 'en', '/docs/privacy#ai'],
    ['privacy', 'en', '/docs/privacy#scope'],
  ] as const) {
    const options = getAssistantSuggestions(query, locale, []);
    assert.equal(options[0]?.kind, 'documentation');
    assert.ok(options.some((option) => option.kind === 'documentation' && option.url === expected));
    const corpus = getProductKnowledgeRecords(locale);
    for (const option of options) {
      assert.equal(option.kind, 'documentation');
      if (option.kind !== 'documentation') continue;
      assert.equal(option.label, corpus.find((entry) => entry.url === option.url)?.title);
      assert.ok(!('question' in option), 'Opening a chapter must not invent an assistant question');
    }
    assert.ok(options.length <= 3);
  }
  for (const draft of ['', ' ', '杭', '万科', 'zxqv7319 lunar-flamingo fixture'])
    assert.deepEqual(getAssistantSuggestions(draft, 'zh', []), []);
});

test('local company names, fullwidth codes and two-character prefixes match owning records', () => {
  for (const draft of [
    '杭州银行',
    '杭 州 银 行',
    '６００９２６',
    '杭州',
    '60',
    '请帮我看看杭州银行的情况',
    '请分析 600926 的现金',
  ]) {
    const options = companyOptions(getAssistantSuggestions(draft, 'zh', records));
    assert.ok(
      options.some((option) => option.runId === hangzhou2024.id),
      draft
    );
    for (const option of options) {
      assert.ok(records.some((item) => item.id === option.runId));
      assert.ok(option.question.endsWith(`\n${draft}`), 'Preserve the complete typed draft');
      assert.ok(option.question.length <= 500);
    }
  }
  for (const draft of ['银行', '金融', '0000019', '999999', '没有保存的企业'])
    assert.deepEqual(companyOptions(getAssistantSuggestions(draft, 'zh', records)), [], draft);
});

test('explicit annual scope overrides the current record and never substitutes an unknown year', () => {
  for (const draft of ['杭州银行2023年的利润', '杭州 ２０２３ 年', '600926 2023']) {
    const options = companyOptions(getAssistantSuggestions(draft, 'zh', records, hangzhou2024.id));
    assert.deepEqual(
      options.map((option) => option.runId),
      [hangzhou2023.id]
    );
    assert.ok(options[0].question.startsWith('关于杭州银行（600926）2023年：'));
  }
  assert.deepEqual(
    companyOptions(getAssistantSuggestions('杭州银行2022年的利润', 'zh', records)),
    []
  );
  assert.equal(
    companyOptions(getAssistantSuggestions('杭州银行', 'zh', records, hangzhou2024.id))[0]?.runId,
    hangzhou2024.id
  );
  assert.equal(
    companyOptions(getAssistantSuggestions('杭州银行', 'zh', records))[0]?.runId,
    hangzhou2023.id
  );
});

test('ambiguous prefixes and multiple issuers remain explicit choices within the three-item budget', () => {
  const prefix = getAssistantSuggestions('杭州', 'zh', records);
  assert.equal(prefix.length, 3);
  assert.deepEqual(
    new Set(companyOptions(prefix).map((option) => option.runId)),
    new Set([steel.id, hangzhou2023.id, hangzhou2024.id])
  );
  const twoIssuers = companyOptions(
    getAssistantSuggestions('杭州银行与平安银行2024年利润有什么差别？', 'zh', records)
  );
  assert.deepEqual(
    new Set(twoIssuers.map((option) => option.runId)),
    new Set([pingan.id, hangzhou2024.id])
  );
  for (const option of twoIssuers) {
    assert.ok(option.label.includes('2024'));
    assert.ok(option.question.includes('杭州银行与平安银行2024年利润有什么差别？'));
  }
});

test('duplicate saved runs do not repeat the same issuer-year hint or mutate caller data', () => {
  const duplicate = { ...hangzhou2024, id: 'duplicate', createdAt: '2026-10-04T15:00:00.000Z' };
  const input = [hangzhou2024, duplicate, pingan];
  const before = structuredClone(input);
  const options = companyOptions(
    getAssistantSuggestions('杭州银行2024年', 'zh', input, hangzhou2024.id)
  );
  assert.equal(options.length, 1);
  assert.equal(options[0].runId, hangzhou2024.id);
  assert.deepEqual(input, before);
});

test('English hints preserve issuer names and only match complete word names in sentences', () => {
  const alpha = record('alpha', 'Alpha Tech', '600999', 2024, '2026-10-04T12:00:00.000Z');
  const draft = "What changed in Alpha Tech's operating cash?";
  const options = companyOptions(getAssistantSuggestions(draft, 'en', [alpha]));
  assert.equal(options.length, 1);
  assert.equal(options[0].label, 'Alpha Tech · 2024');
  assert.equal(options[0].detail, 'Saved research · 600999');
  assert.equal(options[0].question, `Regarding Alpha Tech (600999), 2024:\n${draft}`);
  assert.equal(companyOptions(getAssistantSuggestions('ALPHA TE', 'en', [alpha])).length, 1);
  assert.deepEqual(companyOptions(getAssistantSuggestions('NotAlphaTech cash', 'en', [alpha])), []);
});

test('length limits withhold a company hint instead of truncating or replacing a long draft', () => {
  const draft = `杭州银行 ${'说明'.repeat(242)}`;
  assert.ok(draft.length <= 500);
  assert.deepEqual(companyOptions(getAssistantSuggestions(draft, 'zh', records)), []);
  assert.deepEqual(getAssistantSuggestions('杭'.repeat(501), 'zh', records), []);
  const spaced = '  杭州银行的现金为什么不同？  ';
  const options = companyOptions(getAssistantSuggestions(spaced, 'zh', [hangzhou2024]));
  assert.equal(options[0].question, `关于杭州银行（600926）2024年：\n${spaced}`);
});

test('choosing the same company hint again retains its generated scope and draft verbatim', () => {
  for (const locale of ['zh', 'en'] as const) {
    const draft = '  杭州银行的现金为什么不同？  ';
    const first = companyOptions(getAssistantSuggestions(draft, locale, [hangzhou2024]))[0];
    const second = companyOptions(
      getAssistantSuggestions(first.question, locale, [hangzhou2024])
    )[0];
    assert.equal(second.question, first.question);
    assert.equal(second.question.length, first.question.length);
    assert.ok(second.question.endsWith(`\n${draft}`));
  }
});

test('hints consume only the supplied owner collection and keep no cross-owner state', () => {
  assert.equal(companyOptions(getAssistantSuggestions('杭州银行', 'zh', [hangzhou2024])).length, 1);
  assert.deepEqual(
    companyOptions(getAssistantSuggestions('杭州银行', 'zh', [pingan], hangzhou2024.id)),
    []
  );
  assert.deepEqual(companyOptions(getAssistantSuggestions('杭州银行', 'zh', [])), []);
  assert.deepEqual(companyOptions(getAssistantSuggestions('平安银行', 'zh', [hangzhou2024])), []);
});
