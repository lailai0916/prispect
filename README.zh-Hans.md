<div align="center">
  <h1>lailai-template</h1>
  <p><a href="README.md">English</a> · <strong>简体中文</strong></p>
  <p>
    <img src="https://img.shields.io/github/actions/workflow/status/lailai0916/lailai-template/ci.yml?branch=main&style=flat-square" />
    <img src="https://img.shields.io/github/last-commit/lailai0916/lailai-template?style=flat-square" />
    <img src="https://img.shields.io/github/languages/top/lailai0916/lailai-template?style=flat-square" />
    <img src="https://img.shields.io/github/repo-size/lailai0916/lailai-template?style=flat-square" />
    <img src="https://img.shields.io/badge/code_style-prettier-ff69b4?style=flat-square" />
    <img src="https://img.shields.io/github/license/lailai0916/lailai-template?style=flat-square" />
  </p>
</div>

## 项目简介

开箱即用的 GitHub 仓库模板，统一维护仓库标准、初始化指南、双语 README 示例与校验工具。

## 项目特性

📄 **统一标准** — [SETUP.md](SETUP.md) 集中维护仓库命名、README、GitHub About、工程配置与验收要求。

🗺️ **持续维护** — 新项目保留简短的上游规范入口；初始化文档验收后清理，后续仍可查阅标准。

🧪 **集中校验** — Python 检查器可直接验证外部项目，规范与检查逻辑只在模板维护。

📮 **可用配置** — 提供双语文档、协作表单、Git 默认配置、Prettier 和 Agent 项目地图。

## 快速开始

点击 **Use this template** 创建仓库，完整阅读 [初始化指南](SETUP.md)，按实际项目替换内容并验收：

```bash
npm ci --ignore-scripts
npm run format:check
python3 scripts/check_repository.py --root . --initializing
python3 scripts/check_repository.py --root . --initializing --github
```

`--github` 使用 GitHub CLI 只读核对远端元数据。实际功能、翻译与部署仍需相应检查。

验收后删除新项目继承的 `SETUP.md`，保留上游链接，并将持续校验切换至模板的固定版本。
模板源仓库永久保留指南与测试。已有仓库维护同样查阅该指南，无需复制规范正文。

## 项目结构

```bash
lailai-template/
├── scripts/                        # 通用仓库校验工具
├── tests/                          # 迁移与初始化回归测试
├── package.json                    # 格式化命令与依赖
└── SETUP.md                        # 仓库标准与初始化指南
```

## 校验

```bash
python3 scripts/check_repository.py --root .
python3 -m unittest discover -s tests -v
npm run format:check
```

跨仓库使用方法、验收范围和初始化文件清理边界均由 [SETUP.md](SETUP.md) 维护。

## 许可协议

本项目代码采用 [MIT 许可协议](LICENSE)。
