import { Select } from '../Select';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, LoaderCircle, Search } from 'lucide-react';
import type { CompanyIdentity, CompanyResearchRun } from '../../shared/contracts';
import { companyPath } from '../../shared/company-workspace';
import { findReusableCompanyRun } from '../../shared/company-run-reuse';
import { StartInput } from '../StartInput';
import { Logo } from '../components';
import { useApp } from '../context';
import { api, requestErrorText } from '../api';
import { COMPANY_RECORDS_EVENT } from '../CompanySidebar';
import { clearComposerDraft } from '../start-draft';
import { useCompanyRecords } from '../CompanyRecordsContext';
import { findCachedCompanyRun } from '../company-run-cache';
import { productTagline } from '../../shared/product-terms';
import '../home.css';
import '../query.css';

export function CompanyQueryPage({ query }: { query?: URLSearchParams }) {
  const { t, locale, navigate, user } = useApp();
  const { records, loading: recordsLoading } = useCompanyRecords();
  const latest = new Date().getFullYear() - 1;
  const requestedYear = Number(query?.get('year'));
  const [year, setYear] = useState(
    Number.isInteger(requestedYear) && requestedYear >= 2010 && requestedYear <= latest
      ? requestedYear
      : latest
  );
  const purpose = 'external' as const;
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const pendingRequest = useRef<{ signature: string; key: string } | null>(null);
  const currentOwner = useRef(user?.id);
  currentOwner.current = user?.id;
  useEffect(() => {
    controller.current?.abort();
    locked.current = false;
    pendingRequest.current = null;
    setCreating(false);
    setError('');
    return () => controller.current?.abort();
  }, [user?.id]);
  const begin = async (identity?: CompanyIdentity, name?: string) => {
    if (locked.current || !user) return;
    const owner = user.id;
    if (identity) {
      const scope = { securityCode: identity.securityCode, orgId: identity.orgId, year, purpose };
      // Old summary responses omitted purpose: let the authenticated server resolve those.
      const existing = findReusableCompanyRun(
        records.filter((record) => Boolean(record.input.purpose)),
        scope
      );
      const cached = !existing && recordsLoading ? findCachedCompanyRun(owner, scope) : undefined;
      if (existing || cached) {
        pendingRequest.current = null;
        clearComposerDraft();
        navigate(`${companyPath((existing || cached)!.id)}&cached=1`);
        return;
      }
    }
    locked.current = true;
    setCreating(true);
    setError('');
    const request = new AbortController();
    controller.current = request;
    const path = identity ? '/company-runs' : '/company-gaps';
    const body = JSON.stringify(
      identity
        ? {
            securityCode: identity.securityCode,
            orgId: identity.orgId,
            year,
            purpose,
            useModel: true,
            reuseExisting: true,
          }
        : { name, year, purpose }
    );
    const signature = `${path}:${body}`;
    if (pendingRequest.current?.signature !== signature)
      pendingRequest.current = { signature, key: crypto.randomUUID() };
    try {
      const run = await api<CompanyResearchRun & { reused?: boolean }>(path, {
        method: 'POST',
        headers: { 'Idempotency-Key': pendingRequest.current.key },
        signal: request.signal,
        body,
      });
      if (!request.signal.aborted && currentOwner.current === owner) {
        pendingRequest.current = null;
        clearComposerDraft();
        window.dispatchEvent(new Event(COMPANY_RECORDS_EVENT));
        navigate(`${companyPath(run.id)}${run.reused ? '&cached=1' : ''}`);
      }
    } catch (cause) {
      if (!request.signal.aborted && currentOwner.current === owner)
        setError(requestErrorText(cause, locale));
    } finally {
      if (!request.signal.aborted && currentOwner.current === owner) {
        locked.current = false;
        setCreating(false);
      }
    }
  };
  return (
    <div
      className="company-query-page query-create-page"
      data-locale={locale}
      aria-busy={!user || creating}
    >
      <div className="query-create-content">
        <header className="query-create-heading query-create-brand">
          <Logo />
        </header>
        <h1 className="query-create-title" aria-label={t(...productTagline)}>
          {locale === 'en' ? (
            productTagline[1]
          ) : (
            <>
              <span>{productTagline[0].slice(0, 6)}</span>
              <span>{productTagline[0].slice(6)}</span>
            </>
          )}
        </h1>
        <div className="query-create-search">
          <Search size={20} className="query-create-search-icon" aria-hidden="true" />
          <StartInput
            key={`${user?.id || 'anonymous'}:${query?.get('query') || 'new-company'}`}
            initialText={query?.get('query') || undefined}
            compact
            companyOnly
            disabled={creating || !user}
            onCompanyChoice={(identity) => void begin(identity)}
            onInformationGap={(name) => void begin(undefined, name)}
          />
        </div>
        <div className="query-create-meta">
          <Select
            className="query-create-year"
            value={year}
            disabled={creating || !user}
            aria-label={t('选择年报年度', 'Choose annual-report year')}
            onValueChange={(selectedValue) => setYear(Number(selectedValue))}
          >
            {Array.from({ length: latest - 2010 + 1 }, (_, index) => latest - index).map(
              (value) => (
                <option key={value} value={value}>
                  {t(`${value} 年报`, `Annual ${value}`)}
                </option>
              )
            )}
          </Select>
        </div>
        {!user && (
          <p className="query-create-feedback" role="status">
            <LoaderCircle size={14} className="spinner" aria-hidden="true" />
            {t('正在准备查询…', 'Preparing company search…')}
          </p>
        )}
        {creating && (
          <p className="query-create-feedback" role="status">
            <LoaderCircle size={14} className="spinner" aria-hidden="true" />
            {t('正在打开财务报告…', 'Opening the financial report…')}
          </p>
        )}
        {error && (
          <p role="alert" className="query-create-feedback field-error">
            {error}
          </p>
        )}
      </div>
      <a className="query-create-story" href="/?view=story">
        {t('认识析光', 'Meet Prispect')}
        <ArrowUpRight size={13} aria-hidden="true" />
      </a>
    </div>
  );
}
