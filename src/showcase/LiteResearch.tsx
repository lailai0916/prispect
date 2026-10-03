import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
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
import { companyReportCore } from '../../shared/company-report-summary';
import { companyPath, type ContextAmountField } from '../../shared/company-workspace';
import {
  OPEN_COMPANY_ASSISTANT_EVENT,
  type OpenCompanyAssistantDetail,
} from '../../shared/company-navigation';
import { assessmentSourceHref, knownSourcePage } from '../../shared/source-excerpt-focus';
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
  const { user, locale, t } = useApp();
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
          signal: controller.signal,
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
        setFailure({ scope, text: requestErrorText(cause, locale) });
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

  useGSAP(
    () => {
      if (!run) return;
      const media = gsap.matchMedia();
      media.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.lite-title-reveal', {
          yPercent: 108,
          rotationX: -35,
          duration: 0.85,
          stagger: 0.1,
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
        for (const section of gsap.utils.toArray<HTMLElement>(
          '.lite-chapter:not(:first-of-type)'
        )) {
          gsap.from(section.querySelectorAll('.lite-reveal'), {
            y: 42,
            opacity: 0,
            duration: 0.72,
            stagger: 0.1,
            ease: 'power3.out',
            scrollTrigger: { trigger: section, start: 'top 84%', once: true },
          });
        }
      });
      return () => media.revert();
    },
    { scope: root, dependencies: [run?.id], revertOnUpdate: true }
  );

  const overview = useMemo(
    () => (run ? deriveCompanyFinancialOverview(run, basis) : null),
    [run, basis]
  );
  const core = useMemo(() => (run ? companyReportCore(run, locale) : null), [run, locale]);
  const brief = useMemo(() => (run ? deriveCompanyResearchBrief(run) : null), [run]);
  const progress = useMemo(() => (run ? deriveCompanyResearchProgress(run) : null), [run]);
  const error = failure?.scope === scope ? failure.text : '';

  if (!run || !overview || !core || !brief || !progress)
    return (
      <article ref={root} className="lite-research lite-empty" data-locale={locale}>
        <p className="lite-kicker">PRISPECT / LITE</p>
        <h1>
          {owner && id && reading
            ? t('正在打开，\n这一家公司。', 'Opening this\ncompany.')
            : t('从一家\n公司开始。', 'Start with\na company.')}
        </h1>
        {owner && id && reading && (
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
          <a href={`${companyPath(run.id, 'evidence')}&experience=pro`}>
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
  const reportUsable = progress.snapshot !== 'mismatch' && !run.informationGap;
  const report = reportUsable ? run.assessment : undefined;
  const provisional = report?.grade === 'NR' ? brief.provisionalRating : undefined;
  const grade = report ? provisional?.grade || report.grade : 'NR';
  const annual = overview.annual;
  const profitField: ContextAmountField = basis === 'parent' ? 'parentProfit' : 'netProfit';
  const fields: ContextAmountField[] = ['revenue', profitField, 'ocf', 'cash'];
  const ruleLead =
    overview.cards.find((card) => card.status === 'risk') ||
    overview.cards.find((card) => card.status === 'watch') ||
    overview.cards.find((card) => card.status !== 'unknown');
  const headline = report
    ? brief.headline.text[locale === 'en' ? 'en' : 'zh']
    : ruleLead
      ? t(...ruleLead.judgment)
      : t('资料还在路上，先保留判断。', 'More evidence is needed before a judgment.');
  const companyName =
    run.identity?.companyName || run.context?.companyName || run.input.securityCode;
  const summaryEvidence =
    report && core.summary
      ? new Set([
          ...core.summary.evidenceIds,
          ...report.metrics
            .filter((metric) => core.summary!.metricIds.includes(metric.id))
            .flatMap((metric) => metric.evidenceIds),
        ])
      : new Set<string>();
  const boundSources =
    report?.evidence.filter((source) => summaryEvidence.has(source.id)).slice(0, 4) || [];
  const originals = [
    ...new Set(
      (annual?.originalUrl ? [annual.originalUrl] : []).filter((url) => assessmentSourceHref(url))
    ),
  ];
  const sourceCards = boundSources.flatMap((source) => {
    const href = assessmentSourceHref(source.url, knownSourcePage(source.page));
    return href
      ? [
          {
            id: source.id,
            label: source.label,
            href,
            period: source.period,
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
  const questions = core.questions.length
    ? core.questions
    : [
        {
          id: 'lite-current-evidence',
          text: t(
            `请用通俗的话解释 ${run.input.year} 年已取得的财务数据，哪些结论还缺少依据？`,
            `Explain the acquired ${run.input.year} financial data simply. Which conclusions still lack evidence?`
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
  const ask = (question: string) => {
    if (!owner || verified !== scope || !researchSupported(run) || !isCurrentOwner()) return;
    const detail: OpenCompanyAssistantDetail = {
      owner,
      runId: run.id,
      question,
      basis: core.summary ? 'consolidated' : basis,
      ...(core.summary && report ? { reportGeneratedAt: report.generatedAt } : {}),
    };
    window.dispatchEvent(new CustomEvent(OPEN_COMPANY_ASSISTANT_EVENT, { detail }));
  };
  const inspect = () => {
    if (report && core.summary)
      setInspected({ scope, generatedAt: report.generatedAt, judgment: core.summary });
  };
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
  const stepLink = (index: number) =>
    index < chapters.length - 1 ? (
      <a className="lite-next-chapter" href={`#${chapters[index + 1][0]}`}>
        <span>
          {t('接着看', 'Continue')} · {t(chapters[index + 1][1], chapters[index + 1][2])}
        </span>
        <ArrowDown size={21} aria-hidden="true" />
      </a>
    ) : null;

  return (
    <article
      ref={root}
      className="lite-research"
      data-locale={locale}
      data-testid="lite-research"
      key={scope}
    >
      <nav className="lite-chapter-nav" aria-label={t('阅读章节', 'Reading chapters')}>
        <a className="lite-back" href="/#showcase-query">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{t('查另一家', 'Another company')}</span>
        </a>
        <div>
          {chapters.map(([anchor, zh, en], index) => (
            <a
              key={anchor}
              href={`#${anchor}`}
              aria-current={chapter === anchor ? 'location' : undefined}
            >
              <span>0{index + 1}</span>
              <span>{t(zh, en)}</span>
            </a>
          ))}
        </div>
        <a className="lite-pro-link" href={`${companyPath(run.id)}&experience=pro`}>
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
        aria-labelledby="lite-company-title"
      >
        <div className="lite-intro-top">
          <p className="lite-kicker">
            PRISPECT / {run.input.securityCode} / {run.input.year}
          </p>
          <span>{t('一家公司，一次看清。', 'One company. A clearer view.')}</span>
        </div>
        <div className="lite-intro-layout">
          <div className="lite-intro-copy">
            <h1 id="lite-company-title">
              <span className="lite-title-mask">
                <span className="lite-title-reveal">{companyName}</span>
              </span>
            </h1>
            <p className="lite-result-label">
              {core.model
                ? t('AI 核心判断', 'AI core judgment')
                : report
                  ? t('规则结果', 'Rule results')
                  : t('已取得数据的财务观察', 'Financial observations from acquired data')}{' '}
              ·{' '}
              {report ? t('合并口径', 'Consolidated basis') : t(...contextFieldLabels[profitField])}
            </p>
            <h2 className="lite-headline">{headline}</h2>
            {core.summary ? (
              <p className="lite-summary">
                {core.segments.map((segment, index) =>
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
              {core.summary && (
                <button type="button" onClick={inspect}>
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
                    ? t('资料未齐，暂不评级', 'Incomplete evidence; unrated')
                    : t('所选年度 · 合并口径', 'Selected annual year · consolidated basis')}
            </p>
            {report && <small>{date(report.snapshotFetchedAt, locale)}</small>}
          </aside>
        </div>
        <div className="lite-progress" aria-label={t('实际研究进度', 'Recorded research progress')}>
          <span>{t(...progress.label)}</span>
          <ol>
            {progress.stages.map((stage, index) => (
              <li key={stage.id} data-status={stage.status}>
                <span>0{index + 1}</span>
                <strong>{t(...stage.label)}</strong>
                <small>{t(stageLabels[stage.status][0], stageLabels[stage.status][1])}</small>
              </li>
            ))}
          </ol>
        </div>
        {(brief.warnings.length > 0 ||
          run.contextError ||
          run.assessmentError ||
          run.error ||
          run.informationGap) && (
          <div className="lite-scope-notes" role="status">
            {brief.warnings.map((warning, index) => (
              <p key={index}>{t(...warning)}</p>
            ))}
            {run.contextError && <p>{run.contextError}</p>}
            {run.assessmentError && <p>{run.assessmentError}</p>}
            {run.error && <p>{run.error}</p>}
            {run.informationGap && <p>{run.informationGap.reason}</p>}
          </div>
        )}
        {stepLink(0)}
      </section>

      <section
        className="lite-chapter lite-number-chapter"
        id="lite-numbers"
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
          <div className="lite-source-paper" aria-hidden="true">
            <img
              src="/showcase/paper-sculpture.webp"
              alt=""
              width="1400"
              height="1004"
              loading="lazy"
            />
          </div>
          <div className="lite-source-list">
            {sourceCards.map((source, index) => (
              <a key={source.id} href={source.href} target="_blank" rel="noopener noreferrer">
                <span className="lite-source-index">0{index + 1}</span>
                <div>
                  <small>
                    {source.kind}
                    {source.period ? ` · ${source.period}` : ''}
                  </small>
                  <h3>{source.label}</h3>
                </div>
                <ArrowUpRight size={21} aria-hidden="true" />
              </a>
            ))}
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
            {!sourceCards.length && !originals.length && (
              <p className="lite-source-empty">
                {t(
                  '尚未取得支撑核心判断的原文。已取得的字段仍可在上一节逐项核对。',
                  'Original evidence for the core judgment is not yet available. Acquired fields can still be checked in the previous chapter.'
                )}
              </p>
            )}
            <a
              className="lite-source-full"
              href={`${companyPath(run.id, 'sources')}&experience=pro`}
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
              disabled={verified !== scope || !researchSupported(run)}
              onClick={() => ask(question.text)}
            >
              <span>0{index + 1}</span>
              <strong>{question.text}</strong>
              <MessageCircle size={22} aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="lite-finish lite-reveal">
          <p>{t('想把每个细节都看清？', 'Ready to inspect every detail?')}</p>
          <a href={`${companyPath(run.id)}&experience=pro`}>
            {t('进入 Pro，展开完整研究', 'Open the complete research in Pro')}
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
          title={t('核心判断的依据', 'Evidence for the core judgment')}
          judgment={inspected.judgment}
          onClose={() => setInspected(null)}
        />
      )}
    </article>
  );
}
