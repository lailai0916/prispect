import assert from 'node:assert/strict';
import test from 'node:test';
import {
  litePageForAnchor,
  liteReadingBasis,
  liteReportPageHref,
  liteReportPages,
  resolveLiteReportPage,
} from '../src/showcase/lite-report-pages.js';

test('Lite has the approved financial, public, reputation and original channels with refresh-safe URLs', () => {
  assert.deepEqual(
    liteReportPages.map((page) => page.id),
    ['finance', 'public', 'reputation', 'original']
  );
  for (const page of liteReportPages) {
    assert.equal(resolveLiteReportPage(new URLSearchParams({ page: page.id })), page.id);
    assert.equal(litePageForAnchor(`#${page.anchor}`), page.id);
    assert.equal(
      resolveLiteReportPage(new URLSearchParams({ page: 'finance' }), `#${page.anchor}`),
      page.id
    );
  }
  for (const value of ['', 'unknown', '//example.invalid', '<script>']) {
    assert.equal(resolveLiteReportPage(new URLSearchParams({ page: value })), 'finance');
  }
  assert.equal(litePageForAnchor('#company-financial-data'), null);
});

test('legacy report pages and chapter bookmarks resolve to their actual topical channel', () => {
  const legacy = [
    ['overview', '#lite-judgment', 'finance'],
    ['numbers', '#lite-numbers', 'finance'],
    ['sources', '#lite-sources', 'original'],
    ['questions', '#lite-questions', 'reputation'],
  ] as const;
  for (const [page, hash, channel] of legacy) {
    assert.equal(resolveLiteReportPage(new URLSearchParams({ page })), channel);
    assert.equal(litePageForAnchor(hash), channel);
    assert.equal(resolveLiteReportPage(new URLSearchParams({ page: 'public' }), hash), channel);
    const url = new URL(
      liteReportPageHref(new URLSearchParams({ run: 'owning-legacy-run', basis: 'parent' }), page),
      'https://prispect.com'
    );
    assert.equal(url.searchParams.get('page'), channel);
    assert.equal(url.searchParams.get('run'), 'owning-legacy-run');
    assert.equal(url.searchParams.get('basis'), 'parent');
  }
});

test('every reading link preserves the owning record and annual options without creating research', () => {
  const original = new URLSearchParams({
    run: 'owning-record / & 零',
    experience: 'pro',
    cached: '1',
    year: '2025',
    basis: 'parent',
    claim: 'previous-claim',
    source: 'previous-source',
    generation: 'previous-generation',
  });
  for (const page of liteReportPages) {
    const path = liteReportPageHref(original, page.id);
    const url = new URL(path, 'https://prispect.com');
    assert.equal(url.pathname, '/company');
    assert.equal(url.searchParams.get('run'), original.get('run'));
    assert.equal(url.searchParams.get('year'), '2025');
    assert.equal(url.searchParams.get('cached'), '1');
    assert.equal(url.searchParams.get('experience'), 'lite');
    assert.equal(url.searchParams.get('page'), page.id);
    assert.equal(url.searchParams.get('basis'), 'parent');
    assert.equal(url.hash, '');
    for (const key of ['claim', 'source', 'generation'])
      assert.equal(url.searchParams.has(key), false);
  }
  assert.equal(original.get('page'), null, 'reading must not mutate its input URL');
  assert.equal(original.get('experience'), 'pro');
});

test('a source deep link carries its claim, source and saved generation only to the original channel', () => {
  const original = new URLSearchParams({ run: 'same-owning-run', experience: 'lite' });
  const selection = {
    basis: 'parent' as const,
    claim: 'risk:cash & profit',
    source: 'source:annual/2025',
    generation: '2026-10-03T00:03:00.000Z',
  };
  for (const page of ['original', 'sources'] as const) {
    const url = new URL(liteReportPageHref(original, page, selection), 'https://prispect.com');
    for (const [key, value] of Object.entries(selection))
      assert.equal(url.searchParams.get(key), value);
    assert.equal(url.searchParams.get('run'), 'same-owning-run');
    assert.equal(url.searchParams.get('page'), 'original');
  }
  for (const page of [
    'finance',
    'public',
    'reputation',
    'overview',
    'numbers',
    'questions',
  ] as const) {
    const url = new URL(liteReportPageHref(original, page, selection), 'https://prispect.com');
    assert.equal(url.searchParams.get('run'), 'same-owning-run');
    assert.equal(url.searchParams.get('basis'), 'parent');
    for (const key of ['claim', 'source', 'generation'])
      assert.equal(url.searchParams.has(key), false);
  }
});

test('reading basis defaults honestly and survives direct navigation', () => {
  assert.equal(liteReadingBasis(new URLSearchParams()), 'consolidated');
  assert.equal(liteReadingBasis(new URLSearchParams({ basis: 'parent' })), 'parent');
  assert.equal(liteReadingBasis(new URLSearchParams({ basis: 'invented' })), 'consolidated');
});
