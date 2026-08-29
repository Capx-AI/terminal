import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");

function extractFunction(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) throw new Error(`missing ${signature}`);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${signature}`);
}

test("syncScrollCue marks remaining overflow and clears at the four-pixel threshold", () => {
  const src = readFileSync(join(webRoot, "market.js"), "utf8");
  const body = extractFunction(src, "function syncScrollCue(el)");
  const syncScrollCue = vm.runInNewContext(`"use strict";\n${body}\nsyncScrollCue;`);
  const el = { scrollLeft: 0, clientWidth: 100, scrollWidth: 200, dataset: {} };

  syncScrollCue(el);
  assert.equal(el.dataset.more, "1");

  el.scrollLeft = 95;
  syncScrollCue(el);
  assert.equal(el.dataset.more, "1");

  el.scrollLeft = 96;
  syncScrollCue(el);
  assert.equal("more" in el.dataset, false);

  el.scrollLeft = 0;
  el.scrollWidth = 100;
  el.dataset.more = "1";
  syncScrollCue(el);
  assert.equal("more" in el.dataset, false);
});
