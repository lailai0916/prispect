import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AuthSession, CompanyResearchRun } from '../shared/contracts.js';
import type { CompanyAssessment } from '../shared/company-assessment.js';
import {
  contextAmountFields,
  industryMetricKeys,
  type CompanyContextSnapshot,
  type CompanyIndustrySnapshot,
} from '../shared/company-workspace.js';
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
const snapshot = (fetchedAt = new Date().toISOString()): CompanyContextSnapshot => ({
  version: 1,
  securityCode: identity.securityCode,
  orgId: identity.orgId,
  companyName: identity.companyName,
  fetchedAt,
  status: 'partial',
  financials: [
    {
      period: '2025-12-31',
      annual: true,
      noticeDate: null,
      amounts: Object.fromEntries(
        contextAmountFields.map((field) => [field, field === 'ocf' ? '80.00' : null])
      ) as CompanyContextSnapshot['financials'][number]['amounts'],
      ratios: { grossMargin: null, roe: null, revenueGrowth: null },
      auditOpinion: null,
      fieldSources: { ocf: 'fixture-cashflow' },
      sourceUrls: ['https://www.cninfo.com.cn/'],
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
  warnings: [],
});
const industry = (): CompanyIndustrySnapshot => ({
  version: 1,
  securityCode: identity.securityCode,
  period: '2025-12-31',
  industry: '白酒',
  industryCode: 'BK0896',
  fetchedAt: new Date().toISOString(),
  status: 'partial',
  peerCount: 5,
  minimumSamples: 5,
  metrics: Object.fromEntries(
    industryMetricKeys.map((key) => [
      key,
      { company: null, mean: null, median: null, count: 0, missing: 5, difference: null },
    ])
  ) as CompanyIndustrySnapshot['metrics'],
  samples: Array.from({ length: 5 }, (_item, index) => ({
    code: `00000${index + 1}`,
    name: `Fixture peer ${index + 1}`,
    noticeDate: null,
    values: Object.fromEntries(industryMetricKeys.map((key) => [key, null])) as Record<
      (typeof industryMetricKeys)[number],
      number | null
    >,
  })),
  sources: [],
  warnings: ['Fixture industry metrics are incomplete.'],
});
const assessment = (run: CompanyResearchRun): CompanyAssessment => ({
  version: 1,
  year: run.input.year,
  basis: 'consolidated',
  snapshotFetchedAt: run.context!.fetchedAt,
  generatedAt: new Date().toISOString(),
  grade: 'NR',
  score: null,
  methodologyVersion: 'financial-screen-v1',
  dimensions: [],
  metrics: [],
  evidence: [],
  coverage: {
    fields: 1,
    requiredFields: 10,
    years: 1,
    sources: 0,
    news: 0,
    disclosures: 0,
    excerpts: 0,
    peers: run.industry?.['2025-12-31']?.peerCount || 0,
  },
  gaps: [['关键字段不完整。', 'Key fields are incomplete.']],
  model: { status: 'completed', calls: 1, name: 'fixture-grok', provider: 'fixture' },
});
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function waitUntil(predicate: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'The expected asynchronous job did not start.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function harness(overrides: Partial<CompanyContextService> = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-assessment-api-'));
  const service: CompanyContextService = {
    searchCompanies: async (query) => ({
      query,
      candidates: [identity],
      limitedToListed: true,
      source: 'cninfo',
      truncated: false,
    }),
    context: async (_identity, options) => {
      const value = snapshot();
      await options?.onSnapshot?.(structuredClone(value));
      return value;
    },
    industry: async () => industry(),
    question: answerCompanyQuestion,
    assessment: async (run) => assessment(run),
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
        name: 'Analysis acceptance',
        password: 'analysis-acceptance-pass',
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
  const owner = await register('assessment-owner@example.test');
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
  const createRun = async () => {
    const response = await call('/company-runs', {
      securityCode: identity.securityCode,
      orgId: identity.orgId,
      year: 2025,
      purpose: 'handover',
    });
    assert.equal(response.status, 202);
    const run = (await response.json()) as CompanyResearchRun;
    await app.waitForIdle();
    return run;
  };
  const getRun = async (id: string) => {
    const response = await call(`/company-runs/${id}`);
    assert.equal(response.status, 200);
    return (await response.json()) as CompanyResearchRun;
  };
  const stop = async () => {
    await app.waitForIdle();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    app.auth.close();
  };
  const dispose = async () => {
    await stop();
    await rm(directory, { recursive: true, force: true });
  };
  return { app, directory, service, base, owner, register, call, createRun, getRun, stop, dispose };
}

test('analysis starts after context and selected-year peers, deduplicates and stays owner-scoped', async () => {
  const gate = deferred();
  let calls = 0;
  const inputs: CompanyResearchRun[] = [];
  const industryRequests: [string, string][] = [];
  const h = await harness({
    industry: async (code, period) => {
      industryRequests.push([code, period]);
      return industry();
    },
    assessment: async (run) => {
      calls++;
      inputs.push(structuredClone(run));
      await gate.promise;
      return assessment(run);
    },
  });
  try {
    const other = await h.register('assessment-other@example.test');
    const run = await h.createRun();
    const ownerStore = await h.app.workspaceForUser(h.owner.userId);
    const storedRun = ownerStore.state.companyRuns!.find((item) => item.id === run.id)!;
    Object.assign(storedRun, {
      adoptedMaterialId: 'owner-private-original',
      privateSecret: 'account-only-sentinel',
      questions: [
        {
          question: 'Saved account question',
          text: 'Existing account answer',
          citations: [],
          mode: 'rules',
          createdAt: new Date().toISOString(),
          snapshotFetchedAt: new Date().toISOString(),
        },
      ],
    });
    await ownerStore.persist();
    assert.equal((await h.call(`/company-runs/${run.id}/context`, {})).status, 202);
    await waitUntil(() => calls === 1);
    assert.deepEqual(industryRequests, [[identity.securityCode, '2025-12-31']]);
    assert.equal(inputs[0]!.context?.securityCode, identity.securityCode);
    assert.equal(inputs[0]!.context?.financials[0]?.period, '2025-12-31');
    assert.equal(inputs[0]!.industry?.['2025-12-31']?.peerCount, 5);
    assert.equal(inputs[0]!.adoptedMaterialId, undefined);
    assert.equal(inputs[0]!.questions, undefined);
    assert.equal(
      (inputs[0] as CompanyResearchRun & { privateSecret?: string }).privateSecret,
      undefined
    );
    assert.equal((await h.getRun(run.id)).assessmentStatus, 'loading');
    assert.equal((await h.call(`/company-runs/${run.id}/assessment`, {})).status, 202);
    assert.equal(
      (await h.call(`/company-runs/${run.id}/assessment`, { refresh: true })).status,
      202
    );
    assert.equal(calls, 1);
    assert.equal(
      (await h.call(`/company-runs/${run.id}/assessment`, {}, other.headers)).status,
      404
    );
    assert.equal((await h.call('/reset', { confirm: 'RESET_DEMO' })).status, 409);
    const noCsrf = await h.call(
      `/company-runs/${run.id}/assessment`,
      {},
      {
        ...h.owner.headers,
        'X-CSRF-Token': '',
      }
    );
    assert.equal(noCsrf.status, 403);
    assert.equal(
      (
        await h.call(`/company-runs/${run.id}/assessment`, {
          privateDecision: 'must not be accepted',
        })
      ).status,
      400
    );
    gate.resolve();
    await h.app.waitForIdle();
    const ready = await h.getRun(run.id);
    assert.equal(ready.assessmentStatus, 'ready');
    assert.equal(ready.assessment?.snapshotFetchedAt, ready.context?.fetchedAt);
    assert.equal(ready.assessment?.year, 2025);
    assert.equal(ready.assessment?.coverage.peers, 5);
    assert.equal(ready.adoptedMaterialId, 'owner-private-original');
    assert.equal(ready.questions?.[0]?.text, 'Existing account answer');
    assert.equal((await h.call(`/company-runs/${run.id}/assessment`, {})).status, 200);
    assert.equal(calls, 1);
    const summaries = await (await h.call('/company-records')).json();
    assert.equal(summaries[0].assessment, undefined);
    assert.deepEqual(await (await h.call('/company-records', undefined, other.headers)).json(), []);
    const store = await h.app.workspaceForUser(h.owner.userId);
    const saved = JSON.parse(await readFile(path.join(store.dataDir, 'workspace.json'), 'utf8'));
    assert.equal(saved.companyRuns[0].assessmentStatus, 'ready');
    assert.equal(saved.companyRuns[0].assessment.snapshotFetchedAt, ready.context?.fetchedAt);
  } finally {
    gate.resolve();
    await h.dispose();
  }
});

test('missing or mismatched peer data does not fabricate peers or prevent public-data analysis', async () => {
  for (const mode of ['failure', 'wrong-company', 'wrong-period'] as const) {
    let received: CompanyResearchRun | undefined;
    const h = await harness({
      industry: async () => {
        if (mode === 'failure') throw Error('industry provider unavailable');
        const value = industry();
        if (mode === 'wrong-company') value.securityCode = '000001';
        else value.period = '2024-12-31';
        return value;
      },
      assessment: async (run) => {
        received = structuredClone(run);
        return assessment(run);
      },
    });
    try {
      const run = await h.createRun();
      await h.call(`/company-runs/${run.id}/context`, {});
      await h.app.waitForIdle();
      const ready = await h.getRun(run.id);
      assert.equal(ready.contextStatus, 'ready', mode);
      assert.equal(ready.assessmentStatus, 'ready', mode);
      assert.equal(ready.industry?.['2025-12-31'], undefined, mode);
      assert.equal(received?.industry?.['2025-12-31'], undefined, mode);
      assert.equal(ready.assessment?.coverage.peers, 0, mode);
    } finally {
      await h.dispose();
    }
  }
});

test('a failed refresh keeps its earlier analysis and original/private records and can be retried', async () => {
  let fail = false;
  let calls = 0;
  const h = await harness({
    assessment: async (run) => {
      calls++;
      if (fail) throw Error('model request interrupted');
      const value = assessment(run);
      // Services receive an isolated snapshot; accidental mutation cannot rewrite the source.
      run.context!.financials[0]!.amounts.ocf = '999999.00';
      run.input.purpose = 'external';
      return value;
    },
  });
  try {
    const run = await h.createRun();
    const store = await h.app.workspaceForUser(h.owner.userId);
    const privateBefore = JSON.stringify({
      tasks: store.state.tasks,
      materials: store.state.materials,
      decisions: store.state.decisions,
    });
    await h.call(`/company-runs/${run.id}/context`, {});
    await h.app.waitForIdle();
    const first = await h.getRun(run.id);
    assert.equal(first.assessmentStatus, 'ready');
    assert.equal(first.context?.financials[0]?.amounts.ocf, '80.00');
    assert.equal(first.input.purpose, 'handover');
    fail = true;
    assert.equal(
      (await h.call(`/company-runs/${run.id}/assessment`, { refresh: true })).status,
      202
    );
    await h.app.waitForIdle();
    const failed = await h.getRun(run.id);
    assert.equal(failed.assessmentStatus, 'failed');
    assert.ok(failed.assessmentError);
    assert.deepEqual(failed.assessment, first.assessment);
    assert.deepEqual(failed.context, first.context);
    fail = false;
    assert.equal((await h.call(`/company-runs/${run.id}/assessment`, {})).status, 202);
    await h.app.waitForIdle();
    const recovered = await h.getRun(run.id);
    assert.equal(recovered.assessmentStatus, 'ready');
    assert.equal(recovered.assessmentError, undefined);
    assert.equal(calls, 3);
    assert.ok((recovered.assessmentRevision || 0) > (first.assessmentRevision || 0));
    assert.equal(
      JSON.stringify({
        tasks: store.state.tasks,
        materials: store.state.materials,
        decisions: store.state.decisions,
      }),
      privateBefore
    );
  } finally {
    await h.dispose();
  }
});

test('analysis from an old public snapshot cannot publish after a source refresh', async () => {
  const gate = deferred();
  let calls = 0;
  let fetched = 0;
  const h = await harness({
    context: async (_identity, options) => {
      const value = snapshot(new Date(Date.now() - (3 - ++fetched) * 1000).toISOString());
      await options?.onSnapshot?.(structuredClone(value));
      return value;
    },
    assessment: async (run) => {
      calls++;
      if (calls === 2) await gate.promise;
      return assessment(run);
    },
  });
  try {
    const run = await h.createRun();
    await h.call(`/company-runs/${run.id}/context`, {});
    await h.app.waitForIdle();
    const first = await h.getRun(run.id);
    await h.call(`/company-runs/${run.id}/assessment`, { refresh: true });
    await waitUntil(() => calls === 2);
    const refreshed = await h.call(`/company-runs/${run.id}/context`, { refresh: true });
    assert.equal(refreshed.status, 202);
    await waitUntil(() => fetched === 2);
    // Keep the old synthesis gated until the context job has completely settled.
    for (let attempt = 0; ; attempt++) {
      const settled = await h.call(`/company-runs/${run.id}/context`, {});
      await settled.arrayBuffer();
      if (settled.status === 200) break;
      assert.equal(settled.status, 202);
      assert.ok(attempt < 500, 'Refreshed context did not settle.');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    gate.resolve();
    await h.app.waitForIdle();
    const latest = await h.getRun(run.id);
    assert.notEqual(latest.context?.fetchedAt, first.context?.fetchedAt);
    assert.equal(
      latest.assessmentTrace?.some((step) => step.status === 'running'),
      false
    );
    // A newly scheduled current analysis is valid. A retained old result must be marked failed.
    if (latest.assessmentStatus === 'ready')
      assert.equal(latest.assessment?.snapshotFetchedAt, latest.context?.fetchedAt);
    else {
      assert.equal(latest.assessmentStatus, 'failed');
      assert.deepEqual(latest.assessment, first.assessment);
      assert.ok(latest.assessmentError);
    }
  } finally {
    gate.resolve();
    await h.dispose();
  }
});

test('an in-flight model result cannot resurrect a record removed from the workspace', async () => {
  const gate = deferred();
  let calls = 0;
  const h = await harness({
    assessment: async (run) => {
      calls++;
      await gate.promise;
      return assessment(run);
    },
  });
  try {
    const run = await h.createRun();
    await h.call(`/company-runs/${run.id}/context`, {});
    await waitUntil(() => calls === 1);
    const removed = await h.call(`/company-runs/${run.id}`, undefined, h.owner.headers, 'DELETE');
    assert.ok([200, 409].includes(removed.status));
    if (removed.status === 409) {
      // Exercise the publishing race even when the public route prevents busy deletion.
      const store = await h.app.workspaceForUser(h.owner.userId);
      store.state.companyRuns = store.state.companyRuns!.filter((item) => item.id !== run.id);
      await store.persist();
    }
    gate.resolve();
    await h.app.waitForIdle();
    assert.equal((await h.call(`/company-runs/${run.id}`)).status, 404);
    assert.equal((await h.call(`/company-runs/${run.id}/assessment`, {})).status, 404);
    const store = await h.app.workspaceForUser(h.owner.userId);
    const saved = JSON.parse(await readFile(path.join(store.dataDir, 'workspace.json'), 'utf8'));
    assert.equal(
      saved.companyRuns.some((item: CompanyResearchRun) => item.id === run.id),
      false
    );
  } finally {
    gate.resolve();
    await h.dispose();
  }
});

test('restart marks an interrupted analysis failed while retaining its completed predecessor', async () => {
  const h = await harness();
  let stopped = false;
  let restart: Awaited<ReturnType<typeof createApp>> | undefined;
  let restartedServer: ReturnType<typeof h.app.app.listen> | undefined;
  try {
    const run = await h.createRun();
    await h.call(`/company-runs/${run.id}/context`, {});
    await h.app.waitForIdle();
    const first = await h.getRun(run.id);
    const store = await h.app.workspaceForUser(h.owner.userId);
    const stored = store.state.companyRuns!.find((item) => item.id === run.id)!;
    stored.assessmentStatus = 'loading';
    stored.assessmentRevision = (stored.assessmentRevision || 0) + 1;
    stored.assessmentTrace = [
      ...(stored.assessmentTrace || []),
      {
        id: 'interrupted-synthesis',
        tool: 'synthesize',
        label: 'Interrupted synthesis',
        status: 'running',
        startedAt: new Date().toISOString(),
        summary: 'Waiting for model response.',
      },
    ];
    await store.persist();
    await h.stop();
    stopped = true;
    restart = await createApp({
      dataDir: h.directory,
      model: {},
      companyContextService: h.service,
    });
    restartedServer = restart.app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => restartedServer!.once('listening', resolve));
    const restartedBase = `http://127.0.0.1:${(restartedServer.address() as AddressInfo).port}`;
    const response = await fetch(`${restartedBase}/api/company-runs/${run.id}`, {
      headers: h.owner.headers,
    });
    assert.equal(response.status, 200);
    const recovered = (await response.json()) as CompanyResearchRun;
    assert.equal(recovered.assessmentStatus, 'failed');
    assert.ok(recovered.assessmentError);
    assert.deepEqual(recovered.assessment, first.assessment);
    assert.deepEqual(recovered.context, first.context);
    const interrupted = recovered.assessmentTrace?.find(
      (step) => step.id === 'interrupted-synthesis'
    );
    assert.equal(interrupted?.status, 'failed');
    assert.ok(interrupted?.finishedAt);
  } finally {
    if (restart) {
      await restart.waitForIdle();
      if (restartedServer)
        await new Promise<void>((resolve) => restartedServer!.close(() => resolve()));
      restart.auth.close();
    }
    if (!stopped) await h.stop();
    await rm(h.directory, { recursive: true, force: true });
  }
});

test('analysis rejects missing context and arbitrary request fields before invoking its service', async () => {
  let calls = 0;
  const h = await harness({
    assessment: async (run) => {
      calls++;
      return assessment(run);
    },
  });
  try {
    const run = await h.createRun();
    assert.equal((await h.call(`/company-runs/${run.id}/assessment`, {})).status, 409);
    assert.equal(
      (await h.call(`/company-runs/${run.id}/assessment`, { focus: 'x'.repeat(1001) })).status,
      400
    );
    assert.equal(
      (await h.call(`/company-runs/${run.id}/assessment`, { company: 'a different issuer' }))
        .status,
      400
    );
    const anonymous = await fetch(`${h.base}/api/company-runs/${run.id}/assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(anonymous.status, 401);
    assert.equal(calls, 0);
  } finally {
    await h.dispose();
  }
});

test('research streams its actual steps, feeds sourced additions into analysis and caches by focus', async () => {
  const gate = deferred();
  let researchCalls = 0;
  const inputs: CompanyResearchRun[] = [];
  const h = await harness({
    research: async (run, _model, options) => {
      researchCalls++;
      const step = {
        id: `research-${researchCalls}`,
        tool: 'public_news',
        label: 'Read public news',
        status: 'running' as const,
        startedAt: new Date().toISOString(),
        summary: 'Reading source-backed public news.',
      };
      await options?.onStep?.(step);
      if (researchCalls === 2) await gate.promise;
      const completed = {
        ...step,
        status: 'completed' as const,
        finishedAt: new Date().toISOString(),
        summary: 'One linked public headline was retrieved.',
      };
      const enriched = structuredClone(run);
      enriched.context!.news = [
        {
          title: 'Fixture public headline',
          date: '2026-01-02',
          media: 'Fixture media',
          url: 'https://www.cninfo.com.cn/new/disclosure/detail?announcementId=fixture',
          provider: 'fixture',
          digest: 'Headline only; not an established adverse event.',
        },
      ];
      await options?.onStep?.(completed);
      return { run: enriched, steps: [completed], modelCalls: 1, toolCalls: 1 };
    },
    assessment: async (run) => {
      inputs.push(structuredClone(run));
      return assessment(run);
    },
  });
  try {
    const run = await h.createRun();
    await h.call(`/company-runs/${run.id}/context`, {});
    await h.app.waitForIdle();
    assert.equal(researchCalls, 1);
    assert.equal(inputs[0]?.context?.news[0]?.title, 'Fixture public headline');
    const focus = '优先分析经营现金与利润差异';
    assert.equal((await h.call(`/company-runs/${run.id}/assessment`, { focus })).status, 202);
    await waitUntil(() => researchCalls === 2);
    const loading = await h.getRun(run.id);
    assert.equal(loading.assessmentFocus, focus);
    assert.equal(loading.assessmentTrace?.[0]?.status, 'running');
    assert.equal(
      (await h.call(`/company-runs/${run.id}/assessment`, { focus: 'replace the active goal' }))
        .status,
      409
    );
    assert.equal((await h.call(`/company-runs/${run.id}/assessment`, { focus })).status, 202);
    assert.equal(researchCalls, 2);
    assert.equal((await h.getRun(run.id)).assessmentFocus, focus);
    const store = await h.app.workspaceForUser(h.owner.userId);
    const persistedLoading = JSON.parse(
      await readFile(path.join(store.dataDir, 'workspace.json'), 'utf8')
    );
    assert.equal(persistedLoading.companyRuns[0].assessmentTrace[0].status, 'running');
    gate.resolve();
    await h.app.waitForIdle();
    const finished = await h.getRun(run.id);
    assert.equal(finished.assessmentStatus, 'ready');
    assert.equal(finished.assessmentFocus, focus);
    assert.equal(finished.assessmentTrace?.[0]?.status, 'completed');
    assert.equal(
      finished.assessmentTrace?.find((step) => step.tool === 'synthesize')?.status,
      'completed'
    );
    assert.equal(finished.assessment?.research?.modelCalls, 2);
    assert.equal(finished.assessment?.research?.toolCalls, 1);
    assert.equal(inputs[1]?.assessmentFocus, focus);
    assert.equal((await h.call(`/company-runs/${run.id}/assessment`, { focus })).status, 200);
    assert.equal((await h.call(`/company-runs/${run.id}/assessment`, {})).status, 200);
    assert.equal(researchCalls, 2);
    assert.equal(
      (await h.call(`/company-runs/${run.id}/assessment`, { focus: '改为关注偿付杠杆' })).status,
      202
    );
    await h.app.waitForIdle();
    assert.equal(researchCalls, 3);
    assert.equal((await h.getRun(run.id)).assessmentFocus, '改为关注偿付杠杆');
    assert.equal((await h.call(`/company-runs/${run.id}/assessment`, { focus: '' })).status, 202);
    await h.app.waitForIdle();
    assert.equal((await h.getRun(run.id)).assessmentFocus || '', '');
  } finally {
    gate.resolve();
    await h.dispose();
  }
});

test('fresh cached reads avoid model work while manual analysis obeys its separate account limit', async () => {
  let calls = 0;
  const h = await harness({
    assessment: async (run) => {
      calls++;
      return assessment(run);
    },
  });
  try {
    const run = await h.createRun();
    await h.call(`/company-runs/${run.id}/context`, {});
    await h.app.waitForIdle();
    for (let attempt = 0; attempt < 3; attempt++)
      assert.equal((await h.call(`/company-runs/${run.id}/assessment`, {})).status, 200);
    assert.equal(calls, 1);
    // Automatic work follows the separate context limit; manual research allows twelve jobs.
    for (let attempt = 0; attempt < 12; attempt++) {
      const response = await h.call(`/company-runs/${run.id}/assessment`, { refresh: true });
      assert.equal(response.status, 202);
      await h.app.waitForIdle();
    }
    assert.equal(calls, 13);
    const limited = await h.call(`/company-runs/${run.id}/assessment`, { refresh: true });
    assert.equal(limited.status, 429);
    assert.equal(calls, 13);
    assert.equal((await h.getRun(run.id)).assessmentStatus, 'ready');
    assert.equal((await h.call(`/company-runs/${run.id}/assessment`, {})).status, 200);
  } finally {
    await h.dispose();
  }
});

test('synthesis reports its actual attempts even when the model falls back after a repair', async () => {
  const gate = deferred();
  let started = false;
  const h = await harness({
    research: async (run) => ({
      run: structuredClone(run),
      steps: [],
      modelCalls: 2,
      toolCalls: 0,
    }),
    assessment: async (run) => {
      started = true;
      await gate.promise;
      return {
        ...assessment(run),
        model: {
          status: 'failed',
          calls: 2,
          warning: 'Fixture synthesis and repair both failed source validation.',
        },
      };
    },
  });
  try {
    const run = await h.createRun();
    await h.call(`/company-runs/${run.id}/context`, {});
    await waitUntil(() => started);
    const loading = await h.getRun(run.id);
    assert.equal(loading.assessmentStatus, 'loading');
    assert.equal(
      loading.assessmentTrace?.find((step) => step.tool === 'synthesize')?.status,
      'running'
    );
    gate.resolve();
    await h.app.waitForIdle();
    const ready = await h.getRun(run.id);
    assert.equal(ready.assessmentStatus, 'ready');
    assert.equal(ready.assessment?.model.status, 'failed');
    assert.equal(ready.assessment?.model.calls, 2);
    assert.equal(ready.assessment?.research?.modelCalls, 4);
    assert.equal(ready.assessment?.research?.toolCalls, 0);
    assert.equal(
      ready.assessmentTrace?.find((step) => step.tool === 'synthesize')?.status,
      'completed'
    );
    assert.equal(ready.assessment?.grade, 'NR');
    assert.ok(ready.assessment?.model.warning);
  } finally {
    gate.resolve();
    await h.dispose();
  }
});

test('a failed final save rolls back the new analysis, public supplements, peers and cache hash', async () => {
  const saveReached = deferred();
  const releaseSave = deferred();
  let researchCalls = 0;
  let modelCalls = 0;
  const h = await harness({
    research: async (run) => {
      researchCalls++;
      const working = structuredClone(run);
      if (researchCalls > 1) {
        working.industry = { '2025-12-31': industry() };
        working.context!.news.push({
          title: 'New supplementary headline awaiting durable publication',
          date: '2026-01-02',
          media: 'Fixture media',
          url: 'https://www.cninfo.com.cn/',
          provider: 'fixture',
          digest: 'A sourced headline is not an established event.',
        });
        working.context!.announcements.push({
          id: 'new-supplementary-announcement',
          title: 'New official announcement',
          date: '2026-01-02',
          url: 'https://www.cninfo.com.cn/',
          sources: [{ provider: 'fixture', url: 'https://www.cninfo.com.cn/' }],
          category: 'routine',
          attention: 'routine',
          matched: '',
          meaning: 'Read the actual source before drawing an event conclusion.',
          nextQuestion: 'Which dated facts does this source establish?',
        });
        working.context!.sources.push({
          id: 'new-supplementary-source',
          provider: 'fixture',
          dimension: 'news',
          url: 'https://www.cninfo.com.cn/',
          status: 'available',
          fetchedAt: new Date().toISOString(),
          latestDate: '2026-01-02',
          count: 1,
          note: 'Source-backed fixture receipt.',
          responseHashes: ['a'.repeat(64)],
        });
      }
      return { run: working, steps: [], modelCalls: 0, toolCalls: 1 };
    },
    assessment: async (run) => ({
      ...assessment(run),
      model: { status: 'completed', calls: 2, provider: `fixture-result-${++modelCalls}` },
    }),
  });
  let restorePersist: (() => void) | undefined;
  try {
    const run = await h.createRun();
    await h.call(`/company-runs/${run.id}/context`, {});
    await h.app.waitForIdle();
    const first = await h.getRun(run.id);
    const store = await h.app.workspaceForUser(h.owner.userId);
    const stored = store.state.companyRuns!.find((item) => item.id === run.id)!;
    const previousAssessment = stored.assessment;
    const originalPersist = store.persist.bind(store);
    let rejectFinal = true;
    store.persist = async () => {
      if (
        rejectFinal &&
        stored.assessmentStatus === 'ready' &&
        stored.assessment !== previousAssessment
      ) {
        rejectFinal = false;
        saveReached.resolve();
        await releaseSave.promise;
        throw Error('Fixture final-save storage failure');
      }
      await originalPersist();
    };
    restorePersist = () => {
      store.persist = originalPersist;
    };
    assert.equal(
      (await h.call(`/company-runs/${run.id}/assessment`, { refresh: true })).status,
      202
    );
    await saveReached.promise;
    const beforeFailure = JSON.parse(
      await readFile(path.join(store.dataDir, 'workspace.json'), 'utf8')
    );
    assert.deepEqual(beforeFailure.companyRuns[0].assessment, first.assessment);
    releaseSave.resolve();
    await h.app.waitForIdle();
    const failed = await h.getRun(run.id);
    assert.equal(failed.assessmentStatus, 'failed');
    assert.ok(failed.assessmentError);
    assert.deepEqual(failed.assessment, first.assessment);
    assert.equal(failed.assessmentInputHash, first.assessmentInputHash);
    assert.deepEqual(failed.context, first.context);
    assert.deepEqual(failed.industry, first.industry);
    const saved = JSON.parse(await readFile(path.join(store.dataDir, 'workspace.json'), 'utf8'));
    assert.equal(saved.companyRuns[0].assessmentStatus, 'failed');
    assert.deepEqual(saved.companyRuns[0].assessment, first.assessment);
    assert.deepEqual(saved.companyRuns[0].context, first.context);
    assert.deepEqual(saved.companyRuns[0].industry, first.industry);
    restorePersist();
    assert.equal((await h.call(`/company-runs/${run.id}/assessment`, {})).status, 202);
    await h.app.waitForIdle();
    const recovered = await h.getRun(run.id);
    assert.equal(recovered.assessmentStatus, 'ready');
    assert.equal(recovered.context?.news.length, 1);
    assert.equal(recovered.context?.sources.length, 1);
    assert.equal(recovered.context?.announcements.length, 1);
    assert.equal(recovered.industry?.['2025-12-31']?.peerCount, 5);
    assert.equal(recovered.assessment?.model.provider, 'fixture-result-3');
    assert.equal(recovered.assessment?.research?.modelCalls, 2);
    assert.equal(recovered.assessment?.research?.toolCalls, 1);
  } finally {
    releaseSave.resolve();
    restorePersist?.();
    await h.dispose();
  }
});

test('peer updates and analysis exclude each other while both allow saved peer reads', async () => {
  const modelGate = deferred();
  const industryGate = deferred();
  let industryCalls = 0;
  let modelCalls = 0;
  let gateIndustry = false;
  const h = await harness({
    industry: async () => {
      industryCalls++;
      if (gateIndustry) await industryGate.promise;
      return { ...industry(), status: 'available' };
    },
    assessment: async (run) => {
      modelCalls++;
      if (modelCalls === 2) await modelGate.promise;
      return assessment(run);
    },
  });
  let pendingIndustry: Promise<Response> | undefined;
  try {
    const run = await h.createRun();
    await h.call(`/company-runs/${run.id}/context`, {});
    await h.app.waitForIdle();
    assert.equal(industryCalls, 1);
    assert.equal(modelCalls, 1);
    assert.equal(
      (await h.call(`/company-runs/${run.id}/assessment`, { refresh: true })).status,
      202
    );
    await waitUntil(() => modelCalls === 2);
    const cachedWhileModel = await h.call(`/company-runs/${run.id}/industry`, {
      period: '2025-12-31',
    });
    assert.equal(cachedWhileModel.status, 200);
    assert.equal((await cachedWhileModel.json()).cached, true);
    const blockedIndustry = await h.call(`/company-runs/${run.id}/industry`, {
      period: '2025-12-31',
      refresh: true,
    });
    assert.equal(blockedIndustry.status, 409);
    assert.equal((await blockedIndustry.json()).code, 'ASSESSMENT_BUSY');
    assert.equal(industryCalls, 1);
    modelGate.resolve();
    await h.app.waitForIdle();
    gateIndustry = true;
    pendingIndustry = h.call(`/company-runs/${run.id}/industry`, {
      period: '2025-12-31',
      refresh: true,
    });
    await waitUntil(() => industryCalls === 2);
    const blockedModel = await h.call(`/company-runs/${run.id}/assessment`, { refresh: true });
    assert.equal(blockedModel.status, 409);
    assert.equal((await blockedModel.json()).code, 'ASSESSMENT_SOURCE_BUSY');
    assert.equal(modelCalls, 2);
    const cachedWhileIndustry = await h.call(`/company-runs/${run.id}/industry`, {
      period: '2025-12-31',
    });
    assert.equal(cachedWhileIndustry.status, 200);
    assert.equal((await cachedWhileIndustry.json()).cached, true);
    industryGate.resolve();
    assert.equal((await pendingIndustry).status, 200);
    await h.app.waitForIdle();
    assert.equal(
      (await h.call(`/company-runs/${run.id}/assessment`, { refresh: true })).status,
      202
    );
    await h.app.waitForIdle();
    assert.equal(modelCalls, 3);
    assert.equal(industryCalls, 2);
    assert.equal((await h.getRun(run.id)).assessmentStatus, 'ready');
  } finally {
    modelGate.resolve();
    industryGate.resolve();
    await pendingIndustry;
    await h.dispose();
  }
});
