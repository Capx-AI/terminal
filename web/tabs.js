"use strict";
/*
 * View tabs for the detail pages. Tiles declare the views they belong to via
 * data-view="overview work"; the controller stamps v-<view> on #page and CSS
 * does the hiding, so the data-driven [hidden] logic on tiles is untouched.
 * Hash-routed (#work) so the one-URL contract from the v1 spec holds.
 */
window.CAPX_TABS = (function () {
  var current = "overview";

  function buttons() {
    return Array.prototype.slice.call(
      document.querySelectorAll(".viewtabs .vt"),
    );
  }

  function apply(view) {
    current = view;
    var page = document.getElementById("page");
    if (page) {
      page.className = page.className
        .split(/\s+/)
        .filter(function (c) { return c && c.indexOf("v-") !== 0; })
        .concat(["v-" + view])
        .join(" ");
    }
    buttons().forEach(function (b) {
      var on = b.getAttribute("data-view") === view;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    window.dispatchEvent(new Event("resize"));
  }

  function pick(view) {
    try {
      history.replaceState(null, "", "#" + view);
    } catch (err) { /* history can be unavailable in odd embeds */ }
    apply(view);
  }

  function boot() {
    var nav = document.querySelector(".viewtabs");
    if (!nav) return;
    nav.addEventListener("click", function (e) {
      var b = e.target.closest(".vt");
      if (!b || b.hidden) return;
      pick(b.getAttribute("data-view"));
    });
    window.addEventListener("hashchange", function () {
      var h = (location.hash || "").replace("#", "");
      if (buttons().some(function (b) { return !b.hidden && b.getAttribute("data-view") === h; })) {
        apply(h);
      }
    });
    var h = (location.hash || "").replace("#", "");
    var valid = buttons().some(function (b) { return b.getAttribute("data-view") === h; });
    apply(valid ? h : "overview");
  }

  /* Pages call this once data is known: {market:false} hides the Market tab. */
  function available(map) {
    buttons().forEach(function (b) {
      var v = b.getAttribute("data-view");
      if (v in map) b.hidden = map[v] === false;
    });
    var active = buttons().filter(function (b) {
      return b.getAttribute("data-view") === current;
    })[0];
    if (active && active.hidden) pick("overview");
  }

  return { boot: boot, available: available, apply: apply };
})();
