/** A report's follow-up actions, not a count of risks, sources or missing fields. */
import type { CompanyResearchRun } from './contracts.js';
import type { AssessmentJudgment } from './company-assessment.js';
import {
  deriveCompanyResearchBrief,
  deriveCompanyResearchProgress,
} from './company-research-view.js';

export interface CompanyPendingReview {
  /** Unknown when there is no usable report; zero does not mean zero risk. */
  count: number | null;
  previous: boolean;
  snapshotFetchedAt: string | null;
  items: { judgment: AssessmentJudgment; hasEvidence: boolean }[];
}

export function companyPendingReview(run: CompanyResearchRun): CompanyPendingReview {
  const progress = deriveCompanyResearchProgress(run);
  const assessment = run.assessment;
  if (!assessment || progress.snapshot === 'mismatch' || run.informationGap) {
    return { count: null, previous: false, snapshotFetchedAt: null, items: [] };
  }
  const brief = deriveCompanyResearchBrief(run);
  const metrics = new Set(assessment.metrics.map((metric) => metric.id));
  const evidence = new Set(assessment.evidence.map((item) => item.id));
  const items = brief.nextChecks.map((judgment) => ({
    judgment,
    hasEvidence:
      judgment.metricIds.some((id) => metrics.has(id)) ||
      judgment.evidenceIds.some((id) => evidence.has(id)),
  }));
  return {
    count: items.length,
    previous: progress.previousReportAvailable,
    snapshotFetchedAt: Number.isFinite(Date.parse(assessment.snapshotFetchedAt))
      ? assessment.snapshotFetchedAt
      : null,
    items,
  };
}
