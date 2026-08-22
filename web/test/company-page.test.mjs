import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadJson } from "../../../../ORCHESTRATOR/casa-terminal-plan-01/contracts/validate.mjs";
import {
  COMPANY_MESSAGES,
  IFRAME_SANDBOX,
  companyErrorResponse,
  companyHref,
  isCasaPublicUrl,
  isValidSlug,
  joinCompanyToken,
  publicCompanyView,
  sanitizeArtifact,
  sanitizeArtifacts,
} from "../company.mjs";
import { MARKET_KEYS, nullMarket } from "../join.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..");
const GOLDEN = join(repoRoot, "../../ORCHESTRATOR/casa-terminal-plan-01/contracts/golden");

const tokenless = loadJson(join(GOLDEN, "company-public-tokenless.json"));
const tokenLater = loadJson(join(GOLDEN, "company-public-token-later.json"));
const withToken = loadJson(join(GOLDEN, "company-public.json"));
const leaked = loadJson(join(GOLDEN, "adversarial/hidden-artifact-leaked-url.json"));
const privateCo = loadJson(join(GOLDEN, "adversarial/private-company.json"));
const unready = loadJson(join(GOLDEN, "adversarial/unready-public.json"));
const laterRow = loadJson(join(GOLDEN, "composite-token-later-after.json"));
const inboxRow = loadJson(join(GOLDEN, "composite-company-token.json"));

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

function launchpadItem(row) {
  if (!row || !row.token) return null;
  const m = row.market || {};
  return {
    id: row.token.project_id,
    mint: row.token.mint,
    agentMint: row.token.mint,
    name: row.token.name,
    symbol: row.token.symbol,
    logoUrl: row.token.logo_url,
    description: row.company ? row.company.description : "",
    state: row.token.state,
    marketPerformance: {
      currentMarketCapUsd: m.fdv_usd,
      volume24hUsd: m.volume_24h_usd,
      liquidityUsd: m.liquidity_usd,
      priceChange24hPercent: m.change_24h_percent,
    },
  };
}

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

function json(res, status, body, extra = {}) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": extra.cacheControl || "no-store",
  });
  res.end(JSON.stringify(body));
}

function mockCasa(state) {
  return (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/v1/companies") {
      const companies = Object.values(state.docs)
        .filter((d) => d && d.visibility === "public" && d.readiness && d.readiness.ready)
        .map((d) => ({
          company_id: d.company_id,
          slug: d.slug,
          name: d.name,
          description: d.description,
          logo: d.logo,
          category: d.category,
          visibility: "public",
          published_at: d.published_at,
          agent_mint: d.agent_mint,
          canonical_url: d.canonical_url,
          readiness_ready: true,
          health_score: d.attestation ? d.attestation.health_score : null,
          freshness: d.attestation ? d.attestation.freshness : "unobserved",
        }));
      json(res, 200, { companies, next_cursor: null, generated_at: "2026-08-21T12:00:00Z" }, { cacheControl: "public, max-age=60" });
      return;
    }
    const detail = url.pathname.match(/^\/v1\/companies\/([^/]+)$/);
    if (req.method === "GET" && detail) {
      const slug = decodeURIComponent(detail[1]);
      state.slugGets.push(slug);
      if (state.errors[slug]) {
        const err = state.errors[slug];
        json(res, err.status, { error: err.error, message: err.message });
        return;
      }
      const doc = state.docs[slug];
      if (!doc) {
        json(res, 404, { error: "NOT_FOUND", message: "No such company" });
        return;
      }
      if (doc.visibility === "private") {
        json(res, 404, { error: "PRIVATE", message: "Company is not public" });
        return;
      }
      if (doc.readiness && doc.readiness.ready === false) {
        json(res, 404, { error: "NOT_READY", message: "Company is not ready" });
        return;
      }
      json(res, 200, doc, { cacheControl: "public, max-age=60" });
      return;
    }
    json(res, 404, { error: "NOT_FOUND", message: "No such route" });
  };
}

function mockLaunchpad(state) {
  return (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/v1/projects") {
      json(res, 200, { items: state.items.slice(), nextCursor: null }, { cacheControl: "public, max-age=60" });
      return;
    }
    if (url.pathname === "/v1/market-data/capx") {
      json(res, 200, { capxUsd: 1.25, source: "fixture", asOf: "2026-08-21T12:00:00Z", stale: false });
      return;
    }
    json(res, 404, { error: "NOT_FOUND" });
  };
}

async function withTerminal(t, opts = {}) {
  const casaState = {
    docs: opts.docs || {},
    errors: opts.errors || {},
    slugGets: [],
  };
  const lpState = { items: opts.items || [] };
  const casa = await listen(mockCasa(casaState));
  const launchpad = await listen(mockLaunchpad(lpState));
  const terminal = await startTerminal({
    CASA_API: casa.url,
    LAUNCHPAD_API: launchpad.url,
  });
  t.after(() => {
    terminal.child.kill("SIGTERM");
    casa.server.close();
    launchpad.server.close();
  });
  return { casa, launchpad, terminal, casaState, lpState };
}

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, headers: res.headers, data };
}

async function getText(url) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

function assertNoLeak(body) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  assert.equal("canonical_url" in (body && typeof body === "object" ? body : {}), false);
  assert.equal("artifacts" in (body && typeof body === "object" ? body : {}), false);
  assert.doesNotMatch(raw, /file-store|s3:\/\/|\.jsonl|upload.token|filestore/i);
}

test("Casa public URLs reject quote and whitespace XSS payloads", () => {
  const slug = "northstar-labs";
  const host = "https://northstar-labs.casa.capx.ai";
  assert.equal(isCasaPublicUrl(host + "/", slug), true);
  assert.equal(isCasaPublicUrl(host + "/' onerror='alert(1)", slug), false);
  assert.equal(isCasaPublicUrl(host + "/logo.png onerror=alert(1)", slug), false);
  assert.equal(isCasaPublicUrl(host + "/x\" onload=\"alert(1)", slug), false);
});

test("slug helper and iframe sandbox constant", () => {
  assert.equal(isValidSlug("northstar-labs"), true);
  assert.equal(isValidSlug("InboxPilot"), false);
  assert.equal(isValidSlug("a/b"), false);
  assert.equal(companyHref("northstar-labs"), "/c/northstar-labs");
  assert.equal(IFRAME_SANDBOX, "allow-scripts");
  assert.doesNotMatch(IFRAME_SANDBOX, /same-origin|top-navigation|popups/);
});

test("publicCompanyView strips hidden artifact URLs", () => {
  const view = publicCompanyView(leaked);
  assert.equal(view.artifacts.deck, null);
  assert.ok(view.artifacts.site);
  assert.equal(view.artifacts.site.url, "https://inboxpilot.casa.capx.ai/");
  assert.equal(JSON.stringify(view).includes("https://inboxpilot.casa.capx.ai/deck/"), false);
  assert.equal(sanitizeArtifact(leaked.artifacts.deck, leaked.slug, "private"), null);
  const arts = sanitizeArtifacts(leaked.artifacts, leaked.artifact_visibility, leaked.slug);
  assert.equal(arts.deck, null);
});

test("tokenless join keeps market nulls and the company URL", () => {
  const view = publicCompanyView(tokenless);
  const joined = joinCompanyToken(view, []);
  assert.equal(joined.kind, "company_without_token");
  assert.equal(joined.token, null);
  assert.deepEqual(joined.market, nullMarket());
  for (const key of MARKET_KEYS) assert.equal(joined.market[key], null);
  assert.equal(companyHref(view.slug), "/c/northstar-labs");
});

test("GET /c/{slug} is Terminal chrome with one large sandboxed artifact stage", async (t) => {
  const { terminal } = await withTerminal(t, { docs: { "northstar-labs": tokenless } });
  const page = await getText(`${terminal.url}/c/northstar-labs`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") || "", /text\/html/);
  assert.match(page.text, /Back to market/);
  assert.match(page.text, /company\.js/);
  assert.match(page.text, /Website/);
  assert.match(page.text, /One-pager/);
  assert.match(page.text, /Pitch deck/);
  assert.match(page.text, /id="artifact-tabs"/);
  assert.match(page.text, /role="tablist"/);
  assert.match(page.text, /data-artifact="site"/);
  assert.match(page.text, /data-artifact="one_pager"/);
  assert.match(page.text, /data-artifact="deck"/);
  assert.match(page.text, /id="artifact-frame"/);
  assert.match(page.text, /id="artifact-stage" role="tabpanel"/);
  assert.ok(page.text.indexOf('id="tile-showcase"') < page.text.indexOf('id="tile-price"'), "artifact stage must be near the top, before market tiles");
  assert.match(page.text, /sandbox="allow-scripts"/);
  assert.match(page.text, /loading="lazy"/);
  assert.doesNotMatch(page.text, /allow-same-origin/);
  assert.doesNotMatch(page.text, /allow-top-navigation/);
  assert.doesNotMatch(page.text, /allow-popups/);
  assert.doesNotMatch(page.text, /src="https:\/\/northstar-labs\.casa\.capx\.ai/);
  assert.match(page.text, /Open in new tab/);
  assert.match(page.text, /target="_blank"/);
  assert.match(page.text, /rel="noopener noreferrer"/);
  assert.doesNotMatch(page.text, /yield|profit|equity/i);
  assert.equal((page.text.match(/sandbox="allow-scripts"/g) || []).length, 1);
});

test("artifact tabs switch one shared preview and skip unavailable artifacts", () => {
  const src = readFileSync(join(webRoot, "company.js"), "utf8");
  const tabs = Object.fromEntries(["site", "one_pager", "deck"].map((kind) => [
    `artifact-tab-${kind}`,
    {
      attrs: {}, tabIndex: -1, focused: false,
      setAttribute(name, value) { this.attrs[name] = value; },
      focus() { this.focused = true; },
    },
  ]));
  const calls = [];
  const api = vm.runInNewContext(
    `"use strict";
var ARTIFACTS = ["site", "one_pager", "deck"];
var artifactPreviewState = { artifacts: { site: { url: "site" }, one_pager: null, deck: { url: "deck" } }, slug: "frame-markets", canonical: "canonical", active: "site" };
var $ = function (id) { return tabs[id] || null; };
var paintPreview = function (kind, artifact, slug, canonical) { calls.push({ kind, artifact, slug, canonical }); };
${extractFunction(src, "function enabledArtifactKinds()")}
${extractFunction(src, "function selectArtifact(kind, focusTab)")}
${extractFunction(src, "function moveArtifactTab(kind, step)")}
({ enabledArtifactKinds, selectArtifact, moveArtifactTab });`,
    { tabs, calls },
  );
  assert.deepEqual([...api.enabledArtifactKinds()], ["site", "deck"]);
  assert.equal(api.moveArtifactTab("site", 1), "deck");
  assert.equal(api.moveArtifactTab("deck", 1), "site");
  assert.equal(api.selectArtifact("one_pager", false), false);
  assert.equal(api.selectArtifact("deck", true), true);
  assert.equal(tabs["artifact-tab-deck"].attrs["aria-selected"], "true");
  assert.equal(tabs["artifact-tab-site"].attrs["aria-selected"], "false");
  assert.equal(tabs["artifact-tab-deck"].tabIndex, 0);
  assert.equal(tabs["artifact-tab-deck"].focused, true);
  assert.equal(calls.at(-1).kind, "deck");
});

test("tokenless layout: progress, health, dashes, no fake price", async (t) => {
  const { terminal } = await withTerminal(t, { docs: { "northstar-labs": tokenless } });
  const html = await getText(`${terminal.url}/c/northstar-labs`);
  assert.equal(html.status, 200);
  assert.match(html.text, /id="m-price">--/);
  assert.match(html.text, /id="c-health">--/);
  assert.match(html.text, /No token yet/);
  const api = await getJson(`${terminal.url}/api/companies/northstar-labs`);
  assert.equal(api.status, 200);
  assert.equal(api.headers.get("cache-control"), "public, max-age=60");
  assert.equal(api.data.kind, "company_without_token");
  assert.equal(api.data.company.slug, "northstar-labs");
  assert.equal(api.data.company.company_id, tokenless.company_id);
  assert.equal(api.data.company.canonical_url, "https://northstar-labs.casa.capx.ai");
  assert.equal(api.data.company.category, "productivity");
  assert.equal(api.data.company.description, tokenless.description);
  assert.equal(api.data.company.progress.level, 0);
  assert.equal(api.data.company.attestation.health_score, 64);
  assert.equal(api.data.token, null);
  assert.equal(api.data.token_href, null);
  assert.equal(api.data.priceSeries, null);
  for (const key of MARKET_KEYS) {
    assert.equal(api.data.market[key], null, `${key} must be null on tokenless`);
    assert.notEqual(api.data.market[key], 0);
  }
  assert.equal(api.data.company.artifacts.site.url, "https://northstar-labs.casa.capx.ai/");
  assert.equal(isCasaPublicUrl(api.data.company.artifacts.one_pager.url, "northstar-labs"), true);
});

test("token-later keeps /c/{slug} and fills market only after attach", async (t) => {
  const north = launchpadItem(laterRow);
  const { terminal, casaState } = await withTerminal(t, {
    docs: { "northstar-labs": structuredClone(tokenless) },
    items: [north],
  });
  const page = await getText(`${terminal.url}/c/northstar-labs`);
  assert.equal(page.status, 200);

  const before = await getJson(`${terminal.url}/api/companies/northstar-labs`);
  assert.equal(before.status, 200);
  assert.equal(before.data.kind, "company_without_token");
  assert.equal(before.data.company.slug, "northstar-labs");
  assert.equal(before.data.company.company_id, tokenless.company_id);
  assert.equal(before.data.company.canonical_url, tokenless.canonical_url);
  for (const key of MARKET_KEYS) assert.equal(before.data.market[key], null);
  assert.equal(before.data.token_href, null);

  casaState.docs["northstar-labs"] = structuredClone(tokenLater);
  const after = await getJson(`${terminal.url}/api/companies/northstar-labs`);
  assert.equal(after.status, 200);
  assert.equal(after.data.kind, "company_with_token");
  assert.equal(after.data.company.slug, "northstar-labs");
  assert.equal(after.data.company.company_id, tokenless.company_id);
  assert.equal(after.data.company.canonical_url, tokenless.canonical_url);
  assert.equal(after.data.token.mint, tokenLater.agent_mint);
  assert.equal(after.data.token_href, `/t/${tokenLater.agent_mint}`);
  assert.equal(after.data.market.fdv_usd, laterRow.market.fdv_usd);
  assert.equal(after.data.market.price_usd, laterRow.market.price_usd);
  const again = await getText(`${terminal.url}/c/northstar-labs`);
  assert.equal(again.status, 200);
  assert.equal(new URL(`${terminal.url}/c/northstar-labs`).pathname, "/c/northstar-labs");
});

test("iframe sandbox attributes stay allow-scripts only in page and script", () => {
  const html = readFileSync(join(webRoot, "company.html"), "utf8");
  const js = readFileSync(join(webRoot, "company.js"), "utf8");
  const css = readFileSync(join(webRoot, "v1.css"), "utf8");
  for (const src of [html, js]) {
    assert.match(src, /sandbox/);
    assert.match(src, /allow-scripts/);
    assert.doesNotMatch(src, /allow-same-origin/);
    assert.doesNotMatch(src, /allow-top-navigation/);
    assert.doesNotMatch(src, /allow-popups/);
  }
  assert.match(html, /loading="lazy"/);
  assert.match(js, /loading/);
  assert.match(js, /noopener noreferrer/);
  assert.match(css, /\.t-showcase/);
  assert.match(css, /height:clamp\(620px,76vh,980px\)/);
  assert.match(js, /function selectArtifact\(kind, focusTab\)/);
  assert.match(js, /ArrowRight/);
  assert.match(js, /IFRAME_SANDBOX = "allow-scripts"/);
});

test("missing, private, and unready companies 404 without leaking URLs", async (t) => {
  const { terminal } = await withTerminal(t, {
    docs: {
      "private-notebook": privateCo,
      "unready-public": unready,
    },
  });
  const missing = await getJson(`${terminal.url}/api/companies/no-such-company`);
  assert.equal(missing.status, 404);
  assert.equal(missing.data.error, "NOT_FOUND");
  assert.equal(missing.data.message, COMPANY_MESSAGES.NOT_FOUND);
  assert.equal(missing.headers.get("cache-control"), "no-store");
  assertNoLeak(missing.data);

  const priv = await getJson(`${terminal.url}/api/companies/private-notebook`);
  assert.equal(priv.status, 404);
  assert.equal(priv.data.error, "PRIVATE");
  assert.equal(priv.data.message, COMPANY_MESSAGES.PRIVATE);
  assertNoLeak(priv.data);
  assert.doesNotMatch(JSON.stringify(priv.data), /private-notebook\.casa\.capx\.ai/);

  const notReady = await getJson(`${terminal.url}/api/companies/unready-public`);
  assert.equal(notReady.status, 404);
  assert.equal(notReady.data.error, "NOT_READY");
  assert.equal(notReady.data.message, COMPANY_MESSAGES.NOT_READY);
  assertNoLeak(notReady.data);
  assert.doesNotMatch(JSON.stringify(notReady.data), /unready-public\.casa\.capx\.ai/);

  const badSlug = await getJson(`${terminal.url}/api/companies/Not_Valid`);
  assert.equal(badSlug.status, 404);
  assert.equal(badSlug.data.error, "NOT_FOUND");
  assertNoLeak(badSlug.data);

  const fail = companyErrorResponse("PRIVATE");
  assert.equal(fail.status, 404);
  assert.equal(Object.keys(fail.body).sort().join(","), "error,message");
});

test("hidden artifact leaked URL is not forwarded to the browser", async (t) => {
  const { terminal } = await withTerminal(t, { docs: { inboxpilot: leaked } });
  const api = await getJson(`${terminal.url}/api/companies/inboxpilot`);
  assert.equal(api.status, 200);
  assert.equal(api.data.company.artifacts.deck, null);
  assert.equal(api.data.company.artifact_visibility.deck, "private");
  assert.equal(JSON.stringify(api.data).includes("/deck/"), false);
  assert.equal(api.data.company.artifacts.site.url, "https://inboxpilot.casa.capx.ai/");
});

test("joined token company payload and /t/{mint} link to /c/{slug}", async (t) => {
  const inbox = launchpadItem(inboxRow);
  const { terminal } = await withTerminal(t, {
    docs: { inboxpilot: withToken },
    items: [inbox],
  });
  const api = await getJson(`${terminal.url}/api/companies/inboxpilot`);
  assert.equal(api.status, 200);
  assert.equal(api.data.kind, "company_with_token");
  assert.equal(api.data.token.mint, withToken.agent_mint);
  assert.equal(api.data.token_href, `/t/${withToken.agent_mint}`);
  assert.equal(api.data.market.fdv_usd, inboxRow.market.fdv_usd);
  assert.notEqual(api.data.market.price_usd, null);

  const tok = await getJson(`${terminal.url}/api/tokens/${withToken.agent_mint}`);
  assert.equal(tok.status, 200);
  assert.equal(tok.data.company_slug, "inboxpilot");
  assert.equal(tok.data.company_href, "/c/inboxpilot");

  const tokenHtml = await getText(`${terminal.url}/t/${withToken.agent_mint}`);
  assert.equal(tokenHtml.status, 200);
  assert.match(tokenHtml.text, /id="company-link"/);
});

test("company payload does not use the five-minute Casa mint cache", () => {
  const src = readFileSync(join(webRoot, "server.mjs"), "utf8");
  const fn = extractFunction(src, "async function companyPayload");
  const load = extractFunction(src, "async function loadCompanyBySlug");
  assert.match(fn, /loadCompanyBySlug/);
  assert.match(fn, /joinCompanyToken/);
  assert.doesNotMatch(fn, /casaCache/);
  assert.doesNotMatch(fn, /CASA_TTL_MS/);
  assert.doesNotMatch(fn, /\/v1\/tokens\//);
  assert.match(load, /v1\/companies/);
  assert.doesNotMatch(load, /casaCache/);
  assert.match(src, /api\\\/companies/);
  assert.match(src, /company\.html/);
  assert.match(src, /companyPayload/);
  const vercel = JSON.parse(readFileSync(join(webRoot, "vercel.json"), "utf8"));
  assert.match(vercel.functions["server.mjs"].includeFiles, /company\.html/);
  assert.match(vercel.functions["server.mjs"].includeFiles, /company\.js/);
});

test("Casa unavailable is 503 without a company body", async (t) => {
  const launchpad = await listen(mockLaunchpad({ items: [] }));
  const terminal = await startTerminal({
    CASA_API: "http://127.0.0.1:1",
    LAUNCHPAD_API: launchpad.url,
  });
  t.after(() => {
    terminal.child.kill("SIGTERM");
    launchpad.server.close();
  });
  const down = await getJson(`${terminal.url}/api/companies/northstar-labs`);
  assert.equal(down.status, 503);
  assert.equal(down.data.error, "CASA_UNAVAILABLE");
  assert.equal(down.data.message, COMPANY_MESSAGES.CASA_UNAVAILABLE);
  assertNoLeak(down.data);
});
