# Grok prompt: Capx Terminal deployment

Open a **new Grok window** with cwd:

`/Users/hbx/Documents/solana-capx/terminal-deployment`

Paste everything below the line. Do not work in `casa-deployment/` or
`launchpad-deployment/` except to **read**. All writes stay in this folder
(plus a localhost progress board here).

---

You are Grok, shipping **Capx Terminal** in parallel with two other workstreams
already running on this machine:

| Workstream | Folder | Operator board |
|---|---|---|
| Casa (engine + `casa.capx.ai`) | `../casa-deployment/` | `http://127.0.0.1:4174/` |
| Launchpad (live mainnet, Connect Casa pending) | `../launchpad-deployment/` | `http://127.0.0.1:4188/` |
| Terminal (you) | `./` (this folder) | you will stand up, suggested `http://127.0.0.1:4199/` |

The founder is `0xhbx`. Official GitHub org is `github.com/Capx-AI`. Standing
security order: **no private keys, mnemonics, or `.env` secrets in git, ever.**
No em-dashes or emojis in product or marketing copy. No revenue / yield /
profit / equity language near Agent tokens.

Work fast: after Q&A, use **as many parallel subagents as the harness allows**
(disjoint files, shared workspace only when paths do not overlap). Keep the
progress board’s `progress.json` updated on every task start and finish so
“being worked on right now” is never empty while you are working.

## 0. Do this first: founder Q&A. Do not build yet.

Do **not** create the 4199 board, do **not** copy the demo, do **not** write
product code, until you have asked questions and the founder is satisfied.

Ask in rounds of **6 questions** (multiple choice with a recommended option
first, plus Other). After answers, ask 6 more. Loop until you can freeze a
v1 contract. Then confirm the freeze in one short synthesis, then build.

Seed questions (rephrase, do not dump all 30 at once). Cover at least:

1. **Visual source of truth.** Founder enjoys `~/Documents/july/capx/capx-terminal-demo/`
   (dark bento, starfield, lime = company/Casa data, white/green/red = market).
   Is v1 a revival of that demo wired to live data, or a new app that only
   copies its CSS/layout?
2. **Codebase.** Old Terminal v2 lives uncommitted in `~/Documents/july/capx/capx-onchain/`
   (Next.js, three surfaces, Neon, `/api/attest/*` registry). Do we start from
   the static demo, from that v2 tree (and strip the registry), or greenfield
   in this folder?
3. **Surfaces.** July plan was `terminal.capx.ai` public / `ops.capx.ai` admin /
   `launch.capx.ai` creator. v1 public-only, or all three?
4. **What a row is.** Every Launchpad Agent token (mint ends in `capx`), or only
   tokens that have a live Casa bind? (Spec: tokens without Casa are normal;
   hide the Casa panel on 404, still show price.)
5. **Price source.** Launchpad `GET /v1/projects/:id` + market-indexer, Raydium
   HTTP, DexScreener, or demo `data.js` until a feed exists?
6. **Casa origin.** Production `https://casa.capx.ai`, local `http://127.0.0.1:8787`,
   and/or a mock until Casa service lands?
7. **Cache.** Spec says Terminal **backend** GETs Casa, 5 minute cache, never
   from the browser. Confirm or override.
8. **Host.** Vercel (old Terminal) vs AWS `ap-south-1` next to Launchpad.
9. **Listing content.** Sample companies vs only real launchpad mints from day one.
10. **Health score.** Display Casa’s `health_score` / `freshness` as opaque
    returned values (spec). Do not reimplement the old Terminal formula.
11. **Old `/api/attest/*`.** Spec: strip or 410; do not rebuild the registry;
    Neon attest tables need a founder disposition (freeze vs migrate).
12. **Creator/admin.** Any Terminal-side “connect Casa”, or is that Launchpad-only?
13. **Progress board port.** 4199 unless taken.
14. **Done for v1.** Public market table + token page with price + Casa panel,
    localhost, mock Casa acceptable?

If the founder asks you questions, answer from the knowledge transfer below,
then keep the Q&A loop going.

When Q&A is done: write `docs/TERMINAL-V1-CONTRACT.md` in this folder, then
the 4199 board, then implement.

## 1. Knowledge transfer (read this, then verify on disk)

### 1.1 What Capx is

Capx is shipping three products that must look like one system:

**Launchpad** — anyone can launch an Agent token on Solana. Four-hour uncapped
CAPX presale, then 1,000,000,000 supply (6 decimals), 500M to presale wallets,
500M + dust locked with raised CAPX in a Raydium CLMM Agent/CAPX pool. Mint
addresses end in lowercase `capx`. Creator is `creator_wallet`. Live today:
`https://launchpad.capx.ai` and `https://api.launchpad.capx.ai`. Policy:
`../launchpad-deployment/DECISIONS.md`. Snapshot: `../launchpad-deployment/current.md`.
Connect Casa is **not built yet**. The Launchpad agent prompt is
`../casa-deployment/docs/LAUNCHPAD-CASA-AGENT-PROMPT.md` and a copy lives at
`../launchpad-deployment/docs/casa/`.

**Casa** — local MIT company engine (169 playbooks, operators, company-brain
files). Founders run it in Claude Code, Codex, Grok Build, Hermes, OpenClaw.
No Casa SaaS login. Publishing to Capx is optional. Identity is an ed25519
**per-brain** key at `~/.capx/keys/<pubkey>.key`. Bind: Launchpad shows a
10-minute `CASA-xxxx-xxxx-xxxx` code; founder pastes
`node capx/bind.mjs --code … --brain company-brain`. After bind, `capx/autopush.mjs`
pushes CAF attestations to **Casa service**, not to Terminal.

**Terminal** — public market + honesty surface. Shows **price** of Launchpad
tokens **and** Casa **progress** for that mint. It is a **read client** of Casa.
It does not own the attestation store. (July 2026-08-12 D1 put the registry
inside Terminal. Founder reversed that on 2026-08-20: store is `casa.capx.ai`.)

### 1.2 Binding contract you must implement against

Read, do not rewrite:

- `../casa-deployment/docs/CASA-AUTH-SPEC.md` **v1.1** (especially §3 whitelist,
  §6.1 GET, §6.2 Terminal display rules, §7 health score)
- `../casa-deployment/docs/openapi.yaml` schema `TokenCasa` / `TokenProgress`

```
GET https://casa.capx.ai/v1/tokens/{mint}
```

`{mint}` is Solana base58 ending in `capx`.

| HTTP | Meaning | Terminal UI |
|---|---|---|
| 200 `binding.status=live` + progress | Bound, has pushes | Show Casa panel |
| 200 live, progress null, freshness unobserved | Bound, never pushed | “No pushes yet.” Never a fake zero. |
| 200 `binding.status=released` | Launch failed / unbound after refund | Not an active company |
| 404 `TOKEN_NOT_BOUND` | Never bound | **Hide the Casa panel.** Token page still valid. |
| 400 `INVALID_MINT` | Bad mint | Error |

**Page title and market header = Launchpad token name/symbol.** Casa slug/name
is a subtitle at most.

**Whitelist only** (do not render raw `claims`): level, level_name,
playbooks_total/done/ready/blocked, done_nodes titles, constraint.archetype,
lead_departments, driver_harness, last_session_at, attested, health_score,
freshness, hashes.

**Never on the token page:** win_definition, north-star labels (they name MRR),
spend totals, autonomy dials, file contents, merkle proofs, ledger deltas.

**Provenance grammar** (`../july` doc
`~/Documents/july/capx/TERMINAL-CREATOR-QA-DEV-SKEPTIC-2026-07-28.md`):

- `attested` is a reserved word. It means Casa’s tier0 ∧ tier1 ∧ chain ∧
  observation signature. Not “the business is real.” Not identity. Not anti-sybil.
- `last_session_at` is **claimed** (founder clock, `window.to_ts`).
- `observed_at` / freshness / health_score are **reproduced** by Casa.
- Do not write “verified” copy the system cannot back.
- Market numbers are **onchain** or **reproduced** from the market feed; say which.

**Cache:** Terminal **backend** fetches Casa. `Cache-Control: public, max-age=300`.
Browsers do not call `casa.capx.ai`. No webhooks in v1.

**Health:** display `health_score` and `freshness` as returned. Bands:
`unobserved` | `fresh` (≤24h) | `aging` (≤7d) | `stale`. Do not port
`capx-onchain/src/lib/attest/score.mjs`.

**Continuity:** if `binding.continuity_break` is true, show that the live Casa
key changed once. Do not hide it.

### 1.3 What you must not rebuild

The uncommitted Terminal v2 tree
`~/Documents/july/capx/capx-onchain/` contains
`src/app/api/attest/{nonce,register,push,anchor,...}` and
`src/lib/attest/*`. That is the **old registry**. Casa replaced it.

- Do not deploy those routes as a second store.
- Do not build old R7 `/api/creator/bind`.
- Do not point starter kits at `terminal.capx.ai` for push.
- If you copy v2 code, 410 or delete `/api/attest/*` first.
- Ask the founder what to do with Neon attest tables (freeze vs migrate).

### 1.4 Visual north star: capx-terminal-demo

Founder likes this. Treat it as the design spec:

`~/Documents/july/capx/capx-terminal-demo/`

| File | What |
|---|---|
| `index.html` | Market overview: CAPX price, ecosystem FDV, volume, work/7d, coverage, signed, attested 7d; “healthiest companies” podium; search; table of tokens with price **and** work columns |
| `token.html` | Bento token page: identity, market price, charts, provenance, work/Casa tiles |
| `app.css` | Design system. **Rule in the file:** MARKET data is white / green / red. COMPANY data is capx lime `#C5DC6B`. Full-bleed bento, tight gutters, starfield canvas, sticky header, sample-data pill |
| `data.js` | Sample companies. Replace with live Launchpad + Casa. Do not ship sample as production truth without a visible “sample” pill |
| `brand/capx-logo.png` | Logo |

Read `index.html`, `token.html`, and the top of `app.css` before proposing UI.
Parity: chart rollover, heatmap/ring semantics, lime vs market colors. Do not
“modernize” into a generic dashboard.

Copy rules from the demo’s own honesty: a high health score means the record
can be checked, not that the company is good.

### 1.5 Launchpad as the token directory and price

Launchpad public project JSON (`../launchpad-deployment/contracts/src/index.ts`):
`id`, `creatorWallet`, `agentMint`, `state`, `name`, `symbol`, `logoUrl`,
`poolAddress`, `marketPerformance` (may be null).

`GET /v1/projects` lists; `GET /v1/projects/:projectId` is detail (nested
`project` in the HTTP wrapper). GET-by-id returns HIDDEN **funded** projects;
do not assume directory visibility.

Agent mint exists before the pool. Price may be missing during fundraising.
Show progress without price if Casa is bound; show price without progress if
Casa 404s.

Do not scrape Launchpad HTML. Use the API. Do not put Launchpad m2m secrets
in Terminal. Terminal is unauthenticated toward Casa.

### 1.6 Casa workstream status (expect drift; re-read the board)

As of 2026-08-20, Casa spec v1.1 is frozen. Engine snapshot is in
`../casa-deployment/`. Per-brain keys, bind CLI, autopush, and `service/` are
being built. `https://casa.capx.ai` may not be live. Plan for:

- Mock Casa in this folder for UI work
- Local `http://127.0.0.1:8787` when the service process is up
- Production URL later

Re-read `../casa-deployment/docs/CASA-AUTH-SPEC.md` and
`http://127.0.0.1:4174/` before you freeze your contract. If OpenAPI and spec
disagree, spec wins.

### 1.7 Other reading (verify, do not assume)

- `../CLAUDE.md`, `../PLAN.md`, `../PRODUCTS.md`
- `../terminal/readme.md` (old log only)
- `~/Documents/july/capx/TERMINAL-PRODUCTION-PLAN-V2-2026-07-23.md`
- `~/Documents/july/capx/TERMINAL-CREATOR-QA-DEV-SKEPTIC-2026-07-28.md`
- `../casa-deployment/docs/CASA-AUTH-SPEC-REVIEW.md` (why the store moved)

`~/Documents/july/` is history. This folder is go-forward. Do not traverse
`_archive/` unless the founder asks.

## 2. After Q&A: localhost operator board (clone 4188)

When the founder says the contract is good enough, **first** ship a progress
board in this folder, same format as Launchpad’s official board.

**Copy the pattern from**
`../launchpad-deployment/deployments/environments/mainnet/progress/`
(`index.html`, `styles.css`, `app.js`, `progress.json`, `server.mjs`).
Casa already cloned it at `../casa-deployment/tracker/` on port **4174**.
Launchpad board is **4188**. You use **4199** unless the founder picked another.

Required behavior (do not invent a Trello board):

- Dark operator CSS (same tokens as 4188)
- Clocks: total remaining (calibrated), engineering remaining (calibrated),
  founder/external wait (unscaled)
- Calibration: `sum(actual) / sum(first estimate)` over **this session’s**
  completed `timeLog` rows with `kind: "engineering"`. Multiply that factor
  onto incomplete **engineering** first-estimates only
- Per-task `est` vs `actual` when done; `est` vs `now` (calibrated) when open
- Completed tasks collapsed per phase with totals
- “Being worked on right now” + “Waiting / blocked”
- **Always keep at least one `in_progress` item while you are working.**
  Update `progress.json` `current` and item statuses on every start/finish.
  If you context-switch, mark the new task in_progress before you start it.
  Page refreshes every 30s (`cache-control: no-store`)
- Estimate vs actual log with lessons
- Founder asks list (what you need from 0xhbx: DNS, Vercel/AWS, Neon
  disposition, price feed, listing policy)
- Done-criteria
- Live facts
- `node server.mjs` binding `127.0.0.1`

Phases should include at least: Q&A/contract, operator board, demo parity
shell, Launchpad directory+price, Casa client+panel, honesty/copy pass,
localhost e2e, deploy.

Tell the founder, in the board’s founder-asks column, **exactly** what they
must do (domains, secrets, Neon, which tokens to list, whether sample data
may ship).

## 3. After the board: implement Terminal in this folder

Suggested layout (change only if Q&A froze something else):

```
terminal-deployment/
  GROK-TERMINAL-DEPLOYMENT-PROMPT.md
  readme.md
  docs/TERMINAL-V1-CONTRACT.md
  progress/          # 4199 board
  web/               # the product (demo-derived)
  mock-casa/         # optional fixture server for GET /v1/tokens/:mint
```

Implementation rules:

- Visual: demo first. Market = white/green/red. Casa = lime.
- Data: Launchpad for token identity and price; Casa backend GET for progress.
- Mock Casa until `8787` / production exists; fixture the OpenAPI 200/404 shapes.
- Parallelize: e.g. board vs demo shell vs Casa client vs Launchpad client vs
  copy/honesty pass, **disjoint paths**.
- Every folder you create gets a `readme.md` log (workspace rule).
- Date decisions. Do not silently reverse Casa spec v1.1.

## 4. Speed

Use parallel subagents after the board exists. Cap concurrency ~4–5. Shared
workspace: no two agents on the same file. You own `progress.json` updates
(the orchestrator), not the children. Do not commit unless the founder asks.

## 5. What “done” looks like (until Q&A tightens it)

- `http://127.0.0.1:4199/` operator board live, clocks honest, now-panel current
- Localhost Terminal: market list + token page that look like the demo
- A Launchpad mint with no Casa bind: price (or “not launched”), no Casa panel
- A mint with mock Casa 200: lime progress panel, reserved word “attested”,
  health/freshness as returned, no MRR/spend
- Continuity break and released states have UI
- Founder has a written list of remaining human tasks

Start now with round 1 of 6 founder questions. Do not build until they say
the loop is enough.
