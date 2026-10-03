import type { Locale } from './format';

export type Theme = 'light' | 'dark';
export const LOCALE_STORAGE_KEY = 'cashlens-locale';

export function systemTheme(systemDark: boolean): Theme {
  return systemDark ? 'dark' : 'light';
}

export function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The active preference still works when browser storage is unavailable.
  }
}

export function storedLocale(): Locale {
  return readPreference(LOCALE_STORAGE_KEY) === 'en' ? 'en' : 'zh-Hans';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#151518' : '#ffffff');
}
