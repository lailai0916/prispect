/** Browser acceptance of real entry flows; no financial/model requests or fixtures. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
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
  version: 3,
  commit: process.env.GITHUB_SHA || null,
  status: 'working',
  financialFixtures: false,
  checks: [],
  screenshots: [],
  pageErrors: [],
  consoleErrors: [],
  failedResponses: [],
  failedRequests: [],
  cancelledReadRequests: [],
  blockedServerRequests: [],
  blockedBrowserRequests: [],
  excludedTelemetryScripts: [],
  researchWrites: [],
  opticalInteraction: [],
  limits: [
    'No company research is submitted; live company-result, financial acquisition, same-run switching and model/assistant answers are outside this entry-flow check.',
    'Screenshots require a separate visual comparison with the selected source; successful assertions are not a fidelity verdict.',
    'Guest storage is fresh and temporary; no production records or synthetic financial responses are used.',
    'The existing analytics.lailai.one/script.js telemetry script receives empty JavaScript locally; analytics behavior is outside this check.',
  ],
};
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    receipt.blockedServerRequests.push({
      origin: url.origin,
      pathname: url.pathname,
    });
    throw new Error('Browser QA prohibits outgoing source/model requests');
  }
  return nativeFetch(input, init);
};
let browser;
let server;
let application;
let currentPage;
const check = (name) => receipt.checks.push(name);
async function noOverflow(page, name) {
  const measured = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(
    measured.document <= measured.viewport + 2,
    `${name} page overflow: ${JSON.stringify(measured)}`
  );
  check(`${name}: no horizontal page overflow`);
}
async function headerControlsFit(page, name) {
  const viewport = page.viewportSize().width;
  for (const control of await page.locator('.site-header a, .site-header button').all()) {
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    assert.ok(
      box && box.x >= -2 && box.x + box.width <= viewport + 2,
      `${name} hides a header control: ${await control.getAttribute('aria-label')}`
    );
  }
  check(`${name}: visible header controls remain inside the viewport`);
}
async function headlineFits(page, name) {
  const lines = await page.locator('.showcase-title-line').evaluateAll((elements) =>
    elements.map((element) => {
      const line = element.getBoundingClientRect();
      const mask = element.parentElement.getBoundingClientRect();
      return { text: element.textContent, lineWidth: line.width, maskWidth: mask.width };
    })
  );
  for (const line of lines)
    assert.ok(
      line.lineWidth <= line.maskWidth + 2,
      `${name} clips its headline: ${JSON.stringify(line)}`
    );
  check(`${name}: complete headline fits its animation masks`);
}
async function submitLabelFits(page, name) {
  const measured = await page.locator('.showcase-search .start-submit > span').evaluate((label) => {
    const range = document.createRange();
    range.selectNodeContents(label);
    return { text: label.textContent, lines: range.getClientRects().length };
  });
  assert.equal(measured.lines, 1, `${name} wraps its submit label: ${JSON.stringify(measured)}`);
  check(`${name}: company query submit label remains on one line`);
}
async function canvasStamp(page) {
  return page.locator('.hero-field-canvas').evaluate((canvas) => canvas.toDataURL());
}
async function staticOptics(page, name) {
  await page.locator('[data-hero-ready="true"]').waitFor();
  const before = await canvasStamp(page);
  await page.mouse.move(24, 200);
  await page.mouse.move(page.viewportSize().width - 24, 300);
  await page.waitForTimeout(180);
  assert.equal(await canvasStamp(page), before, `${name} optical canvas continues animating`);
  receipt.opticalInteraction.push({ name, canvasStatic: true });
  check(`${name}: loaded optical artwork remains static under reduced motion`);
}
async function pointerOptics(page) {
  const scene = page.locator('[data-hero-ready="true"]');
  assert.equal(await scene.getAttribute('data-hero-rendering'), 'canvas');
  await page.mouse.move(110, 290, { steps: 10 });
  await page.waitForFunction(
    () =>
      parseFloat(
        document.querySelector('.showcase-hero').style.getPropertyValue('--showcase-pointer-x')
      ) < 20
  );
  await page.waitForTimeout(950);
  const left = await canvasStamp(page);
  const leftTransform = await page
    .locator('.hero-field-prism')
    .evaluate((element) => getComputedStyle(element).transform);
  await capture(page, 'lite-hero-pointer-left');
  await page.mouse.move(page.viewportSize().width - 110, 380, { steps: 10 });
  await page.waitForFunction(
    () =>
      parseFloat(
        document.querySelector('.showcase-hero').style.getPropertyValue('--showcase-pointer-x')
      ) > 80
  );
  await page.waitForTimeout(950);
  const right = await canvasStamp(page);
  const rightTransform = await page
    .locator('.hero-field-prism')
    .evaluate((element) => getComputedStyle(element).transform);
  assert.notEqual(right, left, 'Optical canvas does not change between live pointer states');
  assert.notEqual(rightTransform, leftTransform, 'Optical prism does not follow pointer position');
  await capture(page, 'lite-hero-pointer-right');
  const input = page.locator('.showcase-search textarea');
  await input.focus();
  await page.waitForTimeout(60);
  const focused = await canvasStamp(page);
  await page.mouse.move(120, 250);
  await page.mouse.move(page.viewportSize().width - 120, 250);
  await page.waitForTimeout(180);
  assert.equal(
    await canvasStamp(page),
    focused,
    'Query focus does not pause the decorative canvas'
  );
  receipt.opticalInteraction.push({
    name: 'desktop pointer',
    canvasChanged: true,
    prismTransformChanged: true,
    queryFocusPausedCanvas: true,
  });
  check(
    'Optical canvas and prism respond to pointer; query focus pauses canvas without submitting'
  );
  await input.blur();
  await page.mouse.move(0, 0);
}
async function scrollScene(page, selector, inset = 80) {
  await page.locator(selector).evaluate((element, inset) => {
    window.scrollTo({
      top: element.getBoundingClientRect().top + scrollY - inset,
      behavior: 'instant',
    });
  }, inset);
  await page.waitForTimeout(1250);
}
async function emptyRecentReports(page, name) {
  const trigger = page.locator('.showcase-history-toggle');
  const writesBefore = receipt.researchWrites.length;
  await trigger.focus();
  await page.keyboard.press('Enter');
  const history = page.locator('.showcase-search-history');
  await history.waitFor();
  await page.waitForFunction(() => {
    const empty = document.querySelector('.showcase-history-empty');
    return (
      empty &&
      /查过的公司会出现在这里|Your company reports will appear here/.test(empty.textContent)
    );
  });
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(await history.locator('a').count(), 0);
  assert.equal(receipt.researchWrites.length, writesBefore);
  await noOverflow(page, `${name} empty recent reports`);
  await capture(page, `${name}-search-recent-empty`);
  await trigger.focus();
  await page.keyboard.press('Enter');
  await history.waitFor({ state: 'hidden' });
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(await trigger.evaluate((element) => document.activeElement === element), true);
  assert.equal(receipt.researchWrites.length, writesBefore);
  check(
    `${name}: keyboard recent-report toggle preserves empty owning guest state without research writes`
  );
}
async function evidenceAndProcess(page, name) {
  await scrollScene(page, '.showcase-evidence');
  await noOverflow(page, `${name} evidence heading`);
  await capture(page, `${name}-evidence-heading`);
  await scrollScene(page, '.showcase-evidence-stage', 120);
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('.showcase-source-sheet img')).every(
      (image) => image.complete && image.naturalWidth > 0
    )
  );
  const originals = await page
    .locator('.showcase-source-sheet img')
    .evaluateAll((images) =>
      images.map((image) => ({ src: image.getAttribute('src'), alt: image.getAttribute('alt') }))
    );
  assert.ok(originals[0].src.includes('page-190'));
  assert.ok(originals[0].alt?.length);
  assert.ok(originals[1].src.includes('page-191'));
  assert.equal(await page.locator('.showcase-source-xray').getAttribute('aria-hidden'), 'true');
  const scanner = page.locator('.showcase-source-scanner');
  const range = page.locator('.showcase-scan-control input[type="range"]');
  const exactAmountsBefore = await page.locator('.showcase-evidence-values dl').innerText();
  const before = await range.inputValue();
  const clipBefore = await page
    .locator('.showcase-source-xray')
    .evaluate((element) => getComputedStyle(element).clipPath);
  await range.focus();
  await page.keyboard.press('ArrowRight');
  const after = await range.inputValue();
  assert.equal(Number(after), Number(before) + 1);
  assert.equal(
    (await scanner.evaluate((element) => element.style.getPropertyValue('--scan-position'))).trim(),
    `${after}%`
  );
  const clipAfter = await page
    .locator('.showcase-source-xray')
    .evaluate((element) => getComputedStyle(element).clipPath);
  assert.notEqual(clipAfter, clipBefore);
  await page.keyboard.press('Home');
  assert.equal(await range.inputValue(), '8');
  await capture(page, `${name}-evidence-reveal-left`);
  await page.keyboard.press('End');
  assert.equal(await range.inputValue(), '92');
  await capture(page, `${name}-evidence-reveal-right`);
  assert.equal(await page.locator('.showcase-evidence-values dl').innerText(), exactAmountsBefore);
  check(
    `${name}: keyboard reveal changes CSS/clipping of real p190/p191 crops and preserves exact amounts`
  );
  await noOverflow(page, `${name} evidence scanner`);
  await scrollScene(page, '.showcase-process');
  await capture(page, `${name}-process-heading`);
  await scrollScene(page, '.showcase-process-layout', 110);
  const chapters = page.locator('.showcase-chapters > button');
  for (let index = 0; index < 3; index++) {
    await chapters.nth(index).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction((step) => {
      const active = document.querySelector('.showcase-chapters > button[aria-pressed="true"]');
      const inline = active?.querySelector(
        '.showcase-chapter-inline-preview .showcase-flow-device'
      );
      const preview =
        matchMedia('(max-width: 600px)').matches && inline
          ? inline
          : document.querySelector('.showcase-chapter-preview .showcase-flow-device');
      if (preview?.getAttribute('data-preview-step') !== String(step)) return false;
      const image = preview.querySelector('img');
      return !image || (image.complete && image.naturalWidth > 0);
    }, index);
    assert.equal(await chapters.nth(index).getAttribute('aria-pressed'), 'true');
    const preview = page.locator(
      page.viewportSize().width <= 600
        ? '.showcase-chapters > button[aria-pressed="true"] .showcase-flow-device'
        : '.showcase-chapter-preview .showcase-flow-device'
    );
    assert.match(
      await preview.locator('.showcase-flow-scope').innerText(),
      /固定历史示例|Fixed historical example/
    );
    assert.equal(await preview.locator('img[src$="optical-prism.webp"]').count(), 0);
    if (index === 0) {
      assert.match(await preview.locator('.showcase-flow-match').innerText(), /300893/);
      assert.match(await preview.innerText(), /先确认主体|Confirm the company/);
    } else if (index === 1) {
      const values = await preview.locator('.showcase-flow-value strong').allTextContents();
      assert.deepEqual(values, ['366,373,098.93', '26,197,123.70']);
      const widths = await preview
        .locator('.showcase-flow-bar')
        .evaluateAll((elements) =>
          elements.map((element) => Number.parseFloat(element.style.width))
        );
      assert.equal(widths[0], 100);
      // CSSOM serializes percentages with fewer digits than the underlying
      // exact displayed amounts; keep the visual-ratio tolerance below 0.0001pp.
      assert.ok(Math.abs(widths[1] / widths[0] - 26197123.7 / 366373098.93) < 1e-6);
      assert.match(await preview.innerText(), /2025.*CNY/s);
    } else {
      assert.ok((await preview.locator('img').getAttribute('src')).includes('page-190'));
      assert.match(await preview.innerText(), /p\.190–191/);
    }
  }
  await noOverflow(page, `${name} process`);
  await capture(page, `${name}-process-evidence-preview`);
  check(
    `${name}: selected process chapters show labeled historical identity, exact same-scale figures and loaded originals`
  );
}
async function capture(page, name) {
  const filename = `${name}.png`;
  await page.screenshot({
    path: path.join(output, filename),
    animations: 'disabled',
  });
  receipt.screenshots.push({
    file: filename,
    viewport: page.viewportSize(),
    deviceScaleFactor: 1,
    url: new URL(page.url()).pathname,
    theme: await page.locator('html').getAttribute('data-theme'),
    locale: await page.locator('.showcase-home, .company-query-page').getAttribute('data-locale'),
    reducedMotion: await page.evaluate(
      () => matchMedia('(prefers-reduced-motion: reduce)').matches
    ),
  });
}
async function openContext({
  locale = 'zh-Hans',
  width = 1440,
  height = 1024,
  colorScheme = 'light',
  reducedMotion = 'no-preference',
} = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme,
    reducedMotion,
  });
  await context.addInitScript(
    (language) => localStorage.setItem('cashlens-locale', language),
    locale
  );
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      request.method() === 'GET' &&
      request.resourceType() === 'script' &&
      request.url() === 'https://analytics.lailai.one/script.js'
    ) {
      receipt.excludedTelemetryScripts.push(request.url());
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    } else if (['http:', 'https:'].includes(url.protocol) && url.origin !== base) {
      receipt.blockedBrowserRequests.push({
        origin: url.origin,
        pathname: url.pathname,
      });
      await route.abort('blockedbyclient');
    } else {
      if (
        request.method() !== 'GET' &&
        /^\/api\/(company-runs|company-gaps)(?:\/|$)/.test(url.pathname)
      )
        receipt.researchWrites.push({
          pathname: url.pathname,
          method: request.method(),
        });
      await route.continue();
    }
  });
  const page = await context.newPage();
  currentPage = page;
  page.on('pageerror', (error) => receipt.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') receipt.consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      receipt.failedResponses.push({
        status: response.status(),
        pathname: new URL(response.url()).pathname,
      });
  });
  page.on('requestfailed', (request) => {
    const failure = {
      pathname: new URL(request.url()).pathname,
      failure: request.failure()?.errorText,
    };
    // Owner-scoped reads abort when a page detaches or an input draft is cleared.
    // Preserve these observations without hiding writes, HTTP errors or other failures.
    const cancelledRead =
      request.method() === 'GET' &&
      failure.failure === 'net::ERR_ABORTED' &&
      /^\/api\/(?:company-records|workspace|companies\/(?:directory|search))$/.test(
        failure.pathname
      );
    receipt[cancelledRead ? 'cancelledReadRequests' : 'failedRequests'].push(failure);
  });
  page.setDefaultTimeout(15000);
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => {
    const input = document.querySelector('.showcase-search textarea');
    return input && !input.disabled;
  });
  await page.waitForFunction(() => {
    const scene = document.querySelector('[data-hero-ready="true"]');
    const prism = scene?.querySelector('img');
    const description = document.querySelector('.showcase-description');
    return (
      scene &&
      Number(getComputedStyle(scene).opacity) > 0.9999 &&
      prism?.getAttribute('src')?.endsWith('/optical-prism.webp') &&
      prism.complete &&
      prism.naturalWidth > 0 &&
      description &&
      Number(getComputedStyle(description).opacity) > 0.99
    );
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('.showcase-letter')).every((letter) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(letter).transform);
      return Math.abs(matrix.m42) < 0.01 && matrix.m22 > 0.9999;
    })
  );
  return { page, context };
}
try {
  const { createApp } = await import(pathToFileURL(path.join(root, 'server', 'app.ts')).href);
  application = await createApp({
    root,
    dataDir,
    model: {},
    registrationEnabled: true,
  });
  server = await new Promise((resolve, reject) => {
    const instance = application.app.listen(4338, '127.0.0.1', () => resolve(instance));
    instance.once('error', reject);
  });
  browser = await chromium.launch({ headless: true });
  const desktop = await openContext();
  const page = desktop.page;
  await page.getByRole('heading', { name: '让企业判断，有据可查。', exact: true }).waitFor();
  const session = await page.request.get(`${base}/api/auth/session`);
  assert.equal(session.status(), 200);
  assert.equal((await session.json()).user.isGuest, true);
  check('Real guest session and enabled Lite company entry');
  await noOverflow(page, 'desktop Lite');
  await headerControlsFit(page, 'desktop Lite');
  await headlineFits(page, 'desktop Lite');
  await submitLabelFits(page, 'desktop Lite');
  await capture(page, 'lite-desktop-zh-light');
  await pointerOptics(page);
  const input = page.locator('.showcase-search textarea');
  await input.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
  );
  await input.fill('松原安全');
  assert.equal(await input.inputValue(), '松原安全');
  await input.fill('');
  await input.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }))
  );
  await input.blur();
  check('Native editable company input retains composition text without submitting research');
  // These labels are present in the real bundled public catalog. Clear immediately;
  // clicking a sample only drafts its name and never submits company research.
  await page.locator('.showcase-examples button').filter({ hasText: '松原安全' }).click();
  await page.waitForFunction(() => {
    const field = document.querySelector('.showcase-search textarea');
    return field?.value === '松原安全' && document.activeElement === field;
  });
  await input.fill('');
  check('Sample company button fills and focuses the editable draft without submission');
  const year = page.locator('.showcase-search-meta .select-trigger');
  const before = await year.innerText();
  await year.click();
  const alternative = page.getByRole('option').nth(1);
  const selectedYear = await alternative.innerText();
  await alternative.click();
  assert.notEqual(await year.innerText(), before);
  assert.equal((await year.innerText()).trim(), selectedYear.trim());
  check('Annual selection changes locally');
  await emptyRecentReports(page, 'lite-desktop-zh');
  const trigger = page.locator('.showcase-menu-trigger');
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('dialog', { name: '探索析光', exact: true });
  await menu.waitFor();
  const menuPro = menu.locator('nav a').filter({ hasText: 'Pro' });
  await menuPro.focus();
  await page.waitForFunction(
    () =>
      document.querySelector('.showcase-menu-route.is-active')?.getAttribute('data-route') === 'pro'
  );
  const routePreview = menu.locator('.showcase-menu-route.is-active');
  assert.match(await routePreview.innerText(), /研究报告|Research report/);
  assert.equal(await menu.locator('img[src$="optical-prism.webp"]').count(), 0);
  await noOverflow(page, 'desktop full-screen menu');
  await capture(page, 'lite-menu-zh-light');
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate((element) => document.activeElement === element), true);
  check('Full-screen menu keyboard open, focus preview, Escape and focus restoration');
  await evidenceAndProcess(page, 'lite-desktop-zh');
  await page.locator('.showcase-source-sheet').click();
  const source = page.locator('.showcase-source-dialog');
  await source.waitFor();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('.showcase-source-dialog img')).every(
      (image) => image.complete && image.naturalWidth > 0
    )
  );
  await capture(page, 'lite-historical-source-dialog');
  await page.keyboard.press('Escape');
  await source.waitFor({ state: 'hidden' });
  check('Real retained historical report crops open and load locally');
  await page.locator('.experience-switch a').filter({ hasText: 'Pro' }).click();
  await page.waitForURL(`${base}/query`);
  await page.waitForFunction(() => {
    const element = document.querySelector('.company-query-page textarea');
    return element && !element.disabled;
  });
  assert.equal(await page.locator('.showcase-home').count(), 0);
  await noOverflow(page, 'Pro query');
  await capture(page, 'pro-query-zh-light');
  await page.locator('.experience-switch a').filter({ hasText: 'Lite' }).click();
  await page.waitForURL(`${base}/`);
  await page.locator('.showcase-home').waitFor();
  check('Lite → Pro query → Lite navigation uses distinct real pages');
  await desktop.context.close();
  const mobile = await openContext({
    locale: 'en',
    width: 390,
    height: 844,
    colorScheme: 'dark',
  });
  await mobile.page
    .getByRole('heading', {
      name: 'Make company judgments traceable.',
      exact: true,
    })
    .waitFor();
  assert.equal(await mobile.page.locator('html').getAttribute('data-theme'), 'dark');
  await noOverflow(mobile.page, 'mobile English dark');
  await headerControlsFit(mobile.page, 'mobile English dark');
  await headlineFits(mobile.page, 'mobile English dark');
  await submitLabelFits(mobile.page, 'mobile English dark');
  await capture(mobile.page, 'lite-mobile-en-dark');
  await mobile.page.locator('.showcase-menu-trigger').click();
  await mobile.page.getByRole('dialog', { name: 'Explore Prispect', exact: true }).waitFor();
  await noOverflow(mobile.page, 'mobile menu');
  await mobile.page.keyboard.press('Escape');
  check('390px English dark entry and mobile menu');
  await evidenceAndProcess(mobile.page, 'lite-mobile-en-dark');
  await mobile.context.close();
  const reduced = await openContext({
    width: 375,
    height: 812,
    reducedMotion: 'reduce',
  });
  assert.equal(
    await reduced.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    true
  );
  await noOverflow(reduced.page, 'reduced-motion mobile');
  await headlineFits(reduced.page, 'reduced-motion mobile');
  await submitLabelFits(reduced.page, 'reduced-motion mobile');
  await capture(reduced.page, 'lite-mobile-zh-reduced-motion');
  await staticOptics(reduced.page, '375px reduced motion');
  check('375px reduced-motion entry remains visible and editable');
  await reduced.context.close();
  const englishDesktop = await openContext({ locale: 'en' });
  await noOverflow(englishDesktop.page, 'desktop English Lite');
  await headerControlsFit(englishDesktop.page, 'desktop English Lite');
  await headlineFits(englishDesktop.page, 'desktop English Lite');
  await submitLabelFits(englishDesktop.page, 'desktop English Lite');
  await capture(englishDesktop.page, 'lite-desktop-en-light');
  check('1440px English entry retains the complete canonical headline');
  await englishDesktop.context.close();
  const narrow = await openContext({
    locale: 'en',
    width: 320,
    height: 768,
    reducedMotion: 'reduce',
  });
  await noOverflow(narrow.page, '320px English Lite');
  await headerControlsFit(narrow.page, '320px English Lite');
  await headlineFits(narrow.page, '320px English Lite');
  await submitLabelFits(narrow.page, '320px English Lite');
  await capture(narrow.page, 'lite-320-en-light');
  await staticOptics(narrow.page, '320px reduced motion');
  await emptyRecentReports(narrow.page, 'lite-320-en-light');
  const narrowTrigger = narrow.page.locator('.showcase-menu-trigger');
  await narrowTrigger.focus();
  await narrow.page.keyboard.press('Enter');
  const narrowMenu = narrow.page.getByRole('dialog', { name: 'Explore Prispect', exact: true });
  await narrowMenu.waitFor();
  for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab']) {
    await narrow.page.keyboard.press(key);
    await narrow.page.waitForFunction(() =>
      Boolean(document.activeElement?.closest('.showcase-navigation[role="dialog"]'))
    );
  }
  await noOverflow(narrow.page, '320px English full-screen menu');
  await capture(narrow.page, 'lite-menu-320-en-light');
  await narrow.page.keyboard.press('Escape');
  await narrowMenu.waitFor({ state: 'hidden' });
  assert.equal(await narrowTrigger.evaluate((element) => document.activeElement === element), true);
  check('320px English menu confines Tab/Shift+Tab focus and restores its trigger');
  await narrow.context.close();
  for (const name of [
    'pageErrors',
    'consoleErrors',
    'failedResponses',
    'failedRequests',
    'blockedServerRequests',
    'blockedBrowserRequests',
    'researchWrites',
  ])
    assert.equal(receipt[name].length, 0, `${name}: ${JSON.stringify(receipt[name])}`);
  check('Zero console/page/network errors, public source/model attempts or research writes');
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = error.stack || String(error);
  if (currentPage && !currentPage.isClosed())
    await currentPage
      .screenshot({
        path: path.join(output, 'failure.png'),
        animations: 'disabled',
      })
      .catch(() => {});
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
