---
title: Terminal Mobile Density - Plan
type: feat
date: 2026-08-29
artifact_contract: ce-unified-plan/v1
artifact_readiness: founder-decision
product_contract_source: founder-ask-2026-08-29 ("can we have more info in the mobile view")
execution: code
---

# Terminal Mobile Density - Plan

**Target repo:** Capx-AI/terminal (local working tree `terminal-deployment/`), from `main` at `f0fc0aa` (phone layout parts 1 and 2 plus the header hotfix are live, stamp 26082903).
**Founder ask, 2026-08-29:** look at dexscreener.com and similar on a phone, see how much information they fit, and get more information into the Terminal mobile view.

## Measured (2026-08-29, real Google Chrome, iPhone 14 emulation, 390x664)

Counted with the same script on every page: visible text nodes above the fold, how many of them carry a number, links and buttons above the fold.

| Page | Text nodes | Numeric | Links | What the first screen shows |
|---|---|---|---|---|
| DexScreener pair page (CAPX/SOL) | 211 | **102** | 2 | pair, chain, DEX; price USD and price SOL; liquidity, FDV, market cap; 5m / 1h / 6h / 24h change; txns, buys, sells with a ratio bar; volume, buy vol, sell vol with a ratio bar; then a tab bar (Info, Chart+Txns, Chart, Txns) |
| DexScreener home | 96 | 35 | 32 | trending categories with caps; 24h volume and txns; timeframe chips; a token table with 8 rows visible (chain, DEX, name, market cap, price, age, and more on swipe) |
| Birdeye token page | 77 | 29 | 32 | blocked by a promo modal on first load; comparable density to DexScreener once dismissed |
| CoinGecko home | 41 | 17 | 24 | hero copy, then the table starts at the fold |
| **Terminal token page (QNTRO)** | 36 | **10** | 4 | identity tile (logo, name, symbol, description, two chips), then the market tile: price, CAPX quote line, FDV, liquidity, 24h volume, supply, state, qualifying CAPX, participants, window |
| **Terminal home** | 44 | 12 | 11 | thesis line, stat strip (8 cards, two per row), "healthiest companies" podium starts; the tokens table is below the fold |
| **Terminal company page (AgentGraph)** | 19 | **4** | 7 | identity tile (name, category, level, founded, description, five chips, last attestation), then the artifact stage |

DexScreener fits ten times the numbers Terminal does on the same screen. The difference is not data, it is layout: Terminal's phone view spends the first screen on identity and prose, and the market tile shows one fact per 60px row.

### What Terminal already has and does not show on the first screen

From `/api/tokens/{mint}` and `/api/companies/{slug}` today (no API change needed):

- Token: `marketPerformance.launchValuationUsd`, `currentMarketCapUsd`, `roiMultiple` (launch to now, unique to Capx), `volume24hUsd`, `liquidityUsd`, `priceChange24hPercent`, `participantCount`, `qualifyingNetCapxBase`, `fundingFinalizedAt`, `poolAddress`, `links`, the sparkline, and the Codex candles behind the chart.
- Company: `attestation.health_score`, `freshness`, `hours_since`, `sequence`; `progress.level`, `level_name`, per-level `done/total`; `reproduced.coverage_bp`, `chain_intact`, `signature_valid`, `streak`, `median_gap_days`; `ledger.window_events`; `departments_30d`; `calendar` (the heatmap); `outputs` count.
- Home rows: price, 24h change, volume, liquidity, FDV per token; health, tasks 7d, coverage, chain, attested per company. On a phone only rank, name, and one number are visible without swiping.

What Terminal does not have and DexScreener does: 5m/1h/6h change (derivable from the Codex candles already fetched), transaction counts, buys/sells split, buyer/seller counts, holder counts. Those need a data source (Codex `getTokenEvents`, or Launchpad) and are a later phase.

## Proposal: a denser first screen on phones, same facts, same grammar

Rules that do not move: desktop unchanged above 880px (baseline diff), the 11px type floor and 24px tap targets from part 2, the provenance grammar (reproduced lime, market white/green/red, claimed dotted), no revenue or yield language, no new dependencies.

### Token and company pages

1. **Key-numbers strip** directly under the header, before the identity tile: a 3-column grid of compact cells (label 11px, value 14px mono, 10px vertical padding), two rows. Token: price, 24h, FDV; liquidity, 24h volume, launch ROI (from `roiMultiple`, shown as a multiple, no profit language). Company: health, level x/y, tasks 7d; coverage, chain, last attestation. Bound token: both rows, market first. That is 12 facts in about 130px.
2. **Identity tile compacts:** logo, name, symbol and state chips on one row; description clamped to two lines with a "more" toggle (24px tap); the "Level 2 · Product and Infra Foundation · Founded" line stays.
3. **Market tile becomes key-value rows:** label left, value right, one 32px line per fact instead of a two-column grid with 60px cells. The eight facts that take 600px today take about 260px. The big price stays as the row's headline.
4. **Section order on phones:** key numbers, identity, chart (token) or stage (company), market rows, Casa tiles. Nothing is removed; the deep tiles (ledger, envelope, judgment) keep their order below.

### Home

5. **Stat strip four-up:** eight cards as two rows of four (label 11px, value 16px) instead of two per row; height halves.
6. **Podium as list rows:** three 44px rows (rank, name, health, tasks 7d, attested) instead of three 90px cards.
7. **Table rows carry a second line on phones:** under the name, a mono line with the two or three numbers a visitor wants first (tokens: price, 24h change, FDV; companies: health, tasks 7d, attested). The full column set still scrolls sideways; the second line means the first screen already answers the question. This is the DexScreener pattern (name cell carries chain, DEX, and symbol; numbers follow).
8. **Thesis line collapses to one line** with an ellipsis on phones; the full sentence stays on desktop.

Targets, measured by the harness with a new `factCensus(page)` (numeric text nodes above the fold at 390): token page from 10 to at least 36, company page from 4 to at least 24, home from 12 to at least 40. Page height at 390 must not grow.

### Later, needs data (not in this plan's build)

9. 5m/1h/6h change from the Codex candles the server already fetches (one derived field per token, cached with the sparkline).
10. Transactions, buys/sells, holders: Codex `getTokenEvents`/holders or Launchpad; a source decision first.

## Phases and first estimates

| Phase | Scope | Files | Estimate |
|---|---|---|---|
| D0 | `factCensus` in the harness plus a phase 3 test with the density targets; capture current numbers as the "before" | `web/tools/mobile/` | 40 min |
| D1 | CSS-only compaction: key-value market rows, four-up strip, podium rows, thesis clamp, identity row (items 3, 5, 6, 8, part of 2) | `app.css`, `v1.css`, test pins | 60 min |
| D2 | Markup and JS: key-numbers strip on token and company pages, table second line, description toggle (items 1, 2, 7) | `token.html`, `company.html`, `index.html`, `token.js`, `company.js`, `market.js`, tests | 120 min |
| D3 | Release: stamp, suite, harness phase 1 to 3, e2e, push, deploy, invalidate, production census, contract 20c | as before | 30 min |

Calibration from today's board is 0.13, so the wall clock is closer to 35 minutes total if the same pattern holds.

## Decision needed

- Go on D0 to D3 as written, or D1 first (CSS-only, no markup) as a smaller step.
- Whether launch ROI belongs on the first screen. It is a market fact from Launchpad (launch valuation to current market cap) and would be labelled as such; if it reads as performance marketing to the founder, it stays off the strip.
- Whether to start the data work for 1h/6h change now (Codex candles are already on the server) or after the density release.
