import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AuthSession } from '../shared/contracts.js';
import { createApp } from '../server/app.js';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { researchDemoIdentity, researchDemoSnapshot } from '../scripts/serve-research-demo.js';
import {
  industryChartMetricKeys,
  industryMetricKeys,
  type CompanyIndustrySnapshot,
} from '../shared/company-workspace.js';
import { buildFinancialChartPoints } from '../shared/company-financial-charts.js';
import {
  industryHistoryPeriods,
  savedIndustryHistoryResult,
  type IndustryHistoryResult,
} from '../shared/company-industry-history.js';
import { retrieveIndustryHistoryYear } from '../server/company-industry-history.js';
import { loadIndustryHistory } from '../src/company-industry-history.js';
import { CompanyRunCache } from '../src/company-run-cache.js';
import { ApiFault } from '../server/validation.js';
import { deriveCompanyAssessment } from '../shared/company-assessment.js';

export function historyRun(): CompanyResearchRun {
  const context = researchDemoSnapshot();
  context.financials = Array.from({ length: 6 }, (_, index) => ({
    ...structuredClone(context.financials[1]!),
    period: `${2020 + index}-12-31`,
  }));
  return {
    id: 'synthetic-history',
    input: {
      securityCode: researchDemoIdentity.securityCode,
      orgId: researchDemoIdentity.orgId,
      year: 2025,
    },
    identity: researchDemoIdentity,
    status: 'ready',
    createdAt: context.fetchedAt,
    updatedAt: context.fetchedAt,
    context,
    contextStatus: 'ready',
    announcements: [],
    trace: [],
    model: { requested: true, status: 'not-configured' },
  };
}

export function historySnapshot(period: string): CompanyIndustrySnapshot {
  const summary = {
    company: 60000,
    mean: Number(period.slice(0, 4)) * 100,
    median: 50000,
    count: 5,
    missing: 0,
    difference: 10000,
  };
  return {
    version: 1,
    securityCode: researchDemoIdentity.securityCode,
    period,
    industry: '合成同行（非真实资料）',
    industryCode: 'BK0000',
    fetchedAt: '2020-01-01T00:00:00.000Z',
    status: 'available',
    peerCount: 5,
    minimumSamples: 5,
    metrics: Object.fromEntries(
      industryMetricKeys.map((key) => [key, summary])
    ) as CompanyIndustrySnapshot['metrics'],
    chartMetrics: Object.fromEntries(industryChartMetricKeys.map((key) => [key, summary])),
    samples: [],
    sources: [],
    warnings: [],
  };
}

function applyResult(run: CompanyResearchRun, result: IndustryHistoryResult) {
  if (result.snapshot) (run.industry ||= {})[result.period] = result.snapshot;
  if (result.failure) (run.industryHistoryErrors ||= {})[result.period] = result.failure;
  else if (run.industryHistoryErrors) delete run.industryHistoryErrors[result.period];
}

test('fill five missing annual cohorts progressively, retain the old sixth year, and cache every plotted reference', async () => {
  const run = historyRun();
  run.industry = { '2025-12-31': historySnapshot('2025-12-31') };
  const calls: string[] = [];
  const completed: number[] = [];
  let active = 0;
  let maximum = 0;
  const storageValues = new Map<string, string>();
  const storage = {
    getItem: (key: string) => storageValues.get(key) || null,
    setItem: (key: string, value: string) => void storageValues.set(key, value),
    removeItem: (key: string) => void storageValues.delete(key),
  };
  const cache = new CompanyRunCache(() => storage);
  cache.activate('owner');
  const request = async (_path: string, init?: RequestInit) => {
    const { period, refresh } = JSON.parse(String(init?.body));
    return retrieveIndustryHistoryYear(run, period, {
      refresh,
      signal: init!.signal!,
      current: () => true,
      persist: async () => {},
      retrieve: async (_code, year) => {
        active++;
        maximum = Math.max(maximum, active);
        calls.push(year);
        await Promise.resolve();
        active--;
        return historySnapshot(year);
      },
    });
  };
  const onResult = (result: IndustryHistoryResult) => {
    applyResult(run, result);
    cache.save('owner', run);
    completed.push(
      buildFinancialChartPoints(run.context!, 'consolidated', run.industry).ocf.filter(
        (point) => point.peer !== null
      ).length
    );
  };
  await loadIndustryHistory(run, {
    mode: 'missing',
    signal: new AbortController().signal,
    onResult,
    request,
  });
  assert.deepEqual(calls, ['2024-12-31', '2023-12-31', '2022-12-31', '2021-12-31', '2020-12-31']);
  assert.deepEqual(completed, [2, 3, 4, 5, 6]);
  assert.equal(maximum, 1);
  const reread = new CompanyRunCache(() => storage);
  reread.activate('owner');
  const saved = reread.read('owner', run.id)!;
  const points = buildFinancialChartPoints(saved.context!, 'consolidated', saved.industry).ocf;
  assert.deepEqual(
    points.map((point) => point.peer),
    [202000, 202100, 202200, 202300, 202400, 202500]
  );
  assert.equal(saved.industry!['2025-12-31']!.fetchedAt, '2020-01-01T00:00:00.000Z');
  await loadIndustryHistory(saved, {
    mode: 'missing',
    signal: new AbortController().signal,
    onResult,
    request,
  });
  assert.equal(calls.length, 5, 'reopening a complete local copy does not issue requests');
});

test('a failed year does not stop later years, survives caching, and is retried only explicitly', async () => {
  const run = historyRun();
  let failed = true;
  const calls: string[] = [];
  const request = async (_path: string, init?: RequestInit) => {
    const { period, refresh } = JSON.parse(String(init?.body));
    return retrieveIndustryHistoryYear(run, period, {
      refresh,
      signal: init!.signal!,
      current: () => true,
      persist: async () => {},
      retrieve: async (_code, year) => {
        calls.push(year);
        if (failed && year === '2023-12-31')
          throw new ApiFault(502, 'SOURCE_FAILED', 'private diagnostics must not be saved');
        return historySnapshot(year);
      },
    });
  };
  const options = {
    signal: new AbortController().signal,
    onResult: (result: IndustryHistoryResult) => applyResult(run, result),
    request,
  };
  await loadIndustryHistory(run, { ...options, mode: 'missing' });
  assert.equal(calls.length, 6);
  assert.equal(Object.keys(run.industry!).length, 5);
  assert.equal(run.industryHistoryErrors!['2023-12-31']!.code, 'SOURCE_FAILED');
  assert.equal(JSON.stringify(run).includes('private diagnostics'), false);
  const publicCache = new CompanyRunCache(() => null);
  publicCache.activate('owner');
  publicCache.save('owner', run);
  assert.equal(
    publicCache.read('owner', run.id)!.industryHistoryErrors!['2023-12-31']!.code,
    'SOURCE_FAILED'
  );
  await loadIndustryHistory(run, { ...options, mode: 'missing' });
  assert.equal(calls.length, 6);
  failed = false;
  await loadIndustryHistory(run, { ...options, mode: 'retry' });
  assert.deepEqual(calls.slice(6), ['2023-12-31']);
  assert.equal(run.industryHistoryErrors!['2023-12-31'], undefined);
  await loadIndustryHistory(run, { ...options, mode: 'refresh' });
  assert.equal(calls.length, 13, 'explicit refresh retrieves all six annual cohorts once');
});

test('refresh failure preserves the last dated cohort; a partial cohort is not automatically refetched', async () => {
  const run = historyRun();
  const old = historySnapshot('2025-12-31');
  old.status = 'partial';
  old.chartMetrics!.ocf!.count = 3;
  old.chartMetrics!.ocf!.mean = null;
  run.industry = { [old.period]: old };
  let calls = 0;
  const options = {
    signal: new AbortController().signal,
    current: () => true,
    persist: async () => {},
    retrieve: async () => {
      calls++;
      throw Error('Unavailable');
    },
  };
  assert.equal(
    (await retrieveIndustryHistoryYear(run, old.period, { ...options, refresh: false })).snapshot,
    old
  );
  assert.equal(calls, 0);
  const result = await retrieveIndustryHistoryYear(run, old.period, { ...options, refresh: true });
  assert.equal(result.snapshot, old);
  assert.equal(result.failure?.code, 'INDUSTRY_UNAVAILABLE');
  assert.equal(run.industry[old.period]!.fetchedAt, old.fetchedAt);
});

test('annual retrieval refresh bypasses public and cohort caches while missing years may reuse them', async () => {
  const run = historyRun();
  const bypasses: (boolean | undefined)[] = [];
  const options = {
    signal: new AbortController().signal,
    current: () => true,
    persist: async () => {},
    retrieve: async (_code: string, period: string, dependencies?: { bypassCache?: boolean }) => {
      bypasses.push(dependencies?.bypassCache);
      return historySnapshot(period);
    },
  };
  await retrieveIndustryHistoryYear(run, '2025-12-31', { ...options, refresh: false });
  await retrieveIndustryHistoryYear(run, '2025-12-31', { ...options, refresh: false });
  await retrieveIndustryHistoryYear(run, '2025-12-31', { ...options, refresh: true });
  assert.deepEqual(bypasses, [false, true]);
});

test('annual window excludes quarters and mismatched subjects and is bounded to six acquired years', () => {
  const run = historyRun();
  run.context!.financials.push({
    ...run.context!.financials[0]!,
    period: '2025-09-30',
    annual: false,
  });
  run.context!.financials.push({ ...run.context!.financials[0]!, period: '2019-12-31' });
  run.input.year = 2023;
  assert.deepEqual(industryHistoryPeriods(run), [
    '2023-12-31',
    '2025-12-31',
    '2024-12-31',
    '2022-12-31',
    '2021-12-31',
    '2020-12-31',
  ]);
  run.context!.orgId = 'different';
  assert.deepEqual(industryHistoryPeriods(run), []);
});

test('cancelled annual reads cannot publish a late result or start another year', async () => {
  const run = historyRun();
  const controller = new AbortController();
  let calls = 0;
  let results = 0;
  await assert.rejects(
    loadIndustryHistory(run, {
      mode: 'missing',
      signal: controller.signal,
      onResult: () => {
        results++;
      },
      request: async (_path, init) => {
        calls++;
        controller.abort();
        return {
          period: JSON.parse(String(init?.body)).period,
          snapshot: historySnapshot('2025-12-31'),
          failure: null,
          cached: false,
        };
      },
    }),
    { name: 'AbortError' }
  );
  assert.equal(calls, 1);
  assert.equal(results, 0);
  assert.equal(run.industryHistoryErrors, undefined);
});

test('wrong-year results are withheld and a deleted or refreshed record cannot receive a late write', async () => {
  const run = historyRun();
  const result = await retrieveIndustryHistoryYear(run, '2025-12-31', {
    refresh: false,
    retrieve: async () => historySnapshot('2024-12-31'),
    current: () => true,
    persist: async () => {},
    signal: new AbortController().signal,
  });
  assert.equal(result.snapshot, null);
  assert.equal(result.failure?.code, 'INDUSTRY_SUBJECT_CONFLICT');
  assert.equal(run.industry, undefined);
  await assert.rejects(
    retrieveIndustryHistoryYear(run, '2024-12-31', {
      refresh: false,
      retrieve: async () => historySnapshot('2024-12-31'),
      current: () => false,
      persist: async () => assert.fail('must not persist'),
      signal: new AbortController().signal,
    }),
    (error: unknown) => error instanceof ApiFault && error.code === 'CONTEXT_STALE'
  );
  assert.equal(run.industry, undefined);
});

test('failed persistence restores the target year and preserves independent updates', async () => {
  const run = historyRun();
  const old = historySnapshot('2025-12-31');
  run.industry = { [old.period]: old };
  const other = historySnapshot('2023-12-31');
  await assert.rejects(
    retrieveIndustryHistoryYear(run, old.period, {
      refresh: true,
      retrieve: async () => ({ ...old, fetchedAt: new Date().toISOString() }),
      current: () => true,
      signal: new AbortController().signal,
      persist: async () => {
        run.industry!['2023-12-31'] = other;
        throw Error('Storage failed');
      },
    }),
    /Storage failed/
  );
  assert.equal(run.industry[old.period], old);
  assert.equal(run.industry['2023-12-31'], other);
  assert.equal(savedIndustryHistoryResult(run, old.period)!.failure, null);
});

test('annual history endpoint checks ownership and scope, durably retains outcomes, and ignores cache age', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-peer-history-api-'));
  let calls = 0;
  let fail = false;
  const app = await createApp({
    dataDir: directory,
    model: {},
    companyService: {
      searchCompanies: async (query) => ({
        query,
        candidates: [researchDemoIdentity],
        limitedToListed: true,
        source: 'cninfo',
        truncated: false,
      }),
      runCompanyResearch: async () => ({
        identity: researchDemoIdentity,
        announcements: [],
        stoppedReason: 'synthetic fixture',
        model: { requested: true, status: 'not-configured' },
      }),
    },
    companyContextService: {
      research: async (run) => ({
        run: structuredClone(run),
        steps: [],
        modelCalls: 0,
        toolCalls: 0,
      }),
      assessment: async (run) => deriveCompanyAssessment(run),
      searchCompanies: async (query) => ({
        query,
        candidates: [researchDemoIdentity],
        limitedToListed: true,
        source: 'cninfo',
        truncated: false,
      }),
      context: async () => historyRun().context!,
      industry: async (_code, period) => {
        calls++;
        if (fail) throw Error('fixture source unavailable');
        return historySnapshot(period);
      },
      question: async () => {
        throw Error('unused');
      },
    },
  });
  const server = app.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const register = async (email: string) => {
    const response = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        name: 'Synthetic annual history',
        password: 'annual-history-fixture-password',
      }),
    });
    assert.equal(response.status, 201);
    const session = (await response.json()) as AuthSession;
    return {
      Cookie: response.headers.get('set-cookie')!.split(';')[0]!,
      'X-CSRF-Token': session.csrfToken!,
      'Content-Type': 'application/json',
    };
  };
  try {
    const owner = await register('history-owner@example.test');
    const other = await register('history-other@example.test');
    const post = (url: string, body: unknown, headers = owner) =>
      fetch(`${base}/api${url}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const created = await post('/company-runs', { ...historyRun().input, researchMode: 'deep' });
    assert.equal(created.status, 202);
    const run = (await created.json()) as CompanyResearchRun;
    await app.waitForIdle();
    assert.equal((await post(`/company-runs/${run.id}/context`, {})).status, 202);
    await app.waitForIdle();
    const url = `/company-runs/${run.id}/industry-history`;
    assert.equal((await post(url, { period: '2025-12-31' }, other)).status, 404);
    assert.equal((await post(url, { period: '2019-12-31' })).status, 400);
    assert.equal(calls, 0);
    const first = await post(url, { period: '2025-12-31' });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).cached, false);
    const revisit = await post(url, { period: '2025-12-31' });
    assert.equal((await revisit.json()).cached, true);
    assert.equal(calls, 1, 'an old acquired date does not trigger retrieval');
    fail = true;
    const failed = await post(url, { period: '2024-12-31' });
    assert.equal((await failed.json()).failure.code, 'INDUSTRY_UNAVAILABLE');
    assert.equal((await (await post(url, { period: '2024-12-31' })).json()).cached, true);
    assert.equal(calls, 2);
    const saved = (await (
      await fetch(`${base}/api/company-runs/${run.id}`, { headers: owner })
    ).json()) as CompanyResearchRun;
    assert.equal(saved.industry!['2025-12-31']!.period, '2025-12-31');
    assert.equal(saved.industryHistoryErrors!['2024-12-31']!.code, 'INDUSTRY_UNAVAILABLE');
    fail = false;
    const retry = await post(url, { period: '2024-12-31', refresh: true });
    assert.equal((await retry.json()).failure, null);
    assert.equal(calls, 3);
  } finally {
    await app.waitForIdle();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    app.auth.close();
    await rm(directory, { recursive: true, force: true });
  }
});
