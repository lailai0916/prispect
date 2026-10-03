import test from 'node:test';
import assert from 'node:assert/strict';
import type { Material } from '../shared/contracts.js';
import type {
  DecisionClaim,
  DecisionDetail,
  DecisionEvidence,
  DecisionEvidenceInput,
  DecisionInput,
  DecisionVersion,
} from '../shared/decision-contracts.js';
import {
  decisionClaimQuestion,
  decisionFollowUpBinding,
  deriveDecisionFollowUpChanges,
  deriveDecisionFollowUpRecords,
} from '../shared/decision-followup.js';
import { deriveDecisionChanges } from '../shared/decision-change.js';
import { hasDecisionInputChanges } from '../shared/decision-input-change.js';
import { deriveDecisionClaims } from '../shared/decision-claims.js';
import { renderDecisionExport } from '../shared/decision-export.js';
import {
  evaluateDecision,
  validateDecisionEvidence,
  validateDecisionInput,
} from '../server/decision-engine.js';

const entity = '合成付款核验公司';
const asOf = '2026-10-03';
const question = '请提供这笔退款的到账凭据、金额与适用日期。';
const claim: DecisionClaim = {
  id: 'refund-question',
  text: '对方说这笔退款已经到账。',
  target: 'refunded',
  question,
};
function input(): DecisionInput {
  return {
    title: '合成问询核查（非真实交易）',
    purpose: 'external',
    transactionEntity: entity,
    promise: '',
    reportTaskId: null,
    claims: [structuredClone(claim)],
    datedCash: null,
    external: {
      asOf,
      totalAmount: '20000',
      payeeEntity: entity,
      refundEntity: entity,
      alreadyPaid: '10000',
      deliveredAmount: '2000',
      actualRefund: '1000',
      proposedAmount: '3000',
      alternativeAmount: '1000',
      exposureLimit: '10000',
    },
  };
}
function record(id: string, overrides: Partial<DecisionEvidence> = {}): DecisionEvidence {
  return {
    id,
    slot: 'refunded',
    kind: 'source-record',
    entity,
    asOf,
    values: { amount: '1000' },
    quote: `${entity} ${asOf} 实际退款到账1000元。`,
    sourceLabel: '合成退款凭据',
    materialId: 'original',
    page: 1,
    state: 'active',
    createdAt: `${asOf}T00:00:00Z`,
    claimId: claim.id,
    claimQuestion: question,
    claimText: claim.text,
    claimTarget: claim.target,
    ...overrides,
  };
}
function version(revision: number, evidence: DecisionEvidence[] = []): DecisionVersion {
  return {
    revision,
    createdAt: `${asOf}T00:00:00Z`,
    reason: revision === 1 ? 'created' : 'evidence-added',
    input: input(),
    evidence,
  };
}
function material(records: DecisionEvidence[]): Material {
  return {
    id: 'original',
    company: entity,
    shortName: entity,
    title: '合成交易材料',
    filename: 'synthetic.txt',
    origin: 'user-upload',
    documentDate: asOf,
    sha256: 'a'.repeat(64),
    createdAt: `${asOf}T00:00:00Z`,
    observations: [],
    notes: [],
    excerpts: [{ page: 1, text: records.map((row) => row.quote).join('\n') }],
  };
}
const evaluate = (v: DecisionVersion, materials: Material[] = []) =>
  evaluateDecision(v, { tasks: [], materials });
const status = (v: DecisionVersion, materials: Material[] = []) =>
  deriveDecisionClaims(v, evaluate(v, materials))[0]!.status;

test('saved questions are bounded, trimmed and compared as inputs; clients cannot forge reply snapshots', () => {
  const draft = input();
  draft.claims![0]!.question = `  ${question}  `;
  assert.equal(validateDecisionInput(draft).claims![0]!.question, question);
  assert.equal(hasDecisionInputChanges(draft, input()), false);
  assert.equal(
    validateDecisionInput({ ...input(), claims: [{ ...claim, text: '' }] }).claims![0]!.question,
    question
  );
  assert.throws(() =>
    validateDecisionInput({ ...input(), claims: [{ ...claim, text: ' ', question: ' ' }] })
  );
  const legacy = input();
  delete legacy.claims![0]!.question;
  const equivalent = structuredClone(legacy);
  equivalent.claims![0]!.question = '';
  equivalent.external!.alreadyPaid = '010000.00';
  assert.equal(hasDecisionInputChanges(equivalent, legacy), false);
  draft.claims![0]!.question = '请补充收款凭据。';
  assert.equal(hasDecisionInputChanges(draft, input()), true);
  assert.throws(() =>
    validateDecisionInput({ ...draft, claims: [{ ...claim, question: 'x'.repeat(2001) }] })
  );
  const payload: DecisionEvidenceInput = {
    slot: 'refunded',
    kind: 'counterparty-statement',
    entity,
    asOf,
    values: { amount: '1000' },
    quote: '对方的答复原文',
    sourceLabel: '对方答复',
    claimId: claim.id,
  };
  assert.equal(validateDecisionEvidence(payload).claimId, claim.id);
  for (const forged of ['claimQuestion', 'claimText', 'claimTarget'])
    assert.throws(() => validateDecisionEvidence({ ...payload, [forged]: '伪造问询快照' }));
});

test('explicit association checks the decision-local claim, exact target, legal-entity role and cash event', () => {
  const source = record('refund-source');
  const bound = decisionFollowUpBinding(input(), source);
  assert.deepEqual(bound, {
    valid: true,
    snapshot: { claimQuestion: question, claimText: claim.text, claimTarget: 'refunded' },
  });
  assert.deepEqual(
    decisionFollowUpBinding(input(), { ...source, claimId: 'another-decision-claim' }),
    {
      valid: false,
      reason: 'missing-claim',
    }
  );
  assert.deepEqual(decisionFollowUpBinding(input(), { ...source, slot: 'paid' }), {
    valid: false,
    reason: 'target-mismatch',
  });
  assert.deepEqual(decisionFollowUpBinding(input(), { ...source, kind: 'assumption' }), {
    valid: false,
    reason: 'unsupported-kind',
  });
  const responsible = input();
  responsible.claims = [{ ...claim, target: 'refund-entity' }];
  for (const role of [undefined, 'contract', 'payee'] as const)
    assert.deepEqual(
      decisionFollowUpBinding(responsible, {
        ...source,
        slot: 'identity',
        values: { entity, ...(role ? { role } : {}) },
      }),
      { valid: false, reason: 'target-mismatch' }
    );
  assert.equal(
    decisionFollowUpBinding(responsible, {
      ...source,
      slot: 'identity',
      values: { entity, role: 'refund' },
    }).valid,
    true
  );
  const handover = input();
  handover.purpose = 'handover';
  handover.external = null;
  handover.claims = [{ ...claim, target: 'cash-events' }];
  handover.datedCash = {
    asOf,
    openingCash: '100',
    cashFloor: '0',
    proposedAmount: '10',
    proposedDay: 1,
    alternativeDay: 2,
    flows: [
      {
        id: 'receipt',
        label: '合成回款',
        direction: 'in',
        day: 2,
        amount: '20',
        flexibility: 'fixed',
      },
    ],
  };
  for (const flowId of [undefined, 'foreign-flow'])
    assert.deepEqual(decisionFollowUpBinding(handover, { ...source, slot: 'cash-flow', flowId }), {
      valid: false,
      reason: 'missing-flow',
    });
  assert.equal(
    decisionFollowUpBinding(handover, { ...source, slot: 'cash-flow', flowId: 'receipt' }).valid,
    true
  );
  const unassociated = { ...source };
  delete unassociated.claimId;
  assert.deepEqual(decisionFollowUpBinding(input(), unassociated), { valid: true, snapshot: {} });
});

test('reply lists use stable claim IDs and retain old wording and target instead of rebinding by similar text', () => {
  const answer = record('answer', { kind: 'counterparty-statement' });
  const v = version(2, [
    answer,
    record('other', { claimId: 'another-question' }),
    record('unlinked', { claimId: undefined }),
  ]);
  const original = structuredClone(v);
  assert.deepEqual(
    deriveDecisionFollowUpRecords(v, claim).map((row) => [row.evidence.id, row.priorQuestion]),
    [['answer', false]]
  );
  for (const changed of [
    { question: '新的问询问题。' },
    { text: '对方改为说退款将来到账。' },
    { target: 'paid' as const },
  ]) {
    const currentClaim = { ...claim, ...changed };
    const rows = deriveDecisionFollowUpRecords(v, currentClaim);
    assert.equal(rows[0]!.priorQuestion, true);
    assert.equal(rows[0]!.evidence.claimQuestion, question);
    assert.equal(rows[0]!.evidence.claimTarget, 'refunded');
  }
  assert.deepEqual(v, original, 'rendering old questions cannot rewrite saved records');
});

test('a located counterparty reply does not reduce exposure; only independently located record fields can change it', () => {
  const paid = record('paid', {
    slot: 'paid',
    values: { amount: '10000' },
    quote: `${entity} ${asOf} 实际付款10000元。`,
    claimId: undefined,
  });
  const delivered = record('delivered', {
    slot: 'delivered',
    values: { amount: '2000' },
    quote: `${entity} ${asOf} 实际交付对应金额2000元。`,
    claimId: undefined,
  });
  const reply = record('reply', { kind: 'counterparty-statement', sourceLabel: '对方答复' });
  const refund = record('refund');
  const originals = [material([paid, delivered, reply, refund])];
  const before = version(1, [paid, delivered]);
  const replied = version(2, [paid, delivered, reply]);
  const supported = version(3, [paid, delivered, reply, refund]);
  assert.equal(status(replied, originals), 'unknown');
  assert.deepEqual(evaluate(before, originals).external, evaluate(replied, originals).external);
  assert.equal(evaluate(replied, originals).external!.recordScenarios[0]!.exposure, null);
  assert.equal(evaluate(replied, originals).external!.assumptionScenarios[0]!.exposure, '10000.00');
  assert.equal(status(supported, originals), 'matched');
  assert.equal(evaluate(supported, originals).external!.recordScenarios[0]!.exposure, '10000.00');
  const withdrawn = structuredClone(supported);
  withdrawn.revision = 4;
  withdrawn.evidence.find((row) => row.id === 'refund')!.state = 'withdrawn';
  assert.equal(
    status(withdrawn, originals),
    'unknown',
    'retained reply cannot substitute for withdrawn original'
  );
  assert.equal(evaluate(withdrawn, originals).external!.recordScenarios[0]!.exposure, null);
  for (const independent of ['paid', 'delivered'])
    assert.equal(
      evaluate(withdrawn, originals).gates.find((gate) => gate.id === independent)!.status,
      'matched'
    );
  assert.deepEqual(
    evaluate(withdrawn, originals).external!.assumptionScenarios,
    evaluate(supported, originals).external!.assumptionScenarios
  );
  const restored = structuredClone(supported);
  restored.revision = 5;
  assert.equal(status(restored, originals), 'matched');
  assert.equal(evaluate(restored, originals).external!.recordScenarios[0]!.exposure, '10000.00');
  assert.equal(status(supported), 'unknown', 'claim association cannot replace material location');
});

test('adjacent version feedback identifies replies, original records and withdrawal without promising factual truth', () => {
  const before = version(1);
  const reply = record('reply', { kind: 'counterparty-statement' });
  const replied = version(2, [reply]);
  const originals = [material([reply, record('refund')])];
  const changes = deriveDecisionFollowUpChanges(
    before,
    replied,
    evaluate(before, originals),
    evaluate(replied, originals)
  );
  assert.deepEqual(changes, [
    {
      claimId: claim.id,
      fromRevision: 1,
      toRevision: 2,
      before: 'unknown',
      after: 'unknown',
      questionChanged: false,
      addedReplyIds: ['reply'],
      addedRecordIds: [],
      withdrawnIds: [],
      restoredIds: [],
    },
  ]);
  const supported = version(3, [reply, record('refund')]);
  const recorded = deriveDecisionFollowUpChanges(
    replied,
    supported,
    evaluate(replied, originals),
    evaluate(supported, originals)
  )[0]!;
  assert.equal(recorded.after, 'matched');
  assert.deepEqual(recorded.addedRecordIds, ['refund']);
  const withdrawn = structuredClone(supported);
  withdrawn.revision = 4;
  withdrawn.evidence[1]!.state = 'withdrawn';
  assert.deepEqual(
    deriveDecisionFollowUpChanges(
      supported,
      withdrawn,
      evaluate(supported, originals),
      evaluate(withdrawn, originals)
    )[0]!.withdrawnIds,
    ['refund']
  );
  const restored = structuredClone(supported);
  restored.revision = 5;
  assert.deepEqual(
    deriveDecisionFollowUpChanges(
      withdrawn,
      restored,
      evaluate(withdrawn, originals),
      evaluate(restored, originals)
    )[0]!.restoredIds,
    ['refund']
  );
  const revised = structuredClone(restored);
  revised.revision = 6;
  revised.input.claims![0]!.question = '请提供退款到账的账户明细。';
  const feedback = deriveDecisionFollowUpChanges(
    restored,
    revised,
    evaluate(restored, originals),
    evaluate(revised, originals)
  )[0]!;
  assert.equal(feedback.questionChanged, true);
  assert.equal(
    feedback.before,
    feedback.after,
    'question edits alone do not change financial field meaning'
  );
  assert.ok(
    deriveDecisionChanges(restored, revised, evaluate(restored), evaluate(revised)).changes.some(
      (row) => row.key === `claim:${claim.id}:question`
    )
  );
});

test('legacy and archived versions have no invented replies; default requests stay tied to their target', () => {
  const legacy = version(1);
  delete legacy.input.claims;
  assert.deepEqual(
    deriveDecisionFollowUpChanges(legacy, legacy, evaluate(legacy), evaluate(legacy)),
    []
  );
  assert.deepEqual(deriveDecisionFollowUpRecords(version(1), claim), []);
  const defaultQuestion = decisionClaimQuestion({ ...claim, question: '  ' });
  assert.match(defaultQuestion, /实际退款到账记录/);
  assert.notEqual(
    defaultQuestion,
    decisionClaimQuestion({ ...claim, target: 'paid', question: undefined })
  );
});

test('opposing records linked to one question pause the affected result and withdrawal does not erase the recorded conflict', () => {
  const paid = record('paid', {
    slot: 'paid',
    values: { amount: '10000' },
    quote: `${entity} ${asOf} 实际付款10000元。`,
    claimId: undefined,
  });
  const delivered = record('delivered', {
    slot: 'delivered',
    values: { amount: '2000' },
    quote: `${entity} ${asOf} 实际交付对应金额2000元。`,
    claimId: undefined,
  });
  const refund = record('refund');
  const contrary = record('contrary-refund', {
    values: { amount: '1500' },
    quote: `${entity} ${asOf} 实际退款到账1500元。`,
    sourceLabel: '合成独立反向原件',
    materialId: 'opposing-original',
  });
  const originals = [
    material([paid, delivered, refund]),
    { ...material([contrary]), id: 'opposing-original' },
  ];
  const supported = version(3, [paid, delivered, refund]);
  const disputed = version(4, [paid, delivered, refund, contrary]);
  const before = evaluate(supported, originals);
  const conflict = evaluate(disputed, originals);
  assert.equal(deriveDecisionClaims(supported, before)[0]!.status, 'matched');
  assert.equal(deriveDecisionClaims(disputed, conflict)[0]!.status, 'conflict');
  assert.equal(conflict.external!.recordScenarios[0]!.exposure, null);
  assert.ok(
    conflict.knownConflicts.some(
      (issue) =>
        issue.evidenceIds.includes('refund') && issue.evidenceIds.includes('contrary-refund')
    )
  );
  const added = deriveDecisionFollowUpChanges(supported, disputed, before, conflict)[0]!;
  assert.equal(added.before, 'matched');
  assert.equal(added.after, 'conflict');
  assert.deepEqual(added.addedRecordIds, ['contrary-refund']);
  const withdrawn = structuredClone(disputed);
  withdrawn.revision = 5;
  withdrawn.evidence.find((row) => row.id === 'contrary-refund')!.state = 'withdrawn';
  const retained = evaluateDecision(withdrawn, {
    tasks: [],
    materials: originals,
    knownConflicts: conflict.knownConflicts,
  });
  assert.equal(deriveDecisionClaims(withdrawn, retained)[0]!.status, 'conflict');
  assert.equal(retained.external!.recordScenarios[0]!.exposure, null);
  assert.deepEqual(retained.knownConflicts, conflict.knownConflicts);
  const removed = deriveDecisionFollowUpChanges(disputed, withdrawn, conflict, retained)[0]!;
  assert.equal(removed.before, 'conflict');
  assert.equal(removed.after, 'conflict');
  assert.deepEqual(removed.withdrawnIds, ['contrary-refund']);
  for (const evaluation of [conflict, retained]) {
    for (const independent of ['paid', 'delivered'])
      assert.equal(evaluation.gates.find((gate) => gate.id === independent)!.status, 'matched');
    assert.deepEqual(
      evaluation.external!.assumptionScenarios,
      before.external!.assumptionScenarios
    );
  }
  assert.equal(disputed.evidence.find((row) => row.id === 'contrary-refund')!.state, 'active');
});

test('offline evidence retains escaped question snapshots and associations without executable content', () => {
  const v = version(2, [
    record('reply', {
      kind: 'counterparty-statement',
      quote: '<img src=x onerror=alert(1)>PRIVATE_REPLY',
      claimQuestion: '<script>PRIVATE_OLD_QUESTION</script>',
    }),
  ]);
  v.input.claims![0]!.question = '<svg onload=alert(2)>PRIVATE_NEW_QUESTION';
  const detail: DecisionDetail = {
    decision: {
      id: 'decision',
      title: v.input.title,
      purpose: v.input.purpose,
      transactionEntity: entity,
      currentRevision: 2,
      createdAt: v.createdAt,
      updatedAt: v.createdAt,
    },
    version: v,
    evaluation: evaluate(v),
    revisions: [{ revision: 2, createdAt: v.createdAt, reason: v.reason }],
  };
  const html = renderDecisionExport(detail, 'zh-Hans');
  assert.ok(html.includes('&lt;svg onload=alert(2)&gt;PRIVATE_NEW_QUESTION'));
  assert.ok(html.includes('&lt;script&gt;PRIVATE_OLD_QUESTION&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;PRIVATE_REPLY'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /对应此前问题/);
});
