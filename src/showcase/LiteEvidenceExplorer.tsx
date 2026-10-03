import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  FileSearch,
  MessageCircle,
  ScanLine,
} from 'lucide-react';
import type { CompanyResearchRun } from '../../shared/contracts';
import type {
  AssessmentEvidence,
  AssessmentJudgment,
  AssessmentStatus,
} from '../../shared/company-assessment';
import type { CompanyReadingBasis } from '../../shared/company-analysis';
import {
  deriveCompanyReportDocument,
  type CompanyReportDocumentBinding,
} from '../../shared/company-report-document';
import {
  deriveCompanyReportLinks,
  filterCompanyReportSources,
  type CompanyReportLinks,
} from '../../shared/company-report-links';
import { assessmentSourceHref, knownSourcePage } from '../../shared/source-excerpt-focus';
import { useApp } from '../context';
import { date } from '../format';
import { LiteMetricChips } from './LiteMetricChips';
import './lite-evidence-explorer.css';

export interface LiteEvidenceExplorerProps {
  run: CompanyResearchRun;
  onInspect?: (judgment: AssessmentJudgment) => void;
  disabled?: boolean;
  basis?: CompanyReadingBasis;
  /** The containing dossier can print judgments once and use this component for its source appendix. */
  printJudgments?: boolean;
  /** A local deep link; every scope field must match this saved document. */
  initialSelection?: LiteEvidenceInitialSelection;
}

export interface LiteEvidenceInitialSelection {
  binding: CompanyReportDocumentBinding;
  paragraphId?: string;
  sourceId?: string;
}

/** Resolve recorded IDs only; an unrelated source never becomes support for a finding. */
export function resolveLiteEvidenceSelection(
  links: CompanyReportLinks,
  selection: LiteEvidenceInitialSelection | undefined
): {
  paragraphId: string | null;
  sourceId: string | null;
  archiveSourceId: string | null;
  page: number;
} | null {
  const own = links.binding;
  const requested = selection?.binding;
  if (!own || !requested || !selection || (!selection.paragraphId && !selection.sourceId))
    return null;
  if (
    own.runId !== requested.runId ||
    own.securityCode !== requested.securityCode ||
    own.orgId !== requested.orgId ||
    own.year !== requested.year ||
    own.basis !== requested.basis ||
    own.snapshotFetchedAt !== requested.snapshotFetchedAt ||
    own.reportGeneratedAt !== requested.reportGeneratedAt
  )
    return null;
  const source = selection.sourceId
    ? links.sources.find((entry) => entry.id === selection.sourceId)
    : undefined;
  if (selection.sourceId && !source) return null;
  const paragraph = selection.paragraphId
    ? links.paragraphs.find((entry) => entry.id === selection.paragraphId)
    : source &&
      links.paragraphs.find(
        (entry) => source.paragraphIds.includes(entry.id) && entry.sourceIds.includes(source.id)
      );
  if (selection.paragraphId && !paragraph) return null;
  if (paragraph && source && !paragraph.sourceIds.includes(source.id)) return null;
  const ownSource =
    source || (paragraph && links.sources.find((entry) => paragraph.sourceIds.includes(entry.id)));
  return {
    paragraphId: paragraph?.id || null,
    sourceId: paragraph ? ownSource?.id || null : null,
    archiveSourceId: ownSource?.id || null,
    page: ownSource
      ? Math.floor(links.sources.findIndex((entry) => entry.id === ownSource.id) / 6) + 1
      : 1,
  };
}

const kindNames: Record<AssessmentEvidence['kind'], readonly [string, string]> = {
  financial: ['财务', 'Financials'],
  industry: ['同行', 'Peers'],
  disclosure: ['公告', 'Disclosures'],
  news: ['新闻', 'News'],
  discussion: ['讨论', 'Discussion'],
  profile: ['主体', 'Identity'],
};
const dimensionQuestions: Record<string, readonly [string, string]> = {
  profitability: ['生意赚到钱了吗？', 'Is the business profitable?'],
  cash: ['利润变成现金了吗？', 'Does profit turn into cash?'],
  solvency: ['短期偿付有什么压力？', 'Where is repayment pressure?'],
  workingCapital: ['资金被什么占用了？', 'Where is working capital tied up?'],
  industry: ['放在同行里怎么看？', 'How does it compare with peers?'],
  events: ['公开事件透露了什么？', 'What do public events tell us?'],
};
const statusNames: Record<AssessmentStatus, readonly [string, string]> = {
  strong: ['较强', 'Strong'],
  balanced: ['中等', 'Balanced'],
  pressure: ['承压', 'Under pressure'],
  'high-pressure': ['显著承压', 'High pressure'],
  unknown: ['资料不足', 'Insufficient data'],
  conflict: ['来源冲突', 'Source conflict'],
};

/** A local reading surface. It never retrieves data, generates a report, or sends a question. */
export function LiteEvidenceExplorer({
  run,
  onInspect,
  disabled = false,
  basis = 'consolidated',
  printJudgments = true,
  initialSelection,
}: LiteEvidenceExplorerProps) {
  const { t, locale, user } = useApp();
  const language = locale === 'en' ? 'en' : 'zh';
  const index = locale === 'en' ? 1 : 0;
  const prefix = useId().replace(/:/g, '');
  const document = useMemo(() => deriveCompanyReportDocument(run, basis), [run, basis]);
  const links = useMemo(() => deriveCompanyReportLinks(document), [document]);
  const generation = JSON.stringify(document.binding || { runId: run.id, withheld: true });
  const scope = `${user?.id || 'anonymous'}:${generation}`;
  const initial = resolveLiteEvidenceSelection(links, initialSelection);
  const requestKey = JSON.stringify([initialSelection || null, initial]);
  const defaults = {
    scope,
    requestKey,
    paragraphId: initial?.paragraphId || null,
    sourceId: initial?.sourceId || null,
    archiveSourceId: initial?.archiveSourceId || null,
    kind: 'all' as AssessmentEvidence['kind'] | 'all',
    page: initial?.page || 1,
  };
  const [localSelection, setLocalSelection] = useState(defaults);
  // Scope fencing applies during render, before an effect can expose an old selection.
  const selection =
    localSelection.scope === scope && localSelection.requestKey === requestKey
      ? localSelection
      : defaults;
  const { paragraphId: selectedId, sourceId: selectedSourceId, kind, page } = selection;
  const setSelectedSourceId = (sourceId: string | null) =>
    setLocalSelection({ ...selection, sourceId });
  const setKind = (kind: AssessmentEvidence['kind'] | 'all') =>
    setLocalSelection({ ...selection, kind, page: 1, archiveSourceId: null });
  const setPage = (page: number) =>
    setLocalSelection({ ...selection, page, archiveSourceId: null });
  const stageRef = useRef<HTMLDivElement>(null);
  const archiveRef = useRef<HTMLElement>(null);

  // Reading choices have no meaning after an owner/run/generation change.
  useEffect(() => {
    if (!initial) return;
    const frame = requestAnimationFrame(() => {
      const target = initial.paragraphId
        ? stageRef.current?.querySelector<HTMLElement>('h3')
        : [...(archiveRef.current?.querySelectorAll<HTMLElement>('details[data-source-id]') || [])]
            .find((element) => element.dataset.sourceId === initial.archiveSourceId)
            ?.querySelector<HTMLElement>('summary');
      target?.scrollIntoView({ block: 'center', behavior: 'auto' });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [scope, requestKey]);

  const dimensionMap = new Map(document.dimensions.map((value) => [value.judgment.id, value]));
  const unknownIds = new Set(document.unknowns.map((value) => value.id));
  const deck = links.paragraphs
    .filter((paragraph) => {
      const dimension = dimensionMap.get(paragraph.id);
      return (
        !unknownIds.has(paragraph.id) &&
        !['unknown', 'conflict'].includes(dimension?.status || '') &&
        paragraph.groups.some((group) =>
          ['finding', 'risk', 'strength', 'observation', 'dimension'].includes(group)
        ) &&
        (paragraph.metricIds.length > 0 || paragraph.sourceIds.length > 0)
      );
    })
    .sort((left, right) => {
      const priority = (groups: readonly string[]) =>
        groups.includes('risk')
          ? 0
          : groups.includes('finding')
            ? 1
            : groups.includes('dimension')
              ? 2
              : 3;
      return priority(left.groups) - priority(right.groups);
    });
  const active = links.paragraphs.find((value) => value.id === selectedId) || deck[0];
  const activeDimension = active ? dimensionMap.get(active.id) : undefined;
  const activeSources = active
    ? links.sources.filter((source) => active.sourceIds.includes(source.id))
    : [];
  const selectedSource =
    activeSources.find((source) => source.id === selectedSourceId) || activeSources[0];
  const archive = filterCompanyReportSources(links, { kind, page, pageSize: 6 });
  const saved = Boolean(
    document.binding?.reportGeneratedAt &&
      document.binding.reportGeneratedAt === run.assessment?.generatedAt
  );
  const safeInspect =
    saved && onInspect
      ? (judgment: AssessmentJudgment) => {
          if (!disabled) onInspect(judgment);
        }
      : undefined;
  const nextItems = document.questions.length ? document.questions : document.actions;
  const questionTitle = (paragraph: (typeof links.paragraphs)[number]) => {
    const dimension = dimensionMap.get(paragraph.id);
    if (dimension) return dimensionQuestions[dimension.id]?.[index] || dimension.label[index];
    if (paragraph.groups.includes('risk'))
      return t('这条风险信号从哪里来？', 'What supports this risk signal?');
    if (paragraph.groups.includes('strength'))
      return t('这条积极信号从哪里来？', 'What supports this positive signal?');
    if (paragraph.groups.includes('unknown'))
      return t('哪里还需要核实？', 'What still needs verification?');
    if (paragraph.groups.includes('action'))
      return t('下一步如何核查？', 'What should be checked next?');
    if (paragraph.groups.includes('condition'))
      return t('什么会改变判断？', 'What would change the judgment?');
    return t('这条判断有哪些依据？', 'What supports this finding?');
  };
  const selectParagraph = (id: string) => {
    setLocalSelection({ ...selection, paragraphId: id, sourceId: null, archiveSourceId: null });
  };
  const sourceScope = (source: AssessmentEvidence) => {
    if (source.sourceQuality === 'opinion')
      return t('公开讨论 · 未核实观点', 'Public discussion · unverified opinion');
    if (source.sourceQuality === 'headline')
      return t('标题线索 · 正文未取得', 'Headline lead · full text unavailable');
    if (source.sourceQuality === 'excerpt') return t('已取得原文节选', 'Retrieved source excerpt');
    return t('公开网页字段', 'Public web fields');
  };
  const sourceBody = (sourceLink: (typeof links.sources)[number], expanded = false) => {
    const source = sourceLink.source;
    const href = assessmentSourceHref(source.url, source.page);
    const recordedPage = knownSourcePage(source.page);
    const citedParagraphs = links.paragraphs.filter((paragraph) =>
      sourceLink.paragraphIds.includes(paragraph.id)
    );
    return (
      <div className="lite-evidence-source-content" data-source-id={source.id}>
        <div className="lite-evidence-source-tags">
          <span>{kindNames[source.kind][index]}</span>
          <span>{sourceScope(source)}</span>
          {source.period && <span>{source.period}</span>}
          {recordedPage !== undefined && (
            <span>
              {t('第 ', 'Page ')}
              {recordedPage}
              {t(' 页', '')}
            </span>
          )}
        </div>
        {source.quote && source.sourceQuality !== 'headline' ? (
          <blockquote>{source.quote}</blockquote>
        ) : (
          <p className="lite-evidence-empty-quote">
            {source.sourceQuality === 'headline'
              ? t(
                  '已记录标题线索，尚未取得可引用正文。',
                  'A headline is recorded; quotable body text has not been acquired.'
                )
              : t(
                  '本项未保存原文节选，可查看已记录的公开来源。',
                  'No excerpt was saved for this item. The recorded public source is available below.'
                )}
          </p>
        )}
        {href && (
          <a
            className="lite-evidence-source-link"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('打开记录的来源', 'Open the recorded source')}
            <ArrowUpRight size={15} aria-hidden="true" />
            <span className="lite-evidence-print-url">{href}</span>
          </a>
        )}
        <details className="lite-evidence-reverse" open={expanded || undefined}>
          <summary>
            {t('哪些判断引用了它', 'Which findings cite this source')}
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div>
            {citedParagraphs.length ? (
              <ul>
                {citedParagraphs.map((paragraph) => (
                  <li key={paragraph.id} data-paragraph-id={paragraph.id}>
                    <p>{paragraph.judgment.text[language]}</p>
                    {
                      <button
                        type="button"
                        onClick={() => {
                          selectParagraph(paragraph.id);
                          requestAnimationFrame(() => {
                            const stage = stageRef.current;
                            stage?.scrollIntoView({
                              block: 'start',
                              behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                                .matches
                                ? 'auto'
                                : 'smooth',
                            });
                            stage?.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true });
                          });
                        }}
                      >
                        {t('回到这条线索', 'Return to this finding')}
                        <ArrowRight size={13} aria-hidden="true" />
                      </button>
                    }
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {t(
                  '本项仅用于报告中的精确指标记录，没有段落直接引用。',
                  'This source supports the exact metric appendix; no paragraph cites it directly.'
                )}
              </p>
            )}
          </div>
        </details>
      </div>
    );
  };
  const sourcePicker = (sourceLink: (typeof links.sources)[number], number: number) => (
    <button
      type="button"
      key={sourceLink.id}
      data-source-id={sourceLink.id}
      aria-pressed={selectedSource?.id === sourceLink.id}
      aria-label={sourceLink.source.label}
      onClick={() => setSelectedSourceId(sourceLink.id)}
    >
      <span>{String(number + 1).padStart(2, '0')}</span>
      {kindNames[sourceLink.source.kind][index]}
    </button>
  );
  const card = (paragraph: (typeof links.paragraphs)[number], number: number) => (
    <button
      key={paragraph.id}
      type="button"
      className="lite-evidence-question"
      data-paragraph-id={paragraph.id}
      data-tone={number % 3}
      aria-pressed={active?.id === paragraph.id}
      aria-controls={`${prefix}-stage`}
      aria-label={`${questionTitle(paragraph)} ${paragraph.judgment.text[language]}`}
      onClick={() => selectParagraph(paragraph.id)}
    >
      <span className="lite-evidence-card-index" aria-hidden="true">
        {String(number + 1).padStart(2, '0')}
      </span>
      <span className="lite-evidence-card-copy">
        <span className="lite-evidence-card-title">{questionTitle(paragraph)}</span>
        <span className="lite-evidence-card-preview">{paragraph.judgment.text[language]}</span>
      </span>
      <ArrowUpRight size={19} aria-hidden="true" />
    </button>
  );

  return (
    <section
      className="lite-evidence-explorer"
      aria-labelledby={`${prefix}-title`}
      data-state={document.mode === 'none' ? 'withheld' : document.mode}
      data-run-id={document.binding?.runId || run.id}
      data-report-generation={document.binding?.reportGeneratedAt || ''}
      data-selection-applied={Boolean(initial)}
    >
      <header className="lite-evidence-heading">
        <div>
          <p className="lite-evidence-eyebrow">
            <ScanLine size={16} aria-hidden="true" />
            {t('顺着线索，看清一家公司', 'Follow the evidence, understand the company')}
          </p>
          <h2 id={`${prefix}-title`}>
            {t('别只看结论。', 'Go beyond the verdict.')}
            <br />
            <span>{t('亲手翻到依据。', 'Explore what supports it.')}</span>
          </h2>
        </div>
        <p className="lite-evidence-generation">
          {run.input.year} · {t('年度合并口径', 'Annual consolidated basis')}
          <br />
          {document.mode === 'none'
            ? t('报告暂不可用', 'Report unavailable')
            : saved
              ? t('已保存报告', 'Saved report')
              : t('已取得资料的观察', 'Observations from acquired data')}
          {document.generatedAt && <span>{date(document.generatedAt, locale)}</span>}
        </p>
      </header>
      {initialSelection && !initial && document.mode !== 'none' && (
        <p className="lite-evidence-selection-note" role="status">
          {t(
            '链接的报告版本或来源未匹配，正在显示当前报告资料。',
            'The linked report version or source did not match. Current report materials are shown.'
          )}
        </p>
      )}

      {document.mode === 'none' ? (
        <div className="lite-evidence-withheld" role="note">
          <FileSearch size={32} aria-hidden="true" />
          <h3>{t('先把资料范围核对清楚', 'Confirm the scope of the materials first')}</h3>
          <p>
            {document.withheldReason === 'scope'
              ? t(
                  '当前主体、年度或报告快照未对应，暂不展示判断和来源关联。',
                  'The entity, year, or report snapshot does not match. Findings and source links are withheld.'
                )
              : t(
                  '当前尚无可对应的报告资料。取得并核对资料后，才能沿着依据阅读。',
                  'No corresponding report materials are available yet. Acquire and verify the materials before following their evidence.'
                )}
          </p>
        </div>
      ) : (
        <>
          <div
            className="lite-evidence-deck"
            aria-label={t('选择一条调查问题', 'Choose a question to explore')}
          >
            {deck.slice(0, 3).map(card)}
          </div>
          {deck.length > 3 && (
            <details className="lite-evidence-more-questions">
              <summary>
                {t('还有哪些线索值得看', 'Explore the remaining findings')}
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <div className="lite-evidence-deck">
                {deck.slice(3).map((paragraph, number) => card(paragraph, number + 3))}
              </div>
            </details>
          )}

          {active ? (
            <div
              className="lite-evidence-stage"
              ref={stageRef}
              id={`${prefix}-stage`}
              data-selected-paragraph={active.id}
            >
              <p className="lite-evidence-screen-status" role="status">
                {t('正在查看：', 'Now viewing: ')}
                {questionTitle(active)}
              </p>
              <div className="lite-evidence-judgment" key={active.id}>
                <div className="lite-evidence-stage-kicker">
                  <span>{t('当前线索', 'Current finding')}</span>
                  {activeDimension && (
                    <span data-status={activeDimension.status}>
                      {statusNames[activeDimension.status][index]}
                    </span>
                  )}
                  {!activeDimension && active.groups.includes('unknown') && (
                    <span data-status="unknown">{statusNames.unknown[index]}</span>
                  )}
                  {!saved && <span>{t('资料观察', 'Data observation')}</span>}
                </div>
                <h3 tabIndex={-1}>{questionTitle(active)}</h3>
                <p className="lite-evidence-claim" data-paragraph-id={active.id}>
                  {active.judgment.text[language]}
                </p>
                <div className="lite-evidence-metrics">
                  <p>{t('这条判断涉及的指标', 'Metrics used in this finding')}</p>
                  {active.metricIds.length ? (
                    <LiteMetricChips
                      document={document}
                      judgment={active.judgment}
                      onInspect={safeInspect}
                      disabled={disabled}
                      compact
                    />
                  ) : (
                    <p className="lite-evidence-muted">
                      {t(
                        '本项依据公开材料，不含数值指标。',
                        'This finding uses public materials without a numerical metric.'
                      )}
                    </p>
                  )}
                </div>
                <div className="lite-evidence-connection" aria-hidden="true">
                  <span /> <ArrowDown size={18} />
                  <span />
                </div>
                <p className="lite-evidence-relation-note">
                  {t(
                    '下方关联来自本报告记录的指标与来源编号。',
                    'The links below use the exact metric and source IDs saved in this report.'
                  )}
                </p>
                {safeInspect && (active.metricIds.length > 0 || active.sourceIds.length > 0) && (
                  <button
                    type="button"
                    className="lite-evidence-inspect"
                    disabled={disabled}
                    onClick={() => safeInspect(active.judgment)}
                  >
                    <FileSearch size={16} aria-hidden="true" />
                    {t('核对这条判断的完整依据', 'Inspect the complete evidence for this finding')}
                  </button>
                )}
              </div>
              <div
                className="lite-evidence-paper"
                key={`${active.id}:${selectedSource?.id || 'missing'}`}
              >
                <div className="lite-evidence-paper-heading">
                  <FileSearch size={17} aria-hidden="true" />
                  <span>{t('翻到原始材料', 'Turn to the source material')}</span>
                </div>
                {selectedSource ? (
                  <>
                    <div
                      className="lite-evidence-source-selector"
                      aria-label={t('本项对应来源', 'Sources supporting this finding')}
                    >
                      {activeSources.slice(0, 4).map(sourcePicker)}
                    </div>
                    {activeSources.length > 4 && (
                      <details
                        className="lite-evidence-additional-sources"
                        open={
                          activeSources
                            .slice(4)
                            .some((source) => source.id === selectedSource.id) || undefined
                        }
                      >
                        <summary>
                          {t('查看本项其余来源', 'View the remaining sources for this finding')}
                          <ChevronDown size={14} aria-hidden="true" />
                        </summary>
                        <div className="lite-evidence-source-selector">
                          {activeSources
                            .slice(4)
                            .map((source, number) => sourcePicker(source, number + 4))}
                        </div>
                      </details>
                    )}
                    <h4>{selectedSource.source.label}</h4>
                    {sourceBody(selectedSource)}
                  </>
                ) : (
                  <p className="lite-evidence-muted">
                    {t(
                      '本项没有可安全展示的原始来源关联，暂不补写引用。',
                      'No safe recorded source link is available for this finding. No citation is added.'
                    )}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="lite-evidence-withheld">
              {t(
                '当前资料还不足以展示有对应依据的调查卡片。',
                'The available materials do not support a linked finding card yet.'
              )}
            </p>
          )}

          {(document.unknowns.length > 0 || nextItems.length > 0) && (
            <div className="lite-evidence-next">
              <div>
                <MessageCircle size={23} aria-hidden="true" />
                <h3>{t('下一步，问得更具体。', 'Ask a more specific next question.')}</h3>
                <p>
                  {t(
                    '资料空白保持空白，公开观点也需要核实。',
                    'Gaps stay visible, and public opinions still require verification.'
                  )}
                </p>
              </div>
              {nextItems.length > 0 && (
                <ol>
                  {nextItems.slice(0, 3).map((question) => (
                    <li key={question.id} data-paragraph-id={question.id}>
                      {question.text[language]}
                    </li>
                  ))}
                </ol>
              )}
              {nextItems.length > 3 && (
                <details className="lite-evidence-unknowns">
                  <summary>
                    {t('查看其余后续事项', 'Read the remaining follow-ups')}
                    <ChevronDown size={16} aria-hidden="true" />
                  </summary>
                  <ul>
                    {nextItems.slice(3).map((question) => (
                      <li key={question.id}>{question.text[language]}</li>
                    ))}
                  </ul>
                </details>
              )}
              {document.unknowns.length > 0 && (
                <details className="lite-evidence-unknowns">
                  <summary>
                    {t('还不能判断的部分', 'What cannot be judged yet')}
                    <ChevronDown size={16} aria-hidden="true" />
                  </summary>
                  <ul>
                    {document.unknowns.map((unknown) => (
                      <li key={unknown.id}>{unknown.text[language]}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          <section
            ref={archiveRef}
            className="lite-evidence-archive"
            aria-labelledby={`${prefix}-archive-title`}
          >
            <div className="lite-evidence-archive-heading">
              <div>
                <p className="lite-evidence-eyebrow">
                  {t('把每条来源翻清楚', 'Explore every recorded source')}
                </p>
                <h3 id={`${prefix}-archive-title`}>
                  {t('这份报告的资料架', 'The report’s source shelf')}
                </h3>
              </div>
              <span>{t('仅筛选已记录资料', 'Filters only recorded materials')}</span>
            </div>
            <div
              className="lite-evidence-filters"
              aria-label={t('按资料类型筛选', 'Filter by source type')}
            >
              {(['all', ...Object.keys(kindNames)] as const).map((value) => {
                const sourceKind = value as AssessmentEvidence['kind'] | 'all';
                const count =
                  sourceKind === 'all'
                    ? links.sources.length
                    : links.sources.filter((source) => source.source.kind === sourceKind).length;
                return (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={kind === sourceKind}
                    onClick={() => {
                      setKind(sourceKind);
                    }}
                  >
                    {sourceKind === 'all' ? t('全部', 'All') : kindNames[sourceKind][index]}
                    <span>{count}</span>
                  </button>
                );
              })}
            </div>
            <p className="lite-evidence-archive-status" aria-live="polite">
              {archive.total === 0
                ? t(
                    '本报告没有记录这类资料。',
                    'No sources of this type are recorded in this report.'
                  )
                : `${t('第 ', 'Page ')}${archive.page}${t(' / ', ' / ')}${archive.pageCount}${t(' 页', '')}`}
            </p>
            <div className="lite-evidence-source-grid">
              {archive.items.map((sourceLink) => (
                <details
                  className="lite-evidence-source-card"
                  key={sourceLink.id}
                  data-source-id={sourceLink.id}
                  open={selection.archiveSourceId === sourceLink.id || undefined}
                  onToggle={(event) => {
                    if (!event.currentTarget.open && selection.archiveSourceId === sourceLink.id)
                      setLocalSelection({ ...selection, archiveSourceId: null });
                  }}
                >
                  <summary>
                    <span>{kindNames[sourceLink.source.kind][index]}</span>
                    <h4>{sourceLink.source.label}</h4>
                    <ChevronDown size={17} aria-hidden="true" />
                  </summary>
                  {sourceBody(sourceLink)}
                </details>
              ))}
            </div>
            {archive.pageCount > 1 && (
              <nav
                className="lite-evidence-pagination"
                aria-label={t('资料分页', 'Source pagination')}
              >
                <button
                  type="button"
                  disabled={!archive.hasPrevious}
                  onClick={() => setPage(archive.page - 1)}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  {t('上一页', 'Previous')}
                </button>
                <span>
                  {archive.page} / {archive.pageCount}
                </span>
                <button
                  type="button"
                  disabled={!archive.hasNext}
                  onClick={() => setPage(archive.page + 1)}
                >
                  {t('下一页', 'Next')}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </nav>
            )}
          </section>

          <div className="lite-evidence-print-appendix">
            {printJudgments && (
              <>
                <h3>{t('全部判断与对应资料', 'All findings and supporting materials')}</h3>
                {links.paragraphs.map((paragraph) => (
                  <section key={paragraph.id}>
                    <p>{paragraph.judgment.text[language]}</p>
                    <LiteMetricChips document={document} judgment={paragraph.judgment} />
                    <p>
                      {t('对应来源编号：', 'Source IDs: ')}
                      {paragraph.sourceIds.join(', ') || t('未记录', 'Not recorded')}
                    </p>
                  </section>
                ))}
              </>
            )}
            <h3>{t('全部合法来源', 'All valid recorded sources')}</h3>
            {links.sources.map((sourceLink) => (
              <section key={sourceLink.id}>
                <h4>{sourceLink.source.label}</h4>
                <p>{sourceLink.id}</p>
                {sourceBody(sourceLink, true)}
              </section>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
