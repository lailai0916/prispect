import type {
  CompanyContextPeriod,
  CompanyContextSnapshot,
  CompanySourceComparison,
  ContextAmountField,
} from './company-workspace.js';

/** Only compare the periods and fields behind the result the reader opened. */
export function companyEvidenceComparisons(
  snapshot: CompanyContextSnapshot | undefined,
  periods: CompanyContextPeriod[],
  fields: ContextAmountField[]
): CompanySourceComparison[] {
  const selectedPeriods = new Set(periods.map((period) => period.period));
  const selectedFields = new Set(fields);
  return (snapshot?.comparisons || []).filter(
    (check) => selectedPeriods.has(check.period) && selectedFields.has(check.field)
  );
}

function financialTable(field: ContextAmountField): 'income' | 'cashflow' | 'balance' {
  if (
    [
      'revenue',
      'netProfit',
      'parentProfit',
      'deductedProfit',
      'operatingProfit',
      'totalProfit',
      'financeExpense',
    ].includes(field)
  )
    return 'income';
  if (['ocf', 'investingCash', 'financingCash', 'salesCash'].includes(field)) return 'cashflow';
  return 'balance';
}

/** Keep recorded row URLs; never substitute another period or a provider homepage. */
export function companyEvidenceSourceUrls(
  snapshot: CompanyContextSnapshot | undefined,
  row: CompanyContextPeriod | undefined,
  field: ContextAmountField,
  provider: 'primary' | 'secondary'
): string[] {
  if (!row) return [];
  const table = financialTable(field);
  const sourceId = `${provider === 'primary' ? 'em' : 'sina'}-${table}`;
  const recordedUrl = snapshot?.sources.find((source) => source.id === sourceId)?.url;
  return [...new Set(row.sourceUrls)].filter((value) => {
    try {
      const url = new URL(value);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.hostname !== (provider === 'primary' ? 'datacenter.eastmoney.com' : 'quotes.sina.cn')
      )
        return false;
      if (value === recordedUrl) return true;
      if (provider === 'primary')
        return (
          url.hostname === 'datacenter.eastmoney.com' &&
          url.searchParams.get('reportName') ===
            {
              income: 'RPT_F10_FINANCE_GINCOME',
              cashflow: 'RPT_F10_FINANCE_GCASHFLOW',
              balance: 'RPT_F10_FINANCE_GBALANCE',
            }[table]
        );
      return (
        url.hostname === 'quotes.sina.cn' &&
        url.searchParams.get('source') === { income: 'lrb', cashflow: 'llb', balance: 'fzb' }[table]
      );
    } catch {
      return false;
    }
  });
}
