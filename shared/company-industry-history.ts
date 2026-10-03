import type { CompanyResearchRun } from './contracts.js';
import type { CompanyIndustrySnapshot } from './company-workspace.js';

export interface IndustryHistoryFailure {
  attemptedAt: string;
  code: string;
}

export interface IndustryHistoryResult {
  period: string;
  snapshot: CompanyIndustrySnapshot | null;
  failure: IndustryHistoryFailure | null;
  cached: boolean;
}

/** Only the acquired annual chart window, with the report year read first. */
export function industryHistoryPeriods(run: CompanyResearchRun): string[] {
  if (
    !run.context ||
    run.context.securityCode !== run.input.securityCode ||
    run.context.orgId !== run.input.orgId ||
    run.informationGap ||
    run.identity?.exchange === 'us'
  )
    return [];
  const periods = [
    ...new Set(
      run.context.financials
        .filter((row) => row.annual && /^20\d{2}-12-31$/.test(row.period))
        .map((row) => row.period)
    ),
  ]
    .sort()
    .reverse()
    .slice(0, 6);
  const selected = `${run.input.year}-12-31`;
  return periods.sort((a, b) => (a === selected ? -1 : b === selected ? 1 : b.localeCompare(a)));
}

export function savedIndustryHistoryResult(
  run: CompanyResearchRun,
  period: string
): IndustryHistoryResult | null {
  const saved = run.industry?.[period];
  const snapshot =
    saved?.version === 1 && saved.securityCode === run.input.securityCode && saved.period === period
      ? saved
      : null;
  const failure = run.industryHistoryErrors?.[period] || null;
  // A partial cohort is a settled result too. Never refresh it due to age or missing values.
  return snapshot?.chartMetrics || failure ? { period, snapshot, failure, cached: true } : null;
}
