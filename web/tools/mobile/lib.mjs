// Phone-layout harness for Capx Terminal.
// Boots stub upstreams (Launchpad, Casa) and web/server.mjs with SAMPLE=1 so
// every measurement is offline and deterministic. Exposes page measurement
// and a computed-style baseline used to prove desktop is unchanged.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

export const here = dirname(fileURLToPath(import.meta.url));
export const webRoot = join(here, "..", "..");
export const fixtures = JSON.parse(readFileSync(join(here, "fixtures.json"), "utf8"));

export const CONTEXTS = {
  iphone14: devices["iPhone 14"],
  pixel7: devices["Pixel 7"],
};

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

// Launchpad: no live projects, a fixed CAPX quote. SAMPLE rows fill the market.
function launchpadStub(req, res) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/v1/projects") return json(res, 200, { items: [] });
  if (url.pathname === "/v1/market-data/capx") {
    return json(res, 200, { capxUsd: 1.25, source: "fixture", asOf: "2026-08-21T12:00:00Z", stale: false });
  }
  json(res, 404, { error: "NOT_FOUND" });
}

// Casa: empty directory, every detail 404, so SAMPLE_COMPANY_DOCS answer.
function casaStub(req, res) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/v1/companies") {
    return json(res, 200, { companies: [], next_cursor: null, generated_at: "2026-08-21T12:00:00Z" });
  }
  json(res, 404, { error: "NOT_FOUND", message: "fixture" });
}

export async function startStack() {
  const launchpad = await listen(launchpadStub);
  const casa = await listen(casaStub);
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: webRoot,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      CODEX_API_KEY: "",
      SAMPLE: "1",
      HOST: "127.0.0.1",
      PORT: "0",
      PROBE_ARTIFACTS: "0",
      LAUNCHPAD_API: launchpad.url,
      CASA_API: casa.url,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let started = false;
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("terminal start timeout")), 10000);
    let buf = "";
    const onData = (chunk) => {
      buf += chunk;
      const m = buf.match(/capx terminal (http:\/\/127\.0\.0\.1:\d+)/);
      if (m) { started = true; clearTimeout(timer); resolve(m[1]); }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("error", (err) => { clearTimeout(timer); reject(err); });
    child.once("exit", (code) => { if (!started) { clearTimeout(timer); reject(new Error(`terminal exited ${code}: ${buf}`)); } });
  });
  const browser = await chromium.launch();
  return {
    url,
    browser,
    async close() {
      await browser.close().catch(() => {});
      child.kill("SIGTERM");
      launchpad.server.close();
      casa.server.close();
    },
  };
}

export async function openPage(stack, context, fixture, width) {
  const opts = { ...context };
  if (width) opts.viewport = { width, height: context.viewport ? context.viewport.height : 800 };
  const ctx = await stack.browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(stack.url + fixture.path, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector(fixture.ready, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  return { page, ctx };
}

// Layout facts the acceptance gates read.
export const measureScript = () => {
  const vw = window.innerWidth;
  const box = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
  const visible = (el) => { const cs = getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden" && !el.closest("[hidden]"); };
  const brand = document.querySelector("header .brand");
  const actions = document.querySelector("header .hactions");
  const bento = document.querySelector(".bento");
  const chartbox = document.querySelector(".chartbox");
  const chart = document.querySelector("#chart");
  const intersects = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const tiles = bento ? [...bento.querySelectorAll(":scope > .tile")].filter(visible).map((t) => ({
    cls: [...t.classList].find((c) => c.startsWith("t-")) || t.className,
    ...box(t),
    col: getComputedStyle(t).gridColumnStart + " / " + getComputedStyle(t).gridColumnEnd,
  })) : [];
  return {
    innerWidth: vw,
    innerHeight: window.innerHeight,
    docW: document.documentElement.scrollWidth,
    docH: document.documentElement.scrollHeight,
    header: brand ? { brand: box(brand), actions: actions ? box(actions) : null, overlap: actions ? intersects(box(brand), box(actions)) : false } : null,
    bentoCols: bento ? getComputedStyle(bento).gridTemplateColumns.split(" ").length : null,
    tiles,
    chartbox: chartbox && visible(chartbox) ? box(chartbox) : null,
    chart: chart && visible(chart) && !chart.hidden ? box(chart) : null,
  };
};

// Baseline: for every element under <main> (except the starfield canvas),
// its DOM path, box, and a hash of the full computed style. Diffing two
// captures proves whether a CSS change touched a breakpoint it should not.
export const baselineScript = () => {
  const out = [];
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
  const pathOf = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      // index among same-tag siblings, so inserting a colgroup does not renumber thead and tbody
      const idx = e.parentElement ? [...e.parentElement.children].filter((c) => c.tagName === e.tagName).indexOf(e) : 0;
      parts.unshift(e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + ":" + idx);
    }
    return parts.join(">");
  };
  const root = document.querySelector("main") || document.body;
  for (const el of root.querySelectorAll("*")) {
    if (el.id === "stars" || el.closest("#stars")) continue;
    // Heatmap cells are time-dependent (the current UTC hour bucket moves), so they
    // cannot be part of a stable baseline; the phone tests cover them separately.
    if (el.closest("#ghgrid")) continue;
    // col and colgroup are not rendered boxes; they only carry widths that the cells already reflect
    if (el.tagName === "COL" || el.tagName === "COLGROUP") continue;
    const cs = getComputedStyle(el);
    const props = [];
    for (let i = 0; i < cs.length; i++) { const n = cs[i]; props.push(n + ":" + cs.getPropertyValue(n)); }
    // Chrome enumerates custom properties (--gut, --t100, ...) in a varying
    // order between runs; sort so the hash reflects values, not order.
    props.sort();
    const b = el.getBoundingClientRect();
    out.push({
      p: pathOf(el),
      c: typeof el.className === "string" ? el.className : "",
      b: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
      s: hash(props.join(";")),
    });
  }
  return out;
};

export function diffBaseline(before, after, tolerance = 1) {
  const byPath = new Map(before.map((e) => [e.p, e]));
  const problems = [];
  for (const e of after) {
    const prev = byPath.get(e.p);
    if (!prev) {
      // an element that is not rendered on desktop (display:none, zero box) is not a desktop change
      if (!(e.b[2] === 0 && e.b[3] === 0)) problems.push({ path: e.p, cls: e.c, why: "new element" });
      continue;
    }
    byPath.delete(e.p);
    if (prev.s !== e.s) problems.push({ path: e.p, cls: e.c, why: "computed style changed" });
    const moved = prev.b.some((v, i) => Math.abs(v - e.b[i]) > tolerance);
    if (moved) problems.push({ path: e.p, cls: e.c, why: `box ${prev.b.join(",")} -> ${e.b.join(",")}` });
  }
  for (const p of byPath.keys()) problems.push({ path: p, why: "element gone" });
  return problems;
}
