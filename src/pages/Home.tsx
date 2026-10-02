import { useEffect, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  FileText,
  History,
  Minus,
  PanelLeft,
  RotateCcw,
  Wallet,
} from 'lucide-react';
import type { DecisionSummary, DatedCashInput } from '../../shared/decision-contracts';
import { compareDatedCash } from '../../shared/decision-cash';
import { StartInput } from '../StartInput';
import { EvidenceLab } from '../EvidenceLab';
import { buildExampleEvidenceLab } from '../../shared/evidence-lab';
import { api, requestErrorText } from '../api';
import { useApp } from '../context';
import { HomeRiskCards } from '../HomeRiskCards';
import { date, money } from '../format';
import '../home.css';

gsap.registerPlugin(ScrollTrigger, useGSAP);

function FinancialPreview() {
  const { t, examples, navigate } = useApp();
  const [selected, setSelected] = useState(0);
  const item = examples[selected];
  if (!item) return null;
  const graph = item.lab || buildExampleEvidenceLab(item);
  return (
    <section
      className="landing-evidence-lab"
      aria-label={t('公开年报试验', 'Public annual-report trial')}
    >
      <div className="landing-lab-toolbar">
        <span>{t('公开年报实例', 'Public annual-report example')}</span>
        <div
          className="financial-company-switch"
          aria-label={t('选择公开年报', 'Select a public annual report')}
        >
          {examples.map((example, index) => (
            <button
              key={example.id}
              type="button"
              aria-pressed={selected === index}
              onClick={() => setSelected(index)}
            >
              {example.shortName}
            </button>
          ))}
        </div>
      </div>
      <EvidenceLab
        key={item.id}
        graph={graph}
        compact
        example
        onStartResearch={() => navigate('/query?query=' + encodeURIComponent(item.shortName))}
      />
    </section>
  );
}

function CashPreview() {
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
              <strong
                className={
                  result.minimumBalance !== null && Number(result.minimumBalance) < 0
                    ? 'preview-negative'
                    : ''
                }
              >
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

export function Home() {
  const { t, user, locale, navigate, workspace } = useApp();
  const root = useRef<HTMLDivElement>(null);
  const [recent, setRecent] = useState<DecisionSummary[]>([]);
  const [recentError, setRecentError] = useState('');
  const [recentOwner, setRecentOwner] = useState<string | null>(null);
  useEffect(() => {
    setRecent([]);
    setRecentError('');
    setRecentOwner(user?.id || null);
    if (!user) return;
    const abort = new AbortController();
    void api<DecisionSummary[]>('/decisions', { signal: abort.signal })
      .then((items) => {
        if (!abort.signal.aborted)
          setRecent(items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4));
      })
      .catch((cause) => {
        if (!abort.signal.aborted) setRecentError(requestErrorText(cause, locale));
      });
    return () => abort.abort();
  }, [user?.id, locale]);
  useGSAP(
    () => {
      if (user) return;
      const media = gsap.matchMedia();
      media.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.utils.toArray<HTMLElement>('[data-home-reveal]').forEach((element) => {
          gsap.fromTo(
            element,
            { y: 24, opacity: 0.5 },
            {
              y: 0,
              opacity: 1,
              duration: 0.6,
              ease: 'power2.out',
              scrollTrigger: { trigger: element, start: 'top 90%', once: true },
            }
          );
        });
        gsap.fromTo(
          '[data-product-window]',
          { rotationX: 3, y: 20 },
          {
            rotationX: 0,
            y: 0,
            ease: 'none',
            scrollTrigger: {
              trigger: '[data-product-window]',
              start: 'top 95%',
              end: 'top 40%',
              scrub: 0.6,
            },
          }
        );
      });
      return () => media.revert();
    },
    { scope: root, dependencies: [Boolean(user)], revertOnUpdate: true }
  );
  if (user)
    return (
      <div className="home-workspace" ref={root}>
        <section className="workspace-start">
          <h1>{t('开始一项核查', 'Start a review')}</h1>
          <StartInput compact />
        </section>
        {workspace?.tasks && <HomeRiskCards tasks={workspace.tasks} />}
        <FinancialPreview />
        {recentOwner === user.id && (recent.length > 0 || recentError) && (
          <section className="home-recent">
            <div className="home-recent-heading">
              <h2>{t('最近的核查事项', 'Recent reviews')}</h2>
              <a href="/decisions">
                {t('查看全部', 'View all')}
                <ArrowUpRight size={13} />
              </a>
            </div>
            {recentError ? (
              <p role="alert">{recentError}</p>
            ) : (
              recent.map((item) => (
                <a className="home-recent-row" key={item.id} href={`/decisions?id=${item.id}`}>
                  <span className="home-recent-icon">
                    <Wallet size={16} />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.purpose === 'external'
                        ? t('预付款核对', 'Prepayment review')
                        : t('接手核查', 'Company handover')}{' '}
                      · V{item.currentRevision}
                    </small>
                  </span>
                  <time dateTime={item.updatedAt}>{date(item.updatedAt, locale)}</time>
                  <ChevronRight size={14} />
                </a>
              ))
            )}
          </section>
        )}
      </div>
    );
  return (
    <div className="home-landing" ref={root}>
      <section className="landing-start">
        <div className="landing-start-inner">
          <span className="landing-product-name">Prispect · 析光</span>
          <h1>{t('查询一家企业', 'Research a company')}</h1>
          <p className="landing-start-description">
            {t(
              '查看核查报告，沿原文检验每一种解释。',
              'Read a review, then examine the evidence behind each explanation.'
            )}
          </p>
          <StartInput compact />
          <a
            className="landing-explore"
            href="#product"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById('product')?.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 'auto'
                  : 'smooth',
              });
            }}
          >
            {t('试着撤回一条依据', 'Try withdrawing a source fact')}
            <ArrowRight size={14} />
          </a>
        </div>
      </section>
      <div id="product">
        <FinancialPreview />
      </div>
      <section className="landing-product-section">
        <div className="landing-section-intro" data-home-reveal>
          <h2>
            {t(
              '同样的期末余额，\n不同的付款结果。',
              'Same closing balances.\nDifferent payment timing.'
            )}
          </h2>
          <p>
            {t(
              '按下列收付款假设，调整付款日期查看资金缺口；撤回余额依据后，相关计算随之暂停。',
              'Adjust the payment date under the cash assumptions below to inspect funding gaps. Withdrawing the opening-balance evidence pauses the dependent calculation.'
            )}
          </p>
        </div>
        <div className="product-window-stage">
          <CashPreview />
        </div>
      </section>
      <section className="landing-perspectives" data-home-reveal>
        <div className="landing-perspective">
          <span className="landing-section-number">01</span>
          <h2>{t('重要预付款', 'Before a prepayment')}</h2>
          <p>
            {t(
              '合同由谁签，款项交给谁，退款由谁负责。把对方的承诺与付款、交付记录放在一起核对。',
              'Check who signs, receives payment, and handles refunds. Compare commitments with payment and delivery records.'
            )}
          </p>
          <button
            className="landing-text-action"
            onClick={() => navigate('/decisions?new=external')}
          >
            {t('核对付款条件', 'Review payment terms')}
            <ArrowUpRight size={15} />
          </button>
          <div className="perspective-document">
            <div>
              <FileText size={16} />
              <strong>{t('付款与退款说明', 'Payment and refund terms')}</strong>
            </div>
            <dl>
              {[
                [t('签约主体', 'Contract entity'), t('待核对', 'To review')],
                [t('收款账户全称', 'Payee account name'), t('待提供', 'Not provided')],
                [t('退款条件与时限', 'Refund terms and timing'), t('待提供', 'Not provided')],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <div className="landing-perspective">
          <span className="landing-section-number">02</span>
          <h2>{t('接手公司', 'Company handover')}</h2>
          <p>
            {t(
              '先读财务资料，核对需要向前任追问的问题。需要安排收付款时，再补充当前现金与日期，比较不同条件。',
              'Review the financial material and questions for the previous operator. Add current cash and dates when you need to compare payment arrangements.'
            )}
          </p>
          <button
            className="landing-text-action"
            onClick={() => navigate('/decisions?new=handover')}
          >
            {t('开始接手核查', 'Start a handover review')}
            <ArrowUpRight size={15} />
          </button>
          <div className="perspective-versions">
            <div>
              <History size={16} />
              <strong>{t('版本与依据', 'Versions and evidence')}</strong>
            </div>
            <div className="perspective-version-row">
              <span className="version-node" />
              <span>V1</span>
              <span>{t('保存输入与来源', 'Retain inputs and sources')}</span>
            </div>
            <div className="perspective-version-row">
              <span className="version-node version-node-muted" />
              <span>V2</span>
              <span>{t('只重算受影响的结果', 'Recalculate dependent results')}</span>
            </div>
          </div>
        </div>
      </section>
      <section className="landing-method" data-home-reveal>
        <span>{t('财务信息与证据', 'Financial information and evidence')}</span>
        <h2>
          {t(
            '原始金额、披露范围、\n每一步的依据。',
            'Original amounts, reporting scope,\nand the basis of each result.'
          )}
        </h2>
        <p>
          {t(
            '从公开年报核对利润与经营现金，沿具体分项建立核查问题。历史报表用于解释历史，当前付款需要自己的依据。',
            'Review profit and operating cash from public annual reports, then create checks from specific line items. Historical reports explain the past; current payments need their own evidence.'
          )}
        </p>
        <a href="/method">
          {t('查看方法与范围', 'Methods and scope')}
          <ArrowRight size={15} />
        </a>
      </section>
    </div>
  );
}
