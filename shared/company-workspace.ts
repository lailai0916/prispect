import type { CompanyAssessment, AssessmentResearchStep } from './company-assessment.js';
import { productTerms } from './product-terms.js';
import type {
  CompanyChallengeResult,
  CompanyChallengeState,
  CompanyChallengeTarget,
} from './company-challenge.js';

/** Public company context stays separate from adopted original-report evidence. */
export const companySections = [
  ['overview', ...productTerms.researchReport],
  ['trends', ...productTerms.financialTrends],
  ['industry', '行业对比', 'Industry comparison'],
  ['disclosures', '公告线索', 'Disclosure leads'],
  ['profile', '扩展核查', 'Extended checks'],
  ['coverage', '数据覆盖', 'Data coverage'],
  ['sources', '来源比对', 'Source comparison'],
  // Retain saved original-review and combined-financial links without adding menu clutter.
  ['financial', '财务分析', 'Financial analysis'],
  ['evidence', '原件核查', 'Original-document review'],
] as const;
export type CompanySection = (typeof companySections)[number][0];
export type LegacyCompanySection = 'qa';

const companyFocusTargets: Record<CompanySection, Record<string, string>> = {
  overview: {
    report: 'company-full-report',
    research: 'company-full-report',
    goal: 'company-full-report',
    lab: 'company-evidence-lab',
    checklist: 'company-financial-data',
    plan: 'company-full-report',
    trust: 'company-source-trust',
    summary: 'company-financial-overview',
    findings: 'company-financial-attention',
  },
  trends: {
    history: 'company-financial-history',
    data: 'company-financial-data',
    findings: 'company-financial-findings',
  },
  industry: { industry: 'company-industry' },
  disclosures: { news: 'company-public-signals', announcements: 'company-disclosures' },
  profile: { profile: 'company-profile' },
  coverage: { coverage: 'company-data-coverage', trust: 'company-source-trust' },
  financial: {
    history: 'company-financial-history',
    data: 'company-financial-data',
    industry: 'company-industry',
    findings: 'company-financial-findings',
  },
  sources: {
    news: 'company-public-signals',
    announcements: 'company-disclosures',
    profile: 'company-profile',
    coverage: 'company-data-coverage',
    trust: 'company-source-trust',
    'source-comparison': 'company-source-comparison',
  },
  evidence: {},
};

/** Fixed F destinations keep existing focused links usable. */
export function resolveCompanyLocation(
  sectionValue: string | null | undefined,
  focusValue?: string | null
): { section: CompanySection; focus: string | null } {
  let section = companySections.find(([id]) => id === sectionValue)?.[0] || 'overview';
  let focus = focusValue || null;
  if (section === 'overview' && focus === 'data') section = 'trends';
  else if (section === 'overview' && focus === 'news') section = 'disclosures';
  else if (section === 'overview' && focus === 'trust') section = 'coverage';
  if (section === 'financial' && focus === 'industry') section = 'industry';
  if (section === 'sources' && focus === 'news') section = 'disclosures';
  else if (section === 'sources' && focus === 'announcements') section = 'disclosures';
  else if (section === 'sources' && focus === 'profile') section = 'profile';
  else if (section === 'sources' && (focus === 'coverage' || focus === 'trust'))
    section = 'coverage';
  if (focus && !Object.hasOwn(companyFocusTargets[section], focus)) focus = null;
  return { section, focus };
}

export function resolveCompanyFocus(
  section: CompanySection,
  focus: string | null | undefined
): string | null {
  return focus && Object.hasOwn(companyFocusTargets[section], focus)
    ? companyFocusTargets[section][focus]!
    : null;
}

export function companyPath(
  runId: string,
  sectionValue: CompanySection | LegacyCompanySection = 'overview',
  focusValue?: string
): string {
  const { section, focus } = resolveCompanyLocation(sectionValue, focusValue);
  const query = new URLSearchParams({ run: runId });
  if (section !== 'overview') query.set('section', section);
  if (focus) query.set('focus', focus);
  return `/company?${query}`;
}

export const contextAmountFields = [
  'revenue',
  'netProfit',
  'parentProfit',
  'deductedProfit',
  'operatingProfit',
  'totalProfit',
  'financeExpense',
  'ocf',
  'investingCash',
  'financingCash',
  'salesCash',
  'cash',
  'shortLoan',
  'currentPortionDebt',
  'receivables',
  'notesReceivable',
  'inventory',
  'totalAssets',
  'totalLiabilities',
  'currentAssets',
  'currentLiabilities',
  'equity',
] as const;
export type ContextAmountField = (typeof contextAmountFields)[number];
export type PublicSourceState = 'available' | 'partial' | 'empty' | 'error' | 'manual';
export interface CompanySourceReceipt {
  id: string;
  provider: string;
  dimension: string;
  url: string;
  status: PublicSourceState;
  fetchedAt: string;
  latestDate: string | null;
  count: number;
  note: string;
  responseHashes: string[];
}
export interface CompanyContextPeriod {
  period: string;
  annual: boolean;
  noticeDate: string | null;
  amounts: Record<ContextAmountField, string | null>;
  ratios: { grossMargin: number | null; roe: number | null; revenueGrowth: number | null };
  auditOpinion: string | null;
  fieldSources: Partial<Record<ContextAmountField, string>>;
  sourceUrls: string[];
  originalUrl: string | null;
}
export interface CompanySourceComparison {
  period: string;
  field: ContextAmountField;
  primary: string;
  secondary: string;
  difference: string;
  matches: boolean;
}
export interface CompanyDisclosure {
  id: string;
  title: string;
  date: string;
  url: string;
  sources: { provider: string; url: string }[];
  category: string;
  attention: 'high' | 'medium' | 'low' | 'routine';
  matched: string;
  meaning: string;
  nextQuestion: string;
  excerpt?: { page: number; quote: string; url: string; sha256: string; pagesRead: number };
}
export interface CompanyContextSnapshot {
  version: 1;
  securityCode: string;
  orgId: string;
  companyName: string;
  organizationType?: string;
  fetchedAt: string;
  status: 'available' | 'partial' | 'unavailable';
  financials: CompanyContextPeriod[];
  sources: CompanySourceReceipt[];
  comparisons: CompanySourceComparison[];
  profile: Record<string, string | null>;
  shareholders: {
    name: string;
    shares: string | null;
    percentage: number | null;
    change: string | null;
    period: string;
    url: string;
  }[];
  announcements: CompanyDisclosure[];
  news: CompanyNews[];
  discussions?: CompanyDiscussion[];
  publicSignals?: CompanyPublicSignalsCoverage;
  market?: CompanyMarketQuote;
  verificationLinks: { label: string; url: string; purpose: string; instruction: string }[];
  warnings: string[];
}
export interface CompanyPublicExcerpt {
  text: string;
  url: string;
  sha256: string;
  readAt: string;
}
export interface CompanyNews {
  id?: string;
  title: string;
  date: string;
  media: string;
  url: string;
  provider: string;
  digest: string;
  contentScope?: 'headline' | 'digest' | 'media-excerpt';
  excerpt?: CompanyPublicExcerpt;
  clusterId?: string;
}
export interface CompanyDiscussion {
  id: string;
  securityCode: string;
  title: string;
  date: string;
  updatedAt?: string;
  url: string;
  provider: string;
  textScope: 'title' | 'post-excerpt';
  excerpt?: CompanyPublicExcerpt;
}
export type PublicSignalStopReason =
  | 'complete'
  | 'page-limit'
  | 'request-budget'
  | 'deadline'
  | 'source-failure';
export interface PublicSignalCoverage {
  raw: number;
  accepted: number;
  unique: number;
  pages: number;
  hitsTotal: number | null;
  bodyRead: number;
  oldest: string | null;
  latest: string | null;
  stopReason: PublicSignalStopReason;
}
export interface CompanyPublicSignalsCoverage {
  fetchedAt: string;
  news: PublicSignalCoverage;
  discussions: PublicSignalCoverage;
}
export interface CompanyMarketQuote {
  securityCode: string;
  status: 'available' | 'partial' | 'unavailable';
  price: string | null;
  change: string | null;
  changePercent: number | null;
  high: string | null;
  low: string | null;
  marketCap: string | null;
  quotedAt: string | null;
  fetchedAt: string;
  sourceUrl: string;
}
export const industryMetricKeys = [
  'grossMargin',
  'roe',
  'ocfToRevenue',
  'assetLiabilityRatio',
  'receivableToRevenue',
  'revenueGrowth',
] as const;
export type IndustryMetricKey = (typeof industryMetricKeys)[number];
export const industryChartMetricKeys = [
  'revenue',
  'netProfit',
  'parentProfit',
  'ocf',
  'cash',
  'shortDebt',
  'shortLoan',
  'currentPortionDebt',
  'inventory',
  'receivables',
  'netMargin',
  'parentNetMargin',
] as const;
export type IndustryChartMetricKey = (typeof industryChartMetricKeys)[number];
export interface IndustryMetricSummary {
  company: number | null;
  mean: number | null;
  median: number | null;
  count: number;
  missing: number;
  difference: number | null;
}
export interface CompanyIndustrySnapshot {
  version: 1;
  securityCode: string;
  period: string;
  industry: string;
  industryCode: string;
  fetchedAt: string;
  status: 'available' | 'partial';
  peerCount: number;
  minimumSamples: number;
  metrics: Record<IndustryMetricKey, IndustryMetricSummary>;
  /** Additive chart references: amounts are yuan; margins are percentages
   * and margin differences are percentage points.
   * netProfit/netMargin use consolidated profit, parentProfit/parentNetMargin
   * use attributable profit. shortDebt sums shortLoan and currentPortionDebt;
   * component references require their own nonnegative observed amount.
   * Absent fields on legacy snapshots stay unknown, never backfilled. */
  chartMetrics?: Partial<Record<IndustryChartMetricKey, IndustryMetricSummary>>;
  samples: {
    code: string;
    name: string;
    noticeDate: string | null;
    values: Record<IndustryMetricKey, number | null>;
    chartValues?: Partial<Record<IndustryChartMetricKey, number | null>>;
  }[];
  sources: { url: string; sha256: string }[];
  warnings: string[];
}
export interface CompanyQuestionAnswer {
  question: string;
  text: string;
  citations: { label: string; url: string; page?: number }[];
  mode: 'rules' | 'model' | 'rules-fallback';
  createdAt: string;
  snapshotFetchedAt: string;
  warning?: string;
}
export interface CompanyWorkspaceExtension {
  informationGap?: { name: string; reason: string };
  context?: CompanyContextSnapshot;
  contextStatus?: 'loading' | 'ready' | 'failed';
  contextError?: string;
  contextRevision?: number;
  industry?: Record<string, CompanyIndustrySnapshot>;
  /** Settled annual retrieval failures are retried only by an explicit action. */
  industryHistoryErrors?: Record<
    string,
    import('./company-industry-history.js').IndustryHistoryFailure
  >;
  questions?: CompanyQuestionAnswer[];
  assessment?: CompanyAssessment;
  assessmentStatus?: 'loading' | 'ready' | 'failed';
  assessmentError?: string;
  assessmentRevision?: number;
  assessmentInputHash?: string;
  /** Records one automatic analysis attempt for a settled public-data version.
   * Peer-chart updates and read-only revisits do not schedule another attempt. */
  assessmentAutoInputHash?: string;
  assessmentFocus?: string;
  assessmentTrace?: AssessmentResearchStep[];
  challenge?: CompanyChallengeState;
  /** Owning-workspace reuse only: one completed, version-bound result per fixed target.
   * This history is never part of public model inputs or browser reading snapshots. */
  challengeResults?: Partial<
    Record<
      CompanyChallengeTarget,
      { version: 1; inputHash: string; result: CompanyChallengeResult }
    >
  >;
}

export interface CompanyRecordSummary {
  id: string;
  input: {
    securityCode: string;
    orgId: string;
    year: number;
    purpose?: 'external' | 'handover';
    researchMode?: 'financial' | 'deep';
  };
  name: string;
  status: string;
  createdAt: string;
  deletionBlocked?: boolean;
  updatedAt?: string;
  contextStatus?: string;
  assessmentStatus?: string;
  informationGap?: boolean;
  result?: {
    grade: CompanyAssessment['grade'];
    score: number | null;
    statement: { zh: string; en: string };
    asOf: string;
    stale: boolean;
    modelStatus: CompanyAssessment['model']['status'];
  };
}
