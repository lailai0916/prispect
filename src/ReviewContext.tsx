import { productTerms } from '../shared/product-terms';
import { useEffect, useImperativeHandle, useState, type FormEvent, type Ref } from 'react';
import { ArrowRight, ArrowUpRight, Check, FileText, Save } from 'lucide-react';
import type {
  AnalysisTask,
  CashPlanInput,
  ContextNoteKey,
  ContextNotes,
  EvidenceRef,
  Report,
  ReviewPurpose,
  TaskContextPatch,
} from '../shared/contracts';
import { calculateCashPlan } from '../shared/cash-plan';
import { api } from './api';
import { useApp, type Translate } from './context';
import { date, metricName, metricValue, money } from './format';
import { translateRule } from './ruleTranslations';
import { CashStressLab } from './CashStressLab';

export function purposeName(purpose: ReviewPurpose | undefined, t: Translate) {
  return purpose === 'handover'
    ? t(...productTerms.handoverReview)
    : t(...productTerms.beforePayment);
}

function scopeItems(
  purpose: ReviewPurpose,
  company: string,
  year: number,
  t: Translate
): Array<{ key: ContextNoteKey; title: string; reason: string; required: string }> {
  return purpose === 'external'
    ? [
        {
          key: 'external.identity',
          title: t('签约与收款主体', 'Contracting and receiving entities'),
          reason: t(
            `先确认你交付的是银行存款、投资或借款、合同款项，还是工作或服务信任；签约和收款主体是否为 ${company}？`,
            `Identify whether this is a bank deposit, investment or loan, contract payment, or trust in work or services. Is ${company} the contracting and receiving entity?`
          ),
          required: t(
            '合同、收款账户名称、公司登记资料；银行存款另核机构与产品性质。',
            'Contract, receiving account name, and entity registration. For a bank deposit, separately verify the institution and product type.'
          ),
        },
        {
          key: 'external.promise',
          title: t('用途、交付与退出条件', 'Use of funds, delivery and exit terms'),
          reason: t(
            '年报现金利润比不能证明本金安全或履约能力。记录承诺的资金用途、交付时间、退款条件及保障由谁承担。',
            'The annual cash-to-profit ratio does not establish principal safety or performance. Record the promised use of funds, delivery dates, refund conditions, and who provides any protection.'
          ),
          required: t(
            '书面条款、收款用途、交付节点、退款或保障文件。',
            'Written terms, payment purpose, delivery milestones, and refund or protection documents.'
          ),
        },
        {
          key: 'external.latest',
          title: t('年报后的经营变化', 'Changes since the annual report'),
          reason: t(
            `${year} 年度数据仅描述历史。补充披露后的变化，并结合下方询证项查看期后回款。`,
            `${year} figures describe a historical period. Obtain changes since publication and subsequent collections relevant to the evidence requests below.`
          ),
          required: t(
            '最新经营材料、期后回款记录、合同变更或重大事项说明。',
            'Recent operating information, subsequent collections, contract changes, and material-event explanations.'
          ),
        },
      ]
    : [
        {
          key: 'handover.cash',
          title: t('当前可用资金', 'Current available cash'),
          reason: t(
            '先核对接手时能使用多少钱。年末报表余额和全年经营现金净额，都不能直接填作今天的可用余额。',
            'Establish cash available at handover. Neither a year-end reported balance nor annual operating cash flow is today’s usable cash balance.'
          ),
          required: t(
            '最新银行对账单、账户明细、受限或冻结资金记录及核对日期。',
            'Latest bank reconciliations, account details, restricted or frozen funds, and the reconciliation date.'
          ),
        },
        {
          key: 'handover.schedule',
          title: t('近期应收与到期付款', 'Near-term collections and payments due'),
          reason: t(
            '将现金存量、预计流入和到期义务分开，逐笔核对未来90天付款与回款，再填写收付款工作表。',
            'Separate cash on hand, expected inflows and obligations due. Reconcile collections and payments over the next 90 days before filling the worksheet.'
          ),
          required: t(
            '应收回款计划、账龄、工资税费、供应商账期及债务到期表。',
            'Collection schedules, receivable aging, payroll and tax obligations, supplier terms, and debt maturities.'
          ),
        },
        {
          key: 'handover.controls',
          title: t('订单、存货与交接责任', 'Orders, inventory and handover responsibilities'),
          reason: t(
            '对照现金桥与询证项，核对占款由哪些订单和客户形成；明确交接后的负责人、授权与审批。',
            'Use the bridge and evidence requests to trace working-capital use to customers and orders, and assign post-handover ownership, authority and approvals.'
          ),
          required: t(
            '订单覆盖、库龄与期后出库、客户账龄、审批权限及交接签认记录。',
            'Order coverage, inventory aging and dispatches, customer aging, approval limits, and handover sign-offs.'
          ),
        },
      ];
}

export interface ReviewContextHandle {
  changePurpose: (next: ReviewPurpose) => Promise<boolean>;
}

export function ReviewContext({
  task,
  report,
  controlRef,
  hidePurposeSelector = false,
}: {
  task: AnalysisTask;
  report: Report;
  controlRef?: Ref<ReviewContextHandle>;
  hidePurposeSelector?: boolean;
}) {
  const { t, locale, execute, busy, showEvidence } = useApp();
  const purpose = task.purpose || 'external';
  const [notes, setNotes] = useState<ContextNotes>(task.contextNotes || {});
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [externalCashOpen, setExternalCashOpen] = useState(false);
  const notesVersion = JSON.stringify(task.contextNotes || {});
  useEffect(() => {
    setNotes(task.contextNotes || {});
    setDirty(false);
    setSaved(false);
  }, [task.id, notesVersion]);
  const items = scopeItems(purpose, task.company, task.year, t);
  const metric = (key: string) => report.metrics.find((item) => item.key === key);
  const adopted = ['netProfit', 'operatingCashFlow']
    .map(metric)
    .filter((item) => item?.value !== null && item?.value !== undefined);
  const ratio = metric('cashConversion');
  const causes = report.bridge
    ? report.findings.filter((item) => ['receivables', 'inventory'].includes(item.id))
    : [];
  const stopped = report.verdict === 'conflict' || !report.bridge;
  const evidence = (refs: EvidenceRef[], label = t('查看来源', 'View sources')) =>
    refs.length ? (
      <button className="text-link" onClick={() => showEvidence(refs, report)}>
        {label}
        <ArrowUpRight size={13} />
      </button>
    ) : null;
  const changePurpose = async (next: ReviewPurpose) => {
    if (next === purpose) return true;
    const contextNotes: ContextNotes = {};
    for (const item of items) if (notes[item.key]) contextNotes[item.key] = notes[item.key];
    const result = await execute(() =>
      api<AnalysisTask>(`/tasks/${task.id}/context`, {
        method: 'PATCH',
        body: JSON.stringify({
          purpose: next,
          ...(dirty ? { contextNotes } : {}),
        } satisfies TaskContextPatch),
      })
    );
    return Boolean(result);
  };
  useImperativeHandle(controlRef, () => ({ changePurpose }));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const contextNotes: ContextNotes = {};
    for (const item of items) contextNotes[item.key] = notes[item.key] || { done: false, note: '' };
    const result = await execute(
      () =>
        api<AnalysisTask>(`/tasks/${task.id}/context`, {
          method: 'PATCH',
          body: JSON.stringify({ contextNotes } satisfies TaskContextPatch),
        }),
      t('场景跟进已保存', 'Context follow-up saved')
    );
    if (result) {
      setDirty(false);
      setSaved(true);
    }
  };
  const update = (key: ContextNoteKey, patch: Partial<{ done: boolean; note: string }>) => {
    setNotes((previous) => ({
      ...previous,
      [key]: { done: false, note: '', ...previous[key], ...patch },
    }));
    setDirty(true);
    setSaved(false);
  };
  const signal =
    report.verdict === 'conflict'
      ? t('口径冲突，暂停解释金额关系。', 'Reporting scopes conflict; interpretation is paused.')
      : ratio?.value != null
        ? t(
            `${report.year}年经营现金为合并净利润的 ${metricValue(ratio, locale)}。`,
            `${report.year} operating cash is ${metricValue(ratio, locale)} of consolidated net profit.`
          )
        : t(
            '现金利润比未计算；先确认同口径利润与现金。',
            'The ratio is unavailable. Confirm profit and cash on a consistent scope first.'
          );
  return (
    <section className="review-context" aria-labelledby="context-heading">
      <div className="context-heading">
        <h2 id="context-heading">
          {hidePurposeSelector
            ? purpose === 'handover'
              ? t('接手背景与跟进', 'Handover context and follow-up')
              : t('付款背景与跟进', 'Payment context and follow-up')
            : t('核查用途', 'Review purpose')}
        </h2>
        {!hidePurposeSelector && (
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
        )}
      </div>
      <details className="review-path" open>
        <summary>{t('从财报到下一步', 'From financial statements to next steps')}</summary>
        <ol className="review-path-list">
          <li>
            <span className="path-number">1</span>
            <div>
              <h3>{t('所用材料', 'Materials used')}</h3>
              <p>
                {task.company} · {report.year} {t('年度', 'FY')} · {report.snapshot.length}{' '}
                {t('份材料', 'materials')}
              </p>
              {evidence(
                report.snapshot.flatMap((material) =>
                  material.observations.slice(0, 1).map((obs) => ({
                    materialId: material.id,
                    page: obs.page,
                    quote: obs.quote,
                    sourceUrl: material.sourceUrl,
                  }))
                )
              )}
            </div>
          </li>
          <li>
            <span className="path-number">2</span>
            <div>
              <h3>{t('已采用事实', 'Adopted facts')}</h3>
              {report.verdict === 'conflict' ? (
                <p>
                  {t(
                    '口径冲突，先核对原件与报表范围。',
                    'Conflicting scopes: check source documents and reporting boundaries first.'
                  )}
                </p>
              ) : adopted.length ? (
                adopted.map((item) => (
                  <p className="path-fact" key={item!.key}>
                    <span>
                      {metricName(item!.key as 'netProfit' | 'operatingCashFlow', locale)}
                    </span>
                    <strong>{money(item!.value, locale, false)} CNY</strong>
                  </p>
                ))
              ) : (
                <p>
                  {t(
                    '同口径利润和现金尚未齐备。',
                    'Consistent profit and cash figures are not both available.'
                  )}
                </p>
              )}
              {evidence(adopted.flatMap((item) => item!.sourceRefs))}
            </div>
          </li>
          <li>
            <span className="path-number">3</span>
            <div>
              <h3>{t('现金信号', 'Cash signal')}</h3>
              <p>{signal}</p>
              <small>
                {t(
                  '不是销售回款率，也不是本金安全率。',
                  'Neither a sales collection rate nor a measure of principal safety.'
                )}
              </small>
            </div>
          </li>
          <li className={stopped ? 'path-stopped' : ''}>
            <span className="path-number">4</span>
            <div>
              <h3>{t('可能原因', 'Possible causes')}</h3>
              {stopped ? (
                <p>
                  {t(
                    '现金桥条件未满足，停止原因归因。',
                    'Bridge requirements are not met; causal attribution is withheld.'
                  )}
                </p>
              ) : causes.length ? (
                causes.map((item) => (
                  <div className="path-cause" key={item.id}>
                    <p>{t(item.explanation, translateRule(item.explanation))}</p>
                    {evidence(item.sourceRefs)}
                  </div>
                ))
              ) : (
                <p>
                  {t(
                    '材料没有形成需进一步裁定的应收或存货占款解释；不作公司可靠性判断。',
                    'The evidence does not identify a receivables or inventory cash-use explanation requiring a decision between alternatives. No company reliability judgment is made.'
                  )}
                </p>
              )}
            </div>
          </li>
          <li>
            <span className="path-number">5</span>
            <div>
              <h3>{t('待补证', 'Evidence still needed')}</h3>
              {report.questions.length ? (
                <p>
                  {report.questions
                    .map((item) => t(item.requestedEvidence, translateRule(item.requestedEvidence)))
                    .join(' ')}
                </p>
              ) : (
                <p>
                  {t(
                    '仍需获取本视角清单中的近期与业务资料。',
                    'Obtain the recent and business-specific documents in the checklist for this perspective.'
                  )}
                </p>
              )}
              <button
                className="text-link"
                onClick={() =>
                  document.getElementById('questions')?.scrollIntoView({
                    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                      ? 'auto'
                      : 'smooth',
                  })
                }
              >
                {t('查看询证清单', 'View evidence requests')}
                <ArrowRight size={13} />
              </button>
            </div>
          </li>
          <li>
            <span className="path-number">6</span>
            <div>
              <h3>{t('下一步', 'Next step')}</h3>
              <p>
                {purpose === 'external'
                  ? t(
                      '先核对交付性质、签约与收款主体，再核对承诺条款及近期变化。财报不替代银行机构或存款产品核查。',
                      'Verify the commitment type and contracting/receiving entities, then review terms and recent changes. Financial statements do not replace checks on a bank or deposit product.'
                    )
                  : t(
                      '取得最新资金对账与付款回款计划，明确交接责任后填写90天工作表。',
                      'Obtain current cash reconciliations and collection/payment schedules, assign handover responsibilities, then fill the 90-day worksheet.'
                    )}
              </p>
            </div>
          </li>
        </ol>
      </details>
      {purpose === 'external' && (
        <details className="finance-definitions">
          <summary>{t('三个财务词的含义', 'Three financial terms explained')}</summary>
          <dl>
            <div>
              <dt>{t('净利润', 'Net profit')}</dt>
              <dd>
                {t(
                  '本期按会计规则计出的收入减费用结果，可能含尚未收到的钱。',
                  'Income less expenses under accounting rules for a period; some money may not yet have been received.'
                )}
              </dd>
            </div>
            <div>
              <dt>{t('经营现金净额', 'Operating cash flow')}</dt>
              <dd>
                {t(
                  '一段期间经营活动现金流入减流出，不是账户此刻的余额。',
                  'Cash inflows less outflows from operations over a period, rather than the account balance at a moment.'
                )}
              </dd>
            </div>
            <div>
              <dt>{t('年末现金余额', 'Year-end cash balance')}</dt>
              <dd>
                {t(
                  '年末某一日的存量，需结合表内口径与受限资金核对；不是今天的可用资金。',
                  'A stock of cash at a particular year-end date, subject to its reporting scope and restrictions. It is not current available cash.'
                )}
              </dd>
            </div>
          </dl>
        </details>
      )}
      <form className="context-checklist" onSubmit={save}>
        <div className="report-section-title">
          <h3>{t('场景跟进清单', 'Context follow-up')}</h3>
          <span className="save-state">
            {dirty
              ? t('未保存', 'Unsaved')
              : saved || items.some((item) => task.contextNotes?.[item.key])
                ? t('已保存', 'Saved')
                : t('未保存', 'Unsaved')}
          </span>
        </div>
        <p className="context-note">
          {t(
            '勾选只记录跟进，不认证事实；备注不发送给模型。',
            'Checking an item records follow-up, not fact verification. Notes are not sent to a model.'
          )}
        </p>
        {items.map((item) => (
          <div className="context-check-row" key={item.key}>
            <label className="context-check-label">
              <input
                type="checkbox"
                checked={notes[item.key]?.done || false}
                disabled={busy}
                onChange={(event) => update(item.key, { done: event.target.checked })}
              />
              <strong>{item.title}</strong>
            </label>
            <div className="context-check-body">
              <p>{item.reason}</p>
              <p className="context-required">
                <FileText size={14} />
                {item.required}
              </p>
              <label className="form-field">
                <span>
                  {t('跟进备注', 'Follow-up note')} · {item.title}
                </span>
                <textarea
                  rows={2}
                  maxLength={2000}
                  disabled={busy}
                  value={notes[item.key]?.note || ''}
                  onChange={(event) => update(item.key, { note: event.target.value })}
                  placeholder={t(
                    '记录已取得的材料、待核对事项或负责人。',
                    'Record documents obtained, open checks or the responsible person.'
                  )}
                />
              </label>
            </div>
          </div>
        ))}
        <div className="context-save">
          <button className="button button-primary" type="submit" disabled={busy || !dirty}>
            <Save size={15} />
            {t('保存场景跟进', 'Save context follow-up')}
          </button>
        </div>
      </form>
      <details
        className={
          purpose === 'handover' ? 'handover-cash-assumptions' : 'external-cash-assumptions'
        }
        open={purpose === 'handover' || externalCashOpen}
        onToggle={(event) => {
          if (purpose === 'external') setExternalCashOpen(event.currentTarget.open);
        }}
      >
        <summary>{t('检验对方的收付款假设', 'Check the counterparty’s cash assumptions')}</summary>
        <CashWorksheet key={task.id} task={task} />
        <CashStressLab key={`stress-${task.id}`} plan={task.cashPlan} />
      </details>
    </section>
  );
}

function emptyPlan(): CashPlanInput {
  return {
    asOf: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }),
    openingCash: null,
    periods: [
      { days: 30, inflow: null, outflow: null },
      { days: 60, inflow: null, outflow: null },
      { days: 90, inflow: null, outflow: null },
    ],
  };
}

function editablePlan(plan: CashPlanInput | undefined): CashPlanInput {
  if (!plan) return emptyPlan();
  return {
    asOf: plan.asOf,
    openingCash: plan.openingCash,
    periods: plan.periods.map(({ days, inflow, outflow }) => ({
      days,
      inflow,
      outflow,
    })) as CashPlanInput['periods'],
  };
}

export function CashWorksheet({ task }: { task: AnalysisTask }) {
  const { t, locale, execute, busy, confirm } = useApp();
  const [plan, setPlan] = useState<CashPlanInput>(() => editablePlan(task.cashPlan));
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const planVersion = JSON.stringify(task.cashPlan || null);
  useEffect(() => {
    setPlan(editablePlan(task.cashPlan));
    setDirty(false);
    setSaved(false);
  }, [task.id, planVersion]);
  const validAmount = (value: string | null) =>
    value === null || /^\d{1,20}(?:\.\d{1,2})?$/.test(value);
  const amountsValid =
    validAmount(plan.openingCash) &&
    plan.periods.every((item) => validAmount(item.inflow) && validAmount(item.outflow));
  const result = amountsValid ? calculateCashPlan(plan) : null;
  const update = (next: CashPlanInput) => {
    setPlan(next);
    setDirty(true);
    setSaved(false);
  };
  const setPeriod = (index: number, field: 'inflow' | 'outflow', value: string) =>
    update({
      ...plan,
      periods: plan.periods.map((item, i) =>
        i === index ? { ...item, [field]: value.trim() || null } : item
      ) as CashPlanInput['periods'],
    });
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !amountsValid) return;
    const next = await execute(
      () =>
        api<AnalysisTask>(`/tasks/${task.id}/context`, {
          method: 'PATCH',
          body: JSON.stringify({ cashPlan: editablePlan(plan) } satisfies TaskContextPatch),
        }),
      t('90天工作表已保存', '90-day worksheet saved')
    );
    if (next) {
      setDirty(false);
      setSaved(true);
    }
  };
  const amountInput = (value: string | null, label: string, change: (value: string) => void) => (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      disabled={busy}
      aria-label={label}
      aria-invalid={!validAmount(value)}
      placeholder={t('未知', 'Unknown')}
      value={value ?? ''}
      pattern="[0-9]{1,20}(\.[0-9]{1,2})?"
      maxLength={23}
      onChange={(event) => change(event.target.value)}
    />
  );
  return (
    <form className="cash-worksheet" onSubmit={save}>
      <div className="report-section-title">
        <h3>{t('90天收付款工作表', '90-day cash worksheet')}</h3>
        <span className="save-state">
          {dirty
            ? t('未保存', 'Unsaved')
            : saved
              ? t('已保存', 'Saved')
              : task.cashPlan?.updatedAt
                ? `${t('保存于', 'Saved')} ${date(task.cashPlan.updatedAt, locale)}`
                : t('未保存', 'Unsaved')}
        </span>
      </div>
      <p className="context-note">
        {t(
          '来源：用户输入，未经核验，不发送模型。按情景递推，不是预测；年报金额不自动填入。',
          'Source: unverified user input, not sent to a model. Scenario arithmetic rather than a forecast; annual-report amounts are not prefilled.'
        )}
      </p>
      <div className="worksheet-start">
        <label className="form-field">
          <span>{t('测算日期', 'Scenario date')}</span>
          <input
            type="date"
            required
            disabled={busy}
            value={plan.asOf}
            onChange={(event) => update({ ...plan, asOf: event.target.value })}
          />
        </label>
        <label className="form-field">
          <span>{t('当前可用现金（元）', 'Current available cash (CNY)')}</span>
          {amountInput(
            plan.openingCash,
            t('当前可用现金（元）', 'Current available cash (CNY)'),
            (value) => update({ ...plan, openingCash: value.trim() || null })
          )}
        </label>
      </div>
      <p className="field-note">
        {t(
          '现金存量 + 当期预计流入 − 当期到期流出 = 期末余额。留空表示未知，0必须主动填写；金额最多两位小数。',
          'Cash on hand + expected inflows − payments due = closing balance. Blank means unknown; enter zero explicitly. Amounts allow two decimal places.'
        )}
      </p>
      <p className="comparison-mobile-hint">
        {t('左右滑动，填写三期收付款。', 'Swipe to fill the three intervals.')}
      </p>
      <div className="table-wrap worksheet-table-wrap">
        <table className="worksheet-table">
          <thead>
            <tr>
              <th>{t('区间', 'Interval')}</th>
              <th>{t('预计流入（元）', 'Expected inflows (CNY)')}</th>
              <th>{t('到期流出（元）', 'Payments due (CNY)')}</th>
              <th>{t('期末余额（元）', 'Closing balance (CNY)')}</th>
              <th>{t('缺口（元）', 'Funding gap (CNY)')}</th>
            </tr>
          </thead>
          <tbody>
            {plan.periods.map((period, index) => {
              const item = result?.periods[index];
              const interval = `${index === 0 ? 0 : index === 1 ? 31 : 61}–${period.days}`;
              return (
                <tr
                  key={period.days}
                  className={item?.gap && item.gap !== '0.00' ? 'worksheet-gap' : ''}
                >
                  <th>
                    {interval} {t('天', 'days')}
                  </th>
                  <td>
                    {amountInput(
                      period.inflow,
                      `${interval} ${t('天预计流入（元）', 'days expected inflows (CNY)')}`,
                      (value) => setPeriod(index, 'inflow', value)
                    )}
                  </td>
                  <td>
                    {amountInput(
                      period.outflow,
                      `${interval} ${t('天到期流出（元）', 'days payments due (CNY)')}`,
                      (value) => setPeriod(index, 'outflow', value)
                    )}
                  </td>
                  <td className="worksheet-result">
                    {item?.balance != null
                      ? money(item.balance, locale, false)
                      : t('未知', 'Unknown')}
                    {item?.missingFields.length ? (
                      <small>{t('需补齐本期或前期输入', 'Complete this or earlier inputs')}</small>
                    ) : null}
                  </td>
                  <td className="worksheet-result">
                    {item?.gap != null ? money(item.gap, locale, false) : t('未知', 'Unknown')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!amountsValid && (
        <p className="inline-error">
          {t(
            '请输入非负人民币金额，最多20位整数及两位小数。',
            'Enter nonnegative CNY amounts with at most 20 integer digits and two decimal places.'
          )}
        </p>
      )}
      <div className="context-save">
        <button
          className="button button-primary"
          disabled={busy || !dirty || !amountsValid}
          type="submit"
        >
          <Save size={15} />
          {t('保存工作表', 'Save worksheet')}
        </button>
        {task.cashPlan && (
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={() =>
              confirm({
                title: t('删除这份工作表？', 'Delete this worksheet?'),
                text: t(
                  '这份财报核查保存的人工现金假设将删除，核查报告与材料保留。',
                  'This deletes the cash assumptions saved with this financial review. The review report and materials remain.'
                ),
                action: async () => {
                  await api(`/tasks/${task.id}/context`, {
                    method: 'PATCH',
                    body: JSON.stringify({ cashPlan: null }),
                  });
                },
              })
            }
          >
            {t('删除工作表', 'Delete worksheet')}
          </button>
        )}
      </div>
    </form>
  );
}
