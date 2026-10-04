import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import type { AssessmentMetric } from '../shared/company-assessment.js';
import type { CompanyReportDocumentDimension } from '../shared/company-report-document.js';
import {
  deriveReportProfitCashPeriods,
  deriveReportRadarPoints,
  reportChartExactAmount,
  reportChartScaledAmount,
} from '../shared/company-report-charts.js';
import { AppContext, type AppContextValue } from '../src/context.js';

// These synthetic render cases test chart semantics, not provider availability.
const cssHook = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: 'export {};', shortCircuit: true };
    return nextLoad(url, context);
  },
});
let charts: typeof import('../src/CompanyReportCharts.js');
try {
  charts = await import('../src/CompanyReportCharts.js');
} finally {
  cssHook.deregister();
}

function metric(
  id: string,
  value: string | null,
  status: AssessmentMetric['status'] = 'available',
  unit: AssessmentMetric['unit'] = 'CNY'
): AssessmentMetric {
  return {
    id,
    value,
    status,
    unit,
    label: [id, id],
    display: [String(value), String(value)],
    evidenceIds: ['synthetic-source'],
    formula: ['测试人民币合并口径', 'Synthetic consolidated CNY'],
  };
}

function dimension(
  id: CompanyReportDocumentDimension['id'],
  score: number | null,
  status: CompanyReportDocumentDimension['status'] = 'balanced'
): CompanyReportDocumentDimension {
  return {
    id,
    score,
    status,
    label: [id, id],
    judgment: {
      id,
      provenance: 'rules',
      text: { zh: '测试规则', en: 'Synthetic rule' },
      metricIds: [],
      evidenceIds: [],
      binding: {
        runId: 'synthetic-chart-run',
        securityCode: '000001',
        orgId: 'synthetic-chart-org',
        year: 2025,
        basis: 'consolidated',
        snapshotFetchedAt: '2026-10-04T00:00:00Z',
        reportGeneratedAt: '2026-10-04T00:01:00Z',
      },
    },
  };
}

function renderChart<P extends object>(element: ComponentType<P>, props: P) {
  const app: AppContextValue = {
    locale: 'zh-Hans',
    t: (zh: string) => zh,
    workspace: null,
    cases: [],
    user: null,
    registrationEnabled: false,
    refresh: async () => {},
    navigate: () => {},
    execute: async (action) => action(),
    confirm: () => {},
    showEvidence: () => {},
    busy: false,
  };
  return load(
    renderToStaticMarkup(
      createElement(AppContext.Provider, { value: app }, createElement(element, props))
    )
  );
}

test('report charts keep the selected consecutive annual scope without borrowing an older year or attributable profit', () => {
  const periods = deriveReportProfitCashPeriods(
    [metric('2022-netProfit', '100'), metric('2025-parentProfit', '300'), metric('2025-ocf', '80')],
    2025
  );
  assert.deepEqual(
    periods.map((period) => period.year),
    [2023, 2024, 2025]
  );
  assert.equal(periods[0]!.profit.fen, null);
  assert.equal(periods[2]!.profit.fen, null);
  assert.equal(periods[2]!.cash.fen, 8000n);
  assert.equal(periods[2]!.differenceFen, null);
  assert.equal(periods[2]!.ratio.value, null);
  assert.deepEqual(deriveReportProfitCashPeriods([], 2025.5), []);
});

test('missing, conflicting, duplicate, invalid and non-CNY amounts are withheld instead of becoming zero', () => {
  for (const [facts, state] of [
    [[metric('2025-netProfit', null, 'missing')], 'missing'],
    [[metric('2025-netProfit', '20', 'conflict')], 'conflict'],
    [[metric('2025-netProfit', '20'), metric('2025-netProfit', '21')], 'conflict'],
    [[metric('2025-netProfit', '20', 'available', 'percent')], 'invalid-scope'],
    [[metric('2025-netProfit', '20.001')], 'invalid-value'],
    [[metric('2025-netProfit', 'NaN')], 'invalid-value'],
  ] as const) {
    const period = deriveReportProfitCashPeriods(facts, 2025).at(-1)!;
    assert.equal(period.profit.state, state);
    assert.equal(period.profit.fen, null);
    assert.equal(period.differenceFen, null);
  }
});

test('negative operating cash stays signed while zero or negative profit withholds the ratio', () => {
  const signed = deriveReportProfitCashPeriods(
    [metric('2025-netProfit', '100'), metric('2025-ocf', '-30.50')],
    2025
  ).at(-1)!;
  assert.equal(signed.cash.fen, -3050n);
  assert.equal(signed.differenceFen, 13050n);
  assert.equal(signed.ratio.value, '-30.50');
  for (const profit of ['0', '-100']) {
    const period = deriveReportProfitCashPeriods(
      [metric('2025-netProfit', profit), metric('2025-ocf', '20')],
      2025
    ).at(-1)!;
    assert.equal(period.ratio.state, 'not-applicable');
    assert.equal(period.ratio.value, null);
  }
});

test('differences and ratios retain integer-fen precision beyond safe float integers', () => {
  const period = deriveReportProfitCashPeriods(
    [
      metric('2025-netProfit', '99999999999999999999.99'),
      metric('2025-ocf', '99999999999999999999.98'),
    ],
    2025
  ).at(-1)!;
  assert.equal(period.differenceFen, 1n);
  assert.equal(reportChartExactAmount(period.profit.fen!), '99999999999999999999.99');
  assert.equal(period.ratio.value, '100.00');
  assert.equal(reportChartScaledAmount(1n, 100_000_000), '0.0000000001');
  assert.equal(reportChartScaledAmount(-1n, 100_000_000), '-0.0000000001');
  assert.equal(reportChartScaledAmount(126000000000n, 100_000_000), '12.60');
  assert.throws(() => reportChartScaledAmount(1n, 0), RangeError);
});

test('radar preserves four core rule scores in fixed order, including zero, while withholding unknown/conflicted values', () => {
  const points = deriveReportRadarPoints([
    dimension('workingCapital', 100),
    dimension('industry', 100),
    dimension('cash', 25),
    dimension('profitability', 0, 'high-pressure'),
    dimension('solvency', 60, 'unknown'),
  ]);
  assert.deepEqual(
    points.map((point) => point.id),
    ['profitability', 'cash', 'solvency', 'workingCapital']
  );
  assert.deepEqual(
    points.map((point) => point.score),
    [0, 25, null, 100]
  );
  assert.equal(deriveReportRadarPoints([dimension('cash', 25, 'conflict')])[1]!.score, null);
  assert.equal(
    deriveReportRadarPoints([dimension('cash', 25), dimension('cash', 25)])[1]!.state,
    'conflict'
  );
  for (const score of [NaN, Infinity, -1, 101])
    assert.equal(deriveReportRadarPoints([dimension('cash', score)])[1]!.score, null);
});

test('bar geometry uses a shared signed axis and omits unavailable fields while retaining exact accessible data', () => {
  const $ = renderChart(charts.CompanyReportProfitCashChart, {
    facts: [
      metric('2025-netProfit', '100'),
      metric('2025-ocf', '-50'),
      metric('2024-netProfit', '0'),
    ],
    year: 2025,
  });
  assert.equal($('[data-metric-id="2025-netProfit"] rect').length, 1);
  assert.equal($('[data-metric-id="2025-ocf"] rect').length, 1);
  const profitHeight = Number($('[data-metric-id="2025-netProfit"] rect').attr('height'));
  const cashHeight = Number($('[data-metric-id="2025-ocf"] rect').attr('height'));
  assert.ok(Math.abs(profitHeight - cashHeight * 2) < 1e-8);
  assert.equal($('[data-missing-metric="2024-ocf"] rect').length, 0);
  assert.equal($('[data-metric-id="2024-netProfit"] line').length, 1);
  assert.match($('table').text(), /100\.00/);
  assert.match($('desc').text(), /-50\.00 CNY/);
  assert.match($('table').text(), /未取得/);
  assert.equal($('svg title').length > 0, true);
});

test('a partial radar never closes a filled polygon; a real zero remains a plotted center score', () => {
  const partial = renderChart(charts.CompanyReportRadar, {
    dimensions: [
      dimension('profitability', 0),
      dimension('cash', 25),
      dimension('workingCapital', 100),
    ],
  });
  assert.equal(partial('polygon').length, 0);
  assert.equal(partial('[data-dimension="solvency"] circle').length, 0);
  assert.equal(
    partial('[data-dimension="profitability"][data-score="0"] circle').attr('cx'),
    '150'
  );
  const complete = renderChart(charts.CompanyReportRadar, {
    dimensions: [
      dimension('profitability', 0),
      dimension('cash', 25),
      dimension('solvency', 60),
      dimension('workingCapital', 100),
    ],
  });
  assert.equal(complete('polygon').length, 1);
  assert.match(complete('polygon').attr('points')!, /^150,150 /);
});
