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
import { useApp } from '../context';
import { api, requestErrorText } from '../api';
import { date } from '../format';
import { COMPANY_RECORDS_EVENT } from '../company-record-events';
import { useCompanyRecords } from '../CompanyRecordsContext';
import {
  CompanyContextOverview,
  CompanyProfileView,
  CompanySourcesView,
  CompanyCoverageView,
} from '../CompanyContextViews';
import { CompanyContextHistory } from '../CompanyContextHistory';
import { CompanyDisclosuresView } from '../CompanyDisclosuresView';
import { CompanyIndustryView } from '../CompanyIndustryView';
import { CompanyAssistantContext } from '../company-assistant-context';
import { CompanyFinancialFindings } from '../CompanyRunOverview';
import { CompanyFinancialTrends } from '../CompanyFinancialTrends';
import { CompanyQueryPage } from './CompanyQuery';
import { CompanyAssessment } from '../CompanyAssessment';
import { CompanyEvidenceLab } from '../CompanyEvidenceLab';
import { CompanyBrief } from '../CompanyBrief';
import { CompanyResearchReport, openCompanyReportSection } from '../CompanyResearchReport';
import { CompanyPublicInformation } from '../CompanyPublicInformation';
import { PageLoading } from '../Experience';
import { lazyPage } from '../lazy-page';
const OriginalReview = lazyPage(
  () => import('./CompanyAgent'),
  (module) => module.CompanyAgentPage
);

const researchSupported = (run: CompanyResearchRun) =>
  /^\d{6}$/.test(run.input.securityCode) && run.identity?.exchange !== 'us';

function CompanyIndustrySection({ run }: { run: CompanyResearchRun }) {
  const { t } = useApp();
  const [revealed, setRevealed] = useState(false);
  return (
    <details
      id="company-industry"
      className="company-review-details"
      onToggle={(event) => {
        if (event.currentTarget.open) setRevealed(true);
      }}
    >
      <summary>
        <ChevronDown size={14} />
        {t('行业对比', 'Industry comparison')}
      </summary>
      {revealed && <CompanyIndustryView run={run} />}
    </details>
  );
}

export function CompanyWorkspacePage({ query }: { query: URLSearchParams }) {
  const { t, locale, navigate, confirm, user } = useApp();
  const { removeLocal, isCurrentOwner } = useCompanyRecords();
  const { publish } = useContext(CompanyAssistantContext);
  const id = query.get('run');
  const { section, focus: reportFocus } = resolveCompanyLocation(
    query.get('section'),
    query.get('focus')
  );
  const [run, setRun] = useState<CompanyResearchRun | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [basis, setBasis] = useState<CompanyReadingBasis>('consolidated');
  const [updating, setUpdating] = useState(false);
  const [assessmentUpdating, setAssessmentUpdating] = useState(false);
  const request = useRef<AbortController | null>(null);
  const assessmentRequested = useRef(new Set<string>());
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    request.current = controller;
    let timer: ReturnType<typeof setTimeout>;
    let contextRequested = false;
    const load = async () => {
      try {
        let next = await api<CompanyResearchRun>(`/company-runs/${encodeURIComponent(id)}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setRun(next);
        setError('');
        if (
          section === 'overview' &&
          !contextRequested &&
          researchSupported(next) &&
          !next.informationGap &&
          !next.context &&
          next.contextStatus !== 'loading' &&
          next.contextStatus !== 'failed'
        ) {
          contextRequested = true;
          next = await api<CompanyResearchRun>(`/company-runs/${encodeURIComponent(id)}/context`, {
            method: 'POST',
            body: '{}',
            signal: controller.signal,
          });
        }
        if (controller.signal.aborted) return;
        const assessmentKey = next.context ? `${id}:${next.context.fetchedAt}` : '';
        if (
          section === 'overview' &&
          assessmentKey &&
          researchSupported(next) &&
          !next.informationGap &&
          !next.assessment &&
          next.contextStatus !== 'loading' &&
          next.assessmentStatus !== 'loading' &&
          next.assessmentStatus !== 'failed' &&
          !assessmentRequested.current.has(assessmentKey)
        ) {
          assessmentRequested.current.add(assessmentKey);
          setRun(next);
          next = await api<CompanyResearchRun>(
            `/company-runs/${encodeURIComponent(id)}/assessment`,
            {
              method: 'POST',
              body: '{}',
              signal: controller.signal,
            }
          );
        }
        if (controller.signal.aborted) return;
        setRun(next);
        setError('');
        window.dispatchEvent(new Event(COMPANY_RECORDS_EVENT));
        if (
          next.status === 'queued' ||
          next.status === 'running' ||
          next.contextStatus === 'loading' ||
          next.assessmentStatus === 'loading'
        )
          timer = setTimeout(() => void load(), 1500);
      } catch (cause) {
        if (!controller.signal.aborted) setError(requestErrorText(cause, locale));
      }
    };
    void load();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [id, locale, version]);
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
    const targets: string[] =
      section === 'overview'
        ? [
            'research-summary-heading',
            'company-full-report',
            'company-research-process',
            'company-research-goal',
            'company-evidence-lab',
            'company-review-requests',
          ]
        : section === 'financial'
          ? [
              'company-financial-history',
              'company-financial-data',
              'company-financial-findings',
              'company-industry',
              'company-original-comparison',
            ]
          : section === 'sources'
            ? [
                'company-public-signals',
                'company-disclosures',
                'company-profile',
                'company-data-coverage',
                'company-source-comparison',
              ]
            : [];
    const reveal = () => {
      const hashId = location.hash.slice(1);
      const target =
        resolveCompanyFocus(section, reportFocus) || (targets.includes(hashId) ? hashId : '');
      if (target) openCompanyReportSection(target, target === 'company-research-goal');
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [run?.id, run?.context?.fetchedAt, id, section, reportFocus]);
  const refresh = async () => {
    if (!run || !researchSupported(run) || updating) return;
    const signal = request.current?.signal;
    setUpdating(true);
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
      if (!signal?.aborted) setError(requestErrorText(cause, locale));
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
      if (!signal?.aborted) setError(requestErrorText(cause, locale));
    } finally {
      setAssessmentUpdating(false);
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
  const pageAnchors: readonly (readonly [string, string, string])[] =
    section === 'overview'
      ? [
          ['research-summary-heading', '研究摘要', 'Summary'],
          ['company-research-process', '研究过程', 'Research process'],
          ['company-evidence-lab', '检验解释', 'Test an explanation'],
          ['company-full-report', '六维分析', 'Dimensions'],
        ]
      : section === 'financial'
        ? [
            ['company-financial-history', '历史走势', 'History'],
            ['company-financial-data', '关键指标', 'Key metrics'],
            ['company-industry', '行业对比', 'Industry comparison'],
          ]
        : section === 'sources'
          ? [
              ['company-public-signals', '新闻与讨论', 'News and discussions'],
              ['company-disclosures', '公告', 'Announcements'],
              ['company-profile', '公司资料', 'Company profile'],
              ['company-data-coverage', '数据覆盖', 'Data coverage'],
              ['company-source-comparison', '来源比对', 'Source comparison'],
            ]
          : [];
  return (
    <div
      className={'company-workspace' + (section === 'overview' ? ' company-workspace-report' : '')}
    >
      <header className="context-page-heading">
        <div>
          {section !== 'overview' && (
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
              ? t('年度分析 · 合并口径', 'annual analysis · consolidated scope')
              : t('年度公开资料', 'annual public sources')}{' '}
            ·{' '}
            {run.input.purpose === 'handover'
              ? t('内部交接', 'Internal handover')
              : t('外部付款', 'External payment')}
          </p>
        </div>
        <div className="context-page-actions">
          <a className="text-link" href="/docs/methodology">
            {t('方法说明', 'Methodology')}
          </a>
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
              {section === 'overview'
                ? t('更新', 'Refresh')
                : t('更新公开数据', 'Refresh public data')}
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
        <nav className="company-page-index" aria-label={t('本页内容', 'On this page')}>
          {pageAnchors.map(([target, zh, en]) => (
            <button type="button" key={target} onClick={() => openCompanyReportSection(target)}>
              {t(zh, en)}
            </button>
          ))}
        </nav>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
          <button className="text-link" onClick={() => setVersion((value) => value + 1)}>
            {t('重试', 'Retry')}
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
        <Suspense fallback={<LoaderCircle className="spinner" />}>
          <OriginalReview key={run.id} query={new URLSearchParams({ run: run.id })} embedded />
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
      ) : section === 'overview' ? (
        <>
          {run.contextError && (
            <p role="alert" className="context-data-note">
              {run.contextError}
              <button
                className="text-link"
                disabled={updating || run.contextStatus === 'loading'}
                onClick={() => void refresh()}
              >
                {t('重试', 'Retry')}
              </button>
            </p>
          )}
          <CompanyResearchReport
            key={'report-' + run.id}
            run={run}
            onRefresh={(focus) => void refreshAssessment(focus)}
            refreshing={assessmentUpdating}
          />
          <CompanyBrief run={run} />
          <details
            id="company-evidence-lab"
            className="company-review-details company-explanation-trial"
          >
            <summary>
              <ChevronDown size={14} />
              {t('检验解释', 'Test an explanation')}
              <span className="company-detail-description">
                {t('挑战解释，或撤回一条依据', 'Challenge an explanation or withdraw a fact')}
              </span>
            </summary>
            <CompanyEvidenceLab
              key={'lab-' + run.id}
              run={run}
              updating={updating || assessmentUpdating}
            />
          </details>
          <details id="company-full-report" className="company-review-details company-lab-report">
            <summary>
              <ChevronDown size={14} />
              {t('六维分析与计算依据', 'Dimensions and calculation evidence')}
            </summary>
            <CompanyAssessment
              key={'assessment-' + run.id}
              run={run}
              onRefresh={(focus) => void refreshAssessment(focus)}
              refreshing={assessmentUpdating}
            />
          </details>
          <nav className="company-next-sections" aria-label={t('继续研究', 'Continue research')}>
            {companySections
              .filter(([key]) => key !== 'overview')
              .map(([key, zh, en]) => (
                <a key={key} href={companyPath(run.id, key)}>
                  {t(zh, en)}
                  <ArrowUpRight size={13} />
                </a>
              ))}
          </nav>
        </>
      ) : (
        <>
          {section === 'financial' && readingControls}
          <p className="context-data-note">
            {snapshot
              ? `${t('公开数据获取于', 'Public data retrieved at')} ${date(snapshot.fetchedAt, locale)}`
              : run.contextStatus === 'loading'
                ? t('正在读取企业公开数据', 'Retrieving public company data')
                : t('尚未取得企业公开数据', 'Public company data is unavailable')}
            {run.contextStatus === 'loading' ? ` · ${t('更新进行中', 'Refresh in progress')}` : ''}
          </p>
          {run.contextError && (
            <p role="alert" className="context-data-note">
              {run.contextError}
              <button
                className="text-link"
                disabled={updating || run.contextStatus === 'loading'}
                onClick={() => void refresh()}
              >
                {t('重试', 'Retry')}
              </button>
            </p>
          )}
          {!snapshot ? (
            <div className="context-empty">
              {run.contextStatus === 'loading' ? <LoaderCircle className="spinner" /> : null}
              <p>
                {t(
                  '可以查看原件核查过程，或重试公开数据。',
                  'Open the original review or retry public sources.'
                )}
              </p>
              <a className="text-link" href={companyPath(run.id, 'evidence')}>
                {t('查看原件核查', 'Open original review')}
                <ArrowUpRight size={12} />
              </a>
            </div>
          ) : (
            <>
              {snapshot.warnings.length > 0 && (
                <details className="context-warnings">
                  <summary>
                    {t('数据范围与缺口', 'Scope and gaps')} · {snapshot.warnings.length}
                  </summary>
                  {snapshot.warnings.map((warning, index) => (
                    <p key={index}>{warning}</p>
                  ))}
                </details>
              )}
              {section === 'financial' && (
                <>
                  <section id="company-financial-history" className="company-workspace-section">
                    <h2 className="company-workspace-section-title">
                      {t('历史财务走势', 'Financial history')}
                    </h2>
                    <CompanyContextHistory snapshot={snapshot} basis={basis} />
                  </section>
                  <details id="company-financial-data" className="company-review-details">
                    <summary>
                      <ChevronDown size={14} />
                      {t('关键指标与核查清单', 'Key metrics and checks')}
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
                  <CompanyIndustrySection key={run.id} run={run} />
                </>
              )}
              {section === 'sources' && (
                <>
                  <section id="company-public-signals" className="company-workspace-section">
                    <CompanyPublicInformation run={run} />
                  </section>
                  <section id="company-disclosures" className="company-workspace-section">
                    <CompanyDisclosuresView snapshot={snapshot} />
                  </section>
                  <details id="company-profile" className="company-review-details">
                    <summary>
                      <ChevronDown size={14} />
                      {t('公司资料与股东', 'Company profile and shareholders')}
                    </summary>
                    <CompanyProfileView snapshot={snapshot} includeNews={false} />
                  </details>
                  <details id="company-data-coverage" className="company-review-details">
                    <summary>
                      <ChevronDown size={14} />
                      {t('数据覆盖', 'Data coverage')}
                    </summary>
                    <CompanyCoverageView snapshot={snapshot} run={run} />
                  </details>
                  <details id="company-source-comparison" className="company-review-details">
                    <summary>
                      <ChevronDown size={14} />
                      {t('来源比对', 'Source comparison')}
                    </summary>
                    <CompanySourcesView snapshot={snapshot} />
                  </details>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
