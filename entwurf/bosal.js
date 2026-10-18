/* BoSal — Entwurf 2: Budgetmonat, Kassensturz, offene Posten, Ausgaben nach Anteil.
   Rechnet mit der echten Engine (logic.js) und den Daten aus seed.js. Alles nur im Speicher. */
(function () {
  "use strict";
  var L = window.Logic, D = window.DEFAULTS, S = window.SEED;
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var uidN = 0; function uid(p) { return p + "-" + (++uidN); }

  var now = new Date();
  var CUR = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  function dayIso(mk, d) { return mk + "-" + String(d).padStart(2, "0"); }

  /* ---------- Zustand ---------- */
  var state = {
    transactions: clone(S.transactions), expected: clone(S.expected),
    categories: clone(D.categories), months: {}, fi: clone(D.fi),
    active: CUR,                       // Budgetmonat, unabhängig vom Kalender
    startedEarly: null,                // Datum, falls früh gestartet
    konten: { giro: null, konto2: null, kk: null }, kontoAt: null, importAt: null, kontoEinzeln: false,
    transfers: [],                     // Geld zwischen Monaten verschieben: { von, nach, betrag, text }
    prevCtx: null,
    overrides: {},                     // { mk: { itemId: Betrag } } — abweichende Planwerte für einzelne Monate                     // für „Zurück in den Vormonat“
    offen: [],                         // offene Posten (wandern automatisch mit)
    carry: [],                         // feste Posten aus dem Vormonat, die noch nicht abgebucht waren
    frozen: {},                        // abgeschlossene Monate: { mk: Endstand }
    demoImported: false
  };
  L.enrichAll(state);
  // Abgeschlossene Monate (im echten Tool: dein letzter Übrig-Wert beim Abschluss)
  L.monthRange(state.transactions.reduce(function (m, t) { return t.effMonat < m ? t.effMonat : m; }, CUR), L.prevMonth(CUR))
    .forEach(function (mk) { state.frozen[mk] = L.monthCockpit(state, mk).prognoseSaldo; });
  // Beispiel-Einträge, damit der Entwurf nicht leer ist (erfundene Personen)
  var prev = L.prevMonth(CUR);
  state.offen = [
    { id: uid("o"), art: "forderung", text: "Konzertkarten (ihr Anteil)", betrag: 50, person: "Anna", kat: "freizeit", seit: prev },
    { id: uid("o"), art: "schuld", text: "Kino, hat Max bezahlt", betrag: 24, person: "Max", kat: "freizeit", seit: CUR },
    { id: uid("o"), art: "schwebend", text: "Zalando-Rechnung", betrag: 89.99, kat: "shopping", seit: CUR },
    { id: uid("o"), art: "ruecklage", text: "Urlaub", betrag: 200, kat: "sparen", seit: CUR },
    { id: uid("o"), art: "geplant", text: "Geschenk Mama", betrag: 40, richtung: -1, kat: "freizeit", seit: CUR }
  ];

  var ART = {
    forderung: { label: "Mir geschuldet", short: "schuldet mir", sign: 1, ico: "↙", hint: "Jemand gibt dir noch Geld zurück." },
    schuld: { label: "Ich schulde", short: "ich schulde", sign: -1, ico: "↗", hint: "Du gibst jemandem noch Geld." },
    schwebend: { label: "Schwebend", short: "noch nicht abgebucht", sign: -1, ico: "⏳", hint: "Schon gekauft, aber noch nicht vom Konto weg." },
    ruecklage: { label: "Rücklage", short: "geht aufs Sparkonto", sign: -1, ico: "🏦", hint: "Wird auf ein anderes Konto überwiesen." },
    geplant: { label: "Geplant", short: "einmalig", sign: 0, ico: "📌", hint: "Eine einmalige Ein- oder Ausgabe." }
  };
  function signOf(o) { return o.art === "geplant" ? (o.richtung || -1) : ART[o.art].sign; }
  function openList() { return state.offen.filter(function (o) { return !o.erledigt; }); }

  /* ---------- Rückgängig / Wiederholen: Schnappschuss vor jeder Änderung ---------- */
  var hist = { past: [], future: [] };
  function mark(label) { hist.past.push({ label: label, snap: JSON.stringify(state) }); if (hist.past.length > 50) hist.past.shift(); hist.future = []; }
  function restore(json) { var o = JSON.parse(json); Object.keys(o).forEach(function (k) { state[k] = o[k]; }); }
  function undo() { var h = hist.past.pop(); if (!h) return; hist.future.push({ label: h.label, snap: JSON.stringify(state) }); restore(h.snap); toast("Rückgängig: " + h.label); }
  function redo() { var h = hist.future.pop(); if (!h) return; hist.past.push({ label: h.label, snap: JSON.stringify(state) }); restore(h.snap); toast("Wiederholt: " + h.label); }

  // Farbpalette und Hell/Dunkel sind getrennt: jede Palette funktioniert in beiden Modi
  var PALETTES = [["violett", "Violett", "#6A5AE0", "#EB4F78"], ["ozean", "Ozean", "#1E6FD9", "#18B6A6"], ["wald", "Wald", "#2F7D4F", "#A3B83A"], ["koralle", "Koralle", "#E2574C", "#F2A93B"], ["sand", "Sand", "#9A7652", "#D9A86C"],
    ["beere", "Beere", "#B0306A", "#7A3FD1"], ["mint", "Mint", "#13A58A", "#7DD3A8"], ["petrol", "Petrol", "#0E6E80", "#3AA0C8"], ["gold", "Gold", "#B8860B", "#E8A33A"], ["graphit", "Graphit", "#3F4656", "#8A93A6"]];
  var MODES = [["hell", "Hell"], ["dunkel", "Dunkel"], ["system", "Wie System"]];
  var ui = { palette: "violett", mode: "hell", custom: null, view: "monat", modal: null, repMonth: null, shareMode: true, sortOpen: false, skipped: {}, toast: null, addArt: "forderung", showDone: false };

  /* ---------- Hilfen ---------- */
  var fmt = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var fmt0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
  function eur(n) { return fmt.format(n) + " €"; }
  function eur0(n) { return fmt0.format(n) + " €"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var MON = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  var MONL = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  function mLabel(mk, long) { var p = mk.split("-"); return (long ? MONL : MON)[+p[1] - 1] + " " + (long ? p[0] : p[0].slice(2)); }
  function mName(mk) { return MONL[+mk.split("-")[1] - 1]; }
  function dLabel(iso) { var p = iso.split("-"); return p[2] + "." + p[1] + "."; }
  function tLabel(ts) { var d = new Date(ts); return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + ", " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }); }
  function cat(id) { return state.categories.find(function (c) { return c.id === id; }) || { id: id, name: id === "sparen" ? "Sparen" : "Sonstiges", farbe: "#9aa0b8" }; }
  function money(n, cls) { n = Math.round(n * 100) / 100 || 0; return '<span class="num ' + (cls != null ? cls : (n < 0 ? "neg" : n > 0 ? "pos" : "")) + '">' + eur(n) + "</span>"; }
  function btn(label, act, extra, kind) { return '<button class="btn ' + (kind || "") + '" data-act="' + act + '"' + (extra || "") + ">" + label + "</button>"; }
  function parseNum(s) { s = String(s || "").trim(); if (!s) return NaN; if (s.indexOf(",") !== -1 || /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); return parseFloat(s); }
  function isKK(t) { return /kreditkartenabrechnung/i.test((t.zweck || "") + " " + (t.text || "")); }
  function isUnsorted(t) { return t.betrag < 0 && !t.match && t.kategorieId === "sys-ausgabe" && !t.settles && !isKK(t); }

  function sollOf(mk, item) { var o = state.overrides[mk]; return o && o[item.id] != null ? o[item.id] : item.betrag; }
  function adj(mk, rows) { return rows.map(function (r) { return { item: r.item, ist: r.ist, soll: sollOf(mk, r.item), std: r.item.betrag }; }); }

  /* ---------- Die Rechnung des Budgetmonats ---------- */
  function rechnung() {
    var mk = state.active, c = L.monthCockpit(state, mk), k = state.konten;
    var kontenSum = (k.giro || 0) + (k.konto2 || 0) + (k.kk || 0);
    c.rows = adj(mk, c.rows);
    var einOffen = c.rows.filter(function (r) { return r.item.typ === "Einnahme" && rest(r) > 0.005; });
    var fixOffen = c.rows.filter(function (r) { return r.item.typ !== "Einnahme" && rest(r) < -0.005; });
    var carry = state.carry.map(function (cr) {
      var pc = L.monthCockpit(state, cr.monat), row = adj(cr.monat, pc.rows).find(function (r) { return r.item.id === cr.itemId; });
      return row ? { row: row, monat: cr.monat, rest: rest(row) } : null;
    }).filter(function (x) { return x && Math.abs(x.rest) > 0.005; });
    var groups = {};
    Object.keys(ART).forEach(function (a) { groups[a] = openList().filter(function (o) { return o.art === a && (!o.monat || o.monat <= mk); }); });
    var tr = transfersFor(mk);
    function sumG(a) { return groups[a].reduce(function (s, o) { return s + signOf(o) * o.betrag; }, 0); }
    var parts = {
      konten: kontenSum, ein: sum(einOffen), fix: sum(fixOffen),
      carry: carry.reduce(function (s, x) { return s + x.rest; }, 0),
      uebertrag: tr.sum
    };
    Object.keys(ART).forEach(function (a) { parts[a] = sumG(a); });
    var total = Object.keys(parts).reduce(function (s, p) { return s + parts[p]; }, 0);
    return { mk: mk, c: c, parts: parts, total: Math.round(total * 100) / 100, einOffen: einOffen, fixOffen: fixOffen, carry: carry, groups: groups, tr: tr, hasKonten: k.giro != null };
    function sum(rows) { return rows.reduce(function (s, r) { return s + rest(r); }, 0); }
  }
  function transfersFor(mk) {
    var list = state.transfers.filter(function (t) { return t.von === mk || t.nach === mk; }).map(function (t) { return { t: t, v: t.nach === mk ? t.betrag : -t.betrag }; });
    return { list: list, sum: list.reduce(function (s, x) { return s + x.v; }, 0) };
  }
  // Vorschau künftiger Monate: Plan der festen Posten ± Verschobenes ± für diesen Monat Geplantes
  function vorschau(mk) {
    var plan = state.expected.filter(function (i) { return i.aktiv; }).reduce(function (s, i) { return s + sollOf(mk, i); }, 0);
    var gepl = openList().filter(function (o) { return o.art === "geplant" && o.monat === mk; });
    var gv = gepl.reduce(function (s, o) { return s + signOf(o) * o.betrag; }, 0), tr = transfersFor(mk);
    return { plan: plan, geplant: gepl, gv: gv, tr: tr, total: Math.round((plan + gv + tr.sum) * 100) / 100 };
  }
  function rest(r) { var x = r.soll - r.ist; return r.soll >= 0 ? Math.max(0, x) : Math.min(0, x); }

  // Passen neue Buchungen zu offenen Posten? (Betrag gleich, Richtung gleich; Name passt = sicherer)
  function vorschlaege() {
    var used = {};
    return openList().map(function (o) {
      var s = signOf(o);
      var cands = state.transactions.filter(function (t) {
        return t.demo && !t.settles && !used[t.id] && Math.abs(Math.abs(t.betrag) - o.betrag) < 0.01 && (t.betrag > 0 ? 1 : -1) === s;
      });
      if (!cands.length) return null;
      var hay = function (t) { return ((t.empfaenger || "") + " " + (t.zweck || "")).toLowerCase(); };
      var best = cands.find(function (t) { return o.person && hay(t).indexOf(o.person.toLowerCase()) !== -1; }) ||
        cands.find(function (t) { return o.text.toLowerCase().split(/\W+/).some(function (w) { return w.length > 3 && hay(t).indexOf(w) !== -1; }); }) || cands[0];
      used[best.id] = true;
      return { o: o, t: best };
    }).filter(Boolean);
  }

  /* ---------- Beispiel-Import (nur im Entwurf) ---------- */
  function demoImport() {
    if (state.demoImported) return 0;
    var mk = state.active, pm = L.prevMonth(mk), add = [];
    function tx(datum, empf, zweck, betrag) { add.push({ id: uid("tx"), datum: datum, text: "", zweck: zweck, empfaenger: empf, betrag: betrag, info: "", manuelleKat: false, demo: true }); }
    var day = Math.min(now.getDate() - 1, 15) || 1;
    state.expected.forEach(function (it, i) {
      if (!it.aktiv || !it.suchbegriff) return;
      if (it.typ === "Einnahme" && it.stichtag > 0) tx(dayIso(pm, Math.max(it.stichtag, 26)), it.suchbegriff.toUpperCase(), it.notiz || it.beschreibung, it.betrag);
      else if (i % 4 !== 3 && it.typ !== "Schulden") tx(dayIso(mk, 1 + (i % day)), it.suchbegriff.toUpperCase(), it.notiz || it.beschreibung, it.betrag);
    });
    tx(dayIso(mk, 3), "REWE Markt", "Lastschrift", -46.20);
    tx(dayIso(mk, 6), "Pizzeria Da Mario", "Kartenzahlung", -84.00);
    tx(dayIso(mk, 7), "Lieferando", "Bestellung", -31.50);
    tx(dayIso(mk, 8), "Anna Beispiel", "Konzertkarten zurueck", 50.00);
    tx(dayIso(mk, 9), "Zalando Payments", "Rechnung 4711", -89.99);
    tx(dayIso(mk, 10), "Eigenes Tagesgeld", "Sparen Urlaub", -200.00);
    tx(dayIso(mk, 12), "Sparkasse", "KREDITKARTENABRECHNUNG 09.26", -412.37);
    add.forEach(function (t) { state.transactions.push(t); });
    L.enrichAll(state);
    state.demoImported = true;
    return add.length;
  }

  /* ---------- Ausgaben: wofür ging mein Geld (mein Anteil) ---------- */
  function report(mk, share) {
    var txs = state.transactions.filter(function (t) { return t.effMonat === mk; });
    var rows = {}, info = { kk: 0, settled: 0, gespart: 0, geteilt: 0, fremd: 0 };
    function addC(k, v) { rows[k] = (rows[k] || 0) + v; }
    txs.forEach(function (t) {
      if (t.betrag >= 0 || (t.match && !ui.inclFix)) return;            // Alltag; feste Posten nur auf Wunsch
      var so = t.settles && state.offen.find(function (o) { return o.id === t.settles; });
      if (so && (so.art === "forderung" || so.art === "schuld")) { info.settled++; return; } // Rückzahlung, keine Ausgabe
      if (so && so.art === "ruecklage") { info.gespart += -t.betrag; return; }
      if (isKK(t)) { info.kk += -t.betrag; return; }
      var v = t.betrag;
      if (share) state.offen.forEach(function (o) { if (o.art === "forderung" && o.txId === t.id) { v += o.betrag; info.geteilt += o.betrag; } });
      addC(t.kategorieId, v);
    });
    if (share) state.offen.forEach(function (o) { if (o.art === "schuld" && o.seit === mk) { addC(o.kat || "sys-ausgabe", -o.betrag); info.fremd += o.betrag; } });
    var list = Object.keys(rows).map(function (k) { return { kat: k, betrag: Math.round(rows[k] * 100) / 100 }; })
      .filter(function (r) { return r.betrag < -0.005; }).sort(function (a, b) { return a.betrag - b.betrag; });
    return { list: list, total: list.reduce(function (s, r) { return s + r.betrag; }, 0), info: info, txs: txs };
  }

  /* ================= Ansicht: Monat ================= */
  function viewVorschau(mk) {
    var v = vorschau(mk), rows = state.expected.filter(function (i) { return i.aktiv; });
    var ein = rows.filter(function (i) { return i.typ === "Einnahme"; }), aus = rows.filter(function (i) { return i.typ !== "Einnahme"; });
    function sumRows(list) { return list.reduce(function (s, i) { return s + sollOf(mk, i); }, 0); }
    function edRows(list) {
      return '<ul class="ed-list">' + list.map(function (i) {
        var val = sollOf(mk, i), changed = val !== i.betrag;
        return '<li class="' + (changed ? "changed" : "") + (val === 0 ? " off" : "") + '"><span class="ed-n">' + esc(i.beschreibung) + (changed ? ' <em class="muted">sonst ' + eur(i.betrag) + "</em>" : "") + "</span>" +
          '<input class="in-num" inputmode="decimal" data-act="ovr" data-m="' + mk + '" data-id="' + i.id + '" value="' + fmt.format(val) + '">' +
          (changed ? btn("↺", "ovrReset", ' data-m="' + mk + '" data-id="' + i.id + '" title="Auf Standard zurücksetzen"', "btn-sm btn-ghost") : btn("entfällt", "ovrZero", ' data-m="' + mk + '" data-id="' + i.id + '"', "btn-sm btn-ghost")) + "</li>";
      }).join("") + "</ul>";
    }
    function sec(key, label, val, sub, detail) {
      return '<details class="wf-row" ' + (ui["open_v" + key] !== false ? "open" : "") + ' data-key="v' + key + '"><summary><span class="wf-l"><span class="wf-t">' + label + '</span><span class="wf-s">' + sub + '</span></span><span class="wf-v">' + money(val) + '</span></summary><div class="wf-d">' + detail + "</div></details>";
    }
    var gepl = '<ul class="mini-list">' + v.geplant.map(function (o) { return "<li><span>" + esc(o.text) + "</span><span>" + money(signOf(o) * o.betrag) + " " + btn("✕", "del", ' data-o="' + o.id + '"', "btn-sm btn-ghost") + "</span></li>"; }).join("") + "</ul>" +
      '<div class="form tf"><label class="grow"><span>Wofür</span><input id="pm-text" placeholder="z. B. Weihnachtsgeschenke"></label><label><span>Betrag</span><input id="pm-betrag" class="in-num" inputmode="decimal" placeholder="0,00"></label>' +
      '<label><span>Richtung</span><select id="pm-richtung"><option value="-1">Ausgabe</option><option value="1">Einnahme</option></select></label>' + btn("Hinzufügen", "addPlanM", ' data-m="' + mk + '"', "btn-primary") + "</div>";
    var trl = (v.tr.list.length ? '<ul class="mini-list">' + v.tr.list.map(function (x) { return "<li><span>" + esc(x.t.text || "Verschiebung") + ' <em class="muted">' + (x.v > 0 ? "aus " + mName(x.t.von) : "nach " + mName(x.t.nach)) + "</em></span><span>" + money(x.v) + " " + btn("✕", "delTransfer", ' data-id="' + x.t.id + '"', "btn-sm btn-ghost") + "</span></li>"; }).join("") + "</ul>" : "") + transferForm(mk);
    var nOv = state.overrides[mk] ? Object.keys(state.overrides[mk]).length : 0;
    return '<div class="mhead"><div><h1 class="page-t">' + mLabel(mk, true) + '</h1><div class="muted">Vorschau · voraussichtlich</div></div><div class="mh-act">' + btn("← Zurück zu " + mName(state.active), "openMonth", ' data-month=""', "") + "</div></div>" +
      '<div class="grid-m"><div class="col"><div class="card hero hero-plan"><div class="hero-label">Voraussichtlich übrig im ' + mName(mk) + '</div><div class="hero-num num">' + eur(v.total) + '</div><div class="hero-sub">Plan, noch ohne Kontostände. Alles, was du hier änderst, gilt nur für ' + mName(mk) + ".</div></div>" +
      '<div class="card wf"><h2>Planen</h2>' +
      sec("ein", "Kommt rein", sumRows(ein), ein.length + " feste Einnahmen", edRows(ein)) +
      sec("aus", "Geht ab", sumRows(aus), aus.length + " Fixkosten und Raten" + (nOv ? " · " + nOv + " angepasst" : ""), edRows(aus)) +
      sec("gepl", "Geplant für " + mName(mk), v.gv, v.geplant.length + " Einträge", gepl) +
      sec("tr", "Zwischen Monaten verschoben", v.tr.sum, v.tr.list.length + " Verschiebung(en)", trl) +
      '<div class="wf-total"><span>Voraussichtlich übrig</span>' + money(v.total) + "</div></div></div>" +
      '<div class="col"><div class="card"><h2>So funktioniert die Vorschau</h2><ul class="startlist small"><li>Feste Posten kannst du nur für diesen Monat anders planen, z. B. Weihnachtsgeld oder eine Strom-Nachzahlung. Der Standard bleibt unverändert.</li><li>„entfällt“ setzt einen Posten für diesen Monat auf 0.</li><li>Wird der Monat aktiv, rechnet der Kassensturz mit genau diesen Planwerten weiter.</li></ul></div></div></div>';
  }

  function viewMonat() {
    if (ui.month && ui.month > state.active) return viewVorschau(ui.month);
    var R = rechnung(), mk = R.mk, nx = L.nextMonth(mk), p = R.parts;
    var sync = syncState();
    var vs = vorschlaege();

    var head = '<div class="mhead"><div><h1 class="page-t">' + mLabel(mk, true) + '</h1><div class="muted">Budgetmonat' +
      (state.startedEarly ? " · früh gestartet am " + state.startedEarly : " · läuft") + "</div></div>" +
      '<div class="mh-act">' + (state.prevCtx ? btn("← Zurück zu " + mName(state.prevCtx.mk), "reopenAsk", "", "btn-ghost") : "") + btn(mName(nx) + " starten →", "startNext", "", "") + "</div></div>";

    var banner = sync.ok ? "" :
      '<div class="fresh"><span class="fresh-dot"></span><div><b>' + esc(sync.title) + "</b> " + esc(sync.text) + "</div>" +
      (sync.ack ? btn("Passt, nichts Neues", "ack", "", "btn-ghost") + btn("Import nachholen", "kassensturz", "", "btn-primary") : btn("Kassensturz machen", "kassensturz", "", "btn-primary")) + "</div>";

    function line(key, label, val, sub, detail, link) {
      return '<details class="wf-row' + (Math.abs(val) < 0.005 ? " zero" : "") + '"' + (ui["open_" + key] ? " open" : "") + ' data-key="' + key + '"><summary>' +
        '<span class="wf-l"><span class="wf-t">' + label + '</span><span class="wf-s">' + sub + "</span></span>" +
        '<span class="wf-v">' + money(val, val > 0 ? "pos" : val < 0 ? "neg" : "") + "</span></summary>" +
        '<div class="wf-d">' + (detail || '<p class="muted">Nichts offen.</p>') + (link || "") + "</div></details>";
    }
    function itemList(rows, monat) {
      return rows.length ? '<ul class="mini-list">' + rows.map(function (r) {
        var rr = r.row || r;
        return "<li><span>" + esc(rr.item.beschreibung) + (monat || r.monat ? ' <em class="muted">aus ' + mName(r.monat || monat) + "</em>" : "") + "</span>" + money(r.rest != null ? r.rest : rest(rr)) + "</li>";
      }).join("") + "</ul>" : "";
    }
    function postenList(a) {
      var g = R.groups[a];
      return g.length ? '<ul class="mini-list">' + g.map(function (o) {
        return "<li><span>" + esc(o.person ? o.person + " · " : "") + esc(o.text) + (o.seit !== mk ? ' <em class="muted">seit ' + mName(o.seit) + "</em>" : "") + "</span>" + money(signOf(o) * o.betrag) + "</li>";
      }).join("") + "</ul>" : "";
    }
    var k = state.konten;
    var kontenDetail = '<div class="konten">' +
      kontoField("giro", "Girokonto", k.giro) + kontoField("konto2", "2. Konto", k.konto2) + kontoField("kk", "Kreditkarte (offen, negativ)", k.kk) +
      "</div>" + (state.kontoAt ? '<p class="muted small">Stand: ' + tLabel(state.kontoAt) + "</p>" : "");
    var openLink = btn("Offene Posten bearbeiten →", "go", ' data-view="offen"', "btn-link");

    var hero = '<div class="card hero"><div class="hero-label">Übrig bis Ende ' + mName(mk) + "</div>" +
      '<div class="hero-num num">' + (R.hasKonten ? eur(R.total) : "?") + "</div>" +
      '<div class="hero-sub">' + (R.hasKonten ? (sync.ok ? "Kontostände und Import passen zusammen." : "Achtung: " + esc(sync.title)) : "Trag deine Kontostände ein, dann rechnet BoSal.") + "</div></div>";

    var wf = '<div class="card wf"><h2>So setzt sich das zusammen</h2>' +
      line("konten", "Geld auf deinen Konten", p.konten, R.hasKonten ? "Giro, 2. Konto, Kreditkarte" : "noch nicht eingetragen", kontenDetail) +
      line("ein", "Kommt noch rein", p.ein, R.einOffen.length + " feste Einnahmen", itemList(R.einOffen)) +
      line("fix", "Geht noch ab", p.fix, R.fixOffen.length + " Fixkosten und Raten noch nicht abgebucht", itemList(R.fixOffen)) +
      (R.carry.length ? line("carry", "Aus " + mName(L.prevMonth(mk)) + " noch offen", p.carry, "fällt weg, sobald die Abbuchung importiert ist", itemList(R.carry)) : "") +
      line("forderung", "Mir geschuldet", p.forderung, R.groups.forderung.length + " offen", postenList("forderung"), openLink) +
      line("schuld", "Ich schulde", p.schuld, R.groups.schuld.length + " offen", postenList("schuld"), openLink) +
      line("schwebend", "Schwebend", p.schwebend, "gekauft, noch nicht abgebucht", postenList("schwebend"), openLink) +
      line("ruecklage", "Rücklagen", p.ruecklage, "geht noch aufs Sparkonto", postenList("ruecklage"), openLink) +
      line("geplant", "Geplant", p.geplant, "einmalig", postenList("geplant"), openLink) +
      line("uebertrag", "Zwischen Monaten verschoben", p.uebertrag, R.tr.list.length ? R.tr.list.length + " Verschiebung(en)" : "z. B. Geld aus " + mName(nx) + " vorziehen",
        (R.tr.list.length ? '<ul class="mini-list">' + R.tr.list.map(function (x) { return "<li><span>" + esc(x.t.text || "Verschiebung") + ' <em class="muted">' + (x.v > 0 ? "aus " + mName(x.t.von) : "nach " + mName(x.t.nach)) + "</em></span><span>" + money(x.v) + " " + btn("✕", "delTransfer", ' data-id="' + x.t.id + '"', "btn-sm btn-ghost") + "</span></li>"; }).join("") + "</ul>" : "") +
        transferForm(mk)) +
      '<div class="wf-total"><span>Übrig</span>' + (R.hasKonten ? money(R.total) : '<span class="muted">?</span>') + "</div></div>";

    var vsCard = vs.length ? '<div class="card vs"><h2>Erledigt durch den Import?</h2><p class="muted small">Diese Buchungen passen zu offenen Posten.</p><ul class="vs-list">' + vs.map(function (v) {
      return '<li><div class="vs-t"><b>' + esc(v.o.person ? v.o.person + ": " : "") + esc(v.o.text) + '</b><span class="muted small">' + dLabel(v.t.datum) + " · " + esc(v.t.empfaenger) + " · " + eur(v.t.betrag) + "</span></div>" +
        btn("Ja, erledigt", "settle", ' data-o="' + v.o.id + '" data-t="' + v.t.id + '"', "btn-primary btn-sm") + "</li>";
    }).join("") + "</ul></div>" : "";

    var fest = R.c.rows.slice().sort(function (a, b) { return Math.abs(b.soll) - Math.abs(a.soll); });
    var festCard = '<div class="card"><h2>Feste Posten</h2><ul class="fest">' + fest.map(function (r) {
      var done = Math.abs(rest(r)) < 0.005;
      return '<li class="' + (done ? "done" : "") + '"><span class="ck">' + (done ? "✓" : "") + '</span><span class="fn">' + esc(r.item.beschreibung) + "</span>" + money(r.soll, "") + "</li>";
    }).join("") + "</ul></div>";

    var next = [], m2 = mk; for (var i = 0; i < 4; i++) { m2 = L.nextMonth(m2); next.push(m2); }
    var pastCard = '<div class="card"><h2>Kommende Monate</h2><ul class="mini-list">' + next.map(function (m) {
      var v = vorschau(m), extra = [];
      if (v.geplant.length) extra.push(v.geplant.length + " geplant");
      if (v.tr.list.length) extra.push((v.tr.sum < 0 ? "−" : "+") + eur(Math.abs(v.tr.sum)) + " verschoben");
      var ov = state.overrides[m] && Object.keys(state.overrides[m]).length;
      if (ov) extra.push(ov + " angepasst");
      return '<li><button class="linkrow" data-act="openMonth" data-month="' + m + '"><b>' + mLabel(m, true) + "</b>" + (extra.length ? ' <em class="muted">' + extra.join(" · ") + "</em>" : "") + "</button>" + money(v.total) + "</li>";
    }).join("") + '</ul><p class="muted small">Grobe Vorschau: Plan-Einnahmen minus feste Posten, plus was du für den Monat geplant oder verschoben hast. Antippen zum Planen. Der echte Wert entsteht erst mit dem Kassensturz.</p></div>';

    return head + banner + '<div class="grid-m"><div class="col">' + hero + wf + '</div><div class="col">' + vsCard + festCard + pastCard + "</div></div>";
  }
  function transferForm(mk) {
    var opts = [], m = L.prevMonth(mk); for (var i = 0; i < 6; i++) { opts.push(m); m = L.nextMonth(m); }
    function sel(id, def) { return '<select id="' + id + '">' + opts.map(function (x) { return '<option value="' + x + '"' + (x === def ? " selected" : "") + ">" + mLabel(x, true) + "</option>"; }).join("") + "</select>"; }
    return '<div class="form tf"><label><span>Von</span>' + sel("t-von", L.nextMonth(mk)) + '</label><label><span>Nach</span>' + sel("t-nach", mk) + '</label>' +
      '<label><span>Betrag</span><input id="t-betrag" class="in-num" inputmode="decimal" placeholder="0,00"></label><label class="grow"><span>Notiz</span><input id="t-text" placeholder="z. B. Vorgriff Gehalt"></label>' +
      btn("Verschieben", "addTransfer", "", "btn-primary") + '</div><p class="muted small">Im Zielmonat kommt der Betrag dazu, im Herkunftsmonat wird er abgezogen.</p>';
  }
  function kontoField(k, label, v) {
    return '<label class="kf"><span>' + label + '</span><input class="in-num" inputmode="decimal" data-act="konto" data-k="' + k + '" value="' + (v == null ? "" : fmt.format(v)) + '" placeholder="eintragen"></label>';
  }
  function syncState() {
    if (state.konten.giro == null && !state.importAt) return { ok: false, title: "Noch kein Kassensturz in diesem Monat.", text: "Importiere den Kontoauszug und trag danach deine Kontostände ein, beides zusammen." };
    if (!state.importAt) return { ok: false, title: "Kontostand ohne frischen Import.", text: "Fixkosten, die schon abgebucht sind, würden sonst doppelt abgezogen." };
    if (state.konten.giro == null) return { ok: false, title: "Import ist da, Kontostände fehlen.", text: "Trag jetzt deine Kontostände ein." };
    if (state.kontoEinzeln) return { ok: false, title: "Kontostand ohne neuen Import geändert.", text: "Sind seit dem Import (" + tLabel(state.importAt) + ") neue Buchungen dazugekommen? Dann würden sie doppelt zählen.", ack: true };
    return { ok: true };
  }

  /* ================= Ansicht: Offen ================= */
  function viewOffen() {
    var persons = {};
    openList().forEach(function (o) { if (o.person) persons[o.person] = (persons[o.person] || 0) + signOf(o) * o.betrag; });
    var pCard = Object.keys(persons).length ? '<div class="card"><h2>Personen</h2><ul class="mini-list">' + Object.keys(persons).map(function (n) {
      var v = persons[n];
      return "<li><span><b>" + esc(n) + "</b> " + (v > 0 ? "schuldet dir" : "bekommt von dir") + "</span>" + money(v) + "</li>";
    }).join("") + "</ul></div>" : "";

    var a = ui.addArt, A = ART[a];
    var cats = state.categories.filter(function (c) { return c.typ === "ausgabe" && !c.system; });
    var form = '<div class="card add"><h2>Neu eintragen</h2><div class="seg">' + Object.keys(ART).map(function (x) {
      return '<button class="seg-b' + (x === a ? " on" : "") + '" data-act="addArt" data-a="' + x + '">' + ART[x].ico + " " + ART[x].label + "</button>";
    }).join("") + '</div><p class="muted small">' + A.hint + "</p>" +
      '<div class="form">' +
      ((a === "forderung" || a === "schuld") ? '<label><span>Person</span><input id="f-person" placeholder="z. B. Anna"></label>' : "") +
      '<label class="grow"><span>Wofür</span><input id="f-text" placeholder="' + (a === "ruecklage" ? "z. B. Urlaub" : "z. B. Essen gehen") + '"></label>' +
      '<label><span>Betrag</span><input id="f-betrag" class="in-num" inputmode="decimal" placeholder="0,00"></label>' +
      (a === "geplant" ? '<label><span>Richtung</span><select id="f-richtung"><option value="-1">Ausgabe</option><option value="1">Einnahme</option></select></label>' +
        '<label><span>Für Monat</span><select id="f-monat">' + [0, 1, 2, 3, 4, 5].map(function (i) { var m = state.active; for (var j = 0; j < i; j++) m = L.nextMonth(m); return '<option value="' + m + '">' + mLabel(m, true) + "</option>"; }).join("") + "</select></label>" : "") +
      (a !== "forderung" && a !== "ruecklage" ? '<label><span>Kategorie</span><select id="f-kat">' + cats.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + "</option>"; }).join("") + "</select></label>" : "") +
      btn("Hinzufügen", "add", "", "btn-primary") + "</div></div>";

    var groups = Object.keys(ART).map(function (x) {
      var g = openList().filter(function (o) { return o.art === x; });
      if (!g.length) return "";
      return '<div class="card"><h2>' + ART[x].ico + " " + ART[x].label + ' <span class="cnt">' + g.length + '</span></h2><ul class="olist">' + g.map(oRow).join("") + "</ul></div>";
    }).join("");
    var done = state.offen.filter(function (o) { return o.erledigt; });
    var doneCard = done.length ? '<div class="card"><button class="btn-link" data-act="toggleDone">' + (ui.showDone ? "▾" : "▸") + " Erledigt (" + done.length + ")</button>" +
      (ui.showDone ? '<ul class="olist done">' + done.map(function (o) { return "<li><span>" + esc((o.person ? o.person + " · " : "") + o.text) + '</span><span class="muted small">' + esc(o.erledigtWie || "") + "</span>" + money(signOf(o) * o.betrag, "") + btn("↶ wieder öffnen", "reopenItem", ' data-o="' + o.id + '"', "btn-sm") + "</li>"; }).join("") + "</ul>" : "") + "</div>" : "";
    return '<h1 class="page-t">Offene Posten</h1><p class="lead muted">Alles, was noch nicht erledigt ist. Es wandert automatisch in den nächsten Monat mit, bis du es abhakst oder der Import es erledigt.</p>' +
      '<div class="grid-o"><div class="col">' + form + groups + doneCard + '</div><div class="col">' + pCard + "</div></div>";
  }
  function oRow(o) {
    var lnk = o.txId ? state.transactions.find(function (t) { return t.id === o.txId; }) : null;
    return '<li><div class="o-main"><span class="o-t">' + esc(o.person ? o.person + " · " : "") + esc(o.text) + '</span><span class="muted small">' +
      (o.monat && o.monat > state.active ? "für " + mLabel(o.monat, true) + " · " : o.seit !== state.active ? "seit " + mLabel(o.seit, true) + " · " : "") + (lnk ? "aus Buchung " + esc(lnk.empfaenger.split("/")[0]) + " · " : "") + ART[o.art].short + "</span></div>" +
      money(signOf(o) * o.betrag) + '<span class="o-act">' + btn("✓", "done", ' data-o="' + o.id + '" title="Erledigt"', "btn-sm") + btn("✕", "del", ' data-o="' + o.id + '" title="Löschen"', "btn-sm btn-ghost") + "</span></li>";
  }

  /* ================= Ansicht: Ausgaben ================= */
  function viewAusgaben() {
    if (ui.sortOpen) return viewSort();
    var months = Object.keys(state.frozen).concat([state.active]).filter(function (m) { return state.transactions.some(function (t) { return t.effMonat === m; }); });
    if (!ui.repMonth || months.indexOf(ui.repMonth) === -1) ui.repMonth = months[months.length - 1];
    var mk = ui.repMonth, R = report(mk, ui.shareMode), Rf = report(mk, false);
    var max = R.list.reduce(function (m, r) { return Math.max(m, -r.betrag); }, 1);
    var un = state.transactions.filter(function (t) { return t.effMonat === mk && isUnsorted(t); }).length;
    var chips = '<div class="mstrip">' + months.map(function (m) {
      return '<button class="mchip' + (m === mk ? " on" : "") + '" data-act="repMonth" data-month="' + m + '"><span class="mchip-m">' + mLabel(m) + "</span></button>";
    }).join("") + "</div>";
    var fixTog = '<label class="chk"><input type="checkbox" data-act="inclFix"' + (ui.inclFix ? " checked" : "") + "> feste Posten mitzählen</label>";
    var tog = '<div class="seg seg-sm"><button class="seg-b' + (ui.shareMode ? " on" : "") + '" data-act="share" data-v="1">Mein Anteil</button><button class="seg-b' + (!ui.shareMode ? " on" : "") + '" data-act="share" data-v="0">Alles voll</button></div>';
    var bars = '<ul class="bars">' + R.list.map(function (r) {
      var c = cat(r.kat), u = r.kat === "sys-ausgabe";
      return '<li class="bar-row' + (u ? " bar-unsorted" : "") + '"><span class="bar-name">' + (u ? "Unsortiert" : esc(c.name)) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + (-r.betrag / max * 100).toFixed(1) + "%;--c:" + (u ? "var(--warn)" : c.farbe) + '"></span></span><span class="bar-val num">' + eur(r.betrag) + "</span></li>";
    }).join("") + "</ul>";
    var notes = [];
    if (ui.shareMode && R.info.geteilt) notes.push("−" + eur(R.info.geteilt) + " Anteile anderer herausgerechnet");
    if (ui.shareMode && R.info.fremd) notes.push("+" + eur(R.info.fremd) + " von anderen für dich bezahlt");
    if (R.info.settled) notes.push(R.info.settled + " Rückzahlung(en) nicht als Ausgabe gezählt");
    if (R.info.gespart) notes.push(eur(R.info.gespart) + " gespart (Rücklage), nicht als Ausgabe gezählt");
    if (R.info.kk) notes.push("Kreditkarten-Abrechnung " + eur(-R.info.kk) + " ausgeblendet · Details kommen später aus der Kreditkarten-CSV");
    var sumCard = '<div class="card"><div class="card-head"><h2>Wofür ging dein Geld im ' + mName(mk) + "?</h2>" + tog + "</div>" +
      '<div class="rep-total"><span class="num">' + eur(R.total) + '</span><span class="muted small">' + (ui.shareMode ? "dein Anteil · voll wären es " + eur(Rf.total) : "alle Buchungen voll gezählt") + "</span></div>" +
      fixTog + bars + (notes.length ? '<ul class="notes">' + notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>" : "") +
      (un ? '<div class="sortcta">' + un + " Buchungen ohne Kategorie " + btn("Jetzt sortieren →", "sortOpen", "", "btn-primary btn-sm") + "</div>" : "") + "</div>";
    var txs = R.txs.filter(function (t) { return t.betrag < 0; }).sort(function (a, b) { return a.datum < b.datum ? 1 : -1; });
    var txCard = '<div class="card"><h2>Ausgaben-Buchungen <span class="cnt">' + txs.length + '</span></h2><p class="muted small">Mit anderen bezahlt? Auf „Teilen“ tippen, dann zählt nur dein Anteil und die Person steht unter „Mir geschuldet“.</p><ul class="txl">' +
      txs.slice(0, 40).map(function (t) {
        var c = cat(t.kategorieId), shared = state.offen.filter(function (o) { return o.art === "forderung" && o.txId === t.id; });
        var so = t.settles && state.offen.find(function (o) { return o.id === t.settles; });
        var it = t.match && state.expected.find(function (i) { return i.id === t.itemId; });
        var tagTxt = isKK(t) ? "Kreditkarte" : so ? (so.art === "ruecklage" ? "Rücklage" : "erledigt: " + so.text) : isUnsorted(t) ? "Unsortiert" : c.name + (it ? " · fester Posten „" + it.beschreibung + "“" : "");
        return '<li class="tx"><span class="tx-d">' + dLabel(t.datum) + '</span><span class="tx-main"><span class="tx-e">' + esc((t.empfaenger || "").split("/")[0]) + '</span><span class="tx-k"><i style="background:' + (isUnsorted(t) ? "var(--warn)" : c.farbe) + '"></i>' + esc(tagTxt) +
          (shared.length ? " · geteilt mit " + esc(shared.map(function (o) { return o.person; }).join(", ")) + ", dein Teil " + eur(t.betrag + shared.reduce(function (s, o) { return s + o.betrag; }, 0)) : "") + "</span></span>" +
          money(t.betrag) + (isKK(t) || so ? "<span></span>" : btn("Teilen", "teilen", ' data-t="' + t.id + '"', "btn-sm")) + "</li>";
      }).join("") + "</ul></div>";
    var past = Object.keys(state.frozen).sort().reverse();
    var hist2 = '<div class="card"><h2>Abgeschlossene Monate</h2><ul class="mini-list">' + past.map(function (m) {
      return '<li><button class="linkrow" data-act="repMonth" data-month="' + m + '">' + mLabel(m, true) + "</button>" + money(state.frozen[m]) + "</li>";
    }).join("") + '</ul><p class="muted small">Endstand beim Abschluss.</p></div>';
    return '<h1 class="page-t">Ausgaben</h1>' + chips + '<div class="grid-a">' + sumCard + '<div class="col">' + txCard + hist2 + "</div></div>";
  }

  function viewSort() {
    var list = state.transactions.filter(function (t) { return t.effMonat === ui.repMonth && isUnsorted(t) && !ui.skipped[t.id]; }).sort(function (a, b) { return a.betrag - b.betrag; });
    var top = '<div class="mhead"><h1 class="page-t">Sortieren · ' + mLabel(ui.repMonth, true) + "</h1>" + btn("← Zurück", "sortClose", "", "") + "</div>";
    if (!list.length) return top + '<div class="card"><h2>Alles sortiert 🎉</h2></div>';
    var t = list[0], kw = ((t.empfaenger || "").split(/[\/,]|\s{2,}/)[0] || "").trim().toLowerCase().slice(0, 28);
    var cats = state.categories.filter(function (c) { return c.typ === "ausgabe" && !c.system; });
    return top + '<div class="card sort-card"><div class="sc-meta"><span>' + dLabel(t.datum) + "</span><span>noch " + list.length + '</span></div><div class="sc-amt num neg">' + eur(t.betrag) + '</div><div class="sc-e">' + esc(t.empfaenger) + '</div><div class="sc-z">' + esc(t.zweck) + '</div><div class="sc-q">Wohin gehört das?</div><div class="chips">' +
      cats.map(function (c) { return '<button class="chip" data-act="sort" data-cat="' + c.id + '" data-t="' + t.id + '"><i style="background:' + c.farbe + '"></i>' + esc(c.name) + "</button>"; }).join("") +
      '</div><label class="always"><input type="checkbox" id="always" checked> <span>Immer so, wenn die Buchung enthält:</span> <input id="kw" class="in-kw" value="' + esc(kw) + '"></label><div class="sc-foot">' + btn("Überspringen", "skip", ' data-t="' + t.id + '"', "btn-ghost") + "</div></div>";
  }

  /* ================= Ansicht: Zukunft / Mehr ================= */
  function zctx() {
    return { state: state, L: L, eur: eur, eur0: eur0, money: money, btn: btn, esc: esc, fmt: fmt, parseNum: parseNum, mark: mark, toast: function (m) { ui.toast = m; setTimeout(function () { ui.toast = null; render(); }, 2600); },
      sollOf: sollOf, mLabel: mLabel,
      months: function () { var ms = Object.keys(state.frozen).sort(); ms.push(state.active); var m = state.active; for (var i = 0; i < 4; i++) { m = L.nextMonth(m); ms.push(m); } return ms.reverse(); } };
  }
  function viewZukunft() { return window.BoSalZukunft.render(zctx()); }
  function viewMehr() {
    var items = ["Kontoauszug importieren (Giro- und Kreditkarten-CSV)", "Feste Posten & Kategorien", "Hauskauf · Kinder", "Backup & Einstellungen"];
    return '<h1 class="page-t">Mehr</h1><div class="card" style="margin-bottom:var(--gap)">' + palettePicker() + '</div><div class="card"><ul class="mehr-list">' + items.map(function (i) { return '<li><button class="mehr-btn" data-act="todo"><span class="mehr-t">' + i + '</span><span aria-hidden="true">→</span></button></li>'; }).join("") + "</ul></div>";
  }

  /* ================= Dialoge ================= */
  function modal() {
    var m = ui.modal; if (!m) return "";
    var body = "";
    if (m.type === "kassensturz") {
      var vs = vorschlaege();
      body = "<h2>Kassensturz · " + mLabel(state.active, true) + "</h2><p class=\"muted\">Beides zusammen, damit nichts doppelt zählt.</p>" +
        '<ol class="steps"><li class="' + (state.importAt && m.step > 1 ? "done" : "") + '"><b>1 · Kontoauszug importieren</b>' +
        (m.step === 1 ? '<p class="muted small">Im echten Tool ziehst du hier die CSV der Sparkasse hinein.</p>' + btn("Beispiel-Import laden", "doImport", "", "btn-primary") : '<p class="muted small">' + esc(m.importMsg || "") + "</p>") + "</li>" +
        '<li class="' + (m.step < 2 ? "dim" : "") + '"><b>2 · Kontostände von jetzt eintragen</b>' + (m.step >= 2 ? '<div class="konten">' +
          kontoField("giro", "Girokonto", state.konten.giro) + kontoField("konto2", "2. Konto", state.konten.konto2) + kontoField("kk", "Kreditkarte (offen, negativ)", state.konten.kk) + "</div>" : "") + "</li></ol>" +
        '<div class="m-foot">' + btn("Abbrechen", "closeModal", "", "btn-ghost") + (m.step >= 2 ? btn("Fertig", "finishKS", "", "btn-primary") : "") + "</div>";
      if (m.step >= 2 && vs.length) body = body.replace("</ol>", '<li><b>3 · Danach</b><p class="muted small">' + vs.length + " Buchung(en) passen zu offenen Posten. Du bestätigst sie gleich auf der Monatsseite.</p></li></ol>");
    }
    if (m.type === "start") {
      var R = rechnung(), nx = L.nextMonth(state.active);
      var open = R.fixOffen.concat(R.einOffen);
      var early = now.getDate() < 28 && state.active === CUR;
      body = "<h2>" + mName(nx) + " starten</h2>" +
        (early ? '<p class="muted">Du startest früher als der Kalender. Das ist okay, z. B. wenn dein Gehalt für ' + mName(nx) + " schon da ist.</p>" : "") +
        '<ul class="startlist">' +
        "<li><b>" + mName(state.active) + "</b> wird abgeschlossen. Endstand " + (R.hasKonten ? eur(R.total) : "ohne Kontostand") + " wird gespeichert.</li>" +
        "<li><b>" + openList().length + " offene Posten</b> wandern mit (Schulden, Schwebendes, Rücklagen, Geplantes).</li>" +
        (open.length ? "<li><b>" + open.length + " feste Posten aus " + mName(state.active) + "</b> sind noch nicht abgebucht (" + esc(open.slice(0, 3).map(function (r) { return r.item.beschreibung; }).join(", ")) + (open.length > 3 ? " …" : "") + "). Sie werden mitgenommen, sonst würde dir dieses Geld im " + mName(nx) + " fehlen. Sie fallen weg, sobald die Abbuchung importiert ist.</li>" : "") +
        "<li>Danach machst du für " + mName(nx) + " einen frischen Kassensturz.</li></ul>" +
        '<div class="m-foot">' + btn("Abbrechen", "closeModal", "", "btn-ghost") + btn(mName(nx) + " starten", "doStart", "", "btn-primary") + "</div>";
    }
    if (m.type === "reopen") {
      var pc = state.prevCtx;
      body = "<h2>Zurück zu " + mName(pc.mk) + "</h2><ul class=\"startlist\"><li>" + mName(pc.mk) + " wird wieder der aktive Monat, mit den Kontoständen von damals.</li>" +
        "<li>Was du inzwischen eingetragen hast (offene Posten, Importe, Verschiebungen), bleibt erhalten.</li>" +
        "<li>Der Kassensturz für " + mName(state.active) + " wird verworfen.</li></ul>" +
        '<div class="m-foot">' + btn("Abbrechen", "closeModal", "", "btn-ghost") + btn("Zurück zu " + mName(pc.mk), "doReopen", "", "btn-primary") + "</div>";
    }
    if (m.type === "teilen") {
      var t = state.transactions.find(function (x) { return x.id === m.t; });
      body = "<h2>Buchung teilen</h2><p class=\"muted\">" + esc(t.empfaenger) + " · " + eur(t.betrag) + "</p>" +
        '<div class="form"><label class="grow"><span>Mit wem?</span><input id="s-person" placeholder="z. B. Anna"></label>' +
        '<label><span>Ihr/sein Anteil</span><input id="s-betrag" class="in-num" inputmode="decimal" value="' + fmt.format(Math.abs(t.betrag) / 2) + '"></label></div>' +
        '<p class="muted small">Daraus wird „schuldet mir“. In den Ausgaben zählt nur noch dein Teil. Kommt das Geld zurück, erkennt der Import es.</p>' +
        '<div class="m-foot">' + btn("Abbrechen", "closeModal", "", "btn-ghost") + btn("Teilen", "doTeilen", ' data-t="' + t.id + '"', "btn-primary") + "</div>";
    }
    return '<div class="overlay" data-act="closeModal"><div class="modal" role="dialog" aria-modal="true">' + body + "</div></div>";
  }

  try {
    var sp = localStorage.getItem("bosal.palette"); if (sp && (sp === "eigene" || PALETTES.some(function (p) { return p[0] === sp; }))) ui.palette = sp;
    var sm = localStorage.getItem("bosal.mode"); if (sm) ui.mode = sm;
    ui.custom = localStorage.getItem("bosal.custom") || "#E0457B";
  } catch (e) { ui.custom = "#E0457B"; }
  function applyTheme() {
    var h = document.documentElement, dark = ui.mode === "dunkel" || (ui.mode === "system" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
    var p = PALETTES.find(function (x) { return x[0] === ui.palette; });
    var c1 = p ? p[2] : ui.custom, c2 = p ? p[3] : ui.custom;
    h.setAttribute("data-mode", dark ? "dark" : "light");
    h.style.setProperty("--p1", c1); h.style.setProperty("--p2", c2);
  }
  function palettePicker() {
    return '<div class="pal-pop"><div class="pal-t">Darstellung</div><div class="seg seg-sm pal-modes">' + MODES.map(function (m) {
      return '<button class="seg-b' + (m[0] === ui.mode ? " on" : "") + '" data-act="mode" data-m="' + m[0] + '">' + m[1] + "</button>";
    }).join("") + '</div><div class="pal-t">Farbe</div><div class="pal-grid">' + PALETTES.map(function (p) {
      return '<button class="pal' + (p[0] === ui.palette ? " on" : "") + '" data-act="palette" data-p="' + p[0] + '"><span class="pal-sw" style="background:linear-gradient(135deg,' + p[2] + "," + p[3] + ')"></span>' + p[1] + "</button>";
    }).join("") + '<label class="pal' + (ui.palette === "eigene" ? " on" : "") + '"><input type="color" data-act="customColor" value="' + ui.custom + '" class="pal-sw pal-color">Eigene</label></div></div>';
  }

  /* ================= Rahmen ================= */
  var VIEWS = [["monat", "Monat"], ["offen", "Offen"], ["ausgaben", "Ausgaben"], ["zukunft", "Zukunft"], ["mehr", "Mehr"]];
  var RENDER = { monat: viewMonat, offen: viewOffen, ausgaben: viewAusgaben, zukunft: viewZukunft, mehr: viewMehr };
  function render() {
    var nOpen = openList().length;
    var nav = VIEWS.map(function (v) {
      return '<button class="nav-i' + (ui.view === v[0] ? " on" : "") + '" data-act="go" data-view="' + v[0] + '"><span class="nav-l">' + v[1] + "</span>" + (v[0] === "offen" && nOpen ? '<span class="badge">' + nOpen + "</span>" : "") + "</button>";
    }).join("");
    var y = window.scrollY;
    applyTheme();
    document.getElementById("app").innerHTML =
      '<header class="top"><div class="brand"><span class="brand-mark" aria-hidden="true"></span>BoSal</div><div class="top-r"><button class="ur" data-act="undo"' + (hist.past.length ? ' title="Rückgängig: ' + esc(hist.past[hist.past.length - 1].label) + '"' : " disabled") + ' aria-label="Rückgängig">↶</button>' +
      '<button class="ur" data-act="redo"' + (hist.future.length ? ' title="Wiederholen: ' + esc(hist.future[hist.future.length - 1].label) + '"' : " disabled") + ' aria-label="Wiederholen">↷</button>' +
      '<button class="ur" data-act="palOpen" aria-label="Farbpalette">🎨</button><span class="top-date">Entwurf 9</span>' + (ui.palOpen ? palettePicker() : "") + "</div></header>" +
      '<nav class="nav" aria-label="Bereiche">' + nav + '</nav><main class="main">' + RENDER[ui.view]() + "</main>" + modal() +
      (ui.toast ? '<div class="toast" role="status">' + esc(ui.toast) + "</div>" : "");
    window.scrollTo(0, y);
  }
  function toast(msg) { ui.toast = msg; render(); clearTimeout(toast._t); toast._t = setTimeout(function () { ui.toast = null; render(); }, 3000); }

  document.addEventListener("toggle", function (e) { var d = e.target; if (d.dataset && d.dataset.key) ui["open_" + d.dataset.key] = d.open; if (d.dataset && d.dataset.pp) window.BoSalZukunft.zu.open[d.dataset.pp] = d.open; }, true);
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (ui.palOpen && !e.target.closest(".pal-pop") && (!b || b.dataset.act !== "palOpen")) { ui.palOpen = false; if (!b) { render(); return; } }
    if (!b || b.tagName === "INPUT" || b.tagName === "SELECT") return;
    if (b.classList.contains("overlay") && e.target !== b) return;   // Klick im Dialog schließt ihn nicht
    var a = b.dataset.act, d = b.dataset;
    if (a === "go") { ui.view = d.view; ui.month = null; ui.sortOpen = false; window.scrollTo(0, 0); render(); return; }
    if (a === "palOpen") { ui.palOpen = !ui.palOpen; render(); return; }
    if (a === "palette") { ui.palette = d.p; try { localStorage.setItem("bosal.palette", d.p); } catch (er) {} render(); return; }
    if (a === "mode") { ui.mode = d.m; try { localStorage.setItem("bosal.mode", d.m); } catch (er) {} render(); return; }
    if (window.BoSalZukunft && window.BoSalZukunft.handle(zctx(), a, d, b)) { render(); return; }
    if (a === "openMonth") { ui.month = d.month || null; ui.view = "monat"; window.scrollTo(0, 0); render(); return; }
    if (a === "ovrReset") { mark("Planwert zurückgesetzt"); delete state.overrides[d.m][d.id]; render(); return; }
    if (a === "ovrZero") { mark("Posten entfällt"); (state.overrides[d.m] = state.overrides[d.m] || {})[d.id] = 0; render(); return; }
    if (a === "addPlanM") {
      var pb = parseNum(document.getElementById("pm-betrag").value), pt = document.getElementById("pm-text").value.trim();
      if (!pt || isNaN(pb) || pb === 0) { toast("Bitte „Wofür“ und Betrag ausfüllen."); return; }
      mark("Geplant für " + mName(d.m)); state.offen.push({ id: uid("o"), art: "geplant", text: pt, betrag: Math.abs(pb), richtung: +document.getElementById("pm-richtung").value, monat: d.m, seit: state.active });
      toast("Für " + mName(d.m) + " geplant."); return;
    }
    if (a === "undo") { undo(); return; }
    if (a === "redo") { redo(); return; }
    if (a === "ack") { mark("Hinweis bestätigt"); state.kontoEinzeln = false; render(); return; }
    if (a === "reopenAsk") { ui.modal = { type: "reopen" }; render(); return; }
    if (a === "doReopen") {
      mark("Zurück zu " + mName(state.prevCtx.mk)); var pc = state.prevCtx;
      state.active = pc.mk; state.konten = pc.konten; state.kontoAt = pc.kontoAt; state.importAt = pc.importAt; state.carry = pc.carry; state.startedEarly = pc.startedEarly; state.kontoEinzeln = false;
      delete state.frozen[pc.mk]; state.prevCtx = null; ui.modal = null; toast(mName(pc.mk) + " ist wieder aktiv."); return;
    }
    if (a === "reopenItem") { mark("wieder geöffnet"); var ro = state.offen.find(function (x) { return x.id === d.o; }); ro.erledigt = false; ro.erledigtWie = ""; state.transactions.forEach(function (t) { if (t.settles === ro.id) delete t.settles; }); toast("„" + ro.text + "“ ist wieder offen."); return; }
    if (a === "addTransfer") {
      var tb = parseNum(document.getElementById("t-betrag").value), tv = document.getElementById("t-von").value, tn = document.getElementById("t-nach").value;
      if (isNaN(tb) || tb <= 0 || tv === tn) { toast("Bitte Betrag und zwei verschiedene Monate wählen."); return; }
      mark("Verschiebung"); state.transfers.push({ id: uid("tr"), von: tv, nach: tn, betrag: tb, text: document.getElementById("t-text").value.trim() }); ui.open_uebertrag = true;
      toast(eur(tb) + " von " + mName(tv) + " nach " + mName(tn) + " verschoben."); return;
    }
    if (a === "delTransfer") { mark("Verschiebung gelöscht"); state.transfers = state.transfers.filter(function (t) { return t.id !== d.id; }); render(); return; }
    if (a === "closeModal") { ui.modal = null; render(); return; }
    if (a === "kassensturz") { ui.modal = { type: "kassensturz", step: state.demoImported ? 2 : 1 }; render(); return; }
    if (a === "doImport") { mark("Import"); var n = demoImport(); state.importAt = Date.now(); state.kontoEinzeln = false; ui.modal.step = 2; ui.modal.importMsg = n ? n + " neue Buchungen importiert." : "Import ist schon drin."; render(); return; }
    if (a === "finishKS") { if (state.konten.giro == null) { toast("Bitte mindestens das Girokonto eintragen."); return; } state.kontoAt = Date.now(); state.kontoEinzeln = false; if (!state.importAt) state.importAt = Date.now(); ui.modal = null; ui.view = "monat"; toast("Kassensturz gespeichert."); return; }
    if (a === "startNext") { ui.modal = { type: "start" }; render(); return; }
    if (a === "doStart") {
      mark(mName(L.nextMonth(state.active)) + " gestartet");
      var R = rechnung(), mk = state.active;
      state.prevCtx = { mk: mk, konten: clone(state.konten), kontoAt: state.kontoAt, importAt: state.importAt, carry: clone(state.carry), startedEarly: state.startedEarly };
      state.frozen[mk] = R.hasKonten ? R.total : R.c.prognoseSaldo;
      state.carry = R.fixOffen.concat(R.einOffen).map(function (r) { return { itemId: r.item.id, monat: mk }; });
      state.active = L.nextMonth(mk);
      state.startedEarly = state.active > CUR ? now.toLocaleDateString("de-DE") : null;
      state.konten = { giro: null, konto2: null, kk: null }; state.kontoAt = null; state.importAt = null; state.kontoEinzeln = false;
      ui.modal = null; ui.view = "monat"; toast(mName(state.active) + " gestartet. Jetzt Kassensturz machen."); return;
    }
    if (a === "settle") {
      var o = state.offen.find(function (x) { return x.id === d.o; }), t = state.transactions.find(function (x) { return x.id === d.t; });
      mark("„" + o.text + "“ erledigt"); o.erledigt = true; o.erledigtWie = "per Import " + dLabel(t.datum); t.settles = o.id;
      if (o.art === "schwebend" || o.art === "geplant") { if (o.kat) { t.kategorieId = o.kat; t.manuelleKat = true; } }
      toast("„" + o.text + "“ ist erledigt und zählt nicht mehr doppelt."); return;
    }
    if (a === "addArt") { ui.addArt = d.a; render(); return; }
    if (a === "add") {
      var betrag = parseNum(document.getElementById("f-betrag").value), text = document.getElementById("f-text").value.trim();
      var pe = document.getElementById("f-person"), ka = document.getElementById("f-kat"), ri = document.getElementById("f-richtung");
      if (!text || isNaN(betrag) || betrag === 0) { toast("Bitte „Wofür“ und Betrag ausfüllen."); return; }
      if (pe && !pe.value.trim()) { toast("Bitte eine Person eintragen."); return; }
      var fm = document.getElementById("f-monat");
      mark(ART[ui.addArt].label + " eingetragen");
      state.offen.push({ monat: fm ? fm.value : undefined, id: uid("o"), art: ui.addArt, text: text, betrag: Math.abs(betrag), person: pe ? pe.value.trim() : "", kat: ka ? ka.value : (ui.addArt === "ruecklage" ? "sparen" : null), richtung: ri ? +ri.value : undefined, seit: state.active });
      toast(ART[ui.addArt].label + " eingetragen."); return;
    }
    if (a === "done") { mark("erledigt"); var o2 = state.offen.find(function (x) { return x.id === d.o; }); o2.erledigt = true; o2.erledigtWie = "von Hand"; toast("Erledigt."); return; }
    if (a === "del") { mark("gelöscht"); state.offen = state.offen.filter(function (x) { return x.id !== d.o; }); toast("Gelöscht."); return; }
    if (a === "toggleDone") { ui.showDone = !ui.showDone; render(); return; }
    if (a === "report") { ui.view = "ausgaben"; ui.repMonth = d.month; render(); return; }
    if (a === "repMonth") { ui.repMonth = d.month; render(); return; }
    if (a === "share") { ui.shareMode = d.v === "1"; render(); return; }
    if (a === "teilen") { ui.modal = { type: "teilen", t: d.t }; render(); return; }
    if (a === "doTeilen") {
      var tt = state.transactions.find(function (x) { return x.id === d.t; }), per = document.getElementById("s-person").value.trim(), bt = parseNum(document.getElementById("s-betrag").value);
      if (!per || isNaN(bt) || bt <= 0) { toast("Bitte Person und Anteil eintragen."); return; }
      mark("Buchung geteilt");
      state.offen.push({ id: uid("o"), art: "forderung", text: (tt.empfaenger || "").split("/")[0] + " (Anteil)", betrag: bt, person: per, kat: tt.kategorieId, txId: tt.id, seit: state.active });
      ui.modal = null; toast(per + " schuldet dir " + eur(bt) + ". In den Ausgaben zählt nur dein Teil."); return;
    }
    if (a === "sortOpen") { ui.sortOpen = true; render(); return; }
    if (a === "sortClose") { ui.sortOpen = false; render(); return; }
    if (a === "skip") { ui.skipped[d.t] = true; render(); return; }
    if (a === "sort") {
      var st = state.transactions.find(function (x) { return x.id === d.t; }), before = state.transactions.filter(isUnsorted).length;
      mark("sortiert"); st.kategorieId = d.cat; st.manuelleKat = true;
      var al = document.getElementById("always"), kw = document.getElementById("kw").value.trim().toLowerCase();
      if (al && al.checked && kw.length >= 3) { var c = state.categories.find(function (x) { return x.id === d.cat; }); if (c.keywords.indexOf(kw) === -1) c.keywords.push(kw); L.enrichAll(state); }
      var extra = before - 1 - state.transactions.filter(isUnsorted).length;
      toast("→ " + cat(d.cat).name + (extra > 0 ? " · " + extra + " weitere mitsortiert" : "")); return;
    }
    if (a === "todo") { toast("Kommt im echten Umbau."); return; }
  });
  document.addEventListener("input", function (e) {
    if (e.target.dataset.act === "zYear" && window.BoSalZukunft.change(zctx(), e.target)) render();
  });
  document.addEventListener("change", function (e) {
    var el = e.target;
    if (el.dataset.act === "customColor") { ui.custom = el.value; ui.palette = "eigene"; try { localStorage.setItem("bosal.custom", el.value); localStorage.setItem("bosal.palette", "eigene"); } catch (er) {} render(); return; }
    if (el.dataset.act === "zYear") return;
    if (window.BoSalZukunft && window.BoSalZukunft.change(zctx(), el)) { render(); return; }
    if (el.dataset.act === "inclFix") { ui.inclFix = el.checked; render(); return; }
    if (el.dataset.act === "ovr") {
      var it = state.expected.find(function (x) { return x.id === el.dataset.id; }), n = parseNum(el.value);
      if (isNaN(n)) { render(); return; }
      if (it.betrag < 0 && n > 0) n = -n;                      // Ausgaben bleiben negativ
      mark("„" + it.beschreibung + "“ für " + mName(el.dataset.m) + " angepasst");
      var o = state.overrides[el.dataset.m] = state.overrides[el.dataset.m] || {};
      if (Math.abs(n - it.betrag) < 0.005) delete o[it.id]; else o[it.id] = n;
      render(); return;
    }
    if (el.dataset.act === "konto") {
      mark("Kontostand geändert"); var v = parseNum(el.value); state.konten[el.dataset.k] = isNaN(v) ? null : (el.dataset.k === "kk" ? -Math.abs(v) : v);
      if (!ui.modal) { state.kontoAt = Date.now(); if (state.importAt) state.kontoEinzeln = true; }
      render();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || e.target.matches("input,textarea")) return;
    e.preventDefault(); if (e.shiftKey) redo(); else undo();
  });
  render();
})();
