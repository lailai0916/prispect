import { useId } from 'react';
import { ArrowUpRight, ChevronDown, Clock3, FileText } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import { companyPath, type CompanySourceReceipt } from '../shared/company-workspace';
import { useApp } from './context';
import { date, money, yuan } from './format';
import './company-brief.css';

function publicText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text && !/^(?:[-—–]+|null|undefined|n\/a)$/i.test(text) ? text : null;
}

function decimal(value: string | null | undefined): string | null {
  const text = publicText(value)?.replace(/,/g, '');
  return text && /^\d+(?:\.\d+)?$/.test(text) && Number.isFinite(Number(text)) ? text : null;
}

function calendarDate(value: string | null | undefined): string | null {
  const text = publicText(value);
  const match = text?.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\b|T)/);
  if (!match) return text;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function externalHref(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password &&
      !url.port
    )
      return value;
  } catch {
    return;
  }
}

function sourceGroups(sources: CompanySourceReceipt[]) {
  const groups = new Map<string, CompanySourceReceipt[]>();
  const latest = new Map(sources.map((source) => [source.id, source]));
  for (const source of latest.values()) {
    if (source.status === 'manual') continue;
    const rows = groups.get(source.provider) || [];
    rows.push(source);
    groups.set(source.provider, rows);
  }
  return [...groups].map(([provider, rows]) => ({
    provider,
    total: rows.length,
    complete: rows.filter((row) => row.status === 'available').length,
    partial: rows.filter((row) => row.status === 'partial').length,
    unavailable: rows.filter((row) => row.status === 'empty' || row.status === 'error').length,
  }));
}

export function CompanyBrief({
  run,
  sourceHref,
  showIdentity = true,
}: {
  run: CompanyResearchRun;
  sourceHref?: string;
  showIdentity?: boolean;
}) {
  const { t, locale } = useApp();
  const headingId = useId();
  const context =
    run.context?.securityCode === run.input.securityCode && run.context.orgId === run.input.orgId
      ? run.context
      : undefined;
  const identity =
    run.identity?.securityCode === run.input.securityCode && run.identity.orgId === run.input.orgId
      ? run.identity
      : undefined;
  const profile = context?.profile || {};
  const legalName =
    publicText(profile.orgName) ||
    publicText(identity?.companyName) ||
    publicText(context?.companyName) ||
    identity?.shortName ||
    run.input.securityCode;
  const industry = publicText(profile.industry);
  const business = publicText(profile.business);
  const capital = decimal(profile.capitalWan);
  const employeeCount = decimal(profile.employees);
  const facts = [
    ...(!showIdentity
      ? [{ id: 'company-name', label: t('公司名称', 'Company name'), value: legalName }]
      : []),
    {
      id: 'credit-code',
      label: t('统一社会信用代码', 'Registration code'),
      value: publicText(profile.creditCode),
      mono: true,
    },
    {
      id: 'capital',
      label: t('注册资本', 'Registered capital'),
      value: capital ? money(yuan(capital, 'wan'), locale) + t('元', ' CNY') : null,
    },
    {
      id: 'founded',
      label: t('成立日期', 'Founded'),
      value: calendarDate(profile.founded),
    },
    {
      id: 'listed',
      label: t('上市日期', 'Listed'),
      value: calendarDate(profile.listed),
    },
    {
      id: 'controller',
      label: t('实际控制人', 'Actual controller'),
      value: publicText(profile.controller),
    },
    {
      id: 'auditor',
      label: t('审计机构', 'Auditor'),
      value: publicText(profile.auditor),
    },
    ...(publicText(profile.province) || employeeCount
      ? [
          {
            id: 'province',
            label: t('注册地区', 'Registered region'),
            value: publicText(profile.province),
          },
          {
            id: 'employees',
            label: t('披露员工数', 'Disclosed employees'),
            value:
              employeeCount && /^\d+$/.test(employeeCount)
                ? money(employeeCount, locale, false)
                : null,
          },
          {
            id: 'period',
            label: t('财务分析年度', 'Financial year reviewed'),
            value: `${run.input.year} · ${t('合并口径', 'Consolidated')}`,
          },
        ]
      : []),
  ];
  const sources = sourceGroups(context?.sources || []);
  const sourceLink = sourceHref || companyPath(run.id, 'sources', 'source-comparison');
  const excerpts = context?.announcements.filter((item) => item.excerpt).length || 0;
  const newsCount = context?.news.length || 0;
  const newsRead =
    context?.publicSignals?.news.bodyRead ??
    context?.news.filter((item) => item.contentScope === 'media-excerpt' && item.excerpt).length ??
    0;
  const discussionCount = context?.discussions?.length || 0;
  const discussionRead =
    context?.publicSignals?.discussions.bodyRead ??
    context?.discussions?.filter((item) => item.textScope === 'post-excerpt' && item.excerpt)
      .length ??
    0;
  const market = context?.market;
  const publicFetchedAt = context?.publicSignals?.fetchedAt;
  const price = decimal(market?.price);
  const quote =
    market &&
    market.securityCode === run.input.securityCode &&
    (market.status === 'available' || market.status === 'partial') &&
    price &&
    Number(price) > 0 &&
    date(market.fetchedAt, locale) !== '—'
      ? market
      : undefined;
  const quotedAt = quote?.quotedAt && date(quote.quotedAt, locale) !== '—' ? quote.quotedAt : null;
  const quoteLink = quote ? externalHref(quote.sourceUrl) : undefined;
  const changePercent =
    quote?.changePercent !== null && Number.isFinite(quote?.changePercent)
      ? quote?.changePercent
      : undefined;
  const exchange = identity?.exchange;
  const providerName = (provider: string) =>
    locale === 'en'
      ? (
          { 东方财富: 'Eastmoney', 新浪财经: 'Sina Finance', 巨潮资讯: 'CNINFO' } as Record<
            string,
            string
          >
        )[provider] || provider
      : provider;

  return (
    <section
      className="company-brief"
      aria-labelledby={showIdentity ? headingId : undefined}
      aria-label={showIdentity ? undefined : legalName}
      data-testid="company-brief"
    >
      {showIdentity && (
        <header className="company-brief-heading">
          <div className="company-brief-identity">
            <h2 id={headingId}>{legalName}</h2>
            <div className="company-brief-identifiers">
              <span className="company-brief-security">{run.input.securityCode}</span>
              {exchange && exchange !== 'unknown' && (
                <span>
                  {exchange === 'szse'
                    ? t('深交所', 'SZSE')
                    : exchange === 'sse'
                      ? t('上交所', 'SSE')
                      : exchange === 'us'
                        ? t('美股', 'US')
                        : t('北交所', 'BSE')}
                </span>
              )}
              {industry && <span>{industry}</span>}
            </div>
          </div>
        </header>
      )}

      {quote && (
        <div
          className="company-brief-quote"
          aria-label={t('市场行情快照', 'Market quote snapshot')}
        >
          <div className="company-brief-quote-price">
            <span>{t('股价', 'Share price')}</span>
            <strong>{money(price, locale, false)}</strong>
            <small>{t('元', 'CNY')}</small>
            {changePercent !== undefined && (
              <span
                className={
                  'company-brief-quote-change ' +
                  (changePercent > 0 ? 'is-up' : changePercent < 0 ? 'is-down' : '')
                }
              >
                {changePercent > 0 ? '+' : ''}
                {changePercent.toFixed(2)}%
              </span>
            )}
          </div>
          <div className="company-brief-quote-range">
            {decimal(quote.high) && (
              <span>
                {t('日内高', 'Day high')} <b>{money(decimal(quote.high), locale, false)}</b>
              </span>
            )}
            {decimal(quote.low) && (
              <span>
                {t('日内低', 'Day low')} <b>{money(decimal(quote.low), locale, false)}</b>
              </span>
            )}
            {decimal(quote.marketCap) && (
              <span>
                {t('总市值', 'Market cap')}{' '}
                <b>
                  {money(decimal(quote.marketCap), locale)} {t('元', 'CNY')}
                </b>
              </span>
            )}
          </div>
          <div className="company-brief-quote-time">
            <span>
              {t(quotedAt ? '行情时点' : '行情抓取', quotedAt ? 'Quote time' : 'Retrieved')} ·{' '}
              {date(quotedAt || quote.fetchedAt, locale)}
            </span>
            {quoteLink && (
              <a
                href={quoteLink}
                target="_blank"
                rel="noreferrer"
                aria-label={t('查看行情来源', 'Open quote source')}
              >
                <ArrowUpRight size={12} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      )}

      <details className="company-brief-profile" id="company-profile-details">
        <summary>
          <ChevronDown size={13} />
          {t('企业资料', 'Company profile')}
          {business && <span>{business}</span>}
        </summary>
        <dl className="company-brief-facts">
          {facts.map((fact) => (
            <div
              className={'company-brief-fact' + (fact.mono ? ' company-brief-fact-code' : '')}
              key={fact.id}
            >
              <dt>{fact.label}</dt>
              <dd
                className={
                  (fact.mono ? 'company-brief-mono ' : '') +
                  (!fact.value ? 'company-brief-unavailable' : '')
                }
              >
                {fact.value || t('未取得', 'Not retrieved')}
              </dd>
            </div>
          ))}
        </dl>

        {business && (
          <div className="company-brief-business">
            <span>{t('主营业务', 'Principal business')}</span>
            <p title={business}>{business}</p>
          </div>
        )}
        <h3 className="company-brief-coverage-heading">
          {t('公开资料覆盖', 'Public source coverage')}
        </h3>
        <div
          className="company-brief-source-chips"
          aria-label={t('实际资料覆盖', 'Actual source coverage')}
        >
          {sources.map((source) => (
            <span
              className={
                'company-brief-source' +
                (source.unavailable || source.partial ? ' company-brief-source-partial' : '') +
                (!source.complete && !source.partial ? ' company-brief-source-empty' : '')
              }
              key={source.provider}
              title={t(
                `${source.complete} 项完整、${source.partial} 项部分取得、${source.unavailable} 项未取得`,
                `${source.complete} complete, ${source.partial} partial, ${source.unavailable} unavailable`
              )}
            >
              <i aria-hidden="true" />
              {providerName(source.provider)}
              <span>
                {source.complete + source.partial}/{source.total}
              </span>
            </span>
          ))}
          {newsCount > 0 && (
            <span className="company-brief-source-count">
              {t(`新闻 ${newsCount}`, `News ${newsCount}`)}
              {newsRead > 0 && (
                <span> · {t(`正文节选 ${newsRead}`, `Body excerpts ${newsRead}`)}</span>
              )}
            </span>
          )}
          {discussionCount > 0 && (
            <span className="company-brief-source-count">
              {t(`讨论 ${discussionCount}`, `Discussions ${discussionCount}`)}
              {discussionRead > 0 && (
                <span> · {t(`摘录 ${discussionRead}`, `Excerpts ${discussionRead}`)}</span>
              )}
            </span>
          )}
          {excerpts > 0 && (
            <span className="company-brief-source-count">
              <FileText size={12} aria-hidden="true" />
              {t(`公告原文节选 ${excerpts}`, `Disclosure excerpts ${excerpts}`)}
            </span>
          )}
          {sources.length === 0 && (
            <span className="company-brief-source-count">
              {t('资料来源待取得', 'Sources not yet available')}
            </span>
          )}
        </div>
        {publicFetchedAt && publicFetchedAt !== context?.fetchedAt && (
          <span className="company-brief-timestamp">
            {t('公共线索更新 ', 'Public signals updated ') + date(publicFetchedAt, locale)}
          </span>
        )}
      </details>

      <footer className="company-brief-footer">
        <div className="company-brief-footer-bottom">
          <span className="company-brief-timestamp">
            <Clock3 size={12} aria-hidden="true" />
            <span>
              {context
                ? t('财务资料抓取 ', 'Financial data retrieved ') + date(context.fetchedAt, locale)
                : `${run.input.year} · ${t('所选财务年度', 'Selected financial year')}`}
            </span>
            {run.contextStatus === 'loading' && context && (
              <span> · {t('更新中', 'Updating')}</span>
            )}
          </span>
          <div className="company-brief-actions">
            <a href={sourceLink}>
              {t('查看来源', 'View sources')} <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          </div>
        </div>
      </footer>
    </section>
  );
}
