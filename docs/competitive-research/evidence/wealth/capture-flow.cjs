const { chromium } = require('playwright'),
  fs = require('fs');
const out = '/workspace/prispect-improve/docs/competitive-research/evidence/wealth';
(async () => {
  const b = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 1100 } });
  const trace = [],
    errors = [],
    requests = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('request', (r) => requests.push(r.url()));
  await p.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 });
  });
  await p.goto('http://127.0.0.1:4404/xray.html', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  trace.push({ event: 'loaded', diag: await p.evaluate(() => window.__solDiag) });
  await p.evaluate(() => {
    XRAY.renderer.setPixelRatio(0.5);
  });
  trace.push({
    event: 'runtime-instrumentation',
    note: '软件GPU采用公开renderer API DPR=0.5；截图用于交互状态，不用于画质评价。',
  });
  await p.click('[data-mode="demo"]');
  await p.evaluate(() => XRAY_SLIDES.close());
  trace.push({
    event: 'onboarding-skip-debug',
    note: '前一run已UI完成两页；本run公开调试API跳过以验证自然游戏路径',
  });
  await p.waitForFunction(() => document.querySelector('#phaseText').innerText.includes('掷骰'), {
    timeout: 60000,
  });
  await p.screenshot({ path: out + '/09-city-ready-low-render.png', animations: 'disabled' });
  let capturedQuiz = false,
    capturedFeedback = false;
  for (let iter = 0; iter < 240; iter++) {
    const s = await p.evaluate(() => ({
      quiz: !document.querySelector('#quizModal').classList.contains('hidden'),
      hasChoices: !!document.querySelector('#quizStep2 .opt'),
      hasVerdict: !!document.querySelector('#quizVerdict').innerText,
      sol: document.querySelector('#solMask')?.classList.contains('on'),
      dir: !document.querySelector('#dirPad').classList.contains('hidden'),
      dirs: [...document.querySelectorAll('#dirPad .dp')]
        .filter((x) => !x.disabled)
        .map((x) => x.dataset.dir),
      buy:
        !document.querySelector('#buyBtn').classList.contains('hidden') &&
        !document.querySelector('#buyBtn').disabled,
      roll:
        !document.querySelector('#rollBtn').classList.contains('hidden') &&
        !document.querySelector('#rollBtn').disabled,
      end: !document.querySelector('#endTurnBtn').disabled,
      over: !document.querySelector('#endModal').classList.contains('hidden'),
      phase: document.querySelector('#phaseText').innerText,
      round: GAME.STATE.round,
      tile: XRAY_SOL.vt[GAME.STATE.pos[0]],
      text: document.querySelector('#hintText').innerText,
    }));
    trace.push({ iter, ...s });
    if (s.over) {
      await p.waitForTimeout(1200);
      await p.screenshot({ path: out + '/13-end-recap.png', animations: 'disabled' });
      break;
    }
    if (s.sol) {
      await p.screenshot({ path: out + '/12-solution-natural.png', animations: 'disabled' });
      await p.click('#solOk');
    } else if (s.quiz && s.hasVerdict) {
      if (!capturedFeedback) {
        await p.screenshot({ path: out + '/11-verdict-natural.png', animations: 'disabled' });
        capturedFeedback = true;
      }
      const btn = p.locator('#solBtn');
      if (await btn.count()) {
        await btn.click();
        await p.screenshot({ path: out + '/12-solution-natural.png', animations: 'disabled' });
        await p.click('#solOk');
      }
      const cont = p.locator('#quizFoot button').filter({ hasText: '继续' });
      if (await cont.count()) await cont.click();
    } else if (s.quiz && s.hasChoices) {
      if (!capturedQuiz) {
        await p.screenshot({ path: out + '/10-quiz-natural.png', animations: 'disabled' });
        capturedQuiz = true;
      }
      await p.click('#quizStep2 .opt[data-a="pass"]');
    } else if ((s.dir || s.text.includes('可走方向')) && s.dirs.length) {
      if (s.dir) await p.click('#dirPad .dp[data-dir="' + s.dirs[0] + '"]');
      else
        await p.keyboard.press(
          { up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', down: 'ArrowDown' }[s.dirs[0]]
        );
    } else if (s.buy) {
      await p.click('#buyBtn');
    } else if (s.end) {
      await p.click('#endTurnBtn');
    } else if (s.roll) {
      await p.click('#rollBtn');
    }
    await p.waitForTimeout(650);
  }
  await p.evaluate(() => XRAY.solution('汇金财富'));
  await p.waitForTimeout(1200);
  await p.screenshot({ path: out + '/14-solution-stable.png', animations: 'disabled' });
  await p.click('#solOk');
  await p.click('#xray5-btn');
  await p.waitForTimeout(350);
  await p.screenshot({ path: out + '/15-five-step-start.png', animations: 'disabled' });
  for (let i = 0; i < 4; i++) await p.click('#xray5-card [data-act="next"]');
  await p.click('#xray5-card [data-v="yellow"]');
  await p.screenshot({ path: out + '/16-five-step-uncertain.png', animations: 'disabled' });
  trace.push({
    event: 'five-step-uncertain-feedback',
    text: await p.locator('#xray5-card').innerText(),
  });
  fs.writeFileSync(
    out + '/natural-flow-log.json',
    JSON.stringify(
      {
        sha: 'ee59d8b79c597aa2932d43456cba9752462b09bd',
        recorded_at: new Date().toISOString(),
        run_mode: 'fixture gameplay; DPR instrumented; onboarding skip debug disclosed',
        trace,
        errors,
        requests,
      },
      null,
      2
    )
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
