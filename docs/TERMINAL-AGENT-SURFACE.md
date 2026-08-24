# Terminal agent: paint the demo from Casa GET

Casa `GET /v1/tokens/{mint}` is now the terminal surface (2026-08-20). Mock or hit `http://127.0.0.1:8787`. Spec: `CASA-AUTH-SPEC.md` + `CASA-TERMINAL-SURFACE-PLAN.md`. OpenAPI: `openapi.yaml`.

Backend fetches Casa. Cache 5 minutes. Never from the browser. 404 = hide Casa tiles, keep the market page.

## Plane colors (demo `app.css`)

- Market / on-chain (white, green, red): price, 24h, vol, liq, FDV, spark. **Launchpad, not this GET.**
- Reproduced (lime, `v-rep`): `reproduced.*`, `attestation.health_score`, `attestation.freshness`, `attestation.observed_at`, `calendar` rings, `chain_history`.
- Claimed (lime, `v-clm`): `progress.*`, `ledger.shown`, `decisions`, `next`, `waiting`, `company.one_liner`.
- Committed: `ledger.shown[].committed` / `has_rubric`.

`attested` is reserved. `last_session_at` is claimed (founder clock). Do not write "verified". No yield/profit/equity copy. Constraint/north-star numbers are claimed.

## Map demo tiles → JSON

| Demo | JSON |
|---|---|
| Identity name | Launchpad symbol/name for title. `company.name` / `slug` subtitle. |
| Mission | `company.one_liner` |
| Founded | `company.created_at` |
| Harness | `progress.driver_harness` or `envelope.subject.driver_harness` |
| Level | `progress.level` + `level_name` |
| Work 7d | `progress.work.tasks_7d` |
| Artifacts / rubrics / events / in flight | `progress.work.artifacts_total`, `rubric_pins`, `tasks_total`, `in_flight` |
| Heatmap | `calendar.days[]` `events`; ring if `attestation` |
| Chart work series | same calendar |
| Decision markers | `calendar.days[].decision` or `decisions.items` |
| Constraint | `progress.constraint` (archetype, leads, `win` current/target) |
| North star | `progress.north_star` |
| Build map % | done/total |
| Critical path | `progress.critical_remaining` |
| Self graded | `progress.quality` |
| Graph checkable | `reproduced.coverage_bp` |
| Chain | `attestation.sequence`, `chain_history`, `reproduced.median_gap_days` |
| Checks | `reproduced.tier0/1/2_ran`, `signature_valid`, `chain_intact`, `violations`, `catalog_matches` |
| Ledger wire | `ledger.shown` (no notes) |
| Envelope | `envelope` |
| Ladder | `progress.levels[]` |
| Judgment | `decisions.items` |
| Depts 30d | `departments_30d.items` |
| Next / waiting | `next`, `waiting` |
| Health column | `attestation.health_score` as returned |
| Attested ago | `attestation.hours_since` or `observed_at` |
| Pay | `pay.pay_attested` is false; do not invent receipts |

Unbound (404): no Casa panel. Bound never pushed: `progress` is null, `attestation.freshness` is `unobserved`. Released: `binding.status === "released"`. Continuity break: `binding.continuity_break`.

## Company page (`/c/{slug}`)

Same lime tiles as the token page, minus price. Source is `GET /v1/companies/{slug}` (`payload.company`), not `GET /v1/tokens/{mint}`. Hide a tile when its block is absent or empty. Keep Market/Price and the chart as empty chrome when `kind === company_without_token`. Market table company columns read `GET /api/market` `company_surfaces[slug]`, not the join row.
