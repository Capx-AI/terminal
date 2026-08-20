# terminal-deployment

Go-forward working tree for Capx Terminal. Visual north star is
`~/Documents/july/capx/capx-terminal-demo/`. Casa progress is read from
`casa.capx.ai`. Price comes from Launchpad / market data. This folder is
not the old `terminal/` log and not the uncommitted `capx-onchain` v2 tree.

## Contents

- `GROK-TERMINAL-DEPLOYMENT-PROMPT.md` — original kickoff (Q&A then board).
- `GROK-TERMINAL-SURFACE-UPDATE.md` — **paste this now**: wire the demo to the
  widened Casa `GET /v1/tokens/{mint}` (calendar, ledger, claimed north star).
- `docs/TERMINAL-V1-CONTRACT.md` — frozen 2026-08-20. Binding contract for v1.
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
