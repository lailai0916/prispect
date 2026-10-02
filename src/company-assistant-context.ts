import { createContext } from 'react';
import type { CompanyResearchRun } from '../shared/contracts';
import type { CompanyReadingBasis } from '../shared/company-analysis';

export interface AssistantCompany {
  owner: string;
  run: CompanyResearchRun;
  basis: CompanyReadingBasis;
  changeBasis: (basis: CompanyReadingBasis) => void;
}
export const CompanyAssistantContext = createContext<{
  company: AssistantCompany | null;
  publish: (company: AssistantCompany) => void;
}>({ company: null, publish: () => {} });
