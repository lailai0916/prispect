// Actual saved synthetic handover input, deterministic cash ordering and downloaded UI export.
import { chromium } from '/workspace/prispect-improve/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:4320',
  out = '/workspace/prispect-improve/docs/competitive-research/evidence/prispect-after';
const account = JSON.parse(
  await readFile('/workspace/research-envs/prispect-after-account.json', 'utf8')
);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
  storageState: process.env.PRISPECT_STORAGE_STATE || undefined,
});
const page = await context.newPage();
const result = {
  recordedAt: new Date().toISOString(),
  kind: 'actual-private-saved-synthetic-handover',
  checks: [],
  pageErrors: [],
};
page.on('pageerror', (e) => result.pageErrors.push(String(e)));
try {
  if (!process.env.PRISPECT_STORAGE_STATE) {
    await page.goto(base + '/login?next=/decisions');
    await page.locator('input[name=email]').fill(account.email);
    await page.locator('input[name=password]').fill(account.password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.waitForURL((url) => url.pathname === '/decisions');
  } else {
    await page.goto(base + '/decisions');
    await page.waitForLoadState('networkidle');
  }
  const s = await (await context.request.get(base + '/api/auth/session')).json();
  assert.equal(s.user?.id, account.userId, 'Existing session must belong to the controlled owner');
  const headers = { 'X-CSRF-Token': s.csrfToken, Origin: base };
  const call = async (path, data, method = 'POST') => {
    const r = await context.request.fetch(base + '/api' + path, { method, headers, data });
    assert.ok(r.ok(), path + ' ' + r.status());
    return r.json();
  };
  const input = {
    title: '合成现金同日顺序 · 日末充足仍可能短缺',
    purpose: 'handover',
    transactionEntity: '合成现金顺序样本（非真实企业）',
    reportTaskId: null,
    promise: '合成安排：同日可能先付款再到账；保留所有金额与日期。',
    claims: [
      { id: 'cash-events-check', text: '同日回款可覆盖付款（合成说法）', target: 'cash-events' },
    ],
    external: null,
    datedCash: {
      asOf: '2026-10-03',
      openingCash: '1000',
      cashFloor: '300',
      proposedAmount: '100',
      proposedDay: 2,
      alternativeDay: 3,
      flows: [
        {
          id: 'receipt-day2',
          label: '合成待到账',
          direction: 'in',
          day: 2,
          amount: '1000',
          flexibility: 'fixed',
        },
        {
          id: 'fixed-payment-day2',
          label: '合成必要付款',
          direction: 'out',
          day: 2,
          amount: '1500',
          flexibility: 'fixed',
        },
      ],
    },
  };
  let detail = await call('/decisions', input);
  const p = detail.evaluation.cash.primary,
    a = detail.evaluation.cash.alternative;
  assert.equal(p.minimumBalance, '400.00');
  assert.equal(p.conservativeMinimumBalance, '-600.00');
  assert.equal(p.conservativeMaximumGap, '900.00');
  assert.equal(p.sameDayOrderSensitive, true);
  assert.equal(a.minimumBalance, '400.00');
  assert.equal(a.conservativeMinimumBalance, '-500.00');
  assert.equal(detail.evaluation.recordedCash.primary.status, 'unknown');
  await page.goto(base + '/decisions?id=' + detail.decision.id);
  await page.waitForLoadState('networkidle');
  await page.locator('button[aria-controls=decision-panel-scenarios]').click();
  await page.screenshot({ path: out + '/cash-01-day-end-and-payments-first.png', fullPage: true });
  await page.getByRole('button', { name: '核查事项操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '预览并导出这个版本', exact: true }).click();
  const preview = page.locator('.export-preview-dialog');
  await preview.locator('iframe').waitFor();
  const downloading = page.waitForEvent('download');
  await preview.getByRole('button', { name: '保存文件', exact: true }).click();
  await (await downloading).saveAs(out + '/export-cash-handover.html');
  const html = await readFile(out + '/export-cash-handover.html', 'utf8');
  assert.match(html, /现金时序与反求约束/);
  assert.match(html, /-600.00/);
  assert.match(html, /receipt-day2/);
  assert.match(html, /2026-10-05/);
  assert.match(html, /最低付款优先余额/);
  assert.match(html, /同日先付款可能低于底线/);
  result.checks.push({
    name: 'saved-input-known-day-end400-payments-first-600-gap900-and-events-exported',
    pass: true,
  });
  const before = detail;
  detail = await call(
    '/decisions/' + detail.decision.id,
    {
      baseRevision: detail.decision.currentRevision,
      input: {
        ...input,
        datedCash: {
          ...input.datedCash,
          flows: input.datedCash.flows.map((f) =>
            f.id === 'fixed-payment-day2' ? { ...f, day: null } : f
          ),
        },
      },
    },
    'PATCH'
  );
  assert.equal(detail.evaluation.cash.primary.status, 'unknown');
  assert.ok(
    detail.changes.changes.some(
      (c) => c.kind === 'calculation' && c.before === '-600.00' && c.after === null
    )
  );
  const exporter = await import('/workspace/prispect-improve/shared/decision-export.ts');
  const unknownHtml = exporter.renderDecisionExport(detail);
  assert.match(unknownHtml, /未知或未提供/);
  const ordering = unknownHtml.slice(
    unknownHtml.indexOf('<h2>现金时序与反求约束'),
    unknownHtml.indexOf('<h2>已知冲突')
  );
  assert.ok(
    !ordering.includes('-600.00'),
    'Current unknown summary must not retain earlier conservative result'
  );
  await writeFile(out + '/export-cash-unknown-date.html', unknownHtml);
  await page.goto(base + '/decisions?id=' + detail.decision.id);
  await page.waitForLoadState('networkidle');
  await page.locator('button[aria-controls=decision-panel-history]').click();
  await page.screenshot({ path: out + '/cash-02-missing-date-pauses-changes.png', fullPage: true });
  result.checks.push({
    name: 'missing-required-event-date-pauses-conservative-calculation-and-diff',
    pass: true,
  });
  const missingDate = detail;
  detail = await call(
    '/decisions/' + detail.decision.id,
    { baseRevision: detail.decision.currentRevision, input },
    'PATCH'
  );
  assert.equal(detail.evaluation.cash.primary.conservativeMinimumBalance, '-600.00');
  await writeFile(
    out + '/cash-export-results.json',
    JSON.stringify(
      {
        ...result,
        before,
        missingDate,
        restored: detail,
      },
      null,
      2
    )
  );
  await writeFile(
    out + '/cash-record-ids.json',
    JSON.stringify({ decisionId: detail.decision.id }, null, 2)
  );
} catch (e) {
  result.error = String(e);
  throw e;
} finally {
  result.finishedAt = new Date().toISOString();
  await writeFile(out + '/cash-browser-results.json', JSON.stringify(result, null, 2));
  await browser.close();
}
