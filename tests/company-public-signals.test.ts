import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { CompanyResearchRun } from '../shared/contracts.js';
import type { CompanyDiscussion, CompanyNews } from '../shared/company-workspace.js';
import { PublicCompanyReader } from '../server/company-context-sources.js';
import {
  collectCompanyPublicSignals,
  readEmbeddedPublicJson,
  readKnownPublicNews,
  readKnownPublicPost,
  publicNewsCatalogId,
} from '../server/company-public-signals.js';

const date = '2026-09-30';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
function company(): CompanyResearchRun {
  const time = new Date().toISOString();
  return {
    id: 'public-signals-fixture',
    input: {
      securityCode: '300893',
      orgId: 'fixtureorg',
      year: 2025,
      purpose: 'external',
      useModel: true,
    },
    identity: {
      securityCode: '300893',
      orgId: 'fixtureorg',
      shortName: '松原安全',
      companyName: '浙江松原汽车安全系统股份有限公司',
      exchange: 'szse',
      sourceUrl: 'https://www.cninfo.com.cn/',
    },
    status: 'ready',
    createdAt: time,
    updatedAt: time,
    announcements: [],
    trace: [],
    model: { requested: true, status: 'not-called' },
    context: {
      version: 1,
      securityCode: '300893',
      orgId: 'fixtureorg',
      companyName: '浙江松原汽车安全系统股份有限公司',
      fetchedAt: time,
      status: 'available',
      financials: [],
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
function article(index: number) {
  return {
    title: `松原安全公开经营新闻 ${index}`,
    date: `${date} 15:00:00`,
    url: `https://finance.eastmoney.com/a/202609301${String(index).padStart(9, '0')}.html`,
    content: `<p>松原安全 ${index} 的原始报道摘要</p>`,
    mediaName: index % 2 ? '证券时报网' : '中国证券报',
  };
}
function post(index: number) {
  return {
    post_id: 1779000000 + index,
    stockbar_code: '300893',
    post_title: `公司经营讨论 ${index}`,
    post_publish_time: `${date} 15:00:00`,
    post_last_time: `${date} 15:01:00`,
    user_nickname: 'PUBLIC_AUTHOR_NOT_NEEDED',
    post_ip_address: 'PUBLIC_IP_NOT_NEEDED',
  };
}
type FixtureOptions = { newsTotal?: number; postTotal?: number; sina?: boolean };
function reader(options: FixtureOptions = {}) {
  const calls: string[] = [],
    bodies = new Map<string, string>();
  const instance = new PublicCompanyReader(
    {
      fetch: async (input) => {
        const url = new URL(String(input));
        calls.push(url.href);
        let body: string;
        if (url.hostname === 'search-api-web.eastmoney.com') {
          const query = JSON.parse(url.searchParams.get('param')!);
          const page = query.param.cmsArticleWebOld.pageIndex;
          const total = options.newsTotal ?? 999;
          const count = Math.max(0, Math.min(30, total - (page - 1) * 30));
          body = JSON.stringify({
            code: 0,
            hitsTotal: total,
            result: {
              cmsArticleWebOld: Array.from({ length: count }, (_, index) =>
                article((page - 1) * 30 + index)
              ),
            },
          });
        } else if (url.hostname === 'vip.stock.finance.sina.com.cn') {
          body =
            options.sina === false
              ? '<html><ul></ul></html>'
              : `<ul><li>${date} <a href="https://finance.sina.com.cn/stock/bxjj/2026-09-30/doc-fixture.shtml">松原安全新浪收录的新闻</a></li></ul>`;
        } else if (url.hostname === 'guba.eastmoney.com' && url.pathname.startsWith('/list,')) {
          const page = +(url.pathname.match(/_(\d+)\.html$/)?.[1] || 1),
            total = options.postTotal ?? 999;
          const count = Math.max(0, Math.min(80, total - (page - 1) * 80));
          body = `<script>var article_list=${JSON.stringify({ bar_code: '300893', rc: 1, count: total, re: Array.from({ length: count }, (_, index) => post((page - 1) * 80 + index)) })}; var notExecuted=1;</script>`;
        } else if (url.hostname === 'guba.eastmoney.com') {
          const id = url.pathname.match(/,(\d+)\.html$/)?.[1];
          body = `<script>var post_article=${JSON.stringify({ post_id: Number(id), post_guba: { stockbar_code: '300893' }, post_title: '个人对经营的看法', post_publish_time: `${date} 15:00:00`, post_content: '<p>我觉得可能回款改善，这是个人猜测。</p>', post_user: { privateSentinel: 'DO_NOT_FORWARD_AUTHOR' } })};</script>`;
        } else if (url.hostname === 'finance.eastmoney.com') {
          body =
            '<title>松原安全经营报道</title><div class="infos">2026年09月30日 15:00 来源：证券时报网</div><div id="ContentBody"><p>松原安全公布经营相关信息，报道提及回款和存货。媒体描述需要核对公告。</p></div>';
        } else if (url.hostname === 'finance.sina.com.cn') {
          body =
            '<h1>松原安全回购报道</h1><div class="source">格隆汇APP</div><div id="artibody">松原安全提出股份回购计划，执行情况尚待后续公告。</div>';
        } else throw Error(`UNEXPECTED_FIXTURE_HOST ${url.hostname}`);
        bodies.set(url.href, body);
        return new Response(body, { status: 200 });
      },
    },
    32
  );
  return { reader: instance, calls, bodies };
}
function knownPost(id = '1779000000'): CompanyDiscussion {
  return {
    id: `guba-${id}`,
    securityCode: '300893',
    title: '经营讨论',
    date,
    url: `https://guba.eastmoney.com/news,300893,${id}.html`,
    provider: '东方财富股吧',
    textScope: 'title',
  };
}

test('bulk signals use 26 real bounded requests, retain title versus body scope and never mutate or forward authors/private state', async () => {
  const run = company();
  Object.assign(run, {
    privatePlan: 'PRIVATE_PLAN_SENTINEL',
    preview: { value: 'PRIVATE_ORIGINAL_SENTINEL' },
  });
  const baseline = structuredClone(run),
    fixture = reader();
  const result = await collectCompanyPublicSignals(run, { reader: fixture.reader });
  assert.equal(fixture.calls.length, 26);
  assert.equal(fixture.reader.requests, 26);
  assert.equal(result.coverage.news.raw, 181);
  assert.equal(result.coverage.news.pages, 7);
  assert.equal(result.coverage.news.unique, 180);
  assert.equal(result.coverage.news.hitsTotal, 999);
  assert.equal(result.coverage.news.bodyRead, 8);
  assert.equal(result.coverage.news.stopReason, 'page-limit');
  assert.equal(result.coverage.discussions.raw, 240);
  assert.equal(result.coverage.discussions.unique, 240);
  assert.equal(result.coverage.discussions.bodyRead, 8);
  assert.equal(result.coverage.discussions.stopReason, 'page-limit');
  assert.equal(result.news.filter((item) => item.contentScope === 'media-excerpt').length, 8);
  assert.equal(result.discussions.filter((item) => item.textScope === 'post-excerpt').length, 8);
  assert.equal(result.discussions.filter((item) => item.textScope === 'title').length, 232);
  assert.equal(result.sources.length, 26);
  for (const source of result.sources) {
    assert.equal(source.status, source.count ? 'available' : 'empty');
    assert.equal(source.responseHashes[0], sha(fixture.bodies.get(source.url)!));
  }
  assert.deepEqual(run, baseline);
  const payload = JSON.stringify(result);
  for (const forbidden of [
    'PRIVATE_PLAN_SENTINEL',
    'PRIVATE_ORIGINAL_SENTINEL',
    'PUBLIC_AUTHOR_NOT_NEEDED',
    'PUBLIC_IP_NOT_NEEDED',
    'DO_NOT_FORWARD_AUTHOR',
  ])
    assert.ok(!payload.includes(forbidden));
  assert.ok(result.news.every((item) => item.id?.startsWith('public-news-')));
  assert.ok(result.discussions.every((item) => item.id.startsWith('guba-')));
});

test('actual hit totals and short pages stop pagination and catalog IDs determine all body reads', async () => {
  const fixture = reader({ newsTotal: 31, postTotal: 3, sina: false });
  const result = await collectCompanyPublicSignals(company(), { reader: fixture.reader });
  assert.equal(result.coverage.news.raw, 31);
  assert.equal(result.coverage.news.pages, 3); // Two Eastmoney pages and the separate Sina catalog.
  assert.equal(result.coverage.news.hitsTotal, 31);
  assert.equal(result.coverage.news.stopReason, 'complete');
  assert.equal(result.coverage.discussions.pages, 1);
  assert.equal(result.coverage.discussions.hitsTotal, 3);
  assert.equal(result.coverage.discussions.bodyRead, 3);
  assert.equal(fixture.calls.length, 15);
  assert.ok(!fixture.calls.some((url) => url.includes('300893_2.html')));
  assert.ok(result.sources.every((source) => /^[a-f0-9]{64}$/.test(source.responseHashes[0])));
});

test('source failures retain existing public entries, their valid excerpts and honest failed receipts', async () => {
  const run = company(),
    now = new Date().toISOString();
  run.context!.news = [
    {
      title: '松原安全已有新闻',
      date,
      media: '原媒体',
      provider: '新浪财经',
      digest: '',
      url: 'http://finance.eastmoney.com/a/202609301234567890.html',
      excerpt: {
        text: '已取得松原安全媒体正文。',
        url: 'https://finance.eastmoney.com/a/202609301234567890.html',
        sha256: 'a'.repeat(64),
        readAt: now,
      },
      contentScope: 'media-excerpt',
    },
  ];
  run.context!.discussions = [
    {
      ...knownPost(),
      excerpt: {
        text: '个人已有观点，尚未核实。',
        url: knownPost().url,
        sha256: 'b'.repeat(64),
        readAt: now,
      },
      textScope: 'post-excerpt',
    },
  ];
  const inputs = structuredClone(run);
  const failing = new PublicCompanyReader(
    {
      fetch: async () => {
        throw Error('PRIVATE_TRANSPORT_DIAGNOSTIC');
      },
    },
    32
  );
  const result = await collectCompanyPublicSignals(run, { reader: failing });
  assert.equal(result.news.length, 1);
  assert.equal(result.discussions.length, 1);
  assert.equal(result.coverage.news.stopReason, 'source-failure');
  assert.equal(result.coverage.discussions.stopReason, 'source-failure');
  assert.equal(result.coverage.news.bodyRead, 1);
  assert.equal(result.coverage.discussions.bodyRead, 1);
  assert.ok(result.sources.every((source) => source.status === 'error' && source.count === 0));
  assert.ok(!JSON.stringify(result).includes('PRIVATE_TRANSPORT_DIAGNOSTIC'));
  assert.equal(result.news[0].url, result.news[0].excerpt!.url);
  assert.deepEqual(run, inputs);
});

test('provided shared request limits and aborted deadlines stop before unbudgeted network work', async () => {
  const fixture = reader(),
    run = company();
  const constrained = new PublicCompanyReader(fixture.reader.dependencies, 4);
  constrained.requests = 1;
  const result = await collectCompanyPublicSignals(run, { reader: constrained });
  assert.equal(fixture.calls.length, 3);
  assert.equal(constrained.requests, 4);
  assert.equal(result.coverage.news.stopReason, 'request-budget');
  assert.equal(result.coverage.discussions.stopReason, 'request-budget');
  const controller = new AbortController();
  controller.abort();
  const quiet = reader();
  const aborted = await collectCompanyPublicSignals(run, {
    reader: quiet.reader,
    signal: controller.signal,
  });
  assert.equal(quiet.calls.length, 0);
  assert.equal(aborted.coverage.news.stopReason, 'deadline');
  assert.equal(aborted.coverage.discussions.stopReason, 'deadline');
});

test('catalog parsing ignores JavaScript and rejects executable literals rather than evaluating them', () => {
  const marker = 'PUBLIC_SIGNALS_EXECUTION_SENTINEL';
  const body = `<script>var article_list={"bar_code":"300893","re":[{"post_title":"Text }; { \\\" quoted"}]}; globalThis.${marker}=true;</script>`;
  assert.equal(readEmbeddedPublicJson(body, 'article_list').bar_code, '300893');
  assert.equal((globalThis as Record<string, unknown>)[marker], undefined);
  assert.throws(() =>
    readEmbeddedPublicJson('var article_list=(()=>({re:[]}))();', 'article_list')
  );
  assert.throws(() => readEmbeddedPublicJson('var post_article={bad:1};', 'post_article'));
});

test('unknown IDs, arbitrary news URLs, wrong ticker paths and unsupported issuers are refused before any request', async () => {
  const run = company(),
    fixture = reader();
  await assert.rejects(
    readKnownPublicNews(run, 'https://localhost/private', { reader: fixture.reader })
  );
  await assert.rejects(readKnownPublicPost(run, 'guba-123', { reader: fixture.reader }));
  run.context!.discussions = [
    { ...knownPost(), url: 'https://guba.eastmoney.com/news,600000,1779000000.html' },
  ];
  await assert.rejects(readKnownPublicPost(run, 'guba-1779000000', { reader: fixture.reader }));
  run.context!.news = [
    {
      title: '松原安全不可信地址',
      date,
      digest: '',
      media: '未知',
      provider: '未知',
      id: 'chosen-id',
      url: 'https://localhost/private',
    },
  ];
  await assert.rejects(readKnownPublicNews(run, 'chosen-id', { reader: fixture.reader }));
  run.identity!.exchange = 'bse';
  await assert.rejects(collectCompanyPublicSignals(run, { reader: fixture.reader }));
  assert.equal(fixture.calls.length, 0);
});

test('wrong issuer codes, lookalike companies and future dates do not become accepted news or forum posts', async () => {
  const run = company();
  const instance = new PublicCompanyReader({
    fetch: async (input) => {
      const url = new URL(String(input));
      if (url.hostname === 'search-api-web.eastmoney.com')
        return Response.json({
          hitsTotal: 4,
          result: {
            cmsArticleWebOld: [
              { ...article(1), securityCode: '600000' },
              { ...article(2), title: '松原城市生活', content: '吉林松原新闻，非企业资讯' },
              { ...article(3), date: '2099-12-31' },
              { ...article(4), title: '证券数据12030089399', content: '' },
            ],
          },
        });
      if (url.hostname === 'vip.stock.finance.sina.com.cn') return new Response('<ul></ul>');
      return new Response(
        `<script>var article_list=${JSON.stringify({
          bar_code: '300893',
          rc: 1,
          count: 2,
          re: [
            { ...post(1), stockbar_code: '600000' },
            { ...post(2), post_publish_time: '2099-12-31 15:00:00' },
          ],
        })};</script>`
      );
    },
  });
  const result = await collectCompanyPublicSignals(run, { reader: instance });
  assert.equal(result.coverage.news.raw, 4);
  assert.equal(result.coverage.news.accepted, 0);
  assert.equal(result.news.length, 0);
  assert.equal(result.coverage.discussions.accepted, 0);
  assert.equal(result.discussions.length, 0);
});

test('body parsers validate known post identity and withhold unrelated or missing media content', async () => {
  const run = company();
  run.context!.discussions = [knownPost()];
  const wrong = new PublicCompanyReader({
    fetch: async () =>
      new Response(
        `<script>var post_article=${JSON.stringify({ post_id: 1779000000, post_guba: { stockbar_code: '600000' }, post_title: 'Wrong company', post_publish_time: `${date} 15:00:00`, post_content: 'Wrong content' })};</script>`
      ),
  });
  await assert.rejects(readKnownPublicPost(run, knownPost().id, { reader: wrong }), /主体不匹配/);
  const full = reader({ newsTotal: 1, postTotal: 0, sina: false });
  const catalog = await collectCompanyPublicSignals(run, { reader: full.reader });
  run.context!.news = catalog.news;
  const unrelated = new PublicCompanyReader({
    fetch: async () =>
      new Response('<title>其他公司</title><div id="ContentBody">其他公司发言。</div>'),
  });
  await assert.rejects(
    readKnownPublicNews(run, catalog.news[0].id!, { reader: unrelated }),
    /匹配主体/
  );
});

test('deduplication keeps source-bound cached bodies and richer real summaries without collapsing distinct titles', async () => {
  const run = company(),
    example = article(0),
    now = new Date().toISOString();
  run.context!.news = [
    {
      title: example.title,
      date,
      media: '证券时报网',
      provider: '东方财富',
      digest: '短摘要',
      url: `${example.url}?utm_source=tracking`,
      excerpt: {
        text: '松原安全真实媒体正文',
        url: example.url,
        sha256: 'c'.repeat(64),
        readAt: now,
      },
    },
    {
      title: '松原安全同一事件的不同观点',
      date,
      media: '另一个媒体',
      provider: '新浪财经',
      digest: '',
      url: 'https://finance.sina.com.cn/stock/bxjj/2026-09-30/doc-independent.shtml',
    },
  ];
  const fixture = reader({ newsTotal: 2, postTotal: 0, sina: false });
  const result = await collectCompanyPublicSignals(run, { reader: fixture.reader });
  assert.equal(result.news.length, 3);
  assert.equal(result.news.filter((row) => row.title === example.title).length, 1);
  assert.equal(
    result.news.find((row) => row.title === example.title)?.excerpt?.sha256,
    'c'.repeat(64)
  );
  assert.ok(!fixture.calls.includes(example.url));
  assert.ok(result.news.some((row) => row.title === '松原安全同一事件的不同观点'));
});

test('invalid and future cached excerpts downgrade to title or digest and cannot masquerade as acquired bodies', async () => {
  const run = company();
  run.context!.news = [
    {
      title: '松原安全假正文',
      date,
      media: '未知',
      provider: '未知',
      digest: '松原安全的旧摘要',
      url: 'https://example.com/public-news',
      contentScope: 'media-excerpt',
      excerpt: {
        text: '假全文',
        url: 'https://example.com/public-news',
        sha256: 'a'.repeat(64),
        readAt: '2099-12-31T00:00:00Z',
      },
    },
  ];
  run.context!.discussions = [
    {
      ...knownPost(),
      textScope: 'post-excerpt',
      excerpt: {
        text: '未来假正文',
        url: knownPost().url,
        sha256: 'b'.repeat(64),
        readAt: '2099-12-31T00:00:00Z',
      },
    },
  ];
  const controller = new AbortController();
  controller.abort();
  const result = await collectCompanyPublicSignals(run, {
    reader: reader().reader,
    signal: controller.signal,
  });
  assert.equal(result.news[0].contentScope, 'digest');
  assert.equal(result.news[0].excerpt, undefined);
  assert.equal(result.discussions[0].textScope, 'title');
  assert.equal(result.discussions[0].excerpt, undefined);
});

test('HTTP-successful but invalid bodies retain their response hash and failure scope without promoting catalog entries', async () => {
  const base = reader({ newsTotal: 1, postTotal: 1, sina: false });
  const invalidNews = '<title>其他公司</title><div id="ContentBody">其他公司报道</div>';
  const invalidPost =
    '<script>var post_article={"post_id":1779000000,"post_guba":{"stockbar_code":"600000"},"post_content":"错误主体"};</script>';
  const instance = new PublicCompanyReader(
    {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.hostname === 'finance.eastmoney.com') return new Response(invalidNews);
        if (url.hostname === 'guba.eastmoney.com' && url.pathname.startsWith('/news,'))
          return new Response(invalidPost);
        return base.reader.dependencies.fetch!(input, init);
      },
    },
    32
  );
  const result = await collectCompanyPublicSignals(company(), { reader: instance });
  const failed = result.sources.filter((source) => source.status === 'error');
  assert.equal(failed.length, 2);
  assert.deepEqual(
    new Set(failed.flatMap((source) => source.responseHashes)),
    new Set([sha(invalidNews), sha(invalidPost)])
  );
  assert.ok(failed.every((source) => source.count === 0));
  assert.equal(result.news[0].contentScope, 'digest');
  assert.equal(result.news[0].excerpt, undefined);
  assert.equal(result.discussions[0].textScope, 'title');
  assert.equal(result.discussions[0].excerpt, undefined);
  assert.equal(result.coverage.news.bodyRead, 0);
  assert.equal(result.coverage.discussions.bodyRead, 0);
  assert.equal(result.coverage.news.stopReason, 'source-failure');
  assert.equal(result.coverage.discussions.stopReason, 'source-failure');
});

test('automatic body reading covers finance and operations clues beyond the latest trading headlines while retaining the full catalog', async () => {
  const base = reader({ newsTotal: 30, postTotal: 10, sina: false });
  const fetched: string[] = [];
  const instance = new PublicCompanyReader(
    {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        fetched.push(url.href);
        if (url.hostname === 'search-api-web.eastmoney.com')
          return Response.json({
            hitsTotal: 30,
            result: {
              cmsArticleWebOld: Array.from({ length: 30 }, (_, index) => ({
                ...article(index),
                title:
                  index === 29
                    ? '松原安全经营现金、存货和回款资料'
                    : `松原安全股价涨停讨论 ${index}`,
                content:
                  index === 29 ? '松原安全现金流、应收账款与库存资料。' : '松原安全股票交易信息。',
                mediaName: index === 29 ? '独立财经媒体' : '同一交易媒体',
              })),
            },
          });
        if (url.hostname === 'guba.eastmoney.com' && url.pathname.startsWith('/list,'))
          return new Response(
            `<script>var article_list=${JSON.stringify({ bar_code: '300893', rc: 1, count: 10, re: Array.from({ length: 10 }, (_, index) => ({ ...post(index), post_title: index === 9 ? '经营现金与回款的疑问' : `明天股票会涨吗 ${index}` })) })};</script>`
          );
        return base.reader.dependencies.fetch!(input, init);
      },
    },
    32
  );
  const result = await collectCompanyPublicSignals(company(), { reader: instance });
  assert.ok(fetched.includes(article(29).url));
  assert.ok(fetched.includes(knownPost('1779000009').url));
  assert.equal(result.news.length, 30);
  assert.equal(result.discussions.length, 10);
  assert.equal(result.coverage.news.bodyRead, 8);
  assert.equal(result.coverage.discussions.bodyRead, 8);
  assert.equal(result.news.filter((row) => !row.excerpt).length, 22);
  assert.equal(result.discussions.filter((row) => !row.excerpt).length, 2);
});

test('topic-search catalog IDs remain readable after HTTP, tracking and article URL normalization', async () => {
  const run = company(),
    fixture = reader();
  const canonical = article(4).url,
    tracked = canonical.replace(/^https:/, 'http:') + '?utm_source=query&from=search#headline';
  const id = publicNewsCatalogId(tracked);
  assert.equal(id, publicNewsCatalogId(canonical));
  run.context!.news = [
    {
      id,
      title: '松原安全目录中的经营报道',
      date,
      media: '证券时报网',
      provider: '东方财富',
      digest: '松原安全的实际摘要',
      url: tracked,
    },
  ];
  const read = await readKnownPublicNews(run, id, { reader: fixture.reader });
  assert.equal(read.news.id, id);
  assert.equal(read.news.url, canonical);
  assert.equal(read.news.excerpt!.url, canonical);
  assert.deepEqual(fixture.calls, [canonical]);
  assert.throws(() => publicNewsCatalogId('http://user:private@localhost/a'));
});
