import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';

test('deep links serve the SPA on refresh while missing APIs keep JSON errors', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'prispect-routing-'));
  const html = '<!doctype html><title>Prispect routing fixture</title>';
  await mkdir(path.join(root, 'dist'));
  await mkdir(path.join(root, 'dist/assets'));
  await writeFile(path.join(root, 'dist/index.html'), html);
  await writeFile(path.join(root, 'dist/appearance-init.js'), '/* appearance fixture */');
  await writeFile(path.join(root, 'dist/assets/page-abcdefgh.js'), 'export const page = 1;');
  await writeFile(path.join(root, 'RELEASE.json'), JSON.stringify({ commit: 'a'.repeat(40) }));
  await symlink(path.join(process.cwd(), 'data'), path.join(root, 'data'), 'dir');
  const service = await createApp({ root, dataDir: path.join(root, 'state'), model: {} });
  const server = service.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const health = await fetch(base + '/api/health');
    assert.deepEqual(await health.json(), { ok: true });
    assert.equal(health.headers.get('x-prispect-release'), 'a'.repeat(40));
    assert.match(health.headers.get('x-prispect-storage')!, /^(healthy|pressure|unknown)$/);
    for (const route of [
      '/',
      '/index.html',
      '/docs',
      '/privacy?section=ai',
      '/account',
      '/tasks/report-id',
    ]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get('content-type')!, /text\/html/);
      assert.equal(response.headers.get('cache-control'), 'no-store', route);
      assert.equal(await response.text(), html);
    }
    const appearance = await fetch(base + '/appearance-init.js');
    assert.equal(appearance.status, 200);
    assert.equal(appearance.headers.get('cache-control'), 'no-store');
    const asset = await fetch(base + '/assets/page-abcdefgh.js');
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.match(asset.headers.get('content-type')!, /javascript/);
    assert.equal(await asset.text(), 'export const page = 1;');
    for (const route of ['/assets/missing.js', '/assets/missing.css']) {
      const missingAsset = await fetch(base + route);
      assert.equal(missingAsset.status, 404);
      assert.equal(missingAsset.headers.get('cache-control'), 'no-store');
      assert.match(missingAsset.headers.get('content-type')!, /application\/json/);
      assert.equal((await missingAsset.json()).code, 'FRONTEND_ASSET_NOT_FOUND');
    }
    const malformedPath = await fetch(base + '/tasks/%E0%A4%A');
    assert.equal(malformedPath.status, 400);
    assert.equal((await malformedPath.json()).code, 'INVALID_PATH');
    const anonymous = await fetch(base + '/api/no-such-endpoint');
    assert.equal(anonymous.status, 401);
    assert.match(anonymous.headers.get('content-type')!, /application\/json/);
    const registration = await fetch(base + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'routing@example.test',
        name: '路由测试',
        password: 'test-strong-password',
      }),
    });
    assert.equal(registration.status, 201);
    const cookie = registration.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const missing = await fetch(base + '/api/no-such-endpoint', { headers: { Cookie: cookie } });
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).code, 'ENDPOINT_NOT_FOUND');
  } finally {
    await service.waitForIdle();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    service.auth.close();
    await rm(root, { recursive: true, force: true });
  }
});
