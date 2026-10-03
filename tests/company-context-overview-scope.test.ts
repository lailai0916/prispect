import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { companyContextOverviewAnalysis } from '../shared/company-financial-overview.js';
import { contextAmountFields, type CompanyContextPeriod } from '../shared/company-workspace.js';
import { AppContext, type AppContextValue } from '../src/context.js';
import { CompanyContextOverview } from '../src/CompanyContextViews.js';

function fixture(): CompanyResearchRun {
  const rows: CompanyContextPeriod[] = [2022, 2023, 2024, 2025].map((year) => ({
    period: `${year}-12-31`,
    annual: true,
    noticeDate: null,
    amounts: {
      ...Object.fromEntries(contextAmountFields.map((field) => [field, null])),
      revenue: '1000.00',
      netProfit: year === 2025 ? '-999.00' : '123.00',
      parentProfit: '100.00',
      ocf: '130.00',
      cash: '200.00',
      shortLoan: '100.00',
      currentPortionDebt: '0.00',
    } as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: null, roe: null, revenueGrowth: null },
    auditOpinion: null,
    fieldSources: {},
    sourceUrls: [
      'https://datacenter.eastmoney.com/api/data/v1/get?reportName=RPT_F10_FINANCE_GINCOME',
    ],
    originalUrl: null,
  }));
  return {
    id: 'synthetic-selected-scope',
    input: { securityCode: '600519', orgId: 'synthetic-org', year: 2024 },
    status: 'ready',
    createdAt: '2026-10-03T00:00:00Z',
    updatedAt: '2026-10-03T00:00:00Z',
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-called' },
    context: {
      version: 1,
      securityCode: '600519',
      orgId: 'synthetic-org',
      companyName: 'Synthetic scoped fixture',
      fetchedAt: '2026-10-03T00:00:00Z',
      status: 'available',
      financials: rows,
      sources: [],
      comparisons: [],
      profile: {},
      shareholders: [],
      announcements: [],
      news: [],
      verificationLinks: [],
      warnings: [],
    },
  };
}
function render(run: CompanyResearchRun, selectedYear?: number) {
  return load(
    renderToStaticMarkup(
      createElement(
        AppContext.Provider,
        { value: { locale: 'zh-Hans', t: (zh: string) => zh } as unknown as AppContextValue },
        createElement(CompanyContextOverview, {
          run,
          snapshot: run.context!,
          basis: 'consolidated',
          view: 'manager',
          selectedYear,
        })
      )
    )
  );
}
test('an explicit selected year renders checked annual amounts instead of a newer available year', () => {
  const input = fixture();
  const before = structuredClone(input);
  const $ = render(input, 2024);
  const first = $('.context-question-cards > article').first().text();
  assert.match(first, /2024-12-31/);
  assert.match(first, /123\.00/);
  assert.match(first, /最近完整年度利润为正/);
  assert.doesNotMatch(first, /2025|-999/);
  assert.equal(
    companyContextOverviewAnalysis(input.context!, input, 'consolidated', 2024).threeYear.profit,
    '369.00'
  );
  assert.deepEqual(input, before);
});
test('an unavailable explicit year withholds summary metrics while retaining historical rows', () => {
  const input = fixture();
  input.context!.financials = input.context!.financials.filter(
    (row) => row.period !== '2024-12-31'
  );
  const $ = render(input, 2024);
  const first = $('.context-question-cards > article').first().text();
  assert.match(first, /利润数据待补|报告期未知/);
  assert.doesNotMatch(first, /123\.00|2023-12-31|2025-12-31/);
  assert.equal($('.context-metric-worksheet').length, 0);
  assert.match($('.context-section').text(), /2022|2023/);
  assert.equal(
    companyContextOverviewAnalysis(input.context!, input, 'consolidated', 2024).shortDebt,
    null
  );
});
test('omitting selectedYear retains the full history and latest annual behavior', () => {
  const input = fixture();
  const $ = render(input);
  assert.match($('.context-question-cards > article').first().text(), /2025-12-31|-999\.00/);
  assert.match($('.context-section').text(), /2022/);
  assert.match($('.context-section').text(), /2025/);
  assert.equal(
    companyContextOverviewAnalysis(input.context!, input, 'consolidated').annuals.length,
    4
  );
});
