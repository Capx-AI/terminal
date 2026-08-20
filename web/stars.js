"use strict";
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var c = document.getElementById("stars");
  if (!c || !c.getContext) return;
  var ctx = c.getContext("2d");
  var pts = [];
  var i, W, H;
  function fit() {
    var dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit();
  window.addEventListener("resize", fit);
  for (i = 0; i < 40; i++) {
    pts.push({
      x: Math.random() * 1600,
      y: Math.random() * 1000,
      s: Math.random() * 1.2 + 0.3,
      v: Math.random() * 0.1 + 0.03,
      o: Math.random() * 0.4 + 0.1,
    });
  }
  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (i = 0; i < pts.length; i++) {
      var p = pts[i];
      ctx.beginPath();
      ctx.arc(p.x % W, p.y % H, p.s, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(197,220,107," + p.o.toFixed(2) + ")";
      ctx.fill();
      p.y -= p.v;
      if (p.y < -4) p.y = H + 4;
    }
    if (!reduce) requestAnimationFrame(frame);
  }
  frame();
})();
