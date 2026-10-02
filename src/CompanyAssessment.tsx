import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  FileSearch,
  LoaderCircle,
  RefreshCw,
  X,
} from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import {
  ASSESSMENT_METHODOLOGY,
  type AssessmentJudgment,
  type AssessmentStatus,
  type AssessmentText,
  type CompanyAssessment as Assessment,
} from '../shared/company-assessment';
import { Dialog } from './components';
import { useApp } from './context';
import { date, money } from './format';
import './company-assessment.css';

const statusLabels: Record<AssessmentStatus, AssessmentText> = {
  strong: ['较强', 'Strong'],
  balanced: ['中等', 'Balanced'],
  pressure: ['承压', 'Under pressure'],
  'high-pressure': ['显著承压', 'High pressure'],
  unknown: ['数据不足', 'Insufficient data'],
  conflict: ['来源冲突', 'Source conflict'],
};
const gradeLabels: Record<Assessment['grade'], AssessmentText> = {
  A: ['较强', 'Strong'],
  B: ['中等', 'Balanced'],
  C: ['承压', 'Under pressure'],
  D: ['显著承压', 'High pressure'],
  NR: ['暂不评级', 'Not rated'],
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
  const [processOpen, setProcessOpen] = useState(loading);
  useEffect(() => {
    if (loading) setProcessOpen(true);
  }, [loading]);
  const steps = run.assessmentTrace || run.assessment?.research?.steps || [];
  const research = run.assessment?.research;
  const unavailable = loading || !run.context || run.contextStatus === 'loading';
  return (
    <div className="assessment-research">
      {steps.length > 0 && (
        <details
          className="assessment-details assessment-research-process"
          open={processOpen}
          onToggle={(event) => setProcessOpen(event.currentTarget.open)}
        >
          <summary>
            <ChevronDown size={14} />
            {t('研究过程', 'Research process')} · {steps.length} {t('个步骤', 'steps')}
            {loading ? ' · ' + t('运行中', 'Running') : ''}
          </summary>
          {run.assessmentFocus && (
            <p className="assessment-research-goal">
              {t('研究目标：', 'Research goal: ') + run.assessmentFocus}
            </p>
          )}
          <ol>
            {steps.map((step) => (
              <li
                key={step.id}
                className={'assessment-research-step assessment-research-step-' + step.status}
              >
                {step.status === 'running' ? (
                  <LoaderCircle size={13} className="spinner" />
                ) : step.status === 'completed' ? (
                  <Check size={13} />
                ) : (
                  <X size={13} />
                )}
                <div>
                  <strong>{step.label}</strong>
                  <span>
                    {step.status === 'running'
                      ? t('执行中', 'Running')
                      : step.status === 'completed'
                        ? t('完成', 'Completed')
                        : t('未完成', 'Failed')}
                  </span>
                  {step.summary && <p>{step.summary}</p>}
                </div>
              </li>
            ))}
          </ol>
          {research && !loading && (
            <p className="assessment-research-counts">
              {t('模型分析 ', 'Model analysis ') +
                research.modelCalls +
                t(' 次 · 数据检索 ', ' calls · Data retrieval ') +
                research.toolCalls +
                t(' 次', ' calls')}
            </p>
          )}
        </details>
      )}
      <details className="assessment-details assessment-research-request">
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
                '默认已自动分析；留空按常规财务与事件范围研究。',
                'Analysis runs automatically. Leave this blank to research the standard financial and event scope.'
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
  if (!assessment)
    return (
      <section
        className="company-assessment assessment-pending"
        aria-labelledby="assessment-heading"
      >
        <div className="assessment-section-heading">
          <h2 id="assessment-heading">{t('公司分析', 'Company analysis')}</h2>
          {loading && <LoaderCircle size={14} className="spinner" />}
        </div>
        <p role={run.assessmentStatus === 'failed' ? 'alert' : 'status'}>
          {loading
            ? t(
                '正在比对财务历史、同行与公告，生成分析判断。',
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
                : t(
                    '尚未形成分析。缺失资料不会填零，也不会推定公司评级。',
                    'Analysis is not yet available. Missing data is not filled with zero or used to infer a grade.'
                  )}
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
  const summary = assessment.narrative?.summary;
  const selectedMetrics = selected
    ? assessment.metrics.filter((item) => selected.judgment.metricIds.includes(item.id))
    : [];
  const selectedEvidenceIds = new Set([
    ...(selected?.judgment.evidenceIds || []),
    ...selectedMetrics.flatMap((item) => item.evidenceIds),
  ]);
  const selectedEvidence = assessment.evidence.filter((item) => selectedEvidenceIds.has(item.id));
  const modelCompleted = assessment.model.status === 'completed';
  const isStale = run.context && run.context.fetchedAt !== assessment.snapshotFetchedAt;
  const core = assessment.dimensions.filter((item) => !['industry', 'events'].includes(item.id));
  const pressure = core.filter((item) => ['pressure', 'high-pressure'].includes(item.status));
  const fallbackSummary =
    assessment.grade === 'NR'
      ? t(
          '关键财务数据未齐或存在冲突，暂不形成综合评级。可先查看已具备依据的维度判断。',
          'Key financial data is incomplete or conflicting, so an overall grade is withheld. Supported dimension judgments remain available.'
        )
      : pressure.length
        ? t(
            pressure.map((item) => item.label[0]).join('、') +
              '存在压力，需结合下列指标与核查资料评估。',
            pressure.map((item) => item.label[1]).join(', ') +
              ' show pressure. Evaluate these signals with the metrics and follow-up evidence below.'
          )
        : t(
            '核心财务指标处于较强或中等区间；事件与同行因素仍需结合原文判断。',
            'Core financial metrics fall in strong or balanced screening ranges. Events and peer context still require source review.'
          );
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
        <h2 id="assessment-heading">{t('公司分析', 'Company analysis')}</h2>
        <button
          className="text-link assessment-refresh"
          disabled={loading || run.contextStatus === 'loading'}
          onClick={() => onRefresh()}
        >
          {loading ? <LoaderCircle size={13} className="spinner" /> : <RefreshCw size={13} />}
          {loading ? t('分析中', 'Analyzing') : t('重新分析', 'Reanalyze')}
        </button>
      </div>
      <div className="assessment-summary">
        <div className={'assessment-grade assessment-grade-' + assessment.grade.toLowerCase()}>
          <span>{t('析光分析评级', 'Prispect analysis grade')}</span>
          <div>
            <strong>{assessment.grade}</strong>
            <span>{t(...gradeLabels[assessment.grade])}</span>
          </div>
          {assessment.score !== null && (
            <small>{t('综合分 ', 'Score ') + assessment.score.toFixed(2) + ' / 100'}</small>
          )}
          {assessment.ratingConstraints && assessment.ratingConstraints.length > 0 && (
            <p className="assessment-grade-constraint">
              {assessment.ratingConstraints.map((constraint) => t(...constraint)).join(' ')}
            </p>
          )}
        </div>
        <div className="assessment-conclusion">
          <p className="assessment-main-judgment">
            {summary ? judgmentText(summary) : fallbackSummary}
          </p>
          {summary && basisLink(t('总体判断', 'Overall judgment'), summary)}
          <p className="assessment-meta">
            {assessment.year} · {t('合并口径', 'Consolidated scope')} ·{' '}
            {loading
              ? t('新分析进行中', 'New analysis in progress')
              : modelCompleted
                ? assessment.model.name
                  ? assessment.model.name + t(' 分析已完成', ' analysis completed')
                  : t('AI 分析已完成', 'AI analysis completed')
                : t('规则分析', 'Rule analysis')}
          </p>
        </div>
      </div>
      {(!modelCompleted || loading || run.assessmentStatus === 'failed') && (
        <p className="assessment-model-note" role="status">
          {loading
            ? t(
                'AI 正在分析；下列评级与指标仍由透明规则计算。',
                'AI analysis is in progress; the grade and metrics below use transparent calculations.'
              )
            : run.assessmentStatus === 'failed'
              ? t(
                  '本次研究未完成，保留上一份分析与指标，可重新研究。',
                  'This research did not complete. The previous analysis and metrics are retained; you can retry.'
                )
              : assessment.model.status === 'not-configured'
                ? t(
                    'AI 服务未配置，当前展示基于公开数据的规则判断。',
                    'AI is not configured. The current judgments use public data and transparent rules.'
                  )
                : assessment.model.status === 'failed'
                  ? t(
                      'AI 分析未完成，保留已计算的评级与指标，可重新分析。',
                      'AI analysis did not complete. Calculated grades and metrics are retained; you can retry.'
                    )
                  : t(
                      'AI 尚未返回分析，当前展示规则判断。',
                      'AI analysis is not yet available. Rule judgments are shown.'
                    )}
        </p>
      )}
      {isStale && (
        <p className="assessment-model-note" role="status">
          {loading || run.contextStatus === 'loading'
            ? t(
                '公开资料正在更新，下列分析仍对应上一份资料快照。',
                'Public data is updating. The analysis below still corresponds to the previous snapshot.'
              )
            : t(
                '公开资料已更新，下列分析对应上一份资料快照；可重新分析。',
                'Public data has changed. The analysis below uses the previous snapshot; reanalyze to update it.'
              )}
        </p>
      )}
      {assessment.model.warning && assessment.model.status === 'completed' && (
        <p className="assessment-model-note" role="status">
          {t('部分复核未完成：', 'Some review steps were incomplete: ')}
          {assessment.model.warning}
        </p>
      )}
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
      {assessment.narrative && (
        <div className="assessment-priorities">
          {judgmentList(t('主要风险', 'Main risks'), assessment.narrative.risks)}
          {judgmentList(t('下一步核查', 'Next checks'), assessment.narrative.actions)}
        </div>
      )}
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
      <details className="assessment-details assessment-methodology">
        <summary>
          <ChevronDown size={14} />
          {t('评级方法与阈值', 'Grade methodology and thresholds')}
        </summary>
        {ASSESSMENT_METHODOLOGY.map((paragraph, index) => (
          <p key={index}>{t(...paragraph)}</p>
        ))}
      </details>
      <p className="assessment-footnote">
        {t(
          '这是所选年度的公开数据分析，不是评级机构的信用等级。历史货币资金不代表当前可用现金。',
          'This analysis uses selected-year public data and is not a credit-agency rating. Historical monetary funds are not current available cash.'
        )}
      </p>
      {selected && (
        <Dialog
          title={selected.title}
          onClose={() => setSelected(null)}
          variant="drawer"
          className="assessment-evidence-drawer"
        >
          <p className="assessment-drawer-judgment">{judgmentText(selected.judgment)}</p>
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
                      {evidence.page
                        ? ' · ' + t('第 ', 'Page ') + evidence.page + t(' 页', '')
                        : ''}
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
      )}
    </section>
  );
}
