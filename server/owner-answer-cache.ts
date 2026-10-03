import { createHash } from 'node:crypto';
import type { CompanyQuestionAnswer } from '../shared/company-workspace.js';
import { documentMetadata } from '../src/content/document-navigation.js';
import { DEFAULT_MODEL, DEFAULT_MODEL_BASE_URL, type ModelConfig } from './model.js';

/** Change when the answer prompt or its programmatic financial checks change. */
export const OWNER_ANSWER_PROMPT_VERSION = 'public-answer-20261003-v1';

export function ownerAnswerCacheKey(input: {
  owner: string;
  namespace: 'assistant-company' | 'assistant-documentation' | 'company-question';
  question: string;
  locale?: 'zh' | 'en';
  basis?: 'consolidated' | 'parent';
  previousQuestions?: readonly string[];
  publicBasis?: unknown;
  model: ModelConfig;
  documents?: unknown;
  promptVersion?: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        owner: input.owner,
        namespace: input.namespace,
        // Do not collapse punctuation, casing or internal whitespace into another question.
        question: input.question.trim().replace(/\r\n?/g, '\n'),
        locale: input.locale || 'zh',
        basis: input.basis || 'consolidated',
        previousQuestions: input.previousQuestions || [],
        publicBasis: input.publicBasis ?? null,
        model: {
          configured: !!input.model.apiKey,
          baseUrl: input.model.baseUrl || DEFAULT_MODEL_BASE_URL,
          name: input.model.model || DEFAULT_MODEL,
          serviceTier: input.model.serviceTier || null,
        },
        documents: { metadata: documentMetadata, selected: input.documents ?? null },
        promptVersion: input.promptVersion || OWNER_ANSWER_PROMPT_VERSION,
      })
    )
    .digest('hex');
}

/** New-source requests must execute again even when the wording is repeated. */
export function bypassOwnerAnswerCache(question: string, refresh = false): boolean {
  return (
    refresh ||
    /重新(?:查|搜|研究|分析|回答)|再(?:查|搜|研究)|补查|深入研究|最新|近期|刷新|\b(?:refresh|latest|recent|research|recheck)\b|search again|look up again/i.test(
      question
    )
  );
}

type Entry<T> = {
  owner: string;
  scope?: WeakRef<object>;
  value: T;
  expiresAt: number;
  bytes: number;
};
export interface OwnerAnswerReservation {
  readonly owner: string;
  readonly key: string;
}

/** Route-instance memory only: ownership and live record checks precede every lookup. */
export class OwnerAnswerCache<T extends CompanyQuestionAnswer> {
  private entries = new Map<string, Entry<T>>();
  private reservations = new Map<string, OwnerAnswerReservation>();
  private bytes = 0;
  constructor(
    private readonly options: {
      now?: () => number;
      ttlMs?: number;
      maxEntries?: number;
      maxOwnerEntries?: number;
      maxBytes?: number;
    } = {}
  ) {}

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.bytes -= entry.bytes;
    this.entries.delete(key);
  }

  private expire() {
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.remove(key);
  }

  get(owner: string, key: string, scope?: object): (T & { cached: true }) | undefined {
    this.expire();
    const entry = this.entries.get(key);
    if (
      !entry ||
      entry.owner !== owner ||
      (entry.scope ? !scope || entry.scope.deref() !== scope : scope !== undefined)
    )
      return;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return { ...structuredClone(entry.value), cached: true };
  }

  /** The most recently started request alone may publish this key's replacement. */
  reserve(owner: string, key: string): OwnerAnswerReservation {
    const reservation = { owner, key };
    this.reservations.set(`${owner}\0${key}`, reservation);
    return reservation;
  }

  release(reservation: OwnerAnswerReservation) {
    const id = `${reservation.owner}\0${reservation.key}`;
    if (this.reservations.get(id) === reservation) this.reservations.delete(id);
  }

  invalidate(owner: string, key: string, scope?: object) {
    const entry = this.entries.get(key);
    if (
      entry?.owner === owner &&
      (entry.scope ? !!scope && entry.scope.deref() === scope : scope === undefined)
    )
      this.remove(key);
    this.reservations.delete(`${owner}\0${key}`);
  }

  set(
    owner: string,
    key: string,
    value: T,
    scope?: object,
    reservation?: OwnerAnswerReservation
  ): boolean {
    this.expire();
    if (
      reservation &&
      (reservation.owner !== owner ||
        reservation.key !== key ||
        this.reservations.get(`${owner}\0${key}`) !== reservation)
    )
      return false;
    // Fallbacks include provider failure and unavailable configuration; allow the next retry.
    if (
      !value ||
      typeof value !== 'object' ||
      !['rules', 'model'].includes(value.mode) ||
      typeof value.question !== 'string' ||
      !value.question.trim() ||
      typeof value.text !== 'string' ||
      !value.text.trim() ||
      typeof value.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(value.createdAt)) ||
      typeof value.snapshotFetchedAt !== 'string' ||
      (value.snapshotFetchedAt !== '' && !Number.isFinite(Date.parse(value.snapshotFetchedAt))) ||
      !Array.isArray(value.citations) ||
      value.citations.some(
        (citation) =>
          !citation ||
          typeof citation.label !== 'string' ||
          !citation.label ||
          typeof citation.url !== 'string' ||
          !citation.url
      )
    )
      return false;
    let copy: T;
    let bytes: number;
    try {
      bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
      copy = structuredClone(value);
    } catch {
      return false;
    }
    const maxBytes = this.options.maxBytes ?? 4 * 1024 * 1024;
    if (bytes > Math.min(maxBytes, 64 * 1024)) return false;
    this.remove(key);
    this.entries.set(key, {
      owner,
      scope: scope ? new WeakRef(scope) : undefined,
      value: copy,
      expiresAt: this.now() + (this.options.ttlMs ?? 10 * 60_000),
      bytes,
    });
    this.bytes += bytes;
    const maxOwnerEntries = this.options.maxOwnerEntries ?? 32;
    for (const [oldKey, entry] of this.entries) {
      if (entry.owner !== owner) continue;
      if (
        [...this.entries.values()].filter((item) => item.owner === owner).length <= maxOwnerEntries
      )
        break;
      this.remove(oldKey);
    }
    while (this.entries.size > (this.options.maxEntries ?? 128) || this.bytes > maxBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.remove(oldest);
    }
    return this.entries.has(key);
  }

  clearOwner(owner: string) {
    for (const [key, entry] of this.entries) if (entry.owner === owner) this.remove(key);
    for (const [id, reservation] of this.reservations)
      if (reservation.owner === owner) this.reservations.delete(id);
  }
}
