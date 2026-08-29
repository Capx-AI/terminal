import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { loadJson } from "../../../../ORCHESTRATOR/casa-terminal-plan-01/contracts/validate.mjs";
import { MARKET_KEYS } from "../join.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..");
const GOLDEN = join(repoRoot, "../../ORCHESTRATOR/casa-terminal-plan-01/contracts/golden");

const directory = loadJson(join(GOLDEN, "directory.json"));
const withToken = loadJson(join(GOLDEN, "composite-company-token.json"));
const tokenOnly = loadJson(join(GOLDEN, "composite-token-only.json"));
const tokenless = loadJson(join(GOLDEN, "company-public-tokenless.json"));

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

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
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

function mockCasaOk() {
  return (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/v1/companies") {
      json(res, 200, {
        companies: directory.companies.slice(),
        next_cursor: null,
        generated_at: "2026-08-21T12:00:00Z",
      });
      return;
    }
    const detail = url.pathname.match(/^\/v1\/companies\/([^/]+)$/);
    if (req.method === "GET" && detail) {
      const slug = decodeURIComponent(detail[1]);
      if (slug === "northstar-labs") {
        json(res, 200, tokenless);
        return;
      }
      json(res, 404, { error: "NOT_FOUND", message: "No such company" });
      return;
    }
    json(res, 404, { error: "NOT_FOUND", message: "No such route" });
  };
}

function mockLaunchpadOk() {
  return (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/v1/projects") {
      json(res, 200, {
        items: [
          {
            id: withToken.token.project_id,
            agentMint: withToken.token.mint,
            name: withToken.token.name,
            symbol: withToken.token.symbol,
            logoUrl: withToken.token.logo_url,
            state: withToken.token.state,
            marketPerformance: {
              currentMarketCapUsd: withToken.market.fdv_usd,
              volume24hUsd: withToken.market.volume_24h_usd,
              liquidityUsd: withToken.market.liquidity_usd,
              priceChange24hPercent: withToken.market.change_24h_percent,
            },
          },
          {
            id: tokenOnly.token.project_id,
            agentMint: tokenOnly.token.mint,
            name: tokenOnly.token.name,
            symbol: tokenOnly.token.symbol,
            logoUrl: tokenOnly.token.logo_url,
            state: tokenOnly.token.state,
            marketPerformance: null,
          },
        ],
        nextCursor: null,
      });
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
  const casa = await listen(opts.casa || mockCasaOk());
  const launchpad = await listen(opts.launchpad || mockLaunchpadOk());
  const terminal = await startTerminal({
    CASA_API: casa.url,
    LAUNCHPAD_API: launchpad.url,
  });
  t.after(() => {
    terminal.child.kill("SIGTERM");
    casa.server.close();
    launchpad.server.close();
  });
  return { casa, launchpad, terminal };
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
  return { status: res.status, headers: res.headers, text: await res.text() };
}

function focusableOrder(html) {
  const re = /<(a|button|input|select|textarea)\b([^>]*)>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    if (/\bhidden\b/.test(attrs)) continue;
    if (/tabindex\s*=\s*(['"]?)-1\1/.test(attrs)) continue;
    if (tag === "a" && !/\bhref\s*=/.test(attrs)) continue;
    const id = (attrs.match(/\bid\s*=\s*"([^"]+)"/) || [])[1] || "";
    const href = (attrs.match(/\bhref\s*=\s*"([^"]*)"/) || [])[1] || "";
    const type = (attrs.match(/\btype\s*=\s*"([^"]*)"/) || [])[1] || "";
    const aria = (attrs.match(/\baria-label\s*=\s*"([^"]*)"/) || [])[1] || "";
    out.push({ tag, id, href, type, aria });
  }
  return out;
}

function assertNoPositiveTabIndex(html, label) {
  assert.doesNotMatch(html, /tabindex\s*=\s*(['"]?)[1-9]/, label);
}

test("Casa outage on /api/market is partial and Launchpad still lists", async (t) => {
  const launchpad = await listen(mockLaunchpadOk());
  const casa = await listen((req, res) => {
    json(res, 503, { error: "CASA_UNAVAILABLE", message: "Casa companies down" });
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
  assert.ok(market.data.casaError, "casaError must be explicit");
  assert.equal(market.data.directoryError, null);
  assert.ok(Array.isArray(market.data.tokens));
  assert.ok(market.data.tokens.length >= 1, "Launchpad tokens still list");
  assert.ok(market.data.tokens.some((tok) => tok.symbol === "INBOX" || tok.mint === withToken.token.mint));
  assert.ok(market.data.rows.some((row) => row.kind === "token_without_company"));
  assert.equal(market.data.rows.some((row) => row.company), false);
  for (const row of market.data.rows) {
    if (row.kind === "company_without_token") {
      for (const key of MARKET_KEYS) assert.equal(row.market[key], null);
    }
  }
});

test("Launchpad outage on /api/market still lists Casa companies", async (t) => {
  const casa = await listen(mockCasaOk());
  const launchpad = await listen((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/v1/market-data/capx") {
      json(res, 200, { capxUsd: 1.25, source: "fixture", asOf: "2026-08-21T12:00:00Z", stale: false });
      return;
    }
    json(res, 503, { error: "UNAVAILABLE", message: "Launchpad directory down" });
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
  assert.ok(market.data.directoryError, "directoryError must be explicit");
  assert.equal(market.data.casaError, null);
  const slugs = (market.data.rows || [])
    .map((row) => row.company && row.company.slug)
    .filter(Boolean)
    .sort();
  assert.deepEqual(slugs, ["inboxpilot", "northstar-labs"]);
  assert.equal(market.data.tokens.length, 0);
  for (const row of market.data.rows) {
    assert.equal(row.kind, "company_without_token");
    assert.equal(row.token, null);
    for (const key of MARKET_KEYS) {
      assert.equal(row.market[key], null, `${key} must stay null when Launchpad is down`);
      assert.notEqual(row.market[key], 0);
    }
  }

  const page = await getText(`${terminal.url}/c/northstar-labs`);
  assert.equal(page.status, 200);
  const api = await getJson(`${terminal.url}/api/companies/northstar-labs`);
  assert.equal(api.status, 200);
  assert.equal(api.data.company.slug, "northstar-labs");
  for (const key of MARKET_KEYS) assert.equal(api.data.market[key], null);
});

test("probeArtifact marks HTTP 404 as preview_ok false", async () => {
  const { probeArtifact } = await import("../company.mjs");
  const art = { url: "https://northstar-labs.casa.capx.ai/", visibility: "public" };
  const bad = await probeArtifact(art, async () => ({ status: 404 }));
  assert.equal(bad.preview_ok, false);
  assert.equal(bad.url, art.url);
  const good = await probeArtifact(art, async () => ({ status: 200 }));
  assert.equal(good.preview_ok, true);
});

test("company.js falls back when preview_ok is false and keeps Open full site", () => {
  const src = readFileSync(join(webRoot, "company.js"), "utf8");
  assert.match(src, /preview_ok === false/);
  assert.match(src, /applyPreviewFallback\(kind\)/);
  assert.match(src, /Open the full site/);
  assert.doesNotMatch(src, /allow-same-origin|allow-top-navigation|allow-popups/);
});

test("broken artifact preview falls back and keeps the open-full link", () => {
  const src = readFileSync(join(webRoot, "company.js"), "utf8");
  const html = readFileSync(join(webRoot, "company.html"), "utf8");
  assert.match(src, /function previewFallbackCopy\(kind\)/);
  assert.match(src, /function applyPreviewFallback\(kind\)/);
  assert.match(src, /preview_ok === false/);
  assert.match(src, /Preview failed\. Open the full site\./);
  assert.match(src, /tabIndex = -1/);
  assert.doesNotMatch(src, /allow-same-origin|allow-top-navigation|allow-popups/);
  assert.match(html, /id="artifact-open"/);
  assert.match(html, /id="artifact-open-below"/);
  assert.match(html, /id="stage-gate"/);
  assert.match(html, /id="stage-done"/);
  assert.match(html, /Open in new tab/);
  assert.match(html, /id="artifact-empty"/);
  assert.match(html, /id="artifact-tabs"/);
  assert.match(html, /tabindex="-1"/);

  const els = {
    "artifact-frame": { hidden: false, tabIndex: 0, href: null, getAttribute() { return null; }, removeAttribute(name) { if (name === "src") this.src = undefined; } },
    "artifact-empty": { hidden: true, textContent: "No public website." },
    "artifact-open": { hidden: true, href: "https://northstar-labs.casa.capx.ai", getAttribute(name) { return name === "href" ? this.href : null; }, removeAttribute(name) { if (name === "href") this.href = ""; } },
    "artifact-open-below": { hidden: true, href: "", getAttribute(name) { return name === "href" ? this.href : null; }, removeAttribute(name) { if (name === "href") this.href = ""; } },
    "artifact-stage": { classList: { remove() {}, add() {} } },
    "stage-gate": { hidden: false },
    "stage-done": { hidden: false },
  };
  const api = vm.runInNewContext(
    `"use strict";
var $ = function (id) { return els[id] || null; };
${extractFunction(src, "function paintArtifactOpen(href)")}
${extractFunction(src, "function resetStageGate(previewOn)")}
${extractFunction(src, "function previewFallbackCopy(kind)")}
${extractFunction(src, "function applyPreviewFallback(kind)")}
({ paintArtifactOpen, resetStageGate, previewFallbackCopy, applyPreviewFallback });`,
    { els },
  );
  assert.equal(api.previewFallbackCopy("site"), "Preview failed. Open the full site.");
  assert.equal(api.previewFallbackCopy("one_pager"), "Preview failed. Open the one-pager.");
  assert.equal(api.previewFallbackCopy("deck"), "Preview failed. Open the deck.");
  api.applyPreviewFallback("site");
  assert.equal(els["artifact-frame"].hidden, true);
  assert.equal(els["artifact-frame"].tabIndex, -1);
  assert.equal(els["artifact-empty"].hidden, false);
  assert.equal(els["artifact-empty"].textContent, "Preview failed. Open the full site.");
  assert.equal(els["artifact-open"].hidden, false);
  assert.equal(els["artifact-open"].href, "https://northstar-labs.casa.capx.ai");
  assert.equal(els["artifact-open-below"].hidden, false);
  assert.equal(els["artifact-open-below"].href, "https://northstar-labs.casa.capx.ai");
  assert.equal(els["stage-gate"].hidden, true);
  assert.equal(els["stage-done"].hidden, true);
  assert.equal(JSON.stringify(els).includes("file-store"), false);

  api.paintArtifactOpen("https://northstar-labs.casa.capx.ai/deck");
  assert.equal(els["artifact-open"].href, "https://northstar-labs.casa.capx.ai/deck");
  assert.equal(els["artifact-open-below"].href, "https://northstar-labs.casa.capx.ai/deck");
  assert.equal(els["artifact-open"].hidden, false);
  assert.equal(els["artifact-open-below"].hidden, false);
  api.paintArtifactOpen(null);
  assert.equal(els["artifact-open"].hidden, true);
  assert.equal(els["artifact-open-below"].hidden, true);
});

test("/register and /c/{slug} have labels and keyboard-focusable controls", async (t) => {
  const { terminal } = await withTerminal(t);
  const register = await getText(`${terminal.url}/register`);
  assert.equal(register.status, 200);
  assert.match(register.text, /<label class="label" for="code">Code<\/label>/);
  assert.match(register.text, /id="code"/);
  assert.match(register.text, /aria-label="Company registration code"/);
  assert.match(register.text, /<button type="submit" class="regbtn" id="go">Register<\/button>/);
  assert.match(register.text, /href="#code"/);
  assert.match(register.text, /Back to market/);
  assertNoPositiveTabIndex(register.text, "register");
  const regFocus = focusableOrder(register.text);
  assert.equal(regFocus[0].href, "#code");
  assert.ok(regFocus.some((el) => el.tag === "input" && el.id === "code"));
  assert.ok(regFocus.some((el) => el.tag === "button" && el.id === "go" && el.type === "submit"));
  assert.ok(regFocus.some((el) => el.tag === "a" && el.href === "/"));
  assert.equal((register.text.match(/<input\b/g) || []).length, 1);

  const company = await getText(`${terminal.url}/c/northstar-labs`);
  assert.equal(company.status, 200);
  assert.match(company.text, /Skip to company/);
  assert.match(company.text, /href="#page"/);
  assert.match(company.text, /<a class="back" href="\/">Back to market<\/a>/);
  assert.match(company.text, /title="Website preview"/);
  assert.match(company.text, /role="tablist"/);
  assert.match(company.text, /role="tab"/);
  assert.match(company.text, /role="tabpanel"/);
  assert.match(company.text, /Open in new tab/);
  assert.match(company.text, /target="_blank"/);
  assert.match(company.text, /rel="noopener noreferrer"/);
  assert.match(company.text, /sandbox="allow-scripts"/);
  assert.doesNotMatch(company.text, /allow-same-origin/);
  assert.doesNotMatch(company.text, /allow-top-navigation/);
  assert.doesNotMatch(company.text, /allow-popups/);
  assertNoPositiveTabIndex(company.text, "company");
  const coFocus = focusableOrder(company.text);
  assert.equal(coFocus[0].href, "#page");
  assert.ok(coFocus.some((el) => el.tag === "a" && el.href === "/"));
  assert.equal(coFocus.some((el) => el.tag === "iframe"), false);
  assert.equal((company.text.match(/tabindex="-1"/g) || []).length, 1);

  const market = await getText(`${terminal.url}/`);
  assert.equal(market.status, 200);
  assert.match(market.text, /Skip to market/);
  assert.match(market.text, /href="#market"/);
  assert.match(market.text, /href="\/register"/);
  assert.match(market.text, /aria-label="Search companies and tokens"/);
  assert.match(market.text, /aria-label="Filters"/);
  assert.match(market.text, /tabindex="0"/);
  assertNoPositiveTabIndex(market.text, "market");
  assert.doesNotMatch(market.text, /\u2014/);
  assert.doesNotMatch(register.text, /\u2014/);
  assert.doesNotMatch(company.text, /\u2014/);
});

test("vercel.json includeFiles covers company and register assets", () => {
  const vercel = JSON.parse(readFileSync(join(webRoot, "vercel.json"), "utf8"));
  const include = vercel.functions["server.mjs"].includeFiles;
  assert.match(include, /company\.html/);
  assert.match(include, /company\.js/);
  assert.match(include, /register\.html/);
  assert.match(include, /register\.js/);
  for (const name of ["company.html", "company.js", "register.html", "register.js"]) {
    assert.equal(include.includes(name), true, name);
  }
});

test("mobile and desktop fixtures keep overflow, contrast, and keyboard chrome", () => {
  const app = readFileSync(join(webRoot, "app.css"), "utf8");
  const v1 = readFileSync(join(webRoot, "v1.css"), "utf8");
  const marketJs = readFileSync(join(webRoot, "market.js"), "utf8");
  const companyJs = readFileSync(join(webRoot, "company.js"), "utf8");
  const index = readFileSync(join(webRoot, "index.html"), "utf8");
  const register = readFileSync(join(webRoot, "register.html"), "utf8");
  const company = readFileSync(join(webRoot, "company.html"), "utf8");

  for (const html of [index, register, company]) {
    assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
    assert.match(html, /class="skip"/);
  }
  assert.match(app, /@media \(max-width:880px\)/);
  assert.match(app, /@media \(max-width:700px\)/);
  assert.match(v1, /@media \(max-width:700px\)/);
  // plan 2026-08-29-002 Phase 1: one-column phone bento, chart box height, shrinkable legend
  assert.match(app, /\.bento > \.tile\{grid-column:1 \/ -1;\}/);
  assert.match(app, /\.chartbox\{min-height:0; height:clamp\(240px,45vh,360px\);\}/);
  assert.match(app, /\.planes\.tight\{flex:0 1 auto; min-width:0;\}/);
  assert.match(app, /\.hrow\{height:auto; min-height:50px; flex-wrap:wrap/);
  // plan 2026-08-29-003: phone density block, hidden above 700px
  assert.match(app, /\/\* ===== phone density \(plan 2026-08-29-003\) =====/);
  assert.match(app, /@media \(min-width:701px\)\{ \.t-keys, \.idmore, \.tok \.ml\{display:none !important;\} \}/);
  assert.match(app, /\.keys\{display:grid; grid-template-columns:repeat\(3,1fr\)/);
  assert.match(app, /\.tok \.ml\{display:block;/);
  assert.match(marketJs, /function mobileLine\(row\)/);
  for (const html of [readFileSync(join(webRoot, "token.html"), "utf8"), company]) {
    assert.match(html, /<section class="tile t-keys" id="tile-keys" hidden>/);
    assert.match(html, /id="keys-casa" hidden/);
    assert.match(html, /<button type="button" class="idmore" id="id-more" hidden aria-expanded="false">more<\/button>/);
  }
  assert.match(app, /\/\* ===== phone type floor \(plan 2026-08-29-002, R11\) ===== \*\//);
  assert.match(app, /\.ag\{flex:1 1 calc\(50% - 1px\);\}/);
  assert.match(app, /\.chips\{flex-wrap:nowrap/);
  // plan 2026-08-29-002 W2: real table widths, pinned phone columns, and a live scroll cue
  assert.equal((index.match(/<colgroup>/g) || []).length, 3);
  assert.match(index, /<colgroup>\s*<col class="c-rank">\s*<col class="c-name">\s*<col class="c-px">\s*<col class="c-chg">\s*<col class="c-vol">\s*<col class="c-fdv">\s*<col class="c-spark">\s*<col class="c-ver">\s*<col class="c-work">\s*<col class="c-cal">\s*<col class="c-att">\s*<\/colgroup>/);
  assert.match(index, /<colgroup>\s*<col class="c-rank">\s*<col class="c-name">\s*<col class="c-px">\s*<col class="c-chg">\s*<col class="c-vol">\s*<col class="c-liq">\s*<col class="c-fdv">\s*<col class="c-spark">\s*<col class="c-ver">\s*<\/colgroup>/);
  assert.match(index, /<colgroup>\s*<col class="c-rank">\s*<col class="c-name">\s*<col class="c-ver">\s*<col class="c-work">\s*<col class="c-cal">\s*<col class="c-bm">\s*<col class="c-cov">\s*<col class="c-chain">\s*<col class="c-att">\s*<col class="c-fdv">\s*<\/colgroup>/);
  assert.match(app, /\/\* ===== phone tables \(plan 2026-08-29-002, R5\) ===== \*\//);
  assert.match(app, /\.tbl-scroll\[data-more="1"\]\{-webkit-mask-image:linear-gradient\(to right,#000 calc\(100% - 48px\),transparent\); mask-image:/);
  assert.match(app, /\.tbl-scroll thead th:first-child,\s*\.tbl-scroll thead th:nth-child\(2\)\{position:sticky; background:#0d0e10; z-index:4;\}/);
  assert.match(app, /\.tbl-scroll tbody td:first-child,\s*\.tbl-scroll tbody td:nth-child\(2\)\{position:sticky; background:var\(--phone-row-bg\); z-index:2;\}/);
  assert.match(app, /\.tbl-scroll thead th:first-child,\s*\.tbl-scroll tbody td:first-child\{left:0;\}/);
  assert.match(app, /\.tbl-scroll thead th:nth-child\(2\),\s*\.tbl-scroll tbody td:nth-child\(2\)\{left:44px;\}/);
  assert.match(app, /td\.l\{position:relative;\}/);
  assert.match(app, /\.tok \.nm::after\{content:""; position:absolute; inset:0;\}/);
  assert.match(app, /\.tbl-scroll thead th\[data-k\]\{padding:14px 14px;\}/);
  assert.match(app, /#tokens-note::after,\s*#companies-note::after,\s*#bound-note::after\{content:" \\00b7  swipe for more";\}/);
  assert.match(marketJs, /function syncScrollCue\(el\)/);
  assert.match(marketJs, /el\.dataset\.more = "1"/);
  assert.match(marketJs, /delete el\.dataset\.more/);
  assert.match(marketJs, /el\.addEventListener\("scroll"/);
  assert.match(marketJs, /window\.addEventListener\("resize", syncTableScrollCues\)/);
  // no v1.css tile span may fire against the six-column phone grid: every span 12 sits under a min-width query
  const v1Blocks = v1.split(/(?=@media)/);
  for (const block of v1Blocks) {
    if (/grid-column:span 12/.test(block) && !/^@media \(min-width:881px\)/.test(block)) {
      assert.fail("v1.css has a span 12 tile rule outside @media (min-width:881px): " + block.slice(0, 80));
    }
  }
  assert.match(app, /\.tbl-scroll\{overflow-x:auto/);
  assert.match(v1, /\.artifact-stage\{[^}]*height:clamp\(420px,57vh,660px\)/);
  const v1Phone = (v1.split("@media (max-width:700px)")[1] || "").split("@media")[0];
  assert.match(v1Phone, /\.artifact-stage\{height:clamp\(220px,34vh,320px\)/);
  assert.match(v1, /#artifact-open-below/);
  assert.match(v1, /\.stage-gate\{[^}]*position:absolute; inset:0/);
  assert.match(v1, /\.t-showcase\{grid-column:span 6/);
  assert.match(v1, /\.artifact-tabs\{[^}]*overflow-x:auto/);
  assert.match(app, /:focus-visible/);
  assert.match(app, /outline:1px solid var\(--capx\)/);
  assert.match(app, /\.back\{[^}]*color:var\(--t400\)/);
  assert.match(app, /\.fchip\{[^}]*color:var\(--t400\)/);
  assert.match(v1, /\.open-full\{[^}]*color:var\(--capx\)/);
  assert.match(marketJs, /<a class='nm' href='/);
  assert.match(marketJs, /keydown/);
  assert.match(marketJs, /Enter/);
  assert.match(marketJs, /aria-pressed/);
  assert.match(marketJs, /data\.casaError/);
  assert.match(marketJs, /data\.directoryError/);
  assert.match(companyJs, /noopener noreferrer/);
  assert.match(companyJs, /IFRAME_SANDBOX = "allow-scripts"/);
  assert.match(companyJs, /ArrowRight/);
  assert.match(companyJs, /ArrowLeft/);
  assert.doesNotMatch(app + v1 + index + register + company, /\u2014/);
  assert.doesNotMatch(app + v1, /[\u{1F300}-\u{1FAFF}]/u);
});
