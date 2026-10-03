import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanyResearchRun } from '../shared/contracts';
import {
  CompanyReadingMemory,
  companyReadingScope,
  companyReadingScrollTarget,
  type CompanyReadingPosition,
} from '../src/company-reading-memory';

function run(id = 'record'): CompanyResearchRun {
  return {
    id,
    input: { securityCode: '600519', orgId: 'org', year: 2025 },
    status: 'failed',
    createdAt: '2026-10-03T00:00:00Z',
    updatedAt: '2026-10-03T00:00:00Z',
    trace: [],
    announcements: [],
    model: { requested: true, status: 'not-configured' },
  };
}

const reading: CompanyReadingPosition = {
  scrollY: 900,
  anchor: 'company-full-report',
  offset: -60,
  openDetails: ['company-full-report'],
};

test('report reading restores its data destination and optional company details in the same scope', () => {
  const memory = new CompanyReadingMemory();
  const scope = companyReadingScope('alice', run());
  memory.enter(scope);
  const position: CompanyReadingPosition = {
    scrollY: 1280,
    anchor: 'company-report-details',
    offset: -52,
    openDetails: ['company-financial-findings-details', 'company-report-company-info'],
  };
  assert.equal(memory.save(scope, 'overview', position), true);
  assert.deepEqual(memory.read(scope, 'overview'), position);
  assert.equal(memory.save(scope, 'trends', position), false);
  memory.changeOwner('bob');
  assert.equal(memory.read(scope, 'overview'), null);
});

test('company reading scopes bind issuer, org, annual year and acquired snapshots, not polling status', () => {
  const original = run();
  const scope = companyReadingScope('alice', original);
  assert.deepEqual(
    companyReadingScope('alice', { ...original, status: 'running', updatedAt: 'later' }),
    scope
  );
  for (const input of [
    { ...original.input, year: 2024 },
    { ...original.input, securityCode: '300893' },
    { ...original.input, orgId: 'another-org' },
  ]) {
    assert.notEqual(companyReadingScope('alice', { ...original, input }).snapshot, scope.snapshot);
  }
  const context = {
    securityCode: original.input.securityCode,
    orgId: original.input.orgId,
    fetchedAt: 'first-snapshot',
  } as NonNullable<CompanyResearchRun['context']>;
  const withContext = companyReadingScope('alice', { ...original, context });
  assert.notEqual(withContext.snapshot, scope.snapshot);
  assert.notEqual(
    companyReadingScope('alice', {
      ...original,
      context: { ...context, fetchedAt: 'new-snapshot' },
    }).snapshot,
    withContext.snapshot
  );
  const assessment = {
    year: 2025,
    snapshotFetchedAt: context.fetchedAt,
    generatedAt: 'first-analysis',
  } as NonNullable<CompanyResearchRun['assessment']>;
  const withAssessment = companyReadingScope('alice', { ...original, context, assessment });
  assert.notEqual(
    companyReadingScope('alice', {
      ...original,
      context,
      assessment: { ...assessment, generatedAt: 'new-analysis' },
    }).snapshot,
    withAssessment.snapshot
  );
});

test('round trips retain only the owning record and section; snapshot changes discard prior disclosures', () => {
  const memory = new CompanyReadingMemory();
  const a = companyReadingScope('alice', run('a'));
  const b = companyReadingScope('alice', run('b'));
  memory.enter(a);
  assert.equal(memory.save(a, 'overview', reading), true);
  assert.equal(memory.read(a, 'financial'), null);
  memory.enter(b);
  assert.equal(memory.read(b, 'overview'), null);
  memory.enter(a);
  assert.deepEqual(memory.read(a, 'overview'), reading);
  const refreshed = { ...a, snapshot: 'new-source-snapshot' };
  memory.enter(refreshed);
  assert.equal(memory.read(refreshed, 'overview'), null);
  assert.equal(memory.save(a, 'overview', reading), false);
  memory.enter(a);
  assert.equal(memory.read(a, 'overview'), null);
});

test('logout and account changes clear memory even when returning to the same account', () => {
  const memory = new CompanyReadingMemory();
  const a = companyReadingScope('alice', run());
  memory.enter(a);
  memory.save(a, 'overview', reading);
  memory.changeOwner(null);
  assert.equal(memory.save(a, 'overview', reading), false);
  memory.enter(a);
  assert.equal(memory.read(a, 'overview'), null);
  memory.save(a, 'overview', reading);
  const b = companyReadingScope('bob', run());
  memory.enter(b);
  assert.equal(memory.read(a, 'overview'), null);
  assert.equal(memory.read(b, 'overview'), null);
  assert.equal(memory.save(a, 'overview', reading), false);
  memory.enter(a);
  assert.equal(memory.read(a, 'overview'), null);
});

test('reading memory evicts least recently used sections and bounds retained record identities', () => {
  const memory = new CompanyReadingMemory(2);
  const a = companyReadingScope('alice', run('a'));
  const b = companyReadingScope('alice', run('b'));
  const c = companyReadingScope('alice', run('c'));
  memory.enter(a);
  memory.save(a, 'overview', reading);
  memory.enter(b);
  memory.save(b, 'overview', reading);
  memory.read(a, 'overview');
  memory.save(b, 'financial', {
    ...reading,
    anchor: 'company-industry',
    openDetails: ['company-industry'],
  });
  assert.deepEqual(memory.read(a, 'overview'), reading);
  assert.equal(memory.read(b, 'overview'), null);
  memory.enter(c);
  assert.equal(memory.read(a, 'overview'), null);
  assert.equal(memory.save(a, 'overview', reading), false);
});

test('invalid or foreign element positions cannot replace a usable saved position', () => {
  const memory = new CompanyReadingMemory();
  const scope = companyReadingScope('alice', run());
  memory.enter(scope);
  memory.save(scope, 'overview', reading);
  for (const candidate of [
    { ...reading, scrollY: NaN },
    { ...reading, scrollY: -1 },
    { ...reading, scrollY: Infinity },
    { ...reading, offset: -Infinity },
    { ...reading, anchor: 'account-email' },
    { ...reading, openDetails: ['private-plan-input'] },
    { ...reading, anchor: 'company-industry' },
  ]) {
    assert.equal(memory.save(scope, 'overview', candidate), false);
    assert.deepEqual(memory.read(scope, 'overview'), reading);
  }
  const read = memory.read(scope, 'overview')!;
  read.openDetails.push('outside-mutation');
  assert.deepEqual(memory.read(scope, 'overview'), reading);
});

test('reading restoration follows a stable anchor and clamps after viewport or document size changes', () => {
  assert.equal(companyReadingScrollTarget(reading, 1400, 3000), 1340);
  assert.equal(companyReadingScrollTarget(reading, null, 3000), 900);
  assert.equal(companyReadingScrollTarget(reading, 1400, 600), 600);
  assert.equal(companyReadingScrollTarget(reading, 20, 3000), 0);
  assert.equal(companyReadingScrollTarget(reading, null, -300), 0);
  assert.equal(companyReadingScrollTarget(reading, null, NaN), 0);
});
