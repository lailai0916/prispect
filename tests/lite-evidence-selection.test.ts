import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { CompanyReportLinks } from '../shared/company-report-links.js';
import type { CompanyReportDocumentBinding } from '../shared/company-report-document.js';

const cssHook = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: 'export {};', shortCircuit: true };
    return nextLoad(url, context);
  },
});
let resolveLiteEvidenceSelection: typeof import('../src/showcase/LiteEvidenceExplorer.js').resolveLiteEvidenceSelection;
try {
  ({ resolveLiteEvidenceSelection } = await import('../src/showcase/LiteEvidenceExplorer.js'));
} finally {
  cssHook.deregister();
}

const binding: CompanyReportDocumentBinding = {
  runId: 'selection-fixture-run',
  securityCode: '300893',
  orgId: 'selection-fixture-org',
  year: 2025,
  basis: 'consolidated',
  snapshotFetchedAt: '2026-10-03T00:00:00.000Z',
  reportGeneratedAt: '2026-10-03T00:03:00.000Z',
};
function fixture(): CompanyReportLinks {
  return {
    binding: { ...binding },
    paragraphs: [
      {
        id: 'summary',
        groups: ['summary'],
        metricIds: ['same-value-a'],
        sourceIds: ['source-1'],
        judgment: {
          id: 'summary',
          text: { zh: '已确认概括', en: 'Saved summary' },
          provenance: 'rules',
          binding: { ...binding },
          metricIds: ['same-value-a'],
          evidenceIds: ['source-1'],
        },
      },
      {
        id: 'unknown',
        groups: ['unknown'],
        metricIds: ['same-value-b'],
        sourceIds: ['source-8'],
        judgment: {
          id: 'unknown',
          text: { zh: '仍待核查', en: 'Still unknown' },
          provenance: 'rules',
          binding: { ...binding },
          metricIds: ['same-value-b'],
          evidenceIds: ['source-8'],
        },
      },
      {
        id: 'action',
        groups: ['action'],
        metricIds: [],
        sourceIds: ['source-10'],
        judgment: {
          id: 'action',
          text: { zh: '下一步核查', en: 'Next check' },
          provenance: 'rules',
          binding: { ...binding },
          metricIds: [],
          evidenceIds: ['source-10'],
        },
      },
    ],
    metrics: ['same-value-a', 'same-value-b'].map((id, i) => ({
      id,
      sourceIds: [i ? 'source-8' : 'source-1'],
      paragraphIds: [i ? 'unknown' : 'summary'],
      metric: {
        id,
        label: ['合成等值指标', 'Synthetic equal-valued metric'],
        value: '100.00',
        display: ['100元', 'CNY100'],
        status: 'available',
        unit: 'CNY',
        formula: ['合成指标', 'Synthetic metric'],
        evidenceIds: [i ? 'source-8' : 'source-1'],
      },
    })),
    sources: Array.from({ length: 15 }, (_, i) => ({
      id: `source-${i}`,
      metricIds: [],
      paragraphIds: i === 1 ? ['summary'] : i === 8 ? ['unknown'] : i === 10 ? ['action'] : [],
      source: {
        id: `source-${i}`,
        kind: 'financial',
        label: `Synthetic source ${i}`,
        url: `https://example.invalid/source-${i}`,
        period: '2025-12-31',
        sourceQuality: 'web',
      },
    })),
  };
}

test('source-only links select actual unknown/action citations, without narrowing to the default deck', () => {
  const links = fixture();
  const before = structuredClone(links);
  assert.deepEqual(resolveLiteEvidenceSelection(links, { binding, sourceId: 'source-8' }), {
    paragraphId: 'unknown',
    sourceId: 'source-8',
    archiveSourceId: 'source-8',
    page: 2,
  });
  assert.equal(
    resolveLiteEvidenceSelection(links, { binding, paragraphId: 'action', sourceId: 'source-10' })!
      .paragraphId,
    'action'
  );
  assert.deepEqual(links, before);
});

test('an uncited source opens its own archive page without attaching the default finding', () => {
  assert.deepEqual(resolveLiteEvidenceSelection(fixture(), { binding, sourceId: 'source-13' }), {
    paragraphId: null,
    sourceId: null,
    archiveSourceId: 'source-13',
    page: 3,
  });
});

test('every binding field fences old runs, issuers, years, snapshots and report generations', () => {
  const changes: Partial<CompanyReportDocumentBinding>[] = [
    { runId: 'other-run' },
    { securityCode: '600000' },
    { orgId: 'other-org' },
    { year: 2024 },
    { basis: 'parent' as never },
    { snapshotFetchedAt: '2026-10-03T00:01:00.000Z' },
    { reportGeneratedAt: '2026-10-03T00:04:00.000Z' },
  ];
  for (const change of changes)
    assert.equal(
      resolveLiteEvidenceSelection(fixture(), {
        binding: { ...binding, ...change },
        paragraphId: 'summary',
        sourceId: 'source-1',
      }),
      null
    );
  assert.equal(
    resolveLiteEvidenceSelection(
      { ...fixture(), binding: null },
      { binding, sourceId: 'source-1' }
    ),
    null
  );
});

test('equal amounts never substitute an unrelated source, and invalid IDs retain the default reader', () => {
  const links = fixture();
  assert.equal(
    resolveLiteEvidenceSelection(links, { binding, paragraphId: 'summary', sourceId: 'source-8' }),
    null
  );
  assert.equal(resolveLiteEvidenceSelection(links, { binding, paragraphId: 'not-recorded' }), null);
  assert.equal(resolveLiteEvidenceSelection(links, { binding, sourceId: 'not-recorded' }), null);
  assert.equal(resolveLiteEvidenceSelection(links, undefined), null);
  assert.equal(resolveLiteEvidenceSelection(links, { binding }), null);
});
