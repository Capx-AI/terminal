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
