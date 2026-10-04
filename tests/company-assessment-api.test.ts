import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AuthSession, CompanyResearchRun } from '../shared/contracts.js';
import type { CompanyAssessment } from '../shared/company-assessment.js';
import type { CompanyRecordSummary } from '../shared/company-workspace.js';
import {
  contextAmountFields,
  industryMetricKeys,
  type CompanyContextSnapshot,
  type CompanyIndustrySnapshot,
} from '../shared/company-workspace.js';
import { createApp } from '../server/app.js';
import type { CompanyContextService } from '../server/company-context-routes.js';
import { answerCompanyQuestion } from '../server/company-questions.js';
import { runCompanyResearchAgent } from '../server/company-research-agent.js';

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
const supplements = (version: number, newsCount = 1) =>
  ({
    discussions: [
      {
        id: `guba-${1000 + version}`,
        securityCode: identity.securityCode,
        title: `Public opinion fixture ${version}`,
        date: '2026-01-02',
        url: `https://guba.eastmoney.com/news,${identity.securityCode},${1000 + version}.html`,
        provider: '东方财富股吧',
        textScope: 'title' as const,
      },
    ],
    publicSignals: {
      fetchedAt: `2026-01-0${version + 2}T12:00:00.000Z`,
      news: {
        raw: newsCount,
        accepted: newsCount,
        unique: newsCount,
        pages: newsCount,
        hitsTotal: newsCount,
        bodyRead: 0,
        oldest: newsCount ? '2026-01-02' : null,
        latest: newsCount ? '2026-01-02' : null,
        stopReason: 'complete' as const,
      },
      discussions: {
        raw: 1,
        accepted: 1,
        unique: 1,
        pages: 1,
        hitsTotal: 1,
        bodyRead: 0,
        oldest: '2026-01-02',
        latest: '2026-01-02',
        stopReason: 'complete' as const,
      },
    },
    market: {
      securityCode: identity.securityCode,
      status: 'available' as const,
      price: `${version * 100}.00`,
      change: '1.00',
      changePercent: 1,
      high: `${version * 100 + 2}.00`,
      low: `${version * 100 - 2}.00`,
      marketCap: '1000000.00',
      quotedAt: '2026-01-02T07:00:00.000Z',
      fetchedAt: `2026-01-0${version + 2}T12:00:00.000Z`,
      sourceUrl: 'https://push2.eastmoney.com/api/qt/stock/get?secid=1.600519',
    },
  }) satisfies Pick<CompanyContextSnapshot, 'discussions' | 'publicSignals' | 'market'>;
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
    // This suite isolates the account/publishing flow. Full automatic public collection
    // has its own integration coverage and must not make external requests here.
    research: (run, model, options) =>
      runCompanyResearchAgent(run, model, { ...options, collectPublicSignals: false }),
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
      researchMode: 'deep',
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
  const loadContextAndStartAssessment = async (id: string) => {
    assert.equal((await call(`/company-runs/${id}/context`, {})).status, 202);
    await app.waitForIdle();
    assert.equal((await call(`/company-runs/${id}/assessment`, {})).status, 202);
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
  return {
    app,
    directory,
    service,
    base,
    owner,
    register,
    call,
    createRun,
    getRun,
    loadContextAndStartAssessment,
    stop,
    dispose,
  };
}

async function seedSummaryRecord(h: Awaited<ReturnType<typeof harness>>) {
  const created = await h.createRun();
  const store = await h.app.workspaceForUser(h.owner.userId);
  const run = store.state.companyRuns!.find((item) => item.id === created.id)!;
  run.context = snapshot('2026-10-02T00:00:00.000Z');
  run.contextStatus = 'ready';
  run.assessmentStatus = 'ready';
  run.updatedAt = '2026-10-02T00:02:00.000Z';
  run.assessment = {
    ...assessment(run),
    grade: 'C',
    score: 81.25,
    narrative: {
      summary: {
        text: {
          zh: '经营现金需进一步核查，这是已保存的公开分析。',
          en: 'Operating cash needs further checks; this is the saved public analysis.',
        },
        metricIds: [],
        evidenceIds: [],
      },
      dimensions: [],
      strengths: [],
      risks: [],
      actions: [],
      changeConditions: [],
    },
  };
  Object.assign(run, {
    privateSecret: 'private-summary-sentinel',
    adoptedMaterialId: 'private-adopted-original',
    questions: [
      {
        question: 'private-question-sentinel',
        text: 'private-answer-sentinel',
        citations: [],
        mode: 'rules',
        createdAt: run.updatedAt,
        snapshotFetchedAt: run.context.fetchedAt,
      },
    ],
  });
  await store.persist();
  return { run, store };
}

test('company-record metadata exposes only account-local lightweight public results', async () => {
  let contextCalls = 0;
  let modelCalls = 0;
  const h = await harness({
    context: async () => {
      contextCalls++;
      throw Error('The records list must not retrieve public sources.');
    },
    assessment: async () => {
      modelCalls++;
      throw Error('The records list must not call an analysis model.');
    },
  });
  try {
    const { run } = await seedSummaryRecord(h);
    const response = await h.call('/company-records');
    assert.equal(response.status, 200);
    const body = await response.text();
    const records = JSON.parse(body) as CompanyRecordSummary[];
    assert.equal(records.length, 1);
    assert.equal(records[0].id, run.id);
    assert.equal(records[0].input.researchMode, 'deep');
    assert.deepEqual(Object.keys(records[0].input).sort(), [
      'orgId',
      'purpose',
      'researchMode',
      'securityCode',
      'year',
    ]);
    assert.equal(records[0].updatedAt, run.updatedAt);
    assert.equal(records[0].contextStatus, 'ready');
    assert.equal(records[0].assessmentStatus, 'ready');
    assert.deepEqual(records[0].result, {
      grade: 'C',
      score: 81.25,
      statement: run.assessment!.narrative!.summary.text,
      asOf: '2026-10-02T00:00:00.000Z',
      stale: false,
      modelStatus: 'completed',
    });
    assert.deepEqual(Object.keys(records[0]).sort(), [
      'assessmentStatus',
      'contextStatus',
      'createdAt',
      'deletionBlocked',
      'id',
      'informationGap',
      'input',
      'name',
      'result',
      'status',
      'updatedAt',
    ]);
    for (const text of [
      'private-summary-sentinel',
      'private-adopted-original',
      'private-question-sentinel',
      'private-answer-sentinel',
      'fixture-grok',
      'methodologyVersion',
      'financials',
      'metricIds',
      'evidenceIds',
    ])
      assert.equal(body.includes(text), false, `List response must not include ${text}.`);
    const other = await h.register('records-metadata-other@example.test');
    assert.deepEqual(await (await h.call('/company-records', undefined, other.headers)).json(), []);
    const anonymousRecords = await fetch(`${h.base}/api/company-records`);
    assert.equal(anonymousRecords.status, 401);
    assert.equal((await anonymousRecords.json()).code, 'AUTH_REQUIRED');
    assert.equal(contextCalls, 0);
    assert.equal(modelCalls, 0);
  } finally {
    await h.dispose();
  }
});

test('financial record metadata exposes unavailable automatic AI without inventing a report or calling unconfigured research', async () => {
  let modelCalls = 0;
  let researchCalls = 0;
  const h = await harness({
    assessment: async () => {
      modelCalls++;
      throw Error('Unconfigured automatic analysis must not call an assessment model.');
    },
    research: async () => {
      researchCalls++;
      throw Error('Unconfigured automatic analysis must not fetch additional research sources.');
    },
  });
  try {
    const response = await h.call('/company-runs', {
      securityCode: identity.securityCode,
      orgId: identity.orgId,
      year: 2025,
      purpose: 'external',
    });
    assert.equal(response.status, 202);
    const created = (await response.json()) as CompanyResearchRun;
    await h.app.waitForIdle();
    const recordsResponse = await h.call('/company-records');
    assert.equal(recordsResponse.status, 200);
    const records = (await recordsResponse.json()) as CompanyRecordSummary[];
    assert.equal(records.length, 1);
    assert.equal(records[0].id, created.id);
    assert.equal(records[0].input.researchMode, 'financial');
    assert.equal(records[0].contextStatus, 'ready');
    assert.equal(records[0].status, 'ready');
    assert.equal(records[0].assessmentStatus, 'failed');
    assert.equal(records[0].result, undefined);
    const saved = await h.getRun(created.id);
    assert.equal(saved.status, 'ready');
    assert.equal(saved.contextStatus, 'ready');
    assert.equal(saved.assessmentStatus, 'failed');
    assert.match(saved.assessmentError!, /尚未配置/);
    assert.equal(saved.assessment, undefined);
    assert.ok(saved.assessmentAutoInputHash);
    assert.deepEqual(saved.model, { requested: false, status: 'not-requested' });
    assert.deepEqual(Object.keys(records[0].input).sort(), [
      'orgId',
      'purpose',
      'researchMode',
      'securityCode',
      'year',
    ]);
    assert.equal('context' in records[0], false);
    assert.equal('assessment' in records[0], false);
    assert.equal('model' in records[0], false);
    const other = await h.register('financial-metadata-other@example.test');
    assert.deepEqual(await (await h.call('/company-records', undefined, other.headers)).json(), []);
    const anonymousRecords = await fetch(`${h.base}/api/company-records`);
    assert.equal(anonymousRecords.status, 401);
    assert.equal((await anonymousRecords.json()).code, 'AUTH_REQUIRED');
    assert.equal(modelCalls, 0);
    assert.equal(researchCalls, 0);
  } finally {
    await h.dispose();
  }
});

test('company-record metadata excludes results for mismatched issuer, identity and annual scope', async () => {
  const h = await harness();
  try {
    const { run, store } = await seedSummaryRecord(h);
    const original = structuredClone(run);
    for (const mismatch of ['issuer-code', 'issuer-org', 'identity', 'year', 'information-gap']) {
      Object.assign(run, structuredClone(original));
      if (mismatch === 'issuer-code') run.context!.securityCode = '600000';
      else if (mismatch === 'issuer-org') run.context!.orgId = 'unrelated-org';
      else if (mismatch === 'identity') run.identity!.securityCode = '600000';
      else if (mismatch === 'year') run.assessment!.year = 2024;
      else run.informationGap = { name: identity.companyName, reason: '主体未确认' };
      await store.persist();
      const records = (await (await h.call('/company-records')).json()) as CompanyRecordSummary[];
      assert.equal(records[0].result, undefined, `${mismatch} must withhold the result.`);
    }
  } finally {
    await h.dispose();
  }
});

test('company-record metadata preserves the old report date and grade after a source refresh', async () => {
  const h = await harness();
  try {
    const { run, store } = await seedSummaryRecord(h);
    const savedSummary = structuredClone(run.assessment!.narrative!.summary.text);
    const savedGrade = run.assessment!.grade;
    const savedScore = run.assessment!.score;
    run.context!.fetchedAt = '2026-10-02T06:00:00.000Z';
    run.context!.companyName = '新资料中的展示名称';
    await store.persist();
    let records = (await (await h.call('/company-records')).json()) as CompanyRecordSummary[];
    assert.deepEqual(records[0].result, {
      grade: savedGrade,
      score: savedScore,
      statement: savedSummary,
      asOf: '2026-10-02T00:00:00.000Z',
      stale: true,
      modelStatus: 'completed',
    });
    delete run.context;
    await store.persist();
    records = (await (await h.call('/company-records')).json()) as CompanyRecordSummary[];
    assert.equal(records[0].result?.stale, true);
    assert.equal(records[0].result?.asOf, '2026-10-02T00:00:00.000Z');
    assert.equal(records[0].result?.grade, savedGrade);
    assert.deepEqual(records[0].result?.statement, savedSummary);
  } finally {
    await h.dispose();
  }
});

test('company-record rule fallback does not present retained model prose as a new analysis', async () => {
  const h = await harness();
  try {
    const { run, store } = await seedSummaryRecord(h);
    run.assessment!.grade = 'NR';
    run.assessment!.score = null;
    run.assessment!.model.status = 'failed';
    run.assessment!.narrative!.summary.text.zh = '旧模型叙述不应作为规则判断显示';
    run.assessment!.narrative!.summary.text.en =
      'Old model prose must not be shown as a rule judgment.';
    await store.persist();
    const records = (await (await h.call('/company-records')).json()) as CompanyRecordSummary[];
    assert.equal(records[0].result?.modelStatus, 'failed');
    assert.equal(records[0].result?.grade, 'NR');
    assert.equal(records[0].result?.score, null);
    assert.match(records[0].result!.statement.zh, /暂不形成综合评级/);
    assert.equal(records[0].result!.statement.zh.includes('旧模型叙述'), false);
    assert.match(records[0].result!.statement.en, /withheld/);
  } finally {
    await h.dispose();
  }
});

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
    await h.app.waitForIdle();
    assert.equal(calls, 0, 'Reading context does not start a model assessment.');
    assert.equal((await h.call(`/company-runs/${run.id}/assessment`, {})).status, 202);
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
      await h.loadContextAndStartAssessment(run.id);
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
    await h.loadContextAndStartAssessment(run.id);
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
    await h.loadContextAndStartAssessment(run.id);
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
    await h.loadContextAndStartAssessment(run.id);
    await waitUntil(() => calls === 1);
    assert.equal((await (await h.call('/company-records')).json())[0].deletionBlocked, true);
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
    await h.loadContextAndStartAssessment(run.id);
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
      Object.assign(enriched.context!, supplements(researchCalls));
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
    await h.loadContextAndStartAssessment(run.id);
    await h.app.waitForIdle();
    assert.equal(researchCalls, 1);
    assert.equal(inputs[0]?.context?.news[0]?.title, 'Fixture public headline');
    assert.deepEqual(inputs[0]?.context?.discussions, supplements(1).discussions);
    assert.deepEqual(inputs[0]?.context?.publicSignals, supplements(1).publicSignals);
    assert.deepEqual(inputs[0]?.context?.market, supplements(1).market);
    const focus = '优先分析经营现金与利润差异';
    assert.equal((await h.call(`/company-runs/${run.id}/assessment`, { focus })).status, 202);
    await waitUntil(() => researchCalls === 2);
    const loading = await h.getRun(run.id);
    assert.equal(loading.assessmentFocus, focus);
    assert.equal(loading.assessmentTrace?.[0]?.status, 'running');
    assert.deepEqual(loading.context?.discussions, supplements(1).discussions);
    assert.deepEqual(loading.context?.publicSignals, supplements(1).publicSignals);
    assert.deepEqual(loading.context?.market, supplements(1).market);
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
    assert.deepEqual(finished.context?.discussions, supplements(2).discussions);
    assert.deepEqual(finished.context?.publicSignals, supplements(2).publicSignals);
    assert.deepEqual(finished.context?.market, supplements(2).market);
    assert.deepEqual(inputs[1]?.context?.discussions, supplements(2).discussions);
    const durable = JSON.parse(await readFile(path.join(store.dataDir, 'workspace.json'), 'utf8'));
    assert.deepEqual(durable.companyRuns[0].context.discussions, finished.context?.discussions);
    assert.deepEqual(durable.companyRuns[0].context.publicSignals, finished.context?.publicSignals);
    assert.deepEqual(durable.companyRuns[0].context.market, finished.context?.market);
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
    await h.loadContextAndStartAssessment(run.id);
    await h.app.waitForIdle();
    for (let attempt = 0; attempt < 3; attempt++)
      assert.equal((await h.call(`/company-runs/${run.id}/assessment`, {})).status, 200);
    assert.equal(calls, 1);
    // The initial explicit assessment and eleven refreshes use the twelve-job limit.
    for (let attempt = 0; attempt < 11; attempt++) {
      const response = await h.call(`/company-runs/${run.id}/assessment`, { refresh: true });
      assert.equal(response.status, 202);
      await h.app.waitForIdle();
    }
    assert.equal(calls, 12);
    const limited = await h.call(`/company-runs/${run.id}/assessment`, { refresh: true });
    assert.equal(limited.status, 429);
    assert.equal(calls, 12);
    assert.equal((await h.getRun(run.id)).assessmentStatus, 'ready');
    assert.equal((await h.call(`/company-runs/${run.id}/assessment`, {})).status, 200);
  } finally {
    await h.dispose();
  }
});

test('an answer from the prior public context cannot publish after research adds sources with the same financial timestamp', async () => {
  const releaseQuestion = deferred();
  let researchCalls = 0;
  let questionInput: CompanyResearchRun | undefined;
  const h = await harness({
    research: async (run) => {
      const working = structuredClone(run);
      if (++researchCalls > 1) {
        working.context!.news = [
          {
            title: 'New public source after the old question began',
            date: '2026-01-02',
            media: 'Fixture media',
            url: 'https://finance.eastmoney.com/a/202601020000000001.html',
            provider: 'fixture',
            digest: 'A public lead, not an established event.',
          },
        ];
        Object.assign(working.context!, supplements(2));
        working.context!.sources.push({
          id: 'question-race-new-source',
          provider: 'fixture',
          dimension: '公开新闻',
          url: working.context!.news[0]!.url,
          status: 'available',
          fetchedAt: new Date().toISOString(),
          latestDate: '2026-01-02',
          count: 1,
          note: 'An actual source result in this isolated API fixture.',
          responseHashes: ['c'.repeat(64)],
        });
      }
      return { run: working, steps: [], modelCalls: 0, toolCalls: 1 };
    },
    question: async (run, question) => {
      questionInput = structuredClone(run);
      const before = structuredClone(run.context);
      await releaseQuestion.promise;
      assert.deepEqual(
        run.context,
        before,
        'the answer input stays isolated from newly published public sources'
      );
      return {
        question,
        text: 'Answer generated from the earlier public context.',
        citations: [],
        mode: 'rules' as const,
        createdAt: new Date().toISOString(),
        snapshotFetchedAt: run.context!.fetchedAt,
      };
    },
  });
  let pendingQuestion: Promise<Response> | undefined;
  try {
    const run = await h.createRun();
    await h.loadContextAndStartAssessment(run.id);
    await h.app.waitForIdle();
    const first = await h.getRun(run.id);
    const store = await h.app.workspaceForUser(h.owner.userId);
    const stored = store.state.companyRuns!.find((item) => item.id === run.id)!;
    const originalContext = stored.context!;
    const originalPublicSnapshot = structuredClone(originalContext);
    pendingQuestion = h.call(`/company-runs/${run.id}/questions`, {
      question: '哪些公开线索支持现金判断？',
      basis: 'consolidated',
    });
    await waitUntil(() => !!questionInput);
    assert.deepEqual(questionInput?.context, originalPublicSnapshot);
    assert.equal(
      (await h.call(`/company-runs/${run.id}/assessment`, { refresh: true })).status,
      202
    );
    await h.app.waitForIdle();
    const refreshed = await h.getRun(run.id);
    assert.equal(refreshed.assessmentStatus, 'ready');
    assert.notEqual(
      stored.context,
      originalContext,
      'publication replaces the public snapshot boundary'
    );
    assert.equal(refreshed.context?.fetchedAt, first.context?.fetchedAt);
    assert.equal(originalContext.news.length, 0);
    assert.equal(originalContext.discussions, undefined);
    assert.equal(originalContext.sources.length, 0);
    assert.deepEqual(originalContext, originalPublicSnapshot);
    assert.equal(refreshed.context?.news.length, 1);
    assert.equal(refreshed.context?.sources[0]?.id, 'question-race-new-source');
    assert.deepEqual(refreshed.context?.discussions, supplements(2).discussions);
    assert.deepEqual(refreshed.context?.financials, first.context?.financials);
    assert.equal(refreshed.assessment?.year, first.assessment?.year);
    assert.equal(refreshed.assessment?.grade, first.assessment?.grade);
    assert.equal(refreshed.assessment?.score, first.assessment?.score);
    releaseQuestion.resolve();
    const rejected = await pendingQuestion;
    assert.equal(rejected.status, 409);
    assert.equal((await rejected.json()).code, 'CONTEXT_STALE');
    const completed = await h.getRun(run.id);
    assert.deepEqual(completed.questions || [], []);
    const durable = JSON.parse(await readFile(path.join(store.dataDir, 'workspace.json'), 'utf8'));
    assert.deepEqual(durable.companyRuns[0].questions || [], []);
    assert.deepEqual(durable.companyRuns[0].context.discussions, refreshed.context?.discussions);
    assert.deepEqual(durable.companyRuns[0].context.news, refreshed.context?.news);
    assert.deepEqual(durable.companyRuns[0].context.financials, first.context?.financials);
    assert.equal(durable.companyRuns[0].assessment.grade, first.assessment?.grade);
  } finally {
    releaseQuestion.resolve();
    await pendingQuestion?.catch(() => undefined);
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
    await h.loadContextAndStartAssessment(run.id);
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
    context: async (_identity, options) => {
      const value = { ...snapshot(), ...supplements(1, 0) };
      await options?.onSnapshot?.(structuredClone(value));
      return value;
    },
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
        Object.assign(working.context!, supplements(researchCalls));
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
    await h.loadContextAndStartAssessment(run.id);
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
    assert.deepEqual(beforeFailure.companyRuns[0].context.discussions, first.context?.discussions);
    assert.deepEqual(
      beforeFailure.companyRuns[0].context.publicSignals,
      first.context?.publicSignals
    );
    assert.deepEqual(beforeFailure.companyRuns[0].context.market, first.context?.market);
    releaseSave.resolve();
    await h.app.waitForIdle();
    const failed = await h.getRun(run.id);
    assert.equal(failed.assessmentStatus, 'failed');
    assert.ok(failed.assessmentError);
    assert.deepEqual(failed.assessment, first.assessment);
    assert.equal(failed.assessmentInputHash, first.assessmentInputHash);
    assert.deepEqual(failed.context, first.context);
    assert.deepEqual(failed.context?.discussions, supplements(1, 0).discussions);
    assert.deepEqual(failed.context?.publicSignals, supplements(1, 0).publicSignals);
    assert.deepEqual(failed.context?.market, supplements(1, 0).market);
    assert.deepEqual(failed.industry, first.industry);
    const saved = JSON.parse(await readFile(path.join(store.dataDir, 'workspace.json'), 'utf8'));
    assert.equal(saved.companyRuns[0].assessmentStatus, 'failed');
    assert.deepEqual(saved.companyRuns[0].assessment, first.assessment);
    assert.deepEqual(saved.companyRuns[0].context, first.context);
    assert.deepEqual(saved.companyRuns[0].context.discussions, first.context?.discussions);
    assert.deepEqual(saved.companyRuns[0].context.publicSignals, first.context?.publicSignals);
    assert.deepEqual(saved.companyRuns[0].context.market, first.context?.market);
    assert.deepEqual(saved.companyRuns[0].industry, first.industry);
    restorePersist();
    assert.equal((await h.call(`/company-runs/${run.id}/assessment`, {})).status, 202);
    await h.app.waitForIdle();
    const recovered = await h.getRun(run.id);
    assert.equal(recovered.assessmentStatus, 'ready');
    assert.equal(recovered.context?.news.length, 1);
    assert.equal(recovered.context?.sources.length, 1);
    assert.equal(recovered.context?.announcements.length, 1);
    assert.deepEqual(recovered.context?.discussions, supplements(3).discussions);
    assert.deepEqual(recovered.context?.publicSignals, supplements(3).publicSignals);
    assert.deepEqual(recovered.context?.market, supplements(3).market);
    const durableRecovery = JSON.parse(
      await readFile(path.join(store.dataDir, 'workspace.json'), 'utf8')
    );
    assert.deepEqual(
      durableRecovery.companyRuns[0].context.discussions,
      recovered.context?.discussions
    );
    assert.deepEqual(
      durableRecovery.companyRuns[0].context.publicSignals,
      recovered.context?.publicSignals
    );
    assert.deepEqual(durableRecovery.companyRuns[0].context.market, recovered.context?.market);
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
    await h.loadContextAndStartAssessment(run.id);
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
    assert.equal(industryCalls, 2, 'explicit assessment refresh also rereads public peers');
    modelGate.resolve();
    await h.app.waitForIdle();
    gateIndustry = true;
    pendingIndustry = h.call(`/company-runs/${run.id}/industry`, {
      period: '2025-12-31',
      refresh: true,
    });
    await waitUntil(() => industryCalls === 3);
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
    assert.equal(industryCalls, 4);
    assert.equal((await h.getRun(run.id)).assessmentStatus, 'ready');
  } finally {
    modelGate.resolve();
    industryGate.resolve();
    await pendingIndustry;
    await h.dispose();
  }
});
