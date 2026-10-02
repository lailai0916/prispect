import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fork, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { createIsolatedPdfReader, readPdfIsolated } from '../server/pdf-parser.js';
import { readCompanyPdf } from '../server/company-extraction.js';
import { ApiFault } from '../server/validation.js';
import pdfLimits from '../server/pdf-limits.json' with { type: 'json' };

function samplePdf(
  pageCount = 1,
  text = 'Independent real PDF parsing fixture: exact textual content remains on the local server.',
  padding = 0
) {
  const stream = `BT /F1 12 Tf 20 200 Td (${text}) Tj ET`;
  const font = pageCount + 3,
    content = pageCount + 4;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${i + 3} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    ...Array.from(
      { length: pageCount },
      () =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 300] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`
    ),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let result = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(result));
    result += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  if (padding) result += `%${' '.repeat(padding)}\n`;
  const start = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(result);
}
const probe = new URL('./fixtures/pdf-worker-probe.mjs', import.meta.url);
const isCode = (code: string) => (error: unknown) =>
  error instanceof ApiFault && error.code === code;

test('real PDF is parsed in the isolated process with identical pages and original-byte hash', async () => {
  const bytes = samplePdf();
  const parsed = await readPdfIsolated(bytes);
  assert.equal(parsed.total, 1);
  assert.match(parsed.pages[0]!.text, /exact textual content/);
  const company = await readCompanyPdf(bytes);
  assert.deepEqual(company.pages, parsed.pages);
  assert.equal(company.sha256, createHash('sha256').update(bytes).digest('hex'));
  await assert.rejects(readPdfIsolated(Buffer.from('%PDF-broken')), isCode('PDF_PARSE_FAILED'));
  await assert.rejects(readPdfIsolated(Buffer.from('not a PDF')), isCode('PDF_INVALID'));
});
test('a valid original larger than the upload budget uses the same isolated worker only through the official path', async () => {
  const bytes = samplePdf(
    1,
    'Larger official original preserves exact source text.',
    pdfLimits.uploadBytes
  );
  await assert.rejects(readPdfIsolated(bytes), isCode('PDF_SIZE_LIMIT'));
  const parsed = await readCompanyPdf(bytes);
  assert.equal(parsed.total, 1);
  assert.match(parsed.pages[0]!.text, /preserves exact source text/);
  assert.equal(parsed.sha256, createHash('sha256').update(bytes).digest('hex'));
});
test('CPU-bound child leaves the parent HTTP loop responsive; timeout kills and waits for exit', async () => {
  let pid = 0,
    beats = 0;
  const timer = setInterval(() => beats++, 20);
  const server = createServer((_req, res) => res.end('parent responsive')).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const read = createIsolatedPdfReader({
    workerUrl: probe,
    timeoutMs: 500,
    onWorkerStart: (value) => {
      pid = value;
    },
  });
  try {
    const pending = assert.rejects(read(Buffer.from('%PDF-busy')), isCode('PDF_PARSE_TIMEOUT'));
    const started = Date.now();
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    assert.equal(await response.text(), 'parent responsive');
    assert.ok(Date.now() - started < 400);
    await pending;
    assert.ok(beats >= 3);
    assert.throws(
      () => process.kill(pid, 0),
      (error) => (error as NodeJS.ErrnoException).code === 'ESRCH'
    );
  } finally {
    clearInterval(timer);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test('the actual parser stops over-page documents and empty-page markers cannot masquerade as usable text', async () => {
  await assert.rejects(readPdfIsolated(samplePdf(501)), isCode('PDF_PAGE_LIMIT'));
  await assert.rejects(readPdfIsolated(samplePdf(4, '')), isCode('PDF_NO_TEXT'));
});
test('aborting active and queued work never spawns the queued parser; slot is released only after exit', async () => {
  const controller = new AbortController(),
    queued = new AbortController();
  const pids: number[] = [];
  const read = createIsolatedPdfReader({
    workerUrl: probe,
    timeoutMs: 3000,
    maxConcurrent: 1,
    maxQueued: 1,
    onWorkerStart: (pid) => pids.push(pid),
  });
  const first = assert.rejects(
    read(Buffer.from('%PDF-busy'), controller.signal),
    isCode('PDF_PARSE_CANCELLED')
  );
  const second = assert.rejects(
    read(Buffer.from('%PDF-fast'), queued.signal),
    isCode('PDF_PARSE_CANCELLED')
  );
  await assert.rejects(read(Buffer.from('%PDF-extra')), isCode('PDF_PARSE_BUSY'));
  queued.abort();
  controller.abort();
  await Promise.all([first, second]);
  assert.equal(pids.length, 1);
  assert.throws(() => process.kill(pids[0]!, 0));
  const next = await read(Buffer.from('%PDF-fast'));
  assert.equal(next.total, 1);
  assert.equal(pids.length, 2);
});
test('worker receives no inherited private configuration and pre-aborted requests never spawn', async () => {
  process.env.PDF_PRIVATE_TEST = 'private fixture value';
  let spawned = 0;
  try {
    const read = createIsolatedPdfReader({ workerUrl: probe, onWorkerStart: () => spawned++ });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      read(Buffer.from('%PDF-fast'), controller.signal),
      isCode('PDF_PARSE_CANCELLED')
    );
    assert.equal(spawned, 0);
    const result = await read(Buffer.from('%PDF-fast'));
    assert.equal(JSON.parse(result.text).privateEnvironmentPresent, false);
  } finally {
    delete process.env.PDF_PRIVATE_TEST;
  }
});
test('actual spawn error without exit event still releases the slot on close for the next worker', async () => {
  let launches = 0,
    exits = 0;
  const read = createIsolatedPdfReader({
    workerUrl: probe,
    spawn: (module, args, options) => {
      const child = fork(module, args, {
        ...options,
        execPath: ++launches === 1 ? '/definitely-missing-cashlens-node' : process.execPath,
      });
      child.once('exit', () => exits++);
      return child;
    },
  });
  await assert.rejects(read(Buffer.from('%PDF-fast')), isCode('PDF_PARSE_FAILED'));
  assert.equal(exits, 0);
  assert.equal((await read(Buffer.from('%PDF-fast'))).total, 1);
  assert.equal(launches, 2);
});
test('a completed IPC payload cannot resolve a still-running worker; timeout and abort kill exactly once before releasing its slot', async () => {
  let pid = 0,
    launches = 0,
    oldGoneAtNextStart = false;
  const controller = new AbortController();
  const read = createIsolatedPdfReader({
    workerUrl: probe,
    timeoutMs: 250,
    maxQueued: 1,
    onWorkerStart: (value) => {
      launches++;
      if (launches === 1) pid = value;
      else {
        try {
          process.kill(pid, 0);
        } catch {
          oldGoneAtNextStart = true;
        }
      }
    },
  });
  const pending = assert.rejects(
    read(Buffer.from('%PDF-linger'), controller.signal),
    (error) =>
      error instanceof ApiFault && ['PDF_PARSE_TIMEOUT', 'PDF_PARSE_CANCELLED'].includes(error.code)
  );
  // Race the cancellation against the deadline. Either reason must reject the already-received payload.
  setTimeout(() => controller.abort(), 250);
  await pending;
  assert.throws(() => process.kill(pid, 0));
  assert.equal((await read(Buffer.from('%PDF-fast'))).total, 1);
  assert.equal(oldGoneAtNextStart, true);
  assert.equal(launches, 2);
});
test('the actual parser worker exits when its parent dies before parser startup finishes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cashlens-parent-death-'));
  let pid = 0,
    exited = false;
  try {
    const parent = path.join(directory, 'parent.mjs');
    const worker = fileURLToPath(new URL('../server/company-pdf-worker.mjs', import.meta.url));
    await writeFile(
      parent,
      `import {fork} from 'node:child_process'; const child=fork(${JSON.stringify(worker)},[],{execArgv:[],stdio:['ignore','ignore','ignore','ipc'],env:{PATH:process.env.PATH||'',TZ:'UTC'}}); child.send({buffer:Buffer.from(${JSON.stringify(samplePdf().toString('base64'))},'base64')}); process.stdout.write(String(child.pid),()=>process.exit(0));`
    );
    const child = spawn(process.execPath, [parent], {
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { PATH: process.env.PATH || '' },
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    await new Promise<void>((resolve, reject) => {
      child.once('close', (code) =>
        code === 0 ? resolve() : reject(new Error('Parent probe did not exit cleanly'))
      );
    });
    pid = Number(output);
    assert.ok(Number.isInteger(pid) && pid > 0);
    const stopped = async () => {
      try {
        process.kill(pid, 0);
      } catch {
        return true;
      }
      // A zombie has already exited; Linux CI's PID 1 may reap it later.
      if (process.platform === 'linux') {
        const state = await readFile(`/proc/${pid}/stat`, 'utf8').catch(() => '');
        if (!state || /\) Z /.test(state)) return true;
      }
      return false;
    };
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !(await stopped()))
      await new Promise((resolve) => setTimeout(resolve, 20));
    exited = await stopped();
    assert.equal(exited, true);
  } finally {
    if (pid && !exited)
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    await rm(directory, { recursive: true, force: true });
  }
});
