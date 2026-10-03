import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import type { Request, Response } from 'express';
import { createApp } from '../server/app.js';
import { AuthStore, VISITOR_COOKIE, VISITOR_TTL_MS } from '../server/auth.js';
import {
  GuestWorkspaceBudget,
  GuestWorkspaceStore,
  GUEST_TOTAL_BYTES,
  GUEST_WORKSPACE_LIMIT,
} from '../server/guest-workspace.js';
import type { AuthSession, CompanyIdentity, CompanyResearchRun } from '../shared/contracts.js';
import type { CompanyContextSnapshot } from '../shared/company-workspace.js';
import { deriveCompanyAssessment } from '../shared/company-assessment.js';

const issuer: CompanyIdentity = {
  securityCode: '600519',
  orgId: 'gssh0600519',
  shortName: '贵州茅台',
  companyName: '贵州茅台酒股份有限公司',
  exchange: 'sse',
  sourceUrl: 'https://www.cninfo.com.cn/',
};
const snapshot: CompanyContextSnapshot = {
  version: 1,
  securityCode: issuer.securityCode,
  orgId: issuer.orgId,
  companyName: issuer.companyName!,
  fetchedAt: new Date().toISOString(),
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
};
const researchInput = {
  securityCode: issuer.securityCode,
  orgId: issuer.orgId,
  year: 2025,
  purpose: 'external',
  researchMode: 'financial',
};
async function harness(automatic = false) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-visitor-'));
  const documentationCalls: boolean[] = [];
  const companyQuestions: string[] = [];
  const automaticInputs: CompanyResearchRun[] = [];
  const publicFile = Buffer.from('%PDF-1.7 public-original-isolation-fixture');
  const material = JSON.parse(
    await readFile(path.join(process.cwd(), 'data/cases/songyuan-2025.json'), 'utf8')
  );
  const checkpoints: unknown[] = [];
  const service = await createApp({
    dataDir: directory,
    model: automatic ? { apiKey: 'isolated-visitor-automatic-fixture' } : {},
    guestDiskStatistics: async () => ({
      blocks: 10_000_000,
      bfree: 8_000_000,
      bavail: 8_000_000,
      bsize: 4096,
    }),
    companyDirectory: null,
    companyService: {
      searchCompanies: async (query) => ({
        query,
        candidates: [issuer],
        truncated: false,
        limitedToListed: true,
        source: 'cninfo',
      }),
      runCompanyResearch: async (_input, options) => {
        checkpoints.push(options.checkpoint);
        return {
          identity: issuer,
          announcements: [],
          preview: {
            material: {
              ...material,
              company: issuer.companyName,
              shortName: issuer.shortName,
              filename: 'annual.pdf',
              rawSourceId: undefined,
              sha256: createHash('sha256').update(publicFile).digest('hex'),
            },
            reviewRequired: true,
            warnings: [],
            checks: [],
            tablePages: [],
          },
          buffer: publicFile,
          model: { requested: true, status: 'not-configured' },
        };
      },
    },
    companyContextService: {
      searchCompanies: async (query) => ({
        query,
        candidates: [issuer],
        truncated: false,
        limitedToListed: true,
        source: 'cninfo',
      }),
      context: async () => structuredClone(snapshot),
      industry: async () => {
        throw Error('Unexpected industry request');
      },
      question: async () => {
        throw Error('Unexpected report question');
      },
      research: async (run) => {
        automaticInputs.push(structuredClone(run));
        return { run, steps: [], toolCalls: 0, modelCalls: 1 };
      },
      assessment: async (run) => ({
        ...deriveCompanyAssessment(run),
        model: { status: 'completed', calls: 1, provider: 'isolated-visitor-fixture' },
      }),
    },
    assistantService: {
      wantsResearch: () => false,
      documentation: async (question, _locale, useModel) => {
        documentationCalls.push(useModel);
        return {
          question,
          text: '产品文档',
          citations: [],
          mode: 'rules',
          kind: 'documentation',
          createdAt: new Date().toISOString(),
          snapshotFetchedAt: '',
        };
      },
      question: async (run, question) => {
        companyQuestions.push(run.id);
        return {
          question,
          text: '公司公开资料',
          citations: [],
          mode: 'rules',
          createdAt: new Date().toISOString(),
          snapshotFetchedAt: run.context!.fetchedAt,
        };
      },
    },
  });
  const server = service.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = (
    route: string,
    cookie = '',
    csrf = '',
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST'
  ) =>
    fetch(base + route, {
      method,
      headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const visitor = async () => {
    const response = await call('/api/auth/session');
    assert.equal(response.status, 200);
    const session = (await response.json()) as AuthSession;
    const cookie = response.headers.getSetCookie()[0]!.split(';')[0]!;
    assert.match(response.headers.getSetCookie()[0]!, /HttpOnly/);
    assert.match(response.headers.getSetCookie()[0]!, /SameSite=Lax/);
    assert.match(response.headers.getSetCookie()[0]!, /Max-Age=604800/);
    assert.equal(session.user?.isGuest, true);
    return { cookie, csrf: session.csrfToken!, session };
  };
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await service.waitForIdle();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    service.auth.close();
  };
  return {
    ...service,
    directory,
    documentationCalls,
    companyQuestions,
    automaticInputs,
    call,
    visitor,
    publicFile,
    checkpoints,
    stop,
    close: async () => {
      await stop();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('visitors can search, create and reopen public research without accounts; ownership and private guards remain', async () => {
  const h = await harness();
  try {
    const alice = await h.visitor(),
      bob = await h.visitor();
    assert.notEqual(alice.session.user!.id, bob.session.user!.id);
    assert.equal((await h.call('/api/workspace', alice.cookie)).status, 200);
    assert.deepEqual(await (await h.call('/api/company-records', alice.cookie)).json(), []);
    assert.deepEqual(await readdir(path.join(h.directory, 'guests')).catch(() => []), []);
    assert.equal((await h.call('/api/company-runs/nonexistent', alice.cookie)).status, 404);
    assert.deepEqual(await readdir(path.join(h.directory, 'guests')).catch(() => []), []);
    assert.deepEqual(h.auth.db.prepare('SELECT count(*) AS n FROM "user"').get(), { n: 0 });
    assert.equal((await h.call('/api/companies/search?q=600519', alice.cookie)).status, 200);
    assert.equal(
      (
        await h.call('/api/company-runs', alice.cookie, alice.csrf, {
          ...researchInput,
          preview: { material: { uploadId: 'foreign-upload' } },
        })
      ).status,
      400
    );
    assert.equal(
      (
        await h.call('/api/company-runs', alice.cookie, alice.csrf, {
          ...researchInput,
          uploadId: 'foreign-upload',
        })
      ).status,
      400
    );
    assert.equal((await h.call('/api/company-runs', alice.cookie, '', researchInput)).status, 403);
    assert.equal(
      (await h.call('/api/company-runs', alice.cookie, bob.csrf, researchInput)).status,
      403
    );
    const created = await h.call('/api/company-runs', alice.cookie, alice.csrf, researchInput);
    assert.equal(created.status, 202, await created.clone().text());
    const run = (await created.json()) as CompanyResearchRun;
    await h.waitForIdle();
    assert.equal((await h.call(`/api/company-runs/${run.id}`, alice.cookie)).status, 200);
    assert.equal((await h.call(`/api/company-runs/${run.id}`, bob.cookie)).status, 404);
    const synced = (await (await h.call('/api/auth/session', alice.cookie)).json()) as AuthSession;
    assert.equal(synced.user!.id, alice.session.user!.id);
    assert.equal(synced.csrfToken, alice.csrf);
    const companyAnswer = await h.call('/api/assistant/messages', alice.cookie, alice.csrf, {
      question: '贵州茅台现金情况如何？',
      locale: 'zh',
      currentRunId: run.id,
    });
    assert.equal(companyAnswer.status, 200, await companyAnswer.clone().text());
    assert.equal((await companyAnswer.json()).kind, 'company');
    assert.deepEqual(h.companyQuestions, [run.id]);
    assert.equal(
      (
        await h.call('/api/assistant/messages', bob.cookie, bob.csrf, {
          question: '贵州茅台现金情况如何？',
          locale: 'zh',
          currentRunId: run.id,
        })
      ).status,
      404
    );
    const docs = await h.call('/api/assistant/messages', alice.cookie, alice.csrf, {
      question: '如何注册账号？',
      locale: 'zh',
    });
    assert.equal(docs.status, 200);
    assert.deepEqual(h.documentationCalls, [false]);
    const privateRoutes: [string, string, unknown?][] = [
      ['/api/account', 'GET'],
      ['/api/materials/preview', 'POST', {}],
      ['/api/materials', 'POST', {}],
      ['/api/tasks', 'POST', {}],
      ['/api/decisions', 'POST', {}],
      ['/api/reset', 'POST', {}],
      [`/api/company-runs/${run.id}/adopt`, 'POST', {}],
      [`/api/company-runs/${run.id}/%61dopt`, 'POST', {}],
      ['/api/auth/profile', 'PATCH', {}],
    ];
    for (const [route, method, body] of privateRoutes)
      assert.equal(
        (await h.call(route, alice.cookie, alice.csrf, body, method)).status,
        401,
        route
      );
    assert.equal((await h.call(`/api/company-runs/${run.id}/file`, alice.cookie)).status, 404);
    assert.equal((await h.call(`/api/company-runs/${run.id}/file`, bob.cookie)).status, 404);
    assert.deepEqual(await readdir(path.join(h.directory, 'users')).catch(() => []), []);
    assert.ok((await readdir(path.join(h.directory, 'guests'))).includes(alice.session.user!.id));
  } finally {
    await h.close();
  }
});

test('configured visitor automatic reports stay in their public workspace and never initialize account state or call the network', async () => {
  const h = await harness(true);
  try {
    const owner = await h.visitor(),
      other = await h.visitor();
    const created = await h.call('/api/company-runs', owner.cookie, owner.csrf, researchInput);
    assert.equal(created.status, 202, await created.clone().text());
    const run = (await created.json()) as CompanyResearchRun;
    await h.waitForIdle();
    const loaded = await h.call(`/api/company-runs/${run.id}`, owner.cookie);
    assert.equal(loaded.status, 200);
    const report = (await loaded.json()) as CompanyResearchRun;
    assert.equal(report.status, 'ready');
    assert.equal(report.assessmentStatus, 'ready');
    assert.equal(report.assessment?.model.provider, 'isolated-visitor-fixture');
    assert.deepEqual(
      h.automaticInputs.map((item) => item.id),
      [run.id]
    );
    assert.equal(h.automaticInputs[0]!.preview, undefined);
    assert.equal(h.automaticInputs[0]!.adoptedMaterialId, undefined);
    assert.equal((await h.call(`/api/company-runs/${run.id}`, other.cookie)).status, 404);
    assert.deepEqual(await readdir(path.join(h.directory, 'users')).catch(() => []), []);
    const registration = await h.call('/api/auth/register', '', '', {
      email: 'auto-account@example.test',
      name: 'Auto account',
      password: 'Copper!fjord7-Unusual-velvet',
    });
    assert.equal(registration.status, 201);
    assert.deepEqual(await readdir(path.join(h.directory, 'users')).catch(() => []), []);
    const realCookie = registration.headers
      .getSetCookie()
      .map((entry) => entry.split(';')[0])
      .join('; ');
    assert.equal((await h.call(`/api/company-runs/${run.id}`, realCookie)).status, 404);
    const diskState = JSON.parse(
      await readFile(
        path.join(h.directory, 'guests', owner.session.user!.id, 'workspace.json'),
        'utf8'
      )
    );
    assert.equal(diskState.companyRuns[0].assessment.model.provider, 'isolated-visitor-fixture');
    assert.deepEqual(diskState.materials, []);
    assert.deepEqual(diskState.tasks, []);
    assert.deepEqual(diskState.decisions, []);
  } finally {
    await h.close();
  }
});

test('a visitor can read its retained public original after restart, without disk checkpoints or cross-owner access', async () => {
  const h = await harness();
  let restarted: Awaited<ReturnType<typeof createApp>> | undefined;
  let server: ReturnType<typeof h.app.listen> | undefined;
  try {
    const owner = await h.visitor(),
      other = await h.visitor();
    const response = await h.call('/api/company-runs', owner.cookie, owner.csrf, {
      ...researchInput,
      researchMode: 'deep',
    });
    assert.equal(response.status, 202, await response.clone().text());
    const run = (await response.json()) as CompanyResearchRun;
    await h.waitForIdle();
    assert.deepEqual(h.checkpoints, [undefined]);
    const original = await h.call(`/api/company-runs/${run.id}/file`, owner.cookie);
    assert.equal(original.status, 200, await original.clone().text());
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), h.publicFile);
    assert.equal((await h.call(`/api/company-runs/${run.id}/file`, other.cookie)).status, 404);
    const registration = await h.call('/api/auth/register', '', '', {
      email: 'public-file-account@example.test',
      name: 'File account',
      password: 'Copper!fjord7-Unusual-velvet',
    });
    assert.equal(registration.status, 201);
    const realCookie = registration.headers
      .getSetCookie()
      .map((entry) => entry.split(';')[0])
      .join('; ');
    assert.equal((await h.call(`/api/company-runs/${run.id}/file`, realCookie)).status, 404);
    assert.deepEqual(
      await readdir(
        path.join(h.directory, 'guests', owner.session.user!.id, 'company-agent')
      ).catch(() => []),
      []
    );
    await h.stop();
    restarted = await createApp({
      dataDir: h.directory,
      model: {},
      companyDirectory: null,
      guestDiskStatistics: async () => ({
        blocks: 10_000_000,
        bfree: 8_000_000,
        bavail: 8_000_000,
        bsize: 4096,
      }),
    });
    server = restarted.app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const reopened = await fetch(`${base}/api/company-runs/${run.id}/file`, {
      headers: { Cookie: owner.cookie },
    });
    assert.equal(reopened.status, 200);
    assert.deepEqual(Buffer.from(await reopened.arrayBuffer()), h.publicFile);
    assert.equal(
      (
        await fetch(`${base}/api/company-runs/${run.id}/file`, {
          headers: { Cookie: other.cookie },
        })
      ).status,
      404
    );
  } finally {
    if (restarted) {
      await restarted.waitForIdle();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      restarted.auth.close();
    }
    await h.close();
  }
});

test('forged and expired visitors cannot mutate; signed-in accounts take precedence without migration', async () => {
  const h = await harness();
  try {
    const visitor = await h.visitor();
    const token = visitor.cookie.slice(VISITOR_COOKIE.length + 1);
    const altered = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
    assert.equal(
      (
        await h.call(
          '/api/company-runs',
          `${VISITOR_COOKIE}=${altered}`,
          visitor.csrf,
          researchInput
        )
      ).status,
      401
    );
    const renewed = (await (
      await h.call('/api/auth/session', `${VISITOR_COOKIE}=${altered}`)
    ).json()) as AuthSession;
    assert.notEqual(renewed.user!.id, visitor.session.user!.id);
    const secret = (await readFile(path.join(h.directory, 'auth-secret'), 'utf8')).trim();
    const issued = Date.now() - VISITOR_TTL_MS - 60_000;
    const payload = `${visitor.session.user!.id}.${issued}.${issued + VISITOR_TTL_MS}`;
    const signature = createHmac('sha256', secret)
      .update(`cashlens-visitor-v1:${payload}`)
      .digest('hex');
    assert.equal(
      (
        await h.call(
          '/api/company-runs',
          `${VISITOR_COOKIE}=${payload}.${signature}`,
          visitor.csrf,
          researchInput
        )
      ).status,
      401
    );
    const created = await h.call('/api/company-runs', visitor.cookie, visitor.csrf, researchInput);
    const run = (await created.json()) as CompanyResearchRun;
    await h.waitForIdle();
    const registered = await h.call('/api/auth/register', visitor.cookie, visitor.csrf, {
      email: 'visitor-account@example.test',
      name: 'Visitor account',
      password: 'Copper!fjord7-Unusual-velvet',
    });
    assert.equal(registered.status, 201, await registered.clone().text());
    const account = (await registered.json()) as AuthSession;
    assert.equal(account.user?.isGuest, undefined);
    const cookies =
      registered.headers
        .getSetCookie()
        .map((entry) => entry.split(';')[0])
        .join('; ') +
      '; ' +
      visitor.cookie;
    const session = (await (await h.call('/api/auth/session', cookies)).json()) as AuthSession;
    assert.equal(session.user!.id, account.user!.id);
    assert.equal(
      (await h.call('/api/company-runs', cookies, visitor.csrf, researchInput)).status,
      403
    );
    assert.deepEqual(await (await h.call('/api/company-runs', cookies)).json(), []);
    assert.equal((await h.call(`/api/company-runs/${run.id}`, cookies)).status, 404);
    assert.equal((await h.call('/api/account', cookies)).status, 200);
    assert.equal((await h.call(`/api/company-runs/${run.id}`, visitor.cookie)).status, 200);
    assert.deepEqual(h.auth.db.prepare('SELECT count(*) AS n FROM "user"').get(), { n: 1 });
  } finally {
    await h.close();
  }
});

test('production visitor cookies are secure and are not accepted by real account authentication', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-secure-visitor-'));
  const oldSecret = process.env.BETTER_AUTH_SECRET,
    oldOrigin = process.env.APP_ORIGIN;
  process.env.BETTER_AUTH_SECRET = 'secure-visitor-fixture-with-at-least-32-characters';
  process.env.APP_ORIGIN = 'https://prispect.com';
  let auth: AuthStore | undefined;
  try {
    auth = await AuthStore.open(directory, true);
    let cookieOptions: Record<string, unknown> | undefined;
    let value = '';
    const req = { method: 'GET', headers: {}, ip: '127.0.0.1' } as Request;
    const res = {
      cookie: (_name: string, token: string, options: Record<string, unknown>) => {
        value = token;
        cookieOptions = options;
      },
    } as Response;
    const visitor = await auth.workspaceSession(req, res);
    assert.equal(visitor?.user.isGuest, true);
    assert.equal(cookieOptions?.secure, true);
    assert.equal(cookieOptions?.httpOnly, true);
    req.headers.cookie = `${VISITOR_COOKIE}=${value}`;
    assert.equal(await auth.session(req), null);
    assert.equal((await auth.workspaceSession(req))?.user.id, visitor!.user.id);
  } finally {
    auth?.close();
    if (oldSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = oldSecret;
    if (oldOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = oldOrigin;
    await rm(directory, { recursive: true, force: true });
  }
});

test('visitor admission and global physical-byte budget fail closed without pruning existing data', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-visitor-budget-'));
  try {
    const budget = new GuestWorkspaceBudget(directory, async () => ({
      blocks: 10_000_000,
      bfree: 8_000_000,
      bavail: 8_000_000,
      bsize: 4096,
    }));
    const id = `guest-${'a'.repeat(48)}`;
    const target = await budget.admit(id);
    const store = new GuestWorkspaceStore(process.cwd(), target, budget);
    await store.initialize();
    const before = await readFile(path.join(target, 'workspace.json'), 'utf8');
    await writeFile(path.join(target, 'capacity.fixture'), 'keep');
    const realBytes = budget.bytes.bind(budget);
    budget.bytes = async (name) =>
      name === budget.directory ? GUEST_TOTAL_BYTES : realBytes(name);
    await assert.rejects(
      store.persist(),
      (error: unknown) => (error as { code?: string }).code === 'GUEST_STORAGE_LIMIT'
    );
    assert.equal(await readFile(path.join(target, 'workspace.json'), 'utf8'), before);
    assert.equal(await readFile(path.join(target, 'capacity.fixture'), 'utf8'), 'keep');
    for (let index = 1; index < GUEST_WORKSPACE_LIMIT; index++)
      await mkdir(path.join(budget.directory, `guest-${index.toString(16).padStart(48, '0')}`), {
        mode: 0o700,
      });
    await assert.rejects(
      budget.admit(`guest-${'b'.repeat(48)}`),
      (error: unknown) => (error as { code?: string }).code === 'GUEST_CAPACITY_REACHED'
    );
    assert.equal(await budget.admit(id), target);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('public original preflight covers concurrent writes and rejected originals leave no blob or stuck writer', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-visitor-original-'));
  try {
    const budget = new GuestWorkspaceBudget(directory, async () => ({
      blocks: 10_000_000,
      bfree: 8_000_000,
      bavail: 8_000_000,
      bsize: 4096,
    }));
    const target = await budget.admit(`guest-${'a'.repeat(48)}`);
    const other = await budget.admit(`guest-${'b'.repeat(48)}`);
    const first = new GuestWorkspaceStore(process.cwd(), target, budget);
    const second = new GuestWorkspaceStore(process.cwd(), other, budget);
    await first.initialize();
    await second.initialize();
    const buffer = Buffer.from('public original fixture');
    const hash = createHash('sha256').update(buffer).digest('hex');
    const originalBytes = budget.bytes.bind(budget);
    budget.bytes = async (name) =>
      name === budget.directory ? GUEST_TOTAL_BYTES : originalBytes(name);
    const failed = await Promise.allSettled([
      first.retainUpload(buffer, 'annual.pdf', hash, 'official'),
      second.retainUpload(buffer, 'annual.pdf', hash, 'official'),
    ]);
    assert.ok(
      failed.every(
        (result) => result.status === 'rejected' && result.reason.code === 'GUEST_STORAGE_LIMIT'
      )
    );
    assert.deepEqual(await readdir(path.join(target, 'uploads')), []);
    assert.deepEqual(await readdir(path.join(other, 'uploads')), []);
    budget.bytes = originalBytes;
    const successful = await Promise.all([
      first.retainUpload(buffer, 'annual.pdf', hash, 'official'),
      second.retainUpload(buffer, 'annual.pdf', hash, 'official'),
    ]);
    assert.notEqual(successful[0], successful[1]);
    assert.equal((await readdir(path.join(target, 'uploads'))).length, 1);
    assert.equal((await readdir(path.join(other, 'uploads'))).length, 1);
    const beforeBytes = await originalBytes(budget.directory);
    const racingBuffer = Buffer.alloc(100 * 1024, 7);
    const racingHash = createHash('sha256').update(racingBuffer).digest('hex');
    const offset = GUEST_TOTAL_BYTES - beforeBytes - racingBuffer.length - 512 * 1024 - 128;
    budget.bytes = async (name) =>
      (name === budget.directory ? offset : 0) + (await originalBytes(name));
    const raced = await Promise.allSettled([
      first.retainUpload(racingBuffer, 'one-slot.pdf', racingHash, 'official'),
      second.retainUpload(racingBuffer, 'one-slot.pdf', racingHash, 'official'),
    ]);
    assert.equal(raced.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(
      raced.filter(
        (result) => result.status === 'rejected' && result.reason.code === 'GUEST_STORAGE_LIMIT'
      ).length,
      1
    );
    assert.ok((await budget.bytes(budget.directory)) <= GUEST_TOTAL_BYTES);
    budget.bytes = originalBytes;
    await assert.rejects(
      first.retainUpload(buffer, 'private.pdf', hash, 'upload'),
      (error: unknown) => (error as { code?: string }).code === 'AUTH_REQUIRED'
    );
    await assert.rejects(
      first.retainUpload(buffer, 'wrong-hash.pdf', '0'.repeat(64), 'official'),
      (error: unknown) => (error as { code?: string }).code === 'UPLOAD_HASH_MISMATCH'
    );
    const savedCount = (await readdir(path.join(target, 'uploads'))).length;
    budget.available = async () => {
      throw Object.assign(new Error('capacity'), { code: 'GUEST_STORAGE_BUSY' });
    };
    await assert.rejects(
      first.retainUpload(buffer, 'capacity.pdf', hash, 'official'),
      (error: unknown) => (error as { code?: string }).code === 'GUEST_STORAGE_BUSY'
    );
    assert.equal((await readdir(path.join(target, 'uploads'))).length, savedCount);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
