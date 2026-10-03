import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AnalysisTask, AuthSession, DemoCase, Material } from '../shared/contracts.js';
import { createApp } from '../server/app.js';
import { previewUpload } from '../server/import.js';
import type { ModelConfig } from '../server/model.js';

async function setup(model: ModelConfig = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-test-'));
  const service = await createApp({ root: process.cwd(), dataDir: directory, model });
  const server = service.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (url: string, options: RequestInit = {}) => fetch(base + url, options);
  return {
    ...service,
    directory,
    request,
    server,
    close: async () => {
      await service.waitForIdle();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      service.auth.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
interface Client {
  cookie: string;
  csrf: string;
  user: NonNullable<AuthSession['user']>;
}
async function register(
  service: Awaited<ReturnType<typeof setup>>,
  email: string
): Promise<Client> {
  const response = await service.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name: '测试用户', password: 'test-strong-password' }),
  });
  assert.equal(response.status, 201);
  const body = (await response.json()) as AuthSession;
  assert.ok(body.user);
  assert.ok(body.csrfToken);
  const setCookie = response.headers.get('set-cookie')!;
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  return { cookie: setCookie.split(';')[0]!, csrf: body.csrfToken, user: body.user };
}
function options(client: Client, body?: unknown, method = 'GET'): RequestInit {
  return {
    method,
    headers: {
      Cookie: client.cookie,
      'X-CSRF-Token': client.csrf,
      'Content-Type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}
async function createTask(
  service: Awaited<ReturnType<typeof setup>>,
  client: Client,
  demo: DemoCase
): Promise<AnalysisTask> {
  if (['songyuan', 'hikvision', 'missing', 'conflict'].includes(demo.id)) {
    assert.equal(
      (await service.request(`/api/cases/${demo.id}/import`, options(client, {}, 'POST'))).status,
      201
    );
  }
  const response = await service.request(
    '/api/tasks',
    options(
      client,
      {
        title: '真实接口测试',
        company: demo.company,
        year: demo.year,
        materialIds: demo.materialIds,
      },
      'POST'
    )
  );
  assert.equal(response.status, 202);
  const pending = (await response.json()) as AnalysisTask;
  await service.waitForIdle();
  return (await (
    await service.request(`/api/tasks/${pending.id}`, options(client))
  ).json()) as AnalysisTask;
}

test('authenticated API cases → task → questions → exports → persistence; users are isolated', async () => {
  const service = await setup();
  try {
    assert.equal((await service.request('/api/health')).status, 200);
    assert.equal((await service.request('/api/workspace')).status, 200);
    const visitorSession = (await (
      await service.request('/api/auth/session')
    ).json()) as AuthSession;
    assert.equal(visitorSession.user?.isGuest, true);
    assert.ok(visitorSession.csrfToken);
    assert.equal(visitorSession.registrationEnabled, true);
    const cases = (await (await service.request('/api/cases')).json()) as DemoCase[];
    assert.equal(cases.length, 4);
    const alice = await register(service, 'Alice@Example.com');
    const removedExample = await service.request('/api/public/examples', options(alice));
    assert.equal(removedExample.status, 404);
    assert.equal(((await removedExample.json()) as { code: string }).code, 'ENDPOINT_NOT_FOUND');
    const bob = await register(service, 'bob@example.com');
    assert.equal(alice.user.email, 'alice@example.com');
    const task = await createTask(service, alice, cases[0]!);
    assert.equal(task.status, 'completed');
    assert.equal(task.report?.verdict, 'attention');
    assert.equal(task.stages.filter((stage) => stage.status === 'completed').length, 5);
    assert.equal((await service.request(`/api/tasks/${task.id}`, options(bob))).status, 404);
    assert.equal(
      (await service.request(`/api/tasks/${task.id}/export?format=json`, options(bob))).status,
      404
    );
    const question = task.report!.questions[0]!;
    const update = await service.request(
      `/api/tasks/${task.id}/questions/${question.id}`,
      options(alice, { status: 'done' }, 'PATCH')
    );
    assert.equal(update.status, 200);
    const store = await service.workspaceForUser(alice.user.id);
    const saved = JSON.parse(await readFile(path.join(store.dataDir, 'workspace.json'), 'utf8'));
    assert.equal(saved.tasks[0].report.questions[0].status, 'done');
    const html = await service.request(`/api/tasks/${task.id}/export?format=html`, options(alice));
    assert.equal(html.status, 200);
    const htmlText = await html.text();
    assert.match(htmlText, /@media print/);
    assert.match(htmlText, /366373098.93/);
    assert.match(htmlText, /原始分组行/);
    const json = (await (
      await service.request(`/api/tasks/${task.id}/export?format=json`, options(alice))
    ).json()) as AnalysisTask;
    assert.equal(json.report?.snapshot[0]?.observations.length, 12);
    assert.equal(
      (
        await service.request(
          `/api/materials/${cases[0]!.materialIds[0]}`,
          options(alice, undefined, 'DELETE')
        )
      ).status,
      409
    );
    const restricted = await createTask(service, alice, cases[2]!);
    assert.equal(restricted.report?.verdict, 'insufficient');
    const mixed = await createTask(service, alice, cases[3]!);
    assert.equal(mixed.report?.verdict, 'conflict');
    assert.equal(
      (await service.request('/api/reset', options(bob, { confirm: 'RESET_DEMO' }, 'POST'))).status,
      200
    );
    assert.equal((await service.request(`/api/tasks/${task.id}`, options(alice))).status, 200);
  } finally {
    await service.close();
  }
});
test('task export binds both formats to the requested saved version without returning newer content', async () => {
  const service = await setup();
  try {
    const alice = await register(service, 'export-version@example.com');
    const bob = await register(service, 'export-other@example.com');
    const cases = (await (await service.request('/api/cases')).json()) as DemoCase[];
    const original = await createTask(service, alice, cases[0]!);
    const exportUrl = (format: 'html' | 'json', updatedAt?: string) =>
      `/api/tasks/${original.id}/export?format=${format}${updatedAt === undefined ? '' : `&expectedUpdatedAt=${encodeURIComponent(updatedAt)}`}`;
    for (const format of ['html', 'json'] as const) {
      assert.equal(
        (await service.request(exportUrl(format, original.updatedAt), options(alice))).status,
        200
      );
    }
    const marker = 'new-version-private-note';
    const update = await service.request(
      `/api/tasks/${original.id}/context`,
      options(
        alice,
        { contextNotes: { 'external.promise': { done: false, note: marker } } },
        'PATCH'
      )
    );
    assert.equal(update.status, 200);
    const current = (await update.json()) as AnalysisTask;
    assert.notEqual(current.updatedAt, original.updatedAt);
    for (const format of ['html', 'json'] as const) {
      const stale = await service.request(exportUrl(format, original.updatedAt), options(alice));
      assert.equal(stale.status, 409);
      assert.equal(stale.headers.get('content-disposition'), null);
      const error = await stale.json();
      assert.deepEqual(error, {
        error: '报告已更新，请重新读取报告后再导出。',
        code: 'TASK_EXPORT_CHANGED',
      });
      assert.doesNotMatch(JSON.stringify(error), new RegExp(marker));
      const fresh = await service.request(exportUrl(format, current.updatedAt), options(alice));
      assert.equal(fresh.status, 200);
      assert.match(await fresh.text(), new RegExp(marker));
      const compatible = await service.request(exportUrl(format), options(alice));
      assert.equal(compatible.status, 200);
      assert.match(await compatible.text(), new RegExp(marker));
      assert.equal(
        (await service.request(exportUrl(format, original.updatedAt), options(bob))).status,
        404
      );
    }
  } finally {
    await service.close();
  }
});

test('real login/logout, CSRF, password change, invalid formats and credentials', async () => {
  const service = await setup();
  try {
    const client = await register(service, 'security@example.com');
    const badCsrf = await service.request('/api/reset', {
      ...options(client, { confirm: 'RESET_DEMO' }, 'POST'),
      headers: { Cookie: client.cookie, 'Content-Type': 'application/json' },
    });
    assert.equal(badCsrf.status, 403);
    assert.equal(
      (await service.request('/api/auth/profile', options(client, { name: '新名字' }, 'PATCH')))
        .status,
      200
    );
    const changed = await service.request(
      '/api/auth/password',
      options(
        client,
        { currentPassword: 'test-strong-password', newPassword: 'changed-strong-password' },
        'POST'
      )
    );
    assert.equal(changed.status, 200);
    assert.equal((await service.request('/api/account', options(client))).status, 401);
    const changedSession = (await changed.json()) as AuthSession;
    client.cookie = changed.headers.get('set-cookie')!.split(';')[0]!;
    client.csrf = changedSession.csrfToken!;
    const logout = await service.request('/api/auth/logout', options(client, {}, 'POST'));
    assert.equal(logout.status, 200);
    assert.equal((await service.request('/api/account', options(client))).status, 401);
    const wrong = await service.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'security@example.com', password: 'test-strong-password' }),
    });
    assert.equal(wrong.status, 401);
    const login = await service.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'security@example.com', password: 'changed-strong-password' }),
    });
    assert.equal(login.status, 200);
    client.cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    client.csrf = ((await login.json()) as AuthSession).csrfToken!;
    assert.equal(
      (await service.request('/api/tasks', options(client, { materialIds: [] }, 'POST'))).status,
      400
    );
    assert.equal(
      (await service.request('/api/materials', options(client, { filename: '../x' }, 'POST')))
        .status,
      400
    );
    assert.equal(
      (await service.request('/api/sources/not-listed/pdf', options(client))).status,
      404
    );
    assert.equal((await service.request('/api/reset', options(client, {}, 'POST'))).status, 400);
    assert.equal(
      (
        await service.request('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'https://evil.invalid' },
          body: JSON.stringify({
            email: 'evil@example.com',
            name: 'evil',
            password: 'test-strong-password',
          }),
        })
      ).status,
      403
    );
    const db = await readFile(path.join(service.directory, 'accounts.sqlite'));
    assert.equal(db.includes(Buffer.from('test-strong-password')), false);
    assert.equal(db.includes(Buffer.from(client.cookie.split('=')[1]!)), false);
  } finally {
    await service.close();
  }
});

test('invalid account fields are distinguished from weak passwords without changing the account', async () => {
  const service = await setup();
  try {
    const attempt = (body: unknown) =>
      service.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    for (const input of [
      { email: 'not-an-email', name: '测试', password: 'test-strong-password' },
      { email: 'invalid-name@example.com', name: ' ', password: 'test-strong-password' },
    ]) {
      const rejected = await attempt(input);
      assert.equal(rejected.status, 400);
      assert.equal((await rejected.json()).code, 'INVALID_ACCOUNT');
    }
    const short = await attempt({
      email: 'short-password@example.com',
      name: '测试',
      password: 'short',
    });
    assert.equal(short.status, 400);
    assert.equal((await short.json()).code, 'WEAK_PASSWORD');
    const client = await register(service, 'password-validation@example.com');
    for (const input of [
      { newPassword: 'changed-strong-password' },
      { currentPassword: '', newPassword: 'changed-strong-password' },
    ]) {
      const rejected = await service.request('/api/auth/password', options(client, input, 'POST'));
      assert.equal(rejected.status, 400);
      assert.equal((await rejected.json()).code, 'INVALID_ACCOUNT');
    }
    const weak = await service.request(
      '/api/auth/password',
      options(
        client,
        {
          currentPassword: 'test-strong-password',
          newPassword: 'short',
        },
        'POST'
      )
    );
    assert.equal(weak.status, 400);
    assert.equal((await weak.json()).code, 'WEAK_PASSWORD');
    assert.equal((await service.request('/api/workspace', options(client))).status, 200);
  } finally {
    await service.close();
  }
});

test('profile updates include the saved timezone in both their session response and subsequent session reads', async () => {
  const service = await setup();
  try {
    const alice = await register(service, 'timezone-alice@example.com');
    const bob = await register(service, 'timezone-bob@example.com');
    assert.equal(alice.user.timezone, 'Asia/Shanghai');
    const updated = await service.request(
      '/api/auth/profile',
      options(
        alice,
        {
          name: '时区测试',
          timezone: 'Europe/London',
        },
        'PATCH'
      )
    );
    assert.equal(updated.status, 200);
    assert.equal(((await updated.json()) as AuthSession).user!.timezone, 'Europe/London');
    const latest = (await (
      await service.request('/api/auth/session', options(alice))
    ).json()) as AuthSession;
    assert.equal(latest.user!.timezone, 'Europe/London');
    const other = (await (
      await service.request('/api/auth/session', options(bob))
    ).json()) as AuthSession;
    assert.equal(other.user!.timezone, 'Asia/Shanghai');
    const rejected = await service.request(
      '/api/auth/profile',
      options(
        alice,
        {
          name: '无效时区',
          timezone: 'Invalid/Timezone',
        },
        'PATCH'
      )
    );
    assert.equal(rejected.status, 400);
    const unchanged = (await (
      await service.request('/api/auth/session', options(alice))
    ).json()) as AuthSession;
    assert.equal(unchanged.user!.timezone, 'Europe/London');
    assert.equal(unchanged.user!.name, '时区测试');
  } finally {
    await service.close();
  }
});
test('upload preview actually handles JSON, CSV and format errors without saving', async () => {
  const service = await setup();
  try {
    const client = await register(service, 'upload@example.com');
    const fixture = await readFile('data/cases/songyuan-2025.json');
    const form = new FormData();
    form.set('file', new Blob([fixture], { type: 'application/json' }), 'changed.json');
    const response = await service.request('/api/materials/preview', {
      method: 'POST',
      headers: { Cookie: client.cookie, 'X-CSRF-Token': client.csrf },
      body: form,
    });
    assert.equal(response.status, 200);
    const preview = (await response.json()) as { material: Omit<Material, 'id' | 'createdAt'> };
    assert.equal(preview.material.filename, 'changed.json');
    assert.equal(preview.material.rawSourceId, undefined);
    const saved = await service.request(
      '/api/materials',
      options(client, preview.material, 'POST')
    );
    assert.equal(saved.status, 201);
    const csv =
      'company,shortName,year,key,value,unit,currency,scope,period,page,quote,documentDate\nTest,Test,2025,netProfit,100.00,wan,CNY,consolidated,annual,2,测试,2026-01-01\nTest,Test,2025,operatingCashFlow,50.00,wan,CNY,consolidated,annual,2,测试,2026-01-01\n';
    const result = await previewUpload(Buffer.from(csv), 'test.csv');
    assert.equal(result.material.observations[0]?.unit, 'wan');
    assert.equal(result.material.observations.length, 2);
    const invalid = new FormData();
    invalid.set('file', new Blob(['bad']), 'invalid.exe');
    assert.equal(
      (
        await service.request('/api/materials/preview', {
          method: 'POST',
          headers: { Cookie: client.cookie, 'X-CSRF-Token': client.csrf },
          body: invalid,
        })
      ).status,
      415
    );
    await assert.rejects(() => previewUpload(Buffer.from('{bad'), 'bad.json'));
    await assert.rejects(() => previewUpload(Buffer.from('not-pdf'), 'bad.pdf'));
  } finally {
    await service.close();
  }
});
test('sessions and reports survive real server restart', async () => {
  const service = await setup();
  let restored: Awaited<ReturnType<typeof createApp>> | undefined;
  let restoredServer: ReturnType<typeof service.app.listen> | undefined;
  try {
    const client = await register(service, 'restart@example.com');
    const originalBytes = await readFile('data/cases/songyuan-2025.json');
    const form = new FormData();
    form.set('file', new Blob([originalBytes]), 'restart-source.json');
    const previewResponse = await service.request('/api/materials/preview', {
      method: 'POST',
      headers: { Cookie: client.cookie, 'X-CSRF-Token': client.csrf },
      body: form,
    });
    const preview =
      (await previewResponse.json()) as import('../shared/contracts.js').UploadPreview;
    const material = (await (
      await service.request('/api/materials', options(client, preview.material, 'POST'))
    ).json()) as Material;
    const cases = (await (await service.request('/api/cases')).json()) as DemoCase[];
    const task = await createTask(service, client, cases[1]!);
    await new Promise<void>((resolve) => service.server.close(() => resolve()));
    service.auth.close();
    restored = await createApp({ root: process.cwd(), dataDir: service.directory, model: {} });
    const store = await restored.workspaceForUser(client.user.id);
    assert.equal(store.state.tasks[0]?.id, task.id);
    assert.equal(
      store.state.tasks[0]?.report?.metrics.find((item) => item.key === 'cashConversion')?.value,
      '164.18'
    );
    const req = { headers: { cookie: client.cookie } } as Parameters<
      typeof restored.auth.session
    >[0];
    assert.equal((await restored.auth.session(req))?.user.id, client.user.id);
    restoredServer = restored.app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => restoredServer!.once('listening', resolve));
    const base = `http://127.0.0.1:${(restoredServer.address() as AddressInfo).port}`;
    const download = await fetch(`${base}/api/materials/${material.id}/file`, options(client));
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), originalBytes);
  } finally {
    if (restoredServer?.listening)
      await new Promise<void>((resolve) => restoredServer!.close(() => resolve()));
    restored?.auth.close();
    await rm(service.directory, { recursive: true, force: true });
  }
});

test('expired sessions, login limits and 25MB uploads are enforced', async () => {
  const service = await setup();
  try {
    const client = await register(service, 'limits@example.com');
    const oversized = new FormData();
    oversized.set('file', new Blob([new Uint8Array(25 * 1024 * 1024 + 1)]), 'large.json');
    const upload = await service.request('/api/materials/preview', {
      method: 'POST',
      headers: { Cookie: client.cookie, 'X-CSRF-Token': client.csrf },
      body: oversized,
    });
    assert.equal(upload.status, 413);
    for (let index = 0; index < 11; index++) {
      const login = await service.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'unknown@example.com', password: 'test-strong-password' }),
      });
      assert.equal(login.status, index === 10 ? 429 : 401);
    }
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(path.join(service.directory, 'accounts.sqlite'));
    db.prepare('UPDATE session SET expiresAt=0').run();
    db.close();
    assert.equal((await service.request('/api/account', options(client))).status, 401);
  } finally {
    await service.close();
  }
});

test('retained original bytes are owner-bound, immutable, persistent and deleted with unused materials', async () => {
  const service = await setup();
  try {
    const alice = await register(service, 'original-alice@example.com');
    const bob = await register(service, 'original-bob@example.com');
    const bytes = await readFile('data/cases/songyuan-2025.json');
    const form = new FormData();
    form.set('file', new Blob([bytes]), '原始核查.json');
    const response = await service.request('/api/materials/preview', {
      method: 'POST',
      headers: { Cookie: alice.cookie, 'X-CSRF-Token': alice.csrf },
      body: form,
    });
    assert.equal(response.status, 200);
    const preview = (await response.json()) as import('../shared/contracts.js').UploadPreview;
    assert.ok(preview.uploadId);
    assert.equal(preview.material.uploadId, preview.uploadId);
    const forged = await service.request('/api/materials', options(bob, preview.material, 'POST'));
    assert.equal(forged.status, 404);
    const wrongHash = await service.request(
      '/api/materials',
      options(alice, { ...preview.material, sha256: '0'.repeat(64) }, 'POST')
    );
    assert.equal(wrongHash.status, 400);
    const saved = await service.request('/api/materials', options(alice, preview.material, 'POST'));
    assert.equal(saved.status, 201);
    const material = (await saved.json()) as Material;
    const download = await service.request(`/api/materials/${material.id}/file`, options(alice));
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    assert.equal(
      (await service.request(`/api/materials/${material.id}/file`, options(bob))).status,
      404
    );
    assert.equal(
      (await service.request(`/api/materials/${material.id}`, options(bob, undefined, 'DELETE')))
        .status,
      404
    );
    const { WorkspaceStore } = await import('../server/store.js');
    const originalStore = await service.workspaceForUser(alice.user.id);
    const restartedStore = new WorkspaceStore(process.cwd(), originalStore.dataDir);
    await restartedStore.initialize();
    const persisted = restartedStore.state.materials.find((item) => item.id === material.id)!;
    assert.deepEqual((await restartedStore.materialFile(persisted)).buffer, bytes);
    const task = await createTask(service, alice, {
      id: 'uploaded',
      title: '上传',
      description: '',
      company: material.company,
      shortName: material.shortName,
      materialIds: [material.id],
      year: 2025,
      kind: 'contrast',
    });
    assert.equal(
      (await service.request(`/api/materials/${material.id}`, options(alice, undefined, 'DELETE')))
        .status,
      409
    );
    assert.equal(
      (await service.request(`/api/tasks/${task.id}`, options(alice, undefined, 'DELETE'))).status,
      200
    );
    assert.equal(
      (await service.request(`/api/materials/${material.id}`, options(alice, undefined, 'DELETE')))
        .status,
      200
    );
    assert.equal(
      (await service.request(`/api/materials/${material.id}/file`, options(alice))).status,
      404
    );
    assert.equal(originalStore.state.uploads[preview.uploadId!], undefined);
    await assert.rejects(() =>
      readFile(path.join(originalStore.dataDir, 'uploads', `${preview.uploadId}.blob`))
    );
  } finally {
    await service.close();
  }
});

test('material note limits include saved provenance and keep the workspace readable after restart', async () => {
  const service = await setup();
  try {
    const client = await register(service, 'material-notes@example.com');
    const template = await (await service.request('/api/public/input-template?format=json')).json();
    const notes = Array.from({ length: 100 }, (_, index) => `用户备注 ${index + 1}`);
    const rejected = await service.request(
      '/api/materials',
      options(client, { ...template, notes: [...notes, '额外备注'] }, 'POST')
    );
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).code, 'INVALID_MATERIAL');
    const store = await service.workspaceForUser(client.user.id);
    assert.equal(store.state.materials.length, 0);
    const saved = await service.request(
      '/api/materials',
      options(client, { ...template, notes }, 'POST')
    );
    assert.equal(saved.status, 201);
    const material = (await saved.json()) as Material;
    assert.equal(material.notes.length, 102);
    assert.deepEqual(material.notes.slice(0, 100), notes);
    const { WorkspaceStore } = await import('../server/store.js');
    const reopened = new WorkspaceStore(process.cwd(), store.dataDir);
    await reopened.initialize();
    assert.deepEqual(reopened.state.materials[0], material);
    const task = await createTask(service, client, {
      id: 'uploaded',
      title: '备注上限核查',
      description: '',
      company: material.company,
      shortName: material.shortName,
      materialIds: [material.id],
      year: 2025,
      kind: 'contrast',
    });
    assert.equal(task.status, 'completed');
  } finally {
    await service.close();
  }
});
test('pending uploads expire after 24h, storage quota applies to real bytes, reset only clears the owner', async () => {
  const service = await setup();
  try {
    const alice = await register(service, 'expiry-alice@example.com');
    const bob = await register(service, 'expiry-bob@example.com');
    const bytes = await readFile('data/cases/songyuan-2025.json');
    const upload = async (client: Client) => {
      const form = new FormData();
      form.set('file', new Blob([bytes]), 'original.json');
      return service.request('/api/materials/preview', {
        method: 'POST',
        headers: { Cookie: client.cookie, 'X-CSRF-Token': client.csrf },
        body: form,
      });
    };
    const expired = (await (
      await upload(alice)
    ).json()) as import('../shared/contracts.js').UploadPreview;
    const store = await service.workspaceForUser(alice.user.id);
    store.state.uploads[expired.uploadId!]!.createdAt = new Date(
      Date.now() - 25 * 60 * 60 * 1000
    ).toISOString();
    await store.persist();
    const confirmation = await service.request(
      '/api/materials',
      options(alice, expired.material, 'POST')
    );
    assert.equal(confirmation.status, 410);
    await assert.rejects(() =>
      readFile(path.join(store.dataDir, 'uploads', `${expired.uploadId}.blob`))
    );
    store.uploadQuotaBytes = bytes.length;
    const first = await upload(alice);
    assert.equal(first.status, 200);
    const retained = (await first.json()) as import('../shared/contracts.js').UploadPreview;
    assert.equal((await upload(alice)).status, 413);
    const other = (await (
      await upload(bob)
    ).json()) as import('../shared/contracts.js').UploadPreview;
    const bobMaterial = (await (
      await service.request('/api/materials', options(bob, other.material, 'POST'))
    ).json()) as Material;
    assert.equal(
      (await service.request('/api/reset', options(alice, { confirm: 'RESET_DEMO' }, 'POST')))
        .status,
      200
    );
    await assert.rejects(() =>
      readFile(path.join(store.dataDir, 'uploads', `${retained.uploadId}.blob`))
    );
    assert.equal(
      (await service.request(`/api/materials/${bobMaterial.id}/file`, options(bob))).status,
      200
    );
  } finally {
    await service.close();
  }
});

test('task analysis always enables AI for omitted and legacy model choices, and upgrades old tasks only on retry', async () => {
  let calls = 0;
  const service = await setup({
    apiKey: 'test-only',
    baseUrl: 'https://provider.example/v1',
    model: 'grok-4.7-fast',
    fetch: async (_url, request) => {
      calls++;
      const payload = JSON.parse(String(request?.body));
      const input = JSON.parse(payload.messages[1].content);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  explanations: [
                    {
                      text: '公开历史金额不能单独裁定回款风险，需要继续询证。',
                      citations: [input.evidence[0].id],
                    },
                  ],
                }),
              },
            },
          ],
        })
      );
    },
  });
  try {
    const client = await register(service, 'automatic-ai@example.com');
    const cases = (await (await service.request('/api/cases')).json()) as DemoCase[];
    const defaultTask = await createTask(service, client, cases[0]!);
    assert.equal(defaultTask.useModel, true);
    assert.equal(defaultTask.report?.model.status, 'completed');
    assert.equal(calls, 1);
    for (const legacyChoice of [false, true]) {
      const response = await service.request(
        '/api/tasks',
        options(
          client,
          {
            title: '自动智能解释',
            company: cases[0]!.company,
            year: 2025,
            materialIds: cases[0]!.materialIds,
            useModel: legacyChoice,
          },
          'POST'
        )
      );
      assert.equal(response.status, 202);
      const pending = (await response.json()) as AnalysisTask;
      assert.equal(pending.useModel, true);
      await service.waitForIdle();
      const task = (await (
        await service.request(`/api/tasks/${pending.id}`, options(client))
      ).json()) as AnalysisTask;
      assert.equal(task.useModel, true);
      assert.equal(task.report?.model.status, 'completed');
      assert.equal(task.report?.model.provider, 'provider.example');
      assert.equal(task.report?.model.name, 'grok-4.7-fast');
    }
    assert.equal(calls, 3);
    const store = await service.workspaceForUser(client.user.id);
    const historical = store.state.tasks.find((task) => task.id === defaultTask.id)!;
    historical.useModel = false;
    historical.report!.model = { enabled: false, status: 'not-requested' };
    await store.persist();
    const saved = (await (
      await service.request(`/api/tasks/${historical.id}`, options(client))
    ).json()) as AnalysisTask;
    assert.equal(saved.useModel, false, 'opening history never rewrites a completed analysis');
    assert.equal(saved.report?.model.status, 'not-requested');
    assert.equal(calls, 3);
    const retried = await service.request(
      `/api/tasks/${historical.id}/retry`,
      options(client, {}, 'POST')
    );
    assert.equal(retried.status, 202);
    assert.equal(((await retried.json()) as AnalysisTask).useModel, true);
    await service.waitForIdle();
    assert.equal(calls, 4);
    const updated = (await (
      await service.request(`/api/tasks/${historical.id}`, options(client))
    ).json()) as AnalysisTask;
    assert.equal(updated.report?.model.status, 'completed');
  } finally {
    await service.close();
  }
});

test('automatic AI preserves rule reports on failure and never claims a model call for conflicted evidence', async () => {
  let calls = 0;
  const service = await setup({
    apiKey: 'test-only',
    fetch: async () => {
      calls++;
      throw new Error('model unavailable fixture');
    },
  });
  try {
    const client = await register(service, 'ai-fallback@example.com');
    const cases = (await (await service.request('/api/cases')).json()) as DemoCase[];
    const failed = await createTask(service, client, cases[0]!);
    assert.equal(failed.useModel, true);
    assert.equal(failed.status, 'completed');
    assert.equal(failed.report?.model.status, 'failed');
    assert.ok(failed.report?.metrics.some((metric) => metric.value !== null));
    assert.equal(calls, 1);
    const conflicted = await createTask(
      service,
      client,
      cases.find((item) => item.id === 'conflict')!
    );
    assert.equal(conflicted.useModel, true);
    assert.equal(conflicted.report?.verdict, 'conflict');
    assert.equal(conflicted.status, 'completed');
    assert.equal(calls, 1, 'conflicting evidence must not trigger unsupported model inference');
    assert.match(conflicted.stages[3]!.message!, /未调用模型/);
    assert.doesNotMatch(conflicted.stages[3]!.message!, /引用 ID 与格式已检查/);
  } finally {
    await service.close();
  }
});
