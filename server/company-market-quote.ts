import type { CompanyResearchRun } from '../shared/contracts.js';
import type { CompanyMarketQuote, CompanySourceReceipt } from '../shared/company-workspace.js';
import { PublicCompanyReader, objectValue } from './company-context-sources.js';
import { normalizeMarketAmount, parseExactFinancialJson } from './company-market.js';
import { ApiFault } from './validation.js';

const endpoint = 'https://push2.eastmoney.com/api/qt/stock/get';
const fields = 'f57,f59,f43,f44,f45,f169,f170,f116,f86';
const responseBytes = 2_000_000;

/** Prices and changes are integers in units of 10^-f59 CNY; never pass them through Number. */
function scaledAmount(value: unknown, precision: number | null, positive = false): string | null {
  if (precision === null || typeof value !== 'string' || !/^-?\d{1,24}$/.test(value)) return null;
  const integer = BigInt(value);
  if (positive && integer <= 0n) return null;
  const digits = (integer < 0n ? -integer : integer).toString().padStart(precision + 1, '0');
  const exact = precision ? `${digits.slice(0, -precision)}.${digits.slice(-precision)}` : digits;
  return `${integer < 0n ? '-' : ''}${exact}`;
}

function percentage(value: unknown): number | null {
  if (typeof value !== 'string' || !/^-?\d{1,16}$/.test(value)) return null;
  const integer = Number(value);
  return Number.isSafeInteger(integer) ? integer / 100 : null;
}

function quoteTime(value: unknown, now: Date): string | null {
  if (typeof value !== 'string' || !/^\d{9,10}$/.test(value)) return null;
  const seconds = Number(value);
  // f86 is Unix seconds, not milliseconds. Historical quotes retain their actual timestamp.
  if (seconds < 946684800 || seconds * 1000 > now.getTime() + 300_000) return null;
  return new Date(seconds * 1000).toISOString();
}

function confirmedMarket(run: CompanyResearchRun): '0' | '1' | null {
  const identity = run.identity;
  if (
    !identity ||
    run.informationGap ||
    !/^\d{6}$/.test(run.input.securityCode) ||
    !run.input.orgId ||
    identity.securityCode !== run.input.securityCode ||
    identity.orgId !== run.input.orgId ||
    (run.context &&
      (run.context.securityCode !== run.input.securityCode ||
        run.context.orgId !== run.input.orgId))
  )
    return null;
  if (identity.exchange === 'sse' && /^(?:60|68)/.test(identity.securityCode)) return '1';
  if (identity.exchange === 'szse' && /^(?:00|30)/.test(identity.securityCode)) return '0';
  return null;
}

/** One bounded public snapshot request. An unavailable source never becomes a zero-valued quote. */
export async function retrieveCompanyMarketQuote(
  run: CompanyResearchRun,
  options: { reader: PublicCompanyReader; signal?: AbortSignal }
): Promise<{ quote: CompanyMarketQuote; source: CompanySourceReceipt }> {
  const now = options.reader.dependencies.now?.() || new Date();
  const fetchedAt = now.toISOString();
  const market = confirmedMarket(run);
  const target = new URL(endpoint);
  if (market !== null) target.searchParams.set('secid', `${market}.${run.input.securityCode}`);
  target.searchParams.set('fields', fields);
  const sourceUrl = target.href;
  const quote: CompanyMarketQuote = {
    securityCode: run.input.securityCode,
    status: 'unavailable',
    price: null,
    change: null,
    changePercent: null,
    high: null,
    low: null,
    marketCap: null,
    quotedAt: null,
    fetchedAt,
    sourceUrl,
  };
  const source: CompanySourceReceipt = {
    id: 'market-quote',
    provider: '东方财富',
    dimension: '行情快照',
    url: sourceUrl,
    status: 'error',
    fetchedAt,
    latestDate: null,
    count: 0,
    note: '本次行情来源未返回可用结果；未取得的价格、涨跌和时间保持未知。',
    responseHashes: [],
  };
  if (market === null) {
    source.note = '主体或交易所未确认，未请求行情；目前仅支持已确认的沪深 A 股。';
    return { quote, source };
  }

  try {
    options.signal?.throwIfAborted();
    const response = await options.reader.read(
      sourceUrl,
      { signal: options.signal, headers: { Referer: 'https://quote.eastmoney.com/' } },
      responseBytes
    );
    source.responseHashes.push(response.sha256);
    source.fetchedAt = response.fetchedAt;
    quote.fetchedAt = response.fetchedAt;
    const result = objectValue(parseExactFinancialJson(response.body.toString('utf8')));
    const data = objectValue(result.data);
    if (result.rc !== '0' || !Object.keys(data).length) {
      options.reader.invalidateResponses(source.responseHashes, sourceUrl);
      source.note = '本次行情来源未返回有效记录；未采用其他主体或替代数值。';
      return { quote, source };
    }
    if (data.f57 !== run.input.securityCode) {
      options.reader.invalidateResponses(source.responseHashes, sourceUrl);
      source.note = '行情响应的证券代码与已确认主体不一致，整条行情未采用。';
      return { quote, source };
    }
    const precision =
      typeof data.f59 === 'string' && /^[0-6]$/.test(data.f59) ? Number(data.f59) : null;
    quote.price = scaledAmount(data.f43, precision, true);
    quote.high = scaledAmount(data.f44, precision, true);
    quote.low = scaledAmount(data.f45, precision, true);
    quote.change = scaledAmount(data.f169, precision);
    quote.changePercent = percentage(data.f170);
    const marketCap = normalizeMarketAmount(data.f116);
    quote.marketCap =
      marketCap && !marketCap.startsWith('-') && /[1-9]/.test(marketCap) ? marketCap : null;
    quote.quotedAt = quoteTime(data.f86, now);
    const values = [
      quote.price,
      quote.high,
      quote.low,
      quote.change,
      quote.changePercent,
      quote.marketCap,
    ];
    const available = values.filter((value) => value !== null).length;
    quote.status =
      available === 0
        ? 'unavailable'
        : available === values.length && quote.quotedAt
          ? 'available'
          : 'partial';
    source.status = quote.status === 'unavailable' ? 'empty' : quote.status;
    source.count = available ? 1 : 0;
    source.latestDate = quote.quotedAt?.slice(0, 10) || null;
    source.note =
      quote.status === 'available'
        ? '已核对证券代码；价格按来源小数位解析，市值为人民币元。时间来自行情原字段，可能为上一交易日，不保证实时。'
        : quote.status === 'partial'
          ? '已核对证券代码；仅展示有效原始字段，缺失或无效字段保持未知。行情时间来自原字段，未用抓取时间替代，不保证实时。'
          : '已核对证券代码，但来源没有可用行情数值；缺失值未补为零，未推测行情时间。';
  } catch (error) {
    if (!(options.signal?.aborted || options.reader.dependencies.signal?.aborted))
      options.reader.invalidateResponses(source.responseHashes, sourceUrl);
    if (
      options.signal?.aborted ||
      options.reader.dependencies.signal?.aborted ||
      (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
    )
      source.note = '本次行情读取超时或已取消；未取得的行情字段保持未知。';
    else if (error instanceof ApiFault && error.code === 'COMPANY_SOURCE_TOO_LARGE')
      source.note = '行情响应超过本次两 MB 上限，已停止读取；未采用截断结果。';
    else if (error instanceof ApiFault && error.code === 'CONTEXT_SOURCE_BUDGET')
      source.note = '已达到本次公开读取请求上限，未请求额外行情。';
    else if (error instanceof SyntaxError)
      source.note = '行情响应格式未通过验证；未推测价格或行情时间。';
  }
  return { quote, source };
}
