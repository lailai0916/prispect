import type { CompanyResearchRun } from './contracts.js';
import { deriveCompanyResearchProgress } from './company-research-view.js';

const recordedDate = (value: string | undefined): string | null =>
  value && Number.isFinite(Date.parse(value)) ? value : null;
const revision = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Read availability from this record, never infer a completed job or a complete prior snapshot. */
export function companyResearchAvailability(run: CompanyResearchRun) {
  const progress = deriveCompanyResearchProgress(run);
  const context =
    !run.informationGap &&
    progress.snapshot !== 'mismatch' &&
    run.context?.securityCode === run.input.securityCode &&
    run.context.orgId === run.input.orgId
      ? run.context
      : undefined;
  const report =
    progress.snapshot !== 'mismatch' && !run.informationGap ? run.assessment : undefined;
  const cancelRevisions = {
    ...(run.contextStatus === 'loading' && revision(run.contextRevision)
      ? { contextRevision: run.contextRevision }
      : {}),
    ...(run.assessmentStatus === 'loading' && revision(run.assessmentRevision)
      ? { assessmentRevision: run.assessmentRevision }
      : {}),
  };
  const active = run.contextStatus === 'loading' || run.assessmentStatus === 'loading';
  const events =
    run.contextStatus !== 'loading' &&
    (run.assessmentStatus === 'loading' || run.assessmentStatus === 'failed')
      ? run.assessmentTrace || []
      : [];
  const times = events
    .flatMap((event) => [event.startedAt, event.finishedAt])
    .map(recordedDate)
    .filter((value): value is string => value !== null)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return {
    active,
    failed: run.contextStatus === 'failed' || run.assessmentStatus === 'failed',
    hasSources: Boolean(
      context &&
        (context.financials.length ||
          context.sources.length ||
          context.news.length ||
          context.announcements.length ||
          context.discussions?.length)
    ),
    hasFinancials: Boolean(context?.financials.length),
    sourceFetchedAt: recordedDate(context?.fetchedAt),
    reportSnapshotAt: recordedDate(report?.snapshotFetchedAt),
    lastActivityAt: active ? times.at(-1) || null : null,
    cancelRevisions,
    canCancel:
      progress.snapshot !== 'mismatch' &&
      !run.informationGap &&
      Object.keys(cancelRevisions).length > 0,
  };
}
