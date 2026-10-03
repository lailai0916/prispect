import type { CompanyReadingBasis } from '../../shared/company-analysis';

export const liteReportPages = [
  { id: 'overview', anchor: 'lite-judgment', label: ['核心判断', 'Overview'] },
  { id: 'numbers', anchor: 'lite-numbers', label: ['关键数字', 'Numbers'] },
  { id: 'sources', anchor: 'lite-sources', label: ['追溯依据', 'Evidence'] },
  { id: 'questions', anchor: 'lite-questions', label: ['下一步', 'Next steps'] },
] as const;

export type LiteReportPage = (typeof liteReportPages)[number]['id'];

export function litePageForAnchor(hash: string): LiteReportPage | null {
  return liteReportPages.find((page) => `#${page.anchor}` === hash)?.id || null;
}

/** An old bookmarked chapter takes precedence over a page left in its URL. */
export function resolveLiteReportPage(query: URLSearchParams, hash = ''): LiteReportPage {
  return (
    litePageForAnchor(hash) ||
    liteReportPages.find((page) => page.id === query.get('page'))?.id ||
    'overview'
  );
}

export function liteReadingBasis(query: URLSearchParams): CompanyReadingBasis {
  return query.get('basis') === 'parent' ? 'parent' : 'consolidated';
}

/** Reading links retain the owning run and annual options, never create a query. */
export function liteReportPageHref(
  query: URLSearchParams,
  page: LiteReportPage,
  options: {
    basis?: CompanyReadingBasis;
    claim?: string;
    source?: string;
    generation?: string;
  } = {}
): string {
  const next = new URLSearchParams(query);
  next.set('experience', 'lite');
  next.set('page', page);
  if (options.basis) next.set('basis', options.basis);
  // Evidence selections are explicit and cannot silently follow another page.
  for (const key of ['claim', 'source', 'generation'] as const) {
    next.delete(key);
    if (page === 'sources' && options[key]) next.set(key, options[key]);
  }
  return `/company?${next.toString()}`;
}
