import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import {
  Activity,
  Building2,
  ListChecks,
  CheckCircle2,
  ChevronDown,
  LogOut,
  CircleAlert,
  Columns3,
  Eye,
  FolderOpen,
  LoaderCircle,
  Menu,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
  UserRound,
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
import { type Locale } from './format';
import { changeComposerOwner } from './start-draft';

import {
  AppContext,
  type AppContextValue,
  type Translate,
  type ConfirmRequest,
  type PublicExample,
} from './context';
import {
  Logo,
  EmptyState,
  Dialog,
  EvidenceDrawer,
  ActionMenu,
  NavigationPanel,
  Hint,
} from './components';
const Home = lazy(() => import('./pages/Home').then((module) => ({ default: module.Home })));
const Decisions = lazy(() =>
  import('./pages/Decisions').then((module) => ({ default: module.Decisions }))
);
const CompanyAgentPage = lazy(() =>
  import('./pages/CompanyAgent').then((module) => ({ default: module.CompanyAgentPage }))
);
const AuthPage = lazy(() =>
  import('./pages/Auth').then((module) => ({ default: module.AuthPage }))
);
const AccountPage = lazy(() =>
  import('./pages/Auth').then((module) => ({ default: module.AccountPage }))
);
const WorkspacePage = lazy(() =>
  import('./pages/Workspace').then((module) => ({ default: module.WorkspacePage }))
);
const NewReview = lazy(() =>
  import('./pages/NewReview').then((module) => ({ default: module.NewReview }))
);
const MaterialsPage = lazy(() =>
  import('./pages/NewReview').then((module) => ({ default: module.MaterialsPage }))
);
const TaskPage = lazy(() =>
  import('./pages/Report').then((module) => ({ default: module.TaskPage }))
);
const ComparePage = lazy(() =>
  import('./pages/Compare').then((module) => ({ default: module.ComparePage }))
);
const MethodPage = lazy(() =>
  import('./pages/Method').then((module) => ({ default: module.MethodPage }))
);

export function App() {
  const [locale, setLocale] = useState<Locale>(() =>
    localStorage.getItem('cashlens-locale') === 'en' ? 'en' : 'zh-Hans'
  );
  const [route, setRoute] = useState(() => location.hash.slice(1) || '/');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [examples, setExamples] = useState<PublicExample[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cases, setCases] = useState<DemoCase[]>([]);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, setPending] = useState(0);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [evidence, setEvidence] = useState<{ refs: EvidenceRef[]; report?: Report } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const refreshGeneration = useRef(0);
  const refreshController = useRef<AbortController | null>(null);
  const committedOwner = useRef<string | null>(null);
  const t: Translate = useCallback((zh, en) => (locale === 'en' ? en : zh), [locale]);
  const navigate = useCallback((path: string, options?: { replace?: boolean }) => {
    if (options?.replace) {
      history.replaceState(history.state, '', `#${path}`);
      setRoute(path);
    } else location.hash = path;
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, []);
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    try {
      const [session, nextCases, nextExamples] = await Promise.all([
        api<AuthSession>('/auth/session', { signal: controller.signal }),
        api<DemoCase[]>('/cases', { signal: controller.signal }),
        api<PublicExample[]>('/public/examples', { signal: controller.signal }),
      ]);
      const nextWorkspace = session.user
        ? await api<Workspace>('/workspace', { signal: controller.signal })
        : null;
      if (controller.signal.aborted || generation !== refreshGeneration.current) return;
      const owner = session.user?.id || null;
      if (owner !== committedOwner.current) {
        setEvidence(null);
        setConfirmRequest(null);
      }
      changeComposerOwner(committedOwner.current, owner);
      committedOwner.current = owner;
      setCsrfToken(session.csrfToken);
      setUser(session.user);
      setWorkspace(nextWorkspace);
      setCases(nextCases);
      setExamples(nextExamples);
      setLoadError('');
      setLoaded(true);
    } catch (error) {
      if (!controller.signal.aborted && generation === refreshGeneration.current) {
        setLoadError(requestErrorText(error, locale));
        setEvidence(null);
        setConfirmRequest(null);
        setMenuOpen(false);
        setToast(null);
        throw error;
      }
    } finally {
      if (refreshController.current === controller) refreshController.current = null;
    }
  }, [locale]);
  const execute = useCallback(
    async <T,>(action: () => Promise<T>, success?: string) => {
      const actionOwner = committedOwner.current;
      setPending((count) => count + 1);
      try {
        const result = await action();
        if (committedOwner.current !== actionOwner) return undefined;
        await refresh();
        if (committedOwner.current !== actionOwner) return undefined;
        if (success) setToast({ text: success });
        return result;
      } catch (error) {
        if (committedOwner.current !== actionOwner) return undefined;
        setToast({
          text: requestErrorText(error, locale),
          error: true,
        });
        if (
          error instanceof RequestError &&
          ['AUTH_REQUIRED', 'UNAUTHORIZED'].includes(error.code)
        ) {
          await refresh();
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
    const onHash = () => setRoute(location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
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
    localStorage.setItem('cashlens-locale', locale);
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    document.title = t('照见 CashLens', 'CashLens');
  }, [t, route]);
  const page = route.split('?')[0];
  const protectedPage = !['/', '/method', '/login', '/register'].includes(page);
  useEffect(() => {
    if (loaded && !user && protectedPage) navigate(`/login?next=${encodeURIComponent(route)}`);
  }, [loaded, user, protectedPage, navigate, route]);
  const value: AppContextValue = {
    locale,
    t,
    workspace,
    cases,
    user,
    examples,
    refresh,
    navigate,
    execute,
    confirm: setConfirmRequest,
    showEvidence: (refs, report) => setEvidence({ refs, report }),
    busy: pending > 0,
  };
  const primaryNavigation = [
    ['/decisions', t('核查事项', 'Reviews'), ListChecks],
    ['/company', t('公司查询', 'Company lookup'), Building2],
    ['/materials', t('材料', 'Materials'), FolderOpen],
  ] as const;
  const secondaryNavigation = [
    ['/workspace', t('财报核查', 'Financial reviews'), Activity],
    ['/compare', t('核查比较', 'Compare reviews'), Columns3],
  ] as const;
  const navigation = [...primaryNavigation, ...secondaryNavigation];
  const sessionAvailable = loaded && !loadError;
  const business = Boolean(sessionAvailable && user && !['/login', '/register'].includes(page));
  const currentSection = page.startsWith('/tasks/')
    ? t('财报核查', 'Financial review')
    : page === '/new'
      ? t('新建财报核查', 'New financial review')
      : page === '/account'
        ? t('账号', 'Account')
        : page === '/method'
          ? t('方法', 'Method')
          : page === '/'
            ? t('开始', 'Start')
            : navigation.find(([path]) => path === page)?.[1];
  const accountItems = [
    {
      label: t('账号设置', 'Account settings'),
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
      <nav className="sidebar-navigation" aria-label={t('主导航', 'Main navigation')}>
        <a
          href="#/"
          className={page === '/' ? 'active' : ''}
          aria-current={page === '/' ? 'page' : undefined}
          onClick={() => setMenuOpen(false)}
        >
          <Eye size={16} />
          <span>{t('开始', 'Start')}</span>
        </a>
        <div className="sidebar-group">
          {primaryNavigation.map(([path, label, Icon]) => (
            <a
              key={path}
              href={`#${path}`}
              className={page === path ? 'active' : ''}
              aria-current={page === path ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </a>
          ))}
        </div>
        <div className="sidebar-group sidebar-secondary">
          <span className="sidebar-group-label">{t('财务工具', 'Financial tools')}</span>
          {secondaryNavigation.map(([path, label, Icon]) => {
            const active =
              page === path ||
              (path === '/workspace' && (page.startsWith('/tasks/') || page === '/new'));
            return (
              <a
                key={path}
                href={`#${path}`}
                className={active ? 'active' : ''}
                aria-current={active ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={16} />
                <span>{label}</span>
              </a>
            );
          })}
        </div>
      </nav>
      <div className="sidebar-bottom">
        <a
          href="#/method"
          className={`sidebar-method ${page === '/method' ? 'active' : ''}`}
          onClick={() => setMenuOpen(false)}
        >
          <ShieldCheck size={16} />
          {t('方法与隐私', 'Method and privacy')}
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
            <ChevronDown size={14} />
          </ActionMenu>
        )}
      </div>
    </>
  );
  return (
    <AppContext.Provider value={value}>
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
          <a className="brand-link" href="#/" aria-label={t('照见首页', 'CashLens home')}>
            <Logo />
          </a>
          {business && <span className="header-context">{currentSection}</span>}
          {!business && (
            <nav className="navigation" aria-label={t('主导航', 'Main navigation')}>
              <a
                href="#/method"
                className={page === '/method' ? 'active' : ''}
                aria-current={page === '/method' ? 'page' : undefined}
              >
                {t('方法', 'Method')}
              </a>
            </nav>
          )}
          <div className="header-actions">
            <Hint label={t('切换语言', 'Change language')}>
              <button
                className="language-button"
                onClick={() => setLocale(locale === 'en' ? 'zh-Hans' : 'en')}
                aria-label={t('Switch to English', '切换至中文')}
              >
                {locale === 'en' ? '中文' : 'EN'}
              </button>
            </Hint>
            {sessionAvailable && user ? (
              <ActionMenu
                label={t('账号菜单', 'Account menu')}
                className="account-link"
                items={accountItems}
              >
                <UserRound size={17} />
                <span>{user.name}</span>
                <ChevronDown size={13} />
              </ActionMenu>
            ) : sessionAvailable ? (
              <a className="login-link" href="#/login">
                {t('登录', 'Log in')}
              </a>
            ) : null}
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
          </div>
        </header>
        {business && (
          <aside className="workspace-sidebar">
            <a className="sidebar-brand" href="#/" aria-label={t('照见首页', 'CashLens home')}>
              <Logo />
            </a>
            <button
              className="button button-secondary sidebar-create"
              onClick={() => navigate('/')}
            >
              <Plus size={16} />
              {t('新建事项', 'New matter')}
            </button>
            {renderNavigation()}
          </aside>
        )}
        {business && menuOpen && (
          <NavigationPanel title={t('照见', 'CashLens')} onClose={() => setMenuOpen(false)}>
            <button
              className="button button-secondary sidebar-create"
              onClick={() => navigate('/')}
            >
              <Plus size={16} />
              {t('新建事项', 'New matter')}
            </button>
            {renderNavigation()}
          </NavigationPanel>
        )}
        <main
          key={user?.id || 'anonymous'}
          id="main"
          className={
            page === '/' ? `main-home ${business ? 'main-app business-home' : ''}` : 'main-app'
          }
          tabIndex={-1}
        >
          <Suspense
            fallback={
              <div className="loading-page">
                <LoaderCircle className="spinner" />
                <p>{t('正在打开页面…', 'Opening page…')}</p>
              </div>
            }
          >
            {loadError ? (
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
              <div className="loading-page">
                <LoaderCircle className="spinner" />
                <p>{t('正在读取工作区…', 'Loading your workspace…')}</p>
              </div>
            ) : page === '/' ? (
              <Home />
            ) : page === '/method' ? (
              <MethodPage />
            ) : page === '/login' || page === '/register' || !user || !workspace ? (
              <AuthPage
                mode={page === '/register' ? 'register' : 'login'}
                next={new URLSearchParams(route.split('?')[1]).get('next') || '/'}
              />
            ) : page === '/account' ? (
              <AccountPage />
            ) : page === '/workspace' ? (
              <WorkspacePage />
            ) : page === '/decisions' ? (
              <Decisions key={route} query={new URLSearchParams(route.split('?')[1])} />
            ) : page === '/company' ? (
              <CompanyAgentPage key={route} query={new URLSearchParams(route.split('?')[1])} />
            ) : page === '/new' ? (
              <NewReview key={route} query={new URLSearchParams(route.split('?')[1])} />
            ) : page === '/materials' ? (
              <MaterialsPage />
            ) : page.startsWith('/tasks/') ? (
              <TaskPage id={page.slice(7)} />
            ) : page === '/compare' ? (
              <ComparePage key={route} query={new URLSearchParams(route.split('?')[1])} />
            ) : (
              <EmptyState
                title={t('页面不存在', 'Page not found')}
                text={t('返回工作台继续核查。', 'Return to your workspace to continue.')}
                action={
                  <button className="button button-primary" onClick={() => navigate('/workspace')}>
                    {t('返回工作台', 'Go to workspace')}
                  </button>
                }
              />
            )}
          </Suspense>
        </main>
        {!business && (
          <footer className="site-footer">
            <span>CashLens</span>
            <div>
              <a href="#/method">{t('方法', 'Method')}</a>
              <a href="#/method?section=privacy">{t('数据与隐私', 'Data and privacy')}</a>
              <a
                className="legal-link"
                href="/third-party-notices.txt"
                target="_blank"
                rel="noreferrer"
              >
                {t('第三方许可', 'Third-party notices')}
              </a>
            </div>
          </footer>
        )}
        {toast && !loadError && (
          <div
            role={toast.error ? 'alert' : 'status'}
            className={`toast ${toast.error ? 'toast-error' : ''}`}
          >
            {toast.error ? <CircleAlert size={18} /> : <CheckCircle2 size={18} />}
            <span>{toast.text}</span>
            <button
              className="icon-button"
              onClick={() => setToast(null)}
              aria-label={t('关闭提示', 'Dismiss message')}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {confirmRequest && sessionAvailable && (
          <Dialog title={confirmRequest.title} onClose={() => setConfirmRequest(null)}>
            <p>{confirmRequest.text}</p>
            <div className="dialog-actions">
              <button className="button button-secondary" onClick={() => setConfirmRequest(null)}>
                {t('取消', 'Cancel')}
              </button>
              <button
                className="button button-danger"
                disabled={pending > 0}
                onClick={async () => {
                  await execute(confirmRequest.action);
                  setConfirmRequest(null);
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
    </AppContext.Provider>
  );
}
