import { useId, useMemo, useState, type CSSProperties } from 'react';
import { FlaskConical, RotateCcw } from 'lucide-react';
import type { CashPlanInput } from '../shared/contracts';
import { calculateCashStress, type CashStressResult } from '../shared/cash-stress';
import { useApp, type Translate } from './context';
import { money, type Locale } from './format';
import './cash-stress.css';

const validAmount = (value: string) => /^\d{1,20}(?:\.\d{1,2})?$/.test(value);

// BigInt values determine chart positions; Number is used only for bounded pixel coordinates.
function signedFen(value: string): bigint {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const absolute = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -absolute : absolute;
}

function fenString(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function chartUnit(maximum: bigint, locale: Locale) {
  if (maximum >= 100_000_000_000_000n) {
    const exponent = Math.floor((maximum.toString().length - 3) / 3) * 3;
    return {
      divisor: 100n * 10n ** BigInt(exponent),
      label: `${locale === 'en' ? 'CNY' : '元'} × 10^${exponent}`,
    };
  }
  if (locale === 'en') {
    if (maximum >= 100_000_000_000n) return { divisor: 100_000_000_000n, label: 'CNY bn' };
    if (maximum >= 100_000_000n) return { divisor: 100_000_000n, label: 'CNY m' };
    if (maximum >= 100_000n) return { divisor: 100_000n, label: 'CNY k' };
  } else {
    if (maximum >= 10_000_000_000n) return { divisor: 10_000_000_000n, label: '亿元' };
    if (maximum >= 1_000_000n) return { divisor: 1_000_000n, label: '万元' };
  }
  return { divisor: 100n, label: locale === 'en' ? 'CNY' : '元' };
}

function scaledLabel(value: bigint, divisor: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const hundredths = (absolute * 100n + divisor / 2n) / divisor;
  return `${negative && hundredths !== 0n ? '−' : ''}${hundredths / 100n}.${String(hundredths % 100n).padStart(2, '0')}`;
}

function BalanceChart({
  result,
  t,
  locale,
}: {
  result: CashStressResult;
  t: Translate;
  locale: Locale;
}) {
  const rows = result.baseline.periods.map((period, index) => ({
    days: period.days,
    baseline: signedFen(period.balance!),
    stress: signedFen(result.stressed.periods[index]!.balance!),
  }));
  const values = rows.flatMap((row) => [row.baseline, row.stress]);
  let low = values.reduce((minimum, value) => (value < minimum ? value : minimum), 0n);
  let high = values.reduce((maximum, value) => (value > maximum ? value : maximum), 0n);
  if (low === high) high = 100n;
  const padding = (high - low) / 8n || 1n;
  if (low < 0n) low -= padding;
  if (high > 0n) high += padding;
  const span = high - low;
  const position = (value: bigint) => Number(((high - value) * 200_000n) / span) / 1000;
  const zero = position(0n);
  const absoluteMaximum = values.reduce((maximum, value) => {
    const absolute = value < 0n ? -value : value;
    return absolute > maximum ? absolute : maximum;
  }, 0n);
  const unit = chartUnit(absoluteMaximum, locale);
  return (
    <div className="cash-stress-chart">
      <div className="cash-stress-chart-meta">
        <span>{t('三个区间的期末余额', 'Closing balances at three interval ends')}</span>
        <span>{unit.label}</span>
      </div>
      <div className="cash-stress-plot">
        <div className="cash-stress-axis" aria-hidden="true">
          {[0, 1, 2, 3, 4]
            .filter((index) => Math.abs(index * 50 - zero) > 16)
            .map((index) => (
              <span key={index} style={{ top: `${index * 25}%` }}>
                {scaledLabel(high - (span * BigInt(index)) / 4n, unit.divisor)}
              </span>
            ))}
          <span className="cash-stress-zero-label" style={{ top: `${zero / 2}%` }}>
            0.00
          </span>
        </div>
        <svg viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden="true">
          {[0, 50, 100, 150, 200].map((y) => (
            <line className="cash-stress-grid" key={y} x1="0" x2="600" y1={y} y2={y} />
          ))}
          <line className="cash-stress-zero" x1="0" x2="600" y1={zero} y2={zero} />
          {rows.map((row, index) =>
            (['baseline', 'stress'] as const).map((kind, barIndex) => {
              const point = position(row[kind]);
              return (
                <rect
                  key={`${row.days}-${kind}`}
                  className={`cash-stress-bar cash-stress-bar-${kind}${kind === 'stress' && row[kind] < 0n ? ' cash-stress-bar-gap' : ''}`}
                  x={index * 200 + 48 + barIndex * 56}
                  y={Math.min(zero, point)}
                  width="48"
                  height={Math.max(Math.abs(zero - point), row[kind] === 0n ? 1 : 0.5)}
                  rx="3"
                >
                  <title>
                    {`${row.days} ${t('天期末', 'days, interval end')} · ${kind === 'baseline' ? t('原计划', 'Baseline') : t('压力情景', 'Stress scenario')} · ${money(fenString(row[kind]), locale, false)} CNY`}
                  </title>
                </rect>
              );
            })
          )}
        </svg>
      </div>
      <div className="cash-stress-period-labels" aria-hidden="true">
        {rows.map((row) => (
          <span key={row.days}>{t(`第 ${row.days} 天期末`, `Day ${row.days} end`)}</span>
        ))}
      </div>
      <div className="cash-stress-legend">
        <span>
          <i className="cash-stress-swatch-baseline" />
          {t('原计划', 'Baseline')}
        </span>
        <span>
          <i className="cash-stress-swatch-stress" />
          {t('压力情景', 'Stress scenario')}
        </span>
        <span>
          <i className="cash-stress-swatch-gap" />
          {t('负余额', 'Negative balance')}
        </span>
      </div>
      <p className="cash-stress-chart-note">
        {t(
          '柱只表示三个期末，不表示区间内逐日余额；精确金额见下表。',
          'Bars show three interval ends, not daily balances. Exact amounts are in the table below.'
        )}
      </p>
    </div>
  );
}

export function CashStressLab({ plan }: { plan: CashPlanInput | undefined }) {
  const { t, locale } = useApp();
  const id = useId();
  const [collectionPercent, setCollectionPercent] = useState(100);
  const [delay, setDelay] = useState(false);
  const [extraOutflow, setExtraOutflow] = useState('0');
  const amountValid = validAmount(extraOutflow);
  const result = useMemo(() => {
    if (!plan || !amountValid) return null;
    try {
      return calculateCashStress(plan, {
        collectionPercent,
        delayDays: delay ? 30 : 0,
        extraOutflow,
      });
    } catch {
      return null;
    }
  }, [plan, amountValid, collectionPercent, delay, extraOutflow]);
  const known = result?.inputStatus === 'known';
  const reset = () => {
    setCollectionPercent(100);
    setDelay(false);
    setExtraOutflow('0');
  };
  const unchanged = collectionPercent === 100 && !delay && /^0+(?:\.0{1,2})?$/.test(extraOutflow);
  const currency = (amount: string | null | undefined) =>
    amount == null ? t('未知', 'Unknown') : money(amount, locale, false);
  const firstGap = !known
    ? t('未知', 'Unknown')
    : result.firstNegativePeriod === null
      ? t('三个期末均无缺口', 'No gap at these three ends')
      : t(`第 ${result.firstNegativePeriod} 天期末`, `Day ${result.firstNegativePeriod} end`);
  const minimum =
    !known || result.minimumStatus === 'unknown'
      ? t('未知', 'Unknown')
      : result.minimumStatus === 'not-achievable'
        ? t('100%仍不足', 'Even 100% is insufficient')
        : `${result.minimumCollectionPercent}%`;
  return (
    <section className="cash-stress-lab" aria-labelledby={`${id}-heading`}>
      <div className="cash-stress-heading">
        <div>
          <span className="cash-stress-eyebrow">
            <FlaskConical size={14} aria-hidden="true" />
            {t('互动 · 人工假设', 'Interactive · User assumptions')}
          </span>
          <h3 id={`${id}-heading`}>{t('现金压力沙盘', 'Cash stress lab')}</h3>
        </div>
        <span className="cash-stress-session-label">{t('仅本次试算', 'This session only')}</span>
      </div>
      <p className="cash-stress-intro">
        {t(
          '如果钱收得更少、更晚，或突然多一笔付款，三个期末还能剩多少？',
          'If less cash arrives, it arrives later, or an extra payment comes due, what remains at each interval end?'
        )}
      </p>
      {!plan ? (
        <div className="cash-stress-empty">
          <strong>{t('先保存上方收付款工作表', 'Save the cash worksheet above first')}</strong>
          <p>
            {t(
              '从你提供的当前可用现金与三期收付款开始；不会用年报金额代填。',
              'Start with your available cash and three intervals of inflows and payments. Annual-report figures are not substituted.'
            )}
          </p>
        </div>
      ) : (
        <>
          <p className="cash-stress-basis">
            {t('基于已保存工作表', 'Based on the saved worksheet')} · {plan.asOf}
          </p>
          <div className="cash-stress-layout">
            <div className="cash-stress-controls">
              <div className="cash-stress-control">
                <div className="cash-stress-control-title">
                  <label htmlFor={`${id}-collection`}>
                    {t('预计流入兑现比例', 'Expected inflows received')}
                  </label>
                  <output htmlFor={`${id}-collection`}>
                    {collectionPercent}
                    <small>%</small>
                  </output>
                </div>
                <input
                  className="cash-stress-range"
                  id={`${id}-collection`}
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={collectionPercent}
                  aria-valuetext={t(
                    `${collectionPercent}%，应用于各期全部预计流入`,
                    `${collectionPercent} percent of every interval’s expected inflows`
                  )}
                  aria-describedby={`${id}-collection-help`}
                  style={{ '--cash-stress-range-fill': `${collectionPercent}%` } as CSSProperties}
                  onChange={(event) => setCollectionPercent(Number(event.target.value))}
                />
                <div className="cash-stress-range-labels" aria-hidden="true">
                  <span>0%</span>
                  <span>100%</span>
                </div>
                <p id={`${id}-collection-help`}>
                  {t(
                    '各期全部预计流入按此比例缩减，精确到分向下取整。',
                    'All expected inflows are reduced by this percentage, rounded down to a cent.'
                  )}
                </p>
              </div>
              <div className="cash-stress-control">
                <label className="cash-stress-delay" htmlFor={`${id}-delay`}>
                  <span>{t('预计流入延后30天', 'Receive inflows 30 days later')}</span>
                  <span className="cash-stress-switch">
                    <input
                      id={`${id}-delay`}
                      type="checkbox"
                      role="switch"
                      checked={delay}
                      aria-describedby={`${id}-delay-help`}
                      onChange={(event) => setDelay(event.target.checked)}
                    />
                    <span aria-hidden="true" />
                  </span>
                </label>
                <p id={`${id}-delay-help`}>
                  {t(
                    '流入顺延一个区间；原第3期流入移至90天以后，付款时间不变。',
                    'Receipts shift one interval; original third-interval inflows move beyond day 90. Payments stay on schedule.'
                  )}
                </p>
              </div>
              <div className="cash-stress-control">
                <label htmlFor={`${id}-extra`}>
                  {t('第1期额外付款（元）', 'Extra payment in interval 1 (CNY)')}
                </label>
                <input
                  className="cash-stress-extra"
                  id={`${id}-extra`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  maxLength={23}
                  value={extraOutflow}
                  aria-invalid={!amountValid}
                  aria-describedby={`${id}-extra-help`}
                  onChange={(event) => setExtraOutflow(event.target.value)}
                />
                <p
                  id={`${id}-extra-help`}
                  className={!amountValid ? 'cash-stress-error' : undefined}
                >
                  {amountValid
                    ? t(
                        '只加在0–30天的流出，不重复计入后续区间。',
                        'Added only to payments in days 0–30, without counting it again later.'
                      )
                    : t(
                        '填写非负人民币金额，最多20位整数、两位小数；不留空。',
                        'Enter nonnegative CNY, up to 20 integer digits and two decimal places. Do not leave blank.'
                      )}
                </p>
              </div>
              <button
                className="cash-stress-reset"
                type="button"
                onClick={reset}
                disabled={unchanged}
              >
                <RotateCcw size={14} aria-hidden="true" />
                {t('重置试算假设', 'Reset scenario assumptions')}
              </button>
            </div>
            <div className="cash-stress-results">
              {known ? (
                <BalanceChart result={result} t={t} locale={locale} />
              ) : (
                <div className="cash-stress-unavailable" role="status">
                  <strong>
                    {!amountValid
                      ? t('额外付款金额需修正', 'Correct the extra payment amount')
                      : t(
                          '输入未补齐，暂停压力测算',
                          'Incomplete inputs; stress calculation paused'
                        )}
                  </strong>
                  <p>
                    {!amountValid
                      ? t(
                          '修正输入后会即时重新计算。',
                          'Results update when the input is corrected.'
                        )
                      : t(
                          '先在上方补齐当前现金及三期流入、流出并保存；未知不会变成0。',
                          'Complete and save available cash and all three intervals’ inflows and payments above. Unknown values are not treated as zero.'
                        )}
                  </p>
                </div>
              )}
              <dl className="cash-stress-summary" aria-live="polite" aria-atomic="true">
                <div
                  className={
                    known && result.firstNegativePeriod !== null ? 'cash-stress-summary-gap' : ''
                  }
                >
                  <dt>{t('首个缺口期末', 'First interval end with a gap')}</dt>
                  <dd>{firstGap}</dd>
                </div>
                <div className={known && result.maxGap !== '0.00' ? 'cash-stress-summary-gap' : ''}>
                  <dt>{t('三期最大缺口（元）', 'Largest gap at these ends (CNY)')}</dt>
                  <dd>{known ? currency(result.maxGap) : t('未知', 'Unknown')}</dd>
                </div>
                <div>
                  <dt>
                    {t(
                      '三个期末均无缺口的最低兑现比例',
                      'Minimum received for no gap at all three ends'
                    )}
                  </dt>
                  <dd>{minimum}</dd>
                </div>
              </dl>
              <p className="cash-stress-threshold-note">
                {t(
                  '最低比例按当前延后与额外付款条件，以整数百分比试算；不代表公司实际回款率。',
                  'The minimum is tested in whole percentages under this delay and extra payment. It is not the company’s actual collection rate.'
                )}
              </p>
            </div>
          </div>
          <p className="cash-stress-mobile-hint">
            {t(
              '左右滑动，查看原计划与压力情景的精确金额。',
              'Swipe to compare exact baseline and stress amounts.'
            )}
          </p>
          <div
            className="cash-stress-table-wrap"
            tabIndex={0}
            role="region"
            aria-label={t(
              '期末余额精确金额对照，可横向滚动',
              'Exact interval-end balance comparison; horizontally scrollable'
            )}
          >
            <table className="cash-stress-table">
              <caption>{t('期末余额对照 · 人民币元', 'Interval-end balances · CNY')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('期末', 'Interval end')}</th>
                  <th scope="col">{t('原计划', 'Baseline')}</th>
                  <th scope="col">{t('压力情景', 'Stress scenario')}</th>
                </tr>
              </thead>
              <tbody>
                {[30, 60, 90].map((days, index) => (
                  <tr key={days}>
                    <th scope="row">{t(`第${days}天`, `Day ${days}`)}</th>
                    <td>{currency(result?.baseline.periods[index]?.balance)}</td>
                    <td
                      className={
                        known && result.stressed.periods[index]?.balance?.startsWith('-')
                          ? 'cash-stress-negative'
                          : undefined
                      }
                    >
                      {known
                        ? currency(result.stressed.periods[index]?.balance)
                        : t('未知', 'Unknown')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {known && (delay || collectionPercent < 100) && (
            <div className="cash-stress-flow-note">
              {collectionPercent < 100 && (
                <p>
                  {t('假设未收到的预计流入', 'Expected inflows not received under this assumption')}
                  ：<strong>{currency(result.uncollected)}</strong> {t('元', 'CNY')}
                </p>
              )}
              {delay && (
                <p>
                  {t('顺延至90天以后的预计流入', 'Expected inflows shifted beyond day 90')}：
                  <strong>{currency(result.delayedBeyondHorizon)}</strong> {t('元', 'CNY')}
                </p>
              )}
            </div>
          )}
        </>
      )}
      <p className="cash-stress-disclaimer">
        {t(
          '原计划与压力情景都基于用户提供、未经核验的假设。负余额仅表示这些假设下的期末缺口，不是断款日预测或资金安全评级。试算调整不保存、不发送模型。',
          'Both scenarios use unverified user assumptions. A negative balance is an interval-end gap under those assumptions, not a predicted cash-exhaustion date or a safety rating. Stress adjustments are not saved or sent to a model.'
        )}
      </p>
    </section>
  );
}

export default CashStressLab;
