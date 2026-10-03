import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  industryChartMetricKeys,
  industryMetricKeys,
  type CompanyIndustrySnapshot,
} from '../shared/company-workspace.js';
import {
  aggregateIndustryCharts,
  industryChartValues,
  retrieveIndustrySnapshot,
} from '../server/company-industry.js';

const period = '2025-12-31';
const targetCode = '600519';
const codes = [targetCode, '600001', '600002', '600003', '600004', '600005'];
const incomeRows = codes.map((code, index) => ({
  SECURITY_CODE: code,
  REPORT_DATE: period,
  TOTAL_OPERATE_INCOME: 1000 + index * 100,
  NETPROFIT: index === 0 ? 100 : -10 + index * 10,
  PARENT_NETPROFIT: index === 0 ? 90 : -20 + index * 10,
}));
const summaryRows = codes.map((code, index) => ({
  SECURITY_CODE: code,
  SECURITY_NAME_ABBR: `企业${index}`,
  REPORTDATE: period,
  NOTICE_DATE: '2026-04-01',
  BOARD_CODE: 'BK0420',
  BOARD_NAME: '样本行业',
  TOTAL_OPERATE_INCOME: 1000 + index * 100,
  // This summary must never supply consolidated profit to the new charts.
  PARENT_NETPROFIT: 999,
  XSMLL: 30 + index,
  WEIGHTAVG_ROE: 10 + index,
  YSTZ: 2 + index,
}));
const balanceRows = codes.map((code, index) => ({
  SECURITY_CODE: code,
  REPORT_DATE: period,
  TOTAL_LIABILITIES: 300 + index,
  TOTAL_ASSETS: 600 + index,
  ACCOUNTS_RECE: 20 + index,
  MONETARYFUNDS: 200 + index,
  INVENTORY: 80 + index,
  SHORT_LOAN: index * 10,
  NONCURRENT_LIAB_1YEAR: index * 5,
}));
const cashRows = codes.map((code, index) => ({
  SECURITY_CODE: code,
  REPORT_DATE: period,
  NETCASH_OPERATE: 80 + index,
}));

type FixtureChange = (
  report: string,
  result: { data: Record<string, unknown>[]; pages: number; count: number }
) => void;
function fixture(change?: FixtureChange) {
  const receipts: { url: string; sha256: string; report: string }[] = [];
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const report = url.searchParams.get('reportName')!;
    const rows =
      report === 'RPT_LICO_FN_CPD'
        ? url.searchParams.get('filter')!.includes('BOARD_CODE')
          ? summaryRows
          : [summaryRows[0]!]
        : report === 'RPT_DMSK_FN_BALANCE'
          ? balanceRows
          : report === 'RPT_DMSK_FN_CASHFLOW'
            ? cashRows
            : report === 'RPT_DMSK_FN_INCOME'
              ? incomeRows
              : null;
    assert.ok(rows, `Unexpected report ${report}`);
    const result = { data: structuredClone(rows), pages: 1, count: rows.length };
    change?.(report, result);
    const body = JSON.stringify({ success: true, result });
    receipts.push({
      url: url.href,
      sha256: createHash('sha256').update(body).digest('hex'),
      report,
    });
    return new Response(body);
  };
  return { fetch, receipts, now: () => new Date('2026-10-03T00:00:00.000Z') };
}

test('chart values retain distinct profit bases, true zero and negative cash, with explicit debt components', () => {
  const values = industryChartValues(
    { TOTAL_OPERATE_INCOME: '1000', NETPROFIT: '-100', PARENT_NETPROFIT: '-80' },
    { SHORT_LOAN: '0', NONCURRENT_LIAB_1YEAR: '0', MONETARYFUNDS: '0' },
    { NETCASH_OPERATE: '-30' }
  );
  assert.equal(values.netProfit, -100);
  assert.equal(values.parentProfit, -80);
  assert.equal(values.netMargin, -10);
  assert.equal(values.parentNetMargin, -8);
  assert.equal(values.ocf, -30);
  assert.equal(values.cash, 0);
  assert.equal(values.shortDebt, 0);
  assert.equal(industryChartValues({}, { SHORT_LOAN: 10 }, {}).shortDebt, null);
  assert.equal(
    industryChartValues({}, { SHORT_LOAN: -10, NONCURRENT_LIAB_1YEAR: 30 }, {}).shortDebt,
    null
  );
  for (const revenue of [0, -100, null]) {
    const invalid = industryChartValues({ TOTAL_OPERATE_INCOME: revenue, NETPROFIT: 1 }, {}, {});
    assert.equal(invalid.netMargin, null);
    assert.equal(invalid.parentNetMargin, null);
  }
  assert.equal(industryChartValues({ PARENT_NETPROFIT: 100 }, {}, {}).netProfit, null);
});

test('chart peers exclude the target and independently withhold small or missing samples', () => {
  const samples: CompanyIndustrySnapshot['samples'] = [999, -20, 0, 10, 30, 80].map(
    (value, index) => ({
      code: codes[index]!,
      name: `企业${index}`,
      noticeDate: null,
      values: Object.fromEntries(industryMetricKeys.map((key) => [key, null])) as any,
      chartValues: { netProfit: value, revenue: index === 3 ? null : 1000 },
    })
  );
  const metrics = aggregateIndustryCharts(samples, targetCode);
  assert.deepEqual(metrics.netProfit, {
    company: 999,
    mean: 20,
    median: 10,
    count: 5,
    missing: 0,
    difference: 979,
  });
  assert.equal(metrics.revenue.count, 4);
  assert.equal(metrics.revenue.missing, 1);
  assert.equal(metrics.revenue.mean, null);
  assert.equal(metrics.revenue.difference, null);
  assert.equal(aggregateIndustryCharts(samples.slice(0, 5), targetCode).netProfit.mean, null);
  delete samples[5]!.chartValues;
  assert.equal(aggregateIndustryCharts(samples, targetCode).netProfit.count, 4);
  assert.equal(aggregateIndustryCharts(samples, targetCode).netProfit.mean, null);
});

test('industry chart retrieval joins the complete same-year cohort and records statement receipts', async () => {
  const dependencies = fixture((_report, result) => result.data.reverse());
  const snapshot = await retrieveIndustrySnapshot(targetCode, period, dependencies);
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.status, 'available');
  assert.equal(snapshot.peerCount, 5);
  assert.deepEqual(Object.keys(snapshot.metrics), [...industryMetricKeys]);
  assert.deepEqual(Object.keys(snapshot.chartMetrics!), [...industryChartMetricKeys]);
  assert.equal(snapshot.chartMetrics!.revenue!.company, 1000);
  assert.equal(snapshot.chartMetrics!.netProfit!.company, 100);
  assert.equal(snapshot.chartMetrics!.parentProfit!.company, 90);
  assert.equal(snapshot.chartMetrics!.netProfit!.mean, 20);
  assert.equal(snapshot.chartMetrics!.parentProfit!.mean, 10);
  assert.equal(snapshot.chartMetrics!.netMargin!.company, 10);
  assert.equal(snapshot.chartMetrics!.parentNetMargin!.company, 9);
  assert.equal(snapshot.chartMetrics!.shortDebt!.mean, 45);
  assert.equal(snapshot.chartMetrics!.netProfit!.count, 5);
  assert.equal(
    snapshot.samples.find((sample) => sample.code === targetCode)!.chartValues!.cash,
    200
  );
  assert.deepEqual(
    snapshot.sources,
    dependencies.receipts.map(({ url, sha256 }) => ({ url, sha256 }))
  );
  assert.equal(dependencies.receipts.length, 5);
  assert.equal(dependencies.receipts.at(-1)!.report, 'RPT_DMSK_FN_INCOME');
});

test('optional income failure never substitutes attributable profit or blocks existing industry metrics', async () => {
  const dependencies = fixture((report) => {
    if (report === 'RPT_DMSK_FN_INCOME') throw new Error('fixture unavailable');
  });
  const snapshot = await retrieveIndustrySnapshot(targetCode, period, dependencies);
  assert.equal(snapshot.status, 'available');
  assert.equal(snapshot.metrics.grossMargin.count, 5);
  assert.notEqual(snapshot.metrics.ocfToRevenue.mean, null);
  for (const key of [
    'revenue',
    'netProfit',
    'parentProfit',
    'netMargin',
    'parentNetMargin',
  ] as const) {
    assert.equal(snapshot.chartMetrics![key]!.company, null);
    assert.equal(snapshot.chartMetrics![key]!.mean, null);
    assert.equal(snapshot.chartMetrics![key]!.count, 0);
    assert.equal(snapshot.chartMetrics![key]!.missing, 5);
  }
  assert.equal(snapshot.chartMetrics!.cash!.mean, 203);
  assert.equal(snapshot.chartMetrics!.ocf!.mean, 83);
  assert.ok(snapshot.warnings.some((warning) => warning.includes('利润表图表参照')));
  assert.equal(snapshot.sources.length, 4);
});

test('incomplete, foreign-subject, wrong-year or conflicting optional income cohorts remain wholly unknown', async () => {
  const changes: FixtureChange[] = [
    (report, result) => {
      if (report === 'RPT_DMSK_FN_INCOME') result.count += 1;
    },
    (report, result) => {
      if (report === 'RPT_DMSK_FN_INCOME') result.data[1]!.SECURITY_CODE = '600999';
    },
    (report, result) => {
      if (report === 'RPT_DMSK_FN_INCOME') result.data[1]!.REPORT_DATE = '2024-12-31';
    },
    (report, result) => {
      if (report === 'RPT_DMSK_FN_INCOME') {
        result.data.push({ ...result.data[1]!, NETPROFIT: 9999 });
        result.count += 1;
      }
    },
  ];
  for (const change of changes) {
    const snapshot = await retrieveIndustrySnapshot(targetCode, period, fixture(change));
    assert.equal(snapshot.status, 'available');
    assert.equal(snapshot.chartMetrics!.netProfit!.mean, null);
    assert.equal(snapshot.chartMetrics!.netProfit!.company, null);
    assert.equal(snapshot.chartMetrics!.cash!.count, 5);
    assert.equal(snapshot.metrics.grossMargin.count, 5);
  }
});

test('failed core balance retrieval retains independent income charts and the original partial state', async () => {
  const snapshot = await retrieveIndustrySnapshot(
    targetCode,
    period,
    fixture((report) => {
      if (report === 'RPT_DMSK_FN_BALANCE') throw new Error('fixture balance unavailable');
    })
  );
  assert.equal(snapshot.status, 'partial');
  assert.equal(snapshot.metrics.assetLiabilityRatio.mean, null);
  assert.equal(snapshot.chartMetrics!.cash!.mean, null);
  assert.equal(snapshot.chartMetrics!.shortDebt!.mean, null);
  assert.equal(snapshot.chartMetrics!.netProfit!.mean, 20);
  assert.equal(snapshot.chartMetrics!.ocf!.mean, 83);
});
