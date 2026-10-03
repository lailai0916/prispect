import { useId, useState } from 'react';
import type { CompanyContextSnapshot, ContextAmountField } from '../shared/company-workspace';
import {
  analyzeCompanyContext,
  contextFieldLabels,
  contextRatio,
  type CompanyReadingBasis,
} from '../shared/company-analysis';
import { CompanyContextEvidence } from './CompanyContextViews';
import { useApp } from './context';
import { chartScale, money } from './format';

export function CompanyContextHistory({
  snapshot,
  basis,
}: {
  snapshot: CompanyContextSnapshot;
  basis: CompanyReadingBasis;
}) {
  const { t, locale } = useApp(),
    analysis = analyzeCompanyContext(snapshot, basis),
    rows = analysis.annuals;
  const tabId = useId();
  const [tab, setTab] = useState('cash'),
    [selected, setSelected] = useState(rows.at(-1)?.period || '');
  const tabs = [
    ['cash', '利润与经营现金', 'Profit and operating cash'],
    ['income', '收入与利润', 'Income and profit'],
    ['debt', '货币资金与负债', 'Funds and liabilities'],
    ['ratios', '关键比率', 'Key ratios'],
  ] as const;
  const keys: ContextAmountField[] =
    tab === 'cash'
      ? [analysis.profitField, 'ocf']
      : tab === 'income'
        ? ['revenue', analysis.profitField]
        : tab === 'debt'
          ? ['cash', 'shortLoan', 'currentPortionDebt']
          : ['revenue', 'totalAssets', 'totalLiabilities', 'receivables'];
  const ratioFields = [
    ['grossMargin', '毛利率', 'Gross margin'],
    ['roe', '加权 ROE', 'Weighted ROE'],
    ['ocfToRevenue', '经营现金 / 营收', 'Operating cash / revenue'],
    ['receivableToRevenue', '应收账款 / 营收', 'Receivables / revenue'],
  ] as const;
  const ratioValue = (index: number, field: string) => {
    const row = rows[index]!;
    return field === 'grossMargin'
      ? row.ratios.grossMargin
      : field === 'roe'
        ? row.ratios.roe
        : field === 'ocfToRevenue'
          ? contextRatio(row.amounts.ocf, row.amounts.revenue) === null
            ? null
            : contextRatio(row.amounts.ocf, row.amounts.revenue)! * 100
          : contextRatio(row.amounts.receivables, row.amounts.revenue) === null
            ? null
            : contextRatio(row.amounts.receivables, row.amounts.revenue)! * 100;
  };
  const detail = rows.find((row) => row.period === selected) || rows.at(-1);
  const colors = ['var(--ink)', 'var(--accent)', 'var(--subtle)', 'var(--muted)'];
  const plot = (fields: string[], ratio: boolean) => {
    const values = rows.flatMap((row, index) =>
      fields.map((field) =>
        ratio
          ? ratioValue(index, field)
          : row.amounts[field as ContextAmountField] === null
            ? null
            : Number(row.amounts[field as ContextAmountField])
      )
    );
    const maximum = Math.max(0, ...values.filter((value): value is number => value !== null)),
      minimum = Math.min(0, ...values.filter((value): value is number => value !== null));
    const high = maximum === minimum ? 1 : maximum * 1.1,
      low = minimum * 1.1,
      range = high - low,
      width = Math.max(640, rows.length * 115),
      height = 270,
      pad = { left: 54, right: 16, top: 26, bottom: 36 };
    const axis = ratio
      ? { ...chartScale(0, range, locale, 4), label: '%' }
      : chartScale(Math.max(Math.abs(high), Math.abs(low)), range, locale, 4);
    const y = (value: number) =>
        pad.top + ((high - value) / range) * (height - pad.top - pad.bottom),
      step = (width - pad.left - pad.right) / Math.max(rows.length, 1),
      bar = Math.min(24, (step - 30) / fields.length);
    return (
      <div className="context-chart-plot">
        <span className="muted">{ratio ? '%' : t(`人民币 · ${axis.label}`, axis.label)}</span>
        <div
          className="context-chart-scroll"
          tabIndex={0}
          aria-label={t('年度图表，可横向滚动', 'Annual chart; scroll horizontally')}
        >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="group"
            aria-label={
              ratio
                ? t('年度比率', 'Annual ratios')
                : t(`年度金额，${axis.label}`, `Annual amounts, ${axis.label}`)
            }
          >
            {[0, 1, 2, 3, 4].map((index) => {
              const value = low + (range * index) / 4;
              return (
                <g key={index}>
                  <line
                    x1={pad.left}
                    x2={width - pad.right}
                    y1={y(value)}
                    y2={y(value)}
                    className="context-chart-grid"
                  />
                  <text x={pad.left - 8} y={y(value) + 4} textAnchor="end">
                    {(value / axis.divisor).toLocaleString(locale, {
                      maximumFractionDigits: axis.digits,
                    })}
                  </text>
                </g>
              );
            })}
            {rows.map((row, index) => {
              const center = pad.left + step * (index + 0.5);
              return (
                <g
                  key={row.period}
                  role="button"
                  tabIndex={0}
                  aria-label={t(
                    `查看 ${row.period.slice(0, 4)} 年明细`,
                    `View ${row.period.slice(0, 4)} details`
                  )}
                  aria-pressed={detail?.period === row.period}
                  onClick={() => setSelected(row.period)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelected(row.period);
                    }
                  }}
                >
                  <rect
                    x={center - step / 2 + 3}
                    y={12}
                    width={step - 6}
                    height={height - 18}
                    rx={3}
                    className={`context-chart-selection ${detail?.period === row.period ? 'selected' : ''}`}
                  />
                  {fields.map((field, series) => {
                    const raw = ratio
                        ? ratioValue(index, field)
                        : row.amounts[field as ContextAmountField] === null
                          ? null
                          : Number(row.amounts[field as ContextAmountField]),
                      x = center + (series - fields.length / 2) * (bar + 3);
                    return raw === null ? (
                      <text key={field} x={x} y={y(0) - 6}>
                        ?
                      </text>
                    ) : (
                      <rect
                        key={field}
                        x={x}
                        y={y(Math.max(0, raw))}
                        width={bar}
                        height={Math.max(1, Math.abs(y(raw) - y(0)))}
                        fill={colors[series]}
                        rx={1}
                      >
                        <title>
                          {`${row.period.slice(0, 4)} · ${field}: ${ratio ? `${raw}%` : money(row.amounts[field as ContextAmountField], locale, false)}`}
                        </title>
                      </rect>
                    );
                  })}
                  <text x={center} y={height - 12} textAnchor="middle">
                    {row.period.slice(0, 4)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    );
  };
  if (!rows.length)
    return (
      <p className="context-empty">
        {t('本次没有取得年度网页字段。', 'No annual web fields retrieved.')}
      </p>
    );
  return (
    <section className="context-history">
      <p className="context-data-note">
        {t(
          '年度网页快照 · 缺失值为未知；原件字段另在“原件核查”中核对。',
          'Annual web snapshots · missing values remain unknown; check original fields under Original-report review.'
        )}
      </p>
      <div className="context-tabs" role="tablist" aria-label={t('财务图表', 'Financial charts')}>
        {tabs.map(([id, zh, en], index) => (
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
                  ? (index + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                setTab(tabs[next]![0]);
                document.getElementById(`${tabId}-${tabs[next]![0]}`)?.focus();
              }
            }}
            onClick={() => setTab(id)}
          >
            {t(zh, en)}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${tabId}-panel`}
        aria-labelledby={`${tabId}-${tab}`}
        className="context-chart-panel"
      >
        {tab === 'income' ? (
          <div className="context-chart-multiples">
            {keys.map((field) => (
              <section key={field}>
                <h3>{t(...contextFieldLabels[field])}</h3>
                {plot([field], false)}
              </section>
            ))}
          </div>
        ) : (
          plot(tab === 'ratios' ? ratioFields.map((field) => field[0]) : keys, tab === 'ratios')
        )}
        <div className="context-chart-legend">
          {(tab === 'ratios'
            ? ratioFields.map((field) => t(field[1], field[2]))
            : keys.map((field) => t(...contextFieldLabels[field]))
          ).map((label, index) => (
            <span key={label}>
              <i style={{ background: colors[index] }} />
              {label}
            </span>
          ))}
        </div>
      </div>
      {detail && (
        <section className="context-year-detail">
          <div className="context-section-title">
            <h2>
              {detail.period.slice(0, 4)} {t('年明细', 'details')}
            </h2>
            <div>
              {rows.map((row) => (
                <button
                  key={row.period}
                  type="button"
                  className="context-year-button"
                  aria-pressed={detail.period === row.period}
                  onClick={() => setSelected(row.period)}
                >
                  {row.period.slice(0, 4)}
                </button>
              ))}
            </div>
          </div>
          <p className="muted">
            {t('报告期', 'Report period')} {detail.period} ·{' '}
            {detail.noticeDate
              ? t(`披露于 ${detail.noticeDate}`, `Disclosed ${detail.noticeDate}`)
              : t('披露日期未知', 'Disclosure date unknown')}
          </p>
          <div className="context-exact-fields">
            {keys.map((field) => (
              <article key={field}>
                <span>{t(...contextFieldLabels[field])}</span>
                <strong>{money(detail.amounts[field], locale)}</strong>
                <CompanyContextEvidence row={detail} fields={[field]} />
              </article>
            ))}
          </div>
          {tab === 'ratios' && (
            <div className="context-exact-fields">
              {ratioFields.map(([field, zh, en]) => {
                const value = ratioValue(rows.indexOf(detail), field);
                return (
                  <article key={field}>
                    <span>{t(zh, en)}</span>
                    <strong>{value === null ? '—' : `${value.toFixed(2)}%`}</strong>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
