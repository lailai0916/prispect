import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AuthSession, CompanyResearchRun } from '../shared/contracts.js';
import type {
  CompanyChallengeResult,
  CompanyChallengeState,
  CompanyChallengeTarget,
} from '../shared/company-challenge.js';
import { contextAmountFields, type CompanyContextSnapshot } from '../shared/company-workspace.js';
import { createApp } from '../server/app.js';
import { deriveChallengeResult } from '../server/company-challenge.js';
import {
  companyChallengeInputHash,
  type CompanyChallengeRouteService,
} from '../server/company-challenge-routes.js';

const identity = {
  securityCode: '300893',
  orgId: 'challengefixture',
  shortName: '测试公司',
  companyName: '测试股份有限公司',
  exchange: 'szse' as const,
  sourceUrl: 'https://www.cninfo.com.cn/',
};
function snapshot(): CompanyContextSnapshot {
  const fetchedAt = new Date().toISOString();
  return {
    version: 1,
    securityCode: identity.securityCode,
    orgId: identity.orgId,
    companyName: identity.companyName,
    fetchedAt,
    status: 'available',
    financials: [2024, 2025].map((year) => ({
      period: `${year}-12-31`,
      annual: true,
      noticeDate: `${year + 1}-04-01`,
      amounts: {
        ...Object.fromEntries(contextAmountFields.map((field) => [field, '10.00'])),
        revenue: year === 2025 ? '1200.00' : '1000.00',
        netProfit: '100.00',
        ocf: '7.15',
        inventory: year === 2025 ? '200.00' : '100.00',
        receivables: '100.00',
      } as CompanyContextSnapshot['financials'][number]['amounts'],
      ratios: { grossMargin: null, roe: null, revenueGrowth: null },
      auditOpinion: null,
      fieldSources: {},
      sourceUrls: ['https://www.cninfo.com.cn/public-fixture-financials'],
      originalUrl: null,
    })),
    sources: [
      {
        id: 'public-fixture-source',
        provider: '公开来源',
        dimension: '年度合并财务',
        url: 'https://www.cninfo.com.cn/public-fixture-financials',
        status: 'available',
        fetchedAt,
        latestDate: '2026-04-01',
        count: 2,
        note: 'Public financial fixture; not adopted original evidence.',
        responseHashes: ['a'.repeat(64)],
      },
    ],
    comparisons: [],
    profile: { industry: '汽车零部件' },
    shareholders: [],
    announcements: [],
    news: [],
    verificationLinks: [],
    warnings: [],
  };
}
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function waitUntil(predicate: () => boolean) {
  const end = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < end, 'The expected job did not start.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
type Envelope = { challenge: CompanyChallengeState | null; stale: boolean; cached?: boolean };
const result = (run: CompanyResearchRun, target: CompanyChallengeTarget): CompanyChallengeResult =>
  deriveChallengeResult(run, target);

async function harness(service: CompanyChallengeRouteService = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-challenge-api-'));
  const app = await createApp({
    dataDir: directory,
    model: {},
    companyChallengeService: { challenge: async (run, target) => result(run, target), ...service },
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
        name: 'Challenge acceptance',
        password: 'challenge-acceptance-pass',
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
  const owner = await register('challenge-owner@example.test');
  const store = await app.workspaceForUser(owner.userId);
  const time = new Date().toISOString();
  const run: CompanyResearchRun = {
    id: 'a65b0272-57a6-448e-ae3d-ac50ac53ab23',
    input: {
      securityCode: identity.securityCode,
      orgId: identity.orgId,
      year: 2025,
      purpose: 'external',
      useModel: true,
    },
    identity: { ...identity },
    context: snapshot(),
    contextStatus: 'ready',
    contextRevision: 1,
    status: 'ready',
    createdAt: time,
    updatedAt: time,
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-called' },
  };
  store.state.companyRuns = [run];
  await store.persist();
  const call = (
    url: string,
    body?: unknown,
    headers = owner.headers,
    method = body === undefined ? 'GET' : 'POST'
  ) =>
    fetch(`${base}/api${url}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const get = async () => {
    const response = await call(`/company-runs/${run.id}/challenge`);
    assert.equal(response.status, 200);
    return (await response.json()) as Envelope;
  };
  const persisted = async () =>
    JSON.parse(await readFile(path.join(store.dataDir, 'workspace.json'), 'utf8'));
  const stop = async () => {
    await app.waitForIdle();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    app.auth.close();
  };
  const dispose = async () => {
    await stop();
    await rm(directory, { recursive: true, force: true });
  };
  return {
    app,
    directory,
    server,
    base,
    owner,
    store,
    run,
    register,
    call,
    get,
    persisted,
    stop,
    dispose,
  };
}

test('challenge API isolates owners, CSRF, payload fields and the service input while deduplicating and caching', async () => {
  const gate = deferred(),
    inputs: CompanyResearchRun[] = [];
  let calls = 0;
  const h = await harness({
    challenge: async (run, target, _model, options) => {
      calls++;
      inputs.push(structuredClone(run));
      const initial = {
        id: 'public-query',
        tool: 'search_news',
        label: 'Read public news',
        status: 'running' as const,
        startedAt: new Date().toISOString(),
        summary: 'Reading a bounded public query.',
      };
      await options?.onStep?.(initial);
      await gate.promise;
      const value = result(run, target);
      // A service cannot alter the owner's source or adopted-original state through its input copy.
      run.context!.financials[0]!.amounts.ocf = '999999.00';
      const complete = {
        ...initial,
        status: 'completed' as const,
        finishedAt: new Date().toISOString(),
        summary: 'Bounded public query completed.',
      };
      await options?.onStep?.(complete);
      value.research.steps = [complete];
      return value;
    },
  });
  try {
    const other = await h.register('challenge-other@example.test');
    Object.assign(h.run, {
      adoptedMaterialId: 'PRIVATE_ADOPTED_SENTINEL',
      contextNotes: 'PRIVATE_NOTES_SENTINEL',
      preview: { value: 'PRIVATE_PREVIEW_SENTINEL' },
      privateAccount: 'PRIVATE_ACCOUNT_SENTINEL',
      questions: ['PRIVATE_QUESTION_SENTINEL'],
      challengeResults: { private: 'PRIVATE_CHALLENGE_HISTORY_SENTINEL' },
    });
    await h.store.persist();
    const baseline = structuredClone(h.run.context);
    assert.deepEqual(await h.get(), { challenge: null, stale: false });
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, undefined, other.headers)).status,
      404
    );
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' }, other.headers))
        .status,
      404
    );
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge/cancel`, {}, other.headers)).status,
      404
    );
    assert.equal(
      (
        await h.call(
          `/company-runs/${h.run.id}/challenge`,
          { target: 'expansion' },
          { ...h.owner.headers, 'X-CSRF-Token': '' }
        )
      ).status,
      403
    );
    for (const body of [
      {},
      { target: 'unsupported' },
      { target: 'expansion', withdrawnFacts: ['fact-2025-ocf'] },
      { target: 'expansion', privateNote: 'PRIVATE_BODY_SENTINEL' },
      { target: 'expansion', url: 'https://evil.example/' },
    ])
      assert.equal((await h.call(`/company-runs/${h.run.id}/challenge`, body)).status, 400);
    const anonymous = await fetch(`${h.base}/api/company-runs/${h.run.id}/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"target":"expansion"}',
    });
    assert.equal(anonymous.status, 401);
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' })).status,
      202
    );
    await waitUntil(() => calls === 1);
    for (const sentinel of [
      'PRIVATE_ADOPTED_SENTINEL',
      'PRIVATE_NOTES_SENTINEL',
      'PRIVATE_PREVIEW_SENTINEL',
      'PRIVATE_ACCOUNT_SENTINEL',
      'PRIVATE_QUESTION_SENTINEL',
      'PRIVATE_CHALLENGE_HISTORY_SENTINEL',
    ])
      assert.ok(!JSON.stringify(inputs[0]).includes(sentinel));
    assert.equal((await h.get()).challenge?.trace[0]?.status, 'running');
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion', refresh: true }))
        .status,
      202
    );
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'collection-pressure' }))
        .status,
      409
    );
    assert.equal(calls, 1);
    assert.equal((await (await h.call('/company-records')).json())[0].deletionBlocked, true);
    assert.equal((await h.call('/reset', { confirm: 'RESET_DEMO' })).status, 409);
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}`, undefined, h.owner.headers, 'DELETE')).status,
      409
    );
    gate.resolve();
    await h.app.waitForIdle();
    const ready = await h.get();
    assert.equal(ready.challenge?.status, 'ready');
    assert.equal(ready.stale, false);
    assert.equal(ready.challenge?.result?.snapshotFetchedAt, h.run.context?.fetchedAt);
    assert.deepEqual(h.run.context, baseline);
    assert.equal(h.run.adoptedMaterialId, 'PRIVATE_ADOPTED_SENTINEL');
    const cached = await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' });
    assert.equal(cached.status, 200);
    assert.equal(calls, 1);
    const saved = await h.persisted();
    assert.equal(saved.companyRuns[0].challenge.status, 'ready');
    assert.equal(saved.companyRuns[0].challenge.trace[0].status, 'completed');
    assert.deepEqual(Object.keys(saved.companyRuns[0].challengeResults), ['expansion']);
  } finally {
    gate.resolve();
    await h.dispose();
  }
});

test('in-place financial, response-hash and revision changes invalidate the active challenge without publishing its old result', async () => {
  let calls = 0;
  let gate: ReturnType<typeof deferred> | undefined;
  const h = await harness({
    challenge: async (run, target) => {
      calls++;
      await gate?.promise;
      return result(run, target);
    },
  });
  try {
    await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' });
    await h.app.waitForIdle();
    assert.equal((await h.get()).challenge?.status, 'ready');
    for (const mutate of [
      () => {
        h.run.context!.financials[0]!.amounts.inventory = '999.00';
      },
      () => {
        h.run.context!.sources[0]!.responseHashes = ['b'.repeat(64)];
      },
      () => {
        h.run.contextRevision = (h.run.contextRevision || 0) + 1;
      },
    ]) {
      const priorCalls = calls,
        fetchedAt = h.run.context!.fetchedAt;
      gate = deferred();
      assert.equal(
        (
          await h.call(`/company-runs/${h.run.id}/challenge`, {
            target: 'expansion',
            refresh: true,
          })
        ).status,
        202
      );
      await waitUntil(() => calls === priorCalls + 1);
      const capturedHash = h.run.challenge!.inputHash;
      mutate();
      await h.store.persist();
      assert.equal(h.run.context!.fetchedAt, fetchedAt);
      assert.notEqual(companyChallengeInputHash(h.run, 'expansion'), capturedHash);
      gate.resolve();
      await h.app.waitForIdle();
      const stale = await h.get();
      assert.equal(stale.stale, true);
      assert.equal(stale.challenge?.status, 'failed');
      assert.equal(stale.challenge?.result, undefined);
      assert.match(stale.challenge!.error!, /公开快照已变化/);
      assert.equal((await h.persisted()).companyRuns[0].challenge.result, undefined);
    }
    assert.equal(calls, 4);
  } finally {
    gate?.resolve();
    await h.dispose();
  }
});

test('cancel aborts the active challenge, retains its predecessor and prevents late completion or retry before cleanup', async () => {
  const gate = deferred();
  let calls = 0;
  let signal: AbortSignal | undefined;
  const h = await harness({
    challenge: async (run, target, _model, options) => {
      calls++;
      if (calls === 1) return result(run, target);
      signal = options?.signal;
      await options?.onStep?.({
        id: 'pending-source',
        tool: 'read_disclosure',
        label: 'Read source',
        status: 'running',
        startedAt: new Date().toISOString(),
        summary: 'Waiting for source.',
      });
      await gate.promise;
      return result(run, target);
    },
  });
  try {
    await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' });
    await h.app.waitForIdle();
    const predecessor = (await h.get()).challenge?.result;
    await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion', refresh: true });
    await waitUntil(() => calls === 2);
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge/cancel`, { unwanted: true })).status,
      400
    );
    const canceledResponse = await h.call(`/company-runs/${h.run.id}/challenge/cancel`, {});
    assert.equal(canceledResponse.status, 200);
    const canceled = (await canceledResponse.json()) as Envelope;
    assert.equal(signal?.aborted, true);
    assert.equal(canceled.challenge?.status, 'failed');
    assert.match(canceled.challenge!.error!, /取消/);
    assert.deepEqual(canceled.challenge?.result, predecessor);
    assert.equal(canceled.challenge?.trace[0]?.status, 'failed');
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' })).status,
      409
    );
    assert.equal((await h.call('/reset', { confirm: 'RESET_DEMO' })).status, 409);
    gate.resolve();
    await h.app.waitForIdle();
    assert.deepEqual(
      await h.get(),
      canceled,
      'a service that returns after cancellation cannot republish'
    );
    const retained = await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' });
    assert.equal(retained.status, 200);
    assert.deepEqual(((await retained.json()) as Envelope).challenge?.result, predecessor);
    assert.equal(calls, 2);
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion', refresh: true }))
        .status,
      202
    );
    await h.app.waitForIdle();
    assert.equal((await h.get()).challenge?.status, 'ready');
  } finally {
    gate.resolve();
    await h.dispose();
  }
});

test('removal or workspace reset while a service is pending cannot resurrect company records or challenge results', async () => {
  for (const action of ['remove', 'reset'] as const) {
    const gate = deferred();
    let started = false;
    const h = await harness({
      challenge: async (run, target) => {
        started = true;
        await gate.promise;
        return result(run, target);
      },
    });
    try {
      await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' });
      await waitUntil(() => started);
      if (action === 'remove') {
        h.store.state.companyRuns = [];
        await h.store.persist();
      } else await h.store.reset();
      gate.resolve();
      await h.app.waitForIdle();
      assert.equal((await h.call(`/company-runs/${h.run.id}/challenge`)).status, 404);
      assert.equal((await h.call(`/company-runs/${h.run.id}`)).status, 404);
      assert.deepEqual((await h.persisted()).companyRuns, []);
    } finally {
      gate.resolve();
      await h.dispose();
    }
  }
});

test('challenge rejects busy sources and mismatched result scopes while keeping public and original state intact', async () => {
  let calls = 0,
    mismatch: 'target' | 'issuer' | 'year' | 'basis' | 'snapshot' = 'target';
  const h = await harness({
    challenge: async (run, target) => {
      calls++;
      const value = result(run, target);
      if (mismatch === 'target') value.target = 'collection-pressure';
      if (mismatch === 'issuer') value.securityCode = '600519';
      if (mismatch === 'year') value.year = 2024;
      if (mismatch === 'basis') (value as { basis: string }).basis = 'parent';
      if (mismatch === 'snapshot') value.snapshotFetchedAt = '2024-01-01T00:00:00.000Z';
      return value;
    },
  });
  try {
    const before = structuredClone(h.run.context);
    h.run.contextStatus = 'loading';
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' })).status,
      409
    );
    h.run.contextStatus = 'ready';
    h.run.assessmentStatus = 'loading';
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' })).status,
      409
    );
    h.run.assessmentStatus = undefined;
    h.run.context!.orgId = 'wrong-issuer';
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' })).status,
      422
    );
    h.run.context!.orgId = identity.orgId;
    const savedIdentity = h.run.identity;
    for (const candidate of [
      undefined,
      { ...identity, securityCode: '600519' },
      { ...identity, orgId: 'another-org' },
      { ...identity, exchange: 'bse' as const },
    ]) {
      h.run.identity = candidate;
      assert.equal(
        (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' })).status,
        422
      );
    }
    h.run.identity = savedIdentity;
    assert.equal(calls, 0);
    for (mismatch of ['target', 'issuer', 'year', 'basis', 'snapshot'] as const) {
      const response = await h.call(`/company-runs/${h.run.id}/challenge`, {
        target: 'expansion',
        refresh: true,
      });
      assert.equal(response.status, 202);
      await h.app.waitForIdle();
      const state = await h.get();
      assert.equal(state.challenge?.status, 'failed');
      assert.equal(state.challenge?.result, undefined);
      assert.match(state.challenge!.error!, /主体、年度或快照不一致/);
      assert.deepEqual(h.run.context, before);
    }
    assert.equal(calls, 5);
  } finally {
    await h.dispose();
  }
});

test('a failed final save restores the completed predecessor and permits a durable retry', async () => {
  const h = await harness();
  let restore: (() => void) | undefined;
  try {
    await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' });
    await h.app.waitForIdle();
    const first = (await h.get()).challenge!.result;
    const originalPersist = h.store.persist.bind(h.store);
    let rejectFinal = true;
    h.store.persist = async () => {
      if (rejectFinal && h.run.challenge?.status === 'ready' && h.run.challenge.result !== first) {
        rejectFinal = false;
        throw Error('private-storage-failure-sentinel');
      }
      await originalPersist();
    };
    restore = () => {
      h.store.persist = originalPersist;
    };
    await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion', refresh: true });
    await h.app.waitForIdle();
    const failed = await h.get();
    assert.equal(failed.challenge?.status, 'failed');
    assert.deepEqual(failed.challenge?.result, first);
    assert.ok(!JSON.stringify(failed).includes('private-storage-failure-sentinel'));
    const saved = await h.persisted();
    assert.equal(saved.companyRuns[0].challenge.status, 'failed');
    assert.deepEqual(saved.companyRuns[0].challenge.result, first);
    restore();
    await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' });
    await h.app.waitForIdle();
    assert.equal((await h.get()).challenge?.status, 'ready');
  } finally {
    restore?.();
    await h.dispose();
  }
});

test('restart marks a loading challenge and its pending stages failed without losing the earlier same-snapshot result', async () => {
  const h = await harness();
  let stopped = false;
  let restarted: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' });
    await h.app.waitForIdle();
    const first = (await h.get()).challenge!.result;
    h.run.challenge!.status = 'loading';
    h.run.challenge!.revision++;
    h.run.challenge!.trace = [
      {
        id: 'interrupted-source',
        tool: 'search_news',
        label: 'Interrupted source',
        status: 'running',
        startedAt: new Date().toISOString(),
        summary: 'Waiting for a public source.',
      },
    ];
    await h.store.persist();
    await h.stop();
    stopped = true;
    restarted = await createApp({ dataDir: h.directory, model: {} });
    const store = await restarted.workspaceForUser(h.owner.userId);
    const recovered = store.state.companyRuns!.find((run) => run.id === h.run.id)!;
    assert.equal(recovered.challenge?.status, 'failed');
    assert.match(recovered.challenge!.error!, /服务重启/);
    assert.equal(recovered.challenge?.trace[0]?.status, 'failed');
    assert.ok(recovered.challenge?.trace[0]?.finishedAt);
    assert.deepEqual(recovered.challenge?.result, first);
    assert.equal(recovered.challenge?.inputHash, companyChallengeInputHash(recovered, 'expansion'));
    const saved = JSON.parse(await readFile(path.join(store.dataDir, 'workspace.json'), 'utf8'));
    assert.equal(saved.companyRuns[0].challenge.status, 'failed');
  } finally {
    if (restarted) {
      await restarted.waitForIdle();
      restarted.auth.close();
    }
    if (!stopped) await h.stop();
    await rm(h.directory, { recursive: true, force: true });
  }
});

test('cached challenge reads avoid provider work while forced jobs respect the separate per-owner limit', async () => {
  let calls = 0;
  const h = await harness({
    challenge: async (run, target) => {
      calls++;
      return result(run, target);
    },
  });
  try {
    for (let index = 0; index < 6; index++) {
      assert.equal(
        (
          await h.call(`/company-runs/${h.run.id}/challenge`, {
            target: 'expansion',
            refresh: true,
          })
        ).status,
        202
      );
      await h.app.waitForIdle();
      for (let cached = 0; cached < 2; cached++)
        assert.equal(
          (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' })).status,
          200
        );
    }
    assert.equal(calls, 6);
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion', refresh: true }))
        .status,
      429
    );
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' })).status,
      200
    );
    assert.equal(calls, 6);
  } finally {
    await h.dispose();
  }
});

test('the global two-job challenge limit is reserved before asynchronous services begin', async () => {
  const gate = deferred();
  let calls = 0;
  const h = await harness({
    challenge: async (run, target) => {
      calls++;
      await gate.promise;
      return result(run, target);
    },
  });
  try {
    const second = { ...structuredClone(h.run), id: '4dcd46ea-c96e-4a67-a5b4-bac188001145' };
    const third = { ...structuredClone(h.run), id: 'd99542d6-78b6-4c73-bf6d-359b894958ee' };
    h.store.state.companyRuns!.push(second, third);
    await h.store.persist();
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' })).status,
      202
    );
    assert.equal(
      (await h.call(`/company-runs/${second.id}/challenge`, { target: 'expansion' })).status,
      202
    );
    await waitUntil(() => calls === 2);
    const blocked = await h.call(`/company-runs/${third.id}/challenge`, { target: 'expansion' });
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).code, 'CHALLENGE_CAPACITY');
    assert.equal(calls, 2);
    assert.equal(third.challenge, undefined);
    gate.resolve();
    await h.app.waitForIdle();
    assert.equal(
      (await h.call(`/company-runs/${third.id}/challenge`, { target: 'expansion' })).status,
      202
    );
    await h.app.waitForIdle();
    assert.equal(calls, 3);
    const completed = await h.call(`/company-runs/${third.id}/challenge`);
    assert.equal(completed.status, 200);
    assert.equal(((await completed.json()) as Envelope).challenge?.status, 'ready');
  } finally {
    gate.resolve();
    await h.dispose();
  }
});

test('failed initial persistence releases the reservation and never starts public research until a durable retry', async () => {
  let calls = 0;
  const h = await harness({
    challenge: async (run, target) => {
      calls++;
      return result(run, target);
    },
  });
  const persist = h.store.persist.bind(h.store);
  let rejectOnce = true;
  try {
    h.store.persist = async () => {
      if (rejectOnce && h.run.challenge?.status === 'loading') {
        rejectOnce = false;
        throw Error('private-storage-start-sentinel');
      }
      await persist();
    };
    const response = await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' });
    assert.equal(response.status, 500);
    assert.ok(!(await response.text()).includes('private-storage-start-sentinel'));
    await h.app.waitForIdle();
    assert.equal(calls, 0);
    assert.equal(h.run.challenge, undefined);
    assert.equal((await h.persisted()).companyRuns[0].challenge, undefined);
    h.store.persist = persist;
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' })).status,
      202
    );
    await h.app.waitForIdle();
    assert.equal(calls, 1);
    assert.equal((await h.get()).challenge?.status, 'ready');
  } finally {
    h.store.persist = persist;
    await h.dispose();
  }
});

test('all three completed targets roundtrip from the owning workspace without tools, while refresh and content changes invalidate reuse', async () => {
  const calls: { target: CompanyChallengeTarget; bypass: boolean | undefined }[] = [];
  const h = await harness({
    challenge: async (run, target, _model, options) => {
      assert.equal(run.challengeResults, undefined, 'History must never enter public research.');
      calls.push({ target, bypass: options?.bypassCache });
      const value = result(run, target);
      value.generatedAt = `2026-10-03T00:00:0${calls.length}.000Z`;
      return value;
    },
  });
  const targets = ['expansion', 'inventory-pressure', 'collection-pressure'] as const;
  const originals = new Map<CompanyChallengeTarget, CompanyChallengeResult>();
  try {
    for (const target of targets) {
      assert.equal((await h.call(`/company-runs/${h.run.id}/challenge`, { target })).status, 202);
      await h.app.waitForIdle();
      originals.set(target, structuredClone(h.run.challenge!.result!));
    }
    assert.equal(calls.length, 3);
    assert.deepEqual(Object.keys(h.run.challengeResults!).sort(), [...targets].sort());
    for (const target of [...targets, ...targets]) {
      const response = await h.call(`/company-runs/${h.run.id}/challenge`, { target });
      assert.equal(response.status, 200);
      const cached = (await response.json()) as Envelope;
      assert.equal(cached.cached, true);
      assert.equal(cached.stale, false);
      assert.deepEqual(cached.challenge!.result, originals.get(target));
    }
    assert.equal(calls.length, 3, 'Six target switches perform no further research.');
    assert.deepEqual((await h.persisted()).companyRuns[0].challengeResults, h.run.challengeResults);
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion', refresh: true }))
        .status,
      202
    );
    await h.app.waitForIdle();
    assert.equal(calls.length, 4);
    assert.equal(calls[3]!.bypass, true);
    assert.notDeepEqual(h.run.challenge!.result, originals.get('expansion'));
    // Same timestamps and revision, changed exact body hash: old target history cannot match.
    h.run.context!.sources[0]!.responseHashes = ['b'.repeat(64)];
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'inventory-pressure' }))
        .status,
      202
    );
    await h.app.waitForIdle();
    assert.equal(calls.length, 5);
    assert.equal(calls[4]!.bypass, false);
    assert.notDeepEqual(h.run.challenge!.result, originals.get('inventory-pressure'));
    const changedHash = h.run.challengeResults!['inventory-pressure']!.inputHash;
    assert.equal(changedHash, companyChallengeInputHash(h.run, 'inventory-pressure'));
    assert.notEqual(
      h.run.challengeResults!.expansion!.inputHash,
      companyChallengeInputHash(h.run, 'expansion')
    );
    assert.equal(Object.keys(h.run.challengeResults!).length, 3);
  } finally {
    await h.dispose();
  }
});

test('failed research or save never publishes a target cache entry, and a failed cached switch restores the previous active target', async () => {
  let failTarget: CompanyChallengeTarget | undefined;
  let calls = 0;
  const h = await harness({
    challenge: async (run, target) => {
      calls++;
      if (target === failTarget) throw Error('Provider failure');
      return result(run, target);
    },
  });
  const persist = h.store.persist.bind(h.store);
  try {
    // A legacy saved run with no history still retains its completed result on a failed switch.
    const legacy = result(h.run, 'expansion');
    h.run.challenge = {
      status: 'ready',
      target: 'expansion',
      revision: 1,
      inputHash: companyChallengeInputHash(h.run, 'expansion'),
      trace: [],
      result: legacy,
    };
    await h.store.persist();
    failTarget = 'inventory-pressure';
    await h.call(`/company-runs/${h.run.id}/challenge`, { target: failTarget });
    await h.app.waitForIdle();
    assert.equal(h.run.challenge!.status, 'failed');
    assert.equal(h.run.challengeResults!['inventory-pressure'], undefined);
    assert.deepEqual(h.run.challengeResults!.expansion!.result, legacy);
    const cached = await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' });
    assert.equal(cached.status, 200);
    assert.equal(calls, 1);
    failTarget = undefined;
    let rejectFinal = true;
    h.store.persist = async () => {
      if (
        rejectFinal &&
        h.run.challenge?.status === 'ready' &&
        h.run.challenge.target === 'collection-pressure'
      ) {
        rejectFinal = false;
        throw Error('Final-save failure');
      }
      await persist();
    };
    await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'collection-pressure' });
    await h.app.waitForIdle();
    assert.equal(h.run.challenge!.status, 'failed');
    assert.equal(h.run.challengeResults!['collection-pressure'], undefined);
    assert.equal(
      (await h.persisted()).companyRuns[0].challengeResults['collection-pressure'],
      undefined
    );
    h.store.persist = persist;
    await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'inventory-pressure' });
    await h.app.waitForIdle();
    const before = h.run.challenge;
    h.store.persist = async () => {
      throw Error('Cached-view-save failure');
    };
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' })).status,
      500
    );
    assert.equal(h.run.challenge, before);
    assert.equal(h.run.challenge!.target, 'inventory-pressure');
    assert.equal(calls, 3, 'A failed cached switch does not start a provider retry.');
  } finally {
    h.store.persist = persist;
    await h.dispose();
  }
});

test('identical run IDs across accounts have independent challenge reservations and cancellation', async () => {
  const gates = [deferred(), deferred()];
  const signals: AbortSignal[] = [];
  const h = await harness({
    challenge: async (run, target, _model, options) => {
      const index = signals.length;
      signals.push(options!.signal!);
      await gates[index]!.promise;
      return result(run, target);
    },
  });
  try {
    const other = await h.register('challenge-duplicate-id@example.test');
    const otherStore = await h.app.workspaceForUser(other.userId);
    const otherRun = structuredClone(h.run);
    otherStore.state.companyRuns = [otherRun];
    await otherStore.persist();
    assert.equal(
      (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' })).status,
      202
    );
    await waitUntil(() => signals.length === 1);
    assert.equal(
      (
        await h.call(
          `/company-runs/${h.run.id}/challenge`,
          { target: 'inventory-pressure' },
          other.headers
        )
      ).status,
      202
    );
    await waitUntil(() => signals.length === 2);
    await h.call(`/company-runs/${h.run.id}/challenge/cancel`, {});
    assert.equal(signals[0]!.aborted, true);
    assert.equal(signals[1]!.aborted, false);
    gates[1]!.resolve();
    await waitUntil(() => otherRun.challenge?.status === 'ready');
    gates[0]!.resolve();
    await h.app.waitForIdle();
    assert.equal(h.run.challenge!.status, 'failed');
    assert.equal(h.run.challengeResults, undefined);
    assert.equal(otherRun.challenge!.status, 'ready');
    assert.equal(
      otherRun.challengeResults!['inventory-pressure']!.result.target,
      'inventory-pressure'
    );
    assert.equal(otherRun.challengeResults!.expansion, undefined);
    assert.equal(
      (
        await h.call(
          `/company-runs/${h.run.id}/challenge`,
          { target: 'inventory-pressure' },
          other.headers
        )
      ).status,
      200
    );
    assert.equal(signals.length, 2);
  } finally {
    gates.forEach((gate) => gate.resolve());
    await h.dispose();
  }
});

test('deleting or resetting completed research removes all three cached targets instead of leaving reusable account-global results', async () => {
  for (const reset of [false, true]) {
    const h = await harness();
    try {
      for (const target of ['expansion', 'inventory-pressure', 'collection-pressure'] as const) {
        await h.call(`/company-runs/${h.run.id}/challenge`, { target });
        await h.app.waitForIdle();
      }
      assert.equal(Object.keys(h.run.challengeResults!).length, 3);
      const response = reset
        ? await h.call('/reset', { confirm: 'RESET_DEMO' })
        : await h.call(`/company-runs/${h.run.id}`, undefined, h.owner.headers, 'DELETE');
      assert.ok(response.ok);
      assert.equal(
        (await h.call(`/company-runs/${h.run.id}/challenge`, { target: 'expansion' })).status,
        404
      );
      assert.equal((await h.persisted()).companyRuns.length, 0);
    } finally {
      await h.dispose();
    }
  }
});

test('completed target history survives a server restart and restores earlier targets without provider execution', async () => {
  const h = await harness();
  let stopped = false;
  let restarted: Awaited<ReturnType<typeof createApp>> | undefined;
  let server: ReturnType<typeof h.app.app.listen> | undefined;
  let calls = 0;
  try {
    for (const target of ['expansion', 'inventory-pressure', 'collection-pressure'] as const) {
      await h.call(`/company-runs/${h.run.id}/challenge`, { target });
      await h.app.waitForIdle();
    }
    const retained = structuredClone(h.run.challengeResults);
    await h.stop();
    stopped = true;
    restarted = await createApp({
      dataDir: h.directory,
      model: {},
      companyChallengeService: {
        challenge: async (run, target) => {
          calls++;
          return result(run, target);
        },
      },
    });
    server = restarted.app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${base}/api/company-runs/${h.run.id}/challenge`, {
      method: 'POST',
      headers: h.owner.headers,
      body: JSON.stringify({ target: 'expansion' }),
    });
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as Envelope).cached, true);
    const store = await restarted.workspaceForUser(h.owner.userId);
    const recovered = store.state.companyRuns!.find((run) => run.id === h.run.id)!;
    assert.deepEqual(recovered.challengeResults, retained);
    assert.deepEqual(recovered.challenge!.result, retained!.expansion!.result);
    assert.equal(calls, 0);
  } finally {
    if (restarted) {
      await restarted.waitForIdle();
      if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
      restarted.auth.close();
    }
    if (!stopped) await h.stop();
    await rm(h.directory, { recursive: true, force: true });
  }
});
