import type { AssessmentEvidence, AssessmentMetric } from './company-assessment.js';

export interface SourceExcerptPart {
  text: string;
  matched: boolean;
}

interface NormalizedText {
  text: string;
  starts: number[];
  ends: number[];
}

/** Match typographic equivalents while keeping offsets into the unchanged excerpt. */
function normalize(text: string): NormalizedText {
  const result: NormalizedText = { text: '', starts: [], ends: [] };
  let offset = 0;
  for (const character of text) {
    const end = offset + character.length;
    const normalized = character.normalize('NFKC').replace(/\u2212/g, '-');
    for (const unit of normalized) {
      if (/\s/u.test(unit)) continue;
      result.text += unit;
      for (let index = 0; index < unit.length; index++) {
        result.starts.push(offset);
        result.ends.push(end);
      }
    }
    offset = end;
  }
  return result;
}

/** No fuzzy phrases or generated sentences: only bounded, literal token matches. */
export function matchSourceExcerpt(text: string, tokens: readonly string[]): SourceExcerptPart[] {
  const normalized = normalize(text.slice(0, 20_000));
  const candidates = [...new Set(tokens.filter((token) => token.trim().length >= 2))]
    .slice(0, 32)
    .map((token) => normalize(token.slice(0, 240)).text)
    .filter((token) => token.length >= 2)
    .sort((left, right) => right.length - left.length);
  const ranges: { start: number; end: number }[] = [];
  for (const token of candidates) {
    let offset = 0;
    let matches = 0;
    while (offset < normalized.text.length && matches < 3 && ranges.length < 32) {
      const index = normalized.text.indexOf(token, offset);
      if (index < 0) break;
      offset = index + token.length;
      // A positive amount must not accidentally match a negative or larger amount.
      const before = normalized.text[index - 1] || '';
      const after = normalized.text[index + token.length] || '';
      if (
        (/^[\d-]/.test(token) && /[\d.,+-]/.test(before)) ||
        (/\d$/.test(token) && /[\d.,]/.test(after))
      )
        continue;
      ranges.push({
        start: normalized.starts[index]!,
        end: normalized.ends[index + token.length - 1]!,
      });
      matches++;
    }
  }
  ranges.sort((left, right) => left.start - right.start || right.end - left.end);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.start < previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  const parts: SourceExcerptPart[] = [];
  let offset = 0;
  for (const range of merged) {
    if (range.start > offset) parts.push({ text: text.slice(offset, range.start), matched: false });
    parts.push({ text: text.slice(range.start, range.end), matched: true });
    offset = range.end;
  }
  if (offset < text.length || !parts.length)
    parts.push({ text: text.slice(offset), matched: false });
  return parts;
}

function metricTokens(metric: AssessmentMetric): string[] {
  const labels = metric.label.map((label) => label.replace(/^20\d{2}\s+/, ''));
  if (metric.value === null || metric.status !== 'available') return [];
  const grouped = metric.value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const values = [...new Set([metric.value, grouped])];
  // The unit is part of the match: 100 yuan must not match 100 ten-thousand yuan.
  const numbers = values.flatMap((value) =>
    metric.unit === 'CNY'
      ? [`${value} 元`, `CNY ${value}`]
      : metric.unit === 'percent'
        ? [`${value}%`]
        : []
  );
  return [...labels, ...numbers];
}

/** Source IDs explicitly identify recorded direct fields; derived ratios remain calculations. */
export function assessmentSourceFocus(
  evidence: AssessmentEvidence,
  metrics: readonly AssessmentMetric[],
  selectedMetricIds: readonly string[]
) {
  const related = metrics.filter((metric) => metric.evidenceIds.includes(evidence.id));
  const fields = related.filter(
    (metric) =>
      evidence.kind === 'financial' &&
      evidence.sourceQuality !== 'headline' &&
      evidence.id === `financial-${metric.id}` &&
      metric.status === 'available'
  );
  const calculations = related.filter(
    (metric) => selectedMetricIds.includes(metric.id) && evidence.id !== `financial-${metric.id}`
  );
  const quote = evidence.sourceQuality !== 'headline' ? evidence.quote : undefined;
  return {
    fields,
    calculations,
    parts: quote ? matchSourceExcerpt(quote, fields.flatMap(metricTokens)) : [],
  };
}

export function knownSourcePage(page: number | undefined): number | undefined {
  return typeof page === 'number' && Number.isSafeInteger(page) && page > 0 ? page : undefined;
}

/** Only use a recorded positive page and a safe public URL; never infer a location. */
export function assessmentSourceHref(url: string, page?: number): string | undefined {
  try {
    const parsed = new URL(url);
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      parsed.username ||
      parsed.password
    )
      return;
    const known = knownSourcePage(page);
    if (known !== undefined) parsed.hash = `page=${known}`;
    return parsed.href;
  } catch {
    return;
  }
}
