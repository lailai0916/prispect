import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssistantAnswer, AssistantStage, AssistantStreamEvent } from '../shared/assistant.js';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { contextAmountFields, type CompanyContextPeriod } from '../shared/company-workspace.js';
import { answerCompanyRules } from '../server/company-questions.js';
import { apiAssistant, RequestError, requestErrorText, setCsrfToken } from '../src/api.js';

const answer: AssistantAnswer = {
  kind: 'documentation',
  question: '如何核对资料来源？',
  text: '先打开原始资料，再核对同年度和口径。',
  citations: [{ label: '核查方法', url: '/docs/methodology' }],
  mode: 'rules',
  createdAt: '2026-10-04T00:00:00.000Z',
  snapshotFetchedAt: '',
};
const request = { question: answer.question, locale: 'zh' as const };
const encode = (event: AssistantStreamEvent) => `${JSON.stringify(event)}\n`;
const streamResponse = (chunks: Uint8Array[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } }
  );

test('assistant API decodes fragmented UTF-8 progress and answer with one secured POST', async (t) => {
  const payload = new TextEncoder().encode(
    encode({ type: 'progress', stage: 'recognizing' }) +
      encode({ type: 'progress', stage: 'retrieving' }) +
      encode({ type: 'progress', stage: 'composing' }) +
      encode({ type: 'answer', answer })
  );
  // One-byte chunks split Chinese characters, JSON strings and line boundaries.
  const calls: { input: unknown; init: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (input: unknown, init: RequestInit) => {
    calls.push({ input, init });
    return streamResponse(Array.from(payload, (byte) => Uint8Array.of(byte)));
  });
  const stages: AssistantStage[] = [];
  setCsrfToken('assistant-current-owner-token');
  try {
    assert.deepEqual(
      await apiAssistant(request, { onProgress: (stage) => stages.push(stage) }),
      answer
    );
    assert.deepEqual(stages, ['recognizing', 'retrieving', 'composing']);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.input, '/api/assistant/messages');
    assert.equal(calls[0]!.init.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0]!.init.body as string), request);
    const headers = new Headers(calls[0]!.init.headers);
    assert.match(headers.get('Accept')!, /application\/x-ndjson/);
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.equal(headers.get('X-CSRF-Token'), 'assistant-current-owner-token');
  } finally {
    setCsrfToken(null);
  }
});

test('assistant API reads an older JSON response without a second POST', async (t) => {
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(JSON.stringify(answer), { headers: { 'Content-Type': 'application/json' } })
  );
  const stages: AssistantStage[] = [];
  assert.deepEqual(
    await apiAssistant(request, { onProgress: (stage) => stages.push(stage) }),
    answer
  );
  assert.deepEqual(stages, []);
  assert.equal(fetch.mock.callCount(), 1);
});

test('assistant API retains every source in a real three-year rule answer through stream and JSON', async (t) => {
  const now = '2026-10-04T00:00:00.000Z';
  const run: CompanyResearchRun = {
    id: 'three-year-source-fixture',
    input: {
      securityCode: '300893',
      orgId: 'fixture-org',
      year: 2025,
      purpose: 'external',
    },
    status: 'ready',
    createdAt: now,
    updatedAt: now,
    model: { requested: false, status: 'not-called' },
    trace: [],
    announcements: [],
    context: {
      version: 1,
      securityCode: '300893',
      orgId: 'fixture-org',
      companyName: '来源核对测试公司',
      fetchedAt: now,
      status: 'partial',
      financials: [2023, 2024, 2025].map(
        (year): CompanyContextPeriod => ({
          period: `${year}-12-31`,
          annual: true,
          noticeDate: null,
          amounts: Object.fromEntries(
            contextAmountFields.map((field) => [field, null])
          ) as CompanyContextPeriod['amounts'],
          ratios: { grossMargin: null, roe: null, revenueGrowth: null },
          auditOpinion: null,
          // Conflicting fields keep the amounts unknown and both actual table URLs.
          fieldSources: {},
          sourceUrls: [
            `https://datacenter.eastmoney.com/api/data/v1/get?reportName=RPT_F10_FINANCE_GINCOME&filter=${year}`,
            `https://datacenter.eastmoney.com/api/data/v1/get?reportName=RPT_F10_FINANCE_GCASHFLOW&filter=${year}`,
            `https://quotes.sina.cn/a?source=lrb&year=${year}`,
            `https://quotes.sina.cn/a?source=llb&year=${year}`,
          ],
          originalUrl: null,
        })
      ),
      sources: [],
      comparisons: [],
      profile: {},
      shareholders: [],
      announcements: [],
      news: [],
      verificationLinks: [],
      warnings: [],
    },
  };
  const rule = answerCompanyRules(run, '近三年的利润与经营现金差异', 'consolidated');
  assert.equal(rule.citations.length, 18);
  assert.match(rule.text, /字段缺失或冲突/);
  const companyAnswer: AssistantAnswer = {
    ...rule,
    kind: 'company',
    company: { runId: run.id, name: run.context!.companyName, year: run.input.year },
  };
  let useStream = true;
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    useStream
      ? streamResponse([
          new TextEncoder().encode(encode({ type: 'answer', answer: companyAnswer })),
        ])
      : new Response(JSON.stringify(companyAnswer), {
          headers: { 'Content-Type': 'application/json' },
        })
  );
  for (const format of [true, false]) {
    useStream = format;
    const received = await apiAssistant({ question: rule.question, locale: 'zh' });
    assert.deepEqual(received, companyAnswer);
    assert.equal(received.citations.length, 18);
  }
  // Research metadata has the same source structure and no per-array cap in
  // its API contract. The overall stream byte bound remains the transport limit.
  companyAnswer.research = {
    status: 'partial',
    toolCalls: 18,
    sources: rule.citations.map(({ label, url }) => ({ label, url })),
  };
  for (const format of [true, false]) {
    useStream = format;
    const received = await apiAssistant({ question: rule.question, locale: 'zh' });
    assert.deepEqual(received.research, companyAnswer.research);
    assert.equal(received.research!.sources.length, 18);
  }
  assert.equal(fetch.mock.callCount(), 4);
});

test('assistant API preserves pre-stream HTTP errors and terminal stream errors', async (t) => {
  let response = new Response(
    JSON.stringify({ error: '请求过多，请稍后重试', code: 'RATE_LIMITED' }),
    { status: 429, headers: { 'Content-Type': 'application/json' } }
  );
  const fetch = t.mock.method(globalThis, 'fetch', async () => response);
  await assert.rejects(apiAssistant(request), (error: unknown) => {
    assert.ok(error instanceof RequestError);
    assert.equal(error.code, 'RATE_LIMITED');
    return true;
  });
  response = streamResponse([
    new TextEncoder().encode(
      encode({ type: 'progress', stage: 'composing' }) +
        encode({ type: 'error', code: 'ASSISTANT_TIMEOUT', error: '回答超时，请稍后重试' })
    ),
  ]);
  await assert.rejects(apiAssistant(request), (error: unknown) => {
    assert.ok(error instanceof RequestError);
    assert.equal(error.code, 'ASSISTANT_TIMEOUT');
    assert.equal(requestErrorText(error, 'en'), 'The answer timed out. Please retry.');
    return true;
  });
  assert.equal(fetch.mock.callCount(), 2);
});

test('assistant API rejects missing terminals, unknown events and invalid answers without retry', async (t) => {
  let payload = '';
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    streamResponse([new TextEncoder().encode(payload)])
  );
  const cases = [
    '',
    encode({ type: 'progress', stage: 'retrieving' }),
    '{"type":"progress","stage":"accelerating"}\n',
    '{"type":"secret","text":"unknown event"}\n',
    '{"type":"answer","answer":{"text":"missing fields"}}\n',
    '{not-json}\n',
    encode({ type: 'answer', answer }) + encode({ type: 'progress', stage: 'saving' }),
    encode({ type: 'answer', answer }) + encode({ type: 'answer', answer }),
  ];
  for (const value of cases) {
    payload = value;
    await assert.rejects(apiAssistant(request), (error: unknown) => {
      assert.ok(error instanceof RequestError);
      assert.equal(error.code, 'ASSISTANT_STREAM');
      assert.equal(requestErrorText(error, 'en'), 'The answer was interrupted. Please retry.');
      return true;
    });
  }
  assert.equal(fetch.mock.callCount(), cases.length);
});

test('assistant API bounds incomplete frames and repeated progress events', async (t) => {
  let payload = 'x'.repeat(1_048_577);
  let cancelled = 0;
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(payload));
          },
          cancel() {
            cancelled++;
          },
        }),
        { headers: { 'Content-Type': 'application/x-ndjson' } }
      )
  );
  for (const value of [payload, encode({ type: 'progress', stage: 'retrieving' }).repeat(65)]) {
    payload = value;
    await assert.rejects(apiAssistant(request), (error: unknown) => {
      assert.ok(error instanceof RequestError);
      assert.equal(error.code, 'ASSISTANT_STREAM');
      return true;
    });
  }
  assert.equal(cancelled, 2);
});

test('assistant API cancellation stops a pending reader and suppresses late progress', async (t) => {
  const controller = new AbortController();
  const stages: AssistantStage[] = [];
  let responseStream!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(stream) {
            responseStream = stream;
            stream.enqueue(
              new TextEncoder().encode(encode({ type: 'progress', stage: 'recognizing' }))
            );
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { 'Content-Type': 'application/x-ndjson' } }
      )
  );
  let sawStage!: () => void;
  const firstStage = new Promise<void>((resolve) => {
    sawStage = resolve;
  });
  const operation = apiAssistant(request, {
    signal: controller.signal,
    onProgress(stage) {
      stages.push(stage);
      sawStage();
    },
  });
  await firstStage;
  controller.abort();
  await assert.rejects(operation, (error: Error) => error.name === 'AbortError');
  assert.equal(cancelled, true);
  assert.throws(() =>
    responseStream.enqueue(new TextEncoder().encode(encode({ type: 'answer', answer })))
  );
  assert.deepEqual(stages, ['recognizing']);
});

test('an already cancelled assistant request never starts a POST', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => streamResponse([]));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    apiAssistant(request, { signal: controller.signal }),
    (error: Error) => error.name === 'AbortError'
  );
  assert.equal(fetch.mock.callCount(), 0);
});
