import { chromium } from '/workspace/prispect/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const out = '/workspace/prispect-improve/docs/competitive-research/evidence/jianwei';
const browser = await chromium.launch({ headless: true });
const records = [];
for (const width of [1366, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  for (const [name, path] of [
    ['home', '/'],
    ['consumer', '/?view=consumer'],
    ['history', '/?view=history'],
    ['trade', '/?view=trade'],
  ]) {
    await page.goto('http://127.0.0.1:4403' + path);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true });
    await fs.writeFile(`${out}/${name}-${width}.txt`, await page.locator('body').innerText());
    records.push({
      name,
      width,
      path,
      overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    });
  }
  if (width === 1366) {
    await page.getByRole('button', { name: '推演这笔订单' }).click();
    await page.getByRole('button', { name: '这怎么算的' }).waitFor({ state: 'visible' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/trade-calculated.png`, fullPage: true });
    await page.getByRole('button', { name: '这怎么算的' }).click();
    await page.screenshot({ path: `${out}/trade-math.png` });
    await fs.writeFile(`${out}/trade-math.txt`, await page.getByRole('dialog').innerText());
    await page.keyboard.press('Escape');
    records.push({ name: 'math-escape', closed: (await page.getByRole('dialog').count()) === 0 });
    await page.getByRole('button', { name: '设为 30%' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/trade-30pct.png`, fullPage: true });
    await fs.writeFile(`${out}/trade-30pct.txt`, await page.locator('body').innerText());
    await page.goto('http://127.0.0.1:4403/');
    await page.getByRole('button', { name: '查工商变更' }).click();
    await page.getByRole('button', { name: '发送问题' }).click();
    await page.waitForTimeout(400);
    await page.locator('#chat').screenshot({ path: `${out}/chat-failure.png` });
    await fs.writeFile(`${out}/chat-failure.txt`, await page.locator('#chat').innerText());
  }
  await page.close();
}
await fs.writeFile(
  `${out}/browser-checks.json`,
  JSON.stringify(
    {
      sha: 'a3274e5ddafbeecf0f5cc8e35093c6d1fe1c4e53',
      captured_at: new Date().toISOString(),
      mode: 'isolated_local_database_offline_model_no_map_key',
      records,
    },
    null,
    2
  )
);
await browser.close();
