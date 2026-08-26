"use strict";
/*
 * Minimal markdown renderer for the output library. Sanitizing by
 * construction: the source is HTML-escaped before any structure is built, so
 * raw HTML in a document renders as visible text, never as markup. Links are
 * https-only and open in a new tab. No external libraries.
 */
(function (root) {
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function inline(t) {
    t = t.replace(/`([^`]+)`/g, function (_, code) {
      return "<code>" + code + "</code>";
    });
    t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    t = t.replace(/(^|[^*])\*([^*]+)\*/g, "$1<i>$2</i>");
    t = t.replace(
      /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g,
      "<a href=\"$2\" target=\"_blank\" rel=\"noopener noreferrer nofollow\">$1</a>",
    );
    return t;
  }

  function render(markdown) {
    var lines = esc(String(markdown)).replace(/\r\n?/g, "\n").split("\n");
    var out = [];
    var para = [];
    var list = null; /* { tag, items } */
    var quote = [];
    var code = null; /* array of lines when inside a fence */

    function flushPara() {
      if (para.length) {
        out.push("<p>" + inline(para.join(" ")) + "</p>");
        para = [];
      }
    }
    function flushList() {
      if (list) {
        out.push("<" + list.tag + ">" + list.items.map(function (i) {
          return "<li>" + inline(i) + "</li>";
        }).join("") + "</" + list.tag + ">");
        list = null;
      }
    }
    function flushQuote() {
      if (quote.length) {
        out.push("<blockquote>" + inline(quote.join(" ")) + "</blockquote>");
        quote = [];
      }
    }
    function flushAll() {
      flushPara();
      flushList();
      flushQuote();
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (code !== null) {
        if (/^```/.test(line)) {
          out.push("<pre><code>" + code.join("\n") + "</code></pre>");
          code = null;
        } else {
          code.push(line);
        }
        continue;
      }
      if (/^```/.test(line)) {
        flushAll();
        code = [];
        continue;
      }
      var heading = line.match(/^(#{1,4})\s+(.*)$/);
      if (heading) {
        flushAll();
        var level = heading[1].length;
        out.push("<h" + level + ">" + inline(heading[2]) + "</h" + level + ">");
        continue;
      }
      if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
        flushAll();
        out.push("<hr>");
        continue;
      }
      var bullet = line.match(/^\s*[-*]\s+(.*)$/);
      var numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (bullet || numbered) {
        flushPara();
        flushQuote();
        var tag = bullet ? "ul" : "ol";
        if (!list || list.tag !== tag) {
          flushList();
          list = { tag: tag, items: [] };
        }
        list.items.push((bullet || numbered)[1]);
        continue;
      }
      var quoted = line.match(/^\s*&gt;\s?(.*)$/);
      if (quoted) {
        flushPara();
        flushList();
        quote.push(quoted[1]);
        continue;
      }
      if (!line.trim()) {
        flushAll();
        continue;
      }
      flushList();
      flushQuote();
      para.push(line.trim());
    }
    if (code !== null) out.push("<pre><code>" + code.join("\n") + "</code></pre>");
    flushAll();
    return out.join("\n");
  }

  var api = { render: render, esc: esc };
  if (root) root.CAPX_MD = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : null);
