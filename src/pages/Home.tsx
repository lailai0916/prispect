import { Suspense, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { productTagline } from '../../shared/product-terms';
import { CompanyResearchLauncher } from '../CompanyResearchLauncher';
import { StartInput } from '../StartInput';
import { lazyPage } from '../lazy-page';
import { useApp } from '../context';
import '../home.css';

const CashScenarioPreview = lazyPage(
  () => import('../CashScenarioPreview'),
  (module) => module.CashScenarioPreview
);

export function Home() {
  const { t, user } = useApp();
  const [cashOpen, setCashOpen] = useState(false);
  return (
    <div className="home-landing research-entry-page">
      <CompanyResearchLauncher
        heading={t(...productTagline)}
        metadata={<a href="/docs/guide?section=company">{t('支持范围', 'Coverage')}</a>}
      >
        <StartInput key={user?.id || 'anonymous'} compact />
      </CompanyResearchLauncher>
      <details
        className="research-cash-example"
        onToggle={(event) => setCashOpen(event.currentTarget.open)}
      >
        <summary>
          <div>
            <strong>
              {t('付款日期如何影响现金缺口', 'How payment timing affects a cash gap')}
            </strong>
            <span>
              {t('假设计划 · 可调整日期与依据', 'Hypothetical plan · adjustable dates and inputs')}
            </span>
          </div>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        {cashOpen && (
          <Suspense
            fallback={
              <p className="research-list-state" role="status">
                {t('正在打开情景演算…', 'Opening the scenario…')}
              </p>
            }
          >
            <CashScenarioPreview />
          </Suspense>
        )}
      </details>
    </div>
  );
}
