# Casa changes so Terminal can look like the demo

**Date:** 2026-08-20
**Status:** locked 2026-08-20 after founder answers. Ready to implement on Casa (service projection + small claims/identity fields).
**Demo:** `~/Documents/july/capx/capx-terminal-demo/` (`index.html`, `token.html`, `data.js`)
**Current public GET:** spec v1.1 whitelist in `CASA-AUTH-SPEC.md` §3 / `service/src/public.mjs`

The demo is a market table plus a bento token page. Market numbers are on-chain. Almost everything lime is **company work**, and the demo already tags it as claimed / committed / reproduced. Casa should publish a **terminal surface** document that can fill those lime tiles. Price, FDV, liquidity, volume, spark stay Launchpad.

v1.1 whitelist is too thin for that page. This plan widens what Casa **projects**, not what it stores. Bundles stay on disk. File bytes still never leave.

---

## 1. What the demo shows, and who owns it

### Market overview (`index.html`)

| UI | Source in the demo | Casa should publish? |
|---|---|---|
| CAPX price, ecosystem FDV, 24h volume | sample market | No. Launchpad / CAPX pool |
| Work 7d (aggregate) | sum of claimed daily tasks | Yes, sum of per-mint `work.days` |
| Median coverage | reproduced coverage_bp | Yes, `reproduced.coverage_bp` |
| Signed count | envelope signature | Yes, `reproduced.signature_valid` |
| Attested 7d count | hoursSince ≤ 168 | Yes, `attestation.observed_at` |
| Healthiest podium / health column | demo's own score | Yes, existing `health_score` (Casa formula, not the demo's) |
| Company name, ticker | sample | Name: Casa claimed slug/name. Ticker: Launchpad symbol |
| Price, 24h, vol, liq, FDV, 7d spark | sample market | No |
| Tasks 7d, heatmap, build map % | claimed work | Yes |
| Coverage, chain seq, attested ago | reproduced | Yes |

### Token page (`token.html`)

| Tile | Fields | Casa? |
|---|---|---|
| Identity | name, pair, level, founded, harness, cofounder, mission, provenance | Pair = Launchpad. Founded = `identity.created_at`. Mission = `profile.one_liner` (claimed). Cofounder is **not in Casa today** |
| Market | price, FDV, liq, vol, supply | No (supply is Launchpad 1B, not 100M as in the demo) |
| Work 7d | tasks 7d, artifacts, rubric pins, events all-time, in flight | Yes, from claims + calendar |
| Heatmap | daily task counts, ring = day an attestation landed | Yes, Casa-built calendar from observation history |
| Chart | price vs work vs decision markers | Price = Launchpad. Work + decision days = Casa |
| Binding constraint | archetype, leads, north star, win current/target/gap/deadline, guardrails | Yes as **claimed**, with the kill-list call below |
| Vitals | north star, build map, critical path, self-grade, coverage, chain | Yes |
| What Capx re-ran | check list, coverage bar, catalog match, violations | Yes, from tier 0/1/2 already run at push |
| Disclosed ledger | recent events | Yes, redacted delta |
| Envelope | attestation.json fields | Yes, already mostly on GET |
| Level ladder | levels 0–8, per-level done/total, department lens | Yes, needs a level breakdown in the projection |
| Judgment | recent decisions | Yes, from ledger `decision` / decision files |
| Departments 30d | work by department | Yes, from ledger |
| Five planes | copy | Terminal copy, not an API field |
| Settled / Pay | receipts | Keep `pay_attested: false` and no amounts until Pay exists |

---

## 2. What Casa already has (do not rebuild)

Already in `claims.json` from `scripts/attest.mjs`:

- `state.level`, `level_name`, `departments`, `leads`
- `buildmap.total/done/ready/blocked/critical_remaining/done_nodes` (node_id + rubric_sha256)
- `northstar.band/metric_id/label/guardrails`
- `constraint.archetype/lead_departments/win_definition/win_gap`
- `work.tasks_done_window/total`, `artifacts_total`, `in_flight`, `node_id_coverage_bp`
- `quality.self_score_mean/n`, `gaps_open`
- `self_check` violations + catalog sha
- `spend` (omit amounts on the public surface)

Already on the service after a push: envelope, Casa `observed_at`, health score, freshness, hashes, binding, stored bundles including `ledger.delta.jsonl` and `chain.jsonl`.

The gap is almost entirely **projection + history**, not new brain files.

---

## 3. Proposed Casa public document (additive)

Keep `GET /v1/tokens/{mint}`. Widen the JSON. Every block carries `plane`: `claimed` | `reproduced` | `committed`. Terminal must render that plane. Casa does not become a second market API.

```json
{
  "mint": "...capx",
  "company": { "pubkey": "...", "slug": "...", "name": "...", "created_at": "...", "one_liner": "..." },
  "binding": { "status": "live|released", "bound_at": "...", "continuity_break": false, "rebind_count": 0 },
  "attestation": { "attested": true, "sequence": 47, "observed_at": "...", "health_score": 78, "freshness": "fresh", "caf_version": "1.1.0", "hours_since": 6, "...hashes" },
  "reproduced": {
    "plane": "reproduced",
    "chain_intact": true,
    "signature_valid": true,
    "tier0": true,
    "tier1": true,
    "tier2_ran": true,
    "coverage_bp": 8471,
    "catalog_matches": true,
    "violations": { "dag": 0, "dataflow": 0, "level": 0, "other": 0 }
  },
  "progress": {
    "plane": "claimed",
    "level": 5,
    "level_name": "First customers and PMF",
    "levels": [{ "level": 0, "name": "...", "total": 12, "done": 12 }, "..."],
    "playbooks_total": 105,
    "playbooks_done": 72,
    "playbooks_ready": 15,
    "playbooks_blocked": 18,
    "critical_remaining": 8,
    "done_nodes": [{ "node_id": "...", "title": "...", "has_rubric": true }],
    "departments": ["Strategy", "..."],
    "constraint": { "archetype": "no_users", "lead_departments": ["Growth", "Sales"], "win": {} },
    "north_star": { "band": "retention", "metric_id": "nrr", "label": "...", "guardrails": [] },
    "quality": { "self_score_mean": 83, "self_score_n": 53, "gaps_open": 2 },
    "work": {
      "tasks_7d": 42,
      "tasks_30d": 180,
      "tasks_total": 900,
      "artifacts_total": 72,
      "rubric_pins": 40,
      "in_flight": 3
    }
  },
  "calendar": {
    "plane": "reproduced",
    "days": [{ "date": "2026-08-01", "events": 4, "attestation": true, "decision": false }]
  },
  "ledger": {
    "plane": "claimed",
    "window_events": 12,
    "shown": [
      {
        "ts": "...Z",
        "kind": "playbook",
        "status": "done",
        "node_id": "opportunity-scan",
        "title": "Opportunity Scan",
        "department": "Strategy",
        "committed": true,
        "has_rubric": true
      }
    ]
  },
  "decisions": {
    "plane": "claimed",
    "items": [{ "ts": "...Z", "text": "...", "department": "Finance" }]
  },
  "departments_30d": {
    "plane": "claimed",
    "items": [{ "department": "Growth", "events": 22 }]
  },
  "envelope": { "plane": "reproduced", "subject": {}, "roots": {}, "window": {}, "signature_prefix": "ed25519:" },
  "pay": { "plane": "reproduced", "pay_attested": false }
}
```

`calendar` is the heatmap and the chart's work series. Casa merges it at each push from `ledger.delta` dates plus `observed_at` (ring). Terminal must not invent days.

`ledger.shown` is a **redacted** delta: no `note`, no file bytes, no paths that leak a private repo. Titles from the catalog when `node_id` is known; otherwise the event `task` string (claimed).

---

## 4. Code changes on the Casa side (only)

1. **`service/src/public.mjs`**  
   Build the document above from the stored bundle + observation history. Stop dropping north star / vitals / ledger / calendar.

2. **`service` store**  
   Keep a rolling `calendar[]` per mint (merge on each push). Keep enough observation heads to know which UTC days had an attestation. Cap ledger.shown to the latest window (e.g. 40 events) plus a count.

3. **`scripts/attest.mjs` claims (small)**  
   Add `buildmap.levels[]` `{ level, name, total, done }` so the ladder is not guessed. Already have `critical_remaining`. Optional: `work.by_department` in the window so the service does not re-parse delta as hard.

4. **`identity.json` / bind**  
   Publish `created_at` and `profile.one_liner` as claimed mission. Do **not** add a cofounder field unless the founder wants it (not in the brain today).

5. **Spec + OpenAPI**  
   Replace the v1.1 thin whitelist with this terminal surface. Keep: no file bytes, no raw `claims` object dump, no spend amounts, no private keys.

6. **Tests**  
   Extend `service/test/api.test.mjs` and e2e: heatmap days present, ledger has no `note`, spend amounts absent, ladder levels length 9 or as many as the build map.

No change to `brain.mjs` purity, keyring, or bind flow.

---

## 5. What we still do not publish

- Company-brain file bytes and merkle inclusion proofs (committed, reveal later)
- Ledger `note` / `terminal` fields
- Autonomy dials
- Capx Pay amounts until Pay writes receipts (`pay_attested` stays false)
- Cofounder name (unless we add it to identity)
- Anything Launchpad owns: symbol, pair, pool, price, FDV, liquidity, volume, supply

---

## 6. Kill-list tension (must confirm)

v1.1 stripped north-star **labels** and `win_definition` **values** because of "no revenue/yield/profit/equity language near agent tokens." The demo's constraint tile is exactly those numbers (including sample MRR).

Recommended default if you want the demo page:

- Publish them as **claimed**
- Casa still strips `spend.*_micros*`
- Terminal copy must say "founder claimed" on that tile and must not call it yield/profit/equity
- Casa may still redact a label that is exactly `mrr`/`arr` into `metric_id` only, or pass the label through

If you want to keep the v1.1 strip: the constraint tile becomes archetype + leads only, and the demo's win bar cannot be filled.

---

## 7. Locked 2026-08-20

1. **Win / north star:** publish as **claimed**. Spend micros stay private. Terminal labels the tile claimed; no yield/profit/equity copy.
2. **Mission:** `profile.one_liner` + `identity.created_at`. No cofounder field.
3. **Ledger:** calendar ~180 UTC days (event counts + attestation ring + decision flag) and the **latest window**, max **40** redacted events.

Also: publish **more** than the demo where Casa already has it (section 8). Do not invent metrics Casa does not record.

---

## 8. Richer than the demo (still Casa-owned)

Add these to the same GET. All claimed unless marked reproduced.

| Extra | Why Terminal wants it | Source |
|---|---|---|
| `next` | “What they are doing now” | NOW.md next action / claims ready set, first 5 `{ node_id, title, department }` claimed |
| `waiting` | Founder blockers | `state` waiting-on-you ids + reasons, max 10, claimed |
| `loops` | Recurring discipline | loops due/last-run names only, claimed |
| `chain_history` | Chain tile + median gap | last 64 observations `{ sequence, observed_at, attested, event_count }` **reproduced** |
| `driver_harness` | Identity subtitle | envelope `subject.driver_harness` reproduced |
| `catalog` | Replay honesty | `{ sha, matches, size: 169 }` reproduced |
| `ready_nodes` / `blocked_nodes` | Build map is not only a percent | up to 10 each, titles from catalog, claimed |
| `quality.gaps_open` | Self-grade tile | claims.quality |
| `window` | Cadence copy | envelope `from_ts`/`to_ts` |
| `primary_type` | What kind of company | profile.primary_type claimed. Skip `monetization` (kill-list adjacent) |
| `streak` / `median_gap_days` | Demo computes these | Casa computes from `chain_history` reproduced |
| `continuity_break` | Already in binding | keep |

Skip: cofounder, ICP dump, autonomy dials, git remotes, full NOW.md, file paths, Pay amounts.

---

## 9. Implementation order on Casa

1. Spec + OpenAPI: replace thin whitelist with this terminal surface.
2. `attest.mjs`: add `buildmap.levels[]`.
3. Service: calendar merge on push; `public.mjs` emits the full document.
4. Tests: e2e asserts calendar, 40-cap ledger, no spend micros, one_liner present when profile has it, north_star claimed.
5. Hand Terminal the updated OpenAPI + a one-page “how to paint the demo tiles.”

Engine bind/key/autopush stay as they are.
