import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanyResearchRun } from '../shared/contracts.js';
import { isOlderCompanyRunSnapshot } from '../shared/company-run-snapshot.js';

function fixture(): CompanyResearchRun {
  return {
    id: 'owned-research',
    input: {
      securityCode: '600519',
      orgId: 'org-600519',
      year: 2025,
      purpose: 'external',
      researchMode: 'financial',
    },
    createdAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
    status: 'ready',
    trace: [],
    announcements: [],
    model: { requested: false, status: 'not-requested' },
    contextRevision: 2,
    contextStatus: 'ready',
    assessmentRevision: 3,
    assessmentStatus: 'ready',
    context: {
      version: 1,
      securityCode: '600519',
      orgId: 'org-600519',
      companyName: 'Synthetic snapshot only',
      fetchedAt: '2026-10-03T01:00:00.000Z',
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
  };
}
test('later source revisions supersede old analysis and older source revisions never replace acquired data', () => {
  const previous = fixture();
  const newer = structuredClone(previous);
  newer.contextRevision = 3;
  newer.contextStatus = 'loading';
  newer.assessmentRevision = 1;
  assert.equal(isOlderCompanyRunSnapshot(newer, previous), false);
  assert.equal(isOlderCompanyRunSnapshot(previous, newer), true);
});
test('one source revision can publish progressive data but late old timestamps and loading cannot roll it back', () => {
  const previous = fixture();
  const older = structuredClone(previous);
  older.context!.fetchedAt = '2026-10-03T00:00:00.000Z';
  assert.equal(isOlderCompanyRunSnapshot(older, previous), true);
  assert.equal(isOlderCompanyRunSnapshot(previous, older), false);
  const loading = structuredClone(previous);
  loading.contextStatus = 'loading';
  assert.equal(isOlderCompanyRunSnapshot(loading, previous), true);
  const completed = structuredClone(loading);
  completed.contextStatus = 'failed';
  assert.equal(isOlderCompanyRunSnapshot(completed, loading), false);
});
test('reanalysis loading and cancellation require a new revision; completed and failed results are preserved', () => {
  const previous = fixture();
  const next = structuredClone(previous);
  next.assessmentStatus = 'loading';
  assert.equal(isOlderCompanyRunSnapshot(next, previous), true);
  next.assessmentRevision = 4;
  assert.equal(isOlderCompanyRunSnapshot(next, previous), false);
  next.assessmentStatus = 'failed';
  assert.equal(isOlderCompanyRunSnapshot(previous, next), true);
  const completed = structuredClone(next);
  completed.assessmentStatus = 'ready';
  assert.equal(isOlderCompanyRunSnapshot(completed, next), false);
});
test('legacy records use actual acquisition dates and missing revisions cannot roll back a known generation', () => {
  const previous = fixture();
  const older = structuredClone(previous);
  delete older.contextRevision;
  delete older.assessmentRevision;
  assert.equal(isOlderCompanyRunSnapshot(older, previous), true);
  delete previous.contextRevision;
  delete previous.assessmentRevision;
  older.context!.fetchedAt = '2026-10-03T00:00:00.000Z';
  assert.equal(isOlderCompanyRunSnapshot(older, previous), true);
  older.context!.fetchedAt = 'not a recorded date';
  assert.equal(isOlderCompanyRunSnapshot(older, previous), false);
});
test('different records and scopes do not borrow each other’s generation ordering, and comparison never mutates evidence', () => {
  const previous = fixture();
  const before = structuredClone(previous);
  for (const change of [
    (next: CompanyResearchRun) => {
      next.id = 'other';
    },
    (next: CompanyResearchRun) => {
      next.input.securityCode = '000001';
    },
    (next: CompanyResearchRun) => {
      next.input.orgId = 'other';
    },
    (next: CompanyResearchRun) => {
      next.input.year = 2024;
    },
    (next: CompanyResearchRun) => {
      next.input.purpose = 'handover';
    },
    (next: CompanyResearchRun) => {
      next.input.researchMode = 'deep';
    },
  ]) {
    const next = structuredClone(previous);
    next.contextRevision = 1;
    change(next);
    const saved = structuredClone(next);
    assert.equal(isOlderCompanyRunSnapshot(next, previous), false);
    assert.deepEqual(next, saved);
  }
  assert.deepEqual(previous, before);
});
