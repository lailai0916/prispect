import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanyRecordSummary } from '../shared/company-workspace.js';
import {
  companyNavigationSections,
  companyNavigationItems,
  companyRecordsByCreation,
  selectCompanyNavigationTarget,
} from '../shared/company-navigation.js';

function record(id: string, createdAt: string, updatedAt?: string): CompanyRecordSummary {
  return {
    id,
    name: id,
    input: { securityCode: id, orgId: id, year: 2025 },
    status: 'completed',
    createdAt,
    updatedAt,
  };
}
const older = record('older', '2026-09-01T00:00:00.000Z', '2026-10-03T00:00:00.000Z');
const newest = record('newest', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');

test('fixed company destinations include every F page in the same order', () => {
  assert.deepEqual(
    companyNavigationSections.map(([id]) => id),
    ['overview', 'trends', 'industry', 'disclosures', 'profile', 'coverage', 'sources']
  );
  assert.deepEqual(
    companyNavigationItems.map(([id]) => id),
    ['overview', 'trends', 'industry', 'disclosures', 'profile', 'coverage', 'sources']
  );
});

test('an owned current company overrides creation recency and retains encoded IDs', () => {
  assert.equal(selectCompanyNavigationTarget('/company?run=older', [newest, older]), older);
  const encoded = record('record/with spaces', older.createdAt);
  assert.equal(
    selectCompanyNavigationTarget('/company?run=record%2Fwith+spaces&section=industry#chart', [
      newest,
      encoded,
    ]),
    encoded
  );
});

test('query, research and private routes use the newest query instead of the last viewed record', () => {
  for (const route of [
    '/query',
    '/research',
    '/materials?run=older',
    '/workspace',
    '/tasks/report',
    '/decisions',
    '/compare',
    '/account',
    '/company?run=missing',
    '/company',
  ])
    assert.equal(selectCompanyNavigationTarget(route, [older, newest]), newest, route);
  const input = [older, newest];
  assert.deepEqual(companyRecordsByCreation(input), [newest, older]);
  assert.deepEqual(input, [older, newest]);
});

test('account changes and deletion never retain an ID absent from the current records', () => {
  const route = '/company?run=older&section=coverage';
  assert.equal(selectCompanyNavigationTarget(route, []), null);
  assert.equal(selectCompanyNavigationTarget('/query', []), null);
  const nextOwner = record('next-owner', '2026-09-02T00:00:00.000Z');
  assert.equal(selectCompanyNavigationTarget(route, [nextOwner]), nextOwner);
  assert.equal(selectCompanyNavigationTarget(route, [newest]), newest);
});
