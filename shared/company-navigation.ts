import type { CompanyRecordSummary } from './company-workspace.js';
import type { CompanyReadingBasis } from './company-analysis.js';
import { productTerms } from './product-terms.js';

/** These destinations stay visible throughout the signed-in workspace. */
export const companyNavigationSections = [
  ['overview', ...productTerms.researchReport],
  ['trends', ...productTerms.financialTrends],
  ['industry', '行业对比', 'Industry comparison'],
  ['disclosures', '公告线索', 'Disclosure leads'],
  ['profile', '扩展核查', 'Extended checks'],
  ['coverage', '数据覆盖', 'Data coverage'],
  ['sources', '来源比对', 'Source comparison'],
] as const;

export const companyNavigationItems = companyNavigationSections;

export const OPEN_COMPANY_ASSISTANT_EVENT = 'prispect:open-company-assistant';
export interface OpenCompanyAssistantDetail {
  owner: string;
  runId: string;
  question?: string;
  basis?: CompanyReadingBasis;
  reportGeneratedAt?: string;
}

/** Query creation determines recency; viewing or updating a record does not. */
export function companyRecordsByCreation(records: readonly CompanyRecordSummary[]) {
  return [...records].sort((first, second) => second.createdAt.localeCompare(first.createdAt));
}

/** Only an account-owned /company route can override the latest queried record. */
export function selectCompanyNavigationTarget(
  route: string,
  records: readonly CompanyRecordSummary[]
): CompanyRecordSummary | null {
  try {
    const url = new URL(route, 'https://prispect.com');
    if (url.pathname === '/company') {
      const selected = records.find((record) => record.id === url.searchParams.get('run'));
      if (selected) return selected;
    }
  } catch {
    // A malformed route never supplies an unverified record ID to navigation.
  }
  return companyRecordsByCreation(records)[0] || null;
}
