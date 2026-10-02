import { metricNames } from './format';

const rules: Record<string, string> = {
  '输入存在混用或矛盾，系统保留来源并拒绝无声覆盖。请按问题单修复后再核查。':
    'The inputs are mixed or contradictory. Sources are retained without silently overwriting values. Resolve the evidence requests before reviewing again.',
  '原始文件已暂存于当前账号；请在24小时内确认保存，未确认文件会过期清理。确认后随材料保留，个人额度250MB。':
    'The original upload is temporarily retained in your account. Confirm within 24 hours before it expires; confirmed files remain with the material. Your account quota is 250 MB.',
  '采用材料的主体字段一致。': 'Company fields are consistent across the adopted materials.',
  '保留已采用金额；现有材料不能解释现金差额的经营原因。':
    'Adopted amounts remain visible; the current evidence does not explain the operating causes of the cash gap.',
  '保留已采用金额；缺失或口径不一致的项目不参与计算。':
    'Adopted amounts remain visible; missing or inconsistent items are excluded from calculations.',
  现金利润比: 'Cash-to-profit ratio',

  经营性应收调整为零: 'Operating receivables adjustment is zero',
  '本期经营性应收现金桥调整合计为零。':
    'The operating receivables bridge adjustment totals zero for this period.',

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
  '正在生成智能解释与询证问题。': 'Generating AI interpretation and evidence requests.',
  '实际调用模型，检查引用 ID 与格式；含义需人工复核。':
    'Calling the model and checking citation IDs and format. Meaning still needs human review.',
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
  '本年金额 − 上年金额；同主体、相邻年度、人民币合并口径；按分计算':
    'Current year amount − previous year amount; same company, consecutive annual periods and CNY consolidated scope; calculated in cents.',
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
  原始财务行逐项加总: 'Reconcile original financial rows',
  公开选择页二次核对: 'Recheck selected public pages',
  '输入口径、数值或现金桥核对存在冲突。保留可单独采用的金额与原始来源，暂停依赖冲突证据的解释；差额不直接证明经营风险。':
    'Input scope, amounts or bridge reconciliation conflict. Independently admissible amounts and original sources remain visible. Explanations dependent on conflicting evidence stop; the difference alone does not establish operating risk.',
  本次公开查询已取消: 'This public retrieval was cancelled.',
  公开查询已中止: 'Public retrieval was stopped.',
  确认上市主体: 'Confirm the listed company',
  检索完整年报: 'Retrieve the full annual report',
  检索近期公告: 'Retrieve recent disclosures',
  下载年报原件: 'Download the original annual report',
  读取年报页与文本: 'Read report pages and text',
  读取附注线索: 'Read operating note excerpts',
  执行附注补查: 'Read additional note pages',
  读取公告全文: 'Read disclosure text',
  选择下一步公开补查: 'Select additional public evidence to read',
  分析公开附注的竞争解释: 'Examine competing explanations in public evidence',
  业务扩张或结算变化: 'Business growth or settlement changes',
  回款压力: 'Collection pressure',
  扩张备货: 'Stocking for expansion',
  存货去化压力: 'Inventory clearance pressure',
  付款安排变化: 'Changes in payment timing',
  '索取分客户账龄、信用期变化与期后回款记录':
    'Request ageing by customer, changes in credit terms and subsequent collection records.',
  '核对逾期账龄、期后回款与坏账准备依据':
    'Check overdue ageing, subsequent collections and the basis for loss allowances.',
  '核对订单、库龄与后续销售': 'Check orders, inventory ageing and subsequent sales.',
  '核对库龄、减值依据与后续销售':
    'Check inventory ageing, impairment evidence and subsequent sales.',
  '核对应付到期日、账期与付款记录': 'Check payable due dates, credit terms and payment records.',
  '按来源合并结果；缺件、冲突与覆盖限制保留。':
    'Results combined by source; missing evidence, conflicts and coverage limits retained.',
  '引用仅校验原文定位；年报主体不证明合同相对方、当前资金或履约能力。':
    'Citations check text location only. The annual-report entity does not establish the contractual counterparty, current funds or fulfilment capability.',
  '财务原表存在核验失败；附注解释不能覆盖或解除金额冲突。':
    'Financial source checks failed. Note explanations do not override or resolve conflicting amounts.',
  '附注模型解释未完成，原文线索保留。':
    'Model interpretation of notes was incomplete; original source excerpts remain.',
  '公告定性解释未完成，原件读取记录保留。':
    'Qualitative disclosure interpretation was incomplete; original reading records remain.',
  重新确认官方主体: 'Reconfirm the official company identity',
  检索指定年度完整年报: 'Retrieve the requested annual report',
  检索近90天公告线索: 'Retrieve disclosures from the last 90 days',
  下载官方年报原件并计算哈希: 'Download the official report and compute its hash',
  读取真实PDF页与文本: 'Read PDF pages and text',
  提取候选并运行确定性核验: 'Extract candidates and run deterministic checks',
  有限重试公开证据页规划: 'Retry public-evidence page selection',
  模型选择公开证据核查页: 'Select public-evidence pages with the optional model',
  重新验证模型选中的原件页: 'Recheck model-selected original pages',
  模型解释公开核查证据: 'Model interpretation of public evidence',
  公开证据模型: 'Public-evidence model',
  '解释同年度合并可采用字段及短摘录。':
    'Interpret admissible same-year consolidated fields and short excerpts.',
  '解释已取得的公开候选页与字段。': 'Interpret retrieved public candidate pages and fields.',
  可选模型解释公开核查证据: 'Optional model explanation of public evidence',
  可选公开证据模型: 'Optional public-evidence model',
  '仅使用精确代码与机构ID绑定的公告。':
    'Use disclosures tied to the exact security code and organization ID.',
  '指定年度没有全本时停止，不换成其他年份。':
    'Stop if the requested annual report is unavailable; do not substitute another year.',
  '本步未逐份下载公告，普通公告不自动判为风险。':
    'Individual recent disclosures were not downloaded in this step. Ordinary disclosures are not automatically classified as risks.',
  '候选始终需要用户确认；缺失不填零，不用残差补其他调整。':
    'Candidates always require confirmation. Missing values stay unknown; residuals do not replace source adjustment rows.',
  '只改变确定性复核的候选页选择，模型不产生金额。':
    'The model only selects pages for deterministic rechecking; it does not generate amounts.',
  '如果局部页遗漏证据或引入冲突，保留原始全表候选而不覆盖。':
    'If selected pages omit evidence or create conflicts, retain the original full-table candidates.',
  '冲突时不调用解释模型，金额与核验失败原样保留。':
    'Conflicting input is not sent for model explanation. Amounts and failed checks remain visible.',
  '引用ID与输出格式已检查；解释含义仍需人工核对，不构成财务认证。':
    'Citation IDs and output format were checked. Interpretation still needs human review; this is not financial certification.',
  '模型默认关闭，只有本次显式授权才发送公开候选页与字段。':
    'The model is off by default. Public candidate pages and fields are sent only with explicit authorization for this run.',
  '模型服务未配置，真实规则工具链保留。':
    'No model service is configured. The rules-based retrieval workflow remains available.',
  '本次未启用，未向外部模型发送数据。':
    'Not enabled for this run. No data was sent to an external model.',
  '仅同年度合并可采用字段及短摘录；不含私人文件、备注或现金计划':
    'Only same-year consolidated admissible fields and short excerpts; no private files, notes or cash plan',
  '金融机构财务口径需要专门方法，当前工业企业现金桥工具未支持；未套用通用评级。':
    'Financial institutions require a separate accounting method. This industrial-company cash bridge does not support them or assign a generic rating.',
  '已取得公开原件，但没有足够可确认的财务观测。请补充或核对表格字段，不填零。':
    'The public original was retrieved, but there are insufficient confirmable financial observations. Supply or review the table fields; missing values are not filled with zero.',
  '公开证据查询未完成。可重新查询，或自行导入材料。':
    'Public-evidence retrieval did not complete. Start another retrieval or import the source yourself.',
  '所选代码与机构ID未在官方来源同时匹配，停止而非选择相近公司':
    'The security code and organization ID did not match in the official source. Retrieval stopped instead of selecting a similar company.',
  '官方披露来源暂不可达，已完成一次重试；未替换为其他主体或年份':
    'The official source remained unavailable after one retry. No other company or year was substituted.',
  本次Agent检索预算已结束: 'This retrieval reached its execution limit.',
  '公开页规划失败或选择无效，确定性候选完整保留。':
    'Public-page planning failed or returned an invalid selection. Deterministic candidates remain available.',
  '模型页选择器建议补充材料；未补造观测或改写规则结果。':
    'The model page selector requested more evidence. No observations were invented and rule results were not rewritten.',
  '同年度存在多个完整年报版本；已下载最新披露版本，其他版本链接仍保留，采用前请核对更正或修订。':
    'Multiple full reports exist for this year. The latest disclosed version was downloaded; other links remain available. Check corrections or revisions before adopting.',
  '近期公告检索未完成，不等于不存在近期变化。':
    'Recent-disclosure retrieval did not complete. This does not establish the absence of recent changes.',
  '自动提取是候选预览；来源可追溯不等于业务真实性已认证，采用前须核对主体、期间、单位与合并口径。':
    'Automatic extraction produces candidates. Traceable sources do not certify business authenticity; confirm company, period, units and consolidation scope before adoption.',
  '官方标题与原件封面年度尚未同时确认，未采用表格金额。':
    'The year has not been confirmed in both the official title and document cover; table amounts were not adopted.',
  '其余调整行不完整，没有以现金桥残差代替原始分组。':
    'Other adjustment rows are incomplete. A cash-bridge residual was not substituted for source components.',
  '表格行数超过预算，停止本表分组提取。':
    'This table exceeds the row limit; component extraction stopped.',
  '未找到同时确认年度、列顺序、单位与表格边界的金额；请补充合并财务表或手工核对字段。':
    'No amounts had confirmed year, column order, units and table boundaries. Supply consolidated statements or review the fields manually.',
  '部分观测的合并范围或币种待确认；规则不会把未知当作已核实。':
    'Some consolidation scopes or currencies remain unconfirmed. Rules do not treat unknown values as verified.',
  '母公司独立表已识别并排除，不与合并表混用。':
    'Separate parent-company statements were identified and excluded from consolidated inputs.',
  '本次实际下载原件的SHA-256、URL及页数与逐页审查的公开样本完全匹配；重用已核对的金额与原始分组行。':
    'The downloaded original matches the reviewed public sample by SHA-256, URL and page count. Its previously checked amounts and source components were reused.',
  '样本原件核对不等于企业经营或承诺安全，采用仍需确认。':
    'A matched source does not establish business or commitment safety. Adoption still requires confirmation.',
  '原件仅向当前账号开放；未采用原件24小时后过期，确认后随材料保留。':
    'The original is private to this account. Unadopted files expire after 24 hours; confirmed originals are retained with their materials.',
  '核查报告已持久保存，可重开与导出。': 'Review persisted. It can be reopened and exported.',
};

export function translateRule(text: string): string {
  if (rules[text]) return rules[text];
  const graphFinancial = text.match(/^(\d+)条原表候选，仍需确认口径。$/);
  if (graphFinancial)
    return `${graphFinancial[1]} source-table candidates; scope still requires confirmation.`;
  const graphNotes = text.match(/^(\d+)段原文；(\d+)个待核查假设。$/);
  if (graphNotes)
    return `${graphNotes[1]} source excerpts; ${graphNotes[2]} hypotheses to investigate.`;
  const graphNotices = text.match(/^(\d+)份全文已读；(\d+)项覆盖限制。$/);
  if (graphNotices)
    return `${graphNotices[1]} full texts read; ${graphNotices[2]} coverage limitations.`;
  const graphTitlesOnly = text.match(/^仅读取所选(\d+)份近期原件，未逐份覆盖全部标题。$/);
  if (graphTitlesOnly)
    return `Only ${graphTitlesOnly[1]} selected recent originals were read; not every title was covered.`;
  const graphUnfinished = text.match(/^(.*)：原件未读完，不等于没有相关变化。$/);
  if (graphUnfinished)
    return `${graphUnfinished[1]}: the original was not fully read. This does not establish the absence of changes.`;

  const bridgeDifference = text.match(
    /^利润与调整合计 ([\d.-]+) 元，经营现金 ([\d.-]+) 元；差额（经营现金−合计）([\d.-]+) 元。停止现金桥解释并请求复核，不以残差补数。$/
  );
  if (bridgeDifference)
    return `Net profit plus adjustments total CNY ${bridgeDifference[1]}; operating cash is CNY ${bridgeDifference[2]}. Difference (operating cash minus total): CNY ${bridgeDifference[3]}. Bridge attribution has stopped pending review; no residual is substituted.`;
  const originalDifference = text.match(
    /^(\d+)年度原始行求和与披露经营现金净额相差([\d.-]+)元（([\d.-]+)分）。原表以千元列示，差异可能与列示精度有关，但原因未经核查。保留原始金额，不以残差更改字段。$/
  );
  if (originalDifference)
    return `For ${originalDifference[1]}, the sum of original rows differs from disclosed operating cash by CNY ${originalDifference[2]} (${originalDifference[3]} cents). The source is presented in thousands of yuan; presentation precision may be relevant, but the cause has not been investigated. Original amounts remain unchanged; no residual alters the fields.`;
  const originalBalanced = text.match(/^(\d+)年度原始行求和与披露经营现金净额精确一致。$/);
  if (originalBalanced)
    return `For ${originalBalanced[1]}, the sum of original rows exactly equals disclosed operating cash.`;
  const reselected = text.match(
    /^二次(现金补充表|合并报表)页复核取得(\d+)项本年度候选；(已提取值与全表候选一致|出现与全表不一致的候选，需逐页人工核对)。原全表候选及原有冲突未覆盖。$/
  );
  if (reselected)
    return `A second review of selected ${reselected[1] === '现金补充表' ? 'cash supplement' : 'consolidated statement'} pages produced ${reselected[2]} current-year candidates. ${reselected[3] === '已提取值与全表候选一致' ? 'Extracted values match the full-table candidates.' : 'Some candidates differ from the full-table extraction and require page-by-page review.'} The original full-table candidates and conflicts were retained.`;
  const absentAnnual = text.match(
    /^没有匹配(\d+)年度的中文完整年报。请补充该年度合并财报；没有换用其他年度。$/
  );
  if (absentAnnual)
    return `No full Chinese annual report matched ${absentAnnual[1]}. Supply consolidated statements for that year; no other year was substituted.`;
  const identitySummary = text.match(/^官方A股主体：(.*)（(\d+)）。法定全名继续与原件核对。$/);
  if (identitySummary)
    return `Official A-share identity: ${identitySummary[1]} (${identitySummary[2]}). The legal name still needs confirmation against the original.`;
  const annualCount = text.match(/^取得(\d+)份指定年度中文全本候选(；分页预算仍有后续结果)?。$/);
  if (annualCount)
    return `${annualCount[1]} full Chinese annual-report candidates retrieved.${annualCount[2] ? ' Further pages exceed the current pagination budget.' : ''}`;
  const recentCount = text.match(
    /^取得(\d+)条近期公告标题与官方原件链接(；当前仅前30条，不声称全面覆盖)?。$/
  );
  if (recentCount)
    return `${recentCount[1]} recent disclosure titles and official source links retrieved.${recentCount[2] ? ' Only the first 30 are covered.' : ''}`;
  const downloaded = text.match(/^实际下载(\d+)字节PDF，SHA-256已计算；不接受任意来源。$/);
  if (downloaded)
    return `${downloaded[1]} PDF bytes downloaded and SHA-256 computed. Arbitrary sources are not accepted.`;
  const readPages = text.match(/^实际PDF共(\d+)页，已取得页码对应的文本。当前未执行OCR。$/);
  if (readPages) return `${readPages[1]} PDF pages read with page-aligned text. OCR was not run.`;
  const identityInput = text.match(/^(\d+) · orgId校验$/);
  if (identityInput) return `${identityInput[1]} · verify organization ID`;
  const annualInput = text.match(/^(\d+)年度 · 中文全本 · 排除摘要\/英文$/);
  if (annualInput)
    return `${annualInput[1]} · full Chinese report · exclude summaries and English editions`;
  const recentInput = text.match(/^(\d+) · 近90天官方公告$/);
  if (recentInput) return `${recentInput[1]} · official disclosures from the last 90 days`;
  const bytesInput = text.match(/^(\d+)字节 · 最多500页$/);
  if (bytesInput) return `${bytesInput[1]} bytes · maximum 500 pages`;
  const extractionInput = text.match(/^(\d+)年度 · 合并表边界\/列\/单位\/原始行$/);
  if (extractionInput)
    return `${extractionInput[1]} · consolidated table boundaries, columns, units and source rows`;
  const planningInput = text.match(/^(\d+)个已下载公开页ID白名单；模型不得写金额$/);
  if (planningInput)
    return `${planningInput[1]} downloaded public-page IDs on the allowlist; the model must not generate amounts`;
  const candidatePrecision = text.match(/^第(\d+)页金额精度或格式无法确认，未采用该行。$/);
  const blankAdjustment = text.match(
    /^(20\d{2})年其余调整行含空白单元格，未当作零或用现金桥残差补数；另一年度的已披露金额单独保留。$/
  );
  if (blankAdjustment)
    return `Other adjustment rows for ${blankAdjustment[1]} include blank cells. They remain unknown; no zero or cash-bridge residual was supplied. Disclosed amounts for the other year are retained separately.`;
  if (text === '近期公告读取达到45秒预算；未读完的原件不表示没有相关变化。')
    return 'Recent disclosure reading reached its 45-second budget. Unread originals do not imply that nothing changed.';
  if (text === '官方披露来源未在本次读取预算内完成；未替换为其他主体或年份')
    return 'The official source did not complete within this reading budget. No other company or year was substituted.';
  if (candidatePrecision)
    return `Amount precision or format on page ${candidatePrecision[1]} could not be confirmed; the row was not adopted.`;
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
