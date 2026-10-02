# Company research and analysis

The company workspace combines bounded public research with a reproducible financial screen. The configured OpenAI-compatible model (default `grok-4.7-fast`) plans additional reads and writes attributed judgments. It cannot change financial values, the screening method or the resulting grade. This document describes the implementation; it does not claim that a live Grok deployment has been independently verified.

## Flow and scope

1. Resolve a supported Shanghai/Shenzhen listed issuer and retrieve its public company snapshot. Automatic analysis starts after context retrieval; an account owner can also start or repeat research through `POST /api/company-runs/:id/assessment`.
2. Run the company research agent on a public copy. It inspects available evidence, requests supported tools, receives their actual results and decides whether another research turn is useful.
3. Derive the selected-year consolidated financial screen on the enriched copy. A separate model call produces a bilingual summary, six dimension judgments, strengths, risks, actions and conditions that would improve or weaken the judgment.
4. Publish only if the account-owned record, assessment revision and public snapshot still match. Refreshes or deletion invalidate an older job. Progress records contain actual start/finish events, outcomes and errors; they do not simulate percentage completion.

An optional research focus is an explicit instruction sent to the model, limited to 1,000 characters. It changes the research emphasis, not the company, accounting period or screening method. The agent is company-scoped rather than a general browser or code executor.

## Actual tools and budgets

| Tool                    | Behavior                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_financial_history` | Reads existing public annual history, computed metrics and provenance; does not adopt original-report candidates.                                                                                       |
| `fetch_industry`        | Retrieves the selected annual period's same-industry peers, at most once per research job; can reuse a complete matching snapshot less than 24 hours old.                                               |
| `search_disclosures`    | Searches the company's acquired announcement archive, capped at 1,200 records, returning at most 12 matching IDs. This is an archive search, not a new whole-web search.                                |
| `search_news`           | Queries Eastmoney with the confirmed company name and a validated topic. Reads the first page, up to 30 results, checks issuer names/codes and dates, and retains at most 48 deduplicated news records. |
| `read_disclosure`       | Accepts a known company announcement ID, never a supplied URL. Reads an allowed official PDF and preserves a page excerpt and file hash.                                                                |

The research phase allows **three model-planning turns, eight tool attempts, six new PDF reads and 120 seconds**. Its supplementary news/PDF reader permits **12 public requests**. Each PDF is limited to 8 MB, has a 45-second read deadline, and contributes only a selected excerpt from its first three pages, up to 1,500 characters. Previously read excerpts can be reused.

Server-owned `initialCalls` can execute supported, validated tools before model planning. These calls share the same eight-tool / 12-supplementary-request limits rather than receiving another budget. Explanation challenges use this path for deterministic financial, disclosure and news checks, plus up to two matching official-PDF reads. It also runs without a model key; the planning step then explicitly records that AI is unconfigured. See [the evidence lab and challenge method](evidence-lab.md).

Industry retrieval has its own bounded pagination and source-reader budget, subject to the research phase's cancellation signal; it is not included in the 12 supplementary requests. Initial context retrieval separately has a 90-second / 50-request budget. Final synthesis has a separate deadline of at most 60 seconds and permits one repair attempt for eligible format/citation failures. Consequently, 120 seconds is a research-phase limit, not an end-to-end latency promise.

## Data quality and isolation

Public annual history retains up to six periods. The screen fixes the requested full annual period and consolidated CNY basis; later annual/interim figures cannot replace it. Three-year context requires the selected year and its two immediately preceding years. Later news and announcements retain their own observation dates.

Wrong issuers, inconsistent duplicate rows, cross-source conflicts and unavailable fields withhold their dependent metrics. Amounts need public provenance; failed table receipts cannot be bypassed with retained values. Unsupported issuers and financial-sector businesses receive `NR`. Industry comparisons require matching issuer/year, complete same-year pagination and at least five valid peers per metric, excluding the target.

Evidence distinguishes third-party web fields, read disclosure excerpts and headlines. A title, news digest, empty search or retrieval failure does not establish default, misconduct or absence of risk. A file hash records retrieval integrity, not authenticity or the correctness of an interpretation. Historical monetary funds are not current available cash; operating cash is not sales receipts.

Model payloads are rebuilt from public allowlists. They exclude account identifiers, uploaded candidate previews, private working papers, payment decisions, cash plans and internal notes. Research supplements remain public snapshots and never become adopted original-report evidence automatically. Tools cannot change the issuer or accept arbitrary URLs. Model output must reference existing evidence/available metrics; numeric statements use server-rendered metric placeholders. Citation checks do not replace substantive review of an interpretation.

## Transparent financial screen

`financial-screen-v1` assigns equal 25% weights to four core dimensions. Amount calculations use integer cents; thresholds compare unrounded fractions. Display rounding does not determine scores.

| Dimension                | Screening rule                                                                                                                                                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profitability and growth | Positive profit with nondeclining revenue: 100; revenue decline up to 10%: 60; larger decline: 25. Zero profit: 25; loss: 0. Growth requires positive prior revenue.                                                                                                                                        |
| Operating cash quality   | With positive profit, cash/profit at least 100%: 100; at least 70%: 60; below 70%: 25; negative cash: 0. With nonpositive profit, the ratio is inapplicable: positive/zero/negative cash scores 60/25/0.                                                                                                    |
| Solvency and leverage    | Cash covering the two named short-debt fields at least 1x/0.5x/below 0.5x scores 100/60/25. Liabilities/assets at most 50%/70%/90%/above 90% scores 100/60/25/0. These signals are equally weighted; zero debt in both fields uses leverage alone. Other obligations and restricted funds are not resolved. |
| Working-capital pressure | Compare `(receivables + inventory) / revenue` with the prior year. A nonincrease scores 100; an increase up to 10 percentage points scores 60; a larger increase scores 25. This is not a bad-debt rate or cash-conversion cycle.                                                                           |

All four dimensions require their critical data without conflicts. Missing weights are never redistributed. A missing required field, invalid core denominator or excluded scope gives `NR` and a null aggregate score.

The arithmetic score initially maps to A ≥ 80, B ≥ 60, C ≥ 40, otherwise D. **One core dimension below 40 caps the final grade at C; two or more cap it at D.** The original arithmetic score remains visible, with `ratingConstraints` explaining the cap. Thus an 81.25 arithmetic score with a cash score of 25 receives C rather than A. These are transparent, uncalibrated screening rules, not official or credit-agency grades.

Industry position and events/governance complete the six analysis dimensions. They provide evidence-backed qualitative context without count-based penalties or automatic additions to the financial score. Grok can explain competing signals and priorities but cannot override the final grade.

## Fallback, caching and accounting

Unconfigured, failed or invalid model results preserve available public data and the deterministic screen. Unconfigured research still runs provided `initialCalls` and can attempt a bounded industry read; it does not claim AI planning occurred. Failed tools retain unknown states and truthful trace entries. Older saved results are not silently rewritten.

`model.calls` counts final-analysis request attempts, including failed/repair calls; `research.modelCalls` includes planning and synthesis attempts. `toolCalls` records attempted executions, including failed tools. A successful report alone is not evidence that all sources or calls succeeded.

Manual assessment starts/restarts are limited to **12 per hour per account**. Matching ready results are reused before charging this limiter. The assessment cache key includes issuer, selected year, snapshot time/revision, selected-year industry snapshot and research focus. A refresh or changed key requests new research; the cache does not relabel old observation dates as current. Concurrent starts reuse the existing job, while changing its focus requires that job to finish first.

Implementation: [`company-research-agent.ts`](../server/company-research-agent.ts), [`company-assessment.ts`](../server/company-assessment.ts), [`company-context-routes.ts`](../server/company-context-routes.ts), and [`shared/company-assessment.ts`](../shared/company-assessment.ts).

Source-backed runtime and browser checks are recorded separately in [the acceptance record](company-research-agent-acceptance-2026-10-02.md).
