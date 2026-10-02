import type { StartKind } from '../shared/start-intent';

export type ComposerMode = StartKind | 'auto';
export interface ComposerDraft {
  owner: string | null;
  text: string;
  mode: ComposerMode;
}
const key = 'cashlens.composer-draft';
const ownerKey = 'cashlens.composer-owner';
const modes: ComposerMode[] = ['auto', 'company', 'external', 'handover'];

export function readComposerDraft(owner: string | null): ComposerDraft | null {
  try {
    const draft: unknown = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (!draft || typeof draft !== 'object') return null;
    const value = draft as ComposerDraft;
    if (
      value.owner !== owner ||
      typeof value.text !== 'string' ||
      value.text.length > 1000 ||
      !modes.includes(value.mode)
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

export function writeComposerDraft(draft: ComposerDraft): void {
  try {
    if (sessionStorage.getItem(ownerKey) !== (draft.owner || 'anonymous')) return;
    if (draft.text) sessionStorage.setItem(key, JSON.stringify(draft));
    else sessionStorage.removeItem(key);
  } catch {
    // The composer remains usable when browser storage is unavailable.
  }
}

export function clearComposerDraft(): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // No draft is retained if browser storage is unavailable.
  }
}

export function changeComposerOwner(previous: string | null, next: string | null): void {
  try {
    const anonymous = previous === null ? readComposerDraft(null) : null;
    const retained = next ? readComposerDraft(next) : null;
    if (previous !== next || (!retained && next)) clearComposerDraft();
    sessionStorage.setItem(ownerKey, next || 'anonymous');
    if (anonymous && next) writeComposerDraft({ ...anonymous, owner: next });
    else if (retained) writeComposerDraft(retained);
    if (previous && previous !== next) sessionStorage.removeItem('cashlens.start-draft');
  } catch {
    // Owner changes must not depend on browser storage.
  }
}
