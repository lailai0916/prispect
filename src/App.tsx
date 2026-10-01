import { useCallback, useEffect, useState, lazy, Suspense } from 'react';
import {
  Activity,
  Building2,
  ListChecks,
  CheckCircle2,
  ChevronDown,
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

import {
  AppContext,
  type AppContextValue,
  type Translate,
  type ConfirmRequest,
  type PublicExample,
} from './context';
import { Logo, EmptyState, Dialog, EvidenceDrawer } from './components';
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
  const t: Translate = useCallback((zh, en) => (locale === 'en' ? en : zh), [locale]);
  const navigate = useCallback((path: string) => {
    location.hash = path;
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, []);
  const refresh = useCallback(async () => {
    const [session, nextCases, nextExamples] = await Promise.all([
      api<AuthSession>('/auth/session'),
      api<DemoCase[]>('/cases'),
      api<PublicExample[]>('/public/examples'),
    ]);
    setCsrfToken(session.csrfToken);
    setUser(session.user);
    setCases(nextCases);
    setExamples(nextExamples);
    setWorkspace(session.user ? await api<Workspace>('/workspace') : null);
    setLoadError('');
    setLoaded(true);
  }, []);
  const execute = useCallback(
    async <T,>(action: () => Promise<T>, success?: string) => {
      setPending((count) => count + 1);
      try {
        const result = await action();
        await refresh();
        if (success) setToast({ text: success });
        return result;
      } catch (error) {
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
    refresh().catch((error) => setLoadError(String(error.message)));
  }, [refresh]);
  useEffect(() => {
    const onHash = () => setRoute(location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    if (!workspace?.tasks.some((task) => task.status === 'running' || task.status === 'queued'))
      return;
    const timer = setInterval(() => refresh().catch(() => {}), 1000);
    return () => clearInterval(timer);
  }, [workspace, refresh]);
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
  const navigation = [
    ['/', t('首页', 'Overview'), Eye],
    ['/decisions', t('付款决定', 'Payment decisions'), ListChecks],
    ['/company', t('企业查询', 'Company lookup'), Building2],
    ['/workspace', t('工作台', 'Workspace'), Activity],
    ['/materials', t('材料', 'Materials'), FolderOpen],
    ['/compare', t('比较', 'Compare'), Columns3],
    ['/method', t('方法', 'Method'), ShieldCheck],
  ] as const;
  const business = Boolean(user && !['/', '/login', '/register'].includes(page));
  const currentSection = page.startsWith('/tasks/')
    ? t('核查', 'Review')
    : page === '/new'
      ? t('新建核查', 'New review')
      : page === '/account'
        ? t('账号', 'Account')
        : navigation.find(([path]) => path === page)?.[1];
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
            <nav
              className={menuOpen ? 'navigation navigation-open' : 'navigation'}
              aria-label={t('主导航', 'Main navigation')}
            >
              {navigation
                .filter(([path]) => Boolean(user) || ['/', '/method'].includes(path))
                .map(([path, label]) => (
                  <a
                    key={path}
                    href={`#${path}`}
                    className={page === path ? 'active' : ''}
                    aria-current={page === path ? 'page' : undefined}
                    onClick={() => setMenuOpen(false)}
                  >
                    {label}
                  </a>
                ))}
            </nav>
          )}
          <div className="header-actions">
            <button
              className="language-button"
              onClick={() => setLocale(locale === 'en' ? 'zh-Hans' : 'en')}
              aria-label={t('Switch to English', '切换至中文')}
            >
              {locale === 'en' ? '中文' : 'EN'}
            </button>
            {user ? (
              <a className="account-link" href="#/account" title={user.email}>
                <UserRound size={17} />
                <span>{user.name}</span>
              </a>
            ) : (
              <a className="login-link" href="#/login">
                {t('登录', 'Log in')}
              </a>
            )}
            {!business && (
              <button
                className="button button-primary header-create"
                onClick={() => navigate('/decisions?new=external')}
              >
                <Plus size={16} />
                {t('新建决定', 'New decision')}
              </button>
            )}
            <button
              className="icon-button mobile-menu"
              aria-label={
                menuOpen ? t('关闭导航', 'Close navigation') : t('打开导航', 'Open navigation')
              }
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </header>
        {business && (
          <aside className={`workspace-sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
            <a className="sidebar-brand" href="#/" aria-label={t('照见首页', 'CashLens home')}>
              <Logo />
            </a>
            <button
              className="button button-primary sidebar-create"
              onClick={() => navigate('/decisions?new=external')}
            >
              <Plus size={16} />
              {t('新建决定', 'New decision')}
            </button>
            <nav
              className="sidebar-navigation"
              aria-label={t('工作区导航', 'Workspace navigation')}
            >
              {navigation.map(([path, label, Icon]) => {
                const active =
                  page === path || (path === '/workspace' && page.startsWith('/tasks/'));
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
            </nav>
            <div className="sidebar-bottom">
              <a
                href="#/account"
                className={page === '/account' ? 'sidebar-account active' : 'sidebar-account'}
                onClick={() => setMenuOpen(false)}
              >
                <span className="user-initial">{user!.name.slice(0, 1).toUpperCase()}</span>
                <span>
                  <strong>{user!.name}</strong>
                  <small>{user!.email}</small>
                </span>
              </a>
            </div>
          </aside>
        )}
        <main id="main" className={page === '/' ? 'main-home' : 'main-app'} tabIndex={-1}>
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
                  onClick={() => refresh().catch((error) => setLoadError(error.message))}
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
                next={new URLSearchParams(route.split('?')[1]).get('next') || '/workspace'}
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
        {toast && (
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
        {confirmRequest && (
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
        {evidence && (
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
