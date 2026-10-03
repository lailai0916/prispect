import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import type { CompanyResearchRun } from '../shared/contracts.js';
import {
  contextAmountFields,
  type CompanyContextSnapshot,
  type CompanyContextPeriod,
} from '../shared/company-workspace.js';
import { AppContext, type AppContextValue } from '../src/context.js';
import { CompanyContextOverview, CompanyCoverageView } from '../src/CompanyContextViews.js';
import { CompanyContextHistory } from '../src/CompanyContextHistory.js';
import {
  ChartMetricSummary,
  HistoryMetricChart,
  IndustryPairChart,
  financialChartAmountScale,
} from '../src/FinancialCharts.js';

function fixture(profit: string | null): CompanyResearchRun {
  const row: CompanyContextPeriod = {
    period: '2025-12-31',
    annual: true,
    noticeDate: null,
    amounts: {
      ...Object.fromEntries(contextAmountFields.map((field) => [field, null])),
      netProfit: profit,
      parentProfit: '12.00',
      ocf: '0.00',
    } as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: null, roe: null, revenueGrowth: null },
    auditOpinion: null,
    fieldSources: {},
    sourceUrls: [],
    originalUrl: null,
  };
  const context: CompanyContextSnapshot = {
    version: 1,
    securityCode: '600519',
    orgId: 'fixture-org',
    companyName: '界面回归样本',
    fetchedAt: '2026-10-03T00:00:00Z',
    status: 'partial',
    financials: [row],
    sources: [],
    comparisons: [],
    profile: {},
    shareholders: [],
    announcements: [],
    news: [],
    verificationLinks: [],
    warnings: [],
  };
  return {
    id: 'fixture',
    input: { securityCode: context.securityCode, orgId: context.orgId, year: 2025 },
    status: 'adopted',
    createdAt: context.fetchedAt,
    updatedAt: context.fetchedAt,
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-called' },
    context,
  };
}

function overview(run: CompanyResearchRun, locale: 'zh-Hans' | 'en' = 'zh-Hans') {
  return renderToStaticMarkup(
    createElement(
      AppContext.Provider,
      { value: { locale, t: (zh, en) => (locale === 'en' ? en : zh) } as AppContextValue },
      createElement(CompanyContextOverview, {
        snapshot: run.context!,
        run,
        basis: 'consolidated',
        view: 'public',
      })
    )
  );
}

test('company overview distinguishes zero, missing and signed profit in both locales', () => {
  const zero = overview(fixture('0.00'));
  assert.match(zero, /最近完整年度利润为零/);
  assert.doesNotMatch(zero, /最近完整年度利润为正|利润数据待补/);
  assert.match(overview(fixture('0.00'), 'en'), /Latest full-year profit is zero/);
  assert.match(overview(fixture(null)), /利润数据待补/);
  assert.match(overview(fixture('-0.01')), /最近完整年度利润为负/);
  assert.match(overview(fixture('0.01')), /最近完整年度利润为正/);
});

test('adopted original evidence is reported as adopted in coverage and detailed overview', () => {
  const run = fixture('0.00');
  const coverage = renderToStaticMarkup(
    createElement(
      AppContext.Provider,
      { value: { t: (zh: string) => zh } as unknown as AppContextValue },
      createElement(CompanyCoverageView, { snapshot: run.context!, run })
    )
  );
  assert.match(coverage, /原件已采用/);
  assert.doesNotMatch(coverage, /尚未形成候选|已有候选，待确认采用/);
  assert.match(overview(run), /原件材料已确认采用/);
  assert.doesNotMatch(overview(run), /仍需确认后采用|原件读取尚未完成/);
  assert.match(overview(run, 'en'), /Original evidence has been confirmed and adopted/);
});

test('financial-history axes show distinct ticks with matching currency units across amount sizes', () => {
  for (const [profit, cash, zhUnit, enUnit] of [
    ['0.01', '0.00', '元', 'CNY'],
    ['1000.00', '800.00', '元', 'CNY k'],
    ['10000000.00', '8000000.00', '万元', 'CNY m'],
    ['1000000000.00', '800000000.00', '亿元', 'CNY bn'],
    ['-10000000.00', '0.00', '万元', 'CNY m'],
    ['0.00', '0.00', '元', 'CNY'],
  ]) {
    for (const locale of ['zh-Hans', 'en'] as const) {
      const run = fixture(profit);
      run.context!.financials[0]!.amounts.ocf = cash;
      const html = renderToStaticMarkup(
        createElement(
          AppContext.Provider,
          {
            value: {
              locale,
              t: (zh, en) => (locale === 'en' ? en : zh),
            } as AppContextValue,
          },
          createElement(CompanyContextHistory, { snapshot: run.context!, basis: 'consolidated' })
        )
      );
      const $ = load(html);
      const chart = $('.financial-chart-card').first();
      const labels = chart
        .find('.financial-chart-scroll svg > g > text[text-anchor="end"]')
        .map((_index, element) => $(element).text())
        .get();
      assert.ok(labels.length >= 3 && labels.length <= 7);
      assert.equal(
        new Set(labels).size,
        labels.length,
        `${locale}, profit ${profit}: ${labels.join(', ')}`
      );
      const numbers = labels.map((label) => Number(label.replaceAll(',', '')));
      assert.ok(numbers.every(Number.isFinite));
      assert.ok(numbers.every((value, index) => index === 0 || value > numbers[index - 1]!));
      const unit = locale === 'en' ? enUnit : zhUnit;
      assert.equal(
        chart.find('.financial-chart-unit').text(),
        locale === 'en' ? unit : `人民币 · ${unit}`
      );
      assert.ok(chart.find('.financial-chart-scroll svg').attr('aria-label')?.includes(unit));
      const cashTicks = $('.financial-chart-card')
        .eq(1)
        .find('.financial-chart-scroll svg > g > text[text-anchor="end"]')
        .map((_index, element) => $(element).text())
        .get();
      assert.deepEqual(cashTicks, labels, 'profit and cash must use identical amount scales');
      assert.equal(
        $('.context-exact-fields article').first().find('strong').text().includes('—'),
        false
      );
    }
  }
});

test('small percentage comparison ticks stay distinct instead of rounding every mark to zero', () => {
  for (const locale of ['zh-Hans', 'en'] as const) {
    const html = renderToStaticMarkup(
      createElement(
        AppContext.Provider,
        {
          value: {
            locale,
            t: (zh: string, en: string) => (locale === 'en' ? en : zh),
          } as AppContextValue,
        },
        createElement(IndustryPairChart, { company: 0.01, peer: 0.03, label: 'ratio' })
      )
    );
    const $ = load(html);
    const ticks = $('svg > g > text[text-anchor="middle"]')
      .map((_index, element) => $(element).text())
      .get();
    assert.ok(ticks.length >= 3);
    assert.equal(new Set(ticks).size, ticks.length);
    assert.ok(ticks.some((tick) => tick.includes('0.01')));
  }
});

function chartMarkup(element: ReactElement, locale: 'zh-Hans' | 'en' = 'zh-Hans') {
  return renderToStaticMarkup(
    createElement(
      AppContext.Provider,
      {
        value: {
          locale,
          t: (zh: string, en: string) => (locale === 'en' ? en : zh),
        } as AppContextValue,
      },
      element
    )
  );
}

test('history retains the complete themed scan and supplementary working-capital amounts', () => {
  const $ = load(
    chartMarkup(
      createElement(CompanyContextHistory, {
        snapshot: fixture('12.00').context!,
        basis: 'consolidated',
      })
    )
  );
  assert.equal($('.context-tabs [role="tab"]').length, 5);
  assert.equal($('.context-tabs [role="tab"]').last().text(), '全部图表');
  assert.equal($('.context-tabs [aria-selected="true"]').text(), '利润与经营现金');
  const visible = $('.financial-chart-group:not([hidden])');
  assert.equal(visible.length, 1);
  assert.deepEqual(
    visible
      .find('[data-chart-metric]')
      .map((_index, element) => $(element).attr('data-chart-metric'))
      .get(),
    ['ocf', 'profit', 'ocfToRevenue', 'netMargin']
  );
  assert.equal($('.financial-chart-group-heading').length, 4);
  assert.deepEqual(
    $('[data-chart-group="debt"] > .financial-chart-grid [data-chart-metric]')
      .map((_index, element) => $(element).attr('data-chart-metric'))
      .get(),
    ['cash', 'shortDebt', 'shortLoan', 'currentPortionDebt']
  );
  assert.deepEqual(
    $('.financial-chart-supplement [data-chart-metric]')
      .map((_index, element) => $(element).attr('data-chart-metric'))
      .get(),
    ['inventory', 'receivables']
  );
});

test('each amount card shares one unit across primary values, difference and axis without losing raw titles', () => {
  const points = [{ period: '2025-12-31', company: 1_200_000_000, peer: 4_000_000, count: 5 }];
  for (const locale of ['zh-Hans', 'en'] as const) {
    const amountScale = financialChartAmountScale(points, locale);
    const $ = load(
      chartMarkup(
        createElement(
          'article',
          {},
          createElement(ChartMetricSummary, { ...points[0]!, unit: 'amount', amountScale }),
          createElement(HistoryMetricChart, {
            points,
            style: 'bars',
            unit: 'amount',
            label: 'Amount',
            selectedPeriod: points[0]!.period,
            onPeriodChange: () => undefined,
            amountScale,
          })
        ),
        locale
      )
    );
    assert.equal($('.financial-chart-values dd').length, 2);
    $('.financial-chart-values dd').each((_index, element) => {
      assert.ok($(element).text().endsWith(amountScale.label));
    });
    assert.ok($('.financial-chart-difference strong').text().endsWith(amountScale.label));
    assert.ok($('.financial-chart-unit').text().endsWith(amountScale.label));
    assert.match($('.financial-chart-values dd').first().attr('title') || '', /1,200,000,000/);
    assert.match($('rect.financial-chart-company-bar title').text(), /1,200,000,000/);
    assert.ok(
      Number($('rect.financial-chart-company-bar').attr('x')) <
        Number($('rect.financial-chart-peer-bar').attr('x'))
    );
  }
  const tiny = load(
    chartMarkup(
      createElement(ChartMetricSummary, {
        company: 0.01,
        peer: 1_000_000_000,
        count: 5,
        unit: 'amount',
        amountScale: financialChartAmountScale(
          [{ ...points[0]!, company: 0.01, peer: 1_000_000_000 }],
          'en'
        ),
      }),
      'en'
    )
  );
  assert.equal(Number(tiny('.financial-chart-values dd').first().text().split(' ')[0]), 1e-11);
});

test('coincident history markers retain both series and missing annual observations break lines', () => {
  for (const style of ['lines', 'dumbbell'] as const) {
    const $ = load(
      chartMarkup(
        createElement(HistoryMetricChart, {
          points: [{ period: '2025-12-31', company: 4, peer: 4, count: 5 }],
          style,
          unit: 'percent',
          label: 'Ratio',
          selectedPeriod: '2025-12-31',
          onPeriodChange: () => undefined,
        })
      )
    );
    assert.deepEqual(
      $('circle')
        .map((_index, element) => $(element).attr('class'))
        .get(),
      ['financial-chart-peer-dot', 'financial-chart-company-dot']
    );
    assert.equal($('circle').first().attr('cx'), $('circle').last().attr('cx'));
    assert.equal($('circle').first().attr('cy'), $('circle').last().attr('cy'));
    assert.ok(Number($('circle').first().attr('r')) > Number($('circle').last().attr('r')));
  }
  const $ = load(
    chartMarkup(
      createElement(HistoryMetricChart, {
        points: [
          { period: '2021-12-31', company: -2, peer: null, count: null },
          { period: '2022-12-31', company: 3, peer: null, count: null },
          { period: '2024-12-31', company: 4, peer: null, count: null },
          { period: '2025-12-31', company: null, peer: null, count: null },
          { period: '2026-12-31', company: 6, peer: null, count: null },
        ],
        style: 'lines',
        unit: 'percent',
        label: 'Ratio',
        selectedPeriod: '2024-12-31',
        onPeriodChange: () => undefined,
      })
    )
  );
  assert.deepEqual(
    $('line[data-segment]')
      .map((_index, element) => $(element).attr('data-segment'))
      .get(),
    ['2021-12-31:2022-12-31']
  );
  assert.equal($('g[role="button"][tabindex="0"]').attr('aria-pressed'), 'true');
});

test('fully missing metrics show a named unavailable state instead of empty axes', () => {
  for (const locale of ['zh-Hans', 'en'] as const) {
    for (const element of [
      createElement(HistoryMetricChart, {
        points: [{ period: '2025-12-31', company: null, peer: null, count: null }],
        style: 'bars',
        unit: 'amount',
        label: 'Revenue',
        selectedPeriod: '2025-12-31',
        onPeriodChange: () => undefined,
      }),
      createElement(IndustryPairChart, { company: null, peer: null, label: 'Gross margin' }),
    ]) {
      const $ = load(chartMarkup(element, locale));
      assert.equal($('svg').length, 0);
      assert.equal($('.financial-chart-empty').length, 1);
      assert.match($('.financial-chart-empty').text(), /Revenue|Gross margin/);
    }
  }
});

test('six annual years and paired signed bars fit a narrow card without shrinking SVG labels', () => {
  const points = Array.from({ length: 6 }, (_, index) => ({
    period: `${2020 + index}-12-31`,
    company: index === 0 ? -2 : index === 1 ? 0 : index + 2,
    peer: index + 1,
    count: 5,
  }));
  const $ = load(
    chartMarkup(
      createElement(HistoryMetricChart, {
        points,
        style: 'bars',
        unit: 'amount',
        label: 'Cash',
        selectedPeriod: '2025-12-31',
        onPeriodChange: () => undefined,
      })
    )
  );
  const width = Number($('svg').attr('viewBox')!.split(' ')[2]);
  assert.ok(width <= 274, 'the chart must fit a 390px screen card content area');
  const years = $('g[role="button"]');
  assert.equal(years.length, 6);
  years.each((_index, element) => {
    const year = $(element);
    const hit = year.children('rect.financial-chart-year-hit');
    const start = Number(hit.attr('x'));
    const end = start + Number(hit.attr('width'));
    const label = year.children('text').last();
    assert.ok(Number(label.attr('x')) - 15 >= 0);
    assert.ok(Number(label.attr('x')) + 15 <= width);
    year.children('rect:not(.financial-chart-year-hit)').each((_offset, bar) => {
      assert.ok(Number($(bar).attr('x')) >= start);
      assert.ok(Number($(bar).attr('x')) + Number($(bar).attr('width')) <= end);
      assert.ok(Number($(bar).attr('height')) >= 1);
    });
  });
  assert.equal(years.last().children('text').last().text(), '2025');
  assert.equal(years.last().attr('aria-pressed'), 'true');
});
