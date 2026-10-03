import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyResearchRun } from '../shared/contracts.js';
import {
  deriveCompanyAssessment,
  type AssessmentJudgment,
  type AssessmentNarrative,
  type CompanyAssessment,
} from '../shared/company-assessment.js';
import {
  contextAmountFields,
  industryMetricKeys,
  type CompanyContextPeriod,
} from '../shared/company-workspace.js';
import { analyzeCompanyWithModel, renderAssessmentText } from '../server/company-assessment.js';
import type { ModelConfig } from '../server/model.js';

const response = (content: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));
function annual(year: number): CompanyContextPeriod {
  return {
    period: `${year}-12-31`,
    annual: true,
    noticeDate: `${year + 1}-04-01`,
    amounts: {
      ...(Object.fromEntries(
        contextAmountFields.map((field) => [field, '10.00'])
      ) as CompanyContextPeriod['amounts']),
      revenue: `${year === 2025 ? 1200 : 1000}.00`,
      netProfit: '100.00',
      ocf: '7.15',
      cash: '200.00',
      shortLoan: '100.00',
      currentPortionDebt: '30.00',
      receivables: '100.00',
      inventory: '80.00',
      totalAssets: '2000.00',
      totalLiabilities: '800.00',
      currentAssets: '900.00',
      currentLiabilities: '600.00',
    },
    ratios: { grossMargin: 28, roe: 20, revenueGrowth: 20 },
    auditOpinion: null,
    fieldSources: { revenue: '公开财务来源', netProfit: '公开财务来源', ocf: '公开财务来源' },
    sourceUrls: ['https://www.cninfo.com.cn/public-financials'],
    originalUrl: null,
  };
}
function company(): CompanyResearchRun {
  const time = '2026-10-02T00:00:00.000Z';
  return {
    id: 'assessment-public-run',
    input: {
      securityCode: '300893',
      orgId: 'fixture-org',
      year: 2025,
      purpose: 'external',
      useModel: true,
    },
    identity: {
      securityCode: '300893',
      orgId: 'fixture-org',
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
      orgId: 'fixture-org',
      companyName: '测试股份有限公司',
      fetchedAt: time,
      status: 'available',
      financials: Array.from({ length: 10 }, (_, i) => annual(2018 + i)),
      sources: [
        {
          id: 'public-receipt',
          provider: '公开财务来源',
          dimension: '合并年度财务',
          url: 'https://www.cninfo.com.cn/public-financials',
          status: 'available',
          fetchedAt: time,
          latestDate: '2026-04-01',
          count: 10,
          note: '公开财务字段，原件仍可进一步核对。',
          responseHashes: ['a'.repeat(64)],
        },
      ],
      comparisons: [],
      profile: { orgName: '测试股份有限公司', industry: '汽车零部件' },
      shareholders: [],
      announcements: Array.from({ length: 26 }, (_, i) => ({
        id: `announcement-${i}`,
        title: i === 25 ? '担保事项重要公告' : '常规公告',
        date: '2026-09-30',
        url: `https://www.cninfo.com.cn/announcement-${i}`,
        sources: [{ provider: '巨潮资讯', url: `https://www.cninfo.com.cn/announcement-${i}` }],
        category: i === 25 ? '担保' : '常规',
        attention: i === 25 ? 'high' : 'routine',
        matched: '',
        meaning: '',
        nextQuestion: '',
      })),
      news: Array.from({ length: 20 }, (_, i) => ({
        title: `公司新闻线索 ${i}`,
        date: '2026-09-30',
        media: '测试媒体',
        url: `https://finance.sina.com.cn/news-${i}`,
        provider: '新浪财经',
        digest: '公开新闻摘要，不是已证实事件。',
      })),
      verificationLinks: [],
      warnings: [],
    },
  };
}
function narrative(seed: CompanyAssessment): AssessmentNarrative {
  const metric =
    seed.metrics.find((item) => item.status === 'available' && item.unit === 'percent') ||
    seed.metrics.find((item) => item.status === 'available')!;
  const judgment = (
    zh = '收入增长，但经营现金质量承压。',
    en = 'Revenue grew, but cash conversion is under pressure.'
  ): AssessmentJudgment => ({
    text: { zh, en },
    metricIds: [metric.id],
    evidenceIds: [],
  });
  return {
    summary: judgment(
      `关键指标为 {{metric:${metric.id}}}；收入增长，但经营现金质量承压。`,
      `The key indicator is {{metric:${metric.id}}}; revenue grew but cash conversion is under pressure.`
    ),
    dimensions: seed.dimensions.map((dimension) => ({ ...judgment(), dimensionId: dimension.id })),
    strengths: [
      judgment('营业规模扩大，为盈利提供支持。', 'A larger business supports profitability.'),
    ],
    risks: [
      judgment(
        '现金转化偏弱使回款质量成为主要关注点。',
        'Weak cash conversion makes collection quality a key concern.'
      ),
    ],
    actions: [
      judgment(
        '优先核对主要客户的期后回款及信用期变化。',
        'Prioritize subsequent customer collections and changes in credit terms.'
      ),
    ],
    changeConditions: [
      judgment(
        '若回款改善并持续转为经营现金，判断可改善。',
        'The judgment can improve if collections turn into sustained operating cash.'
      ),
      judgment(
        '若现金转化继续走弱或到期负债增加，判断会恶化。',
        'The judgment can worsen if cash conversion weakens further or due debt rises.'
      ),
    ],
  };
}
const config = (fetch: typeof globalThis.fetch): ModelConfig => ({
  apiKey: 'private-key-sentinel',
  fetch,
});
const financialResult = (seed: CompanyAssessment) => ({
  grade: seed.grade,
  score: seed.score,
  methodologyVersion: seed.methodologyVersion,
  metrics: seed.metrics,
  dimensions: seed.dimensions,
});

test('Grok analyzes rich public context with real metric substitution while grades and inputs stay immutable', async () => {
  const run = company();
  Object.assign(run, {
    privateSecret: 'PRIVATE_ACCOUNT_SENTINEL',
    contextNotes: 'PRIVATE_DECISION_SENTINEL',
    preview: { material: { observations: ['PRIVATE_MATERIAL_SENTINEL'] } },
    questions: ['PRIVATE_QUESTION_SENTINEL'],
  });
  run.context!.profile.privateSecret = 'PRIVATE_PROFILE_SENTINEL';
  Object.assign(run.context!.financials[7]!.ratios, { privateSecret: 'PRIVATE_RATIO_SENTINEL' });
  const beforeWithPrivateExtras = structuredClone(run);
  const seed = deriveCompanyAssessment(run);
  const answer = narrative(seed);
  answer.summary = {
    text: {
      zh: '收入增长，但现金转化明显偏弱，是所选年度的主要弱点。收入增长率为 {{metric:revenue-growth}}，现金利润比为 {{metric:cash-profit}}；优先核对主要客户期后回款是否兑现。',
      en: 'Revenue grew, but weak cash conversion is the main weakness in the selected year. Revenue growth is {{metric:revenue-growth}} and cash conversion is {{metric:cash-profit}}; prioritize checking subsequent collections from major customers.',
    },
    metricIds: ['revenue-growth', 'cash-profit'],
    evidenceIds: [],
  };
  let calls = 0;
  const result = await analyzeCompanyWithModel(run, {
    ...config(async (url, init) => {
      calls++;
      assert.equal(String(url), 'https://tokenflux.dev/v1/chat/completions');
      assert.equal(init?.redirect, 'error');
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.model, 'grok-4.7-fast');
      assert.equal(payload.temperature, 0.2);
      assert.equal(payload.service_tier, 'default');
      assert.deepEqual(payload.response_format, { type: 'json_object' });
      for (const forbidden of [
        'PRIVATE_ACCOUNT_SENTINEL',
        'PRIVATE_DECISION_SENTINEL',
        'PRIVATE_MATERIAL_SENTINEL',
        'PRIVATE_QUESTION_SENTINEL',
        'private-key-sentinel',
        'PRIVATE_PROFILE_SENTINEL',
        'PRIVATE_RATIO_SENTINEL',
      ])
        assert.ok(!String(init?.body).includes(forbidden));
      const context = JSON.parse(payload.messages[1].content);
      assert.equal(context.financials.length, 6);
      assert.ok(
        context.financials.every(
          (row: { period: string }) => Number(row.period.slice(0, 4)) <= 2025
        )
      );
      assert.equal(context.news.length, 20);
      assert.equal(context.announcements.length, 24);
      assert.equal(context.announcements[0].id, 'announcement-25');
      assert.equal(context.sourceQuality[0].responseHashes[0], 'a'.repeat(64));
      assert.equal(context.industry, null);
      return response(answer);
    }),
    serviceTier: 'default',
  });
  assert.equal(calls, 1);
  assert.equal(result.model.status, 'completed');
  assert.equal(result.model.calls, 1);
  assert.equal(result.model.name, 'grok-4.7-fast');
  assert.equal(result.model.provider, 'tokenflux.dev');
  assert.ok(result.narrative?.summary.text.zh.startsWith('收入增长，但现金转化明显偏弱'));
  assert.ok(result.narrative?.summary.text.en.startsWith('Revenue grew, but weak cash conversion'));
  assert.ok(!JSON.stringify(result.narrative).includes('{{metric:'));
  for (const id of answer.summary.metricIds) {
    const metric = seed.metrics.find((item) => item.id === id)!;
    assert.ok(result.narrative!.summary.text.zh.includes(metric.display[0]));
    assert.ok(result.narrative!.summary.text.en.includes(metric.display[1]));
  }
  assert.deepEqual(result.narrative!.actions, answer.actions);
  assert.deepEqual(result.narrative!.changeConditions, answer.changeConditions);
  assert.deepEqual(financialResult(result), financialResult(seed));
  assert.deepEqual(run, beforeWithPrivateExtras);
});

test('financial institutions reach model synthesis with their amounts and method context', async () => {
  const run = company();
  run.context!.organizationType = '银行';
  run.context!.profile.industry = '银行';
  const seed = deriveCompanyAssessment(run);
  let calls = 0;
  const result = await analyzeCompanyWithModel(
    run,
    config(async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      const input = JSON.parse(body.messages.at(-1).content);
      assert.equal(input.organizationType, '银行');
      assert.deepEqual(input.screen.methodNote, seed.methodNote);
      assert.equal(
        input.screen.metrics.find((metric: { id: string }) => metric.id === '2025-netProfit').value,
        '100.00'
      );
      assert.equal(
        input.screen.metrics.find((metric: { id: string }) => metric.id === '2025-ocf').value,
        '7.15'
      );
      return response(narrative(seed));
    })
  );
  assert.equal(calls, 1);
  assert.equal(result.model.status, 'completed');
  assert.equal(result.grade, seed.grade);
  assert.deepEqual(result.methodNote, seed.methodNote);
});

test('one bounded schema/citation repair can adopt a valid response, but repeated fabricated references fall back', async () => {
  const run = company(),
    seed = deriveCompanyAssessment(run);
  let calls = 0;
  const repaired = await analyzeCompanyWithModel(
    run,
    config(async (_url, init) => {
      calls++;
      if (calls === 1)
        return response({
          ...narrative(seed),
          summary: { ...narrative(seed).summary, evidenceIds: ['invented-reference'] },
        });
      assert.ok(
        JSON.parse(String(init?.body)).messages[0].content.includes('上一轮格式或引用未通过验证')
      );
      return response(narrative(seed));
    })
  );
  assert.equal(calls, 2);
  assert.equal(repaired.model.status, 'completed');
  assert.equal(repaired.model.calls, 2);
  calls = 0;
  const rejected = await analyzeCompanyWithModel(
    run,
    config(async () => {
      calls++;
      return response({
        ...narrative(seed),
        summary: { ...narrative(seed).summary, evidenceIds: ['invented-reference'] },
      });
    })
  );
  assert.equal(calls, 2);
  assert.equal(rejected.model.status, 'failed');
  assert.equal(rejected.model.calls, 2);
  assert.equal(rejected.narrative, undefined);
  assert.deepEqual(financialResult(rejected), financialResult(seed));
});

test('unsupported numbers, injected links, guarantees and headline-only legal facts are not adopted', async () => {
  const run = company(),
    seed = deriveCompanyAssessment(run);
  const news = seed.evidence.find((item) => item.kind === 'news');
  assert.ok(news, 'the real public news reference must exist');
  for (const value of [
    { zh: '现金利润比为 999%，经营现金承压。', en: 'Cash conversion is weak.' },
    { zh: '详情查看 https://invented.example/。', en: 'Cash conversion is weak.' },
    { zh: '企业保证偿付。', en: 'The company guarantees repayment.' },
    { zh: '企业已确认违约。', en: 'The company has defaulted.' },
  ]) {
    let calls = 0;
    const output = await analyzeCompanyWithModel(
      run,
      config(async () => {
        calls++;
        const answer = narrative(seed);
        answer.summary = { text: value, metricIds: [], evidenceIds: [news.id] };
        return response(answer);
      })
    );
    assert.equal(calls, 1);
    assert.equal(output.model.status, 'failed');
    assert.equal(output.narrative, undefined);
    assert.deepEqual(financialResult(output), financialResult(seed));
  }
});

test('missing/conflicting metric values cannot enter narrative, while unaffected context remains analyzable', async () => {
  const run = company();
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
  const seed = deriveCompanyAssessment(run);
  const conflict = seed.metrics.find((item) => item.status === 'conflict');
  assert.ok(conflict);
  let calls = 0;
  const output = await analyzeCompanyWithModel(
    run,
    config(async (_url, init) => {
      calls++;
      const publicContext = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      assert.equal(
        publicContext.financials.find((row: { period: string }) => row.period === '2025-12-31')
          .amounts.ocf,
        null
      );
      const value = narrative(seed);
      value.summary = {
        text: {
          zh: `现金为 {{metric:${conflict.id}}}。`,
          en: `Cash is {{metric:${conflict.id}}}.`,
        },
        metricIds: [conflict.id],
        evidenceIds: [],
      };
      return response(value);
    })
  );
  assert.equal(calls, 2);
  assert.equal(output.grade, 'NR');
  assert.equal(output.model.status, 'failed');
  assert.equal(output.narrative, undefined);
  assert.deepEqual(financialResult(output), financialResult(seed));
});

test('unconfigured, missing-context and wrong-issuer analysis never sends model requests', async () => {
  let calls = 0;
  const model = config(async () => {
    calls++;
    throw Error('must not call');
  });
  const unconfigured = await analyzeCompanyWithModel(company(), { ...model, apiKey: undefined });
  assert.equal(unconfigured.model.status, 'not-configured');
  assert.equal(unconfigured.model.calls, 0);
  const missing = company();
  delete missing.context;
  assert.equal((await analyzeCompanyWithModel(missing, model)).model.status, 'not-called');
  const wrong = company();
  wrong.context!.securityCode = '600519';
  const result = await analyzeCompanyWithModel(wrong, model);
  assert.equal(result.grade, 'NR');
  assert.equal(result.model.status, 'not-called');
  assert.equal(calls, 0);
});

test('HTTP failure and timeout preserve the deterministic assessment without leaking error bodies', async () => {
  const run = company(),
    seed = deriveCompanyAssessment(run);
  for (const status of [401, 403, 429, 503]) {
    let calls = 0;
    const result = await analyzeCompanyWithModel(
      run,
      config(async () => {
        calls++;
        return new Response('provider-secret-sentinel', { status });
      })
    );
    assert.equal(calls, 1);
    assert.equal(result.model.status, 'failed');
    assert.equal(result.model.calls, 1);
    assert.ok(!JSON.stringify(result).includes('provider-secret-sentinel'));
    assert.deepEqual(financialResult(result), financialResult(seed));
  }
  const timedOut = await analyzeCompanyWithModel(run, {
    ...config(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          const guard = setTimeout(() => reject(Error('test-guard')), 1000);
          init!.signal!.addEventListener(
            'abort',
            () => {
              clearTimeout(guard);
              reject(new DOMException('private-transport-secret', 'AbortError'));
            },
            { once: true }
          );
        })
    ),
    timeoutMs: 10,
  });
  assert.equal(timedOut.model.status, 'failed');
  assert.ok(timedOut.model.warning?.includes('超时'));
  assert.ok(!JSON.stringify(timedOut).includes('private-transport-secret'));
  assert.deepEqual(financialResult(timedOut), financialResult(seed));
});

test('industry context uses only complete matching-year cohorts with sufficient valid metrics', async () => {
  const run = company();
  run.industry = {
    '2025-12-31': {
      version: 1,
      securityCode: run.input.securityCode,
      period: '2025-12-31',
      industry: '测试行业',
      industryCode: 'fixture',
      fetchedAt: run.context!.fetchedAt,
      status: 'available',
      peerCount: 5,
      minimumSamples: 5,
      metrics: Object.fromEntries(
        industryMetricKeys.map((key) => [
          key,
          {
            company: 20,
            mean: 15,
            median: 15,
            count: key === 'roe' ? 4 : 5,
            missing: key === 'roe' ? 1 : 0,
            difference: 5,
          },
        ])
      ) as any,
      samples: [],
      sources: [
        { url: 'https://datacenter.eastmoney.com/public-industry', sha256: 'b'.repeat(64) },
      ],
      warnings: [],
    },
  };
  let payload: any;
  await analyzeCompanyWithModel(
    run,
    config(async (_url, init) => {
      payload = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      return response(narrative(deriveCompanyAssessment(run)));
    })
  );
  assert.equal(payload.industry.peerCount, 5);
  assert.equal(payload.industry.metrics.roe.mean, null);
  assert.equal(payload.industry.metrics.grossMargin.mean, 15);
  run.industry['2025-12-31']!.status = 'partial';
  await analyzeCompanyWithModel(
    run,
    config(async (_url, init) => {
      payload = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      return response(narrative(deriveCompanyAssessment(run)));
    })
  );
  assert.equal(payload.industry, null);
});

test('shared question renderer accepts authoritative placeholders and rejects alternate figures or missing values', () => {
  const seed = deriveCompanyAssessment(company());
  const metric = seed.metrics.find((item) => item.id === 'cash-profit')!;
  assert.equal(
    renderAssessmentText(`现金利润比为 {{metric:${metric.id}}}。`, seed, 'zh'),
    `现金利润比为 ${metric.display[0]}。`
  );
  assert.equal(
    renderAssessmentText(`Cash conversion is {{metric:${metric.id}}}.`, seed, 'en'),
    `Cash conversion is ${metric.display[1]}.`
  );
  for (const text of [
    '现金利润比为 999%。',
    '现金利润比为百分之九十九。',
    '{{metric:invented}}',
    'https://unprovided.example',
    '{{metric:2025-unprovided}}',
    'The ratio is ninety percent.',
  ])
    assert.throws(() => renderAssessmentText(text, seed, 'zh'));
  const conflicted = structuredClone(seed);
  conflicted.metrics.find((item) => item.id === metric.id)!.status = 'conflict';
  assert.throws(() => renderAssessmentText(`{{metric:${metric.id}}}`, conflicted, 'en'));
  const alternateGrade = seed.grade === 'A' ? 'D' : 'A';
  assert.throws(() => renderAssessmentText(`公司评级为 ${alternateGrade}。`, seed, 'zh'));
  assert.throws(() => renderAssessmentText(`The grade is ${alternateGrade}.`, seed, 'en'));
});

test('model output cannot override server grades, and diagnostic failures cannot discard fallback', async () => {
  const run = company(),
    seed = deriveCompanyAssessment(run);
  let calls = 0;
  const result = await analyzeCompanyWithModel(run, {
    ...config(async () => {
      calls++;
      return response({ ...narrative(seed), grade: 'A', score: 100 });
    }),
    onFailure: () => {
      throw Error('private-diagnostic-secret');
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.model.status, 'failed');
  assert.equal(result.narrative, undefined);
  assert.deepEqual(financialResult(result), financialResult(seed));
  assert.ok(!JSON.stringify(result).includes('private-diagnostic-secret'));
});

test('an actual excerpt must support the event asserted, rather than merely existing as a citation', async () => {
  for (const quote of [
    '本次担保范围是为正常经营提供担保支持。',
    '截至本公告日，公司没有发生违约事项。',
    '截至本公告日，公司已确认违约，相关债务未按期偿付。',
  ]) {
    const run = company();
    run.context!.announcements[0]!.excerpt = {
      page: 1,
      quote,
      url: run.context!.announcements[0]!.url,
      sha256: 'c'.repeat(64),
      pagesRead: 1,
    };
    const seed = deriveCompanyAssessment(run);
    const source = seed.evidence.find((item) => item.id === 'disclosure-announcement-0')!;
    const result = await analyzeCompanyWithModel(
      run,
      config(async () => {
        const answer = narrative(seed);
        answer.summary = {
          text: { zh: '企业已确认违约。', en: 'The company has defaulted.' },
          metricIds: [],
          evidenceIds: [source.id],
        };
        return response(answer);
      })
    );
    assert.equal(result.model.status, quote.includes('已确认违约') ? 'completed' : 'failed');
  }
});

test('issuer event findings do not inherit counterparties, plaintiffs or subsidiaries as their subject', async () => {
  const cases = [
    { quote: '本公司作为原告，因交易对手违约向法院提起诉讼。', accepted: false },
    { quote: '原告：测试股份有限公司；法院认定被告已违约。', accepted: false },
    { quote: '本公司作为被告，原告指控本公司已违约。', accepted: false },
    { quote: '本公司不存在违约；客户已违约，部分应收款尚未回收。', accepted: false },
    { quote: '全资子公司已违约，本公司正在核对担保责任。', accepted: false },
    { quote: '另一家公司已经确认违约，该事项仍需核对。', accepted: false },
    { quote: '本公司因合同违约提起诉讼，争议尚未审理完毕。', accepted: false },
    { quote: 'The company is the plaintiff; the defendant has defaulted.', accepted: false },
    { quote: 'The plaintiff alleged that the company has defaulted.', accepted: false },
    { quote: 'The company has not defaulted; its customer has defaulted.', accepted: false },
    {
      quote: 'The company is the plaintiff; the counterparty defaulted.',
      accepted: false,
      en: 'The company defaulted.',
    },
    {
      quote: 'The company is the plaintiff; the counterparty defaults on payment.',
      accepted: false,
      en: 'The company defaults on payment.',
    },
    { quote: 'The company defaulted on its debt.', accepted: true, en: 'The company defaulted.' },
    {
      quote: 'The company defaults on its debt.',
      accepted: true,
      en: 'The company defaults on its debt.',
    },
    { quote: 'The issuer defaulted on its debt.', accepted: true, en: 'The issuer defaulted.' },
    {
      quote: 'The customer violated the law.',
      accepted: false,
      en: 'The company violated the law.',
    },
    { quote: 'The company violated the law.', accepted: true, en: 'The company violated the law.' },
    { quote: 'The customer went bankrupt.', accepted: false, en: 'The company went bankrupt.' },
    { quote: 'The company went bankrupt.', accepted: true, en: 'The company went bankrupt.' },
    { quote: 'The supplier was fined.', accepted: false, en: 'The company was fined.' },
    { quote: 'The company was fined.', accepted: true, en: 'The company was fined.' },
    { quote: '法院认定测试股份有限公司已违约。', accepted: true },
    { quote: '本公司作为被告，法院认定被告已违约。', accepted: true },
    {
      quote: 'The company is the defendant; the court confirmed that the defendant has defaulted.',
      accepted: true,
    },
  ];
  for (const { quote, accepted, en } of cases) {
    const run = company();
    run.context!.announcements[0]!.excerpt = {
      page: 1,
      quote,
      url: run.context!.announcements[0]!.url,
      sha256: 'd'.repeat(64),
      pagesRead: 1,
    };
    const seed = deriveCompanyAssessment(run);
    const output = await analyzeCompanyWithModel(
      run,
      config(async () => {
        const answer = narrative(seed);
        answer.summary = {
          text: {
            zh: en ? '公开事项可能影响现金压力。' : '公司已确认违约。',
            en: en || 'The company has defaulted.',
          },
          metricIds: [],
          evidenceIds: ['disclosure-announcement-0'],
        };
        return response(answer);
      })
    );
    assert.equal(output.model.status, accepted ? 'completed' : 'failed', quote);
    assert.deepEqual(financialResult(output), financialResult(seed));
  }
});

test('attributed counterparty facts and cautious cash-impact judgments remain available', async () => {
  for (const text of [
    {
      zh: '客户已确认违约，公司的回款压力值得关注。',
      en: 'The customer has defaulted, raising collection concerns for the company.',
    },
    {
      zh: '对方已确认违约，公司的回款压力值得关注。',
      en: 'The counterparty has defaulted, raising collection concerns for the company.',
    },
    {
      zh: '客户履约争议增加回款不确定性，应关注经营现金压力。',
      en: 'The customer dispute adds collection uncertainty and warrants attention to operating cash.',
    },
    {
      zh: '目前不能确认公司违约，应关注回款争议及其现金影响。',
      en: 'The evidence does not establish a company default; the collection dispute can affect cash.',
    },
  ]) {
    const run = company();
    run.context!.announcements[0]!.excerpt = {
      page: 1,
      quote: '法院确认本公司的客户已违约，涉案应收款尚未收回。',
      url: run.context!.announcements[0]!.url,
      sha256: 'e'.repeat(64),
      pagesRead: 1,
    };
    const seed = deriveCompanyAssessment(run);
    const output = await analyzeCompanyWithModel(
      run,
      config(async () => {
        const answer = narrative(seed);
        answer.summary = { text, metricIds: [], evidenceIds: ['disclosure-announcement-0'] };
        return response(answer);
      })
    );
    assert.equal(output.model.status, 'completed', text.zh);
  }
});

test('the complete authorized research goal reaches the analysis input', async () => {
  const run = company();
  run.assessmentFocus = '研究目标'.repeat(250);
  const seed = deriveCompanyAssessment(run);
  const output = await analyzeCompanyWithModel(
    run,
    config(async (_url, init) => {
      const supplied = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      assert.equal(supplied.researchGoal.length, 1000);
      assert.equal(supplied.researchGoal, run.assessmentFocus);
      return response(narrative(seed));
    })
  );
  assert.equal(output.model.status, 'completed');
});

test('valid metric tokens cannot disguise a reversed cash/profit judgment in either language', async () => {
  const run = company();
  const seed = deriveCompanyAssessment(run);
  for (const text of [
    {
      zh: '经营现金超过利润，现金利润比为 {{metric:cash-profit}}。',
      en: 'Cash conversion is weak.',
    },
    { zh: '经营现金低于利润。', en: 'Operating cash exceeds profit at {{metric:cash-profit}}.' },
    { zh: '经营现金覆盖合并净利润。', en: 'Operating cash covers consolidated net profit.' },
    { zh: '经营现金等于利润。', en: 'Operating cash equals profit.' },
    {
      zh: '去年收入增长，但经营现金超过利润。',
      en: 'Last year revenue grew, but operating cash exceeds profit.',
    },
    {
      zh: '上年收入增长，经营现金超过利润。',
      en: 'Previous revenue grew, however operating cash covers profit.',
    },
  ]) {
    let calls = 0;
    const result = await analyzeCompanyWithModel(
      run,
      config(async () => {
        calls++;
        const answer = narrative(seed);
        answer.summary = { text, metricIds: ['cash-profit'], evidenceIds: [] };
        return response(answer);
      })
    );
    assert.equal(result.model.status, 'failed');
    assert.equal(calls, 1);
    assert.equal(result.narrative, undefined);
    assert.deepEqual(financialResult(result), financialResult(seed));
  }
});

test('proportional cash/profit statements do not become equal-amount assertions', async () => {
  const run = company();
  const seed = deriveCompanyAssessment(run);
  for (const zh of [
    '经营现金相当于利润的 {{metric:cash-profit}}。',
    '经营现金仅相当于合并净利润的 {{metric:cash-profit}}。',
    '经营现金等于利润的 {{metric:cash-profit}}。',
  ]) {
    const answer = narrative(seed);
    answer.summary = {
      text: { zh, en: 'Operating cash is {{metric:cash-profit}} of consolidated net profit.' },
      metricIds: ['cash-profit'],
      evidenceIds: [],
    };
    const result = await analyzeCompanyWithModel(
      run,
      config(async () => response(answer))
    );
    assert.equal(result.model.status, 'completed');
    assert.equal(result.narrative!.summary.text.zh, zh.replace('{{metric:cash-profit}}', '7.15%'));
  }
});

test('cash/profit relation validation preserves exact facts, independent judgments and future conditions', async () => {
  const cases = [
    [
      '7.15',
      '经营现金明显低于合并净利润。',
      'Operating cash materially trails consolidated net profit.',
    ],
    ['180.00', '经营现金超过利润。', 'Operating cash flow exceeds profit.'],
    [
      '100.00',
      '经营现金等于利润，也完全覆盖合并净利润。',
      'Operating cash equals profit and covers net profit.',
    ],
  ] as const;
  for (const [cash, zh, en] of cases) {
    const run = company();
    run.context!.financials.find((row) => row.period === '2025-12-31')!.amounts.ocf = cash;
    const seed = deriveCompanyAssessment(run);
    const answer = narrative(seed);
    answer.summary = { text: { zh, en }, metricIds: ['cash-profit'], evidenceIds: [] };
    answer.strengths = [
      {
        text: { zh: '收入增长。', en: 'Revenue grew.' },
        metricIds: ['revenue-growth'],
        evidenceIds: [],
      },
    ];
    answer.changeConditions[0] = {
      text: {
        zh: '若回款改善，经营现金超过利润，判断可改善。',
        en: 'If collections improve, operating cash exceeds profit and the judgment improves.',
      },
      metricIds: ['cash-profit'],
      evidenceIds: [],
    };
    answer.changeConditions[1] = {
      text: {
        zh: '若现金转化继续恶化，经营现金低于利润，判断会恶化。',
        en: 'If cash conversion weakens, operating cash trails profit and the judgment worsens.',
      },
      metricIds: ['cash-profit'],
      evidenceIds: [],
    };
    const result = await analyzeCompanyWithModel(
      run,
      config(async () => response(answer))
    );
    assert.equal(result.model.status, 'completed');
    assert.equal(result.narrative!.summary.text.zh, zh);
    assert.equal(result.narrative!.strengths[0]!.text.zh, '收入增长。');
    assert.deepEqual(financialResult(result), financialResult(seed));
  }
});

test('cash/profit comparisons use integer cents and reject unavailable or inapplicable coverage', () => {
  const run = company();
  const row = run.context!.financials.find((item) => item.period === '2025-12-31')!;
  row.amounts.netProfit = '1000000.00';
  row.amounts.ocf = '1000000.01';
  const exact = deriveCompanyAssessment(run);
  assert.equal(exact.metrics.find((item) => item.id === 'cash-profit')!.display[0], '100.00%');
  assert.equal(renderAssessmentText('经营现金超过利润。', exact, 'zh'), '经营现金超过利润。');
  assert.throws(
    () => renderAssessmentText('经营现金等于利润。', exact, 'zh'),
    /MODEL_UNSUPPORTED_CLAIM/
  );
  for (const [profit, cash] of [
    ['0.00', '0.00'],
    ['-100.00', '-50.00'],
  ] as const) {
    row.amounts.netProfit = profit;
    row.amounts.ocf = cash;
    const result = deriveCompanyAssessment(run);
    assert.throws(
      () => renderAssessmentText('经营现金覆盖利润。', result, 'zh'),
      /MODEL_UNSUPPORTED_CLAIM/
    );
    assert.throws(
      () => renderAssessmentText('Operating cash cannot cover profit.', result, 'en'),
      /MODEL_UNSUPPORTED_CLAIM/
    );
    const text = profit === cash ? '经营现金等于利润。' : '经营现金高于利润。';
    assert.equal(renderAssessmentText(text, result, 'zh'), text);
  }
  row.amounts.netProfit = '100.00';
  row.amounts.ocf = null;
  assert.throws(
    () => renderAssessmentText('经营现金低于利润。', deriveCompanyAssessment(run), 'zh'),
    /MODEL_UNSUPPORTED_CLAIM/
  );
  row.amounts.ocf = '7.15';
  run.context!.comparisons.push({
    period: '2025-12-31',
    field: 'ocf',
    primary: '7.15',
    secondary: '180.00',
    difference: '-172.85',
    matches: false,
  });
  assert.throws(
    () => renderAssessmentText('Operating cash trails profit.', deriveCompanyAssessment(run), 'en'),
    /MODEL_UNSUPPORTED_CLAIM/
  );
});
