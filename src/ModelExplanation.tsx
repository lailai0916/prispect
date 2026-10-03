import { Fragment } from 'react';
import type { EvidenceRef, Report } from '../shared/contracts';
import { useApp } from './context';

export type ModelCitationPart =
  | { kind: 'text'; text: string }
  | { kind: 'citation'; text: string; ids: string[]; refs: EvidenceRef[] };

/** Resolve complete citation groups only against this report's saved observations. */
export function parseModelCitations(
  text: string,
  snapshot: Report['snapshot']
): ModelCitationPart[] {
  const references = new Map<string, EvidenceRef | null>();
  const referenceKey = (ref: EvidenceRef) =>
    JSON.stringify([ref.materialId, ref.page, ref.quote, ref.sourceUrl ?? null]);
  for (const material of snapshot) {
    for (const observation of material.observations) {
      const ref: EvidenceRef = {
        materialId: material.id,
        page: observation.page,
        quote: observation.quote,
        ...(material.sourceUrl ? { sourceUrl: material.sourceUrl } : {}),
      };
      if (!references.has(observation.id)) references.set(observation.id, ref);
      else {
        const existing = references.get(observation.id);
        if (!existing || referenceKey(existing) !== referenceKey(ref))
          references.set(observation.id, null);
      }
    }
  }

  const parts: ModelCitationPart[] = [];
  let cursor = 0;
  let search = 0;
  while (search < text.length) {
    const start = text.indexOf('[', search);
    if (start < 0) break;
    let depth = 1;
    let end = start + 1;
    for (; end < text.length; end++) {
      if (text[end] === '[') depth++;
      if (text[end] === ']') depth--;
      if (depth === 0) break;
    }
    if (depth !== 0) break;
    search = end + 1;
    const content = text.slice(start + 1, end);
    if (/[\[\]\r\n]/.test(content)) continue;
    const ids = content.split(',').map((id) => id.trim());
    if (ids.some((id) => !id || !references.get(id))) continue;
    if (start > cursor) parts.push({ kind: 'text', text: text.slice(cursor, start) });
    const refs: EvidenceRef[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const ref = references.get(id)!;
      const key = referenceKey(ref);
      if (!seen.has(key)) {
        refs.push(ref);
        seen.add(key);
      }
    }
    parts.push({
      kind: 'citation',
      text: text.slice(start, end + 1),
      ids: [...new Set(ids)],
      refs,
    });
    cursor = end + 1;
  }
  if (cursor < text.length) parts.push({ kind: 'text', text: text.slice(cursor) });
  return parts;
}

export function ModelExplanation({
  report,
  onSource,
}: {
  report: Report;
  onSource: (title: string, refs: EvidenceRef[]) => void;
}) {
  const { t, locale } = useApp();
  const text = report.model.text;
  if (!text?.trim()) return null;
  const hasChineseText = /[\u3400-\u9fff]/u.test(text);
  const paragraphs: ModelCitationPart[][] = [[]];
  for (const part of parseModelCitations(text, report.snapshot)) {
    if (part.kind === 'citation') paragraphs.at(-1)!.push(part);
    else {
      part.text.split(/\r?\n[\t ]*\r?\n/).forEach((chunk, index) => {
        if (index > 0) paragraphs.push([]);
        if (chunk) paragraphs.at(-1)!.push({ kind: 'text', text: chunk });
      });
    }
  }
  return (
    <div className="model-explanation-body">
      <p className="model-explanation-note">
        {locale === 'en' && hasChineseText
          ? 'Original AI interpretation in Chinese; not translated.'
          : t(
              '以下保留 AI 解读原文，不随界面语言自动翻译。',
              'Original AI interpretation, preserved without translation.'
            )}
      </p>
      {paragraphs.map((paragraph, paragraphIndex) => (
        <p
          className="model-explanation-paragraph"
          key={paragraphIndex}
          lang={hasChineseText ? 'zh-Hans' : undefined}
        >
          {paragraph.map((part, partIndex) =>
            part.kind === 'text' ? (
              <Fragment key={partIndex}>{part.text}</Fragment>
            ) : (
              <button
                className="model-citation"
                type="button"
                lang={locale === 'en' ? 'en' : 'zh-Hans'}
                key={partIndex}
                aria-haspopup="dialog"
                aria-label={t(
                  `查看本段 AI 解读的 ${part.refs.length} 条原文依据`,
                  `Inspect ${part.refs.length} original ${part.refs.length === 1 ? 'source' : 'sources'} for this AI interpretation`
                )}
                title={t('打开原文依据', 'Open original evidence')}
                onClick={() =>
                  onSource(
                    t('AI 解读 · 原文依据', 'AI interpretation · Original evidence'),
                    part.refs
                  )
                }
              >
                {t('来源', 'Sources')}
                {part.refs.length > 1 ? ` ${part.refs.length}` : ''}
              </button>
            )
          )}
        </p>
      ))}
    </div>
  );
}

export default ModelExplanation;
