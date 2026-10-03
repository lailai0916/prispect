import { ChevronRight, RefreshCw } from 'lucide-react';
import { companyPath, type CompanyRecordSummary } from '../shared/company-workspace';
import { financialRecordState } from '../shared/company-record-status';
import { useCompanyRecords } from './CompanyRecordsContext';
import { useApp } from './context';
import { RecordListLoading } from './Experience';

export function CompanyRecentResearch() {
  const { t, user } = useApp();
  const { records: allRecords, loading, error, reload } = useCompanyRecords();
  if (!user) return null;
  const records = [...allRecords]
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
    .slice(0, 3);
  if (!loading && !error && !records.length) return null;
  const statusLabel = (record: CompanyRecordSummary) => {
    if (
      record.deletionBlocked ||
      record.contextStatus === 'loading' ||
      record.assessmentStatus === 'loading' ||
      record.status === 'queued' ||
      record.status === 'running'
    )
      return t('处理中', 'Processing');
    if (record.informationGap) return t('主体待确认', 'Entity needs confirmation');
    if (record.assessmentStatus === 'failed') return t('分析未完成', 'Analysis interrupted');
    if (record.contextStatus === 'failed') return t('资料不完整', 'Sources incomplete');
    if (record.status === 'failed' && record.input.researchMode !== 'financial')
      return t('原件未完成', 'Original interrupted');
    if (record.result?.stale) return t('分析待更新', 'Analysis outdated');
    if (record.result)
      return record.result.modelStatus === 'completed'
        ? null
        : t('规则分析', 'Rule-based analysis');
    const financialState = financialRecordState(record);
    if (financialState) return t(...financialState);
    return t('未完成', 'Incomplete');
  };
  return (
    <section
      className="research-recent"
      aria-labelledby={!loading || records.length > 0 ? 'research-recent-title' : undefined}
      aria-label={
        loading && !records.length ? t('正在读取研究记录…', 'Loading research records…') : undefined
      }
    >
      {(!loading || records.length > 0) && (
        <header className="research-section-heading">
          <h2 id="research-recent-title">{t('最近研究', 'Recent research')}</h2>
        </header>
      )}
      {error && (
        <div className="research-list-error">
          <p role="alert">{error}</p>
          <button className="button button-secondary" onClick={() => void reload()}>
            <RefreshCw size={13} />
            {t('重新读取', 'Reload')}
          </button>
        </div>
      )}
      {loading ? (
        <RecordListLoading compact label={t('正在读取研究记录…', 'Loading research records…')} />
      ) : records.length > 0 ? (
        <div className="research-recent-list">
          {records.map((record) => {
            const status = statusLabel(record);
            return (
              <a className="research-record-row" key={record.id} href={companyPath(record.id)}>
                <span className="research-record-name">
                  <strong>{record.name}</strong>
                  <small>
                    {record.input.securityCode || t('主体待确认', 'Entity needs confirmation')} ·{' '}
                    {record.input.year}
                  </small>
                </span>
                {status && <span className="research-record-status">{status}</span>}
                <ChevronRight size={14} aria-hidden="true" />
              </a>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
