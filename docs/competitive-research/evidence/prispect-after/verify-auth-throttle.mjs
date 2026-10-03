// One actual attempt against the persisted test-account throttle; do not reset limits.
import { chromium } from '/workspace/prispect-improve/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:4320',
  out = '/workspace/prispect-improve/docs/competitive-research/evidence/prispect-after';
const account = JSON.parse(
  await readFile('/workspace/research-envs/prispect-after-account.json', 'utf8')
);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
try {
  await page.goto(base + '/login?next=/decisions');
  await page.locator('input[name=email]').fill(account.email);
  await page.locator('input[name=password]').fill(account.password);
  const response = page.waitForResponse(
    (r) => r.url() === base + '/api/auth/login' && r.request().method() === 'POST'
  );
  await page.getByRole('button', { name: '登录', exact: true }).click();
  const r = await response;
  const body = await r.json();
  assert.equal(r.status(), 429);
  assert.equal(body.code, 'RATE_LIMITED');
  await page.getByText('尝试过于频繁，请稍后重试', { exact: false }).waitFor();
  await page.screenshot({ path: out + '/auth-real-throttle-390.png', fullPage: true });
  assert.equal(await page.locator('input[name=email]').inputValue(), account.email);
  assert.equal(await page.locator('input[name=password]').inputValue(), account.password);
  assert.equal(new URL(page.url()).pathname, '/login');
  await writeFile(
    out + '/auth-real-throttle.json',
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        status: r.status(),
        code: body.code,
        message: body.error,
        inputsRetained: true,
        noNavigation: true,
        kind: 'actual-persisted-controlled-account-login-throttle',
        limitsNotModified: true,
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
