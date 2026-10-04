import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { CompanyResearchRun } from '../shared/contracts.js';
import {
  contextAmountFields,
  type CompanyContextPeriod,
  type CompanyContextSnapshot,
} from '../shared/company-workspace.js';

// Pure, synthetic amount/source regressions. Browser tests own channel motion and navigation.
const cssHook = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: 'export {};', shortCircuit: true };
    return nextLoad(url, context);
  },
});
let deriveLiteCompanyFinance: typeof import('../src/showcase/LiteCompanyChannels.js').deriveLiteCompanyFinance;
try {
  ({ deriveLiteCompanyFinance } = await import('../src/showcase/LiteCompanyChannels.js'));
} finally {
  cssHook.deregister();
}

const fetchedAt = '2026-10-04T00:00:00.000Z';
const tables = {
  income: 'RPT_F10_FINANCE_GINCOME',
  cashflow: 'RPT_F10_FINANCE_GCASHFLOW',
  balance: 'RPT_F10_FINANCE_GBALANCE',
} as const;
function urls(year: number) {
  return Object.fromEntries(
    Object.entries(tables).map(([table, name]) => [
      table,
      `https://datacenter.eastmoney.com/api/data/v1/get?reportName=${name}&syntheticYear=${year}&syntheticCode=600519`,
    ])
  ) as Record<keyof typeof tables, string>;
}
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
      netProfit: '100.05',
      parentProfit: '70.02',
      ocf: '80.03',
      ...amounts,
    } as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: null, roe: null, revenueGrowth: null },
    auditOpinion: null,
    fieldSources: { netProfit: '东方财富', parentProfit: '东方财富', ocf: '东方财富' },
    sourceUrls: Object.values(urls(year)),
    originalUrl: `https://example.invalid/synthetic-company-annual-${year}.pdf`,
  };
}
function run(rows = [annual(2025)], year = 2025): CompanyResearchRun {
  const snapshot: CompanyContextSnapshot = {
    version: 1,
    securityCode: '600519',
    orgId: 'synthetic-channels-org',
    companyName: 'Synthetic channel company',
    fetchedAt,
    status: 'available',
    financials: rows,
    sources: Object.entries(urls(year)).map(([table, url]) => ({
      id: `em-${table}`,
      provider: '东方财富',
      dimension: '财务数据',
      url,
      status: 'available',
      fetchedAt,
      latestDate: null,
      count: rows.length,
      note: 'Synthetic fixture only; no source requests.',
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
    id: 'synthetic-lite-company-channels',
    input: { securityCode: snapshot.securityCode, orgId: snapshot.orgId, year },
    status: 'ready',
    createdAt: fetchedAt,
    updatedAt: fetchedAt,
    model: { requested: false, status: 'not-requested' },
    trace: [],
    announcements: [],
    context: snapshot,
  };
}

test('the finance stage uses the selected annual and its actual field sources, without latest or sample substitution', () => {
  const interim = { ...annual(2026), period: '2026-06-30', annual: false };
  const input = run(
    [
      annual(2023, { netProfit: '3000.00' }),
      annual(2024, { netProfit: '40.01', ocf: '14.02' }),
      annual(2025, { netProfit: '-5000.00', ocf: '-9000.00' }),
      interim,
    ],
    2024
  );
  const before = structuredClone(input);
  const view = deriveLiteCompanyFinance(input, 'consolidated', 'zh-Hans');
  assert.equal(view.annual?.period, '2024-12-31');
  assert.equal(view.profit?.exactYuan, '40.01');
  assert.equal(view.cash?.exactYuan, '14.02');
  assert.equal(view.differenceYuan, '25.99');
  assert.deepEqual(
    view.sources.map(({ field, href }) => ({ field, href })),
    [
      { field: 'netProfit', href: urls(2024).income },
      { field: 'ocf', href: urls(2024).cashflow },
    ]
  );
  assert.equal(view.originalHref, 'https://example.invalid/synthetic-company-annual-2024.pdf');
  assert.deepEqual(input, before);
});

test('changing the reading basis changes only the selected profit input and its source binding', () => {
  const input = run();
  const before = structuredClone(input);
  const consolidated = deriveLiteCompanyFinance(input, 'consolidated', 'en');
  const parent = deriveLiteCompanyFinance(input, 'parent', 'en');
  assert.equal(consolidated.profitField, 'netProfit');
  assert.equal(parent.profitField, 'parentProfit');
  assert.equal(consolidated.profit?.exactYuan, '100.05');
  assert.equal(parent.profit?.exactYuan, '70.02');
  assert.equal(consolidated.differenceYuan, '20.02');
  assert.equal(parent.differenceYuan, '-10.01');
  assert.equal(parent.cash?.exactYuan, consolidated.cash?.exactYuan);
  assert.deepEqual(
    parent.sources.map((source) => source.field),
    ['parentProfit', 'ocf']
  );
  assert.deepEqual(input, before);
});

test('missing years, conflicted fields, failed sources and other issuers never supply a chart or calculated gap', async (t) => {
  await t.test('no selected annual is borrowed from another year or an interim row', () => {
    const input = run([
      annual(2024),
      annual(2026),
      { ...annual(2025), period: '2025-06-30', annual: false },
    ]);
    const view = deriveLiteCompanyFinance(input, 'consolidated', 'zh-Hans');
    assert.equal(view.state, 'missing');
    assert.equal(view.annual, null);
    assert.equal(view.profit, null);
    assert.equal(view.cash, null);
    assert.equal(view.differenceYuan, null);
    assert.deepEqual(view.bars, []);
    assert.deepEqual(view.sources, []);
    assert.equal(view.originalHref, null);
  });
  await t.test('one missing input preserves the other exact value', () => {
    const view = deriveLiteCompanyFinance(
      run([annual(2025, { ocf: null })]),
      'consolidated',
      'zh-Hans'
    );
    assert.equal(view.profit?.exactYuan, '100.05');
    assert.equal(view.cash, null);
    assert.equal(view.difference, null);
    assert.deepEqual(view.bars, []);
  });
  await t.test('a recorded disagreement is not resolved by using its primary amount', () => {
    const input = run();
    input.context!.comparisons.push({
      period: '2025-12-31',
      field: 'netProfit',
      primary: '100.05',
      secondary: '100.06',
      difference: '-0.01',
      matches: false,
    });
    const view = deriveLiteCompanyFinance(input, 'consolidated', 'en');
    assert.equal(view.profit, null);
    assert.equal(view.cash?.exactYuan, '80.03');
    assert.equal(view.differenceYuan, null);
    assert.deepEqual(view.bars, []);
    assert.equal(input.context!.financials[0]!.amounts.netProfit, '100.05');
  });
  await t.test('a failed income source cannot support profit or its difference', () => {
    const input = run();
    input.context!.sources.find((source) => source.id === 'em-income')!.status = 'error';
    const view = deriveLiteCompanyFinance(input, 'consolidated', 'en');
    assert.equal(view.profit, null);
    assert.equal(view.cash?.exactYuan, '80.03');
    assert.equal(view.differenceYuan, null);
    assert.deepEqual(view.bars, []);
    assert.deepEqual(
      view.sources.map((source) => source.field),
      ['ocf']
    );
  });
  await t.test('a same-code snapshot with a different organization is withheld', () => {
    const input = run();
    input.context!.orgId = 'another-synthetic-organization';
    const view = deriveLiteCompanyFinance(input, 'consolidated', 'en');
    assert.equal(view.state, 'mismatch');
    assert.equal(view.profit, null);
    assert.equal(view.cash, null);
    assert.equal(view.differenceYuan, null);
    assert.deepEqual(view.bars, []);
    assert.deepEqual(view.sources, []);
    assert.equal(view.originalHref, null);
  });
});

test('zero, signed amounts and a difference exceeding the input bound remain exact on a shared scale', async (t) => {
  const cases = [
    { name: 'both zero', profit: '0.00', cash: '0.00', difference: '0.00', signed: false },
    {
      name: 'zero and negative cash',
      profit: '0.00',
      cash: '-100.01',
      difference: '100.01',
      signed: true,
    },
    {
      name: 'two large close amounts differ by two fen',
      profit: '9007199254740993.01',
      cash: '9007199254740992.99',
      difference: '0.02',
      signed: false,
    },
    {
      name: 'opposite bounded signs yield an exact extra-digit difference',
      profit: '99999999999999999999.99',
      cash: '-99999999999999999999.99',
      difference: '199999999999999999999.98',
      signed: true,
    },
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const view = deriveLiteCompanyFinance(
        run([annual(2025, { netProfit: fixture.profit, ocf: fixture.cash })]),
        'consolidated',
        'en'
      );
      assert.equal(view.profit?.exactYuan, fixture.profit);
      assert.equal(view.cash?.exactYuan, fixture.cash);
      assert.equal(view.differenceYuan, fixture.difference);
      assert.equal(view.difference?.exactYuan, fixture.difference);
      assert.equal(view.profit?.scale, view.cash?.scale);
      assert.equal(view.signed, fixture.signed);
      assert.equal(view.bars.length, 2);
      assert.ok(
        view.bars.every(
          (bar) =>
            Number.isFinite(bar.width) &&
            bar.width >= 0 &&
            bar.start >= 0 &&
            bar.start + bar.width <= 100
        )
      );
      if (fixture.name === 'both zero')
        assert.deepEqual(view.bars, [
          { width: 0, start: 0 },
          { width: 0, start: 0 },
        ]);
      if (fixture.name === 'zero and negative cash')
        assert.deepEqual(view.bars, [
          { width: 0, start: 50 },
          { width: 50, start: 0 },
        ]);
      if (fixture.difference.length > 23) {
        assert.equal(view.difference?.approximate, false);
        assert.equal(view.difference?.exactText, 'CNY 199,999,999,999,999,999,999.98');
      }
    });
  }
});
