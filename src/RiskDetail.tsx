import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';

import type { EvidenceRef, Report } from '../shared/contracts';
import { useApp } from './context';
import { deriveRiskPerspective, riskStatusText, type RiskMetric } from './riskDimensions';

interface ReputationItem {
  title: string;
  url: string;
  source?: string | null;
  publishedAt: string | null;
}
interface ReputationData {
  query: string;
  count: number;
  items: ReputationItem[];
  fetchedAt: string;
  truncated: boolean;
}

/** Source-linked checks share the report's document layout and theme. */
export function RiskDetail({ report }: { report: Report }) {
  const { t, locale, showEvidence } = useApp();
  const perspective = useMemo(() => deriveRiskPerspective(report, locale), [report, locale]);
  const [reputation, setReputation] = useState<ReputationData | null>(null);
  const [repLoading, setRepLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setRepLoading(true);
    void fetch(`/api/company-reputation?q=${encodeURIComponent(report.company)}`)
      .then((response) => (response.ok ? (response.json() as Promise<ReputationData>) : null))
      .then((data) => {
        if (alive) setReputation(data);
      })
      .catch(() => {
        if (alive) setReputation(null);
      })
      .finally(() => {
        if (alive) setRepLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [report.company]);

  const openRefs = (refs: EvidenceRef[]) => {
    if (refs.length > 0) showEvidence(refs, report);
  };

  return (
    <section className="risk-detail" aria-label={t('分项核查', 'Review dimensions')}>
      <div className="risk-detail-head">
        <h2>{t('分项核查', 'Review dimensions')}</h2>
        <span className="risk-detail-hint">
          {t('带来源图标的数据可回溯原文', 'Use source icons to inspect original evidence')}
        </span>
      </div>
      <div className="risk-detail-grid">
        {perspective.dimensions.map((dimension) => {
          return (
            <article
              key={dimension.key}
              id={`risk-detail-${dimension.key}`}
              className="risk-card"
              tabIndex={-1}
            >
              <header className="risk-card-head">
                <div>
                  <h3 className="risk-card-title">
                    {t(dimension.label.zh, dimension.label.en)}
                    <span className="tag risk-status" data-status={dimension.status}>
                      {t(riskStatusText[dimension.status].zh, riskStatusText[dimension.status].en)}
                    </span>
                  </h3>
                  <p className="risk-card-plain">{t(dimension.plain.zh, dimension.plain.en)}</p>
                </div>
              </header>

              <p className="risk-card-summary">{t(dimension.summary.zh, dimension.summary.en)}</p>

              {dimension.key !== 'reputation' && (
                <div className="risk-metrics">
                  {dimension.metrics.map((metric, index) => (
                    <MetricRow key={index} metric={metric} onShowRefs={openRefs} />
                  ))}
                </div>
              )}

              {dimension.key === 'reputation' && (
                <ReputationPanel loading={repLoading} data={reputation} company={report.company} />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ReputationPanel({
  loading,
  data,
  company,
}: {
  loading: boolean;
  data: ReputationData | null;
  company: string;
}) {
  const { t, locale } = useApp();
  const shortDate = (value: string | null) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString(locale, { month: '2-digit', day: '2-digit' });
  };
  if (loading)
    return (
      <p className="risk-pending-note">{t('正在检索公开报道…', 'Searching public coverage…')}</p>
    );
  if (!data)
    return (
      <p className="risk-pending-note">
        {t('公开报道暂不可用，请稍后查看。', 'Public coverage is unavailable. Check again later.')}
      </p>
    );
  if (!data.count)
    return (
      <p className="risk-pending-note">
        {t(
          `本次检索未找到 ${company} 的近期公开报道。`,
          `This search found no recent public coverage for ${company}.`
        )}
      </p>
    );
  return (
    <div className="risk-reputation">
      <div className="risk-reputation-head">
        <span className="risk-reputation-count">
          {t('近期公开报道', 'Recent public coverage')} {data.count}
          {t('条', ' items')}
        </span>
        <span className="risk-reputation-note">
          {t('不自动判断好坏，点击查看原文', 'No auto sentiment; open the original articles')}
        </span>
      </div>
      <ul className="risk-reputation-list">
        {data.items.slice(0, 6).map((item, index) => (
          <li key={index}>
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              <span className="risk-reputation-title">{item.title}</span>
              <span className="risk-reputation-meta">
                {item.source && <em className="risk-reputation-source">{item.source}</em>}
                {shortDate(item.publishedAt)}
                <ExternalLink size={12} />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetricRow({
  metric,
  onShowRefs,
}: {
  metric: RiskMetric;
  onShowRefs: (refs: EvidenceRef[]) => void;
}) {
  const { t } = useApp();
  return (
    <div className="risk-metric-row">
      <span className="risk-metric-label">{t(metric.label.zh, metric.label.en)}</span>
      <span className="risk-metric-value">{metric.value}</span>
      {metric.refs.length > 0 && (
        <button
          type="button"
          className="icon-button risk-metric-source"
          aria-label={t(`查看${metric.label.zh}来源`, `View sources for ${metric.label.en}`)}
          onClick={() => onShowRefs(metric.refs)}
        >
          <FileText size={14} />
        </button>
      )}
      {metric.link && (
        <a
          className="risk-metric-link"
          href={metric.link.url}
          target="_blank"
          rel="noreferrer"
          aria-label={t(metric.link.label.zh, metric.link.label.en)}
        >
          {t(metric.link.label.zh, metric.link.label.en)} <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}
