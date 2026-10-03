import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  MessageSquare,
  Newspaper,
} from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import type { CompanyPublicExcerpt, PublicSignalCoverage } from '../shared/company-workspace';
import { Dialog } from './components';
import { SearchField } from './Experience';
import { Select } from './Select';
import { useApp } from './context';
import { date } from './format';
import './company-public-information.css';

type PublicTab = 'news' | 'discussions';
type ContentScope = 'headline' | 'digest' | 'media-excerpt' | 'post-title' | 'post-excerpt';
type ReadScope = 'all' | 'excerpt' | 'digest' | 'title';
type PublicEntry = {
  id: string;
  title: string;
  date: string;
  updatedAt?: string;
  provider: string;
  media: string;
  url: string;
  scope: ContentScope;
  digest: string;
  excerpt?: CompanyPublicExcerpt;
  clusterId?: string;
};
const PREVIEW_SIZE = 6;
const PAGE_SIZE = 12;
const scopeLabels: Record<ContentScope, readonly [string, string]> = {
  headline: ['仅标题', 'Headline only'],
  digest: ['媒体摘要', 'Media digest'],
  'media-excerpt': ['已读节选', 'Retrieved excerpt'],
  'post-title': ['仅帖子标题', 'Post title only'],
  'post-excerpt': ['公开观点节选', 'Public post excerpt'],
};
const stopLabels: Record<PublicSignalCoverage['stopReason'], readonly [string, string]> = {
  complete: ['本轮采集完成', 'This retrieval completed'],
  'page-limit': ['达到本轮页数上限', 'Page limit reached'],
  'request-budget': ['达到本轮检索上限', 'Retrieval limit reached'],
  deadline: ['达到本轮时限', 'Retrieval time limit reached'],
  'source-failure': ['来源读取未完成', 'Source retrieval incomplete'],
};

function safeSourceUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value);
    if (
      !['https:', 'http:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.port
    )
      return;
    return value;
  } catch {
    return;
  }
}
function readableExcerpt(
  excerpt: CompanyPublicExcerpt | undefined
): CompanyPublicExcerpt | undefined {
  return excerpt?.text.trim() && safeSourceUrl(excerpt.url) ? excerpt : undefined;
}
function calendarDate(value: string | null | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined;
}
function contentPreview(text: string, terms: string[]): string {
  if (!terms.length) return text;
  const lower = text.toLocaleLowerCase();
  const positions = terms.map((term) => lower.indexOf(term)).filter((position) => position >= 0);
  if (!positions.length) return text;
  const start = Math.max(0, Math.min(...positions) - 35);
  const end = Math.min(text.length, start + 140);
  return `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}
function useCompactReader() {
  const [compact, setCompact] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(max-width: 980px)').matches
  );
  useEffect(() => {
    const media = window.matchMedia('(max-width: 980px)');
    const sync = () => setCompact(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return compact;
}

function PublicEntryContent({ entry }: { entry: PublicEntry }) {
  const { t, locale } = useApp();
  const sourceHref = safeSourceUrl(entry.url);
  const excerptHref = entry.excerpt && safeSourceUrl(entry.excerpt.url);
  const isOpinion = entry.scope === 'post-title' || entry.scope === 'post-excerpt';
  return (
    <>
      <div className="public-info-reader-meta">
        <span className={'public-info-scope public-info-scope-' + entry.scope}>
          {t(...scopeLabels[entry.scope])}
        </span>
        <span>{entry.media || entry.provider || t('来源未标注', 'Source unlabeled')}</span>
        <time dateTime={calendarDate(entry.date)}>
          {calendarDate(entry.date) || entry.date || t('日期未提供', 'Date unavailable')}
        </time>
      </div>
      {isOpinion && (
        <p className="public-info-quality-note">
          <MessageSquare size={14} aria-hidden="true" />
          {t('未核实的公众观点', 'Unverified public opinion')}
        </p>
      )}
      <div className="public-info-reader-actions">
        {sourceHref ? (
          <a
            className="button button-secondary"
            href={sourceHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('打开来源原文', 'Open source')}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        ) : (
          <p className="public-info-reader-note">
            {t('未取得可打开的来源链接。', 'An available source link was not retrieved.')}
          </p>
        )}
        {excerptHref && excerptHref !== sourceHref && (
          <a className="text-link" href={excerptHref} target="_blank" rel="noopener noreferrer">
            {t('节选来源', 'Excerpt source')}
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        )}
      </div>
      <section className="public-info-reader-content">
        {entry.excerpt ? (
          <>
            <h4>
              {isOpinion
                ? t('已取得的观点节选', 'Retrieved opinion excerpt')
                : t('已取得的正文节选', 'Retrieved article excerpt')}
            </h4>
            <blockquote>{entry.excerpt.text}</blockquote>
            <p className="public-info-reader-note">
              {t('读取于 ', 'Read ') + date(entry.excerpt.readAt, locale)}
              {' · '}
              {t('全文覆盖未确认。', 'Full-text coverage is unconfirmed.')}
            </p>
          </>
        ) : entry.scope === 'digest' && entry.digest ? (
          <>
            <h4>{t('来源提供的摘要', 'Source-provided digest')}</h4>
            <p>{entry.digest}</p>
            <p className="public-info-reader-note">
              {t('尚未取得正文。', 'The article body has not been retrieved.')}
            </p>
          </>
        ) : (
          <div className="public-info-title-only">
            <FileText size={20} aria-hidden="true" />
            <h4>{t('本条仅取得标题', 'Only the title was retrieved')}</h4>
            <p>{t('打开来源核对全文。', 'Open the source to check the full text.')}</p>
          </div>
        )}
      </section>
      {(entry.excerpt || entry.updatedAt) && (
        <details className="public-info-file-record">
          <summary>{t('读取记录', 'Retrieval record')}</summary>
          <dl>
            {entry.updatedAt && (
              <div>
                <dt>{t('来源更新时间', 'Source updated')}</dt>
                <dd>{entry.updatedAt}</dd>
              </div>
            )}
            {entry.excerpt && (
              <>
                <div>
                  <dt>{t('节选读取时间', 'Excerpt read')}</dt>
                  <dd>{date(entry.excerpt.readAt, locale)}</dd>
                </div>
                {entry.excerpt.sha256 && (
                  <div>
                    <dt>SHA-256</dt>
                    <dd>
                      <code>{entry.excerpt.sha256}</code>
                    </dd>
                  </div>
                )}
              </>
            )}
          </dl>
        </details>
      )}
      <p className="public-info-reader-note public-info-source-boundary">
        {isOpinion
          ? t(
              '帖子来自公开平台，存在参与偏差；个人观点不能替代公司披露或已证实事实。',
              'Public posts have participation bias. Individual views do not replace company disclosures or established facts.'
            )
          : t(
              '媒体内容提供核查线索。相关事件仍需与公司披露和其他来源交叉核对。',
              'Media content provides research leads. Check events against company disclosures and other sources.'
            )}
      </p>
    </>
  );
}

function PublicInformationView({ run }: { run: CompanyResearchRun }) {
  const { t, locale } = useApp();
  const id = useId();
  const compactReader = useCompactReader();
  const [tab, setTab] = useState<PublicTab>('news');
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [media, setMedia] = useState('all');
  const [readScope, setReadScope] = useState<ReadScope>('all');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerEntry, setDrawerEntry] = useState<PublicEntry | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const snapshot = run.context;
  const sameCompany =
    !!snapshot &&
    snapshot.securityCode === run.input.securityCode &&
    snapshot.orgId === run.input.orgId;
  const news: PublicEntry[] = useMemo(
    () =>
      sameCompany
        ? snapshot.news.map((row, index) => {
            const excerpt = readableExcerpt(row.excerpt);
            const scope: ContentScope =
              excerpt && (row.contentScope === 'media-excerpt' || !row.contentScope)
                ? 'media-excerpt'
                : row.contentScope !== 'headline' && row.digest.trim()
                  ? 'digest'
                  : 'headline';
            return {
              ...row,
              id: `news-${row.url || row.id || index}`,
              scope,
              excerpt: scope === 'media-excerpt' ? excerpt : undefined,
              digest: scope === 'headline' ? '' : row.digest,
            };
          })
        : [],
    [sameCompany, snapshot]
  );
  const discussions: PublicEntry[] = useMemo(
    () =>
      sameCompany
        ? (snapshot.discussions || [])
            .filter((row) => row.securityCode === run.input.securityCode)
            .map((row) => {
              const excerpt =
                row.textScope === 'post-excerpt' ? readableExcerpt(row.excerpt) : undefined;
              return {
                ...row,
                id: `discussion-${row.id}`,
                media: row.provider,
                scope: excerpt ? 'post-excerpt' : 'post-title',
                digest: '',
                excerpt,
              };
            })
        : [],
    [sameCompany, snapshot]
  );
  const entries = tab === 'news' ? news : discussions;
  const coverage = sameCompany ? snapshot.publicSignals?.[tab] : undefined;
  const providers = [...new Set(entries.map((row) => row.provider).filter(Boolean))];
  const mediaOptions = [
    ...new Set(entries.map((row) => row.media || row.provider).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, locale === 'en' ? 'en' : 'zh-CN'));
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = entries
    .filter((row) => {
      const text =
        `${row.title} ${row.digest} ${row.excerpt?.text || ''} ${row.media} ${row.provider}`.toLocaleLowerCase();
      return (
        (media === 'all' || (row.media || row.provider) === media) &&
        (readScope === 'all' ||
          (readScope === 'excerpt' && !!row.excerpt) ||
          (readScope === 'digest' && row.scope === 'digest') ||
          (readScope === 'title' && (row.scope === 'headline' || row.scope === 'post-title'))) &&
        terms.every((term) => text.includes(term))
      );
    })
    .sort((a, b) => {
      const aDate = calendarDate(a.date);
      const bDate = calendarDate(b.date);
      if (!aDate || !bDate) return aDate ? -1 : bDate ? 1 : 0;
      return sort === 'oldest' ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
    });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const selectedPosition = filtered.findIndex((row) => row.id === selectedId);
  const currentPage =
    expanded && selectedPosition >= 0
      ? Math.floor(selectedPosition / PAGE_SIZE) + 1
      : Math.min(page, pageCount);
  const offset = expanded ? (currentPage - 1) * PAGE_SIZE : 0;
  const visible = filtered.slice(offset, offset + (expanded ? PAGE_SIZE : PREVIEW_SIZE));
  const selected =
    visible.find((row) => row.id === selectedId) ||
    visible.find((row) => row.excerpt) ||
    visible[0];
  const selectedIndex = visible.findIndex((row) => row.id === selected?.id);
  const dates = entries
    .map((row) => calendarDate(row.date))
    .filter((value): value is string => !!value)
    .sort();
  const oldest = calendarDate(coverage?.oldest) || dates[0];
  const latest = calendarDate(coverage?.latest) || dates.at(-1);
  const readableCount = entries.filter((row) => row.excerpt).length;
  const fetchedAt = sameCompany
    ? snapshot.publicSignals?.fetchedAt || snapshot.fetchedAt
    : undefined;
  const hasFilters = !!query.trim() || media !== 'all' || readScope !== 'all';
  const openSource =
    drawerEntry && [...news, ...discussions].find((row) => row.id === drawerEntry.id);
  useEffect(() => {
    if (selectedId && selectedPosition < 0) setSelectedId(null);
    if (drawerEntry && !openSource) {
      setDrawerEntry(null);
      list.current?.focus({ preventScroll: true });
    }
  }, [selectedId, selectedPosition, drawerEntry, openSource]);
  useLayoutEffect(() => {
    // Explicit browsing changes start at the first result. A new snapshot alone
    // preserves the current list position and the keyed source-reader body.
    if (list.current) list.current.scrollTop = 0;
  }, [expanded, query, media, readScope, sort, tab, currentPage]);
  const clusterCounts = new Map<string, number>();
  for (const row of entries) {
    if (row.clusterId)
      clusterCounts.set(row.clusterId, (clusterCounts.get(row.clusterId) || 0) + 1);
  }
  const changeTab = (next: PublicTab, focus = false) => {
    if (focus) document.getElementById(`${id}-${next}-tab`)?.focus({ preventScroll: true });
    if (next === tab) return;
    setTab(next);
    setMedia('all');
    setReadScope('all');
    setPage(1);
    setSelectedId(null);
    setDrawerEntry(null);
  };
  const resetFilters = () => {
    setQuery('');
    setMedia('all');
    setReadScope('all');
    setPage(1);
    setSelectedId(null);
  };
  const changePage = (next: number) => {
    setPage(Math.max(1, Math.min(pageCount, next)));
    setSelectedId(null);
    list.current?.focus({ preventScroll: true });
    if (compactReader) list.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    else if (list.current) list.current.scrollTop = 0;
  };
  const openEntry = (row: PublicEntry) => {
    setSelectedId(row.id);
    if (!expanded || compactReader) setDrawerEntry(row);
  };

  return (
    <section
      className="company-public-information"
      aria-labelledby={`${id}-heading`}
      data-testid="company-public-information"
    >
      <header className="public-info-heading">
        <div>
          <h2 id={`${id}-heading`}>{t('新闻与公开讨论', 'News and public discussions')}</h2>
          <p>
            {t(
              '查阅本轮已取得的内容，核对不同来源的说法。',
              'Review retrieved content and compare accounts across sources.'
            )}
          </p>
        </div>
        <span>
          {fetchedAt
            ? t('采集于 ', 'Retrieved ') + date(fetchedAt, locale)
            : t('尚未取得公开样本', 'Public samples unavailable')}
          {run.contextStatus === 'loading' ? ' · ' + t('更新中', 'Updating') : ''}
        </span>
      </header>
      <div
        className="public-info-tabs"
        role="tablist"
        aria-label={t('公开信息类型', 'Public information type')}
      >
        {(['news', 'discussions'] as const).map((item) => (
          <button
            type="button"
            role="tab"
            id={`${id}-${item}-tab`}
            aria-controls={`${id}-panel`}
            aria-selected={tab === item}
            tabIndex={tab === item ? 0 : -1}
            key={item}
            onClick={() => changeTab(item)}
            onKeyDown={(event) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                changeTab(
                  event.key === 'Home'
                    ? 'news'
                    : event.key === 'End'
                      ? 'discussions'
                      : tab === 'news'
                        ? 'discussions'
                        : 'news',
                  true
                );
              }
            }}
          >
            {item === 'news' ? <Newspaper size={14} /> : <MessageSquare size={14} />}
            {item === 'news' ? t('新闻', 'News') : t('公开讨论', 'Public discussions')}
            <span>{item === 'news' ? news.length : discussions.length}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}-tab`}>
        <dl className="public-info-facts">
          <div>
            <dt>{t('已取得条目', 'Retrieved items')}</dt>
            <dd>{entries.length}</dd>
          </div>
          <div>
            <dt>{t('可阅读节选', 'Readable excerpts')}</dt>
            <dd>
              {readableCount ? (
                <button
                  type="button"
                  className="public-info-fact-action"
                  aria-label={t(
                    `查看 ${readableCount} 份已取得节选`,
                    `View ${readableCount} retrieved excerpts`
                  )}
                  aria-controls={`${id}-panel`}
                  onClick={() => {
                    setExpanded(true);
                    resetFilters();
                    setReadScope('excerpt');
                    setSort('recent');
                  }}
                >
                  {readableCount}
                  <ArrowUpRight size={13} aria-hidden="true" />
                </button>
              ) : (
                0
              )}
            </dd>
          </div>
          <div>
            <dt>{tab === 'news' ? t('媒体来源', 'Media sources') : t('来源平台', 'Platforms')}</dt>
            <dd>{mediaOptions.length}</dd>
          </div>
          <div className="public-info-date-fact">
            <dt>{t('样本日期范围', 'Sample date range')}</dt>
            <dd>{oldest && latest ? `${oldest} — ${latest}` : oldest || latest || '—'}</dd>
          </div>
        </dl>
        {expanded && (entries.length > 0 || hasFilters) && (
          <div className="public-info-toolbar">
            <SearchField
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
                setSelectedId(null);
              }}
              label={t(
                '搜索已取得的标题、摘要与节选',
                'Search retrieved titles, digests and excerpts'
              )}
              placeholder={t('搜索标题、内容或来源…', 'Search titles, content or sources…')}
            />
            <div className="public-info-filter-controls">
              <Select
                value={media}
                onValueChange={(value) => {
                  setMedia(value);
                  setPage(1);
                  setSelectedId(null);
                }}
                aria-label={
                  tab === 'news'
                    ? t('按媒体筛选', 'Filter by media')
                    : t('按平台筛选', 'Filter by platform')
                }
              >
                <option value="all">
                  {tab === 'news' ? t('全部媒体', 'All media') : t('全部平台', 'All platforms')}
                </option>
                {mediaOptions.map((name) => (
                  <option value={name} key={name}>
                    {name}
                  </option>
                ))}
                {media !== 'all' && !mediaOptions.includes(media) && (
                  <option value={media}>
                    {media} · {t('本轮无条目', 'No items in this snapshot')}
                  </option>
                )}
              </Select>
              <Select
                value={readScope}
                onValueChange={(value) => {
                  setReadScope(value as ReadScope);
                  setPage(1);
                  setSelectedId(null);
                }}
                aria-label={t('按已取得的内容范围筛选', 'Filter by retrieved content scope')}
              >
                <option value="all">{t('全部内容范围', 'All content scopes')}</option>
                <option value="excerpt">{t('有可读节选', 'With readable excerpts')}</option>
                {tab === 'news' && (
                  <option value="digest">{t('仅媒体摘要', 'Media digest only')}</option>
                )}
                <option value="title">{t('仅标题', 'Title only')}</option>
              </Select>
              <Select
                value={sort}
                onValueChange={(value) => {
                  setSort(value);
                  setPage(1);
                  setSelectedId(null);
                }}
                aria-label={t('按样本日期排序', 'Sort by sample date')}
              >
                <option value="recent">{t('最新在前', 'Newest first')}</option>
                <option value="oldest">{t('最早在前', 'Oldest first')}</option>
              </Select>
            </div>
          </div>
        )}
        {expanded && (entries.length > 0 || hasFilters) && (
          <div className="public-info-results-meta">
            <span role="status" aria-live="polite">
              {t(
                `匹配 ${filtered.length} / ${entries.length} 条`,
                `${filtered.length} of ${entries.length} items match`
              )}
            </span>
            {hasFilters ? (
              <button type="button" className="text-link" onClick={resetFilters}>
                {t('清除筛选', 'Clear filters')}
              </button>
            ) : (
              <span>{t('仅搜索已取得内容', 'Searches retrieved content only')}</span>
            )}
          </div>
        )}
        <div className={'public-info-workspace' + (expanded ? ' is-expanded' : '')}>
          <div className="public-info-list-pane">
            <div
              className="public-info-list"
              ref={list}
              tabIndex={-1}
              aria-label={t('当前页公开样本', 'Public samples on this page')}
            >
              {visible.map((row) => (
                <article className="public-info-item" key={row.id}>
                  <button
                    type="button"
                    className="public-info-row"
                    onClick={() => openEntry(row)}
                    aria-label={t('查看来源与内容：', 'View source and content: ') + row.title}
                    aria-current={
                      expanded && !compactReader && row.id === selected?.id ? true : undefined
                    }
                    aria-controls={expanded && !compactReader ? `${id}-reader` : undefined}
                  >
                    <span className="public-info-row-icon" aria-hidden="true">
                      {row.excerpt ? (
                        <BookOpen size={15} />
                      ) : tab === 'news' ? (
                        <Newspaper size={15} />
                      ) : (
                        <MessageSquare size={15} />
                      )}
                    </span>
                    <span className="public-info-row-copy">
                      <span className="public-info-item-title">{row.title}</span>
                      <span className="public-info-item-meta">
                        <span>
                          {row.media || row.provider || t('来源未标注', 'Source unlabeled')}
                        </span>
                        <time dateTime={calendarDate(row.date)}>
                          {calendarDate(row.date) ||
                            row.date ||
                            t('日期未提供', 'Date unavailable')}
                        </time>
                        <span className={'public-info-scope public-info-scope-' + row.scope}>
                          {t(...scopeLabels[row.scope])}
                        </span>
                        {row.clusterId && (clusterCounts.get(row.clusterId) || 0) > 1 && (
                          <span>{t('同一报道分组', 'Shared coverage group')}</span>
                        )}
                      </span>
                      {(!expanded || terms.length > 0) && (row.excerpt?.text || row.digest) && (
                        <span className="public-info-item-preview">
                          {contentPreview(row.excerpt?.text || row.digest, terms)}
                        </span>
                      )}
                    </span>
                    <ChevronRight size={14} className="public-info-row-arrow" aria-hidden="true" />
                  </button>
                </article>
              ))}
            </div>
            {!visible.length && (
              <div className="public-info-empty">
                <Newspaper size={22} aria-hidden="true" />
                <h3>
                  {entries.length
                    ? t('没有匹配的条目', 'No matching items')
                    : t('尚无可显示的样本', 'No displayable samples')}
                </h3>
                <p>
                  {entries.length
                    ? t(
                        '试试其他关键词、来源或内容范围。',
                        'Try another keyword, source or content scope.'
                      )
                    : tab === 'discussions' && !coverage
                      ? t(
                          '本轮未取得公开讨论样本。',
                          'No public discussion samples were retrieved in this run.'
                        )
                      : t(
                          '本轮未取得可显示的内容。',
                          'No displayable content was retrieved in this run.'
                        )}
                </p>
                {hasFilters && (
                  <button type="button" className="button button-secondary" onClick={resetFilters}>
                    {t('清除筛选', 'Clear filters')}
                  </button>
                )}
              </div>
            )}
            {expanded && filtered.length > 0 && (
              <footer className="public-info-pagination">
                <span>
                  {t(
                    `显示 ${offset + 1}–${offset + visible.length} 条`,
                    `Showing ${offset + 1}–${offset + visible.length}`
                  )}
                </span>
                <div>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={currentPage <= 1}
                    onClick={() => changePage(currentPage - 1)}
                    aria-label={t('上一页样本', 'Previous sample page')}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span>
                    {currentPage} / {pageCount}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={currentPage >= pageCount}
                    onClick={() => changePage(currentPage + 1)}
                    aria-label={t('下一页样本', 'Next sample page')}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </footer>
            )}
          </div>
          {expanded && !compactReader && selected && (
            <aside
              className="public-info-reader"
              id={`${id}-reader`}
              aria-label={t('来源阅读区', 'Source reader')}
            >
              <header className="public-info-reader-topbar">
                <span>
                  <BookOpen size={14} aria-hidden="true" />
                  {t('来源阅读', 'Source reader')}
                </span>
                <div>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={selectedIndex <= 0}
                    onClick={() => setSelectedId(visible[selectedIndex - 1].id)}
                    aria-label={t('阅读上一条', 'Read previous item')}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span>
                    {selectedIndex + 1} / {visible.length}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={selectedIndex >= visible.length - 1}
                    onClick={() => setSelectedId(visible[selectedIndex + 1].id)}
                    aria-label={t('阅读下一条', 'Read next item')}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </header>
              <div className="public-info-reader-body" key={selected.id}>
                <h3 aria-live="polite" aria-atomic="true">
                  {selected.title}
                </h3>
                <PublicEntryContent entry={selected} />
              </div>
            </aside>
          )}
        </div>
        {entries.length > 0 && (
          <div className="public-info-browse">
            {!expanded && (
              <span>
                {t(
                  `最近 ${visible.length} 条 · 点击查看来源与内容`,
                  `${visible.length} recent items · Select to view content and source`
                )}
              </span>
            )}
            <button
              type="button"
              className="text-link"
              aria-expanded={expanded}
              aria-controls={`${id}-panel`}
              onClick={() => {
                setExpanded(!expanded);
                resetFilters();
                setSort('recent');
                setDrawerEntry(null);
              }}
            >
              {expanded
                ? t('收起来源工作区', 'Collapse source workspace')
                : t(`浏览全部 ${entries.length} 条`, `Browse all ${entries.length} items`)}
              {expanded ? (
                <ChevronDown size={14} className="public-info-collapse" />
              ) : (
                <ArrowRight size={14} />
              )}
            </button>
          </div>
        )}
        {coverage && (
          <details className="public-info-coverage">
            <summary>{t('采集范围与读取记录', 'Retrieval scope and records')}</summary>
            <dl>
              <div>
                <dt>{t('返回条目', 'Returned items')}</dt>
                <dd>{coverage.raw}</dd>
              </div>
              <div>
                <dt>{t('主体筛选', 'Entity-matched')}</dt>
                <dd>{coverage.accepted}</dd>
              </div>
              <div>
                <dt>{t('去重后', 'Deduplicated')}</dt>
                <dd>{coverage.unique}</dd>
              </div>
              <div>
                <dt>{t('读取页数', 'Pages retrieved')}</dt>
                <dd>{coverage.pages}</dd>
              </div>
              <div>
                <dt>{t('采集记录中的正文读取', 'Body reads in retrieval record')}</dt>
                <dd>{coverage.bodyRead}</dd>
              </div>
              <div>
                <dt>{t('本页可阅读节选', 'Readable excerpts here')}</dt>
                <dd>{readableCount}</dd>
              </div>
              {coverage.hitsTotal !== null && (
                <div>
                  <dt>{t('来源报告的匹配数', 'Source-reported matches')}</dt>
                  <dd>{coverage.hitsTotal}</dd>
                </div>
              )}
              <div>
                <dt>{t('来源平台', 'Source platforms')}</dt>
                <dd>{providers.join(' / ') || '—'}</dd>
              </div>
            </dl>
            <p>
              {t(...stopLabels[coverage.stopReason])}
              {t(
                '；覆盖范围仅限本轮可取得样本。',
                '; coverage is limited to samples available in this retrieval.'
              )}
            </p>
          </details>
        )}
      </div>
      {openSource && (
        <Dialog
          title={openSource.title}
          onClose={() => setDrawerEntry(null)}
          variant="drawer"
          className="public-info-drawer"
        >
          <PublicEntryContent entry={openSource} />
        </Dialog>
      )}
    </section>
  );
}

/** Read-only snapshot browsing. Filters, sorting and reading never call sources or the model. */
export function CompanyPublicInformation({ run }: { run: CompanyResearchRun }) {
  const { user } = useApp();
  const scope = JSON.stringify({
    owner: user?.id || null,
    run: run.id,
    securityCode: run.input.securityCode,
    orgId: run.input.orgId,
    contextSecurityCode: run.context?.securityCode,
    contextOrgId: run.context?.orgId,
  });
  // Account and entity changes reset the reader. Updating this same research's
  // public snapshot should not close a drawer or discard the user's filters.
  return <PublicInformationView key={scope} run={run} />;
}
