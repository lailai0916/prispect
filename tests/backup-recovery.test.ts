import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';
import { seeds } from '../server/store.js';

const command = promisify(execFile);
const password = 'Copper!fjord7-Unusual-velvet';
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
async function open(directory: string) {
  const service = await createApp({ dataDir: directory, model: {} });
  const server = service.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const cookies = new Map<string, string>();
  const call = async (url: string, body?: unknown) => {
    const response = await fetch(base + url, {
      method: body ? 'POST' : 'GET',
      headers: {
        Origin: 'http://127.0.0.1:4318',
        'Content-Type': 'application/json',
        Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    for (const header of response.headers.getSetCookie()) {
      const [first] = header.split(';');
      const [key, ...value] = first!.split('=');
      if (value.join('=') && !header.includes('Max-Age=0')) cookies.set(key!, value.join('='));
      else cookies.delete(key!);
    }
    return response;
  };
  return {
    ...service,
    call,
    close: async () => {
      await service.waitForIdle();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      service.auth.close();
    },
  };
}
async function verify(archive: string, destination?: string, expected?: string) {
  const checksum =
    expected ||
    createHash('sha256')
      .update(await readFile(archive))
      .digest('hex');
  return command('python3', [
    'scripts/verify-backup.py',
    archive,
    '--sha256',
    checksum,
    ...(destination ? ['--extract-to', destination] : []),
  ]);
}

test('an isolated backup recovers the same account, material bytes and ownership without touching the source', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-backup-'));
  const source = path.join(directory, 'source');
  let service: Awaited<ReturnType<typeof open>> | undefined;
  try {
    service = await open(source);
    const response = await service.call('/api/auth/register', {
      email: 'recovery@example.test',
      name: 'Backup owner',
      password,
    });
    assert.equal(response.status, 201);
    const owner = (await response.json()).user.id as string;
    const store = await service.workspaceForUser(owner);
    const bytes = Buffer.from('%PDF-1.7 synthetic retained original; no external provider');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const uploadId = await store.retainUpload(bytes, 'synthetic-original.pdf', sha256);
    const sample = (await seeds(process.cwd())).materials[0]!;
    const material = {
      ...sample,
      id: randomUUID(),
      origin: 'user-upload' as const,
      uploadId,
      sha256,
      filename: 'synthetic-original.pdf',
    };
    await store.saveMaterial(material);
    const setup = await service.call('/api/identity/two-factor/enable', { password });
    assert.equal(setup.status, 200);
    const secret = new URL((await setup.json()).totpURI).searchParams.get('secret')!;
    assert.equal(
      (await service.call('/api/identity/two-factor/verify-totp', { code: totp(secret) })).status,
      200
    );
    await service.call('/api/auth/register', {
      email: 'other@example.test',
      name: 'Other owner',
      password,
    });
    await service.close();
    service = undefined;
    const baseline = await readFile(path.join(source, 'users', owner, 'workspace.json'));
    const archive = path.join(directory, 'backup.tar.gz');
    await command('tar', ['-czf', archive, '-C', source, '.']);
    const check = JSON.parse((await verify(archive)).stdout);
    assert.equal(check.ok, true);
    assert.equal(check.adopted_originals, 1);
    const destination = path.join(directory, 'recovered');
    assert.equal(JSON.parse((await verify(archive, destination)).stdout).isolated_recovery, true);
    assert.equal((await stat(destination)).mode & 0o777, 0o700);
    await assert.rejects(verify(archive, source));
    assert.deepEqual(await readFile(path.join(source, 'users', owner, 'workspace.json')), baseline);
    service = await open(destination);
    const login = await service.call('/api/auth/login', {
      email: 'recovery@example.test',
      password,
    });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).twoFactorRequired, true);
    assert.equal(
      (await service.call('/api/identity/two-factor/verify-totp', { code: totp(secret) })).status,
      200
    );
    assert.equal((await (await service.call('/api/auth/session')).json()).user.id, owner);
    const workspace = await service.call('/api/workspace');
    assert.equal(workspace.status, 200);
    assert.equal((await workspace.json()).materials[0].id, material.id);
    const original = await service.call(`/api/materials/${material.id}/file`);
    assert.equal(original.status, 200);
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
    await service.call('/api/auth/login', { email: 'other@example.test', password });
    assert.equal((await service.call(`/api/materials/${material.id}/file`)).status, 404);
    assert.deepEqual(await readFile(path.join(source, 'users', owner, 'workspace.json')), baseline);
    await assert.rejects(verify(archive, path.join(directory, 'wrong-checksum'), '0'.repeat(64)));
    await assert.rejects(stat(path.join(directory, 'wrong-checksum')));
  } finally {
    await service?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('backup verification rejects traversal, links, duplicate paths, broken SQLite and missing originals', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-backup-invalid-'));
  try {
    for (const kind of [
      'traversal',
      'link',
      'hardlink',
      'duplicate',
      'database',
      'missing-original',
    ]) {
      const archive = path.join(directory, kind + '.tar.gz');
      await command('python3', [
        '-c',
        `
import io, sys, tarfile, sqlite3, tempfile, json
kind, output = sys.argv[1:]
with tarfile.open(output, 'w:gz') as tar:
 def add(name, content=b''):
  item=tarfile.TarInfo(name); item.size=len(content); tar.addfile(item, io.BytesIO(content))
 if kind == 'traversal': add('../escape', b'bad')
 elif kind in ('link', 'hardlink'):
  item=tarfile.TarInfo('unsafe'); item.type=tarfile.SYMTYPE if kind=='link' else tarfile.LNKTYPE; item.linkname='/tmp/escape'; tar.addfile(item)
 elif kind == 'duplicate': add('same'); add('./same')
 elif kind == 'database': add('accounts.sqlite', b'invalid'); add('auth-secret', b'fixture')
 else:
  with tempfile.TemporaryDirectory() as d:
   db=sqlite3.connect(d+'/accounts.sqlite')
   db.executescript('CREATE TABLE user(id); INSERT INTO user VALUES("owner"); CREATE TABLE account(id); CREATE TABLE session(id); CREATE TABLE verification(id); CREATE TABLE cashlens_auth_migrations(version); INSERT INTO cashlens_auth_migrations VALUES(2);'); db.close()
   tar.add(d+'/accounts.sqlite', arcname='accounts.sqlite')
  add('auth-secret', b'fixture')
  state={'schemaVersion':1,'materials':[],'tasks':[],'inputs':{},'uploads':{'a'*36:{'id':'a'*36,'bytes':1,'sha256':'0'*64}}}
  add('users/owner/workspace.json', json.dumps(state).encode())
`,
        kind,
        archive,
      ]);
      const destination = path.join(directory, kind + '-recovery');
      await assert.rejects(verify(archive, destination));
      if (['traversal', 'link', 'hardlink', 'duplicate'].includes(kind))
        await assert.rejects(stat(destination));
    }
    const marker = path.join(directory, 'sentinel');
    await mkdir(marker);
    await writeFile(path.join(marker, 'keep'), 'keep');
    await assert.rejects(verify(path.join(directory, 'database.tar.gz'), marker));
    assert.equal(await readFile(path.join(marker, 'keep'), 'utf8'), 'keep');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
