import type { ReactNode } from 'react';
import { ArrowUpRight, ChevronDown, FileSearch, Printer } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import type {
  AssessmentEvidence,
  AssessmentJudgment,
  AssessmentMetric,
  AssessmentStatus,
  AssessmentText,
} from '../shared/company-assessment';
import type { CompanyReadingBasis } from '../shared/company-analysis';
import {
  deriveCompanyReportDocument,
  type CompanyReportDocumentItem,
} from '../shared/company-report-document';
import { reportSummarySegments } from '../shared/company-report-summary';
import {
  OPEN_COMPANY_ASSISTANT_EVENT,
  type OpenCompanyAssistantDetail,
} from '../shared/company-navigation';
import { assessmentSourceHref, knownSourcePage } from '../shared/source-excerpt-focus';
import { useApp } from './context';
import { date, money } from './format';
import { CompanyReportProfitCashChart, CompanyReportRadar } from './CompanyReportCharts';
import { CompanyPageIndex } from './CompanyPageIndex';
import './company-report-document.css';
import './company-pro-report.css';

const statusLabels: Record<AssessmentStatus, AssessmentText> = {
  strong: ['较强', 'Strong'],
  balanced: ['中等', 'Balanced'],
  pressure: ['承压', 'Under pressure'],
  'high-pressure': ['显著承压', 'High pressure'],
  unknown: ['数据不足', 'Insufficient data'],
  conflict: ['来源冲突', 'Source conflict'],
};

function exactMetric(metric: AssessmentMetric, locale: 'zh-Hans' | 'en') {
  if (metric.status !== 'available' || metric.value === null) return '—';
  if (metric.unit === 'CNY') return `${money(metric.value, locale, false)} CNY`;
  if (metric.unit === 'percent') return `${metric.value}%`;
  if (metric.unit === 'percentage-points')
    return metric.value + (locale === 'en' ? ' percentage points' : ' 个百分点');
  if (metric.unit === 'times') return `${metric.value}×`;
  return metric.value;
}

function readingMetric(metric: AssessmentMetric, locale: 'zh-Hans' | 'en') {
  if (metric.status !== 'available' || metric.value === null)
    return {
      value:
        metric.status === 'conflict'
          ? locale === 'en'
            ? 'Conflict'
            : '来源冲突'
          : metric.status === 'not-applicable'
            ? locale === 'en'
              ? 'N/A'
              : '不适用'
            : locale === 'en'
              ? 'Unavailable'
              : '未取得',
      unit: '',
    };
  if (metric.unit === 'CNY') {
    const compact = money(metric.value, locale);
    if (locale === 'en') {
      const suffix = compact.match(/[bmk]$/)?.[0];
      return {
        value: suffix ? compact.slice(0, -1) : compact,
        unit: `${suffix === 'b' ? 'bn ' : suffix ? `${suffix} ` : ''}CNY`,
      };
    }
    const [value, scale = ''] = compact.split(' ');
    return { value, unit: `${scale}元` };
  }
  return { value: metric.display[locale === 'en' ? 1 : 0], unit: '' };
}

/** A complete reading document derived from one owning run and its saved report generation. */
export function CompanyReportDocument({
  run,
  basis = 'consolidated',
  onInspect,
  disabled = false,
  progress,
}: {
  run: CompanyResearchRun;
  basis?: CompanyReadingBasis;
  onInspect?: (judgment: AssessmentJudgment) => void;
  disabled?: boolean;
  progress?: ReactNode;
}) {
  const { t, locale, user } = useApp();
  const document = deriveCompanyReportDocument(run, basis);
  const language = locale === 'en' ? 'en' : 'zh';
  const identityMatches =
    run.identity?.securityCode === run.input.securityCode && run.identity.orgId === run.input.orgId;
  const reportName = identityMatches
    ? run.identity!.companyName || run.identity!.shortName || run.input.securityCode
    : run.input.securityCode;
  const sourceNumbers = new Map(document.references.map((source, index) => [source.id, index + 1]));
  const metricMap = new Map(document.facts.map((metric) => [metric.id, metric]));
  const saved = Boolean(
    document.binding?.reportGeneratedAt &&
      document.binding.reportGeneratedAt === run.assessment?.generatedAt
  );
  const canInspect = saved && Boolean(onInspect);
  const canAsk = Boolean(user && !disabled && saved);
  const questions = saved ? document.questions : [];
  const ask = (question: CompanyReportDocumentItem) => {
    if (
      !canAsk ||
      !user ||
      !document.binding?.reportGeneratedAt ||
      question.binding.reportGeneratedAt !== document.binding.reportGeneratedAt ||
      question.binding.year !== run.input.year ||
      question.binding.runId !== run.id
    )
      return;
    const detail: OpenCompanyAssistantDetail = {
      owner: user.id,
      runId: document.binding.runId,
      question: question.text[language],
      basis,
      reportGeneratedAt: document.binding.reportGeneratedAt,
    };
    window.dispatchEvent(new CustomEvent(OPEN_COMPANY_ASSISTANT_EVENT, { detail }));
  };
  const referenceIds = (judgment: AssessmentJudgment) =>
    [
      ...new Set([
        ...judgment.evidenceIds,
        ...judgment.metricIds.flatMap((id) => metricMap.get(id)?.evidenceIds || []),
      ]),
    ].filter((id) => sourceNumbers.has(id));
  const openReference = (number: number) => {
    const reference = window.document.getElementById(`company-report-reference-${number}`);
    for (let node = reference?.parentElement; node; node = node.parentElement)
      if (node instanceof HTMLDetailsElement) node.open = true;
  };
  const citations = (judgment: AssessmentJudgment) => {
    const ids = referenceIds(judgment);
    return ids.length ? (
      <span className="report-document-citations" aria-label={t('对应来源', 'Supporting sources')}>
        {ids.map((id) => {
          const number = sourceNumbers.get(id)!;
          return (
            <a
              key={id}
              href={`#company-report-reference-${number}`}
              onClick={() => openReference(number)}
              aria-label={t('查看来源 ', 'View source ') + number}
            >
              [{number}]
            </a>
          );
        })}
      </span>
    ) : null;
  };
  const evidence = (judgment: AssessmentJudgment) => (
    <div className="report-document-evidence">
      {citations(judgment)}
      {canInspect && (judgment.metricIds.length > 0 || judgment.evidenceIds.length > 0) && (
        <button
          type="button"
          className="report-document-inspect"
          onClick={() => onInspect?.(judgment)}
          aria-label={t('核对这条判断的依据', 'Inspect the evidence for this judgment')}
        >
          <FileSearch size={13} aria-hidden="true" />
          {t('核对依据', 'Inspect evidence')}
        </button>
      )}
    </div>
  );
  const renderItems = (items: readonly CompanyReportDocumentItem[]) => (
    <ol className="report-document-items">
      {items.map((item) => (
        <li
          key={item.id}
          data-item-id={item.id}
          data-provenance={item.provenance}
          data-metric-ids={item.metricIds.join(' ')}
          data-evidence-ids={item.evidenceIds.join(' ')}
        >
          <p>{item.text[language]}</p>
          {evidence(item)}
        </li>
      ))}
    </ol>
  );
  const section = (id: string, number: string, title: string, content: ReactNode) => (
    <section id={id} className="report-document-section" aria-labelledby={`${id}-heading`}>
      <div className="report-document-section-heading">
        <span aria-hidden="true">{number}</span>
        <h3 id={`${id}-heading`}>{title}</h3>
      </div>
      {content}
    </section>
  );
  const sourceScope = (source: AssessmentEvidence) => {
    if (source.sourceQuality === 'opinion')
      return t('公开讨论 · 未核实观点', 'Public discussion · unverified opinion');
    if (source.kind === 'news')
      return source.sourceQuality === 'headline'
        ? t('媒体标题线索', 'Media headline lead')
        : t('媒体报道节选', 'Media report excerpt');
    if (source.sourceQuality === 'headline')
      return t('标题线索 · 正文未取得', 'Headline lead · full text unavailable');
    if (source.sourceQuality === 'excerpt') return t('已取得原文节选', 'Retrieved source excerpt');
    return t('公开网页字段', 'Public web fields');
  };
  const grade = document.provisionalRating?.grade || document.savedGrade;
  const fingerprint = (item: CompanyReportDocumentItem) =>
    item.text.zh.trim() + '\n' + item.text.en.trim();
  const separatelyShown = new Set([...document.risks, ...document.strengths].map(fingerprint));
  const findings = document.findings.filter((item) => !separatelyShown.has(fingerprint(item)));
  const findingsShown = new Set(findings.map(fingerprint));
  const observations = document.observations.filter(
    (item) => !findingsShown.has(fingerprint(item))
  );
  const summaryText = document.summary?.text[language] || '';
  const headlineText = document.headline?.text[language] || '';
  const summarySegments = reportSummarySegments(summaryText, document.summaryHighlights[language]);
  const leadFactIds = [`${run.input.year}-netProfit`, `${run.input.year}-ocf`, 'cash-profit'];
  const leadFacts = leadFactIds
    .map((id) => document.facts.find((metric) => metric.id === id))
    .filter((metric): metric is AssessmentMetric => Boolean(metric));
  const coreIds = ['profitability', 'cash', 'solvency', 'workingCapital'] as const;
  const coreDimensions = coreIds.flatMap((id) =>
    document.dimensions.filter((dimension) => dimension.id === id)
  );
  const covered = coreDimensions.filter(
    (dimension) => dimension.score !== null && !['unknown', 'conflict'].includes(dimension.status)
  ).length;
  const previewItems = [...findings, ...document.strengths, ...document.risks, ...observations]
    .filter(
      (item, index, items) =>
        items.findIndex((other) => fingerprint(other) === fingerprint(item)) === index
    )
    .slice(0, 3);
  const openSection = (id: string) => {
    const target = window.document.getElementById(id);
    for (let node = target; node; node = node.parentElement)
      if (node instanceof HTMLDetailsElement) node.open = true;
  };
  const gradeLabels: Record<string, AssessmentText> = {
    A: ['较强', 'Strong'],
    B: ['中等', 'Balanced'],
    C: ['承压', 'Under pressure'],
    D: ['显著承压', 'High pressure'],
    NR: ['暂不评级', 'Not rated'],
  };

  return (
    <article
      id="company-report-document"
      className="company-report-document"
      aria-labelledby="company-report-document-heading"
      data-mode={document.mode}
      data-snapshot={document.snapshot}
      data-generated-at={document.generatedAt || undefined}
      data-saved-grade={document.savedGrade || undefined}
    >
      <div className="report-pro-layout">
        <div className="report-pro-main">
          <header className="report-document-header">
            <div>
              <p className="report-document-kicker">
                {t('公司分析报告', 'Company analysis report')}
                <span>
                  {document.mode === 'model'
                    ? t('AI 分析', 'AI analysis')
                    : document.mode === 'rules'
                      ? t('规则结果', 'Rule results')
                      : document.mode === 'observations'
                        ? t('已取得资料', 'Acquired information')
                        : t('尚未形成报告', 'Report not available')}
                </span>
              </p>
              <h2 id="company-report-document-heading">{reportName}</h2>
              <p className="report-document-scope">
                {run.input.securityCode} · {run.input.year} {t('年报', 'annual report')} ·{' '}
                {t('合并分析口径', 'Consolidated analysis scope')} · CNY
              </p>
            </div>
            <button
              type="button"
              className="report-document-print"
              onClick={() => window.print()}
              disabled={document.mode === 'none'}
            >
              <Printer size={14} aria-hidden="true" />
              {t('打印报告', 'Print report')}
            </button>
          </header>
          <dl className="report-document-dates">
            <div>
              <dt>{t('资料快照', 'Data snapshot')}</dt>
              <dd>{document.snapshotFetchedAt ? date(document.snapshotFetchedAt, locale) : '—'}</dd>
            </div>
            <div>
              <dt>{t('报告生成', 'Report generated')}</dt>
              <dd>
                {document.generatedAt
                  ? date(document.generatedAt, locale)
                  : t('尚未生成', 'Not generated')}
              </dd>
            </div>
            {basis === 'parent' && (
              <div>
                <dt>{t('数据页利润口径', 'Data-page profit basis')}</dt>
                <dd>{t('归母净利润', 'Profit attributable to owners')}</dd>
              </div>
            )}
          </dl>
          {progress}
          {document.warnings.length > 0 && (
            <ul className="report-document-warnings">
              {document.warnings.map((warning, index) => (
                <li key={index}>{t(...warning)}</li>
              ))}
            </ul>
          )}
          {document.mode === 'none' ? (
            <p className="report-document-empty" role="status">
              {document.snapshot === 'mismatch'
                ? t(
                    '主体或年度与报告不一致，当前不展示判断。',
                    'The issuer or annual scope does not match this report; judgments are withheld.'
                  )
                : document.withheldReason === 'unsupported'
                  ? t(
                      '当前分析支持 A 股上市主体，已保存的其他市场原件仍可从原件入口查看。',
                      'Current analysis supports A-share issuers. Saved originals for other markets remain available through the originals view.'
                    )
                  : document.withheldReason === 'information-gap'
                    ? t(
                        '未匹配到支持的上市主体，尚未形成可引用的公司报告。',
                        'No supported listed entity matched, so a citable company report is not available.'
                      )
                    : document.progress.state === 'running'
                      ? t(
                          '报告尚未形成，已取得的财务数据仍可在数据页查看。',
                          'The report is not ready. Acquired financial data remains available on the data page.'
                        )
                      : t(
                          '当前还没有可展示的公司分析报告。',
                          'No company analysis report is available for this scope.'
                        )}
            </p>
          ) : (
            <>
              {section(
                'company-report-summary',
                '01',
                t('核心判断', 'Core judgment'),
                <div className="report-document-summary">
                  <div>
                    {headlineText && headlineText !== summaryText && document.headline && (
                      <p className="report-document-headline">
                        {headlineText} {citations(document.headline)}
                      </p>
                    )}
                    {document.summary ? (
                      <>
                        <p className="report-document-lead">
                          {summarySegments.map((segment, index) =>
                            segment.highlight ? (
                              <strong key={index}>{segment.text}</strong>
                            ) : (
                              <span key={index}>{segment.text}</span>
                            )
                          )}
                        </p>
                        {evidence(document.summary)}
                      </>
                    ) : document.headline ? (
                      <>
                        {!headlineText && (
                          <p className="report-document-lead">{document.headline.text[language]}</p>
                        )}
                        {evidence(document.headline)}
                      </>
                    ) : (
                      <p>
                        {t(
                          '暂未形成综合判断，下面保留已取得的事实。',
                          'A synthesis is not yet available; acquired facts are retained below.'
                        )}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {leadFacts.length > 0 && (
                <dl className="report-document-figures">
                  {leadFacts.map((metric) => {
                    const display = readingMetric(metric, locale);
                    return (
                      <div key={metric.id}>
                        <dt>{t(...metric.label)}</dt>
                        <dd title={exactMetric(metric, locale)} data-status={metric.status}>
                          {display.value}
                          {display.unit && <small>{display.unit}</small>}
                        </dd>
                        {citations({
                          text: { zh: '', en: '' },
                          metricIds: [metric.id],
                          evidenceIds: metric.evidenceIds,
                        })}
                      </div>
                    );
                  })}
                </dl>
              )}
              <CompanyReportProfitCashChart facts={document.facts} year={run.input.year}>
                <a
                  className="text-link"
                  href="#company-report-metrics"
                  onClick={() => openSection('company-report-metrics')}
                >
                  {t('查看数据与计算', 'View data and calculations')}{' '}
                  <ArrowUpRight size={12} aria-hidden="true" />
                </a>
              </CompanyReportProfitCashChart>
              {previewItems.length > 0 && (
                <section className="report-pro-insights" aria-label={t('关键发现', 'Key findings')}>
                  <ol>
                    {previewItems.map((item, index) => (
                      <li key={item.id}>
                        <span className="report-pro-insight-number" aria-hidden="true">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <p>{item.text[language]}</p>
                          {evidence(item)}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              <details className="report-pro-analysis" id="company-report-analysis">
                <summary>
                  <span>{t('完整分析与核查建议', 'Full analysis and next checks')}</span>
                  <ChevronDown size={14} aria-hidden="true" />
                </summary>
                <div>
                  {(findings.length > 0 ||
                    document.strengths.length > 0 ||
                    observations.length > 0) &&
                    section(
                      'company-report-findings',
                      '02',
                      t('已确认的重点', 'Supported findings'),
                      <>
                        {renderItems(findings)}
                        {document.strengths.length > 0 && (
                          <div className="report-document-subsection">
                            <h4>{t('经营优势', 'Strengths')}</h4>
                            {renderItems(document.strengths)}
                          </div>
                        )}
                        {observations.length > 0 && renderItems(observations)}
                      </>
                    )}
                  {document.risks.length > 0 &&
                    section(
                      'company-report-risks',
                      '03',
                      t('需要留意的风险', 'Risks to examine'),
                      renderItems(document.risks)
                    )}
                  {document.unknowns.length > 0 &&
                    section(
                      'company-report-unknowns',
                      '04',
                      t('仍未确认的事项', 'Unresolved questions'),
                      renderItems(document.unknowns)
                    )}
                  {document.dimensions.length > 0 &&
                    section(
                      'company-report-dimensions',
                      '05',
                      t('逐项分析', 'Analysis by dimension'),
                      <div className="report-document-dimensions">
                        {document.dimensions.map((dimension) => (
                          <details
                            key={dimension.id}
                            id={`company-report-dimension-${dimension.id}`}
                            className="report-document-dimension"
                            data-dimension={dimension.id}
                          >
                            <summary>
                              <span>{t(...dimension.label)}</span>
                              <small data-status={dimension.status}>
                                {t(...statusLabels[dimension.status])}
                              </small>
                              <ChevronDown size={14} aria-hidden="true" />
                            </summary>
                            <div className="report-document-dimension-body">
                              <p>{dimension.judgment.text[language]}</p>
                              {evidence(dimension.judgment)}
                              {dimension.score !== null && (
                                <small>
                                  {t('维度分 ', 'Dimension score ') + dimension.score.toFixed(2)}
                                </small>
                              )}
                            </div>
                          </details>
                        ))}
                      </div>
                    )}
                  {document.actions.length > 0 &&
                    section(
                      'company-report-actions',
                      '06',
                      t('下一步核查', 'Next checks'),
                      renderItems(document.actions)
                    )}
                  {questions.length > 0 && (
                    <div className="report-document-followups">
                      <h4>{t('继续追问这份报告', 'Ask about this report')}</h4>
                      <div
                        role="group"
                        aria-label={t('报告推荐问题', 'Suggested report questions')}
                      >
                        {questions.map((question) => (
                          <button
                            type="button"
                            key={question.id}
                            disabled={!canAsk}
                            onClick={() => ask(question)}
                            data-question={question.text[language]}
                            data-run-id={question.binding.runId}
                            data-year={question.binding.year}
                            data-basis={basis}
                            data-report-generated-at={
                              question.binding.reportGeneratedAt || undefined
                            }
                          >
                            <span>{question.text[language]}</span>
                            <ArrowUpRight size={13} aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {document.changeConditions.length > 0 &&
                    section(
                      'company-report-changes',
                      '07',
                      t('什么会改变判断', 'What would change the judgment'),
                      renderItems(document.changeConditions)
                    )}
                  {document.facts.length > 0 && (
                    <details className="report-document-metrics" id="company-report-metrics">
                      <summary>
                        <span>{t('财务指标与计算依据', 'Financial metrics and calculations')}</span>
                        <ChevronDown size={14} aria-hidden="true" />
                      </summary>
                      <div className="report-document-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>{t('指标', 'Metric')}</th>
                              <th>{t('精确值', 'Exact value')}</th>
                              <th>{t('计算与口径', 'Calculation and scope')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {document.facts.map((metric) => (
                              <tr key={metric.id}>
                                <th scope="row">{t(...metric.label)}</th>
                                <td>
                                  {exactMetric(metric, locale)}
                                  {metric.status !== 'available' && (
                                    <small>
                                      {metric.status === 'conflict'
                                        ? t('来源冲突', 'Source conflict')
                                        : metric.status === 'not-applicable'
                                          ? t('不适用', 'Not applicable')
                                          : t('数据不足', 'Insufficient data')}
                                    </small>
                                  )}
                                </td>
                                <td>
                                  {t(...metric.formula)}
                                  {citations({
                                    text: { zh: '', en: '' },
                                    metricIds: [metric.id],
                                    evidenceIds: metric.evidenceIds,
                                  })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                  {section(
                    'company-report-references',
                    '08',
                    t('本报告的来源', 'Report references'),
                    document.references.length > 0 ? (
                      <>
                        <p className="report-document-reference-note">
                          {t(
                            '编号对应各项判断的引用，材料范围和原文节选保留如下。',
                            'Numbers link each finding to its sources. Their scope and retrieved excerpts are retained below.'
                          )}
                        </p>
                        <details className="report-document-reference-details">
                          <summary>
                            <span>
                              {document.references.length} {t('份来源记录', 'source records')}
                            </span>
                            <ChevronDown size={14} aria-hidden="true" />
                          </summary>
                          <ol className="report-document-references">
                            {document.references.map((source, index) => {
                              const page = knownSourcePage(source.page);
                              const href = assessmentSourceHref(source.url, page);
                              return (
                                <li key={source.id}>
                                  <article
                                    id={`company-report-reference-${index + 1}`}
                                    tabIndex={-1}
                                    data-source-id={source.id}
                                  >
                                    <h4>
                                      <span>[{index + 1}]</span> {source.label}
                                    </h4>
                                    <p className="report-document-reference-meta">
                                      {source.period && <span>{source.period}</span>}
                                      <span>{sourceScope(source)}</span>
                                      {page && (
                                        <span>{t('第 ', 'Page ') + page + t(' 页', '')}</span>
                                      )}
                                    </p>
                                    {source.quote && <blockquote>{source.quote}</blockquote>}
                                    {href ? (
                                      <a
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="report-document-source-url"
                                      >
                                        {href}
                                        <ArrowUpRight size={12} aria-hidden="true" />
                                      </a>
                                    ) : (
                                      <p className="report-document-reference-meta">
                                        {t(
                                          '未记录可用的公开原文链接。',
                                          'A usable public source link was not recorded.'
                                        )}
                                      </p>
                                    )}
                                  </article>
                                </li>
                              );
                            })}
                          </ol>
                        </details>
                      </>
                    ) : (
                      <p className="report-document-reference-note">
                        {t(
                          '本报告尚未取得可引用的来源记录。',
                          'No citable source record has been acquired for this report.'
                        )}
                      </p>
                    )
                  )}
                </div>
              </details>
            </>
          )}
        </div>
        {document.mode !== 'none' && (
          <aside
            className="report-pro-rail"
            aria-label={t('评级与分析依据', 'Grade and analytical evidence')}
          >
            <section className="report-pro-grade">
              <h3>{t('财务筛查评级', 'Financial screening grade')}</h3>
              <div className="report-document-rating" data-grade={grade || 'NR'}>
                <span>
                  {document.provisionalRating
                    ? t('暂定评级', 'Provisional grade')
                    : grade
                      ? t('所选年度合并财务', 'Selected-year consolidated financials')
                      : t('尚未形成保存评级', 'No saved grade yet')}
                </span>
                <div className="report-pro-grade-value">
                  <strong>{!grade || grade === 'NR' ? t('未评级', 'Unrated') : grade}</strong>
                  {grade && grade !== 'NR' && <span>{t(...gradeLabels[grade])}</span>}
                </div>
                <small>
                  {covered}/4 {t('个核心维度有依据', 'core dimensions supported')}
                </small>
                {document.provisionalRating ? (
                  <small>{t('完整评级：未评级', 'Complete grade: unrated')}</small>
                ) : document.score !== null && grade && grade !== 'NR' ? (
                  <small>
                    {t('规则均分', 'Rule mean')} {document.score.toFixed(2)} / 100
                  </small>
                ) : null}
              </div>
              {saved &&
                run.assessment?.ratingConstraints?.map((constraint, index) => (
                  <p className="report-pro-grade-constraint" key={index}>
                    {t(...constraint)}
                  </p>
                ))}
              <a className="text-link" href="/docs/methodology">
                {t('评级方法', 'Grade methodology')} <ArrowUpRight size={12} aria-hidden="true" />
              </a>
            </section>
            {coreDimensions.length > 0 && (
              <>
                <CompanyReportRadar dimensions={coreDimensions} />
                <div className="report-pro-dimension-evidence">
                  {coreDimensions.map((dimension) => {
                    const metrics = dimension.judgment.metricIds
                      .map((id) => metricMap.get(id))
                      .filter((metric): metric is AssessmentMetric =>
                        Boolean(metric && metric.status === 'available')
                      )
                      .slice(0, 2);
                    return (
                      <div key={dimension.id}>
                        <div className="report-pro-dimension-label">
                          <h4>{t(...dimension.label)}</h4>
                          <span data-status={dimension.status}>
                            {t(...statusLabels[dimension.status])}
                          </span>
                        </div>
                        <p>
                          {metrics.length
                            ? metrics
                                .map((metric) => {
                                  const display = readingMetric(metric, locale);
                                  return `${t(...metric.label)} ${display.value} ${display.unit}`.trim();
                                })
                                .join(' · ')
                            : t(
                                '关键字段尚未取得或存在冲突',
                                'Key fields are missing or conflicting'
                              )}
                        </p>
                        <a
                          href={`#company-report-dimension-${dimension.id}`}
                          className="report-pro-dimension-link"
                          onClick={() => openSection(`company-report-dimension-${dimension.id}`)}
                        >
                          {t('核对依据', 'Inspect evidence')}
                        </a>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <div className="report-pro-contents">
              <h4>{t('本页目录', 'Report contents')}</h4>
              <CompanyPageIndex
                variant="rail"
                anchors={[
                  ['company-report-summary', '核心判断', 'Core judgment'],
                  ['company-report-profit-cash', '财务表现', 'Financial performance'],
                  ['company-report-analysis', '分析依据', 'Analytical evidence'],
                  ...(document.actions.length
                    ? [['company-report-actions', '核查建议', 'Next checks'] as const]
                    : []),
                  ['company-report-references', '来源对照', 'References'],
                ]}
              />
            </div>
          </aside>
        )}
      </div>
    </article>
  );
}
