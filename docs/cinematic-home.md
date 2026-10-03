# Cinematic homepage

## Story and composition

The anonymous homepage follows one fixed historical finding through its original
pages, signed cash reconciliation and unresolved explanations. The composition
changes with the material: a central inspection object, a full-frame original crop,
a wide cash bridge, two inquiry branches, then the existing research entry.

The opening keeps the canonical product headline and direct entry action.
Songyuan's 2025 consolidated net profit of CNY 366,373,098.93 and operating cash
flow of CNY 26,197,123.70 establish the example. Copy describes the pages, amounts,
adjustments and missing materials rather than repeating product slogans.

| Chapter     | Material                                                     | Reading position |
| ----------- | ------------------------------------------------------------ | ---------------- |
| Discovery   | Original-report papers under a glass inspection surface      | 0.00             |
| Sources     | Page 190, then page 191, with original row apertures         | 0.245 / 0.33     |
| Calculation | Original rows assemble into a signed cumulative bridge       | 0.555            |
| Inquiry     | Two untested explanations and their distinguishing materials | 0.755            |
| Begin       | Direct action to research another company                    | 0.95             |

The rendered inspection object is illustrative. It does not represent a physical
Prispect device. Its paper textures are the retained original-report crops.

## One scroll clock

`src/cinematic/useStoryTimeline.ts` owns the native-scroll GSAP timeline, chapter
navigation and active/inert semantics. It does not intercept wheel, touch or
keyboard scrolling. An eight-viewport scroll range supplies transitions and
reading holds; narrow screens use 7.8 viewports. Locale changes preserve the
current position. Responsive geometry refreshes without rebuilding the pin.

The timeline emits `storyframe` events from its progress. `EvidenceSculpture.tsx`
uses that same progress for the glass separation, page movement, source-row
extraction, six bridge bodies, inquiry paths and retirement. It has no autonomous
rotation, numeric counting or independent progress smoothing.

Canvas and DOM have complementary roles. The physical transition uses WebGL;
source-reading holds use exact DOM crops, and the calculation hold uses an
accessible SVG with DOM labels on narrow screens. Decorative paper and chart
bodies retire during these holds so they cannot compete with readable content.

## Rendering and fallback

Three.js and its geometry/environment helpers load dynamically only for the
animated homepage. Both original textures are local. The renderer uses a local
studio environment, a thin transmitting glass surface and restrained neutral
materials, without video, remote media, bloom or a postprocessing chain.

- Coalesced animation frames draw only after progress, texture or size changes.
- Desktop pixel ratio is capped at 1.5; narrow screens are capped at 1.
- Hidden and offscreen scenes stop drawing.
- Leaving the route or switching to static reading releases listeners,
  observers, animation frames, textures, geometries, materials and the renderer.
- WebGL or texture failure retains a simple paper illustration and the complete
  DOM story; original-source and research actions remain available.
- Reduced motion, desktop heights at or below 560px, and mobile heights at or
  below 750px use the complete static reading sequence without loading Three.js.

The material implementation follows the official
[MeshPhysicalMaterial documentation](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)
and [WebGLRenderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html).

## Evidence boundary

`landing-content.ts` reads existing observations and their matching manifest.
Issuer, annual period, consolidated basis, CNY unit and PDF identity are checked.
The original adjustments reconcile in integer fen before presentation.

The CNY 217,235,539.32 group independently sums 13 disclosed rows; it is not the
annual report's single “Other” row. The source dialog exposes exact bridge values,
all 13 components, page crops and the full original PDF link. Component names
retain their recorded shortened Chinese labels. Provenance and rights remain in
`public/landing/SOURCES.md`.

The example establishes amounts, not their operating cause. Both explanations
remain untested and distinguishing materials remain not obtained. Historical
operating cash does not enter current cash, future receipts or private plans.

## Product integration

Anonymous `/` renders the story; authenticated `/` retains the research workbench.
All entry actions open one existing `StartInput`, preserving company matching,
editable drafts, authentication continuation and account isolation. The optional
hypothetical payment-timing example remains separate in that entry dialog and
returns to its collapsed state after the dialog closes.

The existing application header, logo, documentation, themes, assistant and
business routes remain shared. The narrow homepage header retains Documentation
and Login; at 360px and below its search icon is omitted, while command-search
keyboard access remains available. Chapter controls have at least 44px touch
height and narrow screens show compact numbered controls with full accessible
labels. The assistant's lower-right interaction area remains clear.

## Verification

Browser checks on 2026-10-03 cover desktop and narrow layouts, both languages,
intermediate and stable frames, original crops and precise amounts, modal focus
restoration, draft persistence, static reading, dynamic reduced-motion changes,
route cleanup and the anonymous research-to-login continuation. The source dialog
contains both complete crops and all 13 group components. Visible financial SVG
text stays above the effective 12px floor on the inspected narrow viewports.

The preview uses an isolated temporary database. Browser checks do not verify a
production release, SMTP, model-provider output or a new real research report.
The pull request records the current build and CI results. Linux deployment
retention fixtures remain a Linux CI gate; their mount and cgroup safety checks
are not relaxed for macOS.
