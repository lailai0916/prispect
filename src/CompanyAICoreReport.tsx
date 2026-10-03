import { ArrowUpRight, FileSearch, MessageCircle } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import type { AssessmentJudgment } from '../shared/company-assessment';
import type { CompanyReadingBasis } from '../shared/company-analysis';
import { companyReportCore } from '../shared/company-report-summary';
import { deriveCompanyResearchProgress } from '../shared/company-research-view';
import {
  OPEN_COMPANY_ASSISTANT_EVENT,
  type OpenCompanyAssistantDetail,
} from '../shared/company-navigation';
import { productTerms } from '../shared/product-terms';
import { useApp } from './context';
import { date } from './format';

/** Reads an existing report. Opening this section never starts retrieval or analysis. */
export function CompanyAICoreReport({
  run,
  disabled = false,
  basis = 'consolidated',
  onInspect,
}: {
  run: CompanyResearchRun;
  disabled?: boolean;
  basis?: CompanyReadingBasis;
  onInspect?: (judgment: AssessmentJudgment) => void;
}) {
  const { t, locale, user } = useApp();
  const core = companyReportCore(run, locale);
  const progress = deriveCompanyResearchProgress(run);
  const assessment = core.summary ? run.assessment : undefined;
  const hasSources =
    Boolean(core.summary?.metricIds.length || core.summary?.evidenceIds.length) && !!onInspect;
  const canAsk = Boolean(user && !disabled && core.summary);
  const ask = (question: string) => {
    if (!canAsk || !user) return;
    const detail: OpenCompanyAssistantDetail = {
      owner: user.id,
      runId: run.id,
      question,
      basis,
      ...(run.assessment ? { reportGeneratedAt: run.assessment.generatedAt } : {}),
    };
    window.dispatchEvent(new CustomEvent(OPEN_COMPANY_ASSISTANT_EVENT, { detail }));
  };
  return (
    <section
      id="company-ai-core-report"
      className="company-ai-core-report"
      aria-labelledby="company-ai-core-heading"
      data-testid="company-ai-core-report"
      data-mode={core.model ? 'model' : core.summary ? 'rules' : 'none'}
    >
      <header className="company-ai-core-heading">
        <div>
          <h2 id="company-ai-core-heading">{t('核心判断', 'Core judgment')}</h2>
          {core.summary && (
            <span className="company-ai-core-mode">
              {core.model ? t('AI 分析', 'AI analysis') : t('规则结果', 'Rule results')}
            </span>
          )}
          {core.summary && (
            <span className="company-ai-core-basis">{t('合并口径', 'Consolidated basis')}</span>
          )}
        </div>
        {assessment && (
          <span className="company-ai-core-grade" data-grade={assessment.grade}>
            {t(...productTerms.financialGrade)}
            <strong>{assessment.grade === 'NR' ? t('未评级', 'Unrated') : assessment.grade}</strong>
          </span>
        )}
      </header>
      {core.summary ? (
        <>
          <p className="company-ai-core-summary">
            {core.segments.map((segment, index) =>
              segment.highlight ? (
                <strong key={index}>{segment.text}</strong>
              ) : (
                <span key={index}>{segment.text}</span>
              )
            )}
          </p>
          <div className="company-ai-core-meta">
            {assessment && (
              <span>
                {progress.snapshot === 'previous'
                  ? t('上一份资料快照', 'Previous data snapshot')
                  : t('资料快照', 'Data snapshot')}
                {' · '}
                {date(assessment.snapshotFetchedAt, locale)}
              </span>
            )}
            {hasSources && (
              <button
                type="button"
                className="text-link"
                onClick={() => core.summary && onInspect?.(core.summary)}
                aria-label={t('查看核心判断的依据', 'View the evidence for the core judgment')}
              >
                <FileSearch size={13} aria-hidden="true" />
                {t('依据', 'Evidence')}
              </button>
            )}
          </div>
          {core.questions.length > 0 && (
            <div className="company-ai-core-questions">
              <span className="company-ai-question-label">
                <MessageCircle size={13} aria-hidden="true" />
                {t('继续追问', 'Ask a follow-up')}
              </span>
              <div role="group" aria-label={t('推荐问题', 'Suggested questions')}>
                {core.questions.map((question) => (
                  <button
                    key={question.id}
                    type="button"
                    className="company-ai-question"
                    disabled={!canAsk}
                    onClick={() => ask(question.text)}
                    data-question={question.text}
                  >
                    <span>{question.text}</span>
                    <ArrowUpRight size={12} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="company-ai-core-empty" role="status">
          {progress.state === 'running'
            ? t(
                '正在研究，完成后显示核心判断。',
                'Research is running; the core judgment will appear here.'
              )
            : t('尚未形成核心判断。', 'A core judgment is not yet available.')}
        </p>
      )}
    </section>
  );
}
