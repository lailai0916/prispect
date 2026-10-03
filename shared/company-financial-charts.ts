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
  unit: 'amount' | 'percent';
  style: 'bars' | 'lines' | 'dumbbell';
  fields: ContextAmountField[];
}

export const financialChartFields: Record<FinancialChartKey, FinancialChartField> = {
  revenue: { label: ['营业总收入', 'Revenue'], unit: 'amount', style: 'bars', fields: ['revenue'] },
  profit: { label: ['净利润', 'Net profit'], unit: 'amount', style: 'bars', fields: ['netProfit'] },
  ocf: {
    label: ['经营现金净额', 'Operating cash flow'],
    unit: 'amount',
    style: 'bars',
    fields: ['ocf'],
  },
  cash: { label: ['货币资金', 'Monetary funds'], unit: 'amount', style: 'bars', fields: ['cash'] },
  shortDebt: {
    label: ['两项短债合计', 'Two specified debt items'],
    unit: 'amount',
    style: 'bars',
    fields: ['shortLoan', 'currentPortionDebt'],
  },
  inventory: { label: ['存货', 'Inventory'], unit: 'amount', style: 'bars', fields: ['inventory'] },
  receivables: {
    label: ['应收账款', 'Accounts receivable'],
    unit: 'amount',
    style: 'bars',
    fields: ['receivables'],
  },
  grossMargin: { label: ['毛利率', 'Gross margin'], unit: 'percent', style: 'lines', fields: [] },
  netMargin: {
    label: ['净利率', 'Net margin'],
    unit: 'percent',
    style: 'lines',
    fields: ['netProfit', 'revenue'],
  },
  roe: { label: ['加权 ROE', 'Weighted ROE'], unit: 'percent', style: 'bars', fields: [] },
  ocfToRevenue: {
    label: ['经营现金 / 营收', 'Operating cash / revenue'],
    unit: 'percent',
    style: 'lines',
    fields: ['ocf', 'revenue'],
  },
  receivableToRevenue: {
    label: ['应收账款 / 营收', 'Receivables / revenue'],
    unit: 'percent',
    style: 'dumbbell',
    fields: ['receivables', 'revenue'],
  },
  revenueGrowth: {
    label: ['营收同比增长', 'Revenue growth'],
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
    keys: ['profit', 'ocf', 'ocfToRevenue'],
  },
  {
    id: 'income',
    label: ['收入与利润', 'Income and profit'],
    keys: ['revenue', 'profit', 'revenueGrowth'],
  },
  {
    id: 'debt',
    label: ['货币资金与负债', 'Funds and liabilities'],
    keys: ['cash', 'shortDebt', 'inventory', 'receivables'],
  },
  {
    id: 'ratios',
    label: ['关键比率', 'Key ratios'],
    keys: ['grossMargin', 'roe', 'netMargin', 'receivableToRevenue'],
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
