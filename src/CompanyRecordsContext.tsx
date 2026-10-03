import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CompanyRecordSummary } from '../shared/company-workspace';
import { api, requestErrorText } from './api';
import { useApp } from './context';
import { COMPANY_RECORDS_EVENT } from './company-record-events';
import {
  activateCompanyRunCache,
  removeCachedCompanyRun,
  retainCachedCompanyRuns,
  cachedCompanyRunIds,
  COMPANY_CACHE_EVENT,
  type CompanyCacheInvalidation,
} from './company-run-cache';

interface CompanyRecordsState {
  owner: string | null;
  records: CompanyRecordSummary[];
  loading: boolean;
  refreshing: boolean;
  error: string;
  reload: () => Promise<void>;
  removeLocal: (id: string) => void;
  isCurrentOwner: () => boolean;
}

const emptyState: CompanyRecordsState = {
  owner: null,
  records: [],
  loading: false,
  refreshing: false,
  error: '',
  reload: async () => {},
  removeLocal: () => {},
  isCurrentOwner: () => false,
};
const CompanyRecordsContext = createContext<CompanyRecordsState>(emptyState);

/** One account-scoped subscription for navigation, recent research and the library. */
export function CompanyRecordsProvider({ children }: { children: ReactNode }) {
  const { user, locale } = useApp();
  const currentLocale = useRef(locale);
  currentLocale.current = locale;
  const owner = user?.id || null;
  const [records, setRecords] = useState<CompanyRecordSummary[]>([]);
  const [loading, setLoading] = useState(Boolean(owner));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const pendingRefresh = useRef(false);
  const removedIds = useRef(new Set<string>());
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const reload = useCallback(async () => {
    if (!owner || !mounted.current) return;
    if (request.current && !request.current.signal.aborted) {
      pendingRefresh.current = true;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    const controller = new AbortController();
    request.current = controller;
    const ticket = ++generation.current;
    const cachedAtRequest = cachedCompanyRunIds(owner);
    setRefreshing(true);
    try {
      const next = await api<CompanyRecordSummary[]>('/company-records', {
        signal: controller.signal,
      });
      if (!mounted.current || controller.signal.aborted || ticket !== generation.current) return;
      const available = next.filter((record) => !removedIds.current.has(record.id));
      retainCachedCompanyRuns(
        owner,
        available.map((record) => record.id),
        cachedAtRequest
      );
      setRecords(available);
      setError('');
      if (
        available.some(
          (record) => record.deletionBlocked || ['queued', 'running'].includes(record.status)
        )
      ) {
        timer.current = setTimeout(() => void reload(), 2500);
      }
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted && ticket === generation.current) {
        setError(requestErrorText(cause, currentLocale.current));
      }
    } finally {
      if (mounted.current && !controller.signal.aborted && ticket === generation.current) {
        request.current = null;
        setLoading(false);
        setRefreshing(false);
        if (pendingRefresh.current) {
          pendingRefresh.current = false;
          void reload();
        }
      }
    }
  }, [owner]);
  useEffect(() => {
    mounted.current = true;
    activateCompanyRunCache(owner);
    removedIds.current.clear();
    setRecords([]);
    setError('');
    setLoading(Boolean(owner));
    void reload();
    const update = () => void reload();
    const invalidate = (event: Event) => {
      if ((event as CustomEvent<CompanyCacheInvalidation>).detail?.owner === owner) void reload();
    };
    window.addEventListener(COMPANY_RECORDS_EVENT, update);
    window.addEventListener('prispect:company-run-updated', update);
    window.addEventListener(COMPANY_CACHE_EVENT, invalidate);
    return () => {
      mounted.current = false;
      ++generation.current;
      request.current?.abort();
      request.current = null;
      pendingRefresh.current = false;
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener(COMPANY_RECORDS_EVENT, update);
      window.removeEventListener('prispect:company-run-updated', update);
      window.removeEventListener(COMPANY_CACHE_EVENT, invalidate);
    };
  }, [owner, reload]);
  const removeLocal = useCallback(
    (id: string) => {
      if (owner) removeCachedCompanyRun(owner, id);
      removedIds.current.add(id);
      setRecords((current) => current.filter((record) => record.id !== id));
    },
    [owner]
  );
  const isCurrentOwner = useCallback(
    () => Boolean(owner && mounted.current && currentOwner.current === owner),
    [owner]
  );
  return (
    <CompanyRecordsContext.Provider
      value={{ owner, records, loading, refreshing, error, reload, removeLocal, isCurrentOwner }}
    >
      {children}
    </CompanyRecordsContext.Provider>
  );
}

export function useCompanyRecords() {
  const state = useContext(CompanyRecordsContext);
  const { user } = useApp();
  return state.owner === (user?.id || null) ? state : emptyState;
}
