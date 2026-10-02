import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type {
  AnalysisTask,
  AuthSession,
  CashPlanInput,
  DemoCase,
  TaskContextPatch,
  Workspace,
} from '../shared/contracts.js';
import { createApp } from '../server/app.js';
import { calculateCashPlan } from '../shared/cash-plan.js';

interface Client {
  cookie: string;
  csrf: string;
  userId: string;
}
async function openService(
  directory: string,
  onModel: (body?: string) => void,
  mockExplanation = false
) {
  const app = await createApp({
    root: process.cwd(),
    dataDir: directory,
    model: {
      apiKey: 'test-only-no-network',
      fetch: async (_url, request) => {
        const body = String(request?.body);
        onModel(body);
        if (!mockExplanation) throw new Error('External model is prohibited in this test');
        const input = JSON.parse(JSON.parse(body).messages[1].content);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    explanations: [
                      { text: '应继续核对底层材料。', citations: [input.evidence[0].id] },
                    ],
                  }),
                },
              },
            ],
          })
        );
      },
    },
  });
  const server = app.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    ...app,
    request: (url: string, init: RequestInit = {}) => fetch(base + url, init),
    stop: async () => {
      await app.waitForIdle();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      app.auth.close();
    },
  };
}
function options(client: Client, body?: unknown, method = 'GET'): RequestInit {
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
async function register(
  service: Awaited<ReturnType<typeof openService>>,
  email: string
): Promise<Client> {
  const response = await service.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name: '场景核验', password: 'context-test-password' }),
  });
  assert.equal(response.status, 201);
  const session = (await response.json()) as AuthSession;
  assert.ok(session.user && session.csrfToken);
  return {
    cookie: response.headers.get('set-cookie')!.split(';')[0]!,
    csrf: session.csrfToken,
    userId: session.user.id,
  };
}
function cashPlan(): CashPlanInput {
  return {
    asOf: '2026-10-02',
    openingCash: '100.10',
    periods: [
      { days: 30, inflow: '5.01', outflow: '110.12' },
      { days: 60, inflow: null, outflow: '10.00' },
      { days: 90, inflow: '30.00', outflow: '0' },
    ],
  };
}

test('task purposes, both-context notes and manual cash assumptions persist with the original financial report and tenant protections', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-context-'));
  let modelCalls = 0;
  let service: Awaited<ReturnType<typeof openService>> | undefined = await openService(
    directory,
    () => modelCalls++
  );
  try {
    const alice = await register(service, 'context-alice@example.com');
    const bob = await register(service, 'context-bob@example.com');
    const demos = (await (await service.request('/api/cases')).json()) as DemoCase[];
    assert.equal(
      (await service.request(`/api/cases/${demos[0]!.id}/import`, options(alice, {}, 'POST')))
        .status,
      201
    );
    const input = {
      title: '两视角核验',
      company: demos[0]!.company,
      year: 2025,
      materialIds: demos[0]!.materialIds,
    };
    const created = await service.request('/api/tasks', options(alice, input, 'POST'));
    assert.equal(created.status, 202);
    const pending = (await created.json()) as AnalysisTask;
    assert.equal(pending.purpose, 'external');
    assert.deepEqual(pending.contextNotes, {});
    await service.waitForIdle();
    const task = (await (
      await service.request(`/api/tasks/${pending.id}`, options(alice))
    ).json()) as AnalysisTask;
    assert.equal(task.report?.model.status, 'not-requested');
    const financialReport = structuredClone(task.report);
    const patch = async (body: TaskContextPatch) => {
      const result = await service!.request(
        `/api/tasks/${task.id}/context`,
        options(alice, body, 'PATCH')
      );
      assert.equal(result.status, 200);
      return (await result.json()) as AnalysisTask;
    };
    await patch({
      contextNotes: {
        'external.identity': { done: true, note: '已取得收款主体材料，尚未独立核真' },
      },
    });
    let updated = await patch({
      purpose: 'handover',
      contextNotes: {
        'handover.cash': { done: false, note: '<script>不能执行</script> 待核对受限资金' },
      },
      cashPlan: cashPlan(),
    });
    assert.equal(updated.purpose, 'handover');
    assert.equal(updated.contextNotes?.['external.identity']?.done, true);
    assert.equal(updated.contextNotes?.['handover.cash']?.done, false);
    assert.ok(updated.cashPlan?.updatedAt);
    assert.deepEqual(updated.report, financialReport);
    assert.deepEqual(
      calculateCashPlan(updated.cashPlan!).periods.map((p) => p.balance),
      ['-5.01', null, null]
    );
    updated = await patch({ purpose: 'external' });
    assert.equal(
      updated.contextNotes?.['handover.cash']?.note,
      '<script>不能执行</script> 待核对受限资金'
    );
    assert.equal(
      (
        await service.request(
          `/api/tasks/${task.id}/context`,
          options(bob, { purpose: 'handover' }, 'PATCH')
        )
      ).status,
      404
    );
    assert.equal(
      (
        await service.request(`/api/tasks/${task.id}/context`, {
          ...options(alice, { purpose: 'handover' }, 'PATCH'),
          headers: { Cookie: alice.cookie, 'Content-Type': 'application/json' },
        })
      ).status,
      403
    );
    assert.equal(
      (
        await service.request(`/api/tasks/${task.id}/context`, {
          ...options(alice, { purpose: 'handover' }, 'PATCH'),
          headers: { ...options(alice).headers, Origin: 'https://evil.invalid' },
        })
      ).status,
      403
    );
    assert.equal(
      (
        await service.request(
          `/api/tasks/${task.id}/context`,
          options(alice, { cashPlan: { ...cashPlan(), asOf: '2026-02-30' } }, 'PATCH')
        )
      ).status,
      400
    );
    assert.equal(
      (
        await service.request(
          `/api/tasks/${task.id}/context`,
          options(alice, { contextNotes: { 'external.safe': { done: true, note: '' } } }, 'PATCH')
        )
      ).status,
      400
    );
    assert.equal(
      (
        await service.request(
          `/api/tasks/${task.id}/context`,
          options(
            alice,
            { contextNotes: { 'external.latest': { done: false, note: 'x'.repeat(2001) } } },
            'PATCH'
          )
        )
      ).status,
      400
    );
    assert.equal(
      (
        await service.request(
          `/api/tasks/${task.id}/context`,
          options(alice, { report: { verdict: 'supported' } }, 'PATCH')
        )
      ).status,
      400
    );
    const exported = (await (
      await service.request(`/api/tasks/${task.id}/export?format=json`, options(alice))
    ).json()) as AnalysisTask;
    assert.deepEqual(exported.report, financialReport);
    assert.deepEqual(exported.contextNotes, updated.contextNotes);
    assert.equal(exported.cashPlan?.asOf, '2026-10-02');
    const copied = await service.request(
      '/api/tasks',
      options(
        alice,
        {
          ...input,
          title: '新接任底稿',
          purpose: 'handover',
          contextNotes: updated.contextNotes,
          cashPlan: updated.cashPlan,
        },
        'POST'
      )
    );
    assert.equal(copied.status, 202);
    const fresh = (await copied.json()) as AnalysisTask;
    assert.equal(fresh.purpose, 'handover');
    assert.deepEqual(fresh.contextNotes, {});
    assert.equal(fresh.cashPlan, undefined);
    assert.equal(fresh.useModel, false);
    await service.waitForIdle();
    await service.stop();
    service = undefined;
    service = await openService(directory, () => modelCalls++);
    const restored = (await (
      await service.request(`/api/tasks/${task.id}`, options(alice))
    ).json()) as AnalysisTask;
    assert.equal(restored.purpose, 'external');
    assert.deepEqual(restored.contextNotes, updated.contextNotes);
    assert.deepEqual(restored.cashPlan, updated.cashPlan);
    assert.deepEqual(restored.report, financialReport);
    assert.equal(
      (
        await service.request(
          `/api/tasks/${task.id}/context`,
          options(bob, { contextNotes: {} }, 'PATCH')
        )
      ).status,
      404
    );
    const cleared = await patch({ cashPlan: null });
    assert.equal(cleared.cashPlan, undefined);
    assert.deepEqual(cleared.contextNotes, updated.contextNotes);
    assert.deepEqual(cleared.report, financialReport);
    assert.equal(modelCalls, 0);
  } finally {
    await service?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy saved tasks without purpose or scenario fields load with external defaults and retain their actual report', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-legacy-context-'));
  let service: Awaited<ReturnType<typeof openService>> | undefined = await openService(
    directory,
    () => assert.fail('No model call')
  );
  try {
    const client = await register(service, 'legacy-context@example.com');
    const cases = (await (await service.request('/api/cases')).json()) as DemoCase[];
    assert.equal(
      (await service.request(`/api/cases/${cases[0]!.id}/import`, options(client, {}, 'POST')))
        .status,
      201
    );
    const response = await service.request(
      '/api/tasks',
      options(
        client,
        {
          title: '旧核查',
          company: cases[0]!.company,
          year: 2025,
          materialIds: cases[0]!.materialIds,
        },
        'POST'
      )
    );
    const created = (await response.json()) as AnalysisTask;
    await service.waitForIdle();
    const store = await service.workspaceForUser(client.userId);
    const stateFile = path.join(store.dataDir, 'workspace.json');
    await service.stop();
    service = undefined;
    const saved = JSON.parse(await readFile(stateFile, 'utf8'));
    const originalReport = saved.tasks[0].report;
    delete saved.tasks[0].purpose;
    delete saved.tasks[0].contextNotes;
    await writeFile(stateFile, JSON.stringify(saved));
    service = await openService(directory, () => assert.fail('No model call'));
    const task = (await (
      await service.request(`/api/tasks/${created.id}`, options(client))
    ).json()) as AnalysisTask;
    assert.equal(task.purpose, 'external');
    assert.deepEqual(task.contextNotes, {});
    assert.equal(task.cashPlan, undefined);
    assert.deepEqual(task.report, originalReport);
    const workspace = (await (
      await service.request('/api/workspace', options(client))
    ).json()) as Workspace;
    assert.equal(workspace.tasks[0]?.purpose, 'external');
  } finally {
    await service?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('scenario notes and cash assumptions remain private when an opted-in task retries a mocked explanation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-context-model-'));
  const payloads: string[] = [];
  const service = await openService(directory, (body) => payloads.push(body!), true);
  try {
    const client = await register(service, 'context-model@example.com');
    const cases = (await (await service.request('/api/cases')).json()) as DemoCase[];
    assert.equal(
      (await service.request(`/api/cases/${cases[0]!.id}/import`, options(client, {}, 'POST')))
        .status,
      201
    );
    const response = await service.request(
      '/api/tasks',
      options(
        client,
        {
          title: '独立场景隐私测试',
          company: cases[0]!.company,
          year: 2025,
          materialIds: cases[0]!.materialIds,
          purpose: 'handover',
          useModel: true,
        },
        'POST'
      )
    );
    assert.equal(response.status, 202);
    const task = (await response.json()) as AnalysisTask;
    await service.waitForIdle();
    assert.equal(payloads.length, 1);
    const marker = 'PRIVATE_CONTEXT_ONLY_612943';
    const privatePlan = cashPlan();
    privatePlan.openingCash = '98765432109876543210.12';
    const saved = await service.request(
      `/api/tasks/${task.id}/context`,
      options(
        client,
        {
          contextNotes: { 'handover.cash': { done: false, note: marker } },
          cashPlan: privatePlan,
        },
        'PATCH'
      )
    );
    assert.equal(saved.status, 200);
    assert.equal(payloads.length, 1, 'saving private context does not invoke a model');
    assert.equal(
      (await service.request(`/api/tasks/${task.id}/retry`, options(client, {}, 'POST'))).status,
      202
    );
    await service.waitForIdle();
    assert.equal(payloads.length, 2);
    for (const payload of payloads) {
      assert.equal(payload.includes(marker), false);
      assert.equal(payload.includes(privatePlan.openingCash!), false);
      const modelInput = JSON.parse(JSON.parse(payload).messages[1].content);
      assert.equal(modelInput.contextNotes, undefined);
      assert.equal(modelInput.cashPlan, undefined);
    }
    const updated = (await (
      await service.request(`/api/tasks/${task.id}`, options(client))
    ).json()) as AnalysisTask;
    assert.equal(updated.report?.model.status, 'completed');
    assert.equal(updated.contextNotes?.['handover.cash']?.note, marker);
    assert.deepEqual(updated.cashPlan?.periods, privatePlan.periods);
  } finally {
    await service.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
