import { productTerms } from '../../shared/product-terms';
import { Select } from '../Select';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Download,
  FileText,
  LoaderCircle,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import type {
  AnalysisTask,
  CreateTaskInput,
  CompanyAdoptInput,
  CompanyAdoptResponse,
  CompanyAgentTrace,
  CompanyAnnouncement,
  CompanyIdentity,
  CompanyResearchRun,
  CompanyRunInput,
  CompanySearchResponse,
  Material,
  Observation,
  ReviewPurpose,
} from '../../shared/contracts';
import { interpretStart } from '../../shared/start-intent';
import {
  CompanyRunOverview,
  CompanyFinancialFindings,
  CompanyEvidenceResults,
} from '../CompanyRunOverview';
import { CompanyFinancialTrends } from '../CompanyFinancialTrends';
import type { CompanyPublicEvidence } from '../../shared/company-contracts';
import { api, post, requestErrorText } from '../api';
import { useApp } from '../context';
import { Dialog, PageHeading, Tag } from '../components';
import { date, metricName } from '../format';
import { purposeName } from '../ReviewContext';
import { translateRule } from '../ruleTranslations';
import '../company-agent.css';

type CandidateMaterial = Omit<Material, 'id' | 'createdAt'>;
const safeUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined);
const sameIdentity = (a: CompanyIdentity | null, b: CompanyIdentity) =>
  a?.orgId === b.orgId && a.securityCode === b.securityCode;
const normalizeIdentityName = (value: string) =>
  value.normalize('NFKC').replace(/\s/g, '').toLowerCase();
const activeRun = (run: CompanyResearchRun | null) =>
  run?.status === 'queued' || run?.status === 'running';

export function CompanyAgentPage({ query }: { query: URLSearchParams }) {
  const { t, locale, workspace, navigate, execute, busy, confirm } = useApp();
  const initialQuery = query.get('query') || '';
  const yearQuery = query.get('year');
  const requestedYear = yearQuery === null ? null : Number(yearQuery);
  const invalidYearQuery =
    requestedYear !== null &&
    (!Number.isInteger(requestedYear) ||
      requestedYear < 2010 ||
      requestedYear > new Date().getFullYear() - 1);
  const [yearNeedsCorrection, setYearNeedsCorrection] = useState(invalidYearQuery);
  const runId = query.get('run');
  const [search, setSearch] = useState(initialQuery);
  const [results, setResults] = useState<CompanySearchResponse | null>(null);
  const [selected, setSelected] = useState<CompanyIdentity | null>(null);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(
    invalidYearQuery
      ? t(
          '指定年度不在支持范围，请在检索选项中更正后开始。',
          'The requested year is outside the supported range. Correct it in retrieval options before starting.'
        )
      : ''
  );
  const [purpose, setPurpose] = useState<ReviewPurpose>(
    query.get('purpose') === 'handover' ? 'handover' : 'external'
  );
  const [year, setYear] = useState(() => {
    const latest = new Date().getFullYear() - 1;
    const requested = Number(query.get('year'));
    return Number.isInteger(requested) && requested >= 2010 && requested <= latest
      ? requested
      : latest;
  });
  const autoStarted = useRef(new Set<string>());
  const runKeys = useRef(new Map<string, string>());
  const [run, setRun] = useState<CompanyResearchRun | null>(null);
  useEffect(() => {
    if (run)
      window.dispatchEvent(new CustomEvent('prispect:company-run-updated', { detail: run.id }));
  }, [run?.id, run?.updatedAt, run?.status]);
  const [history, setHistory] = useState<CompanyResearchRun[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadingRun, setLoadingRun] = useState(Boolean(runId));
  const [pollError, setPollError] = useState('');
  const [pollVersion, setPollVersion] = useState(0);
  const [candidate, setCandidate] = useState<CandidateMaterial | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [source, setSource] = useState<{
    title: string;
    page: number | null;
    quote: string;
    url?: string;
    sha256?: string;
    observations?: Observation[];
  } | null>(null);
  const [detailedColumns, setDetailedColumns] = useState(false);
  const [changingRun, setChangingRun] = useState(false);
  const previewVersion = run?.preview?.material.sha256;

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      setHistory(await api<CompanyResearchRun[]>('/company-runs'));
      setHistoryError('');
    } catch (cause) {
      setHistoryError(requestErrorText(cause, locale));
    } finally {
      setHistoryLoading(false);
    }
  };
  const findCompanies = async (value: string, signal?: AbortSignal) => {
    const publicQuery = interpretStart(value, 'company').companyQuery;
    if (yearNeedsCorrection) {
      setError(
        t(
          '指定年度不在支持范围，请在检索选项中更正后开始。',
          'The requested year is outside the supported range. Correct it in retrieval options before starting.'
        )
      );
      return;
    }
    if (!publicQuery) {
      setError(
        t(
          '请只输入公司名称或六位证券代码。',
          'Enter only a company name or six-digit security code.'
        )
      );
      return;
    }
    setSearching(true);
    setError('');
    setResults(null);
    setSelected(null);
    try {
      const response = await api<CompanySearchResponse>(
        `/companies/search?q=${encodeURIComponent(publicQuery)}`,
        { signal }
      );
      if (signal?.aborted) return;
      setResults(response);
      if (response.candidates.length === 1) {
        const identity = response.candidates[0]!;
        setSelected(identity);
        if (
          (/^\d{6}$/.test(publicQuery) ||
            [identity.shortName, identity.companyName].some(
              (name) => name && normalizeIdentityName(name) === normalizeIdentityName(publicQuery)
            )) &&
          !autoStarted.current.has(publicQuery)
        ) {
          autoStarted.current.add(publicQuery);
          await startRun(identity);
        }
      }
    } catch (cause) {
      if (!signal?.aborted) setError(requestErrorText(cause, locale));
    } finally {
      if (!signal?.aborted) setSearching(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    setHistoryLoading(true);
    void api<CompanyResearchRun[]>('/company-runs', { signal: controller.signal })
      .then(setHistory)
      .catch((cause) => {
        if (!controller.signal.aborted) setHistoryError(requestErrorText(cause, locale));
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    if (runId) {
      setLoadingRun(true);
      void api<CompanyResearchRun>(`/company-runs/${runId}`, { signal: controller.signal })
        .then((next) => {
          setRun(next);
          setError('');
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(requestErrorText(cause, locale));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingRun(false);
        });
    } else if (initialQuery) void findCompanies(initialQuery, controller.signal);
    return () => controller.abort();
  }, [runId, initialQuery]);
  useEffect(() => {
    if (!run || !activeRun(run)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api<CompanyResearchRun>(`/company-runs/${run.id}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setRun(next);
        setPollError('');
        if (activeRun(next)) timer = setTimeout(poll, 1000);
        else void loadHistory();
      } catch (cause) {
        if (!controller.signal.aborted) setPollError(requestErrorText(cause, locale));
      }
    };
    timer = setTimeout(poll, 1000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [run?.id, run?.status, pollVersion]);
  useEffect(() => {
    setCandidate(run?.preview?.material || null);
    setConfirmed(false);
    setSource(null);
  }, [run?.id, previewVersion]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const publicQuery = interpretStart(search, 'company').companyQuery;
    if (!publicQuery) {
      setError(
        t(
          '请只输入公司名称或六位证券代码。',
          'Enter only a company name or six-digit security code.'
        )
      );
      return;
    }
    void findCompanies(publicQuery);
  };
  const startRun = async (identity: CompanyIdentity) => {
    if (creating || yearNeedsCorrection) return;
    setCreating(true);
    setError('');
    try {
      const input: CompanyRunInput = {
        securityCode: identity.securityCode,
        orgId: identity.orgId,
        year,
        purpose,
        useModel: true,
      };
      const inputKey = JSON.stringify(input);
      const key = runKeys.current.get(inputKey) || crypto.randomUUID();
      runKeys.current.set(inputKey, key);
      const next = await api<CompanyResearchRun>('/company-runs', {
        method: 'POST',
        body: JSON.stringify(input),
        headers: { 'Idempotency-Key': key },
      });
      navigate(`/company?run=${next.id}`, { replace: true });
    } catch (cause) {
      setError(requestErrorText(cause, locale));
    } finally {
      setCreating(false);
    }
  };
  const start = (event: FormEvent) => {
    event.preventDefault();
    if (selected) void startRun(selected);
  };
  const createReview = async (materialId: string, company: string) => {
    if (!run) return;
    const existing = workspace?.tasks.find(
      (item) =>
        item.company === company &&
        item.year === run.input.year &&
        item.materialIds.length === 1 &&
        item.materialIds[0] === materialId &&
        !item.excludedMetrics.length &&
        (item.purpose || 'external') === (run.input.purpose || 'external') &&
        item.useModel === true
    );
    if (existing) {
      navigate(`/tasks/${existing.id}`);
      return;
    }
    const task = await execute(
      () =>
        post<AnalysisTask>('/tasks', {
          title: `${company} · ${run.input.year}`,
          company,
          year: run.input.year,
          materialIds: [materialId],
          excludedMetrics: [],
          purpose: run.input.purpose || 'external',
          useModel: true,
        } satisfies CreateTaskInput),
      t('核查已创建', 'Review created')
    );
    if (task) navigate(`/tasks/${task.id}`);
  };
  const adopt = async (event: FormEvent) => {
    event.preventDefault();
    if (!run || !candidate || !confirmed || !candidate.observations.length) return;
    const response = await execute(() =>
      post<CompanyAdoptResponse>(`/company-runs/${run.id}/adopt`, {
        confirmed: true,
        material: candidate,
      } satisfies CompanyAdoptInput)
    );
    if (response) {
      setRun(response.run);
      await createReview(response.material.id, response.material.company);
    }
  };
  const changeRun = async (action: 'cancel' | 'resume') => {
    if (!run || changingRun) return;
    setChangingRun(true);
    const response = await execute(
      () =>
        post<CompanyResearchRun>(`/company-runs/${run.id}/${action}`, {
          revision: run.agent?.revision,
        }),
      action === 'cancel'
        ? t('已请求取消', 'Cancellation requested')
        : t('已恢复核查', 'Review resumed')
    );
    if (response) {
      setRun(response);
      setPollError('');
      setPollVersion((v) => v + 1);
    } else {
      try {
        setRun(await api<CompanyResearchRun>(`/company-runs/${run.id}`));
      } catch {
        /* The existing request message remains available. */
      }
    }
    setChangingRun(false);
  };
  const removeRun = (item: CompanyResearchRun) =>
    confirm({
      title: t('删除这份研究记录？', 'Delete this research record?'),
      text: t(
        '研究记录及未采用原件将删除；已保存材料和核查报告保留。',
        'The research record and unadopted original are removed. Saved evidence and review reports remain.'
      ),
      action: async () => {
        const result = await execute(
          () => api<{ ok: true }>(`/company-runs/${item.id}`, { method: 'DELETE' }),
          t('研究记录已删除', 'Research record deleted')
        );
        if (result) {
          if (run?.id === item.id) navigate('/company');
          else await loadHistory();
        }
      },
    });
  const updateObservation = (index: number, patch: Partial<Observation>) => {
    if (!candidate) return;
    setCandidate({
      ...candidate,
      observations: candidate.observations.map((item, i) =>
        i === index ? { ...item, ...patch } : item
      ),
    });
    setConfirmed(false);
  };
  const openPage = (number: number | null) => {
    if (!run?.preview || number == null) return;
    const original = run.preview.material;
    setSource({
      title: original.title,
      page: number,
      quote: original.observations
        .filter((obs) => obs.page === number)
        .map((obs) => obs.quote)
        .join('\n\n'),
      url: original.sourceUrl,
      sha256: original.sha256,
      observations: original.observations.filter((obs) => obs.page === number),
    });
  };
  const openEvidence = (evidence: CompanyPublicEvidence) =>
    setSource({
      title: evidence.title,
      page: evidence.page,
      quote: evidence.quote,
      url: evidence.sourceUrl,
      sha256: evidence.sha256,
    });
  const importOwn = () => navigate(`/new?case=custom&purpose=${run?.input.purpose || purpose}`);
  const annualMaterialRequest = t(
    '年度财务核查需同一主体、年度与合并口径的净利润和经营现金净额原表。',
    'Provide the source tables for net profit and operating cash flow from the same company, annual period and consolidated scope.'
  );
  const purposeMaterialRequest =
    (run?.input.purpose || purpose) === 'handover'
      ? t(
          '若要测算当前收付款，补充当期可用现金和收付款明细；历史年报不填作当前资金。',
          'To calculate current receipts and payments, provide current available cash and transaction details. Historical annual-report amounts do not substitute for current funds.'
        )
      : t(
          '交款前还需合同、收款账户全称和退款责任主体；年报不能确认本次收款与退款责任。',
          'Before paying, also obtain the contract, full payee account name and entity responsible for refunds. Annual reports do not establish responsibility for this payment or refund.'
        );
  const fileUrl = run ? `/api/company-runs/${run.id}/file` : '';
  const originalIsPdf = /\.pdf$/i.test(run?.preview?.material.filename || '');
  const pausedMarket = run?.identity?.exchange === 'us';
  const status = (item: CompanyResearchRun) =>
    item.agent?.cancelRequested
      ? activeRun(item)
        ? t('正在取消', 'Cancelling')
        : t('已取消', 'Cancelled')
      : item.status === 'ready' && (item.stoppedReason || !item.preview)
        ? t('材料不足', 'Evidence unavailable')
        : {
            queued: t('等待检索', 'Queued'),
            running: t('正在检索', 'Retrieving'),
            ready: t('候选待确认', 'Candidates need confirmation'),
            failed: t('检索停止', 'Retrieval stopped'),
            adopted: t('原件已采用', 'Original adopted'),
          }[item.status];

  return (
    <div className="company-agent">
      <PageHeading
        title={t('年报原件核查', 'Original-report review')}
        action={
          run ? (
            <button className="button button-secondary" onClick={() => navigate('/company')}>
              {t(...productTerms.newResearch)}
            </button>
          ) : undefined
        }
        description={t(
          '检索公开材料，交叉核对财务字段与经营线索。',
          'Retrieve public documents and cross-check financial fields and operating evidence.'
        )}
      />
      {!run && (
        <form className="company-search-form" onSubmit={submitSearch}>
          <label className="form-field">
            <span>{t('公司名称或证券代码', 'Company name or security code')}</span>
            <input
              type="search"
              required
              maxLength={80}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('公司名称或证券代码', 'Company name or security code')}
            />
          </label>
          <button className="button button-primary" type="submit" disabled={searching || creating}>
            {searching ? <LoaderCircle size={16} className="spinner" /> : <Search size={16} />}{' '}
            {t('查询主体', 'Find company')}
          </button>
        </form>
      )}
      {!run && (
        <p className="company-coverage-note">
          {t('来源：巨潮资讯 A 股披露。', 'Source: CNINFO A-share disclosures.')}
        </p>
      )}
      {!run && !creating && (
        <>
          <details className="company-options">
            <summary>
              {t('检索选项', 'Retrieval options')} · {year} · {purposeName(purpose, t)}
            </summary>
            <div className="company-run-fields">
              <label className="form-field">
                <span>{t('财务年度', 'Financial year')}</span>
                <input
                  type="number"
                  required
                  min="2010"
                  max={new Date().getUTCFullYear() - 1}
                  value={year}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setYear(value);
                    setYearNeedsCorrection(
                      !Number.isInteger(value) ||
                        value < 2010 ||
                        value > new Date().getFullYear() - 1
                    );
                  }}
                />
              </label>
              <fieldset className="company-purpose">
                <legend>{t('核查用途', 'Review purpose')}</legend>
                <div className="purpose-options">
                  {(['external', 'handover'] as const).map((value) => (
                    <label
                      className={purpose === value ? 'purpose-option selected' : 'purpose-option'}
                      key={value}
                    >
                      <input
                        type="radio"
                        name="company-purpose"
                        checked={purpose === value}
                        onChange={() => setPurpose(value)}
                      />
                      <strong>{purposeName(value, t)}</strong>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </details>{' '}
        </>
      )}
      {error && (
        <div className="inline-error">
          <CircleAlert size={16} />
          <span>{error}</span>
          <button
            type="button"
            className="text-link"
            onClick={() =>
              runId
                ? api<CompanyResearchRun>(`/company-runs/${runId}`)
                    .then((next) => {
                      setRun(next);
                      setError('');
                    })
                    .catch((cause) => setError(requestErrorText(cause, locale)))
                : findCompanies(search)
            }
          >
            {t('重试', 'Retry')}
          </button>
        </div>
      )}
      {results && !run && results.candidates.length !== 1 && (
        <section className="company-identities" aria-labelledby="company-identities-title">
          <div className="report-section-title">
            <h2 id="company-identities-title">{t('选择公司主体', 'Select the company')}</h2>
            <Tag>{results.candidates.length}</Tag>
          </div>
          {results.candidates.length ? (
            <>
              <p className="section-intro">
                {t(
                  '核对简称、证券代码与交易所。完整名称尚未确认时，后续须由原件继续核对。',
                  'Check the short name, security code and exchange. An unconfirmed full company name must be checked against original documents.'
                )}
              </p>
              <div className="company-identity-list">
                {results.candidates.map((identity) => (
                  <button
                    type="button"
                    className={
                      sameIdentity(selected, identity)
                        ? 'company-identity selected'
                        : 'company-identity'
                    }
                    key={`${identity.orgId}-${identity.securityCode}`}
                    onClick={() => {
                      setSelected(identity);
                      void startRun(identity);
                    }}
                    aria-pressed={sameIdentity(selected, identity)}
                  >
                    <span className="identity-selection" aria-hidden="true">
                      {sameIdentity(selected, identity) && <Check size={12} />}
                    </span>
                    <span>
                      <strong>{identity.shortName}</strong>
                      <small>
                        {identity.companyName ||
                          t('完整公司名待原件核对', 'Full name awaiting source confirmation')}
                      </small>
                    </span>
                    <code>{identity.securityCode}</code>
                    <Tag>{identity.exchange.toUpperCase()}</Tag>
                  </button>
                ))}
              </div>
              {results.truncated && (
                <p className="field-note">
                  {t(
                    '匹配结果较多，请输入更完整的名称或证券代码缩小范围。',
                    'Many companies match. Narrow the search using a fuller name or security code.'
                  )}
                </p>
              )}
            </>
          ) : (
            <div className="company-no-match">
              <h3>
                {t('未找到当前检索范围的公司匹配', 'No company match in the current coverage')}
              </h3>
              {results.unlisted ? (
                <p>
                  {t(
                    '该主体可能未上市。未上市中国公司的核查接口已预留（需工商/融资/舆情类数据源接入后启用）。',
                    'This company may not be listed. The interface for unlisted Chinese companies is reserved and will activate once a registry/funding/sentiment data source is connected.'
                  )}
                </p>
              ) : (
                <p>
                  {t(
                    '核对名称与代码，或使用自己的公司材料。当前查询不覆盖所有企业。',
                    'Check the name or code, or use your own documents. This search does not cover every company.'
                  )}
                </p>
              )}
              <p>{annualMaterialRequest}</p>
              <p>{purposeMaterialRequest}</p>
              <button type="button" className="button button-secondary" onClick={importOwn}>
                {t('导入年度财务材料', 'Import annual financial evidence')}
              </button>
            </div>
          )}
        </section>
      )}
      {selected && !run && !creating && (
        <form className="company-run-config" onSubmit={start}>
          <div className="company-selected-heading">
            <div>
              <h2>{selected.shortName}</h2>
              <p>
                {selected.securityCode} · {selected.exchange.toUpperCase()}
              </p>
            </div>
            {safeUrl(selected.sourceUrl) && (
              <a
                className="text-link"
                href={safeUrl(selected.sourceUrl)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('主体来源', 'Identity source')}
                <ArrowUpRight size={14} />
              </a>
            )}
          </div>
          <p className="section-intro">
            {t(
              '核对证券代码后开始。将检索年报、附注和近期公告；金额候选采用前仍须确认。',
              'Confirm the security code to begin. Annual statements, notes and recent disclosures are retrieved; financial candidates still require confirmation before adoption.'
            )}
          </p>

          <div className="inline-actions">
            <button className="button button-primary" type="submit" disabled={creating}>
              {creating ? <LoaderCircle className="spinner" size={16} /> : <ArrowRight size={16} />}{' '}
              {t('开始核查', 'Start review')}
            </button>
          </div>
        </form>
      )}
      {creating && (
        <div className="company-run-loading" role="status">
          <LoaderCircle className="spinner" size={18} />
          {t('正在建立核查任务…', 'Creating the review task…')}
        </div>
      )}
      {loadingRun && (
        <div className="company-run-loading">
          <LoaderCircle className="spinner" size={18} />
          {t('正在读取研究记录…', 'Loading research records…')}
        </div>
      )}
      {run && (
        <>
          <section className="company-run-heading">
            <div>
              <h2>
                {run.identity?.companyName || run.identity?.shortName || run.input.securityCode}
              </h2>
              <p>
                {run.input.securityCode} · {run.input.year} {t('年度', 'FY')} ·{' '}
                {purposeName(run.input.purpose, t)} · {date(run.createdAt, locale)}
              </p>
            </div>
            <div className="company-run-actions">
              <Tag>
                {activeRun(run) && <LoaderCircle className="spinner" size={12} />} {status(run)}
              </Tag>
              {run.agent && activeRun(run) && (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={changingRun || run.agent.cancelRequested}
                  onClick={() => changeRun('cancel')}
                >
                  {t('取消', 'Cancel')}
                </button>
              )}
              {!pausedMarket && run.status === 'failed' && run.agent?.recoverable && (
                <button
                  type="button"
                  className="button button-primary"
                  disabled={changingRun}
                  onClick={() => changeRun('resume')}
                >
                  <RefreshCw size={14} />
                  {t('恢复核查', 'Resume review')}
                </button>
              )}
            </div>
          </section>
          {pausedMarket && (
            <div className="warning-box" role="note">
              <CircleAlert size={17} aria-hidden="true" />
              <p>
                {t(
                  '美股研究暂未开放。这份历史记录及原件仍可查看；外币金额不参与当前人民币核查。',
                  'US research is paused. This saved record and its original remain available; foreign-currency amounts are excluded from current CNY reviews.'
                )}
              </p>
            </div>
          )}
          {run.agent && <CompanyRunOverview run={run} />}
          {(run.stoppedReason || run.error) && (
            <section className="company-stopped">
              <CircleAlert size={18} />
              <div>
                <h3>{t('检索在这里停止', 'Retrieval stopped here')}</h3>
                <p>
                  {t(
                    run.stoppedReason || run.error || '',
                    translateRule(run.stoppedReason || run.error || '')
                  )}
                </p>
                <p>
                  {t(
                    '未取得的材料不补成事实。你可以重试新查询或导入自己的材料。',
                    'Unavailable evidence is not filled in as fact. Start another retrieval or import your own documents.'
                  )}
                </p>
                <p>{annualMaterialRequest}</p>
                <p>{purposeMaterialRequest}</p>
                <button type="button" className="button button-secondary" onClick={importOwn}>
                  {t('导入年度财务材料', 'Import annual financial evidence')}
                </button>
              </div>
            </section>
          )}
          {pollError && (
            <div className="inline-error">
              <CircleAlert size={16} />
              {pollError}
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setPollError('');
                  setPollVersion((value) => value + 1);
                }}
              >
                {t('重新读取进度', 'Read progress again')}
              </button>
            </div>
          )}
          {run.preview && <CompanyFinancialFindings run={run} onPage={openPage} />}
          <CompanyFinancialTrends key={run.id} run={run} onPage={openPage} />
          {run.preview?.checks.some((check) => check.status === 'fail') && (
            <div className="company-check-stop" role="note">
              <CircleAlert size={16} />
              <div>
                <strong>{t('财务字段有待复核', 'Financial fields require review')}</strong>
                {run.preview.checks
                  .filter((check) => check.status === 'fail')
                  .map((check) => (
                    <p key={check.id}>{t(check.message, translateRule(check.message))}</p>
                  ))}
              </div>
            </div>
          )}
          {run.agent && <CompanyEvidenceResults run={run} onEvidence={openEvidence} />}
          {run.preview && candidate && (
            <section className="company-candidate">
              <div className="report-section-title">
                <h2>
                  {run.status === 'adopted'
                    ? t('财务材料', 'Financial evidence')
                    : t('财务候选项', 'Financial candidates')}
                </h2>
                <Tag>
                  {run.status === 'adopted'
                    ? t('已保存', 'Saved')
                    : t('待人工确认', 'Requires confirmation')}
                </Tag>
              </div>
              <p className="section-intro">
                {t(
                  run.status === 'adopted'
                    ? '材料已保存，以下保留初始提取检查；所采用输入与结果见核查报告。'
                    : '采用前核对金额、单位、年度与报表范围；字段一致不认证材料。',
                  run.status === 'adopted'
                    ? 'Evidence is saved. The original extraction checks remain below; adopted inputs and results are in the review.'
                    : 'Check values, units, years and scope before adoption; matching fields do not authenticate documents.'
                )}
              </p>
              <div className="company-source-summary">
                <div>
                  <strong>{candidate.title}</strong>
                  <p>
                    {candidate.company} · {candidate.documentDate}
                  </p>
                </div>
                <a
                  className="button button-secondary"
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download size={15} />
                  {originalIsPdf
                    ? t('打开原件', 'Open original')
                    : t('下载原件', 'Download original')}
                </a>
              </div>
              {run.preview.warnings.length > 0 && (
                <details className="company-candidate-warnings">
                  <summary>
                    {t('提取中需要核对的事项', 'Extraction checks to review')} ·{' '}
                    {run.preview.warnings.length}
                  </summary>
                  <ul>
                    {run.preview.warnings.map((warning, index) => (
                      <li key={index}>{locale === 'en' ? translateRule(warning) : warning}</li>
                    ))}
                  </ul>
                </details>
              )}
              {run.preview.checks.length > 0 && (
                <details className="company-candidate-checks">
                  <summary>
                    {t('规则检查结果', 'Rule-check results')} · {run.preview.checks.length}
                  </summary>
                  <p className="field-note">
                    {t(
                      '这些检查针对原始提取结果；保存后将在核查任务中重新计算。',
                      'These checks apply to the extracted candidates. The review recalculates after you save confirmed inputs.'
                    )}
                  </p>
                  <ul>
                    {run.preview.checks.map((check) => (
                      <li key={check.id}>
                        <span>
                          {check.status === 'pass' ? (
                            <CheckCircle2 size={15} />
                          ) : (
                            <CircleAlert size={15} />
                          )}
                        </span>
                        <div>
                          <strong>{t(check.label, translateRule(check.label))}</strong>
                          <p>{t(check.message, translateRule(check.message))}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {run.status === 'adopted' ? (
                <div className="company-adopted">
                  <CheckCircle2 size={18} />
                  <span>
                    {t('这次查询的材料已保存。', 'Evidence from this retrieval has been saved.')}
                  </span>
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run.adoptedMaterialId &&
                      createReview(run.adoptedMaterialId, candidate.company)
                    }
                  >
                    {t('查看核查报告', 'View review report')}
                    <ArrowRight size={15} />
                  </button>
                </div>
              ) : (
                <form onSubmit={adopt}>
                  <details className="company-candidate-edit">
                    <summary>
                      {t('核对与编辑候选', 'Inspect and edit candidates')} ·{' '}
                      {candidate.observations.length}
                    </summary>
                    <div className="company-candidate-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => {
                          setCandidate({
                            ...candidate,
                            observations: candidate.observations.filter(
                              (obs) => obs.scope === 'consolidated' && obs.period === 'annual'
                            ),
                          });
                          setConfirmed(false);
                        }}
                        disabled={
                          !candidate.observations.some(
                            (obs) => obs.scope === 'consolidated' && obs.period === 'annual'
                          )
                        }
                      >
                        {t('仅保留合并年度项', 'Keep consolidated annual items')}
                      </button>
                      <button
                        type="button"
                        className="text-link"
                        aria-pressed={detailedColumns}
                        onClick={() => setDetailedColumns((v) => !v)}
                      >
                        {detailedColumns
                          ? t('收起期间与币种', 'Hide period and currency')
                          : t('编辑期间与币种', 'Edit period and currency')}
                      </button>
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => {
                          setCandidate(run.preview!.material);
                          setConfirmed(false);
                        }}
                      >
                        {t('恢复提取结果', 'Restore extracted candidates')}
                        <RefreshCw size={13} />
                      </button>
                    </div>
                    <p className="field-note">
                      {candidate.observations.length}{' '}
                      {t(
                        '项仍保留；未知范围或期间不能自动补为合并年度。',
                        'items retained. Unknown scope or period is not automatically replaced with consolidated annual scope.'
                      )}
                    </p>
                    <p className="comparison-mobile-hint">
                      {t(
                        '左右滑动核对每项金额与口径；点击页码看原文。',
                        'Swipe to review amounts and scope; select a page to inspect the source.'
                      )}
                    </p>
                    <div className="table-wrap company-candidate-table-wrap">
                      <table
                        className={`company-candidate-table${detailedColumns ? ' detailed' : ''}`}
                      >
                        <thead>
                          <tr>
                            <th>{t('指标', 'Metric')}</th>
                            <th>{t('金额', 'Amount')}</th>
                            <th>{t('单位', 'Unit')}</th>
                            <th>{t('年度', 'Year')}</th>
                            {detailedColumns && <th>{t('期间', 'Period')}</th>}
                            <th>{t('范围', 'Scope')}</th>
                            {detailedColumns && <th>{t('币种', 'Currency')}</th>}
                            <th>{t('原文', 'Source')}</th>
                            <th>
                              <span className="sr-only">{t('删除', 'Remove')}</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {candidate.observations.map((obs, index) => (
                            <tr key={`${obs.id}-${index}`}>
                              <th>
                                {metricName(obs.key, locale)}
                                {obs.kind === 'derived' && obs.components?.length ? (
                                  <details className="company-derived-components">
                                    <summary>
                                      {t('原文分组求和', 'Sum of source components')} ·{' '}
                                      {obs.components.length}
                                    </summary>
                                    <p className="field-note">
                                      {t(
                                        '合计由原始分组计算；不以差额补平。',
                                        'The total is calculated from source components; no residual is added.'
                                      )}
                                    </p>
                                    <ul>
                                      {obs.components.map((component, componentIndex) => (
                                        <li key={componentIndex}>
                                          <span>{component.label}</span>
                                          <code>{component.value} CNY</code>
                                          {component.page != null && (
                                            <button
                                              type="button"
                                              className="text-link"
                                              onClick={() => openPage(component.page)}
                                            >
                                              PDF {component.page}
                                            </button>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                ) : null}
                              </th>
                              <td>
                                <input
                                  required
                                  inputMode="decimal"
                                  pattern="-?[0-9]+([.][0-9]{1,10})?"
                                  value={obs.value}
                                  readOnly={
                                    obs.kind === 'derived' && Boolean(obs.components?.length)
                                  }
                                  aria-label={`${metricName(obs.key, locale)} · ${obs.year} · ${t('金额', 'amount')}`}
                                  onChange={(event) =>
                                    updateObservation(index, { value: event.target.value })
                                  }
                                />
                              </td>
                              <td>
                                <Select
                                  aria-label={`${metricName(obs.key, locale)} · ${obs.year} · ${t('单位', 'unit')}`}
                                  value={obs.unit}
                                  onValueChange={(selectedValue) =>
                                    updateObservation(index, {
                                      unit: selectedValue as Observation['unit'],
                                    })
                                  }
                                >
                                  <option value="yuan">{t('元', 'Yuan')}</option>
                                  <option value="wan">{t('万元', '10,000 yuan')}</option>
                                  <option value="yi">{t('亿元', '100m yuan')}</option>
                                </Select>
                              </td>
                              <td>
                                <input
                                  required
                                  type="number"
                                  min="2000"
                                  max="2100"
                                  value={obs.year}
                                  aria-label={`${metricName(obs.key, locale)} · ${t('年度', 'year')} · ${index + 1}`}
                                  onChange={(event) =>
                                    updateObservation(index, { year: Number(event.target.value) })
                                  }
                                />
                              </td>
                              {detailedColumns && (
                                <td>
                                  <Select
                                    value={obs.period || 'unknown'}
                                    aria-label={`${metricName(obs.key, locale)} · ${obs.year} · ${t('期间', 'period')}`}
                                    onValueChange={(selectedValue) =>
                                      updateObservation(index, {
                                        period: selectedValue as Observation['period'],
                                      })
                                    }
                                  >
                                    <option value="annual">{t('全年', 'Annual')}</option>
                                    <option value="interim">{t('半年', 'Interim')}</option>
                                    <option value="quarterly">{t('季度', 'Quarterly')}</option>
                                    <option value="unknown">{t('待确认', 'Unconfirmed')}</option>
                                  </Select>
                                </td>
                              )}
                              <td>
                                <Select
                                  value={obs.scope}
                                  aria-label={`${metricName(obs.key, locale)} · ${obs.year} · ${t('范围', 'scope')}`}
                                  onValueChange={(selectedValue) =>
                                    updateObservation(index, {
                                      scope: selectedValue as Observation['scope'],
                                    })
                                  }
                                >
                                  <option value="consolidated">{t('合并', 'Consolidated')}</option>
                                  <option value="parent">{t('母公司', 'Parent company')}</option>
                                  <option value="unknown">{t('待确认', 'Unconfirmed')}</option>
                                </Select>
                              </td>
                              {detailedColumns && (
                                <td>
                                  <input
                                    required
                                    maxLength={5}
                                    value={obs.currency}
                                    aria-label={`${metricName(obs.key, locale)} · ${obs.year} · ${t('币种', 'currency')}`}
                                    onChange={(event) =>
                                      updateObservation(index, { currency: event.target.value })
                                    }
                                  />
                                </td>
                              )}
                              <td>
                                {obs.page != null ? (
                                  <button
                                    type="button"
                                    className="text-link"
                                    onClick={() => openPage(obs.page)}
                                  >
                                    PDF {obs.page}
                                    <ArrowUpRight size={12} />
                                  </button>
                                ) : (
                                  <span className="muted">
                                    {t('页码未确认', 'Page unconfirmed')}
                                  </span>
                                )}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="icon-button"
                                  aria-label={`${t('移除候选', 'Remove candidate')} ${metricName(obs.key, locale)} · ${obs.year}`}
                                  onClick={() => {
                                    setCandidate({
                                      ...candidate,
                                      observations: candidate.observations.filter(
                                        (_, i) => i !== index
                                      ),
                                    });
                                    setConfirmed(false);
                                  }}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                  <label className="company-confirm">
                    <input
                      type="checkbox"
                      required
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    <span>
                      {t(
                        '我已对照原件核对公司主体、金额、单位、币种、年度、期间与范围，确认保存所保留的候选作为本次核查输入。',
                        'I have checked the company, retained amounts, units, currency, years, periods and scopes against the original, and confirm saving them as review inputs.'
                      )}
                    </span>
                  </label>
                  <div className="inline-actions">
                    <button
                      className="button button-primary"
                      type="submit"
                      disabled={
                        busy ||
                        activeRun(run) ||
                        run.status === 'failed' ||
                        !confirmed ||
                        !candidate.observations.length
                      }
                    >
                      {busy ? <LoaderCircle className="spinner" size={15} /> : <Check size={15} />}{' '}
                      {t('采用并核查', 'Adopt and review')}
                    </button>
                    <span className="field-note">
                      {t(
                        '保存材料后生成财报核查，并自动进行 AI 解读。',
                        'Evidence is saved and a financial review is created with automatic AI interpretation.'
                      )}
                    </span>
                  </div>
                </form>
              )}
              <details className="company-file-metadata">
                <summary>{t('文件与来源信息', 'File and source metadata')}</summary>
                <dl>
                  <dt>{t('文件名', 'Filename')}</dt>
                  <dd>{candidate.filename}</dd>
                  <dt>SHA-256</dt>
                  <dd>
                    <code>{candidate.sha256}</code>
                  </dd>
                  <dt>{t('公开来源', 'Public source')}</dt>
                  <dd>
                    {candidate.sourceUrl && (
                      <a
                        href={safeUrl(candidate.sourceUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {candidate.sourceUrl}
                      </a>
                    )}
                  </dd>
                </dl>
              </details>
            </section>
          )}

          <details className="company-trace company-record-details">
            <summary>{t('检索步骤', 'Retrieval steps')}</summary>
            <div className="report-section-title">
              <h2 id="company-trace-title">{t('检索记录', 'Retrieval record')}</h2>
              <span className="field-note">
                {t('实际工具输入、输出与依据', 'Actual tool inputs, outputs and evidence')}
              </span>
            </div>
            {locale === 'en' &&
              run.trace.some((step) =>
                /[\u4e00-\u9fff]/.test(step.outputSummary || step.inputSummary)
              ) && (
                <p className="field-note">Original retrieval summaries are retained in Chinese.</p>
              )}
            <ol>
              {run.trace.map((step, index) => (
                <TraceStep
                  key={step.id}
                  step={step}
                  index={index}
                  onPage={(source) => {
                    if (
                      source.page != null &&
                      source.sha256 &&
                      source.sha256 === run.preview?.material.sha256
                    )
                      openPage(source.page);
                    else
                      setSource({
                        title: source.title,
                        page: source.page ?? null,
                        quote: '',
                        url: source.url,
                        sha256: source.sha256,
                      });
                  }}
                />
              ))}
            </ol>
            {run.trace.length === 0 && (
              <p className="section-intro">
                {t('尚无工具执行记录。', 'No tool execution has been recorded yet.')}
              </p>
            )}
          </details>
          {run.announcements.length > 0 && (
            <details className="company-announcements company-record-details">
              <summary>{t('公告与来源', 'Announcements and sources')}</summary>
              <div className="report-section-title">
                <h2>{t('已检索公告', 'Retrieved announcements')}</h2>
                <Tag>{run.announcements.length}</Tag>
              </div>
              <ul>
                {run.announcements
                  .filter((item) => item.category === 'annual')
                  .map((announcement) => (
                    <AnnouncementRow key={announcement.id} announcement={announcement} />
                  ))}
              </ul>
              {run.announcements.some((item) => item.category === 'recent') && (
                <details className="company-recent-announcements">
                  <summary>
                    {t('近期公告线索', 'Recent disclosure leads')} ·{' '}
                    {run.announcements.filter((item) => item.category === 'recent').length}
                  </summary>
                  <p className="field-note">
                    {t(
                      '此处提供标题和原件链接，尚未逐份阅读；公告本身不等于风险事件。',
                      'Titles and original links are listed here; each document has not been read. A disclosure is not automatically a risk event.'
                    )}
                  </p>
                  <ul>
                    {run.announcements
                      .filter((item) => item.category === 'recent')
                      .map((announcement) => (
                        <AnnouncementRow key={announcement.id} announcement={announcement} />
                      ))}
                  </ul>
                </details>
              )}
            </details>
          )}
          <div className="company-model-status">
            <span>{t('AI 解读', 'AI interpretation')}</span>
            <Tag>
              {activeRun(run) && run.model.requested
                ? t('等待解读结果', 'Awaiting interpretation')
                : run.model.status === 'not-called'
                  ? t('未生成解读', 'Interpretation not generated')
                  : run.model.status === 'completed'
                    ? t('已完成', 'Completed')
                    : run.model.status === 'failed'
                      ? t('未完成', 'Incomplete')
                      : run.model.status === 'not-configured'
                        ? t('暂不可用', 'Unavailable')
                        : t('未生成解读', 'Interpretation not generated')}
            </Tag>
            {run.model.error && <p>{t(run.model.error, translateRule(run.model.error))}</p>}
          </div>
        </>
      )}
      {!run && !results && !selected && !searching && !loadingRun && !historyLoading && (
        <p className="company-import-link">
          {t('没有公开资料？', 'No public disclosure?')}{' '}
          <button className="text-link" onClick={importOwn}>
            {t('上传自己的材料', 'Upload your own evidence')}
            <ArrowUpRight size={14} />
          </button>
        </p>
      )}
      {historyLoading && !history.length && (
        <p className="company-import-link" role="status">
          {t('正在读取研究记录…', 'Loading research records…')}
        </p>
      )}
      {(history.length > 0 || historyError) && (
        <details className="company-history company-record-details">
          <summary>{t(...productTerms.researchRecords)}</summary>
          <div className="report-section-title">
            <h2>{t(...productTerms.researchRecords)}</h2>
            <button className="text-link" type="button" onClick={loadHistory}>
              {t('刷新', 'Refresh')}
              <RefreshCw size={13} />
            </button>
          </div>
          {historyError && <p className="inline-error">{historyError}</p>}
          <ul>
            {history.map((item) => (
              <li key={item.id}>
                <div className="company-history-row">
                  <button
                    type="button"
                    onClick={() => navigate(`/company?run=${item.id}`)}
                    aria-current={run?.id === item.id ? 'page' : undefined}
                  >
                    <span>
                      <strong>
                        {item.identity?.shortName || item.input.securityCode} · {item.input.year}
                      </strong>
                      <small>
                        {purposeName(item.input.purpose, t)} · {date(item.createdAt, locale)}
                      </small>
                    </span>
                    <Tag>{status(item)}</Tag>
                    <ArrowRight size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={activeRun(item) || busy}
                    onClick={() => removeRun(item)}
                    aria-label={`${t('删除研究记录', 'Delete research record')} · ${item.identity?.shortName || item.input.securityCode} · ${item.input.year}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      {source && (
        <Dialog
          title={t('材料原文', 'Source text')}
          onClose={() => setSource(null)}
          variant="drawer"
          className="company-source-drawer"
        >
          <div className="company-source-content">
            <h3>{source.title}</h3>
            {source.page != null && <Tag>PDF {source.page}</Tag>}
            {locale === 'en' && /[\u4e00-\u9fff]/.test(source.quote) && (
              <p className="field-note">Original source text in Chinese.</p>
            )}
            {source.observations?.length ? (
              <div className="company-source-fields">
                {source.observations.map((obs) => (
                  <div key={obs.id}>
                    <strong>
                      {metricName(obs.key, locale)} · {obs.year}
                    </strong>
                    <span className="mono">
                      {obs.value}{' '}
                      {obs.unit === 'yuan'
                        ? t('元', 'yuan')
                        : obs.unit === 'wan'
                          ? t('万元', '10,000 yuan')
                          : t('亿元', '100m yuan')}{' '}
                      · {obs.currency}
                    </span>
                    <small>
                      {obs.scope === 'consolidated'
                        ? t('合并', 'Consolidated')
                        : obs.scope === 'parent'
                          ? t('母公司', 'Parent company')
                          : t('范围待确认', 'Scope unconfirmed')}{' '}
                      ·{' '}
                      {obs.period === 'annual'
                        ? t('全年', 'Annual')
                        : obs.period === 'interim'
                          ? t('半年', 'Interim')
                          : obs.period === 'quarterly'
                            ? t('季度', 'Quarterly')
                            : t('期间待确认', 'Period unconfirmed')}
                    </small>
                  </div>
                ))}
              </div>
            ) : null}
            {source.quote && <blockquote>{source.quote}</blockquote>}
            <div className="inline-actions">
              {source.sha256 && source.sha256 === run?.preview?.material.sha256 && (
                <a
                  className="button button-secondary"
                  href={`${fileUrl}${source.page != null ? `#page=${source.page}` : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('打开保留原件', 'Open retained original')}
                  <ArrowUpRight size={14} />
                </a>
              )}
              {source.url && safeUrl(source.url) && (
                <a
                  className="text-link"
                  href={safeUrl(source.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('公开来源', 'Public source')}
                  <ArrowUpRight size={14} />
                </a>
              )}
            </div>
            {originalIsPdf &&
              source.page != null &&
              source.sha256 === run?.preview?.material.sha256 && (
                <details className="company-inline-pdf">
                  <summary>{t('在此查看 PDF 页', 'View PDF page here')}</summary>
                  <iframe
                    src={`${fileUrl}#page=${source.page}`}
                    title={`${source.title} · PDF ${source.page}`}
                  />
                </details>
              )}
            {source.sha256 && (
              <details className="company-file-metadata">
                <summary>{t('文件标识', 'File identity')}</summary>
                <code>{source.sha256}</code>
              </details>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}

function TraceStep({
  step,
  index,
  onPage,
}: {
  step: CompanyAgentTrace;
  index: number;
  onPage: (source: CompanyAgentTrace['sources'][number]) => void;
}) {
  const { t, locale } = useApp();
  return (
    <li className={`company-trace-step company-trace-${step.status}`}>
      <span className="company-trace-marker" aria-hidden="true">
        {step.status === 'running' ? (
          <LoaderCircle className="spinner" size={14} />
        ) : step.status === 'completed' ? (
          <Check size={14} />
        ) : step.status === 'failed' ? (
          <CircleAlert size={14} />
        ) : (
          index + 1
        )}
      </span>
      <div>
        <details open={step.status === 'running' || step.status === 'failed'}>
          <summary>
            <strong>{t(step.label, translateRule(step.label))}</strong>
            <Tag>
              {step.status === 'running'
                ? t('执行中', 'Running')
                : step.status === 'completed'
                  ? t('已完成', 'Completed')
                  : step.status === 'failed'
                    ? t('失败', 'Failed')
                    : t('已跳过', 'Skipped')}
            </Tag>
            <span className="mono">
              {date(step.startedAt, locale)}
              {step.finishedAt && ` → ${date(step.finishedAt, locale)}`}
            </span>
            <ChevronDown size={14} />
          </summary>
          <dl>
            <dt>{t('工具', 'Tool')}</dt>
            <dd>
              <code>{step.tool}</code>
            </dd>
            <dt>{t('输入摘要', 'Input summary')}</dt>
            <dd>{t(step.inputSummary, translateRule(step.inputSummary))}</dd>
            {step.outputSummary && (
              <>
                <dt>{t('输出摘要', 'Output summary')}</dt>
                <dd>{t(step.outputSummary, translateRule(step.outputSummary))}</dd>
              </>
            )}
            {step.decision && (
              <>
                <dt>{t('下一步依据', 'Next-step basis')}</dt>
                <dd>{t(step.decision, translateRule(step.decision))}</dd>
              </>
            )}
          </dl>
          {step.sources.length > 0 && (
            <ul>
              {step.sources.map((source, i) => (
                <li key={`${source.url}-${source.page}-${i}`}>
                  <a
                    className="text-link"
                    href={safeUrl(source.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.title}
                    <ArrowUpRight size={12} />
                  </a>
                  {source.page != null && (
                    <button className="text-link" type="button" onClick={() => onPage(source)}>
                      PDF {source.page}
                      <FileText size={12} />
                    </button>
                  )}
                  {source.sha256 && (
                    <details className="company-trace-hash">
                      <summary>SHA-256</summary>
                      <code>{source.sha256}</code>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </details>
      </div>
    </li>
  );
}

function AnnouncementRow({ announcement }: { announcement: CompanyAnnouncement }) {
  const { t, locale } = useApp();
  return (
    <li>
      <FileText size={16} />
      <div>
        <a href={safeUrl(announcement.sourceUrl)} target="_blank" rel="noopener noreferrer">
          {announcement.title}
          <ArrowUpRight size={13} />
        </a>
        <small>
          {date(announcement.publishedAt, locale)} ·{' '}
          {announcement.category === 'annual'
            ? t('年度报告', 'Annual report')
            : t('近期公告', 'Recent disclosure')}
        </small>
      </div>
    </li>
  );
}
