import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADVERSARIAL_GOLDENS,
  PASSING_GOLDENS,
  REDEEM_ERROR_CODES,
  assertInvalid,
  assertValid,
  directorySlugErrors,
  isCasaPublicUrl,
  loadJson,
  validate,
} from "../../../../ORCHESTRATOR/casa-terminal-plan-01/contracts/validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..");
const CONTRACTS = join(repoRoot, "../../ORCHESTRATOR/casa-terminal-plan-01/contracts");
const GOLDEN = join(CONTRACTS, "golden");

test("shared contracts path is reachable from the Terminal CT-02 worktree", () => {
  assert.equal(existsSync(CONTRACTS), true, `missing shared contracts at ${CONTRACTS}`);
  assert.equal(existsSync(join(CONTRACTS, "validate.mjs")), true);
});

test("passing goldens validate against frozen schemas", () => {
  for (const g of PASSING_GOLDENS) {
    assertValid(join(CONTRACTS, g.schema), loadJson(join(CONTRACTS, g.file)), g.file);
  }
});

test("adversarial goldens fail public directory, detail, or composite schemas", () => {
  for (const g of ADVERSARIAL_GOLDENS) {
    assertInvalid(join(CONTRACTS, g.schema), loadJson(join(CONTRACTS, g.file)), g.file);
  }
});

test("token-later composite keeps company_id, slug, and canonical_url", () => {
  const beforeRow = loadJson(join(GOLDEN, "composite-token-later-before.json"));
  const afterRow = loadJson(join(GOLDEN, "composite-token-later-after.json"));
  assert.equal(beforeRow.kind, "company_without_token");
  assert.equal(afterRow.kind, "company_with_token");
  assert.equal(beforeRow.company.company_id, afterRow.company.company_id);
  assert.equal(beforeRow.company.slug, afterRow.company.slug);
  assert.equal(beforeRow.company.canonical_url, afterRow.company.canonical_url);
  assert.equal(beforeRow.token, null);
  assert.equal(typeof afterRow.token.mint, "string");
  for (const key of ["price_usd", "fdv_usd", "volume_24h_usd", "liquidity_usd", "change_24h_percent"]) {
    assert.equal(beforeRow.market[key], null);
  }
});

test("company-only market fields are null, never zero", () => {
  const row = loadJson(join(GOLDEN, "composite-company-only.json"));
  assert.equal(row.kind, "company_without_token");
  for (const key of ["price_usd", "fdv_usd", "volume_24h_usd", "liquidity_usd", "change_24h_percent"]) {
    assert.equal(row.market[key], null, `${key} must be null on tokenless rows`);
  }
  const zero = loadJson(join(GOLDEN, "adversarial/tokenless-market-zero.json"));
  assert.equal(zero.market.price_usd, 0);
  assertInvalid(join(CONTRACTS, "terminal-composite-row.schema.json"), zero, "tokenless-market-zero.json");
});

test("hidden artifact leaked URL fails the public company schema", () => {
  const doc = loadJson(join(GOLDEN, "adversarial/hidden-artifact-leaked-url.json"));
  assert.equal(doc.artifact_visibility.deck, "private");
  assert.equal(isCasaPublicUrl(doc.artifacts.deck.url, doc.slug), true);
  assertInvalid(join(CONTRACTS, "company.schema.json"), doc, "hidden-artifact-leaked-url.json");
});

test("slug conflict directory fails unique slug", () => {
  const dir = loadJson(join(GOLDEN, "adversarial/directory-slug-conflict.json"));
  assert.ok(directorySlugErrors(dir).length > 0);
  assertInvalid(join(CONTRACTS, "company-directory.schema.json"), dir, "directory-slug-conflict.json");
});

test("oneOf is exclusive for composite kinds", () => {
  const exclusive = validate({ oneOf: [{ const: 1 }, { type: "integer", minimum: 0 }] }, 1);
  assert.equal(exclusive.ok, false);
  assert.match(exclusive.errors.join("\n"), /exactly one required/);

  const withToken = loadJson(join(GOLDEN, "composite-company-token.json"));
  assertValid(join(CONTRACTS, "terminal-composite-row.schema.json"), withToken, "composite-company-token.json");
  const both = {
    ...withToken,
    kind: "company_without_token",
    token: withToken.token,
  };
  assertInvalid(join(CONTRACTS, "terminal-composite-row.schema.json"), both, "kind/token mismatch");
});

test("redeem error codes are documented (no redeem error schema)", () => {
  for (const code of ["CODE_USED", "CODE_EXPIRED", "CODE_INVALID", "SLUG_CONFLICT"]) {
    assert.ok(REDEEM_ERROR_CODES[code]);
  }
  assert.equal(existsSync(join(CONTRACTS, "company-redeem-error.schema.json")), false);
});
