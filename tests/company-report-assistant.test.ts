import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyResearchRun } from '../shared/contracts.js';
import type { AssessmentEvidence, AssessmentMetric } from '../shared/company-assessment.js';
import {
  assistantPublicAssessment,
  assistantSavedReportContext,
} from '../server/assistant-report.js';

function reportRun(): CompanyResearchRun {
  const snapshotFetchedAt = '2026-10-03T05:00:00.000Z';
  const metric: AssessmentMetric = {
    id: '2025-ocf',
    label: ['经营现金', 'Operating cash'],
    value: '70.00',
    display: ['70.00 元', 'CNY 70.00'],
    unit: 'CNY',
    status: 'available',
    evidenceIds: ['cash-field'],
    formula: ['网页报表字段', 'Public report field'],
  };
  const source: AssessmentEvidence = {
    id: 'cash-field',
    kind: 'financial',
    label: '公开年度现金流量表',
    url: 'https://www.cninfo.com.cn/new/disclosure',
    period: '2025-12-31',
    sourceQuality: 'web',
  };
  const summary = {
    text: { zh: '经营现金需要结合利润核对。', en: 'Review operating cash together with profit.' },
    metricIds: [metric.id],
    evidenceIds: [source.id],
  };
  return {
    id: 'report-helper-fixture',
    input: { securityCode: '600519', orgId: 'gssh0600519', year: 2025 },
    identity: {
      securityCode: '600519',
      orgId: 'gssh0600519',
      shortName: '贵州茅台',
      companyName: '贵州茅台酒股份有限公司',
      exchange: 'sse',
      sourceUrl: 'https://www.cninfo.com.cn/',
    },
    createdAt: snapshotFetchedAt,
    updatedAt: snapshotFetchedAt,
    status: 'ready',
    trace: [],
    announcements: [],
    model: { requested: false, status: 'not-called' },
    context: {
      version: 1,
      securityCode: '600519',
      orgId: 'gssh0600519',
      companyName: '贵州茅台酒股份有限公司',
      fetchedAt: snapshotFetchedAt,
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
    assessment: {
      version: 1,
      year: 2025,
      basis: 'consolidated',
      snapshotFetchedAt,
      generatedAt: '2026-10-03T05:10:00.000Z',
      grade: 'NR',
      score: null,
      methodologyVersion: 'financial-screen-v1',
      dimensions: [],
      metrics: [metric],
      evidence: [source],
      coverage: {
        fields: 1,
        requiredFields: 13,
        years: 1,
        sources: 1,
        news: 0,
        disclosures: 0,
        excerpts: 0,
        peers: 0,
      },
      gaps: [],
      model: { status: 'completed' },
      narrative: {
        summary,
        dimensions: [],
        strengths: [],
        risks: [],
        actions: [],
        changeConditions: [],
      },
    },
  };
}

test('saved AI reports retain referenced provider and media URLs while excluding invalid URLs and unused sources', () => {
  const run = reportRun();
  const report = run.assessment!;
  const urls = [
    'https://quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport',
    'https://np-anotice-stock.eastmoney.com/api/security/ann',
    'https://data.cninfo.com.cn/new/disclosure',
    'https://www.reuters.com/business/public-company-earnings',
    'https://private:secret@www.cninfo.com.cn/private',
    'javascript:alert(document.cookie)',
    '/api/private-material',
  ];
  report.evidence.push(
    ...urls.map((url, index) => ({
      id: `source-${index}`,
      kind: 'disclosure' as const,
      label: `Disclosed source ${index}`,
      url,
      sourceQuality: 'web' as const,
    }))
  );
  report.narrative!.summary.evidenceIds.push('source-0', 'source-1', 'source-2', 'source-3');
  report.narrative!.risks = urls.slice(4).map((_, index) => ({
    text: { zh: '无效链接不能支撑判断。', en: 'An invalid URL cannot support a judgment.' },
    metricIds: [],
    evidenceIds: [`source-${index + 4}`],
  }));
  report.evidence.push({
    id: 'unused-source',
    kind: 'news',
    label: 'Unused public text',
    url: 'https://www.reuters.com/business/unused-story',
    quote: 'Unused long passage '.repeat(500),
    sourceQuality: 'headline',
  });
  const projected = assistantPublicAssessment(run);
  assert.ok(projected);
  assert.deepEqual(
    projected.evidence.map((source) => source.url),
    [report.evidence[0]!.url, ...urls.slice(0, 4)]
  );
  assert.deepEqual(projected.narrative!.summary, report.narrative!.summary);
  assert.deepEqual(projected.narrative!.risks, []);
  assert.equal(
    report.evidence.length,
    urls.length + 2,
    'Projection never rewrites saved evidence.'
  );
});

test('a report from a different issuer, identity or annual year never enters assistant context', () => {
  for (const mismatch of ['context-code', 'context-org', 'identity-code', 'report-year'] as const) {
    const run = reportRun();
    if (mismatch === 'context-code') run.context!.securityCode = '000651';
    else if (mismatch === 'context-org') run.context!.orgId = 'other-public-org';
    else if (mismatch === 'identity-code') run.identity!.securityCode = '000651';
    else run.assessment!.year = 2024;
    assert.equal(assistantPublicAssessment(run), undefined, mismatch);
    assert.equal(assistantSavedReportContext(run), undefined, mismatch);
  }
});

test('an NR report can explain verified year and field coverage without unavailable financial citations', () => {
  const run = reportRun();
  const report = run.assessment!;
  report.coverage.fields = 0;
  report.metrics = [
    {
      id: 'scope-year',
      label: ['分析年度', 'Analysis year'],
      value: '2025',
      display: ['2025 年', '2025'],
      unit: 'count',
      status: 'available',
      evidenceIds: [],
      formula: ['查询所选年度', 'Selected annual period'],
    },
    {
      id: 'available-field-count',
      label: ['已取得核心字段', 'Available core fields'],
      value: '0',
      display: ['0/13 项', '0/13 fields'],
      unit: 'count',
      status: 'available',
      evidenceIds: [],
      formula: ['所选年度公开字段覆盖', 'Selected-year public-field coverage'],
    },
  ];
  report.evidence = [];
  report.narrative!.summary = {
    text: {
      zh: '当前年度核心字段未取得，公开事件仍可按各自来源继续核对。',
      en: 'Core annual fields are unavailable; public events remain subject to their own sources.',
    },
    metricIds: ['scope-year', 'available-field-count'],
    evidenceIds: [],
  };
  const context = assistantSavedReportContext(run, true);
  assert.ok(context);
  assert.equal(context.grade, 'NR');
  assert.deepEqual(context.summary.metricIds, [
    'report:scope-year',
    'report:available-field-count',
  ]);
  assert.deepEqual(context.evidence, []);
  report.metrics[1]!.value = '13';
  assert.equal(
    assistantPublicAssessment(run),
    undefined,
    'A coverage claim inconsistent with the saved coverage is rejected.'
  );
});

test('report follow-ups bound referenced excerpt text without losing its source identity', () => {
  const run = reportRun();
  const report = run.assessment!;
  const extraSources: AssessmentEvidence[] = Array.from({ length: 18 }, (_, index) => ({
    id: `public-excerpt-${index}`,
    kind: 'disclosure',
    label: `Public disclosure ${index}`,
    url: `https://www.cninfo.com.cn/new/disclosure/${index}`,
    period: '2025-12-31',
    quote: `ACQUIRED-SOURCE-${index}: ` + '公开资料中的完整文本段落。'.repeat(200),
    sourceQuality: 'excerpt',
  }));
  report.evidence.push(...extraSources);
  report.narrative!.dimensions = (
    ['profitability', 'cash', 'solvency', 'workingCapital', 'industry', 'events'] as const
  ).map((dimensionId, index) => ({
    dimensionId,
    text: {
      zh: '本维度判断依据所列公开资料。',
      en: 'The dimension judgment is based on the listed public disclosures.',
    },
    metricIds: [],
    evidenceIds: extraSources.slice(index * 3, index * 3 + 3).map((source) => source.id),
  }));
  report.evidence.push({
    id: 'unreferenced-body',
    kind: 'news',
    label: 'Unused source',
    url: 'https://www.reuters.com/business/unreferenced',
    quote: 'UNREFERENCED-BODY '.repeat(1000),
    sourceQuality: 'headline',
  });
  const original = structuredClone(report);
  const projected = assistantPublicAssessment(run);
  assert.ok(projected);
  const included = new Set(projected.evidence.map((source) => source.id));
  for (const source of extraSources) assert.ok(included.has(source.id), source.id);
  assert.equal(included.has('unreferenced-body'), false);
  const quotes = projected.evidence.map((source) => source.quote || '');
  assert.ok(quotes.some((quote) => quote.length > 0));
  assert.ok(quotes.every((quote) => quote.length <= 1201));
  assert.ok(quotes.reduce((total, quote) => total + quote.length, 0) <= 16000);
  assert.deepEqual(run.assessment, original, 'Context packing never changes the saved report.');
});
