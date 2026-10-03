import { useId, type CSSProperties } from 'react';
import { ArrowUpRight, FileSearch } from 'lucide-react';
import type { AssessmentJudgment, AssessmentMetric } from '../../shared/company-assessment';
import type {
  CompanyReportDocumentItem,
  CompanyReportDocumentView,
} from '../../shared/company-report-document';
import { contextFen } from '../../shared/company-analysis';
import { assessmentSourceHref, knownSourcePage } from '../../shared/source-excerpt-focus';
import { useApp } from '../context';
import { money } from '../format';
import './lite-metric-chips.css';

export interface LiteMetricChipsProps {
  document: CompanyReportDocumentView;
  judgment: AssessmentJudgment;
  onInspect?: (judgment: AssessmentJudgment) => void;
  disabled?: boolean;
  /** All remaining metrics remain readable in a native disclosure and in print. */
  maxVisible?: number;
}

function exactValue(metric: AssessmentMetric, locale: 'zh-Hans' | 'en') {
  if (metric.unit === 'CNY') return `${money(metric.value, locale, false)} CNY`;
  if (metric.unit === 'percent') return `${metric.value}%`;
  if (metric.unit === 'percentage-points')
    return `${metric.value} ${locale === 'en' ? 'percentage points' : '个百分点'}`;
  if (metric.unit === 'times') return `${metric.value}×`;
  return metric.value!;
}

/** Literal saved amounts; presentation never searches, recalculates or counts up. */
export function LiteMetricChips({
  document,
  judgment,
  onInspect,
  disabled = false,
  maxVisible = 6,
}: LiteMetricChipsProps) {
  const { locale, t } = useApp();
  const descriptionId = useId();
  const binding = document.binding;
  const itemBinding = (judgment as Partial<CompanyReportDocumentItem>).binding;
  if (
    !binding ||
    document.mode === 'none' ||
    document.withheldReason ||
    (itemBinding &&
      (itemBinding.runId !== binding.runId ||
        itemBinding.securityCode !== binding.securityCode ||
        itemBinding.orgId !== binding.orgId ||
        itemBinding.year !== binding.year ||
        itemBinding.basis !== binding.basis ||
        itemBinding.snapshotFetchedAt !== binding.snapshotFetchedAt ||
        itemBinding.reportGeneratedAt !== binding.reportGeneratedAt))
  )
    return null;

  const references = new Map(document.references.map((source) => [source.id, source]));
  const language = locale === 'en' ? 1 : 0;
  const selected = [...new Set(judgment.metricIds)].flatMap((id) => {
    const metric = document.facts.find((entry) => entry.id === id);
    if (
      !metric ||
      document.facts.filter((entry) => entry.id === id).length !== 1 ||
      metric.status !== 'available' ||
      metric.value === null ||
      !Number.isFinite(Number(metric.value)) ||
      !metric.value.trim() ||
      (metric.unit === 'CNY' && contextFen(metric.value) === null) ||
      !metric.evidenceIds.length ||
      metric.evidenceIds.some((sourceId) => {
        const source = references.get(sourceId);
        return (
          !source ||
          document.references.filter((entry) => entry.id === sourceId).length !== 1 ||
          !assessmentSourceHref(source.url, knownSourcePage(source.page))
        );
      })
    )
      return [];
    return [{ metric, sources: [...new Set(metric.evidenceIds)].map((id) => references.get(id)!) }];
  });
  // Present the selected annual period first; keep every recorded historical metric below.
  const selectedYear = new RegExp(`^${binding.year}-`);
  selected.sort(
    (first, second) =>
      Number(selectedYear.test(second.metric.id)) - Number(selectedYear.test(first.metric.id))
  );
  if (!selected.length) return null;
  const canInspect = Boolean(
    onInspect && document.mode !== 'observations' && binding.reportGeneratedAt
  );
  const limit = Number.isFinite(maxVisible) ? Math.max(1, Math.floor(maxVisible)) : selected.length;
  const renderMetric = ({ metric, sources }: (typeof selected)[number], index: number) => {
    const value = exactValue(metric, locale);
    const periods = [
      ...new Set(sources.flatMap((source) => (source.period ? [source.period] : []))),
    ];
    const year = metric.id.match(/^(20\d{2})-/)?.[1];
    const period = periods.length ? periods.join(' / ') : `${year || binding.year}`;
    const scope = `${period} · ${t('合并分析口径', 'Consolidated analysis')}`;
    const formula = metric.formula[language];
    const ownJudgment: AssessmentJudgment = {
      text: { ...judgment.text },
      metricIds: [metric.id],
      evidenceIds: sources.map((source) => source.id),
    };
    const content = (
      <>
        <span className="lite-metric-chip-label">{metric.label[language]}</span>
        <strong className="lite-metric-chip-value">{value}</strong>
        <span className="lite-metric-chip-scope">{scope}</span>
        <span className="lite-metric-chip-action" aria-hidden="true">
          {canInspect ? <FileSearch size={13} /> : <ArrowUpRight size={13} />}
          {t('追到依据', 'Trace the source')}
        </span>
      </>
    );
    const props = {
      className: 'lite-metric-chip',
      'data-metric-id': metric.id,
      'data-evidence-ids': ownJudgment.evidenceIds.join(' '),
      'data-run-id': binding.runId,
      'data-security-code': binding.securityCode,
      'data-year': binding.year,
      'data-basis': binding.basis,
      'data-report-generated-at': binding.reportGeneratedAt || undefined,
      'aria-label': `${metric.label[language]} · ${value} · ${scope} · ${t('查看此项依据', 'View this metric’s sources')}`,
      'aria-describedby': formula ? `${descriptionId}-formula-${index}` : undefined,
      title: [metric.label[language], value, scope, formula].filter(Boolean).join(' · '),
      style: { '--metric-index': Math.min(index, 6) } as CSSProperties,
    };
    const sourceLink = (source: (typeof sources)[number]) => (
      <a
        key={source.id}
        href={assessmentSourceHref(source.url, knownSourcePage(source.page))}
        target="_blank"
        rel="noopener noreferrer"
        data-source-id={source.id}
      >
        {source.label}
        {knownSourcePage(source.page) ? ` · ${t('页', 'p.')} ${source.page}` : ''}
        <span className="lite-metric-chip-print-url">
          {' '}
          · {assessmentSourceHref(source.url, knownSourcePage(source.page))}
        </span>
      </a>
    );
    return (
      <div className="lite-metric-chip-entry" key={metric.id}>
        {canInspect ? (
          <button
            {...props}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onInspect?.(ownJudgment)}
          >
            {content}
          </button>
        ) : (
          <a
            {...props}
            href={assessmentSourceHref(sources[0].url, knownSourcePage(sources[0].page))}
            target="_blank"
            rel="noopener noreferrer"
          >
            {content}
          </a>
        )}
        <span id={`${descriptionId}-formula-${index}`} className="lite-metric-chip-formula">
          {formula}
        </span>
        <div className="lite-metric-chip-source-links">
          {sources.slice(0, 2).map(sourceLink)}
          {sources.length > 2 && (
            <details className="lite-metric-chip-more-sources">
              <summary>
                {t('展开其余 ', 'Show the remaining ')}
                {sources.length - 2}
                {t(' 条来源', ' sources')}
              </summary>
              <div>{sources.slice(2).map(sourceLink)}</div>
            </details>
          )}
        </div>
      </div>
    );
  };
  return (
    <div className="lite-metric-chips" aria-describedby={descriptionId}>
      <p id={descriptionId} className="lite-metric-chips-description">
        {t('每个数字，都能追到它的依据。', 'Every figure leads to its own sources.')}
      </p>
      <div className="lite-metric-chips-row">{selected.slice(0, limit).map(renderMetric)}</div>
      {selected.length > limit && (
        <details className="lite-metric-chips-more">
          <summary>
            {t('展开其余 ', 'Show the remaining ')}
            {selected.length - limit}
            {t(' 项数字', ' figures')}
          </summary>
          <div className="lite-metric-chips-row">
            {selected.slice(limit).map((entry, index) => renderMetric(entry, index + limit))}
          </div>
        </details>
      )}
    </div>
  );
}
