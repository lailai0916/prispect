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
  const restore = async () => {
    if (!right) return;
    const next = await execute(() =>
      post<AnalysisTask>('/tasks', {
        title: reviewVariantTitle(right.title, t('恢复完整证据', 'Full evidence restored')),
        company: right.company,
        year: right.year,
        materialIds: right.materialIds,
        excludedMetrics: [],
        useModel: false,
      } satisfies CreateTaskInput)
    );
    if (next) navigate(`/tasks/${next.id}`);
  };
  return (
    <>
      <PageHeading
        eyebrow="COMPARE THE EVIDENCE, NOT A RANK"
        title={t('历史核查比较', 'Compare historical reviews')}
        description={t(
          '看清材料变化，如何改变解释的边界。比较的是核查任务，不是公司健康排名。',
          'See how changed evidence changes the boundaries of an explanation. Compare reviews, not company health rankings.'
        )}
      />
      {completed.length < 2 ? (
        <EmptyState
          title={t('准备两份已完成的核查', 'Two completed reviews are needed')}
          text={t(
            '可先运行完整案例，再通过证据压力测试创建第二份报告。',
            'Run a full case, then create a second report with an evidence stress test.'
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
                      '不同公司可能处于不同的行业和业务阶段。这里只并列显示历史现金结构，不排序、不下安全结论。',
                      'These companies may operate in different industries and business stages. Historical cash structures are displayed side by side, without ranking or safety conclusions.'
                    )}
                  </p>
                </div>
              ) : (
                <div className="info-strip">
                  <Layers size={19} />
                  <p>
                    {t(
                      '同一家公司，比较材料与核查边界的变化。重新运行会创建独立报告，原件与历史结果保留。',
                      'Same company: compare changes in evidence and conclusion boundaries. Reruns create separate reports, preserving original sources and history.'
                    )}
                  </p>
                </div>
              )}
              <div className="comparison-table-wrap">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>{t('核查维度', 'Review dimension')}</th>
                      {[left, right].map((task) => (
                        <th key={task.id}>
                          <span>{task.company}</span>
                          <strong>{task.title}</strong>
                          <a href={`#/tasks/${task.id}`} className="text-link">
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
              {left.company === right.company && (
                <section className="comparison-changes">
                  <div className="report-section-title">
                    <div>
                      <div className="eyebrow">WHAT THE EVIDENCE CHANGED</div>
                      <h2>{t('哪些解释，真的改变了？', 'Which explanations actually changed?')}</h2>
                    </div>
                  </div>
                  <div className="change-columns">
                    <div>
                      <h3>
                        <ArrowLeft size={17} />
                        {t('对照任务中撤回的解释', 'Explanations withdrawn in the comparison')}
                      </h3>
                      {withdrawn.length ? (
                        withdrawn.map((finding) => (
                          <div className="change-item" key={finding.id}>
                            <strong>{t(finding.label, translateRule(finding.label))}</strong>
                            <p>
                              {t('原解释依赖的来源：', 'Sources used by this explanation:')}{' '}
                              {finding.sourceRefs
                                .map(
                                  (ref) =>
                                    `${ref.materialId.slice(0, 8)} · ${t('PDF页', 'PDF p.')} ${ref.page ?? '—'}`
                                )
                                .join(' / ')}
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
                        <p>
                          {t(
                            '两份报告没有撤回的解释差异。',
                            'No explanations were withdrawn between these reports.'
                          )}
                        </p>
                      )}
                    </div>
                    <div>
                      <h3>
                        <Plus size={17} />
                        {t('对照任务中新增的解释', 'Explanations added in the comparison')}
                      </h3>
                      {restored.length ? (
                        restored.map((finding) => (
                          <div className="change-item" key={finding.id}>
                            <strong>{t(finding.label, translateRule(finding.label))}</strong>
                            <p>{t(finding.explanation, translateRule(finding.explanation))}</p>
                          </div>
                        ))
                      ) : (
                        <p>
                          {t(
                            '两份报告没有新增的解释差异。',
                            'No explanations were added between these reports.'
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  {right.excludedMetrics.length > 0 && (
                    <div className="restore-action">
                      <div>
                        <h3>
                          {t(
                            '补回材料，再看结论能否恢复。',
                            'Restore evidence and test the conclusion again.'
                          )}
                        </h3>
                        <p>
                          {t(
                            '使用对照任务保存的材料，取消人工排除，创建第三份独立核查。不会伪装新增外部资料，新任务默认使用规则模式，不自动发送给模型。',
                            'Create a third review from the comparison’s saved materials, with the exclusions removed. This does not pretend that new external documents have arrived. The new task uses rules mode without automatically sending evidence to a model.'
                          )}
                        </p>
                      </div>
                      <button className="button button-primary" onClick={restore}>
                        <RotateCcw size={16} />
                        {t('恢复完整输入并重算', 'Restore full input and rerun')}
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
