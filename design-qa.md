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
small, subdued theme accents.

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

- Typography: native system/PingFang fallbacks, restrained weights, 16px body,
  15px controls, 14px explanations, 13px sources and 12px compact chart labels.
  Titles, amounts and grades retain stronger hierarchy. Native mobile inputs
  remain 16px. Source titles wrap and full originals remain accessible.
- Layout: one workspace width, equal metric tracks, 14px card radii, shared
  24px/18px padding and 20px/16px gaps. Narrow layouts stack cards; tables and
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

## Validation and limits

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

final result: passed
