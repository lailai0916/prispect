import { productTerms } from '../shared/product-terms';
import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  ChartNoAxesCombined,
  ChevronDown,
  Coins,
  FileSearch,
  FlaskConical,
  ListChecks,
  LoaderCircle,
  Minus,
  NotebookText,
  Percent,
  ScanLine,
  Wallet,
} from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import type { AssessmentJudgment, AssessmentText } from '../shared/company-assessment';
import {
  deriveCompanyResearchBrief,
  deriveCompanyResearchProgress,
  type CompanyResearchViewState,
} from '../shared/company-research-view';
import { companyReviewSummary } from '../shared/company-review';
import { companyResearchAvailability } from '../shared/company-research-availability';
import { companyPendingReview } from '../shared/company-pending-review';
import { companyPath } from '../shared/company-workspace';
import { CompanyAssessmentEvidence } from './CompanyAssessment';
import { CompanyContextEvidence } from './CompanyContextViews';
import { CompanyReview } from './CompanyReview';
import { useApp } from './context';
import { date, money } from './format';
import { ResearchPlan } from './ResearchPlan';
import { SourceTrust } from './SourceTrust';
import { ReportEvidenceControls } from './ReportEvidenceControls';
import './research-report.css';

const stateLabels: Record<CompanyResearchViewState, AssessmentText> = {
  'not-started': ['尚无记录', 'Not recorded'],
  running: ['进行中', 'Running'],
  completed: ['已完成', 'Completed'],
  partial: ['部分完成', 'Partial'],
  failed: ['未完成', 'Incomplete'],
};
const gradeLabels: Record<string, AssessmentText> = {
  A: ['较强', 'Strong'],
  B: ['中等', 'Balanced'],
  C: ['承压', 'Under pressure'],
  D: ['显著承压', 'High pressure'],
  NR: ['暂不评级', 'Not rated'],
};

/** Expand the containing content before moving focus; direct links never land in hidden content. */
export function openCompanyReportSection(
  id: string,
  focusInput = false,
  focusSelector?: string,
  options?: { scroll?: boolean }
) {
  const target = document.getElementById(id);
  if (!target) return;
  let containing: HTMLElement | null = target;
  while (containing) {
    if (containing instanceof HTMLDetailsElement) containing.open = true;
    containing = containing.parentElement;
  }
  if (options?.scroll === false) return;
  requestAnimationFrame(() => {
    const focus = focusSelector
      ? target.querySelector<HTMLElement>(focusSelector)
      : focusInput
        ? target.querySelector<HTMLTextAreaElement>('textarea')
        : target instanceof HTMLDetailsElement
          ? target.querySelector<HTMLElement>('summary')
          : null;
    if (focusSelector && focus) {
      const toolbar = focus.closest('.evidence-lab')?.querySelector('.lab-trial-toolbar');
      const toolbarHeight =
        toolbar && getComputedStyle(toolbar).position === 'sticky'
          ? toolbar.getBoundingClientRect().height
          : 0;
      focus.style.setProperty('--research-focus-toolbar-height', `${toolbarHeight}px`);
    }
    const alignedTarget = focusSelector && focus ? focus : target;
    alignedTarget.style.scrollMarginTop =
      'calc(var(--site-header-height) + var(--company-reading-index-height, 0px) + var(--research-focus-toolbar-height, 0px) + 16px)';
    alignedTarget.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
    focus?.focus({ preventScroll: true });
  });
}

function CompanyResearchProgress({
  run,
  children,
  onRetrySources,
  onRetryAnalysis,
  onCancel,
  cancelling,
}: {
  run: CompanyResearchRun;
  children?: ReactNode;
  onRetrySources?: () => void;
  onRetryAnalysis?: () => void;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const { t, locale } = useApp();
  const progress = deriveCompanyResearchProgress(run);
  const available = companyResearchAvailability(run);
  const steps =
    run.contextStatus === 'loading'
      ? []
      : run.assessmentStatus === 'loading' || run.assessmentStatus === 'failed'
        ? run.assessmentTrace || []
        : run.assessmentTrace || run.assessment?.research?.steps || [];
  return (
    <div className="research-process">
      <ol className="research-process-overview" aria-label={t('研究阶段', 'Research stages')}>
        {progress.stages.map((stage) => (
          <li key={stage.id} className={'research-process-stage research-stage-' + stage.status}>
            <span className="research-stage-mark" aria-hidden="true">
              {stage.status === 'running' ? (
                <LoaderCircle size={16} className="spinner" />
              ) : stage.status === 'completed' ? (
                <Check size={16} />
              ) : (
                <Minus size={16} />
              )}
            </span>
            <span>
              <strong>{t(...stage.label)}</strong>
              <small>{t(...stateLabels[stage.status])}</small>
            </span>
          </li>
        ))}
      </ol>
      {(available.active || available.failed) && (
        <div className="research-availability" data-testid="research-availability">
          <div className="research-availability-meta">
            {available.sourceFetchedAt && available.hasSources && (
              <span>
                {t('已取得资料', 'Retrieved sources')} · {date(available.sourceFetchedAt, locale)}
              </span>
            )}
            {available.reportSnapshotAt && progress.snapshot === 'previous' && (
              <span>
                {t('报告对应资料', 'Report snapshot')} · {date(available.reportSnapshotAt, locale)}
              </span>
            )}
            {available.lastActivityAt && (
              <span>
                {t('最近研究记录', 'Latest research event')} ·{' '}
                {date(available.lastActivityAt, locale)}
              </span>
            )}
          </div>
          <nav
            className="research-availability-actions"
            aria-label={t('继续研究', 'Continue research')}
          >
            {available.hasFinancials && (
              <a className="text-link" href={companyPath(run.id, 'financial')}>
                {t('查看财务资料', 'View financial data')}
              </a>
            )}
            {available.hasSources && (
              <a className="text-link" href={companyPath(run.id, 'sources')}>
                {t('查看已取得资料', 'View retrieved sources')}
              </a>
            )}
            {!available.active && run.contextStatus === 'failed' && onRetrySources && (
              <button className="text-link" type="button" onClick={onRetrySources}>
                {t('重试资料读取', 'Retry source retrieval')}
              </button>
            )}
            {!available.active &&
              run.assessmentStatus === 'failed' &&
              run.contextStatus !== 'failed' &&
              onRetryAnalysis && (
                <button className="text-link" type="button" onClick={onRetryAnalysis}>
                  {t('重新研究', 'Retry research')}
                </button>
              )}
            {available.canCancel && onCancel && (
              <button className="text-link" type="button" disabled={cancelling} onClick={onCancel}>
                {cancelling
                  ? t('正在取消…', 'Cancelling…')
                  : t('取消本轮研究', 'Cancel this research')}
              </button>
            )}
          </nav>
        </div>
      )}
      <details className="research-progress" id="company-research-process">
        <summary>
          <span className="research-progress-label" aria-live="polite" aria-atomic="true">
            {progress.state === 'running' ? (
              <LoaderCircle size={14} className="spinner" aria-hidden="true" />
            ) : progress.state === 'completed' ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <FileSearch size={14} aria-hidden="true" />
            )}
            <span>{t(...progress.label)}</span>
          </span>
          <span className="research-progress-count">
            {progress.counts.completedSteps > 0
              ? t(
                  `${progress.counts.completedSteps} 项步骤已完成`,
                  `${progress.counts.completedSteps} steps completed`
                )
              : t('查看研究过程', 'View research process')}
          </span>
          <ChevronDown size={13} aria-hidden="true" />
        </summary>
        <div className="research-progress-body">
          <p className="research-progress-goal">{t(...progress.goal)}</p>
          {children}
          <ol className="research-progress-stages">
            {progress.stages.map((stage) => (
              <li key={stage.id} className={'research-stage research-stage-' + stage.status}>
                <div>
                  <span className="research-stage-mark" aria-hidden="true">
                    {stage.status === 'running' ? (
                      <LoaderCircle size={16} className="spinner" />
                    ) : stage.status === 'completed' ? (
                      <Check size={16} />
                    ) : (
                      <Minus size={16} />
                    )}
                  </span>
                  <strong>{t(...stage.label)}</strong>
                  <span>{t(...stateLabels[stage.status])}</span>
                </div>
                <p>{t(...stage.summary)}</p>
              </li>
            ))}
          </ol>
          {steps.length > 0 && (
            <ol className="research-progress-log">
              {steps.map((step) => (
                <li key={step.id}>
                  <span className={'research-log-status research-log-status-' + step.status}>
                    {step.status === 'running'
                      ? t('执行中', 'Running')
                      : step.status === 'completed'
                        ? t('完成', 'Completed')
                        : t('未完成', 'Incomplete')}
                  </span>
                  <div>
                    <strong>{step.label}</strong>
                    {step.summary && <p>{step.summary}</p>}
                  </div>
                  {step.startedAt && (
                    <time dateTime={step.startedAt}>{date(step.startedAt, locale)}</time>
                  )}
                </li>
              ))}
            </ol>
          )}
          {(progress.counts.modelCalls !== null || progress.counts.toolCalls !== null) && (
            <p className="research-progress-counts">
              {progress.counts.modelCalls !== null && (
                <span>
                  {t(
                    `分析调用 ${progress.counts.modelCalls} 次`,
                    `Analysis calls ${progress.counts.modelCalls}`
                  )}
                </span>
              )}
              {progress.counts.toolCalls !== null && (
                <span>
                  {t(
                    `工具执行 ${progress.counts.toolCalls} 次`,
                    `Tool executions ${progress.counts.toolCalls}`
                  )}
                </span>
              )}
            </p>
          )}
        </div>
      </details>
    </div>
  );
}

export function CompanyResearchReport({
  run,
  onRefresh,
  refreshing,
  onRetrySources,
  onCancel,
  cancelling,
}: {
  run: CompanyResearchRun;
  onRefresh: (focus?: string) => void;
  refreshing: boolean;
  onRetrySources?: () => void;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const { t, locale } = useApp();
  const reportId = useId();
  const brief = deriveCompanyResearchBrief(run);
  const progress = deriveCompanyResearchProgress(run);
  const amounts = companyReviewSummary(run);
  const pendingReview = companyPendingReview(run);
  const [selected, setSelected] = useState<{ title: string; judgment: AssessmentJudgment } | null>(
    null
  );
  const assessment =
    progress.snapshot === 'mismatch' || run.informationGap ? undefined : run.assessment;
  const provisionalRating = assessment?.grade === 'NR' ? brief.provisionalRating : undefined;
  const reportGrade = provisionalRating?.grade || assessment?.grade || 'NR';
  useEffect(
    () => setSelected(null),
    [
      run.id,
      run.input.securityCode,
      run.input.orgId,
      run.input.year,
      run.assessment?.generatedAt,
      run.assessment?.snapshotFetchedAt,
    ]
  );
  const loading = refreshing || progress.state === 'running';
  const gradePending =
    !assessment && loading && !run.informationGap && progress.snapshot !== 'mismatch';
  const judgmentText = (judgment: AssessmentJudgment) =>
    judgment.text[locale === 'en' ? 'en' : 'zh'];
  const basis = (title: string, judgment: AssessmentJudgment, label?: string) =>
    assessment && (judgment.metricIds.length > 0 || judgment.evidenceIds.length > 0) ? (
      <button
        type="button"
        className="text-link research-basis"
        onClick={() => setSelected({ title, judgment })}
        aria-label={t('查看依据：', 'Evidence for: ') + title}
      >
        <FileSearch size={13} />
        {label || t('依据', 'Evidence')}
      </button>
    ) : null;
  const gradeTitle = assessment
    ? (provisionalRating
        ? t('依据已覆盖财务维度暂定。', 'Provisional grade based on covered financial dimensions.')
        : t('所选年度合并财务筛选。', 'Selected-year consolidated financial screening.')) +
      (assessment.ratingConstraints?.map((item) => t(...item)).join(' ') || '')
    : '';
  const ratio = amounts.ratio === null ? '—' : `${(amounts.ratio * 100).toFixed(2)}%`;
  const coverage = brief.coverage;
  return (
    <article
      id={reportId}
      className="company-research-report"
      data-testid="company-research-report"
      data-report-evidence-scope
    >
      <section className="research-summary" aria-labelledby="research-summary-heading">
        <div className="research-summary-card">
          <div
            className={
              'research-summary-lead' +
              (assessment || gradePending ? ' research-summary-rated' : '')
            }
          >
            <div className="research-summary-copy">
              <div className="research-summary-meta">
                <p className="research-summary-label">
                  <NotebookText size={17} aria-hidden="true" />
                  {t('分析摘要', 'Analysis summary')}
                </p>
                <div className="research-summary-scope">
                  <span>{t(...brief.scope)}</span>
                  <span>
                    {brief.mode === 'model'
                      ? t('资料分析', 'Source analysis')
                      : brief.mode === 'rules'
                        ? t('规则分析', 'Rule-based analysis')
                        : t('判断待形成', 'Analysis pending')}
                  </span>
                  {basis(t('分析摘要', 'Analysis summary'), brief.summary)}
                  {pendingReview.count !== null && pendingReview.count > 0 && (
                    <button
                      type="button"
                      className="text-link research-pending-link"
                      aria-controls="company-next-checks"
                      onClick={() => openCompanyReportSection('company-next-checks')}
                    >
                      <ListChecks size={13} aria-hidden="true" />
                      {t(
                        `待核对 ${pendingReview.count} 项`,
                        `${pendingReview.count} follow-up checks`
                      )}
                    </button>
                  )}
                </div>
              </div>
              <h2 id="research-summary-heading" className="research-summary-headline">
                {judgmentText(brief.headline)}
              </h2>
              <p className="research-summary-judgment">{judgmentText(brief.summary)}</p>

              <div className="research-summary-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => openCompanyReportSection('company-full-report')}
                >
                  <FileSearch size={14} aria-hidden="true" />
                  {t('依据与计算', 'Evidence and calculations')}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => openCompanyReportSection('company-evidence-lab')}
                >
                  <FlaskConical size={14} aria-hidden="true" />
                  {t('检验解释', 'Test an explanation')}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() =>
                    openCompanyReportSection('company-evidence-lab', false, '.lab-node-hypothesis')
                  }
                >
                  <ScanLine size={14} aria-hidden="true" />
                  {t('挑战解释', 'Challenge an explanation')}
                </button>
                {basis(
                  t('结论', 'Conclusion'),
                  brief.headline,
                  t('结论依据', 'Conclusion evidence')
                )}
                {assessment?.ratingConstraints && assessment.ratingConstraints.length > 0 && (
                  <details className="research-grade-limits">
                    <summary>
                      {t('评级受核心弱项限制', 'Grade capped by a weak core dimension')}
                      <ChevronDown size={12} />
                    </summary>
                    <p className="research-grade-constraint">
                      {assessment.ratingConstraints.map((item) => t(...item)).join(' ')}
                    </p>
                  </details>
                )}
              </div>
              {brief.warnings.length > 0 && (
                <div className="research-warnings" role={loading ? 'status' : undefined}>
                  {brief.warnings.map((warning, index) => (
                    <p key={index}>{t(...warning)}</p>
                  ))}
                </div>
              )}
            </div>
            {gradePending && (
              <div className="research-grade research-grade-pending" role="status" aria-busy="true">
                <span>
                  <ChartNoAxesCombined size={17} aria-hidden="true" />
                  {t(...productTerms.financialGrade)}
                </span>
                <strong aria-hidden="true">
                  <span className="skeleton research-grade-placeholder" />
                </strong>
                <span>{t('正在形成判断…', 'Analysis in progress…')}</span>
              </div>
            )}
            {assessment && (
              <button
                type="button"
                className={'research-grade research-grade-' + reportGrade.toLowerCase()}
                title={gradeTitle}
                aria-label={
                  provisionalRating
                    ? t('查看暂定评级依据', 'View provisional grade evidence')
                    : t('查看财务评级依据', 'View financial grade evidence')
                }
                onClick={() => openCompanyReportSection('company-full-report')}
              >
                <span>
                  <ChartNoAxesCombined size={17} aria-hidden="true" />
                  {provisionalRating
                    ? t('暂定评级', 'Provisional grade')
                    : t(...productTerms.financialGrade)}
                </span>
                <strong>{reportGrade === 'NR' ? t('暂不评级', 'Not rated') : reportGrade}</strong>
                {reportGrade !== 'NR' && (
                  <span className="research-grade-rating">{t(...gradeLabels[reportGrade])}</span>
                )}
                {provisionalRating && (
                  <span className="research-grade-coverage">
                    {t(
                      `已覆盖 ${provisionalRating.coveredDimensions}/${provisionalRating.totalDimensions} 维度`,
                      `${provisionalRating.coveredDimensions}/${provisionalRating.totalDimensions} dimensions covered`
                    )}
                  </span>
                )}
                {!provisionalRating && assessment.score !== null && (
                  <span className="research-grade-score">
                    {assessment.score.toFixed(2)} <small>/ 100</small>
                  </span>
                )}
                <span className="research-grade-link">
                  {t('评级依据', 'Grade evidence')}
                  <ArrowRight size={12} aria-hidden="true" />
                </span>
              </button>
            )}
          </div>
          <dl
            className="research-key-amounts"
            aria-label={t('所选年度合并金额', 'Selected-year consolidated amounts')}
          >
            <div>
              <dt>
                <span className="research-metric-icon">
                  <Coins size={19} aria-hidden="true" />
                </span>
                {t('合并净利润', 'Consolidated net profit')}
              </dt>
              <dd>
                {money(amounts.profit, locale)}
                {amounts.profit !== null && <small>{t('元', 'CNY')}</small>}
              </dd>
              {amounts.row && (
                <CompanyContextEvidence
                  snapshot={run.context}
                  row={amounts.row}
                  fields={['netProfit']}
                >
                  {t('查看来源', 'View sources')}
                </CompanyContextEvidence>
              )}
              {!amounts.row && loading && (
                <span className="research-source-placeholder" aria-hidden="true">
                  <span className="skeleton" />
                </span>
              )}
            </div>
            <div>
              <dt>
                <span className="research-metric-icon">
                  <Wallet size={19} aria-hidden="true" />
                </span>
                {t('经营现金净额', 'Operating cash flow')}
              </dt>
              <dd>
                {money(amounts.cash, locale)}
                {amounts.cash !== null && <small>{t('元', 'CNY')}</small>}
              </dd>
              {amounts.row && (
                <CompanyContextEvidence snapshot={run.context} row={amounts.row} fields={['ocf']}>
                  {t('查看来源', 'View sources')}
                </CompanyContextEvidence>
              )}
              {!amounts.row && loading && (
                <span className="research-source-placeholder" aria-hidden="true">
                  <span className="skeleton" />
                </span>
              )}
            </div>
            <div>
              <dt>
                <span className="research-metric-icon">
                  <Percent size={19} aria-hidden="true" />
                </span>
                {t('现金利润比', 'Cash-to-profit ratio')}
              </dt>
              <dd>{ratio}</dd>
              {amounts.row && (
                <CompanyContextEvidence
                  snapshot={run.context}
                  row={amounts.row}
                  fields={['netProfit', 'ocf']}
                  formula={t(
                    '同年度经营现金净额 ÷ 合并净利润；利润非正或来源冲突时不作常规解读。',
                    'Same-year operating cash ÷ consolidated net profit; not conventionally interpreted for nonpositive profit or source conflicts.'
                  )}
                >
                  {t('公式与来源', 'Formula and sources')}
                </CompanyContextEvidence>
              )}
              {!amounts.row && loading && (
                <span className="research-source-placeholder" aria-hidden="true">
                  <span className="skeleton" />
                </span>
              )}
            </div>
          </dl>
          {(amounts.relation === 'conflict' ||
            amounts.relation === 'nonpositive' ||
            progress.snapshot === 'previous') && (
            <p className="research-amount-note">
              {amounts.relation === 'conflict' && (
                <span>
                  {' '}
                  {t(
                    '来源存在冲突，相关金额与比例暂停展示。',
                    'Conflicting amounts and ratios are withheld.'
                  )}
                </span>
              )}
              {amounts.relation === 'nonpositive' && (
                <span>
                  {' '}
                  {t(
                    '利润非正，比例不作常规解读。',
                    'The ratio is not conventionally interpreted with nonpositive profit.'
                  )}
                </span>
              )}
              {progress.snapshot === 'previous' && (
                <span>
                  {' '}
                  {t(
                    '以上金额来自当前资料快照，与上一份分析分别呈现。',
                    'These amounts use the current snapshot, separately from the previous analysis.'
                  )}
                </span>
              )}
            </p>
          )}
          <div className="research-process-strip">
            <CompanyResearchProgress
              run={run}
              onRetrySources={onRetrySources}
              onRetryAnalysis={() => onRefresh()}
              onCancel={onCancel}
              cancelling={cancelling}
            >
              {coverage.origin !== 'unavailable' && (
                <div className="research-report-coverage">
                  <span>{t('本份分析覆盖', 'Scope of this analysis')}</span>
                  <span>
                    {coverage.years} {t('个财务年度', 'financial years')}
                  </span>
                  {coverage.fields !== null && coverage.requiredFields !== null && (
                    <span>
                      {coverage.fields}/{coverage.requiredFields} {t('个关键字段', 'key fields')}
                    </span>
                  )}
                  {coverage.news > 0 && (
                    <span>
                      {t(
                        `新闻 ${coverage.news} · 正文节选 ${coverage.mediaBodies ?? '—'}`,
                        `News ${coverage.news} · body excerpts ${coverage.mediaBodies ?? '—'}`
                      )}
                    </span>
                  )}
                  {coverage.discussions !== null && coverage.discussions > 0 && (
                    <span>
                      {t(
                        `讨论 ${coverage.discussions} · 摘录 ${coverage.discussionBodies ?? '—'}`,
                        `Discussions ${coverage.discussions} · excerpts ${coverage.discussionBodies ?? '—'}`
                      )}
                    </span>
                  )}
                  {coverage.peers > 0 && (
                    <span>{t(`有效同行 ${coverage.peers}`, `Valid peers ${coverage.peers}`)}</span>
                  )}
                  <a className="text-link" href={companyPath(run.id, 'sources', 'coverage')}>
                    {t('数据覆盖', 'Data coverage')}
                    <ArrowRight size={12} />
                  </a>
                </div>
              )}
            </CompanyResearchProgress>
          </div>
        </div>
      </section>
      {brief.priorities.length > 0 && (
        <section className="research-report-section" aria-labelledby="research-findings-heading">
          <div className="research-section-heading">
            <h2 id="research-findings-heading">
              <FileSearch size={20} aria-hidden="true" />
              {t('重点发现', 'Key findings')}
            </h2>
            <button
              type="button"
              className="text-link"
              onClick={() => openCompanyReportSection('company-evidence-lab')}
            >
              {t('检验解释', 'Test an explanation')}
              <ArrowRight size={13} />
            </button>
          </div>
          <ol className="research-judgments">
            {brief.priorities.map((judgment, index) => (
              <li key={index}>
                <span className="research-judgment-number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p>{judgmentText(judgment)}</p>
                {basis(t('重点发现 ', 'Key finding ') + (index + 1), judgment)}
              </li>
            ))}
          </ol>
        </section>
      )}
      <section className="research-report-section" aria-labelledby="research-next-heading">
        <div className="research-section-heading">
          <h2 id="research-next-heading">
            <ListChecks size={20} aria-hidden="true" />
            {t('下一步核查', 'Next checks')}
          </h2>
          <button
            type="button"
            className="text-link"
            disabled={
              loading || !run.context || run.contextStatus === 'loading' || !!run.informationGap
            }
            onClick={() => openCompanyReportSection('company-research-goal', true)}
          >
            {t('进一步研究', 'Research further')}
            <ArrowRight size={13} />
          </button>
        </div>
        {pendingReview.items.length > 0 && (
          <details
            id="company-next-checks"
            className="research-pending-checks"
            open
            key={JSON.stringify([
              run.id,
              run.input.year,
              run.assessment?.generatedAt,
              pendingReview.previous,
            ])}
          >
            <summary>
              <span>
                {t('核查清单', 'Check list')} · {pendingReview.count} {t('项', 'checks')}
              </span>
              <ChevronDown size={14} aria-hidden="true" />
            </summary>
            {pendingReview.previous && pendingReview.snapshotFetchedAt && (
              <p className="research-pending-snapshot">
                {t('上次分析', 'Previous analysis')} ·{' '}
                {date(pendingReview.snapshotFetchedAt, locale)}
              </p>
            )}
            <ol className="research-judgments research-next-checks">
              {pendingReview.items.map(({ judgment, hasEvidence }, index) => (
                <li key={index}>
                  <span className="research-judgment-number" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <p>{judgmentText(judgment)}</p>
                  {hasEvidence ? (
                    basis(t('下一步核查 ', 'Next check ') + (index + 1), judgment)
                  ) : (
                    <a
                      className="text-link research-basis"
                      href={companyPath(run.id, 'evidence')}
                      aria-label={
                        t('核对原件：', 'Review originals for: ') + judgmentText(judgment)
                      }
                    >
                      <FileSearch size={13} aria-hidden="true" />
                      {t('核对原件', 'Review originals')}
                    </a>
                  )}
                </li>
              ))}
            </ol>
          </details>
        )}
        <CompanyReview run={run} />
      </section>
      <ReportEvidenceControls
        scopeId={reportId}
        scopeKey={JSON.stringify([
          run.id,
          run.input.securityCode,
          run.input.orgId,
          run.input.year,
          run.context?.fetchedAt,
          run.assessment?.generatedAt,
          progress.snapshot,
        ])}
      />
      <ResearchPlan run={run} />
      <SourceTrust run={run} />
      {!run.context?.publicSignals && !run.informationGap && (
        <p className="research-public-followup">
          {t(
            '这份记录尚未补查公开讨论。',
            'Public discussions have not been collected for this record.'
          )}
          <button
            className="text-link"
            disabled={loading || !run.context || run.contextStatus === 'loading'}
            onClick={() =>
              onRefresh('补查公司新闻与公开讨论，比较支持和反向线索；公众帖子保留未核实观点标记。')
            }
          >
            {t('补查新闻与讨论', 'Research news and discussions')}
            <ArrowRight size={12} />
          </button>
        </p>
      )}
      {selected && assessment && (
        <CompanyAssessmentEvidence
          assessment={assessment}
          title={selected.title}
          judgment={selected.judgment}
          onClose={() => setSelected(null)}
        />
      )}
    </article>
  );
}
