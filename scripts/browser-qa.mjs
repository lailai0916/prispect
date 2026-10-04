/** Complete-interface acceptance with isolated, explicitly synthetic financial records. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = process.cwd();
const output = path.join(root, 'output', 'browser-qa');
await mkdir(output, { recursive: true });
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'prispect-browser-qa-'));
const base = 'http://127.0.0.1:4338';
process.env.APP_ORIGIN = base;
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString('hex');
process.env.NODE_ENV = 'test';
process.env.LANGSMITH_TRACING = 'false';
process.env.LANGCHAIN_TRACING_V2 = 'false';
const nativeFetch = globalThis.fetch;
const receipt = {
  version: 11,
  commit: process.env.GITHUB_SHA || null,
  status: 'working',
  financialFixtures: true,
  checks: [],
  screenshots: [],
  pageErrors: [],
  blockedServerRequests: [],
  blockedBrowserRequests: [],
  syntheticCompanyRecords: [],
  modelCalls: 0,
  contextCalls: 0,
  industryCalls: 0,
  limits: [
    'Fresh temporary account storage and synthetic company snapshots only; no production data or real external financial/model calls.',
    'A saved pure-rule assessment is a synthetic GET overlay to exercise report rendering, not an AI generation.',
    'Analytics receives empty JavaScript locally; production release and provider acceptance remain separate.',
  ],
};
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    receipt.blockedServerRequests.push({ origin: url.origin, pathname: url.pathname });
    throw new Error('Browser QA prohibits outgoing source/model requests');
  }
  return nativeFetch(input, init);
};
let browser, server, application, currentPage;
const check = (name) => receipt.checks.push(name);
async function capture(page, name) {
  const destination = path.join(output, `${name}.png`);
  await page.screenshot({ path: destination, animations: 'disabled' });
  receipt.screenshots.push(destination);
}
async function layout(page, name) {
  const measured = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(
    measured.document <= measured.viewport + 2,
    `${name}: overflow ${JSON.stringify(measured)}`
  );
  for (const control of await page.locator('.site-header a, .site-header button').all()) {
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    assert.ok(
      box && box.x >= -2 && box.x + box.width <= measured.viewport + 2,
      `${name}: clipped header control`
    );
  }
  assert.equal(await page.locator('.experience-switch').count(), 0);
  assert.equal(await page.locator('.site-header .theme-button:visible').count(), 1);
  check(`${name}: complete controls, no version switch and no horizontal overflow`);
}
async function openContext({ locale = 'zh-Hans', width = 1440, colorScheme = 'light' } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 960 },
    colorScheme,
    reducedMotion: 'reduce',
  });
  await context.addInitScript(
    (language) => localStorage.setItem('cashlens-locale', language),
    locale
  );
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.href === 'https://analytics.lailai.one/script.js')
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    else if (['http:', 'https:'].includes(url.protocol) && url.origin !== base) {
      receipt.blockedBrowserRequests.push({ origin: url.origin, pathname: url.pathname });
      await route.abort('blockedbyclient');
    } else await route.continue();
  });
  const page = await context.newPage();
  currentPage = page;
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => receipt.pageErrors.push(error.message));
  return { page, context };
}
async function sharedAssistant(page, name, { dock = false } = {}) {
  const trigger = page.locator('.company-assistant-trigger');
  await trigger.waitFor();
  assert.equal(await trigger.count(), 1, `${name}: duplicate assistant launcher`);
  assert.equal(await trigger.locator('.assistant-character').count(), 1);
  await trigger
    .locator('img')
    .evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  if (dock) {
    const measured = await trigger.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const color = getComputedStyle(element).backgroundColor;
      const alpha = color.match(/[\d.]+/g)?.map(Number)[3] ?? 1;
      return {
        x: bounds.x,
        right: bounds.right,
        y: bounds.y,
        bottom: bounds.bottom,
        height: bounds.height,
        viewport: document.body.getBoundingClientRect().right,
        innerWidth,
        rootWidth: document.documentElement.clientWidth,
        viewportHeight: innerHeight,
        alpha,
        paddingBottom: Number.parseFloat(getComputedStyle(document.body).paddingBottom),
      };
    });
    assert.ok(
      measured.x >= -1 && measured.right >= measured.viewport - 1,
      JSON.stringify(measured)
    );
    assert.ok(Math.abs(measured.bottom - measured.viewportHeight) <= 1);
    assert.ok(measured.height >= 64 && measured.height <= 80);
    assert.equal(
      measured.alpha,
      1,
      `${name}: translucent dock permits visible touch targets underneath`
    );
    assert.ok(measured.paddingBottom >= measured.height - 1, `${name}: no reserved footer space`);
    await trigger.focus();
    await page.keyboard.press('Enter');
    const panel = page.locator('.company-assistant-panel:not([hidden])');
    await panel.waitFor();
    await panel.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {})))
    );
    const panelBounds = await panel.boundingBox();
    assert.ok(
      panelBounds && panelBounds.y >= 0 && panelBounds.y + panelBounds.height <= measured.y - 7,
      JSON.stringify({ panelBounds, dock: measured })
    );
    await capture(page, `${name}-assistant-dock-panel`);
    await panel.locator('textarea').focus();
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden' });
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  }
  check(
    `${name}: one shared assistant character${dock ? ', opaque fixed dock, reserved space and keyboard-closeable panel' : ''}`
  );
}
const identities = [
  {
    securityCode: '601234',
    orgId: 'syntheticuiorg',
    shortName: '合成甲企业（非真实企业）',
    companyName: '合成甲企业（非真实企业）',
    exchange: 'sse',
    sourceUrl: 'https://www.cninfo.com.cn/new/snapshot/companyDetailCn?code=601234',
  },
  {
    securityCode: '601235',
    orgId: 'syntheticsecondorg',
    shortName: '合成乙企业（非真实企业）',
    companyName: '合成乙企业（非真实企业）',
    exchange: 'sse',
    sourceUrl: 'https://www.cninfo.com.cn/new/snapshot/companyDetailCn?code=601235',
  },
];
let demoSnapshot;
let deriveAssessment;
function snapshotFor(identity) {
  const snapshot = demoSnapshot();
  const second = identity.securityCode === '601235';
  Object.assign(snapshot, {
    securityCode: identity.securityCode,
    orgId: identity.orgId,
    companyName: identity.companyName,
  });
  const tables = {
    income: 'RPT_F10_FINANCE_GINCOME',
    cashflow: 'RPT_F10_FINANCE_GCASHFLOW',
    balance: 'RPT_F10_FINANCE_GBALANCE',
  };
  // These saved synthetic URLs exercise the source-binding protocol only;
  // the network guard prevents them from being queried as production evidence.
  const urls = Object.fromEntries(
    Object.entries(tables).map(([table, reportName]) => [
      table,
      `https://datacenter.eastmoney.com/api/data/v1/get?${new URLSearchParams({
        reportName,
        syntheticCode: identity.securityCode,
        filter: `(SECURITY_CODE="${identity.securityCode}")`,
      })}`,
    ])
  );
  snapshot.sources = Object.entries(urls).map(([table, url]) => ({
    id: `em-${table}`,
    provider: 'Synthetic offline annual fields',
    dimension: 'financial',
    url,
    status: 'available',
    fetchedAt: snapshot.fetchedAt,
    latestDate: '2025-12-31',
    count: 2,
    note: 'Synthetic UI test data; no public response was downloaded.',
    responseHashes: [],
  }));
  for (const row of snapshot.financials) {
    row.sourceUrls = Object.values(urls);
    row.fieldSources = Object.fromEntries(
      Object.keys(row.amounts)
        .filter((field) => row.amounts[field] !== null)
        .map((field) => [field, '东方财富'])
    );
    row.amounts.parentProfit =
      row.period === '2025-12-31' ? (second ? '1500000' : '70000') : '50000';
    row.fieldSources.parentProfit = '东方财富';
    row.originalUrl = second
      ? `https://example.invalid/${identity.securityCode}/${row.period.slice(0, 4)}-synthetic-annual.pdf`
      : null;
    if (second && row.period === '2025-12-31')
      Object.assign(row.amounts, { netProfit: '2000000', ocf: '3000000' });
  }
  snapshot.announcements = [
    {
      id: `synthetic-public-${identity.securityCode}`,
      title: `Synthetic ${identity.securityCode} public disclosure`,
      date: '2026-09-30',
      url: `https://example.invalid/${identity.securityCode}/public`,
      sources: [
        {
          provider: 'Synthetic offline disclosure',
          url: `https://example.invalid/${identity.securityCode}/public`,
        },
      ],
      category: 'Synthetic public record',
      attention: 'routine',
      matched: '',
      meaning: `Stored disclosure prompt for ${identity.securityCode}`,
      nextQuestion: 'Verify the original before attributing a cause.',
      excerpt: {
        quote: `Literal synthetic ${identity.securityCode} disclosure excerpt; not a real issuer statement.`,
        page: 7,
        url: `https://example.invalid/${identity.securityCode}/public`,
        sha256: 'synthetic-input-only',
        pagesRead: 1,
      },
    },
  ];
  snapshot.news = [
    {
      title: `Synthetic ${identity.securityCode} media headline`,
      date: '2026-10-01',
      media: 'Synthetic offline media',
      provider: 'Synthetic provider',
      url: `https://example.invalid/${identity.securityCode}/news`,
      digest: `Saved synthetic ${identity.securityCode} media digest; article body not acquired.`,
      contentScope: 'digest',
    },
  ];
  snapshot.discussions = [
    {
      id: `synthetic-post-${identity.securityCode}`,
      securityCode: identity.securityCode,
      title: `Synthetic ${identity.securityCode} public opinion`,
      date: '2026-10-02',
      url: `https://example.invalid/${identity.securityCode}/discussion`,
      provider: 'Synthetic public platform',
      textScope: 'post-excerpt',
      excerpt: {
        text: `Literal synthetic ${identity.securityCode} public opinion; unverified.`,
        url: `https://example.invalid/${identity.securityCode}/discussion`,
        sha256: 'synthetic-input-only',
        readAt: snapshot.fetchedAt,
      },
    },
    {
      id: 'foreign-issuer-post',
      securityCode: second ? '601234' : '601235',
      title: 'FOREIGN_ISSUER_DISCUSSION_MUST_STAY_ABSENT',
      date: '2026-10-02',
      url: 'https://example.invalid/foreign/discussion',
      provider: 'Synthetic other issuer',
      textScope: 'title',
    },
  ];
  snapshot.warnings = [
    'All data is synthetic offline UI acceptance input. No financial source, PDF or model was contacted.',
  ];
  return snapshot;
}
function searchCompanies(query) {
  return Promise.resolve({
    query,
    candidates: identities
      .filter((identity) => identity.securityCode === query.trim())
      .map((identity) => structuredClone(identity)),
    limitedToListed: true,
    source: 'cninfo',
    truncated: false,
  });
}

function savedIndustry(identity, options) {
  receipt.industryCalls++;
  const keys = [
    'grossMargin',
    'roe',
    'ocfToRevenue',
    'assetLiabilityRatio',
    'receivableToRevenue',
    'revenueGrowth',
  ];
  return {
    version: 1,
    securityCode: identity.securityCode,
    period: options.period,
    industry: '合成同行（非真实资料）',
    industryCode: 'SYNTHETIC',
    fetchedAt: new Date().toISOString(),
    status: 'partial',
    peerCount: 0,
    minimumSamples: 5,
    metrics: Object.fromEntries(
      keys.map((key) => [
        key,
        { company: null, mean: null, median: null, count: 0, missing: 0, difference: null },
      ])
    ),
    samples: [],
    sources: [],
    warnings: ['Synthetic unavailable peer cohort; no external retrieval.'],
  };
}
try {
  const { createApp } = await import(pathToFileURL(path.join(root, 'server/app.ts')).href);
  const { loadCompanyDirectory } = await import(
    pathToFileURL(path.join(root, 'server/company-search.ts')).href
  );
  ({ researchDemoSnapshot: demoSnapshot } = await import(
    pathToFileURL(path.join(root, 'scripts/serve-research-demo.ts')).href
  ));
  ({ deriveCompanyAssessment: deriveAssessment } = await import(
    pathToFileURL(path.join(root, 'shared/company-assessment.ts')).href
  ));
  application = await createApp({
    root,
    dataDir,
    model: {},
    registrationEnabled: true,
    companyDirectory: await loadCompanyDirectory(root),
    companyService: {
      searchCompanies,
      runCompanyResearch: async () => {
        throw new Error('QA prohibits original/model research');
      },
    },
    companyContextService: {
      searchCompanies,
      context: async (identity, options) => {
        receipt.contextCalls++;
        const snapshot = snapshotFor(identity);
        await options?.onSnapshot?.(structuredClone(snapshot));
        return snapshot;
      },
      industry: async (identity, options) => savedIndustry(identity, options),
      question: async () => {
        throw new Error('QA prohibits model questions');
      },
      research: async () => {
        throw new Error('QA prohibits model research');
      },
      assessment: async (run) => deriveAssessment(run),
    },
  });
  server = await new Promise((resolve, reject) => {
    const instance = application.app.listen(4338, '127.0.0.1', () => resolve(instance));
    instance.once('error', reject);
  });
  browser = await chromium.launch({ headless: true });
  const { page, context } = await openContext();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('.cinematic-home').waitFor();
  assert.equal(await page.locator('.company-assistant-trigger').count(), 0);
  assert.equal(await page.locator('.showcase-home, .lite-research').count(), 0);
  await layout(page, 'public home');
  await capture(page, 'home-light-1440');
  await page.locator('.landing-primary:visible').first().click();
  await page.waitForURL((url) => url.pathname === '/login');
  assert.equal(new URL(page.url()).searchParams.get('next'), '/query');
  await page.locator('.account-auth-card').waitFor();
  assert.equal(await page.getByRole('link', { name: '先试用', exact: true }).count(), 0);
  for (const destination of [
    '/company?run=retained&section=trends',
    '/query',
    '/materials',
    '/account',
  ]) {
    await page.goto(base + destination, { waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).pathname, '/login');
    assert.equal(new URL(page.url()).searchParams.get('next'), destination);
    assert.equal(
      await page
        .locator('.company-workspace, .company-query-page, .company-assistant-trigger')
        .count(),
      0
    );
  }
  for (const destination of ['/docs', '/docs/privacy', '/docs/guide']) {
    await page.goto(base + destination, { waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).pathname, destination);
    assert.equal(await page.locator('.company-assistant-trigger').count(), 0);
  }
  assert.equal((await context.request.get(`${base}/api/company-records`)).status(), 401);
  assert.equal(
    (
      await context.request.post(`${base}/api/assistant/messages`, {
        headers: { Origin: base },
        data: { question: '隐私政策是什么？', locale: 'zh' },
      })
    ).status(),
    401
  );
  check(
    'Signed-out research deep links preserve the login return URL, docs remain public, and research/assistant APIs require sign-in'
  );
  await page.goto(`${base}/login?next=%2Fquery`, { waitUntil: 'networkidle' });
  await page.locator('.account-auth-switch a[href^="/register"]').click();
  await page.locator('input[name="name"]').fill('隔离浏览器验收');
  await page.locator('input[name="email"]').fill('browser-qa-owner@example.test');
  await page.locator('input[name="password"]').fill('Copper!fjord7-Unusual-velvet');
  await page.locator('input[name="confirmation"]').fill('Copper!fjord7-Unusual-velvet');
  await page.locator('form .account-action[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === '/query');
  check('Registration returns to the requested company-search entry with a real account');
  const input = page.locator('.company-query-page textarea');
  await input.waitFor();
  assert.equal(
    await page.locator('.workspace-sidebar .company-sidebar-navigation button:disabled').count(),
    7
  );
  await input.dispatchEvent('compositionstart');
  await input.fill('hecheng');
  assert.equal(await page.locator('.company-query-page .company-completions').count(), 0);
  await input.dispatchEvent('compositionend');
  await input.fill('601234');
  await page.locator('.company-query-page .company-completions button').first().waitFor();
  assert.match(
    await page.locator('.company-query-page .company-completions').innerText(),
    /601234/
  );
  check(
    'Original home leads to New research; IME composition and matching remain usable, with seven disabled destinations before research'
  );
  await input.fill('');
  const session = await (await context.request.get(`${base}/api/auth/session`)).json();
  assert.ok(session.user && !session.user.isGuest);
  const post = await context.request.post(`${base}/api/company-runs`, {
    headers: {
      Origin: base,
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-Token': session.csrfToken,
    },
    data: {
      securityCode: identities[0].securityCode,
      orgId: identities[0].orgId,
      year: 2025,
      purpose: 'external',
      researchMode: 'financial',
    },
  });
  assert.equal(post.status(), 202, await post.text());
  const created = await post.json();
  await application.waitForIdle();
  const run = await (await context.request.get(`${base}/api/company-runs/${created.id}`)).json();
  run.assessment = deriveAssessment(run);
  run.assessmentStatus = 'ready';
  run.assessment.model = { status: 'not-configured' };
  receipt.syntheticCompanyRecords.push({
    runId: run.id,
    year: 2025,
    owner: session.user.id,
    generation: run.assessment.generatedAt,
  });
  await context.route(`**/api/company-runs/${run.id}`, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(run) })
      : route.fallback()
  );
  const company = `/company?run=${run.id}&cached=1`;
  await page.goto(base + company, { waitUntil: 'networkidle' });
  await page.locator('.company-workspace').waitFor();
  assert.equal(await page.locator('.workspace-sidebar .company-sidebar-navigation a').count(), 7);
  assert.match(await page.locator('.company-workspace').innerText(), /合成甲企业/);
  await layout(page, 'company report');
  await sharedAssistant(page, 'desktop');
  await capture(page, 'report-light-1440');
  assert.equal(await page.title(), `${'研究报告'} · ${identities[0].companyName} · 析光`);
  const assistantTrigger = page.locator('.company-assistant-trigger');
  await assistantTrigger.click();
  await page.waitForFunction(() =>
    document.activeElement?.matches('.company-assistant-panel textarea')
  );
  await page.keyboard.press('Tab');
  const newConversation = page.getByRole('button', { name: '新建对话', exact: true });
  await newConversation.focus();
  await page.getByRole('tooltip', { name: '新建对话', exact: true }).waitFor();
  await page.locator('.company-assistant-panel textarea').fill('尚未发送的走查草稿');
  await newConversation.click();
  assert.equal(await page.locator('.company-assistant-panel textarea').inputValue(), '');
  await page.keyboard.press('Escape');
  assert.equal(
    await assistantTrigger.evaluate((element) => element === document.activeElement),
    true
  );
  const deleteRecord = page.getByRole('button', { name: '删除研究记录', exact: true });
  await deleteRecord.focus();
  await page.getByRole('tooltip', { name: '删除研究记录', exact: true }).waitFor();
  await deleteRecord.click();
  const confirmation = page.getByRole('dialog');
  await confirmation.waitFor();
  await confirmation.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {})))
  );
  await confirmation.getByRole('button', { name: '关闭对话框', exact: true }).focus();
  await page.getByRole('tooltip', { name: '关闭对话框', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await confirmation.waitFor({ state: 'hidden' });
  assert.equal(await deleteRecord.evaluate((element) => element === document.activeElement), true);
  check(
    'Shared icon hints work with keyboard focus; new conversation clears its draft and closed dialogs restore the trigger'
  );
  await page.goto(`${base}/materials`, { waitUntil: 'networkidle' });
  assert.equal(await page.getByRole('heading', { name: '暂无材料', exact: true }).count(), 1);
  const materialSearch = page.getByRole('searchbox', { name: '搜索材料', exact: true });
  await materialSearch.fill('  没有这份材料  ');
  assert.equal(await page.getByRole('heading', { name: '没有匹配的材料', exact: true }).count(), 1);
  await page.getByRole('button', { name: '清除搜索', exact: true }).click();
  assert.equal(await materialSearch.inputValue(), '');
  assert.equal(
    await materialSearch.evaluate((element) => element === document.activeElement),
    true
  );
  await materialSearch.fill('   ');
  assert.equal(await page.getByRole('heading', { name: '暂无材料', exact: true }).count(), 1);
  await page.getByRole('button', { name: '用户导入', exact: false }).click();
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  assert.equal(await materialSearch.inputValue(), '');
  assert.equal(await page.getByRole('heading', { name: '暂无材料', exact: true }).count(), 1);
  await capture(page, 'materials-empty-light-1440');
  check(
    'Material empty states distinguish an empty workspace from unmatched filters; clear-search restores input focus and whitespace is treated as an empty filter'
  );
  await page.goto(base + company, { waitUntil: 'networkidle' });
  // Exercise actual browser consumers of saved status; the job itself remains a synthetic
  // GET overlay, so these checks never launch a source or model retry.
  const statusReads = [];
  const researchWrites = [];
  const countResearchRequest = (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/company-records' || pathname === `/api/company-runs/${run.id}`) {
      if (request.method() === 'GET') statusReads.push(pathname);
      else researchWrites.push(pathname);
    } else if (pathname.startsWith(`/api/company-runs/${run.id}/`) && request.method() !== 'GET')
      researchWrites.push(pathname);
  };
  context.on('request', countResearchRequest);
  let releaseFirstRead;
  const firstRead = new Promise((resolve) => {
    releaseFirstRead = resolve;
  });
  let overlayReads = 0;
  let overlayActive = true;
  const transientStatus = async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    overlayReads++;
    if (overlayReads === 1) {
      await firstRead;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'QA_STATUS_UNAVAILABLE',
          error: '暂时无法读取研究状态',
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        overlayActive
          ? {
              ...run,
              assessmentStatus: 'loading',
              assessmentRevision: (run.assessmentRevision || 0) + 1,
            }
          : { ...run, assessmentRevision: (run.assessmentRevision || 0) + 1 }
      ),
    });
  };
  await context.route(`**/api/company-runs/${run.id}`, transientStatus);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.company-workspace').waitFor();
  assert.match(await page.locator('.company-workspace').innerText(), /合成甲企业/);
  assert.equal(overlayReads, 1);
  check('Cached company data renders before its pending server existence/status read');
  const reconnected = page.waitForResponse(
    (response) =>
      response.url() === `${base}/api/company-runs/${run.id}` && response.status() === 200
  );
  releaseFirstRead();
  const temporaryError = page.getByRole('alert').filter({ hasText: '暂时无法读取研究状态' });
  await temporaryError.waitFor();
  assert.match(await page.locator('.company-workspace').innerText(), /合成甲企业/);
  await reconnected;
  await temporaryError.waitFor({ state: 'hidden' });
  check('One temporary 503 keeps cached data readable, retries saved status and clears the error');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(150);
  const hiddenReads = statusReads.length;
  await page.waitForTimeout(2800);
  assert.equal(statusReads.length, hiddenReads);
  check('Simulated hidden-tab state pauses both workspace and shared sidebar status reads');
  const foreground = page.waitForResponse(
    (response) =>
      response.url() === `${base}/api/company-runs/${run.id}` && response.status() === 200
  );
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'visibilityState');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await foreground;
  await context.setOffline(true);
  await page.waitForFunction(() => navigator.onLine === false);
  await page.waitForTimeout(150);
  const offlineReads = statusReads.length;
  await page.waitForTimeout(2800);
  assert.equal(statusReads.length, offlineReads);
  assert.match(await page.locator('.company-workspace').innerText(), /合成甲企业/);
  check('Browser offline state pauses saved-status requests while keeping company data readable');
  overlayActive = false;
  const completed = page.waitForResponse(
    (response) =>
      response.url() === `${base}/api/company-runs/${run.id}` && response.status() === 200
  );
  await context.setOffline(false);
  await completed;
  await page.waitForTimeout(150);
  const completedReads = statusReads.length;
  await page.waitForTimeout(2800);
  assert.equal(statusReads.length, completedReads);
  assert.deepEqual(researchWrites, []);
  assert.equal(receipt.modelCalls, 0);
  check('Reconnect reads completion once, stops polling and makes no research or model writes');
  context.off('request', countResearchRequest);
  await context.unroute(`**/api/company-runs/${run.id}`, transientStatus);
  // A delayed refresh acknowledgement must not roll a newer completed GET back to
  // its loading state or its retained old amounts (all responses remain synthetic).
  let showFreshSnapshot = false;
  let releaseRefresh;
  const heldRefresh = new Promise((resolve) => {
    releaseRefresh = resolve;
  });
  const freshRun = structuredClone(run);
  freshRun.contextRevision = (run.contextRevision || 0) + 1;
  freshRun.context.fetchedAt = new Date(Date.parse(run.context.fetchedAt) + 60_000).toISOString();
  freshRun.context.financials.find((row) => row.period === '2025-12-31').amounts.parentProfit =
    '140000';
  const staleAcknowledgement = {
    ...run,
    contextRevision: freshRun.contextRevision,
    contextStatus: 'loading',
  };
  const refreshStatus = (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(showFreshSnapshot ? freshRun : run),
        })
      : route.fallback();
  const delayedRefresh = async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    showFreshSnapshot = true;
    await heldRefresh;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify(staleAcknowledgement),
    });
  };
  await context.route(`**/api/company-runs/${run.id}`, refreshStatus);
  await context.route(`**/api/company-runs/${run.id}/context`, delayedRefresh);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '更新', exact: true }).click();
  const updatingButton = page.getByRole('button', { name: '更新中…', exact: true });
  assert.equal(await updatingButton.isDisabled(), true);
  assert.equal(await updatingButton.getAttribute('aria-busy'), 'true');
  assert.equal(await updatingButton.locator('.spinner').count(), 1);
  check('Refreshing public data shows a disabled busy button and real loading indicator');
  const freshRead = page.waitForResponse(
    (response) =>
      response.url() === `${base}/api/company-runs/${run.id}` && response.status() === 200
  );
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await freshRead;
  const freshAmount = page
    .locator('.company-f-key-figures dd')
    .first()
    .filter({ hasText: '14.00' });
  await freshAmount.waitFor();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const refreshResponse = page.waitForResponse(
    (response) => response.url() === `${base}/api/company-runs/${run.id}/context`
  );
  releaseRefresh();
  await refreshResponse;
  await page.waitForTimeout(150);
  assert.equal(
    await freshAmount.count(),
    1,
    'Late loading acknowledgement replaced the completed snapshot'
  );
  check('Late refresh acknowledgement preserves newer completed amounts and source status');
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'visibilityState');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await context.unroute(`**/api/company-runs/${run.id}/context`, delayedRefresh);
  await page.getByRole('link', { name: '查看研究报告', exact: true }).click();
  const retainedReportDates = await page.locator('.report-document-dates').innerText();
  await page.locator('.company-report-breadcrumb').click();
  let failedRefreshes = 0;
  const unavailableRefresh = async (route) => {
    failedRefreshes++;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'QA_REFRESH_FAILURE', error: '合成更新失败，已有资料保留' }),
    });
  };
  await context.route(`**/api/company-runs/${run.id}/context`, unavailableRefresh);
  await page.getByRole('button', { name: '更新', exact: true }).evaluate((button) => {
    button.click();
    button.click();
  });
  await page.getByRole('alert').filter({ hasText: '合成更新失败，已有资料保留' }).waitFor();
  assert.equal(failedRefreshes, 1);
  assert.equal(await freshAmount.count(), 1);
  await page.getByRole('link', { name: '查看研究报告', exact: true }).click();
  assert.equal(await page.locator('.report-document-dates').innerText(), retainedReportDates);
  check(
    'Repeated refresh clicks start one write; failed refresh preserves amounts and the prior report’s original dates'
  );
  await page.locator('.company-report-breadcrumb').click();
  await context.unroute(`**/api/company-runs/${run.id}/context`, unavailableRefresh);
  const secondCreated = await context.request.post(`${base}/api/company-runs`, {
    headers: { Origin: base, 'X-CSRF-Token': session.csrfToken },
    data: {
      securityCode: identities[1].securityCode,
      orgId: identities[1].orgId,
      year: 2025,
      purpose: 'external',
      researchMode: 'financial',
    },
  });
  assert.equal(secondCreated.status(), 202, await secondCreated.text());
  const secondRunId = (await secondCreated.json()).id;
  await application.waitForIdle();
  await page.evaluate(() => window.dispatchEvent(new Event('prispect:company-records-changed')));
  let releaseOldCompany;
  let releaseNewCompany;
  const oldCompanyGate = new Promise((resolve) => {
    releaseOldCompany = resolve;
  });
  const newCompanyGate = new Promise((resolve) => {
    releaseNewCompany = resolve;
  });
  const oldCompanyRefresh = async (route) => {
    await oldCompanyGate;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'QA_OLD_REFRESH', error: '旧公司的合成错误' }),
    });
  };
  const newCompanyRefresh = async (route) => {
    await newCompanyGate;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'QA_NEW_REFRESH', error: '当前公司的合成更新失败' }),
    });
  };
  await context.route(`**/api/company-runs/${run.id}/context`, oldCompanyRefresh);
  await context.route(`**/api/company-runs/${secondRunId}/context`, newCompanyRefresh);
  await page.getByRole('button', { name: '更新', exact: true }).click();
  await page.locator(`.sidebar-company-row a[href*="${secondRunId}"]`).click();
  await page.waitForURL((url) => url.searchParams.get('run') === secondRunId);
  await page.locator('.company-workspace').filter({ hasText: '合成乙企业' }).waitFor();
  const newCompanyUpdate = page.locator('.context-page-actions button[aria-busy]');
  await newCompanyUpdate.click();
  releaseOldCompany();
  await page.waitForTimeout(150);
  assert.equal(await newCompanyUpdate.isDisabled(), true);
  assert.equal(await page.getByText('旧公司的合成错误').count(), 0);
  assert.match(await page.locator('.company-workspace').innerText(), /合成乙企业/);
  releaseNewCompany();
  await page.getByRole('alert').filter({ hasText: '当前公司的合成更新失败' }).waitFor();
  assert.equal(await newCompanyUpdate.isDisabled(), false);
  check(
    'Switching companies isolates refresh callbacks, current-company busy controls and failures'
  );
  await context.unroute(`**/api/company-runs/${run.id}/context`, oldCompanyRefresh);
  await context.unroute(`**/api/company-runs/${secondRunId}/context`, newCompanyRefresh);
  const removeSecond = await context.request.delete(`${base}/api/company-runs/${secondRunId}`, {
    headers: { Origin: base, 'X-CSRF-Token': session.csrfToken },
  });
  assert.equal(removeSecond.status(), 200, await removeSecond.text());
  await context.unroute(`**/api/company-runs/${run.id}`, refreshStatus);
  await page.goto(base + company, { waitUntil: 'networkidle' });
  const calls = receipt.contextCalls;
  await page.goto(`${base}/company?run=${run.id}&experience=lite&page=finance`, {
    waitUntil: 'networkidle',
  });
  assert.equal(new URL(page.url()).searchParams.has('experience'), false);
  await page.locator('.company-workspace').waitFor();
  await page.goto(`${base}/company?run=${run.id}&experience=lite&page=public`, {
    waitUntil: 'networkidle',
  });
  assert.equal(new URL(page.url()).searchParams.get('section'), 'disclosures');
  await page.locator('#company-disclosures').waitFor();
  await page.goto(`${base}/company?run=${run.id}&experience=lite&page=reputation`, {
    waitUntil: 'networkidle',
  });
  assert.equal(new URL(page.url()).searchParams.get('focus'), 'news');
  await page.locator('#company-public-signals').waitFor();
  await page.goto(`${base}/company?run=${run.id}&experience=lite&page=original`, {
    waitUntil: 'networkidle',
  });
  assert.equal(new URL(page.url()).searchParams.get('section'), 'sources');
  await page.locator('#company-source-comparison').waitFor();
  assert.equal(receipt.contextCalls, calls);
  check(
    'Retired company links retain the same saved research and reach report, disclosures, public leads and source comparison without reacquiring context'
  );
  await page.goto(`${base}/?view=search`, { waitUntil: 'networkidle' });
  assert.equal(new URL(page.url()).pathname, '/query');
  await input.fill('601234');
  await page.locator('.company-query-page .company-completions button').first().click();
  await page.waitForURL((url) => url.pathname === '/company');
  assert.equal(new URL(page.url()).searchParams.get('run'), run.id);
  assert.equal((await (await context.request.get(`${base}/api/company-records`)).json()).length, 1);
  assert.equal(receipt.contextCalls, calls);
  check('Repeated selection reuses the existing owning record and saved context');
  await page.goto(`${base}/companies/compare?a=${run.id}&basis=parent`, {
    waitUntil: 'networkidle',
  });
  assert.equal(new URL(page.url()).pathname, '/query');
  await page.goto(`${base}/?view=guide`, { waitUntil: 'networkidle' });
  assert.equal(new URL(page.url()).pathname, '/docs/guide');
  await page.locator('.document-page, .document-article, .document-layout').first().waitFor();
  assert.doesNotMatch(await page.locator('main').innerText(), /\bLite\b|\bPro\b/);
  check(
    'Retired home and comparison entries lead to research or canonical documentation, with no version-specific guide copy'
  );
  for (const [width, colorScheme, locale] of [
    [1440, 'light', 'zh-Hans'],
    [1440, 'dark', 'en'],
    [390, 'light', 'zh-Hans'],
    [375, 'dark', 'en'],
  ]) {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ colorScheme });
    await page.evaluate((language) => localStorage.setItem('cashlens-locale', language), locale);
    await page.goto(base + company + '&report=ai', { waitUntil: 'networkidle' });
    await page.locator('#company-report-document').waitFor();
    await layout(page, `AI report ${width} ${colorScheme}`);
    await sharedAssistant(page, `report-${width}-${colorScheme}`, { dock: width <= 440 });
    assert.equal(await page.locator('.company-ai-research-status').count(), 0);
    await capture(page, `report-${width}-${colorScheme}`);
    const originalTheme = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.locator('.site-header .theme-button').click();
    await page.waitForFunction(
      (previous) => document.documentElement.dataset.theme !== previous,
      originalTheme
    );
    check(`${width}px: restored theme toggle works on the retained report`);
    const menu = page.locator('.site-header .mobile-menu');
    if (await menu.isVisible()) {
      await menu.click();
      const panel = page
        .getByRole('dialog')
        .filter({ has: page.locator('.company-sidebar-navigation') });
      await panel.waitFor();
      assert.equal(await panel.locator('.company-sidebar-navigation a').count(), 7);
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'hidden' });
      check(`${width}px: retained sidebar opens and closes with Escape`);
    }
  }
  const logoutSession = await (await context.request.get(`${base}/api/auth/session`)).json();
  const logoutResponse = await context.request.post(`${base}/api/auth/logout`, {
    headers: { Origin: base, 'X-CSRF-Token': logoutSession.csrfToken },
    data: {},
  });
  assert.equal(logoutResponse.status(), 200);
  await context.unroute(`**/api/company-runs/${run.id}`);
  await page.goto(base + company, { waitUntil: 'networkidle' });
  await page.waitForURL((url) => url.pathname === '/login');
  assert.equal(new URL(page.url()).searchParams.get('next'), company);
  assert.equal(await page.locator('.company-workspace, .company-assistant-trigger').count(), 0);
  await page.locator('input[name="email"]').fill('browser-qa-owner@example.test');
  await page.locator('input[name="password"]').fill('Copper!fjord7-Unusual-velvet');
  await page.locator('form .account-action[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === '/company');
  assert.equal(new URL(page.url()).searchParams.get('run'), run.id);
  await page.locator('.company-workspace').waitFor();
  check(
    'Logout prevents saved research access; signing back in restores the same owning record and destination'
  );
  await context.close();
  const other = await openContext({ width: 375, colorScheme: 'dark' });
  await other.page.goto(`${base}/query`, { waitUntil: 'networkidle' });
  await other.page.waitForURL((url) => url.pathname === '/login');
  assert.equal(new URL(other.page.url()).searchParams.get('next'), '/query');
  const secondRegistration = await other.context.request.post(`${base}/api/auth/register`, {
    headers: { Origin: base },
    data: {
      name: '另一验收账号',
      email: 'browser-qa-other@example.test',
      password: 'Copper!fjord7-Unusual-velvet',
    },
  });
  assert.equal(secondRegistration.status(), 201, await secondRegistration.text());
  await other.page.goto(`${base}/query`, { waitUntil: 'networkidle' });
  await other.page.locator('.company-query-page textarea').waitFor();
  assert.equal(await other.page.locator('.sidebar-company-row').count(), 0);
  await other.page.locator('.mobile-menu').click();
  const emptyMenu = other.page
    .getByRole('dialog')
    .filter({ has: other.page.locator('.company-sidebar-navigation') });
  await emptyMenu.waitFor();
  assert.equal(await emptyMenu.locator('.company-sidebar-navigation button:disabled').count(), 7);
  await other.page.keyboard.press('Escape');
  check(
    'A different account retains its own empty workspace and cannot borrow the previous saved company'
  );
  await other.context.close();
  assert.equal(receipt.pageErrors.length, 0, JSON.stringify(receipt.pageErrors));
  assert.equal(
    receipt.blockedServerRequests.length,
    0,
    JSON.stringify(receipt.blockedServerRequests)
  );
  assert.equal(
    receipt.blockedBrowserRequests.length,
    0,
    JSON.stringify(receipt.blockedBrowserRequests)
  );
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = error.stack || String(error);
  if (currentPage && !currentPage.isClosed()) await capture(currentPage, 'failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
  await application?.waitForIdle().catch(() => {});
  application?.auth.close();
  globalThis.fetch = nativeFetch;
  await rm(dataDir, { recursive: true, force: true });
  await writeFile(path.join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(
    JSON.stringify({
      status: receipt.status,
      checks: receipt.checks.length,
      screenshots: receipt.screenshots.length,
      failure: receipt.failure || null,
    })
  );
}
