import { Suspense, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, ChevronDown } from 'lucide-react';
import { productTagline } from '../../shared/product-terms';
import { useApp } from '../context';
import { Dialog } from '../components';
import { StartInput } from '../StartInput';
import { lazyPage } from '../lazy-page';
import { landingExample, type LandingText, type LandingSourceCrop } from './landing-content';
import { EvidenceSculpture } from './EvidenceSculpture';
import { storyChapters } from './story';
import { useStoryTimeline } from './useStoryTimeline';
import './cinematic-landing.css';

const CashScenarioPreview = lazyPage(
  () => import('../CashScenarioPreview'),
  (module) => module.CashScenarioPreview
);

function amount(value: string, signed = false) {
  const number = Number(value) / 100_000_000;
  return `${signed && number > 0 ? '+' : ''}${number.toFixed(2)}`;
}

function exactAmount(value: string, english: boolean) {
  return new Intl.NumberFormat(english ? 'en-US' : 'zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function OriginalPage({ crop, field }: { crop: LandingSourceCrop; field: string }) {
  const { t } = useApp();
  const region = crop.highlights[field];
  return (
    <div className="document-page">
      <img src={crop.src} width={crop.width} height={crop.height} alt={t(...crop.alt)} />
      {region && (
        <span
          className="source-aperture"
          aria-hidden="true"
          style={{
            left: `${region.x * 100}%`,
            top: `${region.y * 100}%`,
            width: `${region.width * 100}%`,
            height: `${region.height * 100}%`,
          }}
        >
          <i />
          <i />
          <i />
          <i />
        </span>
      )}
    </div>
  );
}

function BridgeFigure() {
  const { t, locale } = useApp();
  const figureId = useId();
  const english = locale === 'en';
  const rows = landingExample.bridgeRows;
  const steps: { start: number; end: number }[] = [];
  let running = 0;
  rows.forEach((row, index) => {
    const value = Number(row.amount) / 100_000_000;
    const total = index === 0 || index === rows.length - 1;
    const start = total ? 0 : running;
    const end = total ? value : running + value;
    steps.push({ start, end });
    running = end;
  });
  const y = (value: number) => 126 - value * 18;
  const x = (index: number) => 61 + index * 80;
  return (
    <figure className="bridge-figure">
      <div className="bridge-heading">
        <span>{t('松原安全 · 2025 年报', 'SONGYUAN · 2025 ANNUAL REPORT')}</span>
        <span>{t('亿元 · 合并口径', 'CNY 100m · consolidated')}</span>
      </div>
      <svg
        viewBox="0 0 540 280"
        role="img"
        aria-labelledby={`${figureId}-title ${figureId}-description`}
      >
        <title id={`${figureId}-title`}>
          {t('从合并净利润核对至经营现金净额', 'Reconcile consolidated profit to operating cash')}
        </title>
        <desc id={`${figureId}-description`}>
          {rows.map((row) => `${t(...row.label)} ${row.amount} CNY`).join('; ')}
        </desc>
        {[4, 0, -4].map((value) => (
          <g key={value} className={`bridge-axis ${value === 0 ? 'bridge-zero' : ''}`}>
            <line x1="44" y1={y(value)} x2="518" y2={y(value)} />
            <text x="32" y={y(value) + 4} textAnchor="end">
              {value}
            </text>
          </g>
        ))}
        {rows.map((row, index) => {
          const step = steps[index]!;
          const top = y(Math.max(step.start, step.end));
          const height = Math.max(2, Math.abs(step.end - step.start) * 18);
          const lines = english
            ? ['Profit', 'Inv. adj.', 'Receiv. adj.', 'Payab. adj.', '13 items', 'Op. CF']
            : ['净利润', '存货调整', '应收调整', '应付调整', '13 项', '经营现金'];
          return (
            <g key={row.id}>
              {index < rows.length - 1 && (
                <line
                  className="bridge-link"
                  x1={x(index) + 42}
                  y1={y(step.end)}
                  x2={x(index + 1)}
                  y2={y(step.end)}
                />
              )}
              <g className="bridge-column">
                <rect
                  className={
                    index === 0 || index === rows.length - 1 ? 'bridge-total' : 'bridge-adjustment'
                  }
                  x={x(index)}
                  y={top}
                  width="42"
                  height={height}
                  rx="2"
                />
                <line
                  className="bridge-highlight"
                  x1={x(index) + 1}
                  y1={top + 1}
                  x2={x(index) + 41}
                  y2={top + 1}
                />
              </g>
              <text
                className="bridge-value"
                x={x(index) + 21}
                y={step.end >= step.start ? top - 10 : top + height + 18}
                textAnchor="middle"
              >
                {amount(row.amount, index > 0 && index < rows.length - 1)}
              </text>
              <text className="bridge-label" x={x(index) + 21} y="250" textAnchor="middle">
                {english && index === 4 ? (
                  <>
                    <tspan x={x(index) + 21}>13</tspan>
                    <tspan x={x(index) + 21} dy="24">
                      items
                    </tspan>
                  </>
                ) : (
                  lines[index]
                )}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="bridge-mobile-labels" aria-hidden="true">
        {(english
          ? ['Profit', 'Inv.', 'Receiv.', 'Payab.', '13 items', 'Op. CF']
          : ['净利润', '存货', '应收', '应付', '13 项', '经营现金']
        ).map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <figcaption>
        <span>{t('原件 p.190–191。', 'Source: p.190–191.')} </span>
        {t('其余 13 项由原表分项求和。', 'Other 13 adjustments sum the original rows.')}
      </figcaption>
    </figure>
  );
}

function SourceDetails() {
  const { t, locale } = useApp();
  return (
    <div className="landing-source-details">
      <p>
        {t(...landingExample.notices.sample)} · {t(...landingExample.notices.scope)}
      </p>
      <dl>
        <div>
          <dt>{t('合并净利润', 'Consolidated net profit')}</dt>
          <dd>{exactAmount(landingExample.summary.profit, locale === 'en')} CNY</dd>
        </div>
        <div>
          <dt>{t('经营现金净额', 'Operating cash flow')}</dt>
          <dd>{exactAmount(landingExample.summary.cash, locale === 'en')} CNY</dd>
        </div>
      </dl>
      {landingExample.source.crops.map((crop) => (
        <figure key={crop.page}>
          <img src={crop.src} width={crop.width} height={crop.height} alt={t(...crop.alt)} />
          <figcaption>{t(...crop.caption)}</figcaption>
        </figure>
      ))}
      <details className="landing-adjustment-details">
        <summary>
          {t('查看现金桥精确金额', 'View exact reconciliation amounts')}
          <ChevronDown size={15} />
        </summary>
        <dl>
          {landingExample.bridgeRows.map((row) => (
            <div key={row.id}>
              <dt>{t(...row.label)}</dt>
              <dd>{exactAmount(row.amount, locale === 'en')} CNY</dd>
            </div>
          ))}
        </dl>
        <p>{t(...landingExample.notices.bridge)}</p>
        <p>{t('原表分项（名称简写）', 'Source components (shortened Chinese labels)')}</p>
        <dl className="landing-component-list">
          {landingExample.bridgeRows
            .find((row) => row.id === 'otherAdjustments')!
            .components!.map((component) => (
              <div key={component.originalLabel}>
                <dt>
                  {component.originalLabel} · p.{component.sourcePage}
                </dt>
                <dd>{exactAmount(component.amount, locale === 'en')} CNY</dd>
              </div>
            ))}
        </dl>
      </details>
      <a href={landingExample.source.url} target="_blank" rel="noreferrer" className="text-link">
        {t('打开完整年报', 'Open the original annual report')}
        <ArrowUpRight size={15} />
      </a>
    </div>
  );
}

function InquiryBranches() {
  const { t } = useApp();
  return (
    <div className="inquiry-branches">
      <article>
        <span className="inquiry-index">01</span>
        <h3>{t('扩张备货', 'Stocking for expansion')}</h3>
        <p>
          {t('订单执行、期后交付与销售记录', 'Order execution, subsequent deliveries and sales')}
        </p>
      </article>
      <article>
        <span className="inquiry-index">02</span>
        <h3>{t('存货去化压力', 'Slower inventory sell-through')}</h3>
        <p>
          {t(
            '存货分类与库龄、可变现净值及减值测试',
            'Inventory categories and aging, net realizable value and impairment tests'
          )}
        </p>
      </article>
    </div>
  );
}

export function CinematicLanding() {
  const { t, locale, user } = useApp();
  const root = useRef<HTMLDivElement>(null);
  const { goToChapter } = useStoryTimeline(root);
  const [entryOpen, setEntryOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const text = (value: LandingText) => t(...value);
  const firstCrop = landingExample.source.crops[0]!;
  const secondCrop = landingExample.source.crops[1]!;
  return (
    <div ref={root} className="cinematic-home" data-locale={locale}>
      <div className="landing-stage">
        <div className="scene-backdrop" aria-hidden="true" />
        <EvidenceSculpture />
        <div className="sculpture-fallback" aria-hidden="true">
          <img src={firstCrop.src} alt="" />
          <div className="fallback-glass" />
        </div>
        <div className="landing-topline">
          <span className="landing-signature">PRISPECT</span>
          <button className="landing-top-action" onClick={() => setEntryOpen(true)}>
            {t('开始研究', 'Start research')} <ArrowUpRight size={14} />
          </button>
        </div>

        <section className="scene-copy landing-hero" aria-labelledby="landing-headline">
          <div className="hero-heading">
            <h1 id="landing-headline" aria-label={t(...productTagline)}>
              {locale === 'en' ? (
                <>
                  Make company judgments
                  <br />
                  <em>traceable.</em>
                </>
              ) : (
                <>
                  让企业判断，
                  <br />
                  <em>有据可查。</em>
                </>
              )}
            </h1>
            <p>{t('输入公司名称或股票代码。', 'Enter a company name or stock code.')}</p>
            <div className="landing-actions">
              <button className="landing-primary" onClick={() => setEntryOpen(true)}>
                {t('开始研究', 'Start research')} <ArrowRight size={16} />
              </button>
              <button className="landing-secondary" onClick={() => goToChapter(1)}>
                {t('展开这个案例', 'Explore this case')} <ArrowDown size={15} />
              </button>
            </div>
          </div>
          <p className="discovery-question">
            {t('差额由哪些调整构成？', 'Which adjustments reconcile the difference?')}
          </p>
        </section>

        <section className="scene-copy scene-source" aria-labelledby="landing-source-heading">
          <div className="scene-heading">
            <p className="scene-kicker">01 / {t('原件', 'ORIGINAL')}</p>
            <h2 id="landing-source-heading">
              {t('回到第 190—191 页。', 'Back to pages 190–191.')}
            </h2>
            <p>{t('现金流量表补充资料 · 单位：元', 'Cash-flow reconciliation · amounts in CNY')}</p>
          </div>
          <div className="source-reading">
            <div className="source-page source-page-first">
              <OriginalPage crop={firstCrop} field="netProfit" />
              <span className="source-page-number">p.190</span>
            </div>
            <div className="source-page source-page-second">
              <OriginalPage crop={secondCrop} field="operatingCashFlow" />
              <span className="source-page-number">p.191</span>
            </div>
          </div>
          <button className="landing-text-action source-open" onClick={() => setSourceOpen(true)}>
            {t('查看原文与精确金额', 'View originals and exact amounts')} <ArrowUpRight size={15} />
          </button>
        </section>

        <section
          className="scene-copy scene-calculation"
          aria-labelledby="landing-calculation-heading"
        >
          <div className="scene-heading">
            <p className="scene-kicker">02 / {t('原件现金桥', 'ORIGINAL-REPORT RECONCILIATION')}</p>
            <h2 id="landing-calculation-heading">
              {t('从 3.66 亿，核对至 0.26 亿。', 'From CNY 366.37m to CNY 26.20m.')}
            </h2>
          </div>
          <div className="bridge-structure">
            <BridgeFigure />
          </div>
          <button className="landing-text-action bridge-open" onClick={() => setSourceOpen(true)}>
            {t('查看原文与计算依据', 'View originals and reconciliation')}{' '}
            <ArrowUpRight size={15} />
          </button>
        </section>

        <section className="scene-copy scene-inquiry" aria-labelledby="landing-questions-heading">
          <div className="scene-heading">
            <p className="scene-kicker">03 / {t('待检验解释', 'UNTESTED EXPLANATIONS')}</p>
            <h2 id="landing-questions-heading">
              {t('扩张备货，还是去化承压？', 'Stocking for expansion, or slower sell-through?')}
            </h2>
            <p>{t('区分材料尚未取得。', 'Distinguishing materials have not been obtained.')}</p>
          </div>
          <InquiryBranches />
          <p className="inquiry-boundary">
            {t(
              '金额核对，不等于经营原因已证实。',
              'Reconciled amounts do not establish an operating cause.'
            )}
          </p>
        </section>

        <section className="scene-copy landing-ending" aria-labelledby="landing-research-heading">
          <div className="ending-content">
            <p className="scene-kicker">PRISPECT</p>
            <h2 id="landing-research-heading">
              {t('研究哪家公司？', 'Which company are you researching?')}
            </h2>
            <p>{t('输入公司名称或股票代码。', 'Enter a company name or stock code.')}</p>
            <button className="landing-primary ending-start" onClick={() => setEntryOpen(true)}>
              {t('开始研究', 'Start research')} <ArrowRight size={18} />
            </button>
            <a className="landing-coverage" href="/docs/guide?section=company">
              {t('支持 A 股上市公司 · 使用指南', 'A-share listed companies · Guide')}{' '}
              <ArrowUpRight size={13} />
            </a>
          </div>
        </section>

        <div className="initial-amounts" data-story-panel="0 1">
          <div className="amount-profit">
            <span>{t('合并净利润', 'Consolidated profit')}</span>
            <strong>
              {amount(landingExample.summary.profit)}
              <small>{t('亿元', 'CNY 100m')}</small>
            </strong>
          </div>
          <div className="amount-cash">
            <span>{t('经营现金净额', 'Operating cash flow')}</span>
            <strong>
              {amount(landingExample.summary.cash)}
              <small>{t('亿元', 'CNY 100m')}</small>
            </strong>
          </div>
        </div>

        <div className="scene-identity" data-story-panel="0 1 2 3">
          <span>
            {text(landingExample.company.shortName)} · {landingExample.company.code} ·{' '}
            {t('2025 年报', '2025 annual report')}
          </span>
          <span>
            {t(
              '历史示例 · 年度 · 合并口径 · 人民币',
              'Historical example · Annual · Consolidated · CNY'
            )}
          </span>
        </div>
        <div className="landing-bottomline">
          <span className="landing-scroll-note">
            <ArrowDown size={14} />
            {t('滚动展开', 'SCROLL TO EXPLORE')}
          </span>
          <nav className="story-nav" aria-label={t('首页故事章节', 'Homepage story chapters')}>
            {storyChapters.map((chapter, index) => (
              <button
                key={chapter.id}
                onClick={() => goToChapter(index)}
                aria-label={`${index + 1}. ${t(chapter.label[0], chapter.label[1])}`}
              >
                <span>0{index + 1}</span>
                <span>{t(chapter.label[0], chapter.label[1])}</span>
              </button>
            ))}
          </nav>
          <span className="story-track" aria-hidden="true">
            <i />
          </span>
        </div>
      </div>

      <div className="landing-static-story">
        <section>
          <p className="scene-kicker">PRISPECT</p>
          <h1>{t(...productTagline)}</h1>
          <p>{t('输入公司名称或股票代码。', 'Enter a company name or stock code.')}</p>
          <div className="landing-actions">
            <button className="landing-primary" onClick={() => setEntryOpen(true)}>
              {t('开始研究', 'Start research')} <ArrowRight size={16} />
            </button>
            <a className="landing-secondary" href="/docs/guide?section=company">
              {t('使用指南', 'Guide')} <ArrowUpRight size={15} />
            </a>
          </div>
        </section>
        <section>
          <p className="scene-kicker">
            {text(landingExample.company.shortName)} · {landingExample.company.code} ·{' '}
            {t('2025 年报', '2025 annual report')}
          </p>
          <h2>
            {t('3.66 亿利润。0.26 亿经营现金。', 'CNY 366.37m profit. CNY 26.20m operating cash.')}
          </h2>
          <p>
            {t(
              '历史示例 · 年度 · 合并口径 · 人民币',
              'Historical example · Annual · Consolidated · CNY'
            )}
          </p>
          <p>{t('差额由哪些调整构成？', 'Which adjustments reconcile the difference?')}</p>
          <OriginalPage crop={firstCrop} field="netProfit" />
          <button className="landing-text-action" onClick={() => setSourceOpen(true)}>
            {t(
              '查看第 190—191 页原文与精确金额',
              'View originals on pages 190–191 and exact amounts'
            )}{' '}
            <ArrowUpRight size={15} />
          </button>
        </section>
        <section>
          <h2>{t('从 3.66 亿，核对至 0.26 亿。', 'From CNY 366.37m to CNY 26.20m.')}</h2>
          <BridgeFigure />
        </section>
        <section>
          <p className="scene-kicker">{t('待检验解释', 'UNTESTED EXPLANATIONS')}</p>
          <h2>
            {t('扩张备货，还是去化承压？', 'Stocking for expansion, or slower sell-through?')}
          </h2>
          <InquiryBranches />
          <p>
            {t(
              '区分材料尚未取得，现有金额不能确认经营原因。',
              'Distinguishing materials have not been obtained. The amounts do not establish an operating cause.'
            )}
          </p>
        </section>
        <section>
          <h2>{t('研究哪家公司？', 'Which company are you researching?')}</h2>
          <div className="landing-actions">
            <button className="landing-primary" onClick={() => setEntryOpen(true)}>
              {t('开始研究', 'Start research')} <ArrowRight size={16} />
            </button>
            <a className="landing-secondary" href="/docs/guide">
              {t('使用指南', 'Guide')} <ArrowUpRight size={15} />
            </a>
          </div>
        </section>
      </div>

      {entryOpen && (
        <Dialog
          title={t('开始研究一家公司', 'Start company research')}
          onClose={() => {
            setEntryOpen(false);
            setCashOpen(false);
          }}
        >
          <div className="landing-entry">
            <StartInput key={user?.id || 'anonymous'} compact />
            <p>
              <a href="/docs/guide?section=company">
                {t('支持范围与使用指南', 'Coverage and guide')}
                <ArrowUpRight size={13} />
              </a>
            </p>
            <details
              className="landing-cash-example"
              onToggle={(event) => setCashOpen(event.currentTarget.open)}
            >
              <summary>
                <span>
                  {t('体验付款日期情景', 'Explore payment timing')}
                  <small>{t('假设计划', 'Hypothetical plan')}</small>
                </span>
                <ChevronDown size={16} />
              </summary>
              {cashOpen && (
                <Suspense fallback={<p role="status">{t('正在打开情景…', 'Opening scenario…')}</p>}>
                  <CashScenarioPreview />
                </Suspense>
              )}
            </details>
          </div>
        </Dialog>
      )}
      {sourceOpen && (
        <Dialog
          title={t('原文与计算依据', 'Originals and calculation basis')}
          onClose={() => setSourceOpen(false)}
          wide
        >
          <SourceDetails />
        </Dialog>
      )}
    </div>
  );
}
