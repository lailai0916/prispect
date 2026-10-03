import { productTagline, productTerms } from '../shared/product-terms';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  Suspense,
} from 'react';
import {
  ChevronDown,
  LogOut,
  CircleAlert,
  Eye,
  Menu,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  BookOpen,
} from 'lucide-react';
import type {
  DemoCase,
  EvidenceRef,
  Report,
  Workspace,
  AuthSession,
  AccountUser,
} from '../shared/contracts';
import { api, setCsrfToken, RequestError, requestErrorText } from './api';
import { companyPath } from '../shared/company-workspace';
import { type Locale, setDisplayTimeZone } from './format';
import { changeComposerOwner } from './start-draft';
import { companyReadingMemory } from './company-reading-memory';
import { activateCompanyRunCache, clearCompanyRunCache } from './company-run-cache';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { AssistantErrorBoundary } from './AssistantErrorBoundary';
import { lazyPage, resetFailedLazyPages } from './lazy-page';
import { ThemeControl } from './ThemeControl';
import {
  commitPageEntry,
  ensurePageEntry,
  pageEntryId,
  readPageScroll,
  restorePageScroll,
  trackPageScroll,
} from './page-scroll';
import { LOCALE_STORAGE_KEY, storedLocale, storePreference } from './appearance';
import {
  appLinkPath,
  readBrowserRoute,
  writeBrowserRoute,
  resolveCompanySection,
  ROUTE_CHANGE_EVENT,
} from './routing';
import { companySections } from '../shared/company-workspace';
import {
  documentPaths,
  documentationTitle,
  type DocumentPath,
} from './content/document-navigation';
import { CompanySidebar } from './CompanySidebar';
import { CompanyRecordsProvider } from './CompanyRecordsContext';
import { CompanyHeaderContext } from './CompanyHeaderContext';
import { ShowcaseNavigation } from './showcase/ShowcaseNavigation';
import { CommandMenu } from './CommandMenu';
import { PageLoading, ToastNotice, usePageEntrance } from './Experience';
import './polish.css';
import './company-workspace.css';
import './research-shell.css';
import './showcase/lite-hermes-theme.css';
import './showcase/lite-shell.css';
import { CompanyAssistantContext, type AssistantCompany } from './company-assistant-context';
const CompanyAssistant = lazyPage(
  () => import('./CompanyAssistant'),
  (module) => module.CompanyAssistant
);

import { AppContext, type AppContextValue, type Translate, type ConfirmRequest } from './context';
import {
  Logo,
  EmptyState,
  Dialog,
  EvidenceDrawer,
  ActionMenu,
  NavigationPanel,
  Hint,
} from './components';
const Home = lazyPage(
  () => import('./pages/Home'),
  (module) => module.Home
);
const Decisions = lazyPage(
  () => import('./pages/Decisions'),
  (module) => module.Decisions
);
const CompanyWorkspacePage = lazyPage(
  () => import('./pages/CompanyWorkspace'),
  (module) => module.CompanyWorkspacePage
);
const LiteResearchPage = lazyPage(
  () => import('./showcase/LiteResearch'),
  (module) => module.LiteResearchPage
);
const CompanyQueryPage = lazyPage(
  () => import('./pages/CompanyQuery'),
  (module) => module.CompanyQueryPage
);
const AuthPage = lazyPage(
  () => import('./pages/Auth'),
  (module) => module.AuthPage
);
const AccountPage = lazyPage(
  () => import('./pages/Auth'),
  (module) => module.AccountPage
);
const WorkspacePage = lazyPage(
  () => import('./pages/Workspace'),
  (module) => module.WorkspacePage
);
const NewReview = lazyPage(
  () => import('./pages/NewReview'),
  (module) => module.NewReview
);
const MaterialsPage = lazyPage(
  () => import('./pages/NewReview'),
  (module) => module.MaterialsPage
);
const TaskPage = lazyPage(
  () => import('./pages/Report'),
  (module) => module.TaskPage
);
const ComparePage = lazyPage(
  () => import('./pages/Compare'),
  (module) => module.ComparePage
);
const DocumentationPage = lazyPage(
  () => import('./pages/Documentation'),
  (module) => module.DocumentationPage
);
const DocsHome = lazyPage(
  () => import('./pages/DocsHome'),
  (module) => module.DocsHome
);
const publicPages = ['/', '/query', '/company', '/docs', '/login', '/register', ...documentPaths];

function pageResource(path: string) {
  const page = path.split('?')[0];
  if (documentPaths.includes(page as DocumentPath)) return DocumentationPage;
  if (page.startsWith('/tasks/')) return TaskPage;
  switch (page) {
    case '/':
      return Home;
    case '/docs':
      return DocsHome;
    case '/query':
      return CompanyQueryPage;
    case '/company':
      return new URLSearchParams(path.split('?')[1]).get('experience') === 'lite'
        ? LiteResearchPage
        : CompanyWorkspacePage;
    case '/workspace':
      return WorkspacePage;
    case '/materials':
      return MaterialsPage;
    case '/decisions':
      return Decisions;
    case '/new':
      return NewReview;
    case '/compare':
      return ComparePage;
    case '/account':
      return AccountPage;
    case '/login':
    case '/register':
      return AuthPage;
  }
}

export function App() {
  const [openingPage, startPageTransition] = useTransition();
  const navigationTarget = useRef<string | null>(null);
  const [locale, setLocale] = useState<Locale>(storedLocale);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const [route, setRoute] = useState(readBrowserRoute);
  const [entryId, setEntryId] = useState(ensurePageEntry);
  const [historyEntry, setHistoryEntry] = useState(() => {
    const point = readPageScroll(history.state);
    return point ? { route: readBrowserRoute(), point } : null;
  });
  const committedRoute = useRef(route);
  const committedEntry = useRef(entryId);
  const restoringPage = useRef(false);
  const restoreCleanup = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    return () => {
      history.scrollRestoration = previous;
    };
  }, []);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [user, setUser] = useState<AccountUser | null>(null);
  useLayoutEffect(() => companyReadingMemory.changeOwner(user?.id || null), [user?.id]);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [cases, setCases] = useState<DemoCase[]>([]);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState<{
    text: string;
    error?: boolean;
    id: number;
    retryWorkspace?: boolean;
  } | null>(null);
  const [refreshingWorkspace, setRefreshingWorkspace] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [pending, setPending] = useState(0);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [confirmFailure, setConfirmFailure] = useState<{
    request: ConfirmRequest;
    text: string;
  } | null>(null);
  const [evidence, setEvidence] = useState<{ refs: EvidenceRef[]; report?: Report } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [assistantCompany, setAssistantCompany] = useState<AssistantCompany | null>(null);
  const refreshGeneration = useRef(0);
  const refreshController = useRef<AbortController | null>(null);
  const refreshFailureCause = useRef<unknown>(null);
  const committedOwner = useRef<string | null>(null);
  const committedAccount = useRef(false);
  const publishAssistantCompany = useCallback((company: AssistantCompany) => {
    if (company.owner === committedOwner.current) setAssistantCompany(company);
  }, []);
  const t: Translate = useCallback((zh, en) => (locale === 'en' ? en : zh), [locale]);
  const navigate = useCallback((path: string, options?: { replace?: boolean }) => {
    const previous = readBrowserRoute();
    if (!writeBrowserRoute(path, options?.replace)) return;
    const next = readBrowserRoute();
    navigationTarget.current = next === previous ? null : next;
    if (next === previous) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    setMenuOpen(false);
  }, []);
  useLayoutEffect(() => {
    committedRoute.current = route;
    committedEntry.current = entryId;
    commitPageEntry(entryId);
    // Scroll only once the destination has committed, never the outgoing page.
    if (navigationTarget.current !== route) return;
    navigationTarget.current = null;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [route, entryId]);
  useLayoutEffect(() => {
    if (historyEntry?.route !== route) return;
    restoringPage.current = true;
    const stop = restorePageScroll(historyEntry.point, () => {
      restoringPage.current = false;
      restoreCleanup.current = null;
    });
    restoreCleanup.current = stop;
    return stop;
  }, [historyEntry, route]);
  useEffect(
    () =>
      trackPageScroll(
        () =>
          !restoringPage.current &&
          committedEntry.current === pageEntryId(history.state) &&
          committedRoute.current === location.pathname + location.search
      ),
    []
  );
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    setRefreshingWorkspace(true);
    let sameOwnerConfirmed = false;
    try {
      const [session, nextCases] = await Promise.all([
        api<AuthSession>('/auth/session', { signal: controller.signal }).then((session) => {
          sameOwnerConfirmed = Boolean(
            session.user?.id && session.user.id === committedOwner.current
          );
          return session;
        }),
        api<DemoCase[]>('/cases', { signal: controller.signal }),
      ]);
      const nextWorkspace =
        session.user && !session.user.isGuest
          ? await api<Workspace>('/workspace', { signal: controller.signal })
          : null;
      if (controller.signal.aborted || generation !== refreshGeneration.current) return;
      const owner = session.user?.id || null;
      if (owner !== committedOwner.current) {
        if (committedOwner.current) clearCompanyRunCache(committedOwner.current);
        setAssistantCompany(null);
        setEvidence(null);
        setConfirmRequest(null);
        setConfirmFailure(null);
        setCommandOpen(false);
        setToast(null);
      }
      changeComposerOwner(committedOwner.current, owner);
      activateCompanyRunCache(owner);
      committedOwner.current = owner;
      committedAccount.current = Boolean(session.user && !session.user.isGuest);
      setDisplayTimeZone(session.user?.timezone);
      setCsrfToken(session.csrfToken);
      setUser(session.user);
      setRegistrationEnabled(session.registrationEnabled === true);
      setWorkspace(nextWorkspace);
      setCases(nextCases);
      setLoadError('');
      setRefreshFailed(false);
      refreshFailureCause.current = null;
      setToast((current) => (current?.retryWorkspace ? null : current));
      setLoaded(true);
    } catch (error) {
      if (!controller.signal.aborted && generation === refreshGeneration.current) {
        const text = requestErrorText(error, localeRef.current);
        if (
          sameOwnerConfirmed &&
          !(error instanceof RequestError && ['AUTH_REQUIRED', 'UNAUTHORIZED'].includes(error.code))
        ) {
          setLoadError('');
          setRefreshFailed(true);
          refreshFailureCause.current = error;
          setToast({
            text:
              (localeRef.current === 'en'
                ? 'Workspace refresh failed. Previously loaded data remains visible. '
                : '工作区刷新失败，仍显示上次读取的资料。') + text,
            error: true,
            retryWorkspace: true,
            id: performance.now(),
          });
          throw error;
        }
        setLoadError(text);
        if (
          error instanceof RequestError &&
          ['AUTH_REQUIRED', 'UNAUTHORIZED'].includes(error.code)
        ) {
          if (committedOwner.current) clearCompanyRunCache(committedOwner.current);
          activateCompanyRunCache(null);
        }
        setEvidence(null);
        setConfirmRequest(null);
        setMenuOpen(false);
        setCommandOpen(false);
        setToast(null);
        throw error;
      }
    } finally {
      if (refreshController.current === controller) {
        refreshController.current = null;
        setRefreshingWorkspace(false);
      }
    }
  }, []);
  const execute = useCallback(
    async <T,>(action: () => Promise<T>, success?: string) => {
      const actionOwner = committedOwner.current;
      setPending((count) => count + 1);
      try {
        const result = await action();
        if (committedOwner.current !== actionOwner) return undefined;
        await refresh();
        if (committedOwner.current !== actionOwner) return undefined;
        if (success) setToast({ text: success, id: performance.now() });
        return result;
      } catch (error) {
        if (committedOwner.current !== actionOwner) return undefined;
        if (refreshFailureCause.current !== error) {
          setToast({
            text: requestErrorText(error, locale),
            error: true,
            id: performance.now(),
          });
        }
        if (
          error instanceof RequestError &&
          ['AUTH_REQUIRED', 'UNAUTHORIZED'].includes(error.code)
        ) {
          await refresh().catch(() => undefined);
          navigate('/login');
        }
        return undefined;
      } finally {
        setPending((count) => Math.max(0, count - 1));
      }
    },
    [refresh, locale, navigate]
  );
  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);
  useEffect(() => {
    const sync = (event: Event) => {
      resetFailedLazyPages();
      const next = readBrowserRoute();
      const entry = ensurePageEntry();
      // A history traversal can also emit hashchange after its restored route commits.
      if (event.type !== 'hashchange' || entry !== committedEntry.current)
        restoreCleanup.current?.();
      const point = event.type === 'popstate' ? readPageScroll(history.state) : null;
      if (event.type === 'popstate') navigationTarget.current = null;
      startPageTransition(() => {
        setRoute(next);
        setEntryId(entry);
        if (event.type !== 'hashchange') setHistoryEntry(point ? { route: next, point } : null);
      });
      setMenuOpen(false);
    };
    const preloadLink = (event: Event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.hasAttribute('download') ||
        (link.target && link.target !== '_self') ||
        link.rel.split(/\s+/).includes('external')
      )
        return;
      const path = appLinkPath(link.getAttribute('href')!, location.origin);
      if (path)
        void pageResource(path)
          ?.preload()
          .catch(() => {});
    };
    const followLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.hasAttribute('download') ||
        (link.target && link.target !== '_self') ||
        link.rel.split(/\s+/).includes('external')
      )
        return;
      const path = appLinkPath(link.getAttribute('href')!, location.origin);
      if (!path) return;
      event.preventDefault();
      navigate(path);
    };
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    window.addEventListener(ROUTE_CHANGE_EVENT, sync);
    document.addEventListener('click', followLink);
    document.addEventListener('pointerover', preloadLink);
    document.addEventListener('focusin', preloadLink);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
      window.removeEventListener(ROUTE_CHANGE_EVENT, sync);
      document.removeEventListener('click', followLink);
      document.removeEventListener('pointerover', preloadLink);
      document.removeEventListener('focusin', preloadLink);
    };
  }, [navigate]);
  useEffect(() => {
    if (
      loadError ||
      refreshFailed ||
      !workspace?.tasks.some((task) => task.status === 'running' || task.status === 'queued')
    )
      return;
    const timer = setInterval(() => {
      if (!refreshController.current) void refresh().catch(() => {});
    }, 1000);
    return () => clearInterval(timer);
  }, [workspace, refresh, loadError, refreshFailed]);
  useEffect(() => {
    storePreference(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === LOCALE_STORAGE_KEY || event.key === null) setLocale(storedLocale());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  usePageEntrance(route);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.altKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'k'
      )
        return;
      if (
        !loaded ||
        loadError ||
        (!commandOpen && document.querySelector('[role="dialog"]:not([hidden])'))
      )
        return;
      event.preventDefault();
      if (!commandOpen) setCommandOpen(true);
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [loaded, loadError, commandOpen]);
  useEffect(() => {
    if (
      documentPaths.includes(route.split('?')[0] as DocumentPath) ||
      route.split('?')[0] === '/docs'
    )
      return;
    const titles: Record<string, string> = {
      '/query': t(...productTerms.newResearch),
      '/company': (() => {
        const section = resolveCompanySection(
          new URLSearchParams(route.split('?')[1]).get('section')
        );
        const entry = companySections.find(([id]) => id === section)!;
        return t(entry[1], entry[2]);
      })(),
      '/workspace': t(...productTerms.financialReviews),
      '/materials': t(...productTerms.materials),
      '/account': t(...productTerms.accountSettings),
      '/decisions': t(...productTerms.paymentsAndHandovers),
      '/new': t(...productTerms.newFinancialReview),
      '/compare': t(...productTerms.compareReviews),
      '/login': t('登录', 'Log in'),
      '/register': t('创建账号', 'Create account'),
    };
    const title = route.startsWith('/tasks/')
      ? workspace?.tasks.find((task) => route.split('?')[0] === `/tasks/${task.id}`)?.title ||
        t(...productTerms.reviewReport)
      : titles[route.split('?')[0]];
    document.title = title
      ? `${title} · ${t('析光', 'Prispect')}`
      : `${t('析光', 'Prispect')} · ${t(...productTagline)}`;
  }, [t, route, workspace]);
  useEffect(() => {
    for (const selector of [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]) {
      document
        .querySelector<HTMLMetaElement>(selector)
        ?.setAttribute('content', t(...productTagline));
    }
  }, [t]);
  const page = route.split('?')[0];
  const documentPage = documentPaths.includes(page as DocumentPath);
  const documentationRoute = documentPage || page === '/docs';
  const protectedPage = !publicPages.includes(page);
  const accountUser = user && !user.isGuest ? user : null;
  useEffect(() => {
    if (loaded && !loadError && page === '/register' && !registrationEnabled) {
      const query = route.includes('?') ? route.slice(route.indexOf('?')) : '';
      navigate(`/login${query}`, { replace: true });
    }
  }, [loaded, loadError, page, registrationEnabled, route, navigate]);
  useEffect(() => {
    if (loaded && !loadError && !accountUser && protectedPage)
      navigate(`/login?next=${encodeURIComponent(route)}`, { replace: true });
  }, [loaded, loadError, accountUser, protectedPage, navigate, route]);
  const value: AppContextValue = {
    locale,
    t,
    workspace,
    cases,
    user,
    registrationEnabled,
    refresh,
    navigate,
    execute,
    confirm: setConfirmRequest,
    showEvidence: (refs, report) => setEvidence({ refs, report }),
    busy: pending > 0,
    historyNavigation: historyEntry?.route === route,
  };
  const navigation = [
    ['/workspace', t(...productTerms.financialReviews)],
    ['/materials', t(...productTerms.materials)],
    ['/decisions', t(...productTerms.paymentsAndHandovers)],
    ['/compare', t(...productTerms.compareReviews)],
  ] as const;
  const sessionAvailable = loaded && !loadError;
  const showcaseHome =
    page === '/' && new URLSearchParams(route.split('?')[1]).get('view') !== 'story';
  const liteCompany =
    page === '/company' && new URLSearchParams(route.split('?')[1]).get('experience') === 'lite';
  const liteExperience = showcaseHome || liteCompany;
  const experienceRun =
    page === '/company' ? new URLSearchParams(route.split('?')[1]).get('run') : null;
  const liteLink = experienceRun ? `${companyPath(experienceRun)}&experience=lite` : '/';
  const proLink = experienceRun ? `${companyPath(experienceRun)}&cached=1` : '/query';
  const business = Boolean(
    sessionAvailable &&
      user &&
      (!protectedPage || accountUser) &&
      page !== '/' &&
      !liteCompany &&
      !['/login', '/register', '/docs', ...documentPaths].includes(page)
  );
  const currentSection = page.startsWith('/tasks/')
    ? t(...productTerms.financialReviews)
    : page === '/new'
      ? t(...productTerms.newFinancialReview)
      : page === '/account'
        ? t(...productTerms.accountSettings)
        : documentationRoute
          ? t(...documentationTitle)
          : page === '/company'
            ? t(...productTerms.companyResearch)
            : page === '/' || page === '/query'
              ? t(...productTerms.newResearch)
              : navigation.find(([path]) => path === page)?.[1];
  const accountItems = [
    {
      label: t(...productTerms.accountSettings),
      icon: <UserRound size={16} />,
      onSelect: () => navigate('/account'),
    },
    {
      label: t('退出登录', 'Log out'),
      icon: <LogOut size={16} />,
      onSelect: async () => {
        refreshGeneration.current++;
        refreshController.current?.abort();
        refreshController.current = null;
        if (committedOwner.current) clearCompanyRunCache(committedOwner.current);
        activateCompanyRunCache(null);
        changeComposerOwner(committedOwner.current, null);
        committedOwner.current = null;
        committedAccount.current = false;
        setDisplayTimeZone();
        setAssistantCompany(null);
        setCommandOpen(false);
        setToast(null);
        setUser(null);
        setWorkspace(null);
        setLoaded(false);
        setEvidence(null);
        setConfirmRequest(null);
        let signedOut = false;
        await execute(async () => {
          const response = await api('/auth/logout', { method: 'POST' });
          signedOut = true;
          setCsrfToken(null);
          await refresh();
          return response;
        });
        if (signedOut) navigate('/');
        else await refresh().catch(() => {});
      },
    },
  ];
  const renderNavigation = () => (
    <>
      <CompanySidebar route={route} onClose={() => setMenuOpen(false)} />
      <div className="sidebar-bottom">
        {accountUser ? (
          <ActionMenu
            label={t('账号菜单', 'Account menu')}
            items={accountItems}
            className="sidebar-account"
            align="start"
          >
            <span className="user-initial">{accountUser.name.slice(0, 1).toUpperCase()}</span>
            <span className="sidebar-user">
              <strong>{accountUser.name}</strong>
              <small>{accountUser.email}</small>
            </span>
          </ActionMenu>
        ) : user ? (
          <>
            <a className="sidebar-method" href="/login" onClick={() => setMenuOpen(false)}>
              <UserRound size={16} />
              {t('登录', 'Log in')}
            </a>
            {registrationEnabled && (
              <a className="sidebar-method" href="/register" onClick={() => setMenuOpen(false)}>
                <Plus size={16} />
                {t('创建账号', 'Create account')}
              </a>
            )}
          </>
        ) : null}
      </div>
    </>
  );
  return (
    <AppContext.Provider value={value}>
      <CompanyRecordsProvider key={user?.id || 'anonymous'}>
        <CompanyAssistantContext.Provider
          value={{
            company: assistantCompany?.owner === user?.id ? assistantCompany : null,
            publish: publishAssistantCompany,
          }}
        >
          <div
            className={`app-shell ${business ? 'business-shell' : 'public-shell'}${liteExperience ? ' showcase-shell lite-workspace-shell' : ''}${showcaseHome ? ' showcase-home-shell' : liteExperience ? ' showcase-research-shell' : ''}`}
          >
            <header className="site-header">
              <a className="brand-link" href="/" aria-label={t('析光首页', 'Prispect home')}>
                <Logo />
              </a>
              {business && <CompanyHeaderContext route={route} label={currentSection} />}
              {!business && !documentationRoute && (
                <nav
                  className={`navigation${liteExperience ? ' lite-header-navigation' : ''}`}
                  aria-label={t('主导航', 'Main navigation')}
                >
                  {liteExperience ? (
                    <>
                      <a
                        href="/"
                        aria-current={
                          showcaseHome && !new URLSearchParams(route.split('?')[1]).has('view')
                            ? 'page'
                            : undefined
                        }
                      >
                        {t('查公司', 'Find a company')}
                      </a>
                      <a href="/?view=guide">{t('如何阅读', 'How to read')}</a>
                    </>
                  ) : (
                    <a href="/docs">{t(...documentationTitle)}</a>
                  )}
                </nav>
              )}
              <div className="header-actions">
                {(business || documentationRoute) && (
                  <Hint label={t(...documentationTitle)}>
                    <a className="icon-button" href="/docs" aria-label={t(...documentationTitle)}>
                      <BookOpen size={17} />
                    </a>
                  </Hint>
                )}
                {sessionAvailable && (
                  <Hint label={t('搜索与跳转', 'Search and jump to')}>
                    <button
                      className="icon-button command-trigger"
                      onClick={() => setCommandOpen(true)}
                      aria-label={t('搜索与跳转', 'Search and jump to')}
                      aria-keyshortcuts="Meta+K Control+K"
                    >
                      <Search size={17} />
                    </button>
                  </Hint>
                )}
                <Hint
                  label={t(
                    '当前语言：中文，切换至 English',
                    'Current language: English. Switch to 中文'
                  )}
                >
                  <button
                    className="language-button"
                    data-locale={locale}
                    onClick={() => setLocale(locale === 'en' ? 'zh-Hans' : 'en')}
                    aria-label={t(
                      '当前语言：中文，切换至 English',
                      'Current language: English. Switch to 中文'
                    )}
                  >
                    {locale === 'en' ? 'EN' : '中'}
                  </button>
                </Hint>
                {!liteExperience && <ThemeControl />}
                {(liteExperience || page === '/query' || page === '/company') && (
                  <nav
                    className="experience-switch"
                    aria-label={t('选择版本', 'Choose experience')}
                  >
                    <a href={liteLink} aria-current={liteExperience ? 'page' : undefined}>
                      Lite
                    </a>
                    <a href={proLink} aria-current={!liteExperience ? 'page' : undefined}>
                      Pro
                    </a>
                  </nav>
                )}
                {business && (
                  <button
                    className="icon-button mobile-menu"
                    aria-label={t('打开导航', 'Open navigation')}
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen(true)}
                  >
                    <Menu size={19} />
                  </button>
                )}
                {sessionAvailable && accountUser ? (
                  <ActionMenu
                    label={`${t('账号菜单', 'Account menu')} · ${accountUser.name}`}
                    className="account-link"
                    items={accountItems}
                  >
                    <UserRound size={17} />
                    <span>{accountUser.name}</span>
                    <ChevronDown size={13} />
                  </ActionMenu>
                ) : sessionAvailable ? (
                  <>
                    <a className="login-link" href="/login">
                      {t('登录', 'Log in')}
                    </a>
                    {registrationEnabled && (
                      <a className="login-link registration-link" href="/register">
                        {t('注册', 'Sign up')}
                      </a>
                    )}
                  </>
                ) : null}
                {liteExperience && (
                  <ShowcaseNavigation homeActive={showcaseHome} proLink={proLink} />
                )}
              </div>
              {(pending > 0 || openingPage || (loaded && refreshingWorkspace)) && (
                <div
                  className="operation-progress"
                  role="status"
                  aria-label={
                    openingPage
                      ? t('正在打开页面…', 'Opening page…')
                      : t('正在处理…', 'Processing…')
                  }
                >
                  <span />
                </div>
              )}
            </header>
            {business && (
              <aside className="workspace-sidebar">
                <a className="sidebar-brand" href="/" aria-label={t('析光首页', 'Prispect home')}>
                  <Logo />
                </a>
                <button
                  className="button button-secondary sidebar-create"
                  onClick={() => navigate('/query')}
                >
                  <Plus size={16} />
                  {t(...productTerms.newResearch)}
                </button>
                {renderNavigation()}
              </aside>
            )}
            {business && menuOpen && (
              <NavigationPanel title={t('析光', 'Prispect')} onClose={() => setMenuOpen(false)}>
                <button
                  className="button button-secondary sidebar-create"
                  onClick={() => navigate('/query')}
                >
                  <Plus size={16} />
                  {t(...productTerms.newResearch)}
                </button>
                {renderNavigation()}
              </NavigationPanel>
            )}
            <main
              key={user?.id || 'anonymous'}
              id="main"
              aria-busy={openingPage || undefined}
              className={
                documentationRoute
                  ? 'main-documents'
                  : page === '/'
                    ? `main-home ${business ? 'main-app business-home' : ''}`
                    : 'main-app'
              }
              tabIndex={-1}
            >
              <RouteErrorBoundary
                resetKey={`${user?.id || 'anonymous'}:${route}`}
                t={t}
                onRetry={resetFailedLazyPages}
              >
                <Suspense fallback={<PageLoading label={t('正在打开页面…', 'Opening page…')} />}>
                  {page === '/docs' ? (
                    <DocsHome />
                  ) : documentPage ? (
                    <DocumentationPage
                      path={page as DocumentPath}
                      section={new URLSearchParams(route.split('?')[1]).get('section')}
                    />
                  ) : showcaseHome ? (
                    <Home
                      query={new URLSearchParams(route.split('?')[1])}
                      connectionError={loadError}
                    />
                  ) : loadError ? (
                    <div className="connection-error">
                      <CircleAlert />
                      <h1>{t('暂时无法连接工作区', 'Workspace is unavailable')}</h1>
                      <p>{loadError}</p>
                      <button
                        className="button button-primary"
                        onClick={() => void refresh().catch(() => {})}
                      >
                        <RefreshCw size={16} />
                        {t('重新连接', 'Reconnect')}
                      </button>
                    </div>
                  ) : !loaded ? (
                    <PageLoading label={t('正在读取工作区…', 'Loading your workspace…')} />
                  ) : page === '/' ? (
                    <Home query={new URLSearchParams(route.split('?')[1])} />
                  ) : page === '/login' ||
                    page === '/register' ||
                    !user ||
                    (protectedPage && (!accountUser || !workspace)) ? (
                    <AuthPage
                      mode={page === '/register' && registrationEnabled ? 'register' : 'login'}
                      next={
                        new URLSearchParams(route.split('?')[1]).get('next') ||
                        (protectedPage ? route : '/query')
                      }
                    />
                  ) : page === '/account' ? (
                    <AccountPage />
                  ) : page === '/workspace' ? (
                    <WorkspacePage />
                  ) : page === '/decisions' ? (
                    <Decisions key={route} query={new URLSearchParams(route.split('?')[1])} />
                  ) : page === '/query' ? (
                    <CompanyQueryPage query={new URLSearchParams(route.split('?')[1])} />
                  ) : page === '/company' ? (
                    liteCompany ? (
                      <LiteResearchPage
                        key={experienceRun || 'query'}
                        query={new URLSearchParams(route.split('?')[1])}
                      />
                    ) : (
                      <CompanyWorkspacePage
                        key={experienceRun || 'query'}
                        query={new URLSearchParams(route.split('?')[1])}
                      />
                    )
                  ) : page === '/new' ? (
                    <NewReview key={route} query={new URLSearchParams(route.split('?')[1])} />
                  ) : page === '/materials' ? (
                    <MaterialsPage
                      selectedId={new URLSearchParams(route.split('?')[1]).get('material')}
                    />
                  ) : page.startsWith('/tasks/') ? (
                    <TaskPage key={page.slice(7)} id={page.slice(7)} />
                  ) : page === '/compare' ? (
                    <ComparePage key={route} query={new URLSearchParams(route.split('?')[1])} />
                  ) : (
                    <EmptyState
                      title={t('页面不存在', 'Page not found')}
                      text={t('返回工作台继续核查。', 'Return to your workspace to continue.')}
                      action={
                        <button
                          className="button button-primary"
                          onClick={() => navigate('/workspace')}
                        >
                          {t('返回工作台', 'Go to workspace')}
                        </button>
                      }
                    />
                  )}
                </Suspense>
              </RouteErrorBoundary>
            </main>
            {!business && !showcaseHome && (
              <footer className="site-footer">
                <span>{t('© 2026 析光', '© 2026 Prispect')}</span>
                <div>
                  <a href="/docs">{t(...documentationTitle)}</a>
                </div>
              </footer>
            )}
            {sessionAvailable && (
              <AssistantErrorBoundary
                resetKey={user?.id || 'anonymous'}
                t={t}
                onRetry={resetFailedLazyPages}
              >
                <Suspense fallback={null}>
                  <CompanyAssistant key={user?.id || 'anonymous'} route={route} />
                </Suspense>
              </AssistantErrorBoundary>
            )}
            {toast && !loadError && confirmFailure?.request !== confirmRequest && (
              <ToastNotice
                key={toast.id}
                notice={toast}
                onDismiss={() => setToast(null)}
                onRetry={toast.retryWorkspace ? () => void refresh().catch(() => {}) : undefined}
                retrying={refreshingWorkspace}
              />
            )}
            {commandOpen && sessionAvailable && (
              <CommandMenu
                key={`command-${user?.id || 'anonymous'}`}
                onClose={() => setCommandOpen(false)}
              />
            )}
            {confirmRequest && sessionAvailable && (
              <Dialog
                title={confirmRequest.title}
                onClose={() => setConfirmRequest(null)}
                closeDisabled={pending > 0}
              >
                <p>{confirmRequest.text}</p>
                {confirmFailure?.request === confirmRequest && (
                  <p role="alert" className="field-error">
                    {confirmFailure.text}
                  </p>
                )}
                <div className="dialog-actions">
                  <button
                    className="button button-secondary"
                    disabled={pending > 0}
                    onClick={() => setConfirmRequest(null)}
                  >
                    {t('取消', 'Cancel')}
                  </button>
                  <button
                    className="button button-danger"
                    disabled={pending > 0}
                    onClick={async () => {
                      const request = confirmRequest;
                      const owner = committedOwner.current;
                      setConfirmFailure(null);
                      const result = await execute(async () => {
                        try {
                          await request.action();
                          return true;
                        } catch (error) {
                          if (committedOwner.current === owner)
                            setConfirmFailure({
                              request,
                              text: requestErrorText(error, localeRef.current),
                            });
                          throw error;
                        }
                      });
                      if (result)
                        setConfirmRequest((current) => (current === request ? null : current));
                    }}
                  >
                    {t('确认操作', 'Confirm')}
                  </button>
                </div>
              </Dialog>
            )}
            {evidence && sessionAvailable && (
              <EvidenceDrawer
                refs={evidence.refs}
                report={evidence.report}
                onClose={() => setEvidence(null)}
              />
            )}
          </div>
        </CompanyAssistantContext.Provider>
      </CompanyRecordsProvider>
    </AppContext.Provider>
  );
}
