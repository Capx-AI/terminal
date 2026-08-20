const base = process.env.TERMINAL_URL ?? "http://127.0.0.1:4200";
const casa = process.env.CASA_API ?? "http://127.0.0.1:4201";

async function get(url) {
  const res = await fetch(url);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const market = await get(`${base}/api/market`);
assert(market.status === 200, "market 200");
assert(market.data.sample === true, "SAMPLE pill payload");
assert(Array.isArray(market.data.tokens) && market.data.tokens.length >= 7, "live + fixtures");
assert(market.data.capx && typeof market.data.capx.capxUsd === "number", "CAPX quote");
assert(market.data.codex && typeof market.data.codex.configured === "boolean", "codex flag");

const bySym = Object.fromEntries(market.data.tokens.map((t) => [t.symbol, t]));
assert(bySym.XY && bySym.XY.casa.status === 404, "XY unbound");
assert(bySym.XX && bySym.XX.state === "REFUNDED", "XX refunded listed");
assert(bySym.LIVE.casa.document.attestation.attested === true, "LIVE attested");
assert(bySym.LIVE.casa.document.attestation.health_score === 78, "health as returned");
assert(bySym.NONE.casa.document.progress === null, "NONE no fake zero");
assert(bySym.NONE.casa.document.attestation.freshness === "unobserved", "NONE unobserved");
assert(bySym.REL.casa.document.binding.status === "released", "REL released");
assert(bySym.BIND.casa.document.binding.continuity_break === true, "BIND break");
assert(bySym.AGE.casa.document.attestation.freshness === "aging", "AGE aging");

const xy = await get(`${base}/api/tokens/${bySym.XY.mint}`);
assert(xy.status === 200 && xy.data.token.casa.status === 404, "XY token page data, no Casa");
assert(xy.data.token.qualifyingNetCapxBase, "XY raise facts");
assert(xy.data.token.heatmap && xy.data.token.heatmap.spec, "heatmap spec");
assert(["1h", "4h", "1d"].includes(xy.data.token.heatmap.spec.kind), "heatmap kind");
if (xy.data.token.heatmap.spec.kind === "1h") {
  assert(xy.data.token.heatmap.buckets.length <= 48, "hourly window is the project lifetime, not 180 days");
}
assert(xy.data.token.priceSeries && Array.isArray(xy.data.token.priceSeries.points), "priceSeries object");
const firstLive = market.data.tokens.find((t) => !t.sample);
if (firstLive) {
  const liveTok = await get(`${base}/api/tokens/${firstLive.mint}`);
  assert(liveTok.data.token.priceSeries, "live token has priceSeries");
  assert(!liveTok.data.token.priceSeries.demo, "CAPX/SOL stand-in is off");
}
if (xy.data.token.priceSeries.preview) {
  assert(xy.data.token.priceSeries.points.length >= 2, "preview series has points");
} else if (xy.data.codex && xy.data.codex.configured === false) {
  assert(xy.data.token.priceSeries.error === "CODEX_API_KEY_MISSING", "missing key is explicit");
}

const live = await get(`${base}/api/tokens/${bySym.LIVE.mint}`);
assert(live.status === 200 && live.data.token.casa.document.attestation.attested === true, "LIVE token");
const liveDoc = live.data.token.casa.document;
assert(liveDoc.attestation.health_score === 78, "health equals Casa JSON");
assert(Array.isArray(liveDoc.calendar.days) && liveDoc.calendar.days.length === 180, "Casa calendar 180 days");
assert(live.data.token.heatmap.spec.kind === "1d", "old fixture stays daily");
assert(live.data.token.heatmap.buckets.length <= 180, "daily cap 180");
assert(liveDoc.ledger && Array.isArray(liveDoc.ledger.shown), "ledger shown");
assert(liveDoc.ledger.shown.every((row) => !Object.prototype.hasOwnProperty.call(row, "note")), "ledger has no note");
assert(liveDoc.progress && liveDoc.progress.work && liveDoc.progress.work.tasks_7d === 42, "tasks_7d");
assert(liveDoc.reproduced && liveDoc.reproduced.coverage_bp === 8471, "coverage_bp");
assert(liveDoc.pay && liveDoc.pay.pay_attested === false, "pay absent");

const none = await get(`${base}/api/tokens/${bySym.NONE.mint}`);
assert(none.data.token.casa.document.progress === null, "unobserved progress null");
assert(none.data.token.casa.document.attestation.freshness === "unobserved", "unobserved freshness");
assert(none.data.token.casa.document.attestation.health_score == null, "unobserved health not zero");
assert(none.data.token.heatmap.spec.kind === "1h", "day-old fixture uses hourly heatmap");
assert(none.data.token.heatmap.buckets.length <= 48, "hourly fixture is not 180 cells");

const missing = await get(`${casa}/v1/tokens/${bySym.XY.mint}`);
assert(missing.status === 404 && missing.data.error === "TOKEN_NOT_BOUND", "mock 404");

const bad = await get(`${casa}/v1/tokens/nope`);
assert(bad.status === 400 && bad.data.error === "INVALID_MINT", "mock 400");

const home = await get(`${base}/`);
assert(home.status === 200 && String(home.data).includes("Healthiest companies"), "market html");
assert(String(home.data).includes("Sample data"), "pill chrome");
assert(!String(home.data).includes("win_definition"), "no win_definition");
assert(!/yield|profit|equity/i.test(String(home.data)), "no yield copy on market");

const page = await get(`${base}/t/${bySym.XY.mint}`);
assert(page.status === 200 && String(page.data).includes("Back to market"), "token html");
assert(String(page.data).includes("tile-work"), "token has work tile chrome");
assert(String(page.data).includes("ghgrid"), "token has heatmap chrome");
assert(!/yield|profit|equity/i.test(String(page.data)), "no yield copy on token html");

const liveHtml = await get(`${base}/t/${bySym.LIVE.mint}`);
assert(liveHtml.status === 200, "LIVE token html");
assert(String(liveHtml.data).includes("founder claimed"), "constraint labeled claimed");

process.stdout.write("e2e ok\n");
