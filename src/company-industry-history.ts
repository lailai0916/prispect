import type { CompanyResearchRun } from '../shared/contracts';
import {
  industryHistoryPeriods,
  savedIndustryHistoryResult,
  type IndustryHistoryResult,
} from '../shared/company-industry-history';
import { api, RequestError } from './api';

/** Sequential requests keep the existing source budget and publish every completed year. */
export async function loadIndustryHistory(
  run: CompanyResearchRun,
  options: {
    mode: 'missing' | 'retry' | 'refresh';
    signal: AbortSignal;
    onResult: (result: IndustryHistoryResult) => void;
    onProgress?: (completed: number, total: number) => void;
    request?: typeof api<IndustryHistoryResult>;
  }
): Promise<void> {
  const periods = industryHistoryPeriods(run).filter((period) => {
    const saved = savedIndustryHistoryResult(run, period);
    return options.mode === 'refresh' || !saved || (options.mode === 'retry' && !!saved.failure);
  });
  let completed = 0;
  options.onProgress?.(completed, periods.length);
  for (const period of periods) {
    options.signal.throwIfAborted();
    const saved = savedIndustryHistoryResult(run, period);
    let result: IndustryHistoryResult;
    try {
      result = await (options.request || api<IndustryHistoryResult>)(
        `/company-runs/${encodeURIComponent(run.id)}/industry-history`,
        {
          method: 'POST',
          body: JSON.stringify({ period, refresh: options.mode !== 'missing' }),
          signal: options.signal,
        }
      );
      options.signal.throwIfAborted();
      if (
        result.period !== period ||
        (result.snapshot &&
          (result.snapshot.version !== 1 ||
            result.snapshot.securityCode !== run.input.securityCode ||
            result.snapshot.period !== period)) ||
        (!result.snapshot && !result.failure)
      )
        throw new RequestError('同行资料与当前企业或年度不匹配。', 'INDUSTRY_SUBJECT_CONFLICT');
    } catch (error) {
      options.signal.throwIfAborted();
      if (
        error instanceof RequestError &&
        [
          'AUTH_REQUIRED',
          'UNAUTHORIZED',
          'COMPANY_RUN_NOT_FOUND',
          'CONTEXT_STALE',
          'ASSESSMENT_BUSY',
          'CONTEXT_BUSY',
          'RATE_LIMITED',
          'INVALID_ORIGIN',
          'CSRF_INVALID',
        ].includes(error.code)
      )
        throw error;
      result = {
        period,
        snapshot: saved?.snapshot || null,
        failure: {
          attemptedAt: new Date().toISOString(),
          code: error instanceof RequestError ? error.code : 'INDUSTRY_UNAVAILABLE',
        },
        cached: false,
      };
    }
    options.signal.throwIfAborted();
    options.onResult(result);
    options.onProgress?.(++completed, periods.length);
  }
}
