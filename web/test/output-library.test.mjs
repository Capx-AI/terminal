import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { sanitizeOutputs, marketSurface, SAMPLE_COMPANY_DOCS } from "../company.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function loadMd() {
  const src = readFileSync(join(here, "../md.js"), "utf8");
  const ctx = { window: {} };
  vm.runInNewContext(src, ctx);
  return ctx.window.CAPX_MD;
}

const GOOD = {
  id: "gtm.md",
  node_id: "gtm",
  title: "GTM Plan",
  path: "gtm.md",
  sha256: "a".repeat(64),
  bytes: 512,
  url: "https://acme.casa.capx.ai/outputs/gtm.md",
  published_at: "2026-08-26T10:00:00.000Z",
};

test("sanitizeOutputs keeps only well-formed same-host markdown entries", () => {
  const kept = sanitizeOutputs([
    GOOD,
    { ...GOOD, url: "https://evil.casa.capx.ai/outputs/gtm.md" },
    { ...GOOD, url: "https://acme.casa.capx.ai/deck/gtm.md" },
    { ...GOOD, sha256: "not-a-hash" },
    { ...GOOD, path: "gtm.html" },
    { ...GOOD, path: "../gtm.md" },
    { ...GOOD, bytes: 0 },
    null,
    "junk",
  ], "acme");
  assert.equal(kept.length, 1);
  assert.deepEqual(kept[0], GOOD);
  assert.deepEqual(sanitizeOutputs("nope", "acme"), []);
});

test("the northstar sample outputs survive their own sanitize", () => {
  const doc = SAMPLE_COMPANY_DOCS["northstar-labs"];
  const kept = sanitizeOutputs(doc.outputs, "northstar-labs");
  assert.equal(kept.length, 2);
});

test("marketSurface summarizes outputs without URLs", () => {
  const view = {
    attestation: null,
    reproduced: null,
    progress: null,
    outputs: [
      { ...GOOD, published_at: "2026-08-20T00:00:00.000Z", title: "Older" },
      { ...GOOD, published_at: "2026-08-25T00:00:00.000Z", title: "Newest" },
    ],
  };
  const slim = marketSurface(view);
  assert.equal(slim.outputs.count, 2);
  assert.equal(slim.outputs.latest.title, "Newest");
  assert.equal(JSON.stringify(slim).includes("casa.capx.ai"), false);
  assert.equal(marketSurface({ outputs: [] }).outputs, null);
});

test("the markdown renderer escapes raw HTML and restricts links", () => {
  const md = loadMd();
  const html = md.render([
    "# Title",
    "",
    "A paragraph with **bold**, `code`, and a [link](https://example.com/x).",
    "",
    "<script>alert(1)</script>",
    "",
    "- item one",
    "- item two",
    "",
    "> a quote",
    "",
    "```",
    "const x = \"<b>raw</b>\";",
    "```",
    "",
    "[bad](javascript:alert(1))",
  ].join("\n"));
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<b>bold<\/b>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<a href="https:\/\/example\.com\/x" target="_blank" rel="noopener noreferrer nofollow">link<\/a>/);
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<ul><li>item one<\/li><li>item two<\/li><\/ul>/);
  assert.match(html, /<blockquote>a quote<\/blockquote>/);
  assert.match(html, /<pre><code>const x = &quot;&lt;b&gt;raw&lt;\/b&gt;&quot;;<\/code><\/pre>/);
  assert.equal(html.includes("<a href=\"javascript:"), false, "javascript link must not become an anchor");
});
