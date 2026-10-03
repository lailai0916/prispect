import { chromium } from '/workspace/prispect/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
const root = '/workspace/prispect-improve/docs/competitive-research/evidence/jianwei';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const checks = [];
for (const width of [1366, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    'http://127.0.0.1:5403/docs/competitive-research/evidence/jianwei/boundary-harness.html'
  );
  await page.getByRole('heading', { name: '自设条件留下多少付款空间' }).waitFor();
  await page.screenshot({ path: `${root}/prispect-boundary-known-${width}.png`, fullPage: true });
  const selects = page.locator('select');
  const evaluate = async (state) => {
    await selects.nth(0).selectOption(state);
    await page.waitForTimeout(100);
    const text = await page.locator('main').innerText();
    checks.push({
      width,
      state,
      overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      text,
    });
    await page.screenshot({
      path: `${root}/prispect-boundary-${state}-${width}.png`,
      fullPage: true,
    });
  };
  await page.getByRole('button', { name: '查看角色依据 1' }).nth(1).click();
  checks.push({ width, action: 'view-payee', result: await page.getByRole('status').innerText() });
  await page.getByRole('button', { name: '补充该角色依据' }).nth(1).click();
  checks.push({ width, action: 'add-payee', result: await page.getByRole('status').innerText() });
  for (const state of ['missing', 'above', 'withdrawn', 'conflict', 'mismatch', 'readonly'])
    await evaluate(state);
  checks.push({
    width,
    action: 'readonly-add-count',
    count: await page.getByRole('button', { name: '补充该角色依据' }).count(),
  });
  await selects.nth(0).selectOption('known');
  await selects.nth(1).selectOption('en');
  await selects.nth(2).selectOption('dark');
  await page.getByText('Check the formula and amounts used', { exact: true }).click();
  await page.screenshot({ path: `${root}/prispect-boundary-en-dark-${width}.png`, fullPage: true });
  checks.push({
    width,
    state: 'en-dark-expanded',
    overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    text: await page.locator('main').innerText(),
    errors,
  });
  await page.close();
}
await writeFile(
  `${root}/prispect-boundary-browser-checks.json`,
  JSON.stringify(
    {
      classification:
        'fixture interaction verification of actual production components; fictional input and simulated gates, not real evidence or user outcomes',
      checks,
    },
    null,
    2
  )
);
await browser.close();
