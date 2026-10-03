import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { companyPath } from '../shared/company-workspace.js';
import { AppContext, type AppContextValue } from '../src/context.js';
import { CompanyRecordsProvider } from '../src/CompanyRecordsContext.js';
import {
  activateCompanyRunCache,
  cacheCompanyRun,
  clearCompanyRunCache,
  companyRunCache,
  readCachedCompanyRun,
} from '../src/company-run-cache.js';

// Rendering assertions need the React modules, while their Vite CSS imports have no
// role in SSR. Keep the loader override local to this import and this test process.
const cssHook = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: 'export {};', shortCircuit: true };
    return nextLoad(url, context);
  },
});
let LiteResearchPage: typeof import('../src/showcase/LiteResearch.js').LiteResearchPage;
try {
  ({ LiteResearchPage } = await import('../src/showcase/LiteResearch.js'));
} finally {
  cssHook.deregister();
}

const recordedAt = '2026-10-03T00:00:00.000Z';

function fixture(id: string): CompanyResearchRun {
  return {
    id,
    input: { securityCode: '600519', orgId: 'test-issuer', year: 2025 },
    status: 'ready',
    createdAt: recordedAt,
    updatedAt: recordedAt,
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-configured' },
  };
}

function render(runId: string, owner: string, locale: 'zh-Hans' | 'en' = 'zh-Hans') {
  const context: AppContextValue = {
    locale,
    t: (zh, en) => (locale === 'en' ? en : zh),
    workspace: null,
    cases: [],
    user: { id: owner, name: 'Reader', email: 'reader@example.test', createdAt: recordedAt },
    registrationEnabled: true,
    refresh: async () => {},
    navigate: () => {},
    execute: async (action) => action(),
    confirm: () => {},
    showEvidence: () => {},
    busy: false,
  };
  return renderToStaticMarkup(
    createElement(
      AppContext.Provider,
      { value: context },
      createElement(
        CompanyRecordsProvider,
        null,
        createElement(LiteResearchPage, {
          query: new URLSearchParams({ run: runId, experience: 'lite' }),
        })
      )
    )
  );
}

function hrefs(markup: string) {
  return [...markup.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replaceAll('&amp;', '&'));
}

function assertNoFinancialReport(markup: string) {
  assert.doesNotMatch(markup, /data-grade=|class="lite-grade(?:\s|")/);
  assert.doesNotMatch(markup, /id="lite-(?:judgment|numbers|sources|questions)"/);
}

test('Lite shows the submitted unmatched name without inventing a financial report', (t) => {
  const run = fixture('unmatched-record');
  run.input.securityCode = '';
  run.input.orgId = '';
  run.informationGap = {
    name: '未匹配回归样本',
    reason: '已保存查询名称；尚无可确认的上市主体。',
  };
  // These records are deliberately excluded from the public cache. Supply an
  // owner-checked API-equivalent response at the reading seam to test rendering.
  t.mock.method(companyRunCache, 'read', (owner: string, id: string) =>
    owner === 'gap-owner' && id === run.id ? run : null
  );
  for (const locale of ['zh-Hans', 'en'] as const) {
    const markup = render(run.id, 'gap-owner', locale);
    assert.match(markup, /<h1>未匹配回归样本<\/h1>/);
    assert.match(
      markup,
      locale === 'en' ? /No supported listed entity matched/ : /未匹配到支持的上市主体/
    );
    assert.ok(hrefs(markup).includes(`${companyPath(run.id)}&cached=1&experience=pro`));
    assert.ok(hrefs(markup).includes('/#showcase-query'));
    assertNoFinancialReport(markup);
  }
});

test('Lite pauses legacy unsupported markets while linking to their retained originals', (t) => {
  const run = fixture('legacy-us-record');
  run.input.securityCode = 'AAPL';
  run.input.orgId = 'legacy-us-issuer';
  run.identity = {
    securityCode: run.input.securityCode,
    orgId: run.input.orgId,
    shortName: 'Historical issuer',
    companyName: 'Historical US issuer',
    exchange: 'us',
    sourceUrl: 'https://www.sec.gov/',
  };
  // US records also arrive from the owning API rather than the A-share cache.
  t.mock.method(companyRunCache, 'read', (owner: string, id: string) =>
    owner === 'legacy-owner' && id === run.id ? run : null
  );
  for (const locale of ['zh-Hans', 'en'] as const) {
    const markup = render(run.id, 'legacy-owner', locale);
    assert.match(markup, /<h1>Historical US issuer<\/h1>/);
    assert.match(
      markup,
      locale === 'en'
        ? /New research and follow-up questions for this market are paused/
        : /该市场的新增研究和继续追问已暂停/
    );
    assert.ok(hrefs(markup).includes(`${companyPath(run.id, 'evidence')}&cached=1&experience=pro`));
    assert.doesNotMatch(markup, /<button\b/);
    assertNoFinancialReport(markup);
  }
});

test('Lite cannot render another owner’s actual cached company record', () => {
  const owner = 'cached-owner';
  const run = fixture('owner-only-record');
  const companyName = 'OWNER_ONLY_COMPANY_SENTINEL';
  run.identity = {
    securityCode: run.input.securityCode,
    orgId: run.input.orgId,
    shortName: companyName,
    companyName,
    exchange: 'sse',
    sourceUrl: 'https://www.cninfo.com.cn/',
  };
  run.contextStatus = 'ready';
  run.context = {
    version: 1,
    securityCode: run.input.securityCode,
    orgId: run.input.orgId,
    companyName,
    fetchedAt: recordedAt,
    status: 'partial',
    financials: [],
    sources: [],
    comparisons: [],
    profile: {},
    shareholders: [],
    announcements: [],
    news: [],
    verificationLinks: [],
    warnings: [],
  };
  activateCompanyRunCache(owner);
  try {
    cacheCompanyRun(owner, run);
    assert.equal(readCachedCompanyRun(owner, run.id)?.identity?.companyName, companyName);
    assert.match(render(run.id, owner), /OWNER_ONLY_COMPANY_SENTINEL/);
    assert.equal(readCachedCompanyRun('different-reader', run.id), null);
    const markup = render(run.id, 'different-reader');
    assert.match(markup, /读取已保存的研究记录/);
    assert.doesNotMatch(markup, /OWNER_ONLY_COMPANY_SENTINEL/);
    assert.ok(!hrefs(markup).some((href) => href.startsWith(`/company?run=${run.id}`)));
    assertNoFinancialReport(markup);
  } finally {
    clearCompanyRunCache(owner);
    activateCompanyRunCache(null);
  }
});
