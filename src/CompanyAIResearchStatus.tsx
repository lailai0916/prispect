import { Check, LoaderCircle, Minus } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import { deriveCompanyResearchProgress } from '../shared/company-research-view';
import { companyResearchAvailability } from '../shared/company-research-availability';
import { companyPath } from '../shared/company-workspace';
import { useApp } from './context';

export function CompanyAIResearchStatus({
  run,
  reportHref = `${companyPath(run.id)}&report=ai`,
  onStart,
  onRetrySources,
  onCancel,
  starting = false,
  cancelling = false,
  disabled = false,
  reportView = false,
  compact = false,
}: {
  run: CompanyResearchRun;
  reportHref?: string;
  onStart?: () => void;
  onRetrySources?: () => void;
  onCancel?: () => void;
  starting?: boolean;
  cancelling?: boolean;
  disabled?: boolean;
  reportView?: boolean;
  compact?: boolean;
}) {
  const { t } = useApp();
  const progress = deriveCompanyResearchProgress(run);
  const available = companyResearchAvailability(run);
  const blocked = progress.snapshot === 'mismatch' || Boolean(run.informationGap);
  const busy = starting || cancelling || available.active;
  const hasReport = Boolean(run.assessment) && !blocked;
  const steps =
    run.contextStatus === 'loading'
      ? []
      : run.assessmentStatus === 'loading' || run.assessmentStatus === 'failed'
        ? run.assessmentTrace || []
        : run.assessmentTrace || run.assessment?.research?.steps || [];
  const currentStep = [...steps].reverse().find((step) => step.status === 'running');
  const activeStage = progress.stages.find((stage) => stage.id === progress.activeStage);
  const label = blocked
    ? t(...progress.label)
    : run.contextStatus === 'loading' && run.assessmentStatus !== 'loading'
      ? t('正在获取基础资料', 'Gathering base data')
      : starting && !available.active
        ? t('正在启动研究', 'Starting research')
        : progress.state === 'running'
          ? t('AI 研究进行中', 'AI research in progress')
          : progress.mode === 'rules'
            ? t(
                'AI 分析未完成，已保留规则结果',
                'AI analysis is incomplete; rule results are retained'
              )
            : progress.state === 'completed'
              ? t('AI 研究已完成', 'AI research complete')
              : progress.state === 'partial'
                ? t('AI 研究部分完成', 'AI research partially complete')
                : progress.state === 'failed'
                  ? t('AI 研究未完成', 'AI research did not complete')
                  : t('AI 研究尚未开始', 'AI research has not started');
  const action =
    currentStep?.tool === 'queue'
      ? t('正在排队', 'Queued for research')
      : currentStep?.label || (activeStage ? t(...activeStage.summary) : '');
  const stageLabels = {
    'not-started': ['待执行', 'Pending'],
    running: ['进行中', 'Running'],
    completed: ['已完成', 'Completed'],
    partial: ['部分完成', 'Partial'],
    failed: ['未完成', 'Incomplete'],
  } as const;
  const canStart = !blocked && Boolean(run.context) && !busy && run.contextStatus !== 'failed';
  const needsAI = !hasReport || progress.mode === 'rules' || run.assessmentStatus === 'failed';
  const reportLabel = progress.previousReportAvailable
    ? t('查看上一份报告', 'View previous report')
    : progress.mode === 'rules'
      ? t('查看规则结果', 'View rule results')
      : t('查看 AI 报告', 'View AI report');
  const stages = (
    <ol className="company-ai-stages" aria-label={t('AI研究阶段', 'AI research stages')}>
      {progress.stages.map((stage) => (
        <li
          key={stage.id}
          data-stage={stage.id}
          data-status={stage.status}
          aria-current={stage.status === 'running' ? 'step' : undefined}
          title={t(...stage.summary)}
        >
          <span className="company-ai-stage-bar" aria-hidden="true" />
          <span className="company-ai-stage-label">
            {stage.status === 'running' ? (
              <LoaderCircle size={11} className="spinner" aria-hidden="true" />
            ) : stage.status === 'completed' ? (
              <Check size={11} aria-hidden="true" />
            ) : (
              <Minus size={11} aria-hidden="true" />
            )}
            <span>{t(...stage.label)}</span>
            <small>{t(stageLabels[stage.status][0], stageLabels[stage.status][1])}</small>
          </span>
        </li>
      ))}
    </ol>
  );
  return (
    <section
      id="company-ai-research"
      className={
        'company-ai-research-status' + (compact ? ' company-ai-research-status-compact' : '')
      }
      aria-label={t('AI 研究进度', 'AI research progress')}
      data-testid="company-ai-research-status"
      data-state={progress.state}
      data-mode={progress.mode}
    >
      <div className="company-ai-status-line">
        <div className="company-ai-current" aria-live="polite">
          {busy && <LoaderCircle size={13} className="spinner" aria-hidden="true" />}
          <strong>{label}</strong>
          {action && (
            <span className="company-ai-current-action" title={action}>
              {action}
            </span>
          )}
        </div>
        <div className="company-ai-status-actions">
          {hasReport && !reportView && (
            <a className="text-link" href={reportHref}>
              {reportLabel}
            </a>
          )}
          {available.canCancel && onCancel && (
            <button
              type="button"
              className="text-link"
              disabled={disabled || cancelling}
              onClick={onCancel}
            >
              {cancelling ? t('正在取消…', 'Cancelling…') : t('取消本轮研究', 'Cancel research')}
            </button>
          )}
          {!blocked && !busy && run.contextStatus === 'failed' && onRetrySources && (
            <button
              type="button"
              className="text-link"
              disabled={disabled}
              onClick={onRetrySources}
            >
              {t('重试资料读取', 'Retry source retrieval')}
            </button>
          )}
          {!blocked &&
            needsAI &&
            !available.active &&
            onStart &&
            run.contextStatus !== 'failed' && (
              <button
                type="button"
                className="text-link"
                disabled={disabled || !canStart}
                onClick={onStart}
              >
                {starting
                  ? t('正在启动…', 'Starting…')
                  : run.assessmentStatus === 'failed' || progress.mode === 'rules'
                    ? t('重试 AI 分析', 'Retry AI analysis')
                    : t('开始 AI 研究', 'Start AI research')}
              </button>
            )}
        </div>
      </div>
      {compact && !busy ? (
        <details className="company-ai-stage-details">
          <summary>{t('研究过程', 'Research stages')}</summary>
          {stages}
        </details>
      ) : (
        stages
      )}
      {run.assessmentStatus === 'failed' && run.assessmentError && !blocked && (
        <p className="company-ai-status-error" role="alert">
          {run.assessmentError}
        </p>
      )}
    </section>
  );
}
