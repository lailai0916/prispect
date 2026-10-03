import { useEffect, useId, useRef, useState } from 'react';
import type { CompanyIndustrySnapshot, IndustryMetricKey } from '../shared/company-workspace';
import type { FinancialChartPoint } from '../shared/company-financial-charts';
import { chartRange, consecutivePeriods, distributionBins } from '../shared/company-chart-geometry';
import { useApp } from './context';
import { chartScale, money, type Locale } from './format';

type Unit = 'amount' | 'percent';
const present = (value: number | null): value is number => value !== null && Number.isFinite(value);
function formatted(value: number | null, unit: Unit, locale: Locale) {
  return !present(value)
    ? '—'
    : unit === 'percent'
      ? `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
      : money(value.toFixed(2), locale);
}
function usePlotWidth(minimum: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(minimum);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const resize = () => setWidth(Math.max(minimum, Math.floor(element.clientWidth)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [minimum]);
  return { ref, width };
}
function PeerPattern({ id }: { id: string }) {
  return (
    <defs>
      <pattern
        id={id}
        width="5"
        height="5"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="5" height="5" className="financial-chart-peer-soft" />
        <line x1="0" x2="0" y1="0" y2="5" className="financial-chart-peer-stroke" />
      </pattern>
    </defs>
  );
}
function ChartLegend({ companyLabel, peerLabel }: { companyLabel: string; peerLabel: string }) {
  return (
    <div className="financial-chart-legend">
      <span>
        <i className="financial-chart-company-key" />
        {companyLabel}
      </span>
      <span>
        <i className="financial-chart-peer-key" />
        {peerLabel}
      </span>
    </div>
  );
}

export function ChartMetricSummary({
  company,
  peer,
  unit,
  count,
  period,
  peerLabel,
}: {
  company: number | null;
  peer: number | null;
  unit: Unit;
  count?: number | null;
  period?: string;
  peerLabel?: string;
}) {
  const { t, locale } = useApp();
  const difference = present(company) && present(peer) ? company - peer : null;
  const hasPeer = count !== undefined && count !== null;
  return (
    <div className="financial-chart-summary">
      <dl className={`financial-chart-values ${hasPeer ? '' : 'company-only'}`}>
        <div>
          <dt>{t('企业值', 'Company')}</dt>
          <dd>{formatted(company, unit, locale)}</dd>
        </div>
        {hasPeer && (
          <>
            <div>
              <dt>{peerLabel || t('同行均值', 'Peer mean')}</dt>
              <dd>{formatted(peer, unit, locale)}</dd>
            </div>
            <div>
              <dt>{t('与均值差异', 'Difference')}</dt>
              <dd className="financial-chart-difference">
                {difference === null
                  ? '—'
                  : unit === 'percent'
                    ? `${difference > 0 ? '+' : ''}${difference.toFixed(2)} ${t('个百分点', 'pp')}`
                    : `${difference > 0 ? '+' : ''}${formatted(difference, unit, locale)}`}
              </dd>
            </div>
          </>
        )}
      </dl>
      {(period || hasPeer) && (
        <p className="financial-chart-meta">
          {period?.slice(0, 4)}
          {period && hasPeer ? ' · ' : ''}
          {hasPeer ? t(`${count} 家有效同行`, `${count} valid peers`) : ''}
        </p>
      )}
    </div>
  );
}

export function HistoryMetricChart({
  points,
  style,
  unit,
  label,
  selectedPeriod,
  onPeriodChange,
  companyLabel,
  peerLabel,
  sharedRange,
}: {
  points: FinancialChartPoint[];
  style: 'bars' | 'lines' | 'dumbbell';
  unit: Unit;
  label: string;
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
  companyLabel?: string;
  peerLabel?: string;
  sharedRange?: { minimum: number; maximum: number };
}) {
  const { t, locale } = useApp();
  const pattern = `peer-${useId().replace(/:/g, '')}`;
  const { ref, width } = usePlotWidth(Math.max(400, points.length * 62 + 68));
  const groupRefs = useRef<(SVGGElement | null)[]>([]);
  const companyName = companyLabel || t('企业', 'Company');
  const peerName = peerLabel || t('同行均值', 'Peer mean');
  const values = points.flatMap((point) => [point.company, point.peer]);
  const range = chartRange(sharedRange ? [sharedRange.minimum, sharedRange.maximum] : values);
  const axis =
    unit === 'percent'
      ? {
          divisor: 1,
          label: '%',
          digits: chartScale(0, range.maximum - range.minimum, locale, range.ticks.length - 1)
            .digits,
        }
      : chartScale(
          Math.max(Math.abs(range.minimum), Math.abs(range.maximum)),
          range.maximum - range.minimum,
          locale,
          4
        );
  const height = 210,
    left = 58,
    right = 18,
    top = 16,
    bottom = 32;
  const y = (value: number) =>
    top + ((range.maximum - value) / (range.maximum - range.minimum)) * (height - top - bottom);
  const step = (width - left - right) / Math.max(1, points.length);
  const x = (index: number) => left + (index + 0.5) * step;
  const selectedIndex = Math.max(
    0,
    points.findIndex((point) => point.period === selectedPeriod)
  );
  const peerVisible = points.some((point) => point.count !== null);
  return (
    <>
      <p className="financial-chart-unit">
        {unit === 'percent' ? '%' : t(`人民币 · ${axis.label}`, axis.label)}
      </p>
      <div
        ref={ref}
        className="financial-chart-scroll"
        tabIndex={0}
        aria-label={t('年度图表，可横向滚动', 'Annual chart; scroll horizontally')}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ minWidth: width }}
          role="group"
          aria-label={`${label} · ${axis.label}`}
          data-chart-type={style}
        >
          <PeerPattern id={pattern} />
          {range.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={width - right}
                y1={y(tick)}
                y2={y(tick)}
                className={tick === 0 ? 'financial-chart-zero' : 'financial-chart-grid-line'}
              />
              <text x={left - 8} y={y(tick) + 4} textAnchor="end">
                {(tick / axis.divisor).toLocaleString(locale, {
                  maximumFractionDigits: axis.digits,
                })}
              </text>
            </g>
          ))}
          {style === 'lines' &&
            ['company', 'peer'].flatMap((series) =>
              points.slice(1).map((point, offset) => {
                const prior = points[offset]!,
                  a = prior[series as 'company' | 'peer'],
                  b = point[series as 'company' | 'peer'];
                return present(a) &&
                  present(b) &&
                  consecutivePeriods(prior.period, point.period) ? (
                  <line
                    key={`${series}:${point.period}`}
                    data-segment={`${prior.period}:${point.period}`}
                    x1={x(offset)}
                    x2={x(offset + 1)}
                    y1={y(a)}
                    y2={y(b)}
                    className={`financial-chart-${series}-line`}
                  />
                ) : null;
              })
            )}
          {points.map((point, index) => (
            <g
              key={point.period}
              ref={(node) => {
                groupRefs.current[index] = node;
              }}
              role="button"
              tabIndex={selectedIndex === index ? 0 : -1}
              aria-pressed={point.period === selectedPeriod}
              aria-label={`${point.period.slice(0, 4)} · ${label} · ${companyName} ${formatted(point.company, unit, locale)}${point.count !== null ? ` · ${peerName} ${formatted(point.peer, unit, locale)}` : ''}`}
              onClick={() => onPeriodChange(point.period)}
              onKeyDown={(event) => {
                const next =
                  event.key === 'ArrowRight'
                    ? Math.min(points.length - 1, index + 1)
                    : event.key === 'ArrowLeft'
                      ? Math.max(0, index - 1)
                      : event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? points.length - 1
                          : null;
                if (next !== null) {
                  event.preventDefault();
                  onPeriodChange(points[next]!.period);
                  groupRefs.current[next]?.focus();
                } else if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onPeriodChange(point.period);
                }
              }}
            >
              <rect
                x={x(index) - step / 2 + 3}
                y={3}
                width={step - 6}
                height={height - 6}
                rx={4}
                className={`financial-chart-year-hit ${point.period === selectedPeriod ? 'selected' : ''}`}
              />
              {style === 'dumbbell' && present(point.company) && present(point.peer) && (
                <line
                  x1={x(index)}
                  x2={x(index)}
                  y1={y(point.company)}
                  y2={y(point.peer)}
                  className="financial-chart-connector"
                />
              )}
              {(['company', 'peer'] as const).map((series, seriesIndex) => {
                const value = point[series];
                if (!present(value))
                  return series === 'company' || point.count !== null ? (
                    <text
                      key={series}
                      className="financial-chart-missing"
                      x={x(index) + (seriesIndex ? 10 : -10)}
                      y={y(0) - 7}
                      textAnchor="middle"
                    >
                      {t('缺', '—')}
                    </text>
                  ) : null;
                const title = `${point.period.slice(0, 4)} · ${seriesIndex ? peerName : companyName} ${formatted(value, unit, locale)}`;
                return style === 'bars' ? (
                  <rect
                    key={series}
                    x={x(index) + (seriesIndex ? 3 : -21)}
                    y={y(Math.max(0, value))}
                    width={18}
                    height={Math.max(1, Math.abs(y(value) - y(0)))}
                    rx={2}
                    className={`financial-chart-${series}-bar`}
                    fill={seriesIndex ? `url(#${pattern})` : undefined}
                  >
                    <title>{title}</title>
                  </rect>
                ) : (
                  <circle
                    key={series}
                    cx={x(index)}
                    cy={y(value)}
                    r={seriesIndex ? 4.5 : 3.5}
                    className={`financial-chart-${series}-dot`}
                  >
                    <title>{title}</title>
                  </circle>
                );
              })}
              <text x={x(index)} y={height - 10} textAnchor="middle">
                {point.period.slice(0, 4)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      {peerVisible && <ChartLegend companyLabel={companyName} peerLabel={peerName} />}
    </>
  );
}

export function IndustryPairChart({
  company,
  peer,
  label,
}: {
  company: number | null;
  peer: number | null;
  label: string;
}) {
  const { t, locale } = useApp();
  const id = `pair-${useId().replace(/:/g, '')}`;
  const { ref, width } = usePlotWidth(340);
  const range = chartRange([company, peer]);
  const digits = chartScale(
    0,
    range.maximum - range.minimum,
    locale,
    range.ticks.length - 1
  ).digits;
  const left = 54,
    right = 24,
    height = 116;
  const x = (value: number) =>
    left + ((value - range.minimum) / (range.maximum - range.minimum)) * (width - left - right);
  return (
    <div ref={ref} className="financial-chart-scroll" tabIndex={0} aria-label={label}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ minWidth: width }}
        role="img"
        aria-label={`${label} · ${t('企业', 'Company')} ${formatted(company, 'percent', locale)} · ${t('同行均值', 'Peer mean')} ${formatted(peer, 'percent', locale)}`}
        data-chart-type="horizontal-bars"
      >
        <PeerPattern id={id} />
        {range.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={x(tick)}
              x2={x(tick)}
              y1={10}
              y2={82}
              className={tick === 0 ? 'financial-chart-zero' : 'financial-chart-grid-line'}
            />
            <text x={x(tick)} y={106} textAnchor="middle">
              {tick.toLocaleString(locale, { maximumFractionDigits: digits })}%
            </text>
          </g>
        ))}
        {([company, peer] as const).map((value, index) => (
          <g key={index}>
            <text x={left - 8} y={30 + index * 34} textAnchor="end">
              {index ? t('同行', 'Peers') : t('企业', 'Company')}
            </text>
            {present(value) ? (
              <rect
                x={x(Math.min(0, value))}
                y={16 + index * 34}
                width={Math.max(1, Math.abs(x(value) - x(0)))}
                height={20}
                rx={2}
                className={`financial-chart-${index ? 'peer' : 'company'}-bar`}
                fill={index ? `url(#${id})` : undefined}
              >
                <title>{formatted(value, 'percent', locale)}</title>
              </rect>
            ) : (
              <text x={x(0) + 6} y={30 + index * 34}>
                —
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export function IndustryDistributionChart({
  snapshot,
  metric,
}: {
  snapshot: CompanyIndustrySnapshot;
  metric: IndustryMetricKey;
}) {
  const { t, locale } = useApp();
  const { ref, width } = usePlotWidth(540);
  const values = snapshot.samples
    .filter((sample) => sample.code !== snapshot.securityCode)
    .map((sample) => sample.values[metric])
    .filter(present);
  const item = snapshot.metrics[metric];
  const minimum = Math.max(5, snapshot.minimumSamples);
  if (values.length < minimum)
    return (
      <p className="financial-chart-note">
        {t(
          `有效同行不足 ${minimum} 家，暂不展示分布。`,
          `Fewer than ${minimum} valid peers; distribution unavailable.`
        )}
      </p>
    );
  const range = chartRange([...values, item.company, item.mean], false);
  const digits = chartScale(
    0,
    range.maximum - range.minimum,
    locale,
    range.ticks.length - 1
  ).digits;
  const bins = distributionBins(values, range);
  const maximum = Math.max(1, ...bins.map((bin) => bin.count));
  const height = 250,
    left = 42,
    right = 20,
    top = 44,
    bottom = 32;
  const x = (value: number) =>
    left + ((value - range.minimum) / (range.maximum - range.minimum)) * (width - left - right);
  const y = (value: number) => height - bottom - (value / maximum) * (height - top - bottom);
  return (
    <div
      ref={ref}
      className="financial-chart-scroll"
      tabIndex={0}
      aria-label={t('同行分布，可横向滚动', 'Peer distribution; scroll horizontally')}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ minWidth: width }}
        role="img"
        aria-label={t(
          `${values.length} 家有效同行的区间分布，企业 ${formatted(item.company, 'percent', locale)}，均值 ${formatted(item.mean, 'percent', locale)}`,
          `Distribution of ${values.length} valid peers; company ${formatted(item.company, 'percent', locale)}, mean ${formatted(item.mean, 'percent', locale)}`
        )}
        data-chart-type="histogram"
        data-sample-count={values.length}
      >
        <text x={left} y={16}>
          {t('同行家数', 'Peer count')}
        </text>
        {Array.from(
          { length: Math.floor(maximum / Math.max(1, Math.ceil(maximum / 4))) + 1 },
          (_, index) => index * Math.max(1, Math.ceil(maximum / 4))
        ).map((count) => (
          <g key={count}>
            <line
              x1={left}
              x2={width - right}
              y1={y(count)}
              y2={y(count)}
              className="financial-chart-grid-line"
            />
            <text x={left - 8} y={y(count) + 4} textAnchor="end">
              {count}
            </text>
          </g>
        ))}
        {bins.map((bin, index) => (
          <rect
            key={index}
            x={x(bin.start) + 1}
            y={y(bin.count)}
            width={Math.max(1, x(bin.end) - x(bin.start) - 2)}
            height={height - bottom - y(bin.count)}
            rx={2}
            className="financial-chart-histogram-bar"
          >
            <title>{`${bin.start.toFixed(2)}% – ${bin.end.toFixed(2)}%${index === bins.length - 1 ? t('（含右端）', ' (inclusive end)') : t('（不含右端）', ' (exclusive end)')} · ${bin.count} ${t('家', 'peers')}`}</title>
          </rect>
        ))}
        {range.ticks.map((tick) => (
          <text key={tick} x={x(tick)} y={height - 10} textAnchor="middle">
            {tick.toLocaleString(locale, { maximumFractionDigits: digits })}%
          </text>
        ))}
        {(
          [
            ['peer', item.mean, t('同行均值', 'Peer mean'), 34],
            ['company', item.company, t('企业', 'Company'), 19],
          ] as const
        ).map(([series, value, text, labelY]) =>
          present(value) ? (
            <g key={series}>
              <line
                x1={x(value)}
                x2={x(value)}
                y1={top - 5}
                y2={height - bottom}
                className={`financial-chart-${series}-line`}
              />
              <text
                className={`financial-chart-${series}-text`}
                x={Math.min(width - right - 74, Math.max(left + 74, x(value)))}
                y={labelY}
                textAnchor="middle"
              >
                {text} {formatted(value, 'percent', locale)}
              </text>
            </g>
          ) : null
        )}
      </svg>
    </div>
  );
}
