import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, symlink, utimes } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { WorkspaceStore, PENDING_UPLOAD_TTL_MS } from '../server/store.js';
import { WorkspaceAudit } from '../server/workspace-audit.js';

class FailingStore extends WorkspaceStore {
  fail = false;
  protected override async persistSnapshot(content: string) {
    if (this.fail) throw new Error('fixture write failure');
    await super.persistSnapshot(content);
  }
}
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-audit-'));
  const store = new FailingStore(process.cwd(), directory);
  await store.initialize();
  const bytes = Buffer.from('private synthetic original');
  const id = await store.retainUpload(
    bytes,
    'private-name.pdf',
    createHash('sha256').update(bytes).digest('hex')
  );
  const file = path.join(directory, 'uploads', `${id}.blob`);
  const events = async () =>
    (await readFile(path.join(directory, '.audit', 'events.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
  return {
    directory,
    store,
    bytes,
    id,
    file,
    events,
    close: () => rm(directory, { recursive: true, force: true }),
  };
}
test('expiry writes durable intent, protects originals on persistence failure and retains its audit through reset', async () => {
  const f = await fixture();
  try {
    const record = f.store.state.uploads[f.id]!;
    record.createdAt = new Date(Date.now() - PENDING_UPLOAD_TTL_MS - 1000).toISOString();
    await f.store.persist();
    f.store.fail = true;
    await assert.rejects(f.store.cleanupUploads(true), /fixture write failure/);
    assert.ok(f.store.state.uploads[f.id]);
    assert.deepEqual(await readFile(f.file), f.bytes);
    assert.deepEqual(
      (await f.events()).map((e) => e.phase),
      ['intent', 'failed']
    );
    f.store.fail = false;
    await f.store.cleanupUploads(true);
    assert.equal(f.store.state.uploads[f.id], undefined);
    await assert.rejects(readFile(f.file));
    const events = await f.events();
    assert.deepEqual(
      events.map((e) => e.phase),
      ['intent', 'failed', 'intent', 'completed']
    );
    assert.ok(events[0].eligibleAt);
    assert.ok(events[0].createdAt);
    const text = JSON.stringify(events);
    for (const secret of [f.id, 'private-name.pdf', f.bytes.toString(), f.directory])
      assert.ok(!text.includes(secret));
    await f.store.reset();
    assert.equal((await f.events()).at(-1).action, 'workspace-reset');
  } finally {
    await f.close();
  }
});
test('audit failure prevents deletion; adopted, young and malformed-date uploads stay intact', async () => {
  const f = await fixture();
  try {
    const outside = path.join(f.directory, 'outside');
    await mkdir(outside);
    await symlink(outside, path.join(f.directory, '.audit'));
    await assert.rejects(f.store.discardUnconfirmedUpload(f.id), { code: 'AUDIT_UNAVAILABLE' });
    assert.ok(f.store.state.uploads[f.id]);
    assert.deepEqual(await readFile(f.file), f.bytes);
    await rm(path.join(f.directory, '.audit'));
    for (const date of [new Date().toISOString(), 'invalid-date']) {
      f.store.state.uploads[f.id]!.createdAt = date;
      await f.store.cleanupUploads(true);
      assert.deepEqual(await readFile(f.file), f.bytes);
    }
    f.store.state.uploads[f.id]!.createdAt = new Date(0).toISOString();
    f.store.state.uploads[f.id]!.materialId = 'retained-material';
    await f.store.cleanupUploads(true);
    assert.deepEqual(await readFile(f.file), f.bytes);
    const orphan = path.join(f.directory, 'uploads', `${randomUUID()}.blob`);
    await writeFile(orphan, 'orphan');
    await utimes(orphan, new Date(0), new Date(0));
    await f.store.cleanupUploads(true);
    await assert.rejects(readFile(orphan));
    assert.equal((await f.events()).at(-1).action, 'orphan-upload-expired');
  } finally {
    await f.close();
  }
});
test('audit does not overwrite the primary result if completion logging fails', async () => {
  const f = await fixture();
  try {
    const audit = new WorkspaceAudit(f.directory);
    const warn = console.warn;
    const warnings: string[] = [];
    console.warn = (value: string) => {
      warnings.push(value);
    };
    try {
      const result = await audit.run(
        'upload-discarded',
        { ids: [f.id], reason: 'user' },
        async () => {
          await rm(path.join(f.directory, '.audit'), { recursive: true });
          await writeFile(path.join(f.directory, '.audit'), 'block completion');
          return 7;
        }
      );
      assert.equal(result, 7);
      assert.equal(warnings.length, 1);
      assert.ok(!warnings[0]!.includes(f.id));
    } finally {
      console.warn = warn;
    }
  } finally {
    await f.close();
  }
});
