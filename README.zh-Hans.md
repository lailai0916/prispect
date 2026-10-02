<div align="center">
  <h1>Prispect</h1>
  <p><a href="README.md">English</a> · <strong>简体中文</strong></p>
  <p>
    <img src="https://img.shields.io/github/actions/workflow/status/lailai0916/prispect/ci.yml?branch=main&style=flat-square" />
    <img src="https://img.shields.io/github/last-commit/lailai0916/prispect?style=flat-square" />
    <img src="https://img.shields.io/github/languages/top/lailai0916/prispect?style=flat-square" />
    <img src="https://img.shields.io/github/repo-size/lailai0916/prispect?style=flat-square" />
    <img src="https://img.shields.io/badge/code_style-prettier-ff69b4?style=flat-square" />
    <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
  </p>
</div>

## 网站简介

析光（Prispect）从一家公司或一件待核事项开始。公开证据 Agent 核对年度利润、经营现金、相关附注和近期披露，给出有依据的观察与尚未解决的问题。外部用户可继续核对预付款，内部接手者可检查具体日期的现金计划。私有记录支持各自的条件测算；历史财务信号不填入当前现金或未来回款。

本项目参加学军中学「回响·48H 青年创造营」X-Ray 方向，聚焦一个明确问题。历史现金比例不代表企业评级、授信决策或投资建议。用户需求与付费意愿仍属于研究假设。

产品信息见[使用文档](https://prispect.com/docs)、[产品介绍](https://prispect.com/about)、[隐私政策](https://prispect.com/privacy)、[用户协议](https://prispect.com/terms)与[版权说明](https://prispect.com/copyright)。政策描述已实现的服务，不等于法律合规认证。联系邮箱：`lailai0x394@gmail.com`。

## 网站特性

🔐 **个人账号** — Better Auth 注册、头像和资料设置、密码强度检查、TOTP、一次性恢复码、通行密钥与会话管理。材料、核查和导出按用户归属访问。邮件验证和找回需要 SMTP；提供商未配置时明确返回不可用。

🗂️ **公开证据 Agent** — LangGraph 并行核对官方 A 股年报、相关附注与选定的近期公告原件。独立的审计意见检索保留原文、PDF 页码和范围线索，不给审计意见或公司评级。受限模型动作从公开候选 ID 中选择有限补查；规则提取金额并保留冲突。失败或取消的查询可在24小时内恢复，请求预算累计。候选经核对采用后才成为个人材料。

🧮 **可重算的财务处理** — JSON、CSV 与文本 PDF 预览、可编辑确认、期间/币种/口径检查、整数分精确计算，以及持久保存的报告和问题单。两期利润与经营现金变化保留两期来源引用和精确公式；同比要求上期基数为正，冲突时暂停比较。

🔎 **证据与决定版本** — 现金桥、原文页码与两种可能解释形成补件问题。组合规则保存成立、条件未全部满足或暂不能核对的状态，列出所需指标及有来源的缺口；组合卡可检验单项依据，并复制适合外部付款者或内部接手者的材料请求。付款底稿保留输入/证据版本、材料文本绑定及已知冲突。撤回直接依据会暂停依赖它的记录计算，保留无关事实与明确录入的假设。

🧪 **付款情景** — 外部比较本次拟付款后的未交付敞口与自设上限；内部按已列90天事件比较付款日期、事件余额、期末和条件下的付款/回款阈值。同日顺序、资料覆盖范围与改期可协商的假设明确保留；缺失输入保持未知。

🌐 **双语完整流程** — 中英文产品流程、使用文档与政策。语言按钮显示当前语言；外观支持自动、浅色、深色，并在下次访问时保留。材料、现金计划与头像可拖放，提供校验与重试。报告区分付款与接手重点，询证清单按依据排序并提示取件角色；HTML、JSON 和 Markdown 清单先预览再保存，保存的内容与预览快照相同。原文引用保留源语言。

## 快速开始

使用 Node.js 22.12 或更新版本及 npm。访问本私有仓库需要授权。

```bash
git clone https://github.com/lailai0916/prispect.git
cd prispect
npm ci
npm run build
npm start
```

打开 `http://localhost:4317`，注册账号（密码8–128字符且不易猜测），输入公司或待核事项。新账号工作区为空。macOS 可以双击 `start.command`：缺依赖时安装，再构建并启动。开发使用 `npm run dev`，打开 `http://localhost:4318`。在其他端口使用通行密钥时，将 `APP_ORIGIN` 设置为浏览器实际来源；生产必须使用 HTTPS 和持久的 `BETTER_AUTH_SECRET`。

```bash
npm run check
npm run data:fetch
npm run data:samples
```

`check` 执行严格类型、金融/账号/API 测试、前端构建与格式检查。`data:fetch` 只下载清单中的公开报告并校验 SHA256，原始 PDF 不提交 Git。`data:samples` 生成结构化导入样例。扫描 PDF 和含糊表格需确认，不能虚构提取值。

财务报告默认使用规则，无需模型 API。公开企业查询初始启用已配置模型，界面说明外发范围并提供仅规则选项；报告解释另行选择。模型只通过服务端 `.env` 配置，参考 `.env.example`；公开研究仅发送所选公开证据；主动启用的财报解释另发送其已采用指标与短摘录，可能来自用户上传的财务材料。两者都不发送完整上传文件、私人事项说明、备注或现金计划。私有 CSV/JSON 现金计划在浏览器解析，采用后是待保存的计划条件，不是经认证的记录。引用 ID 与数值校验不能证明语义正确。检索覆盖配置的 A 股披露源，未接入须商业授权的工商数据服务。

账号、会话与各用户底稿保存在 `CASHLENS_DATA_DIR`（默认 `.cashlens`）。保留完整目录和认证密钥，部署或恢复前阅读[部署与备份说明](docs/deployment.md)。公网域名为 [prispect.com](https://prispect.com)，域名迁移与新域验收独立于历史发布记录；发布验证和适用范围见[验收记录](docs/acceptance.md)。当前为单进程产品，未测量生产容量或实现多节点高可用。SMTP 尚未配置，界面明确显示邮箱验证不可用。手机号作为可编辑、可清空的资料展示信息保存，无需短信验证码，不用于登录或找回密码。

主分支 CI 通过后，经受限 SSH 入口自动部署；包含归档与源码完整性检查、一致性状态备份和构建资产核对。仅当前认证数据库兼容旧版时允许失败回退。参见[自动部署说明](docs/actions-deployment.md)。

参见[方案](docs/plan.md)、[方法与数据调研](docs/research.md)、[API 合同](docs/api.md)、[数据链路交接](docs/data-lineage.md)、[参考方案鉴别](docs/reference-data-review.md)、[AI 使用披露](docs/ai-usage.md)及[赛事提交要求](docs/submission-checklist.md)。私有仓库徽章可能无法显示。

## 项目结构

```bash
prispect/
├── data/                           # 核验样本输入与来源清单
├── deploy/                         # HTTPS 反向代理配置
├── docs/                           # 方法、证据、交付与部署资料
├── public/                         # 本地品牌资源
├── scripts/                        # 开发与来源获取工具
├── server/                         # 认证、隔离存储与处理接口
├── shared/                         # 前后端共享类型合同
├── src/                            # 双语 React 网站
├── tests/                          # 金融计算、账号与接口验证
├── compose.yml                     # 单服务器持久化容器配置
├── Dockerfile                      # 可选容器构建
├── package-lock.json               # 精确依赖锁定
├── package.json                    # 运行与验证命令
├── start.command                   # macOS 启动入口
├── tsconfig.json                   # 严格 TypeScript 配置
└── vite.config.ts                  # 前端构建与本地接口代理
```

## 许可协议

本项目代码采用 [MIT 许可协议](LICENSE)，网站内容采用 [CC BY 4.0 许可协议](LICENSE-docs)。内容许可覆盖原创网站文字、文档与展示材料。第三方依赖、字体及公开财报保留原有权利；项目许可不授予这些财报的商业再分发权。参见[数据与素材来源](docs/sources.md)。
