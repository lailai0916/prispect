import type { CompanyResearchRun } from '../shared/contracts.js';
import type {
  AssessmentJudgment,
  AssessmentMetric,
  CompanyAssessment,
} from '../shared/company-assessment.js';

// Match the source-link guard used when deriving the public assessment. These
// stored references are never fetched here; restricting them to reader API hosts
// would discard legitimate official document and media article landing pages.
const publicUrl = (value: string) => {
  if (typeof value !== 'string' || value.length > 8000) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
};
const validDate = (value: string) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

/** The saved report is public analysis, not a copy of the owning workspace or research goal. */
export function assistantPublicAssessment(run: CompanyResearchRun): CompanyAssessment | undefined {
  const report = run.assessment;
  if (
    !report ||
    !run.context ||
    run.informationGap ||
    run.context.securityCode !== run.input.securityCode ||
    run.context.orgId !== run.input.orgId ||
    (run.identity &&
      (run.identity.securityCode !== run.input.securityCode ||
        run.identity.orgId !== run.input.orgId)) ||
    report.year !== run.input.year ||
    report.basis !== 'consolidated' ||
    report.model.status !== 'completed' ||
    !report.narrative ||
    !validDate(report.generatedAt) ||
    !validDate(report.snapshotFetchedAt)
  )
    return;
  const availableEvidence = report.evidence
    .filter(
      (source, index, list) =>
        publicUrl(source.url) && list.findIndex((item) => item.id === source.id) === index
    )
    .map((source) => ({
      id: source.id,
      kind: source.kind,
      label: source.label,
      url: source.url,
      ...(source.period ? { period: source.period } : {}),
      ...(source.quote ? { quote: source.quote } : {}),
      ...(source.page ? { page: source.page } : {}),
      sourceQuality: source.sourceQuality,
    }));
  const evidenceIds = new Set(availableEvidence.map((source) => source.id));
  const availableMetrics = report.metrics
    .filter(
      (metric, index, list) =>
        metric.status === 'available' &&
        metric.value !== null &&
        (metric.evidenceIds.length > 0 ||
          (metric.id === 'scope-year' &&
            metric.unit === 'count' &&
            metric.value === String(run.input.year)) ||
          (metric.id === 'available-field-count' &&
            metric.unit === 'count' &&
            metric.value === String(report.coverage.fields))) &&
        metric.evidenceIds.every((id) => evidenceIds.has(id)) &&
        list.findIndex((item) => item.id === metric.id) === index
    )
    .map((metric) => ({
      id: metric.id,
      label: [metric.label[0], metric.label[1]] as const,
      value: metric.value,
      display: [metric.display[0], metric.display[1]] as const,
      unit: metric.unit,
      status: metric.status,
      evidenceIds: [...metric.evidenceIds],
      formula: [metric.formula[0], metric.formula[1]] as const,
    }));
  const metricIds = new Set(availableMetrics.map((metric) => metric.id));
  const judgment = (block: AssessmentJudgment): AssessmentJudgment | null =>
    typeof block.text.zh === 'string' &&
    typeof block.text.en === 'string' &&
    (block.metricIds.length > 0 || block.evidenceIds.length > 0) &&
    block.metricIds.every((id) => metricIds.has(id)) &&
    block.evidenceIds.every((id) => evidenceIds.has(id))
      ? {
          text: { zh: block.text.zh, en: block.text.en },
          metricIds: [...block.metricIds],
          evidenceIds: [...block.evidenceIds],
        }
      : null;
  const summary = judgment(report.narrative.summary);
  if (!summary) return;
  const judgments = (blocks: AssessmentJudgment[]) =>
    blocks
      .flatMap((block) => {
        const item = judgment(block);
        return item ? [item] : [];
      })
      .slice(0, 3);
  const narrative = {
    summary,
    dimensions: report.narrative.dimensions
      .flatMap((block) => {
        const item = judgment(block);
        return item ? [{ ...item, dimensionId: block.dimensionId }] : [];
      })
      .slice(0, 6),
    strengths: judgments(report.narrative.strengths),
    risks: judgments(report.narrative.risks),
    actions: judgments(report.narrative.actions),
    changeConditions: judgments(report.narrative.changeConditions),
  };
  const usedMetrics = new Set<string>();
  const usedEvidence = new Set<string>();
  for (const block of [
    summary,
    ...narrative.dimensions,
    ...narrative.strengths,
    ...narrative.risks,
    ...narrative.actions,
    ...narrative.changeConditions,
  ]) {
    block.metricIds.forEach((id) => usedMetrics.add(id));
    block.evidenceIds.forEach((id) => usedEvidence.add(id));
  }
  // The saved cash/profit pair also supports deterministic checks of the
  // explanation, even when the summary explicitly references only one side.
  for (const id of [`${report.year}-ocf`, `${report.year}-netProfit`])
    if (metricIds.has(id)) usedMetrics.add(id);
  const metrics = availableMetrics.filter((metric) => usedMetrics.has(metric.id));
  metrics.forEach((metric) => metric.evidenceIds.forEach((id) => usedEvidence.add(id)));
  const byId = new Map(availableEvidence.map((source) => [source.id, source]));
  let quoteBudget = 16_000;
  const evidence = [...usedEvidence].flatMap((id) => {
    const source = byId.get(id);
    if (!source) return [];
    const { quote, ...metadata } = source;
    if (!quote || quoteBudget <= 0) return [metadata];
    const max = Math.min(1200, quoteBudget);
    const boundedQuote = quote.length > max ? `${quote.slice(0, max - 1)}…` : quote;
    quoteBudget -= boundedQuote.length;
    return [{ ...metadata, quote: boundedQuote }];
  });
  const retainedMetricIds = new Set(metrics.map((metric) => metric.id));
  return {
    version: 1,
    year: report.year,
    basis: 'consolidated',
    snapshotFetchedAt: report.snapshotFetchedAt,
    generatedAt: report.generatedAt,
    grade: report.grade,
    score: report.score,
    methodologyVersion: report.methodologyVersion,
    dimensions: report.dimensions.map((dimension) => ({
      id: dimension.id,
      label: [dimension.label[0], dimension.label[1]],
      score: dimension.score,
      status: dimension.status,
      metricIds: dimension.metricIds.filter((id) => retainedMetricIds.has(id)),
      ruleSummary: [dimension.ruleSummary[0], dimension.ruleSummary[1]],
    })),
    metrics,
    evidence,
    coverage: {
      fields: report.coverage.fields,
      requiredFields: report.coverage.requiredFields,
      years: report.coverage.years,
      sources: report.coverage.sources,
      news: report.coverage.news,
      disclosures: report.coverage.disclosures,
      excerpts: report.coverage.excerpts,
      peers: report.coverage.peers,
    },
    gaps: [],
    narrative,
    model: { status: 'completed' },
  };
}

const reportId = (id: string) => `report:${id}`;
const reportJudgment = (judgment: AssessmentJudgment) => ({
  text: { zh: judgment.text.zh, en: judgment.text.en },
  metricIds: judgment.metricIds.map(reportId),
  evidenceIds: judgment.evidenceIds.map(reportId),
});

/** Separate namespaces preserve two amounts with the same field ID from different snapshots. */
export function assistantSavedReportContext(run: CompanyResearchRun, selected = false) {
  const report = assistantPublicAssessment(run);
  if (!report?.narrative) return;
  const metrics: AssessmentMetric[] = report.metrics.map((metric) => ({
    ...metric,
    id: reportId(metric.id),
    evidenceIds: metric.evidenceIds.map(reportId),
  }));
  const evidence = report.evidence.map((source) => ({ ...source, id: reportId(source.id) }));
  return {
    generatedAt: report.generatedAt,
    snapshotFetchedAt: report.snapshotFetchedAt,
    currentSnapshotFetchedAt: run.context!.fetchedAt,
    snapshotRelation:
      report.snapshotFetchedAt === run.context!.fetchedAt
        ? ('current' as const)
        : ('previous' as const),
    selected,
    year: report.year,
    basis: report.basis,
    grade: report.grade,
    score: report.score,
    summary: reportJudgment(report.narrative.summary),
    dimensions: report.narrative.dimensions.map((block) => ({
      ...reportJudgment(block),
      dimensionId: block.dimensionId,
    })),
    strengths: report.narrative.strengths.map(reportJudgment),
    risks: report.narrative.risks.map(reportJudgment),
    actions: report.narrative.actions.map(reportJudgment),
    changeConditions: report.narrative.changeConditions.map(reportJudgment),
    metrics,
    evidence,
  };
}
