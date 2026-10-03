import type { CompanyIdentity, CompanySearchResponse } from '../shared/contracts';
import {
  matchCompanyDirectory,
  normalizeCompanyQuery,
  parseCompanyDirectory,
  type CompanyDirectory,
} from '../shared/company-directory';

export function normalizeCompanySearchQuery(query: string): string {
  return normalizeCompanyQuery(query);
}

export function companyMatchesQuery(identity: CompanyIdentity, query: string): boolean {
  const value = normalizeCompanySearchQuery(query);
  return Boolean(
    value &&
      [identity.securityCode, identity.shortName, identity.companyName || ''].some((field) =>
        normalizeCompanySearchQuery(field).includes(value)
      )
  );
}

function cancelled(): DOMException {
  return new DOMException('Company search cancelled', 'AbortError');
}

interface PendingSearch {
  controller: AbortController;
  promise: Promise<CompanySearchResponse>;
  readers: number;
}

/** Public directory and candidates only; one instance belongs to one composer owner. */
export class CompanySearchClient {
  private directory: CompanyDirectory | null = null;
  private directoryRequest: Promise<void> | null = null;
  private directoryUnavailable = false;
  private readonly lifetime = new AbortController();
  private readonly cache = new Map<string, { result: CompanySearchResponse; expiresAt: number }>();
  private readonly pending = new Map<string, PendingSearch>();

  constructor(
    private readonly loadDirectory: (signal: AbortSignal) => Promise<CompanyDirectory>,
    private readonly remoteSearch: (
      query: string,
      signal: AbortSignal
    ) => Promise<CompanySearchResponse>,
    private readonly now: () => number = Date.now
  ) {}

  preload(): Promise<void> {
    if (this.lifetime.signal.aborted) return Promise.reject(cancelled());
    if (this.directory || this.directoryUnavailable) return Promise.resolve();
    if (!this.directoryRequest) {
      this.directoryRequest = this.loadDirectory(
        AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(5_000)])
      )
        .then((directory) => {
          const parsed = parseCompanyDirectory(directory);
          if (!parsed) throw new Error('The company directory could not be read.');
          if (!this.lifetime.signal.aborted) this.directory = parsed;
        })
        .catch((cause: unknown) => {
          if (!this.lifetime.signal.aborted) this.directoryUnavailable = true;
          throw cause;
        })
        .finally(() => {
          this.directoryRequest = null;
        });
    }
    return this.directoryRequest;
  }

  peek(query: string): CompanySearchResponse | null {
    if (this.lifetime.signal.aborted) return null;
    if (this.directory) {
      const result = matchCompanyDirectory(this.directory, query);
      if (result.candidates.length) return result;
    }
    const key = normalizeCompanySearchQuery(query);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.now()) return { ...cached.result, query };
    this.cache.delete(key);
    return null;
  }

  async search(
    query: string,
    signal: AbortSignal,
    refresh = false
  ): Promise<CompanySearchResponse> {
    signal = AbortSignal.any([signal, this.lifetime.signal]);
    if (signal.aborted) throw cancelled();
    if (!refresh) {
      const cached = this.peek(query);
      if (cached) return cached;
    }
    // Do not let a slow catalog hold up Enter or a completed code. It may still fill in
    // the local matches while the bounded live search is running.
    if (!this.directory && !this.directoryUnavailable) {
      await new Promise<void>((resolve, reject) => {
        const finish = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
          resolve();
        };
        const abort = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
          reject(cancelled());
        };
        const timer = setTimeout(finish, 80);
        signal.addEventListener('abort', abort, { once: true });
        void this.preload().then(finish, finish);
      });
    }
    if (signal.aborted || this.lifetime.signal.aborted) throw cancelled();
    const local = this.directory ? matchCompanyDirectory(this.directory, query) : null;
    if (local?.candidates.length) return local;
    if (!refresh) {
      const cached = this.peek(query);
      if (cached) return cached;
    }
    const key = normalizeCompanySearchQuery(query);
    let pending = this.pending.get(key);
    if (!pending || pending.controller.signal.aborted) {
      const controller = new AbortController();
      const created: PendingSearch = {
        controller,
        readers: 0,
        promise: Promise.resolve(null!),
      };
      created.promise = this.remoteSearch(query, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted && !this.lifetime.signal.aborted) {
            if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
            this.cache.set(key, {
              result,
              expiresAt: this.now() + (result.candidates.length ? 5 * 60_000 : 15_000),
            });
          }
          return result;
        })
        .finally(() => {
          if (this.pending.get(key) === created) this.pending.delete(key);
        });
      this.pending.set(key, created);
      pending = created;
    }
    const request = pending;
    request.readers++;
    return new Promise<CompanySearchResponse>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return false;
        settled = true;
        signal.removeEventListener('abort', abort);
        request.readers--;
        return true;
      };
      const abort = () => {
        if (!finish()) return;
        if (!request.readers) request.controller.abort();
        reject(cancelled());
      };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      request.promise.then(
        (result) => {
          if (finish()) resolve({ ...result, query });
        },
        (cause: unknown) => {
          if (finish()) reject(cause);
        }
      );
    });
  }

  dispose(): void {
    this.lifetime.abort();
    for (const request of this.pending.values()) request.controller.abort();
    this.pending.clear();
    this.cache.clear();
    this.directory = null;
  }
}
