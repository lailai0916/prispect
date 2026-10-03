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

const dimensionShort: Record<string, { zh: string; en: string }> = {
  finance: { zh: '财务', en: 'Fin' },
  credit: { zh: '来源', en: 'Sources' },
  reputation: { zh: '口碑', en: 'Rep' },
  risk: { zh: '核查', en: 'Checks' },
};

/** 首页已核查公司的状态摘要。 */
export function HomeRiskCards({ tasks }: { tasks: AnalysisTask[] }) {
  const { t, locale, navigate } = useApp();
  const rows = useMemo(
    () =>
      tasks
        .filter((task) => task.report)
        .map((task) => ({
          task,
          perspective: deriveRiskPerspective(task.report!, locale),
        }))
        .sort((a, b) => b.task.updatedAt.localeCompare(a.task.updatedAt))
        .slice(0, 6),
    [tasks, locale]
  );
  if (rows.length === 0) return null;

  return (
    <section className="home-risk-cards" aria-label={t('已核查公司', 'Reviewed companies')}>
      <div className="home-risk-cards-head">
        <h2>{t('已核查的公司', 'Companies you checked')}</h2>
        <span className="home-risk-cards-hint">
          {t('点击卡片查看完整报告', 'Open a card to see the full review')}
        </span>
      </div>
      <div className="home-risk-grid">
        {rows.map(({ task, perspective }) => {
          const overall = perspective.overall;
          const color = statusColor[overall.status];
          return (
            <button
              key={task.id}
              type="button"
              className="home-risk-card"
              onClick={() => navigate(`/tasks/${task.id}`)}
              aria-label={`${task.company} · ${task.year} · ${t(overall.title.zh, overall.title.en)}`}
            >
              <div className="home-risk-card-top">
                <MiniRing dimensions={perspective.dimensions} />
                <div className="home-risk-card-title">
                  <strong>{task.company}</strong>
                  <small>{task.year}</small>
                </div>
              </div>
              <p className="home-risk-card-verdict" style={{ color }}>
                {t(overall.title.zh, overall.title.en)}
              </p>
              <p className="home-risk-card-sub">{t(overall.subtitle.zh, overall.subtitle.en)}</p>
              <div className="home-risk-card-dims">
                {perspective.dimensions.map((dimension) => {
                  const dimColor = statusColor[dimension.status];
                  const short = dimensionShort[dimension.key] ?? {
                    zh: dimension.key,
                    en: dimension.key,
                  };
                  return (
                    <span
                      key={dimension.key}
                      className="home-risk-card-dim"
                      title={`${t(dimension.label.zh, dimension.label.en)} · ${t(riskStatusText[dimension.status].zh, riskStatusText[dimension.status].en)}`}
                    >
                      <i style={{ background: dimColor }} />
                      {t(short.zh, short.en)}
                    </span>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** 迷你四维分段环 */
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
