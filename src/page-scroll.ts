export type PageScroll = { x: number; y: number };
const stateKey = 'prispectScrollPosition';
const entryKey = 'prispectPageEntry';
const positions = new Map<string, PageScroll>();
let committedEntry: string | null = null;

export function commitPageEntry(id: string) {
  committedEntry = id;
}

export function pageEntryId(state: unknown): string | null {
  if (!state || typeof state !== 'object' || !Object.hasOwn(state, entryKey)) return null;
  const id = (state as Record<string, unknown>)[entryKey];
  return typeof id === 'string' && id.length > 0 && id.length <= 80 ? id : null;
}

export function readPageScroll(state: unknown): PageScroll | null {
  const id = pageEntryId(state);
  return (id && positions.get(id)) || storedPageScroll(state);
}

function cachePosition(id: string, point: PageScroll) {
  positions.delete(id);
  positions.set(id, point);
  if (positions.size > 100) positions.delete(positions.keys().next().value!);
}

export function storedPageScroll(state: unknown): PageScroll | null {
  if (!state || typeof state !== 'object' || !Object.hasOwn(state, stateKey)) return null;
  const point = (state as Record<string, unknown>)[stateKey] as Partial<PageScroll> | null;
  return point &&
    typeof point.x === 'number' &&
    typeof point.y === 'number' &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.y >= 0
    ? { x: point.x, y: point.y }
    : null;
}

/** Preserve unrelated router state; only coordinates belong in history, never page data. */
export function pageScrollState(state: unknown, point: PageScroll | null) {
  const next = state && typeof state === 'object' ? { ...state } : {};
  const result = next as Record<string, unknown>;
  delete result[stateKey];
  if (point) result[stateKey] = point;
  return result;
}

export function rememberPageScroll() {
  const id = ensurePageEntry();
  const point =
    id === committedEntry
      ? { x: Math.max(0, scrollX), y: Math.max(0, scrollY) }
      : readPageScroll(history.state) || { x: 0, y: 0 };
  cachePosition(id, point);
  history.replaceState(pageScrollState(history.state, point), '');
}

export function newPageEntryState(state: unknown) {
  return { ...pageScrollState(state, null), [entryKey]: crypto.randomUUID() };
}

export function ensurePageEntry() {
  const existing = pageEntryId(history.state);
  if (existing) return existing;
  const state = {
    ...pageScrollState(history.state, storedPageScroll(history.state)),
    [entryKey]: crypto.randomUUID(),
  };
  history.replaceState(state, '');
  return state[entryKey];
}

export function trackPageScroll(canRemember: () => boolean) {
  let frame = 0;
  const save = () => {
    frame = 0;
    const id = pageEntryId(history.state);
    // Scroll events update bounded memory, not history at animation-frame frequency.
    if (id && canRemember())
      cachePosition(id, { x: Math.max(0, scrollX), y: Math.max(0, scrollY) });
  };
  const persist = () => {
    if (canRemember()) rememberPageScroll();
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(save);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('pagehide', persist);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('pagehide', persist);
  };
}

/** Wait for real content rather than restoring onto a short loading page. User input wins. */
export function restorePageScroll(point: PageScroll, finished: () => void) {
  let stopped = false;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout>;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    resize.disconnect();
    mutation.disconnect();
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchstart', stop);
    window.removeEventListener('pointerdown', stop);
    window.removeEventListener('keydown', onKey);
    finished();
  };
  const onKey = (event: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key))
      stop();
  };
  const restore = (limit = false) => {
    frame = 0;
    if (stopped) return;
    const root = document.documentElement;
    if (!limit && root.scrollHeight - innerHeight + 1 < point.y) return;
    window.scrollTo({ left: point.x, top: point.y, behavior: 'instant' });
    stop();
  };
  const schedule = () => {
    if (!stopped && !frame) frame = requestAnimationFrame(() => restore());
  };
  const resize = new ResizeObserver(schedule);
  const mutation = new MutationObserver(schedule);
  resize.observe(document.body);
  mutation.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchstart', stop, { passive: true });
  window.addEventListener('pointerdown', stop, { passive: true });
  window.addEventListener('keydown', onKey);
  // Missing/shorter content must not leave an observer waiting indefinitely.
  timer = setTimeout(() => restore(true), 4000);
  schedule();
  return stop;
}
