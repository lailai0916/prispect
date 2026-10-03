const { chromium } = require('playwright');
const fs = require('fs');
const out = '/workspace/prispect-improve/docs/competitive-research/evidence/wealth';
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    timeout: 20000,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  const logs = [],
    errors = [],
    requests = [];
  page.on('console', (m) => {
    logs.push({ type: m.type(), text: m.text() });
    fs.appendFileSync(out + '/console-live.txt', m.type() + ': ' + m.text() + '\n');
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method() }));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 });
  });
  await page.goto('http://127.0.0.1:4404/xray.html', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: out + '/01-start-desktop.png', fullPage: true });
  console.log(
    'start',
    await page.evaluate(() => ({
      text: document.body.innerText.slice(0, 4500),
      diag: window.__solDiag,
      keys: window.XRAY?.solKeys?.(),
      cfg: window.GAME?.CFG,
    }))
  );
  await page.click('[data-mode="guide"]');
  await page.click('#startBtn');
  await page.waitForTimeout(600);
  await page.screenshot({ path: out + '/02-onboarding-first.png', fullPage: true });
  await page.waitForTimeout(5000);
  await page.click('#xsOk');
  await page.waitForTimeout(5100);
  await page.screenshot({ path: out + '/03-onboarding-second.png', fullPage: true });
  await page.click('#xsOk');
  await page.waitForTimeout(3500);
  await page.screenshot({ path: out + '/04-city-desktop.png', fullPage: true });
  console.log(
    'city',
    await page.evaluate(() => ({
      phase: GAME.STATE.phase,
      round: GAME.STATE.round,
      player: GAME.STATE.players[0],
      keys: Object.keys(GAME.STATE),
    }))
  );
  await page.evaluate(() => XRAY.solution('汇金财富'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + '/05-solution-cash-divergence.png', fullPage: true });
  console.log('solution', await page.locator('#solBox').innerText());
  await page.click('#solOk');
  await page.keyboard.press('h');
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + '/06-manual.png', fullPage: true });
  console.log('manual', await page.evaluate(() => document.body.innerText.slice(-6500)));
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: out + '/07-city-mobile.png', fullPage: true });
  await page.evaluate(() => XRAY.solution('蓝湾冷链'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + '/08-solution-heavy-mobile.png', fullPage: true });
  fs.writeFileSync(
    out + '/runtime-log.json',
    JSON.stringify(
      {
        sha: 'ee59d8b79c597aa2932d43456cba9752462b09bd',
        url: 'http://127.0.0.1:4404/xray.html',
        recorded_at: new Date().toISOString(),
        logs,
        errors,
        requests,
      },
      null,
      2
    )
  );
  console.log('diagnostics', JSON.stringify({ errors, requests }));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
