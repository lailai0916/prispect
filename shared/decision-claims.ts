import type { ReviewPurpose } from './contracts.js';
import type {
  DecisionClaim,
  DecisionClaimTarget,
  DecisionDependency,
  DecisionEvaluation,
  DecisionEvidenceSlot,
  DecisionGate,
  DecisionVersion,
} from './decision-contracts.js';

type Localized = readonly [string, string];
export interface DecisionClaimTargetDefinition {
  label: Localized;
  slot: DecisionEvidenceSlot;
  role?: 'contract' | 'payee' | 'refund';
  purposes: readonly ReviewPurpose[];
  request: Localized;
}
/** This list describes review fields, not predicates deciding whether quoted language is true. */
export const decisionClaimTargets: Record<DecisionClaimTarget, DecisionClaimTargetDefinition> = {
  'contract-entity': {
    label: ['签约主体', 'Contract entity'],
    slot: 'identity',
    role: 'contract',
    purposes: ['external', 'handover'],
    request: [
      '提供签约主体原件，核对法定名称与本次责任主体；品牌或门店名不能替代。',
      'Provide the contract-entity document and check its legal name and responsibility for this matter. A brand or store name does not substitute.',
    ],
  },
  'payee-entity': {
    label: ['收款主体', 'Payee entity'],
    slot: 'identity',
    role: 'payee',
    purposes: ['external'],
    request: [
      '提供收款主体、账户及合同付款指引；如与签约方不同，核对授权与责任依据。',
      'Provide the payee, account and contract payment instructions. If the payee differs from the contract entity, review authorization and responsibility.',
    ],
  },
  'refund-entity': {
    label: ['退款责任主体', 'Refund-responsible entity'],
    slot: 'identity',
    role: 'refund',
    purposes: ['external'],
    request: [
      '提供退款责任主体的原件及合同约定；同集团、品牌或口头答复不能替代责任依据。',
      'Provide original records and contract terms identifying the refund-responsible entity. Group affiliation, branding or an oral reply does not establish responsibility.',
    ],
  },
  terms: {
    label: ['付款、交付与退款条件', 'Payment, delivery and refund terms'],
    slot: 'terms',
    purposes: ['external', 'handover'],
    request: [
      '核对本次主体、适用日期与付款、交付、退款或延期的书面条件；条款存在不代表已同意或履行。',
      'Review written payment, delivery, refund or delay terms for this entity and applicable date. Having terms does not establish consent or performance.',
    ],
  },
  paid: {
    label: ['已付款记录', 'Payments already made'],
    slot: 'paid',
    purposes: ['external'],
    request: [
      '提供截至所选日期的实际付款凭据及原文，核对主体、金额与范围；拟付金额不替代。',
      'Provide payment records and source text as of the selected date. Check the entity, amount and scope; a proposed payment is not a payment already made.',
    ],
  },
  delivered: {
    label: ['实际交付对应金额', 'Value actually delivered'],
    slot: 'delivered',
    purposes: ['external'],
    request: [
      '提供已发生交付及对应金额记录，核对验收与计价范围；未来交付承诺不替代。',
      'Provide records of delivery already made and its corresponding value. Check acceptance and valuation scope; a promise of future delivery does not substitute.',
    ],
  },
  refunded: {
    label: ['实际退款记录', 'Actual refunds'],
    slot: 'refunded',
    purposes: ['external'],
    request: [
      '提供截至所选日期的实际退款到账记录；承诺退款或可退条款不代表已到账，也不抵减实际敞口。',
      'Provide records of refunds actually received as of the selected date. Promised refunds or refund terms do not establish receipt or reduce actual exposure.',
    ],
  },
  'opening-cash': {
    label: ['当前可用现金', 'Current available cash'],
    slot: 'opening-cash',
    purposes: ['handover'],
    request: [
      '提供起点日期的账户对账、受限资金与可用余额记录；历史年报现金不能替代。',
      'Provide account reconciliation, restricted-funds and available-balance records for the opening date. Cash in a historical annual report does not substitute.',
    ],
  },
  'cash-events': {
    label: ['收付款事件的金额与日期', 'Cash-event amounts and dates'],
    slot: 'cash-flow',
    purposes: ['handover'],
    request: [
      '逐笔提供收付款事件的主体、金额、日期及原文依据；预计回款与必要付款均保留，缺依据不填零或删除事件。',
      'Provide each cash event’s entity, amount, date and source text. Retain expected receipts and necessary payments; missing evidence does not justify zeroing or removing an event.',
    ],
  },
  collections: {
    label: ['回款解释', 'Collection explanation'],
    slot: 'collections',
    purposes: ['external', 'handover'],
    request: [
      '提供同主体、同适用日期的账龄、票据结算及期后回款原文，用于区分解释；历史财务信号不能裁定经营原因。',
      'Provide aging, bill-settlement and subsequent collection source records for the same entity and applicable date to distinguish explanations. A historical financial signal does not establish an operating cause.',
    ],
  },
  inventory: {
    label: ['存货解释', 'Inventory explanation'],
    slot: 'inventory',
    purposes: ['external', 'handover'],
    request: [
      '提供同主体、同适用日期的订单覆盖、库龄及期后出库原文，用于区分解释；不能据此填补当前现金。',
      'Provide order coverage, inventory aging and subsequent dispatch source records for the same entity and applicable date to distinguish explanations. They do not fill current cash.',
    ],
  },
};

export function claimTargetAllowed(target: DecisionClaimTarget, purpose: ReviewPurpose): boolean {
  return decisionClaimTargets[target]?.purposes.includes(purpose) ?? false;
}
export function decisionClaimTargetsFor(purpose: ReviewPurpose): DecisionClaimTarget[] {
  return (Object.keys(decisionClaimTargets) as DecisionClaimTarget[]).filter((target) =>
    claimTargetAllowed(target, purpose)
  );
}
export interface DecisionClaimReview {
  claim: DecisionClaim;
  status: DecisionGate['status'];
  targetLabel: Localized;
  slot: DecisionEvidenceSlot;
  role?: 'contract' | 'payee' | 'refund';
  gateIds: string[];
  dependencies: DecisionDependency[];
  /** Canonical evaluation summaries and requests; render with existing decision translations. */
  summaries: string[];
  requests: string[];
  fallbackRequest: Localized;
  scopeApplicable: boolean;
  /** A material review can be ready even when no historical attribution signal is applicable. */
  explanationOpen?: boolean;
}
function uniqueDependencies(dependencies: DecisionDependency[]): DecisionDependency[] {
  const seen = new Set<string>();
  return dependencies.filter((dep) => {
    const key = JSON.stringify([
      dep.kind,
      dep.id,
      dep.state,
      dep.relation,
      dep.binding,
      dep.materialId,
      dep.page,
      dep.path,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function aggregateStatus(gates: DecisionGate[]): DecisionGate['status'] {
  // Empty plans are unknown, never an automatically successful every([]) check.
  if (!gates.length) return 'unknown';
  for (const status of [
    'conflict',
    'out-of-scope',
    'withdrawn',
    'unknown',
    'condition-unmet',
  ] as const)
    if (gates.some((gate) => gate.status === status)) return status;
  return 'matched';
}
function gatesFor(
  target: DecisionClaimTarget,
  version: DecisionVersion,
  evaluation: DecisionEvaluation
): DecisionGate[] {
  const id = {
    'contract-entity': 'identity-contract',
    'payee-entity': 'identity-payee',
    'refund-entity': 'identity-refund',
    terms: version.input.purpose === 'handover' ? 'alternative-terms' : 'terms',
    paid: 'paid',
    delivered: 'delivered',
    refunded: 'refunded',
    'opening-cash': 'opening-cash',
    'cash-events': '',
    collections: '',
    inventory: '',
  }[target];
  return evaluation.gates.filter((gate) =>
    target === 'cash-events' ? gate.id.startsWith('flow-') : gate.id === id
  );
}
/** Pure, version-bound read model. Text is retained verbatim and is never interpreted as a fact. */
export function deriveDecisionClaims(
  version: DecisionVersion,
  evaluation: DecisionEvaluation
): DecisionClaimReview[] {
  return (version.input.claims ?? []).map((claim) => {
    const definition = decisionClaimTargets[claim.target];
    const scopeApplicable = claimTargetAllowed(claim.target, version.input.purpose);
    const base = {
      claim: { ...claim },
      targetLabel: definition.label,
      slot: definition.slot,
      ...(definition.role ? { role: definition.role } : {}),
      fallbackRequest: definition.request,
      scopeApplicable,
    };
    if (!scopeApplicable)
      return {
        ...base,
        status: 'out-of-scope',
        gateIds: [],
        dependencies: [],
        summaries: [],
        requests: [],
      };
    if (claim.target === 'collections' || claim.target === 'inventory') {
      const explanation = evaluation.explanations.find((item) => item.id === claim.target);
      const review = explanation?.evidenceReview;
      const status =
        review?.status === 'ready'
          ? 'matched'
          : review?.status === 'conflict'
            ? 'conflict'
            : review?.status === 'withdrawn'
              ? 'withdrawn'
              : review?.status === 'out-of-scope'
                ? 'out-of-scope'
                : 'unknown';
      return {
        ...base,
        status,
        gateIds: [],
        // Historical facts motivate inquiry and cannot stand in for distinguishing records.
        dependencies: uniqueDependencies(explanation?.dependencies ?? []),
        summaries: review ? [review.summary] : [],
        requests: explanation?.state === 'open' ? [explanation.nextEvidence] : [],
        explanationOpen: explanation?.state === 'open',
      };
    }
    const gates = gatesFor(claim.target, version, evaluation);
    return {
      ...base,
      status: aggregateStatus(gates),
      gateIds: gates.map((gate) => gate.id),
      dependencies: uniqueDependencies(gates.flatMap((gate) => gate.dependencies)),
      summaries: [...new Set(gates.map((gate) => gate.summary))],
      requests: [
        ...new Set(
          evaluation.nextActions
            .filter((action) => action.gateIds.some((id) => gates.some((gate) => gate.id === id)))
            .map((action) => action.requestedEvidence)
        ),
      ],
    };
  });
}
