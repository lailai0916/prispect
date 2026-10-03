import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { type TestContext } from 'node:test';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import type { AssessmentJudgment, CompanyAssessment } from '../shared/company-assessment.js';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { AppContext, type AppContextValue } from '../src/context.js';
import { CompanyRecordsProvider } from '../src/CompanyRecordsContext.js';
import { companyRunCache } from '../src/company-run-cache.js';

// These are deliberately synthetic rendering fixtures, not source or production
// acceptance evidence. CSS has no role in the SSR assertions below.
const cssHook = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: 'export {};', shortCircuit: true };
    return nextLoad(url, context);
  },
});
let CompanyReportDocument: typeof import('../src/CompanyReportDocument.js').CompanyReportDocument;
let LiteResearchPage: typeof import('../src/showcase/LiteResearch.js').LiteResearchPage;
try {
  ({ CompanyReportDocument } = await import('../src/CompanyReportDocument.js'));
  ({ LiteResearchPage } = await import('../src/showcase/LiteResearch.js'));
} finally {
  cssHook.deregister();
}

const snapshotAt = '2026-10-03T00:00:00.000Z';
const generatedAt = '2026-10-03T00:03:00.000Z';
const owner = 'report-document-rendering-owner';
const sourceUrl = 'https://example.invalid/annual-2025';
const dimensionIds = [
  'profitability',
  'cash',
  'solvency',
  'workingCapital',
  'industry',
  'events',
] as const;

function judgment(marker: string): AssessmentJudgment {
  return {
    text: { zh: `已保存分析：${marker}。`, en: `Saved analysis: ${marker}.` },
    metricIds: ['cash-to-profit'],
    evidenceIds: ['annual-2025'],
  };
}

function fixture(): CompanyResearchRun {
  const assessment: CompanyAssessment = {
    version: 1,
    year: 2025,
    basis: 'consolidated',
    snapshotFetchedAt: snapshotAt,
    generatedAt,
    grade: 'C',
    score: 50,
    methodologyVersion: 'financial-screen-v1',
    dimensions: dimensionIds.map((id) => ({
      id,
      label: [`维度 ${id}`, `Dimension ${id}`],
      score: ['industry', 'events'].includes(id) ? null : 50,
      status: 'pressure',
      metricIds: ['cash-to-profit'],
      ruleSummary: [`已记录规则：${id}。`, `Recorded rule: ${id}.`],
    })),
    metrics: [
      {
        id: 'cash-to-profit',
        label: ['现金利润比', 'Cash-to-profit'],
        value: '7.15',
        display: ['7.15%', '7.15%'],
        unit: 'percent',
        status: 'available',
        evidenceIds: ['annual-2025'],
        formula: ['经营现金净额 ÷ 合并净利润', 'Operating cash / consolidated profit'],
      },
    ],
    evidence: [
      {
        id: 'annual-2025',
        kind: 'financial',
        label: '已保存的年度报告依据',
        url: sourceUrl,
        period: '2025-12-31',
        page: 191,
        quote: '已保存原文摘录 SOURCE_QUOTE_SENTINEL',
        sourceQuality: 'excerpt',
      },
      {
        id: 'unrelated-news',
        kind: 'news',
        label: '没有被判断引用的新闻线索',
        url: 'https://example.invalid/unrelated-news',
        sourceQuality: 'headline',
      },
    ],
    coverage: {
      fields: 13,
      requiredFields: 13,
      years: 1,
      sources: 2,
      news: 1,
      disclosures: 0,
      excerpts: 1,
      peers: 0,
    },
    gaps: [
      [
        '尚无期后回款材料 GAP_SENTINEL。',
        'Subsequent collection records are missing GAP_SENTINEL.',
      ],
    ],
    narrative: {
      summary: judgment('SUMMARY_SENTINEL'),
      summaryHighlights: { zh: ['SUMMARY_SENTINEL'], en: ['SUMMARY_SENTINEL'] },
      dimensions: dimensionIds.map((dimensionId) => ({
        ...judgment(`DIMENSION_${dimensionId}`),
        dimensionId,
      })),
      strengths: [judgment('STRENGTH_1'), judgment('STRENGTH_2')],
      risks: Array.from({ length: 4 }, (_, index) => judgment(`RISK_${index + 1}`)),
      actions: Array.from({ length: 4 }, (_, index) => judgment(`ACTION_${index + 1}`)),
      changeConditions: [judgment('CHANGE_1'), judgment('CHANGE_2')],
      suggestedQuestions: [judgment('QUESTION_1'), judgment('QUESTION_2')],
    },
    model: { status: 'completed', name: 'synthetic-rendering-model' },
    research: { goal: '', steps: [], modelCalls: 1, toolCalls: 0 },
  };
  return {
    id: 'synthetic-report-document',
    input: {
      securityCode: '300893',
      orgId: 'synthetic-issuer',
      year: 2025,
      researchMode: 'financial',
    },
    status: 'ready',
    createdAt: snapshotAt,
    updatedAt: generatedAt,
    trace: [],
    announcements: [],
    model: { requested: false, status: 'not-called' },
    contextStatus: 'ready',
    assessmentStatus: 'ready',
    context: {
      version: 1,
      securityCode: '300893',
      orgId: 'synthetic-issuer',
      companyName: '合成文档呈现样本',
      fetchedAt: snapshotAt,
      status: 'available',
      financials: [],
      sources: [],
      comparisons: [],
      profile: {},
      shareholders: [],
      announcements: [],
      news: [],
      verificationLinks: [],
      warnings: [],
    },
    assessment,
  };
}

function render(element: ReactElement, locale: 'zh-Hans' | 'en') {
  const value: AppContextValue = {
    locale,
    t: (zh, en) => (locale === 'en' ? en : zh),
    workspace: null,
    cases: [],
    user: {
      id: owner,
      name: 'Synthetic reader',
      email: 'rendering@example.invalid',
      createdAt: snapshotAt,
    },
    registrationEnabled: true,
    refresh: async () => {},
    navigate: () => {},
    execute: async (action) => action(),
    confirm: () => {},
    showEvidence: () => {},
    busy: false,
  };
  return load(renderToStaticMarkup(createElement(AppContext.Provider, { value }, element)));
}

function renderBoth(t: TestContext, run: CompanyResearchRun, locale: 'zh-Hans' | 'en' = 'zh-Hans') {
  // The Lite reading seam is owner-checked just as its API response is; no global
  // record or production account is installed for these rendering tests.
  t.mock.method(companyRunCache, 'read', (reader: string, id: string) =>
    reader === owner && id === run.id ? run : null
  );
  return [
    [
      'Pro',
      render(createElement(CompanyReportDocument, { run, onInspect: () => undefined }), locale),
    ],
    [
      'Lite',
      render(
        createElement(
          CompanyRecordsProvider,
          null,
          createElement(LiteResearchPage, {
            query: new URLSearchParams({ run: run.id, experience: 'lite' }),
          })
        ),
        locale
      ),
    ],
  ] as const;
}

function hasSavedOriginal($: ReturnType<typeof load>) {
  return $('a[href]')
    .toArray()
    .some((link) => {
      const href = $(link).attr('href');
      return href?.split('#')[0] === sourceUrl;
    });
}

test('Pro and Lite retain every saved dimension, risk, action and change condition in both locales', (t) => {
  const run = fixture();
  const markers = [
    'SUMMARY_SENTINEL',
    ...dimensionIds.map((id) => `DIMENSION_${id}`),
    'STRENGTH_1',
    'STRENGTH_2',
    'RISK_1',
    'RISK_2',
    'RISK_3',
    'RISK_4',
    'ACTION_1',
    'ACTION_2',
    'ACTION_3',
    'ACTION_4',
    'CHANGE_1',
    'CHANGE_2',
    'GAP_SENTINEL',
  ];
  for (const locale of ['zh-Hans', 'en'] as const) {
    for (const [experience, $] of renderBoth(t, run, locale)) {
      const text = $.root().text();
      for (const marker of markers)
        assert.ok(text.includes(marker), `${experience} ${locale} discarded ${marker}`);
      assert.ok(hasSavedOriginal($), `${experience} must retain its saved original URL`);
      assert.equal(
        $('img[src$="optical-prism.webp"]').length,
        0,
        `${experience} report must not repeat the hero illustration`
      );
    }
  }
});

test('report reading structures expose the full analysis through native document sections', (t) => {
  const [pro, lite] = renderBoth(t, fixture());
  const $pro = pro[1];
  const $lite = lite[1];
  assert.equal($pro('#company-report-document').attr('data-mode'), 'model');
  for (const section of [
    'summary',
    'findings',
    'risks',
    'unknowns',
    'dimensions',
    'actions',
    'changes',
    'references',
  ]) {
    assert.equal(
      $pro(`#company-report-${section}`).length,
      1,
      `Missing Pro document section: ${section}`
    );
  }
  assert.equal($pro('#company-report-dimensions details').length, 6);
  assert.equal($lite('details.lite-report-detail').length, 1);
  for (const section of ['dimensions', 'strengths', 'risks', 'actions', 'change-conditions']) {
    assert.equal(
      $lite(`.lite-report-detail [data-report-section="${section}"]`).length,
      1,
      `Missing Lite detail section: ${section}`
    );
  }
  for (const id of ['judgment', 'numbers', 'sources', 'questions'])
    assert.equal($lite(`#lite-${id}`).length, 1);
});

test('failed refreshes keep the saved report generation and source snapshot readable', (t) => {
  const run = fixture();
  run.assessmentStatus = 'failed';
  run.assessmentError = 'Synthetic rerun failure';
  run.context!.fetchedAt = '2026-10-03T01:00:00.000Z';
  const [pro, lite] = renderBoth(t, run);
  const $pro = pro[1];
  assert.equal($pro('#company-report-document').attr('data-generated-at'), generatedAt);
  assert.equal($pro('#company-report-document').attr('data-snapshot'), 'previous');
  for (const [experience, $] of [pro, lite]) {
    assert.match($.root().text(), /SUMMARY_SENTINEL/);
    assert.match($.root().text(), /ACTION_4/);
    assert.match($.root().text(), /CHANGE_2/);
    assert.ok(hasSavedOriginal($), `${experience} lost the saved-generation reference`);
  }
});

test('issuer or selected-year mismatches withhold saved judgments, actions and grades in both reports', (t) => {
  for (const mismatch of ['issuer', 'year'] as const) {
    const run = fixture();
    if (mismatch === 'issuer') run.context!.securityCode = '600519';
    else run.assessment!.year = 2024;
    for (const [experience, $] of renderBoth(t, run)) {
      const text = $.root().text();
      for (const marker of [
        'SUMMARY_SENTINEL',
        'DIMENSION_cash',
        'RISK_1',
        'ACTION_1',
        'CHANGE_1',
      ]) {
        assert.ok(
          !text.includes(marker),
          `${experience} leaked a ${mismatch}-mismatched ${marker}`
        );
      }
      assert.equal($('[data-grade="C"]').length, 0);
    }
  }
});

test('an incomplete model cannot present saved narrative text as a completed AI document', (t) => {
  for (const status of ['not-configured', 'failed'] as const) {
    const run = fixture();
    run.assessment!.model.status = status;
    for (const [experience, $] of renderBoth(t, run)) {
      assert.doesNotMatch(
        $.root().text(),
        /SUMMARY_SENTINEL|RISK_4|ACTION_4|CHANGE_2/,
        `${experience} trusted ${status} model text`
      );
      assert.equal($('[data-mode="model"]').length, 0);
      assert.match($.root().text(), /7\.15%/);
    }
  }
});

test('report paragraphs and saved quotes render as escaped text rather than model HTML', (t) => {
  const run = fixture();
  const malicious = '<img src=x onerror=alert(1)> SAFE_TEXT_SENTINEL';
  run.assessment!.narrative!.summary.text = { zh: malicious, en: malicious };
  run.assessment!.evidence[0].quote = '<script>alert(1)</script> SAFE_QUOTE_SENTINEL';
  for (const [experience, $] of renderBoth(t, run)) {
    assert.equal($('img[src="x"]').length, 0, `${experience} rendered model markup`);
    assert.equal($('script').length, 0, `${experience} rendered source markup`);
    assert.match($.root().text(), /<img src=x onerror=alert\(1\)> SAFE_TEXT_SENTINEL/);
  }
  const $pro = renderBoth(t, run)[0][1];
  assert.match(
    $pro('#company-report-references').text(),
    /<script>alert\(1\)<\/script> SAFE_QUOTE_SENTINEL/
  );
});

test('document citations stay targeted and unreferenced or unsupported claims do not become sources', (t) => {
  const run = fixture();
  run.assessment!.narrative!.risks.push({
    ...judgment('UNSUPPORTED_RISK_SENTINEL'),
    metricIds: ['unknown-metric'],
    evidenceIds: ['unrelated-news'],
  });
  const [pro, lite] = renderBoth(t, run);
  for (const [experience, $] of [pro, lite]) {
    assert.doesNotMatch($.root().text(), /UNSUPPORTED_RISK_SENTINEL/);
    assert.equal(
      $('a[href="https://example.invalid/unrelated-news"]').length,
      0,
      `${experience} widened a judgment's references`
    );
  }
  const $pro = pro[1];
  assert.equal($pro('#company-report-references [data-source-id]').length, 1);
  assert.equal($pro('#company-report-reference-1').attr('data-source-id'), 'annual-2025');
  assert.match($pro('#company-report-reference-1').text(), /SOURCE_QUOTE_SENTINEL/);
  const riskCitations = $pro('#company-report-risks .report-document-citations a').toArray();
  assert.equal(riskCitations.length, 4);
  for (const citation of riskCitations)
    assert.equal($pro(citation).attr('href'), '#company-report-reference-1');
});

test('older saved reports keep their full paragraphs without optional highlighting or generated questions', (t) => {
  const run = fixture();
  delete run.assessment!.narrative!.summaryHighlights;
  delete run.assessment!.narrative!.suggestedQuestions;
  for (const [experience, $] of renderBoth(t, run)) {
    assert.match($.root().text(), /SUMMARY_SENTINEL/);
    assert.match($.root().text(), /RISK_4/);
    assert.match($.root().text(), /ACTION_4/);
    assert.match($.root().text(), /CHANGE_2/);
    assert.ok(hasSavedOriginal($), `${experience} lost the compatible saved source`);
  }
});

test('saved follow-ups retain their run, annual scope and report generation, and cached Lite remains disabled', (t) => {
  const run = fixture();
  const $pro = render(createElement(CompanyReportDocument, { run, disabled: true }), 'zh-Hans');
  const buttons = $pro('.report-document-followups button').toArray();
  assert.equal(buttons.length, 2);
  for (const button of buttons) {
    assert.equal($pro(button).attr('data-run-id'), run.id);
    assert.equal($pro(button).attr('data-year'), String(run.input.year));
    assert.equal($pro(button).attr('data-basis'), 'consolidated');
    assert.equal($pro(button).attr('data-report-generated-at'), generatedAt);
    assert.equal($pro(button).is(':disabled'), true);
  }
  const $lite = renderBoth(t, run)[1][1];
  assert.equal($lite('.lite-question-list button').length, 2);
  assert.equal($lite('.lite-question-list button:disabled').length, 2);
  assert.match($lite('.lite-question-list').text(), /QUESTION_1/);
});
