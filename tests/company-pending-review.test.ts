import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { deriveCompanyAssessment, type AssessmentJudgment } from '../shared/company-assessment.js';
import { companyPendingReview } from '../shared/company-pending-review.js';

const fetchedAt = '2026-10-02T00:00:00.000Z';
const updatedAt = '2026-10-03T00:00:00.000Z';
const action = (id: number): AssessmentJudgment => ({
  text: { zh: `核对事项 ${id}`, en: `Follow-up ${id}` },
  metricIds: [],
  evidenceIds: [],
});

function fixture(): CompanyResearchRun {
  const run: CompanyResearchRun = {
    id: 'pending-review-fixture',
    input: { securityCode: '300893', orgId: 'fixture-org', year: 2025, useModel: true },
    status: 'ready',
    createdAt: fetchedAt,
    updatedAt: fetchedAt,
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-called' },
    contextStatus: 'ready',
    assessmentStatus: 'ready',
    context: {
      version: 1,
      securityCode: '300893',
      orgId: 'fixture-org',
      companyName: '待核清单测试公司',
      fetchedAt,
      status: 'partial',
      financials: [],
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
  run.assessment.model.status = 'completed';
  run.assessment.narrative = {
    summary: action(0),
    dimensions: [],
    strengths: [],
    risks: Array.from({ length: 8 }, (_, index) => action(index)),
    actions: Array.from({ length: 4 }, (_, index) => action(index + 1)),
    changeConditions: [],
  };
  return run;
}

test('the count is exactly the selected report actions, without summing risks or source gaps', () => {
  const run = fixture();
  run.assessment!.coverage.news = 900;
  run.assessment!.coverage.fields = 0;
  run.assessment!.gaps = Array.from({ length: 9 }, () => ['缺少材料', 'Missing records']);
  const before = JSON.stringify(run);
  const result = companyPendingReview(run);
  assert.equal(result.count, 3, 'the brief selects three actions, not every possible gap');
  assert.deepEqual(
    result.items.map((item) => item.judgment.text.zh),
    ['核对事项 1', '核对事项 2', '核对事项 3']
  );
  assert.equal(JSON.stringify(run), before, 'reading the checklist never changes saved ratings');
});

test('only actual same-report metrics or evidence expose the evidence drawer', () => {
  const run = fixture();
  const actions = run.assessment!.narrative!.actions;
  actions[0]!.metricIds = [run.assessment!.metrics[0]!.id];
  actions[1]!.metricIds = ['another-snapshot-metric'];
  actions[1]!.evidenceIds = ['another-snapshot-source'];
  run.assessment!.evidence.push({
    id: 'this-snapshot-source',
    kind: 'disclosure',
    label: '本份资料',
    url: 'https://example.com/fixture.pdf',
    sourceQuality: 'excerpt',
  });
  actions[2]!.evidenceIds = ['this-snapshot-source'];
  assert.deepEqual(
    companyPendingReview(run).items.map((item) => item.hasEvidence),
    [true, false, true]
  );
});

test('issuer and annual-scope mismatches never expose the saved follow-up text', () => {
  const changes: ((run: CompanyResearchRun) => void)[] = [
    (run) => (run.context!.securityCode = '600519'),
    (run) => (run.context!.orgId = 'another-org'),
    (run) => (run.assessment!.year = 2024),
    (run) => Object.assign(run.assessment!, { basis: 'parent' }),
    (run) => {
      run.informationGap = { name: '主体未确认', reason: 'unsupported-market' };
    },
  ];
  for (const change of changes) {
    const run = fixture();
    change(run);
    assert.deepEqual(companyPendingReview(run), {
      count: null,
      previous: false,
      snapshotFetchedAt: null,
      items: [],
    });
  }
});

test('a refresh retains the old report actions and labels the original snapshot date', () => {
  const run = fixture();
  run.context!.fetchedAt = updatedAt;
  run.assessmentStatus = 'loading';
  const result = companyPendingReview(run);
  assert.equal(result.previous, true);
  assert.equal(result.snapshotFetchedAt, fetchedAt);
  assert.equal(result.items[0]!.judgment.text.zh, '核对事项 1');
  run.assessmentStatus = 'failed';
  assert.equal(companyPendingReview(run).previous, true);
});

test('missing reports have an unknown count; an empty action list is not invented risk coverage', () => {
  const run = fixture();
  run.assessment!.narrative!.actions = [];
  assert.equal(companyPendingReview(run).count, 0);
  assert.deepEqual(companyPendingReview(run).items, []);
  delete run.assessment;
  assert.equal(companyPendingReview(run).count, null);
  assert.deepEqual(companyPendingReview(run).items, []);
});

test('an unrecorded snapshot date remains unknown instead of using the current retrieval date', () => {
  const run = fixture();
  run.assessment!.snapshotFetchedAt = 'not-recorded';
  run.context!.fetchedAt = updatedAt;
  assert.equal(companyPendingReview(run).snapshotFetchedAt, null);
});
