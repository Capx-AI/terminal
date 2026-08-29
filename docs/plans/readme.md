# terminal-deployment/docs/plans

Implementation plans for Capx Terminal. Target repo is `Capx-AI/terminal`.
Work from `origin/main`, not a stale local checkout.

## Contents

- `2026-08-24-001-feat-company-casa-tiles-plan.md` — paint Casa company-record tiles on `/c/{slug}` and fill market-table company columns (no price).
- `2026-08-29-002-fix-mobile-plan.md` — make terminal.capx.ai usable on phones: fixes the 50px tile collapse and the 454px home overflow, then a deliberate phone layout, type floor, touch targets, chart and heatmap tap readouts. Three phases with a measured acceptance table.
- `2026-08-29-003-mobile-density-plan.md` — founder-decision proposal: DexScreener fits 102 numbers on the first phone screen of a pair page, Terminal fits 10; the data is already in the API. Key-numbers strip, key-value market rows, four-up stat strip, podium rows, a second line under table names. Four phases, D0 to D3.

## Log

- **2026-08-24** — Folder created with the company Casa tiles plan.
- **2026-08-29** — Mobile plan added after a Playwright iPhone 14 audit of the live site: bento grid conflict between `app.css` breakpoints and `v1.css` spans collapses tiles to 50px; `.planes.tight{flex:0 0 auto}` widens the home viewport to 454px. Phase 1 CSS verified by live injection before writing.
- **2026-08-29 (later)** — Mobile plan revised after Codex review round 1. All ten points verified against the code and accepted: chart height on `.chartbox`; tables need `<colgroup>`s before any sticky offset; chart touch scoped to `token.js` (company chart is static); company heatmap cells need `data-d`; full 74-rule type inventory enforced by a test; hit-area measurement via `elementFromPoint`; second Open anchor below the stage plus a tap-to-use gate; explicit nowrap rails; pinned Playwright harness in `web/tools/mobile/` on the release checklist (no CI exists); Phase 0 desktop baseline and fixture states; release and rollback steps per PR with the contract amendment split 20a/20b.
- **2026-08-29 (shipped)** — Phase 0, 1, and 2 implemented the same day; Phase 2 ran as five parallel work packages on isolated branches, integrated on `mobile/phase2-integration`. Contract 20a and 20b record what shipped.
- **2026-08-29 (density)** — Mobile density proposal added after measuring DexScreener, Birdeye, CoinGecko, and Terminal in real Chrome at iPhone 14 size. Not built; waits on the founder.
- **2026-08-29 (density shipped)** — Founder said ship it; D0 to D3 built in one pass by the orchestrator (no fan-out: every step touched the same files). Contract 20c.
