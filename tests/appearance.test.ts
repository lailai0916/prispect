import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { applyTheme } from '../src/appearance';

test('first paint follows the system despite all legacy saved themes and retains the locale', async () => {
  const source = await readFile('public/appearance-init.js', 'utf8');
  for (const saved of [null, 'system', 'light', 'dark', 'corrupt']) {
    for (const systemDark of [false, true]) {
      for (const locale of ['en', 'zh-Hans', 'corrupt', null]) {
        const root = { dataset: {} as Record<string, string>, lang: '' };
        const meta = {} as Record<string, string>;
        const storageReads: string[] = [];
        runInNewContext(source, {
          localStorage: {
            getItem: (key: string) => {
              storageReads.push(key);
              return key === 'cashlens-theme' ? saved : locale;
            },
          },
          window: {
            matchMedia: (query: string) => {
              assert.equal(query, '(prefers-color-scheme: dark)');
              return { matches: systemDark };
            },
          },
          document: {
            documentElement: root,
            querySelector: (selector: string) => {
              assert.equal(selector, 'meta[name="theme-color"]');
              return {
                setAttribute: (key: string, value: string) => (meta[key] = value),
              };
            },
          },
        });
        assert.equal(root.dataset.theme, systemDark ? 'dark' : 'light');
        assert.equal('themePreference' in root.dataset, false);
        assert.equal(root.lang, locale === 'en' ? 'en' : 'zh-Hans');
        assert.equal(meta.content, systemDark ? '#151518' : '#ffffff');
        assert.deepEqual(storageReads, ['cashlens-locale'], 'Legacy themes are never read');
      }
    }
  }
});

test('blocked storage does not break first paint or system appearance', async () => {
  const source = await readFile('public/appearance-init.js', 'utf8');
  for (const systemDark of [false, true]) {
    for (const storage of [
      {},
      {
        localStorage: {
          getItem: () => {
            throw new Error('storage blocked');
          },
        },
      },
    ]) {
      const root = { dataset: {} as Record<string, string>, lang: '' };
      assert.doesNotThrow(() =>
        runInNewContext(source, {
          ...storage,
          window: { matchMedia: () => ({ matches: systemDark }) },
          document: { documentElement: root, querySelector: () => null },
        })
      );
      assert.equal(root.dataset.theme, systemDark ? 'dark' : 'light');
      assert.equal('themePreference' in root.dataset, false);
      assert.equal(root.lang, 'zh-Hans');
    }
  }
});

test('a manual theme application updates the actual document and browser theme color', (t) => {
  const root = { dataset: {} as Record<string, string> };
  const meta = {} as Record<string, string>;
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      documentElement: root,
      querySelector: (selector: string) => {
        assert.equal(selector, 'meta[name="theme-color"]');
        return { setAttribute: (key: string, value: string) => (meta[key] = value) };
      },
    },
  });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  applyTheme('dark');
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(meta.content, '#151518');
  applyTheme('light');
  assert.equal(root.dataset.theme, 'light');
  assert.equal(meta.content, '#ffffff');
  assert.equal('themePreference' in root.dataset, false);
});
