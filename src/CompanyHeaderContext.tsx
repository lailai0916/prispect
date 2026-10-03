import { useCompanyRecords } from './CompanyRecordsContext';
import { useApp } from './context';
import { productTerms } from '../shared/product-terms';

/** Reuse the owning account's loaded records without fetching another company. */
export function CompanyHeaderContext({ route, label }: { route: string; label?: string }) {
  const { records } = useCompanyRecords();
  const { t } = useApp();
  const url = new URL(route, 'https://prispect.com');
  const companyPage = url.pathname === '/company';
  const current = companyPage
    ? records.find((record) => record.id === url.searchParams.get('run'))
    : undefined;
  const text = companyPage ? current?.name || t(...productTerms.companyResearch) : label;
  return (
    <span className="header-context" title={text}>
      {text}
    </span>
  );
}
