import { ApiFault } from './validation.js';

/**
 * Public news coverage for the reputation dimension.
 *
 * Real data only: items come from Bing News RSS by company name, each with a
 * clickable original link and publication date. No sentiment is inferred —
 * the card shows coverage count and source links, leaving judgement to the
 * reader. Coverage is cached in memory for 30 minutes.
 */

export interface ReputationItem {
  title: string;
  url: string;
  source: string | null;
  publishedAt: string | null;
}

export interface ReputationResult {
  query: string;
  count: number;
  items: ReputationItem[];
  source: 'google-news-rss';
  fetchedAt: string;
  truncated: boolean;
}

const cache = new Map<string, { at: number; value: ReputationResult }>();

function textOf(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  if (!match) return null;
  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function companyReputation(
  query: string,
  options: { signal?: AbortSignal } = {}
): Promise<ReputationResult> {
  const key = query.trim();
  if (!key || key.length > 80) throw new ApiFault(400, 'REPUTATION_QUERY_INVALID', '需要公司名称');
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 30 * 60_000) return cached.value;
  const chinese = /[\u4e00-\u9fff]/.test(key);
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(key)}&hl=${
    chinese ? 'zh-CN' : 'en-US'
  }&gl=${chinese ? 'CN' : 'US'}&ceid=${chinese ? 'CN:zh-Hans' : 'US:en'}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Prispect company risk screening)' },
      signal: options.signal,
    });
  } catch {
    throw new ApiFault(502, 'REPUTATION_UNAVAILABLE', '公开新闻检索暂不可用，未编造报道');
  }
  if (!response.ok) throw new ApiFault(502, 'REPUTATION_UNAVAILABLE', '公开新闻检索暂不可用');
  const xml = await response.text();
  const items: ReputationItem[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = textOf(match[1], 'title');
    const link = textOf(match[1], 'link');
    if (!title || !link || !/^https?:\/\//.test(link)) continue;
    items.push({
      title: title.slice(0, 300),
      url: link.slice(0, 2048),
      source: textOf(match[1], 'source'),
      publishedAt: textOf(match[1], 'pubDate'),
    });
    if (items.length >= 12) break;
  }
  const result: ReputationResult = {
    query: key,
    count: items.length,
    items,
    source: 'google-news-rss',
    fetchedAt: new Date().toISOString(),
    truncated: items.length >= 12,
  };
  cache.set(key, { at: Date.now(), value: result });
  return result;
}
