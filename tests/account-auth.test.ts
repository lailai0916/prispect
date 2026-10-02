import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomUUID, randomBytes, scryptSync, createHmac } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { AuthStore, registrationEnabledFromEnv } from '../server/auth.js';
import { createApp } from '../server/app.js';
import type { AuthSession } from '../shared/contracts.js';
import type { AccountOverview } from '../shared/account-contracts.js';
import { validNewPassword } from '../shared/password-strength.js';

const password = 'Copper!fjord7-Unusual-velvet';
function totp(secret: string, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.toUpperCase().replace(/=+$/, ''))
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) || []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[19]! & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
async function open(directory: string, registrationEnabled?: boolean) {
  const service = await createApp({
    root: process.cwd(),
    dataDir: directory,
    model: {},
    registrationEnabled,
  });
  const server = service.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    ...service,
    base,
    stop: async () => {
      await service.waitForIdle();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      service.auth.close();
    },
  };
}
function client(service: Awaited<ReturnType<typeof open>>) {
  const cookies = new Map<string, string>();
  let csrf: string | null = null;
  return {
    cookies,
    async send(url: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
      const headers: Record<string, string> = {
        Origin: 'http://127.0.0.1:4318',
        Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      };
      if (csrf) headers['X-CSRF-Token'] = csrf;
      if (body !== undefined && !(body instanceof FormData))
        headers['Content-Type'] = 'application/json';
      const response = await fetch(service.base + url, {
        method,
        headers,
        ...(body !== undefined
          ? { body: body instanceof FormData ? body : JSON.stringify(body) }
          : {}),
      });
      for (const header of response.headers.getSetCookie()) {
        const first = header.split(';')[0]!;
        const [name, ...value] = first.split('=');
        if (!value.join('=') || /Max-Age=0/i.test(header)) cookies.delete(name!);
        else cookies.set(name!, value.join('='));
      }
      return response;
    },
    async sync() {
      const response = await this.send('/api/auth/session');
      const session = (await response.json()) as AuthSession;
      csrf = session.csrfToken;
      return session;
    },
    async register(email: string) {
      const response = await this.send('/api/auth/register', { email, password, name: '安全验收' });
      assert.equal(response.status, 201, await response.clone().text());
      await this.sync();
      return (await response.json()) as AuthSession;
    },
  };
}

test('registration is closed by default in production and can be explicitly reopened', () => {
  assert.equal(registrationEnabledFromEnv(true, ''), false);
  assert.equal(registrationEnabledFromEnv(false, ''), true);
  assert.equal(registrationEnabledFromEnv(true, 'true'), true);
  assert.equal(registrationEnabledFromEnv(false, 'false'), false);
  assert.throws(() => registrationEnabledFromEnv(true, 'yes'), /true or false/);
});

test('closing registration blocks both public creation routes while preserving existing sessions and login', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-registration-'));
  let service = await open(directory, true);
  try {
    const original = client(service);
    const account = await original.register('existing-registration@example.test');
    const savedCookies = [...original.cookies];
    await service.stop();
    service = await open(directory, false);
    const existing = client(service);
    for (const [name, value] of savedCookies) existing.cookies.set(name, value);
    const session = await existing.sync();
    assert.equal(session.user?.id, account.user!.id);
    assert.equal(session.registrationEnabled, false);
    assert.equal((await existing.send('/api/workspace')).status, 200);

    const anonymous = client(service);
    assert.deepEqual(await anonymous.sync(), {
      user: null,
      csrfToken: null,
      registrationEnabled: false,
    });
    for (const route of ['/api/auth/register', '/api/identity/sign-up/email']) {
      for (const body of [
        {},
        { email: 'blocked-registration@example.test', name: 'Blocked', password },
      ]) {
        const response = await anonymous.send(route, body);
        assert.equal(response.status, 404, await response.clone().text());
        assert.equal(response.headers.getSetCookie().length, 0);
      }
    }
    const count = (
      service.auth.db.prepare('SELECT count(*) AS count FROM "user"').get() as { count: number }
    ).count;
    assert.equal(count, 1);
    for (const route of ['/api/auth/login', '/api/identity/sign-in/email']) {
      const returning = client(service);
      const response = await returning.send(route, {
        email: 'existing-registration@example.test',
        password,
      });
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal((await returning.sync()).user?.id, account.user!.id);
    }
  } finally {
    await service.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('transaction migration preserves legacy UUID, exact Unicode scrypt semantics and private workspace; old cookie never authenticates', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-auth-migrate-'));
  let auth: AuthStore | undefined;
  try {
    const id = randomUUID(),
      salt = randomBytes(16).toString('hex'),
      legacyPassword = '旧 密码e\u0301!';
    const legacyHash = scryptSync(legacyPassword, salt, 64, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    }).toString('hex');
    const db = new Database(path.join(directory, 'accounts.sqlite'));
    db.exec(
      'CREATE TABLE users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE sessions (token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER);'
    );
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(
      id,
      'legacy@example.test',
      '原用户',
      salt,
      legacyHash,
      '2026-10-01T00:00:00.000Z'
    );
    db.close();
    const workspace = path.join(directory, 'users', id, 'workspace.json');
    await mkdir(path.dirname(workspace), { recursive: true });
    await writeFile(workspace, '{"sentinel":"private-original"}');
    auth = await AuthStore.open(directory, false);
    assert.equal(auth.profileFor(id).id, id);
    assert.equal(auth.profileFor(id).emailVerified, false);
    assert.equal(await readFile(workspace, 'utf8'), '{"sentinel":"private-original"}');
    assert.equal(
      await auth.session({
        headers: { cookie: 'cashlens_session=' + randomBytes(32).toString('base64url') },
      } as Parameters<typeof auth.session>[0]),
      null
    );
    const login = await auth.identity.api.signInEmail({
      body: { email: 'legacy@example.test', password: legacyPassword },
      asResponse: true,
    });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).user.id, id);
    const normalized = await auth.identity.api.signInEmail({
      body: { email: 'legacy@example.test', password: legacyPassword.normalize('NFC') },
      asResponse: true,
    });
    assert.equal(normalized.status, 401);
    assert.equal(
      auth.db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name='users'").get() &&
        (
          auth.db
            .prepare("SELECT count(*) AS count FROM sqlite_master WHERE name='users'")
            .get() as { count: number }
        ).count,
      0
    );
    auth.close();
    auth = await AuthStore.open(directory, false);
    assert.equal(
      (auth.db.prepare('SELECT count(*) AS count FROM "user"').get() as { count: number }).count,
      1
    );
    assert.equal(auth.profileFor(id).id, id);
  } finally {
    auth?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('failed legacy conversion rolls back account copies and preserves old tables; production refuses absent secret', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-auth-rollback-'));
  try {
    const db = new Database(path.join(directory, 'accounts.sqlite'));
    db.exec(
      'CREATE TABLE users (id TEXT PRIMARY KEY,email TEXT,name TEXT,salt TEXT,password_hash TEXT,created_at TEXT);'
    );
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(
      randomUUID(),
      'bad@example.test',
      '旧记录',
      'invalid',
      'invalid',
      '2026-10-01'
    );
    db.close();
    await assert.rejects(() => AuthStore.open(directory, false), /旧账号密码格式/);
    const check = new Database(path.join(directory, 'accounts.sqlite'));
    assert.equal(
      (check.prepare('SELECT count(*) AS count FROM users').get() as { count: number }).count,
      1
    );
    assert.equal(
      check.prepare("SELECT name FROM sqlite_master WHERE name='cashlens_legacy_users'").get(),
      undefined
    );
    check.close();
    if (!process.env.BETTER_AUTH_SECRET)
      await assert.rejects(() => AuthStore.open(directory, true), /BETTER_AUTH_SECRET/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a schema2 marker cannot recreate missing authentication structures or discard original UUID mappings', async () => {
  const variants = [
    { sql: 'DROP TABLE passkey', expected: /缺少必要数据表/ },
    { sql: 'ALTER TABLE "user" DROP COLUMN bio', expected: /缺少必要字段/ },
    { sql: 'UPDATE cashlens_auth_migrations SET version=3', expected: /迁移版本不受/ },
    { sql: 'DROP TABLE cashlens_auth_migrations', expected: /迁移标记缺失/ },
    {
      sql: "CREATE TABLE cashlens_legacy_users (id TEXT PRIMARY KEY); INSERT INTO cashlens_legacy_users VALUES ('missing-original-uuid')",
      expected: /原账号UUID映射缺失/,
    },
  ];
  for (const variant of variants) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-schema2-'));
    try {
      const initial = await AuthStore.open(directory, false);
      initial.close();
      const corrupt = new Database(path.join(directory, 'accounts.sqlite'));
      corrupt.exec(variant.sql);
      const before = corrupt
        .prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name")
        .all();
      corrupt.close();
      await assert.rejects(() => AuthStore.open(directory, false), variant.expected);
      const check = new Database(path.join(directory, 'accounts.sqlite'));
      assert.deepEqual(
        check.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all(),
        before
      );
      check.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-marker-only-'));
  try {
    const db = new Database(path.join(directory, 'accounts.sqlite'));
    db.exec(
      "CREATE TABLE cashlens_auth_migrations (version INTEGER PRIMARY KEY, completedAt TEXT); INSERT INTO cashlens_auth_migrations VALUES (2,'2026-10-01')"
    );
    db.close();
    await assert.rejects(() => AuthStore.open(directory, false), /缺少必要数据表/);
    const check = new Database(path.join(directory, 'accounts.sqlite'));
    assert.equal(
      check.prepare("SELECT name FROM sqlite_master WHERE name='user'").get(),
      undefined
    );
    check.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy numeric dates survive real HTTP login, native session/profile/passkey options and restart without changing owner UUID', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-legacy-http-'));
  const id = randomUUID(),
    salt = randomBytes(16).toString('hex');
  const originalDate = '2026-10-01T00:00:00.000Z';
  const db = new Database(path.join(directory, 'accounts.sqlite'));
  db.exec(
    'CREATE TABLE users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE sessions (token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER);'
  );
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(
    id,
    'legacy-http@example.test',
    '原账号',
    salt,
    scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString(
      'hex'
    ),
    originalDate
  );
  db.close();
  let service = await open(directory);
  try {
    // Existing locally migrated databases may still contain numeric timestamps.
    service.auth.db
      .prepare('UPDATE "user" SET createdAt=?,updatedAt=? WHERE id=?')
      .run(new Date(originalDate).getTime(), new Date(originalDate).getTime(), id);
    const old = client(service);
    old.cookies.set('cashlens_session', randomBytes(32).toString('base64url'));
    assert.equal((await old.send('/api/workspace')).status, 401);
    const owner = client(service);
    for (let repeat = 0; repeat < 2; repeat++) {
      const login = await owner.send('/api/auth/login', {
        email: 'legacy-http@example.test',
        password,
      });
      assert.equal(login.status, 200);
      assert.equal((await login.json()).user.id, id);
      const session = await owner.sync();
      assert.equal(session.user!.id, id);
      assert.equal(session.user!.createdAt, originalDate);
      const native = await owner.send('/api/identity/get-session');
      assert.equal(native.status, 200);
      assert.equal((await native.json()).user.id, id);
      const profile = await owner.send('/api/account');
      assert.equal(profile.status, 200);
      assert.equal((await profile.json()).user.createdAt, originalDate);
      assert.equal((await owner.send('/api/account/sessions')).status, 200);
      assert.equal(
        (await owner.send('/api/identity/passkey/generate-register-options')).status,
        200
      );
      if (repeat === 0) assert.equal((await owner.send('/api/auth/logout', {})).status, 200);
    }
    await service.stop();
    service = await open(directory);
    // The second session is retained after restart, but an old legacy cookie still cannot authenticate.
    const request = {
      headers: { cookie: [...owner.cookies].map(([name, value]) => `${name}=${value}`).join('; ') },
    } as Parameters<typeof service.auth.session>[0];
    assert.equal((await service.auth.session(request))?.user.id, id);
    assert.equal(
      (service.auth.db.prepare('SELECT count(*) AS count FROM "user"').get() as { count: number })
        .count,
      1
    );
  } finally {
    await service.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('eight-character passwords work through registration and changes while weak passwords and short inputs are rejected', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-password-policy-'));
  const service = await open(directory);
  const initialPassword = 'vR7!qL9@';
  const nextPassword = 'k9$Tz4!Q';
  try {
    assert.equal(validNewPassword(initialPassword), true);
    assert.equal(validNewPassword(initialPassword.slice(0, 7)), false);
    assert.equal(validNewPassword('12345678'), false);
    assert.equal(validNewPassword('x'.repeat(129)), false);
    const account = client(service);
    for (const route of ['/api/auth/register', '/api/identity/sign-up/email']) {
      for (const rejected of [initialPassword.slice(0, 7), '12345678']) {
        const response = await account.send(route, {
          email: 'password-policy@example.test',
          name: '密码验收',
          password: rejected,
        });
        assert.equal(response.status, 400, await response.clone().text());
        assert.equal((await response.json()).code, 'WEAK_PASSWORD');
      }
    }
    const registered = await account.send('/api/auth/register', {
      email: 'password-policy@example.test',
      name: '密码验收',
      password: initialPassword,
    });
    assert.equal(registered.status, 201, await registered.clone().text());
    await account.sync();
    const other = client(service);
    assert.equal(
      (
        await other.send('/api/auth/login', {
          email: 'password-policy@example.test',
          password: initialPassword,
        })
      ).status,
      200
    );
    await other.sync();
    assert.equal(
      (await account.send('/api/account/re-auth', { password: initialPassword })).status,
      200
    );
    for (const route of ['/api/auth/password', '/api/identity/change-password']) {
      const response = await account.send(route, {
        currentPassword: initialPassword,
        newPassword: '12345678',
      });
      assert.equal(response.status, 400, await response.clone().text());
      assert.equal((await response.json()).code, 'WEAK_PASSWORD');
    }
    const changed = await account.send('/api/auth/password', {
      currentPassword: initialPassword,
      newPassword: nextPassword,
    });
    assert.equal(changed.status, 200, await changed.clone().text());
    await account.sync();
    assert.equal((await other.send('/api/account')).status, 401);
    const fresh = client(service);
    assert.equal(
      (
        await fresh.send('/api/auth/login', {
          email: 'password-policy@example.test',
          password: initialPassword,
        })
      ).status,
      401
    );
    assert.equal(
      (
        await fresh.send('/api/auth/login', {
          email: 'password-policy@example.test',
          password: nextPassword,
        })
      ).status,
      200
    );
    const native = client(service);
    const nativeRegistered = await native.send('/api/identity/sign-up/email', {
      email: 'password-native@example.test',
      name: '原生密码验收',
      password: initialPassword,
    });
    assert.equal(nativeRegistered.status, 200, await nativeRegistered.clone().text());
    await native.sync();
    assert.equal(
      (await native.send('/api/account/re-auth', { password: initialPassword })).status,
      200
    );
    const nativeChanged = await native.send('/api/identity/change-password', {
      currentPassword: initialPassword,
      newPassword: nextPassword,
    });
    assert.equal(nativeChanged.status, 200, await nativeChanged.clone().text());
  } finally {
    await service.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('blank workspace, actual profile/avatar ownership, display contacts, unconfigured providers and restart are real', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-account-'));
  let service = await open(directory);
  try {
    const alice = client(service),
      bob = client(service);
    const account = await alice.register('alice-account@example.test');
    await bob.register('bob-account@example.test');
    const workspace = await (await alice.send('/api/workspace')).json();
    assert.deepEqual(workspace.materials, []);
    assert.deepEqual(workspace.tasks, []);
    const unsafeWrite = await fetch(service.base + '/api/account/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:4318',
        Cookie: [...alice.cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      },
      body: JSON.stringify({ name: 'CSRF refused' }),
    });
    assert.equal(unsafeWrite.status, 403);
    const oversizedNative = await fetch(service.base + '/api/identity/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4318' },
      body: JSON.stringify({ email: 'nobody@example.test', password: 'x'.repeat(70000) }),
    });
    assert.equal(oversizedNative.status, 413);
    const overview = (await (await alice.send('/api/account')).json()) as AccountOverview;
    assert.equal(overview.capabilities.email.configured, false);
    assert.equal(overview.capabilities.sms.configured, false);
    assert.equal(overview.user.phoneNumber, null);
    for (const [url, body] of [
      ['/api/account/email/verify', {}],
      ['/api/account/email/change', { email: 'new@example.test' }],
      ['/api/account/phone/send', { phoneNumber: '+8613800138000' }],
      ['/api/account/phone/verify', { code: '000000' }],
      ['/api/identity/send-verification-email', { email: overview.user.email }],
      ['/api/identity/request-password-reset', { email: overview.user.email }],
      ['/api/identity/phone-number/send-otp', { phoneNumber: '+8613800138000' }],
    ] as const)
      assert.equal((await alice.send(url, body)).status, 503, url);
    const changed = await alice.send(
      '/api/account/profile',
      {
        name: '原ID保留',
        bio: '测试简介',
        company: '测试组织',
        timezone: 'America/Los_Angeles',
        phoneNumber: '13800138000',
      },
      'PATCH'
    );
    assert.equal(changed.status, 200);
    const changedProfile = (await changed.json()).user;
    assert.equal(changedProfile.id, account.user!.id);
    assert.equal(changedProfile.phoneNumber, '+8613800138000');
    assert.equal(changedProfile.phoneNumberVerified, false);
    assert.equal(changedProfile.timezone, 'America/Los_Angeles');
    assert.equal((await alice.sync()).user!.timezone, 'America/Los_Angeles');
    assert.equal((await bob.sync()).user!.timezone, 'Asia/Shanghai');
    assert.equal((await (await bob.send('/api/account')).json()).user.phoneNumber, null);
    const sharedContact = await bob.send(
      '/api/account/profile',
      { name: '共享联系电话', phoneNumber: '+86 138 0013 8000' },
      'PATCH'
    );
    assert.equal(sharedContact.status, 200);
    assert.equal((await sharedContact.json()).user.phoneNumber, '+8613800138000');
    const invalidContact = await alice.send(
      '/api/account/profile',
      { name: '不应保存', phoneNumber: 'call me: 13800138000' },
      'PATCH'
    );
    assert.equal(invalidContact.status, 400);
    assert.equal((await (await alice.send('/api/account')).json()).user.name, '原ID保留');
    assert.equal(
      (
        await alice.send(
          '/api/account/profile',
          { name: '原ID保留', phoneNumberVerified: true },
          'PATCH'
        )
      ).status,
      400
    );
    const omittedContact = await alice.send('/api/account/profile', { name: '原ID保留' }, 'PATCH');
    assert.equal((await omittedContact.json()).user.phoneNumber, '+8613800138000');
    assert.equal((await alice.sync()).user!.timezone, 'America/Los_Angeles');
    const clearedContact = await alice.send(
      '/api/account/profile',
      { name: '原ID保留', phoneNumber: '' },
      'PATCH'
    );
    assert.equal((await clearedContact.json()).user.phoneNumber, null);
    const restoredContact = await alice.send(
      '/api/account/profile',
      { name: '原ID保留', phoneNumber: '+8613800138000' },
      'PATCH'
    );
    assert.equal((await restoredContact.json()).user.phoneNumber, '+8613800138000');
    const legacyPhone = service.auth.db
      .prepare('SELECT phoneNumber,phoneNumberVerified FROM "user" WHERE id=?')
      .get(account.user!.id) as { phoneNumber: string | null; phoneNumberVerified: number | null };
    assert.equal(legacyPhone.phoneNumber, null);
    assert.ok(!legacyPhone.phoneNumberVerified);
    assert.equal(
      (await alice.send('/api/account/profile', { name: '试图伪造', emailVerified: true }, 'PATCH'))
        .status,
      400
    );
    assert.equal(
      (
        await alice.send('/api/identity/update-user', {
          image: 'https://untrusted.example/avatar.svg',
        })
      ).status,
      403
    );
    const pixels = await sharp({
      create: { width: 24, height: 24, channels: 4, background: '#3366aa' },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.append('file', new Blob([pixels]), 'avatar.png');
    const saved = await alice.send('/api/account/avatar', form);
    assert.equal(saved.status, 200);
    const uploaded = (await saved.json()) as AccountOverview;
    assert.ok(uploaded.user.image?.startsWith('/api/account/avatar?v='));
    const download = await alice.send('/api/account/avatar');
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), 'image/webp');
    const bytes = Buffer.from(await download.arrayBuffer());
    assert.equal((await sharp(bytes).metadata()).format, 'webp');
    assert.equal((await bob.send('/api/account/avatar')).status, 404);
    const malicious = new FormData();
    malicious.append('file', new Blob(['<svg onload="alert(1)"></svg>']), 'avatar.png');
    assert.equal((await alice.send('/api/account/avatar', malicious)).status, 400);
    assert.equal((await alice.send('/api/cases/songyuan/import', {})).status, 201);
    assert.equal((await (await alice.send('/api/workspace')).json()).materials.length, 1);
    assert.equal((await alice.send('/api/reset', { confirm: 'RESET_DEMO' })).status, 200);
    assert.deepEqual((await (await alice.send('/api/workspace')).json()).materials, []);
    service.auth.rateLimit('restart-test-limit', 1, 3600000);
    const id = account.user!.id;
    await service.stop();
    service = await open(directory);
    const request = {
      headers: { cookie: [...alice.cookies].map(([name, value]) => `${name}=${value}`).join('; ') },
    } as Parameters<typeof service.auth.session>[0];
    assert.equal((await service.auth.session(request))?.user.id, id);
    assert.equal(service.auth.profileFor(id).bio, '测试简介');
    assert.equal((await service.auth.session(request))?.user.timezone, 'America/Los_Angeles');
    assert.equal(service.auth.profileFor(id).timezone, 'America/Los_Angeles');
    assert.equal(service.auth.profileFor(id).phoneNumber, '+8613800138000');
    assert.equal(service.auth.profileFor(id).phoneNumberVerified, false);
    assert.throws(
      () => service.auth.rateLimit('restart-test-limit', 1, 3600000),
      (error) => (error as { code: string }).code === 'RATE_LIMITED'
    );
    assert.deepEqual(
      await readFile(
        path.join(
          directory,
          'avatars',
          await import('node:crypto').then(
            ({ createHash }) => createHash('sha256').update(id).digest('hex') + '.webp'
          )
        )
      ),
      bytes
    );
  } finally {
    await service.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('TOTP confirmation revokes password-only sessions; login challenge, backup single use and native sensitive endpoints cannot bypass', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-factor-'));
  const service = await open(directory);
  try {
    const first = client(service),
      other = client(service);
    const account = await first.register('factor@example.test');
    assert.equal(
      (await other.send('/api/auth/login', { email: account.user!.email, password })).status,
      200
    );
    await other.sync();
    const setup = await first.send('/api/identity/two-factor/enable', { password });
    assert.equal(setup.status, 200, await setup.clone().text());
    const data = (await setup.json()) as { totpURI: string; backupCodes: string[] };
    assert.equal(service.auth.profileFor(account.user!.id).twoFactorEnabled, false);
    const secret = new URL(data.totpURI).searchParams.get('secret')!;
    assert.equal(
      (
        await first.send('/api/identity/two-factor/verify-totp', {
          code: totp(secret, Date.now() - 10 * 60000),
        })
      ).status,
      401
    );
    const confirmed = await first.send('/api/identity/two-factor/verify-totp', {
      code: totp(secret),
    });
    assert.equal(confirmed.status, 200, await confirmed.clone().text());
    await first.sync();
    assert.equal(service.auth.profileFor(account.user!.id).twoFactorEnabled, true);
    assert.equal((await other.send('/api/workspace')).status, 401);
    assert.equal(
      (
        await other.send('/api/auth/password', {
          currentPassword: password,
          newPassword: 'Changed!Copper-velvet-7',
        })
      ).status,
      401
    );
    const fresh = client(service);
    const login = await fresh.send('/api/auth/login', { email: account.user!.email, password });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).twoFactorRequired, true);
    assert.equal((await fresh.send('/api/workspace')).status, 401);
    const backed = await fresh.send('/api/identity/two-factor/verify-backup-code', {
      code: data.backupCodes[0],
    });
    assert.equal(backed.status, 200);
    await fresh.sync();
    assert.equal((await fresh.send('/api/workspace')).status, 200);
    const replay = client(service);
    await replay.send('/api/auth/login', { email: account.user!.email, password });
    assert.equal(
      (
        await replay.send('/api/identity/two-factor/verify-backup-code', {
          code: data.backupCodes[0],
        })
      ).status,
      401
    );
    assert.equal((await replay.send('/api/workspace')).status, 401);
    const concurrentA = client(service),
      concurrentB = client(service);
    await concurrentA.send('/api/auth/login', { email: account.user!.email, password });
    await concurrentB.send('/api/auth/login', { email: account.user!.email, password });
    const simultaneous = await Promise.all([
      concurrentA.send('/api/identity/two-factor/verify-backup-code', {
        code: data.backupCodes[1],
      }),
      concurrentB.send('/api/identity/two-factor/verify-backup-code', {
        code: data.backupCodes[1],
      }),
    ]);
    assert.equal(simultaneous.filter((response) => response.status === 200).length, 1);
    assert.ok(simultaneous.some((response) => [401, 409].includes(response.status)));
    service.auth.db.prepare('DELETE FROM cashlens_stepups WHERE userId=?').run(account.user!.id);
    assert.equal((await fresh.send('/api/identity/two-factor/disable', { password })).status, 403);
    assert.equal(
      (
        await fresh.send('/api/identity/change-password', {
          currentPassword: password,
          newPassword: 'Changed!Copper-velvet-7',
        })
      ).status,
      403
    );
    assert.equal((await fresh.send('/api/account/re-auth', { password })).status, 400);
    assert.equal(
      (await fresh.send('/api/account/re-auth', { password, code: totp(secret) })).status,
      200
    );
    assert.equal(
      (await fresh.send('/api/identity/passkey/generate-register-options', undefined, 'GET'))
        .status,
      200
    );
    assert.equal(
      (
        await replay.send('/api/identity/passkey/verify-registration', {
          response: {},
          name: 'forged',
        })
      ).status,
      401
    );
    assert.equal(
      (
        await fresh.send('/api/identity/passkey/verify-authentication', {
          response: { response: { authenticatorData: Buffer.alloc(37).toString('base64url') } },
        })
      ).status,
      400
    );
    const evil = await fetch(service.base + '/api/identity/two-factor/disable', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'Content-Type': 'application/json',
        Cookie: [...fresh.cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      },
      body: JSON.stringify({ password }),
    });
    assert.equal(evil.status, 403);
  } finally {
    await service.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
