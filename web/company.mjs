/** Company page helpers. Public GET only. Hidden artifact URLs never leave. */

import { marketFromLaunchpad, nullMarket, tokenSummary } from "./join.mjs";

export const SLUG_RE = /^[a-z0-9-]{1,32}$/;
export const ARTIFACT_TYPES = ["site", "one_pager", "deck"];
export const IFRAME_SANDBOX = "allow-scripts";

export const COMPANY_MESSAGES = Object.freeze({
  NOT_FOUND: "No such company",
  PRIVATE: "Company is not public",
  NOT_READY: "Company is not ready",
  CASA_UNAVAILABLE: "Casa is unavailable",
});

export const COMPANY_STATUS = Object.freeze({
  NOT_FOUND: 404,
  PRIVATE: 404,
  NOT_READY: 404,
  CASA_UNAVAILABLE: 503,
});

const CASA_ERRORS = new Set(["NOT_FOUND", "PRIVATE", "NOT_READY"]);

export function isValidSlug(slug) {
  return typeof slug === "string" && SLUG_RE.test(slug);
}

export function publicHostForSlug(slug) {
  return `https://${slug}.casa.capx.ai`;
}

export function isCasaPublicUrl(url, slug) {
  if (typeof url !== "string" || !isValidSlug(slug)) return false;
  if (/[\s'"<>\\]/.test(url)) return false;
  const host = publicHostForSlug(slug);
  return url === host || url.startsWith(`${host}/`);
}

export function companyErrorResponse(error) {
  const code = COMPANY_STATUS[error] ? error : "CASA_UNAVAILABLE";
  return {
    status: COMPANY_STATUS[code],
    body: { error: code, message: COMPANY_MESSAGES[code] },
  };
}

export function mapCasaCompanyError(status, data) {
  const raw = data && typeof data.error === "string" ? data.error : "";
  if (CASA_ERRORS.has(raw)) return companyErrorResponse(raw);
  if (status >= 500 || raw === "CASA_UNAVAILABLE") return companyErrorResponse("CASA_UNAVAILABLE");
  return companyErrorResponse("NOT_FOUND");
}

export function sanitizeArtifact(art, slug, visibility) {
  if (visibility === "private") return null;
  if (!art || typeof art !== "object") return null;
  if (art.visibility && art.visibility !== "public") return null;
  if (!isCasaPublicUrl(art.url, slug)) return null;
  return {
    url: art.url,
    version_id: typeof art.version_id === "string" && art.version_id ? art.version_id : null,
    visibility: "public",
  };
}

export function sanitizeArtifacts(artifacts, visibility, slug) {
  const vis = visibility && typeof visibility === "object" ? visibility : {};
  const src = artifacts && typeof artifacts === "object" ? artifacts : {};
  const out = {};
  for (const type of ARTIFACT_TYPES) {
    out[type] = sanitizeArtifact(src[type], slug, vis[type]);
  }
  return out;
}

export async function probeArtifact(art, fetchImpl = fetch, timeoutMs = 800) {
  if (!art || typeof art.url !== "string") return art;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(art.url, { method: "GET", redirect: "manual", signal: ctrl.signal });
    const ok = res.status >= 200 && res.status < 400;
    return { ...art, preview_ok: ok };
  } catch {
    return { ...art, preview_ok: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeArtifacts(artifacts, fetchImpl = fetch) {
  const src = artifacts && typeof artifacts === "object" ? artifacts : {};
  const out = { ...src };
  await Promise.all(ARTIFACT_TYPES.map(async (type) => {
    if (out[type]) out[type] = await probeArtifact(out[type], fetchImpl);
  }));
  return out;
}

export function sanitizeVersions(versions, artifacts) {
  const src = versions && typeof versions === "object" ? versions : {};
  const out = {};
  for (const type of ARTIFACT_TYPES) {
    out[type] = artifacts && artifacts[type] && typeof src[type] === "string" && src[type]
      ? src[type]
      : null;
  }
  return out;
}

function redactLedger(ledger) {
  if (!ledger || typeof ledger !== "object") return ledger == null ? null : ledger;
  const shown = Array.isArray(ledger.shown)
    ? ledger.shown.map((row) => {
      if (!row || typeof row !== "object") return row;
      const copy = { ...row };
      delete copy.note;
      delete copy.terminal;
      return copy;
    })
    : ledger.shown;
  return { ...ledger, shown };
}

function copyIfObject(value) {
  return value && typeof value === "object" ? value : null;
}

export function publicCompanyView(doc) {
  if (!doc || typeof doc !== "object") return null;
  if (!isValidSlug(doc.slug)) return null;
  if (doc.visibility && doc.visibility !== "public") return null;
  if (doc.readiness && doc.readiness.ready === false) return null;
  const slug = doc.slug;
  const artifacts = sanitizeArtifacts(doc.artifacts, doc.artifact_visibility, slug);
  const canonical = isCasaPublicUrl(doc.canonical_url, slug)
    ? doc.canonical_url
    : publicHostForSlug(slug);
  const logo = isCasaPublicUrl(doc.logo, slug) ? doc.logo : null;
  const vis = doc.artifact_visibility && typeof doc.artifact_visibility === "object"
    ? {
      site: doc.artifact_visibility.site === "private" ? "private" : "public",
      one_pager: doc.artifact_visibility.one_pager === "private" ? "private" : "public",
      deck: doc.artifact_visibility.deck === "private" ? "private" : "public",
    }
    : {
      site: artifacts.site ? "public" : "private",
      one_pager: artifacts.one_pager ? "public" : "private",
      deck: artifacts.deck ? "public" : "private",
    };
  return {
    company_id: doc.company_id ?? null,
    company_pubkey: typeof doc.company_pubkey === "string" ? doc.company_pubkey : null,
    slug,
    name: doc.name ?? null,
    description: doc.description ?? null,
    logo,
    category: doc.category ?? null,
    visibility: "public",
    published_at: doc.published_at ?? null,
    agent_mint: doc.agent_mint ?? null,
    launchpad_project_id: doc.launchpad_project_id ?? null,
    readiness: copyIfObject(doc.readiness),
    artifact_visibility: vis,
    active_artifact_versions: sanitizeVersions(doc.active_artifact_versions, artifacts),
    created_at: doc.created_at ?? null,
    updated_at: doc.updated_at ?? null,
    canonical_url: canonical,
    progress: doc.progress === undefined ? null : doc.progress,
    attestation: copyIfObject(doc.attestation) || {
      attested: false,
      health_score: null,
      freshness: "unobserved",
    },
    token: doc.token === undefined ? null : doc.token,
    artifacts,
    reproduced: doc.reproduced === undefined ? undefined : doc.reproduced,
    calendar: doc.calendar === undefined ? undefined : doc.calendar,
    ledger: doc.ledger === undefined ? undefined : redactLedger(doc.ledger),
    decisions: doc.decisions === undefined ? undefined : doc.decisions,
    departments_30d: doc.departments_30d === undefined ? undefined : doc.departments_30d,
    envelope: doc.envelope === undefined ? undefined : doc.envelope,
    pay: doc.pay === undefined ? undefined : doc.pay,
    next: doc.next === undefined ? undefined : doc.next,
    waiting: doc.waiting === undefined ? undefined : doc.waiting,
    loops: doc.loops === undefined ? undefined : doc.loops,
    chain_history: doc.chain_history === undefined ? undefined : doc.chain_history,
    catalog: doc.catalog === undefined ? undefined : doc.catalog,
  };
}

export function companyGateError(doc) {
  if (!doc || typeof doc !== "object") return "NOT_FOUND";
  if (doc.visibility && doc.visibility !== "public") return "PRIVATE";
  if (doc.readiness && doc.readiness.ready === false) return "NOT_READY";
  if (!isValidSlug(doc.slug)) return "NOT_FOUND";
  return null;
}

export function joinCompanyToken(view, launchpadRows) {
  const mint = view && view.agent_mint;
  if (!mint) {
    return {
      kind: "company_without_token",
      token: null,
      market: nullMarket(),
      token_href: null,
      row: null,
    };
  }
  const list = Array.isArray(launchpadRows) ? launchpadRows : [];
  const row = list.find((item) => (item.mint || item.agentMint) === mint) || null;
  if (!row) {
    return {
      kind: "company_without_token",
      token: null,
      market: nullMarket(),
      token_href: null,
      row: null,
    };
  }
  return {
    kind: "company_with_token",
    token: {
      ...tokenSummary(row),
      marketPerformance: row.marketPerformance ?? null,
      state: row.state ?? null,
      fundraisingDeadlineAt: row.fundraisingDeadlineAt ?? null,
      fundingFinalizedAt: row.fundingFinalizedAt ?? null,
      qualifyingNetCapxBase: row.qualifyingNetCapxBase ?? null,
      participantCount: row.participantCount ?? 0,
      poolAddress: row.poolAddress ?? null,
      sample: row.sample === true,
    },
    market: marketFromLaunchpad(row),
    token_href: `/t/${row.mint || row.agentMint}`,
    row,
  };
}

export function companyHref(slug) {
  if (!isValidSlug(slug)) return null;
  return `/c/${slug}`;
}

export const SAMPLE_COMPANY_DOCS = {
  inboxpilot: {
    company_id: "8f3c1a2e-4b5d-4c6a-9e1f-0a1b2c3d4e5f",
    company_pubkey: "n4bQgYhMfWWaL-qgxVrQFaO_TxhSYh5q0X0s5cHBHhU",
    slug: "inboxpilot",
    name: "InboxPilot",
    description: "Turns a founder inbox into a triage queue so nothing important sits unread.",
    logo: "https://inboxpilot.casa.capx.ai/logo.png",
    category: "developer-tools",
    visibility: "public",
    published_at: "2026-08-21T10:00:00Z",
    agent_mint: "2CasaCoMint11111111111111111capx",
    launchpad_project_id: "11111111-1111-4111-8111-111111111111",
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
    active_artifact_versions: { site: "ver_site_3", one_pager: "ver_pager_2", deck: "ver_deck_1" },
    created_at: "2026-08-01T12:00:00Z",
    updated_at: "2026-08-21T10:00:00Z",
    canonical_url: "https://inboxpilot.casa.capx.ai",
    progress: {
      plane: "claimed",
      level: 0,
      level_name: "Ideation and Validation",
      playbooks_total: 42,
      playbooks_done: 6,
      playbooks_ready: 3,
      playbooks_blocked: 1,
      done_nodes: [{ node_id: "opportunity-scan", title: "Opportunity Scan" }],
    },
    attestation: {
      attested: true,
      health_score: 78,
      freshness: "fresh",
      observed_at: "2026-08-20T15:04:11Z",
      sequence: 3,
    },
    token: {
      mint: "2CasaCoMint11111111111111111capx",
      binding_status: "live",
      creator_wallet: "2CasaCreatorPayee111111111111aaa",
      bound_at: "2026-08-20T12:00:00Z",
    },
    artifacts: {
      site: { url: "https://inboxpilot.casa.capx.ai/", version_id: "ver_site_3", visibility: "public" },
      one_pager: { url: "https://inboxpilot.casa.capx.ai/one-pager/", version_id: "ver_pager_2", visibility: "public" },
      deck: { url: "https://inboxpilot.casa.capx.ai/deck/", version_id: "ver_deck_1", visibility: "public" },
    },
  },
  "northstar-labs": {
    company_id: "1a2b3c4d-5e6f-4789-8abc-def012345678",
    company_pubkey: "Y2FzYS1ub3J0aHN0YXItbGFicy1rZXktZml4dHVy",
    slug: "northstar-labs",
    name: "Northstar Labs",
    description: "A research notebook that keeps one north star in front of the founder.",
    logo: "https://northstar-labs.casa.capx.ai/logo.png",
    category: "productivity",
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
    canonical_url: "https://northstar-labs.casa.capx.ai",
    progress: {
      plane: "claimed",
      level: 0,
      level_name: "Ideation and Validation",
      playbooks_total: 42,
      playbooks_done: 4,
      playbooks_ready: 2,
      playbooks_blocked: 0,
      done_nodes: [{ node_id: "opportunity-scan", title: "Opportunity Scan" }],
    },
    attestation: {
      attested: true,
      health_score: 64,
      freshness: "aging",
      observed_at: "2026-08-19T18:00:00Z",
      sequence: 1,
    },
    token: null,
    artifacts: {
      site: { url: "https://northstar-labs.casa.capx.ai/", version_id: "ver_site_1", visibility: "public" },
      one_pager: { url: "https://northstar-labs.casa.capx.ai/one-pager/", version_id: "ver_pager_1", visibility: "public" },
      deck: { url: "https://northstar-labs.casa.capx.ai/deck/", version_id: "ver_deck_1", visibility: "public" },
    },
  },
};
