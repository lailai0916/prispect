import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Material } from '../shared/contracts.js';
import { analyze } from '../server/engine.js';

test('SEC USD material produces a two-step bridge', () => {
  const material = {
    id: 't1',
    company: 'Apple Inc.',
    shortName: 'Apple Inc.',
    title: 'Apple Inc. 2025 年度 10-K（SEC EDGAR）',
    filename: '10-K-2025-AAPL.htm',
    origin: 'public-report',
    documentDate: '2025-10-31',
    sourceUrl:
      'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm',
    sha256: 'a'.repeat(64),
    createdAt: new Date().toISOString(),
    observations: [
      {
        id: 'o1',
        key: 'netProfit',
        year: 2025,
        period: 'annual',
        value: '112010000000',
        unit: 'usd',
        currency: 'USD',
        scope: 'consolidated',
        page: null,
        quote: 'SEC XBRL',
        kind: 'reported',
      },
      {
        id: 'o2',
        key: 'operatingCashFlow',
        year: 2025,
        period: 'annual',
        value: '111482000000',
        unit: 'usd',
        currency: 'USD',
        scope: 'consolidated',
        page: null,
        quote: 'SEC XBRL',
        kind: 'reported',
      },
    ],
    notes: [],
    excerpts: [],
  } as Material;
  const report = analyze(
    {
      title: 'x',
      company: 'Apple Inc.',
      year: 2025,
      materialIds: ['t1'],
      purpose: 'external',
      useModel: true,
    },
    [material]
  );
  const net = report.metrics.find((m) => m.key === 'netProfit');
  assert.equal(net?.unit, 'USD');
  assert.equal(net?.value, '112010000000.00');
  const ratio = report.metrics.find((m) => m.key === 'cashConversion');
  assert.equal(ratio?.value, '99.53');
  assert.equal(report.bridge?.length, 2);
  assert.equal(report.bridge?.[0]?.key, 'netProfit');
  assert.equal(report.bridge?.[1]?.key, 'operatingCashFlow');
});
