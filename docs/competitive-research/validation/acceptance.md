# 析光改进验收与同条件对照

状态：第四轮最终生产构建验收完成。主脚本50项检查、31张截图；公开机制脚本16项检查、11张整页截图及2张窄屏组件截图；现金时序、可选交接主体核对和真实重启专项通过。没有页面异常或未分类的控制台错误。登录限流窗口自然过期后使用真实有效会话完成恢复复验，没有修改限流记录。

## 版本、环境与材料

- 基线：原 `/workspace/prispect`，`work`，提交 `d748d1ac5c1a9c6fe702301c819980e1cce87312`。原工作区保持不改。
- 改进：隔离 `/workspace/prispect-improve`；最终构建主浏览器验收在 2026-10-03 06:17 UTC 完成，专项在06:18—06:20 UTC完成。当前源码指纹 `df9d6566286d12a41d0cd47b5f0d7197fdfccd19ab0fcbf383b1011aa218f6e2` 与主脚本记录一致，79个dist文件逐项SHA在 `evidence/prispect-after/final-version.json`；最终提交由主工程账本登记。
- 工程浏览器：仓库实际 Playwright + Chromium `154.0.8037.0`，Linux，无原生 Browser 工具。没有宣称 Safari、Firefox、真实手机或辅助技术实测。
- 正常生产构建与 API：`http://127.0.0.1:4320`。真实认证、CSRF、原件保存、任务、决定、并发版本与持久化；独立数据目录 `/workspace/research-envs/prispect-after-state`。UI 实际注册测试账户，凭据在研究环境目录中，不入仓库。资料、数值、交易及原文均为明确标记的合成输入。
- 公开 UI 工程 fixture：单独 `4321` 和独立数据目录。仍使用本项目真实认证、异步状态、规则派生与页面；公开 provider 明确返回非真实企业的合成快照，模型与工具调用为零。只验机制，不代表成功实时查询、官方披露读取或真实金融判断。
- 真实公开查询单独登记在 `live-company-receipt.json`；与 `public-*-fixture` 文件严格区分。相同300893/2025查询实际得到目录/候选200、创建202，随后官方重新解析失败、context失败；未形成assessment，未替换主体。没有设置外部模型凭据，不验证 Grok 输出、联网反方研究效果或模型引用质量。

材料原始字节：`synthetic-original.json-upload` 与基线完全相同；`complete-records.json-upload` 与基线的三条完整原文完全相同。JSON 上传经过实际 multipart 预览与采用接口，随后读取原件文件验证 SHA256 一致。`.json-upload` 用于避免格式化器改变已验证原件字节。

财务输入为 2024/2025 同主体、CNY 元、年度、合并口径；2025 净利润 100000、经营现金 60000，现金桥 100000 −10000 −30000 +5000 −5000 = 60000。付款总额 100000，已付 10000，已交付对应金额 0，实际退款 0，方案 A 新付 20000、B 新付 5000，自设敞口上限 20000，适用日期 2026-10-03。

原件追加阶段另存 `roles-and-terms.json-upload`，明确保存合同、收款、退款三个角色以及书面条款原文。它是额外材料，不能用这个阶段的较完整结果证明同材料核验能力优于基线。上限/交易总额始终为用户输入条件，不转换为已证实事实。

## 同条件前后对照

| 相同输入与操作                     | 基线实际结果                                      | 改进实际结果                                                          | 可支持的提升                                                         |
| ---------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 同一财报字节，规则计算             | 净利 100000；经营现金 60000；比值 60%；精确现金桥 | 数值与金融含义一致                                                    | 保持已有确定性计算；不能称现金率改善                                 |
| 同三行完整付款/交付/退款原件       | 按记录 A 敞口 30000、B 15000                      | 按记录 A 30000、B 15000                                               | 守住记录与条件边界；不能称自动证明付款安全                           |
| 撤回已付款证据，再恢复             | 记录 A 未知 →30000；输入 A 保持30000              | 相同结果；新增相邻版本的证据状态、门槛与计算变化明细                  | 用户可见因何暂停、哪些金额失效；未测真实用户核验耗时                 |
| 原话“集团上市/付款可退/锁定交付”   | 单段事项说明                                      | 主动摘录3条并显式选择核对字段，可回到字段依据；明确未做语义或真假鉴定 | 原话、核验目标和材料状态形成可见连接；字段匹配不认证原话真实性或履行 |
| 全输入金额反求本次付款数学上限     | 只有两个拟付方案的前向演算                        | 新增自设条件反求10000；可展开公式及采用的金额                         | 无需试填多个拟付款值；不是付款推荐或真实损失上限                     |
| 只有三行金额原件、缺责任角色与条款 | 记录方案金额可算，条件仍有缺口                    | 记录反求上限未知；所缺门槛明确列出                                    | 上限展示有额外证据停止条件，不能用已知金额掩盖主体与条款缺口         |
| 同版本的服务读取503                | 手动重新读取可恢复                                | 手动重读恢复版本/材料/计算                                            | 保持诚实失败和恢复；故障为受控注入而非外部宕机统计                   |
| 同私有ID跨账号/匿名访问            | 404/401，重启保留                                 | 404/401；迟到旧账号响应不进入新账号视图；重启保留                     | 对新增组件继续守住 owner 边界，不宣称更高安全等级                    |

追加角色与条款原件阶段：四个门槛全部 `matched/source-located` 后，记录反求与输入反求均为 10000.00，当前未交付暴露10000、敞口空间10000、交易余款90000；这是“新增材料后条件完整”的正确响应，不是不同材料条件下的竞争胜负结论。

## 实际验收矩阵

所有正常记录由本项目服务保存和重算。浏览器故障/迟到响应及公开内容替身都明示为工程注入。

| 机制及实际入口                                    | 验收操作/状态                                                                                 | 验收结果与证据                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 原件核对：财报“查看指标来源”                      | 同字节上传、源文件hash、抽屉字段/金额                                                         | 通过；`03-desktop-light-original-drawer.png`、`synthetic-report.json`                                                                                                                                                                                                                                             |
| 本地撤回学习：财报→分析依据与核查记录→证据实验室  | 同财报没有公网URL；检查是否虚构可用事实                                                       | 先发现旧缺口并保留 `upload-lab-discovery-browser-results.json`；已修复owner原件路径，第四构建正常入口通过：撤回存货4项暂停，现金利润比60%保留、0API、原报告深比较不变、恢复成功。`04a/04b-desktop-light-prediction-*.png`。财富专项另验原件SHA、匿名隔离、键盘恢复焦点和窄屏单列；独立harness不替代产品路径验收。 |
| 原话逐项对照：付款事项“下一步”                    | 保存3条原话与主动目标，定位材料后仍无真假/履行判定                                            | 通过；`09b-desktop-light-located-claims-not-truth.png`。原话编辑器切类型/不可用目标保留和显式重选，见 `evidence/qier/prispect-claims-browser.json`；正文不自动重选核验目标。                                                                                                                                      |
| 经营名义与责任路径：事项“条件”                    | 门店品牌仅输入、三种责任角色独立，原件定位后角色字段状态                                      | 通过；`desktop-light-07-trading-identity.png`。没有自动推断同集团授权或责任。                                                                                                                                                                                                                                     |
| 反求付款边界：事项“方案比较”                      | 输入/记录两个路径；缺角色/条款未知→补原件10000；缺上限未知；公式与采用金额                    | 通过；`payment-boundary-results.json`、`09a-desktop-light-complete-record-boundary.png`、`12-desktop-light-missing-user-limit.png`                                                                                                                                                                                |
| 可选交接签约主体核对：明确摘录contract-entity说法 | 使用本账号保存的角色原件，添加/撤回/恢复；与cash演算独立                                      | 通过：unknown→matched→withdrawn→matched；cash对象每一步深比较不变。`handover-contract-claim-results.json`、`handover-explicit-contract-claim-390-dark.png`；角色核对不填补现金，也不认证上市说法。                                                                                                                |
| 相邻版本变化：事项“版本”                          | 撤回已付款后列明active→withdrawn与30000→未知；恢复反向变化                                    | 通过；`withdrawal-results.json`、`10-desktop-light-withdrawn-change.png`、`11-desktop-light-restored-change.png`。当前规则下重算，不是企业经营变化时间线。                                                                                                                                                        |
| 反证与未知                                        | 同主体同日付款10000/15000冲突；撤回反证；未来退款承诺10000                                    | 通过；冲突保留，记录演算未知；未到账承诺不抵减暴露。`15-desktop-light-conflict-persists.png`                                                                                                                                                                                                                      |
| 并发、版本与恢复                                  | 过期baseRevision；两个相同base并发写；受控503再读取                                           | 通过；409；[200,409]；当前版本恢复。`browser-results.json`、`13/14-desktop-light-read-*.png`                                                                                                                                                                                                                      |
| 权限及迟到响应                                    | 其他真实账号访问已知任务、原件、事项和导出；匿名；外站Origin；延迟旧detail后退出并登录新owner | 通过；404/401/403；旧标题与旧企业不在新账号页面。`26-late-response-owner-isolation.png`                                                                                                                                                                                                                           |
| 现金时序与完整导出：交接事项“方案比较”及导出      | 同日收1000/必要付1500/拟付100、起点1000、底线300；付款日缺失再恢复                            | 第四构建真实保存及UI下载通过：日末400、付款优先−600、最大缺口900；未知日期暂停时序并列明变化，恢复后回到−600。`cash-browser-results.json`、`cash-01/02-*.png`、`export-cash-handover.html`。                                                                                                                      |
| 登录限流：真实登录页                              | 重复验收触发本轮账号10次/15分钟上限；390窄屏正常提交                                          | 实际429/RATE_LIMITED，清楚提示稍后重试，输入保留，不进入私有页；没有清表或关闭限流。`auth-real-throttle.json`、`auth-real-throttle-390.png`。                                                                                                                                                                     |
| 真实重启恢复                                      | SIGTERM正常API，再用相同目录启动；新session登录/刷新                                          | 通过；财报与原件字节一致，保存的版本/证据/claims/计算/changes一致。`restart-before.json`、`restart-after.json`、`27-real-server-restart-restored.png`                                                                                                                                                             |
| 保存版本导出：事项操作→预览并导出这个版本         | 真正预览、sandbox iframe、下载同版本HTML；保存合成攻击文本后静态导出/离线打开                 | 通过；CSP、每项用户文本转义、脚本未执行、未产生外部资源请求；`export-decision.html`、`export-injection-fixture.html`、`15a-desktop-light-saved-version-export-preview.png`。最终来源去重公开fixture、现金时序真实保存/下载和事件明细专项均通过。                                                                  |
| 打印完整依据：财报/公司打印                       | 浏览器先关闭全部details，然后离线PDF，pdftotext核对内容                                       | 通过；财报精确金额、公式、口径、采用材料及摘录保留；合成公开框架完成条件、来源逐行和读取等级保留。`financial-print.pdf/.txt`、`public-company-print-fixture.pdf/.txt`                                                                                                                                             |
| 报告限定展开：公司概览→展开/收起核验区            | 键盘Enter展开白名单中的已保存区块，再收起；检查研究表单/学习未打开                            | 通过，仅合成公开UI：0API，所有目标区块展开/收起状态正确，未自动读取原文、启动研究或演练。`public-01a-keyboard-expand-retained-review-fixture.png`。                                                                                                                                                               |
| 研究关注模板：公开公司→进一步研究                 | 点“反方依据”后仅填目标、不发API/不改报告                                                      | 通过，仅合成公开 UI；`public-05-goal-template-local-fixture.png`                                                                                                                                                                                                                                                  |
| 核查框架：公司概览→核查框架                       | 主体/年度/快照、问题、缺口、成判条件；真实下载；拒绝clipboard后手动文本选择                   | 通过，仅合成公开 UI；`public-framework-fixture.txt`、`public-02/03-*.png`；没有伪造Agent已执行计划。                                                                                                                                                                                                              |
| 来源关系：公司概览/来源比对→来源与读取范围        | 原文节选/摘要/标题分开；两转载条同组；独立性未知；有效讨论绑定主体                            | 通过，仅合成provider；`public-source-view-fixture.json`、`public-04-desktop-light-source-families-fixture.png`。第四构建去重已复验；没有修改评分或把来源条数转换成概率。                                                                                                                                          |
| 可读性、主题和键盘                                | 1440×1000、390×844、320×740；明/暗；Ctrl+K/Escape                                             | 通过已拍布局；所有截图库检查document不宽于viewport；已人工view关键反求与窄屏截图。320付款列为单列，金额/限制说明可读；来源表在自身滚动容器中。实际键盘打开/关闭命令搜索；框架/学习详尽键盘专项另附。                                                                                                              |

## 验证边界与尚未证明的效果

1. 所有金融金额与交易均为合成输入，验证公式、材料依赖、状态与权限，不认证原件真实性、授权、合同效力、履行或未来损失。
2. 实时公开查询与成功 UI fixture 分开保存；目录候选/缓存不是当前主体确认，新闻转载组不是独立证据链，没有已读节选则保留标题/摘要范围。
3. 未配置外部模型，因此未验证联网反方检索、模型稳定性、真实预算耗用或最终叙事质量。fixture 中零调用不是实际Agent效率提升。
4. 320/390 是 Chromium viewport 工程验证，不是真实设备；没有实际用户研究。初次理解、核验耗时、回访率与现场优势均待任务测试，不能由截图或自动断言宣称。
5. 原件不会装进静态事项HTML，离线导出保留材料ID/定位摘录与边界；原文件需恢复联网并用本账号核对。完整存储恢复只覆盖本轮受控 state 的真实重启，不替代生产备份灾难恢复测试。
6. 旧JSON“PDF页1”文案已修复，最终财报PDF中不再出现此表述。首屏下一步微文案也已修复：已有上限但A方案超限时实际显示“核对拟付款与自设暴露条件”，不将超限误称为缺少上限，不自动抬高上限；第四构建实际截图与显式文本断言通过。

## 复现

仓库依赖通过 `npm ci`；全量 `npm run check` 与固定规范 checker 由主工程统一执行，基线539测试结果在 `validation/baseline.md`；主工程第四轮完整 `npm run check` 619/619测试通过，严格类型、生产build与format全部通过。本验收不并行占用全量check。

普通隔离服务器（先由主工程完成最终 `npm run build`）：

```sh
PORT=4320 HOST=127.0.0.1 APP_ORIGIN=http://127.0.0.1:4320 CASHLENS_DATA_DIR=/workspace/research-envs/prispect-after-state node --import tsx server/index.ts
node --import tsx docs/competitive-research/evidence/prispect-after/capture-after.mjs
node --import tsx docs/competitive-research/evidence/prispect-after/verify-restart.mjs before
# 正常停止上面的4320 Node进程，再用同目录启动；随后：
PRISPECT_STORAGE_STATE=/workspace/research-envs/prispect-after-owner-storage.json node --import tsx docs/competitive-research/evidence/prispect-after/verify-restart.mjs after
PRISPECT_STORAGE_STATE=/workspace/research-envs/prispect-after-owner-storage.json node --import tsx docs/competitive-research/evidence/prispect-after/verify-cash-export.mjs
PRISPECT_STORAGE_STATE=/workspace/research-envs/prispect-after-owner-storage.json node --import tsx docs/competitive-research/evidence/prispect-after/verify-handover-claim.mjs
node --import tsx docs/competitive-research/evidence/prispect-after/probe-live-company.mjs
```

单独合成公开 UI：

```sh
PORT=4321 HOST=127.0.0.1 APP_ORIGIN=http://127.0.0.1:4321 node --import tsx docs/competitive-research/evidence/prispect-after/public-fixture-server.mjs
node --import tsx docs/competitive-research/evidence/prispect-after/capture-public-fixture.mjs
```

初次脚本真实注册隔离账号；重复验收可用 `PRISPECT_REUSE_ACCOUNT=1` 登录已保存的两个本轮账号，避免注册限流。脚本不读取基线用户state，也不把合成企业用于实际公开研究。它们的绝对路径匹配本研究工作区；迁移环境需调整脚本顶部root/out和Playwright导入路径。

证据冻结：基线4319以及4320/4321曾向研究目录输出的服务器进程均已正常停止，before/after全部服务器日志已冻结。最终4320保持运行，但stdout在仓库外 `/workspace/research-envs/prispect-after-final-server.log`；合成4321完成验证后已停止，其stdout也在仓库外。重启事件与日志冻结记录见 `final-restart-event.json`、`final-log-freeze.json`。主工程可以接管生成完整文件哈希与提交。
