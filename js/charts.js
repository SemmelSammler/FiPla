/* charts.js — schlanke SVG-Charts ohne Abhängigkeiten */
"use strict";
var Charts = (function () {
  var NS = "http://www.w3.org/2000/svg";
  function svg(w, h, cls) {
    var s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 " + w + " " + h);
    s.setAttribute("preserveAspectRatio", "none");
    s.setAttribute("class", "chart " + (cls || ""));
    return s;
  }
  function n(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  function niceRange(min, max) {
    if (min === max) { min -= 1; max += 1; }
    var pad = (max - min) * 0.08;
    return [min - pad, max + pad];
  }
  function fmtShort(v) {
    var a = Math.abs(v);
    if (a >= 1000000) return (v / 1000000).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " Mio";
    if (a >= 1000) return Math.round(v / 1000).toLocaleString("de-DE") + "k";
    return Math.round(v).toLocaleString("de-DE");
  }

  /* Liniendiagramm: series = [{label,x}], values in points[].y; markers optional */
  function line(opts) {
    var W = 720, H = opts.height || 220, padL = 52, padR = 12, padT = 14, padB = 26;
    var pts = opts.points; // [{label, y}]
    var s = svg(W, H, "chart-line");
    if (!pts.length) return s;
    var ys = pts.map(function (p) { return p.y; });
    var extra = opts.zeroLine ? [0] : [];
    var r = niceRange(Math.min.apply(null, ys.concat(extra)), Math.max.apply(null, ys.concat(extra)));
    var y0 = r[0], y1 = r[1];
    var X = function (i) { return padL + (pts.length === 1 ? 0.5 : i / (pts.length - 1)) * (W - padL - padR); };
    var Y = function (v) { return padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB); };
    // Gridlines (4)
    for (var g = 0; g <= 3; g++) {
      var gv = y0 + (y1 - y0) * g / 3;
      n("line", { x1: padL, x2: W - padR, y1: Y(gv), y2: Y(gv), class: "grid" }, s);
      var t = n("text", { x: padL - 8, y: Y(gv) + 4, class: "axis", "text-anchor": "end" }, s);
      t.textContent = fmtShort(gv);
    }
    if (opts.zeroLine && y0 < 0 && y1 > 0) n("line", { x1: padL, x2: W - padR, y1: Y(0), y2: Y(0), class: "zero" }, s);
    // Fläche + Linie
    var d = "", dArea = "M" + X(0) + " " + Y(Math.max(y0, Math.min(0, y1)));
    pts.forEach(function (p, i) { d += (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.y).toFixed(1); });
    dArea = d + "L" + X(pts.length - 1).toFixed(1) + " " + (H - padB) + "L" + X(0).toFixed(1) + " " + (H - padB) + "Z";
    n("path", { d: dArea, class: "area", fill: "url(#gradLine)" }, s);
    var defs = n("defs", {}, s);
    var grad = n("linearGradient", { id: "gradLine", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    n("stop", { offset: "0%", "stop-color": opts.color || "var(--accent)", "stop-opacity": 0.28 }, grad);
    n("stop", { offset: "100%", "stop-color": opts.color || "var(--accent)", "stop-opacity": 0 }, grad);
    n("path", { d: d, class: "stroke", stroke: opts.color || "var(--accent)" }, s);
    // Marker
    (opts.markers || []).forEach(function (m) {
      if (m.index < 0 || m.index >= pts.length) return;
      n("circle", { cx: X(m.index), cy: Y(pts[m.index].y), r: 4.5, fill: m.color || "var(--pos)", class: "marker" }, s);
      if (m.label) {
        var lt = n("text", { x: X(m.index), y: Y(pts[m.index].y) - 10, class: "marker-label", "text-anchor": "middle", fill: m.color || "var(--pos)" }, s);
        lt.textContent = m.label;
      }
    });
    (opts.dots || []).forEach(function (dd) {
      if (dd.index < 0 || dd.index >= pts.length) return;
      n("circle", { cx: X(dd.index), cy: Y(dd.y), r: 3.5, class: "dot", fill: dd.color || "var(--warn)" }, s);
    });
    // X-Beschriftung: max ~8 Labels
    var step = Math.max(1, Math.ceil(pts.length / 8));
    pts.forEach(function (p, i) {
      if (i % step !== 0 && i !== pts.length - 1) return;
      var t = n("text", { x: X(i), y: H - 8, class: "axis", "text-anchor": "middle" }, s);
      t.textContent = p.label;
    });
    // Hover per <title>
    pts.forEach(function (p, i) {
      var c = n("circle", { cx: X(i), cy: Y(p.y), r: 8, fill: "transparent" }, s);
      var ti = n("title", {}, c);
      ti.textContent = p.label + ": " + U.eur(p.y);
    });
    return s;
  }

  /* Doppel-Balken: Einnahmen (positiv) vs. Ausgaben (negativ) je Monat */
  function bars(opts) {
    var W = 720, H = opts.height || 220, padL = 52, padR = 12, padT = 12, padB = 26;
    var rows = opts.rows; // [{label, pos, neg}]  neg als negative Zahl
    var s = svg(W, H, "chart-bars");
    if (!rows.length) return s;
    var maxPos = Math.max(1, Math.max.apply(null, rows.map(function (r) { return r.pos; })));
    var minNeg = Math.min(-1, Math.min.apply(null, rows.map(function (r) { return r.neg; })));
    var y0 = minNeg * 1.06, y1 = maxPos * 1.06;
    var Y = function (v) { return padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB); };
    var bw = (W - padL - padR) / rows.length;
    for (var g = 0; g <= 3; g++) {
      var gv = y0 + (y1 - y0) * g / 3;
      n("line", { x1: padL, x2: W - padR, y1: Y(gv), y2: Y(gv), class: "grid" }, s);
      var t = n("text", { x: padL - 8, y: Y(gv) + 4, class: "axis", "text-anchor": "end" }, s);
      t.textContent = fmtShort(gv);
    }
    n("line", { x1: padL, x2: W - padR, y1: Y(0), y2: Y(0), class: "zero" }, s);
    rows.forEach(function (r, i) {
      var x = padL + i * bw;
      var w2 = Math.max(3, bw * 0.32);
      var bp = n("rect", { x: x + bw * 0.14, y: Y(r.pos), width: w2, height: Math.max(0, Y(0) - Y(r.pos)), rx: 2, class: "bar-pos" }, s);
      var bn = n("rect", { x: x + bw * 0.54, y: Y(0), width: w2, height: Math.max(0, Y(r.neg) - Y(0)), rx: 2, class: "bar-neg" }, s);
      var t1 = n("title", {}, bp); t1.textContent = r.label + " Einnahmen: " + U.eur(r.pos);
      var t2 = n("title", {}, bn); t2.textContent = r.label + " Ausgaben: " + U.eur(r.neg);
      var step = Math.max(1, Math.ceil(rows.length / 9));
      if (i % step === 0 || i === rows.length - 1) {
        var t = n("text", { x: x + bw / 2, y: H - 8, class: "axis", "text-anchor": "middle" }, s);
        t.textContent = r.label;
      }
    });
    return s;
  }

  /* Donut: parts = [{name, betrag(abs verwendet), farbe}] */
  function donut(parts, size) {
    var S = size || 150, R = S / 2 - 6, r2 = R * 0.62, cx = S / 2, cy = S / 2;
    var s = svg(S, S, "chart-donut");
    s.setAttribute("preserveAspectRatio", "xMidYMid meet");
    var total = parts.reduce(function (a, p) { return a + Math.abs(p.betrag); }, 0);
    if (total <= 0) { n("circle", { cx: cx, cy: cy, r: (R + r2) / 2, class: "donut-empty", fill: "none", "stroke-width": R - r2 }, s); return s; }
    var a0 = -Math.PI / 2;
    parts.forEach(function (p) {
      var frac = Math.abs(p.betrag) / total;
      var a1 = a0 + frac * Math.PI * 2;
      var mid = Math.min(a1, a0 + Math.PI * 2 - 0.0001);
      var large = (a1 - a0) > Math.PI ? 1 : 0;
      var x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
      var x1 = cx + R * Math.cos(mid), y1 = cy + R * Math.sin(mid);
      var x2 = cx + r2 * Math.cos(mid), y2 = cy + r2 * Math.sin(mid);
      var x3 = cx + r2 * Math.cos(a0), y3 = cy + r2 * Math.sin(a0);
      var d = "M" + x0 + " " + y0 + "A" + R + " " + R + " 0 " + large + " 1 " + x1 + " " + y1 +
        "L" + x2 + " " + y2 + "A" + r2 + " " + r2 + " 0 " + large + " 0 " + x3 + " " + y3 + "Z";
      var path = n("path", { d: d, fill: p.farbe || "#8C99B4", class: "donut-seg" }, s);
      var t = n("title", {}, path);
      t.textContent = p.name + ": " + U.eur(p.betrag) + " (" + Math.round(frac * 100) + " %)";
      a0 = a1;
    });
    return s;
  }

  /* Mehrserien-Linien: opts = {labels:[], series:[{name,color,values:[]}], markers:[{seriesIdx,index,label,color}], height, zeroLine} */
  function multiLine(opts) {
    var W = 720, H = opts.height || 260, padL = 56, padR = 12, padT = 14, padB = 26;
    var s = svg(W, H, "chart-line");
    var yFmt = opts.yFmt || fmtShort;                          // z. B. Jahreszahlen statt "2k"
    var series = opts.series.filter(function (sr) { return sr.values && sr.values.length; });
    if (!series.length || !opts.labels.length) return s;
    var all = [];
    series.forEach(function (sr) { sr.values.forEach(function (v) { if (v != null) all.push(v); }); });
    if (opts.zeroLine) all.push(0);
    var r = niceRange(Math.min.apply(null, all), Math.max.apply(null, all));
    var y0 = r[0], y1 = r[1], n0 = opts.labels.length;
    var X = function (i) { return padL + (n0 === 1 ? 0.5 : i / (n0 - 1)) * (W - padL - padR); };
    var Y = function (v) { return padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB); };
    for (var g = 0; g <= 3; g++) {
      var gv = y0 + (y1 - y0) * g / 3;
      n("line", { x1: padL, x2: W - padR, y1: Y(gv), y2: Y(gv), class: "grid" }, s);
      var t = n("text", { x: padL - 8, y: Y(gv) + 4, class: "axis", "text-anchor": "end" }, s);
      t.textContent = yFmt(gv);
    }
    if (opts.zeroLine && y0 < 0 && y1 > 0) n("line", { x1: padL, x2: W - padR, y1: Y(0), y2: Y(0), class: "zero" }, s);
    series.forEach(function (sr, si) {
      // Lücken (null/undefined) unterbrechen den Pfad, statt fälschlich durchgezeichnet zu
      // werden — so lassen sich z. B. "Bisher bekannt" und "nur Prognose" als zwei Serien
      // mit gemeinsamem Übergabepunkt darstellen, die exakt an der Nahtstelle zusammenstoßen.
      var d = "", started = false, lastIdx = -1;
      sr.values.forEach(function (v, i) {
        if (v == null) { started = false; return; }
        d += (started ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1);
        started = true; lastIdx = i;
      });
      if (si === 0 && opts.fillFirst !== false && lastIdx >= 0) {
        var firstIdx = sr.values.findIndex(function (v) { return v != null; });
        var gid = "gml" + Math.random().toString(36).slice(2, 7);
        var defs = n("defs", {}, s);
        var grad = n("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        n("stop", { offset: "0%", "stop-color": sr.color, "stop-opacity": 0.22 }, grad);
        n("stop", { offset: "100%", "stop-color": sr.color, "stop-opacity": 0 }, grad);
        n("path", { d: d + "L" + X(lastIdx).toFixed(1) + " " + (H - padB) + "L" + X(firstIdx).toFixed(1) + " " + (H - padB) + "Z", fill: "url(#" + gid + ")" }, s);
      }
      n("path", { d: d, class: "stroke", stroke: sr.color, "stroke-width": si === 0 ? 2.6 : 1.9, "stroke-dasharray": sr.dash ? "5 4" : "" }, s);
      // Hover-Titles
      sr.values.forEach(function (v, i) {
        if (v == null) return;
        var cc = n("circle", { cx: X(i), cy: Y(v), r: 7, fill: "transparent" }, s);
        var ti = n("title", {}, cc);
        ti.textContent = sr.hover ? sr.hover(i, v) : (opts.labels[i] + " · " + sr.name + ": " + U.eur(v));
      });
    });
    (opts.markers || []).forEach(function (m) {
      var sr = series[m.seriesIdx || 0];
      if (!sr || m.index < 0 || m.index >= sr.values.length) return;
      n("circle", { cx: X(m.index), cy: Y(sr.values[m.index]), r: 4.5, fill: m.color || "var(--pos)" }, s);
      if (m.label) {
        var lt = n("text", { x: X(m.index), y: Y(sr.values[m.index]) - 10, class: "marker-label", "text-anchor": "middle", fill: m.color || "var(--pos)" }, s);
        lt.textContent = m.label;
      }
    });
    // Unabhängige Punkte mit eigenem Y-Wert (nicht an eine Serie gebunden) — z. B. die
    // gelben Punkte für manuell eingetragene Kontostände im Verlaufs-Chart.
    (opts.dots || []).forEach(function (dd) {
      if (dd.index < 0 || dd.index >= n0) return;
      n("circle", { cx: X(dd.index), cy: Y(dd.y), r: 3.5, class: "dot", fill: dd.color || "var(--warn)" }, s);
    });
    var step = Math.max(1, Math.ceil(n0 / 9));
    opts.labels.forEach(function (lb, i) {
      if (i % step !== 0 && i !== n0 - 1) return;
      var t = n("text", { x: X(i), y: H - 8, class: "axis", "text-anchor": "middle" }, s);
      t.textContent = lb;
    });
    return s;
  }

  /* Gestapelte Balken (nur positive Werte): {labels:[], series:[{name,color,values:[]}], height} */
  function stackedBars(opts) {
    var W = 720, H = opts.height || 220, padL = 56, padR = 12, padT = 12, padB = 26;
    var s = svg(W, H, "chart-bars");
    var n0 = opts.labels.length;
    if (!n0) return s;
    var totals = opts.labels.map(function (_, i) {
      return opts.series.reduce(function (a, sr) { return a + Math.max(0, sr.values[i] || 0); }, 0);
    });
    var maxT = Math.max(1, Math.max.apply(null, totals)) * 1.06;
    var Y = function (v) { return padT + (1 - v / maxT) * (H - padT - padB); };
    var bw = (W - padL - padR) / n0;
    for (var g = 0; g <= 3; g++) {
      var gv = maxT * g / 3;
      n("line", { x1: padL, x2: W - padR, y1: Y(gv), y2: Y(gv), class: "grid" }, s);
      var t = n("text", { x: padL - 8, y: Y(gv) + 4, class: "axis", "text-anchor": "end" }, s);
      t.textContent = fmtShort(gv);
    }
    opts.labels.forEach(function (lb, i) {
      var acc = 0, x = padL + i * bw + bw * 0.14, w2 = Math.max(3, bw * 0.72);
      opts.series.forEach(function (sr) {
        var v = Math.max(0, sr.values[i] || 0);
        if (v <= 0) return;
        var rect = n("rect", { x: x, y: Y(acc + v), width: w2, height: Math.max(0.5, Y(acc) - Y(acc + v)), fill: sr.color, opacity: 0.9 }, s);
        var ti = n("title", {}, rect);
        ti.textContent = lb + " · " + sr.name + ": " + U.eur(v) + " / Mon";
        acc += v;
      });
      var step = Math.max(1, Math.ceil(n0 / 9));
      if (i % step === 0 || i === n0 - 1) {
        var t = n("text", { x: x + w2 / 2, y: H - 8, class: "axis", "text-anchor": "middle" }, s);
        t.textContent = lb;
      }
    });
    return s;
  }

  /* Fortschrittsbalken */
  function progress(value, target, color) {
    var pctv = target > 0 ? Math.max(0, Math.min(1, value / target)) : 0;
    var wrap = U.el("div", { class: "progress" },
      U.el("div", { class: "progress-fill", style: "width:" + (pctv * 100).toFixed(1) + "%;background:" + (color || "var(--accent)") }));
    wrap.title = U.eur(value) + " von " + U.eur(target) + " (" + Math.round(pctv * 100) + " %)";
    return wrap;
  }

  return { line: line, bars: bars, multiLine: multiLine, stackedBars: stackedBars, donut: donut, progress: progress };
})();
