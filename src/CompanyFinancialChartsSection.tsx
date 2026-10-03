import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LoaderCircle } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import type { CompanyContextSnapshot, CompanyIndustrySnapshot } from '../shared/company-workspace';
import type { CompanyReadingBasis } from '../shared/company-analysis';
import { CompanyContextHistory } from './CompanyContextHistory';
import { CompanyIndustryView } from './CompanyIndustryView';
import { api, requestErrorText } from './api';
import { useApp } from './context';
import { date } from './format';

/** One local year and saved-peer cache for both views; new years are never fetched on selection. */
export function CompanyFinancialChartsSection({
  run,
  snapshot,
  basis,
}: {
  run: CompanyResearchRun;
  snapshot: CompanyContextSnapshot;
  basis: CompanyReadingBasis;
}) {
  const { t, locale } = useApp();
  const periods = [
    ...new Set(snapshot.financials.filter((row) => row.annual).map((row) => row.period)),
  ].sort();
  const [requested, setPeriod] = useState(periods.at(-1) || `${run.input.year}-12-31`);
  const period = periods.includes(requested) ? requested : periods.at(-1) || requested;
  const [saved, setSaved] = useState<Record<string, CompanyIndustrySnapshot>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [warning, setWarning] = useState<{ period: string; text: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const industries = { ...run.industry, ...saved };
  const candidate = industries[period];
  const industry =
    candidate?.version === 1 &&
    candidate.period === period &&
    candidate.securityCode === run.input.securityCode
      ? candidate
      : null;
  useEffect(() => {
    setError('');
    setLoading(false);
    return () => {
      generation.current++;
      request.current?.abort();
    };
  }, [period, locale]);
  const remember = (next: CompanyIndustrySnapshot) => {
    if (
      next.version === 1 &&
      next.securityCode === snapshot.securityCode &&
      periods.includes(next.period)
    )
      setSaved((previous) => ({ ...previous, [next.period]: next }));
  };
  const loadPeers = async () => {
    if (loading) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    const token = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const response = await api<{
        snapshot: CompanyIndustrySnapshot;
        stale: boolean;
        warning?: string;
      }>(`/company-runs/${run.id}/industry`, {
        method: 'POST',
        body: JSON.stringify({ period, refresh: Boolean(industry && !industry.chartMetrics) }),
        signal: controller.signal,
      });
      if (controller.signal.aborted || token !== generation.current) return;
      if (
        response.snapshot.version !== 1 ||
        response.snapshot.securityCode !== snapshot.securityCode ||
        response.snapshot.period !== period
      )
        throw new Error(
          t('同行资料与当前企业或年度不匹配。', 'Peer data does not match this company or year.')
        );
      remember(response.snapshot);
      setWarning({ period, text: response.warning || '' });
    } catch (cause) {
      if (!controller.signal.aborted && token === generation.current)
        setError(requestErrorText(cause, locale));
    } finally {
      if (!controller.signal.aborted && token === generation.current) {
        setLoading(false);
        request.current = null;
      }
    }
  };
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
          {periods.length > 0 &&
            (industry?.chartMetrics ? (
              <button className="context-evidence-button" type="button" onClick={openPeers}>
                {t('查看同行依据', 'View peer evidence')}
              </button>
            ) : (
              <button
                className="context-evidence-button"
                type="button"
                disabled={loading}
                onClick={() => void loadPeers()}
              >
                {loading && <LoaderCircle size={14} className="spinner" />}
                {loading
                  ? t('正在获取同行参照…', 'Retrieving peer references…')
                  : industry
                    ? t('更新同行参照', 'Update peer references')
                    : t('加入同行参照', 'Add peer references')}
              </button>
            ))}
        </div>
        {error && (
          <p role="alert" className="inline-error">
            <span>{error}</span>
            <button
              className="text-link"
              type="button"
              onClick={() => void loadPeers()}
              disabled={loading}
            >
              {t('重试', 'Retry')}
            </button>
          </p>
        )}
        {warning?.period === period && warning.text && (
          <p role="status" className="financial-chart-reference">
            {warning.text}
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
