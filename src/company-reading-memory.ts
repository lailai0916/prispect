import type { CompanyResearchRun } from '../shared/contracts';
import type { CompanySection } from '../shared/company-workspace';

/** Only document sections, never arbitrary element IDs, inputs or private drafts. */
export const companyReadingAnchors: Record<CompanySection, readonly string[]> = {
  overview: [
    'company-financial-overview',
    'company-financial-attention',
    'company-financial-data',
    'research-summary-heading',
    'research-findings-heading',
    'research-next-heading',
    'company-next-checks',
    'company-research-process',
    'company-evidence-lab',
    'company-full-report',
    'company-review-requests',
    'company-research-framework',
    'company-source-trust',
  ],
  trends: ['company-financial-history', 'company-financial-data', 'company-original-comparison'],
  industry: ['company-industry'],
  disclosures: ['company-disclosures', 'company-public-signals'],
  profile: ['company-profile'],
  coverage: ['company-source-trust', 'company-data-coverage'],
  financial: [
    'company-financial-history',
    'company-financial-data',
    'company-financial-findings',
    'company-industry',
    'company-original-comparison',
  ],
  sources: [
    'company-public-signals',
    'company-disclosures',
    'company-profile',
    'company-data-coverage',
    'company-source-trust',
    'company-source-comparison',
  ],
  evidence: [],
};

export const companyReadingDisclosures: Record<CompanySection, readonly string[]> = {
  overview: [
    'company-financial-data',
    'company-research-process',
    'company-evidence-lab',
    'company-full-report',
    'company-next-checks',
  ],
  trends: ['company-financial-data', 'company-original-comparison'],
  industry: [],
  disclosures: ['company-public-signals'],
  profile: [],
  coverage: [],
  financial: ['company-financial-data', 'company-industry', 'company-original-comparison'],
  sources: ['company-profile', 'company-data-coverage', 'company-source-comparison'],
  evidence: [],
};

export interface CompanyReadingScope {
  owner: string;
  record: string;
  snapshot: string;
}

export const companyReadingDefaultOpen: Record<CompanySection, readonly string[]> = {
  overview: ['company-next-checks'],
  trends: [],
  industry: [],
  disclosures: [],
  profile: [],
  coverage: [],
  financial: [],
  sources: [],
  evidence: [],
};

export interface CompanyReadingPosition {
  scrollY: number;
  anchor: string | null;
  offset: number;
  openDetails: string[];
}

export function companyReadingScope(owner: string, run: CompanyResearchRun): CompanyReadingScope {
  return {
    owner,
    record: run.id,
    snapshot: JSON.stringify([
      run.input.securityCode,
      run.input.orgId,
      run.input.year,
      run.identity?.securityCode || '',
      run.identity?.orgId || '',
      run.context?.securityCode || '',
      run.context?.orgId || '',
      run.context?.fetchedAt || '',
      run.assessment?.year ?? null,
      run.assessment?.snapshotFetchedAt || '',
      run.assessment?.generatedAt || '',
    ]),
  };
}

/** Relative anchoring tolerates changed viewport width; final position always fits the document. */
export function companyReadingScrollTarget(
  position: CompanyReadingPosition,
  anchorTop: number | null,
  maximum: number
): number {
  const requested =
    anchorTop !== null && Number.isFinite(anchorTop)
      ? anchorTop + position.offset
      : position.scrollY;
  return Math.min(Math.max(0, Number.isFinite(maximum) ? maximum : 0), Math.max(0, requested));
}

function validPosition(section: CompanySection, value: CompanyReadingPosition): boolean {
  return (
    Number.isFinite(value.scrollY) &&
    value.scrollY >= 0 &&
    value.scrollY <= 10_000_000 &&
    Number.isFinite(value.offset) &&
    Math.abs(value.offset) <= 10_000_000 &&
    (value.anchor === null || companyReadingAnchors[section].includes(value.anchor)) &&
    Array.isArray(value.openDetails) &&
    value.openDetails.every((id) => companyReadingDisclosures[section].includes(id))
  );
}

/** A bounded, per-tab cache. No browser storage, network requests or saved research writes. */
export class CompanyReadingMemory {
  private owner: string | null = null;
  private readonly entries = new Map<string, CompanyReadingPosition>();
  private readonly snapshots = new Map<string, string>();

  constructor(private readonly maximum = 24) {}

  changeOwner(owner: string | null): void {
    if (this.owner === owner) return;
    this.owner = owner;
    this.entries.clear();
    this.snapshots.clear();
  }

  private key(scope: CompanyReadingScope, section: CompanySection): string {
    return JSON.stringify([scope.record, scope.snapshot, section]);
  }

  enter(scope: CompanyReadingScope): void {
    this.changeOwner(scope.owner);
    const previous = this.snapshots.get(scope.record);
    if (previous && previous !== scope.snapshot) {
      for (const key of this.entries.keys()) {
        if ((JSON.parse(key) as string[])[0] === scope.record) this.entries.delete(key);
      }
    }
    this.snapshots.delete(scope.record);
    this.snapshots.set(scope.record, scope.snapshot);
    while (this.snapshots.size > this.maximum) {
      const oldest = this.snapshots.keys().next().value!;
      this.snapshots.delete(oldest);
      for (const key of this.entries.keys()) {
        if ((JSON.parse(key) as string[])[0] === oldest) this.entries.delete(key);
      }
    }
  }

  read(scope: CompanyReadingScope, section: CompanySection): CompanyReadingPosition | null {
    if (scope.owner !== this.owner || this.snapshots.get(scope.record) !== scope.snapshot)
      return null;
    const key = this.key(scope, section);
    const value = this.entries.get(key);
    if (!value) return null;
    this.entries.delete(key);
    this.entries.set(key, value);
    return { ...value, openDetails: [...value.openDetails] };
  }

  save(
    scope: CompanyReadingScope,
    section: CompanySection,
    value: CompanyReadingPosition
  ): boolean {
    if (
      scope.owner !== this.owner ||
      this.snapshots.get(scope.record) !== scope.snapshot ||
      !validPosition(section, value)
    )
      return false;
    const key = this.key(scope, section);
    this.entries.delete(key);
    this.entries.set(key, { ...value, openDetails: [...new Set(value.openDetails)] });
    while (this.entries.size > this.maximum) this.entries.delete(this.entries.keys().next().value!);
    return true;
  }
}

export const companyReadingMemory = new CompanyReadingMemory();
