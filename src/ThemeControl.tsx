import { useLayoutEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useApp } from './context';
import { applyTheme, systemTheme, type Theme } from './appearance';
import { Hint } from './components';

export function ThemeControl() {
  const { t } = useApp();
  const [theme, setTheme] = useState<Theme>(() =>
    systemTheme(window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
  const label =
    theme === 'dark'
      ? t('当前主题：深色，切换至浅色', 'Current theme: dark. Switch to light')
      : t('当前主题：浅色，切换至深色', 'Current theme: light. Switch to dark');
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
    <Hint label={label}>
      <button
        type="button"
        className="theme-button"
        aria-label={label}
        onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      >
        <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </Hint>
  );
}
