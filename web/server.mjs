import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { codexConfigured, fetchCloses, fetchSparklines, fetchCapxSolChart, fetchOhlcv, rangeForResolution, SOLANA_NETWORK_ID } from "./codex.mjs";
import { buildHeatmap } from "./timegrid.mjs";
import { isMint, joinDirectory, publicRow } from "./join.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 4200);
const launchpadApi = (process.env.LAUNCHPAD_API ?? "https://api.launchpad.capx.ai").replace(/\/$/, "");
const casaApi = (process.env.CASA_API ?? "http://127.0.0.1:4201").replace(/\/$/, "");
const sample = process.env.SAMPLE === "1";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const casaCache = new Map();
const CASA_TTL_MS = 300_000;
const barsCache = new Map();
const BARS_TTL_MS = 120_000;
let sparkCache = { at: 0, key: "", value: { error: null, byMint: {} } };
const capxChartCache = new Map();
let listCache = { at: 0, value: null, error: null };
let companiesCache = { at: 0, value: null, error: null };
const LIST_TTL_MS = 60_000;
let capxCache = { at: 0, value: null, error: null };

function sendJson(response, status, body, maxAge) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": `public, max-age=${maxAge}`,
  });
  response.end(JSON.stringify(body));
}

async function fetchJson(url, timeoutMs = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { accept: "application/json" } });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: "INVALID_JSON", message: text.slice(0, 200) };
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

const SAMPLE_ROWS = [
  {
    id: "sample-live-prog",
    agentMint: "FixLiveProg111111111111111111capx",
    name: "Fixture Live",
    symbol: "LIVE",
    logoUrl: "/brand/capx-logo.png",
    description: "Localhost fixture. Bound, with pushes. Not a live Launchpad mint.",
    state: "COMPLETED",
    fundraisingDeadlineAt: null,
    qualifyingNetCapxBase: "0",
    participantCount: 0,
    poolAddress: "FixturePool111111111111111111111111111",
    marketPerformance: {
      launchValuationUsd: 200000,
      currentMarketCapUsd: 240000,
      volume24hUsd: 12000,
      liquidityUsd: 80000,
      priceChange24hPercent: 4.2,
      asOf: "2026-08-20T03:00:00Z",
      stale: false,
    },
    links: {},
    sample: true,
  },
  {
    id: "sample-live-none",
    agentMint: "FixLiveNone111111111111111111capx",
    name: "Fixture Unobserved",
    symbol: "NONE",
    logoUrl: "/brand/capx-logo.png",
    description: "Localhost fixture. Bound, never pushed.",
    state: "FUNDRAISING",
    fundingFinalizedAt: new Date(Date.now() - 16 * 3600 * 1000).toISOString(),
    fundraisingDeadlineAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    qualifyingNetCapxBase: "125000000000",
    participantCount: 4,
    poolAddress: null,
    marketPerformance: null,
    links: {},
    sample: true,
  },
  {
    id: "sample-released",
    agentMint: "FixRefunded111111111111111111capx",
    name: "Fixture Released",
    symbol: "REL",
    logoUrl: "/brand/capx-logo.png",
    description: "Localhost fixture. Casa released after a failed launch.",
    state: "REFUNDED",
    fundraisingDeadlineAt: "2026-08-19T13:21:45.000Z",
    qualifyingNetCapxBase: "48000000000",
    participantCount: 1,
    poolAddress: null,
    marketPerformance: null,
    links: {},
    sample: true,
  },
  {
    id: "sample-rebind",
    agentMint: "FixRebind11111111111111111111capx",
    name: "Fixture Rebind",
    symbol: "BIND",
    logoUrl: "/brand/capx-logo.png",
    description: "Localhost fixture. Live Casa key changed once.",
    state: "COMPLETED",
    fundraisingDeadlineAt: null,
    qualifyingNetCapxBase: "0",
    participantCount: 0,
    poolAddress: "FixturePool222222222222222222222222222",
    marketPerformance: {
      launchValuationUsd: 150000,
      currentMarketCapUsd: 110000,
      volume24hUsd: 4000,
      liquidityUsd: 50000,
      priceChange24hPercent: -6.1,
      asOf: "2026-08-20T03:00:00Z",
      stale: false,
    },
    links: {},
    sample: true,
  },
  {
    id: "sample-aging",
    agentMint: "FixAging111111111111111111111capx",
    name: "Fixture Aging",
    symbol: "AGE",
    logoUrl: "/brand/capx-logo.png",
    description: "Localhost fixture. Last observation is aging.",
    state: "COMPLETED",
    fundraisingDeadlineAt: null,
    qualifyingNetCapxBase: "0",
    participantCount: 0,
    poolAddress: "FixturePool333333333333333333333333333",
    marketPerformance: {
      launchValuationUsd: 90000,
      currentMarketCapUsd: 88000,
      volume24hUsd: 900,
      liquidityUsd: 22000,
      priceChange24hPercent: 0.4,
      asOf: "2026-08-20T03:00:00Z",
      stale: true,
    },
    links: {},
    sample: true,
  },
  {
    id: "11111111-1111-4111-8111-111111111111",
    agentMint: "2CasaCoMint11111111111111111capx",
    name: "InboxPilot",
    symbol: "INBOX",
    logoUrl: "/brand/capx-logo.png",
    description: "Localhost fixture. Casa company with a Launchpad token.",
    state: "COMPLETED",
    fundraisingDeadlineAt: null,
    qualifyingNetCapxBase: "0",
    participantCount: 0,
    poolAddress: "FixturePool444444444444444444444444444",
    marketPerformance: {
      launchValuationUsd: 200000,
      currentMarketCapUsd: 240000,
      volume24hUsd: 12000,
      liquidityUsd: 80000,
      priceChange24hPercent: 4.2,
      asOf: "2026-08-20T03:00:00Z",
      stale: false,
    },
    links: {},
    sample: true,
  },
];

const SAMPLE_COMPANIES = [
  {
    company_id: "8f3c1a2e-4b5d-4c6a-9e1f-0a1b2c3d4e5f",
    slug: "inboxpilot",
    name: "InboxPilot",
    description: "Turns a founder inbox into a triage queue so nothing important sits unread.",
    logo: "https://inboxpilot.casa.capx.ai/logo.png",
    category: "developer-tools",
    visibility: "public",
    published_at: "2026-08-21T10:00:00Z",
    agent_mint: "2CasaCoMint11111111111111111capx",
    canonical_url: "https://inboxpilot.casa.capx.ai",
    readiness_ready: true,
    health_score: 78,
    freshness: "fresh",
  },
  {
    company_id: "1a2b3c4d-5e6f-4789-8abc-def012345678",
    slug: "northstar-labs",
    name: "Northstar Labs",
    description: "A research notebook that keeps one north star in front of the founder.",
    logo: "https://northstar-labs.casa.capx.ai/logo.png",
    category: "productivity",
    visibility: "public",
    published_at: "2026-08-21T11:00:00Z",
    agent_mint: null,
    canonical_url: "https://northstar-labs.casa.capx.ai",
    readiness_ready: true,
    health_score: 64,
    freshness: "aging",
  },
];

async function loadDirectory() {
  const now = Date.now();
  if (listCache.value && now - listCache.at < LIST_TTL_MS) return listCache;
  const items = [];
  let cursor = null;
  let error = null;
  try {
    for (let i = 0; i < 20; i++) {
      const qs = new URLSearchParams({ filter: "all", limit: "100" });
      if (cursor) qs.set("cursor", cursor);
      const res = await fetchJson(`${launchpadApi}/v1/projects?${qs}`);
      if (!res.ok) {
        error = (res.data && (res.data.message || res.data.error)) || `Launchpad directory HTTP ${res.status}`;
        break;
      }
      const page = Array.isArray(res.data?.items) ? res.data.items : [];
      items.push(...page);
      cursor = res.data?.nextCursor ?? null;
      if (!cursor) break;
    }
  } catch (err) {
    error = err.name === "AbortError" ? "Launchpad directory timed out" : String(err.message || err);
  }
  listCache = { at: now, value: items, error };
  return listCache;
}

async function loadCompanies() {
  const now = Date.now();
  if (companiesCache.value && now - companiesCache.at < LIST_TTL_MS) return companiesCache;
  const items = [];
  let cursor = null;
  let error = null;
  try {
    for (let i = 0; i < 20; i++) {
      const qs = new URLSearchParams({ limit: "100" });
      if (cursor) qs.set("cursor", cursor);
      const res = await fetchJson(`${casaApi}/v1/companies?${qs}`);
      if (!res.ok) {
        error = (res.data && (res.data.message || res.data.error)) || `Casa companies HTTP ${res.status}`;
        break;
      }
      const page = Array.isArray(res.data?.companies) ? res.data.companies : [];
      items.push(...page);
      cursor = res.data?.next_cursor ?? res.data?.nextCursor ?? null;
      if (!cursor) break;
    }
  } catch (err) {
    error = err.name === "AbortError" ? "Casa companies timed out" : String(err.message || err);
  }
  companiesCache = { at: now, value: items, error };
  return companiesCache;
}

async function loadCapx() {
  const now = Date.now();
  if (capxCache.value && now - capxCache.at < LIST_TTL_MS) return capxCache;
  try {
    const res = await fetchJson(`${launchpadApi}/v1/market-data/capx`);
    if (!res.ok) {
      capxCache = {
        at: now,
        value: null,
        error: (res.data && (res.data.message || res.data.error)) || `CAPX quote HTTP ${res.status}`,
      };
    } else {
      capxCache = { at: now, value: res.data, error: null };
    }
  } catch (err) {
    capxCache = {
      at: now,
      value: null,
      error: err.name === "AbortError" ? "CAPX quote timed out" : String(err.message || err),
    };
  }
  return capxCache;
}

async function loadCasa(mint) {
  const now = Date.now();
  const hit = casaCache.get(mint);
  if (hit && now - hit.at < CASA_TTL_MS) return hit;
  let result;
  try {
    const res = await fetchJson(`${casaApi}/v1/tokens/${encodeURIComponent(mint)}`);
    result = {
      at: now,
      status: res.status,
      document: res.status === 200 ? res.data : null,
      error: res.status === 200 ? null : (res.data && res.data.error) || `CASA_HTTP_${res.status}`,
      message: res.status === 200 ? null : (res.data && res.data.message) || null,
    };
  } catch (err) {
    result = {
      at: now,
      status: 404,
      document: null,
      error: "CASA_UNAVAILABLE",
      message: err.name === "AbortError" ? "Casa timed out" : String(err.message || err),
    };
  }
  casaCache.set(mint, result);
  return result;
}

async function loadBars(mint, heatmap) {
  if (!codexConfigured()) {
    return { source: "codex", points: [], error: "CODEX_API_KEY_MISSING" };
  }
  const spec = (heatmap && heatmap.spec) || { kind: "1d", bucketMs: 86400000, codexResolution: "1D" };
  const startMs = heatmap && heatmap.buckets && heatmap.buckets[0] ? heatmap.buckets[0].t : Date.now() - 180 * 86400000;
  const cacheKey = `${mint}:${spec.codexResolution}:${startMs}`;
  const now = Date.now();
  const hit = barsCache.get(cacheKey);
  if (hit && now - hit.at < BARS_TTL_MS) return hit.value;
  const value = await fetchCloses(mint, {
    fromMs: startMs,
    toMs: now,
    resolution: spec.codexResolution || "1D",
  });
  barsCache.set(cacheKey, { at: now, value });
  return value;
}

async function loadSparks(rows) {
  const live = rows.filter((row) => !row.sample);
  if (!live.length) return { error: null, byMint: {} };
  const groups = new Map();
  for (const row of live) {
    const spec = (row.heatmap && row.heatmap.spec) || { sparkResolution: "1D", bucketMs: 86400000 };
    const res = spec.sparkResolution || "1D";
    const startMs = row.heatmap && row.heatmap.buckets && row.heatmap.buckets[0]
      ? row.heatmap.buckets[0].t
      : Date.now() - 7 * 86400000;
    const key = `${res}:${startMs}`;
    if (!groups.has(key)) groups.set(key, { resolution: res, fromMs: startMs, mints: [] });
    groups.get(key).mints.push(row.mint);
  }
  const byMint = {};
  let error = null;
  for (const group of groups.values()) {
    const value = await fetchSparklines(group.mints, {
      fromMs: group.fromMs,
      toMs: Date.now(),
      resolution: group.resolution,
    });
    if (value.error) error = value.error;
    Object.assign(byMint, value.byMint);
  }
  return { error, byMint };
}

async function loadMintChart(mint, resolution = "60") {
  if (!codexConfigured()) {
    return { source: "codex", candles: [], points: [], error: "CODEX_API_KEY_MISSING", resolution };
  }
  const now = Date.now();
  const cacheKey = `ohlcv:${mint}:${resolution}`;
  const hit = barsCache.get(cacheKey);
  if (hit && now - hit.at < BARS_TTL_MS) return hit.value;
  const range = rangeForResolution(resolution);
  const value = await fetchOhlcv(`${mint}:${SOLANA_NETWORK_ID}`, {
    ...range,
    resolution,
  });
  barsCache.set(cacheKey, { at: now, value });
  return value;
}

async function loadCapxDemo(resolution = "60") {
  const now = Date.now();
  const hit = capxChartCache.get(resolution);
  if (hit && now - hit.at < BARS_TTL_MS) return hit.value;
  const value = await fetchCapxSolChart(resolution);
  capxChartCache.set(resolution, { at: now, value });
  return value;
}

async function loadDetail(projectId) {
  if (!projectId || String(projectId).startsWith("sample-")) return null;
  try {
    const res = await fetchJson(`${launchpadApi}/v1/projects/${encodeURIComponent(projectId)}`);
    if (!res.ok) return null;
    return res.data?.project ?? res.data;
  } catch {
    return null;
  }
}

function previewPriceSeries(seed) {
  const n = 72;
  const bucketMs = 3600_000;
  const end = Date.now();
  const start = end - (n - 1) * bucketMs;
  let s = 11;
  const text = String(seed || "preview");
  for (let i = 0; i < text.length; i++) s = (Math.imul(s, 31) + text.charCodeAt(i)) >>> 0;
  let px = 0.00038;
  const points = [];
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const wave = Math.sin(i / 9) * 0.012;
    const noise = (s / 4294967296 - 0.5) * 0.03;
    px = Math.max(1e-7, px * (1 + wave + noise));
    const ms = start + i * bucketMs;
    const iso = new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
    points.push({
      t: Math.floor(ms / 1000),
      iso,
      date: iso,
      usd: Number(px.toPrecision(6)),
    });
  }
  return {
    source: "codex-preview",
    preview: true,
    resolution: "60",
    asOf: new Date().toISOString(),
    points,
    error: null,
  };
}

function attachCasa(row, casa) {
  return {
    ...row,
    casa: {
      status: casa.status,
      error: casa.error,
      message: casa.message,
      document: casa.document,
    },
  };
}

async function marketPayload() {
  const [dir, casaDir, quote] = await Promise.all([
    loadDirectory(),
    loadCompanies(),
    loadCapx(),
  ]);
  const live = (dir.value || []).map(publicRow).filter(Boolean);
  const launchpad = sample ? live.concat(SAMPLE_ROWS.map(publicRow).filter(Boolean)) : live;
  const companies = sample
    ? [...(casaDir.value || []), ...SAMPLE_COMPANIES]
    : (casaDir.value || []);
  const rows = joinDirectory(companies, launchpad);
  const sparks = await loadSparks(launchpad);
  const tokens = launchpad.map((row) => ({
    ...row,
    sparkline: row.sample ? null : sparks.byMint[row.mint] || null,
  }));
  return {
    sample,
    generatedAt: new Date().toISOString(),
    capx: quote.value,
    capxError: quote.error,
    directoryError: dir.error,
    casaError: casaDir.error,
    casaOrigin: casaApi,
    codex: {
      configured: codexConfigured(),
      sparkError: sparks.error || null,
    },
    tokens,
    rows,
  };
}

async function tokenPayload(mint) {
  if (!isMint(mint)) {
    return { status: 400, body: { error: "INVALID_MINT", message: "Mint must be Solana base58 ending in capx" } };
  }
  const market = await marketPayload();
  let row = market.tokens.find((t) => t.mint === mint);
  if (!row) {
    return { status: 404, body: { error: "TOKEN_NOT_LISTED", message: "No public Launchpad row for this mint" } };
  }
  const [detail, casa] = await Promise.all([loadDetail(row.id), loadCasa(mint)]);
  if (detail) {
    row = {
      ...row,
      description: detail.description ?? row.description,
      poolAddress: detail.poolAddress ?? row.poolAddress,
      marketPerformance: detail.marketPerformance ?? row.marketPerformance,
      links: detail.links ?? row.links,
      agentDecimals: detail.agentDecimals,
      capxDecimals: detail.capxDecimals,
    };
  }
  row = attachCasa(row, casa);
  row.heatmap = buildHeatmap(row, casa && casa.document);
  let priceSeries = row.sample
    ? { source: "codex", candles: [], points: [], error: "SAMPLE_MINT" }
    : await loadMintChart(row.mint, "60");
  return {
    status: 200,
    body: {
      sample: market.sample,
      generatedAt: market.generatedAt,
      capx: market.capx,
      capxError: market.capxError,
      casaOrigin: market.casaOrigin,
      codex: {
        configured: codexConfigured(),
        error: priceSeries.error || null,
      },
      token: {
        ...row,
        priceSeries,
      },
    },
  };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname.includes("..")) {
    response.writeHead(400).end("bad path");
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/market") {
    try {
      sendJson(response, 200, await marketPayload(), 60);
    } catch (err) {
      sendJson(response, 500, { error: "MARKET_FAILED", message: String(err.message || err) }, 5);
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/chart/demo") {
    const resolution = url.searchParams.get("resolution") || "60";
    const allowed = new Set(["15", "60", "240", "1D"]);
    const res = allowed.has(resolution) ? resolution : "60";
    try {
      const demo = await loadCapxDemo(res);
      sendJson(response, demo.candles && demo.candles.length ? 200 : 503, { ...demo, demo: true }, 60);
    } catch (err) {
      sendJson(response, 500, { error: "CHART_FAILED", message: String(err.message || err) }, 5);
    }
    return;
  }

  const mintChart = url.pathname.match(/^\/api\/chart\/([^/]+)$/);
  if (request.method === "GET" && mintChart && mintChart[1] !== "demo") {
    const mint = decodeURIComponent(mintChart[1]);
    const resolution = url.searchParams.get("resolution") || "60";
    const allowed = new Set(["15", "60", "240", "1D"]);
    const res = allowed.has(resolution) ? resolution : "60";
    if (!isMint(mint)) {
      sendJson(response, 400, { error: "INVALID_MINT", message: "Mint must end in capx" }, 5);
      return;
    }
    try {
      const series = await loadMintChart(mint, res);
      sendJson(response, 200, series, 60);
    } catch (err) {
      sendJson(response, 500, { error: "CHART_FAILED", message: String(err.message || err) }, 5);
    }
    return;
  }

  const tokenApi = url.pathname.match(/^\/api\/tokens\/([^/]+)$/);
  if (request.method === "GET" && tokenApi) {
    const mint = decodeURIComponent(tokenApi[1]);
    try {
      const result = await tokenPayload(mint);
      sendJson(response, result.status, result.body, 300);
    } catch (err) {
      sendJson(response, 500, { error: "TOKEN_FAILED", message: String(err.message || err) }, 5);
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      status: "ok",
      sample,
      casaApi,
      launchpadApi,
      codex: codexConfigured(),
    }, 5);
    return;
  }

  let relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  if (/^t\/[^/]+$/.test(relative)) relative = "token.html";
  if (relative === "server.mjs" || relative === "codex.mjs" || relative === "timegrid.mjs" || relative.endsWith(".md")) {
    response.writeHead(404).end("not found");
    return;
  }
  try {
    const body = await readFile(join(root, relative));
    response.writeHead(200, {
      "content-type": types[extname(relative)] ?? "application/octet-stream",
      "cache-control": extname(relative) === ".html" ? "no-store" : "public, max-age=60",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end("not found");
  }
});

const host = process.env.HOST ?? "127.0.0.1";
server.listen(port, host, () => {
  const addr = server.address();
  const bound = typeof addr === "object" && addr ? addr.port : port;
  process.stdout.write(
    `capx terminal http://${host}:${bound}/  casa=${casaApi}  sample=${sample ? "on" : "off"}\n`,
  );
});
