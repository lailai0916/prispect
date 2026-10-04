import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import type { CompanyResearchRun } from '../shared/contracts.js';
import type { CompanyContextSnapshot } from '../shared/company-workspace.js';
import { AppContext, type AppContextValue } from '../src/context.js';

// Isolated saved-record rendering only; no production, retrieval or model calls.
const cssHook = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: 'export {};', shortCircuit: true };
    return nextLoad(url, context);
  },
});
let components: typeof import('../src/showcase/LiteCompanySignals.js');
try {
  components = await import('../src/showcase/LiteCompanySignals.js');
} finally {
  cssHook.deregister();
}

function fixture(): CompanyResearchRun {
  const context: CompanyContextSnapshot = {
    version: 1,
    securityCode: '300893',
    orgId: 'synthetic-signals-org',
    companyName: 'Synthetic signals issuer',
    fetchedAt: '2026-10-04T00:00:00Z',
    status: 'partial',
    financials: [],
    sources: [],
    comparisons: [],
    profile: {},
    shareholders: [],
    announcements: Array.from({ length: 4 }, (_, index) => ({
      id: `saved-disclosure-${index}`,
      title: `Saved disclosure ${index}`,
      date: index === 0 ? '' : '2026-09-30',
      url: `https://example.invalid/disclosure/${index}`,
      sources: [
        {
          provider: 'Saved disclosure provider',
          url: `https://example.invalid/disclosure/${index}`,
        },
      ],
      category: 'Saved category',
      attention: 'routine',
      matched: '',
      meaning: 'Saved reading prompt',
      nextQuestion: 'Saved next check',
      excerpt:
        index === 0
          ? {
              quote: 'Exact stored announcement excerpt',
              page: 7,
              url: `https://example.invalid/disclosure/${index}`,
              sha256: 'synthetic-hash',
              pagesRead: 3,
            }
          : undefined,
    })),
    news: [
      {
        title: 'Saved media headline',
        date: '2026-10-01',
        media: 'Saved media',
        provider: 'Saved provider',
        url: 'https://example.invalid/news/one',
        digest: 'Exact saved digest',
        contentScope: 'digest',
      },
    ],
    discussions: [
      {
        id: 'saved-post',
        securityCode: '300893',
        title: 'Saved public opinion',
        date: '2026-10-02',
        url: 'https://example.invalid/post/one',
        provider: 'Saved public platform',
        textScope: 'post-excerpt',
        excerpt: {
          text: 'Exact stored opinion excerpt',
          url: 'https://example.invalid/post/one',
          sha256: 'synthetic-hash',
          readAt: '2026-10-03T00:00:00Z',
        },
      },
      {
        id: 'foreign-post',
        securityCode: '600519',
        title: 'Foreign issuer opinion must not leak',
        date: '2026-10-02',
        url: 'https://example.invalid/post/foreign',
        provider: 'Foreign platform',
        textScope: 'title',
      },
    ],
    verificationLinks: [],
    warnings: [],
  };
  return {
    id: 'synthetic-signals-owning-run',
    input: { securityCode: context.securityCode, orgId: context.orgId, year: 2025 },
    createdAt: context.fetchedAt,
    updatedAt: context.fetchedAt,
    status: 'ready',
    trace: [],
    context,
    model: { requested: false, status: 'not-requested' },
    announcements: [
      {
        id: 'duplicate-original',
        title: 'Duplicate source title',
        publishedAt: '2026-09-30',
        sourceUrl: 'https://example.invalid/disclosure/0#page=1',
        category: 'recent',
      },
      {
        id: 'wrong-annual-year',
        title: 'Wrong annual year must not leak',
        publishedAt: '2025-04-01',
        sourceUrl: 'https://example.invalid/annual/2024',
        category: 'annual',
        reportYear: 2024,
      },
    ],
  };
}

function render(run: CompanyResearchRun, kind: 'public' | 'reputation') {
  const value: AppContextValue = {
    locale: 'en',
    t: (_zh, en) => en,
    workspace: null,
    cases: [],
    user: null,
    registrationEnabled: true,
    refresh: async () => {},
    navigate: () => {},
    execute: async (action) => action(),
    confirm: () => {},
    showEvidence: () => {},
    busy: false,
  };
  return load(
    renderToStaticMarkup(
      createElement(
        AppContext.Provider,
        { value },
        createElement(
          kind === 'public' ? components.LiteCompanyPublicItems : components.LiteCompanyReputation,
          { run }
        )
      )
    )
  );
}

test('public items preserve recent publication dates without a financial row, deduplicate originals and fold after three', () => {
  const run = fixture();
  const before = structuredClone(run);
  const $ = render(run, 'public');
  assert.equal($('.lite-company-signals > .lite-company-signal-list > li').length, 3);
  assert.equal($('.lite-company-signals-more > .lite-company-signal-list > li').length, 1);
  assert.equal($('.lite-company-signals-more').attr('open'), undefined);
  assert.equal($('[data-signal-kind="announcement"]').length, 4);
  assert.equal($('.lite-company-signal-detail[open]').length, 0);
  assert.match($('body').text(), /Exact stored announcement excerpt/);
  assert.match($('body').text(), /Original page 7/);
  assert.match($('body').text(), /Date unavailable/);
  assert.match($('body').text(), /2026-09-30/);
  assert.doesNotMatch($('body').text(), /Duplicate source title|Wrong annual year must not leak/);
  assert.deepEqual(run, before);
});

test('reputation keeps saved digests and unverified opinions distinct and rejects other-issuer discussion rows', () => {
  const $ = render(fixture(), 'reputation');
  assert.equal($('[data-signal-kind="news"]').length, 1);
  assert.equal($('[data-signal-kind="discussion"]').length, 1);
  assert.match($('body').text(), /Exact saved digest/);
  assert.match($('body').text(), /Exact stored opinion excerpt/);
  assert.match($('body').text(), /Unverified public opinion/);
  assert.match($('body').text(), /article body has not been retrieved/);
  assert.doesNotMatch($('body').text(), /Foreign issuer opinion must not leak/);
  assert.equal($('.signal-question-cloud > span').length, 3);
});

test('issuer and annual-scope mismatches withhold all saved rows and unsafe URLs never become links or readable excerpts', () => {
  for (const mutation of [
    (run: CompanyResearchRun) => {
      run.context!.securityCode = '600519';
    },
    (run: CompanyResearchRun) => {
      run.context!.orgId = 'foreign-org';
    },
    (run: CompanyResearchRun) => {
      run.input.year = 2025.5;
    },
  ]) {
    const run = fixture();
    mutation(run);
    for (const kind of ['public', 'reputation'] as const) {
      const $ = render(run, kind);
      assert.equal($('[data-signal-kind]').length, 0);
      assert.match($('[role="status"]').text(), /records are withheld/);
      assert.equal($('a[href]').length, 0);
    }
  }
  const run = fixture();
  const row = run.context!.announcements[0]!;
  row.url = 'javascript:alert(1)';
  row.sources = [];
  row.excerpt!.url = 'https://name:secret@example.invalid/unsafe';
  run.announcements = [];
  const $ = render(run, 'public');
  assert.equal($('a[href^="javascript:"]').length, 0);
  assert.equal($('a[href*="secret"]').length, 0);
  assert.doesNotMatch($('body').text(), /Exact stored announcement excerpt/);
  assert.match($('body').text(), /source link was not retrieved/);
});
