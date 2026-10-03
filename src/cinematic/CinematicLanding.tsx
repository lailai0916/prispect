import { Suspense, useId, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  FileSearch,
  Focus,
  Layers3,
} from 'lucide-react';
import { productTagline } from '../../shared/product-terms';
import { useApp } from '../context';
import { Dialog } from '../components';
import { StartInput } from '../StartInput';
import { lazyPage } from '../lazy-page';
import { landingExample, type LandingText, type LandingSourceCrop } from './landing-content';
import { OpticalField } from './OpticalField';
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
  const y = (value: number) => 183 - value * 27;
  const x = (index: number) => 61 + index * 80;
  return (
    <figure className="bridge-figure">
      <div className="bridge-heading">
        <span>{t('松原安全 · 2025 / 原件现金桥', 'SONGYUAN · 2025 / ORIGINAL REPORT')}</span>
        <span>{t('亿元 · 合并口径', 'CNY 100m · consolidated')}</span>
      </div>
      <svg
        viewBox="0 0 540 390"
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
          const height = Math.max(2, Math.abs(step.end - step.start) * 27);
          const lines = english
            ? ['Profit', 'Inv.', 'Receiv.', 'Payab.', '13 items', 'Op. CF']
            : ['净利润', '存货', '应收', '应付', '13 项', '经营现金'];
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
              <text className="bridge-label" x={x(index) + 21} y="354" textAnchor="middle">
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
      <figcaption>
        <span>{t('原件 p.190–191。', 'Source: p.190–191.')} </span>
        {t(
          '其余 13 项按原表分项求和。金额核对不代表经营原因已证实。',
          'Other 13 items summed. Amounts reconcile; causes remain unconfirmed.'
        )}
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
      </details>
      <a href={landingExample.source.url} target="_blank" rel="noreferrer" className="text-link">
        {t('打开完整年报', 'Open the original annual report')}
        <ArrowUpRight size={15} />
      </a>
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
        <OpticalField />
        <div className="final-paper" aria-hidden="true" />
        <div className="landing-topline">
          <span className="landing-signature">
            <span className="landing-signal" />
            PRISPECT / {t('企业研究', 'COMPANY RESEARCH')}
          </span>
          <button className="landing-top-action" onClick={() => setEntryOpen(true)}>
            {t('开始研究', 'Start research')}
            <ArrowUpRight size={14} />
          </button>
        </div>

        <div className="landing-copy-stack">
          <section className="landing-copy landing-hero" aria-labelledby="landing-headline">
            <p className="landing-eyebrow">
              {t('析光 · 从发现到依据', 'PRISPECT · FROM FINDINGS TO EVIDENCE')}
            </p>
            <h1 id="landing-headline" aria-label={t(...productTagline)}>
              {locale === 'en' ? (
                <>
                  <span>Make company</span>
                  <span>judgments</span>
                  <em>traceable.</em>
                </>
              ) : (
                <>
                  <span>让企业判断，</span>
                  <em>有据可查。</em>
                </>
              )}
            </h1>
            <p className="landing-description">
              {t(
                '从一家公司的名称开始。看见关键发现，追到原文依据，继续查清尚未解决的问题。',
                'Find what matters. Trace it to the original. Keep investigating.'
              )}
            </p>
            <div className="landing-actions">
              <button className="landing-primary" onClick={() => setEntryOpen(true)}>
                {t('开始研究', 'Start research')}
                <ArrowRight size={17} />
              </button>
              <button className="landing-secondary" onClick={() => goToChapter(1)}>
                {t('展开一份判断', 'Explore a finding')}
                <ArrowDown size={15} />
              </button>
            </div>
            <a className="landing-coverage" href="/docs/guide?section=company">
              {t('目前支持 A 股上市公司', 'Currently supports A-share listed companies')}
              <ArrowUpRight size={12} />
            </a>
          </section>

          <section className="landing-copy" aria-labelledby="landing-source-heading">
            <p className="landing-eyebrow">01 / {t('回到出处', 'BACK TO THE SOURCE')}</p>
            <h2 id="landing-source-heading">
              {t('每一个数字，', 'Every number.')}
              <em>{t('都有来处。', 'An original source.')}</em>
            </h2>
            <p className="landing-description">
              {t(
                '打开摘要背后的原件。年份、合并口径、页码与金额，一起保留下来。',
                'Open the original behind the summary. Keep the year, consolidated scope, page and exact amount together.'
              )}
            </p>
            <div className="landing-source-label">
              <FileSearch size={17} />
              <span>
                {text(landingExample.company.shortName)} · {landingExample.year}
                <small>
                  {t('现金流量表补充资料 · p.190–191', 'Cash-flow supplementary table · p.190–191')}
                </small>
              </span>
            </div>
            <button className="landing-text-action" onClick={() => setSourceOpen(true)}>
              {t('查看原文与精确金额', 'View originals and exact amounts')}
              <ArrowUpRight size={15} />
            </button>
          </section>

          <section className="landing-copy" aria-labelledby="landing-calculation-heading">
            <p className="landing-eyebrow">02 / {t('核对计算', 'FOLLOW THE CALCULATION')}</p>
            <h2 id="landing-calculation-heading">
              {t('让数字，', 'Let the figures')}
              <em>{t('彼此对得上。', 'connect.')}</em>
            </h2>
            <p className="landing-description">
              {t(
                '从合并净利润出发，沿原件披露的调整，核对至经营现金。每一段变化，仍然连接着出处。',
                'Follow reported adjustments from consolidated profit to operating cash. Every step stays connected to its source.'
              )}
            </p>
            <p className="landing-boundary">
              <Layers3 size={16} />
              {t('原件调整 · 同年度 · 同口径', 'Reported adjustments · same year · same scope')}
            </p>
            <button className="landing-text-action" onClick={() => setSourceOpen(true)}>
              {t('展开计算依据', 'Open the calculation basis')}
              <ArrowUpRight size={15} />
            </button>
          </section>

          <section className="landing-copy" aria-labelledby="landing-questions-heading">
            <p className="landing-eyebrow">03 / {t('继续追问', 'KEEP INVESTIGATING')}</p>
            <h2 id="landing-questions-heading">
              {t('算清楚之后，', 'Beyond the figures,')}
              <em>{t('继续问为什么。', 'ask why.')}</em>
            </h2>
            <p className="landing-description">
              {t(
                '金额可以核对，经营原因仍需检验。把可能解释与待补材料放在一起，看清判断能够走到哪里。',
                'Amounts reconcile. Operating causes still need testing. See the possible explanations, missing materials and limits of the finding together.'
              )}
            </p>
            <p className="landing-boundary">
              <Focus size={16} />
              {t('解释待检验 · 材料尚未取得', 'Untested explanations · materials not obtained')}
            </p>
          </section>

          <section
            className="landing-copy landing-ending"
            aria-labelledby="landing-research-heading"
          >
            <p className="landing-eyebrow">04 / {t('回到你的问题', 'BACK TO YOUR QUESTION')}</p>
            <h2 id="landing-research-heading">
              {t('下一份判断，', 'Your next finding.')}
              <em>{t('从这里开始。', 'Start here.')}</em>
            </h2>
            <p className="landing-description">
              {t(
                '带着出处、边界与下一步，研究一家你真正关心的公司。',
                'Research a company that matters to you—with sources, boundaries and a clear next step.'
              )}
            </p>
            <div className="landing-actions">
              <button className="landing-primary" onClick={() => setEntryOpen(true)}>
                {t('开始研究', 'Start research')}
                <ArrowRight size={17} />
              </button>
              <a className="landing-secondary" href="/docs/guide">
                {t('了解如何使用', 'Read the guide')}
                <ArrowUpRight size={15} />
              </a>
            </div>
          </section>
        </div>

        <div className="evidence-scene">
          <div className="evidence-model">
            <div className="document-sheet" data-story-panel="1">
              <div className="document-sheet-label">
                <span>{t('原件', 'ORIGINAL')}</span>
                <span>{landingExample.year} / p.190–191</span>
              </div>
              <div className="document-window">
                <div className="document-crop">
                  <OriginalPage crop={firstCrop} field="netProfit" />
                  <OriginalPage crop={secondCrop} field="operatingCashFlow" />
                </div>
              </div>
              <button className="document-source-button" onClick={() => setSourceOpen(true)}>
                {t('查看原件', 'View original')}
                <ArrowUpRight size={13} />
              </button>
            </div>
            <article
              className="report-sheet"
              data-story-panel="0 4"
              aria-label={t(
                '固定历史样例的研究发现',
                'Research finding from a fixed historical example'
              )}
            >
              <div className="report-sheet-header">
                <span className="report-monogram" aria-hidden="true">
                  <Focus size={18} />
                </span>
                <span>{t('研究发现', 'Research finding')}</span>
                <span className="report-date">2025</span>
              </div>
              <div className="report-identity">
                <strong>{text(landingExample.company.shortName)}</strong>
                <span>
                  {landingExample.company.code} · {t('合并口径', 'Consolidated')}
                </span>
              </div>
              <h3>
                {t('利润与经营现金之间，', 'Profit and operating cash.')}
                <br />
                {t('差距从何而来？', 'What explains the gap?')}
              </h3>
              <div className="report-metric-space" />
              <div className="report-discovery">
                <span>{t('下一步核查', 'Next check')}</span>
                <p>{t('对照营运资金调整，核查存货与回款。', 'Check inventory and collections.')}</p>
              </div>
              <button className="report-basis-link" onClick={() => setSourceOpen(true)}>
                <span>
                  <Check size={13} />
                  {t('原件金额可追溯', 'Amounts trace to the original')}
                </span>
                <span>
                  p.190–191
                  <ArrowUpRight size={12} />
                </span>
              </button>
              <p className="report-sample-note">
                {t(
                  '历史年报示例 · 不代表当前企业判断',
                  'Historical annual-report example · not a current assessment'
                )}
              </p>
            </article>
            <div className="evidence-values" data-story-panel="0 1 2 4">
              <div className="amount-profit">
                <span>{t('合并净利润', 'Consolidated profit')}</span>
                <strong>
                  {amount(landingExample.summary.profit)}
                  <small>{t('亿元', 'CNY 100m')}</small>
                </strong>
              </div>
              <div className="amount-cash">
                <span>{t('经营现金净额', 'Operating cash')}</span>
                <strong>
                  {amount(landingExample.summary.cash)}
                  <small>{t('亿元', 'CNY 100m')}</small>
                </strong>
              </div>
            </div>
            <span className="source-connector" aria-hidden="true" />
            <div className="bridge-structure" data-story-panel="2">
              <BridgeFigure />
            </div>
            <div className="explanation-layer" data-story-panel="3">
              <div className="explanation-origin">
                <span className="explanation-small-label">
                  {t('历史年报示例 / 松原安全 · 2025', 'HISTORICAL EXAMPLE / SONGYUAN · 2025')}
                </span>
                <strong>{t('利润与经营现金的差距', 'The profit–cash gap')}</strong>
              </div>
              <div className="explanation-branches">
                {landingExample.hypotheses.map((hypothesis, index) => (
                  <div key={hypothesis.id} className="explanation-branch">
                    <div className="explanation-path" aria-hidden="true" />
                    <span className="explanation-index">0{index + 1}</span>
                    <h3>{text(hypothesis.title)}</h3>
                    <span className="explanation-state">
                      {t('待检验解释', 'Untested explanation')}
                    </span>
                    <p>
                      {index === 0
                        ? t('核对订单、库龄与期后销售。', 'Check orders, stock aging and sales.')
                        : t('核对库龄、跌价及期后去化。', 'Check aging, write-downs and sales.')}
                    </p>
                  </div>
                ))}
              </div>
              <div className="explanation-open">
                <span aria-hidden="true">+</span>
                <div>
                  <strong>{t('还需要区分材料', 'Further evidence needed')}</strong>
                  <p>
                    {t(
                      '上述材料尚未取得，现有金额不能确认原因。',
                      'Not obtained. Causes unconfirmed.'
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <p className="evidence-scene-caption">
            {t('历史年报示例 / 松原安全 · 2025', 'HISTORICAL EXAMPLE / SONGYUAN · 2025')}
          </p>
        </div>

        <div className="landing-bottomline">
          <span className="landing-scroll-note">
            <ArrowDown size={15} />
            {t('向下滚动，展开依据', 'SCROLL TO EXPLORE THE EVIDENCE')}
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
          <span className="landing-edition">
            {t('发现 · 依据 · 下一步', 'FINDING · SOURCE · NEXT STEP')}
          </span>
        </div>
      </div>

      <div className="landing-static-story">
        <section>
          <p className="landing-eyebrow">PRISPECT / {t('企业研究', 'COMPANY RESEARCH')}</p>
          <h1>{t(...productTagline)}</h1>
          <p className="landing-description">
            {t(
              '从一家公司的名称开始。看见关键发现，追到原文依据，继续查清尚未解决的问题。',
              'Find what matters. Trace it to the original. Keep investigating.'
            )}
          </p>
          <div className="landing-actions">
            <button className="landing-primary" onClick={() => setEntryOpen(true)}>
              {t('开始研究', 'Start research')}
              <ArrowRight size={17} />
            </button>
            <a className="landing-secondary" href="/docs/guide?section=company">
              {t('支持范围', 'Coverage')}
              <ArrowUpRight size={15} />
            </a>
          </div>
        </section>
        <section>
          <p className="landing-eyebrow">01 / {t('回到出处', 'BACK TO THE SOURCE')}</p>
          <h2>{t('利润与经营现金的差距，从何而来？', 'What explains the profit–cash gap?')}</h2>
          <p className="landing-description">
            {t(
              '松原安全 2025 年度原件示例，合并净利润 3.66 亿元，经营现金净额 0.26 亿元。这项历史信号需要继续核查。',
              'A historical original-report example: Songyuan, 2025. Consolidated profit is CNY 366.37m, operating cash CNY 26.20m. This signal calls for further checks.'
            )}
          </p>
          <img
            src={firstCrop.src}
            width={firstCrop.width}
            height={firstCrop.height}
            alt={text(firstCrop.alt)}
          />
          <button className="landing-text-action" onClick={() => setSourceOpen(true)}>
            {t('查看原文与精确金额', 'View originals and exact amounts')}
            <ArrowUpRight size={15} />
          </button>
        </section>
        <section>
          <p className="landing-eyebrow">02 / {t('核对计算', 'FOLLOW THE CALCULATION')}</p>
          <h2>{t('让数字，彼此对得上。', 'Let the figures connect.')}</h2>
          <p className="landing-description">
            {t(
              '原件现金桥沿披露的调整核对。年份、合并口径与来源一并保留。',
              'Follow the adjustments disclosed in the original. Keep the year, consolidated scope and sources together.'
            )}
          </p>
          <BridgeFigure />
        </section>
        <section>
          <p className="landing-eyebrow">03 / {t('继续追问', 'KEEP INVESTIGATING')}</p>
          <h2>
            {t('金额核对之后，经营原因仍需检验。', 'Amounts reconcile. Causes still need testing.')}
          </h2>
          <div className="explanation-branches">
            {landingExample.hypotheses.map((hypothesis, index) => (
              <div className="explanation-branch" key={hypothesis.id}>
                <span className="explanation-index">0{index + 1}</span>
                <h3>{text(hypothesis.title)}</h3>
                <span className="explanation-state">{t('待检验解释', 'Untested explanation')}</span>
                <p>{text(hypothesis.materials[0]!)}</p>
              </div>
            ))}
          </div>
          <p className="landing-description">
            {t(
              '上述材料尚未取得，现有金额不能确认原因。',
              'These materials have not been obtained. The amounts do not establish a cause.'
            )}
          </p>
        </section>
        <section>
          <p className="landing-eyebrow">04 / {t('回到你的问题', 'BACK TO YOUR QUESTION')}</p>
          <h2>{t('下一份判断，从这里开始。', 'Your next finding. Start here.')}</h2>
          <p className="landing-description">
            {t(
              '带着出处、边界与下一步，研究一家你真正关心的公司。',
              'Research a company that matters to you—with sources, boundaries and a clear next step.'
            )}
          </p>
          <div className="landing-actions">
            <button className="landing-primary" onClick={() => setEntryOpen(true)}>
              {t('开始研究', 'Start research')}
              <ArrowRight size={17} />
            </button>
            <a className="landing-secondary" href="/docs/guide">
              {t('了解如何使用', 'Read the guide')}
              <ArrowUpRight size={15} />
            </a>
          </div>
        </section>
      </div>

      {entryOpen && (
        <Dialog
          title={t('开始研究一家公司', 'Start company research')}
          onClose={() => setEntryOpen(false)}
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
