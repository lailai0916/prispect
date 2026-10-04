import { resolveCompanyLocation, type CompanySection } from '../shared/company-workspace';
import { documentPaths } from './content/document-navigation';
import { newPageEntryState, rememberPageScroll } from './page-scroll';

export const ROUTE_CHANGE_EVENT = 'prispect:routechange';

export function resolveCompanySection(value: string | null | undefined): CompanySection {
  return resolveCompanyLocation(value).section;
}

const pages = new Set([
  '/',
  '/docs',
  ...documentPaths,
  '/login',
  '/register',
  '/account',
  '/workspace',
  '/new',
  '/materials',
  '/company',
  '/query',
  '/decisions',
  '/compare',
]);

const legacyPages: Record<string, string> = {
  '/research': '/query',
  '/companies/compare': '/query',
  '/about': '/docs/about',
  '/method': '/docs/methodology',
  '/privacy': '/docs/privacy',
  '/terms': '/docs/terms',
  '/copyright': '/docs/copyright',
};

const retiredCompanyPages: Record<string, { section: CompanySection; focus?: string }> = {
  finance: { section: 'overview' },
  overview: { section: 'overview' },
  numbers: { section: 'trends' },
  public: { section: 'disclosures', focus: 'announcements' },
  reputation: { section: 'disclosures', focus: 'news' },
  questions: { section: 'disclosures', focus: 'news' },
  original: { section: 'sources' },
  sources: { section: 'sources' },
};

/** Accept only local application pages, never server endpoints or external URLs. */
export function appPath(value: string, origin: string): string | null {
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value))
    return null;
  try {
    const url = new URL(value, origin);
    const originalPath = url.pathname.replace(/\/+$/, '') || '/';
    let pathname =
      legacyPages[originalPath] ||
      (originalPath === '/docs' &&
      (url.searchParams.has('section') || url.hash.startsWith('#document-'))
        ? '/docs/guide'
        : originalPath);
    if (url.origin !== origin || (!pages.has(pathname) && !/^\/tasks\/[^/]+$/.test(pathname)))
      return null;
    if (originalPath === '/companies/compare') {
      for (const key of ['a', 'b', 'basis']) url.searchParams.delete(key);
    }
    if (originalPath === '/') {
      const view = url.searchParams.get('view');
      if (view === 'search' || view === 'guide' || view === 'example') {
        pathname = view === 'search' ? '/query' : view === 'guide' ? '/docs/guide' : '/';
        url.searchParams.delete('view');
        if (url.hash.startsWith('#showcase-')) url.hash = '';
      }
    }
    if (pathname === '/company') {
      const experience = url.searchParams.get('experience');
      const retiredPage = url.searchParams.get('page');
      if (experience === 'lite') {
        const anchoredPage = url.hash.startsWith('#lite-') ? url.hash.slice(6) : null;
        const mapping =
          [anchoredPage, retiredPage].find(
            (value) => value && Object.hasOwn(retiredCompanyPages, value)
          ) || 'finance';
        const target = retiredCompanyPages[mapping]!;
        url.searchParams.set('section', target.section);
        if (target.focus) url.searchParams.set('focus', target.focus);
        else url.searchParams.delete('focus');
        for (const key of ['page', 'basis', 'claim', 'source', 'generation'])
          url.searchParams.delete(key);
        if (url.hash.startsWith('#lite-')) url.hash = '';
        if (url.searchParams.get('run')) url.searchParams.set('cached', '1');
      }
      if (experience === 'lite' || experience === 'pro') url.searchParams.delete('experience');
      const requestedSection = url.searchParams.get('section');
      const requestedFocus = url.searchParams.get('focus');
      const oldAnchor =
        url.hash === '#company-public-data'
          ? { section: 'financial', focus: 'data', hash: '#company-financial-data' }
          : url.hash === '#company-public-signals'
            ? { section: 'sources', focus: 'news', hash: url.hash }
            : null;
      const { section, focus } = resolveCompanyLocation(
        oldAnchor?.section || requestedSection,
        oldAnchor?.focus || requestedFocus
      );
      if (requestedSection !== null || requestedFocus !== null || oldAnchor) {
        if (section === 'overview') url.searchParams.delete('section');
        else url.searchParams.set('section', section);
        if (focus) url.searchParams.set('focus', focus);
        else url.searchParams.delete('focus');
        if (oldAnchor) url.hash = oldAnchor.hash;
      }
    }
    return pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

export function legacyRoute(hash: string, origin: string): string | null {
  return hash.startsWith('#/') ? appPath(hash.slice(1), origin) : null;
}

export function readBrowserRoute(): string {
  const legacy = legacyRoute(location.hash, location.origin);
  const current = location.pathname + location.search + location.hash;
  const canonical = legacy || appPath(current, location.origin);
  if (canonical && canonical !== current) history.replaceState(history.state, '', canonical);
  return location.pathname + location.search;
}

export function writeBrowserRoute(value: string, replace = false): boolean {
  const path = appPath(value, location.origin);
  if (!path) return false;
  const current = location.pathname + location.search + location.hash;
  if (current !== path) {
    rememberPageScroll();
    const state = newPageEntryState(history.state);
    if (replace) history.replaceState(state, '', path);
    else history.pushState(state, '', path);
  }
  window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));
  return true;
}

export function appLinkPath(href: string, origin: string): string | null {
  if (href.startsWith('#')) return null;
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin || url.hash) return null;
    return appPath(url.pathname + url.search, origin);
  } catch {
    return null;
  }
}

export function loginDestination(value: string, origin: string): string {
  const path = appPath(value, origin);
  return path && !['/login', '/register'].includes(path.split(/[?#]/)[0]!) ? path : '/workspace';
}
