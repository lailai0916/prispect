import { productTerms } from '../shared/product-terms';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronDown, FileSearch, LoaderCircle, Minus } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import type { AssessmentJudgment, AssessmentText } from '../shared/company-assessment';
import {
  deriveCompanyResearchBrief,
  deriveCompanyResearchProgress,
  type CompanyResearchViewState,
} from '../shared/company-research-view';
import { companyReviewSummary } from '../shared/company-review';
import { companyPath, companySections } from '../shared/company-workspace';
import { CompanyAssessmentEvidence } from './CompanyAssessment';
import { CompanyContextEvidence } from './CompanyContextViews';
import { CompanyReview } from './CompanyReview';
import { useApp } from './context';
import { date, money } from './format';
import './research-report.css';

const [, coverageZh, coverageEn] = companySections.find(([key]) => key === 'coverage')!;

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
export function openCompanyReportSection(id: string, focusInput = false) {
  const target = document.getElementById(id);
  if (!target) return;
  let containing: HTMLElement | null = target;
  while (containing) {
    if (containing instanceof HTMLDetailsElement) containing.open = true;
    containing = containing.parentElement;
  }
  requestAnimationFrame(() => {
    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
    const focus = focusInput
      ? target.querySelector<HTMLTextAreaElement>('textarea')
      : target instanceof HTMLDetailsElement
        ? target.querySelector<HTMLElement>('summary')
        : null;
    focus?.focus({ preventScroll: true });
  });
}

function CompanyResearchProgress({ run }: { run: CompanyResearchRun }) {
  const { t, locale } = useApp();
  const progress = deriveCompanyResearchProgress(run);
  const steps =
    run.assessmentStatus === 'loading' || run.assessmentStatus === 'failed'
      ? run.assessmentTrace || []
      : run.contextStatus === 'loading'
        ? []
        : run.assessmentTrace || run.assessment?.research?.steps || [];
  return (
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
        <ol className="research-progress-stages">
          {progress.stages.map((stage) => (
            <li key={stage.id} className={'research-stage research-stage-' + stage.status}>
              <div>
                <span className="research-stage-mark" aria-hidden="true">
                  {stage.status === 'running' ? (
                    <LoaderCircle size={12} className="spinner" />
                  ) : stage.status === 'completed' ? (
                    <Check size={12} />
                  ) : (
                    <Minus size={12} />
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
  );
}

export function CompanyResearchReport({
  run,
  onRefresh,
  refreshing,
}: {
  run: CompanyResearchRun;
  onRefresh: (focus?: string) => void;
  refreshing: boolean;
}) {
  const { t, locale } = useApp();
  const brief = deriveCompanyResearchBrief(run);
  const progress = deriveCompanyResearchProgress(run);
  const amounts = companyReviewSummary(run);
  const [selected, setSelected] = useState<{ title: string; judgment: AssessmentJudgment } | null>(
    null
  );
  const assessment =
    progress.snapshot === 'mismatch' || run.informationGap ? undefined : run.assessment;
  useEffect(() => setSelected(null), [run.id, run.assessment?.generatedAt]);
  const loading = refreshing || progress.state === 'running';
  const judgmentText = (judgment: AssessmentJudgment) =>
    judgment.text[locale === 'en' ? 'en' : 'zh'];
  const basis = (title: string, judgment: AssessmentJudgment) =>
    assessment && (judgment.metricIds.length > 0 || judgment.evidenceIds.length > 0) ? (
      <button
        type="button"
        className="text-link research-basis"
        onClick={() => setSelected({ title, judgment })}
        aria-label={t('查看依据：', 'Evidence for: ') + title}
      >
        <FileSearch size={13} />
        {t('依据', 'Evidence')}
      </button>
    ) : null;
  const gradeTitle = assessment
    ? t('所选年度合并财务筛选。', 'Selected-year consolidated financial screening.') +
      (assessment.ratingConstraints?.map((item) => t(...item)).join(' ') || '')
    : '';
  const ratio = amounts.ratio === null ? '—' : `${(amounts.ratio * 100).toFixed(2)}%`;
  const coverage = brief.coverage;
  return (
    <article className="company-research-report" data-testid="company-research-report">
      <section className="research-summary" aria-labelledby="research-summary-heading">
        <div className="research-section-heading">
          <h2 id="research-summary-heading">{t('分析摘要', 'Analysis summary')}</h2>
          {assessment && (
            <button
              type="button"
              className={'research-grade research-grade-' + assessment.grade.toLowerCase()}
              title={gradeTitle}
              aria-label={t('查看财务评级依据', 'View financial grade evidence')}
              onClick={() => openCompanyReportSection('company-full-report')}
            >
              <span>{t(...productTerms.financialGrade)}</span>
              <strong>
                {assessment.grade === 'NR' ? t('暂不评级', 'Not rated') : assessment.grade}
              </strong>
              {assessment.grade !== 'NR' && <span>{t(...gradeLabels[assessment.grade])}</span>}
              {assessment.score !== null && (
                <span className="research-grade-score">{assessment.score.toFixed(2)} / 100</span>
              )}
            </button>
          )}
        </div>
        <p className="research-summary-judgment">{judgmentText(brief.summary)}</p>
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
        </div>
        {brief.warnings.length > 0 && (
          <div className="research-warnings" role={loading ? 'status' : undefined}>
            {brief.warnings.map((warning, index) => (
              <p key={index}>{t(...warning)}</p>
            ))}
          </div>
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
        <dl
          className="research-key-amounts"
          aria-label={t('所选年度合并金额', 'Selected-year consolidated amounts')}
        >
          <div>
            <dt>{t('合并净利润', 'Consolidated net profit')}</dt>
            <dd>
              {money(amounts.profit, locale)}
              {amounts.profit !== null && <small>{t('元', 'CNY')}</small>}
            </dd>
            {amounts.row && (
              <CompanyContextEvidence row={amounts.row} fields={['netProfit']}>
                {t('查看来源', 'View sources')}
              </CompanyContextEvidence>
            )}
          </div>
          <div>
            <dt>{t('经营现金净额', 'Operating cash flow')}</dt>
            <dd>
              {money(amounts.cash, locale)}
              {amounts.cash !== null && <small>{t('元', 'CNY')}</small>}
            </dd>
            {amounts.row && (
              <CompanyContextEvidence row={amounts.row} fields={['ocf']}>
                {t('查看来源', 'View sources')}
              </CompanyContextEvidence>
            )}
          </div>
          <div>
            <dt>{t('现金利润比', 'Cash-to-profit ratio')}</dt>
            <dd>{ratio}</dd>
            {amounts.row && (
              <CompanyContextEvidence
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
          </div>
        </dl>
        <p className="research-amount-note">
          {t(
            '经营现金净额 ÷ 合并净利润；不是销售回款率。',
            'Operating cash ÷ consolidated profit; not a sales collection rate.'
          )}
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
          {amounts.relation === 'missing' && (
            <span> {t('缺失金额保持未知。', 'Missing amounts remain unknown.')}</span>
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
        <CompanyResearchProgress run={run} />
      </section>
      {brief.priorities.length > 0 && (
        <section className="research-report-section" aria-labelledby="research-findings-heading">
          <div className="research-section-heading">
            <h2 id="research-findings-heading">{t('重点发现', 'Key findings')}</h2>
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
          <h2 id="research-next-heading">{t('下一步核查', 'Next checks')}</h2>
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
        {brief.nextChecks.length > 0 && (
          <ol className="research-judgments research-next-checks">
            {brief.nextChecks.map((judgment, index) => (
              <li key={index}>
                <span className="research-judgment-number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p>{judgmentText(judgment)}</p>
                {basis(t('下一步核查 ', 'Next check ') + (index + 1), judgment)}
              </li>
            ))}
          </ol>
        )}
        <CompanyReview run={run} />
      </section>
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
          <a className="text-link" href={companyPath(run.id, 'coverage')}>
            {t(coverageZh, coverageEn)}
            <ArrowRight size={12} />
          </a>
        </div>
      )}
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
