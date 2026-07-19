/* util.js — Formatierung & DOM-Helfer */
"use strict";
var U = (function () {
  var fmtEUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
  var fmtEUR0 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  var fmtNum = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
  var MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  var MONATE_K = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

  function eur(v, opts) {
    if (v == null || isNaN(v)) return "–";
    return (opts && opts.ganz ? fmtEUR0 : fmtEUR).format(v);
  }
  function num(v) { return v == null || isNaN(v) ? "–" : fmtNum.format(v); }
  function pct(v, digits) {
    if (v == null || isNaN(v)) return "–";
    return new Intl.NumberFormat("de-DE", { style: "percent", minimumFractionDigits: digits == null ? 1 : digits, maximumFractionDigits: digits == null ? 1 : digits }).format(v);
  }
  function dateDE(iso) {
    if (!iso) return "–";
    return iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4);
  }
  function monthLabel(mk, kurz) {
    var y = mk.slice(0, 4), m = parseInt(mk.slice(5, 7), 10) - 1;
    return (kurz ? MONATE_K[m] + " " + y.slice(2) : MONATE[m] + " " + y);
  }
  function todayIso() { return new Date().toISOString().slice(0, 10); }
  function currentMonth() { return todayIso().slice(0, 7); }
  function cssVar(name) {
    try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#8C99B4"; }
    catch (e) { return "#8C99B4"; }
  }
  function uid(prefix) { return (prefix || "id") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8); }

  // DOM
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2), attrs[k]);
      else if (k === "style") node.setAttribute("style", attrs[k]);
      else if (attrs[k] === true) node.setAttribute(k, "");
      else if (attrs[k] !== false && attrs[k] != null) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x != null) node.appendChild(typeof x === "string" ? document.createTextNode(x) : x); });
      else node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function debounce(fn, ms) {
    var t = null;
    return function () { var args = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, args); }, ms); };
  }
  // Eingabe "1.234,56" / "1234.56" / "1234" → Zahl
  function parseInputNumber(s) {
    if (typeof s === "number") return s;
    s = String(s == null ? "" : s).trim().replace(/€/g, "").replace(/\s/g, "");
    if (!s) return NaN;
    if (/,\d{0,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else if (s.indexOf(",") !== -1 && s.indexOf(".") === -1) s = s.replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");   // "2.500" = Tausenderpunkt, nicht 2,5
    return parseFloat(s);
  }
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }
  function toast(msg, kind, action) {
    var host = document.getElementById("toasts");
    var closeTimer;
    var t = el("div", { class: "toast " + (kind || "") }, msg);
    if (action) {
      t.appendChild(el("button", {
        class: "toast-action", onclick: function () {
          clearTimeout(closeTimer);
          t.classList.add("out"); setTimeout(function () { t.remove(); }, 350);
          action.onClick();
        }
      }, action.label));
    }
    host.appendChild(t);
    closeTimer = setTimeout(function () { t.classList.add("out"); setTimeout(function () { t.remove(); }, 350); }, action ? 6000 : 3200);
  }
  // Bytes → Text mit Encoding-Erkennung (UTF-8, sonst Windows-1252 wie bei
  // Sparkassen-Exporten). Genutzt vom Datei-Dialog UND vom nativen Dock-Drop.
  function decodeCsvBytes(buf) {
    var utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    if (utf8.indexOf("�") !== -1) {
      try { return new TextDecoder("windows-1252").decode(buf); } catch (e) { /* fallthrough */ }
    }
    return utf8;
  }

  return { eur: eur, num: num, pct: pct, dateDE: dateDE, monthLabel: monthLabel, todayIso: todayIso, currentMonth: currentMonth, uid: uid, cssVar: cssVar, el: el, clear: clear, debounce: debounce, parseInputNumber: parseInputNumber, download: download, toast: toast, decodeCsvBytes: decodeCsvBytes };
})();
