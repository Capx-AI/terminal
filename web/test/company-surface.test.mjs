import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertValid, loadJson } from "../../../../ORCHESTRATOR/casa-terminal-plan-01/contracts/validate.mjs";
import { marketSurface, publicCompanyView } from "../company.mjs";
import { MARKET_KEYS } from "../join.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..");
const CONTRACTS = join(repoRoot, "../../ORCHESTRATOR/casa-terminal-plan-01/contracts");
const GOLDEN = join(CONTRACTS, "golden");
const SCHEMA = join(CONTRACTS, "terminal-composite-row.schema.json");

const companyOnly = loadJson(join(GOLDEN, "composite-company-only.json"));
const tokenlessDoc = loadJson(join(GOLDEN, "company-public-tokenless.json"));

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

function loadMarketApi(surfaces) {
  const src = readFileSync(join(webRoot, "market.js"), "utf8");
  const signatures = [
    "function tokenByMint(mint)",
    "function companySurface(slug)",
    "function honestMarket(row)",
    "function fromComposite(row)",
    "function casaDoc(row)",
    "function progressOf(row)",
    "function tasks7dOf(row)",
    "function coverageOf(row)",
    "function seqOf(row)",
    "function calDays(row)",
    "function calCell(row)",
  ];
  const body = signatures.map((sig) => extractFunction(src, sig)).join("\n");
  const sandbox = {
    DATA: { tokens: [], company_surfaces: surfaces || {} },
    MARKET_KEYS: MARKET_KEYS.slice(),
    F: {
      esc(s) { return String(s); },
      tokenPriceUsd() { return null; },
    },
    CAL_W: 129,
    CAL_H: 34,
  };
  sandbox.dash = function dash() { return "--"; };
  return vm.runInNewContext(
    `"use strict";\n${body}\n({ tokenByMint, companySurface, honestMarket, fromComposite, casaDoc, progressOf, tasks7dOf, coverageOf, seqOf, calDays, calCell });`,
    sandbox,
  );
}

test("marketSurface keeps work fields and drops ledger bytes", () => {
  const view = publicCompanyView({
    ...tokenlessDoc,
    readiness: { ready: true },
    visibility: "public",
    progress: {
      level: 2,
      level_name: "Product and Infra Foundation",
      playbooks_done: 25,
      playbooks_total: 122,
      work: { tasks_7d: 4, artifacts_total: 3, rubric_pins: 4, in_flight: 0 },
    },
    attestation: { attested: true, health_score: 99, freshness: "aging", sequence: 0, hours_since: 34 },
    reproduced: { coverage_bp: 10000, signature_valid: true, chain_intact: true },
    ledger: { shown: [{ title: "Phase 0 Website", note: "secret" }] },
    envelope: { caf_version: "1.1.0" },
  });
  const surface = marketSurface(view);
  assert.equal(surface.progress.work.tasks_7d, 4);
  assert.equal(surface.progress.playbooks_done, 25);
  assert.equal(surface.reproduced.coverage_bp, 10000);
  assert.equal(surface.attestation.sequence, 0);
  assert.equal(surface.ledger, undefined);
  assert.equal(surface.envelope, undefined);
  assert.equal(marketSurface(null), null);
});

test("fromComposite fills Casa columns from company_surfaces without inventing price", () => {
  const ui = loadMarketApi({
    "northstar-labs": {
      document: {
        attestation: { attested: true, health_score: 64, freshness: "aging", sequence: 1, hours_since: 20 },
        reproduced: { coverage_bp: 8471, signature_valid: true, chain_intact: true },
        progress: {
          level: 0,
          level_name: "Ideation and Validation",
          playbooks_done: 4,
          playbooks_total: 42,
          work: { tasks_7d: 4 },
        },
      },
      heatmap: {
        spec: { kind: "1d", layout: "weeks", cols: 7 },
        buckets: [{ t: 1, events: 4, attestation: true, decision: false }],
      },
    },
  });
  const flat = ui.fromComposite(companyOnly);
  assert.equal(flat.kind, "company_without_token");
  assert.equal(flat.mint, null);
  assert.equal(flat.marketPerformance, null);
  assert.equal(ui.honestMarket(companyOnly).price_usd, null);
  assert.equal(ui.tasks7dOf(flat), 4);
  assert.equal(ui.coverageOf(flat), 8471);
  assert.equal(ui.seqOf(flat), 1);
  assert.equal(ui.progressOf(flat).playbooks_done, 4);
  assert.equal(ui.calDays(flat).length, 1);
  assert.match(ui.calCell(flat), /data-slug='northstar-labs'/);
  assert.doesNotMatch(ui.calCell(flat), /data-mint=/);
});

test("fromComposite without sidecar dashes work columns and still nulls price", () => {
  const ui = loadMarketApi({});
  const flat = ui.fromComposite(companyOnly);
  assert.equal(ui.tasks7dOf(flat), null);
  assert.equal(ui.coverageOf(flat), null);
  assert.equal(ui.seqOf(flat), null);
  assert.equal(ui.calCell(flat), "--");
  assert.equal(flat.marketPerformance, null);
});

test("join rows stay schema-valid when sidecar lives beside them", () => {
  assertValid(SCHEMA, companyOnly);
  const src = readFileSync(join(webRoot, "server.mjs"), "utf8");
  const marketFn = extractFunction(src, "async function marketPayload");
  assert.match(marketFn, /loadCompanySurfaces/);
  assert.match(marketFn, /company_surfaces/);
  assert.doesNotMatch(marketFn, /loadCasa/);
  assert.doesNotMatch(marketFn, /CASA_TTL_MS/);
  assert.doesNotMatch(marketFn, /\/v1\/tokens\//);
  assert.doesNotMatch(marketFn, /rows\.map\(.*surface/);
});

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
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
      PROBE_ARTIFACTS: "0",
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

test("GET /api/market sidecar uses slug GET not mint GET", async (t) => {
  const directory = loadJson(join(GOLDEN, "directory.json"));
  const hits = { tokens: 0, slugs: [] };
  const fat = {
    ...tokenlessDoc,
    visibility: "public",
    readiness: { ready: true },
    progress: {
      level: 0,
      playbooks_done: 4,
      playbooks_total: 42,
      work: { tasks_7d: 4 },
    },
    attestation: { attested: true, health_score: 64, freshness: "aging", sequence: 1 },
    reproduced: { coverage_bp: 5000, signature_valid: true, chain_intact: true },
    calendar: { days: [{ date: "2026-08-22", events: 4, attestation: true, decision: false }] },
  };

  const casa = await listen((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/v1/companies") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ companies: directory.companies, next_cursor: null }));
      return;
    }
    if (url.pathname.startsWith("/v1/companies/")) {
      hits.slugs.push(url.pathname.slice("/v1/companies/".length));
      const slug = hits.slugs[hits.slugs.length - 1];
      if (slug === fat.slug) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(fat));
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "NOT_FOUND" }));
      return;
    }
    if (url.pathname.startsWith("/v1/tokens/")) {
      hits.tokens += 1;
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "TOKEN_NOT_BOUND" }));
      return;
    }
    res.writeHead(404).end("{}");
  });

  const launchpad = await listen((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/v1/projects") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ items: [], nextCursor: null }));
      return;
    }
    if (url.pathname === "/v1/market-data/capx") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ capxUsd: 1, source: "fixture", asOf: "2026-08-24T00:00:00Z", stale: false }));
      return;
    }
    res.writeHead(404).end("{}");
  });

  const terminal = await startTerminal({ CASA_API: casa.url, LAUNCHPAD_API: launchpad.url });
  t.after(() => {
    terminal.child.kill("SIGTERM");
    casa.server.close();
    launchpad.server.close();
  });

  const res = await fetch(`${terminal.url}/api/market`, { cache: "no-store" });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(hits.tokens, 0);
  assert.ok(hits.slugs.includes("northstar-labs"));
  const row = body.rows.find((r) => r.kind === "company_without_token" && r.company.slug === "northstar-labs");
  assertValid(SCHEMA, row);
  for (const key of MARKET_KEYS) assert.equal(row.market[key], null);
  assert.equal(row.casa, undefined);
  assert.equal(body.company_surfaces["northstar-labs"].document.progress.work.tasks_7d, 4);
  assert.equal(body.company_surfaces["northstar-labs"].document.reproduced.coverage_bp, 5000);
  assert.ok(Array.isArray(body.company_surfaces["northstar-labs"].heatmap.buckets));
});
