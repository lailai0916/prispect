import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AuthSession, CompanyResearchRun } from '../shared/contracts.js';
import {
  contextAmountFields,
  industryMetricKeys,
  type CompanyContextSnapshot,
  type CompanyIndustrySnapshot,
} from '../shared/company-workspace.js';
import { deriveCompanyAssessment } from '../shared/company-assessment.js';
import { createApp } from '../server/app.js';
import type { CompanyContextService } from '../server/company-context-routes.js';
import { answerCompanyQuestion } from '../server/company-questions.js';

const identity = {
  securityCode: '600519',
  orgId: 'gssh0600519',
  shortName: '隔离测试企业',
  companyName: '隔离测试企业股份有限公司',
  exchange: 'sse' as const,
  sourceUrl: 'https://www.cninfo.com.cn/',
};
const input = {
  securityCode: identity.securityCode,
  orgId: identity.orgId,
  year: 2025,
  purpose: 'external',
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}
async function until(predicate: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 5000;
  while (!(await predicate())) {
    assert.ok(Date.now() < deadline, 'Bounded asynchronous fixture did not reach expected state');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const snapshot = (revision: number): CompanyContextSnapshot => ({
  version: 1,
  securityCode: identity.securityCode,
  orgId: identity.orgId,
  companyName: identity.companyName,
  fetchedAt: new Date(Date.now() - 60_000 + revision * 1000).toISOString(),
  status: 'partial',
  financials: [
    {
      period: '2025-12-31',
      annual: true,
      noticeDate: '2026-04-01',
      amounts: {
        ...Object.fromEntries(contextAmountFields.map((field) => [field, null])),
        netProfit: `${100 + revision}.00`,
        ocf: '80.00',
      } as CompanyContextSnapshot['financials'][number]['amounts'],
      ratios: { grossMargin: null, roe: null, revenueGrowth: null },
      auditOpinion: null,
      fieldSources: {},
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
  warnings: ['Isolated API fixture; not production evidence.'],
});
const peer = (label: string): CompanyIndustrySnapshot => ({
  version: 1,
  securityCode: identity.securityCode,
  period: '2025-12-31',
  industry: label,
  industryCode: 'fixture',
  fetchedAt: new Date().toISOString(),
  status: 'partial',
  peerCount: 0,
  minimumSamples: 5,
  metrics: Object.fromEntries(
    industryMetricKeys.map((key) => [
      key,
      {
        company: null,
        mean: null,
        median: null,
        count: 0,
        missing: 0,
        difference: null,
      },
    ])
  ) as CompanyIndustrySnapshot['metrics'],
  samples: [],
  sources: [],
  warnings: ['Isolated peer publication fixture.'],
});
const report = (run: CompanyResearchRun, provider = 'fixture') => ({
  ...deriveCompanyAssessment(run),
  model: { status: 'completed' as const, calls: 1, provider },
});
async function harness(overrides: Partial<CompanyContextService> = {}, configured = true) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-auto-analysis-'));
  let contexts = 0,
    research = 0,
    assessments = 0,
    legacy = 0;
  const contextChoices: { disclosureExcerpts?: boolean; bypassCache?: boolean }[] = [];
  const service: CompanyContextService = {
    searchCompanies: async (query) => ({
      query,
      candidates: [identity],
      source: 'cninfo',
      limitedToListed: true,
      truncated: false,
    }),
    context: async (_identity, options) => {
      contextChoices.push({
        disclosureExcerpts: options?.disclosureExcerpts,
        bypassCache: options?.bypassCache,
      });
      const value = snapshot(++contexts);
      await options?.onSnapshot?.(value);
      return value;
    },
    research: async (run) => {
      research++;
      return { run, steps: [], toolCalls: 0, modelCalls: 0 };
    },
    assessment: async (run) => {
      assessments++;
      return report(run);
    },
    industry: async () => peer('explicit API peers'),
    question: answerCompanyQuestion,
    ...overrides,
  };
  const options = {
    dataDir: directory,
    model: configured ? { apiKey: 'isolated-fixture-model' } : {},
    companyService: {
      searchCompanies: service.searchCompanies,
      runCompanyResearch: async () => {
        legacy++;
        throw Error('Automatic analysis must never invoke the legacy original/PDF graph');
      },
    },
    companyContextService: service,
  };
  const app = await createApp(options);
  const server = app.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const register = async (email: string) => {
    const response = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: 'API fixture', password: 'Auto-Analysis-Fixture42!' }),
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
  const owner = await register('automatic-owner@example.test');
  const call = (url: string, body?: unknown, headers = owner.headers) =>
    fetch(`${base}/api${url}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const create = async (body: unknown = input) => {
    const response = await call('/company-runs', body);
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
    options,
    directory,
    owner,
    service,
    call,
    create,
    get,
    register,
    stop,
    contextChoices,
    counts: () => ({ contexts, research, assessments, legacy }),
    dispose: async () => {
      await stop();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('API data becomes ready while automatic AI is gated; GETs, cached selections and data visits never duplicate it', async () => {
  const held = deferred();
  let researchCalls = 0;
  const h = await harness({
    research: async (run) => {
      researchCalls++;
      assert.equal(run.input.researchMode, 'financial');
      assert.equal(run.input.useModel, true);
      await held.promise;
      return { run, steps: [], modelCalls: 1, toolCalls: 2 };
    },
  });
  try {
    const created = await h.create();
    await until(async () => (await h.get(created.id)).status === 'ready');
    const ready = await h.get(created.id);
    assert.equal(ready.contextStatus, 'ready');
    assert.equal(ready.context?.financials[0]?.amounts.ocf, '80.00');
    assert.equal(ready.assessmentStatus, 'loading');
    assert.equal(ready.agent?.version, 'financial-v1');
    assert.equal(ready.agent?.budget.modelRequests, 0);
    assert.equal(ready.preview, undefined);
    await until(() => researchCalls === 1);
    for (let visit = 0; visit < 3; visit++) {
      assert.equal((await h.call(`/company-runs/${created.id}`)).status, 200);
      assert.equal((await h.call('/company-records')).status, 200);
      assert.equal((await h.call(`/company-runs/${created.id}/context`, {})).status, 200);
    }
    const cached = await h.call('/company-runs', { ...input, reuseExisting: true });
    assert.equal(cached.status, 200);
    assert.equal(((await cached.json()) as CompanyResearchRun).id, created.id);
    assert.equal((await h.call(`/company-runs/${created.id}/assessment`, {})).status, 202);
    assert.equal(researchCalls, 1);
    assert.equal(h.counts().contexts, 1);
    held.resolve();
    await h.app.waitForIdle();
    const complete = await h.get(created.id);
    assert.equal(complete.assessmentStatus, 'ready');
    assert.equal(complete.assessment?.model.status, 'completed');
    assert.equal(complete.assessment?.research?.modelCalls, 2);
    assert.equal((await h.call(`/company-runs/${created.id}/assessment`, {})).status, 200);
    assert.equal(researchCalls, 1);
    assert.equal(h.counts().legacy, 0);
    assert.ok(h.contextChoices.every((choice) => choice.disclosureExcerpts === false));
  } finally {
    held.resolve();
    await h.dispose();
  }
});

test('an unconfigured model preserves financial data and records one unavailable attempt without public research work', async () => {
  const h = await harness({}, false);
  try {
    const created = await h.create();
    await h.app.waitForIdle();
    const ready = await h.get(created.id);
    assert.equal(ready.status, 'ready');
    assert.equal(ready.contextStatus, 'ready');
    assert.equal(ready.assessmentStatus, 'failed');
    assert.match(ready.assessmentError!, /尚未配置/);
    assert.ok(ready.assessmentAutoInputHash);
    assert.equal(ready.assessment, undefined);
    const reused = await h.call('/company-runs', { ...input, reuseExisting: true });
    assert.equal(reused.status, 200);
    await h.get(created.id);
    await h.call('/company-records');
    await h.call(`/company-runs/${created.id}/context`, {});
    assert.deepEqual(h.counts(), { contexts: 1, research: 0, assessments: 0, legacy: 0 });
  } finally {
    await h.dispose();
  }
});

test('refresh replaces an aborted generation; late AI completion cannot publish and subsequent failure keeps the prior report', async () => {
  const old = deferred(),
    current = deferred();
  let calls = 0;
  const signals: AbortSignal[] = [];
  const h = await harness({
    assessment: async (run, _model, signal) => {
      const index = ++calls;
      signals.push(signal!);
      if (index < 3) await (index === 1 ? old.promise : current.promise);
      if (index === 3)
        return {
          ...deriveCompanyAssessment(run),
          model: { status: 'failed', calls: 1, warning: 'Isolated rejected model result' },
        };
      if (index === 4) throw Error('Isolated synthesis failure');
      return report(run, `generation-${index}`);
    },
  });
  try {
    const created = await h.create();
    await until(() => calls === 1);
    const first = await h.get(created.id);
    assert.equal(
      (await h.call(`/company-runs/${created.id}/context`, { refresh: true })).status,
      202
    );
    await until(() => calls === 2);
    const replacement = await h.get(created.id);
    assert.equal(replacement.status, 'ready');
    assert.equal(replacement.contextStatus, 'ready');
    assert.equal(signals[0]?.aborted, true);
    assert.notEqual(replacement.context?.fetchedAt, first.context?.fetchedAt);
    old.resolve();
    await until(() => signals[0]!.aborted);
    const stillRunning = await h.get(created.id);
    assert.equal(stillRunning.assessmentStatus, 'loading');
    assert.equal(stillRunning.assessment, undefined);
    current.resolve();
    await h.app.waitForIdle();
    const completed = await h.get(created.id);
    assert.equal(completed.assessment?.model.provider, 'generation-2');
    assert.equal(completed.assessment?.snapshotFetchedAt, replacement.context?.fetchedAt);
    assert.equal(
      (await h.call(`/company-runs/${created.id}/context`, { refresh: true })).status,
      202
    );
    await h.app.waitForIdle();
    const failed = await h.get(created.id);
    assert.equal(failed.status, 'ready');
    assert.equal(failed.contextStatus, 'ready');
    assert.equal(failed.assessmentStatus, 'failed');
    assert.deepEqual(failed.assessment, completed.assessment);
    assert.notEqual(failed.context?.fetchedAt, completed.context?.fetchedAt);
    assert.equal(calls, 3);
    assert.equal(h.contextChoices[1]?.bypassCache, true);
    assert.equal(
      (await h.call(`/company-runs/${created.id}/assessment`, { refresh: true })).status,
      202
    );
    await h.app.waitForIdle();
    const thrownFailure = await h.get(created.id);
    assert.equal(thrownFailure.assessmentStatus, 'failed');
    assert.deepEqual(thrownFailure.assessment, completed.assessment);
    assert.deepEqual(thrownFailure.context, failed.context);
    assert.equal(calls, 4);
  } finally {
    old.resolve();
    current.resolve();
    await h.dispose();
  }
});

test('the bounded automatic queue allows API browsing and owner isolation; cancelling a waiting job frees its unresolved gate', async () => {
  const held = deferred();
  let active = 0,
    maximum = 0;
  const started: string[] = [];
  const h = await harness({
    research: async (run) => {
      started.push(run.id);
      maximum = Math.max(maximum, ++active);
      await held.promise;
      active--;
      return { run, steps: [], modelCalls: 0, toolCalls: 0 };
    },
  });
  try {
    const created: CompanyResearchRun[] = [];
    for (let index = 0; index < 5; index++) {
      let run: CompanyResearchRun | undefined;
      await until(async () => {
        const response = await h.call('/company-runs', input);
        if (response.status === 429) {
          // Ready data can be read while its final durable publication still
          // holds the creation lock. This test exercises the background queue,
          // so wait only for that specific lock rather than bypass its guard.
          assert.equal((await response.json()).code, 'COMPANY_AGENT_BUSY');
          return false;
        }
        assert.equal(response.status, 202, await response.clone().text());
        run = (await response.json()) as CompanyResearchRun;
        return true;
      });
      assert.ok(run);
      const readyRun = run;
      created.push(readyRun);
      await until(async () => (await h.get(readyRun.id)).status === 'ready');
    }
    await until(() => started.length === 3);
    assert.equal(maximum, 3);
    const queued = await h.get(created[3]!.id);
    assert.equal(queued.contextStatus, 'ready');
    assert.equal(queued.assessmentStatus, 'loading');
    assert.equal(queued.assessmentTrace?.[0]?.tool, 'queue');
    assert.equal(queued.assessmentTrace?.[0]?.status, 'running');
    const other = await h.register('automatic-other@example.test');
    assert.equal(
      (await h.call(`/company-runs/${queued.id}`, undefined, other.headers)).status,
      404
    );
    assert.equal(
      (await h.call(`/company-runs/${queued.id}/assessment`, {}, other.headers)).status,
      404
    );
    assert.equal(
      (
        await h.call(
          `/company-runs/${queued.id}/research/cancel`,
          { assessmentRevision: queued.assessmentRevision },
          other.headers
        )
      ).status,
      404
    );
    const cancellation = await h.call(`/company-runs/${queued.id}/research/cancel`, {
      assessmentRevision: queued.assessmentRevision,
    });
    assert.equal(cancellation.status, 200);
    assert.equal(((await cancellation.json()) as CompanyResearchRun).assessmentStatus, 'failed');
    held.resolve();
    await h.app.waitForIdle();
    assert.equal(started.includes(queued.id), false);
    assert.equal(started.length, 4);
    assert.equal(maximum, 3);
    assert.equal((await h.get(queued.id)).assessmentStatus, 'failed');
    assert.equal((await h.get(created[4]!.id)).assessmentStatus, 'ready');
    assert.equal((await h.get(queued.id)).contextStatus, 'ready');
  } finally {
    held.resolve();
    await h.dispose();
  }
});

test('independently updated industry data survives AI publication and an in-flight industry request survives public supplement enrichment', async () => {
  const researchHeld = deferred(),
    industryHeld = deferred();
  let researchCalls = 0,
    industryCalls = 0;
  const h = await harness({
    research: async (run) => {
      researchCalls++;
      await researchHeld.promise;
      run.industry = { '2025-12-31': peer('AI research peers') };
      run.context!.news = [
        {
          id: 'fixture-news',
          title: '已取得新闻线索',
          date: '2026-10-03',
          url: 'https://www.cninfo.com.cn/',
          provider: 'isolated',
          media: 'Isolated fixture',
          digest: 'Isolated supplement; not a finding.',
        },
      ];
      return { run, steps: [], modelCalls: 0, toolCalls: 1 };
    },
    industry: async () => {
      industryCalls++;
      if (industryCalls === 2) await industryHeld.promise;
      return peer(`API peers-${industryCalls}`);
    },
  });
  try {
    const created = await h.create();
    await until(() => researchCalls === 1);
    assert.equal(
      (
        await h.call(`/company-runs/${created.id}/industry`, {
          period: '2025-12-31',
          refresh: true,
        })
      ).status,
      200
    );
    const second = h.call(`/company-runs/${created.id}/industry`, {
      period: '2025-12-31',
      refresh: true,
    });
    await until(() => industryCalls === 2);
    researchHeld.resolve();
    await until(async () => (await h.get(created.id)).assessmentStatus === 'ready');
    const enriched = await h.get(created.id);
    assert.equal(enriched.context?.news[0]?.id, 'fixture-news');
    assert.equal(enriched.industry?.['2025-12-31']?.industry, 'API peers-1');
    assert.match(enriched.assessment?.model.warning || '', /同行快照已另行更新/);
    industryHeld.resolve();
    assert.equal((await second).status, 200);
    await h.app.waitForIdle();
    const final = await h.get(created.id);
    assert.equal(final.industry?.['2025-12-31']?.industry, 'API peers-2');
    assert.equal(final.context?.news[0]?.id, 'fixture-news');
    assert.equal(final.assessment?.model.status, 'completed');
  } finally {
    researchHeld.resolve();
    industryHeld.resolve();
    await h.dispose();
  }
});

test('failed queue persistence does not fail financial acquisition or leave an unresolved reserved job', async () => {
  const contextHeld = deferred(),
    contextStarted = deferred();
  let researchCalls = 0;
  const h = await harness({
    context: async (_identity, options) => {
      contextStarted.resolve();
      await contextHeld.promise;
      const value = snapshot(1);
      await options?.onSnapshot?.(value);
      return value;
    },
    research: async (run) => {
      researchCalls++;
      return { run, steps: [], modelCalls: 0, toolCalls: 0 };
    },
  });
  try {
    const created = await h.create();
    await contextStarted.promise;
    const store = await h.app.workspaceForUser(h.owner.userId);
    const persist = store.persist.bind(store);
    let failed = false;
    store.persist = async () => {
      const run = store.state.companyRuns!.find((run) => run.id === created.id)!;
      if (!failed && run.assessmentStatus === 'loading') {
        failed = true;
        throw Error('Isolated queue write failure');
      }
      await persist();
    };
    contextHeld.resolve();
    await h.app.waitForIdle();
    store.persist = persist;
    const saved = await h.get(created.id);
    assert.equal(failed, true);
    assert.equal(saved.status, 'ready');
    assert.equal(saved.contextStatus, 'ready');
    assert.equal(saved.assessmentStatus, 'failed');
    assert.equal(researchCalls, 0);
    assert.equal(saved.context?.financials[0]?.amounts.ocf, '80.00');
  } finally {
    contextHeld.resolve();
    await h.dispose();
  }
});

test('restart marks interrupted automatic analysis failed while retaining API data, previous report and generation identity', async () => {
  const h = await harness();
  let reopened: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    const created = await h.create();
    await h.app.waitForIdle();
    const store = await h.app.workspaceForUser(h.owner.userId);
    const run = store.state.companyRuns!.find((run) => run.id === created.id)!;
    const previous = structuredClone(run.assessment);
    const hash = run.assessmentAutoInputHash;
    run.assessmentStatus = 'loading';
    run.assessmentTrace = [
      {
        id: 'restart-queue',
        tool: 'queue',
        label: '等待后台研究',
        status: 'running',
        startedAt: new Date().toISOString(),
        summary: 'Isolated durable interrupted queue.',
      },
    ];
    await store.persist();
    await h.stop();
    const counts = h.counts();
    reopened = await createApp(h.options);
    const recovered = (await reopened.workspaceForUser(h.owner.userId)).state.companyRuns!.find(
      (run) => run.id === created.id
    )!;
    assert.equal(recovered.status, 'ready');
    assert.equal(recovered.contextStatus, 'ready');
    assert.equal(recovered.assessmentStatus, 'failed');
    assert.match(recovered.assessmentError!, /服务重启/);
    assert.equal(recovered.assessmentTrace?.[0]?.status, 'failed');
    assert.equal(recovered.assessmentAutoInputHash, hash);
    assert.deepEqual(recovered.assessment, previous);
    await reopened.waitForIdle();
    assert.deepEqual(h.counts(), counts);
  } finally {
    if (reopened) {
      await reopened.waitForIdle();
      reopened.auth.close();
    }
    await h.dispose();
  }
});
