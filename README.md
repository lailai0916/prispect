<div align="center">
  <h1>Prispect</h1>
  <p><strong>English</strong> · <a href="README.zh-Hans.md">简体中文</a></p>
  <p>
    <img src="https://img.shields.io/github/actions/workflow/status/lailai0916/prispect/ci.yml?branch=main&style=flat-square" />
    <img src="https://img.shields.io/github/last-commit/lailai0916/prispect?style=flat-square" />
    <img src="https://img.shields.io/github/languages/top/lailai0916/prispect?style=flat-square" />
    <img src="https://img.shields.io/github/repo-size/lailai0916/prispect?style=flat-square" />
    <img src="https://img.shields.io/badge/code_style-prettier-ff69b4?style=flat-square" />
    <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
  </p>
</div>

## Website Introduction

Prispect (析光), operated by the Prispect team, starts from a company or a matter to investigate. Its public-evidence Agent checks annual profit, operating cash, relevant notes and recent disclosures, then identifies supported observations and unresolved questions. An external user can continue into a prepayment review; an incoming operator can examine a dated cash plan. Private records support their own conditional calculations. Historical financial signals never fill current cash or future receipts.

Built for the Xuejun High School “Echo · 48H Youth Creation Camp”, X-Ray direction. The core analytical question is deliberately narrow. Historical cash ratios are not company ratings, credit decisions, or investment advice. Customer demand and willingness to pay remain research assumptions.

Product information is available in the [user guide](https://xuejun.cc/#/docs), [product introduction](https://xuejun.cc/#/about), [privacy policy](https://xuejun.cc/#/privacy), [terms](https://xuejun.cc/#/terms) and [copyright notice](https://xuejun.cc/#/copyright). Policies describe the implemented service rather than certifying legal compliance. Contact: `lailai0x394@gmail.com`.

## Website Features

🔐 **Personal Accounts** — Better Auth registration, avatar and profile settings, password-strength checks, TOTP, one-use recovery codes, passkeys and session management. Materials, reviews and exports are scoped to their owner. Mail verification and recovery require SMTP; absent providers return unavailable.

🗂️ **Public Evidence Agent** — A LangGraph workflow checks official A-share annual reports, relevant notes and selected recent announcement originals in parallel. Constrained model actions select public candidate IDs for bounded follow-up; rules extract amounts and preserve conflicts. Failed or cancelled research can resume within 24 hours, with cumulative request budgets. Reviewed candidates become personal materials only after adoption.

🧮 **Reproducible Financial Analysis** — JSON, CSV and text-PDF preview; editable confirmation; period, currency and scope checks; exact integer-fen computation; persisted reports and questions.

🔎 **Evidence and Decision Versions** — A sourced cash bridge, page references and competing explanations lead to evidence requests. Payment decisions retain input/evidence versions, source-text bindings and known conflicts. Withdrawing direct evidence withholds dependent record calculations while keeping unrelated facts and explicitly entered assumptions.

🧪 **Payment Scenarios** — External scenarios compare undelivered exposure after proposed payments against a user-set limit. Internal scenarios compare specific payment dates, event balances, period ends and conditional payment/collection thresholds across listed 90-day events. Same-day order, coverage and negotiation assumptions remain visible. Missing inputs remain unknown.

🌐 **Bilingual Workflow** — Chinese and English product flows, documentation and policies. The language control shows the current language; appearance offers system, light and dark preferences, retained between visits. Materials, cash plans and avatars accept drag-and-drop with validation and retry. Printable HTML and versioned JSON exports remain available. Original source quotations retain their language.

## Getting Started

Use Node.js 22.12 or newer and npm. Access to this private repository requires authorization.

```bash
git clone https://github.com/lailai0916/prispect.git
cd prispect
npm ci
npm run build
npm start
```

Open `http://localhost:4317`, register with a hard-to-guess password of 12–128 characters, and enter a company or a matter to review. New accounts start with an empty workspace. On macOS, `start.command` performs the installation if needed, builds and starts the application. For development use `npm run dev` and open `http://localhost:4318`. Set `APP_ORIGIN` to the actual browser origin when using passkeys on a different port; production requires HTTPS and a persistent `BETTER_AUTH_SECRET`.

```bash
npm run check
npm run data:fetch
npm run data:samples
```

`check` runs strict types, financial/account/API tests, the client build and formatting checks. `data:fetch` downloads only manifest-listed public reports and verifies SHA256; the original PDFs are excluded from Git. `data:samples` prepares structured import examples. Scanned PDFs and ambiguous table values require confirmation rather than invented extraction.

Financial reports use rules by default and require no model API. Public company research initially enables the configured model with an on-screen data disclosure and a rules-only option; report explanation has a separate choice. Model configuration belongs only in the server `.env`, using `.env.example`. Public research sends only selected public evidence. An explicitly enabled financial-report explanation also sends its adopted metrics and short excerpts, which may come from user-uploaded financial material. Neither sends complete uploaded files, private review descriptions, notes or cash plans. Private CSV/JSON cash plans are parsed locally and adopted as draft conditions, not authenticated records. Citation-ID and numeric validation do not prove semantic correctness. Retrieval covers the configured A-share disclosure source, without a licensed commercial company-data integration.

Accounts, sessions and each user's working papers persist in `CASHLENS_DATA_DIR` (default `.cashlens`). Preserve the entire directory and authentication secret; read [deployment and backup notes](docs/deployment.md) before deployment or recovery. The public product is available at [xuejun.cc](https://xuejun.cc). Release checks and verification boundaries are recorded in [the acceptance report](docs/acceptance.md). This is a single-process product without measured production capacity or multi-node availability. SMTP remains unconfigured and SMS has no sending adapter; the interface reports unavailable verification without issuing fake codes.

Main-branch CI gates deployment through a restricted SSH entry, with artifact/source integrity checks, a consistent state backup and asset verification. Rollback is allowed only when the previous release can read the current authentication schema. See [automatic deployment](docs/actions-deployment.md).

See [the plan](docs/plan.md), [method and source research](docs/research.md), [API contract](docs/api.md), [data lineage](docs/data-lineage.md), [reference proposal review](docs/reference-data-review.md), [AI-use disclosure](docs/ai-usage.md) and [competition submission requirements](docs/submission-checklist.md). Private-repository badges may be unavailable.

## Project Structure

```bash
prispect/
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
