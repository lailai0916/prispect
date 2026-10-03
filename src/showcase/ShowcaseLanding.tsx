import { useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, LoaderCircle, Search } from 'lucide-react';
import { productTagline } from '../../shared/product-terms';
import { Dialog } from '../components';
import { Select } from '../Select';
import { StartInput } from '../StartInput';
import { useApp } from '../context';
import { useCompanyQuery } from '../useCompanyQuery';
import { landingExample } from '../cinematic/landing-content';
import { useShowcaseMotion } from './useShowcaseMotion';
import './showcase.css';

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
  const { t, locale, user, refresh } = useApp();
  const { year, setYear, latest, creating, error, begin } = useCompanyQuery(query, {
    experience: 'lite',
  });
  const root = useRef<HTMLDivElement>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [activePreview, setActivePreview] = useState(0);
  const [exampleDraft, setExampleDraft] = useState<{ text: string; revision: number } | null>(null);
  useShowcaseMotion(root, locale);
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
      image: '/showcase/paper-sculpture.webp',
    },
    {
      title: t('看数字', 'Read the numbers'),
      detail: t(
        '对照利润、经营现金和同年度财务记录。',
        'Compare profit, operating cash and same-year financial records.'
      ),
      image: landingExample.source.crops[1].src,
    },
    {
      title: t('追依据', 'Trace the evidence'),
      detail: t(
        '回到来源，再提出值得继续核对的问题。',
        'Return to the source and ask what needs investigating next.'
      ),
      image: landingExample.source.crops[0].src,
    },
  ];
  return (
    <div ref={root} className="showcase-home" data-locale={locale}>
      <section className="showcase-hero" aria-labelledby="showcase-title">
        <div className="showcase-paper-scene" aria-hidden="true">
          <div className="showcase-paper-follow">
            <img
              className="showcase-paper"
              src="/showcase/paper-sculpture.webp"
              width="1400"
              height="1004"
              alt=""
              fetchPriority="high"
            />
          </div>
        </div>
        <div className="showcase-hero-copy">
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
          <div id="showcase-query" className="showcase-search" aria-busy={creating || !user}>
            <Search className="showcase-search-icon" size={23} aria-hidden="true" />
            <StartInput
              key={`${user?.id || 'anonymous'}:${query?.get('query') || 'new-company'}:${exampleDraft?.revision || 0}`}
              compact
              companyOnly
              initialText={exampleDraft?.text || query?.get('query') || undefined}
              disabled={!user || creating}
              placeholder={t('输入 A 股公司名称或代码', 'Enter an A-share company name or code')}
              submitLabel={t('开始查询', 'Search')}
              onCompanyChoice={(identity) => void begin(identity)}
              onInformationGap={(name) => void begin(undefined, name)}
            />
            <div className="showcase-search-meta">
              <span>{t('支持 A 股上市公司', 'A-share listed companies')}</span>
              <Select
                value={year}
                disabled={!user || creating}
                aria-label={t('选择年报年度', 'Choose annual-report year')}
                onValueChange={(value) => setYear(Number(value))}
              >
                {Array.from({ length: latest - 2010 + 1 }, (_, index) => latest - index).map(
                  (value) => (
                    <option key={value} value={value}>
                      {t(`${value} 年报`, `Annual ${value}`)}
                    </option>
                  )
                )}
              </Select>
              <a href="/query">
                {t('进入 Pro', 'Open Pro')}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
            {(!user || creating) && !connectionError && (
              <p className="showcase-search-feedback" role="status">
                <LoaderCircle className="spinner" size={16} aria-hidden="true" />
                {creating
                  ? t('正在打开财务报告…', 'Opening the financial report…')
                  : t('正在准备查询…', 'Preparing company search…')}
              </p>
            )}
            {error && (
              <p className="showcase-search-feedback" role="alert">
                {error}
              </p>
            )}
            {connectionError && (
              <div className="showcase-search-feedback" role="alert">
                <span>{connectionError}</span>
                <button
                  type="button"
                  className="showcase-text-link"
                  onClick={() => void refresh().catch(() => {})}
                >
                  {t('重新连接', 'Reconnect')}
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          <div className="showcase-examples">
            <span>{t('试试查询', 'Try a company')}</span>
            {['松原安全', '杭州银行'].map((name) => (
              <button
                type="button"
                disabled={!user || creating}
                key={name}
                onClick={() => {
                  setExampleDraft((draft) => ({
                    text: name,
                    revision: (draft?.revision || 0) + 1,
                  }));
                  requestAnimationFrame(() =>
                    root.current
                      ?.querySelector<HTMLTextAreaElement>('.showcase-search textarea')
                      ?.focus({ preventScroll: true })
                  );
                }}
              >
                {name}
                <ArrowUpRight size={13} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
        <a className="showcase-scroll-link" href="#showcase-evidence">
          <ArrowDown size={23} aria-hidden="true" />
          <span>{t('向下探索', 'Scroll to explore')}</span>
        </a>
      </section>
      <section
        id="showcase-evidence"
        className="showcase-evidence"
        aria-labelledby="showcase-evidence-title"
      >
        <div className="showcase-evidence-heading">
          <span className="showcase-eyebrow">{t('从原文开始', 'Begin with the source')}</span>
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
            <span>
              {t('年报原文 · p.190', 'Annual report · p.190')}
              <ArrowUpRight size={16} aria-hidden="true" />
            </span>
          </button>
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
        <div className="showcase-process-heading">
          <span className="showcase-eyebrow">
            {t('看懂一家公司的路径', 'A path to understanding a company')}
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
                </span>
                <ArrowUpRight size={25} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="showcase-chapter-preview" aria-hidden="true">
            {chapters.map((chapter, index) => (
              <img
                src={chapter.image}
                key={chapter.title}
                className={activePreview === index ? 'is-active' : ''}
                width={index === 0 ? 1400 : 1032}
                height={index === 0 ? 1004 : 495}
                alt=""
                loading="lazy"
              />
            ))}
          </div>
        </div>
      </section>
      <section className="showcase-ending" aria-labelledby="showcase-ending-title">
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
        <span>析光 / Prispect Lite</span>
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
