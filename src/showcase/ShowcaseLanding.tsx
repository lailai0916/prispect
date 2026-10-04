import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, FileSearch, Search, Workflow } from 'lucide-react';
import { Dialog } from '../components';
import { useApp } from '../context';
import { landingExample } from '../cinematic/landing-content';
import { ShowcaseSearch } from './ShowcaseSearch';
import { ShowcaseBrandHero } from './ShowcaseBrandHero';
import { ShowcaseSignalStage } from './ShowcaseSignalStage';
import { ShowcaseWorkspaceField } from './ShowcaseWorkspaceField';
import { useShowcaseMotion } from './useShowcaseMotion';
import './lite-hermes-theme.css';
import './showcase-workspace.css';

type HomeMode = 'search' | 'example' | 'guide';

function exactAmount(value: string, english: boolean) {
  const [whole, fraction = '00'] = value.split('.');
  return `${new Intl.NumberFormat(english ? 'en-US' : 'zh-CN').format(BigInt(whole))}.${fraction.padEnd(2, '0')}`;
}

function EvidenceOriginals() {
  const { t, locale } = useApp();
  return (
    <div className="showcase-originals lite-search-originals">
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
            <dd>{exactAmount(value, locale === 'en')} CNY</dd>
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
      <a href={landingExample.source.url} target="_blank" rel="noreferrer">
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
  const { t, locale, navigate, historyNavigation } = useApp();
  const root = useRef<HTMLDivElement>(null);
  const exampleHeading = useRef<HTMLHeadingElement>(null);
  const guideHeading = useRef<HTMLHeadingElement>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [scanPosition, setScanPosition] = useState(52);
  const requestedView = query?.get('view');
  const requestedAnchor = typeof window === 'undefined' ? '' : window.location.hash;
  const mode: HomeMode =
    requestedView === 'example'
      ? 'example'
      : requestedView === 'guide'
        ? 'guide'
        : requestedAnchor === '#showcase-evidence'
          ? 'example'
          : 'search';
  const requestedChannel = query?.get('channel');
  const channel =
    requestedChannel === 'public' ||
    requestedChannel === 'reputation' ||
    requestedChannel === 'original'
      ? requestedChannel
      : 'finance';
  const initialScene = requestedChannel === 'risk' ? 1 : 0;
  const pageHref = (view: HomeMode, nextChannel?: string) => {
    const parameters = new URLSearchParams(query);
    parameters.delete('view');
    parameters.delete('channel');
    parameters.set('view', view);
    if (nextChannel) parameters.set('channel', nextChannel);
    return `/${parameters.size ? `?${parameters}` : ''}`;
  };
  useShowcaseMotion(root, locale, mode);
  useEffect(() => {
    let frame = 0;
    const followAnchor = () => {
      if (historyNavigation) return;
      const anchor = window.location.hash.slice(1);
      if (!['showcase-query', 'showcase-evidence'].includes(anchor)) return;
      if (anchor === 'showcase-evidence' && (mode !== 'example' || requestedView !== 'example')) {
        navigate(pageHref('example', 'finance'));
        return;
      }
      if (anchor === 'showcase-query' && (mode !== 'search' || requestedView !== 'search')) {
        navigate(`${pageHref('search')}#showcase-query`);
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target =
          anchor === 'showcase-query'
            ? root.current?.querySelector<HTMLTextAreaElement>('.showcase-search textarea')
            : exampleHeading.current;
        target?.focus({ preventScroll: true });
      });
    };
    followAnchor();
    window.addEventListener('hashchange', followAnchor);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', followAnchor);
    };
  }, [historyNavigation, mode, navigate, requestedView]);
  useEffect(() => {
    setSourceOpen(false);
    if (historyNavigation || mode === 'search') return;
    const frame = requestAnimationFrame(() => {
      (mode === 'example' ? exampleHeading.current : guideHeading.current)?.focus({
        preventScroll: true,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [mode, historyNavigation]);

  const modes = [
    { id: 'search' as const, label: t('查公司', 'Company search'), icon: Search },
    { id: 'example' as const, label: t('读样例', 'Evidence example'), icon: FileSearch },
    { id: 'guide' as const, label: t('阅读路径', 'Reading guide'), icon: Workflow },
  ];
  const guide = [
    {
      title: t('确认你要看的公司', 'Confirm the company'),
      text: t(
        '输入公司名称或股票代码，从候选主体中选择，再指定年报年度。',
        'Enter a company name or security code, choose the matched entity and select an annual year.'
      ),
      label: t('主体与年度', 'ENTITY / YEAR'),
    },
    {
      title: t('先看结论，再追数字', 'Read the findings, then the figures'),
      text: t(
        '打开同一份研究记录，查看已取得的财务数据、财务观察和已保存报告；资料不足的部分保持待核查。',
        'Open the same research record to read acquired financial data, observations and a saved report. Missing information remains unresolved.'
      ),
      label: t('研究报告', 'RESEARCH REPORT'),
    },
    {
      title: t('点开依据，继续问', 'Open the evidence and ask next'),
      text: t(
        '从具体判断或金额打开它自己的来源，核对主体、年度与口径，再带着这份报告继续提问。',
        'Open the source attached to a claim or amount, check entity, year and basis, then ask with this report as context.'
      ),
      label: t('来源与后续问题', 'SOURCES / NEXT QUESTIONS'),
    },
  ];

  return (
    <div
      ref={root}
      className="showcase-home showcase-hermes"
      data-locale={locale}
      data-home-mode={mode}
    >
      <ShowcaseWorkspaceField />
      <div className="lite-search-atmosphere" aria-hidden="true" />
      <div className="lite-search-main">
        {mode === 'search' && <ShowcaseBrandHero />}
        <nav className="lite-search-modes" aria-label={t('Lite 入口', 'Lite destinations')}>
          {modes.map(({ id, label, icon: Icon }) => (
            <a key={id} href={pageHref(id)} aria-current={mode === id ? 'page' : undefined}>
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <section
          className="lite-search-view"
          hidden={mode !== 'search'}
          aria-labelledby="showcase-title"
        >
          <ShowcaseSearch query={query} connectionError={connectionError} />
          <p className="lite-search-coverage">
            {t(
              '支持 A 股上市主体 · 财务、公开线索与来源一起读',
              'A-share issuers · financials, public leads and their sources'
            )}
          </p>
          <a className="lite-search-back" href="/companies/compare">
            {t('两家公司，并排看', 'Compare two companies side by side')}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </section>
        {mode === 'example' && (
          <section
            id="showcase-evidence"
            className="lite-search-detail lite-search-example"
            aria-labelledby="lite-example-title"
          >
            <header className="lite-search-detail-heading">
              <a className="lite-search-back" href={pageHref('search')}>
                <ArrowLeft size={16} aria-hidden="true" />
                {t('返回查询', 'Back to search')}
              </a>
              <p className="lite-search-eyebrow">HISTORICAL EXAMPLE / 2025</p>
              <h1 id="lite-example-title" ref={exampleHeading} tabIndex={-1}>
                {t('线索散落各处。', 'The clues are scattered.')}
                <br />
                {t('把它们连起来。', 'Connect them.')}
              </h1>
              <p>
                {t(
                  '从财务、公开记录到口碑，换一个问题，就多看见一层。',
                  'From financials to public records and reputation, a different question reveals another layer.'
                )}
              </p>
            </header>
            <ShowcaseSignalStage
              key={`${channel}-${initialScene}`}
              initialChannel={channel}
              initialScene={initialScene}
              onOpenSource={() => setSourceOpen(true)}
            />
            <details className="lite-search-scanner-panel">
              <summary>
                {t('对照第 190 页与第 191 页', 'Compare original pages 190 and 191')}
                <ArrowUpRight size={17} aria-hidden="true" />
              </summary>
              <p>
                {t(...landingExample.notices.sample)} · {t(...landingExample.notices.scope)}
              </p>
              <div
                className="showcase-source-scanner lite-search-scanner"
                style={{ '--scan-position': `${scanPosition}%` } as CSSProperties}
              >
                <button
                  type="button"
                  className="showcase-source-sheet"
                  onClick={() => setSourceOpen(true)}
                  aria-label={t(
                    '查看松原安全 2025 年报原件',
                    'View Songyuan’s original 2025 report'
                  )}
                >
                  <img
                    src={landingExample.source.crops[0].src}
                    width={landingExample.source.crops[0].width}
                    height={landingExample.source.crops[0].height}
                    alt={t(...landingExample.source.crops[0].alt)}
                    loading="lazy"
                  />
                  <img
                    className="lite-search-scanner-overlay"
                    src={landingExample.source.crops[1].src}
                    width={landingExample.source.crops[1].width}
                    height={landingExample.source.crops[1].height}
                    alt={t(...landingExample.source.crops[1].alt)}
                    loading="lazy"
                  />
                  <span className="lite-search-scan-line" aria-hidden="true" />
                </button>
                <label className="showcase-scan-control">
                  <span>{t('拖动展示分界', 'Slide the reveal boundary')}</span>
                  <input
                    type="range"
                    min="8"
                    max="92"
                    value={scanPosition}
                    onChange={(event) => setScanPosition(Number(event.target.value))}
                    aria-label={t(
                      '调整年报第 190 页与第 191 页的展示分界',
                      'Adjust the reveal between annual-report pages 190 and 191'
                    )}
                    aria-describedby="showcase-scan-note"
                  />
                  <span>p.190 ↔ p.191</span>
                </label>
                <p id="showcase-scan-note">
                  {t('两页独立原文，行位置不对应。', 'Separate original pages; rows do not align.')}
                </p>
              </div>
            </details>
          </section>
        )}
        {mode === 'guide' && (
          <section
            className="lite-search-detail lite-search-guide"
            aria-labelledby="lite-guide-title"
          >
            <header className="lite-search-detail-heading">
              <a className="lite-search-back" href={pageHref('search')}>
                <ArrowLeft size={16} aria-hidden="true" />
                {t('返回查询', 'Back to search')}
              </a>
              <p className="lite-search-eyebrow">READING PATH / FOLLOW THE EVIDENCE</p>
              <h1 id="lite-guide-title" ref={guideHeading} tabIndex={-1}>
                {t('一家公司，三步读懂。', 'Three steps into a company.')}
              </h1>
              <p>
                {t(
                  '从你关心的公司开始，把判断与依据连起来。',
                  'Start with the company you care about and connect the findings to their evidence.'
                )}
              </p>
            </header>
            <ol className="lite-search-guide-cards">
              {guide.map((item, index) => (
                <li key={item.title} data-lite-card>
                  <span className="lite-search-step">0{index + 1}</span>
                  <div>
                    <small>{item.label}</small>
                    <h2>{item.title}</h2>
                    <p>{item.text}</p>
                  </div>
                  <ArrowUpRight size={20} aria-hidden="true" />
                </li>
              ))}
            </ol>
            <div className="lite-search-guide-actions">
              <a href={`${pageHref('search')}#showcase-query`}>
                {t('查一家公司', 'Find a company')}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
              <a href="/docs/methodology">
                {t('阅读研究方法', 'Read the methodology')}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
          </section>
        )}
      </div>
      <footer className="showcase-footer lite-search-footer">
        <span>© 2026 析光 / Prispect Lite</span>
        <div>
          <a href="/docs/guide">{t('使用指南', 'Guide')}</a>
          <a href="/docs/privacy">{t('隐私', 'Privacy')}</a>
          <a href="/docs/terms">{t('条款', 'Terms')}</a>
        </div>
      </footer>
      {sourceOpen && (
        <Dialog
          wide
          title={t('松原安全 · 2025 年报原件', 'Songyuan · original 2025 annual report')}
          className="showcase-source-dialog lite-hermes-dialog"
          onClose={() => setSourceOpen(false)}
        >
          <EvidenceOriginals />
        </Dialog>
      )}
    </div>
  );
}
