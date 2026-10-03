import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CompanyResearchRun, Observation } from '../shared/contracts.js';
import {
  FINANCIAL_FIELD_SOURCES,
  type CompanyFinancialContext,
  type CompanyFinancialYear,
} from '../shared/company-market.js';
import { seeds } from '../server/store.js';
import { EvidenceObservation } from '../src/components';
import { CompanyFinancialFindings } from '../src/CompanyRunOverview';
import { AppContext, type AppContextValue } from '../src/context';
import { compareOriginal } from '../src/company-original-comparison';

const fixture = await seeds(process.cwd());
function render(component: ReactElement, locale: 'zh-Hans' | 'en') {
  return renderToStaticMarkup(
    createElement(
      AppContext.Provider,
      { value: { locale, t: (zh, en) => (locale === 'en' ? en : zh) } as AppContextValue },
      component
    )
  );
}
function original(unit: Observation['unit'], currency: string): Observation {
  return {
    id: 'original-group',
    key: 'otherAdjustments',
    year: 2025,
    period: 'annual',
    value: '1234.50',
    unit,
    currency,
    scope: 'consolidated',
    page: 191,
    quote: 'Saved original grouped adjustment',
    kind: 'derived',
    components: [
      { label: 'Original component', value: '9007199254740993.01', page: null, quote: 'Saved row' },
    ],
  };
}
function comparisonFixture() {
  const material = structuredClone(fixture.materials[0]!);
  const observation = material.observations.find(
    (item) => item.key === 'netProfit' && item.year === 2025
  )!;
  observation.value = '12.340000';
  observation.unit = 'wan';
  observation.currency = 'CNY';
  const run: CompanyResearchRun = {
    id: 'original-currency-fixture',
    input: { securityCode: '300893', orgId: '9900039861', year: 2025, useModel: true },
    status: 'ready',
    createdAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-configured' },
    identity: {
      securityCode: '300893',
      orgId: '9900039861',
      shortName: material.shortName,
      companyName: material.company,
      exchange: 'szse',
      sourceUrl: 'https://www.cninfo.com.cn/',
    },
    preview: {
      material,
      reviewRequired: true,
      warnings: [],
      tablePages: [],
      checks: [
        {
          id: '2025-netProfit',
          label: 'Historical net profit check',
          status: 'pass',
          message: 'Saved historical pass',
          sourceRefs: [],
        },
      ],
    },
  };
  const row: CompanyFinancialYear = {
    year: 2025,
    reportDate: '2025-12-31',
    amounts: Object.fromEntries(
      Object.keys(FINANCIAL_FIELD_SOURCES).map((key) => [
        key,
        key === 'netProfit' ? '123400.00' : null,
      ])
    ) as CompanyFinancialYear['amounts'],
    sourceIds: {},
  };
  const context: CompanyFinancialContext = {
    source: 'eastmoney-public-web',
    status: 'available',
    securityCode: '300893',
    exchange: 'szse',
    requestedYear: 2025,
    retrievedAt: '2026-10-03T00:00:00.000Z',
    identity: { status: 'matched', organizationCode: null, organizationType: null },
    years: [row],
    sources: [],
    warnings: [],
  };
  return { run, row, context, observation };
}

test('source rows retain original USD or foreign-scaled amounts and pass their currency and unit to components', () => {
  for (const [unit, currency] of [
    ['usd', 'USD'],
    ['wan', 'CAD'],
  ] as const) {
    const observation = original(unit, currency);
    const before = JSON.stringify(observation);
    for (const locale of ['zh-Hans', 'en'] as const) {
      const html = render(createElement(EvidenceObservation, { observation }), locale);
      assert.ok(
        html.includes(
          `1,234.50 ${locale === 'en' ? (unit === 'usd' ? 'USD units' : '10k units') : unit === 'usd' ? '美元' : '万元'} · ${currency}`
        )
      );
      assert.ok(
        html.includes(
          `9,007,199,254,740,993.01 ${locale === 'en' ? (unit === 'usd' ? 'USD units' : '10k units') : unit === 'usd' ? '美元' : '万元'} · ${currency}`
        )
      );
      assert.ok(!html.includes('CNY'));
      assert.ok(!html.includes('12,345,000'));
      assert.match(html, locale === 'en' ? /Page not supplied/ : /页码未提供/);
    }
    assert.equal(JSON.stringify(observation), before);
  }
});

test('contradictory USD unit and CNY currency stay explicit in source rows rather than being relabeled or adopted', () => {
  const observation = original('usd', 'CNY');
  const before = JSON.stringify(observation);
  for (const locale of ['zh-Hans', 'en'] as const) {
    const html = render(createElement(EvidenceObservation, { observation }), locale);
    assert.ok(html.includes(locale === 'en' ? '1,234.50 USD units · CNY' : '1,234.50 美元 · CNY'));
    assert.match(html, locale === 'en' ? /not adopted as CNY amounts/ : /不作为人民币金额采用/);
  }
  assert.equal(JSON.stringify(observation), before);
});

test('original company cards withhold contradictory dollar units while preserving valid independent CNY fields', () => {
  const { run, observation } = comparisonFixture();
  observation.unit = 'usd';
  observation.value = '917263.45';
  const before = JSON.stringify(run);
  for (const locale of ['zh-Hans', 'en'] as const) {
    const html = render(createElement(CompanyFinancialFindings, { run, onPage: () => {} }), locale);
    assert.ok(!html.includes('917,263.45'));
    assert.ok(!html.includes(locale === 'en' ? 'Consolidated net profit' : '合并净利润'));
    assert.ok(html.includes(locale === 'en' ? 'Operating cash flow' : '经营现金净额'));
    assert.ok(html.includes('CNY'));
  }
  assert.equal(JSON.stringify(run), before);
});

test('historical pass markers cannot turn foreign currency or conflicting USD units into a CNY source match', () => {
  for (const [unit, currency] of [
    ['usd', 'CNY'],
    ['yuan', 'USD'],
    ['wan', 'CAD'],
  ] as const) {
    const { run, row, context, observation } = comparisonFixture();
    observation.unit = unit;
    observation.currency = currency;
    observation.value = row.amounts.netProfit!;
    const before = JSON.stringify({ run, row, context });
    assert.deepEqual(compareOriginal(context, run, row, 'netProfit'), { status: 'unchecked' });
    assert.equal(JSON.stringify({ run, row, context }), before);
  }
  const { run, row, context, observation } = comparisonFixture();
  run.preview!.material.observations.push({ ...observation, id: 'foreign-copy', currency: 'USD' });
  assert.deepEqual(compareOriginal(context, run, row, 'netProfit'), { status: 'unchecked' });
});

test('valid original CNY amounts still compare across exact scales and differences without altering web amounts', () => {
  const { run, row, context, observation } = comparisonFixture();
  const before = JSON.stringify({ run, row, context });
  const same = compareOriginal(context, run, row, 'netProfit');
  assert.equal(same.status, 'same');
  assert.equal(same.value, '123400.00');
  assert.equal(same.observation, observation);
  assert.equal(JSON.stringify({ run, row, context }), before);
  row.amounts.netProfit = '123400.01';
  const changed = JSON.stringify({ run, row, context });
  assert.equal(compareOriginal(context, run, row, 'netProfit').status, 'different');
  assert.equal(JSON.stringify({ run, row, context }), changed);
});
