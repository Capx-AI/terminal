import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertValid,
  loadJson,
  requiredPresent,
  TOKEN_CASA_REQUIRED,
} from "../../../../ORCHESTRATOR/casa-terminal-plan-01/contracts/validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..");
const CONTRACTS = join(repoRoot, "../../ORCHESTRATOR/casa-terminal-plan-01/contracts");
const GOLDEN = join(CONTRACTS, "golden");

test("shared contracts path is reachable from the Terminal worktree", () => {
  assert.equal(existsSync(CONTRACTS), true, `missing shared contracts at ${CONTRACTS}`);
  assert.equal(existsSync(join(CONTRACTS, "validate.mjs")), true);
});

test("shared TokenCasa golden has v1.1 required fields", () => {
  const doc = loadJson(join(GOLDEN, "token-casa-compatible.json"));
  const present = requiredPresent(doc, TOKEN_CASA_REQUIRED, "TokenCasa");
  assert.equal(present.ok, true, present.message);
  assertValid(join(CONTRACTS, "token-casa.schema.json"), doc, "token-casa-compatible.json");
});

test("shared company, directory, redeem, and composite goldens validate", () => {
  const pairs = [
    ["company.schema.json", "company-public.json"],
    ["company-directory.schema.json", "directory.json"],
    ["company-redeem.schema.json", "redeem-publish.json"],
    ["company-redeem.schema.json", "redeem-claim.json"],
    ["terminal-composite-row.schema.json", "composite-company-token.json"],
    ["terminal-composite-row.schema.json", "composite-company-only.json"],
    ["terminal-composite-row.schema.json", "composite-token-only.json"],
  ];
  for (const [schema, golden] of pairs) {
    assertValid(join(CONTRACTS, schema), loadJson(join(GOLDEN, golden)), golden);
  }
});

test("company-only market fields are null, never zero", () => {
  const row = loadJson(join(GOLDEN, "composite-company-only.json"));
  assert.equal(row.kind, "company_without_token");
  assert.equal(row.token, null);
  for (const key of ["price_usd", "fdv_usd", "volume_24h_usd", "liquidity_usd", "change_24h_percent"]) {
    assert.equal(row.market[key], null, `${key} must be null on tokenless rows`);
    assert.notEqual(row.market[key], 0);
  }
});

/**
 * Documents current HEAD: GET /api/market is still token-only.
 * Expected-red until TR-01 emits companies[] / typed categories.
 */
export function marketPayloadReturnKeys(src) {
  const fn = src.indexOf("async function marketPayload");
  if (fn < 0) throw new Error("marketPayload not found");
  const ret = src.indexOf("return {", fn);
  if (ret < 0) throw new Error("marketPayload return not found");
  const end = src.indexOf("};", ret);
  if (end < 0) throw new Error("marketPayload return end not found");
  const block = src.slice(ret, end + 2);
  const keys = [];
  for (const line of block.split("\n")) {
    const m = line.match(/^\s{4}([A-Za-z_][A-Za-z0-9_]*)(,|:\s)/);
    if (m) keys.push(m[1]);
  }
  return { keys, block };
}

test("current /api/market payload has tokens[] and no companies/categories (expected-red until TR-01)", () => {
  const src = readFileSync(join(webRoot, "server.mjs"), "utf8");
  const { keys } = marketPayloadReturnKeys(src);
  assert.ok(keys.includes("tokens"), `marketPayload keys: ${keys.join(",")}`);
  assert.ok(!keys.includes("companies"), "companies[] is not on current marketPayload");
  assert.ok(!keys.includes("categories"), "categories is not on current marketPayload");
  assert.match(src, /CASA_TTL_MS = 300_000/);
  assert.match(src, /\/v1\/tokens\/\$\{encodeURIComponent\(mint\)\}/);
});

test("docs/casa-openapi.yaml is a pointer to Casa OpenAPI 1.4.0", () => {
  const yaml = readFileSync(join(repoRoot, "docs", "casa-openapi.yaml"), "utf8");
  assert.match(yaml, /version: "1\.4\.0"/);
  assert.match(yaml, /pointer/i);
  assert.match(yaml, /docs\/openapi\.yaml/);
  assert.doesNotMatch(yaml, /\/v1\/internal\/bind-grants/);
});
