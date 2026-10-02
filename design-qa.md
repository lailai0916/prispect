# Documentation layout QA

final result: passed

## Reference and evidence

The user's Linear Docs screenshot is the layout reference: article navigation on the left,
readable content in the middle, and a section outline on the right. This is a layout adaptation;
Prispect retains its brand, existing typography, document text and public header.

- Source visual truth: `output/playwright/docs-linear-reference-light.png`, captured from
  <https://linear.app/docs/start-guide> after selecting the light theme.
- Implementation: `output/playwright/docs-final-about.png` and `docs-final-docs.png` in the same
  directory; additional captures cover `/method`, `/privacy`, `/terms`, and `/copyright`.
- Comparison viewport: 1760 × 1058 CSS pixels. Both full-view images are 1760 × 1058 pixels at
  device scale factor 1. The fresh source capture excludes the browser frame in the supplied
  screenshot; no image-density conversion was needed.
- State: anonymous, light theme, page top. Source text is English; implementation text is Chinese.
  English and dark states were verified separately.
- Full-view comparison: source and implementation were opened together in one comparison input.
- Focused comparisons: `docs-reference-focus-heading.png` (640 × 110) with
  `docs-focus-heading.png` (740 × 186), and `docs-reference-focus-outline.png` (250 × 150) with
  `docs-focus-outline.png` (220 × 488). These native browser crops were viewed together to check
  typography, section spacing, rail alignment and active states. Different heights reflect the
  preserved product text and the longer real outline, rather than density differences.
- Responsive evidence: `docs-final-mobile.png`, `docs-final-mobile-dark-en.png`,
  `docs-final-mobile-navigation.png`, and `docs-final-tablet-contents.png`.
- Navigation regression evidence: `docs-final-history-back.png`.

Screenshots and local browser-check scripts are workspace evidence and are excluded from Git.

## Findings and comparison history

- The first visual comparison found no substantive composition mismatch: the article is centered
  between equal desktop navigation tracks, with a restrained sidebar, narrow section outline,
  and readable prose width. Retaining Prispect's header, Chinese type and six actual articles is
  intentional; Linear's branding and unrelated navigation categories are not product content.
- [P2, resolved] Browser history could restore the page top after a section link had aligned the
  target. Section scrolling now runs on the next animation frame, after browser restoration and
  mobile-menu collapse. The revised browser run verifies back, forward, repeated links, legacy
  anchors and `/method?section=privacy`; `docs-final-history-back.png` shows the calculation
  heading below the header with both sticky navigation columns and its outline item active.
- The final full-view and focused comparison found no remaining actionable P0/P1/P2 issues.

## Fidelity surfaces

- Typography: the existing system-font stack, 28–40 px page headings, 19 px section headings,
  14 px prose and quieter navigation remain consistent with Prispect. Both languages wrap without
  truncation. Native heading captures confirm hierarchy and readable spacing.
- Layout rhythm: desktop tracks are 220 px / up to 740 px / 220 px with balanced gutters.
  Tablet widths retain article navigation and collapse the outline; mobile collapses both.
  Sticky columns stay below the header. Tables scroll inside their own region.
- Colors: existing light/dark tokens provide neutral backgrounds, subtle dividers and visible
  current-page/current-section states. No decorative gradients or new palette were added.
- Asset fidelity: Prispect's original logo and existing Lucide controls are preserved. This
  reference supplies a reading layout, so Linear's logo and unrelated assets are not copied.
- Copy: the six existing document bodies, bilingual disclosures, links and contact information
  are preserved. New navigation labels describe actual product pages and sections.

## Validation

- 288 combinations: six routes × two languages × two themes × twelve viewport sizes, including
  both responsive breakpoints, 320 px phones, short landscape screens and 2560 px desktops.
  No whole-page horizontal overflow; desktop articles remain centered and at most 740 px wide.
- All article links, section links, scroll highlighting, deep refresh, history navigation,
  repeated section clicks and real/legacy hash links work. The method privacy link still expands
  its disclosure. Mobile menus close after navigation and support keyboard activation.
- Signed-in users receive the same document layout and can return to their workspace. All six
  public documents also remain readable when workspace API requests fail.
- Print controls invoke printing; print layout removes both navigation columns and site chrome.
- Mobile controls have at least 44 px targets and visible keyboard focus. Reduced motion is
  respected. Doubling document text size at 390 px produced no whole-page overflow.
- Browser checks recorded no console exceptions or failed HTTP responses in normal operation.
- `npm run check` passed, including types, tests, production build and formatting. The pinned
  repository checker also passed, including read-only GitHub metadata validation.
- Production publication is handled separately by the existing CI-gated deployment workflow.

## Implementation checklist

- [x] Shared three-column layout for all six requested documents.
- [x] Responsive article navigation and section outline.
- [x] Preserve content, bilingual themes, privacy disclosures and print behavior.
- [x] Resolve the history-navigation regression and compare the revised screenshots.
- [x] Complete browser, project and repository checks.

# Company review refinement QA — 2026-10-03

final result: passed

## Scope and reference

The user selected the dark report direction and explicitly requested the existing sidebar,
top navigation and documentation design. This report change does not modify those components or their global tokens.
The implementation adapts the report content, retaining the current product typography rather
than enlarging the navigation to the generated mockup's proportions.

- Refined visual reference: `/workspace/generated_images/exec-fca28a0f-2681-4f0b-a3d4-eef8906f8e3c.png`.
- Reference image: 1487 × 1058 pixels; normalized to 1440 × 1024 for the comparison.
  This generated reference has no intrinsic CSS density. Browser captures use 1440 × 1024 CSS
  pixels at device scale factor 1. Normalization changes the reference scale by approximately 3%.
- State: signed in, Songyuan Safety, annual 2025, consolidated amounts, originals awaiting
  confirmation, Chinese, dark, collapsed detail section, page top.
- Full-frame paired review: `output/playwright/report-refinement/comparison-final.png`.
  Both source and implementation were inspected together. The content comparison is stored
  as `comparison-content-final.png` in the same directory.
- The deterministic UI replay uses verified repository example amounts and is explicitly
  separate from the actual live query. `live-report.png` and `live-adopted-report.png` record
  the real retrieval and subsequent adoption flow using isolated local account storage.
- Existing docs are captured in `docs-preserved.png`; no documentation component or stylesheet
  was modified. Screenshots, browser scripts, local account state and original PDFs are excluded
  from Git.

## Comparison and repairs

- Initial comparison: flat report sections, three amount columns, direct evidence links and a
  collapsed detailed-analysis section establish the intended hierarchy. The original navigation,
  neutral palette, system fonts, logo and assistant remain in place. Copy describes amounts,
  evidence and follow-up records without slogans or a corporate risk score.
- [P2, resolved] The saved-original report's existing card CSS overrode the shared refinement
  after lazy stylesheet loading. Scoped selectors now preserve flat summary and metric sections
  regardless of stylesheet order; the live adopted report was recaptured and inspected.
- [P2, resolved] Saved report evidence buttons needed the same mobile grid placement as source
  links. All finding actions now wrap below their text. New mobile report actions have 44 px
  targets, and print excludes interactive controls.
- [P2, resolved] Duplicate annual rows with one missing value behaved differently by row order.
  Missing values now consistently withhold the field; only differing known values constitute a
  conflict. A financial test verifies both orders.
- The final paired comparison, mobile English capture and light-theme capture show no remaining
  actionable P0/P1/P2 issue within the selected scope. Differences in navigation size, button
  color and report typography are intentional use of the preserved product design.

## Validation and limits

- Default query opens the selected annual review. Exact amount/source drawer, checklist toggle,
  detail disclosure, independent expert profit basis, financial-history navigation, browser back,
  deep refresh, original-candidate entry and public-data refresh work.
- Six adverse source states were exercised in the browser: missing cash, conflicting cash,
  nonpositive profit, previous-year-only data, loading and retrieval failure. Unsupported ratios
  remain absent. Loading and failure states preserve usable paths to original evidence.
- Six added financial tests verify selected-year and consolidated scope, zero versus unknown cash,
  nonpositive denominators, field-specific source conflicts, duplicate rows and rejection of a
  different issuer or unconfirmed original candidates.
- Sixteen language/theme/viewport combinations cover Chinese and English, light and dark, and
  320, 390, 768 and 1440 px widths without whole-page horizontal overflow. Saved original reports
  were also inspected in mobile and English states and with insufficient/conflicting evidence.
- Saved original summary, evidence drawer, cash bridge and evidence-request tabs work. Summary
  printing produces a local PDF with controls hidden. The final normal browser run recorded no
  page exceptions or failed HTTP responses.
- Live Songyuan retrieval returned the 2025 consolidated amounts 366,373,098.93 and
  26,197,123.70 yuan. The original hash matched the source manifest and all twelve retained annual
  observations matched the verified example, including scope, units and currency. With no model configured in the isolated local server, confirmation
  and adoption created a saved report retaining rules results showing 7.15%; its link works from the public summary.
- `npm run check` passed: strict types, 211 tests, production build and formatting. The latest main branch control and automatic-model changes were retained; report basis controls
  use the shared Select component. Deployment is verified separately through the existing CI-gated workflow. This verification does not claim
  that the platform covers every issuer or authenticates future payment arrangements.

## Implementation checklist

- [x] Preserve original sidebar, top navigation, documentation and expert tools.
- [x] Default to concise annual report with source and follow-up paths.
- [x] Retain detailed financial context, original confirmation and saved-report expert tabs.
- [x] Resolve comparison findings and recapture desktop, mobile and language/theme states.
- [x] Verify live retrieval/adoption and run project checks.

# Platform finishing QA — 2026-10-02

final result: passed

## Scope, baseline and paired inspection

Audited steps: anonymous home, query entry, company report, financial workbench, material
list, payment/handover list, new financial review, account profile, documentation and login.
The user's selected Linear-style direction and the existing sidebar, header and document
layout are retained. This iteration polishes the existing application rather than selecting
a new layout. The ten original browser captures (`01-query-before.png` through
`10-login-before.png`) in `output/playwright/platform-polish/` are the visual baseline.

The report, materials and decision-list full-frame before/after comparisons were inspected
side by side in the same image input. Files: `02-report-comparison.png`,
`04-materials-comparison.png` and `05-decisions-comparison.png`. Both sides use
1440 × 1000 CSS pixels at device scale factor 1, with an added 44-pixel label strip; no
scale or density correction is required. States match: same local owner, fixture records,
Chinese, dark theme, page top, collapsed report details. The workbench pair is saved as
`03-reviews-comparison.png`. Separate captures cover 390 × 844 mobile layouts and
English/light variants. `live-report-polished.png` and `polish-motion.webm` use the separately
queried, hash-verified and adopted Songyuan original in an isolated local account; they are
not production account captures or a new live-source validation.

## Findings and repairs

- Materials: selected filters previously lacked a visible selected style. Buttons now expose
  their pressed state and source counts; empty filtered results can restore the list. Search
  clearing preserves input focus, including Escape. Command results select the matching
  material without placing private text in the URL.
- Workbench: status counts, actual sort choices and a reveal-on-focus link arrow improve
  scanning and keyboard use. Sorting changes only the displayed order.
- Feedback: notices previously shared the assistant launcher's corner. They now avoid the
  trigger, move when its panel is open, pause successful-message expiry on hover, focus or
  hidden tabs, and retain errors until dismissal. Download feedback says initiation; the
  preview's exact bytes are still used for download.
- Entry and forms: restrained empty-state file illustrations, real loading placeholders,
  selected-evidence step feedback, a submit-key hint and Caps Lock notice explain current
  state without slogans, simulated completion percentages or animated financial amounts.
- Navigation: header search and Control/Meta+K operate on account-local metadata. Arrows,
  Enter and Escape work; closing restores focus, selecting a result focuses the destination.
  Long report/document pages provide a return-to-top action.
- Motion: shared press/hover responses, brief page/dialog/assistant transitions, detail
  reveals and actual-operation feedback follow the system reduced-motion preference.
- QA caught and repaired a sibling React-key collision that duplicated the main page on
  closing command search. The command key is now distinct from the owner-keyed main;
  repeated closing/navigation retains exactly one main. Portal popup styling and initial
  search focus were also corrected before final acceptance.

## Validation and limits

- `npm run check` passed after fast-forward integration of deployment-retention changes:
  strict types, all **226** tests, production build and formatting. Final stylesheet changes
  were subsequently built, type-checked, formatted and inspected again.
- Eight combinations (1440/390 width × dark/light × Chinese/English) cover eight signed-in
  pages plus command search and assistant: 80 captures, no body overflow or browser
  exceptions. All eight overlay states were recaptured after portal-style repair.
- Browser checks pass for keyboard/local-only command filtering, empty/reset/search-focus
  states, material targeting, sort selection, export byte identity, hover-paused success,
  persistent errors, return to top, reduced motion, anonymous navigation and Caps Lock.
  Reduced-motion checks allow the existing 0.01 ms transition-completion events while
  rejecting nontrivial running animations.
- A separate two-account browser check changes owner while search is open: the menu closes,
  previous metadata disappears, the new owner has no previous records, and the prior run
  returns 404. Only isolated local accounts were created.
- Loading captures use a deliberately delayed real local session response. Error checks use
  one deliberately rejected local profile request. Neither represents an observed production
  outage. Runtime/a11y checks are scoped evidence, not a full WCAG or capacity certification.
- Motion recording is actual local browser output. Financial computations, adoption rules,
  model payload boundaries and existing seven company pages remain covered by the tests;
  this iteration does not claim new provider coverage or accounting validation.

No unresolved P0/P1/P2 findings in the changed flows. Screenshots, recordings and browser
scripts are local workspace evidence excluded from Git. Source financial documents and
browser profiles remain excluded.
