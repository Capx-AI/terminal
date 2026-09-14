import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { codexConfigured, fetchCloses, fetchSparklines, fetchCapxSolChart, fetchOhlcv, rangeForResolution, SOLANA_NETWORK_ID } from "./codex.mjs";
import { buildHeatmap } from "./timegrid.mjs";
import { isMint, joinDirectory, publicRow, launchpadV2Row, marketFromLaunchpad, sortMarketCap } from "./join.mjs";
import { companyRoute, proxyTarget, proxyCompany, safePath } from "./routes.mjs";
import {
  codeFromBody,
  parseRegisterBody,
  redeemErrorResponse,
  redeemSuccessResponse,
} from "./register.mjs";
import {
  SAMPLE_COMPANY_DOCS,
  companyErrorResponse,
  companyGateError,
  companyHref,
  isValidSlug,
  joinCompanyToken,
  mapCasaCompanyError,
  probeArtifacts,
  publicCompanyView,
  marketSurface,
  resolveCompanyIdentifier,
} from "./company.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 4200);
const launchpadApi = (process.env.LAUNCHPAD_API ?? "https://api.launchpad.capx.ai").replace(/\/$/, "");
const launchpadV2 = (process.env.LAUNCHPAD_V2_API ?? "https://launchpadv2.capx.ai/api/v1/tokens").replace(/\/$/, "");

// September 1, 2026 at 00:00 IST: the fixed official-launch boundary, mirrored
// from the launchpad's launch-visibility rule. Launches finalized before it
// (the August test wave) stay hidden; live presales and everything after show.
const OFFICIAL_LAUNCH_VISIBLE_FROM_MS = Date.parse("2026-08-31T18:30:00.000Z");

// Withdrawn or refunded launches hidden pending relaunch.
const HIDDEN_PROJECT_IDS = new Set([
  "6b3e9f95-833a-4d5f-978c-ad8d69a1ef60", // ARBTR: 2026-09-01 refund incident
]);
// The same launches by mint, for launchpadv2 rows (which carry no project id or finalized-at).
const HIDDEN_MINTS = new Set([
  "7Jm8ooey81sdfmKdagkuqCbVrHaetueGPj1FJR5Hcapx", // ARBTR
]);

function isOfficialLaunchVisible(item) {
  if (item?.id && HIDDEN_PROJECT_IDS.has(item.id)) return false;
  const finalizedAtMs = Date.parse(item?.fundingFinalizedAt ?? "");
  return Number.isFinite(finalizedAtMs) && finalizedAtMs >= OFFICIAL_LAUNCH_VISIBLE_FROM_MS;
}
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
const companySurfaceCache = new Map();
const LIST_TTL_MS = 60_000;
let capxCache = { at: 0, value: null, error: null };

function sendJson(response, status, body, maxAge) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": maxAge === "no-store" ? "no-store" : `public, max-age=${maxAge}`,
  });
  response.end(JSON.stringify(body));
}

function invalidateCompaniesSnapshot() {
  companiesCache = { at: 0, value: null, error: null };
  companySurfaceCache.clear();
}

function readRequestBody(request, limit = 4096) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    request.on("data", (c) => {
      n += c.length;
      if (n > limit) {
        const err = new Error("payload too large");
        err.code = "PAYLOAD_TOO_LARGE";
        request.destroy();
        reject(err);
      } else {
        chunks.push(c);
      }
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function fetchJson(url, timeoutMs = 8000, init = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const headers = { accept: "application/json", ...(init.headers || {}) };
    const res = await fetch(url, { ...init, headers, signal: ac.signal });
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

async function handleRegister(request, response) {
  let raw;
  try {
    raw = await readRequestBody(request);
  } catch {
    const fail = redeemErrorResponse("CODE_INVALID");
    sendJson(response, fail.status, fail.body, "no-store");
    return;
  }
  const parsed = parseRegisterBody(raw, request.headers["content-type"]);
  const code = parsed.invalid ? "" : codeFromBody(parsed);
  if (!code) {
    const fail = redeemErrorResponse("CODE_INVALID");
    sendJson(response, fail.status, fail.body, "no-store");
    return;
  }

  let res;
  try {
    res = await fetchJson(`${casaApi}/v1/companies/redeem`, 8000, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ code }),
    });
  } catch {
    const fail = redeemErrorResponse("CASA_UNAVAILABLE");
    sendJson(response, fail.status, fail.body, "no-store");
    return;
  }

  if (res.ok) {
    const ok = redeemSuccessResponse(res.data);
    if (ok.status === 200) invalidateCompaniesSnapshot();
    sendJson(response, ok.status, ok.body, "no-store");
    return;
  }

  const casaError = res.data && typeof res.data.error === "string" ? res.data.error : "CASA_UNAVAILABLE";
  const fail = redeemErrorResponse(casaError);
  sendJson(response, fail.status, fail.body, "no-store");
}

const SAMPLE_ROWS = [
  { id: "sample-unbound", agentMint: "FixUnbound1111111111111111111capx", name: "Fixture Unbound", symbol: "SOLO", description: "Localhost fixture. No company connected.", state: "COMPLETED", marketPerformance: { currentMarketCapUsd: 10000 }, sample: true },
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
  let primary = [];
  let primaryError = null;
  try {
    const res = await fetchJson(launchpadV2);
    const data = res.data;
    const rows = Array.isArray(data) ? data : data?.items ?? data?.tokens ?? data?.data?.tokens ?? data?.data;
    if (!res.ok || !Array.isArray(rows)) throw new Error("Launchpad v2 unavailable");
    primary = rows.map(launchpadV2Row).map(publicRow).filter((row) => row && !HIDDEN_MINTS.has(row.mint));
  } catch (err) { primaryError = String(err.message || err); }
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
  const seen = new Set(primary.map((row) => row.mint));
  const secondary = items.filter(isOfficialLaunchVisible).filter((row) => !seen.has(row.mint || row.agentMint));
  listCache = { at: now, value: primary.concat(secondary), error: primary.length ? null : error,
    sources: { launchpadv2: primaryError, launchpad: error } };
  return listCache;
}

async function loadCompanies() {
  const now = Date.now();
  if (companiesCache.value && now - companiesCache.at < (companiesCache.error ? 30_000 : LIST_TTL_MS)) return companiesCache;
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

async function loadCompanyBySlug(slug) {
  try {
    const res = await fetchJson(`${casaApi}/v1/companies/${encodeURIComponent(slug)}`);
    if (res.ok && res.data && typeof res.data === "object") {
      return { status: 200, document: res.data, error: null };
    }
    const mapped = mapCasaCompanyError(res.status, res.data);
    return { status: mapped.status, document: null, error: mapped.body.error };
  } catch (err) {
    return {
      status: 503,
      document: null,
      error: "CASA_UNAVAILABLE",
      message: err.name === "AbortError" ? "Casa timed out" : String(err.message || err),
    };
  }
}

function sampleCompanyDoc(slug, casa) {
  if (!sample || !SAMPLE_COMPANY_DOCS[slug]) return null;
  if (casa && casa.document) return null;
  if (casa && casa.error !== "NOT_FOUND" && casa.error !== "CASA_UNAVAILABLE") return null;
  return SAMPLE_COMPANY_DOCS[slug];
}

async function loadCompanySurface(slug) {
  if (!isValidSlug(slug)) return null;
  const now = Date.now();
  const hit = companySurfaceCache.get(slug);
  if (hit && now - hit.at < (hit.value ? LIST_TTL_MS : 30_000)) return hit.value;
  let value = null;
  try {
    const casa = await loadCompanyBySlug(slug);
    const doc = casa.document || sampleCompanyDoc(slug, casa);
    if (doc && !companyGateError(doc)) {
      const view = publicCompanyView(doc);
      const document = marketSurface(view);
      if (view && document) {
        value = {
          document,
          heatmap: view.calendar ? buildHeatmap(null, view) : null,
        };
      }
    }
  } catch {
    value = null;
  }
  companySurfaceCache.set(slug, { at: now, value });
  return value;
}

async function loadCompanySurfaces(rows) {
  const slugs = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const slug = row && row.company && row.company.slug;
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
  }
  const out = {};
  await Promise.all(slugs.map(async (slug) => {
    const value = await loadCompanySurface(slug);
    if (value) out[slug] = value;
  }));
  return out;
}

async function loadCasa(mint) {
  const now = Date.now();
  const hit = casaCache.get(mint);
  if (hit && now - hit.at < (hit.status === 200 ? CASA_TTL_MS : 30_000)) return hit;
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
  const rows = sortMarketCap(joinDirectory(companies, launchpad));
  const company_surfaces = await loadCompanySurfaces(rows);
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
    tokenSources: dir.sources,
    casaError: casaDir.error,
    casaOrigin: casaApi,
    codex: {
      configured: codexConfigured(),
      sparkError: sparks.error || null,
    },
    tokens,
    rows,
    company_surfaces,
  };
}

async function launchpadRows() {
  const dir = await loadDirectory();
  const live = Array.isArray(dir.value) ? dir.value : [];
  return sample ? live.concat(SAMPLE_ROWS) : live;
}

async function companyPayload(slug) {
  // A 32-character slug can also look like a mint: a company that owns the slug wins.
  if (isMint(slug) && !(await marketPayload()).rows.some((r) => r.company && r.company.slug === slug)) {
    const market = await marketPayload();
    const resolved = resolveCompanyIdentifier(slug, market.rows);
    if (!resolved) return { status: 404, body: { error: "TOKEN_NOT_LISTED", message: "No public Launchpad row for this mint" } };
    if (resolved.slug) return companyPayload(resolved.slug);
    const result = await tokenPayload(slug);
    if (result.status !== 200) return result;
    const token = result.body.token;
    return { status: 200, body: { ...result.body, kind: "token_without_company", company: null,
      face: token.casa?.document?.face || null, market: marketFromLaunchpad(token),
      priceSeries: token.priceSeries, heatmap: token.heatmap } };
  }
  if (!isValidSlug(slug)) {
    return { status: 404, body: companyErrorResponse("NOT_FOUND").body };
  }
  const casa = await loadCompanyBySlug(slug);
  let doc = casa.document;
  if (!doc && sample && SAMPLE_COMPANY_DOCS[slug] && (casa.error === "NOT_FOUND" || casa.error === "CASA_UNAVAILABLE")) {
    doc = SAMPLE_COMPANY_DOCS[slug];
  }
  if (!doc) {
    const fail = companyErrorResponse(casa.error || "NOT_FOUND");
    return { status: fail.status, body: fail.body };
  }
  const gated = companyGateError(doc);
  if (gated) {
    const fail = companyErrorResponse(gated);
    return { status: fail.status, body: fail.body };
  }
  const view = publicCompanyView(doc);
  if (!view) {
    const fail = companyErrorResponse("NOT_FOUND");
    return { status: fail.status, body: fail.body };
  }
  if (process.env.PROBE_ARTIFACTS !== "0") {
    view.artifacts = await probeArtifacts(view.artifacts);
  }
  const rows = await launchpadRows();
  const joined = joinCompanyToken(view, rows);
  let priceSeries = null;
  let heatmap = null;
  if (joined.row) {
    heatmap = buildHeatmap(joined.row, view);
    priceSeries = joined.row.sample
      ? { source: "codex", candles: [], points: [], error: "SAMPLE_MINT" }
      : await loadMintChart(joined.row.mint, "60");
  } else if (view.calendar) {
    heatmap = buildHeatmap(null, view);
  }
  return {
    status: 200,
    body: {
      sample,
      generatedAt: new Date().toISOString(),
      casaOrigin: casaApi,
      kind: joined.kind,
      company: view,
      face: view.face,
      token: joined.token,
      market: joined.market,
      token_href: joined.token_href,
      heatmap,
      priceSeries,
    },
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
  const [detail, casa] = await Promise.all([row.source === "launchpadv2" ? null : loadDetail(row.id), loadCasa(mint)]);
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
  const joined = (market.rows || []).find((r) => r.token && r.token.mint === mint && r.company && r.company.slug);
  const company_slug = joined && joined.company.slug ? joined.company.slug : null;
  return {
    status: 200,
    body: {
      sample: market.sample,
      generatedAt: market.generatedAt,
      capx: market.capx,
      capxError: market.capxError,
      casaOrigin: market.casaOrigin,
      company_slug,
      company_href: companyHref(company_slug),
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
  if (!safePath(request.url || "/")) { response.writeHead(400).end("bad path"); return; }
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname.includes("..")) {
    response.writeHead(400).end("bad path");
    return;
  }

  const target = proxyTarget(request.method, request.url || "/");
  if (target) {
    // A trailing slash lets relative collateral assets resolve under the proxy.
    if (/^\/[^/]+\/(site|one-pager|deck)$/.test(url.pathname)) {
      response.writeHead(301, { location: url.pathname + "/" + url.search }).end();
    } else await proxyCompany(target, response);
    return;
  }
  if (proxyTarget("GET", request.url || "/")) { response.writeHead(405, { allow: "GET" }).end(); return; }

  if (url.pathname === "/api/register") {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Use POST" }, "no-store");
      return;
    }
    try {
      await handleRegister(request, response);
    } catch {
      sendJson(response, 503, redeemErrorResponse("CASA_UNAVAILABLE").body, "no-store");
    }
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
      sendJson(response, result.status, result.body, result.body.token?.casa?.status === 200 ? 300 : 30);
    } catch (err) {
      sendJson(response, 500, { error: "TOKEN_FAILED", message: String(err.message || err) }, 5);
    }
    return;
  }

  const companyApi = url.pathname.match(/^\/api\/companies\/([^/]+)$/);
  if (request.method === "GET" && companyApi) {
    let slug;
    try {
      slug = decodeURIComponent(companyApi[1]);
    } catch {
      sendJson(response, 404, companyErrorResponse("NOT_FOUND").body, 5);
      return;
    }
    try {
      const result = await companyPayload(slug);
      const maxAge = result.body.company === null ? 30 : 60;
      sendJson(response, result.status, result.body, result.status === 200 ? maxAge : "no-store");
    } catch (err) {
      sendJson(response, 500, { error: "COMPANY_FAILED", message: String(err.message || err) }, 5);
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
  const route = companyRoute(url.pathname);
  if (route?.redirect) { response.writeHead(301, { location: route.redirect + url.search }).end(); return; }
  if (route) relative = "company.html";
  if (relative === "register" || relative === "register/") relative = "register.html";
  if (relative.endsWith(".mjs") || relative.endsWith(".md")) {
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
