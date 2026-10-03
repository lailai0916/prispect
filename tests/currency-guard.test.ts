import test from 'node:test';
import assert from 'node:assert/strict';
import type { Material, MetricKey, Report } from '../shared/contracts.js';
import { analyze } from '../server/engine.js';
import { explainWithModel } from '../server/model.js';
import { seeds } from '../server/store.js';

const fixture = await seeds(process.cwd());
const fresh = () => structuredClone(fixture.materials[0]!);
const run = (material: Material) =>
  analyze(
    { title: '币种边界核查', company: material.company, year: 2025, materialIds: [material.id] },
    [material]
  );
const metric = (report: Report, key: string) => report.metrics.find((item) => item.key === key)!;
const row = (material: Material, key: MetricKey, year = 2025) =>
  material.observations.find((item) => item.key === key && item.year === year)!;

function assertRejected(report: Report, material: Material, key: MetricKey, year = 2025) {
  const original = row(material, key, year);
  const check = report.checks.find((item) => item.id === `${year}-${key}`)!;
  assert.equal(check.status, 'fail');
  assert.match(check.message, /币种|单位/);
  assert.ok(
    check.sourceRefs.some((ref) => ref.materialId === material.id && ref.quote === original.quote)
  );
  assert.equal(metric(report, key)[year === 2025 ? 'value' : 'previousValue'], null);
  assert.deepEqual(report.snapshot, [material]);
  assert.equal(report.verdict, 'conflict');
  assert.equal(report.bridge, null);
  assert.deepEqual(report.crossSignals, []);
  assert.ok(report.crossSignalChecks?.every((item) => item.status === 'blocked'));
}

test('different currencies across profit and cash are rejected without a ratio or cash-gap judgment', () => {
  for (const key of ['netProfit', 'operatingCashFlow'] as const) {
    const material = fresh();
    row(material, key).currency = 'USD';
    row(material, key).unit = 'usd';
    const report = run(material);
    assertRejected(report, material, key);
    assert.equal(metric(report, 'cashConversion').value, null);
    assert.equal(
      report.findings.some((item) => item.id === 'cash-gap'),
      false
    );
    assert.equal(metric(report, 'profitChange').value, null);
    assert.equal(metric(report, 'cashChange').value, null);
    assert.equal(
      report.checks.some((item) => item.id === 'bridge-balance' && item.status === 'pass'),
      false
    );
  }
});

test('foreign-currency adjustments pause the bridge while valid CNY totals retain their own ratio', () => {
  for (const key of [
    'inventoryAdjustment',
    'receivablesAdjustment',
    'payablesAdjustment',
    'otherAdjustments',
  ] as const) {
    const material = fresh();
    row(material, key).currency = 'USD';
    row(material, key).unit = 'usd';
    const report = run(material);
    assertRejected(report, material, key);
    assert.equal(metric(report, 'cashConversion').value, '7.15');
    assert.equal(
      report.checks.some((item) => item.id === 'bridge-balance' && item.status === 'pass'),
      false
    );
    assert.equal(
      report.findings.some((item) => ['receivables', 'inventory', 'management'].includes(item.id)),
      false
    );
  }
});

test('complete USD material never computes CNY amounts, conversion, growth or a balanced bridge', () => {
  const material = fresh();
  for (const observation of material.observations) {
    observation.currency = 'USD';
    observation.unit = 'usd';
  }
  const report = run(material);
  for (const observation of material.observations)
    assertRejected(report, material, observation.key, observation.year);
  assert.ok(report.metrics.every((item) => item.value === null && item.previousValue === null));
  assert.ok(report.metrics.every((item) => item.sourceRefs.length === 0));
});

test('legacy SEC two-total material stays inspectable without creating a two-step cash bridge', () => {
  const material = fresh();
  material.company = 'Apple Inc.';
  material.observations = material.observations.filter(
    (item) => item.year === 2025 && ['netProfit', 'operatingCashFlow'].includes(item.key)
  );
  for (const observation of material.observations) {
    observation.currency = 'USD';
    observation.unit = 'usd';
  }
  const report = run(material);
  assertRejected(report, material, 'netProfit');
  assertRejected(report, material, 'operatingCashFlow');
  assert.equal(metric(report, 'cashConversion').value, null);
  assert.equal(report.coverage.present, 0);
});

test('unknown or unsupported currency and contradictory USD units are withheld with source checks', () => {
  for (const currency of ['UNK', 'CAD', 'unknown', '']) {
    const material = fresh();
    row(material, 'netProfit').currency = currency;
    const report = run(material);
    assertRejected(report, material, 'netProfit');
    assert.equal(metric(report, 'cashConversion').value, null);
  }
  const material = fresh();
  row(material, 'netProfit').unit = 'usd';
  const report = run(material);
  assertRejected(report, material, 'netProfit');
  assert.match(report.checks.find((item) => item.id === '2025-netProfit')!.message, /美元/);
  assert.equal(metric(report, 'cashConversion').value, null);
});

test('a foreign or unknown prior-year total cannot enter comparisons or prior cash conversion', () => {
  for (const currency of ['USD', 'UNK']) {
    for (const key of ['netProfit', 'operatingCashFlow'] as const) {
      const material = fresh();
      row(material, key, 2024).currency = currency;
      const report = run(material);
      assertRejected(report, material, key, 2024);
      assert.equal(metric(report, 'cashConversion').previousValue, null);
      assert.equal(metric(report, 'cashConversion').value, '7.15');
      for (const change of ['profitChange', 'cashChange', 'profitGrowth', 'cashGrowth'])
        assert.equal(metric(report, change).value, null);
    }
  }
});

test('currency rejection prevents foreign or unknown observations from reaching model synthesis', async () => {
  const material = fresh();
  row(material, 'netProfit').currency = 'USD';
  let requests = 0;
  const report = await explainWithModel(
    run(material),
    {
      apiKey: 'test-only',
      fetch: async () => {
        requests += 1;
        throw new Error('Rejected currency must not reach the model');
      },
    },
    [],
    true
  );
  assert.equal(requests, 0);
  assert.match(report.model.error!, /未调用模型/);
  assertRejected(report, material, 'netProfit');
});
