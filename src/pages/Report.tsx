import { useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Columns3,
  Download,
  FileText,
  Layers,
  LoaderCircle,
  Printer,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type {
  AnalysisTask,
  BridgeStep,
  CreateTaskInput,
  MetricKey,
  Report,
  Workspace,
} from '../../shared/contracts';
import { api, post } from '../api';
import { chartScale, reviewVariantTitle, date, metricName, metricValue, money } from '../format';
import { translateRule } from '../ruleTranslations';

import { useApp, adjustments } from '../context';
import { PageHeading, EmptyState, Tag, TaskTag, VerdictTag, Dialog } from '../components';

export function TaskPage({ id }: { id: string }) {
  const { t, locale, workspace, execute, navigate, refresh } = useApp();
  const task = workspace!.tasks.find((item) => item.id === id);
  const [stressOpen, setStressOpen] = useState(false);
  if (!task)
    return (
      <EmptyState
        title={t('未找到这份核查', 'Review not found')}
        text={t(
          '任务可能已被删除，或工作区暂未同步。',
          'The task may have been deleted, or the workspace is not synced yet.'
        )}
        action={
          <div className="inline-actions">
            <button className="button button-secondary" onClick={() => refresh()}>
              <RefreshCw size={16} />
              {t('刷新', 'Refresh')}
            </button>
            <button className="button button-primary" onClick={() => navigate('/workspace')}>
              {t('返回工作台', 'Workspace')}
            </button>
          </div>
        }
      />
    );
  const retry = async () => {
    await execute(() => post<AnalysisTask>(`/tasks/${task.id}/retry`, {}));
  };
  const report = task.report;
  return (
    <>
      <div className="breadcrumb">
        <a href="#/workspace">{t('工作台', 'Workspace')}</a>
        <ChevronRight size={14} />
        <span>{t('核查底稿', 'Review working paper')}</span>
        <code>{task.id.slice(0, 8)}</code>
      </div>
      <PageHeading
        eyebrow={t('一条说法，一份可追溯的底稿', 'ONE CLAIM. ONE TRACEABLE WORKING PAPER.')}
        title={task.title}
        description={`${task.company} · ${task.year} ${t('年度', 'FY')} · ${t('创建于', 'Created')} ${date(task.createdAt, locale)}`}
        action={
          <div className="report-actions">
            {report && (
              <>
                <button className="button button-secondary" onClick={() => setStressOpen(true)}>
                  <SlidersHorizontal size={16} />
                  {t('证据压力测试', 'Stress test')}
                </button>
                <a
                  className="button button-secondary"
                  href={`/api/tasks/${task.id}/export?format=html`}
                  download
                >
                  <Download size={16} />
                  {t('导出 HTML', 'Export HTML')}
                </a>
                <button
                  className="icon-button"
                  title={t('打印报告', 'Print report')}
                  onClick={() => window.print()}
                >
                  <Printer size={18} />
                </button>
              </>
            )}
          </div>
        }
      />
      {task.excludedMetrics.length > 0 && (
        <div className="stress-notice">
          <SlidersHorizontal size={18} />
          <p>
            <strong>
              {t('这是一次输入材料压力测试。', 'This is an evidence-input stress test.')}
            </strong>{' '}
            {t('本次人工移除：', 'Excluded for this review:')}{' '}
            {task.excludedMetrics.map((key) => metricName(key, locale)).join(' / ')}。
            {t(
              '它表示本次未提供这些观测，不表示公司没有披露。原任务与原件保留。',
              'This means those observations were not supplied in this run, not that the company failed to disclose them. Original reviews and sources remain.'
            )}
          </p>
        </div>
      )}
      {task.status !== 'completed' ? (
        <section className="execution-panel">
          <div className="execution-heading">
            <div className="execution-icon">
              {task.status === 'failed' ? <CircleAlert size={30} /> : <Activity size={30} />}
            </div>
            <div>
              <TaskTag status={task.status} />
              <h2>
                {task.status === 'failed'
                  ? t('本次处理未完成', 'This review could not complete')
                  : t('材料正在进入核查流程', 'Evidence is moving through the review')}
              </h2>
              <p>
                {t(
                  '下面显示实际处理阶段与事件，不使用模拟百分比。',
                  'Stages and timestamps below reflect real work. No simulated progress percentage.'
                )}
              </p>
            </div>
          </div>
          <StageList task={task} />
          {task.error && (
            <div className="inline-error">
              <CircleAlert size={17} />
              {t(task.error, translateRule(task.error))}
            </div>
          )}
          {task.status === 'failed' && (
            <div className="inline-actions">
              <button className="button button-primary" onClick={retry}>
                <RefreshCw size={16} />
                {t('重试真实处理', 'Retry processing')}
              </button>
              <button className="button button-secondary" onClick={() => navigate('/new')}>
                {t('用新材料核查', 'Review new evidence')}
              </button>
            </div>
          )}
        </section>
      ) : report ? (
        <ReportView task={task} report={report} />
      ) : (
        <div className="inline-error">
          {t(
            '任务已完成但报告缺失，请重试处理。',
            'The task completed but no report is available. Please retry.'
          )}
          <button className="button button-secondary" onClick={retry}>
            {t('重试', 'Retry')}
          </button>
        </div>
      )}
      {task.status === 'completed' && (
        <details className="execution-details">
          <summary>
            <Activity size={16} />
            {t('查看实际处理记录', 'View processing records')}
            <ChevronDown size={16} />
          </summary>
          <StageList task={task} />
        </details>
      )}
      {stressOpen && <StressDialog task={task} onClose={() => setStressOpen(false)} />}
    </>
  );
}

export function StageList({ task }: { task: AnalysisTask }) {
  const { t, locale } = useApp();
  const stageEn: Record<string, string> = {
    read: 'Read saved input snapshot',
    explain: 'Interpretation and evidence requests',
    load: 'Load saved evidence',
    validate: 'Verify scope and input',
    calculate: 'Calculate cash metrics',
    analyse: 'Review financial evidence',
    analyze: 'Review financial evidence',
    report: 'Build evidence report',
    model: 'Optional model explanation',
    save: 'Persist review snapshot',
    parse: 'Read structured observations',
  };
  return (
    <ol className="stage-list">
      {task.stages.map((stage, index) => (
        <li key={stage.key} className={`stage-${stage.status}`}>
          <span className="stage-marker">
            {stage.status === 'completed' ? (
              <Check size={16} />
            ) : stage.status === 'failed' ? (
              <X size={16} />
            ) : stage.status === 'running' ? (
              <LoaderCircle size={16} className="spinner" />
            ) : (
              <span>{index + 1}</span>
            )}
          </span>
          <div>
            <strong>{t(stage.label, stageEn[stage.key] || `Processing: ${stage.key}`)}</strong>
            {stage.message && <p>{t(stage.message, translateRule(stage.message))}</p>}
          </div>
          <span className="stage-time mono">
            {stage.finishedAt
              ? date(stage.finishedAt, locale)
              : stage.startedAt
                ? date(stage.startedAt, locale)
                : '—'}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function ReportView({ task, report }: { task: AnalysisTask; report: Report }) {
  const { t, locale, execute, showEvidence, navigate } = useApp();
  const getMetric = (key: string) => report.metrics.find((metric) => metric.key === key);
  const metrics = [
    getMetric('netProfit'),
    getMetric('operatingCashFlow'),
    getMetric('cashConversion'),
  ];
  const englishHeadline =
    report.verdict === 'conflict'
      ? 'The reporting scopes do not align.'
      : report.verdict === 'insufficient'
        ? 'The evidence sets the limit of this conclusion.'
        : report.verdict === 'attention'
          ? 'Profit and operating cash need a closer look.'
          : 'Current evidence supports this cash structure.';
  const englishSummary =
    report.verdict === 'conflict'
      ? 'Conflicting scopes cannot be silently combined. Correct the source observations before interpreting the cash relationship.'
      : report.verdict === 'insufficient'
        ? 'Some required observations are missing or cannot be confirmed. The review retains supported numbers and withholds unsupported ratios or explanations.'
        : `For ${report.year}, consolidated net profit is CNY ${money(getMetric('netProfit')?.value ?? null, locale, false)} and operating cash flow is CNY ${money(getMetric('operatingCashFlow')?.value ?? null, locale, false)}. The cash conversion is ${metricValue(getMetric('cashConversion'), locale)}. This is a historical review clue, not a credit decision.`;
  return (
    <div className="report-content">
      <section className={`verdict-section verdict-${report.verdict}`}>
        <div className="verdict-topline">
          <VerdictTag verdict={report.verdict} />
          <span className="evidence-coverage">
            <span className="coverage-marks">
              {Array.from({ length: report.coverage.total }, (_, i) => (
                <i key={i} className={i < report.coverage.present ? 'covered' : ''} />
              ))}
            </span>
            {report.coverage.present}/{report.coverage.total} {t('证据覆盖', 'evidence coverage')}
          </span>
        </div>
        <h2>{t(report.headline, englishHeadline)}</h2>
        <p>{t(report.summary, englishSummary)}</p>
        <div className="verdict-bottom">
          <ShieldCheck size={16} />
          {t(
            '结论仅针对本次输入材料与历史年度；不构成投资、授信或可靠性判断。',
            'The conclusion covers only this evidence and historical period. It is not an investment, credit, or reliability decision.'
          )}
        </div>
      </section>
      <section className="metric-strip" aria-label={t('核心财务指标', 'Core financial metrics')}>
        {metrics.map((metric, index) => (
          <div className="metric-item" key={index}>
            <div className="metric-label">
              {metricName(
                (['netProfit', 'operatingCashFlow', 'cashConversion'] as const)[index],
                locale
              )}
              {metric && metric.sourceRefs.length > 0 && (
                <button
                  className="icon-button"
                  aria-label={t('查看指标来源', 'View metric sources')}
                  onClick={() => showEvidence(metric.sourceRefs, report)}
                >
                  <FileText size={15} />
                </button>
              )}
            </div>
            <strong className={index === 2 ? 'accent-number' : ''}>
              {metricValue(metric, locale)}
            </strong>
            <span>
              {index < 2 ? (
                <>
                  {t('上年度', 'Previous FY')} {money(metric?.previousValue ?? null, locale)}{' '}
                  <small>CNY</small>
                </>
              ) : (
                <>{t('经营现金 / 合并净利润', 'Operating cash / consolidated net profit')}</>
              )}
            </span>
            {metric && (
              <details className="metric-formula">
                <summary>
                  {t('计算与精确金额', 'Formula and exact amount')}
                  <ChevronDown size={12} />
                </summary>
                <p>{t(metric.formula, translateRule(metric.formula))}</p>
                <p className="mono">
                  {metric.value === null
                    ? t('材料不足，未计算', 'Not calculated: evidence insufficient')
                    : `${money(metric.value, locale, false)} ${metric.unit}`}
                </p>
              </details>
            )}
          </div>
        ))}
      </section>
      <div className="report-two-column">
        <div className="report-primary">
          <section className="report-section">
            <div className="report-section-title">
              <div>
                <div className="eyebrow">FOLLOW THE CASH</div>
                <h2>{t('从利润，到经营现金', 'From profit to operating cash')}</h2>
              </div>
              <Tag>{report.year} · CNY</Tag>
            </div>
            {report.bridge ? (
              <>
                <p className="section-intro">
                  {t(
                    '披露的现金流调整，把净利润连接到经营现金。点击任一柱，核对原文。',
                    'Disclosed cash-flow adjustments connect net profit to operating cash. Select a bar to inspect its source.'
                  )}
                </p>
                <CashBridge steps={report.bridge} report={report} />
                <div className="chart-legend">
                  <span>
                    <i className="legend-dot ink" />
                    {t('利润 / 现金净额', 'Profit / net cash')}
                  </span>
                  <span>
                    <i className="legend-dot teal" />
                    {t('增加现金', 'Cash increase')}
                  </span>
                  <span>
                    <i className="legend-dot amber" />
                    {t('减少现金', 'Cash decrease')}
                  </span>
                </div>
                <p className="chart-caption">
                  {t(
                    '中间柱是对净利润的累计调整，不是银行余额或未来现金预测。图形按金额量级舍入，精确金额见原文。「经营性应收调整」并非单一应收账款余额变化；负向调整不直接证明坏账或滞销。',
                    'Intermediate bars represent cumulative adjustments to profit, not bank balances or future cash. Plot labels are rounded; citations retain exact amounts. Operating receivables adjustments are not simply changes in accounts receivable. Negative adjustments alone do not prove bad debt or slow inventory.'
                  )}
                </p>
              </>
            ) : (
              <div className="bridge-unavailable">
                <Layers size={29} />
                <h3>{t('现金桥没有足够依据', 'The cash bridge is withheld')}</h3>
                <p>
                  {t(
                    '本次材料不能完整支持同口径调整分组。差额不等于已经解释的原因。请依据下方问题单补充材料。',
                    'Current observations do not support the full adjustment groups on a consistent scope. A gap is not an explained cause. Request the evidence listed below.'
                  )}
                </p>
                <a
                  className="text-link"
                  href="#questions"
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById('questions')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  {t('查看补件问题', 'See evidence requests')}
                  <ArrowDown size={15} />
                </a>
              </div>
            )}
          </section>
          <section className="report-section">
            <div className="report-section-title">
              <div>
                <div className="eyebrow">TWO YEARS, ONE SCOPE</div>
                <h2>{t('两年现金与利润', 'Profit and cash across two years')}</h2>
              </div>
            </div>
            <TrendChart report={report} />
            <p className="chart-caption">
              {t(
                '同一家公司、同一报表范围。同比基数为零或负值时，不给出通常增长率。',
                'One company and one reporting scope. Conventional growth rates are withheld for zero or negative prior-year bases.'
              )}
            </p>
          </section>
        </div>
        <aside className="report-secondary">
          <ChecksPanel report={report} />
          <section className="source-panel">
            <div className="eyebrow">SAVED WITH THIS REVIEW</div>
            <h2>{t('本次材料快照', 'Evidence snapshot')}</h2>
            {report.snapshot.map((material) => (
              <button
                className="source-snapshot-row"
                key={material.id}
                onClick={() =>
                  showEvidence(
                    material.observations.slice(0, 8).map((obs) => ({
                      materialId: material.id,
                      page: obs.page,
                      quote: obs.quote,
                      sourceUrl: material.sourceUrl,
                    })),
                    report
                  )
                }
              >
                <FileText size={20} />
                <span>
                  <strong>{material.title}</strong>
                  <small>
                    {material.documentDate} · {t('查看原文与口径', 'Inspect source and scope')}
                  </small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))}
            <p>
              {t(
                '历史报告使用已保存的输入快照，不会被新的导入覆盖。',
                'Historical reports use their saved inputs. New imports do not overwrite them.'
              )}
            </p>
          </section>
        </aside>
      </div>
      <section className="report-section findings-section">
        <div className="report-section-title">
          <div>
            <div className="eyebrow">TWO EXPLANATIONS, OPEN QUESTIONS</div>
            <h2>
              {t('事实有边界，解释留余地。', 'Facts have boundaries. Explanations stay open.')}
            </h2>
          </div>
        </div>
        <div className="findings-list">
          {report.findings.map((finding, index) => (
            <article className={`finding-row finding-${finding.severity}`} key={finding.id}>
              <span className="finding-number">0{index + 1}</span>
              <div>
                <div className="finding-title">
                  <h3>{t(finding.label, translateRule(finding.label))}</h3>
                  <Tag tone={finding.basis === 'management' ? 'amber' : 'neutral'}>
                    {finding.basis === 'management'
                      ? t('管理层说法', 'Management claim')
                      : finding.basis === 'calculation'
                        ? t('派生计算', 'Derived calculation')
                        : t('来源事实', 'Source evidence')}
                  </Tag>
                </div>
                <p>{t(finding.explanation, translateRule(finding.explanation))}</p>
                {finding.questionIds.length > 0 && (
                  <span className="finding-question-link">
                    {t('连接', 'Linked to')} {finding.questionIds.length}{' '}
                    {t('条后续问题', 'follow-up questions')}
                  </span>
                )}
              </div>
              {finding.sourceRefs.length > 0 && (
                <button
                  className="button button-secondary"
                  onClick={() => showEvidence(finding.sourceRefs, report)}
                >
                  <FileText size={15} />
                  {t('原文依据', 'Source evidence')}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
      <section className="report-section questions-section" id="questions">
        <div className="report-section-title">
          <div>
            <div className="eyebrow">THE NEXT USEFUL QUESTION</div>
            <h2>{t('下一步，向合作方要什么？', 'What should you ask the partner for next?')}</h2>
          </div>
          <Tag tone="green">
            {report.questions.filter((question) => question.status === 'done').length}/
            {report.questions.length} {t('已完成', 'done')}
          </Tag>
        </div>
        <p className="section-intro">
          {t(
            '把一个模糊的判断，变成可执行的材料请求。勾选后保存跟进状态，不代表财务问题已被证实或解决。',
            'Turn a vague judgment into an actionable evidence request. Marking a question complete records follow-up only; it does not prove a financial issue is resolved.'
          )}
        </p>
        <div className="question-list">
          {report.questions.map((question, index) => (
            <div
              className={`question-row ${question.status === 'done' ? 'question-done' : ''}`}
              key={question.id}
            >
              <label className="question-checkbox">
                <input
                  aria-label={`${t('标记完成', 'Mark complete')}: ${question.text}`}
                  type="checkbox"
                  checked={question.status === 'done'}
                  onChange={(event) =>
                    execute(() =>
                      api<AnalysisTask>(`/tasks/${task.id}/questions/${question.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: event.target.checked ? 'done' : 'open' }),
                      })
                    )
                  }
                />
                <span>
                  <Check size={16} />
                </span>
              </label>
              <div>
                <span className="question-number">Q{String(index + 1).padStart(2, '0')}</span>
                <h3>{t(question.text, translateRule(question.text))}</h3>
                <p>{t(question.reason, translateRule(question.reason))}</p>
                {question.trigger && (
                  <div className="question-trigger">
                    <span>
                      {question.trigger.year} · {metricName(question.trigger.metric, locale)}
                    </span>
                    <strong className="mono">
                      {money(question.trigger.amount, locale, false)} CNY
                    </strong>
                    <button
                      className="text-link"
                      onClick={() => showEvidence(question.trigger!.sourceRefs, report)}
                    >
                      {t('查看触发依据', 'Inspect triggering evidence')}
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                )}
                <div className="requested-evidence">
                  <FileText size={15} />
                  <span>
                    {t(question.requestedEvidence, translateRule(question.requestedEvidence))}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="report-limitations">
        <div>
          <h3>
            <ShieldCheck size={18} />
            {t('方法与结论边界', 'Method and conclusion boundaries')}
          </h3>
          <ul>
            {report.limitations.map((item, index) => (
              <li key={index}>{t(item, translateRule(item))}</li>
            ))}
          </ul>
          <p className="model-status">
            <Activity size={15} />
            {report.model.status === 'not-requested'
              ? t(
                  '规则核查完成 · 本次未选择智能解释，没有模型调用。',
                  'Rules review complete · Optional model explanation was not requested; no model call made.'
                )
              : report.model.status === 'not-configured'
                ? t(
                    '规则分析完成 · 未配置模型 API，本报告没有外部模型解释。',
                    'Rules-based analysis complete · No model API configured; this report contains no external model explanation.'
                  )
                : report.model.status === 'failed'
                  ? report.model.error?.includes('未调用')
                    ? t(
                        '规则报告可用 · 未满足证据条件，未调用模型。',
                        'Rules report available · Evidence conditions were not met; no model call was made.'
                      )
                    : t(
                        '规则报告可用 · 可选模型调用或输出检查未完成。',
                        'Rules report available · Optional model call or output checks did not complete.'
                      )
                  : t(
                      '规则计算 + 已完成的可选模型解释',
                      'Deterministic calculations + completed optional model explanation'
                    )}
            {report.model.provider && (
              <span>
                {t('第三方服务', 'Third-party service')}: {report.model.provider} ·{' '}
                {report.model.name}
              </span>
            )}
            {report.model.error && (
              <span>{t(report.model.error, translateRule(report.model.error))}</span>
            )}
          </p>
          {report.model.text && (
            <details className="model-explanation">
              <summary>{t('查看可选模型解释', 'View optional model explanation')}</summary>
              <div className="info-strip">
                <CircleAlert size={16} />
                <p>
                  {t(
                    '仅对引用 ID、格式和允许金额做确定性检查，不代表模型解释的含义真实。模型文字不是新增证据。',
                    'Only citation IDs, format, and permitted numbers are checked deterministically. This does not prove the explanation’s meaning. Model text is not new evidence.'
                  )}
                </p>
              </div>
              <p>{report.model.text}</p>
            </details>
          )}
        </div>
        <div className="report-bottom-actions">
          <a
            className="button button-secondary"
            href={`/api/tasks/${task.id}/export?format=json`}
            download
          >
            <Download size={16} />
            {t('下载完整 JSON', 'Download full JSON')}
          </a>
          <button
            className="button button-secondary"
            onClick={() => navigate(`/compare?left=${task.id}`)}
          >
            <Columns3 size={16} />
            {t('与历史任务比较', 'Compare with history')}
          </button>
          <a href="#/method" className="text-link">
            {t('阅读方法说明', 'Read the methodology')}
            <ArrowUpRight size={15} />
          </a>
        </div>
      </section>
      <div className="print-footer">
        CashLens / {task.id} · {report.year} ·{' '}
        {t(
          '历史材料核查，不构成投资或授信意见。',
          'Historical evidence review. No investment or credit advice.'
        )}
      </div>
    </div>
  );
}

export function CashBridge({ steps, report }: { steps: BridgeStep[]; report: Report }) {
  const { locale, t, showEvidence } = useApp();
  let running = 0;
  const bars = steps.map((step) => {
    const value = Number(step.value);
    const start = step.kind === 'total' ? 0 : running;
    const end = step.kind === 'total' ? value : running + value;
    running = end;
    return { step, start, end, value };
  });
  const low = Math.min(0, ...bars.flatMap((bar) => [bar.start, bar.end]));
  const high = Math.max(0, ...bars.flatMap((bar) => [bar.start, bar.end]));
  const spread = high - low || 1;
  const axis = chartScale(Math.max(Math.abs(low), Math.abs(high)), spread, locale, 4);
  const y = (value: number) => 278 - ((value - low) / spread) * 230;
  const width = 800;
  const left = 74;
  const right = 28;
  const available = width - left - right;
  const pitch = available / bars.length;
  const barWidth = Math.min(70, pitch * 0.64);
  return (
    <>
      <p className="chart-mobile-hint">
        <span aria-hidden="true">↔</span>
        {t(
          '左右滑动，查看完整现金桥；点柱核对原文。',
          'Swipe to see the full bridge; select a bar to inspect its source.'
        )}
      </p>
      <div className="chart-scroll">
        <svg
          className="bridge-chart"
          viewBox={`0 0 ${width} 375`}
          role="img"
          aria-labelledby="bridge-title bridge-description"
        >
          <title id="bridge-title">
            {t('净利润到经营现金的现金桥', 'Cash bridge from net profit to operating cash')}
          </title>
          <desc id="bridge-description">
            {steps
              .map(
                (step) => `${metricName(step.key, locale)}: ${money(step.value, locale, false)} CNY`
              )
              .join('; ')}
          </desc>
          {[0, 1, 2, 3, 4].map((i) => {
            const val = low + (spread * i) / 4;
            const position = y(val);
            return (
              <g key={i}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={position}
                  y2={position}
                  className="chart-grid"
                />
                <text x={left - 10} y={position + 4} textAnchor="end" className="chart-axis">
                  {(val / axis.divisor).toFixed(axis.digits)}
                </text>
              </g>
            );
          })}
          <text x={left - 10} y={21} textAnchor="end" className="chart-unit">
            {axis.label}
          </text>
          <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="chart-zero" />
          {bars.map(({ step, start, end, value }, index) => {
            const x = left + pitch * index + (pitch - barWidth) / 2;
            const top = Math.min(y(start), y(end));
            const height = Math.max(3, Math.abs(y(end) - y(start)));
            const isPositive = value >= 0;
            const label =
              locale === 'en'
                ? {
                    netProfit: 'Net profit',
                    operatingCashFlow: 'Operating cash',
                    inventoryAdjustment: 'Inventory',
                    receivablesAdjustment: 'Receivables',
                    payablesAdjustment: 'Payables',
                    otherAdjustments: 'Other adjustments',
                  }[step.key]
                : {
                    netProfit: '净利润',
                    operatingCashFlow: '经营现金',
                    inventoryAdjustment: '存货调整',
                    receivablesAdjustment: '经营性应收',
                    payablesAdjustment: '经营性应付',
                    otherAdjustments: '其余调整',
                  }[step.key];
            return (
              <g
                key={step.key}
                className="chart-bar-group"
                role="button"
                tabIndex={0}
                aria-label={`${label} ${money(step.value, locale, false)} CNY. ${t('查看原文', 'View source')}`}
                onClick={() => showEvidence(step.sourceRefs, report)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    showEvidence(step.sourceRefs, report);
                  }
                }}
              >
                <rect
                  className="chart-hit-area"
                  x={left + pitch * index}
                  y={28}
                  width={pitch}
                  height={323}
                  fill="transparent"
                  pointerEvents="all"
                />
                <rect
                  x={x}
                  y={top}
                  width={barWidth}
                  height={height}
                  rx="2"
                  className={
                    step.kind === 'total'
                      ? 'bar-total'
                      : isPositive
                        ? 'bar-positive'
                        : 'bar-negative'
                  }
                />
                <text x={x + barWidth / 2} y={top - 10} textAnchor="middle" className="bar-value">
                  {step.kind === 'adjustment' && isPositive ? '+' : ''}
                  {(value / axis.divisor).toFixed(2)}
                </text>
                {index < bars.length - 1 && (
                  <line
                    x1={x + barWidth}
                    x2={left + pitch * (index + 1) + (pitch - barWidth) / 2}
                    y1={y(end)}
                    y2={y(end)}
                    className="chart-connector"
                  />
                )}
                <text x={x + barWidth / 2} y={308} textAnchor="middle" className="bar-label">
                  {label}
                </text>
                <text x={x + barWidth / 2} y={331} textAnchor="middle" className="bar-source-label">
                  {step.derived ? t('分组计算', 'Grouped') : t('披露值', 'Reported')}{' '}
                  <tspan>↗</tspan>
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </>
  );
}

export function ChecksPanel({ report }: { report: Report }) {
  const { t, showEvidence } = useApp();
  const visible = report.checks.filter(
    (check) =>
      ['subject', 'group-sum', 'bridge-balance', 'positive-profit', 'growth-base'].includes(
        check.id
      ) || check.status === 'fail'
  );
  const remaining = report.checks.filter((check) => !visible.includes(check));
  const row = (check: Report['checks'][number]) => (
    <div className={`check-row check-${check.status}`} key={check.id}>
      <span className="check-icon">
        {check.status === 'pass' ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
      </span>
      <div>
        <strong>{t(check.label, translateRule(check.label))}</strong>
        <p>{t(check.message, translateRule(check.message))}</p>
        {check.sourceRefs.length > 0 && (
          <button className="text-link" onClick={() => showEvidence(check.sourceRefs, report)}>
            {t('核对来源', 'Check sources')}
            <ArrowUpRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
  return (
    <section className="checks-panel">
      <div className="eyebrow">BEFORE THE CONCLUSION</div>
      <h2>{t('证据与口径检查', 'Evidence and scope checks')}</h2>
      {visible.map(row)}
      {remaining.length > 0 && (
        <details>
          <summary className="checks-toggle">
            {t(`查看全部 ${remaining.length} 项指标检查`, `View ${remaining.length} metric checks`)}
            <ChevronDown size={14} />
          </summary>
          {remaining.map(row)}
        </details>
      )}
    </section>
  );
}

export function TrendChart({ report }: { report: Report }) {
  const { locale, t, showEvidence } = useApp();
  const profit = report.metrics.find((metric) => metric.key === 'netProfit');
  const cash = report.metrics.find((metric) => metric.key === 'operatingCashFlow');
  const values = [profit?.previousValue, cash?.previousValue, profit?.value, cash?.value];
  const numbers = values.map((value) =>
    value === null || value === undefined ? null : Number(value)
  );
  const max = Math.max(0, ...numbers.map((value) => value ?? 0));
  const min = Math.min(0, ...numbers.map((value) => value ?? 0));
  const range = max - min || 1;
  const axis = chartScale(Math.max(Math.abs(min), Math.abs(max)), range, locale, 3);
  const y = (value: number) => 206 - ((value - min) / range) * 155;
  return (
    <div className="trend-block">
      <div className="chart-scroll">
        <svg className="trend-chart" viewBox="0 0 760 280" role="img" aria-labelledby="trend-title">
          <title id="trend-title">
            {t('两年利润与经营现金对比', 'Two-year profit and operating cash comparison')}
          </title>
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <line
                className="chart-grid"
                x1="74"
                x2="727"
                y1={y(min + (range * i) / 3)}
                y2={y(min + (range * i) / 3)}
              />
              <text className="chart-axis" x="62" y={y(min + (range * i) / 3) + 4} textAnchor="end">
                {((min + (range * i) / 3) / axis.divisor).toFixed(axis.digits)}
              </text>
            </g>
          ))}
          <text className="chart-unit" x="63" y="23" textAnchor="end">
            {axis.label}
          </text>
          {numbers.map((number, index) => {
            const x = [180, 262, 470, 552][index];
            return (
              <g key={index}>
                <rect
                  x={x}
                  y={number === null ? y(0) - 2 : Math.min(y(number), y(0))}
                  width="60"
                  height={number === null ? 3 : Math.max(3, Math.abs(y(0) - y(number)))}
                  rx="2"
                  className={index % 2 ? 'bar-positive' : 'bar-total'}
                />
                <text
                  className="bar-value"
                  x={x + 30}
                  y={(number === null ? y(0) : Math.min(y(number), y(0))) - 10}
                  textAnchor="middle"
                >
                  {number === null ? '—' : (number / axis.divisor).toFixed(2)}
                </text>
              </g>
            );
          })}
          <text className="bar-label" x="250" y="245" textAnchor="middle">
            {report.previousYear}
          </text>
          <text className="bar-label" x="540" y="245" textAnchor="middle">
            {report.year}
          </text>
        </svg>
      </div>
      <div className="chart-legend">
        <button onClick={() => showEvidence(profit?.sourceRefs || [], report)}>
          <i className="legend-dot ink" />
          {t('合并净利润', 'Consolidated net profit')}
          <FileText size={13} />
        </button>
        <button onClick={() => showEvidence(cash?.sourceRefs || [], report)}>
          <i className="legend-dot teal" />
          {t('经营活动现金净额', 'Operating cash flow')}
          <FileText size={13} />
        </button>
      </div>
    </div>
  );
}

export function StressDialog({ task, onClose }: { task: AnalysisTask; onClose: () => void }) {
  const { t, locale, workspace, execute, navigate, busy } = useApp();
  const [useModel, setUseModel] = useState(false);
  const [excluded, setExcluded] = useState<MetricKey[]>(
    task.excludedMetrics.length ? task.excludedMetrics : adjustments
  );
  const run = async () => {
    const next = await execute(() =>
      post<AnalysisTask>('/tasks', {
        title: reviewVariantTitle(
          task.title,
          excluded.length
            ? t('压力测试', 'Stress test')
            : t('恢复完整证据', 'Full evidence restored')
        ),
        company: task.company,
        year: task.year,
        materialIds: task.materialIds,
        excludedMetrics: excluded,
        useModel,
      } satisfies CreateTaskInput)
    );
    if (next) {
      onClose();
      navigate(`/tasks/${next.id}`);
    }
  };
  return (
    <Dialog
      title={t('让证据减少，让结论收缩。', 'Less evidence. A narrower conclusion.')}
      onClose={onClose}
    >
      <p>
        {t(
          '选择从本次输入中移除的观测，实际重新执行核查。原报告与原件保持完整。',
          'Choose observations to exclude from a new run. The review is genuinely recomputed; original reports and sources remain intact.'
        )}
      </p>
      <div className="stress-option-group">
        <button className="text-link" onClick={() => setExcluded(adjustments)}>
          {t('移除全部现金补充表调整', 'Exclude all cash supplement adjustments')}
          <ArrowRight size={15} />
        </button>
        {(['netProfit', 'operatingCashFlow', ...adjustments] as MetricKey[]).map((key) => (
          <label className="stress-option" key={key}>
            <input
              type="checkbox"
              checked={excluded.includes(key)}
              onChange={() =>
                setExcluded((previous) =>
                  previous.includes(key)
                    ? previous.filter((item) => item !== key)
                    : [...previous, key]
                )
              }
            />
            <span>{metricName(key, locale)}</span>
            <Tag>{t('不提供', 'Exclude')}</Tag>
          </label>
        ))}
      </div>
      <label className="model-opt-in">
        <input
          type="checkbox"
          checked={useModel}
          disabled={!workspace!.provider.configured}
          onChange={(event) => setUseModel(event.target.checked)}
        />
        <span>
          <strong>
            {t('本次新任务开启可选智能解释', 'Enable optional model explanation for this new run')}
          </strong>
          <small>
            {t(
              '新任务默认规则核查。再次勾选后，仅允许的观测和摘录发送至已配置的第三方服务。',
              'This new task defaults to rules-based review. If selected again, only permitted observations and excerpts are sent to the configured third-party service.'
            )}
          </small>
        </span>
      </label>
      <div className="warning-box">
        <CircleAlert size={19} />
        <p>
          {t(
            '缺少调整附注时，系统应撤回原因归因和完整现金桥，而不是把已算差额包装成解释。',
            'Without adjustment notes, the system must withhold causal attribution and the complete bridge. A calculated gap must not be presented as an explanation.'
          )}
        </p>
      </div>
      <div className="dialog-actions">
        <button className="button button-secondary" onClick={onClose}>
          {t('取消', 'Cancel')}
        </button>
        <button
          className="button button-primary"
          disabled={
            busy ||
            (excluded.length === task.excludedMetrics.length &&
              excluded.every((key) => task.excludedMetrics.includes(key)))
          }
          onClick={run}
        >
          <SlidersHorizontal size={16} />
          {excluded.length === 0
            ? t('恢复全部证据并核查', 'Restore all evidence and rerun')
            : t('新建并重新核查', 'Create and recompute')}
        </button>
      </div>
    </Dialog>
  );
}
