import { metricNames } from './format';

const rules: Record<string, string> = {
  '任务处理或保存失败，请检查本机工作区后重试。':
    'Processing or saving failed. Check the workspace and retry the actual review.',
  '本次未启用智能解释；未向模型服务发送材料。':
    'Optional model explanation is disabled for this task. No evidence was sent to the model service.',
  '规则解释完成；本次未授权外部模型调用。':
    'Rules-based explanation completed. An external model call was not authorized for this task.',
  '公司将部分现金流变化解释为扩产及银行承兑汇票结算；公司称前十大客户未见大额逾期。以上为管理层说法，本队未取得逐客户期后回款记录验证。':
    'Management attributes some cash-flow changes to capacity expansion and bank-acceptance-bill settlement, and states that the ten largest customers had no significant overdue balances. This is management’s claim; the team has not obtained customer-level subsequent collections to verify it.',
  'CSV 不承载其余分组原始行，若要完整现金桥，请使用含 components 的 JSON。':
    'CSV does not carry original component rows for the other-adjustment group. For a complete bridge, use JSON containing components.',
  '未提供披露日期，暂用导入日期；保存前请核对。':
    'No disclosure date supplied. The import date is temporarily used; verify it before saving.',
  'PDF 自动提取仅为预览；请逐项核对表头、列顺序、金额与范围后保存。扫描件不支持。':
    'PDF extraction is a preview only. Verify headers, column order, amounts, and scope before saving. Scanned PDFs are unsupported.',
  '输入声明的主体、年度期间、人民币单位及合并范围一致；这不等于原件真实性已核验。':
    'The declared company, annual period, CNY unit, and consolidation scope are consistent. This does not authenticate the source document.',
  '非年度期间不能与年度材料混用，请提供同年度合并数据。':
    'Non-annual periods cannot be combined with annual evidence. Supply consolidated data for the same full financial year.',
  '年度期间未确认；同一个年份不能证明期间相同。':
    'The annual period is unconfirmed. Sharing a year label does not establish the same reporting period.',
  '输入冲突，不调用模型；规则核查保留。':
    'Input conflicts: no model call is made. The rules-based review remains available.',
  '实际调用可选模型，检查引用 ID 与格式；含义需人工复核。':
    'Calling the optional model and checking citation IDs and format. Meaning still needs human review.',
  '模型输出的引用 ID 与格式已检查；解释含义需人工复核。':
    'Model citation IDs and format have been checked. The explanation’s meaning still needs human review.',
  '输入存在冲突，未调用模型；规则报告完整保留。':
    'Conflicting input: no model call was made. The deterministic report is retained.',
  '没有可采用的年度合并证据，未调用模型；规则报告完整保留。':
    'No usable annual consolidated evidence: no model call was made. The rules report is retained.',
  '核验输入声明的字段、单位与金额精度。':
    'Checking declared input fields, units, and monetary precision.',
  '输入字段与精度检查完成；口径冲突与现金桥进入确定性分析。':
    'Input fields and precision checked. Scope conflicts and cash reconciliation proceed to deterministic analysis.',
  '模型调用超时；规则报告完整保留。': 'Model call timed out. The deterministic report is retained.',
  '模型调用或输出验证失败；规则报告完整保留，未采用不可靠解释。':
    'Model call or output checks failed. The rules report is retained without adopting an unreliable explanation.',
  'JSON 已通过格式校验；原始来源及数字真实性需由提供者核对。':
    'JSON format validated. The provider must still verify original provenance and financial accuracy.',
  '导入的结构化输入须由提供者核对原始来源。':
    'The provider must verify structured observations against their original source.',
  '未找到可确认的两年现金流补充表，当前仅提取文本；请手工补入结构化观测。':
    'A confirmed two-year cash-flow supplementary table was not found. Only text was extracted; enter verified structured observations manually.',
  主体一致性: 'Company consistency',
  '材料主体与核查公司不一致，停止合并计算。':
    'The material company does not match this review. Combined calculations are stopped.',
  '所有选定材料属于同一核查主体。': 'All selected materials belong to the review company.',
  '本次压力测试主动移除了该指标；不从剩余原文补回。':
    'This stress test explicitly excludes this observation. It is not restored from remaining text.',
  '本次提供的材料没有此项指标，不填零。':
    'This observation was not supplied. Missing values are not replaced with zero.',
  '母公司与合并口径不能混用，请补交合并口径材料。':
    'Parent-company and consolidated scopes cannot be mixed. Supply consolidated evidence.',
  '币种不是人民币；本次不进行汇率转换或混币种计算。':
    'The currency is not CNY. This review does not convert exchange rates or combine currencies.',
  '同一指标存在不同数值，保留双方来源并停止采用，不静默覆盖。':
    'This metric has conflicting values. Both sources are retained and neither is silently adopted.',
  '主体不一致，不能跨公司计算。':
    'Company identities differ. Cross-company calculations are stopped.',
  '合并范围未确认；归母净利润不能自动认定为合并净利润。':
    'Consolidation scope is unconfirmed. Profit attributable to owners is not automatically consolidated net profit.',
  '主体、期间、人民币单位及合并口径已确认；同项证据一致。':
    'The supplied company, period, CNY unit, and consolidated scope agree; matching observations are consistent. This does not authenticate the source document.',
  比例适用性: 'Ratio applicability',
  '净利润为零或负值，不产生通常现金转化比例；请直接查看现金与利润金额。':
    'Net profit is zero or negative. A conventional cash conversion ratio is withheld; compare the amounts directly.',
  同比基数: 'Prior-year base',
  '上年基数为零或负值，不输出常规同比百分比；直接比较两年金额。':
    'The prior-year base is zero or negative. Conventional growth percentages are withheld; compare the amounts.',
  其余调整逐行核对: 'Other-adjustment row check',
  '原始其余调整行求和与分组金额一致；分组不是原表“其他”单行。':
    'The original adjustment rows sum to the grouped amount. This group is not a single “Other” row in the source.',
  '原始调整行之和与分组金额不一致，停止现金桥解释。':
    'The original rows do not sum to the grouped amount. Cash-bridge explanation is stopped.',
  '未提供其余分组的原始调整行，差额不能当作已有来源的解释。':
    'Original rows for the other-adjustment group were not supplied. A residual gap cannot be treated as a sourced explanation.',
  现金桥闭合: 'Cash bridge reconciliation',
  '净利润与全部调整之和精确等于经营现金净额，按人民币分核对。':
    'Net profit plus all adjustments equals operating cash exactly, checked in CNY cents.',
  '利润与调整之和不等于经营现金净额，停止解释并请求复核。':
    'Profit plus adjustments does not equal operating cash. Explanation is stopped pending review.',
  '提供材料不足，无法重建现金桥；不会从样本库或隐藏材料补数。':
    'Insufficient supplied evidence to reconstruct the bridge. No observations are filled from hidden cases.',
  '请提供同主体、同期间、同币种的合并现金流量补充资料。':
    'Please supply consolidated cash-flow supplementary notes for the same company, period, and currency.',
  '当前口径或材料完整性不满足可重算核查。':
    'Current scope or evidence completeness does not support a reproducible review.',
  '完整合并补充表、表头单位与年度列；其余分组的全部原始调整行。':
    'Full consolidated supplementary table, unit header, year columns, and all original rows in the other-adjustment group.',
  先修复证据冲突: 'Resolve the evidence conflict first',
  '证据不足，暂停归因': 'Insufficient evidence: attribution withheld',
  '无法在冲突口径上给出可靠结论；原始来源已保留供双方核对。':
    'A reliable conclusion cannot be drawn from conflicting scopes. Original sources are retained for inspection.',
  '当前材料可以展示已确认的事实，但不能证明现金差额由哪些经营因素造成。':
    'Supported observations remain visible, but current evidence cannot establish which operating factors caused the cash gap.',
  利润尚未等额体现为经营现金: 'Profit has not fully translated into operating cash',
  本期现金与利润的金额关系: 'The period’s cash-to-profit relationship',
  '利润非正，通常现金转化比例不适用。':
    'Profit is non-positive, so the conventional cash conversion ratio is inapplicable.',
  应收项目形成现金占用: 'Receivables absorb operating cash',
  '负向调整同时符合业务扩张或结算结构变化，以及回款压力两种可能。公开年报不足以裁定因果，需核查期后回款。':
    'The negative adjustment is consistent with either business expansion and changed settlement terms, or collection pressure. The annual report cannot distinguish the cause; subsequent collections need verification.',
  应收项目释放经营现金: 'Receivables release operating cash',
  '正向调整表示本期经营性应收项目的合计现金影响，不代表所有客户均已回款，也不是企业安全结论。':
    'The positive adjustment reflects the aggregate cash effect of operating receivables. It does not prove all customers have paid or establish company safety.',
  存货形成现金占用: 'Inventory absorbs operating cash',
  '本期存货调整为负。保留扩张备货与去化压力两种解释，材料尚未证明其中一种。':
    'The inventory adjustment is negative. Expansion stock-building and inventory pressure remain competing explanations; neither is proven by current evidence.',
  管理层解释待独立验证: 'Management’s explanation needs independent verification',
  '经营性应收占款对应哪些客户与结算方式？':
    'Which customers and settlement methods account for the receivables cash use?',
  '应收现金桥调整不等于单一应收账款余额变动，也不能直接证明坏账。':
    'The receivables bridge adjustment is not simply a change in accounts receivable and does not prove bad debt.',
  '客户账龄、票据结算明细、期后回款和逾期款项核对表。':
    'Customer aging, bill-settlement details, subsequent collections, and overdue-account reconciliation.',
  '备货增加能由哪些订单和去化记录支持？':
    'Which orders and inventory movements support the additional stock?',
  '存货负向调整可能来自扩张备货，也可能涉及去化压力；不能直接推断滞销。':
    'Negative inventory adjustments may reflect expansion or inventory pressure. They do not independently prove slow-moving stock.',
  '订单覆盖、库龄、期后出库与减值测试依据。':
    'Order coverage, inventory aging, subsequent dispatches, and impairment-test evidence.',
  '仅为历史年度合并财务线索核查，不作投资、授信或合作决策。':
    'Historical consolidated financial evidence only. This review does not make investment, credit, or partnership decisions.',
  '公开年报不能单独证明回款风险、坏账或存货滞销。':
    'Public annual reports alone cannot prove collection risk, bad debts, or slow inventory.',
  '公司、期间、单位、币种与合并范围必须一致；空白或缺失不填零。':
    'Company, period, unit, currency, and consolidation scope must align. Missing values are not filled with zero.',
  '本次压力测试人为限制提供的材料，不能推断发行人未披露。':
    'This stress test deliberately restricts the supplied evidence. It does not imply the issuer failed to disclose it.',
  '原表其余已披露调整逐行分组求和，另与差额核对':
    'Sum the remaining disclosed source adjustments; reconcile against the gap separately.',
  '原表金额 × 单位换算系数；人民币元': 'Source amount × unit multiplier; CNY yuan.',
  '经营现金净额 ÷ 合并净利润 × 100%；利润必须为正':
    'Operating cash flow ÷ consolidated net profit × 100%; profit must be positive.',
  '（本年 − 上年）÷ 上年 × 100%；上年基数必须为正':
    '(Current year − prior year) ÷ prior year × 100%; prior-year base must be positive.',
  '读取本次保存的输入快照。': 'Reading the saved input snapshot.',
  '核验公司、年度、人民币单位、合并范围与数值冲突。':
    'Checking company, year, CNY units, consolidation scope, and value conflicts.',
  '口径检查与缺失/冲突记录已完成。': 'Scope checks and missing/conflicting observations recorded.',
  '按人民币分计算金额，并核验现金桥原始分组行。':
    'Calculating in CNY cents and checking original bridge rows.',
  '现金桥已按原始调整行闭合。': 'The bridge reconciles against the original adjustment rows.',
  '未满足现金桥条件，已停止没有依据的归因。':
    'Bridge requirements are not met. Unsupported attribution has stopped.',
  '实际调用可选模型，校验引用后保留解释。':
    'Calling the configured optional model and validating its citations.',
  '未配置模型，采用确定性规则解释与询证问题。':
    'No model configured. Deterministic rules supply explanations and evidence requests.',
  '模型未完成；规则报告完整保留。': 'Model call incomplete; the deterministic report is retained.',
  '模型解释及引用验证已完成。': 'Model explanation and citation validation completed.',
  '规则解释完成；未执行模型调用。': 'Rules-based explanation completed. No model call was made.',
  '保存报告、问题状态与全部输入快照。':
    'Saving the report, follow-up status, and full input snapshot.',
  '核查报告已持久保存，可重开与导出。': 'Review persisted. It can be reopened and exported.',
};

export function translateRule(text: string): string {
  if (rules[text]) return rules[text];
  const parentTable = text.match(/^第 (\d+) 页为母公司表/);
  if (parentTable)
    return `Page ${parentTable[1]} is a parent-company table. Observations are retained to expose conflicts and must not be combined with consolidated data.`;
  const unknownScope = text.match(/^第 (\d+) 页合并范围未确认/);
  if (unknownScope)
    return `Consolidation scope on page ${unknownScope[1]} is unconfirmed. Human verification is required.`;
  const unknownUnit = text.match(/^第 (\d+) 页未确认单位/);
  if (unknownUnit)
    return `The unit on page ${unknownUnit[1]} is unconfirmed; the table's values were not adopted.`;
  const unknownYear = text.match(/^第 (\d+) 页无法确定年度与两列顺序/);
  if (unknownYear)
    return `Year and column order on page ${unknownYear[1]} were ambiguous; the table's values were not adopted.`;
  const extraColumn = text.match(/^第 (\d+) 页一行出现超过两列金额/);
  if (extraColumn)
    return `A row on page ${extraColumn[1]} contains more than two amount columns and was not adopted.`;
  const amount = text.match(/^本期经营现金为净利润的 ([\d.-]+)%；/);
  if (amount)
    return `Operating cash is ${amount[1]}% of net profit for this period. This is a historical cash relationship, not a credit grade or default probability.`;
  const read = text.match(/^已读取 (\d+) 份材料/);
  if (read) return `${read[1]} saved materials read. No hidden cases accessed.`;
  for (const names of Object.values(metricNames))
    if (text.includes(names[0])) return text.replace(names[0], names[1]);
  return text;
}
