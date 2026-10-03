# Hermes 深入拆解与转化研究

研究对象：ReLoad／Hermes，仓库 `SecrificeYuan/Hermes-Company-Analyzer`。本报告只评价这个实际仓库，不把队名、历史评价或项目文档当成已经实现的能力。

## 固定版本与研究边界

| 项目         | 记录                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------ |
| Remote       | https://github.com/SecrificeYuan/Hermes-Company-Analyzer.git                               |
| 研究 SHA     | `8e834ade1a826ff484e063b1a36f10ec6415c8a6`                                                 |
| 抓取时间     | `2026-10-03T05:38:06Z`（UTC）                                                              |
| 本地源码     | `/workspace/competitors/hermes`                                                            |
| 原始备份     | `/workspace/competitor-backups/hermes.bundle`                                              |
| 文件版本证据 | `../evidence/hermes/version.json`，含 tracked-file SHA256                                  |
| 许可         | 本研究版本未发现 tracked LICENSE/COPYING；只提炼机制，未复制第三方产品代码、插图或角色素材 |
| 运行条件     | Node/npm；Next 15、React 19；Chromium 本地浏览器；端口 4402                                |
| 模型         | 未配置；`llm-status.json` 返回 `available:false`；未冒用外部凭证                           |
| 上游         | 本环境 Eastmoney／NEEQ 请求不可用；真实查询失败证据保留，不能据此断言数据模块未实现        |

第三方 Skill、提示词、README 和 PRD 都是研究对象，不作为析光执行规范。研究前读过析光 `AGENTS.md`；原工作区修改由主 Agent 保留，研究写入隔离工作区。竞品安装使用 `npm ci --ignore-scripts`；运行前检查 package scripts、服务端网络和持久化路径。

验证命令：`npm test -- --run`（33 files／208 tests 通过）、`npm run typecheck`（通过）、`NEXT_TELEMETRY_DISABLED=1 npm run build`（通过；仅未使用 import 和 hook dependency 等 lint warnings）、`npm start -- --hostname 127.0.0.1 --port 4402`。日志位于 `../evidence/hermes/`。研究过程中曾并发运行 dev 与 build，共用 `.next` 引起临时 module 错误；停止后顺序重建、生产运行成功。该记录是研究操作限制，不作为竞品缺陷。

验证分类始终区分：`source` 表示读到实现；`runtime` 表示该版本实际运行；`fixture` 表示明确的预置／虚构或注入数据；`document-only` 表示仅文档宣称；`blocked` 表示本轮环境／凭证限制。测试通过不等于真实上游、金融结论或所有浏览器状态已验证。

## 用户、价值与主流程

产品把宽泛企业查询收束为“这笔钱是否该付”：消费者预付款、合作采购、求职和投资等场景在 `lib/llm/narrative.ts` 与 `lib/chat/agent.ts` 进入模型任务。付款场景比泛公司资讯更容易让评委理解价值；但实际判断仍由通用分数与五条规则产生，没有合同金额、履约里程碑、担保和用户资料的结构化输入，因此不能把“这钱能付”当成完整支付决策。

首页 `app/page.tsx` 提供搜索、条件筛选、对话三个入口，最后都指向同一公司报告。搜索的近期历史和键盘建议让用户快速继续；筛选面板用预算／收益／期限等用户关切，系统明确保留不能核实的条件。对话入口以提问引导，但无模型时禁用并说明原因。`/chat` 无 thread 的实际页面空白，代码路径是 `checked`／`thread` 未成立就 return null；这是直接入口的空状态缺口，与首页正确禁用状态分别评价。

用户选择公司后 `ScanProgress` 使用五段 340ms 定时加结束等待，随后跳转报告；不是五个真实来源完成事件。报告从 server page 的 `getXray` 开始抓取。扫描视觉能解释等待，但不得吸收为真实进度。析光采用已记录来源／工具事件，并把缓存、实时、规则降级分开显示。

完整实际数据路径：

1. 搜索／建议 API → directory、Eastmoney、NEEQ、公开工商页面、Wikidata 等发现模块；精确企业需重新解析 ID／官方主体。
2. `lib/data/fetcher.ts` → mock 特判或真实 profile/financial/announcement/pledge/holders 五切片并行；部分缺失仍继续，全部无可核实资料停止。
3. `lib/analysis/analyze.ts` → 维度分、风险规则、时间线、关系图、付款口径；原始金额和 evidence 随报告保留。
4. `lib/get-xray.ts` → 可选 narrative/action 模型增强；模型失败保留规则模板；缓存按主体＋场景。
5. `XrayClient` → Lite 速览／Pro 七类详情；抽屉、锚点、动态新闻回补、AI 流、分享卡／双公司对比。
6. 对话额外经四个明确工具，SSE tool_start/tool_end/report_card 和本地／SQLite 线程恢复。

报告不存在上传原件采纳、材料撤回依赖、付款事件演算、私有工作底稿的等价流程。它们在本次同类任务对比中标为“未发现该流程”，不把泛公司查询与析光原件分析混作同类能力。

## 主体、数据、来源与证据

`company-discovery.ts` 对 18 位统一信用代码校验、同名不合并、上市日期／状态核对非常值得学习。新公开来源可用 base64url 编码 `hit_` ID，在后端解码并验证 host/path，不需要写本地候选库；`query_` 的完整公司名只生成待人工核验线索，不补造注册信息。目录确实有限，发现范围要披露，不当全市场数据库。上市状态不是见到证券代码就推断；公司与母子公司保持分别主体，支持待确认状态。

`public-web.ts` 在访问外部发现 URL 前限定 HTTPS／443、无 credentials、非 localhost，DNS 只允许公共 IPv4并固定该 IP，拒绝私网／保留地址，结合 robots、一段共享 9s deadline、2MB 上限和验证码／403／429停止。公开页面不绕过登录或反爬。这些是程序约束，而不是提示词。它们适合进入析光真实工具层，不能依赖浏览器链接样式提供同等保护。

`financial.ts` 把摘要及现金年表按 annual year 对齐，金额由元变万元并保留两位，最多三年；无 currentRatio 的年份仍保留，负值和债务率超过 100 不被“修正”成正常。缺点：A 股摘要 `PARENTNETPROFIT` 和合并经营现金可能不是相同范围；response hash、表级 field-source、原件页摘录、币种与 scope 合同不足。该数值仅能作为公开线索，不能自动升级为析光已采纳原件。

NEEQ 实现官方 filing 搜索、PDF host 限定、12MB／20s、MIME 与 PDF magic 检查、合并三表定位、单位元和年度表头核验，失败时不伪造财务年表。限制是仅 balance 表头明确年份，income／cash 未逐表约束；解析数量小于四位的无逗号金额可能漏掉；原文页及引用摘录没有进入结果。本轮实际官方 PDF 请求未验证，源码能力不能写成运行通过。

来源 receipt 存 ok/fallback/latency，DataSourceBadge 小巧显示状态。财务、来源、读取范围和可用性分离是正确方向，但主要风险证据对象只有标题／摘要／日期，虽 EvidenceDrawer 可渲染 URL，多数规则不传原始 URL。网络图／时间线也未留完整原件节点。用户看到证据不等于可以回到原文。

析光既有 `CompanyPublicInformation.tsx` 已用 clusterCounts 提示转载同组，`server/company-assessment.ts` 已去重 public text／URL／hash、约束载荷、明确不得以标题确认原因，不能写成此前无来源族机制。此次差距是：跨报告／覆盖／模型载荷统一可读的来源范围；同地点、已知同 cluster、相同正文的关系分别解释；每条资料可直达原出处；不把不同平台计成独立来源。来源 receipt 的 responseHashes 是接口响应，不可当具体文章正文 hash 来认定转载。

## 金融方法与需要修正的判断

| 模块              | 实际方法                                                                                                          | 专业边界与处理                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| HP                | OCF／Revenue 分 ×0.4＋current ratio 分 ×0.3＋100−debt ×0.3；负 OCF 再 −40；无资料 placeholder 50、available=false | 利润现金并列有价值；缺字段、银行口径、负营收、陈旧资料不能混成统一信用分。析光保留 exact annual／CNY／consolidated 计算，不吸收这个分数 |
| DEF               | 100−pledge×0.7−max(debt−70,0)×1.5                                                                                 | 股东质押与公司付款能力不能直接等价；issuer 总质押曾被解释为控制人，须校正主体。未知不当 0                                               |
| ATK               | lawsuits×5＋log10(1＋execution amount)×10                                                                         | 高值是风险，角色名“攻击力”易反读；法务真实适配器没接入 listed fetch，不能称完整司法核查                                                 |
| Morale            | 90 日新闻 tone 均值转 0–100；无近期退回最近三条                                                                   | 媒体语调不是信用；重复转载、旧稿和未来日期会影响。回补更改此维度但不重算 overall／hidden rules，前端状态不一致                          |
| overall           | available 维度重新归一权重，加债务处罚和最多 20 规则 penalty；35／65 分档                                         | 阈值未经校准，`deriveLight` 的 coverage 直接 full；强付款结论尤其不当                                                                   |
| health-assessment | freshness 550days；金融行业不适用；有限 required fields；净利≤0／OCF≤0／debt≥75 high等                            | 显式 not-applicable、未知字段、同年变动有价值；这个更稳健分支没有统一进入六位上市公司主报告                                             |
| Boss cashout      | 一次高管减持 >1000万元、365日                                                                                     | PRD称累计但源码逐事件；减持动机不构成“利益脱钩”事实                                                                                     |
| Pledge            | ≥30%，档位由展示文本 regex 抽数                                                                                   | 小数如72.5%可能被取成5%；70%即“随时强平”无股价／条款支持                                                                                |
| Lawsuits          | 180日 defendant≥5                                                                                                 | 明确被告与原告比仅数案件专业，但未含结案／争议额／关键诉讼原文                                                                          |
| Supplier／Payroll | supplier dispute≥3；180日 payroll titles≥2                                                                        | 标题识别与重复新闻不能证明拖欠或现金原因；供应纠纷未加时间窗口                                                                          |

风险 registry 要求 evidence 不空才触发，是可借鉴的最低约束；但标题本身不是已证实事实，出处内容、主体、期间和反证还需程序绑定。规则灯、档位、徽章和“先别付”的强度不能超过证据。

实际截图07确认严重同比错误：最新2025营收315、2024为560，正确变动 −43.75%；表格将 rows reverse 后仍以 i−1 取 previous，2025显示“—”，2024显示＋77.8%、2023＋46.4%。这是源码和 fixture 双证据，不是对真实公司数据的指控。对比截图20资产负债率差值显示 `46.599999999999994%`，还应写百分点。`TrendCompare` 用 array index 对齐年度；两家缺不同年会错位；SVG spark过滤 null 使断点消失，各自归一极值造成跨公司视觉误读。

关系图呈高管、股东、法院、供应商和媒体节点，缩写＋tooltip、图例、graph/sankey切换和组件销毁做得细；“减持／离职”统一75风险、持股>30%为55等边权不是金融风险证明。Sankey 将持股百分比、案件数和默认1混成宽度，不吸收其金融语义。应把图当实体关系和出处导航，边上保留关系类型／日期／来源，不用传播为风险概率。

## Agent、模型约束与实际能力

工具只有 suggest、confirm、runXray、health 四个；六轮可读、tool_start/end 成对、自然语言伪 `<tool_call>` 清理与 corrective message、失败反馈模型、部分字段 SSE 都可借鉴。代码读完整路径，与文档宽泛“工商司法舆情全核查”区分。

程序保证的约束：工具名称在 switch，六轮停止；结构化 JSON 与部分 verdict 数字 guard；原 risk verdict 不可被模型改写；LLM 30s、JSON parse 一次 retry；模型失败保留 rule report；报告流三段 summary／lamp／notes 逐段 validate，notes failure 可局部结束；client SSE cleanup。

仅提示保证或尚有缺口：confirm 先于 run 只在 system prompt，executeTool 无确认 ID registry；scenario 是 free string；每轮工具个数、总 token／总调用／总时间无硬预算；run_health_check 的描述超过真实接入范围；消息数组仅非空验证、未限制 role／大小，客户可伪造 system history。工具结束是事件结束，不代表成功；reportcard 未承载 typed citation IDs。没有主动反方检索工具、来源独立性验证或矛盾 registry，因此不能把“提示不要臆测”当实际反证循环。

数字 guard 只把百分数字面与工具 global 数字集合比较，没有 metric／issuer／period／currency／excerpt 的语义引用；非百分比金额不检查。AI 的 hp／def dimensionFacts 不总跟 available，因此 placeholder可能进模型。`runAgent` 先 chatOnce 再 chatStream 自然回答，第二请求可改变内容并增加成本；服务端不跟客户端断开 AbortSignal。分段报告缓存按 reportID＋asOf day，没有 input content hash，同日新材料可命中旧结论。22ms char动画使缓存文本也缓慢出现；cancelled flag未真正中止所有 read loop。模型未配置的实际入口为disabled，PRD无模型模板对话仍是文档愿景。

析光应保持 allowlisted public data、按已取得正文层级解释、typed metric/evidence refs、来源失败和未知；来源族是程序计算进入 public payload，不让模型自己声称独立来源。来源分布不是置信度，更不是金融评级。

## 页面、微交互和视觉

Lite 用人物、HP／盾牌／刀剑／情绪把抽象维度转成记忆点；Pro用表格、锚点、术语和来源展深度。有效的是“大值＋人话＋证据入口”、同一 narrative priority 同步首图和 detail order、就地抽屉、日期和来源 badge、小趋势、下一步。双读者模式不适合析光规范，已选择一个可展开报告承接两个深度。

实际检查发现：所有 NarrativeCard 的“证据”都用 global最高 severity事件，不按维度定位；用户点现金卡也可能被带去股东减持。EvidenceDrawer 可遮罩／X关闭，但 Escape 不关闭（supplement-log false），无 focus trap／dialog语义。AnchorNav scrollspy好用，preventDefault却不更新hash，刷新／分享阅读位置不保留。MetaStrip复制即使失败也set成功；ChatWindow提供clipboardfallback，差异需统一。

桌面Lite大灯结论直观但 full-height内部滚动易藏信息。390×844截图10风险卡与左右栏互相覆盖，人物上方也挤压；不是只读代码推测。Pro窄屏表格横向滚动且文字较可读，不能把Lite失败泛化成整个项目无响应式。析光避免固定首屏卡片高度，在窄屏保持文档流。

分享截图18实际成功下载 `hermes-xray-mock-danger.png`（1200×630、2倍输出）。固定离屏渲染与busy按钮减少抖动，是可学习交付机制；但虚构案例无显著标签，未带原文出处与范围，ATK 91按高值较好染绿，中文引号有方块字体。小卡必须明确快照／预置／范围、方向和来源，不能把输出精美当可信。

对比空状态明确两个选择器／start禁用，failure有重试。完整维度不足时不宣布winner、不填0差异是重要金融底线；实际fixture对比“更稳／KO”仍是未经同年度／币种／范围核对的game胜负。报告链接用stockCode含`.SH`而query parser只收六位，自动prefill失效；单侧失败整对失败、无Abort／requestidentity锁。析光可转化为同一用户付款条件演算对照，而非公司胜负排行。

## 异步、缓存、持久化和故障恢复

五数据切片 allSettled 与6s局部超时避免一源拖垮；底层请求10s且race timer未清除／fetch未Abort，时限不是真正总预算。rawcache5min缺全局容量上限；profile/searchPromise cache5min/60s有map限制，部分失败结构可被缓存。sentiment的inFlight per主体／页、3min成功cache、失败不缓存有工程价值。

舆情首一页立即展示，再17页、最多510／一年回补，200ms pause，显式backfilling／partial／limited及count；失败保留旧数据。但同一报告只更新morale/items，已保存总分规则与图优先级未同步，应给快照边界而非默默局部重写。

chat匿名UUID localStorage是格式校验，不是身份权限；不可借用到析光账号隔离。SQLite upsert `updated_at >=` 防较旧请求覆盖新线程，hydrate按更新时间合并并回推本地未同步，值得提炼。client消息允许card，但server isMessage拒绝card，含报告卡线程保存POST400静默；DB失效同样以看似成功降级，丢失localStorage不可恢复。此路径读源码，未使用真实模型全线程跑通。ChatWindow同步useRef busylock阻止同tick重复提交、pending AI消息ref防写前一气泡、两步3秒删除可吸收，但语义／权限和真实save状态需完整合同。

## 覆盖矩阵与截图验收

所有源码含版本SHA与截图匹配。图像已逐张打开检查；截图 body文本和 `browser-log.json`／`supplement-log.json`保留操作。引用编号为本目录证据文件前缀。

| 页面／状态／模块                                  | 本轮证据                                         | 分类与结论                                   | 尚未验证                         |
| ------------------------------------------------- | ------------------------------------------------ | -------------------------------------------- | -------------------------------- |
| 首页搜索、历史、三入口、无模型对话                | 01、16；page/SearchBox/ChatEntry/search-history  | runtime；无模型解释实际可见                  | 初次用户理解、真实成功建议       |
| 条件面板empty/reset/unknown/matched               | 02；FilterPanel/screening/screen API + tests     | runtime UI＋source条件；三态数据模型验证测试 | 真实候选批量成功与无上游局部成功 |
| 主体发现／上市／信用代码／manual lead             | company-discovery/public-web/wikidata/NEEQ tests | source；校验与缺失边界有测试                 | 在线工商具体主体／母子关系       |
| 选择→扫描→报告loading/error/notfound              | scan module；14、15                              | runtime failure；扫描timed source            | 完整真实成功；断网重试后成功     |
| Lite healthy/warning/danger                       | 03、04；mock API JSON                            | fixture；真实app renderer                    | 真实公司判定可靠性、模型措辞     |
| 证据抽屉/来源日期/关闭                            | 05；supplement Escape false                      | fixture renderer＋runtime interaction        | 全部keyboard／读屏；上游原文     |
| Pro头／财务／股东／法务／舆情／图／证据           | 06–09；detail modules                            | fixture；表与图真实render，财务YOYbug已复核  | 无fixture的所有上游维度          |
| Lite与Pro窄屏                                     | 10、11                                           | fixture renderer；Lite重叠、Pro可读区别记录  | 320宽／真实触屏／读屏            |
| 分享busy/download/card                            | 18＋download log                                 | fixture；导出成功、颜色与标签边界            | 系统字体／浏览器多端             |
| 对比empty／error／retry                           | 12、17                                           | runtime；真实上游失败可见                    | 重试后上游恢复                   |
| 对比Lite/Pro表/趋势                               | 19、20＋route injection脚本                      | fixture-injection；未冒充真实双公司          | 真同币种同期间比较               |
| /chat直达／LLM状态／Agent/SSE/history             | 13、16、llm-status；agent/tools/client/db tests  | runtime空路由＋source/stubbed tests          | 配置模型真实多轮、save恢复       |
| 并发cache／sentimentpagination／NoVerifiedData    | fetcher/sentiment/useSentiment/tests             | source＋tests；不假称所有上游已成功          | 实际510条分页、超时取消          |
| NEEQ PDF scope和三表解析                          | neeq.ts＋tests                                   | source＋fixture parsing                      | 实时官方PDF与新模板              |
| market ticker／quote／kline／fundflow／news flash | API和market modules、tencent tests               | source；visual辅助不进入主付款证据           | 实时每个市场端点                 |
| Rules/AI/fallback/cache／scope一致性              | analyze/get-xray/health-assessment/report-ai     | source＋mock/stub tests                      | 真实模型预算／引用准确率         |
| 文档愿景／非上市法务／投诉／加盟／执照            | PRD/README 对照工具与adapters                    | document-only部分＋source部分分开            | 配套官方源／真实案例             |

测试33文件208用例主要验证纯函数、可用性、三态匹配、主体解析、source fault、不适用、LLM JSON约束和假模型协议。YOY、手机重叠、float差和抽屉Escape说明覆盖仍有缺口。重要实现／状态已经研究，完整真实上游／模型仍blocked，不能以“未验证”写成“无实现”。

## 全量价值、析光映射与设计选择

`../values/hermes.json`登记46项，包含流程、默认、术语、每字段方向、键盘／状态、日期与引用、工具／预算、cache、save、降级和恢复等细节，不只记录首页。每项包含SHA和file:line、触发、用户／系统行为、价值、条件代价、析光用途、问题、转换方案与验收。唯编号保持稳定；实施状态随代码验收更新。

析光已经更强的底座：`shared/company-analysis.ts`、`company-assessment.ts`的annual/CNY/consolidated精确金额与缺口停止；`shared/company-workspace.ts`的fieldSources／原文／hash与公开快照；`server/company-assessment.ts`公开载荷白名单；`shared/company-challenge.ts`反向解释与尚未取得的区分材料；`shared/evidence-lab.ts`依赖撤回；`shared/decision-contracts.ts`版本化私有付款条件；账号权限与原件保留。竞品值得补的是浅阅读入口、实际执行过程表达、来源关系汇总、合适的小状态与错误区分，不能拿分数替代上述金融边界。

关键设计与实质区别方案：

- 来源质量方案A按平台数量显示独立性／分，能快速视觉判断但无证据支撑；拒绝。方案B把来源打开按钮再加一页，依旧割裂；不足。选C：同一只读SourceTrust view在报告与覆盖复用，区分读取层级、来源状态、实际时间和已知转载／同地点关系，标“独立性未知”，由程序公开白名单入模型。
- 报告方案A完全复刻Lite/Pro需要两套状态且模式改变数据解释；拒绝。选一个可展开报告，以来源绑定的重点＋未知＋下一步优先，详细公式／证据随后。
- 研究过程方案A扫描定时器视觉一致但失真；拒绝。选已有实际工具／来源记录四阶段，未知调用总数不补0，失败仍保留前次快照。
- 教学方案A游戏真假／胜负激励强但知识不准确；拒绝数值与企业裁定。结合财富探索与析光withdraw依赖，预测后展示实际影响并恢复，只评价依赖理解。
- 比较方案A公司健康排行缺同口径；暂不采用。可转成付款假设同输入对照，风险由用户可核对的条件和金额暴露计算，不把来源数算可信度。

真实用户的理解／时间提升尚无实验结果。程序测试、同输入交互步骤与截图可证明行为和边界，不能据此声称用户更愿意返回或竞争优势已获人群验证。

## 同类任务对照与演示路线

| 相同任务       | Hermes实测／源码                                          | 析光转化目标与验收                                      |
| -------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| 企业承诺核验   | 场景付款措辞，未发现结构化承诺／合同                      | 承诺按用户陈述保留，证据／冲突／撤回约束支持判断        |
| 主体与经营关系 | discovery明确公司／上市／manual，实时blocked              | 官方主体与orgId重新核对，门店经营公司需原资料不自动推断 |
| 财务差异解释   | fixture表有YOY误序，AI不可用                              | 同年度精确差额与指标→来源→未知；不以model改金额         |
| 原件依据查找   | drawer日期有，URL多数缺                                   | 每摘录页／原URL／读取范围可核验，failed/manual分开      |
| 新资料与版本   | cache按日可过期错误、sentiment局部改                      | 新快照明确和旧assessment区分，旧记录不重写              |
| 证据撤回       | 未发现等价依赖试验                                        | 本地mask依赖／恢复，独立事实仍可读，grade保持           |
| 付款条件       | 通用灯，不输入金额／日历／条款                            | 明示假设、exact金额／暴露／事件、请求材料               |
| 首次理解       | 游戏速览fixture +Pro；无真人测试                          | 一份可展开报告与来源范围实测，真人效果待验证            |
| 服务失败恢复   | 真实suggest解释正确；report generic error；compare有retry | 实际失败分类、旧快照可看、retry owner lock与取消        |

演示可先打开明确标注预置来源的真实析光案例：一句结论→净利／经营现金→差额与依据→来源层级和转载族→具体反方缺口→私有付款条件→撤回／恢复。若实时服务失败，展示真实错误和保存快照；不循环虚构扫描。评委亲自点击来源／公式／恢复，能追问“读了哪些页”“不同平台是否独立”“材料撤回为什么这项暂停”。Hermes分享／角色的记忆机制转化为证据探索和演练，保留析光几何品牌与克制文档设计。

## 待办、阻塞与完成边界

1. 本轮无模型凭证，不检验真实生成／伪工具流／模型引用正确率；工具源码和stub tests已读。后续需授权服务、总预算和攻击历史测试。
2. 上游实时查询失败，不评价真实财务／NEEQ／完整法务／行情效果；需可用服务及明确官方主体case。source实现不因此删除。
3. 无真实用户实验，速度／理解／学习／复访都标待验证假设。需要同任务对照、误读测量，不能只统计按钮减少。
4. 信用代码、非上市manual lead、PDF新格式、mini SVG等暂缓价值保留清单，并写前置条件及下一步；不拿优先级删除发现。
5. 来源统一视图只解释已经取得的公开快照；不启动检索、不认证来源独立、不改评级、不更改原件或既有历史assessment。实现和测试状态将在清单与独立验收记录中更新。

## 本轮转化实现与重要验收

完成独立实现 `shared/source-trust.ts`、`src/SourceTrust.tsx`、`src/source-trust.css`、`tests/source-trust.test.ts`；`server/company-assessment.ts`公开模型载荷新增程序计算的 `sourceFamilies`。主Agent将 `SourceTrust({run})` 接入中央报告与覆盖页，trust链接可定位 `company-source-trust`。实现没有复制Hermes源码／角色／样式，未改任何原始资料或历史assessment。

来源范围读模型仅允许公开字段，最多120条（24来源receipt／24公告／48新闻／24讨论）；超限数量与未通过主体核对的讨论明确列出。来源响应不是文章正文；PDF响应hash不是所选段落hash。关系分别是同一记录链接、采集同组、相同已读取正文hash与节选，已知关系组只说明具体关联。两平台不意味着独立；同URL不同正文版本提示差异；长cluster ID不截断成相同ID；未取得正文不能标为已读。尚未记录公告excerpt的实际readAt，因此保持null，快照日期单列，避免刷新后缓存摘录被冒充新读取。

来源族元数据ID是当前快照局部ID，显式声明不能作metricIds/evidenceIds；模型仍只引用正式目录。同cluster不同反方正文不再被 `packedPublicInformation` 误删：仅实际availableText相同的长文本可去重，相同4000字符包装前缀而实际后段不同仍保留各记录，重复文本维持各title/sourceId，并在payload中明确是否截断。不因关系或条数修改grade。

| 验收                                   | 实际结果与证据                                                                                   | 边界                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| 同URL／cluster／正文关系及revision     | 13项新测试通过；组内具体relation保留，正文不同不能说同文本                                       | 关系只覆盖已检查120条，未检查的不声称归类              |
| 主体、年度、范围、informationGap       | mismatch返回无rows／无日期；界面无来源统计                                                       | 不改现有原件；不自动补主体                             |
| 媒体/帖子reader、digest/title/PDF      | 合法实际reader决定body，wrong issuer discussion排除；PDF readAt未知                              | 观点不是已核实事实，节选不是全文                       |
| public payload隐私/immutability/budget | 私有account/runID/plan/额外source属性不进入sourceFamilies；变更本地结果不改run；120条有界        | 此处不改变其他已经存在的public payload字段合同         |
| 同cluster反方及截断前不同后段          | 两body均入模型文本，重复fixture只有实际相同digest才跳过；额外dedup文本不转发                     | 模型仍有140000字符总体和单条包装上限，明确truncation   |
| 正常／缺失／失败／前次report           | failed不当empty；current与previous snapshot区分；未取得不作安全结论                              | 无真人安全决策效果认证                                 |
| 桌面／窄屏／分页                       | 1440浅色、390深色、12条分页；collapsed和expanded均document width=390，无页级横溢；表内可横向滚动 | 运行输入明确为合成fixture，非实时公司                  |
| 打印／closed details／非第一页         | 已翻第3页并关闭details仍打印49已检查条目；另3条超限明确；print-only全表在details外               | 全量原记录保持各资料页，打印本次已检查范围不冒称52全读 |
| regression                             | 13新测试＋48相关assessment/model/public-source测试，共61通过；typecheck和变更文件Prettier通过    | 产品整体build和账号整页验收见主Agent总验收             |

证据为 `../evidence/hermes/source-trust-tests-output.txt`、`source-trust-browser.json`、`source-trust-print.pdf`、`source-trust-print-first-page.png`和5张SourceTrust截图。`source-trust-fixture.html`／capture script可重复运行；页面显著标为“合成来源范围验收；非真实公司，不验证用户效果”。研究日志同时保留原 `.log` 和可版本追踪的 `*-output.txt`，避免仓库忽略规则漏掉验收。

46项现在全部有最终去向：9项verified、18项implemented（包含明确保留的既有底座和并行新增；整体入口以总验收为准）、19项deferred。清单把已做部分、尚缺部分、前置和next_step分开，没有剩余research状态，也没有将未落地小细节伪写为完成。19项包括信用代码合法源、公开locator、全drawer键盘、跨公司同期间spark、全站复制失败、完整origin契约和逐字段持久SSE等；每项仍可持续推进。真人理解改善、完整实时上游与模型效果继续待验证。
