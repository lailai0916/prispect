import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AuthSession, CompanyResearchRun } from '../shared/contracts.js';
import type { CompanyAssessment, AssessmentResearchStep } from '../shared/company-assessment.js';
import type { CompanyContextSnapshot } from '../shared/company-workspace.js';
import { createApp } from '../server/app.js';
import type { CompanyContextService } from '../server/company-context-routes.js';
import { answerCompanyQuestion } from '../server/company-questions.js';

const identity = {
  securityCode: '600519',
  orgId: 'gssh0600519',
  shortName: '贵州茅台',
  companyName: '贵州茅台酒股份有限公司',
  exchange: 'sse' as const,
  sourceUrl: 'https://www.cninfo.com.cn/',
};
const snapshot = (fetchedAt = '2026-10-02T00:00:00.000Z'): CompanyContextSnapshot => ({
  version: 1,
  securityCode: identity.securityCode,
  orgId: identity.orgId,
  companyName: identity.companyName,
  fetchedAt,
  status: 'partial',
  financials: [],
  sources: [],
  comparisons: [],
  profile: {},
  shareholders: [],
  announcements: [],
  news: [],
  verificationLinks: [],
  warnings: [],
});
const assessment = (run: CompanyResearchRun): CompanyAssessment => ({
  version: 1,
  year: run.input.year,
  basis: 'consolidated',
  snapshotFetchedAt: run.context!.fetchedAt,
  generatedAt: '2026-10-02T00:01:00.000Z',
  grade: 'NR',
  score: null,
  methodologyVersion: 'financial-screen-v1',
  dimensions: [],
  metrics: [],
  evidence: [],
  coverage: {
    fields: 0,
    requiredFields: 10,
    years: 0,
    sources: 0,
    news: 0,
    disclosures: 0,
    excerpts: 0,
    peers: 0,
  },
  gaps: [],
  model: { status: 'completed', calls: 1, provider: 'fixture' },
});
const runningStep: AssessmentResearchStep = {
  id: 'fixture-public-search',
  tool: 'search_news',
  label: '读取公开报道',
  status: 'running',
  startedAt: '2026-10-03T00:00:00.000Z',
  summary: '正在读取已有来源。',
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}
async function waitUntil(predicate: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'Expected bounded asynchronous work to complete.');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
async function harness(overrides: Partial<CompanyContextService> = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-cancel-api-'));
  let synthesisCalls = 0;
  const service: CompanyContextService = {
    searchCompanies: async (query) => ({
      query,
      candidates: [identity],
      source: 'cninfo',
      limitedToListed: true,
      truncated: false,
    }),
    context: async () => snapshot(),
    industry: async () => {
      throw Error('Cancellation must not retrieve industry data.');
    },
    question: answerCompanyQuestion,
    research: async (run) => ({ run, steps: [], modelCalls: 0, toolCalls: 0 }),
    assessment: async (run) => {
      synthesisCalls++;
      return assessment(run);
    },
    ...overrides,
  };
  const app = await createApp({
    dataDir: directory,
    model: {},
    companyService: {
      searchCompanies: service.searchCompanies,
      runCompanyResearch: async () => ({
        identity,
        announcements: [],
        stoppedReason: 'Fixture without original report',
        model: { requested: true, status: 'not-called' },
      }),
    },
    companyContextService: service,
  });
  const server = app.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const register = async (email: string) => {
    const response = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        name: 'Cancel acceptance',
        password: 'cancel-acceptance-password',
      }),
    });
    assert.equal(response.status, 201);
    const session = (await response.json()) as AuthSession;
    return {
      userId: session.user!.id,
      headers: {
        Cookie: response.headers.get('set-cookie')!.split(';')[0]!,
        'X-CSRF-Token': session.csrfToken!,
        'Content-Type': 'application/json',
      },
    };
  };
  const owner = await register('cancel-owner@example.test');
  const call = (url: string, body?: unknown, headers = owner.headers) =>
    fetch(`${base}/api${url}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const created = await call('/company-runs', {
    securityCode: identity.securityCode,
    orgId: identity.orgId,
    year: 2025,
    purpose: 'handover',
    researchMode: 'deep',
  });
  assert.equal(created.status, 202);
  const id = ((await created.json()) as CompanyResearchRun).id;
  await app.waitForIdle();
  const store = await app.workspaceForUser(owner.userId);
  const run = store.state.companyRuns!.find((item) => item.id === id)!;
  run.context = snapshot();
  run.contextStatus = 'ready';
  run.contextRevision = 1;
  run.assessment = assessment(run);
  run.assessmentStatus = 'ready';
  run.assessmentRevision = 1;
  await store.persist();
  const get = async () => (await (await call(`/company-runs/${id}`)).json()) as CompanyResearchRun;
  const cancel = (body: unknown, headers = owner.headers) =>
    call(`/company-runs/${id}/research/cancel`, body, headers);
  const dispose = async () => {
    await app.waitForIdle();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    app.auth.close();
    await rm(directory, { recursive: true, force: true });
  };
  return {
    app,
    directory,
    store,
    run,
    id,
    owner,
    register,
    call,
    get,
    cancel,
    service,
    dispose,
    synthesisCalls: () => synthesisCalls,
  };
}

test('research cancellation is owner-scoped, strict and unchanged when no requested job is active', async () => {
  const h = await harness();
  try {
    const before = structuredClone(h.run);
    for (const body of [
      {},
      { contextRevision: -1 },
      { assessmentRevision: 1.5 },
      { contextRevision: '1' },
      { contextRevision: 1, privateData: true },
    ])
      assert.equal((await h.cancel(body)).status, 400);
    assert.equal((await h.cancel({ contextRevision: 1, assessmentRevision: 0 })).status, 409);
    assert.deepEqual(h.run, before);
    assert.equal((await h.cancel({ contextRevision: 1, assessmentRevision: 1 })).status, 200);
    assert.deepEqual(h.run, before);
    const other = await h.register('cancel-other@example.test');
    assert.equal((await h.cancel({ contextRevision: 1 }, other.headers)).status, 404);
    assert.equal(h.synthesisCalls(), 0);
  } finally {
    await h.dispose();
  }
});

test('context cancellation preserves acquired snapshots, previous report and private records; late work cannot publish', async () => {
  const release = deferred(),
    returned = deferred();
  let signal: AbortSignal | undefined;
  const acquired = snapshot('2026-10-03T00:05:00.000Z');
  const late = snapshot('2026-10-03T00:06:00.000Z');
  const h = await harness({
    context: async (_identity, options) => {
      signal = options?.signal;
      await options?.onSnapshot?.(acquired);
      await release.promise;
      await options?.onSnapshot?.(late); // Deliberately ignores abort to exercise publication guards.
      returned.resolve();
      return late;
    },
  });
  try {
    const oldReport = structuredClone(h.run.assessment);
    const originals = structuredClone({
      materials: h.store.state.materials,
      tasks: h.store.state.tasks,
      decisions: h.store.state.decisions,
      trace: h.run.trace,
      announcements: h.run.announcements,
      model: h.run.model,
    });
    assert.equal((await h.call(`/company-runs/${h.id}/context`, { refresh: true })).status, 202);
    await waitUntil(() => h.run.context?.fetchedAt === acquired.fetchedAt);
    assert.equal((await h.cancel({ contextRevision: 2, assessmentRevision: 0 })).status, 409);
    assert.equal(signal?.aborted, false);
    assert.equal(h.run.contextStatus, 'loading');
    const response = await h.cancel({ contextRevision: 2 });
    assert.equal(response.status, 200);
    assert.equal(signal?.aborted, true);
    assert.equal(h.run.contextRevision, 3);
    assert.equal(h.run.contextStatus, 'failed');
    assert.equal(h.run.contextError, '本轮资料读取已取消，已取得资料保留。');
    assert.deepEqual(h.run.context, acquired);
    assert.deepEqual(h.run.assessment, oldReport);
    acquired.warnings.push('Late provider mutation must not alter saved data.');
    const retained = structuredClone(h.run.context);
    release.resolve();
    await returned.promise;
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(h.run.context, retained);
    assert.deepEqual(h.run.assessment, oldReport);
    assert.deepEqual(
      {
        materials: h.store.state.materials,
        tasks: h.store.state.tasks,
        decisions: h.store.state.decisions,
        trace: h.run.trace,
        announcements: h.run.announcements,
        model: h.run.model,
      },
      originals
    );
    assert.equal(h.synthesisCalls(), 0);
    const saved = JSON.parse(await readFile(path.join(h.store.dataDir, 'workspace.json'), 'utf8'));
    assert.equal(saved.companyRuns[0].contextError, h.run.contextError);
  } finally {
    release.resolve();
    await h.dispose();
  }
});

test('cancelled assessment stops running trace and retains its previous report despite late research callbacks', async () => {
  const release = deferred(),
    returned = deferred();
  let signal: AbortSignal | undefined;
  const h = await harness({
    research: async (run, _model, options) => {
      signal = options.signal;
      await options.onStep?.(runningStep);
      await release.promise;
      await options.onStep?.({ ...runningStep, status: 'completed' });
      returned.resolve();
      return { run, steps: [{ ...runningStep, status: 'completed' }], modelCalls: 1, toolCalls: 1 };
    },
  });
  try {
    const oldContext = structuredClone(h.run.context),
      oldReport = structuredClone(h.run.assessment);
    assert.equal((await h.call(`/company-runs/${h.id}/assessment`, { refresh: true })).status, 202);
    await waitUntil(() => !!h.run.assessmentTrace?.length);
    assert.equal((await h.cancel({ assessmentRevision: 2 })).status, 200);
    assert.equal(signal?.aborted, true);
    assert.equal(h.run.assessmentRevision, 3);
    assert.equal(h.run.assessmentStatus, 'failed');
    assert.equal(h.run.assessmentError, '本轮综合研究已取消，已取得资料保留。');
    assert.equal(h.run.assessmentTrace![0].status, 'failed');
    assert.match(h.run.assessmentTrace![0].summary, /未完成/);
    const cancelled = structuredClone(h.run);
    release.resolve();
    await returned.promise;
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(h.run, cancelled);
    assert.deepEqual(h.run.context, oldContext);
    assert.deepEqual(h.run.assessment, oldReport);
    assert.equal(h.synthesisCalls(), 0);
  } finally {
    release.resolve();
    await h.dispose();
  }
});

test('cancelled context cleanup cannot detach or release a replacement retrieval', async () => {
  const first = deferred(),
    second = deferred(),
    oldReturned = deferred();
  let calls = 0;
  const h = await harness({
    context: async (_identity, options) => {
      const index = ++calls;
      await (index === 1 ? first.promise : second.promise);
      const value = snapshot(`2026-10-03T00:0${index}:00.000Z`);
      await options?.onSnapshot?.(value);
      if (index === 1) oldReturned.resolve();
      return value;
    },
  });
  try {
    assert.equal((await h.call(`/company-runs/${h.id}/context`, { refresh: true })).status, 202);
    await waitUntil(() => calls === 1);
    assert.equal((await h.cancel({ contextRevision: 2 })).status, 200);
    assert.equal((await h.call(`/company-runs/${h.id}/context`, { refresh: true })).status, 202);
    await waitUntil(() => calls === 2);
    first.resolve();
    await oldReturned.promise;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const stillRunning = await h.call(`/company-runs/${h.id}/context`, { refresh: true });
    assert.equal(stillRunning.status, 202);
    assert.equal(((await stillRunning.json()) as CompanyResearchRun).contextRevision, 4);
    assert.equal(calls, 2);
    second.resolve();
    await h.app.waitForIdle();
    assert.equal(h.run.context?.fetchedAt, '2026-10-03T00:02:00.000Z');
    assert.equal(h.run.contextStatus, 'ready');
    assert.equal(h.synthesisCalls(), 0, 'A replacement context does not start synthesis.');
    assert.equal((await h.call(`/company-runs/${h.id}/assessment`, {})).status, 202);
    await h.app.waitForIdle();
    assert.equal(h.run.assessmentStatus, 'ready');
    assert.equal(h.synthesisCalls(), 1);
  } finally {
    first.resolve();
    second.resolve();
    await h.dispose();
  }
});

test('cancelled assessment cleanup cannot detach or release a replacement synthesis', async () => {
  const first = deferred(),
    second = deferred(),
    oldReturned = deferred();
  let calls = 0;
  const h = await harness({
    assessment: async (run, _model, signal) => {
      const index = ++calls;
      assert.ok(signal);
      await (index === 1 ? first.promise : second.promise);
      if (index === 1) oldReturned.resolve();
      return {
        ...assessment(run),
        model: { status: 'completed', calls: 1, provider: `fixture-${index}` },
      };
    },
  });
  try {
    assert.equal((await h.call(`/company-runs/${h.id}/assessment`, { refresh: true })).status, 202);
    await waitUntil(() => calls === 1);
    assert.equal((await h.cancel({ assessmentRevision: 2 })).status, 200);
    assert.equal((await h.call(`/company-runs/${h.id}/assessment`, { refresh: true })).status, 202);
    await waitUntil(() => calls === 2);
    first.resolve();
    await oldReturned.promise;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const stillRunning = await h.call(`/company-runs/${h.id}/assessment`, { refresh: true });
    assert.equal(stillRunning.status, 202);
    assert.equal(((await stillRunning.json()) as CompanyResearchRun).assessmentRevision, 4);
    assert.equal(calls, 2);
    second.resolve();
    await h.app.waitForIdle();
    assert.equal(h.run.assessmentStatus, 'ready');
    assert.equal(h.run.assessment?.model.provider, 'fixture-2');
  } finally {
    first.resolve();
    second.resolve();
    await h.dispose();
  }
});

for (const phase of ['context', 'assessment'] as const)
  test(`failed cancellation persistence leaves ${phase} un-aborted and able to finish`, async () => {
    const release = deferred(),
      writeStarted = deferred(),
      releaseWrite = deferred();
    let signal: AbortSignal | undefined;
    const h = await harness(
      phase === 'context'
        ? {
            context: async (_identity, options) => {
              signal = options?.signal;
              await release.promise;
              const value = snapshot('2026-10-03T00:10:00.000Z');
              await options?.onSnapshot?.(value);
              return value;
            },
          }
        : {
            assessment: async (run, _model, requestSignal) => {
              signal = requestSignal;
              await release.promise;
              return assessment(run);
            },
          }
    );
    const persist = h.store.persist.bind(h.store);
    try {
      assert.equal((await h.call(`/company-runs/${h.id}/${phase}`, { refresh: true })).status, 202);
      await waitUntil(() => !!signal);
      const before = structuredClone(h.run);
      let rejectCancellation = true;
      h.store.persist = async () => {
        if (rejectCancellation && h.run[`${phase}Error`]?.includes('已取消')) {
          rejectCancellation = false;
          writeStarted.resolve();
          await releaseWrite.promise;
          throw Error('Fixture cancellation disk failure');
        }
        await persist();
      };
      const cancellation = h.cancel({ [`${phase}Revision`]: 2 });
      await writeStarted.promise;
      release.resolve(); // The running callback reaches the transaction while its write fails.
      assert.equal(signal!.aborted, false);
      releaseWrite.resolve();
      assert.equal((await cancellation).status, 500);
      assert.equal(signal!.aborted, false);
      assert.equal(h.run[`${phase}Revision`], before[`${phase}Revision`]);
      await h.app.waitForIdle();
      assert.equal(h.run[`${phase}Status`], 'ready');
      assert.equal(h.run[`${phase}Error`], undefined);
    } finally {
      h.store.persist = persist;
      release.resolve();
      releaseWrite.resolve();
      await h.dispose();
    }
  });

test('cancelling subject resolution aborts the public search before context or model work', async () => {
  const release = deferred(),
    returned = deferred();
  let signal: AbortSignal | undefined,
    contextCalls = 0;
  const h = await harness({
    context: async () => {
      contextCalls++;
      return snapshot();
    },
  });
  try {
    h.run.identity = undefined;
    h.service.searchCompanies = async (query, options) => {
      signal = options?.signal;
      await release.promise;
      returned.resolve();
      return {
        query,
        candidates: [identity],
        source: 'cninfo',
        limitedToListed: true,
        truncated: false,
      };
    };
    assert.equal((await h.call(`/company-runs/${h.id}/context`, { refresh: true })).status, 202);
    await waitUntil(() => !!signal);
    assert.equal((await h.cancel({ contextRevision: 2 })).status, 200);
    assert.equal(signal!.aborted, true);
    release.resolve();
    await returned.promise;
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(contextCalls, 0);
    assert.equal(h.synthesisCalls(), 0);
    assert.equal(h.run.identity, undefined);
  } finally {
    release.resolve();
    await h.dispose();
  }
});

test('a colliding run id in another workspace cannot cancel the owning account job', async () => {
  const release = deferred();
  let signal: AbortSignal | undefined;
  const h = await harness({
    context: async (_identity, options) => {
      signal = options?.signal;
      await release.promise;
      return snapshot();
    },
  });
  try {
    assert.equal((await h.call(`/company-runs/${h.id}/context`, { refresh: true })).status, 202);
    await waitUntil(() => !!signal);
    const other = await h.register('cancel-colliding-id@example.test');
    const otherStore = await h.app.workspaceForUser(other.userId);
    const otherRun = structuredClone(h.run);
    otherStore.state.companyRuns = [otherRun];
    await otherStore.persist();
    assert.equal((await h.cancel({ contextRevision: 2 }, other.headers)).status, 200);
    assert.equal(signal!.aborted, false);
    assert.deepEqual(otherRun, h.run);
    assert.equal((await h.cancel({ contextRevision: 2 })).status, 200);
    assert.equal(signal!.aborted, true);
    assert.equal(otherRun.contextRevision, 2);
    assert.equal(otherRun.contextStatus, 'loading');
  } finally {
    release.resolve();
    await h.dispose();
  }
});

for (const phase of ['context', 'assessment'] as const)
  test(`failed ${phase} cancellation restores disk after an unrelated save of its temporary state`, async () => {
    const release = deferred(),
      writeStarted = deferred(),
      releaseWrite = deferred();
    let signal: AbortSignal | undefined;
    const h = await harness(
      phase === 'context'
        ? {
            context: async (_identity, options) => {
              signal = options?.signal;
              await release.promise;
              return snapshot('2026-10-03T00:15:00.000Z');
            },
          }
        : {
            assessment: async (run, _model, requestSignal) => {
              signal = requestSignal;
              await release.promise;
              return assessment(run);
            },
          }
    );
    const persist = h.store.persist.bind(h.store);
    const saved = async () =>
      JSON.parse(await readFile(path.join(h.store.dataDir, 'workspace.json'), 'utf8'));
    try {
      assert.equal((await h.call(`/company-runs/${h.id}/${phase}`, { refresh: true })).status, 202);
      await waitUntil(() => !!signal);
      const before = structuredClone(h.run);
      let rejectCancellation = true;
      h.store.persist = async () => {
        if (rejectCancellation && h.run[`${phase}Error`]?.includes('已取消')) {
          rejectCancellation = false;
          writeStarted.resolve();
          await releaseWrite.promise;
          throw Error('Fixture held cancellation storage failure');
        }
        await persist();
      };
      const cancellation = h.cancel({ [`${phase}Revision`]: 2 });
      await writeStarted.promise;
      h.store.state.inputs['unrelated-same-owner-save'] = [];
      await h.store.persist();
      const transient = await saved();
      assert.equal(transient.companyRuns[0][`${phase}Revision`], 3);
      assert.equal(transient.companyRuns[0][`${phase}Status`], 'failed');
      releaseWrite.resolve();
      assert.equal((await cancellation).status, 500);
      // The public task is deliberately still blocked: restoration cannot rely
      // on its eventual publication to repair a wrongly persisted cancellation.
      assert.equal(signal!.aborted, false);
      assert.equal(h.run[`${phase}Revision`], before[`${phase}Revision`]);
      assert.equal(h.run[`${phase}Status`], 'loading');
      assert.equal(h.run[`${phase}Error`], before[`${phase}Error`]);
      const restored = await saved();
      assert.deepEqual(restored.companyRuns[0], JSON.parse(JSON.stringify(h.run)));
      assert.equal(restored.companyRuns[0].updatedAt, before.updatedAt);
      assert.deepEqual(restored.inputs['unrelated-same-owner-save'], []);
      assert.deepEqual(h.store.state.inputs['unrelated-same-owner-save'], []);
      release.resolve();
      await h.app.waitForIdle();
      assert.equal(h.run[`${phase}Status`], 'ready');
    } finally {
      h.store.persist = persist;
      release.resolve();
      releaseWrite.resolve();
      await h.dispose();
    }
  });
