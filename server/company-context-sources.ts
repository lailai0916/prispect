import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import type { CompanyIdentity } from '../shared/contracts.js';
import {
  contextAmountFields,
  type CompanyContextSnapshot,
  type CompanyContextPeriod,
  type CompanySourceReceipt,
  type CompanyDisclosure,
  type ContextAmountField,
} from '../shared/company-workspace.js';
import { contextFen, contextYuan } from '../shared/company-analysis.js';
import { parseExactFinancialJson, normalizeMarketAmount } from './company-market.js';
import {
  boundedBody,
  officialPdfUrl,
  shanghaiDate,
  type CompanySourceDependencies,
} from './company-sources.js';
import { readCompanyPdf } from './company-extraction.js';
import { ApiFault } from './validation.js';
import {
  PublicResponseCache,
  publicRequestCacheKey,
  publicResponseCache,
  publicResponseTtl,
  type PublicResponseCacheStatus,
  type PublicResponse,
} from './public-response-cache.js';

export const CONTEXT_ENDPOINT = 'https://datacenter.eastmoney.com/securities/api/data/v1/get';
const CNINFO = 'https://www.cninfo.com.cn/new/hisAnnouncement/query';
const SINA = 'https://quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport2022';
const allowedHosts = new Set([
  'datacenter.eastmoney.com',
  'np-anotice-stock.eastmoney.com',
  'search-api-web.eastmoney.com',
  'www.cninfo.com.cn',
  'static.cninfo.com.cn',
  'quotes.sina.cn',
  'vip.stock.finance.sina.com.cn',
  'guba.eastmoney.com',
  'finance.eastmoney.com',
  'finance.sina.com.cn',
  'push2.eastmoney.com',
]);
export const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const arrayValue = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? (value.filter((item) => item && typeof item === 'object') as Record<string, unknown>[])
    : [];
export const textValue = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, 4000) : typeof value === 'number' ? String(value) : '';
export const finiteValue = (value: unknown): number | null =>
  value === null || value === undefined || value === '' || typeof value === 'boolean'
    ? null
    : Number.isFinite(Number(value))
      ? Number(value)
      : null;
export const dateValue = (value: unknown): string =>
  textValue(value)
    .replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
    .slice(0, 10);
const safeLink = (value: unknown): string | null => {
  try {
    const url = new URL(textValue(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};
const digest = (body: Buffer) => createHash('sha256').update(body).digest('hex');
const decode = (body: Buffer) => {
  const utf8 = body.toString('utf8');
  return utf8.includes('\ufffd') ? new TextDecoder('gb18030').decode(body) : utf8;
};

export class PublicCompanyReader {
  requests = 0;
  cacheHits = 0;
  sharedReads = 0;
  private observed = new Map<string, { url: string; sha256: string }>();
  constructor(
    readonly dependencies: CompanySourceDependencies = {},
    readonly maximumRequests = 50
  ) {}
  async read(url: string, init: RequestInit = {}, maximum = 2_000_000) {
    return this.readResponse(url, init, maximum, 'bytes');
  }
  private async readResponse(
    url: string,
    init: RequestInit,
    maximum: number,
    format: 'bytes' | 'json'
  ): Promise<{
    body: Buffer;
    url: string;
    sha256: string;
    fetchedAt: string;
    cache: PublicResponseCacheStatus;
  }> {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname))
      throw new ApiFault(400, 'CONTEXT_SOURCE_URL', '来源地址不在允许范围');
    this.dependencies.signal?.throwIfAborted();
    const signal = AbortSignal.any([
      AbortSignal.timeout(15000),
      ...(this.dependencies.signal ? [this.dependencies.signal] : []),
      ...(init.signal ? [init.signal] : []),
    ]);
    const headers = new Headers({
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://www.cninfo.com.cn/',
    });
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    const request = { ...init, headers };
    const key = publicRequestCacheKey(target, request, format);
    const fetcher = this.dependencies.fetch || fetch;
    const now = this.dependencies.now || (() => new Date());
    const result = await (key ? publicResponseCache(fetcher) : new PublicResponseCache()).read({
      key: key || 'uncached',
      maximum,
      ttlMs: key ? publicResponseTtl(target) : 0,
      bypass: this.dependencies.bypassCache || !key,
      signal,
      now,
      onStart: () => {
        if (this.requests >= this.maximumRequests)
          throw new ApiFault(429, 'CONTEXT_SOURCE_BUDGET', '达到本次来源读取上限');
        this.requests++;
      },
      load: async (sharedSignal) => {
        const producerSignal = AbortSignal.any([sharedSignal, AbortSignal.timeout(15000)]);
        const response = await fetcher(url, {
          ...request,
          redirect: 'error',
          signal: producerSignal,
        });
        if (!response.ok)
          throw new ApiFault(502, 'CONTEXT_SOURCE_HTTP', '公开来源本次没有返回可用结果');
        const body = await boundedBody(response, maximum, producerSignal);
        if (
          target.pathname.toLowerCase().endsWith('.pdf') &&
          body.subarray(0, 5).toString() !== '%PDF-'
        )
          throw new ApiFault(502, 'CONTEXT_SOURCE_FORMAT', '公开来源未返回可读取的 PDF 原件');
        if (format === 'json') {
          const value = parseExactFinancialJson(body.toString('utf8'));
          if (
            !value ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            objectValue(value).success === false ||
            objectValue(value).success === 'false'
          )
            throw new ApiFault(502, 'CONTEXT_SOURCE_FORMAT', '公开来源响应格式无法核对');
        }
        return { body, url, sha256: digest(body), fetchedAt: now().toISOString() };
      },
    });
    if (result.cache === 'hit') this.cacheHits++;
    if (result.cache === 'shared') this.sharedReads++;
    if (key) {
      this.observed.set(key, { url, sha256: result.sha256 });
      while (this.observed.size > 128) this.observed.delete(this.observed.keys().next().value!);
    }
    return result;
  }
  async json(url: string, init: RequestInit = {}) {
    const response = await this.readResponse(url, init, 2_000_000, 'json');
    return {
      ...response,
      value: objectValue(parseExactFinancialJson(response.body.toString('utf8'))),
    };
  }
  invalidateResponses(hashes: readonly string[], url?: string): void {
    const rejected = new Set(hashes);
    const cache = publicResponseCache(this.dependencies.fetch || fetch);
    for (const [key, response] of this.observed)
      if (
        url
          ? response.url === url && (!rejected.size || rejected.has(response.sha256))
          : rejected.has(response.sha256)
      )
        cache.discard(key, response.sha256);
  }
  discardResponse(
    url: string,
    init: RequestInit = {},
    format: 'bytes' | 'json' = 'json',
    sha256?: string
  ): void {
    const headers = new Headers({
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://www.cninfo.com.cn/',
    });
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    const key = publicRequestCacheKey(new URL(url), { ...init, headers }, format);
    if (key) publicResponseCache(this.dependencies.fetch || fetch).discard(key, sha256);
  }
}

const fields: Record<
  'income' | 'cashflow' | 'balance',
  Partial<Record<ContextAmountField, string>>
> = {
  income: {
    revenue: 'TOTAL_OPERATE_INCOME',
    netProfit: 'NETPROFIT',
    parentProfit: 'PARENT_NETPROFIT',
    deductedProfit: 'DEDUCT_PARENT_NETPROFIT',
    operatingProfit: 'OPERATE_PROFIT',
    totalProfit: 'TOTAL_PROFIT',
    financeExpense: 'FINANCE_EXPENSE',
  },
  cashflow: {
    ocf: 'NETCASH_OPERATE',
    investingCash: 'NETCASH_INVEST',
    financingCash: 'NETCASH_FINANCE',
    salesCash: 'SALES_SERVICES',
  },
  balance: {
    cash: 'MONETARYFUNDS',
    shortLoan: 'SHORT_LOAN',
    currentPortionDebt: 'NONCURRENT_LIAB_1YEAR',
    receivables: 'ACCOUNTS_RECE',
    notesReceivable: 'NOTE_RECE',
    inventory: 'INVENTORY',
    totalAssets: 'TOTAL_ASSETS',
    totalLiabilities: 'TOTAL_LIABILITIES',
    currentAssets: 'TOTAL_CURRENT_ASSETS',
    currentLiabilities: 'TOTAL_CURRENT_LIAB',
    equity: 'TOTAL_PARENT_EQUITY',
  },
};
const tables = {
  income: 'RPT_F10_FINANCE_GINCOME',
  cashflow: 'RPT_F10_FINANCE_GCASHFLOW',
  balance: 'RPT_F10_FINANCE_GBALANCE',
  ratios: 'RPT_F10_FINANCE_MAINFINADATA',
};
const sinaFields: Record<'income' | 'cashflow' | 'balance', Record<string, ContextAmountField>> = {
  income: {
    营业总收入: 'revenue',
    净利润: 'netProfit',
    归属于母公司所有者的净利润: 'parentProfit',
    营业利润: 'operatingProfit',
    利润总额: 'totalProfit',
    财务费用: 'financeExpense',
  },
  cashflow: {
    经营活动产生的现金流量净额: 'ocf',
    投资活动产生的现金流量净额: 'investingCash',
    筹资活动产生的现金流量净额: 'financingCash',
    '销售商品、提供劳务收到的现金': 'salesCash',
  },
  balance: {
    货币资金: 'cash',
    短期借款: 'shortLoan',
    一年内到期的非流动负债: 'currentPortionDebt',
    应收账款: 'receivables',
    应收票据: 'notesReceivable',
    存货: 'inventory',
    资产总计: 'totalAssets',
    负债合计: 'totalLiabilities',
    流动资产合计: 'currentAssets',
    流动负债合计: 'currentLiabilities',
    归属于母公司所有者权益合计: 'equity',
  },
};
const receipt = (
  id: string,
  provider: string,
  dimension: string,
  url: string,
  now: string
): CompanySourceReceipt => ({
  id,
  provider,
  dimension,
  url,
  status: 'error',
  fetchedAt: now,
  latestDate: null,
  count: 0,
  note: '本次来源未完成；未取得的数据保持未知',
  responseHashes: [],
});
function recordResponse(
  state: CompanySourceReceipt,
  response: Pick<PublicResponse, 'sha256' | 'fetchedAt'>
) {
  state.responseHashes.push(response.sha256);
  // Paged sources retain the oldest actual acquisition among their contributing responses.
  state.fetchedAt =
    state.responseHashes.length === 1 || response.fetchedAt < state.fetchedAt
      ? response.fetchedAt
      : state.fetchedAt;
}
const blankPeriod = (period: string): CompanyContextPeriod => ({
  period,
  annual: period.endsWith('-12-31'),
  noticeDate: null,
  amounts: Object.fromEntries(
    contextAmountFields.map((field) => [field, null])
  ) as CompanyContextPeriod['amounts'],
  ratios: { grossMargin: null, roe: null, revenueGrowth: null },
  auditOpinion: null,
  fieldSources: {},
  sourceUrls: [],
  originalUrl: null,
});

function contextReportUrl(period: string, announcements: CompanyDisclosure[]): string | null {
  const report = {
    '03-31': '(?:第一|第1|一|1)季度',
    '06-30': '半年度',
    '09-30': '(?:第三|第3|三|3)季度',
    '12-31': '年度',
  }[period.slice(5)];
  if (!report) return null;
  const title = new RegExp(
    `(?:^|[^0-9])${period.slice(0, 4)}年?${report}报告(?:全文)?(?:[（(][^（）()]*[）)])*$`
  );
  return (
    announcements.find(
      (item) =>
        item.category === '财报' &&
        !/摘要|英文|English|提示|公告|更正说明|补充说明|取消|撤销/i.test(item.title) &&
        title.test(item.title.replace(/\s/g, ''))
    )?.url || null
  );
}

export async function eastmoneyRows(
  reader: PublicCompanyReader,
  report: string,
  filter: string,
  size = 60,
  sort = 'REPORT_DATE'
) {
  const url = new URL(CONTEXT_ENDPOINT);
  url.search = new URLSearchParams({
    reportName: report,
    columns: 'ALL',
    filter,
    pageNumber: '1',
    pageSize: String(size),
    sortTypes: '-1',
    sortColumns: sort,
    source: 'HSF10',
    client: 'PC',
  }).toString();
  const response = await reader.json(url.href);
  const result = objectValue(response.value.result);
  if (response.value.success !== true || !Array.isArray(result.data)) {
    reader.discardResponse(response.url, {}, 'json', response.sha256);
    throw new ApiFault(502, 'CONTEXT_SOURCE_FORMAT', '财务来源响应格式无法核对');
  }
  return { ...response, rows: arrayValue(result.data) };
}
function assertIssuer(row: Record<string, unknown>, identity: CompanyIdentity) {
  const code = textValue(
    row.SECURITY_CODE || row.SECCODE || row.SEcuCode || row.SEcuCODE || row.SECUCODE
  ).split('.')[0];
  if (code && code !== identity.securityCode)
    throw new ApiFault(422, 'CONTEXT_SUBJECT_CONFLICT', '来源中的证券主体与查询主体不一致');
  if (!code) throw new ApiFault(422, 'CONTEXT_SUBJECT_UNKNOWN', '来源未提供可核对的证券主体');
}

export async function retrieveCompanyContext(
  identity: CompanyIdentity,
  dependencies: CompanySourceDependencies & {
    onSnapshot?: (snapshot: CompanyContextSnapshot) => Promise<void>;
  } = {}
): Promise<CompanyContextSnapshot> {
  const now = (dependencies.now || (() => new Date()))();
  const fetchedAt = now.toISOString();
  const deadline = dependencies.signal
    ? AbortSignal.any([dependencies.signal, AbortSignal.timeout(90000)])
    : AbortSignal.timeout(90000);
  const reader = new PublicCompanyReader({ ...dependencies, signal: deadline });
  const snapshot: CompanyContextSnapshot = {
    version: 1,
    securityCode: identity.securityCode,
    orgId: identity.orgId,
    companyName: identity.companyName || identity.shortName,
    fetchedAt,
    status: 'unavailable',
    financials: [],
    sources: [],
    comparisons: [],
    profile: {},
    shareholders: [],
    announcements: [],
    news: [],
    verificationLinks: [],
    warnings: [],
  };
  if (!['sse', 'szse'].includes(identity.exchange)) {
    snapshot.warnings.push('当前结构化企业概览仅覆盖沪深 A 股，其他主体保留信息缺口。');
    snapshot.verificationLinks = verificationLinks(snapshot.companyName, '');
    return snapshot;
  }
  const secucode = `${identity.securityCode}.${identity.exchange === 'sse' ? 'SH' : 'SZ'}`;
  const primary = new Map<string, CompanyContextPeriod>(),
    secondary = new Map<string, CompanyContextPeriod>();
  const organizations = new Set<string>();
  const blockedTables = new Set<string>();
  let invalidFinancialScope = false;
  const tasks = (Object.keys(tables) as (keyof typeof tables)[]).map(async (kind) => {
    const state = receipt(
      `em-${kind}`,
      '东方财富',
      `财务报表 · ${kind}`,
      CONTEXT_ENDPOINT,
      fetchedAt
    );
    snapshot.sources.push(state);
    try {
      const response = await eastmoneyRows(reader, tables[kind], `(SECUCODE="${secucode}")`);
      state.url = response.url;
      recordResponse(state, response);
      if (kind !== 'ratios') {
        for (const row of response.rows) {
          assertIssuer(row, identity);
          if (!/^\d{1,30}$/.test(textValue(row.ORG_CODE)) || !textValue(row.ORG_TYPE))
            throw new ApiFault(422, 'CONTEXT_SUBJECT_UNKNOWN', '无法核对组织主体');
          organizations.add(textValue(row.ORG_CODE));
          if (textValue(row.ORG_TYPE) !== '通用') invalidFinancialScope = true;
          if (row.CURRENCY !== 'CNY')
            throw new ApiFault(422, 'CONTEXT_CURRENCY', '财务币种未确认为人民币');
        }
      }
      for (const row of response.rows) {
        assertIssuer(row, identity);
        const orgType = textValue(row.ORG_TYPE);
        if (['银行', '证券', '保险'].some((word) => orgType.includes(word))) {
          invalidFinancialScope = true;
          continue;
        }
        const period = dateValue(row.REPORT_DATE);
        if (!/^20\d{2}-(?:03-31|06-30|09-30|12-31)$/.test(period) || period > shanghaiDate(now))
          continue;
        const entry = primary.get(period) || blankPeriod(period);
        const url = response.url;
        if (kind !== 'ratios')
          for (const [field, key] of Object.entries(fields[kind])) {
            const amount = normalizeMarketAmount(row[key] === null ? null : textValue(row[key]));
            const previous = entry.amounts[field as ContextAmountField];
            if (previous !== null && amount !== null && previous !== amount)
              throw new ApiFault(
                422,
                'CONTEXT_DUPLICATE_CONFLICT',
                '同报告期存在不同金额，暂不合并'
              );
            entry.amounts[field as ContextAmountField] = amount;
            if (amount !== null) entry.fieldSources[field as ContextAmountField] = '东方财富';
          }
        if (kind === 'ratios')
          entry.ratios = {
            grossMargin: finiteValue(row.XSMLL),
            roe: finiteValue(row.ROEJQ),
            revenueGrowth: finiteValue(row.TOTALOPERATEREVETZ ?? row.YSTZ),
          };
        if (row.OPINION_TYPE) entry.auditOpinion = textValue(row.OPINION_TYPE);
        const notice = dateValue(row.NOTICE_DATE);
        if (notice) entry.noticeDate = notice;
        if (!entry.sourceUrls.includes(url)) entry.sourceUrls.push(url);
        primary.set(period, entry);
      }
      state.count = response.rows.length;
      state.latestDate = [...primary.keys()].sort().at(-1) || null;
      state.status = response.rows.length ? 'available' : 'empty';
      state.note =
        '第三方网页报表字段；尚未逐项核对官方原件。保留元和分，不作为自动采用的现金桥材料。';
    } catch (error) {
      reader.invalidateResponses(state.responseHashes, state.url);
      if (error instanceof ApiFault && error.code.startsWith('CONTEXT_SUBJECT'))
        invalidFinancialScope = true;
      if (
        error instanceof ApiFault &&
        ['CONTEXT_DUPLICATE_CONFLICT', 'CONTEXT_CURRENCY'].includes(error.code)
      )
        blockedTables.add(kind);
      state.note = '本次表未通过获取、主体或重复值检查；该表字段保持未知';
      // A partly parsed table must not leak values after its own validation fails.
      for (const entry of primary.values())
        if (kind === 'ratios') entry.ratios = { grossMargin: null, roe: null, revenueGrowth: null };
        else
          for (const field of Object.keys(fields[kind])) {
            entry.amounts[field as ContextAmountField] = null;
            delete entry.fieldSources[field as ContextAmountField];
          }
    }
  });
  tasks.push(
    ...(Object.keys(sinaFields) as (keyof typeof sinaFields)[]).map(async (kind) => {
      const url = new URL(SINA);
      url.search = new URLSearchParams({
        paperCode: `${identity.exchange === 'sse' ? 'sh' : 'sz'}${identity.securityCode}`,
        source: { income: 'lrb', cashflow: 'llb', balance: 'fzb' }[kind],
        type: '0',
        page: '1',
        num: '40',
      }).toString();
      const state = receipt(`sina-${kind}`, '新浪财经', `财务报表 · ${kind}`, url.href, fetchedAt);
      snapshot.sources.push(state);
      try {
        const response = await reader.json(url.href);
        recordResponse(state, response);
        const listedReports = objectValue(objectValue(response.value.result).data).report_list;
        if (!listedReports || typeof listedReports !== 'object' || Array.isArray(listedReports))
          throw new ApiFault(502, 'CONTEXT_SOURCE_FORMAT', '财务来源响应格式无法核对');
        const reports = objectValue(listedReports);
        if (!Object.keys(reports).length) {
          state.status = 'empty';
          return;
        }
        const acceptedPeriods: string[] = [];
        for (const [key, value] of Object.entries(reports)) {
          const report = objectValue(value);
          if (!textValue(report.rType).includes('合并') || report.rCurrency !== 'CNY') continue;
          const period = dateValue(key);
          if (!/^20\d{2}-(?:03-31|06-30|09-30|12-31)$/.test(period) || period > shanghaiDate(now))
            continue;
          acceptedPeriods.push(period);
          const entry = secondary.get(period) || blankPeriod(period);
          for (const cell of arrayValue(report.data)) {
            const field = sinaFields[kind][textValue(cell.item_title)];
            if (!field) continue;
            entry.amounts[field] = normalizeMarketAmount(
              textValue(cell.item_value).replace(/,/g, '')
            );
            if (entry.amounts[field] !== null) entry.fieldSources[field] = '新浪财经';
          }
          const notice = dateValue(report.publish_date);
          if (notice) entry.noticeDate = notice;
          if (report.audit_opinion) entry.auditOpinion = textValue(report.audit_opinion);
          entry.sourceUrls.push(url.href);
          secondary.set(period, entry);
        }
        state.count = acceptedPeriods.length;
        state.latestDate = acceptedPeriods.sort().at(-1) || null;
        state.status = acceptedPeriods.length ? 'available' : 'empty';
        state.note = '证券代码定位的人民币合并报表；同报告期只补缺，主来源已有数值保持独立并比较。';
      } catch {
        reader.invalidateResponses(state.responseHashes, state.url);
        state.note = '新浪财经本次未完成；不把来源失败解释为没有数据';
        for (const entry of secondary.values())
          for (const field of Object.values(sinaFields[kind])) {
            entry.amounts[field] = null;
            delete entry.fieldSources[field];
          }
      }
    })
  );
  const extras = retrieveCompanyExtras(snapshot, identity, reader);
  await Promise.allSettled(tasks);
  if (organizations.size > 1) invalidFinancialScope = true;
  for (const kind of blockedTables)
    if (kind !== 'ratios')
      for (const entry of secondary.values())
        for (const field of Object.keys(fields[kind as keyof typeof fields]))
          entry.amounts[field as ContextAmountField] = null;
  if (!invalidFinancialScope) {
    const keys = [...new Set([...primary.keys(), ...secondary.keys()])].sort();
    for (const period of keys) {
      const a = primary.get(period) || blankPeriod(period),
        b = secondary.get(period);
      if (b)
        for (const field of contextAmountFields) {
          const source = b.amounts[field];
          if (source === null) continue;
          if (a.amounts[field] === null) {
            a.amounts[field] = source;
            a.fieldSources[field] = '新浪财经';
          } else if (
            ['revenue', 'parentProfit', 'netProfit', 'ocf', 'cash', 'totalAssets'].includes(field)
          ) {
            const primaryFen = contextFen(a.amounts[field])!,
              secondaryFen = contextFen(source)!;
            const difference = primaryFen - secondaryFen,
              absolute = difference < 0n ? -difference : difference;
            const magnitude = primaryFen < 0n ? -primaryFen : primaryFen;
            const tolerance =
              magnitude / 1_000_000n > 1_000_000n ? magnitude / 1_000_000n : 1_000_000n;
            snapshot.comparisons.push({
              period,
              field,
              primary: a.amounts[field]!,
              secondary: source,
              difference: contextYuan(difference),
              matches: absolute <= tolerance,
            });
            if (absolute > tolerance) {
              a.amounts[field] = null;
              delete a.fieldSources[field];
            }
          }
        }
      if (b) {
        a.noticeDate ||= b.noticeDate;
        a.auditOpinion ||= b.auditOpinion;
        a.sourceUrls = [...new Set([...a.sourceUrls, ...b.sourceUrls])];
      }
      a.originalUrl = contextReportUrl(period, snapshot.announcements);
      snapshot.financials.push(a);
    }
    const annual = snapshot.financials.filter((row) => row.annual).slice(-6),
      interim = snapshot.financials.filter((row) => !row.annual).slice(-1);
    snapshot.financials = [...annual, ...interim].sort((a, b) => a.period.localeCompare(b.period));
  } else
    snapshot.warnings.push(
      '金融机构或来源主体未通过通用行业口径检查，未组合财务金额；请继续核对主体和原件。'
    );
  snapshot.status = snapshot.financials.length ? 'partial' : 'unavailable';
  await dependencies.onSnapshot?.(structuredClone(snapshot));
  await extras;
  for (const row of snapshot.financials)
    row.originalUrl = contextReportUrl(row.period, snapshot.announcements);
  snapshot.verificationLinks = verificationLinks(
    snapshot.profile.orgName || snapshot.companyName,
    snapshot.profile.creditCode || ''
  );
  snapshot.sources.push(
    receipt('court', '法院公开查询', '司法 / 执行', 'https://zxgk.court.gov.cn/', fetchedAt),
    receipt(
      'registration',
      '工商与信用公示',
      '当前登记 / 行政处罚',
      'https://www.gsxt.gov.cn/',
      fetchedAt
    )
  );
  for (const state of snapshot.sources.filter((source) =>
    ['court', 'registration'].includes(source.id)
  )) {
    state.status = 'manual';
    state.note = '提供官方查询入口，尚未取得完整企业记录；未查到不代表没有记录';
  }
  snapshot.status = snapshot.financials.length
    ? snapshot.sources.some((source) => ['error', 'partial'].includes(source.status))
      ? 'partial'
      : 'available'
    : 'unavailable';
  snapshot.warnings.push(
    '网页字段与官方原件候选分别保存；相同数值不证明真实性。历史货币资金不是当前可用现金。'
  );
  if (snapshot.comparisons.some((check) => !check.matches))
    snapshot.warnings.push(
      '同报告期跨平台金额存在差异，双方数值保留在来源比对；冲突字段不参与推断，待核对原文。'
    );
  snapshot.sources.sort((a, b) => a.id.localeCompare(b.id));
  return snapshot;
}

// Additional public sources are collected independently so one failed provider
// cannot turn the other providers' records into an empty or reassuring result.
async function retrieveCompanyExtras(
  snapshot: CompanyContextSnapshot,
  identity: CompanyIdentity,
  reader: PublicCompanyReader
) {
  await Promise.allSettled([
    retrieveProfile(snapshot, identity, reader),
    retrieveShareholders(snapshot, identity, reader),
    retrieveNews(snapshot, identity, reader),
    retrieveDisclosures(snapshot, identity, reader),
  ]);
}

export function verificationLinks(
  name: string,
  credit: string
): CompanyContextSnapshot['verificationLinks'] {
  const instruction = `搜索企业全称「${name}」${credit ? `，信用代码「${credit}」` : ''}；核对主体与记录日期`;
  return [
    {
      label: '裁判文书网',
      url: 'https://wenshu.court.gov.cn/',
      purpose: '判决与裁判原文',
      instruction,
    },
    {
      label: '中国执行信息公开网',
      url: 'https://zxgk.court.gov.cn/',
      purpose: '执行与失信记录',
      instruction,
    },
    {
      label: '信用中国',
      url: 'https://www.creditchina.gov.cn/',
      purpose: '信用公示与行政处罚',
      instruction,
    },
    {
      label: '国家企业信用信息公示系统',
      url: 'https://www.gsxt.gov.cn/',
      purpose: '企业登记、年报与经营异常',
      instruction,
    },
    {
      label: '爱企查',
      url: `https://aiqicha.baidu.com/s?q=${encodeURIComponent(name)}`,
      purpose: '第三方工商快照',
      instruction: '部分资料需登录或授权；未接入完整查询',
    },
    {
      label: '企查查',
      url: `https://www.qcc.com/web/search?key=${encodeURIComponent(name)}`,
      purpose: '授权工商、股权及司法查询',
      instruction: '部分资料需购买授权；当前仅提供查询入口',
    },
    {
      label: '天眼查',
      url: `https://www.tianyancha.com/search?key=${encodeURIComponent(name)}`,
      purpose: '授权企业资料查询',
      instruction: '核对企业全称；当前仅提供查询入口',
    },
  ];
}
async function retrieveProfile(
  snapshot: CompanyContextSnapshot,
  identity: CompanyIdentity,
  reader: PublicCompanyReader
) {
  const secucode = `${identity.securityCode}.${identity.exchange === 'sse' ? 'SH' : 'SZ'}`;
  const state = receipt(
    'em-profile',
    '东方财富',
    '公司公开资料',
    CONTEXT_ENDPOINT,
    snapshot.fetchedAt
  );
  snapshot.sources.push(state);
  try {
    const response = await eastmoneyRows(
      reader,
      'RPT_F10_BASIC_ORGINFO',
      `(SECUCODE="${secucode}")`,
      1,
      'SECURITY_CODE'
    );
    const row = response.rows[0];
    state.url = response.url;
    recordResponse(state, response);
    if (row) {
      assertIssuer(row, identity);
      const keys = {
        orgName: 'ORG_NAME',
        englishName: 'ORG_NAME_EN',
        creditCode: 'REG_NUM',
        legalPerson: 'LEGAL_PERSON',
        chairman: 'CHAIRMAN',
        president: 'PRESIDENT',
        capitalWan: 'REG_CAPITAL',
        founded: 'FOUND_DATE',
        listed: 'LISTING_DATE',
        employees: 'EMP_NUM',
        address: 'REG_ADDRESS',
        business: 'MAIN_BUSINESS',
        controller: 'ACTUAL_HOLDER',
        auditor: 'ACCOUNTFIRM_NAME',
        industry: 'EM2016',
        website: 'ORG_WEB',
        province: 'PROVINCE',
        description: 'ORG_PROFILE',
      };
      snapshot.profile = Object.fromEntries(
        Object.entries(keys).map(([key, field]) => [key, textValue(row[field]) || null])
      );
    }
    state.count = row ? 1 : 0;
    state.status = row ? 'available' : 'empty';
    state.note = '公司公开资料，资料更新时间未知；不等同当前工商登记或完整股权穿透。';
  } catch {
    reader.invalidateResponses(state.responseHashes, state.url);
    state.note = '公司公开资料本次未取得，保留缺失状态';
  }
  const url = `https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpInfo/stockid/${identity.securityCode}.phtml`;
  const secondary = receipt('sina-profile', '新浪财经', '公司公开资料', url, snapshot.fetchedAt);
  snapshot.sources.push(secondary);
  try {
    const response = await reader.read(url);
    recordResponse(secondary, response);
    const $ = load(decode(response.body)),
      values: Record<string, string> = {};
    $('#comInfo1 tr').each((_index, row) => {
      const cells = $(row).children('td');
      for (let index = 0; index + 1 < cells.length; index += 2)
        values[
          cells
            .eq(index)
            .text()
            .trim()
            .replace(/[：:]$/, '')
        ] = cells
          .eq(index + 1)
          .text()
          .trim();
    });
    const mapping = {
      公司名称: 'orgName',
      公司英文名称: 'englishName',
      成立日期: 'founded',
      上市日期: 'listed',
      法人代表: 'legalPerson',
      法定代表人: 'legalPerson',
      注册地址: 'address',
      主营业务: 'business',
    };
    for (const [label, key] of Object.entries(mapping))
      if (!snapshot.profile[key] && values[label]) snapshot.profile[key] = values[label]!;
    secondary.count = values['公司名称'] ? 1 : 0;
    secondary.status = secondary.count ? 'available' : 'empty';
    secondary.note = '仅补充缺失资料；来源没有提供资料更新日期。';
  } catch {
    reader.invalidateResponses(secondary.responseHashes, secondary.url);
    secondary.note = '新浪公司资料本次未取得，不代填其他企业资料';
  }
}
async function retrieveShareholders(
  snapshot: CompanyContextSnapshot,
  identity: CompanyIdentity,
  reader: PublicCompanyReader
) {
  const state = receipt(
    'shareholders',
    '东方财富',
    '已披露十大股东',
    CONTEXT_ENDPOINT,
    snapshot.fetchedAt
  );
  snapshot.sources.push(state);
  try {
    const response = await eastmoneyRows(
      reader,
      'RPT_F10_EH_HOLDERS',
      `(SECUCODE="${identity.securityCode}.${identity.exchange === 'sse' ? 'SH' : 'SZ'}")`,
      40,
      'END_DATE'
    );
    state.url = response.url;
    recordResponse(state, response);
    const period = dateValue(response.rows[0]?.END_DATE);
    const rows = response.rows.filter((row) => dateValue(row.END_DATE) === period);
    for (const row of rows) assertIssuer(row, identity);
    snapshot.shareholders = rows
      .sort((a, b) => (finiteValue(a.HOLDER_RANK) ?? 99) - (finiteValue(b.HOLDER_RANK) ?? 99))
      .slice(0, 10)
      .map((row) => ({
        name: textValue(row.HOLDER_NAME),
        shares: normalizeMarketAmount(textValue(row.HOLD_NUM)),
        percentage: finiteValue(row.HOLD_NUM_RATIO),
        change: textValue(row.HOLD_NUM_CHANGE) || null,
        period,
        url: response.url,
      }));
    state.count = snapshot.shareholders.length;
    state.latestDate = period || null;
    state.status = state.count ? 'available' : 'empty';
    state.note = '已披露直接股东，不等同完整股权穿透或当前实时持股。';
  } catch {
    reader.invalidateResponses(state.responseHashes, state.url);
    state.note = '本次股东来源未通过获取或主体检查；不推断股东不存在';
  }
}
function companyAliases(identity: CompanyIdentity) {
  return [
    ...new Set(
      [identity.shortName, identity.companyName]
        .filter((name): name is string => Boolean(name))
        .map((name) =>
          name
            .replace(/(?:[-－][UWABH]|[ABH])$/, '')
            .replace(/(?:股份有限公司|有限责任公司|有限公司)$/, '')
        )
    ),
  ].filter((name) => name.length >= 2);
}
async function retrieveNews(
  snapshot: CompanyContextSnapshot,
  identity: CompanyIdentity,
  reader: PublicCompanyReader
) {
  const aliases = companyAliases(identity);
  await Promise.allSettled([
    (async () => {
      const url = new URL('https://search-api-web.eastmoney.com/search/jsonp');
      url.search = new URLSearchParams({
        cb: '',
        param: JSON.stringify({
          uid: '',
          keyword: identity.shortName,
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
      const state = receipt('em-news', '东方财富', '新闻线索', url.href, snapshot.fetchedAt);
      snapshot.sources.push(state);
      try {
        const response = await reader.json(url.href);
        recordResponse(state, response);
        const listedNews = objectValue(response.value.result).cmsArticleWebOld;
        if (!Array.isArray(listedNews))
          throw new ApiFault(502, 'CONTEXT_SOURCE_FORMAT', '新闻来源响应格式无法核对');
        const rows = arrayValue(listedNews);
        for (const row of rows) {
          const title = load(textValue(row.title)).text(),
            description = load(textValue(row.content)).text().slice(0, 100),
            link = safeLink(row.url);
          if (
            !link ||
            !aliases.some(
              (alias) => title.includes(alias) || description.slice(0, 60).includes(alias)
            )
          )
            continue;
          snapshot.news.push({
            title,
            date: dateValue(row.date),
            media: textValue(row.mediaName) || '来源未提供媒体',
            url: link,
            provider: '东方财富',
            digest: description,
          });
          state.count++;
        }
        state.status = state.count ? 'available' : 'empty';
        state.note = '公司名称过滤的新闻检索，媒体线索不是事实认定，也不代表完整舆情监测。';
      } catch {
        reader.invalidateResponses(state.responseHashes, state.url);
        state.note = '东方财富新闻来源本次未完成';
      }
    })(),
    (async () => {
      const url = new URL('https://vip.stock.finance.sina.com.cn/corp/view/vCB_AllNewsStock.php');
      url.search = new URLSearchParams({
        symbol: `${identity.exchange === 'sse' ? 'sh' : 'sz'}${identity.securityCode}`,
        Page: '1',
      }).toString();
      const state = receipt('sina-news', '新浪财经', '新闻线索', url.href, snapshot.fetchedAt);
      snapshot.sources.push(state);
      try {
        const response = await reader.read(url.href);
        recordResponse(state, response);
        const $ = load(decode(response.body));
        $('ul a[href]').each((_index, element) => {
          const title = $(element).text().trim(),
            link = safeLink($(element).attr('href')),
            previous = $(element).parent().text(),
            date = previous.match(/20\d{2}-\d{2}-\d{2}/)?.[0];
          if (
            !link ||
            !/^https?:\/\/(?:finance|cj)\.sina\.(?:com\.cn|cn)\//.test(link) ||
            !date ||
            !aliases.some((alias) => title.includes(alias))
          )
            return;
          snapshot.news.push({
            title,
            date,
            media: '新浪财经收录',
            url: link,
            provider: '新浪财经',
            digest: '',
          });
          state.count++;
        });
        state.status = state.count ? 'available' : 'empty';
        state.note = '按证券代码定位并按企业名称过滤；收录平台不等同原始媒体。';
      } catch {
        reader.invalidateResponses(state.responseHashes, state.url);
        state.note = '新浪新闻来源本次未完成';
      }
    })(),
  ]);
  const seen = new Set<string>();
  snapshot.news = snapshot.news
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((row) => {
      const key = row.title.replace(/\s/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 16);
  for (const state of snapshot.sources.filter((source) => source.dimension === '新闻线索'))
    state.latestDate =
      snapshot.news.filter((row) => row.provider === state.provider)[0]?.date || null;
}

const disclosureRules: readonly (readonly [
  string,
  CompanyDisclosure['attention'],
  RegExp,
  string,
  string,
])[] = [
  [
    '偿债',
    'high',
    /违约|逾期|债务重组|债务展期|重整|清算|破产|无法偿还/,
    '涉及债权回收或债务清偿，需区分公司角色',
    '核实公司是债权人还是债务人、金额、到期日与履行进展',
  ],
  [
    '司法',
    'high',
    /诉讼|仲裁|被执行|查封|冻结|失信|司法拍卖|判决/,
    '可能影响资产可用性、现金支出或或有负债',
    '核实涉及主体、金额、案件阶段及是否已履行',
  ],
  [
    '监管',
    'high',
    /行政处罚|警示函|监管函|问询函|立案|调查|纪律处分|公开谴责|违规/,
    '涉及披露质量、合规成本或经营限制',
    '核实监管对象、事实、整改进展与财务影响',
  ],
  [
    '经营',
    'high',
    /退市|停产|停业|重大亏损|风险警示|持续经营/,
    '可能影响业务连续性',
    '核实业务范围、持续时间和现金流保障',
  ],
  [
    '经营',
    'medium',
    /业绩预告|业绩快报|亏损|计提|减值|重大合同|重大资产|出售资产|收购|合并|关联交易/,
    '涉及利润变化、资产质量或交易现金流',
    '区分一次性与持续事项，核实金额、交易对手和回款安排',
  ],
  [
    '融资',
    'medium',
    /募集资金|定向发行|向特定对象|发行债券|债券兑付|本息兑付|增资|融资|授信/,
    '涉及融资结构、资金用途和偿付安排',
    '区分正常融资或按期兑付与违约，核对资金用途和到期结构',
  ],
  [
    '股权',
    'medium',
    /质押|减持|控制权|实际控制人变更|权益变动/,
    '涉及股东资金安排或控制权变化',
    '核实比例、用途和控制权影响；解除质押不等同风险增加',
  ],
  [
    '担保',
    'medium',
    /对外担保|担保进展|提供担保|为控股子公司|为下属公司/,
    '涉及或有偿付责任',
    '核实对象、实际余额、期限、反担保及履行进展，金额不简单累加',
  ],
  [
    '财报',
    'medium',
    /年度报告|半年度报告|季度报告|审计报告|会计政策|会计估计|会计师事务所/,
    '提供更新的经营数据或改变可比口径',
    '核实报告期、审计意见、口径变化与附注',
  ],
  [
    '人事',
    'low',
    /辞职|聘任|离任|换届|免职|代为履行/,
    '涉及治理人员变动',
    '核实原因和职责连续性，单条公告不构成经营结论',
  ],
];
export function classifyDisclosure(
  title: string
): Pick<CompanyDisclosure, 'category' | 'attention' | 'matched' | 'meaning' | 'nextQuestion'> {
  if (!/报告摘要|报告英文|英文版|H股公告/.test(title))
    for (const [category, attention, pattern, meaning, nextQuestion] of disclosureRules) {
      const matched = title.match(pattern)?.[0];
      if (matched) return { category, attention, matched, meaning, nextQuestion };
    }
  return {
    category: '常规 / 待判读',
    attention: 'routine',
    matched: '',
    meaning: '标题不足以判断财务影响或属于例行披露',
    nextQuestion: '保留原文，需要时继续核实',
  };
}
export function mergeDisclosures(rows: CompanyDisclosure[]): CompanyDisclosure[] {
  const result = new Map<string, CompanyDisclosure>();
  for (const row of rows) {
    const normalized = row.title.replace(/^.*?[:：]/, '').replace(/[\s（）()]/g, '');
    const key = `${row.date}:${normalized}`;
    const existing = result.get(key);
    if (existing) {
      existing.sources = [
        ...existing.sources,
        ...row.sources.filter(
          (source) => !existing.sources.some((value) => value.url === source.url)
        ),
      ];
      if (row.url.startsWith('https://static.cninfo.com.cn/')) existing.url = row.url;
    } else result.set(key, structuredClone(row));
  }
  return [...result.values()].sort((a, b) => b.date.localeCompare(a.date));
}
async function retrieveDisclosures(
  snapshot: CompanyContextSnapshot,
  identity: CompanyIdentity,
  reader: PublicCompanyReader
) {
  const now = (reader.dependencies.now || (() => new Date()))(),
    since = shanghaiDate(new Date(now.getTime() - 3 * 365 * 86400000));
  const rows: CompanyDisclosure[] = [];
  await Promise.allSettled([
    (async () => {
      const state = receipt(
        'cninfo-disclosures',
        '巨潮资讯',
        '公告原文',
        CNINFO,
        snapshot.fetchedAt
      );
      snapshot.sources.push(state);
      let total = 0;
      try {
        for (let page = 1; page <= 20; page++) {
          const response = await reader.json(CNINFO, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              pageNum: String(page),
              pageSize: '30',
              column: identity.exchange === 'sse' ? 'sse' : 'szse',
              tabName: 'fulltext',
              stock: `${identity.securityCode},${identity.orgId}`,
              searchkey: '',
              secid: '',
              plate: '',
              category: '',
              trade: '',
              seDate: `${since}~${shanghaiDate(now)}`,
              sortName: 'time',
              sortType: 'desc',
              isHLtitle: 'false',
            }).toString(),
          });
          recordResponse(state, response);
          total = Number(response.value.totalAnnouncement);
          if (
            !Number.isInteger(total) ||
            total < 0 ||
            (total > 0 && !Array.isArray(response.value.announcements)) ||
            (response.value.announcements != null && !Array.isArray(response.value.announcements))
          )
            throw new ApiFault(502, 'CONTEXT_SOURCE_FORMAT', '公告来源响应格式无法核对');
          const announcements = arrayValue(response.value.announcements);
          for (const item of announcements) {
            if (item.secCode !== identity.securityCode || item.orgId !== identity.orgId) continue;
            const title = load(textValue(item.announcementTitle)).text(),
              timestamp = Number(item.announcementTime);
            if (!Number.isFinite(timestamp)) continue;
            const date = shanghaiDate(new Date(timestamp));
            const url = officialPdfUrl(textValue(item.adjunctUrl));
            rows.push({
              id: `cninfo-${textValue(item.announcementId)}`,
              title,
              date,
              url,
              sources: [{ provider: '巨潮资讯', url }],
              ...classifyDisclosure(title),
            });
            state.count++;
          }
          if (page * 30 >= total || !announcements.length || response.value.hasMore === false)
            break;
        }
        state.status = state.count < total ? 'partial' : state.count ? 'available' : 'empty';
        state.note = `近三年共 ${total} 条，本次定位 ${state.count} 条；最多读取 600 条，未覆盖记录不推断不存在。`;
      } catch {
        reader.invalidateResponses(state.responseHashes, state.url);
        state.status = state.count ? 'partial' : 'error';
        state.note = '公告来源本次未完成；保留已读取记录，明确部分覆盖';
      }
    })(),
    (async () => {
      const endpoint = 'https://np-anotice-stock.eastmoney.com/api/security/ann',
        state = receipt('em-disclosures', '东方财富', '公告线索', endpoint, snapshot.fetchedAt);
      snapshot.sources.push(state);
      let complete = false;
      try {
        for (let page = 1; page <= 6; page++) {
          const url = new URL(endpoint);
          url.search = new URLSearchParams({
            sr: '-1',
            page_size: '100',
            page_index: String(page),
            ann_type: 'A',
            client_source: 'web',
            stock_list: identity.securityCode,
            f_node: '0',
            s_node: '0',
          }).toString();
          const response = await reader.json(url.href, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
              Referer: 'https://emweb.eastmoney.com/',
            },
          });
          recordResponse(state, response);
          const listedAnnouncements = objectValue(response.value.data).list;
          if (!Array.isArray(listedAnnouncements))
            throw new ApiFault(502, 'CONTEXT_SOURCE_FORMAT', '公告来源响应格式无法核对');
          const list = arrayValue(listedAnnouncements);
          if (!list.length) {
            complete = true;
            break;
          }
          for (const item of list) {
            const date = dateValue(item.notice_date);
            if (date < since) {
              complete = true;
              continue;
            }
            const codes = arrayValue(item.codes);
            if (
              codes.length &&
              !codes.some((code) => textValue(code.stock_code) === identity.securityCode)
            )
              continue;
            const id = textValue(item.art_code);
            if (!/^[A-Za-z0-9]+$/.test(id)) continue;
            const title = load(textValue(item.title)).text(),
              url = `https://data.eastmoney.com/notices/detail/${identity.securityCode}/${id}.html`;
            rows.push({
              id: `em-${id}`,
              title,
              date,
              url,
              sources: [{ provider: '东方财富', url }],
              ...classifyDisclosure(title),
            });
            state.count++;
          }
          if (complete) break;
        }
        state.status = complete ? (state.count ? 'available' : 'empty') : 'partial';
        state.note = '近三年最多六页、600 条；标题规则用于定位核查事项，不能认证案件或违约事实。';
      } catch {
        reader.invalidateResponses(state.responseHashes, state.url);
        state.status = state.count ? 'partial' : 'error';
        state.note = '本次来源未读完整，保留已取得记录';
      }
    })(),
  ]);
  snapshot.announcements = mergeDisclosures(rows);
  for (const state of snapshot.sources.filter((source) => source.dimension.startsWith('公告')))
    state.latestDate =
      snapshot.announcements.filter((row) =>
        row.sources.some((source) => source.provider === state.provider)
      )[0]?.date || null;
  const excerptDeadline = AbortSignal.any([
    reader.dependencies.signal || new AbortController().signal,
    AbortSignal.timeout(45000),
  ]);
  const candidates = snapshot.announcements
    .filter(
      (row) =>
        row.attention === 'high' &&
        row.url.startsWith('https://static.cninfo.com.cn/') &&
        row.date >= shanghaiDate(new Date(now.getTime() - 365 * 86400000))
    )
    .slice(0, 6);
  for (const row of candidates) {
    if (excerptDeadline.aborted) break;
    try {
      const response = await reader.read(row.url, { signal: excerptDeadline }, 8_000_000);
      const parsed = await readCompanyPdf(response.body, excerptDeadline, { sourceUrl: row.url });
      const page = parsed.pages
        .slice(0, 3)
        .find((page) => /本次|截至|涉案|逾期|债务|诉讼|担保|减值/.test(page.text));
      if (!page) continue;
      const sentence = page.text
        .replace(/\s+/g, '')
        .split(/(?<=[。；])/)
        .find(
          (sentence) =>
            sentence.length >= 25 &&
            sentence.length <= 500 &&
            /本次|截至|涉案|逾期|债务|诉讼|担保|减值/.test(sentence) &&
            !/虚假记载|误导性陈述|真实、准确、完整/.test(sentence)
        );
      if (sentence)
        row.excerpt = {
          page: page.page,
          quote: sentence,
          url: row.url,
          sha256: response.sha256,
          pagesRead: Math.min(parsed.pages.length, 3),
        };
    } catch {
      reader.invalidateResponses([], row.url);
      /* Failed excerpts leave the original link and explicit coverage intact. */
    }
  }
  if (candidates.length)
    snapshot.warnings.push(
      `对 ${candidates.length} 条高关注公告尝试前 3 页摘录；仅读取到 ${candidates.filter((row) => row.excerpt).length} 条摘录，不代表全文覆盖。`
    );
}
