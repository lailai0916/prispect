import type { CompanyResearchRun, CompanyRunInput } from '../shared/contracts';
import type { AssessmentResearchStep } from '../shared/company-assessment';

export const COMPANY_CACHE_EVENT = 'prispect:company-cache-invalidated';
export const COMPANY_CACHE_PREFIX = 'prispect.company-research-cache.v1:';
export const COMPANY_CACHE_MAX_ENTRIES = 12;
export const COMPANY_CACHE_MAX_BYTES = 4 * 1024 * 1024;
export const COMPANY_CACHE_ENTRY_BYTES = 1.5 * 1024 * 1024;
type CacheStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
interface Entry {
  payload: string;
  checksum: string;
  touchedAt: number;
}
interface Envelope {
  version: 1;
  owner: string;
  entries: Record<string, Entry>;
}
export interface CompanyCacheInvalidation {
  owner: string;
  ids: string[];
}

// This detects damaged local copies; it does not authenticate financial evidence.
function checksum(text: string): string {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++)
    value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return (value >>> 0).toString(16);
}

function publicResearchSteps(steps: AssessmentResearchStep[]): AssessmentResearchStep[] {
  return steps.map(({ id, tool, label, status, startedAt, finishedAt }) => ({
    id,
    tool,
    label,
    status,
    startedAt,
    finishedAt,
    summary: '',
  }));
}

/** Persist public reading data only, never the run's private original or user-authored inputs. */
export function publicCompanyCacheRun(run: CompanyResearchRun): CompanyResearchRun | null {
  // API-first records can be read while their independent background analysis is running.
  // Original-document jobs and an unsettled source refresh still retain the prior cache.
  const backgroundFinancialAnalysis =
    run.input.researchMode === 'financial' &&
    run.status === 'ready' &&
    run.contextStatus === 'ready' &&
    run.assessmentStatus === 'loading';
  if (
    !run.id ||
    run.informationGap ||
    !/^\d{6}$/.test(run.input.securityCode) ||
    !Number.isInteger(run.input.year) ||
    !run.identity ||
    run.identity.exchange === 'us' ||
    run.identity.securityCode !== run.input.securityCode ||
    run.identity.orgId !== run.input.orgId ||
    !run.context ||
    run.context.version !== 1 ||
    run.context.securityCode !== run.input.securityCode ||
    run.context.orgId !== run.input.orgId ||
    !Array.isArray(run.context.financials) ||
    !Array.isArray(run.context.sources) ||
    ['queued', 'running'].includes(run.status) ||
    run.contextStatus === 'loading' ||
    (run.assessmentStatus === 'loading' && !backgroundFinancialAnalysis) ||
    run.challenge?.status === 'loading' ||
    (run.assessment &&
      (run.assessment.year !== run.input.year ||
        run.assessment.snapshotFetchedAt !== run.context.fetchedAt))
  )
    return null;
  const publicRun: CompanyResearchRun = {
    id: run.id,
    input: {
      securityCode: run.input.securityCode,
      orgId: run.input.orgId,
      year: run.input.year,
      purpose: run.input.purpose || 'external',
      researchMode: run.input.researchMode,
    },
    identity: run.identity,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    announcements: run.announcements,
    trace: [],
    model: { requested: run.model.requested, status: run.model.status, name: run.model.name },
    context: run.context,
    contextStatus: run.contextStatus,
    contextRevision: run.contextRevision,
    industry: run.industry,
    industryHistoryErrors: run.industryHistoryErrors,
    assessmentStatus: run.assessmentStatus,
    assessmentRevision: run.assessmentRevision,
    assessmentInputHash: run.assessmentInputHash,
    ...(backgroundFinancialAnalysis && run.assessmentTrace
      ? { assessmentTrace: publicResearchSteps(run.assessmentTrace.slice(-40)) }
      : {}),
  };
  if (run.assessment) {
    const { research, ...assessment } = run.assessment;
    publicRun.assessment = {
      ...assessment,
      ...(research
        ? {
            research: {
              goal: '',
              steps: publicResearchSteps(research.steps),
              modelCalls: research.modelCalls,
              toolCalls: research.toolCalls,
            },
          }
        : {}),
    };
  }
  // Challenge results use fixed public targets; custom execution summaries are not cached.
  if (run.challenge?.result) {
    const result = run.challenge.result;
    publicRun.challenge = {
      status: run.challenge.status,
      target: run.challenge.target,
      revision: run.challenge.revision,
      inputHash: run.challenge.inputHash,
      trace: [],
      result: {
        ...result,
        research: {
          ...result.research,
          steps: result.research.steps.map((step) => ({ ...step, summary: '' })),
        },
      },
    };
  }
  return structuredClone(publicRun);
}

/** Bounded, account-scoped snapshots survive page reloads, without an expiry-triggered query. */
export class CompanyRunCache {
  private activeOwner: string | null = null;
  private memory = new Map<string, Envelope>();
  private removed = new Map<string, Set<string>>();
  private denied = new Set<string>();
  private lastRaw = new Map<string, string | null>();
  constructor(
    private readonly storage: () => CacheStorage | null,
    private readonly now: () => number = Date.now
  ) {}
  activate(owner: string | null) {
    if (owner && owner !== this.activeOwner) {
      // A newly authenticated session may cache retained server records again. Old requests
      // are aborted by the owner lifecycle; deletion/reset within a session stay tombstoned.
      this.removed.delete(owner);
      this.denied.delete(owner);
    }
    this.activeOwner = owner;
  }
  private key(owner: string) {
    return `${COMPANY_CACHE_PREFIX}${encodeURIComponent(owner)}`;
  }
  private load(owner: string): Envelope {
    let next = this.memory.get(owner) || { version: 1 as const, owner, entries: {} };
    if (this.denied.has(owner)) return next;
    try {
      const raw = this.storage()?.getItem(this.key(owner));
      if (raw !== undefined) {
        if (this.lastRaw.has(owner) && raw === this.lastRaw.get(owner)) return next;
        this.lastRaw.set(owner, raw);
        if (!raw) next = { version: 1, owner, entries: {} };
        else if (raw.length * 2 <= COMPANY_CACHE_MAX_BYTES) {
          const parsed = JSON.parse(raw) as Envelope;
          if (
            parsed.version === 1 &&
            parsed.owner === owner &&
            parsed.entries &&
            typeof parsed.entries === 'object' &&
            !Array.isArray(parsed.entries)
          )
            next = {
              version: 1,
              owner,
              entries: Object.fromEntries(
                Object.entries(parsed.entries)
                  .filter(
                    ([id, entry]) => Number.isFinite(entry?.touchedAt) && this.decode(id, entry)
                  )
                  .sort(([, a], [, b]) => b.touchedAt - a.touchedAt)
                  .slice(0, COMPANY_CACHE_MAX_ENTRIES)
              ),
            };
          else next = { version: 1, owner, entries: {} };
        } else next = { version: 1, owner, entries: {} };
      }
    } catch {
      // Restricted storage and damaged JSON must not prevent opening saved server records.
    }
    this.memory.set(owner, next);
    return next;
  }
  private decode(id: string, entry: Entry | undefined): CompanyResearchRun | null {
    try {
      if (
        !entry ||
        typeof entry.payload !== 'string' ||
        entry.payload.length * 2 > COMPANY_CACHE_ENTRY_BYTES ||
        entry.checksum !== checksum(entry.payload)
      )
        return null;
      const run = JSON.parse(entry.payload) as CompanyResearchRun;
      return run.id === id ? publicCompanyCacheRun(run) : null;
    } catch {
      return null;
    }
  }
  read(owner: string, id: string): CompanyResearchRun | null {
    if (owner !== this.activeOwner || this.removed.get(owner)?.has(id)) return null;
    const envelope = this.load(owner);
    const run = this.decode(id, envelope.entries[id]);
    if (run) {
      envelope.entries[id]!.touchedAt = this.now();
      this.persist(envelope);
    }
    return run;
  }
  find(owner: string, input: CompanyRunInput): CompanyResearchRun | null {
    if (owner !== this.activeOwner) return null;
    const envelope = this.load(owner);
    const result =
      Object.keys(envelope.entries)
        .filter((id) => !this.removed.get(owner)?.has(id))
        .map((id) => this.decode(id, envelope.entries[id]))
        .filter(
          (run): run is CompanyResearchRun =>
            Boolean(run) &&
            run!.input.securityCode === input.securityCode &&
            run!.input.orgId === input.orgId &&
            run!.input.year === input.year &&
            (run!.input.purpose || 'external') === (input.purpose || 'external')
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
    return result ? this.read(owner, result.id) : null;
  }
  ids(owner: string): string[] {
    return owner === this.activeOwner ? Object.keys(this.load(owner).entries) : [];
  }
  save(owner: string, run: CompanyResearchRun): void {
    if (owner !== this.activeOwner || this.removed.get(owner)?.has(run.id)) return;
    let publicRun: CompanyResearchRun | null;
    try {
      publicRun = publicCompanyCacheRun(run);
    } catch {
      return;
    }
    if (!publicRun) return;
    const payload = JSON.stringify(publicRun);
    if (payload.length * 2 > COMPANY_CACHE_ENTRY_BYTES) return;
    const envelope = this.load(owner);
    envelope.entries[run.id] = { payload, checksum: checksum(payload), touchedAt: this.now() };
    this.persist(envelope);
  }
  private persist(envelope: Envelope): void {
    const oldest = () =>
      Object.keys(envelope.entries).sort(
        (a, b) => envelope.entries[a]!.touchedAt - envelope.entries[b]!.touchedAt
      )[0];
    while (
      Object.keys(envelope.entries).length > COMPANY_CACHE_MAX_ENTRIES ||
      JSON.stringify(envelope).length * 2 > COMPANY_CACHE_MAX_BYTES
    )
      delete envelope.entries[oldest()!];
    this.memory.set(envelope.owner, envelope);
    const storage = this.storage();
    if (!storage) return;
    try {
      const raw = JSON.stringify(envelope);
      storage.setItem(this.key(envelope.owner), raw);
      this.lastRaw.set(envelope.owner, raw);
    } catch {
      // Evict once on a full browser quota; retain the public copy in memory if still denied.
      const keep = { ...envelope.entries };
      const id = oldest();
      if (id) delete envelope.entries[id];
      try {
        const raw = JSON.stringify(envelope);
        storage.setItem(this.key(envelope.owner), raw);
        this.lastRaw.set(envelope.owner, raw);
      } catch {
        envelope.entries = keep;
        this.denied.add(envelope.owner);
      }
    }
  }
  remove(owner: string, id: string): void {
    const envelope = this.load(owner);
    this.removed.set(owner, new Set([...(this.removed.get(owner) || []), id]));
    delete envelope.entries[id];
    this.persist(envelope);
  }
  retain(owner: string, ids: readonly string[], checkedIds?: readonly string[]): void {
    const allowed = new Set(ids);
    const checked = checkedIds ? new Set(checkedIds) : null;
    const envelope = this.load(owner);
    for (const id of Object.keys(envelope.entries)) {
      if (!allowed.has(id) && (!checked || checked.has(id))) {
        this.removed.set(owner, new Set([...(this.removed.get(owner) || []), id]));
        delete envelope.entries[id];
      }
    }
    this.persist(envelope);
  }
  clear(owner: string): void {
    const envelope = this.load(owner);
    this.removed.set(
      owner,
      new Set([...(this.removed.get(owner) || []), ...Object.keys(envelope.entries)])
    );
    this.memory.delete(owner);
    this.lastRaw.delete(owner);
    try {
      this.storage()?.removeItem(this.key(owner));
    } catch {
      // A restricted browser must not prevent logout or a successful workspace reset.
    }
  }
  externalRemoval(owner: string, ids: string[]) {
    this.memory.delete(owner);
    this.lastRaw.delete(owner);
    this.denied.delete(owner);
    this.removed.set(owner, new Set([...(this.removed.get(owner) || []), ...ids]));
  }
  externalClear(): CompanyCacheInvalidation[] {
    const invalidated = [...this.memory].map(([owner, envelope]) => ({
      owner,
      ids: Object.keys(envelope.entries),
    }));
    for (const { owner, ids } of invalidated) this.externalRemoval(owner, ids);
    return invalidated;
  }
}

const browserStorage = () => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};
export const companyRunCache = new CompanyRunCache(browserStorage);
export const activateCompanyRunCache = (owner: string | null) => companyRunCache.activate(owner);
export const readCachedCompanyRun = (owner: string, id: string) => companyRunCache.read(owner, id);
export const findCachedCompanyRun = (owner: string, input: CompanyRunInput) =>
  companyRunCache.find(owner, input);
export const cacheCompanyRun = (owner: string, run: CompanyResearchRun) =>
  companyRunCache.save(owner, run);
export const removeCachedCompanyRun = (owner: string, id: string) =>
  companyRunCache.remove(owner, id);
export const cachedCompanyRunIds = (owner: string) => companyRunCache.ids(owner);
export const retainCachedCompanyRuns = (
  owner: string,
  ids: readonly string[],
  checkedIds?: readonly string[]
) => companyRunCache.retain(owner, ids, checkedIds);
export const clearCompanyRunCache = (owner: string) => companyRunCache.clear(owner);

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === null) {
      for (const detail of companyRunCache.externalClear())
        window.dispatchEvent(new CustomEvent(COMPANY_CACHE_EVENT, { detail }));
      return;
    }
    if (!event.key?.startsWith(COMPANY_CACHE_PREFIX)) return;
    try {
      const owner = decodeURIComponent(event.key.slice(COMPANY_CACHE_PREFIX.length));
      const before = event.oldValue ? (JSON.parse(event.oldValue) as Envelope) : null;
      const after = event.newValue ? (JSON.parse(event.newValue) as Envelope) : null;
      const ids = Object.keys(before?.entries || {}).filter((id) => !after?.entries?.[id]);
      if (ids.length) {
        companyRunCache.externalRemoval(owner, ids);
        window.dispatchEvent(
          new CustomEvent<CompanyCacheInvalidation>(COMPANY_CACHE_EVENT, { detail: { owner, ids } })
        );
      }
    } catch {
      // Other tabs' malformed storage must not break this page.
    }
  });
}
