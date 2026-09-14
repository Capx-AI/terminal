// Phone density floor (plan 2026-08-29-003): numbers above the fold at 390px must not fall
// below the targets. Run: npm run test:phase3
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixtures, CONTEXTS, startStack, openPage, factCensus } from "./lib.mjs";

// Floors are set from the SAMPLE fixtures after the density release; production pages carry more.
// token-bound dropped 16 -> 15 and its cap rose 3200 -> 3400 on 2026-09-14: the company face (brief, diagrams, roadmap, plan, agents) now sits on the token page below the market tiles.
const FLOORS = { home: 18, "token-only": 16, "token-bound": 15, "company-with-token": 14, "company-without-token": 8, register: 0 };
const HEIGHT_CAPS = { home: 3400, "token-only": 2600, "token-bound": 3400, "company-with-token": 4500, "company-without-token": 4500, register: 700 };

let stack;
test.before(async () => { stack = await startStack(); });
test.after(async () => { if (stack) await stack.close(); });

test("phase3: numbers above the fold at 390 meet the density floors", { timeout: 240000 }, async () => {
  const problems = [];
  const report = [];
  for (const fx of fixtures.pages) {
    const { page, ctx } = await openPage(stack, CONTEXTS.iphone14, fx, 390);
    const c = await factCensus(page);
    await ctx.close();
    report.push(`${fx.key}: ${c.numeric} numbers, ${c.textNodes} text nodes, ${c.docH}px tall`);
    if (c.numeric < FLOORS[fx.key]) problems.push(`${fx.key}: ${c.numeric} numbers above the fold, floor ${FLOORS[fx.key]}`);
    if (c.docH > HEIGHT_CAPS[fx.key]) problems.push(`${fx.key}: ${c.docH}px tall, cap ${HEIGHT_CAPS[fx.key]}`);
  }
  console.log(report.join("\n"));
  assert.deepEqual(problems, [], problems.join("\n"));
});
