import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AuthSession, CompanyResearchRun } from '../shared/contracts.js';
import type { CompanyChallengeState } from '../shared/company-challenge.js';
import {
  loopbackDemoFetch,
  openResearchDemo,
  researchDemoIdentity,
} from '../scripts/serve-research-demo.js';

test('demo transport refuses public URLs before calling fetch and permits only literal loopback', async () => {
  let calls = 0;
  let redirect: RequestRedirect | undefined;
  const guarded = loopbackDemoFetch(async (_input, init) => {
    calls++;
    redirect = init?.redirect;
    return new Response('local');
  });
  for (const url of [
    'https://www.cninfo.com.cn/',
    'https://api.x.ai/',
    'http://localhost:4336/',
    'http://127.0.0.1.example.com/',
    'http://user@127.0.0.1/',
  ]) {
    await assert.rejects(guarded(url), /拒绝对外请求/);
  }
  assert.equal(calls, 0);
  assert.equal(
    await (await guarded('http://127.0.0.1:4336/api/health', { redirect: 'follow' })).text(),
    'local'
  );
  assert.equal(calls, 1);
  assert.equal(redirect, 'error');
});

test('portable demo uses real owner routes without public retrieval or model calls', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'prispect-demo-test-'));
  const nativeFetch = globalThis.fetch;
  let externalAttempts = 0;
  globalThis.fetch = async () => {
    externalAttempts++;
    throw new Error('External requests are prohibited in the local demo.');
  };
  let service: Awaited<ReturnType<typeof openResearchDemo>> | undefined;
  let server: import('node:http').Server | undefined;
  try {
    service = await openResearchDemo(dataDir);
    server = service.app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const health = await nativeFetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    const help = await nativeFetch(`${base}/api/assistant/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '你是谁', locale: 'zh' }),
    });
    assert.equal(help.status, 200);
    assert.equal((await help.json()).kind, 'documentation');
    const response = await nativeFetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Local demo',
        email: 'demo@example.test',
        password: 'demo-acceptance-password',
      }),
    });
    assert.equal(response.status, 201);
    const session = (await response.json()) as AuthSession;
    const headers = {
      Cookie: response.headers.get('set-cookie')!.split(';')[0]!,
      'X-CSRF-Token': session.csrfToken!,
      'Content-Type': 'application/json',
    };
    const call = (route: string, body?: unknown) =>
      nativeFetch(`${base}/api${route}`, {
        headers,
        method: body === undefined ? 'GET' : 'POST',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const matches = await call('/companies/search?q=601234');
    assert.equal(matches.status, 200);
    assert.equal((await matches.json()).candidates[0].shortName, researchDemoIdentity.shortName);
    const created = await call('/company-runs', {
      securityCode: researchDemoIdentity.securityCode,
      orgId: researchDemoIdentity.orgId,
      year: 2025,
      purpose: 'external',
      useModel: true,
    });
    assert.equal(created.status, 202);
    const id = ((await created.json()) as CompanyResearchRun).id;
    await service.waitForIdle();
    assert.equal((await call(`/company-runs/${id}/context`, {})).status, 202);
    await service.waitForIdle();
    const run = (await (await call(`/company-runs/${id}`)).json()) as CompanyResearchRun;
    assert.equal(run.context?.companyName, researchDemoIdentity.companyName);
    assert.match(run.context?.warnings.join(' ') || '', /合成/);
    assert.equal(run.assessment?.model.calls, 0);
    assert.equal(run.assessment?.grade, 'C');
    assert.equal(
      (await call(`/company-runs/${id}/challenge`, { target: 'expansion' })).status,
      202
    );
    await service.waitForIdle();
    const result = (await (await call(`/company-runs/${id}/challenge`)).json()) as {
      challenge: CompanyChallengeState;
    };
    assert.equal(result.challenge.status, 'ready');
    assert.equal(result.challenge.result?.status, 'mixed-clues');
    assert.equal(result.challenge.result?.model.calls, 0);
    assert.equal(result.challenge.result?.research.toolCalls, 0);
    assert.ok(
      result.challenge.result?.distinguishingMaterials.every(
        (item) => item.availability === 'not-obtained'
      )
    );
    assert.match(JSON.stringify(result.challenge.result?.gaps), /未进行定向搜索/);
    const anonymous = await nativeFetch(`${base}/api/company-runs/${id}`);
    assert.equal(anonymous.status, 401);
    assert.equal(externalAttempts, 0);
  } finally {
    try {
      await service?.waitForIdle();
      if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
      service?.auth.close();
    } finally {
      globalThis.fetch = nativeFetch;
      await rm(dataDir, { recursive: true, force: true });
    }
  }
});
