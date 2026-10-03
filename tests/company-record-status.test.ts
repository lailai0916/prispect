import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanyRecordSummary } from '../shared/company-workspace.js';
import { financialRecordState, hasSavedCompanyRecord } from '../shared/company-record-status.js';

const financial: CompanyRecordSummary = {
  id: 'financial',
  input: { securityCode: '600519', orgId: 'issuer', year: 2025, researchMode: 'financial' },
  name: 'Company',
  status: 'ready',
  contextStatus: 'ready',
  createdAt: '2026-10-03T00:00:00.000Z',
};

test('saved financial sources count as saved records without an assessment or grade', () => {
  assert.deepEqual(financialRecordState(financial), ['财务资料已保存', 'Financial data saved']);
  assert.equal(hasSavedCompanyRecord(financial), true);
  assert.equal(financial.result, undefined);
  for (const contextStatus of ['loading', 'failed', undefined]) {
    const pending = { ...financial, contextStatus };
    assert.equal(hasSavedCompanyRecord(pending), false);
  }
  assert.equal(hasSavedCompanyRecord({ ...financial, informationGap: true }), false);
});

test('deep and historical records retain original-review state rather than financial completion', () => {
  for (const researchMode of ['deep', undefined] as const) {
    const original = { ...financial, input: { ...financial.input, researchMode } };
    assert.equal(financialRecordState(original), null);
    assert.equal(hasSavedCompanyRecord(original), false);
  }
  const failed = { ...financial, status: 'failed', contextStatus: 'failed' };
  assert.deepEqual(financialRecordState(failed), ['财务资料未完成', 'Financial data incomplete']);
  const withAssessment: CompanyRecordSummary = {
    ...financial,
    input: { ...financial.input, researchMode: 'deep' },
    result: {
      grade: 'NR',
      score: null,
      statement: { zh: '字段缺失，暂不评级。', en: 'Missing fields; grade withheld.' },
      asOf: financial.createdAt,
      stale: false,
      modelStatus: 'not-configured',
    },
  };
  assert.equal(hasSavedCompanyRecord(withAssessment), true);
});
