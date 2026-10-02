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
  await writeFile(path.join(root, 'dist/index.html'), html);
  await symlink(path.join(process.cwd(), 'data'), path.join(root, 'data'), 'dir');
  const service = await createApp({ root, dataDir: path.join(root, 'state'), model: {} });
  const server = service.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const route of ['/docs', '/privacy?section=ai', '/account', '/tasks/report-id']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get('content-type')!, /text\/html/);
      assert.equal(await response.text(), html);
    }
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
