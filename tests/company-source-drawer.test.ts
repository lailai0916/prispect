import assert from 'node:assert/strict';
import test from 'node:test';
import {
  companyEvidenceComparisons,
  companyEvidenceSourceUrls,
} from '../shared/company-source-evidence.js';
import {
  contextAmountFields,
  type CompanyContextPeriod,
  type CompanyContextSnapshot,
} from '../shared/company-workspace.js';

const emIncome =
  'https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_F10_FINANCE_GINCOME&filter=300893';
const emCash =
  'https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_F10_FINANCE_GCASHFLOW&filter=300893';
const sinaIncome =
  'https://quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport2022?paperCode=sz300893&source=lrb';
const sinaCash =
  'https://quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport2022?paperCode=sz300893&source=llb';

function period(year: number): CompanyContextPeriod {
  return {
    period: `${year}-12-31`,
    annual: true,
    noticeDate: null,
    amounts: Object.fromEntries(
      contextAmountFields.map((field) => [field, null])
    ) as CompanyContextPeriod['amounts'],
    ratios: { grossMargin: null, roe: null, revenueGrowth: null },
    auditOpinion: null,
    fieldSources: {},
    sourceUrls: [emIncome, emCash, sinaIncome, sinaCash],
    originalUrl: null,
  };
}

function snapshot(): CompanyContextSnapshot {
  return {
    version: 1,
    securityCode: '300893',
    orgId: 'fixture-org',
    companyName: '来源核对测试公司',
    fetchedAt: '2026-10-03T00:00:00.000Z',
    status: 'partial',
    financials: [period(2024), period(2025)],
    sources: [],
    comparisons: [
      {
        period: '2024-12-31',
        field: 'ocf',
        primary: '30000.00',
        secondary: '60000.00',
        difference: '-30000.00',
        matches: false,
      },
      {
        period: '2025-12-31',
        field: 'revenue',
        primary: '900719925474099300000.01',
        secondary: '900719925474099399999.02',
        difference: '-99999.01',
        matches: false,
      },
      {
        period: '2025-12-31',
        field: 'parentProfit',
        primary: '90000.00',
        secondary: '90000.01',
        difference: '-0.01',
        matches: true,
      },
    ],
    profile: {},
    shareholders: [],
    announcements: [],
    news: [],
    verificationLinks: [],
    warnings: [],
  };
}

test('the source drawer only compares selected fields in selected periods', () => {
  const source = snapshot();
  const checks = companyEvidenceComparisons(source, [source.financials[1]], ['ocf', 'revenue']);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].field, 'revenue');
  assert.equal(checks[0].period, '2025-12-31');
  assert.equal(checks[0].primary, '900719925474099300000.01');
  assert.equal(checks[0].secondary, '900719925474099399999.02');
  assert.equal(checks[0].difference, '-99999.01');
  assert.equal(source.financials[1].amounts.revenue, null);
});

test('a multi-year calculation exposes related historical differences without mixing profit bases', () => {
  const source = snapshot();
  const checks = companyEvidenceComparisons(source, source.financials, ['ocf', 'netProfit']);
  assert.deepEqual(
    checks.map((check) => [check.period, check.field]),
    [['2024-12-31', 'ocf']]
  );
  assert.equal(
    companyEvidenceComparisons(source, [source.financials[1]], ['parentProfit'])[0].matches,
    true
  );
  assert.deepEqual(companyEvidenceComparisons(undefined, source.financials, ['ocf']), []);
});

test('each amount links to its actual recorded provider and statement table', () => {
  const source = snapshot();
  const row = source.financials[1];
  assert.deepEqual(companyEvidenceSourceUrls(source, row, 'revenue', 'primary'), [emIncome]);
  assert.deepEqual(companyEvidenceSourceUrls(source, row, 'parentProfit', 'secondary'), [
    sinaIncome,
  ]);
  assert.deepEqual(companyEvidenceSourceUrls(source, row, 'ocf', 'primary'), [emCash]);
  assert.deepEqual(companyEvidenceSourceUrls(source, row, 'ocf', 'secondary'), [sinaCash]);
  assert.deepEqual(companyEvidenceSourceUrls(source, row, 'cash', 'primary'), []);
});

test('unrecorded receipts, generic entry points and invalid URLs never become amount sources', () => {
  const source = snapshot();
  source.sources.push({
    id: 'em-income',
    provider: '东方财富',
    dimension: '财务报表 · income',
    url: 'https://datacenter.eastmoney.com/unrecorded-result',
    status: 'available',
    fetchedAt: source.fetchedAt,
    latestDate: '2025-12-31',
    count: 1,
    note: '',
    responseHashes: [],
  });
  const row = source.financials[1];
  row.sourceUrls = ['https://www.eastmoney.com/', 'not-a-url', 'javascript:alert(1)'];
  assert.deepEqual(companyEvidenceSourceUrls(source, row, 'revenue', 'primary'), []);
  assert.deepEqual(companyEvidenceSourceUrls(source, undefined, 'revenue', 'primary'), []);
  const exactUrl = source.sources[0].url;
  row.sourceUrls.push(exactUrl, exactUrl);
  assert.deepEqual(companyEvidenceSourceUrls(source, row, 'revenue', 'primary'), [exactUrl]);
});

test('recorded links still require the correct provider, HTTPS and no embedded credentials', () => {
  const source = snapshot();
  const row = source.financials[1];
  for (const provider of ['primary', 'secondary'] as const) {
    const host = provider === 'primary' ? 'datacenter.eastmoney.com' : 'quotes.sina.cn';
    const query = provider === 'primary' ? 'reportName=RPT_F10_FINANCE_GINCOME' : 'source=lrb';
    for (const value of [
      `https://unrelated.example.test/result?${query}`,
      `http://${host}/result?${query}`,
      `https://user:secret@${host}/result?${query}`,
      `https://user@${host}/result?${query}`,
    ]) {
      row.sourceUrls = [value];
      source.sources = [
        {
          id: `${provider === 'primary' ? 'em' : 'sina'}-income`,
          provider: 'fixture',
          dimension: 'financials',
          url: value,
          status: 'available',
          fetchedAt: source.fetchedAt,
          latestDate: row.period,
          count: 1,
          note: '',
          responseHashes: [],
        },
      ];
      assert.deepEqual(companyEvidenceSourceUrls(source, row, 'revenue', provider), []);
    }
  }
});
