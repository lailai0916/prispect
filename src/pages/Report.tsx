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
import { ModelExplanation } from '../ModelExplanation';
import { ReviewContext, purposeName } from '../ReviewContext';

import { useApp, adjustments } from '../context';
import {
  ActionMenu,
  PageHeading,
  EmptyState,
  Tag,
  TaskTag,
  VerdictTag,
  Dialog,
} from '../components';
import '../review-pages.css';

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
              {t('返回财报核查', 'Financial reviews')}
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
        <a href="#/workspace">{t('财报核查', 'Financial reviews')}</a>
        <ChevronRight size={14} />
        <span>{t('核查报告', 'Review')}</span>
        <code>{task.id.slice(0, 8)}</code>
      </div>
      <PageHeading
        title={task.title}
        description={`${task.company} · ${task.year} ${t('年度', 'FY')} · ${purposeName(task.purpose, t)} · ${t('创建于', 'Created')} ${date(task.createdAt, locale)}`}
        action={
          <div className="report-actions">
            {report && (
              <>
                <button className="button button-secondary" onClick={() => setStressOpen(true)}>
                  <SlidersHorizontal size={16} />
                  {t('调整证据', 'Adjust evidence')}
                </button>
                <ActionMenu
                  label={t('报告操作', 'Report actions')}
                  items={[
                    {
                      label: t('下载报告（HTML）', 'Download report (HTML)'),
                      icon: <Download size={15} />,
                      onSelect: () => {
                        const anchor = document.createElement('a');
                        anchor.href = `/api/tasks/${task.id}/export?format=html`;
                        anchor.download = '';
                        anchor.click();
                      },
                    },
                    {
                      label: t('打印报告', 'Print report'),
                      icon: <Printer size={15} />,
                      onSelect: () => window.print(),
                    },
                  ]}
                />
              </>
            )}
          </div>
        }
      />
      {task.excludedMetrics.length > 0 && (
        <div className="stress-notice">
          <SlidersHorizontal size={18} />
          <p>
            <strong>{t('本次已调整证据。', 'Evidence adjusted for this review.')}</strong>{' '}
            {t('本次人工移除：', 'Excluded for this review:')}{' '}
            {task.excludedMetrics.map((key) => metricName(key, locale)).join(' / ')}。
            {t(
              '仅限制本次使用的指标，不表示公司未披露；原任务和原件保留。',
              'Only the inputs used in this run are restricted. This does not imply non-disclosure; original reviews and sources remain.'
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
                  ? t('核查未完成', 'Review incomplete')
                  : t('正在核查', 'Review in progress')}
              </h2>
              <p>
                {t(
                  '处理完成后，报告将显示在这里。',
                  'Your report will appear here when processing is complete.'
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
                {t('重试', 'Retry')}
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
            {t('处理记录', 'Processing records')}
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
  const { t, locale, execute, showEvidence, navigate, busy } = useApp();
  const [section, setSection] = useState<'evidence' | 'explanations' | 'requests' | 'scope'>(
    'evidence'
  );
  const getMetric = (key: string) => report.metrics.find((metric) => metric.key === key);
  const metrics = [
    getMetric('netProfit'),
    getMetric('operatingCashFlow'),
    getMetric('cashConversion'),
  ];
  const englishHeadline =
    report.verdict === 'conflict'
      ? 'Input checks conflict; cash-bridge attribution has stopped.'
      : report.verdict === 'insufficient'
        ? 'Required evidence is missing.'
        : report.verdict === 'attention'
          ? 'Operating cash is below net profit.'
          : 'The disclosed cash amounts reconcile.';
  const englishSummary =
    report.verdict === 'conflict'
      ? 'Source fields or bridge reconciliation conflict. Review the failed checks and original observations before attributing operating causes.'
      : report.verdict === 'insufficient'
        ? 'Some required observations are missing or cannot be confirmed. The review retains supported numbers and withholds unsupported ratios or explanations.'
        : `For ${report.year}, consolidated net profit is CNY ${money(getMetric('netProfit')?.value ?? null, locale, false)} and operating cash flow is CNY ${money(getMetric('operatingCashFlow')?.value ?? null, locale, false)}. The cash conversion is ${metricValue(getMetric('cashConversion'), locale)}. This is a historical review clue, not a credit decision.`;
  return (
    <div className="report-content">
      <div className="report-decision-entry">
        <span>{t('继续核查本次安排', 'Continue this review')}</span>
        <button
          className="text-link"
          onClick={() => navigate(`/decisions?new=${task.purpose || 'external'}&task=${task.id}`)}
        >
          {t('新建核查事项', 'New review matter')}
          <ArrowRight size={14} />
        </button>
      </div>
      <section className={`verdict-section verdict-${report.verdict}`}>
        <div className="verdict-topline">
          <VerdictTag verdict={report.verdict} />
          <span className="evidence-coverage">
            <span className="coverage-marks">
              {Array.from({ length: report.coverage.total }, (_, i) => (
                <i key={i} className={i < report.coverage.present ? 'covered' : ''} />
              ))}
            </span>
            {report.coverage.present}/{report.coverage.total} {t('核心指标', 'core metrics')}
          </span>
        </div>
        <h2>
          {report.verdict === 'conflict'
            ? t(
                '输入核对存在冲突，已停止现金桥解释',
                'Input checks conflict; cash-bridge attribution has stopped'
              )
            : getMetric('cashConversion')?.value != null
              ? t(
                  `${report.year}年现金利润比 ${metricValue(getMetric('cashConversion'), locale)}`,
                  `${report.year} cash-to-profit ratio: ${metricValue(getMetric('cashConversion'), locale)}`
                )
              : t('部分指标尚无足够依据', 'Some metrics lack sufficient evidence')}
        </h2>
        <p>
          {t(
            '经营现金净额 ÷ 合并净利润，不是销售回款率。',
            'Operating cash flow ÷ consolidated net profit, not a sales collection rate.'
          )}
        </p>
        <details className="verdict-details">
          <summary>{t('查看核查摘要', 'Review summary')}</summary>
          <p>{t(report.headline, englishHeadline)}</p>
          <p>{t(report.summary, englishSummary)}</p>
        </details>
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
      <nav className="report-local-nav" aria-label={t('报告内容', 'Report sections')}>
        {(
          [
            ['evidence', t('图表与来源', 'Charts and sources')],
            ['explanations', t('解释', 'Explanations')],
            ['requests', t('待询证', 'Evidence requests')],
            ['scope', t('模型与范围', 'Model and scope')],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            aria-current={section === value ? 'page' : undefined}
            aria-controls={`report-panel-${value}`}
            onClick={() => setSection(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div id="report-panel-evidence" hidden={section !== 'evidence'}>
        <div className="report-two-column">
          <div className="report-primary">
            <section className="report-section">
              <div className="report-section-title">
                <div>
                  <h2>{t('现金桥', 'Cash bridge')}</h2>
                </div>
                <Tag>{report.year} · CNY</Tag>
              </div>
              {report.bridge ? (
                <>
                  <p className="section-intro">
                    {t(
                      '选择柱形，查看金额、页码与原文。',
                      'Select a bar to inspect its amount, page and source.'
                    )}
                  </p>
                  <CashBridge steps={report.bridge} report={report} />
                  <div className="chart-legend">
                    <span>
                      <i className="legend-dot ink" />
                      {t('起点与终点', 'Starting and ending amounts')}
                    </span>
                    <span>
                      <i className="legend-dot teal" />
                      {t('正向调整', 'Positive adjustments')}
                    </span>
                    <span>
                      <i className="legend-dot amber" />
                      {t('负向调整', 'Negative adjustments')}
                    </span>
                  </div>
                  <details className="chart-caption chart-notes">
                    <summary>{t('图表口径', 'Chart scope')}</summary>
                    <p>
                      {t(
                        '调整项不是现金余额或未来预测。图形标签已舍入，精确金额显示在所选项中；经营性应收调整不等于单一应收账款余额变化，负向调整不能直接证明坏账或滞销。',
                        'Adjustments are not cash balances or forecasts. Plot labels are rounded; the selected item shows exact amounts. Operating receivables adjustments are not simply changes in accounts receivable, and negative adjustments alone do not prove bad debt or slow inventory.'
                      )}
                    </p>
                  </details>
                </>
              ) : (
                <div className="bridge-unavailable">
                  <h3>{t('现金桥未生成', 'Cash bridge unavailable')}</h3>
                  <p>
                    {report.verdict === 'conflict'
                      ? t(
                          '现有输入或现金桥核对存在冲突。金额与原文保留，请先复核下方口径检查，再解释经营原因。',
                          'The inputs or bridge reconciliation conflict. Amounts and sources remain visible; resolve the scope checks below before attributing operating causes.'
                        )
                      : t(
                          '缺少同口径调整项。请补充下方待询证材料；利润与现金的差额不能代替原因解释。',
                          'Consistent adjustment items are missing. Request the evidence below; a profit-to-cash gap does not explain its causes.'
                        )}
                  </p>
                  <a
                    className="text-link"
                    href="#questions"
                    onClick={(event) => {
                      event.preventDefault();
                      setSection('requests');
                      requestAnimationFrame(() =>
                        document.getElementById('questions')?.scrollIntoView({
                          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                            ? 'auto'
                            : 'smooth',
                        })
                      );
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
                  <h2>{t('年度对比', 'Annual comparison')}</h2>
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
              <h2>{t('所用材料', 'Materials used')}</h2>
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
      </div>
      <div id="report-panel-explanations" hidden={section !== 'explanations'}>
        <section className="report-section findings-section">
          <div className="report-section-title">
            <div>
              <h2>{t('可能解释', 'Possible explanations')}</h2>
            </div>
          </div>
          <div className="findings-list">
            {report.findings.map((finding, index) => (
              <article className={`finding-row finding-${finding.severity}`} key={finding.id}>
                <span className="finding-number">{index + 1}</span>
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
                      {finding.questionIds.length} {t('条待询证问题', 'evidence requests')}
                    </span>
                  )}
                </div>
                {finding.sourceRefs.length > 0 && (
                  <button
                    className="button button-secondary"
                    onClick={() => showEvidence(finding.sourceRefs, report)}
                  >
                    <FileText size={15} />
                    {t('来源', 'Source')}
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
      <div id="report-panel-requests" hidden={section !== 'requests'}>
        <details className="report-context-details">
          <summary>{t('付款背景与跟进', 'Payment context and follow-up')}</summary>
          <ReviewContext task={task} report={report} />
        </details>
        <section className="report-section questions-section" id="questions">
          <div className="report-section-title">
            <div>
              <h2>{t('待询证清单', 'Evidence requests')}</h2>
            </div>
            <Tag tone="green">
              {report.questions.filter((question) => question.status === 'done').length}/
              {report.questions.length} {t('已完成', 'done')}
            </Tag>
          </div>
          <p className="section-intro">
            {t(
              '勾选仅记录跟进完成，不代表财务问题已证实或解决。',
              'Checking an item records follow-up only; it does not prove a financial issue is resolved.'
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
                    aria-label={`${t('标记完成', 'Mark complete')}: ${t(question.text, translateRule(question.text))}`}
                    type="checkbox"
                    checked={question.status === 'done'}
                    disabled={busy}
                    onChange={(event) =>
                      execute(
                        () =>
                          api<AnalysisTask>(`/tasks/${task.id}/questions/${question.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                              status: event.target.checked ? 'done' : 'open',
                            }),
                          }),
                        t('跟进状态已保存', 'Follow-up saved')
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
      </div>
      <div id="report-panel-scope" hidden={section !== 'scope'}>
        <section className="report-limitations">
          <div>
            <h3>
              <ShieldCheck size={18} />
              {t('核查范围', 'Review scope')}
            </h3>
            <p className="scope-line">
              {t(
                '仅核对历史年度合并报表，不作投资、授信或合作决策。',
                'Historical consolidated financial evidence only; no investment, credit or partnership decisions.'
              )}
            </p>
            <details>
              <summary>{t('范围详情', 'Scope details')}</summary>
              <ul>
                {report.limitations.map((item, index) => (
                  <li key={index}>{t(item, translateRule(item))}</li>
                ))}
              </ul>
            </details>
            <p className="model-status">
              <Activity size={15} />
              {report.model.status === 'not-requested'
                ? t('模型未启用', 'Model off')
                : report.model.status === 'not-configured'
                  ? t('模型未配置', 'Model not configured')
                  : report.model.status === 'failed'
                    ? report.model.error?.includes('未调用')
                      ? t(
                          '证据条件不足，未调用模型',
                          'Evidence conditions not met; model not called'
                        )
                      : t(
                          '模型调用或检查未完成，规则结果保留',
                          'Model call or checks incomplete; rule results retained'
                        )
                    : t('模型解释已完成', 'Model explanation complete')}
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
                      '只检查引用、格式与允许金额，不认证解释含义。模型文字不是新增证据。',
                      'Citation, format and permitted-number checks do not verify meaning. Model text is not new evidence.'
                    )}
                  </p>
                </div>
                <ModelExplanation
                  report={report}
                  onSource={(_title, refs) => showEvidence(refs, report)}
                />
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
      </div>
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
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
  const selected = bars[activeIndex ?? selectedIndex]?.step;
  const source = selected?.sourceRefs[0];
  const material = report.snapshot.find((item) => item.id === source?.materialId);
  const openStep = (index: number) => {
    setSelectedIndex(index);
    showEvidence(bars[index].step.sourceRefs, report);
  };
  return (
    <>
      <p className="chart-mobile-hint">
        <span aria-hidden="true">↔</span>
        {t(
          '左右滑动，查看完整现金桥；点柱核对原文。',
          'Swipe to see the full bridge; select a bar to inspect its source.'
        )}
      </p>
      <div className="cash-visual">
        <div className={`chart-scroll ${activeIndex !== null ? 'lens-active' : ''}`}>
          <svg
            className="bridge-chart"
            onMouseLeave={() => setActiveIndex(null)}
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
                  (step) =>
                    `${metricName(step.key, locale)}: ${money(step.value, locale, false)} CNY`
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
                  className={`chart-bar-group ${index === activeIndex ? 'is-active' : ''} ${index === selectedIndex ? 'is-selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${label} ${money(step.value, locale, false)} CNY. ${t('查看原文', 'View source')}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => {
                    setActiveIndex(index);
                    setSelectedIndex(index);
                  }}
                  onBlur={() => setActiveIndex(null)}
                  onClick={() => openStep(index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openStep(index);
                    } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                      event.preventDefault();
                      const next =
                        event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? bars.length - 1
                            : Math.max(
                                0,
                                Math.min(
                                  bars.length - 1,
                                  index + (event.key === 'ArrowRight' ? 1 : -1)
                                )
                              );
                      (
                        event.currentTarget.parentElement?.querySelectorAll('[role="button"]')[
                          next
                        ] as SVGElement | undefined
                      )?.focus();
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
                        ? 'chart-bar bar-total'
                        : isPositive
                          ? 'chart-bar bar-positive'
                          : 'chart-bar bar-negative'
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
                  <text
                    x={x + barWidth / 2}
                    y={331}
                    textAnchor="middle"
                    className="bar-source-label"
                  >
                    {step.derived ? t('分组计算', 'Grouped') : t('披露值', 'Reported')}{' '}
                    <tspan>↗</tspan>
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        {selected && (
          <div
            className="evidence-lens"
            aria-label={t('所选现金桥项目', 'Selected cash bridge item')}
          >
            <div className="lens-value">
              <span>{metricName(selected.key, locale)}</span>
              <strong>
                {money(selected.value, locale, false)} <small>CNY</small>
              </strong>
            </div>
            <div className="lens-source">
              <span>
                {report.year} ·{' '}
                {source?.page != null
                  ? `${t('PDF 页', 'PDF p.')} ${source.page}`
                  : t('页码未提供', 'Page not provided')}
                {selected.sourceRefs.length > 1
                  ? ` · ${selected.sourceRefs.length} ${t('条来源', 'sources')}`
                  : ''}
              </span>
              <p lang={locale === 'en' ? 'zh-Hans' : undefined} title={source?.quote}>
                {source?.quote || t('未提供原文摘录', 'No source excerpt provided')}
              </p>
              <small>{material?.title || t('未匹配材料', 'Material not matched')}</small>
            </div>
            <button
              className="button button-secondary"
              onClick={() => openStep(activeIndex ?? selectedIndex)}
            >
              <FileText size={15} />
              {t('查看来源', 'View source')}
            </button>
          </div>
        )}
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
      <h2>{t('口径检查', 'Scope checks')}</h2>
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
            ? t('调整证据', 'Evidence adjusted')
            : t('恢复完整证据', 'Full evidence restored')
        ),
        company: task.company,
        year: task.year,
        materialIds: task.materialIds,
        excludedMetrics: excluded,
        purpose: task.purpose || 'external',
        useModel,
      } satisfies CreateTaskInput)
    );
    if (next) {
      onClose();
      navigate(`/tasks/${next.id}`);
    }
  };
  return (
    <Dialog title={t('调整证据', 'Adjust evidence')} onClose={onClose}>
      <p>
        {t(
          '修改本次采用的指标，另存新的核查。原任务和原件保留。',
          'Change the metrics used and save a new review. Original reviews and sources remain.'
        )}
      </p>
      <div className="stress-option-group">
        <button className="text-link" onClick={() => setExcluded(adjustments)}>
          {t('排除全部调整项', 'Exclude all adjustments')}
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
          <strong>{t('添加模型解释', 'Add model explanation')}</strong>
          <small>
            {t(
              '默认不向模型发送材料；选中后将采用的指标、短摘录与规则分析发送至第三方 TokenFlux。解释含义需人工复核。',
              'No evidence is sent to a model by default. Selecting this sends adopted metrics, short excerpts and rule findings to third-party TokenFlux. Meaning requires human review.'
            )}
          </small>
        </span>
      </label>
      <div className="warning-box">
        <CircleAlert size={19} />
        <p>
          {t(
            '排除调整项后，相应现金桥和原因解释将撤回；可恢复指标并重新核查。',
            'Excluding adjustments withholds the corresponding bridge and explanations. Restore the metrics and rerun to recover them.'
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
            ? t('恢复并重算', 'Restore and rerun')
            : t('保存并重算', 'Save and rerun')}
        </button>
      </div>
    </Dialog>
  );
}
