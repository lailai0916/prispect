import type { CompanyRecordSummary } from './company-workspace.js';
import { normalizeCompanyQuery } from './company-directory.js';
import { searchProductKnowledge, type KnowledgeLocale } from './product-knowledge.js';

export type AssistantSuggestion =
  | {
      id: string;
      kind: 'documentation';
      label: string;
      detail?: string;
      url: string;
    }
  | {
      id: string;
      kind: 'company';
      label: string;
      detail: string;
      runId: string;
      question: string;
    };

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesCompany(record: CompanyRecordSummary, draft: string): boolean {
  const compact = normalizeCompanyQuery(draft);
  const text = draft.normalize('NFKC').toLowerCase();
  const name = normalizeCompanyQuery(record.name);
  const code = normalizeCompanyQuery(record.input.securityCode);
  if (
    (code && new RegExp(`(?:^|[^0-9])${escaped(code)}(?:$|[^0-9])`, 'u').test(text)) ||
    (name.length >= 2 &&
      (/^[a-z0-9.*&-]+$/u.test(name)
        ? new RegExp(
            `(?:^|[^a-z0-9])${record.name
              .normalize('NFKC')
              .toLowerCase()
              .trim()
              .split(/\s+/u)
              .map(escaped)
              .join('\\s*')}(?:$|[^a-z0-9])`,
            'u'
          ).test(text)
        : compact.includes(name)))
  )
    return true;

  // Prefix lookup is for a short issuer input, not incidental fragments of a sentence.
  const prefix = normalizeCompanyQuery(text.replace(/(?<!\d)20\d{2}(?!\d)\s*年?/gu, ''));
  return Boolean(
    prefix.length >= 2 &&
      /^[\p{Letter}\p{Number}.*&-]+$/u.test(prefix) &&
      ((name && name.startsWith(prefix)) || (code && code.startsWith(prefix)))
  );
}

function companyQuestion(
  draft: string,
  record: CompanyRecordSummary,
  locale: KnowledgeLocale
): string | null {
  const scope =
    locale === 'en'
      ? `Regarding ${record.name} (${record.input.securityCode}), ${record.input.year}:`
      : `关于${record.name}（${record.input.securityCode}）${record.input.year}年：`;
  const question = draft.startsWith(`${scope}\n`) ? draft : `${scope}\n${draft}`;
  return question.length <= 500 ? question : null;
}

/** Read-only hints from public documents and the caller's already-loaded owning records. */
export function getAssistantSuggestions(
  draft: string,
  locale: KnowledgeLocale,
  records: readonly CompanyRecordSummary[],
  currentRunId?: string | null
): AssistantSuggestion[] {
  if (draft.trim().length < 2 || draft.length > 500) return [];
  const years = new Set(
    [...draft.normalize('NFKC').matchAll(/(?<!\d)(20\d{2})(?!\d)/gu)].map((match) =>
      Number(match[1])
    )
  );
  const companies = records
    .filter(
      (record) => matchesCompany(record, draft) && (!years.size || years.has(record.input.year))
    )
    .map((record, order) => ({ record, order }))
    .sort(
      (a, b) =>
        Number(b.record.id === currentRunId) - Number(a.record.id === currentRunId) ||
        b.record.createdAt.localeCompare(a.record.createdAt) ||
        a.order - b.order
    );
  const result: AssistantSuggestion[] = [];
  const seen = new Set<string>();
  for (const { record } of companies) {
    const key = `${record.input.securityCode}:${record.input.orgId}:${record.input.year}`;
    if (seen.has(key)) continue;
    const question = companyQuestion(draft, record, locale);
    if (!question) continue;
    seen.add(key);
    result.push({
      id: `company:${record.id}`,
      kind: 'company',
      label: `${record.name} · ${record.input.year}`,
      detail:
        locale === 'en'
          ? `Saved research · ${record.input.securityCode}`
          : `已保存研究 · ${record.input.securityCode}`,
      runId: record.id,
      question,
    });
    if (result.length === 3) return result;
  }
  for (const document of searchProductKnowledge(draft, locale, { fallback: false, limit: 3 })) {
    result.push({
      id: `documentation:${document.id}`,
      kind: 'documentation',
      label: document.title,
      detail: locale === 'en' ? 'Documentation' : '文档',
      url: document.url,
    });
    if (result.length === 3) break;
  }
  return result;
}
