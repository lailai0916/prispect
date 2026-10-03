import { useEffect, useRef, useState } from 'react';
import { productTerms } from '../shared/product-terms';
import { ChevronDown, LoaderCircle, RefreshCw } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import {
  companyPath,
  type CompanyContextSnapshot,
  type CompanyIndustrySnapshot,
} from '../shared/company-workspace';
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
import { companyChartSelectionMemory, companyChartSelectionScope } from './company-chart-selection';

/** Keep peer loading alive across workspace sections; render charts only in their own pages. */
export function CompanyFinancialChartsSection({
  run,
  snapshot,
  basis,
  view = 'combined',
  visible = true,
  autoLoad = true,
  onHistoryResult,
}: {
  run: CompanyResearchRun;
  snapshot: CompanyContextSnapshot;
  basis: CompanyReadingBasis;
  view?: 'history' | 'industry' | 'combined';
  visible?: boolean;
  autoLoad?: boolean;
  onHistoryResult?: (result: IndustryHistoryResult) => void;
}) {
  const { t, locale, user } = useApp();
  const owner = user?.id || '';
  const selectionScope = companyChartSelectionScope(run);
  const compatibleSnapshot =
    snapshot.securityCode === run.input.securityCode && snapshot.orgId === run.input.orgId;
  const periods = [
    ...new Set(
      snapshot.financials
        .filter((row) => row.annual && /^20\d{2}-12-31$/.test(row.period))
        .map((row) => row.period)
    ),
  ].sort();
  const researchPeriod = `${run.input.year}-12-31`;
  const initialPeriod = periods.includes(researchPeriod)
    ? researchPeriod
    : periods.at(-1) || researchPeriod;
  // No local choice yet: new acquired periods continue to follow the research year.
  const [requested, setRequested] = useState<string | null>(() =>
    companyChartSelectionMemory.read(owner, selectionScope)
  );
  const setPeriod = (next: string) => {
    if (!periods.includes(next)) return;
    setRequested(next);
    companyChartSelectionMemory.save(owner, selectionScope, next);
  };
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
  const busy =
    !compatibleSnapshot || run.contextStatus === 'loading' || run.assessmentStatus === 'loading';
  const latest = useRef({ run: currentRun, onHistoryResult, t, locale, owner, selectionScope });
  latest.current = { run: currentRun, onHistoryResult, t, locale, owner, selectionScope };
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
    const activeOwner = owner;
    const activeScope = selectionScope;
    const stillCurrent = () =>
      !controller.signal.aborted &&
      latest.current.owner === activeOwner &&
      latest.current.selectionScope === activeScope;
    try {
      await loadIndustryHistory(latest.current.run, {
        mode,
        signal: controller.signal,
        onResult: (result) => {
          if (stillCurrent()) rememberResult(result);
        },
        onProgress: (completed, total) => {
          if (stillCurrent()) setProgress({ completed, total });
        },
      });
    } catch (cause) {
      if (stillCurrent()) setError(requestErrorText(cause, latest.current.locale));
    } finally {
      if (request.current === controller) {
        setLoading(false);
        request.current = null;
      }
    }
  };
  const historyScope = historyPeriods.join(',');
  useEffect(() => {
    setRequested(companyChartSelectionMemory.read(owner, selectionScope));
    setResults({});
    setError('');
    setRevealed(false);
  }, [owner, selectionScope]);
  useEffect(() => {
    setLoading(false);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [owner, selectionScope, historyScope, busy]);
  useEffect(() => {
    if (!busy && autoLoad) void loadPeers('missing');
  }, [owner, selectionScope, historyScope, busy, autoLoad]);
  const openPeers = () => {
    const element = document.getElementById('company-industry') as HTMLDetailsElement | null;
    if (element) {
      element.open = true;
      setRevealed(true);
      element.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  };
  if (!visible) return null;
  if (!compatibleSnapshot)
    return (
      <p className="context-empty">
        {t('财务资料与当前企业不匹配。', 'The financial data does not match this company.')}
      </p>
    );
  return (
    <>
      {view !== 'industry' && (
        <section id="company-financial-history" className="company-workspace-section">
          <div className="financial-chart-history-heading">
            <h2 className="company-workspace-section-title">
              {t(...productTerms.financialTrends)}
            </h2>
            {historyPeriods.length > 0 && (
              <div className="financial-chart-history-actions">
                {industry?.chartMetrics &&
                  (view === 'history' ? (
                    <a className="context-evidence-button" href={companyPath(run.id, 'industry')}>
                      {t('查看同行依据', 'View peer evidence')}
                    </a>
                  ) : (
                    <button className="context-evidence-button" type="button" onClick={openPeers}>
                      {t('查看同行依据', 'View peer evidence')}
                    </button>
                  ))}
                <button
                  className="context-evidence-button"
                  type="button"
                  disabled={loading || busy}
                  aria-busy={loading}
                  onClick={() => void loadPeers('refresh')}
                >
                  {loading ? (
                    <LoaderCircle size={14} className="spinner" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
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
      )}
      {view === 'industry' && (
        <section id="company-industry" className="company-workspace-section">
          <CompanyIndustryView
            run={currentRun}
            industries={industries}
            selectedPeriod={period}
            onPeriodChange={setPeriod}
            onSnapshot={remember}
          />
        </section>
      )}
      {view === 'combined' && (
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
              run={currentRun}
              industries={industries}
              selectedPeriod={period}
              onPeriodChange={setPeriod}
              onSnapshot={remember}
            />
          )}
        </details>
      )}
    </>
  );
}
