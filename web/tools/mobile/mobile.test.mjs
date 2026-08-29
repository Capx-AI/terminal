// Phone-layout acceptance for Capx Terminal (plan 2026-08-29-002, Phase 1 gates).
// Never skips: a missing browser or baseline is a failure, by design.
//   npm test                      (from web/tools/mobile, after npm install)
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { here, fixtures, CONTEXTS, startStack, openPage, measureScript, baselineScript, diffBaseline } from "./lib.mjs";

const GUTTER = 20;        // --gut 10px on each side
const TILE_BORDER = 2;    // .tile has a 1px border each side; .chartbox sits inside it
const CHART_MIN = 240, CHART_MAX = 360;

let stack;
test.before(async () => { stack = await startStack(); });
test.after(async () => { if (stack) await stack.close(); });

async function phoneCases() {
  const cases = [];
  for (const w of fixtures.phoneWidths) cases.push({ name: `iphone14@${w}`, context: CONTEXTS.iphone14, width: w });
  cases.push({ name: "pixel7@412", context: CONTEXTS.pixel7, width: null });
  return cases;
}

for (const fx of fixtures.pages) {
  test(`phone: ${fx.key} fits the viewport and lays out one column`, async () => {
    for (const c of await phoneCases()) {
      const { page, ctx } = await openPage(stack, c.context, fx, c.width);
      const device = page.viewportSize().width; // the phone's real width, not innerWidth (which F2 widens)
      const m = await page.evaluate(measureScript);
      const tag = `${fx.key} ${c.name}`;
      try {
        assert.equal(m.innerWidth, device, `${tag}: layout viewport widened to ${m.innerWidth} on a ${device}px device (content overflows)`);
        assert.equal(m.docW, device, `${tag}: document width ${m.docW} != device width ${device}`);
        assert.ok(m.header && m.header.brand, `${tag}: header brand present`);
        if (m.header.actions) {
          assert.equal(m.header.overlap, false, `${tag}: header brand and actions overlap`);
        }
        for (const [k, b] of Object.entries({ brand: m.header.brand, actions: m.header.actions })) {
          if (!b) continue;
          assert.ok(b.x >= 0 && b.x + b.w <= device, `${tag}: header ${k} outside viewport (${b.x}..${b.x + b.w})`);
        }
        if (fx.kind === "detail") {
          assert.ok(m.tiles.length > 0, `${tag}: no visible tiles`);
          for (const t of m.tiles) {
            assert.ok(Math.abs(t.w - (m.innerWidth - GUTTER)) <= 1, `${tag}: tile ${t.cls} is ${t.w}px wide, expected ${m.innerWidth - GUTTER} (grid ${t.col})`);
          }
          if (m.chartbox) {
            assert.ok(m.chartbox.w >= m.innerWidth - GUTTER - TILE_BORDER, `${tag}: chartbox ${m.chartbox.w}px wide, expected >= ${m.innerWidth - GUTTER - TILE_BORDER}`);
            assert.ok(m.chartbox.h >= CHART_MIN && m.chartbox.h <= CHART_MAX, `${tag}: chartbox ${m.chartbox.h}px tall, expected ${CHART_MIN}..${CHART_MAX}`);
          }
          if (m.chart) {
            assert.ok(m.chart.w >= m.innerWidth - GUTTER - TILE_BORDER - 2, `${tag}: #chart ${m.chart.w}px wide`);
            assert.ok(m.chart.h >= CHART_MIN - 2 && m.chart.h <= CHART_MAX, `${tag}: #chart ${m.chart.h}px tall`);
          }
        }
      } finally {
        await ctx.close();
      }
    }
  });
}

test("desktop: computed styles and boxes match the committed baseline at 1024 and 1440", async () => {
  const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
  const failures = [];
  for (const width of fixtures.desktopWidths) {
    for (const fx of fixtures.pages) {
      const file = join(here, "baseline", `${fx.key}-${width}.json`);
      assert.ok(existsSync(file), `missing baseline ${file}; run \`npm run baseline\` on the pre-change tree first`);
      const before = JSON.parse(readFileSync(file, "utf8")).data;
      const { page, ctx } = await openPage(stack, desktop, fx, width);
      const after = await page.evaluate(baselineScript);
      await ctx.close();
      const problems = diffBaseline(before, after);
      if (problems.length) failures.push({ page: fx.key, width, count: problems.length, sample: problems.slice(0, 8) });
    }
  }
  assert.deepEqual(failures, [], `desktop changed:\n${JSON.stringify(failures, null, 1)}`);
});
