import assert from 'node:assert/strict';
import test from 'node:test';
import {
  failedPageModuleUrl,
  isPageResourceFailure,
  loadPageModule,
  PageResourceError,
} from '../src/lazy-page';

test('a transient import failure is retried and returns the actual loaded module', async () => {
  let calls = 0;
  const module = { default: () => null };
  const result = await loadPageModule(async () => {
    calls++;
    if (calls === 1)
      throw new TypeError('Failed to fetch dynamically imported module: /assets/page.js');
    return module;
  });
  assert.equal(calls, 2);
  assert.equal(result, module);
});

test('resource retries are bounded and retain the real error for local diagnosis', async () => {
  let calls = 0;
  const failure = new TypeError('error loading dynamically imported module');
  await assert.rejects(
    loadPageModule(async () => {
      calls++;
      throw failure;
    }),
    (error: unknown) => error instanceof PageResourceError && error.cause === failure
  );
  assert.equal(calls, 3);
});

test('module evaluation and business errors are not automatically retried', async () => {
  for (const failure of [
    new ReferenceError('businessValue is not defined'),
    new TypeError('Cannot read properties of undefined'),
    new Error('Failed to fetch customer information'),
  ]) {
    let calls = 0;
    await assert.rejects(
      loadPageModule(async () => {
        calls++;
        throw failure;
      }),
      (error: unknown) => error === failure
    );
    assert.equal(calls, 1);
  }
});

test('resource classification covers browser imports and Vite stylesheets precisely', () => {
  for (const message of [
    'Failed to fetch dynamically imported module: https://prispect.com/assets/page.js',
    'error loading dynamically imported module: https://prispect.com/assets/page.js',
    'Importing a module script failed.',
    'Unable to preload CSS for https://prispect.com/assets/page.css',
  ]) {
    assert.equal(isPageResourceFailure(new TypeError(message)), true, message);
  }
  assert.equal(isPageResourceFailure(new Error('Network error')), false);
  assert.equal(isPageResourceFailure(new Error('The page resources could not be loaded.')), false);
});

test('CSS recovery repairs every failed preload while retaining already loaded styles', async () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const links = ['one', 'two', 'loaded'].map((name) => ({
    href: `https://prispect.com/assets/${name}.css`,
    sheet: name === 'loaded' ? {} : null,
    removed: false,
    remove() {
      this.removed = true;
    },
  }));
  const visibleLinks = [links[2]!];
  const appended: string[] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { href: 'https://prispect.com/query', origin: 'https://prispect.com' } },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      querySelectorAll: () => visibleLinks.filter((link) => !link.removed),
      createElement: () => ({ onload: null, onerror: null, remove() {} }),
      head: {
        appendChild(link: { href: string; onload: (() => void) | null }) {
          appended.push(link.href);
          queueMicrotask(() => link.onload?.());
        },
      },
    },
  });
  try {
    let calls = 0;
    const result = await loadPageModule(async () => {
      calls++;
      if (calls === 1) {
        visibleLinks.push(links[0]!, links[1]!);
        throw new Error('Unable to preload CSS for https://prispect.com/assets/one.css');
      }
      return 'loaded';
    });
    assert.equal(result, 'loaded');
    assert.equal(calls, 2);
    assert.deepEqual(appended.map((href) => href.split('?')[0]).sort(), [
      links[0]!.href,
      links[1]!.href,
    ]);
    assert.equal(new Set(appended).size, 2);
    assert.equal(
      appended.every((href) => href.includes('prispect_retry=')),
      true
    );
    assert.equal(links[0]!.removed, true);
    assert.equal(links[1]!.removed, true);
    assert.equal(links[2]!.removed, false);
  } finally {
    for (const [key, descriptor] of [
      ['window', windowDescriptor],
      ['document', documentDescriptor],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('a page CSS failure does not block unrelated pages, and its own next generation repairs it first', async () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const links: { href: string; sheet: object; removed: boolean; remove(): void }[] = [];
  const appended: string[] = [];
  let recoverCss = false;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { href: 'https://prispect.com/query', origin: 'https://prispect.com' } },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      querySelectorAll: () => links.filter((link) => !link.removed),
      createElement: () => ({ onload: null, onerror: null, remove() {} }),
      head: {
        appendChild(link: {
          href: string;
          onload: (() => void) | null;
          onerror: (() => void) | null;
        }) {
          appended.push(link.href);
          queueMicrotask(() => (recoverCss ? link.onload?.() : link.onerror?.()));
        },
      },
    },
  });
  try {
    const required = new Set<string>();
    await assert.rejects(
      loadPageModule(
        async () => {
          links.push({
            href: 'https://prispect.com/assets/unrelated-failed.css',
            // Chromium can expose a sheet even after the stylesheet returns 404.
            sheet: {},
            removed: false,
            remove() {
              this.removed = true;
            },
          });
          throw new Error(
            'Unable to preload CSS for https://prispect.com/assets/unrelated-failed.css'
          );
        },
        undefined,
        required
      ),
      PageResourceError
    );
    assert.deepEqual([...required], ['https://prispect.com/assets/unrelated-failed.css']);
    assert.equal(appended.length, 2);
    assert.equal(await loadPageModule(async () => 'unrelated-document'), 'unrelated-document');
    assert.equal(appended.length, 2, 'an unrelated loader must not request the failed page CSS');
    recoverCss = true;
    const result = await loadPageModule(
      async () => {
        assert.equal(appended.length, 3, 'repair must happen before the cached importer returns');
        return 'original-page';
      },
      undefined,
      required
    );
    assert.equal(result, 'original-page');
  } finally {
    for (const [key, descriptor] of [
      ['window', windowDescriptor],
      ['document', documentDescriptor],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('module recovery accepts only same-origin hashed asset scripts', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { href: 'https://prispect.com/query', origin: 'https://prispect.com' } },
  });
  try {
    const failure = (url: string) =>
      new TypeError(`Failed to fetch dynamically imported module: ${url}`);
    assert.equal(
      failedPageModuleUrl(failure('https://prispect.com/assets/Method-abC_1234.js'))?.href,
      'https://prispect.com/assets/Method-abC_1234.js'
    );
    for (const url of [
      'https://other.example/assets/Method-abC_1234.js',
      'https://prispect.com/api/Method-abC_1234.js',
      'https://prispect.com/assets/Method.js',
      'https://prispect.com/assets/folder/Method-abC_1234.js',
      'https://user:secret@prispect.com/assets/Method-abC_1234.js',
      'https://prispect.com/assets/%2e%2e/Method-abC_1234.js',
    ]) {
      assert.equal(failedPageModuleUrl(failure(url)), null, url);
    }
    assert.equal(failedPageModuleUrl(new TypeError('Importing a module script failed.')), null);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('a cached failed import can recover through the actual asset URL without repeating its loader', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { href: 'https://prispect.com/query', origin: 'https://prispect.com' } },
  });
  try {
    let calls = 0;
    const recoveredUrls: string[] = [];
    const result = await loadPageModule(
      async () => {
        calls++;
        throw new TypeError(
          'Failed to fetch dynamically imported module: https://prispect.com/assets/Method-abC_1234.js'
        );
      },
      async (url) => {
        recoveredUrls.push(url.href);
        return 'recovered';
      }
    );
    assert.equal(calls, 1);
    assert.equal(result, 'recovered');
    assert.deepEqual(recoveredUrls, ['https://prispect.com/assets/Method-abC_1234.js']);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
