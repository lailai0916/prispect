import { productTerms } from '../../shared/product-terms';
import { Select } from '../Select';
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
import type { AnalysisTask, CreateTaskInput, CrossSignalCheck } from '../../shared/contracts';
import { post } from '../api';
import { reviewVariantTitle, date, metricName, metricValue } from '../format';
import { translateRule } from '../ruleTranslations';
import { reportCurrencyView } from '../../shared/report-currency-view';

import { useApp } from '../context';
import { PageHeading, EmptyState, VerdictTag } from '../components';
import '../review-pages.css';
import '../compare-progressive.css';

export function ComparePage({ query }: { query: URLSearchParams }) {
  const { t, locale, workspace, navigate, execute, showEvidence, busy } = useApp();
  const completed = workspace!.tasks.filter((task) => task.status === 'completed' && task.report);
  const [leftId, setLeftId] = useState(query.get('left') || completed[0]?.id || '');
  const [rightId, setRightId] = useState(
    query.get('right') || completed.find((task) => task.id !== leftId)?.id || ''
  );
  const left =
    completed.find((task) => task.id === leftId) ||
    completed.find((task) => task.id !== rightId) ||
    completed[0];
  const right =
    completed.find((task) => task.id === rightId) ||
    completed.find((task) => task.id !== left?.id) ||
    completed[0];
  const recoveredSelection = Boolean(
    (leftId && left?.id !== leftId) || (rightId && right?.id !== rightId)
  );
  const leftCurrency = left?.report ? reportCurrencyView(left.report) : null;
  const rightCurrency = right?.report ? reportCurrencyView(right.report) : null;
  const leftReport = leftCurrency?.report;
  const rightReport = rightCurrency?.report;
  const currencyComparisonPaused = Boolean(
    leftCurrency?.issues.length || rightCurrency?.issues.length
  );
  const sameIssuer = Boolean(
    left && right && left.company.trim().toLowerCase() === right.company.trim().toLowerCase()
  );
  const sameYear = Boolean(left && right && left.year === right.year);
  const comparableVariants = Boolean(
    left && right && left.id !== right.id && sameIssuer && sameYear && !currencyComparisonPaused
  );
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
  const ruleChecks = [
    ...new Map(
      [...(leftReport?.crossSignalChecks || []), ...(rightReport?.crossSignalChecks || [])].map(
        (check) => [check.id, check]
      )
    ).values(),
  ];
  const checkStatus = (status: CrossSignalCheck['status']) =>
    status === 'triggered'
      ? t('组合成立', 'Combination holds')
      : status === 'not-triggered'
        ? t('条件未全部满足', 'Conditions not all met')
        : t('暂不能核对', 'Cannot evaluate yet');
  const checkChanges =
    leftReport?.crossSignalChecks && rightReport?.crossSignalChecks
      ? leftReport.crossSignalChecks.flatMap((baseline) => {
          const comparison = rightReport.crossSignalChecks!.find(
            (check) => check.id === baseline.id
          );
          return comparison && comparison.status !== baseline.status
            ? [{ baseline, comparison }]
            : [];
        })
      : [];
  const restore = async () => {
    if (!right || busy) return;
    const next = await execute(() =>
      post<AnalysisTask>('/tasks', {
        title: reviewVariantTitle(right.title, t('恢复完整证据', 'Full evidence restored')),
        company: right.company,
        year: right.year,
        materialIds: right.materialIds,
        excludedMetrics: [],
        purpose: right.purpose || 'external',
        useModel: true,
      } satisfies CreateTaskInput)
    );
    if (next) navigate(`/tasks/${next.id}`);
  };
  return (
    <div className="compare-page">
      <PageHeading
        title={t(...productTerms.compareReviews)}
        description={t(
          '比较两份已保存核查采用的材料、金额与计算结果。',
          'Compare the evidence, amounts and calculations in two saved reviews.'
        )}
      />
      {completed.length === 0 ? (
        <EmptyState
          title={t('还没有可对比的报告', 'No reviews to compare yet')}
          text={t(
            '完成一份核查后，即可在这里查看各项状态。',
            'Complete a review to see the status of each check here.'
          )}
          action={
            <button className="button button-primary" onClick={() => navigate('/new')}>
              {t('开始核查', 'Start a review')}
              <ArrowRight size={16} />
            </button>
          }
        />
      ) : completed.length < 2 ? (
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
        <section
          className="compare-content"
          aria-label={t('报告证据与计算对比', 'Report evidence and calculation comparison')}
        >
          <div className="compare-selectors">
            <label className="form-field">
              <span>{t('基准核查', 'Baseline financial review')}</span>
              <Select
                value={left?.id || ''}
                onValueChange={(selectedValue) => setLeftId(selectedValue)}
              >
                {completed.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title} · {date(task.createdAt, locale)}
                  </option>
                ))}
              </Select>
            </label>
            <span className="compare-versus">↔</span>
            <label className="form-field">
              <span>{t('对照核查', 'Comparison financial review')}</span>
              <Select
                value={right?.id || ''}
                onValueChange={(selectedValue) => setRightId(selectedValue)}
              >
                {completed.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title} · {date(task.createdAt, locale)}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          {recoveredSelection && (
            <p className="field-note" role="status">
              {t(
                '原选择的核查已不可用，已切换到可用核查。',
                'A selected review is unavailable. Available reviews are shown instead.'
              )}
            </p>
          )}
          {left && right && leftReport && rightReport && (
            <>
              {currencyComparisonPaused ? (
                <div className="warning-box" role="status">
                  <CircleAlert size={19} />
                  <p>
                    {t(
                      '币种或单位待核对，相关计算与解释差异暂不比较。原始金额、来源及已保存解释仍保留在各报告中。',
                      'Currencies or units need review; dependent calculations and explanation differences are withheld. Original amounts, sources and saved interpretations remain in each report.'
                    )}
                  </p>
                </div>
              ) : null}
              {left.id === right.id ? (
                <div className="warning-box">
                  <CircleAlert size={19} />
                  <p>
                    {t(
                      '两侧是同一份财报核查，请选择另一份核查。',
                      'Both selections are the same review. Choose another financial review.'
                    )}
                  </p>
                </div>
              ) : !sameIssuer ? (
                <div className="warning-box">
                  <CircleAlert size={19} />
                  <p>
                    {t(
                      '不同公司的历史金额按各自披露口径并列展示。',
                      'Historical amounts for different companies use each company’s reporting scope.'
                    )}
                  </p>
                </div>
              ) : null}
              {!sameYear && (
                <div className="warning-box" role="status">
                  <CircleAlert size={19} />
                  <p>
                    {t(
                      '两份报告的核查年度不同，金额仅并列展示。解释差异不能视为同一年度证据变化。',
                      'The reports cover different years. Amounts are shown side by side; explanation differences are not evidence changes within the same year.'
                    )}
                  </p>
                </div>
              )}
              <p className="comparison-mobile-hint">
                {t('左右滑动，比较两份核查。', 'Swipe to compare both reviews.')}
              </p>
              <div
                className="comparison-table-wrap"
                tabIndex={0}
                role="region"
                aria-label={t(
                  '两份报告的对比表，可横向滚动',
                  'Comparison of two reports; scroll horizontally'
                )}
              >
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('核查维度', 'Review dimension')}</th>
                      {[left, right].map((task, side) => (
                        <th scope="col" key={`${side}-${task.id}`}>
                          <span>{task.company}</span>
                          <strong>{task.title}</strong>
                          <a href={`/tasks/${task.id}`} className="text-link">
                            {t('打开核查报告', 'Open review report')}
                            <ArrowUpRight size={15} />
                          </a>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">{t('核查年度', 'Year')}</th>
                      <td className="mono">{left.year}</td>
                      <td className="mono">{right.year}</td>
                    </tr>
                    <tr>
                      <th scope="row">{t('结论边界', 'Verdict boundary')}</th>
                      <td>
                        <VerdictTag verdict={leftReport.verdict} />
                      </td>
                      <td>
                        <VerdictTag verdict={rightReport.verdict} />
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">{t('证据覆盖', 'Evidence coverage')}</th>
                      <td>
                        {leftReport.coverage.present}/{leftReport.coverage.total}
                      </td>
                      <td>
                        {rightReport.coverage.present}/{rightReport.coverage.total}
                      </td>
                    </tr>
                    {(['netProfit', 'operatingCashFlow', 'cashConversion'] as const).map((key) => (
                      <tr key={key}>
                        <th scope="row">{metricName(key, locale)}</th>
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
                      <th scope="row">{t('现金桥', 'Cash bridge')}</th>
                      <td>
                        {leftReport.bridge
                          ? t('完整重建并闭合', 'Reconstructed and reconciled')
                          : t('待核对材料与口径', 'Awaiting evidence or scope checks')}
                      </td>
                      <td>
                        {rightReport.bridge
                          ? t('完整重建并闭合', 'Reconstructed and reconciled')
                          : t('待核对材料与口径', 'Awaiting evidence or scope checks')}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">{t('本次主动移除', 'Explicitly excluded')}</th>
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
                      <th scope="row">{t('组合线索', 'Combined signals')}</th>
                      {[leftReport, rightReport].map((report, index) => (
                        <td key={index}>
                          {report.crossSignals === undefined
                            ? t('旧版报告未评估', 'Not evaluated in this older report')
                            : report.crossSignals.length
                              ? report.crossSignals.map((signal) => (
                                  <p key={signal.id}>{t(signal.title.zh, signal.title.en)}</p>
                                ))
                              : report.crossSignalChecks?.some(
                                    (check) => check.status === 'blocked'
                                  )
                                ? t(
                                    '口径待核对，组合暂停展示',
                                    'Scope needs review; combinations withheld'
                                  )
                                : t(
                                    '未触发已实现的组合规则',
                                    'No implemented combination rule triggered'
                                  )}
                        </td>
                      ))}
                    </tr>
                    {ruleChecks.length ? (
                      ruleChecks.map((rule) => (
                        <tr key={`rule-${rule.id}`}>
                          <th scope="row">
                            <span className="compare-rule-label">
                              {t('条件核对', 'Condition check')}
                            </span>
                            {t(rule.title.zh, rule.title.en)}
                          </th>
                          {[leftReport, rightReport].map((report, index) => {
                            const check = report.crossSignalChecks?.find(
                              (item) => item.id === rule.id
                            );
                            return (
                              <td key={index}>
                                {check ? (
                                  <div className="compare-rule-check">
                                    <strong>{checkStatus(check.status)}</strong>
                                    {check.blockers.map((blocker) => (
                                      <p key={blocker.code}>
                                        {t(blocker.message.zh, blocker.message.en)}
                                        {blocker.sourceRefs.length > 0 && (
                                          <button
                                            type="button"
                                            className="text-link"
                                            onClick={() => showEvidence(blocker.sourceRefs, report)}
                                          >
                                            {t('核对来源', 'Inspect sources')}
                                            <ArrowUpRight size={12} />
                                          </button>
                                        )}
                                      </p>
                                    ))}
                                  </div>
                                ) : (
                                  t('本报告未评估这项条件', 'Not evaluated in this report')
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <th scope="row">{t('组合条件核对', 'Combination checks')}</th>
                        {[leftReport, rightReport].map((report, index) => (
                          <td key={index}>
                            {report.crossSignalChecks === undefined
                              ? t('旧版报告未评估', 'Not evaluated in this older report')
                              : t('没有保存的条件核对', 'No condition checks saved')}
                          </td>
                        ))}
                      </tr>
                    )}
                    <tr>
                      <th scope="row">{t('后续问题', 'Follow-up questions')}</th>
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
              {comparableVariants && checkChanges.length > 0 && (
                <div className="info-strip">
                  <Layers size={19} />
                  <div className="compare-rule-changes">
                    {checkChanges.map(({ baseline, comparison }) => (
                      <p key={baseline.id}>
                        <strong>{t(comparison.title.zh, comparison.title.en)}</strong>
                        <span>
                          {checkStatus(baseline.status)} <ArrowRight size={12} aria-hidden="true" />{' '}
                          {checkStatus(comparison.status)}
                        </span>
                      </p>
                    ))}
                    <small>
                      {t(
                        '这是两份已保存报告的条件结果；核对各自的金额、采用材料与缺口。',
                        'These are saved condition results. Check each review’s amounts, adopted evidence and gaps.'
                      )}
                    </small>
                  </div>
                </div>
              )}
              {comparableVariants &&
                checkChanges.length === 0 &&
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
              {comparableVariants && (
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
                                      `${leftReport.snapshot.find((material) => material.id === ref.materialId)?.title || t('未匹配材料', 'Unmatched material')} · ${t('来源页', 'Source p.')} ${ref.page ?? '—'}`
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
                </section>
              )}
              {!currencyComparisonPaused && right.excludedMetrics.length > 0 && (
                <div className="restore-action">
                  <div>
                    <h3>{t('恢复已排除的指标', 'Restore excluded metrics')}</h3>
                    <p>
                      {t(
                        '使用对照任务的原材料，另存新的核查并自动进行 AI 解读。',
                        'Save a new review using the comparison’s original evidence, with automatic AI interpretation.'
                      )}
                    </p>
                  </div>
                  <button className="button button-primary" disabled={busy} onClick={restore}>
                    <RotateCcw size={16} />
                    {t('恢复并重算', 'Restore and rerun')}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
