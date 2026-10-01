import test from 'node:test';
import assert from 'node:assert/strict';
import type { CashPlanInput } from '../shared/contracts.js';
import { calculateCashPlan } from '../shared/cash-plan.js';
import { cashPlanInputSchema, taskContextSchema } from '../server/validation.js';

function plan(): CashPlanInput {
  return {
    asOf: '2026-10-02',
    openingCash: '50.00',
    periods: [
      { days: 30, inflow: '100.00', outflow: '130.00' },
      { days: 60, inflow: '70.00', outflow: '100.00' },
      { days: 90, inflow: '20.00', outflow: '5.00' },
    ],
  };
}

test('cash assumptions use separate interval flows and expose a temporary gap without forecasting', () => {
  const result = calculateCashPlan(plan());
  assert.deepEqual(
    result.periods.map((period) => period.balance),
    ['20.00', '-10.00', '5.00']
  );
  assert.deepEqual(
    result.periods.map((period) => period.gap),
    ['0.00', '10.00', '0.00']
  );
  assert.deepEqual(
    result.periods.map((period) => [period.startDay, period.endDay]),
    [
      [0, 30],
      [31, 60],
      [61, 90],
    ]
  );
  assert.ok(
    result.periods.every((period) => period.status === 'known' && !period.missingFields.length)
  );
});

test('a missing assumption propagates through later balances while explicit zero stays known', () => {
  const input = plan();
  input.periods[1].inflow = null;
  const result = calculateCashPlan(input);
  assert.equal(result.periods[0]!.balance, '20.00');
  assert.deepEqual(
    result.periods.slice(1).map((period) => period.balance),
    [null, null]
  );
  assert.deepEqual(result.periods[2]!.missingFields, ['periods.1.inflow']);
  assert.equal(result.periods[2]!.gap, null);
  input.openingCash = null;
  assert.ok(
    calculateCashPlan(input).periods.every(
      (period) => period.status === 'unknown' && period.missingFields.includes('openingCash')
    )
  );
  input.openingCash = '0';
  input.periods.forEach((period) => {
    period.inflow = '0';
    period.outflow = '0.00';
  });
  assert.ok(
    calculateCashPlan(input).periods.every(
      (period) => period.balance === '0.00' && period.status === 'known'
    )
  );
});

test('cash-plan cents remain exact beyond Number safe precision and never round extra digits', () => {
  const input = plan();
  input.openingCash = '99999999999999999999.99';
  input.periods[0] = { days: 30, inflow: '0.01', outflow: '0' };
  input.periods[1] = { days: 60, inflow: '0', outflow: '0.02' };
  input.periods[2] = { days: 90, inflow: '0.1', outflow: '0.09' };
  assert.deepEqual(
    calculateCashPlan(input).periods.map((period) => period.balance),
    ['100000000000000000000.00', '99999999999999999999.98', '99999999999999999999.99']
  );
  input.periods[0].inflow = '0.001';
  assert.throws(() => calculateCashPlan(input), RangeError);
});

test('cash-plan API schema rejects invalid calendar dates, negative flows, wrong intervals and unknown context keys', () => {
  assert.equal(cashPlanInputSchema.safeParse({ ...plan(), asOf: '2024-02-29' }).success, true);
  for (const asOf of ['2026-02-30', '2026-02-29', '0000-01-01', '2026-13-01', '2026-1-01'])
    assert.equal(cashPlanInputSchema.safeParse({ ...plan(), asOf }).success, false, asOf);
  for (const amount of ['-0.01', '1.001', '1e3', '', '1\n', '100000000000000000000']) {
    const input = plan();
    input.periods[0].outflow = amount;
    assert.equal(cashPlanInputSchema.safeParse(input).success, false, amount);
  }
  const wrong = plan();
  const periods = [wrong.periods[1], wrong.periods[0], wrong.periods[2]];
  assert.equal(cashPlanInputSchema.safeParse({ ...wrong, periods }).success, false);
  assert.equal(
    taskContextSchema.safeParse({
      contextNotes: { 'external.identity': { done: true, note: '已向对方索取主体资料' } },
    }).success,
    true
  );
  assert.equal(
    taskContextSchema.safeParse({ contextNotes: { 'company.safe': { done: true, note: '' } } })
      .success,
    false
  );
  assert.equal(
    taskContextSchema.safeParse({
      contextNotes: { 'handover.cash': { done: false, note: 'x'.repeat(2001) } },
    }).success,
    false
  );
  assert.equal(
    taskContextSchema.safeParse(
      JSON.parse('{"contextNotes":{"__proto__":{"done":true,"note":""}}}')
    ).success,
    false
  );
  assert.equal(taskContextSchema.safeParse({ report: { verdict: 'supported' } }).success, false);
});
