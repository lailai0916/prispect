import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';

test('publisher refuses old binaries after auth migration and fails closed on invalid state', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'cashlens-barrier-'));
  try {
    const dbPath = path.join(folder, 'accounts.sqlite');
    const old = path.join(folder, 'old');
    const current = path.join(folder, 'new');
    await mkdir(old);
    await mkdir(current);
    await writeFile(path.join(current, 'AUTH_SCHEMA.json'), JSON.stringify({ version: 2 }));
    const publisher = await readFile('deploy/ci-deploy.sh', 'utf8');
    const begin = publisher.indexOf('database_auth_schema() {');
    const end = publisher.indexOf('\nprobe() {', begin);
    assert.ok(begin > 0 && end > begin);
    const functions = publisher
      .slice(begin, end)
      .replace('/var/lib/cashlens/accounts.sqlite', dbPath);
    const allowed = (release: string) =>
      spawnSync('bash', ['-c', `${functions}\ncan_restore_release "$1"`, 'barrier', release], {
        encoding: 'utf8',
      }).status === 0;
    assert.equal(allowed(old), true, 'missing pre-migration DB uses schema1');
    const db = new Database(dbPath);
    db.exec(
      "CREATE TABLE cashlens_auth_migrations(version INTEGER PRIMARY KEY,completedAt TEXT NOT NULL); INSERT INTO cashlens_auth_migrations VALUES(2,'now');"
    );
    db.close();
    assert.equal(allowed(old), false, 'schema1 binary cannot regain migrated database');
    assert.equal(allowed(current), true, 'compatible binary can use preserved state');
    await writeFile(path.join(current, 'AUTH_SCHEMA.json'), '{broken');
    assert.equal(allowed(current), false, 'invalid compatibility manifest fails closed');
    await writeFile(dbPath, 'not a database');
    assert.equal(allowed(old), false, 'unreadable live state fails closed');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
