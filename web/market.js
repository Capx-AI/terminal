"use strict";
var F = window.CAPX_FMT;
var $ = function (id) { return document.getElementById(id); };
var QUERY = "";
var FILTER = "all";
var KIND = "all";
var SHOW_ENDED = false;
var SORT = {
  tokens: { k: "fdv", dir: -1 },
  companies: { k: "health", dir: -1 },
};
var ENDED_STATES = { REFUNDED: true, UNFUNDED_EXPIRED: true };
var DATA = null;
var MARKET_KEYS = ["price_usd", "fdv_usd", "volume_24h_usd", "liquidity_usd", "change_24h_percent"];

var LEVEL_NAMES = [
  "Ideation and validation",
  "Commit and incorporate",
  "Product and infra foundation",
  "Build and pre-launch",
  "Launch",
  "First customers and PMF",
  "Scale acquisition",
  "Enterprise sales",
  "Growth finance and fundraise",
];

var CAL_WEEKS = 26, CAL_CELL = 4, CAL_GAP = 1, CAL_ROWS = 7;
var CAL_W = CAL_WEEKS * (CAL_CELL + CAL_GAP) - CAL_GAP;
var CAL_H = CAL_ROWS * (CAL_CELL + CAL_GAP) - CAL_GAP;
var CAL_FILL = [
  "rgba(197,220,107,.18)",
  "rgba(197,220,107,.36)",
  "rgba(197,220,107,.58)",
  "rgba(197,220,107,.85)",
];

function tokenByMint(mint) {
  if (!DATA || !DATA.tokens || !mint) return null;
  for (var i = 0; i < DATA.tokens.length; i++) {
    if (DATA.tokens[i].mint === mint) return DATA.tokens[i];
  }
  return null;
}

function companySurface(slug) {
  if (!DATA || !DATA.company_surfaces || !slug) return null;
  return DATA.company_surfaces[slug] || null;
}

function honestMarket(row) {
  var empty = {
    price_usd: null,
    fdv_usd: null,
    volume_24h_usd: null,
    liquidity_usd: null,
    change_24h_percent: null,
  };
  if (!row || row.kind === "company_without_token") return empty;
  var m = row.market;
  if (!m) return empty;
  var out = {}, i, v;
  for (i = 0; i < MARKET_KEYS.length; i++) {
    v = m[MARKET_KEYS[i]];
    out[MARKET_KEYS[i]] = typeof v === "number" && isFinite(v) ? v : null;
  }
  return out;
}

function fromComposite(row) {
  var company = row && row.company ? row.company : null;
  var token = row && row.token ? row.token : null;
  var market = honestMarket(row);
  var mint = token && token.mint ? token.mint : null;
  var src = tokenByMint(mint);
  var surface = company && company.slug ? companySurface(company.slug) : null;
  var fdv = market.fdv_usd;
  var vol = market.volume_24h_usd;
  var liq = market.liquidity_usd;
  var chg = market.change_24h_percent;
  var px = market.price_usd;
  var hasMarket = row && row.kind !== "company_without_token"
    && (fdv != null || vol != null || liq != null || chg != null || px != null);
  return {
    kind: row.kind,
    mint: mint,
    id: token ? token.project_id : (company ? company.company_id : ""),
    name: company ? company.name : (token ? token.name : ""),
    symbol: token ? token.symbol : "",
    logoUrl: (token && (token.logo_url || token.logoUrl)) || (company && company.logo) || (src && src.logoUrl) || null,
    state: token ? token.state : null,
    slug: company ? company.slug : "",
    company: company,
    token: token,
    sample: !!(src && src.sample),
    marketPerformance: hasMarket ? {
      currentMarketCapUsd: fdv,
      volume24hUsd: vol,
      liquidityUsd: liq,
      priceChange24hPercent: chg,
      stale: !!(src && src.marketPerformance && src.marketPerformance.stale),
    } : null,
    sparkline: src ? src.sparkline : null,
    casa: (surface && surface.document)
      ? { status: 200, document: surface.document }
      : (src ? src.casa : null),
    heatmap: (surface && surface.heatmap) || (src && src.heatmap) || null,
    healthScore: company && typeof company.health_score === "number" ? company.health_score : null,
    freshness: company ? company.freshness : null,
    description: company ? company.description : (src ? src.description : ""),
    category: company ? company.category : "",
  };
}

function listed() {
  if (DATA && Array.isArray(DATA.rows)) {
    return DATA.rows.map(fromComposite);
  }
  return (DATA && DATA.tokens) || [];
}

function casaDoc(row) {
  return row && row.casa && row.casa.status === 200 && row.casa.document
    ? row.casa.document
    : null;
}
function liveCasa(row) {
  var d = casaDoc(row);
  return d && d.binding && d.binding.status === "live" ? d : null;
}
function healthOf(row) {
  var d = casaDoc(row);
  var h = d && d.attestation ? d.attestation.health_score : null;
  if (typeof h === "number") return h;
  if (typeof row.healthScore === "number") return row.healthScore;
  if (row && row.company && typeof row.company.health_score === "number") return row.company.health_score;
  return null;
}
function freshnessOf(row) {
  var d = casaDoc(row);
  if (d && d.attestation && d.attestation.freshness) return d.attestation.freshness;
  if (row && row.freshness) return row.freshness;
  if (row && row.company && row.company.freshness) return row.company.freshness;
  return null;
}
function hoursSinceOf(row) {
  var d = casaDoc(row);
  var h = d && d.attestation ? d.attestation.hours_since : null;
  return typeof h === "number" && isFinite(h) ? h : null;
}
function mcapOf(row) {
  var m = row.marketPerformance && row.marketPerformance.currentMarketCapUsd;
  return typeof m === "number" ? m : null;
}
function volOf(row) {
  var m = row.marketPerformance && row.marketPerformance.volume24hUsd;
  return typeof m === "number" ? m : null;
}
function liqOf(row) {
  var m = row.marketPerformance && row.marketPerformance.liquidityUsd;
  return typeof m === "number" ? m : null;
}
function chgOf(row) {
  var m = row.marketPerformance && row.marketPerformance.priceChange24hPercent;
  return typeof m === "number" ? m : null;
}
function priceOf(row) {
  return F.tokenPriceUsd(row);
}
function progressOf(row) {
  var d = casaDoc(row);
  return d && d.progress ? d.progress : null;
}
function tasks7dOf(row) {
  var p = progressOf(row);
  var n = p && p.work ? p.work.tasks_7d : null;
  return typeof n === "number" ? n : null;
}
function doneOf(row) {
  var p = progressOf(row);
  return p && typeof p.playbooks_done === "number" ? p.playbooks_done : null;
}
function totalOf(row) {
  var p = progressOf(row);
  return p && typeof p.playbooks_total === "number" ? p.playbooks_total : null;
}
function seqOf(row) {
  var d = casaDoc(row);
  var s = d && d.attestation ? d.attestation.sequence : null;
  return typeof s === "number" ? s : null;
}
function coverageOf(row) {
  var d = casaDoc(row);
  var n = d && d.reproduced ? d.reproduced.coverage_bp : null;
  return typeof n === "number" ? n : null;
}
function calDays(row) {
  if (row && row.heatmap && Array.isArray(row.heatmap.buckets) && row.heatmap.buckets.length) {
    return row.heatmap.buckets;
  }
  var d = casaDoc(row);
  return d && d.calendar && Array.isArray(d.calendar.days) ? d.calendar.days : null;
}
function attestedWithin7d(d) {
  if (!d || !d.attestation) return false;
  var a = d.attestation;
  if (typeof a.hours_since === "number" && isFinite(a.hours_since)) return a.hours_since <= 168;
  if (a.observed_at) {
    var t = Date.parse(a.observed_at);
    if (isFinite(t)) return (Date.now() - t) <= 168 * 3600000;
  }
  return false;
}

function dash() { return "<span style='color:var(--t600)'>--</span>"; }

function dualUsd(n, stale) {
  if (n == null) return dash();
  var mark = stale ? " <span class='stale-mark'>stale</span>" : "";
  return "<span class='d1'>" + F.usdCompact(n) + mark + "</span>";
}

function chgCell(n) {
  if (n == null) return dash();
  return "<span class='" + (n >= 0 ? "up" : "dn") + "'>" + F.pct(n) + "</span>";
}

function scoreCell(h) {
  if (h == null) return dash();
  var cls = h >= 80 ? "" : h >= 40 ? "mid" : "lo";
  return "<span class='scwrap " + cls + "'><span class='scv'>" + h + "</span><span class='scbar'><i style='width:" + h + "%'></i></span></span>";
}

function buildmap(done, total) {
  if (total == null || total <= 0 || done == null) return "<span style='color:var(--t600)'>none</span>";
  var p = Math.max(0, Math.min(100, done / total * 100));
  return "<span class='bmwrap'><span class='bmbar'><i style='width:" + p.toFixed(0) + "%'></i></span>"
    + "<span class='bmv'>" + done + "<span class='u'>/ " + total + "</span></span></span>";
}

function buildmapCell(row) {
  if (!progressOf(row)) return dash();
  return buildmap(doneOf(row), totalOf(row));
}

function coverageCell(n) {
  if (n == null) return dash();
  return "<span class='lit'>" + F.bp(n) + "</span>";
}

function freshDot(band) {
  if (band === "fresh") return "fresh";
  if (band === "aging") return "stale";
  if (band === "stale") return "dormant";
  return "dark";
}

function attestedCell(row) {
  var d = casaDoc(row);
  if (!d || !d.attestation) {
    var band = freshnessOf(row);
    if (!band) return dash();
    return "<span class='fdot " + freshDot(band) + "'></span>" + F.esc(band);
  }
  var a = d.attestation;
  var time = typeof a.hours_since === "number" ? F.hoursAgo(a.hours_since)
    : (a.observed_at ? F.ago(a.observed_at) : "");
  if (time === "--") time = "";
  var head = a.attested === true ? "attested" : F.esc(a.freshness || "");
  if (!head && !time) return dash();
  var sub = [];
  if (a.attested === true && a.freshness) sub.push(F.esc(a.freshness));
  if (time) sub.push(F.esc(time));
  return "<span class='fdot " + freshDot(a.freshness) + "'></span>" + head
    + (sub.length ? "<div class='d2'>" + sub.join(" · ") + "</div>" : "");
}

function calCell(row) {
  var days = calDays(row);
  if (!days || !days.length) return dash();
  if (row && row.mint) {
    return "<canvas class='cal' data-mint='" + F.esc(row.mint) + "' width='" + CAL_W + "' height='" + CAL_H + "'></canvas>";
  }
  if (row && row.slug) {
    return "<canvas class='cal' data-slug='" + F.esc(row.slug) + "' width='" + CAL_W + "' height='" + CAL_H + "'></canvas>";
  }
  return dash();
}

function lastAttestedIndex(days) {
  var last = -1;
  for (var i = 0; i < days.length; i++) {
    if (days[i] && days[i].attestation) last = i;
  }
  return last;
}

function rowFromDirectory(pred) {
  if (!DATA || !Array.isArray(DATA.rows)) return null;
  var i;
  for (i = 0; i < DATA.rows.length; i++) {
    if (pred(DATA.rows[i])) return fromComposite(DATA.rows[i]);
  }
  return null;
}

function rowBySlug(slug) {
  if (!slug) return null;
  return rowFromDirectory(function (row) {
    return row && row.company && row.company.slug === slug;
  });
}

function drawCal(c) {
  var mint = c.getAttribute("data-mint");
  var slug = c.getAttribute("data-slug");
  var row = mint
    ? (rowFromDirectory(function (r) { return r && r.token && r.token.mint === mint; }) || tokenByMint(mint))
    : rowBySlug(slug);
  var days = calDays(row);
  if (!days || !days.length) return;
  var spec = row && row.heatmap && row.heatmap.spec ? row.heatmap.spec : { kind: "1d", layout: "weeks", cols: 7 };
  var cols = spec.layout === "hours" ? 24 : (spec.layout === "blocks" ? 6 : 7);
  var rows = spec.layout === "weeks" ? 7 : Math.max(1, Math.ceil(days.length / cols));
  var cell = CAL_CELL, gap = CAL_GAP;
  var W = cols * (cell + gap) - gap;
  var H = rows * (cell + gap) - gap;
  var dpr = window.devicePixelRatio || 1;
  c.width = W * dpr;
  c.height = H * dpr;
  c.style.width = W + "px";
  c.style.height = H + "px";
  var ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  var lastAtt = typeof (row && row.heatmap && row.heatmap.lastCovered) === "number"
    ? row.heatmap.lastCovered
    : lastAttestedIndex(days);
  var max = 1, i, v;
  for (i = 0; i < days.length; i++) {
    if (i <= lastAtt) {
      v = days[i] && typeof days[i].events === "number" ? days[i].events : 0;
      if (v > max) max = v;
    }
  }

  for (i = 0; i < days.length; i++) {
    var col, rowi;
    if (spec.layout === "weeks") {
      col = Math.floor(i / 7);
      rowi = i % 7;
    } else {
      col = i % cols;
      rowi = Math.floor(i / cols);
    }
    var px = col * (cell + gap);
    var py = rowi * (cell + gap);
    var item = days[i] || {};
    var ring = !!item.attestation;
    if (i > lastAtt) {
      ctx.strokeStyle = ring ? "rgba(246,247,247,.28)" : "rgba(255,255,255,.13)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
      continue;
    }
    v = typeof item.events === "number" ? item.events : 0;
    if (!v) ctx.fillStyle = "rgba(255,255,255,.05)";
    else {
      var lvl = Math.min(4, Math.max(1, Math.ceil(v / max * 4)));
      ctx.fillStyle = CAL_FILL[lvl - 1];
    }
    ctx.fillRect(px, py, cell, cell);
    if (ring) {
      ctx.strokeStyle = "rgba(246,247,247,.75)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
    }
  }
}

function drawCals() {
  requestAnimationFrame(function () {
    document.querySelectorAll("canvas.cal").forEach(drawCal);
    document.querySelectorAll("canvas.spark").forEach(drawSpark);
  });
}

function sparkCell(row) {
  if (!row || !row.mint) return dash();
  var s = row && row.sparkline;
  if (!s || s.length < 2) return dash();
  return "<canvas class='spark' data-mint='" + F.esc(row.mint) + "' width='84' height='26'></canvas>";
}

function drawSpark(c) {
  var mint = c.getAttribute("data-mint");
  var row = tokenByMint(mint);
  var s = row && row.sparkline;
  if (!s || s.length < 2) return;
  var vals = s.map(function (p) { return Number(p.usd); }).filter(function (v) { return isFinite(v); });
  if (vals.length < 2) return;
  var dpr = window.devicePixelRatio || 1, W = 84, H = 26;
  c.width = W * dpr;
  c.height = H * dpr;
  c.style.width = W + "px";
  c.style.height = H + "px";
  var ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  if (max - min < 1e-12) max = min + 1e-12;
  function X(i) { return 2 + i / (vals.length - 1) * (W - 6); }
  function Y(v) { return 3 + (1 - (v - min) / (max - min)) * (H - 6); }
  var up = vals[vals.length - 1] >= vals[0];
  ctx.beginPath();
  for (var i = 0; i < vals.length; i++) {
    i === 0 ? ctx.moveTo(X(i), Y(vals[i])) : ctx.lineTo(X(i), Y(vals[i]));
  }
  ctx.strokeStyle = up ? "#4ade80" : "#ef4444";
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(X(vals.length - 1), Y(vals[vals.length - 1]), 2, 0, Math.PI * 2);
  ctx.fillStyle = up ? "#4ade80" : "#ef4444";
  ctx.fill();
}

function tokenCell(row) {
  var mark = (row.symbol || (row.slug || "?")).slice(0, 2);
  var logo = row.logoUrl
    ? "<img class='logo-img' src='" + F.esc(row.logoUrl) + "' alt=''>"
    : "<div class='mono2'>" + F.esc(mark) + "</div>";
  var casa = casaDoc(row);
  var slug = row.slug || (casa && casa.company && casa.company.slug ? casa.company.slug : "");
  var tells = "";
  if (row.casa && row.casa.status === 200 && row.casa.document && row.casa.document.binding) {
    var b = row.casa.document.binding;
    if (b.status === "released") tells += "<span class='tell warn'>released</span>";
    if (b.continuity_break) tells += "<span class='tell warn'>key changed</span>";
  }
  if (row.sample) tells += "<span class='tell'>sample</span>";
  if (row.state && row.state !== "COMPLETED") tells += "<span class='tell'>" + F.esc(row.state.toLowerCase().replace(/_/g, " ")) + "</span>";
  var ticker = row.symbol
    ? "$" + F.esc(row.symbol) + (slug ? " · <b>" + F.esc(slug) + "</b>" : "")
    : (slug ? "<b>" + F.esc(slug) + "</b>" : "");
  var href = hrefForRow(row);
  var name = F.esc(row.name);
  var nameEl = href
    ? "<a class='nm' href='" + F.esc(href) + "'>" + name + "</a>"
    : "<div class='nm'>" + name + "</div>";
  return "<div class='tok'>" + logo + "<span>" + nameEl
    + "<div class='tk'>" + ticker + "</div>"
    + (tells ? "<div class='tells'>" + tells + "</div>" : "")
    + "</span></div>";
}

function sortVal(row, k) {
  if (k === "health") return healthOf(row);
  if (k === "price") return priceOf(row);
  if (k === "chg") return chgOf(row);
  if (k === "vol") return volOf(row);
  if (k === "liq") return liqOf(row);
  if (k === "fdv") return mcapOf(row);
  if (k === "work7") return tasks7dOf(row);
  if (k === "donePct") {
    var t = totalOf(row); var d = doneOf(row);
    return t ? d / t : null;
  }
  if (k === "coverage") return coverageOf(row);
  if (k === "seq") return seqOf(row);
  if (k === "fresh") {
    var hs = hoursSinceOf(row);
    if (hs != null) return -hs;
    var doc = casaDoc(row);
    return doc && doc.attestation && doc.attestation.observed_at
      ? Date.parse(doc.attestation.observed_at) : null;
  }
  return null;
}

function searchBlob(row) {
  var company = row && row.company ? row.company : {};
  var token = row && row.token ? row.token : {};
  var casaCo = {};
  var d = casaDoc(row);
  if (d && d.company) casaCo = d.company;
  return [
    company.name, company.slug, company.description, company.category,
    token.name, token.symbol, token.mint,
    row && row.name, row && row.symbol, row && row.mint, row && row.slug, row && row.description, row && row.category,
    casaCo.name, casaCo.slug,
  ].map(function (v) { return v || ""; }).join(" ").toLowerCase();
}

function matchesQuery(row, query) {
  var q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return searchBlob(row).indexOf(q) >= 0;
}

function matchesKind(row, kind) {
  if (!kind || kind === "all") return true;
  return !!(row && row.kind === kind);
}

function matchesHealth(row, filter) {
  if (!filter || filter === "all") return true;
  if (filter === "leaders") {
    var h = healthOf(row);
    return h != null && h >= 80;
  }
  if (filter === "fresh") {
    if (freshnessOf(row) === "fresh") return true;
    var doc = casaDoc(row);
    if (!doc || !doc.attestation) return false;
    var hs = hoursSinceOf(row);
    return hs != null && hs <= 168;
  }
  if (filter === "review") {
    var band = freshnessOf(row);
    if (band === "stale" || band === "aging") return true;
    var r = casaDoc(row);
    if (!r) return false;
    if (r.attestation && r.attestation.attested === false) return true;
    if (r.binding && r.binding.continuity_break) return true;
    return false;
  }
  return true;
}

function rowVisible(row, query, kind, health) {
  return matchesQuery(row, query) && matchesKind(row, kind) && matchesHealth(row, health);
}

function isEnded(row) {
  return !!(row && row.mint && row.state && ENDED_STATES[row.state]);
}

function matches(row) {
  if (!SHOW_ENDED && isEnded(row)) return false;
  return rowVisible(row, QUERY, KIND, FILTER);
}

function hrefForRow(row) {
  if (row && row.mint) return "/t/" + encodeURIComponent(row.mint);
  if (row && row.slug) return "/c/" + encodeURIComponent(row.slug);
  return null;
}

function median(a) {
  var s = a.slice().sort(function (x, y) { return x - y; });
  var n = s.length;
  if (!n) return null;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function paintAggr(tokens) {
  var fdv = 0, vol = 0, haveFdv = false, haveVol = false;
  var work = 0, haveWork = false;
  var covs = [];
  var signed = 0, attested7 = 0, casaN = 0;
  tokens.forEach(function (row) {
    var m = mcapOf(row);
    if (m != null) { fdv += m; haveFdv = true; }
    var v = volOf(row);
    if (v != null) { vol += v; haveVol = true; }
    var t7 = tasks7dOf(row);
    if (t7 != null) { work += t7; haveWork = true; }
    var d = casaDoc(row);
    if (!d) return;
    casaN += 1;
    if (d.reproduced && typeof d.reproduced.coverage_bp === "number") covs.push(d.reproduced.coverage_bp);
    if (d.reproduced && d.reproduced.signature_valid === true) signed += 1;
    if (attestedWithin7d(d)) attested7 += 1;
  });
  var capx = DATA.capx;
  if (capx && typeof capx.capxUsd === "number") {
    $("ag-px").innerHTML = F.usdPx(capx.capxUsd) + (capx.stale ? "<span class='stale-mark'>stale</span>" : "");
    $("ag-px2").textContent = capx.source ? "Launchpad · " + capx.source : "Launchpad";
  } else {
    $("ag-px").textContent = "--";
    $("ag-px2").textContent = DATA.capxError || "unavailable";
  }
  $("ag-fdv").textContent = haveFdv ? F.usdCompact(fdv) : "--";
  $("ag-fdv2").textContent = haveFdv ? F.ci(fdv) + " USD" : "";
  $("ag-vol").textContent = haveVol ? F.usdCompact(vol) : "--";
  $("ag-vol2").textContent = haveVol ? "sum of listed rows" : "";
  $("ag-work").innerHTML = haveWork ? F.ci(work) + "<span class='u'>tasks</span>" : "--";
  var med = median(covs);
  $("ag-cov").innerHTML = med == null ? "--" : "<span class='lit'>" + F.bp(med) + "</span><span class='u'>of events</span>";
  $("ag-signed").innerHTML = casaN ? signed + "<span class='u'>of " + casaN + "</span>" : "--";
  $("ag-fresh").innerHTML = casaN ? attested7 + "<span class='u'>of " + casaN + "</span>" : "--";
}

function paintPodium(tokens) {
  var ranked = tokens.filter(function (row) {
    return healthOf(row) != null && (liveCasa(row) || row.kind === "company_with_token" || row.kind === "company_without_token");
  }).sort(function (a, b) {
    var dh = healthOf(b) - healthOf(a);
    if (dh) return dh;
    var ca = coverageOf(a) || 0, cb = coverageOf(b) || 0;
    return cb - ca;
  }).slice(0, 3);
  if (!ranked.length) {
    $("podium").innerHTML = "<p class='sbnote' style='margin:0'>No live companies yet. Tokens without Casa are listed below. The podium fills when a mint returns a live Casa document.</p>";
    return;
  }
  $("podium").innerHTML = ranked.map(function (row, i) {
    var h = healthOf(row);
    var d = liveCasa(row);
    var level = "";
    if (d && d.progress && d.progress.level_name) level = d.progress.level_name;
    else if (d && d.progress && LEVEL_NAMES[d.progress.level]) level = LEVEL_NAMES[d.progress.level];
    var bits = [];
    var cov = coverageOf(row);
    if (cov != null) bits.push(F.bp(cov) + " checkable");
    if (d && d.attestation && d.attestation.attested === true) bits.push("attested");
    else if (d && d.attestation && d.attestation.freshness) bits.push(d.attestation.freshness);
    else if (row.freshness) bits.push(row.freshness);
    var mark = (row.symbol || row.slug || "?").slice(0, 3);
    var sub = row.symbol ? "$" + F.esc(row.symbol) : (row.slug ? F.esc(row.slug) : "");
    var href = hrefForRow(row);
    var open = href ? "<a class='pod' href='" + href + "'>" : "<div class='pod'>";
    var close = href ? "</a>" : "</div>";
    return open
      + "<div class='podrank'>" + (i + 1) + "</div>"
      + "<div class='podmark'>" + F.esc(mark) + "</div>"
      + "<div class='podmain'><div class='podname'>" + F.esc(row.name) + "</div>"
      + "<div class='podsub'>" + sub + (level ? " · <b>" + F.esc(level) + "</b>" : "") + "</div>"
      + "<div class='podbits'>" + F.esc(bits.join(" · ")) + "</div></div>"
      + "<div class='podscore'><em>" + h + "</em><span class='u'>health</span>"
      + "<span class='podbar'><i style='width:" + h + "%'></i></span></div>" + close;
  }).join("");
}

function sortList(list, table) {
  var s = SORT[table];
  list.sort(function (a, b) {
    var va = sortVal(a, s.k), vb = sortVal(b, s.k);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return va === vb ? 0 : (va > vb ? s.dir : -s.dir);
  });
  return list;
}

function rowOpen(x, faded) {
  return "<tr class='" + faded + "'"
    + (x.mint ? " data-mint='" + F.esc(x.mint) + "'" : "")
    + (!x.mint && x.slug ? " data-slug='" + F.esc(x.slug) + "'" : "")
    + ">";
}

function fadedOf(x) {
  var d = casaDoc(x);
  return d && d.binding && d.binding.status === "released" ? " faded" : "";
}

function marketChipCell(x) {
  if (x.kind !== "company_with_token") return dash();
  var p = priceOf(x);
  var m = mcapOf(x);
  if (p == null && m == null) return "<span class='lit'>token listed</span>";
  return "<span class='d1'>" + (p == null ? "" : F.usdPx(p))
    + (m != null ? " <span class='u'>FDV " + F.usdCompact(m) + "</span>" : "") + "</span>";
}

function tokenRowHtml(x, i) {
  var stale = x.marketPerformance && x.marketPerformance.stale;
  return rowOpen(x, fadedOf(x))
    + "<td class='l'><span class='rk'>" + (i + 1) + "</span></td>"
    + "<td class='l'>" + tokenCell(x) + "</td>"
    + "<td class='price'>" + (priceOf(x) == null ? dash() : "<span class='d1'>" + F.usdPx(priceOf(x)) + (stale ? " <span class='stale-mark'>stale</span>" : "") + "</span>") + "</td>"
    + "<td>" + chgCell(chgOf(x)) + "</td>"
    + "<td>" + dualUsd(volOf(x), stale) + "</td>"
    + "<td>" + dualUsd(liqOf(x), stale) + "</td>"
    + "<td>" + dualUsd(mcapOf(x), stale) + "</td>"
    + "<td>" + sparkCell(x) + "</td>"
    + "<td>" + (healthOf(x) == null ? "<span style='color:var(--t600)'>not bound</span>" : scoreCell(healthOf(x))) + "</td>"
    + "</tr>";
}

function companyRowHtml(x, i) {
  var t7 = tasks7dOf(x);
  return rowOpen(x, fadedOf(x))
    + "<td class='l'><span class='rk'>" + (i + 1) + "</span></td>"
    + "<td class='l'>" + tokenCell(x) + "</td>"
    + "<td>" + scoreCell(healthOf(x)) + "</td>"
    + "<td class='work'>" + (t7 == null ? dash() : F.ci(t7)) + "</td>"
    + "<td class='calcell'>" + calCell(x) + "</td>"
    + "<td>" + buildmapCell(x) + "</td>"
    + "<td>" + coverageCell(coverageOf(x)) + "</td>"
    + "<td>" + (seqOf(x) == null ? dash() : seqOf(x)) + "</td>"
    + "<td>" + attestedCell(x) + "</td>"
    + "<td>" + marketChipCell(x) + "</td>"
    + "</tr>";
}

function paintSortArrows() {
  [["table-tokens", "tokens"], ["table-companies", "companies"]].forEach(function (pair) {
    var s = SORT[pair[1]];
    document.querySelectorAll("#" + pair[0] + " thead th[data-k]").forEach(function (th) {
      var base = th.textContent.replace(/[↑↓]/g, "").trim();
      th.innerHTML = base + (th.getAttribute("data-k") === s.k ? "<span class='arr'>" + (s.dir < 0 ? "↓" : "↑") + "</span>" : "");
    });
  });
}

function render() {
  if (!DATA) return;
  var all = listed();
  var vis = all.filter(matches);
  var tokensList = sortList(vis.filter(function (r) { return !!r.mint; }), "tokens");
  var companiesList = sortList(vis.filter(function (r) {
    return r.kind === "company_without_token" || r.kind === "company_with_token";
  }), "companies");

  $("rows-tokens").innerHTML = tokensList.map(tokenRowHtml).join("")
    || "<tr><td colspan='9' style='text-align:center; color:var(--t500); padding:28px'>no tokens match</td></tr>";
  $("rows-companies").innerHTML = companiesList.map(companyRowHtml).join("")
    || "<tr><td colspan='10' style='text-align:center; color:var(--t500); padding:28px'>no companies match</td></tr>";

  var endedHidden = SHOW_ENDED ? 0 : all.filter(function (r) {
    return isEnded(r) && rowVisible(r, QUERY, KIND, FILTER);
  }).length;
  $("tokens-note").textContent = tokensList.length + " listed"
    + (endedHidden ? " · " + endedHidden + " ended hidden" : "");
  $("companies-note").textContent = companiesList.length + " attesting";

  $("hint").textContent = vis.length === all.length
    ? "open a row"
    : vis.length + " of " + all.length + " rows";
  paintSortArrows();
  drawCals();
}

function fmtCountdown(iso) {
  var ms = Date.parse(iso) - Date.now();
  if (!isFinite(ms)) return "";
  if (ms <= 0) return "closing";
  var h = Math.floor(ms / 3600000);
  var m = Math.floor((ms % 3600000) / 60000);
  return (h > 0 ? h + "h " : "") + m + "m left";
}

function paintLive() {
  var el = $("live-rail");
  if (!el) return;
  var live = ((DATA && DATA.tokens) || []).filter(function (t) {
    return t.state === "FUNDRAISING";
  });
  if (!live.length) { el.hidden = true; return; }
  el.hidden = false;
  $("live-items").innerHTML = live.map(function (t) {
    return "<a class='liveitem' href='https://launchpad.capx.ai/presales/" + F.esc(t.id) + "' target='_blank' rel='noopener noreferrer'>"
      + "<b>" + F.esc(t.name) + "</b><span class='tk'>$" + F.esc(t.symbol) + "</span>"
      + "<span class='lt'>" + F.esc(fmtCountdown(t.fundraisingDeadlineAt)) + "</span>"
      + "<span class='lq'>" + F.esc(F.capxLabel(t.qualifyingNetCapxBase)) + " qualifying · " + (t.participantCount || 0) + " qualified</span>"
      + "<span class='go'>Join on Launchpad ↗</span></a>";
  }).join("");
}

function paintFeed(rows) {
  var el = $("attfeed");
  if (!el) return;
  var items = rows.map(function (r) {
    var d = casaDoc(r);
    if (!d || !d.attestation) return null;
    var hs = hoursSinceOf(r);
    if (hs == null && d.attestation.observed_at) {
      var t = Date.parse(d.attestation.observed_at);
      if (isFinite(t)) hs = (Date.now() - t) / 3600000;
    }
    if (hs == null || !isFinite(hs)) return null;
    return { row: r, hours: hs };
  }).filter(Boolean).sort(function (x, y) { return x.hours - y.hours; }).slice(0, 5);
  if (!items.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = "<span class='label'>Latest attestations</span>" + items.map(function (it) {
    var href = hrefForRow(it.row);
    var inner = "<b>" + F.esc(it.row.name) + "</b> attested " + F.esc(F.hoursAgo(it.hours));
    return href
      ? "<a class='att' href='" + F.esc(href) + "'>" + inner + "</a>"
      : "<span class='att'>" + inner + "</span>";
  }).join("");
}

function boot(data) {
  DATA = data;
  if (data.sample) {
    $("sample-pill").hidden = false;
    $("foot").textContent = "capx · every agent token pairs against CAPX · sample data";
  }
  var err = [];
  if (data.directoryError) err.push("Launchpad directory: " + data.directoryError);
  if (data.casaError) err.push("Casa companies: " + data.casaError);
  if (data.capxError) err.push("CAPX quote: " + data.capxError);
  if (data.codex && data.codex.configured === false) {
    err.push("Codex key unset: Price 7d and the token chart have no series until CODEX_API_KEY is exported");
  } else if (data.codex && data.codex.sparkError) {
    err.push("Codex: " + data.codex.sparkError);
  }
  if (err.length) {
    $("err").hidden = false;
    $("err").textContent = err.join(" · ");
  }
  var rows = listed();
  paintAggr(rows);
  paintPodium(rows);
  paintFeed(rows);
  paintLive();
  window.setInterval(paintLive, 30000);
  render();
}

function bindSort(tableId, key) {
  var head = document.querySelector("#" + tableId + " thead");
  if (!head) return;
  function apply(th) {
    var k = th.getAttribute("data-k");
    if (!k) return;
    var s = SORT[key];
    if (s.k === k) s.dir = -s.dir;
    else { s.k = k; s.dir = -1; }
    render();
  }
  head.addEventListener("click", function (e) {
    var th = e.target.closest("th[data-k]");
    if (th) apply(th);
  });
  head.addEventListener("keydown", function (e) {
    var th = e.target.closest("th[data-k]");
    if (!th) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      apply(th);
    }
  });
}
bindSort("table-tokens", "tokens");
bindSort("table-companies", "companies");

function openRow(e) {
  if (e.target.closest("a")) return;
  var tr = e.target.closest("tr[data-mint], tr[data-slug]");
  if (!tr) return;
  var mint = tr.getAttribute("data-mint");
  if (mint) location.href = "/t/" + mint;
  else location.href = "/c/" + tr.getAttribute("data-slug");
}
$("rows-tokens").addEventListener("click", openRow);
$("rows-companies").addEventListener("click", openRow);
$("q").addEventListener("input", function () {
  QUERY = this.value.trim();
  render();
});
$("chips").addEventListener("click", function (e) {
  var b = e.target.closest(".fchip");
  if (!b) return;
  if (b.hasAttribute("data-ended")) {
    SHOW_ENDED = !SHOW_ENDED;
    b.classList.toggle("on", SHOW_ENDED);
    b.setAttribute("aria-pressed", SHOW_ENDED ? "true" : "false");
  } else if (b.hasAttribute("data-kind")) {
    var next = b.getAttribute("data-kind");
    KIND = KIND === next ? "all" : next;
    document.querySelectorAll(".fchip[data-kind]").forEach(function (c) {
      var on = c.getAttribute("data-kind") === KIND;
      c.classList.toggle("on", on);
      c.setAttribute("aria-pressed", on ? "true" : "false");
    });
  } else {
    FILTER = b.getAttribute("data-f");
    document.querySelectorAll(".fchip[data-f]").forEach(function (c) {
      var on = c.getAttribute("data-f") === FILTER;
      c.classList.toggle("on", on);
      c.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  render();
});

fetch("/api/market", { cache: "no-store" })
  .then(function (r) { return r.json(); })
  .then(boot)
  .catch(function (err) {
    $("err").hidden = false;
    $("err").textContent = "Terminal could not load the market: " + err.message;
  });
