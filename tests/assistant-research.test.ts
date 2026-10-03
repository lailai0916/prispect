import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { contextAmountFields } from '../shared/company-workspace.js';
import { deriveCompanyAssessment } from '../shared/company-assessment.js';
import { researchAssistantCompany, wantsAssistantResearch } from '../server/assistant-research.js';

const published = '2026-10-02';
function company(): CompanyResearchRun {
  const time = '2026-10-02T00:00:00.000Z';
  const run: CompanyResearchRun = {
    id: 'assistant-company',
    input: { securityCode: '600519', orgId: 'fixture-maotai', year: 2025, useModel: true },
    identity: {
      securityCode: '600519',
      orgId: 'fixture-maotai',
      shortName: '贵州茅台',
      companyName: '贵州茅台酒股份有限公司',
      exchange: 'sse',
      sourceUrl: 'https://www.cninfo.com.cn/',
    },
    status: 'ready',
    createdAt: time,
    updatedAt: time,
    announcements: [],
    trace: [],
    model: { requested: true, status: 'completed' },
    context: {
      version: 1,
      securityCode: '600519',
      orgId: 'fixture-maotai',
      companyName: '贵州茅台酒股份有限公司',
      fetchedAt: time,
      status: 'available',
      financials: [
        {
          period: '2025-12-31',
          annual: true,
          noticeDate: null,
          amounts: Object.fromEntries(contextAmountFields.map((key) => [key, null])) as Record<
            (typeof contextAmountFields)[number],
            string | null
          >,
          ratios: { grossMargin: null, roe: null, revenueGrowth: null },
          auditOpinion: null,
          fieldSources: {},
          sourceUrls: [],
          originalUrl: null,
        },
      ],
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
  run.assessment = deriveCompanyAssessment(run);
  return run;
}
function article(index: number) {
  return {
    title: `贵州茅台经营新闻${index}`,
    date: `${published} 12:00:00`,
    url: `https://finance.eastmoney.com/a/202610021${String(index).padStart(9, '0')}.html`,
    content: '贵州茅台公开回款新闻摘要',
    mediaName: '测试媒体',
    securityCode: '600519',
  };
}
function fixture(newsCount = 5) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url: url.href, init });
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal instanceof AbortSignal);
    if (url.hostname === 'search-api-web.eastmoney.com') {
      const query = JSON.parse(url.searchParams.get('param')!);
      assert.equal(query.keyword, '贵州茅台');
      assert.equal(query.param.cmsArticleWebOld.pageIndex, 1);
      return Response.json({
        code: 0,
        result: {
          cmsArticleWebOld: [
            ...Array.from({ length: newsCount }, (_, index) => article(index + 1)),
            { ...article(20), securityCode: '300893' },
            { ...article(21), url: 'https://localhost/private' },
            { ...article(22), title: '其他企业', content: '' },
          ],
        },
      });
    }
    if (url.hostname === 'finance.eastmoney.com')
      return new Response(
        '<title>贵州茅台经营新闻</title><div class="infos">来源：测试媒体</div><div id="ContentBody">贵州茅台公开经营报道正文，仅为媒体线索。</div>'
      );
    if (url.hostname === 'www.cninfo.com.cn') {
      const form = new URLSearchParams(String(init?.body));
      assert.equal(form.get('stock'), '600519,fixture-maotai');
      assert.equal(form.get('pageNum'), '1');
      const row = {
        secCode: '600519',
        orgId: 'fixture-maotai',
        announcementId: 'known-disclosure',
        announcementTitle: '贵州茅台公开业绩公告',
        announcementTime: Date.parse(`${published}T04:00:00Z`),
        adjunctUrl: 'finalpage/2026-10-02/123456789.pdf',
      };
      return Response.json({ announcements: [row, { ...row, orgId: 'another-issuer' }] });
    }
    if (url.hostname === 'guba.eastmoney.com' && url.pathname.startsWith('/list,'))
      return new Response(
        `<script>var article_list=${JSON.stringify({
          bar_code: '600519',
          rc: 1,
          count: 1,
          re: [
            {
              post_id: 1779000000,
              stockbar_code: '600519',
              post_title: '个人经营猜测',
              post_publish_time: `${published} 12:00:00`,
              user_nickname: 'PRIVATE_POSTER_PROFILE',
            },
          ],
        })};</script>`
      );
    if (url.hostname === 'guba.eastmoney.com' && url.pathname.startsWith('/news,'))
      return new Response(
        `<script>var post_article=${JSON.stringify({
          post_id: 1779000000,
          post_guba: { stockbar_code: '600519' },
          post_title: '个人经营猜测',
          post_publish_time: `${published} 12:00:00`,
          post_content: '可能回款改善，这是个人猜测。',
          post_user: { nickname: 'PRIVATE_POSTER_PROFILE' },
        })};</script>`
      );
    assert.fail(`Unexpected public request: ${url.href}`);
  };
  return { fetch, calls };
}

test('only explicit public-source questions trigger research; financial questions and supplied URLs do not', async () => {
  for (const question of [
    '查一下最新茅台新闻',
    '搜索资料',
    '查阅最新公告',
    '读一下公开讨论帖子',
    'Search recent company news',
  ])
    assert.equal(wantsAssistantResearch(question), true, question);
  for (const question of [
    '现金利润比是多少',
    '怎么使用文档',
    '已有财务评级是什么',
    '读取新闻 https://localhost/private',
  ])
    assert.equal(wantsAssistantResearch(question), false, question);
  const run = company();
  const result = await researchAssistantCompany(run, '现金利润比是多少', {
    fetch: async () => assert.fail('Existing facts need no source retrieval'),
  });
  assert.equal(result.run, run);
  assert.equal(result.research.toolCalls, 0);
});

test('latest company news uses four real fixed-source calls, actual body citations and an immutable public clone', async () => {
  const run = company(),
    before = structuredClone(run),
    api = fixture();
  Object.defineProperty(run, 'preview', {
    get: () => assert.fail('Private originals must never be read'),
  });
  Object.defineProperty(run, 'questions', {
    get: () => assert.fail('Previous account questions must never be read'),
  });
  const result = await researchAssistantCompany(run, '查一下最新茅台新闻', { fetch: api.fetch });
  assert.equal(result.research.status, 'completed');
  assert.equal(result.research.toolCalls, 4);
  assert.equal(api.calls.length, 4);
  assert.equal(result.run.context!.news.length, 5);
  assert.equal(result.run.context!.news.filter((row) => row.excerpt).length, 3);
  assert.ok(result.research.sources.some((row) => row.label.includes('正文节选')));
  assert.ok(
    result.research.sources.every((row) => new URL(row.url).hostname === 'finance.eastmoney.com')
  );
  assert.ok(
    result.run.context!.sources.every((row) =>
      row.responseHashes.every((hash) => /^[a-f0-9]{64}$/.test(hash))
    )
  );
  assert.deepEqual(run.context, before.context);
  assert.deepEqual(result.run.assessment, before.assessment);
  assert.deepEqual(result.run.context!.financials, before.context!.financials);
  assert.equal(result.run.context!.fetchedAt, before.context!.fetchedAt);
  assert.ok(!Object.hasOwn(result.run, 'preview'));
  assert.ok(!Object.hasOwn(result.run, 'questions'));
});

test('generic source searches keep code/org-filtered announcements and public discussion opinions within four calls', async () => {
  const run = company(),
    before = structuredClone(run),
    api = fixture(1);
  const result = await researchAssistantCompany(run, '搜索资料', { fetch: api.fetch });
  assert.equal(api.calls.length, 4);
  assert.equal(result.research.toolCalls, 4);
  assert.equal(result.run.context!.announcements.length, 1);
  assert.equal(result.run.context!.discussions!.length, 1);
  assert.ok(result.research.sources.some((row) => row.label.includes('原文未读取')));
  assert.ok(result.research.sources.some((row) => row.label.includes('未核实观点')));
  assert.ok(!JSON.stringify(result).includes('PRIVATE_POSTER_PROFILE'));
  assert.deepEqual(run, before);
});

test('public discussion reads accept only issuer-specific acquired IDs and preserve personal-opinion scope', async () => {
  const api = fixture();
  const result = await researchAssistantCompany(company(), '读一下公开讨论帖子', {
    fetch: api.fetch,
  });
  assert.equal(api.calls.length, 2);
  assert.equal(result.research.status, 'completed');
  assert.equal(result.run.context!.discussions![0].textScope, 'post-excerpt');
  assert.match(result.research.sources[0].label, /未核实观点/);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_POSTER_PROFILE'));
});

test('failed, oversized and empty sources return unavailable with a warning, while body failures preserve partial evidence', async () => {
  for (const fetch of [
    async () => new Response('failure', { status: 503 }),
    async () => new Response('large', { headers: { 'Content-Length': '2000001' } }),
    async () => Response.json({ code: 0, result: { cmsArticleWebOld: [] } }),
  ] satisfies (typeof globalThis.fetch)[]) {
    const result = await researchAssistantCompany(company(), '搜索最新新闻', { fetch });
    assert.equal(result.research.status, 'unavailable');
    assert.equal(result.research.toolCalls, 1);
    assert.deepEqual(result.research.sources, []);
    assert.ok(result.warning);
    assert.ok(!result.run.context!.news.length);
  }
  const api = fixture(1);
  const result = await researchAssistantCompany(company(), '搜索最新新闻', {
    fetch: async (input, init) =>
      new URL(String(input)).hostname === 'finance.eastmoney.com'
        ? new Response('<title>其他公司</title><div id="ContentBody">无关正文</div>')
        : api.fetch(input, init),
  });
  assert.equal(result.research.status, 'partial');
  assert.equal(result.research.toolCalls, 2);
  assert.equal(result.run.context!.news[0].contentScope, 'digest');
  assert.match(result.warning!, /正文未取得/);
});

test('mismatched issuer, organization, year and unsupported exchanges stop before fetching', async () => {
  const variants = [
    (run: CompanyResearchRun) => {
      run.context!.securityCode = '300893';
    },
    (run: CompanyResearchRun) => {
      run.context!.orgId = 'other-issuer';
    },
    (run: CompanyResearchRun) => {
      run.input.year = 2024;
    },
    (run: CompanyResearchRun) => {
      run.identity!.exchange = 'us';
    },
    (run: CompanyResearchRun) => {
      run.identity!.exchange = 'unknown';
    },
    (run: CompanyResearchRun) => {
      run.input.securityCode = run.context!.securityCode = run.identity!.securityCode = '320193';
    },
  ];
  for (const change of variants) {
    const run = company();
    change(run);
    await assert.rejects(() =>
      researchAssistantCompany(run, '搜索最新新闻', {
        fetch: async () => assert.fail('Unconfirmed scope must not fetch'),
      })
    );
  }
  const controller = new AbortController();
  controller.abort();
  const result = await researchAssistantCompany(company(), '搜索资料', {
    signal: controller.signal,
    fetch: async () => assert.fail('Aborted research must not fetch'),
  });
  assert.equal(result.research.status, 'unavailable');
  assert.equal(result.research.toolCalls, 0);
  assert.match(result.warning!, /中止/);
});

test('cancellation returns promptly even when an injected public transport ignores its abort signal', async () => {
  const controller = new AbortController();
  const result = await researchAssistantCompany(company(), '搜索资料', {
    signal: controller.signal,
    fetch: async () => {
      controller.abort();
      return new Promise<Response>(() => undefined);
    },
  });
  assert.equal(result.research.status, 'unavailable');
  assert.equal(result.research.toolCalls, 1);
  assert.match(result.warning!, /中止/);
});
