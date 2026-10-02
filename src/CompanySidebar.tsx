import { useEffect, useState, type ReactNode } from 'react';
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
} from 'lucide-react';
import type { CompanyRecordSummary } from '../shared/company-workspace';
import { companySections, companyPath, type CompanySection } from '../shared/company-workspace';
import { api, requestErrorText } from './api';
import { useApp } from './context';

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
export function CompanySidebar({
  route,
  onClose,
  tools,
}: {
  route: string;
  onClose: () => void;
  tools: ReactNode;
}) {
  const { user, locale, t } = useApp();
  const [records, setRecords] = useState<CompanyRecordSummary[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const query = new URLSearchParams(route.split('?')[1]);
  const currentId = query.get('run');
  const section = (query.get('section') || 'overview') as CompanySection;
  useEffect(() => {
    setRecords([]);
    setError('');
    setLoading(true);
  }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    let generation = 0;
    const load = () => {
      const current = ++generation;
      void api<CompanyRecordSummary[]>('/company-records', { signal: controller.signal })
        .then((next) => {
          if (!controller.signal.aborted && current === generation) {
            setRecords(next);
            setError('');
            setLoading(false);
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
      controller.abort();
      window.removeEventListener(COMPANY_RECORDS_EVENT, load);
    };
  }, [user?.id, locale, revision]);
  const sorted = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const companies = sorted.filter(
    (run, index) =>
      sorted.findIndex(
        (item) =>
          item.input.securityCode === run.input.securityCode &&
          item.input.orgId === run.input.orgId &&
          item.name === run.name
      ) === index
  );
  const current = records.find((run) => run.id === currentId) || companies[0];
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
        <div className="sidebar-company-list" tabIndex={companies.length ? 0 : undefined}>
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
            return (
              <a
                key={run.id}
                href={companyPath(run.id, section)}
                className={`sidebar-company ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={onClose}
              >
                <span>{run.name}</span>
                <small>
                  {run.input.securityCode || t('信息缺口', 'Information gap')} · {run.input.year}
                </small>
                {(run.status === 'queued' || run.status === 'running') && (
                  <LoaderCircle
                    size={12}
                    className="spinner"
                    aria-label={t('核查进行中', 'Review in progress')}
                  />
                )}
              </a>
            );
          })}
        </div>
      </section>
    </>
  );
}
