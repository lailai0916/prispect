import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanyResearchRun } from '../shared/contracts.js';
import {
  companyOverviewEvidencePeriods,
  deriveCompanyFinancialOverview,
} from '../shared/company-financial-overview.js';
import {
  contextAmountFields,
  type CompanyContextPeriod,
  type CompanyContextSnapshot,
} from '../shared/company-workspace.js';

const urls = {
  income: 'https://datacenter.eastmoney.com/api/data/v1/get?reportName=RPT_F10_FINANCE_GINCOME',
  cashflow: 'https://datacenter.eastmoney.com/api/data/v1/get?reportName=RPT_F10_FINANCE_GCASHFLOW',
  balance: 'https://datacenter.eastmoney.com/api/data/v1/get?reportName=RPT_F10_FINANCE_GBALANCE',
};
function annual(
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
      parentProfit: '80.00',
      ocf: '100.00',
      cash: '150.00',
      shortLoan: '60.00',
      currentPortionDebt: '40.00',
      totalAssets: '1000.00',
      totalLiabilities: '500.00',
      totalProfit: '100.00',
      financeExpense: '10.00',
      ...amounts,
    } as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: null, roe: null, revenueGrowth: null },
    auditOpinion: '标准无保留意见',
    fieldSources: Object.fromEntries(contextAmountFields.map((field) => [field, '东方财富'])),
    sourceUrls: Object.values(urls),
    originalUrl: null,
  };
}
function context(rows = [annual(2023), annual(2024), annual(2025)]): CompanyContextSnapshot {
  return {
    version: 1,
    securityCode: '600519',
    orgId: 'gssh0600519',
    companyName: 'Synthetic company',
    fetchedAt: '2026-10-03T00:00:00.000Z',
    status: 'available',
    financials: rows,
    sources: Object.entries(urls).map(([table, url]) => ({
      id: `em-${table}`,
      provider: '东方财富',
      dimension: '财务数据',
      url,
      status: 'available',
      fetchedAt: '2026-10-03T00:00:00.000Z',
      latestDate: null,
      count: rows.length,
      note: '',
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
}
function run(rows?: CompanyContextPeriod[], year = 2025): CompanyResearchRun {
  return {
    id: 'synthetic-financial-overview',
    input: { securityCode: '600519', orgId: 'gssh0600519', year },
    status: 'ready',
    createdAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
    model: { requested: true, status: 'not-called' },
    trace: [],
    announcements: [],
    context: context(rows),
  };
}
const card = (input: CompanyResearchRun, id: 'earn' | 'cash' | 'debt') =>
  deriveCompanyFinancialOverview(input, 'parent').cards.find((item) => item.id === id)!;

test('context alone supplies three F judgments and source ids without assessment or model output', () => {
  const input = run();
  const before = structuredClone(input);
  const view = deriveCompanyFinancialOverview(input, 'parent');
  assert.deepEqual(
    view.cards.map((item) => item.id),
    ['earn', 'cash', 'debt']
  );
  assert.ok(view.cards.every((item) => item.status === 'good'));
  assert.equal(view.cards[0]!.primary.value, '80.00');
  assert.equal(view.cards[1]!.primary.value, 1.25);
  assert.equal(view.cards[2]!.primary.value, 1.5);
  assert.deepEqual(view.cards[0]!.evidence.sourceIds, ['em-income']);
  assert.deepEqual(view.cards[1]!.evidence.sourceIds, ['em-income', 'em-cashflow']);
  assert.deepEqual(view.cards[2]!.evidence.sourceIds, ['em-balance']);
  assert.deepEqual(input, before);
});

test('the chosen year controls annual judgments while the latest interim stays explicitly separate', () => {
  const interim = {
    ...annual(2026, { parentProfit: '-900.00' }),
    period: '2026-06-30',
    annual: false,
  };
  const input = run(
    [
      annual(2022),
      annual(2023),
      annual(2024, { cash: '200.00' }),
      annual(2025, { parentProfit: '-1000.00', cash: '0.00', ocf: '-1000.00' }),
      interim,
    ],
    2024
  );
  const view = deriveCompanyFinancialOverview(input, 'parent');
  assert.equal(view.annual?.period, '2024-12-31');
  assert.equal(view.interim?.period, '2026-06-30');
  assert.deepEqual(view.analysis?.threeYear.periods, ['2022-12-31', '2023-12-31', '2024-12-31']);
  assert.equal(view.analysis?.threeYear.profit, '240.00');
  assert.equal(view.analysis?.lossYears, 0);
  assert.equal(view.cards[2]!.primary.value, 2);
  assert.deepEqual(view.findings, []);
});

test('a missing selected year never borrows an older or newer annual for judgment', () => {
  const input = run([annual(2022), annual(2023), annual(2024), annual(2026)]);
  const view = deriveCompanyFinancialOverview(input, 'parent');
  assert.equal(view.annual, null);
  assert.ok(view.cards.every((item) => item.status === 'unknown'));
  assert.equal(view.analysis?.threeYear.complete, false);
  assert.equal(view.analysis?.shortDebt, null);
  assert.equal(view.analysis?.missing.length, 6);
  assert.equal(view.cards[0]!.primary.value, null);
  assert.ok(view.findings.some((item) => item.id === 'data-gap'));
});

test('three-year cash requires exactly the selected year and two preceding years', () => {
  const view = deriveCompanyFinancialOverview(
    run([annual(2021), annual(2023), annual(2025)]),
    'parent'
  );
  assert.equal(view.cards[0]!.status, 'good');
  assert.equal(view.cards[1]!.status, 'unknown');
  assert.equal(view.cards[2]!.status, 'good');
  assert.equal(view.analysis?.threeYear.profit, null);
});

test('profit basis changes labels, sums, ratios, judgments and evidence together', () => {
  const input = run(
    [2023, 2024, 2025].map((year) =>
      annual(year, { netProfit: '-100.00', parentProfit: '100.00', ocf: '80.00' })
    )
  );
  const parent = deriveCompanyFinancialOverview(input, 'parent');
  const consolidated = deriveCompanyFinancialOverview(input, 'consolidated');
  assert.equal(parent.cards[0]!.status, 'good');
  assert.equal(parent.cards[1]!.status, 'watch');
  assert.equal(parent.cards[1]!.primary.value, 0.8);
  assert.equal(consolidated.cards[0]!.status, 'risk');
  assert.equal(consolidated.cards[1]!.primary.kind, 'amount');
  assert.equal(consolidated.cards[1]!.primary.value, '240.00');
  assert.deepEqual(parent.cards[1]!.evidence.fields, ['parentProfit', 'ocf', 'revenue']);
  assert.deepEqual(consolidated.cards[1]!.evidence.fields, ['netProfit', 'ocf', 'revenue']);
});

test('thin profit uses the exact strict two-percent boundary and reports cash amounts', () => {
  const below = run(
    [2023, 2024, 2025].map((year) => annual(year, { parentProfit: '19.99', ocf: '200.00' }))
  );
  const at = run(
    [2023, 2024, 2025].map((year) => annual(year, { parentProfit: '20.00', ocf: '200.00' }))
  );
  assert.equal(
    deriveCompanyFinancialOverview(below, 'parent').analysis?.threeYear.thinProfit,
    true
  );
  assert.equal(card(below, 'cash').primary.kind, 'amount');
  assert.equal(card(below, 'cash').primary.value, '600.00');
  assert.equal(card(below, 'cash').status, 'watch');
  assert.equal(deriveCompanyFinancialOverview(at, 'parent').analysis?.threeYear.thinProfit, false);
  assert.equal(card(at, 'cash').primary.value, 10);
});

test('cash thresholds use exact fen before rounded presentation', () => {
  for (const [ocf, expected] of [
    ['59.99', 'risk'],
    ['60.00', 'watch'],
    ['89.99', 'watch'],
    ['90.00', 'good'],
    ['200.00', 'good'],
  ] as const) {
    const input = run(
      [2023, 2024, 2025].map((year) => annual(year, { parentProfit: '100.00', ocf }))
    );
    assert.equal(card(input, 'cash').status, expected, ocf);
  }
  const input = run(
    [2023, 2024, 2025].map((year) =>
      annual(year, { parentProfit: '1000000.00', revenue: '10000000.00', ocf: '599999.99' })
    )
  );
  assert.equal(card(input, 'cash').primary.value, 0.6);
  assert.equal(card(input, 'cash').status, 'risk');
});

test('cash coverage uses exact one and one-and-a-half thresholds, including valid zero cash', () => {
  for (const [cash, expected] of [
    ['0.00', 'risk'],
    ['99.99', 'risk'],
    ['100.00', 'watch'],
    ['149.99', 'watch'],
    ['150.00', 'good'],
  ] as const) {
    assert.equal(
      card(run([annual(2023), annual(2024), annual(2025, { cash })]), 'debt').status,
      expected,
      cash
    );
  }
  const input = run([
    annual(2025, {
      cash: '9007199254740993.02',
      shortLoan: '9007199254740993.01',
      currentPortionDebt: '0.02',
    }),
  ]);
  const view = deriveCompanyFinancialOverview(input, 'parent');
  assert.equal(view.analysis?.shortDebt, '9007199254740993.03');
  assert.equal(view.analysis?.debtGap, '-0.01');
  assert.equal(view.cards[2]!.primary.value, 1);
  assert.equal(view.cards[2]!.status, 'risk');
  assert.equal(view.findings.find((item) => item.id === 'debt-gap')?.measure?.value, '0.01');
});

test('zero debt, missing components and negative balance inputs stay distinct', () => {
  const noDebt = card(
    run([annual(2025, { cash: '0.00', shortLoan: '0.00', currentPortionDebt: '0.00' })]),
    'debt'
  );
  assert.equal(noDebt.status, 'good');
  assert.equal(noDebt.primary.kind, 'amount');
  assert.equal(noDebt.primary.value, '0.00');
  for (const amounts of [
    { shortLoan: null },
    { currentPortionDebt: '-60.00' },
    { cash: '-1.00' },
    { cash: '1e8' },
  ]) {
    assert.equal(card(run([annual(2025, amounts)]), 'debt').status, 'unknown');
  }
});

test('zero and negative profits or revenues cannot become a favorable profitability fallback', () => {
  assert.equal(
    card(run([annual(2025, { parentProfit: '0.00' })]), 'earn').judgment[0],
    '本年处于盈亏平衡'
  );
  assert.equal(card(run([annual(2025, { parentProfit: null })]), 'earn').status, 'unknown');
  assert.equal(card(run([annual(2025, { parentProfit: '-1.00' })]), 'earn').status, 'risk');
  for (const revenue of ['0.00', '-1000.00', null]) {
    const input = run([2023, 2024, 2025].map((year) => annual(year, { revenue })));
    assert.notEqual(card(input, 'earn').status, 'good');
    assert.equal(card(input, 'cash').status, 'unknown');
  }
  const lossWithZeroCash = run(
    [2023, 2024, 2025].map((year) => annual(year, { parentProfit: '-100.00', ocf: '0.00' }))
  );
  assert.equal(card(lossWithZeroCash, 'cash').judgment[0], '累计亏损，经营现金为零');
  const lossWithNegativeCash = run(
    [2023, 2024, 2025].map((year) => annual(year, { parentProfit: '-100.00', ocf: '-20.00' }))
  );
  assert.equal(card(lossWithNegativeCash, 'cash').status, 'risk');
});

test('source conflicts mask only dependent fields and preserve source ids for inspection', () => {
  const input = run();
  input.context!.comparisons.push({
    period: '2025-12-31',
    field: 'parentProfit',
    primary: '80.00',
    secondary: '90.00',
    difference: '-10.00',
    matches: false,
  });
  const view = deriveCompanyFinancialOverview(input, 'parent');
  assert.equal(view.cards[0]!.primary.value, null);
  assert.equal(view.cards[1]!.status, 'unknown');
  assert.equal(view.cards[2]!.status, 'good');
  assert.deepEqual(view.cards[0]!.evidence.sourceIds, ['em-income']);
  assert.equal(input.context!.financials[2]!.amounts.parentProfit, '80.00');
  input.context!.comparisons[0]!.field = 'inventory';
  assert.ok(
    deriveCompanyFinancialOverview(input, 'parent').cards.every((item) => item.status === 'good')
  );
});

test('duplicates are counted once and their missing or differing fields stay unknown', () => {
  const equal = run([
    annual(2023),
    annual(2024),
    ...Array.from({ length: 8 }, () => annual(2025, { parentProfit: '80' })),
  ]);
  assert.equal(
    deriveCompanyFinancialOverview(equal, 'parent').analysis?.threeYear.profit,
    '240.00'
  );
  assert.equal(deriveCompanyFinancialOverview(equal, 'parent').analysis?.annuals.length, 3);
  const differing = structuredClone(equal);
  differing.context!.financials.at(-1)!.amounts.parentProfit = '80.01';
  assert.equal(card(differing, 'earn').status, 'unknown');
  assert.equal(card(differing, 'debt').status, 'good');
  const missing = structuredClone(equal);
  missing.context!.financials.at(-1)!.amounts.parentProfit = null;
  assert.equal(card(missing, 'cash').status, 'unknown');
});

test('issuer mismatches and unavailable source fields never enter financial judgments', () => {
  for (const field of ['securityCode', 'orgId'] as const) {
    const input = run();
    input.context![field] = 'another-issuer';
    const view = deriveCompanyFinancialOverview(input, 'parent');
    assert.equal(view.state, 'mismatch');
    assert.equal(view.annual, null);
    assert.equal(view.interim, null);
    assert.ok(view.cards.every((item) => item.primary.value === null));
    assert.deepEqual(view.findings, []);
  }
  const input = run();
  input.context!.sources.find((source) => source.id === 'em-income')!.status = 'error';
  assert.equal(card(input, 'earn').status, 'unknown');
  assert.equal(card(input, 'debt').status, 'good');
  const noProvenance = run();
  noProvenance.context!.sources = [];
  noProvenance.context!.financials.forEach((row) => {
    row.sourceUrls = [];
  });
  assert.ok(
    deriveCompanyFinancialOverview(noProvenance, 'parent').cards.every(
      (item) => item.status === 'unknown'
    )
  );
});

test('attention sorts financial pressure first and tests strict leverage boundaries', () => {
  const input = run([
    annual(2023, { ocf: '-1.00' }),
    annual(2024, { ocf: '-1.00' }),
    annual(2025, {
      cash: '80.00',
      parentProfit: '-100.00',
      totalLiabilities: '800.01',
      totalProfit: '-1.00',
      financeExpense: '10.00',
    }),
  ]);
  const view = deriveCompanyFinancialOverview(input, 'parent');
  assert.equal(view.findings[0]!.id, 'debt-gap');
  assert.equal(view.nextCheck, view.findings[0]!.nextCheck);
  assert.equal(view.findings.find((item) => item.id === 'negative-cash')!.status, 'risk');
  assert.equal(view.findings.find((item) => item.id === 'leverage')!.status, 'risk');
  assert.equal(view.findings.find((item) => item.id === 'finance-expense')!.status, 'risk');
  assert.equal(
    deriveCompanyFinancialOverview(
      run([annual(2025, { totalLiabilities: '650.00' })]),
      'parent'
    ).findings.some((item) => item.id === 'leverage'),
    false
  );
  assert.equal(
    deriveCompanyFinancialOverview(
      run([annual(2025, { totalAssets: '0.00', totalLiabilities: '800.00' })]),
      'parent'
    ).findings.some((item) => item.id === 'leverage'),
    false
  );
});

test('valid large inputs retain the correct cash direction, aggregate ratios and debt gaps', () => {
  const maximum = '99999999999999999999.00';
  const losses = run(
    [2023, 2024, 2025].map((year) => annual(year, { parentProfit: '-100.00', ocf: maximum }))
  );
  const lossView = deriveCompanyFinancialOverview(losses, 'parent');
  assert.equal(lossView.analysis?.threeYear.complete, true);
  assert.equal(lossView.analysis?.threeYear.cash, '299999999999999999997.00');
  assert.equal(lossView.cards[1]!.judgment[0], '在亏损，但现金还在流入');
  const profits = run(
    [2023, 2024, 2025].map((year) =>
      annual(year, { parentProfit: maximum, revenue: maximum, ocf: maximum })
    )
  );
  assert.equal(card(profits, 'cash').primary.value, 1);
  const debt = run([
    annual(2025, { cash: '0.00', shortLoan: maximum, currentPortionDebt: maximum }),
  ]);
  const debtView = deriveCompanyFinancialOverview(debt, 'parent');
  assert.equal(debtView.analysis?.shortDebt, '199999999999999999998.00');
  assert.equal(debtView.analysis?.debtGap, '-199999999999999999998.00');
  assert.equal(debtView.cards[2]!.status, 'risk');
  assert.equal(
    debtView.findings.find((finding) => finding.id === 'debt-gap')!.measure!.value,
    '199999999999999999998.00'
  );
});

test('audit findings require usable acquired or original-document provenance', () => {
  const input = run([annual(2025)]);
  input.context!.financials[0]!.auditOpinion = '保留意见';
  input.context!.financials[0]!.sourceUrls = [];
  input.context!.sources = [];
  assert.equal(
    deriveCompanyFinancialOverview(input, 'parent').findings.some(
      (finding) => finding.id === 'audit'
    ),
    false
  );
  input.context!.financials[0]!.originalUrl =
    'https://static.cninfo.com.cn/finalpage/synthetic-fixture.pdf';
  assert.equal(
    deriveCompanyFinancialOverview(input, 'parent').findings.some(
      (finding) => finding.id === 'audit'
    ),
    true
  );
  const failed = run([annual(2025)]);
  failed.context!.financials[0]!.auditOpinion = '保留意见';
  failed.context!.sources.forEach((source) => {
    source.status = 'error';
  });
  assert.equal(
    deriveCompanyFinancialOverview(failed, 'parent').findings.some(
      (finding) => finding.id === 'audit'
    ),
    false
  );
});

test('evidence uses chronological selected periods and only the opened fields source tables', () => {
  const input = run([annual(2025), annual(2023), annual(2024)]);
  const evidence = card(input, 'earn').evidence;
  const periods = companyOverviewEvidencePeriods(input.context, evidence);
  assert.deepEqual(
    periods.map((row) => row.period),
    ['2023-12-31', '2024-12-31', '2025-12-31']
  );
  assert.equal(periods.at(-1)!.period, `${input.input.year}-12-31`);
  assert.ok(
    periods.every((row) => row.sourceUrls.length === 1 && row.sourceUrls[0] === urls.income)
  );
  assert.equal(input.context!.financials[0]!.sourceUrls.length, 3);
});
