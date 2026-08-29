---
title: Terminal Mobile - Plan
type: fix
date: 2026-08-29
revised: 2026-08-29 (Codex review round 1 incorporated)
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: founder-ask-2026-08-29
execution: code
---

# Terminal Mobile - Plan

**Target repo:** Capx-AI/terminal (local working tree `terminal-deployment/web/`).
Implement from `origin/main` (`f42ebe8` at plan time; live asset stamp `26082604`).
Founder ask, 2026-08-29: "terminal.capx.ai is not optimised for mobile viewing. Make a plan."
Reviewed by Codex the same day; all ten review points verified against the code and folded in (see Review log).

## Goal Capsule

- **Objective:** Every public Terminal page (`/`, `/t/{mint}`, `/c/{slug}`, `/register`) is usable on a 360-430px phone: no clipped content, every tile full width, the chart and heatmap readable and tappable, tables and rails reachable by touch, text at a legible size.
- **Authority:** This plan. Contract `docs/TERMINAL-V1-CONTRACT.md` section 4 (demo is the spec: bento, lime/white, starfield, sticky header) stays binding; this plan changes phone layout only, never the visual language. Contract amendments 20a and 20b recorded below, one per shipped phase.
- **Stop:** The Phase 3 acceptance list passes in the pinned Playwright harness (iPhone 14 and Pixel 7 contexts) against SAMPLE fixtures and against production, on one real iPhone and one real Android, and the suite (`node --test web/test`) plus `web/e2e.mjs` stay green.
- **Out of scope:** A separate mobile site or app. New chart language. A readout for the company-page chart (it is a static line today; see R13). Redesigning the desktop bento. Casa or Launchpad API changes. Restyling into a generic dashboard.

## Findings (measured 2026-08-29, Playwright iPhone 14, live site)

The desktop layout is fine. On a phone two CSS defects break the pages; everything else is polish.

**F1. Detail-page tiles collapse to 50px wide (token and company pages).** Root cause is a grid conflict between the demo breakpoints in `app.css` and the tiles added later in `v1.css`. At `max-width:880px` `app.css` switches `.bento` to six columns and every demo tile to `span 6`. `v1.css` (loaded after) still says `span 12` for `.t-ladder`, `.t-outputs`, and, at `max-width:1100px`, `.t-nobind` and `.t-showcase`. A twelve-span item in a six-column grid creates six implicit auto tracks; the explicit `1fr` tracks collapse to zero. Measured computed tracks at 390px: `0 0 0 0 0 0 43 43 43 43 43 43`. Auto-placement then pairs tiles two per row: identity 50px next to price 310px, chart 50px next to provenance 310px. The chart canvas is 48px wide. Company page is 5,945px tall with the same 50/310 pairing on seven rows.

**F2. Home page overflows to 454px and Chrome zooms out.** `.legendrow .planes.tight{flex:0 0 auto}` forbids shrinking, so the four-line provenance legend sizes to its max-content width (444px). `body{overflow-x:hidden}` hides the scrollbar, but the mobile layout viewport still widens to 454px (`innerWidth` 454 on a 390px device), so the whole page renders at 86% scale: the header CTA is cut, the thesis wraps wrong, the stat strip shows 2.5 cards.

**F3. Chart tile keeps `grid-row:span 2`.** Once F1 is fixed the chart is the only tile in its row pair, so the stretch makes it roughly 1,500px tall on a phone. The height belongs on `.chartbox` (the canvas box), not on the tile: the tile also holds the legend/timeframe header and the divergence footer.

**F4. Market tables are 1,620px wide by contract (`min-width:1620px`, fixed column widths).** `.tbl-scroll` scrolls horizontally, which is correct, but on a phone the visitor sees the `#` and name columns and nothing else, with no cue that the table scrolls, and the sticky header row is useless. Nothing is pinned. Note for the fix: `app.css` defines `col.c-rank{width:44px}` and the other `col.c-*` widths, but none of the three tables has a `<colgroup>`, so with `table-layout:fixed` the browser is distributing columns from the first row, not from those rules. Any sticky offset must come from real column sizing.

**F5. Type scale is below phone legibility.** Counted on the live home page: 21 elements at 9px, 21 at 10.5px, 14 at 9.5px, 13 labels at 10px, table headers at 9.5px. Mini keys on the detail pages are 9px. Inventory of the stylesheets: **74 distinct rules in `app.css` and `v1.css` set a font-size between 8px and 10.5px**, plus two canvas axis fonts at 10px in `token.js` (lines 1075 and 1180). The mono labels are part of the demo's character at desktop density; on a 390px screen with 3x DPR they are hard to read.

**F6. Tap targets below 24px.** Header links (`.back`, 15px tall), row names (`a.nm`, 15px tall), tokenlinks (19px), sort headers, filter chips (`padding:6px 10px`, roughly 24px), timeframe buttons, artifact tabs, `.open-full`, provenance chips, output rows, reader controls, live-rail items, attestation feed links. Apple and Android guidance is 44px; WCAG 2.5.8 minimum is 24px.

**F7. Hover-only affordances, and only on the token page.** `token.js` binds `mousemove`/`mouseleave` for the chart readout and event tooltips and `mouseover` for the heatmap readout. `company.js` has none of that: its chart is a static line with no readout markup, hover index, or pins, and its heatmap cells carry only a `title` (no `data-d` index), so a delegated tap handler cannot tell which bucket was tapped.

**F8. Company artifact stage.** The sandboxed website preview is `clamp(420px,57vh,660px)` tall on desktop and `60vh` at 700px. On a phone that is a full screen of a third-party site inside a page, and the wheel-vs-frame scroll trap becomes a touch scroll trap. Shortening the frame alone does not remove the trap. The "Open in new tab" link is inside `.showcase-head`, above the stage, so CSS alone cannot move it below the stage.

**F9. Sticky header plus 9-chip toolbar.** Header is 51px sticky. `.chips`, `.liveitems`, and `.attfeed` all have `flex-wrap:wrap`, so the filter toolbar wraps to three rows on a phone. Search input is fine (16px, no iOS zoom).

**F10. Register page is already fine** at 390px (docW 390, form fills width). No work needed beyond the shared header.

**F11. No browser test exists and no CI exists.** `web/package.json` has no test dependencies, the repo has no `.github/`, and `web/readme.md` does not document any browser harness. The current suite pins CSS strings with regexes; nothing renders a page.

Not a defect: the viewport meta is present on every page, `body{overflow-x:hidden}` exists, `.tbl-scroll` has `overflow-x:auto`, the search input is 16px, reduced-motion is honoured, the pulse heatmap already fits cells to its container (`fitCells`).

## Product Contract

### Summary

Capture a desktop baseline first, fix the two structural defects (F1, F2) so pages stop breaking, then make the phone layout deliberate: one column of tiles, phone-sized chart and stage, touch-reachable tables, a test-enforced phone type floor, touch targets with defined exceptions, and touch equivalents for the token page's hover readouts. Desktop stays pixel-identical, proven against the baseline.

### Requirements

**Structural (Phase 1)**

- R1. At any viewport width, `.bento` never creates implicit column tracks. Every `grid-column` span in `v1.css` is reconciled with the `app.css` breakpoints, or the phone breakpoint forces `grid-column:1 / -1` on every tile.
- R2. At 360, 390, and 430px the document width equals the viewport width on all four pages (`document.documentElement.scrollWidth === window.innerWidth`). No element outside `.tbl-scroll`, `.ghwrap`, `.artifact-tabs`, `.heatscroll`, or the Phase 2 rails may extend past the viewport.
- R3. Below 880px `.t-chart` loses `grid-row:span 2` and `min-height`, its height is `auto`, and `.chartbox` (not the tile) gets `height:clamp(240px,45vh,360px)`. The canvas fills the box. Acceptance measures `#chart`: height between 240 and 360px, width at least `innerWidth - 24` (20px gutters plus the tile's 2px of border; 368px at 390, 336px at 360).

**Layout (Phase 2)**

- R4. Below 700px every tile is full width in tile order. Price and work tiles may sit side by side between 700px and 880px only.
- R5. Market tables: all three tables in `index.html` get an explicit `<colgroup>` using the existing `col.c-*` classes so `table-layout:fixed` sizes columns from those rules. On phones the first two cells of every row pin left (`position:sticky`, `left:0` for the rank cell, `left:44px` for the name cell, opaque `#0d0e10` background, `z-index` above the row). A right-edge fade shows while the table can still scroll right; `market.js` owns a `syncScrollCue(el)` that sets `data-more` and runs on initial render, after every re-render (sort, filter, search), on `resize`, and on `scroll`. Column set and 1,620px width stay as the contract says; nothing is dropped from the data.
- R6. Home stat strip renders two cards per row on a phone with the value at 18px or larger. Podium is one column (already the case at 1100px).
- R7. Rails: below 700px `.chips`, `.liveitems`, and `.attfeed` become one scrolling row: `flex-wrap:nowrap; min-width:0; overflow-x:auto; -webkit-overflow-scrolling:touch; scroll-snap-type:x proximity; scrollbar-width:thin`, with every child `flex:none; scroll-snap-align:start`. `.trow` keeps wrapping so the search box sits above the chip rail. No wrapper element is added.
- R8. Company artifact stage on a phone: `.artifact-stage{height:clamp(220px,34vh,320px)}`, tabs stay one row scrollable. `company.html` gains a second anchor `#artifact-open-below` directly after `.artifact-stage`, styled as a full-width button; `company.js` sets `href` and `hidden` on both anchors; CSS shows only the head anchor above 700px and only the below anchor at 700px and under, so desktop markup order is unchanged. Scroll trap: below 700px the iframe starts with `pointer-events:none` under a `.stage-gate` overlay ("Tap to use the preview"); tapping the overlay adds `.live` to the stage (iframe interactive, overlay hidden, a small "Done" chip in the head restores the gate). The gate resets whenever the artifact tab changes.
- R9. Identity tile stacks: mark plus name on one row, mission below, provenance chips below that, left aligned (partly done at 1200px; finish it for 700px).
- R10. Output library rows and the reader stay one column; reader body width is the viewport minus gutters, code blocks scroll inside `pre`.

**Type and touch (Phase 2)**

- R11. Phone type floor, test-enforced: below 700px no rendered text is under 11px. Implementation is one override block at the end of `app.css` that lists every selector from the inventory (the 74 rules found by `grep -E "font-size: *(8|8\.5|9|9\.5|10|10\.5)px" app.css v1.css`), each raised to 11px, leaving desktop values untouched. A new test parses both stylesheets, collects every selector whose font-size is under 11px outside the phone block, and fails if any is missing from the phone block, so the inventory cannot drift. Canvas fonts: `token.js` reads `matchMedia("(max-width:700px)")` once per draw and uses 11px instead of 10px for axis labels. Exceptions (documented in the test): `.sr-only` and `.skip` (off-screen), `.hc` cells (no text), `canvas` elements handled in JS.
- R12. Tap targets, with a measured definition: below 700px every interactive element's *hit area* is at least 24px tall and the primary controls reach 36-44px. Inventory: `.back`, `.fchip`, `.tf`, `.artifact-tab`, `.open-full`, `.artifact-open`, `#artifact-open-below`, `.tokenlinks a`, `th[data-k]`, `.nobind-actions a`, `.outrow`, reader controls in `.reader-head`, `.liveitem`, `.attfeed .att`, `.pod` links, `.regbtn`, `.tok .nm`, `.stage-gate`. Row name links (`.tok .nm`) extend their hit area to the whole cell with `td.l{position:relative}` and `.tok .nm::after{content:""; position:absolute; inset:0}`; because a pseudo-element does not change the anchor's `getBoundingClientRect()`, the harness measures the hit area, not the element: for each inventoried selector it samples `document.elementFromPoint` on a 24px grid around the element's box and asserts the element (or its anchor) is hit across at least 24px of height. Exceptions: inline links inside running text (`.reader-body a`, `.nobind-copy a`, `.tblnote a`) and dense visualisations (heatmap cells, chart event pins), which use container-level hit testing (R13, R14).
- R13. Token page chart (`token.js` only): `pointermove`/`pointerleave` replace `mousemove`/`mouseleave`; a tap is a `pointerup` within 8px and 400ms of its `pointerdown` (so a vertical scroll that starts on the canvas never pins); a tap pins the readout (`chart._pinned = true`) until the next tap; `pointerleave` is ignored while pinned; `touch-action:pan-y` on `#chart` so vertical page scroll still works. Event pins get a 24px hit radius when `pointerType === "touch"`. The company-page chart (`company.js paintChart`) stays a static line: it gets `touch-action:pan-y` and nothing else, and the plan records that it has no readout on any device.
- R14. Heatmap, both pages: `company.js` heatmap cells gain `data-d` (bucket index) like `token.js` already has; each page gets a `paintHeatRead(i)` that paints the same `#gh-read` line the desktop `mouseover` uses; a delegated `click` on `.ghgrid` calls it and holds the readout until another cell is clicked (browsers do not fire `click` after a scroll gesture, so no movement threshold is needed). Cells stay dense (8-19px from `fitCells`) under the dense-visualisation exception in R12; the readout line is the accessible name for the tapped cell.
- R15. The `--gut` gutter stays 10px on a phone; tile inner padding drops to 12px 13px. Do not increase page length by padding.

**Unchanged**

- R16. Desktop layout, colours, and copy are unchanged. Proven by diff against a baseline captured in Phase 0: computed styles of every element on the four pages at 1440px and 1024px, keyed by DOM path, on the SAMPLE fixtures. The diff after Phase 1 and after Phase 2 is empty.
- R17. The provenance grammar, honesty copy, and reserved word "attested" are untouched.
- R18. No new dependencies in `web/package.json` and nothing new in `vercel.json` `includeFiles`. The browser harness lives in `web/tools/mobile/` with its own `package.json` pinning `playwright@1.53.0` and its own lockfile; Vercel installs only the root `package.json`, so the harness never reaches the function bundle. There is no CI, so the harness is a required item on the release checklist (Phase 1 and Phase 2 steps below) and documented in `web/readme.md`; it never silently skips. Contexts are real device descriptors (`devices["iPhone 14"]`, `devices["Pixel 7"]`: `isMobile`, `hasTouch`, DPR, mobile UA), not a bare viewport.

### Actors

- A1. Public visitor on a phone, 360-430px wide, touch only, DPR 2-3.
- A2. Public visitor on desktop (must see no change).
- A3. Maintainer running `node --test web/test`, `node web/e2e.mjs`, and `node --test web/tools/mobile` before every deploy.

### Key Flows

- KF1. Visitor opens `terminal.capx.ai` on a phone: header fits, thesis wraps, stat strip two-up, podium one column, chips one scrolling row, tokens table shows the pinned rank and name columns with price and 24h visible after a short swipe and a fade on the right while more columns remain, legend wraps under the tables.
- KF2. Visitor taps a token row: identity, price, company CTA, chart (readable, tap pins the readout), provenance tile in one column. Page height on the QNTRO page under 2,600px at 390px.
- KF3. Visitor taps a company row: identity, short artifact stage behind a tap-to-use gate, tabs, full-width Open button, then the lime Casa tiles one per row; heatmap cells fit the width and tapping one paints the readout; ledger rows readable; output rows tappable.
- KF4. Visitor rotates to landscape (844x390): the 700-880px rules apply; nothing breaks. Verified at 700/701 and 880/881 as well, since those are the rule boundaries.

## Implementation

### Phase 0: baseline and harness (before any code change)

Files: `web/tools/mobile/package.json`, `web/tools/mobile/package-lock.json`, `web/tools/mobile/harness.mjs`, `web/tools/mobile/baseline/*.json`, `web/readme.md`, `mock-casa/` fixtures.

1. Create `web/tools/mobile/` with `playwright@1.53.0` pinned (matches the browsers already cached on the founder's machine; `npx playwright install chromium` is the one-time step, documented). Add the folder to `.vercelignore` if one exists; otherwise rely on the `includeFiles` allowlist, which already excludes it.
2. `harness.mjs` exports `measure(page)` (document width, tile boxes, `#chart` box, font-size census, hit-area census per R12, header box overlap check) and `baseline(page)` (computed styles keyed by DOM path for every element).
3. Fixtures: SAMPLE mode already serves token-only, bound token (XX1), company-with-token, and company-without-token rows. Add to `mock-casa/`: one company whose artifact URLs fail (`artifact failure` state) and one company with a published outputs sidecar (`output reader` state). Record the slugs in `web/tools/mobile/fixtures.json`.
4. Capture the desktop baseline on the SAMPLE server for all four pages (each fixture state for the detail pages) at 1440 and 1024, commit the JSON under `web/tools/mobile/baseline/`. This is the "before" that R16's empty diff is computed against; without it the promise cannot be checked.
5. Document the harness and the release checklist in `web/readme.md`.

### Phase 1: stop the breakage (one PR, same day)

Files: `web/app.css`, `web/v1.css`, `web/test/a11y-outage.test.mjs`, the four HTML files (stamp), `docs/TERMINAL-V1-CONTRACT.md`.

1. In `app.css` `@media (max-width:880px)`, replace the per-tile span list with `.bento > .tile{grid-column:1 / -1;}` and keep `.t-price,.t-work{grid-column:span 3;}` after it. Under the same query: `.t-chart{grid-row:auto; min-height:0;}` and `.chartbox{min-height:0; height:clamp(240px,45vh,360px);}`.
2. In `v1.css`, move every unconditional `span 12` / `span 6` tile rule (`.t-price.wide`, `.t-work.wide`, `.t-cons.wide`, `.t-repro.wide`, `.t-ladder`, `.t-nobind`, `.t-showcase`, `.t-outputs`, and the `max-width:1100px` block for `.t-nobind`/`.t-showcase`, which becomes `(min-width:881px) and (max-width:1100px)`) under `@media (min-width:881px)` so they cannot fire against the six-column grid. Desktop effect identical; proven by the Phase 0 baseline diff.
3. In `app.css`, change `.planes.tight{flex:0 0 auto}` to `flex:0 1 auto; min-width:0;` and add `.legendrow .planes{max-width:100%;}`. This alone returns the home layout viewport to 390px (verified by injection on the live site).
4. Do not ship a `grid-auto-columns:0` guard; it hides the symptom. Fix the spans.
5. Tests: extend `a11y-outage.test.mjs` "mobile and desktop fixtures" so the pinned regexes match the new rules (`\.bento > \.tile\{grid-column:1 \/ -1`, `\.chartbox\{[^}]*height:clamp\(240px,45vh,360px\)`, `\.planes\.tight\{[^}]*flex:0 1 auto`), and assert that `v1.css` has no `grid-column:span 12` outside a `min-width` query (split the file on `@media` blocks).
6. Harness: run `node --test web/tools/mobile` on the SAMPLE server. Phase 1 gate: document width equals viewport at 360/390/430, every visible tile `innerWidth - 20` wide, `#chart` width at least `innerWidth - 24` and height 240-360, header brand and actions both inside the viewport and non-overlapping. Desktop baseline diff at 1440 and 1024: empty.
7. Release: bump the `?v=` stamp in all four HTML files; `vercel --prod` on `capx-terminal-public`; invalidate CloudFront `E1AUBHOMH0OFF3`; re-run the harness against production; log the deployment id in `terminal-deployment/readme.md`. Rollback: `vercel rollback <previous deployment>` (or promote the previous deployment in the dashboard) followed by the same invalidation; the previous stamp's assets are still on the CDN so nothing else is needed.
8. Contract amendment 20a (only what Phase 1 delivers): "Phone layout, part 1 (date). Below 880px the bento is one column of tiles in tile order; price and work may pair between 700 and 880. The chart box has a phone height. The demo remains the spec above 880px."

### Phase 2: make the phone layout deliberate (one PR, 2-3 days)

Files: `web/app.css`, `web/v1.css`, `web/index.html` (colgroups), `web/company.html` (below-stage anchor, stage gate), `web/market.js`, `web/token.js`, `web/company.js`, `web/test/a11y-outage.test.mjs`, new `web/test/type-floor.test.mjs`, `web/tools/mobile/`, `docs/TERMINAL-V1-CONTRACT.md`.

1. **Type floor** (R11): generate the inventory with the grep, hand-author the 700px block, add `type-floor.test.mjs` that re-derives the inventory from the stylesheets and fails on any selector missing from the block. Canvas fonts in `token.js` follow `matchMedia`.
2. **Tap targets** (R12): padding on every inventoried control; `td.l{position:relative}` plus the `.tok .nm::after` cover; harness hit-area census with the documented exceptions.
3. **Tables** (R5): `<colgroup>` in all three tables of `index.html` (rank, name, then the per-table columns) so `col.c-*` widths apply; sticky first two cells on phones with opaque background; `syncScrollCue` in `market.js` wired to render, sort, filter, search, resize, and scroll; `.tbl-scroll[data-more="1"]::after` fade; "swipe for more" appended to the section note on phones.
4. **Rails** (R7): nowrap, non-shrinking children, scroll snap on `.chips`, `.liveitems`, `.attfeed`.
5. **Stat strip and identity** (R6, R9): `.ag{flex:1 1 calc(50% - 1px)}` under 700px; identity stack finished for 700px.
6. **Chart touch, token page only** (R13): pointer events with the tap definition, pin state, `pointerleave` guard, touch hit radius, `touch-action:pan-y`. Company chart: `touch-action:pan-y` only.
7. **Heatmap touch** (R14): `data-d` on company cells, shared `paintHeatRead`, delegated `click` on both pages.
8. **Artifact stage** (R8): phone height, `#artifact-open-below` anchor in `company.html`, `company.js` paints both anchors, `.stage-gate` overlay with `.live` toggle and reset on tab change. The a11y test keeps the desktop `clamp(420px,57vh,660px)` pin and adds the phone pin.
9. **Output reader** (R10): `.reader-body{max-width:none}` under 700px.
10. **Harness**: extend `measure` for pinned columns (scroll the table 300px and assert the rank and name cells stay at `left` 0 and 44), rail single-row (rail `scrollHeight` equals one item height), chart tap pins the readout (dispatch a touch tap and read `#ro-date`), heatmap tap paints `#gh-read`, stage gate present and toggles, both Open anchors carry the same `href`.
11. Release: same as Phase 1 step 7 (stamp bump, deploy, invalidate, harness against production, log, rollback path).
12. Contract amendment 20b: "Phone layout, part 2 (date). Tables keep their column set and scroll horizontally with the first two columns pinned and a scroll cue. Rails are one scrolling row. Type floor 11px and tap floor 24px below 700px with the documented exceptions. The token chart and both heatmaps answer taps. The artifact stage is gated on phones. Desktop unchanged."

### Phase 3: acceptance and evidence

Run on the SAMPLE server (`SAMPLE=1 node web/server.mjs` plus `node mock-casa/server.mjs`) and again on production after each deploy.

**Contexts:** `devices["iPhone 14"]` (390x664, DPR 3) and `devices["Pixel 7"]` (412x915, DPR 2.6), plus explicit widths 360 and 430 on the iPhone context; landscape 844x390; boundary widths 700, 701, 880, 881; desktop 1024 and 1440 for the baseline diff.

**States:** home; token-only (`/t/{XY mint}`); bound token (`/t/{XX1 mint}`); company with token; company without token (`/c/agentgraph` fixture equivalent); company with artifact failure; company with outputs and the reader open; register. Live pages (QNTRO, agentgraph) are a smoke check after deploy, never the only evidence.

| Check | Home | Token | Company | Register |
|---|---|---|---|---|
| `scrollWidth === innerWidth` at 360, 390, 412, 430, 844x390 | yes | yes | yes | yes |
| Header brand and actions inside the viewport, boxes do not intersect | yes | yes | yes | yes |
| Every visible `.tile` width equals `innerWidth - 20` below 700 | n/a | yes | yes | n/a |
| `#chart` width at least `innerWidth - 24`, height 240-360 | n/a | yes | yes (with token) | n/a |
| No rendered text under 11px below 700 (census over every text node's element) | yes | yes | yes | yes |
| Hit area at least 24px for every inventoried control (elementFromPoint census) | yes | yes | yes | yes |
| Rank and name cells stay pinned after scrolling the table 300px | yes | n/a | n/a | n/a |
| `data-more` is set on load and clears at the scroll end | yes | n/a | n/a | n/a |
| Chip, live, and attestation rails are one row tall | yes | n/a | n/a | n/a |
| Chart tap pins the readout; a second tap moves it | n/a | yes | n/a (static) | n/a |
| Heatmap tap paints `#gh-read` | n/a | yes | yes | n/a |
| Artifact stage 220-320px tall, gate present, tap makes it live, tab change resets | n/a | n/a | yes | n/a |
| Both Open anchors share one href; only one visible per breakpoint | n/a | n/a | yes | n/a |
| Rules switch exactly at 700/701 and 880/881 (tile widths and pairing) | n/a | yes | yes | n/a |
| Page height at 390px | under 3,200px | under 2,600px (token-only) | under 4,500px (company without token) | under 700px |
| Desktop baseline diff at 1024 and 1440 | empty | empty | empty | empty |
| Lighthouse mobile accessibility | 95 or higher | 95 or higher | 95 or higher | 95 or higher |

Real-device pass: one iPhone (Safari) and one Android (Chrome), portrait and landscape, screenshots into `ORCHESTRATOR/audit-showcase/terminal-mobile/` with the date.

## Review log

**2026-08-29, Codex round 1.** Ten points, all verified against the code and accepted:

1. Chart height moved from `.t-chart` to `.chartbox`; canvas width assertion is relative to the viewport (R3).
2. Tables get explicit `<colgroup>`s (none exist today, so the 44px offset had nothing to stand on); scroll cue syncs on render, resize, and scroll, not scroll alone (R5).
3. Chart touch scoped to `token.js`; the company chart is a static line with no readout and stays that way, stated in scope (R13).
4. Company heatmap cells gain `data-d`; tap is `click`, not `pointerdown`, so a scroll never pins; dense-visualisation exception defined (R12, R14).
5. Type inventory is the full 74-rule grep plus two canvas fonts, enforced by a test that re-derives it; tap-target check measures the hit area with `elementFromPoint`, with inline-link and dense-viz exceptions (R11, R12).
6. Open link cannot move below the stage in CSS; a second anchor is added after the stage in `company.html` and the stage gets a tap-to-use gate on phones (R8).
7. Rails specify `flex-wrap:nowrap`, non-shrinking children, and snap alignment (R7).
8. Harness pinned at `playwright@1.53.0` in `web/tools/mobile/` with its own lockfile, mobile device contexts, never skipped, required on the release checklist since there is no CI (R18, F11).
9. Fixture states and boundary breakpoints added; desktop baseline captured in a new Phase 0 before any code changes; header overlap assertions added (Phase 0, Phase 3).
10. Every production PR carries stamp bump, deploy, invalidation, production re-check, and a rollback path; the contract amendment is split into 20a after Phase 1 and 20b after Phase 2.

## Risks and notes

- The `v1.css` span rules are the same ones that let hidden tiles tighten the desktop bento ("wide" variants). Moving them under `min-width:881px` keeps the desktop effect; the Phase 0 baseline diff is the proof, not a visual check.
- `market.js` tests pin string patterns in the row HTML (`<a class='nm' href='`); the pseudo-element tap extension is CSS only, so the pins hold. Adding `<colgroup>` changes the table markup; check `a11y-outage.test.mjs` and `filters-search.test.mjs` for `<thead>`-adjacent pins.
- The a11y test pins exact CSS strings. Update pins in the same commit, never loosen them to `.*`.
- Do not touch the 1,620px table `min-width` or the `col` widths; the contract fixes the column set and the desktop density. Colgroups make the existing widths real; they do not change them.
- Cache: HTML is `no-store`, assets are `max-age=60` plus the `?v=` stamp, and CloudFront sits in front. Bump the stamp and invalidate, or the phone keeps the old CSS for up to a minute after deploy.
- Keep `overflow-x:hidden` on `body`; it is not the fix for F2 (it hides the scrollbar but not the viewport widening), but removing it would expose horizontal scroll for any future regression.
- The `playwright` npm package downloads browsers on install unless `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`; keeping it out of the root `package.json` is what keeps Vercel builds unchanged.

## Evidence

Plan-time measurements and screenshots live in the published plan artifact (before and after injection of the Phase 1 CSS on the live site):

- Home: `innerWidth` 454 before, 390 after.
- Token QNTRO: grid tracks `0 0 0 0 0 0 43 43 43 43 43 43` before, `53 x6` after; chart canvas 48px before, 368px after.
- Company agentgraph: fourteen tiles at 50/310px before, all 370px after; page height 5,945px before, 4,021px after (before Phase 2 tightening).
