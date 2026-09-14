# web/ - Capx Terminal product

Demo-derived public market. Serves on `http://127.0.0.1:4200/`.

```bash
SAMPLE=1 CASA_API=http://127.0.0.1:4201 CODEX_API_KEY=... node web/server.mjs
```

`CODEX_API_KEY` is the Codex (defined.fi) GraphQL key. Never commit it.
The browser never calls Codex. Price buckets follow project age (1h / 4h / 1d), same as the heatmap.

Browser talks only to this process. This process GETs Launchpad
(`https://api.launchpad.capx.ai`) and Casa (`CASA_API`). Casa responses cache
300 seconds for positive token responses; negative Casa responses cache 30 seconds.

Visual source: `~/Documents/july/capx/capx-terminal-demo/` (`app.css` copied
intact). `v1.css` only covers missing-tile layout.

## Phone harness and release checklist (plan 2026-08-29-002)

`tools/mobile/` is a pinned Playwright harness (`playwright@1.53.0`, its own
lockfile). It is not a dependency of this package and never reaches the Vercel
function. One-time setup:

```bash
cd web/tools/mobile && npm install && npx playwright install chromium
```

Then, before every production deploy (there is no CI; this list is the gate):

```bash
node --test test/*.test.mjs            # suite
node e2e.mjs                           # against SAMPLE=1 on :4200 + mock Casa on :4201
cd tools/mobile && npm test            # phone gates at 360/390/430 (iPhone 14) and Pixel 7,
                                       # plus the desktop baseline diff at 1024 and 1440
```

The harness boots `server.mjs` with `SAMPLE=1` and stubbed upstreams, so it is
offline and deterministic. `npm run baseline` re-captures the desktop
computed-style baseline in `tools/mobile/baseline/`; run it only on a tree
whose desktop layout is the intended one, and commit the JSON. Fixture pages
live in `tools/mobile/fixtures.json`. `phase2.test.mjs` is the Phase 2 release
gate: type floor, tap-target hit areas, pinned market tables, one-row rails,
chart and heatmap taps, the artifact stage gate, breakpoint tile pairing, and
page-height caps, on the same SAMPLE stack and device contexts. Type exceptions
are `.sr-only`, `.skip`, `.hc`, and canvases. Tap-target exceptions are inline
links in `.reader-body`, `.nobind-copy`, and `.tblnote`, plus heatmap cells and
chart pins. Run `npm run test:phase1` and `npm run test:phase2` from
`tools/mobile/`; Phase 1 must stay green, and Phase 2 is the merge gate once
the matching product work lands.

Release: bump `?v=` on all four HTML files, `vercel --prod` on
`capx-terminal-public`, invalidate CloudFront `E1AUBHOMH0OFF3`, re-run the
phone checks against production, log the deployment id in the readme.
Rollback: `vercel rollback` to the previous deployment plus the same
invalidation.

## Log

- **2026-08-20** - Folder created. CSS, logo, favicons copied from the demo.
  Server proxies Launchpad + Casa. Pages consume `/api/market` and `/api/tokens/:mint`.
  Localhost: `SAMPLE=1` on :4200, mock Casa on :4201.
- **2026-08-20 (surface)** - Token bento and market Casa columns read the
  terminal-surface GET (calendar, ledger, reproduced, claimed north star).
- **2026-08-21** - CT-02 adversarial composite goldens. `web/test/` loads
  shared passing and rejecting fixtures from
  `ORCHESTRATOR/casa-terminal-plan-01/contracts` over the relative path.
  Token-later pair keeps company_id, slug, and canonical_url. TR-01 joins
  Casa `GET /v1/companies` with Launchpad tokens into typed `rows[]` and
  keeps `tokens[]` for existing clients. Directory assembly does not
  per-mint `GET /v1/tokens/{mint}` or use the 5-minute Casa cache.
  TR-02 adds company+token / company-only / token-only chips, search
  across both sources, and dash/null market columns on tokenless rows.
  TR-03 adds `/register` and `POST /api/register`, a no-store proxy to
  Casa `POST /v1/companies/redeem`. Success drops the companies snapshot
  and redirects to `/c/{slug}`.
  TR-04 adds `/c/{slug}` and `GET /api/companies/{slug}`. Casa progress
  and health, sandboxed website/one-pager/deck previews, full-site links
  on `{slug}.casa.capx.ai`. Market chart only when a joined token exists.
  Token-later keeps the same company URL. `/t/{mint}` links to `/c/{slug}`
  when a public company is joined.
  TR-05: Casa or Launchpad outage is partial on `/api/market`. Broken
  iframe previews fall back to copy plus the full-site link. Keyboard
  labels, skip links, and Vercel `includeFiles` cover register and
  `/c/{slug}`.
- **2026-08-22 (IN-02)** - Vercel `includeFiles` in `web/vercel.json` is
  the Terminal static-asset fingerprint (html, css, js, favicons,
  brand). Names in that glob are the packaged set. Do not restyle the
  glob. Hashes of those files are release evidence; no secret values.
- **2026-08-24** — Company page paints constraint, vitals, reproduced, ledger, envelope, judgment, departments when present. Market `company_surfaces` fills company-only work columns. Tokenless price stays null.
- **2026-08-29** — Phone layout Phase 1 (plan 2026-08-29-002): every tile full width below 880px, chart box phone height, shrinkable legend, wrapping header under 700px; v1.css tile spans moved under `min-width:881px`. Harness in `tools/mobile/` with the desktop baseline. Stamp 26082901.
- **2026-08-29 (later)** — Phone layout Phase 2 (plan 2026-08-29-002, contract 20b): 11px type floor enforced by `test/type-floor.test.mjs` (app.css and v1.css blocks, the latter because v1.css loads last), 24px tap targets, colgroups with pinned rank and name cells and a scroll cue, one-row rails, token chart tap-to-pin, heatmap tap readouts on both pages, gated artifact stage with Open below. Harness gains `npm run test:phase2` (9 checks) and a pinned page clock. Stamp 26082902.
- **2026-08-29 (density)** — Phone density (plan 2026-08-29-003, contract 20c): key-numbers strip on detail pages, one-row identity with clamped description, key-value market rows, four-up stat strip, podium rows, second line under table names. Harness `test:phase3` holds density floors. Stamp 26082904.

- **2026-09-14 (WP4)** - Canonical slug/mint company pages, legacy 301s, hosted
  collateral proxy, face brief/diagrams/roadmap/plan/agents and focused subpages.
  V2 Launchpad is primary; USD cap sorts nulls last. Company readiness and agent
  counts appear in directory rows. Mermaid uses the vendored script in an opaque
  sandbox. Stamp 26091401. No dependencies added, commit or deployment performed.
  Local face fixtures: `/fixture-live`, `/northstar-labs`; `/inboxpilot` has no face;
  `/FixUnbound1111111111111111111capx` has no company. `LAUNCHPAD_V2_API` can override
  the primary tokens endpoint for local tests.
  Validation: 88/88 tests and e2e passed using an in-memory HTTP test transport.
  The normal test run had 70 passes and 18 socket permission failures; local e2e
  and the installed phone harness were blocked by `EPERM` on loopback sockets.
  Chromium also failed macOS Mach port registration. Visual QA remains pending.
