import type { CashPlanInput } from './contracts.js';
import { calculateCashPlan, type CashPlanCalculation } from './cash-plan.js';

export interface CashStressSettings {
  collectionPercent: number;
  delayDays: 0 | 30;
  extraOutflow: string;
}
export interface CashStressResult {
  baseline: CashPlanCalculation;
  stressed: CashPlanCalculation;
  delayedBeyondHorizon: string | null;
  uncollected: string | null;
  firstNegativePeriod: 30 | 60 | 90 | null;
  maxGap: string | null;
  minimumCollectionPercent: number | null;
  minimumStatus: 'known' | 'unknown' | 'not-achievable';
  inputStatus: 'known' | 'unknown';
}

function fen(value: string): bigint {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new RangeError('Cash assumptions require nonnegative CNY with at most two decimals');
  const [whole, decimals = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(decimals.padEnd(2, '0'));
}
function yuan(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
function scenario(plan: CashPlanInput, settings: CashStressSettings): CashPlanInput {
  const scaled = plan.periods.map((period) =>
    period.inflow === null
      ? null
      : yuan((fen(period.inflow) * BigInt(settings.collectionPercent)) / 100n)
  );
  return {
    asOf: plan.asOf,
    openingCash: plan.openingCash,
    periods: plan.periods.map((period, index) => ({
      days: period.days,
      inflow:
        settings.delayDays === 30 ? (index === 0 ? '0.00' : scaled[index - 1]!) : scaled[index]!,
      outflow: period.outflow,
    })) as CashPlanInput['periods'],
  };
}

function stressedCalculation(
  plan: CashPlanInput,
  settings: CashStressSettings
): CashPlanCalculation {
  const calculated = calculateCashPlan(scenario(plan, settings));
  const extra = fen(settings.extraOutflow);
  return {
    ...calculated,
    periods: calculated.periods.map((period, index) => {
      const originalBalance = period.balance;
      const balance =
        originalBalance === null
          ? null
          : (originalBalance.startsWith('-')
              ? -fen(originalBalance.slice(1))
              : fen(originalBalance)) - extra;
      return {
        ...period,
        outflow:
          index === 0 && period.outflow !== null
            ? yuan(fen(period.outflow) + extra)
            : period.outflow,
        balance: balance === null ? null : yuan(balance),
        gap: balance === null ? null : yuan(balance < 0n ? -balance : 0n),
      };
    }),
  };
}

export function calculateCashStress(
  plan: CashPlanInput,
  settings: CashStressSettings
): CashStressResult {
  if (
    !Number.isInteger(settings.collectionPercent) ||
    settings.collectionPercent < 0 ||
    settings.collectionPercent > 100 ||
    ![0, 30].includes(settings.delayDays)
  )
    throw new RangeError(
      'Stress settings require an integer collection percentage and 0/30-day delay'
    );
  if (!/^\d{1,20}(?:\.\d{1,2})?$/.test(settings.extraOutflow))
    throw new RangeError('Extra payment requires nonnegative CNY with at most two decimals');
  const baseline = calculateCashPlan(plan);
  const stressed = stressedCalculation(plan, settings);
  const known = baseline.periods.every((period) => period.status === 'known');
  let minimumCollectionPercent: number | null = null;
  let minimumStatus: CashStressResult['minimumStatus'] = 'unknown';
  if (known) {
    minimumStatus = 'not-achievable';
    for (let percentage = 0; percentage <= 100; percentage++) {
      const candidate = stressedCalculation(plan, { ...settings, collectionPercent: percentage });
      if (
        candidate.periods.every(
          (period) => period.balance !== null && !period.balance.startsWith('-')
        )
      ) {
        minimumCollectionPercent = percentage;
        minimumStatus = 'known';
        break;
      }
    }
  }
  const originalLast = plan.periods[2].inflow;
  const delayedBeyondHorizon =
    settings.delayDays === 0
      ? '0.00'
      : originalLast === null
        ? null
        : yuan((fen(originalLast) * BigInt(settings.collectionPercent)) / 100n);
  // Sum the uncollected portion across all original intervals, including receipts shifted beyond day 90.
  const uncollected = plan.periods.some((period) => period.inflow === null)
    ? null
    : yuan(
        plan.periods.reduce((sum, period) => {
          const amount = fen(period.inflow!);
          return sum + amount - (amount * BigInt(settings.collectionPercent)) / 100n;
        }, 0n)
      );
  const negative = stressed.periods.find((period) => period.balance?.startsWith('-'));
  const maxGap = stressed.periods.some((period) => period.status === 'unknown')
    ? null
    : yuan(
        stressed.periods.reduce((maximum, period) => {
          const gap = fen(period.gap!);
          return gap > maximum ? gap : maximum;
        }, 0n)
      );
  return {
    baseline,
    stressed,
    delayedBeyondHorizon,
    uncollected,
    firstNegativePeriod: (negative?.days as 30 | 60 | 90 | undefined) ?? null,
    maxGap,
    minimumCollectionPercent,
    minimumStatus,
    inputStatus: known ? 'known' : 'unknown',
  };
}
