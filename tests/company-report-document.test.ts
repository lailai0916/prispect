import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { deriveCompanyAssessment, type AssessmentJudgment } from '../shared/company-assessment.js';
import { contextAmountFields, type CompanyContextPeriod } from '../shared/company-workspace.js';
import { deriveCompanyReportDocument } from '../shared/company-report-document.js';

const snapshot = '2026-10-01T00:00:00.000Z';
const generated = '2026-10-01T00:03:00.000Z';
const block = (text: string): AssessmentJudgment => ({
  text: { zh: text, en: `Saved test paragraph: ${text}` },
  metricIds: ['2025-ocf'],
  evidenceIds: ['financial-2025-ocf'],
});

/** Deliberately small financial test values, never production report evidence. */
function fixture(saved = true): CompanyResearchRun {
  const annual = (year: number): CompanyContextPeriod => ({
    period: `${year}-12-31`,
    annual: true,
    noticeDate: `${year + 1}-04-01`,
    amounts: {
      ...Object.fromEntries(contextAmountFields.map((field) => [field, null])),
      revenue: year === 2025 ? '1200.00' : '1000.00',
      netProfit: '200.00',
      parentProfit: '150.00',
      ocf: '15.00',
      cash: '100.00',
      shortLoan: '80.00',
      currentPortionDebt: '20.00',
      totalAssets: '2000.00',
      totalLiabilities: '500.00',
      receivables: '200.00',
      inventory: '200.00',
    } as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: null, roe: null, revenueGrowth: null },
    auditOpinion: null,
    fieldSources: {},
    sourceUrls: [`https://datacenter.eastmoney.com/report?test-year=${year}`],
    originalUrl: null,
  });
  const run: CompanyResearchRun = {
    id: 'document-test-run',
    input: {
      securityCode: '300893',
      orgId: 'document-test-org',
      year: 2025,
      researchMode: 'financial',
    },
    status: 'ready',
    createdAt: snapshot,
    updatedAt: generated,
    trace: [],
    announcements: [],
    model: { requested: false, status: 'not-called' },
    contextStatus: 'ready',
    context: {
      version: 1,
      securityCode: '300893',
      orgId: 'document-test-org',
      companyName: '报告纯读取测试公司',
      fetchedAt: snapshot,
      status: 'available',
      financials: [annual(2024), annual(2025)],
      sources: [],
      comparisons: [],
      profile: {},
      shareholders: [],
      announcements: [],
      news: [],
      verificationLinks: [],
      warnings: [],
    },
  };
  if (saved) {
    run.assessment = deriveCompanyAssessment(run);
    run.assessment.generatedAt = generated;
    run.assessment.model.status = 'completed';
    run.assessment.narrative = {
      summary: block('已保存的核心判断原文。'),
      summaryHighlights: { zh: ['核心判断'], en: ['Saved test paragraph'] },
      dimensions: run.assessment.dimensions.map((dimension) => ({
        ...block(`已保存的 ${dimension.id} 维度原文。`),
        dimensionId: dimension.id,
      })),
      strengths: [block('第一项经营优势。'), block('第二项经营优势。')],
      risks: Array.from({ length: 4 }, (_, index) => block(`完整风险原文 ${index + 1}。`)),
      actions: Array.from({ length: 4 }, (_, index) => block(`完整行动原文 ${index + 1}。`)),
      changeConditions: [block('改善判断的条件。'), block('恶化判断的条件。')],
      suggestedQuestions: [block('为什么这项数据值得核查？'), block('哪份新资料会改变判断？')],
    };
    run.assessmentStatus = 'ready';
  }
  return run;
}

test('the complete saved narrative is recovered without the old three-item truncation', () => {
  const run = fixture();
  const before = structuredClone(run);
  const document = deriveCompanyReportDocument(run, 'parent');
  assert.equal(document.mode, 'model');
  assert.equal(document.summary?.text.zh, run.assessment!.narrative!.summary.text.zh);
  assert.deepEqual(
    document.risks.map((item) => item.text),
    run.assessment!.narrative!.risks.map((item) => item.text)
  );
  assert.equal(document.actions.length, 4);
  assert.equal(document.strengths.length, 2);
  assert.equal(document.changeConditions.length, 2);
  assert.equal(document.dimensions.length, 6);
  assert.equal(document.questions.length, 2);
  assert.equal(document.displayedBasis, 'parent');
  assert.equal(document.binding?.basis, 'consolidated');
  assert.equal(document.questions[0]!.binding.reportGeneratedAt, generated);
  assert.deepEqual(run, before, 'Reading the report must not rewrite saved state');
});

test('a previous saved report never adopts refreshed figures, sources or generation dates', () => {
  const run = fixture();
  run.context!.fetchedAt = '2026-10-02T00:00:00.000Z';
  run.context!.financials[1]!.amounts.ocf = '9999.00';
  run.context!.financials[1]!.sourceUrls = ['https://new.example.invalid/current-source'];
  run.assessmentStatus = 'failed';
  const document = deriveCompanyReportDocument(run);
  assert.equal(document.snapshot, 'previous');
  assert.equal(document.snapshotFetchedAt, snapshot);
  assert.equal(document.generatedAt, generated);
  assert.equal(document.facts.find((fact) => fact.id === '2025-ocf')!.value, '15.00');
  assert.ok(document.actions.every((item) => item.binding.snapshotFetchedAt === snapshot));
  assert.ok(document.questions.every((item) => item.binding.reportGeneratedAt === generated));
  assert.equal(
    document.references.some((source) => source.url.includes('new.example.invalid')),
    false
  );
  assert.ok(document.warnings.length > 0);
});

test('stored NR and supported provisional grade remain separate and unchanged', () => {
  const run = fixture();
  run.assessment!.grade = 'NR';
  run.assessment!.score = null;
  const document = deriveCompanyReportDocument(run);
  assert.equal(document.savedGrade, 'NR');
  assert.equal(document.score, null);
  assert.ok(document.provisionalRating);
  assert.equal(document.provisionalRating!.totalDimensions, 4);
  assert.equal(run.assessment!.grade, 'NR');
});

test('a failed model cannot publish stale narrative; unknown dimensions are not risks', () => {
  const run = fixture();
  run.assessment!.model.status = 'failed';
  run.assessment!.dimensions.find((dimension) => dimension.id === 'cash')!.status = 'unknown';
  const document = deriveCompanyReportDocument(run);
  assert.equal(document.mode, 'rules');
  assert.equal(document.changeConditions.length, 0);
  assert.equal(
    document.questions.some((question) => question.text.zh.includes('这项数据')),
    false
  );
  assert.equal(
    document.risks.some((risk) => risk.id === 'dimension-cash'),
    false
  );
  assert.ok(document.unknowns.some((unknown) => unknown.id === 'unknown-cash'));
  assert.equal(JSON.stringify(document).includes('完整风险原文'), false);
});

test('sources-only observations stay useful without fabricating an AI report or saved rating', () => {
  const run = fixture(false);
  run.assessmentStatus = 'failed';
  run.assessmentError = 'AI 服务未配置';
  const document = deriveCompanyReportDocument(run, 'parent');
  assert.equal(document.mode, 'observations');
  assert.ok(document.summary);
  assert.ok(document.observations.length > 0);
  assert.ok(document.actions.length > 0);
  assert.equal(document.savedGrade, null);
  assert.equal(document.provisionalRating, null);
  assert.equal(document.generatedAt, null);
  assert.equal(document.binding?.reportGeneratedAt, null);
  assert.equal(document.binding?.basis, 'consolidated');
  assert.equal(document.risks.length, 0);
  assert.equal(document.questions.length, 0);
  assert.equal(run.assessment, undefined);
  assert.deepEqual(document, deriveCompanyReportDocument(run, 'parent'));
});

test('source conflicts remain unknown and never borrow another annual year', () => {
  const run = fixture(false);
  run.context!.comparisons.push({
    period: '2025-12-31',
    field: 'ocf',
    primary: '15.00',
    secondary: '25.00',
    difference: '10.00',
    matches: false,
  });
  const document = deriveCompanyReportDocument(run);
  const fact = document.facts.find((fact) => fact.id === '2025-ocf')!;
  assert.equal(fact.value, null);
  assert.equal(fact.status, 'conflict');
  assert.ok(document.unknowns.some((unknown) => unknown.id === 'unknown-cash'));
  assert.equal(document.risks.length, 0);
  run.context!.financials = run.context!.financials.filter((row) => row.period === '2024-12-31');
  const missing = deriveCompanyReportDocument(run);
  assert.equal(missing.summary, null);
  assert.equal(missing.facts.find((fact) => fact.id === '2025-ocf')!.value, null);
});

test('issuer, year, analytical basis, identity, information-gap and unsupported scopes withhold the whole document', () => {
  for (const failure of [
    'issuer',
    'org',
    'year',
    'basis',
    'identity',
    'information-gap',
    'unsupported',
    'source-warning',
  ] as const) {
    const run = fixture();
    if (failure === 'issuer') run.context!.securityCode = '600519';
    if (failure === 'org') run.context!.orgId = 'other-org';
    if (failure === 'year') run.assessment!.year = 2024;
    if (failure === 'basis') run.assessment!.basis = 'parent' as 'consolidated';
    if (failure === 'identity' || failure === 'unsupported')
      run.identity = {
        securityCode: failure === 'identity' ? '600519' : 'MSFT',
        orgId: run.input.orgId,
        companyName: 'Scope test',
        shortName: 'Scope test',
        exchange: failure === 'unsupported' ? 'us' : 'sse',
        sourceUrl: 'https://www.cninfo.com.cn/',
      };
    if (failure === 'information-gap')
      run.informationGap = { name: 'Unmatched', reason: 'Not matched' };
    if (failure === 'source-warning') run.context!.warnings.push('来源主体或机构类型存在冲突');
    const document = deriveCompanyReportDocument(run);
    assert.equal(document.mode, 'none', failure);
    assert.equal(document.summary, null, failure);
    assert.equal(document.binding, null, failure);
    assert.equal(document.savedGrade, null, failure);
    assert.deepEqual(document.facts, [], failure);
    assert.deepEqual(document.actions, [], failure);
    assert.deepEqual(document.questions, [], failure);
    assert.deepEqual(document.references, [], failure);
  }
});

test('references remain directional, exclude unrelated sources and reject unsafe or dangling citations', () => {
  const run = fixture();
  run.assessment!.evidence.push({
    id: 'unrelated',
    label: 'Unused source',
    kind: 'news',
    sourceQuality: 'headline',
    url: 'https://unrelated.example.invalid/',
  });
  run.assessment!.narrative!.risks.push({
    ...block('Invalid citation must be withheld'),
    evidenceIds: ['not-in-this-generation'],
  });
  run.assessment!.evidence.push({
    id: 'unsafe',
    label: 'Unsafe source',
    kind: 'news',
    sourceQuality: 'headline',
    url: 'javascript:alert(1)',
  });
  run.assessment!.narrative!.actions.push({
    ...block('Unsafe citation must be withheld'),
    evidenceIds: ['unsafe'],
  });
  const document = deriveCompanyReportDocument(run);
  assert.equal(
    document.references.some((source) => source.id === 'unrelated'),
    false
  );
  assert.equal(
    document.references.some((source) => source.id === 'unsafe'),
    false
  );
  assert.equal(document.risks.length, 4);
  assert.equal(document.actions.length, 4);
  assert.deepEqual(document.risks[0]!.metricIds, ['2025-ocf']);
  assert.deepEqual(document.risks[0]!.evidenceIds, ['financial-2025-ocf']);
});

test('exact financial facts require their own annual financial provenance', () => {
  for (const failure of [
    'year',
    'opinion',
    'missing-source',
    'invalid-value',
    'duplicate',
  ] as const) {
    const run = fixture();
    const metric = run.assessment!.metrics.find((metric) => metric.id === '2025-ocf')!;
    const source = run.assessment!.evidence.find((source) => source.id === metric.evidenceIds[0])!;
    if (failure === 'year') source.period = '2024-12-31';
    if (failure === 'opinion') source.sourceQuality = 'opinion';
    if (failure === 'missing-source') metric.evidenceIds = [];
    if (failure === 'invalid-value') metric.value = 'not-an-amount';
    if (failure === 'duplicate') run.assessment!.metrics.push(structuredClone(metric));
    const document = deriveCompanyReportDocument(run);
    assert.equal(
      document.facts.some((fact) => fact.id === '2025-ocf'),
      false,
      failure
    );
    assert.equal(document.risks.length, 0, failure);
    assert.equal(document.summary, null, failure);
  }
});

test('returned data is detached from storage and reading never invokes transport', () => {
  const run = fixture();
  const before = structuredClone(run);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('Transport is forbidden in a read model');
  };
  try {
    const document = deriveCompanyReportDocument(run);
    document.actions[0]!.text.zh = 'Locally changed presentation';
    document.facts[0]!.display = ['Changed', 'Changed'];
    document.references[0]!.label = 'Changed';
    assert.equal(calls, 0);
    assert.deepEqual(run, before);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
