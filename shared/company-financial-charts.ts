/** Local chart read models. Saved public snapshots remain unchanged; missing data is never zero-filled. */
import {
  contextFen,
  contextRatio,
  contextYuan,
  type CompanyReadingBasis,
} from './company-analysis.js';
import type {
  CompanyContextPeriod,
  CompanyContextSnapshot,
  CompanyIndustrySnapshot,
  ContextAmountField,
  IndustryChartMetricKey,
  IndustryMetricKey,
  IndustryMetricSummary,
} from './company-workspace.js';

export type FinancialChartKey =
  | 'revenue'
  | 'profit'
  | 'ocf'
  | 'cash'
  | 'shortDebt'
  | 'shortLoan'
  | 'currentPortionDebt'
  | 'inventory'
  | 'receivables'
  | 'grossMargin'
  | 'netMargin'
  | 'roe'
  | 'ocfToRevenue'
  | 'receivableToRevenue'
  | 'revenueGrowth';

export interface FinancialChartPoint {
  period: string;
  /** Amounts are yuan, ratios are percentages. Conversion to display units belongs to the chart. */
  company: number | null;
  peer: number | null;
  count: number | null;
}

export interface FinancialChartField {
  label: readonly [string, string];
  note: readonly [string, string];
  unit: 'amount' | 'percent';
  style: 'bars' | 'lines' | 'dumbbell';
  fields: ContextAmountField[];
}

export const financialChartFields: Record<FinancialChartKey, FinancialChartField> = {
  revenue: {
    label: ['营业总收入', 'Revenue'],
    note: [
      '全年营业总收入；金额受企业规模影响。',
      'Full-year revenue; amounts depend on company size.',
    ],
    unit: 'amount',
    style: 'bars',
    fields: ['revenue'],
  },
  profit: {
    label: ['净利润', 'Net profit'],
    note: [
      '按所选合并或归母口径；负值表示亏损。',
      'Uses the selected consolidated or attributable basis; negative values indicate a loss.',
    ],
    unit: 'amount',
    style: 'bars',
    fields: ['netProfit'],
  },
  ocf: {
    label: ['经营现金净额', 'Operating cash flow'],
    note: [
      '全年经营活动现金净额，不等于销售回款或年末余额。',
      'Annual net operating cash flow; separate from sales receipts and year-end cash balances.',
    ],
    unit: 'amount',
    style: 'bars',
    fields: ['ocf'],
  },
  cash: {
    label: ['货币资金', 'Monetary funds'],
    note: [
      '年末余额；受限资金与当前可用余额需另行核实。',
      'Year-end balance; restrictions and current availability require separate checks.',
    ],
    unit: 'amount',
    style: 'bars',
    fields: ['cash'],
  },
  shortDebt: {
    label: ['两项短债合计', 'Two specified debt items'],
    note: [
      '短期借款 + 一年内到期非流动负债；任一缺失即未知。',
      'Short-term borrowing + current portion of noncurrent liabilities; either missing component leaves the sum unknown.',
    ],
    unit: 'amount',
    style: 'bars',
    fields: ['shortLoan', 'currentPortionDebt'],
  },
  shortLoan: {
    label: ['短期借款', 'Short-term borrowing'],
    note: [
      '年末短期借款；缺失不表示没有借款。',
      'Year-end short-term borrowing; a missing value does not mean no borrowing.',
    ],
    unit: 'amount',
    style: 'dumbbell',
    fields: ['shortLoan'],
  },
  currentPortionDebt: {
    label: ['一年内到期非流动负债', 'Current portion of noncurrent liabilities'],
    note: [
      '年末一年内到期的非流动负债，不等于全部流动负债。',
      'Year-end noncurrent liabilities due within a year; separate from total current liabilities.',
    ],
    unit: 'amount',
    style: 'dumbbell',
    fields: ['currentPortionDebt'],
  },
  inventory: {
    label: ['存货', 'Inventory'],
    note: [
      '年末存货余额；需结合周转和减值情况。',
      'Year-end inventory balance; consider turnover and impairment.',
    ],
    unit: 'amount',
    style: 'bars',
    fields: ['inventory'],
  },
  receivables: {
    label: ['应收账款', 'Accounts receivable'],
    note: [
      '年末应收账款余额；需结合账龄和回款情况。',
      'Year-end accounts receivable; consider aging and collections.',
    ],
    unit: 'amount',
    style: 'bars',
    fields: ['receivables'],
  },
  grossMargin: {
    label: ['毛利率', 'Gross margin'],
    note: [
      '来源披露的毛利率；需结合业务结构。',
      'Gross margin reported by the source; consider the business mix.',
    ],
    unit: 'percent',
    style: 'lines',
    fields: [],
  },
  netMargin: {
    label: ['净利率', 'Net margin'],
    note: [
      '所选口径净利润 ÷ 全年营业总收入；负值保留。',
      'Net profit on the selected basis / full-year revenue; negative values are retained.',
    ],
    unit: 'percent',
    style: 'lines',
    fields: ['netProfit', 'revenue'],
  },
  roe: {
    label: ['加权 ROE', 'Weighted ROE'],
    note: [
      '来源披露的加权 ROE；需结合杠杆和净资产变化。',
      'Weighted ROE reported by the source; consider leverage and equity changes.',
    ],
    unit: 'percent',
    style: 'bars',
    fields: [],
  },
  ocfToRevenue: {
    label: ['经营现金 / 营收', 'Operating cash / revenue'],
    note: [
      '全年经营现金净额 ÷ 全年营业总收入，便于跨规模比较。',
      'Annual operating cash flow / annual revenue, for comparison across company sizes.',
    ],
    unit: 'percent',
    style: 'lines',
    fields: ['ocf', 'revenue'],
  },
  receivableToRevenue: {
    label: ['应收账款 / 营收', 'Receivables / revenue'],
    note: [
      '年末应收账款 ÷ 全年营业总收入；需结合账龄与回款。',
      'Year-end receivables / annual revenue; consider aging and collections.',
    ],
    unit: 'percent',
    style: 'dumbbell',
    fields: ['receivables', 'revenue'],
  },
  revenueGrowth: {
    label: ['营收同比增长', 'Revenue growth'],
    note: [
      '营业总收入的年度同比变化；需结合上年基数。',
      'Year-on-year change in annual revenue; consider the prior-year base.',
    ],
    unit: 'percent',
    style: 'bars',
    fields: ['revenue'],
  },
};

export const financialChartGroups: {
  id: 'cash' | 'income' | 'debt' | 'ratios';
  label: readonly [string, string];
  keys: FinancialChartKey[];
}[] = [
  {
    id: 'cash',
    label: ['利润与经营现金', 'Profit and operating cash'],
    keys: ['ocf', 'profit', 'ocfToRevenue', 'netMargin'],
  },
  {
    id: 'income',
    label: ['收入与利润', 'Income and profit'],
    keys: ['revenueGrowth', 'revenue', 'profit', 'netMargin'],
  },
  {
    id: 'debt',
    label: ['货币资金与负债', 'Funds and liabilities'],
    keys: ['cash', 'shortDebt', 'shortLoan', 'currentPortionDebt'],
  },
  {
    id: 'ratios',
    label: ['关键比率', 'Key ratios'],
    keys: ['grossMargin', 'roe', 'ocfToRevenue', 'receivableToRevenue'],
  },
];

export function financialChartSourceFields(
  key: FinancialChartKey,
  basis: CompanyReadingBasis
): ContextAmountField[] {
  return financialChartFields[key].fields.map((field) =>
    field === 'netProfit' && basis === 'parent' ? 'parentProfit' : field
  );
}

const isAnnual = (row: CompanyContextPeriod): boolean =>
  row.annual && /^20\d{2}-12-31$/.test(row.period);

function annualRows(snapshot: CompanyContextSnapshot, period: string): CompanyContextPeriod[] {
  return snapshot.financials.filter((row) => isAnnual(row) && row.period === period);
}

function amountConflict(
  snapshot: CompanyContextSnapshot,
  period: string,
  field: ContextAmountField
): boolean {
  if (
    snapshot.comparisons.some(
      (check) => check.period === period && check.field === field && !check.matches
    )
  )
    return true;
  const known = annualRows(snapshot, period)
    .map((row) => contextFen(row.amounts[field]))
    .filter((value): value is bigint => value !== null);
  return known.some((value) => value !== known[0]);
}

/** Exact values for chart-detail cards, using the same withholding rules as the plotted points. */
export function financialChartAmount(
  snapshot: CompanyContextSnapshot,
  period: string,
  field: ContextAmountField
): string | null {
  if (amountConflict(snapshot, period, field)) return null;
  const values = annualRows(snapshot, period).map((row) => contextFen(row.amounts[field]));
  return values.length && values.every((value) => value !== null) ? contextYuan(values[0]!) : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function amountNumber(value: string | null): number | null {
  const parsed = contextFen(value);
  return parsed === null ? null : finite(Number(parsed) / 100);
}

function storedRatio(
  rows: CompanyContextPeriod[],
  key: keyof CompanyContextPeriod['ratios']
): number | null {
  const values = rows.map((row) => finite(row.ratios[key]));
  return values.length && values.every((value) => value !== null && value === values[0])
    ? values[0]!
    : null;
}

function ratioConflict(
  rows: CompanyContextPeriod[],
  key: keyof CompanyContextPeriod['ratios']
): boolean {
  const values = rows
    .map((row) => finite(row.ratios[key]))
    .filter((value): value is number => value !== null);
  return values.some((value) => value !== values[0]);
}

function peerMetric(
  industry: CompanyIndustrySnapshot,
  key: FinancialChartKey,
  basis: CompanyReadingBasis
): IndustryMetricSummary | undefined {
  if (['grossMargin', 'roe', 'ocfToRevenue', 'receivableToRevenue', 'revenueGrowth'].includes(key))
    return industry.metrics[key as IndustryMetricKey];
  const metric: IndustryChartMetricKey =
    key === 'profit'
      ? basis === 'parent'
        ? 'parentProfit'
        : 'netProfit'
      : key === 'netMargin'
        ? basis === 'parent'
          ? 'parentNetMargin'
          : 'netMargin'
        : (key as IndustryChartMetricKey);
  return industry.chartMetrics?.[metric];
}

/** Pure comparison of matching saved snapshots. Opening a chart never retrieves more data. */
export function buildFinancialChartPoints(
  snapshot: CompanyContextSnapshot,
  basis: CompanyReadingBasis,
  industries?: Record<string, CompanyIndustrySnapshot>
): Record<FinancialChartKey, FinancialChartPoint[]> {
  const periods = [
    ...new Set(snapshot.financials.filter(isAnnual).map((row) => row.period)),
  ].sort();
  const keys = Object.keys(financialChartFields) as FinancialChartKey[];
  return Object.fromEntries(
    keys.map((key) => [
      key,
      periods.map((period) => {
        const rows = annualRows(snapshot, period),
          priorPeriod = `${Number(period.slice(0, 4)) - 1}-12-31`,
          priorRows = annualRows(snapshot, priorPeriod),
          amount = (field: ContextAmountField) => financialChartAmount(snapshot, period, field),
          ratio = (numerator: string | null, denominator: string | null) => {
            const value = contextRatio(numerator, denominator);
            return value === null ? null : finite(value * 100);
          },
          sourceFields = financialChartSourceFields(key, basis);
        let conflict = sourceFields.some((field) => amountConflict(snapshot, period, field));
        let company: number | null;
        if (key === 'shortDebt') {
          const components = sourceFields.map((field) => contextFen(amount(field)));
          company = components.every((value) => value !== null && value >= 0n)
            ? amountNumber(contextYuan(components.reduce<bigint>((sum, value) => sum + value!, 0n)))
            : null;
        } else if (key === 'shortLoan' || key === 'currentPortionDebt') {
          const component = contextFen(amount(key));
          company =
            component !== null && component >= 0n ? amountNumber(contextYuan(component)) : null;
        } else if (key === 'netMargin') {
          company = ratio(
            amount(basis === 'parent' ? 'parentProfit' : 'netProfit'),
            amount('revenue')
          );
        } else if (key === 'ocfToRevenue') {
          company = ratio(amount('ocf'), amount('revenue'));
        } else if (key === 'receivableToRevenue') {
          company = ratio(amount('receivables'), amount('revenue'));
        } else if (key === 'grossMargin' || key === 'roe') {
          conflict ||= ratioConflict(rows, key);
          company = storedRatio(rows, key);
        } else if (key === 'revenueGrowth') {
          conflict ||= amountConflict(snapshot, priorPeriod, 'revenue');
          const revenue = contextFen(amount('revenue')),
            previous = contextFen(financialChartAmount(snapshot, priorPeriod, 'revenue'));
          if (priorRows.length) {
            company =
              revenue !== null && previous !== null && previous > 0n
                ? ratio(contextYuan(revenue - previous), contextYuan(previous))
                : null;
          } else {
            conflict ||= ratioConflict(rows, 'revenueGrowth');
            company = storedRatio(rows, 'revenueGrowth');
          }
        } else {
          company = amountNumber(
            amount(key === 'profit' ? (basis === 'parent' ? 'parentProfit' : 'netProfit') : key)
          );
        }
        const saved = industries?.[period],
          industry =
            saved?.version === 1 &&
            saved.securityCode === snapshot.securityCode &&
            saved.period === period
              ? saved
              : null,
          metric = industry ? peerMetric(industry, key, basis) : undefined,
          count =
            metric && Number.isSafeInteger(metric.count) && metric.count >= 0 ? metric.count : null,
          minimum = Math.max(
            5,
            industry && Number.isSafeInteger(industry.minimumSamples) ? industry.minimumSamples : 5
          ),
          completePeers =
            industry &&
            Number.isSafeInteger(industry.peerCount) &&
            industry.peerCount >= minimum &&
            count !== null &&
            count <= industry.peerCount,
          peer =
            !conflict && completePeers && count !== null && count >= minimum
              ? finite(metric?.mean)
              : null;
        return { period, company: conflict ? null : company, peer, count };
      }),
    ])
  ) as Record<FinancialChartKey, FinancialChartPoint[]>;
}
