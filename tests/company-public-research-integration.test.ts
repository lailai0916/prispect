import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { deriveCompanyAssessment } from '../shared/company-assessment.js';
import {
  contextAmountFields,
  industryMetricKeys,
  type CompanyContextPeriod,
  type CompanyIndustrySnapshot,
} from '../shared/company-workspace.js';
import { runCompanyResearchAgent } from '../server/company-research-agent.js';

const sourceDate = '2026-09-30';
const privateMarkers = [
  'PRIVATE_ACCOUNT_MARKER',
  'PRIVATE_PLAN_MARKER',
  'PRIVATE_PREVIEW_MARKER',
  'PRIVATE_QUESTION_MARKER',
  'PRIVATE_PROFILE_MARKER',
  'PUBLIC_AUTHOR_NOT_REQUESTED',
  'PUBLIC_IP_NOT_REQUESTED',
];

function company(): CompanyResearchRun {
  const time = new Date().toISOString();
  const financialUrl = 'https://datacenter.eastmoney.com/public-financials';
  const run: CompanyResearchRun = {
    id: 'automatic-public-research',
    input: { securityCode: '300893', orgId: 'confirmed-public-org', year: 2025 },
    identity: {
      securityCode: '300893',
      orgId: 'confirmed-public-org',
      shortName: '松原安全',
      companyName: '浙江松原汽车安全系统股份有限公司',
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
      orgId: 'confirmed-public-org',
      companyName: '浙江松原汽车安全系统股份有限公司',
      fetchedAt: time,
      status: 'available',
      financials: [2023, 2024, 2025].map(
        (year): CompanyContextPeriod => ({
          period: `${year}-12-31`,
          annual: true,
          noticeDate: `${year + 1}-04-20`,
          amounts: {
            ...(Object.fromEntries(
              contextAmountFields.map((field) => [field, '10.00'])
            ) as CompanyContextPeriod['amounts']),
            revenue: `${800 + (year - 2023) * 100}.00`,
            netProfit: '100.00',
            ocf: '7.15',
            cash: '200.00',
            shortLoan: '100.00',
            currentPortionDebt: '30.00',
            receivables: '100.00',
            inventory: '80.00',
            totalAssets: '2000.00',
            totalLiabilities: '800.00',
          },
          ratios: { grossMargin: 25, roe: 20, revenueGrowth: null },
          auditOpinion: null,
          fieldSources: Object.fromEntries(contextAmountFields.map((field) => [field, '东方财富'])),
          sourceUrls: [financialUrl],
          originalUrl: null,
        })
      ),
      sources: [
        {
          id: 'existing-financials',
          provider: '东方财富',
          dimension: '年度合并财务',
          url: financialUrl,
          status: 'available',
          fetchedAt: time,
          latestDate: '2026-04-20',
          count: 3,
          responseHashes: ['a'.repeat(64)],
          note: '公开网页字段，未采用原件。',
        },
      ],
      comparisons: [],
      profile: { industry: '汽车零部件', privateNote: privateMarkers[4]! },
      shareholders: [],
      announcements: [],
      news: [],
      discussions: [],
      verificationLinks: [],
      warnings: [],
    },
  };
  run.assessment = deriveCompanyAssessment(run);
  Object.assign(run, {
    owner: privateMarkers[0],
    privatePlan: privateMarkers[1],
    preview: { privateUploadedDocument: privateMarkers[2] },
    questions: [{ privateQuestion: privateMarkers[3] }],
    assessmentFocus: '核对经营现金与公开讨论中的线索',
  });
  return run;
}

function industry(): CompanyIndustrySnapshot {
  return {
    version: 1,
    securityCode: '300893',
    period: '2025-12-31',
    industry: '汽车零部件',
    industryCode: 'public-industry',
    fetchedAt: new Date().toISOString(),
    status: 'available',
    peerCount: 5,
    minimumSamples: 5,
    metrics: Object.fromEntries(
      industryMetricKeys.map((key) => [
        key,
        { company: 20, mean: 15, median: 15, count: 5, missing: 0, difference: 5 },
      ])
    ) as CompanyIndustrySnapshot['metrics'],
    samples: [],
    sources: [{ url: 'https://datacenter.eastmoney.com/public-industry', sha256: 'b'.repeat(64) }],
    warnings: [],
  };
}

function publicSources(fail = false, readableNews = 4) {
  const calls: string[] = [];
  const bodies = new Map<string, string>();
  const sourceFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.href);
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    assert.equal(init?.body, undefined);
    for (const marker of privateMarkers) assert.ok(!url.href.includes(marker));
    if (fail) return new Response('PRIVATE_UPSTREAM_ERROR_MARKER', { status: 503 });
    if (url.hostname === 'search-api-web.eastmoney.com') {
      const query = JSON.parse(url.searchParams.get('param')!);
      assert.equal(query.keyword, '松原安全');
      assert.equal(query.param.cmsArticleWebOld.pageIndex, 1);
      return Response.json({
        hitsTotal: readableNews + 3,
        result: {
          cmsArticleWebOld: [
            ...Array.from({ length: readableNews }, (_, index) => ({
              title: `松原安全公开报道 ${index}`,
              date: `${sourceDate} 15:00:00`,
              url: `https://finance.eastmoney.com/a/202609301${String(index).padStart(9, '0')}.html`,
              content: index === 3 ? '' : `松原安全检索摘要 DIGEST_MARKER_${index}`,
              mediaName: '证券时报网',
            })),
            {
              title: '松原安全仅取得摘要的公开报道',
              date: sourceDate,
              url: 'https://www.cninfo.com.cn/public-news-digest',
              content: '松原安全未读全文的摘要 UNREAD_NEWS_DIGEST',
              mediaName: '公开目录',
            },
            {
              title: '松原安全仅取得标题的公开报道',
              date: sourceDate,
              url: 'https://www.cninfo.com.cn/public-news-headline',
              content: '',
              mediaName: '公开目录',
            },
            {
              title: '其他企业的经营报道 FOREIGN_ISSUER_MARKER',
              date: sourceDate,
              securityCode: '600519',
              url: 'https://finance.eastmoney.com/a/202609309999999999.html',
              content: '另一个企业的新闻',
              mediaName: '公开媒体',
            },
          ],
        },
      });
    }
    if (url.hostname === 'vip.stock.finance.sina.com.cn')
      return new Response('<html><ul></ul></html>');
    if (url.hostname === 'guba.eastmoney.com' && url.pathname.startsWith('/list,'))
      return new Response(
        `<script>var article_list=${JSON.stringify({
          bar_code: '300893',
          rc: 1,
          count: 6,
          re: Array.from({ length: 6 }, (_, index) => ({
            post_id: 1779000000 + index,
            stockbar_code: '300893',
            post_title: `经营讨论标题 ${index}`,
            post_publish_time: `${sourceDate} 15:00:00`,
            user_nickname: privateMarkers[5],
            post_ip_address: privateMarkers[6],
          })),
        })};</script>`
      );
    if (url.hostname === 'guba.eastmoney.com') {
      const id = url.pathname.match(/,(\d+)\.html$/)?.[1];
      assert.ok(id);
      if (id === '1779000005') return new Response('PRIVATE_BODY_FAILURE_MARKER', { status: 503 });
      return new Response(
        `<script>var post_article=${JSON.stringify({
          post_id: Number(id),
          post_guba: { stockbar_code: '300893' },
          post_title: `经营讨论标题 ${Number(id) - 1779000000}`,
          post_publish_time: `${sourceDate} 15:00:00`,
          post_content: `<p>PUBLIC_POST_BODY_${id} 个人猜测回款变化，尚需公告核对。</p>`,
          post_user: { nickname: privateMarkers[5], ip: privateMarkers[6] },
        })};</script>`
      );
    }
    if (url.hostname === 'finance.eastmoney.com') {
      const id = Number(url.pathname.match(/(\d{9})\.html$/)?.[1]);
      const body = `<title>松原安全公开经营报道</title><div class="infos">来源：证券时报网</div><div id="ContentBody"><p>松原安全 PUBLIC_MEDIA_BODY_${id} 媒体提及现金回款，需核对公司公告。</p></div>`;
      bodies.set(url.href, body);
      return new Response(body);
    }
    if (url.hostname === 'push2.eastmoney.com') {
      assert.equal(url.searchParams.get('secid'), '0.300893');
      return Response.json({
        rc: 0,
        data: {
          f57: '300893',
          f59: 2,
          f43: 2467,
          f44: 2530,
          f45: 2430,
          f169: -33,
          f170: -132,
          f116: 12_345_678_900,
          f86: Date.parse(`${sourceDate}T07:00:00.000Z`) / 1000,
        },
      });
    }
    throw Error(`Unexpected public fixture host: ${url.hostname}`);
  };
  return { fetch: sourceFetch, calls, bodies };
}

type PlanningRow = {
  id?: string;
  sourceId: string;
  title: string;
  text: string;
  textScope: string;
  includedCharacters: number;
  excerptReceipt?: { url: string; sha256: string; readAt: string };
};
type PlanningInput = {
  news: PlanningRow[];
  discussions: PlanningRow[];
  evidence: { id: string; kind: string; sourceQuality: string; quote?: string; url: string }[];
  grade: string;
  score: number;
  publicInformationCoverage: {
    mediaExcerptRecords: number;
    postExcerptRecords: number;
    headlineOnlyRecords: number;
    discussionTitleOnlyRecords: number;
    newsRecords: number;
    discussionRecords: number;
  };
  initialToolResults: { name: string; scope: string; result?: unknown }[];
};
const completedPlan = () =>
  Response.json({ choices: [{ message: { content: '公开资料已取得，转入综合分析。' } }] });

function checkedPlanning(
  check: (input: Parameters<typeof fetch>[0], init?: RequestInit) => Response | void
) {
  const failures: unknown[] = [];
  const modelFetch: typeof fetch = async (input, init) => {
    try {
      return check(input, init) || completedPlan();
    } catch (error) {
      failures.push(error);
    }
    return completedPlan();
  };
  return {
    fetch: modelFetch,
    verify: () => {
      if (failures.length) throw failures[0];
    },
  };
}

test('automatic public research reaches the first model turn with source-linked scopes and each body once', async () => {
  const run = company();
  const before = structuredClone(run);
  assert.notEqual(
    before.assessment!.grade,
    'NR',
    'the preserved grade has complete financial inputs'
  );
  const fixture = publicSources();
  let planningCalls = 0;
  const planning = checkedPlanning((_url, init) => {
    planningCalls++;
    assert.equal(fixture.calls.length, 14, 'all initial public reads precede model planning');
    const body = String(init?.body);
    const request = JSON.parse(body);
    const payload: PlanningInput = JSON.parse(request.messages[1].content);
    for (const marker of [
      ...privateMarkers,
      'MODEL_KEY_NOT_BODY',
      'FOREIGN_ISSUER_MARKER',
      'PRIVATE_BODY_FAILURE_MARKER',
    ])
      assert.ok(!body.includes(marker), marker);
    assert.equal(payload.news.length, 6);
    assert.equal(payload.discussions.length, 6);
    assert.equal(payload.grade, before.assessment!.grade);
    assert.equal(payload.score, before.assessment!.score);
    assert.deepEqual(payload.news.map((row) => row.textScope).sort(), [
      'digest',
      'headline',
      'media-excerpt',
      'media-excerpt',
      'media-excerpt',
      'media-excerpt',
    ]);
    assert.equal(payload.discussions.filter((row) => row.textScope === 'post-excerpt').length, 5);
    assert.equal(payload.discussions.filter((row) => row.textScope === 'title').length, 1);
    const evidence = new Map(payload.evidence.map((source) => [source.id, source]));
    for (const row of [...payload.news, ...payload.discussions]) {
      const source = evidence.get(row.sourceId);
      assert.ok(source, 'every packed public row has a retained evidence ID');
      assert.equal(source.quote, undefined, 'the model catalog does not repeat body text');
      assert.equal(row.includedCharacters, row.text.length);
      if (row.textScope === 'media-excerpt')
        assert.equal(
          source.sourceQuality,
          'headline',
          'media text remains a lead, not an official disclosure'
        );
      if (row.textScope === 'post-excerpt') assert.equal(source.sourceQuality, 'opinion');
      if (row.textScope === 'headline' || row.textScope === 'title') assert.equal(row.text, '');
    }
    for (const marker of [
      'PUBLIC_MEDIA_BODY_0',
      'PUBLIC_MEDIA_BODY_1',
      'PUBLIC_MEDIA_BODY_2',
      'PUBLIC_MEDIA_BODY_3',
      'UNREAD_NEWS_DIGEST',
      ...Array.from({ length: 5 }, (_, index) => `PUBLIC_POST_BODY_${1779000000 + index}`),
    ])
      assert.equal(body.split(marker).length - 1, 1, `${marker} appears only in its packed text`);
    assert.ok(!body.includes('DIGEST_MARKER_0'), 'read media text replaces its catalog digest');
    assert.ok(!body.includes('DIGEST_MARKER_1'));
    assert.ok(!body.includes('DIGEST_MARKER_2'));
    assert.ok(
      !body.includes('PUBLIC_POST_BODY_1779000005'),
      'a failed post read remains title-only'
    );
    assert.deepEqual(
      payload.initialToolResults.map((entry) => entry.name),
      ['collect_public_signals', 'get_market_quote']
    );
    assert.ok(payload.initialToolResults.every((entry) => entry.scope && !entry.result));
    assert.deepEqual(
      [
        payload.publicInformationCoverage.newsRecords,
        payload.publicInformationCoverage.discussionRecords,
        payload.publicInformationCoverage.mediaExcerptRecords,
        payload.publicInformationCoverage.postExcerptRecords,
        payload.publicInformationCoverage.headlineOnlyRecords,
        payload.publicInformationCoverage.discussionTitleOnlyRecords,
      ],
      [6, 6, 4, 5, 1, 1]
    );
    if (planningCalls === 2) {
      const followup = JSON.parse(request.messages.at(-1).content);
      assert.match(followup.reviewTask, /第二轮核查/);
      assert.equal(followup.news, undefined);
      assert.equal(followup.discussions, undefined);
      assert.equal(followup.evidence, undefined);
    }
  });
  const result = await runCompanyResearchAgent(
    run,
    { apiKey: 'MODEL_KEY_NOT_BODY', fetch: planning.fetch },
    {
      industry: async () => industry(),
      fetch: fixture.fetch,
    }
  );
  planning.verify();
  assert.equal(planningCalls, 2);
  assert.equal(result.modelCalls, 2);
  assert.equal(result.toolCalls, 2);
  assert.deepEqual(
    result.steps.map((step) => step.tool),
    ['collect_public_signals', 'get_market_quote', 'planning', 'planning']
  );
  assert.ok(result.steps.every((step) => step.status === 'completed'));
  assert.equal(result.run.context!.market!.price, '24.67');
  assert.equal(result.run.context!.market!.quotedAt, `${sourceDate}T07:00:00.000Z`);
  assert.equal(result.run.context!.publicSignals!.news.bodyRead, 4);
  assert.equal(result.run.context!.publicSignals!.discussions.bodyRead, 5);
  assert.equal(result.run.context!.publicSignals!.discussions.stopReason, 'source-failure');
  assert.equal(
    result.run.context!.discussions!.find((row) => row.id === 'guba-1779000005')!.textScope,
    'title'
  );
  assert.equal(
    result.run.context!.discussions!.find((row) => row.id === 'guba-1779000005')!.excerpt,
    undefined
  );
  assert.equal(
    result.run.context!.sources.find((source) => source.id === 'body-guba-1779000005')!.status,
    'error'
  );
  assert.deepEqual(run, before, 'automatic enrichment does not mutate the input run');
  assert.deepEqual(
    result.run.assessment,
    before.assessment,
    'research does not rewrite the saved grade'
  );
  assert.equal(deriveCompanyAssessment(result.run).grade, before.assessment!.grade);
  assert.equal(deriveCompanyAssessment(result.run).score, before.assessment!.score);
});

test('a configured planner reads a canonical known news source, reuses its receipt and blocks invented IDs', async () => {
  const run = company();
  const before = structuredClone(run);
  const fixture = publicSources(false, 10);
  let turns = 0;
  let target: { sourceId: string; catalogId: string; url: string } | undefined;
  let firstRead: { text: string; sha256: string; readAt: string; url: string } | undefined;
  const toolPlan = (calls: { id: string; sourceId: string }[]) =>
    Response.json({
      choices: [
        {
          message: {
            content: null,
            tool_calls: calls.map((call) => ({
              id: call.id,
              type: 'function',
              function: { name: 'read_news', arguments: JSON.stringify({ id: call.sourceId }) },
            })),
          },
        },
      ],
    });
  const planning = checkedPlanning((_url, init) => {
    turns++;
    const body = String(init?.body);
    const request = JSON.parse(body);
    for (const marker of [...privateMarkers, 'PRIVATE_BODY_FAILURE_MARKER'])
      assert.ok(!body.includes(marker));
    if (turns === 1) {
      assert.equal(fixture.calls.length, 18);
      const payload: PlanningInput = JSON.parse(request.messages[1].content);
      assert.equal(payload.news.filter((row) => row.textScope === 'media-excerpt').length, 8);
      const sources = new Map(payload.evidence.map((source) => [source.id, source]));
      const unread = payload.news.find(
        (row) =>
          row.textScope !== 'media-excerpt' &&
          new URL(sources.get(row.sourceId)!.url).hostname === 'finance.eastmoney.com'
      );
      assert.ok(unread, 'two media pages remain unread after the automatic eight-body sample');
      assert.match(unread.id!, /^public-news-[a-f0-9]{24}$/);
      assert.notEqual(unread.id, unread.sourceId);
      target = {
        sourceId: unread.sourceId,
        catalogId: unread.id!,
        url: sources.get(unread.sourceId)!.url,
      };
      assert.equal(fixture.bodies.has(target.url), false);
      return toolPlan([{ id: 'read-canonical-source', sourceId: target.sourceId }]);
    }
    assert.ok(target);
    const replies = new Map<
      string,
      {
        ok: boolean;
        result?: {
          reused?: boolean;
          news: {
            id: string;
            contentScope: string;
            url: string;
            excerpt: { text: string; sha256: string; readAt: string; url: string };
          };
        };
        error?: string;
      }
    >(
      request.messages
        .filter((message: { role: string }) => message.role === 'tool')
        .map((message: { tool_call_id: string; content: string }) => [
          message.tool_call_id,
          JSON.parse(message.content),
        ])
    );
    const read = replies.get('read-canonical-source');
    assert.equal(read?.ok, true, 'the tool reply is paired with the requesting call');
    assert.equal(read!.result!.news.id, target.catalogId);
    assert.equal(read!.result!.news.contentScope, 'media-excerpt');
    assert.equal(read!.result!.news.url, target.url);
    const excerpt = read!.result!.news.excerpt;
    assert.equal(excerpt.url, target.url);
    assert.equal(
      excerpt.sha256,
      createHash('sha256').update(fixture.bodies.get(target.url)!).digest('hex')
    );
    assert.match(excerpt.text, /PUBLIC_MEDIA_BODY_\d+/);
    assert.ok(Number.isFinite(Date.parse(excerpt.readAt)));
    const sourceUrl = target.url;
    assert.equal(fixture.calls.filter((url) => url === sourceUrl).length, 1);
    assert.equal(fixture.calls.length, 19);
    if (turns === 2) {
      firstRead = { ...excerpt };
      return toolPlan([
        { id: 'reuse-canonical-source', sourceId: target.sourceId },
        { id: 'block-invented-source', sourceId: 'news-invented-not-in-company-catalog' },
      ]);
    }
    assert.equal(turns, 3);
    const reused = replies.get('reuse-canonical-source');
    assert.equal(reused?.ok, true);
    assert.equal(reused!.result!.reused, true);
    assert.deepEqual(
      reused!.result!.news.excerpt,
      firstRead,
      'reuse keeps the original body, hash and read time'
    );
    assert.equal(replies.get('block-invented-source')?.ok, false);
    assert.ok(replies.get('block-invented-source')?.error);
  });
  const result = await runCompanyResearchAgent(
    run,
    { apiKey: 'MODEL_KEY_NOT_BODY', fetch: planning.fetch },
    { industry: async () => industry(), fetch: fixture.fetch }
  );
  planning.verify();
  assert.equal(turns, 3);
  assert.equal(result.modelCalls, 3);
  assert.equal(result.toolCalls, 5);
  assert.equal(
    fixture.calls.length,
    19,
    'reuse and invented IDs perform no extra network requests'
  );
  const updated = result.run.context!.news.find((row) => row.id === target!.catalogId)!;
  assert.equal(updated.contentScope, 'media-excerpt');
  assert.deepEqual(updated.excerpt, firstRead);
  assert.equal(result.run.context!.publicSignals!.news.bodyRead, 9);
  const source = result.run.context!.sources.find((row) => row.id === 'body-' + target!.catalogId)!;
  assert.equal(source.status, 'available');
  assert.equal(source.url, target!.url);
  assert.deepEqual(source.responseHashes, [firstRead!.sha256]);
  const reads = result.steps.filter((step) => step.tool === 'read_news');
  assert.deepEqual(
    reads.map((step) => step.status),
    ['completed', 'completed', 'failed']
  );
  assert.match(reads[1]!.summary, /复用.*未追加网络请求/);
  assert.deepEqual(run, before);
  assert.deepEqual(result.run.assessment, before.assessment);
});

test('unconfigured planning still performs public collection and quote retrieval with zero model calls', async () => {
  const run = company();
  const before = structuredClone(run);
  const fixture = publicSources();
  let cohortCalls = 0;
  const result = await runCompanyResearchAgent(
    run,
    {
      fetch: async () => {
        assert.fail('an unconfigured model must not receive a provider request');
      },
    },
    {
      industry: async () => {
        cohortCalls++;
        return industry();
      },
      fetch: fixture.fetch,
    }
  );
  assert.equal(fixture.calls.length, 14);
  assert.equal(cohortCalls, 1);
  assert.equal(result.modelCalls, 0);
  assert.equal(result.toolCalls, 3);
  assert.equal(result.run.context!.news.length, 6);
  assert.equal(result.run.context!.discussions!.length, 6);
  assert.equal(result.run.context!.publicSignals!.news.bodyRead, 4);
  assert.equal(result.run.context!.publicSignals!.discussions.bodyRead, 5);
  assert.equal(result.run.context!.market!.status, 'available');
  const planning = result.steps.find((step) => step.tool === 'planning');
  assert.equal(planning?.status, 'failed');
  assert.match(planning!.summary, /尚未配置.*未调用/);
  assert.deepEqual(run, before);
  assert.deepEqual(result.run.assessment, before.assessment);
  assert.equal(deriveCompanyAssessment(result.run).grade, before.assessment!.grade);
});

test('public source outages reach planning as unavailable coverage without fabricated texts or a grade change', async () => {
  const run = company();
  const before = structuredClone(run);
  const fixture = publicSources(true);
  let modelCalls = 0;
  const planning = checkedPlanning((_url, init) => {
    modelCalls++;
    const body = String(init?.body);
    const request = JSON.parse(body);
    const payload: PlanningInput = JSON.parse(request.messages[1].content);
    assert.deepEqual(payload.news, []);
    assert.deepEqual(payload.discussions, []);
    assert.equal(payload.publicInformationCoverage.mediaExcerptRecords, 0);
    assert.equal(payload.publicInformationCoverage.postExcerptRecords, 0);
    for (const marker of [...privateMarkers, 'PRIVATE_UPSTREAM_ERROR_MARKER'])
      assert.ok(!body.includes(marker));
  });
  const result = await runCompanyResearchAgent(
    run,
    { apiKey: 'MODEL_KEY_NOT_BODY', fetch: planning.fetch },
    { industry: async () => industry(), fetch: fixture.fetch }
  );
  planning.verify();
  assert.ok(fixture.calls.length > 0 && fixture.calls.length <= 72);
  assert.equal(modelCalls, 2);
  assert.equal(result.modelCalls, 2);
  assert.equal(result.run.context!.publicSignals!.news.stopReason, 'source-failure');
  assert.equal(result.run.context!.publicSignals!.discussions.stopReason, 'source-failure');
  assert.equal(result.run.context!.market!.status, 'unavailable');
  assert.equal(result.run.context!.market!.price, null);
  assert.ok(result.run.context!.sources.slice(1).every((source) => source.status === 'error'));
  assert.deepEqual(run, before);
  assert.deepEqual(result.run.assessment, before.assessment);
  assert.equal(deriveCompanyAssessment(result.run).grade, before.assessment!.grade);
});

test('the enriched research loop stops at six model turns and twenty-four actual tools', async () => {
  const run = company();
  const before = structuredClone(run);
  const fixture = publicSources();
  const requests: string[] = [];
  const result = await runCompanyResearchAgent(
    run,
    {
      apiKey: 'MODEL_KEY_NOT_BODY',
      fetch: async (_url, init) => {
        requests.push(String(init?.body));
        return Response.json({
          choices: [
            {
              message: {
                content: null,
                tool_calls: Array.from({ length: 4 }, (_, index) => ({
                  id: `bounded-archive-${requests.length}-${index}`,
                  type: 'function',
                  function: { name: 'search_disclosures', arguments: '{}' },
                })),
              },
            },
          ],
        });
      },
    },
    { industry: async () => industry(), fetch: fixture.fetch }
  );
  assert.equal(requests.length, 6);
  assert.equal(result.modelCalls, 6);
  assert.equal(result.toolCalls, 24, 'automatic collection and quote retrieval consume two tools');
  assert.equal(
    fixture.calls.length,
    14,
    'searching the retained archive does not perform fabricated extra public reads'
  );
  const archive = result.steps.filter((step) => step.tool === 'search_disclosures');
  assert.equal(archive.filter((step) => step.status === 'completed').length, 22);
  assert.equal(archive.filter((step) => step.status === 'failed').length, 2);
  assert.ok(
    archive.filter((step) => step.status === 'failed').every((step) => /上限/.test(step.summary))
  );
  for (const body of requests) {
    for (const marker of [...privateMarkers, 'PRIVATE_BODY_FAILURE_MARKER'])
      assert.ok(!body.includes(marker));
    assert.equal(body.split('PUBLIC_MEDIA_BODY_0').length - 1, 1);
    assert.equal(body.split('PUBLIC_POST_BODY_1779000000').length - 1, 1);
  }
  assert.deepEqual(run, before);
  assert.deepEqual(result.run.assessment, before.assessment);
});
