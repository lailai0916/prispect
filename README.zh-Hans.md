<div align="center">
  <h1>Xuejun Hackathon</h1>
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

## 项目简介

团队参加学军中学「回响·48H 青年创造营」黑客松的项目仓库。目前已建立项目基础配置，参赛应用正在筹备开发。

## 项目特性

🗂️ **团队工作区** — 集中开发与评审团队的参赛项目。

🌐 **双语文档** — 英文与简体中文介绍保持一致，说明项目现状与准备步骤。

## 快速开始

安装 Node.js 22 与 npm，然后准备仓库：

```bash
git clone https://github.com/lailai0916/xuejun-hackathon.git
cd xuejun-hackathon
npm ci --ignore-scripts
npm run format:check
```

访问仓库需要具有权限的 GitHub 账号。使用 `npm run format` 格式化改动。应用运行说明将随实现补充。由于仓库为私有，部分仓库徽章可能无法显示。

## 项目结构

```bash
xuejun-hackathon/
├── package-lock.json               # 开发依赖锁定文件
└── package.json                    # 格式化命令与依赖
```

## 许可协议

本项目代码采用 [MIT 许可协议](LICENSE)。
