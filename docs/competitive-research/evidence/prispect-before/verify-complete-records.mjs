import { request } from '/workspace/prispect/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = '/workspace/prispect-improve/docs/competitive-research/evidence/prispect-before';
const base = 'http://127.0.0.1:4319';
const a = JSON.parse(
  await readFile('/workspace/research-envs/prispect-before-account.json', 'utf8')
);
const ids = JSON.parse(await readFile(out + '/record-ids.json', 'utf8'));
const c = await request.newContext({ baseURL: base });
const s = await (
  await c.post('/api/auth/login', { data: { email: a.email, password: a.password } })
).json();
const headers = { 'X-CSRF-Token': s.csrfToken, Origin: base };
const call = async (path, data, method = 'POST') => {
  const r = await c.fetch('/api' + path, { method, headers, data });
  assert.ok(r.ok(), await r.text());
  return r.json();
};
const original = await (await c.get(`/api/decisions/${ids.decisionId}`)).json();
const company = original.version.input.transactionEntity;
const rows = [
  ['paid', '10000', `${company}截至2026-10-03，实际已付款10000元。`],
  ['delivered', '0', `${company}截至2026-10-03，已交付对应金额0元。`],
  ['refunded', '0', `${company}截至2026-10-03，实际已收到退款0元。`],
];
const input = {
  company,
  shortName: '合成演练供应商',
  title: '三条独立定位字段（合成原文）',
  filename: 'complete-records.json',
  origin: 'user-upload',
  documentDate: '2026-10-03',
  sha256: 'b'.repeat(64),
  observations: [],
  excerpts: [{ page: 1, text: rows.map((r) => r[2]).join('\n') }],
  notes: ['纯合成输入；每条记录独立包含主体、日期与金额，不表示真实经济事件。'],
};
const bytes = Buffer.from(JSON.stringify(input, null, 2));
await writeFile(out + '/complete-records.json-upload', bytes);
const r = await c.post('/api/materials/preview', {
  headers,
  multipart: {
    file: { name: 'complete-records.json', mimeType: 'application/json', buffer: bytes },
  },
});
assert.equal(r.status(), 200);
const p = await r.json();
const m = await call('/materials', p.material);
let d = await call('/decisions', {
  ...original.version.input,
  title: '合成完整记录 · 撤回与恢复基线',
});
for (const [slot, amount, quote] of rows)
  d = await call(`/decisions/${d.decision.id}/evidence`, {
    baseRevision: d.decision.currentRevision,
    evidence: {
      slot,
      kind: 'source-record',
      entity: company,
      asOf: '2026-10-03',
      values: { amount },
      quote,
      sourceLabel: '每行独立定位的合成字段',
      materialId: m.id,
      page: 1,
    },
  });
assert.equal(d.evaluation.external.recordScenarios[0].exposure, '30000.00');
assert.equal(d.evaluation.external.recordScenarios[1].exposure, '15000.00');
const before = d;
const paid = d.version.evidence.find((e) => e.slot === 'paid');
const withdrawn = await call(
  `/decisions/${d.decision.id}/evidence/${paid.id}`,
  { baseRevision: d.decision.currentRevision, state: 'withdrawn' },
  'PATCH'
);
assert.equal(withdrawn.evaluation.external.recordScenarios[0].exposure, null);
assert.equal(withdrawn.evaluation.external.assumptionScenarios[0].exposure, '30000.00');
const restored = await call(
  `/decisions/${d.decision.id}/evidence/${paid.id}`,
  { baseRevision: withdrawn.decision.currentRevision, state: 'active' },
  'PATCH'
);
assert.equal(restored.evaluation.external.recordScenarios[0].exposure, '30000.00');
await writeFile(
  out + '/complete-records-results.json',
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      before,
      withdrawn,
      restored,
      note: 'First broad UI capture located only paid, because delivery/refund quotation repeated a company prefix not present in the source sentence. This second synthetic source puts each full quotation on a separate saved line; all three slots locate before withdrawal.',
    },
    null,
    2
  )
);
await c.dispose();
