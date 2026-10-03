const { chromium } = require('playwright');
const fs = require('fs');
const out = '/workspace/prispect-improve/docs/competitive-research/evidence/wealth';
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const requests = [],
    errors = [],
    checks = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/')) requests.push({ method: r.method(), url: r.url() });
  });
  page.on('pageerror', (e) => errors.push(e.message));
  const assert = (condition, name) => {
    if (!condition) throw Error(name);
    checks.push({ name, passed: true });
  };
  const lab = page.getByTestId('evidence-learning');
  const open = async () => {
    if (!(await lab.evaluate((e) => e.open))) await lab.locator('summary').first().click();
  };
  const submit = async () => {
    await open();
    await lab.locator('select').selectOption('profit');
    await lab.getByRole('checkbox').nth(0).check();
    await lab.getByRole('checkbox').nth(2).check();
    await lab.getByRole('button', { name: '验证我的预测', exact: true }).click();
    await lab.locator('.learning-feedback').waitFor();
  };
  await page.goto(
    'http://127.0.0.1:4322/docs/competitive-research/evidence/wealth/learning-harness.html',
    { waitUntil: 'networkidle' }
  );
  assert((await lab.count()) === 1, 'fixture mounts actual production EvidenceLearning');
  assert(!(await lab.evaluate((e) => e.open)), 'optional disclosure starts closed');
  assert(
    (await lab.locator('.learning-recap').count()) === 0,
    'zero trials have no recap or ability rating'
  );
  // Entire interaction through native keyboard sequence after initial focus.
  await lab.locator('summary').first().focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  assert(
    (await page.evaluate(() => document.activeElement?.tagName)) === 'SELECT',
    'keyboard reaches fact select'
  );
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space'); // gap
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space'); // hypothesis
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await lab.locator('.learning-feedback').waitFor();
  assert(
    (await lab.locator('.learning-feedback h3').innerText()) === '预测与实际依赖一致',
    'keyboard prediction matches actual dependency graph'
  );
  assert(
    (await lab.locator('[data-learning-state="paused"]').count()) === 2,
    'profit trial pauses transitive gap and hypothesis only'
  );
  assert(
    (await lab.locator('[data-learning-state="available"]').count()) === 1,
    'independent calculation retained'
  );
  assert(
    (await page.evaluate(() => document.activeElement?.tagName)) === 'H3',
    'feedback receives keyboard focus'
  );
  assert(
    (await lab.locator('.learning-retained').innerText()).includes('经营现金 · 10.00 元'),
    'unaffected exact cash remains inspectable'
  );
  await lab.screenshot({
    path: out + '/prispect-learning-390-light-feedback.png',
    animations: 'disabled',
  });
  await page.keyboard.press('Tab');
  assert(
    (await page.evaluate(() => document.activeElement?.textContent))?.includes('恢复演练'),
    'next keyboard action restores practice'
  );
  await page.keyboard.press('Enter');
  assert(
    (await lab.locator('.learning-feedback').count()) === 0,
    'restore clears only local practice result'
  );
  assert(
    (await page.evaluate(() => document.activeElement?.tagName)) === 'SELECT',
    'restore returns focus to fact selection'
  );
  assert(
    (await lab.locator('.learning-recap summary').innerText()) === '当前会话复盘 · 1',
    'restored practice retains one actual memory attempt'
  );
  await page.getByRole('button', { name: '切换主题', exact: true }).click();
  await submit();
  await lab.screenshot({
    path: out + '/prispect-learning-390-dark-feedback.png',
    animations: 'disabled',
  });
  for (const action of ['换账号范围', '换期间', '换来源', '换金额', '换依赖']) {
    if (!(await lab.locator('.learning-feedback').count())) await submit();
    await page.getByRole('button', { name: action, exact: true }).click();
    assert(
      (await lab.locator('.learning-feedback').count()) === 0,
      action + ' clears prior result'
    );
    assert(
      (await lab.locator('.learning-recap').count()) === 0,
      action + ' clears prior session recap'
    );
    assert(!(await lab.evaluate((e) => e.open)), action + ' closes old disclosure by remount');
  }
  await page.getByRole('button', { name: '缺失冲突', exact: true }).click();
  await open();
  assert(
    (await lab.locator('select').count()) === 0,
    'missing and conflict facts cannot be selected'
  );
  assert(
    (await lab.getByRole('button', { name: '验证我的预测', exact: true }).count()) === 0,
    'missing and conflict graphs do not fabricate withdrawal challenge'
  );
  assert(
    (await lab.innerText()).includes('没有可用于撤回练习的来源事实'),
    'missing and conflict boundary has actionable reason'
  );
  await lab.screenshot({
    path: out + '/prispect-learning-390-dark-missing.png',
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '正常图', exact: true }).click();
  await open();
  await lab.getByRole('button', { name: '验证我的预测', exact: true }).evaluate((el) => {
    el.click();
    el.click();
  });
  assert(
    (await lab.locator('.learning-recap summary').innerText()) === '当前会话复盘 · 1',
    'duplicate submission records exactly one actual attempt'
  );
  assert(
    (await lab.locator('.learning-feedback').innerText()).includes('对照实际依赖'),
    'empty prediction receives concrete missed-dependency feedback'
  );
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ['dark', 'light']) {
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${width}px ${theme} has no horizontal page overflow`
      );
      assert(
        await lab.evaluate((e) => e.scrollWidth <= e.clientWidth),
        `${width}px ${theme} learning has no horizontal overflow`
      );
      assert(
        await lab
          .locator('.learning-comparison')
          .evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length === 1),
        `${width}px ${theme} comparison uses one readable column`
      );
      await lab.screenshot({
        path: out + `/prispect-learning-${width}-${theme}-comparison.png`,
        animations: 'disabled',
      });
    }
  }
  await page.getByRole('button', { name: '切换语言', exact: true }).click();
  assert(
    (await lab.innerText()).includes('A pause means a calculation lacks its inputs'),
    'English caveat preserves financial meaning'
  );
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    '320px English has no horizontal overflow'
  );
  await lab.screenshot({
    path: out + '/prispect-learning-320-English.png',
    animations: 'disabled',
  });
  await page.reload({ waitUntil: 'networkidle' });
  await open();
  assert(
    (await lab.locator('.learning-recap').count()) === 0,
    'refresh clears local learning memory'
  );
  assert(requests.length === 0, 'no API/model/retrieval requests from learning trial');
  assert(errors.length === 0, 'no browser page errors');
  fs.writeFileSync(
    out + '/prispect-learning-browser.json',
    JSON.stringify(
      {
        recorded_at: new Date().toISOString(),
        run_mode:
          'synthetic component fixture; actual production component; not authenticated production path',
        url: page.url(),
        checks,
        requests,
        errors,
      },
      null,
      2
    )
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
