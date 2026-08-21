"use strict";
var F = window.CAPX_FMT;
var $ = function (id) { return document.getElementById(id); };
var QUERY = "";
var FILTER = "all";
var SORTK = "fdv";
var DIR = -1;
var DATA = null;

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

function fromComposite(row) {
  var company = row && row.company ? row.company : null;
  var token = row && row.token ? row.token : null;
  var market = row && row.market ? row.market : null;
  var mint = token && token.mint ? token.mint : null;
  var src = tokenByMint(mint);
  var fdv = market ? market.fdv_usd : null;
  var vol = market ? market.volume_24h_usd : null;
  var liq = market ? market.liquidity_usd : null;
  var chg = market ? market.change_24h_percent : null;
  var px = market ? market.price_usd : null;
  var hasMarket = fdv != null || vol != null || liq != null || chg != null || px != null;
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
    sample: !!(src && src.sample),
    marketPerformance: hasMarket ? {
      currentMarketCapUsd: fdv,
      volume24hUsd: vol,
      liquidityUsd: liq,
      priceChange24hPercent: chg,
      stale: !!(src && src.marketPerformance && src.marketPerformance.stale),
    } : null,
    sparkline: src ? src.sparkline : null,
    casa: src ? src.casa : null,
    healthScore: company && typeof company.health_score === "number" ? company.health_score : null,
    freshness: company ? company.freshness : null,
    description: company ? company.description : (src ? src.description : ""),
    category: company ? company.category : "",
  };
}

function listed() {
  if (DATA && Array.isArray(DATA.rows) && DATA.rows.length) {
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
  return typeof row.healthScore === "number" ? row.healthScore : null;
}
function freshnessOf(row) {
  var d = casaDoc(row);
  if (d && d.attestation && d.attestation.freshness) return d.attestation.freshness;
  return row && row.freshness ? row.freshness : null;
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
  if (!row || !row.mint) return dash();
  var days = calDays(row);
  if (!days || !days.length) return dash();
  return "<canvas class='cal' data-mint='" + F.esc(row.mint) + "' width='" + CAL_W + "' height='" + CAL_H + "'></canvas>";
}

function lastAttestedIndex(days) {
  var last = -1;
  for (var i = 0; i < days.length; i++) {
    if (days[i] && days[i].attestation) last = i;
  }
  return last;
}

function drawCal(c) {
  var mint = c.getAttribute("data-mint");
  var row = tokenByMint(mint);
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
  return "<div class='tok'>" + logo + "<span><div class='nm'>" + F.esc(row.name) + "</div>"
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

function matches(row) {
  if (QUERY) {
    var q = QUERY.toLowerCase();
    var blob = [row.name, row.symbol, row.mint, row.slug, row.description, row.category]
      .map(function (v) { return v || ""; })
      .join(" ")
      .toLowerCase();
    var d = casaDoc(row);
    if (d && d.company) blob += " " + (d.company.slug || "") + " " + (d.company.name || "");
    if (blob.indexOf(q) < 0) return false;
  }
  if (FILTER === "leaders") {
    var h = healthOf(row);
    return h != null && h >= 80;
  }
  if (FILTER === "fresh") {
    if (freshnessOf(row) === "fresh") return true;
    var doc = casaDoc(row);
    if (!doc || !doc.attestation) return false;
    var hs = hoursSinceOf(row);
    return hs != null && hs <= 168;
  }
  if (FILTER === "review") {
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
    var d = casaDoc(row);
    if (!d) return;
    casaN += 1;
    if (d.binding && d.binding.status === "live"
      && d.progress && d.progress.work && typeof d.progress.work.tasks_7d === "number") {
      work += d.progress.work.tasks_7d;
      haveWork = true;
    }
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
    var open = row.mint
      ? "<a class='pod' href='/t/" + encodeURIComponent(row.mint) + "'>"
      : "<div class='pod'>";
    var close = row.mint ? "</a>" : "</div>";
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

function render() {
  if (!DATA) return;
  var all = listed();
  var list = all.filter(matches);
  list.sort(function (a, b) {
    var va = sortVal(a, SORTK), vb = sortVal(b, SORTK);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return va === vb ? 0 : (va > vb ? DIR : -DIR);
  });
  var html = "";
  for (var i = 0; i < list.length; i++) {
    var x = list[i];
    var stale = x.marketPerformance && x.marketPerformance.stale;
    var faded = "";
    var d = casaDoc(x);
    if (d && d.binding && d.binding.status === "released") faded = " faded";
    var t7 = tasks7dOf(x);
    html += "<tr class='" + faded + "'" + (x.mint ? " data-mint='" + F.esc(x.mint) + "'" : "") + ">"
      + "<td class='l'><span class='rk'>" + (i + 1) + "</span></td>"
      + "<td class='l'>" + tokenCell(x) + "</td>"
      + "<td>" + scoreCell(healthOf(x)) + "</td>"
      + "<td class='price'>" + (priceOf(x) == null ? dash() : "<span class='d1'>" + F.usdPx(priceOf(x)) + (stale ? " <span class='stale-mark'>stale</span>" : "") + "</span>") + "</td>"
      + "<td>" + chgCell(chgOf(x)) + "</td>"
      + "<td>" + dualUsd(volOf(x), stale) + "</td>"
      + "<td>" + dualUsd(liqOf(x), stale) + "</td>"
      + "<td>" + dualUsd(mcapOf(x), stale) + "</td>"
      + "<td>" + sparkCell(x) + "</td>"
      + "<td class='work'>" + (t7 == null ? dash() : F.ci(t7)) + "</td>"
      + "<td class='calcell'>" + calCell(x) + "</td>"
      + "<td>" + buildmapCell(x) + "</td>"
      + "<td>" + coverageCell(coverageOf(x)) + "</td>"
      + "<td>" + (seqOf(x) == null ? dash() : seqOf(x)) + "</td>"
      + "<td>" + attestedCell(x) + "</td>"
      + "</tr>";
  }
  $("rows").innerHTML = html || "<tr><td colspan='15' style='text-align:center; color:var(--t500); padding:36px'>no rows match</td></tr>";
  $("hint").textContent = list.length === all.length
    ? "click a token to open"
    : list.length + " of " + all.length + " rows";
  document.querySelectorAll("thead th[data-k]").forEach(function (th) {
    var base = th.textContent.replace(/[↑↓]/g, "").trim();
    th.innerHTML = base + (th.getAttribute("data-k") === SORTK ? "<span class='arr'>" + (DIR < 0 ? "↓" : "↑") + "</span>" : "");
  });
  drawCals();
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
  render();
}

document.querySelector("thead").addEventListener("click", function (e) {
  var th = e.target.closest("th[data-k]");
  if (!th) return;
  var k = th.getAttribute("data-k");
  if (SORTK === k) DIR = -DIR;
  else { SORTK = k; DIR = -1; }
  render();
});
$("rows").addEventListener("click", function (e) {
  var tr = e.target.closest("tr[data-mint]");
  if (!tr) return;
  location.href = "/t/" + tr.getAttribute("data-mint");
});
$("q").addEventListener("input", function () {
  QUERY = this.value.trim();
  render();
});
$("chips").addEventListener("click", function (e) {
  var b = e.target.closest(".fchip");
  if (!b) return;
  FILTER = b.getAttribute("data-f");
  document.querySelectorAll(".fchip").forEach(function (c) {
    c.classList.toggle("on", c.getAttribute("data-f") === FILTER);
  });
  render();
});

fetch("/api/market", { cache: "no-store" })
  .then(function (r) { return r.json(); })
  .then(boot)
  .catch(function (err) {
    $("err").hidden = false;
    $("err").textContent = "Terminal could not load the market: " + err.message;
  });
