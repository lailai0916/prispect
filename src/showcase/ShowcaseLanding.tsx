import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight } from 'lucide-react';
import { productTagline } from '../../shared/product-terms';
import { Dialog } from '../components';
import { useApp } from '../context';
import { landingExample } from '../cinematic/landing-content';
import { useShowcaseMotion } from './useShowcaseMotion';
import { HeroField } from './HeroField';
import { ShowcaseSearch } from './ShowcaseSearch';
import { FlowPreview } from './FlowPreview';
import './showcase.css';
import './showcase-v2.css';
import './showcase-v3.css';

function displayAmount(value: string, english: boolean) {
  return new Intl.NumberFormat(english ? 'en-US' : 'zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function EvidenceOriginals() {
  const { t, locale } = useApp();
  return (
    <div className="showcase-originals">
      <p>
        {t(...landingExample.notices.sample)} · {t(...landingExample.notices.scope)}
      </p>
      <dl>
        {[
          [t('合并净利润', 'Consolidated net profit'), landingExample.summary.profit],
          [t('经营现金净额', 'Operating cash flow'), landingExample.summary.cash],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{displayAmount(value, locale === 'en')} CNY</dd>
          </div>
        ))}
      </dl>
      {landingExample.source.crops.map((crop) => (
        <figure key={crop.page}>
          <img src={crop.src} width={crop.width} height={crop.height} alt={t(...crop.alt)} />
          <figcaption>{t(...crop.caption)}</figcaption>
        </figure>
      ))}
      <p>{t(...landingExample.notices.interpretation)}</p>
      <a
        href={landingExample.source.url}
        target="_blank"
        rel="noreferrer"
        className="showcase-text-link"
      >
        {t('打开完整年报', 'Open the annual report')}
        <ArrowUpRight size={16} aria-hidden="true" />
      </a>
    </div>
  );
}

export function ShowcaseLanding({
  query,
  connectionError,
}: {
  query?: URLSearchParams;
  connectionError?: string;
}) {
  const { t, locale, historyNavigation } = useApp();
  const root = useRef<HTMLDivElement>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [activePreview, setActivePreview] = useState(0);
  const [scanPosition, setScanPosition] = useState(52);
  useShowcaseMotion(root, locale);
  useEffect(() => {
    let frame = 0;
    const followAnchor = () => {
      if (historyNavigation) return;
      const anchor = location.hash.slice(1);
      if (!['showcase-query', 'showcase-evidence'].includes(anchor)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = root.current?.querySelector<HTMLElement>(`#${anchor}`);
        target?.scrollIntoView({ block: 'start', behavior: 'instant' });
        target?.focus({ preventScroll: true });
      });
    };
    followAnchor();
    window.addEventListener('hashchange', followAnchor);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', followAnchor);
    };
  }, [historyNavigation]);
  const english = locale === 'en';
  const titleLines = english
    ? ['Make company', 'judgments traceable.']
    : [productTagline[0].slice(0, 6), productTagline[0].slice(6)];
  const chapters = [
    {
      title: t('查公司', 'Find a company'),
      detail: t(
        '输入名称或代码，确认你要看的主体。',
        'Enter a name or code and confirm the company.'
      ),
    },
    {
      title: t('看数字', 'Read the numbers'),
      detail: t(
        '对照利润、经营现金和同年度财务记录。',
        'Compare profit, operating cash and same-year financial records.'
      ),
    },
    {
      title: t('追依据', 'Trace the evidence'),
      detail: t(
        '回到来源，再提出值得继续核对的问题。',
        'Return to the source and ask what needs investigating next.'
      ),
    },
  ];
  return (
    <div ref={root} className="showcase-home" data-locale={locale}>
      <section className="showcase-hero" aria-labelledby="showcase-title">
        <HeroField />
        <div className="showcase-orbit-labels" aria-hidden="true">
          <span>BEYOND THE NUMBERS</span>
          <span>{t('财务 / 来源 / 线索', 'FINANCIALS / SOURCES / LEADS')}</span>
        </div>
        <div className="showcase-hero-copy">
          <p className="showcase-hero-kicker">
            <span>PRISPECT / LITE</span>
            <span>{t('透过数字，看清公司', 'LOOK THROUGH THE NUMBERS')}</span>
          </p>
          <h1 id="showcase-title" className="showcase-title" aria-label={t(...productTagline)}>
            {titleLines.map((line, index) => (
              <span className="showcase-title-mask" key={line}>
                <span className="showcase-title-line" data-title-line={index} aria-hidden="true">
                  {Array.from(line).map((character, characterIndex) => (
                    <span className="showcase-letter" key={`${character}-${characterIndex}`}>
                      {character === ' ' ? '\u00a0' : character}
                    </span>
                  ))}
                </span>
              </span>
            ))}
          </h1>
          <p className="showcase-description">
            {t(
              '查询公司，看懂关键数字，追溯每一份依据。',
              'Find a company. Read the numbers. Trace every source.'
            )}
          </p>
          <ShowcaseSearch query={query} connectionError={connectionError} />
        </div>
        <a className="showcase-scroll-link" href="#showcase-evidence">
          <ArrowDown size={23} aria-hidden="true" />
          <span>{t('向下探索', 'Scroll to explore')}</span>
        </a>
        <span className="showcase-hero-edition" aria-hidden="true">
          FOLLOW THE EVIDENCE ↗
        </span>
      </section>
      <div className="showcase-marquee" aria-hidden="true">
        <div className="showcase-marquee-track">
          {[0, 1, 2, 3].map((index) => (
            <span key={index}>
              {t('看见数字背后的故事', 'SEE THE STORY BEHIND THE NUMBERS')}
              <ArrowUpRight size={48} />
              <span>FOLLOW THE EVIDENCE</span>
              <ArrowUpRight size={48} />
            </span>
          ))}
        </div>
      </div>
      <section
        id="showcase-evidence"
        className="showcase-evidence"
        tabIndex={-1}
        aria-labelledby="showcase-evidence-title"
      >
        <div className="showcase-evidence-heading">
          <span className="showcase-eyebrow">01 / {t('从原文开始', 'BEGIN WITH THE SOURCE')}</span>
          <h2 id="showcase-evidence-title" className="showcase-reveal">
            {t('让数字，', 'Let the numbers')}
            <br />
            {t('有迹可循。', 'leave a trail.')}
          </h2>
          <p>
            {t(
              '纸面上的利润，与经营中收到的现金，可以是两回事。',
              'Profit on paper and cash from operations can tell different stories.'
            )}
          </p>
        </div>
        <div className="showcase-evidence-stage">
          <span className="showcase-evidence-watermark" aria-hidden="true">
            SOURCE
          </span>
          <div
            className="showcase-source-scanner"
            style={{ '--scan-position': `${scanPosition}%` } as CSSProperties}
          >
            <button
              className="showcase-source-sheet"
              type="button"
              onClick={() => setSourceOpen(true)}
              aria-label={t('查看松原安全 2025 年报原件', 'View Songyuan’s original 2025 report')}
            >
              <img
                src={landingExample.source.crops[0].src}
                width={landingExample.source.crops[0].width}
                height={landingExample.source.crops[0].height}
                alt={t(...landingExample.source.crops[0].alt)}
                loading="lazy"
              />
              <span className="showcase-source-xray" aria-hidden="true">
                <img
                  src={landingExample.source.crops[1].src}
                  width={landingExample.source.crops[1].width}
                  height={landingExample.source.crops[1].height}
                  alt=""
                  loading="lazy"
                />
                <span>
                  {t('现金流量补充资料（续）· p.191', 'CASH FLOW RECONCILIATION · p.191')}
                </span>
              </span>
              <span className="showcase-source-scan-line" aria-hidden="true" />
              <span>
                {t('年报原文 · p.190–191', 'Annual report · p.190–191')}
                <ArrowUpRight size={16} aria-hidden="true" />
              </span>
            </button>
            <label className="showcase-scan-control">
              <span>{t('拖动，透视两页年报原文', 'SLIDE TO LOOK THROUGH TWO REPORT PAGES')}</span>
              <input
                type="range"
                min="8"
                max="92"
                value={scanPosition}
                aria-describedby="showcase-scan-note"
                onChange={(event) => setScanPosition(Number(event.target.value))}
                aria-label={t(
                  '调整年报第 190 页与第 191 页的展示分界',
                  'Adjust the reveal between annual-report pages 190 and 191'
                )}
              />
              <span className="showcase-scan-pages">p.190 ↔ p.191</span>
            </label>
            <p id="showcase-scan-note" className="showcase-scan-note">
              {t('两页独立原文，行位置不对应。', 'Separate original pages; rows do not align.')}
            </p>
          </div>
          <div className="showcase-evidence-values">
            <p className="showcase-source-scope">
              {t(...landingExample.notices.sample)}
              <br />
              {t(...landingExample.notices.scope)}
            </p>
            <dl>
              <div>
                <dt>{t('合并净利润', 'Consolidated net profit')}</dt>
                <dd>
                  {displayAmount(landingExample.summary.profit, english)}
                  <small>CNY</small>
                </dd>
              </div>
              <div>
                <dt>{t('经营现金净额', 'Operating cash flow')}</dt>
                <dd>
                  {displayAmount(landingExample.summary.cash, english)}
                  <small>CNY</small>
                </dd>
              </div>
            </dl>
            <p className="showcase-observation">{t(...landingExample.summary.label)}</p>
            <button
              type="button"
              className="showcase-text-link"
              onClick={() => setSourceOpen(true)}
            >
              {t('回到原文核对', 'Check the original')}
              <ArrowUpRight size={17} aria-hidden="true" />
            </button>
            <p className="showcase-evidence-note">
              {t(
                '金额反差提出问题，不直接证明经营原因。',
                'The difference raises questions; it does not establish a cause.'
              )}
            </p>
          </div>
        </div>
      </section>
      <section className="showcase-process" aria-labelledby="showcase-process-title">
        <span className="showcase-process-word" aria-hidden="true">
          LOOK CLOSER.
        </span>
        <div className="showcase-process-heading">
          <span className="showcase-eyebrow">
            02 / {t('看懂一家公司的路径', 'A PATH TO UNDERSTANDING A COMPANY')}
          </span>
          <h2 id="showcase-process-title" className="showcase-reveal">
            {t('从名字，', 'From a name,')}
            <br />
            {t('看到依据。', 'to the evidence.')}
          </h2>
        </div>
        <div className="showcase-process-layout">
          <div className="showcase-chapters">
            {chapters.map((chapter, index) => (
              <button
                type="button"
                key={chapter.title}
                className={activePreview === index ? 'is-active' : ''}
                aria-pressed={activePreview === index}
                onPointerEnter={() => setActivePreview(index)}
                onFocus={() => setActivePreview(index)}
                onClick={() => setActivePreview(index)}
              >
                <span className="showcase-chapter-number">0{index + 1}</span>
                <span>
                  <strong>{chapter.title}</strong>
                  <span>{chapter.detail}</span>
                  {activePreview === index && (
                    <span className="showcase-chapter-inline-preview">
                      <FlowPreview step={index} />
                    </span>
                  )}
                </span>
                <ArrowUpRight size={25} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="showcase-chapter-preview" aria-hidden="true">
            <span className="showcase-preview-caption">
              0{activePreview + 1} / {chapters[activePreview].title}
            </span>
            <FlowPreview key={activePreview} step={activePreview} />
          </div>
        </div>
      </section>
      <section className="showcase-ending" aria-labelledby="showcase-ending-title">
        <span className="showcase-ending-word" aria-hidden="true">
          YOUR NEXT QUESTION.
        </span>
        <span className="showcase-eyebrow">
          03 / {t('好问题，从这里开始', 'A GOOD QUESTION STARTS HERE')}
        </span>
        <h2 id="showcase-ending-title" className="showcase-reveal">
          {t('从你关心的', 'Start with a company')}
          <br />
          {t('那家公司开始。', 'you care about.')}
        </h2>
        <button
          type="button"
          className="showcase-ending-action"
          data-magnetic
          onClick={() => {
            const input = root.current?.querySelector<HTMLTextAreaElement>(
              '.showcase-search textarea'
            );
            input?.focus({ preventScroll: true });
            document.getElementById('showcase-query')?.scrollIntoView({
              behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'instant'
                : 'smooth',
              block: 'center',
            });
          }}
        >
          {t('查询一家企业', 'Find a company')}
          <ArrowRight size={24} aria-hidden="true" />
        </button>
      </section>
      <footer className="showcase-footer">
        <span>© 2026 析光 / Prispect Lite</span>
        <div>
          <a href="/query">Pro</a>
          <a href="/docs/privacy">{t('隐私政策', 'Privacy')}</a>
          <a href="/docs/terms">{t('服务条款', 'Terms')}</a>
        </div>
      </footer>
      {sourceOpen && (
        <Dialog
          wide
          title={t('松原安全 · 2025 年报原件', 'Songyuan · original 2025 annual report')}
          className="showcase-source-dialog"
          onClose={() => setSourceOpen(false)}
        >
          <EvidenceOriginals />
        </Dialog>
      )}
    </div>
  );
}
