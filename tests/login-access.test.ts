import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';
import {
  GuestWorkspaceBudget,
  GuestWorkspaceStore,
  GUEST_TOTAL_BYTES,
  GUEST_WORKSPACE_LIMIT,
} from '../server/guest-workspace.js';
import type { AuthSession, CompanyIdentity, CompanyResearchRun } from '../shared/contracts.js';
import type { CompanyContextSnapshot } from '../shared/company-workspace.js';

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

const password = 'Copper!fjord7-Unusual-velvet';
async function harness() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-login-required-'));
  let sourceCalls = 0,
    assistantCalls = 0;
  const legacyId = `guest-${'a'.repeat(48)}`;
  const legacyDirectory = path.join(directory, 'guests', legacyId);
  await mkdir(legacyDirectory, { recursive: true, mode: 0o700 });
  const retained = JSON.stringify({ legacyFixture: 'historical visitor record' });
  await writeFile(path.join(legacyDirectory, 'workspace.json'), retained);
  const service = await createApp({
    dataDir: directory,
    model: {},
    companyDirectory: null,
    companyService: {
      runCompanyResearch: async () => {
        throw Error('Financial research must not process originals');
      },
      searchCompanies: async (query) => {
        sourceCalls++;
        return {
          query,
          candidates: [issuer],
          truncated: false,
          limitedToListed: true,
          source: 'cninfo',
        };
      },
    },
    companyContextService: {
      searchCompanies: async (query) => {
        sourceCalls++;
        return {
          query,
          candidates: [issuer],
          truncated: false,
          limitedToListed: true,
          source: 'cninfo',
        };
      },
      industry: async () => {
        throw Error('Unexpected industry request');
      },
      question: async () => {
        throw Error('Unexpected report question');
      },
      context: async () => {
        sourceCalls++;
        return structuredClone(snapshot);
      },
    },
    assistantService: {
      documentation: async (question) => {
        assistantCalls++;
        return {
          question,
          text: 'Authenticated fixture',
          citations: [],
          kind: 'documentation',
          mode: 'rules',
          createdAt: new Date().toISOString(),
          snapshotFetchedAt: '',
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
      headers: {
        Origin: 'http://127.0.0.1:4318',
        Cookie: cookie,
        'X-CSRF-Token': csrf,
        'Content-Type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const legacyCookie = async (issued = Date.now(), altered = false) => {
    const secret = (await readFile(path.join(directory, 'auth-secret'), 'utf8')).trim();
    const payload = `${legacyId}.${issued}.${issued + 7 * 24 * 60 * 60 * 1000}`;
    const signature = createHmac('sha256', secret)
      .update(`cashlens-visitor-v1:${payload}`)
      .digest('hex');
    return `cashlens-visitor=${payload}.${altered ? signature.slice(0, -1) + (signature.endsWith('0') ? '1' : '0') : signature}`;
  };
  const register = async (email: string, oldCookie = '') => {
    const response = await call('/api/auth/register', oldCookie, '', {
      name: '登录验收',
      email,
      password,
    });
    assert.equal(response.status, 201, await response.clone().text());
    const session = (await response.json()) as AuthSession;
    const cookie = response.headers
      .getSetCookie()
      .map((header) => header.split(';')[0])
      .join('; ');
    assert.ok(session.user && !session.user.isGuest);
    assert.ok(session.csrfToken);
    return {
      cookie: cookie + (oldCookie ? '; ' + oldCookie : ''),
      csrf: session.csrfToken!,
      session,
    };
  };
  return {
    ...service,
    directory,
    retained,
    legacyDirectory,
    call,
    legacyCookie,
    register,
    counts: () => ({ sourceCalls, assistantCalls }),
    close: async () => {
      await service.waitForIdle();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      service.auth.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('anonymous and legacy visitor sessions cannot read or mutate research or use the assistant', async () => {
  const h = await harness();
  try {
    for (const cookie of [
      '',
      await h.legacyCookie(),
      await h.legacyCookie(Date.now(), true),
      await h.legacyCookie(Date.now() - 8 * 24 * 60 * 60 * 1000),
    ]) {
      const response = await h.call('/api/auth/session', cookie);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        user: null,
        csrfToken: null,
        registrationEnabled: true,
        passwordRecoveryEnabled: false,
      });
      assert.equal(response.headers.getSetCookie().length, 0);
      const requests: [string, unknown?, string?][] = [
        ['/api/workspace'],
        ['/api/company-records'],
        ['/api/company-runs'],
        ['/api/companies/search?q=600519'],
        ['/api/companies/directory'],
        ['/api/company-runs/retained'],
        ['/api/company-runs/retained/originals/source'],
        ['/api/company-runs/retained/context'],
        ['/api/company-runs/retained/industry'],
        ['/api/account'],
        ['/api/materials'],
        ['/api/tasks'],
        ['/api/decisions'],
        ['/api/company-runs', researchInput],
        ['/api/company-gaps', { name: 'Unmatched', year: 2025, purpose: 'external' }],
        ['/api/company-runs/retained/context/refresh', {}],
        ['/api/company-runs/retained/assessment', {}],
        ['/api/company-runs/retained/questions', { question: '现金如何？' }],
        ['/api/company-runs/retained', undefined, 'DELETE'],
        ['/api/company-runs/retained/adopt', {}],
        ['/api/assistant/messages', { question: '隐私政策是什么？', locale: 'zh' }],
        ['/api/assistant/messages', { question: '贵州茅台现金如何？', locale: 'zh' }],
        ['/api/assistant/messages', {}],
      ];
      for (const [route, body, method] of requests) {
        const denied = await h.call(route, cookie, 'obsolete-visitor-csrf', body, method);
        assert.equal(denied.status, 401, route);
        assert.equal((await denied.json()).code, 'AUTH_REQUIRED', route);
        assert.equal(denied.headers.getSetCookie().length, 0);
      }
    }
    assert.equal((await h.call('/api/health')).status, 200);
    assert.equal((await h.call('/api/cases')).status, 200);
    assert.deepEqual(h.counts(), { sourceCalls: 0, assistantCalls: 0 });
    assert.deepEqual(await readdir(path.join(h.directory, 'users')).catch(() => []), []);
    assert.equal(
      await readFile(path.join(h.legacyDirectory, 'workspace.json'), 'utf8'),
      h.retained
    );
    assert.deepEqual(await readdir(path.join(h.directory, 'guests')), [
      path.basename(h.legacyDirectory),
    ]);
  } finally {
    await h.close();
  }
});

test('registration and sign-in grant only the owning account access; logout closes access without removing research', async () => {
  const h = await harness();
  try {
    const legacy = await h.legacyCookie();
    const alice = await h.register('login-alice@example.test', legacy);
    const bob = await h.register('login-bob@example.test');
    assert.equal((await h.call('/api/workspace', alice.cookie)).status, 200);
    assert.deepEqual(await (await h.call('/api/company-records', alice.cookie)).json(), []);
    const missingCsrf = await h.call('/api/company-runs', alice.cookie, '', researchInput);
    assert.equal(missingCsrf.status, 403);
    assert.equal((await missingCsrf.json()).code, 'CSRF_INVALID');
    const response = await h.call('/api/company-runs', alice.cookie, alice.csrf, researchInput);
    assert.equal(response.status, 202, await response.clone().text());
    const run = (await response.json()) as CompanyResearchRun;
    await h.waitForIdle();
    assert.equal((await h.call(`/api/company-runs/${run.id}`, alice.cookie)).status, 200);
    assert.equal((await h.call(`/api/company-runs/${run.id}`, bob.cookie)).status, 404);
    assert.equal((await h.call(`/api/company-runs/${run.id}`, legacy)).status, 401);
    const productAnswer = await h.call('/api/assistant/messages', alice.cookie, alice.csrf, {
      question: '隐私政策是什么？',
      locale: 'zh',
    });
    assert.equal(productAnswer.status, 200);
    const logout = await h.call('/api/auth/logout', alice.cookie, alice.csrf, {});
    assert.equal(logout.status, 200);
    assert.equal((await h.call(`/api/company-runs/${run.id}`, alice.cookie)).status, 401);
    const expired = (await (await h.call('/api/auth/session', alice.cookie)).json()) as AuthSession;
    assert.equal(expired.user, null);
    assert.equal(expired.csrfToken, null);
    const login = await h.call('/api/auth/login', legacy, '', {
      email: 'login-alice@example.test',
      password,
    });
    assert.equal(login.status, 200, await login.clone().text());
    const resumed = (await login.json()) as AuthSession;
    assert.equal(resumed.user?.id, alice.session.user!.id);
    const resumedCookie = login.headers
      .getSetCookie()
      .map((entry) => entry.split(';')[0])
      .join('; ');
    assert.equal((await h.call(`/api/company-runs/${run.id}`, resumedCookie)).status, 200);
    assert.equal(
      await readFile(path.join(h.legacyDirectory, 'workspace.json'), 'utf8'),
      h.retained
    );
    assert.deepEqual(h.counts(), { sourceCalls: 2, assistantCalls: 1 });
  } finally {
    await h.close();
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
