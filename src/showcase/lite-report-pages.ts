import type { CompanyReadingBasis } from '../../shared/company-analysis';

export const liteReportPages = [
  { id: 'finance', anchor: 'lite-finance', label: ['财务', 'Finance'] },
  { id: 'public', anchor: 'lite-public', label: ['公开事项', 'Public records'] },
  { id: 'reputation', anchor: 'lite-reputation', label: ['口碑线索', 'Reputation'] },
  { id: 'original', anchor: 'lite-original', label: ['原文', 'Original'] },
] as const;

export type LiteReportPage = (typeof liteReportPages)[number]['id'];
type LegacyLiteReportPage = 'overview' | 'numbers' | 'sources' | 'questions';
const legacyPages: Record<LegacyLiteReportPage, LiteReportPage> = {
  overview: 'finance',
  numbers: 'finance',
  sources: 'original',
  questions: 'reputation',
};
const legacyAnchors: Record<string, LiteReportPage> = {
  '#lite-judgment': 'finance',
  '#lite-numbers': 'finance',
  '#lite-sources': 'original',
  '#lite-questions': 'reputation',
};

export function litePageForAnchor(hash: string): LiteReportPage | null {
  return (
    liteReportPages.find((page) => `#${page.anchor}` === hash)?.id ||
    (Object.hasOwn(legacyAnchors, hash) ? legacyAnchors[hash] : null)
  );
}

/** An old bookmarked chapter takes precedence over a page left in its URL. */
export function resolveLiteReportPage(query: URLSearchParams, hash = ''): LiteReportPage {
  const requested = query.get('page');
  return (
    litePageForAnchor(hash) ||
    liteReportPages.find((page) => page.id === requested)?.id ||
    (requested && Object.hasOwn(legacyPages, requested)
      ? legacyPages[requested as LegacyLiteReportPage]
      : null) ||
    'finance'
  );
}

export function liteReadingBasis(query: URLSearchParams): CompanyReadingBasis {
  return query.get('basis') === 'parent' ? 'parent' : 'consolidated';
}

/** Reading links retain the owning run and annual options, never create a query. */
export function liteReportPageHref(
  query: URLSearchParams,
  page: LiteReportPage | LegacyLiteReportPage,
  options: {
    basis?: CompanyReadingBasis;
    claim?: string;
    source?: string;
    generation?: string;
  } = {}
): string {
  const next = new URLSearchParams(query);
  const canonicalPage = Object.hasOwn(legacyPages, page)
    ? legacyPages[page as LegacyLiteReportPage]
    : page;
  next.set('experience', 'lite');
  next.set('page', canonicalPage);
  if (options.basis) next.set('basis', options.basis);
  // Evidence selections are explicit and cannot silently follow another page.
  for (const key of ['claim', 'source', 'generation'] as const) {
    next.delete(key);
    if (canonicalPage === 'original' && options[key]) next.set(key, options[key]);
  }
  return `/company?${next.toString()}`;
}
