# Lite / Pro design QA

Date: 2026-10-04 (Asia/Shanghai).

**Findings**

- [P2, resolved] The English headline was clipped after its entrance completed: the 1440px line measured 1041.625px against a 1020px mask, and the 320px line measured 279.06px against a 265px mask. Reduce the desktop English maximum from 112px to 108px and the mobile minimum from 30px to 28px. Post-fix browser measurements and screenshots retain the complete canonical headline.
- [P2, resolved] The Chinese query action wrapped at 375px. Let its width follow its content, keep the label on one line and preserve the arrow width. The post-fix Chinese reduced-motion capture and text-range assertion confirm a single line.
- [P3, resolved] The first mobile capture caught GSAP letters during entrance. The harness now waits for completed letter transforms before capture, rather than using description opacity alone as an entrance-ready signal.
- No open P0/P1/P2 issue was found in the inspected views. This is a scoped visual and interaction review, not a pixel-identical clone verdict or a live-model acceptance result.

**Comparison target and evidence**

- Source visual truth path: `/workspace/generated_images/exec-b1e23036-727c-4556-9fc6-36d59c0b3f17.png`, the selected second monochrome option. The source was opened and its dimensions checked.
- Source pixel dimensions: 1487 × 1058. Actual desktop implementation CSS viewport: 1440 × 1024, `deviceScaleFactor: 1`, screenshot pixels 1440 × 1024.
- Implementation: Lite root `/`, followed by the separate saved-company result `/company?run=…&experience=lite`. Pro retains `/query` and the existing `/company` report and seven F destinations.
- Actual application: `http://127.0.0.1:4338`, real production build, fresh signed browser visitor, Chinese/light at page top, navigation closed and no submitted company query. The source authentication state is unspecified.
- Implementation capture: `output/browser-qa/lite-desktop-zh-light.png`. Additional actual captures cover English desktop, 390px English dark, 375px Chinese reduced motion, 320px English light, menus, the historical source dialog and the restored Pro query.
- Density normalization: the source is scaled/cropped to the implementation's 1440 × 1024 frame before side-by-side comparison. Original source dimensions are retained; no claim that the original canvases were identical.
- Full-view comparison input: `output/browser-qa/source-and-implementation-desktop.png`.
- Focused comparison inputs: `output/browser-qa/compare-header.png`, `compare-headline.png`, `compare-query.png` and `compare-paper.png`. Both the full composition and focused regions were opened and inspected.
- These are local ignored QA artifacts. CI separately uploads its own entry screenshots and receipt; a successful assertion does not replace visual inspection.

**Required fidelity surfaces**

| Surface                          | Current result                                                                                                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fonts and typography             | Inspected native display-font rendering, giant Chinese hierarchy and body text. English mask clipping is fixed and checked at 1440px and 320px. Native input remains readable.                                                     |
| Spacing and layout rhythm        | Inspected full composition and header/query crops, desktop and narrow widths. Genuine year/sample/account controls require more space than the concept; the implementation is deliberately less dense. No inspected page overflow. |
| Colors and tokens                | Inspected neutral light and dark states, query controls, menu and source chapter. The page retains the selected black/white direction; the source chapter uses a dark reading surface.                                             |
| Image quality and asset fidelity | Inspected generated grayscale paper shape, responsive crop and historical-source dialog. The sculpture adapts the source direction rather than reproducing every drawn line; actual financial originals use retained crops.        |
| Copy and app content             | Inspected the exact canonical bilingual headline, complete labels, annual selection, historical-example attribution, real result amounts and missing-model state. No fabricated query result substitutes for source data.          |

Intentional adaptations: preserve shared branding, language/theme/account controls, Lite/Pro switching, annual selection, editable sample drafting and the unified assistant. The concept's brush mark, orbit line and bottom mountains are not reproduced; the paper composition and headline are less dense to accommodate functional controls. This is an adaptation of the selected monochrome direction, not exact pixel fidelity.

**Code checks, separate from visual QA**

- After the execution environment regained sockets/network, an independent install from the unchanged lockfile succeeded. Full `npm run check` passed: types, research manifest, 1005 tests, build and whole-repository formatting. Development tests use Node 22.15+; the packaged service retains its Node 22.12 runtime minimum.
- Post-fix build and browser entry acceptance passed 35 checks with nine screenshots. `output/browser-qa/receipt.json` records viewport, locale, theme and reduced motion, with zero console/page/network errors or research writes. The exact pre-existing telemetry script is served inertly in the test and recorded as an explicit exclusion; other outgoing source/model requests remain forbidden.
- A separate real local acquisition of 松原安全 / 300893 / 2025 used genuine public responses, no financial fixtures and no configured model. Its four annual amounts match the saved snapshot exactly, seven source links remain inspectable, and four chapter anchors plus local profit-basis switching work. Same-owning-run Lite → cached Pro → Lite produced no new research POST, outbound source call or context revision. The 320px result and figures show no page overflow; page/console errors are zero. Evidence: `output/browser-qa/lite-results/receipt.json` and seven result captures.
- `80be65c` passed CI 37144654321 and Deploy 37144944880. Public strict-HTTPS health returned 200 and the exact release header, with healthy storage. Later frontend fixes use the same CI-gated deployment path; online model/assistant answers remain outside this run.

**Open Questions**

- Live model answers, other browser engines and all hidden legacy flows were not exercised. Their absence is not inferred to be a visual defect or claimed as acceptance.

**Comparison history**

Two actual visual iterations were completed. The initial captures preserved the monochrome direction and exposed English clipping and the narrow Chinese action wrap; the enhanced geometry assertions reproduced those failures. After the CSS changes, a fresh production build and nine captures passed the geometry checks, and the corrected English/Chinese states were inspected. `before-fix-desktop-en-headline.png` preserves the clipping evidence. The prior workspace record below concerns earlier work only.

**Implementation Checklist**

1. Actual browser captures and source density normalization: completed.
2. Full and focused comparison across all five surfaces: completed with documented adaptations.
3. Desktop/narrow, bilingual, light/dark, reduced-motion and keyboard entry review: completed.
4. Genuine result reading, exact annual figures, source links and same-run Lite/Pro call-count review: completed without model calls.
5. P2 fixes and post-fix captures: completed. Live model/assistant execution remains untested.

**Follow-up Polish**

Further motion changes should preserve the verified editable input, native scrolling, reduced-motion view and exact source/result semantics. No additional P3 change is required for this release.

final result: passed

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
