# Lite / Pro design QA

Date: 2026-10-04 (Asia/Shanghai).

**Findings**

- Blocking evidence gap: there is no browser-rendered implementation capture for this change. Chromium exits with `setsockopt: Operation not permitted` in crashpad. Its supported `--disable-crashpad-for-testing` flag gets past that stage, but startup then fails at `content/browser/sandbox_host_linux.cc:41` because `shutdown` returns `EPERM`. A direct Node HTTP preview-server diagnostic also returns `listen EPERM` for `127.0.0.1`. No UI mismatch is inferred from these environment errors.
- Visual fidelity, responsive layout, motion behavior, primary interactions and browser console errors remain unverified. Source inspection and successful code checks cannot replace a rendered comparison.

**Comparison target and evidence**

- Source visual truth path: `/workspace/generated_images/exec-b1e23036-727c-4556-9fc6-36d59c0b3f17.png`, the selected second monochrome option. The source was opened and its dimensions checked.
- Source pixel dimensions: 1487 × 1058. Intended implementation CSS viewport: 1440 × 1024, with intended `deviceScaleFactor: 1`.
- Implementation: Lite root `/`, followed by the separate saved-company result `/company?run=…&experience=lite`. Pro retains `/query` and the existing `/company` report and seven F destinations.
- Implementation screenshot path: unavailable; no screenshot was captured. Implementation pixel dimensions, actual CSS viewport and actual device density: unverified.
- Intended initial comparison state: Chinese, light monochrome theme, Lite homepage at page top, navigation closed, no submitted company query. Source authentication state is unspecified; an implementation visitor state must be documented when capture becomes available.
- Density normalization: not performed. A later comparison must normalize the 1487 × 1058 source and rendered 1440 × 1024 viewport to a common crop/scale before judging fidelity; those dimensions are not already identical.
- Full-view comparison evidence: unavailable; no combined source/implementation comparison input exists.
- Focused region comparison evidence: unavailable for the same capture blocker. Header, giant headline, query controls, paper sculpture and first-fold proportions require focused inspection once a rendered capture exists.

**Required fidelity surfaces**

| Surface                          | Current result                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Fonts and typography             | Unverified: font rendering, weight, size, wrapping, line height and hierarchy require a rendered capture.                    |
| Spacing and layout rhythm        | Unverified: region proportions, first-fold composition, margins, alignment and overflow have not been measured in a browser. |
| Colors and tokens                | Unverified: rendered monochrome palette, contrast, dark theme and semantic states have not been compared.                    |
| Image quality and asset fidelity | Unverified: actual crop, scale, masking, sharpness and paper treatment have not been compared with the source.               |
| Copy and app content             | Unverified visually: headline, labels, clipping and state copy have not been inspected in the rendered application.          |

**Code checks, separate from visual QA**

- The restored-Pro release frontend build and strict frontend entry type check passed. Eight relevant pure test files passed, and the new Lite SSR regressions cover unmatched company names, paused legacy markets and actual cross-owner cache isolation. Research-record validation passed. These do not establish browser behavior or fidelity.
- Full type checking remains blocked by the existing missing `cheerio@1.1.2` dependency and its transitive packages; the exact packages are absent from the local offline cache.
- The latest source-based polish covers motion reset/cleanup, layout-trigger refresh, chapter paging and deep links, acquired-source access, failure recovery and narrow-screen control names. These are implementation changes, not findings from a rendered comparison. Browser CI acceptance is prepared for eight entry-flow screenshots and a receipt, but has not run. No production deployment, real-provider verification or current browser acceptance is claimed here.

**Open Questions**

- Rendered captures are required before deciding whether any source differences are intentional product adaptations or actionable design drift.

**Comparison history**

This change has zero completed visual comparison iterations. Browser and preview diagnostics are environment troubleshooting, not design-QA iterations. The prior workspace QA record below concerns earlier work and is not evidence for this Lite/Pro change.

**Implementation Checklist**

1. In an execution surface that permits browser startup and local preview, open the actual application and capture the intended viewport and state.
2. Normalize density and crop, then put the source and implementation together in one comparison input. Compare full view and focused regions across all five required surfaces.
3. Capture desktop/narrow, Chinese/English, light/dark and reduced-motion states; verify native input, query submission, source access, menus and assistant follow-ups.
4. Switch Lite/Pro on the same saved run and verify that research creation and source/model call counts do not change. Inspect console errors and failure states.
5. Record any P0/P1/P2 findings, fix them, capture again and retain the post-fix comparison evidence before marking QA passed.

**Follow-up Polish**

No P3 refinements are assigned before a rendered comparison.

final result: blocked

<details>
<summary>Historical workspace QA record — previous work only</summary>

# Workspace visual upgrade QA

Date: 2026-10-03.

## Visual target and scope

Source visual: the user's attached tokenflux dashboard screenshot in this chat
(3244 × 2198 original, displayed at 1920 × 1301). The reference establishes an
equal-width card grid, rounded surfaces, outlined icons, clear metric hierarchy,
readable charts and a visible theme color. This is a redesign of Prispect's real
application, not a reproduction of the reference's billing dashboard. Preserve
Prispect's geometric logo, financial content and existing controls. The user's
subsequent direction takes precedence over the reference's extensive color:
restore a primarily white and neutral-gray Linear-style interface with only
small, subdued theme accents. The density refinement keeps content substantial
and readable while removing large repeated wrappers, icon backgrounds and unused
space. The latest typography correction restores normal navigation, body and
heading sizes across the application, while raising the smallest screen text to
a 12px floor. The sidebar is one example of the shared correction, not its scope.

Source browser chrome and outer black framing are excluded from the comparison.
Rendered evidence uses 1440 × 960 desktop, 390 × 960 mobile and 320px English
layouts at device scale factor 1. Comparison concerns app layout and visual
hierarchy, rather than pixel identity between two different products.

## Rendered evidence

Actual local React application: `http://127.0.0.1:4364`.

Screenshots and measurements are stored under
`output/playwright/readable-type/` as local QA artifacts:

- `design-report-light-1440.png`: full desktop composition and first-fold density.
- `design-report-cards-light-1440.png`: focused summary, metric cards and stages.
- `design-report-dark-390.png`: narrow dark report and control wrapping.
- `design-desktop-light-library.png` and `design-desktop-light-materials.png`:
  aligned workspaces, real-record counts and card grids.
- `design-mobile-dark-financial.png`: chart grouping and narrow-page structure.
- `design-mobile-dark-assistant.png`: conversation, sources and composer.
- `design-mobile-dark-guide.png`: document reading hierarchy.
- `design-desktop-financial-chart.png`: saved-year chart selection and theme.
- `design-desktop-dark-docs.png`: six equal document cards in the dark theme.
- `design-sources-320-en.png`: corrected narrow English source tabs.
- `design-summary.json`: final acceptance and resolved findings.
- `design-results.json`: initial browser checks and the preserved narrow-layout
  failure; `design-narrow-results.json` records its subsequent successful recheck.

Fixtures use a synthetic local account and saved public-company snapshots.
API requests are intercepted, external requests and unexpected writes blocked.
These checks do not use production records or a live model.

## Required visual surfaces

- Typography: native system/PingFang fallbacks, restrained weights, 14px body,
  13px navigation and ordinary controls, 13px explanations, and at least 12px
  screen metadata and captions. Workspace titles return to 25px/23px. Preserve
  the original larger main judgments and grades, with amounts at 26px/22px.
  Native mobile inputs and the main research composer remain 16px. Source titles
  wrap and full originals remain accessible. Earlier screenshots below reflect
  the preceding typography and are historical evidence.
- Layout: one workspace width, equal metric tracks, 12px card radii, shared
  20px/18px padding and 16px gaps. Related summary, grade, amounts and actual
  stages share one report section; detailed execution and coverage expand in
  place. Findings follow immediately. Research library and materials share
  compact statistics, directly accessible controls and aligned divided rows.
  Document cards size to their content. Narrow layouts stack content; tables and
  large charts retain local scrolling. Header heights remain 52px/56px.
- Colors: pure white light-theme canvas, neutral paper cards, gray/black
  navigation, actions, icons and grade panels. Subdued purple appears only in
  small focus/hover details and a chart comparison series. Light and dark
  tokens remain distinct; numeric amounts stay readable and semantic errors
  keep explicit labels.
- Assets: preserve the supplied Prispect logo and installed Lucide outline
  icons. Financial charts render recorded data. Reference-site avatars and
  provider logos are outside the intended product scope; no decorative raster
  assets or replacement brand illustrations are required.
- Content: canonical product wording remains unchanged. Judgments, grades,
  provenance and failures are retained. Library/material summaries derive from
  existing records and introduce no extra retrieval requests.

## Comparison history

1. [P2] Important amounts fell below the first desktop viewport. The identity
   card appeared before the report, while the grade column created approximately
   100px of empty space before actions. Move company details after the report
   and place scope/actions/warnings in the summary's text column. Revised
   desktop capture shows all three amount cards within the first viewport,
   approximately y650–841. Mobile cards retain equal widths and readable text.
2. [P2] At 320px in English, the public-discussion tab extended to x346 after
   adding card padding. Allow the tab group to wrap and buttons to shrink;
   retain both tabs and their keyboard selection. Revised 320px/390px English
   and 390px Chinese captures and mouse/keyboard checks show no page overflow.

## Earlier validation and limits

The subsequent palette refinement was checked at 1440px on the report,
research library and document home, and at 390px on the dark assistant.
The light canvas measured `rgb(255, 255, 255)`; grade/icon surfaces and buttons
were neutral. Report geometry and all three first-fold amounts were unchanged.
The source drawer and document navigation remained usable. No page overflow,
browser errors, unexpected requests or missing endpoints were observed.
Final palette captures and measurements are in
`output/playwright/linear-restraint/`: `light-report-1440.png`,
`light-library-1440.png`, `light-docs-1440.png`, `dark-assistant-390.png` and
`results.json`. The earlier visual-upgrade screenshots remain as before evidence.

Type checking, production build and changed-file formatting checks passed.
Final Chromium checks cover report, library, materials, sources, charts,
documents, account and the unified assistant. All three metric cards appear
in the first desktop viewport. Six saved financial years support click/Enter
selection, ArrowRight/Home tab switching and source drawers showing the selected
field and year. Document cards retain six canonical destinations. Library and
material counts match the fixture records. Page errors, external requests,
unexpected writes and missing mock endpoints are all zero.

Production deployment, live research execution, other browser engines and every
hidden legacy modal are outside this visual verification. The local preview
and screenshots remain available for review.

## Earlier density refinement

Local before evidence is in `output/playwright/density-flow/`, including
`before-report-1440.png`, `before-library-1440.png`,
`before-materials-1440.png`, `before-docs-1440.png` and `baseline.json`.
The structural baseline already includes the reduced shared card tokens; it
still has the previous standalone metrics and large process card. On that
baseline, key findings start at y1052 and next steps at y1275. The research
library list starts at y406; materials at y375. Six document cards are each
170px high. Compare the rendered final layout with these same fixture records
and viewport sizes, without introducing extra data or shrinking text.

Final density evidence uses `after-report-1440.png`,
`after-library-1440.png`, `after-materials-1440.png`,
`after-docs-1440.png`, three `after-*-320-en-dark.png` captures,
`after-assistant-empty-390-dark.png`, `after-assistant-filled-390-dark.png`
and `after-account-390-dark.png`. `results.json` records 12 successful
layout/interaction groups using the same local fixtures.

The findings heading now starts at y834, 218px earlier; the first finding text
is visible in the 960px desktop viewport. Library rows start at y316, 90px
earlier; material rows at y287, 88px earlier. Document cards are approximately
106px high with the original descriptions, replacing the fixed 170px height.
The report retains four recorded stages and expands full process/coverage
details through its existing navigation. Sources, grade details, saved-record
navigation and the material original drawer remain usable.

An initial 320px English report check exposed a nonwrapping page-action group.
Its failure and element probe remain in `initial-results-320-overflow.json`
and `report-320-probe.json`. Allow the actions to wrap; the final report,
library and materials checks show no horizontal page overflow at 320px.
Assistant empty and filled layouts both keep the composer inside the panel;
account fields remain at least 16px on mobile. No browser errors, external
requests, unexpected writes or missing mock endpoints were observed.
The assistant answer uses one explicit intercepted request.

Type checking, production build, changed-file formatting and diff checks passed.
Production deployment and CI completion were not awaited.

Current density browser acceptance: passed.

## Current typography floor correction

Restore the ordinary role hierarchy throughout the application, not just in the
sidebar. Shared body/navigation/metadata sizes are 14px/13px/12px. Workspace
headings return to 25px desktop and 23px mobile. Compare original declarations
at `1c16e73` with the broad enlargement at `32b4e42`: restore 44 remaining
ordinary section, record and tool headings that had been enlarged or flattened.
This covers materials, company analysis, original review, the evidence lab,
payment tools, research library, source drawers, documents and account surfaces.
Library grades return to their original 18px. Original prominent judgments,
report grades, larger amounts and mobile/native input roles keep their hierarchy.
Former 9–11px screen text, including the newly integrated research modules, has a
12px minimum; the 10px print-only document URL suffix is outside screen scope.

`output/playwright/type-floor/results.json` records six successful targeted
Chromium groups at the actual local application, using synthetic saved research
and intercepted API responses. Desktop report measurements are body 14px,
navigation 13px, title 25px, metadata 12px, main judgment 34px, grade 52px and
amounts 26px. Document article text is 14px; home-card titles/descriptions are
15px/13px and version metadata is 12px. Research-library metadata is 12px.
Visible text in ResearchPlan, SourceTrust and ReportEvidenceControls has a 12px
minimum. At 390px in the dark theme, the report title is 23px, judgment 26px,
grade 36px and amounts 22px. Assistant and new-research inputs remain 16px.
No page overflow, browser errors, unexpected writes or external requests were
observed. The assistant reply uses one explicit mocked request.

Screenshots: `report-1440-light.png`, `docs-guide-1440-light.png` and
`assistant-390-dark.png` in the same directory. Production build, changed-file
formatting and diff checks passed. No calculation, retrieval, permission or
stored-data behavior changed; CI and production deployment were not awaited.

</details>
