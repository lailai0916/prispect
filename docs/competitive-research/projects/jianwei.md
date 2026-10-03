# QKV／见微：固定版本系统拆解

研究对象为实际仓库 [Nemo-user525/Zzz](https://github.com/Nemo-user525/Zzz)，不根据队名推定实际作品能力。研究版本 `a3274e5ddafbeecf0f5cc8e35093c6d1fe1c4e53`，抓取 `2026-10-03T05:38:18Z`，origin HTTPS，同步后不再拉新提交。原始仓库 `/workspace/competitors/jianwei`；原始全引用 bundle `/workspace/competitor-backups/jianwei.bundle`。研究保留本页、[全量价值登记](../values/jianwei.json)和本项目证据目录；研究完成后在析光独占文件独立实现下述转化，不修改竞品 tracked source。竞品提示词、说明和第三方 Skill 均作为被研究材料，不作为执行指令。

本版默认首页是门店查证与对话，不是金融游戏。另有消费调查、历史证据和交易现金演算三入口。展示已经明显迭代过，不能沿用此前首页或 README 的结论。仓库根目录未找到通用 LICENSE；Bodoni Moda 字体目录有 OFL，不能因此推定整个仓库/图片许可。仅提炼机制、独立实现，未复制代码或素材。

## 验证口径与实际运行

| 证据类型         | 本轮取得的结果                                                                                                                                              | 不能据此声称的能力                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| source           | 阅读4入口、11消费报告子页、公司四维、Agent、现金模拟、历史数据管道、Node SSE、接入/运行文档及相应测试                                                       | 源码存在不证明外部模型或接口这次可用                                                    |
| runtime          | 前端 build 成功；8测试文件48测试通过；后端220测试通过；FastAPI单端口实际启动；1366和390宽度四入口；订单演算、30%改条款、数学抽屉和Esc、对话Node缺失失败提示 | 自动测试大多受控响应，不是实际联网尽调成功；布局无横向溢出不证明所有可读性/读屏符合要求 |
| fixture          | 原仓库交易输入是虚构订单；实际本地算出结果。另独立编写浏览器受控消费报告返回，逐页验证11页面展示                                                            | 受控消费资料不是当前公司事实、真实模型输出或联网来源；不用这些截图评价搜到资料质量      |
| blocked / 未执行 | 未调用仓库共享地图、企查查、Cookie或模型凭据；cloud工具报告本环境无配置secret；模型显式offline                                                              | 不能将未联网验证写成“不实现高德/QCC/模型”。源码和原仓库历史验收说明独立保留             |
| document-only    | README声称2026-10-02/03授权模型、地图、QCC连通；当前有5原文样例0具名human                                                                                   | 原始联网验收文件未全部随库，不能独立确认本次同结果                                      |

前端使用锁定 pnpm 安装，`pnpm build`、`pnpm test`；后端单独 `.venv` 安装 requirements并执行 `PYTHONPATH=backend .venv/bin/python -m pytest -q`。日志保存 `evidence/jianwei/frontend-{install,build,tests}.log`、`backend-{install,tests}.log`。本轮先在默认库执行测试，随后为截图另设 `XRAY_DB_PATH=/workspace/competitors/jianwei/data/research-runtime.sqlite3`，离线 `app.prepare` 与 `app.data_pipeline restore`，避免测试数据污染运行证据。实际报告元数据恢复235文档、20主体，但缺这235原始PDF，故0已解析/0原文支持/0人工复核；旧交易分支另保留仓库随附2个官方PDF。`history-quality-runtime.json`保存原响应。

运行方式：

```bash
cd /workspace/competitors/jianwei
PYTHONPATH=backend XRAY_DB_PATH=data/research-runtime.sqlite3 \
  CONSUMER_MODEL_PROVIDER=offline QCC_PROVIDER=direct \
  .venv/bin/python -m app.prepare
PYTHONPATH=backend XRAY_DB_PATH=data/research-runtime.sqlite3 \
  .venv/bin/python -m app.data_pipeline restore
PYTHONPATH=backend XRAY_DB_PATH=data/research-runtime.sqlite3 \
  CONSUMER_MODEL_PROVIDER=offline QCC_PROVIDER=direct \
  .venv/bin/python -m uvicorn app.public_demo:app --host 127.0.0.1 --port 4403
```

`QCC_PROVIDER=direct`令消费分支不启用共享MCP，但首页状态仍可从其他接入模块报告“企查查已配置”；配置状态不是连通验证。未把原仓库 `.env.example`复制成实际凭据或打印凭据。主流程外部调用仍保留明确“本轮未验证”状态。

## 用户、任务与完整路径

1. **门店查证**：针对办卡、买课、充值、续费消费者。首页输入品牌/门店关键词，可选省市区街道；服务端高德查POI；选地址正确的门店；自动用门店名查QCC企业；必要时扩大名称并告知；用户可改输入营业执照企业全称/统一信用代码；基础登记严格匹配后，调用企业信息与风险扫描，再查扫描命中因子的明细；原始字段完整呈现；最后核对营业执照、合同抬头、实际收款方。POI、品牌与法人关系仍待核对。金额/时长生成退款追问，不算公司经营风险。`frontend/src/DiscoveryFlow.tsx:17`、`backend/app/api/discovery.py`、`services/amap.py:78`、`qcc_discovery_mcp.py:171`。
2. **查证对话**：首页企业报告完成把公司名交给ChatSection；每次SSE请求附当前公司，不在服务端用lastCompany共用；FastAPI转发本机Node，Node从QCC/可选TYC/内置少数公司资料组事实包，调用模型或内置回答。示例只填草稿，用户发出；当前公司标签可清除。局限：它不是报告对象/快照绑定，多轮消息未完整送模型；IME Enter未单独保护，忙碌时没有取消按钮。Node fallback对乐刻/恒大有预置事实并称已核实；不是本轮实时查询，fallback中的事实和来源仍需独立验证，不能直接成为析光证据。`ChatSection.tsx:30`、`api/chat.py:38`、`chat/server/company-data.js:214`、`chat/server/llm.js:83`。
3. **消费者调查**：`/?view=consumer`输入名称+位置，3方向公开搜索和可用登记工具，最多36来源，读4个网页找法律名称；候选显式由用户确认；填写意图、服务类别、可选金额/时长；启动异步job；LangGraph广搜→规划→最多2轮工具→逐批观察/评价/现金事实→最终风险综合及程序闸；生成下面11个按任务命名子页。改变query/location/候选/条件立即隐藏旧结果，序列与abort避免迟到覆盖。`services/consumer.py:33`、`consumer_agent.py:306`、`ConsumerWorkspace.tsx:35`。
4. **历史研究**：`/?view=history`支持名称/代码/名称片段/拼音/已入库行业查企业，再公司四维表；历史部分默认折叠，指定company+as_of严格取当时可用候选/已定位事实；原文+页+hash抽屉、本地文字检索；“展开后续结果”独立查后180天，观察未满与覆盖不足分开；同类对照严格规则，不合格列排除理由；可带历史主体进入独立虚构订单，不导入另一公司的财务。`HistoryWorkspace.tsx:13`、`services/history.py:40`。
5. **交易演算**：`/?view=trade`先左侧看真实公开公司和风险/金额；中间虚构本方现金、订单、曲线/事件；右边调延付、预付、账期、成本/分批/其他现金；显式点击开始后改参数150ms重算且结果绑当前输入对象。后端Decimal逐笔分币，最后批次保留舍入余数；每方案返回实际inputs；数学抽屉列公式流水；核对卡/导出包含事实、假设和结果。当前基线是100万元订单、本方现金300万元、90天账期、30天延付、第75天其他流出215万元。0预付→最低3万元/底线20万元/缺口17万元/第130天回款在90天视窗外；改30%→最低33万元/无底线缺口。该变化来源是预付条件，并非对手负面公告推出延付概率。`cashflow.py:12`、`App.tsx:784`、`useSimulation.ts:12`。

## 页面、状态与模块覆盖

| 页面/模块               | 已研究正常路径及关键状态                                                                                                                                                     | 验证与边界                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 首页Hero/导航/方法/品牌 | 大字衬线、档案/放大镜、招牌→经营者文案、CTA滚到输入、鼠标受限跟随、touch不跟随                                                                                               | 1366/390实际截图；放大镜仅装饰未揭示真实证据；顶部到功能较长；未做用户理解研究                                              |
| 地点与企业四阶段        | 可选级联地区、父地区变更清空后代、street有限匹配、20条上限、空状态扩大范围、候选选择、准确企业直查、扫描/明细分离、raw折叠、partial/主体不一致                               | 缺地图Key实际状态；成功主流程源码+controlled自动测试；未用共享Key联网；DiscoveryFlow并发输入缺consumer分支同等seq/abort保护 |
| 问询                    | draft示例、字数、Enter/ShiftEnter、当前context清除、log aria-live、SSE frames、响应empty/error/delta、Node缺失503                                                            | 真实服务缺失截图；Node成功直播/模型fallback仅源码；预置事实与当前实时应清楚区分                                             |
| 消费入口                | no model、配置status、空候选、cached失败降级、unavailable、候选依据、意图/服务/金额/时长、取消、错误“不以样例替换”                                                           | 初始真实页面；各正常/超时/取消/部分失败由测试覆盖；受控浏览器成功返回明确fixture                                            |
| 查询结果                | 决策等级、确信度、来源数/网站数、任务卡按有内容显示                                                                                                                          | fixture；金融表达反转见下节                                                                                                 |
| 这家公司是谁            | 关系状态、summary、资料截至时间、agent status、主体依据、返回                                                                                                                | fixture；displayText删除关系待核实                                                                                          |
| 为什么是这个风险        | 理由→来源按钮、完整范围折叠、无reason未知                                                                                                                                    | fixture；不直接显示完整quote仅后续详情可查                                                                                  |
| 消费者怎么说            | reviewed/collected、非评价/近转载、scope、正负混合计数、全观察折叠                                                                                                           | fixture+source；不是全平台评价或满意率                                                                                      |
| 未来收支试算            | 实际/指数基线、单位、三情景、逐月表/公式、现金数值出处、limitations                                                                                                          | fixture+测试；未执行真实模型提取基线                                                                                        |
| 逐项查看情况            | 六指标按有资料展示、findings逐字quote、具体question、missing与source入口                                                                                                     | fixture+source；无来源counter等会被隐藏，缺项仍须方法页说明                                                                 |
| 最近有什么变化          | 事实、来源、日期未知、阶段、消费者联系、另一解释                                                                                                                             | fixture+source；后台最多3个词命中线索不是完整变化时间线                                                                     |
| 还要问门店什么          | <=3具体问题、回应/反方来源入口                                                                                                                                               | fixture+source；回应不是自动免责或已处理证明                                                                                |
| 全部证据                | government/registry/community/web分组、body/snippet/API标签、brand scope、来源详情、返原页                                                                                   | fixture；开外链不等于原件采用                                                                                               |
| 调查范围与局限          | sample数/网站数、router局限、未知和下一步                                                                                                                                    | fixture；未知词在displayText会被错误删除                                                                                    |
| 调查过程                | 实际action/detail/source_ids逐步进入来源                                                                                                                                     | fixture+source；某些失败尝试model_calls未计数完整                                                                           |
| 公司四维                | 现金/信用/依赖/口碑、覆盖数非分数、同事实4角色排序、大字、手填必须source+period、unknown/0/invalid、用户clear与接口记录conflict、说明访谈阈值                                | source+测试；无真实公开表调用，40%负债/3月/80%等未经行业校准，不吸收为析光评级                                              |
| 公开三表                | 证券代码+报告期核对、四期、boolean/NaN→null、0保留、同表债率、currency,notice/report/update/fetched各分、5min cache、group empty/failed/不支持                               | source+受控测试；不是原件确认证据；latest一期运行cash趋势与无法取得空状态                                                   |
| 历史回放/本地全文/原件  | 当时可用版本、日期次日、supersedes、unknown旧公司隐藏、snapshot依赖可见、sourceGeneration、原件hash+页、后续独立、right-censored、对照拒绝                                   | 恢复元数据实际；0原件支持反映当前环境；重要exact PDF与时点由测试覆盖                                                        |
| 数据管道                | doctor/discover/fetch/resume/extract/validate/labels/import/restore、content-hash版本、同hash不抹旧核验、原件再读、原子事务、OCR未配保留needs_ocr、manual import候选         | source+pytest；外部批量fetch本轮未执行；235完整原件未带入clone                                                              |
| 交易现金/比较/图/导出   | 分批比例、精确分币、直接成本优先、gross margin fallback、全部预付无余款、0/负/缺参数、视窗外事件、日终净额限制、fixed30可能更差、opportunity_cost、stale隐藏、图step end     | 真实本地API+源码+测试；内置订单明确虚构；不是上市公司未来现金预测                                                           |
| 抽屉/数值微交互         | focus trap/Esc/restore focus、背景滚动锁、来源返回卡、retry、memory/localstorage cached provenance、数字草稿invalid、reset输入+公司+来源状态                                 | 真实math抽屉Esc；cache失败/恢复等受控测试；selector不含全部focusable，读屏仍需补验                                          |
| 任务/缓存/权限/服务     | 3并发/30job/1h/1800s，2-company research/240s，ContextVar、DELETE取消、no-store、main API结构错误、secret不回status、本机operator约束、SSE转发close，24h最多100discovery缓存 | 源码+受控测试；job内存重启丢失、匿名持ID读删、未实现私有owner隔离；不能等同析光权限模型                                     |

## 金融判断与引用的实质价值、需要修正部分

后端的证据约束相对细致：跨品牌资料只能context不能adverse；评级理由必须定位来源连续引文；注册存续需要government/registry引文；资金链/现金压力结论必须引用有关现金财务的内容；导航栏目/聚合页不能当事件；超过2年旧不利需当前后续；high需两个不同网站且非只有摘要；low不得由“没搜到负面”推出；评价必须逐项审阅、宣传不是消费者体验；高confidence上限要求独立来源/正文/日期/评价覆盖和同期间现金基线。`consumer_risk.py:45`、`consumer_outlook.py:127`有程序闸，不只是提示词。

引文机制还把source ID压缩为E1、E2，将原excerpt切连续片段生成citation_id枚举，模型只选择编号，程序回填原文；评价被编码为逐来源必填对象key，防遗漏或重复替代，独立可借。它不能保证句子蕴含结论，120字硬切可能拆金融行，析光应采用完整段落/表行+范围+token验证。`consumer_model.py:66`。

现金试算分“同主体同期间gross operating现金流入/流出”与“收入=100支出80/100/120指数”两路，固定±变化为条件，不叫概率/预测；每月线性假设和累积公式公开。**不能直接吸收其月基线**：`YYYY-MM`除1但未区分月报与年初至本月累计；中文人民币识别不够通用；float情景不如析光整数分精度。交易分支Decimal确定性更清楚；析光已经同时支持日终与payments-first保守日内方法，能力比见微仅日终并加警示更深。

**最重要缺陷是前端与后端语义逆转**。`consumerPresentation.ts:3`把low与medium都映射“中等确信度”，`riskHeadline`把low写“低风险，可以信任！！”；`displayText:29`正则移除“待核实/待核查”和日期仍待核实，替低确信度为中等。本轮实际执行其函数，输入“门店归属待核实，低确信度，近一年2份（日期仍待核实）”变成“门店归属，中等确信度，近一年2份”。见`presentation-reversal.json`、受控报告截图。应当坚决拒绝显示层强化确定性，不能“学它表达简单”时连同金融保证一起搬来。

其他边界：成立5年且登记存续可降低low要求由3组降2组，是经营稳定误代理，不能沿用。source independence按网站+85%近似文判，不是新闻机构真正独立性；全批材料阅读不是全网/全平台覆盖；评论倾向不是满意率；词匹配变化最多3条，不是完整最新变化。Node内置乐刻/恒大回答为预置信息，其“已核实”仅库内自述；未重新验原件不应吸收为事实。权限匿名任务、内存状态和公开共享配置不适合析光私人资料。

## 析光差距、组合与去向

[全量清单](../values/jianwei.json)登记48项，每项包含研究SHA、源码位置、触发/可见行为/系统行为、价值、成立条件、成本风险、析光文件差距、独立转化、去向和验收。最终逐项处理为28项 verified、8项 implemented、11项 deferred、1项 rejected。verified 中明确区分本轮新增/适配和已存在能力保留；每项附实施路径与检查范围。implemented 表示源码已存在或已实现但相应整体运行验收尚需主工程完成，不声称用户效果已验证。每个 deferred 都保留前置条件和下一步。

- 析光强于见微的基础：原件采用、issuer/期间/币种/单位/合并annual门槛，公共快照不自动变原件，immutable私人version、withdrawal依赖、owner isolation、整数分cash plan和payments-first。该优势来自实际源码差异；真实用户效果仍需任务验证。
- 已补强的用户路径：新增独立经营名义字段及`DecisionEntityPath.tsx`，四角色排列逐段显示核验状态和材料入口；复用`shared/decision-contracts.ts`与现有合同/收款/退款字段。不同名字/同名字都不自动建法律关系。
- 已经形成自己的组合：经营名义/责任角色独立核对 + 析光原件/撤回 + 本次付款条件演算。`shared/payment-boundary.ts`与`PaymentBoundary.tsx`将本次未交付暴露上限反求数学拟付款边界，用已付/实际交付/已到账退款/合同剩余额计算，前端区分记录已核对与用户假设，企业承诺退款不可加入实退款。
- 报告表达提炼：任务命名“为什么/查谁/还问什么/全部依据/这怎么算”内容特定展开，与析光同一份简要报告兼容，不引入Plain/Pro或四类独立report。每个关键判断维持来源入口、未知与下一步在同一段。
- Agent可靠性提炼：source/citation枚举选择、逐项必填审阅、严格反方与后续工具、保留已完成批次、缓存/失败/实际次数分开。全部接入析光当前allowlist和budget，不引入竞品密钥/缓存权限模型。
- 教学提炼：作品没有准确金融游戏，只有装饰放大镜和可交互现金条件。真正可迁移是“先提出判断→查看原件与关系→改变条件看结果→限定复盘”。析光evidence lab的依赖撤回比装饰探索更有信息价值；历史后续揭示独立，不可用后来资料倒改当时评分。用户理解改善标记待实验。
- 暂缓明细：合法POI/非上市工商授权、历史完整PDF重抓/原样本复核、semantic citation与fulltext导航、可访问性人工读屏。清单明确前置，不因优先级遗漏。

重要方案比较：A新增“安全/中风险”摘要更接近见微强标题，但证据不足变风险混淆拒绝；B把全部责任方挤到同一表再算款，虽实现便宜仍难看清关系；C独立名义→责任角色逐段门槛和数学付款边界，兼容已有证明材料/withdrawal/unknown，作为实施方向。需要用“名字相同但没有关系证据”“合同和收款不同”“撤回退款凭证”“拟付额超过暴露上限”同任务验证。

## 证据索引和演示路线

`evidence/jianwei/`包含：原始build/test/install日志、隔离启动/prepare/restore日志、8张1366/390四入口截图和文字、实际trade-calculated/trade-30pct/trade-math、chat-failure、browser-checks、history-quality-runtime、presentation-reversal、独立capture脚本；fixture-report-\*仅消费页面受控交互，报告与来源都显式“虚构研究演练/受控样例”，不冒充真实结果。研究原始来源用SHA+file:line对应，screenshots对应当前固定源码build，不使用仓库此前qa图片当本轮运行证明。

可复现的真实本地演示：trade→观察左公开事实/中虚构假设→开始演算最低3万缺口17万→打开“这怎么算”核对逐笔金额、第130天视窗外→Esc回到原页→30%预付款看最低33万→核对比较方案实际输入并说明非付款建议。首页Node故障时保留主产品、显示服务不可用；history新clone缺原件时诚实展示候选0支持，不给复原成功徽章。

不得演示成真实联网完成：消费报告fixture、仓库内置Node fallback、未取得235原PDF的历史事实、未调用共享密钥的地图/QCC/模型。本版无证据撤回主流程，析光独立withdrawal已有能力不能说由见微借来。最终任务对照应按同类：经营关系/原文定位/条件现金/失败恢复；其消费风险枚举不与析光年度财务grade作胜负数值比较。

## 本轮独立实现与逐项验收

| 实施                                             | 实际入口与行为                                                                                                                 | 已取得的检查                                                                                                                                                                 | 验证限制                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 主体责任路径                                     | 决定页“这笔付款涉及谁”；经营名义、合同、收款、退款分别核对。每角色查看当前依赖依据，补充依据带入正确role；只读版本隐藏补充入口 | `deriveDecisionEntityPath`状态单元测试；1366/390实际生产组件受控harness点收款角色，查看callback为`identity-payee`、补充为`identity:payee`；只读新增按钮0；同名不证明经营关系 | 浏览器输入为明确虚构fixture，门槛为受控模拟；未验证工商经营关系或原件真实性                               |
| 反求付款边界                                     | 决定页外部付款演算“自设条件留下多少付款空间”；未填proposedAmount仍可反求，输入条件与定位记录分别显示，公式和采用字段可展开     | 17计算/状态测试；独立穷举分级金额比对所有非负可行付款；20位金额精确到分；缺失/撤回/冲突/主体不符停止记录分支                                                                 | record路径总额及自设上限仍是输入条件，UI明示；定位匹配不认证资料或履约；数学边界不作为付款推荐            |
| 来源分级与关系、说法目标、证据练习、版本差异映射 | 统一来源组件/逐说法目标/可撤回依赖练习/相邻输入版本差异；具体组件由共同工程其他Agent实现，见相应项目与清单                     | 本Agent执行6文件66测试全过，涵盖source-trust、decision-claims、evidence-learning、research-plan、payment-boundary、decision-change；另4文件33既有能力测试通过                | 本Agent仅声称对应单元检查与源码确认；其他组件完整端到端与真实数据演示须引用主工程验收，用户理解效果未实测 |

付款反求的精确合同是：自设暴露空间 = limit + 已交付对应金额 + 实际已收到退款 − 已付；交易剩余额 = total − 已付。当前暴露尚未超限且范围一致时取两者较小值。缺五项任一为未知，不默认为零；负数/三小数/指数金额非法；退款大于已付、已付/交付大于总额停止。当前暴露已超自设limit时没有非负新增拟付，显式停止，不能截为0后称满足条件。未来退款承诺不进入公式。

受控组件输入CNY总额1000、已付300、已交付100、实退款20、limit250，没有proposedAmount，数学边界70.00、当前暴露180.00、剩余合同700.00；limit改100后超额80.00、上限未知。撤回退款/冲突/收款范围不明均保留按输入分支并暂停record分支，避免把用户假设伪装成有记录结果。金额源缺失而用户输入仍有值，也不借输入填record。相反，用户没填实退款而现有定位记录仍有金额，两个分支可以分别未知/已知，显示各自采用字段。

实施文件为`shared/payment-boundary.ts`、`src/DecisionEntityPath.tsx`、`src/PaymentBoundary.tsx`、`src/payment-boundary.css`、`tests/payment-boundary.test.ts`，主工程集成`DecisionInput.tradingName`和决定页入口。样式只使用析光现有tokens，窄屏单列，无关系证明箭头，不修改公共模型payload。

验证证据：`prispect-payment-boundary-tests.log`、`prispect-mapping-tests.log`（66通过）、`prispect-existing-capabilities-tests.log`（33通过）；`boundary-harness.html/.tsx`与`boundary-capture.mjs`是独立受控验收工具，加载真正生产组件，所有虚构输入与模拟门槛在页上标明；`prispect-boundary-browser-checks.json`、`prispect-boundary-{known,missing,above,withdrawn,conflict,mismatch,readonly}-{1366,390}.png`、`prispect-boundary-en-dark-{1366,390}.png`。全部测试状态无页面横溢出、无pageerror；中文浅色和英文深色展开表已目视检查。未开展真实用户理解/学习效果或外部金融数据成功率实验。

前后对照任务：旧决定页需先输入一个拟付数，再看该方案暴露；新组件无需猜数，直接看到输入与记录各自的最大数学边界和限制来源；旧角色字段分散，新组件把三责任角色与经营名义集中但保持法律关系未确认。由于旧界面已有责任字段、金额演算与证据撤回，这属于入口/表达/反求新能力增强，不能称从竞品获得析光原件或撤回基础。

本Agent只读审查了共同工程的`decision-change.ts`、`decision-export.ts`，指出初版导出缺反求两分支/日内保守额，以及known无shortfall的null误写未知；交由主Agent补齐并执行统一导出验收，研究文档不冒充已替其他Agent完成该修复。

## 衔接账本

2026-10-03T06:02:21Z，分支`research/competitive-integration-20261003`，本Agent未提交。固定竞品源码git clean；bundle原始备份保留。四入口/全部消费子页/核心模块/关键失败和缺失状态已做覆盖表，源码/真实本地运行/预置/受控fixture/未验证外部服务严格分开。报告、48价值与独占五文件已交主工程，端口4403仍可复现竞品离线，5403提供受控析光实际组件验收harness。

最近局部检查：17付款边界测试、6文件66映射测试、4文件33既有能力测试通过，独占文件/研究工具Prettier通过，48实施路径及deferred前置/下一步校验通过。全局typecheck曾通过；06:02复查期间其他Agent并行修改造成`EvidenceLab.tsx:476 retainedOriginal`联合类型和`decision-change.test.ts:71`调用参数两处错误，已告知主工程，不修改他人文件。最终全局检查与导出修复须引用主工程后续结果。

仍未验证：真实授权地图/QCC/模型成功、235历史原件恢复、真实用户理解/教学效果、人工读屏。11项暂缓价值逐项写在清单，不因已完成28 verified而丢失。当前代码可继续独立金融复核；交付本轮新能力不等于保证企业、经营关系、资料真实性或付款安全。

独立只读审查已完成：另一Agent重读五个付款/角色文件并单独跑17付款边界测试，未发现具体需修复bug，未修改代码。公式、缺值/0、超限停止、精度、当前来源闸与角色文案一致。`prispect-boundary-independent-review.json`保存审查范围、边界和五文件SHA256，不能把此代码审查当原件真实性核查或真实用户验收。
