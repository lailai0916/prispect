import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanyResearchRun } from '../shared/contracts.js';
import {
  contextAmountFields,
  type CompanyContextPeriod,
  type CompanyContextSnapshot,
} from '../shared/company-workspace.js';
import { buildLiteCompanyComparison } from '../src/showcase/lite-company-comparison.js';

const fetchedAt = '2026-10-04T00:00:00.000Z';
const reportNames = {
  income: 'RPT_F10_FINANCE_GINCOME',
  cashflow: 'RPT_F10_FINANCE_GCASHFLOW',
  balance: 'RPT_F10_FINANCE_GBALANCE',
} as const;
function urls(code: string, year: number) {
  return Object.fromEntries(
    Object.entries(reportNames).map(([table, reportName]) => {
      const url = new URL('https://datacenter.eastmoney.com/api/data/v1/get');
      url.searchParams.set('reportName', reportName);
      url.searchParams.set('filter', `(SECURITY_CODE="${code}")(REPORT_DATE='${year}-12-31')`);
      return [table, url.href];
    })
  ) as Record<keyof typeof reportNames, string>;
}
function annual(
  code: string,
  year: number,
  amounts: Partial<CompanyContextPeriod['amounts']> = {}
): CompanyContextPeriod {
  return {
    period: `${year}-12-31`,
    annual: true,
    noticeDate: null,
    amounts: {
      ...Object.fromEntries(contextAmountFields.map((field) => [field, null])),
      revenue: '1000.00',
      netProfit: '100.00',
      parentProfit: '70.00',
      ocf: '80.00',
      cash: '200.00',
      ...amounts,
    } as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: null, roe: null, revenueGrowth: null },
    auditOpinion: null,
    fieldSources: {
      revenue: '东方财富',
      netProfit: '东方财富',
      parentProfit: '东方财富',
      ocf: '东方财富',
      cash: '东方财富',
    },
    sourceUrls: Object.values(urls(code, year)),
    originalUrl: null,
  };
}
function run(
  code: string,
  year = 2025,
  amounts: Partial<CompanyContextPeriod['amounts']> = {}
): CompanyResearchRun {
  const snapshot: CompanyContextSnapshot = {
    version: 1,
    securityCode: code,
    orgId: `synthetic-comparison-org-${code}`,
    companyName: `合成公司 ${code}`,
    fetchedAt,
    status: 'available',
    financials: [annual(code, year, amounts)],
    sources: Object.entries(urls(code, year)).map(([table, url]) => ({
      id: `em-${table}`,
      provider: '东方财富',
      dimension: '财务数据',
      url,
      status: 'available',
      fetchedAt,
      latestDate: null,
      count: 1,
      note: 'Synthetic comparison fixture; no source/model requests.',
      responseHashes: [],
    })),
    comparisons: [],
    profile: {},
    shareholders: [],
    announcements: [],
    news: [],
    verificationLinks: [],
    warnings: [],
  };
  return {
    id: `synthetic-comparison-run-${code}-${year}`,
    input: { securityCode: code, orgId: snapshot.orgId, year },
    identity: {
      securityCode: code,
      orgId: snapshot.orgId,
      shortName: snapshot.companyName,
      companyName: snapshot.companyName,
      exchange: code.startsWith('6') ? 'sse' : 'szse',
      sourceUrl: `https://www.cninfo.com.cn/new/snapshot/companyDetailCn?code=${code}`,
    },
    status: 'ready',
    createdAt: fetchedAt,
    updatedAt: fetchedAt,
    model: { requested: false, status: 'not-requested' },
    trace: [],
    announcements: [],
    context: snapshot,
  };
}
type Comparison = ReturnType<typeof buildLiteCompanyComparison>;
function row(view: Comparison, id: 'revenue' | 'netProfit' | 'ocf' | 'cash') {
  const result = view.rows.find((entry) => entry.id === id);
  assert.ok(result, `Comparison must retain the ${id} row.`);
  return result;
}

test('empty and single selection progress to two independently bound annual snapshots and actual field sources', () => {
  const left = run('600519', 2024, { netProfit: '40.01' });
  const right = run('300893', 2024, { netProfit: '14.02' });
  left.context!.financials.push(annual('600519', 2025, { netProfit: '999999.99' }));
  right.context!.financials.unshift(annual('300893', 2023, { netProfit: '-999999.99' }));
  const before = structuredClone([left, right]);
  assert.equal(buildLiteCompanyComparison(null, null).state, 'empty');
  assert.equal(buildLiteCompanyComparison(left, null).state, 'single');
  const view = buildLiteCompanyComparison(left, right);
  assert.equal(view.state, 'ready');
  assert.equal(view.comparable, true);
  assert.equal(view.left?.runId, left.id);
  assert.equal(view.right?.runId, right.id);
  assert.equal(view.left?.orgId, left.input.orgId);
  assert.equal(view.right?.orgId, right.input.orgId);
  assert.equal(view.left?.period, '2024-12-31');
  assert.equal(view.right?.period, '2024-12-31');
  assert.equal(view.left?.currency, 'CNY');
  assert.equal(view.right?.currency, 'CNY');
  const profit = row(view, 'netProfit');
  assert.equal(profit.left.amount?.exactYuan, '40.01');
  assert.equal(profit.right.amount?.exactYuan, '14.02');
  assert.equal(profit.delta?.exactYuan, '25.99');
  assert.deepEqual(
    profit.left.sources.map((source) => source.url),
    [urls('600519', 2024).income]
  );
  assert.deepEqual(
    profit.right.sources.map((source) => source.url),
    [urls('300893', 2024).income]
  );
  assert.ok(
    profit.left.sources.every(
      (source) => source.period === '2024-12-31' && source.field === 'netProfit'
    )
  );
  assert.deepEqual(
    row(view, 'ocf').right.sources.map((source) => source.url),
    [urls('300893', 2024).cashflow]
  );
  assert.deepEqual(
    row(view, 'cash').left.sources.map((source) => source.url),
    [urls('600519', 2024).balance]
  );
  assert.deepEqual([left, right], before);
});

test('the same stock or two stocks belonging to one organization cannot become two comparable companies', () => {
  const left = run('600519');
  const duplicate = structuredClone(left);
  duplicate.id = 'another-run-of-the-same-stock';
  const sameOrganization = run('300893');
  sameOrganization.input.orgId = left.input.orgId;
  sameOrganization.identity!.orgId = left.input.orgId;
  sameOrganization.context!.orgId = left.input.orgId;
  for (const right of [duplicate, sameOrganization]) {
    const view = buildLiteCompanyComparison(left, right);
    assert.equal(view.state, 'same-company');
    assert.equal(view.comparable, false);
    assert.ok(view.rows.every((entry) => !entry.comparable && entry.delta === null));
  }
});

test('different annual years retain each side’s own amounts but never calculate a cross-year difference', () => {
  const left = run('600519', 2024, { netProfit: '40.01' });
  const right = run('300893', 2025, { netProfit: '14.02' });
  const view = buildLiteCompanyComparison(left, right);
  assert.equal(view.state, 'incompatible');
  assert.equal(view.comparable, false);
  assert.equal(row(view, 'netProfit').left.amount?.exactYuan, '40.01');
  assert.equal(row(view, 'netProfit').right.amount?.exactYuan, '14.02');
  assert.ok(view.rows.every((entry) => entry.delta === null && entry.bars.delta === null));
  left.context!.financials = [annual('600519', 2023), annual('600519', 2025)];
  const absent = buildLiteCompanyComparison(left, run('300893', 2024));
  assert.equal(absent.left?.state, 'missing');
  assert.ok(absent.rows.every((entry) => entry.left.amount === null && entry.delta === null));
});

test('unverified identity, mismatched issuers and unsupported USD original candidates never establish a CNY comparison', () => {
  const right = run('300893');
  const unverified = run('600519');
  delete unverified.identity;
  const uncertain = buildLiteCompanyComparison(unverified, right);
  assert.equal(uncertain.left?.state, 'identity-unverified');
  assert.equal(uncertain.comparable, false);
  assert.equal(row(uncertain, 'netProfit').left.amount?.exactYuan, '100.00');
  assert.ok(uncertain.rows.every((entry) => entry.delta === null));
  for (const conflict of ['identity-code', 'identity-org', 'context-org'] as const) {
    const left = run('600519');
    if (conflict === 'identity-code') left.identity!.securityCode = '000001';
    if (conflict === 'identity-org') left.identity!.orgId = 'another-organization';
    if (conflict === 'context-org') left.context!.orgId = 'another-organization';
    const view = buildLiteCompanyComparison(left, right);
    assert.equal(view.left?.state, 'mismatch', conflict);
    assert.ok(
      view.rows.every((entry) => entry.left.amount === null && entry.delta === null),
      conflict
    );
  }
  const us = run('AAPL');
  us.identity!.exchange = 'us';
  us.identity!.sourceUrl = 'https://www.sec.gov/Archives/edgar/data/320193/synthetic-annual.htm';
  us.preview = {
    reviewRequired: true,
    warnings: ['Synthetic unadopted USD original candidate.'],
    tablePages: [1],
    checks: [],
    material: {
      company: 'Synthetic US company',
      shortName: 'Synthetic US',
      title: 'Synthetic USD original',
      filename: 'synthetic-us-original.pdf',
      origin: 'public-report',
      documentDate: '2025-12-31',
      sourceUrl: us.identity!.sourceUrl,
      sha256: 'a'.repeat(64),
      notes: [],
      excerpts: [],
      observations: [
        {
          id: 'synthetic-us-profit',
          key: 'netProfit',
          year: 2025,
          period: 'annual',
          value: '123456.78',
          unit: 'usd',
          currency: 'USD',
          scope: 'consolidated',
          page: 1,
          quote: 'Synthetic USD profit',
          kind: 'reported',
        },
      ],
    },
  };
  const before = structuredClone(us);
  const unsupported = buildLiteCompanyComparison(us, right);
  assert.equal(unsupported.left?.state, 'unsupported');
  assert.equal(unsupported.left?.currency, null);
  assert.ok(unsupported.rows.every((entry) => entry.left.amount === null && entry.delta === null));
  assert.deepEqual(us, before);
});

test('missing, conflicting or failed field evidence withholds only that comparison instead of borrowing another field or source', () => {
  for (const problem of [
    'missing',
    'conflict',
    'failed-source',
    'missing-field-source',
    'wrong-source-issuer',
    'unknown-field-provider',
  ] as const) {
    const left = run('600519');
    if (problem === 'missing') left.context!.financials[0]!.amounts.netProfit = null;
    if (problem === 'conflict')
      left.context!.comparisons.push({
        period: '2025-12-31',
        field: 'netProfit',
        primary: '100.00',
        secondary: '100.01',
        difference: '-0.01',
        matches: false,
      });
    if (problem === 'failed-source')
      left.context!.sources.find((source) => source.id === 'em-income')!.status = 'error';
    if (problem === 'missing-field-source')
      left.context!.financials[0]!.sourceUrls = [
        urls('600519', 2025).cashflow,
        urls('600519', 2025).balance,
      ];
    if (problem === 'wrong-source-issuer') {
      left.context!.financials[0]!.sourceUrls[0] = urls('000001', 2025).income;
      left.context!.sources.find((source) => source.id === 'em-income')!.url = urls(
        '000001',
        2025
      ).income;
    }
    if (problem === 'unknown-field-provider')
      left.context!.financials[0]!.fieldSources.netProfit = '未核对的提供方';
    const view = buildLiteCompanyComparison(
      left,
      run('300893', 2025, { netProfit: '90.00', cash: '150.00' })
    );
    const profit = row(view, 'netProfit');
    assert.equal(profit.comparable, false, problem);
    assert.equal(profit.delta, null, problem);
    assert.equal(profit.bars.delta, null, problem);
    if (
      ['missing-field-source', 'wrong-source-issuer', 'unknown-field-provider'].includes(problem)
    ) {
      assert.deepEqual(profit.left.sources, []);
      assert.equal(profit.left.amount?.exactYuan, '100.00');
    } else assert.equal(profit.left.amount, null, problem);
    assert.equal(row(view, 'cash').delta?.exactYuan, '50.00', problem);
  }
});

test('zero, negative and extreme amounts preserve exact fen differences and one display scale per row', () => {
  const cases = [
    { left: '0.00', right: '0.00', delta: '0.00' },
    { left: '0.00', right: '-100.01', delta: '100.01' },
    { left: '9007199254740993.01', right: '9007199254740992.99', delta: '0.02' },
    {
      left: '99999999999999999999.99',
      right: '-99999999999999999999.99',
      delta: '199999999999999999999.98',
    },
  ];
  for (const fixture of cases) {
    const view = buildLiteCompanyComparison(
      run('600519', 2025, { netProfit: fixture.left }),
      run('300893', 2025, { netProfit: fixture.right })
    );
    const profit = row(view, 'netProfit');
    assert.equal(profit.left.amount?.exactYuan, fixture.left);
    assert.equal(profit.right.amount?.exactYuan, fixture.right);
    assert.equal(profit.delta?.exactYuan, fixture.delta);
    assert.equal(profit.delta?.display.zh.exactYuan, fixture.delta);
    assert.equal(profit.delta?.display.en.exactYuan, fixture.delta);
    assert.equal(profit.left.amount?.display.zh.scale, profit.right.amount?.display.zh.scale);
    assert.equal(profit.left.amount?.display.en.scale, profit.right.amount?.display.en.scale);
    for (const bar of [profit.bars.left, profit.bars.right, profit.bars.delta]) {
      assert.ok(bar);
      assert.ok(Number.isFinite(bar.start) && Number.isFinite(bar.width));
      assert.ok(bar.width >= 0 && bar.start >= 0 && bar.start + bar.width <= 100);
    }
    if (fixture.left === '0.00' && fixture.right === '0.00') {
      assert.equal(profit.bars.left?.width, 0);
      assert.equal(profit.bars.right?.width, 0);
      assert.equal(profit.bars.delta?.width, 0);
    }
    if (fixture.right.startsWith('-')) assert.equal(profit.bars.signed, true);
  }
});

test('the parent basis uses each issuer’s attributable profit while preserving consolidated cash and both saved runs', () => {
  const left = run('600519', 2025, { netProfit: '100.00', parentProfit: '70.00' });
  const right = run('300893', 2025, { netProfit: '90.00', parentProfit: '110.00' });
  const before = structuredClone([left, right]);
  const consolidated = buildLiteCompanyComparison(left, right, 'consolidated');
  const parent = buildLiteCompanyComparison(left, right, 'parent');
  assert.equal(row(consolidated, 'netProfit').field, 'netProfit');
  assert.equal(row(parent, 'netProfit').field, 'parentProfit');
  assert.ok(row(parent, 'netProfit').label[0].includes('归母'));
  assert.equal(row(consolidated, 'netProfit').delta?.exactYuan, '10.00');
  assert.equal(row(parent, 'netProfit').delta?.exactYuan, '-40.00');
  assert.ok(
    row(parent, 'netProfit').left.sources.every((source) => source.field === 'parentProfit')
  );
  assert.deepEqual(row(parent, 'ocf').left.amount, row(consolidated, 'ocf').left.amount);
  assert.deepEqual([left, right], before);
});
