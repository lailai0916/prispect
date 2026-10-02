import { DOCUMENT_DATE, DOCUMENT_VERSION, type ProductDocument } from './document';

export const guideDocument: ProductDocument = {
  title: ['使用文档', 'Documentation'],
  description: [
    '从查询公司到保存核查：材料、证据、现金条件与账号的使用方法。',
    'From company lookup to saved reviews: materials, evidence, cash conditions and accounts.',
  ],
  version: DOCUMENT_VERSION,
  updatedAt: DOCUMENT_DATE,
  sections: [
    {
      id: 'start',
      title: ['选择起点', 'Choose a starting point'],
      paragraphs: [
        [
          '首页输入公司名称、证券代码或一句待核查的安排。自动识别在本地选择入口，也可能把你明确写出的名称或拟付金额带入草稿；描述不成为已验证证据。你也可以手动选择公司查询、交款前核查或接手公司。',
          'Enter a company name, security code or an arrangement to review on the home page. Local recognition chooses an entry point and may prefill a name or proposed amount you explicitly stated into a draft; it does not turn the description into verified evidence. You can also select company lookup, a prepayment review or a company handover manually.',
        ],
        [
          '登录后，个人工作区可以保存材料与历史。尚无记录时从输入开始即可；未提供的交易金额、现金或日期保持未知，不必为了进入页面填写零。',
          'After signing in, your workspace can retain materials and history. With no records, start with the input. Transaction amounts, cash or dates you have not supplied remain unknown; you do not need to enter zero to proceed.',
        ],
      ],
      table: {
        columns: [
          ['你现在要做什么', 'What you need'],
          ['入口', 'Where to start'],
        ],
        rows: [
          [
            ['了解一家公司的公开财务资料', 'Understand public company financials'],
            ['公司查询', 'Company lookup'],
          ],
          [
            [
              '核对合同责任、收款与预付款条件',
              'Review responsibility, receipt and prepayment conditions',
            ],
            ['核查事项：交款前', 'Reviews: before payment'],
          ],
          [
            ['接手前问清财务问题或安排收付款', 'Review handover questions or cash arrangements'],
            ['核查事项：接手公司', 'Reviews: company handover'],
          ],
          [
            ['已有年报或结构化财务数据', 'You already have reports or structured financial data'],
            [
              '材料 → 导入；财报工作记录 → 新建核查',
              'Materials → Import; Financial reviews → New review',
            ],
          ],
        ],
      },
      links: [
        { label: ['查询公司', 'Company lookup'], href: '/company' },
        { label: ['核查事项', 'Reviews'], href: '/decisions' },
        { label: ['材料', 'Materials'], href: '/materials' },
      ],
    },
    {
      id: 'company',
      title: ['查询公司与确认候选', 'Look up a company and confirm candidates'],
      bullets: [
        [
          '输入准确公司名称或证券代码。准确唯一匹配可直接开始；简称有歧义时选择披露主体。当前覆盖巨潮大陆 A 股披露，未匹配不等于公司不存在或没有风险。',
          'Enter an exact company name or security code. An exact unique match can start directly; ambiguous names require choosing a disclosure identity. Coverage is currently mainland A-share disclosures on CNINFO. No match does not establish that a company does not exist or has no risk.',
        ],
        [
          '默认选择上一年度，以实际检索到的完整年报为准；缺少该年度年报时会说明。明确指定年度时按该年度核查。检索选项中的 AI 解读用于公开资料，数据使用范围可在隐私页查看。',
          'The default selects the previous year, subject to finding its complete annual report; a missing report is stated. If you specify a year, that year is used. AI interpretation in the lookup options processes public material; its data scope is described in the privacy page.',
        ],
        [
          '执行中查看各任务轨道与实际活动；完成、失败、取消和可恢复状态分别显示。取消保留已取得内容；只有可恢复的运行提供恢复操作。返回已有运行不会要求重新创建它。',
          'During execution, inspect task tracks and actual activity. Completion, failure, cancellation and recoverability have distinct states. Cancellation retains obtained content; resume is offered only for recoverable runs. Returning to an existing run does not require creating it again.',
        ],
        [
          '结果先看财务观察，再打开来源核对金额、年度、单位和合并范围。核对候选后点击“采用并核查”；析光保存材料并建立规则报告，不沿用公司查询的 AI 选择。',
          'Read financial observations first, then open their sources to check amounts, year, units and consolidated scope. After reviewing candidates, select “Adopt and review.” Prispect saves the material and creates a rule report without inheriting the lookup’s AI choice.',
        ],
        [
          '公告标题不代表已读全文；附注与公告覆盖范围会注明。材料不足或原表加总有差额时，候选可以保留，但相关解释会停止并列出需要复核的项目。',
          'An announcement title does not mean its full text was read. Notes and announcement coverage are stated. Incomplete evidence or a source-table total difference may leave candidates available, but dependent explanations stop and identify what needs checking.',
        ],
      ],
      links: [{ label: ['打开公司查询', 'Open company lookup'], href: '/company' }],
    },
    {
      id: 'import',
      title: ['导入与保存材料', 'Import and save materials'],
      paragraphs: [
        [
          '材料导入支持单个 JSON、CSV 或文本型 PDF，单文件最多 25 MB。点击文件选择区或拖入文件；材料页与新建财报核查页的空白区域也可接收文件。文件夹、多个文件、空文件、不支持的类型或超限文件会在读取前提示。扫描 PDF 没有可提取文本时，需要转为文本材料或人工提供结构化数据。',
          'Material import accepts one JSON, CSV or text-based PDF, up to 25 MB per file. Click the file area or drop a file; empty areas on Materials and New financial review also accept files. Folders, multiple files, empty files, unsupported formats and oversized files are rejected before reading. Scanned PDFs without extractable text need text material or manually supplied structured data.',
        ],
        [
          '读取成功后只是预览。检查公司、材料日期、每条观测的年度、金额、单位、期间、合并或母公司范围，以及摘录和页码，再点击确认保存。仅含摘录的文本材料也可保存；建立财报计算仍需要有效财务观测。',
          'A successful read creates a preview only. Check the company, document date, each observation’s year, amount, unit, reporting period, consolidated or parent scope, excerpt and page number, then confirm saving. Text material containing excerpts only can also be saved; financial calculations still need valid financial observations.',
        ],
        [
          '“仅保留已确认合并年度观测”会按你明确的选择剔除母公司、未确认范围和非年度观测。使用前先核对原文，不能因为数字相同就把母公司或归母利润改成合并净利润。',
          '“Keep only confirmed consolidated annual observations” explicitly removes parent-company, unconfirmed-scope and non-annual observations. Verify the source before using it. Matching amounts do not justify relabeling parent-company or shareholder-attributable profit as consolidated net profit.',
        ],
        [
          '关闭导入窗口后，在当前页面重新打开可以继续编辑预览；换文件须先明确放弃旧预览。离开页面或刷新不会承诺保留未保存编辑稿。读取可取消并重试同一文件；保存期间请等待完成，避免中断确认。',
          'Closing and reopening the import window on the same page resumes the preview. Replacing a file requires explicitly discarding the old preview. Unsaved edits are not guaranteed across navigation or reload. Reading can be cancelled and retried with the same file; wait for saving to finish before closing the confirmation.',
        ],
        [
          '未确认上传 24 小时后过期，并在后续访问或上传时清理。已确认原文件随材料保留；账号原文件容量上限为 250 MB。编辑后的指标和原文件分别保留，人工确认不会改变原文件，也不等于认证原文。',
          'Unconfirmed uploads expire after 24 hours and are cleaned on later access or uploads. Confirmed originals remain with their materials; the account original-file quota is 250 MB. Edited metrics and original files are retained separately. Manual confirmation does not alter or authenticate the original.',
        ],
      ],
      links: [{ label: ['打开材料', 'Open materials'], href: '/materials' }],
    },
    {
      id: 'report',
      title: ['阅读财报核查', 'Read a financial review'],
      paragraphs: [
        [
          '报告采用同主体、完整年度、人民币与合并口径的数据。先看净利润、经营现金净额及现金利润比，再看有来源的现金桥与年度对比。现金利润比 = 经营现金净额 ÷ 合并净利润；比例来源应分别核对分子与分母。它不表示销售回款率、可用现金或本金安全。',
          'Reports use data for the same entity, full financial year, CNY currency and consolidated scope. Read net profit, operating cash flow and their ratio before the sourced cash bridge and annual comparison. Cash-to-profit ratio = operating cash flow ÷ consolidated net profit. Check both numerator and denominator sources. It does not represent sales collections, available cash or principal safety.',
        ],
        [
          '现金桥的柱形、精确金额和来源面板互相联动。点击或用键盘选择一项，可以读取对应材料、页码与短摘录；有保留原文件时可打开原件。金额换算以所声明单位为依据，精确计算不代表来源本来就精确到分。',
          'Cash-bridge bars, exact amounts and the source panel are linked. Click or select an item with the keyboard to read its material, page and excerpt; retained originals can be opened. Amount conversions follow the declared source unit. Exact arithmetic does not mean the source itself was precise to cents.',
        ],
        [
          '口径检查通过只说明已采用字段符合该项规则。缺失、冲突或原始行加总与现金净额不同，会停止相应计算；系统不以残差补数字。可能原因仍是待验证解释，问题单给出下一步需查的客户、结算、库存或其他材料。',
          'A passed scope check only means adopted fields meet that rule. Missing fields, conflicts or a difference between original-row totals and reported cash stop the relevant calculation. The system does not plug a residual. Possible causes remain hypotheses; questions identify the customer, settlement, inventory or other evidence needed next.',
        ],
      ],
      links: [{ label: ['查看核查方法', 'Read the review method'], href: '/method' }],
    },
    {
      id: 'external',
      title: ['交款前：核对责任与敞口', 'Before payment: responsibility and exposure'],
      bullets: [
        [
          '先填公司或商家名称和拟付金额；不知道金额时可留空。名称暂按你的输入保存，尚未确认合同责任主体。补充条件中分别核对合同、收款与退款主体，以及授权和责任关系。',
          'Start with the company or seller and proposed amount; an unknown amount can stay blank. The name is saved as supplied and does not confirm the contractual entity. In additional conditions, check contract, payee and refund entities separately, including authority and responsibility.',
        ],
        [
          '区分银行存款、投资或借款、合同款项、工作或服务信任。银行存款还需核对机构与产品性质，制造企业年报不能替代这一核查。',
          'Distinguish bank deposits, investments or loans, contract payments, and work or service trust. Bank deposits need separate checks of the institution and product; a manufacturer’s annual report cannot replace them.',
        ],
        [
          '已付、已交付和已退款金额需要相应记录；对方承诺退款不抵实际退款，未来日期的退款不抵截至核查日的敞口。主体不一致需要核对授权或合同责任，不能直接据此推断欺诈。',
          'Paid, delivered and refunded amounts need corresponding records. A refund promise is not a completed refund; a future refund does not reduce exposure as of the review date. Entity differences need authority or responsibility checks and do not establish fraud.',
        ],
        [
          '比较最多两个本次付款方案。分期首付结果是本次付款后的敞口，不是整笔交易全程的最大损失。未设置可接受敞口上限时不会判断是否在你的限额内。',
          'Compare up to two payment options. An initial installment’s result is exposure after this payment, not the maximum loss across the entire transaction. Without an exposure limit, the system does not decide whether the amount is within your limit.',
        ],
        [
          '下一行动会列出具体需问的材料。复制询问只复制文本，不向公司、银行或他人发送消息。',
          'The next action lists specific evidence to request. Copying an inquiry only copies text; it does not send a message to a company, bank or other person.',
        ],
      ],
    },
    {
      id: 'handover',
      title: [
        '接手公司：财务问题与当前现金',
        'Company handover: financial questions and current cash',
      ],
      paragraphs: [
        [
          '接手核查不要求先有采购付款。可以关联已有财报核查，阅读历史财务发现、出处与询证问题，再向前任核对现金、账龄、存货、订单及交接责任。改动事项公司后，留意关联财报主体是否仍适用。',
          'A handover review does not require a purchase payment. Link an existing financial review, read historical findings, sources and questions, then ask the previous operator about cash, aging, inventory, orders and responsibilities. After changing the review’s company, check whether the linked report entity still applies.',
        ],
        [
          '若要测算当前收付款，再补起点日期、当前可用现金、底线和收付款明细。年末余额是过去某一天的存量，年度经营现金是整个期间的流量；两者都不能自动填作今天的可用现金。受限资金和到期义务也应单独核对。',
          'To calculate current cash arrangements, add a starting date, available cash, floor and dated cash events. A year-end balance is a stock at a past date; annual operating cash is a flow over a period. Neither automatically becomes today’s available cash. Check restricted funds and obligations separately.',
        ],
        [
          '金额和日期未知时保持空白。方案可调整一笔付款日期，但须另核对对方是否同意，以及供货与回款是否受影响；日期移动本身不证明问题已解决。',
          'Leave unknown amounts and dates blank. A scenario can move a payment date, but agreement, supply and collection impacts need separate checks. Moving a date does not establish that the problem is resolved.',
        ],
      ],
    },
    {
      id: 'cash-plans',
      title: ['现金计划导入与沙盘', 'Cash-plan import and sandbox'],
      paragraphs: [
        [
          '接手事项可导入 CSV 或 JSON 现金计划，单文件最多 1 MB、100 个事件。CSV 可下载空白格式；收付方向支持 in/out 或收款/付款，日期支持日历日期或 D1–D90。JSON 的 direction 使用 in/out，day 使用 1–90 的整数或 null，金额使用以元计的十进制字符串或 null，不接受 date 字段。未知金额或日期留空或填 null，明确零填写 0（JSON 填 "0"），不接受负金额或含糊单位。',
          'Handover reviews can import CSV or JSON cash plans, up to 1 MB and 100 events. Download the blank CSV; it supports in/out or 收款/付款 directions and calendar dates or D1–D90. In JSON, direction uses in/out, day is an integer 1–90 or null, and amounts are decimal strings in yuan or null; date is not a supported field. Leave unknowns blank or null. Explicitly enter 0 for zero ("0" in JSON). Negative amounts and ambiguous units are rejected.',
        ],
        [
          '计划文件在浏览器内解析。检查预览并采用后仍需保存事项；导入不会自动创建来源证据或把计划发送模型。文件中的起点现金是你的计划条件，不会因为来自表格就变成经核实余额。',
          'Plan files are parsed in the browser. Check the preview, adopt it and save the review separately. Importing does not create source evidence or send the plan to a model. Opening cash from a spreadsheet remains your planning condition, not a verified balance.',
        ],
        [
          '按日期的现金路径查看最低余额、首次日末低于底线的日期，以及分期期末余额。同日收付可能对顺序敏感：日末合并后没有缺口，也可能在先付款条件下发生日内缺口。付款上限和最低回款比例是相应假设下的数学阈值，不是回款预测或付款许可。',
          'The dated cash path shows the minimum balance, first end-of-day shortfall and period-end balances. Same-day receipts and payments can be order-sensitive: a day-end balance may be sufficient while paying first causes an intraday gap. Payment limits and minimum collection percentages are mathematical thresholds under stated assumptions, not forecasts or payment permission.',
        ],
        [
          '财报报告中的 90 天工作表使用 0–30、31–60、61–90 天三个区间。保存计划后可在现金压力沙盘改变回款比例、时点或额外付款。沙盘采用已保存的人工计划；缺字段时停止相关测算，不能从年报补成当前资金。',
          'The financial-report 90-day worksheet uses three intervals: days 0–30, 31–60 and 61–90. After saving a plan, the cash stress sandbox can vary collection percentages, timing or additional payments. It uses the saved manual plan; missing fields stop dependent calculations rather than drawing current funds from an annual report.',
        ],
      ],
    },
    {
      id: 'evidence',
      title: ['证据类型、撤回与范围更正', 'Evidence types, withdrawal and scope correction'],
      table: {
        columns: [
          ['显示的类型或状态', 'Type or state'],
          ['怎样理解', 'Meaning'],
        ],
        rows: [
          [
            ['已定位材料文本', 'Located material text'],
            [
              '字段可在服务器保存文本中按规则定位，未独立验证材料真实性。',
              'Fields can be located by rules in saved server text; material authenticity has not been independently verified.',
            ],
          ],
          [
            ['用户转录', 'User transcription'],
            [
              '按你提供的文字与字段测算，不等于已查阅原件或实际可用现金。',
              'Calculations use your text and fields; this does not establish that an original was read or cash is actually available.',
            ],
          ],
          [
            ['对方承诺', 'Counterparty statement'],
            [
              '记录承诺内容，不替代已交付、已退款或余额记录。',
              'Records a promise; it does not replace completed delivery, refund or balance records.',
            ],
          ],
          [
            ['假设', 'Assumption'],
            [
              '用于方案试算，结果只在所填条件下成立。',
              'Used for scenarios; results apply only under the entered conditions.',
            ],
          ],
          [
            ['历史财务信号', 'Historical financial signal'],
            [
              '提示追问具体事件，不自动支持今天的余额、合同责任或回款事实。',
              'Motivates questions about specific events; it does not establish today’s balance, contractual responsibility or collections.',
            ],
          ],
        ],
      },
      paragraphs: [
        [
          '经营解释分别显示历史财务信号和区分材料。区分材料需匹配本次主体、基准日期及保存原文；“材料可供核对”只表示可以检查，不证明哪种解释正确。新增、撤回或恢复会改变材料状态及下一项核查，不会自动填入现金。',
          'Operating explanations separate the historical financial signal from distinguishing material. Material must match the entity, baseline date and saved source text. “Material available for review” means it can be inspected, not that either explanation is correct. Adding, withdrawing or restoring it changes the review state and next inquiry without supplying cash values.',
        ],
        [
          '记录证据时填写适用主体、日期、字段和原文，并按需要关联已保存材料。金额、收付方向与日期必须在相关文本中能定位；把旧年报的元数据改成今天不能让它成为当天现金证据。',
          'For evidence, enter the applicable entity, date, fields and source text, linking saved material where appropriate. Amounts, flow direction and dates must be locatable in the relevant text. Changing old-report metadata to today does not create evidence of today’s cash.',
        ],
        [
          '撤回或恢复证据会产生新版本并重算直接依赖。假设分支与所关联记录分支分开显示。查看已知冲突及下一材料；不要把有出处、字段匹配、计算完成和可执行理解成同一个“通过”。',
          'Withdrawing or restoring evidence creates a new version and recalculates direct dependencies. Assumption and linked-record scenarios are separate. Read known conflicts and the next evidence needed; having a source, matching fields, finishing arithmetic and being executable are distinct.',
        ],
        [
          '适用范围填错时，可在证据窗口更正主体或日期并说明原因。该操作不修改原文、金额或来源，且新范围须能在已定位文本中匹配。更正保留历史，不认证原文，也不以一个完成勾选解除冲突。',
          'If scope metadata is wrong, correct the entity or date in the evidence window with a reason. This does not change source text, amounts or provenance; the new scope must match located text. Corrections preserve history, do not authenticate documents and do not resolve conflicts by a completion checkbox.',
        ],
      ],
    },
    {
      id: 'versions-and-comparison',
      title: ['保存版本与比较结果', 'Save versions and compare results'],
      bullets: [
        [
          '私人事项保存完整输入和证据变化。历史版本为只读；恢复历史输入另存新版本，并保留当前已知冲突。恢复前重新核对日期与当前条件。',
          'Private reviews retain full inputs and evidence changes. Historical versions are read-only; restoring older inputs creates a new version while retaining current known conflicts. Recheck dates and current conditions before restoring.',
        ],
        [
          '财报核查的“调整证据”选择本次采用哪些指标，另建任务并重算。原任务和原件保留；恢复全部证据也建立新任务，不继承此前 AI 授权。',
          '“Adjust evidence” chooses metrics for a financial review and creates a new recalculated task. The original task and source remain. Restoring all evidence also creates a new task without inheriting earlier AI authorization.',
        ],
        [
          '比较页选择基准与对照，查看数字、解释和来源哪些改变。比较用于核对证据变化，不用不同公司的结果做跨行业健康排名。',
          'Select a baseline and comparison to see changes in numbers, explanations and sources. Comparison examines evidence changes; it is not a cross-industry company-health ranking.',
        ],
        [
          '保存失败或版本冲突时先读取最新状态再继续。加载错误不会把旧工作区当作最新结果展示；重试恢复后再核对未提交的改动。',
          'After a save error or revision conflict, read the latest state before continuing. Loading errors do not present an older workspace as current. After retrying successfully, recheck unsaved changes.',
        ],
      ],
      links: [{ label: ['比较财报核查', 'Compare financial reviews'], href: '/compare' }],
    },
    {
      id: 'exports',
      title: ['原件与导出底稿', 'Originals and exported working papers'],
      paragraphs: [
        [
          '材料页和来源窗口区分公开原件、保留的原始上传文件与确认后的字段。PDF 可按页查看；CSV 与 JSON 原文件可下载核对。仅手工结构化输入而没有上传文件时，不会提供虚构原件下载。',
          'Materials and source windows distinguish public originals, retained uploads and confirmed fields. PDFs can be viewed by page; original CSV and JSON files can be downloaded. Manual structured inputs without an uploaded file do not receive a fabricated original download.',
        ],
        [
          '在报告操作菜单选择预览：HTML 为完整报告，JSON 为保存的数据，Markdown 为按本次用途排序的询证清单。确认内容后点击“保存文件”；私人事项也可预览并保存正在查看的版本。若报告被另一页面更新，请重新读取后再导出。下载文件可能包含个人备注和原文摘录，请自行妥善保管。',
          'Choose a preview from the report actions: HTML contains the full report, JSON contains saved data, and Markdown contains ordered evidence requests for this review purpose. Check the content, then select Save file. Private reviews can also preview and save the version being viewed. If another page updates the report, refresh it before exporting. Downloads may contain personal notes and source excerpts; store them appropriately.',
        ],
      ],
    },
    {
      id: 'account',
      title: ['账号与安全', 'Accounts and security'],
      bullets: [
        [
          '在账号页维护姓名、头像、简介等资料。头像选择或拖入后按页面预览确认；个人资料不作为核查公司的证据。',
          'Manage your name, avatar, biography and other profile information in Account. Select or drop an avatar and confirm its preview. Profile information is not evidence for a company review.',
        ],
        [
          '可使用验证器两步验证、一次性恢复码和通行密钥。妥善保管恢复码；它用于两步验证，不能代替密码重置。通行密钥是否可用还取决于你的设备与浏览器。',
          'Authenticator-based two-step verification, one-time recovery codes and passkeys are available. Keep recovery codes secure; they are for two-step verification, not password resets. Passkey availability also depends on your device and browser.',
        ],
        [
          '设备会话页可查看登录会话并退出相应设备。修改密码等安全操作会要求近期身份复核；请按页面说明完成。',
          'Device sessions list sign-ins and let you sign out individual devices. Security actions such as a password change require recent identity confirmation; follow the page instructions.',
        ],
        [
          '手机号可在个人信息中填写、修改或清空，用于资料展示，无需验证码。当前邮箱验证、换绑及邮件找回暂不可用，不会发送验证邮件。邮箱作为登录名称，不代表已验证邮箱所有权；请保存独立密码与恢复方式。',
          'Add, change or clear a display phone number in Profile without a verification code. Email verification, email changes and recovery by email are currently unavailable; verification emails cannot be sent. An email used as a sign-in name does not establish verified ownership. Keep your independent password and recovery methods.',
        ],
        [
          '重置工作区是清除当前账号核查资料的操作，不是退出登录或账号注销。请先导出需要保留的底稿，并仔细阅读确认范围。',
          'Workspace reset clears review data for the current account; it is not sign-out or account deletion. Export needed working papers first and read the confirmation scope carefully.',
        ],
      ],
      links: [{ label: ['管理账号', 'Manage account'], href: '/account' }],
    },
    {
      id: 'ai-and-appearance',
      title: ['AI、语言与外观', 'AI, language and appearance'],
      paragraphs: [
        [
          '公开公司查询与私人财报解读的 AI 选择分别生效。公开查询发送所选公司的公开资料；财报解读按当次选择发送采用的指标、短摘录与规则分析。私人事项、现金计划和备注不进入公开查询模型。详细字段与第三方处理见数据与隐私。',
          'AI choices for public lookup and private financial interpretation apply separately. Public lookup sends selected-company public material; financial interpretation sends adopted metrics, short excerpts and rule analysis when enabled for that task. Private reviews, cash plans and notes do not enter public-query models. See Data and privacy for exact fields and third-party processing.',
        ],
        [
          '顶栏显示当前语言，可切换中文或 English。原件摘录、你填写的内容及模型原始答复可能保留原语言。外观可选择自动、浅色或深色；自动模式跟随系统设置。',
          'The header shows the current language and switches between Chinese and English. Source excerpts, your content and original model responses may retain their original language. Appearance offers System, Light and Dark; System follows your device preference.',
        ],
      ],
      links: [{ label: ['数据与隐私', 'Data and privacy'], href: '/privacy?section=ai' }],
    },
    {
      id: 'troubleshooting',
      title: ['常见问题与下一步', 'Troubleshooting and next steps'],
      table: {
        columns: [
          ['遇到的情况', 'Situation'],
          ['下一步', 'Next step'],
        ],
        rows: [
          [
            ['找不到公司', 'No company match'],
            [
              '检查名称或代码及 A 股覆盖范围；有年报时导入财务材料。交易责任与当前现金另补相应记录。',
              'Check the name, code and A-share coverage. Import an available report; add separate records for transaction responsibility or current cash.',
            ],
          ],
          [
            ['PDF 读不到表格', 'PDF tables cannot be read'],
            [
              '确认是文本型 PDF；核对原件后用 CSV／JSON 或手工字段补充。不要把扫描页的空结果解释为零。',
              'Check that the PDF contains text. After inspecting the original, provide CSV/JSON or manual fields. An empty scan result is not zero.',
            ],
          ],
          [
            ['金额或范围冲突', 'Amount or scope conflict'],
            [
              '回到列出的材料和页码；核对年度、单位、合并范围及逐项加总，不用残差补平。',
              'Return to listed materials and pages. Check year, units, consolidated scope and row totals; do not plug a residual.',
            ],
          ],
          [
            ['现金路径显示未知', 'Cash path is unknown'],
            [
              '核对起点现金及相关事件的金额、日期。仍未知就保留空白，先补材料，不默认零。',
              'Check opening cash and relevant event amounts and dates. Leave unknowns blank and obtain evidence; do not default to zero.',
            ],
          ],
          [
            ['读取或保存失败', 'Read or save failed'],
            [
              '读取可重试或重选同一文件；保存后列表刷新失败时使用刷新操作，不重复确认上传。',
              'Retry reading or select the same file again. If the list refresh fails after saving, refresh the list rather than confirming the upload again.',
            ],
          ],
        ],
      },
      paragraphs: [
        [
          '反馈问题时可以提供页面、操作步骤和已遮盖私人信息的截图。不要发送密码、会话令牌、恢复码或完整银行账户。',
          'When reporting an issue, include the page, steps and a screenshot with private information obscured. Do not send passwords, session tokens, recovery codes or complete bank-account details.',
        ],
      ],
    },
  ],
};
