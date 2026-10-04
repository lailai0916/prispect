# Interface consistency · 2026-10-05

The local walkthrough used main `fa361f8` as its baseline, an isolated worktree,
temporary registered accounts and explicitly synthetic financial data. It retained
the existing white/gray shell, typography roles, F chart colors and assistant artwork.

## Changes

- Company page headings use the same top position as Materials and Account settings.
  At 1440px, all four measured business headings begin at y=84px; Financial trends
  and Data coverage previously had an additional 5px top margin.
- Shared `IconButton` actions use `Hint`, keeping their accessible names and native
  button behavior. Assistant actions, research deletion and notice dismissal share
  the same hint presentation. Dialog and mobile-navigation close controls also use it.
- `Hint` exposes an identified tooltip and preserves an existing description on its
  trigger. Escape propagates to the containing dialog/menu rather than requiring an
  additional key press to dismiss a transient hint first.
- Public-data updates display an actual busy indicator and “更新中… / Refreshing…”.
  Existing duplicate-request guards and previous-report retention are unchanged.
- Materials distinguishes “暂无材料 / No materials yet” from “没有匹配的材料 /
  No matching materials”. Materials and financial-review filters use the same
  clear action and whitespace handling. Clearing search returns focus to the input.
- Company browser titles identify both the section and owning-account company.
  The signed-in home search uses the same title as New research. No new company
  request is needed to produce these titles.
- The financial-review empty state opens the canonical `/query` entry and uses
  “新建研究 / New research”. User guide 1.14 names the actual “更新 / Refresh”
  and “查看研究报告 / View research report” controls in both languages.

## Walkthrough and validation

1. Login and New research: existing entry, login boundary, disabled company navigation
   and centered composer remained usable.
2. Company report, Financial trends and Data coverage: headings aligned, browser
   titles identified the company, and a held update showed its real busy state.
3. Materials and financial-review filters: empty and unmatched results had distinct
   next actions; clear-search restored focus and blank spaces did not count as a filter.
4. Assistant, confirmation dialog and mobile navigation: icon hints rendered, a new
   conversation cleared its draft, Escape closed dialogs, and focus returned to the
   original trigger without performing deletion.
5. Documentation home and User guide: six cards, article navigation and shared
   header stayed intact; the guide's operation names matched the product.
6. Narrow dark layouts: Account settings, Data coverage and Materials fit 390px with
   no horizontal page overflow. The reserved assistant dock and 56px header remained
   usable. Existing acceptance also covered 375px and light/dark report layouts.

Validation completed:

- `npm run check`: 1112 tests passed; TypeScript, research-record checks, production
  build and formatting passed. The existing large-chunk build warning remains.
- `node --import tsx scripts/browser-qa.mjs`: 36 checks, 9 screenshots, zero page
  errors, no external source/model requests. The receipt is regenerated under
  `output/browser-qa/` and retained by the existing CI artifact step.
- `node --import tsx scripts/browser-reliability-qa.mjs`: 6 checks, 2 screenshots.
- Pinned repository standards checker: passed.
- Supplemental Chromium walkthrough: desktop 1440×960, narrow 390×844, shared
  header heights 52px/56px, zero page errors. Local before/after screenshots and
  measurements are in ignored `output/interface-audit/`, not production data.

The screenshots and browser actions verify this scoped interface work. They do not
establish full accessibility compliance, live provider accuracy, model quality or
production deployment acceptance. A transient loading screenshot was rejected and
recaptured after the actual account form became visible. No production records were
read, modified or restored, and no CI/deployment wait is part of this change.
