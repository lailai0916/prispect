import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { CompanyResearchRun } from '../shared/contracts.js';
import type { CompanyNews } from '../shared/company-workspace.js';
import { publicNewsCatalogId } from '../server/company-public-signals.js';
import { runCompanyResearchAgent } from '../server/company-research-agent.js';

function news(index: number, date = '2026-09-30', prefix = '202609301'): CompanyNews {
  const url = `https://finance.eastmoney.com/a/${prefix}${String(index).padStart(9, '0')}.html`;
  return {
    id: publicNewsCatalogId(url),
    title: `松原安全已有经营资料 ${index}`,
    date,
    media: '测试原媒体',
    provider: '东方财富',
    url,
    digest: '松原安全公开经营摘要',
    contentScope: 'digest',
  };
}
function company(): CompanyResearchRun {
  const time = new Date().toISOString();
  const existing = Array.from({ length: 180 }, (_, index) => news(index));
  existing[179] = {
    ...existing[179],
    contentScope: 'media-excerpt',
    excerpt: {
      text: '松原安全先前取得的媒体正文，仍需官方核对。',
      url: existing[179].url,
      sha256: 'a'.repeat(64),
      readAt: time,
    },
  };
  return {
    id: 'research-catalog-fixture',
    input: {
      securityCode: '300893',
      orgId: 'catalogorg',
      year: 2025,
      purpose: 'external',
      useModel: true,
    },
    identity: {
      securityCode: '300893',
      orgId: 'catalogorg',
      shortName: '松原安全',
      companyName: '松原安全股份有限公司',
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
      orgId: 'catalogorg',
      companyName: '松原安全股份有限公司',
      fetchedAt: time,
      status: 'available',
      financials: [],
      sources: [],
      comparisons: [],
      profile: {},
      shareholders: [],
      announcements: [],
      news: existing,
      discussions: [],
      verificationLinks: [],
      warnings: [],
      publicSignals: {
        fetchedAt: time,
        news: {
          raw: 180,
          accepted: 180,
          unique: 180,
          pages: 6,
          hitsTotal: 180,
          bodyRead: 1,
          oldest: '2026-09-30',
          latest: '2026-09-30',
          stopReason: 'page-limit',
        },
        discussions: {
          raw: 0,
          accepted: 0,
          unique: 0,
          pages: 0,
          hitsTotal: 0,
          bodyRead: 0,
          oldest: null,
          latest: null,
          stopReason: 'complete',
        },
      },
    },
  };
}
type Request = { messages: { role: string; content: string; tool_call_id?: string }[] };
type Action = { name: string; arguments: Record<string, unknown> };
const action = (name: string, args: Record<string, unknown>): Action => ({ name, arguments: args });
function resultOf(request: Request, turn: number) {
  const message = request.messages.find(
    (message) => message.role === 'tool' && message.tool_call_id === `catalog-${turn}`
  );
  assert.ok(message, 'The earlier tool response must remain in the real planning conversation.');
  return JSON.parse(message.content);
}
const body =
  '<title>松原安全经营报道</title><div id="ContentBody">松原安全的媒体报道涉及经营现金与回款；报道陈述需要核对官方公告。</div>';
async function replay(
  run: CompanyResearchRun,
  plan: ((request: Request) => Action | null)[],
  queries: Record<string, CompanyNews[]> = {}
) {
  let turns = 0;
  const network: string[] = [],
    requests: Request[] = [];
  const baseline = structuredClone(run);
  const result = await runCompanyResearchAgent(
    run,
    {
      apiKey: 'LOCAL_TEST_STUB_NOT_GROK',
      model: 'DETERMINISTIC_TEST_ONLY',
      fetch: async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as Request;
        requests.push(request);
        const next = plan[turns++]?.(request);
        return Response.json({
          choices: [
            {
              message: next
                ? {
                    content: null,
                    tool_calls: [
                      {
                        id: `catalog-${turns}`,
                        type: 'function',
                        function: { name: next.name, arguments: JSON.stringify(next.arguments) },
                      },
                    ],
                  }
                : { content: 'Local planning stub stopped.' },
            },
          ],
        });
      },
    },
    {
      collectPublicSignals: false,
      industry: async () => {
        throw Error('This isolated regression does not select industry');
      },
      fetch: async (input) => {
        const url = new URL(String(input));
        network.push(url.href);
        if (url.hostname === 'finance.eastmoney.com') return new Response(body);
        assert.equal(url.hostname, 'search-api-web.eastmoney.com');
        const query = JSON.parse(url.searchParams.get('param')!);
        const topic = query.keyword.replace(/^松原安全 /, ''),
          all = queries[topic] || [];
        const page = query.param.cmsArticleWebOld.pageIndex;
        return Response.json({
          hitsTotal: all.length,
          result: {
            cmsArticleWebOld: all.slice((page - 1) * 30, page * 30).map((row) => ({
              title: row.title,
              date: row.date,
              url: row.url,
              content: row.digest,
              mediaName: row.media,
            })),
          },
        });
      },
    }
  );
  assert.deepEqual(run, baseline, 'Research must enrich only its public copy.');
  return { ...result, network, requests };
}
function rows(count: number, date: string, prefix: string, label: string) {
  return Array.from({ length: count }, (_, index) => ({
    ...news(index, date, prefix),
    title: `松原安全${label} ${index}`,
  }));
}

test('newer topic results preserve already-read sources and refresh retained coverage within the 180-entry limit', async () => {
  const run = company(),
    cached = run.context!.news[179];
  const result = await replay(run, [() => action('search_news', { topic: '现金流' }), () => null], {
    现金流: rows(30, '2026-10-02', '202610021', '最新现金流线索'),
  });
  assert.equal(result.network.length, 1);
  assert.equal(result.run.context!.news.length, 180);
  assert.equal(
    result.run.context!.news.find((row) => row.id === cached.id)?.excerpt?.sha256,
    cached.excerpt!.sha256
  );
  assert.equal(result.run.context!.publicSignals!.news.bodyRead, 1);
  assert.equal(result.run.context!.publicSignals!.news.unique, 180);
  assert.equal(result.run.context!.publicSignals!.news.latest, '2026-10-02');
  assert.equal(
    result.run.context!.publicSignals!.news.raw,
    180,
    'The original bulk phase count is distinct from later query receipts.'
  );
  assert.equal(result.run.context!.sources[0].count, 30);
});

test('older selected-year topic IDs remain readable and their real body hash enters the retained snapshot', async () => {
  const result = await replay(
    company(),
    [
      () => action('search_news', { topic: '回款' }),
      (request) => action('read_news', { id: resultOf(request, 1).result.news[0].id }),
      () => null,
    ],
    { 回款: rows(30, '2025-10-01', '202510011', '年度回款资料') }
  );
  assert.equal(result.network.length, 2);
  assert.equal(result.steps.find((step) => step.tool === 'read_news')?.status, 'completed');
  const read = result.run.context!.news.find((row) => row.date === '2025-10-01' && row.excerpt);
  assert.ok(read);
  assert.equal(read.excerpt!.sha256, createHash('sha256').update(body).digest('hex'));
  assert.equal(read.excerpt!.url, result.network[1]);
  assert.equal(result.run.context!.publicSignals!.news.bodyRead, 2);
  assert.equal(result.run.context!.publicSignals!.news.oldest, '2025-10-01');
  assert.equal(result.run.context!.news.length, 180);
});

test('a prior tool-returned ID survives later query eviction and is restored by source-bound reading', async () => {
  let requestedId = '';
  const result = await replay(
    company(),
    [
      () => action('search_news', { topic: '回款' }),
      (request) => {
        requestedId = resultOf(request, 1).result.news[0].id;
        return action('search_news', { topic: '库存' });
      },
      () => action('read_news', { id: requestedId }),
      () => null,
    ],
    {
      回款: rows(30, '2025-10-01', '202510011', '年度回款资料'),
      库存: rows(90, '2026-10-02', '202610021', '近期库存资料'),
    }
  );
  assert.equal(result.network.length, 5); // One page, three pages, then the known official-host media page.
  assert.equal(result.steps.find((step) => step.tool === 'read_news')?.status, 'completed');
  assert.ok(result.run.context!.news.find((row) => row.id === requestedId)?.excerpt);
  assert.equal(result.run.context!.news.length, 180);
  assert.equal(result.run.context!.publicSignals!.news.bodyRead, 2);
  assert.equal(result.run.context!.publicSignals!.news.oldest, '2025-10-01');
});

test('updated titles for an existing canonical URL do not duplicate IDs or make the returned source unreadable', async () => {
  const run = company();
  const updated = run.context!.news.slice(0, 30).map((row, index) => ({
    ...row,
    title: `松原安全更新后的回款报道 ${index}`,
    date: '2026-10-02',
    url: row.url.replace(/^https:/, 'http:') + '?utm_source=topic',
  }));
  const result = await replay(
    run,
    [
      () => action('search_news', { topic: '回款' }),
      (request) => action('read_news', { id: resultOf(request, 1).result.news[0].id }),
      () => null,
    ],
    { 回款: updated }
  );
  assert.equal(result.steps.find((step) => step.tool === 'read_news')?.status, 'completed');
  assert.equal(result.network.length, 2);
  assert.equal(result.run.context!.news.filter((row) => row.id === updated[0].id).length, 1);
  assert.equal(
    new Set(result.run.context!.news.map((row) => publicNewsCatalogId(row.url))).size,
    result.run.context!.news.length
  );
  assert.ok(result.run.context!.news.find((row) => row.id === updated[0].id)?.excerpt);
});

test('model citation IDs resolve to one known catalog source and arbitrary IDs cannot trigger a page read', async () => {
  const run = company();
  const result = await replay(run, [
    (request) => {
      const payload = JSON.parse(request.messages[1].content);
      return action('read_news', { id: payload.news[0].sourceId });
    },
    () => action('read_news', { id: 'news-ffffffffffffffffffffffff' }),
    () => null,
  ]);
  assert.equal(result.network.length, 1);
  assert.equal(result.network[0], run.context!.news[0].url);
  const stages = result.steps.filter((step) => step.tool === 'read_news');
  assert.equal(stages[0].status, 'completed');
  assert.equal(stages[1].status, 'failed');
  assert.equal(result.run.context!.publicSignals!.news.bodyRead, 2);
});
