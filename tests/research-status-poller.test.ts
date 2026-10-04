import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ResearchStatusPoller,
  researchStatusErrorText,
  retryableResearchStatusError,
  type ResearchPollingEnvironment,
} from '../src/research-status-poller';
import { RequestError } from '../src/api';

async function flush() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}
function environment() {
  let visible = true,
    online = true,
    wake: (() => void) | null = null;
  const pending = new Map<number, { work: () => void; delay: number }>();
  let id = 0;
  const adapter: ResearchPollingEnvironment = {
    available: () => visible && online,
    subscribe: (next) => {
      wake = next;
      return () => {
        wake = null;
      };
    },
    schedule: (work, delay) => {
      const key = ++id;
      pending.set(key, { work, delay });
      return () => {
        pending.delete(key);
      };
    },
  };
  return {
    adapter,
    pending,
    visible: async (next: boolean) => {
      visible = next;
      wake?.();
      await flush();
    },
    online: async (next: boolean) => {
      online = next;
      wake?.();
      await flush();
    },
    tick: async () => {
      const entry = pending.entries().next().value;
      assert.ok(entry);
      pending.delete(entry[0]);
      entry[1].work();
      await flush();
    },
  };
}
test('temporary status failure reconnects, resumes active polling and stops when the saved job completes', async () => {
  const e = environment();
  let calls = 0;
  const poller = new ResearchStatusPoller(
    async () => {
      calls++;
      if (calls <= 2) throw new TypeError('Failed to fetch');
      return calls === 3;
    },
    1500,
    e.adapter
  );
  poller.start();
  await flush();
  assert.equal(calls, 1);
  assert.equal([...e.pending.values()][0]!.delay, 1500);
  await e.tick();
  assert.equal(calls, 2);
  assert.equal([...e.pending.values()][0]!.delay, 3000);
  await e.tick();
  assert.equal(calls, 3);
  assert.equal([...e.pending.values()][0]!.delay, 1500);
  await e.tick();
  assert.equal(calls, 4);
  assert.equal(e.pending.size, 0);
  poller.stop();
});
test('hidden and offline subscriptions perform no reads; return to foreground reads once without duplicate requests', async () => {
  const e = environment();
  let calls = 0;
  const poller = new ResearchStatusPoller(
    async () => {
      calls++;
      return true;
    },
    2500,
    e.adapter
  );
  await e.visible(false);
  poller.start();
  await flush();
  assert.equal(calls, 0);
  assert.equal(e.pending.size, 0);
  await e.visible(true);
  assert.equal(calls, 1);
  assert.equal(e.pending.size, 1);
  await e.visible(false);
  assert.equal(e.pending.size, 0);
  await e.online(false);
  await e.visible(true);
  assert.equal(calls, 1);
  await e.online(true);
  assert.equal(calls, 2);
  assert.equal(e.pending.size, 1);
  poller.stop();
  await e.visible(false);
  await e.visible(true);
  assert.equal(calls, 2);
  assert.equal(e.pending.size, 0);
});
test('an in-flight read finishes once while hidden and wake events coalesce without parallel reads', async () => {
  const e = environment();
  let calls = 0;
  let resolve!: (active: boolean) => void;
  const poller = new ResearchStatusPoller(
    async () => {
      calls++;
      return new Promise<boolean>((done) => {
        resolve = done;
      });
    },
    1500,
    e.adapter
  );
  poller.start();
  await flush();
  await e.visible(false);
  await e.visible(true);
  await e.online(true);
  assert.equal(calls, 1);
  resolve(true);
  await flush();
  assert.equal(calls, 2);
  await e.visible(false);
  resolve(true);
  await flush();
  assert.equal(e.pending.size, 0);
  poller.stop();
});
test('retry budget and authorization failures stop automatic work; manual retry can read again', async () => {
  const e = environment();
  let calls = 0;
  let denied = false;
  const poller = new ResearchStatusPoller(
    async () => {
      calls++;
      throw new RequestError('Unavailable', 'fixture', denied ? 401 : 503);
    },
    1500,
    e.adapter
  );
  poller.start();
  await flush();
  for (let index = 0; index < 3; index++) await e.tick();
  assert.equal(calls, 4);
  assert.equal(e.pending.size, 0);
  await e.visible(false);
  await e.visible(true);
  assert.equal(calls, 4);
  denied = true;
  await poller.request();
  await flush();
  assert.equal(calls, 5);
  assert.equal(e.pending.size, 0);
  await e.online(true);
  assert.equal(calls, 5);
  poller.stop();
});
test('only recognized read transport errors retry, excluding rate limits, parse errors and aborts', () => {
  for (const status of [408, 500, 502, 503, 504])
    assert.equal(retryableResearchStatusError(new RequestError('error', 'code', status)), true);
  for (const error of [
    new RequestError('error', 'code', 401),
    new RequestError('missing', 'code', 404),
    new RequestError('limited', 'code', 429),
    new SyntaxError('invalid JSON'),
    new TypeError('undefined field'),
    new DOMException('cancelled', 'AbortError'),
    Object.assign(new TypeError('Failed to fetch'), { name: 'AbortError' }),
  ])
    assert.equal(retryableResearchStatusError(error), false);
  assert.equal(retryableResearchStatusError(new DOMException('deadline', 'TimeoutError')), true);
  const timeout = new DOMException('deadline', 'TimeoutError');
  assert.equal(researchStatusErrorText(timeout, 'zh-Hans'), '读取研究状态超时，请重试。');
  assert.equal(
    researchStatusErrorText(timeout, 'en'),
    'Reading research status timed out. Please retry.'
  );
});

test('unmounting before the read starts does not launch a request', async () => {
  const e = environment();
  let calls = 0;
  const poller = new ResearchStatusPoller(
    async () => {
      calls++;
      return true;
    },
    1500,
    e.adapter
  );
  poller.start();
  poller.stop();
  await flush();
  assert.equal(calls, 0);
  assert.equal(e.pending.size, 0);
});
