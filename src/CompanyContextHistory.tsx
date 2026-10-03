import { useId, useState } from 'react';
import type {
  CompanyContextSnapshot,
  CompanyIndustrySnapshot,
  ContextAmountField,
} from '../shared/company-workspace';
import {
  analyzeCompanyContext,
  contextFieldLabels,
  type CompanyReadingBasis,
} from '../shared/company-analysis';
import {
  buildFinancialChartPoints,
  financialChartAmount,
  financialChartFields,
  financialChartGroups,
  financialChartSourceFields,
  type FinancialChartKey,
} from '../shared/company-financial-charts';
import { CompanyContextEvidence } from './CompanyContextViews';
import { ChartMetricSummary, HistoryMetricChart } from './FinancialCharts';
import { useApp } from './context';
import { money } from './format';

export function CompanyContextHistory({
  snapshot,
  basis,
  industries,
  selectedPeriod,
  onPeriodChange,
}: {
  snapshot: CompanyContextSnapshot;
  basis: CompanyReadingBasis;
  industries?: Record<string, CompanyIndustrySnapshot>;
  selectedPeriod?: string;
  onPeriodChange?: (period: string) => void;
}) {
  const { t, locale } = useApp();
  const analysis = analyzeCompanyContext(snapshot, basis);
  const series = buildFinancialChartPoints(snapshot, basis, industries);
  const periods = series.revenue.map((point) => point.period);
  const tabId = useId();
  const [tab, setTab] = useState('cash');
  const [localPeriod, setLocalPeriod] = useState(periods.at(-1) || '');
  const requestedPeriod = selectedPeriod ?? localPeriod;
  const period = periods.includes(requestedPeriod) ? requestedPeriod : periods.at(-1) || '';
  const changePeriod = (next: string) => {
    setLocalPeriod(next);
    onPeriodChange?.(next);
  };
  const group = financialChartGroups.find((item) => item.id === tab) || financialChartGroups[0]!;
  const detail = analysis.annuals.find((row) => row.period === period);
  const prior = analysis.annuals.find(
    (row) => row.period === `${Number(period.slice(0, 4)) - 1}-12-31`
  );
  const profitLabel = t(...contextFieldLabels[analysis.profitField]);
  const metricLabel = (key: FinancialChartKey) =>
    key === 'profit'
      ? profitLabel
      : key === 'netMargin'
        ? basis === 'parent'
          ? t('归母净利率', 'Attributable net margin')
          : t('合并净利率', 'Consolidated net margin')
        : t(...financialChartFields[key].label);
  const formulas: Partial<Record<FinancialChartKey, string>> = {
    shortDebt: t(
      '短期借款 + 一年内到期非流动负债',
      'Short-term borrowing + current portion of noncurrent liabilities'
    ),
    netMargin: t(`${profitLabel} ÷ 营业总收入 × 100%`, `${profitLabel} / revenue × 100%`),
    ocfToRevenue: t('经营现金净额 ÷ 营业总收入 × 100%', 'Operating cash flow / revenue × 100%'),
    receivableToRevenue: t('应收账款 ÷ 营业总收入 × 100%', 'Accounts receivable / revenue × 100%'),
    revenueGrowth: prior
      ? t(
          '（本年营业总收入 − 上年营业总收入）÷ 上年营业总收入 × 100%',
          '(Current-year revenue − prior-year revenue) / prior-year revenue × 100%'
        )
      : t(
          '来源提供的营收同比；未取得上年金额。',
          'Revenue growth reported by the source; prior-year amount unavailable.'
        ),
  };
  const cashValues = [...series.profit, ...series.ocf].flatMap((point) =>
    [point.company, point.peer].filter((value): value is number => value !== null)
  );
  const cashRange = {
    minimum: Math.min(0, ...cashValues),
    maximum: Math.max(0, ...cashValues),
  };
  const exactFields = [
    ...new Set(group.keys.flatMap((key) => financialChartSourceFields(key, basis))),
  ];
  const sourcePeriods = (key: FinancialChartKey) => {
    if (!detail || key !== 'revenueGrowth') return undefined;
    return prior ? [prior, detail] : [detail];
  };

  if (!periods.length)
    return (
      <p className="context-empty">
        {t('本次没有取得年度网页字段。', 'No annual web fields retrieved.')}
      </p>
    );

  return (
    <section className="context-history">
      <div className="financial-chart-actions">
        <div className="context-tabs" role="tablist" aria-label={t('财务图表', 'Financial charts')}>
          {financialChartGroups.map(({ id, label }, index) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`${tabId}-${id}`}
              aria-controls={`${tabId}-panel`}
              tabIndex={tab === id ? 0 : -1}
              aria-selected={tab === id}
              onKeyDown={(event) => {
                const next =
                  event.key === 'ArrowRight'
                    ? (index + 1) % financialChartGroups.length
                    : event.key === 'ArrowLeft'
                      ? (index + financialChartGroups.length - 1) % financialChartGroups.length
                      : event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? financialChartGroups.length - 1
                          : null;
                if (next !== null) {
                  event.preventDefault();
                  const nextId = financialChartGroups[next]!.id;
                  setTab(nextId);
                  document.getElementById(`${tabId}-${nextId}`)?.focus();
                }
              }}
              onClick={() => setTab(id)}
            >
              {t(...label)}
            </button>
          ))}
        </div>
        <div className="financial-chart-years" aria-label={t('图表年份', 'Chart year')}>
          {periods.map((item) => (
            <button
              key={item}
              type="button"
              className="context-year-button"
              aria-label={t(`查看 ${item.slice(0, 4)} 年`, `View ${item.slice(0, 4)}`)}
              aria-pressed={period === item}
              onClick={() => changePeriod(item)}
            >
              {item.slice(0, 4)}
            </button>
          ))}
        </div>
      </div>
      <p className="financial-chart-note">
        {period} · {t('年度 · 人民币', 'Annual · CNY')}
        {detail?.noticeDate &&
          ` · ${t(`披露于 ${detail.noticeDate}`, `Disclosed ${detail.noticeDate}`)}`}
      </p>
      <div
        role="tabpanel"
        id={`${tabId}-panel`}
        aria-labelledby={`${tabId}-${group.id}`}
        className="context-chart-panel"
      >
        <div className="financial-chart-grid">
          {group.keys.map((key) => {
            const metric = financialChartFields[key];
            const point = series[key].find((item) => item.period === period);
            const fields = financialChartSourceFields(key, basis);
            const label = metricLabel(key);
            return (
              <article className="financial-chart-card" key={key}>
                <div className="financial-chart-header">
                  <h3>{label}</h3>
                  {detail && fields.length > 0 && (
                    <CompanyContextEvidence
                      snapshot={snapshot}
                      row={detail}
                      fields={fields}
                      periods={sourcePeriods(key)}
                      formula={formulas[key]}
                    />
                  )}
                  {detail && fields.length === 0 && detail.sourceUrls[0] && (
                    <a
                      className="context-evidence-button"
                      href={detail.sourceUrls[0]}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('网页来源', 'Web source')}
                    </a>
                  )}
                </div>
                <ChartMetricSummary
                  company={point?.company ?? null}
                  peer={point?.peer ?? null}
                  count={point?.count ?? null}
                  period={period}
                  unit={metric.unit}
                />
                <HistoryMetricChart
                  points={series[key]}
                  style={metric.style}
                  unit={metric.unit}
                  label={label}
                  selectedPeriod={period}
                  onPeriodChange={changePeriod}
                  companyLabel={snapshot.companyName}
                  sharedRange={
                    tab === 'cash' && (key === 'profit' || key === 'ocf') ? cashRange : undefined
                  }
                />
              </article>
            );
          })}
        </div>
      </div>
      {detail && exactFields.length > 0 && (
        <details className="context-year-detail">
          <summary>
            {t(
              `${period.slice(0, 4)} 年精确金额与来源`,
              `${period.slice(0, 4)} exact amounts and sources`
            )}
          </summary>
          <div className="context-exact-fields">
            {exactFields.map((field: ContextAmountField) => (
              <article key={field}>
                <span>{t(...contextFieldLabels[field])}</span>
                <strong>
                  {money(financialChartAmount(snapshot, period, field), locale, false)}
                </strong>
                <CompanyContextEvidence snapshot={snapshot} row={detail} fields={[field]} />
              </article>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
