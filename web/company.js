"use strict";
var F = window.CAPX_FMT;
var $ = function (id) { return document.getElementById(id); };

var IFRAME_SANDBOX = "allow-scripts";
var ARTIFACTS = ["site", "one_pager", "deck"];
var ARTIFACT_LABELS = { site: "Website", one_pager: "One-pager", deck: "Pitch deck" };
var artifactPreviewState = { artifacts: {}, slug: "", canonical: "", active: "site" };
var CASA_HOST = /^https:\/\/[a-z0-9-]{1,32}\.casa\.capx\.ai(\/.*)?$/;

function slugFromPath() {
  var m = location.pathname.match(/^\/c\/([a-z0-9-]{1,32})$/);
  return m ? m[1] : "";
}

function show(id, on) {
  var el = $(id);
  if (el) el.hidden = !on;
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

function fmtFounded(iso) {
  var d = parseUtc(iso);
  if (!d) return "";
  return "Founded " + d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function fmtDay(d) {
  if (typeof d === "string") d = parseUtc(d);
  if (!d) return "--";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function isCasaUrl(url, slug) {
  if (typeof url !== "string" || typeof slug !== "string") return false;
  if (/[\s'"<>\\]/.test(url)) return false;
  if (!CASA_HOST.test(url)) return false;
  var host = "https://" + slug + ".casa.capx.ai";
  return url === host || url.indexOf(host + "/") === 0;
}

function publicArtifact(art, slug) {
  if (!art || typeof art !== "object") return null;
  if (art.visibility && art.visibility !== "public") return null;
  if (!isCasaUrl(art.url, slug)) return null;
  return art;
}

function paintIdentity(company) {
  var mark = $("id-mark");
  mark.replaceChildren();
  if (company.logo && isCasaUrl(company.logo, company.slug)) {
    var img = document.createElement("img");
    img.src = company.logo;
    img.alt = "";
    mark.appendChild(img);
  } else {
    mark.textContent = (company.name || "?").slice(0, 2).toUpperCase();
  }
  $("id-name").textContent = company.name || company.slug || "Company";
  document.title = (company.name || company.slug || "Company") + " · Capx Terminal";
  var catEl = $("id-category");
  catEl.replaceChildren();
  if (company.category) {
    var b = document.createElement("b");
    b.textContent = String(company.category).replace(/-/g, " ");
    catEl.appendChild(b);
  }
  var p = company.progress;
  var level = "";
  if (p && p.level_name) level = "Level " + p.level + " · " + p.level_name;
  else if (p && typeof p.level === "number") level = "Level " + p.level;
  $("id-level").textContent = level;
  $("id-founded").textContent = fmtFounded(company.created_at || company.published_at);
  $("id-mission").textContent = company.description || "";
}

function paintProvenance(company) {
  var parts = [];
  var a = company && company.attestation;
  var R = company && company.reproduced;
  if (a && a.freshness === "unobserved") {
    parts.push("<span class='pv st-dormant'>unobserved</span>");
  } else if (a && a.freshness) {
    var st = a.freshness === "fresh" ? "st-fresh" : (a.freshness === "stale" || a.freshness === "aging" ? "st-stale" : "");
    parts.push("<span class='pv " + st + "'>" + F.esc(a.freshness) + "</span>");
  }
  if (a && a.attested) parts.push("<span class='pv ok'>attested</span>");
  else if (a) parts.push("<span class='pv bad'>not attested</span>");
  if (a && finite(a.health_score)) parts.push("<span class='pv'>health " + a.health_score + "</span>");
  if (R && R.chain_intact === true) parts.push("<span class='pv ok'>chain intact</span>");
  if (company && company.category) parts.push("<span class='pv'>" + F.esc(company.category) + "</span>");
  var sub = "";
  if (a && finite(a.hours_since)) sub = "Last attestation " + F.hoursAgo(a.hours_since);
  else if (a && a.observed_at) sub = "Last attestation " + F.ago(a.observed_at);
  $("prov").innerHTML = "<div class='provrow'>" + parts.join("") + "</div>"
    + (sub ? "<div class='provsub'>" + F.esc(sub) + "</div>" : "");
}

function paintMarket(payload) {
  var m = payload.market || {};
  var hasToken = payload.kind === "company_with_token" && payload.token;
  var price = hasToken && finite(m.price_usd) ? m.price_usd : null;
  if (!hasToken) {
    $("m-price").textContent = "--";
    $("m-price-note").textContent = "No token yet.";
    $("m-chg").innerHTML = "";
    $("m-fdv").textContent = "--";
    $("m-liq").textContent = "--";
    $("m-vol").textContent = "--";
    $("m-chg2").textContent = "--";
    return;
  }
  $("m-price").textContent = price == null ? "--" : F.usdPx(price);
  $("m-price-note").textContent = price == null
    ? "Token listed. No pool snapshot yet."
    : "USD from Launchpad mcap / 1,000,000,000";
  var chg = m.change_24h_percent;
  $("m-chg").innerHTML = finite(chg)
    ? "<span class='" + (chg >= 0 ? "up" : "dn") + "'>" + F.pct(chg) + "</span> 24h"
    : "";
  $("m-fdv").textContent = finite(m.fdv_usd) ? F.usdCompact(m.fdv_usd) : "--";
  $("m-liq").textContent = finite(m.liquidity_usd) ? F.usdCompact(m.liquidity_usd) : "--";
  $("m-vol").textContent = finite(m.volume_24h_usd) ? F.usdCompact(m.volume_24h_usd) : "--";
  $("m-chg2").textContent = finite(chg) ? F.pct(chg) : "--";
}

function paintProgress(company) {
  var a = company && company.attestation;
  var p = company && company.progress;
  if (a && finite(a.health_score)) {
    $("c-health").textContent = String(a.health_score);
  } else {
    $("c-health").textContent = "--";
  }
  var sub = [];
  if (a && a.freshness) sub.push(a.freshness);
  if (p && p.level_name) sub.push(p.level_name);
  $("c-healthsub").textContent = sub.join(" · ") || "No pushes yet.";
  if (p && typeof p.level === "number") $("c-level").textContent = String(p.level);
  else $("c-level").textContent = "--";
  if (p && finite(p.playbooks_done) && finite(p.playbooks_total)) {
    $("c-done").textContent = p.playbooks_done + " / " + p.playbooks_total;
  } else if (p && finite(p.playbooks_done)) {
    $("c-done").textContent = String(p.playbooks_done);
  } else {
    $("c-done").textContent = "--";
  }
  $("c-ready").textContent = p && finite(p.playbooks_ready) ? String(p.playbooks_ready) : "--";
  $("c-fresh").textContent = a && a.freshness ? a.freshness : "--";
  var w = p && p.work;
  var extra = $("work-extra");
  if (extra) extra.hidden = !w;
  if (w) {
    $("c-artifacts").textContent = finite(w.artifacts_total) ? F.ci(w.artifacts_total) : "--";
    $("c-rubrics").textContent = finite(w.rubric_pins) ? F.ci(w.rubric_pins) : "--";
    $("c-events").textContent = finite(w.tasks_total) ? F.ci(w.tasks_total) : "--";
    $("c-inflight").textContent = finite(w.in_flight) ? String(w.in_flight) : "--";
  }
}

function paintLadder(company) {
  var p = company && company.progress;
  var levels = p && Array.isArray(p.levels) ? p.levels : [];
  var cur = p && typeof p.level === "number" ? p.level : null;
  var ladder = $("ladder");
  var meta = $("laddermeta");
  if (!ladder) return;
  if (!levels.length) {
    ladder.innerHTML = "";
    if (meta) {
      meta.textContent = p
        ? ("Level " + (cur == null ? "--" : cur) + ". "
          + (finite(p.playbooks_done) ? p.playbooks_done : "--") + " of "
          + (finite(p.playbooks_total) ? p.playbooks_total : "--") + " playbooks complete.")
        : "No pushes yet.";
    }
    return;
  }
  ladder.innerHTML = levels.map(function (L) {
    var i = typeof L.level === "number" ? L.level : 0;
    var cls = "rung";
    if (cur != null && i < cur) cls += " done";
    if (cur === i) cls += " now";
    return "<div class='" + cls + "'><div class='bar'></div><div class='n'>" + i + " " + F.esc(L.name || ("Level " + i)) + "</div></div>";
  }).join("");
  if (meta) {
    meta.innerHTML = "Level " + (cur == null ? "--" : cur) + " of 8. <span class='lit'>"
      + (p && finite(p.playbooks_done) ? p.playbooks_done : "--") + "</span> of "
      + (p && finite(p.playbooks_total) ? p.playbooks_total : "--") + " selected playbooks complete.";
  }
}

function paintPulse(company) {
  var days = company && company.calendar && Array.isArray(company.calendar.days) ? company.calendar.days : [];
  if (!days.length) {
    show("tile-pulse", false);
    return;
  }
  show("tile-pulse", true);
  var grid = $("ghgrid");
  var mo = $("gh-months");
  if (!grid) return;
  var max = 1;
  var i;
  for (i = 0; i < days.length; i++) {
    if (days[i] && days[i].events > max) max = days[i].events;
  }
  var first = days[0] ? parseUtc(days[0].date) : null;
  var firstDow = first ? first.getUTCDay() : 0;
  var weeks = Math.ceil((firstDow + days.length) / 7);
  grid.style.gridAutoFlow = "column";
  grid.style.gridTemplateRows = "repeat(7, var(--cell))";
  grid.style.gridTemplateColumns = "repeat(" + weeks + ", var(--cell))";
  var cells = "";
  for (i = 0; i < firstDow; i++) cells += "<span class='hc pad'></span>";
  for (i = 0; i < days.length; i++) {
    var v = days[i] && days[i].events || 0;
    var ring = days[i] && days[i].attestation ? " push" : "";
    var lvl = v === 0 ? "" : " l" + Math.min(4, Math.max(1, Math.ceil(v / max * 4)));
    var when = fmtDay(days[i] && days[i].date);
    cells += "<span class='hc" + lvl + ring + "' title='" + F.esc(when) + "'></span>";
  }
  grid.innerHTML = cells;
  if (mo) {
    mo.style.gridTemplateColumns = "repeat(" + weeks + ", var(--cell))";
    mo.innerHTML = "";
  }
  var hz = $("pulse-hz");
  var a = company.attestation || {};
  if (hz) {
    hz.textContent = finite(a.health_score) ? ("health " + a.health_score) : "";
  }
}

function previewFallbackCopy(kind) {
  if (kind === "site") return "Preview failed. Open the full site.";
  if (kind === "one_pager") return "Preview failed. Open the one-pager.";
  return "Preview failed. Open the deck.";
}

function applyPreviewFallback(kind) {
  var frame = $("artifact-frame");
  var empty = $("artifact-empty");
  var open = $("artifact-open");
  if (frame) {
    frame.hidden = true;
    frame.removeAttribute("src");
    frame.tabIndex = -1;
  }
  if (empty) {
    empty.hidden = false;
    empty.textContent = previewFallbackCopy(kind);
  }
  if (open && open.getAttribute("href")) open.hidden = false;
}

function paintPreview(kind, artifact, slug, canonical) {
  var frame = $("artifact-frame");
  var empty = $("artifact-empty");
  var open = $("artifact-open");
  var stage = $("artifact-stage");
  if (!frame) return;
  frame.setAttribute("sandbox", IFRAME_SANDBOX);
  frame.setAttribute("loading", "lazy");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.title = (ARTIFACT_LABELS[kind] || "Artifact") + " preview";
  frame.tabIndex = -1;
  frame.onerror = function () {
    if (artifactPreviewState.active === kind) applyPreviewFallback(kind);
  };
  frame.removeAttribute("src");
  if (stage) stage.setAttribute("aria-labelledby", "artifact-tab-" + kind);
  if (open) {
    open.removeAttribute("href");
    open.hidden = true;
  }
  var art = publicArtifact(artifact, slug);
  if (art && art.preview_ok === false) {
    if (kind === "site" && open && canonical && isCasaUrl(canonical, slug)) {
      open.href = canonical;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      open.hidden = false;
    } else if (open) {
      open.href = art.url;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      open.hidden = false;
    }
    applyPreviewFallback(kind);
    return;
  }
  if (kind === "site" && open && canonical && isCasaUrl(canonical, slug)) {
    open.href = canonical;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.hidden = false;
  }
  if (!art) {
    frame.hidden = true;
    if (empty) {
      empty.hidden = false;
      empty.textContent = kind === "site" ? "No public website."
        : (kind === "one_pager" ? "No public one-pager." : "No public deck.");
    }
    return;
  }
  frame.src = art.url;
  frame.hidden = false;
  if (empty) empty.hidden = true;
  if (kind !== "site" && open) {
    open.href = art.url;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.hidden = false;
  }
}

function enabledArtifactKinds() {
  return ARTIFACTS.filter(function (kind) { return !!artifactPreviewState.artifacts[kind]; });
}

function selectArtifact(kind, focusTab) {
  if (ARTIFACTS.indexOf(kind) < 0 || !artifactPreviewState.artifacts[kind]) return false;
  artifactPreviewState.active = kind;
  ARTIFACTS.forEach(function (candidate) {
    var tab = $("artifact-tab-" + candidate);
    if (!tab) return;
    var selected = candidate === kind;
    tab.setAttribute("aria-selected", selected ? "true" : "false");
    tab.tabIndex = selected ? 0 : -1;
  });
  paintPreview(
    kind,
    artifactPreviewState.artifacts[kind],
    artifactPreviewState.slug,
    artifactPreviewState.canonical,
  );
  var activeTab = $("artifact-tab-" + kind);
  if (focusTab && activeTab) activeTab.focus();
  return true;
}

function moveArtifactTab(kind, step) {
  var enabled = enabledArtifactKinds();
  if (!enabled.length) return null;
  var current = enabled.indexOf(kind);
  if (current < 0) current = 0;
  return enabled[(current + step + enabled.length) % enabled.length];
}

function initArtifactTabs() {
  ARTIFACTS.forEach(function (kind) {
    var tab = $("artifact-tab-" + kind);
    if (!tab) return;
    tab.addEventListener("click", function () { selectArtifact(kind, false); });
    tab.addEventListener("keydown", function (event) {
      var next = null;
      if (event.key === "ArrowRight") next = moveArtifactTab(kind, 1);
      else if (event.key === "ArrowLeft") next = moveArtifactTab(kind, -1);
      else if (event.key === "Home") next = enabledArtifactKinds()[0] || null;
      else if (event.key === "End") {
        var enabled = enabledArtifactKinds();
        next = enabled.length ? enabled[enabled.length - 1] : null;
      }
      if (!next) return;
      event.preventDefault();
      selectArtifact(next, true);
    });
  });
}

function paintPreviews(company) {
  var arts = (company && company.artifacts) || {};
  var slug = company && company.slug;
  var canonical = company && company.canonical_url;
  artifactPreviewState = { artifacts: {}, slug: slug, canonical: canonical, active: "site" };
  ARTIFACTS.forEach(function (kind) {
    var art = publicArtifact(arts[kind], slug);
    artifactPreviewState.artifacts[kind] = art;
    var tab = $("artifact-tab-" + kind);
    if (tab) {
      tab.disabled = !art;
      tab.setAttribute("aria-selected", "false");
      tab.tabIndex = -1;
    }
  });
  var available = enabledArtifactKinds();
  if (available.length) {
    selectArtifact(available.indexOf("site") >= 0 ? "site" : available[0], false);
    return;
  }
  var frame = $("artifact-frame");
  var empty = $("artifact-empty");
  var open = $("artifact-open");
  if (frame) { frame.hidden = true; frame.removeAttribute("src"); }
  if (empty) { empty.hidden = false; empty.textContent = "No public company artifacts."; }
  if (open) { open.hidden = true; open.removeAttribute("href"); }
}

function paintChart(payload) {
  var empty = $("chart-empty");
  var canvas = $("chart");
  var hasToken = payload.kind === "company_with_token" && payload.token;
  var series = payload.priceSeries;
  var points = series && Array.isArray(series.points) ? series.points : [];
  if (!hasToken) {
    if (empty) {
      empty.hidden = false;
      empty.textContent = "No token yet. Market chart appears when a token is attached.";
    }
    if (canvas) canvas.hidden = true;
    return;
  }
  if (points.length < 2) {
    if (empty) {
      empty.hidden = false;
      empty.textContent = "No price series for this token.";
    }
    if (canvas) canvas.hidden = true;
    return;
  }
  if (empty) empty.hidden = true;
  if (!canvas) return;
  canvas.hidden = false;
  var ctx = canvas.getContext("2d");
  var W = canvas.clientWidth || 640;
  var H = canvas.clientHeight || 280;
  var dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  var vals = [];
  var i;
  for (i = 0; i < points.length; i++) {
    var p = points[i];
    var usd = p && (p.usd != null ? p.usd : p.close);
    if (usd != null && isFinite(Number(usd))) vals.push(Number(usd));
  }
  if (vals.length < 2) return;
  var min = Math.min.apply(null, vals);
  var max = Math.max.apply(null, vals);
  var pad = (max - min) * 0.12 || max * 0.05 || 0.01;
  min -= pad;
  max += pad;
  var l = 12, r = 12, t = 12, b = 16;
  ctx.beginPath();
  for (i = 0; i < vals.length; i++) {
    var x = l + i / (vals.length - 1) * (W - l - r);
    var y = t + (1 - (vals[i] - min) / (max - min)) * (H - t - b);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "rgba(246,247,247,.92)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

function paintAttest(company, payload) {
  var el = $("attest");
  if (!el) return;
  var bits = [];
  bits.push("<b>What Capx knows, and what it does not.</b> This page is the company record. ");
  bits.push("Website, one-pager, and deck previews run in a sandboxed frame. They are not Terminal origin. ");
  bits.push("The full site opens on the Casa host in a separate tab. ");
  if (payload.kind === "company_without_token") {
    bits.push("No token is attached yet. Market fields stay dash, never a synthetic price. This URL stays when a token launches.");
  } else {
    bits.push("A Launchpad token is joined on agent_mint. Price is Launchpad, not Casa.");
  }
  var a = company && company.attestation;
  if (a && finite(a.health_score)) {
    bits.push(" health_score on this document is " + a.health_score + " as Casa returned it.");
  }
  el.innerHTML = bits.join("");
}

function isUnobserved(doc) {
  if (!doc) return true;
  if (doc.progress == null) return true;
  if (doc.attestation && doc.attestation.freshness === "unobserved") return true;
  return false;
}

function looksLikePath(s) {
  s = String(s || "");
  if (!s) return false;
  if (/^(\/|[A-Za-z]:\\|~\/)/.test(s)) return true;
  if (s.indexOf("\\") >= 0) return true;
  if (/\.(jsonl?|ts|js|mjs|py|go|rs)$/i.test(s) && s.indexOf("/") >= 0) return true;
  return false;
}

function winNum(n, w) {
  if (!finite(n)) return "--";
  if (w && w.scale) return (Number(n) / w.scale).toFixed(1) + "x";
  if (w && w.unit) return F.ci(n) + " " + F.esc(w.unit);
  return F.ci(n);
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

function kv(k, v, cls) {
  return "<div class='kv'><span class='kk'>" + F.esc(k) + "</span><span class='kvv " + (cls || "") + "'>" + v + "</span></div>";
}

function paintConstraint(doc) {
  var body = $("cons-body");
  if (!body) return;
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
  html += "<div class='wdays'></div>";
  html += "<div class='wsmall'>" + (ns && ns.label ? "North star · " + F.esc(ns.label) : "") + "</div>";
  html += "</div></div>";
  if (w.label) {
    html += "<div class='wdef'><span class='v-clm'>" + winNum(w.target_value, w) + " " + F.esc(w.label) + "</span>";
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
    if (!el) return;
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

function paintRepro(doc) {
  if (!$("checks")) return;
  var R = (doc && doc.reproduced) || {};
  var a = (doc && doc.attestation) || {};
  var p = doc && doc.progress;
  var rows = [];
  if (isUnobserved(doc)) {
    $("checks").innerHTML = "<p class='nopush'>No pushes yet.</p>";
    $("repro-count").textContent = "";
    $("cov-v").textContent = "--";
    $("cov-bar").style.width = "0%";
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
  rows.push(chkRow(R.tier2_ran === true ? true : null, "Tier 2",
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
    $("cov-bar").style.width = "0%";
  }
  $("repro-foot").innerHTML = (R.coverage_bp === 0)
    ? "<b class='dn'>Nothing here is checkable.</b> Not one event names a playbook node, so there is no graph to replay it against. An attestation that cannot be wrong is not evidence. attested means Casa tier 0 and tier 1 and chain and observation signature."
    : "attested means Casa tier 0 and tier 1 and chain and observation signature. It is not identity and not a claim that the business is real. last_session_at is claimed. health and freshness are reproduced by Casa. Capx holds attest/, not the brain.";
}

function paintWire(doc) {
  if (!$("wire")) return;
  var L = doc && doc.ledger;
  var shown = L && Array.isArray(L.shown) ? L.shown.slice(0, 40) : [];
  if (isUnobserved(doc) || !shown.length) {
    $("wire").innerHTML = "<div class='empty tall'>" + (isUnobserved(doc) ? "No pushes yet." : "The ledger delta is empty.") + "</div>";
    $("wire-count").textContent = isUnobserved(doc) ? "" : "0 events disclosed";
    return;
  }
  $("wire").innerHTML = shown.map(function (e) {
    var title = e.title || e.node_id || e.kind || "event";
    if (looksLikePath(title)) title = e.node_id || e.kind || "event";
    var band = e.criticality || "growth";
    var crit = e.criticality === "existential" ? "exi" : (e.criticality === "core" ? "cor" : "");
    return "<div class='wr " + F.esc(band) + "'>"
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
  $("wire-count").textContent = shown.length + " of " + F.ci(windowN) + " events disclosed";
}

function paintEnvelope(doc) {
  if (!$("env")) return;
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

function paintJudgment(doc) {
  if (!$("judge")) return;
  var html = "";
  var items = doc && doc.decisions && Array.isArray(doc.decisions.items) ? doc.decisions.items : [];
  html += "<div class='rgrp'><span class='label'>Decisions logged<span style='color:var(--t600)'> · founder claimed</span></span></div>";
  if (!items.length) {
    html += "<div class='empty'>No decision was written to the ledger this window.</div>";
  } else {
    items.forEach(function (d) {
      var ago = d.ts ? F.ago(d.ts) : "";
      html += "<div class='dec'><div class='dt'>" + F.esc(ago) + (d.department ? " · " + F.esc(d.department) : "")
        + "</div>" + F.esc(d.text || "") + " <span class='clmdot'>·</span></div>";
    });
  }
  $("judge").innerHTML = html;
}

function paintDepts(doc) {
  if (!$("deptboard")) return;
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

function paintCasaTiles(company) {
  var cons = !!(company && company.progress && company.progress.constraint);
  var vitals = !!(company && (company.progress || company.reproduced));
  var repro = !!(company && company.reproduced);
  var wire = !!(company && company.ledger && Array.isArray(company.ledger.shown) && company.ledger.shown.length);
  var env = !!(company && company.envelope);
  var judge = !!(company && company.decisions && Array.isArray(company.decisions.items) && company.decisions.items.length);
  var depts = !!(company && company.departments_30d && Array.isArray(company.departments_30d.items)
    && company.departments_30d.items.some(function (d) { return d && d.events; }));
  show("tile-cons", cons);
  show("tile-vitals", vitals);
  show("tile-repro", repro);
  show("tile-wire", wire);
  show("tile-env", env);
  show("tile-judge", judge);
  show("tile-dept", depts);
  if (cons) paintConstraint(company);
  if (vitals) paintVitals(company);
  if (repro) paintRepro(company);
  if (wire) paintWire(company);
  if (env) paintEnvelope(company);
  if (judge) paintJudgment(company);
  if (depts) paintDepts(company);
}

function paintUnavailable(error, message) {
  $("page").hidden = true;
  $("notfound").hidden = false;
  var code = $("nf-code");
  if (code) code.textContent = message || "No such company";
  if (error === "CASA_UNAVAILABLE") {
    $("err").hidden = false;
    $("err").textContent = "Casa is unavailable";
  }
}

function boot(payload) {
  if (payload.sample) {
    $("sample-pill").hidden = false;
    $("foot").textContent = "capx · company page · sample data · token attach keeps this URL";
  }
  if (payload.error) {
    paintUnavailable(payload.error, payload.message);
    return;
  }
  if (!payload.company) {
    paintUnavailable("NOT_FOUND", "No such company");
    return;
  }
  $("page").hidden = false;
  var company = payload.company;
  paintIdentity(company);
  paintProvenance(company);
  paintMarket(payload);
  paintProgress(company);
  paintLadder(company);
  paintPulse(company);
  paintCasaTiles(company);
  paintPreviews(company);
  paintChart(payload);
  paintAttest(company, payload);
  if (payload.token_href) {
    var link = $("token-link");
    if (link) {
      link.href = payload.token_href;
      link.hidden = false;
    }
  }
  var price = $("tile-price");
  if (price) price.classList.toggle("wide", payload.kind !== "company_with_token");
  var work = $("tile-work");
  if (work) work.classList.toggle("wide", payload.kind !== "company_with_token");
}

initArtifactTabs();
var slug = slugFromPath();
if (!slug) {
  paintUnavailable("NOT_FOUND", "No such company");
} else {
  fetch("/api/companies/" + encodeURIComponent(slug), { cache: "no-store" })
    .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
    .then(function (res) {
      if (res.status === 404 || res.status === 400) {
        paintUnavailable(res.body && res.body.error, res.body && res.body.message);
        return;
      }
      if (res.status === 503) {
        paintUnavailable("CASA_UNAVAILABLE", res.body && res.body.message);
        return;
      }
      boot(res.body);
    })
    .catch(function (err) {
      $("err").hidden = false;
      $("err").textContent = "Terminal could not load this company: " + err.message;
    });
}
