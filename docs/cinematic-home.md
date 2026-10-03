# Cinematic homepage

## Story and composition

The anonymous homepage uses a desktop composition with explanatory copy
on the left and an animated evidence presentation on the right. Narrow screens
stack the copy and presentation. Five chapters follow one fixed historical
finding through its original pages, signed cash reconciliation and unresolved
explanations, then return to the login entry.

The opening retains the canonical headline, “Make company judgments traceable.”,
with the concise description “Look up a company. Compare profit and cash with the
original evidence.” Its primary “Try Prispect” link opens `/login`, as does the
ending's primary link. The example uses Songyuan's 2025 consolidated net
profit of CNY 366,373,098.93 and operating cash flow of CNY 26,197,123.70. These are
historical annual-report amounts, not a current company assessment.

| Chapter     | Presentation                                                         | Start progress |
| ----------- | -------------------------------------------------------------------- | -------------- |
| Discovery   | Research finding with consolidated profit and operating cash         | 0.00           |
| Sources     | Original crops from pages 190 and 191 with highlighted reported rows | 0.14           |
| Calculation | Signed cumulative cash bridge from the original adjustments          | 0.37           |
| Inquiry     | Two untested explanations and materials needed to distinguish them   | 0.64           |
| Begin       | The finding returns alongside the same login entry                   | 0.84           |

The report and original-page layers use CSS perspective, transforms and opacity.
The cash bridge is an accessible SVG with neutral amounts. `OpticalField.tsx`
supplies a decorative SVG background using the existing logo geometry; its
signal and shading follow the same scroll progress. This implementation has no
Three.js dependency, WebGL model or canvas renderer.

## Native scrolling and timeline

`src/cinematic/useStoryTimeline.ts` owns one GSAP ScrollTrigger timeline, chapter
navigation and active/inert semantics. It does not intercept wheel, touch or
keyboard scrolling. The pinned timeline spans seven stage heights on desktop
and 6.4 on narrow screens, using a stage-height floor of 520px. Chapter buttons
use native smooth scrolling to positions within the corresponding chapters.

The timeline moves the report, original crops, amount labels, cash-bridge columns
and explanation paths. The amount labels gain a light paper surface continuously
as they leave the report, move in front of the outgoing sheet, and blend back into
the report at the ending. Their background does not switch at chapter boundaries.
The timeline writes scroll progress to CSS custom properties for
`OpticalField`; animation does not require React state updates on each frame.
Financial figures retain their source values rather than counting up.

`useGSAP` scopes the timeline to the homepage. Its `matchMedia` lifecycle reverts
the animation and pin and restores panel accessibility attributes when the
animated mode ends. The cinematic root continues to skip the application's
generic translated page entrance, which would change the fixed stage's
containing block.

## Responsive and static reading

Reduced motion, desktop heights at or below 560px, and narrow-screen heights at
or below 750px use the complete static reading sequence. It includes the same
finding, source access, cash bridge, unresolved explanations and login entry
without the long pinned scroll range.

Original-page images are local crops that preserve the PDF layout. Source
actions open both crops, exact amounts and the full original PDF link. The
presentation and source access use DOM, CSS and SVG; they do not depend on GPU
model initialization or shader compilation.

The existing application header, logo, documentation, themes, assistant and
business routes remain shared. Compact chapter controls retain accessible
labels. Responsive acceptance must check text wrapping, effective SVG label
sizes, control targets and clearance around the assistant.

## Evidence boundary

`landing-content.ts` reads existing observations and their matching manifest.
Issuer, annual period, consolidated basis, CNY unit and PDF identity are checked.
The original adjustments reconcile in integer fen before presentation.

The CNY 217,235,539.32 group independently sums 13 disclosed rows; it is not the
annual report's single “Other” row. The source dialog retains exact bridge
values, all 13 components, page crops and the full original PDF link. Component
names retain their recorded shortened Chinese labels. Provenance and rights
remain in `public/landing/SOURCES.md`.

The example establishes amounts, not their operating cause. Both explanations
remain untested and distinguishing materials remain not obtained. Historical
operating cash does not enter current cash, future receipts or private plans.
Scrolling through the example does not start retrieval or model research.

## Product integration

Anonymous `/` renders the story. Its primary “试一试 / Try Prispect” links navigate
to `/login`. Authenticated `/` retains the existing research workbench and
`StartInput`, with company matching, editable drafts and account isolation.
The homepage source dialog continues to expose the original crops, precise
amounts and all 13 grouped components.

## Verification

This refinement passed TypeScript, research-record, build and format checks,
plus 24 existing routing, start-intent and page-scroll tests. Local browser checks
covered Chinese and English at desktop and narrow widths, chapter-boundary and
stable frames, reverse scrolling, responsive resizing, reduced-motion/static
reading, homepage-to-login navigation and pin cleanup. Source checks preserved
both original crops, precise amounts, all 13 components and focus restoration.
No browser console errors were observed.

Browser checks used an isolated temporary database. They establish the local
homepage behavior; authenticated draft persistence and production deployment were
not revalidated in this refinement. Linux deployment retention fixtures remain a
Linux CI gate; their mount and cgroup safety checks remain unchanged.
