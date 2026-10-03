import { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronDown, FileSearch, LoaderCircle, RefreshCw } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import {
  type AssessmentJudgment,
  type AssessmentStatus,
  type AssessmentText,
  type CompanyAssessment as Assessment,
} from '../shared/company-assessment';
import { Dialog } from './components';
import { useApp } from './context';
import { date, money } from './format';
import { deriveCompanyResearchProgress } from '../shared/company-research-view';
import './company-assessment.css';

const statusLabels: Record<AssessmentStatus, AssessmentText> = {
  strong: ['较强', 'Strong'],
  balanced: ['中等', 'Balanced'],
  pressure: ['承压', 'Under pressure'],
  'high-pressure': ['显著承压', 'High pressure'],
  unknown: ['数据不足', 'Insufficient data'],
  conflict: ['来源冲突', 'Source conflict'],
};

function sourceHref(url: string, page?: number): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;
    if (page) parsed.hash = `page=${page}`;
    return parsed.href;
  } catch {
    return;
  }
}

function AssessmentResearch({
  run,
  loading,
  onRequest,
}: {
  run: CompanyResearchRun;
  loading: boolean;
  onRequest: (focus?: string) => void;
}) {
  const { t } = useApp();
  const [focus, setFocus] = useState(run.assessmentFocus || '');
  const unavailable =
    loading ||
    !run.context ||
    run.contextStatus === 'loading' ||
    deriveCompanyResearchProgress(run).snapshot === 'mismatch';
  return (
    <div className="assessment-research">
      <details
        id="company-research-goal"
        className="assessment-details assessment-research-request"
      >
        <summary>
          <ChevronDown size={14} />
          {t('进一步研究', 'Research further')}
        </summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onRequest(focus.trim());
          }}
        >
          <label htmlFor={'assessment-focus-' + run.id}>{t('研究目标', 'Research goal')}</label>
          <textarea
            id={'assessment-focus-' + run.id}
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
            rows={2}
            maxLength={1000}
            disabled={unavailable}
            placeholder={t(
              '例如：比较现金质量与同行，梳理近一年重大事项',
              'For example: compare cash quality with peers and review major events over the past year'
            )}
          />
          <div>
            <p>
              {t(
                '留空按财务、同行与公开事项范围研究。',
                'Leave this blank to research financials, peers and public events.'
              )}
            </p>
            <button className="button button-secondary" type="submit" disabled={unavailable}>
              {loading ? <LoaderCircle size={13} className="spinner" /> : <FileSearch size={13} />}
              {loading ? t('研究中', 'Researching') : t('开始研究', 'Start research')}
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}

export function CompanyAssessment({
  run,
  onRefresh,
  refreshing,
}: {
  run: CompanyResearchRun;
  onRefresh: (focus?: string) => void;
  refreshing: boolean;
}) {
  const { t, locale } = useApp();
  const [selected, setSelected] = useState<{ title: string; judgment: AssessmentJudgment } | null>(
    null
  );
  const assessment = run.assessment;
  const loading = run.assessmentStatus === 'loading' || refreshing;
  useEffect(() => setSelected(null), [assessment?.generatedAt]);
  if (run.informationGap) return null;
  if (!assessment || deriveCompanyResearchProgress(run).snapshot === 'mismatch')
    return (
      <section
        className="company-assessment assessment-pending"
        aria-labelledby="assessment-heading"
      >
        <div className="assessment-section-heading">
          <h2 id="assessment-heading">{t('六维分析', 'Analysis by dimension')}</h2>
          {loading && <LoaderCircle size={14} className="spinner" />}
        </div>
        <p role={run.assessmentStatus === 'failed' ? 'alert' : 'status'}>
          {loading
            ? t(
                '正在比对财务、同行与公开事项；已取得资料仍可查看。',
                'Comparing financial history, peers and disclosures to produce the analysis.'
              )
            : run.contextStatus === 'loading'
              ? t(
                  '正在获取公开资料，资料返回后自动分析。',
                  'Retrieving public information. Analysis starts once it is available.'
                )
              : run.assessmentStatus === 'failed'
                ? t(
                    '本次分析未完成，已取得的财务数据与原件核查仍可查看。',
                    'The analysis did not complete. Available financial data and original reviews remain accessible.'
                  )
                : t('尚未形成分析。', 'Analysis is not yet available.')}
        </p>
        {run.context && !loading && run.contextStatus !== 'loading' && (
          <button className="button button-secondary" onClick={() => onRefresh()}>
            <RefreshCw size={13} />
            {t('生成分析', 'Generate analysis')}
          </button>
        )}
        <AssessmentResearch run={run} loading={loading} onRequest={onRefresh} />
      </section>
    );

  const judgmentText = (item: AssessmentJudgment) => item.text[locale === 'en' ? 'en' : 'zh'];
  const canInspect = (item: AssessmentJudgment) =>
    item.metricIds.length > 0 || item.evidenceIds.length > 0;
  const inspect = (title: string, item: AssessmentJudgment) =>
    setSelected({ title, judgment: item });
  const basisLink = (title: string, item: AssessmentJudgment) =>
    canInspect(item) ? (
      <button
        className="text-link assessment-basis-link"
        onClick={() => inspect(title, item)}
        aria-label={t('查看依据：', 'Evidence for: ') + title}
      >
        <FileSearch size={13} />
        {t('依据', 'Evidence')}
      </button>
    ) : null;
  const allMetrics: AssessmentJudgment = {
    text: {
      zh: '所选年度合并财务指标；金额与比例按公开来源计算。',
      en: 'Selected-year consolidated metrics calculated from the public sources.',
    },
    metricIds: assessment.metrics.map((item) => item.id),
    evidenceIds: [],
  };
  const judgmentList = (title: string, items: AssessmentJudgment[], className = '') =>
    items.length > 0 ? (
      <section className={'assessment-judgments ' + className}>
        <h3>{title}</h3>
        <ol>
          {items.map((item, index) => (
            <li key={index}>
              <p>{judgmentText(item)}</p>
              {basisLink(title + ' ' + (index + 1), item)}
            </li>
          ))}
        </ol>
      </section>
    ) : null;

  return (
    <section
      className="company-assessment"
      aria-labelledby="assessment-heading"
      data-testid="company-assessment"
    >
      <div className="assessment-section-heading">
        <h2 id="assessment-heading">{t('六维分析', 'Analysis by dimension')}</h2>
        <button
          className="text-link assessment-refresh"
          disabled={loading || run.contextStatus === 'loading'}
          onClick={() => onRefresh()}
        >
          {loading ? <LoaderCircle size={13} className="spinner" /> : <RefreshCw size={13} />}
          {loading ? t('分析中', 'Analyzing') : t('重新分析', 'Reanalyze')}
        </button>
      </div>
      <p className="assessment-meta">
        {assessment.year} · {t('合并口径', 'Consolidated scope')} ·{' '}
        {t('资料快照 ', 'Data snapshot ') + date(assessment.snapshotFetchedAt, locale)}
      </p>
      <div
        className="assessment-dimensions"
        aria-label={t('六个分析维度', 'Six analysis dimensions')}
      >
        {assessment.dimensions.map((dimension) => {
          const narrative = assessment.narrative?.dimensions.find(
            (item) => item.dimensionId === dimension.id
          );
          const qualitativeSources =
            (dimension.id === 'industry' && assessment.coverage.peers >= 5) ||
            (dimension.id === 'events' && assessment.coverage.excerpts > 0);
          const statusLabel =
            dimension.status === 'unknown' && qualitativeSources
              ? narrative
                ? t('定性分析', 'Qualitative analysis')
                : t('待解读', 'Awaiting interpretation')
              : t(...statusLabels[dimension.status]);
          const judgment: AssessmentJudgment = narrative || {
            text: { zh: dimension.ruleSummary[0], en: dimension.ruleSummary[1] },
            metricIds: dimension.metricIds,
            evidenceIds: [],
          };
          return (
            <div className="assessment-dimension" key={dimension.id}>
              <div className="assessment-dimension-heading">
                <h3>{t(...dimension.label)}</h3>
                <span className={'assessment-status assessment-status-' + dimension.status}>
                  {statusLabel}
                </span>
              </div>
              <p>{judgmentText(judgment)}</p>
              <div className="assessment-dimension-footer">
                {dimension.score !== null && (
                  <span>{t('维度分 ', 'Dimension score ') + dimension.score.toFixed(2)}</span>
                )}
                {basisLink(t(...dimension.label), judgment)}
              </div>
            </div>
          );
        })}
      </div>
      {assessment.gaps.length > 0 && (
        <details className="assessment-details assessment-gaps">
          <summary>
            <ChevronDown size={14} />
            {t('数据缺口', 'Data gaps')} · {assessment.gaps.length}
          </summary>
          <ul>
            {assessment.gaps.map((gap, index) => (
              <li key={index}>{t(...gap)}</li>
            ))}
          </ul>
        </details>
      )}
      {assessment.narrative &&
        (assessment.narrative.strengths.length > 0 ||
          assessment.narrative.changeConditions.length > 0) && (
          <details className="assessment-details">
            <summary>
              <ChevronDown size={14} />
              {t('优势与判断变化条件', 'Strengths and conditions for reassessment')}
            </summary>
            {judgmentList(t('经营优势', 'Strengths'), assessment.narrative.strengths)}
            {judgmentList(
              t('什么会改变判断', 'What would change the judgment'),
              assessment.narrative.changeConditions
            )}
          </details>
        )}
      <AssessmentResearch run={run} loading={loading} onRequest={onRefresh} />
      <div className="assessment-coverage">
        <span>{t('分析覆盖', 'Analysis coverage')}</span>
        <span>
          {assessment.coverage.years} {t('个财务年度', 'financial years')}
        </span>
        <span>
          {assessment.coverage.fields}/{assessment.coverage.requiredFields}{' '}
          {t('个关键字段', 'key fields')}
        </span>
        <span>
          {assessment.coverage.peers} {t('家有效同行', 'valid peers')}
        </span>
        <span>
          {assessment.coverage.disclosures} {t('条公告', 'disclosures')} ·{' '}
          {assessment.coverage.excerpts} {t('份节选', 'excerpts')}
        </span>
        <span>
          {assessment.coverage.news} {t('条新闻', 'news items')}
        </span>
        {assessment.coverage.discussions !== undefined && (
          <span>
            {assessment.coverage.discussions}{' '}
            {t('条公开讨论 · 未核实观点', 'public discussions · unverified opinions')}
          </span>
        )}
      </div>
      <div className="assessment-audit-actions">
        <button
          className="text-link"
          onClick={() =>
            inspect(t('财务指标与计算依据', 'Financial metrics and calculations'), allMetrics)
          }
        >
          <FileSearch size={13} />
          {t('指标与计算依据', 'Metrics and calculations')}
        </button>
        <span>
          {t('资料快照 ', 'Data snapshot ') + date(assessment.snapshotFetchedAt, locale)} ·{' '}
          {t('分析生成 ', 'Analyzed ') + date(assessment.generatedAt, locale)}
        </span>
      </div>
      {selected && (
        <CompanyAssessmentEvidence
          assessment={assessment}
          title={selected.title}
          judgment={selected.judgment}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}

/** Shared evidence inspection for the concise report and its detailed analysis. */
export function CompanyAssessmentEvidence({
  assessment,
  title,
  judgment,
  onClose,
}: {
  assessment: Assessment;
  title: string;
  judgment: AssessmentJudgment;
  onClose: () => void;
}) {
  const { t, locale } = useApp();
  const selectedMetrics = assessment.metrics.filter((item) => judgment.metricIds.includes(item.id));
  const selectedEvidenceIds = new Set([
    ...judgment.evidenceIds,
    ...selectedMetrics.flatMap((item) => item.evidenceIds),
  ]);
  const selectedEvidence = assessment.evidence.filter((item) => selectedEvidenceIds.has(item.id));
  return (
    <Dialog title={title} onClose={onClose} variant="drawer" className="assessment-evidence-drawer">
      <p className="assessment-drawer-judgment">{judgment.text[locale === 'en' ? 'en' : 'zh']}</p>
      {selectedMetrics.length > 0 && (
        <section className="assessment-drawer-metrics">
          <h3>{t('指标与公式', 'Metrics and formulas')}</h3>
          {selectedMetrics.map((metric) => (
            <article key={metric.id}>
              <div>
                <h4>{t(...metric.label)}</h4>
                <strong>{t(...metric.display)}</strong>
              </div>
              {metric.value !== null && metric.status === 'available' && (
                <p>
                  {t('精确值：', 'Exact value: ') +
                    (metric.unit === 'CNY'
                      ? money(metric.value, locale, false) + ' CNY'
                      : metric.value +
                        (metric.unit === 'percent'
                          ? '%'
                          : metric.unit === 'percentage-points'
                            ? t(' 个百分点', ' percentage points')
                            : metric.unit === 'times'
                              ? t(' 倍', '×')
                              : ''))}
                </p>
              )}
              <p>{t(...metric.formula)}</p>
            </article>
          ))}
        </section>
      )}
      <section className="assessment-drawer-sources">
        <h3>{t('对应来源', 'Supporting sources')}</h3>
        {selectedEvidence.length ? (
          selectedEvidence.map((evidence) => {
            const href = sourceHref(evidence.url, evidence.page);
            return (
              <article key={evidence.id}>
                <div>
                  <h4>{evidence.label}</h4>
                  {href && (
                    <a
                      className="text-link"
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('打开来源：', 'Open source: ') + evidence.label}
                    >
                      <ArrowUpRight size={15} />
                    </a>
                  )}
                </div>
                <p className="assessment-source-scope">
                  {evidence.period ? evidence.period + ' · ' : ''}
                  {evidence.sourceQuality === 'opinion'
                    ? t('公开讨论 · 未核实观点', 'Public discussion · unverified opinion')
                    : evidence.kind === 'news' &&
                        evidence.sourceQuality === 'headline' &&
                        evidence.quote
                      ? t(
                          '媒体线索，需与官方披露核对',
                          'Media lead; corroborate with official disclosures'
                        )
                      : evidence.sourceQuality === 'headline'
                        ? t('标题线索，未取得正文', 'Headline lead; full text unavailable')
                        : evidence.sourceQuality === 'excerpt'
                          ? t('已取得原文节选', 'Source excerpt retrieved')
                          : t('公开网页字段', 'Public web fields')}
                  {evidence.page ? ' · ' + t('第 ', 'Page ') + evidence.page + t(' 页', '') : ''}
                </p>
                {evidence.quote && evidence.sourceQuality !== 'headline' && (
                  <blockquote>{evidence.quote}</blockquote>
                )}
                {href && (
                  <a
                    className="assessment-source-url"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {href}
                  </a>
                )}
              </article>
            );
          })
        ) : (
          <p className="context-data-note">
            {t(
              '相关字段尚缺少可用来源；本项不作无依据的推断。',
              'Supporting sources are unavailable. No unsupported inference is made for this item.'
            )}
          </p>
        )}
      </section>
    </Dialog>
  );
}
