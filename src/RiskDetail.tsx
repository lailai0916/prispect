import { useMemo } from 'react';
import { ArrowUpRight, ExternalLink, FileText } from 'lucide-react';

import type { EvidenceRef, Report } from '../shared/contracts';
import { useApp } from './context';
import { deriveRiskPerspective, riskStatusText, type RiskMetric } from './riskDimensions';

/** Source-linked checks share the report's document layout and theme. */
export function RiskDetail({ report }: { report: Report }) {
  const { t, locale, showEvidence, navigate } = useApp();
  const perspective = useMemo(() => deriveRiskPerspective(report, locale), [report, locale]);
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
                <button
                  type="button"
                  className="text-link"
                  onClick={() => navigate('/query?query=' + encodeURIComponent(report.company))}
                >
                  {t('进入企业研究', 'Open company research')}
                  <ArrowUpRight size={13} aria-hidden="true" />
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
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
