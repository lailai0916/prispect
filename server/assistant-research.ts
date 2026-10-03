import { load } from 'cheerio';
import type { AssistantAnswer } from '../shared/assistant.js';
import type { CompanyResearchRun } from '../shared/contracts.js';
import type {
  CompanyContextSnapshot,
  CompanyDiscussion,
  CompanyNews,
  CompanySourceReceipt,
} from '../shared/company-workspace.js';
import {
  PublicCompanyReader,
  arrayValue,
  classifyDisclosure,
  objectValue,
  textValue,
} from './company-context-sources.js';
import {
  PublicBodyFailure,
  publicNewsCatalogId,
  readEmbeddedPublicJson,
  readKnownPublicNews,
  readKnownPublicPost,
} from './company-public-signals.js';
import { assertCompanyResearchSupported, officialPdfUrl, shanghaiDate } from './company-sources.js';
import { ApiFault } from './validation.js';

type Research = NonNullable<AssistantAnswer['research']>;
type Options = { signal?: AbortSignal; fetch?: typeof fetch; bypassCache?: boolean };
const limits = { requests: 4, milliseconds: 20_000 };
const publicTopics = /回款|应收|存货|减值|订单|产能|诉讼|监管|处罚|分红|回购|业绩|融资|债务/g;
const sourceQuestion =
  /新闻|公告|公开讨论|股吧|帖子|舆情|资料|来源|news|announc|disclos|discussion|posts?|sources?|information/i;
const retrievalQuestion =
  /搜索|检索|查一下|查找|查阅|找一下|读一下|阅读|看看|最新|近期|search|look up|find|fetch|read|latest|recent/i;
const suppliedUrl = /https?:\/\/|www\.|(?:localhost|127\.0\.0\.1)(?:[:/]|$)/i;

function abortableFetch(source: typeof fetch): typeof fetch {
  return async (input, init) => {
    const signal = init?.signal;
    if (!signal) return source(input, init);
    signal.throwIfAborted();
    return new Promise<Response>((resolve, reject) => {
      const abort = () =>
        reject(signal.reason || new DOMException('Public retrieval aborted', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      Promise.resolve()
        .then(() => source(input, init))
        .then(
          (response) => {
            signal.removeEventListener('abort', abort);
            if (signal.aborted) {
              void response.body?.cancel().catch(() => undefined);
              abort();
            } else resolve(response);
          },
          (error) => {
            signal.removeEventListener('abort', abort);
            reject(error);
          }
        );
    });
  };
}

/** Only explicit public-source requests need the bounded retrieval branch. */
export function wantsAssistantResearch(question: string): boolean {
  return (
    !suppliedUrl.test(question) && sourceQuestion.test(question) && retrievalQuestion.test(question)
  );
}

function assertScope(run: CompanyResearchRun) {
  assertCompanyResearchSupported(run.input.securityCode, run.identity?.exchange);
  const context = run.context;
  const supportedCode =
    run.identity?.exchange === 'sse'
      ? /^(?:60|68)\d{4}$/.test(run.input.securityCode)
      : run.identity?.exchange === 'szse' && /^(?:00|30)\d{4}$/.test(run.input.securityCode);
  if (
    !run.identity ||
    !context ||
    run.informationGap ||
    !run.input.orgId ||
    !supportedCode ||
    !['sse', 'szse'].includes(run.identity.exchange) ||
    run.identity.securityCode !== run.input.securityCode ||
    run.identity.orgId !== run.input.orgId ||
    context.securityCode !== run.input.securityCode ||
    context.orgId !== run.input.orgId ||
    !context.financials.some((row) => row.annual && row.period === `${run.input.year}-12-31`)
  )
    throw new ApiFault(422, 'ASSISTANT_RESEARCH_SCOPE', '公司公开资料的主体或所选年度尚未对齐');
}

// Pick public fields explicitly: never clone an account's original previews, notes or questions.
function publicRun(run: CompanyResearchRun): CompanyResearchRun {
  const snapshot = run.context!;
  const context: CompanyContextSnapshot = {
    version: snapshot.version,
    securityCode: snapshot.securityCode,
    orgId: snapshot.orgId,
    companyName: snapshot.companyName,
    fetchedAt: snapshot.fetchedAt,
    status: snapshot.status,
    financials: structuredClone(snapshot.financials),
    sources: structuredClone(snapshot.sources),
    comparisons: structuredClone(snapshot.comparisons),
    profile: structuredClone(snapshot.profile),
    shareholders: structuredClone(snapshot.shareholders),
    announcements: structuredClone(snapshot.announcements),
    news: structuredClone(snapshot.news),
    discussions: structuredClone(snapshot.discussions || []),
    verificationLinks: structuredClone(snapshot.verificationLinks),
    warnings: [...snapshot.warnings],
    ...(snapshot.publicSignals ? { publicSignals: structuredClone(snapshot.publicSignals) } : {}),
    ...(snapshot.market ? { market: structuredClone(snapshot.market) } : {}),
  };
  return {
    id: run.id,
    input: {
      securityCode: run.input.securityCode,
      orgId: run.input.orgId,
      year: run.input.year,
      purpose: run.input.purpose,
      useModel: run.input.useModel,
    },
    identity: structuredClone(run.identity),
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    trace: [],
    announcements: [],
    model: { requested: run.model.requested, status: run.model.status },
    context,
    ...(run.industry ? { industry: structuredClone(run.industry) } : {}),
    ...(run.assessment ? { assessment: structuredClone(run.assessment) } : {}),
  };
}

const plain = (value: unknown, maximum: number) => {
  const $ = load(textValue(value));
  $('script,style,iframe,form').remove();
  return $.text().replace(/\s+/g, ' ').trim().slice(0, maximum);
};
function date(value: unknown): string | null {
  const candidate = textValue(value).slice(0, 10);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(candidate)) return null;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === candidate &&
    candidate <= shanghaiDate(new Date())
    ? candidate
    : null;
}
function mediaUrl(value: unknown): string | null {
  try {
    const url = new URL(textValue(value));
    if (url.username || url.password || url.port || !['http:', 'https:'].includes(url.protocol))
      return null;
    if (
      !(
        (url.hostname === 'finance.eastmoney.com' && /^\/a\/\d{14,24}\.html$/.test(url.pathname)) ||
        (url.hostname === 'finance.sina.com.cn' &&
          /^\/(?:stock|roll)\/[a-z0-9/_-]+\/doc-[a-z0-9]+\.shtml$/i.test(url.pathname))
      )
    )
      return null;
    url.protocol = 'https:';
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
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
    note: '固定公开来源本次未完成；未取得不表示没有相关资料。',
    responseHashes: [],
  };
}

export async function researchAssistantCompany(
  run: CompanyResearchRun,
  question: string,
  options: Options = {}
): Promise<{ run: CompanyResearchRun; research: Research; warning?: string }> {
  if (!wantsAssistantResearch(question))
    return { run, research: { status: 'completed', toolCalls: 0, sources: [] } };
  assertScope(run);
  const working = publicRun(run),
    context = working.context!,
    signal = AbortSignal.any([
      AbortSignal.timeout(limits.milliseconds),
      ...(options.signal ? [options.signal] : []),
    ]),
    reader = new PublicCompanyReader(
      {
        fetch: abortableFetch(options.fetch || fetch),
        signal,
        // This branch is entered only for an explicit request to look up public sources.
        bypassCache: options.bypassCache ?? true,
      },
      limits.requests
    );
  const aliases = [
    working.identity!.shortName,
    working.identity!.companyName || '',
    context.companyName,
  ]
    .map((value) => value.trim())
    .filter((value) => value.length >= 2);
  const matches = (value: string) =>
    aliases.some((alias) => value.includes(alias)) ||
    new RegExp(`(?:^|[^0-9])${run.input.securityCode}(?:[^0-9]|$)`).test(value);
  const citations = new Map<string, { label: string; url: string }>();
  const warnings: string[] = [];
  const freshNews: CompanyNews[] = [],
    freshPosts: CompanyDiscussion[] = [];
  let failed = false;
  const allowed = () => reader.requests < limits.requests && !signal.aborted;
  const cite = (label: string, url: string) => citations.set(url, { label, url });
  const attempt = async (source: CompanySourceReceipt, operation: () => Promise<void>) => {
    if (!allowed()) return;
    context.sources.push(source);
    try {
      await operation();
      source.status = source.count ? 'available' : 'empty';
    } catch {
      failed = true;
      warnings.push(`${source.provider}的${source.dimension}本次未完成。`);
    }
  };
  const news = /新闻|舆情|news/i.test(question),
    posts = /公开讨论|股吧|帖子|discussion|posts?/i.test(question),
    disclosures = /公告|announc|disclos/i.test(question),
    general = !news && !posts && !disclosures,
    topic = [...new Set(question.match(publicTopics) || [])].slice(0, 3).join(' ');

  if (news || general) {
    const url = new URL('https://search-api-web.eastmoney.com/search/jsonp');
    url.search = new URLSearchParams({
      cb: '',
      param: JSON.stringify({
        uid: '',
        keyword: `${working.identity!.shortName.trim().slice(0, 80)}${topic ? ` ${topic}` : ''}`,
        type: ['cmsArticleWebOld'],
        client: 'web',
        clientType: 'web',
        clientVersion: 'curr',
        param: {
          cmsArticleWebOld: {
            searchScope: 'default',
            sort: 'time',
            pageIndex: 1,
            pageSize: 30,
            preTag: '',
            postTag: '',
          },
        },
      }),
    }).toString();
    const source = receipt('assistant-news', '东方财富', '公司新闻目录', url.href);
    await attempt(source, async () => {
      const response = await reader.json(url.href);
      source.responseHashes.push(response.sha256);
      source.fetchedAt = response.fetchedAt;
      const raw = objectValue(response.value.result).cmsArticleWebOld;
      if (
        !Array.isArray(raw) ||
        (response.value.code !== undefined && Number(response.value.code) !== 0)
      )
        throw Error('ASSISTANT_NEWS_FORMAT');
      for (const row of arrayValue(raw).slice(0, 30)) {
        const title = plain(row.title, 500),
          digest = plain(row.content, 1600),
          url = mediaUrl(row.url),
          published = date(row.date),
          explicit = textValue(row.securityCode || row.stockCode || row.SECURITY_CODE).split(
            '.'
          )[0];
        if (
          !title ||
          !url ||
          !published ||
          (explicit && explicit !== run.input.securityCode) ||
          !matches(`${title} ${digest}`)
        )
          continue;
        const item: CompanyNews = {
          id: publicNewsCatalogId(url),
          title,
          digest,
          date: published,
          url,
          media: plain(row.mediaName, 200) || '来源未提供媒体',
          provider: '东方财富',
          contentScope: digest ? 'digest' : 'headline',
        };
        freshNews.push(item);
        cite(`${published} · ${item.media} · ${title}（${digest ? '摘要' : '标题'}）`, url);
      }
      source.count = freshNews.length;
      source.latestDate =
        freshNews
          .map((row) => row.date)
          .sort()
          .at(-1) || null;
      source.note =
        '实际读取固定公司新闻目录第一页，最多30条；标题与摘要是媒体线索，不代表全网或独立核实。';
      context.news = [...freshNews, ...context.news]
        .filter((row, index, rows) => rows.findIndex((other) => other.url === row.url) === index)
        .slice(0, 180);
    });
  }
  if (disclosures || general) {
    const url = 'https://www.cninfo.com.cn/new/hisAnnouncement/query';
    const source = receipt('assistant-disclosures', '巨潮资讯', '公司公告目录', url);
    await attempt(source, async () => {
      const response = await reader.json(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          pageNum: '1',
          pageSize: '30',
          column: working.identity!.exchange === 'sse' ? 'sse' : 'szse',
          tabName: 'fulltext',
          stock: `${run.input.securityCode},${run.input.orgId}`,
          searchkey: '',
          sortName: 'time',
          sortType: 'desc',
          isHLtitle: 'false',
        }).toString(),
      });
      source.responseHashes.push(response.sha256);
      if (!Array.isArray(response.value.announcements)) throw Error('ASSISTANT_DISCLOSURE_FORMAT');
      source.fetchedAt = response.fetchedAt;
      const rows = [];
      for (const row of arrayValue(response.value.announcements).slice(0, 30)) {
        if (
          textValue(row.secCode) !== run.input.securityCode ||
          textValue(row.orgId) !== run.input.orgId
        )
          continue;
        const id = textValue(row.announcementId),
          title = plain(row.announcementTitle, 500),
          timestamp = Number(row.announcementTime);
        if (!/^[\w-]{1,100}$/.test(id) || !title || !Number.isFinite(timestamp)) continue;
        const published = date(shanghaiDate(new Date(timestamp)));
        if (!published) continue;
        let link: string;
        try {
          link = officialPdfUrl(textValue(row.adjunctUrl));
        } catch {
          continue;
        }
        rows.push({
          id: `cninfo-${id}`,
          title,
          date: published,
          url: link,
          sources: [{ provider: '巨潮资讯', url: link }],
          ...classifyDisclosure(title),
        });
        cite(`${published} · ${title}（公告标题，原文未读取）`, link);
      }
      source.count = rows.length;
      source.latestDate =
        rows
          .map((row) => row.date)
          .sort()
          .at(-1) || null;
      source.note =
        '实际读取已确认证券代码与机构的公告第一页；仅目录标题，未新增PDF原文读取或确认事件。';
      context.announcements = [...rows, ...context.announcements]
        .filter((row, index, rows) => rows.findIndex((other) => other.id === row.id) === index)
        .slice(0, 1200);
    });
  }
  if (posts || general) {
    const url = `https://guba.eastmoney.com/list,${run.input.securityCode}.html`;
    const source = receipt('assistant-discussions', '东方财富股吧', '公开讨论目录', url);
    await attempt(source, async () => {
      const response = await reader.read(url, {}, 1_500_000);
      source.responseHashes.push(response.sha256);
      source.fetchedAt = response.fetchedAt;
      const value = readEmbeddedPublicJson(response.body.toString('utf8'), 'article_list');
      if (
        textValue(value.bar_code) !== run.input.securityCode ||
        Number(value.rc) !== 1 ||
        !Array.isArray(value.re)
      )
        throw Error('ASSISTANT_DISCUSSION_SCOPE');
      for (const row of arrayValue(value.re).slice(0, 80)) {
        const id = textValue(row.post_id),
          title = plain(row.post_title, 500),
          published = date(row.post_publish_time);
        if (
          !/^\d{1,20}$/.test(id) ||
          !title ||
          !published ||
          textValue(row.stockbar_code) !== run.input.securityCode
        )
          continue;
        const item: CompanyDiscussion = {
          id: `guba-${id}`,
          securityCode: run.input.securityCode,
          title,
          date: published,
          url: `https://guba.eastmoney.com/news,${run.input.securityCode},${id}.html`,
          provider: '东方财富股吧',
          textScope: 'title',
        };
        freshPosts.push(item);
        cite(`${published} · ${title}（公开帖子标题，未核实观点）`, item.url);
      }
      source.count = freshPosts.length;
      source.latestDate =
        freshPosts
          .map((row) => row.date)
          .sort()
          .at(-1) || null;
      source.note =
        '实际读取本证券代码的公开讨论第一页；个人观点与转载不能视为独立核实或整体舆论。';
      context.discussions = [...freshPosts, ...(context.discussions || [])]
        .filter((row, index, rows) => rows.findIndex((other) => other.id === row.id) === index)
        .slice(0, 240);
    });
  }
  for (const item of freshNews.slice(0, 3)) {
    if (!allowed()) break;
    try {
      const result = await readKnownPublicNews(working, item.id!, { reader, signal });
      context.news = context.news.map((row) => (row.url === item.url ? result.news : row));
      context.sources.push(result.source);
      cite(`${item.date} · ${result.news.media} · ${item.title}（正文节选）`, item.url);
    } catch (error) {
      failed = true;
      if (error instanceof PublicBodyFailure) context.sources.push(error.source);
      warnings.push('部分新闻正文未取得；保留实际目录与摘要，不表示已读全文。');
    }
  }
  for (const item of freshPosts.slice(0, 3)) {
    if (!allowed()) break;
    try {
      const result = await readKnownPublicPost(working, item.id, { reader, signal });
      context.discussions = context.discussions!.map((row) =>
        row.id === item.id ? result.discussion : row
      );
      context.sources.push(result.source);
      cite(`${item.date} · ${item.title}（帖子正文节选，未核实观点）`, item.url);
    } catch (error) {
      failed = true;
      if (error instanceof PublicBodyFailure) context.sources.push(error.source);
      warnings.push('部分公开帖子正文未取得；目录与个人观点不能证明公司事件。');
    }
  }
  if (signal.aborted) {
    failed = true;
    warnings.push('本次公开资料查阅已中止或达到20秒期限。');
  }
  if (!citations.size)
    warnings.push('本次固定来源没有取得匹配资料；来源失败或空目录均不能证明没有相关信息。');
  const warning = [...new Set(warnings)].join(' ');
  if (warning) context.warnings.push(warning);
  return {
    run: working,
    research: {
      status: citations.size ? (failed ? 'partial' : 'completed') : 'unavailable',
      toolCalls: reader.requests,
      sources: [...citations.values()].slice(0, 12),
    },
    ...(warning ? { warning } : {}),
  };
}
