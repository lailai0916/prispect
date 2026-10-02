import type { Locale } from './format';

export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_STORAGE_KEY = 'cashlens-theme';
export const LOCALE_STORAGE_KEY = 'cashlens-locale';

export function themePreference(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
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

export function applyTheme(preference: ThemePreference, systemDark: boolean): void {
  const resolved = resolveTheme(preference, systemDark);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#151518' : '#ffffff');
}
