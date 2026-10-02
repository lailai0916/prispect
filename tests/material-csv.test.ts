import assert from 'node:assert/strict';
import test from 'node:test';
import { previewUpload } from '../server/import.js';
import { ApiFault } from '../server/validation.js';

test('material CSV rejects duplicate columns rather than overwrite the submitted financial year or value', async () => {
  for (const csv of [
    'company,year,key,value,unit,currency,scope,year\n测试公司,2025,netProfit,100.00,yuan,CNY,consolidated,2023\n',
    'company,year,key,value,unit,currency,scope, value \n测试公司,2025,netProfit,100.00,yuan,CNY,consolidated,50.00\n',
  ]) {
    await assert.rejects(previewUpload(Buffer.from(csv), 'duplicate.csv'), (error: unknown) => {
      assert.ok(error instanceof ApiFault);
      assert.equal(error.status, 400);
      assert.equal(error.code, 'INVALID_CSV');
      assert.match(error.message, /列名重复/);
      return true;
    });
  }
});

test('material CSV rejects extra or missing row cells instead of silently dropping or shifting fields', async () => {
  const header = 'company,year,key,value,unit,currency,scope\n';
  for (const row of [
    '测试公司,2025,netProfit,100.00,yuan,CNY,consolidated,unlisted-value\n',
    '测试公司,2025,netProfit,100.00,yuan,CNY\n',
  ]) {
    await assert.rejects(
      previewUpload(Buffer.from(header + row), 'width.csv'),
      (error: unknown) => {
        assert.ok(error instanceof ApiFault);
        assert.equal(error.status, 400);
        assert.equal(error.code, 'INVALID_CSV');
        assert.match(error.message, /列数不一致/);
        return true;
      }
    );
  }
});

test('material CSV preserves quoted commas, multiline excerpts, blank cells and multiple valid annual periods', async () => {
  const csv =
    '\uFEFFcompany,shortName,year,key,value,unit,currency,scope,period,page,quote,documentDate\r\n' +
    '"测试,公司",测试,2025,netProfit,100.00,yuan,CNY,consolidated,annual,,"利润原文,含逗号\n第二行",2026-01-01\r\n' +
    '"测试,公司",测试,2024,operatingCashFlow,50.00,yuan,CNY,consolidated,annual,2,"现金原文 ""引述""",2026-01-01\r\n';
  const preview = await previewUpload(Buffer.from(csv), 'valid.csv');
  assert.equal(preview.material.company, '测试,公司');
  assert.deepEqual(
    preview.material.observations.map((row) => row.year),
    [2025, 2024]
  );
  assert.equal(preview.material.observations[0]?.page, null);
  assert.equal(preview.material.observations[0]?.quote, '利润原文,含逗号\n第二行');
  assert.equal(preview.material.observations[1]?.quote, '现金原文 "引述"');
});
