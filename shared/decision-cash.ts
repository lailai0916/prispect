import type { DatedCashInput } from './decision-contracts.js';

export interface DatedCashEvent {
  day: number;
  date: string;
  openingBalance: string;
  inflow: string;
  outflow: string;
  balance: string;
  outflowFirstBalance: string;
  sameDayOrderSensitive: boolean;
  flowIds: string[];
  includesProposal: boolean;
}
export interface DatedCashResult {
  status: 'known' | 'unknown';
  missingFields: string[];
  events: DatedCashEvent[];
  periodEnds: { day: 30 | 60 | 90; balance: string | null }[];
  minimumBalance: string | null;
  conservativeMinimumBalance: string | null;
  firstShortfallDay: number | null;
  firstShortfallGap: string | null;
  maximumGap: string | null;
  conservativeMaximumGap: string | null;
  sameDayOrderSensitive: boolean;
  maximumAdditionalPayment: string | null;
  thresholdStatus: 'known' | 'unknown' | 'baseline-below-floor';
  minimumCollectionPercent: number | null;
  minimumCollectionStatus: 'known' | 'unknown' | 'not-achievable';
}
export interface DatedCashComparison {
  primary: DatedCashResult;
  alternative: DatedCashResult;
  calculationBasis: 'user-entered-scenario';
  sameDayBasis: 'outflows-first-bound';
}

function fen(value: string): bigint {
  if (!/^\d{1,20}(?:\.\d{1,2})?$/.test(value))
    throw new RangeError('Dated cash amounts require nonnegative CNY with at most two decimals');
  const [whole, decimals = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(decimals.padEnd(2, '0'));
}
function yuan(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
function parseYuan(value: string): bigint {
  return value.startsWith('-') ? -fen(value.slice(1)) : fen(value);
}
function validDay(day: number | null): void {
  if (day !== null && (!Number.isInteger(day) || day < 1 || day > 90))
    throw new RangeError('Cash event dates must be days 1 through 90');
}
function dateAt(asOf: string, day: number): string {
  const date = new Date(`${asOf}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + day);
  return date.toISOString().slice(0, 10);
}
function validate(input: DatedCashInput, proposalDay: number | null): string[] {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.asOf) ||
    !Number.isFinite(Date.parse(`${input.asOf}T00:00:00Z`)) ||
    new Date(`${input.asOf}T00:00:00Z`).toISOString().slice(0, 10) !== input.asOf
  )
    throw new RangeError('Cash calculation requires a valid ISO calendar date');
  validDay(proposalDay);
  validDay(input.alternativeDay);
  fen(input.cashFloor);
  const missing: string[] = [];
  if (input.openingCash === null) missing.push('openingCash');
  else fen(input.openingCash);
  if (input.proposedAmount === null) missing.push('proposedAmount');
  else fen(input.proposedAmount);
  if (proposalDay === null) missing.push('proposedDay');
  const ids = new Set<string>();
  for (const flow of input.flows) {
    if (!flow.id || ids.has(flow.id)) throw new RangeError('Cash event IDs must be unique');
    ids.add(flow.id);
    if (!['in', 'out'].includes(flow.direction)) throw new RangeError('Invalid cash direction');
    validDay(flow.day);
    if (flow.day === null) missing.push(`flows.${flow.id}.day`);
    if (flow.amount === null) missing.push(`flows.${flow.id}.amount`);
    else fen(flow.amount);
  }
  return missing;
}
function unknown(missingFields: string[]): DatedCashResult {
  return {
    status: 'unknown',
    missingFields,
    events: [],
    periodEnds: [30, 60, 90].map((day) => ({ day: day as 30 | 60 | 90, balance: null })),
    minimumBalance: null,
    conservativeMinimumBalance: null,
    firstShortfallDay: null,
    firstShortfallGap: null,
    maximumGap: null,
    conservativeMaximumGap: null,
    sameDayOrderSensitive: false,
    maximumAdditionalPayment: null,
    thresholdStatus: 'unknown',
    minimumCollectionPercent: null,
    minimumCollectionStatus: 'unknown',
  };
}

function path(
  input: DatedCashInput,
  proposalDay: number,
  proposalAmount: bigint,
  collectionPercent = 100
) {
  const groups = new Map<number, { inflow: bigint; outflow: bigint; ids: string[] }>();
  for (const flow of input.flows) {
    const group = groups.get(flow.day!) || { inflow: 0n, outflow: 0n, ids: [] };
    if (flow.direction === 'in')
      group.inflow += (fen(flow.amount!) * BigInt(collectionPercent)) / 100n;
    else group.outflow += fen(flow.amount!);
    group.ids.push(flow.id);
    groups.set(flow.day!, group);
  }
  const proposal = groups.get(proposalDay) || { inflow: 0n, outflow: 0n, ids: [] };
  proposal.outflow += proposalAmount;
  groups.set(proposalDay, proposal);
  let balance = fen(input.openingCash!);
  const events: DatedCashEvent[] = [];
  const floor = fen(input.cashFloor);
  let minimum = balance;
  let conservativeMinimum = balance;
  let firstShortfallDay: number | null = balance < floor ? 0 : null;
  let firstShortfallGap: bigint | null = balance < floor ? floor - balance : null;
  for (const [day, group] of [...groups].sort(([a], [b]) => a - b)) {
    const opening = balance;
    const outflowFirst = opening - group.outflow;
    balance = outflowFirst + group.inflow;
    if (balance < minimum) minimum = balance;
    if (outflowFirst < conservativeMinimum) conservativeMinimum = outflowFirst;
    if (firstShortfallDay === null && balance < floor) {
      firstShortfallDay = day;
      firstShortfallGap = floor - balance;
    }
    events.push({
      day,
      date: dateAt(input.asOf, day),
      openingBalance: yuan(opening),
      inflow: yuan(group.inflow),
      outflow: yuan(group.outflow),
      balance: yuan(balance),
      outflowFirstBalance: yuan(outflowFirst),
      sameDayOrderSensitive:
        group.inflow > 0n && group.outflow > 0n && outflowFirst < floor && balance >= floor,
      flowIds: group.ids,
      includesProposal: day === proposalDay,
    });
  }
  const periodEnds = ([30, 60, 90] as const).map((day) => {
    let value = input.openingCash!;
    for (const event of events) if (event.day <= day) value = event.balance;
    return { day, balance: yuan(parseYuan(value)) };
  });
  return { events, periodEnds, minimum, conservativeMinimum, firstShortfallDay, firstShortfallGap };
}

// This arithmetic uses explicit user scenarios. Evidence availability is evaluated separately.
// Day 0 is the as-of date; day 1 is the following calendar date. Same-day order is not inferred.
export function calculateDatedCash(
  input: DatedCashInput,
  proposalDay: number | null = input.proposedDay
): DatedCashResult {
  const missing = validate(input, proposalDay);
  if (missing.length) return unknown(missing);
  const floor = fen(input.cashFloor);
  const computed = path(input, proposalDay!, fen(input.proposedAmount!));
  const baseline = path(input, proposalDay!, 0n);
  // The cash at the proposed date can exceed the opening cash; only future check points constrain it.
  const futureBounds = baseline.events
    .filter((event) => event.day >= proposalDay!)
    .map((event) => parseYuan(event.outflowFirstBalance));
  const threshold = futureBounds.reduce(
    (low, value) => (value < low ? value : low),
    futureBounds[0]!
  );
  let minimumCollectionPercent: number | null = null;
  for (let percent = 0; percent <= 100; percent++) {
    if (
      path(input, proposalDay!, fen(input.proposedAmount!), percent).conservativeMinimum >= floor
    ) {
      minimumCollectionPercent = percent;
      break;
    }
  }
  const baselineBelow = baseline.conservativeMinimum < floor;
  return {
    status: 'known',
    missingFields: [],
    events: computed.events,
    periodEnds: computed.periodEnds,
    minimumBalance: yuan(computed.minimum),
    conservativeMinimumBalance: yuan(computed.conservativeMinimum),
    firstShortfallDay: computed.firstShortfallDay,
    firstShortfallGap:
      computed.firstShortfallGap === null ? null : yuan(computed.firstShortfallGap),
    maximumGap: yuan(computed.minimum < floor ? floor - computed.minimum : 0n),
    conservativeMaximumGap: yuan(
      computed.conservativeMinimum < floor ? floor - computed.conservativeMinimum : 0n
    ),
    sameDayOrderSensitive: computed.events.some((event) => event.sameDayOrderSensitive),
    maximumAdditionalPayment: yuan(threshold > floor ? threshold - floor : 0n),
    thresholdStatus: baselineBelow ? 'baseline-below-floor' : 'known',
    minimumCollectionPercent,
    minimumCollectionStatus: minimumCollectionPercent === null ? 'not-achievable' : 'known',
  };
}
export function compareDatedCash(input: DatedCashInput): DatedCashComparison {
  return {
    primary: calculateDatedCash(input, input.proposedDay),
    alternative: calculateDatedCash(input, input.alternativeDay),
    calculationBasis: 'user-entered-scenario',
    sameDayBasis: 'outflows-first-bound',
  };
}
