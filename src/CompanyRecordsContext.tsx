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
import { api } from './api';
import { ResearchStatusPoller, researchStatusErrorText } from './research-status-poller';
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

/** One account-scoped subscription for navigation, recent records, search and assistant. */
export function CompanyRecordsProvider({ children }: { children: ReactNode }) {
  const { user, locale } = useApp();
  const currentLocale = useRef(locale);
  currentLocale.current = locale;
  const owner = user?.id || null;
  const [collection, setCollection] = useState<{
    owner: string | null;
    records: CompanyRecordSummary[];
  }>({ owner, records: [] });
  const [loading, setLoading] = useState(Boolean(owner));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const removedIds = useRef(new Set<string>());
  const generation = useRef(0);
  const poller = useRef<ResearchStatusPoller | null>(null);
  const mounted = useRef(false);
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const load = useCallback(async () => {
    if (!owner || !mounted.current || currentOwner.current !== owner) return false;
    if (request.current && !request.current.signal.aborted) {
      return false;
    }
    const controller = new AbortController();
    request.current = controller;
    const ticket = ++generation.current;
    const cachedAtRequest = cachedCompanyRunIds(owner);
    setRefreshing(true);
    try {
      const next = await api<CompanyRecordSummary[]>('/company-records', {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      if (
        !mounted.current ||
        currentOwner.current !== owner ||
        controller.signal.aborted ||
        ticket !== generation.current
      )
        return false;
      const available = next.filter((record) => !removedIds.current.has(record.id));
      retainCachedCompanyRuns(
        owner,
        available.map((record) => record.id),
        cachedAtRequest
      );
      setCollection({ owner, records: available });
      setError('');
      return available.some(
        (record) => record.deletionBlocked || ['queued', 'running'].includes(record.status)
      );
    } catch (cause) {
      if (
        mounted.current &&
        currentOwner.current === owner &&
        !controller.signal.aborted &&
        ticket === generation.current
      ) {
        setError(researchStatusErrorText(cause, currentLocale.current));
        throw cause;
      }
      return false;
    } finally {
      if (
        mounted.current &&
        currentOwner.current === owner &&
        !controller.signal.aborted &&
        ticket === generation.current
      ) {
        request.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [owner]);
  const reload = useCallback(async () => {
    await poller.current?.request();
  }, []);
  useEffect(() => {
    mounted.current = true;
    activateCompanyRunCache(owner);
    removedIds.current.clear();
    setCollection({ owner, records: [] });
    setError('');
    setLoading(Boolean(owner));
    setRefreshing(false);
    const subscription = new ResearchStatusPoller(load, 2500);
    poller.current = subscription;
    subscription.start();
    const update = () => void reload();
    const invalidate = (event: Event) => {
      if ((event as CustomEvent<CompanyCacheInvalidation>).detail?.owner === owner) void reload();
    };
    window.addEventListener(COMPANY_RECORDS_EVENT, update);
    window.addEventListener('prispect:company-run-updated', update);
    window.addEventListener(COMPANY_CACHE_EVENT, invalidate);
    return () => {
      mounted.current = false;
      subscription.stop();
      if (poller.current === subscription) poller.current = null;
      ++generation.current;
      request.current?.abort();
      request.current = null;
      window.removeEventListener(COMPANY_RECORDS_EVENT, update);
      window.removeEventListener('prispect:company-run-updated', update);
      window.removeEventListener(COMPANY_CACHE_EVENT, invalidate);
    };
  }, [owner, load, reload]);
  const removeLocal = useCallback(
    (id: string) => {
      if (!owner || currentOwner.current !== owner || !mounted.current) return;
      if (owner) removeCachedCompanyRun(owner, id);
      removedIds.current.add(id);
      setCollection((current) =>
        current.owner === owner
          ? { owner, records: current.records.filter((record) => record.id !== id) }
          : current
      );
    },
    [owner]
  );
  const isCurrentOwner = useCallback(
    () => Boolean(owner && mounted.current && currentOwner.current === owner),
    [owner]
  );
  const scoped = collection.owner === owner;
  return (
    <CompanyRecordsContext.Provider
      value={{
        owner,
        records: scoped ? collection.records : [],
        loading: scoped ? loading : Boolean(owner),
        refreshing: scoped ? refreshing : false,
        error: scoped ? error : '',
        reload,
        removeLocal,
        isCurrentOwner,
      }}
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
