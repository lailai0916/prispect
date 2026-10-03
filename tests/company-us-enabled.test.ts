import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AuthSession, CompanyIdentity, CompanyResearchRun } from '../shared/contracts.js';
import { createApp } from '../server/app.js';
import { initialCompanyGraphProgress, runCompanyResearch } from '../server/company-agent.js';
import { searchCompanies } from '../server/company-sources.js';
import type { CompanyService } from '../server/company-routes.js';
import type { CompanyContextService } from '../server/company-context-routes.js';
import type { CompanyChallengeRouteService } from '../server/company-challenge-routes.js';
import { answerCompanyQuestion } from '../server/company-questions.js';
import { ApiFault } from '../server/validation.js';

const unsupported = (error: unknown) =>
  error instanceof ApiFault && error.status === 400 && error.code === 'COMPANY_MARKET_UNSUPPORTED';

test('English and ticker inputs resolve via SEC; Chinese misses keep supported results plus the unlisted marker', async (t) => {
  const requests: string[] = [];
  const fetchMock: typeof fetch = async (url) => {
    const host = new URL(String(url)).hostname;
    if (host === 'www.sec.gov') {
      return Response.json({
        AAPL: { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
        TSLA: { cik_str: 1318605, ticker: 'TSLA', title: 'Tesla, Inc.' },
        NVDA: { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA Corp' },
        'BRK.B': { cik_str: 1067983, ticker: 'BRK.B', title: 'Berkshire Hathaway Inc' },
      });
    }
    assert.equal(host, 'www.cninfo.com.cn');
    requests.push(String(url));
    return Response.json([]);
  };
  t.mock.method(globalThis, 'fetch', fetchMock);
  const english = ['AAPL', 'tsla', 'BRK.B', '英伟达', '苹果', 'Apple Inc.'];
  for (const query of english) {
    const result = await searchCompanies(query, { fetch: fetchMock });
    assert.equal(result.source, 'sec');
    assert.ok(result.candidates.length > 0, `${query} should resolve through the SEC ticker table`);
  }
  for (const query of ['abc', '你好']) {
    const result = await searchCompanies(query, { fetch: fetchMock });
    assert.equal(result.source, 'cninfo');
    assert.deepEqual(result.candidates, []);
  }
  const unlisted = await searchCompanies('未上市企业', { fetch: fetchMock });
  assert.equal(unlisted.source, 'cninfo');
  assert.deepEqual(unlisted.candidates, []);
  assert.equal(unlisted.unlisted, true);
  assert.equal(requests.length, 9);
});

test('supported search accepts all terms while unsupported research routes preserve account-owned historical records', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-us-paused-'));
  const identity: CompanyIdentity = {
    securityCode: '300893',
    orgId: '9900039861',
    shortName: '松原安全',
    companyName: null,
    exchange: 'szse',
    sourceUrl: 'https://www.cninfo.com.cn/',
  };
  const supplementaryCalls: string[] = [];
  let localGapId: string | undefined;
  const refuseSupplementary = (operation: string): never => {
    supplementaryCalls.push(operation);
    throw new Error('Historical unsupported records must not dispatch supplementary services');
  };
  const contextService: CompanyContextService = {
    searchCompanies: async () => refuseSupplementary('lookup'),
    context: async () => refuseSupplementary('context'),
    industry: async () => refuseSupplementary('industry'),
    question: async (run, ...args) =>
      run.id === localGapId ? answerCompanyQuestion(run, ...args) : refuseSupplementary('question'),
    research: async () => refuseSupplementary('research'),
    assessment: async () => refuseSupplementary('assessment'),
  };
  const challengeService: CompanyChallengeRouteService = {
    challenge: async () => refuseSupplementary('challenge'),
  };
  const calls = { searches: 0, research: 0 };
  const service: CompanyService = {
    searchCompanies: async (query) => {
      calls.searches++;
      return {
        query,
        candidates: query === identity.securityCode ? [identity] : [],
        limitedToListed: true,
        source: 'cninfo',
        truncated: false,
      };
    },
    runCompanyResearch: async (input) => {
      calls.research++;
      assert.equal(input.securityCode, identity.securityCode);
      return { identity, announcements: [], model: { requested: true, status: 'not-configured' } };
    },
  };
  let application = await createApp({
    root: process.cwd(),
    dataDir: directory,
    model: {},
    companyService: service,
    companyContextService: contextService,
    companyChallengeService: challengeService,
  });
  let server = application.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  let base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const register = async (email: string) => {
    const response = await fetch(base + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: '历史记录兼容', password: 'V7m#pQ2z!L9w@R4s' }),
    });
    assert.equal(response.status, 201);
    const session = (await response.json()) as AuthSession;
    return {
      userId: session.user!.id,
      headers: {
        Cookie: response.headers
          .getSetCookie()
          .map((item) => item.split(';')[0])
          .join('; '),
        'X-CSRF-Token': session.csrfToken!,
        'Content-Type': 'application/json',
      },
    };
  };
  const request = (url: string, headers: Record<string, string>, body?: unknown) =>
    fetch(base + url, {
      headers,
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    });
  try {
    const alice = await register('us-history-owner@fixture.test');
    const bob = await register('us-history-other@fixture.test');
    const store = await application.workspaceForUser(alice.userId);
    const bytes = Buffer.from('<!doctype html><html>Previously saved SEC filing fixture</html>');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const filename = '10-K-2025-AAPL.htm';
    const uploadId = await store.retainUpload(bytes, filename, sha256, 'official');
    const now = new Date().toISOString();
    const legacy: CompanyResearchRun = {
      id: randomUUID(),
      input: {
        securityCode: 'AAPL',
        orgId: '320193',
        year: 2025,
        purpose: 'external',
        useModel: true,
      },
      status: 'failed',
      createdAt: now,
      updatedAt: now,
      trace: [],
      announcements: [],
      identity: {
        securityCode: 'AAPL',
        orgId: '320193',
        shortName: 'Apple Inc.',
        companyName: 'Apple Inc.',
        exchange: 'us',
        sourceUrl: 'https://www.sec.gov/',
      },
      agent: { ...initialCompanyGraphProgress(), recoverable: true, requestKey: randomUUID() },
      model: { requested: true, status: 'not-called' },
      contextStatus: 'ready',
      context: {
        version: 1,
        securityCode: 'AAPL',
        orgId: '320193',
        companyName: 'Apple Inc.',
        fetchedAt: now,
        status: 'partial',
        financials: [],
        sources: [],
        comparisons: [],
        profile: {},
        shareholders: [],
        announcements: [],
        news: [],
        verificationLinks: [],
        warnings: [],
      },
      preview: {
        material: {
          company: 'Apple Inc.',
          shortName: 'Apple Inc.',
          title: 'Historical SEC snapshot',
          filename,
          origin: 'public-report',
          documentDate: '2026-02-01',
          sourceUrl: 'https://www.sec.gov/Archives/fixture.htm',
          sha256,
          uploadId,
          observations: [
            {
              id: 'legacy-usd',
              key: 'netProfit',
              year: 2025,
              period: 'annual',
              value: '100',
              unit: 'usd',
              currency: 'USD',
              scope: 'consolidated',
              page: null,
              quote: 'Previously saved public snapshot',
              kind: 'reported',
            },
          ],
          notes: [],
          excerpts: [],
        },
        reviewRequired: true,
        warnings: [],
        tablePages: [],
        checks: [],
      },
    };
    (store.state.companyRuns ||= []).push(legacy);
    await store.persist();
    const saved = structuredClone(legacy);

    const searchQueries = ['abc', '你好', 'AAPL', 'tsla', 'BRK.B'];
    for (const query of searchQueries) {
      const response = await request(
        `/api/companies/search?q=${encodeURIComponent(query)}`,
        alice.headers
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        query,
        candidates: [],
        limitedToListed: true,
        source: 'cninfo',
        truncated: false,
      });
    }
    for (const securityCode of ['AAPL', 'TSLA', 'BRK.B']) {
      const response = await request('/api/company-runs', alice.headers, {
        ...legacy.input,
        securityCode,
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'COMPANY_MARKET_UNSUPPORTED');
    }
    const retry = await request(
      '/api/company-runs',
      { ...alice.headers, 'Idempotency-Key': legacy.agent!.requestKey! },
      legacy.input
    );
    assert.equal(retry.status, 400);
    assert.equal((await retry.json()).code, 'COMPANY_MARKET_UNSUPPORTED');
    const resume = await request(`/api/company-runs/${legacy.id}/resume`, alice.headers, {
      revision: legacy.agent!.revision,
    });
    assert.equal(resume.status, 400);
    assert.equal((await resume.json()).code, 'COMPANY_MARKET_UNSUPPORTED');
    const researchRequests = [
      ['context', {}],
      ['context', { refresh: true }],
      ['Context/', { refresh: true }],
      ['assessment', { refresh: true, focus: 'Historical query must remain read-only' }],
      ['industry', { period: '2025-12-31', refresh: true }],
      ['questions', { question: 'How did cash change?', basis: 'consolidated' }],
      ['challenge', { target: 'expansion', refresh: true }],
    ] as const;
    for (const [operation, body] of researchRequests) {
      const response = await request(
        `/api/company-runs/${legacy.id}/${operation}`,
        alice.headers,
        body
      );
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'COMPANY_MARKET_UNSUPPORTED');
    }
    assert.deepEqual(supplementaryCalls, []);
    assert.deepEqual(calls, { searches: searchQueries.length, research: 0 });
    assert.deepEqual(store.state.companyRuns, [saved]);

    const numericUs = {
      ...structuredClone(legacy),
      id: randomUUID(),
      input: { ...legacy.input, securityCode: '320193' },
      identity: { ...legacy.identity!, securityCode: '320193' },
      context: { ...legacy.context!, securityCode: '320193' },
    };
    store.state.companyRuns.push(numericUs);
    const numericRefresh = await request(
      `/api/company-runs/${numericUs.id}/context`,
      alice.headers,
      { refresh: true }
    );
    assert.equal(numericRefresh.status, 400);
    assert.equal((await numericRefresh.json()).code, 'COMPANY_MARKET_UNSUPPORTED');
    assert.deepEqual(supplementaryCalls, []);
    store.state.companyRuns.pop();

    for (const historical of [legacy, numericUs]) {
      const usGap = {
        ...structuredClone(historical),
        id: randomUUID(),
        informationGap: { name: 'Historical US gap', reason: 'Legacy incomplete record' },
      };
      const before = structuredClone(usGap);
      store.state.companyRuns.push(usGap);
      for (const [operation, body] of researchRequests) {
        const response = await request(
          `/api/company-runs/${usGap.id}/${operation}`,
          alice.headers,
          body
        );
        assert.equal(response.status, 400);
        assert.equal((await response.json()).code, 'COMPANY_MARKET_UNSUPPORTED');
      }
      assert.deepEqual(usGap, before);
      const detail = await request(`/api/company-runs/${usGap.id}`, alice.headers);
      assert.equal(detail.status, 200);
      assert.deepEqual(await detail.json(), before);
      assert.deepEqual(supplementaryCalls, []);
      assert.deepEqual(calls, { searches: searchQueries.length, research: 0 });
      store.state.companyRuns.pop();
    }
    assert.deepEqual(store.state.companyRuns, [saved]);

    const localGap: CompanyResearchRun = {
      id: randomUUID(),
      input: { securityCode: '', orgId: '', year: 2025, purpose: 'external', useModel: true },
      status: 'ready',
      createdAt: now,
      updatedAt: now,
      trace: [],
      announcements: [],
      model: { requested: true, status: 'not-configured' },
      informationGap: { name: '未上市制造公司', reason: 'No matching supported listed issuer' },
      contextStatus: 'ready',
      context: {
        ...legacy.context!,
        securityCode: '',
        orgId: '',
        companyName: '未上市制造公司',
        status: 'unavailable',
      },
    };
    localGapId = localGap.id;
    store.state.companyRuns.push(localGap);
    const localContext = await request(`/api/company-runs/${localGap.id}/context`, alice.headers, {
      refresh: true,
    });
    assert.equal(localContext.status, 200);
    assert.deepEqual(await localContext.json(), localGap);
    const localQuestion = await request(
      `/api/company-runs/${localGap.id}/questions`,
      alice.headers,
      { question: '还缺少哪些资料？', basis: 'consolidated' }
    );
    assert.equal(localQuestion.status, 200);
    assert.equal((await localQuestion.json()).mode, 'rules-fallback');
    assert.deepEqual(supplementaryCalls, []);
    store.state.companyRuns.pop();
    await store.persist();
    assert.deepEqual(store.state.companyRuns, [saved]);

    const detail = await request(`/api/company-runs/${legacy.id}`, alice.headers);
    assert.equal(detail.status, 200);
    assert.deepEqual(await detail.json(), saved);
    const challenge = await request(`/api/company-runs/${legacy.id}/challenge`, alice.headers);
    assert.equal(challenge.status, 200);
    assert.deepEqual(await challenge.json(), { challenge: null, stale: false });
    const adopt = await request(`/api/company-runs/${legacy.id}/adopt`, alice.headers, {});
    assert.equal(adopt.status, 409);
    assert.equal((await adopt.json()).code, 'COMPANY_PREVIEW_NOT_READY');
    const original = await request(`/api/company-runs/${legacy.id}/file`, alice.headers);
    assert.equal(original.status, 200);
    assert.equal(original.headers.get('content-type'), 'application/octet-stream');
    assert.match(original.headers.get('content-disposition')!, /^attachment;/);
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
    assert.equal((await request(`/api/company-runs/${legacy.id}`, bob.headers)).status, 404);
    assert.equal((await request(`/api/company-runs/${legacy.id}/file`, bob.headers)).status, 404);

    const aShare = await request('/api/companies/search?q=300893', alice.headers);
    assert.equal(aShare.status, 200);
    assert.deepEqual((await aShare.json()).candidates, [identity]);
    const created = await request('/api/company-runs', alice.headers, {
      securityCode: identity.securityCode,
      orgId: identity.orgId,
      year: 2025,
    });
    assert.equal(created.status, 202);
    await application.waitForIdle();
    assert.deepEqual(calls, { searches: searchQueries.length + 1, research: 1 });

    await new Promise<void>((resolve) => server.close(() => resolve()));
    application.auth.close();
    application = await createApp({
      root: process.cwd(),
      dataDir: directory,
      model: {},
      companyService: service,
      companyContextService: contextService,
      companyChallengeService: challengeService,
    });
    server = application.app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const restored = await request(`/api/company-runs/${legacy.id}`, alice.headers);
    assert.equal(restored.status, 200);
    assert.deepEqual(await restored.json(), saved);
    const list = await request('/api/company-runs', alice.headers);
    assert.equal(list.status, 200);
    assert.ok(((await list.json()) as CompanyResearchRun[]).some((run) => run.id === legacy.id));
    assert.deepEqual(calls, { searches: searchQueries.length + 1, research: 1 });
    assert.deepEqual(supplementaryCalls, []);
  } finally {
    await application.waitForIdle();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    application.auth.close();
    await rm(directory, { recursive: true, force: true });
  }
});
