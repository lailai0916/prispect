import { useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Newspaper } from 'lucide-react';
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
};
const PAGE_SIZE = 20;
const scopeLabels: Record<ContentScope, readonly [string, string]> = {
  headline: ['仅新闻标题', 'News headline only'],
  digest: ['媒体摘要', 'Media digest'],
  'media-excerpt': ['已读媒体摘录', 'Retrieved media excerpt'],
  'post-title': ['帖子标题', 'Post title only'],
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

function PublicInformationView({ run }: { run: CompanyResearchRun }) {
  const { t, locale } = useApp();
  const id = useId();
  const [tab, setTab] = useState<PublicTab>('news');
  const [query, setQuery] = useState('');
  const [media, setMedia] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PublicEntry | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const snapshot = run.context;
  const sameCompany =
    !!snapshot &&
    snapshot.securityCode === run.input.securityCode &&
    snapshot.orgId === run.input.orgId;
  const news: PublicEntry[] = sameCompany
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
          id: `news-${row.id || row.url || index}-${index}`,
          scope,
          excerpt: scope === 'media-excerpt' ? excerpt : undefined,
          digest: scope === 'headline' ? '' : row.digest,
        };
      })
    : [];
  const discussions: PublicEntry[] = sameCompany
    ? (snapshot.discussions || [])
        .filter((row) => row.securityCode === run.input.securityCode)
        .map((row, index) => {
          const excerpt =
            row.textScope === 'post-excerpt' ? readableExcerpt(row.excerpt) : undefined;
          return {
            ...row,
            id: `discussion-${row.id}-${index}`,
            media: row.provider,
            scope: excerpt ? 'post-excerpt' : 'post-title',
            digest: '',
            excerpt,
          };
        })
    : [];
  const entries = tab === 'news' ? news : discussions;
  const coverage = sameCompany ? snapshot.publicSignals?.[tab] : undefined;
  const providers = [...new Set(entries.map((row) => row.provider).filter(Boolean))];
  const mediaOptions = [
    ...new Set(entries.map((row) => row.media || row.provider).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, locale === 'en' ? 'en' : 'zh-CN'));
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = entries.filter((row) => {
    const text =
      `${row.title} ${row.digest} ${row.excerpt?.text || ''} ${row.media} ${row.provider}`.toLocaleLowerCase();
    return (
      (media === 'all' || (row.media || row.provider) === media) &&
      terms.every((term) => text.includes(term))
    );
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(offset, offset + PAGE_SIZE);
  const dates = entries
    .map((row) => calendarDate(row.date))
    .filter((value): value is string => !!value)
    .sort();
  const oldest = calendarDate(coverage?.oldest) || dates[0];
  const latest = calendarDate(coverage?.latest) || dates.at(-1);
  const bodyRead = coverage?.bodyRead ?? entries.filter((row) => row.excerpt).length;
  const fetchedAt = sameCompany
    ? snapshot.publicSignals?.fetchedAt || snapshot.fetchedAt
    : undefined;
  const changeTab = (next: PublicTab, focus = false) => {
    setTab(next);
    setMedia('all');
    setPage(1);
    if (focus) document.getElementById(`${id}-${next}-tab`)?.focus();
  };
  const resetFilters = () => {
    setQuery('');
    setMedia('all');
    setPage(1);
  };
  const changePage = (next: number) => {
    setPage(Math.max(1, Math.min(pageCount, next)));
    list.current?.focus({ preventScroll: true });
    list.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  };
  const selectedHref = selected && safeSourceUrl(selected.url);
  const excerptHref = selected?.excerpt && safeSourceUrl(selected.excerpt.url);

  return (
    <section
      className="company-public-information"
      aria-labelledby={`${id}-heading`}
      data-testid="company-public-information"
    >
      <header className="public-info-heading">
        <h2 id={`${id}-heading`}>{t('新闻与公开讨论', 'News and public discussions')}</h2>
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
            {item === 'news' ? t('新闻', 'News') : t('公开讨论', 'Public discussions')}
            <span>{item === 'news' ? news.length : discussions.length}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}-tab`}>
        <dl className="public-info-facts">
          <div>
            <dt>{t('当前样本', 'Current samples')}</dt>
            <dd>{entries.length}</dd>
          </div>
          <div>
            <dt>{t('已读节选', 'Retrieved excerpts')}</dt>
            <dd>
              {bodyRead}
              <small>{t('份', ' items')}</small>
            </dd>
          </div>
          <div className="public-info-date-fact">
            <dt>{t('样本日期范围', 'Sample date range')}</dt>
            <dd>
              {oldest || '—'}
              <span>{latest ? '— ' + latest : ''}</span>
            </dd>
          </div>
          <div className="public-info-platform-fact">
            <dt>{t('来源平台', 'Source platforms')}</dt>
            <dd>{providers.length ? providers.join(' / ') : t('未取得', 'Unavailable')}</dd>
          </div>
        </dl>
        {entries.length > 0 && (
          <div className="public-info-toolbar">
            <SearchField
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              label={
                tab === 'news'
                  ? t('筛选新闻标题与内容', 'Filter news titles and content')
                  : t('筛选帖子标题与公开节选', 'Filter post titles and public excerpts')
              }
              placeholder={t('搜索标题或内容…', 'Search titles or content…')}
            />
            <label>
              <span>{tab === 'news' ? t('媒体', 'Media') : t('平台', 'Platform')}</span>
              <Select
                value={media}
                onValueChange={(value) => {
                  setMedia(value);
                  setPage(1);
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
              </Select>
            </label>
          </div>
        )}
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
                onClick={() => setSelected(row)}
                aria-label={t('查看来源与内容：', 'View source and content: ') + row.title}
              >
                <span className="public-info-item-meta">
                  <span>{row.media || row.provider || t('来源未标注', 'Source unlabeled')}</span>
                  <time>
                    {calendarDate(row.date) || row.date || t('日期未提供', 'Date unavailable')}
                  </time>
                </span>
                <span className="public-info-item-title">{row.title}</span>
                {(row.excerpt?.text || row.digest) && (
                  <span className="public-info-item-preview">
                    {row.excerpt?.text || row.digest}
                  </span>
                )}
                <span className="public-info-item-footer">
                  <span className={'public-info-scope public-info-scope-' + row.scope}>
                    {t(...scopeLabels[row.scope])}
                  </span>
                  <ArrowRight size={13} aria-hidden="true" />
                </span>
              </button>
            </article>
          ))}
        </div>
        {!visible.length && (
          <div className="public-info-empty">
            <Newspaper size={20} aria-hidden="true" />
            <p>
              {entries.length
                ? t('当前筛选没有匹配的样本。', 'No samples match these filters.')
                : tab === 'discussions' && !coverage
                  ? t(
                      '尚未读取公开讨论。缺少帖子样本不代表没有讨论或负面观点。',
                      'Public discussions have not been retrieved. Missing samples do not establish absence of discussion or negative views.'
                    )
                  : tab === 'news'
                    ? t(
                        '本次尚未取得可显示的新闻样本，不能据此判断没有相关事件。',
                        'No displayable news samples are available for this retrieval. This does not establish absence of relevant events.'
                      )
                    : t(
                        '本次采集未取得可显示的讨论样本，不能据此判断没有负面观点。',
                        'This retrieval obtained no displayable discussion samples. This does not establish absence of negative views.'
                      )}
            </p>
            {entries.length > 0 && (
              <button type="button" className="text-link" onClick={resetFilters}>
                {t('清除筛选', 'Clear filters')}
              </button>
            )}
          </div>
        )}
        {filtered.length > 0 && (
          <footer className="public-info-pagination">
            <span role="status" aria-live="polite">
              {t(
                `显示 ${offset + 1}–${offset + visible.length} / ${filtered.length} 条`,
                `Showing ${offset + 1}–${offset + visible.length} of ${filtered.length}`
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
        {coverage && (
          <details className="public-info-coverage">
            <summary>{t('本次采集范围', 'Retrieval coverage')}</summary>
            <p>
              {t(
                `返回 ${coverage.raw} 条 · 主体筛选 ${coverage.accepted} 条 · 去重 ${coverage.unique} 条 · 已读取 ${coverage.pages} 页`,
                `${coverage.raw} returned · ${coverage.accepted} entity-matched · ${coverage.unique} deduplicated · ${coverage.pages} pages read`
              )}
              {coverage.hitsTotal !== null
                ? ' · ' +
                  t(
                    `来源报告 ${coverage.hitsTotal} 条匹配`,
                    `Source reports ${coverage.hitsTotal} matches`
                  )
                : ''}
            </p>
            <p>
              {t(...stopLabels[coverage.stopReason])}
              {coverage.stopReason !== 'complete'
                ? t('；本次样本不代表全部内容。', '; these samples do not represent all content.')
                : t(
                    '；样本仅代表本轮可取得内容。',
                    '; samples cover only the content available in this retrieval.'
                  )}
            </p>
          </details>
        )}
        <p className="public-info-footnote">
          {tab === 'news'
            ? t(
                '标题、媒体摘要与已读取的摘录分别标注；转发或重复报道不等于独立证据。',
                'Headlines, media digests and retrieved excerpts are labeled separately. Reposts and repeated coverage are not independent evidence.'
              )
            : t(
                '公开讨论只代表该平台的样本观点，有参与偏差；转帖不等于独立观点，帖子数量不构成公司信誉评分。',
                'Public discussions reflect sampled views on this platform and have participation bias. Reposts are not independent opinions, and post counts are not a company reputation score.'
              )}
        </p>
      </div>
      {selected && (
        <Dialog
          title={selected.title}
          onClose={() => setSelected(null)}
          variant="drawer"
          className="public-info-drawer"
        >
          <div className="public-info-drawer-meta">
            <span className={'public-info-scope public-info-scope-' + selected.scope}>
              {t(...scopeLabels[selected.scope])}
            </span>
            <span>
              {selected.media || selected.provider || t('来源未标注', 'Source unlabeled')}
            </span>
            <time>{calendarDate(selected.date) || selected.date}</time>
          </div>
          {selected.updatedAt && (
            <p className="public-info-drawer-note">
              {t('来源更新于 ', 'Source updated ') + selected.updatedAt}
            </p>
          )}
          {selected.excerpt ? (
            <section className="public-info-drawer-content">
              <h3>
                {selected.scope === 'post-excerpt'
                  ? t('公开观点节选', 'Public post excerpt')
                  : t('已读媒体摘录', 'Retrieved media excerpt')}
              </h3>
              <blockquote>{selected.excerpt.text}</blockquote>
              <p className="public-info-drawer-note">
                {t('读取于 ', 'Read ') + date(selected.excerpt.readAt, locale)} ·{' '}
                {t(
                  '这是已取得的节选，未声称完整读过全文。',
                  'This is a retrieved excerpt; it does not establish that the full text was read.'
                )}
              </p>
            </section>
          ) : selected.scope === 'digest' && selected.digest ? (
            <section className="public-info-drawer-content">
              <h3>{t('媒体摘要', 'Media digest')}</h3>
              <p>{selected.digest}</p>
              <p className="public-info-drawer-note">
                {t(
                  '摘要由公开来源提供，尚未读取媒体正文。',
                  'The public source supplied this digest; the media article body has not been read.'
                )}
              </p>
            </section>
          ) : (
            <p className="public-info-drawer-note">
              {t(
                '目前仅取得标题，尚未读取正文；标题不能直接作为事件或观点已经证实的依据。',
                'Only the title was retrieved. The body has not been read; a title alone does not establish an event or verify an opinion.'
              )}
            </p>
          )}
          <div className="public-info-drawer-actions">
            {selectedHref ? (
              <a
                className="button button-secondary"
                href={selectedHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('打开来源', 'Open source')}
                <ArrowUpRight size={14} />
              </a>
            ) : (
              <p className="public-info-drawer-note">
                {t('未取得可打开的来源链接。', 'An available source link was not retrieved.')}
              </p>
            )}
            {excerptHref && excerptHref !== selectedHref && (
              <a className="text-link" href={excerptHref} target="_blank" rel="noopener noreferrer">
                {t('摘录来源', 'Excerpt source')}
                <ArrowUpRight size={13} />
              </a>
            )}
          </div>
          {selected.excerpt?.sha256 && (
            <details className="public-info-file-record">
              <summary>{t('读取记录', 'Retrieval record')}</summary>
              <p>{t('内容哈希 ', 'Content hash ') + selected.excerpt.sha256}</p>
            </details>
          )}
          <p className="public-info-drawer-note">
            {selected.scope === 'post-title' || selected.scope === 'post-excerpt'
              ? t(
                  '这是公开平台上的个人观点，不等于公司披露或已证实事实。',
                  'This is a view from a public platform, not a company disclosure or an established fact.'
                )
              : t(
                  '媒体内容提供核查线索，相关事件仍需结合公司原文与其他来源核对。',
                  'Media content provides research leads. Check the relevant event against company originals and other sources.'
                )}
          </p>
        </Dialog>
      )}
    </section>
  );
}

/** Read-only sample browsing. Filters and pagination never call external sources or the model. */
export function CompanyPublicInformation({ run }: { run: CompanyResearchRun }) {
  const { user } = useApp();
  const revision = useRef(0);
  const scope = JSON.stringify({
    owner: user?.id || null,
    run: run.id,
    securityCode: run.input.securityCode,
    orgId: run.input.orgId,
    contextSecurityCode: run.context?.securityCode,
    contextOrgId: run.context?.orgId,
    fetchedAt: run.context?.fetchedAt,
    coverage: run.context?.publicSignals,
    news: run.context?.news,
    discussions: run.context?.discussions,
  });
  const currentRevision = useMemo(() => ++revision.current, [scope]);
  return (
    <PublicInformationView key={`${user?.id || 'public'}:${run.id}:${currentRevision}`} run={run} />
  );
}
