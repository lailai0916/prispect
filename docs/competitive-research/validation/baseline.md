# 基线验证记录

对象：`prispect@d748d1ac5c1a9c6fe702301c819980e1cce87312`，原 `work` 分支；2026-10-03。本轮证据在 [prispect-before](../evidence/prispect-before/)，受控账号和认证secret只在外置临时目录，不提交。原基线受跟踪工作区未变。

## 环境与准确运行命令

Node `v24.19.0`、npm `11.9.0`。现有 `node_modules` 缺 `cheerio`；第一次check停在typecheck，见 `check-initial-missing-dependencies.log`。完整锁文件安装 `npm ci` 新装291 packages，见 `npm-ci.log`。未修改package/lock或复制新规范。`npm run check`再次执行，通过strict类型、539/539测试（0 fail/0 cancelled/0 skipped）、生产build和全库Prettier，见 `check.log`；独立build见 `build.log`。Vite保留password-strength大chunk警告，非失败；没有做生产性能SLA测量。

```bash
cd /workspace/prispect
npm ci
npm run check
python3 /workspace/lailai-template/scripts/check_repository.py --root /workspace/prispect
PORT=4319 HOST=127.0.0.1 APP_ORIGIN=http://127.0.0.1:4319 \
  CASHLENS_DATA_DIR=/workspace/research-envs/prispect-before-state \
  node --import tsx server/index.ts
node /workspace/prispect-improve/docs/competitive-research/evidence/prispect-before/capture-baseline.mjs
node /workspace/prispect-improve/docs/competitive-research/evidence/prispect-before/probe-live-company.mjs
node /workspace/prispect-improve/docs/competitive-research/evidence/prispect-before/verify-baseline-isolation.mjs
node /workspace/prispect-improve/docs/competitive-research/evidence/prispect-before/verify-complete-records.mjs
```

上述HTTP服务读取生产Vite `dist`并同源提供真实API，处在本机HTTP模式；没有把它说成`NODE_ENV=production`的HTTPS/TLS/secure cookie验收。真实生产模式源码要求HTTPS origin和稳定auth secret。数据目录是本轮新建，未访问原 `.cashlens`或生产账号。只读规范checker用外部pinned `aab624269fb9cdf18b9da5d11605eb9b0fc79154`；本地通过，GitHub元数据未新查。`repository-check.txt`保留准确结果。

脚本通过仓库@playwright/cli已带的Playwright运行真实headless Chromium `154.0.8037.0`；没有Native Browser工具。脚本和截图属于工程浏览器验证，不暗称真人任务研究。首次截图脚本URL等待匹配到了`next=/query`而过早截图、第二次selector错误均已纠正；最终脚本和`browser-results.json`仅指向第三次完成的19张图，旧早期截图被最终同名图覆盖且不作为正确结果留用。

## 数据与验证分层

| 类型              | 操作与结果                                                                                                                                                                        | 证据                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 合成，真实处理    | 浏览器实际注册；multipart导入合成JSON、编辑预览结构保存；原文件取得hash与上传逐字节同值                                                                                           | `capture-baseline.mjs`、`synthetic-input.json`、`browser-results.json`                 |
| 合成财务          | 2025合并利润100000/CFO60000；6/6核心金额、12两期金额、逐行other组件现金桥，比例60.00%；模型未配置明确not-configured                                                               | `synthetic-report.json`、report/drawer/lab截图                                         |
| 合成外部敞口      | 已付10000，交付0，实际退款0；拟付20000→暴露30000，另一拟付5000→15000；自设上限20000                                                                                               | `synthetic-decision.json`、scenarios截图                                               |
| 版本与依赖        | 真实保存paid/delivered/refunded三条绑定来源；广覆盖UI材料paid可定位但交付/退款原本未定位；追加完整三行输入，record A30000/B15000→撤paid为未知、assumption保留→恢复同值；过期写409 | `browser-results.json`、`complete-records-results.json`、decision evidence/history截图 |
| 注入隔离故障      | 只拦当前决定GET为503；失败不造成功；撤route后点击重新读取恢复。console中的一条503是预期注入，0非预期页面运行异常                                                                  | failure/recovered截图、expectedNetworkErrors字段                                       |
| owner/匿名/Origin | 当前账号task/decision/original200，第二真实账号所有已知ID和export404，匿名401，非同Origin写403                                                                                    | `isolation-before-restart.json`                                                        |
| 真重启            | 先SIGTERM本轮4319进程并正常退出；以相同state重启，原账号真实登录；task body和原文件hash完全相同，决定input/evidence版本与external结果相同                                         | `restart-server.log`、`isolation-after-restart.json`、`verify-baseline-isolation.mjs`  |
| 真实公开查询      | 实际候选接口200、创建202；松原300893/2025官方主体重核失败，未换主体/年份/虚构值；context失败。外部模型0                                                                           | `live-company-receipt.json`、`probe-live-company.mjs`、11张live公司图                  |
| 自动反例          | 当前完整539测试，含金额/零负/未知/冲突/撤回/owner/CSRF/取消/缓存/原件保存/恢复/模型失败等                                                                                         | `check.log`                                                                            |

合成上传的原始字节另保存在 `synthetic-original.json-upload`（hash见isolation记录）；`synthetic-input.json`是供阅读的格式化同结构版本。合成上传的原件是JSON，不称财报PDF取得或原公司事实；材料title/company/notes都标合成。HTTP查询主体重核的失败不说明公司不存在或产品没有实现该模块。客户端候选接口本轮可依预载公共目录和缓存，不能当作“官方实时法定身份认证成功”。没有使用付费模型、商业凭证或虚构成功响应。

## 图像覆盖

19张合成/入口图：1440px浅色首页、空查询、材料、财报、来源drawer、证据lab、决定下一步/方案/条件/材料/版本、503读取失败与恢复；1440px深色财报/决定；390px深色财报/决定；390px浅色决定/查询。`browser-results.json`逐张保留URL、viewport和document/body宽度，均无整页横向溢出。已目视桌面下一步/版本和390px暗色报告，确认原话折叠、版本无差异解释、来源按钮贴近金额、卡片与正文可读。

11张真实公搜图：运行/失败概览、trends/industry/disclosures/profile/coverage/sources/evidence、390px暗色公司/研究库。它们证明实际失败边界页面可访问，不证明本轮取得了历史曲线或官方PDF。`live-company-receipt.json`保持原始状态、branch摘要和无pageerror记录。

## 本轮仍未验证

没有真人理解/任务耗时研究、付费意愿、生产容量、远端当前发布SHA与登录后业务留存、SMTP、物理Touch ID或所有企业/PDF提取准确率。真正公开联网结果没越过官方身份重核，因此成功的公司报告/图表/原件流程只能分开标“源码实现、本轮测试覆盖、联网未取得”，不能和合成截图相加称实时全链路通过。

晚响应owner基线源码核对：`App.tsx`的`main key={user?.id || 'anonymous'}`卸载旧页面；决定页`key={route}`；`execute`在action与refresh前后检查committedOwner。`Decisions`GET effect未含user但cleanup会abort且owner变化卸载，所以没有据此发现已证实跨账号泄露。新增组件应独立检查signal/owner；改进浏览器验收追加真正延迟响应换账号场景。
