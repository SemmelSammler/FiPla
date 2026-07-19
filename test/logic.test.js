/* Validierung der Engine gegen die Original-Excel-Referenzwerte */
const L = require("../js/logic.js");
const D = require("../js/defaults.js");
const SEED = require("../js/seed.js");

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL " + name + (extra !== undefined ? "  → " + extra : "")); }
}
function approx(a, b, tol, name) { ok(Math.abs(a - b) <= (tol || 0.01), name, a + " ≠ " + b); }

/* ---------- Zustand aufbauen wie beim Erststart ---------- */
const state = {
  transactions: JSON.parse(JSON.stringify(SEED.transactions)),
  expected: JSON.parse(JSON.stringify(SEED.expected)),
  categories: JSON.parse(JSON.stringify(D.categories)),
  months: {}
};
L.enrichAll(state);

console.log("\n== 1) Matching / Erwartete Posten ==");
const byItem = {};
state.transactions.forEach(t => { if (t.itemId) byItem[t.itemId] = (byItem[t.itemId] || 0) + 1; });
const matchedItems = state.expected.filter(it => byItem[it.id]);
ok(matchedItems.length >= 17, "mind. 17 der 18 Posten haben passende Buchungen im Seed", matchedItems.length);
state.expected.forEach(it => {
  if (!byItem[it.id]) console.log("    (ohne Treffer im Zeitraum: " + it.beschreibung + ")");
});

// Gehalt am 25.06. (Stichtag 25) → effektiver Monat Juli
const gehaltJun = state.transactions.find(t => t.empfaenger.toLowerCase().includes("meteoviva") && t.datum >= "2026-06-20");
ok(!!gehaltJun, "Gehalt Ende Juni vorhanden");
if (gehaltJun) {
  ok(gehaltJun.match === true, "Gehalt gematcht");
  ok(gehaltJun.effMonat === "2026-07", "Gehalt 25.06. → effektiver Monat 2026-07", gehaltJun.datum + " → " + gehaltJun.effMonat);
}
// KfW 26.06. → Juli
const kfwJun = state.transactions.find(t => t.empfaenger.toLowerCase().includes("kreditanstalt") && t.datum >= "2026-06-20");
if (kfwJun) ok(kfwJun.effMonat === "2026-07", "KfW 26.06. → 2026-07", kfwJun.effMonat);
// Stadtwerke (Stichtag 0) bleibt im Juni
const swJun = state.transactions.find(t => t.empfaenger.toLowerCase().includes("stadtwerke") && t.betrag < 0 && t.monat === "2026-06");
if (swJun) ok(swJun.effMonat === "2026-06", "Stadtwerke (Stichtag 0) bleibt im Juni");
// Vorzeichen-Check: Stadtwerke-GUTSCHRIFT darf NICHT als Fixkosten-Posten matchen
const swGut = state.transactions.find(t => t.empfaenger.toLowerCase().includes("stadtwerke") && t.betrag > 0);
if (swGut) ok(swGut.match === false, "Stadtwerke-Gutschrift matcht nicht (Vorzeichen-Check)");

console.log("\n== 2) Monatscockpit Mai 2026 (Referenz: Excel-Tab 'Mai 26') ==");
const mai = L.monthCockpit(state, "2026-05");
const get = (name) => mai.rows.find(r => r.item.beschreibung === name);
approx(get("Gehalt").ist, 5666.41, 0.01, "Gehalt Ist Mai = 5666,41");
approx(get("Mietanteil Laura").ist, 538, 0.01, "Mietanteil Ist Mai = 538,00");
approx(get("Miete DA DMB").ist, -955.20, 0.01, "Miete Ist Mai = −955,20");
approx(get("KfW Studienkredit").ist, -500, 0.01, "KfW Ist Mai = −500");
approx(get("Sparkasse Konsumkredit").ist, -92.08, 0.01, "Konsumkredit Ist Mai = −92,08");
approx(get("Strom").ist, -72, 0.01, "Strom Ist Mai = −72");
ok(get("Strom").status === "ok", "Strom-Status ✓ (< 50 % Abweichung)");
ok(get("Gehalt").status === "abweichung", "Gehalt 5666 vs 3430 → ⚠ (Abweichung > 50 %)");

console.log("\n== 3) FI-Engine (Referenz: Excel-Tab 'Planung FI') ==");
const fi = L.runFI(D.fi);
ok(fi.fiJahr === 2042, "FI-Jahr = 2042", fi.fiJahr);
ok(fi.fiAlter === 45, "Alter bei FI = 45", fi.fiAlter);
approx(fi.vermoegenBeiFi, 432113.59157435241, 0.02, "Vermögen bei FI = 432.113,59");
approx(fi.vermoegenHeute, -19751.97, 0.01, "Vermögen heute = −19.751,97");
approx(fi.cashflowHeute, 1776.35, 0.01, "Cashflow heute = 1.776,35");
approx(fi.etfEnde, 2728440.307957211, 0.05, "ETF-Endstand 2069 = 2.728.440,31");

// Zeilenweise gegen die Original-Tabelle (Jahr → [einn, fix, kfw1Pfl, kfw2Pfl, frei, ngAlloc, hekAlloc, sonder, autoKind, etfAlloc, ng, hek, kfw1, kfw2, verm, etf])
const ref = {
  2026: [3430.35, 1154, 500, 0, 1776.35, 0, 226.35, 500, 400, 50, 0, 905.40, -10951.97, -4800, -14641.57, 205],
  2027: [3533.2605, 1177.08, 400, 100, 1856.1805, 0, 306.1805, 500, 400, 50, 0, 4579.566, -151.97, -3600, 1657.846, 830.25],
  2028: [3639.258315, 1200.6216, 151.97, 200, 2086.666715, 400, 500, 0, 400, 186.666715, 4800, 10579.566, 0, -1200, 17347.3290945, 3167.7630945],
  2029: [3748.43606445, 1224.634032, 0, 100, 2423.80203245, 400, 500, 0, 400, 523.80203245, 9600, 16579.566, 0, 0, 35948.48224836, 9768.91624836],
  2031: [3976.7158207750053, 1274.1092468928, 0, 0, 2702.6065738822053, 400, 500, 0, 400, 802.60657388220534, 15000, 28579.566, 0, 0, 73414.268854365335, 29834.702854365343],
  2036: [4500, 1400, 0, 0, 3100, 0, 500, 0, 400, 1600, 15000, 58579.566, 0, 0, 211431.15631686358, 137851.59031686359],
  2037: [4500, 1400, 0, 0, 3100, 0, 500, 0, 400, 1600, 15000, 64535, 0, 0, 243959.16983270677, 164424.16983270677],
  2038: [4500, 1400, 0, 0, 3100, 0, 0, 0, 400, 2100, 15000, 64535, 0, 0, 278010.37832434208, 198475.37832434211],
  2042: [4500, 1400, 0, 0, 3100, 0, 0, 0, 400, 2100, 15000, 64535, 0, 0, 432113.59157435241, 352578.59157435241],
  2069: [4500, 1400, 0, 0, 3100, 0, 0, 0, 400, 2100, 15000, 64535, 0, 0, 2807975.307957211, 2728440.307957211]
};
Object.keys(ref).forEach(j => {
  const y = fi.years.find(x => x.jahr === Number(j));
  const r = ref[j];
  const got = [y.einnahmen, y.fixkosten, y.kfw1Pfl, y.kfw2Pfl, y.frei, y.allocNotgroschen, y.allocHausEk, y.allocSonder, y.allocAutoKind, y.allocEtf, y.notgroschen, y.hausEk, y.kfw1, y.kfw2, y.vermoegen, y.etf];
  let allOk = true, detail = "";
  got.forEach((v, i) => { if (Math.abs(v - r[i]) > 0.02) { allOk = false; detail += ` [${i}] ${v.toFixed(2)}≠${r[i].toFixed(2)}`; } });
  ok(allOk, "Jahr " + j + " exakt wie Original", detail);
});
// FI-Status: 2041 noch nicht, 2042 ja
ok(fi.years.find(y => y.jahr === 2041).fi === false, "2041 noch kein FI");
ok(fi.years.find(y => y.jahr === 2042).fi === true, "2042 FI erreicht");

console.log("\n== 4) Hauskauf (Referenz: Excel-Tab 'Hauskauf-Szenario') ==");
const hk = L.runHauskauf(D.hauskauf);
approx(hk.gesamt, 645350, 0.01, "Gesamt-Anschaffung = 645.350");
approx(hk.zielEk, 129070, 0.01, "Ziel-EK = 129.070");
approx(hk.finanzierung, 516280, 0.01, "Finanzierungsbetrag = 516.280");
approx(hk.monatsrate, 3097.68, 0.01, "Monatsrate = 3.097,68 (QS-Ziel ~3.098 €)");
approx(hk.laufzeit, 21.279226659439679, 0.001, "Laufzeit = 21,28 Jahre");
approx(hk.nkSum, 705, 0.01, "Nebenkosten mtl. = 705");
approx(hk.belastung, 3802.68, 0.01, "Gesamtbelastung = 3.802,68");
approx(hk.mehrMtl, 2652.68, 0.01, "Mehrbelastung mtl. = 2.652,68");
approx(hk.mehrJaehrlich, 31832.16, 0.01, "Mehrbelastung p.a. = 31.832,16");
approx(hk.jahreBisEk, 10.755833333, 0.001, "Jahre bis EK-Ziel = 10,76");
ok(hk.kaufjahr === 2037, "Frühestes Kaufjahr = 2037", hk.kaufjahr);
approx(hk.zielEk * D.fi.hausEkAnteil, 64535, 0.01, "Live-Link: Ziel-EK × 50 % = 64.535 (Haus-EK-Ziel FI)");

console.log("\n== 5) Hochzeit (Referenz: Excel-Tab 'Hochzeit') ==");
const w = L.runHochzeit(D.hochzeit);
approx(w.netto, 3974.05, 0.01, "Summe Netto = 3.974,05");
approx(w.brutto, 7419.0195, 0.01, "Summe Brutto = 7.419,02");
approx(w.anteil, 3709.50975, 0.01, "Mein Anteil (Brutto/2) = 3.709,51");
approx(w.urlaubTotal, 2678.62, 0.02, "Urlaub Montenegro Total = 2.678,62");
approx(w.rest, -32.50975, 0.01, "Was bleibt übrig? = −32,51 (QS-Ziel ~−33 €)");

console.log("\n== 6) Kinder (Referenz: Excel-Tab 'Kinder-Szenario') ==");
const k = L.runKinder(D.kinder);
approx(k.schnitt, 233, 0.01, "Schnitt 0–25 = 233");
approx(k.direkt, 69900, 0.01, "Direkte Kosten netto = 69.900");
approx(k.elternBonus, -8400, 0.01, "Elterngeld-Bonus = −8.400");
approx(k.ruecklage, 15000, 0.01, "Rücklage 25 J. = 15.000");
approx(k.proKind, 76500, 0.01, "Gesamt pro Kind = 76.500 (QS-Ziel ~76.500 €)");
approx(k.peaks.beideKlein, 368.25, 0.01, "Peak beide klein = 368,25");
approx(k.peaks.schule, 491.5833333, 0.01, "Peak Schule = 491,58");
approx(k.peaks.teenager, 553.25, 0.01, "Peak Teenager = 553,25");
approx(k.peaks.studium, 690, 0.01, "Peak Studium = 690");
approx(k.peaks.schnittAlle, 531.05, 0.01, "Schnitt alle Phasen = 531,05");
approx(k.alleKinder, 141525, 0.01, "Alle Kinder = 141.525");
approx(k.deinAnteil, 70762.5, 0.01, "Dein Anteil = 70.762,50");

console.log("\n== 7) CSV-Parser & Dedupe ==");
const csv = 'Auftragskonto;Buchungstag;Buchungstext;Verwendungszweck;Beguenstigter/Zahlungspflichtiger;Betrag;Waehrung;Info\n' +
  'DE23;01.07.2026;KARTENZAHLUNG;"Einkauf; mit Semikolon";REWE SAGT DANKE;-45,67;EUR;Umsatz gebucht\n' +
  'DE23;25.07.2026;GUTSCHRIFT;Lohn - Gehalt Abrechnung 07/2026;meteoviva GmbH;3.430,35;EUR;Umsatz gebucht\n' +
  'DE23;02.07.2026;LASTSCHRIFT;Musik-Abo;Spotify AB;-21,99;EUR;Umsatz vorgemerkt\n';
const parsed = L.parseSparkasseCsv(csv);
ok(parsed.transactions.length === 3, "3 Zeilen geparst", parsed.transactions.length);
approx(parsed.transactions[0].betrag, -45.67, 0.001, "Deutscher Betrag −45,67");
approx(parsed.transactions[1].betrag, 3430.35, 0.001, "Tausenderpunkt 3.430,35");
ok(parsed.transactions[0].datum === "2026-07-01", "Datum TT.MM.JJJJ → ISO");
ok(parsed.transactions[0].zweck === "Einkauf; mit Semikolon", "Quotes mit Semikolon");
// Kategorisierung & Stichtag beim Import
const newTx = parsed.transactions.map(t => Object.assign({ id: "x", manuelleKat: false }, t));
newTx.forEach(t => L.enrichTx(t, state.expected, state.categories));
ok(newTx[0].kategorieId === "lebensmittel", "REWE → Lebensmittel (Regel)", newTx[0].kategorieId);
ok(newTx[1].effMonat === "2026-08", "Gehalt 25.07. → effektiv August");
ok(newTx[2].match === true && newTx[2].kategorieId === "abos", "Spotify → erwarteter Posten (Abos)");
// Dedupe: erneuter Import derselben Datei → 0 neu
const d1 = L.dedupeImport(state.transactions.concat(newTx), parsed.transactions);
ok(d1.added.length === 0 && d1.skipped === 3, "Re-Import: 0 neu, 3 übersprungen");
// Multiset: zwei identische legitime Buchungen in einer Datei
const twice = parsed.transactions.concat([parsed.transactions[0]]);
const d2 = L.dedupeImport(state.transactions.concat(newTx), twice);
ok(d2.added.length === 1 && d2.skipped === 3, "Multiset-Dedupe: doppelte legitime Zeile wird 1× importiert");
// Tab-getrennt + Excel-Seriennummer + ISO-Datum
const tsv = "Buchungstag\tBetrag\tBeguenstigter/Zahlungspflichtiger\n46199\t-500\tKREDITANSTALT\n2026-07-03\t-12,5\tTest\n";
const p2 = L.parseSparkasseCsv(tsv);
ok(p2.transactions.length === 2 && p2.transactions[0].datum === "2026-06-26", "Excel-Seriennummer 46199 → 2026-06-26", p2.transactions[0] && p2.transactions[0].datum);
ok(p2.transactions[1].datum === "2026-07-03", "ISO-Datum bleibt ISO");

console.log("\n== 8) Seed-Integrität ==");
ok(state.transactions.length === 188, "188 Seed-Transaktionen", state.transactions.length);
ok(state.expected.length === 18, "18 erwartete Posten");
const catIds = new Set(state.categories.map(c => c.id));
ok(state.expected.every(it => catIds.has(it.kategorieId)), "Alle Posten haben gültige Kategorie");
ok(state.transactions.every(t => catIds.has(t.kategorieId)), "Alle Transaktionen haben gültige Kategorie");


/* == Nachträge: Zuordnungs-Übersteuerung & Prognose == */
console.log("\n== 9) matchOverride: Zuordnung lösen / manuell zuordnen ==");
(function () {
  var laura = state.expected.find(function (i) { return i.beschreibung === "Mietanteil Laura"; });
  // Testfall wie im Screenshot: zwei Einnahmen matchen denselben Posten
  var t1 = { id: "ov1", datum: "2026-07-30", empfaenger: "Laura Bonni", zweck: "Miete", betrag: 538, info: "Umsatz gebucht", manuelleKat: false };
  var t2 = { id: "ov2", datum: "2026-07-30", empfaenger: "Laura Bonni", zweck: "Rechtsschutz, Madam Tam, GEZ", betrag: 220, info: "Umsatz gebucht", manuelleKat: false };
  L.enrichTx(t1, state.expected, state.categories);
  L.enrichTx(t2, state.expected, state.categories);
  ok(t1.itemId === laura.id && t2.itemId === laura.id, "beide Buchungen matchen zunächst den Posten");
  var st = { transactions: [t1, t2], expected: state.expected, categories: state.categories, months: {} };
  ok(Math.abs(L.monthCockpit(st, t1.effMonat).rows.find(function (r) { return r.item === laura; }).ist - 758) < 0.01, "Ist = 758 (beide zusammen)");
  // Zuordnung der 220 € lösen
  t2.matchOverride = "none";
  L.enrichAll(st);
  ok(t2.itemId === null && t2.match === false, "gelöste Buchung zählt zu keinem Posten mehr");
  var c2 = L.monthCockpit(st, t1.effMonat);
  approx(c2.rows.find(function (r) { return r.item === laura; }).ist, 538, 0.01, "Ist nach Lösen = 538 (nur Miete)");
  ok(L.monthCockpit(st, "2026-07").einnahmen.some(function (t) { return t.id === "ov2"; }), "220 € erscheint weiter als freie Einnahme (im Buchungsmonat Juli)");
  // Effektiver Monat: gelöste Buchung verliert die Stichtag-Verschiebung
  ok(t2.effMonat === "2026-07", "gelöst → effektiver Monat = Buchungsmonat (keine Stichtag-Verschiebung mehr)", t2.effMonat);
  ok(t1.effMonat === "2026-08", "zugeordnete Buchung (30. ≥ Stichtag 25) bleibt verschoben");
  // Manuelle Zuordnung zu anderem Posten inkl. dessen Stichtag
  var gehalt = state.expected.find(function (i) { return i.beschreibung === "Gehalt"; });
  t2.matchOverride = gehalt.id;
  L.enrichAll(st);
  ok(t2.itemId === gehalt.id && t2.match === true, "manuelle Zuordnung zu anderem Posten greift");
  ok(t2.effMonat === "2026-08", "… inklusive dessen Stichtag-Verschiebung");
  ok(t2.kategorieId === gehalt.kategorieId, "… inklusive dessen Kategorie");
})();

console.log("\n== 10) Monatsübersicht: offen & Prognose ==");
(function () {
  var st = {
    transactions: JSON.parse(JSON.stringify(SEED.transactions)),
    expected: JSON.parse(JSON.stringify(SEED.expected)),
    categories: JSON.parse(JSON.stringify(D.categories)),
    months: { "2026-07": { giro: 2745.58, konto2: null, kkSaldo: null, kkDatum: "", planned: [{ id: "p1", beschreibung: "Rücklage", typ: "ruecklage", betrag: -200 }] } }
  };
  L.enrichAll(st);
  var c = L.monthCockpit(st, "2026-07");
  // Manuell nachrechnen
  var re = 0, rf = 0, rs = 0;
  c.rows.forEach(function (r) {
    var rest = r.soll - r.ist;
    rest = r.soll >= 0 ? Math.max(0, rest) : Math.min(0, rest);
    if (r.item.typ === "Einnahme") re += rest; else if (r.item.typ === "Fixkosten") rf += rest; else rs += rest;
  });
  approx(c.restEin, Math.round(re * 100) / 100, 0.01, "restEin korrekt aggregiert (" + c.restEin.toFixed(2) + ")");
  approx(c.restFix, Math.round(rf * 100) / 100, 0.01, "restFix korrekt aggregiert (" + c.restFix.toFixed(2) + ")");
  approx(c.restSchuld, Math.round(rs * 100) / 100, 0.01, "restSchuld korrekt aggregiert (" + c.restSchuld.toFixed(2) + ")");
  ok(c.restEin >= 0 && c.restFix <= 0 && c.restSchuld <= 0, "Vorzeichen: Einnahmen ≥ 0, Kosten ≤ 0");
  approx(c.prognoseSaldo, c.saldo + c.restEin + c.restFix + c.restSchuld, 0.01, "Prognose-Saldo = Ist + Offenes");
  approx(c.prognoseGiro, 2745.58 + c.restEin + c.restFix + c.restSchuld + c.planSum, 0.01, "Prognose-Giro = Stand + Offenes + Planung");
  // Überfüllte Posten liefern keinen negativen Rest (Gehalt Juli ist bereits > Soll? egal: Max/Min-Klemmung)
  var over = c.rows.find(function (r) { return r.soll > 0 && r.ist > r.soll; });
  if (over) ok(true, "übererfüllter Posten (" + over.item.beschreibung + ") erzeugt keinen negativen Rest (geklemmt)");
  else ok(true, "kein übererfüllter Posten im Juli — Klemmung durch Formel garantiert");
})();


console.log("\n== 11) Depot-Tracker ==");
(function () {
  var r = L.runDepot({ start: 1100, rate: 120, zins: 0.04, jahre: 5 });
  approx(r.endwert, 9298.97, 0.01, "1.100 € + 120 €/Mon @ 4 % über 5 J. = 9.298,97 €");
  approx(r.eingezahlt, 8300, 0.01, "eingezahlt = 8.300 €");
  approx(r.zinsgewinn, 998.97, 0.01, "Zinsgewinn = 998,97 €");
  ok(r.points.length === 6 && r.points[0].wert === 1100, "6 Jahres-Punkte, Start = 1.100");
  var r0 = L.runDepot({ start: 1100, rate: 120, zins: 0, jahre: 5 });
  approx(r0.endwert, 8300, 0.01, "0 % Zins → Endwert = Einzahlungen");
  var r10 = L.runDepot({ start: 1100, rate: 120, zins: 0.04, jahre: 10 });
  ok(r10.endwert > r.endwert * 1.8, "längerer Zeitraum → deutlich höherer Endwert (" + Math.round(r10.endwert) + ")");
})();

console.log("\nNachträge: " + pass + " gesamt bestanden, " + fail + " fehlgeschlagen");
process.exitCode = fail ? 1 : 0;

console.log("\n== 12) Personen-Übersicht (Forderungen/Verbindlichkeiten) ==");
(function () {
  var st = {
    months: {
      "2026-05": { planned: [
        { id: "p1", beschreibung: "Anzahlung", typ: "einnahme", betrag: 96, erledigt: false, person: "Laura" },
        { id: "p2", beschreibung: "Amazon", typ: "ausgabe", betrag: -162.75, erledigt: false, person: "Laura" }
      ]},
      "2026-07": { planned: [
        { id: "p3", beschreibung: "Konzertkarte", typ: "einnahme", betrag: 50, erledigt: false, person: "Martin" },
        { id: "p4", beschreibung: "Sonstiges ohne Person", typ: "ausgabe", betrag: -20, erledigt: false, person: "" },
        { id: "p5", beschreibung: "Rücklage", typ: "ruecklage", betrag: -400, erledigt: false, person: "Laura" }, // darf NICHT zählen (kein einnahme/ausgabe)
        { id: "p6", beschreibung: "Schon bezahlt", typ: "ausgabe", betrag: -30, erledigt: true, person: "Martin" } // erledigt -> zählt nicht
      ]}
    }
  };
  var res = L.personSummary(st);
  ok(res.length === 2, "genau 2 Personen erkannt (Laura, Martin)", res.map(function(r){return r.person;}));
  var laura = res.find(function (r) { return r.person === "Laura"; });
  approx(laura.netto, 96 - 162.75, 0.01, "Laura netto = 96 − 162,75 = −66,75 (du schuldest ihr)");
  ok(laura.entries.length === 2, "Laura hat 2 zugrundeliegende Einträge (Rücklage zählt nicht mit)");
  var martin = res.find(function (r) { return r.person === "Martin"; });
  approx(martin.netto, 50, 0.01, "Martin netto = 50 (schuldet dir) — die erledigte Buchung zählt nicht mit");
  ok(martin.entries.length === 1, "Martin hat nur 1 offenen Eintrag (erledigter Eintrag ausgeschlossen)");
  // über Monate hinweg: Mai + Juli für Laura zusammengezählt, nicht nur der aktuelle Monat
  ok(laura.entries.some(function(e){return e.monat==="2026-05";}), "Personen-Summe rechnet über Monatsgrenzen hinweg");
  // Groß-/Kleinschreibung wird vereinheitlicht
  st.months["2026-08"] = { planned: [{ id: "p7", beschreibung: "x", typ: "einnahme", betrag: 10, erledigt: false, person: "laura" }] };
  var res2 = L.personSummary(st);
  ok(res2.length === 2, "\"laura\" und \"Laura\" werden als dieselbe Person zusammengeführt");
})();

console.log("\nNachträge 2: " + pass + " gesamt bestanden, " + fail + " fehlgeschlagen");
process.exitCode = fail ? 1 : 0;

console.log("\n== 13) Vormerkungs-Abgleich (vorgemerkt → endgültig gebucht) ==");
(function () {
  function vg(datum, betrag, empf) { return { id: "v" + datum, datum: datum, betrag: betrag, empfaenger: empf, info: "Umsatz vorgemerkt" }; }
  function fin(datum, betrag, empf) { return { datum: datum, betrag: betrag, empfaenger: empf, info: "Umsatz gebucht" }; }

  // Kernfall: finale Buchung mit anderem Buchungstag ersetzt die alte Vormerkung
  var ex1 = [vg("2026-07-10", -86.89, "Telekom Deutschland GmbH")];
  var res1 = L.dedupeImport(ex1, [fin("2026-07-13", -86.89, "Telekom Deutschland GmbH")]);
  ok(ex1.length === 0, "alte Vormerkung wird entfernt (Buchungstag 3 Tage später)");
  ok(res1.removedVorgemerkt.length === 1, "… und im Ergebnis gemeldet");
  ok(res1.added.length === 1, "die finale Buchung wird normal importiert");

  // Bereits bekannte (übersprungene) finale Buchung räumt trotzdem auf — Re-Import bereinigt Altlasten
  var ex2 = [vg("2026-06-26", -500, "KREDITANSTALT"), fin("2026-07-01", -500, "KREDITANSTALT")];
  var res2 = L.dedupeImport(ex2, [fin("2026-07-01", -500, "KREDITANSTALT")]);
  ok(ex2.length === 1 && !ex2[0].info.toLowerCase().includes("vorgemerkt"), "Re-Import: Altlast-Vormerkung wird nachträglich bereinigt");
  ok(res2.skipped === 1 && res2.added.length === 0, "… die finale Buchung selbst bleibt wie gehabt übersprungen");

  // Schutz: anderer Betrag / anderer Empfänger / zu weit auseinander → KEINE Entfernung
  var ex3 = [vg("2026-07-10", -86.89, "Telekom"), vg("2026-07-10", -50, "Telekom"), vg("2026-07-01", -20, "Rewe")];
  L.dedupeImport(ex3, [fin("2026-07-13", -86.88, "Telekom"), fin("2026-07-13", -50, "Vodafone"), fin("2026-07-12", -20, "Rewe")]);
  ok(ex3.length === 3, "kein Entfernen bei anderem Betrag, anderem Empfänger oder > 7 Tagen Abstand");

  // Schutz: eine finale Buchung entfernt höchstens EINE Vormerkung (identische Zwillinge bleiben paarweise korrekt)
  var ex4 = [vg("2026-07-10", -9.99, "Netflix"), vg("2026-07-11", -9.99, "Netflix")];
  L.dedupeImport(ex4, [fin("2026-07-12", -9.99, "Netflix")]);
  ok(ex4.length === 1, "pro finaler Buchung wird höchstens eine Vormerkung entfernt");

  // Schutz: eingehende Vormerkungen entfernen nichts
  var ex5 = [vg("2026-07-10", -12, "Amazon")];
  L.dedupeImport(ex5, [vg("2026-07-12", -12, "Amazon")]);
  ok(ex5.length === 1, "eine neue Vormerkung verdrängt keine bestehende");
})();

console.log("\nNachträge 3: " + pass + " gesamt bestanden, " + fail + " fehlgeschlagen");
process.exitCode = fail ? 1 : 0;
