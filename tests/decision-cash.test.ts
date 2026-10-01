import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateDatedCash, compareDatedCash } from '../shared/decision-cash.js';
import type { DatedCashInput } from '../shared/decision-contracts.js';

function example(): DatedCashInput {
  return {
    asOf: '2026-10-02',
    openingCash: '120000',
    cashFloor: '0',
    proposedAmount: '60000',
    proposedDay: 5,
    alternativeDay: 26,
    flows: [
      ...[10, 40, 70].map((day) => ({
        id: `out-${day}`,
        label: '刚性付款',
        direction: 'out' as const,
        day,
        amount: '100000',
        flexibility: 'fixed' as const,
      })),
      ...[25, 55, 85].map((day, index) => ({
        id: `in-${day}`,
        label: '预计回款',
        direction: 'in' as const,
        day,
        amount: index === 0 ? '200000' : '120000',
        flexibility: 'fixed' as const,
      })),
    ],
  };
}
test('month-end balances hide an earlier shortfall; moving only the proposed date changes the path', () => {
  const result = compareDatedCash(example());
  assert.deepEqual(
    result.primary.periodEnds.map((period) => period.balance),
    ['160000.00', '180000.00', '200000.00']
  );
  assert.deepEqual(result.alternative.periodEnds, result.primary.periodEnds);
  assert.equal(result.primary.firstShortfallDay, 10);
  assert.equal(result.primary.firstShortfallGap, '40000.00');
  assert.equal(result.primary.minimumBalance, '-40000.00');
  assert.equal(result.alternative.minimumBalance, '20000.00');
  assert.equal(result.primary.maximumAdditionalPayment, '20000.00');
  assert.equal(result.primary.minimumCollectionStatus, 'not-achievable');
  assert.equal(result.alternative.minimumCollectionPercent, 75);
  const lower = example();
  lower.proposedDay = lower.alternativeDay;
  lower.flows = lower.flows.map((flow) =>
    flow.direction === 'in'
      ? { ...flow, amount: flow.amount === '200000' ? '148000' : '88800' }
      : flow
  );
  assert.equal(calculateDatedCash(lower).minimumBalance, '-3200.00');
  assert.equal(result.primary.events.find((event) => event.day === 10)?.date, '2026-10-12');
});
test('missing balances, amounts and dates remain unknown instead of becoming zero or month-end assumptions', () => {
  const input = example();
  input.openingCash = null;
  input.flows[0]!.day = null;
  input.flows[1]!.amount = null;
  const result = calculateDatedCash(input);
  assert.equal(result.status, 'unknown');
  assert.deepEqual(result.missingFields, [
    'openingCash',
    'flows.out-10.day',
    'flows.out-40.amount',
  ]);
  assert.equal(result.maximumGap, null);
  assert.equal(result.maximumAdditionalPayment, null);
  assert.ok(result.periodEnds.every((period) => period.balance === null));
  const zero = calculateDatedCash({ ...example(), openingCash: '0' });
  assert.equal(zero.status, 'known');
  assert.equal(zero.firstShortfallDay, 5);
});
test('same-day receipts cannot certify payment ordering, while end-of-day arithmetic remains available', () => {
  const input: DatedCashInput = {
    asOf: '2026-10-02',
    openingCash: '20000',
    cashFloor: '0',
    proposedAmount: '100000',
    proposedDay: 5,
    alternativeDay: 6,
    flows: [
      {
        id: 'receipt',
        label: '同日回款',
        direction: 'in',
        day: 5,
        amount: '120000',
        flexibility: 'fixed',
      },
    ],
  };
  const result = compareDatedCash(input);
  assert.equal(result.primary.events[0]!.balance, '40000.00');
  assert.equal(result.primary.events[0]!.outflowFirstBalance, '-80000.00');
  assert.equal(result.primary.firstShortfallDay, null);
  assert.equal(result.primary.maximumGap, '0.00');
  assert.equal(result.primary.sameDayOrderSensitive, true);
  assert.equal(result.primary.conservativeMaximumGap, '80000.00');
  assert.equal(result.primary.minimumCollectionStatus, 'not-achievable');
  assert.equal(result.alternative.sameDayOrderSensitive, false);
});
test('reverse payment thresholds use future cash rather than capping every decision at the original balance', () => {
  const input: DatedCashInput = {
    asOf: '2026-10-02',
    openingCash: '0.01',
    cashFloor: '0.02',
    proposedAmount: '0.01',
    proposedDay: 3,
    alternativeDay: 4,
    flows: [
      {
        id: 'receipt',
        label: '收款',
        direction: 'in',
        day: 1,
        amount: '10000000000000000.01',
        flexibility: 'fixed',
      },
    ],
  };
  const result = calculateDatedCash(input);
  assert.equal(result.maximumAdditionalPayment, '10000000000000000.00');
  assert.equal(result.thresholdStatus, 'baseline-below-floor');
  assert.equal(result.firstShortfallDay, 0);
  input.cashFloor = '0.00';
  assert.equal(calculateDatedCash(input).maximumAdditionalPayment, '10000000000000000.02');
});
test('date and source amounts are bounded, and duplicate event IDs cannot double-count silently', () => {
  const input = example();
  assert.throws(() => calculateDatedCash({ ...input, asOf: '2026-02-30' }), /calendar date/);
  assert.throws(() => calculateDatedCash({ ...input, proposedDay: 91 }), /days 1 through 90/);
  assert.throws(() => calculateDatedCash({ ...input, proposedAmount: '0.001' }), /two decimals/);
  input.flows[1]!.id = input.flows[0]!.id;
  assert.throws(() => calculateDatedCash(input), /unique/);
});

test('a user cash floor is distinct from insolvency, and changing future receipts cannot cure an earlier shortfall', () => {
  const input = example();
  input.cashFloor = '80000';
  const result = calculateDatedCash(input);
  assert.equal(result.events.find((event) => event.day === 5)?.balance, '60000.00');
  assert.equal(result.firstShortfallDay, 5);
  assert.equal(result.firstShortfallGap, '20000.00');
  assert.equal(result.maximumAdditionalPayment, '0.00');
  assert.equal(result.thresholdStatus, 'baseline-below-floor');
  input.flows = input.flows.map((flow) =>
    flow.direction === 'in' ? { ...flow, amount: '10000000' } : flow
  );
  assert.equal(calculateDatedCash(input).firstShortfallDay, 5);
  assert.equal(calculateDatedCash(input).minimumCollectionStatus, 'not-achievable');
});

test('a conditional date alternative fails when its assumed receipt timing changes', () => {
  const input = example();
  input.proposedDay = 26;
  input.flows = input.flows.map((flow) => (flow.id === 'in-25' ? { ...flow, day: 41 } : flow));
  const result = calculateDatedCash(input);
  assert.equal(result.minimumBalance, '-140000.00');
  assert.equal(result.events.find((event) => event.day === 40)?.balance, '-140000.00');
  assert.equal(result.firstShortfallDay, 26);
  assert.equal(result.firstShortfallGap, '40000.00');
});

test('adding an omitted obligation invalidates a positive path without changing the existing receipts', () => {
  const input = example();
  input.proposedDay = 26;
  input.flows.push({
    id: 'new-obligation',
    label: '新补入的付款义务',
    direction: 'out',
    day: 24,
    amount: '30000',
    flexibility: 'fixed',
  });
  const result = calculateDatedCash(input);
  assert.equal(result.minimumBalance, '-10000.00');
  assert.equal(result.firstShortfallDay, 24);
  assert.deepEqual(
    result.periodEnds.map((period) => period.balance),
    ['130000.00', '150000.00', '170000.00']
  );
});
