import { useEffect, useRef, useState } from 'react';
import type { CompanyIdentity, CompanyResearchRun } from '../shared/contracts';
import { companyPath } from '../shared/company-workspace';
import { findReusableCompanyRun } from '../shared/company-run-reuse';
import { api, requestErrorText } from './api';
import { COMPANY_RECORDS_EVENT } from './CompanySidebar';
import { useCompanyRecords } from './CompanyRecordsContext';
import { findCachedCompanyRun } from './company-run-cache';
import { useApp } from './context';
import { clearComposerDraft } from './start-draft';

/** Both home presentations submit to the same owner-scoped company research flow. */
export function useCompanyQuery(
  query?: URLSearchParams,
  options?: { experience?: 'lite' | 'pro' }
) {
  const { locale, navigate, user } = useApp();
  const { records, loading: recordsLoading } = useCompanyRecords();
  const latest = new Date().getUTCFullYear() - 1;
  const experienceSuffix = options?.experience === 'lite' ? '&experience=lite' : '';
  const requestedYear = Number(query?.get('year'));
  const initialYear =
    Number.isInteger(requestedYear) && requestedYear >= 2010 && requestedYear <= latest
      ? requestedYear
      : latest;
  const [year, setYear] = useState(initialYear);
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
    setYear(initialYear);
    setCreating(false);
    setError('');
    return () => controller.current?.abort();
  }, [user?.id, initialYear]);

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
        navigate(`${companyPath((existing || cached)!.id)}&cached=1${experienceSuffix}`);
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
        navigate(`${companyPath(run.id)}${run.reused ? '&cached=1' : ''}${experienceSuffix}`);
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

  return { year, setYear, latest, creating, error, begin };
}
