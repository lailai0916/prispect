import type { DecisionDetail } from './decision-contracts.js';
import { deriveDecisionClaims } from './decision-claims.js';
import { derivePaymentBoundary } from './payment-boundary.js';
import { decisionClaimQuestion, deriveDecisionFollowUpRecords } from './decision-followup.js';

/** Escapes every user-supplied value. This export is a static record, with no executable content. */
const escape = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!
  );
export function renderDecisionExport(
  detail: DecisionDetail,
  locale: 'en' | 'zh-Hans' = 'zh-Hans',
  translateRule: (text: string) => string = (text) => text
): string {
  const en = locale === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const unknown = t('未知或未提供', 'Unknown or not supplied');
  const value = (raw: unknown) =>
    raw === null || raw === undefined || raw === '' ? unknown : escape(raw);
  const table = (headings: string[], rows: unknown[][]) =>
    `<div class="table"><table><thead><tr>${headings.map((text) => `<th>${escape(text)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${value(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const section = (title: string, body: string) =>
    `<section><h2>${escape(title)}</h2>${body}</section>`;
  const states: Record<string, [string, string]> = {
    matched: ['字段匹配', 'Fields match'],
    unknown: ['未知', 'Unknown'],
    conflict: ['记录冲突', 'Record conflict'],
    withdrawn: ['已撤回', 'Withdrawn'],
    active: ['采用', 'Active'],
    'out-of-scope': ['范围不符', 'Out of scope'],
    'condition-unmet': ['条件未满足', 'Condition unmet'],
    missing: ['缺失', 'Missing'],
    assumption: ['假设', 'Assumption'],
    'source-located': ['已定位保存文本', 'Located in saved text'],
    'user-transcribed': ['用户转录 · 未定位', 'Transcribed · not located'],
    'not-located': ['尚未定位材料', 'Material not located'],
    known: ['条件下可计算', 'Computable under these conditions'],
    'baseline-below-floor': [
      '不含本次拟付也低于底线',
      'Below the floor without this proposed payment',
    ],
    'not-achievable': ['列示回款无法达到条件', 'Listed receipts cannot satisfy the condition'],
    true: ['满足自设上限', 'Within user-set limit'],
    false: ['超过自设上限', 'Above user-set limit'],
    'no-day-end-shortfall': [
      '所列日末检查点未低于底线',
      'No listed day-end check point below the floor',
    ],
    'order-sensitive': ['同日顺序影响底线', 'Same-day order affects the floor'],
    'not-order-sensitive': ['所列检查点未出现此敏感性', 'Not found at listed check points'],
    invalid: ['范围或金额不一致', 'Invalid scope or amounts'],
    'already-above-limit': ['当前暴露已超自设上限', 'Current exposure above your limit'],
  };
  const state = (raw: string) => (states[raw] ? t(...states[raw]) : raw);
  const labels: Record<string, readonly [string, string]> = {
    asOf: ['基准日', 'As-of date'],
    totalAmount: ['合同总额（输入条件）', 'Contract total (input condition)'],
    payeeEntity: ['收款主体', 'Payee entity'],
    refundEntity: ['退款责任主体', 'Refund-responsible entity'],
    alreadyPaid: ['已付', 'Already paid'],
    deliveredAmount: ['实际交付对应金额', 'Delivered value'],
    actualRefund: ['实际到账退款', 'Actual refund received'],
    proposedAmount: ['方案A拟付', 'Option A proposed payment'],
    alternativeAmount: ['方案B拟付', 'Option B proposed payment'],
    exposureLimit: ['自设敞口上限', 'User-set exposure limit'],
    openingCash: ['起点可用现金', 'Opening available cash'],
    cashFloor: ['自设现金底线', 'User-set cash floor'],
    proposedDay: ['方案A付款日', 'Option A payment day'],
    alternativeDay: ['方案B付款日', 'Option B payment day'],
    amount: ['金额', 'Amount'],
    day: ['事件日', 'Event day'],
    entity: ['主体', 'Entity'],
    terms: ['付款交付退款条款', 'Payment, delivery and refund terms'],
    role: ['主体角色', 'Entity role'],
    identity: ['责任主体', 'Responsible entities'],
    paid: ['付款记录', 'Payment record'],
    delivered: ['交付记录', 'Delivery record'],
    refunded: ['到账退款记录', 'Received refund record'],
    'opening-cash': ['可用现金记录', 'Available cash record'],
    'cash-flow': ['现金事件记录', 'Cash event record'],
    'cash-events': ['现金事件', 'Cash events'],
    collections: ['回款解释材料', 'Collection evidence'],
    inventory: ['库存解释材料', 'Inventory evidence'],
    'contract-entity': ['合同责任主体', 'Contract entity'],
    'payee-entity': ['收款主体', 'Payee entity'],
    'refund-entity': ['退款责任主体', 'Refund entity'],
    'source-record': ['来源记录', 'Source record'],
    'counterparty-statement': ['对方陈述', 'Counterparty statement'],
    assumption: ['假设', 'Assumption'],
    in: ['收款', 'Receipt'],
    out: ['付款', 'Payment'],
    contract: ['签约', 'Contract'],
    payee: ['收款', 'Payee'],
    refund: ['退款责任', 'Refund responsibility'],
    fixed: ['固定事件', 'Fixed event'],
    proposed: ['可调整事件', 'Adjustable event'],
  };
  const label = (raw: string) => (labels[raw] ? t(...labels[raw]) : raw);
  const rule = (raw: string) => (en ? translateRule(raw) : raw);
  const input = detail.version.input;
  const conditions = input.external || input.datedCash;
  const conditionRows = Object.entries(conditions || {})
    .filter(([key]) => key !== 'flows')
    .map(([key, raw]) => [label(key), raw]);
  const claims = deriveDecisionClaims(detail.version, detail.evaluation);
  const boundary = derivePaymentBoundary(detail);
  const claimStatus = (raw: string) =>
    raw === 'matched' ? t('字段可核对', 'Fields available for review') : state(raw);
  const boundaryStatus = (raw: string) =>
    ({
      known: t('约束有解', 'Constraints have a solution'),
      unknown: t('未知 · 依据或条件不齐', 'Unknown · evidence or conditions missing'),
      invalid: t('范围或金额不一致 · 停止', 'Invalid scope or amounts · paused'),
      'already-above-limit': t(
        '当前暴露已超自设上限 · 无非负解',
        'Current exposure above your limit · no nonnegative solution'
      ),
    })[raw] || raw;
  const calculations = detail.evaluation.external
    ? [
        ...detail.evaluation.external.assumptionScenarios.map((row) => [
          t('按输入条件', 'Input conditions'),
          row.id,
          row.proposedAmount,
          row.exposure,
          row.withinLimit === null
            ? unknown
            : row.withinLimit
              ? t('满足自设上限', 'Within user-set limit')
              : t('超过自设上限', 'Above user-set limit'),
        ]),
        ...detail.evaluation.external.recordScenarios.map((row) => [
          t('有记录字段', 'Record fields'),
          row.id,
          row.proposedAmount,
          row.exposure,
          row.withinLimit === null
            ? unknown
            : row.withinLimit
              ? t('满足自设上限', 'Within user-set limit')
              : t('超过自设上限', 'Above user-set limit'),
        ]),
      ]
    : (['cash', 'recordedCash'] as const).flatMap((branch) =>
        (['primary', 'alternative'] as const).flatMap((option) => {
          const row = detail.evaluation[branch]?.[option];
          return row
            ? [
                [
                  branch === 'cash'
                    ? t('按输入条件', 'Input conditions')
                    : t('有记录字段', 'Record fields'),
                  option === 'primary' ? 'A' : 'B',
                  row.minimumBalance,
                  row.maximumGap,
                  row.status === 'known' && row.firstShortfallDay === null
                    ? t('所列日末检查点未低于底线', 'No listed day-end check point below the floor')
                    : row.firstShortfallDay,
                ],
              ]
            : [];
        })
      );
  const cashDetails = (['cash', 'recordedCash'] as const).flatMap((branch) =>
    (['primary', 'alternative'] as const).flatMap((option) => {
      const row = detail.evaluation[branch]?.[option];
      return row
        ? [
            [
              branch === 'cash'
                ? t('按输入条件', 'Input conditions')
                : t('有记录字段', 'Record fields'),
              option === 'primary' ? 'A' : 'B',
              row.status === 'known'
                ? t('条件下可计算', 'Computable under these conditions')
                : unknown,
              row.conservativeMinimumBalance,
              row.conservativeMaximumGap,
              row.status === 'known'
                ? row.sameDayOrderSensitive
                  ? t('同日顺序影响底线', 'Same-day order affects the floor')
                  : t('所列检查点未出现此敏感性', 'Not found at listed check points')
                : unknown,
              row.maximumAdditionalPayment,
              state(row.thresholdStatus),
              row.minimumCollectionPercent,
              state(row.minimumCollectionStatus),
            ],
          ]
        : [];
    })
  );
  const cashEvents = (['cash', 'recordedCash'] as const).flatMap((branch) =>
    (['primary', 'alternative'] as const).flatMap((option) =>
      (detail.evaluation[branch]?.[option].events || []).map((event) => [
        branch === 'cash' ? t('按输入条件', 'Input conditions') : t('有记录字段', 'Record fields'),
        option === 'primary' ? 'A' : 'B',
        event.day,
        event.date,
        event.openingBalance,
        event.inflow,
        event.outflow,
        event.balance,
        event.outflowFirstBalance,
        event.flowIds.join(', '),
      ])
    )
  );
  const evidence = detail.version.evidence
    .map(
      (record) =>
        `<article><h3>${escape(record.sourceLabel)}</h3><p class="note">${t('证据ID', 'Evidence ID')}: ${escape(record.id)}</p><p>${escape(label(record.slot))} · ${escape(label(record.kind))} · ${escape(state(record.state))} · ${escape(record.entity)} · ${value(record.asOf)}</p><blockquote>${escape(record.quote)}</blockquote>${table(
          [t('字段', 'Field'), t('保存值', 'Saved value')],
          Object.entries(record.values).map(([key, raw]) => [
            label(key),
            key === 'role' && typeof raw === 'string' ? label(raw) : raw,
          ])
        )}<p class="note">${t('材料ID', 'Material ID')}: ${value(record.materialId)} · ${t('页码', 'Page')}: ${value(record.page)} · ${t('观测ID', 'Observation ID')}: ${value(record.observationId)} · ${t('关联现金事件ID', 'Linked cash event ID')}: ${value(record.flowId)}</p>${
          record.claimId
            ? table(
                [t('问询关联', 'Question association'), t('提交时保存值', 'Saved at submission')],
                [
                  [t('问询ID', 'Question ID'), record.claimId],
                  [t('具体问题', 'Review question'), record.claimQuestion],
                  [t('对方原话', 'Counterparty quotation'), record.claimText],
                  [t('核对目标', 'Review target'), record.claimTarget],
                ]
              )
            : ''
        }</article>`
    )
    .join('');
  return `<!doctype html><html lang="${en ? 'en' : 'zh-CN'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><title>${escape(input.title)} · Prispect</title><style>:root{color-scheme:light;--ink:#202124;--muted:#656970;--line:#e4e5e8;--paper:#fff;--canvas:#f5f6f8}*{box-sizing:border-box}body{font:15px/1.7 system-ui,sans-serif;color:var(--ink);background:var(--paper);max-width:980px;margin:24px auto;padding:0 24px}h1{font-size:26px}h2{font-size:19px}h3{font-size:16px}section{border-top:1px solid var(--line);margin-top:24px;padding-top:12px}.note{color:var(--muted);font-size:13px}p,blockquote,td{overflow-wrap:anywhere;white-space:pre-wrap}blockquote{margin:12px 0;padding:12px;border-left:3px solid var(--line)}.table{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:8px}article{margin:20px 0;break-inside:avoid}@media(max-width:450px){body{padding:0 12px}th,td{padding:6px}}@media print{:root{color-scheme:light;--ink:#202124;--muted:#656970;--line:#ccc;--paper:#fff}body{max-width:none;margin:0;background:white;color:#202124}.table{overflow:visible}thead{display:table-header-group}}</style></head><body><header><p>析光 Prispect · ${t('核查事项版本', 'Review item version')}</p><h1>${escape(input.title)}</h1><p>${escape(input.transactionEntity)} · V${detail.version.revision} · ${escape(detail.version.createdAt)}</p><p class="note">${t('静态离线记录。原件文件未打包；材料ID与摘录保留。恢复联网后在本账号核对原件。此记录不认证资料真伪，不批准付款，历史版本按当前规则重算。', 'Static offline record. Original files are not bundled; material IDs and excerpts are retained. Review originals in the owning account when online. This record does not authenticate sources or approve payment. Historical versions use current rules.')}</p></header>
    ${section(
      t('事项与说法', 'Review and statements'),
      table(
        [t('字段', 'Field'), t('保存值', 'Saved value')],
        [
          [
            t('经营名义 · 不证明责任关系', 'Trading name · does not establish responsibility'),
            input.tradingName,
          ],
          [t('事项原话', 'Original words'), input.promise],
        ]
      ) +
        `<p class="note">${t('原话与核验目标由用户选择。字段可核对不认证原话真实、同意或履行。', 'The user selected these quotations and targets. Fields available for review do not authenticate the quotation, consent or performance.')}</p>` +
        table(
          [
            t('待核对说法', 'Statement to examine'),
            t('具体核查问题', 'Specific review question'),
            t('核验目标', 'Check target'),
            t('字段状态', 'Field state'),
            t('范围与限制', 'Scope and limits'),
            t('下一步核对', 'Next review step'),
            t('关联回复与材料', 'Linked replies and evidence'),
          ],
          claims.map((review) => [
            review.claim.text,
            decisionClaimQuestion(review.claim),
            review.targetLabel[en ? 1 : 0],
            claimStatus(review.status),
            [
              ...review.summaries.map(rule),
              ...(review.explanationOpen === false
                ? [
                    t(
                      '历史财务信号不适用；材料状态不裁定经营原因，不填补当前现金。',
                      'Historical signal not applicable; material state does not establish an operating cause or fill current cash.'
                    ),
                  ]
                : []),
            ].join('\n'),
            review.scopeApplicable
              ? (review.requests.length
                  ? review.requests.map(rule)
                  : [review.fallbackRequest[en ? 1 : 0]]
                ).join('\n')
              : t(
                  '目标不适用于本事项类型，请在编辑时重新选择。',
                  'Target unavailable for this purpose; choose another target when editing.'
                ),
            deriveDecisionFollowUpRecords(detail.version, review.claim)
              .map(({ evidence: record, priorQuestion }) =>
                [
                  record.id,
                  record.kind === 'counterparty-statement'
                    ? t('对方回复 · 待核验陈述', 'Counterparty reply · unverified statement')
                    : t('原文记录', 'Source record'),
                  state(record.state),
                  record.sourceLabel,
                  priorQuestion
                    ? t('对应此前问题', 'Responds to an earlier question')
                    : t('对应本问题', 'Responds to this question'),
                  record.claimQuestion,
                  record.quote,
                ].join(' · ')
              )
              .join('\n'),
          ])
        )
    )}
    ${section(
      t('输入条件 · 金额CNY、相对日D', 'Input conditions · amounts CNY, relative days D'),
      table([t('字段', 'Field'), t('保存值', 'Saved value')], conditionRows) +
        (input.datedCash?.flows.length
          ? table(
              [
                'ID',
                t('名称', 'Name'),
                t('方向', 'Direction'),
                'D',
                'CNY',
                t('约束', 'Constraint'),
              ],
              input.datedCash.flows.map((flow) => [
                flow.id,
                flow.label,
                label(flow.direction),
                flow.day,
                flow.amount,
                label(flow.flexibility),
              ])
            )
          : '')
    )}
    ${section(
      t('核验门槛', 'Evidence gates'),
      table(
        [t('核验项', 'Check'), t('状态', 'State'), t('范围与限制', 'Scope and limits')],
        detail.evaluation.gates.map((gate) => [
          rule(gate.label),
          state(gate.status),
          rule(gate.summary),
        ])
      )
    )}
    ${section(
      t('核验依赖与原件定位', 'Check dependencies and source location'),
      table(
        [
          t('核验项', 'Check'),
          t('依赖', 'Dependency'),
          t('状态', 'State'),
          t('定位', 'Location'),
          t('引用ID与页码', 'Reference IDs and page'),
        ],
        detail.evaluation.gates.flatMap((gate) =>
          gate.dependencies.map((dep) => [
            rule(gate.label),
            rule(dep.label),
            state(dep.state),
            dep.binding ? state(dep.binding) : unknown,
            [
              dep.id,
              dep.materialId,
              dep.observationId,
              dep.taskId,
              dep.path,
              dep.page === null || dep.page === undefined ? null : `p.${dep.page}`,
            ]
              .filter(Boolean)
              .join(' · '),
          ])
        )
      )
    )}
    ${section(t('条件演算 · 结果不是付款推荐', 'Conditional calculations · not payment advice'), table([t('依据', 'Basis'), t('方案', 'Option'), ...(detail.evaluation.external ? ['CNY ' + t('拟付', 'Proposed'), 'CNY ' + t('敞口', 'Exposure'), t('上限条件', 'Limit condition')] : ['CNY ' + t('最低日末', 'Minimum day-end'), 'CNY ' + t('最大缺口', 'Maximum gap'), 'D ' + t('首次低于底线', 'First shortfall')])], calculations))}
    ${
      boundary
        ? section(
            t('付款条件反求 · 金额CNY', 'Solve payment constraints · amounts CNY'),
            `<p class="note">${t('数学上限 = min(交易总额 − 已付，上限 + 已交付 + 实到账退款 − 已付)。范围一致且当前暴露未超自设上限时适用。记录路径要求主体、条款和三项金额均有定位依据；交易总额与上限仍是输入条件。该上限不是付款批准或推荐。', 'Mathematical ceiling = min(transaction total − paid, limit + delivered + actual refunds − paid). Applies when the scope is consistent and current exposure is within your limit. The record path requires located entity, terms and three amount records; total and limit remain input conditions. This ceiling is not payment approval or advice.')}</p>` +
              table(
                [
                  t('依据', 'Basis'),
                  t('状态', 'State'),
                  t('本次拟付款数学上限', 'Mathematical ceiling'),
                  t('当前未交付暴露', 'Current undelivered exposure'),
                  t('超出自设上限', 'Excess above your limit'),
                ],
                [
                  [
                    t('按全部输入条件', 'All entered conditions'),
                    boundaryStatus(boundary.assumptions.status),
                    boundary.assumptions.maximumProposedAmount,
                    boundary.assumptions.currentExposure,
                    boundary.assumptions.currentExcess,
                  ],
                  [
                    t('按定位记录与输入条件', 'Located records and input conditions'),
                    boundaryStatus(boundary.records.status),
                    boundary.records.maximumProposedAmount,
                    boundary.records.currentExposure,
                    boundary.records.currentExcess,
                  ],
                ]
              )
          )
        : ''
    }
    ${cashDetails.length ? section(t('现金时序与反求约束 · 金额CNY', 'Cash ordering and constraints · amounts CNY'), `<p class="note">${t('付款优先余额是同日顺序未知时的保守边界，不是预测。同日先付款可能低于底线，即使日末不低于底线。拟付款额度的有效性需同时看反求状态。', 'Outflows-first balances bound unknown same-day ordering; they are not forecasts. Payments first may breach the floor even when day-end balances do not. Read the threshold status together with the payment amount.')}</p>` + table([t('依据', 'Basis'), t('方案', 'Option'), t('状态', 'State'), t('最低付款优先余额', 'Minimum outflows-first balance'), t('付款优先最大缺口', 'Maximum outflows-first gap'), t('同日敏感性', 'Same-day sensitivity'), t('拟付款额度', 'Proposed-payment threshold'), t('反求状态', 'Threshold state'), t('最低回款比例%', 'Minimum collection %'), t('回款条件状态', 'Collection condition state')], cashDetails) + table([t('依据', 'Basis'), t('方案', 'Option'), 'D', t('日期', 'Date'), t('期初', 'Opening'), t('收款', 'Receipts'), t('付款', 'Payments'), t('日末', 'Day-end'), t('付款优先', 'Outflows first'), t('事件ID', 'Event IDs')], cashEvents)) : ''}
    ${section(t('已知冲突、解释与限制', 'Known conflicts, explanations and limits'), detail.evaluation.knownConflicts.map((conflict) => `<article><h3>${escape(label(conflict.slot))}</h3><p>${escape(rule(conflict.message))}</p><p class="note">${escape(conflict.evidenceIds.join(', '))} · V${conflict.introducedRevision}</p></article>`).join('') + detail.evaluation.explanations.map((explanation) => `<article><h3>${escape(label(explanation.id))} · ${escape(explanation.state === 'open' ? t('待区分解释', 'Explanations to distinguish') : t('历史信号不适用', 'Historical signal not applicable'))}</h3><p>${escape(explanation.alternatives.map(rule).join('\n'))}</p><p>${escape(rule(explanation.evidenceReview?.summary || explanation.nextEvidence))}</p></article>`).join('') + detail.evaluation.limitations.map((limit) => `<p class="note">${escape(rule(limit))}</p>`).join(''))}
    ${section(t('下一步询证 · 尚未取得材料', 'Next evidence requests · materials not yet obtained'), detail.evaluation.nextActions.map((action) => `<article><h3>${escape(rule(action.title))}</h3><p>${escape(rule(action.requestedEvidence))}</p></article>`).join(''))}
    ${section(t('保存材料与摘录', 'Saved evidence and excerpts'), evidence || `<p>${unknown}</p>`)}
    ${
      detail.changes
        ? section(
            `V${detail.changes.fromRevision} → V${detail.changes.toRevision} · ${t('输入版本差异', 'Input-version differences')}`,
            `<p class="note">${t('未重新取证，不表示企业经济变化。', 'No new retrieval; not a record of business changes.')}</p>` +
              table(
                [t('变化项', 'Changed field'), t('之前', 'Before'), t('之后', 'After')],
                detail.changes.changes.map((row) => [
                  row.label[en ? 1 : 0] + (row.unit === 'CNY' ? ' (CNY)' : ''),
                  row.unit === 'state' && row.before !== null ? state(row.before) : row.before,
                  row.unit === 'state' && row.after !== null ? state(row.after) : row.after,
                ])
              )
          )
        : ''
    }
    </body></html>`;
}
