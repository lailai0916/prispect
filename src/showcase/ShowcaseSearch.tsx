import { useEffect, useId, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  FileText,
  History,
  LoaderCircle,
  Search,
} from 'lucide-react';
import { companyRecordsByCreation } from '../../shared/company-navigation';
import { financialRecordState } from '../../shared/company-record-status';
import { companyPath, type CompanyRecordSummary } from '../../shared/company-workspace';
import { useCompanyRecords } from '../CompanyRecordsContext';
import { Select } from '../Select';
import { StartInput } from '../StartInput';
import { useApp } from '../context';
import { useCompanyQuery } from '../useCompanyQuery';
import './showcase-search.css';

/** The Lite search station keeps the shared native company composer and saved-run flow. */
export function ShowcaseSearch({
  query,
  connectionError,
}: {
  query?: URLSearchParams;
  connectionError?: string;
}) {
  const { t, user, refresh } = useApp();
  const { year, setYear, latest, creating, error, begin } = useCompanyQuery(query, {
    experience: 'lite',
  });
  const { records, loading, error: recordsError, reload, isCurrentOwner } = useCompanyRecords();
  const root = useRef<HTMLDivElement>(null);
  const owner = user?.id || null;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const historyId = `showcase-recent-${useId()}`;
  const scope = JSON.stringify([owner, query?.get('query') || '']);
  const [exampleDraft, setExampleDraft] = useState<{
    text: string;
    revision: number;
    scope: string;
  } | null>(null);
  const [historyOpen, setHistoryOpen] = useState<{ owner: string | null; open: boolean }>({
    owner,
    open: false,
  });
  const activeExample = exampleDraft?.scope === scope ? exampleDraft : null;
  const recentOpen = historyOpen.owner === owner && historyOpen.open;
  const recent = companyRecordsByCreation(records).slice(0, 3);
  const disabled = !user || creating;
  useEffect(() => {
    setExampleDraft(null);
    setHistoryOpen({ owner, open: false });
  }, [owner]);
  const fillExample = (name: string) => {
    if (disabled || currentOwner.current !== owner) return;
    setExampleDraft((draft) => ({
      text: name,
      revision: (draft?.revision || 0) + 1,
      scope,
    }));
    requestAnimationFrame(() => {
      if (currentOwner.current === owner)
        root.current
          ?.querySelector<HTMLTextAreaElement>('textarea')
          ?.focus({ preventScroll: true });
    });
  };
  const recordStatus = (record: CompanyRecordSummary) => {
    if (record.informationGap) return t('主体待确认', 'Confirm the company');
    if (record.contextStatus === 'loading' || ['queued', 'running'].includes(record.status))
      return t('资料读取中', 'Reading sources');
    const financial = financialRecordState(record);
    if (financial) return t(...financial);
    if (record.result) return t('报告已保存', 'Report saved');
    if (record.status === 'cancelled') return t('已取消', 'Cancelled');
    return t('研究未完成', 'Research incomplete');
  };

  return (
    <div
      ref={root}
      id="showcase-query"
      className="showcase-search showcase-search-station"
      role="search"
      aria-label={t('企业查询', 'Company search')}
      tabIndex={-1}
      aria-busy={creating || (!user && !connectionError)}
    >
      <header className="showcase-search-heading">
        <span className="showcase-search-purpose">
          <Search size={15} aria-hidden="true" />
          {t('查一家公司', 'Find a company')}
        </span>
        <button
          type="button"
          className="showcase-history-toggle"
          aria-expanded={recentOpen}
          aria-controls={historyId}
          onClick={() => setHistoryOpen({ owner, open: !recentOpen })}
        >
          <History size={15} aria-hidden="true" />
          <span>{t('最近报告', 'Recent reports')}</span>
          {records.length > 0 && <span className="showcase-history-count">{records.length}</span>}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </header>

      <div className="showcase-search-composer">
        <Search className="showcase-search-icon" size={23} aria-hidden="true" />
        <StartInput
          key={`${scope}:${activeExample?.revision || 0}`}
          compact
          companyOnly
          initialText={activeExample?.text || query?.get('query') || undefined}
          disabled={disabled}
          placeholder={t('输入 A 股公司名称或代码', 'Enter an A-share company name or code')}
          submitLabel={t('开始查询', 'Search')}
          onCompanyChoice={(identity) => void begin(identity)}
          onInformationGap={(name) => void begin(undefined, name)}
        />
      </div>

      <div className="showcase-search-meta">
        <span>{t('选择主体 · 对齐年度 · 追溯来源', 'Company · Annual scope · Sources')}</span>
        <Select
          value={year}
          disabled={disabled}
          aria-label={t('选择年报年度', 'Choose annual-report year')}
          onValueChange={(value) => setYear(Number(value))}
        >
          {Array.from({ length: latest - 2010 + 1 }, (_, index) => latest - index).map((value) => (
            <option key={value} value={value}>
              {t(`${value} 年报`, `Annual ${value}`)}
            </option>
          ))}
        </Select>
        <span className="showcase-search-key" aria-hidden="true">
          <kbd>↵</kbd> {t('查询', 'Search')}
        </span>
        <a href={`/query?year=${year}`}>
          {t('进入 Pro', 'Open Pro')}
          <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </div>

      {(!user || creating) && !connectionError && (
        <p className="showcase-search-feedback" role="status">
          <LoaderCircle className="spinner" size={16} aria-hidden="true" />
          {creating
            ? t('正在打开财务报告…', 'Opening the financial report…')
            : t('正在准备查询…', 'Preparing company search…')}
        </p>
      )}
      {error && (
        <p className="showcase-search-feedback" role="alert">
          {error}
        </p>
      )}
      {connectionError && (
        <div className="showcase-search-feedback" role="alert">
          <span>{connectionError}</span>
          <button
            type="button"
            className="showcase-text-link"
            onClick={() => void refresh().catch(() => {})}
          >
            {t('重新连接', 'Reconnect')}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="showcase-examples">
        <span>{t('试试查询', 'Try a company')}</span>
        {['松原安全', '杭州银行'].map((name) => (
          <button type="button" disabled={disabled} key={name} onClick={() => fillExample(name)}>
            {name}
            <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        ))}
      </div>

      {recentOpen && (
        <section
          id={historyId}
          className="showcase-search-history"
          aria-label={t('最近保存的报告', 'Recently saved reports')}
        >
          {recordsError && (
            <div className="showcase-history-feedback">
              <p role="alert">{recordsError}</p>
              <button type="button" onClick={() => void reload()}>
                {t('重新读取', 'Reload')}
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          )}
          {loading && !recent.length ? (
            <p className="showcase-history-empty" role="status">
              <LoaderCircle className="spinner" size={15} aria-hidden="true" />
              {t('正在读取报告…', 'Loading reports…')}
            </p>
          ) : recent.length ? (
            <ul>
              {recent.map((record) => (
                <li key={record.id}>
                  <a
                    href={`${companyPath(record.id)}&cached=1&experience=lite`}
                    onClick={(event) => {
                      if (!isCurrentOwner() || currentOwner.current !== owner)
                        event.preventDefault();
                    }}
                  >
                    <FileText size={18} aria-hidden="true" />
                    <span className="showcase-history-identity">
                      <strong>{record.name}</strong>
                      <small>
                        {record.input.securityCode || t('主体待确认', 'Unconfirmed entity')} ·{' '}
                        {t(`${record.input.year} 年报`, `Annual ${record.input.year}`)}
                      </small>
                    </span>
                    <span className="showcase-history-status">{recordStatus(record)}</span>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          ) : !recordsError ? (
            <p className="showcase-history-empty">
              {t(
                '查过的公司会出现在这里，随时继续阅读。',
                'Your company reports will appear here, ready to continue reading.'
              )}
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
