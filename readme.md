# terminal-deployment

Go-forward working tree for Capx Terminal. Visual north star is
`~/Documents/july/capx/capx-terminal-demo/`. Casa progress is read from
`casa.capx.ai`. Price comes from Launchpad / market data. This folder is
not the old `terminal/` log and not the uncommitted `capx-onchain` v2 tree.

## Contents

- `GROK-TERMINAL-DEPLOYMENT-PROMPT.md` — original kickoff (Q&A then board).
- `GROK-TERMINAL-SURFACE-UPDATE.md` — **paste this now**: wire the demo to the
  widened Casa `GET /v1/tokens/{mint}` (calendar, ledger, claimed north star).
- `docs/TERMINAL-V1-CONTRACT.md` - frozen 2026-08-20, amended 2026-08-21 for token-optional directory and `/register`.
- `progress/` — operator board on `http://127.0.0.1:4199/`.
- `web/` - product on `http://127.0.0.1:4200/` (`SAMPLE=1`).
- `mock-casa/` - fixture `GET /v1/tokens/:mint` on `:4201`.

Run localhost (three processes):

```bash
node progress/server.mjs
node mock-casa/server.mjs
SAMPLE=1 node web/server.mjs
node web/e2e.mjs
```

## Log

- **2026-08-29 (Fable, density live)** — Founder: ship the density proposal.
  Built in one pass (D0-D3, ~40 min wall clock): key-numbers strip on token
  and company pages, one-row identity with clamped description, key-value
  market rows, four-up stat strip, two-line thesis, podium rows, second line
  under table names; harness `factCensus` + `test:phase3` floors; baseline
  keyed by rendered siblings. `51e5a0f`, Vercel
  `dpl_5fnEcciVPHmXRqU7EmbJSMJ9rfru`, stamp 26082904, invalidation
  `I16AAGMDYCOF08QEZNUL92RN4Z`. Rollback: `vercel rollback` to
  `capx-terminal-public-k8zstqlaj-capx.vercel.app`. Production numbers above the fold at 390:
  home 12 to 24, token 10 to 16, company 4 to 10. Contract 20c.
- **2026-08-29 (Fable, density)** — Founder asked how much more information
  the phone view could carry, DexScreener as the reference. Measured in real
  Chrome at 390px: DexScreener pair page 102 numbers above the fold, Terminal
  token page 10, company page 4, home 12. Proposal with mocks in
  `docs/plans/2026-08-29-003-mobile-density-plan.md` (not built; three
  decisions for the founder).
- **2026-08-29 (Fable, hotfix)** — Chrome-extension session (500px window,
  the macOS minimum) found the header Register link flush at the edge below
  700px: the wrapped `.hrow` padding dropped the `.wrap` gutter. Fixed,
  harness asserts the gutter, live-presales countdown rail excluded from the
  desktop baseline. `f0fc0aa`, Vercel `dpl_8PVPQKjWr7SCPnncAaWiTjDTwnnH`,
  stamp 26082903, invalidation `I77RKECAC6YCNKN136X52CXNH5`. Real Chrome
  phone screenshots (iPhone 14, Pixel 7, landscape) delivered to the founder.
- **2026-08-29 (Fable, Phase 2 live)** — Five parallel work packages (W1-W3
  Codex gpt-5.6-sol xhigh, W4-W5 Grok 4.6 xhigh) in isolated worktrees,
  6 to 32 minutes each, integrated on `mobile/phase2-integration` with seven
  orchestrator fixes (see `ORCHESTRATOR/TERMINAL-MOBILE-WAVE-EXECUTION.md`).
  Commit `854df0c` on main (author HBx, pushed as 0xhbx), Vercel
  `dpl_DqH3P3oCuKCfgGab2jbEGMzKGwm6`, stamp 26082902, CloudFront
  invalidation `I4V2FYMQZ3KBQY3ORHVA2N0A04`. Suite 81/81, harness phase 1
  7/7 and phase 2 9/9, e2e ok, desktop baseline diff empty. Production
  verified in iPhone 14 emulation at 360/390. Contract 20b. Board `:4203`
  shows live sessions and wall-clock actuals (calibration 0.13). Open: real
  device pass, Lighthouse. Rollback: `vercel rollback` to
  `capx-terminal-public-4ou7oiezg-capx.vercel.app`.
- **2026-08-29 (Fable, Phase 0 + Phase 1 live)** — Harness `web/tools/mobile`
  (Playwright 1.53 pinned, stubbed upstreams, SAMPLE=1; desktop baseline at
  1024/1440). Phase 1 CSS: one-column phone bento, chart box height, legend
  shrink, header wrap; v1.css spans under min-width:881px. Commit `25290fa`
  on Capx-AI/terminal main (author HBx, pushed as 0xhbx), Vercel
  `dpl_5Az9w4gpH5xCgLscyByXfP8u92L8` on `capx-terminal-public`, stamp
  26082901. Production measured in iPhone 14 emulation at 360/390: every
  page docW = device width, all detail tiles full width, chart box 338x299 /
  368x299. CloudFront invalidation `E1AUBHOMH0OFF3` pending founder AWS SSO
  login (HTML is no-store and the stamp changed, so live is already correct).
  Suite 74/74, harness 7/7, e2e ok. Contract 20a. Board on :4203
  (`progress-mobile/`). Rollback: `vercel rollback` to
  `capx-terminal-public-iuqs22uim-capx.vercel.app`.
- **2026-08-29 (Fable, mobile plan)** — Founder: terminal.capx.ai is not
  optimised for mobile. Audited live pages in Playwright iPhone 14 emulation.
  Two structural defects: (1) token and company bento collapses to 50px
  tiles because `v1.css` span-12 rules fire against the six-column grid
  `app.css` sets at 880px (computed tracks `0 x6, 43 x6`); (2) home layout
  viewport widens to 454px because `.planes.tight{flex:0 0 auto}` cannot
  shrink. Candidate CSS injected live restores 370px tiles and a 390px
  viewport. Plan with three phases and acceptance table:
  `docs/plans/2026-08-29-002-fix-mobile-plan.md`. No code changed yet.
- **2026-08-29 (Fable, review round 1)** — Codex reviewed the mobile plan;
  ten gaps, all confirmed in code (no colgroups, static company chart,
  title-only company heatmap cells, Open link above the stage, wrapping
  rails, 74 sub-11px rules, no browser test, no CI). Plan revised in place
  with a Phase 0 baseline/harness step, split contract amendments 20a/20b,
  and per-PR release/rollback steps. Still no code changed.
- **2026-08-26 (Fable, bound pairs)** — Backed and attested section shipped
  (`f42ebe8`): company_with_token rows render in a lit combined band at the
  top of the home market (price/24h/volume/FDV/spark + health/tasks/heatmap/
  attested), sorted by health, removed from the general tables; Bound pairs
  count added to the stat strip. Section stays hidden until the first real
  bind. Suite 74/74, e2e extended.
- **2026-08-26 (Fable, tabs out)** — View tabs removed per founder
  (`8260548`, contract §19): detail pages are one scrolling page again,
  with every U1-U3 addition (digest, day-grouped ledger, hourly pulse,
  half-width stage, output library + reader) rendered inline in tile
  order. tabs.js deleted; per-view CSS dropped; asset stamp 26082603.
- **2026-08-26 (Fable, U3)** — Output library shipped (`1057c08` +
  `179436d`, CLI deploys; Casa CORS `b6225d4` on ECS): company pages gain
  an Outputs view listing published playbook deliverables with
  committed-event badges, and a reader that fetches from the company casa
  host, renders via the new zero-dep escaping `web/md.js`, and verifies
  sha256 in the browser against the listing and disclosed ledger events.
  Home gains a Latest outputs rail from a URL-free sidecar summary.
  Contract §18. Gotchas logged: vercel.json includeFiles is an allowlist
  (new assets must be added), and a stale :4200 server can validate old
  code. Suite 74/74, e2e ok.
- **2026-08-26 (Fable, U1)** — Tabbed detail views shipped (`d98fac8`, CLI
  deploy `2dkzvg6ou`): company and token pages regroup under a sticky
  Overview / Work / Verification / Market bar, hash-routed, CSS-only
  visibility via data-view attributes. Market tab only with a token or
  plottable chart; Work/Verification only when bound. Weekly digest line on
  the company Overview; day-group headers in both disclosed ledgers. New
  shared `web/tabs.js`. Contract amended (section 17). Suite 70/70, e2e ok,
  live verified stable. U2 (Casa outputs publish pipeline) awaits the
  founder's timing call vs the audit freeze; U3 (library + reader) follows U2.
- **2026-08-26 (Fable, later)** — Company-page polish shipped (`c1cb435`,
  CLI deploy `4t003an0y`): artifact stage shrunk to clamp(280px,38vh,440px)
  so the record below the website/one-pager/deck preview is discoverable,
  and the work heatmap is now an hourly grid over the last 7 UTC days
  (fill = disclosed ledger events per hour, ring = the hour the last
  attestation landed; daily claimed counts are never spread). Height pins
  in two tests updated; 70/70 + e2e. Live verified stable.
- **2026-08-26 (Fable)** — Terminal rework T1+T2 shipped to terminal.capx.ai
  (commit `357696d` on Capx-AI/terminal main, author HBx; Vercel
  `capx-terminal-public` + CloudFront invalidation `E1AUBHOMH0OFF3`). Home:
  proof-first stat strip (Work 7d fixed), thesis line, split Tokens/Companies
  tables, Show-ended chip, live-presales rail, latest-attestations feed,
  Launch-a-token CTA. Token page: no-bind CTA tile, age-aware chart collapse,
  description fallback, mint/pool/presale/links row. Company page: tokenless
  market collapse + attach-a-token CTA. Prices subscript-zero everywhere.
  Suite 70/70 (needs the `~/Documents/ORCHESTRATOR` symlink restored this
  session), e2e ok. T3 (forensics tab, legend consolidation, copy pass) waits
  on a v1-contract amendment. Plan artifact + board on :4190 hold the record.
- **2026-08-20** — Folder created. Prompt written so Terminal work can run in
  parallel with Casa (`casa-deployment/`, board `:4174`) and Launchpad
  (`launchpad-deployment/`, board `:4188`).
- **2026-08-20 (later)** - Founder Q&A rounds 1-4 froze v1. Contract written.
  Operator board on 4199. Product on 4200. Mock Casa on 4201. Live Launchpad
  directory (XY, XX) plus SAMPLE fixtures. `node web/e2e.mjs` passed.
- **2026-08-20 (codex)** - Token chart price line and market Price 7d spark
  fetch Codex GraphQL (`getTokenBars` / `tokenSparklines`), the API behind
  defined.fi. `CODEX_API_KEY` is process env only. Browser never calls Codex.
- **2026-08-20 (surface)** - Wired the demo bento to the widened Casa GET
  (`docs/TERMINAL-AGENT-SURFACE.md`). Mock fixtures include 180-day calendar,
  redacted ledger, claimed constraint/north star. Token page paints all company
  tiles. Market table fills health, tasks 7d, heatmap, coverage, chain. 8787
  still down.

- **2026-08-20** — Casa terminal surface: see docs/TERMINAL-AGENT-SURFACE.md (paint map) and docs/CASA-TERMINAL-SURFACE-PLAN.md.

- **2026-08-20 (evening)** — Terminal agent update prompt: GROK-TERMINAL-SURFACE-UPDATE.md (paint demo from new Casa GET).
- **2026-08-20 (github)** — Public repo https://github.com/Capx-AI/terminal created from this tree. Author HBx <0xhbx@users.noreply.github.com>.
- **2026-08-21** - Carry production Vercel `includeFiles` so the Node
  function can read sibling HTML/CSS/JS. Without this, production `GET /`
  404s. Local SAMPLE fixture and live-deploy logs stay in the dirty
  `terminal-deployment` checkout and are not part of this baseline.
- **2026-08-21 (CT-01)** - Freeze token-optional directory and register
  contract in `docs/TERMINAL-V1-CONTRACT.md` section 16. Shared schemas
  live in `ORCHESTRATOR/casa-terminal-plan-01/contracts/`. Current
  `/api/market` emits typed `rows[]` (company+token, company-only, token-only)
  and keeps `tokens[]` as the Launchpad-shaped projection.
- **2026-08-21** - CT-02 adversarial composite goldens in `web/test/`.
  Shared contracts stay in ORCHESTRATOR; this tree only adds tests.
- **2026-08-22** - TR-01: `/api/market` joins Casa companies with Launchpad
  tokens into typed `rows[]`. Directory path does not per-mint Casa GET
  or use the 5-minute negative cache. `tokens[]` stays for old clients.
- **2026-08-22** - TR-02: market chips filter company+token, company-only
  and token-only rows. Search covers company name/slug/description/category
  and token name/symbol/mint. Tokenless market columns stay dash/null.
- **2026-08-22** - TR-03: `/register` (one code field) and `POST /api/register`
  proxy Casa redeem. No-store. Success invalidates the companies snapshot
  and redirects to `/c/{slug}`. Deterministic Casa error copy. No account DB.
- **2026-08-22** - TR-04: `/c/{slug}` company page. Casa progress/health,
  sandboxed artifact previews, separate full-site links. Market content
  only when a joined token exists. Token-later keeps the URL. `/t/{mint}`
  links to the company page when one exists.
- **2026-08-22** - TR-05: partial Casa/Launchpad outages stay explicit on
  `/api/market`. Broken artifact previews fall back and keep open-full
  links. Register and company pages are labeled and keyboard-reachable.
  Vercel `includeFiles` still packs company and register assets.
- **2026-08-24** — `/c/{slug}` paints constraint, vitals, reproduced checks, ledger, envelope, judgment, and departments when those blocks exist. Empty tiles stay hidden. Tokenless price stays dash. Market company rows fill Tasks / Heatmap / Coverage / Chain from `company_surfaces` (slug GET, not mint GET).
- **2026-09-14 20:53 IST** — Face page release to production (`5c5b078`, stamp 26091402, Vercel `unknown`, invalidation `I1EGYEN1VFQ3A5N8F6CWOWL2HR`). Details in `web/readme.md`.
- **2026-09-15 02:14 IST (launchpad.capx.ai cutover)** — Commit `de0807f` on main
  (author HBx): Terminal reads the launchpad from `https://launchpad.capx.ai` only.
  `LAUNCHPAD_API` is the site origin; the token list comes from `/api/v1/tokens`
  and the CAPX quote from `/api/v1/capx` (normalized to `capxUsd`, `source`,
  `asOf`, fixing the price tile that read a field the v1 API never sent). The v1
  `/v1/projects` merge, the per-project detail lookup and the local hidden lists
  are gone (they hid the launched Arbiter); what is listed is the launchpad
  catalog's call. Links: `/token/<mint>` and `/launch`. Suite 88/88. The Vercel
  production env `LAUNCHPAD_API` (v1 API URL) was removed so the default applies.
  Deployed with `vercel --prod` from `web/`; `/health` reports
  `launchpadApi https://launchpad.capx.ai`, `/api/market` carries the JUPITER
  quote and six tokens. Rollback: `vercel rollback` to the previous production
  deployment and restore the env only if rolling back before the cutover.
