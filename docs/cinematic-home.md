# Cinematic homepage prototype

## Review boundary

This is the first viewable implementation of the approved direction: unfold one
company finding into its original evidence, calculation and unanswered questions,
then return to the user's own research. It is a visual prototype for review, not
a production release. Optical rendering and final motion refinement remain behind
the prototype acceptance checkpoint.

The implementation uses existing GSAP, React, semantic DOM, SVG and CSS perspective.
It introduces no WebGL dependency, video background or remote media request.
Financial amounts remain fixed throughout the story, without numeric counting.

## Five connected scenes

| Scene       | Meaning                                                 | Visible object                                   |
| ----------- | ------------------------------------------------------- | ------------------------------------------------ |
| Discovery   | A useful finding starts an investigation.               | Historical Songyuan profit and operating cash    |
| Sources     | Amounts retain the original and annual scope.           | Original PDF table excerpts and row references   |
| Calculation | Disclosed adjustments reconcile profit to cash.         | Signed original-report cash bridge               |
| Inquiry     | Reconciled amounts do not establish an operating cause. | Untested explanations and missing materials      |
| Begin       | The next question belongs to the user.                  | The same finding and the existing research entry |

`src/cinematic/CinematicLanding.tsx` owns the presentation and dialogs.
`useStoryTimeline.ts` owns one native-scroll timeline; it does not intercept wheel,
touch or arrow-key input. `story.ts` defines the chapter positions.
`OpticalField.tsx` draws the decorative brand light field from the same progress,
without a separate animation loop or per-frame React state.

## Evidence and calculation

`landing-content.ts` reads the existing Songyuan 2025 observations and matching
source manifest. It verifies their identity and reconciles original amounts in
integer fen before rendering. The year, annual consolidated scope, CNY unit,
issuer and PDF references stay attached to the example.

The grouped CNY 217,235,539.32 independently sums 13 disclosed adjustments; it is
not the annual report's single “Other” row. Profit, that group and the three
working-capital adjustments reconcile to CNY 26,197,123.70 of operating cash.
The source dialog exposes exact values, grouped components and the original PDF
link. Crop provenance and rights are documented in `public/landing/SOURCES.md`.

This fixed historical example does not create a current assessment, risk grade or
investment conclusion. Distinguishing materials remain not obtained. Historical
cash does not enter current cash, future receipts or private plans.

## Integration and responsive behavior

- Anonymous `/` renders the story. Authenticated `/` retains the research workbench.
- Entry buttons open one existing `StartInput` owner. Query routing, login
  continuation and editable drafts retain existing product behavior.
- The hypothetical payment-timing example remains optional in the entry dialog,
  separate from the historical annual-report story.
- Reduced motion, desktop heights at or below 560px, and mobile heights at or
  below 750px use the complete static five-scene reading sequence.
- Larger viewports use one pinned stage below the existing header. Inactive story
  text and controls use `inert` and `aria-hidden`.
- Language switches retain story position. Crossing the desktop/mobile width
  boundary refreshes function-based geometry without rebuilding the pin.
- Animated SVG selectors are restricted to the pinned stage. Switching to the
  static view cannot leave transforms on its separate cash bridge.
- Financial SVG text compensates for viewBox scaling to retain an effective 12px
  floor. Full labels and exact amounts remain in the accessible description and
  source dialog beside the abbreviated narrow-screen labels.

## Verification on 2026-10-03

Browser checks cover 1280 × 720 desktop and 390 × 844 mobile in both languages,
375 × 667 static reading, reduced motion, source-dialog crops and exact amounts,
anonymous query submission through login, an isolated local account's workbench,
documentation/back/forward cleanup, reverse scrolling, language switches and
desktop/mobile resizing. Final transition contrast and static SVG cleanup were
also checked. The inspected browser reported no errors or warnings.

The local server uses a separate temporary database. These checks do not verify
production deployment, SMTP, model providers or a real company research result.
Type checking, research-record validation, build and formatting checks passed.

The initial local test run encountered deployment-retention fixtures that require
Linux mount/cgroup identities, plus three cancellations from an unreferenced
deadline timer in an in-memory public-source fixture. Ubuntu also reproduced
those cancellations. That fixture now retains a simulated transport handle until
completion, with an independent 1-second test timeout and the original 15ms
request deadline. Deployment safety checks remain unchanged. Ubuntu CI is the
applicable full-suite gate; the pull request records its actual status.

## Pending visual acceptance

Review the full scroll sequence before selecting further optical effects.
The next pass must preserve evidence relationships, the real research entry,
static reading, signed figures and readable metadata while refining physical
motion, lighting and intermediate compositions. This prototype is not the final
visual acceptance of the requested homepage.
