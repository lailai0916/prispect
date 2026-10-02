import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { resolveTheme, themePreference } from '../src/appearance';

test('manual appearance overrides system changes, while automatic follows them', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(themePreference('corrupt'), 'system');
  assert.equal(themePreference(null), 'system');
});

test('first-paint script matches the live preference policy before app modules execute', async () => {
  const source = await readFile('public/appearance-init.js', 'utf8');
  for (const saved of [null, 'system', 'light', 'dark', 'corrupt']) {
    for (const systemDark of [false, true]) {
      const root = { dataset: {} as Record<string, string>, lang: '' };
      const meta = {} as Record<string, string>;
      runInNewContext(source, {
        localStorage: { getItem: (key: string) => (key === 'cashlens-theme' ? saved : 'en') },
        window: { matchMedia: () => ({ matches: systemDark }) },
        document: {
          documentElement: root,
          querySelector: () => ({
            setAttribute: (key: string, value: string) => (meta[key] = value),
          }),
        },
      });
      const expected = resolveTheme(themePreference(saved), systemDark);
      assert.equal(root.dataset.theme, expected);
      assert.equal(root.dataset.themePreference, themePreference(saved));
      assert.equal(root.lang, 'en');
      assert.equal(meta.content, expected === 'dark' ? '#151518' : '#ffffff');
    }
  }
});

test('blocked storage does not break first paint or system appearance', async () => {
  const root = { dataset: {} as Record<string, string>, lang: '' };
  runInNewContext(await readFile('public/appearance-init.js', 'utf8'), {
    localStorage: {
      getItem: () => {
        throw new Error('storage blocked');
      },
    },
    window: { matchMedia: () => ({ matches: true }) },
    document: { documentElement: root, querySelector: () => null },
  });
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.dataset.themePreference, 'system');
  assert.equal(root.lang, 'zh-Hans');
});
