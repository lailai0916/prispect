import { Select } from '../Select';
import { useEffect, useRef, useState } from 'react';
import { Settings2, LoaderCircle } from 'lucide-react';
import type { CompanyIdentity, CompanyResearchRun, ReviewPurpose } from '../../shared/contracts';
import { companyPath } from '../../shared/company-workspace';
import { StartInput } from '../StartInput';
import { Dialog } from '../components';
import { useApp } from '../context';
import { HomeRiskCards } from '../HomeRiskCards';
import { api, requestErrorText } from '../api';
import { COMPANY_RECORDS_EVENT } from '../CompanySidebar';

export function CompanyQueryPage({ query }: { query?: URLSearchParams }) {
  const { t, locale, navigate, workspace } = useApp();
  const latest = new Date().getFullYear() - 1;
  const [year, setYear] = useState(latest);
  const [purpose, setPurpose] = useState<ReviewPurpose>('external');
  const [options, setOptions] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const pendingRequest = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const begin = async (identity?: CompanyIdentity, name?: string) => {
    if (locked.current) return;
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
      if (!request.signal.aborted) {
        pendingRequest.current = null;
        window.dispatchEvent(new Event(COMPANY_RECORDS_EVENT));
        navigate(companyPath(run.id));
      }
    } catch (cause) {
      if (!request.signal.aborted) setError(requestErrorText(cause, locale));
    } finally {
      if (!request.signal.aborted) {
        locked.current = false;
        setCreating(false);
      }
    }
  };
  return (
    <div className="company-query-page">
      <div className="company-query-inner">
        <h1>{t('查询企业', 'Research a company')}</h1>
        <p className="company-query-description">
          {t(
            '输入公司名称或证券代码，查看核查报告。',
            'Enter a company name or ticker to open its review report.'
          )}
        </p>
        <StartInput
          key={query?.get('query') || 'new-company'}
          initialText={query?.get('query') || undefined}
          compact
          companyOnly
          disabled={creating}
          onCompanyChoice={(identity) => void begin(identity)}
          onInformationGap={(name) => void begin(undefined, name)}
          toolbar={
            <button
              type="button"
              className="icon-button"
              aria-label={t('查询选项', 'Query options')}
              onClick={() => setOptions(true)}
            >
              <Settings2 size={15} />
            </button>
          }
        />
        {creating && (
          <p className="context-data-note" role="status">
            <LoaderCircle size={14} className="spinner" /> {t('正在保存查询…', 'Saving query…')}
          </p>
        )}
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
      </div>
      {workspace?.tasks && <HomeRiskCards tasks={workspace.tasks} />}
      {options && (
        <Dialog title={t('查询选项', 'Query options')} onClose={() => setOptions(false)}>
          <div className="query-options-form">
            <label className="field-label">
              {t('原件核查年度', 'Original-report year')}
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
