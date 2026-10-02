import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CircleAlert,
  Layers,
  Plus,
  RotateCcw,
} from 'lucide-react';
import type { AnalysisTask, CreateTaskInput } from '../../shared/contracts';
import { post } from '../api';
import { reviewVariantTitle, date, metricName, metricValue } from '../format';
import { translateRule } from '../ruleTranslations';

import { useApp } from '../context';
import { PageHeading, EmptyState, VerdictTag } from '../components';
import '../review-pages.css';

export function ComparePage({ query }: { query: URLSearchParams }) {
  const { t, locale, workspace, navigate, execute, showEvidence } = useApp();
  const completed = workspace!.tasks.filter((task) => task.status === 'completed' && task.report);
  const [leftId, setLeftId] = useState(query.get('left') || completed[0]?.id || '');
  const [rightId, setRightId] = useState(
    query.get('right') || completed.find((task) => task.id !== leftId)?.id || ''
  );
  const left = completed.find((task) => task.id === leftId);
  const right = completed.find((task) => task.id === rightId);
  const leftReport = left?.report;
  const rightReport = right?.report;
  const withdrawn =
    leftReport && rightReport
      ? leftReport.findings.filter(
          (finding) => !rightReport.findings.some((item) => item.id === finding.id)
        )
      : [];
  const restored =
    leftReport && rightReport
      ? rightReport.findings.filter(
          (finding) => !leftReport.findings.some((item) => item.id === finding.id)
        )
      : [];
  const withdrawnSignals =
    leftReport?.crossSignals && rightReport?.crossSignals
      ? leftReport.crossSignals.filter(
          (signal) => !rightReport.crossSignals!.some((item) => item.id === signal.id)
        )
      : [];
  const addedSignals =
    leftReport?.crossSignals && rightReport?.crossSignals
      ? rightReport.crossSignals.filter(
          (signal) => !leftReport.crossSignals!.some((item) => item.id === signal.id)
        )
      : [];
  const restore = async () => {
    if (!right) return;
    const next = await execute(() =>
      post<AnalysisTask>('/tasks', {
        title: reviewVariantTitle(right.title, t('恢复完整证据', 'Full evidence restored')),
        company: right.company,
        year: right.year,
        materialIds: right.materialIds,
        excludedMetrics: [],
        purpose: right.purpose || 'external',
        useModel: false,
      } satisfies CreateTaskInput)
    );
    if (next) navigate(`/tasks/${next.id}`);
  };
  return (
    <>
      <PageHeading
        title={t('财报对比', 'Compare financial reviews')}
        description={t(
          '比较两份任务采用的材料与计算结果。',
          'Compare the evidence and calculated results of two reviews.'
        )}
      />
      {completed.length < 2 ? (
        <EmptyState
          title={t('准备两份已完成的核查', 'Two completed reviews are needed')}
          text={t(
            '在报告中调整证据并重算，即可创建第二份核查。',
            'Adjust evidence and rerun an existing report to create a second review.'
          )}
          action={
            <button
              className="button button-primary"
              onClick={() => navigate(left ? `/tasks/${left.id}` : '/new')}
            >
              {t('开始或打开核查', 'Start or open a review')}
              <ArrowRight size={16} />
            </button>
          }
        />
      ) : (
        <>
          <div className="compare-selectors">
            <label className="form-field">
              <span>{t('基准任务', 'Baseline review')}</span>
              <select value={leftId} onChange={(event) => setLeftId(event.target.value)}>
                {completed.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title} · {date(task.createdAt, locale)}
                  </option>
                ))}
              </select>
            </label>
            <span className="compare-versus">↔</span>
            <label className="form-field">
              <span>{t('对照任务', 'Comparison review')}</span>
              <select value={rightId} onChange={(event) => setRightId(event.target.value)}>
                {completed.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title} · {date(task.createdAt, locale)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {left && right && leftReport && rightReport && (
            <>
              {left.id === right.id ? (
                <div className="warning-box">
                  <CircleAlert size={19} />
                  <p>
                    {t(
                      '两侧是同一份任务，请选择另一份核查。',
                      'Both selections are the same review. Choose another task.'
                    )}
                  </p>
                </div>
              ) : left.company !== right.company ? (
                <div className="warning-box">
                  <CircleAlert size={19} />
                  <p>
                    {t(
                      '不同公司只并列展示历史现金结构，不作健康或安全排名。',
                      'Different companies are shown side by side without health or safety rankings.'
                    )}
                  </p>
                </div>
              ) : (
                <div className="info-strip">
                  <Layers size={19} />
                  <p>
                    {t(
                      '两份任务的原件与历史结果均保留。',
                      'Sources and historical results are retained for both reviews.'
                    )}
                  </p>
                </div>
              )}
              <p className="comparison-mobile-hint">
                {t('左右滑动，比较两份核查。', 'Swipe to compare both reviews.')}
              </p>
              <div className="comparison-table-wrap">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>{t('核查维度', 'Review dimension')}</th>
                      {[left, right].map((task, side) => (
                        <th key={`${side}-${task.id}`}>
                          <span>{task.company}</span>
                          <strong>{task.title}</strong>
                          <a href={`/tasks/${task.id}`} className="text-link">
                            {t('打开报告', 'Open report')}
                            <ArrowUpRight size={15} />
                          </a>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th>{t('核查年度', 'Year')}</th>
                      <td className="mono">{left.year}</td>
                      <td className="mono">{right.year}</td>
                    </tr>
                    <tr>
                      <th>{t('结论边界', 'Verdict boundary')}</th>
                      <td>
                        <VerdictTag verdict={leftReport.verdict} />
                      </td>
                      <td>
                        <VerdictTag verdict={rightReport.verdict} />
                      </td>
                    </tr>
                    <tr>
                      <th>{t('证据覆盖', 'Evidence coverage')}</th>
                      <td>
                        {leftReport.coverage.present}/{leftReport.coverage.total}
                      </td>
                      <td>
                        {rightReport.coverage.present}/{rightReport.coverage.total}
                      </td>
                    </tr>
                    {(['netProfit', 'operatingCashFlow', 'cashConversion'] as const).map((key) => (
                      <tr key={key}>
                        <th>{metricName(key, locale)}</th>
                        <td className="comparison-number">
                          {metricValue(
                            leftReport.metrics.find((metric) => metric.key === key),
                            locale
                          )}
                        </td>
                        <td className="comparison-number">
                          {metricValue(
                            rightReport.metrics.find((metric) => metric.key === key),
                            locale
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <th>{t('现金桥', 'Cash bridge')}</th>
                      <td>
                        {leftReport.bridge
                          ? t('完整重建并闭合', 'Reconstructed and reconciled')
                          : t(
                              '材料不足 / 口径冲突，撤回',
                              'Withheld: missing evidence / scope conflict'
                            )}
                      </td>
                      <td>
                        {rightReport.bridge
                          ? t('完整重建并闭合', 'Reconstructed and reconciled')
                          : t(
                              '材料不足 / 口径冲突，撤回',
                              'Withheld: missing evidence / scope conflict'
                            )}
                      </td>
                    </tr>
                    <tr>
                      <th>{t('本次主动移除', 'Explicitly excluded')}</th>
                      <td>
                        {left.excludedMetrics.length
                          ? left.excludedMetrics.map((key) => metricName(key, locale)).join(' / ')
                          : t('无', 'None')}
                      </td>
                      <td>
                        {right.excludedMetrics.length
                          ? right.excludedMetrics.map((key) => metricName(key, locale)).join(' / ')
                          : t('无', 'None')}
                      </td>
                    </tr>
                    <tr>
                      <th>{t('组合线索', 'Combined signals')}</th>
                      {[leftReport, rightReport].map((report, index) => (
                        <td key={index}>
                          {report.crossSignals === undefined
                            ? t('旧版报告未评估', 'Not evaluated in this older report')
                            : report.crossSignals.length
                              ? report.crossSignals.map((signal) => (
                                  <p key={signal.id}>{t(signal.title.zh, signal.title.en)}</p>
                                ))
                              : t(
                                  '未触发已实现的组合规则',
                                  'No implemented combination rule triggered'
                                )}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th>{t('后续问题', 'Follow-up questions')}</th>
                      <td>
                        {leftReport.questions.map((question) => (
                          <p key={question.id}>{t(question.text, translateRule(question.text))}</p>
                        ))}
                      </td>
                      <td>
                        {rightReport.questions.map((question) => (
                          <p key={question.id}>{t(question.text, translateRule(question.text))}</p>
                        ))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {left.company === right.company &&
                (withdrawnSignals.length > 0 || addedSignals.length > 0) && (
                  <div className="info-strip">
                    <Layers size={19} />
                    <p>
                      {withdrawnSignals.map((signal) => (
                        <span className="compare-signal-change" key={`withdrawn-${signal.id}`}>
                          {t(
                            `「${signal.title.zh}」在对照任务中不再成立，请核对金额及采用材料的变化。`,
                            `“${signal.title.en}” no longer holds in the comparison. Check the changed amounts and adopted evidence.`
                          )}
                        </span>
                      ))}
                      {addedSignals.map((signal) => (
                        <span className="compare-signal-change" key={`added-${signal.id}`}>
                          {t(
                            `「${signal.title.zh}」在对照任务中开始成立，请核对金额及采用材料的变化。`,
                            `“${signal.title.en}” now holds in the comparison. Check the changed amounts and adopted evidence.`
                          )}
                        </span>
                      ))}
                    </p>
                  </div>
                )}
              {left.company === right.company && (
                <section className="comparison-changes">
                  <div className="report-section-title">
                    <div>
                      <h2>{t('解释变化', 'Explanation changes')}</h2>
                    </div>
                  </div>
                  <div className="change-columns">
                    <div className="change-withdrawn">
                      <h3>
                        <ArrowLeft size={17} />
                        {t('撤回', 'Withdrawn')}{' '}
                        <span className="change-count">{withdrawn.length}</span>
                      </h3>
                      {withdrawn.length ? (
                        withdrawn.map((finding) => (
                          <div className="change-item" key={finding.id}>
                            <strong>{t(finding.label, translateRule(finding.label))}</strong>
                            <p>
                              {t('原解释依赖的来源：', 'Sources used by this explanation:')}{' '}
                              {[
                                ...new Set(
                                  finding.sourceRefs.map(
                                    (ref) =>
                                      `${leftReport.snapshot.find((material) => material.id === ref.materialId)?.title || t('未匹配材料', 'Unmatched material')} · ${t('PDF 页', 'PDF p.')} ${ref.page ?? '—'}`
                                  )
                                ),
                              ].join(' / ')}
                            </p>
                            {finding.sourceRefs.length > 0 && (
                              <button
                                className="text-link"
                                onClick={() => showEvidence(finding.sourceRefs, leftReport)}
                              >
                                {t('核对撤回依据', 'Inspect withdrawn evidence')}
                                <ArrowUpRight size={14} />
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        <p>{t('没有撤回的解释。', 'No explanations withdrawn.')}</p>
                      )}
                    </div>
                    <div className="change-restored">
                      <h3>
                        <Plus size={17} />
                        {t('新增或恢复', 'Added or restored')}{' '}
                        <span className="change-count">{restored.length}</span>
                      </h3>
                      {restored.length ? (
                        restored.map((finding) => (
                          <div className="change-item" key={finding.id}>
                            <strong>{t(finding.label, translateRule(finding.label))}</strong>
                            <p>{t(finding.explanation, translateRule(finding.explanation))}</p>
                            {finding.sourceRefs.length > 0 && (
                              <button
                                className="text-link"
                                onClick={() => showEvidence(finding.sourceRefs, rightReport)}
                              >
                                {t('查看来源', 'View sources')}
                                <ArrowUpRight size={14} />
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        <p>{t('没有新增的解释。', 'No explanations added.')}</p>
                      )}
                    </div>
                  </div>
                  {right.excludedMetrics.length > 0 && (
                    <div className="restore-action">
                      <div>
                        <h3>{t('恢复已排除的指标', 'Restore excluded metrics')}</h3>
                        <p>
                          {t(
                            '使用对照任务的原材料，另存规则核查。不会向模型发送材料。',
                            'Save a new rules-based review using the comparison’s original evidence. No materials are sent to a model.'
                          )}
                        </p>
                      </div>
                      <button className="button button-primary" onClick={restore}>
                        <RotateCcw size={16} />
                        {t('恢复并重算', 'Restore and rerun')}
                      </button>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
