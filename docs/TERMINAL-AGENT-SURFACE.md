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

## Company face (2026-09-14, WP4)

`/<slug>` and `/<mint>` use the company page; `/c/` and `/t/` redirect with 301.
`GET /api/companies/{slug-or-mint}` resolves mints through the market join. An
unbound token retains its market row with `company: null` and a zero readiness meter.
Casa company GET supplies `face`, `face_updated_at`, and `readiness.face.missing`.
Token-only faces come from Casa token GET. Positive token cache remains 300 s;
negative Casa caches last 30 s. The directory never fetches per-mint Casa documents.

All face fields are **claimed**, displayed at full contrast with "company authored":
`brief.summary`, `brief.sections[].{title,body}`, `diagrams.{architecture,product_flow,data_model,org_chart,token_flow}`,
`roadmap[].{id,title,target,status,playbooks}`, `plan[].{id,title,milestone,playbook,status}`,
`agents[].{name,department,mandate,playbooks,events[].{ts,task,status,node_id}}`,
`collateral.{site,one_pager,deck}`, company/token identity and source digests.
Readiness counts the seven required parts; optional token flow is excluded. The
URL-free market sidecar carries readiness and agent count. Neither is attested.
Brief text only recognizes `## ` headings. Mermaid runs inside an opaque sandbox;
parse failures show escaped source. Hosted collateral and output bytes pass through
the GET-only Terminal proxy with an 8 s deadline and a 60 s public cache. Collateral
root URLs redirect to a trailing slash so relative assets resolve under the proxy.
Attestation subpages hold the envelope, checks, ledger and data-plane explanation.
V2 Launchpad is primary, legacy Launchpad secondary. USD price and market cap are
CAPX values multiplied by `capxUsd`; market tables sort by USD cap with nulls last.
