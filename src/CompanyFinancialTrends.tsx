import { useEffect, useId, useState } from 'react';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import type { CompanyResearchRun } from '../shared/contracts';
import {
  COMPANY_MARKET_WARNINGS,
  FINANCIAL_FIELD_SOURCES,
  type CompanyFinancialContext,
  type CompanyFinancialMetric,
  type CompanyFinancialYear,
} from '../shared/company-market';
import { Tag } from './components';
import { useApp, type Translate } from './context';
import { chartScale, money, type Locale } from './format';
import { amountInFen, compareOriginal } from './company-original-comparison';
import { translateRule } from './ruleTranslations';
import './company-financial-trends.css';

type TrendTab = 'cash' | 'income' | 'debt';
type PlotMetric = CompanyFinancialMetric | 'limitedDebt';
type Selection = { year: number; metric: PlotMetric };

const tabMetrics: Record<TrendTab, PlotMetric[]> = {
  cash: ['netProfit', 'operatingCashFlow'],
  income: ['revenue', 'netProfit'],
  debt: ['monetaryFunds', 'limitedDebt'],
};

function label(metric: PlotMetric, t: Translate): string {
  switch (metric) {
    case 'revenue':
      return t('营业总收入（接口字段）', 'Total operating income (web field)');
    case 'netProfit':
      return t('净利润（接口字段）', 'Net profit (web field)');
    case 'operatingCashFlow':
      return t('经营现金净额（接口字段）', 'Operating cash flow (web field)');
    case 'monetaryFunds':
      return t('货币资金', 'Monetary funds');
    case 'limitedDebt':
      return t('两项负债合计', 'Two-item liability total');
    case 'shortLoans':
      return t('短期借款', 'Short-term loans');
    case 'currentPortionDebt':
      return t('一年内到期的非流动负债', 'Non-current liabilities due within one year');
    default:
      return metric;
  }
}

function amount(row: CompanyFinancialYear, metric: PlotMetric): string | null {
  if (metric !== 'limitedDebt') return row.amounts[metric];
  const shortLoans = amountInFen(row.amounts.shortLoans);
  const currentPortion = amountInFen(row.amounts.currentPortionDebt);
  if (shortLoans === null || currentPortion === null) return null;
  const total = shortLoans + currentPortion;
  const absolute = total < 0n ? -total : total;
  return `${total < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function originalFields(metric: PlotMetric): CompanyFinancialMetric[] {
  return metric === 'limitedDebt' ? ['shortLoans', 'currentPortionDebt'] : [metric];
}

function safeSource(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function timestamp(value: string, locale: Locale): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleString(locale, {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function sourceNotice(warning: string, locale: Locale): string {
  return locale === 'en'
    ? Object.values(COMPANY_MARKET_WARNINGS).find((item) => item.zh === warning)?.en ||
        translateRule(warning)
    : warning;
}

export function CompanyFinancialTrends({
  run,
  onPage,
}: {
  run: CompanyResearchRun;
  onPage: (page: number | null) => void;
}) {
  const { t, locale } = useApp();
  const context = run.agent?.financialContext;
  const [tab, setTab] = useState<TrendTab>('cash');
  const [selection, setSelection] = useState<Selection>({
    year: run.input.year,
    metric: 'netProfit',
  });
  const rows = (context?.years || []).slice().sort((a, b) => a.year - b.year);
  const yearKey = rows.map((row) => row.year).join(',');
  useEffect(() => {
    setSelection((previous) => ({
      year: rows.some((row) => row.year === previous.year)
        ? previous.year
        : (rows.at(-1)?.year ?? run.input.year),
      metric: tabMetrics[tab].includes(previous.metric) ? previous.metric : tabMetrics[tab][0]!,
    }));
  }, [run.id, yearKey, tab]);
  const selectedRow = rows.find((row) => row.year === selection.year) || rows.at(-1);
  const selectTab = (next: TrendTab) => {
    setTab(next);
    setSelection((previous) => ({ ...previous, metric: tabMetrics[next][0]! }));
  };
  if (!context)
    return (
      <details className="company-record-details company-financial-history-old">
        <summary>
          {t('历史财务走势', 'Historical financial trends')} <span>{t('未保存', 'Not saved')}</span>
        </summary>
        <p className="field-note">
          {run.status === 'queued' || run.status === 'running'
            ? t(
                '本次尚未保存历史财务字段；取得后会显示在这里。',
                'Historical financial fields have not been saved in this run yet. They will appear here when retrieved.'
              )
            : t(
                '这次历史查询没有保存第三方财务字段；没有为旧结果补算或补取。',
                'This older lookup has no saved third-party financial fields. No data was reconstructed or retrieved for its historical result.'
              )}
        </p>
      </details>
    );
  const status =
    context.status === 'available'
      ? t('已取得字段', 'Fields retrieved')
      : context.status === 'partial'
        ? t('部分取得', 'Partial fields')
        : context.status === 'unsupported'
          ? t('表型不适用', 'Unsupported statement type')
          : t('本次未取得', 'Not retrieved');
  const notices = context.warnings.map((warning) => sourceNotice(warning, locale));
  return (
    <section className="company-financial-history" aria-labelledby="company-history-heading">
      <div className="company-history-heading">
        <div>
          <h2 id="company-history-heading">{t('历史财务走势', 'Historical financial trends')}</h2>
          <p>
            {t(
              '东方财富公开网页字段 · 与原件分开核对',
              'East Money public web fields · checked separately from source documents'
            )}
          </p>
        </div>
        <div className="company-history-status">
          <Tag>{status}</Tag>
          <span>
            {context.identity.status === 'matched'
              ? t('证券身份已对应', 'Security identity matched')
              : context.identity.status === 'conflict'
                ? t('证券身份不一致', 'Security identity differs')
                : t('证券身份待核', 'Security identity unconfirmed')}
          </span>
        </div>
      </div>
      <p className="company-history-boundary">
        {t(
          '接口字段尚未与原件逐项核对；一致也只表示金额相同，不认证资料、不自动采用。',
          'Web fields have not been checked against documents item by item. A match establishes amount consistency only; it does not authenticate or adopt evidence.'
        )}
      </p>
      {context.status === 'unsupported' ? (
        <p className="company-history-empty">
          {t(
            '本次机构或报表类型不适用，未混用其他行业报表。可继续核对已下载的年报原件。',
            'The institution or statement type is unsupported. Statements from another industry were not substituted. Continue checking the downloaded annual report.'
          )}
        </p>
      ) : !rows.length ? (
        <p className="company-history-empty">
          {t(
            '本次没有取得可绘制的年度记录。空结果不表示公司没有风险，也不会绘成零。',
            'No annual records were retrieved for a plot. An empty result does not establish absence of risk and is not plotted as zero.'
          )}
        </p>
      ) : (
        <>
          <div
            className="company-history-tabs"
            role="tablist"
            aria-label={t('财务图表', 'Financial charts')}
          >
            {(
              [
                ['cash', t('利润与经营现金', 'Profit & operating cash')],
                ['income', t('收入与利润', 'Revenue & profit')],
                ['debt', t('货币资金与负债', 'Funds & liabilities')],
              ] as const
            ).map(([value, title], index, entries) => (
              <button
                key={value}
                type="button"
                id={`company-history-tab-${value}`}
                role="tab"
                aria-selected={tab === value}
                aria-controls="company-history-panel"
                tabIndex={tab === value ? 0 : -1}
                onClick={() => selectTab(value)}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? entries.length - 1
                        : (index + (event.key === 'ArrowRight' ? 1 : -1) + entries.length) %
                          entries.length;
                  selectTab(entries[next]![0]);
                  (
                    event.currentTarget.parentElement?.children[next] as
                      | HTMLButtonElement
                      | undefined
                  )?.focus();
                }}
              >
                {title}
              </button>
            ))}
          </div>
          <div
            id="company-history-panel"
            role="tabpanel"
            aria-labelledby={`company-history-tab-${tab}`}
          >
            {tab === 'income' ? (
              <div
                className="company-history-small-multiples"
                onScrollCapture={(event) => {
                  const source = event.target;
                  if (
                    !(source instanceof HTMLElement) ||
                    !source.classList.contains('company-history-chart-scroll')
                  )
                    return;
                  event.currentTarget
                    .querySelectorAll<HTMLElement>('.company-history-chart-scroll')
                    .forEach((partner) => {
                      if (
                        partner !== source &&
                        Math.abs(partner.scrollLeft - source.scrollLeft) > 1
                      )
                        partner.scrollLeft = source.scrollLeft;
                    });
                }}
              >
                {tabMetrics.income.map((metric) => (
                  <HistoryPlot
                    key={metric}
                    rows={rows}
                    metrics={[metric]}
                    title={label(metric, t)}
                    selection={selection}
                    onSelect={setSelection}
                    locale={locale}
                    t={t}
                  />
                ))}
              </div>
            ) : (
              <HistoryPlot
                rows={rows}
                metrics={tabMetrics[tab]}
                title={
                  tab === 'cash'
                    ? t('各年度利润与经营现金金额', 'Annual profit and operating cash amounts')
                    : t(
                        '各年末货币资金与两项负债金额',
                        'Year-end monetary funds and two liability items'
                      )
                }
                selection={selection}
                onSelect={setSelection}
                locale={locale}
                t={t}
              />
            )}
            <p className="company-history-chart-note">
              {tab === 'debt'
                ? t(
                    '负债合计仅为短期借款＋一年内到期非流动负债；任一项缺失则未知。货币资金不是当前可用余额，不计算偿付覆盖或缺口。',
                    'The liability total combines short-term loans and non-current liabilities due within one year only. A missing component leaves the total unknown. Monetary funds are not today’s available cash; no coverage or funding gap is calculated.'
                  )
                : tab === 'income'
                  ? t(
                      '两图年度对齐，各自使用金额尺度，避免用双轴制造同步变化。空缺年度或字段没有补值。',
                      'Both plots align by year and use their own amount scales, without dual axes. Missing years and fields have not been filled.'
                    )
                  : t(
                      '两项使用同一金额尺度；经营现金净额不是销售回款，也不是年末现金余额。缺项没有补零。',
                      'Both series use one amount scale. Operating cash flow is neither sales collections nor year-end cash. Missing values are not filled with zero.'
                    )}
            </p>
            {selectedRow && (
              <YearDetail
                context={context}
                run={run}
                row={selectedRow}
                tab={tab}
                selection={selection}
                onSelect={setSelection}
                onPage={onPage}
              />
            )}
          </div>
        </>
      )}
      {notices.length > 0 && (
        <details className="company-history-notices">
          <summary>
            {t('本次来源提示', 'Source notices for this run')}
            <ChevronDown size={13} />
          </summary>
          <ul>
            {notices.map((notice, index) => (
              <li key={index}>{notice}</li>
            ))}
          </ul>
        </details>
      )}
      <details className="company-history-sources">
        <summary>
          {t('接口来源与响应记录', 'Web sources and response records')}
          <ChevronDown size={13} />
        </summary>
        <p>
          {t(
            '下方 SHA-256 属于当次接口响应，不是 PDF 原件的认证。',
            'The SHA-256 hashes below identify the retrieved web responses. They do not authenticate a PDF document.'
          )}
        </p>
        {context.sources.map((source) => (
          <div className="company-history-source-record" key={source.id}>
            <strong>
              {source.id === 'income'
                ? t('利润表字段', 'Income-statement fields')
                : source.id === 'cashflow'
                  ? t('现金流量字段', 'Cash-flow fields')
                  : t('资产负债字段', 'Balance-sheet fields')}
            </strong>
            <dl>
              <div>
                <dt>{t('读取状态', 'Retrieval status')}</dt>
                <dd>
                  {source.status === 'available'
                    ? t('取得响应', 'Response retrieved')
                    : source.status === 'empty'
                      ? t('没有返回年度记录', 'No annual records returned')
                      : source.status === 'unsupported'
                        ? t('表型不适用', 'Unsupported statement type')
                        : t('本次未取到', 'Not retrieved')}
                </dd>
              </div>
              <div>
                <dt>{t('抓取时间（UTC+8）', 'Retrieved (UTC+8)')}</dt>
                <dd>{timestamp(source.retrievedAt, locale)}</dd>
              </div>
              <div>
                <dt>{t('响应 SHA-256', 'Response SHA-256')}</dt>
                <dd>
                  <code>{source.sha256 || t('未取得响应哈希', 'No response hash retrieved')}</code>
                </dd>
              </div>
            </dl>
            {safeSource(source.requestUrl) && (
              <a
                className="text-link"
                href={safeSource(source.requestUrl)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('打开接口来源', 'Open web source')}
                <ArrowUpRight size={13} />
              </a>
            )}
          </div>
        ))}
      </details>
    </section>
  );
}

function HistoryPlot({
  rows,
  metrics,
  title,
  selection,
  onSelect,
  locale,
  t,
}: {
  rows: CompanyFinancialYear[];
  metrics: PlotMetric[];
  title: string;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  locale: Locale;
  t: Translate;
}) {
  const id = useId();
  const values = rows
    .flatMap((row) => metrics.map((metric) => amount(row, metric)))
    .map((value) => (value === null ? null : Number(value)))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const span = high - low || 1;
  const allZero = values.length > 0 && values.every((value) => value === 0);
  const firstYear = rows[0]!.year,
    lastYear = rows.at(-1)!.year;
  const slots = lastYear - firstYear + 1;
  const width = Math.max(700, slots * 86 + 100);
  const left = 74,
    right = 24,
    pitch = (width - left - right) / slots;
  const axis = chartScale(Math.max(Math.abs(low), Math.abs(high)), span, locale, 3);
  const y = (value: number) => 204 - ((value - low) / span) * 155;
  const barWidth = Math.min(44, (pitch / (metrics.length + 1)) * 0.75);
  const allCells = rows.flatMap((row) => metrics.map((metric) => ({ row, metric })));
  const selectedCell = allCells.findIndex(
    ({ row, metric }) => row.year === selection.year && metric === selection.metric
  );
  const focusCell = selectedCell < 0 ? 0 : selectedCell;
  return (
    <div className="company-history-plot-block">
      <div className="company-history-plot-title">
        <h3>{title}</h3>
        <span>{axis.label}</span>
      </div>
      {!!values.length && (
        <p className="company-history-mobile-hint">
          {t(
            '左右滑动查看年度；选柱核对精确金额与来源。',
            'Swipe to view years; select a bar for its exact amount and source.'
          )}
        </p>
      )}
      {!values.length ? (
        <p className="company-history-empty">
          {t(
            '所选字段没有可绘制金额；仍可查看下方实际年度与缺项。',
            'The selected fields have no plottable amounts. Inspect the actual years and missing fields below.'
          )}
        </p>
      ) : (
        <div
          className="company-history-chart-scroll"
          tabIndex={0}
          aria-label={t('图表可横向滚动', 'Horizontally scrollable chart')}
        >
          <svg
            className="company-history-plot"
            viewBox={`0 0 ${width} 255`}
            role="group"
            aria-labelledby={`${id}-title ${id}-description`}
            style={{ minWidth: width }}
          >
            <title id={`${id}-title`}>{title}</title>
            <desc id={`${id}-description`}>
              {rows
                .map(
                  (row) =>
                    `${row.year}: ${metrics.map((metric) => `${label(metric, t)} ${amount(row, metric) === null ? t('未取得', 'not retrieved') : `${money(amount(row, metric), locale, false)} CNY`}`).join('; ')}`
                )
                .join('. ')}
            </desc>
            {(allZero ? [0] : [0, 1, 2, 3]).map((tick) => {
              const value = low + (span * tick) / 3;
              return (
                <g key={tick}>
                  <line
                    className="company-history-grid"
                    x1={left}
                    x2={width - right}
                    y1={y(value)}
                    y2={y(value)}
                  />
                  <text
                    className="company-history-axis"
                    x={left - 10}
                    y={y(value) + 4}
                    textAnchor="end"
                  >
                    {(value / axis.divisor).toFixed(axis.digits)}
                  </text>
                </g>
              );
            })}
            <line
              className="company-history-zero"
              x1={left}
              x2={width - right}
              y1={y(0)}
              y2={y(0)}
            />
            {allCells.map(({ row, metric }, index) => {
              const saved = amount(row, metric),
                numeric = saved === null ? null : Number(saved);
              const value = numeric !== null && Number.isFinite(numeric) ? numeric : null;
              const seriesIndex = metrics.indexOf(metric);
              const center = left + pitch * (row.year - firstYear + 0.5);
              const x =
                center + (seriesIndex - (metrics.length - 1) / 2) * (barWidth + 8) - barWidth / 2;
              const selected = selection.year === row.year && selection.metric === metric;
              return (
                <g
                  key={`${row.year}-${metric}`}
                  className={`company-history-bar-group ${selected ? 'selected' : ''}`}
                  role="button"
                  tabIndex={index === focusCell ? 0 : -1}
                  aria-pressed={selected}
                  aria-label={`${row.year} ${label(metric, t)}: ${saved === null ? t('未取得', 'not retrieved') : `${money(saved, locale, false)} CNY`}. ${t('查看精确金额与来源', 'Inspect exact amount and source')}`}
                  onFocus={() => onSelect({ year: row.year, metric })}
                  onClick={() => onSelect({ year: row.year, metric })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect({ year: row.year, metric });
                    } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                      event.preventDefault();
                      const next =
                        event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? allCells.length - 1
                            : Math.max(
                                0,
                                Math.min(
                                  allCells.length - 1,
                                  index + (event.key === 'ArrowRight' ? 1 : -1)
                                )
                              );
                      const cell = allCells[next]!;
                      onSelect({ year: cell.row.year, metric: cell.metric });
                      (
                        event.currentTarget.parentElement?.querySelectorAll('[role="button"]')[
                          next
                        ] as SVGElement | undefined
                      )?.focus();
                    }
                  }}
                >
                  <rect
                    className="company-history-bar-target"
                    x={center - pitch / 2 + (pitch / metrics.length) * seriesIndex}
                    y={30}
                    width={pitch / metrics.length}
                    height={190}
                    fill="transparent"
                  />
                  {value === null ? (
                    <line
                      className="company-history-missing"
                      x1={x}
                      x2={x + barWidth}
                      y1={y(0) - 7}
                      y2={y(0) - 7}
                    />
                  ) : value === 0 ? (
                    <line
                      className={`company-history-value-line series-${seriesIndex}`}
                      x1={x}
                      x2={x + barWidth}
                      y1={y(0)}
                      y2={y(0)}
                    />
                  ) : (
                    <rect
                      className={`company-history-bar series-${seriesIndex}`}
                      x={x}
                      y={Math.min(y(value), y(0))}
                      width={barWidth}
                      height={Math.abs(y(value) - y(0))}
                      rx={2}
                    />
                  )}
                  <text
                    className="company-history-bar-value"
                    x={x + barWidth / 2}
                    y={
                      value !== null && value < 0
                        ? y(value) + 15
                        : (value === null ? y(0) : y(value)) - 10
                    }
                    textAnchor="middle"
                  >
                    {value === null ? '—' : (value / axis.divisor).toFixed(2)}
                  </text>
                  {selected && (
                    <line
                      className="company-history-selection"
                      x1={x - 3}
                      x2={x + barWidth + 3}
                      y1={223}
                      y2={223}
                    />
                  )}
                </g>
              );
            })}
            {rows.map((row) => (
              <text
                className="company-history-axis"
                key={row.year}
                x={left + pitch * (row.year - firstYear + 0.5)}
                y={244}
                textAnchor="middle"
              >
                {row.year}
              </text>
            ))}
          </svg>
        </div>
      )}
      <div className="company-history-legend">
        {metrics.map((metric, index) => (
          <span key={metric}>
            <i className={`series-${index}`} />
            {label(metric, t)}
          </span>
        ))}
      </div>
    </div>
  );
}

function YearDetail({
  context,
  run,
  row,
  tab,
  selection,
  onSelect,
  onPage,
}: {
  context: CompanyFinancialContext;
  run: CompanyResearchRun;
  row: CompanyFinancialYear;
  tab: TrendTab;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onPage: (page: number | null) => void;
}) {
  const { t, locale } = useApp();
  const metrics =
    tab === 'debt'
      ? ([...tabMetrics.debt, 'shortLoans', 'currentPortionDebt'] as PlotMetric[])
      : tabMetrics[tab];
  return (
    <div className="company-history-year-detail">
      <div className="company-history-year-header">
        <h3>
          {row.year} · {t('精确金额与来源', 'Exact amounts and sources')}
        </h3>
        <div
          className="company-history-year-switch"
          aria-label={t('选择实际取得的年度', 'Choose a retrieved year')}
        >
          {context.years
            .slice()
            .sort((a, b) => a.year - b.year)
            .map((year) => (
              <button
                type="button"
                key={year.year}
                aria-pressed={year.year === row.year}
                onClick={() => onSelect({ ...selection, year: year.year })}
              >
                {year.year}
              </button>
            ))}
        </div>
      </div>
      <p className="company-history-year-date">
        {t('报告期', 'Report date')}: {row.reportDate} · {t('人民币元', 'CNY yuan')} ·{' '}
        {t('抓取于（UTC+8）', 'Retrieved (UTC+8)')} {timestamp(context.retrievedAt, locale)}
      </p>
      {!!row.warnings?.length && (
        <div className="company-history-year-notices" role="note">
          {row.warnings.map((warning, index) => (
            <p key={index}>{sourceNotice(warning, locale)}</p>
          ))}
        </div>
      )}
      <div className="company-history-exact-values">
        {metrics.map((metric) => {
          const value = amount(row, metric);
          const fields = originalFields(metric);
          const sourceIds = [
            ...new Set(
              fields
                .map((field) => row.sourceIds[FINANCIAL_FIELD_SOURCES[field].sourceId])
                .filter(Boolean)
            ),
          ];
          const comparison =
            metric === 'netProfit' || metric === 'operatingCashFlow'
              ? compareOriginal(context, run, row, metric)
              : null;
          return (
            <article key={metric} className={selection.metric === metric ? 'selected' : ''}>
              <div className="company-history-exact-heading">
                <span>{label(metric, t)}</span>
                <strong className="mono">
                  {value === null ? (
                    t('未取得', 'Not retrieved')
                  ) : (
                    <>
                      {money(value, locale, false)} <small>CNY</small>
                    </>
                  )}
                </strong>
              </div>
              <p className="company-history-field-name">
                <code>
                  {fields.map((field) => FINANCIAL_FIELD_SOURCES[field].field).join(' + ')}
                </code>
              </p>
              {metric === 'limitedDebt' && (
                <p className="company-history-item-note">
                  {value === null
                    ? t(
                        '至少一项缺失，合计未计算。',
                        'At least one component is missing; the total was not calculated.'
                      )
                    : t(
                        '两项均已取得，按人民币分相加；不是全部到期付款。',
                        'Both components were retrieved and summed in exact CNY cents. This is not all payments due.'
                      )}
                </p>
              )}
              {comparison && (
                <div className="company-history-pdf-comparison">
                  <span>
                    {comparison.status === 'same'
                      ? t('与原件候选金额相同', 'Matches the document candidate amount')
                      : comparison.status === 'different'
                        ? t('与原件候选金额不同', 'Differs from the document candidate amount')
                        : run.preview
                          ? t('尚未完成同年原件金额核对', 'Same-year document amount not compared')
                          : t('原件待核', 'Document verification pending')}
                  </span>
                  {comparison.value != null && (
                    <p>
                      {t('原件候选', 'Document candidate')}:{' '}
                      <span className="mono">{money(comparison.value, locale, false)} CNY</span>
                    </p>
                  )}
                  {comparison.observation?.page != null && (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => onPage(comparison.observation!.page)}
                    >
                      PDF {comparison.observation.page}
                      <ArrowUpRight size={12} />
                    </button>
                  )}
                </div>
              )}
              <details className="company-history-field-provenance">
                <summary>
                  {t('字段来源记录', 'Field source record')}
                  <ChevronDown size={12} />
                </summary>
                {sourceIds.length ? (
                  sourceIds.map((sourceId) => {
                    const source = context.sources.find((item) => item.id === sourceId);
                    return source ? (
                      <div key={sourceId}>
                        <p>
                          {t('抓取于（UTC+8）', 'Retrieved (UTC+8)')}:{' '}
                          {timestamp(source.retrievedAt, locale)}
                        </p>
                        <p>
                          {t('网页披露日期', 'Web disclosure date')}:{' '}
                          {row.sourceDates?.[source.id]?.noticeDate || t('未提供', 'Not supplied')}
                        </p>
                        <p>
                          {t('网页字段更新日期', 'Web field update date')}:{' '}
                          {row.sourceDates?.[source.id]?.updatedAt || t('未提供', 'Not supplied')}
                        </p>
                        <p className="company-history-source-hash">
                          SHA-256:{' '}
                          <code>
                            {source.sha256 || t('未保存响应哈希', 'No response hash saved')}
                          </code>
                        </p>
                        {safeSource(source.requestUrl) && (
                          <a
                            className="text-link"
                            href={safeSource(source.requestUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t('打开该字段接口来源', 'Open this field’s web source')}
                            <ArrowUpRight size={12} />
                          </a>
                        )}
                      </div>
                    ) : (
                      <p key={sourceId}>
                        {t('没有保存对应响应记录。', 'No matching response record was saved.')}
                      </p>
                    );
                  })
                ) : (
                  <p>
                    {t(
                      '该年度没有取得对应表字段；没有补造来源。',
                      'The relevant statement fields were not retrieved for this year; no source was invented.'
                    )}
                  </p>
                )}
              </details>
            </article>
          );
        })}
      </div>
    </div>
  );
}
