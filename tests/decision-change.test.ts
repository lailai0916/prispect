import test from 'node:test';
import assert from 'node:assert/strict';
import type { Material } from '../shared/contracts.js';
import type {
  DecisionEvidence,
  DecisionInput,
  DecisionVersion,
} from '../shared/decision-contracts.js';
import { deriveDecisionChanges } from '../shared/decision-change.js';
import { evaluateDecision, validateDecisionInput } from '../server/decision-engine.js';

const input = (): DecisionInput => ({
  title: '合成版本演练',
  purpose: 'external',
  transactionEntity: '合成商家',
  reportTaskId: null,
  promise: '退款只是承诺',
  datedCash: null,
  external: {
    asOf: '2026-10-03',
    totalAmount: '100000',
    payeeEntity: '合成商家',
    refundEntity: '合成商家',
    alreadyPaid: '20000',
    deliveredAmount: '5000',
    actualRefund: '0',
    proposedAmount: '10000',
    alternativeAmount: '5000',
    exposureLimit: '20000',
  },
});
const version = (
  revision: number,
  value = input(),
  evidence: DecisionEvidence[] = []
): DecisionVersion => ({
  revision,
  createdAt: `2026-10-03T00:00:0${revision}Z`,
  reason: 'edited',
  input: value,
  evidence,
});
const comparison = (a: DecisionVersion, b: DecisionVersion, materials: Material[] = []) =>
  deriveDecisionChanges(
    a,
    b,
    evaluateDecision(a, { tasks: [], materials }),
    evaluateDecision(b, { tasks: [], materials })
  );

test('version changes distinguish explicit zero from missing and ignore amount formatting', () => {
  const a = version(1),
    b = version(2);
  b.input.external!.actualRefund = null;
  b.input.external!.alreadyPaid = '20000.00';
  const changes = comparison(a, b).changes;
  assert.deepEqual(changes.find((row) => row.key === 'external.actualRefund')?.before, '0');
  assert.equal(changes.find((row) => row.key === 'external.actualRefund')?.after, null);
  assert.equal(
    changes.some((row) => row.key === 'external.alreadyPaid'),
    false
  );
  assert.ok(
    changes.some((row) => row.key === 'assumptionScenarios:A:exposure' && row.after === null)
  );
});
test('new statement and trading name changes do not alter financial results or authenticate a claim', () => {
  const a = version(1),
    b = version(2);
  b.input.tradingName = '合成品牌';
  b.input.claims = [{ id: 'c1', text: '对方保证随时退款', target: 'terms' }];
  const changes = comparison(a, b);
  assert.ok(changes.changes.some((row) => row.key === 'claim:c1:text'));
  assert.ok(changes.changes.some((row) => row.key === 'tradingName'));
  assert.equal(
    changes.changes.some((row) => row.kind === 'calculation'),
    false
  );
  assert.equal(changes.basis, 'saved-inputs-current-rules');
});
test('withdrawal and restoration change record-field results while preserving the independent assumptions', () => {
  const amounts = { paid: '20000', delivered: '5000', refunded: '0' };
  const records = Object.entries(amounts).map(
    ([slot, amount]): DecisionEvidence => ({
      id: slot,
      slot: slot as DecisionEvidence['slot'],
      kind: 'source-record',
      entity: '合成商家',
      asOf: '2026-10-03',
      quote: `合成商家 2026-10-03 ${slot === 'paid' ? '已付款' : slot === 'delivered' ? '已交付' : '退款已到账'} ${amount}元`,
      sourceLabel: `合成${slot}记录`,
      materialId: 'm1',
      page: 1,
      values: { amount },
      state: 'active',
      createdAt: '2026-10-03T00:00:00Z',
    })
  );
  const material: Material = {
    id: 'm1',
    company: '合成商家',
    shortName: '合成商家',
    title: '合成原件',
    filename: 'synthetic.json',
    origin: 'user-upload',
    documentDate: '2026-10-03',
    sha256: 'a'.repeat(64),
    createdAt: '2026-10-03T00:00:00Z',
    observations: [],
    notes: [],
    excerpts: [{ page: 1, text: records.map((row) => row.quote).join('\n') }],
  };
  const a = version(1, input(), records),
    b = structuredClone(a);
  b.revision = 2;
  b.evidence[0]!.state = 'withdrawn';
  const changes = comparison(a, b, [material]).changes;
  assert.ok(
    changes.some(
      (row) =>
        row.key === 'evidence:paid:state' && row.before === 'active' && row.after === 'withdrawn'
    )
  );
  assert.ok(
    changes.some((row) => row.kind === 'gate' && row.key === 'paid' && row.after === 'withdrawn')
  );
  assert.ok(
    changes.some(
      (row) =>
        row.key === 'recordScenarios:A:exposure' && row.before === '25000.00' && row.after === null
    )
  );
  assert.equal(
    changes.some((row) => row.key === 'assumptionScenarios:A:exposure'),
    false
  );
  const c = structuredClone(a);
  c.revision = 3;
  assert.ok(
    comparison(b, c, [material]).changes.some(
      (row) => row.key === 'recordScenarios:A:exposure' && row.after === '25000.00'
    )
  );
  assert.equal(a.evidence[0]!.state, 'active');
});
test('flows and statements bind stable IDs rather than array positions', () => {
  const a = version(1),
    b = version(2);
  a.input.claims = [
    { id: 'a', text: '主体', target: 'contract-entity' },
    { id: 'b', text: '条款', target: 'terms' },
  ];
  b.input.claims = [...a.input.claims].reverse();
  assert.equal(comparison(a, b).changes.length, 0);
});
test('new input contracts reject duplicates, arbitrary targets and targets from another purpose, retaining old records', () => {
  assert.deepEqual(validateDecisionInput(input()), input());
  for (const claims of [
    [
      { id: 'same', text: 'a', target: 'terms' },
      { id: 'same', text: 'b', target: 'terms' },
    ],
    [{ id: 'cash', text: '现金', target: 'opening-cash' }],
    [{ id: 'invented', text: '承诺', target: 'safe-to-pay' }],
  ])
    assert.throws(() => validateDecisionInput({ ...input(), claims }));
  assert.throws(() =>
    validateDecisionInput({
      ...input(),
      claims: Array.from({ length: 13 }, (_, i) => ({
        id: String(i),
        text: '条款',
        target: 'terms',
      })),
    })
  );
});
test('the comparison exposes same-day ordering changes even when both day-end outcomes stay above the floor', () => {
  const a = version(1);
  a.input.purpose = 'handover';
  a.input.external = null;
  a.input.datedCash = {
    asOf: '2026-10-03',
    openingCash: '20',
    cashFloor: '0',
    proposedAmount: '100',
    proposedDay: 5,
    alternativeDay: 6,
    flows: [
      {
        id: 'receipt',
        label: '合成同日回款',
        direction: 'in',
        day: 5,
        amount: '120',
        flexibility: 'fixed',
      },
    ],
  };
  const b = structuredClone(a);
  b.revision = 2;
  b.input.datedCash!.proposedDay = 6;
  const rows = comparison(a, b).changes;
  assert.ok(
    rows.some(
      (row) =>
        row.key === 'cash:primary:sameDayOrderSensitive' &&
        row.before === 'order-sensitive' &&
        row.after === 'not-order-sensitive'
    )
  );
  assert.ok(
    rows.some(
      (row) =>
        row.key === 'cash:primary:conservativeGap' && row.before === '80.00' && row.after === '0.00'
    )
  );
  assert.ok(rows.some((row) => row.key === 'cash:primary:maximumAdditionalPayment'));
  assert.equal(
    rows.some((row) => row.key === 'cash:primary:day'),
    false
  );
});
