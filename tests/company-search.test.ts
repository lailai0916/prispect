import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';
import { createCompanySearch } from '../server/company-search.js';
import { searchCompanies } from '../server/company-sources.js';
import type { CompanyService } from '../server/company-routes.js';
import { WorkspaceStore } from '../server/store.js';
import { ApiFault } from '../server/validation.js';
import type { AuthSession, CompanyIdentity, CompanySearchResponse } from '../shared/contracts.js';
import { COMPANY_DIRECTORY_SOURCE, type CompanyDirectory } from '../shared/company-directory.js';

const identity: CompanyIdentity = {
  securityCode: '300893',
  orgId: '9900039861',
  shortName: '松原安全',
  companyName: null,
  exchange: 'szse',
  sourceUrl: 'https://www.cninfo.com.cn/',
};
const directory: CompanyDirectory = {
  source: 'cninfo',
  sourceUrl: COMPANY_DIRECTORY_SOURCE,
  retrievedAt: new Date().toISOString(),
  sha256: 'a'.repeat(64),
  entries: [[identity.securityCode, identity.orgId, identity.shortName]],
};
const result = (
  query: string,
  candidates: CompanyIdentity[] = [identity]
): CompanySearchResponse => ({
  query,
  candidates,
  source: 'cninfo',
  limitedToListed: true,
  truncated: false,
});
const cancelled = (error: unknown) =>
  error instanceof ApiFault && error.code === 'COMPANY_CANCELLED';
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

test('public directory matches need no upstream; misses retain the bounded official fallback', async () => {
  const queries: string[] = [];
  const matcher = createCompanySearch({
    directory: {
      ...directory,
      entries: [
        ...directory.entries,
        ['600001', 'ABCFixture', 'ABC科技'],
        ['600002', 'STFixture', 'ST示例'],
        ['002594', 'BYDFixture', 'BYD'],
      ],
    },
    refreshDirectory: false,
    search: async (query, dependencies) => {
      queries.push(query);
      assert.equal(dependencies?.maxAttempts, 1);
      assert.equal(dependencies?.timeoutMs, 3500);
      return result(query, []);
    },
  });
  for (const query of ['300893', '松原', ' 松原安全 ']) {
    assert.equal((await matcher.search(query)).candidates[0]?.securityCode, '300893');
  }
  for (const [query, code] of [
    ['abc', '600001'],
    ['st', '600002'],
    ['BYD', '002594'],
  ]) {
    assert.equal((await matcher.search(query!)).candidates[0]?.securityCode, code);
  }
  assert.deepEqual(queries, []);
  for (const query of ['目录外企业', 'AAPL', '你好'])
    assert.deepEqual((await matcher.search(query)).candidates, []);
  assert.deepEqual(queries, ['目录外企业', 'AAPL', '你好']);
});

test('official search accepts English text and keeps only supported live A-share candidates', async () => {
  const queries: string[] = [];
  const rows = [
    { code: '600001', orgId: 'ABCFixture', zwjc: 'ABC科技', category: 'A股', delisted: 'false' },
    { code: 'AAPL', orgId: 'USFixture', zwjc: 'Apple', category: '美股', delisted: 'false' },
    { code: '600002', orgId: 'OldFixture', zwjc: '退市示例', category: 'A股', delisted: 'true' },
  ];
  const sourceFetch: typeof fetch = async (_url, init) => {
    const query = new URLSearchParams(String(init?.body)).get('keyWord')!;
    queries.push(query);
    return Response.json(query === 'abc' ? rows : []);
  };
  const found = await searchCompanies(' abc ', { fetch: sourceFetch });
  assert.deepEqual(
    found.candidates.map((item) => item.securityCode),
    ['600001']
  );
  for (const query of ['AAPL', '你好'])
    assert.deepEqual((await searchCompanies(query, { fetch: sourceFetch })).candidates, []);
  assert.deepEqual(queries, ['abc', 'AAPL', '你好']);
});

test('public candidate cache expires, is bounded, and never turns source failures into empty matches', async () => {
  let clock = 1_000_000;
  const calls = new Map<string, number>();
  const matcher = createCompanySearch({
    directory: null,
    now: () => clock,
    refreshDirectory: false,
    search: async (query) => {
      calls.set(query, (calls.get(query) || 0) + 1);
      if (query === 'sourceError')
        throw new ApiFault(502, 'COMPANY_SOURCE_UNAVAILABLE', 'Fixture failure');
      return result(query, query === '真实空结果' ? [] : [identity]);
    },
  });
  const initial = await matcher.search('公开结果');
  initial.candidates[0]!.shortName = 'Must not mutate the shared cache';
  assert.equal((await matcher.search('公开结果')).candidates[0]?.shortName, '松原安全');
  assert.equal(calls.get('公开结果'), 1);
  clock += 300_000;
  await matcher.search('公开结果');
  assert.equal(calls.get('公开结果'), 2);
  await matcher.search('真实空结果');
  await matcher.search('真实空结果');
  assert.equal(calls.get('真实空结果'), 1);
  clock += 15_000;
  await matcher.search('真实空结果');
  assert.equal(calls.get('真实空结果'), 2);
  await assert.rejects(matcher.search('sourceError'));
  await assert.rejects(matcher.search('sourceError'));
  assert.equal(calls.get('sourceError'), 2);
  for (let index = 0; index < 201; index++) await matcher.search(`新候选${index}`);
  await matcher.search('新候选0');
  assert.equal(calls.get('新候选0'), 2, 'Least recently used candidates are evicted');
});

test('same-query subscribers share one request and one cancelled subscriber cannot cancel another', async () => {
  const response = deferred<CompanySearchResponse>();
  let calls = 0;
  let upstreamSignal: AbortSignal | undefined;
  const matcher = createCompanySearch({
    directory: null,
    refreshDirectory: false,
    search: async (_query, dependencies) => {
      calls++;
      upstreamSignal = dependencies?.signal;
      return response.promise;
    },
  });
  const controller = new AbortController();
  const first = matcher.search('同一候选', controller.signal);
  const second = matcher.search(' 同一候选 ');
  const rejected = assert.rejects(first, cancelled);
  await Promise.resolve();
  controller.abort();
  await rejected;
  assert.equal(calls, 1);
  assert.equal(upstreamSignal?.aborted, false);
  response.resolve(result('同一候选'));
  assert.equal((await second).query, '同一候选');
  await matcher.search('同一候选');
  assert.equal(calls, 1);
});

test('last cancellation aborts the source and a late cancelled response cannot populate the cache', async () => {
  const responses = [deferred<CompanySearchResponse>(), deferred<CompanySearchResponse>()];
  const signals: AbortSignal[] = [];
  const matcher = createCompanySearch({
    directory: null,
    refreshDirectory: false,
    search: async (_query, dependencies) => {
      signals.push(dependencies!.signal!);
      return responses[signals.length - 1]!.promise;
    },
  });
  const controller = new AbortController();
  const first = matcher.search('已离开候选', controller.signal);
  const rejected = assert.rejects(first, cancelled);
  await Promise.resolve();
  controller.abort();
  await rejected;
  assert.equal(signals[0]?.aborted, true);
  const second = matcher.search('已离开候选');
  await Promise.resolve();
  assert.equal(signals.length, 2);
  responses[0]!.resolve(result('已离开候选'));
  responses[1]!.resolve(result('已离开候选'));
  await second;
});

test('a failed background refresh does not delay or erase an older public directory', async () => {
  const refresh = deferred<Response>();
  let remoteSearches = 0;
  let refreshes = 0;
  const matcher = createCompanySearch({
    directory: { ...directory, retrievedAt: new Date(0).toISOString() },
    fetch: async () => {
      refreshes++;
      return refresh.promise;
    },
    search: async (query) => {
      remoteSearches++;
      return result(query);
    },
  });
  assert.equal((await matcher.search('300893')).candidates[0]?.shortName, '松原安全');
  assert.equal(refreshes, 1);
  assert.equal(remoteSearches, 0);
  refresh.resolve(new Response('Source unavailable', { status: 503 }));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(matcher.directory()?.retrievedAt, new Date(0).toISOString());
  assert.equal((await matcher.search('松原')).candidates[0]?.securityCode, '300893');
  assert.equal(refreshes, 1);
});

test('authenticated matching and directory requests never initialize or clean the private workspace', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'prispect-company-search-'));
  let privateInitializations = 0;
  let privateCleanups = 0;
  t.mock.method(WorkspaceStore.prototype, 'initialize', async () => {
    privateInitializations++;
    throw new Error('Candidate matching must not initialize a workspace');
  });
  t.mock.method(WorkspaceStore.prototype, 'cleanupUploads', async () => {
    privateCleanups++;
    throw new Error('Candidate matching must not clean uploads');
  });
  let upstreamCalls = 0;
  const sourceStarted = deferred<void>();
  const sourceAborted = deferred<void>();
  const service: CompanyService = {
    searchCompanies: async (query, dependencies) => {
      upstreamCalls++;
      if (query === '离开页面') {
        sourceStarted.resolve();
        return new Promise((_, reject) => {
          dependencies!.signal!.addEventListener(
            'abort',
            () => {
              sourceAborted.resolve();
              reject(new ApiFault(499, 'COMPANY_CANCELLED', 'Fixture cancellation'));
            },
            { once: true }
          );
        });
      }
      return result(query, []);
    },
    runCompanyResearch: async () => {
      throw new Error('Candidate matching must not run research');
    },
  };
  const application = await createApp({
    root: process.cwd(),
    dataDir,
    model: {},
    companyService: service,
    companyDirectory: directory,
  });
  const server = application.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const endpoint of ['/api/companies/directory', '/api/companies/search?q=300893'])
      assert.equal((await fetch(base + endpoint)).status, 200);
    const registration = await fetch(base + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'matching@fixture.test',
        name: '匹配测试',
        password: 'matching-test-password',
      }),
    });
    assert.equal(registration.status, 201);
    const auth = (await registration.json()) as AuthSession;
    assert.ok(auth.user);
    const headers = {
      Cookie: registration.headers
        .getSetCookie()
        .map((cookie) => cookie.split(';')[0])
        .join('; '),
    };
    const snapshot = await fetch(base + '/api/companies/directory', { headers });
    assert.equal(snapshot.status, 200);
    assert.deepEqual(await snapshot.json(), directory);
    const local = await fetch(base + '/api/companies/search?q=300893', { headers });
    assert.equal(local.status, 200);
    assert.equal(
      ((await local.json()) as CompanySearchResponse).candidates[0]?.shortName,
      '松原安全'
    );
    for (const query of ['目录外企业', 'AAPL', '你好']) {
      for (let index = 0; index < 2; index++) {
        const fallback = await fetch(
          base + '/api/companies/search?q=' + encodeURIComponent(query),
          { headers }
        );
        assert.equal(fallback.status, 200);
        assert.deepEqual(((await fallback.json()) as CompanySearchResponse).candidates, []);
      }
    }
    assert.equal(upstreamCalls, 3);
    const controller = new AbortController();
    const disconnected = fetch(base + '/api/companies/search?q=' + encodeURIComponent('离开页面'), {
      headers,
      signal: controller.signal,
    });
    const rejected = assert.rejects(disconnected);
    await sourceStarted.promise;
    controller.abort();
    await rejected;
    await sourceAborted.promise;
    assert.equal(privateInitializations, 0);
    assert.equal(privateCleanups, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    application.auth.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
