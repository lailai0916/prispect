import { productTerms } from '../../shared/product-terms';
import { Select } from '../Select';
import { useEffect, useRef, useState } from 'react';
import { Settings2, LoaderCircle, Search } from 'lucide-react';
import type { CompanyIdentity, CompanyResearchRun, ReviewPurpose } from '../../shared/contracts';
import { companyPath } from '../../shared/company-workspace';
import { StartInput } from '../StartInput';
import { Dialog } from '../components';
import { useApp } from '../context';
import { CompanyRecentResearch } from '../CompanyRecentResearch';
import { useCompanyRecords } from '../CompanyRecordsContext';
import { api, requestErrorText } from '../api';
import { COMPANY_RECORDS_EVENT } from '../CompanySidebar';
import { clearComposerDraft } from '../start-draft';
import '../home.css';
import '../query.css';

export function CompanyQueryPage({ query }: { query?: URLSearchParams }) {
  const { t, locale, navigate, user } = useApp();
  const { records, loading: recordsLoading, error: recordsError } = useCompanyRecords();
  const hasNoRecentResearch = !recordsLoading && !recordsError && records.length === 0;
  const latest = new Date().getFullYear() - 1;
  const requestedYear = Number(query?.get('year'));
  const [year, setYear] = useState(
    Number.isInteger(requestedYear) && requestedYear >= 2010 && requestedYear <= latest
      ? requestedYear
      : latest
  );
  const [purpose, setPurpose] = useState<ReviewPurpose>('external');
  const [options, setOptions] = useState(false);
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
          }
        : { name, year, purpose }
    );
    const signature = `${path}:${body}`;
    if (pendingRequest.current?.signature !== signature)
      pendingRequest.current = { signature, key: crypto.randomUUID() };
    try {
      const run = await api<CompanyResearchRun>(path, {
        method: 'POST',
        headers: { 'Idempotency-Key': pendingRequest.current.key },
        signal: request.signal,
        body,
      });
      if (!request.signal.aborted && currentOwner.current === owner) {
        pendingRequest.current = null;
        clearComposerDraft();
        window.dispatchEvent(new Event(COMPANY_RECORDS_EVENT));
        navigate(companyPath(run.id));
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
      className={`company-query-page query-create-page${hasNoRecentResearch ? ' query-create-empty' : ''}`}
    >
      <div className="query-create-content">
        <header className="query-create-heading">
          <h1>{t(...productTerms.newResearch)}</h1>
        </header>
        <div className="query-create-search">
          <Search size={18} className="query-create-search-icon" aria-hidden="true" />
          <StartInput
            key={`${user?.id || 'anonymous'}:${query?.get('query') || 'new-company'}`}
            initialText={query?.get('query') || undefined}
            compact
            companyOnly
            disabled={creating}
            onCompanyChoice={(identity) => void begin(identity)}
            onInformationGap={(name) => void begin(undefined, name)}
          />
        </div>
        <div className="query-create-meta">
          <button
            className="query-create-options"
            type="button"
            disabled={creating}
            aria-label={t(`研究设置，${year} 年度`, `Research settings, annual ${year}`)}
            aria-haspopup="dialog"
            onClick={() => setOptions(true)}
          >
            <Settings2 size={13} aria-hidden="true" />
            {t(`${year} 年度`, `Annual ${year}`)}
            <span aria-hidden="true">·</span>
            {purpose === 'external'
              ? t('外部付款', 'External payment')
              : t('内部交接', 'Internal handover')}
          </button>
        </div>
        {creating && (
          <p className="query-create-feedback" role="status">
            <LoaderCircle size={14} className="spinner" aria-hidden="true" />
            {t('正在建立研究记录…', 'Creating the research record…')}
          </p>
        )}
        {error && (
          <p role="alert" className="query-create-feedback field-error">
            {error}
          </p>
        )}
        <CompanyRecentResearch />
      </div>
      {options && (
        <Dialog title={t('研究设置', 'Research settings')} onClose={() => setOptions(false)}>
          <div className="query-options-form">
            <label className="field-label">
              {t('分析年度', 'Analysis year')}
              <Select
                value={year}
                onValueChange={(selectedValue) => setYear(Number(selectedValue))}
              >
                {Array.from({ length: latest - 2010 + 1 }, (_, index) => latest - index).map(
                  (value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  )
                )}
              </Select>
            </label>
            <label className="field-label">
              {t('核查目的', 'Review purpose')}
              <Select
                value={purpose}
                onValueChange={(selectedValue) => setPurpose(selectedValue as ReviewPurpose)}
              >
                <option value="external">{t('外部付款', 'External payment')}</option>
                <option value="handover">{t('内部交接', 'Internal handover')}</option>
              </Select>
            </label>

            <div className="dialog-actions">
              <button className="button button-primary" onClick={() => setOptions(false)}>
                {t('完成', 'Done')}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
