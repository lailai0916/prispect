// This fixture verifies public UI mechanics, not real-time issuer retrieval.
import { chromium } from '/workspace/prispect-improve/node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { deriveSourceTrust } from '/workspace/prispect-improve/shared/source-trust.ts';
const base = 'http://127.0.0.1:4321';
const out = '/workspace/prispect-improve/docs/competitive-research/evidence/prispect-after';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  colorScheme: 'light',
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const result = {
  startedAt: new Date().toISOString(),
  kind: 'synthetic-provider-engineering-fixture',
  base,
  browser: browser.version(),
  checks: [],
  images: [],
  errors: [],
  requests: [],
};
page.on('pageerror', (e) => result.errors.push(String(e)));
page.on('request', (req) => result.requests.push({ method: req.method(), url: req.url() }));
let headers;
const get = async (path) => {
  const r = await context.request.get(base + '/api' + path);
  assert.ok(r.ok(), path + ' ' + r.status());
  return r.json();
};
const post = async (path, data) => {
  const r = await context.request.post(base + '/api' + path, { headers, data });
  const body = await r.json();
  assert.ok(r.ok(), path + ' ' + r.status() + ' ' + JSON.stringify(body));
  return body;
};
const visit = async (path) => {
  await page.goto(base + path);
  await page.waitForLoadState('networkidle');
};
const shot = async (name) => {
  await page.screenshot({ path: out + '/' + name + '.png', fullPage: true });
  const dim = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(dim.document <= dim.viewport, name + ' overflow');
  result.images.push(name);
  result.checks.push({ name, url: page.url(), dim });
};
try {
  const reuse = process.env.PRISPECT_REUSE_ACCOUNT === '1';
  const existing = reuse
    ? JSON.parse(
        await readFile('/workspace/research-envs/prispect-public-fixture-account.json', 'utf8')
      )
    : null;
  const email = existing?.email || `public-fixture-${Date.now()}@example.test`,
    password = existing?.password || 'Public!26Paper$Fixture';
  await visit((reuse ? '/login' : '/register') + '?next=/query');
  if (!reuse) await page.locator('input[name=name]').fill('合成公开UI验收');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  if (!reuse) await page.locator('input[name=confirmation]').fill(password);
  await page.getByRole('button', { name: reuse ? '登录' : '创建账号', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/query');
  const session = await get('/auth/session');
  headers = { 'X-CSRF-Token': session.csrfToken, Origin: base };
  await writeFile(
    '/workspace/research-envs/prispect-public-fixture-account.json',
    JSON.stringify({ email, password, userId: session.user.id }, null, 2),
    { mode: 0o600 }
  );
  let run = await post('/company-runs', {
    securityCode: '601234',
    orgId: 'syntheticuiorg',
    year: 2025,
    purpose: 'external',
    useModel: true,
  });
  for (let i = 0; i < 50; i++) {
    run = await get('/company-runs/' + run.id);
    if (!['queued', 'running'].includes(run.status)) break;
    await page.waitForTimeout(100);
  }
  await post('/company-runs/' + run.id + '/context', { refresh: false });
  for (let i = 0; i < 50; i++) {
    run = await get('/company-runs/' + run.id);
    if (run.context && run.contextStatus !== 'loading') break;
    await page.waitForTimeout(100);
  }
  assert.equal(run.context.companyName, '合成研究样本（非真实企业）');
  await visit('/company?run=' + run.id);
  for (let i = 0; i < 50; i++) {
    run = await get('/company-runs/' + run.id);
    if (run.assessmentStatus === 'ready') break;
    await page.waitForTimeout(100);
  }
  assert.equal(run.assessmentStatus, 'ready');
  assert.equal(run.assessment.research.modelCalls, 0);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await shot('public-01-desktop-light-overview-fixture');
  const controls = page.locator('.report-evidence-controls');
  const controlRequests = [];
  const watchControl = (req) => {
    if (req.url().includes('/api/')) controlRequests.push(req.url());
  };
  page.on('request', watchControl);
  await controls.getByRole('button', { name: '展开核验区', exact: true }).focus();
  await page.keyboard.press('Enter');
  const expanded = await page.evaluate(() => {
    const root = document.querySelector('[data-report-evidence-scope]');
    const list = Array.from(
      root.querySelectorAll(
        'details.research-grade-limits, details#company-research-process, details#company-research-framework, #company-source-trust > details.source-trust-detail, details#company-review-requests'
      )
    );
    return {
      count: list.length,
      allOpen: list.every((el) => el.open),
      researchFormOpen: document.getElementById('company-research-goal')?.open || false,
      practiceOpen: !!document.querySelector('details.evidence-learning[open]'),
    };
  });
  assert.ok(
    expanded.count > 0 && expanded.allOpen && !expanded.researchFormOpen && !expanded.practiceOpen
  );
  await shot('public-01a-keyboard-expand-retained-review-fixture');
  await controls.getByRole('button', { name: '收起核验区', exact: true }).click();
  assert.match(await controls.innerText(), /核验区 0\//);
  await page.waitForTimeout(100);
  page.off('request', watchControl);
  assert.equal(controlRequests.length, 0);
  result.checks.push({
    name: 'scoped-disclosure-keyboard-expand-collapse-no-acquisition-practice-or-api',
    pass: true,
  });

  const plan = page.locator('details.research-plan');
  await plan.locator('summary').first().click();
  assert.match(await plan.innerText(), /条目数不是独立证据链数量/);
  assert.match(await plan.innerText(), /需要直接核对的区分材料/);
  await shot('public-02-desktop-light-review-framework-fixture');
  const downloadPromise = page.waitForEvent('download');
  await plan.getByRole('button', { name: '下载核查框架', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(out + '/public-framework-fixture.txt');
  assert.match(await readFile(out + '/public-framework-fixture.txt', 'utf8'), /合成研究样本/);
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw Error('synthetic denied clipboard');
    };
  });
  await plan.getByRole('button', { name: '复制核查框架', exact: true }).click();
  await page.getByRole('textbox', { name: '核查框架文本', exact: true }).waitFor();
  assert.match(
    await page.getByRole('textbox', { name: '核查框架文本', exact: true }).inputValue(),
    /合成研究样本/
  );
  await shot('public-03-copy-fallback-fixture');
  result.checks.push({ name: 'framework-download-and-clipboard-fallback', pass: true });
  const trust = page.locator('#company-source-trust');
  await trust.locator('summary').first().click();
  assert.match(await trust.innerText(), /来源独立性未知/);
  assert.match(await trust.innerText(), /已知关系组/);
  await shot('public-04-desktop-light-source-families-fixture');
  const view = deriveSourceTrust(run);
  const media = view.rows.find((row) => row.url?.includes('202610033001234567'));
  assert.ok(media && media.scope === 'media-excerpt');
  const repost = view.families.find((family) => family.memberIds.some((id) => id === media.id));
  assert.ok(
    repost && repost.memberIds.some((id) => id === 'news-2') && view.independence === 'unknown'
  );
  assert.equal(view.rejectedDiscussions, 0);
  await writeFile(out + '/public-source-view-fixture.json', JSON.stringify(view, null, 2));
  // Template selection fills only local goal input: no request and no report mutation.
  const goal = page.locator('#company-research-goal');
  await page.getByRole('button', { name: '进一步研究', exact: true }).click();
  const before = await get('/company-runs/' + run.id);
  let actionRequests = [];
  const watch = (req) => {
    if (req.url().includes('/api/')) actionRequests.push(req.url());
  };
  page.on('request', watch);
  await goal.getByRole('button', { name: '反方依据', exact: true }).click();
  await page.waitForTimeout(120);
  page.off('request', watch);
  assert.equal(actionRequests.length, 0);
  assert.match(await goal.locator('textarea').inputValue(), /最强的竞争解释/);
  const after = await get('/company-runs/' + run.id);
  assert.deepEqual(after.assessment, before.assessment);
  await shot('public-05-goal-template-local-fixture');
  result.checks.push({ name: 'goal-template-local-no-automatic-research', pass: true });
  // Close nested details deliberately: printed contents must not rely on prior expansion.
  await page.evaluate(() =>
    document.querySelectorAll('details').forEach((el) => (el.open = false))
  );
  await page.emulateMedia({ media: 'print' });
  await context.setOffline(true);
  const printRequests = [];
  const printWatch = (req) => printRequests.push(req.url());
  page.on('request', printWatch);
  await page.pdf({
    path: out + '/public-company-print-fixture.pdf',
    format: 'A4',
    printBackground: true,
  });
  page.off('request', printWatch);
  assert.equal(printRequests.length, 0);
  execFileSync('pdftotext', [
    '-layout',
    out + '/public-company-print-fixture.pdf',
    out + '/public-company-print-fixture.txt',
  ]);
  const pdfText = await readFile(out + '/public-company-print-fixture.txt', 'utf8');
  assert.match(pdfText, /合成研究样本/);
  assert.match(pdfText, /形成有依据判断的条件/);
  assert.match(pdfText, /合成报道：回款与备货变化需要核对/);
  assert.match(pdfText, /来源独立性未知/);
  result.checks.push({
    name: 'closed-details-print-full-framework-source-table-offline',
    pass: true,
  });
  await context.setOffline(false);
  await page.emulateMedia({ media: 'screen', colorScheme: 'dark' });
  await plan.locator('summary').first().click();
  await trust.locator('summary').first().click();
  await shot('public-06-desktop-dark-framework-sources-fixture');
  await page.setViewportSize({ width: 390, height: 844 });
  await shot('public-07-narrow-dark-framework-sources-fixture');
  await page.emulateMedia({ colorScheme: 'light' });
  await shot('public-08-narrow-light-framework-sources-fixture');
  await page.setViewportSize({ width: 320, height: 740 });
  await shot('public-09-small-light-framework-sources-fixture');
  await plan.screenshot({ path: out + '/public-framework-320-light-fixture.png' });
  await trust.screenshot({ path: out + '/public-source-trust-320-light-fixture.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot('public-10-small-dark-framework-sources-fixture');
  await writeFile(out + '/public-run-fixture.json', JSON.stringify(run, null, 2));
  await writeFile(
    out + '/public-record-ids-fixture.json',
    JSON.stringify({ runId: run.id }, null, 2)
  );
  assert.equal(result.requests.filter((req) => !req.url.startsWith(base)).length, 0);
  result.checks.push({
    name: 'no-external-browser-retrieval-all-public-data-synthetic',
    pass: true,
  });
} catch (e) {
  result.error = String(e);
  throw e;
} finally {
  result.finishedAt = new Date().toISOString();
  await writeFile(out + '/public-browser-results-fixture.json', JSON.stringify(result, null, 2));
  await browser.close();
}
