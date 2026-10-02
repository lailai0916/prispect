# API contract

The canonical types live in `shared/contracts.ts`, `shared/company-contracts.ts` and `shared/decision-contracts.ts`. Success responses are direct JSON objects; failures use `{ error, code }` and a non-2xx status. Exports and source PDFs return files. The browser and API share an origin.

## Accounts and access

| Method and path                            | Input                              | Response / effect                                                  |
| ------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------ |
| GET /api/auth/session                      | —                                  | `AuthSession`; anonymous returns null user and token               |
| POST /api/auth/register                    | `{ email, password, name }`        | New account, session cookie, user and CSRF token                   |
| POST /api/auth/login                       | `{ email, password }`              | Session cookie, user and CSRF token                                |
| POST /api/auth/logout                      | —                                  | Revokes the current session                                        |
| PATCH /api/auth/profile                    | `{ name }`                         | Updates the current user's profile                                 |
| POST /api/auth/password                    | `{ currentPassword, newPassword }` | Changes password, revokes old sessions, issues new current session |
| GET /api/public/examples                   | —                                  | Verified public historical sample summaries and sources            |
| GET /api/public/input-template?format=json | —                                  | A downloadable structured JSON example                             |
| GET /api/public/input-template?format=csv  | —                                  | A downloadable CSV example                                         |

Authenticated writes send `X-CSRF-Token` returned by the session endpoint. Authentication uses a server-side session with an HttpOnly cookie; no password or session bearer is placed in browser localStorage. The user ID comes from the session, never from a client-provided tenant selector. Workspace, materials, tasks, questions, exports, local PDF sources and reset require login and are scoped to that user where applicable. Public health, cases and examples do not expose private workspace records.

There is no fake password-reset email service. Email is a login identifier; this version does not claim email-address verification or deliverability. Production configuration and operational limitations are documented separately.

## Evidence workflow

| Method and path                            | Input                                                     | Response / effect                                       |
| ------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------- |
| GET /api/health                            | —                                                         | `{ ok: true }`                                          |
| GET /api/workspace                         | —                                                         | Current user's `Workspace`                              |
| GET /api/cases                             | —                                                         | Public `DemoCase[]`                                     |
| POST /api/materials/preview                | Multipart file; optional company, shortName, documentDate | Editable `UploadPreview`; not saved yet                 |
| POST /api/materials                        | Material without id or createdAt                          | Validated, saved `Material`                             |
| DELETE /api/materials/:id                  | —                                                         | Refuses materials referenced by a task                  |
| GET /api/sources/:id/pdf                   | Known manifest source ID                                  | Local public source PDF, or explicit 404 if unavailable |
| POST /api/tasks                            | `CreateTaskInput`                                         | Saved task; actual asynchronous pipeline                |
| GET /api/tasks/:id                         | —                                                         | Current user's `AnalysisTask`                           |
| POST /api/tasks/:id/retry                  | —                                                         | Reruns the saved input snapshot                         |
| PATCH /api/tasks/:id/context               | `TaskContextPatch`                                        | Updates purpose, merged notes, or manual cash plan      |
| PATCH /api/tasks/:id/questions/:questionId | Status open or done                                       | Updated task                                            |
| DELETE /api/tasks/:id                      | —                                                         | Deletes only this user's task                           |
| GET /api/tasks/:id/export?format=html      | —                                                         | Self-contained printable report                         |
| GET /api/tasks/:id/export?format=json      | —                                                         | Actual report and saved input snapshot                  |
| POST /api/reset                            | `{ confirm: 'RESET_DEMO' }`                               | Resets only the current user's workspace                |

Task title names the working paper. The analytical question is fixed: compare same-period consolidated net profit and operating cash, reconstruct the sourced bridge where possible, and identify needed follow-up evidence. A free-text title is not arbitrary natural-language claim verification.

Duplication, comparison and evidence stress tests create a new task with explicit `excludedMetrics`; originals remain unchanged. Excluded observations must not be used by the rule engine or passed to the optional model. Processing stages reflect actual work and timestamps, with no decorative delays or synthetic progress percentages.

`useModel` is an explicit per-task opt-in, default false. A configured service without opt-in returns `model.status=not-requested`; no evidence is sent. Opt-in sends only actually adopted annual consolidated evidence to the configured third-party provider. Retry retains that choice, and conflict/no-usable-evidence cases do not call the model. Provider hostname and requested model ID are shown separately from deterministic calculations. Citation-ID, format and numeric checks do not prove semantic accuracy.

## Public company evidence Agent

All company endpoints require the owning session. Writes also require CSRF and same-origin checks. `CompanySearchResponse` is a bounded A-share subject lookup from the official disclosure source; an empty response means no match in this source, not that a company is nonexistent or safe. Candidates require explicit selection. Runtime research re-resolves the supplied security code and verifies its official orgId instead of accepting a client-supplied company or URL.

| Method and path                   | Input                                              | Response / effect                                                            |
| --------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| GET /api/companies/search?q=      | Company name or six-digit code, 1–80 characters    | `CompanySearchResponse`; authenticated, rate limited                         |
| GET /api/company-runs             | —                                                  | Current account's `CompanyResearchRun[]`                                     |
| POST /api/company-runs            | `{securityCode, orgId, year, purpose?, useModel?}` | 202 persisted queued run; asynchronous public research                       |
| GET /api/company-runs/:id         | —                                                  | Owning account's run, real tool events, sources and candidate preview        |
| GET /api/company-runs/:id/file    | —                                                  | Owning account's retained PDF, verified against saved bytes/hash             |
| POST /api/company-runs/:id/adopt  | `{confirmed: true, material}`                      | 201 confirmed material, or 200 idempotent adoption recovery                  |
| POST /api/company-runs/:id/cancel | `{revision}`                                       | Stops the current execution generation; 409 during final publication         |
| POST /api/company-runs/:id/resume | `{revision}`                                       | 202 resume under the same owner, scope and cumulative request budget         |
| DELETE /api/company-runs/:id      | —                                                  | Removes finished run and unconfirmed retained file; adopted materials remain |

Run input is strict: six-digit A-share code, alphanumeric orgId, completed calendar year from 2010, `purpose=external|handover` and independent `useModel=false` by default. No arbitrary URL is accepted. This single-process release allows two active public research runs globally and one per account, twelve run creations per account per hour and thirty retained run records per account. Search allows thirty requests per minute per account. Reset and run deletion refuse an active query or adoption. An interrupted run becomes failed on restart, without inventing a completed event.

Tool events carry actual start/finish times, input/output summaries, selected evidence and decisions. They are execution records, not private model reasoning. Client responses expose typed progress rather than full graph state or PDF bytes. Research uses owner-scoped SQLite checkpoints and temporary public PDF caches, with 24-hour recovery for eligible failures. Completed research clears its temporary graph state. Unconfirmed retained uploads expire after 24 hours and share the 250 MB account quota. A candidate remains `reviewRequired=true`, including known reports. Adoption requires unchanged source metadata and confirmation of company, annual period, currency, unit and consolidated scope; observations can be corrected. Interrupted adoption recovers the same material on retry.

Creation accepts an optional UUID `Idempotency-Key`; reuse with different input returns 409. Cancel and resume require the current progress revision. Stale, expired or incompatible requests return 409; another account receives 404. A final short publication phase refuses cancellation rather than acknowledging cancellation and later marking success. Each logical run reserves at most 32 source and 12 model attempts, persisted before dispatch and cumulative across recovery. The 480-second timeout applies to each execution window. This is a single-process workflow, not a distributed exactly-once service.

The public-query model consent is separate from report explanation consent. If requested and configured, its payload contains selected public subject/announcement metadata, short relevant PDF table texts and rule-adopted financial facts for constrained planning/page selection and qualitative explanation. It does not contain private uploads, account information, user notes or manual cash assumptions. The model cannot create monetary observations; amounts and arithmetic remain source-based deterministic processing. Missing, conflicting or unavailable evidence must remain explicit. Provider and real call status are shown on the run.

`CompanyResearchRun.agent` is the safe `CompanyGraphProgress` DTO. It carries `version=langgraph-v1`, optional UUID `requestKey`, current `revision`, `recoverable`, `cancelRequested` and optional `cancelledAt`. Its `branches` identify `identity|finance|notes|announcements|reconcile` with `pending|running|completed|failed|skipped`, actual timestamps and an optional summary. Tool trace entries can carry the same `branchId`. A completed execution step does not establish that financial checks passed or that evidence is authentic.

`agent.evidence` contains public excerpt metadata only: `{id,title,sourceUrl,sha256,page,quote,kind}` with `kind=annual-note|announcement`. `competingExplanations` are `{id,label,status:"hypothesis",evidenceIds,nextEvidence}`; references are confined to the returned public evidence. They remain hypotheses. `coverage` contains `annualReports`, `recentTitles`, `recentFullTexts`, `recentTruncated` and `warnings`; a count of titles is not a count of fully reviewed originals. `budget` contains cumulative `sourceRequests`, `modelRequests`, `maxSourceRequests` and `maxModelRequests`.

The optional `agent.providerDiagnostics` contains `requestedTier?`, `actualTiers`, `requests?` and `validationFailures?`. Every request diagnostic is `{attempt,status,httpStatus?,elapsedMs?,failure?}`; `status=running|completed|failed`. Here completed means the HTTP response was obtained successfully, not that output validation or semantic verification succeeded. Failure data is `{errorCode,category,transportCode?}`; `category=transport|http|timeout|parse|schema|validation|budget|storage|cancelled|unknown`. Validation failure entries add a `tool` label. Only fixed internal error codes and allowlisted transport codes are stored, never keys, raw exception messages or full request/response bodies. Older runs can omit these fields. Missing historical diagnostics cannot be used to infer a prior failure's cause. Returned service-tier labels are gateway diagnostics, not independent evidence of upstream model identity, platform Fast configuration or a latency guarantee.

Commercial company-information services such as Tianyancha have no configured licensed integration in this release. Recent announcement titles are unreviewed leads, not verified litigation, guarantee liabilities or a comprehensive risk search.

## Private payment decisions

Every endpoint requires the owning session. Writes require CSRF and the same-origin policy. A foreign decision, revision, task or material is not made available by knowing its ID. The decision routes never call the external model.

| Method and path                               | Input                      | Response / effect                                           |
| --------------------------------------------- | -------------------------- | ----------------------------------------------------------- |
| GET /api/decisions                            | —                          | Current account's decision summaries                        |
| POST /api/decisions                           | `DecisionInput`            | 201 saved revision 1 and deterministic evaluation           |
| GET /api/decisions/:id                        | Optional `revision=N`      | Selected immutable input, evaluation and revision list      |
| PATCH /api/decisions/:id                      | `{baseRevision, input}`    | New input version; stale base returns 409                   |
| POST /api/decisions/:id/evidence              | `{baseRevision, evidence}` | New version with one saved evidence record                  |
| PATCH /api/decisions/:id/evidence/:evidenceId | `{baseRevision, state}`    | `active` or `withdrawn`; appends a version and recalculates |
| POST /api/decisions/:id/restore               | `{baseRevision, revision}` | Copies the historical input into a new current version      |

`POST /api/decisions/:id/evidence/:evidenceId/scope` accepts `{baseRevision, entity, asOf, reason}` and creates a scope-corrected version.

There is no individual decision DELETE endpoint in this release. Account workspace reset removes decisions as part of that explicit reset. Financial tasks and materials referenced by any decision version cannot be individually deleted. Limits are 50 decisions per account, 100 versions and 50 evidence records per decision, and 60 decision creations per account per hour.

`DecisionInput` carries a title, `purpose=external|handover`, user-provided transaction entity, optional owning financial `reportTaskId`, a private statement and exactly the applicable input group. External inputs specify the as-of date, total transaction, proposed A/B payment, already-paid amount, delivered value, actual refund, payee/refund entities and a user-set exposure limit. Any unprovided monetary amount stays `null`; explicit zero is a distinct value. A minimum-input decision can be saved before the calculations have enough inputs.

Internal inputs contain a current opening balance, as-of calendar date, a user cash floor, proposed amount/day, optional alternative day and up to 100 named cash events. Days are integers 1–90 relative to day 0 (`asOf`); event dates and amounts may be unknown. Known amounts are nonnegative CNY strings with at most 20 integer digits and two decimal places. Duplicate event IDs are rejected. `shared/decision-cash.ts` uses integer fen, compares event balances and 30/60/90-day endpoints, and discloses an outflows-first bound for unconfirmed same-day ordering. Reverse thresholds are conditional on the listed events and cannot certify completeness or approve payment.

Evidence slots are identity, terms, paid, delivered, refunded, opening-cash, cash-flow, collections and inventory. `source-record`, `counterparty-statement` and `assumption` are source/use labels; a user-transcribed source record does not prove an occurrence. Dependencies separately report `binding=source-located|user-transcribed|not-located`. Source location means the server matched the quote within a saved material excerpt or observation; it does not establish authenticity, bank verification or economic truth. References must belong to the current account. Explicit future/undelivered refund statements cannot reduce actual-refund figures.

The evaluation separates independent assumption calculations from calculations under matched, source-located record fields. Missing, withdrawn, conflicting, wrong-subject or wrong-date direct evidence withholds its dependent record branch, without deleting an independently entered assumption branch or unrelated financial facts. Cash-flow records need an explicit, compatible inflow/outflow direction in the saved quote. Matching is a bounded field rule, not unrestricted semantic verification.

Known unresolved source conflicts are retained when evidence is withdrawn or an older input is restored. Scope correction allows only subject and date plus a reason of 1–1,000 characters, for a source record whose unchanged quote remains located and contains the corrected subject/date. Values, quote, source, role and event ID cannot be edited through this endpoint. A conflict can cease to share a scope after correction; the issue and resolution history remain recorded. Restoring its conflicting input reopens the issue. Historical replay uses the selected input and the issues/resolution events known at that revision; restoring it is a new version, not erasure of later knowledge.

Dependencies mark `relation=motivates|supports`. An adopted negative historical receivables or inventory adjustment motivates a specific follow-up inquiry; it does not supply a current balance or future cash date. Direct transaction/cash records support their corresponding private fields. Optional annual-report scope is background and never the mandatory first evidence gate. JSON export in the browser includes the selected version, evidence labels, evaluation and limitations, not account credentials.

## Imports

CSV columns: `company,shortName,year,key,value,unit,currency,scope,period,page,quote,documentDate,sourceUrl`.

The annual workflow requires confirmed `period=annual`, `scope=consolidated`, CNY and supported units yuan, wan, or yi. Missing period stays unknown; yearly labels alone do not make half-year and annual values comparable. Keys and enums follow the shared contract. Decimal strings preserve source precision; calculation converts supported monetary values to integer fen.

JSON uses the Material shape without id/createdAt. Text PDF extraction returns editable preview and warnings; ambiguous units, scope or column order are not silently inferred. Schema consistency and arithmetic closure do not establish that user-uploaded facts match an authentic original. Users must confirm inputs and retain authorized source evidence.

Authenticated preview stores the original bytes in that user's private staging area and returns opaque `uploadId` on both preview and material. Confirmation verifies account ownership, filename and actual SHA256 before binding the original. `GET /api/materials/:id/file` downloads only the current user's bound original; PDF files support page fragments. Direct structured inputs without uploadId have no independent stored file and do not claim otherwise. A referenced material cannot be deleted. Reset and unreferenced deletion remove only that user's records and original copies.

The single-file limit is 25 MB and total uploaded storage per account is 250 MB. Unconfirmed originals expire after 24 hours and are cleaned on later access or upload; confirmed originals do not expire under that staging rule.

## Review purposes and private cash assumptions

`purpose` is `external` (default) or `handover`. Old saved tasks normalize to the default. `PATCH /api/tasks/:id/context` preserves the report, input snapshot and model output. It accepts a purpose, whitelisted `contextNotes` (merged by key, notes at most 2,000 characters), and an optional `cashPlan`. `cashPlan: null` clears the plan. The owning session, same-origin check and CSRF token are required.

Note keys are `external.identity`, `external.promise`, `external.latest`, `handover.cash`, `handover.schedule`, and `handover.controls`; each contains `{done: boolean, note: string}`. A completed checkbox records user follow-up, not independently verified reliability. These notes and the cash plan never enter the optional model payload, including retries. New copied or restored tasks retain purpose but do not inherit notes, plans or model opt-in.

The plan is `{asOf, openingCash, periods}` with a valid calendar date, nonnegative CNY decimal strings of at most two decimal places and 20 integer digits, or `null` for unknown amounts. The three intervals are 0–30, 31–60, and 61–90 days. Inflows and outflows are interval amounts, not cumulative totals. `calculateCashPlan` computes balances using integer fen and propagates unknowns. Annual operating cash flow and historical year-end balances are never used as current cash.

The client-only `calculateCashStress` experiment uses the saved plan, an integer collection percentage (0–100), a 0/30-day delay and an extra first-interval payment. Collections are multiplied by the percentage and rounded down to cents. A delay shifts the first two intervals into the following interval and moves the last beyond day 90. The minimum percentage is the smallest whole percent keeping all three period-end balances nonnegative under the selected delay and extra payment. Unknown inputs or an infeasible scenario produce explicit unavailable results. This is an assumption-based sensitivity calculation, not a daily cash forecast, probability or company rating. Stress controls are temporary; the saved plan is persistent.
