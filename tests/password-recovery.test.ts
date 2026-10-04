import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';

const oldPassword = 'Copper!fjord7-Unusual-velvet';
const newPassword = 'Orbit!canyon8-Cobalt-sparrow';
function totp(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret].map((c) => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from((bits.match(/.{8}/g) || []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  return ((digest.readUInt32BE(digest[19]! & 15) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, '0');
}
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-recovery-'));
  const service = await createApp({ dataDir: directory, model: {} });
  const server = service.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const cookies = new Map<string, string>();
  const call = async (url: string, body?: unknown, withCookies = false) => {
    const response = await fetch(base + url, {
      method: body ? 'POST' : 'GET',
      headers: {
        Origin: 'http://127.0.0.1:4318',
        'Content-Type': 'application/json',
        ...(withCookies ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (withCookies)
      for (const header of response.headers.getSetCookie()) {
        const [first] = header.split(';');
        const [key, ...rest] = first!.split('=');
        cookies.set(key!, rest.join('='));
      }
    return response;
  };
  return {
    ...service,
    base,
    directory,
    call,
    stop: async () => {
      await service.waitForIdle();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      service.auth.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('password recovery is unavailable without mail and rejects cross-origin writes', async () => {
  const f = await fixture();
  try {
    assert.equal((await (await f.call('/api/auth/session')).json()).passwordRecoveryEnabled, false);
    assert.equal(
      (await f.call('/api/auth/password-reset', { email: 'nobody@example.test' })).status,
      503
    );
    const response = await fetch(f.base + '/api/auth/password-reset', {
      method: 'POST',
      headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.test' }),
    });
    assert.equal(response.status, 403);
  } finally {
    await f.stop();
  }
});

test('reset links are single-use, expire, revoke sessions and preserve owner data and TOTP', async () => {
  const f = await fixture();
  try {
    const messages: { to: string; text: string }[] = [];
    f.auth.mail.configured = true;
    f.auth.mail.send = async (to, _subject, text) => {
      messages.push({ to, text });
    };
    const account = await f.call(
      '/api/auth/register',
      { email: 'owner@example.test', name: 'Recovery owner', password: oldPassword },
      true
    );
    assert.equal(account.status, 201);
    const owner = (await account.json()).user.id as string;
    const store = await f.workspaceForUser(owner);
    const before = await readFile(path.join(store.dataDir, 'workspace.json'));
    const setup = await f.call('/api/identity/two-factor/enable', { password: oldPassword }, true);
    assert.equal(setup.status, 200);
    const secret = new URL((await setup.json()).totpURI).searchParams.get('secret')!;
    assert.equal(
      (await f.call('/api/identity/two-factor/verify-totp', { code: totp(secret) }, true)).status,
      200
    );
    const factors = f.auth.db.prepare('SELECT * FROM twoFactor WHERE userId=?').get(owner);
    const known = await f.call('/api/auth/password-reset', { email: 'owner@example.test' });
    const unknown = await f.call('/api/auth/password-reset', { email: 'absent@example.test' });
    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    assert.deepEqual(await known.json(), await unknown.json());
    assert.equal(messages.length, 1);
    const link = new URL(messages[0]!.text.split('\n').at(-1)!);
    assert.equal(link.pathname, '/login');
    assert.equal(link.searchParams.has('token'), false);
    const token = new URLSearchParams(link.hash.slice(1)).get('reset-token')!;
    assert.equal(
      (await f.call('/api/auth/password-reset/confirm', { token, newPassword: 'password123' }))
        .status,
      400
    );
    const reset = await Promise.all(
      [1, 2].map(() => f.call('/api/auth/password-reset/confirm', { token, newPassword }))
    );
    assert.deepEqual(reset.map((r) => r.status).sort(), [200, 400]);
    assert.equal(
      (await f.call('/api/auth/password-reset/confirm', { token, newPassword })).status,
      400
    );
    assert.equal((await (await f.call('/api/auth/session', undefined, true)).json()).user, null);
    assert.equal(
      (await f.call('/api/auth/login', { email: 'owner@example.test', password: oldPassword }))
        .status,
      401
    );
    const login = await f.call('/api/auth/login', {
      email: 'owner@example.test',
      password: newPassword,
    });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).twoFactorRequired, true);
    assert.deepEqual(
      f.auth.db.prepare('SELECT * FROM twoFactor WHERE userId=?').get(owner),
      factors
    );
    assert.deepEqual(await readFile(path.join(store.dataDir, 'workspace.json')), before);
    await f.call('/api/auth/password-reset', { email: 'owner@example.test' });
    const expired = new URLSearchParams(
      new URL(messages.at(-1)!.text.split('\n').at(-1)!).hash.slice(1)
    ).get('reset-token')!;
    f.auth.db
      .prepare('UPDATE verification SET expiresAt=? WHERE identifier=?')
      .run(Date.now() - 1000, `reset-password:${expired}`);
    assert.equal(
      (
        await f.call('/api/auth/password-reset/confirm', {
          token: expired,
          newPassword: oldPassword,
        })
      ).status,
      400
    );
  } finally {
    await f.stop();
  }
});
