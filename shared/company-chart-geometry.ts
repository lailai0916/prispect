/** Display geometry only; never changes financial amounts or saved judgments. */
export function chartRange(values: readonly (number | null)[], includeZero = true) {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  let minimum = valid.length ? Math.min(...valid) : 0;
  let maximum = valid.length ? Math.max(...valid) : 1;
  if (includeZero) {
    minimum = Math.min(0, minimum);
    maximum = Math.max(0, maximum);
  }
  if (minimum === maximum) {
    const padding = Math.abs(minimum) * 0.1 || 1;
    minimum -= includeZero && minimum === 0 ? 0 : padding;
    maximum += padding;
  }
  const raw = (maximum - minimum) / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  const step =
    (normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 2.5
          ? 2.5
          : normalized <= 5
            ? 5
            : 10) * power;
  const low = Math.floor(minimum / step) * step;
  const high = Math.ceil(maximum / step) * step;
  const ticks = Array.from(
    { length: Math.min(10, Math.round((high - low) / step) + 1) },
    (_, index) => low + index * step
  );
  return { minimum: low, maximum: high, ticks };
}

export function consecutivePeriods(before: string, after: string): boolean {
  return (
    /^\d{4}-12-31$/.test(before) &&
    /^\d{4}-12-31$/.test(after) &&
    Number(after.slice(0, 4)) === Number(before.slice(0, 4)) + 1
  );
}

export function distributionBins(
  values: readonly number[],
  range: { minimum: number; maximum: number }
) {
  const finite = values.filter(Number.isFinite);
  const count = Math.min(10, Math.max(5, Math.ceil(Math.sqrt(finite.length))));
  const span = (range.maximum - range.minimum) / count;
  const bins = Array.from({ length: count }, (_, index) => ({
    start: range.minimum + index * span,
    end: range.minimum + (index + 1) * span,
    count: 0,
  }));
  for (const value of finite)
    bins[Math.max(0, Math.min(count - 1, Math.floor((value - range.minimum) / span)))]!.count++;
  return bins;
}
