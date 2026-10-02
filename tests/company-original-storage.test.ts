import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { WorkspaceStore } from '../server/store.js';
import { ApiFault } from '../server/validation.js';
import pdfLimits from '../server/pdf-limits.json' with { type: 'json' };

test('large official retained originals remain hash-bound and quota-bound while ordinary uploads retain their original cap', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-official-storage-'));
  try {
    const bytes = Buffer.alloc(pdfLimits.uploadBytes + 1);
    bytes.write('%PDF-1.7');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const store = new WorkspaceStore(process.cwd(), directory, bytes.length);
    await store.initialize();
    await assert.rejects(
      store.retainUpload(bytes, 'ordinary.pdf', hash),
      (error) => error instanceof ApiFault && error.code === 'LIMIT_FILE_SIZE'
    );
    await assert.rejects(
      store.retainUpload(bytes, 'annual.pdf', 'a'.repeat(64), 'official'),
      (error) => error instanceof ApiFault && error.code === 'UPLOAD_HASH_MISMATCH'
    );
    const id = await store.retainUpload(bytes, 'annual.pdf', hash, 'official');
    assert.deepEqual((await store.pendingFile(id)).buffer, bytes);
    await assert.rejects(
      store.retainUpload(
        Buffer.from('%PDF-1.7'),
        'another.pdf',
        createHash('sha256').update('%PDF-1.7').digest('hex'),
        'official'
      ),
      (error) => error instanceof ApiFault && error.code === 'STORAGE_QUOTA_EXCEEDED'
    );
    const reopened = new WorkspaceStore(process.cwd(), directory, bytes.length);
    await reopened.initialize();
    assert.equal(
      createHash('sha256')
        .update((await reopened.pendingFile(id)).buffer)
        .digest('hex'),
      hash
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
