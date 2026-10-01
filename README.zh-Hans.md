<div align="center">
  <h1>CashLens</h1>
  <p><a href="README.md">English</a> · <strong>简体中文</strong></p>
  <p>
    <img src="https://img.shields.io/github/actions/workflow/status/lailai0916/xuejun-hackathon/ci.yml?branch=main&style=flat-square" />
    <img src="https://img.shields.io/github/last-commit/lailai0916/xuejun-hackathon?style=flat-square" />
    <img src="https://img.shields.io/github/languages/top/lailai0916/xuejun-hackathon?style=flat-square" />
    <img src="https://img.shields.io/github/repo-size/lailai0916/xuejun-hackathon?style=flat-square" />
    <img src="https://img.shields.io/badge/code_style-prettier-ff69b4?style=flat-square" />
    <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
  </p>
</div>

## 网站简介

照见 CashLens 将年度合并财务证据转成可重算的现金兑现核查底稿，帮助采购与经营负责人比较净利润和经营现金、追溯原件，并提出具体补件问题。

本项目参加学军中学「回响·48H 青年创造营」X-Ray 方向，聚焦一个明确问题。历史现金比例不代表企业评级、授信决策或投资建议。用户需求与付费意愿仍属于研究假设。

## 网站特性

🔐 **个人账号** — 真实注册、登录、资料设置、改密、会话过期与退出；材料、核查和导出按用户隔离。

🧮 **可重算的财务处理** — JSON、CSV 与文本 PDF 预览、可编辑确认、期间/币种/口径检查、整数分精确计算，以及持久保存的报告和问题单。

🔎 **证据与继续询证** — 现金桥、原文页码、分组组成和两种可能解释。撤去证据会新建核查并撤回失去支持的解释，不从隐藏观测补数。

🌐 **双语完整流程** — 中英文首页、工作台、导入、报告、比较、账号和方法页面，以及可打印 HTML 和 JSON 导出；原文引用保留源语言。

## 快速开始

使用 Node.js 22.12 或更新版本及 npm。访问本私有仓库需要授权。

```bash
git clone https://github.com/lailai0916/xuejun-hackathon.git
cd xuejun-hackathon
npm ci
npm run build
npm start
```

打开 `http://127.0.0.1:4317`，自行注册账号（密码至少 10 个字符），然后开始核查。macOS 可以双击 `start.command`：缺依赖时安装，再构建并启动。开发使用 `npm run dev`，打开 `http://127.0.0.1:4318`。

```bash
npm run check
npm run data:fetch
npm run data:samples
```

`check` 执行严格类型、金融/账号/API 测试、前端构建与格式检查。`data:fetch` 只下载清单中的公开报告并校验 SHA256，原始 PDF 不提交 Git。`data:samples` 生成结构化导入样例。扫描 PDF 和含糊表格需确认，不能虚构提取值。

默认模式为真实确定性处理，无需模型 API。可选模型只通过服务端 `.env` 配置，参考 `.env.example`；仓库不含凭据。模型只收到允许的证据，引用 ID 与数值校验不能证明语义正确。

账号、会话与各用户底稿保存在 `CASHLENS_DATA_DIR`（默认 `.cashlens`）。保留完整目录，部署或恢复前阅读[部署与备份说明](docs/deployment.md)。用户已授权 xuejun.cc 公网部署，实际状态会写入验收记录。当前为单进程早期产品，未提供邮箱验证、邮件找回密码、多节点高可用或经过测量的生产容量。

参见[方案](docs/plan.md)、[方法与数据调研](docs/research.md)、[API 合同](docs/api.md)、[AI 使用披露](docs/ai-usage.md)及[赛事提交要求](docs/submission-checklist.md)。私有仓库徽章可能无法显示。

## 项目结构

```bash
xuejun-hackathon/
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
