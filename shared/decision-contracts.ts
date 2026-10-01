import type { MetricKey, ReviewPurpose } from './contracts.js';

export interface DatedCashInput {
  asOf: string;
  openingCash: string | null;
  cashFloor: string;
  proposedAmount: string | null;
  proposedDay: number | null;
  alternativeDay: number | null;
  flows: {
    id: string;
    label: string;
    direction: 'in' | 'out';
    day: number | null;
    amount: string | null;
    flexibility: 'fixed' | 'proposed';
  }[];
}
export interface ExternalPaymentInput {
  asOf: string;
  totalAmount: string | null;
  payeeEntity: string | null;
  refundEntity: string | null;
  alreadyPaid: string | null;
  deliveredAmount: string | null;
  actualRefund: string | null;
  proposedAmount: string | null;
  alternativeAmount: string | null;
  exposureLimit: string | null;
}
export type DecisionEvidenceSlot =
  | 'identity'
  | 'terms'
  | 'paid'
  | 'delivered'
  | 'refunded'
  | 'opening-cash'
  | 'cash-flow'
  | 'collections'
  | 'inventory';
export interface DecisionEvidenceInput {
  slot: DecisionEvidenceSlot;
  kind: 'source-record' | 'counterparty-statement' | 'assumption';
  entity: string;
  asOf: string | null;
  flowId?: string;
  values: {
    amount?: string | null;
    day?: number | null;
    entity?: string;
    terms?: string;
    role?: 'contract' | 'payee' | 'refund';
  };
  quote: string;
  sourceLabel: string;
  materialId?: string;
  observationId?: string;
  page?: number | null;
}
export interface DecisionEvidence extends DecisionEvidenceInput {
  id: string;
  state: 'active' | 'withdrawn';
  createdAt: string;
}
export interface DecisionInput {
  title: string;
  purpose: ReviewPurpose;
  transactionEntity: string;
  reportTaskId: string | null;
  promise: string;
  external: ExternalPaymentInput | null;
  datedCash: DatedCashInput | null;
}
export interface DecisionVersion {
  revision: number;
  createdAt: string;
  reason:
    | 'created'
    | 'edited'
    | 'evidence-added'
    | 'evidence-withdrawn'
    | 'evidence-restored'
    | 'scope-corrected'
    | 'restored-version';
  restoredFrom?: number;
  input: DecisionInput;
  evidence: DecisionEvidence[];
}
export interface DecisionCase {
  id: string;
  currentRevision: number;
  createdAt: string;
  updatedAt: string;
  versions: DecisionVersion[];
  knownConflicts: DecisionKnownConflict[];
}
export interface DecisionKnownConflict {
  id: string;
  slot: DecisionEvidenceSlot;
  entity: string;
  flowId?: string;
  role?: 'contract' | 'payee' | 'refund';
  evidenceIds: string[];
  message: string;
  introducedRevision: number;
  asOf?: string | null;
  resolvedRevision?: number;
  resolutionReason?: string;
  resolutionEvents?: { revision: number; state: 'scope-corrected' | 'reopened'; reason: string }[];
}
export interface DecisionSummary {
  id: string;
  title: string;
  purpose: ReviewPurpose;
  transactionEntity: string;
  currentRevision: number;
  createdAt: string;
  updatedAt: string;
}
export type DecisionDependencyState =
  | 'matched'
  | 'missing'
  | 'withdrawn'
  | 'conflict'
  | 'out-of-scope'
  | 'assumption';
export interface DecisionDependency {
  kind: 'evidence' | 'financial' | 'input';
  id: string;
  label: string;
  state: DecisionDependencyState;
  materialId?: string;
  page?: number | null;
  observationId?: string;
  taskId?: string;
  metric?: MetricKey;
  path?: string;
  binding?: 'source-located' | 'user-transcribed' | 'not-located';
  relation?: 'supports' | 'motivates';
}
export interface DecisionGate {
  id: string;
  label: string;
  status: 'matched' | 'unknown' | 'conflict' | 'out-of-scope' | 'withdrawn' | 'condition-unmet';
  summary: string;
  dependencies: DecisionDependency[];
  neededSlots: DecisionEvidenceSlot[];
}
export interface DecisionNextAction {
  id: string;
  title: string;
  reason: string;
  requestedEvidence: string;
  gateIds: string[];
  dependencies: DecisionDependency[];
}
export interface ExternalPaymentScenario {
  id: 'A' | 'B';
  proposedAmount: string | null;
  exposure: string | null;
  withinLimit: boolean | null;
  status: 'known' | 'unknown';
  missingFields: string[];
}
export interface DecisionEvaluation {
  evaluatedAt: string;
  knownConflicts: DecisionKnownConflict[];
  gates: DecisionGate[];
  nextActions: DecisionNextAction[];
  external: {
    assumptionScenarios: ExternalPaymentScenario[];
    recordScenarios: ExternalPaymentScenario[];
  } | null;
  cash: import('./decision-cash.js').DatedCashComparison | null;
  recordedCash: import('./decision-cash.js').DatedCashComparison | null;
  explanations: {
    id: 'collections' | 'inventory';
    state: 'open' | 'withheld';
    alternatives: [string, string];
    dependencies: DecisionDependency[];
    nextEvidence: string;
  }[];
  limitations: string[];
}
export interface DecisionDetail {
  decision: DecisionSummary;
  version: DecisionVersion;
  evaluation: DecisionEvaluation;
  revisions: {
    revision: number;
    createdAt: string;
    reason: DecisionVersion['reason'];
    restoredFrom?: number;
  }[];
}
export interface CreateDecisionInput extends DecisionInput {}
export interface PatchDecisionInput {
  baseRevision: number;
  input: DecisionInput;
}
export interface AddDecisionEvidenceInput {
  baseRevision: number;
  evidence: DecisionEvidenceInput;
}
export interface UpdateDecisionEvidenceInput {
  baseRevision: number;
  state: 'active' | 'withdrawn';
}
export interface RestoreDecisionInput {
  baseRevision: number;
  revision: number;
}
export interface CorrectDecisionEvidenceScopeInput {
  baseRevision: number;
  entity: string;
  asOf: string | null;
  reason: string;
}
