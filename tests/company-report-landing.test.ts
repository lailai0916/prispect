import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import type { CompanyResearchRun } from '../shared/contracts.js';
import {
  companyPath,
  companySections,
  contextAmountFields,
  type CompanyContextPeriod,
} from '../shared/company-workspace.js';
import type { CompanyReadingBasis } from '../shared/company-analysis.js';
import { AppContext, type AppContextValue } from '../src/context.js';
import { CompanyReportLanding } from '../src/CompanyReportLanding.js';

const fetchedAt = '2026-10-03T00:00:00.000Z';
const sourceUrl = 'https://datacenter.eastmoney.com/api/data/v1/get';

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
      ocf: '90.00',
      cash: '150.00',
      shortLoan: '60.00',
      currentPortionDebt: '40.00',
      ...amounts,
    } as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: null, roe: null, revenueGrowth: null },
    auditOpinion: null,
    fieldSources: Object.fromEntries(contextAmountFields.map((field) => [field, '东方财富'])),
    sourceUrls: [sourceUrl],
    originalUrl: null,
  };
}

function fixture(
  rows = [annual(2023), annual(2024), annual(2025)],
  year = 2025
): CompanyResearchRun {
  return {
    id: 'report-landing-fixture',
    input: { securityCode: '600519', orgId: 'fixture-org', year, researchMode: 'financial' },
    status: 'ready',
    createdAt: fetchedAt,
    updatedAt: fetchedAt,
    model: { requested: false, status: 'not-called' },
    trace: [],
    announcements: [],
    contextStatus: 'ready',
    context: {
      version: 1,
      securityCode: '600519',
      orgId: 'fixture-org',
      companyName: 'Synthetic report fixture',
      fetchedAt,
      status: 'available',
      financials: rows,
      sources: ['income', 'cashflow', 'balance'].map((table) => ({
        id: `em-${table}`,
        provider: '东方财富',
        dimension: '财务数据',
        url: sourceUrl,
        status: 'available',
        fetchedAt,
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
    },
  };
}

function render(
  run: CompanyResearchRun,
  basis: CompanyReadingBasis = 'parent',
  locale: 'zh-Hans' | 'en' = 'zh-Hans'
) {
  const value = {
    locale,
    t: (zh: string, en: string) => (locale === 'en' ? en : zh),
    user: null,
  } as AppContextValue;
  return load(
    renderToStaticMarkup(
      createElement(
        AppContext.Provider,
        { value },
        createElement(CompanyReportLanding, {
          run,
          basis,
          reportHref: `${companyPath(run.id)}&report=ai`,
        })
      )
    )
  );
}

test('one report exposes acquired findings, selected-year amounts and six canonical data destinations before AI completes', () => {
  const run = fixture();
  const before = structuredClone(run);
  for (const locale of ['zh-Hans', 'en'] as const) {
    const $ = render(run, 'parent', locale);
    assert.equal($('.company-report-metrics > div').length, 4);
    assert.equal(
      $('.company-report-metrics [data-field="parentProfit"] dd').text(),
      locale === 'en' ? '80.00 CNY' : '80.00元'
    );
    assert.equal($('.company-report-signals > div').length, 3);
    assert.equal($('.company-ai-core-grade').length, 0);
    assert.equal($('.company-report-detail-link').length, 6);
    for (const section of [
      'trends',
      'industry',
      'disclosures',
      'profile',
      'coverage',
      'sources',
    ] as const) {
      const [, zh, en] = companySections.find(([key]) => key === section)!;
      assert.equal(
        $(`a[href="${companyPath(run.id, section)}"] strong`).text(),
        locale === 'en' ? en : zh
      );
    }
  }
  assert.deepEqual(run, before);
});

test('chart and key figures follow selected year and reading basis without plotting future source years', () => {
  const run = fixture(
    [
      annual(2023),
      annual(2024, { parentProfit: '42.00', netProfit: '64.00' }),
      annual(2025, { parentProfit: '999.00' }),
    ],
    2024
  );
  const parent = render(run);
  assert.equal(parent('.company-report-metrics [data-field="parentProfit"] dd').text(), '42.00元');
  assert.equal(
    parent('[data-period="2024-12-31"] [data-field="parentProfit"]').attr('data-value'),
    '42.00'
  );
  assert.equal(parent('[data-period="2025-12-31"]').length, 0);
  const consolidated = render(run, 'consolidated');
  assert.equal(
    consolidated('.company-report-metrics [data-field="netProfit"] dd').text(),
    '64.00元'
  );
  assert.equal(
    consolidated('[data-period="2024-12-31"] [data-field="netProfit"]').attr('data-value'),
    '64.00'
  );
});

test('missing chosen year remains unavailable while acquired historical years keep their actual labels', () => {
  const $ = render(fixture([annual(2023), annual(2024)], 2025));
  assert.equal($('.company-report-metrics [data-available="false"]').length, 4);
  assert.equal($('[data-period="2025-12-31"]').length, 0);
  assert.equal($('.company-report-chart-year').text(), '20232024');
  assert.match($('.company-report-data-warning').text(), /尚未取得 2025 年年度数据/);
});

test('chart distinguishes missing, conflicting, zero and negative values without dropping valid companion amounts', () => {
  const run = fixture([
    annual(2023, { parentProfit: '0.00', ocf: '-10.00' }),
    annual(2024, { parentProfit: null, ocf: '20.00' }),
    annual(2025, { parentProfit: '80.00', ocf: '30.00' }),
  ]);
  run.context!.comparisons.push({
    period: '2025-12-31',
    field: 'parentProfit',
    primary: '80.00',
    secondary: '81.00',
    difference: '1.00',
    matches: false,
  });
  const $ = render(run);
  assert.equal($('[data-period="2023-12-31"] line[data-value="0.00"]').length, 1);
  assert.equal($('[data-period="2023-12-31"] [data-field="ocf"]').attr('data-value'), '-10.00');
  assert.equal($('[data-period="2024-12-31"] [data-missing="parentProfit"]').length, 1);
  assert.equal($('[data-period="2024-12-31"] [data-field="ocf"]').attr('data-value'), '20.00');
  assert.equal($('[data-period="2025-12-31"] [data-missing="parentProfit"]').length, 1);
  assert.equal($('.company-report-metrics [data-field="parentProfit"] dd').text(), '未取得');
  assert.equal($('[data-period="2025-12-31"] [data-field="ocf"]').attr('data-value'), '30.00');
  assert.doesNotMatch($.html(), /NaN|Infinity/);
});

test('issuer mismatch and wholly missing series withhold amounts and do not draw empty axes', () => {
  const run = fixture();
  run.context!.orgId = 'different-issuer';
  const mismatch = render(run);
  assert.equal(mismatch('[data-testid="company-report-cash-chart"]').length, 0);
  assert.equal(mismatch('.company-report-metrics [data-available="false"]').length, 4);
  assert.match(mismatch('.company-report-data-warning').text(), /主体与本次研究不一致/);
  const missing = render(fixture([annual(2025, { parentProfit: null, ocf: null })]));
  assert.equal(missing('[data-testid="company-report-cash-chart"]').length, 0);
  assert.equal(missing('.company-report-chart-empty').length, 1);
});
