import type { CompanyAssessment, AssessmentResearchStep } from './company-assessment.js';
import type { CompanyChallengeState } from './company-challenge.js';

/** Public company context stays separate from adopted original-report evidence. */
export const companySections = [
  ['overview', '公司概览', 'Company overview'],
  ['trends', '历史财务走势', 'Financial history'],
  ['industry', '行业对比', 'Industry comparison'],
  ['disclosures', '公告线索', 'Announcements'],
  ['profile', '扩展核查', 'Further checks'],
  ['coverage', '数据覆盖', 'Data coverage'],
  ['sources', '来源比对', 'Source comparison'],
] as const;
export type CompanySection = (typeof companySections)[number][0] | 'evidence' | 'qa';

export function companyPath(runId: string, section: CompanySection = 'overview'): string {
  const query = new URLSearchParams({ run: runId });
  if (section !== 'overview') query.set('section', section);
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
  news: {
    title: string;
    date: string;
    media: string;
    url: string;
    provider: string;
    digest: string;
  }[];
  verificationLinks: { label: string; url: string; purpose: string; instruction: string }[];
  warnings: string[];
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
  metrics: Record<
    IndustryMetricKey,
    {
      company: number | null;
      mean: number | null;
      median: number | null;
      count: number;
      missing: number;
      difference: number | null;
    }
  >;
  samples: {
    code: string;
    name: string;
    noticeDate: string | null;
    values: Record<IndustryMetricKey, number | null>;
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
  questions?: CompanyQuestionAnswer[];
  assessment?: CompanyAssessment;
  assessmentStatus?: 'loading' | 'ready' | 'failed';
  assessmentError?: string;
  assessmentRevision?: number;
  assessmentInputHash?: string;
  assessmentFocus?: string;
  assessmentTrace?: AssessmentResearchStep[];
  challenge?: CompanyChallengeState;
}

export interface CompanyRecordSummary {
  id: string;
  input: { securityCode: string; orgId: string; year: number };
  name: string;
  status: string;
  createdAt: string;
}
