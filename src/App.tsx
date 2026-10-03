import { productTerms } from '../shared/product-terms';
import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import {
  Activity,
  Building2,
  ListChecks,
  ChevronDown,
  LogOut,
  CircleAlert,
  Columns3,
  Eye,
  FolderOpen,
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
import { type Locale, setDisplayTimeZone } from './format';
import { changeComposerOwner } from './start-draft';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { AssistantErrorBoundary } from './AssistantErrorBoundary';
import { lazyPage, resetFailedLazyPages } from './lazy-page';
import { ThemeControl } from './ThemeControl';
import { LOCALE_STORAGE_KEY, storedLocale, storePreference } from './appearance';
import { appLinkPath, readBrowserRoute, writeBrowserRoute, ROUTE_CHANGE_EVENT } from './routing';
import {
  documentNavigation,
  documentPaths,
  documentationTitle,
  type DocumentPath,
} from './content/document-navigation';
import { CompanySidebar } from './CompanySidebar';
import { CompanyRecordsProvider } from './CompanyRecordsContext';
import { CommandMenu } from './CommandMenu';
import { PageLoading, ToastNotice, usePageEntrance } from './Experience';
import './polish.css';
import './company-workspace.css';
import './research-shell.css';
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
const CompanyQueryPage = lazyPage(
  () => import('./pages/CompanyQuery'),
  (module) => module.CompanyQueryPage
);
const ResearchLibraryPage = lazyPage(
  () => import('./pages/ResearchLibrary'),
  (module) => module.ResearchLibraryPage
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
const publicPages = ['/', '/docs', '/login', '/register', ...documentPaths];

export function App() {
  const [locale, setLocale] = useState<Locale>(storedLocale);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const [route, setRoute] = useState(readBrowserRoute);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [cases, setCases] = useState<DemoCase[]>([]);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState<{ text: string; error?: boolean; id: number } | null>(null);
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
  const committedOwner = useRef<string | null>(null);
  const publishAssistantCompany = useCallback((company: AssistantCompany) => {
    if (company.owner === committedOwner.current) setAssistantCompany(company);
  }, []);
  const t: Translate = useCallback((zh, en) => (locale === 'en' ? en : zh), [locale]);
  const navigate = useCallback((path: string, options?: { replace?: boolean }) => {
    if (!writeBrowserRoute(path, options?.replace)) return;
    window.scrollTo(0, 0);
    setMenuOpen(false);
  }, []);
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    try {
      const [session, nextCases] = await Promise.all([
        api<AuthSession>('/auth/session', { signal: controller.signal }),
        api<DemoCase[]>('/cases', { signal: controller.signal }),
      ]);
      const nextWorkspace = session.user
        ? await api<Workspace>('/workspace', { signal: controller.signal })
        : null;
      if (controller.signal.aborted || generation !== refreshGeneration.current) return;
      const owner = session.user?.id || null;
      if (owner !== committedOwner.current) {
        setAssistantCompany(null);
        setEvidence(null);
        setConfirmRequest(null);
        setConfirmFailure(null);
        setCommandOpen(false);
        setToast(null);
      }
      changeComposerOwner(committedOwner.current, owner);
      committedOwner.current = owner;
      setDisplayTimeZone(session.user?.timezone);
      setCsrfToken(session.csrfToken);
      setUser(session.user);
      setRegistrationEnabled(session.registrationEnabled === true);
      setWorkspace(nextWorkspace);
      setCases(nextCases);
      setLoadError('');
      setLoaded(true);
    } catch (error) {
      if (!controller.signal.aborted && generation === refreshGeneration.current) {
        setLoadError(requestErrorText(error, localeRef.current));
        setEvidence(null);
        setConfirmRequest(null);
        setMenuOpen(false);
        setCommandOpen(false);
        setToast(null);
        throw error;
      }
    } finally {
      if (refreshController.current === controller) refreshController.current = null;
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
        setToast({
          text: requestErrorText(error, locale),
          error: true,
          id: performance.now(),
        });
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
    const sync = () => {
      resetFailedLazyPages();
      setRoute(readBrowserRoute());
      setMenuOpen(false);
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
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
      window.removeEventListener(ROUTE_CHANGE_EVENT, sync);
      document.removeEventListener('click', followLink);
    };
  }, [navigate]);
  useEffect(() => {
    if (
      loadError ||
      !workspace?.tasks.some((task) => task.status === 'running' || task.status === 'queued')
    )
      return;
    const timer = setInterval(() => {
      if (!refreshController.current) void refresh().catch(() => {});
    }, 1000);
    return () => clearInterval(timer);
  }, [workspace, refresh, loadError]);
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
      '/research': t(...productTerms.researchLibrary),
      '/company': t(...productTerms.companyResearch),
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
    document.title = title ? `${title} · ${t('析光', 'Prispect')}` : t('析光 Prispect', 'Prispect');
  }, [t, route, workspace]);
  const page = route.split('?')[0];
  const documentPage = documentPaths.includes(page as DocumentPath);
  const documentationRoute = documentPage || page === '/docs';
  const protectedPage = !publicPages.includes(page);
  useEffect(() => {
    if (loaded && !loadError && page === '/register' && !registrationEnabled) {
      const query = route.includes('?') ? route.slice(route.indexOf('?')) : '';
      navigate(`/login${query}`, { replace: true });
    }
  }, [loaded, loadError, page, registrationEnabled, route, navigate]);
  useEffect(() => {
    if (loaded && !user && protectedPage) navigate(`/login?next=${encodeURIComponent(route)}`);
  }, [loaded, user, protectedPage, navigate, route]);
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
  };
  const primaryNavigation = [
    ['/research', t(...productTerms.researchLibrary), Building2],
    ['/materials', t(...productTerms.materials), FolderOpen],
    ['/decisions', t(...productTerms.paymentsAndHandovers), ListChecks],
  ] as const;
  const secondaryNavigation = [
    ['/workspace', t(...productTerms.financialReviews), Activity],
    ['/compare', t(...productTerms.compareReviews), Columns3],
  ] as const;
  const navigation = [...primaryNavigation, ...secondaryNavigation];
  const sessionAvailable = loaded && !loadError;
  const business = Boolean(
    sessionAvailable && user && !['/login', '/register', '/docs', ...documentPaths].includes(page)
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
        changeComposerOwner(committedOwner.current, null);
        committedOwner.current = null;
        setDisplayTimeZone();
        setAssistantCompany(null);
        setCommandOpen(false);
        setToast(null);
        setUser(null);
        setWorkspace(null);
        setEvidence(null);
        setConfirmRequest(null);
        const result = await execute(async () => {
          const response = await api('/auth/logout', { method: 'POST' });
          setCsrfToken(null);
          return response;
        });
        if (result) navigate('/');
        else await refresh().catch(() => {});
      },
    },
  ];
  const renderNavigation = () => (
    <>
      <nav
        className="sidebar-navigation research-primary-navigation"
        aria-label={t('工作区', 'Workspace')}
      >
        {primaryNavigation.map(([path, label, Icon]) => (
          <a
            key={path}
            href={path}
            className={page === path ? 'active' : ''}
            aria-current={page === path ? 'page' : undefined}
            onClick={() => setMenuOpen(false)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </a>
        ))}
      </nav>
      <CompanySidebar
        route={route}
        onClose={() => setMenuOpen(false)}
        tools={
          <ActionMenu
            label={t(...productTerms.reviewTools)}
            className="sidebar-tools"
            align="start"
            items={[
              {
                label: t(...productTerms.financialReviews),
                icon: <Activity size={16} />,
                onSelect: () => navigate('/workspace'),
              },
              {
                label: t(...productTerms.compareReviews),
                icon: <Columns3 size={16} />,
                onSelect: () => navigate('/compare'),
              },
            ]}
          >
            <ListChecks size={16} />
            <span>{t(...productTerms.reviewTools)}</span>
            <ChevronDown size={13} />
          </ActionMenu>
        }
      />
      <div className="sidebar-bottom">
        <a href="/docs" className="sidebar-method" onClick={() => setMenuOpen(false)}>
          <BookOpen size={16} />
          {t(...documentationTitle)}
        </a>
        {user && (
          <ActionMenu
            label={t('账号菜单', 'Account menu')}
            items={accountItems}
            className="sidebar-account"
            align="start"
          >
            <span className="user-initial">{user.name.slice(0, 1).toUpperCase()}</span>
            <span className="sidebar-user">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
          </ActionMenu>
        )}
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
          <div className={`app-shell ${business ? 'business-shell' : 'public-shell'}`}>
            <a
              className="skip-link"
              href="#main"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById('main')?.focus();
              }}
            >
              {t('跳至主要内容', 'Skip to content')}
            </a>
            <header className="site-header">
              <a className="brand-link" href="/" aria-label={t('析光首页', 'Prispect home')}>
                <Logo />
              </a>
              {business && <span className="header-context">{currentSection}</span>}
              {!business && !documentationRoute && (
                <nav className="navigation" aria-label={t('主导航', 'Main navigation')}>
                  <a href="/docs">{t(...documentationTitle)}</a>
                </nav>
              )}
              <div className="header-actions">
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
                <ThemeControl />
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
                {sessionAvailable && user ? (
                  <ActionMenu
                    label={`${t('账号菜单', 'Account menu')} · ${user.name}`}
                    className="account-link"
                    items={accountItems}
                  >
                    <UserRound size={17} />
                    <span>{user.name}</span>
                    <ChevronDown size={13} />
                  </ActionMenu>
                ) : sessionAvailable ? (
                  <a className="login-link" href="/login">
                    {t('登录', 'Log in')}
                  </a>
                ) : null}
              </div>
              {pending > 0 && (
                <div
                  className="operation-progress"
                  role="status"
                  aria-label={t('正在处理…', 'Processing…')}
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
                    user ? (
                      <CompanyQueryPage />
                    ) : (
                      <Home />
                    )
                  ) : page === '/login' || page === '/register' || !user || !workspace ? (
                    <AuthPage
                      mode={page === '/register' && registrationEnabled ? 'register' : 'login'}
                      next={new URLSearchParams(route.split('?')[1]).get('next') || '/'}
                    />
                  ) : page === '/account' ? (
                    <AccountPage />
                  ) : page === '/workspace' ? (
                    <WorkspacePage />
                  ) : page === '/decisions' ? (
                    <Decisions key={route} query={new URLSearchParams(route.split('?')[1])} />
                  ) : page === '/query' ? (
                    <CompanyQueryPage query={new URLSearchParams(route.split('?')[1])} />
                  ) : page === '/research' ? (
                    <ResearchLibraryPage />
                  ) : page === '/company' ? (
                    <CompanyWorkspacePage
                      key={new URLSearchParams(route.split('?')[1]).get('run') || 'query'}
                      query={new URLSearchParams(route.split('?')[1])}
                    />
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
            {!business && (
              <footer className="site-footer">
                <span>{t('© 2026 析光', '© 2026 Prispect')}</span>
                <div>
                  <a href="/docs">{t(...documentationTitle)}</a>
                  {documentNavigation.slice(3).map((item) => (
                    <a key={item.path} href={item.path}>
                      {t(item.label[0], item.label[1])}
                    </a>
                  ))}
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
              <ToastNotice key={toast.id} notice={toast} onDismiss={() => setToast(null)} />
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
