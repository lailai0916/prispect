import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AuthSession, CompanyResearchRun } from '../shared/contracts.js';
import { createApp } from '../server/app.js';
import { answerCompanyQuestion } from '../server/company-questions.js';
import { runCompanyResearchAgent } from '../server/company-research-agent.js';
import { contextAmountFields, type CompanyContextSnapshot } from '../shared/company-workspace.js';

const identity = {
  securityCode: '600519',
  orgId: 'gssh0600519',
  shortName: '贵州茅台',
  companyName: '贵州茅台酒股份有限公司',
  exchange: 'sse' as const,
  sourceUrl: 'https://www.cninfo.com.cn/',
};
const snapshot = (): CompanyContextSnapshot => ({
  version: 1,
  securityCode: '600519',
  orgId: 'gssh0600519',
  companyName: '贵州茅台',
  fetchedAt: new Date().toISOString(),
  status: 'partial',
  financials: [
    {
      period: '2025-12-31',
      annual: true,
      noticeDate: null,
      amounts: Object.fromEntries(
        contextAmountFields.map((field) => [field, field === 'ocf' ? '80.00' : null])
      ) as any,
      ratios: { grossMargin: null, roe: null, revenueGrowth: null },
      auditOpinion: null,
      fieldSources: { ocf: 'test' },
      sourceUrls: ['https://www.cninfo.com.cn/'],
      originalUrl: null,
    },
  ],
  sources: [],
  comparisons: [],
  profile: {},
  shareholders: [],
  announcements: [],
  news: [],
  verificationLinks: [],
  warnings: [],
});
test('C context jobs are deduplicated, tenant-scoped, durable and keep earlier data after refresh failure', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-version-c-'));
  let calls = 0,
    fail = false,
    release: (() => void) | undefined;
  const questionChoices: boolean[] = [];
  const contextRefreshChoices: (boolean | undefined)[] = [];
  const researchRefreshChoices: (boolean | undefined)[] = [];
  const gate = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  const app = await createApp({
    dataDir: directory,
    model: {},
    companyService: {
      searchCompanies: async (query) => ({
        query,
        candidates: query === '未上市制造公司' ? [] : [identity],
        limitedToListed: true,
        source: 'cninfo',
        truncated: false,
      }),
      runCompanyResearch: async () => ({
        identity,
        announcements: [],
        stoppedReason: 'fixture without original',
        model: { requested: false, status: 'not-requested' },
      }),
    },
    companyContextService: {
      searchCompanies: async (query) => ({
        query,
        candidates: query === '未上市制造公司' ? [] : [identity],
        limitedToListed: true,
        source: 'cninfo',
        truncated: false,
      }),
      context: async (_identity, options) => {
        calls++;
        contextRefreshChoices.push(options?.bypassCache);
        await gate();
        if (fail) throw Error('provider failed');
        const value = snapshot();
        await options?.onSnapshot?.(structuredClone(value));
        return value;
      },
      industry: async () => {
        throw Error('not available');
      },
      // Account/context behavior is isolated from the separately tested full public collector.
      research: (run, model, options) => {
        researchRefreshChoices.push(options.bypassCache);
        return runCompanyResearchAgent(run, model, { ...options, collectPublicSignals: false });
      },
      question: async (run, q, basis, useModel, model) => {
        questionChoices.push(useModel);
        return answerCompanyQuestion(run, q, basis, useModel, model);
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
      body: JSON.stringify({ email, name: 'C acceptance', password: 'version-c-acceptance-pass' }),
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
    const owner = await register('owner@example.test'),
      other = await register('other@example.test');
    const call = (
      url: string,
      body?: unknown,
      headers = owner,
      method = body === undefined ? 'GET' : 'POST'
    ) =>
      fetch(`${base}/api${url}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    assert.equal(
      (
        await fetch(`${base}/api/company-gaps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
      401
    );
    const created = await call('/company-runs', {
      securityCode: '600519',
      orgId: 'gssh0600519',
      year: 2025,
      purpose: 'handover',
      researchMode: 'deep',
    });
    assert.equal(created.status, 202);
    const run = (await created.json()) as CompanyResearchRun;
    await app.waitForIdle();
    const first = await call(`/company-runs/${run.id}/context`, {});
    assert.equal(first.status, 202);
    const duplicate = await call(`/company-runs/${run.id}/context`, {});
    assert.equal(duplicate.status, 202);
    assert.equal(calls, 1);
    assert.equal((await call(`/company-runs/${run.id}/context`, {}, other)).status, 404);
    const summaries = await (await call('/company-records')).json();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].name, identity.shortName);
    assert.equal(summaries[0].deletionBlocked, true);
    assert.equal(summaries[0].context, undefined);
    assert.equal(summaries[0].preview, undefined);
    assert.deepEqual(await (await call('/company-records', undefined, other)).json(), []);

    assert.equal((await call(`/company-runs/${run.id}`, undefined, owner, 'DELETE')).status, 409);
    release!();
    await app.waitForIdle();
    const ready = (await (await call(`/company-runs/${run.id}`)).json()) as CompanyResearchRun;
    assert.equal(ready.contextStatus, 'ready');
    assert.equal((await (await call('/company-records')).json())[0].deletionBlocked, false);
    assert.equal(ready.input.purpose, 'handover');
    assert.equal(ready.context?.financials[0]?.amounts.ocf, '80.00');
    assert.equal((await call(`/company-runs/${run.id}/context`, {})).status, 200);
    assert.equal(calls, 1);
    assert.deepEqual(researchRefreshChoices, []);
    assert.equal((await call(`/company-runs/${run.id}/assessment`, {})).status, 202);
    await app.waitForIdle();
    for (const choice of [undefined, false, true]) {
      const answer = await call(`/company-runs/${run.id}/questions`, {
        question: '现金和利润有什么差异？',
        basis: 'parent',
        ...(choice === undefined ? {} : { useModel: choice }),
      });
      assert.equal(answer.status, 200);
      assert.equal((await answer.json()).mode, 'rules-fallback');
    }
    assert.deepEqual(questionChoices, [true, true, true]);
    assert.equal(
      (
        await call(
          `/company-runs/${run.id}/questions`,
          { question: '现金', basis: 'parent' },
          other
        )
      ).status,
      404
    );
    fail = true;
    await call(`/company-runs/${run.id}/context`, { refresh: true });
    release!();
    await app.waitForIdle();
    const failed = (await (await call(`/company-runs/${run.id}`)).json()) as CompanyResearchRun;
    assert.equal(failed.contextStatus, 'failed');
    assert.equal(failed.context?.fetchedAt, ready.context?.fetchedAt);
    assert.equal(failed.questions?.length, 3);
    assert.deepEqual(contextRefreshChoices, [false, true]);
    assert.deepEqual(researchRefreshChoices, [false]);
    assert.equal((await call(`/company-runs/${run.id}/assessment`, { refresh: true })).status, 202);
    await app.waitForIdle();
    assert.deepEqual(researchRefreshChoices, [false, true]);
    const gap = await call('/company-gaps', {
      name: '未上市制造公司',
      year: 2025,
      purpose: 'external',
    });
    assert.equal(gap.status, 201);
    const gapRun = (await gap.json()) as CompanyResearchRun;
    assert.equal(gapRun.informationGap?.name, '未上市制造公司');
    assert.equal(gapRun.context?.financials.length, 0);
    assert.equal(gapRun.input.researchMode, 'financial');
    assert.equal(gapRun.input.useModel, false);
    assert.equal(gapRun.model.requested, false);
    assert.equal(gapRun.model.status, 'not-requested');
    assert.equal(
      (await call(`/company-runs/${gapRun.id}/industry`, { period: '2025-12-31' })).status,
      422
    );
    const store = await app.workspaceForUser(
      ((await (await call('/auth/session')).json()) as AuthSession).user!.id
    );
    const persisted = JSON.parse(
      await (
        await import('node:fs/promises')
      ).readFile(path.join(store.dataDir, 'workspace.json'), 'utf8')
    );
    assert.ok(
      persisted.companyRuns.some(
        (item: CompanyResearchRun) => item.id === run.id && item.questions?.length === 3
      )
    );
  } finally {
    release?.();
    await app.waitForIdle();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    app.auth.close();
    await rm(directory, { recursive: true, force: true });
  }
});
