import type { CompanyResearchRun } from './contracts.js';
import type { AssessmentJudgment, CompanyAssessment } from './company-assessment.js';
import {
  deriveCompanyResearchBrief,
  deriveCompanyResearchProgress,
} from './company-research-view.js';

export interface CompanyReportTextSegment {
  text: string;
  highlight: boolean;
}

function referenced(block: AssessmentJudgment, report: CompanyAssessment) {
  const metrics = new Map(report.metrics.map((metric) => [metric.id, metric]));
  const evidence = new Set(report.evidence.map((item) => item.id));
  return (
    (block.metricIds.length > 0 || block.evidenceIds.length > 0) &&
    block.metricIds.every((id) => metrics.get(id)?.status === 'available') &&
    block.evidenceIds.every((id) => evidence.has(id))
  );
}

/** Literal fragments only; the caller renders text and strong nodes, never model HTML. */
export function reportSummarySegments(
  text: string,
  highlights: readonly string[]
): CompanyReportTextSegment[] {
  const candidates = [
    ...new Set(highlights.filter((value) => value.length >= 2 && text.includes(value))),
  ];
  const ranges: { start: number; end: number }[] = [];
  for (const value of candidates) {
    let offset = 0;
    while (offset < text.length) {
      const start = text.indexOf(value, offset);
      if (start < 0) break;
      ranges.push({ start, end: start + value.length });
      offset = start + value.length;
    }
  }
  ranges.sort((first, second) => first.start - second.start || second.end - first.end);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  const result: CompanyReportTextSegment[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor)
      result.push({ text: text.slice(cursor, range.start), highlight: false });
    result.push({ text: text.slice(range.start, range.end), highlight: true });
    cursor = range.end;
  }
  if (cursor < text.length) result.push({ text: text.slice(cursor), highlight: false });
  return result;
}

/** Read a saved report. This neither starts research nor borrows another company's report. */
export function companyReportCore(run: CompanyResearchRun, locale: 'zh-Hans' | 'en') {
  const empty = { summary: null, segments: [], questions: [], model: false } as {
    summary: AssessmentJudgment | null;
    segments: CompanyReportTextSegment[];
    questions: { id: string; text: string }[];
    model: boolean;
  };
  const progress = deriveCompanyResearchProgress(run);
  const report = run.assessment;
  if (!report || progress.snapshot === 'mismatch' || run.informationGap) return empty;
  const brief = deriveCompanyResearchBrief(run);
  const language = locale === 'en' ? 'en' : 'zh';
  const model = brief.mode === 'model';
  const summary =
    model && report.narrative
      ? report.narrative.summary
      : referenced(brief.summary, report)
        ? brief.summary
        : brief.headline;
  if (!referenced(summary, report)) return empty;
  const text = summary.text[language];
  const highlights = model ? report.narrative?.summaryHighlights?.[language] || [] : [];
  const amounts = report.metrics
    .filter((metric) => summary.metricIds.includes(metric.id) && metric.status === 'available')
    .map((metric) => metric.display[locale === 'en' ? 1 : 0]);
  const suggested = model ? report.narrative?.suggestedQuestions || [] : [];
  const questions = suggested
    .filter((question) => referenced(question, report))
    .map((question, index) => ({
      id: `report-question-${index}`,
      text: question.text[language].trim(),
    }))
    .filter((question) => question.text.length > 0 && question.text.length <= 500)
    .filter(
      (question, index, list) => list.findIndex((item) => item.text === question.text) === index
    )
    .slice(0, 4);
  // Older saved reports do not have generated questions. Their actual acquired scope
  // still supports useful prompts; do not invent an event or a financial direction.
  if (!questions.length) {
    const available = new Set(
      report.metrics.filter((metric) => metric.status === 'available').map((metric) => metric.id)
    );
    if (available.has(`${report.year}-netProfit`) && available.has(`${report.year}-ocf`))
      questions.push({
        id: 'report-question-cash',
        text:
          language === 'zh'
            ? '这份报告中，利润与经营现金的差异说明了什么？'
            : 'What does the difference between profit and operating cash in this report mean?',
      });
    if (report.evidence.some((item) => ['news', 'disclosure'].includes(item.kind)))
      questions.push({
        id: 'report-question-events',
        text:
          language === 'zh'
            ? '哪些公告和新闻最值得继续核查？'
            : 'Which disclosures and news deserve further verification?',
      });
    questions.push({
      id: 'report-question-judgment',
      text:
        language === 'zh'
          ? '这份报告最关键的判断有哪些依据？'
          : 'What evidence supports the key judgment in this report?',
    });
    if (model)
      questions.push({
        id: 'report-question-change',
        text:
          language === 'zh'
            ? '哪些新证据会改变当前判断？'
            : 'What new evidence would change the current judgment?',
      });
  }
  return {
    summary,
    segments: reportSummarySegments(text, [...highlights, ...amounts]),
    questions: questions.slice(0, 4),
    model,
  };
}
