import { useId, useMemo } from 'react';
import { ArrowUpRight } from 'lucide-react';

import type { Report } from '../shared/contracts';
import { useApp } from './context';
import { deriveRiskPerspective, riskStatusText } from './riskDimensions';

/** A compact, theme-aware index into the report's evidence checks. */
export function RiskOverview({
  report,
  onSelectDimension,
}: {
  report: Report;
  onSelectDimension?: (key: string) => void;
}) {
  const { t, locale } = useApp();
  const headingId = useId();
  const { overall, dimensions } = useMemo(
    () => deriveRiskPerspective(report, locale),
    [report, locale]
  );

  const scrollTo = (key: string) => {
    if (onSelectDimension) {
      onSelectDimension(key);
      return;
    }
    const node = document.getElementById(`risk-detail-${key}`);
    node?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
    if (node) {
      node.tabIndex = -1;
      node.focus({ preventScroll: true });
    }
  };

  return (
    <section className="risk-overview" aria-labelledby={headingId}>
      <div className="risk-overview-head">
        <h2 id={headingId}>{t('核查状态', 'Review status')}</h2>
        <span className="risk-overview-scope">{t(overall.scope.zh, overall.scope.en)}</span>
      </div>
      <div className="risk-overview-conclusion">
        <span className="risk-status-dot" data-status={overall.status} aria-hidden="true" />
        <h3>{t(overall.title.zh, overall.title.en)}</h3>
      </div>
      <p className="risk-overview-description">{t(overall.subtitle.zh, overall.subtitle.en)}</p>
      <nav className="risk-dims" aria-label={t('定位分项核查', 'Go to a review dimension')}>
        {dimensions.map((dimension) => (
          <button
            key={dimension.key}
            type="button"
            className="risk-dimension-link"
            onClick={() => scrollTo(dimension.key)}
            aria-controls={`risk-detail-${dimension.key}`}
          >
            <span className="risk-dim-name">{t(dimension.label.zh, dimension.label.en)}</span>
            <span className="tag risk-status" data-status={dimension.status}>
              {t(riskStatusText[dimension.status].zh, riskStatusText[dimension.status].en)}
            </span>
            <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        ))}
      </nav>
      <p className="risk-overview-note">
        {t(
          '状态说明本报告的材料与计算核对情况，不构成公司评级、授信决策或投资建议。',
          'Statuses describe the evidence and calculation checks in this report, not a company rating, credit decision or investment advice.'
        )}
      </p>
    </section>
  );
}
