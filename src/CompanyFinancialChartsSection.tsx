import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LoaderCircle, RefreshCw } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import type { CompanyContextSnapshot, CompanyIndustrySnapshot } from '../shared/company-workspace';
import type { CompanyReadingBasis } from '../shared/company-analysis';
import { CompanyContextHistory } from './CompanyContextHistory';
import { CompanyIndustryView } from './CompanyIndustryView';
import { requestErrorText } from './api';
import {
  industryHistoryPeriods,
  savedIndustryHistoryResult,
  type IndustryHistoryResult,
} from '../shared/company-industry-history';
import { loadIndustryHistory } from './company-industry-history';
import { useApp } from './context';
import { date } from './format';

/** Fill missing annual peers once; settled snapshots and failures require explicit refresh. */
export function CompanyFinancialChartsSection({
  run,
  snapshot,
  basis,
  onHistoryResult,
}: {
  run: CompanyResearchRun;
  snapshot: CompanyContextSnapshot;
  basis: CompanyReadingBasis;
  onHistoryResult?: (result: IndustryHistoryResult) => void;
}) {
  const { t, locale } = useApp();
  const periods = [
    ...new Set(snapshot.financials.filter((row) => row.annual).map((row) => row.period)),
  ].sort();
  const researchPeriod = `${run.input.year}-12-31`;
  const initialPeriod = periods.includes(researchPeriod)
    ? researchPeriod
    : periods.at(-1) || researchPeriod;
  // No local choice yet: new acquired periods continue to follow the research year.
  const [requested, setPeriod] = useState<string | null>(null);
  const period = requested && periods.includes(requested) ? requested : initialPeriod;
  const [results, setResults] = useState<Record<string, IndustryHistoryResult>>({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const industries = { ...run.industry };
  const failures = { ...run.industryHistoryErrors };
  for (const result of Object.values(results)) {
    if (result.snapshot) industries[result.period] = result.snapshot;
    if (result.failure) failures[result.period] = result.failure;
    else delete failures[result.period];
  }
  const currentRun = { ...run, industry: industries, industryHistoryErrors: failures };
  const historyPeriods = industryHistoryPeriods(currentRun);
  const peerStatuses = Object.fromEntries(
    historyPeriods.flatMap((year) => {
      const result = savedIndustryHistoryResult(currentRun, year);
      const status = result?.failure
        ? t('读取失败', 'Failed')
        : !result
          ? t('待获取', 'Pending')
          : result.snapshot?.status === 'partial'
            ? t('部分缺值', 'Partial')
            : '';
      return status ? [[year, status]] : [];
    })
  );
  const busy = run.contextStatus === 'loading' || run.assessmentStatus === 'loading';
  const latest = useRef({ run: currentRun, onHistoryResult, t, locale });
  latest.current = { run: currentRun, onHistoryResult, t, locale };
  const candidate = industries[period];
  const industry =
    candidate?.version === 1 &&
    candidate.period === period &&
    candidate.securityCode === run.input.securityCode
      ? candidate
      : null;
  const rememberResult = (result: IndustryHistoryResult) => {
    if (result.snapshot && result.snapshot.securityCode !== latest.current.run.input.securityCode)
      return;
    setResults((previous) => ({ ...previous, [result.period]: result }));
    latest.current.onHistoryResult?.(result);
  };
  const remember = (next: CompanyIndustrySnapshot) => {
    if (next.version === 1 && periods.includes(next.period))
      rememberResult({ period: next.period, snapshot: next, failure: null, cached: false });
  };
  const loadPeers = async (mode: 'missing' | 'retry' | 'refresh') => {
    if (busy || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      await loadIndustryHistory(latest.current.run, {
        mode,
        signal: controller.signal,
        onResult: rememberResult,
        onProgress: (completed, total) => setProgress({ completed, total }),
      });
    } catch (cause) {
      if (!controller.signal.aborted) setError(requestErrorText(cause, latest.current.locale));
    } finally {
      if (request.current === controller) {
        setLoading(false);
        request.current = null;
      }
    }
  };
  const historyScope = historyPeriods.join(',');
  useEffect(() => {
    setLoading(false);
    if (!busy) void loadPeers('missing');
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [run.id, run.input.securityCode, historyScope, busy]);
  const openPeers = () => {
    const element = document.getElementById('company-industry') as HTMLDetailsElement | null;
    if (element) {
      element.open = true;
      setRevealed(true);
      element.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  };
  return (
    <>
      <section id="company-financial-history" className="company-workspace-section">
        <div className="financial-chart-history-heading">
          <h2 className="company-workspace-section-title">
            {t('历史财务走势', 'Financial history')}
          </h2>
          {historyPeriods.length > 0 && (
            <div className="financial-chart-history-actions">
              {industry?.chartMetrics && (
                <button className="context-evidence-button" type="button" onClick={openPeers}>
                  {t('查看同行依据', 'View peer evidence')}
                </button>
              )}
              <button
                className="context-evidence-button"
                type="button"
                disabled={loading || busy}
                aria-busy={loading}
                onClick={() => void loadPeers('refresh')}
              >
                {loading ? <LoaderCircle size={14} className="spinner" /> : <RefreshCw size={14} />}
                {loading
                  ? t(
                      `读取同行 ${progress.completed}/${progress.total} 年`,
                      `Reading peers ${progress.completed}/${progress.total} years`
                    )
                  : t('刷新历年同行', 'Refresh annual peers')}
              </button>
              {Object.keys(failures).length > 0 && (
                <button
                  className="context-evidence-button"
                  type="button"
                  disabled={loading || busy}
                  onClick={() => void loadPeers('retry')}
                >
                  {t('重试缺失年份', 'Retry missing years')}
                </button>
              )}
            </div>
          )}
        </div>
        {periods.length > 0 && !periods.includes(researchPeriod) && (
          <p className="context-data-note">
            {t(
              `未取得 ${run.input.year} 年度财务资料，当前展示 ${period.slice(0, 4)} 年度。`,
              `Financial data for ${run.input.year} is unavailable; showing ${period.slice(0, 4)}.`
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="inline-error">
            <span>{error}</span>
            <button
              className="text-link"
              type="button"
              onClick={() => void loadPeers('retry')}
              disabled={loading || busy}
            >
              {t('重试', 'Retry')}
            </button>
          </p>
        )}
        {Object.keys(failures).length > 0 && (
          <p role="status" className="financial-chart-reference">
            {Object.entries(failures).map(([year, failure]) => (
              <span key={year}>
                {year.slice(0, 4)} · {t('读取失败', 'Retrieval failed')}
                {industries[year] && t('（保留上次资料）', ' (previous data retained)')}{' '}
                <time dateTime={failure.attemptedAt}>{date(failure.attemptedAt, locale)}</time>
                {'　'}
              </span>
            ))}
          </p>
        )}
        {industry && (
          <p className="financial-chart-reference">
            {industry.industry} · {industry.peerCount} {t('家同行', 'peers')} ·{' '}
            {t('取得于', 'Retrieved')} {date(industry.fetchedAt, locale)}
          </p>
        )}
        <CompanyContextHistory
          snapshot={snapshot}
          basis={basis}
          industries={industries}
          selectedPeriod={period}
          onPeriodChange={setPeriod}
          peerStatuses={peerStatuses}
        />
      </section>
      <details
        id="company-industry"
        className="company-review-details"
        onToggle={(event) => {
          if (event.currentTarget.open) setRevealed(true);
        }}
      >
        <summary>
          <ChevronDown size={14} />
          {t('行业对比', 'Industry comparison')}
        </summary>
        {revealed && (
          <CompanyIndustryView
            run={run}
            industries={industries}
            selectedPeriod={period}
            onPeriodChange={setPeriod}
            onSnapshot={remember}
          />
        )}
      </details>
    </>
  );
}
