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
  const mint = item.mint || item.agentMint;
  if (!mint || !isMint(mint)) return null;
  return {
    id: item.id,
    mint,
    name: item.name,
    symbol: item.symbol,
    logoUrl: item.logoUrl,
    description: item.description ?? "",
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
    price_usd: fdv == null ? null : fdv / 1e9,
    fdv_usd: fdv,
    volume_24h_usd: numOrNull(mp.volume24hUsd),
    liquidity_usd: numOrNull(mp.liquidityUsd),
    change_24h_percent: numOrNull(mp.priceChange24hPercent),
  };
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
