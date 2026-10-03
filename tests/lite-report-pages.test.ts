import assert from 'node:assert/strict';
import test from 'node:test';
import {
  litePageForAnchor,
  liteReadingBasis,
  liteReportPageHref,
  liteReportPages,
  resolveLiteReportPage,
} from '../src/showcase/lite-report-pages.js';

test('Lite report pages resolve refresh URLs and all legacy chapter bookmarks', () => {
  for (const page of liteReportPages) {
    assert.equal(resolveLiteReportPage(new URLSearchParams({ page: page.id })), page.id);
    assert.equal(litePageForAnchor(`#${page.anchor}`), page.id);
    assert.equal(
      resolveLiteReportPage(new URLSearchParams({ page: 'overview' }), `#${page.anchor}`),
      page.id
    );
  }
  for (const value of ['', 'unknown', '//example.invalid', '<script>']) {
    assert.equal(resolveLiteReportPage(new URLSearchParams({ page: value })), 'overview');
  }
  assert.equal(litePageForAnchor('#company-financial-data'), null);
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

test('a source deep link explicitly carries its claim, source and saved generation only to evidence', () => {
  const original = new URLSearchParams({ run: 'same-owning-run', experience: 'lite' });
  const selection = {
    basis: 'parent' as const,
    claim: 'risk:cash & profit',
    source: 'source:annual/2025',
    generation: '2026-10-03T00:03:00.000Z',
  };
  const url = new URL(liteReportPageHref(original, 'sources', selection), 'https://prispect.com');
  for (const [key, value] of Object.entries(selection))
    assert.equal(url.searchParams.get(key), value);
  assert.equal(url.searchParams.get('run'), 'same-owning-run');
  assert.equal(url.searchParams.get('page'), 'sources');
  const overview = new URL(liteReportPageHref(original, 'overview', selection), url.origin);
  for (const key of ['claim', 'source', 'generation'])
    assert.equal(overview.searchParams.has(key), false);
});

test('reading basis defaults honestly and survives direct navigation', () => {
  assert.equal(liteReadingBasis(new URLSearchParams()), 'consolidated');
  assert.equal(liteReadingBasis(new URLSearchParams({ basis: 'parent' })), 'parent');
  assert.equal(liteReadingBasis(new URLSearchParams({ basis: 'invented' })), 'consolidated');
});
