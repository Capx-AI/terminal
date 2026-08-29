import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const marker = "/* ===== phone type floor (plan 2026-08-29-002, R11) ===== */";

function leafRules(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim().replace(/\s+/g, " "),
    declarations: match[2],
  }));
}

function isException(selector) {
  const parts = selector.split(",").map((part) => part.trim());
  return parts.every((part) => (
    part === ".sr-only"
    || part === ".skip"
    || /(^|[\s>+~])\.hc(?=$|[.:[\s>+~#])/.test(part)
    || /(^|[\s>+~])canvas(?=$|[.:[\s>+~#])/.test(part)
  ));
}

function smallFontRules(css) {
  return leafRules(css).filter(({ selector, declarations }) => {
    if (isException(selector)) return false;
    const sizes = [...declarations.matchAll(/font-size\s*:\s*([0-9]*\.?[0-9]+)px\b/g)];
    return sizes.some((match) => Number(match[1]) < 11);
  });
}

test("phone block covers every stylesheet font below 11px", () => {
  const app = readFileSync(join(webRoot, "app.css"), "utf8");
  const v1 = readFileSync(join(webRoot, "v1.css"), "utf8");
  const parts = app.split(marker);

  assert.equal(parts.length, 2, "phone type-floor marker must appear exactly once");
  const [appOutsidePhone, phoneBlock] = parts;
  assert.match(phoneBlock, /^\s*@media \(max-width:700px\)\{[\s\S]*\}\s*$/);

  // v1.css loads after app.css, so a small size declared in v1.css can only be
  // raised by a block inside v1.css; app.css rules are raised in the app block.
  const v1Marker = "/* ===== phone type floor, v1 sheet (plan 2026-08-29-002, R11) ===== */";
  const v1Parts = v1.split(v1Marker);
  assert.equal(v1Parts.length, 2, "v1 phone type-floor marker must appear exactly once");
  const [v1OutsidePhone, v1PhoneBlock] = v1Parts;
  const phoneRules = leafRules(phoneBlock);
  const v1PhoneRules = leafRules(v1PhoneBlock);

  const check = (inventory, rules, where) => {
    for (const { selector } of inventory) {
      const overrides = rules.filter((rule) => rule.selector === selector);
      assert.ok(
        overrides.some(({ declarations }) => /font-size\s*:\s*11px\b/.test(declarations)),
        `${selector} needs font-size:11px in the ${where} phone type-floor block`,
      );
    }
  };
  check(smallFontRules(appOutsidePhone), phoneRules, "app.css");
  check(smallFontRules(v1OutsidePhone), v1PhoneRules, "v1.css");
});

test("both token chart axis fonts use the phone matchMedia floor", () => {
  const token = readFileSync(join(webRoot, "token.js"), "utf8");
  const responsiveAxisFont = /cctx\.font = \(window\.matchMedia\("\(max-width:700px\)"\)\.matches \? "11px" : "10px"\) \+ " ui-monospace, SF Mono, Menlo, monospace";/g;

  assert.equal([...token.matchAll(responsiveAxisFont)].length, 2);
  assert.doesNotMatch(token, /cctx\.font = "10px ui-monospace, SF Mono, Menlo, monospace";/);
});
