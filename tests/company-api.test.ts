import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type {
  AuthSession,
  CompanyAdoptResponse,
  CompanyCandidatePreview,
  CompanyIdentity,
  CompanyResearchRun,
  Material,
  AnalysisTask,
} from '../shared/contracts.js';
import { createApp } from '../server/app.js';
import type { CompanyService } from '../server/company-routes.js';

const identity: CompanyIdentity = {
  securityCode: '300893',
  orgId: '9900039861',
  shortName: '松原安全',
  companyName: '浙江松原汽车安全系统股份有限公司',
  exchange: 'szse',
  sourceUrl: 'https://www.cninfo.com.cn/',
};
const buffer = Buffer.from('%PDF-1.7\nAPI isolation fixture, not a parsed annual report.');
const password = 'company-api-test-password';
interface Client {
  cookie: string;
  csrf: string;
  userId: string;
}
function requestOptions(client: Client, body?: unknown, method = 'GET'): RequestInit {
  return {
    method,
    headers: {
      Cookie: client.cookie,
      'X-CSRF-Token': client.csrf,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}
async function fixturePreview(): Promise<CompanyCandidatePreview> {
  const input = JSON.parse(
    await readFile(path.join(process.cwd(), 'data/cases/songyuan-2025.json'), 'utf8')
  ) as Omit<Material, 'id' | 'createdAt'>;
  return {
    material: {
      ...input,
      filename: '松原安全 2025 年度报告(原件).pdf',
      sha256: createHash('sha256').update(buffer).digest('hex'),
      rawSourceId: undefined,
    },
    reviewRequired: true,
    warnings: [],
    checks: [],
    tablePages: [190, 191],
  };
}
async function serviceMock(): Promise<CompanyService> {
  const preview = await fixturePreview();
  return {
    searchCompanies: async (query) => ({
      query,
      candidates: query === '不存在样本' ? [] : [identity],
      limitedToListed: true,
      source: 'cninfo',
      truncated: false,
    }),
    runCompanyResearch: async (input, options) => {
      assert.equal(input.useModel, true, 'company research always receives enabled AI');
      const startedAt = new Date().toISOString();
      const entry = {
        id: 'actual-test-tool',
        tool: 'fixture-download',
        label: '隔离测试工具',
        status: 'running' as const,
        startedAt,
        inputSummary: '仅测试隔离与原件绑定',
        sources: [],
      };
      await options.onUpdate?.(entry);
      await options.onUpdate?.({
        ...entry,
        status: 'completed',
        finishedAt: new Date().toISOString(),
        outputSummary: '返回固定测试字节',
      });
      return {
        identity,
        announcements: [],
        preview: structuredClone(preview),
        buffer,
        model: { requested: true, status: 'not-configured' },
      };
    },
  };
}
async function openService(directory: string, service: CompanyService) {
  const app = await createApp({
    root: process.cwd(),
    dataDir: directory,
    model: {},
    companyService: service,
  });
  const server = app.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    ...app,
    request: (url: string, init?: RequestInit) => fetch(base + url, init),
    stop: async () => {
      await app.waitForIdle();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      app.auth.close();
    },
  };
}
async function authenticate(
  service: Awaited<ReturnType<typeof openService>>,
  email: string,
  login = false
): Promise<Client> {
  const response = await service.request(`/api/auth/${login ? 'login' : 'register'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name: '企业查询验收', password }),
  });
  assert.equal(response.status, login ? 200 : 201);
  const session = (await response.json()) as AuthSession;
  assert.ok(session.user && session.csrfToken);
  return {
    cookie: response.headers.get('set-cookie')!.split(';')[0]!,
    csrf: session.csrfToken,
    userId: session.user.id,
  };
}
const runInput = {
  securityCode: identity.securityCode,
  orgId: identity.orgId,
  year: 2025,
  purpose: 'handover',
  researchMode: 'deep' as const,
};
async function makeRun(
  service: Awaited<ReturnType<typeof openService>>,
  client: Client,
  input: typeof runInput & { useModel?: boolean } = runInput
) {
  const response = await service.request(
    '/api/company-runs',
    requestOptions(client, input, 'POST')
  );
  assert.equal(response.status, 202);
  const queued = (await response.json()) as CompanyResearchRun;
  await service.waitForIdle();
  const result = await service.request(`/api/company-runs/${queued.id}`, requestOptions(client));
  assert.equal(result.status, 200);
  return (await result.json()) as CompanyResearchRun;
}

test('explicit deep company research requests AI with omitted, false and true legacy flags', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-company-ai-'));
  const service = await openService(directory, await serviceMock());
  try {
    const client = await authenticate(service, 'company-automatic-ai@example.com');
    for (const choice of [undefined, false, true]) {
      const run = await makeRun(service, client, {
        ...runInput,
        ...(choice === undefined ? {} : { useModel: choice }),
      });
      assert.equal(run.input.useModel, true);
      assert.equal(run.model.requested, true);
      assert.equal(run.model.status, 'not-configured');
    }
    const invalid = await service.request(
      '/api/company-runs',
      requestOptions(client, { ...runInput, useModel: 'false' }, 'POST')
    );
    assert.equal(invalid.status, 400);
  } finally {
    await service.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('company queries keep real trace events and original files private; confirmed adoption survives a crash between durable writes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-company-api-'));
  const mock = await serviceMock();
  let service: Awaited<ReturnType<typeof openService>> | undefined = await openService(
    directory,
    mock
  );
  try {
    const alice = await authenticate(service, 'company-alice@example.com');
    const bob = await authenticate(service, 'company-bob@example.com');
    assert.equal((await service.request('/api/companies/search?q=300893')).status, 401);
    assert.equal(
      (await service.request('/api/companies/search?q=', requestOptions(alice))).status,
      400
    );
    const unmatched = await (
      await service.request(
        '/api/companies/search?q=' + encodeURIComponent('不存在样本'),
        requestOptions(alice)
      )
    ).json();
    assert.deepEqual(unmatched.candidates, []);
    assert.equal(unmatched.limitedToListed, true);
    assert.equal(
      (
        await service.request('/api/company-runs', {
          ...requestOptions(alice, runInput, 'POST'),
          headers: { Cookie: alice.cookie, 'Content-Type': 'application/json' },
        })
      ).status,
      403
    );
    assert.equal(
      (
        await service.request('/api/company-runs', {
          ...requestOptions(alice, runInput, 'POST'),
          headers: { ...requestOptions(alice).headers, Origin: 'https://evil.invalid' },
        })
      ).status,
      403
    );
    assert.equal(
      (
        await service.request(
          '/api/company-runs',
          requestOptions(alice, { ...runInput, sourceUrl: 'http://127.0.0.1/private' }, 'POST')
        )
      ).status,
      400
    );
    let run = await makeRun(service, alice);
    assert.equal(run.status, 'ready');
    assert.equal(run.input.purpose, 'handover');
    assert.equal(run.input.useModel, true);
    assert.equal(run.trace.length, 1);
    assert.equal(run.trace[0]?.status, 'completed');
    assert.ok(run.trace[0]?.finishedAt);
    assert.equal('buffer' in run, false);
    assert.ok(run.preview?.material.uploadId);
    for (const suffix of ['', '/file'])
      assert.equal(
        (await service.request(`/api/company-runs/${run.id}${suffix}`, requestOptions(bob))).status,
        404
      );
    assert.equal(
      (
        await service.request(
          `/api/company-runs/${run.id}/adopt`,
          requestOptions(bob, { confirmed: true, material: run.preview!.material }, 'POST')
        )
      ).status,
      404
    );
    assert.equal(
      (
        await service.request(
          `/api/company-runs/${run.id}`,
          requestOptions(bob, undefined, 'DELETE')
        )
      ).status,
      404
    );
    assert.deepEqual(
      await (await service.request('/api/company-runs', requestOptions(bob))).json(),
      []
    );
    const originalFile = await service.request(
      `/api/company-runs/${run.id}/file`,
      requestOptions(alice)
    );
    assert.equal(originalFile.status, 200);
    assert.match(originalFile.headers.get('content-type')!, /application\/pdf/);
    const disposition = originalFile.headers.get('content-disposition')!;
    assert.match(disposition, /^inline; filename="company-annual-report\.pdf"; filename\*=UTF-8''/);
    const encodedFilename = disposition.split("filename*=UTF-8''")[1]!;
    assert.equal(decodeURIComponent(encodedFilename), '松原安全 2025 年度报告(原件).pdf');
    assert.match(encodedFilename, /%20/);
    assert.match(encodedFilename, /%28/);
    assert.match(encodedFilename, /%29/);
    assert.deepEqual(Buffer.from(await originalFile.arrayBuffer()), buffer);
    assert.equal(
      (
        await service.request(
          `/api/company-runs/${run.id}/adopt`,
          requestOptions(alice, { confirmed: false, material: run.preview!.material }, 'POST')
        )
      ).status,
      400
    );
    assert.equal(
      (
        await service.request(
          `/api/company-runs/${run.id}/adopt`,
          requestOptions(
            alice,
            { confirmed: true, material: { ...run.preview!.material, sha256: 'a'.repeat(64) } },
            'POST'
          )
        )
      ).status,
      400
    );

    // Fail the second write: saveMaterial has persisted, the job adoption has not.
    const store = await service.workspaceForUser(alice.userId);
    const persist = store.persist.bind(store);
    let writes = 0;
    store.persist = async () => {
      if (++writes === 2) throw new Error('simulated process interruption');
      await persist();
    };
    const firstAdoption = await service.request(
      `/api/company-runs/${run.id}/adopt`,
      requestOptions(alice, { confirmed: true, material: run.preview!.material }, 'POST')
    );
    assert.equal(firstAdoption.status, 500);
    store.persist = persist;
    await service.stop();
    service = undefined;
    const onDisk = JSON.parse(
      await readFile(path.join(directory, 'users', alice.userId, 'workspace.json'), 'utf8')
    );
    assert.equal(onDisk.companyRuns[0].status, 'ready');
    assert.equal(
      onDisk.materials.filter((item: Material) => item.uploadId === run.preview!.material.uploadId)
        .length,
      1
    );
    service = await openService(directory, mock);
    const restarted = await authenticate(service, 'company-alice@example.com', true);
    const recoveredResponse = await service.request(
      `/api/company-runs/${run.id}/adopt`,
      requestOptions(restarted, { confirmed: true, material: run.preview!.material }, 'POST')
    );
    assert.equal(recoveredResponse.status, 200);
    const recovered = (await recoveredResponse.json()) as CompanyAdoptResponse;
    assert.equal(recovered.run.status, 'adopted');
    const retry = await service.request(
      `/api/company-runs/${run.id}/adopt`,
      requestOptions(restarted, { confirmed: true, material: run.preview!.material }, 'POST')
    );
    assert.equal(retry.status, 200);
    assert.equal(((await retry.json()) as CompanyAdoptResponse).material.id, recovered.material.id);
    const taskResponse = await service.request(
      '/api/tasks',
      requestOptions(
        restarted,
        {
          title: '确认后核算',
          company: recovered.material.company,
          year: 2025,
          materialIds: [recovered.material.id],
          purpose: 'handover',
        },
        'POST'
      )
    );
    assert.equal(taskResponse.status, 202);
    const task = (await taskResponse.json()) as AnalysisTask;
    await service.waitForIdle();
    const completed = (await (
      await service.request(`/api/tasks/${task.id}`, requestOptions(restarted))
    ).json()) as AnalysisTask;
    assert.equal(
      completed.report?.metrics.find((metric) => metric.key === 'cashConversion')?.value,
      '7.15'
    );
    assert.equal(completed.purpose, 'handover');
    assert.equal(completed.report?.model.status, 'not-configured');
    assert.equal(
      (
        await service.request(
          `/api/company-runs/${run.id}`,
          requestOptions(restarted, undefined, 'DELETE')
        )
      ).status,
      200
    );
    assert.equal(
      (
        await service.request(
          `/api/materials/${recovered.material.id}/file`,
          requestOptions(restarted)
        )
      ).status,
      200
    );
    run = await makeRun(service, restarted);
    const unusedUpload = run.preview!.material.uploadId!;
    assert.equal(
      (
        await service.request(
          `/api/company-runs/${run.id}`,
          requestOptions(restarted, undefined, 'DELETE')
        )
      ).status,
      200
    );
    assert.equal(
      (await service.workspaceForUser(restarted.userId)).state.uploads[unusedUpload],
      undefined
    );
  } finally {
    await service?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('an active public query prevents overlapping downloads and destructive workspace operations', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-company-busy-'));
  const mock = await serviceMock();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const normal = mock.runCompanyResearch;
  mock.runCompanyResearch = async (input, options) => {
    await gate;
    return normal(input, options);
  };
  const service = await openService(directory, mock);
  try {
    const client = await authenticate(service, 'company-busy@example.com');
    const response = await service.request(
      '/api/company-runs',
      requestOptions(client, runInput, 'POST')
    );
    assert.equal(response.status, 202);
    const run = (await response.json()) as CompanyResearchRun;
    const summaries = await (
      await service.request('/api/company-records', requestOptions(client))
    ).json();
    assert.equal(summaries[0].deletionBlocked, true);
    assert.equal(
      (await service.request('/api/company-runs', requestOptions(client, runInput, 'POST'))).status,
      429
    );
    assert.equal(
      (
        await service.request(
          '/api/reset',
          requestOptions(client, { confirm: 'RESET_DEMO' }, 'POST')
        )
      ).status,
      409
    );
    assert.equal(
      (
        await service.request(
          `/api/company-runs/${run.id}`,
          requestOptions(client, undefined, 'DELETE')
        )
      ).status,
      409
    );
  } finally {
    release();
    await service.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('query deletion restores the record, its order and original when the durable write fails', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-company-delete-rollback-'));
  const service = await openService(directory, await serviceMock());
  try {
    const client = await authenticate(service, 'company-delete-rollback@example.com');
    const target = await makeRun(service, client);
    const newest = await makeRun(service, client);
    const store = await service.workspaceForUser(client.userId);
    const checkpoint = path.join(store.dataDir, 'company-agent', target.id);
    await mkdir(checkpoint, { recursive: true });
    await writeFile(path.join(checkpoint, 'scope.json'), '{"fixture":true}');
    const before = await readFile(path.join(store.dataDir, 'workspace.json'), 'utf8');
    const persist = store.persist.bind(store);
    store.persist = async () => {
      throw new Error('simulated deletion write failure');
    };
    const failed = await service.request(
      `/api/company-runs/${target.id}`,
      requestOptions(client, undefined, 'DELETE')
    );
    assert.equal(failed.status, 500);
    store.persist = persist;
    assert.deepEqual(
      store.state.companyRuns!.map((run) => run.id),
      [newest.id, target.id]
    );
    assert.equal(await readFile(path.join(store.dataDir, 'workspace.json'), 'utf8'), before);
    assert.equal(await readFile(path.join(checkpoint, 'scope.json'), 'utf8'), '{"fixture":true}');
    assert.equal(
      (await service.request(`/api/company-runs/${target.id}/file`, requestOptions(client))).status,
      200
    );
    const summaries = await (
      await service.request('/api/company-records', requestOptions(client))
    ).json();
    assert.equal(summaries[1].deletionBlocked, false);
    assert.equal(
      (
        await service.request(
          `/api/company-runs/${target.id}`,
          requestOptions(client, undefined, 'DELETE')
        )
      ).status,
      200
    );
    assert.deepEqual(
      store.state.companyRuns!.map((run) => run.id),
      [newest.id]
    );
    assert.equal(store.state.uploads[target.preview!.material.uploadId!], undefined);
  } finally {
    await service.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('query deletion remains successful and durable when subsequent pending-original cleanup fails', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-company-delete-cleanup-'));
  let service: Awaited<ReturnType<typeof openService>> | undefined;
  const mock = await serviceMock();
  try {
    service = await openService(directory, mock);
    const client = await authenticate(service, 'company-delete-cleanup@example.com');
    const target = await makeRun(service, client);
    const survivor = await makeRun(service, client);
    const store = await service.workspaceForUser(client.userId);
    const uploadId = target.preview!.material.uploadId!;
    const persist = store.persist.bind(store);
    let writes = 0;
    store.persist = async () => {
      if (++writes === 2) throw new Error('simulated upload cleanup write failure');
      await persist();
    };
    const removed = await service.request(
      `/api/company-runs/${target.id}`,
      requestOptions(client, undefined, 'DELETE')
    );
    assert.equal(removed.status, 200);
    assert.deepEqual(await removed.json(), { ok: true });
    store.persist = persist;
    assert.ok(store.state.uploads[uploadId], 'failed cleanup retains the file expiry record');
    assert.deepEqual((await store.pendingFile(uploadId)).buffer, buffer);
    const saved = JSON.parse(await readFile(path.join(store.dataDir, 'workspace.json'), 'utf8'));
    assert.deepEqual(
      saved.companyRuns.map((run: CompanyResearchRun) => run.id),
      [survivor.id]
    );
    assert.ok(saved.uploads[uploadId]);
    await service.stop();
    service = undefined;
    service = await openService(directory, mock);
    const restarted = await authenticate(service, 'company-delete-cleanup@example.com', true);
    assert.equal(
      (await service.request(`/api/company-runs/${target.id}`, requestOptions(restarted))).status,
      404
    );
    assert.deepEqual(
      (await (await service.request('/api/company-records', requestOptions(restarted))).json()).map(
        (run: CompanyResearchRun) => run.id
      ),
      [survivor.id]
    );
  } finally {
    await service?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
