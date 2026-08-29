// Capture the desktop computed-style baseline for every fixture page.
// Run BEFORE a layout change; the test then diffs the live tree against it.
//   node baseline.mjs            writes baseline/<page>-<width>.json
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { here, fixtures, startStack, openPage, baselineScript } from "./lib.mjs";

const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const outDir = join(here, "baseline");
mkdirSync(outDir, { recursive: true });

const stack = await startStack();
try {
  for (const width of fixtures.desktopWidths) {
    for (const fx of fixtures.pages) {
      const { page, ctx } = await openPage(stack, desktop, fx, width);
      const data = await page.evaluate(baselineScript);
      const file = join(outDir, `${fx.key}-${width}.json`);
      writeFileSync(file, JSON.stringify({ page: fx.key, path: fx.path, width, elements: data.length, capturedAt: new Date().toISOString(), data }));
      console.log(`baseline ${fx.key} @${width}: ${data.length} elements`);
      await ctx.close();
    }
  }
} finally {
  await stack.close();
}
