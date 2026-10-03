import type { CompanyResearchRun } from '../shared/contracts';
import type { CompanyAssessment } from '../shared/company-assessment';
import {
  contextFen,
  contextFieldLabels,
  type CompanyReadingBasis,
} from '../shared/company-analysis';
import { deriveCompanyFinancialOverview } from '../shared/company-financial-overview';
import { companyReportCore } from '../shared/company-report-summary';
import {
  industryMetricKeys,
  type CompanyContextSnapshot,
  type CompanyDisclosure,
  type CompanyIndustrySnapshot,
  type CompanyNews,
  type CompanyRecordSummary,
  type CompanySourceComparison,
  type CompanySourceReceipt,
  type ContextAmountField,
  type IndustryMetricKey,
} from '../shared/company-workspace';
import type { Locale } from './format';

export interface CompanyNavigationPreviewMetric {
  field: ContextAmountField;
  label: readonly [string, string];
  value: string | null;
  status: 'available' | 'missing' | 'conflict';
}

export interface CompanyNavigationPreviewData {
  available: boolean;
  scope: 'ready' | 'missing' | 'mismatch';
  context: CompanyContextSnapshot | null;
  overview: {
    summary: string | null;
    grade: CompanyAssessment['grade'] | null;
    metrics: CompanyNavigationPreviewMetric[];
  };
  trends: {
    period: string;
    profit: string | null;
    peerProfit: string | null;
    ocf: string | null;
    revenue: string | null;
  }[];
  industry: {
    snapshot: CompanyIndustrySnapshot | null;
    minimumSamples: number;
    metrics: { key: IndustryMetricKey; company: number; median: number; count: number }[];
  };
  disclosures: CompanyDisclosure[];
  profile: { key: string; value: string }[];
  shareholders: CompanyContextSnapshot['shareholders'];
  news: CompanyNews[];
  verificationLinks: CompanyContextSnapshot['verificationLinks'];
  coverage: {
    receipts: CompanySourceReceipt[];
    annualYears: number;
    availableSources: number;
    missingFields: number;
  };
  comparisons: CompanySourceComparison[];
}

function matchingRecord(record: CompanyRecordSummary, run: CompanyResearchRun): boolean {
  return (
    record.id === run.id &&
    record.input.securityCode === run.input.securityCode &&
    record.input.orgId === run.input.orgId &&
    record.input.year === run.input.year
  );
}

/** Keep a delayed owner's cached snapshot out of the current account's preview. */
export function matchingCompanyNavigationRun(
  record: CompanyRecordSummary | null,
  snapshot: { owner: string; run: CompanyResearchRun } | null,
  currentOwner: string | null
): CompanyResearchRun | null {
  return currentOwner &&
    record &&
    snapshot?.owner === currentOwner &&
    matchingRecord(record, snapshot.run)
    ? snapshot.run
    : null;
}

function emptyPreview(scope: 'missing' | 'mismatch'): CompanyNavigationPreviewData {
  return {
    available: false,
    scope,
    context: null,
    overview: { summary: null, grade: null, metrics: [] },
    trends: [],
    industry: { snapshot: null, minimumSamples: 5, metrics: [] },
    disclosures: [],
    profile: [],
    shareholders: [],
    news: [],
    verificationLinks: [],
    coverage: { receipts: [], annualYears: 0, availableSources: 0, missingFields: 0 },
    comparisons: [],
  };
}

function usableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function amountConflict(
  context: CompanyContextSnapshot,
  period: string,
  field: ContextAmountField
): boolean {
  if (
    context.comparisons.some(
      (comparison) =>
        comparison.period === period && comparison.field === field && !comparison.matches
    )
  )
    return true;
  const known = context.financials
    .filter((row) => row.annual && row.period === period)
    .map((row) => contextFen(row.amounts[field]))
    .filter((value): value is bigint => value !== null);
  return known.some((value) => value !== known[0]);
}

function validIndustry(
  saved: CompanyIndustrySnapshot | undefined,
  securityCode: string,
  period: string
): CompanyIndustrySnapshot | null {
  if (!saved) return null;
  const minimum = Math.max(
    5,
    Number.isSafeInteger(saved.minimumSamples) ? saved.minimumSamples : 5
  );
  const codes = saved.samples.map((sample) => sample.code);
  const peers = codes.filter((code) => code !== securityCode);
  return saved.version === 1 &&
    saved.securityCode === securityCode &&
    saved.period === period &&
    Number.isSafeInteger(saved.peerCount) &&
    saved.peerCount >= minimum &&
    codes.includes(securityCode) &&
    peers.length === saved.peerCount &&
    new Set(codes).size === codes.length &&
    codes.every((code) => /^\d{6}$/.test(code)) &&
    saved.sources.some((source) => usableUrl(source.url))
    ? saved
    : null;
}

function peerSampleCount(
  industry: CompanyIndustrySnapshot,
  read: (sample: CompanyIndustrySnapshot['samples'][number]) => number | null | undefined
): number {
  return industry.samples.filter((sample) => {
    const value = read(sample);
    return (
      sample.code !== industry.securityCode && typeof value === 'number' && Number.isFinite(value)
    );
  }).length;
}

/**
 * Local public reading data only. The caller supplies the current account's record and
 * owner-scoped cached run; no source request, model workflow or original is opened here.
 */
export function deriveCompanyNavigationPreview(
  record: CompanyRecordSummary | null,
  run: CompanyResearchRun | null,
  basis: CompanyReadingBasis = 'parent',
  locale: Locale = 'zh-Hans'
): CompanyNavigationPreviewData {
  if (!record || !run) return emptyPreview('missing');
  if (
    !matchingRecord(record, run) ||
    !Number.isInteger(run.input.year) ||
    !/^\d{6}$/.test(run.input.securityCode) ||
    !run.input.orgId ||
    run.informationGap ||
    (run.identity &&
      (run.identity.securityCode !== run.input.securityCode ||
        run.identity.orgId !== run.input.orgId ||
        !['sse', 'szse'].includes(run.identity.exchange))) ||
    (run.context &&
      (run.context.version !== 1 ||
        run.context.securityCode !== run.input.securityCode ||
        run.context.orgId !== run.input.orgId))
  )
    return emptyPreview('mismatch');
  if (!run.context) return emptyPreview('missing');

  const financial = deriveCompanyFinancialOverview(run, basis);
  if (financial.state !== 'available') return emptyPreview('mismatch');
  const context = run.context;
  const annuals = financial.analysis?.annuals || [];
  const period = `${run.input.year}-12-31`;
  const profitField = basis === 'parent' ? 'parentProfit' : 'netProfit';
  const metrics = (['revenue', profitField, 'ocf'] as const).map((field) => {
    const value = financial.annual?.amounts[field] ?? null;
    return {
      field,
      label: contextFieldLabels[field],
      value,
      status: amountConflict(context, period, field)
        ? ('conflict' as const)
        : value === null
          ? ('missing' as const)
          : ('available' as const),
    };
  });
  const currentReport =
    run.assessment?.year === run.input.year &&
    run.assessment.basis === 'consolidated' &&
    run.assessment.snapshotFetchedAt === context.fetchedAt
      ? run.assessment
      : null;
  const summary = currentReport ? companyReportCore(run, locale).summary : null;

  const savedIndustry = run.industry?.[period];
  const minimumSamples = Math.max(
    5,
    savedIndustry && Number.isSafeInteger(savedIndustry.minimumSamples)
      ? savedIndustry.minimumSamples
      : 5
  );
  const industry = validIndustry(savedIndustry, run.input.securityCode, period);
  const industryDependencies: Partial<Record<IndustryMetricKey, ContextAmountField[]>> = {
    ocfToRevenue: ['ocf', 'revenue'],
    assetLiabilityRatio: ['totalLiabilities', 'totalAssets'],
    receivableToRevenue: ['receivables', 'revenue'],
    revenueGrowth: ['revenue'],
  };
  const industryMetrics = industry
    ? industryMetricKeys.flatMap((key) => {
        const metric = industry.metrics[key];
        const conflict = (industryDependencies[key] || []).some((field) =>
          amountConflict(context, period, field)
        );
        if (
          conflict ||
          (key === 'revenueGrowth' &&
            amountConflict(context, `${run.input.year - 1}-12-31`, 'revenue')) ||
          !metric ||
          !Number.isSafeInteger(metric.count) ||
          metric.count < minimumSamples ||
          metric.count > industry.peerCount ||
          metric.count !== peerSampleCount(industry, (sample) => sample.values[key]) ||
          metric.company === null ||
          metric.median === null ||
          !Number.isFinite(metric.company) ||
          !Number.isFinite(metric.median)
        )
          return [];
        return [{ key, company: metric.company, median: metric.median, count: metric.count }];
      })
    : [];
  const receipts = context.sources.slice(0, 40);
  return {
    available: true,
    scope: 'ready',
    context,
    overview: {
      summary: summary?.text[locale === 'en' ? 'en' : 'zh'] || null,
      grade: currentReport?.grade || null,
      metrics,
    },
    trends: annuals.map((row) => {
      const peers = validIndustry(run.industry?.[row.period], run.input.securityCode, row.period);
      const metric = peers?.chartMetrics?.[profitField];
      const minimum = Math.max(5, peers?.minimumSamples || 5);
      const peerProfit =
        row.amounts[profitField] !== null &&
        peers &&
        metric &&
        Number.isSafeInteger(metric.count) &&
        metric.count >= minimum &&
        metric.count <= peers.peerCount &&
        metric.count === peerSampleCount(peers, (sample) => sample.chartValues?.[profitField]) &&
        metric.median !== null &&
        Number.isFinite(metric.median) &&
        contextFen(metric.median.toFixed(2)) !== null
          ? metric.median.toFixed(2)
          : null;
      return {
        period: row.period,
        profit: row.amounts[profitField],
        peerProfit,
        ocf: row.amounts.ocf,
        revenue: row.amounts.revenue,
      };
    }),
    industry: { snapshot: industry, minimumSamples, metrics: industryMetrics },
    disclosures: context.announcements
      .filter((row) => usableUrl(row.url))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5),
    profile: [
      'orgName',
      'industry',
      'business',
      'controller',
      'legalPerson',
      'listed',
      'employees',
      'auditor',
      'province',
    ]
      .map((key) => [key, context.profile[key]] as const)
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && !!entry[1].trim()
      )
      .slice(0, 6)
      .map(([key, value]) => ({ key, value })),
    shareholders: context.shareholders.slice(0, 3),
    news: context.news.filter((row) => usableUrl(row.url)).slice(0, 3),
    verificationLinks: context.verificationLinks.filter((row) => usableUrl(row.url)).slice(0, 3),
    coverage: {
      receipts,
      annualYears: annuals.length,
      availableSources: context.sources.filter((source) =>
        ['available', 'partial'].includes(source.status)
      ).length,
      missingFields: metrics.filter((metric) => metric.status !== 'available').length,
    },
    comparisons: context.comparisons
      .filter((comparison) => comparison.period === period)
      .slice(0, 5),
  };
}
