# Prompt for the Terminal agent: wire the demo to the new Casa GET

Open Grok with cwd:

`/Users/hbx/Documents/solana-capx/terminal-deployment`

Paste everything below the line. Write only in this folder (and update
`progress/progress.json`). Read Casa and Launchpad. Do not edit
`casa-deployment/` or `launchpad-deployment/`.

---

You are the Terminal agent. Casa just widened `GET /v1/tokens/{mint}` so you
can paint the **capx-terminal-demo** bento, not a thin progress strip.

This is an **update**, not a greenfield. You already have (as of 2026-08-20):

- Operator board `http://127.0.0.1:4199/` (`progress/`)
- Product `http://127.0.0.1:4200/` (`web/`)
- Mock Casa `http://127.0.0.1:4201/` (`mock-casa/`)
- Contract `docs/TERMINAL-V1-CONTRACT.md`

Keep the demo look. Keep the 4199 board current: mark tasks `in_progress`
before you start them. Use parallel subagents on disjoint files.

## 0. Read first (in this order)

1. `docs/TERMINAL-AGENT-SURFACE.md` — tile to JSON map (copied from Casa)
2. `docs/CASA-TERMINAL-SURFACE-PLAN.md` — what Casa publishes and what it does not
3. `docs/casa-openapi.yaml` — HTTP companion (may lag the live GET; the live
   JSON from Casa wins)
4. `~/Documents/july/capx/capx-terminal-demo/` — `index.html`, `token.html`,
   `app.css` (MARKET = white/green/red, COMPANY = lime `#C5DC6B`), `data.js`
5. Live Casa if up: `http://127.0.0.1:8787/health/live` and a sample GET
6. Your existing `web/` and `mock-casa/` — see what is still the thin v1.1
   whitelist and replace it

If 8787 is down, update `mock-casa/` to the **new** document shape below and
keep shipping against the mock.

## 1. What changed on Casa (do not reimplement the registry)

Old Terminal v2 (`~/Documents/july/capx/capx-onchain/`) owned `/api/attest/*`.
That is dead. Casa owns bind + attest store. You are a **read client**.

```
GET {CASA_API}/v1/tokens/{mint}
```

`CASA_API` is `http://127.0.0.1:8787` locally, `https://casa.capx.ai` in
production. **Your backend** fetches this. Cache 5 minutes.
`Cache-Control: public, max-age=300`. Browsers never call Casa.

`{mint}` is Solana base58 ending in lowercase `capx`.

| HTTP | Meaning | UI |
|---|---|---|
| 200 live + progress | Bound, has pushes | Full Casa bento |
| 200 live, progress null, freshness unobserved | Bound, never pushed | Identity/bind only. "No pushes yet." Never a fake zero. |
| 200 `binding.status=released` | Launch refunded / released | Not an active company |
| 404 `TOKEN_NOT_BOUND` | Never bound | **Hide every Casa tile.** Market page still valid. |
| 400 `INVALID_MINT` | Bad mint | Error |

Page **title and market header** = Launchpad token name/symbol. Casa
`company.name` / `slug` are a subtitle at most.

`attested` is a reserved word (tier0 ∧ tier1 ∧ chain ∧ Casa observation
signature). Not "the business is real." `last_session_at` is **claimed**
(founder clock). `observed_at` / health / freshness / calendar rings are
**reproduced**. Do not write "verified". No yield / profit / equity copy.
North-star and win numbers are **claimed**.

Do not rebuild `/api/attest/*`. Do not compute your own health formula.
Display `attestation.health_score` and `freshness` as returned.

Price, 24h, volume, liquidity, FDV, spark, ticker, pair, supply = Launchpad
(or SAMPLE fixtures). Never Casa.

## 2. Document shape (this is what you parse)

Illustrative. Fields may be null when unbound-never-pushed.

```json
{
  "mint": "...capx",
  "company": {
    "pubkey": "...",
    "slug": "inboxpilot",
    "name": "InboxPilot",
    "created_at": "2026-01-19T00:00:00.000Z",
    "one_liner": "Forecast weekly orders for independent restaurants...",
    "primary_type": "saas"
  },
  "creator_wallet": "...",
  "binding": {
    "status": "live",
    "bound_at": "...Z",
    "released_at": null,
    "rebind_count": 0,
    "continuity_break": false,
    "previous_pubkeys": []
  },
  "attestation": {
    "attested": true,
    "caf_version": "1.1.0",
    "sequence": 47,
    "observed_at": "...Z",
    "health_score": 78,
    "freshness": "fresh",
    "hours_since": 6.2,
    "claims_digest": "...",
    "attestation_digest": "...",
    "brain_root": "...",
    "disclosed_root": "...",
    "chain_head": "..."
  },
  "reproduced": {
    "plane": "reproduced",
    "chain_intact": true,
    "signature_valid": true,
    "tier0": true,
    "tier1": true,
    "tier2_ran": true,
    "coverage_bp": 8471,
    "catalog_matches": true,
    "violations": { "dag": 0, "dataflow": 0, "level": 0, "other": 0 },
    "streak": 3,
    "median_gap_days": 2
  },
  "progress": {
    "plane": "claimed",
    "level": 5,
    "level_name": "First Customers and PMF",
    "levels": [{ "level": 0, "name": "Ideation and Validation", "total": 12, "done": 12 }],
    "playbooks_total": 105,
    "playbooks_done": 72,
    "playbooks_ready": 15,
    "playbooks_blocked": 18,
    "critical_remaining": 8,
    "done_nodes": [{ "node_id": "opportunity-scan", "title": "Opportunity Scan", "has_rubric": true, "department": "Strategy" }],
    "ready_nodes": [],
    "blocked_nodes": [],
    "departments": ["Strategy", "Growth"],
    "constraint": {
      "archetype": "no_users",
      "lead_departments": ["Growth", "Sales"],
      "win": {
        "metric_id": "paying_customers",
        "label": "paying restaurants",
        "current_value": 63,
        "target_value": 100,
        "deadline": 41,
        "unit": null
      },
      "win_gap": 37
    },
    "north_star": {
      "band": "retention",
      "metric_id": "nrr",
      "label": "net revenue retention",
      "guardrails": ["forecast accuracy above 90 percent"]
    },
    "quality": { "self_score_mean": 83, "self_score_n": 53, "gaps_open": 2 },
    "work": {
      "tasks_7d": 42,
      "tasks_30d": 180,
      "tasks_total": 900,
      "tasks_window": 12,
      "artifacts_total": 72,
      "rubric_pins": 40,
      "in_flight": 3
    },
    "driver_harness": { "name": "claude-code", "version": "1.0.0" },
    "last_session_at": "...Z"
  },
  "calendar": {
    "plane": "reproduced",
    "days": [{ "date": "2026-08-01", "events": 4, "attestation": true, "decision": false }]
  },
  "ledger": {
    "plane": "claimed",
    "window_events": 12,
    "shown": [{
      "ts": "...Z",
      "kind": "playbook",
      "status": "done",
      "node_id": "opportunity-scan",
      "title": "Opportunity Scan",
      "department": "Strategy",
      "committed": true,
      "has_rubric": true
    }]
  },
  "decisions": { "plane": "claimed", "items": [{ "ts": "...Z", "text": "...", "department": "Finance" }] },
  "departments_30d": { "plane": "claimed", "items": [{ "department": "Growth", "events": 22 }] },
  "envelope": { "plane": "reproduced", "subject": {}, "window": {}, "roots": {}, "signature_present": true },
  "pay": { "plane": "reproduced", "pay_attested": false },
  "next": [{ "node_id": "...", "title": "...", "department": "Growth" }],
  "waiting": [{ "node_id": "...", "title": "...", "reason": "...", "department": null }],
  "loops": [{ "id": "weekly-retro", "title": "...", "last_run": "2026-07-01", "cadence_days": 7 }],
  "chain_history": [{ "sequence": 47, "observed_at": "...Z", "attested": true, "event_count": 12 }],
  "catalog": { "sha": "...", "matches": true, "size": 169 }
}
```

`calendar.days` is 180 UTC days, oldest first. Heatmap cells = `events`.
Ring a cell when `attestation` is true. Decision ticks when `decision` is true.

`ledger.shown` is max 40, latest window, **no `note`**, no file paths.

There is **no** `claims` object and **no** `spend` amounts. `pay.pay_attested`
is false. Do not invent receipts.

## 3. Paint map (demo tile → field)

Copy from `docs/TERMINAL-AGENT-SURFACE.md`. Do not invent extra Casa fields.

| Demo | JSON |
|---|---|
| Identity name | Launchpad name/symbol. Casa `company.name` subtitle |
| Mission | `company.one_liner` |
| Founded | `company.created_at` |
| Harness | `progress.driver_harness` |
| Level | `progress.level` + `level_name` |
| Work 7d | `progress.work.tasks_7d` |
| Artifacts / rubrics / events / in flight | `artifacts_total`, `rubric_pins`, `tasks_total`, `in_flight` |
| Heatmap | `calendar.days[].events` + ring if `attestation` |
| Chart work | same calendar |
| Decision markers | `calendar.days[].decision` and `decisions.items` |
| Constraint | `progress.constraint` (claimed) |
| North star | `progress.north_star` (claimed) |
| Build map % | `playbooks_done / playbooks_total` |
| Critical path | `progress.critical_remaining` |
| Self graded | `progress.quality` |
| Graph checkable | `reproduced.coverage_bp` |
| Chain | `attestation.sequence`, `chain_history`, `median_gap_days` |
| Checks | `reproduced.tier0/1/2_ran`, `signature_valid`, `chain_intact`, `violations`, `catalog_matches` |
| Ledger wire | `ledger.shown` |
| Envelope | `envelope` |
| Ladder | `progress.levels[]` |
| Judgment | `decisions.items` |
| Depts 30d | `departments_30d.items` |
| Next / waiting | `next`, `waiting` |
| Health | `attestation.health_score` as returned |
| Attested ago | `hours_since` or `observed_at` |
| Pay | show absent / not settled. Do not fake |

Market table columns that are Casa: health, tasks 7d, heatmap, build map,
coverage, chain, attested ago. Market columns stay Launchpad.

## 4. What to build now

1. **Update `mock-casa/`** so every fixture matches the document above
   (live+progress, live+unobserved, released, 404). Include a 180-day calendar.
2. **Token page (`token.html` / `web/` equivalent)** — every bento tile in the
   demo that is company data, wired to the GET. Provenance chips on claimed vs
   reproduced. Continuity-break banner. Released state. Unobserved state.
3. **Market table (`index.html`)** — Casa columns from the GET (or a batch of
   GETs from your backend). 404 rows still list with price and empty Casa cells,
   not a fake health of 0.
4. **Backend Casa client** — 5 minute cache, never from the browser, timeout
   + fail closed (treat Casa down as 404-equivalent empty panel, not a crash).
5. **Copy pass** — reserved word `attested`; constraint tile labeled claimed;
   no em-dashes/emojis; no yield/profit/equity.
6. **e2e** — extend `web/e2e.mjs` (or equivalent) for: 404 hides Casa; unobserved
   shows empty work not zeros; heatmap has 180 cells; ledger has no `note`;
   health equals Casa JSON.

Keep SAMPLE mode if the founder already froze it. Live Launchpad directory
(XY, XX, etc.) still applies.

## 5. Parallelism

Suggested split (disjoint paths):

- mock-casa fixtures
- token page tiles
- market table Casa columns
- Casa HTTP client + cache
- e2e + copy

You own `progress/progress.json`. Children do not.

## 6. Out of scope

- Editing Casa or Launchpad code
- Rebuilding the attestation registry
- Connect Casa UI (Launchpad)
- AWS/Vercel production deploy unless the founder asks
- Inventing cofounder, Pay receipts, or spend micros

## 7. Done when

A token page fed by mock or `:8787` looks like `capx-terminal-demo/token.html`
for company tiles, with honest planes, and a Launchpad mint with no Casa bind
still shows market data and no fake progress.

Start by reading the files in section 0, then update the 4199 board, then
implement. If anything in `docs/TERMINAL-V1-CONTRACT.md` contradicts the new
GET, the GET + `TERMINAL-AGENT-SURFACE.md` win; amend the contract with a
dated note.
