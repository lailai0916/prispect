import test from 'node:test';
import assert from 'node:assert/strict';
import { lazyPage, PageResourceError, resetFailedLazyPages } from '../src/lazy-page.js';

test('intent preloading shares one pending module request and does not mount a page', async () => {
  let calls = 0;
  let mounts = 0;
  let release!: (module: { Page: () => null }) => void;
  const module = new Promise<{ Page: () => null }>((resolve) => {
    release = resolve;
  });
  const page = lazyPage(
    () => {
      calls++;
      return module;
    },
    (module) => module.Page
  );
  const pending = [page.preload(), page.preload()];
  assert.equal(calls, 1);
  release({
    Page: () => {
      mounts++;
      return null;
    },
  });
  await Promise.all(pending);
  await page.preload();
  assert.equal(calls, 1);
  assert.equal(mounts, 0);
});

test('a failed preload remains recoverable without reloading healthy pages', async () => {
  let healthyCalls = 0;
  let failedCalls = 0;
  let available = false;
  const healthy = lazyPage(
    async () => {
      healthyCalls++;
      return { Page: () => null };
    },
    (module) => module.Page
  );
  const failing = lazyPage(
    async () => {
      failedCalls++;
      if (!available)
        throw new Error('Failed to fetch dynamically imported module: /assets/Example-12345678.js');
      return { Page: () => null };
    },
    (module) => module.Page
  );
  await healthy.preload();
  await assert.rejects(failing.preload(), PageResourceError);
  assert.equal(failedCalls, 3);
  available = true;
  resetFailedLazyPages();
  await Promise.all([failing.preload(), healthy.preload()]);
  assert.equal(failedCalls, 4);
  assert.equal(healthyCalls, 1);
});

test('preloading never retries module execution errors as network failures', async () => {
  let calls = 0;
  const failure = new Error('Unexpected application initialization failure');
  const page = lazyPage(
    async () => {
      calls++;
      throw failure;
    },
    (module) => module as () => null
  );
  await assert.rejects(page.preload(), (error) => error === failure);
  await assert.rejects(page.preload(), (error) => error === failure);
  assert.equal(calls, 1);
});
