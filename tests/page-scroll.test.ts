import assert from 'node:assert/strict';
import test from 'node:test';
import {
  commitPageEntry,
  pageScrollState,
  ensurePageEntry,
  newPageEntryState,
  readPageScroll,
  restorePageScroll,
  storedPageScroll,
  trackPageScroll,
  type PageScroll,
} from '../src/page-scroll.js';
import { writeBrowserRoute } from '../src/routing.js';

function browser(t: test.TestContext) {
  const cleanups: (() => void)[] = [];
  t.after(() => cleanups.forEach((cleanup) => cleanup()));
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  const calls: PageScroll[] = [];
  const root = { scrollHeight: 800 };
  const events = Object.assign(new EventTarget(), {
    scrollTo: (point: { left: number; top: number }) => {
      calls.push({ x: point.left, y: point.top });
    },
  });
  const observers: { callback: () => void; disconnected: boolean }[] = [];
  class Observer {
    disconnected = false;
    constructor(public callback: () => void) {
      observers.push(this);
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  }
  const address = new URL('https://prispect.com/docs/methodology');
  const entries: { state: unknown; url: string }[] = [];
  const history = {
    state: { unrelated: 'preserved' } as unknown,
    replaceState(state: unknown, _title: string, url?: string) {
      this.state = state;
      if (url) address.href = new URL(url, address).href;
    },
    pushState(state: unknown, _title: string, url: string) {
      entries.push({ state: this.state, url: address.href });
      this.replaceState(state, '', url);
    },
  };
  const globals: Record<string, unknown> = {
    window: events,
    history,
    location: address,
    document: { documentElement: root, body: {} },
    innerHeight: 600,
    scrollX: 0,
    scrollY: 900,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++sequence, callback);
      return sequence;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    ResizeObserver: Observer,
    MutationObserver: Observer,
  };
  for (const [name, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const paint = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  };
  commitPageEntry(ensurePageEntry());
  return { events, history, address, entries, calls, root, observers, paint, cleanups };
}

test('history coordinates reject invalid states and preserve unrelated metadata immutably', () => {
  const before = { unrelated: { stable: true } };
  const saved = pageScrollState(before, { x: 0, y: 900 });
  assert.deepEqual(storedPageScroll(saved), { x: 0, y: 900 });
  assert.deepEqual(before, { unrelated: { stable: true } });
  assert.equal(saved.unrelated, before.unrelated);
  assert.deepEqual(pageScrollState(saved, null), before);
  for (const invalid of [
    null,
    '900',
    { x: 0 },
    { x: 0, y: -1 },
    { x: NaN, y: 900 },
    { x: 0, y: Infinity },
  ])
    assert.equal(storedPageScroll({ prispectScrollPosition: invalid }), null);
  assert.equal(storedPageScroll(Object.create(saved)), null);
});

test('navigation saves the outgoing entry without lending its position to the new entry', (t) => {
  const app = browser(t);
  assert.equal(writeBrowserRoute('/docs'), true);
  assert.deepEqual(storedPageScroll(app.entries[0]!.state), { x: 0, y: 900 });
  assert.equal(storedPageScroll(app.history.state), null);
  assert.equal((app.history.state as Record<string, unknown>).unrelated, 'preserved');
  assert.equal(app.address.pathname, '/docs');
  const state = app.history.state;
  assert.equal(writeBrowserRoute('/api/private'), false);
  assert.equal(app.history.state, state);
  assert.equal(app.entries.length, 1);
});

test('scroll tracking retains separate entry positions without repeatedly writing history', (t) => {
  const app = browser(t);
  ensurePageEntry();
  const writes = t.mock.method(app.history, 'replaceState');
  const stop = trackPageScroll(() => true);
  app.cleanups.push(stop);
  app.events.dispatchEvent(new Event('scroll'));
  app.paint();
  const first = app.history.state;
  assert.deepEqual(readPageScroll(first), { x: 0, y: 900 });
  assert.equal(storedPageScroll(first), null);
  app.history.state = newPageEntryState(first);
  globalThis.scrollY = 260;
  app.events.dispatchEvent(new Event('scroll'));
  app.paint();
  assert.deepEqual(readPageScroll(app.history.state), { x: 0, y: 260 });
  assert.deepEqual(readPageScroll(first), { x: 0, y: 900 });
  assert.equal(writes.mock.callCount(), 0);
});

test('rapid navigation never records the outgoing page as an uncommitted destination', (t) => {
  const app = browser(t);
  writeBrowserRoute('/docs');
  // The original article is still visible while the new module is pending.
  writeBrowserRoute('/account');
  assert.deepEqual(storedPageScroll(app.entries[0]!.state), { x: 0, y: 900 });
  assert.deepEqual(storedPageScroll(app.entries[1]!.state), { x: 0, y: 0 });
});

test('coordinate memory is bounded and ignores outgoing content during a pending route', (t) => {
  const app = browser(t);
  let current = true;
  const stop = trackPageScroll(() => current);
  app.cleanups.push(stop);
  const first = newPageEntryState(null);
  app.history.state = first;
  current = false;
  app.events.dispatchEvent(new Event('scroll'));
  app.paint();
  assert.equal(readPageScroll(first), null);
  current = true;
  for (let i = 0; i < 101; i++) {
    app.history.state = i === 0 ? first : newPageEntryState(null);
    app.events.dispatchEvent(new Event('scroll'));
    app.paint();
  }
  assert.equal(readPageScroll(first), null);
  assert.deepEqual(readPageScroll(app.history.state), { x: 0, y: 900 });
});

test('history restoration waits for content and stops after returning to the reading position', (t) => {
  const app = browser(t);
  let finished = 0;
  const stop = restorePageScroll({ x: 0, y: 900 }, () => finished++);
  app.cleanups.push(stop);
  app.paint();
  assert.deepEqual(app.calls, []);
  app.root.scrollHeight = 2000;
  app.observers[0]!.callback();
  app.paint();
  assert.deepEqual(app.calls, [{ x: 0, y: 900 }]);
  assert.equal(finished, 0);
  app.paint();
  app.paint();
  assert.equal(finished, 1);
  assert.ok(app.observers.every((observer) => observer.disconnected));
  const completedCalls = app.calls.length;
  app.observers[1]!.callback();
  app.paint();
  assert.equal(app.calls.length, completedCalls);
});

test('history restoration survives a delayed reading-index layout shift before releasing observers', (t) => {
  const app = browser(t);
  app.root.scrollHeight = 2000;
  let finished = 0;
  const stop = restorePageScroll({ x: 0, y: 900 }, () => finished++);
  app.cleanups.push(stop);
  app.paint();
  app.paint();
  assert.equal(finished, 0);
  app.root.scrollHeight += 61;
  app.observers[0]!.callback();
  app.paint();
  assert.equal(finished, 0);
  app.paint();
  app.paint();
  assert.equal(finished, 1);
  assert.deepEqual(app.calls.at(-1), { x: 0, y: 900 });
  assert.ok(app.observers.every((observer) => observer.disconnected));
});

test('user scrolling wins over delayed restoration and late content cannot pull the page back', (t) => {
  const app = browser(t);
  let finished = 0;
  const stop = restorePageScroll({ x: 0, y: 900 }, () => finished++);
  app.cleanups.push(stop);
  app.events.dispatchEvent(new Event('wheel'));
  app.root.scrollHeight = 2000;
  app.observers[0]!.callback();
  app.paint();
  assert.deepEqual(app.calls, []);
  assert.equal(finished, 1);
});

test('abandoned navigation disconnects restoration before a late response', (t) => {
  const app = browser(t);
  const stop = restorePageScroll({ x: 0, y: 900 }, () => {});
  stop();
  stop();
  app.root.scrollHeight = 2000;
  app.observers[1]!.callback();
  app.paint();
  assert.deepEqual(app.calls, []);
  assert.ok(app.observers.every((observer) => observer.disconnected));
});

test('shorter or missing content bounds the wait and releases its observers', (t) => {
  const app = browser(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finished = 0;
  const stop = restorePageScroll({ x: 0, y: 900 }, () => finished++);
  app.cleanups.push(stop);
  app.paint();
  assert.deepEqual(app.calls, []);
  t.mock.timers.tick(4000);
  assert.deepEqual(app.calls, [{ x: 0, y: 900 }]);
  assert.equal(finished, 1);
  assert.ok(app.observers.every((observer) => observer.disconnected));
});
