import { createHash } from 'node:crypto';
import { ApiFault } from './validation.js';

export interface PublicResponse {
  body: Buffer;
  url: string;
  sha256: string;
  /** When the source was actually received, not when a cached copy was opened. */
  fetchedAt: string;
}
export type PublicResponseCacheStatus = 'miss' | 'hit' | 'shared';
interface Entry {
  response: PublicResponse;
  expiresAt: number;
}
interface Flight {
  controller: AbortController;
  consumers: number;
  promise: Promise<PublicResponse>;
}
interface ReadOptions {
  key: string;
  maximum: number;
  ttlMs: number;
  now: () => Date;
  signal: AbortSignal;
  bypass?: boolean;
  load: (signal: AbortSignal) => Promise<PublicResponse>;
  onStart: () => void;
}

function awaitActive<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new DOMException('Aborted', 'AbortError'));
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
    if (signal.aborted) {
      cleanup();
      abort();
    }
  });
}

/** Public bytes only. Private or credentialed requests must bypass this cache. */
export class PublicResponseCache {
  private entries = new Map<string, Entry>();
  private flights = new Map<string, Flight>();
  private generations = new Map<string, number>();
  private sequence = 0;
  private bytes = 0;
  private activeFlights = 0;
  constructor(
    private readonly maximumEntries = 128,
    private readonly maximumBytes = 32 * 1024 * 1024,
    private readonly maximumFlights = 32
  ) {}

  discard(key: string, sha256?: string): void {
    if (!sha256 || this.entries.get(key)?.response.sha256 === sha256) this.remove(key);
  }

  async read(options: ReadOptions): Promise<PublicResponse & { cache: PublicResponseCacheStatus }> {
    options.signal.throwIfAborted();
    const now = options.now().getTime();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.remove(key);
    if (!options.bypass) {
      const cached = this.entries.get(options.key);
      if (cached) {
        this.entries.delete(options.key);
        this.entries.set(options.key, cached);
        return this.copy(cached.response, 'hit', options.maximum);
      }
    }
    // Different limits cannot share a producer that may reject at the smaller limit.
    const flightKey = `${options.bypass ? 'refresh' : 'ordinary'}:${options.maximum}:${options.key}`;
    let flight = this.flights.get(flightKey);
    const status: PublicResponseCacheStatus = flight ? 'shared' : 'miss';
    if (!flight) {
      if (this.activeFlights >= this.maximumFlights)
        throw new ApiFault(503, 'CONTEXT_SOURCE_BUSY', '公开来源读取暂时繁忙，请稍后重试');
      options.onStart();
      this.activeFlights++;
      const generation = ++this.sequence;
      this.generations.set(options.key, generation);
      const controller = new AbortController();
      flight = { controller, consumers: 0, promise: Promise.resolve(undefined as never) };
      const started = flight;
      // Register the producer before calling load, including synchronous injected fetches.
      this.flights.set(flightKey, started);
      started.promise = Promise.resolve()
        .then(() => {
          controller.signal.throwIfAborted();
          return awaitActive(options.load(controller.signal), controller.signal);
        })
        .then((response) => {
          controller.signal.throwIfAborted();
          if (
            this.generations.get(options.key) === generation &&
            response.body.length <= this.maximumBytes &&
            options.ttlMs > 0
          ) {
            this.remove(options.key);
            const stored = { ...response, body: Buffer.from(response.body) };
            this.entries.set(options.key, {
              response: stored,
              expiresAt: options.now().getTime() + options.ttlMs,
            });
            this.bytes += stored.body.length;
            while (this.entries.size > this.maximumEntries || this.bytes > this.maximumBytes)
              this.remove(this.entries.keys().next().value!);
          }
          return response;
        })
        .finally(() => {
          this.activeFlights--;
          if (this.flights.get(flightKey) === started) this.flights.delete(flightKey);
          if (this.generations.get(options.key) === generation)
            this.generations.delete(options.key);
        });
      // A disconnected consumer must not produce an unhandled rejection.
      void started.promise.catch(() => undefined);
    }
    const subscribed = flight;
    subscribed.consumers++;
    return new Promise((resolve, reject) => {
      let complete = false;
      const finish = () => {
        if (complete) return false;
        complete = true;
        options.signal.removeEventListener('abort', abort);
        subscribed.consumers--;
        if (!subscribed.consumers) {
          subscribed.controller.abort();
          if (this.flights.get(flightKey) === subscribed) this.flights.delete(flightKey);
        }
        return true;
      };
      const abort = () => {
        if (finish()) reject(options.signal.reason || new DOMException('Aborted', 'AbortError'));
      };
      options.signal.addEventListener('abort', abort, { once: true });
      subscribed.promise.then(
        (response) => {
          if (!finish()) return;
          try {
            resolve(this.copy(response, status, options.maximum));
          } catch (error) {
            reject(error);
          }
        },
        (error) => {
          if (finish()) reject(error);
        }
      );
      if (options.signal.aborted) abort();
    });
  }

  private copy(response: PublicResponse, cache: PublicResponseCacheStatus, maximum: number) {
    if (response.body.length > maximum)
      throw new ApiFault(413, 'COMPANY_SOURCE_TOO_LARGE', '官方来源文件超过当前大小限制');
    return { ...response, body: Buffer.from(response.body), cache };
  }

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.bytes -= entry.response.body.length;
    this.entries.delete(key);
  }
}

const caches = new WeakMap<typeof fetch, PublicResponseCache>();
export function publicResponseCache(fetcher: typeof fetch): PublicResponseCache {
  let cache = caches.get(fetcher);
  if (!cache) {
    cache = new PublicResponseCache();
    caches.set(fetcher, cache);
  }
  return cache;
}

const publicHeaders = new Set([
  'user-agent',
  'referer',
  'accept',
  'accept-language',
  'content-type',
]);
const announcementFields = new Set([
  'pageNum',
  'pageSize',
  'column',
  'tabName',
  'stock',
  'searchkey',
  'secid',
  'plate',
  'category',
  'trade',
  'seDate',
  'sortName',
  'sortType',
  'isHLtitle',
]);

export function publicRequestCacheKey(
  url: URL,
  init: RequestInit,
  format: 'bytes' | 'json'
): string | null {
  if (
    url.username ||
    url.password ||
    init.credentials === 'include' ||
    [...url.searchParams.keys()].some((key) =>
      /^(?:token|access_token|api_?key|password|session|cookie|authorization)$/i.test(key)
    )
  )
    return null;
  const headers = new Headers(init.headers);
  if ([...headers.keys()].some((key) => !publicHeaders.has(key))) return null;
  const method = (init.method || 'GET').toUpperCase();
  let body = '';
  if (method === 'POST') {
    if (
      url.hostname !== 'www.cninfo.com.cn' ||
      url.pathname !== '/new/hisAnnouncement/query' ||
      typeof init.body !== 'string' ||
      init.body.length > 2000 ||
      !headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')
    )
      return null;
    body = init.body;
    const fields = new URLSearchParams(body);
    if (
      [...fields.keys()].some((key) => !announcementFields.has(key)) ||
      !/^\d{6},[A-Za-z0-9]{1,50}$/.test(fields.get('stock') || '') ||
      ['searchkey', 'secid', 'plate', 'trade'].some((key) => Boolean(fields.get(key)))
    )
      return null;
  } else if (method !== 'GET' || init.body != null) return null;
  return createHash('sha256')
    .update(
      JSON.stringify([
        format,
        url.href,
        method,
        [...headers.entries()].sort(([a], [b]) => a.localeCompare(b)),
        body,
      ])
    )
    .digest('hex');
}

export function publicResponseTtl(url: URL): number {
  if (url.hostname === 'push2.eastmoney.com') return 15_000;
  if (/news|guba|search-api|notices|ann$|Announcement/.test(url.href)) return 5 * 60_000;
  if (url.pathname.toLowerCase().endsWith('.pdf')) return 24 * 60 * 60_000;
  return 30 * 60_000;
}
