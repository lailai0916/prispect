import { request, chromium } from '/workspace/prispect-improve/node_modules/playwright/index.mjs';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:4320';
const out = '/workspace/prispect-improve/docs/competitive-research/evidence/prispect-after';
const mode = process.argv[2] || 'before';
const account = JSON.parse(
  await readFile('/workspace/research-envs/prispect-after-account.json', 'utf8')
);
const ids = JSON.parse(await readFile(out + '/record-ids.json', 'utf8'));
const api = await request.newContext({
  baseURL: base,
  storageState: process.env.PRISPECT_STORAGE_STATE || undefined,
});
if (!process.env.PRISPECT_STORAGE_STATE) {
  const auth = await api.post('/api/auth/login', {
    data: { email: account.email, password: account.password },
  });
  assert.equal(auth.status(), 200);
  assert.equal((await auth.json()).user.id, account.userId);
} else {
  const session = await (await api.get('/api/auth/session')).json();
  assert.equal(session.user?.id, account.userId);
}
await api.storageState({ path: '/workspace/research-envs/prispect-after-owner-storage.json' });
await chmod('/workspace/research-envs/prispect-after-owner-storage.json', 0o600);
const result = {
  recordedAt: new Date().toISOString(),
  mode,
  paths: [],
  kind: 'actual-isolated-production-build-server-restart',
};
for (const path of [
  `/api/tasks/${ids.taskId}`,
  `/api/decisions/${ids.decisionId}`,
  `/api/materials/${ids.materialId}/file`,
  `/api/materials/${ids.privateMaterialId}/file`,
  `/api/materials/${ids.roleMaterialId}/file`,
]) {
  const response = await api.get(path);
  assert.equal(response.status(), 200);
  result.paths.push({
    path,
    status: response.status(),
    sha256: createHash('sha256')
      .update(await response.body())
      .digest('hex'),
  });
}
const detail = await (await api.get(`/api/decisions/${ids.decisionId}`)).json();
if (mode === 'before') {
  await writeFile(out + '/decision-before-restart.json', JSON.stringify(detail, null, 2));
} else {
  const before = JSON.parse(await readFile(out + '/restart-before.json', 'utf8'));
  for (const row of result.paths) {
    if (!row.path.includes('/api/decisions/'))
      assert.equal(row.sha256, before.paths.find((r) => r.path === row.path).sha256);
  }
  const previous = JSON.parse(await readFile(out + '/decision-before-restart.json', 'utf8'));
  assert.deepEqual(detail.decision, previous.decision);
  assert.deepEqual(detail.version, previous.version);
  assert.deepEqual(detail.evaluation.external, previous.evaluation.external);
  assert.deepEqual(detail.changes, previous.changes);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    storageState: process.env.PRISPECT_STORAGE_STATE || undefined,
  });
  const page = await context.newPage();
  if (!process.env.PRISPECT_STORAGE_STATE) {
    await page.goto(base + '/login?next=/decisions');
    await page.locator('input[name=email]').fill(account.email);
    await page.locator('input[name=password]').fill(account.password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.waitForURL((url) => url.pathname === '/decisions');
  }
  await page.goto(base + '/decisions?id=' + ids.decisionId);
  await page.waitForLoadState('networkidle');
  assert.ok((await page.getByText(detail.version.input.title, { exact: true }).count()) > 0);
  await page.locator('button[aria-controls=decision-panel-scenarios]').click();
  assert.match(await page.locator('section[aria-label="反求付款条件边界"]').innerText(), /10,000/);
  await page.screenshot({ path: out + '/27-real-server-restart-restored.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: out + '/28-small-dark-payment-boundary.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('button[aria-controls=decision-panel-history]').click();
  await page.screenshot({ path: out + '/29-small-dark-change-history.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  result.smallDarkLayoutVerified = true;
  result.browserReloadRestored = true;
  await browser.close();
}
await writeFile(out + '/restart-' + mode + '.json', JSON.stringify(result, null, 2));
await api.dispose();
