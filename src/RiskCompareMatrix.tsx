import { useMemo } from 'react';

import type { AnalysisTask } from '../shared/contracts';
import { useApp } from './context';
import { deriveRiskPerspective, riskStatusText, type RiskStatus } from './riskDimensions';

const statusColor: Record<RiskStatus, string> = {
  good: '#34d399',
  warn: '#f59e0b',
  bad: '#ef4444',
  unknown: '#8a8f98',
};

/** 易懂版 · 多公司风险对比矩阵：行=公司，列=四维，色块一眼看出状态 */
export function RiskCompareMatrix({ tasks }: { tasks: AnalysisTask[] }) {
  const { t, locale, navigate } = useApp();
  const rows = useMemo(
    () =>
      tasks
        .filter((task) => task.report)
        .map((task) => ({
          task,
          perspective: deriveRiskPerspective(task.report!, locale),
        })),
    [tasks, locale]
  );
  if (rows.length === 0) return null;

  return (
    <section className="risk-matrix" aria-label={t('多公司风险对比', 'Company risk matrix')}>
      <div className="risk-matrix-head">
        <div className="risk-matrix-row risk-matrix-title-row" aria-hidden="true">
          <span className="risk-matrix-company-col">{t('公司', 'Company')}</span>
          {rows[0].perspective.dimensions.map((dimension) => (
            <span key={dimension.key} className="risk-matrix-dim-col">
              {t(dimension.label.zh, dimension.label.en)}
              <small>{t(dimension.plain.zh, dimension.plain.en)}</small>
            </span>
          ))}
        </div>
      </div>
      <div className="risk-matrix-body">
        {rows.map(({ task, perspective }, rowIndex) => (
          <button
            key={task.id}
            type="button"
            className="risk-matrix-row risk-matrix-data-row"
            style={{ animationDelay: `${rowIndex * 90}ms` }}
            onClick={() => navigate(`/tasks/${task.id}`)}
            aria-label={`${task.company} · ${task.year}`}
          >
            <span className="risk-matrix-company-col">
              <MiniRing dimensions={perspective.dimensions} />
              <span className="risk-matrix-company-text">
                <strong>{task.company}</strong>
                <small>{task.year}</small>
              </span>
            </span>
            {perspective.dimensions.map((dimension) => {
              const color = statusColor[dimension.status];
              return (
                <span className="risk-matrix-dim-col" key={dimension.key}>
                  <i
                    className="risk-matrix-cell"
                    style={{ background: color, boxShadow: `0 0 6px ${color}55` }}
                  />
                  <em style={{ color }}>
                    {t(riskStatusText[dimension.status].zh, riskStatusText[dimension.status].en)}
                  </em>
                </span>
              );
            })}
          </button>
        ))}
      </div>
      <p className="risk-overview-note">
        {t(
          '状态由已核验的证据推导，不构成评级或投资建议；点击公司查看完整报告与来源。',
          'Status is derived from verified evidence; it is not a rating or investment advice. Click a company to open its full review.'
        )}
      </p>
    </section>
  );
}

/** 迷你四维分段环：每段弧用维度状态色 */
function MiniRing({ dimensions }: { dimensions: { key: string; status: RiskStatus }[] }) {
  const ringLength = 2 * Math.PI * 8;
  const dash = ringLength / 4 - 1.2;
  return (
    <svg viewBox="0 0 22 22" className="risk-matrix-ring" aria-hidden="true" width="22" height="22">
      <circle cx="11" cy="11" r="8" className="risk-matrix-ring-track" />
      {dimensions.map((dimension, index) => (
        <circle
          key={dimension.key}
          cx="11"
          cy="11"
          r="8"
          className="risk-matrix-ring-seg"
          style={{
            stroke: statusColor[dimension.status],
            strokeDasharray: `${dash} ${ringLength}`,
            transform: `rotate(${index * 90 - 90} 11 11)`,
          }}
        />
      ))}
    </svg>
  );
}
