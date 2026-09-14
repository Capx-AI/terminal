// Phone-layout acceptance for Capx Terminal (plan 2026-08-29-002, Phase 2 gates).
// Never skips: a missing control is a named assertion, not a thrown timeout.
//   npm run test:phase2           (from web/tools/mobile)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fixtures, CONTEXTS, startStack, openPage, HIT_SELECTORS,
  typeCensus, hitAreaCensus, tableCheck, railCheck,
  tapChart, tapHeatmap, stageCheck, tileWidths, measureScript,
} from "./lib.mjs";

const TIMEOUT = 240000;
const HIT_MIN = 24;
const STAGE_MIN = 220;
const STAGE_MAX = 320;
const HEIGHTS = {
  home: 3200,
  "token-only": 2600,
  "company-without-token": 5200,
  register: 700,
};

let stack;
test.before(async () => { stack = await startStack(); });
test.after(async () => { if (stack) await stack.close(); });

function phoneCases() {
  const cases = [];
  for (const w of fixtures.phoneWidths) cases.push({ name: `iphone14@${w}`, context: CONTEXTS.iphone14, width: w });
  cases.push({ name: "pixel7@412", context: CONTEXTS.pixel7, width: null });
  return cases;
}

function boundaryCases() {
  // Tall viewport so a vertical scrollbar cannot shrink the media-query width
  // across the 700/880 boundaries.
  const tall = 8000;
  return [
    { name: "iphone14@700", context: CONTEXTS.iphone14, width: 700, height: tall },
    { name: "iphone14@701", context: CONTEXTS.iphone14, width: 701, height: tall },
    { name: "iphone14@880", context: CONTEXTS.iphone14, width: 880, height: tall },
    { name: "iphone14@881", context: CONTEXTS.iphone14, width: 881, height: tall },
    { name: "iphone14-landscape@844x390", context: CONTEXTS.iphone14, width: 844, height: 390 },
  ];
}

function phase1Pages() {
  return fixtures.pages;
}

function companyPages() {
  return [
    ...fixtures.pages.filter((p) => p.key.startsWith("company-")),
    ...(fixtures.phase2Pages || []),
  ];
}

function tokenPages() {
  return fixtures.pages.filter((p) => p.key.startsWith("token-"));
}

function detailPages() {
  return [
    ...fixtures.pages.filter((p) => p.kind === "detail"),
    ...(fixtures.phase2Pages || []),
  ];
}

function allPages() {
  return [...fixtures.pages, ...(fixtures.phase2Pages || [])];
}

async function load(fx, c) {
  try {
    return await openPage(stack, c.context, fx, c.width, c.height);
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  }
}

function near(a, b, tol = 1) {
  return Math.abs(a - b) <= tol;
}

test("phase2: type floor is 11px below 700px", { timeout: TIMEOUT }, async () => {
  const failures = [];
  for (const fx of allPages()) {
    for (const c of phoneCases()) {
      const opened = await load(fx, c);
      if (opened.error) { failures.push(`${fx.key} ${c.name}: open failed: ${opened.error}`); continue; }
      const { page, ctx } = opened;
      try {
        const r = await typeCensus(page);
        for (const el of r.under) {
          failures.push(`${fx.key} ${c.name} ${el.selector}: font-size ${el.fontSize}px is under 11 (text "${el.text}")`);
        }
      } finally {
        await ctx.close();
      }
    }
  }
  assert.equal(failures.length, 0, failures.join("\n"));
});

test("phase2: tap targets have a 24px hit area below 700px", { timeout: TIMEOUT }, async () => {
  const failures = [];
  for (const fx of allPages()) {
    for (const c of phoneCases()) {
      const opened = await load(fx, c);
      if (opened.error) { failures.push(`${fx.key} ${c.name}: open failed: ${opened.error}`); continue; }
      const { page, ctx } = opened;
      try {
        const r = await hitAreaCensus(page, HIT_SELECTORS);
        for (const item of r.items) {
          if (item.skipped) continue;
          if (item.hitH < HIT_MIN) {
            failures.push(`${fx.key} ${c.name} ${item.selector}[${item.index}]: hit area ${item.hitH}px tall, expected >= ${HIT_MIN} (box ${item.boxH}px)`);
          }
        }
      } finally {
        await ctx.close();
      }
    }
  }
  assert.equal(failures.length, 0, failures.join("\n"));
});

test("phase2: market tables pin rank and name and expose a scroll cue", { timeout: TIMEOUT }, async () => {
  const failures = [];
  const home = phase1Pages().find((p) => p.key === "home");
  for (const c of phoneCases()) {
    const opened = await load(home, c);
    if (opened.error) { failures.push(`${home.key} ${c.name}: open failed: ${opened.error}`); continue; }
    const { page, ctx } = opened;
    try {
      const r = await tableCheck(page);
      if (!r.tables.length) {
        failures.push(`${home.key} ${c.name} .tbl-scroll: no tables found`);
        continue;
      }
      for (const t of r.tables) {
        if (!t.hasColgroup) {
          failures.push(`${home.key} ${c.name} .tbl-scroll ${t.id}: missing <colgroup>`);
        }
        if (!t.shown) continue;
        if (t.dataMoreOnLoad !== "1") {
          failures.push(`${home.key} ${c.name} .tbl-scroll ${t.id}: data-more on load is ${JSON.stringify(t.dataMoreOnLoad)}, expected "1"`);
        }
        if (t.dataMoreAtEnd === "1") {
          failures.push(`${home.key} ${c.name} .tbl-scroll ${t.id}: data-more still "1" after scrollLeft = scrollWidth`);
        }
        if (!t.pin) continue;
        if (!near(t.pin.td0Left, t.pin.containerLeft, 1)) {
          failures.push(`${home.key} ${c.name} .tbl-scroll ${t.id} td[0]: left ${t.pin.td0Left} after scrollLeft=300, expected container left ${t.pin.containerLeft}`);
        }
        if (!near(t.pin.td1Left, t.pin.containerLeft + 44, 1)) {
          failures.push(`${home.key} ${c.name} .tbl-scroll ${t.id} td[1]: left ${t.pin.td1Left} after scrollLeft=300, expected container left + 44 = ${t.pin.containerLeft + 44}`);
        }
      }
    } finally {
      await ctx.close();
    }
  }
  assert.equal(failures.length, 0, failures.join("\n"));
});

test("phase2: chips, live, and attestation rails are one row tall", { timeout: TIMEOUT }, async () => {
  const failures = [];
  const home = phase1Pages().find((p) => p.key === "home");
  for (const c of phoneCases()) {
    const opened = await load(home, c);
    if (opened.error) { failures.push(`${home.key} ${c.name}: open failed: ${opened.error}`); continue; }
    const { page, ctx } = opened;
    try {
      const r = await railCheck(page);
      for (const rail of r.rails) {
        if (rail.skipped) continue;
        if (rail.reason === "no item") {
          failures.push(`${home.key} ${c.name} ${rail.selector}: visible but has no item (scrollHeight ${rail.scrollH})`);
          continue;
        }
        const max = rail.itemH + 4;
        if (!(rail.scrollH <= max + 0.5)) {
          failures.push(`${home.key} ${c.name} ${rail.selector}: scrollHeight ${rail.scrollH}px, expected <= one item ${rail.itemH}px + 4`);
        }
      }
    } finally {
      await ctx.close();
    }
  }
  assert.equal(failures.length, 0, failures.join("\n"));
});

test("phase2: token chart tap pins the readout", { timeout: TIMEOUT }, async () => {
  const failures = [];
  for (const fx of tokenPages()) {
    for (const c of phoneCases()) {
      const opened = await load(fx, c);
      if (opened.error) { failures.push(`${fx.key} ${c.name}: open failed: ${opened.error}`); continue; }
      const { page, ctx } = opened;
      try {
        const r = await tapChart(page);
        if (r.skipped) continue;
        if (r.reason === "#ro-date missing") {
          failures.push(`${fx.key} ${c.name} #ro-date: missing`);
          continue;
        }
        if (!r.changed) {
          failures.push(`${fx.key} ${c.name} #chart: touch tap left #ro-date at ${JSON.stringify(r.afterFirst)} (before ${JSON.stringify(r.before)}), expected a non-placeholder pin`);
        } else if (!r.firstPinned) {
          failures.push(`${fx.key} ${c.name} #chart: after touch tap #ro-date is ${JSON.stringify(r.afterFirst)}, expected a non-placeholder value`);
        }
        if (r.changed && !r.held) {
          failures.push(`${fx.key} ${c.name} #chart: #ro-date was ${JSON.stringify(r.afterFirst)} then ${JSON.stringify(r.afterLeave)} after pointerleave, expected to hold`);
        }
        if (r.changed && !r.moved) {
          failures.push(`${fx.key} ${c.name} #chart: second tap at a different x left #ro-date at ${JSON.stringify(r.afterSecond)}, expected a change from ${JSON.stringify(r.afterFirst)}`);
        }
      } finally {
        await ctx.close();
      }
    }
  }
  assert.equal(failures.length, 0, failures.join("\n"));
});

test("phase2: heatmap tap paints the readout", { timeout: TIMEOUT }, async () => {
  const failures = [];
  const pages = [...tokenPages(), ...companyPages()];
  for (const fx of pages) {
    for (const c of phoneCases()) {
      const opened = await load(fx, c);
      if (opened.error) { failures.push(`${fx.key} ${c.name}: open failed: ${opened.error}`); continue; }
      const { page, ctx } = opened;
      try {
        const r = await tapHeatmap(page);
        if (r.skipped) continue;
        if (r.reason) {
          failures.push(`${fx.key} ${c.name} .ghgrid .hc[data-d]: ${r.reason}`);
          continue;
        }
        if (!r.painted) {
          failures.push(`${fx.key} ${c.name} .ghgrid .hc[data-d]: #gh-read stayed ${JSON.stringify(r.afterClick)} after click, expected a value other than ${JSON.stringify(r.defaultText)}`);
        }
        if (r.painted && !r.held) {
          failures.push(`${fx.key} ${c.name} .ghgrid: #gh-read was ${JSON.stringify(r.afterClick)} then ${JSON.stringify(r.afterLeave)} after mouseleave, expected to hold`);
        }
      } finally {
        await ctx.close();
      }
    }
  }
  assert.equal(failures.length, 0, failures.join("\n"));
});

test("phase2: artifact stage is gated on phones", { timeout: TIMEOUT }, async () => {
  const failures = [];
  const above = [
    { name: "iphone14@701", context: CONTEXTS.iphone14, width: 701 },
    { name: "iphone14@880", context: CONTEXTS.iphone14, width: 880 },
  ];
  for (const fx of companyPages()) {
    for (const c of phoneCases()) {
      const opened = await load(fx, c);
      if (opened.error) { failures.push(`${fx.key} ${c.name}: open failed: ${opened.error}`); continue; }
      const { page, ctx } = opened;
      try {
        const r = await stageCheck(page);
        if (!r.stagePresent) {
          failures.push(`${fx.key} ${c.name} .artifact-stage: missing`);
          continue;
        }
        if (r.stageH < STAGE_MIN || r.stageH > STAGE_MAX) {
          failures.push(`${fx.key} ${c.name} .artifact-stage: height ${r.stageH}px, expected ${STAGE_MIN}..${STAGE_MAX}`);
        }
        if (r.previewShowing) {
          if (!r.before.gatePresent) {
            failures.push(`${fx.key} ${c.name} #stage-gate: missing while a preview is showing`);
          } else if (!r.before.gateVisible) {
            failures.push(`${fx.key} ${c.name} #stage-gate: not visible while a preview is showing (display ${r.before.gateDisplay})`);
          } else if (!r.afterTap) {
            failures.push(`${fx.key} ${c.name} #stage-gate: click did not run`);
          } else {
            if (!r.afterTap.live) {
              failures.push(`${fx.key} ${c.name} .artifact-stage: missing class live after #stage-gate click`);
            }
            if (r.afterTap.gateVisible) {
              failures.push(`${fx.key} ${c.name} #stage-gate: still visible after click, expected hidden`);
            }
          }
        }
        if (!r.before.belowPresent) {
          failures.push(`${fx.key} ${c.name} #artifact-open-below: missing`);
        } else if (!r.before.belowVisible) {
          failures.push(`${fx.key} ${c.name} #artifact-open-below: not visible below 700px (display ${r.before.belowDisplay})`);
        } else if (r.before.belowHref !== r.before.openHref) {
          failures.push(`${fx.key} ${c.name} #artifact-open-below: href ${JSON.stringify(r.before.belowHref)} != #artifact-open href ${JSON.stringify(r.before.openHref)}`);
        }
      } finally {
        await ctx.close();
      }
    }
    for (const c of above) {
      const opened = await load(fx, c);
      if (opened.error) { failures.push(`${fx.key} ${c.name}: open failed: ${opened.error}`); continue; }
      const { page, ctx } = opened;
      try {
        const r = await stageCheck(page);
        if (r.before.belowPresent && r.before.belowDisplay !== "none" && r.before.belowVisible) {
          failures.push(`${fx.key} ${c.name} #artifact-open-below: display ${r.before.belowDisplay}, expected none above 700px`);
        }
        if (!r.before.belowPresent) {
          failures.push(`${fx.key} ${c.name} #artifact-open-below: missing (must exist, display:none above 700px)`);
        }
        if (r.before.gateVisible) {
          failures.push(`${fx.key} ${c.name} #stage-gate: shown above 700px (display ${r.before.gateDisplay})`);
        }
      } finally {
        await ctx.close();
      }
    }
  }
  assert.equal(failures.length, 0, failures.join("\n"));
});

test("phase2: detail tiles switch at 700/701 and 880/881", { timeout: TIMEOUT }, async () => {
  const failures = [];
  for (const fx of detailPages()) {
    for (const c of boundaryCases()) {
      const opened = await load(fx, c);
      if (opened.error) { failures.push(`${fx.key} ${c.name}: open failed: ${opened.error}`); continue; }
      const { page, ctx } = opened;
      try {
        const r = await tileWidths(page);
        const w = c.width || r.innerWidth;
        if (!r.tiles.length) {
          failures.push(`${fx.key} ${c.name}: no visible tiles`);
          continue;
        }
        for (const t of r.tiles) {
          const paired = t.cls === "t-price" || t.cls === "t-work";
          if (w <= 700) {
            if (!near(t.w, r.full, 1)) {
              failures.push(`${fx.key} ${c.name} ${t.cls}: width ${t.w}px at ${w}, expected full ${r.full} (every tile full width at 700 and below; media700=${r.media700} cols=${r.bentoCols})`);
            }
          } else if (w <= 880) {
            const expect = paired ? r.pair : r.full;
            if (!near(t.w, expect, 1)) {
              failures.push(`${fx.key} ${c.name} ${t.cls}: width ${t.w}px at ${w}, expected ${paired ? "pair " + r.pair : "full " + r.full} (media880=${r.media880} cols=${r.bentoCols})`);
            }
          } else if (paired && !t.wide) {
            if (near(t.w, r.full, 1) || near(t.w, r.pair, 1)) {
              failures.push(`${fx.key} ${c.name} ${t.cls}: width ${t.w}px at ${w}, expected desktop span 3 (not full ${r.full} and not pair ${r.pair}; media880=${r.media880} cols=${r.bentoCols})`);
            }
          }
        }
      } finally {
        await ctx.close();
      }
    }
  }
  assert.equal(failures.length, 0, failures.join("\n"));
});

test("phase2: page heights at 390px stay under the caps", { timeout: TIMEOUT }, async () => {
  const failures = [];
  const c = { name: "iphone14@390", context: CONTEXTS.iphone14, width: 390 };
  for (const [key, cap] of Object.entries(HEIGHTS)) {
    const fx = phase1Pages().find((p) => p.key === key);
    if (!fx) { failures.push(`${key} ${c.name}: fixture missing`); continue; }
    const opened = await load(fx, c);
    if (opened.error) { failures.push(`${fx.key} ${c.name}: open failed: ${opened.error}`); continue; }
    const { page, ctx } = opened;
    try {
      const m = await page.evaluate(measureScript);
      if (!(m.docH < cap)) {
        failures.push(`${fx.key} ${c.name}: document height ${m.docH}px, expected under ${cap}`);
      }
    } finally {
      await ctx.close();
    }
  }
  assert.equal(failures.length, 0, failures.join("\n"));
});
