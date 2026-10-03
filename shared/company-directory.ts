import type { CompanyIdentity, CompanySearchResponse } from './contracts.js';

export const COMPANY_DIRECTORY_SOURCE = 'https://www.cninfo.com.cn/new/data/szse_stock.json';

/** Public lookup hints only. Research still resolves the selected official identity. */
export interface CompanyDirectory {
  source: 'cninfo';
  sourceUrl: typeof COMPANY_DIRECTORY_SOURCE;
  retrievedAt: string;
  sha256: string;
  entries: [securityCode: string, orgId: string, shortName: string][];
}

export function normalizeCompanyQuery(query: string): string {
  return query.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

export function directoryExchange(code: string): CompanyIdentity['exchange'] {
  if (/^(?:60|68)/.test(code)) return 'sse';
  if (/^(?:00|30)/.test(code)) return 'szse';
  if (/^(?:43|83|87|92)/.test(code)) return 'bse';
  return 'unknown';
}

function validEntry(entry: unknown): entry is CompanyDirectory['entries'][number] {
  return (
    Array.isArray(entry) &&
    entry.length === 3 &&
    typeof entry[0] === 'string' &&
    /^\d{6}$/.test(entry[0]) &&
    directoryExchange(entry[0]) !== 'unknown' &&
    typeof entry[1] === 'string' &&
    /^[A-Za-z0-9]{1,40}$/.test(entry[1]) &&
    typeof entry[2] === 'string' &&
    entry[2].trim().length > 0 &&
    entry[2].length <= 80 &&
    !/[\x00-\x1f]/.test(entry[2])
  );
}

export function parseCompanyDirectory(value: unknown): CompanyDirectory | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<CompanyDirectory>;
  if (
    item.source !== 'cninfo' ||
    item.sourceUrl !== COMPANY_DIRECTORY_SOURCE ||
    typeof item.retrievedAt !== 'string' ||
    !Number.isFinite(Date.parse(item.retrievedAt)) ||
    typeof item.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(item.sha256) ||
    !Array.isArray(item.entries) ||
    item.entries.length > 20_000 ||
    !item.entries.every(validEntry)
  )
    return null;
  return item as CompanyDirectory;
}

export function directoryFromCninfo(
  value: unknown,
  metadata: Pick<CompanyDirectory, 'retrievedAt' | 'sha256'>
): CompanyDirectory | null {
  if (!value || typeof value !== 'object') return null;
  const rows = (value as { stockList?: unknown }).stockList;
  if (!Array.isArray(rows) || rows.length > 20_000) return null;
  const entries: CompanyDirectory['entries'] = [];
  const seen = new Set<string>();
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (row.category !== 'A股' || row.delisted === 'true' || row.delisted === true) continue;
    const entry = [row.code, row.orgId, row.zwjc];
    if (!validEntry(entry)) continue;
    const key = `${entry[0]}:${entry[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  entries.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  if (!entries.length) return null;
  return parseCompanyDirectory({
    source: 'cninfo',
    sourceUrl: COMPANY_DIRECTORY_SOURCE,
    ...metadata,
    entries,
  });
}

/** A miss must still use the live search; this catalog is not proof of nonexistence. */
export function matchCompanyDirectory(
  directory: CompanyDirectory,
  query: string
): CompanySearchResponse {
  const normalized = normalizeCompanyQuery(query);
  const matches: { rank: number; entry: CompanyDirectory['entries'][number] }[] = [];
  if (
    normalized &&
    query.trim().length <= 80 &&
    !/[\x00-\x1f]/.test(query) &&
    !/^[a-z]+(?:[.-][a-z]+)?$/.test(normalized)
  ) {
    for (const entry of directory.entries) {
      const name = normalizeCompanyQuery(entry[2]);
      const rank =
        entry[0] === normalized || name === normalized
          ? 0
          : entry[0].startsWith(normalized) || name.startsWith(normalized)
            ? 1
            : name.includes(normalized)
              ? 2
              : -1;
      if (rank >= 0) matches.push({ rank, entry });
    }
  }
  matches.sort((a, b) => a.rank - b.rank || a.entry[0].localeCompare(b.entry[0]));
  return {
    query: query.trim(),
    candidates: matches.slice(0, 20).map(({ entry }) => ({
      securityCode: entry[0],
      orgId: entry[1],
      shortName: entry[2],
      companyName: null,
      exchange: directoryExchange(entry[0]),
      sourceUrl: `https://www.cninfo.com.cn/new/snapshot/companyDetailCn?code=${entry[0]}`,
    })),
    limitedToListed: true,
    source: 'cninfo',
    truncated: matches.length > 20,
  };
}
