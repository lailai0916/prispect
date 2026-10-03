import assert from 'node:assert/strict';
import test from 'node:test';
import {
  eastmoneyRows,
  PublicCompanyReader,
  retrieveCompanyContext,
} from '../server/company-context-sources.js';
import { PublicResponseCache, publicRequestCacheKey } from '../server/public-response-cache.js';

const url = 'https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=fixture';
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferredFetch() {
  const requests: { signal: AbortSignal; resolve: (response: Response) => void }[] = [];
  const fetcher: typeof fetch = async (_url, init) =>
    new Promise<Response>((resolve) => {
      requests.push({ signal: init!.signal!, resolve });
    });
  return { fetcher, requests };
}

test('public responses reuse hashes and original acquired time without another request', async () => {
  let calls = 0,
    instant = Date.parse('2026-10-03T00:00:00Z');
  const fetcher: typeof fetch = async () => {
    calls++;
    return new Response('source');
  };
  const options = { fetch: fetcher, now: () => new Date(instant) };
  const first = new PublicCompanyReader(options);
  const acquired = await first.read(url);
  instant += 60_000;
  acquired.body.fill(120);
  const second = new PublicCompanyReader(options, 0);
  const cached = await second.read(url);
  assert.equal(cached.body.toString(), 'source');
  assert.equal(cached.sha256, acquired.sha256);
  assert.equal(cached.fetchedAt, acquired.fetchedAt);
  assert.equal(cached.cache, 'hit');
  assert.equal(second.cacheHits, 1);
  assert.equal(second.requests, 0);
  assert.equal(calls, 1);
});

test('quotes expire quickly, source failures and malformed JSON are retried', async () => {
  let instant = Date.parse('2026-10-03T00:00:00Z'),
    calls = 0;
  const fetcher: typeof fetch = async () => new Response(String(++calls));
  const options = { fetch: fetcher, now: () => new Date(instant) };
  const quote = 'https://push2.eastmoney.com/api/qt/stock/get?secid=1.600519';
  await new PublicCompanyReader(options).read(quote);
  instant += 14_000;
  assert.equal((await new PublicCompanyReader(options).read(quote)).cache, 'hit');
  instant += 1_000;
  assert.equal((await new PublicCompanyReader(options).read(quote)).body.toString(), '2');
  for (const failed of [
    () => new Response('down', { status: 503 }),
    () => new Response('{'),
    () => new Response('{"success":false}'),
  ]) {
    let failures = 0;
    const failer: typeof fetch = async () => {
      failures++;
      return failed();
    };
    const reader = new PublicCompanyReader({ fetch: failer });
    await assert.rejects(reader.json(url));
    await assert.rejects(reader.json(url));
    assert.equal(failures, 2);
    assert.equal(reader.cacheHits, 0);
  }
});

test('manual refresh bypasses a cached source and supersedes an older pending retrieval', async () => {
  const { fetcher, requests } = deferredFetch();
  const old = new PublicCompanyReader({ fetch: fetcher }).read(url);
  await tick();
  const fresh = new PublicCompanyReader({ fetch: fetcher, bypassCache: true }).read(url);
  await tick();
  assert.equal(requests.length, 2);
  requests[1]!.resolve(new Response('new'));
  assert.equal((await fresh).cache, 'miss');
  requests[0]!.resolve(new Response('old'));
  assert.equal((await old).body.toString(), 'old');
  assert.equal(
    (await new PublicCompanyReader({ fetch: fetcher }).read(url)).body.toString(),
    'new'
  );
  const again = new PublicCompanyReader({ fetch: fetcher, bypassCache: true }).read(url);
  await tick();
  assert.equal(requests.length, 3);
  requests[2]!.resolve(new Response('newer'));
  await again;
});

test('one shared consumer cancelling does not cancel another, all cancelling aborts and allows retry', async () => {
  const { fetcher, requests } = deferredFetch();
  const controller = new AbortController();
  const first = new PublicCompanyReader({ fetch: fetcher, signal: controller.signal });
  const second = new PublicCompanyReader({ fetch: fetcher });
  const a = first.read(url),
    b = second.read(url);
  await tick();
  assert.equal(requests.length, 1);
  controller.abort(new Error('cancel first'));
  await assert.rejects(a, /cancel first/);
  assert.equal(requests[0]!.signal.aborted, false);
  requests[0]!.resolve(new Response('retained'));
  assert.equal((await b).cache, 'shared');
  assert.equal(first.requests, 1);
  assert.equal(second.requests, 0);
  assert.equal(second.sharedReads, 1);

  const alone = new AbortController();
  const abandoned = new PublicCompanyReader({ fetch: fetcher, signal: alone.signal }).read(
    `${url}&fresh=1`
  );
  await tick();
  alone.abort();
  await assert.rejects(abandoned);
  assert.equal(requests[1]!.signal.aborted, true);
  const retry = new PublicCompanyReader({ fetch: fetcher }).read(`${url}&fresh=1`);
  await tick();
  assert.equal(requests.length, 3);
  requests[2]!.resolve(new Response('retry'));
  assert.equal((await retry).body.toString(), 'retry');
  requests[1]!.resolve(new Response('cancelled old'));
  await tick();
  assert.equal(
    (await new PublicCompanyReader({ fetch: fetcher }).read(`${url}&fresh=1`)).body.toString(),
    'retry'
  );
});

test('cached and concurrent responses still respect caller size limits and network budgets', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return new Response('123456');
  };
  await new PublicCompanyReader({ fetch: fetcher }).read(url, {}, 10);
  const limited = new PublicCompanyReader({ fetch: fetcher });
  await assert.rejects(
    limited.read(url, {}, 5),
    (error: any) => error.code === 'COMPANY_SOURCE_TOO_LARGE'
  );
  assert.equal(limited.requests, 0);
  const exhausted = new PublicCompanyReader({ fetch: fetcher }, 0);
  await assert.rejects(
    exhausted.read(`${url}&new=1`),
    (error: any) => error.code === 'CONTEXT_SOURCE_BUDGET'
  );
  assert.equal(exhausted.requests, 0);
  assert.equal(calls, 1);

  const deferred = deferredFetch();
  const small = new PublicCompanyReader({ fetch: deferred.fetcher }).read(url, {}, 5);
  const large = new PublicCompanyReader({ fetch: deferred.fetcher }).read(url, {}, 10);
  await tick();
  assert.equal(deferred.requests.length, 2);
  deferred.requests.forEach((request) => request.resolve(new Response('123456')));
  await assert.rejects(small);
  assert.equal((await large).body.length, 6);
});

test('public request keys distinguish issuer, period, method, body and headers and reject private requests', async () => {
  const announcement = new URL('https://www.cninfo.com.cn/new/hisAnnouncement/query');
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'stock=600519%2Cgssh0600519&pageNum=1&seDate=2025-01-01%7E2026-01-01',
  };
  const key = publicRequestCacheKey(announcement, init, 'json');
  assert.ok(key);
  assert.notEqual(
    key,
    publicRequestCacheKey(
      announcement,
      { ...init, body: init.body.replace('pageNum=1', 'pageNum=2') },
      'json'
    )
  );
  assert.equal(
    publicRequestCacheKey(
      announcement,
      { ...init, body: `${init.body}&searchkey=private+note` },
      'json'
    ),
    null
  );
  for (const headers of [
    new Headers({ Authorization: 'Bearer secret' }),
    new Headers({ Cookie: 'owner=alice' }),
    new Headers({ 'X-Private': 'private' }),
  ])
    assert.equal(publicRequestCacheKey(new URL(url), { headers }, 'bytes'), null);
  assert.equal(publicRequestCacheKey(new URL(`${url}&api_key=secret`), {}, 'bytes'), null);
  assert.equal(publicRequestCacheKey(new URL(url), { credentials: 'include' }, 'bytes'), null);
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return new Response('credentialed');
  };
  const reader = new PublicCompanyReader({ fetch: fetcher });
  await reader.read(url, { headers: { Authorization: 'Bearer private' } });
  await reader.read(url, { headers: { Authorization: 'Bearer private' } });
  assert.equal(calls, 2);
  let posts = 0;
  const publicFetcher: typeof fetch = async () => {
    posts++;
    return new Response('{"announcements":[]}');
  };
  await new PublicCompanyReader({ fetch: publicFetcher }).json(announcement.href, init);
  assert.equal(
    (await new PublicCompanyReader({ fetch: publicFetcher }).json(announcement.href, init)).cache,
    'hit'
  );
  assert.equal(posts, 1);
});

test('injected source providers are isolated and cache eviction is bounded by count and bytes', async () => {
  const a: typeof fetch = async () => new Response('A');
  const b: typeof fetch = async () => new Response('B');
  await new PublicCompanyReader({ fetch: a }).read(url);
  assert.equal((await new PublicCompanyReader({ fetch: b }).read(url)).body.toString(), 'B');
  const cache = new PublicResponseCache(2, 6);
  let calls = 0;
  const read = (key: string, body = '123') =>
    cache.read({
      key,
      maximum: 100,
      ttlMs: 1000,
      now: () => new Date(0),
      signal: new AbortController().signal,
      onStart: () => {
        calls++;
      },
      load: async () => ({
        body: Buffer.from(body),
        url,
        sha256: key,
        fetchedAt: new Date(0).toISOString(),
      }),
    });
  await read('one');
  await read('two');
  await read('one');
  await read('three');
  assert.equal((await read('two')).cache, 'miss');
  assert.equal(calls, 4);
  await read('oversized', '1234567');
  assert.equal((await read('oversized', '1234567')).cache, 'miss');
});

test('pending producer bound keeps hits and subscribers available but rejects new misses', async () => {
  const cache = new PublicResponseCache(4, 100, 1);
  const options = (key: string, load: () => Promise<any>) => ({
    key,
    load,
    maximum: 100,
    ttlMs: 1000,
    now: () => new Date(0),
    signal: new AbortController().signal,
    onStart: () => undefined,
  });
  const value = {
    body: Buffer.from('public'),
    url,
    sha256: 'hash',
    fetchedAt: new Date(0).toISOString(),
  };
  await cache.read(options('cached', async () => value));
  let resolve!: (result: typeof value) => void;
  const pending = cache.read(
    options(
      'pending',
      () =>
        new Promise((finish) => {
          resolve = finish;
        })
    )
  );
  await tick();
  await assert.rejects(
    cache.read(options('another', async () => value)),
    (error: any) => error.code === 'CONTEXT_SOURCE_BUSY'
  );
  assert.equal((await cache.read(options('cached', async () => value))).cache, 'hit');
  const joined = cache.read(options('pending', async () => value));
  resolve(value);
  assert.equal((await joined).cache, 'shared');
  await pending;
  assert.equal((await cache.read(options('another', async () => value))).cache, 'miss');
});

test('rejected financial shapes retry and exact key discard preserves other source responses', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () =>
    new Response(
      ++calls === 1 ? '{"success":true,"result":{}}' : '{"success":true,"result":{"data":[]}}'
    );
  const reader = new PublicCompanyReader({ fetch: fetcher });
  await assert.rejects(eastmoneyRows(reader, 'fixture', ''));
  assert.deepEqual((await eastmoneyRows(reader, 'fixture', '')).rows, []);
  assert.equal(calls, 2);
  const a = await reader.json(`${url}&scope=A`);
  const b = await reader.json(`${url}&scope=B`);
  assert.equal(a.sha256, b.sha256);
  reader.discardResponse(`${url}&scope=A`, {}, 'json', a.sha256);
  assert.equal((await reader.json(`${url}&scope=B`)).cache, 'hit');
  assert.equal((await reader.json(`${url}&scope=A`)).cache, 'miss');
});

test('an HTML error page at an official PDF URL is not retained and corrected bytes retry', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () =>
    new Response(++calls === 1 ? '<html>blocked</html>' : '%PDF-fixture');
  const reader = new PublicCompanyReader({ fetch: fetcher });
  const pdf = 'https://static.cninfo.com.cn/finalpage/2026-10-03/fixture.PDF';
  await assert.rejects(reader.read(pdf), (error: any) => error.code === 'CONTEXT_SOURCE_FORMAT');
  assert.equal((await reader.read(pdf)).body.toString(), '%PDF-fixture');
  assert.equal(calls, 2);
});

test('context source receipts retain acquisition dates when public responses are reused', async () => {
  let instant = Date.parse('2026-10-03T00:00:00Z'),
    calls = 0;
  const fetcher: typeof fetch = async (address) => {
    calls++;
    const hostname = new URL(String(address)).hostname;
    if (hostname === 'datacenter.eastmoney.com')
      return new Response('{"success":true,"result":{"data":[]}}');
    if (hostname === 'www.cninfo.com.cn')
      return new Response('{"announcements":[],"totalAnnouncement":0}');
    if (hostname === 'quotes.sina.cn')
      return new Response('{"result":{"data":{"report_list":{}}}}');
    if (hostname === 'search-api-web.eastmoney.com')
      return new Response('{"result":{"cmsArticleWebOld":[]}}');
    if (hostname === 'np-anotice-stock.eastmoney.com') return new Response('{"data":{"list":[]}}');
    return new Response('<html></html>');
  };
  const identity = {
    securityCode: '600519',
    orgId: 'gssh0600519',
    shortName: '贵州茅台',
    companyName: '贵州茅台股份有限公司',
    exchange: 'sse' as const,
    sourceUrl: 'https://www.cninfo.com.cn/new/information/topSearch/query',
  };
  const dependencies = { fetch: fetcher, now: () => new Date(instant) };
  const first = await retrieveCompanyContext(identity, dependencies);
  const count = calls;
  instant += 60_000;
  const second = await retrieveCompanyContext(identity, dependencies);
  assert.equal(calls, count);
  assert.notEqual(second.fetchedAt, first.fetchedAt);
  for (const source of second.sources.filter((item) => item.responseHashes.length)) {
    assert.equal(source.fetchedAt, '2026-10-03T00:00:00.000Z');
    assert.deepEqual(
      source.responseHashes,
      first.sources.find((item) => item.id === source.id)!.responseHashes
    );
  }
});
