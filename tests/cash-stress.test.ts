import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCashStress } from '../shared/cash-stress.js';
import type { CashPlanInput } from '../shared/contracts.js';

const plan: CashPlanInput = {
  asOf: '2026-10-02',
  openingCash: '50',
  periods: [
    { days: 30, inflow: '100', outflow: '80' },
    { days: 60, inflow: '100', outflow: '80' },
    { days: 90, inflow: '100', outflow: '80' },
  ],
};
test('cash stress identifies the first period-end shortfall and the minimum integer collection rate', () => {
  const result = calculateCashStress(plan, {
    collectionPercent: 50,
    delayDays: 0,
    extraOutflow: '0',
  });
  assert.deepEqual(
    result.baseline.periods.map((period) => period.balance),
    ['70.00', '90.00', '110.00']
  );
  assert.deepEqual(
    result.stressed.periods.map((period) => period.balance),
    ['20.00', '-10.00', '-40.00']
  );
  assert.equal(result.firstNegativePeriod, 60);
  assert.equal(result.maxGap, '40.00');
  assert.equal(result.minimumCollectionPercent, 64);
  assert.equal(result.minimumStatus, 'known');
  assert.equal(result.uncollected, '150.00');
  assert.equal(result.delayedBeyondHorizon, '0.00');
  assert.deepEqual(plan.periods[0], { days: 30, inflow: '100', outflow: '80' });
});
test('a 30-day delay moves receipts exactly once and extra payment affects the first interval', () => {
  const result = calculateCashStress(plan, {
    collectionPercent: 100,
    delayDays: 30,
    extraOutflow: '0.01',
  });
  assert.deepEqual(
    result.stressed.periods.map((period) => period.inflow),
    ['0.00', '100.00', '100.00']
  );
  assert.deepEqual(
    result.stressed.periods.map((period) => period.balance),
    ['-30.01', '-10.01', '9.99']
  );
  assert.equal(result.delayedBeyondHorizon, '100.00');
  assert.equal(result.maxGap, '30.01');
  assert.equal(result.firstNegativePeriod, 30);
  assert.equal(result.minimumStatus, 'not-achievable');
  assert.equal(result.minimumCollectionPercent, null);
});
test('stress preserves unknown inputs, real zeros, and exact cents beyond Number precision', () => {
  const missing = structuredClone(plan);
  missing.periods[1].inflow = null;
  const unknown = calculateCashStress(missing, {
    collectionPercent: 80,
    delayDays: 0,
    extraOutflow: '0',
  });
  assert.equal(unknown.stressed.periods[0].balance, '50.00');
  assert.equal(unknown.stressed.periods[1].balance, null);
  assert.equal(unknown.stressed.periods[2].balance, null);
  assert.equal(unknown.minimumStatus, 'unknown');
  assert.equal(unknown.maxGap, null);
  const exact = structuredClone(plan);
  exact.openingCash = '9007199254740993.01';
  exact.periods = [
    { days: 30, inflow: '0.01', outflow: '0' },
    { days: 60, inflow: '0', outflow: '0' },
    { days: 90, inflow: '0', outflow: '0' },
  ];
  const rounded = calculateCashStress(exact, {
    collectionPercent: 50,
    delayDays: 0,
    extraOutflow: '0',
  });
  assert.equal(rounded.stressed.periods[0].balance, '9007199254740993.01');
  assert.equal(rounded.uncollected, '0.01');
  assert.equal(rounded.minimumCollectionPercent, 0);
  exact.periods[0].outflow = '99999999999999999999.99';
  const large = calculateCashStress(exact, {
    collectionPercent: 0,
    delayDays: 0,
    extraOutflow: '99999999999999999999.99',
  });
  assert.equal(large.stressed.periods[0].outflow, '199999999999999999999.98');
  assert.equal(large.maxGap, '199990992800745259006.97');
  assert.throws(() =>
    calculateCashStress(plan, { collectionPercent: 50.5, delayDays: 0, extraOutflow: '0' })
  );
  assert.throws(() =>
    calculateCashStress(plan, { collectionPercent: 101, delayDays: 0, extraOutflow: '0' })
  );
  assert.throws(() =>
    calculateCashStress(plan, { collectionPercent: 50, delayDays: 0, extraOutflow: '0.001' })
  );
});
