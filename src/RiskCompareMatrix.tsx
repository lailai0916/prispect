import { useMemo } from 'react';

import type { AnalysisTask } from '../shared/contracts';
import { useApp } from './context';
import { deriveRiskPerspective, riskStatusText, type RiskStatus } from './riskDimensions';
import './risk-perspective.css';

const statusColor: Record<RiskStatus, string> = {
  good: 'var(--status-good)',
  warn: 'var(--status-warn)',
  bad: 'var(--status-bad)',
  unknown: 'var(--status-unknown)',
};

/** 公司状态对比：行对应公司，列对应有依据的核查维度。 */
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
    <section
      className="risk-matrix"
      aria-label={t('公司核查状态对比', 'Company review status comparison')}
    >
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
        {rows.map(({ task, perspective }) => (
          <button
            key={task.id}
            type="button"
            className="risk-matrix-row risk-matrix-data-row"
            onClick={() => navigate(`/tasks/${task.id}`)}
            aria-label={`${task.company} · ${task.year} · ${perspective.dimensions
              .map((dimension) =>
                t(
                  `${dimension.label.zh}：${riskStatusText[dimension.status].zh}`,
                  `${dimension.label.en}: ${riskStatusText[dimension.status].en}`
                )
              )
              .join('；')}`}
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
                  <i className="risk-matrix-cell" style={{ background: color }} />
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
          '状态说明材料与计算的核对进度，不构成公司评级；点击公司查看完整报告与来源。',
          'Statuses describe evidence and calculation checks, not company ratings. Open a company to inspect its full review and sources.'
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
          transform={`rotate(${index * 90 - 90} 11 11)`}
          style={{
            stroke: statusColor[dimension.status],
            strokeDasharray: `${dash} ${ringLength}`,
          }}
        />
      ))}
    </svg>
  );
}
