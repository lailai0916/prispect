import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chartRange,
  consecutivePeriods,
  distributionBins,
} from '../shared/company-chart-geometry.js';

test('chart axes preserve signed, zero and tiny values with finite distinct ticks', () => {
  for (const values of [
    [0, 0],
    [-100, 0, 80],
    [0.01, 0],
    [1e14, 2e14],
    [null, NaN, Infinity],
  ] as const) {
    const range = chartRange(values);
    assert.ok(range.minimum <= 0 && range.maximum > range.minimum);
    assert.ok(range.ticks.every(Number.isFinite));
    assert.equal(new Set(range.ticks).size, range.ticks.length);
    for (const value of values)
      if (value !== null && Number.isFinite(value))
        assert.ok(range.minimum <= value && value <= range.maximum);
  }
});

test('histogram retains all peers once including extremes, zeros and the right endpoint', () => {
  const values = [-70, -20, 0, 10, 10, 80, 100];
  const bins = distributionBins(values, { minimum: -100, maximum: 100 });
  assert.equal(
    bins.reduce((total, bin) => total + bin.count, 0),
    values.length
  );
  assert.equal(bins.at(-1)!.count, 2);
  assert.ok(
    bins.every(
      (bin, index) => bin.end > bin.start && (index === 0 || bin.start === bins[index - 1]!.end)
    )
  );
});

test('trend lines only join consecutive complete annual periods', () => {
  assert.equal(consecutivePeriods('2021-12-31', '2022-12-31'), true);
  assert.equal(consecutivePeriods('2021-12-31', '2023-12-31'), false);
  assert.equal(consecutivePeriods('2022-06-30', '2023-12-31'), false);
  assert.equal(consecutivePeriods('2022-12-31', '2021-12-31'), false);
});
