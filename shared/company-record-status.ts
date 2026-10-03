import type { CompanyRecordSummary } from './company-workspace.js';

/** Stored financial sources are distinct from a completed assessment or original candidate. */
export function hasSavedFinancialRecord(record: CompanyRecordSummary): boolean {
  return (
    record.input.researchMode === 'financial' &&
    !record.informationGap &&
    record.contextStatus === 'ready'
  );
}

export function hasSavedCompanyRecord(record: CompanyRecordSummary): boolean {
  return Boolean(record.result) || hasSavedFinancialRecord(record);
}

/** Missing mode preserves the original workflow for historical records. */
export function financialRecordState(
  record: CompanyRecordSummary
): readonly [string, string] | null {
  if (record.input.researchMode !== 'financial' || record.informationGap) return null;
  if (record.contextStatus === 'ready') return ['财务资料已保存', 'Financial data saved'];
  if (record.status === 'cancelled') return ['已取消', 'Cancelled'];
  return ['财务资料未完成', 'Financial data incomplete'];
}
