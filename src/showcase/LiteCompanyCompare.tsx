import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeftRight, ArrowUpRight, ChevronRight, RefreshCw } from 'lucide-react';
import type { CompanyResearchRun } from '../../shared/contracts';
import type { CompanyRecordSummary } from '../../shared/company-workspace';
import type { CompanyReadingBasis } from '../../shared/company-analysis';
import { api, RequestError, requestErrorText } from '../api';
import { useCompanyRecords } from '../CompanyRecordsContext';
import { useApp } from '../context';
import { date } from '../format';
import { buildLiteCompanyComparison } from './lite-company-comparison';
import './lite-company-compare.css';

type Comparison = ReturnType<typeof buildLiteCompanyComparison>;
type ComparisonRow = Comparison['rows'][number];
type SideName = 'left' | 'right';
type ReadResult = { run: CompanyResearchRun | null; error: unknown | null };
const emptyRead = (): ReadResult => ({ run: null, error: null });
const sameIssuer = (a: CompanyRecordSummary, b: CompanyRecordSummary) =>
  a.input.securityCode === b.input.securityCode || a.input.orgId === b.input.orgId;
const companyHref = (runId: string, basis: CompanyReadingBasis, page: string) =>
  `/company?${new URLSearchParams({ run: runId, experience: 'lite', page, basis })}`;
const compareHref = (a: string | null, b: string | null, basis: CompanyReadingBasis) => {
  const query = new URLSearchParams({ a: a || '', b: b || '', basis });
  return `/companies/compare?${query}`;
};

/** Read two existing owning-account records. Selection never starts research. */
export function LiteCompanyComparePage({ query }: { query: URLSearchParams }) {
  const { user, locale, t, navigate } = useApp();
  const language = locale === 'en' ? 'en' : 'zh';
  const {
    records,
    loading: recordsLoading,
    error: recordsError,
    reload,
    isCurrentOwner,
  } = useCompanyRecords();
  const owner = user?.id || null;
  const recent = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const basis: CompanyReadingBasis = query.get('basis') === 'parent' ? 'parent' : 'consolidated';
  const requestedA = query.get('a') || null;
  const requestedB = query.get('b') || null;
  const hasA = query.has('a');
  const hasB = query.has('b');
  const a = hasA ? requestedA : recent[0]?.id || null;
  const first = recent.find((record) => record.id === a);
  const b = hasB
    ? requestedB
    : recent.find((record) => record.id !== a && (!first || !sameIssuer(first, record)))?.id ||
      null;
  const scope = JSON.stringify([owner, a, b]);
  const current = useRef({ scope, owner });
  current.current = { scope, owner };
  const [reads, setReads] = useState<{
    scope: string;
    left: ReadResult;
    right: ReadResult;
  }>({ scope, left: emptyRead(), right: emptyRead() });
  const [readingScope, setReadingScope] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const readable = !!owner && reads.scope === scope && isCurrentOwner();
  const left = readable ? reads.left : emptyRead();
  const right = readable ? reads.right : emptyRead();
  const comparison = buildLiteCompanyComparison(left.run, right.run, basis);
  const reading = readingScope === scope;

  useEffect(() => {
    if (!owner || recordsLoading || recordsError || (!a && !b)) return;
    if (!hasA || !hasB || query.get('basis') !== basis)
      navigate(compareHref(a, b, basis), { replace: true });
  }, [owner, recordsLoading, recordsError, hasA, hasB, a, b, basis, navigate, query]);

  useEffect(() => {
    if (!owner || (!a && !b)) return;
    const controller = new AbortController();
    const active = () =>
      !controller.signal.aborted &&
      current.current.scope === scope &&
      current.current.owner === owner &&
      isCurrentOwner();
    setReads((previous) =>
      previous.scope === scope ? previous : { scope, left: emptyRead(), right: emptyRead() }
    );
    setReadingScope(scope);
    const read = async (id: string | null): Promise<ReadResult> => {
      if (!id) return emptyRead();
      try {
        const run = await api<CompanyResearchRun>(`/company-runs/${encodeURIComponent(id)}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        if (run.id !== id)
          throw new RequestError(
            'The returned research record does not match.',
            'COMPANY_RUN_MISMATCH'
          );
        return { run, error: null };
      } catch (error) {
        return { run: null, error };
      }
    };
    const leftRead = read(a);
    void Promise.all([leftRead, b === a ? leftRead : read(b)]).then(([nextLeft, nextRight]) => {
      if (!active()) return;
      setReads({ scope, left: nextLeft, right: nextRight });
      setReadingScope(null);
    });
    return () => controller.abort();
  }, [owner, a, b, scope, revision, isCurrentOwner]);

  const change = (side: 'a' | 'b', id: string) =>
    navigate(compareHref(side === 'a' ? id || null : a, side === 'b' ? id || null : b, basis));
  const selector = (side: 'a' | 'b', id: string | null, loaded: ReadResult) => (
    <label className="lite-compare-picker" htmlFor={`lite-compare-${side}`}>
      <span>{side === 'a' ? t('公司 A', 'Company A') : t('公司 B', 'Company B')}</span>
      <select
        id={`lite-compare-${side}`}
        value={id || ''}
        onChange={(event) => change(side, event.target.value)}
        disabled={!owner || (recordsLoading && !recent.length)}
      >
        <option value="">{t('选择已查询的公司', 'Choose a researched company')}</option>
        {id && !recent.some((record) => record.id === id) && (
          <option value={id}>
            {loaded.run
              ? `${buildLiteCompanyComparison(loaded.run, null, basis).left?.companyName || loaded.run.input.securityCode} · ${loaded.run.input.year}`
              : t('当前记录 · 等待读取', 'Selected record · awaiting read')}
          </option>
        )}
        {recent.map((record) => (
          <option key={record.id} value={record.id}>
            {record.name} · {record.input.securityCode} · {record.input.year}
          </option>
        ))}
      </select>
    </label>
  );
  const sideHeading = (name: SideName) => {
    const side = comparison[name];
    const selected = name === 'left' ? a : b;
    const error = name === 'left' ? left.error : right.error;
    return (
      <section className="lite-compare-company" data-comparison-company={name}>
        <span className="lite-compare-side-label">
          {name === 'left' ? t('公司 A', 'Company A') : t('公司 B', 'Company B')}
        </span>
        {side ? (
          <>
            <h2>{side.companyName}</h2>
            <p>
              {side.securityCode} · {side.year} · {t('年度数据', 'Annual data')}
            </p>
            {side.snapshotFetchedAt && (
              <p>
                {t('资料日期', 'Snapshot date')} · {date(side.snapshotFetchedAt, locale)}
              </p>
            )}
            <nav aria-label={t(`${side.companyName}的公司页面`, `${side.companyName} pages`)}>
              {(
                [
                  ['finance', t('财务', 'Finance')],
                  ['public', t('公开事项', 'Public records')],
                  ['reputation', t('口碑线索', 'Reputation')],
                  ['original', t('原文', 'Original')],
                ] as const
              ).map(([page, label]) => (
                <a key={page} href={companyHref(side.runId, basis, page)}>
                  {label}
                  <ChevronRight size={12} aria-hidden="true" />
                </a>
              ))}
            </nav>
          </>
        ) : (
          <>
            <h2>
              {error
                ? t('这份记录暂不可用', 'This record is unavailable')
                : selected && reading
                  ? t('正在读取这份记录', 'Reading this record')
                  : t('选择另一家公司', 'Choose another company')}
            </h2>
            <p>
              {error
                ? requestErrorText(error, locale)
                : selected && reading
                  ? t('正在读取已保存资料…', 'Loading saved materials…')
                  : t('先查询公司，再回来对照。', 'Research a company, then return to compare.')}
            </p>
          </>
        )}
      </section>
    );
  };
  const amountCell = (row: ComparisonRow, name: SideName) => {
    const value = row[name];
    const side = comparison[name];
    const display = value.amount?.display[language];
    const bar = row.bars[name];
    return (
      <section
        className="lite-compare-value"
        data-comparison-side={name}
        data-value-state={value.status}
      >
        <p className="lite-compare-value-company">
          {name === 'left' ? 'A' : 'B'} · {side?.companyName || t('尚未选择', 'Not selected')}
          {side ? ` · ${side.year}` : ''}
        </p>
        <p
          className="lite-compare-amount"
          data-exact-yuan={value.amount?.exactYuan}
          title={display?.exactText}
        >
          {display?.text || t('暂无可用数据', 'Unavailable')}
        </p>
        {value.status === 'unverified' && display && (
          <p className="lite-compare-unavailable">
            {t('字段出处待核对', 'Field source needs verification')}
          </p>
        )}
        {bar && (
          <div className="lite-compare-bar" data-signed={row.bars.signed} aria-hidden="true">
            <span
              style={
                {
                  '--compare-start': `${bar.start}%`,
                  '--compare-width': `${bar.width}%`,
                } as CSSProperties
              }
            />
          </div>
        )}
        {display ? (
          <details className="lite-compare-exact">
            <summary>{t('精确金额与出处', 'Exact amount and sources')}</summary>
            <p>{display.exactText}</p>
            <p>
              {side?.year} ·{' '}
              {row.field === 'parentProfit'
                ? t('归母利润口径', 'Attributable-profit basis')
                : t('合并报表口径', 'Consolidated basis')}
            </p>
            {value.sources.length ? (
              <ul>
                {value.sources.map((source, index) => (
                  <li key={`${source.url}:${index}`}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.provider === 'primary'
                        ? t('已保存字段来源', 'Saved field source')
                        : t('已保存交叉来源', 'Saved cross-check source')}
                      <ArrowUpRight size={12} aria-hidden="true" />
                    </a>
                    <span>
                      {source.period} · {source.url}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {t(
                  '这项字段没有可用的原始来源链接。',
                  'No usable original-source link is saved for this field.'
                )}
              </p>
            )}
          </details>
        ) : (
          <p className="lite-compare-unavailable">
            {t(
              '缺失或未通过主体、年度及口径核对。',
              'Missing or not verified for this company, year and scope.'
            )}
          </p>
        )}
      </section>
    );
  };

  return (
    <section
      className="lite-company-compare"
      data-compare-state={comparison.state}
      aria-labelledby="lite-compare-title"
    >
      <header className="lite-compare-heading">
        <div>
          <p>{t('公司对比', 'Company comparison')}</p>
          <h1 id="lite-compare-title">
            {t('两家公司，逐项看。', 'Two companies. One field at a time.')}
          </h1>
          <p>
            {t(
              '从已保存的财务资料出发，对齐年度与口径，再回到各自出处。',
              'Align the year and financial scope of saved materials, then check each source.'
            )}
          </p>
        </div>
        <a className="lite-compare-search" href="/?view=search">
          {t('查询公司', 'Research a company')}
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </header>
      <div className="lite-compare-controls">
        {selector('a', a, left)}
        {a && b ? (
          <a
            className="lite-compare-swap"
            href={compareHref(b, a, basis)}
            aria-label={t('交换两家公司', 'Swap the companies')}
          >
            <ArrowLeftRight size={19} />
          </a>
        ) : (
          <span className="lite-compare-swap-slot" />
        )}
        {selector('b', b, right)}
        <label className="lite-compare-basis" htmlFor="lite-compare-basis">
          <span>{t('利润口径', 'Profit basis')}</span>
          <select
            id="lite-compare-basis"
            value={basis}
            onChange={(event) =>
              navigate(
                compareHref(a, b, event.target.value === 'parent' ? 'parent' : 'consolidated')
              )
            }
          >
            <option value="consolidated">{t('合并净利润', 'Consolidated net profit')}</option>
            <option value="parent">{t('归母净利润', 'Profit attributable to owners')}</option>
          </select>
        </label>
      </div>
      {recordsError && (
        <div className="lite-compare-notice" role="alert">
          <p>{recordsError}</p>
          <button onClick={() => void reload()}>
            <RefreshCw size={14} />
            {t('重新读取公司列表', 'Reload company list')}
          </button>
        </div>
      )}
      {reading && (
        <p className="lite-compare-reading" role="status">
          {t('正在读取已保存的公司资料…', 'Loading saved company materials…')}
        </p>
      )}
      {recordsLoading && !recent.length && !a && !b ? (
        <p className="lite-compare-reading" role="status">
          {t('正在读取你的公司记录…', 'Loading your company records…')}
        </p>
      ) : !owner || (!a && !b && !recordsLoading) ? (
        <div className="lite-compare-empty">
          <h2>{t('先查询两家公司。', 'Research two companies first.')}</h2>
          <p>
            {t(
              '有了两份公司记录，就可以在这里核对财务数字。',
              'Return with two company records to compare their financial figures.'
            )}
          </p>
          <a href="/?view=search">
            {t('去查询公司', 'Research a company')}
            <ArrowUpRight size={15} />
          </a>
        </div>
      ) : (
        <>
          <div className="lite-compare-companies">
            {sideHeading('left')}
            {sideHeading('right')}
          </div>
          {comparison.reasons.length > 0 && (
            <div className="lite-compare-notice">
              <ul>
                {comparison.reasons.map((reason) => (
                  <li key={reason.code}>{t(...reason.text)}</li>
                ))}
              </ul>
            </div>
          )}
          {basis === 'parent' && (
            <p className="lite-compare-scope">
              {t(
                '归母净利润与经营现金的合并报表范围不同；这里只对照两家公司的同名字段。',
                'Attributable profit and consolidated operating cash have different scopes; this view compares like fields across the two companies.'
              )}
            </p>
          )}
          {(left.error || right.error) && (
            <button
              className="lite-compare-reload"
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw size={14} />
              {t('重新读取所选记录', 'Reload selected records')}
            </button>
          )}
          <div className="lite-compare-rows">
            {comparison.rows.map((row) => (
              <article className="lite-compare-row" key={row.id} data-comparison-metric={row.id}>
                <header>
                  <h3>{t(...row.label)}</h3>
                  <p>
                    {t('两列使用同一显示单位', 'Both columns use one display unit')} ·{' '}
                    {row.left.amount?.display[language].unit ||
                      row.right.amount?.display[language].unit ||
                      '—'}
                  </p>
                </header>
                <div className="lite-compare-values">
                  {amountCell(row, 'left')}
                  {amountCell(row, 'right')}
                </div>
                {row.reason &&
                  !comparison.reasons.some((reason) => reason.code === row.reason?.code) && (
                    <p className="lite-compare-row-reason">{t(...row.reason.text)}</p>
                  )}
                {row.comparable && row.delta && (
                  <div className="lite-compare-delta">
                    <span>{t('A − B，算术差额', 'A − B, arithmetic difference')}</span>
                    <strong
                      data-exact-yuan={row.delta.exactYuan}
                      title={row.delta.display[language].exactText}
                    >
                      {row.delta.display[language].text}
                    </strong>
                    <details>
                      <summary>{t('精确差额', 'Exact difference')}</summary>
                      <p>{row.delta.display[language].exactText}</p>
                      <p>
                        {t(
                          '仅为同年度同字段相减，不构成排名或原因判断。',
                          'Same-year field subtraction alone does not establish a ranking or a cause.'
                        )}
                      </p>
                    </details>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
