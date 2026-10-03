import type {
  DecisionDetail,
  DecisionGate,
  DecisionEvidence,
  ExternalPaymentInput,
} from './decision-contracts.js';

export type PaymentBoundaryField =
  | 'totalAmount'
  | 'alreadyPaid'
  | 'deliveredAmount'
  | 'actualRefund'
  | 'exposureLimit';
export type PaymentBoundaryInput = Pick<ExternalPaymentInput, PaymentBoundaryField>;
export interface PaymentBoundaryCalculation {
  status: 'known' | 'unknown' | 'invalid' | 'already-above-limit';
  maximumProposedAmount: string | null;
  currentExposure: string | null;
  currentExcess: string | null;
  exposureHeadroom: string | null;
  remainingContractAmount: string | null;
  bindingConstraint: 'exposure' | 'contract' | 'both' | null;
  missingFields: string[];
  invalidFields: string[];
}
const fields: PaymentBoundaryField[] = [
  'totalAmount',
  'alreadyPaid',
  'deliveredAmount',
  'actualRefund',
  'exposureLimit',
];
function fen(value: string): bigint | null {
  if (!/^\d{1,20}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, decimals = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(decimals.padEnd(2, '0'));
}
function yuan(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
function unavailable(
  missingFields: string[],
  invalidFields: string[] = []
): PaymentBoundaryCalculation {
  return {
    status: invalidFields.length ? 'invalid' : 'unknown',
    maximumProposedAmount: null,
    currentExposure: null,
    currentExcess: null,
    exposureHeadroom: null,
    remainingContractAmount: null,
    bindingConstraint: null,
    missingFields,
    invalidFields,
  };
}
/** A constraint calculation in integer fen. No entity judgment or payment recommendation. */
export function calculatePaymentBoundary(input: PaymentBoundaryInput): PaymentBoundaryCalculation {
  const missingFields: string[] = [],
    invalidFields: string[] = [];
  const parsed: Partial<Record<PaymentBoundaryField, bigint>> = {};
  for (const field of fields) {
    const raw = input[field];
    if (raw === null || raw === undefined) missingFields.push(field);
    else {
      const amount = fen(raw);
      if (amount === null) invalidFields.push(field);
      else parsed[field] = amount;
    }
  }
  if (missingFields.length || invalidFields.length)
    return unavailable(missingFields, invalidFields);
  const {
    totalAmount: total,
    alreadyPaid: paid,
    deliveredAmount: delivered,
    actualRefund: refund,
    exposureLimit: limit,
  } = parsed as Record<PaymentBoundaryField, bigint>;
  if (paid > total) invalidFields.push('alreadyPaid-exceeds-total');
  if (delivered > total) invalidFields.push('deliveredAmount-exceeds-total');
  if (refund > paid) invalidFields.push('actualRefund-exceeds-paid');
  if (invalidFields.length) return unavailable([], invalidFields);
  const rawExposure = paid - delivered - refund;
  const currentExposure = rawExposure < 0n ? 0n : rawExposure;
  const headroom = limit - rawExposure;
  const remaining = total - paid;
  if (currentExposure > limit)
    return {
      status: 'already-above-limit',
      maximumProposedAmount: null,
      currentExposure: yuan(currentExposure),
      currentExcess: yuan(currentExposure - limit),
      exposureHeadroom: yuan(headroom),
      remainingContractAmount: yuan(remaining),
      bindingConstraint: null,
      missingFields: [],
      invalidFields: [],
    };
  return {
    status: 'known',
    maximumProposedAmount: yuan(headroom < remaining ? headroom : remaining),
    currentExposure: yuan(currentExposure),
    currentExcess: '0.00',
    exposureHeadroom: yuan(headroom),
    remainingContractAmount: yuan(remaining),
    bindingConstraint:
      headroom === remaining ? 'both' : headroom < remaining ? 'exposure' : 'contract',
    missingFields: [],
    invalidFields: [],
  };
}

type BoundaryDetail = Pick<DecisionDetail, 'version' | 'evaluation'>;
export interface PaymentBoundaryView {
  assumptions: PaymentBoundaryCalculation;
  records: PaymentBoundaryCalculation;
  recordEvidenceIds: string[];
  missingRecordGateIds: string[];
  inputConditionFields: ['totalAmount', 'exposureLimit'];
  recordInput: PaymentBoundaryInput;
}
function locatedGate(gate: DecisionGate | undefined): boolean {
  return (
    gate?.status === 'matched' &&
    gate.dependencies.some(
      (dependency) =>
        dependency.kind === 'evidence' &&
        dependency.state === 'matched' &&
        dependency.binding === 'source-located'
    )
  );
}
function recordAmount(detail: BoundaryDetail, slot: 'paid' | 'delivered' | 'refunded') {
  const gate = detail.evaluation.gates.find((item) => item.id === slot);
  if (!locatedGate(gate)) return { amount: null, evidenceIds: [] as string[] };
  const ids = new Set(
    gate!.dependencies
      .filter(
        (dependency) =>
          dependency.kind === 'evidence' &&
          dependency.state === 'matched' &&
          dependency.binding === 'source-located'
      )
      .map((dependency) => dependency.id)
  );
  const records = detail.version.evidence.filter(
    (record) =>
      ids.has(record.id) &&
      record.slot === slot &&
      record.state === 'active' &&
      record.kind === 'source-record' &&
      record.values.amount != null
  );
  const amounts = records.map((record) => fen(record.values.amount!));
  if (!amounts.length || amounts.some((amount) => amount === null) || new Set(amounts).size !== 1)
    return { amount: null, evidenceIds: [] as string[] };
  return { amount: yuan(amounts[0]!), evidenceIds: records.map((record) => record.id) };
}
/** Uses this version's server-evaluated dependencies; never adopts statements or older records. */
export function derivePaymentBoundary(detail: BoundaryDetail): PaymentBoundaryView | null {
  const input = detail.version.input.external;
  if (detail.version.input.purpose !== 'external' || !input) return null;
  const paid = recordAmount(detail, 'paid'),
    delivered = recordAmount(detail, 'delivered'),
    refunded = recordAmount(detail, 'refunded');
  const recordInput: PaymentBoundaryInput = {
    totalAmount: input.totalAmount,
    exposureLimit: input.exposureLimit,
    alreadyPaid: paid.amount,
    deliveredAmount: delivered.amount,
    actualRefund: refunded.amount,
  };
  const required = ['identity-contract', 'identity-payee', 'identity-refund', 'terms'];
  const missingRecordGateIds = required.filter(
    (id) => !locatedGate(detail.evaluation.gates.find((gate) => gate.id === id))
  );
  for (const [id, value] of [
    ['paid', paid],
    ['delivered', delivered],
    ['refunded', refunded],
  ] as const)
    if (value.amount === null) missingRecordGateIds.push(id);
  if (
    detail.evaluation.gates.some(
      (gate) => gate.id === 'payment-range' && gate.status === 'conflict'
    )
  )
    missingRecordGateIds.push('payment-range');
  const calculation = calculatePaymentBoundary(recordInput);
  return {
    assumptions: calculatePaymentBoundary(input),
    records: missingRecordGateIds.length
      ? unavailable(
          [...calculation.missingFields, ...missingRecordGateIds.map((id) => `gate:${id}`)],
          calculation.invalidFields
        )
      : calculation,
    recordEvidenceIds: [...paid.evidenceIds, ...delivered.evidenceIds, ...refunded.evidenceIds],
    missingRecordGateIds,
    inputConditionFields: ['totalAmount', 'exposureLimit'],
    recordInput,
  };
}

export interface DecisionEntityPathNode {
  id: 'trading-name' | 'contract' | 'payee' | 'refund';
  name: string | null;
  status: DecisionGate['status'] | 'input-only';
  gateId: string | null;
  evidenceIds: string[];
}
/** Names describe roles; neither equal names nor this display establishes a legal relationship. */
export function deriveDecisionEntityPath(detail: BoundaryDetail): DecisionEntityPathNode[] | null {
  const input = detail.version.input;
  if (input.purpose !== 'external' || !input.external) return null;
  const nodes: DecisionEntityPathNode[] = [
    {
      id: 'trading-name',
      name: input.tradingName?.trim() || null,
      status: 'input-only',
      gateId: null,
      evidenceIds: [],
    },
  ];
  for (const [role, name] of [
    ['contract', input.transactionEntity],
    ['payee', input.external.payeeEntity],
    ['refund', input.external.refundEntity],
  ] as const) {
    const id = `identity-${role}`,
      gate = detail.evaluation.gates.find((gate) => gate.id === id);
    const recordIds = new Set(
      detail.version.evidence
        .filter(
          (record: DecisionEvidence) =>
            record.slot === 'identity' && (record.values.role || 'contract') === role
        )
        .map((record) => record.id)
    );
    nodes.push({
      id: role,
      name: name?.trim() || null,
      status: gate?.status || 'unknown',
      gateId: id,
      evidenceIds:
        gate?.dependencies
          .filter((dependency) => dependency.kind === 'evidence' && recordIds.has(dependency.id))
          .map((dependency) => dependency.id) || [],
    });
  }
  return nodes;
}
