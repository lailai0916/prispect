/** Public-source excerpts only. Selection changes model context, never retained evidence or scores. */
export interface PublicTextFragment {
  /** UTF-16 offsets in the normalized, acquired text, not PDF coordinates. */
  start: number;
  end: number;
  reasons: PublicTextReason[];
  /** The cap/window cut through a sentence; omitted context must not be inferred. */
  partial?: boolean;
}
export type PublicTextReason =
  | 'opening'
  | 'goal'
  | 'financial'
  | 'counter-cue'
  | 'scope'
  | 'context';
export interface PublicTextSelection {
  text: string;
  fragments: PublicTextFragment[];
  sourceCharacters: number;
  omittedCharacters: number;
  separatorCharacters: number;
  omissionReason?: 'sentence-context-exceeds-budget';
}
export const PUBLIC_TEXT_SEPARATOR = '\n[…]\n';
const financial =
  /现金|回款|应收|存货|库存|收入|营收|利润|债务|负债|偿付|流动性|担保|审计|订单|交付|诉讼|违约|监管|经营|cash|collection|receivables?|inventor(?:y|ies)|revenue|profit|debt|liabilit|solven|liquidit|guarantee|audit|orders?|deliver|litigation|default|regulat|operat/i;
const counter =
  /但(?:是)?|然而|不过|相反|并非|不等于|不代表|不一定|尚未|未(?:经|能|获|被)?(?:证实|确认|查明)|否认|澄清|反向|反方|争议|驳回|不同(?:观点|解释)|下降|下滑|恶化|逾期|减值|滞销|however|nevertheless|\bbut\b|contrar|den(?:y|ied)|disput|not (?:confirmed|verified|necessarily)|declin|deteriorat|overdue|impair/i;
const scope =
  /(?:20\d{2})年?|合并|母公司|万元|亿元|人民币|美元|期间|口径|原告|被告|子公司|供应商|客户|consolidated|parent company|subsidiar|plaintiff|defendant|supplier|customer|\b(?:CNY|USD|RMB)\b/i;

/** Keep the entire bounded acquired excerpt; never select from a previously cropped prefix. */
export function normalizePublicText(value: string, limit = 12_000): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

/** Query fragments are selection hints, not instructions or proof that a passage is relevant. */
export function publicGoalTerms(goal: string | undefined): string[] {
  const clean = normalizePublicText(goal || '', 1000).toLowerCase();
  const terms = new Set<string>();
  for (const word of clean.match(/[a-z][a-z0-9-]{2,30}/g) || []) terms.add(word);
  for (const phrase of clean.match(/[\u3400-\u9fff]{2,30}/g) || []) {
    if (phrase.length <= 6) terms.add(phrase);
    else
      for (let index = 0; index < phrase.length - 1; index++)
        terms.add(phrase.slice(index, index + 2));
  }
  return [...terms].slice(0, 80);
}

interface Unit extends PublicTextFragment {
  rank: number;
}
function textUnits(text: string, terms: readonly string[]): Unit[] {
  const units: Unit[] = [];
  let start = 0;
  while (start < text.length) {
    const sentence = /[。！？!?;；]|\.(?=\s|$)/.exec(text.slice(start));
    const end = sentence ? start + sentence.index + sentence[0].length : text.length;
    const content = text.slice(start, end);
    const reasons: PublicTextReason[] = [];
    const lower = content.toLowerCase();
    if (start === 0) reasons.push('opening');
    if (terms.some((term) => lower.includes(term))) reasons.push('goal');
    if (financial.test(content)) reasons.push('financial');
    if (counter.test(content)) reasons.push('counter-cue');
    if (scope.test(content)) reasons.push('scope');
    // A lexical counter cue is not verified counterevidence; it earns reading space only.
    const rank =
      (reasons.includes('opening') ? 12 : 0) +
      (reasons.includes('goal') ? 40 : 0) +
      (reasons.includes('counter-cue') ? 80 : 0) +
      (reasons.includes('financial') ? 20 : 0) +
      (reasons.includes('scope') ? 10 : 0);
    units.push({ start, end, reasons: reasons.length ? reasons : ['context'], rank });
    start = end;
  }
  return units;
}
function mergeFragments(fragments: readonly PublicTextFragment[]): PublicTextFragment[] {
  const ordered = [...fragments].sort((a, b) => a.start - b.start);
  const merged: PublicTextFragment[] = [];
  for (const fragment of ordered) {
    const previous = merged.at(-1);
    if (previous && fragment.start <= previous.end) {
      previous.end = Math.max(previous.end, fragment.end);
      previous.reasons = [...new Set([...previous.reasons, ...fragment.reasons])];
    } else merged.push({ ...fragment, reasons: [...fragment.reasons] });
  }
  return merged;
}
function render(text: string, fragments: readonly PublicTextFragment[]): string {
  return fragments
    .map((fragment) => text.slice(fragment.start, fragment.end))
    .join(PUBLIC_TEXT_SEPARATOR);
}
function selectedReasons(text: string, fragment: PublicTextFragment, terms: readonly string[]) {
  const passage = text.slice(fragment.start, fragment.end);
  const reasons: PublicTextReason[] = [];
  if (fragment.start === 0) reasons.push('opening');
  if (terms.some((term) => passage.toLowerCase().includes(term))) reasons.push('goal');
  if (financial.test(passage)) reasons.push('financial');
  if (counter.test(passage)) reasons.push('counter-cue');
  if (scope.test(passage)) reasons.push('scope');
  if (fragment.reasons.includes('context') || !reasons.length) reasons.push('context');
  const partial =
    (fragment.start > 0 && !/[。！？!?;；.]/.test(text[fragment.start - 1]!)) ||
    (fragment.end < text.length && !/[。！？!?;；.]/.test(text[fragment.end - 1]!));
  return { ...fragment, reasons, ...(partial ? { partial: true } : {}) };
}

/**
 * Preserve original passages in source order. Opening, requested topics, counter cues and
 * financial/scope context compete inside the same cap; no summary or invented balance is added.
 */
export function selectPublicText(
  text: string,
  cap: number,
  terms: readonly string[] = []
): PublicTextSelection {
  const limit = Math.max(0, Math.floor(cap));
  if (!text || limit === 0)
    return {
      text: '',
      fragments: [],
      sourceCharacters: 0,
      omittedCharacters: text.length,
      separatorCharacters: 0,
    };
  if (text.length <= limit) {
    const reasons = [...new Set(textUnits(text, terms).flatMap((unit) => unit.reasons))];
    return {
      text,
      fragments: [{ start: 0, end: text.length, reasons }],
      sourceCharacters: text.length,
      omittedCharacters: 0,
      separatorCharacters: 0,
    };
  }
  // A very small remaining byte budget must not send an isolated negation/actor fragment.
  if (limit < 80)
    return {
      text: '',
      fragments: [],
      sourceCharacters: 0,
      omittedCharacters: text.length,
      separatorCharacters: 0,
    };
  const units = textUnits(text, terms);
  const ranked = [...units].sort((a, b) => b.rank - a.rank || a.start - b.start);
  let selected: PublicTextFragment[] = [];
  const strongestCounter = ranked.find((unit) => unit.reasons.includes('counter-cue'));
  if (strongestCounter && strongestCounter.end - strongestCounter.start > limit)
    return {
      text: '',
      fragments: [],
      sourceCharacters: 0,
      omittedCharacters: text.length,
      separatorCharacters: 0,
      omissionReason: 'sentence-context-exceeds-budget',
    };
  // Complete critical sentences precede the opening, whose broad claim may need the later correction.
  for (const unit of ranked) {
    const proposed = mergeFragments([...selected, unit]);
    if (render(text, proposed).length > limit) continue;
    selected = proposed;
    if (!unit.reasons.some((reason) => reason === 'goal' || reason === 'counter-cue')) continue;
    const index = units.indexOf(unit);
    // Admit neighboring whole sentences when budget permits; never crop their units/negations.
    for (const neighbor of [units[index - 1], units[index + 1]]) {
      if (!neighbor) continue;
      const contextual = mergeFragments([
        ...selected,
        { ...neighbor, reasons: [...neighbor.reasons, 'context'] },
      ]);
      if (render(text, contextual).length <= limit) selected = contextual;
    }
  }
  // Only neutral filler may be clipped; critical sentences are kept whole or explicitly omitted.
  for (const unit of ranked) {
    if (
      unit.reasons.some((reason) => ['goal', 'financial', 'counter-cue', 'scope'].includes(reason))
    )
      continue;
    if (selected.some((fragment) => unit.start >= fragment.start && unit.end <= fragment.end))
      continue;
    let lower = 0,
      upper = unit.end - unit.start;
    while (lower < upper) {
      const length = Math.ceil((lower + upper) / 2);
      const proposed = mergeFragments([...selected, { ...unit, end: unit.start + length }]);
      if (render(text, proposed).length <= limit) lower = length;
      else upper = length - 1;
    }
    if (lower) selected = mergeFragments([...selected, { ...unit, end: unit.start + lower }]);
    if (render(text, selected).length >= limit) break;
  }
  selected = selected.map((fragment) => selectedReasons(text, fragment, terms));
  const sourceCharacters = selected.reduce(
    (sum, fragment) => sum + fragment.end - fragment.start,
    0
  );
  const result = render(text, selected);
  return {
    text: result,
    fragments: selected,
    sourceCharacters,
    omittedCharacters: text.length - sourceCharacters,
    separatorCharacters: result.length - sourceCharacters,
  };
}
