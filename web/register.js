"use strict";

(function () {
  var form = document.getElementById("reg");
  var input = document.getElementById("code");
  var btn = document.getElementById("go");
  var err = document.getElementById("err");
  var ok = document.getElementById("ok");
  if (!form || !input) return;

  function showErr(text) {
    ok.hidden = true;
    err.textContent = text;
    err.hidden = false;
    input.setAttribute("aria-invalid", "true");
  }

  function showOk(text) {
    err.hidden = true;
    ok.textContent = text;
    ok.hidden = false;
    input.removeAttribute("aria-invalid");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var code = String(input.value || "").trim();
    if (!code) {
      showErr("No such registration code");
      return;
    }
    err.hidden = true;
    ok.hidden = true;
    if (btn) btn.disabled = true;
    fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      cache: "no-store",
      body: JSON.stringify({ code: code }),
    }).then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok, data: data || {} };
      }).catch(function () {
        return { ok: false, data: { message: "Registration failed" } };
      });
    }).then(function (result) {
      if (!result.ok) {
        showErr(result.data.message || result.data.error || "Registration failed");
        return;
      }
      showOk(result.data.message || result.data.outcome || "Company published");
      if (result.data.redirect) location.assign(result.data.redirect);
    }).catch(function () {
      showErr("Registration failed");
    }).then(function () {
      if (btn) btn.disabled = false;
    });
  });
})();
