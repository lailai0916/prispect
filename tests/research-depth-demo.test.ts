import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AuthSession, CompanyResearchRun } from '../shared/contracts.js';
import {
  openResearchDemo,
  researchDemoIdentity,
  type ResearchDemoFaults,
} from '../scripts/serve-research-demo.js';

test('offline walkthrough retains acquired sources, reports and prior challenges across injected failures and permits recovery through the same owner routes', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'prispect-depth-demo-test-'));
  const faults: ResearchDemoFaults = {};
  const nativeFetch = globalThis.fetch;
  let externalAttempts = 0;
  globalThis.fetch = async () => {
    externalAttempts++;
    throw new Error('No external requests in this offline walkthrough.');
  };
  let service: Awaited<ReturnType<typeof openResearchDemo>> | undefined;
  let server: import('node:http').Server | undefined;
  try {
    service = await openResearchDemo(dataDir, faults);
    server = service.app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const registration = await nativeFetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Synthetic depth walkthrough',
        email: 'depth-walkthrough@example.test',
        password: 'isolated-walkthrough-password',
      }),
    });
    assert.equal(registration.status, 201);
    const session = (await registration.json()) as AuthSession;
    const headers = {
      Cookie: registration.headers.get('set-cookie')!.split(';')[0]!,
      'X-CSRF-Token': session.csrfToken!,
      'Content-Type': 'application/json',
    };
    const call = (route: string, body?: unknown) =>
      nativeFetch(`${base}/api${route}`, {
        headers,
        method: body === undefined ? 'GET' : 'POST',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const created = await call('/company-runs', {
      securityCode: researchDemoIdentity.securityCode,
      orgId: researchDemoIdentity.orgId,
      year: 2025,
      purpose: 'external',
      useModel: true,
    });
    assert.equal(created.status, 202);
    const id = ((await created.json()) as CompanyResearchRun).id;
    const endpoint = `/company-runs/${id}`;
    const read = async () => (await (await call(endpoint)).json()) as CompanyResearchRun;
    await service.waitForIdle();
    const acquired = await read();
    assert.equal(acquired.input.researchMode, 'financial');
    assert.equal(acquired.input.useModel, false);
    assert.equal(acquired.model.requested, false);
    assert.equal(acquired.contextStatus, 'ready');
    assert.equal(acquired.assessment, undefined);
    assert.equal((await call(`${endpoint}/context`, {})).status, 200);
    assert.equal((await call(`${endpoint}/assessment`, {})).status, 202);
    await service.waitForIdle();
    const initial = await read();
    assert.equal(initial.contextStatus, 'ready');
    assert.equal(initial.assessmentStatus, 'ready');
    assert.ok(initial.context?.sources.length);
    assert.equal(initial.assessment?.model.calls, 0);

    faults.context = true;
    assert.equal((await call(`${endpoint}/context`, { refresh: true })).status, 202);
    await service.waitForIdle();
    const failedRead = await read();
    assert.equal(failedRead.contextStatus, 'failed');
    assert.deepEqual(
      failedRead.context,
      initial.context,
      'a failed read keeps the acquired source snapshot'
    );
    assert.deepEqual(
      failedRead.assessment,
      initial.assessment,
      'a failed read does not replace the retained report'
    );
    assert.match(failedRead.contextError || '', /保留/);

    faults.context = false;
    assert.equal((await call(`${endpoint}/context`, { refresh: true })).status, 202);
    await service.waitForIdle();
    const refreshedSources = await read();
    assert.equal(refreshedSources.contextStatus, 'ready');
    assert.deepEqual(
      refreshedSources.assessment,
      initial.assessment,
      'refreshing sources retains the old report until an explicit assessment'
    );
    assert.equal((await call(`${endpoint}/assessment`, {})).status, 202);
    await service.waitForIdle();
    const recovered = await read();
    assert.equal(recovered.contextStatus, 'ready');
    assert.equal(recovered.assessmentStatus, 'ready');
    assert.equal(recovered.assessment?.snapshotFetchedAt, recovered.context?.fetchedAt);
    assert.equal(recovered.assessment?.model.calls, 0);

    faults.assessment = true;
    assert.equal((await call(`${endpoint}/assessment`, { refresh: true })).status, 202);
    await service.waitForIdle();
    const failedAnalysis = await read();
    assert.equal(failedAnalysis.assessmentStatus, 'failed');
    assert.deepEqual(failedAnalysis.context, recovered.context);
    assert.deepEqual(
      failedAnalysis.assessment,
      recovered.assessment,
      'analysis failure cannot fabricate a new result'
    );
    assert.match(failedAnalysis.assessmentError || '', /保留/);
    faults.assessment = false;
    assert.equal((await call(`${endpoint}/assessment`, { refresh: true })).status, 202);
    await service.waitForIdle();
    assert.equal((await read()).assessmentStatus, 'ready');

    assert.equal((await call(`${endpoint}/challenge`, { target: 'expansion' })).status, 202);
    await service.waitForIdle();
    const challenged = await read();
    assert.equal(challenged.challenge?.status, 'ready');
    assert.equal(challenged.challenge?.result?.model.calls, 0);
    assert.ok(
      challenged.challenge?.result?.distinguishingMaterials.every(
        (item) => item.availability === 'not-obtained'
      )
    );
    faults.challenge = true;
    assert.equal(
      (await call(`${endpoint}/challenge`, { target: 'expansion', refresh: true })).status,
      202
    );
    await service.waitForIdle();
    const failedChallenge = await read();
    assert.equal(failedChallenge.challenge?.status, 'failed');
    assert.deepEqual(failedChallenge.challenge?.result, challenged.challenge?.result);
    assert.deepEqual(
      failedChallenge.assessment,
      challenged.assessment,
      'challenge does not rewrite grades or report findings'
    );
    faults.challenge = false;
    assert.equal(
      (await call(`${endpoint}/challenge`, { target: 'expansion', refresh: true })).status,
      202
    );
    await service.waitForIdle();
    assert.equal((await read()).challenge?.status, 'ready');
    assert.equal(
      externalAttempts,
      0,
      'synthetic recovery is not a successful public or Grok request'
    );
    assert.equal((await nativeFetch(`${base}/api${endpoint}`)).status, 404);
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
