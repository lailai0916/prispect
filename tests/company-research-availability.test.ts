import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { deriveCompanyAssessment } from '../shared/company-assessment.js';
import { companyResearchAvailability } from '../shared/company-research-availability.js';
import { contextAmountFields, type CompanyContextPeriod } from '../shared/company-workspace.js';

const fetchedAt = '2026-10-02T00:00:00.000Z';
const activeAt = '2026-10-03T01:00:00.000Z';

function fixture(): CompanyResearchRun {
  const period: CompanyContextPeriod = {
    period: '2025-12-31',
    annual: true,
    noticeDate: null,
    amounts: Object.fromEntries(
      contextAmountFields.map((field) => [field, null])
    ) as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: null, roe: null, revenueGrowth: null },
    auditOpinion: null,
    fieldSources: {},
    sourceUrls: [],
    originalUrl: null,
  };
  const run: CompanyResearchRun = {
    id: 'availability-fixture',
    input: { securityCode: '300893', orgId: 'fixture-org', year: 2025, useModel: true },
    status: 'ready',
    createdAt: fetchedAt,
    updatedAt: fetchedAt,
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-called' },
    contextStatus: 'ready',
    contextRevision: 2,
    assessmentStatus: 'ready',
    assessmentRevision: 4,
    context: {
      version: 1,
      securityCode: '300893',
      orgId: 'fixture-org',
      companyName: '资料可用性测试公司',
      fetchedAt,
      status: 'partial',
      financials: [period],
      sources: [],
      comparisons: [],
      profile: {},
      shareholders: [],
      announcements: [],
      news: [],
      discussions: [],
      verificationLinks: [],
      warnings: [],
    },
  };
  run.assessment = deriveCompanyAssessment(run);
  return run;
}

test('a failed source refresh retains acquired data and the report actual snapshot date', () => {
  const run = fixture();
  run.contextStatus = 'failed';
  run.context!.fetchedAt = activeAt;
  const before = JSON.stringify(run);
  const available = companyResearchAvailability(run);
  assert.equal(available.failed, true);
  assert.equal(available.active, false);
  assert.equal(available.hasFinancials, true);
  assert.equal(available.hasSources, true);
  assert.equal(available.sourceFetchedAt, activeAt);
  assert.equal(available.reportSnapshotAt, fetchedAt);
  assert.equal(available.canCancel, false);
  assert.deepEqual(available.cancelRevisions, {});
  assert.equal(JSON.stringify(run), before, 'availability never changes a saved report');
});

test('only active public phases with known safe revisions can be cancelled', () => {
  const run = fixture();
  run.contextStatus = 'loading';
  run.assessmentStatus = 'loading';
  let available = companyResearchAvailability(run);
  assert.equal(available.canCancel, true);
  assert.deepEqual(available.cancelRevisions, { contextRevision: 2, assessmentRevision: 4 });
  for (const invalid of [undefined, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    run.contextRevision = invalid;
    run.assessmentRevision = invalid;
    available = companyResearchAvailability(run);
    assert.equal(available.active, true);
    assert.equal(available.canCancel, false);
    assert.deepEqual(available.cancelRevisions, {});
  }
  run.contextRevision = 0;
  assert.deepEqual(companyResearchAvailability(run).cancelRevisions, { contextRevision: 0 });
  run.contextStatus = 'ready';
  run.assessmentStatus = 'ready';
  run.status = 'running';
  assert.equal(companyResearchAvailability(run).canCancel, false, 'original job is separate');
});

test('source refresh never borrows an earlier analysis trace as new activity', () => {
  const run = fixture();
  run.contextStatus = 'loading';
  run.assessmentStatus = 'failed';
  run.assessmentTrace = [
    {
      id: 'old',
      tool: 'review',
      label: '旧轮次',
      status: 'failed',
      startedAt: fetchedAt,
      finishedAt: activeAt,
      summary: '旧轮次结束',
    },
  ];
  assert.equal(companyResearchAvailability(run).lastActivityAt, null);
  run.contextStatus = 'ready';
  run.assessmentStatus = 'loading';
  run.assessmentTrace = [];
  assert.equal(companyResearchAvailability(run).lastActivityAt, null);
  run.assessmentTrace = [
    {
      id: 'current',
      tool: 'synthesize',
      label: '当前轮次',
      status: 'running',
      startedAt: activeAt,
      summary: '正在读取',
    },
    {
      id: 'invalid-date',
      tool: 'review',
      label: '无日期',
      status: 'running',
      startedAt: 'unknown',
      summary: '没有可用时间',
    },
  ];
  assert.equal(companyResearchAvailability(run).lastActivityAt, activeAt);
});

test('mismatched scope withholds source links, dates and cancellation actions', () => {
  const run = fixture();
  run.contextStatus = 'loading';
  run.context!.orgId = 'another-issuer';
  let available = companyResearchAvailability(run);
  assert.equal(available.hasSources, false);
  assert.equal(available.hasFinancials, false);
  assert.equal(available.sourceFetchedAt, null);
  assert.equal(available.reportSnapshotAt, null);
  assert.equal(available.canCancel, false);
  run.context!.orgId = run.input.orgId;
  run.assessment!.year = 2024;
  available = companyResearchAvailability(run);
  assert.equal(available.hasSources, false);
  assert.equal(available.canCancel, false);
});

test('an empty acquired catalog remains empty and invalid dates stay unknown', () => {
  const run = fixture();
  run.context!.financials = [];
  run.context!.fetchedAt = 'unrecorded';
  run.assessment!.snapshotFetchedAt = 'unrecorded';
  const available = companyResearchAvailability(run);
  assert.equal(available.hasFinancials, false);
  assert.equal(available.hasSources, false);
  assert.equal(available.sourceFetchedAt, null);
  assert.equal(available.reportSnapshotAt, null);
  run.context!.sources.push({
    id: 'receipt',
    provider: '测试来源',
    dimension: '公告',
    url: 'https://www.cninfo.com.cn/',
    status: 'error',
    fetchedAt,
    latestDate: null,
    count: 0,
    note: '取得失败',
    responseHashes: [],
  });
  assert.equal(
    companyResearchAvailability(run).hasSources,
    true,
    'recorded failed receipt is inspectable'
  );
});
