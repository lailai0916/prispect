import { productTerms } from '../shared/product-terms';
import { ArrowUpRight, FileText, HandCoins, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApp } from './context';
import './home.css';

/** Both entry routes share the same reading order and composer presentation. */
export function CompanyResearchLauncher({
  children,
  metadata,
  feedback,
}: {
  children: ReactNode;
  metadata?: ReactNode;
  feedback?: ReactNode;
}) {
  const { t } = useApp();
  return (
    <section className="research-launcher" aria-labelledby="research-entry-title">
      <header className="research-entry-heading">
        <h1 id="research-entry-title">{t(...productTerms.companyResearch)}</h1>
        <p>
          {t(
            '输入公司名称或证券代码，核对主体后查看研究报告。',
            'Enter a company name or ticker. Confirm the entity, then open its research report.'
          )}
        </p>
      </header>
      {children}
      <div className="research-entry-meta">
        <span>
          {t('财务披露 · 行业 · 新闻与公开讨论', 'Financials · industry · news and public posts')}
        </span>
        {metadata}
      </div>
      {feedback && <div className="research-entry-feedback">{feedback}</div>}
      <nav className="research-entry-shortcuts" aria-label={t('其他核查入口', 'Other reviews')}>
        <a href="/new?case=custom">
          <FileText size={14} />
          {t('核对已有年报', 'Review your annual report')}
          <ArrowUpRight size={12} />
        </a>
        <a href="/decisions?new=external">
          <HandCoins size={14} />
          {t(...productTerms.beforePayment)}
          <ArrowUpRight size={12} />
        </a>
        <a href="/decisions?new=handover">
          <Wallet size={14} />
          {t(...productTerms.handoverReview)}
          <ArrowUpRight size={12} />
        </a>
      </nav>
    </section>
  );
}
