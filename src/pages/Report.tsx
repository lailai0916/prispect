import { useId, useRef, useState } from 'react';
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
  Copy,
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
  CrossSignalCheck,
  MetricKey,
  Report,
  ReviewPurpose,
  Workspace,
} from '../../shared/contracts';
import { api, post } from '../api';
import { chartScale, reviewVariantTitle, date, metricName, metricValue, money } from '../format';
import { translateRule } from '../ruleTranslations';
import { ModelExplanation } from '../ModelExplanation';
import { ReviewContext, purposeName, type ReviewContextHandle } from '../ReviewContext';
import { buildReviewChecklist, rankReviewQuestions } from '../reviewChecklist';
import { ExportPreview, exportFilename, taskExportSource } from '../ExportPreview';

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
import '../report-enhancements.css';
import '../company-review.css';
import '../risk-perspective.css';
import { RiskOverview } from '../RiskOverview';
import { RiskDetail } from '../RiskDetail';
import { useViewMode } from '../ViewModeContext';
import { EvidenceLab } from '../EvidenceLab';
import { buildReportEvidenceLab } from '../../shared/evidence-lab';

type ReviewExportFormat = 'html' | 'json' | 'checklist';
type ReportSection = 'evidence' | 'explanations' | 'requests' | 'scope' | 'lab';

export function TaskPage({ id }: { id: string }) {
  const { t, locale, workspace, execute, navigate, refresh, busy } = useApp();
  const task = workspace!.tasks.find((item) => item.id === id);
  const [stressOpen, setStressOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ReviewExportFormat | null>(null);
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
    if (busy) return;
    await execute(() => post<AnalysisTask>(`/tasks/${task.id}/retry`, {}));
  };
  const report = task.report;
  return (
    <div className="review-report-page">
      <div className="breadcrumb">
        <a href="/workspace">{t('财报核查', 'Financial reviews')}</a>
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
                      label: t('预览核查报告（HTML）', 'Preview report (HTML)'),
                      icon: <Download size={15} />,
                      onSelect: () => setExportFormat('html'),
                    },
                    {
                      label: t('预览询证清单（Markdown）', 'Preview evidence requests (Markdown)'),
                      icon: <FileText size={15} />,
                      onSelect: () => setExportFormat('checklist'),
                    },
                    {
                      label: t('预览完整数据（JSON）', 'Preview full data (JSON)'),
                      icon: <Layers size={15} />,
                      onSelect: () => setExportFormat('json'),
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
              <button className="button button-primary" disabled={busy} onClick={retry}>
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
        <ReportView task={task} report={report} onExport={setExportFormat} />
      ) : (
        <div className="inline-error">
          {t(
            '任务已完成但报告缺失，请重试处理。',
            'The task completed but no report is available. Please retry.'
          )}
          <button className="button button-secondary" disabled={busy} onClick={retry}>
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
      {report && exportFormat && (
        <ReviewExportDialog
          task={task}
          format={exportFormat}
          onClose={() => setExportFormat(null)}
        />
      )}
    </div>
  );
}

function ReviewExportDialog({
  task,
  format,
  onClose,
}: {
  task: AnalysisTask;
  format: ReviewExportFormat;
  onClose: () => void;
}) {
  const { t, locale } = useApp();
  const checklistTitle =
    task.purpose === 'handover'
      ? t('接手前询证清单', 'Handover-evidence-requests')
      : t('付款前询证清单', 'Prepayment-evidence-requests');
  return (
    <ExportPreview
      title={t('导出预览', 'Export preview')}
      snapshotKey={`${task.id}:${task.updatedAt}`}
      initialSourceId={format}
      onClose={onClose}
      sources={[
        taskExportSource(task, 'html', locale),
        taskExportSource(task, 'json', locale),
        {
          id: 'checklist',
          label: t('询证清单 · Markdown', 'Evidence requests · Markdown'),
          filename: exportFilename(`${task.company}-${task.year}-${checklistTitle}`, 'md'),
          mimeType: 'text/markdown;charset=utf-8',
          preview: 'text',
          load: () => buildReviewChecklist(task, locale),
        },
      ]}
    />
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
    model: 'AI interpretation',
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
            <strong>
              {t(
                stage.key === 'model' ? 'AI 解读' : stage.label,
                stageEn[stage.key] || `Processing: ${stage.key}`
              )}
            </strong>
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

export function ReportView({
  task,
  report,
  onExport,
}: {
  task: AnalysisTask;
  report: Report;
  onExport?: (format: ReviewExportFormat) => void;
}) {
  const { t, locale, execute, showEvidence, navigate, busy } = useApp();
  const { viewMode } = useViewMode();
  const purpose = task.purpose || 'external';
  const contextControl = useRef<ReviewContextHandle>(null);
  const [section, setSection] = useState<ReportSection>('evidence');
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const analysisRef = useRef<HTMLDetailsElement>(null);
  const [testMetric, setTestMetric] = useState<MetricKey | null>(null);
  const [exportFormat, setExportFormat] = useState<ReviewExportFormat | null>(null);
  const previewExport = onExport || setExportFormat;
  const questions = rankReviewQuestions(report, purpose);
  const nextQuestion = questions.find((item) => item.question.status !== 'done');
  const changePurpose = async (next: ReviewPurpose) => {
    if (next === purpose) return;
    if (await contextControl.current?.changePurpose(next)) {
      setSection('evidence');
    }
  };
  const revealAnalysis = (nextSection: ReportSection, targetId = `report-panel-${nextSection}`) => {
    setAnalysisOpen(true);
    setSection(nextSection);
    if (analysisRef.current) analysisRef.current.open = true;
    requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      target?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
      if (target && !target.hasAttribute('tabindex')) target.tabIndex = -1;
      target?.focus({ preventScroll: true });
    });
  };
  const openRequests = () => revealAnalysis('requests');
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
    <div className="report-content report-content-summary">
      {viewMode === 'simple' && (
        <section className="risk-perspective-hero" aria-label={t('四维风险总览', 'Risk overview')}>
          <RiskOverview report={report} />
          <RiskDetail report={report} />
        </section>
      )}
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
        <h2>{t('核查摘要', 'Review summary')}</h2>
        <p className="report-summary-text">
          {report.verdict === 'conflict' || report.verdict === 'insufficient'
            ? t(report.summary, englishSummary)
            : t(
                report.year +
                  ' 年合并净利润' +
                  money(getMetric('netProfit')?.value ?? null, locale) +
                  '元，经营现金净额' +
                  money(getMetric('operatingCashFlow')?.value ?? null, locale) +
                  '元' +
                  (getMetric('cashConversion')?.value != null
                    ? '，现金利润比' + metricValue(getMetric('cashConversion'), locale) + '。'
                    : '。利润非正，现金利润比不作常规解读。'),
                'For ' +
                  report.year +
                  ', consolidated net profit is CNY ' +
                  money(getMetric('netProfit')?.value ?? null, locale) +
                  ' and operating cash is CNY ' +
                  money(getMetric('operatingCashFlow')?.value ?? null, locale) +
                  (getMetric('cashConversion')?.value != null
                    ? '; the cash-to-profit ratio is ' +
                      metricValue(getMetric('cashConversion'), locale) +
                      '.'
                    : '. The ratio is not interpreted with nonpositive profit.')
              )}
        </p>
        <p>
          {t(
            '经营现金净额 ÷ 合并净利润，不是销售回款率。',
            'Operating cash flow ÷ consolidated net profit, not a sales collection rate.'
          )}
        </p>
        <details className="verdict-details">
          <summary>{t('计算与证据状态', 'Calculation and evidence status')}</summary>
          <p>{t(report.headline, englishHeadline)}</p>
          <p>{t(report.summary, englishSummary)}</p>
        </details>
        {!!report.crossSignals?.length && (
          <button
            type="button"
            className="cross-signal-entry text-link"
            onClick={() => revealAnalysis('explanations', 'cross-signals')}
          >
            {t(
              `${report.crossSignals.length} 条组合线索需要进一步核查`,
              `${report.crossSignals.length} combined signal${report.crossSignals.length === 1 ? '' : 's'} to investigate`
            )}
            <ArrowRight size={15} />
          </button>
        )}
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
      <div id="report-summary-findings" className="company-review">
        <section className="company-review-section">
          <h2>{t('核查事项', 'Review matters')}</h2>
          <ol className="company-review-findings">
            {report.findings
              .filter((item) => item.basis !== 'management')
              .slice(0, 3)
              .map((finding, index) => (
                <li key={finding.id}>
                  <span className="company-review-number" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3>{t(finding.label, translateRule(finding.label))}</h3>
                    <p>{t(finding.explanation, translateRule(finding.explanation))}</p>
                  </div>
                  <button
                    className="text-link"
                    onClick={() => showEvidence(finding.sourceRefs, report)}
                    disabled={!finding.sourceRefs.length}
                  >
                    {t('查看依据', 'View evidence')}
                    <ArrowUpRight size={12} />
                  </button>
                </li>
              ))}
          </ol>
          <button
            className="text-link report-summary-detail-link"
            onClick={() => revealAnalysis('explanations')}
          >
            {t('全部观察与解释', 'All observations and explanations')}
            <ArrowRight size={13} />
          </button>
        </section>
        <section className="company-review-section company-review-followup">
          <h2>{t('后续材料', 'Follow-up evidence')}</h2>
          <p>
            {nextQuestion
              ? t(nextQuestion.question.text, translateRule(nextQuestion.question.text))
              : t(
                  '继续核对本次付款或交接所需的直接材料；跟进状态不代表事项已证实。',
                  'Continue checking the direct evidence for this payment or handover; follow-up status does not authenticate a matter.'
                )}
          </p>
          <div className="company-review-actions">
            <button className="button button-primary" onClick={openRequests}>
              {t('查看核查清单', 'Review checklist')}
              <ArrowRight size={14} />
            </button>
            <button className="text-link" onClick={() => revealAnalysis('evidence')}>
              {t('原件与计算', 'Sources and calculations')}
              <ArrowRight size={13} />
            </button>
          </div>
        </section>
        <p className="company-review-footnote">
          {t(
            '本报告核对所采用材料中的历史金额；当前付款和履约需要另取直接依据。',
            'This report checks historical amounts in adopted evidence; current payments and fulfilment need separate direct records.'
          )}
        </p>
      </div>
      <details className="report-purpose-details">
        <summary>
          <ChevronDown size={14} />
          {t('用途与后续核查', 'Purpose and follow-up')}
        </summary>
        <section className="report-purpose-overview" aria-labelledby="report-purpose-heading">
          <div className="report-purpose-topline">
            <h2 id="report-purpose-heading">{t('本次核查重点', 'Focus for this review')}</h2>
            <div
              className="segmented-control purpose-switch"
              aria-label={t('选择核查用途', 'Choose review purpose')}
            >
              {(['external', 'handover'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={purpose === value ? 'active' : ''}
                  aria-pressed={purpose === value}
                  disabled={busy}
                  onClick={() => changePurpose(value)}
                >
                  {purposeName(value, t)}
                </button>
              ))}
            </div>
          </div>
          <div className="report-purpose-body">
            <div>
              <h3>
                {purpose === 'handover'
                  ? t(
                      '先核对接手时的可用资金与到期付款',
                      'Confirm cash available at handover and payments due'
                    )
                  : t(
                      '先核对签约主体、收款安排与承诺条款',
                      'Check the contracting entity, payment arrangements and written promises'
                    )}
              </h3>
              <p>
                {purpose === 'handover'
                  ? t(
                      '历史利润和经营现金净额用于定位核查事项。当前余额、未来回款和到期义务，需要另取材料并逐笔确认。',
                      'Historical profit and operating cash help locate questions. Current balances, future collections and obligations due require separate records and reconciliation.'
                    )
                  : t(
                      '财报能支持经营线索，不能证明这次付款的本金安全或交付承诺。先确认对方是谁、钱付给谁，以及交付与退出条件。',
                      'Financial statements support operating clues, but do not establish the safety of this payment or a delivery promise. Confirm the entities, receiving account, delivery and exit terms.'
                    )}
              </p>
              <button
                type="button"
                className="text-link"
                onClick={() => navigate(`/decisions?new=${purpose}&task=${task.id}`)}
              >
                {purpose === 'handover'
                  ? t('建立接手核查事项', 'Start a handover review matter')
                  : t('建立付款核查事项', 'Start a payment review matter')}
                <ArrowRight size={14} />
              </button>
            </div>
            <div className="report-next-request">
              <span>{t('下一项材料核查', 'Next evidence request')}</span>
              <h3>
                {nextQuestion
                  ? t(nextQuestion.question.text, translateRule(nextQuestion.question.text))
                  : questions.length
                    ? t(
                        '已记录全部询证跟进，继续核对场景材料',
                        'All follow-ups recorded; check the context records next'
                      )
                    : t(
                        '核对本次安排所需的直接材料',
                        'Check the direct records needed for this arrangement'
                      )}
              </h3>
              <p>
                {nextQuestion
                  ? t(nextQuestion.orderReason.zh, nextQuestion.orderReason.en)
                  : questions.length
                    ? t(
                        '跟进完成不代表结论已经证实。核对本次付款或接手安排所需的直接材料。',
                        'Recorded follow-up does not authenticate a conclusion. Review the direct records needed for this payment or handover.'
                      )
                    : t(
                        '本报告没有已保存的询证项。请核对场景材料，不从空清单推断本次安排可靠。',
                        'This report has no saved evidence requests. Check the context records; an empty checklist does not establish that this arrangement is reliable.'
                      )}
              </p>
              <button type="button" className="text-link" onClick={openRequests}>
                {t('查看材料清单', 'View evidence requests')}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </section>
      </details>
      <details
        className="report-analysis-details"
        ref={analysisRef}
        open={analysisOpen}
        onToggle={(event) => setAnalysisOpen(event.currentTarget.open)}
      >
        <summary>
          <ChevronDown size={16} aria-hidden="true" />
          <span>{t('分析依据与核查记录', 'Analysis evidence and review records')}</span>
        </summary>
        <div className="report-analysis-content">
          {viewMode === 'pro' && (
            <>
              <RiskOverview
                report={report}
                onSelectDimension={(key) => revealAnalysis(section, `risk-detail-${key}`)}
              />
              <RiskDetail report={report} />
            </>
          )}
          <nav className="report-local-nav" aria-label={t('报告内容', 'Report sections')}>
            {(
              [
                ['lab', t('证据实验室', 'Evidence lab')],
                ['evidence', t('图表与来源', 'Charts and sources')],
                [
                  'explanations',
                  report.crossSignals?.length
                    ? t('组合与解释', 'Signals & explanations')
                    : t('解释', 'Explanations'),
                ],
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
          {section === 'lab' && (
            <div id="report-panel-lab" tabIndex={-1}>
              <EvidenceLab
                graph={buildReportEvidenceLab(report)}
                onStartResearch={() =>
                  navigate('/query?query=' + encodeURIComponent(report.company))
                }
              />
            </div>
          )}
          <div id="report-panel-evidence" tabIndex={-1} hidden={section !== 'evidence'}>
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
                          revealAnalysis('requests', 'questions');
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
                  <AnnualChanges report={report} />
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
                          {material.documentDate} ·{' '}
                          {t('查看原文与口径', 'Inspect source and scope')}
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
          <div id="report-panel-explanations" tabIndex={-1} hidden={section !== 'explanations'}>
            <section
              className="report-section cross-signals-section"
              id="cross-signals"
              tabIndex={-1}
            >
              <div className="report-section-title">
                <h2>{t('组合线索', 'Combined signals')}</h2>
                <Tag>{report.crossSignals === undefined ? '—' : report.crossSignals.length}</Tag>
              </div>
              <p className="section-intro">
                {t(
                  '只有所需的同口径金额齐全、现金桥闭合时才显示组合。它提出核查方向，不给企业打分。',
                  'Combinations appear only when comparable amounts are present and the cash bridge reconciles. They suggest checks, not a company score.'
                )}
              </p>
              <CrossSignalChecks report={report} />
              {report.crossSignals === undefined ? (
                <p className="cross-signal-empty">
                  {t(
                    '这份旧版报告尚未评估组合线索。使用原材料创建新核查后，可查看当前规则的结果。',
                    'This older report has no combined-signal evaluation. Create a new review from its evidence to apply the current rules.'
                  )}
                </p>
              ) : report.crossSignals.length ? (
                <div className="cross-signal-list">
                  {report.crossSignals.map((signal) => {
                    const next =
                      signal.nextEvidence[task.purpose === 'handover' ? 'handover' : 'external'];
                    return (
                      <article className="cross-signal-card" key={signal.id}>
                        <div className="cross-signal-heading">
                          <span className="cross-signal-index">{t('交叉核对', 'Cross-check')}</span>
                          <h3>{t(signal.title.zh, signal.title.en)}</h3>
                          <p>{t(signal.reading.zh, signal.reading.en)}</p>
                        </div>
                        <div
                          className="cross-signal-facts"
                          aria-label={t('触发事实', 'Triggering facts')}
                        >
                          {signal.facts.map((fact) => (
                            <button
                              type="button"
                              key={`${fact.year}-${fact.metric}`}
                              onClick={() => showEvidence(fact.sourceRefs, report)}
                              aria-label={`${fact.year} ${metricName(fact.metric, locale)}: ${money(fact.amount, locale, false)} CNY · ${t('查看来源', 'View source')}`}
                            >
                              <span>
                                {fact.year} · {metricName(fact.metric, locale)}
                              </span>
                              <strong className="mono">
                                {money(fact.amount, locale)} <small>CNY</small>
                              </strong>
                              <ArrowUpRight size={14} aria-hidden="true" />
                            </button>
                          ))}
                        </div>
                        <div className="cross-signal-explanations">
                          <span className="cross-signal-label">
                            {t('两种待检验的解释', 'Two explanations to test')}
                          </span>
                          {signal.explanations.map((explanation, index) => (
                            <p key={index}>
                              <b>{index + 1}</b>
                              {t(explanation.zh, explanation.en)}
                            </p>
                          ))}
                        </div>
                        <div className="cross-signal-next">
                          <div>
                            <span className="cross-signal-label">
                              {task.purpose === 'handover'
                                ? t('接手前核查', 'Check before handover')
                                : t('付款前核查', 'Check before payment')}
                            </span>
                            <p>{t(next.zh, next.en)}</p>
                            <SignalMaterialRequest
                              key={`${signal.id}-${locale}-${task.purpose}`}
                              text={`${task.company} · ${task.year}\n${t(next.zh, next.en)}`}
                            />
                          </div>
                          <button
                            className="text-link"
                            onClick={() =>
                              navigate(
                                `/decisions?new=${task.purpose || 'external'}&task=${task.id}`
                              )
                            }
                          >
                            {t('进入事项核查', 'Open decision review')}
                            <ArrowRight size={14} />
                          </button>
                        </div>
                        <div className="cross-signal-test">
                          <button
                            type="button"
                            className="text-link"
                            onClick={() =>
                              setTestMetric(
                                signal.id === 'profit-cash-working-capital'
                                  ? 'inventoryAdjustment'
                                  : 'operatingCashFlow'
                              )
                            }
                          >
                            <SlidersHorizontal size={14} />
                            {t('检验关键依据', 'Test a key dependency')}
                            <ArrowRight size={14} />
                          </button>
                          <span>
                            {t(
                              '调整本次采用的指标，保存新的核查。',
                              'Change the adopted metrics and save a new review.'
                            )}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="cross-signal-empty">
                  {t(
                    report.crossSignalChecks === undefined
                      ? '本次没有显示组合线索。单项事实与待询证事项仍见下方，未显示组合不表示企业没有风险。'
                      : report.crossSignalChecks.some((check) => check.status === 'blocked')
                        ? '部分组合条件暂不能核对，所需材料与缺口见上方。未显示组合不表示企业没有风险。'
                        : '已核对的组合条件未全部满足。未显示组合不表示企业没有风险，单项事实与待询证事项仍见下方。',
                    report.crossSignalChecks === undefined
                      ? 'No combination is displayed. Individual facts and evidence requests remain below. This does not imply the company has no risk.'
                      : report.crossSignalChecks.some((check) => check.status === 'blocked')
                        ? 'Some combinations cannot be evaluated yet. Required evidence and gaps are listed above. No displayed combination does not imply no risk.'
                        : 'The evaluated combination conditions are not all met. No displayed combination does not imply no risk; individual facts and evidence requests remain below.'
                  )}
                </p>
              )}
            </section>
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
          <div id="report-panel-requests" tabIndex={-1} hidden={section !== 'requests'}>
            <details className="report-context-details">
              <summary>
                {purpose === 'handover'
                  ? t('接手背景与跟进', 'Handover context and follow-up')
                  : t('付款背景与跟进', 'Payment context and follow-up')}
              </summary>
              <ReviewContext
                task={task}
                report={report}
                controlRef={contextControl}
                hidePurposeSelector
              />
            </details>
            <section className="report-section questions-section" id="questions" tabIndex={-1}>
              <div className="report-section-title">
                <div>
                  <h2>
                    {purpose === 'handover'
                      ? t('接手前询证清单', 'Handover evidence requests')
                      : t('付款前询证清单', 'Prepayment evidence requests')}
                  </h2>
                </div>
                <div className="report-request-actions">
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => previewExport('checklist')}
                  >
                    <Download size={14} />
                    {t('预览清单', 'Preview checklist')}
                  </button>
                  <Tag tone="green">
                    {report.questions.filter((question) => question.status === 'done').length}/
                    {report.questions.length} {t('已完成', 'done')}
                  </Tag>
                </div>
              </div>
              <p className="section-intro">
                {t(
                  '勾选仅记录跟进完成，不代表财务问题已证实或解决。',
                  'Checking an item records follow-up only; it does not prove a financial issue is resolved.'
                )}
              </p>
              <div className="question-list">
                {questions.map(({ question, priority, orderReason, recipient }, index) => (
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
                      <div className="question-order-label">
                        <span className="question-number">
                          Q{String(index + 1).padStart(2, '0')}
                        </span>
                        <span>
                          {priority === 'prerequisite'
                            ? t('先补依据', 'Evidence prerequisite')
                            : priority === 'recorded'
                              ? t('已记录跟进', 'Follow-up recorded')
                              : t('继续核查', 'Further inquiry')}
                        </span>
                      </div>
                      <h3>{t(question.text, translateRule(question.text))}</h3>
                      <p>{t(question.reason, translateRule(question.reason))}</p>
                      <p className="question-order-reason">
                        <strong>{t('顺序依据', 'Order reason')}</strong>{' '}
                        {t(orderReason.zh, orderReason.en)}
                      </p>
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
                      <p className="question-recipient">
                        <strong>{t('向谁索取', 'Request from')}</strong>{' '}
                        {t(recipient.zh, recipient.en)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div id="report-panel-scope" tabIndex={-1} hidden={section !== 'scope'}>
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
                    ? t('未生成 AI 解读', 'AI interpretation not generated')
                    : report.model.status === 'not-configured'
                      ? t('AI 解读暂不可用', 'AI interpretation unavailable')
                      : report.model.status === 'failed'
                        ? report.model.error?.includes('未调用')
                          ? t(
                              '材料不足，未生成 AI 解读',
                              'Insufficient evidence for AI interpretation'
                            )
                          : t(
                              '解读未完成，核对结果已保留',
                              'Interpretation incomplete; financial checks retained'
                            )
                        : t('AI 解读已完成', 'AI interpretation complete')}
                </p>
                {report.model.text && (
                  <details className="model-explanation">
                    <summary>{t('查看 AI 解读', 'View AI interpretation')}</summary>
                    <div className="info-strip">
                      <CircleAlert size={16} />
                      <p>
                        {t(
                          '解读不是新增证据，可沿引用核对原始材料。',
                          'Interpretation is not new evidence. Follow its references to inspect the source.'
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
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => previewExport('json')}
                >
                  <Download size={16} />
                  {t('预览完整 JSON', 'Preview full JSON')}
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => navigate(`/compare?left=${task.id}`)}
                >
                  <Columns3 size={16} />
                  {t('与历史任务比较', 'Compare with history')}
                </button>
                <a href="/method" className="text-link">
                  {t('阅读方法说明', 'Read the methodology')}
                  <ArrowUpRight size={15} />
                </a>
              </div>
            </section>
          </div>
        </div>
      </details>
      <div className="print-footer">
        Prispect / {task.id} · {report.year} ·{' '}
        {t(
          '历史材料核查，不构成投资或授信意见。',
          'Historical evidence review. No investment or credit advice.'
        )}
      </div>
      {testMetric && (
        <StressDialog
          task={task}
          focusedMetric={testMetric}
          initialExcluded={[...new Set([...task.excludedMetrics, testMetric])]}
          onClose={() => setTestMetric(null)}
        />
      )}
      {exportFormat && (
        <ReviewExportDialog
          task={task}
          format={exportFormat}
          onClose={() => setExportFormat(null)}
        />
      )}
    </div>
  );
}

function CrossSignalChecks({ report }: { report: Report }) {
  const { t, locale, showEvidence } = useApp();
  const checks = report.crossSignalChecks;
  if (checks === undefined)
    return report.crossSignals === undefined ? null : (
      <p className="cross-signal-checks-unavailable">
        {t(
          '本报告未保存组合条件的逐项核对。使用原材料创建新核查，可查看当前条件与缺口。',
          'This report has no saved condition-by-condition evaluation. Review its original evidence again to inspect current conditions and gaps.'
        )}
      </p>
    );
  const blocked = checks.filter((check) => check.status === 'blocked').length;
  const statusName = (status: CrossSignalCheck['status']) =>
    status === 'triggered'
      ? t('组合成立', 'Combination holds')
      : status === 'not-triggered'
        ? t('条件未全部满足', 'Conditions not all met')
        : t('暂不能核对', 'Cannot evaluate yet');
  const requirementState = (state: CrossSignalCheck['requirements'][number]['state']) =>
    ({
      available: t('已取得', 'Available'),
      excluded: t('本次未采用', 'Excluded in this review'),
      missing: t('尚缺金额或原文', 'Amount or source missing'),
      conflict: t('来源存在冲突', 'Source conflict'),
      invalid: t('金额或口径未通过核对', 'Amount or scope check failed'),
    })[state];
  return (
    <details className="cross-signal-checks">
      <summary>
        <span>{t('组合条件核对', 'Combination checks')}</span>
        <span className="cross-signal-check-summary">
          {t(
            `已核对 ${checks.length - blocked}/${checks.length}`,
            `Evaluated ${checks.length - blocked}/${checks.length}`
          )}
          {blocked > 0 && t(` · 暂不能核对 ${blocked}`, ` · ${blocked} blocked`)}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div className="cross-signal-check-list">
        {checks.map((check) => (
          <article key={check.id}>
            <div className="cross-signal-check-heading">
              <h3>{t(check.title.zh, check.title.en)}</h3>
              <Tag>{statusName(check.status)}</Tag>
            </div>
            <ul className="cross-signal-conditions">
              {check.conditions.map((condition) => (
                <li key={condition.id}>
                  <span>{t(condition.label.zh, condition.label.en)}</span>
                  <span>
                    {condition.status === 'met'
                      ? t('满足', 'Met')
                      : condition.status === 'not-met'
                        ? t('未满足', 'Not met')
                        : t('待核对', 'Unknown')}
                  </span>
                </li>
              ))}
            </ul>
            {check.blockers.length > 0 && (
              <ul className="cross-signal-blockers">
                {check.blockers.map((blocker) => (
                  <li key={blocker.code}>
                    <span>{t(blocker.message.zh, blocker.message.en)}</span>
                    {blocker.sourceRefs.length > 0 && (
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => showEvidence(blocker.sourceRefs, report)}
                      >
                        <FileText size={13} />
                        {t('核对来源', 'Inspect sources')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <details className="cross-signal-requirements">
              <summary>
                {t('所需金额与来源', 'Required amounts and sources')} ·{' '}
                {check.requirements.filter((item) => item.state === 'available').length}/
                {check.requirements.length}
              </summary>
              <ul>
                {check.requirements.map((requirement) => (
                  <li key={`${requirement.year}-${requirement.metric}`}>
                    <span>
                      {requirement.year} · {metricName(requirement.metric, locale)}
                    </span>
                    <span className="cross-signal-requirement-value">
                      {requirement.state === 'available' && requirement.amount !== null
                        ? `${money(requirement.amount, locale)} CNY`
                        : requirementState(requirement.state)}
                      {requirement.sourceRefs.length > 0 && (
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`${requirement.year} ${metricName(requirement.metric, locale)} · ${t('查看来源', 'View source')}`}
                          onClick={() => showEvidence(requirement.sourceRefs, report)}
                        >
                          <FileText size={13} />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </article>
        ))}
      </div>
    </details>
  );
}

function SignalMaterialRequest({ text }: { text: string }) {
  const { t } = useApp();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const fallback = useRef<HTMLTextAreaElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
      requestAnimationFrame(() => {
        fallback.current?.focus();
        fallback.current?.select();
      });
    }
  };
  return (
    <div className="cross-signal-copy">
      <button type="button" className="text-link" onClick={copy}>
        {state === 'copied' ? <Check size={13} /> : <Copy size={13} />}
        {state === 'copied'
          ? t('已复制材料请求', 'Request copied')
          : t('复制材料请求', 'Copy material request')}
      </button>
      {state !== 'idle' && (
        <span className="field-note" role="status">
          {state === 'copied'
            ? t(
                '可自行发送给材料提供方。',
                'You can share it with the person providing the material.'
              )
            : t(
                '无法自动复制，请复制下方已选中的文本。',
                'Automatic copy failed. Copy the selected text below.'
              )}
        </span>
      )}
      {state === 'failed' && (
        <textarea
          ref={fallback}
          readOnly
          value={text}
          rows={4}
          aria-label={t('材料请求文本', 'Material request text')}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
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
  const titleId = useId();
  const [selectedIndex, setSelectedIndex] = useState(2);
  const profit = report.metrics.find((metric) => metric.key === 'netProfit');
  const cash = report.metrics.find((metric) => metric.key === 'operatingCashFlow');
  const values = [profit?.previousValue, cash?.previousValue, profit?.value, cash?.value];
  const bars = values.map((value, index) => {
    const key = index % 2 ? 'operatingCashFlow' : 'netProfit';
    const year = index < 2 ? report.previousYear : report.year;
    return {
      value: value ?? null,
      key,
      year,
      refs: report.checks.find((check) => check.id === `${year}-${key}`)?.sourceRefs || [],
    } as const;
  });
  const selected = bars[selectedIndex];
  const selectBar = (index: number, openSource = false) => {
    setSelectedIndex(index);
    const bar = bars[index];
    if (openSource && bar.value !== null && bar.refs.length) showEvidence(bar.refs, report);
  };
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
        <svg className="trend-chart" viewBox="0 0 760 280" role="group" aria-labelledby={titleId}>
          <title id={titleId}>
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
          <line x1="74" x2="727" y1={y(0)} y2={y(0)} className="chart-zero" />
          {numbers.map((number, index) => {
            const x = [180, 262, 470, 552][index];
            const bar = bars[index];
            return (
              <g
                key={index}
                className={`trend-bar ${selectedIndex === index ? 'is-selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={selectedIndex === index}
                aria-label={`${bar.year} · ${metricName(bar.key, locale)} · ${bar.value === null ? t('未知', 'Unknown') : `${money(bar.value, locale, false)} CNY`} · ${t('选择并查看该期来源', 'Select and inspect this period’s sources')}`}
                onFocus={() => selectBar(index)}
                onClick={() => selectBar(index, true)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectBar(index, true);
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
                      event.currentTarget.parentElement?.querySelectorAll('.trend-bar')[next] as
                        | SVGElement
                        | undefined
                    )?.focus();
                  }
                }}
              >
                <rect
                  className="trend-hit-area"
                  x={x - 8}
                  y="35"
                  width="76"
                  height="183"
                  fill="transparent"
                  pointerEvents="all"
                />
                <rect
                  x={x}
                  y={number === null ? y(0) - 2 : Math.min(y(number), y(0))}
                  width="60"
                  height={number === null ? 3 : Math.max(3, Math.abs(y(0) - y(number)))}
                  rx="2"
                  className={
                    number === null ? 'trend-missing-bar' : index % 2 ? 'bar-positive' : 'bar-total'
                  }
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
      <div className="trend-selection" aria-label={t('所选年度指标', 'Selected annual metric')}>
        <div>
          <span>
            {selected.year} · {metricName(selected.key, locale)}
          </span>
          <strong className="mono">
            {selected.value === null
              ? t('未知', 'Unknown')
              : `${money(selected.value, locale, false)} CNY`}
          </strong>
        </div>
        <button
          className="text-link"
          disabled={selected.value === null || !selected.refs.length}
          onClick={() => showEvidence(selected.refs, report)}
        >
          {t('查看该期原文', 'View this period’s source')}
          <ArrowUpRight size={14} />
        </button>
      </div>
      <p className="field-note">
        {t(
          '图形标签已舍入；所选项目保留精确金额。未知值显示为空缺，不作零值。',
          'Plot labels are rounded; the selected item retains its exact amount. Unknown values are gaps, not zeros.'
        )}
      </p>
    </div>
  );
}

function AnnualChanges({ report }: { report: Report }) {
  const { locale, t, showEvidence } = useApp();
  return (
    <div
      className="annual-changes"
      aria-label={t('两期变化与计算', 'Two-period changes and calculations')}
    >
      {(
        [
          ['netProfit', 'profitChange', 'profitGrowth'],
          ['operatingCashFlow', 'cashChange', 'cashGrowth'],
        ] as const
      ).map(([key, changeKey, growthKey]) => {
        const metric = report.metrics.find((item) => item.key === key);
        const change = report.metrics.find((item) => item.key === changeKey);
        const growth = report.metrics.find((item) => item.key === growthKey);
        const calculated = change?.value !== null && change?.value !== undefined;
        const unavailable =
          report.verdict === 'conflict'
            ? t(
                '输入或核对存在冲突，变化计算已暂停。',
                'Input or reconciliation conflicts have paused change calculations.'
              )
            : t(
                '缺少可采用的同口径两期金额，未计算变动额。',
                'Adoptable amounts for both periods on a consistent scope are unavailable; the amount change was not calculated.'
              );
        return (
          <details className="annual-change-row" key={key}>
            <summary>
              <span>{metricName(key, locale)}</span>
              <strong className="mono">
                {calculated ? (
                  <>
                    {metricValue(change, locale)} <small>CNY</small>
                  </>
                ) : change ? (
                  t('变动额未计算', 'Amount change unavailable')
                ) : (
                  t('历史报告未保存', 'Not saved in this report')
                )}
              </strong>
              <span className="annual-growth-label">
                {growth?.value != null ? (
                  <>
                    {t('同比', 'YoY')} {metricValue(growth, locale)}
                  </>
                ) : (
                  t('同比未计算', 'YoY unavailable')
                )}
                <ChevronDown size={14} />
              </span>
            </summary>
            <div className="annual-change-body">
              <dl className="annual-period-amounts">
                {[
                  { year: report.previousYear, value: metric?.previousValue },
                  { year: report.year, value: metric?.value },
                ].map(({ year, value }) => {
                  const refs =
                    report.checks.find((check) => check.id === `${year}-${key}`)?.sourceRefs || [];
                  return (
                    <div key={year}>
                      <dt>
                        {year} {t('年度', 'FY')}
                      </dt>
                      <dd className="mono">{money(value ?? null, locale, false)} CNY</dd>
                      {refs.length ? (
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => showEvidence(refs, report)}
                        >
                          {t('查看该期来源与口径', 'Inspect this period’s sources and scope')}
                          <ArrowUpRight size={13} />
                        </button>
                      ) : (
                        <span className="annual-source-missing">
                          {t(
                            '本次未保存该期引用',
                            'No reference saved for this period in this review'
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
              </dl>
              <div className="annual-change-formula">
                <strong>{t('金额变化', 'Amount change')}</strong>
                {change ? (
                  <>
                    <p>{t(change.formula, translateRule(change.formula))}</p>
                    {calculated && metric?.value != null && metric.previousValue != null ? (
                      <p className="mono">
                        ({money(metric.value, locale, false)}) − (
                        {money(metric.previousValue, locale, false)}) ={' '}
                        {money(change.value, locale, false)} CNY
                      </p>
                    ) : (
                      <p>{unavailable}</p>
                    )}
                  </>
                ) : (
                  <p>
                    {t(
                      '此历史报告未保存变动额；原报告和输入保持原样。',
                      'This historical report did not save the amount change. Its original report and inputs are retained.'
                    )}
                  </p>
                )}
              </div>
              <div className="annual-change-formula">
                <strong>{t('通常同比率', 'Conventional YoY rate')}</strong>
                {growth && <p>{t(growth.formula, translateRule(growth.formula))}</p>}
                {growth?.value != null ? (
                  calculated && metric?.previousValue != null ? (
                    <p className="mono">
                      ({money(change?.value ?? null, locale, false)}) ÷ (
                      {money(metric.previousValue, locale, false)}) × 100% ={' '}
                      {metricValue(growth, locale)}
                    </p>
                  ) : (
                    <p>
                      {t('已保存的同比结果：', 'Saved YoY result:')} {metricValue(growth, locale)}
                    </p>
                  )
                ) : (
                  <p>
                    {report.verdict === 'conflict'
                      ? unavailable
                      : metric?.previousValue != null && Number(metric.previousValue) <= 0
                        ? t(
                            '上年基数为零或负数，不给出通常同比率；可查看已保存的金额变化。',
                            'The prior-year base is zero or negative, so a conventional YoY rate is withheld. Inspect the saved amount change instead.'
                          )
                        : t(
                            '缺少适用的同口径两期数据，未给出同比率。',
                            'Suitable amounts for both periods on a consistent scope are unavailable; no YoY rate is given.'
                          )}
                  </p>
                )}
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function StressDialog({
  task,
  onClose,
  initialExcluded,
  focusedMetric,
}: {
  task: AnalysisTask;
  onClose: () => void;
  initialExcluded?: MetricKey[];
  focusedMetric?: MetricKey;
}) {
  const { t, locale, execute, navigate, busy } = useApp();
  const [excluded, setExcluded] = useState<MetricKey[]>(
    initialExcluded ?? (task.excludedMetrics.length ? task.excludedMetrics : adjustments)
  );
  const run = async () => {
    if (busy) return;
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
        useModel: true,
      } satisfies CreateTaskInput)
    );
    if (next) {
      onClose();
      navigate(`/tasks/${next.id}`);
    }
  };
  return (
    <Dialog
      title={
        focusedMetric
          ? t('检验关键依据', 'Test a key dependency')
          : t('调整证据', 'Adjust evidence')
      }
      onClose={onClose}
      closeDisabled={busy}
    >
      {focusedMetric && (
        <p className="field-note">
          {t(
            `已预选本次不采用「${metricName(focusedMetric, locale)}」。你可以调整选择，再保存新的核查。`,
            `“${metricName(focusedMetric, locale)}” is preselected for exclusion in this review. Adjust the selection, then save a new review.`
          )}
        </p>
      )}
      <p>
        {t(
          '修改本次采用的指标，另存新的核查。原任务和原件保留。',
          'Change the metrics used and save a new review. Original reviews and sources remain.'
        )}
      </p>
      <div className="stress-option-group">
        <button className="text-link" disabled={busy} onClick={() => setExcluded(adjustments)}>
          {t('排除全部调整项', 'Exclude all adjustments')}
          <ArrowRight size={15} />
        </button>
        {(['netProfit', 'operatingCashFlow', ...adjustments] as MetricKey[]).map((key) => (
          <label className="stress-option" key={key}>
            <input
              type="checkbox"
              disabled={busy}
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
        <button className="button button-secondary" disabled={busy} onClick={onClose}>
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
