import { useEffect, useState, type FormEvent } from 'react';
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
import { api, post, requestErrorText } from '../api';
import { useApp } from '../context';
import { PageHeading, Tag } from '../components';
import { date, metricName } from '../format';
import { purposeName } from '../ReviewContext';
import { translateRule } from '../ruleTranslations';

type CandidateMaterial = Omit<Material, 'id' | 'createdAt'>;
const safeUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined);
const sameIdentity = (a: CompanyIdentity | null, b: CompanyIdentity) =>
  a?.orgId === b.orgId && a.securityCode === b.securityCode;
const activeRun = (run: CompanyResearchRun | null) =>
  run?.status === 'queued' || run?.status === 'running';

export function CompanyAgentPage({ query }: { query: URLSearchParams }) {
  const { t, locale, workspace, navigate, execute, busy, confirm } = useApp();
  const initialQuery = query.get('query') || '';
  const runId = query.get('run');
  const [search, setSearch] = useState(initialQuery);
  const [results, setResults] = useState<CompanySearchResponse | null>(null);
  const [selected, setSelected] = useState<CompanyIdentity | null>(null);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [purpose, setPurpose] = useState<ReviewPurpose>(
    query.get('purpose') === 'handover' ? 'handover' : 'external'
  );
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [useModel, setUseModel] = useState(false);
  const [run, setRun] = useState<CompanyResearchRun | null>(null);
  const [history, setHistory] = useState<CompanyResearchRun[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [loadingRun, setLoadingRun] = useState(Boolean(runId));
  const [pollError, setPollError] = useState('');
  const [pollVersion, setPollVersion] = useState(0);
  const [candidate, setCandidate] = useState<CandidateMaterial | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [page, setPage] = useState<number | null>(null);
  const previewVersion = run?.preview?.material.sha256;

  const loadHistory = async () => {
    try {
      setHistory(await api<CompanyResearchRun[]>('/company-runs'));
      setHistoryError('');
    } catch (cause) {
      setHistoryError(requestErrorText(cause, locale));
    }
  };
  const findCompanies = async (value: string, signal?: AbortSignal) => {
    if (!value.trim()) return;
    setSearching(true);
    setError('');
    setResults(null);
    setSelected(null);
    try {
      setResults(
        await api<CompanySearchResponse>(
          `/companies/search?q=${encodeURIComponent(value.trim())}`,
          { signal }
        )
      );
    } catch (cause) {
      if (!signal?.aborted) setError(requestErrorText(cause, locale));
    } finally {
      if (!signal?.aborted) setSearching(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    void api<CompanyResearchRun[]>('/company-runs', { signal: controller.signal })
      .then(setHistory)
      .catch((cause) => {
        if (!controller.signal.aborted) setHistoryError(requestErrorText(cause, locale));
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
    setPage(null);
  }, [run?.id, previewVersion]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    if (search.trim() === initialQuery && !runId) void findCompanies(search);
    else navigate(`/company?query=${encodeURIComponent(search.trim())}&purpose=${purpose}`);
  };
  const start = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || creating) return;
    setCreating(true);
    setError('');
    try {
      const next = await post<CompanyResearchRun>('/company-runs', {
        securityCode: selected.securityCode,
        orgId: selected.orgId,
        year,
        purpose,
        useModel,
      } satisfies CompanyRunInput);
      navigate(`/company?run=${next.id}`);
    } catch (cause) {
      setError(requestErrorText(cause, locale));
    } finally {
      setCreating(false);
    }
  };
  const adopt = async (event: FormEvent) => {
    event.preventDefault();
    if (!run || !candidate || !confirmed || !candidate.observations.length) return;
    const response = await execute(
      () =>
        post<CompanyAdoptResponse>(`/company-runs/${run.id}/adopt`, {
          confirmed: true,
          material: candidate,
        } satisfies CompanyAdoptInput),
      t('已确认并保存候选材料', 'Candidate evidence confirmed and saved')
    );
    if (response)
      navigate(
        `/new?case=custom&material=${response.material.id}&year=${run.input.year}&purpose=${run.input.purpose || 'external'}`
      );
  };
  const removeRun = (item: CompanyResearchRun) =>
    confirm({
      title: t('删除这份查询记录？', 'Delete this retrieval record?'),
      text: t(
        '查询记录及未采用原件将删除；已保存材料和财务报告保留。',
        'The retrieval record and unadopted original are removed. Saved evidence and financial reviews remain.'
      ),
      action: async () => {
        const result = await execute(
          () => api<{ ok: true }>(`/company-runs/${item.id}`, { method: 'DELETE' }),
          t('查询记录已删除', 'Retrieval record deleted')
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
    setPage(number);
    if (number != null)
      requestAnimationFrame(() =>
        document.getElementById('company-source-preview')?.scrollIntoView({
          block: 'start',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        })
      );
  };
  const importOwn = () => navigate(`/new?case=custom&purpose=${run?.input.purpose || purpose}`);
  const fileUrl = run ? `/api/company-runs/${run.id}/file` : '';
  const status = (item: CompanyResearchRun) =>
    item.status === 'ready' && (item.stoppedReason || !item.preview)
      ? t('材料不足', 'Evidence unavailable')
      : {
          queued: t('等待检索', 'Queued'),
          running: t('正在检索', 'Retrieving'),
          ready: t('待确认候选', 'Awaiting confirmation'),
          failed: t('检索停止', 'Retrieval stopped'),
          adopted: t('材料已采用', 'Evidence adopted'),
        }[item.status];

  return (
    <div className="company-agent">
      <PageHeading
        title={t('企业查询', 'Company lookup')}
        description={t(
          '确认公司主体，检索公开公告，核对原件后采用财务证据。',
          'Confirm the company, retrieve public disclosures, then review original documents before adopting financial evidence.'
        )}
      />
      <form className="company-search-form" onSubmit={submitSearch}>
        <label className="form-field">
          <span>{t('公司名称或证券代码', 'Company name or security code')}</span>
          <input
            type="search"
            required
            maxLength={80}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t(
              '例如：松原安全、海康威视、300893',
              'Chinese company name or code, e.g. 300893'
            )}
          />
        </label>
        <button className="button button-primary" type="submit" disabled={searching || creating}>
          {searching ? <LoaderCircle size={16} className="spinner" /> : <Search size={16} />}{' '}
          {t('查询主体', 'Find company')}
        </button>
      </form>
      <p className="company-coverage-note">
        {t(
          '当前检索巨潮资讯的大陆 A 股披露。未匹配或未取得资料，不代表公司没有风险；未接入天眼查或企业信用全库。',
          'Current coverage is mainland A-share disclosure on CNINFO. No match or unavailable data does not establish the absence of risk. Tianyancha and full company-credit databases are not connected.'
        )}
      </p>
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
      {results && !run && (
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
                    onClick={() => setSelected(identity)}
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
              <p>
                {t(
                  '核对名称与代码，或使用自己的公司材料。当前查询不覆盖所有企业。',
                  'Check the name or code, or use your own documents. This search does not cover every company.'
                )}
              </p>
              <button type="button" className="button button-secondary" onClick={importOwn}>
                {t('导入材料核查', 'Review imported evidence')}
              </button>
            </div>
          )}
        </section>
      )}
      {selected && !run && (
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
          <div className="company-run-fields">
            <label className="form-field">
              <span>{t('财务年度', 'Financial year')}</span>
              <input
                type="number"
                required
                min="2010"
                max={new Date().getUTCFullYear() - 1}
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
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
          <label className="model-opt-in">
            <input
              type="checkbox"
              checked={useModel}
              disabled={!workspace?.provider.configured || creating}
              onChange={(event) => setUseModel(event.target.checked)}
            />
            <span>
              <strong>
                {t('启用公开材料智能辅助', 'Enable assistance with public documents')}
              </strong>
              <small>
                {t(
                  '默认关闭。选中后，将本次公司的公开主体、公告信息、相关表格短文及规则核对的财务事实发送至第三方 TokenFlux，辅助选择证据页与解释。模型生成金额不能作为来源，候选仍须人工确认。',
                  'Off by default. Selecting this sends the public company identity, announcement metadata, relevant table excerpts and rule-checked financial facts to third-party TokenFlux for evidence-page selection and explanation. Model-generated amounts are not evidence; candidates require your confirmation.'
                )}
              </small>
              {!workspace?.provider.configured && (
                <small>
                  {t(
                    '当前未配置模型，可继续规则检索。',
                    'No model is configured; rules retrieval remains available.'
                  )}
                </small>
              )}
            </span>
          </label>
          <div className="inline-actions">
            <button className="button button-primary" type="submit" disabled={creating}>
              {creating ? <LoaderCircle className="spinner" size={16} /> : <ArrowRight size={16} />}{' '}
              {t('检索公告与财务证据', 'Retrieve disclosures and evidence')}
            </button>
            <span className="field-note">
              {t(
                '不会查询私人材料、跟进备注或现金工作表。',
                'Private evidence, follow-up notes and cash worksheets are not included.'
              )}
            </span>
          </div>
        </form>
      )}
      {loadingRun && (
        <div className="company-run-loading">
          <LoaderCircle className="spinner" size={18} />
          {t('读取已保存的查询记录…', 'Reading the saved retrieval run…')}
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
            <Tag>
              {activeRun(run) && <LoaderCircle className="spinner" size={12} />} {status(run)}
            </Tag>
          </section>
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
                <button type="button" className="button button-secondary" onClick={importOwn}>
                  {t('导入材料核查', 'Review imported evidence')}
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
          <section className="company-trace" aria-labelledby="company-trace-title">
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
                  onPage={openPage}
                  canPreview={Boolean(run.preview)}
                />
              ))}
            </ol>
            {run.trace.length === 0 && (
              <p className="section-intro">
                {t('尚无工具执行记录。', 'No tool execution has been recorded yet.')}
              </p>
            )}
          </section>
          {run.announcements.length > 0 && (
            <section className="company-announcements">
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
            </section>
          )}
          {run.preview && candidate && (
            <section className="company-candidate">
              <div className="report-section-title">
                <h2>{t('财务候选项', 'Financial candidates')}</h2>
                <Tag>{t('待人工确认', 'Requires confirmation')}</Tag>
              </div>
              <p className="section-intro">
                {t(
                  '候选来自下载原件的提取，尚未成为核查事实。逐项核对金额、单位、年度、期间与报表范围；输入一致不代表原件真实性已核验。',
                  'Candidates were extracted from the downloaded source and are not yet adopted facts. Check amounts, units, years, periods and scope; consistent input does not authenticate an original document.'
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
                  {t('打开下载原件', 'Open downloaded original')}
                </a>
              </div>
              {run.preview.warnings.length > 0 && (
                <details className="company-candidate-warnings" open>
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
                    onClick={() =>
                      navigate(
                        `/new?case=custom&material=${run.adoptedMaterialId}&year=${run.input.year}&purpose=${run.input.purpose || 'external'}`
                      )
                    }
                  >
                    {t('用已保存材料核查', 'Review the saved evidence')}
                    <ArrowRight size={15} />
                  </button>
                </div>
              ) : (
                <form onSubmit={adopt}>
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
                    <table className="company-candidate-table">
                      <thead>
                        <tr>
                          <th>{t('指标', 'Metric')}</th>
                          <th>{t('金额', 'Amount')}</th>
                          <th>{t('单位', 'Unit')}</th>
                          <th>{t('年度', 'Year')}</th>
                          <th>{t('期间', 'Period')}</th>
                          <th>{t('范围', 'Scope')}</th>
                          <th>{t('币种', 'Currency')}</th>
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
                                readOnly={obs.kind === 'derived' && Boolean(obs.components?.length)}
                                aria-label={`${metricName(obs.key, locale)} · ${obs.year} · ${t('金额', 'amount')}`}
                                onChange={(event) =>
                                  updateObservation(index, { value: event.target.value })
                                }
                              />
                            </td>
                            <td>
                              <select
                                aria-label={`${metricName(obs.key, locale)} · ${obs.year} · ${t('单位', 'unit')}`}
                                value={obs.unit}
                                onChange={(event) =>
                                  updateObservation(index, {
                                    unit: event.target.value as Observation['unit'],
                                  })
                                }
                              >
                                <option value="yuan">{t('元', 'Yuan')}</option>
                                <option value="wan">{t('万元', '10,000 yuan')}</option>
                                <option value="yi">{t('亿元', '100m yuan')}</option>
                              </select>
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
                            <td>
                              <select
                                value={obs.period || 'unknown'}
                                aria-label={`${metricName(obs.key, locale)} · ${obs.year} · ${t('期间', 'period')}`}
                                onChange={(event) =>
                                  updateObservation(index, {
                                    period: event.target.value as Observation['period'],
                                  })
                                }
                              >
                                <option value="annual">{t('全年', 'Annual')}</option>
                                <option value="interim">{t('半年', 'Interim')}</option>
                                <option value="quarterly">{t('季度', 'Quarterly')}</option>
                                <option value="unknown">{t('待确认', 'Unconfirmed')}</option>
                              </select>
                            </td>
                            <td>
                              <select
                                value={obs.scope}
                                aria-label={`${metricName(obs.key, locale)} · ${obs.year} · ${t('范围', 'scope')}`}
                                onChange={(event) =>
                                  updateObservation(index, {
                                    scope: event.target.value as Observation['scope'],
                                  })
                                }
                              >
                                <option value="consolidated">{t('合并', 'Consolidated')}</option>
                                <option value="parent">{t('母公司', 'Parent company')}</option>
                                <option value="unknown">{t('待确认', 'Unconfirmed')}</option>
                              </select>
                            </td>
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
                                <span className="muted">{t('页码未确认', 'Page unconfirmed')}</span>
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
                      disabled={busy || !confirmed || !candidate.observations.length}
                    >
                      {busy ? <LoaderCircle className="spinner" size={15} /> : <Check size={15} />}{' '}
                      {t('确认保存并核查', 'Confirm, save and review')}
                    </button>
                    <span className="field-note">
                      {t(
                        '下一步独立创建财务核查；模型授权默认关闭。',
                        'The next step creates a separate financial review with model permission off by default.'
                      )}
                    </span>
                  </div>
                </form>
              )}
              {page != null && (
                <section className="company-source-preview" id="company-source-preview">
                  <div className="report-section-title">
                    <h3>
                      {t('下载原件', 'Downloaded original')} · PDF {page}
                    </h3>
                    <a
                      className="text-link"
                      href={`${fileUrl}#page=${page}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('新标签打开', 'Open in a new tab')}
                      <ArrowUpRight size={14} />
                    </a>
                  </div>
                  <iframe
                    src={`${fileUrl}#page=${page}`}
                    title={`${candidate.title} · PDF ${page}`}
                  />
                  <div className="company-original-excerpts">
                    {candidate.observations
                      .filter((obs) => obs.page === page)
                      .map((obs, index) => (
                        <blockquote key={`${obs.id}-${index}`}>
                          <span>
                            {metricName(obs.key, locale)} · {obs.year}
                          </span>
                          <p>{obs.quote}</p>
                        </blockquote>
                      ))}
                  </div>
                </section>
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
          <div className="company-model-status">
            <span>{t('公开材料智能辅助', 'Public-document model assistance')}</span>
            <Tag>
              {activeRun(run) && run.model.requested
                ? t('已授权，等待结果', 'Authorized; awaiting result')
                : run.model.status === 'not-called'
                  ? t('已授权，未调用', 'Authorized; not called')
                  : run.model.status === 'completed'
                    ? t('已调用', 'Called')
                    : run.model.status === 'failed'
                      ? t('智能辅助未完成', 'Assistance incomplete')
                      : run.model.status === 'not-configured'
                        ? t('未配置', 'Not configured')
                        : t('未授权调用', 'Not requested')}
            </Tag>
            {run.model.provider && (
              <small>
                {run.model.provider} · {run.model.name}
              </small>
            )}
            {run.model.error && <p>{t(run.model.error, translateRule(run.model.error))}</p>}
          </div>
        </>
      )}
      {!run && !selected && !searching && !loadingRun && (
        <section className="company-import-fallback">
          <h2>{t('使用自己的材料', 'Use your own documents')}</h2>
          <p>
            {t(
              '非上市公司或公开资料不足时，可导入财报与补充材料，确认口径后核查。',
              'For unlisted companies or insufficient public data, import financial statements and supplementary documents, confirm their scope, then review.'
            )}
          </p>
          <button className="button button-secondary" onClick={importOwn}>
            {t('导入材料核查', 'Review imported evidence')}
          </button>
        </section>
      )}
      {(history.length > 0 || historyError) && (
        <section className="company-history">
          <div className="report-section-title">
            <h2>{t('查询历史', 'Retrieval history')}</h2>
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
                    aria-label={`${t('删除查询记录', 'Delete retrieval record')} · ${item.identity?.shortName || item.input.securityCode} · ${item.input.year}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TraceStep({
  step,
  index,
  onPage,
  canPreview,
}: {
  step: CompanyAgentTrace;
  index: number;
  canPreview: boolean;
  onPage: (page: number | null) => void;
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
                  {source.page != null && canPreview && (
                    <button
                      className="text-link"
                      type="button"
                      onClick={() => onPage(source.page!)}
                    >
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
