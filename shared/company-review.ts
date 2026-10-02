import type { CompanyResearchRun } from './contracts.js';
import type { CompanyContextPeriod, ContextAmountField } from './company-workspace.js';
import { contextFen, contextRatio, contextYuan } from './company-analysis.js';

export interface CompanyReviewSummary {
  year: number;
  row: CompanyContextPeriod | null;
  profit: string | null;
  cash: string | null;
  ratio: number | null;
  difference: string | null;
  relation: 'below' | 'at-or-above' | 'nonpositive' | 'missing' | 'conflict';
  missing: ContextAmountField[];
  conflicts: ContextAmountField[];
}

/** A preliminary public-data summary, never an adoption of original-report candidates. */
export function companyReviewSummary(run: CompanyResearchRun): CompanyReviewSummary {
  const year = run.input.year;
  const snapshot = run.context;
  const sameEntity =
    snapshot?.securityCode === run.input.securityCode && snapshot.orgId === run.input.orgId;
  const rows = sameEntity
    ? snapshot.financials.filter((row) => row.annual && row.period === year + '-12-31')
    : [];
  const row = rows[0] || null;
  const conflicts: ContextAmountField[] = [];
  const amount = (field: 'netProfit' | 'ocf'): string | null => {
    if (snapshot && !sameEntity) {
      conflicts.push(field);
      return null;
    }
    const values = rows.map((item) => contextFen(item.amounts[field]));
    const sourceConflict = snapshot?.comparisons.some(
      (item) => item.period === year + '-12-31' && item.field === field && !item.matches
    );
    const known = values.filter((value) => value !== null);
    const different = known.some((value) => value !== known[0]);
    if (sourceConflict || different) {
      conflicts.push(field);
      return null;
    }
    if (!values.length || values.some((value) => value === null)) return null;
    return contextYuan(values[0]!);
  };
  const profit = amount('netProfit');
  const cash = amount('ocf');
  const p = contextFen(profit);
  const c = contextFen(cash);
  const missing: ContextAmountField[] = [];
  if (profit === null) missing.push('netProfit');
  if (cash === null) missing.push('ocf');
  const relation =
    conflicts.length > 0
      ? 'conflict'
      : p === null || c === null
        ? 'missing'
        : p <= 0n
          ? 'nonpositive'
          : c < p
            ? 'below'
            : 'at-or-above';
  return {
    year,
    row: sameEntity ? row : null,
    profit,
    cash,
    ratio: conflicts.length ? null : contextRatio(cash, profit),
    difference: p !== null && c !== null ? contextYuan(p - c) : null,
    relation,
    missing,
    conflicts,
  };
}
