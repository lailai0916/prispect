import { RequestError, requestErrorText } from './api';

export function researchStatusErrorText(error: unknown, locale: string): string {
  return requestErrorText(
    error instanceof DOMException && error.name === 'TimeoutError'
      ? new RequestError('读取研究状态超时，请重试。', 'RESEARCH_STATUS_TIMEOUT')
      : error,
    locale
  );
}

export interface ResearchPollingEnvironment {
  available: () => boolean;
  subscribe: (wake: () => void) => () => void;
  schedule: (work: () => void, delay: number) => () => void;
}
const browserEnvironment: ResearchPollingEnvironment = {
  available: () => document.visibilityState !== 'hidden' && navigator.onLine !== false,
  subscribe: (wake) => {
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('offline', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('offline', wake);
    };
  },
  schedule: (work, delay) => {
    const timer = setTimeout(work, delay);
    return () => clearTimeout(timer);
  },
};

export function retryableResearchStatusError(error: unknown): boolean {
  if (error instanceof RequestError) return [408, 500, 502, 503, 504].includes(error.status || 0);
  return (
    (error instanceof DOMException && error.name === 'TimeoutError') ||
    (error instanceof TypeError &&
      error.name === 'TypeError' &&
      [
        'Failed to fetch',
        'Load failed',
        'NetworkError when attempting to fetch resource.',
      ].includes(error.message))
  );
}

/** Only reads saved status. Never retries a source, analysis, upload or cancellation write. */
export class ResearchStatusPoller {
  private stopped = false;
  private exhausted = false;
  private failures = 0;
  private running: Promise<void> | null = null;
  private pendingWake = false;
  private cancelTimer: (() => void) | null = null;
  private unsubscribe: (() => void) | null = null;
  constructor(
    private load: () => Promise<boolean>,
    private interval = 1500,
    private environment: ResearchPollingEnvironment = browserEnvironment
  ) {}
  start() {
    this.unsubscribe = this.environment.subscribe(() => this.wake());
    this.wake();
  }
  async request() {
    this.exhausted = false;
    this.failures = 0;
    this.wake();
    await this.running;
  }
  private wake() {
    this.cancelTimer?.();
    this.cancelTimer = null;
    if (this.stopped || this.exhausted || !this.environment.available()) return;
    if (this.running) {
      this.pendingWake = true;
      return;
    }
    let active = false;
    let delay: number | null = null;
    this.running = Promise.resolve()
      .then(async () => {
        if (this.stopped || !this.environment.available()) return;
        try {
          active = await this.load();
          this.failures = 0;
          if (active) delay = this.interval;
        } catch (error) {
          const retries = [1500, 3000, 6000];
          if (retryableResearchStatusError(error) && this.failures < retries.length)
            delay = retries[this.failures++]!;
          else this.exhausted = true;
        }
      })
      .finally(() => {
        this.running = null;
        if (this.stopped || this.exhausted || !this.environment.available()) {
          this.pendingWake = false;
          return;
        }
        if (this.pendingWake && this.failures === 0) {
          this.pendingWake = false;
          this.wake();
        } else if (delay !== null) {
          this.pendingWake = false;
          this.cancelTimer = this.environment.schedule(() => this.wake(), delay);
        }
      });
  }
  stop() {
    this.stopped = true;
    this.cancelTimer?.();
    this.unsubscribe?.();
    this.pendingWake = false;
  }
}
