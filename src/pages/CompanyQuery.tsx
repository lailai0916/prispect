import { useEffect, useRef, useState } from 'react';
import { Settings2, LoaderCircle } from 'lucide-react';
import type { CompanyIdentity, CompanyResearchRun, ReviewPurpose } from '../../shared/contracts';
import { companyPath } from '../../shared/company-workspace';
import { StartInput } from '../StartInput';
import { Dialog } from '../components';
import { useApp } from '../context';
import { api, requestErrorText } from '../api';
import { COMPANY_RECORDS_EVENT } from '../CompanySidebar';

export function CompanyQueryPage() {
  const { t, locale, navigate } = useApp();
  const latest = new Date().getFullYear() - 1;
  const [year, setYear] = useState(latest);
  const [purpose, setPurpose] = useState<ReviewPurpose>('external');
  const [useModel, setUseModel] = useState(false);
  const [options, setOptions] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const begin = async (identity?: CompanyIdentity, name?: string) => {
    if (locked.current) return;
    locked.current = true;
    setCreating(true);
    setError('');
    const request = new AbortController();
    controller.current = request;
    try {
      const run = await api<CompanyResearchRun>(identity ? '/company-runs' : '/company-gaps', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        signal: request.signal,
        body: JSON.stringify(
          identity
            ? {
                securityCode: identity.securityCode,
                orgId: identity.orgId,
                year,
                purpose,
                useModel,
              }
            : { name, year, purpose }
        ),
      });
      if (!request.signal.aborted) {
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
        <h1 className="sr-only">{t('新建查询', 'New query')}</h1>
        <StartInput
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
      {options && (
        <Dialog title={t('查询选项', 'Query options')} onClose={() => setOptions(false)}>
          <label className="field-label">
            {t('原件核查年度', 'Original-report year')}
            <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {Array.from({ length: latest - 2010 + 1 }, (_, index) => latest - index).map(
                (value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                )
              )}
            </select>
          </label>
          <label className="field-label">
            {t('核查目的', 'Review purpose')}
            <select
              value={purpose}
              onChange={(event) => setPurpose(event.target.value as ReviewPurpose)}
            >
              <option value="external">{t('外部付款', 'External payment')}</option>
              <option value="handover">{t('内部交接', 'Internal handover')}</option>
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={useModel}
              onChange={(event) => setUseModel(event.target.checked)}
            />
            {t('使用模型辅助解释原件', 'Use model assistance for original reports')}
          </label>
          <p className="muted">
            {t(
              '仅发送取得的公开材料；你的付款计划和私有材料不会发送。',
              'Only retrieved public evidence is sent. Private evidence and payment plans are excluded.'
            )}{' '}
            <a href="/privacy">{t('隐私政策', 'Privacy policy')}</a>
          </p>
          <button className="button button-primary" onClick={() => setOptions(false)}>
            {t('完成', 'Done')}
          </button>
        </Dialog>
      )}
    </div>
  );
}
