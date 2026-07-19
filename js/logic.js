/* =====================================================================
   logic.js — Berechnungs-Engine (UI-unabhängig, in Node testbar)
   ===================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- Datums-Helfer ---------- */
  // Monat als "YYYY-MM"
  function monthKey(dateIso) { return dateIso.slice(0, 7); }
  function dayOfMonth(dateIso) { return parseInt(dateIso.slice(8, 10), 10); }
  function nextMonth(mk) {
    var y = parseInt(mk.slice(0, 4), 10), m = parseInt(mk.slice(5, 7), 10);
    m += 1; if (m > 12) { m = 1; y += 1; }
    return y + "-" + String(m).padStart(2, "0");
  }
  function prevMonth(mk) {
    var y = parseInt(mk.slice(0, 4), 10), m = parseInt(mk.slice(5, 7), 10);
    m -= 1; if (m < 1) { m = 12; y -= 1; }
    return y + "-" + String(m).padStart(2, "0");
  }
  function cmpMonth(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function monthRange(from, to) {
    var out = [], mk = from;
    while (cmpMonth(mk, to) <= 0) { out.push(mk); mk = nextMonth(mk); if (out.length > 2400) break; }
    return out;
  }

  /* ---------- Matching: Transaktion ↔ Erwarteter Posten ---------- */
  // Suchbegriff als Teilstring in Empfänger ODER Verwendungszweck (case-insensitiv),
  // UND Vorzeichen des Betrags muss zum erwarteten Betrag passen.
  function txMatchesItem(tx, item) {
    if (!item.aktiv) return false;
    var term = (item.suchbegriff || "").toLowerCase().trim();
    if (!term) return false;
    var hay = ((tx.empfaenger || "") + " \u0001 " + (tx.zweck || "")).toLowerCase();
    if (hay.indexOf(term) === -1) return false;
    var sSoll = item.betrag < 0 ? -1 : 1;
    var sIst = tx.betrag < 0 ? -1 : 1;
    return sSoll === sIst;
  }

  // Erster passender Posten (Suchbegriffe können sich theoretisch überlappen → Reihenfolge der Liste zählt)
  function findMatchingItem(tx, items) {
    for (var i = 0; i < items.length; i++) if (txMatchesItem(tx, items[i])) return items[i];
    return null;
  }

  // Zuordnung inkl. manueller Übersteuerung:
  //   tx.matchOverride === "none"  → Zuordnung gelöst (zählt zu keinem Posten)
  //   tx.matchOverride === <itemId> → manuell diesem Posten zugeordnet
  //   sonst → automatisches Matching
  function resolveItem(tx, items) {
    if (tx.matchOverride === "none") return null;
    if (tx.matchOverride) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === tx.matchOverride && items[i].aktiv) return items[i];
      }
      return null; // Posten gelöscht/deaktiviert → wie gelöst behandeln
    }
    return findMatchingItem(tx, items);
  }

  /* ---------- Effektiver Monat ---------- */
  // Stichtag > 0 und Buchungstag >= Stichtag → Folgemonat, sonst Buchungsmonat.
  function effectiveMonth(tx, items) {
    var m = monthKey(tx.datum);
    var it = resolveItem(tx, items);
    if (it && it.stichtag > 0 && dayOfMonth(tx.datum) >= it.stichtag) return nextMonth(m);
    return m;
  }

  /* ---------- Automatische Kategorisierung ---------- */
  // 1) Erwartete Posten  2) Kategorie-Regeln (Keywords)  3) Unkategorisiert
  function categorizeTx(tx, items, categories) {
    var it = resolveItem(tx, items);
    if (it) return { kategorieId: it.kategorieId, match: true, itemId: it.id };
    var hay = ((tx.empfaenger || "") + " \u0001 " + (tx.zweck || "")).toLowerCase();
    for (var c = 0; c < categories.length; c++) {
      var cat = categories[c];
      var wantSign = cat.typ === "einnahme" ? 1 : -1;
      var txSign = tx.betrag < 0 ? -1 : 1;
      if (wantSign !== txSign) continue;
      var kws = cat.keywords || [];
      for (var k = 0; k < kws.length; k++) {
        var kw = String(kws[k]).toLowerCase().trim();
        if (kw && hay.indexOf(kw) !== -1) return { kategorieId: cat.id, match: false, itemId: null };
      }
    }
    return { kategorieId: tx.betrag >= 0 ? "sys-einnahme" : "sys-ausgabe", match: false, itemId: null };
  }

  // Alle abgeleiteten Felder einer Transaktion neu berechnen (Kategorie nur, wenn nicht manuell gesetzt)
  function enrichTx(tx, items, categories) {
    tx.monat = monthKey(tx.datum);
    tx.effMonat = effectiveMonth(tx, items);
    var res = categorizeTx(tx, items, categories);
    tx.match = res.match;
    tx.itemId = res.itemId;
    if (!tx.manuelleKat) tx.kategorieId = res.kategorieId;
    return tx;
  }

  function enrichAll(state) {
    var items = state.expected, cats = state.categories;
    for (var i = 0; i < state.transactions.length; i++) enrichTx(state.transactions[i], items, cats);
  }

  /* ---------- Dedupe (Multiset: Datum + Betrag + Empfänger) ---------- */
  function dedupeKey(tx) {
    return tx.datum + "|" + tx.betrag.toFixed(2) + "|" + (tx.empfaenger || "").toLowerCase().trim();
  }
  // Importiert nur Zeilen, deren Schlüssel in der Datei häufiger vorkommt als bereits gespeichert.
  /* Vormerkungs-Abgleich: Banken buchen vorgemerkte Umsätze oft erst Tage später
     endgültig — mit ANDEREM Buchungstag, wodurch der dedupeKey nicht mehr greift und
     die alte Vormerkung als Doppelgänger liegen bliebe. Deshalb: kommt eine endgültig
     gebuchte Buchung herein, wird eine dazu passende alte Vormerkung entfernt
     (gleicher Empfänger + Betrag, Buchungstag ≤ 7 Tage auseinander, höchstens eine
     pro eingehender Buchung). Läuft auch für bereits bekannte (übersprungene)
     Buchungen, damit ein erneuter Import Altlasten nachträglich bereinigt. */
  function reconcileVorgemerkt(existing, incoming) {
    function isVg(t) { return ((t.info || "").toLowerCase().indexOf("vorgemerkt") !== -1); }
    function norm(s) { return (s || "").toLowerCase().trim(); }
    var removed = [];
    incoming.forEach(function (n) {
      if (isVg(n)) return;
      for (var i = existing.length - 1; i >= 0; i--) {
        var v = existing[i];
        if (!isVg(v) || v.betrag !== n.betrag || norm(v.empfaenger) !== norm(n.empfaenger)) continue;
        if (Math.abs(new Date(v.datum) - new Date(n.datum)) > 7 * 86400000) continue;
        existing.splice(i, 1);
        removed.push(v);
        break;
      }
    });
    return removed;
  }

  function dedupeImport(existing, incoming) {
    var removedVorgemerkt = reconcileVorgemerkt(existing, incoming);
    var have = {};
    existing.forEach(function (t) { var k = dedupeKey(t); have[k] = (have[k] || 0) + 1; });
    var added = [], skipped = 0;
    incoming.forEach(function (t) {
      var k = dedupeKey(t);
      if (have[k] > 0) { have[k] -= 1; skipped += 1; }
      else added.push(t);
    });
    return { added: added, skipped: skipped, removedVorgemerkt: removedVorgemerkt };
  }

  /* ---------- CSV-Parser (Sparkasse, tolerant) ---------- */
  function detectDelimiter(headerLine) {
    var counts = { ";": 0, "\t": 0, ",": 0 };
    var inQ = false;
    for (var i = 0; i < headerLine.length; i++) {
      var ch = headerLine[i];
      if (ch === '"') inQ = !inQ;
      else if (!inQ && counts.hasOwnProperty(ch)) counts[ch] += 1;
    }
    if (counts["\t"] >= counts[";"] && counts["\t"] >= counts[","]) return "\t";
    if (counts[";"] >= counts[","]) return ";";
    return ",";
  }
  function parseCsvText(text) {
    text = text.replace(/^\uFEFF/, "");
    var firstNl = text.indexOf("\n");
    var delim = detectDelimiter(firstNl === -1 ? text : text.slice(0, firstNl));
    var rows = [], row = [], field = "", inQ = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
      else if (ch === "\r") { /* skip */ }
      else field += ch;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ""; }); });
  }
  function parseGermanAmount(s) {
    if (typeof s === "number") return s;
    s = String(s || "").trim().replace(/\u00A0/g, "").replace(/€/g, "").trim();
    if (!s) return NaN;
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");   // 1.234,56
    else if (s.indexOf(",") !== -1 && s.indexOf(".") === -1) s = s.replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");     // 2.500 = Tausenderpunkt
    else s = s.replace(/,/g, "");                                          // 1,234.56
    var n = parseFloat(s);
    return isNaN(n) ? NaN : n;
  }
  function parseAnyDate(v) {
    if (v == null) return null;
    var s = String(v).trim();
    var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);                    // TT.MM.JJJJ
    if (m) {
      var y = parseInt(m[3], 10); if (y < 100) y += 2000;
      return y + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);                                // ISO
    if (m) return m[0];
    if (/^\d{4,6}(\.\d+)?$/.test(s)) {                                      // Excel-Seriennummer
      var serial = parseFloat(s);
      if (serial > 20000 && serial < 80000) {
        var d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
        return d.toISOString().slice(0, 10);
      }
    }
    return null;
  }
  function normHeader(h) { return String(h || "").toLowerCase().replace(/[^a-zäöü]/g, ""); }
  // Sparkassen-CSV → rohe Transaktionsobjekte
  function parseSparkasseCsv(text) {
    var rows = parseCsvText(text);
    if (!rows.length) return { transactions: [], errors: ["Datei ist leer."] };
    var headerIdx = -1, map = null;
    for (var r = 0; r < Math.min(rows.length, 10); r++) {
      var h = rows[r].map(normHeader);
      var iDat = h.findIndex(function (x) { return x.indexOf("buchungstag") !== -1 || x === "datum"; });
      var iBetr = h.findIndex(function (x) { return x === "betrag" || x.indexOf("betrag") === 0; });
      if (iDat !== -1 && iBetr !== -1) {
        headerIdx = r;
        map = {
          datum: iDat, betrag: iBetr,
          text: h.findIndex(function (x) { return x.indexOf("buchungstext") !== -1; }),
          zweck: h.findIndex(function (x) { return x.indexOf("verwendungszweck") !== -1; }),
          empf: h.findIndex(function (x) { return x.indexOf("beguenstigter") !== -1 || x.indexOf("begünstigter") !== -1 || x.indexOf("zahlungspflichtiger") !== -1 || x.indexOf("empfaenger") !== -1 || x.indexOf("empfänger") !== -1; }),
          info: h.findIndex(function (x) { return x === "info"; })
        };
        break;
      }
    }
    if (headerIdx === -1) return { transactions: [], errors: ["Keine Spalten \u201EBuchungstag\u201C und \u201EBetrag\u201C gefunden. Ist das ein Sparkassen-CSV-Export?"] };
    var out = [], errors = [];
    for (var i = headerIdx + 1; i < rows.length; i++) {
      var row = rows[i];
      var datum = parseAnyDate(row[map.datum]);
      var betrag = parseGermanAmount(row[map.betrag]);
      if (!datum || isNaN(betrag)) { errors.push("Zeile " + (i + 1) + " übersprungen (Datum/Betrag unlesbar)."); continue; }
      out.push({
        datum: datum,
        text: map.text >= 0 ? String(row[map.text] || "").trim() : "",
        zweck: map.zweck >= 0 ? String(row[map.zweck] || "").trim() : "",
        empfaenger: map.empf >= 0 ? String(row[map.empf] || "").trim() : "",
        betrag: Math.round(betrag * 100) / 100,
        info: map.info >= 0 ? (String(row[map.info] || "").trim() || "Umsatz gebucht") : "Umsatz gebucht"
      });
    }
    return { transactions: out, errors: errors };
  }

  /* ---------- Monats-Aggregation (Cockpit) ---------- */
  function txOfEffMonth(state, mk) {
    return state.transactions.filter(function (t) { return t.effMonat === mk; });
  }
  function itemActualForMonth(state, item, mk) {
    var sum = 0;
    for (var i = 0; i < state.transactions.length; i++) {
      var t = state.transactions[i];
      if (t.effMonat === mk && t.itemId === item.id) sum += t.betrag;
    }
    return Math.round(sum * 100) / 100;
  }
  function itemStatus(soll, ist) {
    if (ist === 0) return "offen";                                 // ○ noch keine Buchung
    if (Math.abs(ist - soll) > Math.abs(soll) * 0.5) return "abweichung"; // ⚠ > 50 % Abweichung
    return "ok";                                                   // ✓
  }
  function monthCockpit(state, mk) {
    var txs = txOfEffMonth(state, mk);
    var items = state.expected.filter(function (it) { return it.aktiv; });
    var rows = items.map(function (it) {
      var ist = itemActualForMonth(state, it, mk);
      return { item: it, soll: it.betrag, ist: ist, status: itemStatus(it.betrag, ist) };
    });
    var fixRows = rows.filter(function (r) { return r.item.typ === "Fixkosten"; });
    var schuldRows = rows.filter(function (r) { return r.item.typ === "Schulden"; });
    var einRows = rows.filter(function (r) { return r.item.typ === "Einnahme"; });
    var openFix = fixRows.filter(function (r) { return r.status === "offen"; }).length;
    var openSchuld = schuldRows.filter(function (r) { return r.status === "offen"; }).length;
    var openEin = einRows.filter(function (r) { return r.status === "offen"; }).length;

    var einnahmen = txs.filter(function (t) { return t.betrag > 0; });
    var variable = txs.filter(function (t) { return t.betrag < 0 && !t.match; });
    var fixIst = sum(txs.filter(function (t) { return t.match && itemTyp(state, t) === "Fixkosten"; }));
    var schuldIst = sum(txs.filter(function (t) { return t.match && itemTyp(state, t) === "Schulden"; }));

    var md = state.months[mk] || {};
    var planned = md.planned || [];
    // Planung: "offen" zählt zur Prognose; "erledigt ohne Bankbuchung" zählt zum Ist;
    // "erledigt mit verknüpfter Bankbuchung" zählt gar nicht (die Buchung selbst steckt schon in den Zahlen).
    var planOffen = planned.filter(function (p) { return !p.erledigt; });
    var planErledigt = planned.filter(function (p) { return p.erledigt; });
    var planErledigtManuell = planErledigt.filter(function (p) { return !p.txId; });
    var planErledigtBank = planErledigt.filter(function (p) { return p.txId; });
    function byTyp(list, typ) { return sum2(list.filter(function (p) { return p.typ === typ; })); }
    var plan = {
      offenRuecklage: byTyp(planOffen, "ruecklage"),
      offenEinnahme: byTyp(planOffen, "einnahme"),
      offenAusgabe: byTyp(planOffen, "ausgabe"),
      offenSum: sum2(planOffen),
      erledigtIstSum: sum2(planErledigtManuell),
      erledigtRuecklageIst: byTyp(planErledigtManuell, "ruecklage"),
      erledigtCount: planErledigt.length,
      erledigtBankCount: planErledigtBank.length,
      offenCount: planOffen.length
    };
    var planSum = plan.offenSum + plan.erledigtIstSum; // alles, was den Monat wirklich bewegt
    var ruecklagenPlan = byTyp(planned.filter(function (p) { return !p.erledigt || !p.txId; }), "ruecklage");
    var saldoBisher = Math.round((sum(einnahmen) + sum(variable) + fixIst + schuldIst + plan.erledigtIstSum) * 100) / 100;
    var saldo = Math.round((saldoBisher + plan.offenSum) * 100) / 100;

    // Noch ausstehend: was von den erwarteten Posten in diesem Monat noch fehlt
    var restEin = 0, restFix = 0, restSchuld = 0;
    rows.forEach(function (r) {
      var rest = r.soll - r.ist;
      rest = r.soll >= 0 ? Math.max(0, rest) : Math.min(0, rest); // nur offene Richtung zählen
      if (r.item.typ === "Einnahme") restEin += rest;
      else if (r.item.typ === "Fixkosten") restFix += rest;
      else restSchuld += rest;
    });
    restEin = Math.round(restEin * 100) / 100;
    restFix = Math.round(restFix * 100) / 100;
    restSchuld = Math.round(restSchuld * 100) / 100;
    // Anzahl Posten mit noch offenem Restbetrag (auch teilweise erfüllte)
    function restCount(typ) {
      return rows.filter(function (r) {
        if (r.item.typ !== typ) return false;
        var rest = r.soll - r.ist;
        rest = r.soll >= 0 ? Math.max(0, rest) : Math.min(0, rest);
        return Math.abs(rest) >= 0.01;
      }).length;
    }
    var offenGesamt = Math.round((restEin + restFix + restSchuld + plan.offenSum) * 100) / 100;
    var prognoseSaldo = Math.round((saldoBisher + offenGesamt) * 100) / 100;
    var prognoseGiro = md.giro != null ? Math.round((md.giro + offenGesamt) * 100) / 100 : null;
    // "Saldo": Prognose über ALLE Konten (Giro-Prognose + 2. Konto + Kreditkarte)
    var prognoseGesamt = prognoseGiro != null
      ? Math.round((prognoseGiro + (md.konto2 || 0) + (md.kkSaldo || 0)) * 100) / 100
      : null;

    return {
      restEin: restEin, restFix: restFix, restSchuld: restSchuld,
      restEinCount: restCount("Einnahme"), restFixCount: restCount("Fixkosten"), restSchuldCount: restCount("Schulden"),
      plan: plan, saldoBisher: saldoBisher, offenGesamt: offenGesamt,
      prognoseSaldo: prognoseSaldo, prognoseGiro: prognoseGiro, prognoseGesamt: prognoseGesamt,
      monthKey: mk, rows: rows,
      fix: { open: openFix, total: fixRows.length },
      schulden: { open: openSchuld, total: schuldRows.length },
      einnahmenPosten: { open: openEin, total: einRows.length },
      einnahmen: einnahmen, einnahmenSum: sum(einnahmen),
      variable: variable, variableSum: sum(variable),
      fixIst: fixIst, schuldIst: schuldIst,
      planned: planned, planSum: planSum, ruecklagenPlan: ruecklagenPlan,
      saldo: Math.round(saldo * 100) / 100,
      monthData: md, txs: txs
    };
  }
  function itemTxsForMonth(state, item, mk) {
    return state.transactions.filter(function (t) { return t.effMonat === mk && t.itemId === item.id; })
      .sort(function (a, b) { return a.datum < b.datum ? 1 : -1; });
  }
  function itemTyp(state, tx) {
    var it = state.expected.find(function (i) { return i.id === tx.itemId; });
    return it ? it.typ : null;
  }
  function sum(txs) { return Math.round(txs.reduce(function (a, t) { return a + t.betrag; }, 0) * 100) / 100; }
  function sum2(list) { return Math.round(list.reduce(function (a, p) { return a + (Number(p.betrag) || 0); }, 0) * 100) / 100; }

  // Kategorie-Aufschlüsselung (z. B. variable Ausgaben → Donut)
  function byCategory(txs, categories) {
    var m = {};
    txs.forEach(function (t) {
      var k = t.kategorieId || (t.betrag >= 0 ? "sys-einnahme" : "sys-ausgabe");
      m[k] = (m[k] || 0) + t.betrag;
    });
    return Object.keys(m).map(function (k) {
      var cat = categories.find(function (c) { return c.id === k; });
      return { kategorieId: k, name: cat ? cat.name : "Unbekannt", farbe: cat ? cat.farbe : "#8C99B4", icon: cat ? cat.icon : "•", betrag: Math.round(m[k] * 100) / 100 };
    }).sort(function (a, b) { return Math.abs(b.betrag) - Math.abs(a.betrag); });
  }

  /* ---------- FI-Planung (Jahres-Simulation, exakt nach Original) ----------
     Verteilungs-Reihenfolge (aus der Original-Tabelle reverse-validiert):
     Lebensqualität → KfW1-Sondertilgung → Auto+Kind → ETF-Mindestbetrag (50 €)
     → Haus-EK → Notgroschen → Rest in ETF.                                   */
  function planRate(plan, jahr, fallback) {
    if (plan && Object.prototype.hasOwnProperty.call(plan, jahr)) return Number(plan[jahr]) || 0;
    return Number(fallback) || 0;
  }
  function runFI(a) {
    var years = [];
    var ng = a.notgroschenStart || 0;
    var hek = a.hausEkStart || 0;
    var kfw1 = -(Math.abs(a.kfw1Rest || 0));
    var kfw2 = -(Math.abs(a.kfw2Rest || 0));
    var etf = a.etfStart || 0;
    var einn = a.einnahmen, fix = a.fixkosten;
    var endYear = a.startjahr + (a.endalter - a.startalter);
    var fiJahr = null;
    var vermStart = ng + hek + kfw1 + kfw2 + etf;
    var cashflowHeute = null;

    for (var jahr = a.startjahr; jahr <= endYear; jahr++) {
      var first = jahr === a.startjahr;
      var monate = first ? a.monateJahr1 : 12;
      if (!first) {
        einn = Math.min(a.einnahmenDeckel, einn * (1 + a.wachstumEinnahmen));
        fix = Math.min(a.fixkostenDeckel, fix * (1 + a.wachstumFix));
      }
      var kfw1Pfl = kfw1 < 0 ? Math.min(planRate(a.kfw1Plan, jahr, a.kfw1PlanDefault), -kfw1) : 0;
      var kfw2Pfl = kfw2 < 0 ? Math.min(planRate(a.kfw2Plan, jahr, a.kfw2PlanDefault), -kfw2) : 0;
      var eventsTotal = (a.events || []).filter(function (e) { return Number(e.jahr) === jahr; })
        .reduce(function (s, e) { return s + (Number(e.betrag) || 0); }, 0);
      var eventsMon = eventsTotal / 12;
      var frei = einn - fix - kfw1Pfl - kfw2Pfl + eventsMon;

      // Waterfall
      var budget = frei;
      var etfFloor = Math.max(0, Math.min(a.etfMindest, budget)); budget -= etfFloor;
      var lq = Math.max(0, Math.min(a.lebensqualitaet, budget)); budget -= lq;
      var sonder = 0;
      if (kfw1 < 0) { sonder = Math.max(0, Math.min(a.kfw1Sonder, (-kfw1) - kfw1Pfl, budget)); budget -= sonder; }
      var autoKind = Math.max(0, Math.min(a.autoPauschale + a.kindSparrate, budget)); budget -= autoKind;
      var hekAlloc = 0;
      if (hek < a.hausEkZiel) { hekAlloc = Math.max(0, Math.min(a.hausEkRate, budget)); budget -= hekAlloc; }
      var ngAlloc = 0;
      if (ng < a.notgroschenZiel) { ngAlloc = Math.max(0, Math.min(a.notgroschenRate, budget)); budget -= ngAlloc; }
      var etfAlloc = etfFloor + Math.max(0, budget);

      // Bestände fortschreiben
      ng = Math.min(a.notgroschenZiel, ng * (1 + a.notgroschenZins) + ngAlloc * monate);
      hek = Math.min(a.hausEkZiel, hek + hekAlloc * monate);
      kfw1 = Math.min(0, kfw1 + (kfw1Pfl + sonder) * monate);
      kfw2 = Math.min(0, kfw2 + kfw2Pfl * monate);
      etf = etf * (1 + a.etfRendite) + etfAlloc * monate * (1 + a.etfRendite / 2);
      var vermoegen = ng + hek + kfw1 + kfw2 + etf;

      var fi = (ng + hek + etf) * 0.04 >= fix * 12;
      if (fi && fiJahr === null) fiJahr = jahr;
      if (cashflowHeute === null) cashflowHeute = frei;

      years.push({
        jahr: jahr, alter: a.startalter + (jahr - a.startjahr), monate: monate,
        einnahmen: einn, fixkosten: fix, kfw1Pfl: kfw1Pfl, kfw2Pfl: kfw2Pfl,
        eventsMon: eventsMon, frei: frei,
        allocNotgroschen: ngAlloc, allocHausEk: hekAlloc, allocSonder: sonder,
        allocAutoKind: autoKind, allocEtf: etfAlloc, allocLebensqual: lq,
        fi: fi, notgroschen: ng, hausEk: hek, kfw1: kfw1, kfw2: kfw2, etf: etf, vermoegen: vermoegen
      });
    }
    var fiRow = fiJahr !== null ? years.find(function (y) { return y.jahr === fiJahr; }) : null;
    return {
      years: years, fiJahr: fiJahr,
      fiAlter: fiJahr !== null ? a.startalter + (fiJahr - a.startjahr) : null,
      vermoegenHeute: vermStart, vermoegenBeiFi: fiRow ? fiRow.vermoegen : null,
      cashflowHeute: cashflowHeute,
      etfEnde: years.length ? years[years.length - 1].etf : 0
    };
  }

  /* ---------- Depot-Tracker (Sparplan mit Zinseszins, monatliche Verzinsung) ---------- */
  function runDepot(d) {
    var start = Number(d.start) || 0;
    var rate = Number(d.rate) || 0;
    var zins = Number(d.zins) || 0;
    var jahre = Math.max(0, Math.round(Number(d.jahre) || 0));
    var i = zins / 12;
    var points = [{ jahr: 0, wert: start, eingezahlt: start }];
    var wert = start;
    for (var m = 1; m <= jahre * 12; m++) {
      wert = wert * (1 + i) + rate;               // Rate am Monatsende, danach verzinst ab Folgemonat
      if (m % 12 === 0) points.push({ jahr: m / 12, wert: Math.round(wert * 100) / 100, eingezahlt: start + rate * m });
    }
    var eingezahlt = start + rate * jahre * 12;
    var endwert = Math.round(wert * 100) / 100;
    return { endwert: endwert, eingezahlt: eingezahlt, zinsgewinn: Math.round((endwert - eingezahlt) * 100) / 100, points: points };
  }

  /* ---------- Personen-Übersicht (private Forderungen/Verbindlichkeiten) ----------
     Jeder Sonderposten mit ausgefülltem "person"-Feld zählt automatisch als Forderung
     (Zusatzeinnahme, per Konvention positiv) oder Verbindlichkeit (Zusatzausgabe, per
     Konvention negativ) gegenüber dieser Person. Dank des erzwungenen Vorzeichens ergibt
     die reine Summe pro Person direkt die Netto-Richtung: positiv = die Person schuldet
     dir, negativ = du schuldest der Person. Nur offene (nicht erledigte) Einträge zählen.
     Rechnet über ALLE Monate, nicht nur den aktuell angezeigten. */
  function personSummary(state) {
    var byPerson = {};
    Object.keys(state.months || {}).forEach(function (mk) {
      var planned = (state.months[mk] && state.months[mk].planned) || [];
      planned.forEach(function (p) {
        var person = (p.person || "").trim();
        if (!person || p.erledigt) return;
        if (p.typ !== "einnahme" && p.typ !== "ausgabe") return;
        var key = person.toLowerCase();
        if (!byPerson[key]) byPerson[key] = { person: person, netto: 0, entries: [] };
        byPerson[key].netto += Number(p.betrag) || 0;
        byPerson[key].entries.push({ monat: mk, beschreibung: p.beschreibung, betrag: p.betrag, typ: p.typ, notiz: p.notiz || "" });
      });
    });
    var list = Object.keys(byPerson).map(function (k) {
      var x = byPerson[k];
      x.netto = Math.round(x.netto * 100) / 100;
      x.entries.sort(function (a, b) { return a.monat < b.monat ? -1 : 1; });
      return x;
    });
    list.sort(function (a, b) { return a.person.localeCompare(b.person); });
    return list;
  }

  /* ---------- Hauskauf ---------- */
  function runHauskauf(h) {
    var grunderwerb = h.kaufpreis * h.grunderwerbSatz;
    var notar = h.kaufpreis * h.notarSatz;
    var makler = h.kaufpreis * h.maklerSatz;
    var gesamt = h.kaufpreis + grunderwerb + notar + makler + h.renovierung + h.sanierung + h.umzug;
    var zielEk = h.ekQuote * gesamt;
    var finanzierung = gesamt - zielEk;
    var annuitaet = finanzierung * (h.zins + h.tilgung);
    var monatsrate = annuitaet / 12;
    var laufzeit = Math.log(1 + h.zins / h.tilgung) / Math.log(1 + h.zins);
    var nkSum = (h.nebenkosten || []).reduce(function (s, n) { return s + (Number(n.betrag) || 0); }, 0);
    var belastung = monatsrate + nkSum;
    var mehrMtl = belastung - h.mieteAktuell;
    var luecke = Math.max(0, zielEk - h.ekHeute);
    var jahreBisEk = h.ekSparrate > 0 ? luecke / (h.ekSparrate * 12) : Infinity;
    var kaufjahr = isFinite(jahreBisEk) ? (h.aktuellesJahr + Math.ceil(jahreBisEk)) : null;
    return {
      grunderwerb: grunderwerb, notar: notar, makler: makler, gesamt: gesamt,
      zielEk: zielEk, finanzierung: finanzierung, annuitaet: annuitaet,
      monatsrate: monatsrate, laufzeit: laufzeit, nkSum: nkSum,
      belastung: belastung, belastungPP: belastung / 2,
      mehrMtl: mehrMtl, mehrJaehrlich: mehrMtl * 12,
      luecke: luecke, jahreBisEk: jahreBisEk, kaufjahr: kaufjahr
    };
  }

  /* ---------- Hochzeit ---------- */
  function hochzeitBrutto(item) {
    if (item.brutto != null && item.brutto !== "") return Number(item.brutto) || 0;
    if (item.netto != null && item.netto !== "") return Math.round(Number(item.netto) * 1.19 * 100) / 100;
    return 0;
  }
  function runHochzeit(w) {
    var netto = 0, brutto = 0;
    (w.items || []).forEach(function (it) {
      netto += Number(it.netto) || 0;
      brutto += hochzeitBrutto(it);
    });
    var anteil = brutto / 2;
    var urlaubTotal = 0, urlaubOffen = 0;
    (w.urlaub || []).forEach(function (u) {
      var b = Number(u.betrag) || 0;
      urlaubTotal += b;
      if (!u.bezahlt) urlaubOffen += b;   // "noch zu zahlen" = alles, was nicht abgehakt ist
    });
    urlaubOffen = Math.round(urlaubOffen * 100) / 100;
    var rest = (Number(w.budget) || 0) - anteil - urlaubOffen;
    return { netto: netto, brutto: brutto, anteil: anteil, urlaubTotal: urlaubTotal, urlaubOffen: urlaubOffen, rest: rest };
  }

  /* ---------- Kinder ---------- */
  function runKinder(k) {
    var netto = {
      p0: k.kosten0_3 - k.kindergeld, p3: k.kosten3_6 - k.kindergeld,
      p6: k.kosten6_10 - k.kindergeld, p10: k.kosten10_18 - k.kindergeld,
      p18: k.kosten18_25 - k.kindergeld
    };
    var schnitt = (netto.p0 * 3 + netto.p3 * 3 + netto.p6 * 4 + netto.p10 * 8 + netto.p18 * 7) / 25;
    var direkt = schnitt * 12 * 25;
    var elternBonus = -k.elterngeld * 14;
    var ruecklage = k.sparrate * 12 * 25;
    var proKind = direkt + elternBonus + ruecklage;
    var n = Math.max(1, Math.round(k.anzahl));
    var mult = 1 + k.rabatt * (n - 1);            // 1. Kind voll, weitere mit Geschwister-Rabatt
    var spar = k.sparrate * n;
    var schule = (netto.p6 * 4 + netto.p10 * 8) / 12;
    var peaks = {
      beideKlein: netto.p0 * mult + spar,
      schule: schule * mult + spar,
      teenager: netto.p10 * mult + spar,
      studium: netto.p18 * n,                      // Original: ohne Rabatt, ohne Sparrate
      schnittAlle: schnitt * mult + spar
    };
    var alleKinder = proKind * mult;
    return {
      netto: netto, schnitt: schnitt, direkt: direkt, elternBonus: elternBonus,
      ruecklage: ruecklage, proKind: proKind, peaks: peaks,
      alleKinder: alleKinder, deinAnteil: alleKinder / 2
    };
  }

  return {
    monthKey: monthKey, nextMonth: nextMonth, prevMonth: prevMonth, cmpMonth: cmpMonth,
    monthRange: monthRange, dayOfMonth: dayOfMonth,
    txMatchesItem: txMatchesItem, findMatchingItem: findMatchingItem, resolveItem: resolveItem,
    itemTxsForMonth: itemTxsForMonth,
    effectiveMonth: effectiveMonth, categorizeTx: categorizeTx, enrichTx: enrichTx, enrichAll: enrichAll,
    dedupeKey: dedupeKey, dedupeImport: dedupeImport, reconcileVorgemerkt: reconcileVorgemerkt,
    parseSparkasseCsv: parseSparkasseCsv, parseGermanAmount: parseGermanAmount, parseAnyDate: parseAnyDate,
    monthCockpit: monthCockpit, byCategory: byCategory, sum: sum,
    runFI: runFI, runDepot: runDepot, personSummary: personSummary, runHauskauf: runHauskauf, runHochzeit: runHochzeit, hochzeitBrutto: hochzeitBrutto, runKinder: runKinder
  };
});
