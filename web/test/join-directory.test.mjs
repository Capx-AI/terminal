import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertValid,
  loadJson,
} from "../../../../ORCHESTRATOR/casa-terminal-plan-01/contracts/validate.mjs";
import {
  isPublicCompany,
  joinDirectory,
  kindCounts,
  marketFromLaunchpad,
  nullMarket,
} from "../join.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..");
const CONTRACTS = join(repoRoot, "../../ORCHESTRATOR/casa-terminal-plan-01/contracts");
const GOLDEN = join(CONTRACTS, "golden");
const SCHEMA = join(CONTRACTS, "terminal-composite-row.schema.json");

function asDirectoryRow(doc) {
  return {
    company_id: doc.company_id,
    slug: doc.slug,
    name: doc.name,
    description: doc.description,
    logo: doc.logo,
    category: doc.category,
    visibility: doc.visibility,
    published_at: doc.published_at,
    agent_mint: doc.agent_mint,
    canonical_url: doc.canonical_url,
    readiness_ready: doc.readiness ? doc.readiness.ready : doc.readiness_ready,
    health_score: doc.health_score ?? doc.attestation?.health_score ?? null,
    freshness: doc.freshness ?? doc.attestation?.freshness,
  };
}

function launchpadFromComposite(row) {
  if (!row.token) return null;
  const m = row.market || {};
  const has = ["fdv_usd", "volume_24h_usd", "liquidity_usd", "change_24h_percent", "price_usd"]
    .some((k) => m[k] != null);
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

function identities(rows) {
  const companyIds = rows.filter((r) => r.company).map((r) => r.company.company_id);
  const mints = rows.filter((r) => r.token).map((r) => r.token.mint);
  return { companyIds, mints };
}

function assertUnique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}

test("join emits company+token, company-only, and token-only from directory goldens", () => {
  const directory = loadJson(join(GOLDEN, "directory.json"));
  const withToken = loadJson(join(GOLDEN, "composite-company-token.json"));
  const companyOnly = loadJson(join(GOLDEN, "composite-company-only.json"));
  const tokenOnly = loadJson(join(GOLDEN, "composite-token-only.json"));
  const rows = joinDirectory(directory.companies, [
    launchpadFromComposite(withToken),
    launchpadFromComposite(tokenOnly),
  ]);
  assert.deepEqual(kindCounts(rows), {
    company_with_token: 1,
    company_without_token: 1,
    token_without_company: 1,
  });
  assert.deepEqual(rows[0], withToken);
  assert.deepEqual(rows[1], companyOnly);
  assert.deepEqual(rows[2], tokenOnly);
  for (const row of rows) {
    assertValid(SCHEMA, row, row.kind);
  }
  const { companyIds, mints } = identities(rows);
  assertUnique(companyIds, "company_id");
  assertUnique(mints, "mint");
});

test("isPublicCompany requires visibility public and ready", () => {
  const northstar = loadJson(join(GOLDEN, "directory.json")).companies.find((c) => c.slug === "northstar-labs");
  assert.equal(isPublicCompany(northstar), true);
  assert.equal(isPublicCompany({ ...northstar, visibility: undefined }), false);
  assert.equal(isPublicCompany({ ...northstar, visibility: "private" }), false);
  assert.equal(isPublicCompany({ ...northstar, readiness_ready: false }), false);
  assert.equal(isPublicCompany({ ...northstar, readiness_ready: undefined, readiness: undefined }), false);
});

test("company-only golden joins with null market, never zero", () => {
  const directory = loadJson(join(GOLDEN, "directory.json"));
  const companyOnly = loadJson(join(GOLDEN, "composite-company-only.json"));
  const northstar = directory.companies.find((c) => c.slug === "northstar-labs");
  const rows = joinDirectory([northstar], []);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], companyOnly);
  for (const key of ["price_usd", "fdv_usd", "volume_24h_usd", "liquidity_usd", "change_24h_percent"]) {
    assert.equal(rows[0].market[key], null);
  }
});

test("token-only golden joins with no company", () => {
  const tokenOnly = loadJson(join(GOLDEN, "composite-token-only.json"));
  const rows = joinDirectory([], [launchpadFromComposite(tokenOnly)]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], tokenOnly);
  assert.equal(rows[0].company, null);
});

test("token-later keeps company_id, slug, and canonical_url while kind changes", () => {
  const beforeDoc = loadJson(join(GOLDEN, "company-public-tokenless.json"));
  const afterDoc = loadJson(join(GOLDEN, "company-public-token-later.json"));
  const beforeGolden = loadJson(join(GOLDEN, "composite-token-later-before.json"));
  const afterGolden = loadJson(join(GOLDEN, "composite-token-later-after.json"));
  const before = joinDirectory([asDirectoryRow(beforeDoc)], []);
  const after = joinDirectory(
    [asDirectoryRow(afterDoc)],
    [launchpadFromComposite(afterGolden)],
  );
  assert.equal(before[0].kind, "company_without_token");
  assert.equal(after[0].kind, "company_with_token");
  assert.equal(before[0].company.company_id, after[0].company.company_id);
  assert.equal(before[0].company.slug, after[0].company.slug);
  assert.equal(before[0].company.canonical_url, after[0].company.canonical_url);
  assert.deepEqual(before[0], beforeGolden);
  assert.deepEqual(after[0], afterGolden);
  assert.equal(before.length, 1);
  assert.equal(after.length, 1);
});

test("each identity appears exactly once when mint is shared or duplicated", () => {
  const directory = loadJson(join(GOLDEN, "directory.json"));
  const withToken = loadJson(join(GOLDEN, "composite-company-token.json"));
  const token = launchpadFromComposite(withToken);
  const rows = joinDirectory(
    [...directory.companies, directory.companies[0]],
    [token, { ...token, id: "dup-project" }],
  );
  const { companyIds, mints } = identities(rows);
  assertUnique(companyIds, "company_id");
  assertUnique(mints, "mint");
  assert.equal(kindCounts(rows).company_with_token, 1);
  assert.equal(kindCounts(rows).token_without_company, 0);
});

test("private and unready companies never list", () => {
  const priv = loadJson(join(GOLDEN, "adversarial/directory-with-private.json"));
  const unready = loadJson(join(GOLDEN, "adversarial/directory-with-unready.json"));
  const tokenOnly = loadJson(join(GOLDEN, "composite-token-only.json"));
  const rows = joinDirectory(
    [...priv.companies, ...unready.companies],
    [launchpadFromComposite(tokenOnly)],
  );
  assert.deepEqual(kindCounts(rows), {
    company_with_token: 0,
    company_without_token: 0,
    token_without_company: 1,
  });
});

test("tokenless market helper is all null, and launchpad zeros stay on token rows only", () => {
  assert.deepEqual(nullMarket(), {
    price_usd: null,
    fdv_usd: null,
    volume_24h_usd: null,
    liquidity_usd: null,
    change_24h_percent: null,
  });
  const zeroTok = marketFromLaunchpad({
    marketPerformance: {
      currentMarketCapUsd: 0,
      volume24hUsd: 0,
      liquidityUsd: 0,
      priceChange24hPercent: 0,
    },
  });
  assert.equal(zeroTok.fdv_usd, 0);
  const company = loadJson(join(GOLDEN, "directory.json")).companies[1];
  const rows = joinDirectory([company], [{
    id: "zero-token",
    mint: "2CasaZeroMint11111111111111capx",
    name: "Zero",
    symbol: "ZERO",
    logoUrl: null,
    state: "COMPLETED",
    marketPerformance: { currentMarketCapUsd: 0, volume24hUsd: 0, liquidityUsd: 0, priceChange24hPercent: 0 },
  }]);
  const tokenless = rows.find((r) => r.kind === "company_without_token");
  const tokenRow = rows.find((r) => r.kind === "token_without_company");
  for (const key of Object.keys(tokenless.market)) {
    assert.equal(tokenless.market[key], null);
  }
  assert.equal(tokenRow.market.fdv_usd, 0);
});

test("directory path does not use CASA_TTL_MS or per-mint GET /v1/tokens/{mint}", () => {
  const src = readFileSync(join(webRoot, "server.mjs"), "utf8");
  const marketFn = extractFunction(src, "async function marketPayload");
  const companiesFn = extractFunction(src, "async function loadCompanies");
  const tokenFn = extractFunction(src, "async function tokenPayload");
  assert.doesNotMatch(marketFn, /loadCasa/);
  assert.doesNotMatch(marketFn, /CASA_TTL_MS/);
  assert.doesNotMatch(marketFn, /casaCache/);
  assert.doesNotMatch(marketFn, /\/v1\/tokens\//);
  assert.match(marketFn, /Promise\.all/);
  assert.match(marketFn, /loadCompanies/);
  assert.match(marketFn, /loadDirectory/);
  assert.match(marketFn, /joinDirectory/);
  assert.doesNotMatch(companiesFn, /CASA_TTL_MS/);
  assert.doesNotMatch(companiesFn, /casaCache/);
  assert.doesNotMatch(companiesFn, /\/v1\/tokens\//);
  assert.match(companiesFn, /\/v1\/companies/);
  assert.match(companiesFn, /LIST_TTL_MS/);
  assert.match(tokenFn, /loadCasa/);
  assert.match(src, /CASA_TTL_MS = 300_000/);
});

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  return { server, url: `http://127.0.0.1:${addr.port}` };
}

async function startTerminal(env) {
  const child = spawn(process.execPath, ["web/server.mjs"], {
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      CODEX_API_KEY: "",
      SAMPLE: "0",
      HOST: "127.0.0.1",
      PORT: "0",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let started = false;
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("terminal start timeout")), 8000);
    let buf = "";
    const onData = (chunk) => {
      buf += chunk;
      const m = buf.match(/capx terminal (http:\/\/127\.0\.0\.1:\d+)/);
      if (m) {
        started = true;
        clearTimeout(timer);
        resolve(m[1]);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once("exit", (code) => {
      if (!started) {
        clearTimeout(timer);
        reject(new Error(`terminal exited ${code}: ${buf}`));
      }
    });
  });
  return { child, url };
}

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  return { status: res.status, data };
}

test("GET /api/market joins in parallel and does not per-mint Casa GET", async (t) => {
  const directory = loadJson(join(GOLDEN, "directory.json"));
  const withToken = loadJson(join(GOLDEN, "composite-company-token.json"));
  const tokenOnly = loadJson(join(GOLDEN, "composite-token-only.json"));
  const inbox = launchpadFromComposite(withToken);
  const soloMint = "BareTokMint1111111111111111111capx";
  const hits = { companies: 0, projects: 0, tokens: 0, capx: 0, companyAt: [], projectAt: [] };
  let companiesPages = 0;

  const casa = await listen((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/v1/companies") {
      hits.companies += 1;
      hits.companyAt.push(Date.now());
      companiesPages += 1;
      const cursor = url.searchParams.get("cursor");
      setTimeout(() => {
        if (!cursor) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({
            companies: [directory.companies[0]],
            next_cursor: "page-2",
            generated_at: "2026-08-21T12:00:00Z",
          }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          companies: [directory.companies[1]],
          next_cursor: null,
          generated_at: "2026-08-21T12:00:00Z",
        }));
      }, 40);
      return;
    }
    if (url.pathname.startsWith("/v1/tokens/")) {
      hits.tokens += 1;
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "TOKEN_NOT_BOUND", message: "Casa has never bound this mint" }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "NOT_FOUND", message: "No such route" }));
  });

  const launchpad = await listen((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/v1/projects") {
      hits.projects += 1;
      hits.projectAt.push(Date.now());
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          items: [
            {
              id: inbox.id,
              agentMint: inbox.mint,
              name: inbox.name,
              symbol: inbox.symbol,
              logoUrl: "https://example.com/inbox.png",
              description: "inbox",
              state: inbox.state,
              marketPerformance: inbox.marketPerformance,
            },
            {
              id: tokenOnly.token.project_id,
              agentMint: soloMint,
              name: tokenOnly.token.name,
              symbol: tokenOnly.token.symbol,
              logoUrl: "https://example.com/solo.png",
              description: "solo",
              state: tokenOnly.token.state,
              marketPerformance: null,
            },
          ],
          nextCursor: null,
        }));
      }, 40);
      return;
    }
    if (url.pathname === "/v1/market-data/capx") {
      hits.capx += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ capxUsd: 1.25, source: "fixture", asOf: "2026-08-21T12:00:00Z", stale: false }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "NOT_FOUND" }));
  });

  const terminal = await startTerminal({
    CASA_API: casa.url,
    LAUNCHPAD_API: launchpad.url,
  });
  t.after(() => {
    terminal.child.kill("SIGTERM");
    casa.server.close();
    launchpad.server.close();
  });

  const market = await getJson(`${terminal.url}/api/market`);
  assert.equal(market.status, 200);
  assert.equal(hits.tokens, 0, "directory must not GET /v1/tokens/{mint}");
  assert.ok(hits.companies >= 2, "companies cursor drained");
  assert.equal(companiesPages, 2);
  assert.ok(hits.projects >= 1);
  assert.ok(Math.abs(hits.companyAt[0] - hits.projectAt[0]) < 120, "companies and projects fetched in parallel");
  assert.equal(market.data.casaError, null);
  assert.equal(market.data.directoryError, null);
  assert.ok(Array.isArray(market.data.rows));
  assert.ok(Array.isArray(market.data.tokens));
  assert.deepEqual(kindCounts(market.data.rows), {
    company_with_token: 1,
    company_without_token: 1,
    token_without_company: 1,
  });
  const tokenless = market.data.rows.find((r) => r.kind === "company_without_token");
  for (const key of ["price_usd", "fdv_usd", "volume_24h_usd", "liquidity_usd", "change_24h_percent"]) {
    assert.equal(tokenless.market[key], null);
  }
  assert.ok(market.data.tokens.every((tok) => tok.mint));
  assert.equal(market.data.tokens.some((tok) => tok.casa), false);

  const tokenGetsBefore = hits.tokens;
  const detail = await getJson(`${terminal.url}/api/tokens/${encodeURIComponent(inbox.mint)}`);
  assert.equal(detail.status, 200);
  assert.ok(hits.tokens > tokenGetsBefore, "token detail may fetch Casa mint document");
  assert.equal(detail.data.token.casa.status, 404);
});

test("Casa companies 404 still lists Launchpad tokens as token_without_company", async (t) => {
  const hits = { tokens: 0 };
  const casa = await listen((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/v1/tokens/")) hits.tokens += 1;
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "NOT_FOUND", message: "No such route" }));
  });
  const launchpad = await listen((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/v1/projects") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        items: [{
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          agentMint: "BareTokMint1111111111111111111capx",
          name: "Solo Live",
          symbol: "SOLO",
          logoUrl: "https://example.com/solo.png",
          description: "unbound",
          state: "FUNDRAISING",
          marketPerformance: null,
        }],
        nextCursor: null,
      }));
      return;
    }
    if (url.pathname === "/v1/market-data/capx") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ capxUsd: 1.1, source: "fixture", asOf: "2026-08-21T12:00:00Z", stale: false }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "NOT_FOUND" }));
  });
  const terminal = await startTerminal({
    CASA_API: casa.url,
    LAUNCHPAD_API: launchpad.url,
  });
  t.after(() => {
    terminal.child.kill("SIGTERM");
    casa.server.close();
    launchpad.server.close();
  });

  const market = await getJson(`${terminal.url}/api/market`);
  assert.equal(market.status, 200);
  assert.equal(hits.tokens, 0);
  assert.ok(market.data.casaError);
  assert.equal(market.data.directoryError, null);
  assert.equal(market.data.rows.length, 1);
  assert.equal(market.data.rows[0].kind, "token_without_company");
  assert.equal(market.data.tokens.length, 1);
  assert.equal(market.data.tokens[0].symbol, "SOLO");
  for (const key of ["price_usd", "fdv_usd", "volume_24h_usd", "liquidity_usd", "change_24h_percent"]) {
    assert.equal(market.data.rows[0].market[key], null);
  }
});
