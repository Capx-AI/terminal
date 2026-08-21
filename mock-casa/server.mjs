import { createServer } from "node:http";
import { SAMPLE_COMPANY_DOCS } from "../web/company.mjs";
import { FIXTURES } from "./fixtures.mjs";

const port = Number(process.env.MOCK_CASA_PORT ?? 4201);
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
const SLUG_RE = /^[a-z0-9-]{1,32}$/;

function isMint(mint) {
  return (
    typeof mint === "string" &&
    mint.length >= 32 &&
    mint.length <= 44 &&
    BASE58.test(mint) &&
    mint.endsWith("capx")
  );
}

function json(response, status, body, maxAge = 300) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": `public, max-age=${maxAge}`,
    "access-control-allow-origin": "*",
  });
  response.end(JSON.stringify(body));
}

function directoryRows() {
  return Object.values(SAMPLE_COMPANY_DOCS).map((doc) => ({
    company_id: doc.company_id,
    slug: doc.slug,
    name: doc.name,
    description: doc.description,
    logo: doc.logo,
    category: doc.category,
    visibility: "public",
    published_at: doc.published_at,
    agent_mint: doc.agent_mint,
    canonical_url: doc.canonical_url,
    readiness_ready: true,
    health_score: doc.attestation ? doc.attestation.health_score : null,
    freshness: doc.attestation ? doc.attestation.freshness : "unobserved",
  }));
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (request.method === "GET" && url.pathname === "/health") {
    json(response, 200, { status: "ok", fixtures: Object.keys(FIXTURES).length, surface: "1.2" });
    return;
  }
  if (request.method === "GET" && url.pathname === "/v1/companies") {
    json(response, 200, {
      companies: directoryRows(),
      next_cursor: null,
      generated_at: new Date().toISOString(),
    }, 60);
    return;
  }
  const companyMatch = url.pathname.match(/^\/v1\/companies\/([^/]+)$/);
  if (request.method === "GET" && companyMatch) {
    let slug;
    try {
      slug = decodeURIComponent(companyMatch[1]);
    } catch {
      json(response, 404, { error: "NOT_FOUND", message: "No such company" }, 5);
      return;
    }
    if (!SLUG_RE.test(slug)) {
      json(response, 404, { error: "NOT_FOUND", message: "No such company" }, 5);
      return;
    }
    if (slug === "private-notebook") {
      json(response, 404, { error: "PRIVATE", message: "Company is not public" }, 5);
      return;
    }
    if (slug === "unready-public") {
      json(response, 404, { error: "NOT_READY", message: "Company is not ready" }, 5);
      return;
    }
    const doc = SAMPLE_COMPANY_DOCS[slug];
    if (!doc) {
      json(response, 404, { error: "NOT_FOUND", message: "No such company" }, 5);
      return;
    }
    json(response, 200, doc, 60);
    return;
  }
  const match = url.pathname.match(/^\/v1\/tokens\/([^/]+)$/);
  if (request.method !== "GET" || !match) {
    json(response, 404, { error: "NOT_FOUND", message: "No such route" });
    return;
  }
  const mint = decodeURIComponent(match[1]);
  if (!isMint(mint)) {
    json(response, 400, {
      error: "INVALID_MINT",
      message: "Mint must be Solana base58 ending in capx",
    });
    return;
  }
  const doc = FIXTURES[mint];
  if (!doc) {
    json(response, 404, {
      error: "TOKEN_NOT_BOUND",
      message: "Casa has never bound this mint",
    });
    return;
  }
  json(response, 200, doc);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`mock casa http://127.0.0.1:${port}/\n`);
});
