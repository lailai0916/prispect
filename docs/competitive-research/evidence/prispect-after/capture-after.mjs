import { chromium, request } from '/workspace/prispect-improve/node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const base = process.env.PRISPECT_AFTER_URL || 'http://127.0.0.1:4320';
const out = '/workspace/prispect-improve/docs/competitive-research/evidence/prispect-after';
const root = '/workspace/prispect-improve';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  colorScheme: 'light',
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
const result = {
  startedAt: new Date().toISOString(),
  base,
  browser: browser.version(),
  baselineSha: 'd748d1ac5c1a9c6fe702301c819980e1cce87312',
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  checks: [],
  images: [],
  pageErrors: [],
  consoleErrors: [],
  limitations: [],
};
const sourceFiles = execFileSync(
  'git',
  [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    'src',
    'shared',
    'server',
    'package.json',
    'package-lock.json',
  ],
  { cwd: root, encoding: 'utf8' }
)
  .trim()
  .split('\n')
  .sort();
const sourceHash = createHash('sha256');
for (const file of new Set(sourceFiles)) {
  sourceHash.update(file);
  sourceHash.update(await readFile(root + '/' + file));
}
result.sourceFingerprint = sourceHash.digest('hex');
page.on('pageerror', (e) => result.pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') result.consoleErrors.push(m.text());
});
const capture = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  result.images.push(name);
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(dimensions.document <= dimensions.viewport, `${name} document overflow`);
  result.checks.push({ name, url: page.url(), dimensions });
};
const visit = async (path) => {
  await page.goto(base + path);
  await page.waitForLoadState('networkidle');
};
let session, headers, other;
const call = async (path, data, method = 'POST') => {
  const r = await context.request.fetch(base + '/api' + path, { method, headers, data });
  const value = await r.json();
  assert.ok(r.ok(), `${method} ${path}: ${r.status()} ${JSON.stringify(value)}`);
  return value;
};
const get = async (path) => {
  const r = await context.request.get(base + '/api' + path);
  assert.ok(r.ok(), `${path} ${r.status()}`);
  return r.json();
};
const upload = async (name, bytes) => {
  const r = await context.request.post(base + '/api/materials/preview', {
    headers,
    multipart: { file: { name, mimeType: 'application/json', buffer: bytes } },
  });
  assert.equal(r.status(), 200);
  const p = await r.json();
  const m = await call('/materials', p.material);
  const original = await context.request.get(base + `/api/materials/${m.id}/file`);
  assert.equal(original.status(), 200);
  assert.equal(
    createHash('sha256')
      .update(await original.body())
      .digest('hex'),
    createHash('sha256').update(bytes).digest('hex')
  );
  return m;
};
try {
  const capability = await get('/public/research-capabilities');
  assert.equal(
    capability.modelConfigured,
    false,
    'This isolated verification must not call a configured external model'
  );
  result.checks.push({ name: 'no-external-model-configured', pass: true });
  const reuse = process.env.PRISPECT_REUSE_ACCOUNT === '1';
  const reusedAccount = reuse
    ? JSON.parse(await readFile('/workspace/research-envs/prispect-after-account.json', 'utf8'))
    : null;
  const email = reusedAccount?.email || `after-${Date.now()}@example.test`;
  const password = reusedAccount?.password || 'After!26Paper$Delta';
  await visit((reuse ? '/login' : '/register') + '?next=/query');
  if (!reuse) await page.locator('input[name=name]').fill('隔离改进验收');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  if (!reuse) await page.locator('input[name=confirmation]').fill(password);
  await page.getByRole('button', { name: reuse ? '登录' : '创建账号', exact: true }).click();
  result.checks.push({
    name: reuse ? 'real-UI-login-existing-isolated-owner' : 'real-UI-register-isolated-owner',
    pass: true,
  });
  await page.waitForURL((url) => url.pathname === '/query');
  await page.waitForLoadState('networkidle');
  await capture('01-desktop-light-query');
  session = await get('/auth/session');
  assert.ok(session.user && session.csrfToken);
  headers = { 'X-CSRF-Token': session.csrfToken, Origin: base };
  await writeFile(
    '/workspace/research-envs/prispect-after-account.json',
    JSON.stringify({ email, password, userId: session.user.id }, null, 2),
    { mode: 0o600 }
  );
  const financialBytes = await readFile(out + '/synthetic-original.json-upload');
  const material = await upload('synthetic-baseline.json', financialBytes);
  const rowsBytes = await readFile(out + '/complete-records.json-upload');
  const privateMaterial = await upload('complete-records.json', rowsBytes);
  const company = JSON.parse(rowsBytes).company;
  const pending = await call('/tasks', {
    title: '合成基线 · 利润与经营现金',
    company,
    year: 2025,
    materialIds: [material.id],
    purpose: 'external',
  });
  let task;
  for (let i = 0; i < 50; i++) {
    task = await get(`/tasks/${pending.id}`);
    if (task.status === 'completed') break;
    await page.waitForTimeout(150);
  }
  assert.equal(task.status, 'completed');
  assert.equal(task.report.model.status, 'not-configured');
  await writeFile(out + '/synthetic-report.json', JSON.stringify(task, null, 2));
  await writeFile(
    out + '/record-ids.json',
    JSON.stringify(
      { taskId: task.id, materialId: material.id, privateMaterialId: privateMaterial.id },
      null,
      2
    )
  );
  result.checks.push({ name: 'same-financial-input-rules-completed', pass: true, taskId: task.id });
  await visit(`/tasks/${task.id}`);
  await capture('02-desktop-light-report');
  await page.getByRole('button', { name: '查看指标来源', exact: true }).first().click();
  await capture('03-desktop-light-original-drawer');
  await page.getByRole('button', { name: /关闭/ }).last().click();
  await page.getByText('分析依据与核查记录', { exact: true }).click();
  await page.getByRole('button', { name: '证据实验室', exact: true }).click();
  await capture('04-desktop-light-learning-lab');
  const learning = page.locator('details.evidence-learning');
  assert.equal(await learning.count(), 1, 'Withdrawal practice must have an actual report entry');
  await learning.locator('summary').first().click();
  if (await learning.locator('select').count()) {
    await learning.locator('select').selectOption('fact-2025-inventoryAdjustment');
    const learningRequests = [];
    const watchLearning = (req) => {
      if (req.url().includes('/api/'))
        learningRequests.push({ method: req.method(), url: req.url() });
    };
    page.on('request', watchLearning);
    await learning.getByRole('button', { name: '验证我的预测', exact: true }).click();
    await page.waitForTimeout(150);
    await capture('04a-desktop-light-prediction-feedback');
    assert.ok((await learning.locator('[data-learning-state=paused]').count()) > 0);
    assert.match(await learning.innerText(), /现金利润比[\s\S]*60\.00%/);
    await learning.getByRole('button', { name: '恢复演练', exact: true }).click();
    await page.waitForTimeout(100);
    page.off('request', watchLearning);
    assert.equal(learningRequests.length, 0, 'Practice must stay local');
    assert.match(await learning.innerText(), /演练已恢复/);
    const afterPractice = await get(`/tasks/${task.id}`);
    assert.deepEqual(afterPractice.report, task.report);
    result.checks.push({
      name: 'prediction-trial-restoration-local-no-write-no-grade-change',
      pass: true,
    });
    await capture('04b-desktop-light-prediction-restored');
  } else {
    assert.match(await learning.innerText(), /没有可用于撤回练习的来源事实/);
    await capture('04c-desktop-light-upload-original-unavailable');
    result.limitations.push(
      'Uploaded material original is retained but EvidenceLab requires a public sourceUrl; local upload learning currently cannot start. Root notified.'
    );
    result.checks.push({
      name: 'upload-learning-empty-state-stops-without-fabrication',
      pass: true,
    });
  }

  const decisionInput = {
    title: '合成付款核验 · 承诺与实际退款',
    transactionEntity: company,
    tradingName: '合成门店品牌（非企业名称）',
    purpose: 'external',
    promise: '对方原话（合成）：集团上市，付款可退，先支付20000元即可锁定交付。',
    claims: [
      { id: 'claim-refund', text: '付款可退', target: 'refunded' },
      { id: 'claim-identity', text: '集团上市', target: 'contract-entity' },
      { id: 'claim-delivery', text: '先支付20000元即可锁定交付', target: 'terms' },
    ],
    reportTaskId: task.id,
    datedCash: null,
    external: {
      asOf: '2026-10-03',
      totalAmount: '100000',
      payeeEntity: company,
      refundEntity: company,
      alreadyPaid: '10000',
      deliveredAmount: '0',
      actualRefund: '0',
      proposedAmount: '20000',
      alternativeAmount: '5000',
      exposureLimit: '20000',
    },
  };
  let decision = await call('/decisions', decisionInput);
  const rows = [
    ['paid', '10000', `${company}截至2026-10-03，实际已付款10000元。`],
    ['delivered', '0', `${company}截至2026-10-03，已交付对应金额0元。`],
    ['refunded', '0', `${company}截至2026-10-03，实际已收到退款0元。`],
  ];
  for (const [slot, amount, quote] of rows)
    decision = await call(`/decisions/${decision.decision.id}/evidence`, {
      baseRevision: decision.decision.currentRevision,
      evidence: {
        slot,
        kind: 'source-record',
        entity: company,
        asOf: '2026-10-03',
        values: { amount },
        quote,
        sourceLabel: '三行明确范围的合成字段',
        materialId: privateMaterial.id,
        page: 1,
      },
    });
  assert.equal(decision.evaluation.external.assumptionScenarios[0].exposure, '30000.00');
  assert.equal(decision.evaluation.external.recordScenarios[0].exposure, '30000.00');
  assert.equal(decision.evaluation.external.recordScenarios[1].exposure, '15000.00');
  result.checks.push({ name: 'known-record-A30000-B15000-and-assumptions', pass: true });
  const decisionPath = `/decisions?id=${decision.decision.id}`;
  await visit(decisionPath);
  await capture('05-desktop-light-decision-overview');
  for (const [panel, name] of [
    ['scenarios', '06-payment-boundary'],
    ['conditions', '07-trading-identity'],
    ['evidence', '08-evidence'],
    ['history', '09-change-history'],
  ]) {
    await page.locator(`button[aria-controls=decision-panel-${panel}]`).click();
    await capture('desktop-light-' + name);
  }
  // Same three amount records as baseline above; separately supply explicit role/term originals.
  const roleBytes = await readFile(out + '/roles-and-terms.json-upload');
  const roleMaterial = await upload('roles-and-terms.json', roleBytes);
  const roleRows = JSON.parse(roleBytes).excerpts[0].text.split('\n');
  const boundaryModule = await import(root + '/shared/payment-boundary.ts');
  const beforeRoles = boundaryModule.derivePaymentBoundary(decision);
  assert.equal(beforeRoles.records.status, 'unknown');
  for (const [index, role] of ['contract', 'payee', 'refund'].entries())
    decision = await call(`/decisions/${decision.decision.id}/evidence`, {
      baseRevision: decision.decision.currentRevision,
      evidence: {
        slot: 'identity',
        kind: 'source-record',
        entity: company,
        asOf: '2026-10-03',
        values: { entity: company, role },
        quote: roleRows[index],
        sourceLabel: '合成责任角色原文字段',
        materialId: roleMaterial.id,
        page: 1,
      },
    });
  decision = await call(`/decisions/${decision.decision.id}/evidence`, {
    baseRevision: decision.decision.currentRevision,
    evidence: {
      slot: 'terms',
      kind: 'source-record',
      entity: company,
      asOf: '2026-10-03',
      values: { terms: '付款后按合同交付，退款责任需书面核对' },
      quote: roleRows[3],
      sourceLabel: '合成条款原文字段',
      materialId: roleMaterial.id,
      page: 1,
    },
  });
  const completeBoundary = boundaryModule.derivePaymentBoundary(decision);
  assert.equal(completeBoundary.assumptions.maximumProposedAmount, '10000.00');
  assert.equal(completeBoundary.records.maximumProposedAmount, '10000.00');
  assert.equal(completeBoundary.records.currentExposure, '10000.00');
  await writeFile(
    out + '/payment-boundary-results.json',
    JSON.stringify({ beforeRoles, completeBoundary }, null, 2)
  );
  result.checks.push({
    name: 'role-term-originals-unlock-record-boundary-input-limit10000',
    pass: true,
  });
  await visit(decisionPath);
  await page.locator('button[aria-controls=decision-panel-scenarios]').click();
  await capture('09a-desktop-light-complete-record-boundary');
  assert.match(await page.locator('section[aria-label="反求付款条件边界"]').innerText(), /10,000/);
  await page.locator('button[aria-controls=decision-panel-overview]').click();
  assert.match(
    await page.locator('section[aria-label="说法与依据对照"]').innerText(),
    /未对原话作语义鉴定/
  );
  assert.ok(
    (await page.getByText('核对拟付款与自设暴露条件', { exact: true }).count()) > 0,
    'Existing limit with excessive proposed payment must request reviewing conditions, not adding a limit'
  );
  await capture('09b-desktop-light-located-claims-not-truth');

  const paid = decision.version.evidence.find((e) => e.slot === 'paid');
  const beforeWithdraw = decision;
  decision = await call(
    `/decisions/${decision.decision.id}/evidence/${paid.id}`,
    { baseRevision: decision.decision.currentRevision, state: 'withdrawn' },
    'PATCH'
  );
  assert.equal(decision.evaluation.external.recordScenarios[0].exposure, null);
  assert.equal(decision.evaluation.external.assumptionScenarios[0].exposure, '30000.00');
  assert.ok(
    decision.changes.changes.some(
      (c) => c.kind === 'evidence' && c.before === 'active' && c.after === 'withdrawn'
    )
  );
  assert.ok(
    decision.changes.changes.some(
      (c) => c.kind === 'calculation' && c.before === '30000.00' && c.after === null
    )
  );
  await visit(decisionPath);
  await page.locator('button[aria-controls=decision-panel-history]').click();
  await capture('10-desktop-light-withdrawn-change');
  const withdrawn = decision;
  decision = await call(
    `/decisions/${decision.decision.id}/evidence/${paid.id}`,
    { baseRevision: decision.decision.currentRevision, state: 'active' },
    'PATCH'
  );
  assert.equal(decision.evaluation.external.recordScenarios[0].exposure, '30000.00');
  assert.ok(
    decision.changes.changes.some((c) => c.kind === 'calculation' && c.after === '30000.00')
  );
  result.checks.push({ name: 'withdraw-restored-record-calculation-and-change-set', pass: true });
  const restored = decision;
  await visit(decisionPath);
  await page.locator('button[aria-controls=decision-panel-history]').click();
  await capture('11-desktop-light-restored-change');
  const stale = await context.request.patch(base + `/api/decisions/${decision.decision.id}`, {
    headers,
    data: { baseRevision: 1, input: decisionInput },
  });
  assert.equal(stale.status(), 409);
  result.checks.push({ name: 'stale-revision-write-409', pass: true });
  const edited = await call(
    `/decisions/${decision.decision.id}`,
    {
      baseRevision: decision.decision.currentRevision,
      input: { ...decisionInput, external: { ...decisionInput.external, exposureLimit: null } },
    },
    'PATCH'
  );
  assert.equal(edited.evaluation.external.assumptionScenarios[0].exposure, '30000.00');
  assert.equal(edited.evaluation.external.assumptionScenarios[0].withinLimit, null);
  await visit(decisionPath);
  await page.locator('button[aria-controls=decision-panel-scenarios]').click();
  await capture('12-desktop-light-missing-user-limit');
  decision = await call(
    `/decisions/${decision.decision.id}`,
    { baseRevision: edited.decision.currentRevision, input: decisionInput },
    'PATCH'
  );
  const beforePromise = decision.evaluation.external.recordScenarios[0].exposure;
  decision = await call(`/decisions/${decision.decision.id}/evidence`, {
    baseRevision: decision.decision.currentRevision,
    evidence: {
      slot: 'refunded',
      kind: 'counterparty-statement',
      entity: company,
      asOf: '2026-10-03',
      values: { amount: '10000' },
      quote: '合成销售承诺：下周会退10000元，今天尚未到账。',
      sourceLabel: '合成退款承诺',
    },
  });
  assert.equal(decision.evaluation.external.recordScenarios[0].exposure, beforePromise);
  result.checks.push({ name: 'future-promise-does-not-reduce-actual-exposure', pass: true });
  const concurrent = await Promise.all(
    ['并发版本甲', '并发版本乙'].map((title) =>
      context.request.patch(base + `/api/decisions/${decision.decision.id}`, {
        headers,
        data: {
          baseRevision: decision.decision.currentRevision,
          input: { ...decisionInput, title },
        },
      })
    )
  );
  assert.deepEqual(concurrent.map((r) => r.status()).sort(), [200, 409]);
  decision = await get(`/decisions/${decision.decision.id}`);
  decision = await call(
    `/decisions/${decision.decision.id}`,
    { baseRevision: decision.decision.currentRevision, input: decisionInput },
    'PATCH'
  );
  result.checks.push({ name: 'serialized-concurrent-one200-one409', pass: true });
  await visit(decisionPath);
  const failurePattern = base + `/api/decisions/${decision.decision.id}`;
  await page.route(failurePattern, (r) =>
    r.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'AFTER_INJECTED_FAILURE', error: '合成隔离故障：读取暂不可用' }),
    })
  );
  await page.reload();
  await page.waitForLoadState('networkidle');
  await capture('13-desktop-light-read-failure');
  await page.unroute(failurePattern);
  await page.getByRole('button', { name: '重新读取', exact: true }).first().click();
  await page.waitForTimeout(500);
  await capture('14-desktop-light-read-recovered');
  result.checks.push({ name: '503-read-manual-retry-restores-current-version', pass: true });
  // Persisted conflict variant is isolated from the main demonstration item.
  const contraryText = `${company}截至2026-10-03，实际已付款15000元。`;
  const contraryInput = {
    ...JSON.parse(rowsBytes),
    title: '同范围反证（合成）',
    filename: 'contrary.json',
    excerpts: [{ page: 1, text: contraryText }],
  };
  const contraryMaterial = await upload(
    'contrary.json',
    Buffer.from(JSON.stringify(contraryInput, null, 2))
  );
  let conflict = await call('/decisions', {
    ...decisionInput,
    title: '合成冲突事项 · 不撤掉反证洗白',
  });
  for (const [amount, quote, materialId] of [
    ['10000', rows[0][2], privateMaterial.id],
    ['15000', contraryText, contraryMaterial.id],
  ])
    conflict = await call(`/decisions/${conflict.decision.id}/evidence`, {
      baseRevision: conflict.decision.currentRevision,
      evidence: {
        slot: 'paid',
        kind: 'source-record',
        entity: company,
        asOf: '2026-10-03',
        values: { amount },
        quote,
        sourceLabel: '同范围合成付款字段',
        materialId,
        page: 1,
      },
    });
  assert.ok(conflict.evaluation.knownConflicts.length > 0);
  const opposing = conflict.version.evidence.at(-1);
  conflict = await call(
    `/decisions/${conflict.decision.id}/evidence/${opposing.id}`,
    { baseRevision: conflict.decision.currentRevision, state: 'withdrawn' },
    'PATCH'
  );
  assert.ok(conflict.evaluation.knownConflicts.length > 0);
  assert.equal(conflict.evaluation.external.recordScenarios[0].exposure, null);
  await visit(`/decisions?id=${conflict.decision.id}`);
  await page.locator('button[aria-controls=decision-panel-conditions]').click();
  await capture('15-desktop-light-conflict-persists');
  result.checks.push({
    name: 'same-range-conflict-survives-counterevidence-withdrawal',
    pass: true,
  });
  // Actual HTML/JSON export URLs: no assertion that a browser saved files to disk.
  const html = await context.request.get(base + `/api/tasks/${task.id}/export?format=html`);
  assert.equal(html.status(), 200);
  assert.match(await html.text(), /100000/);
  await writeFile(out + '/export-report.html', await html.body());
  const reportJson = await context.request.get(base + `/api/tasks/${task.id}/export?format=json`);
  assert.equal(reportJson.status(), 200);
  await writeFile(out + '/export-report.json', await reportJson.body());
  result.checks.push({ name: 'actual-html-json-export', pass: true });
  // Actual decision preview and downloaded bytes are bound to the selected saved version.
  await visit(decisionPath);
  await page.getByRole('button', { name: '核查事项操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '预览并导出这个版本', exact: true }).click();
  const preview = page.locator('.export-preview-dialog');
  await preview.locator('iframe').waitFor();
  assert.equal(await preview.locator('iframe').getAttribute('sandbox'), '');
  const saved = page.waitForEvent('download');
  await preview.getByRole('button', { name: '保存文件', exact: true }).click();
  await (await saved).saveAs(out + '/export-decision.html');
  assert.match(await readFile(out + '/export-decision.html', 'utf8'), /Content-Security-Policy/);
  await capture('15a-desktop-light-saved-version-export-preview');
  await preview.getByRole('button', { name: /关闭/ }).click();
  // A separate saved synthetic input attempts HTML and external-resource injection.
  const payload =
    '<script>globalThis.__prispectInjected=1</script><img src="https://fixture.invalid/beacon" onerror="globalThis.__prispectInjected=2">';
  const injection = await call('/decisions', {
    ...decisionInput,
    title: '合成 HTML 注入边界',
    promise: payload,
    claims: [{ id: 'fixture-escaped-claim', text: payload, target: 'terms' }],
  });
  const exportModule = await import(root + '/shared/decision-export.ts');
  const attackHtml = exportModule.renderDecisionExport(injection, 'zh-Hans');
  assert.ok(attackHtml.includes('&lt;script&gt;') && !attackHtml.includes('<script>'));
  await writeFile(out + '/export-injection-fixture.html', attackHtml);
  const offlineContext = await browser.newContext();
  const offlinePage = await offlineContext.newPage();
  const externalAttempts = [];
  offlinePage.on('request', (req) => {
    if (/^https?:/.test(req.url())) externalAttempts.push(req.url());
  });
  await offlineContext.setOffline(true);
  await offlinePage.goto('file://' + out + '/export-injection-fixture.html');
  assert.equal(await offlinePage.evaluate(() => globalThis.__prispectInjected), undefined);
  assert.equal(externalAttempts.length, 0);
  assert.match(await offlinePage.locator('body').innerText(), /<script>/);
  await offlinePage.pdf({
    path: out + '/decision-offline-print.pdf',
    format: 'A4',
    printBackground: true,
  });
  await offlineContext.close();
  result.checks.push({
    name: 'saved-version-export-sandbox-CSP-escaped-injection-offline',
    pass: true,
  });
  // Printing the normal financial page must retain facts under initially closed details.
  await visit(`/tasks/${task.id}`);
  await page.evaluate(() =>
    document.querySelectorAll('details').forEach((el) => (el.open = false))
  );
  await page.emulateMedia({ media: 'print' });
  await context.setOffline(true);
  await page.pdf({ path: out + '/financial-print.pdf', format: 'A4', printBackground: true });
  execFileSync('pdftotext', [
    '-layout',
    out + '/financial-print.pdf',
    out + '/financial-print.txt',
  ]);
  const printed = await readFile(out + '/financial-print.txt', 'utf8');
  assert.match(printed, /合成演练供应商/);
  assert.match(printed, /100,000|100000/);
  assert.match(printed, /来源与输入快照|净利润|原件/);
  await context.setOffline(false);
  await page.emulateMedia({ media: 'screen' });
  result.checks.push({ name: 'financial-print-closed-details-offline-retains-basis', pass: true });

  await page.emulateMedia({ colorScheme: 'dark' });
  await visit(decisionPath);
  await capture('16-desktop-dark-overview');
  await page.locator('button[aria-controls=decision-panel-scenarios]').click();
  await capture('17-desktop-dark-payment-boundary');
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(decisionPath);
  await capture('18-narrow-dark-overview');
  await page.locator('button[aria-controls=decision-panel-history]').click();
  await capture('19-narrow-dark-change-history');
  await visit(`/tasks/${task.id}`);
  await capture('20-narrow-dark-report');
  await page.emulateMedia({ colorScheme: 'light' });
  await visit(decisionPath);
  await capture('21-narrow-light-overview');
  await page.locator('button[aria-controls=decision-panel-scenarios]').click();
  await capture('22-narrow-light-payment-boundary');
  await page.setViewportSize({ width: 320, height: 740 });
  await capture('23-small-light-payment-boundary');
  await page.locator('button[aria-controls=decision-panel-history]').click();
  await capture('24-small-light-change-history');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await visit(decisionPath);
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(250);
  await capture('25-keyboard-command-search');
  await page.keyboard.press('Escape');
  other = await request.newContext({ baseURL: base });
  const previousOther = reuse
    ? JSON.parse(
        await readFile('/workspace/research-envs/prispect-after-other-account.json', 'utf8')
      )
    : null;
  const otherEmail = previousOther?.email || `after-other-${Date.now()}@example.test`;
  const otherPassword = previousOther?.password || 'Other!26Paper$Delta';
  const registered = await other.post(reuse ? '/api/auth/login' : '/api/auth/register', {
    data: reuse
      ? { email: otherEmail, password: otherPassword }
      : { email: otherEmail, name: '隔离第二账号', password: otherPassword },
  });
  assert.equal(registered.status(), reuse ? 200 : 201);
  const otherSession = await registered.json();
  await writeFile(
    '/workspace/research-envs/prispect-after-other-account.json',
    JSON.stringify(
      { email: otherEmail, password: otherPassword, userId: otherSession.user.id },
      null,
      2
    ),
    { mode: 0o600 }
  );
  const anonymous = await request.newContext({ baseURL: base });
  for (const path of [
    `/api/tasks/${task.id}`,
    `/api/decisions/${decision.decision.id}`,
    `/api/materials/${material.id}/file`,
    `/api/tasks/${task.id}/export?format=json`,
  ]) {
    assert.equal((await other.get(path)).status(), 404);
    assert.equal((await anonymous.get(path)).status(), 401);
  }
  await anonymous.dispose();
  result.checks.push({ name: 'other-owner404-and-anonymous401-on-known-private-ids', pass: true });
  const foreign = await context.request.patch(base + `/api/decisions/${decision.decision.id}`, {
    headers: { ...headers, Origin: 'https://foreign.example.test' },
    data: { baseRevision: decision.decision.currentRevision, input: decisionInput },
  });
  assert.equal(foreign.status(), 403);
  result.checks.push({ name: 'cross-origin403', pass: true });
  // Delay the owning account's known-detail response, then switch the actual UI owner.
  const oldData = decision;
  let releaseOld;
  const oldGate = new Promise((resolve) => {
    releaseOld = resolve;
  });
  let capturedOld;
  const oldCaptured = new Promise((resolve) => {
    capturedOld = resolve;
  });
  await page.route(failurePattern, async (route) => {
    capturedOld();
    await oldGate;
    await route
      .fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(oldData) })
      .catch(() => {});
  });
  await page.goto(base + decisionPath);
  await oldCaptured;
  await page.getByRole('button', { name: '账号菜单', exact: true }).first().click();
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click();
  await page.waitForTimeout(300);
  await page.goto(base + '/login?next=/decisions');
  await page.locator('input[name=email]').fill(otherEmail);
  await page.locator('input[name=password]').fill(otherPassword);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/decisions');
  releaseOld();
  await page.waitForTimeout(600);
  await page.unroute(failurePattern);
  assert.equal(await page.getByText(decisionInput.title, { exact: true }).count(), 0);
  assert.equal(await page.getByText(company, { exact: true }).count(), 0);
  await capture('26-late-response-owner-isolation');
  result.checks.push({ name: 'late-old-owner-response-does-not-enter-new-owner-view', pass: true });
  // Store credentials outside tracked evidence; restart uses the first isolated account.
  await writeFile(
    out + '/record-ids.json',
    JSON.stringify(
      {
        taskId: task.id,
        decisionId: decision.decision.id,
        materialId: material.id,
        privateMaterialId: privateMaterial.id,
        roleMaterialId: roleMaterial.id,
        conflictDecisionId: conflict.decision.id,
      },
      null,
      2
    )
  );
  await writeFile(out + '/synthetic-decision.json', JSON.stringify(decision, null, 2));
  await writeFile(
    out + '/withdrawal-results.json',
    JSON.stringify({ before: beforeWithdraw, withdrawn, restored, conflict }, null, 2)
  );
  assert.equal((await context.request.get(base + `/api/tasks/${task.id}`)).status(), 404);
  result.checks.push({ name: 'browser-session-really-switched-owner', pass: true });
} catch (e) {
  result.error = String(e);
  throw e;
} finally {
  result.finishedAt = new Date().toISOString();
  result.expectedNetworkErrors = result.consoleErrors.filter((e) => /503|404/.test(e));
  result.unexpectedConsoleErrors = result.consoleErrors.filter((e) => !/503|404/.test(e));
  await writeFile(out + '/browser-results.json', JSON.stringify(result, null, 2));
  await other?.dispose();
  await browser.close();
}
