import type {
  DecisionClaim,
  DecisionEvidence,
  DecisionEvidenceInput,
  DecisionEvaluation,
  DecisionGate,
  DecisionInput,
  DecisionVersion,
} from './decision-contracts.js';
import { decisionClaimTargets, deriveDecisionClaims } from './decision-claims.js';

export function decisionClaimQuestion(claim: DecisionClaim): string {
  return claim.question?.trim() || decisionClaimTargets[claim.target].request[0];
}

export type DecisionFollowUpBinding =
  | { valid: true; snapshot: Pick<DecisionEvidence, 'claimQuestion' | 'claimText' | 'claimTarget'> }
  | {
      valid: false;
      reason: 'missing-claim' | 'target-mismatch' | 'missing-flow' | 'unsupported-kind';
    };

/** A link organizes private evidence; it never establishes financial or contractual validity. */
export function decisionFollowUpBinding(
  input: DecisionInput,
  evidence: DecisionEvidenceInput
): DecisionFollowUpBinding {
  if (!evidence.claimId) return { valid: true, snapshot: {} };
  const claim = input.claims?.find((item) => item.id === evidence.claimId);
  if (!claim) return { valid: false, reason: 'missing-claim' };
  if (evidence.kind === 'assumption') return { valid: false, reason: 'unsupported-kind' };
  const definition = decisionClaimTargets[claim.target];
  if (
    definition.slot !== evidence.slot ||
    (definition.role && definition.role !== evidence.values.role)
  )
    return { valid: false, reason: 'target-mismatch' };
  if (
    claim.target === 'cash-events' &&
    !input.datedCash?.flows.some((flow) => flow.id === evidence.flowId)
  )
    return { valid: false, reason: 'missing-flow' };
  return {
    valid: true,
    snapshot: {
      claimQuestion: decisionClaimQuestion(claim),
      claimText: claim.text,
      claimTarget: claim.target,
    },
  };
}

export interface DecisionFollowUpRecord {
  evidence: DecisionEvidence;
  /** Changed wording or target does not automatically rebind the original reply. */
  priorQuestion: boolean;
}
export function deriveDecisionFollowUpRecords(
  version: DecisionVersion,
  claim: DecisionClaim
): DecisionFollowUpRecord[] {
  return version.evidence
    .filter((evidence) => evidence.claimId === claim.id)
    .map((evidence) => ({
      evidence,
      priorQuestion:
        evidence.claimQuestion !== decisionClaimQuestion(claim) ||
        (evidence.claimText !== undefined && evidence.claimText !== claim.text) ||
        (evidence.claimTarget !== undefined && evidence.claimTarget !== claim.target),
    }));
}

export interface DecisionFollowUpChange {
  claimId: string;
  fromRevision: number;
  toRevision: number;
  before: DecisionGate['status'] | null;
  after: DecisionGate['status'];
  questionChanged: boolean;
  addedReplyIds: string[];
  addedRecordIds: string[];
  withdrawnIds: string[];
  restoredIds: string[];
}

/** Adjacent immutable versions under the same rules, never an observed business event. */
export function deriveDecisionFollowUpChanges(
  previous: DecisionVersion,
  current: DecisionVersion,
  previousEvaluation: DecisionEvaluation,
  currentEvaluation: DecisionEvaluation
): DecisionFollowUpChange[] {
  const beforeReviews = deriveDecisionClaims(previous, previousEvaluation);
  return deriveDecisionClaims(current, currentEvaluation)
    .map((review): DecisionFollowUpChange => {
      const before = beforeReviews.find((item) => item.claim.id === review.claim.id);
      const oldRecords = new Map(previous.evidence.map((record) => [record.id, record]));
      const records = current.evidence.filter((record) => record.claimId === review.claim.id);
      const added = records.filter((record) => !oldRecords.has(record.id));
      return {
        claimId: review.claim.id,
        fromRevision: previous.revision,
        toRevision: current.revision,
        before: before?.status ?? null,
        after: review.status,
        questionChanged:
          !!before &&
          (decisionClaimQuestion(before.claim) !== decisionClaimQuestion(review.claim) ||
            before.claim.text !== review.claim.text ||
            before.claim.target !== review.claim.target),
        addedReplyIds: added
          .filter((record) => record.kind === 'counterparty-statement')
          .map((record) => record.id),
        addedRecordIds: added
          .filter((record) => record.kind === 'source-record')
          .map((record) => record.id),
        withdrawnIds: records
          .filter(
            (record) =>
              record.state === 'withdrawn' && oldRecords.get(record.id)?.state === 'active'
          )
          .map((record) => record.id),
        restoredIds: records
          .filter(
            (record) =>
              record.state === 'active' && oldRecords.get(record.id)?.state === 'withdrawn'
          )
          .map((record) => record.id),
      };
    })
    .filter(
      (change) =>
        change.before !== change.after ||
        change.questionChanged ||
        !!(
          change.addedReplyIds.length ||
          change.addedRecordIds.length ||
          change.withdrawnIds.length ||
          change.restoredIds.length
        )
    );
}
