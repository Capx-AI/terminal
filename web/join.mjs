/** Join Casa GET /v1/companies with Launchpad directory on nullable agent_mint. */

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

export function isMint(mint) {
  return (
    typeof mint === "string" &&
    mint.length >= 32 &&
    mint.length <= 44 &&
    BASE58.test(mint) &&
    mint.endsWith("capx")
  );
}

export function publicRow(item) {
  if (Object.hasOwn(item, "capxUsd")) item = launchpadV2Row(item);
  const mint = item.mint || item.agentMint;
  if (!mint || !isMint(mint)) return null;
  return {
    id: item.id,
    mint,
    name: item.name,
    symbol: item.symbol,
    logoUrl: item.logoUrl,
    description: item.description ?? "",
    creator: item.creator ?? null,
    source: item.source ?? "launchpad",
    state: item.state,
    fundraisingDeadlineAt: item.fundraisingDeadlineAt ?? null,
    fundingFinalizedAt: item.fundingFinalizedAt ?? null,
    qualifyingNetCapxBase: item.qualifyingNetCapxBase ?? null,
    participantCount: item.participantCount ?? 0,
    poolAddress: item.poolAddress ?? null,
    marketPerformance: item.marketPerformance ?? null,
    links: item.links ?? {},
    sample: item.sample === true,
  };
}

export function nullMarket() {
  return {
    price_usd: null,
    fdv_usd: null,
    volume_24h_usd: null,
    liquidity_usd: null,
    change_24h_percent: null,
  };
}

function numOrNull(n) {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function marketFromLaunchpad(item) {
  const mp = item && item.marketPerformance;
  if (!mp || typeof mp !== "object") return nullMarket();
  const fdv = numOrNull(mp.currentMarketCapUsd);
  return {
    price_usd: Object.hasOwn(mp, "priceUsd") ? numOrNull(mp.priceUsd) : (fdv == null ? null : fdv / 1e9),
    fdv_usd: fdv,
    volume_24h_usd: numOrNull(mp.volume24hUsd),
    liquidity_usd: numOrNull(mp.liquidityUsd),
    change_24h_percent: numOrNull(mp.priceChange24hPercent),
  };
}

export function launchpadV2Row(item) {
  // Catalog items carry mint, image, stage, price, marketCap and capxUsd; a row already in directory shape passes through.
  const quote = numOrNull(item.capxUsd);
  const usd = (value) => quote == null || numOrNull(value) == null ? null : numOrNull(value * quote);
  const mint = item.mint ?? item.agentMint;
  return { ...item, id: item.mint ?? item.id, mint, logoUrl: item.image ?? item.logoUrl ?? null, source: item.source ?? "launchpadv2",
    state: item.stage ? String(item.stage).toUpperCase() : (item.state ?? "LISTED"),
    marketPerformance: Object.hasOwn(item, "capxUsd") ? { priceUsd: usd(item.price), currentMarketCapUsd: usd(item.marketCap) } : (item.marketPerformance ?? null) };
}

export function sortMarketCap(rows) {
  return rows.sort((a, b) => {
    const x = numOrNull(a.market?.fdv_usd), y = numOrNull(b.market?.fdv_usd);
    return x == null ? (y == null ? 0 : 1) : y == null ? -1 : y - x;
  });
}

export function companySummary(company) {
  return {
    company_id: company.company_id,
    slug: company.slug,
    name: company.name,
    description: company.description,
    logo: company.logo,
    category: company.category,
    canonical_url: company.canonical_url,
    health_score: company.health_score == null ? null : company.health_score,
    freshness: company.freshness,
  };
}

export function tokenSummary(item) {
  const mint = item.mint || item.agentMint;
  return {
    mint,
    name: item.name,
    symbol: item.symbol,
    logo_url: item.logo_url ?? item.logoUrl ?? null,
    project_id: item.project_id || item.id,
    state: item.state,
  };
}

export function companyMint(company) {
  const mint = company && (company.agent_mint ?? company.agentMint ?? null);
  return mint || null;
}

export function tokenMint(item) {
  const mint = item && (item.mint || item.agentMint);
  return mint || null;
}

export function isPublicCompany(company) {
  if (!company || typeof company !== "object") return false;
  if (typeof company.company_id !== "string" || !company.company_id) return false;
  if (typeof company.slug !== "string" || !company.slug) return false;
  if (company.visibility !== "public") return false;
  const ready = company.readiness_ready === true
    || (company.readiness && company.readiness.ready === true);
  return ready === true;
}

/**
 * One pass join. Each company_id and each mint appears in at most one row.
 * Company with a mint that has no Launchpad row is company_without_token.
 * Tokenless market fields are null, never 0.
 */
export function joinDirectory(companies, tokens) {
  const list = Array.isArray(companies) ? companies : [];
  const launchpad = Array.isArray(tokens) ? tokens : [];
  const tokensByMint = new Map();
  for (const item of launchpad) {
    const mint = tokenMint(item);
    if (!mint || tokensByMint.has(mint)) continue;
    tokensByMint.set(mint, item);
  }

  const rows = [];
  const seenCompanies = new Set();
  const usedMints = new Set();

  for (const company of list) {
    if (!isPublicCompany(company)) continue;
    if (seenCompanies.has(company.company_id)) continue;
    seenCompanies.add(company.company_id);
    const mint = companyMint(company);
    const matched = mint ? tokensByMint.get(mint) : null;
    if (matched) {
      usedMints.add(tokenMint(matched));
      rows.push({
        kind: "company_with_token",
        company: companySummary(company),
        token: tokenSummary(matched),
        market: marketFromLaunchpad(matched),
      });
    } else {
      rows.push({
        kind: "company_without_token",
        company: companySummary(company),
        token: null,
        market: nullMarket(),
      });
    }
  }

  for (const item of launchpad) {
    const mint = tokenMint(item);
    if (!mint || usedMints.has(mint)) continue;
    usedMints.add(mint);
    rows.push({
      kind: "token_without_company",
      company: null,
      token: tokenSummary(item),
      market: marketFromLaunchpad(item),
    });
  }

  return rows;
}

export function kindCounts(rows) {
  const counts = {
    company_with_token: 0,
    company_without_token: 0,
    token_without_company: 0,
  };
  for (const row of rows) {
    if (row && counts[row.kind] != null) counts[row.kind] += 1;
  }
  return counts;
}

export const CATEGORY_FILTERS = [
  { id: "company_with_token", label: "Company + token" },
  { id: "company_without_token", label: "Company only" },
  { id: "token_without_company", label: "Token only" },
];

export const MARKET_KEYS = [
  "price_usd",
  "fdv_usd",
  "volume_24h_usd",
  "liquidity_usd",
  "change_24h_percent",
];

function str(v) {
  return v == null ? "" : String(v);
}

export function searchHaystack(row) {
  const company = row && row.company ? row.company : {};
  const token = row && row.token ? row.token : {};
  const casaCo = row && row.casa && row.casa.document && row.casa.document.company
    ? row.casa.document.company
    : {};
  return [
    company.name,
    company.slug,
    company.description,
    company.category,
    token.name,
    token.symbol,
    token.mint,
    row && row.name,
    row && row.symbol,
    row && row.mint,
    row && row.slug,
    row && row.description,
    row && row.category,
    casaCo.name,
    casaCo.slug,
  ].map(str).join(" ").toLowerCase();
}

export function matchesSearch(row, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return searchHaystack(row).includes(q);
}

export function matchesKind(row, kind) {
  if (!kind || kind === "all") return true;
  return !!(row && row.kind === kind);
}

export function healthValue(row) {
  if (!row) return null;
  const att = row.casa && row.casa.document && row.casa.document.attestation;
  if (att && typeof att.health_score === "number") return att.health_score;
  if (typeof row.healthScore === "number") return row.healthScore;
  if (row.company && typeof row.company.health_score === "number") return row.company.health_score;
  return null;
}

export function freshnessValue(row) {
  if (!row) return null;
  const att = row.casa && row.casa.document && row.casa.document.attestation;
  if (att && att.freshness) return att.freshness;
  if (row.freshness) return row.freshness;
  if (row.company && row.company.freshness) return row.company.freshness;
  return null;
}

export function hoursSinceValue(row) {
  const att = row && row.casa && row.casa.document && row.casa.document.attestation;
  const h = att && att.hours_since;
  return typeof h === "number" && Number.isFinite(h) ? h : null;
}

export function matchesHealth(row, filter) {
  if (!filter || filter === "all") return true;
  if (filter === "leaders") {
    const h = healthValue(row);
    return h != null && h >= 80;
  }
  if (filter === "fresh") {
    if (freshnessValue(row) === "fresh") return true;
    const hs = hoursSinceValue(row);
    return hs != null && hs <= 168;
  }
  if (filter === "review") {
    const band = freshnessValue(row);
    if (band === "stale" || band === "aging") return true;
    const doc = row && row.casa && row.casa.document;
    if (!doc) return false;
    if (doc.attestation && doc.attestation.attested === false) return true;
    if (doc.binding && doc.binding.continuity_break) return true;
    return false;
  }
  return true;
}

export function filterRows(rows, opts = {}) {
  const query = opts.query || "";
  const kind = opts.kind || "all";
  const health = opts.health || "all";
  return (Array.isArray(rows) ? rows : []).filter((row) => (
    matchesSearch(row, query)
    && matchesKind(row, kind)
    && matchesHealth(row, health)
  ));
}

export function honestMarket(row) {
  const empty = {
    price_usd: null,
    fdv_usd: null,
    volume_24h_usd: null,
    liquidity_usd: null,
    change_24h_percent: null,
  };
  if (!row || row.kind === "company_without_token") return empty;
  const m = row.market;
  if (!m || typeof m !== "object") return empty;
  const out = { ...empty };
  for (const key of MARKET_KEYS) {
    const v = m[key];
    out[key] = typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  return out;
}

export function marketDash(value) {
  return value == null ? "--" : value;
}

export function hrefForRow(row) {
  const mint = (row && row.token && row.token.mint) || (row && row.mint) || null;
  if (mint) return `/t/${encodeURIComponent(mint)}`;
  const slug = (row && row.company && row.company.slug) || (row && row.slug) || null;
  if (slug) return `/c/${encodeURIComponent(slug)}`;
  return null;
}
