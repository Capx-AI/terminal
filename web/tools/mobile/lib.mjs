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

// Extra company documents served only by this stub (not SAMPLE_COMPANY_DOCS).
// Directory listing stays empty so the home-page join, and the Phase 1 desktop
// baseline, keep using SAMPLE rows only.
function readyCompany({ slug, name, description, category, outputs }) {
  const host = `https://${slug}.casa.capx.ai`;
  const artifacts = {
    site: { url: `${host}/`, version_id: "ver_site_1", visibility: "public" },
    one_pager: { url: `${host}/one-pager/`, version_id: "ver_pager_1", visibility: "public" },
    deck: { url: `${host}/deck/`, version_id: "ver_deck_1", visibility: "public" },
  };
  return {
    company_id: `fixture-${slug}`,
    company_pubkey: `fixture-key-${slug}`,
    slug,
    name,
    description,
    logo: `${host}/logo.png`,
    category,
    visibility: "public",
    published_at: "2026-08-21T11:00:00Z",
    agent_mint: null,
    launchpad_project_id: null,
    readiness: {
      ready: true,
      missing: [],
      website: true,
      one_pager: true,
      deck: true,
      name: true,
      description: true,
      logo: true,
      category: true,
      completed_playbook: true,
    },
    artifact_visibility: { site: "public", one_pager: "public", deck: "public" },
    active_artifact_versions: { site: "ver_site_1", one_pager: "ver_pager_1", deck: "ver_deck_1" },
    created_at: "2026-08-10T09:00:00Z",
    updated_at: "2026-08-21T11:00:00Z",
    canonical_url: host,
    progress: {
      plane: "claimed",
      level: 0,
      level_name: "Ideation and Validation",
      playbooks_total: 42,
      playbooks_done: 4,
      playbooks_ready: 2,
      playbooks_blocked: 0,
      done_nodes: [{ node_id: "opportunity-scan", title: "Opportunity Scan" }],
      constraint: { archetype: "no_users", lead_departments: ["Growth"] },
      north_star: { band: "validation", metric_id: "validated_demand", label: "validated demand" },
      work: { tasks_7d: 4, tasks_total: 4, artifacts_total: 3, rubric_pins: 2, in_flight: 0 },
    },
    attestation: {
      attested: true,
      health_score: 64,
      freshness: "aging",
      observed_at: "2026-08-19T18:00:00Z",
      sequence: 1,
    },
    calendar: {
      plane: "reproduced",
      days: [
        { date: "2026-08-19", events: 4, attestation: true, decision: false },
        { date: "2026-08-20", events: 0, attestation: false, decision: false },
        { date: "2026-08-21", events: 0, attestation: false, decision: false },
      ],
    },
    ledger: {
      plane: "claimed",
      window_events: 4,
      shown: [
        { ts: "2026-08-19T18:00:00Z", kind: "playbook", status: "done", node_id: "phase0-website", title: "Phase 0 Website", department: "Brand", committed: true, has_rubric: true },
      ],
    },
    token: null,
    artifacts,
    outputs: outputs || [],
  };
}

const CASA_DOCS = {
  "broken-preview": readyCompany({
    slug: "broken-preview",
    name: "Broken Preview",
    description: "Harness fixture. Artifact URLs 404 so the preview falls back to copy.",
    category: "developer-tools",
  }),
  "output-reader": readyCompany({
    slug: "output-reader",
    name: "Output Reader",
    description: "Harness fixture. Published outputs sidecar so the library and reader render.",
    category: "productivity",
    outputs: [
      {
        id: "phase0-website.md",
        node_id: "phase0-website",
        title: "Phase 0 Website",
        path: "phase0-website.md",
        sha256: "0d5c7cbecd0ac3b4114e0089a4b87d15c2f5c2b0ac1e2f6a9b8c7d6e5f4a3b2c",
        bytes: 1810,
        url: "https://output-reader.casa.capx.ai/outputs/phase0-website.md",
        published_at: "2026-08-24T09:00:00.000Z",
      },
      {
        id: "brand-positioning/statement.md",
        node_id: "brand-positioning",
        title: "Brand Positioning Statement",
        path: "brand-positioning/statement.md",
        sha256: "1e6d8dcfde1bd4c5225f119ab5c98e26d3a6d3c1bd2f3a7bacbdcecfa5b4c3d1",
        bytes: 942,
        url: "https://output-reader.casa.capx.ai/outputs/brand-positioning/statement.md",
        published_at: "2026-08-25T18:30:00.000Z",
      },
    ],
  }),
};

const OUTPUT_FIXTURE_MD = "# Phase 0 Website\n\nHarness fixture output. Founder claimed.\n";

// Company pulse cells after "now" are .hc.pad. Pin the page clock to the
// committed desktop baseline so that cell does not drift hour to hour.
const SAMPLE_NOW_MS = Date.parse("2026-08-29T07:49:33.669Z");

// Casa: empty directory so SAMPLE_COMPANY_DOCS still answer for inboxpilot /
// northstar-labs. Extra Phase 2 slugs are served as real Casa documents.
function casaStub(req, res) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/v1/companies") {
    return json(res, 200, { companies: [], next_cursor: null, generated_at: "2026-08-21T12:00:00Z" });
  }
  const detail = url.pathname.match(/^\/v1\/companies\/([^/]+)$/);
  if (detail) {
    const slug = decodeURIComponent(detail[1]);
    if (CASA_DOCS[slug]) return json(res, 200, CASA_DOCS[slug]);
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

export async function openPage(stack, context, fixture, width, height) {
  const opts = { ...context };
  if (width || height) {
    const prev = context.viewport || { width: 800, height: 800 };
    opts.viewport = { width: width || prev.width, height: height || prev.height };
  }
  const ctx = await stack.browser.newContext(opts);
  const page = await ctx.newPage();
  try {
    await page.addInitScript((ms) => { Date.now = () => ms; }, SAMPLE_NOW_MS);
    if (fixture.artifactFailure) {
      await page.route(/https:\/\/broken-preview\.casa\.capx\.ai(?:\/|$)/, (route) => route.abort());
    }
    if (fixture.openReader || fixture.serveOutputs) {
      await page.route(/https:\/\/[a-z0-9-]+\.casa\.capx\.ai\/outputs\//, (route) => route.fulfill({
        status: 200,
        contentType: "text/markdown; charset=utf-8",
        body: OUTPUT_FIXTURE_MD,
      }));
    }
    await page.goto(stack.url + fixture.path, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForSelector(fixture.ready, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    if (fixture.openReader) {
      try {
        await page.click(".outrow", { timeout: 4000 });
        await page.waitForTimeout(250);
      } catch {
        // Reader stays closed; Phase 2 assertions name the miss.
      }
    }
    return { page, ctx };
  } catch (err) {
    await ctx.close().catch(() => {});
    throw err;
  }
}

export const HIT_SELECTORS = [
  ".back",
  ".fchip",
  ".tf",
  ".artifact-tab",
  ".open-full",
  ".artifact-open",
  "#artifact-open-below",
  ".tokenlinks a",
  "th[data-k]",
  ".nobind-actions a",
  ".outrow",
  ".reader-head button",
  ".liveitem",
  ".attfeed .att",
  ".pod a",
  ".regbtn",
  ".tok .nm",
  ".stage-gate",
];

export const TYPE_EXCEPTIONS = [".sr-only", ".skip", ".hc", "canvas"];

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
    // The live-presales rail shows a countdown against the server clock, which the pinned
    // page clock cannot freeze; its text width drifts, so the rail stays out of the baseline.
    if (el.closest("#live-rail")) continue;
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

export async function typeCensus(page) {
  return page.evaluate((exceptions) => {
    const skipSel = exceptions.join(",");
    const under = [];
    const skipTag = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CANVAS", "SVG", "PATH"]);
    for (const el of document.querySelectorAll("*")) {
      if (skipTag.has(el.tagName)) continue;
      if (el.closest(skipSel)) continue;
      if (el.closest("[hidden]")) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      let direct = false;
      for (const n of el.childNodes) {
        if (n.nodeType === 3 && String(n.textContent || "").trim()) { direct = true; break; }
      }
      if (!direct) continue;
      const px = parseFloat(cs.fontSize);
      if (!Number.isFinite(px) || px >= 11 - 0.05) continue;
      const id = el.id ? "#" + el.id : "";
      const cls = typeof el.className === "string" && el.className.trim()
        ? "." + el.className.trim().split(/\s+/).join(".")
        : "";
      under.push({
        selector: el.tagName.toLowerCase() + id + cls,
        fontSize: Math.round(px * 100) / 100,
        text: String(el.textContent || "").trim().slice(0, 48),
      });
    }
    return { innerWidth: window.innerWidth, under };
  }, TYPE_EXCEPTIONS);
}

export async function hitAreaCensus(page, selectors) {
  const list = Array.isArray(selectors) && selectors.length ? selectors : HIT_SELECTORS;
  return page.evaluate((sels) => {
    const visible = (el) => {
      if (!el || el.closest("[hidden]")) return false;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      const b = el.getBoundingClientRect();
      return b.width > 0 || b.height > 0;
    };
    const hitsTarget = (at, el, cell) => {
      if (!at) return false;
      if (el === at || el.contains(at)) return true;
      if (cell && (cell === at || cell.contains(at))) return true;
      return false;
    };
    const hitHeight = (el, cell) => {
      const box = (cell || el).getBoundingClientRect();
      const pad = 12;
      const step = 4;
      const left = box.left - pad;
      const right = box.right + pad;
      const top = box.top - pad;
      const bottom = box.bottom + pad;
      const xs = [];
      for (let x = left + step / 2; x < right; x += step) xs.push(x);
      if (!xs.length) xs.push((left + right) / 2);
      let best = 0;
      let run = 0;
      for (let y = top + step / 2; y < bottom; y += step) {
        let hit = false;
        for (const x of xs) {
          const vx = Math.min(Math.max(0, x), window.innerWidth - 1);
          const vy = Math.min(Math.max(0, y), window.innerHeight - 1);
          const at = document.elementFromPoint(vx, vy);
          if (hitsTarget(at, el, cell)) { hit = true; break; }
        }
        if (hit) {
          run += step;
          if (run > best) best = run;
        } else {
          run = 0;
        }
      }
      return best;
    };
    const out = [];
    for (const selector of sels) {
      const query = selector === ".pod a" ? "a.pod, .pod a" : selector;
      const nodes = [...document.querySelectorAll(query)].filter(visible);
      if (!nodes.length) {
        out.push({ selector, skipped: true, reason: "no match" });
        continue;
      }
      nodes.forEach((el, index) => {
        if (el.closest(".reader-body, .nobind-copy, .tblnote")) return;
        if (el.closest(".hc") || el.classList.contains("hc")) return;
        if (el.closest(".evtip") || (el.classList.contains("pin"))) return;
        const cell = selector === ".tok .nm" ? el.closest("td.l") : null;
        const target = cell || el;
        try { target.scrollIntoView({ block: "center", inline: "nearest" }); } catch { /* layout */ }
        const box = target.getBoundingClientRect();
        const hitH = hitHeight(el, cell);
        out.push({
          selector,
          index,
          hitH,
          boxH: Math.round(box.height),
          skipped: false,
        });
      });
    }
    return { innerWidth: window.innerWidth, items: out };
  }, list);
}

export async function tableCheck(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      if (!el || el.closest("[hidden]")) return false;
      const cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden";
    };
    const tables = [];
    for (const wrap of document.querySelectorAll(".tbl-scroll")) {
      const table = wrap.querySelector("table");
      const id = (table && table.id) || wrap.id || "(anonymous)";
      const shown = visible(wrap);
      const hasColgroup = !!(table && table.querySelector("colgroup"));
      const dataMoreOnLoad = wrap.getAttribute("data-more");
      const row = table && table.querySelector("tbody tr");
      const tds = row ? [...row.querySelectorAll(":scope > td")] : [];
      let pin = null;
      if (shown && tds.length >= 2) {
        wrap.scrollLeft = 300;
        const c = wrap.getBoundingClientRect();
        const a = tds[0].getBoundingClientRect();
        const b = tds[1].getBoundingClientRect();
        pin = {
          containerLeft: Math.round(c.left * 100) / 100,
          td0Left: Math.round(a.left * 100) / 100,
          td1Left: Math.round(b.left * 100) / 100,
        };
      }
      wrap.scrollLeft = wrap.scrollWidth;
      // the scroll event is asynchronous; market.js listens for it, so fire it before reading the attribute
      wrap.dispatchEvent(new Event("scroll"));
      const dataMoreAtEnd = wrap.getAttribute("data-more");
      wrap.scrollLeft = 0;
      tables.push({
        id,
        shown,
        hasColgroup,
        dataMoreOnLoad,
        dataMoreAtEnd,
        pin,
        canScroll: wrap.scrollWidth - wrap.clientWidth > 20,
      });
    }
    return { innerWidth: window.innerWidth, tables };
  });
}

export async function railCheck(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      if (!el || el.closest("[hidden]")) return false;
      const cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden";
    };
    const measureAll = (selector, itemSel) => {
      const els = [...document.querySelectorAll(selector)];
      const shown = els.filter(visible);
      if (!shown.length) return [{ selector, skipped: true, reason: "not visible" }];
      return shown.map((el) => {
        const name = selector + (el.id ? "#" + el.id : "");
        const item = el.querySelector(itemSel) || el.firstElementChild;
        if (!item) return { selector: name, skipped: false, reason: "no item", itemH: null, scrollH: el.scrollHeight };
        const itemH = item.getBoundingClientRect().height;
        return {
          selector: name,
          skipped: false,
          reason: null,
          itemH: Math.round(itemH * 100) / 100,
          scrollH: el.scrollHeight,
        };
      });
    };
    return {
      innerWidth: window.innerWidth,
      rails: [
        ...measureAll(".chips", ".fchip"),
        ...measureAll(".liveitems", ".liveitem"),
        ...measureAll(".attfeed", ".att"),
      ],
    };
  });
}

export async function tapChart(page) {
  return page.evaluate(() => {
    const chart = document.querySelector("#chart");
    const dateEl = document.querySelector("#ro-date");
    const visible = (el) => {
      if (!el || el.hidden || el.closest("[hidden]")) return false;
      const cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden";
    };
    if (!chart || !visible(chart)) {
      return { skipped: true, reason: "#chart is hidden (no series)" };
    }
    if (!dateEl) {
      return { skipped: false, reason: "#ro-date missing", placeholder: "--", afterFirst: null, afterLeave: null, afterSecond: null };
    }
    const box = chart.getBoundingClientRect();
    if (box.width < 8 || box.height < 8) {
      return { skipped: true, reason: "#chart is hidden (no series)" };
    }
    const placeholder = "--";
    const before = dateEl.textContent;
    const y = box.top + box.height / 2;
    const tap = (x) => {
      const down = { pointerType: "touch", bubbles: true, cancelable: true, isPrimary: true, pointerId: 1, clientX: x, clientY: y };
      chart.dispatchEvent(new PointerEvent("pointerdown", down));
      chart.dispatchEvent(new PointerEvent("pointerup", { ...down, clientX: x + 2, clientY: y + 1 }));
    };
    tap(box.left + box.width * 0.28);
    const afterFirst = dateEl.textContent;
    chart.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "touch", bubbles: true, pointerId: 1 }));
    const afterLeave = dateEl.textContent;
    tap(box.left + box.width * 0.72);
    const afterSecond = dateEl.textContent;
    return {
      skipped: false,
      reason: null,
      placeholder,
      before,
      afterFirst,
      afterLeave,
      afterSecond,
      firstPinned: !!(afterFirst && afterFirst.trim() && afterFirst.trim() !== placeholder),
      held: afterLeave === afterFirst,
      moved: afterSecond !== afterFirst,
      changed: afterFirst !== before || afterSecond !== before,
    };
  });
}

export async function tapHeatmap(page) {
  return page.evaluate(() => {
    const tile = document.querySelector("#tile-pulse");
    const grid = document.querySelector(".ghgrid");
    const read = document.querySelector("#gh-read");
    const visible = (el) => {
      if (!el || el.hidden || el.closest("[hidden]")) return false;
      const cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden";
    };
    if (!tile || !visible(tile) || !grid || !visible(grid)) {
      return { skipped: true, reason: "heatmap not shown" };
    }
    if (!read) {
      return { skipped: false, reason: "#gh-read missing", defaultText: null, afterClick: null, afterLeave: null };
    }
    const cell = grid.querySelector(".hc[data-d]");
    if (!cell) {
      return { skipped: false, reason: "no .ghgrid .hc[data-d] cell", defaultText: read.textContent, afterClick: null, afterLeave: null };
    }
    const defaultText = read.textContent;
    try { cell.scrollIntoView({ block: "center", inline: "nearest" }); } catch { /* layout */ }
    cell.click();
    const afterClick = read.textContent;
    grid.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true, cancelable: true }));
    const afterLeave = read.textContent;
    return {
      skipped: false,
      reason: null,
      defaultText,
      afterClick,
      afterLeave,
      painted: afterClick !== defaultText,
      held: afterLeave === afterClick && afterClick !== defaultText,
    };
  });
}

export async function stageCheck(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      if (!el || el.hidden || el.closest("[hidden]")) return false;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      return true;
    };
    const displayOf = (el) => (el ? getComputedStyle(el).display : null);
    const stage = document.querySelector(".artifact-stage");
    const gate = document.querySelector("#stage-gate");
    const below = document.querySelector("#artifact-open-below");
    const open = document.querySelector("#artifact-open");
    const frame = document.querySelector("#artifact-frame");
    const empty = document.querySelector("#artifact-empty");
    const previewShowing = !!(frame && visible(frame) && (frame.getAttribute("src") || frame.src));
    const fallbackShowing = !!(empty && visible(empty));
    const stageH = stage ? Math.round(stage.getBoundingClientRect().height) : null;
    const before = {
      gatePresent: !!gate,
      gateVisible: !!(gate && visible(gate)),
      gateDisplay: displayOf(gate),
      belowPresent: !!below,
      belowVisible: !!(below && visible(below)),
      belowDisplay: displayOf(below),
      belowHref: below ? (below.getAttribute("href") || below.href || "") : null,
      openHref: open ? (open.getAttribute("href") || open.href || "") : null,
      live: !!(stage && stage.classList.contains("live")),
    };
    let afterTap = null;
    if (gate && visible(gate)) {
      gate.click();
      afterTap = {
        live: !!(stage && stage.classList.contains("live")),
        gateVisible: visible(gate),
      };
    }
    return {
      innerWidth: window.innerWidth,
      stagePresent: !!stage,
      stageH,
      previewShowing,
      fallbackShowing,
      before,
      afterTap,
    };
  });
}

export async function tileWidths(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      if (!el || el.hidden || el.closest("[hidden]")) return false;
      const cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden";
    };
    const vw = window.innerWidth;
    const bento = document.querySelector(".bento");
    const tiles = [...document.querySelectorAll(".bento > .tile")].filter(visible).map((t) => ({
      cls: [...t.classList].find((c) => c.startsWith("t-")) || t.className,
      wide: t.classList.contains("wide"),
      w: Math.round(t.getBoundingClientRect().width),
    }));
    return {
      innerWidth: vw,
      clientWidth: document.documentElement.clientWidth,
      media700: window.matchMedia("(max-width:700px)").matches,
      media880: window.matchMedia("(max-width:880px)").matches,
      bentoCols: bento ? getComputedStyle(bento).gridTemplateColumns.split(" ").filter(Boolean).length : null,
      full: vw - 20,
      pair: (vw - 30) / 2,
      tiles,
    };
  });
}
