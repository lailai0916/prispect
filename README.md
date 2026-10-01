<div align="center">
  <h1>CashLens</h1>
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

## Website Introduction

CashLens (照见) reviews the evidence for a specific company payment: an external prepayment or a new payment after taking over operations. Sourced annual profit and operating cash identify questions to investigate; private transaction records and dated cash plans support separate, conditional calculations. Historical financial signals never fill current cash or future receipts.

Built for the Xuejun High School “Echo · 48H Youth Creation Camp”, X-Ray direction. The core analytical question is deliberately narrow. Historical cash ratios are not company ratings, credit decisions, or investment advice. Customer demand and willingness to pay remain research assumptions.

## Website Features

🔐 **Personal Accounts** — Real registration, login, profile and password changes, expiring sessions, logout, and isolated materials, reviews and exports.

🗂️ **Public Evidence Agent** — Select an A-share company, retrieve its official annual report, retain the PDF and real tool history, and review extracted candidates before adoption. Optional constrained model planning selects evidence pages; deterministic checks keep missing inputs and source conflicts visible.

🧮 **Reproducible Financial Analysis** — JSON, CSV and text-PDF preview; editable confirmation; period, currency and scope checks; exact integer-fen computation; persisted reports and questions.

🔎 **Evidence and Decision Versions** — A sourced cash bridge, page references and competing explanations lead to evidence requests. Payment decisions retain input/evidence versions, source-text bindings and known conflicts. Withdrawing direct evidence withholds dependent record calculations while keeping unrelated facts and explicitly entered assumptions.

🧪 **Payment Scenarios** — External scenarios compare undelivered exposure after proposed payments against a user-set limit. Internal scenarios compare specific payment dates, event balances, period ends and conditional payment/collection thresholds across listed 90-day events. Same-day order, coverage and negotiation assumptions remain visible. Missing inputs remain unknown.

🌐 **Bilingual Workflow** — Chinese and English home, decisions, workspace, imports, reports, comparison, account and methodology flows; automatic system light/dark themes; printable HTML and versioned JSON exports. Original source quotations retain their language.

## Getting Started

Use Node.js 22.12 or newer and npm. Access to this private repository requires authorization.

```bash
git clone https://github.com/lailai0916/xuejun-hackathon.git
cd xuejun-hackathon
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:4317`, register your own account with a password of at least 10 characters, and start a review. On macOS, `start.command` performs the installation if needed, builds and starts the application. For development use `npm run dev` and open `http://127.0.0.1:4318`.

```bash
npm run check
npm run data:fetch
npm run data:samples
```

`check` runs strict types, financial/account/API tests, the client build and formatting checks. `data:fetch` downloads only manifest-listed public reports and verifies SHA256; the original PDFs are excluded from Git. `data:samples` prepares structured import examples. Scanned PDFs and ambiguous table values require confirmation rather than invented extraction.

The default mode uses real deterministic processing and requires no model API. Company research and report explanation each require their own explicit model choice. Optional model configuration belongs only in the server `.env`, using `.env.example`. No model credentials are included. Models receive only the permitted evidence for that operation, never private notes or manual cash plans; citation-ID and numeric validation do not prove semantic correctness. Public retrieval covers the configured A-share disclosure source, without a licensed commercial company-data integration.

Accounts, sessions and each user's working papers persist in `CASHLENS_DATA_DIR` (default `.cashlens`). Keep the entire directory and read [deployment and backup notes](docs/deployment.md) before deploying or restoring it. The public product is available at [xuejun.cc](https://xuejun.cc), with HTTPS, persistent accounts and working papers. Release checks and verification boundaries are recorded in [the acceptance report](docs/acceptance.md). This is a single-process early product, without email verification, password-reset mail, multi-node availability or measured production capacity.

Main-branch CI gates deployment through a restricted SSH entry, with artifact/source integrity checks, a consistent state backup, asset verification and automatic rollback. See [automatic deployment](docs/actions-deployment.md).

See [the plan](docs/plan.md), [method and source research](docs/research.md), [API contract](docs/api.md), [AI-use disclosure](docs/ai-usage.md) and [competition submission requirements](docs/submission-checklist.md). Private-repository badges may be unavailable.

## Project Structure

```bash
xuejun-hackathon/
├── data/                           # Verified sample inputs and source manifest
├── deploy/                         # HTTPS reverse-proxy configuration
├── docs/                           # Method, evidence, delivery and deployment notes
├── public/                         # Local brand assets
├── scripts/                        # Development and source-fetch utilities
├── server/                         # Authentication, isolated storage and analysis API
├── shared/                         # Typed contracts between client and server
├── src/                            # Bilingual React application
├── tests/                          # Financial, account and API verification
├── compose.yml                     # Persistent single-server container configuration
├── Dockerfile                      # Optional container build
├── package-lock.json               # Exact dependency lock
├── package.json                    # Runtime and verification commands
├── start.command                   # macOS startup shortcut
├── tsconfig.json                   # Strict TypeScript configuration
└── vite.config.ts                  # Client build and local API proxy
```

## License

This project's code is licensed under [MIT License](LICENSE), and this website's content is licensed under [CC BY 4.0](LICENSE-docs). The content license covers original website text, documentation and presentation material. Third-party libraries, fonts and disclosed financial reports retain their original rights; neither project license grants commercial redistribution rights to those reports. See [sources and notices](docs/sources.md).
