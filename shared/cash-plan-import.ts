import Papa from 'papaparse';
import type { DatedCashInput } from './decision-contracts.js';

export const CASH_PLAN_IMPORT_MAX_BYTES = 1024 * 1024;
export class CashPlanImportError extends Error {
  constructor(
    public readonly code: string,
    public readonly field?: string,
    public readonly row?: number
  ) {
    super(code);
    this.name = 'CashPlanImportError';
  }
}
export interface CashPlanImportDefaults {
  asOf?: string;
  cashFloor?: string;
  proposedAmount?: string | null;
  proposedDay?: number | null;
  alternativeDay?: number | null;
}
export interface CashPlanImportPreview {
  input: DatedCashInput;
  rowCount: number;
  warnings: ('missing-opening' | 'missing-flow-fields' | 'no-flows')[];
}
type Raw = Record<string, unknown>;
const headers: Record<string, string[]> = {
  id: ['id', '编号'],
  label: ['label', 'name', '名称', '事项'],
  direction: ['direction', '收付方向', '方向'],
  amount: ['amount', '金额', '金额（元）', '金额(元)'],
  day: ['day', '相对天数', '天数'],
  date: ['date', '日期'],
  asOf: ['asof', 'asOf', '起点日期', '基准日期'],
  openingCash: ['openingcash', 'openingCash', '起点现金'],
  cashFloor: ['cashfloor', 'cashFloor', '自设底线'],
  proposedAmount: ['proposedamount', 'proposedAmount', '本次拟付'],
  proposedDay: ['proposedday', 'proposedDay', '本次付款日'],
  alternativeDay: ['alternativeday', 'alternativeDay', '对照付款日'],
  flexibility: ['flexibility', '可调整性'],
  currency: ['currency', '币种'],
};
const aliases = new Map(
  Object.entries(headers).flatMap(([key, values]) =>
    values.map((value) => [value.toLowerCase(), key] as const)
  )
);
const blank = (v: unknown) => v === undefined || v === null || v === '';
function fail(code: string, field?: string, row?: number): never {
  throw new CashPlanImportError(code, field, row);
}
function amount(value: unknown, field: string, row?: number): string | null {
  if (blank(value)) return null;
  if (typeof value !== 'string' || !/^\d{1,20}(?:\.\d{1,2})?$/.test(value.trim()))
    fail('invalid-money', field, row);
  const [whole, fraction = ''] = value.trim().split('.');
  const cents = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
function date(value: unknown, field: string, row?: number): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim()))
    fail('invalid-date', field, row);
  const v = value.trim(),
    time = Date.parse(`${v}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== v)
    fail('invalid-date', field, row);
  return v;
}
function day(value: unknown, field: string, row?: number, csv = false): number | null {
  if (blank(value)) return null;
  if (csv && typeof value === 'string' && /^(?:D)?(?:[1-9]|[1-8]\d|90)$/i.test(value.trim()))
    value = Number(value.trim().replace(/^D/i, ''));
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 90)
    fail('invalid-day', field, row);
  return value;
}
function text(value: unknown, field: string, row: number, fallback?: string): string {
  if (blank(value) && fallback) return fallback;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200)
    fail('invalid-text', field, row);
  return value.trim();
}
function flow(
  raw: Raw,
  index: number,
  asOf: string,
  csv: boolean
): DatedCashInput['flows'][number] {
  const row = index + (csv ? 2 : 1);
  const directions: Record<string, 'in' | 'out'> = {
    in: 'in',
    out: 'out',
    收款: 'in',
    流入: 'in',
    付款: 'out',
    流出: 'out',
  };
  const direction =
    typeof raw.direction === 'string' ? directions[raw.direction.trim().toLowerCase()] : undefined;
  if (!direction || (!csv && raw.direction !== direction))
    fail('invalid-direction', 'direction', row);
  let relative = day(raw.day, 'day', row, csv);
  if (!blank(raw.date)) {
    const absolute = date(raw.date, 'date', row);
    const days = (Date.parse(`${absolute}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86400000;
    const fromDate = day(days, 'date', row);
    if (relative !== null && relative !== fromDate) fail('date-day-conflict', 'date', row);
    relative = fromDate;
  }
  const flexibility = blank(raw.flexibility) ? 'fixed' : raw.flexibility;
  if (flexibility !== 'fixed' && flexibility !== 'proposed')
    fail('invalid-flexibility', 'flexibility', row);
  return {
    id: text(raw.id, 'id', row, `import-${crypto.randomUUID()}`),
    label: text(raw.label, 'label', row, `Event ${index + 1}`),
    direction,
    amount: amount(raw.amount, 'amount', row),
    day: relative,
    flexibility,
  };
}
function finish(
  meta: Raw,
  rawFlows: Raw[],
  defaults: CashPlanImportDefaults,
  csv: boolean
): CashPlanImportPreview {
  if (rawFlows.length > 100) fail('too-many-flows');
  if (
    !blank(meta.currency) &&
    !['CNY', 'RMB', '人民币元'].includes(String(meta.currency).trim().toUpperCase())
  )
    fail('invalid-currency', 'currency');
  const fallback = (key: keyof CashPlanImportDefaults) =>
    Object.hasOwn(meta, key) ? meta[key] : defaults[key];
  const asOf = date(fallback('asOf'), 'asOf');
  const cashFloor = amount(fallback('cashFloor'), 'cashFloor');
  if (cashFloor === null) fail('missing-floor', 'cashFloor');
  const flows = rawFlows.map((item, index) => flow(item, index, asOf, csv));
  if (new Set(flows.map((item) => item.id)).size !== flows.length) fail('duplicate-id', 'id');
  const input: DatedCashInput = {
    asOf,
    openingCash: amount(meta.openingCash, 'openingCash'),
    cashFloor,
    proposedAmount: amount(fallback('proposedAmount'), 'proposedAmount'),
    proposedDay: day(fallback('proposedDay'), 'proposedDay', undefined, csv),
    alternativeDay: day(fallback('alternativeDay'), 'alternativeDay', undefined, csv),
    flows,
  };
  return {
    input,
    rowCount: flows.length,
    warnings: [
      ...(input.openingCash === null ? ['missing-opening' as const] : []),
      ...(flows.some((item) => item.amount === null || item.day === null)
        ? ['missing-flow-fields' as const]
        : []),
      ...(!flows.length ? ['no-flows' as const] : []),
    ],
  };
}
export function parseCashPlanImport(
  source: string,
  format: 'csv' | 'json',
  defaults: CashPlanImportDefaults = {}
): CashPlanImportPreview {
  if (new TextEncoder().encode(source).byteLength > CASH_PLAN_IMPORT_MAX_BYTES) fail('too-large');
  if (!source.trim()) fail('empty-file');
  if (format === 'json') {
    let value: unknown;
    try {
      value = JSON.parse(source.replace(/^\uFEFF/, ''));
    } catch {
      fail('invalid-json');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid-json');
    const raw = value as Raw;
    const permitted = new Set([
      'asOf',
      'openingCash',
      'cashFloor',
      'proposedAmount',
      'proposedDay',
      'alternativeDay',
      'flows',
    ]);
    if (Object.keys(raw).some((key) => !permitted.has(key)) || !Array.isArray(raw.flows))
      fail('unknown-field');
    const flowKeys = new Set(['id', 'label', 'direction', 'day', 'amount', 'flexibility']);
    if (
      raw.flows.some(
        (item) =>
          !item ||
          typeof item !== 'object' ||
          Array.isArray(item) ||
          Object.keys(item).some((key) => !flowKeys.has(key))
      )
    )
      fail('unknown-field');
    return finish(raw, raw.flows as Raw[], defaults, false);
  }
  const result = Papa.parse<string[]>(source, { skipEmptyLines: 'greedy', dynamicTyping: false });
  if (result.errors.length)
    fail(
      'invalid-csv',
      undefined,
      result.errors[0]!.row === undefined ? undefined : result.errors[0]!.row! + 1
    );
  const table = result.data;
  const rawHeaders = table.shift();
  if (!rawHeaders?.length) fail('empty-file');
  const keys = rawHeaders.map((header) =>
    aliases.get(
      header
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase()
    )
  );
  if (keys.some((key) => !key)) fail('unknown-header');
  if (new Set(keys).size !== keys.length) fail('duplicate-header');
  if (table.length > 100) fail('too-many-flows');
  const meta: Raw = {},
    flows: Raw[] = [];
  const globals = new Set([
    'asOf',
    'openingCash',
    'cashFloor',
    'proposedAmount',
    'proposedDay',
    'alternativeDay',
    'currency',
  ]);
  table.forEach((cells, index) => {
    if (cells.length !== keys.length) fail('invalid-csv', undefined, index + 2);
    const raw: Raw = {};
    cells.forEach((cell, column) => {
      const key = keys[column]!;
      const v = cell.trim();
      if (!globals.has(key)) raw[key] = v;
      else if (v) {
        const canonical = ['openingCash', 'cashFloor', 'proposedAmount'].includes(key)
          ? amount(v, key, index + 2)
          : ['proposedDay', 'alternativeDay'].includes(key)
            ? day(v, key, index + 2, true)
            : key === 'asOf'
              ? date(v, key, index + 2)
              : v;
        if (!blank(meta[key]) && meta[key] !== canonical) fail('metadata-conflict', key, index + 2);
        meta[key] = canonical;
      }
    });
    if (Object.values(raw).some((v) => !blank(v))) flows.push(raw);
  });
  return finish(meta, flows, defaults, true);
}

export const CASH_PLAN_CSV_TEMPLATE =
  '起点日期,起点现金,自设底线,名称,收付方向,金额（元）,day,日期\n,,,,,,,\n';
