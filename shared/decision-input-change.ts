import type { DecisionInput } from './decision-contracts.js';

const amountFields = new Set([
  'totalAmount',
  'alreadyPaid',
  'deliveredAmount',
  'actualRefund',
  'proposedAmount',
  'alternativeAmount',
  'exposureLimit',
  'openingCash',
  'cashFloor',
  'amount',
]);
function fingerprint(input: DecisionInput): string {
  return JSON.stringify(
    {
      ...input,
      tradingName: input.tradingName || '',
      claims: input.claims || [],
      external: input.purpose === 'external' ? input.external : null,
      datedCash: input.purpose === 'handover' ? input.datedCash : null,
    },
    (key, value: unknown) => {
      if (value !== null && typeof value === 'object' && !Array.isArray(value))
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      if (!amountFields.has(key) || !/^\d{1,20}(?:\.\d{1,2})?$/.test(trimmed)) return trimmed;
      const [whole, fraction = ''] = trimmed.split('.');
      return `${whole!.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
    }
  );
}

/** Display-only dirty state. It does not evaluate, save, or replace the current result. */
export function hasDecisionInputChanges(input: DecisionInput, saved: DecisionInput): boolean {
  return fingerprint(input) !== fingerprint(saved);
}
