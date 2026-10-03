# Evidence lab and explanation challenges

The lab makes dependencies inspectable: source facts feed exact calculations, those calculations motivate competing explanations, and missing materials define how to distinguish them. A connection to an explanation is a reason to investigate, not a causal conclusion.

## Two evidence origins

| Origin                       | Available calculations                                                                                                                | Boundary                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved original reports       | Consolidated profit, operating cash, signed cash-flow supplementary adjustments, comparable growth and a checked cash bridge          | Engine scope, source and grouping checks remain authoritative. Missing adjustment groups or a nonzero reconciliation difference withhold the bridge. |
| Company public-web snapshots | Selected-year consolidated amounts, cash/profit, profit less cash, revenue growth, inventory and receivables year-end balance changes | Web fields are not adopted originals. Balance changes cannot substitute for cash-flow supplementary adjustments or construct a cash bridge.          |

Saved original-report labs come from actual adopted financial reports and the original-report calculation engine. Both graph origins preserve exact integer-cent amounts, nonpositive ratio denominators, missing inputs, conflicts and source quality.

For the 2025 Songyuan example, the inventory adjustment is −321,030,062.96 CNY and the operating-receivables adjustment is −514,221,076.54 CNY. These are signed supplementary-table adjustments, not increases in year-end inventory or receivables balances. Their negative signs show how the reconciliation reduces operating cash, without proving why the change occurred.

## Local withdrawal

`shared/evidence-lab.ts` derives a graph with four node kinds: facts, calculations, hypotheses and material requests. Selecting a node highlights its ancestors and descendants; sibling explanations are not treated as dependencies. An `available` hypothesis has its required inputs; this status does not mean that the explanation was tested or proved.

Only facts can be withdrawn. The trial clones the baseline graph, clears the withdrawn node's usable value and pauses dependent calculations and hypotheses. Independent facts remain readable. Restoring a fact reevaluates the same baseline, including any original missing/conflicting states; restoration cannot repair unavailable evidence. Cycles also pause calculations.

This trial runs locally. It makes no model request, changes no saved report, grade or adopted evidence, and sends no withdrawal state to the challenge API. Requested materials remain readable when a hypothesis pauses. Their graph status is `materialStatus: "needed"`; this means a request exists, not that a document has been acquired.

## Fixed explanation challenges

Authenticated company workspaces can ask the server to challenge one of three defined hypotheses:

| Target                | Competing explanation                                    | Distinguishing materials, still not obtained                                                           |
| --------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `expansion`           | Expanded stocking versus inventory sell-through pressure | Inventory composition, aging and impairment; order execution and subsequent deliveries/sales           |
| `inventory-pressure`  | Slower sell-through versus normal stocking for expansion | Inventory categories, aging and subsequent sell-through; net realizable value and impairment tests     |
| `collection-pressure` | Collection pressure versus normal settlement timing      | Subsequent collections and receivables aging; customer credit terms, contracts and performance records |

The server creates a fixed research goal from the target. It first reads public financial history, searches the acquired disclosure archive, performs two actual targeted news searches and reads up to two matching known official-PDF IDs. The configured Grok-compatible model may plan further supported tools using the remaining budget, then organizes attributed supporting and counter clues. Initial reads occur even without a model key; in that case the planning trace explicitly reports unconfigured AI and the rule clues remain available.

Initial and planned actions share the current research limits in [the research-agent method](company-research-agent.md), including tool attempts, public requests and the research deadline. Challenges do not receive an additional budget. Official PDFs are limited to 8 MB and first-three-page excerpts. Industry and final synthesis have separately described budgets.

Rule clues compare source-bound same-year/prior-year amounts and relative inventory or receivables occupation. They indicate compatibility or counterevidence, not confirmed causes. The challenge returns `supporting-clues`, `counter-clues`, `mixed-clues` or `unresolved`; these states describe which clues were obtained. Neither side is fabricated to create symmetry. `distinguishingMaterials` retain `availability: "not-obtained"`, including after successful model synthesis.

Every model clue must reference provided evidence or available metrics with provenance. Numeric text uses server-rendered metric tokens. Headline-only references must remain news/title clues, and missing documents cannot become claims that no risk exists. There is no confidence percentage, new credit grade or causal certification. Model failure preserves actual public reads, rule clues, gaps and the real request/step counts.

## API, cache and publication boundaries

All challenge routes operate on the current account's company record and use the application's session/CSRF protections. Client input is limited to the fixed target and refresh flag; arbitrary URLs, free-form private notes and local trial state are rejected.

| Request                                                                     | Result                                                                                  |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `GET /api/company-runs/:id/challenge`                                       | `{ challenge, stale }`, including actual trace and retained result when present         |
| `POST /api/company-runs/:id/challenge` with `{ target, refresh?: boolean }` | `202` for a new/in-progress job, or `200` for a matching ready cached result            |
| `POST /api/company-runs/:id/challenge/cancel` with `{}`                     | Cancels the active job, marks unfinished steps failed and prevents new clue publication |

Starts are limited to six per hour per account, with at most two challenge jobs across the process. Cache hits do not consume another start. A same-target in-progress request reuses the job; changing targets while it runs returns a conflict. Public-context or assessment updates must finish before starting a challenge.

The SHA256 cache key includes issuer, organization, selected year, target, context revision, complete public context and selected-year industry snapshot. It has no independent expiry; explicit refresh repeats research. In-place source changes invalidate the hash even if timestamps remain unchanged. Results are published only while record identity, revision and exact snapshot hash still match. Deleted, cancelled or superseded jobs cannot publish late results. A same-target, same-snapshot retry may retain its last result; another target or changed snapshot does not inherit it.

Challenge research runs on a public copy. Supplements and results do not overwrite the saved company's context, industry snapshot, assessment or grade, and never adopt a material. Payloads exclude uploaded previews, private plans, payment records, internal notes, prior questions and local withdrawal choices. Inspect source dates before applying a later disclosure to an older financial period.

## Walkthrough

1. On the homepage, select the 2025 Songyuan original-report example and inspect a fact's source page and excerpt.
2. Withdraw the inventory adjustment. Its calculation, expansion/inventory hypotheses and full cash bridge pause. Cash/profit and the independent collection hypothesis remain available because they do not depend on that adjustment.
3. Restore the fact. The checked amounts and dependency paths return without changing a saved record or requesting AI.
4. Open a saved company's lab. Inspect inventory/receivables **balance changes** and their web provenance; no cash bridge is created from them.
5. Select an explanation and start its challenge. Follow the actual financial, news, disclosure and PDF steps, then inspect supporting/counter clues and the still-unobtained materials. Missing configuration, failed sources and cancelled jobs remain explicit.

Original excerpts, cited IDs and a balanced equation do not authenticate an uploaded document or prove an interpretation. The lab and challenge organize investigation; they do not establish current cash, payment safety, bad debt or the sole cause of a historical cash gap. Validation and any live-provider/browser acceptance belong in separate records, not in the result's evidence claims.

Implementation: [`shared/evidence-lab.ts`](../shared/evidence-lab.ts), [`shared/company-challenge.ts`](../shared/company-challenge.ts), [`server/company-challenge.ts`](../server/company-challenge.ts), and [`server/company-challenge-routes.ts`](../server/company-challenge-routes.ts).
