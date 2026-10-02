import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { PublicCompanyReader } from '../server/company-context-sources.js';
import { retrieveCompanyMarketQuote } from '../server/company-market-quote.js';

const now = new Date('2026-10-02T02:00:00.000Z');
const quotedAt = '2026-09-30T07:00:00.000Z';
function company(code = '300893', exchange: 'sse' | 'szse' = 'szse'): CompanyResearchRun {
  return {
    id: 'quote-fixture',
    input: { securityCode: code, orgId: 'confirmed-org', year: 2025 },
    identity: {
      securityCode: code,
      orgId: 'confirmed-org',
      shortName: '测试公司',
      companyName: null,
      exchange,
      sourceUrl: 'https://www.cninfo.com.cn/',
    },
    status: 'ready',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-called' },
  };
}
function rawQuote(overrides: Record<string, unknown> = {}, code = '300893') {
  return {
    rc: 0,
    data: {
      f57: code,
      f59: 2,
      f43: 2467,
      f44: 2530,
      f45: 2430,
      f169: -33,
      f170: -132,
      f116: 12_345_678_900,
      f86: Date.parse(quotedAt) / 1000,
      ...overrides,
    },
  };
}
const reader = (fn: (url: string, init?: RequestInit) => Response | Promise<Response>) =>
  new PublicCompanyReader({
    now: () => now,
    fetch: async (url, init) => fn(String(url), init),
  });
const json = (data: unknown) => new Response(JSON.stringify(data));
const emptyValues = (quote: Awaited<ReturnType<typeof retrieveCompanyMarketQuote>>['quote']) => {
  for (const key of [
    'price',
    'change',
    'changePercent',
    'high',
    'low',
    'marketCap',
    'quotedAt',
  ] as const)
    assert.equal(quote[key], null, key);
};

test('one known-host SSE/SZSE request renders exact fields and keeps the actual holiday timestamp', async () => {
  for (const [code, exchange, prefix] of [
    ['300893', 'szse', '0'],
    ['600519', 'sse', '1'],
  ] as const) {
    let calls = 0;
    const raw = JSON.stringify(rawQuote({}, code));
    const publicReader = reader((url, init) => {
      calls++;
      const target = new URL(url);
      assert.equal(target.protocol, 'https:');
      assert.equal(target.hostname, 'push2.eastmoney.com');
      assert.equal(target.pathname, '/api/qt/stock/get');
      assert.equal(target.searchParams.get('secid'), `${prefix}.${code}`);
      assert.equal(target.searchParams.get('fields'), 'f57,f59,f43,f44,f45,f169,f170,f116,f86');
      assert.equal(init?.redirect, 'error');
      assert.ok(init?.signal);
      assert.equal(init?.body, undefined);
      return new Response(raw);
    });
    const run = company(code, exchange);
    const before = structuredClone(run);
    const { quote, source } = await retrieveCompanyMarketQuote(run, { reader: publicReader });
    assert.equal(calls, 1);
    assert.equal(publicReader.requests, 1);
    assert.deepEqual(run, before);
    assert.deepEqual(
      [
        quote.status,
        quote.price,
        quote.high,
        quote.low,
        quote.change,
        quote.changePercent,
        quote.marketCap,
      ],
      ['available', '24.67', '25.30', '24.30', '-0.33', -1.32, '12345678900.00']
    );
    assert.equal(quote.quotedAt, quotedAt);
    assert.equal(quote.fetchedAt, now.toISOString());
    assert.equal(source.status, 'available');
    assert.equal(source.count, 1);
    assert.equal(source.latestDate, '2026-09-30');
    assert.deepEqual(source.responseHashes, [createHash('sha256').update(raw).digest('hex')]);
    assert.match(source.note, /不保证实时/);
  }
});

test('source precision and large market cap survive without floating point amount conversion', async () => {
  const raw = JSON.stringify(
    rawQuote({ f59: 3, f43: 12345, f169: 0, f170: 0, f116: '9007199254740993123.01' })
  ).replace('"9007199254740993123.01"', '9007199254740993123.01');
  const { quote } = await retrieveCompanyMarketQuote(company(), {
    reader: reader(() => new Response(raw)),
  });
  assert.equal(quote.price, '12.345');
  assert.equal(quote.change, '0.000');
  assert.equal(quote.changePercent, 0);
  assert.equal(quote.marketCap, '9007199254740993123.01');
});

test('missing precision withholds only dependent amounts and never uses fetch time as quote time', async () => {
  const { quote, source } = await retrieveCompanyMarketQuote(company(), {
    reader: reader(() => json(rawQuote({ f59: '-', f86: '-' }))),
  });
  assert.equal(quote.status, 'partial');
  assert.equal(source.status, 'partial');
  for (const key of ['price', 'high', 'low', 'change', 'quotedAt'] as const)
    assert.equal(quote[key], null);
  assert.equal(quote.changePercent, -1.32);
  assert.equal(quote.marketCap, '12345678900.00');
  assert.equal(source.latestDate, null);
});

test('empty markers and unusable zero prices stay unknown; malformed/future timestamps are withheld', async () => {
  const { quote, source } = await retrieveCompanyMarketQuote(company(), {
    reader: reader(() =>
      json(rawQuote({ f43: '-', f44: 0, f45: -1, f169: '-', f170: '-', f116: 0, f86: '-' }))
    ),
  });
  assert.equal(quote.status, 'unavailable');
  assert.equal(source.status, 'empty');
  assert.equal(source.count, 0);
  assert.equal(source.responseHashes.length, 1);
  emptyValues(quote);
  for (const time of [
    Date.parse(quotedAt),
    Math.floor(now.getTime() / 1000) + 3600,
    -1,
    'not a time',
  ]) {
    const result = await retrieveCompanyMarketQuote(company(), {
      reader: reader(() => json(rawQuote({ f86: time }))),
    });
    assert.equal(result.quote.quotedAt, null);
    assert.equal(result.quote.status, 'partial');
  }
});

test('wrong issuer, source error code and malformed data cannot partially leak a quote', async () => {
  for (const raw of [
    JSON.stringify(rawQuote({ f57: '600519' })),
    JSON.stringify({ rc: 1, data: rawQuote().data }),
    JSON.stringify({ rc: 0, data: null }),
    JSON.stringify({ rc: 0, data: ['300893', 2467] }),
    '<html>PRIVATE_SENTINEL upstream error</html>',
  ]) {
    let calls = 0;
    const result = await retrieveCompanyMarketQuote(company(), {
      reader: reader(() => {
        calls++;
        return new Response(raw);
      }),
    });
    assert.equal(calls, 1);
    assert.equal(result.quote.status, 'unavailable');
    assert.equal(result.source.status, 'error');
    assert.equal(result.source.count, 0);
    assert.equal(result.source.responseHashes.length, 1);
    emptyValues(result.quote);
    assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false);
  }
});

test('unconfirmed identities, mismatched snapshots and unsupported markets do not request another company', async () => {
  const runs = [company(), company(), company(), company(), company(), company('600519', 'szse')];
  delete runs[0]!.identity;
  runs[1]!.identity!.orgId = 'wrong-org';
  runs[2]!.informationGap = { name: '未确认', reason: '主体不明确' };
  runs[3]!.identity!.exchange = 'bse';
  runs[4]!.context = { securityCode: '600519', orgId: 'wrong-org' } as NonNullable<
    CompanyResearchRun['context']
  >;
  for (const run of runs) {
    const publicReader = reader(() => {
      throw new Error('must not request');
    });
    const result = await retrieveCompanyMarketQuote(run, { reader: publicReader });
    assert.equal(publicReader.requests, 0);
    assert.equal(result.source.responseHashes.length, 0);
    assert.equal(result.quote.status, 'unavailable');
    emptyValues(result.quote);
  }
});

test('HTTP blocks and oversized bodies stop after the single request with honest unavailable receipts', async () => {
  for (const response of [
    new Response('SECRET_ACCESS_ERROR', { status: 403 }),
    new Response('SECRET_ACCESS_ERROR', { status: 429 }),
    new Response('tiny', { headers: { 'content-length': '2000001' } }),
    new Response('x'.repeat(2_000_001)),
  ]) {
    let calls = 0;
    const result = await retrieveCompanyMarketQuote(company(), {
      reader: reader(() => {
        calls++;
        return response;
      }),
    });
    assert.equal(calls, 1);
    assert.equal(result.source.status, 'error');
    assert.equal(result.source.responseHashes.length, 0);
    assert.equal(result.quote.status, 'unavailable');
    assert.equal(JSON.stringify(result).includes('SECRET_ACCESS_ERROR'), false);
    emptyValues(result.quote);
  }
});

test('abort cancels the actual request and preserves missing fields; spent shared budgets forbid extra fetches', async () => {
  const aborter = new AbortController();
  let calls = 0;
  const publicReader = reader((_url, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      aborter.abort(new DOMException('PRIVATE_SENTINEL', 'AbortError'));
    });
  });
  const result = await retrieveCompanyMarketQuote(company(), {
    reader: publicReader,
    signal: aborter.signal,
  });
  assert.equal(calls, 1);
  assert.equal(result.source.status, 'error');
  assert.match(result.source.note, /取消/);
  assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false);
  emptyValues(result.quote);
  const spentReader = new PublicCompanyReader(
    {
      now: () => now,
      fetch: async () => {
        throw new Error('must not fetch');
      },
    },
    0
  );
  const spent = await retrieveCompanyMarketQuote(company(), { reader: spentReader });
  assert.equal(spent.quote.status, 'unavailable');
  assert.match(spent.source.note, /请求上限/);
});
