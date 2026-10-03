import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { deriveCompanyAssessment } from '../shared/company-assessment.js';
import { deriveCompanyResearchBrief } from '../shared/company-research-view.js';
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

function companyWithMissingSolvency(): CompanyResearchRun {
  const run = company();
  run.context!.financials.find((row) => row.period === '2025-12-31')!.amounts.totalAssets = null;
  return run;
}

const assessmentFacts = (assessment: ReturnType<typeof deriveCompanyAssessment>) => {
  const { generatedAt: _generatedAt, ...facts } = assessment;
  return facts;
};

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
      assert.ok(!Object.hasOwn(supplied.publicContext, 'provisionalRating'));
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

test('partial financial questions explain the provisional grade and coverage without changing the formal assessment', () => {
  const run = companyWithMissingSolvency();
  const before = structuredClone(run);
  const assessment = deriveCompanyAssessment(run);
  assert.equal(assessment.grade, 'NR');
  assert.equal(assessment.score, null);
  const answer = answerCompanyRules(run, '为什么暂定评级？', 'parent');
  assert.match(answer.text, /暂定评级为 C/);
  assert.match(answer.text, /3\/4/);
  assert.match(answer.text, /完整正式评级仍为 NR/);
  assert.match(answer.text, /2025 年合并/);
  assert.match(answer.text, /盈利成长|经营现金|营运占用/);
  assert.ok(answer.citations.some((citation) => citation.url.endsWith('public-2024')));
  assert.ok(answer.citations.some((citation) => citation.url.endsWith('public-2025')));
  assert.ok(answer.citations.every((citation) => !citation.url.includes('public-news')));
  const english = answerCompanyRules(run, 'What is the provisional grade?', 'consolidated');
  assert.match(english.text, /^The provisional grade is C/);
  assert.match(english.text, /3\/4/);
  assert.match(english.text, /full formal grade remains NR/);
  assert.deepEqual(run, before);
  assert.deepEqual(assessmentFacts(deriveCompanyAssessment(run)), assessmentFacts(assessment));
});

test('concise model explanations retain the computed provisional judgment and its public sources', async () => {
  const run = companyWithMissingSolvency();
  Object.assign(run, {
    privateSecret: 'PRIVATE_ACCOUNT_SENTINEL',
    preview: { material: { observations: ['PRIVATE_MATERIAL_SENTINEL'] } },
    contextNotes: 'PRIVATE_DECISION_SENTINEL',
  });
  const before = structuredClone(run);
  const assessment = deriveCompanyAssessment(run);
  const provisional = deriveCompanyResearchBrief({ ...run, assessment }).provisionalRating;
  assert.ok(provisional);
  let calls = 0;
  const answer = await answerCompanyQuestion(
    run,
    '为什么暂定评级？',
    'consolidated',
    true,
    {
      apiKey: 'test-key',
      fetch: async (_url, init) => {
        calls++;
        const request = JSON.parse(String(init?.body));
        const supplied = JSON.parse(request.messages[1].content);
        assert.equal(supplied.publicContext.screen.grade, 'NR');
        assert.equal(supplied.publicContext.screen.score, null);
        assert.deepEqual(supplied.publicContext.provisionalRating, provisional);
        for (const privateValue of [
          'PRIVATE_ACCOUNT_SENTINEL',
          'PRIVATE_MATERIAL_SENTINEL',
          'PRIVATE_DECISION_SENTINEL',
          'PRIVATE_PROFILE_SENTINEL',
        ])
          assert.ok(!String(init?.body).includes(privateValue));
        return response({
          text: '现金利润比为 {{metric:cash-profit}}，现金转化偏弱；总资产缺失，偿付杠杆维度尚未覆盖。',
          citations: ['financial-2025-ocf'],
          metricIds: ['cash-profit'],
        });
      },
    },
    undefined,
    { concise: true, locale: 'zh' }
  );
  assert.equal(calls, 1);
  assert.equal(answer.mode, 'model');
  assert.match(answer.text, /^暂定评级为 C/);
  assert.match(answer.text, /3\/4/);
  assert.match(answer.text, /完整正式评级仍为 NR/);
  assert.match(answer.text, /偿付杠杆维度尚未覆盖/);
  assert.ok(
    answer.text.includes(
      assessment.metrics.find((metric) => metric.id === 'cash-profit')!.display[0]
    )
  );
  assert.ok(!answer.text.includes('{{metric:'));
  assert.ok(answer.citations.some((citation) => citation.url.endsWith('public-2024')));
  assert.ok(answer.citations.some((citation) => citation.url.endsWith('public-2025')));
  assert.equal(
    new Set(answer.citations.map((citation) => citation.url)).size,
    answer.citations.length
  );
  assert.deepEqual(run, before);
  assert.deepEqual(assessmentFacts(deriveCompanyAssessment(run)), assessmentFacts(assessment));
});

test('model grade claims and bare coverage numbers still fall back to the computed provisional answer', async () => {
  const run = companyWithMissingSolvency();
  const before = structuredClone(run);
  const question = '为什么暂定评级？';
  const rule = answerCompanyRules(run, question, 'consolidated');
  for (const text of ['暂定评级为 C。', '暂定评级为 A。', '已覆盖 3/4 个财务维度。']) {
    let calls = 0;
    const answer = await answerCompanyQuestion(
      run,
      question,
      'consolidated',
      true,
      {
        apiKey: 'test-key',
        fetch: async () => {
          calls++;
          return response({ text, citations: ['financial-2025-ocf'], metricIds: [] });
        },
      },
      undefined,
      { concise: true, locale: 'zh' }
    );
    assert.equal(calls, 1);
    assert.equal(answer.mode, 'rules-fallback');
    assert.equal(answer.text, rule.text);
    assert.deepEqual(answer.citations, rule.citations);
  }
  assert.deepEqual(run, before);
  assert.equal(deriveCompanyAssessment(run).grade, 'NR');
  assert.equal(deriveCompanyAssessment(run).score, null);
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
