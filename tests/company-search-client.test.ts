import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CompanySearchClient,
  companyMatchesQuery,
  normalizeCompanySearchQuery,
} from '../src/company-search-client.js';
import {
  COMPANY_DIRECTORY_SOURCE,
  matchCompanyDirectory,
  type CompanyDirectory,
} from '../shared/company-directory.js';
import type { CompanySearchResponse } from '../shared/contracts.js';

const directory: CompanyDirectory = {
  source: 'cninfo',
  sourceUrl: COMPANY_DIRECTORY_SOURCE,
  retrievedAt: '2026-10-03T03:29:08.818Z',
  sha256: 'a'.repeat(64),
  entries: [
    ['600926', 'gsh6000926', '杭州银行'],
    ['000001', 'gssz0000001', '平安银行'],
    ['600000', 'fixture600000', 'ST测试'],
  ],
};

function result(query: string): CompanySearchResponse {
  return {
    query,
    candidates: [],
    limitedToListed: true,
    source: 'cninfo',
    truncated: false,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test('preloaded official directory resolves names and complete codes without a remote request', async () => {
  let calls = 0;
  const client = new CompanySearchClient(
    async () => directory,
    async (query) => {
      calls++;
      return result(query);
    }
  );
  await client.preload();
  assert.equal(client.peek('杭州 银行')?.candidates[0]?.securityCode, '600926');
  assert.equal(client.peek('６００９２６')?.candidates[0]?.shortName, '杭州银行');
  assert.equal(client.peek('st')?.candidates[0]?.shortName, 'ST测试');
  assert.equal(
    (await client.search('ST', new AbortController().signal)).candidates[0]?.securityCode,
    '600000'
  );
  const answer = await client.search('平安银行', new AbortController().signal);
  assert.equal(answer.candidates[0]?.securityCode, '000001');
  assert.equal(calls, 0);
  assert.equal(client.peek('未收入目录的名称'), null);
  assert.equal(normalizeCompanySearchQuery(' ＡＢＣ  '), 'abc');
  assert.equal(companyMatchesQuery(answer.candidates[0]!, '平安 银'), true);
  assert.equal(companyMatchesQuery(answer.candidates[0]!, '杭州银行'), false);
  client.dispose();
});

test('typing while the public directory loads waits for local matching before querying upstream', async () => {
  const load = deferred<CompanyDirectory>();
  let calls = 0;
  const client = new CompanySearchClient(
    () => load.promise,
    async (query) => {
      calls++;
      return result(query);
    }
  );
  const pending = client.search('600926', new AbortController().signal);
  await Promise.resolve();
  assert.equal(calls, 0);
  load.resolve(directory);
  assert.equal((await pending).candidates[0]?.shortName, '杭州银行');
  assert.equal(calls, 0);
  client.dispose();
});

test('a slow catalog cannot hold a company lookup until the catalog download finishes', async () => {
  const load = deferred<CompanyDirectory>();
  let calls = 0;
  const client = new CompanySearchClient(
    () => load.promise,
    async (query) => {
      calls++;
      return result(query);
    }
  );
  const answer = await client.search('不在已载入目录', AbortSignal.timeout(500));
  assert.equal(answer.query, '不在已载入目录');
  assert.equal(calls, 1);
  load.resolve(directory);
  client.dispose();
});

test('remote public candidates use normalized query caching for five minutes and then refresh', async () => {
  let calls = 0;
  let now = 10;
  const client = new CompanySearchClient(
    async () => directory,
    async (query) => {
      calls++;
      return { ...matchCompanyDirectory(directory, '600926'), query };
    },
    () => now
  );
  const signal = new AbortController().signal;
  await client.search('全称 查询', signal);
  assert.equal(client.peek('全称查询')?.query, '全称查询');
  await client.search(' 全称查询 ', signal);
  assert.equal(calls, 1);
  now += 15_000;
  assert.ok(client.peek('全称查询'));
  now += 5 * 60_000 - 15_000;
  assert.equal(client.peek('全称查询'), null);
  await client.search('全称查询', signal);
  assert.equal(calls, 2);
  client.dispose();
});

test('coalesced searches retain remaining subscribers and cancel the source only when all leave', async () => {
  const remote = deferred<CompanySearchResponse>();
  let calls = 0;
  let remoteSignal: AbortSignal | undefined;
  const client = new CompanySearchClient(
    async () => directory,
    (query, signal) => {
      calls++;
      remoteSignal = signal;
      return remote.promise;
    }
  );
  await client.preload();
  const first = new AbortController();
  const second = new AbortController();
  const left = client.search('别名 查询', first.signal);
  const right = client.search('别名查询', second.signal);
  const rejected = assert.rejects(left, { name: 'AbortError' });
  first.abort();
  await rejected;
  assert.equal(calls, 1);
  assert.equal(remoteSignal?.aborted, false);
  remote.resolve(result('别名 查询'));
  assert.equal((await right).query, '别名查询');
  client.dispose();

  const abandoned = deferred<CompanySearchResponse>();
  let abandonedSignal: AbortSignal | undefined;
  const cancelled = new CompanySearchClient(
    async () => directory,
    (_query, signal) => {
      abandonedSignal = signal;
      return abandoned.promise;
    }
  );
  await cancelled.preload();
  const controller = new AbortController();
  const pending = cancelled.search('旧 查询', controller.signal);
  const abortResult = assert.rejects(pending, { name: 'AbortError' });
  controller.abort();
  await abortResult;
  assert.equal(abandonedSignal?.aborted, true);
  abandoned.resolve(result('旧 查询'));
  await Promise.resolve();
  assert.equal(cancelled.peek('旧查询'), null);
  cancelled.dispose();
});

test('source failures remain errors and explicit retries bypass successful empty-result caches', async () => {
  let directoryCalls = 0;
  let calls = 0;
  let now = 0;
  const client = new CompanySearchClient(
    async () => {
      directoryCalls++;
      throw new Error('directory unavailable');
    },
    async (query) => {
      calls++;
      if (calls === 1) throw new Error('source timeout');
      return result(query);
    },
    () => now
  );
  const signal = new AbortController().signal;
  await assert.rejects(client.search('未收录全称', signal), /source timeout/);
  assert.equal(client.peek('未收录全称'), null);
  assert.deepEqual((await client.search('未收录全称', signal)).candidates, []);
  await client.search('未收录全称', signal);
  assert.equal(calls, 2);
  await client.search('未收录全称', signal, true);
  assert.equal(calls, 3);
  assert.equal(directoryCalls, 1);
  now += 15_000;
  assert.equal(client.peek('未收录全称'), null);
  await client.search('未收录全称', signal);
  assert.equal(calls, 4);
  client.dispose();
});

test('owner disposal aborts directory waits and cannot share cached query results with another owner', async () => {
  const load = deferred<CompanyDirectory>();
  const old = new CompanySearchClient(
    () => load.promise,
    async (query) => result(query)
  );
  const waiting = old.search('600926', new AbortController().signal);
  const rejected = assert.rejects(waiting, { name: 'AbortError' });
  old.dispose();
  await rejected;
  load.resolve(directory);
  assert.equal(old.peek('600926'), null);

  let calls = 0;
  const create = () =>
    new CompanySearchClient(
      async () => directory,
      async (query) => {
        calls++;
        return result(query);
      }
    );
  const ownerA = create();
  const ownerB = create();
  await ownerA.search('未收录全称', new AbortController().signal);
  assert.equal(ownerB.peek('未收录全称'), null);
  await ownerB.search('未收录全称', new AbortController().signal);
  assert.equal(calls, 2);
  ownerA.dispose();
  ownerB.dispose();
});
