import { useMemo } from 'react';
import { ExternalLink, FileText } from 'lucide-react';

import type { EvidenceRef, Report } from '../shared/contracts';
import { useApp } from './context';
import {
  deriveRiskPerspective,
  riskStatusText,
  type RiskMetric,
  type RiskStatus,
} from './riskDimensions';

const statusColor: Record<RiskStatus, string> = {
  good: '#34d399',
  warn: '#f59e0b',
  bad: '#ef4444',
  unknown: '#8a8f98',
};

/**
 * 第二部分：四维详细状况。
 * 财务 / 信用 / 口碑 / 风险四张卡，全部数据来自报告真实结果，
 * 每条指标可回溯到材料原文（来源抽屉）或外部披露链接。
 */
export function RiskDetail({ report }: { report: Report }) {
  const { t, locale, showEvidence } = useApp();
  const perspective = useMemo(() => deriveRiskPerspective(report, locale), [report, locale]);

  const openRefs = (refs: EvidenceRef[]) => {
    if (refs.length > 0) showEvidence(refs, report);
  };

  return (
    <section className="risk-detail" aria-label={t('第二部分 · 详细状况', 'Part 2 · Details')}>
      <div className="risk-detail-head">
        <span className="risk-overview-kicker">
          {t('第二部分 · 详细状况', 'Part 2 · Details')}
        </span>
        <span className="risk-detail-hint">
          {t('每条数据可点击回溯原文', 'Each figure links back to its source')}
        </span>
      </div>
      <div className="risk-detail-grid">
        {perspective.dimensions.map((dimension) => {
          const color = statusColor[dimension.status];
          return (
            <article
              key={dimension.key}
              id={`risk-detail-${dimension.key}`}
              className="risk-card"
              style={{ borderTopColor: color }}
            >
              <header className="risk-card-head">
                <div>
                  <div className="risk-card-title">
                    {t(dimension.label.zh, dimension.label.en)}
                    <span className="risk-card-chip" style={{ color, borderColor: `${color}55`, background: `${color}14` }}>
                      {t(riskStatusText[dimension.status].zh, riskStatusText[dimension.status].en)}
                    </span>
                  </div>
                  <p className="risk-card-plain">
                    {t(dimension.plain.zh, dimension.plain.en)}
                  </p>
                </div>
              </header>

              <p className="risk-card-summary">
                {t(dimension.summary.zh, dimension.summary.en)}
              </p>

              {dimension.key === 'finance' && <FinanceBars report={report} />}

              <div className="risk-metrics">
                {dimension.metrics.map((metric, index) => (
                  <MetricRow
                    key={index}
                    metric={metric}
                    onShowRefs={openRefs}
                  />
                ))}
              </div>

              {dimension.key === 'reputation' && (
                <p className="risk-pending-note">
                  {t(
                    '媒体报道与舆论数据源尚未接入。接入后可显示报道数量、情绪分布与来源链接。',
                    'News and sentiment sources are not connected yet. Once connected, this card will show coverage count, tone split, and source links.'
                  )}
                </p>
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
  const toneColor =
    metric.tone === 'plain' ? undefined : statusColor[metric.tone as RiskStatus];
  return (
    <div className="risk-metric-row">
      <span className="risk-metric-label">{t(metric.label.zh, metric.label.en)}</span>
      <span className="risk-metric-value" style={toneColor ? { color: toneColor } : undefined}>
        {metric.value}
      </span>
      {metric.refs.length > 0 && (
        <button
          type="button"
          className="icon-button risk-metric-source"
          aria-label="查看来源"
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

/** 财务维度图形：赚到的钱 vs 收到的现金（净利润为负时不画误导性对比条） */
function FinanceBars({ report }: { report: Report }) {
  const { t } = useApp();
  const net = report.metrics.find((item) => item.key === 'netProfit');
  const cash = report.metrics.find((item) => item.key === 'operatingCashFlow');
  if (net?.value == null || cash?.value == null) return null;
  const netNumber = Number(net.value);
  if (netNumber < 0) {
    return (
      <div className="risk-finance-loss" role="note">
        <span className="risk-finance-loss-mark" aria-hidden="true">▲</span>
        <span>
          {t(
            '公司在亏钱：净利润为负，现金利润比不适用；请以净利润金额为准。',
            'The company is losing money: net profit is negative, so the cash-to-profit ratio does not apply.'
          )}
        </span>
      </div>
    );
  }
  const cashNumber = Number(cash?.value ?? 0);
  const maximum = Math.max(Math.abs(netNumber), Math.abs(cashNumber), 1);
  const netHeight = Math.max((Math.abs(netNumber) / maximum) * 100, 4);
  const cashHeight = Math.max((Math.abs(cashNumber) / maximum) * 100, 4);
  return (
    <div className="risk-finance-bars" aria-hidden="true">
      <div className="risk-finance-bar-col">
        <span className="risk-finance-bar-value">{netHeight.toFixed(0)}%</span>
        <div className="risk-finance-bar">
          <i className="risk-finance-bar-fill risk-finance-bar-profit" style={{ height: `${netHeight}%` }} />
        </div>
        <span className="risk-finance-bar-label">
          {t('赚到的钱', 'Profit')}（{net.value}）
        </span>
      </div>
      <div className="risk-finance-bar-col">
        <span className="risk-finance-bar-value">{cashHeight.toFixed(0)}%</span>
        <div className="risk-finance-bar">
          <i className="risk-finance-bar-fill risk-finance-bar-cash" style={{ height: `${cashHeight}%` }} />
        </div>
        <span className="risk-finance-bar-label">
          {t('收到的现金', 'Cash')}（{cash.value}）
        </span>
      </div>
    </div>
  );
}
