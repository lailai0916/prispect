import { useMemo, useState } from 'react';
import { ArrowRight, Building2, Plus, RefreshCw, Search, X } from 'lucide-react';
import type { CompanyRecordSummary } from '../../shared/company-workspace';
import { companyPath } from '../../shared/company-workspace';
import { PageHeading, Tag } from '../components';
import { Select } from '../Select';
import { useCompanyRecords } from '../CompanyRecordsContext';
import { useApp } from '../context';
import { date } from '../format';
import '../research-library.css';

function recordState(record: CompanyRecordSummary) {
  if (record.informationGap) return ['主体待确认', 'Entity needs confirmation'] as const;
  if (record.deletionBlocked) return ['处理中', 'In progress'] as const;
  if (record.result?.stale) return ['历史分析', 'Previous analysis'] as const;
  if (record.assessmentStatus === 'failed') return ['分析未完成', 'Analysis interrupted'] as const;
  if (record.result)
    return record.result.modelStatus === 'completed'
      ? (['分析已保存', 'Analysis saved'] as const)
      : (['规则筛选', 'Rule-based screening'] as const);
  if (record.status === 'adopted') return ['原件已采用', 'Original adopted'] as const;
  if (record.status === 'completed') return ['候选待核对', 'Candidates to check'] as const;
  if (record.status === 'failed' || record.status === 'cancelled')
    return ['查询未完成', 'Lookup interrupted'] as const;
  return ['研究记录', 'Research record'] as const;
}

export function ResearchLibraryPage() {
  const { t, locale, navigate } = useApp();
  const { records, loading, refreshing, error, reload } = useCompanyRecords();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    return [...records]
      .filter((record) =>
        `${record.name} ${record.input.securityCode} ${record.input.year}`
          .toLocaleLowerCase()
          .includes(text)
      )
      .filter((record) => {
        if (filter === 'active') return record.deletionBlocked;
        if (filter === 'saved') return Boolean(record.result);
        if (filter === 'follow-up')
          return (
            record.informationGap || record.result?.stale || record.assessmentStatus === 'failed'
          );
        return true;
      })
      .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
  }, [records, query, filter]);
  return (
    <div className="research-library">
      <PageHeading
        title={t('研究库', 'Research library')}
        description={t(
          '已保存的企业、分析与核查记录。',
          'Saved companies, analyses and verification records.'
        )}
        action={
          <button className="button button-primary" onClick={() => navigate('/query')}>
            <Plus size={15} /> {t('新建研究', 'New research')}
          </button>
        }
      />
      <div className="research-library-toolbar">
        <label className="research-library-search">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label={t('搜索研究记录', 'Search research records')}
            placeholder={t('公司、代码或年度', 'Company, code or year')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
          />
          {query && (
            <button
              className="icon-button"
              aria-label={t('清除搜索', 'Clear search')}
              onClick={() => setQuery('')}
            >
              <X size={14} />
            </button>
          )}
        </label>
        <label className="research-library-filter">
          <span className="sr-only">{t('筛选记录', 'Filter records')}</span>
          <Select
            aria-label={t('筛选记录', 'Filter records')}
            value={filter}
            onValueChange={setFilter}
          >
            <option value="all">{t('全部记录', 'All records')}</option>
            <option value="saved">{t('有分析结果', 'With analysis')}</option>
            <option value="active">{t('处理中', 'In progress')}</option>
            <option value="follow-up">{t('需要跟进', 'Needs follow-up')}</option>
          </Select>
        </label>
        <button
          className="icon-button"
          disabled={refreshing}
          onClick={() => void reload()}
          aria-label={t('刷新研究记录', 'Refresh research records')}
        >
          <RefreshCw size={16} className={refreshing ? 'spinner' : undefined} />
        </button>
      </div>
      {error && (
        <div className="research-library-error" role="alert">
          <span>{error}</span>
          <button className="button button-secondary" onClick={() => void reload()}>
            {t('重新读取', 'Retry')}
          </button>
        </div>
      )}
      {loading ? (
        <p className="research-library-state" role="status">
          {t('正在读取研究记录…', 'Loading research records…')}
        </p>
      ) : visible.length ? (
        <>
          <p className="research-library-count">
            {t(
              `${visible.length} 条记录 · 按最近更新排列`,
              `${visible.length} records · Recently updated first`
            )}
          </p>
          <div className="research-library-list">
            {visible.map((record) => (
              <a key={record.id} className="research-library-row" href={companyPath(record.id)}>
                <span className="research-library-icon" aria-hidden="true">
                  <Building2 size={18} />
                </span>
                <div className="research-library-content">
                  <div className="research-library-name">
                    <strong>{record.name}</strong>
                    <Tag>{t(recordState(record)[0], recordState(record)[1])}</Tag>
                  </div>
                  <p className="research-library-meta">
                    {record.input.securityCode || t('主体待匹配', 'Entity unmatched')} ·{' '}
                    {record.input.year}
                    {record.result && (
                      <>
                        {' '}
                        · {t('分析资料截至', 'Analysis sources as of')}{' '}
                        {date(record.result.asOf, locale)}
                      </>
                    )}
                  </p>
                  {record.result && (
                    <p className="research-library-summary">
                      {locale === 'en' ? record.result.statement.en : record.result.statement.zh}
                    </p>
                  )}
                </div>
                <div className="research-library-result">
                  {record.result && (
                    <span
                      className="research-library-grade"
                      title={
                        record.result.grade === 'NR'
                          ? t('暂不评级', 'Not rated')
                          : t('规则财务筛选', 'Rule-based financial screening')
                      }
                      aria-label={t(
                        `规则评级 ${record.result.grade}`,
                        `Rule-based grade ${record.result.grade}`
                      )}
                    >
                      {record.result.grade}
                    </span>
                  )}
                  <time dateTime={record.updatedAt || record.createdAt}>
                    {date(record.updatedAt || record.createdAt, locale)}
                  </time>
                </div>
                <ArrowRight size={15} aria-hidden="true" />
              </a>
            ))}
          </div>
        </>
      ) : error && !records.length ? null : (
        <div className="research-library-empty">
          <Building2 size={24} aria-hidden="true" />
          <h2>
            {records.length
              ? t('没有匹配的记录', 'No matching records')
              : t('还没有研究记录', 'No research records yet')}
          </h2>
          <p>
            {records.length
              ? t(
                  '试试其他公司名，或调整筛选条件。',
                  'Try another company name or change the filter.'
                )
              : t(
                  '查询一家企业后，分析结果与来源会保存在这里。',
                  'Look up a company to save its analysis and sources here.'
                )}
          </p>
          <button
            className="button button-secondary"
            onClick={() => (records.length ? (setQuery(''), setFilter('all')) : navigate('/query'))}
          >
            {records.length ? t('重置筛选', 'Reset filters') : t('查询企业', 'Look up a company')}
          </button>
        </div>
      )}
    </div>
  );
}
