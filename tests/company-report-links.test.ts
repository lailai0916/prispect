import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyResearchRun } from '../shared/contracts.js';
import type { AssessmentEvidence, AssessmentMetric } from '../shared/company-assessment.js';
import {
  deriveCompanyReportDocument,
  type CompanyReportDocumentBinding,
  type CompanyReportDocumentItem,
  type CompanyReportDocumentView,
} from '../shared/company-report-document.js';
import {
  deriveCompanyReportLinks,
  filterCompanyReportSources,
  reportMetricSourceIds,
  reportParagraphSourceIds,
} from '../shared/company-report-links.js';

const binding: CompanyReportDocumentBinding = {
  runId: 'links-test-run',
  securityCode: '300893',
  orgId: 'links-test-org',
  year: 2025,
  basis: 'consolidated',
  snapshotFetchedAt: '2026-10-01T00:00:00.000Z',
  reportGeneratedAt: '2026-10-01T00:03:00.000Z',
};

const paragraph = (
  id: string,
  metricIds: string[] = [],
  evidenceIds: string[] = []
): CompanyReportDocumentItem => ({
  id,
  text: { zh: `测试段落 ${id}：100 元`, en: `Test paragraph ${id}: CNY 100` },
  metricIds,
  evidenceIds,
  provenance: 'model',
  binding: { ...binding },
});

const metric = (id: string, evidenceIds: string[] = []): AssessmentMetric => ({
  id,
  label: [`测试数据 ${id}`, `Test metric ${id}`],
  value: '100.00',
  display: ['100 元', 'CNY 100'],
  unit: 'CNY',
  status: 'available',
  evidenceIds,
  formula: ['测试记录值', 'Recorded test value'],
});

const source = (
  id: string,
  kind: AssessmentEvidence['kind'] = 'financial'
): AssessmentEvidence => ({
  id,
  kind,
  label: `测试来源 ${id}`,
  url: `https://example.invalid/recorded-test/${id}`,
  period: '2025-12-31',
  quote: '测试摘录：100 元。',
  sourceQuality: kind === 'discussion' ? 'opinion' : 'web',
});

/** Synthetic navigation fixture; no report acquisition, model, or production company data. */
function fixture(): CompanyReportDocumentView {
  const run: CompanyResearchRun = {
    id: binding.runId,
    input: {
      securityCode: binding.securityCode,
      orgId: binding.orgId,
      year: binding.year,
      researchMode: 'financial',
    },
    status: 'ready',
    createdAt: binding.snapshotFetchedAt,
    updatedAt: binding.reportGeneratedAt!,
    trace: [],
    announcements: [],
    model: { requested: false, status: 'not-called' },
  };
  const empty = deriveCompanyReportDocument(run);
  return {
    ...empty,
    mode: 'model',
    snapshot: 'current',
    withheldReason: null,
    binding: { ...binding },
    generatedAt: binding.reportGeneratedAt,
    snapshotFetchedAt: binding.snapshotFetchedAt,
    progress: { ...empty.progress, snapshot: 'current', mode: 'model' },
  };
}

test('only recorded IDs connect paragraph, exact metric and source in both directions', () => {
  const document = fixture();
  document.summary = paragraph('saved-summary', ['cash', 'cash', 'absent'], ['news', 'news']);
  document.findings = [paragraph('saved-finding', ['cash'])];
  document.facts = [
    metric('cash', ['annual', 'annual', 'absent']),
    metric('similar', ['unrelated']),
  ];
  document.references = [source('annual'), source('news', 'news'), source('unrelated')];
  const links = deriveCompanyReportLinks(document);

  assert.deepEqual(reportParagraphSourceIds(links, 'saved-summary'), ['news', 'annual']);
  assert.deepEqual(reportParagraphSourceIds(links, 'saved-finding'), ['annual']);
  assert.deepEqual(reportMetricSourceIds(links, 'cash'), ['annual']);
  assert.deepEqual(links.paragraphs[0]!.metricIds, ['cash']);
  assert.deepEqual(links.sources.find((row) => row.id === 'annual')!.paragraphIds, [
    'saved-summary',
    'saved-finding',
  ]);
  assert.deepEqual(links.sources.find((row) => row.id === 'annual')!.metricIds, ['cash']);
  assert.deepEqual(links.sources.find((row) => row.id === 'news')!.metricIds, []);
  assert.deepEqual(links.sources.find((row) => row.id === 'unrelated')!.paragraphIds, []);
  assert.deepEqual(links.metrics.find((row) => row.id === 'similar')!.paragraphIds, []);
  assert.deepEqual(reportParagraphSourceIds(links, 'absent'), []);
  assert.deepEqual(reportMetricSourceIds(links, 'absent'), []);
});

test('every report group has a stable reverse reference and unknown remains separate from risk', () => {
  const document = fixture();
  document.references = [source('record')];
  document.headline = paragraph('headline', [], ['record']);
  document.summary = paragraph('summary', [], ['record']);
  document.findings = [paragraph('finding', [], ['record'])];
  document.strengths = [paragraph('strength', [], ['record'])];
  document.risks = [paragraph('risk', [], ['record'])];
  document.unknowns = [paragraph('unknown', [], ['record'])];
  document.dimensions = [
    {
      id: 'cash',
      label: ['现金', 'Cash'],
      status: 'unknown',
      score: null,
      judgment: paragraph('dimension', [], ['record']),
    },
  ];
  document.actions = [paragraph('action', [], ['record'])];
  document.changeConditions = [paragraph('condition', [], ['record'])];
  document.observations = [paragraph('observation', [], ['record'])];
  document.questions = [paragraph('question', [], ['record'])];
  const links = deriveCompanyReportLinks(document);
  assert.deepEqual(links.sources[0]!.paragraphIds, [
    'headline',
    'summary',
    'finding',
    'strength',
    'risk',
    'unknown',
    'dimension',
    'action',
    'condition',
    'observation',
    'question',
  ]);
  assert.deepEqual(links.paragraphs.find((row) => row.id === 'unknown')!.groups, ['unknown']);
  assert.deepEqual(links.paragraphs.find((row) => row.id === 'dimension')!.groups, ['dimension']);
});

test('equal duplicate IDs collapse while conflicting IDs cannot pick a source by array order', () => {
  const document = fixture();
  const savedRisk = paragraph('saved-risk', ['cash'], ['annual']);
  document.findings = [savedRisk, structuredClone(savedRisk)];
  document.risks = [structuredClone(savedRisk)];
  document.summary = paragraph('ambiguous-paragraph', [], ['annual']);
  document.actions = [
    {
      ...paragraph('ambiguous-paragraph', [], ['annual']),
      text: { zh: '冲突原文', en: 'Conflict' },
    },
  ];
  document.facts = [
    metric('cash', ['annual']),
    metric('cash', ['annual']),
    metric('bad', ['annual']),
  ];
  document.facts.push({ ...metric('bad', ['annual']), value: '200.00' });
  document.references = [source('annual'), source('annual'), source('bad-source')];
  document.references.push({ ...source('bad-source'), url: 'https://example.invalid/other' });
  const links = deriveCompanyReportLinks(document);
  assert.deepEqual(
    links.paragraphs.map((row) => row.id),
    ['saved-risk']
  );
  assert.deepEqual(links.paragraphs[0]!.groups, ['finding', 'risk']);
  assert.deepEqual(
    links.metrics.map((row) => row.id),
    ['cash']
  );
  assert.deepEqual(
    links.sources.map((row) => row.id),
    ['annual']
  );
  assert.deepEqual(links.sources[0]!.paragraphIds, ['saved-risk']);
});

test('foreign owner, issuer, period, snapshot or generation paragraphs never enter the index', () => {
  const changes: Partial<CompanyReportDocumentBinding>[] = [
    { runId: 'other-run' },
    { securityCode: '600000' },
    { orgId: 'other-org' },
    { year: 2024 },
    { snapshotFetchedAt: '2026-10-02T00:00:00.000Z' },
    { reportGeneratedAt: '2026-10-02T00:03:00.000Z' },
  ];
  for (const changed of changes) {
    const document = fixture();
    document.summary = paragraph('saved-summary', ['cash']);
    document.actions = [{ ...paragraph('foreign', ['cash']), binding: { ...binding, ...changed } }];
    document.facts = [metric('cash', ['annual'])];
    document.references = [source('annual')];
    const links = deriveCompanyReportLinks(document);
    assert.deepEqual(
      links.paragraphs.map((row) => row.id),
      ['saved-summary']
    );
    assert.deepEqual(links.sources[0]!.paragraphIds, ['saved-summary']);
    assert.deepEqual(reportParagraphSourceIds(links, 'foreign'), []);
  }
});

test('a withheld or mismatched report cannot expose paragraph links or a source appendix', () => {
  const changes: Partial<CompanyReportDocumentView>[] = [
    { binding: null },
    { mode: 'none' },
    { withheldReason: 'scope' },
    { withheldReason: 'unsupported' },
    { withheldReason: 'information-gap' },
    { snapshot: 'mismatch' },
    { generatedAt: '2026-10-02T00:03:00.000Z' },
    { snapshotFetchedAt: '2026-10-02T00:00:00.000Z' },
    { generatedAt: null, binding: { ...binding, reportGeneratedAt: null } },
  ];
  const progressMismatch = fixture();
  changes.push({ progress: { ...progressMismatch.progress, snapshot: 'mismatch' } });
  for (const changed of changes) {
    const document = fixture();
    document.summary = paragraph('saved-summary', ['cash']);
    document.facts = [metric('cash', ['annual'])];
    document.references = [source('annual')];
    Object.assign(document, changed);
    assert.deepEqual(deriveCompanyReportLinks(document), {
      binding: null,
      paragraphs: [],
      metrics: [],
      sources: [],
    });
  }
});

test('previous saved generations keep their own links and local observations fabricate no generation', () => {
  const document = fixture();
  document.summary = paragraph('saved-summary', ['cash']);
  document.facts = [metric('cash', ['saved-annual'])];
  document.references = [source('saved-annual')];
  document.snapshot = 'previous';
  document.progress.snapshot = 'previous';
  const previous = deriveCompanyReportLinks(document);
  assert.equal(previous.binding!.reportGeneratedAt, binding.reportGeneratedAt);
  assert.deepEqual(reportParagraphSourceIds(previous, 'saved-summary'), ['saved-annual']);

  document.mode = 'observations';
  document.generatedAt = null;
  document.binding!.reportGeneratedAt = null;
  document.summary!.binding.reportGeneratedAt = null;
  document.summary!.provenance = 'observations';
  const observations = deriveCompanyReportLinks(document);
  assert.equal(observations.binding!.reportGeneratedAt, null);
  assert.equal(observations.paragraphs[0]!.judgment.provenance, 'observations');
  assert.deepEqual(reportParagraphSourceIds(observations, 'saved-summary'), ['saved-annual']);
});

test('unsafe source URLs and unresolved IDs cannot be navigated or added to reverse references', () => {
  const document = fixture();
  document.summary = paragraph('summary', ['cash'], ['unsafe', 'credentials', 'missing']);
  document.facts = [metric('cash', ['safe', 'unsafe', 'credentials', 'missing'])];
  document.references = [
    source('safe'),
    { ...source('unsafe'), url: 'javascript:alert(1)' },
    { ...source('credentials'), url: 'https://user:password@example.invalid/source' },
  ];
  const links = deriveCompanyReportLinks(document);
  assert.deepEqual(
    links.sources.map((row) => row.id),
    ['safe']
  );
  assert.deepEqual(reportParagraphSourceIds(links, 'summary'), ['safe']);
  assert.deepEqual(reportMetricSourceIds(links, 'cash'), ['safe']);
});

test('local source kind filtering and search retain actual source quality without changing associations', () => {
  const document = fixture();
  const kinds: AssessmentEvidence['kind'][] = [
    'financial',
    'industry',
    'disclosure',
    'news',
    'discussion',
    'profile',
  ];
  document.references = kinds.map((kind) => source(kind, kind));
  document.references[3]!.label = 'ＡＣＭＥ 公告线索';
  document.references[4]!.quote = '公开帖原文，未经验证';
  document.summary = paragraph('summary', [], ['financial']);
  const links = deriveCompanyReportLinks(document);
  for (const kind of kinds) {
    const filtered = filterCompanyReportSources(links, { kind });
    assert.equal(filtered.total, 1);
    assert.equal(filtered.items[0]!.source.kind, kind);
  }
  assert.equal(filterCompanyReportSources(links, { query: 'acme' }).items[0]!.id, 'news');
  assert.equal(filterCompanyReportSources(links, { query: '未经验证' }).items[0]!.id, 'discussion');
  assert.equal(
    filterCompanyReportSources(links, { query: 'recorded-test/profile' }).items[0]!.id,
    'profile'
  );
  assert.equal(filterCompanyReportSources(links, { query: '2025-12-31' }).total, 6);
  const opinion = filterCompanyReportSources(links, { kind: 'discussion' }).items[0]!;
  assert.equal(opinion.source.sourceQuality, 'opinion');
  assert.deepEqual(opinion.paragraphIds, []);
  assert.deepEqual(opinion.metricIds, []);
});

test('six-row pagination clamps stale pages after filtering and safely handles empty or invalid input', () => {
  const document = fixture();
  document.references = Array.from({ length: 13 }, (_, index) => source(`source-${index}`));
  const links = deriveCompanyReportLinks(document);
  const first = filterCompanyReportSources(links);
  assert.equal(first.items.length, 6);
  assert.equal(first.total, 13);
  assert.equal(first.pageCount, 3);
  assert.equal(first.hasPrevious, false);
  assert.equal(first.hasNext, true);
  const last = filterCompanyReportSources(links, { page: 99 });
  assert.equal(last.page, 3);
  assert.deepEqual(
    last.items.map((row) => row.id),
    ['source-12']
  );
  assert.equal(last.hasPrevious, true);
  assert.equal(last.hasNext, false);
  const filtered = filterCompanyReportSources(links, { query: 'source-12', page: 3 });
  assert.equal(filtered.page, 1);
  assert.equal(filtered.total, 1);
  const empty = filterCompanyReportSources(links, { kind: 'news', page: 99 });
  assert.deepEqual(empty, {
    items: [],
    total: 0,
    page: 1,
    pageSize: 6,
    pageCount: 0,
    hasPrevious: false,
    hasNext: false,
  });
  assert.equal(filterCompanyReportSources(links, { page: NaN, pageSize: Infinity }).pageSize, 6);
  assert.equal(filterCompanyReportSources(links, { page: -2, pageSize: -2 }).page, 1);
  assert.equal(filterCompanyReportSources(links, { pageSize: -2 }).pageSize, 1);
  assert.equal(filterCompanyReportSources(links, { pageSize: 1000 }).pageSize, 50);
});

test('indexing and returned source pages cannot mutate the saved document or sibling results', () => {
  const document = fixture();
  document.summary = paragraph('summary', ['cash'], ['news']);
  document.facts = [metric('cash', ['annual'])];
  document.references = [source('annual'), source('news', 'news')];
  const before = structuredClone(document);
  const links = deriveCompanyReportLinks(document);
  assert.deepEqual(document, before);
  links.binding!.year = 2024;
  links.paragraphs[0]!.judgment.text.zh = '修改本地返回值';
  links.paragraphs[0]!.judgment.metricIds.push('local-only');
  links.metrics[0]!.metric.value = '999.00';
  links.sources[0]!.source.label = '修改来源返回值';
  assert.deepEqual(document, before);
  const ids = reportParagraphSourceIds(links, 'summary');
  ids.push('local-only');
  assert.deepEqual(reportParagraphSourceIds(links, 'summary'), ['news', 'annual']);
  const page = filterCompanyReportSources(links);
  page.items[0]!.paragraphIds.push('local-only');
  page.items[0]!.source.label = '修改分页返回值';
  assert.deepEqual(links.sources[0]!.paragraphIds, ['summary']);
  assert.equal(links.sources[0]!.source.label, '修改来源返回值');
});
