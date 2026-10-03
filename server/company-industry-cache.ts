import type { CompanyIndustrySnapshot } from '../shared/company-workspace.js';
import { ApiFault } from './validation.js';

export interface PublicIndustryCohort {
  period: string;
  industryCode: string;
  fetchedAt: string;
  codes: string[];
  income: Map<string, Record<string, unknown>>;
  balance: Map<string, Record<string, unknown>>;
  cash: Map<string, Record<string, unknown>>;
  chartIncome: Map<string, Record<string, unknown>>;
  sources: CompanyIndustrySnapshot['sources'];
  warnings: string[];
  coreComplete: boolean;
  complete: boolean;
}

interface Entry {
  value: PublicIndustryCohort;
  bytes: number;
  expiresAt: number;
}
interface Flight {
  key: string;
  generation: number;
  controller: AbortController;
  subscribers: number;
  settled: boolean;
  promise: Promise<PublicIndustryCohort>;
}

// Only validated public table rows enter this process-local cache. There is no
// owner, workspace, question or uploaded material in its key or value.
export class PublicIndustryCohortCache {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Flight>();
  private readonly active = new Set<Flight>();
  private readonly latest = new Map<string, number>();
  private generation = 0;
  private bytes = 0;

  constructor(
    private readonly limits = {
      entries: 24,
      bytes: 32 * 1024 * 1024,
      entryBytes: 8 * 1024 * 1024,
      pending: 16,
      subscribers: 32,
      ttlMs: 60 * 60 * 1000,
    },
    private readonly clock = Date.now
  ) {}

  async read(
    key: string,
    load: (signal: AbortSignal) => Promise<PublicIndustryCohort>,
    options: { signal?: AbortSignal; bypass?: boolean } = {}
  ): Promise<PublicIndustryCohort> {
    options.signal?.throwIfAborted();
    this.prune();
    if (!options.bypass) {
      const entry = this.entries.get(key);
      if (entry) {
        this.entries.delete(key);
        this.entries.set(key, entry);
        return structuredClone(entry.value);
      }
      const flight = this.pending.get(key);
      if (flight && !flight.controller.signal.aborted)
        return this.subscribe(flight, options.signal);
    }
    // A full cache must not start unaccounted parallel table trees. Valid hits
    // and subscribers to an existing flight remain usable within their bounds.
    if (this.active.size >= this.limits.pending)
      throw new ApiFault(429, 'INDUSTRY_COHORT_BUSY', '行业取数较多，请稍后重试');
    // After refresh starts, ordinary readers join that newer acquisition instead
    // of receiving a stale entry while its replacement is being obtained.
    if (options.bypass) this.remove(key);
    const flight: Flight = {
      key,
      generation: ++this.generation,
      controller: new AbortController(),
      subscribers: 0,
      settled: false,
      promise: undefined!,
    };
    this.latest.set(key, flight.generation);
    this.pending.set(key, flight);
    this.active.add(flight);
    flight.promise = Promise.resolve()
      .then(() => load(flight.controller.signal))
      .then((value) => {
        flight.controller.signal.throwIfAborted();
        if (value.complete && this.latest.get(key) === flight.generation) this.put(key, value);
        return value;
      })
      .finally(() => {
        flight.settled = true;
        this.active.delete(flight);
        if (this.pending.get(key) === flight) this.pending.delete(key);
        this.forgetGeneration(key);
      });
    return this.subscribe(flight, options.signal);
  }

  private subscribe(flight: Flight, signal?: AbortSignal): Promise<PublicIndustryCohort> {
    signal?.throwIfAborted();
    if (flight.subscribers >= this.limits.subscribers)
      throw new ApiFault(429, 'INDUSTRY_COHORT_BUSY', '行业取数较多，请稍后重试');
    flight.subscribers += 1;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = () => {
        if (finished) return false;
        finished = true;
        signal?.removeEventListener('abort', abort);
        flight.subscribers -= 1;
        if (!flight.subscribers && !flight.settled) {
          flight.controller.abort(new DOMException('No cohort readers remain', 'AbortError'));
          if (this.pending.get(flight.key) === flight) this.pending.delete(flight.key);
        }
        return true;
      };
      const abort = () => {
        if (finish())
          reject(signal?.reason || new DOMException('Cohort read aborted', 'AbortError'));
      };
      signal?.addEventListener('abort', abort, { once: true });
      flight.promise.then(
        (value) => {
          if (finish()) resolve(structuredClone(value));
        },
        (error) => {
          if (finish()) reject(error);
        }
      );
      if (signal?.aborted) abort();
    });
  }

  private put(key: string, value: PublicIndustryCohort): void {
    const bytes = Buffer.byteLength(
      JSON.stringify(value, (_key, item) => (item instanceof Map ? [...item] : item))
    );
    if (bytes > this.limits.entryBytes || bytes > this.limits.bytes) return;
    this.remove(key);
    this.entries.set(key, {
      value: structuredClone(value),
      bytes,
      expiresAt: this.clock() + this.limits.ttlMs,
    });
    this.bytes += bytes;
    while (this.entries.size > this.limits.entries || this.bytes > this.limits.bytes)
      this.remove(this.entries.keys().next().value!);
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.bytes -= entry.bytes;
    this.forgetGeneration(key);
  }

  private prune(): void {
    for (const [key, entry] of this.entries) if (entry.expiresAt <= this.clock()) this.remove(key);
  }

  private forgetGeneration(key: string): void {
    if (!this.entries.has(key) && ![...this.active].some((flight) => flight.key === key))
      this.latest.delete(key);
  }
}

const caches = new WeakMap<typeof fetch, PublicIndustryCohortCache>();
export function publicIndustryCohortCache(fetcher: typeof fetch): PublicIndustryCohortCache {
  let cache = caches.get(fetcher);
  if (!cache) {
    cache = new PublicIndustryCohortCache();
    caches.set(fetcher, cache);
  }
  return cache;
}
