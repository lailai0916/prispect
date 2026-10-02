import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyResearchRun } from '../shared/contracts.js';
import {
  contextAmountFields,
  industryMetricKeys,
  type CompanyContextPeriod,
  type CompanyContextSnapshot,
} from '../shared/company-workspace.js';
import {
  analyzeCompanyContext,
  contextFen,
  contextRatio,
  contextSum,
  companyCheckPriorities,
} from '../shared/company-analysis.js';
import { answerCompanyRules, answerCompanyQuestion } from '../server/company-questions.js';
import { aggregateIndustry, uniqueIndustryRows, industryRows } from '../server/company-industry.js';
import {
  PublicCompanyReader,
  retrieveCompanyContext,
  classifyDisclosure,
  mergeDisclosures,
} from '../server/company-context-sources.js';

export const identity = {
  securityCode: '600519',
  orgId: 'gssh0600519',
  shortName: '贵州茅台',
  companyName: '贵州茅台酒股份有限公司',
  exchange: 'sse' as const,
  sourceUrl: 'https://www.cninfo.com.cn/',
};
export function period(
  year: number,
  overrides: Partial<CompanyContextPeriod['amounts']> = {}
): CompanyContextPeriod {
  return {
    period: `${year}-12-31`,
    annual: true,
    noticeDate: `${year + 1}-04-01`,
    amounts: {
      ...Object.fromEntries(contextAmountFields.map((field) => [field, null])),
      revenue: '1000.00',
      parentProfit: '90.00',
      netProfit: '100.00',
      ocf: '80.00',
      cash: '200.00',
      currentPortionDebt: '30.00',
      ...overrides,
    } as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: 40, roe: 20, revenueGrowth: 3 },
    auditOpinion: null,
    fieldSources: {},
    sourceUrls: ['https://www.cninfo.com.cn/'],
    originalUrl: null,
  };
}
export function context(): CompanyContextSnapshot {
  return {
    version: 1,
    securityCode: identity.securityCode,
    orgId: identity.orgId,
    companyName: identity.shortName,
    fetchedAt: '2026-10-02T00:00:00.000Z',
    status: 'partial',
    financials: [period(2023), period(2024), period(2025)],
    sources: [],
    comparisons: [],
    profile: {},
    shareholders: [],
    announcements: [],
    news: [],
    verificationLinks: [],
    warnings: [],
  };
}
export function run(): CompanyResearchRun {
  return {
    id: 'fixture-run',
    input: {
      securityCode: identity.securityCode,
      orgId: identity.orgId,
      year: 2025,
      purpose: 'handover',
    },
    identity,
    status: 'ready',
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    model: { requested: false, status: 'not-requested' },
    trace: [],
    announcements: [],
    context: context(),
  };
}

test('C retains cents, independent profit bases and unknown short debt without reassuring inference', () => {
  assert.equal(contextSum(['90071992547409.91', '0.01']), '90071992547409.92');
  assert.equal(contextFen('0'), 0n);
  assert.equal(contextSum(['0.00', null]), null);
  assert.equal(contextRatio('80.00', '0.00'), null);
  const parent = analyzeCompanyContext(context(), 'parent'),
    consolidated = analyzeCompanyContext(context(), 'consolidated');
  assert.equal(parent.threeYear.profit, '270.00');
  assert.equal(consolidated.threeYear.profit, '300.00');
  assert.equal(parent.shortDebt, null);
  assert.equal(parent.debtCoverage, null);
  assert.ok(companyCheckPriorities(context(), parent).some((item) => item.id === 'coverage'));
  const answer = answerCompanyRules(run(), '现金够不够偿还短期债务？', 'parent');
  assert.ok(/未知|不足|未取得|缺失/.test(answer.text));
  assert.ok(!answer.text.includes('现金足以'));
  const missing = context();
  missing.financials.splice(1, 1);
  assert.equal(analyzeCompanyContext(missing, 'parent').threeYear.complete, false);
});

test('industry excludes target, retains negative/zero/extreme values and withholds small samples', () => {
  const samples = [99, -20, 0, 10, 30, 80].map((value, index) => ({
    code: index === 0 ? '600519' : `60000${index}`,
    name: `样本${index}`,
    noticeDate: null,
    values: Object.fromEntries(industryMetricKeys.map((key) => [key, value])) as any,
  }));
  const value = aggregateIndustry(samples, '600519').roe;
  assert.equal(value.count, 5);
  assert.equal(value.mean, 20);
  assert.equal(value.median, 10);
  assert.equal(value.difference, 79);
  assert.equal(aggregateIndustry(samples.slice(0, 5), '600519').roe.mean, null);
  assert.throws(() =>
    uniqueIndustryRows(
      [
        { SECURITY_CODE: '600519', REPORTDATE: '2025-12-31', YSTZ: 1 },
        { SECURITY_CODE: '600519', REPORTDATE: '2025-12-31', YSTZ: 2 },
      ],
      '2025-12-31',
      'REPORTDATE'
    )
  );
});

test('industry interrupted and wrong-period pages do not produce a truncated benchmark', async () => {
  for (const wrongPeriod of [false, true]) {
    const reader = new PublicCompanyReader({
      fetch: async (url) => {
        const page = new URL(String(url)).searchParams.get('pageNumber');
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              pages: 2,
              count: 2,
              data:
                page === '1'
                  ? [
                      {
                        SECURITY_CODE: '600519',
                        REPORTDATE: wrongPeriod ? '2024-12-31' : '2025-12-31',
                      },
                    ]
                  : [],
            },
          })
        );
      },
    });
    await assert.rejects(industryRows(reader, 'fixture', '', '2025-12-31', 'REPORTDATE'));
  }
});

function financeFetch(
  alter: (kind: string, row: Record<string, unknown>) => Record<string, unknown> = (_kind, row) =>
    row
): typeof fetch {
  return async (url) => {
    const address = new URL(String(url));
    if (address.hostname === 'datacenter.eastmoney.com') {
      const kind = address.searchParams.get('reportName') || '';
      if (kind.includes('FINANCE'))
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              data: [
                alter(kind, {
                  SECURITY_CODE: '600519',
                  SECUCODE: '600519.SH',
                  ORG_CODE: '10000001',
                  ORG_TYPE: '通用',
                  CURRENCY: 'CNY',
                  REPORT_DATE: '2025-12-31',
                  NETPROFIT: '90071992547409.91',
                  PARENT_NETPROFIT: '90.00',
                  TOTAL_OPERATE_INCOME: '1000.00',
                  NETCASH_OPERATE: '80.00',
                  MONETARYFUNDS: '200.00',
                  NONCURRENT_LIAB_1YEAR: '30.00',
                }),
              ],
            },
          })
        );
      return new Response(JSON.stringify({ success: true, result: { data: [] } }));
    }
    if (address.hostname === 'quotes.sina.cn')
      return new Response(JSON.stringify({ result: { data: { report_list: {} } } }));
    return new Response('upstream unavailable', { status: 503 });
  };
}
test('public context preserves precise fields/provenance and stops financial inference on currency, bank or issuer conflicts', async () => {
  const snapshot = await retrieveCompanyContext(identity, { fetch: financeFetch() });
  assert.equal(snapshot.financials[0]?.amounts.netProfit, '90071992547409.91');
  assert.equal(snapshot.financials[0]?.amounts.shortLoan, null);
  assert.ok(snapshot.sources.find((source) => source.id === 'em-income')?.responseHashes.length);
  const foreign = await retrieveCompanyContext(identity, {
    fetch: financeFetch((kind, row) =>
      kind.includes('GINCOME') ? { ...row, CURRENCY: 'USD' } : row
    ),
  });
  assert.equal(foreign.financials[0]?.amounts.netProfit, null);
  for (const patch of [
    { ORG_TYPE: '银行' },
    { SECURITY_CODE: '000001' },
    { ORG_CODE: 'different' },
  ]) {
    const invalid = await retrieveCompanyContext(identity, {
      fetch: financeFetch((_kind, row) => ({ ...row, ...patch })),
    });
    assert.equal(invalid.financials.length, 0);
  }
});

test('optional model sees public context only and invalid citations fall back to saved rules', async () => {
  const original = globalThis.fetch;
  let body = '';
  globalThis.fetch = async (_url, init) => {
    body = String(init?.body);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({ text: '请核对借款合同。', citations: ['fabricated'] }),
            },
          },
        ],
      })
    );
  };
  try {
    const value = run();
    (value as any).privateSecret = 'private-plan-secret';
    (value as any).preview = { material: { observations: [{ value: 'private-original-secret' }] } };
    const answer = await answerCompanyQuestion(
      value,
      '利润与现金为什么不同？',
      'consolidated',
      true,
      { apiKey: 'test-key', baseUrl: 'https://model.test/v1' }
    );
    assert.equal(answer.mode, 'rules-fallback');
    assert.equal(answer.snapshotFetchedAt, value.context!.fetchedAt);
    assert.ok(!body.includes('private-plan-secret'));
    assert.ok(!body.includes('private-original-secret'));
    assert.ok(!body.includes('test-key'));
    assert.ok(answer.citations.every((cite) => cite.url === 'https://www.cninfo.com.cn/'));
  } finally {
    globalThis.fetch = original;
  }
});

test('cross-platform conflicts retain both source amounts and withhold the affected financial field', async () => {
  const baseline = financeFetch();
  const snapshot = await retrieveCompanyContext(identity, {
    fetch: async (url, init) => {
      const address = new URL(String(url));
      if (address.hostname === 'quotes.sina.cn' && address.searchParams.get('source') === 'lrb')
        return new Response(
          JSON.stringify({
            result: {
              data: {
                report_list: {
                  '2025-12-31': {
                    rType: '合并报表',
                    rCurrency: 'CNY',
                    data: [{ item_title: '营业总收入', item_value: '50000.00' }],
                  },
                },
              },
            },
          })
        );
      return baseline(url, init);
    },
  });
  const comparison = snapshot.comparisons.find((check) => check.field === 'revenue');
  assert.equal(comparison?.primary, '1000.00');
  assert.equal(comparison?.secondary, '50000.00');
  assert.equal(comparison?.matches, false);
  assert.equal(snapshot.financials[0]?.amounts.revenue, null);
  assert.equal(analyzeCompanyContext(snapshot, 'parent').ocfToRevenue, null);
});

test('financial context is published before independently delayed supplementary sources complete', async () => {
  const baseline = financeFetch();
  let release: () => void = () => {};
  let published = false;
  const delayed = new Promise<Response>((resolve) => {
    release = () => resolve(new Response(JSON.stringify({ success: true, result: { data: [] } })));
  });
  const result = await retrieveCompanyContext(identity, {
    fetch: async (url, init) =>
      new URL(String(url)).searchParams.get('reportName') === 'RPT_F10_BASIC_ORGINFO'
        ? delayed
        : baseline(url, init),
    onSnapshot: async (snapshot) => {
      published = true;
      assert.equal(snapshot.financials.length, 1);
      release();
    },
  });
  assert.ok(published);
  assert.equal(result.financials.length, 1);
});
