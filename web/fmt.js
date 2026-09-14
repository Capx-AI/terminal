"use strict";
/* Shared formatters. Market numbers: white/green/red. Casa numbers stay lime in CSS. */

window.CAPX_FMT = (function () {
  function compact(n) {
    var a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
    if (a >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return "" + Math.round(n);
  }
  function usdCompact(n) {
    if (n == null || !isFinite(n)) return "--";
    return "$" + compact(n);
  }
  var SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
  function subscriptNumber(z) {
    return String(z).split("").map(function (ch) {
      return SUBSCRIPT_DIGITS[+ch] || ch;
    }).join("");
  }
  /* Never scientific notation: $0.0(7)786 style, the zero run as a subscript. */
  function usdPx(n) {
    if (n == null || !isFinite(n)) return "--";
    if (n >= 1) return "$" + n.toFixed(2);
    if (n >= 0.01) return "$" + n.toFixed(4);
    if (n >= 1e-4) return "$" + n.toFixed(6);
    if (n <= 0) return "$0.00";
    var zeros = Math.max(0, -Math.floor(Math.log10(n)) - 1);
    var mantissa = Math.round(n * Math.pow(10, zeros + 3));
    if (mantissa >= 1000) {
      zeros -= 1;
      mantissa = Math.round(n * Math.pow(10, zeros + 3));
    }
    if (zeros < 4) return "$" + n.toFixed(zeros + 3);
    return "$0.0" + subscriptNumber(zeros) + mantissa;
  }
  function pct(n, d) {
    if (n == null || !isFinite(n)) return "--";
    return (n >= 0 ? "+" : "") + n.toFixed(d === undefined ? 1 : d) + "%";
  }
  function ci(n) {
    if (n == null || !isFinite(n)) return "--";
    return Math.round(n).toLocaleString("en-US");
  }
  function bp(n) {
    if (n == null || !isFinite(n)) return "--";
    return (n / 100).toFixed(1) + "%";
  }
  function hoursAgo(hours) {
    if (hours == null || !isFinite(hours)) return "--";
    if (hours < 1) return Math.max(1, Math.round(hours * 60)) + "m ago";
    if (hours < 48) return Math.round(hours) + "h ago";
    return Math.round(hours / 24) + "d ago";
  }
  function capxAmount(base) {
    if (base == null || base === "") return null;
    var n = Number(base) / 1e9;
    if (!isFinite(n)) return null;
    return n;
  }
  function capxLabel(base) {
    var n = capxAmount(base);
    if (n == null) return "--";
    if (n >= 1000) return compact(n) + " CAPX";
    return (Math.round(n * 100) / 100).toString() + " CAPX";
  }
  function ago(iso) {
    if (!iso) return "--";
    var t = Date.parse(iso);
    if (!isFinite(t)) return "--";
    var h = (Date.now() - t) / 3600000;
    if (h < 1) return Math.max(1, Math.round(h * 60)) + "m ago";
    if (h < 48) return Math.round(h) + "h ago";
    return Math.round(h / 24) + "d ago";
  }
  function shortHash(h) {
    if (!h) return "none";
    return h.slice(0, 8) + "...";
  }
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function tokenPriceUsd(row) {
    if (row && row.marketPerformance && Object.prototype.hasOwnProperty.call(row.marketPerformance, "priceUsd")) return typeof row.marketPerformance.priceUsd === "number" ? row.marketPerformance.priceUsd : null;
    var mcap = row && row.marketPerformance && row.marketPerformance.currentMarketCapUsd;
    if (mcap == null || !isFinite(mcap)) return null;
    return mcap / 1e9;
  }
  return {
    compact: compact,
    usdCompact: usdCompact,
    usdPx: usdPx,
    pct: pct,
    ci: ci,
    bp: bp,
    hoursAgo: hoursAgo,
    capxAmount: capxAmount,
    capxLabel: capxLabel,
    ago: ago,
    shortHash: shortHash,
    esc: esc,
    tokenPriceUsd: tokenPriceUsd,
    SUPPLY: 1000000000,
  };
})();
