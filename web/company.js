"use strict";
var F = window.CAPX_FMT;
var $ = function (id) { return document.getElementById(id); };

var IFRAME_SANDBOX = "allow-scripts";
var ARTIFACTS = ["site", "one_pager", "deck"];
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
  var frame = $(kind + "-frame");
  var empty = $(kind + "-empty");
  var open = $(kind + "-open");
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
  var frame = $(kind + "-frame");
  var empty = $(kind + "-empty");
  var open = $(kind + "-open");
  if (!frame) return;
  frame.setAttribute("sandbox", IFRAME_SANDBOX);
  frame.setAttribute("loading", "lazy");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.tabIndex = -1;
  frame.onerror = function () { applyPreviewFallback(kind); };
  frame.removeAttribute("src");
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
    if (empty) empty.hidden = false;
    if (kind !== "site" && open) {
      open.removeAttribute("href");
      open.hidden = true;
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

function paintPreviews(company) {
  var arts = (company && company.artifacts) || {};
  var slug = company && company.slug;
  var canonical = company && company.canonical_url;
  ARTIFACTS.forEach(function (kind) {
    paintPreview(kind, arts[kind], slug, canonical);
  });
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
