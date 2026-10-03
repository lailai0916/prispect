# Local code integration · 2026-10-03

The working directories contained six committed fixes outside main and an unfinished annual peer-history implementation. Both sets are now integrated with the existing local-report, public-response, PDF, cohort, assistant and challenge caches.

## Resulting behavior

- The six fixes retain financial-institution provider schemas, common financial analysis rules, consistent industry disclosures, source reading state, original-review loading and chart/navigation improvements.
- Financial history fills missing peer cohorts sequentially for up to six acquired annual periods. Each completed year or failure is saved independently. Reopening and year selection reuse these outcomes without further retrieval.
- Explicit annual refresh and retry bypass public-response and cohort caches. Failed refreshes preserve the prior snapshot and its acquisition timestamp; cancellation, deleted records, changed contexts and owning-account checks prevent late writes.
- Browser back uses its individual history entry, while ordinary section visits retain the company's reading position. Native restoration is disabled while the application owns restoration. Restoration waits for content geometry to settle before releasing its observers, preserving user interruption and the bounded deadline.
- Three leftover test wording edits in an older worktree already occur in main; their original diff is retained locally before cleanup. Build output, captures and dependency directories remain local.

## Validation boundary

- Full project validation covers types, competitive-research records, the complete test suite, client build and formatting.
- Annual-history and scroll regression tests cover source-cache bypass, ownership, annual scope, independent outcomes, cancellation, stale contexts, persistence failure and delayed index layout changes.
- Nine browser checks use an isolated React/Express application with synthetic public company data and blocked nonlocal requests: sequential annual fill, six plotted peers, cache-only reopening, refresh failures retaining old data, saved failures, explicit retries, cache bypass, two history visits and mobile light/dark layouts.
- No production data was read or modified. Live provider/model quality and deployed browser behavior are outside this local integration's validation.
