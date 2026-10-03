import test from 'node:test';
import assert from 'node:assert/strict';
import type { MetricKey, Report } from '../shared/contracts.js';
import { reportCurrencyView } from '../shared/report-currency-view.js';
import { analyze } from '../server/engine.js';
import { seeds } from '../server/store.js';

const fixture = await seeds(process.cwd());
const fresh = () => {
  const material = structuredClone(fixture.materials[0]!);
  return analyze(
    { title: '历史币种展示', company: material.company, year: 2025, materialIds: [material.id] },
    [material]
  );
};
const metric = (report: Report, key: string) => report.metrics.find((item) => item.key === key)!;
const observation = (report: Report, key: MetricKey, year = report.year) =>
  report.snapshot
    .flatMap((item) => item.observations)
    .find((item) => item.key === key && item.year === year)!;

test('supported CNY reports retain the saved read model unchanged', () => {
  const saved = fresh();
  const view = reportCurrencyView(saved);
  assert.equal(view.report, saved);
  assert.deepEqual(view.issues, []);
  assert.equal(view.bridgeBlocked, false);
  assert.equal(view.interpretationWithheld, false);
});

test('legacy mixed-currency calculations are withheld without rewriting inputs or model history', () => {
  const saved = fresh();
  observation(saved, 'netProfit').currency = 'USD';
  observation(saved, 'netProfit').unit = 'usd';
  saved.model = {
    enabled: true,
    status: 'completed',
    name: 'recorded-model',
    text: 'Old 7.15% analysis',
  };
  const before = JSON.stringify(saved);
  const view = reportCurrencyView(saved);
  assert.equal(JSON.stringify(saved), before);
  assert.equal(view.currentTotalsBlocked, true);
  assert.equal(metric(view.report, 'netProfit').value, null);
  assert.equal(metric(view.report, 'cashConversion').value, null);
  assert.equal(metric(view.report, 'profitGrowth').value, null);
  assert.equal(view.report.bridge, null);
  assert.equal(view.report.checks.find((item) => item.id === 'bridge-balance')!.status, 'warn');
  assert.equal(
    view.report.findings.some((item) => item.id === 'cash-gap'),
    false
  );
  assert.ok(view.report.crossSignalChecks?.every((item) => item.status === 'blocked'));
  assert.ok(view.report.questions.every((item) => !item.trigger));
  assert.equal(view.report.model, saved.model);
  assert.equal(view.report.model.status, 'completed');
  assert.equal(view.interpretationWithheld, true);
  assert.equal(view.report.snapshot, saved.snapshot);
  assert.equal(view.issues[0]!.value, observation(saved, 'netProfit').value);
  assert.equal(view.issues[0]!.currency, 'USD');
  assert.ok(view.issues[0]!.sourceRefs[0]!.quote);
  assert.deepEqual(reportCurrencyView(view.report).report, view.report);
});

test('a foreign adjustment stops the old bridge and causes, retaining independently valid CNY ratios', () => {
  const saved = fresh();
  observation(saved, 'inventoryAdjustment').currency = 'CAD';
  const view = reportCurrencyView(saved);
  assert.equal(view.currentTotalsBlocked, false);
  assert.equal(view.bridgeBlocked, true);
  assert.equal(view.report.bridge, null);
  assert.equal(metric(view.report, 'cashConversion').value, metric(saved, 'cashConversion').value);
  assert.equal(metric(view.report, 'netProfit').value, metric(saved, 'netProfit').value);
  assert.equal(metric(view.report, 'inventoryAdjustment').value, null);
  assert.equal(
    view.report.findings.some((item) => item.id === 'cash-gap'),
    true
  );
  assert.equal(
    view.report.findings.some((item) =>
      ['inventory', 'receivables', 'management'].includes(item.id)
    ),
    false
  );
  assert.equal(view.issues[0]!.currency, 'CAD');
});

test('foreign prior-year inputs stop their historical growth and prior ratio, preserving valid current totals', () => {
  const saved = fresh();
  observation(saved, 'netProfit', saved.previousYear).currency = 'USD';
  const view = reportCurrencyView(saved);
  assert.equal(view.previousTotalsBlocked, true);
  assert.equal(view.currentTotalsBlocked, false);
  assert.equal(view.bridgeBlocked, false);
  assert.equal(metric(view.report, 'netProfit').previousValue, null);
  assert.equal(metric(view.report, 'profitChange').value, null);
  assert.equal(metric(view.report, 'profitGrowth').value, null);
  assert.equal(metric(view.report, 'cashConversion').previousValue, null);
  assert.equal(metric(view.report, 'cashConversion').value, metric(saved, 'cashConversion').value);
  assert.equal(metric(view.report, 'cashGrowth').value, metric(saved, 'cashGrowth').value);
  assert.equal(view.report.bridge, saved.bridge);
});

test('USD metrics without observations and contradictory or unknown declared currency never render as CNY calculations', () => {
  const saved = fresh();
  saved.snapshot = [];
  metric(saved, 'operatingCashFlow').unit = 'USD';
  const view = reportCurrencyView(saved);
  assert.equal(view.currentTotalsBlocked, true);
  assert.equal(metric(view.report, 'cashConversion').value, null);
  assert.equal(metric(view.report, 'operatingCashFlow').value, null);
  assert.equal(metric(view.report, 'operatingCashFlow').unit, 'USD');
  assert.ok(view.issues.every((item) => item.currency === 'USD'));
  for (const currency of ['UNK', '']) {
    const original = fresh();
    observation(original, 'netProfit').currency = currency;
    assert.equal(metric(reportCurrencyView(original).report, 'cashConversion').value, null);
  }
  const contradictory = fresh();
  observation(contradictory, 'netProfit').unit = 'usd';
  assert.equal(metric(reportCurrencyView(contradictory).report, 'cashConversion').value, null);
});

test('new currency-rejected reports keep their valid independent CNY ratio and actual model failure record', () => {
  const material = structuredClone(fixture.materials[0]!);
  material.observations.find(
    (item) => item.key === 'inventoryAdjustment' && item.year === 2025
  )!.currency = 'USD';
  const saved = analyze(
    { title: '当前币种核查', company: material.company, year: 2025, materialIds: [material.id] },
    [material]
  );
  saved.model = { enabled: true, status: 'failed', error: '材料未通过核对，未调用模型。' };
  const view = reportCurrencyView(saved);
  assert.equal(metric(view.report, 'cashConversion').value, '7.15');
  assert.equal(view.report.coverage.present, saved.coverage.present);
  assert.equal(view.report.model, saved.model);
  assert.equal(view.interpretationWithheld, false);
  assert.equal(
    view.report.checks.find((item) => item.id === '2025-inventoryAdjustment')!.status,
    'fail'
  );
});

test('failed and warned historical checks withhold currency-dependent calculations while preserving recorded statuses', () => {
  for (const status of ['fail', 'warn'] as const) {
    const material = structuredClone(fixture.materials[0]!);
    material.observations.find(
      (item) => item.key === 'inventoryAdjustment' && item.year === 2025
    )!.value = '-321030061.96';
    const saved = analyze(
      { title: '历史失败核查', company: material.company, year: 2025, materialIds: [material.id] },
      [material]
    );
    observation(saved, 'inventoryAdjustment').currency = 'USD';
    const balance = saved.checks.find((item) => item.id === 'bridge-balance')!;
    assert.equal(balance.status, 'fail');
    assert.match(balance.message, /26197124\.70 元/);
    balance.status = status;
    const indicator = saved.checks.find((item) => item.id === '2025-inventoryAdjustment')!;
    indicator.status = status;
    indicator.message = '历史换算结果为 917263.45 元，按人民币分核对。';
    const group = saved.checks.find((item) => item.id === 'group-sum')!;
    group.status = status;
    group.message = '历史分组换算结果为 817263.45 元。';
    for (const check of saved.crossSignalChecks || []) {
      check.blockers.push(
        {
          code: 'invalid:2025:inventoryAdjustment',
          message: { zh: indicator.message, en: 'Historical conversion: CNY 917263.45.' },
          sourceRefs: indicator.sourceRefs,
        },
        {
          code: 'group-sum',
          message: { zh: group.message, en: 'Historical group conversion: CNY 817263.45.' },
          sourceRefs: group.sourceRefs,
        }
      );
    }
    saved.model = { enabled: true, status: 'completed', text: 'Saved historical interpretation.' };
    const before = JSON.stringify(saved);
    const view = reportCurrencyView(saved);
    for (const id of ['bridge-balance', 'group-sum', '2025-inventoryAdjustment']) {
      const check = view.report.checks.find((item) => item.id === id)!;
      assert.equal(check.status, status);
      assert.match(check.message, /币种或金额单位待核对/);
      assert.ok(!check.message.includes('26197124.70'));
      assert.ok(!check.message.includes('917263.45'));
      assert.ok(!check.message.includes('817263.45'));
    }
    assert.equal(metric(view.report, 'cashConversion').value, '7.15');
    assert.equal(view.report.bridge, null);
    for (const check of view.report.crossSignalChecks || []) {
      const copiedBalance = check.blockers.find((item) => item.code === 'bridge-balance')!;
      assert.match(copiedBalance.message.zh, /币种或金额单位待核对/);
      assert.ok(!copiedBalance.message.zh.includes('26197124.70'));
      for (const code of ['invalid:2025:inventoryAdjustment', 'group-sum']) {
        const copied = check.blockers.find((item) => item.code === code)!;
        assert.match(copied.message.zh, /币种或金额单位待核对/);
        assert.ok(!copied.message.zh.includes('917263.45'));
        assert.ok(!copied.message.zh.includes('817263.45'));
        assert.ok(copied.sourceRefs.length > 0);
      }
    }
    assert.equal(view.report.model, saved.model);
    assert.equal(view.report.snapshot, saved.snapshot);
    assert.equal(JSON.stringify(saved), before);
  }
});
