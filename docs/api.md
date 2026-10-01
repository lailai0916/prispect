# API contract

The canonical types live in `shared/contracts.ts`. Success responses are direct JSON objects; failures use `{ error, code }` and a non-2xx status. Exports and source PDFs return files. The browser and API share an origin.

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
| PATCH /api/tasks/:id/questions/:questionId | Status open or done                                       | Updated task                                            |
| DELETE /api/tasks/:id                      | —                                                         | Deletes only this user's task                           |
| GET /api/tasks/:id/export?format=html      | —                                                         | Self-contained printable report                         |
| GET /api/tasks/:id/export?format=json      | —                                                         | Actual report and saved input snapshot                  |
| POST /api/reset                            | `{ confirm: 'RESET_DEMO' }`                               | Resets only the current user's workspace                |

Task title names the working paper. The analytical question is fixed: compare same-period consolidated net profit and operating cash, reconstruct the sourced bridge where possible, and identify needed follow-up evidence. A free-text title is not arbitrary natural-language claim verification.

Duplication, comparison and evidence stress tests create a new task with explicit `excludedMetrics`; originals remain unchanged. Excluded observations must not be used by the rule engine or passed to the optional model. Processing stages reflect actual work and timestamps, with no decorative delays or synthetic progress percentages.

`useModel` is an explicit per-task opt-in, default false. A configured service without opt-in returns `model.status=not-requested`; no evidence is sent. Opt-in sends only actually adopted annual consolidated evidence to the configured third-party provider. Retry retains that choice, and conflict/no-usable-evidence cases do not call the model. Provider hostname and requested model ID are shown separately from deterministic calculations. Citation-ID, format and numeric checks do not prove semantic accuracy.

## Imports

CSV columns: `company,shortName,year,key,value,unit,currency,scope,period,page,quote,documentDate,sourceUrl`.

The annual workflow requires confirmed `period=annual`, `scope=consolidated`, CNY and supported units yuan, wan, or yi. Missing period stays unknown; yearly labels alone do not make half-year and annual values comparable. Keys and enums follow the shared contract. Decimal strings preserve source precision; calculation converts supported monetary values to integer fen.

JSON uses the Material shape without id/createdAt. Text PDF extraction returns editable preview and warnings; ambiguous units, scope or column order are not silently inferred. Schema consistency and arithmetic closure do not establish that user-uploaded facts match an authentic original. Users must confirm inputs and retain authorized source evidence.

Authenticated preview stores the original bytes in that user's private staging area and returns opaque `uploadId` on both preview and material. Confirmation verifies account ownership, filename and actual SHA256 before binding the original. `GET /api/materials/:id/file` downloads only the current user's bound original; PDF files support page fragments. Direct structured inputs without uploadId have no independent stored file and do not claim otherwise. A referenced material cannot be deleted. Reset and unreferenced deletion remove only that user's records and original copies.

The single-file limit is 25 MB and total uploaded storage per account is 250 MB. Unconfirmed originals expire after 24 hours and are cleaned on later access or upload; confirmed originals do not expire under that staging rule.
