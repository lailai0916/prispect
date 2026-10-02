/** Safe client DTOs only. Graph checkpoints, raw text and runtime configuration stay on the server. */
export type CompanyBranchId = 'identity' | 'finance' | 'notes' | 'announcements' | 'reconcile';
export interface CompanyBranchProgress {
  id: CompanyBranchId;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  finishedAt?: string;
  summary?: string;
}
export interface CompanyPublicEvidence {
  id: string;
  title: string;
  sourceUrl: string;
  sha256: string;
  page: number;
  quote: string;
  kind: 'annual-note' | 'announcement';
}
export interface CompanyAuditOpinionEvidence extends CompanyPublicEvidence {
  /** The explicit period in the audited-financial-statements paragraph, if unambiguous. */
  auditedYear: number | null;
}
export interface CompanyAuditOpinionResult {
  /** Absence of this optional result on an older run means it was not evaluated. */
  status: 'pending' | 'located' | 'candidate' | 'unknown';
  requestedYear: number | null;
  scope: {
    issuer: 'matched' | 'unconfirmed' | 'conflict';
    reportYear: 'matched' | 'unconfirmed' | 'conflict';
    auditPeriod: 'matched' | 'unconfirmed' | 'conflict';
  };
  evidence: CompanyAuditOpinionEvidence[];
  warnings: string[];
}
export interface CompanyCompetingExplanation {
  id: string;
  label: string;
  status: 'hypothesis';
  evidenceIds: string[];
  nextEvidence: string;
}
export interface CompanyModelFailure {
  errorCode: string;
  category:
    | 'transport'
    | 'http'
    | 'timeout'
    | 'parse'
    | 'schema'
    | 'validation'
    | 'budget'
    | 'storage'
    | 'cancelled'
    | 'unknown';
  transportCode?: string;
}
export interface CompanyModelRequestDiagnostic {
  attempt: number;
  status: 'running' | 'completed' | 'failed';
  httpStatus?: number;
  elapsedMs?: number;
  failure?: CompanyModelFailure;
}
export interface CompanyGraphProgress {
  version: 'langgraph-v1';
  requestKey?: string;
  revision: number;
  branches: CompanyBranchProgress[];
  recoverable: boolean;
  cancelRequested: boolean;
  cancelledAt?: string;
  evidence: CompanyPublicEvidence[];
  /** Deterministic report-text location, separate from adopted amounts and model evidence. */
  auditOpinion?: CompanyAuditOpinionResult;
  competingExplanations: CompanyCompetingExplanation[];
  coverage: {
    annualReports: number;
    recentTitles: number;
    recentFullTexts: number;
    recentTruncated: boolean;
    warnings: string[];
  };
  budget: {
    sourceRequests: number;
    modelRequests: number;
    maxSourceRequests: number;
    maxModelRequests: number;
  };
  providerDiagnostics?: {
    requestedTier?: string;
    actualTiers: string[];
    requests?: CompanyModelRequestDiagnostic[];
    validationFailures?: (CompanyModelFailure & { tool: string })[];
  };
}
