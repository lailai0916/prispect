import { useId } from 'react';
import { ArrowUpRight, ChevronRight, Clock3, FileText, LoaderCircle } from 'lucide-react';
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
  reportHref = '#company-full-report',
  onOpenReport,
}: {
  run: CompanyResearchRun;
  sourceHref?: string;
  reportHref?: string;
  onOpenReport?: () => void;
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
  const assessment =
    context &&
    run.assessment?.year === run.input.year &&
    run.assessment.basis === 'consolidated' &&
    run.assessment.snapshotFetchedAt === context.fetchedAt &&
    run.contextStatus !== 'loading' &&
    run.assessmentStatus !== 'loading'
      ? run.assessment
      : undefined;
  const loading = run.contextStatus === 'loading' || run.assessmentStatus === 'loading';
  const constraints = assessment?.ratingConstraints?.map((item) => t(...item)).join(' ');
  const ruleSummary = assessment?.dimensions
    .filter((dimension) => dimension.id === 'cash' || dimension.id === 'solvency')
    .map((dimension) => t(...dimension.ruleSummary))
    .join(' ');
  const summary = assessment
    ? assessment.narrative?.summary.text[locale === 'en' ? 'en' : 'zh'] ||
      (assessment.grade === 'NR'
        ? t(
            '关键财务字段未齐或存在冲突，暂不形成综合评级。',
            'Key financial fields are missing or conflicting, so a grade is withheld.'
          ) + (ruleSummary ? ' ' + ruleSummary : '')
        : ruleSummary)
    : loading
      ? t(
          '正在比对财务、同行与公开事项，分析完成后在此显示摘要。',
          'Comparing financials, peers and public events. The summary will appear when analysis completes.'
        )
      : t(
          '本年度分析尚未完成。可先查看已取得的公开资料与来源。',
          'Analysis for this year is not yet complete. Available public information and sources remain accessible.'
        );
  const capital = decimal(profile.capitalWan);
  const employeeCount = decimal(profile.employees);
  const facts = [
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
  const sourceLink = sourceHref || companyPath(run.id, 'sources');
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
    <section className="company-brief" aria-labelledby={headingId} data-testid="company-brief">
      <header className="company-brief-heading">
        <div className="company-brief-identity">
          <span className="company-brief-eyebrow">{t('企业概览', 'Company at a glance')}</span>
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
        {assessment ? (
          <div className="company-brief-assessment">
            <span
              className={
                'company-brief-grade company-brief-grade-' + assessment.grade.toLowerCase()
              }
              title={
                t(
                  '所选年度合并财务的规则筛选，不属于信用评级。',
                  'A rule-based screen of selected-year consolidated financials, not a credit rating.'
                ) + (constraints ? ' ' + constraints : '')
              }
            >
              <span>{`${assessment.year} · ${t('财务筛选', 'Financial screen')}`}</span>
              <strong>
                {assessment.grade === 'NR' ? t('暂不评级', 'Not rated') : assessment.grade}
              </strong>
              {assessment.score !== null && (
                <span className="company-brief-score">{assessment.score.toFixed(2)} / 100</span>
              )}
            </span>
            {constraints && (
              <span className="company-brief-grade-note" title={constraints}>
                {t('核心弱项限制等级上限', 'Grade capped by a weak core dimension')}
              </span>
            )}
          </div>
        ) : loading ? (
          <span className="company-brief-pending" role="status">
            <LoaderCircle size={13} className="spinner" aria-hidden="true" />
            {t('分析更新中', 'Updating analysis')}
          </span>
        ) : null}
      </header>

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
              {fact.value || t('未取得', 'Unavailable')}
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

      <div className="company-brief-summary">
        <span>{t('分析摘要', 'Analysis summary')}</span>
        <p title={summary}>{summary}</p>
      </div>

      <footer className="company-brief-footer">
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
                `${source.complete} 项完整、${source.partial} 项部分取得、${source.unavailable} 项未取得；表示取数状态，不代表企业风险。`,
                `${source.complete} complete, ${source.partial} partial, ${source.unavailable} unavailable; retrieval status does not indicate company risk.`
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
        <div className="company-brief-footer-bottom">
          <span className="company-brief-timestamp">
            <Clock3 size={12} aria-hidden="true" />
            <span>
              {context
                ? t('财务资料抓取 ', 'Financial data retrieved ') + date(context.fetchedAt, locale)
                : `${run.input.year} · ${t('所选财务年度', 'Selected financial year')}`}
            </span>
            {publicFetchedAt && publicFetchedAt !== context?.fetchedAt && (
              <span>
                {t('公共线索更新 ', 'Public signals updated ') + date(publicFetchedAt, locale)}
              </span>
            )}
            {run.contextStatus === 'loading' && context && (
              <span> · {t('更新中', 'Updating')}</span>
            )}
          </span>
          <div className="company-brief-actions">
            <a href={sourceLink}>
              {t('查看来源', 'View sources')} <ArrowUpRight size={12} aria-hidden="true" />
            </a>
            {onOpenReport ? (
              <button type="button" onClick={onOpenReport}>
                {t('完整报告', 'Full report')} <ChevronRight size={13} aria-hidden="true" />
              </button>
            ) : (
              <a href={reportHref}>
                {t('完整报告', 'Full report')} <ChevronRight size={13} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </footer>
    </section>
  );
}
