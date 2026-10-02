import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';
import { initialCompanyGraphProgress } from '../server/company-agent.js';
import type { AuthSession, CompanyResearchRun } from '../shared/contracts.js';

test('owner-only cancellation/resume, revision checks and duplicate request identity are enforced by actual HTTP routes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-company-http-'));
  let invocations = 0,
    resumedBudget = -1;
  let secondStarted!: () => void, releaseSecond!: () => void;
  const secondRunning = new Promise<void>((resolve) => {
    secondStarted = resolve;
  });
  const secondHeld = new Promise<void>((resolve) => {
    releaseSecond = resolve;
  });
  const identity = {
    securityCode: '300750',
    orgId: 'GD165627',
    shortName: '测试公司',
    companyName: null,
    exchange: 'szse' as const,
    sourceUrl: 'https://www.cninfo.com.cn/',
  };
  const application = await createApp({
    root: process.cwd(),
    dataDir: directory,
    model: {},
    companyService: {
      searchCompanies: async (query) => ({
        query,
        candidates: [identity],
        limitedToListed: true,
        source: 'cninfo',
        truncated: false,
      }),
      runCompanyResearch: async (_input, options) => {
        invocations++;
        const progress = initialCompanyGraphProgress(options.previousProgress);
        if (invocations === 1) {
          progress.budget.sourceRequests = 2;
          await options.onProgress?.(progress);
          await new Promise((_, reject) => {
            const abort = () => reject(new Error('fixture cancelled'));
            options.signal?.addEventListener('abort', abort, { once: true });
            if (options.signal?.aborted) abort();
          });
        }
        resumedBudget = progress.budget.sourceRequests;
        if (invocations === 2) {
          secondStarted();
          await secondHeld;
          assert.equal(options.signal?.aborted, false, 'a delayed g1 cancel cannot abort g2');
        }
        progress.recoverable = false;
        return {
          identity,
          announcements: [],
          model: { requested: false, status: 'not-requested' },
          agent: progress,
        };
      },
    },
  });
  const server = application.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const register = async (email: string) => {
    const response = await fetch(base + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: '图恢复验收', password: 'V7m#pQ2z!L9w@R4s' }),
    });
    assert.equal(response.status, 201);
    const session = (await response.json()) as AuthSession;
    return {
      Cookie: response.headers
        .getSetCookie()
        .map((item) => item.split(';')[0])
        .join('; '),
      'X-CSRF-Token': session.csrfToken!,
      'Content-Type': 'application/json',
    };
  };
  try {
    const owner = await register('graph-owner@fixture.test'),
      other = await register('graph-other@fixture.test');
    const input = { securityCode: '300750', orgId: 'GD165627', year: 2025, useModel: false };
    const requestKey = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const headers = { ...owner, 'Idempotency-Key': requestKey };
    const created = await fetch(base + '/api/company-runs', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    assert.equal(created.status, 202);
    const first = (await created.json()) as CompanyResearchRun;
    const duplicate = await fetch(base + '/api/company-runs', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    assert.equal(duplicate.status, 200);
    assert.equal(((await duplicate.json()) as CompanyResearchRun).id, first.id);
    const mismatch = await fetch(base + '/api/company-runs', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...input, year: 2024 }),
    });
    assert.equal(mismatch.status, 409);
    for (const endpoint of ['', '/file'])
      assert.equal(
        (await fetch(base + `/api/company-runs/${first.id}${endpoint}`, { headers: other })).status,
        404
      );
    for (const action of ['cancel', 'resume'])
      assert.equal(
        (
          await fetch(base + `/api/company-runs/${first.id}/${action}`, {
            method: 'POST',
            headers: other,
            body: JSON.stringify({ revision: 1 }),
          })
        ).status,
        404
      );
    const cancelled = await fetch(base + `/api/company-runs/${first.id}/cancel`, {
      method: 'POST',
      headers: owner,
      body: JSON.stringify({ revision: first.agent!.revision }),
    });
    assert.equal(cancelled.status, 202);
    let stopped!: CompanyResearchRun;
    for (let attempt = 0; attempt < 100; attempt++) {
      stopped = (await (
        await fetch(base + `/api/company-runs/${first.id}`, { headers: owner })
      ).json()) as CompanyResearchRun;
      if (stopped.status === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(stopped.status, 'failed');
    assert.equal(stopped.agent?.recoverable, true);
    const stale = await fetch(base + `/api/company-runs/${first.id}/resume`, {
      method: 'POST',
      headers: owner,
      body: JSON.stringify({ revision: 1 }),
    });
    assert.equal(stale.status, 409);
    const scope = await fetch(base + `/api/company-runs/${first.id}/resume`, {
      method: 'POST',
      headers: owner,
      body: JSON.stringify({ revision: stopped.agent!.revision, year: 2024 }),
    });
    assert.equal(scope.status, 409);
    const resumed = await fetch(base + `/api/company-runs/${first.id}/resume`, {
      method: 'POST',
      headers: owner,
      body: JSON.stringify({ revision: stopped.agent!.revision }),
    });
    assert.equal(resumed.status, 202);
    await secondRunning;
    const delayedCancel = await fetch(base + `/api/company-runs/${first.id}/cancel`, {
      method: 'POST',
      headers: owner,
      body: JSON.stringify({ revision: first.agent!.revision }),
    });
    assert.equal(delayedCancel.status, 409);
    assert.equal(((await delayedCancel.json()) as { code: string }).code, 'COMPANY_STALE_REVISION');
    releaseSecond();
    await application.waitForIdle();
    const complete = (await (
      await fetch(base + `/api/company-runs/${first.id}`, { headers: owner })
    ).json()) as CompanyResearchRun;
    assert.equal(complete.status, 'ready');
    assert.equal(invocations, 2);
    assert.equal(resumedBudget, 2, 'route recovery cannot refund prior request budget');
    assert.ok(complete.agent!.revision > stopped.agent!.revision);
    const safe = JSON.stringify(complete);
    for (const word of ['checkpoints.sqlite', 'apiKey', 'directory', 'workspace.json'])
      assert.ok(!safe.includes(word));
    assert.deepEqual(
      await (await fetch(base + '/api/company-runs', { headers: other })).json(),
      []
    );
  } finally {
    releaseSecond();
    await application.waitForIdle();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    application.auth.close();
    await rm(directory, { recursive: true, force: true });
  }
});

for (const interruption of ['publication-failure', 'cancel-retain', 'commit-cancel'] as const) {
  test(`completed graph publication recovers exactly once across ${interruption}`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-company-publish-'));
    const buffer = Buffer.from('%PDF-1.7\nexplicit source-storage fixture\n');
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    let calls = 0;
    let reached!: () => void, release!: () => void;
    const atInterruption = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const identity = {
      securityCode: '300750',
      orgId: 'GD165627',
      shortName: '测试公司',
      companyName: null,
      exchange: 'szse' as const,
      sourceUrl: 'https://www.cninfo.com.cn/',
    };
    const application = await createApp({
      root: process.cwd(),
      dataDir: directory,
      model: {},
      companyService: {
        searchCompanies: async (query) => ({
          query,
          candidates: [identity],
          limitedToListed: true,
          source: 'cninfo',
          truncated: false,
        }),
        runCompanyResearch: async (_input, options) => {
          calls++;
          // This route fixture represents a graph that has completed its public
          // work. The separate graph test exercises real SQLite END replay.
          await mkdir(options.checkpoint!.directory, { recursive: true });
          await writeFile(path.join(options.checkpoint!.directory, 'scope.json'), '{}');
          const agent = initialCompanyGraphProgress(options.previousProgress);
          agent.budget.sourceRequests = 1;
          agent.recoverable = false;
          await options.onProgress?.(agent);
          return {
            identity,
            announcements: [],
            buffer,
            agent,
            model: { requested: false, status: 'not-requested' },
            preview: {
              reviewRequired: true,
              warnings: [],
              tablePages: [],
              checks: [],
              material: {
                company: '测试公司',
                shortName: '测试公司',
                title: '2025 年度来源',
                filename: 'annual.pdf',
                origin: 'public-report',
                documentDate: '2026-03-10',
                sha256,
                sourceUrl: 'https://static.cninfo.com.cn/finalpage/2026-03-10/15.PDF',
                observations: [],
                notes: [],
                excerpts: [],
              },
            },
          };
        },
      },
    });
    const server = application.app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const registration = await fetch(base + '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `publication-${interruption}@fixture.test`,
          name: '保存边界',
          password: 'V7m#pQ2z!L9w@R4s',
        }),
      });
      assert.equal(registration.status, 201);
      const session = (await registration.json()) as AuthSession;
      const headers = {
        Cookie: registration.headers
          .getSetCookie()
          .map((item) => item.split(';')[0])
          .join('; '),
        'X-CSRF-Token': session.csrfToken!,
        'Content-Type': 'application/json',
      };
      const store = await application.workspaceForUser(session.user!.id);
      const originalPersist = store.persist.bind(store);
      let interrupted = false;
      if (interruption === 'cancel-retain') {
        const retain = store.retainUpload.bind(store);
        store.retainUpload = async (...args) => {
          const id = await retain(...args);
          if (!interrupted) {
            interrupted = true;
            reached();
            await hold;
          }
          return id;
        };
      } else {
        store.persist = async () => {
          if (!interrupted && store.state.companyRuns?.some((run) => run.status === 'ready')) {
            interrupted = true;
            if (interruption === 'publication-failure')
              throw new Error('fixture durable write failure');
            reached();
            await hold;
          }
          await originalPersist();
        };
      }
      const created = await fetch(base + '/api/company-runs', {
        method: 'POST',
        headers,
        body: JSON.stringify({ securityCode: '300750', orgId: 'GD165627', year: 2025 }),
      });
      assert.equal(created.status, 202);
      const first = (await created.json()) as CompanyResearchRun;
      if (interruption !== 'publication-failure') {
        await atInterruption;
        const cancelled = await fetch(base + `/api/company-runs/${first.id}/cancel`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ revision: first.agent!.revision }),
        });
        assert.equal(cancelled.status, interruption === 'commit-cancel' ? 409 : 202);
        release();
      }
      await application.waitForIdle();
      const stopped = (await (
        await fetch(base + `/api/company-runs/${first.id}`, { headers })
      ).json()) as CompanyResearchRun;
      const firstUploadId = stopped.preview!.material.uploadId;
      assert.ok(firstUploadId);
      assert.equal(Object.keys(store.state.uploads).length, 1);
      if (interruption === 'commit-cancel') {
        assert.equal(stopped.status, 'ready');
        assert.equal(stopped.agent!.cancelRequested, false);
        assert.equal(calls, 1);
      } else {
        assert.equal(
          stopped.status,
          'failed',
          'a cancellation or failed durable publication cannot become ready'
        );
        assert.equal(
          stopped.agent!.recoverable,
          true,
          'completed graph must remain recoverable until workspace publication succeeds'
        );
        const resumed = await fetch(base + `/api/company-runs/${first.id}/resume`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ revision: stopped.agent!.revision }),
        });
        assert.equal(resumed.status, 202);
        await application.waitForIdle();
        const result = (await (
          await fetch(base + `/api/company-runs/${first.id}`, { headers })
        ).json()) as CompanyResearchRun;
        assert.equal(result.status, 'ready');
        assert.equal(
          result.preview!.material.uploadId,
          firstUploadId,
          'republishing reuses the retained original'
        );
        assert.equal(Object.keys(store.state.uploads).length, 1);
        assert.equal(result.agent!.budget.sourceRequests, 1);
        assert.equal(calls, 2);
      }
    } finally {
      release();
      await application.waitForIdle();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      application.auth.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
