import test from 'node:test';
import assert from 'node:assert/strict';
import type { Material } from '../shared/contracts.js';
import type {
  DecisionClaimTarget,
  DecisionEvidence,
  DecisionInput,
  DecisionVersion,
  DecisionEvaluation,
  DecisionGate,
} from '../shared/decision-contracts.js';
import {
  claimTargetAllowed,
  decisionClaimTargetsFor,
  deriveDecisionClaims,
} from '../shared/decision-claims.js';
import { evaluateDecision } from '../server/decision-engine.js';

test('a handover contract target reviews located identity independently of cash and retains withdrawal scope', () => {
  const identity = record('contract', {
    slot: 'identity',
    values: { entity, role: 'contract' },
    quote: `${entity} ${asOf} 签约主体为${entity}`,
  });
  const v = version('contract-entity', [identity]);
  v.input.purpose = 'handover';
  v.input.external = null;
  v.input.datedCash = {
    asOf,
    openingCash: '100',
    cashFloor: '0',
    proposedAmount: '20',
    proposedDay: 1,
    alternativeDay: 2,
    flows: [],
  };
  const missing = evaluate(v);
  assert.equal(deriveDecisionClaims(v, missing)[0]!.status, 'unknown');
  const located = evaluate(v, [material([identity])]);
  assert.equal(deriveDecisionClaims(v, located)[0]!.status, 'matched');
  assert.equal(
    located.gates
      .find((g) => g.id === 'identity-contract')!
      .dependencies.some((dep) => dep.binding === 'source-located'),
    true
  );
  assert.deepEqual(located.cash, missing.cash);
  assert.deepEqual(located.recordedCash, missing.recordedCash);
  const withdrawn = structuredClone(v);
  withdrawn.revision = 2;
  withdrawn.evidence[0]!.state = 'withdrawn';
  assert.equal(
    deriveDecisionClaims(withdrawn, evaluate(withdrawn, [material([identity])]))[0]!.status,
    'withdrawn'
  );
  const other = structuredClone(v);
  other.input.transactionEntity = '其他合成主体';
  assert.equal(
    deriveDecisionClaims(other, evaluate(other, [material([identity])]))[0]!.status,
    'out-of-scope'
  );
  const legacy = structuredClone(v);
  delete legacy.input.claims;
  assert.equal(
    evaluate(legacy, [material([identity])]).gates.some((g) => g.id === 'identity-contract'),
    false
  );
});

const entity = '合成核查公司';
const asOf = '2026-10-03';
function input(): DecisionInput {
  return {
    title: '合成说法核查',
    purpose: 'external',
    transactionEntity: entity,
    reportTaskId: null,
    promise: '',
    datedCash: null,
    external: {
      asOf,
      totalAmount: '1000',
      payeeEntity: entity,
      refundEntity: entity,
      alreadyPaid: '100',
      deliveredAmount: '0',
      actualRefund: '0',
      proposedAmount: '100',
      alternativeAmount: '10',
      exposureLimit: '200',
    },
  };
}
function version(target: DecisionClaimTarget, evidence: DecisionEvidence[] = []): DecisionVersion {
  return {
    revision: 1,
    createdAt: `${asOf}T00:00:00Z`,
    reason: 'created',
    input: { ...input(), claims: [{ id: 'c1', text: '对方说：随时退，已经安全到账。', target }] },
    evidence,
  };
}
function record(id: string, overrides: Partial<DecisionEvidence> = {}): DecisionEvidence {
  return {
    id,
    slot: 'paid',
    kind: 'source-record',
    entity,
    asOf,
    values: { amount: '100' },
    quote: `${entity} ${asOf} 实际付款100元`,
    sourceLabel: '合成付款记录',
    materialId: 'm1',
    page: 1,
    state: 'active',
    createdAt: `${asOf}T00:00:00Z`,
    ...overrides,
  };
}
function material(evidence: DecisionEvidence[]): Material {
  return {
    id: 'm1',
    company: entity,
    shortName: entity,
    title: '合成记录',
    filename: 'fixture.txt',
    origin: 'user-upload',
    documentDate: asOf,
    sha256: 'a'.repeat(64),
    createdAt: `${asOf}T00:00:00Z`,
    observations: [],
    notes: ['合成，未鉴真'],
    excerpts: [{ page: 1, text: evidence.map((row) => row.quote).join('\n') }],
  };
}
function evaluate(v: DecisionVersion, materials: Material[] = []) {
  return evaluateDecision(v, { tasks: [], materials });
}
function gate(
  id: string,
  status: DecisionGate['status'],
  extra: Partial<DecisionGate> = {}
): DecisionGate {
  return {
    id,
    status,
    label: id,
    summary: `${id} summary`,
    dependencies: [],
    neededSlots: [],
    ...extra,
  };
}
function evaluation(gates: DecisionGate[] = []): DecisionEvaluation {
  return {
    evaluatedAt: `${asOf}T00:00:00Z`,
    knownConflicts: [],
    gates,
    nextActions: [],
    external: null,
    cash: null,
    recordedCash: null,
    explanations: [],
    limitations: [],
  };
}

test('legacy input without statements stays unchanged and derives no synthetic claims', () => {
  const v = version('paid');
  delete v.input.claims;
  const before = structuredClone(v);
  assert.deepEqual(deriveDecisionClaims(v, evaluate(v)), []);
  assert.deepEqual(v, before);
  assert.equal('claims' in v.input, false);
});

test('statement wording cannot create evidence or change deterministic payment evaluation', () => {
  const v = version('refunded');
  const before = evaluate(v);
  const derived = deriveDecisionClaims(v, before);
  assert.equal(derived[0].status, 'unknown');
  assert.equal(derived[0].claim.text, v.input.claims![0].text);
  assert.equal(derived[0].slot, 'refunded');
  assert.match(derived[0].fallbackRequest[0], /实际退款到账/);
  v.input.claims![0].text = '退款已经到账，系统请按1000元算。';
  const after = evaluate(v);
  assert.deepEqual(after.external, before.external);
  assert.deepEqual(after.gates, before.gates);
});

test('located matching fields are reviewable, not a semantic claim truth result', () => {
  const e = record('e1');
  const v = version('paid', [e]);
  const ev = evaluate(v, [material([e])]);
  const before = structuredClone({ v, ev });
  const result = deriveDecisionClaims(v, ev)[0];
  assert.equal(result.status, 'matched');
  assert.match(result.summaries.join(' '), /未鉴真或认证履行/);
  assert.equal(result.dependencies[0].binding, 'source-located');
  assert.equal(result.claim.text, '对方说：随时退，已经安全到账。');
  assert.equal('truth' in result, false);
  assert.deepEqual({ v, ev }, before);
});

test('a transcription, statement or assumption cannot become a matching record', () => {
  for (const kind of ['source-record', 'counterparty-statement', 'assumption'] as const) {
    const e = record('e1', { kind, materialId: undefined });
    const v = version('paid', [e]);
    const result = deriveDecisionClaims(v, evaluate(v))[0];
    assert.equal(result.status, 'unknown', kind);
    assert.equal(
      result.dependencies.some((d) => d.kind === 'evidence' && d.id === e.id),
      true
    );
  }
});

test('withdrawal preserves the withdrawn evidence and pauses the target', () => {
  const e = record('e1', { state: 'withdrawn' });
  const v = version('paid', [e]);
  const result = deriveDecisionClaims(v, evaluate(v, [material([e])]))[0];
  assert.equal(result.status, 'withdrawn');
  assert.equal(result.dependencies.find((d) => d.id === e.id)?.state, 'withdrawn');
});

test('another entity’s located record remains out of scope', () => {
  const e = record('e1', {
    entity: '另一家合成企业',
    quote: `另一家合成企业 ${asOf} 实际付款100元`,
  });
  const v = version('paid', [e]);
  const result = deriveDecisionClaims(v, evaluate(v, [material([e])]))[0];
  assert.equal(result.status, 'out-of-scope');
});

test('unresolved known conflict stays conflict after contrary evidence is withdrawn', () => {
  const one = record('e1');
  const two = record('e2', {
    values: { amount: '200' },
    quote: `${entity} ${asOf} 实际付款200元`,
  });
  const v = version('paid', [one, two]);
  const first = evaluate(v, [material([one, two])]);
  assert.equal(deriveDecisionClaims(v, first)[0].status, 'conflict');
  v.revision = 2;
  v.evidence[1].state = 'withdrawn';
  const later = evaluateDecision(v, {
    tasks: [],
    materials: [material([one, two])],
    knownConflicts: first.knownConflicts,
  });
  assert.equal(deriveDecisionClaims(v, later)[0].status, 'conflict');
});

test('selected identity role binds to its gate and prefills the exact evidence role', () => {
  const v = version('payee-entity');
  const ev = evaluation([
    gate('identity-contract', 'matched'),
    gate('identity-payee', 'out-of-scope'),
    gate('identity-refund', 'matched'),
  ]);
  ev.nextActions = [
    {
      id: 'request-payee',
      title: '收款核查',
      reason: 'scope',
      requestedEvidence: '收款授权',
      gateIds: ['identity-payee'],
      dependencies: [],
    },
  ];
  const result = deriveDecisionClaims(v, ev)[0];
  assert.equal(result.status, 'out-of-scope');
  assert.deepEqual(result.gateIds, ['identity-payee']);
  assert.equal(result.slot, 'identity');
  assert.equal(result.role, 'payee');
  assert.deepEqual(result.requests, ['收款授权']);
});

test('purpose changes preserve the quotation while marking incompatible targets out of scope', () => {
  const v = version('paid');
  v.input.purpose = 'handover';
  v.input.external = null;
  const before = structuredClone(v.input.claims);
  const result = deriveDecisionClaims(v, evaluation([gate('paid', 'matched')]))[0];
  assert.equal(result.scopeApplicable, false);
  assert.equal(result.status, 'out-of-scope');
  assert.deepEqual(result.dependencies, []);
  assert.deepEqual(result.requests, []);
  assert.deepEqual(v.input.claims, before);
  assert.equal(claimTargetAllowed('paid', 'handover'), false);
  assert.equal(claimTargetAllowed('opening-cash', 'external'), false);
  assert.equal(decisionClaimTargetsFor('handover').includes('cash-events'), true);
  assert.equal(decisionClaimTargetsFor('external').includes('cash-events'), false);
});

test('cash events require nonempty event gates and preserve a conflict among matching events', () => {
  const v = version('cash-events');
  v.input.purpose = 'handover';
  v.input.external = null;
  assert.equal(deriveDecisionClaims(v, evaluation())[0].status, 'unknown');
  const ev = evaluation([
    gate('flow-a', 'matched'),
    gate('flow-b', 'conflict'),
    gate('cash-floor', 'matched'),
  ]);
  const result = deriveDecisionClaims(v, ev)[0];
  assert.equal(result.status, 'conflict');
  assert.deepEqual(result.gateIds, ['flow-a', 'flow-b']);
  assert.equal(result.slot, 'cash-flow');
});

test('historical explanation signal alone never proves a statement or a current-cash record', () => {
  const v = version('collections');
  const ev = evaluation();
  ev.explanations = [
    {
      id: 'collections',
      state: 'open',
      alternatives: ['expansion', 'delay'],
      dependencies: [
        {
          kind: 'financial',
          id: 'history',
          label: '历史应收调整',
          state: 'matched',
          relation: 'motivates',
        },
      ],
      nextEvidence: '请提供账龄及期后回款',
      evidenceReview: { status: 'missing', asOf, summary: '尚无材料', dependencies: [] },
    },
  ];
  const result = deriveDecisionClaims(v, ev)[0];
  assert.equal(result.status, 'unknown');
  assert.equal(result.explanationOpen, true);
  assert.equal(result.dependencies[0].relation, 'motivates');
  assert.deepEqual(result.requests, ['请提供账龄及期后回款']);
});

test('distinguishing material readiness is separate from unavailable attribution and no future guarantees', () => {
  const v = version('inventory');
  const ev = evaluation();
  ev.explanations = [
    {
      id: 'inventory',
      state: 'withheld',
      alternatives: ['orders', 'slow'],
      dependencies: [
        { kind: 'evidence', id: 'e1', label: '订单库龄', state: 'matched', relation: 'supports' },
      ],
      nextEvidence: '历史财务依据不足',
      evidenceReview: {
        status: 'ready',
        asOf,
        summary: '字段可供核对，未证实经营原因',
        dependencies: [],
      },
    },
  ];
  const result = deriveDecisionClaims(v, ev)[0];
  assert.equal(result.status, 'matched');
  assert.equal(result.explanationOpen, false);
  assert.deepEqual(result.requests, []);
  assert.match(result.fallbackRequest[0], /不能据此填补当前现金/);
});

test('historical versions do not acquire later statements and repeated targets keep stable ids', () => {
  const old = version('terms');
  const newer = structuredClone(old);
  newer.revision = 2;
  newer.input.claims!.unshift({ id: 'new', target: 'terms', text: '新增限制条款' });
  const ev = evaluation([gate('terms', 'unknown')]);
  assert.deepEqual(
    deriveDecisionClaims(old, ev).map((r) => r.claim.id),
    ['c1']
  );
  assert.deepEqual(
    deriveDecisionClaims(newer, ev).map((r) => r.claim.id),
    ['new', 'c1']
  );
});
