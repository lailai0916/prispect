import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import type { AssessmentMetric } from '../shared/company-assessment.js';
import type {
  CompanyReportDocumentItem,
  CompanyReportDocumentView,
} from '../shared/company-report-document.js';
import { deriveCompanyReportDocument } from '../shared/company-report-document.js';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { AppContext, type AppContextValue } from '../src/context.js';
import type { LiteMetricChipsProps } from '../src/showcase/LiteMetricChips.js';

// Synthetic component regression cases only. CSS and model/source execution are
// deliberately absent; browser checks own motion, click/focus and print layout.
const cssHook = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: 'export {};', shortCircuit: true };
    return nextLoad(url, context);
  },
});
let LiteMetricChips: typeof import('../src/showcase/LiteMetricChips.js').LiteMetricChips;
try {
  ({ LiteMetricChips } = await import('../src/showcase/LiteMetricChips.js'));
} finally {
  cssHook.deregister();
}

const snapshot = '2026-10-03T00:00:00.000Z';
const generated = '2026-10-03T00:03:00.000Z';

function fixture(count = 2) {
  const run: CompanyResearchRun = {
    id: 'metric-chip-synthetic-run',
    input: { securityCode: '300893', orgId: 'metric-chip-synthetic-org', year: 2025 },
    status: 'ready',
    createdAt: snapshot,
    updatedAt: generated,
    trace: [],
    announcements: [],
    model: { requested: false, status: 'not-called' },
  };
  const document = deriveCompanyReportDocument(run);
  document.mode = 'rules';
  document.snapshot = 'current';
  document.binding = {
    runId: run.id,
    securityCode: run.input.securityCode,
    orgId: run.input.orgId,
    year: run.input.year,
    basis: 'consolidated',
    snapshotFetchedAt: snapshot,
    reportGeneratedAt: generated,
  };
  document.snapshotFetchedAt = snapshot;
  document.generatedAt = generated;
  document.progress.snapshot = 'current';
  document.facts = Array.from(
    { length: count },
    (_, index): AssessmentMetric => ({
      id: `2025-field-${index}`,
      label: [`字段 ${index}`, `Field ${index}`],
      value: '12345678.90',
      // A rounded presentation string must not replace the authoritative value.
      display: ['1234.57 万', '12.35m'],
      unit: 'CNY',
      status: 'available',
      evidenceIds: [`financial-field-${index}`],
      formula: ['已取得的年度字段', 'Recorded annual field'],
    })
  );
  document.references = document.facts.map((metric, index) => ({
    id: metric.evidenceIds[0]!,
    kind: 'financial',
    label: `Synthetic source ${index}`,
    url: `https://example.invalid/annual-field-${index}`,
    period: '2025-12-31',
    page: index + 1,
    sourceQuality: 'web',
  }));
  const judgment: CompanyReportDocumentItem = {
    id: 'synthetic-summary',
    provenance: 'rules',
    binding: { ...document.binding },
    text: { zh: '同值字段各有自己的依据。', en: 'Equal figures have separate recorded sources.' },
    metricIds: document.facts.map((metric) => metric.id),
    // Intentionally only one direct paragraph reference. Other metric sources
    // must come from their IDs, not from the paragraph's first source/value.
    evidenceIds: [document.references[0]!.id],
  };
  return { document, judgment };
}

function render(
  document: CompanyReportDocumentView,
  judgment: CompanyReportDocumentItem,
  extra: Partial<LiteMetricChipsProps> = {},
  locale: 'zh-Hans' | 'en' = 'en'
) {
  const value: AppContextValue = {
    locale,
    t: (zh, en) => (locale === 'en' ? en : zh),
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
  const html = renderToStaticMarkup(
    createElement(
      AppContext.Provider,
      { value },
      createElement(LiteMetricChips, {
        document,
        judgment,
        onInspect: () => {},
        ...extra,
      })
    )
  );
  return load(html);
}

test('equal amounts retain their own metric IDs, evidence and full recorded precision', () => {
  const { document, judgment } = fixture();
  const before = structuredClone(document);
  for (const locale of ['zh-Hans', 'en'] as const) {
    const $ = render(document, judgment, {}, locale);
    assert.equal($('.lite-metric-chip').length, 2);
    for (const metric of document.facts) {
      const chip = $(`[data-metric-id="${metric.id}"]`);
      assert.equal(chip.find('.lite-metric-chip-value').text(), '12,345,678.90 CNY');
      assert.equal(chip.attr('data-evidence-ids'), metric.evidenceIds[0]);
      assert.equal(chip.attr('data-run-id'), document.binding!.runId);
      assert.equal(chip.attr('data-year'), '2025');
      assert.equal(chip.attr('data-basis'), 'consolidated');
      assert.equal(chip.attr('data-report-generated-at'), generated);
      const entry = chip.closest('.lite-metric-chip-entry');
      assert.equal(entry.find('[data-source-id]').attr('data-source-id'), metric.evidenceIds[0]);
      assert.equal(entry.find('[data-source-id]').length, 1);
      assert.ok(chip.attr('aria-label')!.includes('2025-12-31'));
      assert.ok(entry.find('.lite-metric-chip-formula').attr('id'));
      assert.equal(
        chip.attr('aria-describedby'),
        entry.find('.lite-metric-chip-formula').attr('id')
      );
    }
  }
  assert.deepEqual(document, before, 'Reading chips must not rewrite the saved document');
});

test('negative values beyond floating-point integer precision and zero remain exact', () => {
  const { document, judgment } = fixture();
  document.facts[0]!.value = '-9007199254740993.01';
  document.facts[1]!.value = '0.00';
  const $ = render(document, judgment);
  assert.deepEqual(
    $('.lite-metric-chip-value')
      .map((_, node) => $(node).text())
      .get(),
    ['-9,007,199,254,740,993.01 CNY', '0.00 CNY']
  );
});

test('a large real-source relationship stays progressively readable without losing citations', () => {
  const { document, judgment } = fixture(1);
  document.references = Array.from({ length: 123 }, (_, index) => ({
    ...document.references[0]!,
    id: `synthetic-peer-source-${index}`,
    kind: 'industry' as const,
    label: `Synthetic same-year peer ${index}`,
    url: `https://example.invalid/peer-${index}`,
  }));
  const ids = document.references.map((source) => source.id);
  document.facts[0]!.evidenceIds = [...ids];
  judgment.evidenceIds = [...ids];
  const before = structuredClone({ document, judgment });
  const $ = render(document, judgment);
  assert.equal($('.lite-metric-chip-source-links > a').length, 2);
  const disclosure = $('.lite-metric-chip-more-sources');
  assert.equal(disclosure.attr('open'), undefined);
  assert.equal(disclosure.find('summary').text(), 'Show the remaining 121 sources');
  assert.equal(disclosure.find('[data-source-id]').length, 121);
  assert.deepEqual(
    $('[data-source-id]')
      .map((_, node) => $(node).attr('data-source-id'))
      .get(),
    ids
  );
  assert.deepEqual($('.lite-metric-chip').attr('data-evidence-ids')!.split(' '), ids);
  assert.deepEqual({ document, judgment }, before);
});

test('the selected annual year leads the preview while historical metrics remain fully readable', () => {
  const { document, judgment } = fixture(9);
  document.facts.forEach((metric, index) => {
    const year = 2023 + Math.floor(index / 3);
    metric.id = `${year}-field-${index}`;
    metric.label = [`${year} 年字段 ${index}`, `${year} field ${index}`];
    document.references[index]!.period = `${year}-12-31`;
  });
  judgment.metricIds = document.facts.map((metric) => metric.id);
  const before = structuredClone({ document, judgment });
  const $ = render(document, judgment, { maxVisible: 3 });
  assert.deepEqual(
    $('.lite-metric-chips > .lite-metric-chips-row .lite-metric-chip')
      .map((_, node) => $(node).attr('data-metric-id'))
      .get(),
    ['2025-field-6', '2025-field-7', '2025-field-8']
  );
  const historical = $('.lite-metric-chips-more .lite-metric-chip')
    .map((_, node) => $(node).attr('data-metric-id'))
    .get();
  assert.equal(historical.length, 6);
  assert.deepEqual(new Set(historical), new Set(judgment.metricIds.slice(0, 6)));
  assert.equal($('.lite-metric-chip').length, 9);
  for (const metric of document.facts) {
    const entry = $(`[data-metric-id="${metric.id}"]`).closest('.lite-metric-chip-entry');
    assert.equal(entry.find('.lite-metric-chip-value').text(), '12,345,678.90 CNY');
    assert.equal(entry.find('[data-source-id]').attr('data-source-id'), metric.evidenceIds[0]);
  }
  assert.deepEqual(
    { document, judgment },
    before,
    'Preview ordering must not mutate the saved report'
  );
});

test('observations and reports without a drawer callback expose their own recorded source pages', () => {
  for (const observations of [true, false]) {
    const { document, judgment } = fixture();
    if (observations) {
      document.mode = 'observations';
      document.generatedAt = null;
      document.binding!.reportGeneratedAt = null;
      judgment.binding.reportGeneratedAt = null;
    }
    const $ = render(document, judgment, observations ? {} : { onInspect: undefined });
    assert.equal($('button.lite-metric-chip').length, 0);
    for (let index = 0; index < document.facts.length; index++) {
      const chip = $(`a[data-metric-id="${document.facts[index]!.id}"]`);
      assert.equal(
        chip.attr('href'),
        `https://example.invalid/annual-field-${index}#page=${index + 1}`
      );
      assert.equal(chip.attr('target'), '_blank');
      assert.ok(chip.attr('rel')!.includes('noopener'));
      assert.equal(chip.attr('data-report-generated-at'), observations ? undefined : generated);
    }
  }
});

test('a stale issuer, annual scope, run or saved generation cannot display current metric chips', () => {
  const mutations = [
    { runId: 'another-run' },
    { securityCode: '600000' },
    { orgId: 'another-org' },
    { year: 2024 },
    { snapshotFetchedAt: '2026-10-02T00:00:00.000Z' },
    { reportGeneratedAt: '2026-10-02T00:03:00.000Z' },
  ];
  for (const mutation of mutations) {
    const { document, judgment } = fixture();
    Object.assign(judgment.binding, mutation);
    assert.equal(render(document, judgment)('.lite-metric-chips').length, 0);
  }
  for (const reason of ['scope', 'unsupported', 'information-gap'] as const) {
    const { document, judgment } = fixture();
    document.withheldReason = reason;
    assert.equal(render(document, judgment)('.lite-metric-chips').length, 0);
  }
  const { document, judgment } = fixture();
  document.mode = 'none';
  assert.equal(render(document, judgment)('.lite-metric-chips').length, 0);
});

test('missing, conflicted, ambiguous and unsafe evidence does not become a clickable amount', () => {
  const variants: ((document: CompanyReportDocumentView) => void)[] = [
    (document) => {
      document.facts[0]!.status = 'missing';
      document.facts[0]!.value = null;
    },
    (document) => {
      document.facts[0]!.status = 'conflict';
    },
    (document) => {
      document.facts[0]!.evidenceIds = ['unrecorded'];
    },
    (document) => {
      document.references[0]!.url = 'javascript:alert(1)';
    },
    (document) => {
      document.references[0]!.url = 'https://reader:secret@example.invalid/annual';
    },
    (document) => {
      document.references.push({ ...document.references[0]! });
    },
    (document) => {
      document.facts.push({ ...document.facts[0]! });
    },
  ];
  for (const mutate of variants) {
    const { document, judgment } = fixture();
    mutate(document);
    const $ = render(document, judgment);
    assert.equal($('[data-metric-id="2025-field-0"]').length, 0);
    assert.equal($('[data-metric-id="2025-field-1"]').length, 1, 'Keep independent usable facts');
  }
});

test('a derived metric keeps every actual input source rather than selecting the first paragraph reference', () => {
  const { document, judgment } = fixture(1);
  document.facts[0]!.unit = 'times';
  document.facts[0]!.value = '-0.012345';
  document.references.push({
    ...document.references[0]!,
    id: 'prior-year-input',
    url: 'https://example.invalid/prior-year-input',
    period: '2024-12-31',
    page: 19,
  });
  document.facts[0]!.evidenceIds.push('prior-year-input');
  const $ = render(document, judgment);
  assert.equal($('.lite-metric-chip-value').text(), '-0.012345×');
  assert.equal(
    $('.lite-metric-chip').attr('data-evidence-ids'),
    'financial-field-0 prior-year-input'
  );
  assert.equal($('.lite-metric-chip-source-links a').length, 2);
  assert.ok($('.lite-metric-chip-scope').text().includes('2025-12-31 / 2024-12-31'));
});

test('all metrics, formulas and exact source page URLs remain in the printable DOM beyond the preview', () => {
  const { document, judgment } = fixture(8);
  const $ = render(document, judgment);
  assert.equal($('.lite-metric-chip').length, 8);
  assert.equal($('.lite-metric-chips-more').length, 1);
  assert.equal($('.lite-metric-chips-more .lite-metric-chip').length, 2);
  assert.equal($('.lite-metric-chips-more').attr('open'), undefined);
  for (let index = 0; index < 8; index++) {
    const entry = $(`[data-metric-id="2025-field-${index}"]`).closest('.lite-metric-chip-entry');
    assert.equal(entry.find('.lite-metric-chip-formula').text(), 'Recorded annual field');
    assert.ok(
      entry
        .find('.lite-metric-chip-print-url')
        .text()
        .includes(`#page=${index + 1}`)
    );
    assert.ok(entry.find('.lite-metric-chip-print-url').text().includes(`annual-field-${index}`));
  }
});

test('temporarily disabled inspection retains readable figures and native source links', () => {
  const { document, judgment } = fixture();
  const $ = render(document, judgment, { disabled: true });
  assert.equal($('button.lite-metric-chip[disabled]').length, 2);
  assert.equal($('.lite-metric-chip-source-links a[href]').length, 2);
  assert.equal($('.lite-metric-chip-value').first().text(), '12,345,678.90 CNY');
});
