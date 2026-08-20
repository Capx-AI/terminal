/** Codex GraphQL client (the API behind defined.fi). Key stays in process env. */

export const SOLANA_NETWORK_ID = 1399811149;
const ENDPOINT = "https://graph.codex.io/graphql";

export function codexConfigured() {
  return Boolean(process.env.CODEX_API_KEY);
}

function authHeader() {
  const key = process.env.CODEX_API_KEY || "";
  return key.startsWith("Bearer ") ? key : key;
}

async function graphql(query, variables, timeoutMs = 10000) {
  if (!codexConfigured()) {
    return { ok: false, error: "CODEX_API_KEY_MISSING", data: null };
  }
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "content-type": "application/json",
        authorization: authHeader(),
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error: `CODEX_HTTP_${res.status}`,
        data: json,
      };
    }
    if (json && Array.isArray(json.errors) && json.errors.length) {
      return {
        ok: false,
        error: json.errors[0].message || "CODEX_GRAPHQL",
        data: json.data || null,
      };
    }
    return { ok: true, error: null, data: json && json.data };
  } catch (err) {
    return {
      ok: false,
      error: err.name === "AbortError" ? "CODEX_TIMEOUT" : String(err.message || err),
      data: null,
    };
  } finally {
    clearTimeout(t);
  }
}

function utcDateFromUnix(sec) {
  const d = new Date(Number(sec) * 1000);
  if (!isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const BARS_QUERY = `
  query TokenBars($symbol: String!, $from: Int!, $to: Int!, $resolution: String!) {
    getTokenBars(
      symbol: $symbol
      from: $from
      to: $to
      resolution: $resolution
      currencyCode: USD
      removeLeadingNullValues: true
    ) {
      t
      o
      h
      l
      c
      volume
      s
    }
  }
`;

const PAIR_BARS_QUERY = `
  query PairBars($symbol: String!, $from: Int!, $to: Int!, $resolution: String!) {
    getBars(
      symbol: $symbol
      from: $from
      to: $to
      resolution: $resolution
      removeEmptyBars: true
    ) {
      t
      o
      h
      l
      c
      volume
    }
  }
`;

export const CAPX_MINT = "7AoBuYcGKQYadxc9wmGxpuu29bpC1EDQezkoXACWZRFF";
export const CAPX_SOL_POOL = "CBDLuFXmYFFvyCZhHmP9ugBNwHrxkumdUBjiGcx31HJo";

function packCandles(bars) {
  if (!bars) return [];
  const t = Array.isArray(bars.t) ? bars.t : [];
  const o = Array.isArray(bars.o) ? bars.o : [];
  const h = Array.isArray(bars.h) ? bars.h : [];
  const l = Array.isArray(bars.l) ? bars.l : [];
  const c = Array.isArray(bars.c) ? bars.c : [];
  const volume = Array.isArray(bars.volume) ? bars.volume : [];
  const candles = [];
  for (let i = 0; i < t.length; i++) {
    const ts = Number(t[i]);
    const close = Number(c[i]);
    const open = Number(o[i]);
    const high = Number(h[i]);
    const low = Number(l[i]);
    if (!isFinite(ts) || !isFinite(close)) continue;
    const iso = new Date(ts * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
    candles.push({
      t: ts,
      iso,
      date: iso,
      o: isFinite(open) ? open : close,
      h: isFinite(high) ? high : close,
      l: isFinite(low) ? low : close,
      c: close,
      usd: close,
      volume: Number(volume[i]) || 0,
    });
  }
  return candles;
}

export function rangeForResolution(resolution) {
  const now = Date.now();
  if (resolution === "15") return { fromMs: now - 3 * 86400000, toMs: now };
  if (resolution === "60") return { fromMs: now - 10 * 86400000, toMs: now };
  if (resolution === "240") return { fromMs: now - 40 * 86400000, toMs: now };
  return { fromMs: now - 180 * 86400000, toMs: now };
}

export async function fetchOhlcv(symbol, { fromMs, toMs, resolution = "60" } = {}) {
  const to = Math.floor((toMs || Date.now()) / 1000);
  const from = Math.floor((fromMs || Date.now() - 10 * 86400000) / 1000);
  let res = await graphql(PAIR_BARS_QUERY, { symbol, from, to, resolution });
  let bars = res.ok && res.data ? res.data.getBars : null;
  if (!bars || !Array.isArray(bars.t) || !bars.t.length) {
    res = await graphql(BARS_QUERY, { symbol, from, to, resolution });
    bars = res.ok && res.data ? res.data.getTokenBars : null;
  }
  const candles = packCandles(bars);
  return {
    source: "codex",
    symbol,
    resolution,
    asOf: new Date().toISOString(),
    candles,
    points: candles,
    error: candles.length ? null : (res.error || "CODEX_NO_BARS"),
  };
}

export async function fetchCapxSolChart(resolution = "60") {
  const range = rangeForResolution(resolution);
  const pair = await fetchOhlcv(`${CAPX_SOL_POOL}:${SOLANA_NETWORK_ID}`, {
    ...range,
    resolution,
  });
  if (pair.candles.length) {
    return { ...pair, pair: "CAPX/SOL", quote: "USD" };
  }
  const token = await fetchOhlcv(`${CAPX_MINT}:${SOLANA_NETWORK_ID}`, {
    ...range,
    resolution,
  });
  return { ...token, pair: "CAPX/SOL", quote: "USD" };
}

const SPARK_QUERY = `
  query TokenSparks($ids: [String!]!, $from: Int, $to: Int, $resolution: String) {
    tokenSparklines(input: { ids: $ids, from: $from, to: $to, resolution: $resolution }) {
      id
      sparkline {
        timestamp
        value
      }
    }
  }
`;

export function tokenSymbol(mint) {
  return `${mint}:${SOLANA_NETWORK_ID}`;
}

export async function fetchCloses(mint, { fromMs, toMs, resolution = "1D" } = {}) {
  const to = Math.floor((toMs || Date.now()) / 1000);
  const from = Math.floor((fromMs || Date.now() - 180 * 86400000) / 1000);
  const symbol = tokenSymbol(mint);
  const res = await graphql(BARS_QUERY, {
    symbol,
    from,
    to,
    resolution,
  });
  if (!res.ok || !res.data || !res.data.getTokenBars) {
    return {
      source: "codex",
      networkId: SOLANA_NETWORK_ID,
      resolution,
      points: [],
      error: res.error || "CODEX_EMPTY",
    };
  }
  const candles = packCandles(res.data.getTokenBars);
  return {
    source: "codex",
    networkId: SOLANA_NETWORK_ID,
    resolution,
    asOf: new Date().toISOString(),
    candles,
    points: candles,
    error: candles.length ? null : "CODEX_NO_BARS",
  };
}

export async function fetchDailyCloses(mint, dayCount = 180) {
  const toMs = Date.now();
  return fetchCloses(mint, {
    fromMs: toMs - dayCount * 86400000,
    toMs,
    resolution: "1D",
  });
}

export async function fetchSparklines(mints, { fromMs, toMs, resolution = "1D" } = {}) {
  const unique = [...new Set(mints.filter(Boolean))];
  if (!unique.length) return { error: null, byMint: {} };
  if (!codexConfigured()) return { error: "CODEX_API_KEY_MISSING", byMint: {} };
  const to = Math.floor((toMs || Date.now()) / 1000);
  const from = Math.floor((fromMs || Date.now() - 7 * 86400000) / 1000);
  const ids = unique.map(tokenSymbol);
  const res = await graphql(SPARK_QUERY, {
    ids,
    from,
    to,
    resolution,
  });
  if (!res.ok) return { error: res.error, byMint: {} };
  const rows = (res.data && res.data.tokenSparklines) || [];
  const byMint = {};
  for (const row of rows) {
    const id = String(row.id || "");
    const mint = id.split(":")[0];
    const spark = Array.isArray(row.sparkline) ? row.sparkline : [];
    byMint[mint] = spark
      .map((p) => ({
        t: Number(p.timestamp),
        usd: Number(p.value),
        date: utcDateFromUnix(p.timestamp),
      }))
      .filter((p) => p.date && isFinite(p.usd));
  }
  return { error: null, byMint };
}
