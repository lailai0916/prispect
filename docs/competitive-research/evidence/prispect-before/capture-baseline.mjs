import { chromium } from '/workspace/prispect/node_modules/playwright/index.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const base = process.env.PRISPECT_BASELINE_URL || 'http://127.0.0.1:4319';
const out = '/workspace/prispect-improve/docs/competitive-research/evidence/prispect-before';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  colorScheme: 'light',
});
const page = await context.newPage();
const failures = [];
const checks = [];
const images = [];
page.on('pageerror', (e) => failures.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') failures.push(m.text());
});
const capture = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const overflow = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  checks.push({ name, overflow, url: page.url() });
  images.push(name);
};
const visit = async (path) => {
  await page.goto(base + path);
  await page.waitForLoadState('networkidle');
};
try {
  await visit('/');
  await capture('desktop-light-home');
  await visit('/register?next=/query');
  const email = `baseline-${Date.now()}@example.test`;
  const password = 'Baseline!7River$Paper2026';
  await page.locator('input[name=name]').fill('隔离基线验收');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.locator('input[name=confirmation]').fill(password);
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/query');
  await page.waitForLoadState('networkidle');
  await capture('desktop-light-query-empty');
  const session = await (await context.request.get(base + '/api/auth/session')).json();
  assert.ok(session.user && session.csrfToken);
  await writeFile(
    '/workspace/research-envs/prispect-before-account.json',
    JSON.stringify({ email, password, userId: session.user.id }, null, 2),
    { mode: 0o600 }
  );
  checks.push({ name: 'real-register', pass: true });
  const headers = { 'X-CSRF-Token': session.csrfToken, Origin: base };
  const call = async (path, data, method = 'POST') => {
    const response = await context.request.fetch(base + '/api' + path, { method, headers, data });
    const body = await response.json();
    if (!response.ok())
      throw Error(`${method} ${path}: ${response.status()} ${JSON.stringify(body)}`);
    return body;
  };
  const company = '合成演练供应商（非真实企业）';
  const rows = [];
  const values = {
    2024: ['80000', '70000', '-5000', '-10000', '7000', '-2000'],
    2025: ['100000', '60000', '-10000', '-30000', '5000', '-5000'],
  };
  const keys = [
    'netProfit',
    'operatingCashFlow',
    'inventoryAdjustment',
    'receivablesAdjustment',
    'payablesAdjustment',
    'otherAdjustments',
  ];
  for (const year of [2024, 2025])
    keys.forEach((key, index) =>
      rows.push({
        id: `synthetic-${year}-${key}`,
        key,
        year,
        value: values[year][index],
        unit: 'yuan',
        currency: 'CNY',
        scope: 'consolidated',
        period: 'annual',
        page: 1,
        quote: `合成测试数据 ${year} ${key} ${values[year][index]} 元`,
        kind: key === 'otherAdjustments' ? 'derived' : 'reported',
        ...(key === 'otherAdjustments'
          ? {
              components: [
                {
                  label: '合成其余调整',
                  value: values[year][index],
                  page: 1,
                  quote: '仅用于规则验收，不是真实企业披露',
                },
              ],
            }
          : {}),
      })
    );
  const privateText = `${company}截至2026-10-03，实际已付款10000元，已交付对应金额0元，实际已收到退款0元。合成材料，未经鉴真。`;
  const input = {
    company,
    shortName: '合成演练供应商',
    title: '合成年度与付款输入（非真实披露）',
    filename: 'synthetic-baseline.json',
    origin: 'user-upload',
    documentDate: '2026-10-03',
    sha256: 'a'.repeat(64),
    observations: rows,
    excerpts: [{ page: 1, text: privateText + '\n' + rows.map((r) => r.quote).join('\n') }],
    notes: ['合成输入；不代表任何真实企业，不是实时查询结果。'],
  };
  const bytes = Buffer.from(JSON.stringify(input, null, 2));
  await writeFile(out + '/synthetic-input.json', bytes);
  await writeFile(out + '/synthetic-original.json-upload', bytes);
  const previewResponse = await context.request.post(base + '/api/materials/preview', {
    headers,
    multipart: {
      file: { name: 'synthetic-baseline.json', mimeType: 'application/json', buffer: bytes },
    },
  });
  assert.equal(previewResponse.status(), 200);
  const preview = await previewResponse.json();
  const material = await call('/materials', preview.material);
  const retained = await context.request.get(base + `/api/materials/${material.id}/file`);
  assert.equal(retained.status(), 200);
  assert.equal(
    createHash('sha256')
      .update(await retained.body())
      .digest('hex'),
    createHash('sha256').update(bytes).digest('hex')
  );
  checks.push({ name: 'retained-synthetic-original-byte-match', pass: true });
  const task = await call('/tasks', {
    title: '合成基线 · 利润与经营现金',
    company,
    year: 2025,
    materialIds: [material.id],
    purpose: 'external',
  });
  let complete;
  for (let i = 0; i < 40; i++) {
    complete = await (await context.request.get(base + `/api/tasks/${task.id}`)).json();
    if (complete.status === 'completed') break;
    await page.waitForTimeout(200);
  }
  assert.equal(complete.status, 'completed');
  assert.equal(complete.report.model.status, 'not-configured');
  await writeFile(out + '/synthetic-report.json', JSON.stringify(complete, null, 2));
  await visit('/materials');
  await capture('desktop-light-materials');
  await visit(`/tasks/${task.id}`);
  await capture('desktop-light-report');
  const sourceButton = page.getByRole('button', { name: '查看指标来源', exact: true }).first();
  await sourceButton.click();
  await capture('desktop-light-source-drawer');
  const close = page.getByRole('button', { name: /关闭/ }).last();
  if (await close.count()) await close.click();
  const detail = page
    .locator('details')
    .filter({ has: page.getByText('检验证据与解释', { exact: false }) });
  // Expand the report disclosure containing the lab through its actual summary.
  const summaries = await page.locator('summary').allTextContents();
  await writeFile(out + '/report-disclosures.json', JSON.stringify(summaries, null, 2));
  await page.getByText('分析依据与核查记录', { exact: true }).click();
  const labTab = page.getByRole('button', { name: '证据实验室', exact: true });
  if (await labTab.count()) await labTab.click();
  if (await page.locator('.evidence-lab').count()) await capture('desktop-light-evidence-lab');
  const decisionInput = {
    title: '合成付款核验 · 承诺与实际退款',
    transactionEntity: company,
    purpose: 'external',
    promise: '对方原话（合成）：集团上市，付款可退，先支付20000元即可锁定交付。',
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
  for (const [slot, amount, quote] of [
    ['paid', '10000', `${company}截至2026-10-03，实际已付款10000元`],
    ['delivered', '0', `${company}截至2026-10-03，已交付对应金额0元`],
    ['refunded', '0', `${company}截至2026-10-03，实际已收到退款0元`],
  ])
    decision = await call(`/decisions/${decision.decision.id}/evidence`, {
      baseRevision: decision.decision.currentRevision,
      evidence: {
        slot,
        kind: 'source-record',
        entity: company,
        asOf: '2026-10-03',
        values: { amount },
        quote,
        sourceLabel: '合成材料输入',
        materialId: material.id,
        page: 1,
      },
    });
  await writeFile(out + '/synthetic-decision.json', JSON.stringify(decision, null, 2));
  assert.equal(decision.evaluation.external.assumptionScenarios[0].exposure, '30000.00');
  assert.equal(decision.evaluation.external.assumptionScenarios[1].exposure, '15000.00');
  checks.push({ name: 'external-exposure-A30000-B15000', pass: true });
  const decisionPath = `/decisions?id=${decision.decision.id}`;
  await visit(decisionPath);
  await capture('desktop-light-decision-next');
  for (const [label, name] of [
    ['方案比较', 'decision-scenarios'],
    ['条件', 'decision-conditions'],
    ['材料', 'decision-evidence'],
    ['版本', 'decision-history'],
  ]) {
    await page
      .locator(
        `button[aria-controls=decision-panel-${{ 方案比较: 'scenarios', 条件: 'conditions', 材料: 'evidence', 版本: 'history' }[label]}]`
      )
      .click();
    await capture('desktop-light-' + name);
  }
  const evidence = decision.version.evidence.find((e) => e.slot === 'paid');
  const withdrawn = await call(
    `/decisions/${decision.decision.id}/evidence/${evidence.id}`,
    { baseRevision: decision.decision.currentRevision, state: 'withdrawn' },
    'PATCH'
  );
  checks.push({
    name: 'withdraw-paid-recorded-state',
    before: decision.evaluation.external,
    after: withdrawn.evaluation.external,
  });
  const restored = await call(
    `/decisions/${decision.decision.id}/evidence/${evidence.id}`,
    { baseRevision: withdrawn.decision.currentRevision, state: 'active' },
    'PATCH'
  );
  const stale = await context.request.patch(base + `/api/decisions/${decision.decision.id}`, {
    headers,
    data: { baseRevision: 1, input: decisionInput },
  });
  assert.equal(stale.status(), 409);
  checks.push({ name: 'stale-version-409', pass: true });
  await visit(decisionPath);
  const failPattern = base + '/api/decisions/' + decision.decision.id;
  await page.route(failPattern, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'BASELINE_INJECTED_FAILURE',
        message: '合成隔离故障：服务暂时不可用',
      }),
    })
  );
  await page.reload();
  await page.waitForLoadState('networkidle');
  await capture('desktop-light-decision-load-failure');
  await page.unroute(failPattern);
  await page.getByRole('button', { name: '重新读取', exact: true }).first().click();
  await page.waitForTimeout(500);
  await capture('desktop-light-decision-recovered');
  await page.emulateMedia({ colorScheme: 'dark' });
  await visit(`/tasks/${task.id}`);
  await capture('desktop-dark-report');
  await visit(decisionPath);
  await capture('desktop-dark-decision');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('narrow-dark-decision');
  await visit(`/tasks/${task.id}`);
  await capture('narrow-dark-report');
  await page.emulateMedia({ colorScheme: 'light' });
  await visit(decisionPath);
  await capture('narrow-light-decision');
  await visit('/query');
  await capture('narrow-light-query');
  await writeFile(
    out + '/record-ids.json',
    JSON.stringify(
      {
        taskId: task.id,
        decisionId: decision.decision.id,
        materialId: material.id,
        purpose: 'Local synthetic arithmetic and UI evidence; not live issuer evidence.',
      },
      null,
      2
    )
  );
  await writeFile(
    '/workspace/research-envs/prispect-before-account.json',
    JSON.stringify({ email, password, userId: session.user.id }, null, 2),
    { mode: 0o600 }
  );
} catch (e) {
  failures.push(String(e));
  throw e;
} finally {
  await writeFile(
    out + '/browser-results.json',
    JSON.stringify(
      {
        base,
        recordedAt: new Date().toISOString(),
        browser: browser.version(),
        sha: 'd748d1ac5c1a9c6fe702301c819980e1cce87312',
        checks,
        images,
        failures,
      },
      null,
      2
    )
  );
  await browser.close();
}
