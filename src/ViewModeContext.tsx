import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type ViewMode = 'simple' | 'pro';

const ViewModeContext = createContext<{
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
} | null>(null);

const STORAGE_KEY = 'prispect-view';

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'simple';
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'pro' ? 'pro' : 'simple';
    } catch {
      return 'simple';
    }
  });

  useEffect(() => {
    document.documentElement.dataset.view = viewMode;
  }, [viewMode]);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* 存储不可用时忽略，仅本次会话生效 */
    }
  }, []);

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  const ctx = useContext(ViewModeContext);
  if (!ctx) return { viewMode: 'simple' as ViewMode, setViewMode: () => {} };
  return ctx;
}
