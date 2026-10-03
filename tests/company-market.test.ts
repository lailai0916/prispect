import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { CompanyIdentity } from '../shared/contracts.js';
import type { CompanyFinancialSourceId } from '../shared/company-market.js';
import { ApiFault } from '../server/validation.js';
import {
  normalizeMarketAmount,
  parseExactFinancialJson,
  retrieveCompanyFinancialContext,
} from '../server/company-market.js';

const identity: CompanyIdentity = {
  securityCode: '300893',
  exchange: 'szse',
  orgId: '9900037020',
  shortName: '测试公司',
  companyName: null,
  sourceUrl: 'https://www.cninfo.com.cn/',
};
const meta = {
  SECUCODE: '300893.SZ',
  SECURITY_CODE: '300893',
  ORG_CODE: '10000015937',
  ORG_TYPE: '通用',
  REPORT_TYPE: '年报',
  CURRENCY: 'CNY',
  REPORT_DATE: '2025-12-31 00:00:00',
  NOTICE_DATE: '2026-04-11 00:00:00',
  UPDATE_DATE: '2026-08-24 00:00:00',
};
const sourceId = (url: string): CompanyFinancialSourceId =>
  url.includes('GINCOME') ? 'income' : url.includes('CASHFLOW') ? 'cashflow' : 'balance';
const fieldRows = {
  income: { TOTAL_OPERATE_INCOME: '1000.00', NETPROFIT: '100.00', PARENT_NETPROFIT: '90.00' },
  cashflow: {
    NETPROFIT: '100.00',
    NETCASH_OPERATE: '70.00',
    NETCASH_INVEST: '-80.00',
    NETCASH_FINANCE: '15.00',
  },
  balance: {
    MONETARYFUNDS: '30.00',
    SHORT_LOAN: null,
    NONCURRENT_LIAB_1YEAR: '20.00',
    ACCOUNTS_RECE: '10.00',
    INVENTORY: '15.00',
    TOTAL_ASSETS: '500.00',
    TOTAL_LIABILITIES: '250.00',
  },
};
function response(rows: Record<string, unknown>[]): Response {
  return new Response(JSON.stringify({ success: true, result: { data: rows } }));
}
function fixture(
  alter: (id: CompanyFinancialSourceId, rows: Record<string, unknown>[]) => Response = (
    _id,
    rows
  ) => response(rows)
) {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const address = String(url);
    requests.push(address);
    assert.equal(new URL(address).hostname, 'datacenter.eastmoney.com');
    assert.equal(init?.method, 'GET');
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.redirect, 'error');
    assert.equal(
      new URL(address).searchParams.get('filter'),
      '(SECUCODE="300893.SZ")(REPORT_TYPE="年报")'
    );
    const id = sourceId(address);
    return alter(id, [{ ...meta, ...fieldRows[id] }]);
  };
  return { fetch: fetcher, requests };
}

test('market amount parsing keeps numeric tokens exact, including cents beyond Number precision', () => {
  const parsed = parseExactFinancialJson(
    '{"NETPROFIT":90071992547409.91,"n":1.0000000000000001e2,"text":"12 and \\"3\\""}'
  ) as Record<string, unknown>;
  assert.equal(parsed.NETPROFIT, '90071992547409.91');
  assert.equal(parsed.n, '1.0000000000000001e2');
  assert.equal(normalizeMarketAmount(parsed.NETPROFIT), '90071992547409.91');
  assert.equal(normalizeMarketAmount('9.007199254740992e13'), '90071992547409.92');
  assert.equal(normalizeMarketAmount('1e-2'), '0.01');
  assert.equal(normalizeMarketAmount('-8.1e1'), '-81.00');
  assert.equal(normalizeMarketAmount('0'), '0.00');
  assert.equal(normalizeMarketAmount('-0.000'), '0.00');
  for (const value of [null, undefined, 0, '1e9999', '0.001', 'NaN', '1,000'])
    assert.equal(normalizeMarketAmount(value), null);
  assert.throws(() => parseExactFinancialJson('{"n":01}'));
  assert.throws(() => parseExactFinancialJson('{"n":Infinity}'));
});

test('anonymous market context preserves table provenance, dates and missing fields without parent-profit fallback', async () => {
  const source = fixture();
  const budget = { used: 1, maximum: 32 };
  const context = await retrieveCompanyFinancialContext(identity, 2025, {
    fetch: source.fetch,
    budget,
    now: () => new Date('2026-10-02T00:00:00Z'),
  });
  assert.equal(source.requests.length, 3);
  assert.equal(budget.used, 4);
  assert.equal(context.status, 'partial');
  assert.equal(context.identity.status, 'matched');
  assert.equal(context.identity.organizationCode, meta.ORG_CODE);
  assert.equal(context.identity.organizationType, '通用');
  assert.equal(context.years[0]?.amounts.netProfit, '100.00');
  assert.equal(context.years[0]?.amounts.shortLoans, null);
  assert.equal(context.years[0]?.amounts.currentPortionDebt, '20.00');
  assert.equal(context.years[0]?.amounts.financingCashFlow, '15.00');
  assert.equal(context.years[0]?.sourceDates?.balance?.updatedAt, meta.UPDATE_DATE);
  assert.deepEqual(context.years[0]?.sourceIds, {
    income: 'income',
    cashflow: 'cashflow',
    balance: 'balance',
  });
  for (const item of context.sources) {
    const body = JSON.stringify({
      success: true,
      result: { data: [{ ...meta, ...fieldRows[item.id] }] },
    });
    assert.equal(item.sha256, createHash('sha256').update(body).digest('hex'));
    assert.equal(item.retrievedAt, '2026-10-02T00:00:00.000Z');
  }
  assert.ok(context.warnings.some((warning) => warning.includes('哈希')));
  assert.ok(context.warnings.some((warning) => warning.includes('合并')));
});

test('market data selects at most six annual CNY December periods without future-year substitution', async () => {
  const source = fixture((id) =>
    response([
      ...Array.from({ length: 10 }, (_, index) => ({
        ...meta,
        ...fieldRows[id],
        REPORT_DATE: `${2026 - index}-12-31 00:00:00`,
      })),
      { ...meta, ...fieldRows[id], REPORT_DATE: '2025-06-30 00:00:00', REPORT_TYPE: '中报' },
    ])
  );
  const context = await retrieveCompanyFinancialContext(identity, 2025, { fetch: source.fetch });
  assert.deepEqual(
    context.years.map((row) => row.year),
    [2020, 2021, 2022, 2023, 2024, 2025]
  );
  assert.ok(context.years.every((row) => row.reportDate === `${row.year}-12-31`));
});

test('market source failures remain failures, retain valid tables, and never retry rate restrictions', async () => {
  const source = fixture((id, rows) =>
    id === 'balance' ? new Response('rate limit', { status: 429 }) : response(rows)
  );
  const context = await retrieveCompanyFinancialContext(identity, 2025, { fetch: source.fetch });
  assert.equal(source.requests.length, 3);
  assert.equal(context.status, 'partial');
  assert.equal(context.years[0]?.amounts.netProfit, '100.00');
  assert.equal(context.years[0]?.amounts.monetaryFunds, null);
  assert.equal(
    context.sources.find((item) => item.id === 'balance')?.errorCode,
    'MARKET_RATE_LIMITED'
  );
  assert.equal(context.sources.find((item) => item.id === 'balance')?.status, 'failed');
  const failed = fixture(() => new Response('invalid-json'));
  const unavailable = await retrieveCompanyFinancialContext(identity, 2025, {
    fetch: failed.fetch,
  });
  assert.equal(unavailable.status, 'unavailable');
  assert.deepEqual(unavailable.years, []);
  assert.ok(unavailable.sources.every((item) => item.status === 'failed'));
  const empty = fixture(() => response([]));
  const noRows = await retrieveCompanyFinancialContext(identity, 2025, { fetch: empty.fetch });
  assert.ok(noRows.sources.every((item) => item.status === 'empty'));
  assert.notDeepEqual(
    noRows.sources.map((item) => item.status),
    unavailable.sources.map((item) => item.status)
  );
});

test('out-of-window legacy currency omissions do not discard the six recent validated annual periods', async () => {
  const source = fixture((id) =>
    response([
      ...Array.from({ length: 6 }, (_, index) => ({
        ...meta,
        ...fieldRows[id],
        REPORT_DATE: `${2025 - index}-12-31 00:00:00`,
      })),
      { ...meta, ...fieldRows[id], REPORT_DATE: '2004-12-31 00:00:00', CURRENCY: null },
    ])
  );
  const context = await retrieveCompanyFinancialContext(identity, 2025, { fetch: source.fetch });
  assert.deepEqual(
    context.years.map((row) => row.year),
    [2020, 2021, 2022, 2023, 2024, 2025]
  );
  assert.equal(context.years.at(-1)?.amounts.netProfit, '100.00');
  assert.equal(context.years.at(-1)?.amounts.operatingCashFlow, '70.00');
  assert.ok(context.sources.every((source) => source.status === 'available'));
});

test('market metadata prevents combining mismatched entities, organization codes or organization types', async () => {
  for (const changed of [
    { SECUCODE: '300893.SH' },
    { SECURITY_CODE: '600519' },
    { ORG_CODE: '10000000001' },
    { ORG_TYPE: '银行' },
  ]) {
    const source = fixture((id, rows) =>
      response(id === 'balance' ? [{ ...rows[0], ...changed }] : rows)
    );
    const context = await retrieveCompanyFinancialContext(identity, 2025, { fetch: source.fetch });
    assert.equal(context.status, 'unavailable');
    assert.equal(context.identity.status, 'conflict');
    assert.deepEqual(context.years, []);
  }
  const wrongCurrency = fixture((id, rows) =>
    response(id === 'income' ? [{ ...rows[0], CURRENCY: 'USD' }] : rows)
  );
  const partial = await retrieveCompanyFinancialContext(identity, 2025, {
    fetch: wrongCurrency.fetch,
  });
  assert.equal(partial.years[0]?.amounts.netProfit, null);
  assert.equal(partial.years[0]?.amounts.operatingCashFlow, '70.00');
});

test('financial institutions resolve their schema from income metadata without extra requests or invented fields', async () => {
  for (const [organizationType, prefix] of [
    ['银行', 'B'],
    ['保险', 'I'],
    ['证券', 'S'],
  ]) {
    const source = fixture((_id, rows) =>
      response(rows.map((row) => ({ ...row, ORG_TYPE: organizationType })))
    );
    const context = await retrieveCompanyFinancialContext(identity, 2025, { fetch: source.fetch });
    assert.equal(context.identity.organizationType, organizationType);
    assert.equal(context.status, 'partial');
    assert.equal(context.years[0]?.amounts.netProfit, '100.00');
    assert.equal(context.years[0]?.amounts.operatingCashFlow, '70.00');
    assert.equal(context.years[0]?.amounts.shortLoans, null);
    assert.equal(source.requests.length, 3);
    assert.ok(source.requests[0]!.includes('GINCOME'));
    assert.ok(source.requests.some((url) => url.includes(`${prefix}CASHFLOW`)));
    assert.ok(source.requests.some((url) => url.includes(`${prefix}BALANCE`)));
    assert.ok(context.warnings.some((warning) => warning.includes('通用筛选仅作参考')));
  }
});

test('market budget and cancellation do not send requests, and concurrent tables use a bounded body', async () => {
  const source = fixture();
  const controller = new AbortController();
  controller.abort();
  const cancelled = await retrieveCompanyFinancialContext(identity, 2025, {
    fetch: source.fetch,
    signal: controller.signal,
  });
  assert.equal(cancelled.status, 'unavailable');
  assert.equal(source.requests.length, 0);
  const budget = { used: 31, maximum: 32 };
  await retrieveCompanyFinancialContext(identity, 2025, { fetch: source.fetch, budget });
  assert.equal(
    source.requests.length,
    0,
    'optional context cannot consume the last official-source attempts'
  );
  assert.equal(budget.used, 31);
  let active = 0,
    peak = 0,
    calls = 0;
  const parallel = await retrieveCompanyFinancialContext(identity, 2025, {
    fetch: async () => {
      active++;
      calls++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active--;
      return new Response('x', { headers: { 'content-length': '3000000' } });
    },
  });
  assert.ok(parallel.sources.every((item) => item.errorCode === 'MARKET_RESPONSE_TOO_LARGE'));
  assert.equal(calls, 3);
  assert.equal(peak, 2);
});

test('market cross-table profit conflicts and duplicate annual records withhold dependent comparisons', async () => {
  const conflict = fixture((id, rows) =>
    response(id === 'cashflow' ? [{ ...rows[0], NETPROFIT: '90.00' }] : rows)
  );
  const context = await retrieveCompanyFinancialContext(identity, 2025, { fetch: conflict.fetch });
  assert.equal(context.years[0]?.amounts.netProfit, null);
  assert.equal(context.years[0]?.amounts.operatingCashFlow, null);
  assert.equal(context.years[0]?.amounts.investingCashFlow, '-80.00');
  assert.equal(context.years[0]?.amounts.revenue, '1000.00');
  assert.ok(context.years[0]?.warnings?.some((warning) => warning.includes('不一致')));
  const duplicate = fixture((id, rows) =>
    response(id === 'income' ? [...rows, { ...rows[0], NETPROFIT: '101.00' }] : rows)
  );
  const doubled = await retrieveCompanyFinancialContext(identity, 2025, { fetch: duplicate.fetch });
  assert.equal(doubled.years[0]?.amounts.netProfit, null);
  assert.equal(doubled.years[0]?.amounts.revenue, null);
  assert.equal(
    doubled.sources.find((source) => source.id === 'income')?.errorCode,
    'MARKET_ANNUAL_CONFLICT'
  );
  const missing = fixture((id, rows) =>
    response(id === 'cashflow' ? [{ ...rows[0], NETPROFIT: null }] : rows)
  );
  const unchecked = await retrieveCompanyFinancialContext(identity, 2025, { fetch: missing.fetch });
  assert.equal(unchecked.years[0]?.amounts.netProfit, '100.00');
  assert.ok(unchecked.years[0]?.warnings?.some((warning) => warning.includes('无法交叉')));
});

test('market execution-control storage errors propagate; provider refusals and timeouts remain independent failures', async () => {
  const failure = new ApiFault(503, 'COMPANY_PROGRESS_STORAGE', 'fixture storage failure');
  await assert.rejects(
    () =>
      retrieveCompanyFinancialContext(identity, 2025, {
        fetch: async () => {
          throw failure;
        },
      }),
    (error) => error === failure
  );
  for (const status of [403, 429]) {
    const source = fixture(() => new Response('restricted', { status }));
    const context = await retrieveCompanyFinancialContext(identity, 2025, { fetch: source.fetch });
    assert.equal(source.requests.length, 3, 'fixed initial table requests have no refusal retries');
    assert.ok(
      context.sources.every(
        (item) =>
          item.errorCode === (status === 403 ? 'MARKET_ACCESS_RESTRICTED' : 'MARKET_RATE_LIMITED')
      )
    );
  }
  const timeout = await retrieveCompanyFinancialContext(identity, 2025, {
    fetch: async () => {
      throw new DOMException('fixture timeout', 'TimeoutError');
    },
  });
  assert.ok(timeout.sources.every((item) => item.errorCode === 'MARKET_TIMEOUT'));
});
