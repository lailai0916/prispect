# API contract

The canonical types live in `shared/contracts.ts`. All responses are JSON except file exports and raw PDF. Success uses the object below directly; errors use `{ error, code }` with a non-2xx status. Paths are same-origin.

| Method and path                            | Input                                                             | Response / effect                                                |
| ------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------- |
| GET /api/health                            | —                                                                 | `{ ok: true }`                                                   |
| GET /api/workspace                         | —                                                                 | `Workspace`                                                      |
| GET /api/cases                             | —                                                                 | `DemoCase[]`                                                     |
| POST /api/materials/preview                | multipart `file`, optional `company`, `shortName`, `documentDate` | `UploadPreview`, does not yet save                               |
| POST /api/materials                        | `Omit<Material,'id'                                               | 'createdAt'>`                                                    | `Material`, validates and saves |
| DELETE /api/materials/:id                  | —                                                                 | `{ ok: true }`; refuse if task references material               |
| GET /api/sources/:id/pdf                   | manifest source ID                                                | Local source PDF, or clear 404 if not downloaded                 |
| POST /api/tasks                            | `CreateTaskInput`                                                 | `AnalysisTask`, async real pipeline                              |
| GET /api/tasks/:id                         | —                                                                 | `AnalysisTask`                                                   |
| POST /api/tasks/:id/retry                  | —                                                                 | `AnalysisTask`, rerun actual pipeline                            |
| PATCH /api/tasks/:id/questions/:questionId | `{ status: 'open'                                                 | 'done' }`                                                        | `AnalysisTask`                  |
| DELETE /api/tasks/:id                      | —                                                                 | `{ ok: true }`                                                   |
| GET /api/tasks/:id/export?format=html      | —                                                                 | Self-contained printable report HTML                             |
| GET /api/tasks/:id/export?format=json      | —                                                                 | JSON including saved input snapshot                              |
| POST /api/reset                            | `{ confirm: 'RESET_DEMO' }`                                       | `Workspace`, reseed cases and delete only demo workspace records |

Frontend comparison/duplication/stress testing creates a new task with copied materials and explicit excludedMetrics; originals remain unchanged. Seed material IDs and case IDs are returned by the API, never hardcoded by the frontend. Processing logs describe real work and timestamps, no decorative delay or synthetic percentage.

CSV input columns: `company,shortName,year,key,value,unit,currency,scope,page,quote,documentDate,sourceUrl`. Numeric values are decimal strings with at most two decimal places in yuan; unit can be yuan, wan, yi. Required keys and enums follow the shared contract. JSON accepts a Material-shaped object without id/createdAt. PDF preview must not infer ambiguous financial figures silently; return warnings and confirm/edit structured observations before saving.
