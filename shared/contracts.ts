import type { CompanyGraphProgress, CompanyBranchId } from './company-contracts.js';
import type { CompanyWorkspaceExtension } from './company-workspace.js';

export type MetricKey =
  | 'netProfit'
  | 'operatingCashFlow'
  | 'inventoryAdjustment'
  | 'receivablesAdjustment'
  | 'payablesAdjustment'
  | 'otherAdjustments';
export type StatementScope = 'consolidated' | 'parent' | 'unknown';
export type MoneyUnit = 'yuan' | 'wan' | 'yi' | 'usd';
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed';
export type Verdict = 'supported' | 'attention' | 'insufficient' | 'conflict';
export type ReviewPurpose = 'external' | 'handover';

export const CONTEXT_NOTE_KEYS = [
  'external.identity',
  'external.promise',
  'external.latest',
  'handover.cash',
  'handover.schedule',
  'handover.controls',
] as const;
export type ContextNoteKey = (typeof CONTEXT_NOTE_KEYS)[number];
export interface ContextNote {
  done: boolean;
  note: string;
}
export type ContextNotes = Partial<Record<ContextNoteKey, ContextNote>>;
export interface CashPlanPeriod {
  days: 30 | 60 | 90;
  inflow: string | null;
  outflow: string | null;
}
export interface CashPlanInput {
  asOf: string;
  openingCash: string | null;
  periods: [
    CashPlanPeriod & { days: 30 },
    CashPlanPeriod & { days: 60 },
    CashPlanPeriod & { days: 90 },
  ];
}
export interface CashPlan extends CashPlanInput {
  updatedAt?: string;
}
export interface TaskContextPatch {
  purpose?: ReviewPurpose;
  contextNotes?: ContextNotes;
  cashPlan?: CashPlanInput | null;
}

export interface EvidenceRef {
  materialId: string;
  page: number | null;
  quote: string;
  sourceUrl?: string;
}

export interface Observation {
  id: string;
  key: MetricKey;
  year: number;
  period?: 'annual' | 'interim' | 'quarterly' | 'unknown';
  value: string;
  unit: MoneyUnit;
  currency: string;
  scope: StatementScope;
  page: number | null;
  quote: string;
  kind: 'reported' | 'derived';
  components?: { label: string; value: string; page: number | null; quote: string }[];
}

export interface Material {
  id: string;
  company: string;
  shortName: string;
  title: string;
  filename: string;
  origin: 'public-report' | 'user-upload';
  documentDate: string;
  sourceUrl?: string;
  sha256: string;
  createdAt: string;
  observations: Observation[];
  notes: string[];
  excerpts: { page: number; text: string }[];
  rawSourceId?: string;
  uploadId?: string;
  managementExplanation?: string;
}

export interface DemoCase {
  id: string;
  title: string;
  description: string;
  company: string;
  shortName: string;
  materialIds: string[];
  year: number;
  kind: 'contrast' | 'counterpoint' | 'missing' | 'conflict';
}

export interface Stage {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  message?: string;
}

export interface ComputedMetric {
  key: MetricKey | 'cashConversion' | 'profitGrowth' | 'cashGrowth' | 'profitChange' | 'cashChange';
  label: string;
  value: string | null;
  previousValue: string | null;
  unit: 'CNY' | '%' | 'USD';
  kind: 'reported' | 'calculated';
  formula: string;
  sourceRefs: EvidenceRef[];
}

export interface BridgeStep {
  key: MetricKey;
  label: string;
  value: string;
  kind: 'total' | 'adjustment';
  sourceRefs: EvidenceRef[];
  derived: boolean;
}

export interface Check {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  sourceRefs: EvidenceRef[];
}

export interface Finding {
  id: string;
  label: string;
  severity: 'attention' | 'neutral' | 'insufficient';
  explanation: string;
  basis: 'calculation' | 'source' | 'management';
  sourceRefs: EvidenceRef[];
  questionIds: string[];
}

export interface Question {
  id: string;
  text: string;
  reason: string;
  requestedEvidence: string;
  status: 'open' | 'done';
  trigger?: {
    year: number;
    metric: MetricKey;
    amount: string;
    sourceRefs: EvidenceRef[];
  };
}

export interface CrossSignal {
  id: 'profit-cash-working-capital' | 'profit-with-cash-outflow';
  title: { zh: string; en: string };
  reading: { zh: string; en: string };
  facts: {
    year: number;
    metric: MetricKey;
    amount: string;
    sourceRefs: EvidenceRef[];
  }[];
  explanations: [{ zh: string; en: string }, { zh: string; en: string }];
  nextEvidence: {
    external: { zh: string; en: string };
    handover: { zh: string; en: string };
  };
}

export interface CrossSignalCheck {
  id: CrossSignal['id'];
  title: { zh: string; en: string };
  status: 'triggered' | 'not-triggered' | 'blocked';
  requirements: {
    year: number;
    metric: MetricKey;
    state: 'available' | 'excluded' | 'missing' | 'conflict' | 'invalid';
    amount: string | null;
    sourceRefs: EvidenceRef[];
  }[];
  conditions: {
    id: string;
    label: { zh: string; en: string };
    status: 'met' | 'not-met' | 'unknown';
  }[];
  blockers: {
    code: string;
    message: { zh: string; en: string };
    sourceRefs: EvidenceRef[];
  }[];
}

export interface Report {
  verdict: Verdict;
  headline: string;
  summary: string;
  company: string;
  year: number;
  previousYear: number;
  metrics: ComputedMetric[];
  bridge: BridgeStep[] | null;
  checks: Check[];
  findings: Finding[];
  /** Optional for reports saved before cross-signal analysis was introduced. */
  crossSignals?: CrossSignal[];
  /** Saved evaluations only; missing on historical reports and never computed while rendering. */
  crossSignalChecks?: CrossSignalCheck[];
  questions: Question[];
  coverage: { present: number; total: number };
  limitations: string[];
  model: {
    enabled: boolean;
    status: 'not-configured' | 'not-requested' | 'completed' | 'failed';
    provider?: string;
    name?: string;
    text?: string;
    error?: string;
  };
  snapshot: Material[];
}

export interface AnalysisTask {
  id: string;
  title: string;
  company: string;
  year: number;
  materialIds: string[];
  excludedMetrics: MetricKey[];
  useModel?: boolean;
  purpose?: ReviewPurpose;
  contextNotes?: ContextNotes;
  cashPlan?: CashPlan;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  stages: Stage[];
  report?: Report;
  error?: string;
}

export interface Workspace {
  materials: Material[];
  tasks: AnalysisTask[];
  provider: { name: 'rules' | 'openai-compatible'; configured: boolean };
}

export interface CreateTaskInput {
  title: string;
  company: string;
  year: number;
  materialIds: string[];
  excludedMetrics?: MetricKey[];
  useModel?: boolean;
  purpose?: ReviewPurpose;
}

export interface UploadPreview {
  material: Omit<Material, 'id' | 'createdAt'>;
  warnings: string[];
  uploadId?: string;
}

export interface ApiError {
  error: string;
  code: string;
}

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  timezone?: string;
}

export interface AuthSession {
  user: AccountUser | null;
  csrfToken: string | null;
  registrationEnabled: boolean;
}

export interface CompanyIdentity {
  securityCode: string;
  orgId: string;
  shortName: string;
  companyName: string | null;
  exchange: 'szse' | 'sse' | 'bse' | 'us' | 'unknown';
  sourceUrl: string;
}
export interface CompanySearchResponse {
  query: string;
  candidates: CompanyIdentity[];
  limitedToListed: true;
  source: 'cninfo' | 'sec';
  truncated: boolean;
}
export interface CompanyAnnouncement {
  id: string;
  title: string;
  publishedAt: string;
  sourceUrl: string;
  category: 'annual' | 'recent';
  reportYear?: number;
}
export interface CompanyAgentTrace {
  branchId?: CompanyBranchId;
  id: string;
  tool: string;
  label: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  startedAt: string;
  finishedAt?: string;
  inputSummary: string;
  outputSummary?: string;
  decision?: string;
  sources: { title: string; url: string; page?: number; sha256?: string }[];
}
export interface CompanyCandidatePreview {
  material: Omit<Material, 'id' | 'createdAt'>;
  reviewRequired: true;
  warnings: string[];
  tablePages: number[];
  checks: Check[];
}
export interface CompanyRunInput {
  securityCode: string;
  orgId: string;
  year: number;
  purpose?: ReviewPurpose;
  useModel?: boolean;
}
export interface CompanyResearchRun extends CompanyWorkspaceExtension {
  agent?: CompanyGraphProgress;
  id: string;
  input: CompanyRunInput;
  identity?: CompanyIdentity;
  status: 'queued' | 'running' | 'ready' | 'failed' | 'adopted';
  createdAt: string;
  updatedAt: string;
  trace: CompanyAgentTrace[];
  announcements: CompanyAnnouncement[];
  preview?: CompanyCandidatePreview;
  stoppedReason?: string;
  error?: string;
  adoptedMaterialId?: string;
  model: {
    requested: boolean;
    status: 'not-requested' | 'not-configured' | 'not-called' | 'completed' | 'failed';
    provider?: string;
    name?: string;
    error?: string;
  };
}
export interface CompanyAdoptInput {
  confirmed: true;
  material: Omit<Material, 'id' | 'createdAt'>;
}
export interface CompanyAdoptResponse {
  material: Material;
  run: CompanyResearchRun;
}
