# Selected Pro research report QA

Date: 2026-10-04 (UTC). This is the current Pro acceptance record. The earlier Lite and shared-product records below are retained; the latest Lite release and shared assistant were integrated from `184b882`.

## Visual target and evidence

- Selected visual truth: `/workspace/generated_images/exec-3bfd0f17-777d-44c8-a23a-aeb9d0633065.png`; preserved as `output/browser-qa/pro-selected-20261004/selected-reference.png`.
- Real implementation: the built React/Express application at loopback, with a fresh disposable owning account, isolated storage and explicitly synthetic financial snapshots. No production user data or model-generated outcome is asserted.
- Desktop: 1488 × 1058 CSS pixels, deviceScaleFactor 1. Source: 1488 × 1057 image pixels. The comparison preserves original density and pads the one-pixel height difference rather than scaling text.
- Full-view combined comparison: `output/browser-qa/pro-selected-20261004/selected-vs-implementation-1x.png`. Final light screenshot: `captures/02a-ai-desktop-light-first-screen.png` in that directory.
- Focused combined chart comparison: `chart-selected-vs-implementation-1x.png`. It exposes labels, hatching, common axes, annual spacing, the difference marker and the ratio row at original pixel density.
- Other opened evidence: `captures/08-ai-desktop-dark.png`, `captures/10-ai-mobile-390-light.png`, `captures/10b-mobile-shared-assistant.png`, `captures/13-report-print-page1.png` and its actual PDF.

State differences are intentional: the image is an illustrative report, while the implementation displays an actual saved synthetic generation with its own headline, citations, dates, partial-review warning and grading constraints. Its company name identifies the synthetic case. The chosen layout and subdued typography are applied using existing product roles; illustrative names, scores, growth rates and prose are not inserted into real records. The required additional metadata pushes the three insights below the initial desktop viewport, while all three annual bars, annual labels, the ratio row and the grade/radar remain visible. A generic chart heading remains valid for improving and deteriorating actual records.

## Findings and repair history

1. **P2 — Overlong monetary values and broken insight numbering.** The first built comparison rendered raw yuan strings as headline KPIs and wrapped 01/02/03. Compact values now use light smaller units; exact amounts remain in titles, sources and calculations. Numbers no longer wrap. Before evidence is retained in `before/initial-captures/`; post-fix evidence is the final full-view and focused comparison.
2. **P2 — Excessive process and citation spacing obscured the main chart.** Headline citations now share the headline row, financial cards and metadata have tighter spacing, and the existing real stage list is expandable when research is idle. Running stages, failures and actions remain available. The plot is 240px high. The later inherited 48px process-summary height was diagnosed in `status-css-diagnosis.json` and fixed by a scoped desktop rule; mobile keeps a 44px target. Final desktop evidence shows the complete plot and ratio row.
3. **P2 — New section links did not reveal their exact nested target after refresh.** The new chart, analysis, calculation and dimension IDs are allowed deep links. Each dimension now reveals its own details. The rail reuses the existing reading-aware index, including keyboard focus, current-location semantics and disclosure opening, without reserving a horizontal index height.
4. **P2 — Print expanded execution stages in a narrow grid and inherited two-column KPIs.** `before/print-process-expanded-page1.png` preserves the failing paper layout. Print now omits execution controls, retains dates and the partial-review warning, and uses three compact KPIs. The main graph is on the first A4 page; all analysis, exact calculations and references remain in the printed document.
5. **P2 — Print plot labels were shrunk by a wide emulated viewport.** `before/print-wide-plot-small-labels.png` preserves this intermediate result. Print now uses a 400px plot geometry rather than measuring the wide preview viewport before paper layout. This keeps vector labels readable on paper while screen charts retain their measured widths and local mobile scrolling.

## Required fidelity surfaces

| Surface                   | Review and disposition                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fonts and typography      | The existing system stack is retained, including Chinese fallbacks. Desktop company title is 25px/600, thesis 26px/550, headline figures 28px/500, grade 42px/500; supporting screen text stays at least 12px. Compact units are lighter and smaller. Mobile wraps long company names without extending the page. The generated image's enlarged presentation text is mapped to the user's existing product hierarchy. |
| Spacing and layout rhythm | A flat white report uses a flexible main column and 324px evidence rail with a thin divider. The main chart replaces duplicated plots. Full narrative is progressively disclosed, without deleting saved content. Below 1100px the rail moves into the reading flow. The process-summary and print-density findings above were repaired.                                                                               |
| Colors and tokens         | Blue `#4263DB`, orange ink `#B76816` and pale-orange fill `#FFF3E5` use existing shared light tokens; dark and print inherit their established variants. Orange bars keep diagonal hatching. Neutral text, axes and surfaces preserve the selected restrained direction.                                                                                                                                               |
| Image quality and assets  | The existing geometric logo, shared assistant assets and icon family are preserved. Quantitative graphs are responsive vector charts driven by document facts, with exact tables and accessible descriptions. No generated report bitmap is used as a page background or substitute for live data.                                                                                                                     |
| Copy and content          | The displayed narrative, rating, facts and citations belong to the same saved generation. Missing/conflicting values remain distinct; a real zero is a zero mark, nonpositive profit makes cash-to-profit inapplicable, and an incomplete radar never closes a filled polygon. The acquired-data entry uses its current snapshot and does not fabricate a saved AI grade or generation date.                           |

## Verification

The integrated `npm run check` passed **1093/1093 tests**, types, all 493 frozen research files, production build and formatting. Presentation-only print repairs received another build and focused checks.

`browser-receipt.json` records **23/23 passed** on the integrated built application: both entrances, same-record return, exact graph data, evidence drawer, citations, full disclosures, suggested-question generation binding, native keyboard controls, rail current location, separate dimension links, hash refresh, light/dark desktop, 390px mobile, assistant panel/composer/dock access, missing/conflicting/negative/zero values and previous-report/current-snapshot separation. No page runtime errors occurred. The harness blocks the app's existing analytics loads; no external browser transport or model calls were allowed. Those blocked loads are not described as absent attempts.

`targeted-print-desktop-receipt.json` records the final paper and desktop recheck. The actual PDF expands full narrative, calculations and sources even when screen disclosures are closed. The final plot label extraction in `print-font-evidence.json` confirms 9pt axis/year labels and 9.75pt bar values, with the root reviewer also opening the repaired first page. Execution controls are omitted from the document; source dates and the incomplete-review qualification stay visible. The image/receipt manifest records artifact hashes. Only public synthetic evidence is retained in the ignored local output directory; account cookies and browser storage are excluded.

Remaining limits: Chromium was exercised locally; other engines, real source acquisition and live model narrative quality are not established by these fixtures. Production CI, deployment and exact release health are recorded separately once published. No actionable P0/P1/P2 findings remain after the final post-fix comparison.

final result: passed

---

# Search-first Lite redesign QA

Date: 2026-10-04 (Asia/Shanghai). Software references only; the three games are excluded. Pro retains its current professional experience and the previously authorized complete-report repair.

## Every company uses the approved four-channel layout

The latest requirement replaces the earlier Overview / Numbers / Evidence / Next steps screen architecture. Every saved owning-company record now opens Finance / Public records / Reputation / Original as four genuine URL pages, using the approved editorial copy and glass stage. Financial details and the complete saved report remain under the Finance fold; Original keeps the generation-bound evidence explorer. Public records and Reputation show that same record's acquired disclosures, media and discussions, with native excerpt/source folds. Missing material remains explicitly unavailable. The historical 松原安全 example and its page 190–191 crops are not transferred to other companies. Pro's professional report and seven destinations are unchanged.

The three home reading modes are compressed while preserving native 44px controls, URL behavior and keyboard focus. Short financial amounts retain exact CNY values and their own sources in native details; signed bars use one scale without numeric count-up. The blue/white palette and bounded entry, channel and background motion continue into the real-company layout.

The full source check passed **1105 tests**, strict types, all 493 frozen research files, build and formatting. An independent geometry pass passed **28 checks / 12 screenshots** at 1024px English, 390px Chinese and 320px English with synthetic very long names, 20-digit amounts, negative values and zero. It verified four native pages, readable opaque text, exact values and owning sources, no page overflow and truthful missing-original states. Evidence: `output/browser-qa/company-channel-geometry/receipt.json`. These offline synthetic owning-record checks do not establish real source authenticity or model generation.

A read-only audit found acquired public/discussion records omitted from the print dossier. The same pure saved-record renderers are now included in the print document, with closed excerpt and remaining-record folds expanded for print. Actual PDF review then found legacy pale-blue text on white; a print-only reset of the dossier's actual local scopes repaired the highlights, metadata and source links.

Complete report-screen acceptance passed **16 checks / 8 screenshots**, including native Back restoring the actual 1200px reading position exactly, saved metric → own generation-bound source → refresh, all 143 references, literal untrusted text, pending/negative/zero states and the four native 390px pages. Final print-only acceptance passed **3 checks**: all 143 legal reference IDs, every one of the 122 bulk quote bodies and each added disclosure/media/discussion title and excerpt remain present exactly once. The 647 sampled highlighted/link/metadata elements have a minimum white-paper contrast of **18.88:1**. Actual Lite and Pro PDFs have 82 and 12 pages respectively for this deliberately extreme synthetic fixture, not typical company reports. Seven actual PDF pages were inspected. Evidence: `output/browser-qa/company-channels-final/` and `company-channels-print-final/`.

The final tracked browser acceptance passed **119 checks / 47 screenshots** on `index-Dg12r2h5.js`, `LiteResearch-d0lRswRD.js` and `LiteResearch-CajaSQ3y.css`. It retains all previous real entry checks and adds two genuine local owning records with clearly synthetic snapshots/GET report overlays, four native company pages, own disclosures/media/discussion/exact amounts, refresh/history, all legacy URLs, selected-year and Lite-basis retention, recent-company switching and 320px Chinese / 390px English / 1024px English geometry. Actual normal → reduced → normal motion pauses/resumes the decorative canvas, preserves the 180px reading position and keeps financial facts legible. No unexpected browser/network errors, external source/model attempts or navigation research writes occurred. The two isolated setup records are explicit fixtures; no production financial data or model result is claimed. Earlier failed timing/selector/instrument harness attempts are retained separately. Final types, 33 targeted report/channel tests, pinned repository standards, build and repository formatting also passed.

The final factual guide-copy correction distinguishes Lite's URL-retained profit basis from Pro's existing independent basis control; it does not change company/report components. A subsequent documentation-only build and the exact new CI/deployment version are recorded in the ignored release receipt, rather than reusing the prior production baseline as this release's proof.

The previous `184b8829bd5fd0f038fe0884257755c8d030edff` release passed CI 37164277672, Deploy 37164583065 and strict HTTPS health with healthy storage. Its attempted production browser smoke passed eight checks before a transient 320px Pro-header geometry failure; the bounded settled reproduction measured 305px and showed no persistent overflow. The incomplete smoke is preserved and is not acceptance of this new all-company layout.

## Hermes-focused Lite and blue/white readability

The latest user choice supersedes the amber exploration: deep navy surfaces, white body text and one blue interaction accent. Hermes is the main reference for a centered search composer, compact findings, targeted evidence access and bounded entry motion. Its actual Pro navigation uses long-page anchors; Prispect implements four genuine reading destinations at the user’s explicit request. Pro’s professional report and seven destinations remain intact. A concurrent main commit unifying the shared assistant character was merged and preserved.

Reference evidence is fixed at `abd78e65e15686b1acd6491b24879b5458e16747`: live search/candidates and its original offline report renderer are distinguished in `output/reference-review/hermes-focused-20261004/`. Nineteen accepted captures were inspected; two premature captures were rejected and replaced. Source concepts were independently implemented without transferring third-party code or assets.

The old chapter-local blue/purple ink overrides were removed, every report chapter now shares the readable palette, the homepage letter blur was removed, and English report headings override legacy oversized typography. Compact metric cards retain exact amounts, formulas and every recorded source inside native details. Duplicate headline/summary text is presented once. Menu/source headers and mobile input area were repaired; native focus outlines are retained.

Merged full code checking passed 1086 tests, types, all 493 frozen research files, build and formatting. The subsequent palette-only and typography adjustments passed final type checking, build and formatting. The first blue build uses `index-BcaiGssd.js`, `index-C3YrMKoO.css`, `LiteResearch-DqCdEEkP.js` and `LiteResearch-jUOeQzak.css`; older warm screenshots are not accepted as its evidence. The final user-approved four-tab composition and motion build uses `index-yr72DHxc.js`, `index-C3YrMKoO.css`, `ShowcaseLanding-BVUnJ9-t.js`, `ShowcaseLanding-9m7amGrK.css`, `LiteResearch-CNCfNo1f.js` and `LiteResearch-DfM-M67_.css`.

Bounded final report acceptance passed 21 checks / 10 screenshots with explicitly synthetic owning records, no model configuration, and no research, source or question writes after local setup. It covers source-bound compact metrics, source-only versus explicit action selection, generation fencing, the 122-reference fold, English heading geometry, native Back, current/previous/pending states and negative/zero/very large values. Closed native details and all four screen pages expand for the full 143-reference printed dossier. Actual PDF receipts are retained in `output/browser-qa/report-hermes-final/`.

Final readability acceptance passed 10 checks / 11 screenshots and 33 computed text samples after standard CSS color-space normalization: the lowest sampled contrast was 8.62:1, all measured text had opacity 1 and no filter, English titles were 40px and narrow titles 27px. Sticky page navigation meets the actual 60px mobile header without overlap. The same-generation evidence deep link returns to its recorded scroll position with a 0px difference. Extreme 143-source / 122-fanout synthetic printing yields 75 Lite pages and 12 Pro pages; every source ID and original quote is retained, and each bulk original appears once. These are fixture-specific page counts, not typical real reports. Evidence: `hermes-focused/final-readability/` and `report-hermes-final/pdf-proof.json`.

A final presentation-only pass on the four-tab composition/motion build passed 7 checks / 3 screenshots: desktop/390px same-scale compact numbers and exact details, an opaque mobile page-navigation surface, the retained single blue border language, normal bounded card entry, live reduced-motion cancellation and all four static print pages. No report-document, amount or source-binding logic changed after the 21-check PDF pass, so the 143-reference document result remains applicable. Evidence: `output/browser-qa/report-hermes-final-presentation/`.

The final tracked entry acceptance passed **90 checks / 39 screenshots** on that exact composition/motion build. It covers the preserved four example renderers and their source/step controls, 1024px two-column English financial geometry, real directory lookup, clearly labeled metadata error/empty/cancel protocol fixtures, owner history, annual controls, shared single-character docks and short-screen panels, menus, native focus and reduced motion. No unexpected browser/server errors, outgoing source/model requests or research writes occurred. Failed early geometry/timing harness attempts are archived separately and were corrected without product changes. The root reviewer also opened final desktop search, finance, public items, reputation, the original-source dialog and bilingual report captures.

Two guide captures taken before GSAP entry finished were rejected as complete-scene evidence; a scoped follow-up passed four checks and supplied two settled replacements, preserving the originals. A real desktop pointer check then found the floating assistant covering the Terms footer link. Lite alone now reserves its launcher space above 440px. Eight checks / four screenshots at 1440, 1024, 441 and 390px verify all twelve actual footer-link clicks reach their intended documents, without opening the assistant or creating research. The final CSS-only repair build uses `index-ewZjWbyW.js` and `ShowcaseLanding-C6NTwR-c.css`; report styles and source-binding logic are unchanged. Evidence: `hermes-focused/final-guide-replacements/` and `hermes-focused/final-footer-targets/`.

CI 37163951912 failed one existing API test after the fixed 2026-10-03 fixture timestamp crossed its real 24-hour cache boundary. The same failure reproduced locally (8/9); a stable recent fixture timestamp restored 9/9 without changing any API, cache TTL or 200/202 assertion. Fresh CI, deployment and production verification remain separate release gates.

This redesign validates display and interaction. It does not establish successful live AI generation; the existing production synthesis timeout remains a separate known issue.

## Earlier whole-flow polish

The deployed `30f526b` baseline passed CI 37151361495 and Deploy 37151658315. Its exact production health version, healthy storage and 19 read-only production assertions / six actual screenshots were independently verified. The three games remain excluded; the eight software reference studies remain the design basis.

A further ordinary-user audit found and repaired loss of the chosen year when opening Pro, mobile menu text overlap, a 320px launcher hit-target obstruction, native offline-fetch messages, identical finance/risk preview responses, and loss of reading position when changing reduced motion. Mobile Lite now uses one opaque, fixed 64px assistant dock with safe-area and matching page/panel space. Risk opens the real historical amount difference as an inquiry, without claiming a cause or loss. The public bilingual guide now explains both experiences and the same-record switch; Pro layout is retained.

The final full `npm run check` passed **1069 tests**, type checking, all 493 frozen research files, client build and formatting. Limited entry-repair acceptance passed 21 assertions / 13 screenshots for touch targets, menus, footer access, focus, offline recovery, 2021 → Pro annual settings and the bilingual guide. The final frozen-build mobile-menu follow-up passed four assertions / four screenshots: full 320/390px title bounds, opaque sticky header, native short-screen scrolling and reachable footer.

Limited report-state acceptance passed 17 assertions / 40 screenshots over pending, empty failure, observations, saved rules, partial review, previous-report update/failure, withheld scope, long company names, zero/negative figures and missing references. The first-screen status states the actual saved generation and source snapshot; empty data never claims to have been acquired. A separate 122-source fanout fixture passed three assertions / one screenshot: two default source links, native expansion retaining every ID, and complete closed-disclosure print output. Actual PDFs retain all late actions, conditions, dimensions, amounts and all 143 source IDs; each original quote appears once. These are clearly synthetic records, not live model success.

Built-page motion acceptance passed nine assertions: offscreen/hidden marquee pause, visible resume, normal → reduced → normal preserving scroll position, undisturbed subsequent native scrolling, static CSS/Canvas and cleanup. No research or model request was submitted by this check.

One actual production visitor research for 300893/2025 acquired the exact financial fields and completed 20 source, ownership and same-record Lite/Pro reading checks. Automatic public analysis made four planning calls and one synthesis call, then timed out; the retained document is a **rules report**, not generated AI narrative. Three follow-up questions are rule questions. Evidence: `production-real-financial-20261003/receipt.json` and `actual-outcome.json`. Its immediate desktop-to-390 resize recorded document width 448; the focused built-page reproduction measured 375 immediately and after 700ms, with no rightward viewport overflow. The original observation is retained, rather than counted as a passed mobile production check.

The model-input repair removes confirmed duplicate same-source disclosure/note text and preserves the rich planning catalog. It retains longest already-provided literal text, source IDs, URL/page/date/hash metadata, saved records, model deadlines and request budgets. This reduces repeated input; it does **not** establish the cause of the observed timeout. Focused model, agent and public-payload checks passed 97 tests. A later production verification must record its own outcome.

Receipts are ignored artifacts under `output/browser-qa/entry-bounded-repair/`, `report-state-final/`, `report-fanout-final/`, `lite-motion-lifecycle-built/` and `production-real-financial-20261003/`. Failed harness attempts retain their actual causes separately; they are not hidden or counted as product passes. Other browsers, operating-system IME and unvisited private/legacy workflows remain outside this acceptance.

## Search-first release baseline

- The homepage centers genuine company search, four reading prompts and a procedural local optical background. Separate financial, public-record, reputation and original-page presentations replace repeated artwork. Finance scenes preserve exact historical CNY values and the integer-fen difference; other absent example materials stay explicitly unavailable.
- Saved results connect distinguishable question cards to their exact metrics, sources, quotes and reverse citations. Unknowns stay separate. The full saved dossier and source register remain available. Filters and six-item pages affect local presentation only.
- The full check passed 1034 tests, types, frozen research integrity, build and formatting. Nine subsequent typed-metric regressions passed, bringing the expected CI suite to 1043. Focused report/index/metric regressions passed 27 tests after final integrations. The ninth metric regression subsequently verified selected-year-first presentation and retained historical amounts without mutation.
- Entry browser acceptance passed 74 assertions / 38 screenshots: native IME, real metadata candidates with ArrowDown/Escape, owner history, annual selection, menus, four channels, original dialog, scanner, exact figures, 900px amount-cell geometry, 320/375/390px bilingual layout and reduced motion. No research writes, outbound model/source requests or browser errors occurred; the existing exact analytics URL was replaced with empty JavaScript and recorded.
- Synthetic full-report acceptance passed 55 assertions / 36 screenshots: targeted metric/source inspection, reverse focus, 143 references across 24 local pages with no duplicates or omissions, filter/page reset, generation replacement, withheld mismatches, parent-basis saved follow-ups, complete narrative and print. These synthetic reports do not establish a real model result.
- A fresh genuine 300893/2025 acquisition passed 10 assertions / 7 screenshots. Seven financial periods were retrieved; four annual CNY amounts match the saved provider snapshot exactly, the new explorer displays actual observations and 143 recorded reference links, and same-run Lite → cached Pro → Lite adds no source call, research write or revision. No model was configured. An initial genuine harness miscounted both source-card containers and their nested content; that selector failure is retained separately, and the corrected six-card check passed.
- PDF review found duplicate narrative/reference blocks in the new Lite export. The final print pass keeps the complete main dossier with exact source IDs, prints each legal source once, and removes repeated reverse text and legacy reference entries. Nineteen print-fix assertions and thirteen screenshots passed; the last release build then passed 22 targeted assertions and 14 screenshots, including current-year-first figures and retained historical fields. Actual PDFs retain every late action, condition, dimension, metric, unknown and source; the ordinary Lite fixture shrank from 46 to 32 pages and the 143-source fixture from 116 to 65 pages. Pro remains 12 pages. The source quote and last bulk source each appear once. Existing summary-to-detail repetition is retained, not described as all prose appearing only once.

- Final visual review identified a transient second amount mask from the legacy GSAP wrapper. The new stage already owns its motion; it is excluded from that wrapper, retains overflow clipping without a scrollable container, and has additional immediate/settled 900px and mobile checks. The Lite assistant is smaller below 440px to reduce overlap; Pro is unaffected. Summary chips prioritize the selected year and show three figures before the native historical disclosure.

Evidence: ignored `output/browser-qa/receipt.json`, `report-v4/receipt.json`, `lite-results-v4/receipt.json` and the later `entry-v4-final/`, `report-v4-final-print/` and `report-v4-release/` receipts. The reference reviews distinguish original frontend demos, synthetic output, fixed source code and live pages. Unconfigured local model behavior, live generated answers, unvisited legacy paths and other browser engines remain outside these checks.

## Earlier complete-report repair history

# Complete report and Lite search repair QA

Date: 2026-10-04 (Asia/Shanghai).

- Restored the saved narrative omitted by both report paths: strengths, risks, six dimensions, actions and change conditions. The new pure document retains the saved snapshot, rating and references. Synthetic completed reports are explicitly labeled; they verify layout and binding, not a successful real model call.
- Replaced repeated prism placements in menus, process previews and Lite results with actual route, historical example, annual dossier and source-register presentations. The hero retains one decorative optical asset. Native search uses real candidates and owner-scoped recent reports.
- Full `npm run check` passed 1024 tests, types, frozen research integrity, build and format. After browser fixes, typecheck and 19 report regressions passed again.
- Actual entry checks passed 52 assertions / 23 screenshots. Desktop/narrow bilingual keyboard, reduced motion, menu, three distinct process devices, source scanner and recent-report empty states passed without research writes or browser errors.
- Full synthetic-report browser acceptance passed 40 assertions / 29 screenshots, including Pro/Lite full paragraphs, targeted citations, safe literal text, saved-generation follow-ups, old snapshots, NR provisional consistency, 1440/390/320/300 layouts and complete print PDFs. Pro citation anchors now clear the real sticky index. Lite paper references include readable URLs, quotes and page metadata rather than only link annotations.
- One genuine 300893/2025 acquisition with the execution environment proxy enabled returned seven financial periods. Four displayed annual amounts equal the saved public snapshot exactly; same-run Lite → cached Pro → Lite added no research write, source request or revision. This has no configured model. An initial local run without environment-proxy transport failed truthfully at issuer lookup; it was retained as failure evidence rather than counted as data acceptance.
- Browser review found and fixed Pro English guest header overflow at 320/300px, source-anchor overlap, transparent search controls over bright hero art and missing Lite print reference text. No unresolved P0/P1/P2 remained in the exercised surfaces. Live model answers and unvisited legacy paths are outside this acceptance.

Evidence: ignored `output/browser-qa/receipt.json`, `report-v3/receipt.json` plus PDFs/captures, and `lite-results/receipt.json`. New public-source studies are independent of these application fixtures; games have been excluded from further implementation at the user's direction.

## Earlier optical iteration history

# Lite optical redesign design QA

Date: 2026-10-04 (Asia/Shanghai).

**Findings**

- [P2, resolved] The 1440px English headline's outlined ending fell over near-white prism glass. Keep the English second line solid lime, add a thin dark stroke and a dark text shadow; preserve the Chinese outline. The fresh full English capture and `output/browser-qa/v2-comparison/en-ending-before-and-after.png` show the complete ending clearly against the glass.
- [P2, resolved] The intermediate narrow hero let its bright prism crowd the sample-company row. Move the mobile artwork down, shorten the unnecessary hero height and group the annual selector with the Pro link. Fresh 390px, 375px and 320px captures now separate the editable task controls, sample row and artwork.
- [P2, resolved] A single-page footer misidentified the scanner when its second original was revealed, and the superimposed rows could suggest correspondence. The footer now says p.190–191, identifies the continuation as cash-flow reconciliation, and states that the two original pages' rows do not align. Fresh desktop/mobile endpoints show those labels, while the exact displayed amounts remain unchanged.
- [P2, resolved] On narrow screens, source values and the selected process preview followed too much decorative content. Move the two meaningful amounts ahead of the scanner and put only the active preview directly inside its selected process step. Fresh mobile evidence/process captures confirm that reading order and the correct real asset for each step.
- No open P0/P1/P2 was found in the inspected Lite entry, menu, historical-source and process views. This is a scoped comparison of the requested art direction and actual application, not a pixel clone verdict, complete accessibility audit or acceptance of model-generated answers.

**Comparison target and evidence**

The user's latest instruction supersedes the earlier monochrome paper concept: build an expressive Lite experience with color and motion inspired by the live reference, while retaining the existing restrained Pro experience. The current comparison targets are the observed JieJoe techniques and the project's original generated optical asset. Its website illustrations, logo, portrait and typography are not copied into Prispect.

- Source visual truth paths: `output/reference-review/v2-jiejoe/01-hero.png`, `04-menu-open.png` and `08-portrait-scan-lower.png`. Each source capture is 1440 × 1000 pixels at a 1440 × 1000 CSS viewport and density 1. The live behavior and its limits are recorded in `output/reference-review/v2-jiejoe/motion-review.md`.
- Original generated asset truth: `/workspace/generated_images/exec-c78e3693-8da1-4e1b-9e4c-2236e499f706.png`; deployed decorative asset: `public/showcase/optical-prism.webp`, 1254 × 1254 RGBA. The source image and rendered region were opened. Asset provenance, processing and display-font license are in `public/showcase/SOURCES.md`.
- Implementation: actual production build at `http://127.0.0.1:4338`, Lite `/` and preserved Pro `/query`, with a fresh temporary guest session. No company research was submitted in this entry check.
- Main implementation capture: `output/browser-qa/lite-desktop-zh-light.png`, 1440 × 1024 CSS/pixels, density 1, Chinese/light, page top, menu closed and entrance complete. English desktop uses the same viewport. Narrow captures use 390 × 844 English/dark, 375 × 812 Chinese/light/reduced-motion and 320 × 768 English/light/reduced-motion, all density 1.
- Density normalization: both desktop source and implementation are density 1. Hero/menu/scanner full comparisons retain the source's 1440 × 1000 pixels and crop the implementation's bottom 24 pixels to the same canvas. Sources and implementation represent different products and content; this normalization supports composition/technique comparison, not exact geometry identity.
- Full-view combined comparison inputs: `output/browser-qa/v2-comparison/hero-reference-and-lite.png`, `menu-reference-and-lite.png` and `scanner-reference-and-lite.png`.
- Focused combined inputs: `headline-reference-and-lite.png`, `asset-source-and-rendered.png`, `scanner-keyboard-endpoints.png` and `en-ending-before-and-after.png`, in the same comparison directory. Headline and art panels are contained within equal comparison frames; original crops remain available. The asset panel explicitly contrasts the full generated square with its intentionally enlarged/cropped responsive hero placement.
- An old/current narrow composition comparison is `query-mobile-before-and-after.png`; its labels explicitly distinguish old Chinese/light and new English/dark content. It documents the redesigned UX, not a same-state fidelity measurement.
- All 21 final implementation captures were reviewed, including the desktop/mobile source endpoints and process previews. `final-desktop-sheet.png` and `final-narrow-sheet.png` index this last stable run. Focused full-resolution images were also inspected; contact sheets do not replace them. All combined comparison inputs above were opened and inspected.

**Required fidelity surfaces**

| Surface                          | Current result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fonts and typography             | JieJoe's condensed Latin display hierarchy is intentionally adapted to the licensed Prispect Display/Noto Sans CJK bold face, with native body/input text. Large solid/outline Chinese words carry the requested visual hierarchy. Bilingual headlines fit their masks at 1440px and 320px; English uses solid type over bright glass for readability. Labels and native editable text remain distinct from the decorative lettering.                                                                    |
| Spacing and layout rhythm        | The desktop pairs a large right sculpture with the left headline and a stable query area; source/process chapters switch full scene rather than repeating the hero. Mobile puts the task first, then artwork, amounts and native scanner. Annual/Pro controls stay together; samples do not collide with the prism. Every tested header control and page remains inside its viewport.                                                                                                                    |
| Colors and tokens                | Dark olive/charcoal with acid lime `#c7ff3a`, cyan `#89ecff`, ivory text and violet menu offset type carries the reference's dark/neon contrast. The process/menu become bright lime scenes; the source chapter stays dark for reading. Bright-glass English contrast was fixed. Light/dark preferences retain different dark scene values; Pro keeps its original restrained palette.                                                                                                                   |
| Image quality and asset fidelity | The actual 1254px transparent optical-prism asset preserves the black chrome, glass ribbons, lime edge and cyan/violet iridescence seen in its generated source. It is not replaced by CSS/SVG art. Responsive cropping is intentional; there are no visible transparency halos in the inspected views. Real p190/p191 report crops remain unchanged, and their small mobile previews link to a readable original dialog. Decorative canvas points are separate from source images and financial values. |
| Copy and app content             | Canonical `让企业判断，有据可查。` / `Make company judgments traceable.` stays complete. Query/year/sample/menu labels describe real actions. The source example explicitly names 松原安全 2025, annual/consolidated/CNY, with exact 366,373,098.93 and 26,197,123.70 values. The scanner identifies both original pages and the lack of row correspondence. It suggests further checking rather than inferring a cause from the amount difference.                                                      |

Intentional adaptations: transfer whole-scene contrast, kinetic solid/outline type, a pointer-responsive optical sculpture, menu focus previews and an X-Ray reveal. The personal site's portrait is replaced by genuine financial original pages; its horizontal scroll-controlled scan becomes a vertical keyboard-operable range reveal. Retain Prispect's own brand, company/year workflow, account/language/theme controls, assistant and Lite/Pro links. Reference-site tiny controls and ongoing reduced-motion loops are not copied. Native input focus pauses the ambient canvas, and reduced-motion loads a ready static image/canvas state.

**Actual browser acceptance**

- `node --import tsx scripts/browser-qa.mjs` passed **48 checks with 21 screenshots** after the final English contrast fix and the latest combined production build. Evidence: `output/browser-qa/receipt.json`. No financial fixtures, production data or outgoing public source/model request was used.
- Checks preserve the original entry-flow coverage: real guest readiness, native IME editing, sample filling without submission, annual selection, full-screen menu keyboard focus/preview, Escape/focus restoration, original-dialog images and distinct Lite → Pro query → Lite navigation.
- New optical coverage waits for `data-hero-ready="true"`, the loaded original prism and completed entrance before screenshots. Actual left/right pointer states change the prism transform and canvas image; focusing the native company field pauses the canvas. The screenshot differences include ambient animation, so no claim isolates pointer motion as their sole cause.
- Source range ArrowRight/Home/End changes both `--scan-position` and actual image clipping, preserves the two exact amount strings, and exposes real p190/p191 crops. Each of the three process steps changes its pressed state and correct loaded asset; mobile selects an inline preview within the active step.
- Fresh reduced-motion checks at 375px and 320px keep the loaded optical canvas static through pointer movement. Header/label/headline/overflow checks cover the bilingual and narrow states. The receipt records zero console errors, page errors, failed responses/requests, blocked source/model attempts and research writes.
- The exact existing `https://analytics.lailai.one/script.js` telemetry script is served as empty JavaScript in local acceptance and explicitly listed in the receipt. Analytics behavior is outside this check.
- Separate result-agent evidence is `output/browser-qa/lite-results/receipt.json`: one genuine 松原安全/300893/2025 acquisition, nine checks, exact source-backed values, seven recorded links, local profit-basis changes and same-owning-run Lite → cached Pro → Lite without a new research POST/source call/context revision. No model was configured or submitted. Its seven result captures precede two isolated CSS corrections (opaque sticky chapter navigation and optical-wrapper hover); those corrections are included in this final build, but this entry run did not re-acquire or recapture a financial result. Result screenshots are therefore not represented as post-correction visual evidence.

**Comparison history**

1. Current-run old production captures in `output/reference-review/v2-current/` showed the repeated white-paper presentation and distant mobile previews. The new original optical asset and distinct full scenes implement the user's revised direction; the combined source/implementation inputs document intentional transfer of the selected reference techniques.
2. Intermediate redesigned captures exposed narrow sample/art crowding, amount reading order, process preview placement and scanner attribution. Source/CSS fixes above were followed by a stable build and fresh desktop/mobile hero, scanner and process captures. The intermediate files were overwritten by later runs; the final evidence is named explicitly rather than presented as before images.
3. The subsequent stable 48-check run exposed the English outline-on-glass P2 during actual visual inspection despite passing geometry. `v2-comparison/before-fix-desktop-en-glass.png` preserves that full state. After the scoped English glyph/backing fix, a new build, all 48 checks and 21 captures passed. `en-ending-before-and-after.png` compares the same x710–1120/y320–460 crop at density 1 (enlarged 2× only for inspection).
4. Earlier lazy-asset build races and a harness selector mistake were test setup defects, not design iterations. They were resolved before the stable acceptance runs and do not support a product quality claim.

**Open Questions and limits**

No unresolved design decision blocks the inspected Lite entry. Other browser engines, full zoom/screen-reader/touch coverage, all hidden legacy flows, production analytics and model/assistant answers were not exercised. Local screenshots do not establish deployment status. A later Git integration or production smoke must identify its own release/build and evidence.

**Implementation Checklist**

1. Source captures and generated asset opened; desktop density/crop normalization recorded: completed.
2. Full/focused combined comparisons and all five fidelity surfaces: completed.
3. Desktop/mobile/menu/source/process captures plus real native entry interactions: completed.
4. P2 fixes followed by a fresh stable build, 48 checks and 21 reviewed screenshots: completed.
5. Live result evidence is scoped separately, with its two later CSS-only changes disclosed; no live-model acceptance claimed.

**Follow-up Polish**

No additional P3 change is required for this handoff. Future animation changes must retain native text composition, focus pause, reduced-motion static readiness, genuine source images and stable exact financial values.

final result: passed

<details>
<summary>Historical monochrome and workspace QA — superseded visual direction</summary>

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

</details>
