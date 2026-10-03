import { createHash } from 'node:crypto';
import type {
  CompanyAnnouncement,
  CompanyIdentity,
  CompanySearchResponse,
} from '../shared/contracts.js';
import { ApiFault } from './validation.js';
import { isSecTicker, secSearchCompanies } from './company-sec.js';
import pdfLimits from './pdf-limits.json' with { type: 'json' };

export interface CompanySourceDependencies {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  now?: () => Date;
  onRetry?: (message: string) => void | Promise<void>;
  budget?: { used: number; maximum: number };
  timeoutMs?: number;
  maxAttempts?: 1 | 2;
  maximumPdfBytes?: number;
}
const SEARCH = 'https://www.cninfo.com.cn/new/information/topSearch/query';
const ANNOUNCEMENTS = 'https://www.cninfo.com.cn/new/hisAnnouncement/query';
export const MAX_COMPANY_PDF_BYTES = pdfLimits.officialBytes;
export const shanghaiDate = (value: Date | string) =>
  new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });

function awaitSource<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  return new Promise<T>((resolve, reject) => {
    const abort = () =>
      reject(signal.reason || new DOMException('Source request aborted', 'AbortError'));
    const finish = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    operation.then(
      (value) => {
        finish();
        resolve(value);
      },
      (error) => {
        finish();
        reject(error);
      }
    );
    if (signal.aborted) {
      finish();
      abort();
    }
  });
}

export async function boundedBody(
  response: Response,
  maximum: number,
  signal?: AbortSignal
): Promise<Buffer> {
  const declared = response.headers.get('content-length');
  if (declared && Number(declared) > maximum) {
    void response.body?.cancel().catch(() => undefined);
    throw new ApiFault(413, 'COMPANY_SOURCE_TOO_LARGE', '官方来源文件超过当前大小限制');
  }
  if (!response.body) throw new ApiFault(502, 'COMPANY_SOURCE_EMPTY', '官方来源响应为空');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await awaitSource(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        void reader.cancel().catch(() => undefined);
        throw new ApiFault(413, 'COMPANY_SOURCE_TOO_LARGE', '官方来源文件超过当前大小限制');
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

async function request(
  url: string,
  init: RequestInit,
  maximum: number,
  dependencies: CompanySourceDependencies
): Promise<Buffer> {
  const budget = dependencies.budget || { used: 0, maximum: 2 };
  const attempts = dependencies.maxAttempts ?? 2;
  const timeoutMs = dependencies.timeoutMs ?? (maximum > 2_000_000 ? 30000 : 15000);
  if (
    ![1, 2].includes(attempts) ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30000
  )
    throw new RangeError('Invalid source request limits');
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (dependencies.signal?.aborted)
      throw new ApiFault(504, 'COMPANY_CANCELLED', '公开资料检索已中止');
    if (budget.used >= budget.maximum)
      throw new ApiFault(429, 'COMPANY_TOOL_BUDGET', '已达到本次公开检索请求预算');
    budget.used++;
    try {
      const signal = AbortSignal.any([
        AbortSignal.timeout(timeoutMs),
        ...(dependencies.signal ? [dependencies.signal] : []),
      ]);
      signal.throwIfAborted();
      const response = await (dependencies.fetch || fetch)(url, {
        ...init,
        redirect: 'error',
        signal,
      });
      if (!response.ok) {
        if ([403, 429].includes(response.status))
          throw new ApiFault(
            502,
            'COMPANY_SOURCE_RESTRICTED',
            `官方来源限制访问（HTTP ${response.status}），已停止而非绕过限制`
          );
        if ([408, 500, 502, 503, 504].includes(response.status))
          throw new Error(`HTTP ${response.status}`);
        throw new ApiFault(
          502,
          'COMPANY_SOURCE_HTTP',
          `官方来源请求未完成（HTTP ${response.status}）`
        );
      }
      return await boundedBody(response, maximum, signal);
    } catch (error) {
      if (error instanceof ApiFault) throw error;
      if (dependencies.signal?.aborted)
        throw new ApiFault(504, 'COMPANY_CANCELLED', '公开资料检索已中止');
      if (attempt === attempts - 1)
        throw new ApiFault(
          502,
          'COMPANY_SOURCE_UNAVAILABLE',
          attempts === 2
            ? '官方披露来源暂不可达，已完成一次重试；未替换为其他主体或年份'
            : '官方披露来源未在本次读取预算内完成；未替换为其他主体或年份'
        );
      await dependencies.onRetry?.('官方来源首次请求未完成，正在进行本工具的唯一一次重试。');
    }
  }
  throw new ApiFault(502, 'COMPANY_SOURCE_UNAVAILABLE', '官方披露来源暂不可达');
}

async function formJson(
  url: string,
  form: Record<string, string>,
  dependencies: CompanySourceDependencies
): Promise<unknown> {
  const body = await request(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://www.cninfo.com.cn/',
      },
      body: new URLSearchParams(form).toString(),
    },
    2_000_000,
    dependencies
  );
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new ApiFault(
      502,
      'COMPANY_SOURCE_FORMAT',
      '官方披露来源返回了无法识别的响应，未编造检索结果'
    );
  }
}

function exchangeFor(code: string): CompanyIdentity['exchange'] {
  if (/^(?:60|68)/.test(code)) return 'sse';
  if (/^(?:00|30)/.test(code)) return 'szse';
  if (/^(?:43|83|87|92)/.test(code)) return 'bse';
  return 'unknown';
}

export async function searchCompanies(
  query: string,
  dependencies: CompanySourceDependencies = {}
): Promise<CompanySearchResponse> {
  query = query.trim();
  if (!query || query.length > 80 || /[\x00-\x1f]/.test(query))
    throw new ApiFault(400, 'COMPANY_QUERY_INVALID', '请输入1至80字的公司名称或六位A股代码');
  if (isSecTicker(query)) return secSearchCompanies(query);
  const raw = await formJson(SEARCH, { keyWord: query, maxNum: '20' }, dependencies);
  if (!Array.isArray(raw))
    throw new ApiFault(502, 'COMPANY_SOURCE_FORMAT', '官方主体检索响应格式改变');
  const candidates: CompanyIdentity[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (!value || typeof value !== 'object') continue;
    const row = value as Record<string, unknown>;
    if (
      row.category !== 'A股' ||
      row.delisted === 'true' ||
      typeof row.code !== 'string' ||
      !/^\d{6}$/.test(row.code) ||
      typeof row.orgId !== 'string' ||
      !/^[A-Za-z0-9]{1,40}$/.test(row.orgId) ||
      typeof row.zwjc !== 'string' ||
      !row.zwjc.trim()
    )
      continue;
    const key = `${row.code}:${row.orgId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      securityCode: row.code,
      orgId: row.orgId,
      shortName: row.zwjc.slice(0, 80),
      companyName: null,
      exchange: exchangeFor(row.code),
      sourceUrl: `https://www.cninfo.com.cn/new/snapshot/companyDetailCn?code=${row.code}`,
    });
  }
  // 巨潮无匹配（如"英伟达"等美股中文名）时，回落到 SEC EDGAR 的别名与名称检索。
  if (!candidates.length) {
    const secResult = await secSearchCompanies(query);
    if (secResult.candidates.length) return secResult;
    // 两个上市源均无结果：若关键词像中文公司名，标记"疑似未上市主体"，
    // 供前端提示未上市数据源接口已预留（见 contracts.ts CompanySearchResponse）。
    return {
      query,
      candidates: [],
      limitedToListed: true,
      source: 'cninfo',
      truncated: false,
      unlisted: /[\u4e00-\u9fff]/.test(query),
    };
  }
  return {
    query,
    candidates,
    limitedToListed: true,
    source: 'cninfo',
    truncated: raw.length >= 20,
  };
}

export function officialPdfUrl(value: string): string {
  if (value.length > 512 || /[\x00-\x20\\]/.test(value))
    throw new ApiFault(502, 'COMPANY_SOURCE_URL', '公告原件路径不在支持范围');
  const url = new URL(value, 'https://static.cninfo.com.cn/');
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'static.cninfo.com.cn' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/finalpage\/\d{4}-\d{2}-\d{2}\/\d+\.pdf$/i.test(url.pathname)
  )
    throw new ApiFault(
      502,
      'COMPANY_SOURCE_URL',
      '仅获取官方披露平台的HTTPS财报原件；拒绝任意链接与跳转'
    );
  return url.href;
}

export async function listCompanyAnnouncements(
  identity: CompanyIdentity,
  year: number,
  category: 'annual' | 'recent',
  dependencies: CompanySourceDependencies = {}
): Promise<{ announcements: CompanyAnnouncement[]; truncated: boolean }> {
  const now = (dependencies.now || (() => new Date()))();
  const end = shanghaiDate(now);
  const start =
    category === 'annual'
      ? `${year + 1}-01-01`
      : shanghaiDate(new Date(now.getTime() - 90 * 86400000));
  const announcements: CompanyAnnouncement[] = [];
  const seen = new Set<string>();
  let more = false;
  for (let page = 1; page <= (category === 'annual' ? 2 : 1); page++) {
    const raw = await formJson(
      ANNOUNCEMENTS,
      {
        pageNum: String(page),
        pageSize: '30',
        column: identity.exchange === 'bse' ? 'bse' : 'szse',
        tabName: 'fulltext',
        plate: '',
        stock: `${identity.securityCode},${identity.orgId}`,
        searchkey: '',
        seDate: `${start}~${end}`,
        category: category === 'annual' ? 'category_ndbg_szsh' : '',
        sortName: 'time',
        sortType: 'desc',
        isHLtitle: 'false',
      },
      dependencies
    );
    if (
      raw &&
      typeof raw === 'object' &&
      (raw as Record<string, unknown>).totalAnnouncement === 0 &&
      (raw as Record<string, unknown>).announcements === null
    )
      return { announcements: [], truncated: false };
    if (
      !raw ||
      typeof raw !== 'object' ||
      !Array.isArray((raw as Record<string, unknown>).announcements)
    )
      throw new ApiFault(502, 'COMPANY_SOURCE_FORMAT', '官方公告检索响应格式改变');
    const result = raw as { announcements: Record<string, unknown>[]; hasMore?: boolean };
    for (const row of result.announcements) {
      if (
        row.secCode !== identity.securityCode ||
        row.orgId !== identity.orgId ||
        typeof row.announcementId !== 'string' ||
        !/^\d{1,40}$/.test(row.announcementId) ||
        typeof row.announcementTitle !== 'string' ||
        typeof row.adjunctUrl !== 'string' ||
        seen.has(row.announcementId)
      )
        continue;
      const title = row.announcementTitle.replace(/<[^>]*>/g, '').slice(0, 240);
      const reportYear = title.match(/(20\d{2})\s*(?:年\s*)?年度报告/)?.[1];
      if (
        category === 'annual' &&
        (!reportYear ||
          Number(reportYear) !== year ||
          /摘要|英文|English|summary|annual\s+report/i.test(title))
      )
        continue;
      const timestamp =
        typeof row.announcementTime === 'number'
          ? row.announcementTime
          : Number(row.announcementTime);
      if (!Number.isFinite(timestamp) || timestamp <= 0) continue;
      const publishedAt = new Date(timestamp).toISOString();
      const publishedDate = shanghaiDate(publishedAt);
      if (publishedDate < start || publishedDate > end) continue;
      let sourceUrl: string;
      try {
        sourceUrl = officialPdfUrl(row.adjunctUrl);
      } catch {
        continue;
      }
      seen.add(row.announcementId);
      announcements.push({
        id: row.announcementId,
        title,
        publishedAt,
        sourceUrl,
        category,
        ...(reportYear ? { reportYear: Number(reportYear) } : {}),
      });
    }
    more = result.hasMore === true;
    if (!more || (category === 'annual' && announcements.length)) break;
  }
  return {
    announcements: announcements.sort(
      (a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.id.localeCompare(a.id)
    ),
    truncated: more,
  };
}

export async function downloadCompanyPdf(
  sourceUrl: string,
  dependencies: CompanySourceDependencies = {}
): Promise<{ buffer: Buffer; sha256: string; bytes: number }> {
  const safe = officialPdfUrl(sourceUrl);
  const maximum = dependencies.maximumPdfBytes ?? MAX_COMPANY_PDF_BYTES;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > MAX_COMPANY_PDF_BYTES)
    throw new RangeError('Invalid official PDF size limit');
  const buffer = await request(
    safe,
    { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.cninfo.com.cn/' } },
    maximum,
    dependencies
  );
  if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-')))
    throw new ApiFault(502, 'COMPANY_SOURCE_NOT_PDF', '官方链接未返回有效PDF，停止提取');
  return {
    buffer,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    bytes: buffer.length,
  };
}
