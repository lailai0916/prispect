// Optional explicitly selected contract identity review is independent of cash calculation.
import { request, chromium } from '/workspace/prispect-improve/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:4320',
  out = '/workspace/prispect-improve/docs/competitive-research/evidence/prispect-after';
const account = JSON.parse(
  await readFile('/workspace/research-envs/prispect-after-account.json', 'utf8')
);
const ids = JSON.parse(await readFile(out + '/record-ids.json', 'utf8'));
const state = process.env.PRISPECT_STORAGE_STATE;
if (!state)
  throw Error(
    'Reuse a valid owning-account browser storageState; this verifier does not repeat login'
  );
const api = await request.newContext({ baseURL: base, storageState: state });
const session = await (await api.get('/api/auth/session')).json();
assert.equal(session.user?.id, account.userId);
const headers = { 'X-CSRF-Token': session.csrfToken, Origin: base };
const call = async (path, data, method = 'POST') => {
  const r = await api.fetch('/api' + path, { method, headers, data });
  const d = await r.json();
  assert.ok(r.ok(), path + ' ' + r.status());
  return d;
};
const roleDoc = JSON.parse(await readFile(out + '/roles-and-terms.json-upload', 'utf8'));
const company = roleDoc.company,
  quote = roleDoc.excerpts[0].text.split('\n')[0];
const input = {
  title: '合成交接 · 自选签约主体核对独立于现金',
  purpose: 'handover',
  transactionEntity: company,
  reportTaskId: null,
  promise: '合成演练；定位主体字段不证明集团关系或承诺真假。',
  claims: [
    { id: 'optional-contract-role', text: '集团上市（合成待核原话）', target: 'contract-entity' },
  ],
  external: null,
  datedCash: {
    asOf: '2026-10-03',
    openingCash: '1000',
    cashFloor: '300',
    proposedAmount: '100',
    proposedDay: 2,
    alternativeDay: 3,
    flows: [],
  },
};
let detail = await call('/decisions', input);
const originalCash = structuredClone(detail.evaluation.cash);
assert.equal(detail.evaluation.gates.find((g) => g.id === 'identity-contract').status, 'unknown');
detail = await call('/decisions/' + detail.decision.id + '/evidence', {
  baseRevision: detail.decision.currentRevision,
  evidence: {
    slot: 'identity',
    kind: 'source-record',
    entity: company,
    asOf: '2026-10-03',
    values: { entity: company, role: 'contract' },
    quote,
    sourceLabel: '合成责任角色原件',
    materialId: ids.roleMaterialId,
    page: 1,
  },
});
assert.equal(detail.evaluation.gates.find((g) => g.id === 'identity-contract').status, 'matched');
assert.deepEqual(detail.evaluation.cash, originalCash);
const matched = detail,
  record = detail.version.evidence.find((e) => e.slot === 'identity');
detail = await call(
  '/decisions/' + detail.decision.id + '/evidence/' + record.id,
  { baseRevision: detail.decision.currentRevision, state: 'withdrawn' },
  'PATCH'
);
assert.equal(detail.evaluation.gates.find((g) => g.id === 'identity-contract').status, 'withdrawn');
assert.deepEqual(detail.evaluation.cash, originalCash);
const withdrawn = detail;
detail = await call(
  '/decisions/' + detail.decision.id + '/evidence/' + record.id,
  { baseRevision: detail.decision.currentRevision, state: 'active' },
  'PATCH'
);
assert.equal(detail.evaluation.gates.find((g) => g.id === 'identity-contract').status, 'matched');
assert.deepEqual(detail.evaluation.cash, originalCash);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({
  storageState: state,
  viewport: { width: 390, height: 844 },
  colorScheme: 'dark',
});
const page = await context.newPage();
await page.goto(base + '/decisions?id=' + detail.decision.id);
await page.waitForLoadState('networkidle');
assert.match(
  await page.locator('section[aria-label="说法与依据对照"]').innerText(),
  /未对原话作语义鉴定/
);
await page.screenshot({
  path: out + '/handover-explicit-contract-claim-390-dark.png',
  fullPage: true,
});
await browser.close();
await writeFile(
  out + '/handover-contract-claim-results.json',
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      kind: 'actual-private-source-located-optional-claim',
      checks: [
        'explicit-contract-target-adds-separate-gate',
        'unknown-to-matched-source-located',
        'withdrawn-does-not-change-cash',
        'restore-does-not-change-cash',
        'original-words-remain-unjudged',
      ],
      cashUnchanged: true,
      matched,
      withdrawn,
      restored: detail,
    },
    null,
    2
  )
);
await api.dispose();
