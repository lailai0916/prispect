import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { CompanyResearchRun } from '../shared/contracts.js';
import type { AssessmentResearchStep } from '../shared/company-assessment.js';
import { buildAssessmentPublicPayload as richPublicPayload } from '../server/company-assessment.js';
import {
  contextAmountFields,
  industryMetricKeys,
  type CompanyIndustrySnapshot,
} from '../shared/company-workspace.js';
import type { ModelConfig } from '../server/model.js';
import { runCompanyResearchAgent as researchAgent } from '../server/company-research-agent.js';
import {
  buildCompanyResearchAgenda,
  selectCompanyReviewDisclosures,
} from '../server/company-research-policy.js';

// Isolate existing targeted-tool tests; the default full collection is covered separately.
const runCompanyResearchAgent = (...args: Parameters<typeof researchAgent>) =>
  researchAgent(args[0], args[1], { ...args[2], collectPublicSignals: false });

function company(): CompanyResearchRun {
  const time = '2026-10-02T00:00:00.000Z';
  return {
    id: 'research-public-run',
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
      orgId: 'fixtureorg',
      companyName: '测试股份有限公司',
      fetchedAt: time,
      status: 'available',
      financials: Array.from({ length: 10 }, (_, index) => ({
        period: `${2018 + index}-12-31`,
        annual: true,
        noticeDate: `${2019 + index}-04-01`,
        amounts: {
          ...Object.fromEntries(contextAmountFields.map((field) => [field, '10.00'])),
          revenue: '1000.00',
          netProfit: '100.00',
          ocf: '7.15',
          cash: '200.00',
          shortLoan: '100.00',
          currentPortionDebt: '30.00',
          receivables: '100.00',
          inventory: '80.00',
          totalAssets: '2000.00',
          totalLiabilities: '800.00',
        } as any,
        ratios: { grossMargin: 25, roe: 20, revenueGrowth: 0 },
        auditOpinion: null,
        fieldSources: { revenue: '公开财务来源', netProfit: '公开财务来源', ocf: '公开财务来源' },
        sourceUrls: ['https://www.cninfo.com.cn/public-financials'],
        originalUrl: null,
      })),
      sources: [
        {
          id: 'financial-source',
          provider: '公开财务来源',
          dimension: '合并年度财务',
          url: 'https://www.cninfo.com.cn/public-financials',
          status: 'available',
          fetchedAt: time,
          latestDate: '2026-04-01',
          count: 10,
          note: '公开网页字段，未采用原件证据',
          responseHashes: ['a'.repeat(64)],
        },
      ],
      comparisons: [],
      profile: {},
      shareholders: [],
      announcements: [
        {
          id: 'cninfo-12345',
          title: '关于本次担保事项的公告',
          date: '2026-09-29',
          url: 'https://static.cninfo.com.cn/finalpage/2026-09-29/12345.pdf',
          sources: [
            {
              provider: '巨潮资讯',
              url: 'https://static.cninfo.com.cn/finalpage/2026-09-29/12345.pdf',
            },
          ],
          category: '担保',
          attention: 'high',
          matched: '担保',
          meaning: '',
          nextQuestion: '',
        },
        {
          id: 'cninfo-routine',
          title: '常规董事会公告',
          date: '2026-09-30',
          url: 'https://static.cninfo.com.cn/finalpage/2026-09-30/12346.pdf',
          sources: [],
          category: '常规',
          attention: 'routine',
          matched: '',
          meaning: '',
          nextQuestion: '',
        },
      ],
      news: [],
      verificationLinks: [],
      warnings: [],
    },
  };
}
function industry(code = '300893', period = '2025-12-31'): CompanyIndustrySnapshot {
  return {
    version: 1,
    securityCode: code,
    period,
    industry: '汽车零部件',
    industryCode: 'BK0001',
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
function samplePdf(pageCount = 4) {
  const text =
    'This actual disclosure describes operating debt and guarantee exposure with a dated source statement.';
  const stream = `BT /F1 12 Tf 20 200 Td (${text}) Tj ET`,
    font = pageCount + 3,
    content = pageCount + 4;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${i + 3} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    ...Array.from(
      { length: pageCount },
      () =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 300] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`
    ),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let result = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(result));
    result += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const start = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(result);
}
const call = (name: string, args: Record<string, unknown> = {}, id = name) => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});
const plan = (calls: ReturnType<typeof call>[]) =>
  new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: calls } }] }));
const done = () =>
  new Response(
    JSON.stringify({ choices: [{ message: { content: '研究资料已取得，转入分析。' } }] })
  );
const config = (fetch: typeof globalThis.fetch): ModelConfig => ({
  apiKey: 'private-key-sentinel',
  fetch,
});

const secrets = [
  'PRIVATE_ACCOUNT_SENTINEL',
  'PRIVATE_DECISION_SENTINEL',
  'PRIVATE_MATERIAL_SENTINEL',
  'PRIVATE_QUESTION_SENTINEL',
  'PRIVATE_PREVIEW_SENTINEL',
];

test('Grok performs a real multi-turn research loop with source-bound news, exact metrics, industry and PDF citations', async () => {
  const run = company();
  Object.assign(run, {
    owner: secrets[0],
    decisions: secrets[1],
    privateMaterials: secrets[2],
    questions: secrets[3],
    preview: { secret: secrets[4] },
    assessmentFocus: '现金回款与担保风险',
  });
  const before = structuredClone(run),
    pdf = samplePdf();
  let modelCalls = 0,
    industryCalls = 0,
    sourceCalls = 0;
  const events: AssessmentResearchStep[] = [];
  const result = await runCompanyResearchAgent(
    run,
    {
      ...config(async (url, init) => {
        modelCalls++;
        assert.equal(String(url), 'https://tokenflux.dev/v1/chat/completions');
        assert.equal(init?.redirect, 'error');
        const request = JSON.parse(String(init?.body));
        assert.equal(request.model, 'grok-4.7-fast');
        assert.equal(request.service_tier, 'default');
        assert.deepEqual(
          request.tools.map((tool: { function: { name: string } }) => tool.function.name).sort(),
          [
            'collect_public_signals',
            'fetch_industry',
            'get_financial_history',
            'get_market_quote',
            'read_disclosure',
            'read_discussion',
            'read_news',
            'search_disclosures',
            'search_discussions',
            'search_news',
          ].sort()
        );
        assert.equal(request.tool_choice, 'auto');
        for (const secret of [...secrets, 'private-key-sentinel'])
          assert.ok(!String(init?.body).includes(secret));
        const initial = JSON.parse(request.messages[1].content);
        assert.equal(initial.researchGoal, '现金回款与担保风险');
        assert.equal(initial.coverage.years, 6);
        assert.equal(initial.financials.length, 6);
        assert.ok(
          initial.financials.every(
            (row: { period: string }) => Number(row.period.slice(0, 4)) <= 2025
          )
        );
        assert.ok(
          !initial.metrics.some((item: { id: string }) => /^(2018|2019|2026|2027)-/.test(item.id))
        );
        if (modelCalls === 1)
          return plan([
            call('get_financial_history'),
            call('fetch_industry'),
            call('search_disclosures', { topic: '担保' }),
            call('search_news', { topic: '回款' }),
          ]);
        const toolResults = request.messages
          .filter((item: { role: string }) => item.role === 'tool')
          .map((item: { content: string }) => JSON.parse(item.content));
        assert.ok(toolResults.every((item: { ok: boolean }) => item.ok));
        assert.equal(toolResults[0].result.financials.length, 6);
        if (modelCalls === 2) {
          assert.equal(toolResults[2].result.matches[0].id, 'cninfo-12345');
          assert.equal(toolResults[3].result.news.length, 2);
          return plan([call('read_disclosure', { id: toolResults[2].result.matches[0].id })]);
        }
        const original = toolResults.at(-1).result;
        assert.equal(original.excerpt.page, 1);
        assert.equal(original.excerpt.pagesRead, 3);
        assert.equal(original.filePages, 4);
        assert.equal(original.excerpt.sha256, createHash('sha256').update(pdf).digest('hex'));
        assert.match(original.excerpt.quote, /actual disclosure/);
        return done();
      }),
      serviceTier: 'default',
    },
    {
      industry: async (code, period, dependencies) => {
        industryCalls++;
        assert.equal(code, '300893');
        assert.equal(period, '2025-12-31');
        assert.ok(dependencies?.signal);
        return industry(code, period);
      },
      onStep: async (step) => {
        events.push(step);
      },
      fetch: async (url, init) => {
        sourceCalls++;
        assert.equal(init?.redirect, 'error');
        const target = new URL(String(url));
        if (target.hostname === 'search-api-web.eastmoney.com') {
          const query = JSON.parse(target.searchParams.get('param')!);
          assert.equal(query.keyword, '测试公司 回款');
          assert.equal(query.param.cmsArticleWebOld.pageSize, 30);
          return Response.json({
            result: {
              cmsArticleWebOld: [
                {
                  title: '<em>测试公司</em>披露回款改善',
                  content: '测试公司公开回款新闻摘要',
                  date: '2026-09-30',
                  mediaName: '来源媒体',
                  url: 'https://finance.sina.com.cn/news-1',
                },
                {
                  title: '测试公司现金经营更新',
                  content: '公开摘要',
                  date: '2026-09-29',
                  mediaName: '来源媒体',
                  url: 'https://finance.sina.com.cn/news-2',
                },
                {
                  title: '相似测试新公司回款改善',
                  content: '另一企业的信息',
                  date: '2026-09-30',
                  url: 'https://finance.sina.com.cn/wrong',
                },
                {
                  title: '测试公司代码不一致',
                  date: '2026-09-30',
                  securityCode: '600519',
                  url: 'https://finance.sina.com.cn/wrong-code',
                },
                {
                  title: '测试公司未来新闻',
                  date: '2099-09-30',
                  url: 'https://finance.sina.com.cn/future',
                },
              ],
            },
          });
        }
        assert.equal(String(url), run.context!.announcements[0]!.url);
        return new Response(new Uint8Array(pdf), {
          headers: { 'Content-Type': 'application/pdf' },
        });
      },
    }
  );
  assert.equal(result.modelCalls, 3);
  assert.equal(result.toolCalls, 5);
  assert.equal(modelCalls, 3);
  assert.equal(industryCalls, 1);
  assert.equal(sourceCalls, 2);
  assert.equal(result.run.context!.news.length, 2);
  assert.equal(result.run.context!.announcements[0]!.excerpt?.pagesRead, 3);
  assert.ok(
    result.run.context!.sources.some(
      (source) => source.id.startsWith('agent-news-') && source.responseHashes[0]?.length === 64
    )
  );
  assert.equal(result.steps.length, 8);
  assert.ok(result.steps.every((step) => step.status === 'completed' && step.finishedAt));
  assert.equal(events.length, 16);
  assert.ok(
    events.every((event, index) =>
      index % 2 ? event.status === 'completed' : event.status === 'running'
    )
  );
  assert.deepEqual(
    run,
    before,
    'research enriches a copy without mutating original evidence or private workspace'
  );
});

test('unknown tools, fabricated IDs, arbitrary URLs and argument injection cannot execute source requests', async () => {
  const run = company();
  run.context!.announcements[1]!.url = 'https://evil.example/redirect.pdf';
  let calls = 0,
    sources = 0,
    industries = 0;
  const result = await runCompanyResearchAgent(
    run,
    config(async () =>
      ++calls === 1
        ? plan([
            call('execute_browser', { url: 'https://evil.example/' }),
            call('read_disclosure', { id: 'https://evil.example/private.pdf' }, 'url'),
            call('read_disclosure', { id: 'fabricated-ID' }, 'fake'),
            call('read_disclosure', { id: 'cninfo-routine' }, 'known-unapproved-url'),
            call('search_news', { topic: 'https://evil.example/' }),
            call('fetch_industry', { url: 'https://evil.example/' }),
          ])
        : done()
    ),
    {
      industry: async () => {
        industries++;
        return industry();
      },
      fetch: async () => {
        sources++;
        throw Error('must-not-fetch');
      },
    }
  );
  assert.equal(result.toolCalls, 6);
  assert.equal(sources, 0);
  assert.equal(industries, 0);
  assert.equal(result.steps.filter((step) => step.status === 'failed').length, 6);
  assert.ok(!JSON.stringify(result.steps).includes('evil.example'));
  assert.deepEqual(result.run.context?.news, []);
});

test('planning receives nulled conflicts rather than contradictory financial amounts and cannot overwrite them', async () => {
  const run = company();
  run.context!.comparisons.push({
    period: '2025-12-31',
    field: 'ocf',
    primary: '7.15',
    secondary: '900.00',
    difference: '892.85',
    matches: false,
  });
  let calls = 0;
  const result = await runCompanyResearchAgent(
    run,
    config(async (_url, init) => {
      calls++;
      const request = JSON.parse(String(init?.body));
      const payload = JSON.parse(request.messages[1].content);
      assert.equal(payload.grade, 'NR');
      assert.equal(
        payload.financials.find((row: { period: string }) => row.period === '2025-12-31').amounts
          .ocf,
        null
      );
      assert.equal(
        payload.metrics.find((metric: { id: string }) => metric.id === '2025-ocf').value,
        null
      );
      if (calls === 1) return plan([call('get_financial_history')]);
      const toolResult = JSON.parse(
        request.messages.find((message: { role: string }) => message.role === 'tool').content
      );
      assert.equal(
        toolResult.result.metrics.find((metric: { id: string }) => metric.id === 'cash-profit')
          .status,
        'conflict'
      );
      return done();
    }),
    { industry: async () => industry() }
  );
  assert.equal(
    result.run.context!.financials.find((row) => row.period === '2025-12-31')!.amounts.ocf,
    '7.15'
  );
  assert.deepEqual(result.run.context!.comparisons, run.context!.comparisons);
});

test('missing model still attempts actual same-year industry once, while complete matching samples are reused', async () => {
  const run = company();
  let calls = 0,
    modelCalls = 0;
  const options = {
    industry: async (code: string, period: string) => {
      calls++;
      return industry(code, period);
    },
  };
  const missing = await runCompanyResearchAgent(
    run,
    {
      fetch: async () => {
        modelCalls++;
        return done();
      },
    },
    options
  );
  assert.equal(calls, 1);
  assert.equal(modelCalls, 0);
  assert.equal(missing.modelCalls, 0);
  assert.equal(missing.toolCalls, 1);
  assert.equal(missing.steps[0]!.status, 'failed');
  assert.match(missing.steps[0]!.summary, /尚未配置/);
  assert.equal(missing.run.industry?.['2025-12-31']?.securityCode, '300893');
  const reused = await runCompanyResearchAgent(missing.run, {}, options);
  assert.equal(calls, 1);
  assert.equal(reused.toolCalls, 0);
  const failed = await runCompanyResearchAgent(
    run,
    {},
    {
      industry: async () => {
        throw Error('secret-transport-body');
      },
    }
  );
  assert.equal(failed.steps[1]!.status, 'failed');
  assert.equal(failed.run.industry, undefined);
  assert.ok(!JSON.stringify(failed.steps).includes('secret-transport-body'));
});

test('unsupported or mismatched issuers and missing context never trigger planning or research', async () => {
  let calls = 0;
  const model = config(async () => {
    calls++;
    return done();
  });
  for (const alter of [
    (run: CompanyResearchRun) => {
      delete run.context;
    },
    (run: CompanyResearchRun) => {
      run.context!.securityCode = '600519';
    },
    (run: CompanyResearchRun) => {
      run.context!.orgId = 'otherorg';
    },
    (run: CompanyResearchRun) => {
      run.identity!.securityCode = '600519';
    },
    (run: CompanyResearchRun) => {
      run.identity!.exchange = 'bse';
    },
    (run: CompanyResearchRun) => {
      run.informationGap = { name: '未确认主体', reason: '无法核对' };
    },
  ]) {
    const run = company();
    alter(run);
    const result = await runCompanyResearchAgent(run, model, {
      industry: async () => {
        calls++;
        return industry();
      },
    });
    assert.equal(result.modelCalls, 0);
    assert.equal(result.toolCalls, 0);
    assert.deepEqual(result.steps, []);
  }
  assert.equal(calls, 0);
});

test('research enforces twenty-four tool executions and six PDF attempts independently of provider instructions', async () => {
  const run = company();
  run.context!.announcements = Array.from({ length: 24 }, (_, index) => ({
    ...run.context!.announcements[0]!,
    id: `cninfo-${index}`,
    url: `https://static.cninfo.com.cn/finalpage/2026-09-29/${10000 + index}.pdf`,
  }));
  let modelCalls = 0,
    reads = 0;
  const result = await runCompanyResearchAgent(
    run,
    config(async () => {
      modelCalls++;
      return plan(
        run.context!.announcements.map((row) => call('read_disclosure', { id: row.id }, row.id))
      );
    }),
    {
      industry: async () => industry(),
      fetch: async () => {
        reads++;
        return new Response('bounded refusal', { headers: { 'content-length': '8000001' } });
      },
    }
  );
  assert.equal(modelCalls, 1);
  assert.equal(result.modelCalls, 1);
  assert.equal(result.toolCalls, 24);
  assert.equal(reads, 6);
  assert.equal(
    result.steps.filter((step) => step.tool === 'read_disclosure' && step.status === 'failed')
      .length,
    24
  );
  assert.equal(result.steps.length, 25);
  assert.equal(
    result.steps.filter((step) => step.tool === 'read_disclosure' && /上限/.test(step.summary))
      .length,
    18,
    'eighteen planned reads are blocked after six actual PDF attempts'
  );
  assert.equal(
    result.run.context!.sources.filter((source) => source.id.startsWith('agent-disclosure-'))
      .length,
    6
  );
  assert.ok(result.steps.slice(-2).every((step) => /上限/.test(step.summary)));
  assert.ok(result.run.context!.announcements.every((row) => !row.excerpt));
});

test('planning stops after six actual model turns and passes correctly paired tool call IDs on follow-ups', async () => {
  let calls = 0;
  const result = await runCompanyResearchAgent(
    company(),
    config(async (_url, init) => {
      calls++;
      const request = JSON.parse(String(init?.body));
      const requests = request.messages.filter(
        (message: { role: string }) => message.role === 'assistant'
      );
      const results = request.messages.filter(
        (message: { role: string }) => message.role === 'tool'
      );
      assert.deepEqual(
        requests.flatMap((message: { tool_calls: { id: string }[] }) =>
          message.tool_calls.map((item) => item.id)
        ),
        results.map((message: { tool_call_id: string }) => message.tool_call_id)
      );
      return plan([call('get_financial_history', {}, `financial-${calls}`)]);
    }),
    { industry: async () => industry() }
  );
  assert.equal(calls, 6);
  assert.equal(result.modelCalls, 6);
  assert.equal(result.toolCalls, 6);
  assert.equal(
    result.steps.filter((step) => step.tool === 'planning' && step.status === 'completed').length,
    6
  );
  assert.equal(
    result.steps.filter(
      (step) => step.tool === 'get_financial_history' && step.status === 'completed'
    ).length,
    6
  );
});

test('malformed model responses, excessive bodies and HTTP failure preserve public records without exposing provider secrets', async () => {
  const run = company();
  const responses = [
    () => new Response('private-provider-sentinel', { status: 503 }),
    () => new Response('private-provider-sentinel', { status: 401 }),
    () => new Response('not-json'),
    () => Response.json({ choices: [] }),
    () => new Response('bounded refusal', { headers: { 'content-length': '1000001' } }),
    () =>
      plan([
        call('get_financial_history', {}, 'duplicate'),
        call('search_disclosures', {}, 'duplicate'),
      ]),
  ];
  for (const response of responses) {
    const result = await runCompanyResearchAgent(
      run,
      config(async () => response()),
      { industry: async () => industry() }
    );
    assert.equal(result.modelCalls, 1);
    assert.equal(result.toolCalls, 0);
    assert.equal(result.steps.length, 1);
    assert.equal(result.steps[0]!.status, 'failed');
    assert.deepEqual(result.run.context, run.context);
    assert.ok(!JSON.stringify(result.steps).includes('private-provider-sentinel'));
  }
});

test('planning timeout records truthful failure; external cancellation and progress-persistence failure propagate', async () => {
  const run = company();
  const timed = await runCompanyResearchAgent(
    run,
    {
      ...config(
        async (_url, init) =>
          new Promise((_resolve, reject) => {
            const guard = setTimeout(() => reject(Error('test guard')), 1000);
            init!.signal!.addEventListener(
              'abort',
              () => {
                clearTimeout(guard);
                reject(new DOMException('secret-transport', 'AbortError'));
              },
              { once: true }
            );
          })
      ),
      timeoutMs: 10,
    },
    { industry: async () => industry() }
  );
  assert.equal(timed.steps[0]!.status, 'failed');
  assert.match(timed.steps[0]!.summary, /超时/);
  assert.ok(!JSON.stringify(timed.steps).includes('secret-transport'));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runCompanyResearchAgent(
      run,
      config(async () => done()),
      { industry: async () => industry(), signal: controller.signal }
    ),
    { name: 'AbortError' }
  );
  await assert.rejects(
    runCompanyResearchAgent(
      run,
      config(async () => done()),
      {
        industry: async () => industry(),
        onStep: async () => {
          throw Error('storage-secret');
        },
      }
    ),
    /COMPANY_PROGRESS_STORAGE/
  );
  let calls = 0;
  await assert.rejects(
    runCompanyResearchAgent(
      run,
      config(async () => {
        calls++;
        return plan([call('get_financial_history')]);
      }),
      {
        industry: async () => industry(),
        onStep: async (step) => {
          if (step.status === 'completed') throw Error('storage-secret');
        },
      }
    ),
    /COMPANY_PROGRESS_STORAGE/
  );
  assert.equal(calls, 1, 'a failed progress write does not become a successful in-memory stage');
});

test('stale industry is refreshed once and wrong-period or wrong-issuer returned cohorts are withheld', async () => {
  const run = company();
  run.industry = {
    '2025-12-31': { ...industry(), fetchedAt: new Date(Date.now() - 25 * 3600000).toISOString() },
  };
  let requests = 0;
  const refreshed = await runCompanyResearchAgent(
    run,
    {},
    {
      industry: async () => {
        requests++;
        return industry();
      },
    }
  );
  assert.equal(requests, 1);
  assert.equal(refreshed.toolCalls, 1);
  assert.notEqual(
    refreshed.run.industry!['2025-12-31']!.fetchedAt,
    run.industry['2025-12-31']!.fetchedAt
  );
  for (const peer of [industry('600519'), industry('300893', '2024-12-31')]) {
    const invalid = await runCompanyResearchAgent(company(), {}, { industry: async () => peer });
    assert.equal(invalid.run.industry, undefined);
    assert.equal(invalid.steps.at(-1)?.status, 'failed');
    assert.match(invalid.steps.at(-1)!.summary, /主体或期间不一致/);
  }
});

test('disclosure search covers the complete retained archive including relevant records after the first 530', async () => {
  const run = company();
  run.context!.announcements = Array.from({ length: 1100 }, (_, index) => ({
    ...run.context!.announcements[1]!,
    id: `archive-${index}`,
    title: index === 1099 ? '重要回款变化公告' : '常规公告',
    category: index === 1099 ? '回款' : '常规',
  }));
  let calls = 0;
  const result = await runCompanyResearchAgent(
    run,
    config(async (_url, init) => {
      calls++;
      if (calls === 1) return plan([call('search_disclosures', { topic: '回款' })]);
      const request = JSON.parse(String(init?.body));
      const value = JSON.parse(
        request.messages.find((message: { role: string }) => message.role === 'tool').content
      );
      assert.equal(value.result.archiveCount, 1100);
      assert.equal(value.result.matches.length, 1);
      assert.equal(value.result.matches[0].id, 'archive-1099');
      return done();
    }),
    { industry: async () => industry() }
  );
  assert.equal(result.toolCalls, 1);
  assert.equal(result.steps[1]?.status, 'completed');
});

test('real topic searches retain up to 180 unique company news items and report actual response hashes', async () => {
  const run = company();
  let models = 0,
    searches = 0;
  const topics = ['回款', '债务', '经营'];
  const pages: { topic: string; page: number }[] = [];
  const responseHashes = new Map<string, string[]>();
  const result = await runCompanyResearchAgent(
    run,
    config(async (_url, init) => {
      if (++models === 1)
        return plan([
          call('search_news', { topic: '回款' }, 'collections'),
          call('search_news', { topic: '债务' }, 'debt'),
          call('search_news', { topic: '经营' }, 'operations'),
        ]);
      const request = JSON.parse(String(init?.body));
      const tools = request.messages
        .filter((message: { role: string }) => message.role === 'tool')
        .map((message: { content: string }) => JSON.parse(message.content));
      assert.equal(tools.length, 3);
      for (const [index, tool] of tools.entries()) {
        assert.equal(tool.ok, true);
        assert.equal(tool.result.news.length, 90);
        assert.equal(tool.result.receipt.accepted, 90);
        assert.equal(tool.result.receipt.pagesRead, 3);
        assert.deepEqual(tool.result.receipt.responseHashes, responseHashes.get(topics[index]!));
      }
      return done();
    }),
    {
      industry: async () => industry(),
      fetch: async (url) => {
        searches++;
        const target = new URL(String(url));
        assert.equal(target.hostname, 'search-api-web.eastmoney.com');
        const request = JSON.parse(target.searchParams.get('param')!);
        const topic = String(request.keyword).slice('测试公司 '.length);
        const topicIndex = topics.indexOf(topic);
        assert.ok(topicIndex >= 0);
        const page = request.param.cmsArticleWebOld.pageIndex;
        assert.equal(request.param.cmsArticleWebOld.pageSize, 30);
        assert.ok(page >= 1 && page <= 3);
        pages.push({ topic, page });
        const offset = topicIndex * 90 + (page - 1) * 30;
        const response = {
          hitsTotal: 90,
          result: {
            cmsArticleWebOld: Array.from({ length: 30 }, (_, index) => ({
              title: `测试公司公开新闻 ${offset + index}`,
              content: '公司公开新闻摘要',
              date: '2026-09-30',
              mediaName: '公开媒体',
              url: `https://finance.sina.com.cn/news-${offset + index}`,
            })),
          },
        };
        const hash = createHash('sha256').update(JSON.stringify(response)).digest('hex');
        responseHashes.set(topic, [...(responseHashes.get(topic) || []), hash]);
        return Response.json(response);
      },
    }
  );
  assert.equal(models, 2);
  assert.equal(result.modelCalls, 2);
  assert.equal(result.toolCalls, 3);
  assert.equal(searches, 9);
  assert.deepEqual(
    pages,
    topics.flatMap((topic) => [1, 2, 3].map((page) => ({ topic, page })))
  );
  assert.equal(result.run.context!.news.length, 180);
  assert.equal(new Set(result.run.context!.news.map((row) => row.title)).size, 180);
  assert.equal(new Set(result.run.context!.news.map((row) => row.url)).size, 180);
  const receipts = result.run.context!.sources.filter((source) =>
    source.id.startsWith('agent-news-')
  );
  assert.equal(receipts.length, 3);
  assert.ok(receipts.every((source) => source.count === 90 && source.responseHashes.length === 3));
  for (const [index, source] of receipts.entries()) {
    assert.deepEqual(source.responseHashes, responseHashes.get(topics[index]!));
    assert.equal(source.status, 'available');
  }
});

test('an optional diagnostic callback failure cannot turn a model failure into a rejected research job', async () => {
  const result = await runCompanyResearchAgent(
    company(),
    {
      ...config(async () => new Response('private-service-body', { status: 503 })),
      onFailure: async () => {
        throw Error('private-diagnostic-message');
      },
    },
    { industry: async () => industry() }
  );
  assert.equal(result.modelCalls, 1);
  assert.equal(result.steps[0]!.status, 'failed');
  assert.ok(!JSON.stringify(result.steps).includes('private-'));
});

test('a large six-year, 530-disclosure public snapshot reaches all three planning turns without repeating full context', async () => {
  const run = company(),
    snapshot = run.context!;
  const financialUrl = (table: number) =>
    `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_F10_FINANCE_${table}&filter=SECURITY_CODE300893&columns=${'FINANCIAL_FIELD,'.repeat(65)}`;
  snapshot.companyName = '浙江测试汽车安全系统股份有限公司';
  snapshot.profile = {
    orgName: snapshot.companyName,
    industry: '汽车零部件',
    business: '公开经营范围与业务说明。'.repeat(300),
    description: '公开企业经营情况及适用范围。'.repeat(250),
  };
  snapshot.sources = Array.from({ length: 16 }, (_, index) => ({
    ...snapshot.sources[0]!,
    id: ['em-income', 'em-cashflow', 'em-balance'][index] || `public-source-${index}`,
    provider: '东方财富',
    dimension: `财务及公开来源 ${index}`,
    url: financialUrl(index),
    count: 6,
  }));
  for (const row of snapshot.financials) {
    row.sourceUrls = Array.from({ length: 7 }, (_, index) => financialUrl(index));
    row.fieldSources = Object.fromEntries(contextAmountFields.map((field) => [field, '东方财富']));
  }
  snapshot.announcements = Array.from({ length: 530 }, (_, index) => ({
    ...snapshot.announcements[0]!,
    id: `large-archive-${index}`,
    title: `测试公司关于担保事项的公开公告 ${index} ${'公开事项说明。'.repeat(10)}`,
    url: `https://static.cninfo.com.cn/finalpage/2026-09-29/${10000 + index}.pdf`,
    ...(index < 5
      ? {
          excerpt: {
            page: 1,
            pagesRead: 3,
            quote: '公开报告说明企业经营及担保事项的适用范围。'.repeat(35),
            url: `https://static.cninfo.com.cn/finalpage/2026-09-29/${10000 + index}.pdf`,
            sha256: 'c'.repeat(64),
          },
        }
      : {}),
  }));
  snapshot.news = Array.from({ length: 16 }, (_, index) => ({
    title: `测试公司公开经营新闻 ${index} ${'公开经营情况。'.repeat(8)}`,
    date: '2026-09-30',
    media: '公开媒体',
    provider: '东方财富',
    url: `https://finance.sina.com.cn/public-news-${index}`,
    digest: '公开报道摘要，需结合实际原文判断企业事件。'.repeat(25),
  }));
  const bytes: number[] = [];
  let turns = 0,
    originalPayload: Record<string, unknown> | undefined;
  const result = await runCompanyResearchAgent(
    run,
    config(async (_url, init) => {
      turns++;
      const request = JSON.parse(String(init?.body));
      bytes.push(Buffer.byteLength(String(init?.body)));
      assert.ok(bytes.at(-1)! < 1_000_000);
      const userMessages = request.messages.filter(
        (message: { role: string }) => message.role === 'user'
      );
      if (turns === 1) {
        originalPayload = JSON.parse(userMessages[0].content);
        assert.equal(originalPayload!.screen, undefined, 'the canonical assessment is sent once');
        assert.equal((originalPayload!.disclosureCatalog as unknown[]).length, 60);
        assert.equal((originalPayload!.financials as unknown[]).length, 6);
        return plan([call('get_financial_history')]);
      }
      for (const state of userMessages.slice(1)) {
        assert.ok(
          Buffer.byteLength(state.content) < 4000,
          'follow-up messages only carry bounded research state'
        );
        const scope = JSON.parse(state.content);
        assert.equal(scope.securityCode, '300893');
        assert.equal(scope.year, 2025);
        assert.equal(scope.basis, 'consolidated');
        assert.equal(scope.metrics, undefined);
        assert.equal(scope.evidence, undefined);
        assert.equal(scope.financials, undefined);
        assert.equal(scope.disclosureCatalog, undefined);
      }
      if (turns === 2) return plan([call('search_disclosures', { topic: '担保' })]);
      const replies = request.messages
        .filter((message: { role: string }) => message.role === 'tool')
        .map((message: { content: string }) => JSON.parse(message.content));
      assert.equal(replies[0].result.financials.length, 6);
      assert.equal(replies[1].result.matches.length, 12);
      assert.equal(replies[1].result.matches[0].id, 'large-archive-0');
      const legacyPayload = JSON.stringify({
        ...originalPayload,
        screen: richPublicPayload(run).screen,
      });
      const legacyRequest = {
        ...request,
        messages: request.messages.map((message: { role: string }) =>
          message.role === 'user' ? { ...message, content: legacyPayload } : message
        ),
      };
      assert.ok(
        Buffer.byteLength(JSON.stringify(legacyRequest)) > 1_000_000,
        'repeating the previous full context would exceed the unchanged request budget'
      );
      return done();
    }),
    { industry: async () => industry() }
  );
  assert.equal(turns, 3);
  assert.equal(result.modelCalls, 3);
  assert.equal(result.toolCalls, 2);
  assert.ok(
    bytes[0]! > 180000,
    'the regression fixture represents a substantial source-backed context'
  );
  assert.ok(result.steps.every((step) => step.status === 'completed'));
});

test('initial public context above the unchanged one-MB budget is withheld before any provider request', async () => {
  const run = company();
  run.context!.profile.description = '公开资料。'.repeat(200000);
  let calls = 0;
  const diagnostics: string[] = [];
  const result = await runCompanyResearchAgent(
    run,
    {
      ...config(async () => {
        calls++;
        return done();
      }),
      onFailure: async (failure) => {
        diagnostics.push(failure.category);
      },
    },
    { industry: async () => industry() }
  );
  assert.equal(calls, 0);
  assert.equal(result.modelCalls, 0);
  assert.equal(result.toolCalls, 0);
  assert.equal(result.steps[0]!.status, 'failed');
  assert.match(result.steps[0]!.summary, /资料预算/);
  assert.deepEqual(diagnostics, ['budget']);
  assert.deepEqual(result.run.context, run.context);
});

test('a proposed stop after financial tools still triggers a separate review and a relevant acquired official original', async () => {
  const run = company();
  run.context!.announcements = [
    {
      ...run.context!.announcements[0]!,
      id: 'cash-clarification',
      title: '关于经营现金与回款情况的澄清公告',
      category: '经营现金',
    },
  ];
  const before = structuredClone(run);
  const pdf = samplePdf();
  let turns = 0,
    pdfCalls = 0;
  const result = await researchAgent(
    run,
    config(async (_url, init) => {
      turns++;
      const request = JSON.parse(String(init?.body));
      if (turns === 1) {
        const payload = JSON.parse(request.messages[1].content);
        const issue = payload.reviewAgenda.issues.find(
          (row: { dimensionId: string }) => row.dimensionId === 'cash'
        );
        assert.ok(issue.metricIds.includes('cash-profit'));
        assert.equal(issue.alternatives.length, 2);
        assert.ok(issue.evidenceIds.length > 0);
        return plan([call('get_financial_history')]);
      }
      if (turns === 2) return done();
      const review = JSON.parse(request.messages.at(-1).content);
      assert.equal(review.reviewRequested, true);
      assert.match(review.reviewTask, /待核查|替代解释/);
      assert.equal(review.targetedReads.length, 1);
      assert.equal(review.targetedReads[0].id, 'cash-clarification');
      assert.equal(review.targetedReads[0].ok, true);
      assert.equal(review.targetedReads[0].result.excerpt.page, 1);
      assert.equal(
        review.targetedReads[0].result.excerpt.sha256,
        createHash('sha256').update(pdf).digest('hex')
      );
      assert.match(review.reviewAgenda.scope, /待检验假设/);
      return done();
    }),
    {
      industry: async () => industry(),
      fetch: async (url) => {
        if (String(url).endsWith('/12345.pdf')) {
          pdfCalls++;
          return new Response(pdf);
        }
        return new Response('unavailable', { status: 503 });
      },
    }
  );
  assert.equal(turns, 3, 'a source-bearing first turn cannot bypass the independent review');
  assert.equal(pdfCalls, 1);
  assert.equal(result.toolCalls, 4);
  assert.equal(
    result.steps.filter((step) => step.tool === 'read_disclosure' && step.status === 'completed')
      .length,
    1
  );
  assert.deepEqual(run, before, 'research still enriches only its public copy');
  assert.equal(
    result.run.context!.financials.find((row) => row.period === '2025-12-31')!.amounts.ocf,
    '7.15'
  );
});

test('same-job repeated topic searches and failed originals reuse recorded outcomes without spending the remaining tool budget', async () => {
  const run = company();
  let turns = 0,
    topicRequests = 0,
    pdfRequests = 0;
  const result = await runCompanyResearchAgent(
    run,
    config(async (_url, init) => {
      turns++;
      const request = JSON.parse(String(init?.body));
      if (turns === 1)
        return plan([
          call('search_news', { topic: '回款  存货' }, 'first-news'),
          call('read_disclosure', { id: 'cninfo-12345' }, 'first-original'),
        ]);
      if (turns === 2)
        return plan([
          call('search_news', { topic: '回款 存货' }, 'same-news'),
          call('read_disclosure', { id: 'cninfo-12345' }, 'same-original'),
        ]);
      const replies = new Map<string, any>(
        request.messages
          .filter((row: { role: string }) => row.role === 'tool')
          .map((row: { tool_call_id: string; content: string }) => [
            row.tool_call_id,
            JSON.parse(row.content),
          ])
      );
      assert.equal(replies.get('same-news').result.reused, true);
      assert.match(replies.get('same-news').result.referenceStepId, /^research-\d+$/);
      assert.equal(
        replies.get('same-news').result.news,
        undefined,
        'cached body text is not sent again'
      );
      assert.equal(replies.get('same-original').ok, false);
      assert.equal(replies.get('same-original').error, replies.get('first-original').error);
      return done();
    }),
    {
      industry: async () => industry(),
      fetch: async (url) => {
        if (String(url).includes('/12345.pdf')) {
          pdfRequests++;
          return new Response('unavailable', { status: 503 });
        }
        topicRequests++;
        return Response.json({ hitsTotal: 0, result: { cmsArticleWebOld: [] } });
      },
    }
  );
  assert.equal(result.modelCalls, 3);
  assert.equal(result.toolCalls, 2);
  assert.equal(topicRequests, 1);
  assert.equal(pdfRequests, 1);
  assert.equal(
    result.steps.filter((step) => step.tool === 'read_disclosure' && step.status === 'failed')
      .length,
    2
  );
  assert.ok(result.run.context!.announcements.every((row) => !row.excerpt));
});

test('a retry has its own request cache; repeated failures are not falsely promoted into acquired originals', async () => {
  let pdfRequests = 0;
  for (let retry = 0; retry < 2; retry++) {
    let turns = 0;
    const result = await runCompanyResearchAgent(
      company(),
      config(async () =>
        ++turns === 1
          ? plan([
              call('read_disclosure', { id: 'cninfo-12345' }, 'original-a'),
              call('read_disclosure', { id: 'cninfo-12345' }, 'original-b'),
            ])
          : done()
      ),
      {
        industry: async () => industry(),
        fetch: async () => {
          pdfRequests++;
          return new Response('unavailable', { status: 503 });
        },
      }
    );
    assert.equal(result.toolCalls, 1);
    assert.equal(
      result.run.context!.sources.filter((row) => row.id.startsWith('agent-disclosure-')).length,
      1
    );
    assert.equal(result.run.context!.announcements[0]!.excerpt, undefined);
  }
  assert.equal(
    pdfRequests,
    2,
    'a separate user-authorized retry does not reuse the previous job failure'
  );
});

test('cache-only model loops still stop at six real planning calls and explicitly report that limit', async () => {
  let modelRequests = 0,
    sourceRequests = 0;
  const result = await runCompanyResearchAgent(
    company(),
    config(async () => {
      modelRequests++;
      return plan(
        Array.from({ length: 24 }, (_, index) =>
          call('search_news', { topic: '回款' }, `replay-${modelRequests}-${index}`)
        )
      );
    }),
    {
      industry: async () => industry(),
      fetch: async () => {
        sourceRequests++;
        return Response.json({ hitsTotal: 0, result: { cmsArticleWebOld: [] } });
      },
    }
  );
  assert.equal(modelRequests, 6);
  assert.equal(sourceRequests, 1);
  assert.equal(result.toolCalls, 1);
  assert.equal(result.steps.filter((step) => step.tool === 'search_news').length, 144);
  assert.match(
    [...result.steps].reverse().find((step) => step.tool === 'planning')!.summary,
    /六轮规划预算已用完/
  );
});

test('review agenda uses real same-scope metrics, keeps conflict hypotheses empty and does not trust duplicate or already-read catalog IDs', () => {
  const run = company();
  const row = run.context!.announcements[0]!;
  run.context!.announcements = [
    { ...row, id: 'basis-cash', title: '关于经营现金情况的公告' },
    { ...row, id: 'alternative-cash', title: '关于回款情况的澄清回复' },
    { ...row, id: 'ambiguous', title: '关于现金回款的澄清' },
    { ...row, id: 'ambiguous', title: '关于现金回款的公告' },
  ];
  const agenda = buildCompanyResearchAgenda(run);
  assert.equal(agenda.officialChecks[0]!.id, 'alternative-cash');
  assert.equal(agenda.officialChecks[0]!.purpose, 'check-alternative');
  assert.ok(agenda.officialChecks.every((item) => item.id !== 'ambiguous'));
  assert.deepEqual(selectCompanyReviewDisclosures(run, new Set(['alternative-cash'])), [
    'basis-cash',
  ]);
  assert.deepEqual(selectCompanyReviewDisclosures(run, new Set(), 0), []);
  run.context!.announcements[1]!.excerpt = {
    url: run.context!.announcements[1]!.url,
    sha256: 'invalid',
    page: 5,
    pagesRead: 8,
    quote: 'legacy invalid cached excerpt',
  };
  assert.equal(buildCompanyResearchAgenda(run).officialChecks[0]!.hasExcerpt, false);
  assert.ok(selectCompanyReviewDisclosures(run, new Set()).includes('alternative-cash'));
  run.context!.comparisons.push({
    field: 'ocf',
    period: '2025-12-31',
    primary: '7.15',
    secondary: '900.00',
    status: 'conflict',
    sources: [],
  } as any);
  const cash = buildCompanyResearchAgenda(run).issues.find((item) => item.dimensionId === 'cash')!;
  assert.equal(cash.status, 'conflict');
  assert.deepEqual(cash.alternatives, []);
  assert.match(cash.question, /不能据此推断/);
  run.context!.orgId = 'another-issuer';
  assert.deepEqual(buildCompanyResearchAgenda(run).officialChecks, []);
});
