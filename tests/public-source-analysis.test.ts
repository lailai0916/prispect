import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyResearchRun } from '../shared/contracts.js';
import {
  contextAmountFields,
  type CompanyContextPeriod,
  type CompanyNews,
  type CompanyDiscussion,
} from '../shared/company-workspace.js';
import {
  deriveCompanyAssessment,
  type CompanyAssessment,
  type AssessmentNarrative,
  type AssessmentJudgment,
} from '../shared/company-assessment.js';
import {
  analyzeCompanyWithModel,
  buildAssessmentPublicPayload,
} from '../server/company-assessment.js';
import { challengeCompanyExplanation } from '../server/company-challenge.js';
import type { runCompanyResearchAgent } from '../server/company-research-agent.js';

const time = '2026-10-01T12:00:00.000Z';
function annual(year: number): CompanyContextPeriod {
  return {
    period: `${year}-12-31`,
    annual: true,
    noticeDate: `${year + 1}-04-01`,
    amounts: {
      ...Object.fromEntries(contextAmountFields.map((field) => [field, '10.00'])),
      revenue: year === 2025 ? '1200.00' : '1000.00',
      netProfit: '100.00',
      ocf: '7.15',
      inventory: year === 2025 ? '200.00' : '100.00',
      receivables: '100.00',
      cash: '200.00',
      shortLoan: '50.00',
      currentPortionDebt: '20.00',
      totalAssets: '2000.00',
      totalLiabilities: '800.00',
      currentAssets: '800.00',
      currentLiabilities: '500.00',
    } as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: 28, roe: 20, revenueGrowth: 20 },
    auditOpinion: null,
    fieldSources: {},
    sourceUrls: ['https://www.cninfo.com.cn/public-financials'],
    originalUrl: null,
  };
}
function company(): CompanyResearchRun {
  return {
    id: 'PRIVATE_RUN',
    input: { securityCode: '300893', orgId: 'fixture-org', year: 2025 },
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
      financials: Array.from({ length: 6 }, (_, i) => annual(2025 - i)),
      sources: [],
      comparisons: [],
      profile: {},
      shareholders: [],
      announcements: [],
      news: [],
      discussions: [],
      verificationLinks: [],
      warnings: [],
    },
  };
}
function news(index: number, body = false): CompanyNews {
  const url = `https://finance.eastmoney.com/a/20260930${String(index).padStart(10, '0')}.html`;
  return {
    id: `public-news-${index.toString(16).padStart(24, '0')}`,
    title: `测试公司库存与订单新闻 ${index}`,
    date: '2026-09-30',
    media: `原始媒体${index % 4}`,
    provider: '东方财富检索',
    url,
    digest: `DIGEST_${index}：${'原始媒体的公开摘要，需要核对备货与实际销售。'.repeat(100)}`,
    contentScope: body ? 'media-excerpt' : 'digest',
    ...(body
      ? {
          excerpt: {
            text: `MEDIA_BODY_${index}：库存安排仍需核对，与原始媒体观点有所差异。`,
            url,
            sha256: 'a'.repeat(64),
            readAt: time,
          },
        }
      : {}),
  };
}
function discussion(index: number, body = false): CompanyDiscussion {
  const url = `https://guba.eastmoney.com/news,300893,${1000 + index}.html`;
  return {
    id: `guba-${1000 + index}`,
    securityCode: '300893',
    title: `测试公司库存公开讨论 ${index}`,
    date: '2026-09-30',
    provider: '东方财富股吧',
    url,
    textScope: body ? 'post-excerpt' : 'title',
    ...(body
      ? {
          excerpt: {
            text: `POST_BODY_${index}：个人怀疑存货，但未核实，其他讨论者持有不同观点。`,
            url,
            sha256: 'b'.repeat(64),
            readAt: time,
          },
        }
      : {}),
  };
}
function judgment(
  zh = '利润与经营现金存在差异，回款质量值得关注。',
  en = 'Profit and operating cash differ; collections merit attention.'
): AssessmentJudgment {
  return { text: { zh, en }, metricIds: ['cash-profit'], evidenceIds: [] };
}
function narrative(seed: CompanyAssessment): AssessmentNarrative {
  return {
    summary: judgment(
      '现金利润比为 {{metric:cash-profit}}，现金转化承压。',
      'Cash conversion is {{metric:cash-profit}} and merits attention.'
    ),
    dimensions: seed.dimensions.map((item) => ({ ...judgment(), dimensionId: item.id })),
    strengths: [],
    risks: [judgment()],
    actions: [
      judgment('核对期后回款及库存去化。', 'Check subsequent collections and inventory disposal.'),
    ],
    changeConditions: [
      judgment('若回款改善，判断可改善。', 'Improved collections could improve the assessment.'),
      judgment(
        '若现金继续走弱，判断会恶化。',
        'Further cash weakness could worsen the assessment.'
      ),
    ],
  };
}
const response = (data: unknown) =>
  Response.json({ choices: [{ message: { content: JSON.stringify(data) } }] });
type Packed = {
  news: {
    sourceId: string;
    id?: string;
    title: string;
    text: string;
    textScope: string;
    duplicateTextOf?: string;
    excerptReceipt?: unknown;
  }[];
  discussions: { sourceId: string; id?: string; title: string; text: string; textScope: string }[];
  publicInformationCoverage: {
    textChars: number;
    textCharLimit: number;
    truncatedTextRecords: number;
    duplicatedTextRecords: number;
    scope: string;
  };
  screen: { evidence: CompanyAssessment['evidence']; metrics: CompanyAssessment['metrics'] };
};
const packed = (run: CompanyResearchRun): Packed =>
  buildAssessmentPublicPayload(run, deriveCompanyAssessment(run)) as Packed;
const research: typeof runCompanyResearchAgent = async (run) => ({
  run: structuredClone(run),
  steps: [],
  modelCalls: 0,
  toolCalls: 0,
});

test('model receives all retained titles, bounded source texts once, and honest reading coverage', () => {
  const run = company();
  run.context!.news = Array.from({ length: 180 }, (_, i) => news(i + 1, i < 2));
  run.context!.discussions = Array.from({ length: 240 }, (_, i) => discussion(i + 1, i < 4));
  Object.assign(run.context!.discussions[0]!, {
    post_user: 'PRIVATE_AUTHOR',
    address: 'PRIVATE_LOCATION',
  });
  Object.assign(run, { notes: 'PRIVATE_NOTE', trial: 'PRIVATE_TRIAL' });
  const seed = deriveCompanyAssessment(run),
    payload = packed(run),
    text = JSON.stringify(payload);
  assert.equal(payload.news.length, 180);
  assert.equal(payload.discussions.length, 240);
  assert.equal(payload.news[179]!.title, '测试公司库存与订单新闻 180');
  assert.equal(payload.discussions[239]!.sourceId, 'guba-1240');
  assert.equal(payload.news[0]!.id, run.context!.news[0]!.id);
  assert.equal(payload.news[0]!.sourceId, 'news-000000000000000000000001');
  assert.equal(payload.discussions[0]!.id, 'guba-1001');
  assert.equal(text.split('MEDIA_BODY_1').length - 1, 1);
  assert.equal(text.split('POST_BODY_1').length - 1, 1);
  assert.ok(
    payload.screen.evidence
      .filter((item) => item.kind === 'news' || item.kind === 'discussion')
      .every((item) => !item.quote)
  );
  assert.ok(seed.evidence.some((item) => item.quote?.includes('MEDIA_BODY_1')));
  assert.ok(seed.evidence.some((item) => item.quote?.includes('POST_BODY_1')));
  assert.ok(payload.publicInformationCoverage.textChars <= 140000);
  assert.ok(payload.publicInformationCoverage.truncatedTextRecords > 0);
  assert.ok(Buffer.byteLength(JSON.stringify(JSON.stringify(payload))) <= 790000);
  assert.match(payload.publicInformationCoverage.scope, /Bounded.*not verified/);
  assert.doesNotMatch(text, /PRIVATE_/);
  assert.ok(payload.news[0]!.excerptReceipt);
  assert.equal(payload.discussions[4]!.text, '');
  assert.equal(payload.discussions[4]!.textScope, 'title');
});

test('reposts keep distinct citations and titles while repeated text is not independent corroboration', () => {
  const run = company();
  run.context!.news = [news(1), news(2), news(3)];
  run.context!.news[0]!.clusterId = 'one-repost';
  run.context!.news[1]!.clusterId = 'one-repost';
  run.context!.news[1]!.digest = run.context!.news[0]!.digest;
  const payload = packed(run);
  assert.equal(payload.news.length, 3);
  assert.equal(payload.publicInformationCoverage.duplicatedTextRecords, 1);
  assert.equal(payload.news[1]!.text, '');
  assert.equal(payload.news[1]!.duplicateTextOf, payload.news[0]!.sourceId);
  assert.notEqual(payload.news[0]!.sourceId, payload.news[1]!.sourceId);
  assert.equal(deriveCompanyAssessment(run).score, deriveCompanyAssessment(company()).score);
});

test('unverifiable bodies and wrong issuer posts never enter external model text', () => {
  const run = company();
  run.context!.news = [news(1, true)];
  run.context!.discussions = [discussion(1, true), discussion(2, true)];
  run.context!.news[0]!.excerpt!.url = 'https://private.example/PRIVATE_NEWS_BODY';
  run.context!.discussions[0]!.excerpt!.sha256 = 'invalid';
  run.context!.discussions[1]!.securityCode = '600519';
  const payload = packed(run);
  assert.equal(payload.news[0]!.textScope, 'digest');
  assert.equal(payload.discussions.length, 1);
  assert.equal(payload.discussions[0]!.textScope, 'title');
  assert.equal(payload.discussions[0]!.text, '');
  assert.doesNotMatch(JSON.stringify(payload), /MEDIA_BODY_|POST_BODY_|PRIVATE_NEWS_BODY/);
});

test('enriched analysis performs a real independent review before adopting source-backed counterarguments', async () => {
  const run = company();
  run.context!.discussions = [discussion(1, true)];
  const seed = deriveCompanyAssessment(run),
    draft = narrative(seed),
    revised = narrative(seed);
  revised.risks.push({
    text: {
      zh: '公开讨论样本中的库存担忧尚未核实，不能据此认定原因。',
      en: 'Inventory concerns in this public discussion sample are unverified and cannot establish a cause.',
    },
    metricIds: [],
    evidenceIds: ['guba-1001'],
  });
  let calls = 0,
    started = 0;
  const result = await analyzeCompanyWithModel(
    run,
    {
      apiKey: 'test-key',
      fetch: async (_url, init) => {
        calls++;
        const request = JSON.parse(String(init?.body));
        assert.ok(Buffer.byteLength(String(init?.body)) < 1000000);
        if (calls === 2) {
          assert.equal(started, 1);
          assert.match(request.messages[0].content, /独立证据复核.*最强反向线索/);
        }
        return response(calls === 1 ? draft : revised);
      },
    },
    undefined,
    {
      onReviewStart: async () => {
        started++;
      },
    }
  );
  assert.equal(calls, 2);
  assert.equal(result.model.calls, 2);
  assert.equal(result.model.status, 'completed');
  assert.equal(result.model.warning, undefined);
  assert.equal(result.narrative!.risks.length, 2);
  assert.equal(result.score, seed.score);
  assert.equal(result.grade, seed.grade);
});

test('failed review preserves the validated draft and explicitly says review did not complete', async () => {
  const run = company();
  run.context!.discussions = [discussion(1)];
  const seed = deriveCompanyAssessment(run);
  let calls = 0;
  const result = await analyzeCompanyWithModel(run, {
    apiKey: 'test-key',
    fetch: async () =>
      ++calls === 1 ? response(narrative(seed)) : new Response('PRIVATE_ERROR', { status: 503 }),
    onFailure: async () => {
      throw Error('diagnostic unavailable');
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.model.calls, 2);
  assert.equal(result.model.status, 'completed');
  assert.match(result.model.warning!, /复核.*未完成.*初稿/);
  assert.ok(result.narrative);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_ERROR/);
});

test('one schema repair plus actual review remains bounded to three requests', async () => {
  const run = company();
  run.context!.discussions = [discussion(1)];
  const seed = deriveCompanyAssessment(run);
  let calls = 0;
  const result = await analyzeCompanyWithModel(run, {
    apiKey: 'test-key',
    fetch: async () => response(++calls === 1 ? {} : narrative(seed)),
  });
  assert.equal(calls, 3);
  assert.equal(result.model.calls, 3);
  assert.equal(result.model.status, 'completed');
});

test('review lifecycle persistence failures propagate before a second model request', async () => {
  const run = company();
  run.context!.discussions = [discussion(1)];
  const seed = deriveCompanyAssessment(run);
  let calls = 0;
  await assert.rejects(
    analyzeCompanyWithModel(
      run,
      {
        apiKey: 'test-key',
        fetch: async () => {
          calls++;
          return response(narrative(seed));
        },
      },
      undefined,
      {
        onReviewStart: async () => {
          throw Error('STORE_CHANGED');
        },
      }
    ),
    /STORE_CHANGED/
  );
  assert.equal(calls, 1);
});

test('forum bodies require attributed uncertainty and cannot establish legal events', async () => {
  for (const text of [
    { zh: '库存去化压力已经成立。', en: 'Inventory disposal pressure is established.' },
    {
      zh: '公开讨论样本尚未核实，公司已确认违约。',
      en: 'This public discussion sample is unverified, but the company defaulted.',
    },
    {
      zh: '公开讨论已证明库存压力，仍需核实细节。',
      en: 'The public discussion proves inventory pressure; some details remain unverified.',
    },
  ]) {
    const run = company();
    run.context!.discussions = [discussion(1, true)];
    const data = narrative(deriveCompanyAssessment(run));
    data.risks = [{ text, metricIds: [], evidenceIds: ['guba-1001'] }];
    const result = await analyzeCompanyWithModel(run, {
      apiKey: 'test-key',
      fetch: async () => response(data),
    });
    assert.equal(result.model.status, 'failed');
    assert.equal(result.narrative, undefined);
  }
});

test('earlier English uncertainty cannot excuse a separate unsupported adverse assertion in draft or review', async () => {
  const run = company();
  run.context!.discussions = [discussion(1)];
  const seed = deriveCompanyAssessment(run),
    good = narrative(seed),
    bad = narrative(seed);
  bad.summary = {
    text: {
      zh: '尚未发现公司违约。公司已经违约。',
      en: 'The company has not defaulted. The company defaulted.',
    },
    metricIds: ['scope-year'],
    evidenceIds: [],
  };
  const rejected = await analyzeCompanyWithModel(run, {
    apiKey: 'test-key',
    fetch: async () => response(bad),
  });
  assert.equal(rejected.model.status, 'failed');
  assert.equal(rejected.narrative, undefined);
  let calls = 0;
  const reviewed = await analyzeCompanyWithModel(run, {
    apiKey: 'test-key',
    fetch: async () => response(++calls === 1 ? good : bad),
  });
  assert.equal(calls, 2);
  assert.equal(reviewed.model.status, 'completed');
  assert.match(reviewed.model.warning!, /复核.*未完成/);
  assert.doesNotMatch(reviewed.narrative!.summary.text.en, /defaulted/);
});

test(
  'a response body remains bounded by each actual request deadline',
  { timeout: 1000 },
  async (t) => {
    // A real transport retains a live handle; this stalled in-memory stream does not.
    // Keep it alive until the request deadline or the independent test timeout.
    const transport = setInterval(() => {}, 1000);
    t.after(() => clearInterval(transport));
    const run = company();
    const result = await analyzeCompanyWithModel(run, {
      apiKey: 'test-key',
      timeoutMs: 15,
      fetch: async () => {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{'));
            },
          })
        );
      },
    });
    assert.equal(result.model.status, 'failed');
    assert.equal(result.model.calls, 1);
    assert.equal(result.narrative, undefined);
  }
);

test('challenge review failure preserves attributable draft clues and honest progress', async () => {
  const run = company();
  run.context!.discussions = [discussion(1, true)];
  const data = {
    support: [
      {
        text: {
          zh: '公开讨论样本中的库存担忧未核实，可能与备货相容。',
          en: 'Unverified inventory concerns in this public discussion sample may be compatible with stocking.',
        },
        metricIds: [],
        evidenceIds: ['guba-1001'],
      },
    ],
    counter: [],
    gaps: [
      {
        zh: '订单执行及库龄材料尚未取得。',
        en: 'Order execution and inventory aging records were not obtained.',
      },
    ],
  };
  let calls = 0;
  const labels: string[] = [];
  const result = await challengeCompanyExplanation(
    run,
    'expansion',
    {
      apiKey: 'test-key',
      fetch: async () =>
        ++calls === 1 ? response(data) : new Response('PRIVATE_ERROR', { status: 503 }),
    },
    {
      research,
      onStep: async (step) => {
        labels.push(step.label);
      },
    }
  );
  assert.equal(calls, 2);
  assert.equal(result.model.calls, 2);
  assert.match(result.model.warning!, /复核.*未完成/);
  assert.ok(result.support.some((item) => item.origin === 'model'));
  assert.ok(labels.includes('交叉核查与反向复核'));
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_ERROR/);
});

test('challenge separately reviews attributed public opinions without duplicate source bodies or automatic adoption', async () => {
  const run = company();
  run.context!.discussions = [discussion(1, true)];
  const before = structuredClone(run);
  let calls = 0;
  const data = {
    support: [
      {
        text: {
          zh: '公开讨论样本中有人关注库存，观点未核实，与备货解释可能相容。',
          en: 'This public discussion sample contains unverified inventory concerns that may be compatible with stocking.',
        },
        metricIds: [],
        evidenceIds: ['guba-1001'],
      },
    ],
    counter: [],
    gaps: [
      {
        zh: '订单执行及期后去化材料尚未取得。',
        en: 'Order execution and subsequent inventory disposal records were not obtained.',
      },
    ],
  };
  const result = await challengeCompanyExplanation(
    run,
    'expansion',
    {
      apiKey: 'test-key',
      fetch: async (_url, init) => {
        calls++;
        const request = JSON.parse(String(init?.body));
        const input = JSON.parse(request.messages[1].content);
        const publicInput = input.publicSources || input;
        assert.equal(JSON.stringify(publicInput).split('POST_BODY_1').length - 1, 1);
        assert.equal(publicInput.challenge.evidence, undefined);
        return response(data);
      },
    },
    { research }
  );
  assert.equal(calls, 2);
  assert.equal(result.model.calls, 2);
  assert.equal(result.model.status, 'completed');
  assert.ok(
    result.support.some((item) => item.origin === 'model' && item.evidenceIds.includes('guba-1001'))
  );
  assert.deepEqual(run, before);
  assert.ok(result.distinguishingMaterials.every((item) => item.availability === 'not-obtained'));
});
