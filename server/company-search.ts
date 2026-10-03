import type express from 'express';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { CompanySearchResponse } from '../shared/contracts.js';
import {
  COMPANY_DIRECTORY_SOURCE,
  directoryFromCninfo,
  matchCompanyDirectory,
  normalizeCompanyQuery,
  parseCompanyDirectory,
  type CompanyDirectory,
} from '../shared/company-directory.js';
import type { AuthContext, AuthStore } from './auth.js';
import { assertCompanySearchSupported, boundedBody, searchCompanies } from './company-sources.js';
import { ApiFault } from './validation.js';

const DIRECTORY_MAX_BYTES = 2_000_000;
const DIRECTORY_REFRESH_MS = 24 * 60 * 60 * 1000;
const MAX_CACHED_QUERIES = 200;
const MAX_PENDING_QUERIES = 32;
const SEARCH_TIMEOUT_MS = 3500;
const cancellation = () => new ApiFault(499, 'COMPANY_CANCELLED', '公司匹配已取消');

export async function loadCompanyDirectory(root: string): Promise<CompanyDirectory | null> {
  try {
    const filename = path.join(root, 'data/company-directory.json');
    if ((await stat(filename)).size > DIRECTORY_MAX_BYTES) return null;
    const directory: unknown = JSON.parse(await readFile(filename, 'utf8'));
    return parseCompanyDirectory(directory);
  } catch {
    return null;
  }
}

interface PendingSearch {
  controller: AbortController;
  subscribers: number;
  promise: Promise<CompanySearchResponse>;
}

/** Only public issuer candidates are shared; this cache never reads a workspace. */
export function createCompanySearch(options: {
  directory: CompanyDirectory | null;
  search?: typeof searchCompanies;
  now?: () => number;
  fetch?: typeof fetch;
  refreshDirectory?: boolean;
}) {
  const search = options.search || searchCompanies;
  const now = options.now || Date.now;
  let directory = options.directory;
  let refreshing: Promise<void> | undefined;
  let lastRefreshAttempt = 0;
  const cached = new Map<string, { expiresAt: number; result: CompanySearchResponse }>();
  const pending = new Map<string, PendingSearch>();

  const refresh = () => {
    if (
      options.refreshDirectory === false ||
      refreshing ||
      (directory && now() - Date.parse(directory.retrievedAt) < DIRECTORY_REFRESH_MS) ||
      now() - lastRefreshAttempt < 60_000
    )
      return;
    lastRefreshAttempt = now();
    refreshing = (async () => {
      const signal = AbortSignal.timeout(8000);
      const response = await (options.fetch || fetch)(COMPANY_DIRECTORY_SOURCE, {
        signal,
        redirect: 'error',
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.cninfo.com.cn/' },
      });
      if (!response.ok) throw new Error('Public directory unavailable');
      const bytes = await boundedBody(response, DIRECTORY_MAX_BYTES, signal);
      const replacement = directoryFromCninfo(JSON.parse(bytes.toString('utf8')), {
        retrievedAt: new Date(now()).toISOString(),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
      // A partial/error response must not replace the complete fallback snapshot.
      if (!replacement || replacement.entries.length < 1000)
        throw new Error('Public directory is incomplete');
      directory = replacement;
    })()
      .catch(() => undefined)
      .finally(() => {
        refreshing = undefined;
      });
  };

  const resultFor = (result: CompanySearchResponse, query: string) => ({
    ...structuredClone(result),
    query,
  });
  const subscribe = (
    entry: PendingSearch,
    key: string,
    query: string,
    signal?: AbortSignal
  ): Promise<CompanySearchResponse> => {
    if (signal?.aborted) return Promise.reject(cancellation());
    entry.subscribers++;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = () => {
        if (finished) return false;
        finished = true;
        signal?.removeEventListener('abort', abort);
        entry.subscribers--;
        return true;
      };
      const abort = () => {
        if (!finish()) return;
        reject(cancellation());
        if (entry.subscribers === 0) {
          entry.controller.abort();
          if (pending.get(key) === entry) pending.delete(key);
        }
      };
      signal?.addEventListener('abort', abort, { once: true });
      entry.promise.then(
        (result) => {
          if (finish()) resolve(resultFor(result, query));
        },
        (error) => {
          if (finish()) reject(error);
        }
      );
      if (signal?.aborted) abort();
    });
  };

  return {
    directory: () => {
      refresh();
      return directory;
    },
    search: async (query: string, signal?: AbortSignal): Promise<CompanySearchResponse> => {
      query = query.trim();
      if (!query || query.length > 80 || /[\x00-\x1f]/.test(query))
        throw new ApiFault(400, 'INVALID_COMPANY_QUERY', '请输入公司简称或六位证券代码');
      assertCompanySearchSupported(query);
      if (signal?.aborted) throw cancellation();
      refresh();
      if (directory) {
        const local = matchCompanyDirectory(directory, query);
        if (local.candidates.length) return local;
      }
      const key = normalizeCompanyQuery(query);
      const existing = cached.get(key);
      if (existing && existing.expiresAt > now()) {
        cached.delete(key);
        cached.set(key, existing);
        return resultFor(existing.result, query);
      }
      cached.delete(key);
      let entry = pending.get(key);
      if (!entry) {
        if (pending.size >= MAX_PENDING_QUERIES)
          throw new ApiFault(503, 'COMPANY_SEARCH_BUSY', '公司匹配请求较多，请稍后重试');
        const controller = new AbortController();
        entry = { controller, subscribers: 0, promise: undefined! };
        const current = entry;
        entry.promise = Promise.resolve()
          .then(() =>
            search(query, {
              signal: controller.signal,
              timeoutMs: SEARCH_TIMEOUT_MS,
              maxAttempts: 1,
            })
          )
          .then((result) => {
            if (controller.signal.aborted) throw cancellation();
            cached.set(key, {
              expiresAt: now() + (result.candidates.length ? 300_000 : 15_000),
              result: structuredClone(result),
            });
            while (cached.size > MAX_CACHED_QUERIES) cached.delete(cached.keys().next().value!);
            return result;
          })
          .finally(() => {
            if (pending.get(key) === current) pending.delete(key);
          });
        pending.set(key, entry);
      }
      return subscribe(entry, key, query, signal);
    },
  };
}

export async function installCompanySearchRoutes(
  app: express.Express,
  options: {
    root: string;
    auth: AuthStore;
    search?: typeof searchCompanies;
    directory?: CompanyDirectory | null;
  }
) {
  const search = createCompanySearch({
    directory:
      options.directory === undefined
        ? await loadCompanyDirectory(options.root)
        : options.directory,
    search: options.search,
    // Service injection is used by isolated tests and must not start unrelated live requests.
    refreshDirectory: !options.search,
  });
  app.get('/api/companies/directory', (_req, res, next) => {
    const directory = search.directory();
    if (!directory) {
      next(
        new ApiFault(503, 'COMPANY_DIRECTORY_UNAVAILABLE', '公司目录暂不可用，请继续输入名称检索')
      );
      return;
    }
    res.json(directory);
  });
  app.get('/api/companies/search', async (req, res, next) => {
    const controller = new AbortController();
    const abort = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once('aborted', abort);
    res.once('close', abort);
    try {
      const query = z.string().trim().min(1).max(80).safeParse(req.query.q);
      if (!query.success)
        throw new ApiFault(400, 'INVALID_COMPANY_QUERY', '请输入公司简称或六位证券代码');
      assertCompanySearchSupported(query.data);
      options.auth.rateLimit(
        `company-search:${(res.locals.auth as AuthContext).user.id}`,
        30,
        60_000
      );
      const result = await search.search(query.data, controller.signal);
      if (!controller.signal.aborted) res.json(result);
    } catch (error) {
      if (!controller.signal.aborted) next(error);
    } finally {
      req.removeListener('aborted', abort);
      res.removeListener('close', abort);
    }
  });
}
