# Capx Terminal v1 contract

**Status:** frozen 2026-08-20 after founder Q&A rounds 1-4.
**Date:** 2026-08-20
**Owner:** Grok in `terminal-deployment/`, founder 0xhbx.
**Does not supersede:** Casa public GET. If this file disagrees with `docs/TERMINAL-AGENT-SURFACE.md` or the live `GET /v1/tokens/{mint}` document, those win.

**2026-08-20 (later) - terminal surface.** Casa widened the public GET so Terminal can paint the demo bento, not a thin progress strip. D10 (hide deferred tiles) is superseded for any tile the GET now fills: heatmap, chart work series, ledger, envelope, vitals, north star / win as **claimed**, judgment, departments 30d. Still forbidden: spend amounts, ledger `note`, file bytes, merkle proofs, cofounder, Pay receipts, yield/profit/equity copy, `roiMultiple`. Health and freshness still display as returned. Browser still never calls Casa.

**2026-08-20 (later) - Adaptive heatmap.** New tokens do not get 180 empty days. Heatmap (and Codex bars) follow project age from Launchpad `fundingFinalizedAt` (else bind / first activity): 1h buckets if age is at most 2 days, 4h if at most 8 days, 1d after that (capped at 180 days). Empty buckets stay hollow. Daily Casa calendar counts are not split across hours; hourly fill uses ledger / observation timestamps when present.

**2026-08-20 (later) - Codex price series.** The token chart price line and the market Price 7d spark come from Codex GraphQL (`getTokenBars`, `tokenSparklines`), the API behind defined.fi. Solana network id `1399811149`. Terminal **backend** fetches; `CODEX_API_KEY` is process env, never git, never the browser. Spot / FDV / volume on the Market tile stay Launchpad. If the key is missing or Codex has no bars (fundraising, unindexed mint), the chart shows work bars only and says so. Sample fixture mints are not sent to Codex.

**2026-08-24 - Company record on `/c/{slug}` and market company columns.** `/c/{slug}` paints the mint-doc lime tiles (constraint, vitals, reproduced checks, ledger, envelope, judgment, departments) from `GET /v1/companies/{slug}` when those blocks exist. Empty tiles stay hidden. Tokenless Market/Price and chart stay dash / "No token yet." Market table company rows fill Tasks, Heatmap, Build map, Coverage, and Chain from a `company_surfaces` sidecar keyed by slug. Directory assembly still must not `GET /v1/tokens/{mint}`. Join `rows[]` shape is unchanged (`additionalProperties: false`). Tokenless `market.*` stays null.

Terminal is the public market and honesty surface. It shows Launchpad Agent-token price next to Casa progress for that mint. It is a read client. It does not own the attestation store.

---

## 1. What v1 is

A localhost public market:

- Market table of every PUBLIC Launchpad Agent token.
- Token page at `/t/{mint}` with Launchpad identity and price (or raise facts), plus a Casa panel when Casa returns 200.

Visual source of truth is the July static demo at `~/Documents/july/capx/capx-terminal-demo/`. v1 is that demo wired to live Launchpad and to Casa (mock, then local, then production). It is not a new dashboard and not a restyle of `capx-onchain`.

v1 is **public-only**. No `ops.capx.ai`. No `launch.capx.ai`. No Terminal-side Connect Casa. Bind stays on Launchpad.

Done for this pass: localhost. Production Vercel + `terminal.capx.ai` are founder tasks after localhost is honest.

---

## 2. Decisions (dated 2026-08-20)

| # | Decision |
|---|---|
| D1 | Revive the demo as the product. Copy `index.html`, `token.html`, `app.css`, starfield, bento, podium, color rules. Do not modernize. |
| D2 | Start from the static demo in this folder. Do not import `~/Documents/july/capx/capx-onchain/`. Do not stand up `/api/attest/*`, Neon, or `SURFACE` gating. |
| D3 | Public market only. |
| D4 | A row is every PUBLIC Launchpad Agent token (mint ends in `capx`). Tokens with no Casa bind are normal. |
| D5 | Price and identity from Launchpad public API only. No DexScreener, no Raydium HTTP from Terminal, no HTML scrape, no Launchpad m2m secrets. |
| D6 | Casa origin: mock in this folder, then `http://127.0.0.1:8787`, then `https://casa.capx.ai`. Env-selected. Browser never calls Casa. |
| D7 | Terminal backend GETs Casa. `Cache-Control: public, max-age=300`. No webhooks. |
| D8 | Host later: Vercel public site, thin serverless/edge proxy. AWS stays with Casa and Launchpad API. |
| D9 | Production listing is live Launchpad only. Sample fixtures are localhost-only and require the Sample data pill. |
| D10 | Hide demo tiles that have no live feed. Split forbidden vs deferred (section 8). Founder: hide for v1, bring deferred tiles back later. |
| D11 | Display Casa `health_score` and `freshness` as returned. Do not port `capx-onchain/src/lib/attest/score.mjs`. |
| D12 | Old `/api/attest/*` is not copied. Neon attest tables: freeze in place, do not migrate, do not open from this folder. |
| D13 | Operator board `http://127.0.0.1:4199/`. Product `http://127.0.0.1:4200/`. Mock Casa `http://127.0.0.1:4201/`. Bind 127.0.0.1. |
| D14 | Live Launchpad mints get Casa 404 from the mock (Connect Casa is not built). Fixture mints exist only with the Sample data pill. |
| D15 | Directory = Launchpad `GET /v1/projects?filter=all`, drain `nextCursor`. No HIDDEN padding via GET-by-id. Token page 404 if the mint is not in that public list (unless SAMPLE fixtures). |
| D16 | Header: CAPX quote from Launchpad `GET /v1/market-data/capx`. Ecosystem FDV and 24h volume = sums of listed `marketPerformance` fields that exist. Casa aggregates only from documents Terminal actually fetched. |
| D17 | Show price, mcap, volume, liquidity, 24h change. Hide `roiMultiple`. |
| D18 | Token URL `/t/{mint}`. Symbol is display only. GitHub `Capx-AI/terminal` and DNS are founder-later. No Terminal DB in v1. |
| D19 | Fundraising rows show Launchpad raise facts and no fake price. |

---

## 3. Layout

```
terminal-deployment/
  GROK-TERMINAL-DEPLOYMENT-PROMPT.md
  readme.md
  docs/TERMINAL-V1-CONTRACT.md    this file
  progress/                       board on :4199
  web/                            product on :4200
  mock-casa/                      fixture GET /v1/tokens/:mint on :4201
```

---

## 4. Visual rules (demo is the spec)

Read `index.html`, `token.html`, and the top of `app.css` before changing UI.

- Background `#08090a`. Lime `--capx: #C5DC6B`.
- **Market data is white / green / red.** Price, 24h change, volume, liquidity, FDV, CAPX quote.
- **Company / Casa data is lime.** Health, playbooks, attested, freshness, level, constraint archetype, harness.
- Full-bleed bento, tight gutters (`--gut: 10px`), starfield canvas, sticky header.
- Sample data pill is visible whenever fixtures are in the payload. It is off when the payload is live Launchpad plus live Casa 404s only.
- Do not restyle into a generic dashboard.
- Chart rollover, heatmap, and ring semantics stay deferred (section 8). Do not invent a new chart language in v1.
- Page title and market header = Launchpad token `name` / `symbol`. Casa `slug` / `name` is a subtitle at most.
- Agent supply display is **1,000,000,000** (6 decimals). Never the demo's 100,000,000.

Honesty copy from the demo, kept:

> Scored only on what Capx re-ran itself. A high score does not mean a good company. It means a company that can be checked, and was.

Do not write "verified" copy the system cannot back.

---

## 5. Launchpad (directory, identity, price)

Origin: `https://api.launchpad.capx.ai`. Unauthenticated. Terminal **backend** fetches. Browser talks only to Terminal.

### 5.1 Endpoints

| Call | Use |
|---|---|
| `GET /v1/projects?filter=all&limit=100` | Public directory. Follow `nextCursor` until null. |
| `GET /v1/projects/:projectId` | Detail. Response nests fields under `project`. |
| `GET /v1/market-data/capx` | `{ capxUsd, source, asOf, stale }` |

Skip list rows with `agentMint == null`. Require mint ends in lowercase `capx`.

Do not list HIDDEN projects. GET-by-id may return HIDDEN funded launches; v1 does not hunt for them.

### 5.2 Row and token page (Launchpad fields)

Show:

- `name`, `symbol`, `logoUrl`, `description` (token page), `state`, `agentMint`
- Fundraising: `fundraisingDeadlineAt`, `qualifyingNetCapxBase` (9 decimals, CAPX), `participantCount`
- When present: `poolAddress`, `marketPerformance.currentMarketCapUsd`, `volume24hUsd`, `liquidityUsd`, `priceChange24hPercent`, `asOf`, `stale`
- `links` as plain URLs on the token page if present

Hide:

- `roiMultiple` (return language)
- Contributor `ledger`, `viewerPosition`
- `marketHistory` series (deferred chart; Launchpad may send up to 288 points, v1 does not render them)

### 5.3 Price

Launchpad `marketPerformance` has no explicit token price field.

Display USD price = `currentMarketCapUsd / 1_000_000_000` when mcap is a number. Otherwise dash or **not launched**.

Do not invent USD from the CAPX raise. Fundraising with no `marketPerformance` is a first-class state.

If `stale` is true, show the number with a stale mark. If the CAPX quote or directory 5xx, show an error state, not demo data.

Label CAPX header price as reproduced from Launchpad (`source` + `asOf`).

### 5.4 Aggregates

- CAPX price: `/v1/market-data/capx`
- Ecosystem FDV: sum of listed `currentMarketCapUsd` (dash if none)
- 24h volume: sum of listed `volume24hUsd` (dash if none)
- Work / coverage / signed / attested 7d: only from Casa documents Terminal fetched this pass. If every live mint 404s, those lime aggregates are dash, not zero.

---

## 6. Casa (progress panel)

Spec: `../casa-deployment/docs/CASA-AUTH-SPEC.md` v1.1 section 6.1-6.2 and 7. OpenAPI companion: `../casa-deployment/docs/openapi.yaml`. Spec wins if they disagree.

### 6.1 Origin

| Mode | `CASA_API` |
|---|---|
| Mock (default localhost) | `http://127.0.0.1:4201` |
| Local Casa service | `http://127.0.0.1:8787` |
| Production | `https://casa.capx.ai` |

Terminal backend GETs `GET {CASA_API}/v1/tokens/{mint}`. Cache 300 seconds. Do not treat the panel as fresher than 5 minutes unless re-fetched.

### 6.2 HTTP -> UI

| HTTP | Meaning | UI |
|---|---|---|
| 200 `binding.status=live` + `progress` | Bound, has pushes | Show Casa panel |
| 200 live, `progress` null, `freshness=unobserved` | Bound, never pushed | "No pushes yet." Never a fake zero. |
| 200 `binding.status=released` | Launch failed / unbound after refund | Not an active company. Show that Casa was connected and the launch ended. |
| 404 `TOKEN_NOT_BOUND` | Never bound | Hide the Casa panel. Token page still valid. |
| 400 `INVALID_MINT` | Bad mint | Error |

If `binding.continuity_break` is true, show that the live Casa key changed once. Do not hide it.

### 6.3 Whitelist (render these, nothing else from Casa)

`level`, `level_name`, `playbooks_total`, `playbooks_done`, `playbooks_ready`, `playbooks_blocked`, `done_nodes[]` (`node_id`, `title`), `constraint.archetype`, `constraint.lead_departments`, `driver_harness`, `last_session_at`, `attested`, `health_score`, `freshness`, hashes (`claims_digest`, `attestation_digest`, `brain_root`, `disclosed_root`, `chain_head`), `observed_at`, `sequence`, `caf_version`, `company.pubkey`, `company.slug`, `company.name`, `creator_wallet`, binding metadata.

### 6.4 Never on the token page

`win_definition`, north-star labels, spend totals, autonomy dials, file contents, merkle inclusion proofs, ledger deltas, raw `claims.json`, revenue / yield / profit / equity language.

### 6.5 Provenance grammar

- **attested** is reserved. It means Casa tier0 AND tier1 AND chain intact AND observation signature. Not "the business is real." Not identity. Not anti-sybil.
- **last_session_at** is claimed (founder clock, `window.to_ts`).
- **observed_at**, **freshness**, **health_score** are reproduced by Casa.
- Market numbers are on-chain or reproduced from Launchpad; say which.
- Do not write "verified".

Health bands as returned: `unobserved` | `fresh` | `aging` | `stale`. `health_score` is null when unobserved.

Podium ranks bound companies by Casa `health_score` among documents Terminal fetched. Unbound tokens are not ranked. Empty podium copy when none are bound.

Filter chips (Health 80+, Attesting weekly, Needs review) filter the live list using fetched Casa docs. They match nothing until binds exist. Keep the chrome.

---

## 7. Mock Casa and sample fixtures

Mock server in `mock-casa/` listens `127.0.0.1:4201`.

Default for any well-formed mint not in the fixture map: **404 `TOKEN_NOT_BOUND`**. That includes live Launchpad mints such as XY `5384Ac1FEbDYbFPdshs2wNYf3eNjkoWznrazE6Cccapx`.

Invalid mint (not base58 or not ending in `capx`): **400 `INVALID_MINT`**.

Fixture mints (localhost SAMPLE only):

| Mint (ends in `capx`) | Shape |
|---|---|
| `FixLiveProg111111111111111111capx` | 200 live + progress + attested + health_score + freshness fresh |
| `FixLiveNone111111111111111111capx` | 200 live, progress null, freshness unobserved |
| `FixRefunded111111111111111111capx` | 200 binding.status released |
| `FixRebind11111111111111111111capx` | 200 live + `continuity_break: true` |
| `FixAging111111111111111111111capx` | 200 live + freshness aging, lower health |

When `SAMPLE=1` (localhost only):

- Terminal merges synthetic Launchpad-shaped rows for those mints into the market payload.
- Sample data pill is on.
- Fixtures never ship as production truth.

When `SAMPLE` is unset: live directory only, mock 404s, pill off.

---

## 8. Demo tiles: forbidden vs deferred vs v1

Founder (round 3): hide some for v1, bring most back later.

### Forbidden (never, unless Casa spec changes)

- `win_definition`, north-star labels (they can name MRR)
- spend totals, autonomy dials
- raw `claims.json`, merkle proofs, ledger deltas, file contents
- revenue / yield / profit / equity language
- `roiMultiple` on Terminal

### Deferred (v1 hide the tile; do not forget)

- Work heatmap / attested-per-day grid
- Price / work chart and rollover (Launchpad `marketHistory` exists on GET-by-id; do not render in v1)
- Richer "what Capx re-ran" check list beyond `attested` + hashes
- Disclosed-ledger subset, if Casa ever publicizes one
- Envelope file dump (hashes are enough in v1)
- Cofounder field (not in Launchpad or Casa whitelist)
- Department 30d board, judgment tile

### v1 shows

- Identity: Launchpad name / symbol / logo / description; Casa slug/name subtitle; harness and level when bound
- Market: price, 24h, FDV/mcap, liquidity, volume, supply 1,000,000,000; or raise facts + not launched
- Casa work: playbooks done / ready / blocked / total, `done_nodes` titles
- Binding constraint: archetype + lead departments only
- Provenance: attested, health, freshness, hashes, continuity break, released
- Level ladder chrome with the current `level` / `level_name` marked (static names 0-8, not claims)
- Five data planes copy (honesty), without claiming Pay/settled
- Podium and chips chrome (empty until binds)

---

## 9. Product copy

- No em-dashes. No emojis. Internal planning docs in this folder may use hyphens.
- No revenue / yield / profit / equity language near Agent tokens.
- Footer: `capx · every agent token pairs against CAPX`. Add `sample data` only when the pill is on.
- Table legend keeps On-chain / Reproduced / Committed / Claimed. Committed hashes may show; bytes stay unseen.

---

## 10. Localhost topology

```
127.0.0.1:4199  operator board (progress/)
127.0.0.1:4200  Terminal product (web/)  browser origin
127.0.0.1:4201  mock Casa
127.0.0.1:8787  real Casa service when that workstream is up
https://api.launchpad.capx.ai  live directory and CAPX quote
```

`web/` is a small Node server:

- Static: demo CSS, HTML, logo, favicons, starfield JS
- `GET /` market
- `GET /t/{mint}` token page
- `GET /api/market` Launchpad directory + CAPX quote + per-mint Casa (cached)
- `GET /api/tokens/{mint}` one row + Casa
- Cache-Control on Casa-backed JSON: `public, max-age=300` for the Casa fragment; market list may be shorter (60s is fine)
- Listen 127.0.0.1 only

Env (no secrets in git):

```
LAUNCHPAD_API=https://api.launchpad.capx.ai
CASA_API=http://127.0.0.1:4201
SAMPLE=1
PORT=4200
```

No `.env` with secrets. These are public origins.

---

## 11. What we will not rebuild

- `capx-onchain` `/api/attest/*` registry (nonce, register, push, anchor)
- Old R7 `/api/creator/bind`
- Starter kits pointing at `terminal.capx.ai` for push
- Neon attest tables (freeze; Casa owns the store as of 2026-08-20)
- Terminal-side Connect Casa
- Health-score formula from `src/lib/attest/score.mjs`

---

## 12. Host later (not v1 done)

- Vercel project, Git-attested, same idea as `launchpad.capx.ai`
- Serverless/edge route proxies Casa and Launchpad
- Domain `terminal.capx.ai` (founder DNS)
- GitHub `github.com/Capx-AI/terminal` (founder publish)
- `CASA_API=https://casa.capx.ai` when that DNS exists

---

## 13. Founder tasks (human, not Grok)

1. Create `github.com/Capx-AI/terminal` when you want it public.
2. Create the Vercel project and point `terminal.capx.ai`.
3. Keep the old Terminal Vercel + Neon from serving `/api/attest/*` (freeze or take down). Do not migrate those tables into this folder.
4. Tell Terminal the production Casa URL when `casa.capx.ai` is live.
5. Confirm Vercel serverless can GET `https://api.launchpad.capx.ai` (if not, a proxy is your call).
6. Do not ask Terminal to ship sample companies as production truth.
7. Connect Casa remains a Launchpad feature. Terminal will light up panels when Casa 200s exist.

---

## 14. Done criteria (localhost v1)

- `http://127.0.0.1:4199/` board live, clocks honest, now-panel current
- `http://127.0.0.1:4200/` market table looks like the demo
- `http://127.0.0.1:4200/t/{mint}` token page looks like the demo bento, minus deferred/forbidden tiles
- A live Launchpad mint with Casa 404: name, symbol, logo, state, raise facts or price, no Casa panel
- A fixture mint with mock 200: lime progress panel, reserved word attested, health/freshness as returned, no MRR/spend
- continuity_break and released states have UI
- Sample pill on only with fixtures
- Founder has the written list in section 13

---

## 15. Q&A log

- Round 1: demo revival; static demo not capx-onchain; public-only; every Launchpad token; Launchpad API for price; mock then 8787 then production.
- Round 2: 5 minute backend cache; Vercel later; live directory / sample localhost-with-pill; hide extra tiles for v1 (founder: bring most back later); Casa health as returned; localhost done; Neon freeze; board 4199.
- Round 3: forbidden vs deferred split; live mints 404 on mock; PUBLIC filter=all drain cursor; CAPX quote + listed sums; hide roiMultiple; `/t/{mint}`; GitHub/DNS later.
- Round 4: fundraising raise facts; empty podium chrome; drain cursor; product :4200 mock :4201; api.launchpad.capx.ai fail visible; freeze and build.

---

## 16. Token-optional directory and register (2026-08-21)

Dated amendment. Does not restyle the demo visual language. Does not add a
Terminal account database, OAuth, wallet adapter, password, social layer, or
trader gimmicks. Casa spec v1.2 and `ORCHESTRATOR/casa-terminal-plan-01/contracts/`
are the machine-readable join contract. If this section disagrees with Casa
`GET /v1/tokens/{mint}`, that mint document still wins for mint-keyed panels.

v1 D4 (a row is every PUBLIC Launchpad Agent token) is superseded for the
market table: a row is one of three typed join results. Launchpad-only tokens
remain first-class as `token_without_company`.

### 16.1 Aggregation

Terminal backend fetches in parallel:

- Casa `GET /v1/companies` (drain `next_cursor`)
- Launchpad `GET /v1/projects?filter=all` (drain `nextCursor`, existing rule)

Join once on nullable Casa `agent_mint` equal to Launchpad `agentMint`.

| Join result | `kind` | Detail route |
|---|---|---|
| Casa company + Launchpad token | `company_with_token` | `/c/{slug}`; `/t/{mint}` MAY link or redirect to the company page |
| Casa company, no token | `company_without_token` | `/c/{slug}` |
| Launchpad token, no Casa company | `token_without_company` | `/t/{mint}` |

Each entity appears exactly once. A later token attach changes `kind` from
`company_without_token` to `company_with_token` without changing `company_id`,
slug, history, or `/c/{slug}`.

This path MUST NOT per-mint `GET /v1/tokens/{mint}` and MUST NOT use the
five-minute negative cache (`casaCache` TTL 300s) for directory assembly.
Keep per-mint Casa GET only where a mint-keyed panel still needs the v1.1
document (token-only `/t/{mint}` until a company exists).

Aggregate snapshot TTL is about 60 seconds (`Cache-Control: public, max-age=60`
is fine). Registration success MUST drop the in-process snapshot immediately.
Correctness does not depend on a Casa webhook.

Shared row schema: `terminal-composite-row.schema.json`. Goldens:
`composite-company-token.json`, `composite-company-only.json`,
`composite-token-only.json`.

### 16.2 Search, filters, honest market fields

Search spans: company name, slug, description, category, token name, symbol,
mint.

Semantic filters (customer-facing names get a later copy review, not a new
product loop):

- company with token
- company without token
- token without company

Tokenless rows (`company_without_token`) show company work and artifact
readiness. Market columns (`price_usd`, `fdv_usd`, `volume_24h_usd`,
`liquidity_usd`, `change_24h_percent`) are JSON `null` and render as a dash.
Never `0` and never a synthetic price.

Fundraising token-only rows already use dash / not launched; keep that.

Do not restyle the demo. Lime stays company/Casa. White/green/red stays
market. Sample data pill rules are unchanged.

### 16.3 Routes

| Route | Role |
|---|---|
| `/register` | One code field. No account dashboard. |
| `/c/{slug}` | Company page. Survives later token attach. |
| `/t/{mint}` | Token-only page. Bound token MAY link or redirect to `/c/{slug}`. |
| `GET /api/market` | Composite payload (companies + tokens + kinds). Current HEAD still has only `tokens[]` until TR-01. |
| `POST /api/register` | Thin proxy to Casa `POST /v1/companies/redeem`. No-store. Invalidate snapshot. Redirect to `/c/{slug}`. |

`/register` errors map Casa codes without inventing copy the system cannot
back: `CODE_EXPIRED`, `CODE_USED`, `CODE_INVALID`, `NOT_READY`, `PRIVATE`,
`SLUG_CONFLICT`. Concurrent redeem: one winner.

### 16.4 Company page and previews

`/c/{slug}` shows identity, category, description, Casa level, progress,
heatmap, attestations, health, and market/price content only when the joined
token exists.

Website, one-pager, and deck previews are sandboxed lazy iframes:

- not same-origin with Terminal
- no `allow-top-navigation`
- no `allow-popups`
- no `allow-same-origin` with the Terminal origin

User JavaScript never runs on the Terminal origin. The full site opens on
`https://{slug}.casa.capx.ai` in a separate tab.

Hidden or unpublished artifact URLs MUST NOT be sent to the browser.
Private/unready slugs 404 with the Casa error code.

### 16.5 What this amendment refuses

- Terminal account DB, OAuth, wallet, social, follows, comments, reactions,
  waitlists, trader gimmicks
- Restyling the July demo visual language
- Rebuilding `/api/attest/*`
- Treating tokenless market nulls as zero
- Five-minute negative-cache delay after registration on the directory path

## 17. Amendment 2026-08-26: tabbed detail views (U1)

Founder-directed. The company and token pages regroup their existing tiles
under a sticky view bar: Overview, Work, Verification, Market. Hash routing
(`#work`) preserves the one-URL rule; no route changes, no new data, CSS-only
visibility over the same tiles. Market shows only when a token exists (company
page) or a chart is plottable (token page); Work and Verification show only
when a Casa document is bound (token page). Adds a weekly digest line on the
company Overview and day-group headers in the disclosed ledger, both computed
from fields this contract already serves. Also records the earlier
founder-directed surface changes of the same day: hourly last-7-days pulse on
the company page (fill is disclosed ledger events; ring is the hour the last
attestation landed) and the artifact stage at half width and reduced height.
Nothing in 16.5 is revisited.

## 18. Amendment 2026-08-26: output library (U3)

Consumes the Casa U2 fields: `outputs[]` on the public company document
(sanitized to same-host .md entries with 64-hex sha256, capped at 200) and
`artifact_sha256` on disclosed ledger events. The company page gains an
Outputs view: a listing with committed-event badges and a reader that fetches
the document from the company's own casa host (CORS-opened public bytes),
renders it through a zero-dependency escaping markdown renderer (raw HTML
becomes visible text; links https-only), and hashes the fetched bytes in the
browser. Verdict grammar: "hash matches the committed event of <t>" only when
the browser-computed sha256 equals a disclosed event's artifact_sha256;
content itself stays founder claimed; "attested" is never used for content.
The market sidecar carries a URL-free outputs summary (count, latest) for the
home Latest outputs rail. Nothing in 16.5 is revisited.

## 19. Amendment 2026-08-26: view tabs removed

Founder-directed, superseding section 17's navigation only. The detail pages
return to one scrolling page in tile order; the sticky view bar, hash
routing, and tabs.js are removed. Everything sections 17 and 18 added
otherwise stands: the weekly digest line, day-grouped disclosed ledger,
hourly pulse, half-width artifact stage, and the full output library with
its reader and browser-side hash verification, now rendered inline as a
full-width section.
