/** A complete read-only report. Presentation never creates or saves a research generation. */
import type { CompanyResearchRun } from './contracts.js';
import {
  deriveCompanyAssessment,
  type AssessmentDimension,
  type AssessmentEvidence,
  type AssessmentJudgment,
  type AssessmentMetric,
  type AssessmentText,
  type CompanyAssessment,
} from './company-assessment.js';
import { contextFen, type CompanyReadingBasis } from './company-analysis.js';
import {
  companyOverviewEvidencePeriods,
  deriveCompanyFinancialOverview,
  type CompanyOverviewEvidence,
} from './company-financial-overview.js';
import { companyReportCore } from './company-report-summary.js';
import {
  deriveCompanyResearchBrief,
  deriveCompanyResearchProgress,
  type CompanyResearchBriefView,
  type CompanyResearchProgressView,
  type CompanyResearchSnapshotState,
} from './company-research-view.js';
import { assessmentSourceHref } from './source-excerpt-focus.js';

export interface CompanyReportDocumentBinding {
  runId: string;
  securityCode: string;
  orgId: string;
  year: number;
  basis: 'consolidated';
  snapshotFetchedAt: string;
  /** Null for locally read acquired-data observations, which are not a saved AI report. */
  reportGeneratedAt: string | null;
}

export interface CompanyReportDocumentItem extends AssessmentJudgment {
  id: string;
  provenance: 'model' | 'rules' | 'observations';
  binding: CompanyReportDocumentBinding;
}

export interface CompanyReportDocumentDimension {
  id: AssessmentDimension['id'];
  label: AssessmentText;
  status: AssessmentDimension['status'];
  score: number | null;
  judgment: CompanyReportDocumentItem;
}

export interface CompanyReportDocumentView {
  mode: 'model' | 'rules' | 'observations' | 'none';
  snapshot: CompanyResearchSnapshotState;
  withheldReason: 'scope' | 'unsupported' | 'information-gap' | null;
  /** A reading control does not change the consolidated report's analytical basis. */
  displayedBasis: CompanyReadingBasis;
  binding: CompanyReportDocumentBinding | null;
  headline: CompanyReportDocumentItem | null;
  summary: CompanyReportDocumentItem | null;
  summaryHighlights: { zh: string[]; en: string[] };
  savedGrade: CompanyAssessment['grade'] | null;
  score: number | null;
  provisionalRating: CompanyResearchBriefView['provisionalRating'] | null;
  generatedAt: string | null;
  snapshotFetchedAt: string | null;
  findings: CompanyReportDocumentItem[];
  strengths: CompanyReportDocumentItem[];
  risks: CompanyReportDocumentItem[];
  actions: CompanyReportDocumentItem[];
  changeConditions: CompanyReportDocumentItem[];
  unknowns: CompanyReportDocumentItem[];
  observations: CompanyReportDocumentItem[];
  dimensions: CompanyReportDocumentDimension[];
  facts: AssessmentMetric[];
  /** Only references used by this document's displayed claims and exact metric appendix. */
  references: AssessmentEvidence[];
  questions: CompanyReportDocumentItem[];
  coverage: CompanyResearchBriefView['coverage'];
  progress: CompanyResearchProgressView;
  warnings: AssessmentText[];
}

const judgment = (text: AssessmentText): AssessmentJudgment => ({
  text: { zh: text[0], en: text[1] },
  metricIds: [],
  evidenceIds: [],
});

/** One report generation is selected before any content or references are assembled. */
export function deriveCompanyReportDocument(
  run: CompanyResearchRun,
  displayedBasis: CompanyReadingBasis = 'consolidated'
): CompanyReportDocumentView {
  const progress = deriveCompanyResearchProgress(run);
  const brief = deriveCompanyResearchBrief(run);
  const overview = deriveCompanyFinancialOverview(run, 'consolidated');
  const supported =
    /^\d{6}$/.test(run.input.securityCode) &&
    (!run.identity || ['sse', 'szse'].includes(run.identity.exchange));
  const withheldReason = run.informationGap
    ? 'information-gap'
    : !supported
      ? 'unsupported'
      : progress.snapshot === 'mismatch' || overview.state === 'mismatch'
        ? 'scope'
        : null;
  const empty: CompanyReportDocumentView = {
    mode: 'none',
    snapshot: withheldReason === 'scope' ? 'mismatch' : progress.snapshot,
    withheldReason,
    displayedBasis,
    binding: null,
    headline: null,
    summary: null,
    summaryHighlights: { zh: [], en: [] },
    savedGrade: null,
    score: null,
    provisionalRating: null,
    generatedAt: null,
    snapshotFetchedAt: null,
    findings: [],
    strengths: [],
    risks: [],
    actions: [],
    changeConditions: [],
    unknowns: [],
    observations: [],
    dimensions: [],
    facts: [],
    references: [],
    questions: [],
    coverage: structuredClone(brief.coverage),
    progress: structuredClone(progress),
    warnings: structuredClone(brief.warnings),
  };
  if (withheldReason) return empty;
  const saved = run.assessment;
  if (!saved && (!run.context || overview.state !== 'available')) return empty;

  // A deterministic local assessment supplies already established metric/source rules.
  // Its generatedAt/grade are deliberately not exposed as a saved report or rating.
  const report = saved || deriveCompanyAssessment(run);
  const binding: CompanyReportDocumentBinding = {
    runId: run.id,
    securityCode: run.input.securityCode,
    orgId: run.input.orgId,
    year: run.input.year,
    basis: 'consolidated',
    snapshotFetchedAt: saved?.snapshotFetchedAt || run.context!.fetchedAt,
    reportGeneratedAt: saved?.generatedAt || null,
  };
  const model = Boolean(saved && brief.mode === 'model');
  const provenance = model ? 'model' : saved ? 'rules' : 'observations';
  const metrics = new Map(report.metrics.map((metric) => [metric.id, metric]));
  const evidence = new Map(
    report.evidence
      .filter(
        (source) =>
          assessmentSourceHref(source.url) &&
          report.evidence.filter((other) => other.id === source.id).length === 1
      )
      .map((source) => [source.id, source])
  );
  const metricUsable = (id: string) => {
    const metric = metrics.get(id);
    const amountYear = id.match(/^(20\d{2})-/)?.[1];
    return (
      metric?.status === 'available' &&
      report.metrics.filter((other) => other.id === id).length === 1 &&
      metric.evidenceIds.every((source) => evidence.has(source)) &&
      (metric.unit !== 'CNY' ||
        (contextFen(metric.value) !== null &&
          !!amountYear &&
          Number(amountYear) <= report.year &&
          metric.evidenceIds.length > 0 &&
          metric.evidenceIds.every((id) => {
            const source = evidence.get(id)!;
            return (
              source.kind === 'financial' &&
              ['web', 'excerpt'].includes(source.sourceQuality) &&
              source.period === `${amountYear}-12-31`
            );
          })))
    );
  };
  const supportedJudgment = (block: AssessmentJudgment) =>
    Boolean(block.metricIds.length || block.evidenceIds.length) &&
    block.metricIds.every(metricUsable) &&
    block.evidenceIds.every((id) => evidence.has(id));
  const item = (
    id: string,
    block: AssessmentJudgment,
    origin: CompanyReportDocumentItem['provenance'] = provenance
  ): CompanyReportDocumentItem => ({
    ...structuredClone(block),
    id,
    provenance: origin,
    binding: { ...binding },
  });
  const referencedItem = (
    id: string,
    block: AssessmentJudgment,
    origin: CompanyReportDocumentItem['provenance'] = provenance
  ) => (supportedJudgment(block) ? item(id, block, origin) : null);
  const readList = (id: string, blocks: readonly AssessmentJudgment[]) =>
    blocks.flatMap((block, index) => {
      const value = referencedItem(`${id}-${index}`, block);
      return value ? [value] : [];
    });
  const deduplicate = (blocks: CompanyReportDocumentItem[]) =>
    blocks.filter(
      (block, index) =>
        blocks.findIndex(
          (other) => other.text.zh === block.text.zh && other.text.en === block.text.en
        ) === index
    );
  const dimensionBlock = (dimension: AssessmentDimension): AssessmentJudgment => ({
    ...judgment(dimension.ruleSummary),
    metricIds: dimension.metricIds.filter(metricUsable),
  });
  const dimensions = report.dimensions.map((dimension): CompanyReportDocumentDimension => {
    const narrative = model
      ? report.narrative?.dimensions.find((block) => block.dimensionId === dimension.id)
      : undefined;
    const block = narrative && supportedJudgment(narrative) ? narrative : dimensionBlock(dimension);
    return {
      id: dimension.id,
      label: [...dimension.label],
      status: dimension.status,
      score: dimension.score,
      judgment: item(
        `dimension-${dimension.id}`,
        block,
        narrative && supportedJudgment(narrative) ? 'model' : saved ? 'rules' : 'observations'
      ),
    };
  });
  const facts = report.metrics
    .filter((metric) => metric.status !== 'available' || metricUsable(metric.id))
    .map((metric) => structuredClone(metric));
  const unknowns = deduplicate([
    ...dimensions
      .filter((dimension) => ['unknown', 'conflict'].includes(dimension.status))
      .map((dimension) => ({ ...dimension.judgment, id: `unknown-${dimension.id}` })),
    ...report.gaps.map((gap, index) =>
      item(`gap-${index}`, judgment(gap), saved ? 'rules' : 'observations')
    ),
  ]);
  let headline: CompanyReportDocumentItem | null = null;
  let summary: CompanyReportDocumentItem | null = null;
  let findings: CompanyReportDocumentItem[] = [];
  let strengths: CompanyReportDocumentItem[] = [];
  let risks: CompanyReportDocumentItem[] = [];
  let actions: CompanyReportDocumentItem[] = [];
  let changeConditions: CompanyReportDocumentItem[] = [];
  let observations: CompanyReportDocumentItem[] = [];
  let questions: CompanyReportDocumentItem[] = [];
  let summaryHighlights: CompanyReportDocumentView['summaryHighlights'] = { zh: [], en: [] };

  if (saved) {
    const coreZh = companyReportCore(run, 'zh-Hans');
    const coreEn = companyReportCore(run, 'en');
    headline = referencedItem('headline', brief.headline, 'rules');
    summary = coreZh.summary ? referencedItem('summary', coreZh.summary) : null;
    if (model && report.narrative) {
      summaryHighlights = structuredClone(report.narrative.summaryHighlights || summaryHighlights);
      strengths = readList('strength', report.narrative.strengths);
      risks = readList('risk', report.narrative.risks);
      actions = readList('action', report.narrative.actions);
      changeConditions = readList('condition', report.narrative.changeConditions);
      findings = deduplicate([
        ...risks,
        ...strengths,
        ...dimensions
          .filter((dimension) => !['unknown', 'conflict'].includes(dimension.status))
          .map((dimension) => dimension.judgment)
          .filter(supportedJudgment),
      ]);
    } else {
      findings = dimensions
        .filter((dimension) => !['unknown', 'conflict'].includes(dimension.status))
        .map((dimension) => dimension.judgment)
        .filter(supportedJudgment);
      strengths = findings.filter((block) =>
        dimensions.some(
          (dimension) => dimension.judgment.id === block.id && dimension.status === 'strong'
        )
      );
      risks = findings.filter((block) =>
        dimensions.some(
          (dimension) =>
            dimension.judgment.id === block.id &&
            ['pressure', 'high-pressure'].includes(dimension.status)
        )
      );
      actions = readList('action', brief.nextChecks);
    }
    const english = new Map(coreEn.questions.map((question) => [question.id, question.text]));
    questions = coreZh.questions.flatMap((question) => {
      const en = english.get(question.id);
      if (!en) return [];
      const generated = model
        ? report.narrative?.suggestedQuestions?.find(
            (block) => block.text.zh.trim() === question.text && block.text.en.trim() === en
          )
        : undefined;
      if (generated && !supportedJudgment(generated)) return [];
      return [
        item(question.id, {
          text: { zh: question.text, en },
          metricIds: generated ? [...generated.metricIds] : [],
          evidenceIds: generated ? [...generated.evidenceIds] : [],
        }),
      ];
    });
  } else {
    const observationJudgment = (
      text: AssessmentText,
      scope: CompanyOverviewEvidence
    ): AssessmentJudgment => {
      const periods = companyOverviewEvidencePeriods(run.context, scope);
      return {
        ...judgment(text),
        metricIds: [
          ...new Set(
            periods.flatMap((period) =>
              scope.fields
                .map((field) => `${period.period.slice(0, 4)}-${field}`)
                .filter(metricUsable)
            )
          ),
        ],
      };
    };
    observations = overview.cards
      .filter((card) => card.status !== 'unknown')
      .flatMap((card) => {
        const value = referencedItem(
          `observation-${card.id}`,
          observationJudgment(card.detail, card.evidence)
        );
        return value ? [value] : [];
      });
    const lead =
      overview.cards.find((card) => card.status === 'risk') ||
      overview.cards.find((card) => card.status === 'watch') ||
      overview.cards.find((card) => card.status !== 'unknown');
    if (lead) {
      headline = referencedItem('headline', observationJudgment(lead.judgment, lead.evidence));
      summary = referencedItem('summary', observationJudgment(lead.detail, lead.evidence));
    }
    findings = overview.findings.flatMap((finding) => {
      const value = referencedItem(
        `finding-${finding.id}`,
        observationJudgment(finding.detail, finding.evidence)
      );
      return value ? [value] : [];
    });
    actions = overview.findings.flatMap((finding) => {
      const value = referencedItem(
        `action-${finding.id}`,
        observationJudgment(finding.nextCheck, finding.evidence)
      );
      return value ? [value] : [];
    });
    // Observed numerical pressure is labeled an observation, never a generated risk paragraph.
    risks = [];
  }

  const usedReferences = new Set([
    ...facts.flatMap((metric) => metric.evidenceIds),
    ...[
      ...(headline ? [headline] : []),
      ...(summary ? [summary] : []),
      ...findings,
      ...strengths,
      ...risks,
      ...actions,
      ...changeConditions,
      ...unknowns,
      ...observations,
      ...questions,
      ...dimensions.map((dimension) => dimension.judgment),
    ].flatMap((block) => [
      ...block.evidenceIds,
      ...block.metricIds.flatMap((id) => metrics.get(id)?.evidenceIds || []),
    ]),
  ]);
  return {
    ...empty,
    mode: provenance,
    binding,
    headline,
    summary,
    summaryHighlights,
    savedGrade: saved?.grade || null,
    score: saved?.score ?? null,
    provisionalRating: saved ? structuredClone(brief.provisionalRating || null) : null,
    generatedAt: saved?.generatedAt || null,
    snapshotFetchedAt: binding.snapshotFetchedAt,
    findings,
    strengths,
    risks,
    actions,
    changeConditions,
    unknowns,
    observations,
    dimensions,
    facts,
    references: [...evidence.values()]
      .filter((source) => usedReferences.has(source.id))
      .map((source) => structuredClone(source)),
    questions,
  };
}
