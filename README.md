<div align="center">
  <h1>Xuejun Hackathon</h1>
  <p><strong>English</strong> · <a href="README.zh-Hans.md">简体中文</a></p>
  <p>
    <img src="https://img.shields.io/github/actions/workflow/status/lailai0916/xuejun-hackathon/ci.yml?branch=main&style=flat-square" />
    <img src="https://img.shields.io/github/last-commit/lailai0916/xuejun-hackathon?style=flat-square" />
    <img src="https://img.shields.io/github/languages/top/lailai0916/xuejun-hackathon?style=flat-square" />
    <img src="https://img.shields.io/github/repo-size/lailai0916/xuejun-hackathon?style=flat-square" />
    <img src="https://img.shields.io/badge/code_style-prettier-ff69b4?style=flat-square" />
    <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
  </p>
</div>

## Project Introduction

The team's project workspace for the Xuejun High School “Echo · 48H Youth Creation Camp” hackathon. The repository currently contains the project foundation; the competition application is being prepared for development.

## Project Features

🗂️ **Team Workspace** — A shared repository for developing and reviewing the team's competition project.

🌐 **Bilingual Documentation** — English and Simplified Chinese introductions describe the same project status and setup.

## Getting Started

Install Node.js 22 and npm, then prepare the repository:

```bash
git clone https://github.com/lailai0916/xuejun-hackathon.git
cd xuejun-hackathon
npm ci --ignore-scripts
npm run format:check
```

Repository access requires a GitHub account with permission. Run `npm run format` to format changes. Application setup instructions will be added with the implementation. Repository badges may be unavailable because the repository is private.

## Project Structure

```bash
xuejun-hackathon/
├── package-lock.json               # Locked development dependencies
└── package.json                    # Formatting commands and dependencies
```

## License

This project's code is licensed under [MIT License](LICENSE).
