import { fork, type ChildProcess, type ForkOptions } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ApiFault } from './validation.js';

export interface IsolatedPdfText {
  total: number;
  text: string;
  pages: { page: number; text: string }[];
}
interface PdfReaderOptions {
  timeoutMs?: number;
  maxConcurrent?: number;
  maxQueued?: number;
  workerUrl?: URL;
  onWorkerStart?: (pid: number) => void;
  spawn?: (module: string, args: string[], options: ForkOptions) => ChildProcess;
}
interface Job {
  buffer: Buffer;
  signal?: AbortSignal;
  resolve: (value: IsolatedPdfText) => void;
  reject: (reason: ApiFault) => void;
  child?: ChildProcess;
  timer?: NodeJS.Timeout;
  abort: () => void;
  failure?: ApiFault;
  output?: IsolatedPdfText;
  done: boolean;
}
const failure = (code: string): ApiFault => {
  const errors: Record<string, [number, string]> = {
    PDF_INVALID: [400, '原件没有PDF标记'],
    PDF_SIZE_LIMIT: [413, 'PDF超过25MB读取预算'],
    PDF_PAGE_LIMIT: [413, 'PDF超过500页处理预算'],
    PDF_TEXT_LIMIT: [413, 'PDF文本超过本次处理预算'],
    PDF_NO_TEXT: [422, '未取得可用PDF文本，当前未运行OCR；请补充文本财报'],
    PDF_PARSE_FAILED: [422, 'PDF文本读取未完成，未生成替代金额'],
    PDF_PARSE_TIMEOUT: [504, 'PDF读取超过40秒处理预算，已停止解析进程'],
    PDF_PARSE_CANCELLED: [499, 'PDF读取已中止'],
    PDF_PARSE_BUSY: [429, 'PDF解析队列已满，请稍后重试'],
  };
  const [status, message] = errors[code] || errors.PDF_PARSE_FAILED!;
  return new ApiFault(status, code, message);
};
export function createIsolatedPdfReader(options: PdfReaderOptions = {}) {
  const maximum = options.maxConcurrent ?? 1,
    queueMaximum = options.maxQueued ?? 4,
    timeout = options.timeoutMs ?? 40000;
  if (
    !Number.isInteger(maximum) ||
    maximum < 1 ||
    maximum > 2 ||
    !Number.isInteger(queueMaximum) ||
    queueMaximum < 0 ||
    queueMaximum > 8 ||
    !Number.isFinite(timeout) ||
    timeout < 1 ||
    timeout > 40000
  )
    throw new RangeError('Invalid PDF worker limits');
  const queue: Job[] = [];
  let active = 0;
  const finalize = (job: Job) => {
    if (job.done) return;
    job.done = true;
    clearTimeout(job.timer);
    job.signal?.removeEventListener('abort', job.abort);
    if (job.child) active--;
    else {
      const index = queue.indexOf(job);
      if (index >= 0) queue.splice(index, 1);
    }
    if (job.failure) job.reject(job.failure);
    else if (job.output) job.resolve(job.output);
    else job.reject(failure('PDF_PARSE_FAILED'));
    drain();
  };
  const stop = (job: Job, reason: ApiFault) => {
    if (job.done) return;
    job.failure ||= reason;
    if (job.child) job.child.kill('SIGKILL');
    else finalize(job);
  };
  const start = (job: Job) => {
    if (job.signal?.aborted) {
      stop(job, failure('PDF_PARSE_CANCELLED'));
      return;
    }
    active++;
    try {
      const child = (options.spawn || fork)(
        fileURLToPath(options.workerUrl || new URL('./company-pdf-worker.mjs', import.meta.url)),
        [],
        {
          execPath: process.execPath,
          execArgv: ['--max-old-space-size=384'],
          serialization: 'advanced',
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          env: { PATH: process.env.PATH || '', LANG: 'C.UTF-8', TZ: 'UTC', NODE_ENV: 'production' },
        }
      );
      job.child = child;
      if (child.pid) {
        try {
          options.onWorkerStart?.(child.pid);
        } catch {
          /* Diagnostics cannot interrupt cleanup. */
        }
      }
      child.once('error', () => {
        job.failure ||= failure('PDF_PARSE_FAILED');
      });
      child.on('message', (value: unknown) => {
        if (job.done || job.failure) return;
        const message = value as Partial<IsolatedPdfText> & { ok?: boolean; code?: string };
        if (message?.ok === false) {
          job.failure = failure(message.code || 'PDF_PARSE_FAILED');
          return;
        }
        if (
          message?.ok !== true ||
          !Number.isInteger(message.total) ||
          message.total! < 1 ||
          message.total! > 500 ||
          typeof message.text !== 'string' ||
          message.text.length > 8_000_000 ||
          !Array.isArray(message.pages) ||
          message.pages.length !== message.total ||
          message.pages.some(
            (p) =>
              !p ||
              !Number.isInteger(p.page) ||
              p.page < 1 ||
              p.page > message.total! ||
              typeof p.text !== 'string'
          ) ||
          message.pages.reduce((sum, p) => sum + p.text.length, 0) > 8_000_000 ||
          new Set(message.pages.map((p) => p.page)).size !== message.pages.length
        ) {
          stop(job, failure('PDF_PARSE_FAILED'));
          return;
        }
        job.output = { total: message.total!, text: message.text, pages: message.pages };
      });
      // A killed or failed worker retains its slot until the OS confirms exit.
      child.once('close', (code) => {
        if (code !== 0) job.failure ||= failure('PDF_PARSE_FAILED');
        finalize(job);
      });
      child.send({ buffer: job.buffer }, (error) => {
        if (error) stop(job, failure('PDF_PARSE_FAILED'));
      });
    } catch {
      if (!job.child) active--;
      stop(job, failure('PDF_PARSE_FAILED'));
    }
  };
  const drain = () => {
    while (active < maximum && queue.length) start(queue.shift()!);
  };
  return (buffer: Buffer, signal?: AbortSignal): Promise<IsolatedPdfText> => {
    if (signal?.aborted) return Promise.reject(failure('PDF_PARSE_CANCELLED'));
    if (buffer.length > 25 * 1024 * 1024) return Promise.reject(failure('PDF_SIZE_LIMIT'));
    if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-')))
      return Promise.reject(failure('PDF_INVALID'));
    if (active >= maximum && queue.length >= queueMaximum)
      return Promise.reject(failure('PDF_PARSE_BUSY'));
    return new Promise((resolve, reject) => {
      const job: Job = {
        buffer,
        signal,
        resolve,
        reject,
        done: false,
        abort: () => stop(job, failure('PDF_PARSE_CANCELLED')),
      };
      signal?.addEventListener('abort', job.abort, { once: true });
      job.timer = setTimeout(() => stop(job, failure('PDF_PARSE_TIMEOUT')), timeout);
      queue.push(job);
      drain();
    });
  };
}
export const readPdfIsolated = createIsolatedPdfReader();
