import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { previewUpload } from '../server/import.js';
import { WorkspaceStore } from '../server/store.js';
import { ApiFault, validateMaterial } from '../server/validation.js';
import type { AuthSession, Material, UploadPreview } from '../shared/contracts.js';

async function fixture() {
  const bytes = await readFile('data/cases/songyuan-2025.json');
  const input = JSON.parse(bytes.toString('utf8')) as Omit<Material, 'id' | 'createdAt'>;
  return { bytes, input };
}

async function openService() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-import-boundary-'));
  const service = await createApp({ root: process.cwd(), dataDir: directory, model: {} });
  const server = service.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const registration = await fetch(base + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'import-boundary@example.test',
      name: '导入核查',
      password: 'test-strong-password',
    }),
  });
  assert.equal(registration.status, 201);
  const session = (await registration.json()) as AuthSession;
  const headers = {
    Cookie: registration.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; '),
    'X-CSRF-Token': session.csrfToken!,
  };
  return {
    ...service,
    session,
    headers,
    request: (url: string, options: RequestInit = {}) =>
      fetch(base + url, {
        ...options,
        headers: { ...headers, ...options.headers },
      }),
    close: async () => {
      await service.waitForIdle();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      service.auth.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('browser-uploaded UTF-8 names survive preview, saving and original-file downloads without mojibake', async () => {
  const service = await openService();
  try {
    const { bytes } = await fixture();
    const filename = '原始核查 年报(1).json';
    const form = new FormData();
    form.set('file', new Blob([bytes]), filename);
    const response = await service.request('/api/materials/preview', {
      method: 'POST',
      body: form,
    });
    assert.equal(response.status, 200);
    const preview = (await response.json()) as UploadPreview;
    assert.equal(preview.material.filename, filename);
    const saved = await service.request('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preview.material),
    });
    assert.equal(saved.status, 201);
    const material = (await saved.json()) as Material;
    const original = await service.request(`/api/materials/${material.id}/file`);
    assert.equal(original.status, 200);
    const encodedName = original.headers.get('content-disposition')!.split("filename*=UTF-8''")[1]!;
    assert.equal(decodeURIComponent(encodedName), filename);
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);

    const extendedName = 'Â©.json';
    const boundary = 'prispect-extended-name';
    const multipart = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fallback.json"; filename*=UTF-8''${encodeURIComponent(extendedName)}\r\nContent-Type: application/json\r\n\r\n`
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const extended = await service.request('/api/materials/preview', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: multipart,
    });
    assert.equal(extended.status, 200);
    assert.equal(((await extended.json()) as UploadPreview).material.filename, extendedName);
  } finally {
    await service.close();
  }
});

test('structured imports reject damaged UTF-8 instead of replacing company names while accepting valid BOM-prefixed JSON', async () => {
  const { bytes, input } = await fixture();
  const bom = await previewUpload(
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]),
    'bom.json'
  );
  assert.equal(bom.material.company, input.company);
  for (const extension of ['json', 'csv']) {
    const text =
      extension === 'json'
        ? JSON.stringify({ ...input, company: 'CORRUPTED' })
        : 'company,year,key,value,unit,currency,scope\nCORRUPTED,2025,netProfit,100.00,yuan,CNY,consolidated\n';
    const damaged = Buffer.from(text);
    damaged[damaged.indexOf(Buffer.from('CORRUPTED'))] = 0xff;
    await assert.rejects(previewUpload(damaged, `invalid.${extension}`), (error: unknown) => {
      assert.ok(error instanceof ApiFault);
      assert.equal(error.status, 400);
      assert.equal(error.code, 'INVALID_TEXT');
      return true;
    });
  }
});

test('long upload names retain supported extensions and never leave an unpaired UTF-16 surrogate', async () => {
  const { bytes } = await fixture();
  for (const filename of [
    'a'.repeat(237) + '.json',
    'a'.repeat(234) + '😀' + 'a'.repeat(5) + '.json',
  ]) {
    const preview = await previewUpload(bytes, filename);
    assert.ok(preview.material.filename.length <= 240);
    assert.match(preview.material.filename, /\.json$/);
    assert.doesNotThrow(() => encodeURIComponent(preview.material.filename));
  }
});

test('new disclosures require real calendar dates and rejected requests do not create materials', async () => {
  const { input } = await fixture();
  for (const documentDate of ['2025-02-30', '2023-02-29', '2024-13-01', '0000-01-01']) {
    assert.throws(
      () => validateMaterial({ ...input, documentDate }),
      (error: unknown) => {
        assert.ok(error instanceof ApiFault);
        assert.equal(error.status, 400);
        assert.equal(error.code, 'INVALID_MATERIAL');
        return true;
      }
    );
  }
  assert.equal(
    validateMaterial({ ...input, documentDate: '2024-02-29' }).documentDate,
    '2024-02-29'
  );
  const service = await openService();
  try {
    const invalid = await service.request('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, documentDate: '2025-02-30' }),
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).code, 'INVALID_MATERIAL');
    const store = await service.workspaceForUser(service.session.user!.id);
    assert.equal(store.state.materials.length, 0);
    const valid = await service.request('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, documentDate: '2024-02-29' }),
    });
    assert.equal(valid.status, 201);
    assert.equal((await valid.json()).documentDate, '2024-02-29');
  } finally {
    await service.close();
  }
});

test('legacy saved disclosure dates remain readable and unchanged without allowing new invalid-date input', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-legacy-date-'));
  try {
    const { input } = await fixture();
    const store = new WorkspaceStore(process.cwd(), directory);
    await store.initialize();
    const legacy: Material = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      documentDate: '2025-02-30',
    };
    store.state.materials.push(legacy);
    await store.persist();
    const reopened = new WorkspaceStore(process.cwd(), directory);
    await reopened.initialize();
    assert.deepEqual(reopened.state.materials[0], legacy);
    assert.equal(validateMaterial(legacy, { saved: true }).documentDate, '2025-02-30');
    assert.throws(() => validateMaterial(legacy), ApiFault);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
