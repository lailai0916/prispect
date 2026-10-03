import { contextFen, contextYuan } from '../../shared/company-analysis';
import type { Locale } from '../format';

export type LiteAmountScale = 'yuan' | 'wan' | 'yi' | 'wanYi' | 'k' | 'm' | 'b' | 't';
export interface LiteAmountDisplay {
  /** Reading shorthand; never a replacement for the saved amount. */
  text: string;
  /** Complete, normalized CNY amount, accurate to fen. */
  exactText: string;
  exactYuan: string;
  approximate: boolean;
  scale: LiteAmountScale;
  unit: string;
}
const scaleFen: Record<LiteAmountScale, bigint> = {
  yuan: 100n,
  wan: 1_000_000n,
  yi: 10_000_000_000n,
  wanYi: 100_000_000_000_000n,
  k: 100_000n,
  m: 100_000_000n,
  b: 100_000_000_000n,
  t: 100_000_000_000_000n,
};

/** Choose once for every amount sharing a comparison or chart axis. */
export function liteAmountScale(
  values: readonly (string | null | undefined)[],
  locale: Locale
): LiteAmountScale {
  const largest = values.reduce<bigint>((maximum, value) => {
    const amount = contextFen(value);
    const absolute = amount !== null && amount < 0n ? -amount : amount || 0n;
    return absolute > maximum ? absolute : maximum;
  }, 0n);
  if (locale === 'en')
    return largest >= scaleFen.t
      ? 't'
      : largest >= scaleFen.b
        ? 'b'
        : largest >= scaleFen.m
          ? 'm'
          : largest >= scaleFen.k
            ? 'k'
            : 'yuan';
  return largest >= scaleFen.wanYi
    ? 'wanYi'
    : largest >= scaleFen.yi
      ? 'yi'
      : largest >= scaleFen.wan
        ? 'wan'
        : 'yuan';
}

/** Decimal-string/BigInt presentation only; no floating-point amount calculation. */
export function liteAmountDisplay(
  value: string | null | undefined,
  locale: Locale,
  options: { compact?: boolean; scale?: LiteAmountScale } = {}
): LiteAmountDisplay | null {
  const amount = contextFen(value);
  if (amount === null) return null;
  const exactYuan = contextYuan(amount);
  const [integer, fraction] = exactYuan.split('.');
  const exact = `${integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
  const exactText = locale === 'en' ? `CNY ${exact}` : `${exact} 元`;
  const compact = options.compact !== false;
  const scale = compact ? options.scale || liteAmountScale([value], locale) : 'yuan';
  const unit =
    locale === 'en'
      ? (
          {
            yuan: 'CNY',
            wan: 'CNY ×10k',
            yi: 'CNY ×100m',
            wanYi: 'CNY T',
            k: 'CNY K',
            m: 'CNY M',
            b: 'CNY B',
            t: 'CNY T',
          } as const
        )[scale]
      : (
          {
            yuan: '元',
            wan: '万元',
            yi: '亿元',
            wanYi: '万亿元',
            k: '千元',
            m: '百万元',
            b: '十亿元',
            t: '万亿元',
          } as const
        )[scale];
  if (!compact) return { text: exactText, exactText, exactYuan, approximate: false, scale, unit };
  const absolute = amount < 0n ? -amount : amount;
  const rounded = (absolute * 100n + scaleFen[scale] / 2n) / scaleFen[scale];
  const digits = `${amount < 0n ? '-' : ''}${rounded / 100n}.${String(rounded % 100n).padStart(2, '0')}`;
  const suffix = {
    yuan: '',
    wan: ' ×10k',
    yi: ' ×100m',
    wanYi: 'T',
    k: 'K',
    m: 'M',
    b: 'B',
    t: 'T',
  }[scale];
  return {
    text: locale === 'en' ? `approx CNY ${digits}${suffix}` : `约${digits}${unit}`,
    exactText,
    exactYuan,
    approximate: true,
    scale,
    unit,
  };
}
