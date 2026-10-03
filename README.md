<div align="center">
  <h1>Prispect</h1>
  <p>Make company judgments traceable.</p>
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

Current company research supports A-share issuers, and financial checks use annual consolidated CNY evidence. New US-market research is paused; account-owned historical records and retained originals remain accessible. Unsupported currencies are preserved in their original units, without exchange-rate conversion or CNY reinterpretation.

Built for the Xuejun High School “Echo · 48H Youth Creation Camp”, X-Ray direction. The original cash bridge answers a narrow financial question; the company research Agent adds broader public-data analysis. A single historical cash ratio is not an overall grade. Prispect's transparent financial screening grade is not a credit-agency rating, credit decision or investment advice. Customer demand and willingness to pay remain research assumptions.

The [documentation hub](https://prispect.com/docs) links to six articles: [About Prispect](https://prispect.com/docs/about), [User guide](https://prispect.com/docs/guide), [Review methodology](https://prispect.com/docs/methodology), [Privacy policy](https://prispect.com/docs/privacy), [Terms of service](https://prispect.com/docs/terms) and [Copyright notice](https://prispect.com/docs/copyright). Previous article URLs and guide section links remain compatible. Policies describe the implemented service rather than certifying legal compliance. Contact: `lailai0x394@gmail.com`.

Validation uses the full local check and browser interaction replays; provider checks and production release verification are tracked separately. See [the reconstruction plan and acceptance tasks](docs/rebuild-plan.md) and [production capacity record](docs/production-capacity-2026-10-03.md) for scope, evidence and release readiness.

The [version-pinned competitive engineering record](docs/competitive-research/README.md) contains five repository studies, the complete value inventory, design alternatives, implementation mapping and before/after acceptance. Its evidence distinguishes live requests, cached results, synthetic fixtures and unavailable providers. Improvements include explicit statement-to-evidence review, separate trading and responsible entities, adjacent decision-version changes, inverse payment constraints, known source relationships, a source-bound research framework, optional evidence-dependency practice and static offline decision exports. These mechanisms do not authenticate documents, approve payment or turn source counts into confidence.

## Website Features

🔎 **Public Homepage** — A continuous spatial scroll story separates real annual-report papers from a glass inspection surface, assembles original rows into a signed cash bridge, and presents untested explanations before the existing research entry. Dynamic WebGL renders transitions; accessible DOM/SVG supplies reading holds and static fallback. Chinese and English retain the same evidence. See [the homepage implementation](docs/cinematic-home.md).

🔍 **Evidence Review and Action Feedback** — Evidence drawers connect stored excerpts to their supported fields and separate calculated metrics from quoted values. Selected financial fields expose both recorded source amounts, scope and differences in the same drawer. Payment exposure has an on-demand explanation using the current branch's amounts, and editing a saved item marks meaningful changes as pending recalculation. Research in progress or after failure retains links to acquired data and its actual dates; cancelling a specific public-research revision preserves sources and reports, and late callbacks cannot overwrite a retry. Assistant suggestions fill an editable draft, while dependency practice distinguishes missed and extra predictions and exposes actual dependency paths. These enhance existing flows; universal PDF sentence localization and account-wide material full-text search are not implemented.

🔐 **Personal Accounts** — Better Auth registration, avatar and profile settings, password-strength checks, TOTP, one-use recovery codes, passkeys and session management. Materials, reviews and exports are scoped to their owner. Mail verification and recovery require SMTP; absent providers return unavailable.

🏢 **Research Library and Company Workspace** — The primary navigation opens New research and Research library; Materials, Payments and handovers, Financial reviews and Compare reviews share Review tools. `/research` lists the current account's actual company records with a lightweight saved statement, financial grade, timestamp and stale/model status when available; local search and filters do not start research. Navigation, recent research and the library share one account-scoped record subscription. Each company has four destinations: Research report, Financial analysis, Sources and references and Original-document review. Read the judgment and next checks first, inspect supporting financials or sources, then confirm and adopt originals when needed. Financial history and industry comparison share Financial analysis; news, discussions, announcements, company facts, coverage and source comparison share Sources and references. Legacy topic links focus their corresponding merged content. Existing company, original-report and private-decision links remain compatible. Loaded-company rows have a one-click × to delete the query and its answers while preserving adopted materials; active work must finish first.

📄 **One Company Report** — Queries open a single central report led by a direct, source-linked judgment, a prominent financial grade, consolidated profit, operating cash and their ratio. Incomplete financials can show a separately labeled provisional grade from independently supported dimensions, with their coverage and no complete score out of 100. At most three key findings lead into next checks. Source coverage and four real stages—gathering sources, targeted research, forming judgments and reviewing contrary evidence—are visible upfront; states, attempts and times come from recorded events. Evidence, explanation testing and challenges have direct entry points, with six-dimension analysis and calculations expandable within the report. Complete financial data and industry comparison open Financial analysis; news, announcements and source checks open Sources and references; candidate confirmation and adoption open Original-document review. There are no Plain/Pro or public/management reading modes. Attributable/consolidated profit controls and external-payment/internal-handover purposes remain available; the financial screen and original cash bridge use their specified consolidated basis. Saved original reports and comparison keep their source-linked, progressively disclosed records. Web fields remain separate from adopted original evidence.

📰 **Source Reader** — News and public discussions initially show six items. Expanding exposes local keyword, media and content-scope filters, date sorting and twelve-item pages, with a list beside the selected source text. Narrow screens retain a usable source-reading action. Titles, digests and actually retrieved excerpts remain distinct; filtering the saved catalog makes no model or public-source request.

🧭 **Research Entry and Questions** — The entry preserves the current owner's draft through navigation and confirms a matched issuer before starting saved research. Public company codes and short names match a preloaded directory; misses use bounded live search. Enter starts matching immediately, and ambiguous results retain a selection step. The lower-right Prispect assistant has one conversation for researched companies, product help and policy details. It resolves company context automatically, follows up with bounded public retrieval when needed, and cites actual company sources or canonical product documents. Signed-out questions search product documents without a model or private workspace access. Signed-in answers use the configured model, retaining truthful rule answers or document excerpts on failure.

🗂️ **Public Evidence Agent** — A LangGraph workflow checks official A-share annual reports, relevant notes and selected recent announcement originals in parallel. A separate audit-opinion lookup retains original wording, PDF pages and scope clues without rating the auditor's opinion or the company. Constrained model actions select public candidate IDs for bounded follow-up; rules extract amounts and preserve conflicts. Failed or cancelled research can resume within 24 hours, with cumulative request budgets. Reviewed candidates become personal materials only after adoption. Official annual-report originals have a separate 100 MiB limit; user uploads and selected recent announcements remain limited to 25 MiB. Recent announcement reading has a shared 45-second budget and reports incomplete coverage. Cash-supplement extraction uses explicit issuer, year, consolidation and unit evidence, plus PDF table cells to retain a disclosed year when the other cell is blank. Blank values stay unknown; a reconciliation difference stops the cash bridge. See the [real-company algorithm regression record](docs/algorithm-verification-2026-10-02.md).

📊 **Financial History** — Three anonymous Eastmoney web requests retrieve up to six annual periods alongside official report research. Four thematic groups each contain four metric cards; All charts reveals the complete layout. Amount bars, ratio lines and debt-component dumbbells use the shared neutral chart system. Profit and operating cash share an amount scale, and each card's values, difference and axis use consistent units. Short-term borrowing and current portions of noncurrent liabilities retain their separate observations and peer cohorts; inventory and receivables remain in a funds-use disclosure. The selected year links historical summaries and industry comparison without fetching on selection; adding peer references explicitly retrieves one annual cohort. Cards separate the primary company and peer values from their difference and sample count. Industry cards link directly to the selected metric's peer distribution and retain medians, full comparison data and source drawers. Consolidated and attributable profit remain distinct; legacy or incomplete peer snapshots remain unknown. Exact amounts and source receipts remain accessible. Missing or conflicting fields stay unknown and web fields are never adopted automatically. See the [teammate chart adaptation](docs/teammate-financial-charts.md).

🧮 **Reproducible Financial Analysis** — JSON, CSV and text-PDF preview; editable confirmation; period, currency and scope checks; exact integer-fen computation; persisted reports and questions. Two-period profit and operating-cash changes retain source references for both periods and exact formulas. Percentage growth requires a positive prior-year base; conflicts withhold comparisons. Original-report input or currency conflicts mean evidence needs review and pause dependent interpretation; they do not establish company risk or a company rating. Public news and discussion analysis stays in the existing company research record, without a separate reputation RSS request when opening an original report.

🔎 **Evidence and Decision Versions** — A sourced cash bridge, page references and competing explanations lead to evidence requests. Combined rules save whether their conditions hold, do not all hold or cannot yet be evaluated, with dependencies and source-backed gaps. Each combined signal offers a single-dependency review and a copyable evidence request for an external payer or incoming operator. Payment decisions retain input/evidence versions, source-text bindings and known conflicts. Withdrawing direct evidence withholds dependent record calculations while keeping unrelated facts and explicitly entered assumptions.

🧪 **Payment Scenarios** — External scenarios compare undelivered exposure after proposed payments against a user-set limit. Internal scenarios compare specific payment dates, event balances, period ends and conditional payment/collection thresholds across listed 90-day events. Same-day order, coverage and negotiation assumptions remain visible. Missing inputs remain unknown.

🌐 **Bilingual Workflow** — Chinese and English product flows, documentation and policies. The language control shows the current language; appearance follows the system on page load and system changes, with a one-click light/dark toggle available anytime. Materials, cash plans and avatars accept drag-and-drop with validation and retry. Reports expose payment and handover priorities with sourced, ordered evidence requests and suggested contacts. HTML, JSON and Markdown checklists are previewed before saving; the saved content is the previewed snapshot. Original source quotations retain their language.

⌨️ **Workspace Details** — Header search and ⌘ K / Ctrl K jump to pages, saved companies, reports and materials in the current account. List filters show counts; searches clear with Escape, reviews can be sorted, and material results open at the matched record. Shared controls, empty states, loading placeholders and brief transitions respect reduced motion. Success notices pause on hover, focus or hidden tabs; errors remain until dismissed. Export previews confirm download initiation without claiming a file was saved to disk.

🧠 **Company Research Agent** — New public snapshots start bounded research: paginated Eastmoney/Sina news and the issuer's public Guba board, followed by model-selected financial, peer, topic and source-text checks. Up to 180 deduplicated news records and 240 public posts are retained; actual body excerpts are distinguished from catalog titles and digests. Public posts remain unverified opinions, and reposts do not establish independent corroboration. Users can supply a research goal; actual steps, failures, text limits and source coverage remain visible. Six-dimension judgments connect strengths, risks, follow-up checks and reassessment conditions to inspectable metrics and sources. A separate model pass checks the broad-source draft against counterarguments and source attribution, with a warning if that pass fails. The model cannot change the financial grade. Missing configuration or invalid output retains rule analysis. See [the workflow and method](docs/company-research-agent.md).

💹 **Company Identity and Market Snapshot** — Issuer identity, business details and an attempted Eastmoney quote remain available without duplicating the report's judgment. Prices, changes, market cap and source quote time retain source precision. Missing or blocked fields stay unavailable; a retrieved snapshot is not guaranteed to be real-time and does not alter the selected-year financial grade.

📐 **Transparent Analysis Grade** — Selected-year consolidated profitability, cash quality, solvency and working capital have equal weights. Weak dimensions cap the overall grade; missing or conflicting required inputs leave the complete grade as NR. Independently supported dimensions may produce a read-only provisional grade using their observed-score mean and the same caps, with explicit coverage and no changes to the saved complete grade. Peer and event analysis provide separate context. Formulas and sources remain inspectable in the report, with full grading criteria in the methodology document; a headline alone cannot establish an adverse event.

🔬 **Evidence Lab** — Inspect the links between source facts, calculations, competing explanations and requested materials. Temporarily withdraw or restore a fact to pause only its dependent paths. Company web snapshots use year-end balance changes. Trials run locally without model calls or changes to saved evidence, reports or grades. See [the method and walkthrough](docs/evidence-lab.md).

🧭 **Challenge an Explanation** — For a saved company, examine expansion stocking, inventory sell-through pressure or collection pressure through actual targeted public searches and bounded official-PDF reads. The configured model organizes supporting and counter clues with source links and clearly unobtained distinguishing materials. Missing configuration still permits the fixed public research steps and rule clues; failures do not become invented results or confidence scores. Local withdrawal state and private working papers are excluded from challenge inputs.

## Getting Started

Use Node.js 22.12 or newer and npm. Access to this private repository requires authorization.

```bash
git clone https://github.com/lailai0916/prispect.git
cd prispect
npm ci
npm run build
npm start
```

Open `http://localhost:4317`, register with a hard-to-guess password of 8–128 characters, and enter a company or a matter to review. New accounts start with an empty workspace. On macOS, `start.command` performs the installation if needed, builds and starts the application. For development use `npm run dev` and open `http://localhost:4318`. Set `APP_ORIGIN` to the actual browser origin when using passkeys on a different port; production requires HTTPS and a persistent `BETTER_AUTH_SECRET`.

```bash
npm run check
npm run data:fetch
npm run data:samples
```

`check` runs strict types, financial/account/API tests, the client build and formatting checks. `data:fetch` downloads only manifest-listed public reports and verifies SHA256; the original PDFs are excluded from Git. `data:samples` prepares structured import examples. Scanned PDFs and ambiguous table values require confirmation rather than invented extraction.

Financial amounts and calculations use rules. New company queries, company questions and financial-report explanations use the configured server-side model, including copies, resumptions and retries. When a model is unconfigured, evidence is missing or conflicting, or a call fails, rule results remain available with the actual status. Model configuration belongs only in the server `.env`, using `.env.example`; data-use details are in the privacy policy and user guide. Company research sends the explicit research goal and selected public evidence, including dated news and public-discussion titles, digests and retrieved excerpts; company questions send the question and selected public context. Financial-report explanations send adopted metrics and short excerpts, which may come from user-uploaded financial material. Neither sends complete uploaded files, private review descriptions, notes or cash plans. Signed-out document help makes no model calls; signed-in assistant questions can send the question, up to four prior questions and relevant product documents, plus allowlisted public evidence for company questions. Private CSV/JSON cash plans are parsed locally and adopted as draft conditions, not authenticated records. Citation-ID and numeric validation do not prove semantic correctness. Retrieval uses configured A-share disclosure, Eastmoney financial/market/news/Guba and Sina public sources. It does not implement whole-web or X search or a licensed commercial company-data integration. Public-source access can fail; the service retains its actual coverage rather than fabricating missing results.

Accounts, sessions and each user's working papers persist in `CASHLENS_DATA_DIR` (default `.cashlens`). Preserve the entire directory and authentication secret; read [deployment and backup notes](docs/deployment.md) before deployment or recovery. The public product domain is [prispect.com](https://prispect.com). Domain migration and live verification are tracked separately from historical releases. Release checks and verification boundaries are recorded in [the acceptance report](docs/acceptance.md). This is a single-process product without measured production capacity or multi-node availability. SMTP remains unconfigured and the interface reports unavailable email verification. A display phone number can be edited or cleared in Profile without SMS verification; it is not used for sign-in or password recovery.

Main-branch CI gates deployment through a restricted SSH entry, with artifact/source integrity checks, a consistent state backup and asset verification. New packages retain hashed frontend assets from the three nearest successful main-push CI ancestors so browsers opened before an update can still load those pages. Entry HTML stays current; clients outside that window or after a rollback may need to reload. Rollback is allowed only when the previous release can read the current authentication schema. See [automatic deployment](docs/actions-deployment.md).

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
