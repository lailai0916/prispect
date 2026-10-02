import assert from 'node:assert/strict';
import test from 'node:test';
import { api, RequestError, requestErrorText, setCsrfToken } from '../src/api.js';

test('API requests preserve all supported header forms and apply security defaults without duplicates', async (t) => {
  const requests: RequestInit[] = [];
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init: RequestInit) => {
    requests.push(init);
    return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } });
  });
  setCsrfToken('session-token');
  try {
    for (const headers of [
      new Headers({ 'Idempotency-Key': 'company-request' }),
      [['Idempotency-Key', 'company-request']] as [string, string][],
      { 'Idempotency-Key': 'company-request' },
    ]) {
      await api('/company-runs', { method: 'post', body: '{}', headers });
      const actual = new Headers(requests.at(-1)!.headers);
      assert.equal(actual.get('Idempotency-Key'), 'company-request');
      assert.equal(actual.get('Content-Type'), 'application/json');
      assert.equal(actual.get('X-CSRF-Token'), 'session-token');
    }
    await api('/materials', {
      method: 'POST',
      body: '{}',
      headers: new Headers({
        'content-type': 'application/custom+json',
        'x-csrf-token': 'caller-token',
      }),
    });
    const custom = new Headers(requests.at(-1)!.headers);
    assert.equal(custom.get('Content-Type'), 'application/custom+json');
    assert.equal(custom.get('X-CSRF-Token'), 'caller-token');
    await api('/materials/preview', { method: 'POST', body: new FormData() });
    assert.equal(new Headers(requests.at(-1)!.headers).get('Content-Type'), null);
    for (const method of ['get', 'head', 'options']) {
      await api('/health', { method });
      assert.equal(new Headers(requests.at(-1)!.headers).get('X-CSRF-Token'), null);
    }
  } finally {
    setCsrfToken(null);
  }
});

test('API failures retain readable errors when a proxy returns null, invalid JSON or an unexpected shape', async (t) => {
  let payload = 'null';
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(payload, { status: 502, statusText: 'Bad Gateway' })
  );
  for (const value of [
    'null',
    '[]',
    '"upstream unavailable"',
    '<html>Bad gateway</html>',
    '{"error":23,"code":false}',
  ]) {
    payload = value;
    await assert.rejects(api('/workspace'), (error: unknown) => {
      assert.ok(error instanceof RequestError);
      assert.equal(error.message, 'Bad Gateway');
      assert.equal(error.code, 'REQUEST_FAILED');
      return true;
    });
  }
  payload = '{"error":"查询版本已变化","code":"COMPANY_STALE_REVISION"}';
  await assert.rejects(api('/workspace'), (error: unknown) => {
    assert.ok(error instanceof RequestError);
    assert.equal(error.message, '查询版本已变化');
    assert.equal(error.code, 'COMPANY_STALE_REVISION');
    assert.equal(
      requestErrorText(error, 'en'),
      'The retrieval version has changed. Reload before resuming.'
    );
    return true;
  });
});
