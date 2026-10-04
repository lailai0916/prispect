import { useMemo, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import {
  contextFieldLabels,
  contextFen,
  contextRatio,
  type CompanyReadingBasis,
} from '../shared/company-analysis';
import {
  companyOverviewEvidencePeriods,
  deriveCompanyFinancialOverview,
  type CompanyOverviewEvidence,
  type CompanyOverviewMeasure,
} from '../shared/company-financial-overview';
import { deriveCompanyReportDocument } from '../shared/company-report-document';
import { CompanyContextEvidence } from './CompanyContextViews';
import { CompanyReportProfitCashChart } from './CompanyReportCharts';
import { useApp } from './context';
import { money, type Locale } from './format';
import './company-financial-overview.css';

function measureValue(measure: CompanyOverviewMeasure, locale: Locale): string {
  if (measure.value === null) return locale === 'en' ? 'Not retrieved' : '未取得';
  if (measure.kind === 'amount')
    return `${money(String(measure.value), locale)}${locale === 'en' ? ' CNY' : '元'}`;
  return `${Number(measure.value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${measure.kind === 'times' ? '×' : '%'}`;
}

function MeasureText({ measure, locale }: { measure: CompanyOverviewMeasure; locale: Locale }) {
  const value = measureValue(measure, locale);
  const parts = measure.value === null ? null : value.match(/^(-?[\d.,]+)(.*)$/);
  return parts ? (
    <>
      {parts[1]}
      <small>{parts[2]}</small>
    </>
  ) : (
    value
  );
}

function OverviewEvidence({
  run,
  evidence,
  children,
}: {
  run: CompanyResearchRun;
  evidence: CompanyOverviewEvidence;
  children?: ReactNode;
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
      {children || t('数据与计算', 'Data and calculation')}
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
  // The current acquired snapshot must never borrow a saved AI generation's metrics.
  const document = useMemo(
    () => deriveCompanyReportDocument({ ...run, assessment: undefined }, 'consolidated'),
    [run]
  );
  const profitField = basis === 'parent' ? 'parentProfit' : 'netProfit';
  const annual = overview.annual;
  const interim = overview.interim;
  const interimFields = ['revenue', profitField, 'ocf', 'cash'] as const;
  const profit = annual?.amounts[profitField] ?? null;
  const operatingCash = annual?.amounts.ocf ?? null;
  const cashRatio = contextRatio(operatingCash, profit);
  const annualProfit = contextFen(profit);
  const ratioInapplicable = annualProfit !== null && annualProfit <= 0n;
  const keyMeasures: CompanyOverviewMeasure[] = [
    { label: contextFieldLabels[profitField], value: profit, kind: 'amount' },
    { label: contextFieldLabels.ocf, value: operatingCash, kind: 'amount' },
    {
      label:
        basis === 'parent'
          ? ['经营现金 / 归母净利润', 'Operating cash / attributable profit']
          : ['经营现金 / 合并净利润', 'Operating cash / consolidated profit'],
      value: cashRatio === null ? null : cashRatio * 100,
      kind: 'percent',
    },
  ];
  const annualEvidence: CompanyOverviewEvidence = {
    periods: annual ? [annual.period] : [],
    fields: [profitField, 'ocf'],
    sourceIds: [],
    formula: [
      `经营现金 / ${contextFieldLabels[profitField][0]} = ${overview.year} 年经营现金净额 ÷ 同年${contextFieldLabels[profitField][0]}；利润不为正时，比率不适用。`,
      `Operating cash / ${contextFieldLabels[profitField][1].toLowerCase()} = ${overview.year} operating cash flow ÷ same-year profit; the ratio is inapplicable with nonpositive profit.`,
    ],
  };
  const chartEvidence: CompanyOverviewEvidence = {
    periods:
      document.facts.length > 0
        ? [overview.year - 2, overview.year - 1, overview.year].map((year) => `${year}-12-31`)
        : [],
    fields: ['netProfit', 'ocf'],
    sourceIds: [],
    formula: [
      '按同一年度比较合并净利润与经营现金净额；现金利润比仅在同年合并净利润为正时适用。',
      'Compare consolidated profit and operating cash for the same annual period; cash-to-profit applies only with positive same-year consolidated profit.',
    ],
  };
  const priority = { risk: 0, watch: 1, unknown: 2, good: 3 };
  const focus = [...overview.cards].sort(
    (left, right) => priority[left.status] - priority[right.status]
  )[0]!;
  const headline = t(...focus.judgment);
  const summary = overview.cards.map((card) => t(...card.detail)).join(' ');
  const insights = [
    ...overview.findings.map((finding) => ({
      id: `finding-${finding.id}`,
      findingId: finding.id,
      title: finding.title,
      detail: finding.detail,
      status: finding.status,
      measure: finding.measure,
      evidence: finding.evidence,
    })),
    ...overview.cards.map((card) => ({
      id: `card-${card.id}`,
      findingId: null,
      title: card.judgment,
      detail: card.detail,
      status: card.status,
      measure: undefined,
      evidence: card.evidence,
    })),
  ]
    .filter(
      (item, index, items) => items.findIndex((other) => other.title[0] === item.title[0]) === index
    )
    .slice(0, 3);
  const shownFindings = new Set(insights.map((insight) => insight.findingId));
  const remainingFindings = overview.findings.filter((finding) => !shownFindings.has(finding.id));

  return (
    <section
      className="company-f-overview"
      id="company-financial-overview"
      aria-label={t('财务概览', 'Financial overview')}
    >
      <header className="company-f-overview-heading">
        <span>{t('核心财务观察', 'Core financial observations')}</span>
        <span>
          {overview.year} · {t(...contextFieldLabels[profitField])} · {t('人民币', 'CNY')}
        </span>
      </header>
      <div className="company-f-core">
        <h2>{headline}</h2>
        <p>{summary}</p>
      </div>
      {overview.state === 'mismatch' && (
        <p className="company-f-data-gap" role="status">
          {t(
            '来源主体与当前研究不一致，请核对主体后继续。',
            'The source issuer does not match this research. Check the issuer before continuing.'
          )}
        </p>
      )}
      <dl className="company-f-key-figures">
        {keyMeasures.map((measure, index) => (
          <div key={index}>
            <dt>{t(...measure.label)}</dt>
            <dd
              data-missing={measure.value === null}
              title={
                measure.kind === 'amount' && measure.value !== null
                  ? `${money(String(measure.value), locale, false)} CNY`
                  : undefined
              }
            >
              {index === 2 && ratioInapplicable ? (
                t('不适用', 'Not applicable')
              ) : (
                <MeasureText measure={measure} locale={locale} />
              )}
            </dd>
            <span>
              {index === 2 && ratioInapplicable
                ? t(
                    '利润不为正，直接看经营现金',
                    'With nonpositive profit, read operating cash directly'
                  )
                : t(`${overview.year} 年度`, `${overview.year} annual period`)}
            </span>
          </div>
        ))}
      </dl>
      <div className="company-f-key-evidence">
        <OverviewEvidence run={run} evidence={annualEvidence}>
          {t('查看年度数据与来源', 'View annual data and sources')}
        </OverviewEvidence>
      </div>
      <div className="company-f-chart-section">
        {basis === 'parent' && (
          <p className="company-f-chart-scope">
            {t(
              '上方利润按归母口径展示；下图统一比较合并净利润与经营现金。',
              'The figures above use attributable profit; the chart compares consolidated profit with operating cash.'
            )}
          </p>
        )}
        <CompanyReportProfitCashChart facts={document.facts} year={overview.year}>
          <OverviewEvidence run={run} evidence={chartEvidence}>
            {t('查看图表数据与来源', 'View chart data and sources')}
          </OverviewEvidence>
        </CompanyReportProfitCashChart>
      </div>
      <section
        className="company-f-findings"
        id="company-financial-attention"
        aria-label={t('财务重点', 'Financial highlights')}
      >
        <ol className="company-f-insights">
          {insights.map((insight, index) => (
            <li key={insight.id} data-status={insight.status}>
              <span className="company-f-insight-number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3>{t(...insight.title)}</h3>
                {insight.measure && (
                  <p className="company-f-finding-value">{measureValue(insight.measure, locale)}</p>
                )}
                <p>{t(...insight.detail)}</p>
                <OverviewEvidence run={run} evidence={insight.evidence} />
              </div>
            </li>
          ))}
        </ol>
        {remainingFindings.length > 0 && (
          <details className="company-f-report-details company-f-more-findings">
            <summary>
              <ChevronRight size={14} aria-hidden="true" />
              <span>
                {t(
                  `其余 ${remainingFindings.length} 项财务线索`,
                  `${remainingFindings.length} more financial findings`
                )}
              </span>
            </summary>
            <ul className="company-f-finding-list">
              {remainingFindings.map((finding) => (
                <li key={finding.id} data-status={finding.status}>
                  <div>
                    <h3>{t(...finding.title)}</h3>
                    {finding.measure && (
                      <p className="company-f-finding-value">
                        {measureValue(finding.measure, locale)}
                      </p>
                    )}
                    <p>{t(...finding.detail)}</p>
                  </div>
                  <OverviewEvidence run={run} evidence={finding.evidence} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <details className="company-f-report-details">
        <summary>
          <ChevronRight size={14} aria-hidden="true" />
          <span>{t('完整财务数据与计算', 'Full financial data and calculations')}</span>
          <small>{t('盈利、现金与偿付依据', 'Profit, cash and repayment evidence')}</small>
        </summary>
        <div className="company-f-detail-sections">
          {overview.cards.map((card) => (
            <article className="company-f-question" data-status={card.status} key={card.id}>
              <h3>{t(...card.question)}</h3>
              <p className="company-f-verdict">{t(...card.judgment)}</p>
              <dl className="company-f-measures">
                {[card.primary, ...card.measures].map((measure, index) => (
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
                  run.context!.financials.find(
                    (row) => row.period === interim.period && !row.annual
                  )!
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
      </details>
      {overview.nextCheck && (
        <details className="company-f-report-details company-f-next-check">
          <summary>
            <ChevronRight size={14} aria-hidden="true" />
            <span>{t('进一步核查建议', 'Further checks')}</span>
            <small>{t('需要补齐的材料与问题', 'Materials and questions to investigate')}</small>
          </summary>
          <p>{t(...overview.nextCheck)}</p>
          {overview.findings.length > 0 && (
            <ul className="company-f-check-list">
              {overview.findings.map((finding) => (
                <li key={finding.id}>
                  <h3>{t(...finding.title)}</h3>
                  <p>{t(...finding.nextCheck)}</p>
                  <OverviewEvidence run={run} evidence={finding.evidence} />
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </section>
  );
}
