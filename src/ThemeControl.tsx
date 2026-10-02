import { useEffect, useLayoutEffect, useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useApp } from './context';
import {
  applyTheme,
  readPreference,
  storePreference,
  themePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from './appearance';
import './styles/theme-control.css';

const modes = ['system', 'light', 'dark'] as const;
const icons = { system: Monitor, light: Sun, dark: Moon };

export function ThemeControl() {
  const { t } = useApp();
  const [preference, setPreference] = useState(() =>
    themePreference(readPreference(THEME_STORAGE_KEY))
  );
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const labels = {
    system: t('自动', 'System'),
    light: t('浅色', 'Light'),
    dark: t('深色', 'Dark'),
  };
  const Icon = icons[preference];
  useLayoutEffect(() => applyTheme(preference, systemDark), [preference, systemDark]);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystem = () => setSystemDark(query.matches);
    const syncPreference = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null)
        setPreference(themePreference(readPreference(THEME_STORAGE_KEY)));
    };
    syncSystem();
    query.addEventListener('change', syncSystem);
    window.addEventListener('storage', syncPreference);
    return () => {
      query.removeEventListener('change', syncSystem);
      window.removeEventListener('storage', syncPreference);
    };
  }, []);
  const select = (value: ThemePreference) => {
    setPreference(value);
    storePreference(THEME_STORAGE_KEY, value);
  };
  return (
    <Menu.Root>
      <Menu.Trigger
        className="theme-button"
        aria-label={t(`外观：${labels[preference]}`, `Appearance: ${labels[preference]}`)}
        title={t(`外观：${labels[preference]}`, `Appearance: ${labels[preference]}`)}
      >
        <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="menu-positioner"
        >
          <Menu.Popup
            className="action-menu theme-menu"
            aria-label={t('选择外观', 'Choose appearance')}
          >
            <Menu.RadioGroup value={preference} onValueChange={select}>
              {modes.map((mode) => {
                const ModeIcon = icons[mode];
                return (
                  <Menu.RadioItem
                    key={mode}
                    value={mode}
                    closeOnClick
                    className="action-menu-item theme-menu-option"
                  >
                    <ModeIcon size={16} aria-hidden="true" />
                    <span>{labels[mode]}</span>
                    <Menu.RadioItemIndicator className="theme-menu-check">
                      <Check size={15} aria-hidden="true" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                );
              })}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
