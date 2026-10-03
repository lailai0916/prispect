import { useLayoutEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useApp } from './context';
import { applyTheme, systemTheme, type Theme } from './appearance';

export function ThemeControl() {
  const { t } = useApp();
  const [theme, setTheme] = useState<Theme>(() =>
    systemTheme(window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
  const label =
    theme === 'dark'
      ? t('切换到浅色', 'Switch to light theme')
      : t('切换到深色', 'Switch to dark theme');
  const Icon = theme === 'dark' ? Moon : Sun;
  useLayoutEffect(() => applyTheme(theme), [theme]);
  useLayoutEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystem = () => setTheme(systemTheme(query.matches));
    syncSystem();
    query.addEventListener('change', syncSystem);
    return () => query.removeEventListener('change', syncSystem);
  }, []);
  return (
    <button
      type="button"
      className="theme-button"
      aria-label={label}
      title={label}
      onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
    >
      <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
