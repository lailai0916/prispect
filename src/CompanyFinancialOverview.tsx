import { useMemo } from 'react';
import type { CompanyResearchRun } from '../shared/contracts';
import { contextFieldLabels, type CompanyReadingBasis } from '../shared/company-analysis';
import {
  companyOverviewEvidencePeriods,
  deriveCompanyFinancialOverview,
  type CompanyOverviewEvidence,
  type CompanyOverviewMeasure,
} from '../shared/company-financial-overview';
import { CompanyContextEvidence } from './CompanyContextViews';
import { useApp } from './context';
import { money, type Locale } from './format';
import './company-financial-overview.css';

function measureValue(measure: CompanyOverviewMeasure, locale: Locale): string {
  if (measure.value === null) return locale === 'en' ? 'Not retrieved' : '未取得';
  if (measure.kind === 'amount')
    return `${money(String(measure.value), locale)}${locale === 'en' ? ' CNY' : '元'}`;
  return `${Number(measure.value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${measure.kind === 'times' ? '×' : '%'}`;
}

function OverviewEvidence({
  run,
  evidence,
}: {
  run: CompanyResearchRun;
  evidence: CompanyOverviewEvidence;
}) {
  const { t } = useApp();
  const periods = companyOverviewEvidencePeriods(run.context, evidence);
  const row = periods.at(-1);
  if (!row) return null;
  return (
    <CompanyContextEvidence
      snapshot={run.context}
      row={row}
      periods={periods}
      fields={evidence.fields}
      formula={t(...evidence.formula)}
    >
      {t('数据与计算', 'Data and calculation')}
    </CompanyContextEvidence>
  );
}

export function CompanyFinancialOverview({
  run,
  basis,
}: {
  run: CompanyResearchRun;
  basis: CompanyReadingBasis;
}) {
  const { t, locale } = useApp();
  const overview = useMemo(() => deriveCompanyFinancialOverview(run, basis), [run, basis]);
  const profitField = basis === 'parent' ? 'parentProfit' : 'netProfit';
  const interim = overview.interim;
  const interimFields = ['revenue', profitField, 'ocf', 'cash'] as const;
  const findings = overview.findings.slice(0, 3);
  return (
    <section
      className="company-f-overview"
      id="company-financial-overview"
      aria-label={t('财务概览', 'Financial overview')}
    >
      <header className="company-f-overview-heading">
        <h2>{t('财务概览', 'Financial overview')}</h2>
        <span>
          {overview.year} · {t(...contextFieldLabels[profitField])} · {t('人民币', 'CNY')}
        </span>
      </header>
      {interim && (
        <section
          className="company-f-interim"
          aria-label={t('最新定期报告', 'Latest interim report')}
        >
          <div className="company-f-interim-heading">
            <span>
              <strong>{t('最新定期报告', 'Latest interim report')}</strong> · {interim.period}
            </span>
            <CompanyContextEvidence
              row={
                run.context!.financials.find((row) => row.period === interim.period && !row.annual)!
              }
              snapshot={run.context}
              fields={[...interimFields]}
              formula={t(
                '营收、利润与经营现金为报告期累计值；货币资金为期末值。',
                'Revenue, profit and operating cash cover the reporting period; monetary funds are the period-end balance.'
              )}
            >
              {t('看明细', 'Details')}
            </CompanyContextEvidence>
          </div>
          <dl className="company-f-interim-values">
            {interimFields.map((field) => (
              <div key={field}>
                <dt>{t(...contextFieldLabels[field])}</dt>
                <dd
                  title={
                    interim.amounts[field] === null
                      ? undefined
                      : `${money(interim.amounts[field], locale, false)} CNY`
                  }
                >
                  {measureValue(
                    {
                      label: contextFieldLabels[field],
                      value: interim.amounts[field],
                      kind: 'amount',
                    },
                    locale
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <div className="company-f-questions">
        {overview.cards.map((card) => (
          <article className="company-f-question" data-status={card.status} key={card.id}>
            <h3>{t(...card.question)}</h3>
            <p className="company-f-verdict">
              <span className="company-f-status-dot" aria-hidden="true" />
              {t(...card.judgment)}
            </p>
            <div className="company-f-primary">
              <span>{t(...card.primary.label)}</span>
              <strong
                title={
                  card.primary.kind === 'amount' && card.primary.value !== null
                    ? `${money(String(card.primary.value), locale, false)} CNY`
                    : undefined
                }
              >
                {measureValue(card.primary, locale)}
              </strong>
            </div>
            <dl className="company-f-measures">
              {card.measures.map((measure, index) => (
                <div key={index}>
                  <dt>{t(...measure.label)}</dt>
                  <dd
                    title={
                      measure.kind === 'amount' && measure.value !== null
                        ? `${money(String(measure.value), locale, false)} CNY`
                        : undefined
                    }
                  >
                    {measureValue(measure, locale)}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="company-f-detail">{t(...card.detail)}</p>
            <OverviewEvidence run={run} evidence={card.evidence} />
          </article>
        ))}
      </div>
      {overview.state === 'mismatch' && (
        <p className="company-f-data-gap" role="status">
          {t(
            '来源主体与当前研究不一致，请核对主体后继续。',
            'The source issuer does not match this research. Check the issuer before continuing.'
          )}
        </p>
      )}
      {findings.length > 0 && (
        <section
          className="company-f-findings"
          id="company-financial-attention"
          aria-label={t('值得注意的事', 'What deserves attention')}
        >
          <h3>{t('值得注意的事', 'What deserves attention')}</h3>
          <ul>
            {findings.map((finding) => (
              <li key={finding.id} data-status={finding.status}>
                <span className="company-f-status-dot" aria-hidden="true" />
                <div>
                  <strong>
                    {t(...finding.title)}
                    {finding.measure && (
                      <span className="company-f-finding-value">
                        {' '}
                        · {measureValue(finding.measure, locale)}
                      </span>
                    )}
                  </strong>
                  <p>{t(...finding.detail)}</p>
                </div>
                <OverviewEvidence run={run} evidence={finding.evidence} />
              </li>
            ))}
          </ul>
          {overview.findings.length > 3 && (
            <details className="company-f-more-findings">
              <summary>
                {t(
                  `另有 ${overview.findings.length - 3} 项财务线索`,
                  `${overview.findings.length - 3} more financial findings`
                )}
              </summary>
              <ul>
                {overview.findings.slice(3).map((finding) => (
                  <li key={finding.id} data-status={finding.status}>
                    <span className="company-f-status-dot" aria-hidden="true" />
                    <div>
                      <strong>{t(...finding.title)}</strong>
                      <p>{t(...finding.detail)}</p>
                    </div>
                    <OverviewEvidence run={run} evidence={finding.evidence} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
      {overview.nextCheck && (
        <p className="company-f-next-check">
          <strong>{t('接下来查', 'Next check')}</strong>
          <span>{t(...overview.nextCheck)}</span>
        </p>
      )}
    </section>
  );
}
