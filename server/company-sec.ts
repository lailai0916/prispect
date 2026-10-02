import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CompanyAnnouncement,
  CompanyIdentity,
  CompanySearchResponse,
  CompanyRunInput,
  Observation,
} from '../shared/contracts.js';
import { ApiFault } from './validation.js';
import pdfLimits from './pdf-limits.json' with { type: 'json' };

/**
 * SEC EDGAR data source for US-listed companies.
 *
 * Real data only: company tickers come from the official SEC company_tickers.json,
 * annual filings from the CIK submissions feed, and the two cash-bridge totals
 * (NetIncomeLoss / NetCashProvidedByUsedInOperatingActivities) from the XBRL
 * company facts feed. Everything is traceable to a public SEC URL; nothing is
 * invented or inferred. SEC requires a descriptive User-Agent and ~10 req/s
 * rate limiting, which the single-flight queue below honours.
 */

const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const SEC_UA = 'PrispectResearch prispect@example.com (company risk screening)';

let tail: Promise<void> = Promise.resolve();

function secFetch(url: string, timeoutMs = 60_000): Promise<Response> {
  const run = tail.then(() =>
    new Promise<void>((resolve) => setTimeout(resolve, 120)).then(() =>
      fetch(url, { headers: { 'User-Agent': SEC_UA } })
    )
  );
  tail = run.then(
    () => undefined,
    () => undefined
  );
  return Promise.race([
    run.then((response) => {
      if (!response.ok) {
        if (response.status === 404)
          throw new ApiFault(404, 'SEC_NOT_FOUND', 'SEC 未收录该主体的对应披露');
        throw new ApiFault(502, 'SEC_UNAVAILABLE', 'SEC EDGAR 暂不可用，未编造检索结果');
      }
      return response;
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new ApiFault(504, 'SEC_TIMEOUT', 'SEC EDGAR 请求超时')), timeoutMs)
    ),
  ]);
}

async function jsonOf(url: string): Promise<Record<string, unknown>> {
  const response = await secFetch(url);
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ApiFault(502, 'SEC_FORMAT', 'SEC 返回了无法识别的响应，未编造检索结果');
  }
}

interface TickerRow {
  cik: string;
  ticker: string;
  title: string;
}

let tickerCache: { loadedAt: number; rows: Map<string, TickerRow> } | null = null;

async function loadTickers(directory?: string): Promise<Map<string, TickerRow>> {
  const cachePath = directory ? path.join(directory, 'sec-tickers.json') : null;
  const now = Date.now();
  if (tickerCache && now - tickerCache.loadedAt < 24 * 3600_000) return tickerCache.rows;
  let fromDisk: TickerRow[] | undefined;
  if (cachePath) {
    try {
      fromDisk = JSON.parse(await readFile(cachePath, 'utf8')) as TickerRow[];
    } catch {
      fromDisk = undefined;
    }
  }
  if (fromDisk && Array.isArray(fromDisk) && fromDisk.length > 5000) {
    const rows = new Map<string, TickerRow>();
    for (const row of fromDisk) rows.set(row.ticker.toLowerCase(), row);
    tickerCache = { loadedAt: now, rows };
    return rows;
  }
  const body = await jsonOf(SEC_TICKERS_URL);
  const rows: TickerRow[] = [];
  for (const value of Object.values(body)) {
    const row = value as { cik_str?: unknown; ticker?: unknown; title?: unknown };
    if (
      typeof row.cik_str === 'number' &&
      typeof row.ticker === 'string' &&
      typeof row.title === 'string'
    ) {
      const cik = String(row.cik_str);
      if (/^\d{1,10}$/.test(cik)) rows.push({ cik, ticker: row.ticker, title: row.title });
    }
  }
  if (!rows.length) throw new ApiFault(502, 'SEC_FORMAT', 'SEC 主体列表解析失败');
  if (cachePath) {
    await mkdir(path.dirname(cachePath), { recursive: true }).catch(() => undefined);
    await writeFile(cachePath, JSON.stringify(rows)).catch(() => undefined);
  }
  const map = new Map<string, TickerRow>();
  for (const row of rows) map.set(row.ticker.toLowerCase(), row);
  tickerCache = { loadedAt: now, rows: map };
  return map;
}

export function isSecTicker(value: string): boolean {
  return /^[A-Za-z]{1,6}$/.test(value);
}

export async function secSearchCompanies(
  query: string,
  directory?: string
): Promise<CompanySearchResponse> {
  const rows = await loadTickers(directory);
  const key = query.trim().toLowerCase();
  if (!key)
    return { query, candidates: [], limitedToListed: true, source: 'sec', truncated: false };
  const identityOf = (row: TickerRow): CompanyIdentity => ({
    securityCode: row.ticker.toUpperCase(),
    orgId: row.cik,
    shortName: row.title.slice(0, 80),
    companyName: row.title,
    exchange: 'us',
    sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${row.cik}&type=10-K`,
  });
  const exact = rows.get(key);
  const candidates: CompanyIdentity[] = [];
  if (exact) {
    candidates.push(identityOf(exact));
  } else {
    let matched = 0;
    for (const [ticker, row] of rows) {
      if (ticker.startsWith(key) && matched < 20) {
        candidates.push(identityOf(row));
        matched++;
      }
    }
  }
  return {
    query,
    candidates,
    limitedToListed: true,
    source: 'sec',
    truncated: candidates.length >= 20,
  };
}

interface TenKRecord {
  accession: string;
  primaryDocument: string;
  filingDate: string;
  reportDate: string;
}

interface SecFacts {
  netProfit: string | null;
  operatingCashFlow: string | null;
  quoteProfit: string;
  quoteCash: string;
}

const padCik = (cik: string) => cik.padStart(10, '0');

async function latestTenK(cik: string, year: number, name: string): Promise<TenKRecord> {
  const body = await jsonOf(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`);
  const recent = (body.filings as { recent?: { [key: string]: string[] } }).recent;
  const forms = recent?.form || [];
  const accessions = recent?.accessionNumber || [];
  const primary = recent?.primaryDocument || [];
  const filingDates = recent?.filingDate || [];
  const reportDates = recent?.reportDate || [];
  for (let index = 0; index < forms.length; index++) {
    if (forms[index] !== '10-K') continue;
    const reportDate = reportDates[index];
    if (!reportDate || !reportDate.startsWith(`${year}-`)) continue;
    const accession = accessions[index];
    const primaryDocument = primary[index];
    const filingDate = filingDates[index];
    if (!accession || !primaryDocument || !filingDate) continue;
    return { accession, primaryDocument, filingDate, reportDate };
  }
  throw new ApiFault(
    404,
    'SEC_10K_NOT_FOUND',
    `SEC 未找到 ${name} 对应 ${year} 年度的 10-K 年报；请核对年度或主体`
  );
}

function annualValue(
  units: Record<string, { end?: string; val?: number; form?: string; fp?: string; fy?: string }[]>,
  year: number
): { value: string; filedFrame: string } | null {
  let best: { value: string; filedFrame: string } | null = null;
  for (const entries of Object.values(units)) {
    for (const item of entries) {
      if (item.form !== '10-K' || item.fp !== 'FY') continue;
      if (!item.end || !item.end.startsWith(`${year}-`)) continue;
      if (typeof item.val !== 'number') continue;
      best = { value: String(item.val), filedFrame: item.fy ? `FY${item.fy}` : `CY${year}` };
    }
  }
  return best;
}

async function companyFacts(cik: string, year: number): Promise<SecFacts> {
  const body = await jsonOf(`https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`);
  const gaap = (body.facts as { 'us-gaap'?: Record<string, { units?: unknown }> } | undefined)?.[
    'us-gaap'
  ];
  const read = (key: string) => {
    const group = gaap?.[key] as
      | {
          units?: Record<
            string,
            { end?: string; val?: number; form?: string; fp?: string; fy?: string }[]
          >;
        }
      | undefined;
    return group?.units ? annualValue(group.units, year) : null;
  };
  const profit = read('NetIncomeLoss');
  const cash = read('NetCashProvidedByUsedInOperatingActivities');
  return {
    netProfit: profit?.value ?? null,
    operatingCashFlow: cash?.value ?? null,
    quoteProfit: profit
      ? `SEC EDGAR XBRL companyfacts：us-gaap NetIncomeLoss（${profit.filedFrame} 年度，10-K 披露）`
      : 'SEC EDGAR XBRL companyfacts 未披露该年度 NetIncomeLoss',
    quoteCash: cash
      ? `SEC EDGAR XBRL companyfacts：us-gaap NetCashProvidedByUsedInOperatingActivities（${cash.filedFrame} 年度，10-K 披露）`
      : 'SEC EDGAR XBRL companyfacts 未披露该年度经营现金净额',
  };
}

export interface SecResearchOutput {
  identity: CompanyIdentity;
  announcements: CompanyAnnouncement[];
  preview?: {
    material: {
      company: string;
      shortName: string;
      title: string;
      filename: string;
      origin: 'public-report';
      documentDate: string;
      sourceUrl: string;
      sha256: string;
      observations: Observation[];
      notes: string[];
      excerpts: { page: number; text: string }[];
    };
    reviewRequired: true;
    warnings: string[];
    tablePages: number[];
    checks: never[];
  };
  buffer?: Buffer;
  stoppedReason?: string;
  model: { requested: boolean; status: string };
}

export async function secCompanyResearch(
  input: CompanyRunInput,
  options: { root: string; signal?: AbortSignal }
): Promise<SecResearchOutput> {
  if (!isSecTicker(input.securityCode) || !/^\d{1,10}$/.test(input.orgId))
    throw new ApiFault(400, 'SEC_INPUT_INVALID', '美股查询需要有效证券代码与 SEC CIK');
  const directory = path.join(options.root, 'data', 'sec-cache');
  const rows = await loadTickers(directory);
  const row = rows.get(input.securityCode.toLowerCase());
  if (!row || row.cik !== input.orgId)
    throw new ApiFault(404, 'SEC_COMPANY_NOT_FOUND', 'SEC 未收录该证券代码对应的主体');
  if (options.signal?.aborted) throw new ApiFault(499, 'COMPANY_CANCELLED', '本次公开查询已取消');
  const tenK = await latestTenK(row.cik, input.year, row.title);
  const facts = await companyFacts(row.cik, input.year);
  const filingUrl = `https://www.sec.gov/Archives/edgar/data/${row.cik}/${tenK.accession.replace(/-/g, '')}/${tenK.primaryDocument}`;
  const identity: CompanyIdentity = {
    securityCode: row.ticker.toUpperCase(),
    orgId: row.cik,
    shortName: row.title.slice(0, 80),
    companyName: row.title,
    exchange: 'us',
    sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${row.cik}&type=10-K`,
  };
  const announcement: CompanyAnnouncement = {
    id: randomUUID(),
    title: `${row.title} ${input.year} 年度 10-K（SEC EDGAR）`,
    publishedAt: new Date(`${tenK.filingDate}T00:00:00Z`).toISOString(),
    sourceUrl: filingUrl,
    category: 'annual',
    reportYear: input.year,
  };
  const observations: Observation[] = [];
  const add = (key: 'netProfit' | 'operatingCashFlow', value: string | null, quote: string) => {
    if (value === null) return;
    observations.push({
      id: randomUUID(),
      key,
      year: input.year,
      period: 'annual',
      value,
      unit: 'usd',
      currency: 'USD',
      scope: 'consolidated',
      page: null,
      quote,
      kind: 'reported',
    });
  };
  add('netProfit', facts.netProfit, facts.quoteProfit);
  add('operatingCashFlow', facts.operatingCashFlow, facts.quoteCash);
  const warnings: string[] = [];
  if (!facts.netProfit || !facts.operatingCashFlow)
    warnings.push('SEC XBRL 未披露该年度净利润或经营现金净额，缺失项不填零。');
  warnings.push(
    '美股数据来自 SEC EDGAR 10-K 与 XBRL companyfacts；现金桥仅含起止两项，完整调节见 10-K 现金流量表。'
  );
  const response = await secFetch(filingUrl, 90_000);
  if (options.signal?.aborted) throw new ApiFault(499, 'COMPANY_CANCELLED', '本次公开查询已取消');
  const raw = Buffer.from(await response.arrayBuffer());
  if (raw.length > pdfLimits.officialBytes)
    throw new ApiFault(413, 'SEC_FILE_TOO_LARGE', '10-K 原件超过可保存大小，未下载');
  const filename = `10-K-${input.year}-${row.ticker}-${tenK.accession}.htm`;
  const sha256 = createHash('sha256').update(raw).digest('hex');
  return {
    identity,
    announcements: [announcement],
    model: { requested: true, status: 'not-requested' },
    preview: {
      material: {
        company: row.title,
        shortName: row.title.slice(0, 80),
        title: `${row.title} ${input.year} 年度 10-K（SEC EDGAR）`,
        filename,
        origin: 'public-report',
        documentDate: tenK.filingDate,
        sourceUrl: filingUrl,
        sha256,
        observations,
        notes: [
          `SEC EDGAR 公开数据查询 ${input.year} 年度；采用后用于生成现金桥与四维风险视角。`,
          ...(facts.netProfit ? [] : ['该年度净利润在 SEC XBRL 无披露，不填零。']),
        ],
        excerpts: [],
      },
      reviewRequired: true,
      warnings,
      tablePages: [],
      checks: [],
    },
    buffer: raw,
    stoppedReason: 'SEC EDGAR 结构化年报数据（10-K + XBRL companyfacts）',
  };
}
