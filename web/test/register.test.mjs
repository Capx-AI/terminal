import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadJson } from "../../../../ORCHESTRATOR/casa-terminal-plan-01/contracts/validate.mjs";
import {
  REGISTER_MESSAGES,
  REGISTER_STATUS,
  parseRegisterBody,
  redeemErrorResponse,
  redeemSuccessResponse,
} from "../register.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..");
const GOLDEN = join(repoRoot, "../../ORCHESTRATOR/casa-terminal-plan-01/contracts/golden");

const CODE_PUBLISH = "CASA-AAAA-AAAA-AAA1";
const CODE_CLAIM = "CASA-AAAA-AAAA-AAA2";
const CODE_EXPIRED = "CASA-AAAA-AAAA-AAA3";
const CODE_USED = "CASA-AAAA-AAAA-AAA4";
const CODE_UNREADY = "CASA-AAAA-AAAA-AAA5";
const CODE_PRIVATE = "CASA-AAAA-AAAA-AAA6";
const CODE_SLUG = "CASA-AAAA-AAAA-AAA7";
const CODE_DOWN = "CASA-AAAA-AAAA-AAA8";

const publishBody = loadJson(join(GOLDEN, "redeem-publish.json"));
const claimBody = loadJson(join(GOLDEN, "redeem-claim.json"));
const directory = loadJson(join(GOLDEN, "directory.json"));
const inbox = directory.companies.find((c) => c.slug === "inboxpilot");
const northstar = directory.companies.find((c) => c.slug === "northstar-labs");

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

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  return { server, url: `http://127.0.0.1:${addr.port}` };
}

async function startTerminal(env) {
  // Tests point the v2 source at the same mock host; production defaults to launchpadv2.capx.ai.
  env = { LAUNCHPAD_V2_API: env.LAUNCHPAD_API ? env.LAUNCHPAD_API.replace(/\/$/, "") + "/api/v1/tokens" : undefined, ...env };
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

function readReq(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try { resolve(JSON.parse(raw)); } catch { resolve(null); }
    });
  });
}

function json(res, status, body, extra = {}) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": extra.cacheControl || "no-store",
  });
  res.end(JSON.stringify(body));
}

function launchpadHandler(req, res) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if ((url.pathname === "/v1/projects" || url.pathname === "/api/v1/tokens")) {
    json(res, 200, { items: [], nextCursor: null }, { cacheControl: "public, max-age=60" });
    return;
  }
  if (url.pathname === "/api/v1/capx") {
    json(res, 200, { capxUsd: 1.25, source: "fixture", asOf: "2026-08-21T12:00:00Z", stale: false });
    return;
  }
  json(res, 404, { error: "NOT_FOUND" });
}

function mockCasa(state) {
  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/v1/companies") {
      state.companyGets += 1;
      json(res, 200, {
        companies: state.companies.slice(),
        next_cursor: null,
        generated_at: "2026-08-21T12:00:00Z",
      }, { cacheControl: "public, max-age=60" });
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/companies/redeem") {
      const body = await readReq(req);
      state.redeems.push(body);
      const code = body && body.code;
      if (code === CODE_DOWN) {
        res.writeHead(502, { "content-type": "text/plain", "cache-control": "no-store" });
        res.end("bad gateway");
        return;
      }
      if (code === CODE_PUBLISH) {
        if (!state.companies.some((c) => c.slug === northstar.slug)) {
          state.companies.push(northstar);
        }
        json(res, 200, publishBody);
        return;
      }
      if (code === CODE_CLAIM) {
        json(res, 200, claimBody);
        return;
      }
      const errors = {
        [CODE_EXPIRED]: { status: 410, error: "CODE_EXPIRED", message: "casa expired copy" },
        [CODE_USED]: { status: 409, error: "CODE_USED", message: "casa used copy" },
        [CODE_UNREADY]: { status: 409, error: "NOT_READY", message: "casa unready copy" },
        [CODE_PRIVATE]: { status: 404, error: "PRIVATE", message: "casa private copy" },
        [CODE_SLUG]: { status: 409, error: "SLUG_CONFLICT", message: "casa slug copy" },
      };
      const mapped = errors[code];
      if (mapped) {
        json(res, mapped.status, { error: mapped.error, message: mapped.message });
        return;
      }
      json(res, 404, { error: "CODE_INVALID", message: "casa invalid copy" });
      return;
    }
    json(res, 404, { error: "NOT_FOUND", message: "No such route" });
  };
}

async function withTerminal(t, state) {
  const casa = await listen(mockCasa(state));
  const launchpad = await listen(launchpadHandler);
  const terminal = await startTerminal({
    CASA_API: casa.url,
    LAUNCHPAD_API: launchpad.url,
  });
  t.after(() => {
    terminal.child.kill("SIGTERM");
    casa.server.close();
    launchpad.server.close();
  });
  return { casa, launchpad, terminal, state };
}

async function postRegister(base, code, extra = {}) {
  const res = await fetch(`${base}/api/register`, {
    method: extra.method || "POST",
    headers: extra.headers || { "content-type": "application/json", accept: "application/json" },
    cache: "no-store",
    redirect: "manual",
    body: extra.body !== undefined ? extra.body : JSON.stringify({ code }),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, headers: res.headers, data };
}

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  return { status: res.status, headers: res.headers, data };
}

test("redeem mapper is deterministic for publish, claim, and Casa error codes", () => {
  const pub = redeemSuccessResponse(publishBody);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.outcome, "PUBLISH");
  assert.equal(pub.body.redirect, "/c/northstar-labs");
  assert.equal(pub.body.message, REGISTER_MESSAGES.PUBLISH);
  const claim = redeemSuccessResponse(claimBody);
  assert.equal(claim.body.outcome, "CLAIM");
  assert.equal(claim.body.redirect, "/c/inboxpilot");
  assert.equal(claim.body.message, REGISTER_MESSAGES.CLAIM);
  for (const error of ["CODE_EXPIRED", "CODE_USED", "CODE_INVALID", "NOT_READY", "PRIVATE", "SLUG_CONFLICT", "CASA_UNAVAILABLE"]) {
    const mapped = redeemErrorResponse(error);
    assert.equal(mapped.status, REGISTER_STATUS[error]);
    assert.equal(mapped.body.error, error);
    assert.equal(mapped.body.message, REGISTER_MESSAGES[error]);
  }
  assert.equal(redeemErrorResponse("NOT_FOUND").body.error, "CASA_UNAVAILABLE");
  assert.equal(parseRegisterBody(JSON.stringify({ code: "  x  " })).code, "  x  ");
  assert.equal(parseRegisterBody("code=CASA-AAAA-AAAA-AAA1", "application/x-www-form-urlencoded").code, CODE_PUBLISH);
});

test("GET /register is one code field and Vercel packs the page", async (t) => {
  const state = { companies: [inbox], companyGets: 0, redeems: [] };
  const { terminal } = await withTerminal(t, state);
  const res = await fetch(`${terminal.url}/register`, { cache: "no-store" });
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/html/);
  assert.match(html, /name="code"/);
  assert.match(html, /id="code"/);
  assert.equal((html.match(/<input\b/g) || []).length, 1);
  assert.doesNotMatch(html, /type="password"|oauth|wallet|signin|sign-in/i);
  assert.match(html, /action="\/api\/register"/);
  const vercel = JSON.parse(readFileSync(join(webRoot, "vercel.json"), "utf8"));
  assert.match(vercel.functions["server.mjs"].includeFiles, /register\.html/);
  assert.match(vercel.functions["server.mjs"].includeFiles, /register\.js/);
});

test("POST /api/register publishes, claims, and redirects to /c/{slug}", async (t) => {
  const state = { companies: [inbox], companyGets: 0, redeems: [] };
  const { terminal } = await withTerminal(t, state);
  const published = await postRegister(terminal.url, CODE_PUBLISH);
  assert.equal(published.status, 200);
  assert.equal(published.headers.get("cache-control"), "no-store");
  assert.equal(published.headers.get("set-cookie"), null);
  assert.equal(published.data.outcome, "PUBLISH");
  assert.equal(published.data.slug, "northstar-labs");
  assert.equal(published.data.redirect, "/c/northstar-labs");
  assert.equal(published.data.message, REGISTER_MESSAGES.PUBLISH);
  assert.deepEqual(state.redeems[0], { code: CODE_PUBLISH });

  const claimed = await postRegister(terminal.url, CODE_CLAIM);
  assert.equal(claimed.status, 200);
  assert.equal(claimed.headers.get("cache-control"), "no-store");
  assert.equal(claimed.data.outcome, "CLAIM");
  assert.equal(claimed.data.slug, "inboxpilot");
  assert.equal(claimed.data.redirect, "/c/inboxpilot");
  assert.equal(claimed.data.message, REGISTER_MESSAGES.CLAIM);
});

test("POST /api/register maps expired, reused, unready, and other Casa codes", async (t) => {
  const state = { companies: [inbox], companyGets: 0, redeems: [] };
  const { terminal } = await withTerminal(t, state);
  const cases = [
    [CODE_EXPIRED, "CODE_EXPIRED"],
    [CODE_USED, "CODE_USED"],
    [CODE_UNREADY, "NOT_READY"],
    [CODE_PRIVATE, "PRIVATE"],
    [CODE_SLUG, "SLUG_CONFLICT"],
    ["CASA-ZZZZ-ZZZZ-ZZZZ", "CODE_INVALID"],
    ["", "CODE_INVALID"],
  ];
  for (const [code, error] of cases) {
    const res = await postRegister(terminal.url, code);
    assert.equal(res.status, REGISTER_STATUS[error], error);
    assert.equal(res.headers.get("cache-control"), "no-store", error);
    assert.equal(res.data.error, error);
    assert.equal(res.data.message, REGISTER_MESSAGES[error]);
    assert.equal(res.data.redirect, undefined);
  }
  const down = await postRegister(terminal.url, CODE_DOWN);
  assert.equal(down.status, 503);
  assert.equal(down.headers.get("cache-control"), "no-store");
  assert.equal(down.data.error, "CASA_UNAVAILABLE");
  assert.equal(down.data.message, REGISTER_MESSAGES.CASA_UNAVAILABLE);
});

test("unreachable Casa is CASA_UNAVAILABLE and no-store", async (t) => {
  const launchpad = await listen(launchpadHandler);
  const terminal = await startTerminal({
    CASA_API: "http://127.0.0.1:1",
    LAUNCHPAD_API: launchpad.url,
  });
  t.after(() => {
    terminal.child.kill("SIGTERM");
    launchpad.server.close();
  });
  const down = await postRegister(terminal.url, CODE_PUBLISH);
  assert.equal(down.status, 503);
  assert.equal(down.headers.get("cache-control"), "no-store");
  assert.equal(down.data.error, "CASA_UNAVAILABLE");
  assert.equal(down.data.message, REGISTER_MESSAGES.CASA_UNAVAILABLE);
});

test("successful redeem drops the companies snapshot so the next market fetch is not stale", async (t) => {
  const state = { companies: [inbox], companyGets: 0, redeems: [] };
  const { terminal } = await withTerminal(t, state);

  const before = await getJson(`${terminal.url}/api/market`);
  assert.equal(before.status, 200);
  assert.equal(state.companyGets, 1);
  const slugsBefore = (before.data.rows || []).map((r) => r.company && r.company.slug).filter(Boolean);
  assert.deepEqual(slugsBefore, ["inboxpilot"]);
  assert.equal(slugsBefore.includes("northstar-labs"), false);

  const failed = await postRegister(terminal.url, CODE_USED);
  assert.equal(failed.status, 409);
  const cached = await getJson(`${terminal.url}/api/market`);
  assert.equal(cached.status, 200);
  assert.equal(state.companyGets, 1, "failed redeem must not drop the snapshot");

  const published = await postRegister(terminal.url, CODE_PUBLISH);
  assert.equal(published.status, 200);
  const after = await getJson(`${terminal.url}/api/market`);
  assert.equal(after.status, 200);
  assert.equal(state.companyGets, 2, "second market fetch must hit Casa again");
  const slugsAfter = (after.data.rows || []).map((r) => r.company && r.company.slug).filter(Boolean).sort();
  assert.deepEqual(slugsAfter, ["inboxpilot", "northstar-labs"]);
  const added = after.data.rows.find((r) => r.company && r.company.slug === "northstar-labs");
  assert.equal(added.kind, "company_without_token");
});

test("register proxy is a no-store Casa redeem forward with snapshot invalidation", () => {
  const src = readFileSync(join(webRoot, "server.mjs"), "utf8");
  const handler = extractFunction(src, "async function handleRegister");
  const invalidate = extractFunction(src, "function invalidateCompaniesSnapshot");
  assert.match(handler, /\/v1\/companies\/redeem/);
  assert.match(handler, /JSON\.stringify\(\{ code \}\)/);
  assert.match(handler, /invalidateCompaniesSnapshot/);
  assert.match(handler, /no-store/);
  assert.doesNotMatch(handler, /writeFile|writeFileSync/);
  assert.doesNotMatch(handler, /oauth|wallet|password|CASA_LAUNCHPAD_KEY/i);
  assert.match(invalidate, /companiesCache = \{ at: 0, value: null, error: null \}/);
  assert.match(invalidate, /companySurfaceCache\.clear\(\)/);
  assert.match(src, /relative === "register"/);
});
