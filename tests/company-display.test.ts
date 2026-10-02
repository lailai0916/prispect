import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
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
  assert.match(coverage, /原件材料已确认采用/);
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
      const labels = $('.context-chart-scroll svg > g > text[text-anchor="end"]')
        .map((_index, element) => $(element).text())
        .get();
      assert.equal(labels.length, 5);
      assert.equal(new Set(labels).size, 5, `${locale}, profit ${profit}: ${labels.join(', ')}`);
      const numbers = labels.map((label) => Number(label.replaceAll(',', '')));
      assert.ok(numbers.every(Number.isFinite));
      assert.ok(numbers.every((value, index) => index === 0 || value > numbers[index - 1]!));
      const unit = locale === 'en' ? enUnit : zhUnit;
      assert.equal(
        $('.context-chart-plot > span').text(),
        locale === 'en' ? unit : `人民币 · ${unit}`
      );
      assert.ok($('.context-chart-scroll svg').attr('aria-label')?.includes(unit));
      assert.equal(
        $('.context-exact-fields article').first().find('strong').text().includes('—'),
        false
      );
    }
  }
});
