import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findReusableCompanyRun,
  matchesCompanyRunScope,
  type ReusableCompanyRun,
} from '../shared/company-run-reuse.js';

const scope = {
  securityCode: '600519',
  orgId: 'gssh0600519',
  year: 2025,
  purpose: 'external' as const,
};
const record = (id: string, overrides: Partial<ReusableCompanyRun> = {}): ReusableCompanyRun => ({
  id,
  input: { ...scope },
  createdAt: '2026-10-02T00:00:00.000Z',
  ...overrides,
});

test('repeat research matches issuer, organization, annual period and review purpose', () => {
  const existing = record('same-scope');
  assert.equal(findReusableCompanyRun([existing], scope), existing);
  for (const changed of [
    { securityCode: '000001' },
    { orgId: 'differentOrg' },
    { year: 2024 },
    { purpose: 'handover' as const },
  ])
    assert.equal(findReusableCompanyRun([existing], { ...scope, ...changed }), undefined);
  assert.equal(
    matchesCompanyRunScope(record('legacy', { input: { ...scope, purpose: undefined } }), scope),
    true
  );
  assert.equal(
    matchesCompanyRunScope(record('legacy', { input: { ...scope, purpose: undefined } }), {
      ...scope,
      purpose: 'handover',
    }),
    false
  );
});

test('gaps, unsupported and conflicting resolved identities cannot reuse a record', () => {
  assert.equal(
    findReusableCompanyRun([record('gap', { informationGap: { name: '茅台店' } })], scope),
    undefined
  );
  assert.equal(
    findReusableCompanyRun([record('gap-summary', { informationGap: true })], scope),
    undefined
  );
  for (const identity of [
    { securityCode: scope.securityCode, orgId: scope.orgId, exchange: 'us' as const },
    { securityCode: '000001', orgId: scope.orgId, exchange: 'sse' as const },
    { securityCode: scope.securityCode, orgId: 'wrong', exchange: 'sse' as const },
  ])
    assert.equal(findReusableCompanyRun([record('wrong', { identity })], scope), undefined);
  assert.equal(
    findReusableCompanyRun([record('unsupported')], { ...scope, securityCode: 'AAPL' }),
    undefined
  );
});

test('saved sources or reports take precedence over a later empty duplicate without mutating lists', () => {
  const saved = record('saved', { context: {}, updatedAt: '2026-10-02T01:00:00.000Z' });
  const empty = record('empty', { updatedAt: '2026-10-03T00:00:00.000Z' });
  const records = [empty, saved];
  assert.equal(findReusableCompanyRun(records, scope), saved);
  assert.deepEqual(records, [empty, saved]);
  const newer = record('newer-saved', { result: {}, updatedAt: '2026-10-03T01:00:00.000Z' });
  assert.equal(findReusableCompanyRun([saved, newer], scope), newer);
});

test('deleted records have no implicit resurrection or fallback to another year', () => {
  assert.equal(findReusableCompanyRun([], scope), undefined);
  assert.equal(
    findReusableCompanyRun([record('another-year', { input: { ...scope, year: 2024 } })], scope),
    undefined
  );
});

test('financial and original-document research never reuse one another; mode-less history remains deep', () => {
  const legacy = record('legacy', { context: {} });
  const deep = record('deep', { input: { ...scope, researchMode: 'deep' }, context: {} });
  const financial = record('financial', {
    input: { ...scope, researchMode: 'financial' },
    context: {},
  });
  assert.equal(
    findReusableCompanyRun([legacy, deep], { ...scope, researchMode: 'financial' }),
    undefined
  );
  assert.equal(findReusableCompanyRun([financial], { ...scope, researchMode: 'deep' }), undefined);
  assert.equal(findReusableCompanyRun([financial], scope), undefined);
  assert.equal(findReusableCompanyRun([legacy], { ...scope, researchMode: 'deep' }), legacy);
  assert.equal(
    findReusableCompanyRun([deep, financial], { ...scope, researchMode: 'financial' }),
    financial
  );
});
