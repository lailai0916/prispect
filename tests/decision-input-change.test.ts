import test from 'node:test';
import assert from 'node:assert/strict';
import type { DecisionInput } from '../shared/decision-contracts.js';
import { hasDecisionInputChanges } from '../shared/decision-input-change.js';

const saved: DecisionInput = {
  title: '付款核查',
  purpose: 'external',
  transactionEntity: '甲公司',
  reportTaskId: null,
  promise: '',
  external: {
    asOf: '2026-10-03',
    totalAmount: '20000.00',
    alreadyPaid: '10000.00',
    deliveredAmount: '2000.00',
    actualRefund: '0.00',
    proposedAmount: '3000.00',
    alternativeAmount: null,
    exposureLimit: '15000.00',
    payeeEntity: '甲公司',
    refundEntity: '甲公司',
  },
  datedCash: null,
};

test('input-change hint ignores amount formatting, outer whitespace and key order', () => {
  const reordered = Object.fromEntries(Object.entries(saved).reverse()) as unknown as DecisionInput;
  const draft = {
    ...reordered,
    title: ' 付款核查 ',
    claims: [],
    tradingName: '',
    external: { ...saved.external!, alreadyPaid: '010000', actualRefund: '0' },
  };
  assert.equal(hasDecisionInputChanges(draft, saved), false);
});

test('input-change hint responds to an actual money change and clears when restored', () => {
  const draft = { ...saved, external: { ...saved.external!, proposedAmount: '3000.01' } };
  assert.equal(hasDecisionInputChanges(draft, saved), true);
  draft.external.proposedAmount = '3000.00';
  assert.equal(hasDecisionInputChanges(draft, saved), false);
  assert.equal(saved.external!.proposedAmount, '3000.00');
});

test('input-change hint preserves unknown versus explicit zero and catches dates and entities', () => {
  assert.equal(
    hasDecisionInputChanges(
      { ...saved, external: { ...saved.external!, actualRefund: null } },
      saved
    ),
    true
  );
  assert.equal(
    hasDecisionInputChanges(
      { ...saved, external: { ...saved.external!, asOf: '2026-10-04' } },
      saved
    ),
    true
  );
  assert.equal(hasDecisionInputChanges({ ...saved, transactionEntity: '乙公司' }, saved), true);
});

test('inactive conditions do not mark the form dirty, while a purpose change does', () => {
  const draft: DecisionInput = {
    ...saved,
    datedCash: {
      asOf: '2026-10-04',
      openingCash: null,
      cashFloor: '0.00',
      proposedAmount: null,
      proposedDay: null,
      alternativeDay: null,
      flows: [],
    },
  };
  assert.equal(hasDecisionInputChanges(draft, saved), false);
  assert.equal(hasDecisionInputChanges({ ...draft, purpose: 'handover' }, saved), true);
});
