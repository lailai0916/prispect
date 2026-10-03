import { useMemo, useState } from 'react';
import { Check, ChevronRight, FileText, Minus, PanelLeft, RotateCcw, Wallet } from 'lucide-react';
import type { DatedCashInput } from '../shared/decision-contracts';
import { compareDatedCash } from '../shared/decision-cash';
import { useApp } from './context';
import { money } from './format';
import './home.css';

export function CashScenarioPreview() {
  const { t, locale } = useApp();
  const [paymentDay, setPaymentDay] = useState(5);
  const [dayText, setDayText] = useState('5');
  const [hasBalance, setHasBalance] = useState(true);
  const [inspectedDay, setInspectedDay] = useState<number | null>(null);
  const input = useMemo<DatedCashInput>(
    () => ({
      asOf: '2026-01-01',
      openingCash: hasBalance ? '120000.00' : null,
      cashFloor: '0.00',
      proposedAmount: '60000.00',
      proposedDay: paymentDay,
      alternativeDay: 26,
      flows: [
        ...[10, 40, 70].map((day) => ({
          id: `pay-${day}`,
          label: t('固定付款', 'Scheduled payment'),
          direction: 'out' as const,
          day,
          amount: '100000.00',
          flexibility: 'fixed' as const,
        })),
        ...[
          { day: 25, amount: '200000.00' },
          { day: 55, amount: '120000.00' },
          { day: 85, amount: '120000.00' },
        ].map(({ day, amount }) => ({
          id: `receive-${day}`,
          label: t('预计收款', 'Expected receipt'),
          direction: 'in' as const,
          day,
          amount,
          flexibility: 'fixed' as const,
        })),
      ],
    }),
    [hasBalance, paymentDay, t]
  );
  const result = compareDatedCash(input).primary;
  const inspectedEvent =
    result.events.find((event) => event.day === inspectedDay) ||
    result.events.find((event) => event.day === result.firstShortfallDay) ||
    result.events.find((event) => event.includesProposal);
  const points =
    result.status === 'known' ? [{ day: 0, balance: '120000.00' }, ...result.events] : [];
  const x = (day: number) => 30 + (day / 90) * 580;
  const y = (value: string) => 150 - (Number(value) / 340000) * 115;
  const path = points
    .map((point, index) =>
      index ? `H${x(point.day)} V${y(point.balance)}` : `M${x(point.day)} ${y(point.balance)}`
    )
    .join(' ');
  return (
    <div className="product-window" data-product-window>
      <div className="product-window-chrome">
        <span>
          <PanelLeft size={15} />
          {t('付款事项', 'Payments')}
          <ChevronRight size={12} />
          {t('采购付款', 'Procurement')}
        </span>
        <span className="preview-label">
          {t('情景演算 · 假设收付款计划', 'Scenario analysis · hypothetical cash plan')}
        </span>
      </div>
      <div className="product-preview-body">
        <div className="preview-title">
          <span className="preview-icon">
            <Wallet size={19} />
          </span>
          <div>
            <h3>{t('新增采购付款', 'New procurement payment')}</h3>
            <p>
              {t(
                '付款 60,000 元 · 未来 90 天已列收付款',
                'CNY 60,000 · listed cash events over 90 days'
              )}
            </p>
          </div>
          <span className="preview-version">{t('条件对照', 'Scenario comparison')}</span>
        </div>
        <div className="preview-workspace">
          <div className="preview-main">
            <div className="preview-result" aria-live="polite">
              <span>{t('最低日期末余额', 'Lowest event-date closing balance')}</span>
              <strong>
                {result.minimumBalance === null
                  ? t('当前余额待提供', 'Opening balance needed')
                  : money(result.minimumBalance, locale, false)}
              </strong>
              <p>
                {result.status === 'unknown'
                  ? t(
                      '缺少当前可用现金，余额路径暂停计算。',
                      'The balance path waits for the opening cash amount.'
                    )
                  : result.firstShortfallDay
                    ? t(
                        `第 ${result.firstShortfallDay} 天出现缺口`,
                        `A gap appears on day ${result.firstShortfallDay}`
                      )
                    : t(
                        '按所列日期到账时，各事件日期末余额非负。',
                        'Event-date closing balances remain nonnegative if receipts arrive as listed.'
                      )}
              </p>
            </div>
            <div className={`preview-chart ${hasBalance ? '' : 'preview-chart-unknown'}`}>
              <svg
                viewBox="0 0 640 220"
                role="img"
                aria-label={t(
                  '按所列收付款计算的日期末现金路径',
                  'Event-date cash path from the listed receipts and payments'
                )}
              >
                {[35, 90, 150].map((line) => (
                  <line
                    key={line}
                    x1="30"
                    x2="610"
                    y1={line}
                    y2={line}
                    className={line === 150 ? 'preview-zero' : 'preview-grid'}
                  />
                ))}
                <text x="7" y="155">
                  0
                </text>
                {hasBalance && (
                  <>
                    <path d={path} className="preview-cash-line" />
                    {result.events.map((event) => (
                      <g
                        key={event.day}
                        className={`preview-event ${event.day === inspectedEvent?.day ? 'preview-event-selected' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-label={t(
                          `查看第 ${event.day} 天的收付款`,
                          `Inspect receipts and payments on day ${event.day}`
                        )}
                        onPointerEnter={() => setInspectedDay(event.day)}
                        onFocus={() => setInspectedDay(event.day)}
                        onClick={() => setInspectedDay(event.day)}
                        onKeyDown={(key) => {
                          if (key.key === 'Enter' || key.key === ' ') {
                            key.preventDefault();
                            setInspectedDay(event.day);
                          }
                        }}
                      >
                        <circle
                          cx={x(event.day)}
                          cy={y(event.balance)}
                          r="12"
                          className="preview-event-target"
                        />
                        <circle
                          cx={x(event.day)}
                          cy={y(event.balance)}
                          r="4"
                          className="preview-event-dot"
                        />
                      </g>
                    ))}
                    <circle
                      cx={x(paymentDay)}
                      cy={y(
                        result.events.find((event) => event.includesProposal)?.balance || '0.00'
                      )}
                      r="4"
                      className="preview-proposal-point"
                    />
                  </>
                )}
                {[0, 30, 60, 90].map((day) => (
                  <text key={day} x={x(day)} y="207" textAnchor="middle">
                    {t(`第${day}天`, `Day ${day}`)}
                  </text>
                ))}
              </svg>
              {!hasBalance && (
                <div className="preview-chart-waiting">
                  <Minus size={18} />
                  <span>{t('等待现金余额依据', 'Awaiting opening cash evidence')}</span>
                </div>
              )}
            </div>
            {inspectedEvent && (
              <div className="preview-event-detail">
                <span>{t(`第 ${inspectedEvent.day} 天`, `Day ${inspectedEvent.day}`)}</span>
                <span>
                  {t('收款', 'Receipts')} <strong>{money(inspectedEvent.inflow, locale)}</strong>
                </span>
                <span>
                  {t('付款', 'Payments')} <strong>{money(inspectedEvent.outflow, locale)}</strong>
                </span>
              </div>
            )}
            <label className="preview-slider-label" htmlFor="preview-payment-day">
              <span>{t('采购付款日期', 'Procurement payment date')}</span>
              <span className="preview-day-input">
                <input
                  type="number"
                  min={1}
                  max={45}
                  step={1}
                  value={dayText}
                  aria-label={t('付款日期（第几天）', 'Payment day number')}
                  onChange={(event) => {
                    setDayText(event.target.value);
                    const next = Number(event.target.value);
                    if (event.target.value && Number.isInteger(next) && next >= 1 && next <= 45)
                      setPaymentDay(next);
                  }}
                  onBlur={() => setDayText(String(paymentDay))}
                />
                <span>{t('天', 'day')}</span>
              </span>
            </label>
            <input
              id="preview-payment-day"
              type="range"
              min="1"
              max="45"
              value={paymentDay}
              onChange={(event) => {
                setPaymentDay(Number(event.target.value));
                setDayText(event.target.value);
              }}
              aria-valuetext={t(`第 ${paymentDay} 天`, `Day ${paymentDay}`)}
            />
            <p className="preview-assumption">
              {t(
                '改期为条件对照，尚待协商；其他收付款金额和日期保持不变。',
                'Rescheduling remains subject to agreement; other listed amounts and dates stay fixed.'
              )}
            </p>
          </div>
          <aside className="preview-evidence">
            <h4>{t('计算依据', 'Calculation inputs')}</h4>
            <div className={`preview-source ${hasBalance ? '' : 'preview-source-withdrawn'}`}>
              <FileText size={17} />
              <div>
                <strong>{t('当前可用现金', 'Opening cash')}</strong>
                <span>120,000 CNY</span>
              </div>
              <span className="preview-source-state">
                {hasBalance ? <Check size={14} /> : <Minus size={14} />}
              </span>
            </div>
            <button
              className="preview-evidence-toggle"
              type="button"
              onClick={() => setHasBalance(!hasBalance)}
            >
              {hasBalance
                ? t('暂不采信这项依据', 'Withdraw this input')
                : t('恢复这项依据', 'Restore this input')}
              <RotateCcw size={13} />
            </button>
            <div className="preview-next-check">
              <span className="preview-section-label">{t('下一项核查', 'Next check')}</span>
              <strong>
                {hasBalance
                  ? t('核对计划回款的到账日期', 'Check the receipt dates')
                  : t('补充当前可用现金', 'Provide opening cash')}
              </strong>
              <p>
                {hasBalance
                  ? t(
                      '收款日期决定采购付款前是否有足够现金。',
                      'Receipt timing affects cash available before procurement.'
                    )
                  : t(
                      '恢复这一项后，仅重算依赖它的现金路径。',
                      'Restoring this input recalculates the dependent cash path.'
                    )}
              </p>
            </div>
            <div className="preview-periods">
              <span>{t('30 / 60 / 90 天期末', 'Day 30 / 60 / 90 closing')}</span>
              <strong>
                {result.periodEnds
                  .map(({ balance }) => (balance === null ? '—' : `${Number(balance) / 10000}`))
                  .join(' / ')}
                <small>{t('万元', '× CNY 10k')}</small>
              </strong>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
