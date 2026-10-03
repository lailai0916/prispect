import type { CompanyResearchRun } from '../shared/contracts.js';
import {
  industryHistoryPeriods,
  savedIndustryHistoryResult,
  type IndustryHistoryResult,
} from '../shared/company-industry-history.js';
import type { retrieveIndustrySnapshot } from './company-industry.js';
import { ApiFault } from './validation.js';

/** Persist each annual outcome independently; a failure must not discard other years. */
export async function retrieveIndustryHistoryYear(
  run: CompanyResearchRun,
  period: string,
  options: {
    refresh: boolean;
    retrieve: typeof retrieveIndustrySnapshot;
    persist: () => Promise<void>;
    current: () => boolean;
    signal: AbortSignal;
  }
): Promise<IndustryHistoryResult> {
  if (!industryHistoryPeriods(run).includes(period))
    throw new ApiFault(400, 'INDUSTRY_HISTORY_SCOPE', '请选择已取得财务资料的完整年度');
  const saved = savedIndustryHistoryResult(run, period);
  if (!options.refresh && saved) return saved;
  let result: IndustryHistoryResult;
  try {
    const snapshot = await options.retrieve(run.input.securityCode, period, {
      signal: options.signal,
    });
    options.signal.throwIfAborted();
    if (
      snapshot.version !== 1 ||
      snapshot.securityCode !== run.input.securityCode ||
      snapshot.period !== period
    )
      throw new ApiFault(422, 'INDUSTRY_SUBJECT_CONFLICT', '同行资料主体或年度不一致');
    result = { period, snapshot, failure: null, cached: false };
  } catch (error) {
    options.signal.throwIfAborted();
    result = {
      period,
      snapshot: saved?.snapshot || null,
      failure: {
        attemptedAt: new Date().toISOString(),
        code: error instanceof ApiFault ? error.code : 'INDUSTRY_UNAVAILABLE',
      },
      cached: false,
    };
  }
  if (!options.current())
    throw new ApiFault(409, 'CONTEXT_STALE', '企业记录或财务资料已变化，请重新打开');
  const previousSnapshot = run.industry?.[period];
  const previousFailure = run.industryHistoryErrors?.[period];
  if (result.snapshot) run.industry = { ...run.industry, [period]: result.snapshot };
  run.industryHistoryErrors = { ...run.industryHistoryErrors };
  if (result.failure) run.industryHistoryErrors[period] = result.failure;
  else delete run.industryHistoryErrors[period];
  try {
    await options.persist();
  } catch (error) {
    // Restore only this year, preserving any independently completed annual retrieval.
    if (result.snapshot && run.industry?.[period] === result.snapshot) {
      if (previousSnapshot) run.industry[period] = previousSnapshot;
      else delete run.industry[period];
    }
    if (run.industryHistoryErrors?.[period] === result.failure || !result.failure) {
      if (previousFailure) (run.industryHistoryErrors ||= {})[period] = previousFailure;
      else if (run.industryHistoryErrors) delete run.industryHistoryErrors[period];
    }
    throw error;
  }
  return result;
}
