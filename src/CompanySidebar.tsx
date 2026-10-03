import { productTerms } from '../shared/product-terms';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, LoaderCircle, RefreshCw, X } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import type { CompanyRecordSummary } from '../shared/company-workspace';
import { companyPath } from '../shared/company-workspace';
import {
  companyNavigationItems,
  companyRecordsByCreation,
  selectCompanyNavigationTarget,
} from '../shared/company-navigation';
import { api } from './api';
import { useCompanyRecords } from './CompanyRecordsContext';
import { COMPANY_RECORDS_EVENT } from './company-record-events';
import { useApp } from './context';
import { resolveCompanySection } from './routing';
import { Hint } from './components';
import { CompanyAssistantContext } from './company-assistant-context';
import {
  COMPANY_CACHE_EVENT,
  readCachedCompanyRun,
  type CompanyCacheInvalidation,
} from './company-run-cache';
import { CompanyNavigationPreview } from './CompanyNavigationPreview';
import { matchingCompanyNavigationRun } from './company-navigation-preview';

export { COMPANY_RECORDS_EVENT } from './company-record-events';
type NavigationSection = (typeof companyNavigationItems)[number][0];
const navigationDescriptions: Record<NavigationSection, readonly [string, string]> = {
  overview: ['先看判断，再查依据', 'Start with the judgment and its evidence'],
  trends: ['看看这些年如何变化', 'See how the numbers changed over time'],
  industry: ['放到同行中看', 'Compare with companies in the same industry'],
  disclosures: ['从已取得的公告继续核对', 'Explore announcements already retrieved'],
  profile: ['认识企业，再多查一步', 'Get to know the company and check further'],
  coverage: ['看看已取得什么、还缺什么', 'See what is available and what is missing'],
  sources: ['核对不同来源的数字', 'Check figures across their sources'],
};

const sameCompany = (first: CompanyRecordSummary, second: CompanyRecordSummary) =>
  first.input.securityCode === second.input.securityCode &&
  first.input.orgId === second.input.orgId &&
  first.name === second.name;

export function CompanySidebar({ route, onClose }: { route: string; onClose: () => void }) {
  const { user, t, execute, navigate } = useApp();
  const { records, error, loading, reload, removeLocal, isCurrentOwner } = useCompanyRecords();
  const { company } = useContext(CompanyAssistantContext);
  const previewId = useId();
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
  const url = new URL(route, 'https://prispect.com');
  const query = url.searchParams;
  const companyPage = url.pathname === '/company';
  const currentId = query.get('run');
  const section = resolveCompanySection(query.get('section'));
  const menuSection: NavigationSection =
    section === 'financial' ? 'trends' : section === 'evidence' ? 'overview' : section;
  const current = selectCompanyNavigationTarget(route, records);
  const [previewSection, setPreviewSection] = useState<NavigationSection>(menuSection);
  const [invalidated, setInvalidated] = useState('');
  const [cached, setCached] = useState<{
    owner: string;
    run: CompanyResearchRun;
  } | null>(null);
  const currentScope = current
    ? `${current.id}:${current.input.securityCode}:${current.input.orgId}:${current.input.year}`
    : '';
  useEffect(() => {
    setPreviewSection(companyPage ? menuSection : 'overview');
  }, [companyPage, menuSection, currentScope, user?.id]);
  useEffect(() => {
    const owner = user?.id;
    const id = current?.id;
    const read = () => {
      const run = owner && id ? readCachedCompanyRun(owner, id) : null;
      setCached(owner && run ? { owner, run } : null);
      if (run) setInvalidated('');
    };
    setInvalidated('');
    read();
    const invalidate = (event: Event) => {
      const detail = (event as CustomEvent<CompanyCacheInvalidation>).detail;
      if (detail?.owner === owner && id && detail.ids.includes(id)) {
        setCached(null);
        setInvalidated(`${owner}:${id}`);
      }
    };
    const update = (event: Event) => {
      if (event instanceof CustomEvent && event.detail === id) read();
    };
    window.addEventListener(COMPANY_CACHE_EVENT, invalidate);
    window.addEventListener('prispect:company-run-updated', update);
    return () => {
      window.removeEventListener(COMPANY_CACHE_EVENT, invalidate);
      window.removeEventListener('prispect:company-run-updated', update);
    };
    // Read the selected public snapshot once per scope. Hover changes presentation only.
  }, [currentScope, user?.id]);
  const previewRun =
    invalidated === `${user?.id}:${current?.id}`
      ? null
      : matchingCompanyNavigationRun(current, company, user?.id || null) ||
        matchingCompanyNavigationRun(current, cached, user?.id || null);
  const previewBasis = previewRun === company?.run ? company.basis : 'parent';
  useEffect(() => {
    setDeleting([]);
    focusAfterDelete.current = null;
  }, [user?.id]);
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
        ?.closest('.workspace-sidebar, .navigation-panel-body, .research-navigation-popup')
        ?.querySelector<HTMLButtonElement>('.sidebar-create, .research-navigation-new');
    target?.focus({ preventScroll: true });
  }, [records, user?.id]);
  const sorted = companyRecordsByCreation(records);
  const selected = companyPage ? records.find((run) => run.id === currentId) : undefined;
  const companies = sorted
    .filter((run, index) => sorted.findIndex((item) => sameCompany(item, run)) === index)
    .map((run) => (selected && sameCompany(selected, run) ? selected : run));
  const remove = async (run: CompanyRecordSummary, button: HTMLButtonElement) => {
    if (!user) return;
    const owner = user.id;
    const key = `${owner}:${run.id}`;
    if (pendingDeletes.current.has(key)) return;
    // Native disabled controls leave the tab order. Keep keyboard focus on the
    // record while deleting, then restore it to an adjacent surviving record.
    const focusedLink = button
      .closest('.sidebar-company-row')
      ?.querySelector<HTMLAnchorElement>('a');
    if (document.activeElement === button) focusedLink?.focus({ preventScroll: true });
    pendingDeletes.current.add(key);
    setDeleting((previous) => [...previous, run.id]);
    try {
      await execute(
        async () => {
          await api(`/company-runs/${encodeURIComponent(run.id)}`, { method: 'DELETE' });
          if (!isCurrentOwner() || latest.current.owner !== owner) return;
          const restoreFocus = document.activeElement === focusedLink;
          const row = button.closest('.sidebar-company-row');
          const nextLink =
            row?.nextElementSibling?.querySelector<HTMLAnchorElement>('a') ||
            row?.previousElementSibling?.querySelector<HTMLAnchorElement>('a');
          if (restoreFocus)
            focusAfterDelete.current = { owner, id: run.id, preferred: nextLink || null };
          const remaining = latest.current.records.filter((record) => record.id !== run.id);
          removeLocal(run.id);
          window.dispatchEvent(new Event(COMPANY_RECORDS_EVENT));
          const currentUrl = new URL(latest.current.route, 'https://prispect.com');
          const currentQuery = currentUrl.searchParams;
          if (currentUrl.pathname === '/company' && currentQuery.get('run') === run.id) {
            const next = selectCompanyNavigationTarget(
              '/query',
              remaining.filter((record) => !pendingDeletes.current.has(`${owner}:${record.id}`))
            );
            navigate(
              next
                ? companyPath(next.id, resolveCompanySection(currentQuery.get('section')))
                : '/query',
              { replace: true }
            );
          }
          return true;
        },
        t('研究记录已删除', 'Research record deleted')
      );
    } finally {
      pendingDeletes.current.delete(key);
      if (isCurrentOwner() && latest.current.owner === owner)
        setDeleting((previous) => previous.filter((id) => id !== run.id));
    }
  };
  return (
    <div className="company-navigation-menu">
      <div className="company-navigation-menu-side">
        <section
          className="company-navigation-destinations"
          aria-label={t('企业研究', 'Company research')}
        >
          <div className="company-navigation-context">
            <span>{t('从判断到依据', 'From judgment to evidence')}</span>
            <strong>{current?.name || t('从一家企业开始', 'Start with a company')}</strong>
            {current && (
              <small>
                {current.input.securityCode} · {current.input.year}
              </small>
            )}
          </div>
          <nav className="company-navigation-links" aria-label={t('企业功能', 'Company pages')}>
            {companyNavigationItems.map(([id, zh, en], index) => {
              if (!current)
                return (
                  <button
                    key={id}
                    type="button"
                    disabled
                    title={t('新建研究后可查看', 'Available after starting research')}
                    className="company-navigation-link"
                  >
                    <span className="company-navigation-number" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="company-navigation-link-copy">
                      <span>{t(zh, en)}</span>
                    </span>
                    <ArrowUpRight size={22} aria-hidden="true" />
                  </button>
                );
              const href = companyPath(current.id, id);
              const active = Boolean(selected && section === id);
              return (
                <a
                  key={id}
                  href={href}
                  className={`company-navigation-link${active ? ' active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  data-preview={previewSection === id || undefined}
                  aria-controls={previewId}
                  onMouseEnter={() => setPreviewSection(id)}
                  onFocus={() => setPreviewSection(id)}
                  onClick={onClose}
                >
                  <span className="company-navigation-number" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="company-navigation-link-copy">
                    <span>{t(zh, en)}</span>
                    <small>{t(...navigationDescriptions[id])}</small>
                  </span>
                  <ArrowUpRight size={22} aria-hidden="true" />
                </a>
              );
            })}
          </nav>
        </section>
        <section className="sidebar-companies" aria-label={t(...productTerms.loadedCompanies)}>
          <span className="sidebar-group-label">{t(...productTerms.loadedCompanies)}</span>
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
                <button className="text-link" onClick={() => void reload()}>
                  <RefreshCw size={12} />
                  {t('重试', 'Retry')}
                </button>
              </div>
            )}
            {!loading && !error && !companies.length && (
              <p className="sidebar-history-state">
                {t('研究的企业会保存在这里', 'Researched companies appear here')}
              </p>
            )}
            {companies.map((run) => {
              const active = Boolean(selected && selected.id === run.id);
              const removing = deleting.includes(run.id);
              const running =
                run.deletionBlocked || run.status === 'queued' || run.status === 'running';
              const deleteLabel = t(
                `删除 ${run.name} 的 ${run.input.year} 年研究记录`,
                `Delete research record for ${run.name}, ${run.input.year}`
              );
              return (
                <div
                  key={run.id}
                  className={`sidebar-company-row ${active ? 'active' : ''}`}
                  aria-busy={removing || undefined}
                >
                  <a
                    href={companyPath(run.id, selected ? section : 'overview')}
                    className={`sidebar-company ${active ? 'active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={onClose}
                  >
                    <span>{run.name}</span>
                    <small>
                      {run.input.securityCode || t('信息缺口', 'Information gap')} ·{' '}
                      {run.input.year}
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
                      disabled={removing || running}
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
      </div>
      <CompanyNavigationPreview
        id={previewId}
        section={previewSection}
        record={current}
        run={previewRun}
        basis={previewBasis}
        onClose={onClose}
      />
    </div>
  );
}
