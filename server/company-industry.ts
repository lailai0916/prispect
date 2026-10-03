import type {
  CompanyIndustrySnapshot,
  IndustryMetricKey,
  IndustryChartMetricKey,
  IndustryMetricSummary,
} from '../shared/company-workspace.js';
import { industryMetricKeys, industryChartMetricKeys } from '../shared/company-workspace.js';
import {
  PublicCompanyReader,
  CONTEXT_ENDPOINT,
  objectValue,
  arrayValue,
  textValue,
  finiteValue,
  dateValue,
} from './company-context-sources.js';
import type { CompanySourceDependencies } from './company-sources.js';
import { ApiFault } from './validation.js';

const minimumSamples = 5;
const supported = (code: string) => /^[036]\d{5}$/.test(code);
const ratio = (a: unknown, b: unknown): number | null => {
  const numerator = finiteValue(a),
    denominator = finiteValue(b);
  return numerator !== null && denominator !== null && denominator > 0
    ? finiteValue((numerator / denominator) * 100)
    : null;
};
export function validateIndustryInput(code: string, period: string, now = new Date()): void {
  if (
    !supported(code) ||
    !/^20\d{2}-12-31$/.test(period) ||
    period >= now.toISOString().slice(0, 10)
  )
    throw new ApiFault(400, 'INDUSTRY_INPUT', '请选择沪深 A 股的已结束完整年报年度');
}
export function uniqueIndustryRows(
  rows: Record<string, unknown>[],
  period: string,
  dateColumn: string
): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const code = textValue(row.SECURITY_CODE);
    if (!supported(code) || dateValue(row[dateColumn]) !== period) continue;
    const previous = result.get(code),
      stamp = (item: Record<string, unknown>) =>
        `${textValue(item.UPDATE_DATE)}:${textValue(item.NOTICE_DATE)}`;
    if (!previous || stamp(row) > stamp(previous)) result.set(code, row);
    else if (stamp(row) === stamp(previous) && JSON.stringify(previous) !== JSON.stringify(row))
      throw new ApiFault(
        422,
        'INDUSTRY_DUPLICATE_CONFLICT',
        '同一主体和期间存在无法区分的重复记录，未计算行业均值'
      );
  }
  return result;
}
export function industryValues(
  income: Record<string, unknown>,
  balance: Record<string, unknown>,
  cash: Record<string, unknown>
): Record<IndustryMetricKey, number | null> {
  return {
    grossMargin: finiteValue(income.XSMLL),
    roe: finiteValue(income.WEIGHTAVG_ROE),
    ocfToRevenue: ratio(cash.NETCASH_OPERATE, income.TOTAL_OPERATE_INCOME),
    assetLiabilityRatio: ratio(balance.TOTAL_LIABILITIES, balance.TOTAL_ASSETS),
    receivableToRevenue: ratio(balance.ACCOUNTS_RECE, income.TOTAL_OPERATE_INCOME),
    revenueGrowth: finiteValue(income.YSTZ),
  };
}
export function industryChartValues(
  income: Record<string, unknown>,
  balance: Record<string, unknown>,
  cash: Record<string, unknown>
): Record<IndustryChartMetricKey, number | null> {
  const nonnegative = (value: unknown): number | null => {
    const amount = finiteValue(value);
    return amount !== null && amount >= 0 ? amount : null;
  };
  const shortLoan = nonnegative(balance.SHORT_LOAN),
    currentPortionDebt = nonnegative(balance.NONCURRENT_LIAB_1YEAR);
  return {
    revenue: finiteValue(income.TOTAL_OPERATE_INCOME),
    netProfit: finiteValue(income.NETPROFIT),
    parentProfit: finiteValue(income.PARENT_NETPROFIT),
    ocf: finiteValue(cash.NETCASH_OPERATE),
    cash: finiteValue(balance.MONETARYFUNDS),
    shortDebt:
      shortLoan !== null && currentPortionDebt !== null
        ? finiteValue(shortLoan + currentPortionDebt)
        : null,
    shortLoan,
    currentPortionDebt,
    inventory: finiteValue(balance.INVENTORY),
    receivables: finiteValue(balance.ACCOUNTS_RECE),
    netMargin: ratio(income.NETPROFIT, income.TOTAL_OPERATE_INCOME),
    parentNetMargin: ratio(income.PARENT_NETPROFIT, income.TOTAL_OPERATE_INCOME),
  };
}
function aggregateValues(
  company: number | null,
  peers: (number | null | undefined)[]
): IndustryMetricSummary {
  const values = peers
    .filter(
      (value): value is number => value !== null && value !== undefined && Number.isFinite(value)
    )
    .sort((a, b) => a - b);
  // Compensated summation retains zero, negative and extreme values.
  let sum = 0,
    correction = 0;
  for (const value of values) {
    const y = value - correction,
      next = sum + y;
    correction = next - sum - y;
    sum = next;
  }
  const mean = values.length >= minimumSamples ? finiteValue(sum / values.length) : null;
  const median =
    values.length >= minimumSamples
      ? values.length % 2
        ? values[Math.floor(values.length / 2)]!
        : finiteValue(values[values.length / 2 - 1]! / 2 + values[values.length / 2]! / 2)
      : null;
  return {
    company: finiteValue(company),
    mean,
    median,
    count: values.length,
    missing: peers.length - values.length,
    difference: company !== null && mean !== null ? finiteValue(company - mean) : null,
  };
}
export function aggregateIndustry(
  samples: CompanyIndustrySnapshot['samples'],
  code: string
): CompanyIndustrySnapshot['metrics'] {
  const target = samples.find((sample) => sample.code === code),
    peers = samples.filter((sample) => sample.code !== code);
  return Object.fromEntries(
    industryMetricKeys.map((key) => [
      key,
      aggregateValues(
        target?.values[key] ?? null,
        peers.map((sample) => sample.values[key])
      ),
    ])
  ) as CompanyIndustrySnapshot['metrics'];
}
export function aggregateIndustryCharts(
  samples: CompanyIndustrySnapshot['samples'],
  code: string
): Record<IndustryChartMetricKey, IndustryMetricSummary> {
  const target = samples.find((sample) => sample.code === code),
    peers = samples.filter((sample) => sample.code !== code);
  return Object.fromEntries(
    industryChartMetricKeys.map((key) => [
      key,
      aggregateValues(
        target?.chartValues?.[key] ?? null,
        peers.map((sample) => sample.chartValues?.[key])
      ),
    ])
  ) as Record<IndustryChartMetricKey, IndustryMetricSummary>;
}
export async function industryRows(
  reader: PublicCompanyReader,
  report: string,
  filter: string,
  period: string,
  dateColumn: string
): Promise<{ rows: Record<string, unknown>[]; sources: CompanyIndustrySnapshot['sources'] }> {
  const rows: Record<string, unknown>[] = [],
    sources: CompanyIndustrySnapshot['sources'] = [];
  let pages = 1,
    count: number | null = null;
  for (let page = 1; page <= pages; page++) {
    const url = new URL(CONTEXT_ENDPOINT);
    url.search = new URLSearchParams({
      reportName: report,
      columns: 'ALL',
      filter,
      pageNumber: String(page),
      pageSize: '500',
      sortColumns: 'SECURITY_CODE',
      sortTypes: '1',
      source: 'WEB',
      client: 'WEB',
    }).toString();
    const response = await reader.json(url.href),
      result = objectValue(response.value.result);
    if (response.value.success !== true || !Array.isArray(result.data))
      throw new ApiFault(502, 'INDUSTRY_SOURCE_FORMAT', '行业来源未返回完整可核对数据');
    if (page === 1) {
      pages = Number(result.pages) || 1;
      count = Number(result.count) || 0;
      if (pages > 20 || pages < 1)
        throw new ApiFault(
          422,
          'INDUSTRY_SAMPLE_LIMIT',
          '行业样本超过取数上限，不计算截断样本均值'
        );
    }
    const batch = arrayValue(result.data);
    if (!batch.length && count)
      throw new ApiFault(422, 'INDUSTRY_PAGE_MISSING', '来源分页中断，未计算不完整样本均值');
    if (batch.some((row) => dateValue(row[dateColumn]) !== period))
      throw new ApiFault(422, 'INDUSTRY_PERIOD_CONFLICT', '行业来源报告期不一致，未混合计算');
    rows.push(...batch);
    sources.push({ url: response.url, sha256: response.sha256 });
  }
  if (count !== null && rows.length !== count)
    throw new ApiFault(422, 'INDUSTRY_COUNT_CONFLICT', '来源记录数与分页总数不一致');
  return { rows, sources };
}
export async function retrieveIndustrySnapshot(
  code: string,
  period: string,
  dependencies: CompanySourceDependencies = {}
): Promise<CompanyIndustrySnapshot> {
  const now = (dependencies.now || (() => new Date()))();
  validateIndustryInput(code, period, now);
  const signal = dependencies.signal
    ? AbortSignal.any([dependencies.signal, AbortSignal.timeout(90000)])
    : AbortSignal.timeout(90000);
  const reader = new PublicCompanyReader({ ...dependencies, signal });
  const first = await industryRows(
    reader,
    'RPT_LICO_FN_CPD',
    `(SECURITY_CODE="${code}")(REPORTDATE='${period}')`,
    period,
    'REPORTDATE'
  );
  const target = uniqueIndustryRows(first.rows, period, 'REPORTDATE').get(code);
  if (!target) throw new ApiFault(422, 'INDUSTRY_TARGET_MISSING', '本企业该年度没有可对齐行业记录');
  const industryCode = textValue(target.BOARD_CODE),
    industry = textValue(target.BOARD_NAME);
  if (!/^BK\d{4,6}$/.test(industryCode) || !industry)
    throw new ApiFault(422, 'INDUSTRY_CLASSIFICATION', '来源没有提供可核对的细分行业');
  const cohort = await industryRows(
    reader,
    'RPT_LICO_FN_CPD',
    `(BOARD_CODE="${industryCode}")(REPORTDATE='${period}')`,
    period,
    'REPORTDATE'
  );
  if (cohort.rows.some((row) => row.BOARD_CODE !== industryCode))
    throw new ApiFault(422, 'INDUSTRY_CLASSIFICATION_CONFLICT', '来源返回不同细分行业，未混合计算');
  const income = uniqueIndustryRows(cohort.rows, period, 'REPORTDATE');
  if (!income.has(code))
    throw new ApiFault(422, 'INDUSTRY_TARGET_MISSING', '本企业不在同报告期行业样本内');
  const codes = [...income.keys()].sort(),
    sources = [...first.sources, ...cohort.sources],
    warnings: string[] = [];
  const statements = async (report: string) => {
    const rows: Record<string, unknown>[] = [];
    for (let start = 0; start < codes.length; start += 100) {
      const filter = codes
        .slice(start, start + 100)
        .map((code) => `"${code}"`)
        .join(',');
      const result = await industryRows(
        reader,
        report,
        `(SECURITY_CODE in (${filter}))(REPORT_DATE='${period}')`,
        period,
        'REPORT_DATE'
      );
      if (result.rows.some((row) => !codes.includes(textValue(row.SECURITY_CODE))))
        throw new ApiFault(422, 'INDUSTRY_SUBJECT_CONFLICT', '报表返回行业样本之外的主体');
      rows.push(...result.rows);
      sources.push(...result.sources);
    }
    return uniqueIndustryRows(rows, period, 'REPORT_DATE');
  };
  const results = await Promise.allSettled([
    statements('RPT_DMSK_FN_BALANCE'),
    statements('RPT_DMSK_FN_CASHFLOW'),
  ]);
  const balance =
    results[0].status === 'fulfilled'
      ? results[0].value
      : new Map<string, Record<string, unknown>>();
  const cash =
    results[1].status === 'fulfilled'
      ? results[1].value
      : new Map<string, Record<string, unknown>>();
  if (results[0].status === 'rejected')
    warnings.push('资产负债表本次未完整取得，相关指标保留未知。');
  if (results[1].status === 'rejected')
    warnings.push('现金流量表本次未完整取得，相关指标保留未知。');
  // Optional chart amounts share the same reader, deadline and cohort. Read
  // them after the required tables so they cannot consume the core budget.
  // CPD's attributable profit never substitutes for consolidated NETPROFIT.
  let chartIncome = new Map<string, Record<string, unknown>>();
  try {
    chartIncome = await statements('RPT_DMSK_FN_INCOME');
  } catch {
    warnings.push('利润表图表参照本次未完整取得，相关金额和净利率保留未知。');
  }
  const samples = codes.map((item) => ({
    code: item,
    name: textValue(income.get(item)!.SECURITY_NAME_ABBR) || item,
    noticeDate: dateValue(income.get(item)!.NOTICE_DATE) || null,
    values: industryValues(income.get(item)!, balance.get(item) || {}, cash.get(item) || {}),
    chartValues: industryChartValues(
      chartIncome.get(item) || {},
      balance.get(item) || {},
      cash.get(item) || {}
    ),
  }));
  const metrics = aggregateIndustry(samples, code);
  const chartMetrics = aggregateIndustryCharts(samples, code);
  if (industryMetricKeys.some((key) => metrics[key].count < minimumSamples))
    warnings.push('部分指标有效同行不足五家，不输出均值或差异。');
  warnings.push(
    '行业分类为查询时的东方财富细分行业；样本仅含同年度已披露的沪深上市企业。均值等权、剔除本企业，保留亏损与极端值。',
    '均值、中位数不用于补填企业缺失数据，也不合成为企业评分。'
  );
  return {
    version: 1,
    securityCode: code,
    period,
    industry,
    industryCode,
    fetchedAt: now.toISOString(),
    status:
      results.some((result) => result.status === 'rejected') ||
      industryMetricKeys.some((key) => metrics[key].count < minimumSamples)
        ? 'partial'
        : 'available',
    peerCount: codes.length - 1,
    minimumSamples,
    metrics,
    chartMetrics,
    samples,
    sources,
    warnings,
  };
}
