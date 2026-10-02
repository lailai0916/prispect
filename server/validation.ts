import { z } from 'zod';
import { CONTEXT_NOTE_KEYS, type Material } from '../shared/contracts.js';

export const metricKeys = [
  'netProfit',
  'operatingCashFlow',
  'inventoryAdjustment',
  'receivablesAdjustment',
  'payablesAdjustment',
  'otherAdjustments',
] as const;
const amount = z.string().regex(/^-?\d{1,20}(?:\.\d{1,10})?$/, '金额必须为精确十进制字符串');
const page = z.number().int().min(1).max(100000).nullable();
const datePattern = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
function isCalendarDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    value.slice(0, 4) !== '0000' &&
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
const safeUrl = z
  .string()
  .url()
  .max(2048)
  .refine((value) => /^https?:\/\//.test(value), '来源链接只接受 HTTP(S)');
const observation = z.object({
  id: z.string().min(1).max(200),
  key: z.enum(metricKeys),
  year: z.number().int().min(1900).max(2200),
  value: amount,
  unit: z.enum(['yuan', 'wan', 'yi', 'usd']),
  currency: z.string().regex(/^[A-Z]{3}$/),
  scope: z.enum(['consolidated', 'parent', 'unknown']),
  period: z.enum(['annual', 'interim', 'quarterly', 'unknown']).optional(),
  page,
  quote: z.string().max(1200),
  kind: z.enum(['reported', 'derived']),
  components: z
    .array(
      z.object({
        label: z.string().min(1).max(200),
        value: amount,
        page,
        quote: z.string().max(1200),
      })
    )
    .max(100)
    .optional(),
});
export const materialInputSchema = z.object({
  company: z.string().trim().min(1).max(200),
  shortName: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(240),
  filename: z
    .string()
    .min(1)
    .max(240)
    .refine((name) => !/[\\/\x00]/.test(name), '文件名不能含路径'),
  origin: z.enum(['public-report', 'user-upload']),
  documentDate: datePattern.refine(isCalendarDate, '披露日期必须是有效的 YYYY-MM-DD 日期'),
  sourceUrl: safeUrl.optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  observations: z.array(observation).max(500),
  notes: z.array(z.string().max(2000)).max(100),
  excerpts: z
    .array(z.object({ page: z.number().int().min(1).max(100000), text: z.string().max(4000) }))
    .max(100),
  rawSourceId: z
    .string()
    .regex(/^[a-z0-9-]{1,80}$/)
    .optional(),
  uploadId: z.string().uuid().optional(),
  managementExplanation: z.string().max(2000).optional(),
});
// Stored materials may include two server provenance notes in addition to the
// user's hundred notes. Imported input retains its existing hundred-note limit.
const savedMaterialSchema = materialInputSchema.extend({
  notes: z.array(z.string().max(2000)).max(102),
  // Older versions accepted calendar-invalid dates. Keep those saved declarations
  // readable without normalizing them into different dates or replacing history.
  documentDate: datePattern,
});
// Retain the legacy request field while making AI part of every new analysis.
export const modelEnabledSchema = z
  .boolean()
  .optional()
  .transform(() => true);
export const taskInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(200),
  year: z.number().int().min(1901).max(2200),
  materialIds: z
    .array(z.string().min(1).max(200))
    .min(1)
    .max(30)
    .refine((ids) => new Set(ids).size === ids.length, '材料不能重复选择'),
  excludedMetrics: z.array(z.enum(metricKeys)).max(6).optional(),
  useModel: modelEnabledSchema,
  purpose: z.enum(['external', 'handover']).default('external'),
});

const cashPlanAmount = z
  .string()
  .regex(/^\d{1,20}(?:\.\d{1,2})?$/, '资金金额须为非负人民币元字符串，最多两位小数')
  .refine((value) => value.trim() === value, '资金金额不能含空白');
const cashPlanDate = datePattern.refine(isCalendarDate, '资金计划日期必须是有效的 YYYY-MM-DD 日期');
function cashPeriod<const Days extends 30 | 60 | 90>(days: Days) {
  return z
    .object({
      days: z.literal(days),
      inflow: cashPlanAmount.nullable(),
      outflow: cashPlanAmount.nullable(),
    })
    .strict();
}
export const cashPlanInputSchema = z
  .object({
    asOf: cashPlanDate,
    openingCash: cashPlanAmount.nullable(),
    periods: z.tuple([cashPeriod(30), cashPeriod(60), cashPeriod(90)]),
  })
  .strict();
const contextNotesSchema = z
  .unknown()
  .superRefine((input, context) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      context.addIssue({ code: 'custom', message: '场景备注必须为清单事项对象' });
      return;
    }
    for (const key of Object.keys(input))
      if (!(CONTEXT_NOTE_KEYS as readonly string[]).includes(key))
        context.addIssue({ code: 'custom', message: '场景备注事项不在支持清单中', path: [key] });
  })
  .pipe(
    z.partialRecord(
      z.enum(CONTEXT_NOTE_KEYS),
      z.object({ done: z.boolean(), note: z.string().max(2000) }).strict()
    )
  );
export const taskContextSchema = z
  .object({
    purpose: z.enum(['external', 'handover']).optional(),
    contextNotes: contextNotesSchema.optional(),
    cashPlan: cashPlanInputSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.purpose !== undefined ||
      value.contextNotes !== undefined ||
      value.cashPlan !== undefined,
    '场景更新至少需要用途、备注或资金计划'
  );
export class ApiFault extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}
export function moneyToFen(value: string, unit: 'yuan' | 'wan' | 'yi' | 'usd'): bigint {
  if (!/^-?\d{1,20}(?:\.\d{1,10})?$/.test(value)) throw new Error('金额格式无效');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const exponent = { yuan: 2, wan: 6, yi: 10, usd: 2 }[unit];
  if (fraction.length > exponent && /[1-9]/.test(fraction.slice(exponent)))
    throw new Error('金额精度小于最小分位，不能无声舍入');
  const result =
    BigInt(whole!) * 10n ** BigInt(exponent) +
    BigInt(fraction.slice(0, exponent).padEnd(exponent, '0') || '0');
  return negative ? -result : result;
}
export function fenToYuan(value: bigint): string {
  const abs = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}
export function percent(numerator: bigint, denominator: bigint): string | null {
  if (denominator <= 0n) return null;
  const signed = numerator * 10000n;
  const absolute = signed < 0n ? -signed : signed;
  const rounded = (absolute + denominator / 2n) / denominator;
  return `${signed < 0n ? '-' : ''}${rounded / 100n}.${(rounded % 100n).toString().padStart(2, '0')}`;
}
export function validateMaterial(
  input: unknown,
  options: { saved?: boolean } = {}
): Omit<Material, 'id' | 'createdAt'> {
  const result = (options.saved ? savedMaterialSchema : materialInputSchema).safeParse(input);
  if (!result.success)
    throw new ApiFault(
      400,
      'INVALID_MATERIAL',
      result.error.issues[0]?.message || '材料字段不合法'
    );
  const ids = result.data.observations.map((item) => item.id);
  if (new Set(ids).size !== ids.length)
    throw new ApiFault(400, 'DUPLICATE_OBSERVATION', '同一材料中的观测 ID 不得重复');
  try {
    for (const item of result.data.observations) {
      moneyToFen(item.value, item.unit);
      for (const component of item.components || []) moneyToFen(component.value, item.unit);
    }
  } catch (error) {
    throw new ApiFault(
      400,
      'INVALID_PRECISION',
      error instanceof Error ? error.message : '金额精度无效'
    );
  }
  return result.data;
}
