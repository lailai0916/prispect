export type MetricKey =
  | 'netProfit'
  | 'operatingCashFlow'
  | 'inventoryAdjustment'
  | 'receivablesAdjustment'
  | 'payablesAdjustment'
  | 'otherAdjustments';
export type StatementScope = 'consolidated' | 'parent' | 'unknown';
export type MoneyUnit = 'yuan' | 'wan' | 'yi';
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed';
export type Verdict = 'supported' | 'attention' | 'insufficient' | 'conflict';

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
  key: MetricKey | 'cashConversion' | 'profitGrowth' | 'cashGrowth';
  label: string;
  value: string | null;
  previousValue: string | null;
  unit: 'CNY' | '%';
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
}

export interface AuthSession {
  user: AccountUser | null;
  csrfToken: string | null;
}
