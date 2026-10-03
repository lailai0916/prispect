import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanyResearchRun } from '../shared/contracts';
import {
  CompanyChartSelectionMemory,
  companyChartSelectionScope,
} from '../src/company-chart-selection';

const run = {
  id: 'record',
  input: { securityCode: '600519', orgId: 'org', year: 2025 },
  context: { securityCode: '600519', orgId: 'org', fetchedAt: 'before' },
} as CompanyResearchRun;

test('manual annual chart selection survives routes and same-record source refreshes', () => {
  const memory = new CompanyChartSelectionMemory();
  const scope = companyChartSelectionScope(run);
  assert.equal(memory.read('alice', scope), null);
  assert.equal(memory.save('alice', scope, '2023-12-31'), true);
  const refreshed = {
    ...run,
    context: { ...run.context!, fetchedAt: 'after' },
    updatedAt: 'after',
  };
  assert.equal(companyChartSelectionScope(refreshed), scope);
  assert.equal(memory.read('alice', companyChartSelectionScope(refreshed)), '2023-12-31');
  for (const other of [
    { ...run, id: 'another-record' },
    { ...run, input: { ...run.input, year: 2024 } },
    { ...run, input: { ...run.input, securityCode: '000001' } },
    { ...run, input: { ...run.input, orgId: 'another-org' } },
    { ...run, context: { ...run.context!, orgId: 'another-source' } },
  ])
    assert.equal(memory.read('alice', companyChartSelectionScope(other)), null);
});

test('owner changes clear chart choices and reject late writes from the old owner', () => {
  const memory = new CompanyChartSelectionMemory();
  const scope = companyChartSelectionScope(run);
  memory.read('alice', scope);
  memory.save('alice', scope, '2023-12-31');
  assert.equal(memory.read('bob', scope), null);
  assert.equal(memory.save('alice', scope, '2024-12-31'), false);
  assert.equal(memory.save('bob', scope, '2025-12-31'), true);
  assert.equal(memory.read('alice', scope), null);
});

test('chart memory retains a bounded recent set and only accepts annual period choices', () => {
  const memory = new CompanyChartSelectionMemory(2);
  memory.read('alice', 'a');
  assert.equal(memory.save('alice', 'a', '2024-06-30'), false);
  memory.save('alice', 'a', '2022-12-31');
  memory.save('alice', 'b', '2023-12-31');
  memory.read('alice', 'a');
  memory.save('alice', 'c', '2024-12-31');
  assert.equal(memory.read('alice', 'b'), null);
  assert.equal(memory.read('alice', 'a'), '2022-12-31');
  assert.equal(memory.read('alice', 'c'), '2024-12-31');
});
