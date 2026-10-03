import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import type { CompanyResearchRun } from '../shared/contracts.js';
import type {
  CompanyDiscussion,
  CompanyNews,
  CompanyPublicSignalsCoverage,
  CompanySourceReceipt,
} from '../shared/company-workspace.js';
import {
  PublicCompanyReader,
  arrayValue,
  objectValue,
  textValue,
} from './company-context-sources.js';
import { shanghaiDate } from './company-sources.js';
import { ApiFault } from './validation.js';

type Options = { reader: PublicCompanyReader; signal?: AbortSignal };
export class PublicBodyFailure extends ApiFault {
  constructor(
    readonly source: CompanySourceReceipt,
    kind: 'news' | 'post'
  ) {
    super(
      502,
      'PUBLIC_SIGNALS_BODY',
      kind === 'news' ? '本次没有取得匹配主体的媒体正文' : '本次帖子主体不匹配或正文未完成'
    );
    source.note = '实际正文请求或主体/格式核对未完成；保留已有目录，内容仍未核实。';
  }
}
const limits = {
  requests: 26,
  newsPages: 6,
  discussionPages: 3,
  news: 180,
  discussions: 240,
  newsBodies: 8,
  discussionBodies: 8,
};
const plain = (value: unknown, maximum: number) => {
  const $ = load(typeof value === 'string' ? value : textValue(value));
  $('script,style,iframe,form').remove();
  return $.text().replace(/\s+/g, ' ').trim().slice(0, maximum);
};
const stableId = (prefix: string, value: string) =>
  `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
function publicUrl(value: unknown): string | null {
  try {
    const url = new URL(textValue(value));
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port)
      return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}
function newsBodyUrl(value: unknown): string | null {
  const link = publicUrl(value);
  if (!link) return null;
  const url = new URL(link);
  if (
    (url.hostname === 'finance.eastmoney.com' && /^\/a\/\d{14,24}\.html$/.test(url.pathname)) ||
    (url.hostname === 'finance.sina.com.cn' &&
      /^\/(?:stock|roll)\/[a-z0-9/_-]+\/doc-[a-z0-9]+\.shtml$/i.test(url.pathname))
  ) {
    url.protocol = 'https:';
    url.search = '';
    return url.href;
  }
  return null;
}
function calendarDate(value: unknown): string | null {
  const text = textValue(value);
  const match = text.match(/^(20\d{2})[-年](\d{2})[-月](\d{2})/);
  if (!match) return null;
  const day = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === day &&
    day <= shanghaiDate(new Date())
    ? day
    : null;
}
function publicTime(value: unknown): string | null {
  const text = textValue(value);
  const date = calendarDate(text);
  if (!date) return null;
  const clock = text.match(/^20\d{2}-\d{2}-\d{2}[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!clock) return date;
  if (+clock[1] > 23 || +clock[2] > 59 || +clock[3] > 59) return null;
  return `${date}T${clock[1]}:${clock[2]}:${clock[3]}+08:00`;
}
function assertScope(run: CompanyResearchRun) {
  if (
    !/^\d{6}$/.test(run.input.securityCode) ||
    !run.identity ||
    !run.context ||
    !['sse', 'szse'].includes(run.identity.exchange) ||
    run.informationGap ||
    run.identity.securityCode !== run.input.securityCode ||
    run.identity.orgId !== run.input.orgId ||
    run.context.securityCode !== run.input.securityCode ||
    run.context.orgId !== run.input.orgId
  )
    throw new ApiFault(422, 'PUBLIC_SIGNALS_SCOPE', '公开研究主体尚未确认');
}
function aliases(run: CompanyResearchRun): string[] {
  return [
    ...new Set(
      [run.identity!.shortName, run.identity!.companyName || '', run.context!.companyName]
        .map((value) => value.trim())
        .filter((value) => value.length >= 2)
    ),
  ];
}
function matchesIssuer(run: CompanyResearchRun, text: string) {
  return (
    aliases(run).some((alias) => text.includes(alias)) ||
    new RegExp(`(?:^|[^0-9])${run.input.securityCode}(?:[^0-9]|$)`).test(text)
  );
}
function receipt(
  id: string,
  provider: string,
  dimension: string,
  url: string
): CompanySourceReceipt {
  return {
    id,
    provider,
    dimension,
    url,
    status: 'error',
    fetchedAt: new Date().toISOString(),
    latestDate: null,
    count: 0,
    responseHashes: [],
    note: '公开来源本次未完成，未取得内容保持未知。',
  };
}
function normalizedUrl(value: string) {
  const url = new URL(value);
  url.protocol = 'https:';
  url.hash = '';
  for (const key of [...url.searchParams.keys()])
    if (/^(?:utm_|spm|from|ref)/i.test(key)) url.searchParams.delete(key);
  return url.href;
}
export function publicNewsCatalogId(value: string): string {
  const url = publicUrl(value);
  if (!url) throw new ApiFault(400, 'PUBLIC_NEWS_REFERENCE', '新闻地址不在公开目录范围');
  return stableId('public-news', normalizedUrl(newsBodyUrl(url) || url));
}
function retainedNews(run: CompanyResearchRun, row: CompanyNews): CompanyNews | null {
  const rawUrl = publicUrl(row.url),
    url = rawUrl && (newsBodyUrl(rawUrl) || rawUrl),
    date = calendarDate(row.date);
  const title = plain(row.title, 500),
    digest = plain(row.digest, 1600);
  if (!url || !date || !title || !matchesIssuer(run, `${title} ${digest}`)) return null;
  const value: CompanyNews = {
    id: publicNewsCatalogId(url),
    title,
    date,
    url,
    media: plain(row.media, 200) || '来源未提供媒体',
    provider: plain(row.provider, 100),
    digest,
    contentScope: digest ? 'digest' : 'headline',
  };
  if (
    row.excerpt &&
    /^[a-f0-9]{64}$/.test(row.excerpt.sha256) &&
    newsBodyUrl(row.excerpt.url) === newsBodyUrl(url) &&
    newsBodyUrl(url) &&
    Number.isFinite(Date.parse(row.excerpt.readAt)) &&
    Date.parse(row.excerpt.readAt) <= Date.now() &&
    row.excerpt.text
  ) {
    value.excerpt = {
      text: plain(row.excerpt.text, 4000),
      url: newsBodyUrl(url)!,
      sha256: row.excerpt.sha256,
      readAt: row.excerpt.readAt,
    };
    value.contentScope = 'media-excerpt';
  }
  return value;
}
function uniqueNews(rows: CompanyNews[]) {
  const byUrl = new Map<string, CompanyNews>();
  for (const row of rows) {
    const key = normalizedUrl(row.url),
      old = byUrl.get(key);
    if (
      !old ||
      (!old.excerpt && row.excerpt) ||
      (!old.excerpt && row.digest.length > old.digest.length)
    )
      byUrl.set(key, row);
  }
  const titles = new Set<string>(),
    urls = new Set<string>();
  return [...byUrl.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((row) => {
      const title = row.title.normalize('NFKC').replace(/\s/g, ''),
        url = normalizedUrl(row.url);
      if (titles.has(title) || urls.has(url)) return false;
      titles.add(title);
      urls.add(url);
      return true;
    });
}

// Extract a bounded JSON literal without executing any publisher JavaScript.
export function readEmbeddedPublicJson(body: string, variable: 'article_list' | 'post_article') {
  const pattern = new RegExp(`\\bvar\\s+${variable}\\s*=\\s*`),
    match = pattern.exec(body);
  if (!match) throw new ApiFault(502, 'PUBLIC_SIGNALS_FORMAT', '公开来源格式本次无法读取');
  const start = match.index + match[0].length;
  if (body[start] !== '{')
    throw new ApiFault(502, 'PUBLIC_SIGNALS_FORMAT', '公开来源格式本次无法读取');
  let depth = 0,
    inString = false,
    escaped = false;
  for (let index = start; index < Math.min(body.length, start + 1_500_000); index++) {
    const char = body[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') {
      depth--;
      if (depth === 0) {
        try {
          return objectValue(JSON.parse(body.slice(start, index + 1)));
        } catch {
          break;
        }
      }
    }
  }
  throw new ApiFault(502, 'PUBLIC_SIGNALS_FORMAT', '公开来源格式本次无法读取');
}
function fixedPostUrl(code: string, id: string) {
  if (!/^\d{6}$/.test(code) || !/^\d{1,20}$/.test(id))
    throw new ApiFault(400, 'PUBLIC_POST_REFERENCE', '帖子引用不在已取得目录中');
  return `https://guba.eastmoney.com/news,${code},${id}.html`;
}
function researchTopic(text: string): { key: string; relevance: number } {
  if (/现金流|经营现金|回款|应收|存货|库存|周转/.test(text))
    return { key: 'cash-working-capital', relevance: 12 };
  if (/营收|营业收入|净利润|业绩|年报|年度报告|半年报|财务/.test(text))
    return { key: 'financial-results', relevance: 12 };
  if (/债务|偿债|担保|贷款|融资余额|诉讼|处罚|问询|监管/.test(text))
    return { key: 'debt-governance', relevance: 10 };
  if (/经营|订单|客户|扩产|产能|供应|产品|安全系统|行业/.test(text))
    return { key: 'operations', relevance: 10 };
  if (/回购|股东|减持|增持|分红|解禁/.test(text)) return { key: 'corporate-actions', relevance: 4 };
  if (/股价|涨|跌|涨停|龙虎榜|买入|卖出|主力|筹码|庄/.test(text))
    return { key: 'trading', relevance: 0 };
  return { key: 'other', relevance: 0 };
}
// Sample catalog metadata; do not manufacture a positive/negative opinion distribution.
function chooseBodySamples<T extends { title: string; date: string }>(
  rows: T[],
  maximum: number,
  media: (row: T) => string,
  text: (row: T) => string
): T[] {
  const remaining = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  const selected: T[] = [],
    topics = new Set<string>(),
    mediaSeen = new Set<string>(),
    dates = new Set<string>();
  const add = (index: number) => {
    const [row] = remaining.splice(index, 1);
    selected.push(row);
    topics.add(researchTopic(text(row)).key);
    mediaSeen.add(media(row));
    dates.add(row.date.slice(0, 10));
  };
  if (remaining.length) add(0);
  while (remaining.length && selected.length < maximum) {
    let best = 0,
      bestScore = -Infinity;
    for (const [index, row] of remaining.entries()) {
      const topic = researchTopic(text(row));
      const score =
        topic.relevance +
        (topics.has(topic.key) ? 0 : 20) +
        (mediaSeen.has(media(row)) ? 0 : 8) +
        (dates.has(row.date.slice(0, 10)) ? 0 : 4);
      if (score > bestScore) {
        best = index;
        bestScore = score;
      }
    }
    add(best);
  }
  return selected;
}
function retainedPost(run: CompanyResearchRun, row: CompanyDiscussion): CompanyDiscussion | null {
  const numeric = row.id.replace(/^guba-/, '');
  if (!/^\d{1,20}$/.test(numeric) || row.securityCode !== run.input.securityCode) return null;
  const url = fixedPostUrl(run.input.securityCode, numeric);
  if (row.url !== url) return null;
  const date = publicTime(row.date),
    title = plain(row.title, 500);
  if (!date || !title) return null;
  const value: CompanyDiscussion = {
    id: `guba-${numeric}`,
    title,
    date,
    url,
    securityCode: run.input.securityCode,
    provider: '东方财富股吧',
    textScope: 'title',
    ...(publicTime(row.updatedAt) ? { updatedAt: publicTime(row.updatedAt)! } : {}),
  };
  if (
    row.excerpt &&
    row.excerpt.url === url &&
    /^[a-f0-9]{64}$/.test(row.excerpt.sha256) &&
    Number.isFinite(Date.parse(row.excerpt.readAt)) &&
    Date.parse(row.excerpt.readAt) <= Date.now() &&
    row.excerpt.text
  ) {
    value.excerpt = {
      text: plain(row.excerpt.text, 4000),
      url,
      sha256: row.excerpt.sha256,
      readAt: row.excerpt.readAt,
    };
    value.textScope = 'post-excerpt';
  }
  return value;
}

export async function readKnownPublicNews(
  run: CompanyResearchRun,
  id: string,
  options: Options
): Promise<{ news: CompanyNews; source: CompanySourceReceipt }> {
  assertScope(run);
  const candidate = run
    .context!.news.map((row) => retainedNews(run, row))
    .find((row) => row?.id === id);
  const url = candidate && newsBodyUrl(candidate.url);
  if (!candidate || !url)
    throw new ApiFault(400, 'PUBLIC_NEWS_REFERENCE', '新闻引用不在可读取的已取得目录中');
  const source = receipt(`body-${candidate.id}`, candidate.provider, '媒体正文节选', url);
  try {
    const response = await options.reader.read(url, { signal: options.signal }, 1_500_000);
    source.responseHashes.push(response.sha256);
    source.fetchedAt =
      source.responseHashes.length === 1 || response.fetchedAt < source.fetchedAt
        ? response.fetchedAt
        : source.fetchedAt;
    const $ = load(response.body.toString('utf8'));
    $('script,style,iframe,form').remove();
    const title = $('h1').first().text().trim() || $('title').text().trim();
    const text = (url.includes('eastmoney.com') ? $('#ContentBody') : $('#artibody'))
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || !matchesIssuer(run, `${title} ${text.slice(0, 5000)}`))
      throw new ApiFault(502, 'PUBLIC_NEWS_BODY', '本次没有取得匹配主体的媒体正文');
    const attribution = url.includes('eastmoney.com')
      ? $('.infos')
          .text()
          .replace(/\s+/g, ' ')
          .trim()
          .match(/来源[：:]\s*(.{1,100})/)?.[1]
      : $('.source').first().text().trim();
    const news: CompanyNews = {
      ...candidate,
      media: plain(attribution, 200) || candidate.media,
      contentScope: 'media-excerpt',
      excerpt: {
        text: text.slice(0, 4000),
        url,
        sha256: response.sha256,
        readAt: source.fetchedAt,
      },
    };
    source.status = 'available';
    source.count = 1;
    source.latestDate = candidate.date;
    source.note = `实际读取已取得目录中的媒体页面，保留最多4000字节选；HTML响应哈希可复核，媒体报道不等同官方确认。`;
    return { news, source };
  } catch {
    options.reader.invalidateResponses(source.responseHashes, url);
    throw new PublicBodyFailure(source, 'news');
  }
}

export async function readKnownPublicPost(
  run: CompanyResearchRun,
  id: string,
  options: Options
): Promise<{ discussion: CompanyDiscussion; source: CompanySourceReceipt }> {
  assertScope(run);
  const candidate = (run.context!.discussions || [])
    .map((row) => retainedPost(run, row))
    .find((row) => row?.id === id);
  if (!candidate) throw new ApiFault(400, 'PUBLIC_POST_REFERENCE', '帖子引用不在已取得目录中');
  const url = fixedPostUrl(run.input.securityCode, candidate.id.replace(/^guba-/, ''));
  const source = receipt(`body-${candidate.id}`, '东方财富股吧', '公开帖子正文节选', url);
  try {
    const response = await options.reader.read(url, { signal: options.signal }, 1_500_000);
    source.responseHashes.push(response.sha256);
    source.fetchedAt =
      source.responseHashes.length === 1 || response.fetchedAt < source.fetchedAt
        ? response.fetchedAt
        : source.fetchedAt;
    const data = readEmbeddedPublicJson(response.body.toString('utf8'), 'post_article');
    if (
      textValue(data.post_id) !== candidate.id.replace(/^guba-/, '') ||
      textValue(objectValue(data.post_guba).stockbar_code) !== run.input.securityCode
    )
      throw new ApiFault(502, 'PUBLIC_POST_SUBJECT', '本次帖子正文与已确认目录主体不匹配');
    const title = plain(data.post_title, 500),
      date = publicTime(data.post_publish_time);
    const text = plain(data.post_content, 4000);
    if (!date || !title || !text)
      throw new ApiFault(502, 'PUBLIC_POST_BODY', '本次没有取得可用帖子正文');
    const discussion: CompanyDiscussion = {
      id: candidate.id,
      securityCode: run.input.securityCode,
      title,
      date,
      url,
      provider: '东方财富股吧',
      textScope: 'post-excerpt',
      ...(publicTime(data.post_last_time) ? { updatedAt: publicTime(data.post_last_time)! } : {}),
      excerpt: { text, url, sha256: response.sha256, readAt: source.fetchedAt },
    };
    source.status = 'available';
    source.count = 1;
    source.latestDate = date.slice(0, 10);
    source.note =
      '实际读取已取得帖子ID的公开正文，保留最多4000字；包含用户或转载者陈述，未核实观点，未读取评论、图片或视频。';
    return { discussion, source };
  } catch {
    options.reader.invalidateResponses(source.responseHashes, url);
    throw new PublicBodyFailure(source, 'post');
  }
}

export async function collectCompanyPublicSignals(
  run: CompanyResearchRun,
  options: Options
): Promise<{
  news: CompanyNews[];
  discussions: CompanyDiscussion[];
  sources: CompanySourceReceipt[];
  coverage: CompanyPublicSignalsCoverage;
}> {
  assertScope(run);
  const fetchedAt = new Date().toISOString(),
    startRequests = options.reader.requests;
  const sources: CompanySourceReceipt[] = [];
  const newsRows = run
    .context!.news.map((row) => retainedNews(run, row))
    .filter((row): row is CompanyNews => Boolean(row));
  const posts = new Map(
    (run.context!.discussions || [])
      .map((row) => retainedPost(run, row))
      .filter((row): row is CompanyDiscussion => Boolean(row))
      .map((row) => [row.id, row])
  );
  const empty = () => ({
    raw: 0,
    accepted: 0,
    unique: 0,
    pages: 0,
    hitsTotal: null as number | null,
    bodyRead: 0,
    oldest: null as string | null,
    latest: null as string | null,
    stopReason: 'complete' as CompanyPublicSignalsCoverage['news']['stopReason'],
  });
  const coverage: CompanyPublicSignalsCoverage = { fetchedAt, news: empty(), discussions: empty() };
  const state = (section: 'news' | 'discussions') => {
    if (options.signal?.aborted || options.reader.dependencies.signal?.aborted) {
      coverage[section].stopReason = 'deadline';
      return false;
    }
    if (
      options.reader.requests - startRequests >= limits.requests ||
      options.reader.requests >= options.reader.maximumRequests
    ) {
      coverage[section].stopReason = 'request-budget';
      return false;
    }
    return true;
  };
  const fail = (section: 'news' | 'discussions', source: CompanySourceReceipt) => {
    options.reader.invalidateResponses(source.responseHashes, source.url);
    source.note =
      '本次公开请求或主体/格式校验未完成；已有有效来源保留，不能据此认定没有新闻或讨论。';
    coverage[section].stopReason =
      options.signal?.aborted || options.reader.dependencies.signal?.aborted
        ? 'deadline'
        : 'source-failure';
  };
  for (let page = 1; page <= limits.newsPages; page++) {
    if (!state('news')) break;
    const url = new URL('https://search-api-web.eastmoney.com/search/jsonp');
    url.search = new URLSearchParams({
      cb: '',
      param: JSON.stringify({
        uid: '',
        keyword: run.identity!.shortName.trim().slice(0, 80),
        type: ['cmsArticleWebOld'],
        client: 'web',
        clientType: 'web',
        clientVersion: 'curr',
        param: {
          cmsArticleWebOld: {
            searchScope: 'default',
            sort: 'time',
            pageIndex: page,
            pageSize: 30,
            preTag: '',
            postTag: '',
          },
        },
      }),
    }).toString();
    const source = receipt(`public-em-news-p${page}`, '东方财富', '新闻线索', url.href);
    sources.push(source);
    try {
      const response = await options.reader.json(url.href, { signal: options.signal });
      source.responseHashes.push(response.sha256);
      source.fetchedAt =
        source.responseHashes.length === 1 || response.fetchedAt < source.fetchedAt
          ? response.fetchedAt
          : source.fetchedAt;
      const raw = objectValue(response.value.result).cmsArticleWebOld;
      if (!Array.isArray(raw)) throw Error('PUBLIC_NEWS_FORMAT');
      const rows = arrayValue(raw).slice(0, 30);
      const reported = response.value.hitsTotal;
      const total =
        typeof reported === 'number' || typeof reported === 'string'
          ? reported
          : objectValue(reported).cmsArticleWebOld;
      if (
        Number.isSafeInteger(Number(total)) &&
        Number(total) >= 0 &&
        total !== null &&
        total !== undefined &&
        total !== ''
      )
        coverage.news.hitsTotal = Number(total);
      coverage.news.pages++;
      coverage.news.raw += rows.length;
      for (const row of rows) {
        const explicit = textValue(row.securityCode || row.stockCode || row.SECURITY_CODE).split(
          '.'
        )[0];
        if (explicit && explicit !== run.input.securityCode) continue;
        const item = retainedNews(run, {
          title: plain(row.title, 500),
          date: textValue(row.date),
          url: textValue(row.url),
          media: plain(row.mediaName, 200),
          provider: '东方财富',
          digest: plain(row.content, 1600),
        });
        if (!item) continue;
        newsRows.push(item);
        source.count++;
        coverage.news.accepted++;
      }
      source.latestDate =
        newsRows
          .filter((row) => row.provider === '东方财富')
          .map((row) => row.date)
          .sort()
          .at(-1) || null;
      source.status = source.count ? 'available' : 'empty';
      source.note = `实际取得检索第${page}页${rows.length}条，主体过滤后${source.count}条；正文未读取，标题和摘要不是已核实事件。`;
      if (
        rows.length < 30 ||
        (coverage.news.hitsTotal !== null && page * 30 >= coverage.news.hitsTotal)
      )
        break;
      if (page === limits.newsPages && coverage.news.stopReason === 'complete')
        coverage.news.stopReason = 'page-limit';
    } catch {
      fail('news', source);
    }
  }
  // The issuer-specific Sina archive is an independent catalog, not the original publisher.
  if (state('news')) {
    const url = new URL('https://vip.stock.finance.sina.com.cn/corp/view/vCB_AllNewsStock.php');
    url.search = new URLSearchParams({
      symbol: `${run.identity!.exchange === 'sse' ? 'sh' : 'sz'}${run.input.securityCode}`,
      Page: '1',
    }).toString();
    const source = receipt('public-sina-news-p1', '新浪财经', '新闻线索', url.href);
    sources.push(source);
    try {
      const response = await options.reader.read(url.href, { signal: options.signal });
      source.responseHashes.push(response.sha256);
      source.fetchedAt =
        source.responseHashes.length === 1 || response.fetchedAt < source.fetchedAt
          ? response.fetchedAt
          : source.fetchedAt;
      const utf8 = response.body.toString('utf8'),
        $ = load(utf8.includes('\ufffd') ? new TextDecoder('gb18030').decode(response.body) : utf8);
      let raw = 0;
      $('ul a[href]').each((_index, element) => {
        const title = $(element).text().trim(),
          link = publicUrl($(element).attr('href'));
        if (!link || !/^https?:\/\/(?:finance\.sina\.com\.cn|cj\.sina\.cn)\//.test(link)) return;
        const date = $(element)
          .parent()
          .text()
          .match(/20\d{2}-\d{2}-\d{2}/)?.[0];
        if (!date) return;
        raw++;
        const item = retainedNews(run, {
          title,
          date,
          url: link,
          media: '新浪财经收录',
          provider: '新浪财经',
          digest: '',
        });
        if (item) {
          newsRows.push(item);
          source.count++;
          coverage.news.accepted++;
        }
      });
      if (!$('ul').length) throw Error('PUBLIC_SINA_FORMAT');
      coverage.news.pages++;
      coverage.news.raw += raw;
      source.status = source.count ? 'available' : 'empty';
      source.latestDate =
        newsRows
          .filter((row) => row.provider === '新浪财经')
          .map((row) => row.date)
          .sort()
          .at(-1) || null;
      source.note = `实际取得新浪公司新闻目录第1页，主体过滤后${source.count}条；收录平台不等于原媒体，未读取正文。`;
    } catch {
      fail('news', source);
    }
  }
  for (let page = 1; page <= limits.discussionPages; page++) {
    if (!state('discussions')) break;
    const url = `https://guba.eastmoney.com/list,${run.input.securityCode}${page === 1 ? '' : `_${page}`}.html`;
    const source = receipt(`public-guba-list-p${page}`, '东方财富股吧', '公开讨论目录', url);
    sources.push(source);
    try {
      const response = await options.reader.read(url, { signal: options.signal }, 1_500_000);
      source.responseHashes.push(response.sha256);
      source.fetchedAt =
        source.responseHashes.length === 1 || response.fetchedAt < source.fetchedAt
          ? response.fetchedAt
          : source.fetchedAt;
      const data = readEmbeddedPublicJson(response.body.toString('utf8'), 'article_list');
      if (
        textValue(data.bar_code) !== run.input.securityCode ||
        Number(data.rc) !== 1 ||
        !Array.isArray(data.re)
      )
        throw Error('PUBLIC_GUBA_SCOPE');
      const rows = arrayValue(data.re).slice(0, 80);
      coverage.discussions.pages++;
      coverage.discussions.raw += rows.length;
      if (Number.isSafeInteger(Number(data.count)) && Number(data.count) >= 0)
        coverage.discussions.hitsTotal = Number(data.count);
      for (const row of rows) {
        const id = textValue(row.post_id),
          date = publicTime(row.post_publish_time),
          title = plain(row.post_title, 500);
        if (
          !/^\d{1,20}$/.test(id) ||
          !date ||
          !title ||
          textValue(row.stockbar_code) !== run.input.securityCode
        )
          continue;
        const item: CompanyDiscussion = {
          id: `guba-${id}`,
          title,
          date,
          url: fixedPostUrl(run.input.securityCode, id),
          provider: '东方财富股吧',
          securityCode: run.input.securityCode,
          textScope: 'title',
          ...(publicTime(row.post_last_time) ? { updatedAt: publicTime(row.post_last_time)! } : {}),
        };
        if (!posts.get(item.id)?.excerpt) posts.set(item.id, item);
        source.count++;
        coverage.discussions.accepted++;
      }
      source.status = source.count ? 'available' : 'empty';
      source.latestDate =
        rows
          .map((row) => calendarDate(row.post_publish_time))
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) || null;
      source.note = `实际取得股吧第${page}页${rows.length}条目录，主体过滤后${source.count}条；仅帖子标题，包含个人观点、资讯或公告转载，不代表独立或已核实意见。`;
      if (
        rows.length < 80 ||
        (coverage.discussions.hitsTotal !== null && page * 80 >= coverage.discussions.hitsTotal)
      )
        break;
      if (page === limits.discussionPages && coverage.discussions.stopReason === 'complete')
        coverage.discussions.stopReason = 'page-limit';
    } catch {
      fail('discussions', source);
    }
  }
  const uniqueCatalog = uniqueNews(newsRows);
  let news = uniqueCatalog.slice(0, limits.news);
  if (uniqueCatalog.length > limits.news && coverage.news.stopReason === 'complete')
    coverage.news.stopReason = 'page-limit';
  let discussions = [...posts.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limits.discussions);
  const context = { ...run.context!, news, discussions };
  const publicRun: CompanyResearchRun = {
    id: run.id,
    input: { ...run.input },
    identity: run.identity,
    context,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    announcements: [],
    trace: [],
    model: { requested: false, status: 'not-called' },
  };
  for (const row of chooseBodySamples(
    news.filter(
      (item) => (options.reader.dependencies.bypassCache || !item.excerpt) && newsBodyUrl(item.url)
    ),
    limits.newsBodies,
    (item) => item.media,
    (item) => `${item.title} ${item.digest}`
  )) {
    if (!state('news')) break;
    const source = receipt(`body-${row.id}`, row.provider, '媒体正文节选', newsBodyUrl(row.url)!);
    try {
      const result = await readKnownPublicNews(publicRun, row.id!, options);
      news = news.map((item) => (item.id === row.id ? result.news : item));
      context.news = news;
      sources.push(result.source);
      coverage.news.bodyRead++;
    } catch (error) {
      const failed = error instanceof PublicBodyFailure ? error.source : source;
      sources.push(failed);
      fail('news', failed);
    }
  }
  for (const row of chooseBodySamples(
    discussions.filter((item) => options.reader.dependencies.bypassCache || !item.excerpt),
    limits.discussionBodies,
    (item) => item.provider,
    (item) => item.title
  )) {
    if (!state('discussions')) break;
    const source = receipt(`body-${row.id}`, '东方财富股吧', '公开帖子正文节选', row.url);
    try {
      const result = await readKnownPublicPost(publicRun, row.id, options);
      discussions = discussions.map((item) => (item.id === row.id ? result.discussion : item));
      context.discussions = discussions;
      sources.push(result.source);
      coverage.discussions.bodyRead++;
    } catch (error) {
      const failed = error instanceof PublicBodyFailure ? error.source : source;
      sources.push(failed);
      fail('discussions', failed);
    }
  }
  for (const [section, rows] of [
    ['news', news],
    ['discussions', discussions],
  ] as const) {
    coverage[section].unique = rows.length;
    coverage[section].bodyRead = rows.filter((row) => row.excerpt).length;
    const dates = rows.map((row) => row.date.slice(0, 10)).sort();
    coverage[section].oldest = dates.at(0) || null;
    coverage[section].latest = dates.at(-1) || null;
  }
  return { news, discussions, sources, coverage };
}
