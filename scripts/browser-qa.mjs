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
  version: 1,
  commit: process.env.GITHUB_SHA || null,
  status: 'working',
  financialFixtures: false,
  checks: [],
  screenshots: [],
  pageErrors: [],
  consoleErrors: [],
  failedResponses: [],
  failedRequests: [],
  blockedServerRequests: [],
  blockedBrowserRequests: [],
  researchWrites: [],
  limits: [
    'No company research is submitted; live company-result, financial acquisition, same-run switching and model/assistant answers are outside this entry-flow check.',
    'Screenshots require a separate visual comparison with the selected source; successful assertions are not a fidelity verdict.',
    'Guest storage is fresh and temporary; no production records or synthetic financial responses are used.',
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
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== base) {
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
  page.on('requestfailed', (request) =>
    receipt.failedRequests.push({
      pathname: new URL(request.url()).pathname,
      failure: request.failure()?.errorText,
    })
  );
  page.setDefaultTimeout(15000);
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => {
    const input = document.querySelector('.showcase-search textarea');
    return input && !input.disabled;
  });
  await page.waitForFunction(() => {
    const paper = document.querySelector('.showcase-paper');
    const description = document.querySelector('.showcase-description');
    return (
      paper?.complete &&
      paper.naturalWidth > 0 &&
      description &&
      Number(getComputedStyle(description).opacity) > 0.99
    );
  });
  await page.evaluate(() => document.fonts.ready);
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
  await capture(page, 'lite-desktop-zh-light');
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
  const year = page.locator('.showcase-search-meta .select-trigger');
  const before = await year.innerText();
  await year.click();
  const alternative = page.getByRole('option').nth(1);
  const selectedYear = await alternative.innerText();
  await alternative.click();
  assert.notEqual(await year.innerText(), before);
  assert.equal((await year.innerText()).trim(), selectedYear.trim());
  check('Annual selection changes locally');
  const trigger = page.locator('.showcase-menu-trigger');
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('dialog', { name: '探索析光', exact: true });
  await menu.waitFor();
  const menuPro = menu.locator('nav a').filter({ hasText: 'Pro' });
  await menuPro.focus();
  await page.waitForFunction(() =>
    document
      .querySelector('.showcase-navigation-preview img.is-active')
      ?.getAttribute('src')
      ?.includes('page-191')
  );
  await noOverflow(page, 'desktop full-screen menu');
  await capture(page, 'lite-menu-zh-light');
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate((element) => document.activeElement === element), true);
  check('Full-screen menu keyboard open, focus preview, Escape and focus restoration');
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
  await capture(mobile.page, 'lite-mobile-en-dark');
  await mobile.page.locator('.showcase-menu-trigger').click();
  await mobile.page.getByRole('dialog', { name: 'Explore Prispect', exact: true }).waitFor();
  await noOverflow(mobile.page, 'mobile menu');
  await mobile.page.keyboard.press('Escape');
  check('390px English dark entry and mobile menu');
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
  await capture(reduced.page, 'lite-mobile-zh-reduced-motion');
  check('375px reduced-motion entry remains visible and editable');
  await reduced.context.close();
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
