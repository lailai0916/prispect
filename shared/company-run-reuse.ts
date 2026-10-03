import type { CompanyRunInput, CompanyIdentity } from './contracts.js';

/** Input scope, not display names, determines whether an existing research record applies. */
export type CompanyRunReuseScope = Pick<
  CompanyRunInput,
  'securityCode' | 'orgId' | 'year' | 'purpose'
>;

export interface ReusableCompanyRun {
  id: string;
  input: CompanyRunReuseScope;
  createdAt: string;
  updatedAt?: string;
  informationGap?: unknown;
  identity?: Pick<CompanyIdentity, 'securityCode' | 'orgId' | 'exchange'>;
  context?: unknown;
  assessment?: unknown;
  contextStatus?: string;
  result?: unknown;
}

export function matchesCompanyRunScope(
  run: ReusableCompanyRun,
  scope: CompanyRunReuseScope
): boolean {
  return (
    /^\d{6}$/.test(scope.securityCode) &&
    Boolean(scope.orgId) &&
    !run.informationGap &&
    run.input.securityCode === scope.securityCode &&
    run.input.orgId === scope.orgId &&
    run.input.year === scope.year &&
    (run.input.purpose || 'external') === (scope.purpose || 'external') &&
    (!run.identity ||
      (run.identity.exchange !== 'us' &&
        run.identity.securityCode === scope.securityCode &&
        run.identity.orgId === scope.orgId))
  );
}

/** The caller supplies only the authenticated owner's live records, excluding deleted IDs. */
export function findReusableCompanyRun<T extends ReusableCompanyRun>(
  records: readonly T[],
  scope: CompanyRunReuseScope
): T | undefined {
  const saved = (run: T) =>
    Number(Boolean(run.context || run.assessment || run.result || run.contextStatus === 'ready'));
  return records
    .filter((run) => matchesCompanyRunScope(run, scope))
    .sort(
      (left, right) =>
        saved(right) - saved(left) ||
        (right.updatedAt || right.createdAt).localeCompare(left.updatedAt || left.createdAt) ||
        right.createdAt.localeCompare(left.createdAt) ||
        right.id.localeCompare(left.id)
    )[0];
}
