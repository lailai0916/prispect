import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { createOfficialPdfTextCache, officialPdfTextCache } from '../server/official-pdf-cache.js';
import { readCompanyPdf, type CompanyPdfText } from '../server/company-extraction.js';
import { ApiFault } from '../server/validation.js';

const source = 'https://static.cninfo.com.cn/finalpage/2026-10-03/1234567890.PDF';
const bytes = (label: string) => Buffer.from(`%PDF-fixture-${label}`);
const pageText =
  'Recorded financial statement text remains exact and is independently checked by each research run.';
const parsed = (): Pick<CompanyPdfText, 'pages' | 'total'> => ({
  total: 1,
  pages: [{ page: 1, text: pageText, tables: [[['现金流', '123.45', '100.00']]] }],
});
const isCode = (code: string) => (error: unknown) =>
  error instanceof ApiFault && error.code === code;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('official immutable bytes reuse parsed text across URLs; changed bytes use a different hash', async () => {
  let calls = 0;
  const cache = createOfficialPdfTextCache({
    parse: async () => {
      calls++;
      return { ...parsed(), ignoredPrivateField: 'not part of the public result' };
    },
  });
  const original = bytes('annual-original');
  const first = await cache.read(original, source);
  first.pages[0]!.text = 'caller mutation';
  first.pages[0]!.tables![0]![0]![0] = 'caller mutation';
  const again = await cache.read(Buffer.from(original), source.replace('1234567890', '1234567891'));
  assert.equal(calls, 1);
  assert.equal(again.pages[0]!.text, pageText);
  assert.equal(again.pages[0]!.tables![0]![0]![0], '现金流');
  assert.equal(Object.hasOwn(again, 'ignoredPrivateField'), false);
  assert.equal(again.sha256, createHash('sha256').update(original).digest('hex'));
  const corrected = await cache.read(bytes('corrected-original'), source);
  assert.equal(calls, 2);
  assert.notEqual(corrected.sha256, again.sha256);
  assert.equal(cache.stats().hits, 1);
});

test('untrusted URLs, private paths and invalid bytes cannot enter the public PDF cache', async () => {
  let calls = 0;
  const cache = createOfficialPdfTextCache({ parse: async () => (calls++, parsed()) });
  for (const url of [
    'https://prispect.com/api/uploads/private',
    'https://static.cninfo.com.cn/uploads/private.pdf',
    source.replace('https:', 'http:'),
    source.replace('static.cninfo.com.cn', 'static.cninfo.com.cn.evil.example'),
    `${source}?token=private`,
    source.replace('static.cninfo.com.cn', 'person:secret@static.cninfo.com.cn'),
  ])
    await assert.rejects(cache.read(bytes('private'), url), isCode('COMPANY_SOURCE_URL'));
  await assert.rejects(cache.read(Buffer.from('not a PDF'), source), isCode('PDF_INVALID'));
  assert.equal(calls, 0);
  assert.equal(cache.stats().entries, 0);
});

test('one cancelled subscriber leaves another reader alive and only one parse runs', async () => {
  const result = deferred<ReturnType<typeof parsed>>();
  let parserSignal: AbortSignal | undefined;
  const cache = createOfficialPdfTextCache({
    parse: async (_buffer, signal) => {
      parserSignal = signal;
      return result.promise;
    },
  });
  const firstController = new AbortController();
  const first = cache.read(bytes('shared'), source, firstController.signal);
  const firstCancelled = assert.rejects(first, isCode('PDF_PARSE_CANCELLED'));
  const second = cache.read(bytes('shared'), source);
  await setImmediate();
  firstController.abort();
  await firstCancelled;
  assert.equal(parserSignal?.aborted, false);
  result.resolve(parsed());
  assert.equal((await second).pages[0]!.text, pageText);
  assert.equal((await cache.read(bytes('shared'), source)).total, 1);
  assert.deepEqual(
    { parses: cache.stats().parses, joins: cache.stats().joins, hits: cache.stats().hits },
    { parses: 1, joins: 1, hits: 1 }
  );
});

test('all subscribers cancelling aborts the parser; a late ignored result is never published', async () => {
  const result = deferred<ReturnType<typeof parsed>>();
  let parserSignal: AbortSignal | undefined,
    calls = 0;
  const cache = createOfficialPdfTextCache({
    parse: async (_buffer, signal) => {
      parserSignal = signal;
      return ++calls === 1 ? result.promise : parsed();
    },
  });
  const a = new AbortController(),
    b = new AbortController();
  const first = assert.rejects(
    cache.read(bytes('late'), source, a.signal),
    isCode('PDF_PARSE_CANCELLED')
  );
  const second = assert.rejects(
    cache.read(bytes('late'), source, b.signal),
    isCode('PDF_PARSE_CANCELLED')
  );
  await setImmediate();
  a.abort();
  b.abort();
  await Promise.all([first, second]);
  assert.equal(parserSignal?.aborted, true);
  result.resolve(parsed());
  await setImmediate();
  assert.equal(cache.stats().entries, 0);
  assert.equal(cache.stats().pending, 0);
  await cache.read(bytes('late'), source);
  assert.equal(calls, 2);
});

test('pre-aborted readers never parse and cannot consume an existing completed result', async () => {
  const cache = createOfficialPdfTextCache({ parse: async () => parsed() });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    cache.read(bytes('abort'), source, controller.signal),
    isCode('PDF_PARSE_CANCELLED')
  );
  assert.equal(cache.stats().parses, 0);
  await cache.read(bytes('abort'), source);
  await assert.rejects(
    cache.read(bytes('abort'), source, controller.signal),
    isCode('PDF_PARSE_CANCELLED')
  );
  assert.equal(cache.stats().hits, 0);
});

test('parser failures, empty text and malformed page/table results are not negative cache entries', async () => {
  let calls = 0;
  const values: (ReturnType<typeof parsed> | Error)[] = [
    new ApiFault(504, 'PDF_PARSE_TIMEOUT', 'fixture timeout'),
    { total: 1, pages: [{ page: 1, text: ' ' }] },
    { total: 1, pages: [{ page: 2, text: pageText }] },
    { total: 1, pages: [{ page: 1, text: pageText, tables: [[['bad columns']]] }] },
    { total: 1, pages: [{ page: 1, text: 'x'.repeat(8_000_001) }] },
    parsed(),
  ];
  const cache = createOfficialPdfTextCache({
    parse: async () => {
      const value = values[calls++]!;
      if (value instanceof Error) throw value;
      return value;
    },
  });
  for (const code of [
    'PDF_PARSE_TIMEOUT',
    'PDF_NO_TEXT',
    'PDF_PARSE_FAILED',
    'PDF_PARSE_FAILED',
    'PDF_TEXT_LIMIT',
  ]) {
    await assert.rejects(cache.read(bytes('retryable'), source), isCode(code));
    assert.equal(cache.stats().entries, 0);
  }
  assert.equal((await cache.read(bytes('retryable'), source)).total, 1);
  assert.equal((await cache.read(bytes('retryable'), source)).total, 1);
  assert.equal(calls, 6);
});

test('entry count uses LRU and byte limits prevent retaining oversized successful parses', async () => {
  const cache = createOfficialPdfTextCache({ maxEntries: 2, parse: async () => parsed() });
  await cache.read(bytes('a'), source);
  await cache.read(bytes('b'), source);
  await cache.read(bytes('a'), source);
  await cache.read(bytes('c'), source);
  assert.equal(cache.stats().entries, 2);
  await cache.read(bytes('b'), source);
  assert.equal(cache.stats().parses, 4);
  const tiny = createOfficialPdfTextCache({
    maxBytes: 128,
    maxEntryBytes: 128,
    parse: async () => parsed(),
  });
  assert.equal((await tiny.read(bytes('oversized-text'), source)).total, 1);
  assert.equal((await tiny.read(bytes('oversized-text'), source)).total, 1);
  assert.equal(tiny.stats().parses, 2);
  assert.equal(tiny.stats().entries, 0);
  assert.equal(tiny.stats().bytes, 0);
});

test('pending byte/slot budgets still allow joining an existing parse and recover after completion', async () => {
  const result = deferred<ReturnType<typeof parsed>>();
  const cache = createOfficialPdfTextCache({
    maxPending: 1,
    maxPendingBytes: 30,
    parse: async () => result.promise,
  });
  const first = cache.read(bytes('budget'), source);
  const joined = cache.read(bytes('budget'), source);
  await assert.rejects(cache.read(bytes('another'), source), isCode('PDF_PARSE_BUSY'));
  result.resolve(parsed());
  await Promise.all([first, joined]);
  assert.equal(cache.stats().pendingBytes, 0);
  assert.equal((await cache.read(bytes('another'), source)).total, 1);
  const tooSmall = createOfficialPdfTextCache({ maxPendingBytes: 1, parse: async () => parsed() });
  await assert.rejects(tooSmall.read(bytes('bigger'), source), isCode('PDF_PARSE_BUSY'));
  assert.equal(tooSmall.stats().parses, 0);
});

test('a queued parser sees a byte snapshot matching the original hash despite caller mutation', async () => {
  const original = bytes('before-change');
  const expected = Buffer.from(original);
  const cache = createOfficialPdfTextCache({
    parse: async (buffer) => {
      assert.deepEqual(buffer, expected);
      return parsed();
    },
  });
  const pending = cache.read(original, source);
  original.fill('X', 6);
  const result = await pending;
  assert.equal(result.sha256, createHash('sha256').update(expected).digest('hex'));
  await cache.read(expected, source);
  assert.equal(cache.stats().parses, 1);
});

test('a shared parse has a bounded subscriber list without interrupting its accepted readers', async () => {
  const result = deferred<ReturnType<typeof parsed>>();
  const cache = createOfficialPdfTextCache({
    maxSubscribers: 1,
    parse: async () => result.promise,
  });
  const first = cache.read(bytes('subscriber-budget'), source);
  await assert.rejects(cache.read(bytes('subscriber-budget'), source), isCode('PDF_PARSE_BUSY'));
  assert.equal(cache.stats().joins, 0);
  result.resolve(parsed());
  assert.equal((await first).total, 1);
  assert.equal((await cache.read(bytes('subscriber-budget'), source)).total, 1);
  assert.equal(cache.stats().parses, 1);
});

function realPdf() {
  const stream = `BT /F1 12 Tf 20 200 Td (Distinct official PDF cache test preserves original financial source text.) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let result = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(result));
    result += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const start = Buffer.byteLength(result);
  result += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(result);
}

test('the company reader defaults to uncached parsing and only explicit official provenance joins the public cache', async () => {
  const before = officialPdfTextCache.stats();
  const original = realPdf();
  const uncached = await readCompanyPdf(original);
  assert.deepEqual(officialPdfTextCache.stats(), before);
  const first = await readCompanyPdf(original, undefined, { sourceUrl: source });
  const again = await readCompanyPdf(original, undefined, { sourceUrl: source });
  assert.deepEqual(first, uncached);
  assert.deepEqual(again, first);
  assert.equal(officialPdfTextCache.stats().parses - before.parses, 1);
  assert.equal(officialPdfTextCache.stats().hits - before.hits, 1);
});
