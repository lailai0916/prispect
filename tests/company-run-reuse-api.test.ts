import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';
import type { AuthSession, CompanyResearchRun } from '../shared/contracts.js';

const input = { securityCode: '600519', orgId: 'gssh0600519', year: 2025, purpose: 'external' };

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-run-reuse-'));
  let calls = 0;
  let gate: Promise<void> | undefined;
  let release!: () => void;
  let started = Promise.resolve();
  let markStarted = () => {};
  const application = await createApp({
    root: process.cwd(),
    dataDir: directory,
    model: {},
    companyService: {
      searchCompanies: async (query) => ({
        query,
        candidates: [],
        limitedToListed: true,
        source: 'cninfo',
        truncated: false,
      }),
      runCompanyResearch: async (scope) => {
        calls++;
        markStarted();
        if (gate) await gate;
        return {
          identity: {
            securityCode: scope.securityCode,
            orgId: scope.orgId,
            shortName: '合成缓存案例',
            companyName: null,
            exchange: 'sse',
            sourceUrl: 'https://www.cninfo.com.cn/',
          },
          announcements: [],
          model: { requested: true, status: 'not-configured' },
        };
      },
    },
  });
  const server = application.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const register = async (email: string) => {
    const response = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: '缓存测试', password: 'Cached-Research-Password42!' }),
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
  type Owner = Awaited<ReturnType<typeof register>>;
  const call = (
    owner: Owner,
    url = '/company-runs',
    body?: unknown,
    method = 'POST',
    requestKey?: string
  ) =>
    fetch(`${base}/api${url}`, {
      method,
      headers: { ...owner.headers, ...(requestKey ? { 'Idempotency-Key': requestKey } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return {
    ...application,
    directory,
    register,
    call,
    calls: () => calls,
    hold: () => {
      started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    waitForStart: async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          started,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(Error('Research did not start within its test deadline')),
              5000
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
    release: () => {
      release?.();
      gate = undefined;
    },
    dispose: async () => {
      release?.();
      await application.waitForIdle();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      application.auth.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('opt-in repeat search reuses own record during active work, at limits, without another execution', async () => {
  const f = await fixture();
  try {
    const alice = await f.register('reuse-alice@fixture.test');
    const bob = await f.register('reuse-bob@fixture.test');
    f.hold();
    const first = await f.call(alice, '/company-runs', { ...input, reuseExisting: true });
    assert.equal(first.status, 202);
    const created = (await first.json()) as CompanyResearchRun & { reused?: boolean };
    assert.equal(created.reused, undefined);
    assert.equal('reuseExisting' in created.input, false);
    // HTTP202 reserves the job before its first durable progress write finishes.
    // Wait for provider entry rather than assuming concurrent disk timing.
    await f.waitForStart();
    const repeat = await f.call(alice, '/company-runs', { ...input, reuseExisting: true });
    assert.equal(repeat.status, 200);
    const reused = (await repeat.json()) as CompanyResearchRun & { reused?: boolean };
    assert.equal(reused.id, created.id);
    assert.equal(reused.reused, true);
    assert.equal(f.calls(), 1);
    assert.equal(
      (await f.call(alice, '/company-runs', input)).status,
      429,
      'legacy duplicate request still respects busy protection'
    );
    const bobRun = await f.call(bob, '/company-runs', { ...input, reuseExisting: true });
    assert.equal(bobRun.status, 202);
    assert.notEqual(((await bobRun.json()) as CompanyResearchRun).id, created.id);
    f.release();
    await f.waitForIdle();
    const store = await f.workspaceForUser(alice.userId);
    assert.equal('reused' in store.state.companyRuns![0]!, false);
    assert.equal(store.state.companyRuns!.length, 1);
    for (let index = 1; index < 30; index++)
      store.state.companyRuns!.push({
        ...structuredClone(store.state.companyRuns![0]!),
        id: randomUUID(),
        input: { ...store.state.companyRuns![0]!.input, year: 2024 },
      });
    await store.persist();
    const before = f.calls();
    for (let index = 0; index < 14; index++) {
      const response = await f.call(alice, '/company-runs', { ...input, reuseExisting: true });
      assert.equal(
        response.status,
        200,
        'cached openings do not consume creation limit or rate allowance'
      );
      assert.equal(((await response.json()) as CompanyResearchRun).id, created.id);
    }
    assert.equal(f.calls(), before);
    const summary = await f.call(alice, '/company-records', undefined, 'GET');
    assert.equal(summary.status, 200);
    assert.equal((await summary.json())[0].input.purpose, 'external');
    assert.equal(
      (await f.call(alice, '/company-runs', { ...input, year: 2023, reuseExisting: true })).status,
      429
    );
  } finally {
    await f.dispose();
  }
});

test('reuse is scope-specific, preserves idempotency identity and cannot resurrect a deleted run', async () => {
  const f = await fixture();
  try {
    const owner = await f.register('reuse-scope@fixture.test');
    const key = randomUUID();
    const first = await f.call(
      owner,
      '/company-runs',
      { ...input, reuseExisting: true },
      'POST',
      key
    );
    const created = (await first.json()) as CompanyResearchRun;
    assert.equal(first.status, 202);
    await f.waitForIdle();
    assert.equal(
      (
        await f.call(
          owner,
          '/company-runs',
          { ...input, year: 2024, reuseExisting: true },
          'POST',
          key
        )
      ).status,
      409
    );
    const same = await f.call(
      owner,
      '/company-runs',
      { ...input, useModel: false, reuseExisting: true },
      'POST',
      key
    );
    assert.equal(same.status, 200);
    assert.equal(((await same.json()) as CompanyResearchRun).id, created.id);
    for (const changed of [
      { purpose: 'handover' },
      { year: 2024 },
      { orgId: 'DifferentOrg' },
      { securityCode: '000001' },
    ]) {
      const response = await f.call(owner, '/company-runs', {
        ...input,
        ...changed,
        reuseExisting: true,
      });
      assert.equal(response.status, 202);
      assert.notEqual(((await response.json()) as CompanyResearchRun).id, created.id);
      await f.waitForIdle();
    }
    const removal = await f.call(owner, `/company-runs/${created.id}`, undefined, 'DELETE');
    assert.equal(removal.status, 200);
    const fresh = await f.call(owner, '/company-runs', { ...input, reuseExisting: true });
    assert.equal(fresh.status, 202);
    assert.notEqual(((await fresh.json()) as CompanyResearchRun).id, created.id);
    const invalid = await f.call(owner, '/company-runs', { ...input, reuseExisting: 'yes' });
    assert.equal(invalid.status, 400);
  } finally {
    await f.dispose();
  }
});
