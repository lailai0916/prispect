import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PublicIndustryCohortCache,
  type PublicIndustryCohort,
} from '../server/company-industry-cache.js';
import { retrieveIndustrySnapshot } from '../server/company-industry.js';

const period = '2025-12-31';
const codes = ['600000', '600001', '600002', '600003', '600004', '600005'];
const oldDate = '2026-10-03T00:00:00.000Z';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function provider() {
  let multiplier = 1,
    failure: string | null = null,
    obtained = oldDate;
  const calls: { report: string; filter: string; signal?: AbortSignal | null }[] = [];
  let beforeCohort: ((signal?: AbortSignal | null) => Promise<void>) | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)),
      report = url.searchParams.get('reportName')!,
      filter = url.searchParams.get('filter')!;
    calls.push({ report, filter, signal: init?.signal });
    if (filter.includes('BOARD_CODE')) await beforeCohort?.(init?.signal);
    const rows = codes.map((code, index) => ({
      SECURITY_CODE: code,
      SECURITY_NAME_ABBR: `企业${index}`,
      BOARD_CODE: 'BK0420',
      BOARD_NAME: '同一行业',
      REPORTDATE: period,
      REPORT_DATE: period,
      NOTICE_DATE: '2026-04-01',
      TOTAL_OPERATE_INCOME: (100 + index * 100) * multiplier,
      NETPROFIT: index ? -10 * index * multiplier : 100 * multiplier,
      PARENT_NETPROFIT: 999,
      XSMLL: (10 + index * 10) * multiplier,
      WEIGHTAVG_ROE: 10 + index,
      YSTZ: 2 + index,
      TOTAL_LIABILITIES: 100 + index,
      TOTAL_ASSETS: 200 + index,
      ACCOUNTS_RECE: 20 + index,
      MONETARYFUNDS: 200 + index,
      INVENTORY: 80 + index,
      SHORT_LOAN: index * 10,
      NONCURRENT_LIAB_1YEAR: index * 5,
      NETCASH_OPERATE: index ? -30 : 0,
    }));
    const target = /SECURITY_CODE="(\d{6})"/.exec(filter)?.[1];
    const data = target ? rows.filter((row) => row.SECURITY_CODE === target) : rows;
    const count = data.length + (failure === report ? 1 : 0);
    return new Response(JSON.stringify({ success: true, result: { pages: 1, count, data } }));
  };
  return {
    fetch: fetcher,
    now: () => new Date(obtained),
    calls,
    update(value: number, date = '2026-10-03T01:00:00.000Z') {
      multiplier = value;
      obtained = date;
    },
    fail(report: string | null) {
      failure = report;
    },
    block(blocker: typeof beforeCohort) {
      beforeCohort = blocker;
    },
  };
}

function value(marker = 'old'): PublicIndustryCohort {
  return {
    period,
    industryCode: 'BK0420',
    fetchedAt: oldDate,
    codes: [marker],
    income: new Map([[marker, { SECURITY_CODE: marker }]]),
    balance: new Map(),
    cash: new Map(),
    chartIncome: new Map(),
    sources: [{ url: `https://example.test/${marker}`, sha256: marker }],
    warnings: [],
    coreComplete: true,
    complete: true,
  };
}

test('same-industry reuse verifies the new issuer, excludes its own values and retains the original source date', async () => {
  const source = provider();
  const first = await retrieveIndustrySnapshot(codes[0]!, period, source);
  assert.equal(source.calls.length, 5);
  assert.equal(first.metrics.grossMargin.mean, 40);
  const priorSources = structuredClone(first.sources.slice(1));
  first.samples[0]!.values.grossMargin = 999;
  first.sources[1]!.sha256 = 'tampered';
  source.update(2);
  const second = await retrieveIndustrySnapshot(codes[1]!, period, source);
  assert.equal(source.calls.length, 6);
  assert.equal(
    source.calls.at(-1)!.filter,
    `(SECURITY_CODE="${codes[1]}")(REPORTDATE='${period}')`
  );
  assert.equal(second.metrics.grossMargin.company, 20);
  assert.equal(second.metrics.grossMargin.mean, 38);
  assert.equal(second.metrics.grossMargin.count, 5);
  assert.equal(second.chartMetrics!.netProfit!.company, -10);
  assert.equal(second.chartMetrics!.netProfit!.mean, -8);
  assert.equal(second.fetchedAt, oldDate);
  assert.deepEqual(second.sources.slice(1), priorSources);
  assert.equal(second.samples[0]!.values.grossMargin, 10);

  const refreshed = await retrieveIndustrySnapshot(codes[1]!, period, {
    ...source,
    bypassCache: true,
  });
  assert.equal(source.calls.length, 11);
  assert.equal(refreshed.metrics.grossMargin.company, 40);
  assert.equal(refreshed.metrics.grossMargin.mean, 76);
  assert.equal(refreshed.fetchedAt, '2026-10-03T01:00:00.000Z');
  const third = await retrieveIndustrySnapshot(codes[2]!, period, source);
  assert.equal(source.calls.length, 12);
  assert.equal(third.metrics.grossMargin.company, 60);
  assert.equal(third.metrics.grossMargin.mean, 72);
  assert.deepEqual(third.sources.slice(1), refreshed.sources.slice(1));
});

test('failed core or optional tables are never memoized as a complete cohort and retries read fresh bodies', async () => {
  for (const report of ['RPT_DMSK_FN_BALANCE', 'RPT_DMSK_FN_INCOME']) {
    const source = provider();
    source.fail(report);
    const first = await retrieveIndustrySnapshot(codes[0]!, period, source);
    assert.ok(first.warnings.some((warning) => warning.includes('未完整取得')));
    if (report === 'RPT_DMSK_FN_BALANCE') {
      assert.equal(first.status, 'partial');
      assert.equal(first.chartMetrics!.cash!.company, null);
    } else assert.equal(first.chartMetrics!.netProfit!.company, null);
    source.fail(null);
    const next = await retrieveIndustrySnapshot(codes[1]!, period, source);
    assert.equal(source.calls.length, 10);
    assert.equal(next.status, 'available');
    assert.equal(next.chartMetrics!.cash!.company, 201);
    assert.equal(next.chartMetrics!.netProfit!.company, -10);
  }
});

test('concurrent issuers share a cohort and aborting its first subscriber does not cancel the remaining issuer', async () => {
  const source = provider(),
    started = deferred<void>(),
    release = deferred<void>(),
    firstController = new AbortController();
  let producerSignal: AbortSignal | null | undefined;
  source.block(async (signal) => {
    producerSignal = signal;
    started.resolve();
    await release.promise;
  });
  const first = retrieveIndustrySnapshot(codes[0]!, period, {
    ...source,
    signal: firstController.signal,
  });
  const firstRejected = assert.rejects(first, /Abort/);
  await started.promise;
  const second = retrieveIndustrySnapshot(codes[1]!, period, source);
  // Let the second issuer finish its independent subject lookup and subscribe.
  await new Promise<void>((resolve) => setImmediate(resolve));
  firstController.abort();
  await firstRejected;
  assert.equal(producerSignal?.aborted, false);
  release.resolve();
  const result = await second;
  assert.equal(result.securityCode, codes[1]);
  assert.equal(source.calls.length, 6);
  assert.equal(source.calls.filter((call) => call.filter.includes('BOARD_CODE')).length, 1);
  assert.equal(result.metrics.grossMargin.mean, 38);
});

test('an explicit refresh wins over a slower earlier cohort fill', async () => {
  const cache = new PublicIndustryCohortCache(),
    oldStarted = deferred<void>(),
    oldRelease = deferred<PublicIndustryCohort>();
  const old = cache.read('same-public-cohort', async () => {
    oldStarted.resolve();
    return oldRelease.promise;
  });
  await oldStarted.promise;
  const fresh = await cache.read('same-public-cohort', async () => value('fresh'), {
    bypass: true,
  });
  oldRelease.resolve(value('old'));
  assert.deepEqual((await old).codes, ['old']);
  assert.deepEqual(fresh.codes, ['fresh']);
  const read = await cache.read('same-public-cohort', async () => {
    throw new Error('must not reload');
  });
  assert.deepEqual(read.codes, ['fresh']);
});

test('all detached subscribers cancel the producer and its late result cannot be reused', async () => {
  const cache = new PublicIndustryCohortCache(),
    release = deferred<PublicIndustryCohort>(),
    started = deferred<void>(),
    controller = new AbortController();
  let producerSignal!: AbortSignal;
  const pending = cache.read(
    'public',
    async (signal) => {
      producerSignal = signal;
      started.resolve();
      return release.promise;
    },
    { signal: controller.signal }
  );
  const rejection = assert.rejects(pending, /Abort/);
  await started.promise;
  controller.abort();
  await rejection;
  assert.equal(producerSignal.aborted, true);
  release.resolve(value('cancelled'));
  await new Promise<void>((resolve) => setImmediate(resolve));
  const result = await cache.read('public', async () => value('retry'));
  assert.deepEqual(result.codes, ['retry']);
});

test('the bounded cohort cache expires, evicts oldest entries and rejects oversized publication', async () => {
  let clock = 0;
  const cache = new PublicIndustryCohortCache(
    { entries: 1, bytes: 2048, entryBytes: 1024, pending: 2, subscribers: 32, ttlMs: 100 },
    () => clock
  );
  let loads = 0;
  const load = async () => {
    loads++;
    return value();
  };
  await cache.read('A', load);
  await cache.read('A', load);
  assert.equal(loads, 1);
  await cache.read('B', load);
  await cache.read('A', load);
  assert.equal(loads, 3);
  clock = 101;
  await cache.read('A', load);
  assert.equal(loads, 4);
  const large = async () => {
    loads++;
    const result = value();
    result.warnings = ['x'.repeat(2048)];
    return result;
  };
  await cache.read('large', large);
  await cache.read('large', large);
  assert.equal(loads, 6);
});

test('provider namespaces never share acquired public cohorts', async () => {
  const a = provider(),
    b = provider();
  b.update(3);
  assert.equal(
    (await retrieveIndustrySnapshot(codes[0]!, period, a)).metrics.grossMargin.company,
    10
  );
  assert.equal(
    (await retrieveIndustrySnapshot(codes[0]!, period, b)).metrics.grossMargin.company,
    30
  );
  assert.equal(a.calls.length, 5);
  assert.equal(b.calls.length, 5);
});

test('invalid company classification responses are evicted so the next retry can recover', async () => {
  for (const defect of [
    'empty-format',
    'classification',
    'wrong-period',
    'duplicate',
    'page-header',
  ]) {
    const source = provider();
    let broken = true;
    const fetcher: typeof fetch = async (input, init) => {
      const response = await source.fetch(input, init);
      const body = await response.json();
      if (
        broken &&
        new URL(String(input)).searchParams.get('filter')!.includes('SECURITY_CODE="')
      ) {
        if (defect === 'empty-format') return new Response('{}');
        if (defect === 'classification') body.result.data[0].BOARD_CODE = 'not-an-industry';
        if (defect === 'wrong-period') body.result.data[0].REPORTDATE = '2024-12-31';
        if (defect === 'duplicate') {
          body.result.data.push({ ...body.result.data[0], XSMLL: 999 });
          body.result.count += 1;
        }
        if (defect === 'page-header') body.result.pages = 1.5;
      }
      return new Response(JSON.stringify(body));
    };
    const dependencies = { ...source, fetch: fetcher };
    await assert.rejects(retrieveIndustrySnapshot(codes[0]!, period, dependencies));
    assert.equal(source.calls.length, 1, defect);
    broken = false;
    const retry = await retrieveIndustrySnapshot(codes[0]!, period, dependencies);
    assert.equal(source.calls.length, 6, defect);
    assert.equal(retry.metrics.grossMargin.company, 10, defect);
  }
});

test('a cached industry cohort never supplies results for an unverified or reclassified issuer', async () => {
  const source = provider();
  let reclassified = false;
  const fetcher: typeof fetch = async (input, init) => {
    const response = await source.fetch(input, init),
      body = await response.json(),
      filter = new URL(String(input)).searchParams.get('filter')!;
    if (reclassified && filter === `(SECURITY_CODE="${codes[1]}")(REPORTDATE='${period}')`)
      body.result.data[0].BOARD_CODE = 'BK9999';
    return new Response(JSON.stringify(body));
  };
  const dependencies = { ...source, fetch: fetcher };
  await retrieveIndustrySnapshot(codes[0]!, period, dependencies);
  assert.equal(source.calls.length, 5);
  reclassified = true;
  await assert.rejects(retrieveIndustrySnapshot(codes[1]!, period, dependencies), {
    code: 'INDUSTRY_CLASSIFICATION_CONFLICT',
  });
  assert.equal(source.calls.length, 7);
  await assert.rejects(retrieveIndustrySnapshot('600999', period, dependencies), {
    code: 'INDUSTRY_TARGET_MISSING',
  });
  assert.equal(source.calls.length, 8);
});

test('ordinary readers wait for an in-flight refresh instead of receiving the older cached cohort', async () => {
  const cache = new PublicIndustryCohortCache(),
    release = deferred<PublicIndustryCohort>(),
    started = deferred<void>();
  await cache.read('public', async () => value('old'));
  const refresh = cache.read(
    'public',
    async () => {
      started.resolve();
      return release.promise;
    },
    { bypass: true }
  );
  await started.promise;
  const ordinary = cache.read('public', async () => {
    throw new Error('must join refresh');
  });
  release.resolve(value('fresh'));
  assert.deepEqual((await ordinary).codes, ['fresh']);
  assert.deepEqual((await refresh).codes, ['fresh']);
});

test('pending-cohort and subscriber limits reject excess work without starting additional table loads', async () => {
  const cache = new PublicIndustryCohortCache({
      entries: 4,
      bytes: 2048,
      entryBytes: 1024,
      pending: 1,
      subscribers: 2,
      ttlMs: 1000,
    }),
    release = deferred<PublicIndustryCohort>(),
    started = deferred<void>();
  let loads = 0;
  await cache.read('saved', async () => value('saved'));
  const first = cache.read('active', async () => {
    loads++;
    started.resolve();
    return release.promise;
  });
  await started.promise;
  const second = cache.read('active', async () => {
    throw new Error('should share');
  });
  await assert.rejects(
    cache.read('active', async () => value('excess')),
    { code: 'INDUSTRY_COHORT_BUSY' }
  );
  await Promise.all(
    Array.from({ length: 100 }, (_, index) =>
      assert.rejects(
        cache.read(`new-${index}`, async () => {
          loads++;
          return value('unaccounted');
        }),
        { code: 'INDUSTRY_COHORT_BUSY' }
      )
    )
  );
  assert.equal(loads, 1);
  assert.deepEqual(
    (
      await cache.read('saved', async () => {
        throw new Error('cached hit stays usable');
      })
    ).codes,
    ['saved']
  );
  release.resolve(value('active'));
  await Promise.all([first, second]);
  assert.deepEqual((await cache.read('next', async () => value('next'))).codes, ['next']);
});
