import {
  useCallback,
  useId,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { AssessmentMetric } from '../shared/company-assessment';
import type { CompanyReportDocumentDimension } from '../shared/company-report-document';
import { chartRange } from '../shared/company-chart-geometry';
import {
  deriveReportProfitCashPeriods,
  deriveReportRadarPoints,
  reportChartExactAmount,
  reportChartScaledAmount,
  type ReportChartAvailability,
} from '../shared/company-report-charts';
import { useApp, type Translate } from './context';
import { chartScale, money } from './format';
import './company-report-charts.css';

function availabilityText(state: ReportChartAvailability, t: Translate) {
  switch (state) {
    case 'conflict':
      return t('来源冲突', 'Source conflict');
    case 'invalid-scope':
      return t('口径不符', 'Scope mismatch');
    case 'invalid-value':
      return t('金额无效', 'Invalid amount');
    case 'not-applicable':
      return t('不适用', 'Not applicable');
    default:
      return t('未取得', 'Unavailable');
  }
}

/** Measure the plot instead of shrinking its labels below the shared 12px floor. */
function useReportPlotWidth() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => setElement(node), []);
  const [width, setWidth] = useState(480);
  useLayoutEffect(() => {
    if (!element) return;
    const print = window.matchMedia('print');
    const measure = () => {
      // Print uses the narrower paper column; the screen retains readable scrollable labels.
      if (element.clientWidth > 0)
        setWidth(Math.max(print.matches ? 400 : 480, Math.floor(element.clientWidth)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    print.addEventListener('change', measure);
    window.addEventListener('beforeprint', measure);
    return () => {
      observer.disconnect();
      print.removeEventListener('change', measure);
      window.removeEventListener('beforeprint', measure);
    };
  }, [element]);
  return { ref, width };
}

export function CompanyReportProfitCashChart({
  facts,
  year,
  children,
}: {
  facts: readonly AssessmentMetric[];
  year: number;
  children?: ReactNode;
}) {
  const { t, locale } = useApp();
  const id = `report-profit-cash-${useId().replace(/:/g, '')}`;
  const periods = deriveReportProfitCashPeriods(facts, year);
  const values = periods.flatMap((period) => [period.profit.fen, period.cash.fen]);
  const available = values.filter((value): value is bigint => value !== null);
  const range = chartRange(values.map((value) => (value === null ? null : Number(value) / 100)));
  const scale = chartScale(
    Math.max(Math.abs(range.minimum), Math.abs(range.maximum)),
    range.maximum - range.minimum,
    locale,
    Math.max(1, range.ticks.length - 1)
  );
  const exact = (value: bigint) => `${money(reportChartExactAmount(value), locale, false)} CNY`;
  const amount = (value: bigint) => reportChartScaledAmount(value, scale.divisor);
  const { ref, width } = useReportPlotWidth();
  const height = 240;
  const left = 56;
  const right = 100;
  const top = 32;
  const bottom = 50;
  const plotWidth = width - left - right;
  const groupWidth = plotWidth / 3;
  const barWidth = Math.min(52, Math.max(22, groupWidth * 0.24));
  const barGap = Math.max(9, Math.min(16, groupWidth * 0.08));
  const y = (value: number) =>
    top + ((range.maximum - value) / (range.maximum - range.minimum)) * (height - top - bottom);
  const zeroY = y(0);
  const current = periods.at(-1);
  const comparisonDescription = periods
    .map(
      (period) =>
        `${period.year}: ${t('合并净利润', 'Consolidated profit')} ${period.profit.fen === null ? availabilityText(period.profit.state, t) : exact(period.profit.fen)}; ${t('经营现金净额', 'Operating cash flow')} ${period.cash.fen === null ? availabilityText(period.cash.state, t) : exact(period.cash.fen)}`
    )
    .join('. ');
  return (
    <figure
      id="company-report-profit-cash"
      className="report-profit-cash-chart"
      aria-labelledby={`${id}-heading`}
    >
      <div className="report-chart-heading">
        <div>
          <h3 id={`${id}-heading`}>{t('利润与经营现金', 'Profit and operating cash')}</h3>
          <p>
            {year - 2}–{year} · {t('合并口径', 'Consolidated')} · {t('单位：', 'Unit: ')}
            {scale.label}
          </p>
        </div>
        <div className="report-chart-legend" aria-label={t('图例', 'Legend')}>
          <span>
            <i className="report-chart-profit-key" aria-hidden="true" />
            {t('合并净利润', 'Consolidated profit')}
          </span>
          <span>
            <i className="report-chart-cash-key" aria-hidden="true" />
            {t('经营现金净额', 'Operating cash flow')}
          </span>
        </div>
      </div>
      {available.length ? (
        <div
          className="report-chart-scroll"
          ref={ref}
          tabIndex={0}
          aria-label={t('利润与现金图，可横向滚动', 'Profit and cash chart; scroll horizontally')}
        >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            role="img"
            aria-labelledby={`${id}-title ${id}-description`}
            data-chart-type="report-profit-cash"
          >
            <title id={`${id}-title`}>
              {t(
                '三年合并净利润与经营现金净额',
                'Three annual consolidated profit and operating cash amounts'
              )}
            </title>
            <desc id={`${id}-description`}>
              {comparisonDescription}.{' '}
              {t(
                '两组柱使用同一金额轴，缺失数据不补零。',
                'Both series share an amount axis. Missing amounts are not zero-filled.'
              )}
            </desc>
            <defs>
              <pattern
                id={`${id}-hatch`}
                width="5"
                height="5"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="5" height="5" className="report-chart-cash-soft" />
                <line x1="0" x2="0" y1="0" y2="5" className="report-chart-cash-hatch" />
              </pattern>
            </defs>
            {range.ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={left}
                  x2={width - right + 4}
                  y1={y(tick)}
                  y2={y(tick)}
                  className={tick === 0 ? 'report-chart-zero' : 'report-chart-grid'}
                />
                <text
                  x={left - 10}
                  y={y(tick) + 4}
                  textAnchor="end"
                  className="report-chart-axis-label"
                >
                  {(tick / scale.divisor).toLocaleString(locale, {
                    maximumFractionDigits: Math.max(2, scale.digits),
                  })}
                </text>
              </g>
            ))}
            {periods.map((period, index) => {
              const center = left + groupWidth * (index + 0.5);
              return (
                <g key={period.year} data-period={period.year}>
                  {[period.profit, period.cash].map((value, series) => {
                    const x = center + (series === 0 ? -barGap / 2 - barWidth : barGap / 2);
                    if (value.fen === null)
                      return (
                        <g key={series} data-missing-metric={value.metricId}>
                          <line
                            x1={x}
                            x2={x + barWidth}
                            y1={zeroY}
                            y2={zeroY}
                            className="report-chart-missing"
                          />
                          <text
                            x={x + barWidth / 2}
                            y={Math.max(top + 14, zeroY - 12)}
                            textAnchor="middle"
                            className="report-chart-missing-label"
                          >
                            {t(
                              value.state === 'conflict' ? '冲突' : '缺失',
                              value.state === 'conflict' ? 'Conflict' : 'Missing'
                            )}
                          </text>
                          <title>{`${period.year} ${series === 0 ? t('合并净利润', 'Consolidated profit') : t('经营现金净额', 'Operating cash flow')}: ${availabilityText(value.state, t)}`}</title>
                        </g>
                      );
                    const valueY = y(Number(value.fen) / 100);
                    return (
                      <g key={series} data-metric-id={value.metricId}>
                        {value.fen === 0n ? (
                          <line
                            x1={x}
                            x2={x + barWidth}
                            y1={zeroY}
                            y2={zeroY}
                            className={
                              series ? 'report-chart-cash-zero' : 'report-chart-profit-zero'
                            }
                          />
                        ) : (
                          <rect
                            x={x}
                            y={Math.min(valueY, zeroY)}
                            width={barWidth}
                            height={Math.abs(valueY - zeroY)}
                            className={series ? 'report-chart-cash-bar' : 'report-chart-profit-bar'}
                            fill={series ? `url(#${id}-hatch)` : undefined}
                          />
                        )}
                        <text
                          x={x + barWidth / 2}
                          y={value.fen < 0n ? valueY + 17 : valueY - 10}
                          textAnchor="middle"
                          className="report-chart-value"
                        >
                          {amount(value.fen)}
                        </text>
                        <title>{`${period.year} ${series === 0 ? t('合并净利润', 'Consolidated profit') : t('经营现金净额', 'Operating cash flow')}: ${exact(value.fen)}`}</title>
                      </g>
                    );
                  })}
                  <text
                    x={center}
                    y={height - 13}
                    textAnchor="middle"
                    className="report-chart-axis-label"
                  >
                    {period.year}
                  </text>
                </g>
              );
            })}
            {current?.differenceFen !== null &&
              current?.profit.fen !== null &&
              current?.cash.fen !== null &&
              current &&
              (() => {
                const profitY = y(Number(current.profit.fen) / 100);
                const cashY = y(Number(current.cash.fen) / 100);
                const x = width - right + 12;
                const middle = (profitY + cashY) / 2;
                return (
                  <g
                    className="report-chart-difference"
                    aria-label={`${t('当年差额：合并净利润减经营现金净额', 'Selected-year difference: consolidated profit minus operating cash flow')} ${exact(current.differenceFen!)}`}
                  >
                    <path
                      d={`M${x - 4},${profitY}H${x + 4}M${x},${profitY}V${cashY}M${x - 4},${cashY}H${x + 4}`}
                    />
                    <text x={x + 12} y={middle - 3}>
                      {t('差额', 'Gap')}
                    </text>
                    <text x={x + 12} y={middle + 15}>
                      {amount(current.differenceFen!)}
                    </text>
                  </g>
                );
              })()}
          </svg>
          <div
            className="report-chart-ratio-row"
            style={
              {
                width,
                paddingInlineStart: left,
                paddingInlineEnd: right,
                '--report-chart-print-left': `${(left / width) * 100}%`,
                '--report-chart-print-right': `${(right / width) * 100}%`,
              } as CSSProperties
            }
          >
            <span className="report-chart-ratio-label">{t('现金 / 利润', 'Cash / profit')}</span>
            {periods.map((period) => (
              <span
                key={period.year}
                title={`${period.year} · ${t('经营现金净额 ÷ 正合并净利润', 'Operating cash / positive consolidated profit')}`}
              >
                {period.ratio.value === null
                  ? availabilityText(period.ratio.state, t)
                  : `${period.ratio.value}%`}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="report-chart-empty">
          {t(
            '这三年的合并净利润与经营现金净额尚无可绘制数据。',
            'No usable consolidated profit or operating cash amounts for these three years.'
          )}
        </p>
      )}
      <figcaption className="report-chart-caption">
        {current?.differenceFen !== null && current && (
          <span>
            {year} {t('差额（利润 − 现金）：', 'difference (profit − cash): ')}
            <strong>
              {amount(current.differenceFen!)} {scale.label}
            </strong>
          </span>
        )}
        {children}
      </figcaption>
      <details className="report-chart-data">
        <summary>{t('查看图表精确数据', 'View exact chart data')}</summary>
        <div className="report-chart-table-scroll">
          <table>
            <caption className="sr-only">
              {t(
                '同一报告的年度合并口径数据，金额为人民币元。',
                'Annual consolidated data from the same report, in CNY.'
              )}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t('年度', 'Year')}</th>
                <th scope="col">{t('合并净利润（元）', 'Consolidated profit (CNY)')}</th>
                <th scope="col">{t('经营现金净额（元）', 'Operating cash (CNY)')}</th>
                <th scope="col">{t('现金 / 利润', 'Cash / profit')}</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period.year}>
                  <th scope="row">{period.year}</th>
                  <td>
                    {period.profit.fen === null
                      ? availabilityText(period.profit.state, t)
                      : money(reportChartExactAmount(period.profit.fen), locale, false)}
                  </td>
                  <td>
                    {period.cash.fen === null
                      ? availabilityText(period.cash.state, t)
                      : money(reportChartExactAmount(period.cash.fen), locale, false)}
                  </td>
                  <td>
                    {period.ratio.value === null
                      ? availabilityText(period.ratio.state, t)
                      : `${period.ratio.value}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

const radarLabels = {
  profitability: ['盈利', 'Profit'],
  cash: ['现金', 'Cash'],
  solvency: ['偿付', 'Debt'],
  workingCapital: ['营运', 'Working'],
} as const;

export function CompanyReportRadar({
  dimensions,
}: {
  dimensions: readonly CompanyReportDocumentDimension[];
}) {
  const { t, locale } = useApp();
  const id = `report-radar-${useId().replace(/:/g, '')}`;
  const points = deriveReportRadarPoints(dimensions);
  const complete = points.every((point) => point.score !== null);
  const center = 150;
  const radius = 88;
  const pointAt = (index: number, score: number) => {
    const angle = (index * Math.PI) / 2 - Math.PI / 2;
    return {
      x: center + (Math.cos(angle) * radius * score) / 100,
      y: center + (Math.sin(angle) * radius * score) / 100,
    };
  };
  const labelAt = [
    { x: 150, y: 27 },
    { x: 269, y: 145 },
    { x: 150, y: 271 },
    { x: 31, y: 145 },
  ];
  const label = (point: (typeof points)[number]) =>
    t(radarLabels[point.id][0], radarLabels[point.id][1]);
  const scoreLabel = (point: (typeof points)[number]) =>
    point.score === null
      ? t(
          point.state === 'conflict' ? '冲突' : '未知',
          point.state === 'conflict' ? 'Conflict' : 'Unknown'
        )
      : String(point.score);
  return (
    <figure className="report-radar" aria-labelledby={`${id}-title`}>
      <svg
        viewBox="0 0 300 302"
        width="300"
        height="302"
        role="img"
        aria-labelledby={`${id}-title ${id}-description`}
        data-chart-type="report-radar"
        data-complete={complete}
      >
        <title id={`${id}-title`}>
          {t('四维财务筛查规则分', 'Four financial-screening rule scores')}
        </title>
        <desc id={`${id}-description`}>
          {points.map((point) => `${label(point)}: ${scoreLabel(point)}`).join('; ')}.{' '}
          {t(
            '范围 0–100，越外表示规则分越高。未知维度不按零分绘制。',
            'Range 0–100; higher rule scores are farther out. Unknown dimensions are not drawn as zero.'
          )}
        </desc>
        {[20, 40, 60, 80, 100].map((level) => (
          <circle
            key={level}
            cx={center}
            cy={center}
            r={(radius * level) / 100}
            className="report-radar-grid"
          />
        ))}
        {points.map((point, index) => {
          const outer = pointAt(index, 100);
          return (
            <line
              key={point.id}
              x1={center}
              y1={center}
              x2={outer.x}
              y2={outer.y}
              className="report-radar-axis"
            />
          );
        })}
        {complete && (
          <polygon
            points={points
              .map((point, index) => {
                const p = pointAt(index, point.score!);
                return `${p.x},${p.y}`;
              })
              .join(' ')}
            className="report-radar-area"
          />
        )}
        {!complete &&
          points.map((point, index) => {
            const nextIndex = (index + 1) % points.length;
            const next = points[nextIndex]!;
            if (point.score === null || next.score === null) return null;
            const a = pointAt(index, point.score);
            const b = pointAt(nextIndex, next.score);
            return (
              <line
                key={point.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className="report-radar-line"
              />
            );
          })}
        {points.map((point, index) => {
          const position = labelAt[index]!;
          const p = point.score === null ? null : pointAt(index, point.score);
          return (
            <g key={point.id} data-dimension={point.id} data-score={point.score ?? 'unknown'}>
              {p && (
                <circle cx={p.x} cy={p.y} r="4" className="report-radar-dot">
                  <title>{`${label(point)}: ${scoreLabel(point)}`}</title>
                </circle>
              )}
              <text
                x={position.x}
                y={position.y}
                textAnchor="middle"
                className="report-radar-label"
              >
                {label(point)}
              </text>
              <text
                x={position.x}
                y={position.y + 17}
                textAnchor="middle"
                className={point.score === null ? 'report-radar-unknown' : 'report-radar-score'}
              >
                {scoreLabel(point)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>
        {t(
          '规则筛查分 · 越外表示该维度表现越强',
          'Rule scores · farther out means a stronger dimension'
        )}
        {!complete && (
          <span>
            {t('数据不足的维度保持未知。', 'Dimensions without sufficient data remain unknown.')}
          </span>
        )}
      </figcaption>
      <dl className="sr-only">
        {points.map((point) => (
          <div key={point.id}>
            <dt>
              {dimensions.find((dimension) => dimension.id === point.id)?.label[
                locale === 'en' ? 1 : 0
              ] || label(point)}
            </dt>
            <dd>{scoreLabel(point)}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
