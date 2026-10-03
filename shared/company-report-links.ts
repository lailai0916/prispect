/** Local report navigation follows recorded IDs, never matching numbers or guessing evidence. */
import type { AssessmentEvidence, AssessmentMetric } from './company-assessment.js';
import type {
  CompanyReportDocumentBinding,
  CompanyReportDocumentItem,
  CompanyReportDocumentView,
} from './company-report-document.js';
import { assessmentSourceHref } from './source-excerpt-focus.js';

export type CompanyReportParagraphGroup =
  | 'headline'
  | 'summary'
  | 'finding'
  | 'strength'
  | 'risk'
  | 'unknown'
  | 'dimension'
  | 'action'
  | 'condition'
  | 'observation'
  | 'question';

export interface CompanyReportParagraphLink {
  id: string;
  groups: CompanyReportParagraphGroup[];
  judgment: CompanyReportDocumentItem;
  metricIds: string[];
  sourceIds: string[];
}

export interface CompanyReportMetricLink {
  id: string;
  metric: AssessmentMetric;
  sourceIds: string[];
  paragraphIds: string[];
}

export interface CompanyReportSourceLink {
  id: string;
  source: AssessmentEvidence;
  metricIds: string[];
  paragraphIds: string[];
}

export interface CompanyReportLinks {
  binding: CompanyReportDocumentBinding | null;
  paragraphs: CompanyReportParagraphLink[];
  metrics: CompanyReportMetricLink[];
  sources: CompanyReportSourceLink[];
}

export interface CompanyReportSourceFilter {
  kind?: AssessmentEvidence['kind'] | 'all';
  query?: string;
  /** One-based page. Invalid or out-of-range input is clamped to the available local list. */
  page?: number;
  pageSize?: number;
}

export interface CompanyReportSourcePage {
  items: CompanyReportSourceLink[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

const distinct = (ids: readonly string[]) => [...new Set(ids)];

function sameBinding(first: CompanyReportDocumentBinding, second: CompanyReportDocumentBinding) {
  return (
    first.runId === second.runId &&
    first.securityCode === second.securityCode &&
    first.orgId === second.orgId &&
    first.year === second.year &&
    first.basis === second.basis &&
    first.snapshotFetchedAt === second.snapshotFetchedAt &&
    first.reportGeneratedAt === second.reportGeneratedAt
  );
}

/** Equal duplicates collapse; conflicting IDs are excluded rather than resolved by array order. */
function unambiguous<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  const values = new Map<string, T>();
  const conflicted = new Set<string>();
  for (const row of rows) {
    if (!row.id || conflicted.has(row.id)) continue;
    const previous = values.get(row.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) {
      conflicted.add(row.id);
      values.delete(row.id);
    } else if (!previous) values.set(row.id, row);
  }
  return values;
}

/** Index one already-derived document; this helper has no run lookup or transport dependency. */
export function deriveCompanyReportLinks(document: CompanyReportDocumentView): CompanyReportLinks {
  const binding = document.binding;
  if (
    !binding ||
    document.mode === 'none' ||
    document.withheldReason ||
    document.snapshot === 'mismatch' ||
    document.progress.snapshot === 'mismatch' ||
    document.snapshotFetchedAt !== binding.snapshotFetchedAt ||
    document.generatedAt !== binding.reportGeneratedAt ||
    (document.mode === 'observations'
      ? binding.reportGeneratedAt !== null
      : !binding.reportGeneratedAt)
  )
    return { binding: null, paragraphs: [], metrics: [], sources: [] };

  const sourceMap = unambiguous(document.references);
  for (const [id, source] of sourceMap) if (!assessmentSourceHref(source.url)) sourceMap.delete(id);
  const metricMap = unambiguous(document.facts);
  const grouped: { group: CompanyReportParagraphGroup; judgment: CompanyReportDocumentItem }[] = [];
  const add = (group: CompanyReportParagraphGroup, rows: readonly CompanyReportDocumentItem[]) => {
    for (const judgment of rows)
      if (sameBinding(judgment.binding, binding)) grouped.push({ group, judgment });
  };
  add('headline', document.headline ? [document.headline] : []);
  add('summary', document.summary ? [document.summary] : []);
  add('finding', document.findings);
  add('strength', document.strengths);
  add('risk', document.risks);
  add('unknown', document.unknowns);
  add(
    'dimension',
    document.dimensions.map((dimension) => dimension.judgment)
  );
  add('action', document.actions);
  add('condition', document.changeConditions);
  add('observation', document.observations);
  add('question', document.questions);
  const paragraphMap = unambiguous(grouped.map((entry) => entry.judgment));
  const paragraphs: CompanyReportParagraphLink[] = [...paragraphMap.values()].map((judgment) => {
    const metricIds = distinct(judgment.metricIds).filter((id) => metricMap.has(id));
    const sourceIds = distinct([
      ...judgment.evidenceIds,
      ...metricIds.flatMap((id) => metricMap.get(id)!.evidenceIds),
    ]).filter((id) => sourceMap.has(id));
    return {
      id: judgment.id,
      groups: distinct(
        grouped.filter((entry) => entry.judgment.id === judgment.id).map((entry) => entry.group)
      ) as CompanyReportParagraphGroup[],
      judgment: structuredClone(judgment),
      metricIds,
      sourceIds,
    };
  });
  const metrics: CompanyReportMetricLink[] = [...metricMap.values()].map((metric) => ({
    id: metric.id,
    metric: structuredClone(metric),
    sourceIds: distinct(metric.evidenceIds).filter((id) => sourceMap.has(id)),
    paragraphIds: paragraphs
      .filter((paragraph) => paragraph.metricIds.includes(metric.id))
      .map((paragraph) => paragraph.id),
  }));
  const sources: CompanyReportSourceLink[] = [...sourceMap.values()].map((source) => ({
    id: source.id,
    source: structuredClone(source),
    metricIds: metrics
      .filter((metric) => metric.sourceIds.includes(source.id))
      .map((metric) => metric.id),
    paragraphIds: paragraphs
      .filter((paragraph) => paragraph.sourceIds.includes(source.id))
      .map((paragraph) => paragraph.id),
  }));
  return { binding: { ...binding }, paragraphs, metrics, sources };
}

export function reportParagraphSourceIds(links: CompanyReportLinks, paragraphId: string): string[] {
  return [...(links.paragraphs.find((paragraph) => paragraph.id === paragraphId)?.sourceIds || [])];
}

export function reportMetricSourceIds(links: CompanyReportLinks, metricId: string): string[] {
  return [...(links.metrics.find((metric) => metric.id === metricId)?.sourceIds || [])];
}

/** Search/filter/paging touches only the current report's already acquired sources. */
export function filterCompanyReportSources(
  links: CompanyReportLinks,
  filter: CompanyReportSourceFilter = {}
): CompanyReportSourcePage {
  const query = (filter.query || '').trim().normalize('NFKC').toLocaleLowerCase();
  const rows = links.sources.filter(({ source }) => {
    if (filter.kind && filter.kind !== 'all' && source.kind !== filter.kind) return false;
    if (!query) return true;
    return [source.label, source.period || '', source.quote || '', source.url]
      .join(' ')
      .normalize('NFKC')
      .toLocaleLowerCase()
      .includes(query);
  });
  const requestedSize = filter.pageSize;
  const pageSize =
    requestedSize !== undefined && Number.isFinite(requestedSize)
      ? Math.min(50, Math.max(1, Math.trunc(requestedSize)))
      : 6;
  const pageCount = Math.ceil(rows.length / pageSize);
  const requestedPage = filter.page;
  const page =
    requestedPage !== undefined && Number.isFinite(requestedPage)
      ? Math.min(Math.max(1, pageCount), Math.max(1, Math.trunc(requestedPage)))
      : 1;
  return {
    items: structuredClone(rows.slice((page - 1) * pageSize, page * pageSize)),
    total: rows.length,
    page,
    pageSize,
    pageCount,
    hasPrevious: page > 1,
    hasNext: page < pageCount,
  };
}
