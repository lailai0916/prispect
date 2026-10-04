/** Isolated recovery UI check. No real mail, production data or external providers. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:4339';
process.env.APP_ORIGIN = base;
process.env.NODE_ENV = 'test';
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString('hex');
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'prispect-recovery-browser-'));
const output = path.resolve('output/browser-qa/reliability');
await mkdir(output, { recursive: true });
const { createApp } = await import('../server/app.ts');
const application = await createApp({ dataDir, model: {} });
const server = application.app.listen(4339, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const receipt = {
  synthetic: true,
  checks: [],
  screenshots: [],
  pageErrors: [],
  externalServices: false,
};
let browser;
try {
  const oldPassword = 'Copper!fjord7-Unusual-velvet';
  const newPassword = 'Orbit!canyon8-Cobalt-sparrow';
  const email = 'browser-recovery@example.test';
  const register = await fetch(base + '/api/auth/register', {
    method: 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: oldPassword, name: 'Isolated recovery' }),
  });
  assert.equal(register.status, 201);
  const owner = (await register.json()).user.id;
  const messages = [];
  application.auth.mail.configured = true;
  application.auth.mail.send = async (_to, _subject, text) => {
    messages.push(text);
  };
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'https://analytics.lailai.one')
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    else if (url.origin !== base) await route.abort('blockedbyclient');
    else await route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => receipt.pageErrors.push(error.message));
  await page.goto(base + '/login');
  await page.getByRole('button', { name: '忘记密码？', exact: true }).click();
  await page.locator('input[name=email]').fill(email);
  await page.getByRole('button', { name: '发送重置链接', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '如果该邮箱已注册' }).waitFor();
  assert.equal(messages.length, 1);
  receipt.checks.push('Registered email request shows a generic confirmation; mail remains local');
  const link = messages[0].split('\n').at(-1);
  await page.goto(link);
  await page.getByRole('heading', { name: '设置新密码', exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, '');
  assert.equal(new URL(page.url()).searchParams.has('token'), false);
  assert.equal(
    await page.evaluate(() => Object.values(localStorage).some((v) => v.includes('reset-token'))),
    false
  );
  receipt.checks.push(
    'Recovery credential removed before application/analytics, never saved to local storage'
  );
  const desktop = path.join(output, 'reset-desktop.png');
  await page.screenshot({ path: desktop, animations: 'disabled' });
  receipt.screenshots.push(desktop);
  await page.locator('input[name=newPassword]').fill(newPassword);
  await page.locator('input[name=confirmation]').fill('Different!river9-Lantern');
  await page.getByRole('button', { name: '重置密码', exact: true }).click();
  await page.getByText('两次输入的密码不一致。', { exact: true }).waitFor();
  receipt.checks.push('Mismatched confirmation stops submission without consuming the link');
  await page.locator('input[name=confirmation]').fill(newPassword);
  await page.getByRole('button', { name: '重置密码', exact: true }).click();
  await page.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor();
  assert.equal(await page.locator('input[name=password]').inputValue(), '');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(newPassword);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(base + '/query');
  assert.equal((await (await page.request.get(base + '/api/auth/session')).json()).user.id, owner);
  receipt.checks.push(
    'Reset clears password fields and the new password signs into the original account'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(link);
  await page.getByRole('heading', { name: '设置新密码', exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  const mobile = path.join(output, 'reset-mobile.png');
  await page.screenshot({ path: mobile, animations: 'disabled' });
  receipt.screenshots.push(mobile);
  receipt.checks.push(
    'Recovery link remains usable from an already signed-in browser; narrow layout has no horizontal overflow'
  );
  await page.locator('input[name=newPassword]').fill(oldPassword);
  await page.locator('input[name=confirmation]').fill(oldPassword);
  await page.getByRole('button', { name: '重置密码', exact: true }).click();
  await page
    .getByText(/Invalid token|无效|过期/)
    .first()
    .waitFor();
  receipt.checks.push('Consumed-link submission displays the actual error');
  assert.deepEqual(receipt.pageErrors, []);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.error = error.message;
  throw error;
} finally {
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  await browser?.close();
  await application.waitForIdle();
  await new Promise((resolve) => server.close(resolve));
  application.auth.close();
  await rm(dataDir, { recursive: true, force: true });
}
console.log(
  JSON.stringify({
    status: receipt.status,
    checks: receipt.checks.length,
    screenshots: receipt.screenshots.length,
  })
);
