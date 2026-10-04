/** Read-only report chart adapters. All inputs belong to the selected document generation. */
import type { AssessmentMetric } from './company-assessment.js';
import type { CompanyReportDocumentDimension } from './company-report-document.js';
import { contextFen, contextYuan } from './company-analysis.js';

export type ReportChartAvailability =
  | 'available'
  | 'missing'
  | 'conflict'
  | 'invalid-scope'
  | 'invalid-value'
  | 'not-applicable';

export interface ReportChartAmount {
  metricId: string;
  state: ReportChartAvailability;
  /** Integer fen is retained for labels, differences and ratios; floats are geometry only. */
  fen: bigint | null;
}

export interface ReportProfitCashPeriod {
  year: number;
  profit: ReportChartAmount;
  cash: ReportChartAmount;
  ratio: { state: ReportChartAvailability; value: string | null };
  differenceFen: bigint | null;
}

function reportAmount(facts: readonly AssessmentMetric[], metricId: string): ReportChartAmount {
  const candidates = facts.filter((fact) => fact.id === metricId);
  const empty = (state: ReportChartAvailability): ReportChartAmount => ({
    metricId,
    state,
    fen: null,
  });
  if (candidates.length > 1) return empty('conflict');
  const fact = candidates[0];
  if (!fact) return empty('missing');
  if (fact.status !== 'available') return empty(fact.status);
  if (fact.unit !== 'CNY') return empty('invalid-scope');
  const fen = contextFen(fact.value);
  return fen === null ? empty('invalid-value') : { metricId, state: 'available', fen };
}

/** Exactly the selected year and two preceding years: gaps never borrow an earlier annual. */
export function deriveReportProfitCashPeriods(
  facts: readonly AssessmentMetric[],
  year: number
): ReportProfitCashPeriod[] {
  if (!Number.isInteger(year) || year < 1902 || year > 9999) return [];
  return [year - 2, year - 1, year].map((periodYear) => {
    const profit = reportAmount(facts, `${periodYear}-netProfit`);
    const cash = reportAmount(facts, `${periodYear}-ocf`);
    let ratio: ReportProfitCashPeriod['ratio'];
    if (profit.fen === null || cash.fen === null) {
      ratio = {
        state: [profit.state, cash.state].includes('conflict') ? 'conflict' : 'missing',
        value: null,
      };
    } else if (profit.fen <= 0n) {
      ratio = { state: 'not-applicable', value: null };
    } else {
      const magnitude = cash.fen < 0n ? -cash.fen : cash.fen;
      // Percent with two decimal places, half away from zero, without float division.
      const hundredths = (magnitude * 10_000n + profit.fen / 2n) / profit.fen;
      ratio = {
        state: 'available',
        value: `${cash.fen < 0n && hundredths !== 0n ? '-' : ''}${hundredths / 100n}.${String(hundredths % 100n).padStart(2, '0')}`,
      };
    }
    return {
      year: periodYear,
      profit,
      cash,
      ratio,
      differenceFen: profit.fen !== null && cash.fen !== null ? profit.fen - cash.fen : null,
    };
  });
}

/** Exact yuan for evidence tables; locale grouping is a presentation concern. */
export function reportChartExactAmount(fen: bigint): string {
  return contextYuan(fen);
}

/** Compact labels use one shared unit. Keep small nonzero amounts from rounding to zero. */
export function reportChartScaledAmount(fen: bigint, divisor: number, digits = 2): string {
  if (!Number.isSafeInteger(divisor) || divisor < 1) throw new RangeError('Invalid amount unit');
  const denominator = BigInt(divisor) * 100n;
  const magnitude = fen < 0n ? -fen : fen;
  let precision = Math.max(0, Math.min(12, Math.floor(digits)));
  while (magnitude !== 0n && precision < 12 && magnitude * 10n ** BigInt(precision) < denominator)
    precision++;
  const factor = 10n ** BigInt(precision);
  const rounded = (magnitude * factor + denominator / 2n) / denominator;
  const sign = fen < 0n && rounded !== 0n ? '-' : '';
  return precision
    ? `${sign}${rounded / factor}.${String(rounded % factor).padStart(precision, '0')}`
    : `${sign}${rounded}`;
}

export const REPORT_RADAR_DIMENSIONS = [
  'profitability',
  'cash',
  'solvency',
  'workingCapital',
] as const;

export interface ReportRadarPoint {
  id: (typeof REPORT_RADAR_DIMENSIONS)[number];
  score: number | null;
  state: 'available' | 'unknown' | 'conflict';
}

/** Scores are read from the document, never computed from a visual or averaged here. */
export function deriveReportRadarPoints(
  dimensions: readonly CompanyReportDocumentDimension[]
): ReportRadarPoint[] {
  return REPORT_RADAR_DIMENSIONS.map((id) => {
    const candidates = dimensions.filter((dimension) => dimension.id === id);
    const dimension = candidates[0];
    if (candidates.length > 1 || dimension?.status === 'conflict')
      return { id, score: null, state: 'conflict' };
    if (
      !dimension ||
      dimension.status === 'unknown' ||
      dimension.score === null ||
      !Number.isFinite(dimension.score) ||
      dimension.score < 0 ||
      dimension.score > 100
    )
      return { id, score: null, state: 'unknown' };
    return { id, score: dimension.score, state: 'available' };
  });
}
