# 主Agent独立复核

本轮直接读固定源码；运行结果另由各项目记录支持。以下不是根据旧竞品评价推断。

| 对象 | 本轮源码位置 | 重新核实结果 | 吸收或纠正 |
| --- | --- | --- | --- |
| 企er | `web/app.js:25`、`:1154`、`:1170` | 承诺/记录有明确卡片；判断入口受judg查询参数控制，注释说明仅改需求会伪报需核实 | 保留逐条原话、依据和询问；析光入口保持显式，不把改关注目标当证据变化 |
| Hermes | `lib/analysis/light.ts:14`、`components/scan/ScanProgress.tsx:26` | 绿灯文案“这钱能付”；扫描340ms定时点亮独立于实际任务 | 拒绝付款批准语气及虚假进度，保留直接动作与真实事件 |
| Hermes | `components/xray/detail/FinancialSection.tsx:14`、`:26` | 原数组reverse后用前一显示行作为同比基期；若原数据升序，会以新年度比旧年度逆算 | 析光比率与年度必须按真实期间关联，不能照搬呈现函数；不是因测试多就金融正确 |
| 见微 | `frontend/src/consumerPresentation.ts:4`、`:11`、`:31` | 非high确信统一中等、undetermined默认medium；替换函数删待核实并提升低确信标签 | 拒绝删除未知与提升确信；提炼门店/名义/付款主体逐环核对 |
| 明察Pro | `references/report-standards.md:66`、`references/detailed-playbook.md:161` | 提示词定义90%置信与至少三行矛盾；仓库模板不是执行检索系统 | 保留来源链与矛盾思路；不用固定矛盾行数、概率或未实现工具宣称 |
| 明察Pro | `references/search-playbook.md:152` | 反方搜索配额是文档规范，尚无程序调度器 | 析光实际公开补查、反向复核需真实trace与有效来源，不把口头配额当完成 |
| 析光 | `src/CompanyPublicInformation.tsx:330`、`:592`、`server/company-assessment.ts` packedPublicInformation | 已有clusterId提示和载荷去重复，不能说转载族完全缺失 | 增强为跨报告统一读模型、正文范围与已知同hash/url族；未知独立性仍未知 |
| 析光 | `shared/decision-contracts.ts`、`src/pages/Decisions.tsx`、`server/decision-engine.ts:1044` | 原话单段，历史Vn列表，没有字段diff；已有整数敞口与两方案，无反求条件边界 | 在既有版本/权限/计算规则上追加读模型与可选字段，不另造评级 |
| 析光 | `src/App.tsx:627`、`:684`、`:202` | 账号key卸载、mutation owner guard和refresh中止已具备；单页GET缺signal-check不是已证实跨账号泄露 | 新读模型服务端同账号派生，不新增风险请求；最终验收做晚响应与换账号检查 |

核心比较只按实际承担同类任务。财富的虚构游戏和明察的方法模板用于机制转化，不能以不提供企业API判定其任务失败。真实用户效果未经访谈验证，工程检查能说明机制生效，不能证明获奖、理解率或商业需求。
