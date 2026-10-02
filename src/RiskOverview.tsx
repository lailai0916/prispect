import { useEffect, useMemo, useState } from 'react';

import type { Report } from '../shared/contracts';
import { useApp } from './context';
import { deriveRiskPerspective, riskStatusText, type RiskStatus } from './riskDimensions';

const statusColor: Record<RiskStatus, string> = {
  good: '#34d399',
  warn: '#f59e0b',
  bad: '#ef4444',
  unknown: '#8a8f98',
};

/**
 * 第一部分：风险总览仪表。
 * 大圆环 + 中心结论（低风险 / 需要关注 / 发现风险信号 / 待补充），
 * 下方四个维度胶囊显示状态灯与大白话说明。
 */
export function RiskOverview({
  report,
  onSelectDimension,
}: {
  report: Report;
  onSelectDimension?: (key: string) => void;
}) {
  const { t, locale } = useApp();
  const perspective = useMemo(() => deriveRiskPerspective(report, locale), [report, locale]);
  const [entered, setEntered] = useState(false);
  const [activeDim, setActiveDim] = useState<string | null>(null);
  const reduceMotion =
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    if (reduceMotion) {
      setEntered(true);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [reduceMotion]);

  const overall = perspective.overall;
  const color = statusColor[overall.status];
  const ringLength = 2 * Math.PI * 96;
  const arc = ringLength / 4;
  const dash = arc - 5;

  const scrollTo = (key: string) => {
    if (onSelectDimension) {
      onSelectDimension(key);
      return;
    }
    const node = document.getElementById(`risk-detail-${key}`);
    node?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  return (
    <section className="risk-overview" aria-label={t('风险总览', 'Risk overview')}>
      <div className="risk-overview-head">
        <span className="risk-overview-kicker">
          {t('第一部分 · 风险总览', 'Part 1 · Risk overview')}
        </span>
        <span className="risk-overview-scope">{t(overall.scope.zh, overall.scope.en)}</span>
      </div>
      <div className="risk-overview-body">
        <div className="risk-ring-wrap">
          <svg
            viewBox="0 0 220 220"
            className="risk-ring"
            role="img"
            aria-label={t(overall.title.zh, overall.title.en)}
          >
            <circle className="risk-ring-track" cx="110" cy="110" r="96" />
            {perspective.dimensions.map((dimension, index) => {
              const dimColor = statusColor[dimension.status];
              const active = activeDim === dimension.key;
              return (
                <circle
                  key={dimension.key}
                  className="risk-ring-seg"
                  cx="110"
                  cy="110"
                  r="96"
                  style={{
                    stroke: dimColor,
                    strokeDasharray: `${dash} ${ringLength}`,
                    strokeDashoffset: entered ? 0 : dash,
                    transform: `rotate(${index * 90 - 90} 110 110)`,
                    opacity: entered ? (active ? 1 : 0.92) : 0,
                    transition: reduceMotion
                      ? 'none'
                      : `stroke-dashoffset 700ms ${300 + index * 140}ms ease, opacity 260ms ${index * 120}ms ease`,
                    filter: active ? 'brightness(1.25)' : 'brightness(0.85)',
                  }}
                />
              );
            })}
          </svg>
          <div
            className="risk-ring-center"
            style={{
              opacity: entered ? 1 : 0,
              transform: entered ? 'none' : 'translateY(5px)',
              transition: reduceMotion
                ? 'none'
                : 'opacity 500ms 900ms ease, transform 500ms 900ms ease',
            }}
          >
            <strong style={{ color }}>{t(overall.title.zh, overall.title.en)}</strong>
            <span>{t(overall.subtitle.zh, overall.subtitle.en)}</span>
          </div>
        </div>

        <div className="risk-dims">
          {perspective.dimensions.map((dimension, index) => {
            const dimColor = statusColor[dimension.status];
            const active = activeDim === dimension.key;
            return (
              <button
                key={dimension.key}
                type="button"
                className={`risk-dim-pill${active ? ' is-active' : ''}`}
                style={{
                  transitionDelay: reduceMotion ? '0ms' : `${200 + index * 90}ms`,
                  opacity: entered ? 1 : 0,
                  transform: entered ? 'none' : 'translateY(6px)',
                }}
                onClick={() => scrollTo(dimension.key)}
                onMouseEnter={() => setActiveDim(dimension.key)}
                onMouseLeave={() => setActiveDim(null)}
                aria-label={`${t(dimension.label.zh, dimension.label.en)} · ${t(dimension.plain.zh, dimension.plain.en)}`}
              >
                <span
                  className="risk-dim-dot"
                  style={{ background: dimColor, boxShadow: `0 0 8px ${dimColor}66` }}
                />
                <span className="risk-dim-name">{t(dimension.label.zh, dimension.label.en)}</span>
                <span className="risk-dim-plain">{t(dimension.plain.zh, dimension.plain.en)}</span>
                <span className="risk-dim-status" style={{ color: dimColor }}>
                  {t(riskStatusText[dimension.status].zh, riskStatusText[dimension.status].en)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="risk-overview-note">
        {t(
          '结论由已核验的证据状态推导，不构成公司评级、授信决策或投资建议。',
          'The verdict is derived from verified evidence status; it is not a company rating, credit decision, or investment advice.'
        )}
      </p>
    </section>
  );
}
