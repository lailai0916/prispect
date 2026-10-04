/** Real entry acceptance plus explicit local synthetic company-channel rendering. */
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
  version: 6,
  commit: process.env.GITHUB_SHA || null,
  status: 'working',
  financialFixtures: true,
  syntheticCompanyRecords: [],
  buildAssets: Array.from(
    (await readFile(path.join(root, 'dist/index.html'), 'utf8')).matchAll(
      /(?:src|href)="(\/assets\/[^\"]+)"/g
    ),
    (match) => match[1]
  ),
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
  injectedReadFailures: [],
  metadataProtocolFixtures: [],
  limits: [
    'Two explicit local synthetic owning records are created through the isolated API for channel rendering; live financial acquisition and model/assistant answers remain outside this check.',
    'Screenshots require a separate visual comparison with the selected source; successful assertions are not a fidelity verdict.',
    'Guest storage is fresh and temporary. Two synthetic snapshots and pure-rule saved-assessment GET overlays test issuer-bound presentation; no production records are used.',
    'The existing analytics.lailai.one/script.js telemetry script receives empty JavaScript locally; analytics behavior is outside this check.',
    'Three exactly scoped synthetic company metadata GET controls exercise empty results, HTTP failure and cancellation; real bundled public-catalog candidates are verified separately. They do not replace financial or model responses.',
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
  const measured = await page.locator('#showcase-title').evaluate((heading) => {
    const box = heading.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(heading);
    return {
      left: box.left,
      right: box.right,
      ranges: Array.from(range.getClientRects(), (line) => ({
        left: line.left,
        right: line.right,
      })),
    };
  });
  assert.ok(measured.ranges.length > 0, `${name} has no headline text`);
  for (const line of measured.ranges)
    assert.ok(
      line.left >= measured.left - 2 && line.right <= measured.right + 2,
      `${name} clips its headline: ${JSON.stringify(line)}`
    );
  check(`${name}: complete headline text fits its actual content area`);
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
async function readableComposer(page, name) {
  const input = page.locator('.showcase-search textarea');
  const area = await input.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      width:
        element.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight),
      fontSize: Number.parseFloat(style.fontSize),
    };
  });
  assert.ok(area.width >= 96, `${name} hides its editable company text: ${JSON.stringify(area)}`);
  assert.ok(area.fontSize >= 16, `${name} uses a zoom-triggering mobile input size`);
  assert.equal(await page.locator('.showcase-search .start-mode').isVisible(), false);
  assert.equal(await page.locator('.showcase-search .start-key-hint').isVisible(), false);
  check(
    `${name}: company text has usable visible space without a redundant mode badge or inner submit hint`
  );
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
async function readableDialogHeader(dialog, name) {
  const colors = await dialog.locator('.dialog-header h2').evaluate((element) => {
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = colorCanvas.height = 1;
    const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true });
    if (!colorContext) throw new Error('Color normalization requires Canvas2D');
    const rgb = (value) => {
      colorContext.clearRect(0, 0, 1, 1);
      colorContext.fillStyle = value;
      colorContext.fillRect(0, 0, 1, 1);
      const channels = Array.from(colorContext.getImageData(0, 0, 1, 1).data);
      return [channels[0], channels[1], channels[2], channels[3] / 255];
    };
    const layers = [];
    for (let node = element; node; node = node.parentElement)
      layers.push(rgb(getComputedStyle(node).backgroundColor));
    let background = [255, 255, 255];
    for (const layer of layers.reverse())
      background = background.map(
        (value, index) => layer[index] * layer[3] + value * (1 - layer[3])
      );
    const foreground = rgb(getComputedStyle(element).color);
    return { foreground: foreground.slice(0, 3), background, text: element.textContent };
  });
  const luminance = (color) =>
    color
      .map((value) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      })
      .reduce((value, channel, index) => value + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const fg = luminance(colors.foreground),
    bg = luminance(colors.background);
  const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  assert.ok(
    ratio >= 4.5,
    `${name} unreadable dialog heading: ${JSON.stringify({ ...colors, ratio })}`
  );
  check(`${name}: native dialog title has at least 4.5:1 text contrast`);
}
async function canvasStamp(page) {
  return page.locator('.lite-search-ambient').evaluate((canvas) => canvas.toDataURL());
}
async function staticOptics(page, name) {
  await page.locator('.showcase-hermes[data-ambient-ready="true"]').waitFor();
  const before = await canvasStamp(page);
  await page.mouse.move(24, 200);
  await page.mouse.move(page.viewportSize().width - 24, 300);
  await page.waitForTimeout(180);
  assert.equal(await canvasStamp(page), before, `${name} ambient canvas continues animating`);
  receipt.opticalInteraction.push({ name, canvasStatic: true });
  check(`${name}: ambient hero remains static under reduced motion`);
}
async function pointerOptics(page) {
  const scene = page.locator('.showcase-hermes[data-ambient-ready="true"]');
  assert.equal(await scene.getAttribute('data-ambient-rendering'), 'canvas');
  assert.equal(await page.locator('.showcase-home img[src$="optical-prism.webp"]').count(), 0);
  await page.mouse.move(110, 290, { steps: 10 });
  await page.waitForTimeout(950);
  const left = await canvasStamp(page);
  await capture(page, 'lite-hero-pointer-left');
  await page.mouse.move(page.viewportSize().width - 110, 380, { steps: 10 });
  await page.waitForTimeout(950);
  const right = await canvasStamp(page);
  assert.notEqual(right, left, 'Ambient canvas does not change during active motion');
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
    name: 'desktop ambient hero',
    canvasChanged: true,
    repeatedHeroArtworkRemoved: true,
    queryFocusPausedCanvas: true,
  });
  check(
    'Ambient hero animates without repeated artwork; query focus pauses canvas without submitting'
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
  if ((await trigger.getAttribute('aria-expanded')) === 'true') {
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.locator('.showcase-search-history').waitFor({ state: 'hidden' });
  }
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
async function companyCandidates(page, name) {
  const input = page.locator('.showcase-search textarea');
  const writesBefore = receipt.researchWrites.length;
  await input.focus();
  const list = page.locator('.showcase-search .company-completions[role="listbox"]');
  await list.waitFor();
  await list.locator('[role="option"]').filter({ hasText: '松原安全' }).waitFor();
  assert.equal(await input.getAttribute('aria-expanded'), 'true');
  assert.equal(await input.getAttribute('aria-controls'), await list.getAttribute('id'));
  await page.keyboard.press('ArrowDown');
  const activeId = await input.getAttribute('aria-activedescendant');
  assert.ok(activeId);
  const active = list.locator(`[role="option"][id="${activeId}"]`);
  assert.equal(await active.getAttribute('aria-selected'), 'true');
  assert.equal(await active.locator('.company-completion-code').innerText(), '300893');
  await noOverflow(page, `${name} native company chooser`);
  await capture(page, `${name}-company-candidates`);
  await page.keyboard.press('Escape');
  await list.waitFor({ state: 'hidden' });
  assert.equal(await input.inputValue(), '松原安全');
  assert.equal(await input.evaluate((element) => document.activeElement === element), true);
  const scrollBefore = await page.evaluate(() => scrollY);
  await input.press('Home');
  assert.equal(await input.evaluate((element) => element.selectionStart), 0);
  await input.press('End');
  assert.equal(await input.evaluate((element) => element.selectionStart), 4);
  assert.equal(await page.evaluate(() => scrollY), scrollBefore);
  assert.equal(receipt.researchWrites.length, writesBefore);
  check(
    `${name}: real public-catalog company candidates support ArrowDown/Escape while retaining the draft without research submission`
  );
}
async function matchingReadStates(page) {
  const input = page.locator('.showcase-search textarea');
  const emptyQuery = 'CI空结果验证样本';
  const errorQuery = 'CI读取失败验证样本';
  const cancelledQuery = 'CI取消读取验证样本';
  let retry = false;
  let releaseCancelled;
  const pendingCancelled = new Promise((resolve) => {
    releaseCancelled = resolve;
  });
  const metadata = (query) => ({
    query,
    candidates: [],
    limitedToListed: true,
    source: 'cninfo',
    truncated: false,
  });
  const routeHandler = async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q');
    if (![emptyQuery, errorQuery, cancelledQuery].includes(query)) return route.fallback();
    assert.equal(route.request().method(), 'GET');
    receipt.metadataProtocolFixtures.push({ query, method: 'GET', fixture: true });
    if (query === cancelledQuery) {
      await pendingCancelled;
      return route
        .fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(metadata(query)),
        })
        .catch(() => {});
    }
    if (query === errorQuery && !retry) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: '公开主体资料读取暂时不可用，请重试。',
          code: 'COMPANY_SEARCH_UNAVAILABLE',
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(metadata(query)),
    });
  };
  await page.route('**/api/companies/search**', routeHandler);
  try {
    await input.fill(emptyQuery);
    await page
      .locator('.company-completions-state')
      .filter({ hasText: /未匹配到支持的上市主体|No supported listed entity matched/ })
      .waitFor();
    assert.equal(await page.locator('.start-input-error [role="alert"]').count(), 0);
    await input.fill(errorQuery);
    const alert = page.locator('.start-input-error [role="alert"]');
    await alert.waitFor();
    assert.equal(await input.inputValue(), errorQuery);
    assert.equal(
      await page
        .locator('.company-completions-state')
        .filter({ hasText: /未匹配到|No supported/ })
        .count(),
      0
    );
    await capture(page, 'lite-search-read-error');
    retry = true;
    await page.locator('.start-input-error button').click();
    await alert.waitFor({ state: 'hidden' });
    await page
      .locator('.company-completions-state')
      .filter({ hasText: /未匹配到支持的上市主体|No supported listed entity matched/ })
      .waitFor();
    assert.equal(await input.inputValue(), errorQuery);
    const pending = page.waitForRequest(
      (request) => new URL(request.url()).searchParams.get('q') === cancelledQuery
    );
    await input.fill(cancelledQuery);
    await pending;
    await input.fill('');
    releaseCancelled();
    await page.waitForTimeout(80);
    assert.equal(await page.locator('.company-completions').count(), 0);
    assert.equal(await page.locator('.start-input-error [role="alert"]').count(), 0);
    assert.equal(await input.inputValue(), '');
    check(
      'Local metadata-only GET fixtures distinguish empty results from HTTP failure; retry keeps the draft and cancellation prevents stale results'
    );
  } finally {
    releaseCancelled();
    await page.unroute('**/api/companies/search**', routeHandler);
  }
}
async function signalChannels(page, name) {
  await scrollScene(page, '.showcase-signal-stage', 110);
  const stage = page.locator('.showcase-signal-stage[data-signal-ready="true"]');
  await stage.waitFor();
  const writesBefore = receipt.researchWrites.length;
  const tabs = stage.locator('.signal-channel-tabs button[role="tab"]');
  assert.equal(await tabs.count(), 4);
  const selected = async (index, channel) => {
    await page.waitForFunction(
      (channel) =>
        document.querySelector('.showcase-signal-stage')?.getAttribute('data-channel') === channel,
      channel
    );
    assert.equal(await tabs.nth(index).getAttribute('aria-selected'), 'true');
    assert.equal(await tabs.nth(index).getAttribute('tabindex'), '0');
    assert.equal(await stage.locator('[role="tab"][aria-selected="true"]').count(), 1);
    const tabId = await tabs.nth(index).getAttribute('id');
    const panelId = await tabs.nth(index).getAttribute('aria-controls');
    const panel = stage.locator(`[role="tabpanel"][id="${panelId}"]`);
    assert.equal(await panel.isVisible(), true);
    assert.equal(await panel.getAttribute('aria-labelledby'), tabId);
    for (let tab = 0; tab < 4; tab++) {
      if (tab === index) continue;
      assert.equal(await tabs.nth(tab).getAttribute('aria-selected'), 'false');
      assert.equal(await tabs.nth(tab).getAttribute('tabindex'), '-1');
    }
  };
  await tabs.nth(0).focus();
  await page.keyboard.press('Home');
  await selected(0, 'finance');
  assert.match(
    await stage.locator('.signal-stage-context').innerText(),
    /固定历史示例|Fixed historical example/
  );
  assert.match(
    await stage.locator('.signal-scope').innerText(),
    /不是当前查询结果|Not a current query result/
  );
  await historicalCompactAmounts(stage, name);
  await financeAmountsFit(page, name);
  const amounts = await stage.locator('.signal-finance-facts').innerText();
  const scenes = stage.locator('.signal-scene-controls button');
  for (const [index, view] of ['numbers', 'difference', 'source'].entries()) {
    await scenes.nth(index).focus();
    await page.keyboard.press('Enter');
    await stage.locator(`.signal-finance-scene[data-finance-view="${view}"]`).waitFor();
    assert.equal(await scenes.nth(index).getAttribute('aria-pressed'), 'true');
    assert.equal(await stage.locator('.signal-finance-facts').innerText(), amounts);
    if (view === 'numbers') {
      const cashWidth = await stage
        .locator('.signal-bar-cash')
        .evaluate((element) =>
          Number.parseFloat(element.style.getPropertyValue('--signal-bar-width'))
        );
      assert.ok(Math.abs(cashWidth / 100 - 26197123.7 / 366373098.93) < 1e-6);
      assert.match(
        await stage.locator('.signal-panel-note').innerText(),
        /同一金额刻度|same monetary scale/
      );
    } else if (view === 'difference') {
      const difference = stage.locator('.signal-difference-amount > span');
      assert.match(await difference.innerText(), /约|approx/i);
      assert.match(await difference.getAttribute('aria-label'), /340,175,975\.23/);
      assert.match(
        await stage.locator('.signal-panel-note').innerText(),
        /不证明经营原因|does not establish a business cause/
      );
    }
    if (view !== 'source') await capture(page, `${name}-signal-finance-${view}`);
  }
  check(
    `${name}: financial views retain exact sample amounts and distinguish their derived difference from a business conclusion`
  );
  await tabs.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await selected(1, 'public');
  assert.equal(await tabs.nth(1).evaluate((element) => document.activeElement === element), true);
  assert.match(
    await stage.locator('.signal-stage-context').innerText(),
    /能力示意.*未取得|Capability preview.*not obtained/s
  );
  assert.match(
    await stage.locator('.signal-missing-note').innerText(),
    /未取得公开事项材料|Public-record material is not obtained/
  );
  assert.equal(await stage.locator('.signal-finance-facts').count(), 0);
  await noOverflow(page, `${name} public-record channel`);
  await capture(page, `${name}-signal-public`);
  await page.keyboard.press('ArrowRight');
  await selected(2, 'reputation');
  assert.equal(await tabs.nth(2).evaluate((element) => document.activeElement === element), true);
  assert.match(
    await stage.locator('.signal-missing-note').innerText(),
    /不生成评价、星级或可信度评分|No reviews, stars or credibility scores are generated/
  );
  await noOverflow(page, `${name} reputation channel`);
  await capture(page, `${name}-signal-reputation`);
  await page.keyboard.press('End');
  await selected(3, 'original');
  assert.equal(await tabs.nth(3).evaluate((element) => document.activeElement === element), true);
  const pageButtons = stage.locator('.signal-original-tabs button');
  for (const [index, pageNumber] of [190, 191].entries()) {
    await pageButtons.nth(index).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction((pageNumber) => {
      const image = document.querySelector('.showcase-signal-stage .signal-original-sheet img');
      return (
        image?.getAttribute('src')?.includes(`page-${pageNumber}`) &&
        image.complete &&
        image.naturalWidth > 0
      );
    }, pageNumber);
    assert.equal(await pageButtons.nth(index).getAttribute('aria-pressed'), 'true');
  }
  const original = stage.locator('.signal-original-sheet');
  await original.focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('.showcase-source-dialog');
  await dialog.waitFor();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('.showcase-source-dialog img')).every(
      (image) => image.complete && image.naturalWidth > 0
    )
  );
  assert.equal(await dialog.locator('img').count(), 2);
  await readableDialogHeader(dialog, `${name} original-source dialog`);
  assert.deepEqual(await dialog.locator('.showcase-originals dl dd').allTextContents(), [
    '366,373,098.93 CNY',
    '26,197,123.70 CNY',
  ]);
  assert.match(await dialog.innerText(), /固定历史示例|Fixed historical example/);
  await capture(page, `${name}-signal-original-dialog`);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await original.evaluate((element) => document.activeElement === element), true);
  await tabs.nth(3).focus();
  await page.keyboard.press('ArrowLeft');
  await selected(2, 'reputation');
  await page.keyboard.press('Home');
  await selected(0, 'finance');
  await scenes.nth(0).focus();
  await page.keyboard.press('Enter');
  assert.equal(receipt.researchWrites.length, writesBefore);
  check(
    `${name}: tabs support arrow/Home/End focus, absent-source states and a genuine original-page dialog preserving full-precision amounts without research writes`
  );
}
async function historicalCompactAmounts(stage, name) {
  const cards = stage.locator('.signal-finance-facts dd');
  assert.equal(await cards.count(), 2);
  for (const [index, amount] of ['366,373,098.93', '26,197,123.70'].entries()) {
    const card = cards.nth(index);
    assert.ok((await card.getAttribute('aria-label')).includes(amount));
    assert.ok((await card.getAttribute('title')).includes(amount));
    assert.match(await card.innerText(), /约|approx/i);
    assert.match(await card.innerText(), /亿元|CNY\s*[\d.,]+M/);
  }
  const exact = stage.locator('.signal-exact-data');
  await exact.locator('summary').focus();
  await stage.page().keyboard.press('Enter');
  const figures = await exact.locator('dl dd').allTextContents();
  assert.equal(figures.length, 3);
  for (const [index, amount] of ['366,373,098.93', '26,197,123.70', '340,175,975.23'].entries())
    assert.ok(figures[index].includes(amount));
  assert.match(await exact.locator('dt').nth(2).innerText(), /计算值|calculated/);
  await exact.locator('summary').focus();
  await stage.page().keyboard.press('Enter');
  check(
    `${name}: short approximate amounts share a clear unit and native expansion retains all original precision, with the difference labeled as calculated`
  );
}
async function financeAmountsFit(page, name) {
  const measured = await page.locator('.signal-finance-facts dd > span').evaluateAll((elements) =>
    elements.map((element) => {
      const amount = element.getBoundingClientRect();
      const cell = element.parentElement.getBoundingClientRect();
      return {
        text: element.textContent,
        left: amount.left,
        right: amount.right,
        cellLeft: cell.left,
        cellRight: cell.right,
      };
    })
  );
  assert.equal(measured.length, 2);
  for (const amount of measured) {
    assert.ok(
      amount.left >= amount.cellLeft - 1 && amount.right <= amount.cellRight + 1,
      `${name} clips a financial amount: ${JSON.stringify(amount)}`
    );
  }
  check(`${name}: compact financial amounts fit their containing cells without clipping`);
}
async function dynamicReducedMotion(page, name) {
  const position = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), position);
  const surface = await canvasStamp(page);
  await page.mouse.move(30, 200);
  await page.mouse.move(page.viewportSize().width - 30, 200);
  await page.waitForTimeout(120);
  assert.equal(await canvasStamp(page), surface);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), position);
  check(
    `${name}: changing reduced motion preserves native reading position and pauses decorative canvas`
  );
}
async function staticSignalStage(page, name) {
  await scrollScene(page, '.showcase-signal-stage', 110);
  const stage = page.locator('.showcase-signal-stage[data-signal-ready="true"]');
  await stage.waitFor();
  assert.equal(await stage.getAttribute('data-signal-motion'), 'paused');
  const surface = stage.locator('canvas.signal-field');
  const before = await surface.evaluate((canvas) => canvas.toDataURL());
  await page.mouse.move(24, 200);
  await page.mouse.move(page.viewportSize().width - 24, 300);
  await page.waitForTimeout(180);
  assert.equal(await surface.evaluate((canvas) => canvas.toDataURL()), before);
  await historicalCompactAmounts(stage, name);
  await noOverflow(page, `${name} reduced-motion signal stage`);
  await capture(page, `${name}-signal-reduced`);
  check(
    `${name}: reduced-motion information stage stays static with compact historical amounts and full-precision native detail`
  );
}
async function evidenceExample(page, name) {
  const trigger = page.locator('.lite-search-modes a[href*="view=example"]');
  const writesBefore = receipt.researchWrites.length;
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => url.searchParams.get('view') === 'example');
  await page.locator('.lite-search-example').waitFor();
  assert.equal(await page.locator('.lite-search-view').isVisible(), false);
  assert.equal(await page.locator('.lite-search-guide').count(), 0);
  assert.equal(await trigger.getAttribute('aria-current'), 'page');
  await signalChannels(page, name);
  const scannerDetails = page.locator('.lite-search-scanner-panel');
  await scannerDetails.locator('summary').focus();
  await page.keyboard.press('Enter');
  await page.locator('.showcase-scan-control input[type="range"]').waitFor();
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
  assert.ok(originals[1].src.includes('page-191'));
  assert.ok(originals.every((image) => image.alt?.length));
  assert.match(await scannerDetails.innerText(), /固定历史示例|Fixed historical example/);
  assert.match(await scannerDetails.innerText(), /合并口径.*人民币|consolidated.*CNY/);
  const scanner = page.locator('.showcase-source-scanner');
  const range = scanner.locator('input[type="range"]');
  const overlay = scanner.locator('.lite-search-scanner-overlay');
  const exactAmounts = await page.locator('.signal-finance-facts').innerText();
  const before = Number(await range.inputValue());
  const clipBefore = await overlay.evaluate((element) => getComputedStyle(element).clipPath);
  await range.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(Number(await range.inputValue()), before + 1);
  assert.equal(
    (await scanner.evaluate((element) => element.style.getPropertyValue('--scan-position'))).trim(),
    `${before + 1}%`
  );
  assert.notEqual(
    await overlay.evaluate((element) => getComputedStyle(element).clipPath),
    clipBefore
  );
  await page.keyboard.press('Home');
  assert.equal(await range.inputValue(), '8');
  await capture(page, `${name}-historical-reveal-left`);
  await page.keyboard.press('End');
  assert.equal(await range.inputValue(), '92');
  await capture(page, `${name}-historical-reveal-right`);
  assert.equal(await page.locator('.signal-finance-facts').innerText(), exactAmounts);
  assert.match(
    await scanner.locator('#showcase-scan-note').innerText(),
    /两页独立原文|Separate original pages/
  );
  await noOverflow(page, `${name} historical scanner`);
  if (page.viewportSize().width <= 440) await dynamicReducedMotion(page, name);
  check(
    `${name}: native historical example is a separate destination; keyboard scanner reveals loaded original pages without changing exact amounts`
  );
  await page.locator('.lite-search-modes a[href*="view=guide"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => url.searchParams.get('view') === 'guide');
  const guide = page.locator('.lite-search-guide');
  await guide.waitFor();
  assert.equal(await page.locator('.lite-search-example').count(), 0);
  assert.equal(await page.locator('.lite-search-view').isVisible(), false);
  assert.equal(await guide.locator('.lite-search-guide-cards > li').count(), 3);
  await noOverflow(page, `${name} independent reading guide`);
  await capture(page, `${name}-reading-guide`);
  await guide.locator('.lite-search-guide-actions a[href*="#showcase-query"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => !url.searchParams.has('view') && url.hash === '#showcase-query');
  await page.waitForFunction(
    () => document.activeElement === document.querySelector('.showcase-search textarea')
  );
  assert.equal(receipt.researchWrites.length, writesBefore);
  check(
    `${name}: native reading-guide link returns to and focuses the genuine search composer without research submission`
  );
}
async function capture(page, name) {
  await page.waitForFunction(() =>
    [
      ...document.querySelectorAll(
        '.lite-search-detail-heading, .lite-search-guide-cards [data-lite-card]'
      ),
    ]
      .filter((node) => node.getClientRects().length)
      .every((node) => Number(getComputedStyle(node).opacity) > 0.99)
  );
  const filename = `${name}.png`;
  await page.screenshot({
    path: path.join(output, filename),
    animations: 'disabled',
  });
  receipt.screenshots.push({
    file: filename,
    viewport: page.viewportSize(),
    deviceScaleFactor: 1,
    url: new URL(page.url()).pathname + new URL(page.url()).search + new URL(page.url()).hash,
    theme: await page.locator('html').getAttribute('data-theme'),
    locale: await page
      .locator('.showcase-home, .company-query-page, .lite-research')
      .first()
      .getAttribute('data-locale'),
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
  measureSignal = false,
} = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme,
    reducedMotion,
  });
  if (measureSignal)
    await context.addInitScript(() => {
      const clear = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        if (this.canvas.closest('.lite-company-stage'))
          this.canvas.dataset.browserQaPaints = String(
            Number(this.canvas.dataset.browserQaPaints || 0) + 1
          );
        return clear.apply(this, args);
      };
    });
  await context.addInitScript((language) => {
    if (!localStorage.getItem('cashlens-locale')) localStorage.setItem('cashlens-locale', language);
  }, locale);
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
        /^\/api\/(company-runs|company-gaps|assistant)(?:\/|$)/.test(url.pathname)
      ) {
        receipt.researchWrites.push({
          pathname: url.pathname,
          method: request.method(),
        });
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    }
  });
  const page = await context.newPage();
  currentPage = page;
  page.on('pageerror', (error) => receipt.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const url = new URL(message.location().url || base, base);
      if (
        url.pathname === '/api/companies/search' &&
        url.searchParams.get('q') === 'CI读取失败验证样本' &&
        /503/.test(message.text())
      )
        receipt.injectedReadFailures.push({
          kind: 'expected-console',
          message: message.text(),
          pathname: url.pathname,
        });
      else receipt.consoleErrors.push(message.text());
    }
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (
      response.status() === 503 &&
      url.pathname === '/api/companies/search' &&
      url.searchParams.get('q') === 'CI读取失败验证样本'
    )
      receipt.injectedReadFailures.push({
        kind: 'expected-response',
        status: 503,
        pathname: url.pathname,
      });
    else if (response.status() >= 400)
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
    const scene = document.querySelector('.showcase-hermes[data-ambient-ready="true"]');
    const surface = scene?.querySelector('canvas');
    const description = document.querySelector('.lite-search-description');
    return (
      scene &&
      surface &&
      surface.width > 0 &&
      surface.height > 0 &&
      description &&
      Number(getComputedStyle(description).opacity) > 0.99
    );
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('.lite-search-letter')).every((letter) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(letter).transform);
      return Math.abs(matrix.m42) < 0.01 && matrix.m22 > 0.9999;
    })
  );
  return { page, context };
}
// This provider is confined to two local synthetic identities. The real bundled
// issuer directory remains installed for the existing search acceptance checks.
const channelIdentities = [
  {
    securityCode: '601234',
    orgId: 'syntheticuiorg',
    shortName: '合成甲企业（非真实企业）',
    companyName: '合成甲企业（非真实企业）',
    exchange: 'sse',
    sourceUrl: 'https://example.invalid/601234/identity',
  },
  {
    securityCode: '601235',
    orgId: 'syntheticsecondorg',
    shortName: '合成乙企业（非真实企业）',
    companyName: '合成乙企业（非真实企业）',
    exchange: 'sse',
    sourceUrl: 'https://example.invalid/601235/identity',
  },
];
let demoSnapshot;
let deriveAssessment;
function channelSnapshot(identity) {
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
  const urls = Object.fromEntries(
    Object.entries(tables).map(([table, reportName]) => [
      table,
      `https://datacenter.eastmoney.com/api/data/v1/get?reportName=${reportName}&syntheticCode=${identity.securityCode}`,
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
function channelSearch(query) {
  return Promise.resolve({
    query,
    candidates: channelIdentities
      .filter((identity) => identity.securityCode === query.trim())
      .map((identity) => structuredClone(identity)),
    limitedToListed: true,
    source: 'cninfo',
    truncated: false,
  });
}
async function compactHomeModes(page, name) {
  const measured = await page.locator('.lite-search-modes').evaluate((nav) => ({
    width: nav.getBoundingClientRect().width,
    links: [...nav.querySelectorAll('a')].map((link) => {
      const box = link.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(link);
      return {
        height: box.height,
        left: box.left,
        right: box.right,
        text: [...range.getClientRects()].map((r) => ({ left: r.left, right: r.right })),
      };
    }),
  }));
  assert.ok(measured.width <= 341, `${name}: mode rail wider than 340px: ${measured.width}`);
  assert.equal(measured.links.length, 3);
  for (const link of measured.links) {
    assert.ok(link.height >= 43.5, `${name}: mode hit target below 44px`);
    for (const text of link.text)
      assert.ok(
        text.left >= link.left - 1 && text.right <= link.right + 1,
        `${name}: mode label clipped`
      );
  }
  check(`${name}: three compact native destinations have 44px targets and complete labels`);
}
async function companyChannelsAcceptance() {
  const { page, context } = await openContext({
    locale: 'en',
    reducedMotion: 'reduce',
    measureSignal: true,
  });
  const account = await (await context.request.get(`${base}/api/auth/session`)).json();
  assert.equal(account.user.isGuest, true);
  const saved = [];
  for (const identity of channelIdentities) {
    const response = await context.request.post(`${base}/api/company-runs`, {
      headers: {
        Origin: base,
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-Token': account.csrfToken,
      },
      data: {
        securityCode: identity.securityCode,
        orgId: identity.orgId,
        year: 2025,
        purpose: 'external',
        researchMode: 'financial',
      },
    });
    assert.equal(response.status(), 202, await response.text());
    const created = await response.json();
    await application.waitForIdle();
    const run = await (await context.request.get(`${base}/api/company-runs/${created.id}`)).json();
    assert.equal(run.status, 'ready');
    assert.equal(run.identity.securityCode, identity.securityCode);
    assert.equal(run.context.securityCode, identity.securityCode);
    // Pure rule derivation is a synthetic saved-assessment GET overlay. The
    // owning record and its context were created by the real local store above.
    run.assessment = deriveAssessment(run);
    run.assessmentStatus = 'ready';
    run.assessment.model = { status: 'not-configured' };
    saved.push(run);
    receipt.syntheticCompanyRecords.push({
      runId: run.id,
      securityCode: identity.securityCode,
      owner: account.user.id,
      year: run.input.year,
      snapshot: run.context.fetchedAt,
      generation: run.assessment.generatedAt,
      modelCalls: 0,
      financialRetrievalCalls: 0,
    });
  }
  const records = new Map(saved.map((run) => [run.id, run]));
  await context.route('**/api/company-runs/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const run = records.get(url.pathname.slice('/api/company-runs/'.length));
    if (request.method() === 'GET' && run)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(run),
      });
    else await route.fallback();
  });
  check(
    'Two distinct local owning company records use explicit synthetic snapshots and pure rules, with zero retrieval/model calls'
  );
  const href = (run, page = 'finance', basis = 'consolidated') =>
    `${base}/company?run=${run.id}&experience=lite&page=${page}&basis=${basis}`;
  const screen = () => page.locator('.lite-company-screen');
  const stage = () => screen().locator('.lite-company-stage');
  async function stable(run, channel, basis = 'consolidated') {
    await page
      .locator(
        `.lite-research[data-run-id="${run.id}"][data-reading-page="${channel}"][data-basis="${basis}"]`
      )
      .waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
      const node = document.querySelector(
        '.lite-company-screen .signal-channel-panel:not([hidden])'
      );
      if (!node) return false;
      const targets = [node, ...node.querySelectorAll('h2,dl,li')];
      return targets.every((target) => Number(getComputedStyle(target).opacity) > 0.99);
    });
    assert.equal(await screen().locator('[data-company-channel]:visible').count(), 1);
    assert.equal(await stage().locator('nav a[aria-current="page"]').count(), 1);
    assert.equal(
      await page.locator('.lite-research').getAttribute('data-report-generation'),
      run.assessment.generatedAt
    );
    assert.equal(await page.locator('.lite-research').getAttribute('data-snapshot'), 'current');
    assert.equal(run.assessment.snapshotFetchedAt, run.context.fetchedAt);
    assert.ok((await screen().innerText()).includes(run.identity.shortName));
    assert.ok(!(await screen().innerText()).includes('松原'));
    assert.equal(
      await screen()
        .locator('img[src*="songyuan"],img[src*="page-190"],img[src*="page-191"]')
        .count(),
      0
    );
    assert.equal(await page.locator('[data-lite-print-document]').isVisible(), false);
  }
  for (const [index, run] of saved.entries()) {
    await page.goto(href(run), { waitUntil: 'networkidle' });
    await stable(run, 'finance');
    const expected =
      index === 0
        ? { profit: '100000.00', cash: '60000.00', delta: '40000.00', parent: '70000.00' }
        : { profit: '2000000.00', cash: '3000000.00', delta: '-1000000.00', parent: '1500000.00' };
    assert.equal(
      await stage().locator('[data-company-field=netProfit] dd').getAttribute('data-exact-yuan'),
      expected.profit
    );
    assert.equal(
      await stage().locator('[data-company-field=ocf] dd').getAttribute('data-exact-yuan'),
      expected.cash
    );
    const widths = await stage()
      .locator('.signal-bar')
      .evaluateAll((bars) =>
        bars.map((bar) => parseFloat(bar.style.getPropertyValue('--signal-bar-width')))
      );
    assert.equal(widths.length, 2);
    assert.ok(
      Math.abs(widths[0] / widths[1] - Number(expected.profit) / Number(expected.cash)) < 0.001
    );
    await stage().locator('.signal-scene-controls button').nth(1).click();
    assert.equal(
      await stage().locator('.signal-difference-amount').getAttribute('data-exact-yuan'),
      expected.delta
    );
    await stage().locator('.signal-exact-data summary').click();
    const disclosed = await stage().locator('.signal-exact-data dl dd').allTextContents();
    assert.deepEqual(
      disclosed.map((text) => text.replace(/CNY|[,\s]/g, '')),
      [expected.profit, expected.cash, expected.delta]
    );
    const sources = await stage()
      .locator('.lite-company-amount-sources a')
      .evaluateAll((anchors) => anchors.map((anchor) => anchor.href));
    assert.equal(sources.length, 2);
    assert.ok(
      sources.every(
        (url) => new URL(url).searchParams.get('syntheticCode') === run.input.securityCode
      )
    );
    check(
      `${run.input.securityCode}: own exact finance, signed difference, same amount scale and field-specific source URLs`
    );
    await capture(page, `company-${run.input.securityCode}-finance-1440-en`);
    for (const channel of ['public', 'reputation', 'original']) {
      const next = stage().locator(`nav a[href*="page=${channel}"]`);
      await next.focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(href(run, channel));
      await stable(run, channel);
      assert.equal(
        await stage()
          .locator('[data-lite-page-title]:visible')
          .evaluate((node) => node === document.activeElement),
        true
      );
      if (channel === 'public') {
        assert.ok(
          (await screen().innerText()).includes(
            `Synthetic ${run.input.securityCode} public disclosure`
          )
        );
        await screen().locator('.lite-company-signal-detail summary:visible').first().click();
        assert.ok(
          (await screen().innerText()).includes(
            `Literal synthetic ${run.input.securityCode} disclosure excerpt`
          )
        );
        assert.equal(
          await screen().locator('.lite-company-signal-source').first().getAttribute('href'),
          `https://example.invalid/${run.input.securityCode}/public`
        );
      }
      if (channel === 'reputation') {
        const text = await screen().innerText();
        assert.ok(text.includes(`Synthetic ${run.input.securityCode} media headline`));
        assert.ok(text.includes(`Synthetic ${run.input.securityCode} public opinion`));
        assert.ok(!text.includes('FOREIGN_ISSUER_DISCUSSION_MUST_STAY_ABSENT'));
        for (const detail of await screen()
          .locator('.lite-company-signal-detail summary:visible')
          .all())
          await detail.click();
        assert.ok(
          (await screen().innerText()).includes(
            `Literal synthetic ${run.input.securityCode} public opinion; unverified.`
          )
        );
      }
      if (channel === 'original') {
        const original = stage().locator('.lite-company-original');
        if (index === 0) {
          assert.ok((await original.innerText()).includes('No usable original-document address'));
          assert.equal(await original.locator('a').count(), 0);
        } else
          assert.equal(
            await original.locator('a').getAttribute('href'),
            `https://example.invalid/${run.input.securityCode}/2025-synthetic-annual.pdf`
          );
      }
      await page.reload({ waitUntil: 'networkidle' });
      await stable(run, channel);
      check(
        `${run.input.securityCode}: native ${channel} URL, direct refresh, selected focus and issuer-bound saved content`
      );
      if (index === 0) await capture(page, `company-${channel}-1440-en`);
    }
    await page.goBack({ waitUntil: 'networkidle' });
    await stable(run, 'reputation');
    await page.goForward({ waitUntil: 'networkidle' });
    await stable(run, 'original');
    check(
      `${run.input.securityCode}: Back and Forward restore the actual selected native channel without research writes`
    );
  }
  const run = saved[0];
  for (const [old, channel] of [
    ['overview', 'finance'],
    ['numbers', 'finance'],
    ['sources', 'original'],
    ['questions', 'reputation'],
  ]) {
    await page.goto(href(run, old), { waitUntil: 'networkidle' });
    await stable(run, channel);
  }
  for (const [hash, channel] of [
    ['lite-judgment', 'finance'],
    ['lite-numbers', 'finance'],
    ['lite-sources', 'original'],
    ['lite-questions', 'reputation'],
  ]) {
    await page.goto(`${href(run, 'finance')}#${hash}`, { waitUntil: 'networkidle' });
    await stable(run, channel);
    assert.equal(new URL(page.url()).searchParams.get('page'), channel);
  }
  check(
    'All four legacy page names and chapter hashes resolve to their canonical company channels'
  );
  await page.goto(href(saved[1], 'finance', 'parent'), { waitUntil: 'networkidle' });
  await stable(saved[1], 'finance', 'parent');
  assert.equal(
    await stage().locator('[data-company-field=parentProfit] dd').getAttribute('data-exact-yuan'),
    '1500000.00'
  );
  for (const channel of ['public', 'reputation', 'original']) {
    await stage().locator(`nav a[href*="page=${channel}"]`).click();
    await stable(saved[1], channel, 'parent');
    assert.equal(new URL(page.url()).searchParams.get('basis'), 'parent');
  }
  check(
    'Attributable profit and every native channel retain the same owning record, year, snapshot, generation and selected basis'
  );
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('.showcase-search-history').waitFor();
  const recentLinks = page.locator('.showcase-search-history a');
  for (const issuer of saved) {
    const link = recentLinks.filter({ hasText: issuer.identity.shortName });
    assert.equal(await link.count(), 1);
    await link.click();
    await stable(issuer, 'finance');
    await page.goto(base, { waitUntil: 'networkidle' });
  }
  check(
    'Real owner-scoped recent-company links switch between the two actual local records without substituting another issuer'
  );
  for (const [width, locale] of [
    [320, 'zh-Hans'],
    [390, 'en'],
    [1024, 'en'],
  ]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.evaluate((language) => localStorage.setItem('cashlens-locale', language), locale);
    for (const channel of ['finance', 'public', 'reputation', 'original']) {
      await page.goto(href(saved[1], channel), { waitUntil: 'networkidle' });
      await stable(saved[1], channel);
      await noOverflow(page, `${width}px ${locale} company ${channel}`);
      const geometry = await stage()
        .locator('nav a')
        .evaluateAll((anchors) =>
          anchors.map((anchor) => {
            const rect = anchor.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(anchor);
            return {
              left: rect.left,
              right: rect.right,
              height: rect.height,
              text: [...range.getClientRects()].map((r) => ({ left: r.left, right: r.right })),
            };
          })
        );
      assert.equal(geometry.length, 4);
      const navBox = await stage().locator('nav').boundingBox();
      for (const tab of geometry) {
        assert.ok(tab.height >= 43.5);
        for (const line of tab.text)
          assert.ok(
            line.left >= navBox.x - 1 && line.right <= navBox.x + navBox.width + 1,
            `${width} ${channel}: cropped tab label ${JSON.stringify(tab)}`
          );
      }
      for (let i = 1; i < geometry.length; i++)
        assert.ok(
          Math.max(...geometry[i - 1].text.map((line) => line.right)) <=
            Math.min(...geometry[i].text.map((line) => line.left)) + 1,
          `${width} ${channel}: adjacent native labels overlap`
        );
      assert.equal(await page.locator('.lite-research').getAttribute('data-locale'), locale);
      if (channel === 'finance') await capture(page, `company-finance-${width}-${locale}`);
    }
  }
  await page.goto(href(saved[1]), { waitUntil: 'networkidle' });
  await stable(saved[1], 'finance');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => window.scrollTo(0, 180));
  const canvas = stage().locator('canvas.signal-field');
  const normalPaints = Number(await canvas.getAttribute('data-browser-qa-paints'));
  await page.waitForFunction(
    (before) =>
      Number(document.querySelector('.lite-company-stage canvas')?.dataset.browserQaPaints) >
      before,
    normalPaints
  );
  const readingY = await page.evaluate(() => scrollY);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
  assert.equal(await page.evaluate(() => scrollY), readingY);
  const reducedPaints = Number(await canvas.getAttribute('data-browser-qa-paints'));
  await page.waitForTimeout(150);
  assert.equal(Number(await canvas.getAttribute('data-browser-qa-paints')), reducedPaints);
  const reducedFacts = await stage()
    .locator('.signal-finance-facts > div')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node);
        return { animation: style.animationName, opacity: style.opacity };
      })
    );
  assert.ok(reducedFacts.every((fact) => fact.animation === 'none' && Number(fact.opacity) === 1));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(
    (before) =>
      Number(document.querySelector('.lite-company-stage canvas')?.dataset.browserQaPaints) >
      before,
    reducedPaints
  );
  assert.equal(await page.evaluate(() => scrollY), readingY);
  check(
    'Actual company stage normal/reduced/normal motion retains native reading position, stops decorative canvas paints and keeps exact facts legible'
  );
  await context.close();
}

try {
  const { createApp } = await import(pathToFileURL(path.join(root, 'server', 'app.ts')).href);
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
      searchCompanies: channelSearch,
      runCompanyResearch: async () => {
        throw new Error('QA prohibits model/original research');
      },
    },
    companyContextService: {
      searchCompanies: channelSearch,
      context: async (identity, options) => {
        const snapshot = channelSnapshot(identity);
        await options?.onSnapshot?.(structuredClone(snapshot));
        return snapshot;
      },
      industry: async () => {
        throw new Error('QA prohibits industry retrieval');
      },
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
  await readableComposer(page, 'desktop Lite');
  await compactHomeModes(page, '1440px home');
  await capture(page, 'lite-desktop-zh-light');
  await pointerOptics(page);
  const input = page.locator('.showcase-search textarea');
  await input.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
  );
  await input.fill('松原安全');
  assert.equal(await input.inputValue(), '松原安全');
  await input.press('Enter');
  assert.equal(new URL(page.url()).pathname, '/');
  assert.equal(receipt.researchWrites.length, 0);
  await input.fill('');
  await input.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }))
  );
  await input.blur();
  check('Native company input retains composition text; IME Enter cannot submit research');
  // These labels are present in the real bundled public catalog. Clear immediately;
  // clicking a sample only drafts its name and never submits company research.
  await page.locator('.showcase-examples button').filter({ hasText: '松原安全' }).click();
  await page.waitForFunction(() => {
    const field = document.querySelector('.showcase-search textarea');
    return field?.value === '松原安全' && document.activeElement === field;
  });
  await companyCandidates(page, 'lite-desktop-zh');
  await input.fill('');
  check('Sample company button fills and focuses the editable draft without submission');
  await matchingReadStates(page);
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
  assert.equal(await menuPro.getAttribute('href'), '/query');
  assert.match(await menuPro.innerText(), /研究工作区|Research workspace/);
  assert.equal(await menu.locator('.lite-search-navigation-links > a').count(), 3);
  assert.equal(await menu.locator('.lite-search-navigation-secondary > a').count(), 3);
  assert.equal(await menu.locator('img[src$="optical-prism.webp"]').count(), 0);
  await noOverflow(page, 'desktop full-screen menu');
  await readableDialogHeader(menu, 'Desktop navigation');
  await capture(page, 'lite-menu-zh-light');
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate((element) => document.activeElement === element), true);
  check(
    'Native navigation dialog keyboard open, real destination links, Escape and focus restoration'
  );
  await evidenceExample(page, 'lite-desktop-zh');
  await page.goto(`${base}/#showcase-evidence`, { waitUntil: 'networkidle' });
  await page.waitForURL((url) => url.searchParams.get('view') === 'example');
  await page.locator('#showcase-evidence').waitFor();
  await page.locator('.lite-search-back').click();
  await page.locator('#showcase-query textarea').waitFor();
  check('Legacy historical-example anchor opens the correct independent Lite destination');
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
  await readableComposer(mobile.page, 'mobile English dark');
  await sharedAssistant(mobile.page, '390-en', { dock: true });
  await capture(mobile.page, 'lite-mobile-en-dark');
  await mobile.page.locator('.showcase-menu-trigger').click();
  await mobile.page.getByRole('dialog', { name: 'Explore Prispect', exact: true }).waitFor();
  await noOverflow(mobile.page, 'mobile menu');
  await mobile.page.keyboard.press('Escape');
  check('390px English dark entry and mobile menu');
  await evidenceExample(mobile.page, 'lite-mobile-en-dark');
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
  await reduced.page.locator('.lite-search-modes a[href*="view=example"]').click();
  await staticSignalStage(reduced.page, '375px reduced motion');
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
  const medium = await openContext({ locale: 'en', width: 900, height: 1024 });
  await noOverflow(medium.page, '900px English Lite');
  await headerControlsFit(medium.page, '900px English Lite');
  await headlineFits(medium.page, '900px English Lite');
  await medium.page.locator('.lite-search-modes a[href*="view=example"]').click();
  await scrollScene(medium.page, '.showcase-signal-stage', 110);
  await financeAmountsFit(medium.page, '900px English signal stage');
  await capture(medium.page, 'lite-900-en-signal-finance');
  await medium.page.locator('.signal-scene-controls button').nth(1).focus();
  await medium.page.keyboard.press('Enter');
  await medium.page.locator('.signal-finance-scene[data-finance-view="difference"]').waitFor();
  await noOverflow(medium.page, '900px English financial difference');
  await capture(medium.page, 'lite-900-en-signal-difference');
  await medium.context.close();
  const exampleDesktop = await openContext({ locale: 'en', width: 1024, height: 900 });
  await exampleDesktop.page.locator('.lite-search-modes a[href*="view=example"]').click();
  await scrollScene(exampleDesktop.page, '.showcase-signal-stage', 110);
  await financeAmountsFit(exampleDesktop.page, '1024px English two-column financial example');
  await noOverflow(exampleDesktop.page, '1024px English two-column historical example');
  await capture(exampleDesktop.page, 'lite-1024-en-signal-finance');
  await exampleDesktop.context.close();
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
  await readableComposer(narrow.page, '320px English Lite');
  await sharedAssistant(narrow.page, '320-en', { dock: true });
  await compactHomeModes(narrow.page, '320px English home');
  await capture(narrow.page, 'lite-320-en-light');
  await staticOptics(narrow.page, '320px reduced motion');
  await narrow.page.locator('.showcase-examples button').filter({ hasText: '松原安全' }).click();
  await companyCandidates(narrow.page, 'lite-320-en-light');
  await narrow.page.locator('.showcase-search textarea').fill('');
  await emptyRecentReports(narrow.page, 'lite-320-en-light');
  await narrow.page.setViewportSize({ width: 320, height: 520 });
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
  await readableDialogHeader(narrowMenu, '320px short navigation');
  const dialogBounds = await narrowMenu.boundingBox();
  assert.ok(dialogBounds && dialogBounds.y >= 0 && dialogBounds.y + dialogBounds.height <= 522);
  await capture(narrow.page, 'lite-menu-320-en-light');
  await narrow.page.keyboard.press('Escape');
  await narrowMenu.waitFor({ state: 'hidden' });
  assert.equal(await narrowTrigger.evaluate((element) => document.activeElement === element), true);
  check('320px English menu confines Tab/Shift+Tab focus and restores its trigger');
  await narrow.page.locator('.experience-switch a').filter({ hasText: 'Pro' }).click();
  await narrow.page.waitForURL(`${base}/query`);
  await narrow.page.waitForFunction(() => {
    const input = document.querySelector('.company-query-page textarea');
    return input && !input.disabled;
  });
  await sharedAssistant(narrow.page, '320-en-pro', { dock: true });
  await headerControlsFit(narrow.page, '320px English Pro');
  await noOverflow(narrow.page, '320px English Pro');
  await capture(narrow.page, 'pro-query-320-en-shared-assistant');
  await narrow.context.close();
  await companyChannelsAcceptance();
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
  check(
    'Zero unexpected console/page/network errors, external source/model attempts or research writes; deliberate metadata failure remains recorded'
  );
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
