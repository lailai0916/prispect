import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';

import type { BridgeStep, EvidenceRef, Report } from '../shared/contracts';
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

/**
 * 第二部分：四维详细状况。
 * 财务 / 信用 / 口碑 / 风险四张卡，全部数据来自报告真实结果，
 * 每条指标可回溯到材料原文（来源抽屉）或外部披露链接。
 */
export function RiskDetail({ report }: { report: Report }) {
  const { t, locale, showEvidence } = useApp();
  const perspective = useMemo(() => deriveRiskPerspective(report, locale), [report, locale]);
  const gridRef = useRef<HTMLDivElement>(null);
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

  /* 滚动入场：详情卡进入视口时依次浮现 */
  useEffect(() => {
    const root = gridRef.current;
    if (!root) return;
    const reduceMotion =
      typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('.risk-card'));
    if (reduceMotion || typeof IntersectionObserver === 'undefined') {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = nodes.indexOf(entry.target as HTMLElement);
          window.setTimeout(() => entry.target.classList.add('is-visible'), index * 90);
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.15 }
    );
    nodes.forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, []);

  return (
    <section className="risk-detail" aria-label={t('第二部分 · 详细状况', 'Part 2 · Details')}>
      <div className="risk-detail-head">
        <span className="risk-overview-kicker">{t('第二部分 · 详细状况', 'Part 2 · Details')}</span>
        <span className="risk-detail-hint">
          {t('每条数据可点击回溯原文', 'Each figure links back to its source')}
        </span>
      </div>
      <div className="risk-detail-grid" ref={gridRef}>
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
                    <span
                      className="risk-card-chip"
                      style={{ color, borderColor: `${color}55`, background: `${color}14` }}
                    >
                      {t(riskStatusText[dimension.status].zh, riskStatusText[dimension.status].en)}
                    </span>
                  </div>
                  <p className="risk-card-plain">{t(dimension.plain.zh, dimension.plain.en)}</p>
                </div>
              </header>

              <p className="risk-card-summary">{t(dimension.summary.zh, dimension.summary.en)}</p>

              {dimension.key === 'finance' && <FinanceBars report={report} />}
              {dimension.key === 'finance' && report.bridge && (
                <MiniCashBridge
                  steps={report.bridge}
                  usd={report.metrics.find((metric) => metric.key === 'netProfit')?.unit === 'USD'}
                />
              )}

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
  if (!data || !data.count)
    return (
      <p className="risk-pending-note">
        {t(
          `暂未发现 ${company} 的近期公开报道；未编造舆论内容。`,
          `No recent public coverage found for ${company}; nothing is invented.`
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
  const toneColor = metric.tone === 'plain' ? undefined : statusColor[metric.tone as RiskStatus];
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
        <span className="risk-finance-loss-mark" aria-hidden="true">
          ▲
        </span>
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
  const usd = net.unit === 'USD';
  const maximum = Math.max(Math.abs(netNumber), Math.abs(cashNumber), 1);
  const netHeight = Math.max((Math.abs(netNumber) / maximum) * 100, 4);
  const cashHeight = Math.max((Math.abs(cashNumber) / maximum) * 100, 4);
  return (
    <div className="risk-finance-bars" aria-hidden="true">
      <div className="risk-finance-bar-col">
        <span className="risk-finance-bar-value">{netHeight.toFixed(0)}%</span>
        <div className="risk-finance-bar">
          <i
            className="risk-finance-bar-fill risk-finance-bar-profit"
            style={{ height: `${netHeight}%` }}
          />
        </div>
        <span className="risk-finance-bar-label">
          {t('赚到的钱', 'Profit')}（{usd ? '$' : ''}
          {net.value}）
        </span>
      </div>
      <div className="risk-finance-bar-col">
        <span className="risk-finance-bar-value">{cashHeight.toFixed(0)}%</span>
        <div className="risk-finance-bar">
          <i
            className="risk-finance-bar-fill risk-finance-bar-cash"
            style={{ height: `${cashHeight}%` }}
          />
        </div>
        <span className="risk-finance-bar-label">
          {t('收到的现金', 'Cash')}（{usd ? '$' : ''}
          {cash.value}）
        </span>
      </div>
    </div>
  );
}

/** 财务卡迷你现金桥：净利润 → 各项调整 → 经营现金，绿正红负 */
function MiniCashBridge({ steps, usd }: { steps: BridgeStep[]; usd?: boolean }) {
  let running = 0;
  const bars = steps.map((step) => {
    const value = Number(step.value) || 0;
    const start = step.kind === 'total' ? 0 : running;
    const end = step.kind === 'total' ? value : running + value;
    running = end;
    return { step, start, end, value };
  });
  const low = Math.min(0, ...bars.flatMap((bar) => [bar.start, bar.end]));
  const high = Math.max(0, ...bars.flatMap((bar) => [bar.start, bar.end]));
  const span = high - low || 1;
  const toPct = (value: number) => ((value - low) / span) * 100;
  return (
    <div className="risk-bridge-mini" aria-hidden="true">
      {bars.map((bar, index) => {
        const left = toPct(bar.start);
        const width = Math.max(toPct(bar.end) - left, 0.6);
        const positive = bar.value > 0;
        const negative = bar.value < 0;
        const color = negative ? '#ef4444' : positive ? '#34d399' : '#8a8f98';
        const isTotal = bar.step.kind === 'total';
        return (
          <div className="risk-bridge-row" key={index}>
            <span className="risk-bridge-label" title={bar.step.label}>
              {bar.step.label}
            </span>
            <span className="risk-bridge-track">
              <i
                className={`risk-bridge-bar${isTotal ? ' is-total' : ''}`}
                style={{ left: `${left}%`, width: `${width}%`, background: color }}
              />
            </span>
            <span className="risk-bridge-value" style={{ color }}>
              {usd ? '$' : ''}
              {bar.step.value}
            </span>{' '}
          </div>
        );
      })}
    </div>
  );
}
