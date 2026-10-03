import type { ProductDocument } from './document';
import { documentMetadata, documentTitles } from './document-navigation';
import { productTerms } from '../../shared/product-terms';

export const guideDocument: ProductDocument = {
  ...documentMetadata['/docs/guide'],
  sections: [
    {
      id: 'start',
      title: ['选择起点', 'Choose a starting point'],
      paragraphs: [
        [
          '首页输入公司名称、证券代码或一句待核查的安排。自动识别在本地选择入口，也可能把你明确写出的名称或拟付金额带入草稿；描述不成为已验证证据。你也可以手动选择“公司研究”“付款前核对”或“接手核查”。',
          'Enter a company name, security code or an arrangement to review on the home page. Local recognition chooses an entry point and may prefill a name or proposed amount you explicitly stated into a draft; it does not turn the description into verified evidence. You can also select Company research, Before payment or Company handover manually.',
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
            productTerms.companyResearch,
          ],
          [
            [
              '核对合同责任、收款与预付款条件',
              'Review responsibility, receipt and prepayment conditions',
            ],
            ['付款与交接 → 付款前核对', 'Payments and handovers → Before payment'],
          ],
          [
            ['接手前问清财务问题或安排收付款', 'Review handover questions or cash arrangements'],
            ['付款与交接 → 接手核查', 'Payments and handovers → Company handover'],
          ],
          [
            ['已有年报或结构化财务数据', 'You already have reports or structured financial data'],
            [
              '材料 → 导入；财报核查 → 新建财报核查',
              'Materials → Import; Financial reviews → New financial review',
            ],
          ],
        ],
      },
      links: [
        { label: productTerms.companyResearch, href: '/query' },
        { label: productTerms.researchLibrary, href: '/research' },
        { label: productTerms.paymentsAndHandovers, href: '/decisions' },
        { label: productTerms.materials, href: '/materials' },
      ],
    },
    {
      id: 'company',
      title: ['公司研究与确认候选', 'Company research and candidate confirmation'],
      bullets: [
        [
          '从首页或“新建研究”输入公司名称或证券代码，确认匹配的披露主体后进入研究报告。公开资料取得后自动研究，首屏先给一句核心判断、评级与解释，再展示关键金额、资料覆盖和四个实际研究阶段。点击“依据与计算”核对原文，点击“检验解释”或“挑战解释”进入已有证据实验；展开入口不会自动启动补查。入口保留当前账号的输入草稿，年报原件继续在后台核查。',
          'Enter a company name or security code from the home page or New research and confirm the matched issuer. Research starts when public data is available. The first screen leads with a concise judgment, grade and explanation, followed by key amounts, source coverage and four recorded research stages. Evidence and calculations opens the sources; Test an explanation or Challenge an explanation opens the existing evidence lab without automatically starting retrieval. The entry retains your draft while original reports continue in the background.',
        ],
        [
          '主导航提供“研究库”“材料”和“付款与交接”。研究库保留本账号的研究记录、已保存摘要、财务评级与资料时点，可按公司、代码、年度和状态筛选；筛选不会重新研究。打开一家企业后，侧边栏才显示公司概览、历史财务走势、行业对比、公告线索、扩展核查、数据覆盖和来源比对七个专题。财报核查和核查比较继续在“核查工具”中。',
          'The main navigation opens Research library, Materials, and Payments and handovers. The library retains your research records, saved summaries, financial grades and source timestamps, with local company, code, year and state filters. Filtering does not restart research. A selected company opens seven sidebar topics: Company overview, Financial history, Industry comparison, Announcements, Further checks, Data coverage and Source comparison. Financial reviews and Compare reviews remain in Review tools.',
        ],
        [
          '继续展开“检验解释”“六维分析与计算依据”“新闻与公开讨论”和“完整财务数据与核查清单”，或打开“年报原件与核查过程”。无需选择阅读模式。财务专题保留归母与合并两种利润口径；外部付款与内部交接仍是独立核查目的。原件现金桥使用同年度合并净利润。行业均值剔除本企业，只比较同年度且至少五家有效同行。',
          'Expand Test an explanation, Dimensions and calculation evidence, News and public discussions, or Financial data and review checklist; originals remain in Originals and review process. No reading-mode choice is needed. Financial topics retain attributable and consolidated profit controls; external payment and internal handover remain separate review purposes. The original cash bridge uses same-year consolidated profit. Industry averages exclude the target and require at least five valid same-year peers.',
        ],
        [
          '侧边栏“已载入企业”记录右侧的 × 可删除本次研究记录和问答，已采用材料保留；研究、分析或解释补查进行中暂不可删除。新建公司研究与保存需要账号。',
          'The × beside a loaded-company record deletes that research record and its answers while keeping adopted materials. Active research, analysis or explanation research must finish first. New company research and saved work require an account.',
        ],
        [
          '右下角的析光助手只有一个对话框。直接问已经研究的公司即可：问题中明确提到的企业优先，其次沿用当前企业、上一轮企业或最近的研究；有歧义时会追问。你也可以问网站功能、隐私政策或使用方法，回答附文档链接。需要新的企业资料时，可在同一对话中要求补查，助手说明实际来源和缺口。企业回答随对应研究记录保存；未登录时可检索产品文档。模型失败保留规则回答或文档原文，未取得的字段保持未知。',
          'The lower-right Prispect assistant has one conversation. Ask directly about a researched company: an explicitly named company takes priority, then the current company, the previous conversation company or the latest research; ambiguity prompts a follow-up. You can also ask about features, privacy or how to use the site, with document links in the answer. Ask for fresh company material in the same conversation to see actual sources and gaps. Company answers stay with their research record; signed-out visitors can search product documents. Model failures retain rules-based answers or document excerpts, and missing fields stay unknown.',
        ],
        [
          '输入准确公司名称或证券代码。准确唯一匹配可直接开始；简称有歧义时选择披露主体。当前覆盖巨潮大陆 A 股披露，未匹配不等于公司不存在或没有风险。',
          'Enter an exact company name or security code. An exact unique match can start directly; ambiguous names require choosing a disclosure identity. Coverage is currently mainland A-share disclosures on CNINFO. No match does not establish that a company does not exist or has no risk.',
        ],
        [
          '默认选择上一年度，以实际检索到的完整年报为准；缺少该年度年报时会说明。明确指定年度时按该年度核查。AI 自动协助检索和分析；检索选项用于调整年度与核查用途。',
          'The default selects the previous year, subject to finding its complete annual report; a missing report is stated. If you specify a year, that year is used. AI automatically assists retrieval and analysis. Lookup options let you adjust the year and review purpose.',
        ],
        [
          '执行中查看各任务轨道与实际活动；完成、失败、取消和可恢复状态分别显示。取消保留已取得内容；只有可恢复的运行提供恢复操作。返回已有运行不会要求重新创建它。',
          'During execution, inspect task tracks and actual activity. Completion, failure, cancellation and recoverability have distinct states. Cancellation retains obtained content; resume is offered only for recoverable runs. Returning to an existing run does not require creating it again.',
        ],
        [
          '阅读分析摘要、重点发现与下一步，点击“依据”核对对应指标、公式和来源。“六维分析与计算依据”展开更完整的判断。公开研究不会自动采用年报候选；进入“年报原件与核查过程”，核对金额、年度、单位和合并范围后，才点击“采用并核查”。析光保存材料、建立规则报告，并进行 AI 解读；缺失或冲突时暂停依赖相应字段的解释。',
          'Read the summary, key findings and next checks, then select Evidence to inspect their metrics, formulas and sources. Dimensions and calculation evidence expands the full judgments. Public research never automatically adopts annual-report candidates. Open Originals and review process and check amounts, years, units and consolidated scope before selecting Adopt and review. Prispect saves the material, creates a rules-based report and requests AI interpretation. Missing or conflicting inputs pause dependent explanations.',
        ],
        [
          '历史财务图表并行读取东方财富公开网页的年度字段，无需配置东方财富账户或密钥。切换利润与经营现金、收入与利润、年末货币资金与两项负债，选择年份可查看精确金额、字段名和响应来源。网页字段与年报候选分开保存；金额相同仅表示对照一致，仍需核对原件范围。缺项不填零，货币资金不代表当前可用余额，短期借款与一年内到期非流动负债也不包含全部付款义务。',
          'Historical charts read annual fields from Eastmoney’s public website in parallel, without an Eastmoney account or API key. Switch between profit and operating cash, revenue and profit, or year-end monetary funds and two liability items; select a year to inspect exact amounts, field names and response sources. Web fields are stored separately from annual-report candidates. Equal amounts indicate a matching comparison only; verify scope against the original. Missing values stay unknown. Monetary funds are not today’s available cash, and short-term loans plus non-current liabilities due within one year do not include all payment obligations.',
        ],
        [
          '公告标题不代表已读全文；附注与公告覆盖范围会注明。材料不足或原表加总有差额时，候选可以保留，但相关解释会停止并列出需要复核的项目。',
          'An announcement title does not mean its full text was read. Notes and announcement coverage are stated. Incomplete evidence or a source-table total difference may leave candidates available, but dependent explanations stop and identify what needs checking.',
        ],
      ],
      links: [
        { label: productTerms.companyResearch, href: '/query' },
        { label: productTerms.researchLibrary, href: '/research' },
      ],
    },
    {
      id: 'company-analysis',
      title: ['阅读公司分析与继续研究', 'Read company analysis and research further'],
      paragraphs: [
        [
          '公司分析使用所选年度合并财务、最多六个年度的历史资料、同年度同行、公告、新闻和公开讨论。系统先分页收集资料，再由 AI 根据已有证据和研究目标选择主题补查、核对原文，并检查反向线索，形成总体判断、优势、风险、后续核查及判断变化条件。页面显示实际执行过程与资料覆盖；研究可能持续数分钟，未取得内容保持未知。',
          'Company analysis uses selected-year consolidated financials, up to six annual periods of history, same-year peers, disclosures, news and public discussions. It first collects paginated sources; AI then chooses focused follow-ups and source-text checks and considers contrary evidence before reporting judgments, strengths, risks, next checks and reassessment conditions. The page shows actual steps and coverage. Research may take several minutes; missing material stays unknown.',
        ],
      ],
      bullets: [
        [
          '点击“查看研究过程”，展开取得资料、定向补查、形成判断和反向复核四阶段。阶段状态、调用记录和时间来自实际执行；没有记录时会说明，缓存命中也不会伪装成新调用。研究未完成时，上一份分析与当前资料分别标明时点。',
          'Select View research process to inspect Gather sources, Targeted research, Form judgments and Review contrary evidence. Stage states, call records and times come from actual execution. Missing records are stated, and cache reuse is not presented as a new call. During unfinished research, the previous analysis and current sources retain separate timestamps.',
        ],
        [
          '新闻来自东方财富与新浪的有限目录，公开讨论来自所选公司的股吧，最多保留 180 条去重新闻与 240 条帖子。自动收集会尝试读取最多 8 条新闻和 8 篇帖子正文，之后可按研究需要继续核对。查看来源日期、媒体和“标题／摘要／正文节选”标记：目录条数不等于读过全文的数量，模型收到的节选也可能因文本上限而缩短。一个平台的帖子不代表整体舆论，转载不等于多份独立证据。',
          'News comes from bounded Eastmoney and Sina catalogs; discussions come from the selected issuer’s Guba board, retaining up to 180 deduplicated news records and 240 posts. Automatic collection attempts up to eight news bodies and eight post bodies, with focused follow-ups when needed. Check dates, media and title/digest/body-excerpt labels. Catalog counts do not mean all bodies were read, and model excerpts may be shortened by text limits. One board is not representative of public opinion; reposts are not independent evidence.',
        ],
        [
          '展开“新闻与公开讨论”后，先看六条来源；继续展开可按关键词、媒体和已取得的内容范围筛选，按日期排序，每页十二条。选择左侧来源，在右侧读取其标题、摘要或已取得节选；窄屏可打开阅读面板。筛选仅查看已保存目录，不重新调用模型或取得全文。',
          'News and public discussions starts with six sources. Expand further to filter by keywords, media and acquired content scope, sort by date and browse twelve items per page. Select a source on the left to read its title, digest or acquired excerpt on the right; narrow screens can open a reading panel. Filters inspect the saved catalog without new model calls or full-text retrieval.',
        ],
        [
          '公开帖子属于未核实观点，即使读到正文也不能证明公司违法、违约或没有风险。媒体报道、公司自述和官方披露需分别看待。综合判断应同时考虑支持与反向线索，优先打开关键来源核对主体、时间与原文。新闻和讨论数量不会自动改变财务评级。',
          'Public posts are unverified opinions; reading a body does not prove misconduct, default or absence of risk. Distinguish media reports, company statements and official disclosures. Consider supporting and contrary clues together, and open key sources to check the actor, date and wording. News and discussion counts do not automatically change the financial grade.',
        ],
        [
          '企业简报汇集主体资料，并尝试取得价格、涨跌、市值和来源报价时间。抓取时间与报价时间分别保留；休市时可能显示上一交易日，来源受限或字段缺失时显示不可用，不补零或伪称实时。行情不参与所选年度财务评分。',
          'The company brief collects issuer details and attempts to retrieve price, change, market cap and the source quote time. Retrieval and quote times remain separate; a market holiday may leave a previous trading day’s quote. Blocked or missing fields remain unavailable, without invented zeros or real-time claims. Quotes do not enter the selected-year financial score.',
        ],
        [
          '六个维度分别是盈利成长、经营现金质量、偿付杠杆、营运占用、同行位置、事件与治理。前四个核心财务维度各占综合分的 25%；同行与事件提供定性判断，不因一条新闻标题自动扣分。',
          'The six dimensions are profitability and growth, operating-cash quality, solvency and leverage, working-capital pressure, industry position, and events and governance. The first four each contribute 25% of the score. Peers and events add qualitative context; a news headline does not automatically deduct points.',
        ],
        [
          '基础评级为 A：至少 80 分；B：60–79.99；C：40–59.99；D：低于 40。一个核心维度低于 40 分，最终评级最高 C；两个及以上低于 40 分，最高 D。综合分保留原值，评级旁显示触发原因。四个核心维度缺少关键数据或存在冲突时为 NR（暂不评级），不补零或调整缺失权重。',
          'Base grades are A: at least 80; B: 60–79.99; C: 40–59.99; D: below 40. One core dimension below 40 caps the final grade at C; two or more cap it at D. The original score remains visible alongside the cap reason. Missing or conflicting key data in any core dimension produces NR (not rated), without filling zeros or redistributing missing weights.',
        ],
        [
          '完整财务评级为 NR，但已有可独立核对的财务维度时，首屏可以先给“暂定评级”，同时标明已覆盖几个维度。暂定评级只按这些有效维度的得分等权平均，采用相同等级阈值与弱项上限，不显示完整百分制总分。主体或年度不符、零个有效维度时不生成评级；未取得或冲突的维度不补零、不作为支持。补齐资料后再形成完整财务评级，原保存记录不会因显示暂定评级而改写。',
          'When the complete financial grade is NR but independently supported financial dimensions are available, the first screen can show a provisional grade with its dimension coverage. It averages only those valid dimension scores, using the same grade thresholds and weak-dimension caps, without presenting a complete score out of 100. A mismatched issuer or year, or no valid dimensions, produces no grade. Missing or conflicting dimensions are not zero-filled or treated as support. Complete data enables the full financial grade; displaying a provisional grade does not rewrite saved records.',
        ],
        [
          '“依据”和“指标与计算依据”展示精确金额、公式与对应来源；完整评级规则集中在“核查方法”的“财务评级标准”章节，可通过下方链接查看。评级属于析光公开财务筛选方法，不是评级机构的信用等级。历史金额不代表当前可用现金；标题线索、网页字段和已取得的原文节选分别标注。',
          'Evidence and Metrics and calculations show exact amounts, formulas and supporting sources. The full grading rules are in Financial grade criteria within Review methodology, linked below. The grade is Prispect’s public-financial screening method, not a credit-agency rating. Historical amounts are not current available cash. Headline leads, web fields and retrieved source excerpts are labeled separately.',
        ],
        [
          '需要补查时打开“进一步研究”，填写重点，例如“比较现金质量与同行，梳理近一年重大事项”，再点击“开始研究”。研究目标会发送给分析模型，请只填写公开公司问题。留空回到常规研究范围；不需要填写目标才能得到默认分析。',
          'For a focused follow-up, open Research further, enter a goal such as “compare cash quality with peers and review major events over the past year,” and select Start research. The goal is sent to the analysis model; include public-company questions only. Leaving it blank restores the standard scope. A goal is not required for the default analysis.',
        ],
        [
          '研究过程区分执行中、完成与未完成。模型未配置或失败时保留按规则计算的财务评级与指标，缺失项保持未知；反向审视未完成时，已通过检查的初稿会保留并提示该阶段未完成。重试未完成时保留上一份分析，并注明对应的资料快照与生成时间。没有查到新闻或公告，不代表没有风险；已有结果也不代表刚刚重新检索过。',
          'Research steps distinguish running, completed and failed states. An unconfigured or failed model retains rule-based financial grades and metrics with missing fields left unknown. If counterargument review fails, an already validated draft is retained with that limitation stated. An incomplete retry retains the prior analysis and its snapshot and generation times. No news or disclosure does not establish absence of risk; a saved result does not mean a fresh search occurred.',
        ],
      ],
      links: [
        { label: productTerms.companyResearch, href: '/query' },
        {
          label: ['财务评级标准', 'Financial grade criteria'],
          href: '/docs/methodology?section=financial-rating',
        },
      ],
    },
    {
      id: 'evidence-lab',
      title: ['企业证据实验室', 'Company evidence lab'],
      bullets: [
        [
          '选择一条事实，查看对应来源、页码或网页字段，再沿连线检查计算与待检验解释。点击“在试验中撤回”只在本地暂停依赖它的路径；点击“在试验中恢复”重新计算，不修改已保存报告或财务评级，也不发送模型请求。',
          'Select a fact to inspect its source, page or web field, then follow its calculation and explanation links. Withdraw in trial pauses only dependent paths. Restore in trial reevaluates them without changing saved reports or financial grades or sending a model request.',
        ],
        [
          '研究报告先呈现摘要、关键数值、重点发现和下一步；需要检验判断时再展开“检验解释”，查看实验室和挑战操作。已保存的核查报告也先给摘要与下一步，继续展开可看实验室、原件、计算和解释。研究并打开公司后，才能执行该公司的解释补查。',
          'The research report first presents its summary, key values, findings and next checks. Expand Test an explanation to open the lab and challenge actions. Saved review reports also start with the summary and next checks, with the lab, originals, calculations and explanations further down. Research and open a company to run its explanation research.',
        ],
        [
          '恢复已撤回事实后，选择扩张备货、存货去化压力或回款压力，再点击“挑战这个解释”，补查公开新闻、公告及有限原文，分别查看支持、反向线索与资料缺口。模型未配置或失败时保留实际补查和规则线索；“所需材料”仍表示尚未取得，不代表已经拿到订单、库龄或期后流水。',
          'Restore withdrawn facts, select expansion stocking, inventory sell-through pressure or collection pressure, then choose Challenge this explanation. Actual public news, disclosure and limited-original reads produce supporting/counter clues and gaps. An unconfigured or failed model retains actual research and rule clues. Required records remain unobtained; they do not mean orders, aging or subsequent statements were acquired.',
        ],
        [
          '三种现金差异解释仅在所选年度合并净利润为正、经营现金低于利润时待检验；缺失、冲突或不适用会说明。原件现金桥使用已核对的现金流补充表调整，公司网页实验室只比较期末余额变化。余额变化和新闻标题都不能确认差异成因。',
          'These cash-gap explanations apply only when selected-year consolidated profit is positive and operating cash is lower. Missing, conflicting or inapplicable inputs are stated. Original cash bridges use checked reconciliation adjustments; company web labs compare year-end balance changes. Neither balance changes nor headlines establish the cause.',
        ],
      ],
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
      links: [{ label: productTerms.materials, href: '/materials' }],
    },
    {
      id: 'report',
      title: ['阅读财报核查', 'Read a financial review'],
      paragraphs: [
        [
          '报告先展示核查摘要、核心金额和下一步材料，不需要选择阅读模式。继续向下可展开原件、计算、检查、解释、询证清单和范围记录；打开相关入口时会直接展开对应内容。核查比较可直接选择两份报告，查看材料、金额与计算差异。不同公司或不同年度的结果仅并列展示，不能把解释差异当成同一年度的证据撤回。',
          'Reports present the review summary, core amounts and next evidence first, without a reading-mode choice. Continue down the page to expand originals, calculations, checks, explanations, evidence requests and scope records; related links open the relevant content directly. In review comparison, select two reports to inspect their evidence, amounts and calculations. Results from different companies or years are shown side by side; explanation differences are not evidence withdrawals within the same year.',
        ],
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
      links: [{ label: documentTitles['/docs/methodology'], href: '/docs/methodology' }],
    },
    {
      id: 'external',
      title: ['付款前核对：责任与敞口', 'Before payment: responsibility and exposure'],
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
        '接手核查：财务问题与当前现金',
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
          '核查报告中的 90 天工作表使用 0–30、31–60、61–90 天三个区间。保存计划后可在现金压力沙盘改变回款比例、时点或额外付款。沙盘采用已保存的人工计划；缺字段时停止相关测算，不能从年报补成当前资金。',
          'The review-report 90-day worksheet uses three intervals: days 0–30, 31–60 and 61–90. After saving a plan, the cash stress sandbox can vary collection percentages, timing or additional payments. It uses the saved manual plan; missing fields stop dependent calculations rather than drawing current funds from an annual report.',
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
          '财报核查的“调整证据”选择本次采用哪些指标，另建任务并重算。原任务和原件保留；恢复全部证据也建立新任务。新任务自动尝试 AI 解读，只使用本次实际采用且满足核查条件的证据。',
          '“Adjust evidence” chooses metrics for a financial review and creates a new recalculated task. The original task and source remain. Restoring all evidence also creates a new task. New tasks automatically attempt AI interpretation using only evidence adopted for that task that meets the review requirements.',
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
      links: [{ label: productTerms.compareReviews, href: '/compare' }],
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
          '账号页的“清空我的工作区”会清除当前账号的核查资料，不是退出登录或账号注销。请先导出需要保留的底稿，并仔细阅读确认范围。',
          'Clear my workspace on the account page clears review data for the current account; it is not sign-out or account deletion. Export needed working papers first and read the confirmation scope carefully.',
        ],
      ],
      links: [{ label: productTerms.accountSettings, href: '/account' }],
    },
    {
      id: 'ai-and-appearance',
      title: ['AI、语言与外观', 'AI, language and appearance'],
      paragraphs: [
        [
          '公司研究、财报核查和企业问答自动使用 AI，不需要单独启用。模型未完成时保留已有核查结果，并显示实际状态。数据处理范围与第三方服务说明见隐私政策。',
          'Company research, financial reviews and company questions use AI automatically without a separate switch. If the model does not complete, existing review results are retained with its actual status. See the privacy policy for data-processing scope and third-party services.',
        ],
        [
          '顶栏显示当前语言，可切换中文或 English。原件摘录、你填写的内容及模型原始答复可能保留原语言。打开网页或系统主题变化时，外观自动跟随系统；随时点击顶栏图标即可切换深色与浅色。',
          'The header shows the current language and switches between Chinese and English. Source excerpts, your content and original model responses may retain their original language. Appearance follows your system when the page opens or the system theme changes. Click the header icon anytime to switch between light and dark.',
        ],
        [
          '点击顶栏搜索，或按 ⌘ K / Ctrl K，跳转到页面、已保存公司、核查报告和材料。键入时只筛选当前工作区，不发送模型请求；用方向键选择、Enter 打开、Esc 关闭。列表搜索可用 Esc 清除；页面动画遵循系统的减少动态效果设置。',
          'Use header search or ⌘ K / Ctrl K to jump to pages, saved companies, reports and materials. Typing filters this workspace without a model request. Use arrows to select, Enter to open and Esc to close. Esc clears list searches; page animations respect the system reduced-motion preference.',
        ],
      ],
      links: [
        {
          label: ['AI 数据处理说明', 'AI data-processing details'],
          href: '/docs/privacy?section=ai',
        },
      ],
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
