import { useEffect } from 'react';
import { useCompanyRecords } from './CompanyRecordsContext';
import { useApp } from './context';
import { productTerms } from '../shared/product-terms';
import { companySections } from '../shared/company-workspace';
import { resolveCompanySection } from './routing';

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
  useEffect(() => {
    if (!companyPage) return;
    const query = new URL(route, 'https://prispect.com').searchParams;
    const section = resolveCompanySection(query.get('section'));
    const entry = companySections.find(([id]) => id === section)!;
    document.title = [t(entry[1], entry[2]), current?.name, t('析光', 'Prispect')]
      .filter(Boolean)
      .join(' · ');
  }, [companyPage, current?.name, route, t]);
  return (
    <span className="header-context" title={text}>
      {text}
    </span>
  );
}
