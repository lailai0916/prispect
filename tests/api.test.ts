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
    assert.equal((await service.request('/api/workspace')).status, 401);
    assert.deepEqual(await (await service.request('/api/auth/session')).json(), {
      user: null,
      csrfToken: null,
    });
    const cases = (await (await service.request('/api/cases')).json()) as DemoCase[];
    assert.equal(cases.length, 4);
    const publicExamples = (await (await service.request('/api/public/examples')).json()) as {
      metrics: { key: string; value: string }[];
    }[];
    assert.equal(
      publicExamples[0]?.metrics.find((item) => item.key === 'cashConversion')?.value,
      '7.15'
    );
    const alice = await register(service, 'Alice@Example.com');
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
    assert.equal((await service.request('/api/workspace', options(client))).status, 401);
    const changedSession = (await changed.json()) as AuthSession;
    client.cookie = changed.headers.get('set-cookie')!.split(';')[0]!;
    client.csrf = changedSession.csrfToken!;
    const logout = await service.request('/api/auth/logout', options(client, {}, 'POST'));
    assert.equal(logout.status, 200);
    assert.equal((await service.request('/api/workspace', options(client))).status, 401);
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
    assert.equal(restored.auth.session(req)?.user.id, client.user.id);
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
    db.prepare('UPDATE sessions SET expires_at=0').run();
    db.close();
    assert.equal((await service.request('/api/workspace', options(client))).status, 401);
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

test('task model consent defaults off, explicit calls and retries preserve the saved choice', async () => {
  let calls = 0;
  const service = await setup({
    apiKey: 'test-only',
    baseUrl: 'https://provider.example/v1',
    model: 'gpt-6.1-sol',
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
    const client = await register(service, 'consent@example.com');
    const cases = (await (await service.request('/api/cases')).json()) as DemoCase[];
    const defaultTask = await createTask(service, client, cases[0]!);
    assert.equal(defaultTask.useModel, false);
    assert.equal(defaultTask.report?.model.status, 'not-requested');
    assert.equal(calls, 0);
    const defaultExport = await (
      await service.request(`/api/tasks/${defaultTask.id}/export?format=html`, options(client))
    ).text();
    assert.match(defaultExport, /本次未向模型服务发送材料/);
    const chosen = await service.request(
      '/api/tasks',
      options(
        client,
        {
          title: '显式选择智能解释',
          company: cases[0]!.company,
          year: 2025,
          materialIds: cases[0]!.materialIds,
          useModel: true,
        },
        'POST'
      )
    );
    assert.equal(chosen.status, 202);
    const pending = (await chosen.json()) as AnalysisTask;
    await service.waitForIdle();
    const task = (await (
      await service.request(`/api/tasks/${pending.id}`, options(client))
    ).json()) as AnalysisTask;
    assert.equal(task.useModel, true);
    assert.equal(task.report?.model.status, 'completed');
    assert.equal(task.report?.model.provider, 'provider.example');
    assert.equal(task.report?.model.name, 'gpt-6.1-sol');
    assert.equal(calls, 1);
    assert.equal(
      (await service.request(`/api/tasks/${task.id}/retry`, options(client, {}, 'POST'))).status,
      202
    );
    await service.waitForIdle();
    assert.equal(calls, 2);
    assert.equal(
      (await service.request(`/api/tasks/${defaultTask.id}/retry`, options(client, {}, 'POST')))
        .status,
      202
    );
    await service.waitForIdle();
    assert.equal(calls, 2);
  } finally {
    await service.close();
  }
});
