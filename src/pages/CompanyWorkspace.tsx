import { Select } from '../Select';
import { useContext, useEffect, useRef, useState, lazy, Suspense } from 'react';
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
import { companyPath, companySections } from '../../shared/company-workspace';
import type { CompanyReadingBasis } from '../../shared/company-analysis';
import { useApp } from '../context';
import { api, requestErrorText } from '../api';
import { date } from '../format';
import { COMPANY_RECORDS_EVENT } from '../CompanySidebar';
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
import { CompanyReview } from '../CompanyReview';
import { resolveCompanySection } from '../routing';
import { PageLoading } from '../Experience';
const OriginalReview = lazy(() =>
  import('./CompanyAgent').then((module) => ({ default: module.CompanyAgentPage }))
);

export function CompanyWorkspacePage({ query }: { query: URLSearchParams }) {
  const { t, locale, navigate, confirm, user } = useApp();
  const { publish } = useContext(CompanyAssistantContext);
  const id = query.get('run');
  const section = resolveCompanySection(query.get('section'));
  const [run, setRun] = useState<CompanyResearchRun | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [basis, setBasis] = useState<CompanyReadingBasis>('consolidated');
  const [view, setView] = useState<'public' | 'manager'>('public');
  const [updating, setUpdating] = useState(false);
  const request = useRef<AbortController | null>(null);
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
          !contextRequested &&
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
        setRun(next);
        setError('');
        window.dispatchEvent(new Event(COMPANY_RECORDS_EVENT));
        if (
          next.status === 'queued' ||
          next.status === 'running' ||
          next.contextStatus === 'loading'
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
  const refresh = async () => {
    if (!run || updating) return;
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
  const remove = () =>
    run &&
    confirm({
      title: t('删除企业记录？', 'Delete company record?'),
      text: t(
        '删除本次查询和问答；已采用的材料保留在材料中心。',
        'Delete this query and its answers. Adopted evidence remains in Materials.'
      ),
      action: async () => {
        await api(`/company-runs/${run.id}`, { method: 'DELETE' });
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
  const snapshot = run.context;
  const active = run.status === 'queued' || run.status === 'running';
  const title =
    section === 'evidence'
      ? t('年报原件核查', 'Original-report review')
      : t(...(companySections.find(([key]) => key === section)!.slice(1) as [string, string]));
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
        {t('阅读视角', 'Reading view')}
        <Select
          value={view}
          onValueChange={(selectedValue) => setView(selectedValue as 'public' | 'manager')}
        >
          <option value="public">{t('公众视图', 'Public view')}</option>
          <option value="manager">{t('管理者尽调', 'Management diligence')}</option>
        </Select>
      </label>
      <label>
        {t('网页指标利润口径', 'Web profit basis')}
        <Select
          value={basis}
          onValueChange={(selectedValue) => setBasis(selectedValue as CompanyReadingBasis)}
        >
          <option value="parent">{t('归母净利润', 'Attributable profit')}</option>
          <option value="consolidated">{t('合并净利润', 'Consolidated profit')}</option>
        </Select>
      </label>
    </div>
  );
  return (
    <div
      className={'company-workspace' + (section === 'overview' ? ' company-workspace-report' : '')}
    >
      <header className="context-page-heading">
        <div>
          <p className="context-eyebrow">
            {section === 'overview'
              ? t('核查报告', 'Review report')
              : run.informationGap?.name ||
                run.identity?.companyName ||
                snapshot?.companyName ||
                run.input.securityCode}
          </p>
          <h1>
            {section === 'overview'
              ? run.informationGap?.name ||
                run.identity?.shortName ||
                snapshot?.companyName ||
                run.input.securityCode
              : title}
          </h1>
          <p className="context-data-note">
            {run.input.securityCode || t('主体待定位', 'Entity unconfirmed')} · {run.input.year}{' '}
            {section === 'overview'
              ? t('年度核查 · 合并口径', 'annual review · consolidated scope')
              : t('年报原件', 'annual original')}{' '}
            ·{' '}
            {run.input.purpose === 'handover'
              ? t('内部交接', 'Internal handover')
              : t('外部付款', 'External payment')}
          </p>
        </div>
        <div className="context-page-actions">
          {section === 'overview' && (
            <button className="button button-secondary" onClick={() => window.print()}>
              <Printer size={14} />
              {t('打印摘要', 'Print summary')}
            </button>
          )}
          {!run.informationGap && (
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
            disabled={active || run.contextStatus === 'loading'}
            aria-label={t('删除企业记录', 'Delete company record')}
            onClick={remove}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className="field-error">
          {error}
          <button className="text-link" onClick={() => setVersion((value) => value + 1)}>
            {t('重试', 'Retry')}
          </button>
        </p>
      )}
      {!run.informationGap && section !== 'overview' && (
        <div className="context-original-status">
          {active && <LoaderCircle size={14} className="spinner" />}
          <span>
            {active
              ? t('年报原件正在后台核查', 'Original reports are being checked in the background')
              : run.status === 'adopted'
                ? t('原件材料已确认采用', 'Original evidence adopted')
                : run.preview
                  ? t(
                      '已取得原件候选，等待逐项确认',
                      'Original candidates retrieved; confirmation required'
                    )
                  : t('原件核查有信息缺口', 'Original review has evidence gaps')}
          </span>
          <a className="text-link" href={companyPath(run.id, 'evidence')}>
            <FileSearch size={13} />
            {t('查看原件与核查过程', 'Originals and review process')}
            <ArrowUpRight size={12} />
          </a>
        </div>
      )}
      {section === 'evidence' ? (
        <Suspense fallback={<LoaderCircle className="spinner" />}>
          <OriginalReview key={run.id} query={new URLSearchParams({ run: run.id })} />
        </Suspense>
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
          <CompanyReview key={run.id} run={run} />
          <details className="company-review-details">
            <summary>
              <ChevronDown size={14} />
              {t('详细数据与分析', 'Detailed data and analysis')}
            </summary>
            <nav
              className="company-review-detail-links"
              aria-label={t('详细分析入口', 'Detailed analysis')}
            >
              {companySections
                .filter(([key]) => key !== 'overview')
                .map(([key, zh, en]) => (
                  <a key={key} href={companyPath(run.id, key)}>
                    {t(zh, en)}
                  </a>
                ))}
              <a href={companyPath(run.id, 'evidence')}>
                {t('原件与核查过程', 'Originals and review process')}
              </a>
            </nav>
            {snapshot ? (
              <>
                {readingControls}
                <p className="context-data-note">
                  {t('公开数据获取于', 'Public data retrieved at')}{' '}
                  {date(snapshot.fetchedAt, locale)}
                  {run.contextStatus === 'loading'
                    ? ' · ' + t('更新进行中', 'Refresh in progress')
                    : ''}
                </p>
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
                <CompanyContextOverview snapshot={snapshot} run={run} basis={basis} view={view} />
                <CompanyFinancialFindings run={run} onPage={originalPage} />
              </>
            ) : (
              <p className="context-data-note">
                {t(
                  '尚未取得公开数据；原件核查记录和材料入口仍可查看。',
                  'Public data is not available; original-review records and evidence tools remain accessible.'
                )}
              </p>
            )}
          </details>
        </>
      ) : (
        <>
          {readingControls}
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
                  '未取得的字段保持未知。可以先查看原件核查过程，或重试公开数据。',
                  'Unavailable fields stay unknown. Open the original review or retry public sources.'
                )}
              </p>
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
              {section === 'trends' && (
                <>
                  <CompanyContextHistory snapshot={snapshot} basis={basis} />
                  {run.agent?.financialContext && (
                    <details className="context-original-trends">
                      <summary>
                        {t(
                          '合并口径与原件字段对照',
                          'Consolidated amounts and original comparison'
                        )}
                      </summary>
                      <CompanyFinancialTrends run={run} onPage={originalPage} />
                    </details>
                  )}
                </>
              )}
              {section === 'industry' && <CompanyIndustryView run={run} />}
              {section === 'disclosures' && <CompanyDisclosuresView snapshot={snapshot} />}
              {section === 'profile' && <CompanyProfileView snapshot={snapshot} />}
              {section === 'coverage' && <CompanyCoverageView snapshot={snapshot} run={run} />}
              {section === 'sources' && <CompanySourcesView snapshot={snapshot} />}
            </>
          )}
        </>
      )}
    </div>
  );
}
