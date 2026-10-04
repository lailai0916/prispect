import type { CompanyResearchRun } from './contracts.js';

/** Ordering only: never changes amounts, scope, report dates or stored evidence. */
export function isOlderCompanyRunSnapshot(
  next: CompanyResearchRun,
  previous: CompanyResearchRun
): boolean {
  if (
    next.id !== previous.id ||
    next.input.securityCode !== previous.input.securityCode ||
    next.input.orgId !== previous.input.orgId ||
    next.input.year !== previous.input.year ||
    (next.input.purpose || 'external') !== (previous.input.purpose || 'external') ||
    (next.input.researchMode || 'deep') !== (previous.input.researchMode || 'deep')
  )
    return false;
  if (next.contextRevision !== undefined || previous.contextRevision !== undefined) {
    const after = next.contextRevision || 0;
    const before = previous.contextRevision || 0;
    if (after !== before) return after < before;
  }
  if (next.context?.fetchedAt !== previous.context?.fetchedAt) {
    const after = Date.parse(next.context?.fetchedAt || '');
    const before = Date.parse(previous.context?.fetchedAt || '');
    if (Number.isFinite(after) && Number.isFinite(before)) return after < before;
  }
  if (
    next.contextRevision !== undefined &&
    next.contextRevision === previous.contextRevision &&
    next.contextStatus === 'loading' &&
    ['ready', 'failed'].includes(previous.contextStatus || '')
  )
    return true;
  if (next.context?.fetchedAt !== previous.context?.fetchedAt) return false;
  if (next.assessmentRevision !== undefined || previous.assessmentRevision !== undefined) {
    const after = next.assessmentRevision || 0;
    const before = previous.assessmentRevision || 0;
    if (after !== before) return after < before;
  }
  return (
    next.assessmentStatus === 'loading' &&
    ['ready', 'failed'].includes(previous.assessmentStatus || '') &&
    next.assessmentRevision === previous.assessmentRevision
  );
}
