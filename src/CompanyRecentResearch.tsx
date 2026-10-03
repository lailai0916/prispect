import { ArrowRight, Building2, ChevronRight, RefreshCw } from 'lucide-react';
import { companyPath, type CompanyRecordSummary } from '../shared/company-workspace';
import { useCompanyRecords } from './CompanyRecordsContext';
import { useApp } from './context';
import { date } from './format';

export function CompanyRecentResearch() {
  const { t, user, locale } = useApp();
  const { records: allRecords, loading, error, reload } = useCompanyRecords();
  if (!user) return null;
  const records = [...allRecords]
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
    .slice(0, 6);
  const statusLabel = (record: CompanyRecordSummary) => {
    if (record.deletionBlocked) return t('处理中', 'Processing');
    if (record.informationGap) return t('主体待确认', 'Entity unmatched');
    if (record.result?.stale) return t('分析待更新', 'Analysis outdated');
    if (record.result)
      return record.result.modelStatus === 'completed'
        ? t('查看分析', 'Open analysis')
        : t('规则结果', 'Rule result');
    if (record.assessmentStatus === 'failed') return t('分析未完成', 'Analysis interrupted');
    if (record.contextStatus === 'loading' || record.assessmentStatus === 'loading')
      return t('处理中', 'Processing');
    if (record.status === 'queued' || record.status === 'running')
      return t('原件处理中', 'Original processing');
    if (record.status === 'failed') return t('原件未完成', 'Original interrupted');
    return t('查看记录', 'Open record');
  };
  return (
    <section className="research-recent" aria-labelledby="research-recent-title">
      <header className="research-section-heading">
        <h2 id="research-recent-title">{t('最近研究', 'Recent research')}</h2>
        <a href="/research">
          {t('全部记录', 'All records')}
          <ArrowRight size={13} />
        </a>
      </header>
      {loading ? (
        <p className="research-list-state" role="status">
          {t('正在读取研究记录…', 'Loading research records…')}
        </p>
      ) : error ? (
        <div className="research-list-error">
          <p role="alert">{error}</p>
          <button className="button button-secondary" onClick={() => void reload()}>
            <RefreshCw size={13} />
            {t('重新读取', 'Retry')}
          </button>
        </div>
      ) : !records.length ? (
        <div className="research-list-empty">
          <Building2 size={20} />
          <div>
            <strong>{t('还没有企业研究记录', 'No company research yet')}</strong>
            <p>
              {t(
                '从上方查询一家企业，报告与来源会保存在这里。',
                'Look up a company above. Its report and sources will be saved here.'
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="research-recent-list">
          {records.map((record) => (
            <a className="research-record-row" key={record.id} href={companyPath(record.id)}>
              <span className="research-record-icon" aria-hidden="true">
                <Building2 size={16} />
              </span>
              <span className="research-record-name">
                <span className="research-record-title">
                  <strong>{record.name}</strong>
                  {record.result && !record.result.stale && record.result.grade !== 'NR' && (
                    <span className="research-record-grade">
                      {t('财务', 'Financial')} {record.result.grade}
                    </span>
                  )}
                </span>
                <small>
                  {record.input.securityCode || t('主体待匹配', 'Entity unmatched')} ·{' '}
                  {record.input.year}
                </small>
                {record.result && !record.result.stale && (
                  <span className="research-record-summary">
                    {locale === 'en' ? record.result.statement.en : record.result.statement.zh}
                  </span>
                )}
              </span>
              <time dateTime={record.updatedAt || record.createdAt}>
                {date(record.updatedAt || record.createdAt, locale)}
              </time>
              <span className="research-record-status">{statusLabel(record)}</span>
              <ChevronRight size={14} aria-hidden="true" />
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
