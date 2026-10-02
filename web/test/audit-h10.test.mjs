import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isMint } from "../join.mjs";
import {
  applySecurityHeaders,
  guardRequest,
  proxyTarget,
  readCacheEntry,
  safePath,
  writeCacheEntry,
} from "../routes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..");
const KNOWN = "KnownMint111111111111111111111capx";
const UNKNOWN = "UnknownMint111111111111111111capx";

function mockRes() {
  const headers = {};
  return {
    headersSent: false,
    destroyed: false,
    status: 0,
    body: "",
    headers,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    writeHead(status, extra) {
      this.status = status;
      this.headersSent = true;
      if (extra && typeof extra === "object") {
        for (const [key, value] of Object.entries(extra)) headers[key.toLowerCase()] = value;
      }
      return this;
    },
    end(body) { this.body = body == null ? "" : String(body); },
    destroy() { this.destroyed = true; },
  };
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function startTerminal(env) {
  env = {
    LAUNCHPAD_V2_API: env.LAUNCHPAD_API ? env.LAUNCHPAD_API.replace(/\/$/, "") + "/api/v1/tokens" : undefined,
    ...env,
  };
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
  const url = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("terminal start timeout")), 8000);
    let buf = "";
    const onData = (chunk) => {
      buf += chunk;
      const match = buf.match(/capx terminal (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) {
        started = true;
        clearTimeout(timer);
        resolve(match[1]);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("error", (err) => { clearTimeout(timer); reject(err); });
    child.once("exit", (code) => {
      if (!started) {
        clearTimeout(timer);
        reject(new Error(`terminal exited ${code}: ${buf}`));
      }
    });
  });
  return { child, url };
}

function rawRequest(base, path) {
  const target = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path,
      method: "GET",
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data = text;
        try { data = text ? JSON.parse(text) : null; } catch { /* plain text */ }
        resolve({ status: res.statusCode, headers: res.headers, text, data });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* plain text */ }
  return { status: res.status, headers: res.headers, data, text };
}

function assertSecurity(headers) {
  const get = (name) => (typeof headers.get === "function" ? headers.get(name) : headers[name.toLowerCase()]);
  assert.equal(get("x-frame-options"), "DENY");
  assert.equal(get("x-content-type-options"), "nosniff");
  assert.equal(get("referrer-policy"), "strict-origin-when-cross-origin");
}

test("safePath rejects scheme-relative targets before they parse as another origin", () => {
  assert.equal(safePath("//evil.example/site"), false);
  assert.equal(safePath("//evil.example"), false);
  assert.equal(safePath("/%2f/evil"), false);
  assert.equal(safePath("/%2Fevil?x=1"), false);
  assert.equal(safePath("/health"), true);
  assert.equal(safePath("/health?next=//evil"), true);
  assert.equal(proxyTarget("GET", "//evil.example/site"), null);
});

test("bounded cache expires entries and evicts the oldest past the max", () => {
  const map = new Map();
  writeCacheEntry(map, "old", 1, 0, 10, 2);
  writeCacheEntry(map, "new", 2, 50, 10, 2);
  assert.equal(map.size, 1);
  assert.equal(readCacheEntry(map, "new", 50, 10), 2);
  writeCacheEntry(map, "a", 1, 100, 1000, 2);
  writeCacheEntry(map, "b", 2, 100, 1000, 2);
  writeCacheEntry(map, "c", 3, 100, 1000, 2);
  assert.equal(map.size, 2);
  assert.equal(readCacheEntry(map, "a", 100, 1000), undefined);
  assert.equal(readCacheEntry(map, "b", 100, 1000), 2);
  assert.equal(readCacheEntry(map, "c", 100, 1000), 3);
  assert.equal(readCacheEntry(map, "b", 1100, 1000), undefined);
});

test("guardRequest logs a rejection and answers 500 unless headers were already sent", async () => {
  const logs = [];
  const failed = mockRes();
  await guardRequest(failed, async () => { throw new Error("boom"); }, (...args) => logs.push(args[0]));
  assert.equal(failed.status, 500);
  assert.equal(failed.body, "internal error");
  assert.deepEqual(logs, ["request failed"]);

  const started = mockRes();
  started.writeHead(200, { "content-type": "text/plain" });
  await guardRequest(started, async () => { throw new Error("late"); }, () => {});
  assert.equal(started.status, 200);
  assert.equal(started.destroyed, true);
  assert.equal(started.body, "");

  const ok = mockRes();
  await guardRequest(ok, async () => {
    applySecurityHeaders(ok);
    ok.writeHead(204);
    ok.end();
  }, () => {});
  assert.equal(ok.status, 204);
  assert.equal(ok.headers["x-frame-options"], "DENY");
  assert.equal(ok.headers["x-content-type-options"], "nosniff");
  assert.equal(ok.headers["referrer-policy"], "strict-origin-when-cross-origin");
});

test("chart vendor call stays behind the token-list gate and the caches are capped", () => {
  const src = readFileSync(join(webRoot, "server.mjs"), "utf8");
  const fn = src.slice(src.indexOf("async function loadMintChart"), src.indexOf("async function loadCapxDemo"));
  assert.ok(fn.includes("knownChartMint"));
  assert.ok(fn.indexOf("fetchOhlcv") > fn.indexOf("knownChartMint"));
  assert.match(src, /CHART_CACHE_MAX = 256/);
  assert.match(src, /BARS_TTL_MS = 120_000/);
  assert.match(src, /COMPANY_MISS_TTL_MS = 180_000/);
  assert.match(src, /writeCacheEntry\(barsCache/);
  assert.match(src, /process\.on\("unhandledRejection"/);
  assert.match(src, /rawUrl\.startsWith\("\/\/"\)/);
  assert.match(src, /guardRequest\(response/);
  assert.equal(isMint(KNOWN), true);
  assert.equal(isMint(UNKNOWN), true);
});

test("handler rejects // targets, sets frame headers, and caches unknown companies", async (t) => {
  assert.equal(isMint(KNOWN), true);
  assert.equal(isMint(UNKNOWN), true);
  const hits = { tokens: 0, companies: 0, details: [] };
  const casa = await listen((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/v1/companies") {
      hits.companies += 1;
      json(res, 200, { companies: [], next_cursor: null });
      return;
    }
    const detail = url.pathname.match(/^\/v1\/companies\/([^/]+)$/);
    if (req.method === "GET" && detail) {
      const slug = decodeURIComponent(detail[1]);
      hits.details.push(slug);
      if (slug === "down-co") {
        json(res, 503, { error: "CASA_UNAVAILABLE", message: "down" });
        return;
      }
      json(res, 404, { error: "NOT_FOUND", message: "No such company" });
      return;
    }
    json(res, 404, { error: "NOT_FOUND" });
  });
  const launchpad = await listen((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/api/v1/tokens") {
      hits.tokens += 1;
      json(res, 200, { items: [{ mint: KNOWN, name: "Known", symbol: "KN", state: "COMPLETED" }] });
      return;
    }
    if (url.pathname === "/api/v1/capx") {
      json(res, 200, { capxUsd: 1.25, source: "fixture", asOf: "2026-08-21T12:00:00Z", stale: false });
      return;
    }
    json(res, 404, { error: "NOT_FOUND" });
  });
  const terminal = startTerminal({
    CASA_API: casa.url,
    LAUNCHPAD_API: launchpad.url,
    LIST_TTL_MS: "0",
  });
  const base = await terminal.url;
  t.after(() => {
    terminal.child.kill("SIGTERM");
    casa.server.close();
    launchpad.server.close();
  });

  const health = await getJson(`${base}/health`);
  assert.equal(health.status, 200);
  assertSecurity(health.headers);

  const schemeRelative = await rawRequest(base, "//evil.example/site");
  assert.equal(schemeRelative.status, 400);
  assert.equal(schemeRelative.text, "bad path");
  assertSecurity(schemeRelative.headers);
  const encodedSlash = await rawRequest(base, "/%2f/evil");
  assert.equal(encodedSlash.status, 400);

  const before = { tokens: hits.tokens, companies: hits.companies, details: hits.details.length };
  const invalid = await getJson(`${base}/api/companies/Not_Valid`);
  assert.equal(invalid.status, 404);
  assert.equal(invalid.data.error, "NOT_FOUND");
  const longId = "a".repeat(80);
  const longRes = await getJson(`${base}/api/companies/${longId}`);
  assert.equal(longRes.status, 404);
  assert.equal(longRes.data.error, "NOT_FOUND");
  assert.equal(hits.tokens, before.tokens);
  assert.equal(hits.companies, before.companies);
  assert.equal(hits.details.length, before.details);

  const missing = await getJson(`${base}/api/companies/missing-co`);
  assert.equal(missing.status, 404);
  assert.equal(missing.data.error, "NOT_FOUND");
  assert.deepEqual(hits.details, ["missing-co"]);
  const missingAgain = await getJson(`${base}/api/companies/missing-co`);
  assert.equal(missingAgain.status, 404);
  assert.equal(missingAgain.data.error, "NOT_FOUND");
  assert.deepEqual(hits.details, ["missing-co"]);

  const down = await getJson(`${base}/api/companies/down-co`);
  const downAgain = await getJson(`${base}/api/companies/down-co`);
  assert.equal(down.status, 503);
  assert.equal(downAgain.status, 503);
  assert.equal(down.data.error, "CASA_UNAVAILABLE");
  assert.deepEqual(hits.details.filter((slug) => slug === "down-co"), ["down-co", "down-co"]);

  const tokensBefore = hits.tokens;
  const companiesBefore = hits.companies;
  const mintMiss = await getJson(`${base}/api/companies/${UNKNOWN}`);
  assert.equal(mintMiss.status, 404);
  assert.equal(mintMiss.data.error, "TOKEN_NOT_LISTED");
  assert.ok(hits.tokens > tokensBefore);
  const tokensAfter = hits.tokens;
  const companiesAfter = hits.companies;
  assert.ok(companiesAfter > companiesBefore);
  const mintAgain = await getJson(`${base}/api/companies/${UNKNOWN}`);
  assert.equal(mintAgain.status, 404);
  assert.equal(mintAgain.data.error, "TOKEN_NOT_LISTED");
  assert.equal(hits.tokens, tokensAfter);
  assert.equal(hits.companies, companiesAfter);

  const listed = await getJson(`${base}/api/chart/${KNOWN}`);
  assert.equal(listed.status, 200);
  assert.equal(listed.data.error, "CODEX_API_KEY_MISSING");
  assert.deepEqual(listed.data.candles, []);
  const unlisted = await getJson(`${base}/api/chart/${UNKNOWN}`);
  assert.equal(unlisted.status, 404);
  assert.equal(unlisted.data.error, "TOKEN_NOT_LISTED");
  assert.equal(unlisted.headers.get("cache-control"), "no-store");
  const badMint = await getJson(`${base}/api/chart/nope`);
  assert.equal(badMint.status, 400);
  assert.equal(badMint.data.error, "INVALID_MINT");
  assertSecurity(badMint.headers);
});

test("chart identifier is not sent upstream when the token list is down", async (t) => {
  const hits = { tokens: 0 };
  const casa = await listen((req, res) => json(res, 200, { companies: [], next_cursor: null }));
  const launchpad = await listen((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/api/v1/tokens") {
      hits.tokens += 1;
      json(res, 500, { error: "down" });
      return;
    }
    if (url.pathname === "/api/v1/capx") {
      json(res, 200, { capxUsd: 1, source: "fixture" });
      return;
    }
    json(res, 404, { error: "NOT_FOUND" });
  });
  const terminal = startTerminal({ CASA_API: casa.url, LAUNCHPAD_API: launchpad.url });
  const base = await terminal.url;
  t.after(() => {
    terminal.child.kill("SIGTERM");
    casa.server.close();
    launchpad.server.close();
  });
  const res = await getJson(`${base}/api/chart/${KNOWN}`);
  assert.equal(res.status, 503);
  assert.equal(res.data.error, "CHART_UNAVAILABLE");
  assert.equal(res.data.candles, undefined);
  assert.ok(hits.tokens >= 1);
});

test("unhandled rejections are logged and do not crash the process", async () => {
  const serverHref = pathToFileURL(join(webRoot, "server.mjs")).href;
  const child = spawn(process.execPath, ["-e", `
    import(${JSON.stringify(serverHref)}).then(() => {
      Promise.reject(new Error("boom"));
      setTimeout(() => { process.stdout.write("still-alive\\n"); process.exit(0); }, 300);
    }).catch((err) => { console.error(err); process.exit(1); });
  `], {
    cwd: webRoot,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      HOST: "127.0.0.1",
      PORT: "0",
      SAMPLE: "0",
      CODEX_API_KEY: "",
      PROBE_ARTIFACTS: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  let err = "";
  child.stdout.on("data", (chunk) => { out += chunk; });
  child.stderr.on("data", (chunk) => { err += chunk; });
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`timeout stdout=${out} stderr=${err}`));
    }, 8000);
    child.once("exit", (status) => { clearTimeout(timer); resolve(status); });
  });
  assert.equal(code, 0, err);
  assert.match(out, /still-alive/);
  assert.match(err, /unhandled rejection/);
  assert.match(err, /boom/);
});
