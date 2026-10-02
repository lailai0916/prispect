import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Building2,
  ChartNoAxesCombined,
  Table2,
  ListChecks,
  FolderSearch,
  ScanSearch,
  GitCompareArrows,
  LoaderCircle,
  RefreshCw,
  X,
} from 'lucide-react';
import type { CompanyRecordSummary } from '../shared/company-workspace';
import { companySections, companyPath } from '../shared/company-workspace';
import { api, requestErrorText } from './api';
import { useApp } from './context';
import { resolveCompanySection } from './routing';
import { Hint } from './components';

export const COMPANY_RECORDS_EVENT = 'prispect:company-records-changed';
const icons = [
  Building2,
  ChartNoAxesCombined,
  Table2,
  ListChecks,
  FolderSearch,
  ScanSearch,
  GitCompareArrows,
];

const sameCompany = (first: CompanyRecordSummary, second: CompanyRecordSummary) =>
  first.input.securityCode === second.input.securityCode &&
  first.input.orgId === second.input.orgId &&
  first.name === second.name;

export function CompanySidebar({
  route,
  onClose,
  tools,
}: {
  route: string;
  onClose: () => void;
  tools: ReactNode;
}) {
  const { user, locale, t, execute, navigate } = useApp();
  const [records, setRecords] = useState<CompanyRecordSummary[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [deleting, setDeleting] = useState<string[]>([]);
  const pendingDeletes = useRef(new Set<string>());
  const focusAfterDelete = useRef<{
    owner: string;
    id: string;
    preferred: HTMLAnchorElement | null;
  } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const latest = useRef({ owner: user?.id, route, records });
  latest.current = { owner: user?.id, route, records };
  const query = new URLSearchParams(route.split('?')[1]);
  const currentId = query.get('run');
  const section = resolveCompanySection(query.get('section'));
  useEffect(() => {
    setRecords([]);
    setError('');
    setLoading(true);
    setDeleting([]);
    focusAfterDelete.current = null;
  }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    let generation = 0;
    let timer: ReturnType<typeof setTimeout>;
    const load = () => {
      clearTimeout(timer);
      const current = ++generation;
      void api<CompanyRecordSummary[]>('/company-records', { signal: controller.signal })
        .then((next) => {
          if (!controller.signal.aborted && current === generation) {
            setRecords(next);
            setError('');
            setLoading(false);
            if (
              next.some(
                (run) => run.deletionBlocked || run.status === 'queued' || run.status === 'running'
              )
            )
              timer = setTimeout(load, 2500);
          }
        })
        .catch((cause) => {
          if (!controller.signal.aborted && current === generation) {
            setError(requestErrorText(cause, locale));
            setLoading(false);
          }
        });
    };
    load();
    window.addEventListener(COMPANY_RECORDS_EVENT, load);
    return () => {
      clearTimeout(timer);
      controller.abort();
      window.removeEventListener(COMPANY_RECORDS_EVENT, load);
    };
  }, [user?.id, locale, revision]);
  useEffect(() => {
    const focus = focusAfterDelete.current;
    if (!focus || focus.owner !== user?.id || records.some((run) => run.id === focus.id)) return;
    focusAfterDelete.current = null;
    const available = Array.from(
      list.current?.querySelectorAll<HTMLAnchorElement>('a.sidebar-company') || []
    ).filter((link) => {
      const id = new URL(link.href).searchParams.get('run');
      return id && id !== focus.id && !pendingDeletes.current.has(`${focus.owner}:${id}`);
    });
    const target =
      (focus.preferred && available.includes(focus.preferred) ? focus.preferred : available[0]) ||
      list.current
        ?.closest('.workspace-sidebar, .navigation-panel-body')
        ?.querySelector<HTMLButtonElement>('.sidebar-create');
    target?.focus({ preventScroll: true });
  }, [records, user?.id]);
  const sorted = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selected = records.find((run) => run.id === currentId);
  const companies = sorted
    .filter((run, index) => sorted.findIndex((item) => sameCompany(item, run)) === index)
    .map((run) => (selected && sameCompany(selected, run) ? selected : run));
  const current = selected || companies[0];
  const remove = async (run: CompanyRecordSummary, button: HTMLButtonElement) => {
    if (!user) return;
    const owner = user.id;
    const key = `${owner}:${run.id}`;
    if (pendingDeletes.current.has(key)) return;
    pendingDeletes.current.add(key);
    setDeleting((previous) => [...previous, run.id]);
    try {
      await execute(
        async () => {
          await api(`/company-runs/${encodeURIComponent(run.id)}`, { method: 'DELETE' });
          if (latest.current.owner !== owner) return;
          const restoreFocus = document.activeElement === button;
          const row = button.closest('.sidebar-company-row');
          const nextLink =
            row?.nextElementSibling?.querySelector<HTMLAnchorElement>('a') ||
            row?.previousElementSibling?.querySelector<HTMLAnchorElement>('a');
          if (restoreFocus)
            focusAfterDelete.current = { owner, id: run.id, preferred: nextLink || null };
          const remaining = latest.current.records.filter((record) => record.id !== run.id);
          setRecords((previous) => previous.filter((record) => record.id !== run.id));
          window.dispatchEvent(new Event(COMPANY_RECORDS_EVENT));
          const currentQuery = new URLSearchParams(latest.current.route.split('?')[1]);
          if (
            latest.current.route.split('?')[0] === '/company' &&
            currentQuery.get('run') === run.id
          ) {
            const next = remaining
              .filter((record) => !pendingDeletes.current.has(`${owner}:${record.id}`))
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
            navigate(
              next
                ? companyPath(next.id, resolveCompanySection(currentQuery.get('section')))
                : '/query',
              { replace: true }
            );
          }
          return true;
        },
        t('查询记录已删除', 'Query record deleted')
      );
    } finally {
      pendingDeletes.current.delete(key);
      if (latest.current.owner === owner)
        setDeleting((previous) => previous.filter((id) => id !== run.id));
    }
  };
  return (
    <>
      <nav
        className="sidebar-navigation company-sidebar-navigation"
        aria-label={t('企业功能', 'Company pages')}
      >
        {companySections.map(([id, zh, en], index) => {
          const Icon = icons[index]!;
          const href = current ? companyPath(current.id, id) : `/query?section=${id}`;
          const active = route.startsWith('/company?') && section === id;
          return (
            <a
              key={id}
              href={href}
              className={active ? 'active' : ''}
              aria-current={active ? 'page' : undefined}
              onClick={onClose}
            >
              <Icon size={16} />
              <span>{t(zh, en)}</span>
            </a>
          );
        })}
      </nav>
      {tools}
      <section className="sidebar-companies" aria-label={t('已载入企业', 'Loaded companies')}>
        <span className="sidebar-group-label">{t('已载入企业', 'Loaded companies')}</span>
        <div
          className="sidebar-company-list"
          ref={list}
          tabIndex={companies.length ? 0 : undefined}
        >
          {loading && (
            <span className="sidebar-history-state">
              <LoaderCircle size={13} className="spinner" />
              {t('正在读取…', 'Loading…')}
            </span>
          )}
          {error && (
            <div className="sidebar-history-state" role="alert">
              <span>{error}</span>
              <button className="text-link" onClick={() => setRevision((value) => value + 1)}>
                <RefreshCw size={12} />
                {t('重试', 'Retry')}
              </button>
            </div>
          )}
          {!loading && !error && !companies.length && (
            <p className="sidebar-history-state">
              {t('查询后，企业会保存在这里。', 'Companies appear here after a search.')}
            </p>
          )}
          {companies.map((run) => {
            const active = currentId === run.id;
            const removing = deleting.includes(run.id);
            const running =
              run.deletionBlocked || run.status === 'queued' || run.status === 'running';
            const deleteLabel = t(
              `删除 ${run.name} 的 ${run.input.year} 年查询记录`,
              `Delete query for ${run.name}, ${run.input.year}`
            );
            return (
              <div
                key={run.id}
                className={`sidebar-company-row ${active ? 'active' : ''}`}
                aria-busy={removing || undefined}
              >
                <a
                  href={companyPath(run.id, section)}
                  className={`sidebar-company ${active ? 'active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={onClose}
                >
                  <span>{run.name}</span>
                  <small>
                    {run.input.securityCode || t('信息缺口', 'Information gap')} · {run.input.year}
                  </small>
                </a>
                <Hint
                  label={
                    running
                      ? t(
                          '查询或分析进行中，完成后可删除',
                          'Query or analysis in progress. Delete after it finishes.'
                        )
                      : removing
                        ? t('正在删除…', 'Deleting…')
                        : deleteLabel
                  }
                >
                  <button
                    type="button"
                    className="sidebar-company-delete icon-button"
                    aria-label={deleteLabel}
                    aria-disabled={removing || running || undefined}
                    onClick={(event) => {
                      if (!removing && !running) void remove(run, event.currentTarget);
                    }}
                  >
                    {removing || running ? (
                      <LoaderCircle size={13} className="spinner" aria-hidden="true" />
                    ) : (
                      <X size={14} aria-hidden="true" />
                    )}
                  </button>
                </Hint>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
