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
