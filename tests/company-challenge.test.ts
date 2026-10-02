import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyResearchRun } from '../shared/contracts.js';
import type { CompanyChallengeTarget } from '../shared/company-challenge.js';
import {
  contextAmountFields,
  industryMetricKeys,
  type CompanyContextPeriod,
  type CompanyIndustrySnapshot,
} from '../shared/company-workspace.js';
import {
  challengeCompanyExplanation,
  deriveChallengeResult,
  publicChallengeRun,
} from '../server/company-challenge.js';
import type { runCompanyResearchAgent } from '../server/company-research-agent.js';

const time = '2026-10-02T00:00:00.000Z';
function annual(year: number): CompanyContextPeriod {
  return {
    period: String(year) + '-12-31',
    annual: true,
    noticeDate: null,
    amounts: {
      ...(Object.fromEntries(
        contextAmountFields.map((field) => [field, '10.00'])
      ) as CompanyContextPeriod['amounts']),
      netProfit: '100.00',
      ocf: '7.15',
      revenue: year === 2025 ? '1200.00' : '1000.00',
      inventory: year === 2025 ? '200.00' : '100.00',
      receivables: year === 2025 ? '180.00' : '100.00',
      totalAssets: '2000.00',
      totalLiabilities: '800.00',
    },
    ratios: { grossMargin: null, roe: null, revenueGrowth: null },
    auditOpinion: null,
    fieldSources: {},
    sourceUrls: ['https://www.cninfo.com.cn/public-financials'],
    originalUrl: null,
  };
}
function run(): CompanyResearchRun {
  return {
    id: 'challenge-fixture',
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
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-called' },
    context: {
      version: 1,
      securityCode: '300893',
      orgId: 'fixture-org',
      companyName: '测试股份有限公司',
      fetchedAt: time,
      status: 'available',
      financials: [annual(2025), annual(2024)],
      sources: [],
      comparisons: [],
      profile: {},
      shareholders: [],
      announcements: [
        {
          id: 'cninfo-stock',
          title: '存货及备货事项说明',
          date: '2026-09-30',
          url: 'https://static.cninfo.com.cn/finalpage/2026-09-30/1234567890.PDF',
          sources: [{ provider: '巨潮资讯', url: 'https://www.cninfo.com.cn/' }],
          category: '存货',
          attention: 'high',
          matched: '',
          meaning: '',
          nextQuestion: '',
          excerpt: {
            page: 1,
            quote:
              '本公司正在推进订单交付及正常备货安排。公开材料只提供有限期间的文字片段，完整库龄、订单执行明细及期后销售还需要进一步核对。',
            url: 'https://static.cninfo.com.cn/finalpage/2026-09-30/1234567890.PDF',
            sha256: 'a'.repeat(64),
            pagesRead: 3,
          },
        },
      ],
      news: [
        {
          title: '测试公司订单增长新闻线索',
          date: '2026-09-30',
          media: '测试媒体',
          url: 'https://finance.sina.com.cn/order-news',
          provider: '新浪财经',
          digest: '公开摘要，未核对原文。',
        },
      ],
      verificationLinks: [],
      warnings: [],
    },
  };
}
const research: typeof runCompanyResearchAgent = async (source) => ({
  run: structuredClone(source),
  steps: [],
  modelCalls: 0,
  toolCalls: 0,
});
const modelResponse = (content: unknown) =>
  Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
const narrative = (
  source: CompanyResearchRun,
  zh = '相对库存变化为 {{metric:challenge-inventory-intensity-change}}，这是需要检验的线索；尚不能确认现金差异的原因。',
  en = 'Relative inventory changed by {{metric:challenge-inventory-intensity-change}}. This clue needs checking; the cause of the cash gap is unresolved.'
) => ({
  support: [
    { text: { zh, en }, metricIds: ['challenge-inventory-intensity-change'], evidenceIds: [] },
  ],
  counter: [],
  gaps: [
    {
      zh: '完整订单及期后销售明细尚未取得。',
      en: 'Complete orders and subsequent sales records have not been obtained.',
    },
  ],
});

test('challenge compares exact annual consolidated fields and keeps causes unresolved', () => {
  const source = run();
  const before = structuredClone(source);
  const result = deriveChallengeResult(source, 'expansion');
  assert.equal(result.status, 'mixed-clues');
  assert.equal(
    result.metrics.find((item) => item.id === 'challenge-inventory-intensity-change')?.value,
    '6.67'
  );
  assert.equal(
    result.metrics.find((item) => item.id === 'challenge-receivables-intensity-change')?.value,
    '5.00'
  );
  assert.equal(result.support.length, 1);
  assert.equal(result.counter.length, 1);
  assert.ok(
    [...result.support, ...result.counter].every(
      (item) => item.metricIds.length && item.evidenceIds.length
    )
  );
  assert.ok(result.distinguishingMaterials.every((item) => item.availability === 'not-obtained'));
  assert.match(result.summary[0], /仍待检验/);
  assert.deepEqual(source, before);
});
test('missing and conflicting balance fields withhold only dependent clues', () => {
  const source = run();
  source.context!.comparisons.push({
    period: '2025-12-31',
    field: 'inventory',
    primary: '200.00',
    secondary: '250.00',
    difference: '50.00',
    matches: false,
  });
  const inventory = deriveChallengeResult(source, 'inventory-pressure');
  assert.equal(inventory.status, 'unresolved');
  assert.equal(
    inventory.metrics.some((item) => item.id === 'challenge-inventory-intensity-change'),
    false
  );
  assert.match(inventory.gaps[0][0], /冲突/);
  const collections = deriveChallengeResult(source, 'collection-pressure');
  assert.equal(collections.support.length, 1);
  source.context!.financials[1]!.amounts.receivables = null;
  assert.equal(deriveChallengeResult(source, 'collection-pressure').status, 'unresolved');
});
test('subject, prior period, negative balances and zero revenue are not silently substituted', () => {
  for (const change of [
    (source: CompanyResearchRun) => {
      source.context!.securityCode = '600519';
    },
    (source: CompanyResearchRun) => {
      source.context!.financials[1]!.period = '2023-12-31';
    },
    (source: CompanyResearchRun) => {
      source.context!.financials[1]!.amounts.revenue = '0.00';
    },
    (source: CompanyResearchRun) => {
      source.context!.financials[0]!.amounts.inventory = '-1.00';
    },
  ]) {
    const source = run();
    change(source);
    const result = deriveChallengeResult(source, 'inventory-pressure');
    assert.equal(result.status, 'unresolved');
    assert.equal(
      result.metrics.some((item) => item.id === 'challenge-inventory-intensity-change'),
      false
    );
  }
});
test('revenue-normalized counter clues do not allege inventory problems', () => {
  const source = run();
  source.context!.financials[0]!.amounts.inventory = '110.00';
  const inventory = deriveChallengeResult(source, 'inventory-pressure');
  assert.equal(inventory.status, 'counter-clues');
  assert.match(inventory.counter[0]!.text.en, /do not support/);
  const expansion = deriveChallengeResult(source, 'expansion');
  assert.equal(expansion.status, 'supporting-clues');
});
test('challenge public input excludes private work and replaces arbitrary user focus', () => {
  const source = run();
  Object.assign(source, {
    preview: { note: 'PRIVATE_PREVIEW' },
    questions: [{ text: 'PRIVATE_QUESTION' }],
    adoptedMaterialId: 'PRIVATE_ADOPTED',
    notes: 'PRIVATE_NOTES',
    trial: ['PRIVATE_TRIAL'],
    assessmentFocus: 'PRIVATE_FOCUS',
  });
  const publicSource = publicChallengeRun(source, 'expansion');
  assert.doesNotMatch(JSON.stringify(publicSource), /PRIVATE_/);
  assert.match(publicSource.assessmentFocus!, /挑战/);
  publicSource.context!.financials[0]!.amounts.inventory = '1.00';
  assert.equal(source.context!.financials[0]!.amounts.inventory, '200.00');
});
test('unconfigured Grok still performs real fixed topic searches and records actual tool results', async () => {
  const source = run();
  const requests: string[] = [];
  const result = await challengeCompanyExplanation(
    source,
    'expansion',
    {},
    {
      industry: async () => {
        const value: CompanyIndustrySnapshot = {
          version: 1,
          securityCode: source.input.securityCode,
          period: '2025-12-31',
          industry: '测试行业',
          industryCode: 'fixture',
          fetchedAt: new Date().toISOString(),
          status: 'available',
          peerCount: 5,
          minimumSamples: 5,
          metrics: Object.fromEntries(
            industryMetricKeys.map((key) => [
              key,
              { company: 1, mean: 1, median: 1, count: 5, missing: 0, difference: 0 },
            ])
          ) as CompanyIndustrySnapshot['metrics'],
          samples: [],
          sources: [],
          warnings: [],
        };
        return value;
      },
      fetch: async (url) => {
        const target = new URL(String(url));
        assert.equal(target.hostname, 'search-api-web.eastmoney.com');
        const keyword = JSON.parse(target.searchParams.get('param')!).keyword as string;
        requests.push(keyword);
        return Response.json({
          result: {
            cmsArticleWebOld: [
              {
                title: '测试公司 ' + (requests.length === 1 ? '订单安排' : '存货观察'),
                content: '测试公司公开新闻摘要，尚未核对全文。',
                date: '2026-09-30',
                mediaName: '测试媒体',
                url: 'https://finance.sina.com.cn/topic-' + requests.length,
              },
            ],
          },
        });
      },
    }
  );
  assert.deepEqual(requests, ['测试公司 订单 产能', '测试公司 存货 减值']);
  assert.equal(result.model.status, 'not-configured');
  assert.equal(result.model.calls, 0);
  assert.equal(result.research.modelCalls, 0);
  assert.equal(result.research.toolCalls, 6);
  assert.ok(
    result.research.steps.some((step) => step.tool === 'search_news' && step.status === 'completed')
  );
  assert.ok(
    result.research.steps.some(
      (step) => step.tool === 'read_disclosure' && step.status === 'completed'
    )
  );
  assert.ok(
    result.research.steps.some((step) => step.tool === 'planning' && step.status === 'failed')
  );
  assert.ok(
    result.evidence.some(
      (item) =>
        item.url === 'https://finance.sina.com.cn/topic-1' && item.sourceQuality === 'headline'
    )
  );
  assert.equal(source.context!.news.length, 1);
  assert.equal(source.industry, undefined);
});
test('model judgments render exact metric tokens and use only allowlisted public evidence', async () => {
  const source = run();
  Object.assign(source, {
    preview: { note: 'PRIVATE_PREVIEW' },
    adoptedMaterialId: 'PRIVATE_ADOPTED',
    trial: ['PRIVATE_TRIAL'],
  });
  let calls = 0;
  const result = await challengeCompanyExplanation(
    source,
    'expansion',
    {
      apiKey: 'test-key',
      serviceTier: 'default',
      fetch: async (_url, options) => {
        calls++;
        const request = JSON.parse(String(options?.body));
        assert.doesNotMatch(JSON.stringify(request), /PRIVATE_/);
        assert.equal(request.response_format.type, 'json_object');
        assert.equal(request.service_tier, 'default');
        return modelResponse(narrative(source));
      },
    },
    { research }
  );
  assert.equal(result.model.status, 'completed');
  assert.equal(calls, 1);
  assert.equal(result.research.modelCalls, 1);
  assert.match(result.support.at(-1)!.text.zh, /6.67 个百分点/);
  assert.doesNotMatch(result.support.at(-1)!.text.zh, /\{\{/);
  assert.ok(result.support.at(-1)!.evidenceIds.length);
});
test('invalid citations, invented numbers and asserted causes fail atomically after one repair', async () => {
  for (const change of [
    (data: ReturnType<typeof narrative>) => {
      data.support[0]!.metricIds = ['unknown-metric'];
    },
    (data: ReturnType<typeof narrative>) => {
      data.support[0]!.text.zh = '存货占营收变化为 99.99%。';
    },
    (data: ReturnType<typeof narrative>) => {
      data.support[0]!.text.zh = '现金偏低的原因是存货积压。';
    },
    (data: ReturnType<typeof narrative>) => {
      data.support[0]!.text.zh = '现金差异由库存引起。';
    },
    (data: ReturnType<typeof narrative>) => {
      data.support[0]!.text.en = 'The cash gap is due to inventory accumulation.';
    },
  ]) {
    const source = run(),
      data = narrative(source);
    change(data);
    let calls = 0;
    const result = await challengeCompanyExplanation(
      source,
      'expansion',
      {
        apiKey: 'test-key',
        fetch: async () => {
          calls++;
          return modelResponse(data);
        },
      },
      { research }
    );
    assert.equal(result.model.status, 'failed');
    assert.equal(calls, 2);
    assert.equal(result.model.calls, 2);
    assert.ok([...result.support, ...result.counter].every((item) => item.origin === 'rules'));
  }
});
test('headline-only support cannot establish adverse events or firm operational assertions', async () => {
  for (const text of [
    ['新闻称公司已违约。', 'The news says the company defaulted.'],
    ['新闻显示公司已受到处罚。', 'The news says the company was fined.'],
    ['新闻线索说明公司违法。', 'News says the company violated the law.'],
    ['新闻显示库存风险已经消失。', 'The news shows inventory problems have disappeared.'],
    [
      '新闻线索可能涉及库存，公司已确认违约。',
      'News may point to stocking, but the company defaulted.',
    ],
  ]) {
    const data = {
      support: [{ text: { zh: text[0], en: text[1] }, metricIds: [], evidenceIds: ['news-1'] }],
      counter: [],
      gaps: [{ zh: '原文仍待核对。', en: 'The original remains unchecked.' }],
    };
    const result = await challengeCompanyExplanation(
      run(),
      'expansion',
      { apiKey: 'test-key', fetch: async () => modelResponse(data) },
      { research }
    );
    assert.equal(result.model.status, 'failed');
    assert.ok(result.support.every((item) => item.origin === 'rules'));
  }
});
test('headline cues remain useful when explicitly uncertain and attributed', async () => {
  const data = {
    support: [
      {
        text: {
          zh: '新闻提供可能扩大订单的线索，原文尚未核对，不能确认交付情况。',
          en: 'The news may suggest growing orders; the original is unchecked and deliveries remain unverified.',
        },
        metricIds: [],
        evidenceIds: ['news-1'],
      },
    ],
    counter: [],
    gaps: [{ zh: '订单执行仍待核对。', en: 'Order execution remains unchecked.' }],
  };
  const result = await challengeCompanyExplanation(
    run(),
    'expansion',
    { apiKey: 'test-key', fetch: async () => modelResponse(data) },
    { research }
  );
  assert.equal(result.model.status, 'completed');
  assert.equal(result.support.at(-1)!.origin, 'model');
});
test('model HTTP and diagnostic failures preserve rules without exposing raw failure bodies', async () => {
  const result = await challengeCompanyExplanation(
    run(),
    'expansion',
    {
      apiKey: 'test-key',
      fetch: async () => new Response('SECRET_PROVIDER_FAILURE', { status: 500 }),
      onFailure: async () => {
        throw Error('SECRET_DIAGNOSTIC');
      },
    },
    { research }
  );
  assert.equal(result.model.status, 'failed');
  assert.equal(result.model.calls, 1);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_/);
  assert.ok(result.support.length && result.counter.length);
});
test('cancelled and mismatched subjects never synthesize a replacement explanation', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    challengeCompanyExplanation(run(), 'expansion', {}, { research, signal: controller.signal }),
    /abort/i
  );
  const wrong = run();
  wrong.context!.orgId = 'wrong-org';
  await assert.rejects(
    challengeCompanyExplanation(wrong, 'collection-pressure', {}, { research }),
    /CHALLENGE_SUBJECT_SCOPE/
  );
});

test('weak-cash explanations require positive profit and operating cash below profit', async () => {
  for (const change of [
    (source: CompanyResearchRun) => {
      source.context!.financials[0]!.amounts.netProfit = null;
    },
    (source: CompanyResearchRun) => {
      source.context!.financials[0]!.amounts.netProfit = '0.00';
    },
    (source: CompanyResearchRun) => {
      source.context!.financials[0]!.amounts.netProfit = '-1.00';
    },
    (source: CompanyResearchRun) => {
      source.context!.financials[0]!.amounts.ocf = '100.00';
    },
    (source: CompanyResearchRun) => {
      source.context!.financials[0]!.amounts.ocf = '101.00';
    },
  ]) {
    const source = run();
    change(source);
    for (const target of ['expansion', 'inventory-pressure', 'collection-pressure'] as const) {
      const result = deriveChallengeResult(source, target);
      assert.equal(result.support.length, 0);
      assert.equal(result.counter.length, 0);
      assert.equal(result.status, 'unresolved');
      assert.notEqual(result.applicability, 'applicable');
      let calls = 0;
      const analyzed = await challengeCompanyExplanation(
        source,
        target,
        {
          apiKey: 'test-key',
          fetch: async () => {
            calls++;
            return modelResponse(narrative(source));
          },
        },
        { research }
      );
      assert.equal(calls, 0);
      assert.equal(analyzed.model.status, 'not-called');
      assert.equal(analyzed.support.length, 0);
      assert.equal(analyzed.counter.length, 0);
    }
  }
});
test('unverifiable original excerpts are downgraded to headline clues', () => {
  const source = run();
  source.context!.announcements[0]!.excerpt!.sha256 = 'unverified';
  const result = deriveChallengeResult(source, 'expansion');
  const evidence = result.evidence.find((item) => item.id === 'disclosure-cninfo-stock')!;
  assert.equal(evidence.sourceQuality, 'headline');
  assert.equal(evidence.page, undefined);
  assert.match(evidence.quote!, /未通过核对/);
});

test('unrelated background metrics and profile sources cannot manufacture target-specific clues', async () => {
  const source = run();
  source.context!.profile = { orgName: '测试股份有限公司', industry: '测试行业' };
  const data = {
    support: [
      {
        text: {
          zh: '可能存在扩张备货线索，订单执行尚未核对。',
          en: 'There may be stocking for expansion; order execution remains unchecked.',
        },
        metricIds: ['cash-profit'],
        evidenceIds: [],
      },
    ],
    counter: [],
    gaps: [{ zh: '完整订单尚未取得。', en: 'Complete orders have not been obtained.' }],
  };
  const result = await challengeCompanyExplanation(
    source,
    'expansion',
    { apiKey: 'test-key', fetch: async () => modelResponse(data) },
    { research }
  );
  assert.equal(result.model.status, 'failed');
  assert.ok(result.support.every((item) => item.origin === 'rules'));
});
test('failed real topic retrieval preserves source failures and never invents new support', async () => {
  const source = run();
  const requests: string[] = [];
  const result = await challengeCompanyExplanation(
    source,
    'expansion',
    {},
    {
      industry: async () => {
        throw Error('Unavailable industry');
      },
      fetch: async (url) => {
        requests.push(String(url));
        return new Response('PRIVATE_PROVIDER_BODY', { status: 503 });
      },
    }
  );
  assert.equal(requests.length, 2);
  assert.equal(result.model.status, 'not-configured');
  assert.equal(
    result.research.steps.filter((step) => step.tool === 'search_news' && step.status === 'failed')
      .length,
    2
  );
  assert.equal(
    result.evidence.filter((item) => item.kind === 'news' && item.sourceQuality === 'headline')
      .length,
    1
  );
  assert.ok([...result.support, ...result.counter].every((item) => item.origin === 'rules'));
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_PROVIDER_BODY/);
  assert.equal(source.context!.sources.length, 0);
});
