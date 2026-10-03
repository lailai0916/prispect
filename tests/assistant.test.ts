import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { AuthSession, CompanyIdentity, CompanyResearchRun } from '../shared/contracts.js';
import type { AssistantAnswer, AssistantRequest } from '../shared/assistant.js';
import { contextAmountFields, type CompanyContextSnapshot } from '../shared/company-workspace.js';
import { deriveCompanyAssessment } from '../shared/company-assessment.js';
import { createApp } from '../server/app.js';
import type { AssistantService } from '../server/assistant.js';
import type { ModelConfig } from '../server/model.js';
import type { CompanyContextService } from '../server/company-context-routes.js';
import { answerCompanyQuestion } from '../server/company-questions.js';
import { seeds } from '../server/store.js';

const moutai: CompanyIdentity = {
  securityCode: '600519',
  orgId: 'gssh0600519',
  shortName: '贵州茅台',
  companyName: '贵州茅台酒股份有限公司',
  exchange: 'sse',
  sourceUrl: 'https://www.cninfo.com.cn/',
};
const gree: CompanyIdentity = {
  securityCode: '000651',
  orgId: 'gssz0000651',
  shortName: '格力电器',
  companyName: '珠海格力电器股份有限公司',
  exchange: 'szse',
  sourceUrl: 'https://www.cninfo.com.cn/',
};

function context(identity: CompanyIdentity, year: number): CompanyContextSnapshot {
  const row = (annualYear: number, previous: boolean) => {
    const fields: Partial<Record<(typeof contextAmountFields)[number], string>> = {
      revenue: previous ? '900.00' : '1000.00',
      netProfit: previous ? '80.00' : '100.00',
      parentProfit: previous ? '70.00' : '90.00',
      ocf: previous ? '100.00' : '70.00',
      cash: '500.00',
      shortLoan: '100.00',
      currentPortionDebt: '100.00',
      receivables: previous ? '50.00' : '60.00',
      inventory: previous ? '40.00' : '50.00',
      totalAssets: '2000.00',
      totalLiabilities: '500.00',
    };
    return {
      period: `${annualYear}-12-31`,
      annual: true,
      noticeDate: null,
      amounts: Object.fromEntries(
        contextAmountFields.map((field) => [field, fields[field] ?? null])
      ) as CompanyContextSnapshot['financials'][number]['amounts'],
      ratios: { grossMargin: null, roe: null, revenueGrowth: null },
      auditOpinion: null,
      fieldSources: Object.fromEntries(
        Object.keys(fields).map((field) => [field, 'fixture-public'])
      ),
      sourceUrls: ['https://www.cninfo.com.cn/'],
      originalUrl: null,
    };
  };
  return {
    version: 1,
    securityCode: identity.securityCode,
    orgId: identity.orgId,
    companyName: identity.companyName || identity.shortName,
    fetchedAt: new Date().toISOString(),
    status: 'partial',
    financials: [row(year, false), row(year - 1, true)],
    sources: [],
    comparisons: [],
    profile: {},
    shareholders: [],
    announcements: [],
    news: [],
    verificationLinks: [],
    warnings: [],
  };
}
function company(identity = moutai, year = 2025): CompanyResearchRun {
  const now = new Date().toISOString();
  const run: CompanyResearchRun = {
    id: randomUUID(),
    input: {
      securityCode: identity.securityCode,
      orgId: identity.orgId,
      year,
      purpose: 'external',
      useModel: true,
    },
    identity: structuredClone(identity),
    status: 'ready',
    createdAt: now,
    updatedAt: now,
    trace: [],
    announcements: [],
    model: { requested: true, status: 'completed' },
    context: context(identity, year),
    contextStatus: 'ready',
    contextRevision: 1,
    assessmentStatus: 'ready',
    assessmentRevision: 1,
    assessmentInputHash: 'saved-analysis-cache',
  };
  run.assessment = deriveCompanyAssessment(run);
  return run;
}
function companyAnswer(run: CompanyResearchRun, question: string) {
  return {
    question,
    text: `${run.identity!.shortName} · ${run.input.year} · fixture public answer`,
    citations: [{ label: 'Public fixture', url: 'https://www.cninfo.com.cn/' }],
    mode: 'model' as const,
    createdAt: new Date().toISOString(),
    snapshotFetchedAt: run.context!.fetchedAt,
  };
}
function documentationAnswer(question: string): AssistantAnswer {
  return {
    question,
    text: 'Fixture answer from the actual documentation workflow.',
    citations: [{ label: '隐私政策', url: '/docs/privacy#ai' }],
    kind: 'documentation',
    mode: 'rules',
    createdAt: new Date().toISOString(),
    snapshotFetchedAt: '',
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
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'Expected assistant activity did not occur.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function harness(
  service: AssistantService = {},
  model: ModelConfig = {},
  companyContextService?: Pick<CompanyContextService, 'question'>
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-assistant-'));
  const inputs: {
    run: CompanyResearchRun;
    question: string;
    basis: string;
    useModel: boolean;
    signal?: AbortSignal;
  }[] = [];
  const app = await createApp({
    dataDir: directory,
    companyDirectory: null,
    model,
    ...(companyContextService
      ? {
          companyContextService: {
            ...companyContextService,
            searchCompanies: async () => {
              throw Error('Unexpected company search');
            },
            context: async () => context(moutai, 2025),
            industry: async () => {
              throw Error('Unexpected industry request');
            },
          },
        }
      : {}),
    assistantService: {
      wantsResearch: () => false,
      question: async (run, question, basis, useModel, _model, signal) => {
        inputs.push({ run: structuredClone(run), question, basis, useModel, signal });
        return companyAnswer(run, question);
      },
      research: async (run) => ({
        run: structuredClone(run),
        research: { status: 'completed', toolCalls: 0, sources: [] },
      }),
      ...service,
    },
  });
  const server = app.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const register = async (email = 'assistant-owner@example.test') => {
    const response = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        name: 'Assistant owner',
        password: 'assistant-owner-test-pass',
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
  const message = (
    body: AssistantRequest,
    headers: Record<string, string> = { 'Content-Type': 'application/json' },
    signal?: AbortSignal
  ) =>
    fetch(`${base}/api/assistant/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  const save = async (ownerId: string, runs: CompanyResearchRun[]) => {
    const store = await app.workspaceForUser(ownerId);
    store.state.companyRuns = runs;
    await store.persist();
    return store;
  };
  const dispose = async () => {
    await app.waitForIdle();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    app.auth.close();
    await rm(directory, { recursive: true, force: true });
  };
  return { app, directory, base, inputs, register, message, save, dispose };
}

test('anonymous privacy, operator and responsibility questions use real documentation without a model or workspace', async () => {
  let modelCalls = 0;
  const h = await harness(
    {},
    {
      apiKey: 'anonymous-documentation-must-not-send-this',
      fetch: async () => {
        modelCalls++;
        throw Error('Unexpected provider call');
      },
    }
  );
  try {
    const privacyResponse = await h.message({
      question: '隐私政策怎样处理 AI 对外发送？外部服务是否保存或训练，哪些私人数据不发送？',
      locale: 'zh',
    });
    assert.equal(privacyResponse.status, 200);
    const privacy = (await privacyResponse.json()) as AssistantAnswer;
    assert.equal(privacy.kind, 'documentation');
    assert.equal(privacy.mode, 'rules');
    assert.match(privacy.text, /TokenFlux|外部模型|外部接口/);
    assert.match(privacy.text, /尚未|不承诺|不保证/);
    assert.match(privacy.text, /私人|私有|账号/);
    assert.ok(privacy.citations.some((item) => item.url.includes('/docs/privacy')));
    const operatorResponse = await h.message({
      question: '析光是谁运营的？网站由谁负责？',
      locale: 'zh',
    });
    assert.equal(operatorResponse.status, 200);
    const operator = (await operatorResponse.json()) as AssistantAnswer;
    assert.equal(operator.kind, 'documentation');
    assert.match(operator.text, /析光团队/);
    assert.doesNotMatch(operator.text, /析光(?:科技)?有限公司|Prispect (?:Inc\.|Ltd\.)/);
    const responsibilityResponse = await h.message({
      question: '析光是否承担依法不能免除的责任？服务出错会排除我的法定权利吗？',
      locale: 'zh',
    });
    assert.equal(responsibilityResponse.status, 200);
    const responsibility = (await responsibilityResponse.json()) as AssistantAnswer;
    assert.equal(responsibility.kind, 'documentation');
    assert.match(responsibility.text, /依法|法定|责任/);
    assert.ok(responsibility.citations.some((item) => item.url.includes('/docs/terms')));
    assert.equal(modelCalls, 0);
    assert.equal(h.inputs.length, 0);
    assert.deepEqual(await readdir(path.join(h.directory, 'users')).catch(() => []), []);
  } finally {
    await h.dispose();
  }
});

test('signed-in documentation validates CSRF without initializing a private workspace', async () => {
  const calls: { question: string; locale: string; useModel: boolean }[] = [];
  const h = await harness({
    documentation: async (question, locale, useModel) => {
      calls.push({ question, locale, useModel });
      return documentationAnswer(question);
    },
  });
  try {
    const owner = await h.register();
    const workspace = path.join(h.directory, 'users', owner.userId, 'workspace.json');
    await assert.rejects(access(workspace), { code: 'ENOENT' });
    const bad = await h.message(
      { question: 'How does privacy work?', locale: 'en' },
      {
        ...owner.headers,
        'X-CSRF-Token': '',
      }
    );
    assert.equal(bad.status, 403);
    assert.equal(calls.length, 0);
    const response = await h.message(
      {
        question: 'How does privacy work?',
        locale: 'en',
        currentRunId: randomUUID(),
      },
      owner.headers
    );
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as AssistantAnswer).kind, 'documentation');
    assert.deepEqual(calls, [{ question: 'How does privacy work?', locale: 'en', useModel: true }]);
    await assert.rejects(access(workspace), { code: 'ENOENT' });
  } finally {
    await h.dispose();
  }
});

test('saved company questions automatically resolve names, annual scope and conversational context', async () => {
  const h = await harness();
  try {
    const owner = await h.register();
    const latest = company(moutai, 2025),
      old = company(moutai, 2024),
      other = company(gree, 2025);
    old.updatedAt = new Date(Date.now() - 86400000).toISOString();
    other.updatedAt = new Date(Date.now() - 172800000).toISOString();
    await h.save(owner.userId, [latest, old, other]);
    const cases: { request: AssistantRequest; expected: CompanyResearchRun }[] = [
      { request: { question: '经营现金质量怎么样？', locale: 'zh' }, expected: latest },
      {
        request: { question: '贵州茅台的现金质量怎么样？', locale: 'zh', currentRunId: other.id },
        expected: latest,
      },
      {
        request: { question: '600519 的利润如何？', locale: 'zh', currentRunId: other.id },
        expected: latest,
      },
      { request: { question: '贵州茅台 2024 年的利润如何？', locale: 'zh' }, expected: old },
      {
        request: { question: '贵州茅台的现金质量怎么样？', locale: 'zh', currentRunId: old.id },
        expected: old,
      },
      {
        request: { question: '贵州茅台的现金质量怎么样？', locale: 'zh', previousRunId: old.id },
        expected: old,
      },
      {
        request: { question: '贵州茅台 2025 年的利润如何？', locale: 'zh', currentRunId: old.id },
        expected: latest,
      },
      {
        request: {
          question: '贵州茅台 2024 年的利润如何？',
          locale: 'zh',
          currentRunId: latest.id,
        },
        expected: old,
      },
      {
        request: {
          question: '经营现金如何？',
          locale: 'zh',
          currentRunId: other.id,
          previousRunId: latest.id,
        },
        expected: other,
      },
      {
        request: { question: '它的应收与存货呢？', locale: 'zh', previousRunId: old.id },
        expected: old,
      },
      {
        request: { question: '格力电器的现金如何？', locale: 'zh', previousRunId: latest.id },
        expected: other,
      },
      {
        request: {
          question: '归母利润怎么样？',
          locale: 'zh',
          currentRunId: latest.id,
          basis: 'parent',
        },
        expected: latest,
      },
      {
        request: { question: '茅台现金质量如何？', locale: 'zh', currentRunId: other.id },
        expected: latest,
      },
      {
        request: {
          question: '那贵州茅台营收呢？',
          locale: 'zh',
          currentRunId: other.id,
          previousQuestions: ['隐私政策如何处理数据？'],
        },
        expected: latest,
      },
    ];
    for (const { request, expected } of cases) {
      const response = await h.message(request, owner.headers);
      assert.equal(response.status, 200, request.question);
      const answer = (await response.json()) as AssistantAnswer & { cached?: boolean };
      assert.equal(answer.kind, 'company', request.question);
      assert.equal(answer.company?.runId, expected.id, request.question);
      assert.equal(answer.company?.year, expected.input.year, request.question);
      if (!answer.cached) {
        assert.equal(h.inputs.at(-1)?.run.id, expected.id, request.question);
        assert.equal(h.inputs.at(-1)?.useModel, true);
        assert.equal(h.inputs.at(-1)?.basis, request.basis || 'consolidated');
      }
    }
  } finally {
    await h.dispose();
  }
});

test('a newer unfinished same-company record cannot replace the named company on the current page', async () => {
  const h = await harness();
  try {
    const owner = await h.register();
    const current = company(moutai, 2024);
    current.updatedAt = new Date(Date.now() - 86400000).toISOString();
    const unfinished = company(moutai, 2025);
    unfinished.context = undefined;
    unfinished.contextStatus = 'loading';
    unfinished.assessment = undefined;
    unfinished.assessmentStatus = 'loading';
    unfinished.status = 'running';
    await h.save(owner.userId, [unfinished, current]);
    const response = await h.message(
      { question: '贵州茅台的利润与经营现金有什么差异？', locale: 'zh', currentRunId: current.id },
      owner.headers
    );
    assert.equal(response.status, 200);
    const answer = (await response.json()) as AssistantAnswer;
    assert.equal(answer.company?.runId, current.id);
    assert.equal(answer.company?.year, 2024);
    assert.equal(h.inputs.at(-1)?.run.id, current.id);
  } finally {
    await h.dispose();
  }
});

test('multiple named companies and unavailable years request clarification while anonymous questions stay in documentation', async () => {
  const h = await harness();
  try {
    const owner = await h.register();
    const latest = company(moutai),
      other = company(gree);
    await h.save(owner.userId, [latest, other]);
    for (const question of [
      '贵州茅台和格力电器哪家的现金更好？',
      '贵州茅台 2020 年的现金质量怎么样？',
    ]) {
      const response = await h.message(
        { question, locale: 'zh', currentRunId: latest.id },
        owner.headers
      );
      assert.equal(response.status, 200);
      const answer = (await response.json()) as AssistantAnswer;
      assert.equal(answer.kind, 'clarification');
      assert.equal(answer.company, undefined);
      assert.equal(answer.mode, 'rules');
    }
    const anonymous = await h.message({ question: '贵州茅台现金质量如何？', locale: 'zh' });
    assert.equal(anonymous.status, 200);
    const answer = (await anonymous.json()) as AssistantAnswer;
    assert.equal(answer.kind, 'documentation');
    assert.equal(answer.company, undefined);
    assert.equal(answer.mode, 'rules');
    assert.equal(h.inputs.length, 0);
  } finally {
    await h.dispose();
  }
});

test('company requests enforce CSRF and reject foreign record references without leaking their data', async () => {
  const h = await harness();
  try {
    const owner = await h.register();
    const other = await h.register('assistant-other@example.test');
    const owned = company(moutai),
      foreign = company(gree);
    await h.save(owner.userId, [owned]);
    await h.save(other.userId, [foreign]);
    const noCsrf = await h.message(
      { question: '贵州茅台现金如何？', locale: 'zh' },
      {
        ...owner.headers,
        'X-CSRF-Token': '',
      }
    );
    assert.equal(noCsrf.status, 403);
    for (const key of ['currentRunId', 'previousRunId'] as const) {
      const response = await h.message(
        {
          question: '贵州茅台现金如何？',
          locale: 'zh',
          [key]: foreign.id,
        },
        owner.headers
      );
      assert.equal(response.status, 404);
      const text = await response.text();
      assert.equal(text.includes(foreign.identity!.companyName!), false);
      assert.equal(text.includes(foreign.identity!.securityCode), false);
    }
    assert.equal(h.inputs.length, 0);
    const response = await h.message({ question: '经营现金如何？', locale: 'zh' }, other.headers);
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as AssistantAnswer).company?.runId, foreign.id);
    const ownerStore = await h.app.workspaceForUser(owner.userId);
    assert.equal(ownerStore.state.companyRuns![0]!.questions?.length || 0, 0);
  } finally {
    await h.dispose();
  }
});

test('actual company model requests use only public evidence and never transmit saved account fields', async () => {
  const bodies: string[] = [];
  const secrets = [
    'private-material-title',
    'private-review-note',
    'private-saved-answer',
    'account-only-secret',
  ];
  const h = await harness(
    { question: answerCompanyQuestion },
    {
      apiKey: 'assistant-fixture-api-secret',
      baseUrl: 'https://model-fixture.invalid/v1',
      fetch: async (_url, init) => {
        const text = String(init?.body);
        bodies.push(text);
        const body = JSON.parse(text);
        const payload = JSON.parse(
          body.messages.find((item: { role: string }) => item.role === 'user').content
        );
        assert.deepEqual(payload.previousQuestions, ['贵州茅台利润如何？']);
        const metric = payload.publicContext.screen.metrics.find(
          (item: { status: string }) => item.status === 'available'
        );
        const citation = payload.citations[0];
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    text: '现有公开资料支持有保留的判断，仍需核对现金与盈利的联系。',
                    citations: citation ? [citation.id] : [],
                    metricIds: metric ? [metric.id] : [],
                  }),
                },
              },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      },
    }
  );
  try {
    const owner = await h.register();
    const run = company();
    Object.assign(run, {
      adoptedMaterialId: secrets[0],
      privateSecret: secrets[3],
      questions: [
        {
          question: 'Private saved question',
          text: secrets[2],
          citations: [],
          mode: 'rules',
          createdAt: new Date().toISOString(),
          snapshotFetchedAt: run.context!.fetchedAt,
        },
      ],
    });
    const store = await h.save(owner.userId, [run]);
    const sample = (await seeds(process.cwd())).materials[0]!;
    store.state.materials.push({ ...structuredClone(sample), title: secrets[0]! });
    Object.assign(store.state, { privateNote: secrets[1] });
    await store.persist();
    const response = await h.message(
      {
        question: '贵州茅台的经营现金质量如何？',
        locale: 'zh',
        previousQuestions: ['贵州茅台利润如何？'],
      },
      owner.headers
    );
    assert.equal(response.status, 200);
    const answer = (await response.json()) as AssistantAnswer;
    assert.equal(answer.kind, 'company');
    assert.equal(answer.mode, 'model');
    assert.equal(bodies.length, 1);
    for (const secret of [
      ...secrets,
      owner.userId,
      owner.headers['X-CSRF-Token'],
      'assistant-owner@example.test',
      'assistant-fixture-api-secret',
    ])
      assert.equal(bodies[0]!.includes(secret), false, secret);
    assert.equal(store.state.materials[0]!.title, secrets[0]);
    assert.equal(run.questions?.[0]?.text, secrets[2]);
  } finally {
    await h.dispose();
  }
});

test('temporary public follow-up informs the answer without changing saved financials or the grade', async () => {
  let researched = false;
  const h = await harness({
    wantsResearch: () => true,
    research: async (run) => {
      researched = true;
      const working = structuredClone(run);
      working.context!.financials[0]!.amounts.ocf = '1.00';
      working.context!.news.push({
        title: 'New public source',
        date: '2026-01-02',
        media: 'Fixture media',
        url: 'https://www.cninfo.com.cn/',
        provider: 'fixture',
        digest: 'Source is a research lead.',
      });
      return {
        run: working,
        research: {
          status: 'completed',
          toolCalls: 1,
          sources: [{ label: 'New public source', url: 'https://www.cninfo.com.cn/' }],
        },
      };
    },
  });
  try {
    const owner = await h.register();
    const run = company();
    const originalContext = structuredClone(run.context);
    const originalAssessment = structuredClone(run.assessment);
    const store = await h.save(owner.userId, [run]);
    const response = await h.message(
      { question: '贵州茅台最新公开资料有什么？', locale: 'zh' },
      owner.headers
    );
    assert.equal(response.status, 200);
    const answer = (await response.json()) as AssistantAnswer;
    assert.equal(researched, true);
    assert.equal(answer.research?.toolCalls, 1);
    assert.equal(answer.research?.status, 'completed');
    assert.equal(h.inputs[0]?.run.context?.financials[0]?.amounts.ocf, '1.00');
    assert.equal(h.inputs[0]?.run.context?.news.length, 1);
    assert.deepEqual(store.state.companyRuns![0]!.context, originalContext);
    assert.deepEqual(store.state.companyRuns![0]!.assessment, originalAssessment);
    assert.equal(store.state.companyRuns![0]!.questions?.length, 1);
  } finally {
    await h.dispose();
  }
});

test('public follow-up and model failures preserve sourced rule answers without exposing provider errors', async () => {
  const h = await harness(
    {
      question: answerCompanyQuestion,
      wantsResearch: () => true,
      research: async () => {
        throw Error('private-provider-key-and-debug-body');
      },
    },
    {
      apiKey: 'test-failure-key',
      fetch: async () => new Response('private-provider-body', { status: 503 }),
    }
  );
  try {
    const owner = await h.register();
    const run = company();
    const before = structuredClone(run.context);
    const store = await h.save(owner.userId, [run]);
    const response = await h.message(
      { question: '贵州茅台最新现金信息是什么？', locale: 'zh' },
      owner.headers
    );
    assert.equal(response.status, 200);
    const answer = (await response.json()) as AssistantAnswer;
    assert.equal(answer.kind, 'company');
    assert.equal(answer.mode, 'rules-fallback');
    assert.equal(answer.research?.status, 'unavailable');
    assert.equal(answer.research?.toolCalls, 0);
    assert.ok(answer.warning);
    assert.ok(answer.text);
    const serialized = JSON.stringify(answer);
    assert.equal(serialized.includes('private-provider'), false);
    assert.equal(serialized.includes('test-failure-key'), false);
    assert.deepEqual(store.state.companyRuns![0]!.context, before);
  } finally {
    await h.dispose();
  }
});

test('deleted or changed public snapshots cannot receive an in-flight assistant answer', async () => {
  for (const mutation of ['replace', 'change-field', 'delete'] as const) {
    const gate = deferred();
    let started = false;
    const h = await harness({
      question: async (run, question) => {
        started = true;
        await gate.promise;
        return companyAnswer(run, question);
      },
    });
    let pending: Promise<Response> | undefined;
    try {
      const owner = await h.register();
      const run = company();
      const store = await h.save(owner.userId, [run]);
      pending = h.message({ question: '贵州茅台现金如何？', locale: 'zh' }, owner.headers);
      await waitUntil(() => started);
      if (mutation === 'delete') store.state.companyRuns = [];
      else if (mutation === 'replace')
        run.context = {
          ...structuredClone(run.context!),
          fetchedAt: new Date(Date.now() + 1000).toISOString(),
        };
      else run.context!.financials[0]!.amounts.ocf = '123.00';
      await store.persist();
      gate.resolve();
      const response = await pending;
      assert.equal(response.status, mutation === 'delete' ? 404 : 409, mutation);
      assert.equal(
        (await response.json()).code,
        mutation === 'delete' ? 'COMPANY_RUN_NOT_FOUND' : 'CONTEXT_STALE'
      );
      assert.equal(store.state.companyRuns?.[0]?.questions?.length || 0, 0);
    } finally {
      gate.resolve();
      await pending;
      await h.dispose();
    }
  }
});

test('disconnect during answer generation reaches the company service and saves no unfinished answer', async () => {
  let started = false;
  let receivedSignal: AbortSignal | undefined;
  const h = await harness({
    question: async (run, question, _basis, _useModel, _model, signal) => {
      receivedSignal = signal;
      started = true;
      assert.ok(signal);
      if (!signal.aborted)
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true })
        );
      signal.throwIfAborted();
      return companyAnswer(run, question);
    },
  });
  const controller = new AbortController();
  let pending: Promise<Response> | undefined;
  try {
    const owner = await h.register();
    const run = company();
    const store = await h.save(owner.userId, [run]);
    pending = h.message(
      { question: '贵州茅台现金如何？', locale: 'zh' },
      owner.headers,
      controller.signal
    );
    await waitUntil(() => started);
    controller.abort();
    await assert.rejects(pending, (error: Error) => error.name === 'AbortError');
    await waitUntil(() => receivedSignal?.aborted === true);
    assert.equal(store.state.companyRuns![0]!.questions?.length || 0, 0);
  } finally {
    controller.abort();
    await pending?.catch(() => undefined);
    await h.dispose();
  }
});

test('signed-in policy models receive real knowledge records and invalid citations retain published statements', async () => {
  const bodies: string[] = [];
  let validCitation = false;
  const h = await harness(
    {},
    {
      apiKey: 'policy-model-fixture-key',
      fetch: async (_url, init) => {
        const body = String(init?.body);
        bodies.push(body);
        const request = JSON.parse(body);
        const user = JSON.parse(
          request.messages.find((item: { role: string }) => item.role === 'user').content
        );
        const policy = user.documents.find(
          (item: { url: string }) => item.url === '/docs/privacy#ai'
        );
        assert.ok(policy);
        assert.match(policy.text, /TokenFlux/);
        assert.match(policy.text, /不承诺|尚未完成/);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    text: '外部服务的保存与训练用途尚未完成核验，不能承诺不保存或不训练。',
                    citations: [validCitation ? policy.id : 'invented-policy-section'],
                  }),
                },
              },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      },
    }
  );
  try {
    const owner = await h.register();
    const workspace = path.join(h.directory, 'users', owner.userId, 'workspace.json');
    const question = '隐私政策中的 AI 对外发送涉及哪些模型处理和训练用途？';
    const fallbackResponse = await h.message({ question, locale: 'zh' }, owner.headers);
    assert.equal(fallbackResponse.status, 200);
    const fallback = (await fallbackResponse.json()) as AssistantAnswer;
    assert.equal(fallback.kind, 'documentation');
    assert.equal(fallback.mode, 'rules-fallback');
    assert.match(fallback.text, /TokenFlux/);
    assert.match(fallback.text, /不承诺|尚未完成/);
    assert.ok(fallback.warning);
    validCitation = true;
    const response = await h.message({ question, locale: 'zh' }, owner.headers);
    assert.equal(response.status, 200);
    const answer = (await response.json()) as AssistantAnswer;
    assert.equal(answer.kind, 'documentation');
    assert.equal(answer.mode, 'model');
    assert.equal(answer.citations[0]?.url, '/docs/privacy#ai');
    assert.equal(bodies.length, 2);
    for (const body of bodies) {
      assert.equal(body.includes(owner.userId), false);
      assert.equal(body.includes(owner.headers['X-CSRF-Token']), false);
      assert.equal(body.includes('assistant-owner@example.test'), false);
      assert.equal(body.includes('policy-model-fixture-key'), false);
    }
    await assert.rejects(access(workspace), { code: 'ENOENT' });
  } finally {
    await h.dispose();
  }
});

test('product operator and legal responsibility questions override a selected company for signed-in owners', async () => {
  const h = await harness();
  try {
    const owner = await h.register();
    const run = company();
    const before = structuredClone(run.assessment);
    const store = await h.save(owner.userId, [run]);
    const operatorResponse = await h.message(
      {
        question: '析光由谁运营？',
        locale: 'zh',
        currentRunId: run.id,
      },
      owner.headers
    );
    assert.equal(operatorResponse.status, 200);
    const operator = (await operatorResponse.json()) as AssistantAnswer;
    assert.equal(operator.kind, 'documentation');
    assert.match(operator.text, /析光团队/);
    const liabilityResponse = await h.message(
      {
        question: '析光是否承担依法不能免除的责任？服务出错会排除我的法定权利吗？',
        locale: 'zh',
        currentRunId: run.id,
      },
      owner.headers
    );
    assert.equal(liabilityResponse.status, 200);
    const liability = (await liabilityResponse.json()) as AssistantAnswer;
    assert.equal(liability.kind, 'documentation');
    assert.match(liability.text, /不免除析光依法应承担的责任/);
    assert.ok(liability.citations.some((item) => item.url === '/docs/terms#responsibility'));
    assert.equal(h.inputs.length, 0);
    assert.deepEqual(store.state.companyRuns![0]!.assessment, before);
    assert.equal(store.state.companyRuns![0]!.questions?.length || 0, 0);
  } finally {
    await h.dispose();
  }
});

test('repeated owning-company answers reuse a completed result without model calls or duplicated history', async () => {
  const h = await harness();
  try {
    const owner = await h.register();
    const run = company();
    const store = await h.save(owner.userId, [run]);
    const request = { question: '现金质量如何？', locale: 'zh', currentRunId: run.id } as const;
    const firstResponse = await h.message(request, owner.headers);
    assert.equal(firstResponse.status, 200);
    const first = (await firstResponse.json()) as AssistantAnswer;
    const repeatResponse = await h.message(request, owner.headers);
    assert.equal(repeatResponse.status, 200);
    const repeat = (await repeatResponse.json()) as AssistantAnswer & { cached?: boolean };
    assert.equal(repeat.cached, true);
    assert.equal(repeat.createdAt, first.createdAt);
    assert.equal(repeat.snapshotFetchedAt, first.snapshotFetchedAt);
    assert.equal(repeat.text, first.text);
    assert.equal(h.inputs.length, 1);
    assert.equal(store.state.companyRuns![0]!.questions?.length, 1);
    const refreshed = await h.message({ ...request, refresh: true }, owner.headers);
    assert.equal(refreshed.status, 200);
    const fresh = (await refreshed.json()) as AssistantAnswer & { cached?: boolean };
    assert.equal(fresh.cached, undefined);
    const afterRefresh = (await (
      await h.message(request, owner.headers)
    ).json()) as AssistantAnswer & {
      cached?: boolean;
    };
    assert.equal(afterRefresh.cached, true);
    assert.equal(afterRefresh.createdAt, fresh.createdAt);
    assert.equal(h.inputs.length, 2);
  } finally {
    await h.dispose();
  }
});

test('assistant answer cache excludes other owners, including identical imported research IDs', async () => {
  const h = await harness();
  try {
    const one = await h.register();
    const two = await h.register('cached-other@example.test');
    const run = company();
    await h.save(one.userId, [run]);
    await h.save(two.userId, [structuredClone(run)]);
    const request = { question: '现金质量如何？', locale: 'zh', currentRunId: run.id } as const;
    await (await h.message(request, one.headers)).json();
    const other = await h.message(request, two.headers);
    assert.equal(other.status, 200);
    assert.equal(((await other.json()) as { cached?: boolean }).cached, undefined);
    assert.equal(h.inputs.length, 2);
    const repeat = await h.message(request, one.headers);
    assert.equal(((await repeat.json()) as { cached?: boolean }).cached, true);
    assert.equal(h.inputs.length, 2);
  } finally {
    await h.dispose();
  }
});

test('changed public amounts, language, basis and conversation invalidate assistant reuse', async () => {
  const h = await harness();
  try {
    const owner = await h.register();
    const run = company();
    await h.save(owner.userId, [run]);
    const request = { question: '现金质量如何？', locale: 'zh', currentRunId: run.id } as const;
    await (await h.message(request, owner.headers)).json();
    run.context!.financials[0]!.amounts.ocf = '71.00';
    const changed = await h.message(request, owner.headers);
    assert.equal(((await changed.json()) as { cached?: boolean }).cached, undefined);
    for (const variant of [
      { ...request, locale: 'en' as const },
      { ...request, basis: 'parent' as const },
      { ...request, previousQuestions: ['利润为什么变化？'] },
    ]) {
      const response = await h.message(variant, owner.headers);
      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as { cached?: boolean }).cached, undefined);
    }
    assert.equal(h.inputs.length, 5);
  } finally {
    await h.dispose();
  }
});

test('deleting and reimporting a research record cannot revive its old assistant memo', async () => {
  const h = await harness();
  try {
    const owner = await h.register();
    const run = company();
    const store = await h.save(owner.userId, [run]);
    const request = { question: '现金质量如何？', locale: 'zh', currentRunId: run.id } as const;
    await (await h.message(request, owner.headers)).json();
    store.state.companyRuns = [];
    const deleted = await h.message(request, owner.headers);
    assert.equal(deleted.status, 404);
    await store.reset();
    store.state.companyRuns = [structuredClone(run)];
    const imported = await h.message(request, owner.headers);
    assert.equal(imported.status, 200);
    assert.equal(((await imported.json()) as { cached?: boolean }).cached, undefined);
    assert.equal(h.inputs.length, 2);
  } finally {
    await h.dispose();
  }
});

test('model failure fallback stays retryable and only the later successful answer is cached', async () => {
  let calls = 0;
  const h = await harness({
    question: async (run, question) => {
      calls++;
      return calls === 1
        ? { ...companyAnswer(run, question), mode: 'rules-fallback', warning: 'Provider failed' }
        : companyAnswer(run, question);
    },
  });
  try {
    const owner = await h.register();
    const run = company();
    await h.save(owner.userId, [run]);
    const request = { question: '现金质量如何？', locale: 'zh', currentRunId: run.id } as const;
    const failed = await h.message(request, owner.headers);
    assert.equal(((await failed.json()) as AssistantAnswer).mode, 'rules-fallback');
    const recovered = await h.message(request, owner.headers);
    assert.equal(((await recovered.json()) as AssistantAnswer).mode, 'model');
    const reused = await h.message(request, owner.headers);
    assert.equal(((await reused.json()) as { cached?: boolean }).cached, true);
    assert.equal(calls, 2);
  } finally {
    await h.dispose();
  }
});

test('failed persistence does not publish an assistant memo or leave an appended answer', async () => {
  const h = await harness();
  try {
    const owner = await h.register();
    const run = company();
    const store = await h.save(owner.userId, [run]);
    const persist = store.persist.bind(store);
    store.persist = async () => {
      throw Error('Injected storage failure');
    };
    const request = { question: '现金质量如何？', locale: 'zh', currentRunId: run.id } as const;
    assert.equal((await h.message(request, owner.headers)).status, 500);
    assert.equal(run.questions, undefined);
    store.persist = persist;
    const recovered = await h.message(request, owner.headers);
    assert.equal(recovered.status, 200);
    assert.equal(((await recovered.json()) as { cached?: boolean }).cached, undefined);
    assert.equal(h.inputs.length, 2);
  } finally {
    await h.dispose();
  }
});

test('explicit repeated public follow-up performs fresh research rather than answer reuse', async () => {
  let researchCalls = 0;
  const h = await harness({
    wantsResearch: () => true,
    research: async (run, _question, options) => {
      researchCalls++;
      assert.equal(options?.bypassCache, true);
      return {
        run: structuredClone(run),
        research: { status: 'completed', toolCalls: 1, sources: [] },
      };
    },
  });
  try {
    const owner = await h.register();
    const run = company();
    await h.save(owner.userId, [run]);
    for (let index = 0; index < 2; index++) {
      const response = await h.message(
        { question: '查一下最新公告', locale: 'zh', currentRunId: run.id },
        owner.headers
      );
      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as { cached?: boolean }).cached, undefined);
    }
    assert.equal(researchCalls, 2);
    assert.equal(h.inputs.length, 2);
  } finally {
    await h.dispose();
  }
});

test('signed-in documentation repeats are owner-scoped and require no private workspace', async () => {
  let calls = 0;
  const h = await harness({
    documentation: async (question) => {
      calls++;
      return { ...documentationAnswer(question), mode: 'model' };
    },
  });
  try {
    const one = await h.register();
    const two = await h.register('docs-cache-other@example.test');
    const request = { question: '网站隐私政策如何处理数据？', locale: 'zh' } as const;
    await (await h.message(request, one.headers)).json();
    const repeat = await h.message(request, one.headers);
    assert.equal(((await repeat.json()) as { cached?: boolean }).cached, true);
    const other = await h.message(request, two.headers);
    assert.equal(((await other.json()) as { cached?: boolean }).cached, undefined);
    assert.equal(calls, 2);
    assert.deepEqual(await readdir(path.join(h.directory, 'users')).catch(() => []), []);
  } finally {
    await h.dispose();
  }
});

test('legacy company questions reuse only saved successful owning answers and preserve timestamps', async () => {
  let calls = 0;
  const h = await harness(
    {},
    {},
    {
      question: async (run, question) => {
        calls++;
        assert.equal(run.questions, undefined);
        assert.equal(Object.hasOwn(run, 'originals'), false);
        return companyAnswer(run, question);
      },
    }
  );
  try {
    const owner = await h.register();
    const run = company();
    const store = await h.save(owner.userId, [run]);
    const question = (refresh = false) =>
      fetch(`${h.base}/api/company-runs/${run.id}/questions`, {
        method: 'POST',
        headers: owner.headers,
        body: JSON.stringify({
          question: '现金质量如何？',
          basis: 'consolidated',
          useModel: true,
          refresh,
        }),
      });
    const first = (await (await question()).json()) as AssistantAnswer;
    const cached = (await (await question()).json()) as AssistantAnswer & { cached?: boolean };
    assert.equal(cached.cached, true);
    assert.equal(cached.createdAt, first.createdAt);
    assert.equal(cached.snapshotFetchedAt, first.snapshotFetchedAt);
    assert.equal(calls, 1);
    assert.equal(run.questions?.length, 1);
    const fresh = (await (await question(true)).json()) as AssistantAnswer;
    assert.equal(calls, 2);
    const afterRefresh = (await (await question()).json()) as AssistantAnswer & {
      cached?: boolean;
    };
    assert.equal(afterRefresh.cached, true);
    assert.equal(afterRefresh.createdAt, fresh.createdAt);
    assert.equal(calls, 2);
    run.context!.financials[0]!.amounts.ocf = '72.00';
    await (await question()).json();
    assert.equal(calls, 3);
    store.state.companyRuns = [];
    assert.equal((await question()).status, 404);
    await store.reset();
    store.state.companyRuns = [structuredClone(run)];
    const imported = await question();
    assert.equal(imported.status, 200);
    assert.equal(((await imported.json()) as { cached?: boolean }).cached, undefined);
    assert.equal(calls, 4);
  } finally {
    await h.dispose();
  }
});

test('legacy question cache keeps equal research IDs and answers isolated by account', async () => {
  let calls = 0;
  const h = await harness(
    {},
    {},
    {
      question: async (run, question) => {
        calls++;
        return companyAnswer(run, question);
      },
    }
  );
  try {
    const owner = await h.register();
    const other = await h.register('legacy-other@example.test');
    const run = company();
    await h.save(owner.userId, [run]);
    await h.save(other.userId, [structuredClone(run)]);
    const question = (headers: Record<string, string>) =>
      fetch(`${h.base}/api/company-runs/${run.id}/questions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ question: '现金质量如何？', basis: 'consolidated', useModel: true }),
      });
    await (await question(owner.headers)).json();
    const second = await question(other.headers);
    assert.equal(second.status, 200);
    assert.equal(((await second.json()) as { cached?: boolean }).cached, undefined);
    assert.equal(calls, 2);
    const repeat = await question(owner.headers);
    assert.equal(((await repeat.json()) as { cached?: boolean }).cached, true);
    assert.equal(calls, 2);
  } finally {
    await h.dispose();
  }
});

test('legacy question fallbacks retry providers and failed storage never publishes answer memo', async () => {
  let calls = 0;
  const h = await harness(
    {},
    {},
    {
      question: async (run, question) => {
        calls++;
        return calls === 1
          ? {
              ...companyAnswer(run, question),
              mode: 'rules-fallback',
              warning: 'Provider unavailable',
            }
          : companyAnswer(run, question);
      },
    }
  );
  try {
    const owner = await h.register();
    const run = company();
    const store = await h.save(owner.userId, [run]);
    const question = () =>
      fetch(`${h.base}/api/company-runs/${run.id}/questions`, {
        method: 'POST',
        headers: owner.headers,
        body: JSON.stringify({ question: '现金质量如何？', basis: 'consolidated', useModel: true }),
      });
    assert.equal(((await (await question()).json()) as AssistantAnswer).mode, 'rules-fallback');
    const previousAnswers = run.questions;
    const persist = store.persist.bind(store);
    store.persist = async () => {
      throw Error('Injected legacy storage failure');
    };
    assert.equal((await question()).status, 500);
    assert.equal(run.questions, previousAnswers);
    store.persist = persist;
    const recovered = await question();
    assert.equal(recovered.status, 200);
    assert.equal(((await recovered.json()) as { cached?: boolean }).cached, undefined);
    const cached = await question();
    assert.equal(((await cached.json()) as { cached?: boolean }).cached, true);
    assert.equal(calls, 3);
  } finally {
    await h.dispose();
  }
});

test('an older in-flight company answer cannot overwrite a later explicitly refreshed memo', async () => {
  const oldGate = deferred();
  let calls = 0;
  let oldStarted = false;
  const h = await harness({
    question: async (run, question) => {
      const call = ++calls;
      if (call === 1) {
        oldStarted = true;
        await oldGate.promise;
      }
      return { ...companyAnswer(run, question), text: `Validated public answer ${call}` };
    },
  });
  let old: Promise<Response> | undefined;
  try {
    const owner = await h.register();
    const run = company();
    await h.save(owner.userId, [run]);
    const request = { question: '现金质量如何？', locale: 'zh', currentRunId: run.id } as const;
    old = h.message(request, owner.headers);
    await waitUntil(() => oldStarted);
    const fresh = await h.message({ ...request, refresh: true }, owner.headers);
    assert.equal(fresh.status, 200);
    assert.equal(((await fresh.json()) as AssistantAnswer).text, 'Validated public answer 2');
    oldGate.resolve();
    assert.equal((await old).status, 200);
    const cached = await h.message(request, owner.headers);
    const answer = (await cached.json()) as AssistantAnswer & { cached?: boolean };
    assert.equal(answer.cached, true);
    assert.equal(answer.text, 'Validated public answer 2');
    assert.equal(calls, 2);
  } finally {
    oldGate.resolve();
    await old;
    await h.dispose();
  }
});

function reportCompany(): CompanyResearchRun {
  const run = company();
  run.context!.fetchedAt = '2026-10-03T05:00:00.000Z';
  const assessment = deriveCompanyAssessment(run);
  assessment.generatedAt = '2026-10-03T05:10:00.000Z';
  assessment.model = { status: 'completed', name: 'public-report-fixture' };
  const cash = assessment.metrics.find((metric) => metric.id === '2025-ocf')!;
  assert.equal(cash.status, 'available');
  const summary = {
    text: {
      zh: `保存的AI判断：${run.input.year} 年经营现金 ${cash.display[0]}，需要进一步核对现金实现程度。`,
      en: `Saved AI judgment: operating cash in ${run.input.year} is ${cash.display[1]}; cash realization needs review.`,
    },
    metricIds: [cash.id, 'scope-year'],
    evidenceIds: cash.evidenceIds,
  };
  assessment.narrative = {
    summary,
    dimensions: [{ ...structuredClone(summary), dimensionId: 'cash' }],
    strengths: [],
    risks: [structuredClone(summary)],
    actions: [structuredClone(summary)],
    changeConditions: [],
  };
  run.assessment = assessment;
  return run;
}

test('AI report-bound questions reject absent or replaced reports before service work while named issuers override page context', async () => {
  let researchCalls = 0;
  const h = await harness({
    wantsResearch: () => true,
    research: async (run) => {
      researchCalls++;
      return {
        run,
        research: { status: 'completed', toolCalls: 0, sources: [] },
      };
    },
  });
  try {
    const owner = await h.register();
    const run = reportCompany();
    const other = company(gree);
    const reportGeneratedAt = run.assessment!.generatedAt;
    await h.save(owner.userId, [run, other]);
    const requests: AssistantRequest[] = [
      { question: '报告中的经营现金判断依据是什么？', locale: 'zh', reportGeneratedAt },
      {
        question: '报告中的经营现金判断依据是什么？',
        locale: 'zh',
        currentRunId: run.id,
        reportGeneratedAt: '2026-10-03T05:09:00.000Z',
      },
    ];
    for (const request of requests) {
      const response = await h.message(request, owner.headers);
      assert.equal(response.status, 409, request.question);
      assert.equal((await response.json()).code, 'ASSISTANT_REPORT_STALE');
    }
    run.assessment = undefined;
    const missing = await h.message(
      {
        question: '报告中的经营现金判断依据是什么？',
        locale: 'zh',
        currentRunId: run.id,
        reportGeneratedAt,
      },
      owner.headers
    );
    assert.equal(missing.status, 409);
    assert.equal((await missing.json()).code, 'ASSISTANT_REPORT_STALE');
    assert.equal(researchCalls, 0);
    assert.equal(h.inputs.length, 0);
    assert.equal(run.questions, undefined);
    const anotherIssuer = await h.message(
      {
        question: '格力电器经营现金如何？',
        locale: 'zh',
        currentRunId: run.id,
        reportGeneratedAt,
      },
      owner.headers
    );
    assert.equal(anotherIssuer.status, 200);
    assert.equal(((await anotherIssuer.json()) as AssistantAnswer).company?.runId, other.id);
    assert.equal(researchCalls, 1);
    assert.equal(h.inputs.length, 1);
    assert.equal(h.inputs[0]!.run.id, other.id);
    assert.equal(h.inputs[0]!.run.assessment, undefined);
    assert.equal(run.questions, undefined);
  } finally {
    await h.dispose();
  }
});

test('assistant public projection includes completed saved AI judgments but excludes private report extensions', async () => {
  const h = await harness();
  try {
    const owner = await h.register();
    const run = reportCompany();
    const secrets = ['private-report-goal', 'private-field-focus', 'private-report-extension'];
    run.assessment!.research = { goal: secrets[0]!, steps: [], modelCalls: 1, toolCalls: 0 };
    run.assessmentFocus = secrets[1]!;
    Object.assign(run.assessment!, { privateMemo: secrets[2] });
    Object.assign(run.assessment!.narrative!.summary, { privateMemo: secrets[2] });
    Object.assign(run.assessment!.metrics[0]!, { privateMemo: secrets[2] });
    Object.assign(run.assessment!.evidence[0]!, { privateMemo: secrets[2] });
    await h.save(owner.userId, [run]);
    const response = await h.message(
      {
        question: '保存报告的经营现金判断有什么依据？',
        locale: 'zh',
        currentRunId: run.id,
        reportGeneratedAt: run.assessment!.generatedAt,
      },
      owner.headers
    );
    assert.equal(response.status, 200);
    assert.equal(h.inputs.length, 1);
    const received = h.inputs[0]!.run.assessment;
    assert.ok(received);
    assert.deepEqual(received.narrative!.summary, {
      text: run.assessment!.narrative!.summary.text,
      metricIds: run.assessment!.narrative!.summary.metricIds,
      evidenceIds: run.assessment!.narrative!.summary.evidenceIds,
    });
    assert.equal(received.generatedAt, run.assessment!.generatedAt);
    assert.equal(received.basis, 'consolidated');
    const serialized = JSON.stringify(h.inputs[0]!.run);
    for (const secret of secrets) assert.equal(serialized.includes(secret), false, secret);
    assert.equal(h.inputs[0]!.run.assessmentFocus, undefined);
    assert.equal(run.assessment!.research!.goal, secrets[0]);
  } finally {
    await h.dispose();
  }
});

test('replacing a saved AI report invalidates answers without changing the public financial snapshot', async () => {
  const h = await harness();
  try {
    const owner = await h.register();
    const run = reportCompany();
    await h.save(owner.userId, [run]);
    const originalSnapshot = structuredClone(run.context);
    const originalVersion = run.assessment!.generatedAt;
    const request: AssistantRequest = {
      question: '这份分析报告的现金判断依据是什么？',
      locale: 'zh',
      currentRunId: run.id,
      reportGeneratedAt: originalVersion,
    };
    assert.equal((await h.message(request, owner.headers)).status, 200);
    const reused = await h.message(request, owner.headers);
    assert.equal(((await reused.json()) as { cached?: boolean }).cached, true);
    assert.equal(h.inputs.length, 1);
    run.assessment!.generatedAt = '2026-10-03T05:20:00.000Z';
    run.assessment!.narrative!.summary.text.zh = '更新的AI判断：请优先核对经营现金来源。';
    const obsolete = await h.message(request, owner.headers);
    assert.equal(obsolete.status, 409);
    assert.equal((await obsolete.json()).code, 'ASSISTANT_REPORT_STALE');
    assert.equal(h.inputs.length, 1);
    const current = await h.message(
      { ...request, reportGeneratedAt: run.assessment!.generatedAt },
      owner.headers
    );
    assert.equal(current.status, 200);
    assert.equal(((await current.json()) as { cached?: boolean }).cached, undefined);
    assert.equal(h.inputs.length, 2);
    assert.equal(h.inputs[1]!.run.assessment!.generatedAt, run.assessment!.generatedAt);
    assert.match(h.inputs[1]!.run.assessment!.narrative!.summary.text.zh, /更新的AI判断/);
    assert.deepEqual(run.context, originalSnapshot);
  } finally {
    await h.dispose();
  }
});

test('model follow-ups receive the exact saved AI report and separately scoped current or previous snapshot amounts', async () => {
  for (const previous of [false, true]) {
    const payloads: string[] = [];
    const run = reportCompany();
    const savedCash = run.assessment!.metrics.find((metric) => metric.id === '2025-ocf')!;
    const savedSummary = structuredClone(run.assessment!.narrative!.summary);
    const savedSnapshotFetchedAt = run.assessment!.snapshotFetchedAt;
    const privateValues = [
      'private-report-model-warning',
      'private-saved-report-research-goal',
      'private-assistant-assessment-focus',
      'private-nested-report-memo',
    ];
    run.assessment!.model.warning = privateValues[0]!;
    run.assessment!.research = {
      goal: privateValues[1]!,
      steps: [],
      modelCalls: 1,
      toolCalls: 0,
    };
    run.assessmentFocus = privateValues[2]!;
    Object.assign(run.assessment!.narrative!.summary.text, { memo: privateValues[3] });
    Object.assign(run.assessment!.metrics[0]!, { memo: privateValues[3] });
    if (previous) {
      run.context!.fetchedAt = '2026-10-03T05:30:00.000Z';
      run.context!.financials[0]!.amounts.ocf = '140.00';
    }
    const h = await harness(
      { question: answerCompanyQuestion },
      {
        apiKey: 'report-follow-up-fixture-key',
        fetch: async (_url, init) => {
          const raw = String(init?.body);
          payloads.push(raw);
          const request = JSON.parse(raw);
          const input = JSON.parse(
            request.messages.find((message: { role: string }) => message.role === 'user').content
          );
          const report = input.publicContext.savedReport;
          assert.ok(report, 'Saved report must reach the model instead of being recomputed away.');
          assert.equal(report.generatedAt, run.assessment!.generatedAt);
          assert.equal(report.snapshotFetchedAt, savedSnapshotFetchedAt);
          assert.equal(report.currentSnapshotFetchedAt, run.context!.fetchedAt);
          assert.equal(report.snapshotRelation, previous ? 'previous' : 'current');
          assert.equal(report.year, 2025);
          assert.equal(report.basis, 'consolidated');
          assert.equal(report.selected, true);
          assert.deepEqual(report.summary.text, savedSummary.text);
          assert.deepEqual(
            report.summary.metricIds,
            savedSummary.metricIds.map((id) => `report:${id}`)
          );
          assert.deepEqual(
            report.summary.evidenceIds,
            savedSummary.evidenceIds.map((id) => `report:${id}`)
          );
          const reportMetric = report.metrics.find(
            (metric: { id: string }) => metric.id === 'report:2025-ocf'
          );
          assert.equal(reportMetric.value, savedCash.value);
          const currentMetric = input.publicContext.screen.metrics.find(
            (metric: { id: string }) => metric.id === '2025-ocf'
          );
          assert.equal(currentMetric.value, previous ? '140.00' : savedCash.value);
          const source = input.citations.find((item: { id: string }) =>
            item.id.startsWith('report:')
          );
          assert.ok(source, 'Saved-report sources must remain usable model citations.');
          for (const secret of privateValues) assert.equal(raw.includes(secret), false, secret);
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      text: '保存报告的经营现金低于合并利润；引用的经营现金为 {{metric:report:2025-ocf}}，应结合报告当时的资料理解现金判断。',
                      citations: [source.id],
                      metricIds: ['report:2025-ocf'],
                    }),
                  },
                },
              ],
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        },
      }
    );
    try {
      const owner = await h.register();
      await h.save(owner.userId, [run]);
      const response = await h.message(
        {
          question: '这份报告的经营现金判断依据是什么？',
          locale: 'zh',
          currentRunId: run.id,
          reportGeneratedAt: run.assessment!.generatedAt,
          basis: 'consolidated',
        },
        owner.headers
      );
      assert.equal(response.status, 200);
      const answer = (await response.json()) as AssistantAnswer;
      assert.equal(answer.mode, 'model', previous ? 'previous snapshot' : 'current snapshot');
      assert.equal(payloads.length, 1);
      assert.ok(answer.text.includes(savedCash.display[0]));
      if (previous)
        assert.equal(
          answer.text.includes(
            deriveCompanyAssessment(run).metrics.find((m) => m.id === '2025-ocf')!.display[0]
          ),
          false
        );
      assert.ok(answer.citations.length);
      assert.equal(answer.snapshotFetchedAt, savedSnapshotFetchedAt);
    } finally {
      await h.dispose();
    }
  }
});

test('ordinary company questions also receive completed AI report judgments while rule-only screens stay excluded', async () => {
  const h = await harness();
  try {
    const owner = await h.register();
    const run = reportCompany();
    await h.save(owner.userId, [run]);
    const request: AssistantRequest = {
      question: '经营现金的判断有什么依据？',
      locale: 'zh',
      currentRunId: run.id,
    };
    assert.equal((await h.message(request, owner.headers)).status, 200);
    assert.ok(h.inputs.at(-1)!.run.assessment?.narrative);
    run.assessment!.model.status = 'failed';
    const failed = await h.message(request, owner.headers);
    assert.equal(failed.status, 200);
    assert.equal(((await failed.json()) as { cached?: boolean }).cached, undefined);
    assert.equal(h.inputs.at(-1)!.run.assessment, undefined);
    assert.equal(h.inputs.length, 2);
  } finally {
    await h.dispose();
  }
});
