import { productTerms } from '../../shared/product-terms';
import { Select } from '../Select';
import { useContext, useEffect, useRef, useState, Suspense } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  FileSearch,
  LoaderCircle,
  Printer,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { CompanyResearchRun } from '../../shared/contracts';
import {
  companyPath,
  companySections,
  resolveCompanyFocus,
  resolveCompanyLocation,
} from '../../shared/company-workspace';
import type { CompanyReadingBasis } from '../../shared/company-analysis';
import { companyResearchAvailability } from '../../shared/company-research-availability';
import { useApp } from '../context';
import { api, RequestError, requestErrorText } from '../api';
import { date } from '../format';
import { COMPANY_RECORDS_EVENT } from '../company-record-events';
import { useCompanyRecords } from '../CompanyRecordsContext';
import {
  cacheCompanyRun,
  readCachedCompanyRun,
  removeCachedCompanyRun,
  COMPANY_CACHE_EVENT,
  type CompanyCacheInvalidation,
} from '../company-run-cache';
import {
  CompanyContextOverview,
  CompanyProfileView,
  CompanySourcesView,
  CompanyCoverageView,
} from '../CompanyContextViews';
import { CompanyFinancialChartsSection } from '../CompanyFinancialChartsSection';
import type { IndustryHistoryResult } from '../../shared/company-industry-history';
import { CompanyDisclosuresView } from '../CompanyDisclosuresView';
import { CompanyAssistantContext } from '../company-assistant-context';
import { CompanyFinancialFindings } from '../CompanyRunOverview';
import { CompanyFinancialTrends } from '../CompanyFinancialTrends';
import { CompanyQueryPage } from './CompanyQuery';
import { CompanyAssessment } from '../CompanyAssessment';
import { SourceTrust } from '../SourceTrust';
import { CompanyEvidenceLab } from '../CompanyEvidenceLab';
import { CompanyBrief } from '../CompanyBrief';
import { CompanyFinancialOverview } from '../CompanyFinancialOverview';
import { CompanyPageIndex } from '../CompanyPageIndex';
import { CompanyReadingSession } from '../CompanyReadingSession';
import { openCompanyReportSection } from '../CompanyResearchReport';
import { CompanyPublicInformation } from '../CompanyPublicInformation';
import { OriginalReviewLoading, PageLoading } from '../Experience';
import { readPageScroll } from '../page-scroll';
import { lazyPage } from '../lazy-page';
const OriginalReview = lazyPage(
  () => import('./CompanyAgent'),
  (module) => module.CompanyAgentPage
);

const researchSupported = (run: CompanyResearchRun) =>
  /^\d{6}$/.test(run.input.securityCode) && run.identity?.exchange !== 'us';
type ResearchRequestKind = 'status' | 'sources' | 'analysis' | 'cancel';

export function CompanyWorkspacePage({ query }: { query: URLSearchParams }) {
  const { t, locale, navigate, confirm, user, historyNavigation } = useApp();
  const { removeLocal, isCurrentOwner } = useCompanyRecords();
  const { publish } = useContext(CompanyAssistantContext);
  const id = query.get('run');
  const { section, focus: reportFocus } = resolveCompanyLocation(
    query.get('section'),
    query.get('focus')
  );
  const [loadedRun, setLoadedRun] = useState<{
    owner: string | null;
    run: CompanyResearchRun | null;
  }>(() => ({
    owner: user?.id || null,
    run: user && id ? readCachedCompanyRun(user.id, id) : null,
  }));
  const run = loadedRun.owner === (user?.id || null) ? loadedRun.run : null;
  const setRun = (next: CompanyResearchRun | null) => {
    setLoadedRun({ owner: user?.id || null, run: next });
    if (user && next) cacheCompanyRun(user.id, next);
  };
  const savedOnly = query.get('cached') === '1';
  const rememberIndustryHistory = (result: IndustryHistoryResult) => {
    const owner = user?.id;
    if (!owner || !isCurrentOwner()) return;
    setLoadedRun((previous) => {
      if (previous.owner !== owner || previous.run?.id !== id) return previous;
      const next = {
        ...previous.run,
        industry: {
          ...previous.run.industry,
          ...(result.snapshot ? { [result.period]: result.snapshot } : {}),
        },
        industryHistoryErrors: { ...previous.run.industryHistoryErrors },
      };
      if (result.failure) next.industryHistoryErrors[result.period] = result.failure;
      else delete next.industryHistoryErrors[result.period];
      cacheCompanyRun(owner, next);
      return { owner, run: next };
    });
  };
  const savedScope = useRef<string | null>(null);
  const manualScope = useRef<string | null>(null);
  const [failure, setFailure] = useState<{ kind: ResearchRequestKind; text: string } | null>(null);
  const error = failure?.text || '';
  const errorKind = failure?.kind || 'status';
  const [version, setVersion] = useState(0);
  const [basis, setBasis] = useState<CompanyReadingBasis>('parent');
  const [updating, setUpdating] = useState(false);
  const [assessmentUpdating, setAssessmentUpdating] = useState(false);
  const [cancellingResearch, setCancellingResearch] = useState(false);
  const request = useRef<AbortController | null>(null);
  const cancelOperation = useRef<symbol | null>(null);
  const revealedLocation = useRef<string | null>(null);
  const clearResolvedFailure = (next: CompanyResearchRun) =>
    setFailure((previous) =>
      previous?.kind === 'status' ||
      (previous?.kind === 'cancel' && !companyResearchAvailability(next).active)
        ? null
        : previous
    );
  useEffect(() => setFailure(null), [id, user?.id]);
  useEffect(() => {
    if (!id || !user) return;
    const owner = user.id;
    const scope = `${owner}:${id}`;
    const cached = readCachedCompanyRun(owner, id);
    if (cached || savedOnly) savedScope.current = scope;
    if ((!run || run.id !== id) && cached) setRun(cached);
    const controller = new AbortController();
    request.current = controller;
    cancelOperation.current = null;
    setCancellingResearch(false);
    let timer: ReturnType<typeof setTimeout>;
    let contextRequested = false;
    const load = async () => {
      let kind: ResearchRequestKind = 'status';
      try {
        let next = await api<CompanyResearchRun>(`/company-runs/${encodeURIComponent(id)}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setRun(next);
        clearResolvedFailure(next);
        if (
          section !== 'evidence' &&
          (savedScope.current !== scope || manualScope.current === scope) &&
          !contextRequested &&
          researchSupported(next) &&
          !next.informationGap &&
          !next.context &&
          next.contextStatus !== 'loading' &&
          next.contextStatus !== 'failed'
        ) {
          contextRequested = true;
          kind = 'sources';
          next = await api<CompanyResearchRun>(`/company-runs/${encodeURIComponent(id)}/context`, {
            method: 'POST',
            body: '{}',
            signal: controller.signal,
          });
        }
        if (controller.signal.aborted) return;
        setRun(next);
        clearResolvedFailure(next);
        window.dispatchEvent(new Event(COMPANY_RECORDS_EVENT));
        if (
          next.status === 'queued' ||
          next.status === 'running' ||
          next.contextStatus === 'loading' ||
          next.assessmentStatus === 'loading'
        )
          timer = setTimeout(() => void load(), 1500);
        else if (manualScope.current === scope) manualScope.current = null;
      } catch (cause) {
        if (!controller.signal.aborted) {
          if (manualScope.current === scope) manualScope.current = null;
          if (
            cause instanceof RequestError &&
            ['COMPANY_RUN_NOT_FOUND', 'AUTH_REQUIRED', 'UNAUTHORIZED'].includes(cause.code)
          ) {
            removeCachedCompanyRun(owner, id);
            removeLocal(id);
            setRun(null);
          }
          setFailure({ kind, text: requestErrorText(cause, locale) });
        }
      }
    };
    void load();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [id, locale, version, user?.id, savedOnly]);
  useEffect(() => {
    const invalidate = (event: Event) => {
      const detail = (event as CustomEvent<CompanyCacheInvalidation>).detail;
      if (!detail || detail.owner !== user?.id || !id || !detail.ids.includes(id)) return;
      savedScope.current = `${detail.owner}:${id}`;
      manualScope.current = null;
      request.current?.abort();
      setRun(null);
      setVersion((value) => value + 1);
    };
    window.addEventListener(COMPANY_CACHE_EVENT, invalidate);
    return () => window.removeEventListener(COMPANY_CACHE_EVENT, invalidate);
  }, [id, user?.id]);
  useEffect(() => {
    const update = (event: Event) => {
      if (event instanceof CustomEvent && event.detail === id) setVersion((value) => value + 1);
    };
    window.addEventListener('prispect:company-run-updated', update);
    return () => window.removeEventListener('prispect:company-run-updated', update);
  }, [id]);
  useEffect(() => {
    if (run?.id === id && user) publish({ owner: user.id, run, basis, changeBasis: setBasis });
  }, [run, id, basis, user?.id, publish]);
  useEffect(() => {
    if (run?.id !== id) return;
    const targets = pageAnchorIds(section);
    const reveal = (explicit = false, historyReturn = false) => {
      const hashId = location.hash.slice(1);
      const target =
        resolveCompanyFocus(section, reportFocus) || (targets.includes(hashId) ? hashId : '');
      if (!target) {
        revealedLocation.current = null;
        return;
      }
      const key = `${id}:${section}:${target}`;
      // A snapshot refresh is not a new navigation. Late-arriving sections still reveal once.
      if (!explicit && revealedLocation.current === key) return;
      if (!document.getElementById(target)) return;
      revealedLocation.current = key;
      openCompanyReportSection(target, target === 'company-research-goal', undefined, {
        scroll: !historyReturn && (explicit || !historyNavigation),
      });
    };
    reveal();
    const revealHash = () => reveal(true, Boolean(readPageScroll(history.state)));
    window.addEventListener('hashchange', revealHash);
    return () => window.removeEventListener('hashchange', revealHash);
  }, [run?.id, run?.context?.fetchedAt, id, section, reportFocus, historyNavigation]);
  const refresh = async () => {
    if (!run || !researchSupported(run) || updating) return;
    if (user) manualScope.current = `${user.id}:${run.id}`;
    const signal = request.current?.signal;
    setUpdating(true);
    setFailure(null);
    try {
      const next = await api<CompanyResearchRun>(`/company-runs/${run.id}/context`, {
        method: 'POST',
        body: JSON.stringify({ refresh: true }),
        signal,
      });
      if (!signal?.aborted) {
        setRun(next);
        setVersion((value) => value + 1);
      }
    } catch (cause) {
      if (!signal?.aborted) {
        manualScope.current = null;
        setFailure({ kind: 'sources', text: requestErrorText(cause, locale) });
      }
    } finally {
      setUpdating(false);
    }
  };
  const refreshAssessment = async (focus?: string) => {
    if (
      !run?.context ||
      !researchSupported(run) ||
      run.contextStatus === 'loading' ||
      assessmentUpdating ||
      run.assessmentStatus === 'loading'
    )
      return;
    const signal = request.current?.signal;
    setAssessmentUpdating(true);
    setFailure(null);
    try {
      const next = await api<CompanyResearchRun>(
        `/company-runs/${encodeURIComponent(run.id)}/assessment`,
        {
          method: 'POST',
          body: JSON.stringify({ refresh: true, focus }),
          signal,
        }
      );
      if (!signal?.aborted) {
        setRun(next);
        setVersion((value) => value + 1);
      }
    } catch (cause) {
      if (!signal?.aborted) {
        setFailure({ kind: 'analysis', text: requestErrorText(cause, locale) });
      }
    } finally {
      setAssessmentUpdating(false);
    }
  };
  const cancelResearch = async () => {
    if (!run || cancellingResearch || !isCurrentOwner()) return;
    const available = companyResearchAvailability(run);
    if (!available.canCancel) return;
    const signal = request.current?.signal;
    if (signal?.aborted) return;
    const operation = Symbol('research-cancel');
    cancelOperation.current = operation;
    setCancellingResearch(true);
    setFailure(null);
    try {
      const next = await api<CompanyResearchRun>(
        `/company-runs/${encodeURIComponent(run.id)}/research/cancel`,
        {
          method: 'POST',
          body: JSON.stringify(available.cancelRevisions),
          signal,
        }
      );
      if (signal?.aborted || !isCurrentOwner() || cancelOperation.current !== operation) return;
      setRun(next);
      setFailure(null);
      setVersion((value) => value + 1);
      window.dispatchEvent(new Event(COMPANY_RECORDS_EVENT));
    } catch (cause) {
      if (!signal?.aborted && isCurrentOwner() && cancelOperation.current === operation) {
        setFailure({
          kind:
            cause instanceof RequestError && cause.code === 'RESEARCH_CANCEL_STALE'
              ? 'status'
              : 'cancel',
          text: requestErrorText(cause, locale),
        });
      }
    } finally {
      if (cancelOperation.current === operation) {
        cancelOperation.current = null;
        setCancellingResearch(false);
      }
    }
  };
  const remove = () =>
    run &&
    confirm({
      title: t('删除研究记录？', 'Delete research record?'),
      text: t(
        '删除这份研究记录及问答；已采用的材料仍保留。',
        'Delete this research record and its answers. Adopted evidence is retained.'
      ),
      action: async () => {
        const signal = request.current?.signal;
        if (signal?.aborted || !isCurrentOwner()) return;
        await api(`/company-runs/${run.id}`, { method: 'DELETE', signal });
        if (signal?.aborted || !isCurrentOwner()) return;
        removeLocal(run.id);
        window.dispatchEvent(new Event(COMPANY_RECORDS_EVENT));
        navigate('/query');
      },
    });
  if (!id)
    return query.get('query') ? (
      <Suspense>
        <OriginalReview key={query.toString()} query={query} />
      </Suspense>
    ) : (
      <CompanyQueryPage />
    );
  if (!run || run.id !== id)
    return (
      <div className="loading-page">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              className="button button-secondary"
              onClick={() => setVersion((value) => value + 1)}
            >
              {t('重试', 'Retry')}
            </button>
          </>
        ) : (
          <PageLoading label={t('正在打开企业…', 'Opening company…')} />
        )}
      </div>
    );
  const snapshot =
    run.context?.securityCode === run.input.securityCode && run.context.orgId === run.input.orgId
      ? run.context
      : undefined;
  const active = run.status === 'queued' || run.status === 'running';
  const pausedMarket = !run.informationGap && !researchSupported(run);
  const title = t(
    ...(companySections.find(([key]) => key === section)!.slice(1) as [string, string])
  );
  const originalPage = (page: number | null) => {
    const document = run.announcements.find(
      (item) => item.reportYear === run.input.year && item.category === 'annual'
    );
    if (document)
      window.open(
        `${document.sourceUrl}${page ? `#page=${page}` : ''}`,
        '_blank',
        'noopener,noreferrer'
      );
    else navigate(companyPath(run.id, 'evidence'));
  };
  const readingControls = (
    <div className="context-reading-controls">
      <label>
        {t('利润口径', 'Profit basis')}
        <Select
          value={basis}
          onValueChange={(selectedValue) => setBasis(selectedValue as CompanyReadingBasis)}
        >
          <option value="parent">{t('归母净利润', 'Attributable net profit')}</option>
          <option value="consolidated">{t('合并净利润', 'Consolidated net profit')}</option>
        </Select>
      </label>
    </div>
  );
  const pageAnchors = pageAnchorItems(section);
  const scopeNote = snapshot
    ? `${t('数据更新于', 'Data updated at')} ${date(snapshot.fetchedAt, locale)}`
    : '';
  const emptySources = (
    <section className="context-empty" aria-live="polite">
      {run.informationGap ? (
        <>
          <h2>{t('未匹配到支持的上市主体', 'No supported listed entity matched')}</h2>
          <a className="button button-secondary" href="/query">
            {t('新建研究', 'New research')}
          </a>
        </>
      ) : run.contextStatus === 'loading' || active ? (
        <>
          <LoaderCircle className="spinner" />
          <p>{t('正在获取企业资料…', 'Retrieving company data…')}</p>
          <button
            type="button"
            className="text-link"
            disabled={cancellingResearch}
            onClick={() => void cancelResearch()}
          >
            {t('取消', 'Cancel')}
          </button>
        </>
      ) : (
        <>
          <p>{t('本次未取得企业资料', 'Company data is unavailable')}</p>
          <button
            type="button"
            className="button button-secondary"
            disabled={updating}
            onClick={() => void refresh()}
          >
            {t('重新获取', 'Try again')}
          </button>
        </>
      )}
    </section>
  );
  return (
    <div
      className={'company-workspace' + (section === 'overview' ? ' company-workspace-report' : '')}
    >
      {user && (
        <CompanyReadingSession
          key={`${user.id}:${run.id}`}
          owner={user.id}
          run={run}
          section={section}
          focus={reportFocus}
        />
      )}
      <header className="context-page-heading">
        <div>
          {(section === 'financial' || section === 'evidence') && (
            <p className="context-eyebrow">
              {run.informationGap?.name ||
                run.identity?.companyName ||
                snapshot?.companyName ||
                run.input.securityCode}
            </p>
          )}
          <h1>
            {section === 'overview'
              ? run.informationGap?.name ||
                run.identity?.shortName ||
                snapshot?.companyName ||
                run.input.securityCode
              : title}
          </h1>
          <p className="context-data-note">
            {(section !== 'overview' || run.input.securityCode) && (
              <>{run.input.securityCode || t('主体待确认', 'Entity needs confirmation')} · </>
            )}
            {run.input.year}{' '}
            {section === 'overview' && !pausedMarket
              ? t('年度财务说明书', 'annual financial overview')
              : t('年度公开资料', 'annual public sources')}{' '}
            ·{' '}
            {run.input.purpose === 'handover'
              ? t('内部交接', 'Internal handover')
              : t('外部付款', 'External payment')}
          </p>
        </div>
        <div className="context-page-actions">
          {companyResearchAvailability(run).canCancel && (
            <button
              className="button button-secondary"
              disabled={cancellingResearch}
              onClick={() => void cancelResearch()}
            >
              {cancellingResearch ? t('正在取消…', 'Cancelling…') : t('取消', 'Cancel')}
            </button>
          )}
          {section === 'overview' && (
            <button className="button button-secondary" onClick={() => window.print()}>
              <Printer size={14} />
              {t('打印摘要', 'Print summary')}
            </button>
          )}
          {!run.informationGap && !pausedMarket && (
            <button
              className="button button-secondary"
              disabled={updating || run.contextStatus === 'loading'}
              onClick={() => void refresh()}
            >
              <RefreshCw size={14} />
              {t('更新', 'Refresh')}
            </button>
          )}
          <button
            className="icon-button"
            disabled={
              active ||
              run.contextStatus === 'loading' ||
              run.assessmentStatus === 'loading' ||
              run.challenge?.status === 'loading'
            }
            aria-label={t('删除研究记录', 'Delete research record')}
            onClick={remove}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>
      {pageAnchors.length > 0 && !pausedMarket && (snapshot || section === 'overview') && (
        <CompanyPageIndex key={`${user?.id}:${run.id}:${section}`} anchors={pageAnchors} />
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
          <button
            className="text-link"
            type="button"
            disabled={updating || assessmentUpdating || cancellingResearch}
            onClick={() =>
              errorKind === 'sources'
                ? void refresh()
                : errorKind === 'analysis'
                  ? void refreshAssessment()
                  : errorKind === 'cancel'
                    ? void cancelResearch()
                    : setVersion((value) => value + 1)
            }
          >
            {errorKind === 'status'
              ? t('重新读取状态', 'Reload research status')
              : t('重试', 'Retry')}
          </button>
        </p>
      )}
      {!run.informationGap && section === 'evidence' && (
        <div className="context-original-status">
          {active && <LoaderCircle size={14} className="spinner" />}
          <span>
            {active
              ? t('年报原件正在后台核查', 'Original reports are being checked in the background')
              : run.status === 'adopted'
                ? t('原件已采用', 'Original adopted')
                : run.preview
                  ? t(
                      '已取得原件候选，等待逐项确认',
                      'Original candidates retrieved; confirmation required'
                    )
                  : t('原件核查有信息缺口', 'Original review has evidence gaps')}
          </span>
        </div>
      )}
      {section === 'evidence' ? (
        <Suspense
          fallback={
            <OriginalReviewLoading
              label={t('正在打开原件核查…', 'Opening original-document review…')}
            />
          }
        >
          <OriginalReview
            key={run.id}
            query={new URLSearchParams({ run: run.id })}
            initialRun={run}
            embedded
          />
        </Suspense>
      ) : pausedMarket ? (
        <section className="company-review-section">
          <h2>{t('美股研究暂未开放', 'US-company research is paused')}</h2>
          <p className="context-data-note">
            {t(
              '这份历史记录和原件仍可查看。外币金额不参与当前人民币核查，页面不会继续采集数据或生成分析。',
              'This saved record and its original filing remain available. Foreign amounts are excluded from CNY review; this page will not collect more data or generate analysis.'
            )}
          </p>
          <a className="button button-secondary" href={companyPath(run.id, 'evidence')}>
            <FileSearch size={14} />
            {t('查看已保存原件', 'View saved originals')}
          </a>
          {snapshot && <CompanySourcesView snapshot={snapshot} />}
        </section>
      ) : run.informationGap ? (
        emptySources
      ) : !snapshot ? (
        emptySources
      ) : (
        <>
          {run.contextError && (
            <p role="alert" className="context-data-note">
              {run.contextError}
              <button
                type="button"
                className="text-link"
                disabled={updating || run.contextStatus === 'loading'}
                onClick={() => void refresh()}
              >
                {t('重试', 'Retry')}
              </button>
            </p>
          )}
          {(section === 'overview' || section === 'trends' || section === 'financial') &&
            readingControls}
          {section === 'overview' ? (
            <>
              <CompanyBrief run={run} showIdentity={false} />
              <CompanyFinancialOverview run={run} basis={basis} />
              <details id="company-financial-data" className="company-review-details">
                <summary>
                  <ChevronDown size={14} />
                  {t('核查清单与完整指标', 'Checks and complete metrics')}
                </summary>
                <CompanyContextOverview
                  snapshot={snapshot}
                  run={run}
                  basis={basis}
                  view="manager"
                  selectedYear={run.input.year}
                />
              </details>
              <details id="company-full-report" className="company-review-details">
                <summary>
                  <ChevronDown size={14} />
                  {t('深入分析', 'Further analysis')}
                </summary>
                <CompanyAssessment
                  key={'assessment-' + run.id}
                  run={run}
                  onRefresh={(focus) => void refreshAssessment(focus)}
                  refreshing={assessmentUpdating}
                />
                <details id="company-evidence-lab" className="company-review-details">
                  <summary>
                    <ChevronDown size={14} />
                    {t('检验解释', 'Test an explanation')}
                  </summary>
                  <CompanyEvidenceLab
                    key={'lab-' + run.id}
                    run={run}
                    updating={updating || assessmentUpdating}
                  />
                </details>
              </details>
            </>
          ) : section === 'trends' || section === 'financial' ? (
            <>
              <CompanyFinancialChartsSection
                key={`${user?.id}:${run.id}:history`}
                run={run}
                snapshot={snapshot}
                basis={basis}
                view={section === 'financial' ? 'combined' : 'history'}
                onHistoryResult={rememberIndustryHistory}
              />
              <details id="company-financial-data" className="company-review-details">
                <summary>
                  <ChevronDown size={14} />
                  {t('逐年指标与计算', 'Annual metrics and calculations')}
                </summary>
                <CompanyContextOverview
                  snapshot={snapshot}
                  run={run}
                  basis={basis}
                  view="manager"
                />
                <section id="company-financial-findings">
                  <CompanyFinancialFindings run={run} onPage={originalPage} />
                </section>
              </details>
              {run.agent?.financialContext && (
                <details id="company-original-comparison" className="company-review-details">
                  <summary>
                    <ChevronDown size={14} />
                    {t('原件字段对照', 'Original-field comparison')}
                  </summary>
                  <CompanyFinancialTrends run={run} onPage={originalPage} />
                </details>
              )}
            </>
          ) : section === 'industry' ? (
            <CompanyFinancialChartsSection
              key={`${user?.id}:${run.id}:industry`}
              run={run}
              snapshot={snapshot}
              basis={basis}
              view="industry"
              onHistoryResult={rememberIndustryHistory}
            />
          ) : section === 'disclosures' ? (
            <>
              <section id="company-disclosures" className="company-workspace-section">
                <CompanyDisclosuresView snapshot={snapshot} />
              </section>
              <details id="company-public-signals" className="company-review-details">
                <summary>
                  <ChevronDown size={14} />
                  {t('新闻与讨论', 'News and discussions')}
                </summary>
                <CompanyPublicInformation run={run} />
              </details>
            </>
          ) : section === 'profile' ? (
            <section id="company-profile" className="company-workspace-section">
              <CompanyProfileView snapshot={snapshot} includeNews={false} />
            </section>
          ) : section === 'coverage' ? (
            <section id="company-data-coverage" className="company-workspace-section">
              <CompanyCoverageView snapshot={snapshot} run={run} />
              <SourceTrust run={run} />
            </section>
          ) : (
            <section id="company-source-comparison" className="company-workspace-section">
              <CompanySourcesView snapshot={snapshot} />
            </section>
          )}
          {scopeNote && section !== 'overview' && (
            <p className="context-data-note">
              {scopeNote}
              {run.contextStatus === 'loading' ? ` · ${t('更新中', 'Updating')}` : ''}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function pageAnchorItems(
  section: ReturnType<typeof resolveCompanyLocation>['section']
): readonly (readonly [string, string, string])[] {
  switch (section) {
    case 'overview':
      return [
        ['company-financial-overview', '财务概览', 'Financial overview'],
        ['company-financial-attention', '值得注意的事', 'What deserves attention'],
        ['company-financial-data', '完整指标', 'Complete metrics'],
        ['company-full-report', '深入分析', 'Further analysis'],
      ];
    case 'trends':
    case 'financial':
      return [
        ['company-financial-history', ...productTerms.financialTrends],
        ['company-financial-data', '逐年指标', 'Annual metrics'],
      ];
    case 'industry':
      return [['company-industry', '行业对比', 'Industry comparison']];
    case 'disclosures':
      return [
        ['company-disclosures', '公告线索', 'Announcements'],
        ['company-public-signals', '新闻与讨论', 'News and discussions'],
      ];
    case 'profile':
      return [['company-profile', '企业与股东', 'Company and shareholders']];
    case 'coverage':
      return [
        ['company-data-coverage', '数据覆盖', 'Data coverage'],
        ['company-source-trust', '来源关系', 'Source relationships'],
      ];
    case 'sources':
      return [['company-source-comparison', '来源比对', 'Source comparison']];
    default:
      return [];
  }
}
function pageAnchorIds(section: ReturnType<typeof resolveCompanyLocation>['section']): string[] {
  return [
    ...pageAnchorItems(section).map(([id]) => id),
    'company-evidence-lab',
    'company-original-comparison',
  ];
}
