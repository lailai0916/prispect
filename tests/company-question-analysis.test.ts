import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { deriveCompanyAssessment } from '../shared/company-assessment.js';
import { contextAmountFields, type CompanyContextPeriod } from '../shared/company-workspace.js';
import { answerCompanyQuestion, answerCompanyRules } from '../server/company-questions.js';

function company(): CompanyResearchRun {
  const time = '2026-10-02T00:00:00.000Z';
  const financials: CompanyContextPeriod[] = Array.from({ length: 9 }, (_, index) => {
    const year = 2018 + index;
    return {
      period: `${year}-12-31`,
      annual: true,
      noticeDate: `${year + 1}-04-01`,
      amounts: {
        ...(Object.fromEntries(
          contextAmountFields.map((field) => [field, '10.00'])
        ) as CompanyContextPeriod['amounts']),
        revenue: year === 2025 ? '1200.00' : '1000.00',
        netProfit: '100.00',
        parentProfit: '90.00',
        ocf: '7.15',
        cash: '200.00',
        shortLoan: '100.00',
        currentPortionDebt: '30.00',
        receivables: '100.00',
        inventory: '80.00',
        totalAssets: '2000.00',
        totalLiabilities: '800.00',
      },
      ratios: { grossMargin: 28, roe: 20, revenueGrowth: 20 },
      auditOpinion: null,
      fieldSources: {},
      sourceUrls: [`https://www.cninfo.com.cn/public-${year}`],
      originalUrl: null,
    };
  });
  return {
    id: 'public-question-run',
    input: {
      securityCode: '300893',
      orgId: 'question-org',
      year: 2025,
      purpose: 'external',
      useModel: true,
    },
    identity: {
      securityCode: '300893',
      orgId: 'question-org',
      shortName: '测试公司',
      companyName: '测试股份有限公司',
      exchange: 'szse',
      sourceUrl: 'https://www.cninfo.com.cn/',
    },
    status: 'ready',
    createdAt: time,
    updatedAt: time,
    model: { requested: true, status: 'not-called' },
    trace: [],
    announcements: [],
    context: {
      version: 1,
      securityCode: '300893',
      orgId: 'question-org',
      companyName: '测试股份有限公司',
      fetchedAt: time,
      status: 'available',
      financials,
      sources: [],
      comparisons: [],
      profile: { orgName: '测试股份有限公司', privateSecret: 'PRIVATE_PROFILE_SENTINEL' },
      shareholders: [],
      announcements: [],
      news: [
        {
          title: '重要新闻线索',
          date: '2026-09-01',
          media: '公开媒体',
          url: 'https://finance.sina.com.cn/public-news',
          provider: '新浪财经',
          digest: '公开事件仍需核对原文。',
        },
      ],
      verificationLinks: [],
      warnings: [],
    },
  };
}
const response = (content: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));

test('Grok Q&A explains the server grade with accurate numeric templates and a full historical citation pool', async () => {
  const run = company();
  Object.assign(run, {
    privateSecret: 'PRIVATE_ACCOUNT_SENTINEL',
    preview: { material: { observations: ['PRIVATE_MATERIAL_SENTINEL'] } },
    contextNotes: 'PRIVATE_DECISION_SENTINEL',
  });
  const seed = deriveCompanyAssessment(run);
  const before = structuredClone(run);
  let calls = 0;
  const question = '综合分析，公司评级怎么样？';
  const output = await answerCompanyQuestion(run, question, 'parent', true, {
    apiKey: 'private-key-sentinel',
    serviceTier: 'default',
    fetch: async (url, init) => {
      calls++;
      assert.equal(String(url), 'https://tokenflux.dev/v1/chat/completions');
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.model, 'grok-4.7-fast');
      assert.equal(payload.service_tier, 'default');
      assert.equal(payload.temperature, 0.2);
      assert.deepEqual(payload.response_format, { type: 'json_object' });
      assert.ok(payload.messages[0].content.includes('明确判断'));
      assert.ok(!payload.messages[0].content.includes('不评级'));
      for (const value of [
        'PRIVATE_ACCOUNT_SENTINEL',
        'PRIVATE_MATERIAL_SENTINEL',
        'PRIVATE_DECISION_SENTINEL',
        'PRIVATE_PROFILE_SENTINEL',
        'private-key-sentinel',
      ])
        assert.ok(!String(init?.body).includes(value));
      const supplied = JSON.parse(payload.messages[1].content);
      assert.equal(supplied.publicContext.readingBasis, 'parent');
      assert.equal(supplied.publicContext.screen.grade, seed.grade);
      assert.ok(
        supplied.citations.some((row: { id: string }) => row.id === 'financial-2020-revenue')
      );
      assert.ok(supplied.citations.some((row: { id: string }) => row.id === 'news-1'));
      assert.equal(supplied.publicContext.financials.length, 6);
      assert.ok(
        supplied.publicContext.financials.every(
          (row: { period: string }) => Number(row.period.slice(0, 4)) <= 2025
        )
      );
      return response({
        text: `公司评级为 ${seed.grade}。盈利增长，但经营现金质量明显承压。{{metric:scope-year}}现金利润比为 {{metric:cash-profit}}。`,
        citations: ['financial-2025-ocf', 'financial-2020-revenue'],
        metricIds: ['scope-year', 'cash-profit'],
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(output.mode, 'model');
  assert.ok(
    output.text.includes(seed.metrics.find((metric) => metric.id === 'cash-profit')!.display[0])
  );
  assert.ok(output.text.includes('经营现金质量明显承压'));
  assert.ok(output.text.includes(answerCompanyRules(run, question, 'parent').text));
  assert.equal(output.snapshotFetchedAt, run.context!.fetchedAt);
  assert.equal(output.citations.length, 2);
  assert.deepEqual(run, before);
});

test('recent source questions do not get mistaken for interim financial questions', () => {
  const run = company();
  const news = answerCompanyRules(run, '查一下最新新闻', 'consolidated');
  assert.ok(news.text.includes('重要新闻线索'));
  assert.equal(news.citations[0]?.url, run.context!.news[0]!.url);
  assert.ok(!news.text.includes('中报或季报'));
  const disclosures = answerCompanyRules(run, '最新公告有哪些风险？', 'consolidated');
  assert.ok(disclosures.text.includes('公告'));
  assert.ok(!disclosures.text.includes('中报或季报'));
});

test('the unified assistant keeps follow-ups concise while preserving validated amounts and sources', async () => {
  const run = company();
  const question = '那现金呢？';
  const output = await answerCompanyQuestion(
    run,
    question,
    'consolidated',
    true,
    {
      apiKey: 'test-key',
      fetch: async (_url, init) => {
        const payload = JSON.parse(String(init?.body));
        assert.ok(payload.messages[0].content.includes('析光助手'));
        const supplied = JSON.parse(payload.messages[1].content);
        assert.deepEqual(supplied.previousQuestions, ['公司盈利怎么样？']);
        assert.equal(supplied.locale, 'zh');
        return response({
          text: '经营现金与利润差距较大，现金利润比为 {{metric:cash-profit}}，需要核对期后回款。',
          citations: ['financial-2025-ocf'],
          metricIds: ['cash-profit'],
        });
      },
    },
    undefined,
    { concise: true, locale: 'zh', previousQuestions: ['公司盈利怎么样？'] }
  );
  assert.equal(output.mode, 'model');
  assert.ok(output.text.includes('需要核对期后回款'));
  assert.ok(!output.text.includes('{{metric:'));
  assert.ok(!output.text.includes(answerCompanyRules(run, question, 'consolidated').text));
  assert.equal(output.citations.length, 1);
  assert.equal(output.snapshotFetchedAt, run.context!.fetchedAt);
});

test('English questions render English metric displays without dropping the original rule working paper', async () => {
  const run = company(),
    seed = deriveCompanyAssessment(run);
  const output = await answerCompanyQuestion(
    run,
    'What is the overall company grade?',
    'consolidated',
    true,
    {
      apiKey: 'test-key',
      fetch: async () =>
        response({
          text: `The grade is ${seed.grade}. Operating cash conversion is {{metric:cash-profit}} for {{metric:scope-year}}.`,
          citations: ['financial-2025-ocf'],
          metricIds: ['cash-profit', 'scope-year'],
        }),
    }
  );
  assert.equal(output.mode, 'model');
  assert.ok(
    output.text.includes(seed.metrics.find((metric) => metric.id === 'scope-year')!.display[1])
  );
  assert.ok(output.text.includes('Operating cash conversion'));
  assert.ok(!output.text.includes('{{metric:'));
});

test('Q&A rejects invented citations, bare numeric facts, unlisted or conflicting placeholders and altered grades', async () => {
  const run = company(),
    seed = deriveCompanyAssessment(run);
  const valid = {
    text: '经营现金质量承压。',
    citations: ['financial-2025-ocf'],
    metricIds: [] as string[],
  };
  const alternate = seed.grade === 'A' ? 'D' : 'A';
  for (const answer of [
    { ...valid, citations: ['fabricated-source'] },
    { ...valid, text: '现金利润比为 99%。' },
    { ...valid, text: '{{metric:cash-profit}}' },
    { ...valid, text: '{{metric:invented-value}}', metricIds: ['invented-value'] },
    { ...valid, text: `公司评级为 ${alternate}。` },
    { ...valid, text: '企业已经违法。', citations: ['news-1'] },
    { ...valid, text: '详情 https://unprovided.example/' },
  ]) {
    const output = await answerCompanyQuestion(
      run,
      '公司的现金与风险如何？',
      'consolidated',
      true,
      { apiKey: 'test-key', fetch: async () => response(answer) }
    );
    assert.equal(output.mode, 'rules-fallback');
    assert.equal(
      output.text,
      answerCompanyRules(run, '公司的现金与风险如何？', 'consolidated').text
    );
  }
  run.context!.comparisons = [
    {
      period: '2025-12-31',
      field: 'ocf',
      primary: '7.15',
      secondary: '99.00',
      difference: '91.85',
      matches: false,
    },
  ];
  const conflict = await answerCompanyQuestion(
    run,
    '公司的现金与风险如何？',
    'consolidated',
    true,
    {
      apiKey: 'test-key',
      fetch: async () =>
        response({ ...valid, text: '{{metric:cash-profit}}', metricIds: ['cash-profit'] }),
    }
  );
  assert.equal(conflict.mode, 'rules-fallback');
});

test('Q&A respects injected transport failures and preserves server-derived rating when Grok is unavailable', async () => {
  const run = company(),
    question = '公司评级怎么样？';
  for (const code of [401, 429, 503]) {
    let calls = 0;
    const answer = await answerCompanyQuestion(run, question, 'consolidated', true, {
      apiKey: 'test-key',
      fetch: async () => {
        calls++;
        return new Response('PRIVATE_PROVIDER_SENTINEL', { status: code });
      },
    });
    assert.equal(calls, 1);
    assert.equal(answer.mode, 'rules-fallback');
    assert.ok(answer.text.includes(deriveCompanyAssessment(run).grade));
    assert.ok(!JSON.stringify(answer).includes('PRIVATE_PROVIDER_SENTINEL'));
  }
});
