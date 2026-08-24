import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import {
  CATEGORY_FILTERS,
  MARKET_KEYS,
  filterRows,
  honestMarket,
  hrefForRow,
  joinDirectory,
  kindCounts,
  marketDash,
  matchesHealth,
  matchesKind,
  matchesSearch,
  nullMarket,
  searchHaystack,
} from "../join.mjs";
import { loadJson } from "../../../../ORCHESTRATOR/casa-terminal-plan-01/contracts/validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..");
const GOLDEN = join(repoRoot, "../../ORCHESTRATOR/casa-terminal-plan-01/contracts/golden");

const KINDS = ["all", "company_with_token", "company_without_token", "token_without_company"];
const HEALTH = ["all", "leaders", "fresh", "review"];

function launchpadFromComposite(row) {
  if (!row.token) return null;
  const m = row.market || {};
  const has = MARKET_KEYS.some((k) => m[k] != null);
  return {
    id: row.token.project_id,
    mint: row.token.mint,
    name: row.token.name,
    symbol: row.token.symbol,
    logoUrl: row.token.logo_url,
    state: row.token.state,
    marketPerformance: has
      ? {
          currentMarketCapUsd: m.fdv_usd,
          volume24hUsd: m.volume_24h_usd,
          liquidityUsd: m.liquidity_usd,
          priceChange24hPercent: m.change_24h_percent,
        }
      : null,
  };
}

function extractFunction(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) throw new Error(`missing ${signature}`);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${signature}`);
}

function loadMarketApi() {
  const src = readFileSync(join(webRoot, "market.js"), "utf8");
  const signatures = [
    "function tokenByMint(mint)",
    "function companySurface(slug)",
    "function honestMarket(row)",
    "function fromComposite(row)",
    "function casaDoc(row)",
    "function healthOf(row)",
    "function freshnessOf(row)",
    "function hoursSinceOf(row)",
    "function searchBlob(row)",
    "function matchesQuery(row, query)",
    "function matchesKind(row, kind)",
    "function matchesHealth(row, filter)",
    "function rowVisible(row, query, kind, health)",
    "function hrefForRow(row)",
  ];
  const body = signatures.map((sig) => extractFunction(src, sig)).join("\n");
  const sandbox = {
    DATA: { tokens: [] },
    MARKET_KEYS: MARKET_KEYS.slice(),
    F: {
      tokenPriceUsd(row) {
        const mcap = row && row.marketPerformance && row.marketPerformance.currentMarketCapUsd;
        if (mcap == null || !Number.isFinite(mcap)) return null;
        return mcap / 1e9;
      },
    },
  };
  return vm.runInNewContext(
    `"use strict";\n${body}\n({ tokenByMint, companySurface, honestMarket, fromComposite, casaDoc, healthOf, freshnessOf, hoursSinceOf, searchBlob, matchesQuery, matchesKind, matchesHealth, rowVisible, hrefForRow });`,
    sandbox,
  );
}

function idOf(row) {
  if (row.company && row.company.slug) return row.company.slug;
  if (row.token && row.token.symbol) return row.token.symbol;
  return row.slug || row.symbol || row.name;
}

function ids(rows) {
  return rows.map(idOf).sort();
}

const withToken = loadJson(join(GOLDEN, "composite-company-token.json"));
const companyOnly = loadJson(join(GOLDEN, "composite-company-only.json"));
const tokenOnly = loadJson(join(GOLDEN, "composite-token-only.json"));
const directory = loadJson(join(GOLDEN, "directory.json"));

const leader = {
  kind: "company_without_token",
  company: {
    company_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    slug: "leader-co",
    name: "Leader Co",
    description: "A high health company without a token yet.",
    logo: "https://leader-co.casa.capx.ai/logo.png",
    category: "infrastructure",
    canonical_url: "https://leader-co.casa.capx.ai",
    health_score: 91,
    freshness: "fresh",
  },
  token: null,
  market: nullMarket(),
};

const renamed = {
  ...withToken,
  token: {
    ...withToken.token,
    name: "Pilot Coin",
    symbol: "PILOT",
  },
};

const zeroToken = {
  kind: "token_without_company",
  company: null,
  token: {
    mint: "ZeroTokMint1111111111111111111capx",
    name: "Zero Token",
    symbol: "ZERO",
    logo_url: null,
    project_id: "33333333-3333-4333-8333-333333333333",
    state: "COMPLETED",
  },
  market: {
    price_usd: 0,
    fdv_usd: 0,
    volume_24h_usd: 0,
    liquidity_usd: 0,
    change_24h_percent: 0,
  },
};

const brokenBind = {
  kind: "token_without_company",
  company: null,
  token: {
    mint: "BindTokMint1111111111111111111capx",
    name: "Bind Break",
    symbol: "BRK",
    logo_url: null,
    project_id: "44444444-4444-4444-8444-444444444444",
    state: "COMPLETED",
  },
  market: nullMarket(),
  casa: {
    status: 200,
    document: {
      company: { name: "Bind Break", slug: "bind-break" },
      attestation: { attested: false, freshness: "unobserved", health_score: null },
      binding: { status: "live", continuity_break: true },
    },
  },
};

const fixtureRows = [withToken, companyOnly, tokenOnly, leader, renamed, zeroToken, brokenBind];

test("market page keeps health chips and adds the three category labels", () => {
  const html = readFileSync(join(webRoot, "index.html"), "utf8");
  assert.match(html, /data-f="all">All</);
  assert.match(html, /data-f="leaders">Health 80\+</);
  assert.match(html, /data-f="fresh">Attesting weekly</);
  assert.match(html, /data-f="review">Needs review</);
  for (const { id, label } of CATEGORY_FILTERS) {
    assert.match(html, new RegExp(`data-kind="${id}">${label.replace("+", "\\+")}<`));
  }
  assert.match(html, /placeholder="Search name, ticker, or slug"/);
  assert.doesNotMatch(html, /\u2014/);
  assert.doesNotMatch(html, /[\u{1F300}-\u{1FAFF}]/u);
});

test("join of Casa companies and Launchpad tokens is searchable from both sources", () => {
  const rows = joinDirectory(directory.companies, [
    launchpadFromComposite(withToken),
    launchpadFromComposite(tokenOnly),
  ]);
  assert.deepEqual(kindCounts(rows), {
    company_with_token: 1,
    company_without_token: 1,
    token_without_company: 1,
  });

  assert.deepEqual(ids(filterRows(rows, { query: "triage" })), ["inboxpilot"]);
  assert.deepEqual(ids(filterRows(rows, { query: "INBOX" })), ["inboxpilot"]);
  assert.deepEqual(ids(filterRows(rows, { query: "2CasaCoMint" })), ["inboxpilot"]);
  assert.deepEqual(ids(filterRows(rows, { query: "developer-tools" })), ["inboxpilot"]);
  assert.deepEqual(ids(filterRows(rows, { query: "inboxpilot" })), ["inboxpilot"]);

  assert.deepEqual(ids(filterRows(rows, { query: "northstar-labs" })), ["northstar-labs"]);
  assert.deepEqual(ids(filterRows(rows, { query: "research notebook" })), ["northstar-labs"]);
  assert.deepEqual(ids(filterRows(rows, { query: "productivity" })), ["northstar-labs"]);
  assert.deepEqual(ids(filterRows(rows, { query: "Northstar Labs" })), ["northstar-labs"]);

  assert.deepEqual(ids(filterRows(rows, { query: "SOLO" })), ["SOLO"]);
  assert.deepEqual(ids(filterRows(rows, { query: "Solo Token" })), ["SOLO"]);
  assert.deepEqual(ids(filterRows(rows, { query: "2CasaTokBare" })), ["SOLO"]);

  assert.equal(filterRows(rows, { query: "no-such-company-or-token" }).length, 0);
  assert.equal(filterRows(rows, { query: "  " }).length, 3);
});

test("category filters match join kinds and compose with search", () => {
  const rows = [withToken, companyOnly, tokenOnly];
  assert.deepEqual(ids(filterRows(rows, { kind: "company_with_token" })), ["inboxpilot"]);
  assert.deepEqual(ids(filterRows(rows, { kind: "company_without_token" })), ["northstar-labs"]);
  assert.deepEqual(ids(filterRows(rows, { kind: "token_without_company" })), ["SOLO"]);
  assert.deepEqual(ids(filterRows(rows, { kind: "all" })), ["SOLO", "inboxpilot", "northstar-labs"]);

  assert.deepEqual(ids(filterRows(rows, { kind: "company_without_token", query: "northstar" })), ["northstar-labs"]);
  assert.deepEqual(ids(filterRows(rows, { kind: "company_with_token", query: "solo" })), []);
  assert.deepEqual(ids(filterRows(rows, { kind: "token_without_company", query: "inbox" })), []);
  assert.deepEqual(ids(filterRows(rows, { kind: "company_with_token", query: "INBOX" })), ["inboxpilot"]);
  assert.ok(matchesSearch(renamed, "Pilot Coin"));
  assert.ok(matchesSearch(renamed, "PILOT"));
  assert.ok(matchesKind(renamed, "company_with_token"));
  assert.equal(matchesKind(companyOnly, "token_without_company"), false);
});

test("health chips still work and compose with category plus search", () => {
  const rows = fixtureRows;
  assert.deepEqual(ids(filterRows(rows, { health: "leaders" })), ["leader-co"]);
  assert.deepEqual(ids(filterRows(rows, { health: "fresh" })), ["inboxpilot", "inboxpilot", "leader-co"]);
  assert.deepEqual(ids(filterRows(rows, { health: "review" })), ["BRK", "northstar-labs"]);
  assert.ok(matchesHealth(brokenBind, "review"));

  assert.deepEqual(ids(filterRows(rows, { health: "leaders", kind: "company_without_token" })), ["leader-co"]);
  assert.deepEqual(ids(filterRows(rows, { health: "leaders", kind: "company_with_token" })), []);
  assert.deepEqual(ids(filterRows(rows, { health: "fresh", kind: "company_with_token" })), ["inboxpilot", "inboxpilot"]);
  assert.deepEqual(ids(filterRows(rows, { health: "review", kind: "company_without_token" })), ["northstar-labs"]);
  assert.deepEqual(ids(filterRows(rows, { health: "review", kind: "token_without_company" })), ["BRK"]);
  assert.deepEqual(ids(filterRows(rows, { health: "fresh", kind: "token_without_company" })), []);

  assert.deepEqual(ids(filterRows(rows, { query: "Leader", kind: "company_without_token", health: "leaders" })), ["leader-co"]);
  assert.deepEqual(ids(filterRows(rows, { query: "Leader", kind: "company_without_token", health: "review" })), []);
  assert.deepEqual(ids(filterRows(rows, { query: "labs", kind: "company_without_token", health: "review" })), ["northstar-labs"]);
  assert.deepEqual(ids(filterRows(rows, { query: "inbox", health: "leaders" })), []);
  assert.deepEqual(ids(filterRows(rows, { query: "inbox", health: "fresh" })), ["inboxpilot", "inboxpilot"]);
});

test("every kind x health permutation is exclusive and stable", () => {
  const rows = [withToken, companyOnly, tokenOnly, leader];
  const seen = new Map();
  for (const kind of KINDS) {
    for (const health of HEALTH) {
      const got = filterRows(rows, { kind, health });
      const key = `${kind}|${health}`;
      seen.set(key, ids(got));
      for (const row of got) {
        assert.equal(matchesKind(row, kind), true, `${idOf(row)} kind ${kind}`);
        assert.equal(matchesHealth(row, health), true, `${idOf(row)} health ${health}`);
      }
      for (const row of rows) {
        const expect = matchesKind(row, kind) && matchesHealth(row, health);
        assert.equal(got.includes(row), expect, `${idOf(row)} in ${key}`);
      }
    }
  }
  assert.deepEqual(seen.get("all|all"), ["SOLO", "inboxpilot", "leader-co", "northstar-labs"]);
  assert.deepEqual(seen.get("company_without_token|leaders"), ["leader-co"]);
  assert.deepEqual(seen.get("company_without_token|review"), ["northstar-labs"]);
  assert.deepEqual(seen.get("company_with_token|fresh"), ["inboxpilot"]);
  assert.deepEqual(seen.get("token_without_company|all"), ["SOLO"]);
  assert.deepEqual(seen.get("token_without_company|leaders"), []);
});

test("company-only rows stay listed and searchable with null market columns", () => {
  const rows = joinDirectory(directory.companies, [
    launchpadFromComposite(withToken),
    launchpadFromComposite(tokenOnly),
  ]);
  const tokenless = rows.filter((r) => r.kind === "company_without_token");
  assert.equal(tokenless.length, 1);
  assert.equal(tokenless[0].company.slug, "northstar-labs");
  assert.equal(tokenless[0].token, null);
  for (const key of MARKET_KEYS) {
    assert.equal(tokenless[0].market[key], null);
    assert.equal(honestMarket(tokenless[0])[key], null);
    assert.equal(marketDash(tokenless[0].market[key]), "--");
    assert.notEqual(marketDash(tokenless[0].market[key]), 0);
  }
  assert.equal(hrefForRow(tokenless[0]), "/c/northstar-labs");
  assert.ok(searchHaystack(tokenless[0]).includes("northstar-labs"));
  assert.ok(matchesSearch(tokenless[0], "Northstar"));
  assert.equal(hrefForRow(withToken).startsWith("/t/"), true);
  assert.equal(hrefForRow(tokenOnly).startsWith("/t/"), true);
});

test("tokenless market stays dash/null even when a zero payload is injected", () => {
  const poisoned = {
    ...companyOnly,
    market: {
      price_usd: 0,
      fdv_usd: 0,
      volume_24h_usd: 0,
      liquidity_usd: 0,
      change_24h_percent: 0,
    },
  };
  const honest = honestMarket(poisoned);
  for (const key of MARKET_KEYS) {
    assert.equal(honest[key], null, `${key} must not leak 0 on company-only`);
    assert.equal(marketDash(honest[key]), "--");
  }
  const tokenZeros = honestMarket(zeroToken);
  for (const key of MARKET_KEYS) {
    assert.equal(tokenZeros[key], 0);
    assert.equal(marketDash(tokenZeros[key]), 0);
  }
});

test("market.js filter, search, and honest columns agree with join helpers", () => {
  const ui = loadMarketApi();
  const rows = fixtureRows;
  for (const row of rows) {
    for (const kind of KINDS) {
      for (const health of HEALTH) {
        for (const query of ["", "inbox", "northstar", "SOLO", "Pilot Coin", "Leader", "productivity", "2CasaTokBare"]) {
          const joinHit = filterRows([row], { query, kind, health }).length === 1;
          const uiHit = ui.rowVisible(row, query, kind, health);
          assert.equal(uiHit, joinHit, `${idOf(row)} q=${query} kind=${kind} health=${health}`);
        }
      }
    }
  }

  const flatOnly = ui.fromComposite(companyOnly);
  assert.equal(flatOnly.kind, "company_without_token");
  assert.equal(flatOnly.mint, null);
  assert.equal(flatOnly.slug, "northstar-labs");
  assert.equal(flatOnly.marketPerformance, null);
  assert.equal(ui.hrefForRow(flatOnly), "/c/northstar-labs");
  assert.equal(ui.rowVisible(flatOnly, "northstar-labs", "company_without_token", "all"), true);
  assert.equal(ui.rowVisible(flatOnly, "INBOX", "all", "all"), false);

  const poisoned = {
    ...companyOnly,
    market: {
      price_usd: 0,
      fdv_usd: 0,
      volume_24h_usd: 0,
      liquidity_usd: 0,
      change_24h_percent: 0,
    },
  };
  const flatPoisoned = ui.fromComposite(poisoned);
  assert.equal(flatPoisoned.marketPerformance, null);
  for (const key of MARKET_KEYS) {
    assert.equal(ui.honestMarket(poisoned)[key], null);
  }

  const flatZero = ui.fromComposite(zeroToken);
  assert.equal(flatZero.marketPerformance.currentMarketCapUsd, 0);
  assert.equal(ui.honestMarket(zeroToken).fdv_usd, 0);

  const flatRenamed = ui.fromComposite(renamed);
  assert.equal(ui.rowVisible(flatRenamed, "Pilot Coin", "company_with_token", "all"), true);
  assert.equal(ui.rowVisible(flatRenamed, "PILOT", "all", "all"), true);
  assert.equal(ui.hrefForRow(flatRenamed), `/t/${renamed.token.mint}`);
});

test("market.js keeps company-only rows in listed() and dashes tokenless prices", () => {
  const src = readFileSync(join(webRoot, "market.js"), "utf8");
  const listed = extractFunction(src, "function listed()");
  assert.match(listed, /Array\.isArray\(DATA\.rows\)/);
  assert.doesNotMatch(listed, /DATA\.rows\.length/);
  assert.match(src, /kind === "company_without_token"/);
  assert.match(src, /data-kind/);
  assert.match(src, /data-slug/);
  assert.match(src, /\/c\/" \+ tr\.getAttribute\("data-slug"\)/);
  assert.doesNotMatch(src, /price_usd \|\| 0/);
  assert.doesNotMatch(src, /fdv_usd \|\| 0/);
  assert.doesNotMatch(src, /volume_24h_usd \|\| 0/);
  assert.doesNotMatch(src, /liquidity_usd \|\| 0/);
});
