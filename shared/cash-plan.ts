import type { CashPlanInput, CashPlanPeriod } from './contracts.js';

export interface CashPlanPeriodResult extends CashPlanPeriod {
  startDay: number;
  endDay: number;
  balance: string | null;
  status: 'known' | 'unknown';
  missingFields: string[];
  gap: string | null;
}
export interface CashPlanCalculation {
  openingCash: string | null;
  periods: CashPlanPeriodResult[];
}

// Only user-entered CNY assumptions are used. Historical report amounts are not inputs.
function parseFen(value: string): bigint {
  if (!/^\d{1,20}(?:\.\d{1,2})?$/.test(value) || value.trim() !== value)
    throw new RangeError(
      'Cash-plan amounts require nonnegative CNY decimal strings with at most two decimal places'
    );
  const [integer, fraction = ''] = value.split('.');
  return BigInt(integer!) * 100n + BigInt(fraction.padEnd(2, '0'));
}
function yuan(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

export function calculateCashPlan(plan: CashPlanInput): CashPlanCalculation {
  if (plan.periods.length !== 3)
    throw new RangeError('Cash plans require exactly three non-overlapping intervals');
  const missingFields: string[] = [];
  if (plan.openingCash === null) missingFields.push('openingCash');
  let balance = plan.openingCash === null ? null : parseFen(plan.openingCash);
  const periods = plan.periods.map((period, index) => {
    if (period.days !== [30, 60, 90][index])
      throw new RangeError('Cash-plan intervals must be ordered 30, 60 and 90 days');
    const inflow = period.inflow === null ? null : parseFen(period.inflow);
    const outflow = period.outflow === null ? null : parseFen(period.outflow);
    if (inflow === null) missingFields.push(`periods.${index}.inflow`);
    if (outflow === null) missingFields.push(`periods.${index}.outflow`);
    balance =
      balance === null || inflow === null || outflow === null ? null : balance + inflow - outflow;
    return {
      ...period,
      startDay: index === 0 ? 0 : [31, 61][index - 1]!,
      endDay: period.days,
      balance: balance === null ? null : yuan(balance),
      status: balance === null ? ('unknown' as const) : ('known' as const),
      missingFields: [...missingFields],
      gap: balance === null ? null : yuan(balance < 0n ? -balance : 0n),
    };
  });
  return {
    openingCash: plan.openingCash === null ? null : yuan(parseFen(plan.openingCash)),
    periods,
  };
}
