"use strict";
var F = window.CAPX_FMT;
var $ = function (id) { return document.getElementById(id); };

var CASA_ONLY = [
  "tile-work", "tile-pulse", "tile-cons", "tile-vitals",
  "tile-repro", "tile-wire", "tile-env", "tile-ladder", "tile-judge", "tile-dept",
];

var DOC = null;
var TOKEN = null;
var DAYS = [];
var LAST_COVERED = -1;
var HEAT_SPEC = { kind: "1d", layout: "weeks", label: "1d" };
var PRICES = null;
var CANDLES = [];
var CANDLE_RES = "60";
var EVENTS = [];
var TF = 30;
var hoverIdx = -1;
var chart = null;
var cctx = null;
var GH = { first: 0, weeks: 0 };
var chartBound = false;
var pulseBound = false;
var pulseDefaultRead = "";
var resizeBound = false;

function mintFromPath() {
  var m = location.pathname.match(/^\/t\/([^/]+)$/);
  return m ? decodeURIComponent(m[1]) : "";
}

function show(id, on) {
  var el = $(id);
  if (el) el.hidden = !on;
}

function casaDoc(token) {
  if (!token || !token.casa) return null;
  if (token.casa.status === 404) return null;
  return token.casa.document || null;
}

function isUnobserved(doc) {
  if (!doc) return true;
  if (doc.progress == null) return true;
  if (doc.attestation && doc.attestation.freshness === "unobserved") return true;
  return false;
}

function finite(n) {
  return n != null && isFinite(Number(n));
}

function parseUtc(iso) {
  if (!iso) return null;
  var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  var t = Date.parse(iso);
  if (!isFinite(t)) return null;
  var d = new Date(t);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function utcKey(iso) {
  var d = parseUtc(iso);
  if (!d) return "";
  var y = d.getUTCFullYear();
  var mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  var da = String(d.getUTCDate()).padStart(2, "0");
  return y + "-" + mo + "-" + da;
}

function fmtDay(d) {
  if (typeof d === "string") {
    if (HEAT_SPEC && HEAT_SPEC.kind !== "1d" && d.indexOf("T") >= 0) {
      var dt = new Date(d);
      if (isFinite(dt.getTime())) {
        return dt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC";
      }
    }
    d = parseUtc(d);
  }
  if (!d) return "--";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function fmtFounded(iso) {
  var d = parseUtc(iso);
  if (!d) return "";
  return "Founded " + d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function stateLabel(s) {
  return s ? String(s).toLowerCase().replace(/_/g, " ") : "";
}

function looksLikePath(s) {
  s = String(s || "");
  if (!s) return false;
  if (/^(\/|[A-Za-z]:\\|~\/)/.test(s)) return true;
  if (s.indexOf("\\") >= 0) return true;
  if (/\.(jsonl?|ts|js|mjs|py|go|rs)$/i.test(s) && s.indexOf("/") >= 0) return true;
  return false;
}

function lastCoveredIndex(days, att) {
  var last = -1;
  var i;
  for (i = 0; i < days.length; i++) {
    if (days[i] && days[i].attestation) last = i;
  }
  if (att && att.freshness === "unobserved") return last;
  if (att && finite(att.hours_since)) {
    var end = days.length - 1 - Math.floor(Number(att.hours_since) / 24);
    if (end > last) last = end;
  }
  if (last > days.length - 1) last = days.length - 1;
  return last;
}

function priceSeriesFor(token, days) {
  var raw = null;
  if (token && token.priceSeries && Array.isArray(token.priceSeries.points)) {
    raw = token.priceSeries.points;
  }
  raw = raw || (token && (token.marketHistory || token.series));
  if (token && token.marketPerformance && Array.isArray(token.marketPerformance.history)) {
    raw = raw || token.marketPerformance.history;
  }
  if (!Array.isArray(raw) || raw.length < 2) return null;
  var byKey = Object.create(null);
  var byT = Object.create(null);
  var i, p, usd, key, ts;
  for (i = 0; i < raw.length; i++) {
    p = raw[i];
    if (p == null || typeof p === "number") continue;
    usd = p.usd != null ? p.usd : (p.priceUsd != null ? p.priceUsd : (p.price != null ? p.price : (p.close != null ? p.close : p.value)));
    if (!finite(usd)) continue;
    key = p.iso || p.date || p.day || utcKey(p.t || p.timestamp || p.asOf || p.time);
    ts = typeof p.t === "number" ? (p.t < 1e12 ? p.t * 1000 : p.t) : Date.parse(p.iso || p.date || "");
    if (key) byKey[key] = Number(usd);
    if (isFinite(ts)) byT[Math.floor(ts / 60000)] = Number(usd);
  }
  var out = days.map(function (d) {
    if (!d) return null;
    if (d.iso && byKey[d.iso] != null) return byKey[d.iso];
    if (d.date && byKey[d.date] != null) return byKey[d.date];
    if (typeof d.t === "number" && byT[Math.floor(d.t / 60000)] != null) return byT[Math.floor(d.t / 60000)];
    return null;
  });
  var hits = 0;
  for (i = 0; i < out.length; i++) if (out[i] != null) hits++;
  var need = Math.max(2, Math.min(7, Math.floor(days.length / 4) || 2));
  if (hits < need) return null;
  return out;
}

function decisionLookup(doc) {
  var map = Object.create(null);
  var items = doc && doc.decisions && Array.isArray(doc.decisions.items) ? doc.decisions.items : [];
  items.forEach(function (it) {
    var k = utcKey(it.ts);
    if (k) map[k] = it;
  });
  return map;
}

function setCasaVisible(on) {
  CASA_ONLY.forEach(function (id) { show(id, on); });
  document.querySelectorAll(".casa-only").forEach(function (el) { el.hidden = !on; });
  var price = $("tile-price");
  if (price) price.classList.toggle("wide", !on);
}

function paintBanners(doc) {
  var el = $("continuity");
  if (!el) return;
  var msgs = [];
  if (doc && doc.binding && doc.binding.status === "released") {
    msgs.push("Casa was connected. This launch ended. Not an active company.");
  }
  if (doc && doc.binding && doc.binding.continuity_break) {
    msgs.push("The live Casa key for this mint changed once.");
  }
  if (msgs.length) {
    el.hidden = false;
    el.textContent = msgs.join(" ");
  } else {
    el.hidden = true;
    el.textContent = "";
  }
}

function paintIdentity(token, doc) {
  var mark = $("id-mark");
  if (token.logoUrl) {
    mark.innerHTML = "<img src='" + F.esc(token.logoUrl) + "' alt=''>";
  } else {
    mark.textContent = (token.symbol || "?").slice(0, 3);
  }
  $("id-name").textContent = token.name || token.symbol || "Token";
  document.title = (token.name || token.symbol || "Token") + " · $" + (token.symbol || "") + " · Capx Terminal";

  $("id-pair").innerHTML = "<b>$" + F.esc(token.symbol || "") + "</b> / CAPX";

  var level = "";
  if (doc && doc.progress) {
    if (doc.progress.level_name) {
      level = "Level " + doc.progress.level + " · " + doc.progress.level_name;
    } else if (typeof doc.progress.level === "number") {
      level = "Level " + doc.progress.level;
    }
  } else if (doc && doc.attestation && doc.attestation.freshness === "unobserved") {
    level = "unobserved";
  } else if (!doc) {
    level = stateLabel(token.state);
  }
  $("id-level").textContent = level;

  var founded = "";
  if (doc && doc.company && doc.company.created_at) founded = fmtFounded(doc.company.created_at);
  $("id-founded").textContent = founded;

  var harnessBits = [];
  if (doc && doc.company && (doc.company.name || doc.company.slug)) {
    harnessBits.push(doc.company.name || doc.company.slug);
  }
  var h = doc && doc.progress && doc.progress.driver_harness;
  if (!h && doc && doc.envelope && doc.envelope.subject) {
    h = doc.envelope.subject.driver_harness || doc.envelope.subject.harness;
  }
  if (h && h.name) {
    harnessBits.push("Built with " + h.name + (h.version ? " " + h.version : ""));
  }
  $("id-harness").innerHTML = harnessBits.map(function (b, i) {
    return (i ? "<span class='s'> · </span>" : "") + "<span class='lit'>" + F.esc(b) + "</span>";
  }).join("");

  var mission = "";
  if (doc && doc.company && doc.company.one_liner) mission = doc.company.one_liner;
  if (!mission && token.description) {
    mission = String(token.description).split("\n")[0].slice(0, 180);
  }
  $("id-mission").textContent = mission;
  bindMore(mission);

  paintProvenance(token, doc);
}

function paintProvenance(token, doc) {
  var parts = [];
  var a = doc && doc.attestation;
  var R = doc && doc.reproduced;
  var p = doc && doc.progress;
  var work = p && p.work;

  if (!doc) {
    parts.push("<span class='pv'>" + F.esc(stateLabel(token.state) || "listed") + "</span>");
    parts.push("<span class='pv'>no Casa bind</span>");
    $("prov").innerHTML = "<div class='provrow'>" + parts.join("") + "</div>";
    return;
  }

  if (a && a.freshness === "unobserved") {
    parts.push("<span class='pv st-dormant'>unobserved</span>");
    parts.push("<span class='pv'>no pushes yet</span>");
  } else {
    if (a && a.freshness) {
      var st = a.freshness === "fresh" ? "st-fresh" : (a.freshness === "stale" || a.freshness === "aging" ? "st-stale" : "");
      parts.push("<span class='pv " + st + "'>" + F.esc(a.freshness) + "</span>");
    }
    if (a && finite(a.sequence)) parts.push("<span class='pv'>seq " + a.sequence + "</span>");
    if (a) {
      parts.push(a.attested
        ? "<span class='pv ok'>attested</span>"
        : "<span class='pv bad'>not attested</span>");
    }
    if (R && R.chain_intact === true) parts.push("<span class='pv ok'>chain intact</span>");
    else if (R && R.chain_intact === false) parts.push("<span class='pv bad'>chain broken</span>");
    if (R && R.signature_valid === true) parts.push("<span class='pv ok'>signed</span>");
    else if (R && R.signature_valid === false) parts.push("<span class='pv bad'>unsigned</span>");
    if (work && finite(work.tasks_total)) parts.push("<span class='pv'>" + F.ci(work.tasks_total) + " events</span>");
    if (R && finite(R.coverage_bp)) {
      parts.push("<span class='pv " + (R.coverage_bp < 5000 ? "bad" : "") + "'>" + F.bp(R.coverage_bp) + " graph-checkable</span>");
    }
    if (a && finite(a.health_score)) parts.push("<span class='pv'>health " + a.health_score + "</span>");
    if (R && R.violations) {
      var v = R.violations;
      var vn = (v.dag || 0) + (v.dataflow || 0) + (v.level || 0) + (v.level_gate || 0) + (v.other || 0);
      if (vn) parts.push("<span class='pv bad'>" + vn + " violation" + (vn === 1 ? "" : "s") + "</span>");
    }
    if (R && R.catalog_matches === false) parts.push("<span class='pv warn'>catalog mismatch</span>");
  }
  if (doc.binding && doc.binding.continuity_break) parts.push("<span class='pv warn'>key changed once</span>");
  if (doc.binding && doc.binding.status === "released") parts.push("<span class='pv warn'>released</span>");

  var sub = "";
  if (a && a.freshness === "unobserved") {
    sub = "Bound, never pushed. health_score is unobserved.";
  } else if (a && (finite(a.hours_since) || a.observed_at)) {
    var when = finite(a.hours_since) ? F.hoursAgo(a.hours_since) : F.ago(a.observed_at);
    sub = "Last attestation " + when + ", Casa observed_at";
  }
  $("prov").innerHTML = "<div class='provrow'>" + parts.join("") + "</div>"
    + (sub ? "<div class='provsub'>" + F.esc(sub) + "</div>" : "");
}

function paintMarket(token, capx) {
  var mp = token.marketPerformance;
  var price = F.tokenPriceUsd(token);
  var stale = mp && mp.stale;
  if (price == null) {
    $("m-price").textContent = "not launched";
    $("m-price-note").textContent = "No pool snapshot yet. Raise facts below are Launchpad, not a price.";
    $("m-chg").innerHTML = "";
  } else {
    $("m-price").textContent = F.usdPx(price);
    var note = "USD from Launchpad mcap / 1,000,000,000";
    if (stale) note += " · stale";
    if (capx && capx.capxUsd) note += " · CAPX " + F.usdPx(capx.capxUsd);
    $("m-price-note").textContent = note;
    var chg = mp && mp.priceChange24hPercent;
    $("m-chg").innerHTML = typeof chg === "number"
      ? "<span class='" + (chg >= 0 ? "up" : "dn") + "'>" + F.pct(chg) + "</span> 24h"
      : "";
  }
  $("m-fdv").textContent = mp && mp.currentMarketCapUsd != null ? F.usdCompact(mp.currentMarketCapUsd) : "--";
  $("m-liq").textContent = mp && mp.liquidityUsd != null ? F.usdCompact(mp.liquidityUsd) : "--";
  $("m-vol").textContent = mp && mp.volume24hUsd != null ? F.usdCompact(mp.volume24hUsd) : "--";
  paintKeysMarket(token, mp, price);

  show("raise-row", true);
  $("m-state").textContent = token.state ? stateLabel(token.state) : "--";
  $("m-raised").textContent = F.capxLabel(token.qualifyingNetCapxBase);
  $("m-parts").textContent = token.participantCount != null ? String(token.participantCount) : "--";
  $("m-deadline").textContent = token.fundraisingDeadlineAt
    ? new Date(token.fundraisingDeadlineAt).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC")
    : "--";
  paintTokenLinks(token);
}

// Phone key-numbers strip (plan 2026-08-29-003). Same facts as the market tile,
// six cells under the header; CSS hides the tile above 700px.
function setKey(id, html, cls) {
  var el = $(id);
  if (!el) return;
  el.innerHTML = html;
  el.className = "v" + (el.className.indexOf("lit") >= 0 ? " lit" : "") + (cls ? " " + cls : "");
}

function paintKeysMarket(token, mp, price) {
  var tile = $("tile-keys");
  if (!tile) return;
  tile.hidden = false;
  setKey("k-price", price == null ? "not launched" : F.usdPx(price));
  var chg = mp && mp.priceChange24hPercent;
  setKey("k-chg", typeof chg === "number" ? F.pct(chg) : "--", typeof chg === "number" ? (chg >= 0 ? "up" : "dn") : "");
  setKey("k-fdv", mp && mp.currentMarketCapUsd != null ? F.usdCompact(mp.currentMarketCapUsd) : "--");
  setKey("k-liq", mp && mp.liquidityUsd != null ? F.usdCompact(mp.liquidityUsd) : "--");
  setKey("k-vol", mp && mp.volume24hUsd != null ? F.usdCompact(mp.volume24hUsd) : "--");
  // launch valuation to current market cap, a Launchpad market fact
  var roi = mp && typeof mp.roiMultiple === "number" && isFinite(mp.roiMultiple) ? mp.roiMultiple : null;
  setKey("k-roi", roi == null ? "--" : (roi >= 10 ? roi.toFixed(0) : roi.toFixed(2)) + "x", roi == null ? "" : (roi >= 1 ? "up" : "dn"));
}

function paintKeysCasa(doc) {
  var row = $("keys-casa");
  if (!row) return;
  var a = doc && doc.attestation, p = doc && doc.progress, r = doc && doc.reproduced;
  if (!doc || !(a || p)) { row.hidden = true; return; }
  row.hidden = false;
  setKey("k-health", a && typeof a.health_score === "number" ? String(a.health_score) : "--");
  var lv = p && typeof p.level === "number" ? "L" + p.level + (Array.isArray(p.levels) && p.levels.length ? " of " + (p.levels.length - 1) : "") : "--";
  setKey("k-level", F.esc(lv));
  setKey("k-tasks", p && p.work && typeof p.work.tasks_7d === "number" ? F.ci(p.work.tasks_7d) : "--");
  setKey("k-cov", r && typeof r.coverage_bp === "number" ? F.bp(r.coverage_bp) : "--");
  setKey("k-chain", r ? (r.chain_intact === true ? "intact" : (r.chain_intact === false ? "broken" : "--")) : "--", r && r.chain_intact === false ? "dn" : "");
  setKey("k-att", a && typeof a.hours_since === "number" ? F.esc(F.hoursAgo(a.hours_since)) : (a && a.freshness ? F.esc(a.freshness) : "--"));
}

// Description clamp: two lines on phones, a "more" toggle when there is more to read.
function bindMore(text) {
  var btn = $("id-more");
  if (!btn) return;
  var tile = btn.closest(".t-id");
  btn.hidden = !(text && text.length > 90);
  if (btn._bound) return;
  btn._bound = true;
  btn.addEventListener("click", function () {
    var open = tile.classList.toggle("open");
    btn.textContent = open ? "less" : "more";
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

function paintTokenLinks(token) {
  var el = $("m-links");
  if (!el) return;
  var out = [];
  function link(href, label) {
    out.push("<a href='" + F.esc(href) + "' target='_blank' rel='noopener noreferrer'>" + F.esc(label) + " ↗</a>");
  }
  if (token.mint) link("https://solscan.io/token/" + token.mint, "Mint");
  if (token.poolAddress) link("https://solscan.io/account/" + token.poolAddress, "Pool");
  if (token.id) link("https://launchpad.capx.ai/presales/" + token.id, "Launchpad presale");
  var links = token.links || {};
  Object.keys(links).forEach(function (key) {
    if (links[key]) link(links[key], key);
  });
  el.innerHTML = out.join("");
}

function dashWork() {
  $("c-work").textContent = "--";
  $("c-worksub").innerHTML = "<p class='nopush'>No pushes yet.</p>";
  $("c-artifacts").textContent = "--";
  $("c-rubrics").textContent = "--";
  $("c-events").textContent = "--";
  $("c-inflight").textContent = "--";
}

function paintWork(doc) {
  if (isUnobserved(doc)) {
    dashWork();
    return;
  }
  var w = doc.progress && doc.progress.work;
  if (!w) {
    dashWork();
    return;
  }
  if (finite(w.tasks_7d)) {
    $("c-work").innerHTML = F.ci(w.tasks_7d) + "<span class='u'>tasks</span>";
  } else {
    $("c-work").textContent = "--";
  }
  var sub = [];
  if (doc.progress.level_name) sub.push(doc.progress.level_name);
  else if (typeof doc.progress.level === "number") sub.push("Level " + doc.progress.level);
  if (doc.progress.last_session_at) sub.push("last session " + F.ago(doc.progress.last_session_at) + " (claimed)");
  $("c-worksub").textContent = sub.join(" · ");
  $("c-artifacts").textContent = finite(w.artifacts_total) ? F.ci(w.artifacts_total) : "--";
  $("c-rubrics").textContent = finite(w.rubric_pins) ? F.ci(w.rubric_pins) : "--";
  $("c-events").textContent = finite(w.tasks_total) ? F.ci(w.tasks_total) : "--";
  $("c-inflight").textContent = finite(w.in_flight) ? String(w.in_flight) : "--";
}

function winNum(n, w) {
  if (!finite(n)) return "--";
  if (w && w.scale) return (Number(n) / w.scale).toFixed(1) + "x";
  if (w && w.unit) return F.ci(n) + " " + F.esc(w.unit);
  return F.ci(n);
}

function paintConstraint(doc) {
  var body = $("cons-body");
  if (isUnobserved(doc)) {
    body.innerHTML = "<div class='empty tall'>No pushes yet.</div>";
    return;
  }
  var c = doc.progress && doc.progress.constraint;
  if (!c) {
    body.innerHTML = "<div class='empty tall'>This attestation declares no binding constraint and no build map. "
      + "Nothing here can be ranked, checked, or compared.</div>";
    return;
  }
  var w = c.win || {};
  var ns = doc.progress.north_star;
  var arch = c.archetype ? String(c.archetype).replace(/_/g, " ") : "undeclared";
  var leads = Array.isArray(c.lead_departments) ? c.lead_departments : [];
  var gap = finite(c.win_gap) ? c.win_gap : (finite(w.target_value) && finite(w.current_value) ? w.target_value - w.current_value : null);
  var pctv = finite(w.current_value) && finite(w.target_value) && w.target_value
    ? Math.min(100, w.current_value / w.target_value * 100)
    : 0;
  var html = "";
  html += "<div class='consrow'><div>";
  html += "<div class='warch'>" + F.esc(arch) + "</div>";
  html += "<div class='wsmall'>" + (leads.length ? "Lead: " + F.esc(leads.join(", ")) : "") + "</div>";
  html += "</div><div>";
  if (finite(w.deadline)) html += "<div class='wdays'>" + w.deadline + "<span class='u'>days left</span></div>";
  else html += "<div class='wdays'></div>";
  html += "<div class='wsmall'>" + (ns && ns.label ? "North star · " + F.esc(ns.label) : "") + "</div>";
  html += "</div></div>";
  if (w.label) {
    html += "<div class='wdef'><span class='v-clm'>" + winNum(w.target_value, w) + " " + F.esc(w.label) + "</span>";
    if (finite(w.deadline)) html += " within " + w.deadline + " days";
    html += " <span class='clmdot'>·</span></div>";
  }
  html += "<div class='wbar'><i style='width:" + pctv.toFixed(1) + "%'></i></div>";
  html += "<div class='wnums'>";
  html += "<span><span class='v-clm'>" + winNum(w.current_value, w) + "</span> <em>now</em></span>";
  html += "<span class='lit'><span class='v-rep'>" + (gap == null ? "--" : winNum(gap, w)) + " to go</span></span>";
  html += "<span><span class='v-clm'>" + winNum(w.target_value, w) + "</span> <em>target</em></span>";
  html += "</div>";
  html += "<div class='consbot'>";
  html += "<div class='guards'><span class='label'>Guardrails</span>";
  (ns && Array.isArray(ns.guardrails) ? ns.guardrails : []).forEach(function (g) {
    html += "<span class='guard'>" + F.esc(g) + "</span>";
  });
  html += "</div>";
  var p = doc.progress;
  html += "<div class='consfoot'>The gap is arithmetic on two claimed numbers. Capx re-derived the gap. "
    + "The numbers themselves are founder claimed. <b>Capx cannot confirm this figure.</b><br>"
    + "Router state: <span class='lit'>" + (finite(p.playbooks_ready) ? p.playbooks_ready : "--") + "</span> ready · "
    + "<span class='lit'>" + (finite(p.critical_remaining) ? p.critical_remaining : "--") + "</span> on the critical path · "
    + (finite(p.playbooks_blocked) ? p.playbooks_blocked : "--") + " blocked by a dependency</div>";
  html += "</div>";
  body.innerHTML = html;
}

function paintVitals(doc) {
  function set(id, html, extraCls) {
    var el = $(id);
    el.innerHTML = html;
    el.classList.remove("dn");
    if (extraCls) el.classList.add(extraCls);
  }
  if (isUnobserved(doc)) {
    set("v-ns", "--");
    set("v-bm", "--");
    set("v-cp", "--");
    set("v-q", "--");
    set("v-cov", "--");
    set("v-chain", "--");
    return;
  }
  var p = doc.progress || {};
  var ns = p.north_star;
  var q = p.quality || {};
  var R = doc.reproduced || {};
  var a = doc.attestation || {};

  if (ns) {
    var nsHtml = F.esc(ns.band || ns.label || "declared");
    if (ns.metric_id) nsHtml += "<span class='u'>" + F.esc(ns.metric_id) + "</span>";
    nsHtml += " <span class='clmdot'>·</span>";
    set("v-ns", nsHtml);
  } else {
    set("v-ns", "<span style='color:var(--t600)'>none declared</span>");
  }

  if (finite(p.playbooks_total)) {
    set("v-bm", (finite(p.playbooks_done) ? p.playbooks_done : "--") + " / " + p.playbooks_total + "<span class='u'>done</span> <span class='clmdot'>·</span>");
  } else {
    set("v-bm", "<span style='color:var(--t600)'>no plan</span>");
  }

  if (finite(p.critical_remaining)) {
    set("v-cp", p.critical_remaining + "<span class='u'>nodes left</span> <span class='clmdot'>·</span>");
  } else {
    set("v-cp", "--");
  }

  if (finite(q.self_score_mean)) {
    set("v-q", Math.round(q.self_score_mean) + "<span class='u'>/100 · n=" + (finite(q.self_score_n) ? q.self_score_n : "--") + "</span> <span class='clmdot'>·</span>");
  } else {
    set("v-q", "<span style='color:var(--t600)'>ungraded</span>");
  }

  if (finite(R.coverage_bp)) {
    set("v-cov", F.bp(R.coverage_bp) + "<span class='u'>of events</span>", R.coverage_bp < 5000 ? "dn" : "");
  } else {
    set("v-cov", "--");
  }

  if (finite(a.sequence)) {
    var signed = R.signature_valid === true ? "signed" : (R.signature_valid === false ? "unsigned" : (a.attested ? "attested" : ""));
    set("v-chain", "seq " + a.sequence + (signed ? "<span class='u'>" + signed + "</span>" : ""), R.signature_valid === false ? "dn" : "");
  } else {
    set("v-chain", "--");
  }
}

function chkRow(ok, k, v) {
  var cls = ok === true ? "ok" : (ok === false ? "bad" : "warn");
  var glyph = ok === true ? "+" : (ok === false ? "x" : "!");
  return "<div class='chk " + cls + "'><span class='g'>" + glyph + "</span>"
    + "<span class='ck'>" + F.esc(k) + "</span><span class='cv'>" + v + "</span></div>";
}

function violationText(v) {
  v = v || {};
  var dag = v.dag || 0;
  var dataflow = v.dataflow || 0;
  var level = v.level || v.level_gate || 0;
  var other = v.other || 0;
  var n = dag + dataflow + level + other;
  var out = [];
  if (dag) out.push(dag + " dependency");
  if (dataflow) out.push(dataflow + " dataflow");
  if (level) out.push(level + " level gate");
  if (other) out.push(other + " other");
  return { n: n, text: out.join(", ") + " violation" + (n === 1 ? "" : "s") };
}

function paintRepro(doc) {
  var R = (doc && doc.reproduced) || {};
  var a = (doc && doc.attestation) || {};
  var p = doc && doc.progress;
  var rows = [];

  if (isUnobserved(doc)) {
    $("checks").innerHTML = "<p class='nopush'>No pushes yet.</p>";
    $("repro-count").textContent = "";
    $("cov-v").textContent = "--";
    $("cov-bar").style.width = "0%";
    $("cov-bar").classList.remove("bad");
    $("repro-foot").textContent = "attested means Casa tier 0 and tier 1 and chain and observation signature. It is not identity and not a claim that the business is real.";
    return;
  }

  rows.push(chkRow(R.chain_intact === true ? true : (R.chain_intact === false ? false : null), "Chain",
    R.chain_intact === true
      ? (finite(a.sequence) ? "seq 0.." + a.sequence + " hash links unbroken" : "hash links unbroken")
      : (R.chain_intact === false ? "a link does not match its predecessor" : "unobserved")));

  rows.push(chkRow(R.signature_valid === true ? true : (R.signature_valid === false ? false : null), "Signature",
    R.signature_valid === true ? "ed25519 over the canonical envelope"
      : (R.signature_valid === false ? "no key, no signature, no author" : "unobserved")));

  rows.push(chkRow(R.tier0 === true ? true : (R.tier0 === false ? false : null), "Tier 0",
    R.tier0 === true ? "envelope schema held" : (R.tier0 === false ? "envelope schema failed" : "did not run")));

  rows.push(chkRow(R.tier1 === true ? true : (R.tier1 === false ? false : null), "Tier 1",
    R.tier1 === true ? "claims arithmetic held" : (R.tier1 === false ? "claims arithmetic failed" : "did not run")));

  rows.push(chkRow(R.tier2_ran === true ? true : (R.tier2_ran === false ? null : null), "Tier 2",
    R.tier2_ran === true ? "ran" : "did not run"));

  var vio = violationText(R.violations);
  var replayable = p && finite(p.playbooks_total) && p.playbooks_total > 0 && finite(R.coverage_bp) && R.coverage_bp > 0;
  if (vio.n > 0) {
    rows.push(chkRow(false, "Legality", vio.text + " replaying the ledger"));
  } else {
    rows.push(chkRow(replayable ? true : null, "Legality",
      replayable
        ? "0 violations replaying the disclosed window against the router"
        : (p && p.playbooks_total ? "no event names a node, so nothing was replayed" : "no build map to replay")));
  }

  rows.push(chkRow(R.catalog_matches === true ? true : (R.catalog_matches === false ? null : null), "Catalog",
    R.catalog_matches === true ? "playbook index matches the published catalog"
      : (R.catalog_matches === false ? "playbook_index_sha256 does not match the published catalog" : "unobserved")));

  $("checks").innerHTML = rows.join("");
  $("repro-count").textContent = rows.length + " checks";

  if (finite(R.coverage_bp)) {
    var pctv = R.coverage_bp / 100;
    $("cov-v").textContent = F.bp(R.coverage_bp);
    $("cov-v").classList.toggle("dn", R.coverage_bp < 5000);
    var bar = $("cov-bar");
    bar.style.width = Math.max(0.6, pctv).toFixed(1) + "%";
    bar.classList.toggle("bad", R.coverage_bp < 5000);
  } else {
    $("cov-v").textContent = "--";
    $("cov-v").classList.remove("dn");
    $("cov-bar").style.width = "0%";
    $("cov-bar").classList.remove("bad");
  }

  $("repro-foot").innerHTML = (R.coverage_bp === 0)
    ? "<b class='dn'>Nothing here is checkable.</b> Not one event names a playbook node, so there is no graph to replay it against. An attestation that cannot be wrong is not evidence. attested means Casa tier 0 and tier 1 and chain and observation signature."
    : "attested means Casa tier 0 and tier 1 and chain and observation signature. It is not identity and not a claim that the business is real. last_session_at is claimed. health and freshness are reproduced by Casa. Capx holds attest/, not the brain.";
}

function paintWire(doc) {
  var L = doc && doc.ledger;
  var shown = L && Array.isArray(L.shown) ? L.shown.slice(0, 40) : [];
  if (isUnobserved(doc) || !shown.length) {
    $("wire").innerHTML = "<div class='empty tall'>" + (isUnobserved(doc) ? "No pushes yet." : "The ledger delta is empty.") + "</div>";
    $("wire-count").textContent = isUnobserved(doc) ? "" : "0 events disclosed";
    return;
  }
  var lastDay = null;
  $("wire").innerHTML = shown.map(function (e) {
    var title = e.title || e.node_id || e.kind || "event";
    if (looksLikePath(title)) title = e.node_id || e.kind || "event";
    var dayKey = "";
    if (e.ts) {
      var dt = Date.parse(e.ts);
      if (isFinite(dt)) {
        dayKey = new Date(dt).toLocaleDateString("en-US", {
          month: "short", day: "numeric", timeZone: "UTC",
        });
      }
    }
    var head = "";
    if (dayKey && dayKey !== lastDay) {
      head = "<div class='wrday'>" + F.esc(dayKey) + "</div>";
      lastDay = dayKey;
    }
    var band = e.criticality || "growth";
    var crit = e.criticality === "existential" ? "exi" : (e.criticality === "core" ? "cor" : "");
    return head + "<div class='wr " + F.esc(band) + "'>"
      + "<span class='ts'>" + F.esc(e.ts ? F.ago(e.ts) : "--") + "</span>"
      + "<span class='mid'>"
        + "<div class='pn'>" + F.esc(title) + "</div>"
        + "<div class='meta'>"
          + (e.department ? "<span class='chip dept'>" + F.esc(e.department) + "</span>" : "")
          + (e.criticality ? "<span class='chip crit " + crit + "'>" + F.esc(e.criticality) + "</span>" : "")
          + (e.node_id ? "<span class='chip node'>" + F.esc(e.node_id) + "</span>" : "<span class='chip crit'>no node id</span>")
          + (e.kind ? "<span class='chip'>" + F.esc(e.kind) + "</span>" : "")
        + "</div>"
      + "</span>"
      + "<span class='cost'>"
        + (e.committed
            ? "<span class='badge com'>committed</span>"
            : "<span class='badge none'>no artifact</span>")
        + (e.has_rubric ? "<span class='pin'>rubric</span>" : "")
      + "</span>"
      + "</div>";
  }).join("");
  var windowN = L && finite(L.window_events) ? L.window_events : shown.length;
  var arts = doc.progress && doc.progress.work && finite(doc.progress.work.artifacts_total)
    ? F.ci(doc.progress.work.artifacts_total) + " committed artifacts"
    : "";
  $("wire-count").textContent = shown.length + " of " + F.ci(windowN) + " events disclosed"
    + (arts ? " · " + arts : "");
}

function kv(k, v, cls) {
  return "<div class='kv'><span class='kk'>" + F.esc(k) + "</span><span class='kvv " + (cls || "") + "'>" + v + "</span></div>";
}

function paintEnvelope(doc) {
  var E = (doc && doc.envelope) || {};
  var sub = E.subject || {};
  var win = E.window || {};
  var roots = E.roots || {};
  var harness = sub.driver_harness || sub.harness;
  var html = "";
  html += "<div class='rgrp'><span class='label'>Subject</span></div>";
  html += kv("company_pubkey", sub.company_pubkey ? F.esc(F.shortHash(sub.company_pubkey)) : "<span class='dn'>absent</span>");
  html += kv("harness", harness && harness.name
    ? F.esc(harness.name + (harness.version ? " " + harness.version : ""))
    : "<span class='dn'>absent</span>");
  html += kv("brain_schema", sub.brain_schema_version ? F.esc(sub.brain_schema_version) : "<span class='dn'>absent</span>");
  html += kv("playbook_index", sub.playbook_index_sha256 ? F.esc(F.shortHash(sub.playbook_index_sha256)) : "<span class='dn'>absent</span>",
    doc && doc.reproduced && doc.reproduced.catalog_matches === false ? "dn" : "");
  html += "<div class='rgrp'><span class='label'>Window</span></div>";
  html += kv("from_ts", win.from_ts ? F.esc(F.ago(win.from_ts)) + " (founder clock)" : "--");
  html += kv("to_ts", win.to_ts ? F.esc(F.ago(win.to_ts)) + " (founder clock)" : "--");
  html += "<div class='rgrp'><span class='label'>Roots</span></div>";
  html += kv("brain_root", roots.brain_root ? F.esc(F.shortHash(roots.brain_root)) : "none");
  html += kv("disclosed_root", roots.disclosed_root ? F.esc(F.shortHash(roots.disclosed_root)) : "none");
  html += "<div class='rgrp'><span class='label'>Signature</span></div>";
  html += kv("signature", E.signature_present ? "present" : "<span class='dn'>none</span>", E.signature_present ? "" : "dn");
  $("env").innerHTML = html;
}

function paintLadder(doc) {
  var p = doc && doc.progress;
  var levels = p && Array.isArray(p.levels) ? p.levels : [];
  var cur = p && typeof p.level === "number" ? p.level : null;
  if (!levels.length) {
    $("ladder").innerHTML = "";
    $("laddermeta").textContent = isUnobserved(doc)
      ? "No pushes yet."
      : "No level on the public document.";
    return;
  }
  $("ladder").innerHTML = levels.map(function (L) {
    var i = typeof L.level === "number" ? L.level : 0;
    var cls = "rung";
    if (cur != null && i < cur) cls += " done";
    if (cur === i) cls += " now";
    var name = L.name || ("Level " + i);
    return "<div class='" + cls + "'><div class='bar'></div><div class='n'>" + i + " " + F.esc(name) + "</div></div>";
  }).join("");

  if (isUnobserved(doc) || !p) {
    $("laddermeta").textContent = "No pushes yet.";
    return;
  }
  var R = doc.reproduced || {};
  var vio = violationText(R.violations);
  var verdict;
  if (vio.n) {
    verdict = "<span class='dn'>Capx replayed every completion against the router's own readiness function and found "
      + F.esc(vio.text) + ".</span> Read the rest of this page accordingly.";
  } else if (!p.playbooks_done || !R.coverage_bp) {
    verdict = "No completion names a playbook node, so there was nothing for Capx to replay against the gates.";
  } else {
    verdict = "Capx replayed every completion against the router's own readiness function and the level gates held.";
  }
  var cat = doc.catalog && doc.catalog.sha ? F.shortHash(doc.catalog.sha) : "";
  $("laddermeta").innerHTML = "Level " + (cur == null ? "--" : cur) + " of 8. <span class='lit'>"
    + (finite(p.playbooks_done) ? p.playbooks_done : "--") + "</span> of "
    + (finite(p.playbooks_total) ? p.playbooks_total : "--")
    + " selected playbooks complete, <span class='lit'>"
    + (finite(p.playbooks_ready) ? p.playbooks_ready : "--") + "</span> ready to run, "
    + (finite(p.playbooks_blocked) ? p.playbooks_blocked : "--")
    + " still blocked by a dependency. " + verdict
    + (cat ? " Catalog <span class='mono' style='color:var(--t400)'>" + F.esc(cat) + "</span>"
      + (doc.catalog.size ? " (" + doc.catalog.size + " playbooks)." : ".") : "");
}

function paintJudgment(doc) {
  var html = "";
  var p = doc && doc.progress;
  var c = p && p.constraint;
  if (c) {
    var leads = Array.isArray(c.lead_departments) ? c.lead_departments : [];
    html += "<div class='constraint'><span class='label'>Current constraint</span>"
      + "<div class='cv'>" + F.esc(c.archetype ? String(c.archetype).replace(/_/g, " ") : "undeclared") + "</div>"
      + "<div class='cn'>Every ranked task is scored against this. "
      + F.esc(leads.join(" and ") || "No lead departments")
      + " lead until the win definition is met. <span class='clmdot'>·</span></div></div>";
  }
  html += "<div class='rgrp'><span class='label'>Decisions logged<span style='color:var(--t600)'> · founder claimed</span></span></div>";
  var items = doc && doc.decisions && Array.isArray(doc.decisions.items) ? doc.decisions.items : [];
  if (isUnobserved(doc) || !items.length) {
    html += "<div class='empty'>" + (isUnobserved(doc) ? "No pushes yet." : "No decision was written to the ledger this window.") + "</div>";
  } else {
    items.forEach(function (d) {
      var ago = d.ts ? F.ago(d.ts) : "";
      html += "<div class='dec'><div class='dt'>" + F.esc(ago) + (d.department ? " · " + F.esc(d.department) : "")
        + "</div>" + F.esc(d.text || "") + " <span class='clmdot'>·</span></div>";
    });
  }
  html += "<div class='rgrp'><span class='label'>Settled spend</span></div>"
    + "<div class='empty'>Capx Pay does not exist yet. No receipt has ever been written, so no spend can be shown.</div>";
  $("judge").innerHTML = html;
}

function paintDepts(doc) {
  var items = doc && doc.departments_30d && Array.isArray(doc.departments_30d.items)
    ? doc.departments_30d.items : [];
  var any = items.some(function (d) { return d && d.events; });
  if (!any) {
    $("deptboard").innerHTML = "<div class='empty'>" + (isUnobserved(doc) ? "No pushes yet." : "No departments declared.") + "</div>";
    return;
  }
  var max = 1;
  items.forEach(function (d) { if (d.events > max) max = d.events; });
  $("deptboard").innerHTML = items.map(function (d) {
    var w = max ? (d.events || 0) / max * 100 : 0;
    return "<div class='dp" + (d.events ? "" : " zero") + "'>"
      + "<span class='dn2'>" + F.esc(d.department || "") + "</span>"
      + "<span class='db'><i style='width:" + w.toFixed(1) + "%'></i></span>"
      + "<span class='dv'>" + (d.events || 0) + "</span></div>";
  }).join("");
}

function paintAttest(doc) {
  if (!doc) {
    $("attest").textContent = "Casa has never bound this mint. The token page is still valid. Price comes from Launchpad.";
    return;
  }
  var a = doc.attestation || {};
  var bits = [];
  bits.push("<b>What Capx knows, and what it does not.</b> The founder runs Capx Casa and pushes "
    + "<span class='lit'>attest/</span>: a signed envelope, a claims projection, a ledger delta, Merkle roots, and the chain. "
    + "Capx never receives the company brain. From those files Casa re-runs the chain links, the signature, the router's own "
    + "readiness function over every completion, and the Merkle folds that bind each artifact digest to the published brain root. "
    + "Everything it reproduces is drawn solid. Everything merely committed is outlined. Everything the founder asserted "
    + "carries a trailing dot. "
    + "<span class='lit'>attested</span> means Casa tier 0 and tier 1 and chain and observation signature. "
    + "It is not identity and not a claim that the business is real. "
    + "A high health score means the record can be checked, not that the company is good. "
    + "last_session_at is claimed. health and freshness are reproduced by Casa.");
  if (a.freshness === "unobserved") {
    bits.push(" This mint is bound and has never pushed.");
  } else if (finite(a.health_score)) {
    bits.push(" health_score on this document is " + a.health_score + " as Casa returned it.");
  }
  if (doc.binding && doc.binding.status === "released") {
    bits.push(" binding.status is released. Do not read this as an active company.");
  }
  $("attest").innerHTML = bits.join("");
}

function dayAt(i) {
  return DAYS[i] ? parseUtc(DAYS[i].date) : null;
}

function initPulse(doc) {
  var a = (doc && doc.attestation) || {};
  var R = (doc && doc.reproduced) || {};
  var p = doc && doc.progress;
  var work = p && p.work;
  var nPush = 0;
  DAYS.forEach(function (d) { if (d.attestation) nPush++; });
  if (a && finite(a.sequence)) nPush = a.sequence + 1;
  else if (Array.isArray(doc && doc.chain_history) && doc.chain_history.length) nPush = doc.chain_history.length;

  var hz = $("pulse-hz");
  var dot = $("pulse-dot");
  if (dot) {
    if (a.freshness && a.freshness !== "fresh") dot.classList.add("cold");
    else dot.classList.remove("cold");
  }

  if (isUnobserved(doc)) {
    hz.textContent = "No pushes yet.";
  } else {
    var bits = [];
    if (work && finite(work.tasks_total)) bits.push(F.ci(work.tasks_total) + " tasks");
    bits.push(nPush + " push" + (nPush === 1 ? "" : "es"));
    if (finite(R.median_gap_days)) bits.push("median gap " + R.median_gap_days + "d");
    if (finite(a.hours_since)) {
      bits.push("last <span class='" + (a.freshness === "fresh" ? "lit" : "dn") + "'>" + F.hoursAgo(a.hours_since) + "</span>");
    } else if (a.observed_at) {
      bits.push("last <span class='" + (a.freshness === "fresh" ? "lit" : "dn") + "'>" + F.ago(a.observed_at) + "</span>");
    }
    hz.innerHTML = bits.join(" · ");
  }

  var unit = HEAT_SPEC.kind === "1h" ? "hour" : (HEAT_SPEC.kind === "4h" ? "4h block" : "day");
  var gap = DAYS.length ? (DAYS.length - 1 - LAST_COVERED) : 0;
  if (gap < 0) gap = 0;
  if (isUnobserved(doc) || LAST_COVERED < 0) {
    $("cad-foot").innerHTML = "<span class='dn'>" + DAYS.length + " " + unit + (DAYS.length === 1 ? "" : "s") + " unattested</span>";
  } else if (gap > 0) {
    $("cad-foot").innerHTML = "<span class='" + (gap > 7 ? "dn" : "") + "'>" + gap + " " + unit + (gap === 1 ? "" : "s") + " unattested</span>";
  } else {
    $("cad-foot").textContent = "attested through the latest bucket";
  }
  var pulseLabel = $("pulse-label");
  if (pulseLabel) {
    pulseLabel.textContent = HEAT_SPEC.kind === "1h"
      ? "Work attested per hour"
      : (HEAT_SPEC.kind === "4h" ? "Work attested per 4 hours" : "Work attested per day");
  }

  paintCalendar(doc);
}

function cellHtml(i, max) {
  var when = DAYS[i] && (DAYS[i].label || fmtDay(DAYS[i].date || DAYS[i].iso));
  var ring = DAYS[i] && DAYS[i].attestation ? " push" : "";
  if (i > LAST_COVERED) {
    return "<span class='hc off" + ring + "' data-d='" + i + "' title='" + F.esc(when || "") + " never attested'></span>";
  }
  var v = DAYS[i] && DAYS[i].events || 0;
  var lvl = v === 0 ? "" : " l" + Math.min(4, Math.max(1, Math.ceil(v / max * 4)));
  var t = (when || "") + " · " + v + " task" + (v === 1 ? "" : "s");
  if (DAYS[i] && DAYS[i].attestation) t += " · attestation landed";
  return "<span class='hc" + lvl + ring + "' data-d='" + i + "' title='" + F.esc(t) + "'></span>";
}

function paintHeatRead(i) {
  var read = $("gh-read");
  if (!read || !DAYS[i]) return;
  var psh = DAYS[i].attestation;
  var when = DAYS[i].label || fmtDay(DAYS[i].date || DAYS[i].iso);
  if (i > LAST_COVERED) {
    read.innerHTML = "<span class='dn'>" + F.esc(when || "") + " · never attested</span>";
    return;
  }
  read.innerHTML = "<span class='lit'>" + F.esc(when || "") + "</span> · "
    + (DAYS[i].events || 0) + " tasks"
    + (psh ? " · <span class='lit'>attestation landed</span>" : "");
}

function paintCalendar(doc) {
  var grid = $("ghgrid");
  var mo = $("gh-months");
  var dow = $("ghdow");
  if (!grid) return;
  if (doc && doc.reproduced && doc.reproduced.signature_valid === false) grid.classList.add("unsigned");
  else grid.classList.remove("unsigned");

  if (!DAYS.length) {
    grid.innerHTML = "";
    if (mo) mo.innerHTML = "";
    return;
  }

  var max = 1;
  var i;
  for (i = 0; i <= LAST_COVERED && i < DAYS.length; i++) {
    if (DAYS[i].events > max) max = DAYS[i].events;
  }

  var layout = (HEAT_SPEC && HEAT_SPEC.layout) || "weeks";
  var cols = (HEAT_SPEC && HEAT_SPEC.cols) || 7;
  var cells = "";
  var labels = "";

  if (layout === "hours" || layout === "blocks") {
    if (dow) dow.hidden = true;
    grid.style.gridAutoFlow = "row";
    grid.style.gridTemplateRows = "repeat(" + Math.max(1, Math.ceil(DAYS.length / cols)) + ", var(--cell))";
    grid.style.gridTemplateColumns = "repeat(" + cols + ", var(--cell))";
    for (i = 0; i < DAYS.length; i++) cells += cellHtml(i, max);
    if (layout === "hours") {
      for (i = 0; i < 24; i++) labels += (i % 6 === 0) ? "<span class='ghm'>" + i + "h</span>" : "<span class='ghm'></span>";
    } else {
      for (i = 0; i < 6; i++) labels += "<span class='ghm'>" + (i * 4) + "h</span>";
    }
    GH.weeks = cols;
  } else {
    if (dow) dow.hidden = false;
    grid.style.gridAutoFlow = "column";
    grid.style.gridTemplateRows = "repeat(7, var(--cell))";
    var first = dayAt(0);
    GH.first = first ? first.getUTCDay() : 0;
    GH.weeks = Math.ceil((GH.first + DAYS.length) / 7);
    grid.style.gridTemplateColumns = "repeat(" + GH.weeks + ", var(--cell))";
    for (i = 0; i < GH.first; i++) cells += "<span class='hc pad'></span>";
    for (i = 0; i < DAYS.length; i++) cells += cellHtml(i, max);
    var trailing = (7 - ((GH.first + DAYS.length) % 7)) % 7;
    for (i = 0; i < trailing; i++) cells += "<span class='hc pad'></span>";
    var seen = -1;
    for (var w = 0; w < GH.weeks; w++) {
      var day = w * 7 - GH.first;
      var probe = Math.min(DAYS.length - 1, Math.max(0, day));
      var md = dayAt(probe);
      var m = md ? md.getUTCMonth() : -1;
      if (m !== seen && day >= -6 && day < DAYS.length - 3 && md) {
        labels += "<span class='ghm'>" + md.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) + "</span>";
        seen = m;
      } else labels += "<span class='ghm'></span>";
    }
  }

  grid.innerHTML = cells;
  if (mo) {
    mo.style.gridTemplateColumns = "repeat(" + (layout === "weeks" ? GH.weeks : cols) + ", var(--cell))";
    mo.innerHTML = labels;
  }

  var wrap = document.querySelector(".ghwrap");
  function fitCells() {
    if (!wrap) return;
    var gap = 3, gutter = 32;
    var avail = wrap.clientWidth - gutter;
    var n = layout === "weeks" ? GH.weeks : cols;
    if (!n) return;
    var size = Math.max(8, Math.min(19, Math.floor(avail / n) - gap));
    wrap.style.setProperty("--cell", size + "px");
  }
  fitCells();

  var read = $("gh-read");
  if (read) {
    pulseDefaultRead = HEAT_SPEC.kind === "1d"
      ? "a ringed cell is a day an attestation landed"
      : "a ringed cell is a bucket an attestation landed";
    read.innerHTML = pulseDefaultRead;
  }
  grid._held = null;
  if (!pulseBound) {
    pulseBound = true;
    grid.addEventListener("mouseover", function (e) {
      var c = e.target.closest(".hc[data-d]");
      if (!c || !read || grid._held != null) return;
      var i2 = parseInt(c.getAttribute("data-d"), 10);
      paintHeatRead(i2);
    });
    grid.addEventListener("click", function (e) {
      var c = e.target.closest(".hc[data-d]");
      if (!c || !read) return;
      var i2 = parseInt(c.getAttribute("data-d"), 10);
      if (grid._held === i2) {
        grid._held = null;
        read.innerHTML = pulseDefaultRead;
        return;
      }
      grid._held = i2;
      paintHeatRead(i2);
    });
    grid.addEventListener("mouseleave", function () {
      if (read && grid._held == null) read.innerHTML = pulseDefaultRead;
    });
    window.addEventListener("resize", fitCells);
  }
}

function geom() {
  var W = chart.clientWidth, H = chart.clientHeight;
  return { W: W, H: H, padL: 14, padR: 58, padT: 26, padB: 24, workH: Math.round(H * 0.26) };
}

function slice() {
  var n = DAYS.length;
  var from = Math.max(0, n - TF);
  return { from: from, to: n };
}

function candleTime(ts) {
  var d = new Date((ts < 1e12 ? ts * 1000 : ts));
  if (!isFinite(d.getTime())) return "--";
  var opt = CANDLE_RES === "1D"
    ? { month: "short", day: "numeric", timeZone: "UTC" }
    : { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" };
  return d.toLocaleString("en-US", opt) + " UTC";
}

function paintCandleReadout(i) {
  var c = CANDLES[i];
  if (!c) {
    $("ro-date").textContent = "--";
    if ($("ro-open")) $("ro-open").textContent = "--";
    if ($("ro-high")) $("ro-high").textContent = "--";
    if ($("ro-low")) $("ro-low").textContent = "--";
    $("ro-price").textContent = "--";
    if ($("ro-vol")) $("ro-vol").textContent = "--";
    return;
  }
  var up = c.c >= c.o;
  $("ro-date").textContent = candleTime(c.t);
  if ($("ro-open")) $("ro-open").textContent = F.usdPx(c.o);
  if ($("ro-high")) $("ro-high").textContent = F.usdPx(c.h);
  if ($("ro-low")) $("ro-low").textContent = F.usdPx(c.l);
  $("ro-price").innerHTML = "<span class='" + (up ? "up" : "dn") + "'>" + F.usdPx(c.c) + "</span>";
  if ($("ro-vol")) $("ro-vol").textContent = c.volume ? F.usdCompact(c.volume) : "--";
}

function drawCandleChart() {
  if (!chart || !cctx) return;
  var dpr = window.devicePixelRatio || 1, g = geom();
  if (!g.W || !g.H) return;
  chart.width = g.W * dpr;
  chart.height = g.H * dpr;
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cctx.clearRect(0, 0, g.W, g.H);

  var bars = CANDLES;
  var n = bars.length;
  if (n < 2) return;
  var volH = Math.round(g.H * 0.22);
  var priceTop = g.padT;
  var priceBot = g.H - g.padB - volH - 10;
  var volTop = priceBot + 10;
  var volBot = g.H - g.padB;
  var plotL = g.padL;
  var plotR = g.W - g.padR;
  var plotW = plotR - plotL;
  var slot = plotW / n;
  var bodyW = Math.max(1, Math.min(11, slot * 0.7));

  var lows = bars.map(function (b) { return b.l; });
  var highs = bars.map(function (b) { return b.h; });
  var pmin = Math.min.apply(null, lows);
  var pmax = Math.max.apply(null, highs);
  var pad = (pmax - pmin) * 0.08 || pmax * 0.05 || 0.01;
  pmin -= pad;
  pmax += pad;
  var vmax = 1;
  bars.forEach(function (b) { if (b.volume > vmax) vmax = b.volume; });

  function PX(i) { return plotL + (i + 0.5) * slot; }
  function PY(v) { return priceTop + (1 - (v - pmin) / (pmax - pmin)) * (priceBot - priceTop); }

  cctx.font = (window.matchMedia("(max-width:700px)").matches ? "11px" : "10px") + " ui-monospace, SF Mono, Menlo, monospace";
  var gi;
  for (gi = 0; gi <= 4; gi++) {
    var gv = pmin + (pmax - pmin) * gi / 4;
    var gy = PY(gv);
    cctx.strokeStyle = "rgba(255,255,255,.05)";
    cctx.lineWidth = 1;
    cctx.beginPath();
    cctx.moveTo(plotL, gy + 0.5);
    cctx.lineTo(plotR, gy + 0.5);
    cctx.stroke();
    cctx.fillStyle = "rgba(255,255,255,.32)";
    cctx.textAlign = "left";
    cctx.fillText(F.usdPx(gv), plotR + 8, gy + 3);
  }

  var i, b, up, col, x, y0, y1, yh, yl, bh;
  for (i = 0; i < n; i++) {
    b = bars[i];
    up = b.c >= b.o;
    col = up ? "#4ade80" : "#ef4444";
    x = PX(i);
    yh = PY(b.h);
    yl = PY(b.l);
    y0 = PY(b.o);
    y1 = PY(b.c);
    cctx.strokeStyle = col;
    cctx.lineWidth = 1;
    cctx.beginPath();
    cctx.moveTo(x + 0.5, yh);
    cctx.lineTo(x + 0.5, yl);
    cctx.stroke();
    bh = Math.max(1, Math.abs(y1 - y0));
    cctx.fillStyle = col;
    cctx.fillRect(x - bodyW / 2, Math.min(y0, y1), bodyW, bh);
    if (i === hoverIdx) {
      cctx.strokeStyle = "rgba(255,255,255,.85)";
      cctx.strokeRect(x - bodyW / 2 - 0.5, Math.min(y0, y1) - 0.5, bodyW + 1, bh + 1);
    }
    var vh = (b.volume / vmax) * (volBot - volTop);
    cctx.fillStyle = up ? "rgba(74,222,128,.35)" : "rgba(239,68,68,.35)";
    cctx.fillRect(x - bodyW / 2, volBot - vh, bodyW, vh);
  }

  cctx.fillStyle = "rgba(255,255,255,.30)";
  cctx.textAlign = "left";
  cctx.fillText(candleTime(bars[0].t), plotL, g.H - 6);
  cctx.textAlign = "right";
  cctx.fillText(candleTime(bars[n - 1].t), plotR, g.H - 6);

  if (hoverIdx >= 0 && hoverIdx < n) {
    var cx = PX(hoverIdx);
    cctx.strokeStyle = "rgba(255,255,255,.14)";
    cctx.setLineDash([3, 3]);
    cctx.beginPath();
    cctx.moveTo(cx + 0.5, priceTop);
    cctx.lineTo(cx + 0.5, volBot);
    cctx.stroke();
    cctx.setLineDash([]);
    paintCandleReadout(hoverIdx);
  }
}

function drawChart() {
  if (CANDLES.length >= 2) {
    drawCandleChart();
    return;
  }
  if (!chart || !cctx) return;
  var dpr = window.devicePixelRatio || 1, g = geom();
  if (!g.W || !g.H) return;
  chart.width = g.W * dpr;
  chart.height = g.H * dpr;
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cctx.clearRect(0, 0, g.W, g.H);

  var s = slice(), n = s.to - s.from, i;
  if (n <= 0) return;
  var runs = [];
  var prices = [];
  for (i = 0; i < n; i++) {
    var day = DAYS[s.from + i];
    runs.push(day && day.events ? day.events : 0);
    prices.push(PRICES && PRICES[s.from + i] != null ? PRICES[s.from + i] : null);
  }
  var priceVals = prices.filter(function (v) { return v != null && isFinite(v); });
  var drawPrice = priceVals.length >= 2;
  var pmin = 0, pmax = 1;
  if (drawPrice) {
    pmin = Math.min.apply(null, priceVals);
    pmax = Math.max.apply(null, priceVals);
    var pad = (pmax - pmin) * 0.16 || pmax * 0.1 || 1;
    pmin -= pad;
    pmax += pad;
  }
  var coveredRuns = [];
  for (i = 0; i < n; i++) {
    if (s.from + i <= LAST_COVERED) coveredRuns.push(runs[i]);
  }
  var rmax = Math.max.apply(null, coveredRuns.concat([1]));
  var priceTop = g.padT, priceBot = g.H - g.padB - g.workH - 8;

  function PX(idx) { return g.padL + (n <= 1 ? 0 : idx / (n - 1)) * (g.W - g.padL - g.padR); }
  function PY(v) { return priceTop + (1 - (v - pmin) / (pmax - pmin)) * (priceBot - priceTop); }

  cctx.font = (window.matchMedia("(max-width:700px)").matches ? "11px" : "10px") + " ui-monospace, SF Mono, Menlo, monospace";
  cctx.textAlign = "left";
  if (drawPrice) {
    for (i = 0; i <= 3; i++) {
      var v = pmin + (pmax - pmin) * i / 3, y = PY(v);
      cctx.strokeStyle = "rgba(255,255,255,.045)";
      cctx.lineWidth = 1;
      cctx.beginPath();
      cctx.moveTo(g.padL, y + 0.5);
      cctx.lineTo(g.W - g.padR, y + 0.5);
      cctx.stroke();
      cctx.fillStyle = "rgba(255,255,255,.30)";
      cctx.fillText(F.usdPx(v), g.W - g.padR + 9, y + 3.5);
    }
  } else {
    for (i = 0; i <= 3; i++) {
      var y2 = priceTop + (priceBot - priceTop) * i / 3;
      cctx.strokeStyle = "rgba(255,255,255,.045)";
      cctx.lineWidth = 1;
      cctx.beginPath();
      cctx.moveTo(g.padL, y2 + 0.5);
      cctx.lineTo(g.W - g.padR, y2 + 0.5);
      cctx.stroke();
    }
  }

  var bw = Math.max(1.5, (g.W - g.padL - g.padR) / n - 2);
  for (i = 0; i < n; i++) {
    var dayI = s.from + i;
    if (dayI > LAST_COVERED) {
      var hh = Math.max(3, g.workH * 0.12);
      cctx.strokeStyle = "rgba(197,220,107,.30)";
      cctx.lineWidth = 1;
      cctx.strokeRect(PX(i) - bw / 2 + 0.5, g.H - g.padB - hh + 0.5, bw - 1, hh - 1);
      continue;
    }
    var h = runs[i] / rmax * g.workH;
    cctx.fillStyle = (i === hoverIdx) ? "rgba(197,220,107,.95)" : "rgba(197,220,107,.34)";
    cctx.fillRect(PX(i) - bw / 2, g.H - g.padB - h, bw, h);
  }

  if (drawPrice) {
    var started = false;
    cctx.beginPath();
    for (i = 0; i < n; i++) {
      if (prices[i] == null) {
        started = false;
        continue;
      }
      if (!started) {
        cctx.moveTo(PX(i), PY(prices[i]));
        started = true;
      } else cctx.lineTo(PX(i), PY(prices[i]));
    }
    var lastP = -1, firstP = -1;
    for (i = 0; i < n; i++) if (prices[i] != null) { if (firstP < 0) firstP = i; lastP = i; }
    if (firstP >= 0 && lastP >= 0) {
      cctx.lineTo(PX(lastP), priceBot);
      cctx.lineTo(PX(firstP), priceBot);
      cctx.closePath();
      var grad = cctx.createLinearGradient(0, priceTop, 0, priceBot);
      grad.addColorStop(0, "rgba(255,255,255,.07)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      cctx.fillStyle = grad;
      cctx.fill();
    }
    started = false;
    cctx.beginPath();
    for (i = 0; i < n; i++) {
      if (prices[i] == null) { started = false; continue; }
      if (!started) { cctx.moveTo(PX(i), PY(prices[i])); started = true; }
      else cctx.lineTo(PX(i), PY(prices[i]));
    }
    cctx.strokeStyle = "rgba(255,255,255,.92)";
    cctx.lineWidth = 1.6;
    cctx.lineJoin = "round";
    cctx.stroke();
  }

  chart._pins = [];
  EVENTS.forEach(function (e) {
    if (e.day < s.from || e.day >= s.to) return;
    var i2 = e.day - s.from, x = PX(i2);
    var y = priceBot - 13;
    if (drawPrice && prices[i2] != null) y = PY(prices[i2]) - 13;
    cctx.beginPath();
    cctx.moveTo(x, y + 7);
    cctx.lineTo(x - 4.5, y - 1);
    cctx.lineTo(x + 4.5, y - 1);
    cctx.closePath();
    cctx.fillStyle = "#C5DC6B";
    cctx.fill();
    chart._pins.push({ x: x, y: y, e: e });
  });

  cctx.fillStyle = "rgba(255,255,255,.30)";
  cctx.textAlign = "left";
  cctx.fillText(fmtDay(DAYS[s.from] && DAYS[s.from].date), g.padL, g.H - 7);
  cctx.textAlign = "right";
  cctx.fillText(fmtDay(DAYS[s.to - 1] && DAYS[s.to - 1].date), g.W - g.padR, g.H - 7);

  if (hoverIdx >= 0 && hoverIdx < n) {
    var cx = PX(hoverIdx);
    cctx.strokeStyle = "rgba(255,255,255,.16)";
    cctx.lineWidth = 1;
    cctx.beginPath();
    cctx.moveTo(cx + 0.5, priceTop);
    cctx.lineTo(cx + 0.5, g.H - g.padB);
    cctx.stroke();
    if (drawPrice && prices[hoverIdx] != null) {
      cctx.beginPath();
      cctx.arc(cx, PY(prices[hoverIdx]), 3.2, 0, Math.PI * 2);
      cctx.fillStyle = "#f6f7f7";
      cctx.fill();
    }
  }
}

function onHover(ev) {
  if (CANDLES.length >= 2) {
    var g = geom();
    var rect = chart.getBoundingClientRect();
    var mx = ev.clientX - rect.left;
    var plotW = g.W - g.padL - g.padR;
    var n = CANDLES.length;
    hoverIdx = Math.max(0, Math.min(n - 1, Math.floor((mx - g.padL) / plotW * n)));
    drawCandleChart();
    return;
  }
  var g = geom(), s = slice(), n = s.to - s.from;
  if (n <= 0) return;
  var rect = chart.getBoundingClientRect(), mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
  var t = (mx - g.padL) / (g.W - g.padL - g.padR);
  hoverIdx = Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
  drawChart();

  var day = s.from + hoverIdx;
  paintReadout(day);

  var tip = $("evtip"), hit = null;
  var hitRadius = ev.pointerType === "touch" ? 24 : 9;
  (chart._pins || []).forEach(function (p) {
    if (Math.abs(p.x - mx) < hitRadius && Math.abs(p.y - my) < Math.max(16, hitRadius)) hit = p;
  });
  if (hit) {
    tip.innerHTML = "<div class='d'>" + F.esc(fmtDay(DAYS[hit.e.day] && DAYS[hit.e.day].date))
      + (hit.e.dept ? " · " + F.esc(hit.e.dept) : "") + "</div>" + F.esc(hit.e.text || "Decision logged");
    tip.classList.add("show");
    var tw = tip.offsetWidth;
    tip.style.left = Math.max(6, Math.min(g.W - tw - 6, hit.x - tw / 2)) + "px";
    tip.style.top = Math.max(4, hit.y - tip.offsetHeight - 10) + "px";
  } else tip.classList.remove("show");
}

function paintReadout(day) {
  if (day == null || !DAYS[day]) {
    $("ro-date").textContent = "--";
    $("ro-price").textContent = "--";
    $("ro-work").textContent = "--";
    return;
  }
  $("ro-date").textContent = fmtDay(DAYS[day].date);
  if (PRICES && PRICES[day] != null) $("ro-price").textContent = F.usdPx(PRICES[day]);
  else $("ro-price").textContent = PRICES ? "--" : "no series";
  if (day > LAST_COVERED) $("ro-work").textContent = "unattested";
  else $("ro-work").textContent = (DAYS[day].events || 0) + " tasks";
}

function resetReadout() {
  if (CANDLES.length) paintCandleReadout(CANDLES.length - 1);
  else paintReadout(DAYS.length ? DAYS.length - 1 : null);
}

function paintDivergence() {
  var el = $("diverge");
  var src = TOKEN && TOKEN.priceSeries;
  var srcNote = "Price series from Codex, the API behind defined.fi. Spot on the Market tile is Launchpad.";
  if (src && src.demo) {
    srcNote = "CAPX/SOL from Codex (defined.fi), used only as a look demo. Not this Agent token.";
  } else if (src && src.candles && src.candles.length) {
    srcNote = "Candles from Codex, the API behind defined.fi. Spot on the Market tile is Launchpad.";
  } else if (src && src.preview) {
    srcNote = "Preview series so you can see the chart. Not Codex data. Not a live price.";
  } else if (src && src.error === "CODEX_API_KEY_MISSING") {
    srcNote = "Codex API key is not set on the Terminal server, so there is no price series. Export CODEX_API_KEY and restart.";
  } else if (src && src.error && !PRICES) {
    srcNote = "Codex returned no bars for this mint (" + src.error + "). Work bars are Casa calendar events.";
  }
  if (!PRICES) {
    el.innerHTML = "<span class='label'>30d divergence</span>"
      + "<span>" + F.esc(srcNote) + "</span>";
    return;
  }
  var n = DAYS.length;
  var i;
  var pStart = null, pNow = null;
  for (i = Math.max(0, n - 30); i < n; i++) if (PRICES[i] != null) { pStart = PRICES[i]; break; }
  for (i = n - 1; i >= 0; i--) if (PRICES[i] != null) { pNow = PRICES[i]; break; }
  var wPrev = 0, wNow = 0;
  for (i = Math.max(0, n - 60); i < n - 30; i++) wPrev += DAYS[i] && DAYS[i].events || 0;
  for (i = Math.max(0, n - 30); i < n; i++) wNow += DAYS[i] && DAYS[i].events || 0;
  var wMove = wPrev ? (wNow - wPrev) / wPrev * 100 : 0;
  var pMove = (pStart && pNow) ? (pNow - pStart) / pStart * 100 : null;
  var verdict;
  if (LAST_COVERED < n - 8) {
    verdict = "The work series is stale. The last " + (n - 1 - LAST_COVERED) + " days were never attested to, so this comparison is not meaningful.";
  } else if (pMove == null) {
    verdict = "Price points do not cover 30 days, so divergence is not computed.";
  } else {
    var d = wMove - pMove;
    verdict = d > 12
      ? "Work is outrunning price. The company shipped more than the market has repriced."
      : (d < -12 ? "Price is outrunning work. The market has repriced faster than the company shipped."
        : "Work and price are moving together.");
  }
  el.innerHTML = "<span class='label'>30d divergence</span>"
    + (pMove == null ? "<b>Price --</b>" : "<b>Price " + F.pct(pMove) + "</b>")
    + "<span style='color:var(--t600)'>·</span>"
    + "<b class='lit'>Work " + F.pct(wMove) + "</b>"
    + "<span style='color:var(--t600)'>·</span>"
    + "<span style='color:var(--t500)'>" + F.esc(verdict) + " " + F.esc(srcNote) + "</span>";
}

function loadDemoChart(resolution) {
  CANDLE_RES = resolution;
  var mint = TOKEN && TOKEN.mint ? TOKEN.mint : mintFromPath();
  var path = mint
    ? "/api/chart/" + encodeURIComponent(mint) + "?resolution=" + encodeURIComponent(resolution)
    : "/api/chart/demo?resolution=" + encodeURIComponent(resolution);
  fetch(path, { cache: "no-store" })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && Array.isArray(data.candles) && data.candles.length) {
        CANDLES = data.candles;
        if (TOKEN && TOKEN.priceSeries) {
          TOKEN.priceSeries.candles = data.candles;
          TOKEN.priceSeries.resolution = data.resolution;
        }
        drawChart();
        paintCandleReadout(CANDLES.length - 1);
        paintDivergence();
      }
    })
    .catch(function () {});
}

function syncTfButtons() {
  var box = $("tfs");
  if (!box) return;
  if (CANDLES.length >= 2) {
    var cres = [
      { res: "15", label: "15m" },
      { res: "60", label: "1H" },
      { res: "240", label: "4H" },
      { res: "1D", label: "1D" },
    ];
    box.innerHTML = cres.map(function (o) {
      return "<button class='tf" + (o.res === CANDLE_RES ? " on" : "") + "' data-res='" + o.res + "'>" + o.label + "</button>";
    }).join("");
    return;
  }
  var n = DAYS.length || 1;
  var opts;
  if (HEAT_SPEC.kind === "1h") {
    opts = [
      { d: Math.min(12, n), label: "12H" },
      { d: Math.min(24, n), label: "24H" },
      { d: n, label: "ALL" },
    ];
  } else if (HEAT_SPEC.kind === "4h") {
    opts = [
      { d: Math.min(12, n), label: "2D" },
      { d: Math.min(42, n), label: "7D" },
      { d: n, label: "ALL" },
    ];
  } else {
    opts = [
      { d: Math.min(30, n), label: "30D" },
      { d: Math.min(90, n), label: "90D" },
      { d: n, label: "ALL" },
    ];
  }
  box.innerHTML = opts.map(function (o, i) {
    return "<button class='tf" + (i === opts.length - 1 ? " on" : "") + "' data-d='" + o.d + "'>" + o.label + "</button>";
  }).join("");
  TF = n;
}

function clearChartHover() {
  hoverIdx = -1;
  $("evtip").classList.remove("show");
  drawChart();
  resetReadout();
}

function onChartPointerDown(ev) {
  chart._tapStart = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp };
}

function onChartPointerUp(ev) {
  var down = chart._tapStart;
  chart._tapStart = null;
  if (!down) return;
  var elapsed = ev.timeStamp - down.t;
  if (elapsed < 0 || elapsed > 400 || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 8) return;
  var g = geom();
  var rect = chart.getBoundingClientRect();
  var mx = ev.clientX - rect.left;
  if (mx < g.padL || mx > g.W - g.padR) {
    chart._pinned = false;
    clearChartHover();
    return;
  }
  chart._pinned = true;
  onHover(ev);
}

function initChart() {
  chart = $("chart");
  if (!chart) return;
  cctx = chart.getContext("2d");
  syncTfButtons();
  if (!chartBound) {
    chartBound = true;
    $("tfs").addEventListener("click", function (e) {
      var b = e.target.closest(".tf");
      if (!b) return;
      document.querySelectorAll(".tf").forEach(function (t) { t.classList.toggle("on", t === b); });
      var res = b.getAttribute("data-res");
      if (res) {
        loadDemoChart(res);
        return;
      }
      TF = parseInt(b.getAttribute("data-d"), 10) || DAYS.length || 30;
      drawChart();
    });
    chart.addEventListener("pointermove", function (ev) {
      if (ev.pointerType === "mouse" && !chart._pinned) onHover(ev);
    });
    chart.addEventListener("pointerleave", function () {
      if (chart._pinned) return;
      clearChartHover();
    });
    chart.addEventListener("pointerdown", onChartPointerDown);
    chart.addEventListener("pointerup", onChartPointerUp);
  }
  if (!resizeBound) {
    resizeBound = true;
    window.addEventListener("resize", function () { drawChart(); });
  }
  drawChart();
  resetReadout();
  paintDivergence();
}

function emptyDaysFromPrices(token) {
  var pts = token && token.priceSeries && Array.isArray(token.priceSeries.points)
    ? token.priceSeries.points : [];
  if (pts.length < 2) return [];
  return pts.map(function (p) {
    return { date: p.iso || p.date, iso: p.iso || p.date, t: typeof p.t === "number" ? (p.t < 1e12 ? p.t * 1000 : p.t) : undefined, events: 0, attestation: false, decision: false };
  });
}

function loadCalendar(doc, token) {
  var heat = token && token.heatmap;
  if (heat && Array.isArray(heat.buckets) && heat.buckets.length) {
    DAYS = heat.buckets.slice();
    HEAT_SPEC = heat.spec || HEAT_SPEC;
    LAST_COVERED = typeof heat.lastCovered === "number" ? heat.lastCovered : lastCoveredIndex(DAYS, doc && doc.attestation);
  } else {
    DAYS = (doc && doc.calendar && Array.isArray(doc.calendar.days)) ? doc.calendar.days.slice() : [];
    if (!DAYS.length) DAYS = emptyDaysFromPrices(token);
    LAST_COVERED = lastCoveredIndex(DAYS, doc && doc.attestation);
  }
  PRICES = priceSeriesFor(token, DAYS);
  CANDLES = (token && token.priceSeries && Array.isArray(token.priceSeries.candles))
    ? token.priceSeries.candles : [];
  CANDLE_RES = (token && token.priceSeries && token.priceSeries.resolution) || "60";
  if (token && token.priceSeries && token.priceSeries.preview && !token.priceSeries.demo) {
    var plot = emptyDaysFromPrices(token);
    if (plot.length >= 2) {
      DAYS = plot;
      LAST_COVERED = plot.length - 1;
      HEAT_SPEC = { kind: "1h", layout: "hours", cols: 24, label: "1h" };
      PRICES = priceSeriesFor(token, DAYS);
    }
  }
  var lookup = decisionLookup(doc);
  EVENTS = [];
  DAYS.forEach(function (d, i) {
    if (!d || !d.decision) return;
    var hit = lookup[d.date];
    EVENTS.push({
      day: i,
      text: hit && hit.text ? hit.text : "Decision logged",
      dept: hit && hit.department ? hit.department : "",
    });
  });
}

function paintCasa(token, doc) {
  if (!doc) {
    setCasaVisible(false);
    show("tile-nobind", true);
    paintBanners(null);
    paintAttest(null);
    loadCalendar(null, token);
    // Age-aware: with no candles, no series, and no calendar there is
    // nothing to plot, so the chart tile collapses instead of renting space.
    var plottable = CANDLES.length >= 2 || PRICES != null || DAYS.length >= 2;
    show("tile-chart", plottable);
    if (plottable) {
      requestAnimationFrame(function () {
        initChart();
        requestAnimationFrame(function () { drawChart(); });
      });
    }
    return;
  }
  setCasaVisible(true);
  show("tile-nobind", false);
  paintBanners(doc);
  loadCalendar(doc, token);
  show("tile-chart", true);
  paintWork(doc);
  paintKeysCasa(doc);
  paintConstraint(doc);
  paintVitals(doc);
  paintRepro(doc);
  paintWire(doc);
  paintEnvelope(doc);
  paintLadder(doc);
  paintJudgment(doc);
  paintDepts(doc);
  paintAttest(doc);
  requestAnimationFrame(function () {
    initPulse(doc);
    initChart();
    requestAnimationFrame(function () { drawChart(); });
  });
}

function boot(payload) {
  if (payload.sample) {
    $("sample-pill").hidden = false;
    $("foot").textContent = "capx · every agent token pairs against CAPX · sample data";
  }
  if (payload.error === "INVALID_MINT" || payload.error === "TOKEN_NOT_LISTED") {
    $("notfound").hidden = false;
    return;
  }
  if (!payload.token) {
    $("notfound").hidden = false;
    return;
  }
  $("page").hidden = false;
  if (payload.capxError) {
    $("err").hidden = false;
    $("err").textContent = "CAPX quote: " + payload.capxError;
  }
  TOKEN = payload.token;
  DOC = casaDoc(payload.token);
  var priceLegend = $("chart-price-legend");
  var series = payload.token.priceSeries || {};
  var candleMode = Array.isArray(series.candles) && series.candles.length >= 2;
  var demo = !!series.demo;
  if (priceLegend) {
    priceLegend.textContent = demo
      ? "CAPX/SOL · Codex"
      : (candleMode ? "Price · USD · Codex" : (series.preview ? "Price · USD · preview" : "Price · USD · Codex"));
  }
  var workLg = $("lg-work");
  var evtLg = $("lg-evt");
  var upLg = $("lg-up");
  var dnLg = $("lg-dn");
  var workWrap = $("ro-work-wrap");
  if (workLg) workLg.hidden = candleMode;
  if (evtLg) evtLg.hidden = candleMode;
  if (upLg) upLg.hidden = !candleMode;
  if (dnLg) dnLg.hidden = !candleMode;
  if (workWrap) workWrap.hidden = candleMode;
  paintIdentity(payload.token, DOC);
  paintMarket(payload.token, payload.capx);
  paintCasa(payload.token, DOC);
  if (payload.company_href) {
    var clink = $("company-link");
    if (clink) {
      clink.href = payload.company_href;
      clink.hidden = false;
    }
  }
}

var mint = mintFromPath();
if (!mint) {
  $("notfound").hidden = false;
} else {
  fetch("/api/tokens/" + encodeURIComponent(mint), { cache: "no-store" })
    .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
    .then(function (res) {
      if (res.status === 404 || res.status === 400) {
        $("notfound").hidden = false;
        return;
      }
      boot(res.body);
    })
    .catch(function (err) {
      $("err").hidden = false;
      $("err").textContent = "Terminal could not load this token: " + err.message;
    });
}
