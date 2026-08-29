import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const tokenSrc = readFileSync(join(webRoot, "token.js"), "utf8");
const companySrc = readFileSync(join(webRoot, "company.js"), "utf8");

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

function chartTapHarness() {
  const chart = {
    _pinned: false,
    _tapStart: null,
    getBoundingClientRect() { return { left: 0, top: 0 }; },
  };
  const hoverEvents = [];
  const clears = { count: 0 };
  const api = vm.runInNewContext(
    `"use strict";
var chart = chartEl;
function geom() { return { W: 100, padL: 10, padR: 10 }; }
function onHover(ev) { hoverEvents.push(ev); }
function clearChartHover() { clears.count += 1; }
${extractFunction(tokenSrc, "function onChartPointerDown(ev)")}
${extractFunction(tokenSrc, "function onChartPointerUp(ev)")}
({ onChartPointerDown, onChartPointerUp });`,
    { chartEl: chart, hoverEvents, clears },
  );
  return { chart, hoverEvents, clears, ...api };
}

test("chart taps accept 8px and 400ms thresholds", () => {
  const h = chartTapHarness();
  h.onChartPointerDown({ clientX: 40, clientY: 40, timeStamp: 100 });
  h.onChartPointerUp({ clientX: 48, clientY: 40, timeStamp: 500, pointerType: "touch" });
  assert.equal(h.chart._pinned, true);
  assert.equal(h.hoverEvents.length, 1);

  h.chart._pinned = false;
  h.onChartPointerDown({ clientX: 40, clientY: 40, timeStamp: 100 });
  h.onChartPointerUp({ clientX: 48.01, clientY: 40, timeStamp: 500, pointerType: "touch" });
  assert.equal(h.chart._pinned, false);
  assert.equal(h.hoverEvents.length, 1);

  h.onChartPointerDown({ clientX: 40, clientY: 40, timeStamp: 100 });
  h.onChartPointerUp({ clientX: 40, clientY: 40, timeStamp: 501, pointerType: "touch" });
  assert.equal(h.chart._pinned, false);
  assert.equal(h.hoverEvents.length, 1);
});

test("chart tap outside the plot releases the pin", () => {
  const h = chartTapHarness();
  h.chart._pinned = true;
  h.onChartPointerDown({ clientX: 5, clientY: 40, timeStamp: 100 });
  h.onChartPointerUp({ clientX: 5, clientY: 40, timeStamp: 200, pointerType: "touch" });
  assert.equal(h.chart._pinned, false);
  assert.equal(h.clears.count, 1);
  assert.equal(h.hoverEvents.length, 0);
});

test("both heatmaps expose indexed cells and shared readout painters", () => {
  assert.match(companySrc, /class='hc" \+ lvl \+ ring \+ "' data-d='" \+ i \+ "' title='/);
  assert.match(companySrc, /cells \+= "<span class='hc pad'><\/span>"/);
  assert.match(tokenSrc, /function paintHeatRead\(i\)/);
  assert.match(companySrc, /function paintHeatRead\(i\)/);
  assert.match(tokenSrc, /grid\.addEventListener\("click"/);
  assert.match(companySrc, /grid\.addEventListener\("click"/);
  assert.match(tokenSrc, /grid\._held = i2/);
  assert.match(companySrc, /grid\._held = i2/);
});

test("chart uses pointer events and permits vertical touch scrolling", () => {
  const css = readFileSync(join(webRoot, "app.css"), "utf8");
  assert.match(tokenSrc, /chart\.addEventListener\("pointermove"/);
  assert.match(tokenSrc, /chart\.addEventListener\("pointerleave"/);
  assert.match(tokenSrc, /chart\.addEventListener\("pointerdown"/);
  assert.match(tokenSrc, /chart\.addEventListener\("pointerup"/);
  assert.doesNotMatch(tokenSrc, /chart\.addEventListener\("mousemove"/);
  assert.match(tokenSrc, /ev\.pointerType === "touch" \? 24 : 9/);
  assert.match(css, /@media \(max-width:880px\)\{[\s\S]*?#chart\{touch-action:pan-y;\}/);
});
