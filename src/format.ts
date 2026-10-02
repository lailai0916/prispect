import type { ComputedMetric, MoneyUnit } from '../shared/contracts';

export type Locale = 'zh-Hans' | 'en';

export function money(value: string | null, locale: Locale, compact = true): string {
  if (value === null || value === undefined) return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (!compact) {
    const sign = value.startsWith('-') ? '-' : '';
    const [integer, fraction] = value.replace(/^-/, '').split('.');
    return `${sign}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
  }
  if (locale === 'en') {
    if (Math.abs(number) >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(2)}b`;
    if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}m`;
    if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(2)}k`;
  }
  if (Math.abs(number) >= 100_000_000) {
    return `${(number / 100_000_000).toFixed(2)}${locale === 'en' ? ' × 100m' : ' 亿'}`;
  }
  if (Math.abs(number) >= 10_000) {
    return `${(number / 10_000).toFixed(2)}${locale === 'en' ? ' × 10k' : ' 万'}`;
  }
  return money(value, locale, false);
}

export function metricValue(metric: ComputedMetric | undefined, locale: Locale): string {
  if (!metric || metric.value === null) return '—';
  if (metric.unit === '%') return `${Number(metric.value).toFixed(2)}%`;
  if (metric.unit === 'USD') return `$${money(metric.value, locale)}`;
  return money(metric.value, locale);
}

export function yuan(value: string, unit: MoneyUnit): string {
  const sign = value.startsWith('-') ? '-' : '';
  const [integer = '0', fraction = ''] = value.replace(/^-/, '').split('.');
  const shift = unit === 'yi' ? 8 : unit === 'wan' ? 4 : 0;
  const digits = fraction.padEnd(shift, '0');
  const whole = (integer + digits.slice(0, shift)).replace(/^0+(?=\d)/, '');
  const remainder = digits.slice(shift);
  return `${sign}${whole}${remainder ? `.${remainder}` : ''}`;
}

let displayTimeZone = 'Asia/Shanghai';

/** The single browser app applies the confirmed account preference on session changes. */
export function setDisplayTimeZone(timeZone?: string): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timeZone || 'Asia/Shanghai' });
    displayTimeZone = timeZone || 'Asia/Shanghai';
  } catch {
    displayTimeZone = 'Asia/Shanghai';
  }
}

export function date(value: string, locale: Locale): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '—';
  return parsed.toLocaleString(locale, {
    timeZone: displayTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export const metricNames = {
  netProfit: ['合并净利润', 'Consolidated net profit'],
  operatingCashFlow: ['经营现金净额', 'Operating cash flow'],
  inventoryAdjustment: ['存货调整', 'Inventory adjustment'],
  receivablesAdjustment: ['经营性应收调整', 'Operating receivables'],
  payablesAdjustment: ['经营性应付调整', 'Operating payables'],
  otherAdjustments: ['其余已披露调整', 'Other disclosed adjustments'],
  cashConversion: ['现金利润比', 'Cash-to-profit ratio'],
  profitGrowth: ['净利润同比', 'Profit change (YoY %)'],
  cashGrowth: ['经营现金同比', 'Operating cash change (YoY %)'],
  profitChange: ['净利润变动额', 'Profit amount change'],
  cashChange: ['经营现金变动额', 'Operating cash amount change'],
} as const;

export function metricName(key: keyof typeof metricNames, locale: Locale): string {
  return metricNames[key][locale === 'en' ? 1 : 0];
}

export function chartScale(maximum: number, range: number, locale: Locale, ticks: number) {
  const absolute = Math.abs(maximum);
  const divisor =
    locale === 'en'
      ? absolute >= 1e9
        ? 1e9
        : absolute >= 1e6
          ? 1e6
          : absolute >= 1e3
            ? 1e3
            : 1
      : absolute >= 1e8
        ? 1e8
        : absolute >= 1e4
          ? 1e4
          : 1;
  const label =
    locale === 'en'
      ? `CNY${divisor === 1e9 ? ' bn' : divisor === 1e6 ? ' m' : divisor === 1e3 ? ' k' : ''}`
      : divisor === 1e8
        ? '亿元'
        : divisor === 1e4
          ? '万元'
          : '元';
  const step = range / divisor / ticks;
  const digits = step >= 10 ? 0 : step >= 0.1 ? 1 : Math.min(6, Math.ceil(-Math.log10(step)) + 1);
  return { divisor, label, digits };
}

export function baseReviewTitle(title: string): string {
  return title
    .replace(
      /(?:\s*·\s*(?:压力测试|Stress test|调整证据|Evidence adjusted|恢复完整证据|Full evidence restored|恢复完整输入|Full input restored|复核|Review copy))+\s*$/g,
      ''
    )
    .trim();
}

export function reviewVariantTitle(title: string, variant: string): string {
  return `${baseReviewTitle(title).slice(0, 200 - variant.length - 3)} · ${variant}`;
}
