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

async function harness(service: AssistantService = {}, model: ModelConfig = {}) {
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
      const answer = (await response.json()) as AssistantAnswer;
      assert.equal(answer.kind, 'company', request.question);
      assert.equal(answer.company?.runId, expected.id, request.question);
      assert.equal(answer.company?.year, expected.input.year, request.question);
      assert.equal(h.inputs.at(-1)?.run.id, expected.id, request.question);
      assert.equal(h.inputs.at(-1)?.useModel, true);
      assert.equal(h.inputs.at(-1)?.basis, request.basis || 'consolidated');
    }
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
