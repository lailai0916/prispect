import { createHash } from 'node:crypto';
import type { CompanyIdentity } from '../shared/contracts.js';
import {
  COMPANY_MARKET_WARNINGS as W,
  FINANCIAL_FIELD_SOURCES,
  financialStatementTables,
  financialMethodNote,
  type CompanyFinancialContext,
  type CompanyFinancialMetric,
  type CompanyFinancialSource,
  type CompanyFinancialSourceId,
  type CompanyFinancialYear,
} from '../shared/company-market.js';
import { boundedBody, type CompanySourceDependencies } from './company-sources.js';

export const COMPANY_MARKET_LIMITS = {
  requests: 3,
  responseBytes: 2_000_000,
  timeoutMs: 10_000,
  years: 6,
  rows: 60,
} as const;
const ENDPOINT = 'https://datacenter.eastmoney.com/securities/api/data/v1/get';
const sourceIds: CompanyFinancialSourceId[] = ['income', 'cashflow', 'balance'];
const fields = Object.keys(FINANCIAL_FIELD_SOURCES) as CompanyFinancialMetric[];
const blankAmounts = () =>
  Object.fromEntries(fields.map((field) => [field, null])) as CompanyFinancialYear['amounts'];
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

class MarketFault extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Preserve all unquoted JSON number tokens before parsing; amounts never pass through Number. */
export function parseExactFinancialJson(text: string): unknown {
  let transformed = '';
  let start = 0;
  let inString = false;
  let escaped = false;
  for (let position = 0; position < text.length; position++) {
    const char = text[position]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char !== '-' && !/\d/.test(char)) continue;
    const token = text.slice(position).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)?.[0];
    if (!token || token.length > 100) throw new MarketFault('MARKET_RESPONSE_FORMAT');
    transformed += text.slice(start, position) + JSON.stringify(token);
    position += token.length - 1;
    start = position + 1;
  }
  return JSON.parse(transformed + text.slice(start));
}

/** Canonical exact CNY yuan with cents; fractional cents are withheld rather than rounded. */
export function normalizeMarketAmount(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 80) return null;
  const match = value.match(/^(-?)(\d{1,40})(?:\.(\d{1,40}))?(?:[eE]([+-]?\d{1,3}))?$/);
  if (!match) return null;
  const exponent = Number(match[4] || '0');
  if (Math.abs(exponent) > 20) return null;
  const whole = match[2]!;
  const fraction = match[3] || '';
  const digits = whole + fraction;
  const decimal = whole.length + exponent;
  const expandedWhole = decimal <= 0 ? '0' : digits.slice(0, decimal).padEnd(decimal, '0');
  const expandedFraction = decimal < 0 ? '0'.repeat(-decimal) + digits : digits.slice(decimal);
  if (/[1-9]/.test(expandedFraction.slice(2))) return null;
  const integer = expandedWhole.replace(/^0+(?=\d)/, '');
  if (integer.length > 20) return null;
  const cents = expandedFraction.slice(0, 2).padEnd(2, '0');
  return `${match[1] && /[1-9]/.test(integer + cents) ? '-' : ''}${integer}.${cents}`;
}

interface TableYear {
  year: number;
  amounts: Partial<CompanyFinancialYear['amounts']>;
  netProfit: string | null;
  dates: { noticeDate: string | null; updatedAt: string | null };
}
interface TableResult {
  source: CompanyFinancialSource;
  organizationCode: string | null;
  organizationType: string | null;
  rows: Map<number, TableYear>;
  warnings: string[];
}
const savedDate = (value: unknown): string | null =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?$/.test(value)
    ? value
    : null;

function tableRows(
  data: unknown,
  id: CompanyFinancialSourceId,
  expectedCode: string,
  secucode: string,
  requestedYear: number
): Pick<TableResult, 'rows' | 'organizationCode' | 'organizationType' | 'warnings'> {
  if (
    !record(data) ||
    data.success !== true ||
    !record(data.result) ||
    !Array.isArray(data.result.data)
  )
    throw new MarketFault('MARKET_RESPONSE_FORMAT');
  const rows = data.result.data;
  if (rows.length > COMPANY_MARKET_LIMITS.rows || !rows.every(record))
    throw new MarketFault('MARKET_RESPONSE_FORMAT');
  if (!rows.length)
    return { rows: new Map(), organizationCode: null, organizationType: null, warnings: [] };
  if (rows.some((row) => row.SECUCODE !== secucode || row.SECURITY_CODE !== expectedCode))
    throw new MarketFault('MARKET_IDENTITY_MISMATCH');
  if (
    rows.some(
      (row) =>
        typeof row.ORG_CODE !== 'string' ||
        !/^\d{1,30}$/.test(row.ORG_CODE) ||
        typeof row.ORG_TYPE !== 'string' ||
        !row.ORG_TYPE ||
        row.ORG_TYPE.length > 40
    )
  )
    throw new MarketFault('MARKET_IDENTITY_UNCONFIRMED');
  const organizations = new Set(rows.map((row) => row.ORG_CODE as string));
  const industries = new Set(rows.map((row) => row.ORG_TYPE as string));
  if (organizations.size !== 1 || industries.size !== 1)
    throw new MarketFault('MARKET_IDENTITY_MISMATCH');
  const organizationCode = [...organizations][0]!;
  const organizationType = [...industries][0]!;
  const recentYears = new Set(
    [
      ...new Set(
        rows
          .filter((row) => row.REPORT_TYPE === '年报')
          .map((row) => savedDate(row.REPORT_DATE)?.match(/^(\d{4})-12-31(?: |T|$)/)?.[1])
          .filter((year) => year && Number(year) <= requestedYear && Number(year) >= 2000)
          .map(Number)
      ),
    ]
      .sort((a, b) => b - a)
      .slice(0, COMPANY_MARKET_LIMITS.years)
  );
  const selected = new Map<number, TableYear>();
  const warnings = new Set<string>();
  const conflicts = new Set<number>();
  for (const row of rows) {
    if (row.REPORT_TYPE !== '年报') continue;
    const date = savedDate(row.REPORT_DATE);
    if (!date || !/^\d{4}-12-31(?: |T|$)/.test(date))
      throw new MarketFault('MARKET_PERIOD_UNSUPPORTED');
    const year = Number(date.slice(0, 4));
    if (year > requestedYear || year < 2000 || !recentYears.has(year)) continue;
    if (row.CURRENCY !== 'CNY') throw new MarketFault('MARKET_CURRENCY_UNSUPPORTED');
    const amounts: TableYear['amounts'] = {};
    for (const key of fields.filter((key) => FINANCIAL_FIELD_SOURCES[key].sourceId === id)) {
      const amount = normalizeMarketAmount(row[FINANCIAL_FIELD_SOURCES[key].field]);
      amounts[key] = amount;
      if (amount === null) warnings.add(W.amount.zh);
    }
    const candidate: TableYear = {
      year,
      amounts,
      netProfit: id === 'balance' ? null : normalizeMarketAmount(row.NETPROFIT),
      dates: { noticeDate: savedDate(row.NOTICE_DATE), updatedAt: savedDate(row.UPDATE_DATE) },
    };
    const previous = selected.get(year);
    if (
      previous &&
      (JSON.stringify(previous.amounts) !== JSON.stringify(amounts) ||
        previous.netProfit !== candidate.netProfit)
    ) {
      conflicts.add(year);
      warnings.add(W.duplicate.zh);
    } else if (!previous || (candidate.dates.updatedAt || '') > (previous.dates.updatedAt || ''))
      selected.set(year, candidate);
  }
  for (const year of conflicts) selected.delete(year);
  return { rows: selected, organizationCode, organizationType, warnings: [...warnings] };
}

/** Three bounded GETs: income resolves the schema, then cash/balance load in parallel. */
export async function retrieveCompanyFinancialContext(
  identity: CompanyIdentity,
  requestedYear: number,
  dependencies: CompanySourceDependencies = {}
): Promise<CompanyFinancialContext> {
  const now = () => (dependencies.now?.() || new Date()).toISOString();
  const context: CompanyFinancialContext = {
    source: 'eastmoney-public-web',
    status: 'unavailable',
    securityCode: identity.securityCode,
    exchange: identity.exchange,
    requestedYear,
    retrievedAt: now(),
    identity: { status: 'unconfirmed', organizationCode: null, organizationType: null },
    years: [],
    sources: [],
    warnings: [W.scope.zh, W.hash.zh, W.liquidity.zh],
  };
  const suffix = identity.exchange === 'sse' ? 'SH' : identity.exchange === 'szse' ? 'SZ' : null;
  if (!suffix) {
    context.status = 'unsupported';
    context.warnings.push(W.industry.zh);
    return context;
  }
  if (
    !/^\d{6}$/.test(identity.securityCode) ||
    !Number.isInteger(requestedYear) ||
    requestedYear < 2000 ||
    requestedYear > new Date().getUTCFullYear() ||
    (suffix === 'SH'
      ? !/^(60|68)/.test(identity.securityCode)
      : !/^(00|30)/.test(identity.securityCode))
  ) {
    context.identity.status = 'conflict';
    context.warnings.push(W.identity.zh);
    return context;
  }
  const secucode = `${identity.securityCode}.${suffix}`;
  const budget = dependencies.budget || { used: 0, maximum: COMPANY_MARKET_LIMITS.requests };
  // Optional context does not spend an incomplete allocation needed by official sources.
  const budgetUnavailable = budget.maximum - budget.used < COMPANY_MARKET_LIMITS.requests;
  let tables = financialStatementTables(identity.shortName);
  const readTable = async (id: CompanyFinancialSourceId): Promise<TableResult> => {
    const query = new URLSearchParams({
      reportName: tables[id],
      columns: 'ALL',
      filter: `(SECUCODE="${secucode}")(REPORT_TYPE="年报")`,
      pageNumber: '1',
      pageSize: String(COMPANY_MARKET_LIMITS.rows),
      sortTypes: '-1',
      sortColumns: 'REPORT_DATE',
      source: 'HSF10',
      client: 'PC',
    });
    const source: CompanyFinancialSource = {
      id,
      status: 'failed',
      requestUrl: `${ENDPOINT}?${query}`,
      retrievedAt: now(),
    };
    const result: TableResult = {
      source,
      organizationCode: null,
      organizationType: null,
      rows: new Map(),
      warnings: [],
    };
    try {
      if (dependencies.signal?.aborted) throw new MarketFault('MARKET_CANCELLED');
      if (budgetUnavailable || budget.used >= budget.maximum)
        throw new MarketFault('MARKET_REQUEST_BUDGET');
      budget.used++;
      const signal = AbortSignal.any([
        AbortSignal.timeout(COMPANY_MARKET_LIMITS.timeoutMs),
        ...(dependencies.signal ? [dependencies.signal] : []),
      ]);
      const response = await (dependencies.fetch || fetch)(source.requestUrl, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new MarketFault(
          response.status === 429
            ? 'MARKET_RATE_LIMITED'
            : response.status === 403
              ? 'MARKET_ACCESS_RESTRICTED'
              : 'MARKET_SOURCE_HTTP'
        );
      }
      const bytes = await boundedBody(response, COMPANY_MARKET_LIMITS.responseBytes);
      source.sha256 = createHash('sha256').update(bytes).digest('hex');
      source.retrievedAt = now();
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      Object.assign(
        result,
        tableRows(parseExactFinancialJson(text), id, identity.securityCode, secucode, requestedYear)
      );
      source.status = result.rows.size ? 'available' : 'empty';
      if (source.status === 'empty' && result.warnings.includes(W.duplicate.zh)) {
        source.status = 'failed';
        source.errorCode = 'MARKET_ANNUAL_CONFLICT';
      }
    } catch (error) {
      if (record(error) && error.code === 'COMPANY_PROGRESS_STORAGE') throw error;
      source.errorCode = dependencies.signal?.aborted
        ? 'MARKET_CANCELLED'
        : error instanceof MarketFault
          ? error.code
          : signalErrorCode(error);
    }
    return result;
  };
  const income = await readTable('income');
  if (income.organizationType) tables = financialStatementTables(income.organizationType);
  const results = [income, ...(await Promise.all(sourceIds.slice(1).map(readTable)))];
  context.sources = results.map((result) => result.source);
  context.retrievedAt = now();
  const organizations = new Set(results.map((result) => result.organizationCode).filter(Boolean));
  const industries = new Set(results.map((result) => result.organizationType).filter(Boolean));
  if (
    organizations.size > 1 ||
    industries.size > 1 ||
    results.some((result) => result.source.errorCode === 'MARKET_IDENTITY_MISMATCH')
  ) {
    context.identity.status = 'conflict';
    context.warnings.push(W.identity.zh);
    return context;
  }
  context.identity = {
    status: organizations.size === 1 ? 'matched' : 'unconfirmed',
    organizationCode: [...organizations][0] || null,
    organizationType: [...industries][0] || null,
  };
  const methodNote = financialMethodNote(context.identity.organizationType || undefined);
  if (methodNote) context.warnings.push(methodNote[0]);
  const allYears = [...new Set(results.flatMap((result) => [...result.rows.keys()]))]
    .sort((a, b) => b - a)
    .slice(0, COMPANY_MARKET_LIMITS.years)
    .sort((a, b) => a - b);
  for (const year of allYears) {
    const row: CompanyFinancialYear = {
      year,
      reportDate: `${year}-12-31`,
      amounts: blankAmounts(),
      sourceIds: {},
      sourceDates: {},
      warnings: [],
    };
    for (const result of results) {
      const table = result.rows.get(year);
      if (!table) continue;
      Object.assign(row.amounts, table.amounts);
      row.sourceIds[result.source.id] = result.source.id;
      row.sourceDates![result.source.id] = table.dates;
    }
    const incomeProfit = results
      .find((result) => result.source.id === 'income')
      ?.rows.get(year)?.netProfit;
    const cashProfit = results
      .find((result) => result.source.id === 'cashflow')
      ?.rows.get(year)?.netProfit;
    if (incomeProfit != null && cashProfit != null && incomeProfit !== cashProfit) {
      row.amounts.netProfit = null;
      row.amounts.operatingCashFlow = null;
      row.warnings!.push(W.profitConflict.zh);
    } else if (incomeProfit == null || cashProfit == null) row.warnings!.push(W.profitUnchecked.zh);
    context.years.push(row);
  }
  context.warnings = [
    ...new Set([
      ...context.warnings,
      ...results.flatMap((result) => result.warnings),
      ...context.years.flatMap((row) => row.warnings || []),
    ]),
  ];
  if (
    results.some((result) => result.source.status === 'failed' || result.source.status === 'empty')
  )
    context.warnings.push(W.partial.zh);
  if (!context.years.some((row) => row.year === requestedYear))
    context.warnings.push(W.requestedYear.zh);
  const complete =
    results.every((result) => result.source.status === 'available') &&
    context.years.some((row) => row.year === requestedYear) &&
    context.years.every(
      (row) => fields.every((field) => row.amounts[field] !== null) && !row.warnings?.length
    );
  context.status = context.years.length ? (complete ? 'available' : 'partial') : 'unavailable';
  return context;
}

function signalErrorCode(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') return 'MARKET_TIMEOUT';
  if (record(error) && error.code === 'COMPANY_SOURCE_TOO_LARGE')
    return 'MARKET_RESPONSE_TOO_LARGE';
  if (
    error instanceof SyntaxError ||
    (error instanceof TypeError && /encoded data/.test(error.message))
  )
    return 'MARKET_RESPONSE_FORMAT';
  return 'MARKET_SOURCE_UNAVAILABLE';
}
