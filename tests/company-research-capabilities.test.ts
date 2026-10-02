import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AuthSession } from '../shared/contracts.js';
import { createApp } from '../server/app.js';
import { DEFAULT_MODEL, type ModelConfig } from '../server/model.js';
import { seeds } from '../server/store.js';

async function withApp(
  model: ModelConfig,
  action: (context: { app: Awaited<ReturnType<typeof createApp>>; base: string }) => Promise<void>
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prispect-research-capabilities-'));
  const app = await createApp({ dataDir: directory, model });
  const server = app.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await action({ app, base });
  } finally {
    await app.waitForIdle();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    app.auth.close();
    await rm(directory, { recursive: true, force: true });
  }
}

function assertPublicShape(value: Record<string, unknown>) {
  assert.deepEqual(Object.keys(value).sort(), ['limits', 'modelConfigured', 'modelName', 'tools']);
  assert.deepEqual(value.tools, [
    'get_financial_history',
    'collect_public_signals',
    'get_market_quote',
    'search_discussions',
    'read_news',
    'read_discussion',
    'fetch_industry',
    'search_disclosures',
    'search_news',
    'read_disclosure',
  ]);
  assert.deepEqual(value.limits, {
    planningTurns: 6,
    toolCalls: 24,
    supplementaryRequests: 72,
    retainedNews: 180,
    retainedDiscussions: 240,
    researchSeconds: 300,
  });
}

test('anonymous research capabilities report configuration and bounded tools without model calls', async () => {
  let calls = 0;
  await withApp(
    {
      fetch: async () => {
        calls++;
        throw Error('Capabilities must not call an external provider.');
      },
    },
    async ({ base }) => {
      const response = await fetch(`${base}/api/public/research-capabilities`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type')!, /application\/json/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('set-cookie'), null);
      const value = await response.json();
      assertPublicShape(value);
      assert.equal(value.modelConfigured, false);
      assert.equal(value.modelName, DEFAULT_MODEL);
      assert.equal(calls, 0);
    }
  );
});

test('configured capabilities reveal neither credentials, provider configuration nor account data', async () => {
  const privateKey = 'test-only-provider-secret-do-not-return';
  const privateUrl = 'https://private-provider.invalid/private-prefix';
  const privateName = 'Private account owner';
  const privateTitle = 'Private materials and decisions must stay account-scoped';
  let modelCalls = 0;
  await withApp(
    {
      apiKey: privateKey,
      baseUrl: privateUrl,
      model: 'grok-capability-fixture',
      timeoutMs: 1234,
      serviceTier: 'flex',
      fetch: async () => {
        modelCalls++;
        throw Error('Capabilities must not call an external provider.');
      },
    },
    async ({ app, base }) => {
      const registered = await fetch(`${base}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'capabilities-owner@example.test',
          name: privateName,
          password: 'capabilities-private-test-pass',
        }),
      });
      assert.equal(registered.status, 201);
      const session = (await registered.json()) as AuthSession;
      const cookie = registered.headers.get('set-cookie')!.split(';')[0]!;
      const store = await app.workspaceForUser(session.user!.id);
      const fixture = (await seeds(process.cwd())).materials[0]!;
      store.state.materials.push({ ...structuredClone(fixture), title: privateTitle });
      await store.persist();
      const anonymous = await fetch(`${base}/api/public/research-capabilities`);
      assert.equal(anonymous.status, 200);
      const publicText = await anonymous.text();
      const value = JSON.parse(publicText);
      assertPublicShape(value);
      assert.equal(value.modelConfigured, true);
      assert.equal(value.modelName, 'grok-capability-fixture');
      for (const secret of [
        privateKey,
        privateUrl,
        'private-provider.invalid',
        privateName,
        privateTitle,
        session.user!.id,
        session.csrfToken!,
      ])
        assert.equal(publicText.includes(secret), false);
      const authenticated = await fetch(`${base}/api/public/research-capabilities`, {
        headers: { Cookie: cookie },
      });
      assert.equal(authenticated.status, 200);
      assert.equal(await authenticated.text(), publicText);
      assert.equal(modelCalls, 0);
      assert.equal(store.state.materials[0]!.title, privateTitle);
    }
  );
});
