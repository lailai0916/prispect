import { useId, useMemo, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Building2,
  ChartNoAxesCombined,
  Database,
  FileText,
  GitCompareArrows,
  Layers,
} from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import type { AssessmentJudgment } from '../shared/company-assessment';
import { contextFieldLabels, type CompanyReadingBasis } from '../shared/company-analysis';
import { chartRange } from '../shared/company-chart-geometry';
import { deriveCompanyFinancialOverview } from '../shared/company-financial-overview';
import { companyReportCore } from '../shared/company-report-summary';
import {
  companyPath,
  companySections,
  type CompanyContextPeriod,
  type ContextAmountField,
} from '../shared/company-workspace';
import { CompanyAICoreReport } from './CompanyAICoreReport';
import { CompanyContextEvidence } from './CompanyContextViews';
import { useApp } from './context';
import { chartScale, date, money } from './format';

const detailPages = [
  ['trends', '看历年变化', 'See changes over time', ChartNoAxesCombined],
  ['industry', '放到同行中看', 'Compare with peers', Layers],
  ['disclosures', '追溯公开事件', 'Trace public events', FileText],
  ['profile', '了解企业与股东', 'Company and shareholders', Building2],
  ['coverage', '哪些资料已经取得', 'See what is available', Database],
  ['sources', '核对字段与来源', 'Check fields and sources', GitCompareArrows],
] as const;

function ReportCashChart({
  run,
  annuals,
  profitField,
}: {
  run: CompanyResearchRun;
  annuals: CompanyContextPeriod[];
  profitField: 'parentProfit' | 'netProfit';
}) {
  const { t, locale } = useApp();
  const titleId = useId();
  const fields = [profitField, 'ocf'] as const;
  // These rows come from the existing issuer-, period- and source-validated overview.
  // Number conversion is for drawing only; source amounts remain exact strings.
  const values = annuals.flatMap((row) =>
    fields.map((field) => (row.amounts[field] === null ? null : Number(row.amounts[field])))
  );
  const available = values.some((value) => value !== null && Number.isFinite(value));
  const range = chartRange(values);
  const scale = chartScale(
    Math.max(Math.abs(range.minimum), Math.abs(range.maximum)),
    range.maximum - range.minimum,
    locale,
    Math.max(1, range.ticks.length - 1)
  );
  const width = 760,
    height = 262,
    left = 68,
    right = 20,
    top = 18,
    bottom = 36;
  const y = (value: number) =>
    top + ((range.maximum - value) / (range.maximum - range.minimum)) * (height - top - bottom);
  const step = (width - left - right) / Math.max(1, annuals.length);
  const barWidth = Math.min(30, step * 0.25);
  const evidenceRow = annuals.at(-1);
  return (
    <section className="company-report-trend" id="company-report-trend" aria-labelledby={titleId}>
      <header className="company-report-section-heading">
        <div>
          <span className="company-report-section-kicker">{t('看见变化', 'See the trend')}</span>
          <h2 id={titleId}>{t('利润与经营现金', 'Profit and operating cash')}</h2>
          <p>
            {t(
              '赚到的利润，是否伴随经营现金流入？',
              'Does earned profit come with operating cash inflow?'
            )}
          </p>
        </div>
        {evidenceRow && (
          <CompanyContextEvidence
            snapshot={run.context}
            row={evidenceRow}
            periods={annuals}
            fields={[...fields]}
            formula={t(
              '按实际取得的年度比较所选口径净利润与经营活动现金流量净额，两者共用金额刻度。',
              'Compare acquired annual profit on the selected basis with net operating cash flow, using one amount scale.'
            )}
          >
            {t('图表依据', 'Chart evidence')}
          </CompanyContextEvidence>
        )}
      </header>
      {available ? (
        <>
          <div className="company-report-chart-legend">
            <span>
              <i data-series="profit" />
              {t(...contextFieldLabels[profitField])}
            </span>
            <span>
              <i data-series="cash" />
              {t('经营现金净额', 'Operating cash flow')}
            </span>
            <small>
              {t('人民币', 'Currency')} · {scale.label}
            </small>
          </div>
          <div
            className="company-report-chart-scroll"
            tabIndex={0}
            aria-label={t(
              '年度利润与现金图表，可横向滚动',
              'Annual profit and cash chart; scroll horizontally'
            )}
          >
            <svg
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-labelledby={titleId}
              data-testid="company-report-cash-chart"
            >
              <title>
                {t(
                  '已取得年度的净利润与经营现金净额；缺失值不绘制金额。',
                  'Net profit and operating cash for acquired annual periods; missing amounts are not plotted.'
                )}
              </title>
              {range.ticks.map((tick) => (
                <g key={tick} className="company-report-chart-axis">
                  <line
                    x1={left}
                    x2={width - right}
                    y1={y(tick)}
                    y2={y(tick)}
                    className={tick === 0 ? 'company-report-chart-zero' : ''}
                  />
                  <text x={left - 12} y={y(tick) + 4} textAnchor="end">
                    {(tick / scale.divisor).toLocaleString(locale, {
                      maximumFractionDigits: scale.digits,
                    })}
                  </text>
                </g>
              ))}
              {annuals.map((row, index) => {
                const center = left + step * (index + 0.5);
                return (
                  <g key={row.period} data-period={row.period}>
                    {fields.map((field, seriesIndex) => {
                      const amount = row.amounts[field];
                      const x = center + (seriesIndex ? 4 : -barWidth - 4);
                      if (amount === null)
                        return (
                          <text
                            key={field}
                            className="company-report-chart-missing"
                            x={x + barWidth / 2}
                            y={y(0) - 9}
                            textAnchor="middle"
                            data-missing={field}
                          >
                            <title>
                              {`${row.period.slice(0, 4)} · ${t(...contextFieldLabels[field])} · ${t('未取得或待核对', 'Missing or needs review')}`}
                            </title>
                            —
                          </text>
                        );
                      const value = Number(amount);
                      const exact = `${row.period.slice(0, 4)} · ${t(...contextFieldLabels[field])} · ${money(amount, locale, false)} ${t('元', 'CNY')}`;
                      return value === 0 ? (
                        <line
                          key={field}
                          className="company-report-chart-mark"
                          data-series={seriesIndex ? 'cash' : 'profit'}
                          data-field={field}
                          data-value={amount}
                          x1={x}
                          x2={x + barWidth}
                          y1={y(0)}
                          y2={y(0)}
                        >
                          <title>{exact}</title>
                        </line>
                      ) : (
                        <rect
                          key={field}
                          className="company-report-chart-mark"
                          data-series={seriesIndex ? 'cash' : 'profit'}
                          data-field={field}
                          data-value={amount}
                          x={x}
                          y={y(Math.max(0, value))}
                          width={barWidth}
                          height={Math.max(1, Math.abs(y(value) - y(0)))}
                          rx={3}
                        >
                          <title>{exact}</title>
                        </rect>
                      );
                    })}
                    <text
                      className="company-report-chart-year"
                      x={center}
                      y={height - 10}
                      textAnchor="middle"
                    >
                      {row.period.slice(0, 4)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </>
      ) : (
        <p className="company-report-chart-empty">
          {t(
            '尚未取得可用于这张图的年度利润或经营现金数据。',
            'Annual profit or operating cash data for this chart is unavailable.'
          )}
        </p>
      )}
    </section>
  );
}

/** One saved-data report. Rendering it never starts source or peer acquisition. */
export function CompanyReportLanding({
  run,
  basis,
  readingControls,
  reportHref,
  disabled = false,
  onInspect,
}: {
  run: CompanyResearchRun;
  basis: CompanyReadingBasis;
  readingControls?: ReactNode;
  reportHref: string;
  disabled?: boolean;
  onInspect?: (judgment: AssessmentJudgment) => void;
}) {
  const { t, locale } = useApp();
  const overview = useMemo(() => deriveCompanyFinancialOverview(run, basis), [run, basis]);
  const core = companyReportCore(run, locale);
  const profitField = basis === 'parent' ? 'parentProfit' : 'netProfit';
  const amountFields: ContextAmountField[] = ['revenue', profitField, 'ocf', 'cash'];
  const annual = overview.annual;
  const annuals = overview.analysis?.annuals || [];
  const lead =
    overview.cards.find((card) => card.id === 'cash' && card.status !== 'unknown') ||
    overview.cards.find((card) => card.status === 'risk') ||
    overview.cards.find((card) => card.status === 'watch') ||
    overview.cards.find((card) => card.status !== 'unknown') ||
    overview.cards[0]!;
  return (
    <div className="company-report-landing" data-testid="company-report-landing" data-basis={basis}>
      <section className="company-report-conclusion" id="company-report-conclusion">
        <div className="company-report-conclusion-topline">
          <span>{t('先看结论', 'Start with the judgment')}</span>
          <span>
            {run.input.year} · {t('年度报告', 'Annual report')}
          </span>
        </div>
        {core.summary ? (
          <CompanyAICoreReport run={run} basis={basis} disabled={disabled} onInspect={onInspect} />
        ) : (
          <section
            id="company-ai-core-report"
            className="company-report-rule-core"
            aria-labelledby="company-report-rule-heading"
          >
            <span className="company-report-rule-label">
              {t('已取得数据的财务发现', 'Findings from acquired data')}
            </span>
            <h2 id="company-report-rule-heading">{t(...lead.judgment)}</h2>
            <p>{t(...lead.detail)}</p>
          </section>
        )}
        <div
          className="company-report-signals"
          aria-label={t('三个财务观察', 'Three financial observations')}
        >
          {overview.cards.map((card) => (
            <div key={card.id} data-status={card.status}>
              <span>{t(...card.question)}</span>
              <strong>{t(...card.judgment)}</strong>
            </div>
          ))}
        </div>
        {core.summary && (
          <a className="text-link company-report-full-link" href={reportHref}>
            {t('展开完整研究分析', 'Open the complete research analysis')}
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        )}
      </section>
      <section
        className="company-report-numbers"
        id="company-report-numbers"
        aria-labelledby="company-report-numbers-heading"
      >
        <header className="company-report-section-heading">
          <div>
            <span className="company-report-section-kicker">{t('关键数字', 'Key figures')}</span>
            <h2 id="company-report-numbers-heading">
              {run.input.year} · {t('这一年的经营', 'The selected year')}
            </h2>
          </div>
          {readingControls}
        </header>
        <dl className="company-report-metrics">
          {amountFields.map((field) => {
            const amount = annual?.amounts[field] ?? null;
            return (
              <div key={field} data-field={field} data-available={amount !== null}>
                <dt>{t(...contextFieldLabels[field])}</dt>
                <dd title={amount === null ? undefined : `${money(amount, locale, false)} CNY`}>
                  {amount === null ? (
                    t('未取得', 'Unavailable')
                  ) : (
                    <>
                      {money(amount, locale)}
                      <small>{t('元', ' CNY')}</small>
                    </>
                  )}
                </dd>
                <span>
                  {field === 'cash'
                    ? t('年末余额', 'Year-end balance')
                    : t('全年累计', 'Full year')}
                </span>
              </div>
            );
          })}
        </dl>
        <div className="company-report-data-scope">
          <span>
            {run.context &&
              `${t('数据更新于', 'Data updated at')} ${date(run.context.fetchedAt, locale)}`}
            {run.contextStatus === 'loading' && ` · ${t('更新中', 'Refreshing')}`}
          </span>
          {annual && (
            <CompanyContextEvidence snapshot={run.context} row={annual} fields={amountFields}>
              {t('数字与来源', 'Figures and sources')}
            </CompanyContextEvidence>
          )}
        </div>
        {overview.state === 'mismatch' && (
          <p className="company-report-data-warning" role="status">
            {t(
              '资料主体与本次研究不一致，相关金额和判断暂不展示。',
              'The source issuer does not match this research. Dependent amounts and judgments are withheld.'
            )}
          </p>
        )}
        {overview.state === 'available' && !annual && (
          <p className="company-report-data-warning" role="status">
            {t(
              `尚未取得 ${run.input.year} 年年度数据；图表只展示实际取得的历史年度。`,
              `Annual data for ${run.input.year} is unavailable. The chart shows only acquired historical years.`
            )}
          </p>
        )}
      </section>
      <ReportCashChart run={run} annuals={annuals} profitField={profitField} />
      <section
        className="company-report-details"
        id="company-report-details"
        aria-labelledby="company-report-details-heading"
      >
        <header className="company-report-section-heading">
          <div>
            <span className="company-report-section-kicker">
              {t('继续看依据', 'Explore the evidence')}
            </span>
            <h2 id="company-report-details-heading">
              {t('从报告进入详细数据', 'Detailed data behind this report')}
            </h2>
          </div>
        </header>
        <div className="company-report-detail-grid">
          {detailPages.map(([section, noteZh, noteEn, Icon]) => {
            const [, zh, en] = companySections.find(([key]) => key === section)!;
            return (
              <a
                key={section}
                href={companyPath(run.id, section)}
                className="company-report-detail-link"
              >
                <Icon size={20} aria-hidden="true" />
                <div>
                  <strong>{t(zh, en)}</strong>
                  <span>{t(noteZh, noteEn)}</span>
                </div>
                <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            );
          })}
        </div>
      </section>
    </div>
  );
}
