import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AuthSession, CompanyResearchRun } from '../shared/contracts.js';
import { contextAmountFields, type CompanyContextSnapshot } from '../shared/company-workspace.js';
import { deriveCompanyAssessment } from '../shared/company-assessment.js';
import { createApp } from '../server/app.js';
import { answerCompanyQuestion } from '../server/company-questions.js';
import type { CompanyContextService } from '../server/company-context-routes.js';
import type { CompanyService } from '../server/company-routes.js';

const identity = {
  securityCode: '600519',
  orgId: 'gssh0600519',
  shortName: '测试上市主体',
  companyName: '测试上市主体股份有限公司',
  exchange: 'sse' as const,
  sourceUrl: 'https://www.cninfo.com.cn/',
};
const input = {
  securityCode: identity.securityCode,
  orgId: identity.orgId,
  year: 2025,
  purpose: 'external',
};
function snapshot(revision = 1): CompanyContextSnapshot {
  return {
    version: 1,
    securityCode: identity.securityCode,
    orgId: identity.orgId,
    companyName: identity.companyName,
    fetchedAt: `2026-10-03T00:00:0${revision}.000Z`,
    status: 'partial',
    financials: [
      {
        period: '2025-12-31',
        annual: true,
        noticeDate: '2026-04-01',
        amounts: {
          ...Object.fromEntries(contextAmountFields.map((field) => [field, null])),
          netProfit: '100.00',
          ocf: '80.00',
        } as any,
        ratios: { grossMargin: null, roe: null, revenueGrowth: null },
        auditOpinion: null,
        fieldSources: { netProfit: '测试来源', ocf: '测试来源' },
        sourceUrls: ['https://datacenter.eastmoney.com/'],
        originalUrl: null,
      },
    ],
    sources: [],
    comparisons: [],
    profile: {},
    shareholders: [],
    announcements: [],
    news: [],
    verificationLinks: [],
    warnings: ['Isolated route fixture; not production evidence.'],
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}
async function harness(overrides: Partial<CompanyContextService> = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-financial-default-'));
  let legacyCalls = 0;
  let contextCalls = 0;
  let researchCalls = 0;
  let modelCalls = 0;
  let officialCalls = 0;
  let failContext = false;
  let matchesIdentity = true;
  const choices: { bypassCache?: boolean; disclosureExcerpts?: boolean }[] = [];
  const service: CompanyContextService = {
    searchCompanies: async (query) => {
      officialCalls++;
      return {
        query,
        candidates: [{ ...identity, ...(matchesIdentity ? {} : { orgId: 'WrongOrg' }) }],
        limitedToListed: true,
        source: 'cninfo',
        truncated: false,
      };
    },
    context: async (_identity, options) => {
      contextCalls++;
      choices.push({
        bypassCache: options?.bypassCache,
        disclosureExcerpts: options?.disclosureExcerpts,
      });
      if (failContext) throw Error('Fixture provider failed');
      const value = snapshot(contextCalls);
      await options?.onSnapshot?.(structuredClone(value));
      return value;
    },
    industry: async () => {
      throw Error('Default financial acquisition must not call industry research');
    },
    question: answerCompanyQuestion,
    research: async (run) => {
      researchCalls++;
      assert.equal(run.input.useModel, true);
      return { run, steps: [], modelCalls: 0, toolCalls: 0 };
    },
    assessment: async (run) => {
      modelCalls++;
      return { ...deriveCompanyAssessment(run), model: { status: 'completed', calls: 1 } };
    },
    ...overrides,
  };
  const companyService: CompanyService = {
    searchCompanies: service.searchCompanies,
    runCompanyResearch: async (scope, options) => {
      legacyCalls++;
      assert.equal(scope.researchMode, 'deep');
      assert.equal(scope.useModel, true);
      assert.ok(options.checkpoint);
      return {
        identity,
        announcements: [],
        model: { requested: true, status: 'not-called' },
      };
    },
  };
  const app = await createApp({
    dataDir: directory,
    model: { apiKey: 'fixture-configured-model' },
    companyService,
    companyContextService: service,
  });
  const server = app.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const register = async (email: string) => {
    const response = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: 'Financial fixture', password: 'Financial-Fixture42!' }),
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
  const owner = await register('financial-owner@example.test');
  const call = (url: string, body?: unknown, headers = owner.headers, key?: string) =>
    fetch(`${base}/api${url}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...headers, ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const create = async (body: unknown = input, key?: string) => {
    const response = await call('/company-runs', body, owner.headers, key);
    assert.equal(response.status, 202);
    return (await response.json()) as CompanyResearchRun;
  };
  const get = async (id: string) =>
    (await (await call(`/company-runs/${id}`)).json()) as CompanyResearchRun;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    await app.waitForIdle();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    app.auth.close();
    stopped = true;
  };
  return {
    app,
    directory,
    owner,
    call,
    create,
    get,
    register,
    companyService,
    service,
    stop,
    choices,
    counts: () => ({ legacyCalls, contextCalls, researchCalls, modelCalls, officialCalls }),
    fail: () => (failContext = true),
    mismatch: () => (matchesIdentity = false),
    dispose: async () => {
      await stop();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('new standard queries ignore legacy model flags and acquire financial context without graph, PDFs or assessment', async () => {
  const h = await harness();
  try {
    for (const useModel of [undefined, false, true]) {
      const created = await h.create({ ...input, ...(useModel === undefined ? {} : { useModel }) });
      await h.app.waitForIdle();
      const run = await h.get(created.id);
      assert.equal(run.input.researchMode, 'financial');
      assert.equal(run.input.useModel, false);
      assert.equal(run.status, 'ready');
      assert.equal(run.contextStatus, 'ready');
      assert.equal(run.context?.financials[0]?.amounts.ocf, '80.00');
      assert.deepEqual(run.model, { requested: false, status: 'not-requested' });
      assert.equal(run.assessment, undefined);
      assert.equal(run.assessmentStatus, undefined);
      assert.equal(run.preview, undefined);
      assert.equal(run.agent?.version, 'financial-v1');
      assert.deepEqual(
        run.agent?.branches.map((row) => row.status),
        ['completed', 'completed']
      );
      assert.equal(run.agent?.budget.modelRequests, 0);
      const store = await h.app.workspaceForUser(h.owner.userId);
      assert.equal(Object.keys(store.state.uploads).length, 0);
      await assert.rejects(access(path.join(store.dataDir, 'company-agent', run.id)));
    }
    assert.deepEqual(h.counts(), {
      legacyCalls: 0,
      contextCalls: 3,
      researchCalls: 0,
      modelCalls: 0,
      officialCalls: 3,
    });
    assert.ok(h.choices.every((choice) => choice.disclosureExcerpts === false));
    assert.equal(
      (await h.call('/company-runs', { ...input, researchMode: 'invalid' })).status,
      400
    );
  } finally {
    await h.dispose();
  }
});

test('context refresh preserves snapshots after failure and model assessment and original research remain explicit', async () => {
  const h = await harness();
  try {
    const created = await h.create();
    await h.app.waitForIdle();
    assert.equal((await h.call(`/company-runs/${created.id}/context`, {})).status, 200);
    assert.equal(
      (await h.call(`/company-runs/${created.id}/context`, { refresh: true })).status,
      202
    );
    await h.app.waitForIdle();
    const refreshed = await h.get(created.id);
    assert.equal(refreshed.context?.fetchedAt, snapshot(2).fetchedAt);
    assert.equal(refreshed.assessment, undefined);
    assert.equal(h.counts().modelCalls, 0);
    h.fail();
    await h.call(`/company-runs/${created.id}/context`, { refresh: true });
    await h.app.waitForIdle();
    const failed = await h.get(created.id);
    assert.equal(failed.contextStatus, 'failed');
    assert.deepEqual(failed.context, refreshed.context);
    assert.equal(h.counts().modelCalls, 0);
    assert.ok(h.choices.every((choice) => choice.disclosureExcerpts === false));
    assert.equal(h.choices[1]?.bypassCache, true);
    assert.equal((await h.call(`/company-runs/${created.id}/assessment`, {})).status, 202);
    await h.app.waitForIdle();
    assert.equal((await h.get(created.id)).assessment?.model.status, 'completed');
    assert.equal(h.counts().researchCalls, 1);
    assert.equal(h.counts().modelCalls, 1);
    const deep = await h.create({ ...input, researchMode: 'deep', useModel: false });
    await h.app.waitForIdle();
    assert.equal((await h.get(deep.id)).input.useModel, true);
    assert.equal(h.counts().legacyCalls, 1);
  } finally {
    await h.dispose();
  }
});

test('financial reuse and idempotency retain owner, year and purpose isolation without more source work', async () => {
  const h = await harness();
  try {
    const key = randomUUID();
    const created = await h.create({ ...input, useModel: true, reuseExisting: true }, key);
    await h.app.waitForIdle();
    const before = h.counts();
    const cached = await h.call('/company-runs', { ...input, reuseExisting: true });
    assert.equal(cached.status, 200);
    assert.equal((await cached.json()).id, created.id);
    const repeated = await h.call('/company-runs', input, h.owner.headers, key);
    assert.equal(repeated.status, 200);
    assert.equal((await repeated.json()).id, created.id);
    assert.deepEqual(h.counts(), before);
    assert.equal(
      (await h.call('/company-runs', { ...input, year: 2024 }, h.owner.headers, key)).status,
      409
    );
    const other = await h.register('financial-other@example.test');
    assert.equal(
      (await h.call(`/company-runs/${created.id}`, undefined, other.headers)).status,
      404
    );
    assert.equal(
      (await h.call(`/company-runs/${created.id}/context`, {}, other.headers)).status,
      404
    );
    assert.deepEqual(await (await h.call('/company-records', undefined, other.headers)).json(), []);
    const independent = await h.call(
      '/company-runs',
      { ...input, reuseExisting: true },
      other.headers
    );
    assert.equal(independent.status, 202);
    assert.notEqual((await independent.json()).id, created.id);
    await h.app.waitForIdle();
    const year = await h.create({ ...input, year: 2024, reuseExisting: true });
    await h.app.waitForIdle();
    const purpose = await h.create({ ...input, purpose: 'handover', reuseExisting: true });
    await h.app.waitForIdle();
    assert.notEqual(year.id, created.id);
    assert.notEqual(purpose.id, created.id);
  } finally {
    await h.dispose();
  }
});

test('default acquisition cancels by public context revision, preserves early data and fences late callbacks after retry', async () => {
  const started = deferred();
  const held = deferred();
  const finished = deferred();
  let calls = 0;
  const h = await harness({
    context: async (_identity, options) => {
      calls++;
      if (calls > 1) return snapshot(2);
      await options?.onSnapshot?.(snapshot());
      started.resolve();
      try {
        await held.promise;
        await options?.onSnapshot?.(snapshot(3));
        return snapshot(3);
      } finally {
        finished.resolve();
      }
    },
  });
  try {
    const created = await h.create();
    await started.promise;
    const reading = await h.get(created.id);
    assert.equal(reading.context?.financials[0]?.amounts.ocf, '80.00');
    assert.equal(reading.contextStatus, 'loading');
    assert.equal((await h.call(`/company-runs/${created.id}/context`, {})).status, 202);
    assert.equal(calls, 1);
    const cancelled = await h.call(`/company-runs/${created.id}/research/cancel`, {
      contextRevision: reading.contextRevision,
    });
    assert.equal(cancelled.status, 200);
    const saved = (await cancelled.json()) as CompanyResearchRun;
    assert.equal(saved.status, 'failed');
    assert.equal(saved.contextStatus, 'failed');
    assert.deepEqual(saved.context, reading.context);
    assert.equal(
      (
        await h.call(`/company-runs/${created.id}/research/cancel`, {
          contextRevision: reading.contextRevision,
        })
      ).status,
      409
    );
    assert.equal(
      (await h.call(`/company-runs/${created.id}/context`, { refresh: true })).status,
      202
    );
    await h.app.waitForIdle();
    assert.equal((await h.get(created.id)).context?.fetchedAt, snapshot(2).fetchedAt);
    held.resolve();
    await finished.promise;
    assert.equal((await h.get(created.id)).context?.fetchedAt, snapshot(2).fetchedAt);
    assert.equal((await h.get(created.id)).status, 'ready');
    assert.equal(h.counts().legacyCalls, 0);
    assert.equal(h.counts().modelCalls, 0);
  } finally {
    held.resolve();
    await h.dispose();
  }
});

test('default acquisition rejects official identity mismatch before financial or model calls', async () => {
  const h = await harness();
  try {
    h.mismatch();
    const created = await h.create();
    await h.app.waitForIdle();
    const failed = await h.get(created.id);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.context, undefined);
    assert.equal(failed.agent?.recoverable, true);
    assert.deepEqual(
      failed.agent?.branches.map((row) => row.status),
      ['failed', 'skipped']
    );
    assert.equal(h.counts().contextCalls, 0);
    assert.equal(h.counts().legacyCalls, 0);
    assert.equal(h.counts().modelCalls, 0);
  } finally {
    await h.dispose();
  }
});

test('failed financial cancellation persistence restores the live owner job before aborting', async () => {
  const started = deferred();
  const held = deferred();
  let signal: AbortSignal | undefined;
  const h = await harness({
    context: async (_identity, options) => {
      signal = options?.signal;
      await options?.onSnapshot?.(snapshot());
      started.resolve();
      await held.promise;
      return snapshot(2);
    },
  });
  try {
    const created = await h.create();
    await started.promise;
    const reading = await h.get(created.id);
    const store = await h.app.workspaceForUser(h.owner.userId);
    const persist = store.persist.bind(store);
    let failOnce = true;
    store.persist = async () => {
      if (failOnce) {
        failOnce = false;
        throw Error('Fixture cancellation write failed');
      }
      await persist();
    };
    try {
      assert.equal(
        (
          await h.call(`/company-runs/${created.id}/research/cancel`, {
            contextRevision: reading.contextRevision,
          })
        ).status,
        500
      );
    } finally {
      store.persist = persist;
    }
    const restored = await h.get(created.id);
    assert.equal(restored.status, 'running');
    assert.equal(restored.contextStatus, 'loading');
    assert.equal(restored.contextRevision, reading.contextRevision);
    assert.equal(restored.agent?.cancelRequested, false);
    assert.equal(signal?.aborted, false);
    held.resolve();
    await h.app.waitForIdle();
    assert.equal((await h.get(created.id)).context?.fetchedAt, snapshot(2).fetchedAt);
    assert.equal((await h.get(created.id)).status, 'ready');
  } finally {
    held.resolve();
    await h.dispose();
  }
});

test('server restart preserves financial snapshots and resumes financial acquisition without graph checkpoints or model work', async () => {
  const h = await harness();
  let restarted: Awaited<ReturnType<typeof createApp>> | undefined;
  let restartedServer:
    | ReturnType<Awaited<ReturnType<typeof createApp>>['app']['listen']>
    | undefined;
  try {
    const created = await h.create();
    await h.app.waitForIdle();
    const historical = await h.create({ ...input, researchMode: 'deep' });
    await h.app.waitForIdle();
    const historicalBefore = await h.get(historical.id);
    const store = await h.app.workspaceForUser(h.owner.userId);
    const stored = store.state.companyRuns!.find((run) => run.id === created.id)!;
    const previousSnapshot = structuredClone(stored.context);
    const previousRevision = stored.agent!.revision;
    // Recreate the durable state at an interrupted read, including a usable early snapshot.
    stored.status = 'running';
    stored.contextStatus = 'loading';
    stored.createdAt = new Date(Date.now() - 2 * 86400000).toISOString();
    stored.agent!.branches.find((branch) => branch.id === 'finance')!.status = 'running';
    const financeTrace = stored.trace.find((entry) => entry.tool === 'collect-public-context')!;
    financeTrace.status = 'running';
    financeTrace.finishedAt = undefined;
    await store.persist();
    await h.stop();
    restarted = await createApp({
      dataDir: h.directory,
      model: { apiKey: 'fixture-configured-model' },
      companyService: h.companyService,
      companyContextService: h.service,
    });
    restartedServer = restarted.app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => restartedServer!.once('listening', resolve));
    const base = `http://127.0.0.1:${(restartedServer.address() as AddressInfo).port}`;
    const call = (suffix: string, body?: unknown) =>
      fetch(`${base}/api/company-runs/${created.id}${suffix}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: h.owner.headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const recoveredResponse = await call('');
    assert.equal(recoveredResponse.status, 200);
    const recovered = (await recoveredResponse.json()) as CompanyResearchRun;
    assert.equal(recovered.status, 'failed');
    assert.equal(recovered.contextStatus, 'failed');
    assert.deepEqual(recovered.context, previousSnapshot);
    assert.equal(recovered.agent?.version, 'financial-v1');
    assert.equal(recovered.agent?.recoverable, true);
    assert.equal(recovered.agent?.revision, previousRevision + 1);
    assert.equal(
      recovered.agent?.branches.find((branch) => branch.id === 'finance')?.status,
      'failed'
    );
    assert.deepEqual(
      await (
        await fetch(`${base}/api/company-runs/${historical.id}`, {
          headers: h.owner.headers,
        })
      ).json(),
      historicalBefore
    );
    assert.equal((await call('/resume', { revision: recovered.agent!.revision })).status, 202);
    await restarted.waitForIdle();
    const finished = (await (await call('')).json()) as CompanyResearchRun;
    assert.equal(finished.status, 'ready');
    assert.equal(finished.contextStatus, 'ready');
    assert.equal(finished.context?.fetchedAt, snapshot(2).fetchedAt);
    assert.equal(finished.input.researchMode, 'financial');
    assert.equal(finished.agent?.version, 'financial-v1');
    assert.equal(finished.agent?.recoverable, false);
    assert.equal(finished.model.status, 'not-requested');
    assert.equal(h.counts().contextCalls, 2);
    assert.equal(
      h.counts().legacyCalls,
      1,
      'Only the explicit historical deep request used the graph runner'
    );
    assert.equal(h.counts().modelCalls, 0);
    const reopenedStore = await restarted.workspaceForUser(h.owner.userId);
    await assert.rejects(access(path.join(reopenedStore.dataDir, 'company-agent', created.id)));
  } finally {
    if (restarted) {
      await restarted.waitForIdle();
      if (restartedServer)
        await new Promise<void>((resolve) => restartedServer!.close(() => resolve()));
      restarted.auth.close();
    }
    await h.dispose();
  }
});

test('financial resume rejects an active context retry without duplicating source calls and remains usable after cancellation', async () => {
  const started = deferred();
  const held = deferred();
  const finished = deferred();
  let calls = 0;
  let retrySignal: AbortSignal | undefined;
  const h = await harness({
    context: async (_identity, options) => {
      calls++;
      if (calls === 1) {
        await options?.onSnapshot?.(snapshot());
        throw Error('Fixture first acquisition failed after early publication');
      }
      if (calls === 2) {
        retrySignal = options?.signal;
        started.resolve();
        try {
          await held.promise;
          return snapshot(2);
        } finally {
          finished.resolve();
        }
      }
      return snapshot(3);
    },
  });
  try {
    const created = await h.create();
    await h.app.waitForIdle();
    const failed = await h.get(created.id);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.agent?.recoverable, true);
    assert.equal(calls, 1);
    assert.equal(
      (await h.call(`/company-runs/${created.id}/context`, { refresh: true })).status,
      202
    );
    await started.promise;
    const retrying = await h.get(created.id);
    assert.equal(retrying.status, 'failed');
    assert.equal(retrying.contextStatus, 'loading');
    for (let attempt = 0; attempt < 2; attempt++)
      assert.equal(
        (
          await h.call(`/company-runs/${created.id}/resume`, {
            revision: retrying.agent!.revision,
          })
        ).status,
        409
      );
    assert.equal(
      calls,
      2,
      'Exactly one additional source acquisition belongs to the context retry'
    );
    assert.equal(retrySignal?.aborted, false);
    const cancelledResponse = await h.call(`/company-runs/${created.id}/research/cancel`, {
      contextRevision: retrying.contextRevision,
    });
    assert.equal(cancelledResponse.status, 200);
    const cancelled = (await cancelledResponse.json()) as CompanyResearchRun;
    assert.equal(cancelled.contextStatus, 'failed');
    assert.equal(retrySignal?.aborted, true);
    assert.deepEqual(cancelled.context, failed.context);
    assert.equal(
      (
        await h.call(`/company-runs/${created.id}/resume`, {
          revision: cancelled.agent!.revision,
        })
      ).status,
      202
    );
    await h.app.waitForIdle();
    assert.equal(calls, 3);
    assert.equal((await h.get(created.id)).context?.fetchedAt, snapshot(3).fetchedAt);
    held.resolve();
    await finished.promise;
    assert.equal((await h.get(created.id)).context?.fetchedAt, snapshot(3).fetchedAt);
    assert.equal((await h.get(created.id)).status, 'ready');
    assert.equal(h.counts().legacyCalls, 0);
    assert.equal(h.counts().modelCalls, 0);
  } finally {
    held.resolve();
    await h.dispose();
  }
});

test('financial resume rejects an active explicit assessment after source failure', async () => {
  const started = deferred();
  const held = deferred();
  let sourceCalls = 0;
  const h = await harness({
    context: async (_identity, options) => {
      sourceCalls++;
      await options?.onSnapshot?.(snapshot());
      throw Error('Fixture first acquisition failed after early publication');
    },
    assessment: async (run) => {
      started.resolve();
      await held.promise;
      return deriveCompanyAssessment(run);
    },
  });
  try {
    const created = await h.create();
    await h.app.waitForIdle();
    assert.equal((await h.get(created.id)).status, 'failed');
    assert.equal((await h.call(`/company-runs/${created.id}/assessment`, {})).status, 202);
    await started.promise;
    const assessing = await h.get(created.id);
    assert.equal(assessing.assessmentStatus, 'loading');
    assert.equal(
      (
        await h.call(`/company-runs/${created.id}/resume`, {
          revision: assessing.agent!.revision,
        })
      ).status,
      409
    );
    assert.equal(sourceCalls, 1);
    assert.equal(h.counts().legacyCalls, 0);
    held.resolve();
    await h.app.waitForIdle();
    assert.equal((await h.get(created.id)).assessmentStatus, 'ready');
  } finally {
    held.resolve();
    await h.dispose();
  }
});
