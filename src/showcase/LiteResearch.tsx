import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Check,
  FileSearch,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
} from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import type { CompanyResearchRun } from '../../shared/contracts';
import type { AssessmentJudgment } from '../../shared/company-assessment';
import { contextFieldLabels, type CompanyReadingBasis } from '../../shared/company-analysis';
import {
  deriveCompanyFinancialOverview,
  companyOverviewEvidencePeriods,
} from '../../shared/company-financial-overview';
import {
  deriveCompanyResearchBrief,
  deriveCompanyResearchProgress,
} from '../../shared/company-research-view';
import { reportSummarySegments } from '../../shared/company-report-summary';
import { deriveCompanyReportDocument } from '../../shared/company-report-document';
import { companyPath, type ContextAmountField } from '../../shared/company-workspace';
import {
  OPEN_COMPANY_ASSISTANT_EVENT,
  type OpenCompanyAssistantDetail,
} from '../../shared/company-navigation';
import { assessmentSourceHref, knownSourcePage } from '../../shared/source-excerpt-focus';
import { companyEvidenceSourceUrls } from '../../shared/company-source-evidence';
import { api, RequestError, requestErrorText } from '../api';
import { useApp } from '../context';
import { useCompanyRecords } from '../CompanyRecordsContext';
import { CompanyAssistantContext } from '../company-assistant-context';
import {
  cacheCompanyRun,
  readCachedCompanyRun,
  removeCachedCompanyRun,
  COMPANY_CACHE_EVENT,
  type CompanyCacheInvalidation,
} from '../company-run-cache';
import { CompanyContextEvidence } from '../CompanyContextViews';
import { CompanyAssessmentEvidence } from '../CompanyAssessment';
import { date, money } from '../format';
import './showcase.css';
import './lite-research.css';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const chapters = [
  ['lite-judgment', '核心判断', 'The judgment'],
  ['lite-numbers', '关键数字', 'The numbers'],
  ['lite-sources', '回到原文', 'The evidence'],
  ['lite-questions', '接下来问什么', 'The next question'],
] as const;
const activeRun = (run: CompanyResearchRun) =>
  run.status === 'queued' ||
  run.status === 'running' ||
  run.contextStatus === 'loading' ||
  run.assessmentStatus === 'loading';
const researchSupported = (run: CompanyResearchRun) =>
  /^\d{6}$/.test(run.input.securityCode) && run.identity?.exchange !== 'us';
const stageLabels = {
  'not-started': ['未开始', 'Not started'],
  running: ['进行中', 'Running'],
  completed: ['已完成', 'Completed'],
  partial: ['部分完成', 'Partial'],
  failed: ['未完成', 'Incomplete'],
} as const;

/** Saved, owner-scoped public reading only. GET never starts another research job. */
export function LiteResearchPage({ query }: { query: URLSearchParams }) {
  const { user, locale, t, historyNavigation } = useApp();
  const { isCurrentOwner, removeLocal } = useCompanyRecords();
  const { publish } = useContext(CompanyAssistantContext);
  const owner = user?.id || null;
  const id = query.get('run');
  const scope = `${owner || ''}:${id || ''}`;
  const latest = useRef({ owner, id, scope });
  latest.current = { owner, id, scope };
  const request = useRef<AbortController | null>(null);
  const [loaded, setLoaded] = useState<{ scope: string; run: CompanyResearchRun | null }>(() => ({
    scope,
    run: owner && id ? readCachedCompanyRun(owner, id) : null,
  }));
  const run = loaded.scope === scope && loaded.run?.id === id ? loaded.run : null;
  const [failure, setFailure] = useState<{ scope: string; text: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [verified, setVerified] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [pollPaused, setPollPaused] = useState<string | null>(null);
  const [basis, setBasis] = useState<CompanyReadingBasis>('consolidated');
  const [chapter, setChapter] = useState<string>('lite-judgment');
  const [inspected, setInspected] = useState<{
    scope: string;
    generatedAt: string;
    title: string;
    judgment: AssessmentJudgment;
  } | null>(null);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    setBasis('consolidated');
    setChapter('lite-judgment');
    setInspected(null);
  }, [scope]);

  useEffect(() => {
    if (!owner || !id) return;
    const cached = readCachedCompanyRun(owner, id);
    setLoaded((previous) => (previous.scope === scope ? previous : { scope, run: cached }));
    setFailure(null);
    setVerified(null);
    setPollPaused(null);
    setReading(true);
    const controller = new AbortController();
    request.current = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reads = 0;
    const current = () =>
      !controller.signal.aborted && latest.current.scope === scope && isCurrentOwner();
    const load = async () => {
      reads++;
      try {
        const next = await api<CompanyResearchRun>(`/company-runs/${encodeURIComponent(id)}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        if (!current()) return;
        if (next.id !== id)
          throw new RequestError(
            t('返回的研究记录不匹配。', 'The returned research record does not match.')
          );
        setLoaded({ scope, run: next });
        cacheCompanyRun(owner, next);
        setVerified(scope);
        setFailure(null);
        if (researchSupported(next) && activeRun(next)) {
          // Bound status polling; the saved result stays readable after the limit.
          if (reads < 80) timer = setTimeout(() => void load(), 1500);
          else setPollPaused(scope);
        }
      } catch (cause) {
        if (!current()) return;
        if (
          cause instanceof RequestError &&
          ['COMPANY_RUN_NOT_FOUND', 'AUTH_REQUIRED', 'UNAUTHORIZED'].includes(cause.code)
        ) {
          removeCachedCompanyRun(owner, id);
          removeLocal(id);
          setLoaded({ scope, run: null });
          setVerified(null);
        }
        setFailure({
          scope,
          text:
            cause instanceof DOMException && cause.name === 'TimeoutError'
              ? t(
                  '读取研究状态超时，请重新读取。已保存资料仍可继续查看。',
                  'Reading research status timed out. Read again; saved data remains available.'
                )
              : requestErrorText(cause, locale),
        });
      } finally {
        if (current()) setReading(false);
      }
    };
    void load();
    return () => {
      if (timer) clearTimeout(timer);
      controller.abort();
      if (request.current === controller) request.current = null;
    };
  }, [owner, id, scope, locale, version, isCurrentOwner, removeLocal]);

  useEffect(() => {
    const invalidated = (event: Event) => {
      const detail = (event as CustomEvent<CompanyCacheInvalidation>).detail;
      if (detail?.owner !== owner || !id || !detail.ids.includes(id)) return;
      request.current?.abort();
      setLoaded({ scope, run: null });
      setVerified(null);
      setInspected(null);
      setVersion((previous) => previous + 1);
    };
    const updated = (event: Event) => {
      if (event instanceof CustomEvent && event.detail === id)
        setVersion((previous) => previous + 1);
    };
    window.addEventListener(COMPANY_CACHE_EVENT, invalidated);
    window.addEventListener('prispect:company-run-updated', updated);
    return () => {
      window.removeEventListener(COMPANY_CACHE_EVENT, invalidated);
      window.removeEventListener('prispect:company-run-updated', updated);
    };
  }, [owner, id, scope]);

  useEffect(() => {
    if (owner && run && isCurrentOwner()) publish({ owner, run, basis, changeBasis: setBasis });
  }, [owner, run, basis, publish, isCurrentOwner]);

  useEffect(() => {
    if (!run || !root.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setChapter(entry.target.id);
      },
      { rootMargin: '-15% 0px -55% 0px' }
    );
    for (const [anchor] of chapters) {
      const section = root.current.querySelector(`#${anchor}`);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [run?.id]);

  useEffect(() => {
    if (!run || historyNavigation) return;
    const anchor = location.hash.slice(1);
    if (!chapters.some(([id]) => id === anchor)) return;
    const frame = requestAnimationFrame(() => {
      const target = root.current?.querySelector<HTMLElement>(`#${anchor}`);
      if (!target) return;
      setChapter(anchor);
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [run?.id, scope, historyNavigation]);

  useEffect(() => {
    if (!run) return;
    // Saved research arriving, a local basis change or translation can move chapter anchors.
    const frame = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(frame);
  }, [run?.updatedAt, run?.context?.fetchedAt, run?.assessment?.generatedAt, basis, locale]);

  useEffect(() => {
    const expandedForPrint = new Set<HTMLDetailsElement>();
    const prepare = () => {
      root.current
        ?.querySelectorAll<HTMLDetailsElement>(
          '.lite-report-detail:not([open]), .lite-report-metrics:not([open])'
        )
        .forEach((details) => {
          expandedForPrint.add(details);
          details.open = true;
        });
    };
    const restore = () => {
      for (const details of expandedForPrint) if (details.isConnected) details.open = false;
      expandedForPrint.clear();
    };
    window.addEventListener('beforeprint', prepare);
    window.addEventListener('afterprint', restore);
    return () => {
      window.removeEventListener('beforeprint', prepare);
      window.removeEventListener('afterprint', restore);
      restore();
    };
  }, [scope]);

  useGSAP(
    () => {
      if (!run || run.informationGap || !researchSupported(run)) return;
      const media = gsap.matchMedia();
      media.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.lite-title-glyph', {
          yPercent: 118,
          rotation: (index) => (index % 2 ? 6 : -6),
          duration: 0.7,
          stagger: { amount: 0.28 },
          ease: 'power3.out',
        });
        gsap.from('.lite-grade-mark', {
          opacity: 0,
          scale: 0.72,
          rotation: -8,
          duration: 0.9,
          ease: 'power3.out',
          delay: 0.12,
        });
        gsap.from('.lite-dossier > div', {
          x: 18,
          opacity: 0,
          duration: 0.65,
          stagger: 0.07,
          delay: 0.2,
          ease: 'power3.out',
        });
        for (const section of gsap.utils.toArray<HTMLElement>(
          '.lite-chapter:not(:first-of-type)'
        )) {
          const reveals = section.querySelectorAll<HTMLElement>('.lite-reveal');
          gsap.from(reveals, {
            y: 42,
            opacity: 0,
            duration: 0.72,
            stagger: 0.1,
            ease: 'power3.out',
            scrollTrigger: { trigger: section, start: 'top 84%', once: true },
          });
        }
        gsap.from('.lite-report-highlight', {
          y: 28,
          opacity: 0,
          duration: 0.65,
          stagger: 0.1,
          scrollTrigger: { trigger: '.lite-report-highlights', start: 'top 90%', once: true },
        });
        for (const number of gsap.utils.toArray<HTMLElement>('.lite-number dd strong')) {
          gsap.from(number, {
            clipPath: 'inset(0 100% 0 0)',
            duration: 0.72,
            ease: 'power3.out',
            scrollTrigger: { trigger: number, start: 'top 92%', once: true },
          });
        }
      });
      return () => media.revert();
    },
    { scope: root, dependencies: [run?.id, locale], revertOnUpdate: true }
  );

  const overview = useMemo(
    () => (run ? deriveCompanyFinancialOverview(run, basis) : null),
    [run, basis]
  );
  const reportDocument = useMemo(
    () => (run ? deriveCompanyReportDocument(run, basis) : null),
    [run, basis]
  );
  const brief = useMemo(() => (run ? deriveCompanyResearchBrief(run) : null), [run]);
  const progress = useMemo(() => (run ? deriveCompanyResearchProgress(run) : null), [run]);
  const error = failure?.scope === scope ? failure.text : '';

  if (!run || !overview || !reportDocument || !brief || !progress)
    return (
      <article ref={root} className="lite-research lite-empty" data-locale={locale}>
        <p className="lite-kicker">PRISPECT / LITE</p>
        <h1>
          {owner && id && !error
            ? t('正在打开，\n这一家公司。', 'Opening this\ncompany.')
            : owner && id && error
              ? t('这份研究，\n暂时打不开。', 'This research\ncould not be opened.')
              : t('从一家\n公司开始。', 'Start with\na company.')}
        </h1>
        {owner && id && !error && (
          <p role="status">
            <LoaderCircle className="spinner" size={18} aria-hidden="true" />{' '}
            {t('读取已保存的研究记录', 'Reading the saved research')}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="lite-empty-actions">
          {owner && id && error && (
            <button type="button" onClick={() => setVersion((previous) => previous + 1)}>
              <RefreshCw size={17} aria-hidden="true" />
              {t('重新读取', 'Read again')}
            </button>
          )}
          <a href="/#showcase-query">
            {t('查一家新公司', 'Find a company')}
            <ArrowUpRight size={19} aria-hidden="true" />
          </a>
        </div>
      </article>
    );

  const pausedMarket = !run.informationGap && !researchSupported(run);
  if (pausedMarket || (!researchSupported(run) && Boolean(run.input.securityCode)))
    return (
      <article ref={root} className="lite-research lite-empty" data-locale={locale}>
        <p className="lite-kicker">PRISPECT / LITE / {run.input.year}</p>
        <h1>{run.identity?.companyName || run.identity?.shortName || run.input.securityCode}</h1>
        <p role="status">
          {t(
            '当前研究仅支持 A 股上市公司。该市场的新增研究和继续追问已暂停，已保存的研究记录与原文仍可在 Pro 中查看。',
            'Research currently supports mainland A-share companies. New research and follow-up questions for this market are paused; saved records and originals remain available in Pro.'
          )}
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="lite-empty-actions">
          {error && (
            <button
              type="button"
              disabled={reading}
              onClick={() => setVersion((previous) => previous + 1)}
            >
              <RefreshCw size={17} aria-hidden="true" />
              {t('重新读取状态', 'Read status again')}
            </button>
          )}
          <a href={`${companyPath(run.id, 'evidence')}&cached=1&experience=pro`}>
            {t('在 Pro 中查看已保存原文', 'View saved originals in Pro')}
            <ArrowUpRight size={19} aria-hidden="true" />
          </a>
          <a href="/#showcase-query">
            {t('查一家新公司', 'Find a company')}
            <ArrowRight size={19} aria-hidden="true" />
          </a>
        </div>
      </article>
    );
  if (run.informationGap)
    return (
      <article ref={root} className="lite-research lite-empty" data-locale={locale}>
        <p className="lite-kicker">PRISPECT / LITE / {run.input.year}</p>
        <h1>{run.informationGap.name}</h1>
        <p role="status">{t('未匹配到支持的上市主体。', 'No supported listed entity matched.')}</p>
        <p>{run.informationGap.reason}</p>
        {error && <p role="alert">{error}</p>}
        <div className="lite-empty-actions">
          {error && (
            <button
              type="button"
              disabled={reading}
              onClick={() => setVersion((previous) => previous + 1)}
            >
              <RefreshCw size={17} aria-hidden="true" />
              {t('重新读取状态', 'Read status again')}
            </button>
          )}
          <a href="/#showcase-query">
            {t('用证券代码或其他名称再查', 'Try a security code or another name')}
            <ArrowRight size={19} aria-hidden="true" />
          </a>
          <a href={`${companyPath(run.id)}&cached=1&experience=pro`}>
            {t('在 Pro 中查看这份记录', 'View this record in Pro')}
            <ArrowUpRight size={19} aria-hidden="true" />
          </a>
        </div>
      </article>
    );
  const report =
    reportDocument.binding?.reportGeneratedAt === run.assessment?.generatedAt &&
    reportDocument.binding?.reportGeneratedAt
      ? run.assessment
      : undefined;
  const provisional = report?.grade === 'NR' ? reportDocument.provisionalRating : undefined;
  const grade = report ? provisional?.grade || report.grade : 'NR';
  const annual = overview.annual;
  const profitField: ContextAmountField = basis === 'parent' ? 'parentProfit' : 'netProfit';
  const fields: ContextAmountField[] = ['revenue', profitField, 'ocf', 'cash'];
  const ruleLead =
    overview.cards.find((card) => card.status === 'risk') ||
    overview.cards.find((card) => card.status === 'watch') ||
    overview.cards.find((card) => card.status !== 'unknown');
  const language = locale === 'en' ? 'en' : 'zh';
  const headline = reportDocument.headline
    ? reportDocument.headline.text[language]
    : ruleLead
      ? t(...ruleLead.judgment)
      : t('资料还在路上，先保留判断。', 'More evidence is needed before a judgment.');
  const companyName =
    run.identity?.companyName ||
    run.context?.companyName ||
    run.identity?.shortName ||
    run.input.securityCode;
  const summary = reportDocument.summary;
  const summarySegments = summary
    ? reportSummarySegments(summary.text[language], [
        ...reportDocument.summaryHighlights[language],
        ...reportDocument.facts
          .filter((metric) => summary.metricIds.includes(metric.id))
          .map((metric) => metric.display[locale === 'en' ? 1 : 0]),
      ])
    : [];
  const originals = [
    ...new Set(
      (annual?.originalUrl ? [annual.originalUrl] : []).filter((url) => assessmentSourceHref(url))
    ),
  ];
  const acquiredSources = new Map<
    string,
    { href: string; provider: string; fields: ContextAmountField[] }
  >();
  if (annual && overview.state === 'available') {
    for (const field of fields) {
      if (annual.amounts[field] === null) continue;
      for (const provider of ['primary', 'secondary'] as const) {
        for (const href of companyEvidenceSourceUrls(run.context, annual, field, provider)) {
          const receipt = run.context?.sources.find((source) => source.url === href);
          if (receipt && !['available', 'partial'].includes(receipt.status)) continue;
          const source = acquiredSources.get(href);
          if (source) source.fields.push(field);
          else
            acquiredSources.set(href, {
              href,
              provider:
                provider === 'primary' ? t('东方财富', 'Eastmoney') : t('新浪财经', 'Sina Finance'),
              fields: [field],
            });
        }
      }
    }
  }
  const sourceCards = reportDocument.references.flatMap((source) => {
    const href = assessmentSourceHref(source.url, knownSourcePage(source.page));
    return href
      ? [
          {
            id: source.id,
            label: source.label,
            href,
            period: source.period,
            quote: source.quote,
            page: knownSourcePage(source.page),
            kind:
              source.sourceQuality === 'opinion'
                ? t('公开讨论 · 未核实观点', 'Public discussion · unverified opinion')
                : source.sourceQuality === 'headline'
                  ? t('标题线索 · 尚无正文', 'Headline lead · full text unavailable')
                  : source.sourceQuality === 'excerpt'
                    ? t('已取得原文节选', 'Source excerpt retrieved')
                    : t('公开网页字段', 'Public web fields'),
          },
        ]
      : [];
  });
  const reportQuestions = reportDocument.questions.filter(
    (question) =>
      question.binding.runId === run.id &&
      question.binding.securityCode === run.input.securityCode &&
      question.binding.orgId === run.input.orgId &&
      question.binding.year === run.input.year &&
      question.binding.reportGeneratedAt === report?.generatedAt &&
      question.metricIds.every((id) =>
        reportDocument.facts.some((metric) => metric.id === id && metric.status === 'available')
      ) &&
      question.evidenceIds.every((id) =>
        reportDocument.references.some((source) => source.id === id)
      )
  );
  const questions = reportQuestions.length
    ? reportQuestions.map((question) => ({
        id: question.id,
        text: question.text[language],
      }))
    : [
        {
          id: 'lite-current-evidence',
          text: t(
            annual
              ? `请用通俗的话解释 ${run.input.year} 年已取得的财务数据，哪些结论还缺少依据？`
              : `这份研究在 ${run.input.year} 年度缺少哪些资料，下一步应如何核对？`,
            annual
              ? `Explain the acquired ${run.input.year} financial data simply. Which conclusions still lack evidence?`
              : `Which ${run.input.year} annual evidence is missing, and how should it be checked next?`
          ),
        },
        {
          id: 'lite-current-cash',
          text: t(
            `请核对 ${run.input.year} 年的利润与经营现金，缺失或冲突的字段请保留未知。`,
            `Check ${run.input.year} profit and operating cash, keeping missing or conflicting fields unknown.`
          ),
        },
      ];
  const canAsk = Boolean(
    owner &&
      verified === scope &&
      researchSupported(run) &&
      (summary || (overview.state === 'available' && run.context?.status !== 'unavailable'))
  );
  const ask = (question: string) => {
    if (!owner || !canAsk || !isCurrentOwner()) return;
    const detail: OpenCompanyAssistantDetail = {
      owner,
      runId: run.id,
      question,
      basis: reportQuestions.length ? 'consolidated' : basis,
      ...(reportQuestions.length && report ? { reportGeneratedAt: report.generatedAt } : {}),
    };
    window.dispatchEvent(new CustomEvent(OPEN_COMPANY_ASSISTANT_EVENT, { detail }));
  };
  const inspectJudgment = (judgment: AssessmentJudgment, title: string) => {
    if (report) setInspected({ scope, generatedAt: report.generatedAt, judgment, title });
  };
  const reportItems = (
    items: (AssessmentJudgment & { id: string })[],
    title: string,
    className = ''
  ) => (
    <ol className={`lite-report-points ${className}`}>
      {items.map((item, index) => (
        <li key={item.id} data-report-item={item.id}>
          <span className="lite-report-point-index" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div>
            <p>{item.text[language]}</p>
            {report && (item.metricIds.length > 0 || item.evidenceIds.length > 0) && (
              <button
                type="button"
                className="lite-report-evidence"
                onClick={() => inspectJudgment(item, title)}
                aria-label={t('查看依据：', 'Evidence for: ') + item.text[language]}
              >
                <FileSearch size={14} aria-hidden="true" />
                {t('核对依据', 'Check the evidence')}
                <ArrowUpRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
  const reportSections = [
    ['strengths', t('支撑判断的积极信息', 'What supports the judgment'), reportDocument.strengths],
    ['risks', t('需要注意的压力', 'Pressures to investigate'), reportDocument.risks],
    ['actions', t('接下来怎么核查', 'What to check next'), reportDocument.actions],
    [
      'change-conditions',
      t('什么证据会改变判断', 'What evidence would change the judgment'),
      reportDocument.changeConditions,
    ],
  ] as const;
  const linkedFieldCount = new Set([...acquiredSources.values()].flatMap((source) => source.fields))
    .size;
  const chapterHeading = (index: number, heading: ReactNode, description: string) => (
    <header className="lite-chapter-heading lite-reveal">
      <p className="lite-kicker">
        <span>0{index + 1}</span>
        {t(chapters[index][1], chapters[index][2])}
      </p>
      <h2>{heading}</h2>
      <p>{description}</p>
    </header>
  );
  const stepLink = (index: number) => (
    <nav className="lite-chapter-pager" aria-label={t('相邻章节', 'Adjacent chapters')}>
      {index > 0 && (
        <a
          className="lite-next-chapter lite-previous-chapter"
          href={`#${chapters[index - 1][0]}`}
          onClick={() => setChapter(chapters[index - 1][0])}
        >
          <ArrowLeft size={18} aria-hidden="true" />
          <span>
            {t('回看', 'Previous')} · {t(chapters[index - 1][1], chapters[index - 1][2])}
          </span>
        </a>
      )}
      {index < chapters.length - 1 && (
        <a
          className="lite-next-chapter"
          href={`#${chapters[index + 1][0]}`}
          onClick={() => setChapter(chapters[index + 1][0])}
        >
          <span>
            {t('接着看', 'Continue')} · {t(chapters[index + 1][1], chapters[index + 1][2])}
          </span>
          <ArrowDown size={21} aria-hidden="true" />
        </a>
      )}
    </nav>
  );

  return (
    <article
      ref={root}
      className="lite-research"
      data-locale={locale}
      data-testid="lite-research"
      key={scope}
    >
      <nav className="lite-chapter-nav" aria-label={t('阅读章节', 'Reading chapters')}>
        <a
          className="lite-back"
          href="/#showcase-query"
          aria-label={t('查另一家', 'Another company')}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{t('查另一家', 'Another company')}</span>
        </a>
        <div>
          {chapters.map(([anchor, zh, en], index) => (
            <a
              key={anchor}
              href={`#${anchor}`}
              aria-label={t(`第 ${index + 1} 章：${zh}`, `Chapter ${index + 1}: ${en}`)}
              aria-current={chapter === anchor ? 'location' : undefined}
              onClick={() => setChapter(anchor)}
            >
              <span>0{index + 1}</span>
              <span>{t(zh, en)}</span>
            </a>
          ))}
        </div>
        <a className="lite-pro-link" href={`${companyPath(run.id)}&cached=1&experience=pro`}>
          Pro
          <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </nav>

      {(error || pollPaused === scope) && (
        <div className="lite-reading-notice" role={error ? 'alert' : 'status'}>
          <p>
            {error ||
              t(
                '自动读取已暂停，已有资料仍可继续阅读。',
                'Automatic status reads have paused; saved data remains readable.'
              )}
          </p>
          <button
            type="button"
            disabled={reading}
            onClick={() => setVersion((previous) => previous + 1)}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {t('重新读取状态', 'Read status again')}
          </button>
        </div>
      )}

      <section
        className="lite-chapter lite-intro"
        id="lite-judgment"
        tabIndex={-1}
        aria-labelledby="lite-company-title"
      >
        <span className="lite-year-watermark" aria-hidden="true">
          {run.input.year}
        </span>
        <div className="lite-intro-top">
          <p className="lite-kicker">
            PRISPECT / {run.input.securityCode} / {run.input.year}
          </p>
          <span>{t('一家公司，一次看清。', 'One company. A clearer view.')}</span>
        </div>
        <div className="lite-intro-layout">
          <div className="lite-intro-copy">
            <h1 id="lite-company-title" aria-label={companyName}>
              <span className="lite-title-mask">
                <span className="lite-title-reveal" aria-hidden="true">
                  {Array.from(companyName).map((glyph, index) => (
                    <span className="lite-title-glyph" key={`${index}:${glyph}`}>
                      {glyph === ' ' ? '\u00a0' : glyph}
                    </span>
                  ))}
                </span>
              </span>
            </h1>
            <dl className="lite-dossier">
              <div>
                <dt>{t('证券代码', 'Security code')}</dt>
                <dd>{run.input.securityCode}</dd>
              </div>
              <div>
                <dt>{t('阅读年度', 'Annual period')}</dt>
                <dd>{run.input.year}</dd>
              </div>
              <div>
                <dt>{t('报告版本', 'Report version')}</dt>
                <dd>
                  {reportDocument.generatedAt
                    ? date(reportDocument.generatedAt, locale)
                    : t('尚未生成', 'Not generated yet')}
                </dd>
              </div>
            </dl>
            <p className="lite-result-label">
              {reportDocument.mode === 'model'
                ? t('AI 核心判断', 'AI core judgment')
                : report
                  ? t('规则结果', 'Rule results')
                  : t('已取得数据的财务观察', 'Financial observations from acquired data')}{' '}
              ·{' '}
              {report ? t('合并口径', 'Consolidated basis') : t(...contextFieldLabels[profitField])}
            </p>
            <h2 className="lite-headline">{headline}</h2>
            {summary ? (
              <p className="lite-summary">
                {summarySegments.map((segment, index) =>
                  segment.highlight ? (
                    <strong key={index}>{segment.text}</strong>
                  ) : (
                    <span key={index}>{segment.text}</span>
                  )
                )}
              </p>
            ) : (
              <p className="lite-summary">
                {ruleLead
                  ? t(...ruleLead.detail)
                  : t(
                      '已取得的资料在下面。缺少资料的部分，暂不作推断。',
                      'Acquired data appears below. Fields without evidence remain unknown.'
                    )}
              </p>
            )}
            <div className="lite-intro-actions">
              <a href="#lite-numbers">
                {t('往下看，了解为什么', 'Read on to see why')}
                <ArrowDown size={18} aria-hidden="true" />
              </a>
              {summary && report && (
                <button
                  type="button"
                  onClick={() =>
                    inspectJudgment(summary, t('核心判断的依据', 'Evidence for the core judgment'))
                  }
                >
                  <FileSearch size={17} aria-hidden="true" />
                  {t('判断依据', 'Judgment evidence')}
                </button>
              )}
            </div>
          </div>
          <aside
            className="lite-grade"
            aria-label={
              provisional
                ? t('初步财务评级', 'Provisional financial grade')
                : t('财务评级', 'Financial grade')
            }
          >
            <span>
              {provisional
                ? t('初步财务评级', 'Provisional financial grade')
                : t('财务评级', 'Financial grade')}
            </span>
            <strong className="lite-grade-mark" data-grade={grade}>
              {grade}
            </strong>
            <p>
              {provisional
                ? t(
                    `已覆盖 ${provisional.coveredDimensions} / ${provisional.totalDimensions} 个核心维度`,
                    `${provisional.coveredDimensions} / ${provisional.totalDimensions} core dimensions covered`
                  )
                : !report
                  ? t('尚无可用财务评级', 'No financial grade is available yet')
                  : grade === 'NR'
                    ? t('综合评级暂未形成', 'An overall grade is not yet available')
                    : t('所选年度 · 合并口径', 'Selected annual year · consolidated basis')}
            </p>
            {report && <small>{date(report.snapshotFetchedAt, locale)}</small>}
          </aside>
        </div>
        <div className="lite-report-highlights">
          <section className="lite-report-highlight" data-report-section="findings">
            <div className="lite-report-card-heading">
              <Check size={20} aria-hidden="true" />
              <h3>{t('已确认的重点', 'What the evidence supports')}</h3>
            </div>
            {reportDocument.findings.length > 0 ? (
              reportItems(reportDocument.findings, t('已确认的重点', 'Evidence-supported findings'))
            ) : (
              <p className="lite-report-empty">
                {t(
                  '尚未形成有依据的报告重点。已取得的数字可在下一节核对。',
                  'Evidence-backed report findings are not available yet. Check acquired figures in the next chapter.'
                )}
              </p>
            )}
          </section>
          <section className="lite-report-highlight" data-report-section="unknowns">
            <div className="lite-report-card-heading">
              <FileSearch size={20} aria-hidden="true" />
              <h3>{t('还待核查', 'What still needs checking')}</h3>
            </div>
            {reportDocument.unknowns.length > 0 ? (
              reportItems(reportDocument.unknowns, t('还待核查', 'What still needs checking'))
            ) : (
              <p className="lite-report-empty">
                {t(
                  '这份报告没有记录额外的待核查项；仍需结合原文理解其范围。',
                  'No additional unresolved items are recorded in this report. Read the originals to understand its scope.'
                )}
              </p>
            )}
          </section>
        </div>
        {(reportDocument.dimensions.length > 0 ||
          reportSections.some(([, , items]) => items.length > 0)) && (
          <details className="lite-report-detail" onToggle={() => ScrollTrigger.refresh()}>
            <summary>
              <span>
                <small>{t('报告正文', 'THE FULL REPORT')}</small>
                <strong>{t('展开完整分析', 'Read the complete analysis')}</strong>
              </span>
              <ChevronDown size={24} aria-hidden="true" />
            </summary>
            <div className="lite-report-body">
              <div className="lite-report-version">
                <span>
                  {run.input.year} · {t('合并口径', 'Consolidated basis')}
                </span>
                {reportDocument.generatedAt && (
                  <span>
                    {t('报告生成', 'Report generated')} · {date(reportDocument.generatedAt, locale)}
                  </span>
                )}
                {reportDocument.snapshotFetchedAt && (
                  <span>
                    {t('资料快照', 'Source snapshot')} ·{' '}
                    {date(reportDocument.snapshotFetchedAt, locale)}
                  </span>
                )}
              </div>
              {reportDocument.dimensions.length > 0 && (
                <section className="lite-report-section" data-report-section="dimensions">
                  <h3>{t('逐个维度，理解判断', 'Understand each dimension')}</h3>
                  <div className="lite-report-dimensions">
                    {reportDocument.dimensions.map((dimension, index) => (
                      <article key={dimension.id} data-status={dimension.status}>
                        <span className="lite-report-dimension-index" aria-hidden="true">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <h4>{t(...dimension.label)}</h4>
                        <p>{dimension.judgment.text[language]}</p>
                        {report &&
                          (dimension.judgment.metricIds.length > 0 ||
                            dimension.judgment.evidenceIds.length > 0) && (
                            <button
                              className="lite-report-evidence"
                              type="button"
                              onClick={() =>
                                inspectJudgment(dimension.judgment, t(...dimension.label))
                              }
                              aria-label={t('查看依据：', 'Evidence for: ') + t(...dimension.label)}
                            >
                              <FileSearch size={14} aria-hidden="true" />
                              {t('核对依据', 'Check the evidence')}
                              <ArrowUpRight size={14} aria-hidden="true" />
                            </button>
                          )}
                      </article>
                    ))}
                  </div>
                </section>
              )}
              {reportSections.map(
                ([sectionId, title, items]) =>
                  items.length > 0 && (
                    <section
                      className="lite-report-section"
                      data-report-section={sectionId}
                      key={sectionId}
                    >
                      <h3>{title}</h3>
                      {reportItems(items, title)}
                    </section>
                  )
              )}
              {reportDocument.facts.length > 0 && (
                <details
                  className="lite-report-metrics"
                  data-report-section="metrics"
                  onToggle={() => ScrollTrigger.refresh()}
                >
                  <summary>
                    <span>{t('核对完整指标与计算口径', 'Inspect all metrics and formulas')}</span>
                    <ChevronDown size={18} aria-hidden="true" />
                  </summary>
                  <dl>
                    {reportDocument.facts.map((metric) => (
                      <div key={metric.id} data-status={metric.status}>
                        <dt>{t(...metric.label)}</dt>
                        <dd>{t(...metric.display)}</dd>
                        {metric.unit === 'CNY' && metric.value !== null && (
                          <p className="lite-report-exact">{metric.value} CNY</p>
                        )}
                        <p>{t(...metric.formula)}</p>
                        {report && metric.status === 'available' && (
                          <button
                            className="lite-report-evidence"
                            type="button"
                            onClick={() =>
                              inspectJudgment(
                                {
                                  text: { zh: metric.label[0], en: metric.label[1] },
                                  metricIds: [metric.id],
                                  evidenceIds: metric.evidenceIds,
                                },
                                t(...metric.label)
                              )
                            }
                            aria-label={t('查看依据：', 'Evidence for: ') + t(...metric.label)}
                          >
                            <FileSearch size={14} aria-hidden="true" />
                            {t('核对依据', 'Check the evidence')}
                          </button>
                        )}
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </div>
          </details>
        )}
        <div className="lite-progress" aria-label={t('实际研究进度', 'Recorded research progress')}>
          <span>{t(...progress.label)}</span>
          <ol>
            {progress.stages.map((stage, index) => (
              <li key={stage.id} data-status={stage.status} title={t(...stage.summary)}>
                <span>0{index + 1}</span>
                <strong>{t(...stage.label)}</strong>
                <small>{t(stageLabels[stage.status][0], stageLabels[stage.status][1])}</small>
              </li>
            ))}
          </ol>
        </div>
        {(brief.warnings.length > 0 || run.contextError || run.assessmentError || run.error) && (
          <div className="lite-scope-notes" role="status">
            {brief.warnings.map((warning, index) => (
              <p key={index}>{t(...warning)}</p>
            ))}
            {run.contextError && <p>{run.contextError}</p>}
            {run.assessmentError && <p>{run.assessmentError}</p>}
            {run.error && <p>{run.error}</p>}
          </div>
        )}
        {stepLink(0)}
      </section>

      <section
        className="lite-chapter lite-number-chapter"
        id="lite-numbers"
        tabIndex={-1}
        aria-labelledby="lite-numbers-heading"
      >
        {chapterHeading(
          1,
          <span id="lite-numbers-heading">
            {t('赚到的钱，', 'Money earned.')}
            <br />
            {t('留下了多少？', 'Cash retained?')}
          </span>,
          t(
            `${run.input.year} 年这一年的经营，先看四个数字。`,
            `Start with four figures from ${run.input.year}.`
          )
        )}
        <div className="lite-number-controls lite-reveal">
          <span>
            {run.input.year} · {t('年度 · 人民币', 'Annual period · CNY')}
          </span>
          <div role="group" aria-label={t('利润口径', 'Profit basis')}>
            <button
              type="button"
              aria-pressed={basis === 'consolidated'}
              onClick={() => setBasis('consolidated')}
            >
              {t('合并净利润', 'Consolidated profit')}
            </button>
            <button
              type="button"
              aria-pressed={basis === 'parent'}
              onClick={() => setBasis('parent')}
            >
              {t('归母净利润', 'Attributable profit')}
            </button>
          </div>
        </div>
        <dl className="lite-numbers-grid">
          {fields.map((field, index) => {
            const amount = annual?.amounts[field] ?? null;
            const original = run.context?.financials.find(
              (row) => row.annual && row.period === `${run.input.year}-12-31`
            );
            const conflict = run.context?.comparisons.some(
              (check) =>
                check.period === `${run.input.year}-12-31` &&
                check.field === field &&
                !check.matches
            );
            return (
              <div
                key={field}
                className="lite-number lite-reveal"
                data-field={field}
                data-available={amount !== null}
              >
                <dt>
                  <span>0{index + 1}</span>
                  {t(...contextFieldLabels[field])}
                </dt>
                <dd title={amount === null ? undefined : `${money(amount, locale, false)} CNY`}>
                  <strong>{amount === null ? '—' : money(amount, locale)}</strong>
                  {amount !== null && <span>{t('元', 'CNY')}</span>}
                </dd>
                <p>
                  {amount === null
                    ? conflict
                      ? t('来源有差异，暂不采用', 'Source conflict; value withheld')
                      : t('未取得或待核对', 'Unavailable or needs review')
                    : money(amount, locale, false) + ' CNY'}
                </p>
                {original && overview.state === 'available' && (
                  <CompanyContextEvidence
                    key={`${scope}:${run.context?.fetchedAt}:${field}`}
                    snapshot={run.context}
                    row={original}
                    fields={[field]}
                    formula={t(
                      `${run.input.year} 年度；${field === 'cash' ? '期末余额' : '报告期累计金额'}。`,
                      `${run.input.year} annual period; ${field === 'cash' ? 'period-end balance' : 'amount over the reporting period'}.`
                    )}
                  >
                    {t('这个数字从哪来', 'Where this figure comes from')}
                  </CompanyContextEvidence>
                )}
              </div>
            );
          })}
        </dl>
        {overview.state === 'mismatch' && (
          <p className="lite-scope-notes" role="status">
            {t(
              '来源主体或范围不匹配，相关数字与判断暂不采用。',
              'Source issuer or scope does not match; dependent values and judgments are withheld.'
            )}
          </p>
        )}
        {overview.state === 'available' && !annual && (
          <p className="lite-scope-notes" role="status">
            {t(
              `尚未取得 ${run.input.year} 年度数据；本节数值保持未知。`,
              `${run.input.year} annual data has not been acquired; the values in this chapter remain unknown.`
            )}
          </p>
        )}
        <div className="lite-observations lite-reveal">
          {overview.cards.map((card) => {
            const rows = companyOverviewEvidencePeriods(run.context, card.evidence);
            const row = rows.at(-1);
            return (
              <article key={card.id}>
                <h3>{t(...card.question)}</h3>
                <strong>{t(...card.judgment)}</strong>
                <p>{t(...card.detail)}</p>
                {row && (
                  <CompanyContextEvidence
                    key={`${scope}:${run.context?.fetchedAt}:${card.id}`}
                    snapshot={run.context}
                    row={row}
                    periods={rows}
                    fields={card.evidence.fields}
                    formula={t(...card.evidence.formula)}
                  >
                    {t('看数据与计算', 'Data and calculation')}
                  </CompanyContextEvidence>
                )}
              </article>
            );
          })}
        </div>
        <p className="lite-snapshot-note">
          {t('本节资料快照', 'Data snapshot for this chapter')} ·{' '}
          {run.context ? date(run.context.fetchedAt, locale) : t('尚未取得', 'Not yet acquired')}
        </p>
        {stepLink(1)}
      </section>

      <section
        className="lite-chapter lite-evidence-chapter"
        id="lite-sources"
        tabIndex={-1}
        aria-labelledby="lite-sources-heading"
      >
        {chapterHeading(
          2,
          <span id="lite-sources-heading">
            {t('每个判断，', 'Every judgment.')}
            <br />
            {t('都有来处。', 'Trace its source.')}
          </span>,
          t(
            '顺着线索，回到支撑判断的公开资料。',
            'Follow the evidence back to the acquired public sources.'
          )
        )}
        <div className="lite-evidence-layout lite-reveal">
          <aside className="lite-source-register" aria-labelledby="lite-source-register-title">
            <span className="lite-source-register-kicker">
              <FileSearch size={20} aria-hidden="true" />
              {t('来源登记', 'SOURCE REGISTER')}
            </span>
            <h3 id="lite-source-register-title">{run.input.year}</h3>
            <p>
              {t(
                '每条出处，连到它支撑的内容。',
                'Each source connects to the content it supports.'
              )}
            </p>
            <dl className="lite-source-register-facts">
              <div>
                <dt>{t('已链接的分析出处', 'Linked analysis references')}</dt>
                <dd>{sourceCards.length}</dd>
              </div>
              <div>
                <dt>{t('有来源链接的本年字段', 'Annual fields with source links')}</dt>
                <dd>{linkedFieldCount}</dd>
              </div>
            </dl>
            {acquiredSources.size > 0 && (
              <ol
                className="lite-source-connections"
                aria-label={t('本年度字段与来源的对应', 'Annual fields and their sources')}
              >
                {[...acquiredSources.values()].map((source) => (
                  <li key={source.href}>
                    <span>
                      {source.fields.map((field) => t(...contextFieldLabels[field])).join(' / ')}
                    </span>
                    <ArrowRight size={18} aria-hidden="true" />
                    <a href={source.href} target="_blank" rel="noopener noreferrer">
                      {source.provider}
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ol>
            )}
            <p className="lite-source-register-note">
              {t(
                '链接数量只描述本页已记录的出处，不代表独立性或可信度。网页字段仍需核对原件。',
                'Counts describe recorded links on this page, not independence or confidence. Public web fields still need original-document checks.'
              )}
            </p>
          </aside>
          <div className="lite-source-list">
            {sourceCards.length > 0 && (
              <p className="lite-source-group-label">
                {report
                  ? t('报告中的引用出处', 'References used in the report')
                  : t(
                      '已取得字段与观察的出处',
                      'Sources for acquired fields and observations'
                    )}{' '}
                ·{' '}
                {reportDocument.snapshotFetchedAt
                  ? date(reportDocument.snapshotFetchedAt, locale)
                  : ''}
              </p>
            )}
            {sourceCards.map((source, index) => (
              <a key={source.id} href={source.href} target="_blank" rel="noopener noreferrer">
                <span className="lite-source-index">0{index + 1}</span>
                <div>
                  <small>
                    {source.kind}
                    {source.period ? ` · ${source.period}` : ''}
                  </small>
                  <h3>{source.label}</h3>
                  <div className="lite-source-print">
                    {source.page && (
                      <p>
                        {t('原文页码', 'Source page')} · {source.page}
                      </p>
                    )}
                    {source.quote && <blockquote>{source.quote}</blockquote>}
                    <p>{source.href}</p>
                  </div>
                </div>
                <ArrowUpRight size={21} aria-hidden="true" />
              </a>
            ))}
            {(originals.length > 0 || acquiredSources.size > 0) && (
              <p className="lite-source-group-label">
                {run.input.year} ·{' '}
                {t('本年度数字的来源', 'Sources for the selected year’s figures')}
                {run.context ? ` · ${date(run.context.fetchedAt, locale)}` : ''}
              </p>
            )}
            {originals.map((href) => (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer">
                <FileSearch size={22} aria-hidden="true" />
                <div>
                  <small>
                    {run.input.year} ·{' '}
                    {t('已记录的披露原文链接', 'Recorded original disclosure link')}
                  </small>
                  <h3>{t('打开这一年的原文', 'Open the selected year’s original')}</h3>
                </div>
                <ArrowUpRight size={21} aria-hidden="true" />
              </a>
            ))}
            {acquiredSources.size > 0 && (
              <p className="lite-source-group-label">
                {t(
                  '网页字段尚未逐项核对原件。',
                  'Public web fields have not been individually checked against the original.'
                )}
              </p>
            )}
            {[...acquiredSources.values()].map((source) => (
              <a key={source.href} href={source.href} target="_blank" rel="noopener noreferrer">
                <FileSearch size={22} aria-hidden="true" />
                <div>
                  <small>
                    {source.provider} · {run.input.year} ·{' '}
                    {t('结构化财务数据', 'Structured financial data')}
                  </small>
                  <h3>
                    {source.fields.map((field) => t(...contextFieldLabels[field])).join(' / ')}
                  </h3>
                </div>
                <ArrowUpRight size={21} aria-hidden="true" />
              </a>
            ))}
            {!sourceCards.length && !originals.length && !acquiredSources.size && (
              <p className="lite-source-empty">
                {t(
                  '尚未取得支撑核心判断的原文。已取得的字段仍可在上一节逐项核对。',
                  'Original evidence for the core judgment is not yet available. Acquired fields can still be checked in the previous chapter.'
                )}
              </p>
            )}
            <a
              className="lite-source-full"
              href={`${companyPath(run.id, 'sources')}&cached=1&experience=pro`}
            >
              <span>{t('在 Pro 中核对全部来源', 'Check all sources in Pro')}</span>
              <ArrowRight size={19} aria-hidden="true" />
            </a>
          </div>
        </div>
        {report && (
          <p className="lite-snapshot-note">
            {t('判断所用资料快照', 'Snapshot supporting the judgment')} ·{' '}
            {date(report.snapshotFetchedAt, locale)}
          </p>
        )}
        {stepLink(2)}
      </section>

      <section
        className="lite-chapter lite-question-chapter"
        id="lite-questions"
        tabIndex={-1}
        aria-labelledby="lite-questions-heading"
      >
        {chapterHeading(
          3,
          <span id="lite-questions-heading">
            {t('看懂之后，', 'Now you see it.')}
            <br />
            {t('再问一步。', 'Ask one step further.')}
          </span>,
          t(
            '选择一个问题，基于这份研究继续追问。',
            'Choose a question to continue with this research.'
          )
        )}
        <div className="lite-question-list lite-reveal">
          {questions.map((question, index) => (
            <button
              key={question.id}
              type="button"
              disabled={!canAsk}
              onClick={() => ask(question.text)}
            >
              <span>0{index + 1}</span>
              <strong>{question.text}</strong>
              <MessageCircle size={22} aria-hidden="true" />
            </button>
          ))}
        </div>
        <p className="lite-snapshot-note" role={!canAsk ? 'status' : undefined}>
          {canAsk
            ? t(
                `点击问题即提交给析光助手，沿用这份研究的 ${run.input.year} 年度、${reportQuestions.length || basis === 'consolidated' ? '合并口径' : '归母口径'}${reportQuestions.length ? '及已保存报告版本' : ''}。`,
                `Selecting a question submits it to the Prispect assistant with this research’s ${run.input.year} annual period, ${reportQuestions.length || basis === 'consolidated' ? 'consolidated' : 'attributable'} basis${reportQuestions.length ? ' and saved report version' : ''}.`
              )
            : verified !== scope
              ? error
                ? t(
                    '暂未能确认这份研究记录。重新读取状态后，可继续追问；已有资料仍可阅读。',
                    'This research record could not be confirmed. Read its status again to enable follow-ups; saved data remains readable.'
                  )
                : t(
                    '正在确认这份研究记录，确认后可继续追问。',
                    'Confirming this research record before follow-up questions become available.'
                  )
              : t(
                  '取得可用的公开资料后，可基于这份研究继续追问。',
                  'Follow-up questions become available when usable public sources have been acquired.'
                )}
        </p>
        {stepLink(3)}
        <div className="lite-finish lite-reveal">
          <p>{t('继续核对趋势与数据口径', 'Continue checking trends and data scope')}</p>
          <a href={`${companyPath(run.id)}&cached=1&experience=pro`}>
            {t('进入 Pro，逐项核对', 'Open Pro to inspect each field')}
            <ArrowUpRight size={22} aria-hidden="true" />
          </a>
          <a href="/#showcase-query">
            {t('再看一家公司', 'Read another company')}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
        <footer className="lite-reading-footer">
          <span>析光 / Prispect</span>
          <a href="/docs/methodology">
            {t('评级与方法', 'Grades and methodology')}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </footer>
      </section>
      {inspected?.scope === scope && inspected.generatedAt === report?.generatedAt && report && (
        <CompanyAssessmentEvidence
          key={`${scope}:${report.generatedAt}`}
          assessment={report}
          title={inspected.title}
          judgment={inspected.judgment}
          onClose={() => setInspected(null)}
        />
      )}
    </article>
  );
}
