/** Public, read-only source relationships. No source count certifies independence or changes a grade. */
import type { CompanyResearchRun } from './contracts.js';
import {
  assessmentDiscussionEvidenceId,
  readDiscussionPostExcerpt,
  readNewsMediaExcerpt,
} from './company-assessment.js';
import type { PublicSourceState } from './company-workspace.js';

export type SourceReadScope =
  | 'source-receipt'
  | 'disclosure-index'
  | 'disclosure-excerpt'
  | 'headline'
  | 'digest'
  | 'media-excerpt'
  | 'post-title'
  | 'post-excerpt';
export type SourceRelationKind = 'same-location' | 'same-cluster' | 'same-content';
export interface SourceTrustRow {
  id: string;
  kind: 'receipt' | 'disclosure' | 'news' | 'discussion';
  label: string;
  provider: string;
  url: string | null;
  date: string | null;
  readAt: string | null;
  scope: SourceReadScope;
  status: PublicSourceState;
  note: string;
  /** A collector cluster is a known grouping, not a finding that every member is identical. */
  clusterId: string | null;
  contentHash: string | null;
}
export interface SourceFamily {
  id: string;
  memberIds: string[];
  relations: { kind: SourceRelationKind; memberIds: string[] }[];
  /** Same URL may have different revisions; location alone never proves the same text. */
  differingContent: boolean;
}
export interface SourceTrustView {
  scope: 'current' | 'previous' | 'missing' | 'mismatch';
  snapshotFetchedAt: string | null;
  reportSnapshotFetchedAt: string | null;
  independence: 'unknown';
  rows: SourceTrustRow[];
  families: SourceFamily[];
  reading: Record<SourceReadScope, number>;
  states: Record<PublicSourceState, number>;
  omitted: number;
  rejectedDiscussions: number;
}

export const SOURCE_TRUST_LIMITS = { receipts: 24, disclosures: 24, news: 48, discussions: 24 };
const scopes: SourceReadScope[] = [
  'source-receipt',
  'disclosure-index',
  'disclosure-excerpt',
  'headline',
  'digest',
  'media-excerpt',
  'post-title',
  'post-excerpt',
];
const states: PublicSourceState[] = ['available', 'partial', 'empty', 'error', 'manual'];
const plain = (value: string | undefined, limit: number) =>
  (value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, limit);
const recordedDate = (value: string | null | undefined): string | null =>
  value && /^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(value) && Number.isFinite(Date.parse(value))
    ? value.slice(0, 80)
    : null;

/** Exact retained locations only; query strings and fragments are not silently normalized away. */
function sourceUrl(value: string | undefined): string | null {
  if (!value || value.length > 2000) return null;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
      ? value
      : null;
  } catch {
    return null;
  }
}

/** Bounded, fresh objects contain only allowlisted public metadata; never spread a run or source. */
export function deriveSourceTrust(run: CompanyResearchRun): SourceTrustView {
  const snapshot = run.context;
  const mismatch =
    !!run.informationGap ||
    !!(
      snapshot &&
      (snapshot.securityCode !== run.input.securityCode || snapshot.orgId !== run.input.orgId)
    ) ||
    !!(
      run.identity &&
      (run.identity.securityCode !== run.input.securityCode ||
        run.identity.orgId !== run.input.orgId)
    ) ||
    !!(
      run.assessment &&
      (run.assessment.year !== run.input.year || run.assessment.basis !== 'consolidated')
    );
  const view: SourceTrustView = {
    scope: mismatch
      ? 'mismatch'
      : !snapshot
        ? 'missing'
        : run.assessment && run.assessment.snapshotFetchedAt !== snapshot.fetchedAt
          ? 'previous'
          : 'current',
    snapshotFetchedAt: mismatch ? null : recordedDate(snapshot?.fetchedAt),
    reportSnapshotFetchedAt: mismatch ? null : recordedDate(run.assessment?.snapshotFetchedAt),
    independence: 'unknown',
    rows: [],
    families: [],
    reading: Object.fromEntries(scopes.map((scope) => [scope, 0])) as SourceTrustView['reading'],
    states: Object.fromEntries(states.map((state) => [state, 0])) as SourceTrustView['states'],
    omitted: 0,
    rejectedDiscussions: 0,
  };
  if (mismatch || !snapshot) return view;
  // Internal excerpt equality is never emitted in a model payload or copied to another source.
  const contents = new Map<string, string>();
  const append = (row: SourceTrustRow, actualContent?: string) => {
    view.rows.push(row);
    view.reading[row.scope]++;
    view.states[row.status]++;
    if (actualContent && row.contentHash) contents.set(row.id, actualContent);
  };
  const omitted = (length: number, limit: number) => Math.max(0, length - limit);
  view.omitted =
    omitted(snapshot.sources.length, SOURCE_TRUST_LIMITS.receipts) +
    omitted(snapshot.announcements.length, SOURCE_TRUST_LIMITS.disclosures) +
    omitted(snapshot.news.length, SOURCE_TRUST_LIMITS.news) +
    omitted(snapshot.discussions?.length || 0, SOURCE_TRUST_LIMITS.discussions);
  snapshot.sources.slice(0, SOURCE_TRUST_LIMITS.receipts).forEach((row, i) =>
    append({
      id: `receipt-${i + 1}`,
      kind: 'receipt',
      label: plain(row.dimension, 200),
      provider: plain(row.provider, 80),
      url: sourceUrl(row.url),
      date: recordedDate(row.latestDate),
      readAt: recordedDate(row.fetchedAt),
      scope: 'source-receipt',
      status: row.status,
      note: plain(row.note, 320),
      clusterId: null,
      contentHash: null,
    })
  );
  snapshot.announcements.slice(0, SOURCE_TRUST_LIMITS.disclosures).forEach((row, i) => {
    const excerpt = row.excerpt?.quote.trim() && sourceUrl(row.excerpt.url) ? row.excerpt : null;
    append({
      id: `disclosure-${i + 1}`,
      kind: 'disclosure',
      label: plain(row.title, 200),
      provider: plain(
        row.sources
          .slice(0, 8)
          .map((source) => source.provider)
          .join(' / '),
        80
      ),
      url: sourceUrl(excerpt?.url || row.url),
      date: recordedDate(row.date),
      // A refreshed snapshot can retain an older cached PDF excerpt. No excerpt read time is recorded.
      readAt: null,
      scope: excerpt ? 'disclosure-excerpt' : 'disclosure-index',
      status: 'available',
      note: excerpt ? `Page ${excerpt.page}; ${excerpt.pagesRead} pages read` : '',
      clusterId: null,
      // PDF response hashes identify a file, not equality of the selected passage.
      contentHash: null,
    });
  });
  snapshot.news.slice(0, SOURCE_TRUST_LIMITS.news).forEach((row, i) => {
    const body = readNewsMediaExcerpt(row);
    append(
      {
        id: `news-${i + 1}`,
        kind: 'news',
        label: plain(row.title, 200),
        provider: plain(row.media || row.provider, 80),
        url: sourceUrl(body?.url || row.url),
        date: recordedDate(row.date),
        readAt: recordedDate(body?.readAt),
        scope: body ? 'media-excerpt' : row.digest.trim() ? 'digest' : 'headline',
        status: 'available',
        note: '',
        // Oversized or malformed IDs remain unknown; truncating two IDs could invent a relationship.
        clusterId:
          row.clusterId &&
          row.clusterId.length <= 160 &&
          !/[\u0000-\u001f\u007f]/.test(row.clusterId)
            ? row.clusterId
            : null,
        contentHash: body?.sha256.toLowerCase() || null,
      },
      body?.text
    );
  });
  (snapshot.discussions || []).slice(0, SOURCE_TRUST_LIMITS.discussions).forEach((row, i) => {
    if (!assessmentDiscussionEvidenceId(row, run.input.securityCode)) {
      view.rejectedDiscussions++;
      return;
    }
    const body = readDiscussionPostExcerpt(row, run.input.securityCode);
    append(
      {
        id: `discussion-${i + 1}`,
        kind: 'discussion',
        label: plain(row.title, 200),
        provider: plain(row.provider, 80),
        url: sourceUrl(body?.url || row.url),
        date: recordedDate(row.date),
        readAt: recordedDate(body?.readAt),
        scope: body ? 'post-excerpt' : 'post-title',
        status: 'available',
        note: '',
        clusterId: null,
        contentHash: body?.sha256.toLowerCase() || null,
      },
      body?.text
    );
  });
  const groups = new Map<string, { kind: SourceRelationKind; members: string[] }>();
  for (const row of view.rows) {
    const keys: [SourceRelationKind, string | null][] = [
      ['same-location', row.url],
      ['same-cluster', row.clusterId],
      [
        'same-content',
        row.contentHash && contents.has(row.id)
          ? `${row.contentHash}\n${contents.get(row.id)}`
          : null,
      ],
    ];
    for (const [kind, key] of keys) {
      if (!key) continue;
      const groupKey = `${kind}:${key}`;
      const group = groups.get(groupKey) || { kind, members: [] };
      group.members.push(row.id);
      groups.set(groupKey, group);
    }
  }
  const relations = [...groups.values()].filter((group) => group.members.length > 1);
  const parent = new Map(view.rows.map((row) => [row.id, row.id]));
  const root = (id: string): string => {
    const next = parent.get(id)!;
    if (next === id) return id;
    const found = root(next);
    parent.set(id, found);
    return found;
  };
  for (const group of relations)
    for (const id of group.members.slice(1)) parent.set(root(id), root(group.members[0]));
  const families = new Map<string, SourceFamily>();
  for (const relation of relations) {
    const id = root(relation.members[0]);
    const family = families.get(id) || {
      id: `family-${families.size + 1}`,
      memberIds: [],
      relations: [],
      differingContent: false,
    };
    family.relations.push({ kind: relation.kind, memberIds: [...relation.members] });
    family.memberIds = [...new Set([...family.memberIds, ...relation.members])];
    families.set(id, family);
  }
  for (const family of families.values()) {
    const hashes = new Set(
      family.memberIds.flatMap((id) => {
        const row = view.rows.find((row) => row.id === id)!;
        return row.contentHash ? [`${row.contentHash}\n${contents.get(id)}`] : [];
      })
    );
    family.differingContent = hashes.size > 1;
  }
  view.families = [...families.values()];
  return view;
}

/** Metadata describes the inspected bounded snapshot, not the separate corpus packed for the model. */
export function sourceTrustPublicPayload(run: CompanyResearchRun) {
  return {
    ...deriveSourceTrust(run),
    idNamespace:
      'Snapshot-local metadata IDs only. These are not valid metricIds or evidenceIds; cite the screen evidence catalog instead.',
    scopeMeaning:
      'Snapshot metadata only; use publicInformationCoverage for the actual model corpus. Same location or cluster does not certify the same text, independence, completeness or truth.',
  };
}
