import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFinancialChartPoints,
  financialChartAmount,
  financialChartFields,
  financialChartGroups,
  financialChartSourceFields,
} from '../shared/company-financial-charts.js';
import {
  contextAmountFields,
  industryMetricKeys,
  type CompanyContextPeriod,
  type CompanyContextSnapshot,
  type CompanyIndustrySnapshot,
  type IndustryMetricSummary,
} from '../shared/company-workspace.js';

function period(
  year: number,
  amounts: Partial<CompanyContextPeriod['amounts']> = {}
): CompanyContextPeriod {
  return {
    period: `${year}-12-31`,
    annual: true,
    noticeDate: null,
    amounts: {
      ...Object.fromEntries(contextAmountFields.map((field) => [field, null])),
      revenue: '100000000.00',
      netProfit: '10000000.00',
      parentProfit: '8000000.00',
      ocf: '-5000000.00',
      cash: '0.00',
      shortLoan: '2000000.01',
      currentPortionDebt: '3000000.02',
      inventory: '6000000.00',
      receivables: '4000000.00',
      ...amounts,
    } as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: 40, roe: -2, revenueGrowth: 3 },
    auditOpinion: null,
    fieldSources: {},
    sourceUrls: [],
    originalUrl: null,
  };
}

function context(rows: CompanyContextPeriod[] = [period(2025)]): CompanyContextSnapshot {
  return {
    version: 1,
    securityCode: '600519',
    orgId: 'gssh0600519',
    companyName: 'Fixture company',
    fetchedAt: '2026-10-03T00:00:00.000Z',
    status: 'partial',
    financials: rows,
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

function metric(mean = 20, count = 5): IndustryMetricSummary {
  return { company: 999, mean, median: mean, count, missing: 0, difference: 999 - mean };
}

function industry(): CompanyIndustrySnapshot {
  return {
    version: 1,
    securityCode: '600519',
    period: '2025-12-31',
    industry: 'Fixture industry',
    industryCode: 'BK0000',
    fetchedAt: '2026-10-03T00:00:00.000Z',
    status: 'available',
    peerCount: 5,
    minimumSamples: 5,
    metrics: Object.fromEntries(
      industryMetricKeys.map((key) => [key, metric()])
    ) as CompanyIndustrySnapshot['metrics'],
    chartMetrics: {
      revenue: metric(80000000),
      netProfit: metric(12000000),
      parentProfit: metric(9000000),
      netMargin: metric(15),
      parentNetMargin: metric(11.25),
      ocf: metric(-1000000),
      shortDebt: metric(0),
    },
    samples: [],
    sources: [],
    warnings: [],
  };
}

test('chart registry covers thirteen metrics without repeated ratio cards across the curated groups', () => {
  assert.equal(Object.keys(financialChartFields).length, 13);
  assert.deepEqual(
    financialChartGroups.map((group) => group.id),
    ['cash', 'income', 'debt', 'ratios']
  );
  const keys = financialChartGroups.flatMap((group) => group.keys);
  assert.equal(keys.filter((key) => key === 'netMargin').length, 1);
  assert.equal(keys.filter((key) => key === 'ocfToRevenue').length, 1);
  assert.equal(new Set(keys).size, 13);
  assert.deepEqual(financialChartSourceFields('netMargin', 'parent'), ['parentProfit', 'revenue']);
  assert.deepEqual(financialChartSourceFields('profit', 'consolidated'), ['netProfit']);
  assert.deepEqual(financialChartFields.profit.fields, ['netProfit']);
});

test('chart amounts stay in yuan and parent/consolidated series use their corresponding peer basis', () => {
  const snapshot = context(),
    peers = { '2025-12-31': industry() };
  const consolidated = buildFinancialChartPoints(snapshot, 'consolidated', peers),
    parent = buildFinancialChartPoints(snapshot, 'parent', peers);
  assert.equal(consolidated.revenue[0]!.company, 100000000);
  assert.equal(consolidated.revenue[0]!.peer, 80000000);
  assert.equal(consolidated.profit[0]!.company, 10000000);
  assert.equal(consolidated.profit[0]!.peer, 12000000);
  assert.equal(parent.profit[0]!.company, 8000000);
  assert.equal(parent.profit[0]!.peer, 9000000);
  assert.equal(consolidated.netMargin[0]!.company, 10);
  assert.equal(consolidated.netMargin[0]!.peer, 15);
  assert.equal(parent.netMargin[0]!.company, 8);
  assert.equal(parent.netMargin[0]!.peer, 11.25);
  // The peer endpoint's company value never replaces the context snapshot's value.
  assert.equal(consolidated.grossMargin[0]!.company, 40);
});

test('zero and negative observed values remain visible; missing values never become zero or peer values', () => {
  const snapshot = context(),
    peers = { '2025-12-31': industry() };
  const values = buildFinancialChartPoints(snapshot, 'consolidated', peers);
  assert.equal(values.cash[0]!.company, 0);
  assert.equal(values.ocf[0]!.company, -5000000);
  assert.equal(values.ocf[0]!.peer, -1000000);
  assert.equal(values.ocfToRevenue[0]!.company, -5);
  assert.equal(values.roe[0]!.company, -2);
  snapshot.financials[0]!.amounts.netProfit = null;
  const missing = buildFinancialChartPoints(snapshot, 'consolidated', peers);
  assert.equal(missing.profit[0]!.company, null);
  assert.equal(missing.profit[0]!.peer, 12000000);
  assert.equal(missing.netMargin[0]!.company, null);
});

test('short debt is summed in exact fen and requires both nonnegative components', () => {
  const snapshot = context();
  assert.equal(buildFinancialChartPoints(snapshot, 'parent').shortDebt[0]!.company, 5000000.03);
  assert.equal(financialChartAmount(snapshot, '2025-12-31', 'shortLoan'), '2000000.01');
  for (const amount of [null, '-0.01', 'Infinity', '1.001']) {
    snapshot.financials[0]!.amounts.shortLoan = amount;
    assert.equal(buildFinancialChartPoints(snapshot, 'parent').shortDebt[0]!.company, null);
  }
  snapshot.financials[0]!.amounts.shortLoan = '0.00';
  snapshot.financials[0]!.amounts.currentPortionDebt = '0.00';
  assert.equal(buildFinancialChartPoints(snapshot, 'parent').shortDebt[0]!.company, 0);
});

test('calculated ratios withhold nonpositive or missing revenue without discarding valid raw amounts', () => {
  const snapshot = context();
  for (const revenue of [null, '0.00', '-100.00']) {
    snapshot.financials[0]!.amounts.revenue = revenue;
    const values = buildFinancialChartPoints(snapshot, 'consolidated');
    for (const key of ['netMargin', 'ocfToRevenue', 'receivableToRevenue'] as const)
      assert.equal(values[key][0]!.company, null);
    assert.equal(values.profit[0]!.company, 10000000);
  }
});

test('saved benchmarks must match issuer and full annual period and meet each metric minimum', () => {
  const snapshot = context(),
    peers = industry();
  peers.securityCode = '000002';
  assert.equal(
    buildFinancialChartPoints(snapshot, 'parent', { '2025-12-31': peers }).grossMargin[0]!.peer,
    null
  );
  peers.securityCode = snapshot.securityCode;
  peers.period = '2024-12-31';
  assert.equal(
    buildFinancialChartPoints(snapshot, 'parent', { '2025-12-31': peers }).grossMargin[0]!.peer,
    null
  );
  peers.period = '2025-12-31';
  peers.metrics.grossMargin = metric(30, 4);
  const insufficient = buildFinancialChartPoints(snapshot, 'parent', { '2025-12-31': peers });
  assert.equal(insufficient.grossMargin[0]!.peer, null);
  assert.equal(insufficient.grossMargin[0]!.count, 4);
  assert.equal(insufficient.roe[0]!.peer, 20);
  peers.minimumSamples = 6;
  assert.equal(
    buildFinancialChartPoints(snapshot, 'parent', { '2025-12-31': peers }).roe[0]!.peer,
    null
  );
  peers.minimumSamples = 5;
  peers.peerCount = 4;
  assert.equal(
    buildFinancialChartPoints(snapshot, 'parent', { '2025-12-31': peers }).roe[0]!.peer,
    null
  );
  peers.peerCount = 5;
  peers.metrics.roe = metric(20, 6);
  assert.equal(
    buildFinancialChartPoints(snapshot, 'parent', { '2025-12-31': peers }).roe[0]!.peer,
    null
  );
});

test('legacy industry snapshots expose existing ratios but never invent additional amount or margin peers', () => {
  const snapshot = context(),
    peers = industry();
  delete peers.chartMetrics;
  const values = buildFinancialChartPoints(snapshot, 'parent', { '2025-12-31': peers });
  assert.equal(values.grossMargin[0]!.peer, 20);
  assert.equal(values.roe[0]!.peer, 20);
  assert.equal(values.revenueGrowth[0]!.peer, 20);
  for (const key of ['revenue', 'profit', 'ocf', 'shortDebt', 'netMargin'] as const) {
    assert.equal(values[key][0]!.peer, null);
    assert.equal(values[key][0]!.count, null);
  }
});

test('annual series sort and deduplicate periods, exclude interim scope and retain missing-year gaps', () => {
  const snapshot = context([
    period(2025),
    { ...period(2024), annual: false, period: '2024-09-30' },
    { ...period(2024), period: '2024-06-30' },
    period(2022),
    period(2025),
  ]);
  const before = structuredClone(snapshot);
  assert.deepEqual(
    buildFinancialChartPoints(snapshot, 'parent').revenue.map((point) => point.period),
    ['2022-12-31', '2025-12-31']
  );
  assert.deepEqual(snapshot, before);
  assert.deepEqual(buildFinancialChartPoints(context([]), 'parent').revenue, []);
});

test('source conflicts mask the affected amounts and comparisons while preserving unrelated fields and basis', () => {
  const snapshot = context(),
    peers = { '2025-12-31': industry() };
  snapshot.comparisons.push({
    period: '2025-12-31',
    field: 'netProfit',
    primary: '10000000.00',
    secondary: '11000000.00',
    difference: '-1000000.00',
    matches: false,
  });
  const values = buildFinancialChartPoints(snapshot, 'consolidated', peers);
  assert.equal(values.profit[0]!.company, null);
  assert.equal(values.profit[0]!.peer, null);
  assert.equal(values.netMargin[0]!.company, null);
  assert.equal(values.netMargin[0]!.peer, null);
  assert.equal(values.ocf[0]!.company, -5000000);
  assert.equal(financialChartAmount(snapshot, '2025-12-31', 'netProfit'), null);
  assert.equal(buildFinancialChartPoints(snapshot, 'parent', peers).profit[0]!.company, 8000000);
});

test('duplicate period disagreements are order independent and missing duplicates do not fill each other', () => {
  for (const rows of [
    [period(2025), period(2025, { revenue: '101000000.00' })],
    [period(2025, { revenue: '101000000.00' }), period(2025)],
  ]) {
    const values = buildFinancialChartPoints(context(rows), 'parent', { '2025-12-31': industry() });
    assert.equal(values.revenue[0]!.company, null);
    assert.equal(values.revenue[0]!.peer, null);
    assert.equal(values.netMargin[0]!.company, null);
    assert.equal(values.profit[0]!.company, 8000000);
  }
  const missing = context([period(2025), period(2025, { revenue: null })]);
  assert.equal(buildFinancialChartPoints(missing, 'parent').revenue[0]!.company, null);
  const mismatch = context([
    period(2025),
    { ...period(2025), ratios: { grossMargin: 41, roe: -2, revenueGrowth: 3 } },
  ]);
  assert.equal(
    buildFinancialChartPoints(mismatch, 'parent', { '2025-12-31': industry() }).grossMargin[0]!
      .peer,
    null
  );
});

test('growth uses exact adjacent annual revenue and never bridges a conflict or missing predecessor', () => {
  const snapshot = context([period(2025, { revenue: '75000000.00' }), period(2024)]);
  const growth = buildFinancialChartPoints(snapshot, 'parent').revenueGrowth;
  assert.equal(growth[0]!.company, 3); // Stored reported growth when no predecessor was acquired.
  assert.equal(growth[1]!.company, -25);
  snapshot.financials[1]!.amounts.revenue = null;
  assert.equal(buildFinancialChartPoints(snapshot, 'parent').revenueGrowth[1]!.company, null);
  snapshot.financials[1]!.amounts.revenue = '100000000.00';
  snapshot.comparisons.push({
    period: '2024-12-31',
    field: 'revenue',
    primary: '100000000.00',
    secondary: '101000000.00',
    difference: '-1000000.00',
    matches: false,
  });
  const blocked = buildFinancialChartPoints(snapshot, 'parent', { '2025-12-31': industry() })
    .revenueGrowth[1]!;
  assert.equal(blocked.company, null);
  assert.equal(blocked.peer, null);
});

test('nonfinite ratios, peer means and malformed counts remain unknown', () => {
  const snapshot = context(),
    peers = industry();
  snapshot.financials[0]!.ratios.roe = Infinity;
  peers.metrics.roe = metric(NaN);
  peers.metrics.grossMargin = metric(30, 5.5);
  const values = buildFinancialChartPoints(snapshot, 'parent', { '2025-12-31': peers });
  assert.equal(values.roe[0]!.company, null);
  assert.equal(values.roe[0]!.peer, null);
  assert.equal(values.grossMargin[0]!.peer, null);
  assert.equal(values.grossMargin[0]!.count, null);
});
