import { createHash } from 'node:crypto';
import type { CompanyPdfPage, CompanyPdfText } from './company-extraction.js';
import { officialPdfUrl } from './company-sources.js';
import { readPdfIsolated } from './pdf-parser.js';
import pdfLimits from './pdf-limits.json' with { type: 'json' };
import { ApiFault } from './validation.js';

// Bump the worker revision when its text/table extraction semantics change.
export const OFFICIAL_PDF_CACHE_VERSION = `pdf-parse:2.4.5/worker:1/pages:500/text:8000000/tables:1000000/bytes:${pdfLimits.officialBytes}`;

type ParsedPdf = Pick<CompanyPdfText, 'pages' | 'total'>;
interface PdfCacheOptions {
  parse?: (buffer: Buffer, signal: AbortSignal) => Promise<ParsedPdf>;
  parserVersion?: string;
  maxEntries?: number;
  maxBytes?: number;
  maxEntryBytes?: number;
  maxPending?: number;
  maxPendingBytes?: number;
  maxSubscribers?: number;
}
interface Subscriber {
  resolve: (value: CompanyPdfText) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  abort: () => void;
}
interface ParseJob {
  key: string;
  bytes: number;
  controller: AbortController;
  subscribers: Set<Subscriber>;
}
interface CachedPdf {
  value: CompanyPdfText;
  bytes: number;
}
const cancelled = () => new ApiFault(499, 'PDF_PARSE_CANCELLED', 'PDF读取已中止');
const invalid = () => new ApiFault(422, 'PDF_PARSE_FAILED', 'PDF文本读取未完成，未生成替代金额');

function checkedText(value: ParsedPdf, sha256: string): CompanyPdfText {
  if (
    !value ||
    !Number.isInteger(value.total) ||
    value.total < 1 ||
    value.total > 500 ||
    !Array.isArray(value.pages) ||
    value.pages.length !== value.total
  )
    throw invalid();
  let textLength = 0,
    usableLength = 0,
    tableJsonLength = 1;
  const pages: CompanyPdfPage[] = [];
  for (const [index, page] of value.pages.entries()) {
    if (!page || page.page !== index + 1 || typeof page.text !== 'string') throw invalid();
    textLength += page.text.length;
    if (textLength > 8_000_000)
      throw new ApiFault(413, 'PDF_TEXT_LIMIT', 'PDF文本超过本次处理预算');
    usableLength += page.text.trim().length;
    if (
      page.tables !== undefined &&
      (!Array.isArray(page.tables) ||
        page.tables.length > 10 ||
        page.tables.some(
          (table) =>
            !Array.isArray(table) ||
            table.length > 200 ||
            table.some(
              (row) =>
                !Array.isArray(row) ||
                row.length !== 3 ||
                row.some((cell) => typeof cell !== 'string' || cell.length > 2000)
            )
        ))
    )
      throw invalid();
    tableJsonLength += JSON.stringify(page.tables || []).length + 1;
    if (tableJsonLength > 1_000_000)
      throw new ApiFault(413, 'PDF_TEXT_LIMIT', 'PDF文本超过本次处理预算');
    pages.push({
      page: page.page,
      text: page.text,
      ...(page.tables !== undefined ? { tables: structuredClone(page.tables) } : {}),
    });
  }
  if (usableLength < 40)
    throw new ApiFault(422, 'PDF_NO_TEXT', '未取得可用PDF文本，当前未运行OCR；请补充文本财报');
  return { pages, total: value.total, sha256 };
}

/** Process-local text cache. Only caller-verified official URLs may opt in. */
export function createOfficialPdfTextCache(options: PdfCacheOptions = {}) {
  const parse = options.parse || ((buffer, signal) => readPdfIsolated(buffer, signal, 'official'));
  const parserVersion = options.parserVersion || OFFICIAL_PDF_CACHE_VERSION;
  const maxEntries = options.maxEntries ?? 64,
    maxBytes = options.maxBytes ?? 32 * 1024 * 1024,
    maxEntryBytes = options.maxEntryBytes ?? 20 * 1024 * 1024,
    maxPending = options.maxPending ?? 5,
    maxPendingBytes = options.maxPendingBytes ?? 128 * 1024 * 1024,
    maxSubscribers = options.maxSubscribers ?? 32;
  if (
    !parserVersion ||
    parserVersion.length > 256 ||
    [maxEntries, maxBytes, maxEntryBytes, maxPending, maxPendingBytes, maxSubscribers].some(
      (limit) => !Number.isSafeInteger(limit) || limit < 1
    )
  )
    throw new RangeError('Invalid official PDF cache limits');
  const ready = new Map<string, CachedPdf>();
  const pending = new Map<string, ParseJob>();
  const active = new Set<ParseJob>();
  let bytes = 0,
    pendingBytes = 0,
    parses = 0,
    hits = 0,
    joins = 0;
  const detach = (job: ParseJob, subscriber: Subscriber) => {
    subscriber.signal?.removeEventListener('abort', subscriber.abort);
    job.subscribers.delete(subscriber);
  };
  const subscribe = (job: ParseJob, signal?: AbortSignal): Promise<CompanyPdfText> =>
    new Promise((resolve, reject) => {
      const subscriber: Subscriber = {
        resolve,
        reject,
        signal,
        abort: () => {
          detach(job, subscriber);
          reject(cancelled());
          if (!job.subscribers.size) {
            if (pending.get(job.key) === job) pending.delete(job.key);
            job.controller.abort();
          }
        },
      };
      job.subscribers.add(subscriber);
      signal?.addEventListener('abort', subscriber.abort, { once: true });
      if (signal?.aborted) subscriber.abort();
    });
  const finish = (job: ParseJob, result?: CompanyPdfText, error?: unknown) => {
    if (pending.get(job.key) === job) pending.delete(job.key);
    active.delete(job);
    pendingBytes -= job.bytes;
    for (const subscriber of [...job.subscribers]) {
      detach(job, subscriber);
      if (error !== undefined) subscriber.reject(error);
      else subscriber.resolve(structuredClone(result!));
    }
  };
  return {
    async read(buffer: Buffer, sourceUrl: string, signal?: AbortSignal): Promise<CompanyPdfText> {
      officialPdfUrl(sourceUrl);
      if (signal?.aborted) throw cancelled();
      if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-')))
        throw new ApiFault(400, 'PDF_INVALID', '原件没有PDF标记');
      if (buffer.length > pdfLimits.officialBytes)
        throw new ApiFault(413, 'PDF_SIZE_LIMIT', 'PDF超过100MB读取预算');
      const sha256 = createHash('sha256').update(buffer).digest('hex');
      const key = `${parserVersion}:${sha256}`;
      const cached = ready.get(key);
      if (cached) {
        ready.delete(key);
        ready.set(key, cached);
        hits++;
        return structuredClone(cached.value);
      }
      const existing = pending.get(key);
      if (existing) {
        if (existing.subscribers.size >= maxSubscribers)
          throw new ApiFault(429, 'PDF_PARSE_BUSY', 'PDF解析队列已满，请稍后重试');
        joins++;
        return subscribe(existing, signal);
      }
      if (active.size >= maxPending || pendingBytes + buffer.length > maxPendingBytes)
        throw new ApiFault(429, 'PDF_PARSE_BUSY', 'PDF解析队列已满，请稍后重试');
      // Hold one bounded byte snapshot, so a queued caller cannot mutate the hash's content.
      const original = Buffer.from(buffer);
      const job: ParseJob = {
        key,
        bytes: original.length,
        controller: new AbortController(),
        subscribers: new Set(),
      };
      pending.set(key, job);
      active.add(job);
      pendingBytes += job.bytes;
      const subscribed = subscribe(job, signal);
      void Promise.resolve()
        .then(async () => {
          if (job.controller.signal.aborted) throw cancelled();
          parses++;
          return checkedText(await parse(original, job.controller.signal), sha256);
        })
        .then(
          (result) => {
            if (job.controller.signal.aborted || pending.get(key) !== job) {
              finish(job, undefined, cancelled());
              return;
            }
            // Charge UTF-16 strings plus an allowance for page/table object overhead.
            const resultBytes =
              JSON.stringify(result).length * 2 +
              result.pages.length * 128 +
              result.pages.reduce(
                (sum, page) =>
                  sum + (page.tables || []).reduce((count, table) => count + table.length * 96, 0),
                0
              );
            if (resultBytes <= maxEntryBytes && resultBytes <= maxBytes) {
              while (ready.size >= maxEntries || bytes + resultBytes > maxBytes) {
                const oldest = ready.keys().next().value!;
                bytes -= ready.get(oldest)!.bytes;
                ready.delete(oldest);
              }
              ready.set(key, { value: result, bytes: resultBytes });
              bytes += resultBytes;
            }
            finish(job, result);
          },
          (error) => finish(job, undefined, error)
        );
      return subscribed;
    },
    stats: () => ({
      entries: ready.size,
      bytes,
      pending: active.size,
      pendingBytes,
      parses,
      hits,
      joins,
    }),
  };
}

export const officialPdfTextCache = createOfficialPdfTextCache();
