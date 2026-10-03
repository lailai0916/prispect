import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyQuestionAnswer } from '../shared/company-workspace.js';
import {
  OwnerAnswerCache,
  ownerAnswerCacheKey,
  bypassOwnerAnswerCache,
} from '../server/owner-answer-cache.js';

const answer: CompanyQuestionAnswer = {
  question: '现金和利润有什么差异？',
  text: '已保存公开资料中的现金和利润存在差异，需要核对回款。',
  citations: [{ label: '来源', url: 'https://www.cninfo.com.cn/' }],
  mode: 'model',
  createdAt: '2026-10-03T01:00:00.000Z',
  snapshotFetchedAt: '2026-10-02T02:00:00.000Z',
};

test('owner answer cache retains provenance, separates owners and clones both reads and writes', () => {
  const cache = new OwnerAnswerCache<CompanyQuestionAnswer>();
  const scope = {};
  const value = structuredClone(answer);
  assert.equal(cache.set('owner-a', 'key', value, scope), true);
  value.text = 'later mutation';
  const hit = cache.get('owner-a', 'key', scope)!;
  assert.equal(hit.text, answer.text);
  assert.equal(hit.createdAt, answer.createdAt);
  assert.equal(hit.snapshotFetchedAt, answer.snapshotFetchedAt);
  assert.equal(hit.cached, true);
  assert.equal(cache.get('owner-b', 'key', scope), undefined);
  assert.equal(cache.get('owner-a', 'key', {}), undefined);
  hit.text = 'mutated copy';
  assert.equal(cache.get('owner-a', 'key', scope)?.text, answer.text);
});

test('provider fallbacks and invalid or oversized answers do not suppress the next attempt', () => {
  const cache = new OwnerAnswerCache<CompanyQuestionAnswer>();
  for (const value of [
    { ...answer, question: undefined } as unknown as CompanyQuestionAnswer,
    { ...answer, text: undefined } as unknown as CompanyQuestionAnswer,
    { ...answer, citations: [null] } as unknown as CompanyQuestionAnswer,
    { ...answer, mode: 'rules-fallback' as const, warning: 'Failed provider' },
    { ...answer, text: '' },
    { ...answer, createdAt: 'invalid' },
    { ...answer, snapshotFetchedAt: 'invalid' },
    { ...answer, citations: [{ label: 'invalid', url: '' }] },
    { ...answer, text: 'x'.repeat(70_000) },
  ]) {
    assert.equal(cache.set('owner', 'key', value), false);
    assert.equal(cache.get('owner', 'key'), undefined);
  }
});

test('ten-minute expiry uses the original expiry rather than extending on each read', () => {
  let now = 0;
  const cache = new OwnerAnswerCache<CompanyQuestionAnswer>({ now: () => now });
  cache.set('owner', 'key', answer);
  now = 599_999;
  assert.ok(cache.get('owner', 'key'));
  now = 600_000;
  assert.equal(cache.get('owner', 'key'), undefined);
});

test('per-owner and global memory bounds evict old entries while keeping other owners separate', () => {
  const cache = new OwnerAnswerCache<CompanyQuestionAnswer>({
    maxEntries: 3,
    maxOwnerEntries: 2,
  });
  for (const key of ['a', 'b', 'c']) cache.set('one', key, answer);
  assert.equal(cache.get('one', 'a'), undefined);
  assert.ok(cache.get('one', 'b'));
  cache.set('two', 'd', answer);
  cache.set('two', 'e', answer);
  assert.equal(cache.get('one', 'c'), undefined);
  assert.ok(cache.get('one', 'b'));
  cache.clearOwner('two');
  assert.equal(cache.get('two', 'd'), undefined);
  assert.ok(cache.get('one', 'b'));
  const bytes = Buffer.byteLength(JSON.stringify(answer));
  const byteBound = new OwnerAnswerCache<CompanyQuestionAnswer>({ maxBytes: bytes * 2 });
  for (const key of ['a', 'b', 'c']) byteBound.set('one', key, answer);
  assert.equal(byteBound.get('one', 'a'), undefined);
  assert.ok(byteBound.get('one', 'b'));
  assert.ok(byteBound.get('one', 'c'));
});

test('cache identities bind owner, public facts, full conversation, model, docs and prompt version', () => {
  const base = {
    owner: 'one',
    namespace: 'assistant-company' as const,
    question: answer.question,
    locale: 'zh' as const,
    basis: 'consolidated' as const,
    previousQuestions: ['上一条问题'],
    publicBasis: { runId: 'run-1', year: 2025, amount: '100.00' },
    model: { apiKey: 'private-secret', model: 'first-model' },
    documents: { privacyVersion: '1.2', body: '实际原文' },
  };
  const key = ownerAnswerCacheKey(base);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key.includes('private-secret'), false);
  for (const change of [
    { owner: 'two' },
    { namespace: 'company-question' as const },
    { question: `${answer.question}补充` },
    { locale: 'en' as const },
    { basis: 'parent' as const },
    { previousQuestions: ['另一条问题'] },
    { publicBasis: { ...base.publicBasis, amount: '200.00' } },
    { publicBasis: { ...base.publicBasis, year: 2024 } },
    { model: { apiKey: 'private-secret', model: 'second-model' } },
    { model: { ...base.model, baseUrl: 'https://another-model.invalid/v1' } },
    { model: { model: 'first-model' } },
    { documents: { privacyVersion: '1.3', body: '实际原文' } },
    { documents: { privacyVersion: '1.2', body: '更新原文' } },
    { promptVersion: 'next-financial-validation-version' },
  ])
    assert.notEqual(ownerAnswerCacheKey({ ...base, ...change }), key);
});

test('fresh or deeper lookup text bypasses answer reuse without inventing a research call', () => {
  for (const question of [
    '请重新回答',
    '补查资料',
    '再搜索新闻',
    '最新现金资料',
    '近期有什么公告',
    'research the company',
    'latest news',
    'look up again',
  ])
    assert.equal(bypassOwnerAnswerCache(question), true, question);
  assert.equal(bypassOwnerAnswerCache('现金与利润为什么不同？'), false);
  assert.equal(bypassOwnerAnswerCache('现金与利润为什么不同？', true), true);
});

test('refresh invalidates old answers and fences older requests even after fresh publication finishes', () => {
  const cache = new OwnerAnswerCache<CompanyQuestionAnswer>();
  const scope = {};
  cache.set('owner', 'key', answer, scope);
  const oldRequest = cache.reserve('owner', 'key');
  cache.invalidate('owner', 'key', scope);
  assert.equal(cache.get('owner', 'key', scope), undefined);
  const freshRequest = cache.reserve('owner', 'key');
  const fresh = { ...answer, text: 'New validated source-bound answer' };
  assert.equal(cache.set('owner', 'key', fresh, scope, freshRequest), true);
  cache.release(freshRequest);
  assert.equal(cache.set('owner', 'key', answer, scope, oldRequest), false);
  cache.release(oldRequest);
  assert.equal(cache.get('owner', 'key', scope)?.text, fresh.text);
});

test('failed refresh removes the previous memo and retries remain possible', () => {
  const cache = new OwnerAnswerCache<CompanyQuestionAnswer>();
  cache.set('owner', 'key', answer);
  cache.invalidate('owner', 'key');
  const attempt = cache.reserve('owner', 'key');
  assert.equal(
    cache.set('owner', 'key', { ...answer, mode: 'rules-fallback' }, undefined, attempt),
    false
  );
  cache.release(attempt);
  assert.equal(cache.get('owner', 'key'), undefined);
});
