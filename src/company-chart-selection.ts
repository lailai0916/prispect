import type { CompanyResearchRun } from '../shared/contracts';

export function companyChartSelectionScope(run: CompanyResearchRun): string {
  return JSON.stringify([
    run.id,
    run.input.securityCode,
    run.input.orgId,
    run.input.year,
    run.context?.securityCode || '',
    run.context?.orgId || '',
  ]);
}

/** Local chart choices survive route changes, but never cross owners or query subjects. */
export class CompanyChartSelectionMemory {
  private owner: string | null = null;
  private readonly periods = new Map<string, string>();

  constructor(private readonly maximum = 24) {}

  read(owner: string, scope: string): string | null {
    if (this.owner !== owner) {
      this.owner = owner;
      this.periods.clear();
    }
    const period = this.periods.get(scope);
    if (!period) return null;
    this.periods.delete(scope);
    this.periods.set(scope, period);
    return period;
  }

  save(owner: string, scope: string, period: string): boolean {
    if (this.owner !== owner || !/^20\d{2}-12-31$/.test(period)) return false;
    this.periods.delete(scope);
    this.periods.set(scope, period);
    while (this.periods.size > this.maximum) this.periods.delete(this.periods.keys().next().value!);
    return true;
  }
}

export const companyChartSelectionMemory = new CompanyChartSelectionMemory();
