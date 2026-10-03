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

test('known native browser fetch failures receive a clear localized message', () => {
  for (const message of [
    'Failed to fetch',
    'Load failed',
    'NetworkError when attempting to fetch resource.',
  ]) {
    const error = new TypeError(message);
    assert.equal(requestErrorText(error, 'zh-Hans'), '网络请求未完成，请检查网络连接后重试。');
    assert.equal(
      requestErrorText(error, 'en'),
      'The network request did not complete. Check your connection and try again.'
    );
  }
});

test('network copy does not hide programming errors, asset failures or cancellation', () => {
  const errors = [
    new TypeError("Cannot read properties of undefined (reading 'id')"),
    new TypeError('Failed to fetch dynamically imported module: /assets/page.js'),
    new TypeError('Load failed while rendering the report'),
    new Error('Failed to fetch'),
    new DOMException('Failed to fetch', 'AbortError'),
    new DOMException('Load failed', 'TimeoutError'),
    Object.assign(new TypeError('Failed to fetch'), { name: 'AbortError' }),
  ];
  for (const error of errors)
    for (const locale of ['zh-Hans', 'en'])
      assert.equal(requestErrorText(error, locale), error.message);
});

test('server error codes and source-failure explanations remain distinct from browser network failures', () => {
  const sourceError = new RequestError(
    '公开来源未响应，已保留现有资料。',
    'COMPANY_SOURCE_UNAVAILABLE'
  );
  assert.equal(requestErrorText(sourceError, 'zh-Hans'), sourceError.message);
  assert.equal(
    requestErrorText(sourceError, 'en'),
    'The official source did not respond after retry. Retry later or import the original yourself.'
  );
  const serverError = new RequestError('Failed to fetch', 'CUSTOM_UPSTREAM_FAILURE');
  assert.equal(requestErrorText(serverError, 'zh-Hans'), 'Failed to fetch');
  assert.equal(requestErrorText(serverError, 'en'), 'Failed to fetch');
});

test('formatting a fetch failure does not retry or change the request error', async (t) => {
  const failure = new TypeError('Failed to fetch');
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw failure;
  });
  await assert.rejects(api('/company-search?query=test'), (error: unknown) => {
    assert.equal(error, failure);
    assert.equal(
      requestErrorText(error, 'en'),
      'The network request did not complete. Check your connection and try again.'
    );
    return true;
  });
  assert.equal(fetch.mock.callCount(), 1);
});
