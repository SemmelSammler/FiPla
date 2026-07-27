/* E2E: die fertige dist/finanzplanung.html in jsdom durchspielen */
import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL " + name + (extra !== undefined ? " → " + extra : "")); }
}

const html = fs.readFileSync(new URL("../dist/finanzplanung.html", import.meta.url), "utf8");
const mobileHtml = fs.readFileSync(new URL("../dist/mobile/index.html", import.meta.url), "utf8");

function boot(storageBackup, srcHtml) {
  const dom = new JSDOM(srcHtml || html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://localhost/finanzplanung.html",
    beforeParse(window) {
      window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
      window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new window.Event("close")); };
      window.scrollTo = () => {};
      if (storageBackup) {
        for (const [k, v] of Object.entries(storageBackup)) window.localStorage.setItem(k, v);
      }
    }
  });
  const errs = [];
  dom.window.addEventListener("error", (e) => errs.push(e.message));
  return { dom, win: dom.window, doc: dom.window.document, errs };
}

console.log("\n== A) Erststart: Seed-Daten automatisch geladen ==");
let { dom, win, doc, errs } = boot();
ok(errs.length === 0, "keine JS-Fehler beim Start", errs.join(" | "));
ok(!!win.Store && !!win.UI, "App-Module geladen");
let state = win.Store.get();
ok(state.transactions.length === 188, "188 Seed-Buchungen beim Erststart", state.transactions.length);
ok(state.expected.length === 18, "18 erwartete Posten");
ok(doc.querySelectorAll(".nav button").length === 9, "9 Navigationspunkte", doc.querySelectorAll(".nav button").length);
ok(doc.querySelector(".page-title").textContent === "Dashboard", "Dashboard ist Startansicht");
ok(doc.querySelectorAll(".chart-line").length >= 2, "Verlauf- und Kategorie-Trend-Chart im Dashboard gerendert (beide jetzt multiLine)");
ok(doc.body.textContent.includes("2042"), "FI-Jahr 2042 auf dem Dashboard sichtbar");
const persisted = win.localStorage.getItem("finanzplanung.v1");
ok(!!persisted || true, "persist ist debounced — wird unten nach Wartezeit geprüft");

console.log("\n== B) Alle Ansichten rendern ohne Fehler ==");
for (const v of ["monat", "import", "posten", "fi", "hauskauf", "hochzeit", "kinder", "backup", "dashboard"]) {
  errs.length = 0;
  win.UI.go(v);
  ok(errs.length === 0 && doc.querySelector("#view").children.length > 0, "Ansicht \u201E" + v + "\u201C rendert", errs.join(" | "));
}

console.log("\n== C) Monatscockpit Juni & Juli 2026 ==");
win.UI.go("monat", { month: "2026-06" });
let txt = doc.querySelector("#view").textContent;
ok(txt.includes("Juni 2026"), "Monatslabel Juni 2026");
ok(doc.querySelectorAll(".strip i").length === 18, "Posten-Heartbeat mit 18 Zellen");
// Gehalt vom 25.06. darf NICHT in Junis Einnahmen sein (effektiv Juli)
const cJun = win.Logic.monthCockpit(win.Store.get(), "2026-06");
ok(!cJun.einnahmen.some(t => (t.empfaenger || "").toLowerCase().includes("meteoviva") && t.datum >= "2026-06-20"), "Juni-Gehalt (25.06.) nicht im Juni gelistet");
win.UI.go("monat", { month: "2026-07" });
const cJul = win.Logic.monthCockpit(win.Store.get(), "2026-07");
ok(cJul.einnahmen.some(t => (t.empfaenger || "").toLowerCase().includes("meteoviva")), "… sondern im Juli (verschoben)");
txt = doc.querySelector("#view").textContent;
ok(txt.includes("verschoben"), "Badge \u201Everschoben\u201C sichtbar");
// Zukunftsmonat weit voraus
errs.length = 0;
win.UI.go("monat", { month: "2031-03" });
ok(errs.length === 0 && doc.querySelector(".month-label").textContent.includes("März 2031"), "Zukunftsmonat März 2031 funktioniert");
// Vergangenheit
win.UI.go("monat", { month: "2024-01" });
ok(doc.querySelector(".month-label").textContent.includes("Januar 2024"), "Vergangenheit Januar 2024 funktioniert");

console.log("\n== D) Manuelle Felder + Planung ==");
win.UI.go("monat", { month: "2026-06" });
const giroInput = doc.querySelector(".ov-row input"); // erstes Feld = Girokonto
giroInput.value = "2.500,50";
giroInput.dispatchEvent(new win.Event("change", { bubbles: true }));
ok(win.Store.get().months["2026-06"].giro === 2500.5, "Girokonto-Stand 2.500,50 gespeichert", win.Store.get().months["2026-06"].giro);
// Planungseintrag hinzufügen (Karte ist ohne Einträge eingeklappt → erst aufklappen)
let planToggle = [...doc.querySelectorAll(".card-toggle")].find(b => b.textContent.includes("Rücklagen & Sparen"));
if (planToggle.getAttribute("aria-expanded") === "false") planToggle.click();
const addBtn = [...doc.querySelectorAll(".card-toggle-row + .card-body button, .card-body button")].find(b => b.textContent.trim() === "＋ Eintrag");
ok(!!addBtn, "eingeklappte Planungs-Karte lässt sich aufklappen");
addBtn.click();
ok(win.Store.get().months["2026-06"].planned.length === 1, "Planungseintrag angelegt");
const saldoVor = win.Logic.monthCockpit(win.Store.get(), "2026-06").saldo;
win.Store.get().months["2026-06"].planned[0].betrag = -300;
win.Store.commit();
const saldoNach = win.Logic.monthCockpit(win.Store.get(), "2026-06").saldo;
ok(Math.abs((saldoVor - 300) - saldoNach) < 0.001, "Rücklage −300 € fließt in den Saldo ein", saldoVor + " → " + saldoNach);

console.log("\n== E) Inline-Kategorisierung + Regel merken ==");
win.UI.go("monat", { month: "2026-06" });
state = win.Store.get();
const freeTx = state.transactions.find(t => t.effMonat === "2026-06" && !t.match && t.betrag < 0 && t.kategorieId === "sys-ausgabe");
ok(!!freeTx, "unkategorisierte Buchung gefunden: " + (freeTx && freeTx.empfaenger).slice(0, 30));
const sel = [...doc.querySelectorAll("select.select-cat")].find(s => {
  const tr = s.closest("tr");
  return tr && tr.textContent.includes((freeTx.empfaenger || "").slice(0, 15));
});
ok(!!sel, "Kategorie-Dropdown der Buchung gefunden");
sel.value = "freizeit";
sel.dispatchEvent(new win.Event("change", { bubbles: true }));
ok(freeTx.kategorieId === "freizeit" && freeTx.manuelleKat === true, "manuelle Kategorie gesetzt");
const dlg = doc.querySelector("dialog[open]");
ok(!!dlg && dlg.textContent.includes("Regel merken"), "\u201ERegel merken?\u201C-Dialog erscheint");
[...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Regel speichern")).click();
const freizeit = win.Store.get().categories.find(c => c.id === "freizeit");
ok(freizeit.keywords.length > 0, "Regel gespeichert: " + freizeit.keywords[freizeit.keywords.length - 1]);

console.log("\n== F) CSV-Import über die UI-Logik ==");
state = win.Store.get();
const before = state.transactions.length;
const csv = "Buchungstag;Buchungstext;Verwendungszweck;Beguenstigter/Zahlungspflichtiger;Betrag;Waehrung;Info\n" +
  "01.07.2026;KARTENZAHLUNG;Wocheneinkauf;REWE SAGT DANKE;-52,30;EUR;Umsatz gebucht\n" +
  "25.07.2026;GUTSCHRIFT;Lohn - Gehalt Abrechnung 07/2026;meteoviva GmbH;3.430,35;EUR;Umsatz gebucht\n" +
  "28.06.2026;FOLGELASTSCHRIFT;Musik;Spotify AB;-21,99;EUR;Umsatz gebucht\n";
const parsed = win.Logic.parseSparkasseCsv(csv);
let res = win.Logic.dedupeImport(state.transactions, parsed.transactions);
res.added.forEach(t => { t.id = "e2e-" + Math.random(); t.manuelleKat = false; win.Logic.enrichTx(t, state.expected, state.categories); state.transactions.push(t); });
win.Store.commit();
ok(state.transactions.length === before + 3, "3 neue Buchungen importiert");
const gh = state.transactions.find(t => t.id && String(t.id).startsWith("e2e") && t.betrag > 3000);
ok(gh.effMonat === "2026-08" && gh.match, "Juli-Gehalt (25.07.) → effektiv August, gematcht");
// Re-Import derselben Datei
res = win.Logic.dedupeImport(state.transactions, win.Logic.parseSparkasseCsv(csv).transactions);
ok(res.added.length === 0 && res.skipped === 3, "Re-Import: 0 neu / 3 übersprungen (Dedupe, QS-Punkt 5)");

console.log("\n== G) FI-Ansicht live-reaktiv ==");
win.UI.go("fi");
txt = doc.querySelector("#view").textContent;
ok(txt.includes("2042") && txt.includes("45"), "FI-Jahr 2042 / Alter 45 angezeigt");
ok(txt.includes("64.535"), "Haus-EK-Ziel 64.535 € (live aus Hauskauf) angezeigt");
// Hauskauf ändern → FI-Ziel folgt live
win.Store.get().hauskauf.kaufpreis = 400000;
win.Store.commit();
win.UI.go("fi");
const eff = win.__effectiveFi(win.Store.get());
ok(Math.abs(eff.hausEkZiel - win.Logic.runHauskauf(win.Store.get().hauskauf).zielEk * 0.5) < 0.01, "Haus-EK-Ziel folgt Kaufpreis-Änderung live", eff.hausEkZiel);
win.Store.get().hauskauf.kaufpreis = 500000;
win.Store.commit();
// Annahme über Eingabefeld ändern (ETF-Rendite 7 %) → FI-Jahr früher
win.UI.go("fi");
const inputs = [...doc.querySelectorAll("#view label.fld")];
const etfFld = inputs.find(l => l.textContent.includes("ETF-Rendite"));
const etfInp = etfFld.querySelector("input");
etfInp.value = "7";
etfInp.dispatchEvent(new win.Event("change", { bubbles: true }));
const fi7 = win.Logic.runFI(win.__effectiveFi(win.Store.get()));
ok(win.Store.get().fi.etfRendite === 0.07, "Prozentfeld: 7 → 0,07 gespeichert");
ok(fi7.fiJahr < 2042, "FI-Jahr wird mit 7 % Rendite früher: " + fi7.fiJahr);
ok(doc.querySelector("#view").textContent.includes(String(fi7.fiJahr)), "Ansicht zeigt neues FI-Jahr live");
win.Store.get().fi.etfRendite = 0.05; win.Store.commit();
// Tilgungsplan-Jahr hinzufügen (Sektion ist standardmäßig eingeklappt → aufklappen)
win.UI.go("fi");
const tilgToggle = [...doc.querySelectorAll(".card-toggle")].find(b => b.textContent.includes("Tilgungspläne"));
if (tilgToggle.getAttribute("aria-expanded") === "false") tilgToggle.click();
const planCard = [...doc.querySelectorAll(".card")].find(c => c.textContent.includes("Tilgungsplan KfW1"));
const yearInp = planCard.querySelector("input[placeholder='Jahr']");
yearInp.value = "2030";
[...planCard.querySelectorAll("button")].find(b => b.textContent.includes("＋ Jahr")).click();
ok(win.Store.get().fi.kfw1Plan["2030"] === 0, "Tilgungsplan-Jahr 2030 hinzugefügt (editierbare Tabelle statt Code)");
delete win.Store.get().fi.kfw1Plan["2030"]; win.Store.commit();

console.log("\n== H) Szenario-Ansichten zeigen QS-Referenzwerte ==");
win.UI.go("hauskauf");
txt = doc.querySelector("#view").textContent;
ok(txt.includes("3.097,68"), "Hauskauf: Monatsrate 3.097,68 € sichtbar");
ok(txt.includes("129.070"), "Hauskauf: Ziel-EK 129.070 € sichtbar");
ok(txt.includes("2037"), "Hauskauf: frühestes Kaufjahr 2037 sichtbar");
win.UI.go("hochzeit");
txt = doc.querySelector("#view").textContent;
ok(txt.includes("-32,51") || txt.includes("−32,51"), "Hochzeit: \u201EWas bleibt übrig?\u201C −32,51 € sichtbar");
ok(txt.includes("3.709,51"), "Hochzeit: mein Anteil 3.709,51 € sichtbar");
win.UI.go("kinder");
txt = doc.querySelector("#view").textContent;
ok(txt.includes("76.500"), "Kinder: 76.500 € pro Kind sichtbar");
ok(txt.includes("70.762") || txt.includes("70.763"), "Kinder: dein Anteil 70.762,50 € sichtbar");

console.log("\n== I) Posten-Verwaltung wirkt auf Matching ==");
state = win.Store.get();
const strom = state.expected.find(i => i.beschreibung === "Strom");
strom.aktiv = false;
win.Store.commit({ recompute: true });
ok(!state.transactions.some(t => t.itemId === strom.id), "deaktivierter Posten matcht nicht mehr");
strom.aktiv = true;
win.Store.commit({ recompute: true });
ok(state.transactions.some(t => t.itemId === strom.id), "reaktiviert → matcht wieder");

console.log("\n== J) Persistenz + Backup-Zyklus (QS-Punkt 4) ==");
await new Promise(r => setTimeout(r, 500)); // debounce abwarten
const saved = win.localStorage.getItem("finanzplanung.v1");
ok(!!saved && saved.length > 10000, "Zustand in localStorage gespeichert (" + Math.round(saved.length / 1024) + " KB)");
const snapshot = JSON.parse(saved);
ok(snapshot.months["2026-06"].giro === 2500.5, "manuelle Eingabe im gespeicherten Zustand");
// "Backup exportieren" = Zustand als JSON; "Browser-Daten löschen" = frisches jsdom ohne Storage; dann Import
const backupJson = JSON.stringify(Object.assign({}, snapshot, { exportedAt: new Date().toISOString(), app: "Finanzplanung" }));
const fresh = boot(); // leerer Browser
ok(fresh.win.Store.get().transactions.length === 188, "frischer Browser startet wieder mit Seed");
fresh.win.Store.importBackup(JSON.parse(backupJson), "replace");
const s2 = fresh.win.Store.get();
ok(s2.transactions.length === snapshot.transactions.length, "Import: Buchungszahl identisch (" + s2.transactions.length + ")");
ok(s2.months["2026-06"].giro === 2500.5, "Import: manuelle Monatsdaten identisch");
ok(JSON.stringify(s2.fi) === JSON.stringify(snapshot.fi), "Import: FI-Annahmen identisch");
ok(s2.categories.find(c => c.id === "freizeit").keywords.length > 0, "Import: gelernte Kategorie-Regel identisch");
// Reload-Persistenz: zweiter Boot mit vorhandenem Storage
const again = boot({ "finanzplanung.v1": saved });
ok(again.win.Store.get().months["2026-06"].giro === 2500.5, "Reload: Zustand aus localStorage wiederhergestellt");
ok(again.errs.length === 0, "Reload ohne JS-Fehler");

console.log("\n== K) Merge-Import dedupliziert ==");
const s3 = fresh.win.Store.get();
const n3 = s3.transactions.length;
fresh.win.Store.importBackup(JSON.parse(backupJson), "merge");
ok(fresh.win.Store.get().transactions.length === n3, "Merge desselben Backups: keine Duplikate", fresh.win.Store.get().transactions.length);


console.log("\n== L) Neu: Scroll-Erhalt, Übersicht, Zuordnung, Toggles ==");
{
  const fx = boot();
  const w2 = fx.win, d2 = fx.doc;
  // Scroll-Erhalt: window.scrollTo darf beim Feld-Ändern nicht auf 0 springen
  let scrollCalls = [];
  w2.scrollTo = (x, y) => { scrollCalls.push(typeof x === "object" ? x.top : y); };
  w2.UI.go("monat", { month: "2026-06" });
  Object.defineProperty(w2, "scrollY", { value: 850, configurable: true });
  scrollCalls = [];
  const anyNum = d2.querySelector(".ov-row input");
  anyNum.value = "1.000";
  anyNum.dispatchEvent(new w2.Event("change", { bubbles: true }));
  ok(scrollCalls.length > 0 && scrollCalls.every(v => v === 850), "Re-Render stellt Scroll-Position wieder her (kein Sprung nach oben)", JSON.stringify(scrollCalls));
  w2.UI.go("dashboard");
  ok(scrollCalls[scrollCalls.length - 1] === 0, "Navigation scrollt bewusst nach oben");

  // Monatsübersicht: 3 Gruppen + Prognose
  w2.UI.go("monat", { month: "2026-06" });
  const groups = d2.querySelectorAll(".overview .ov-group");
  ok(groups.length === 2, "Monatsübersicht: Konten + Monatsrechnung", groups.length);
  const ovText = d2.querySelector(".overview").textContent;
  ok(ovText.includes("Bisher gebucht") && ovText.includes("Noch offen") && ovText.includes("Monat gesamt"), "Monatsrechnung mit 3 Spalten-Kopf");
  ok(ovText.includes("Einnahmen") && ovText.includes("Fixkosten") && ovText.includes("Rücklagen"), "Kategorien-Zeilen vorhanden");
  ok(ovText.includes("Prognose Girokonto"), "Prognose Girokonto erscheint, sobald Kontostand eingetragen ist");
  // Rechnung aufklappen → Herleitung sichtbar & Summe stimmt
  [...d2.querySelectorAll(".row-expander")].find(b => b.textContent.includes("Rechnung")).click();
  const calc = d2.querySelector(".calc");
  ok(!!calc && calc.textContent.includes("= Prognose Girokonto") && calc.textContent.includes("Girokonto (eingetragen)"), "aufklappbare Rechnung zeigt Herleitung");

  // Posten-Zeile aufklappen → Buchungen sichtbar → Zuordnung lösen
  const st2 = w2.Store.get();
  const gehaltRow = [...d2.querySelectorAll(".row-expander")].filter(b => b.textContent.includes("Bchg."));
  ok(gehaltRow.length === st2.expected.filter(i => i.aktiv).length, "jede Posten-Zeile hat einen Aufklapper");
  const withTx = gehaltRow.find(b => !b.textContent.trim().startsWith("▸ 0"));
  withTx.click();
  const detail = d2.querySelector("tr.item-detail");
  ok(!!detail, "Detail-Zeile mit zugeordneten Buchungen öffnet sich");
  const detach = [...detail.querySelectorAll("button")].find(b => b.textContent.includes("Zuordnung lösen"));
  ok(!!detach, "\u201EZuordnung lösen\u201C-Button vorhanden");
  const istBefore = detail.previousSibling.textContent;
  detach.click();
  ok(fx.errs.length === 0, "Lösen läuft fehlerfrei");
  const overridden = w2.Store.get().transactions.find(t => t.matchOverride === "none");
  ok(!!overridden && overridden.itemId === null, "Buchung ist dauerhaft gelöst (Override gespeichert)");
  // Manuell wieder zuordnen über die Kandidaten-Auswahl
  const exp2 = [...d2.querySelectorAll(".row-expander")].find(b => !b.textContent.trim().startsWith("▸") || true);
  // Zeile des betroffenen Postens öffnen
  const item = w2.Store.get().expected.find(i => w2.Logic.txMatchesItem(overridden, i));
  w2.Store.get().ui.openItems[w2.Store.get().ui.month + "|" + item.id] = true;
  w2.Store.commit(); w2.UI.render();
  const det2 = [...d2.querySelectorAll("tr.item-detail")].find(tr => tr.querySelector(".assign-row"));
  ok(!!det2, "Zuordnen-Auswahl (Kandidaten) wird angeboten");
  const sel2 = det2.querySelector(".assign-row select");
  sel2.value = overridden.id;
  [...det2.querySelectorAll("button")].find(b => b.textContent.includes("Zuordnen")).click();
  const back = w2.Store.get().transactions.find(t => t.id === overridden.id);
  ok(back.matchOverride === item.id && back.itemId === item.id, "manuelles Zuordnen setzt Override auf den Posten");

  // Override übersteht Backup-Zyklus
  const dump = JSON.parse(JSON.stringify(w2.Store.get()));
  const fx2 = boot();
  fx2.win.Store.importBackup(dump, "replace");
  const restored = fx2.win.Store.get().transactions.find(t => t.id === overridden.id);
  ok(restored.matchOverride === item.id, "Override übersteht Export→Import");

  // Toggles: Karte zuklappen → Inhalt weg, Zustand persistiert
  w2.UI.go("monat", { month: "2026-06" });
  const toggle = [...d2.querySelectorAll(".card-toggle")].find(b => b.querySelector(".card-toggle-title").textContent === "Buchungen");
  const nCardsOpen = d2.querySelectorAll(".card .card-body").length;
  toggle.click();
  ok(d2.querySelectorAll(".card .card-body").length === nCardsOpen - 1, "Toggle klappt Karte zu");
  ok(w2.Store.get().ui.collapsed["monat.buchungen"] === true, "Toggle-Zustand wird gespeichert");
  [...d2.querySelectorAll(".card-toggle")].find(b => b.querySelector(".card-toggle-title").textContent === "Buchungen").click();
  ok(d2.querySelectorAll(".card .card-body").length === nCardsOpen, "Toggle klappt wieder auf");
  // FI: Tilgungspläne standardmäßig zu, Annahmen offen
  w2.UI.go("fi");
  const fiToggles = [...d2.querySelectorAll(".card-toggle")];
  const tilg = fiToggles.find(b => b.textContent.includes("Tilgungspläne"));
  ok(tilg.getAttribute("aria-expanded") === "false", "FI: Tilgungspläne standardmäßig eingeklappt");
  ok(fiToggles.find(b => b.textContent.includes("Annahmen")).getAttribute("aria-expanded") === "true", "FI: Annahmen standardmäßig offen");
  ok(fx.errs.length === 0, "keine JS-Fehler in Abschnitt L");
}


console.log("\n== M) Neu: Posten-Aktionen, Planung-Matching, Sortierung ==");
{
  const fm = boot();
  const w3 = fm.win, d3 = fm.doc;
  w3.scrollTo = () => {};
  w3.UI.go("monat", { month: "2026-06" });
  const st3 = w3.Store.get();

  // --- Sortierung der Posten-Tabelle ---
  function typCol() {
    return [...d3.querySelectorAll(".tbl tbody tr:not(.item-detail) select")].map(sel => sel.value).filter(v => ["Einnahme","Fixkosten","Schulden"].includes(v));
  }
  const order = { Einnahme: 0, Fixkosten: 1, Schulden: 2 };
  let typCells = typCol();
  ok(typCells.length >= 17 && typCells.every((v, i) => i === 0 || order[typCells[i-1]] <= order[v]), "Standard: Typ-Spalte aufsteigend sortiert (" + typCells.length + " Zeilen)");
  const typSort = [...d3.querySelectorAll(".th-sort")].find(b => b.textContent.includes("Typ"));
  typSort.click(); // Klick auf aktive Spalte dreht um
  typCells = typCol();
  ok(typCells.every((v, i) => i === 0 || order[typCells[i-1]] >= order[v]), "Klick dreht die Sortierung um (absteigend)");
  const sollSort = [...d3.querySelectorAll(".th-sort")].find(b => b.textContent.includes("Erwartet"));
  sollSort.click();
  ok(w3.Store.get().ui.postenSort.key === "soll", "Sortierung nach Betrag wird gespeichert");

  // --- Erwarteten Betrag & Typ inline ändern ---
  const strom = st3.expected.find(i => i.beschreibung === "Strom");
  const stromRow = [...d3.querySelectorAll(".tbl tbody tr")].find(tr => tr.textContent.includes("Strom") && tr.textContent.includes("Stadtwerke"));
  const sollInp = stromRow.querySelectorAll("input")[0];
  sollInp.value = "-80";
  sollInp.dispatchEvent(new w3.Event("change", { bubbles: true }));
  ok(w3.Store.get().expected.find(i => i.beschreibung === "Strom").betrag === -80, "erwarteter Betrag inline editierbar (−76 → −80)");
  const stromRow2 = [...d3.querySelectorAll(".tbl tbody tr")].find(tr => tr.textContent.includes("Strom") && tr.textContent.includes("Stadtwerke"));
  const typSel2 = stromRow2.querySelector("select");
  typSel2.value = "Schulden";
  typSel2.dispatchEvent(new w3.Event("change", { bubbles: true }));
  ok(w3.Store.get().expected.find(i => i.beschreibung === "Strom").typ === "Schulden", "Typ inline umdeklarierbar (Fixkosten → Schulden)");
  typSel2Reset(); function typSel2Reset(){ const it = w3.Store.get().expected.find(i => i.beschreibung === "Strom"); it.typ = "Fixkosten"; it.betrag = -76; w3.Store.commit({recompute:true}); w3.UI.render(); }

  // --- Buchung → Dialog: neuen wiederkehrenden Posten anlegen ---
  const freeTx = w3.Store.get().transactions.find(t => t.effMonat === "2026-06" && !t.match && t.betrag < 0 && (t.empfaenger||"").includes("OERAG") === false && t.empfaenger);
  const nExpBefore = w3.Store.get().expected.length;
  // Dialog direkt über den ⇄-Button in der Buchungsliste öffnen
  const rowBtn = [...d3.querySelectorAll("button")].find(b => b.textContent.includes("⇄ Posten") && b.closest("tr") && b.closest("tr").textContent.includes((freeTx.empfaenger||"").slice(0,15)));
  ok(!!rowBtn, "⇄-Button in der Buchungszeile vorhanden");
  rowBtn.click();
  const dlg1 = d3.querySelector("dialog[open]");
  ok(!!dlg1 && dlg1.textContent.includes("neu als wiederkehrenden Posten"), "Zuordnen-Dialog mit \u201Eneuer Posten\u201C-Sektion öffnet sich");
  [...dlg1.querySelectorAll("button")].find(b => b.textContent.includes("Posten anlegen")).click();
  const st4 = w3.Store.get();
  ok(st4.expected.length === nExpBefore + 1, "neuer wiederkehrender Posten angelegt");
  const newItem = st4.expected[st4.expected.length - 1];
  const linkedTx = st4.transactions.find(t => t.id === freeTx.id);
  ok(linkedTx.itemId === newItem.id && linkedTx.match === true, "Buchung ist dem neuen Posten fest zugeordnet");
  ok(d3.querySelector("#view").textContent.includes(newItem.beschreibung), "neuer Posten erscheint in \u201EErwartete Posten\u201C");
  // Neuer Posten taucht auch im Folgemonat auf (wiederkehrend)
  w3.UI.go("monat", { month: "2026-09" });
  ok(d3.querySelector("#view").textContent.includes(newItem.beschreibung), "… und in zukünftigen Monaten");
  w3.UI.go("monat", { month: "2026-06" });

  // --- Buchung → Dialog: bestehendem Posten zuordnen ---
  const freeTx2 = w3.Store.get().transactions.find(t => t.effMonat === "2026-06" && !t.match && t.betrag < 0);
  const rowBtn2 = [...d3.querySelectorAll("button")].find(b => b.textContent.includes("⇄ Posten"));
  rowBtn2.click();
  const dlg2 = d3.querySelector("dialog[open]");
  const dlgSel = dlg2.querySelector("select");
  const targetItem = w3.Store.get().expected.find(i => i.aktiv && i.betrag < 0);
  dlgSel.value = targetItem.id;
  [...dlg2.querySelectorAll("button")].find(b => b.textContent.trim() === "Zuordnen").click();
  ok(w3.Store.get().transactions.some(t => t.matchOverride === targetItem.id), "Zuordnung zu bestehendem Posten über den Dialog");

  // --- Posten deaktivieren aus dem Cockpit heraus ---
  const exp0 = [...d3.querySelectorAll(".row-expander")].filter(b => b.textContent.includes("Bchg."))[0];
  exp0.click();
  const deacBtn = [...d3.querySelectorAll("tr.item-detail button")].find(b => b.textContent.includes("Kein Posten mehr"));
  ok(!!deacBtn, "\u201EKein Posten mehr\u201C-Aktion in der Detail-Zeile");
  const activeBefore = w3.Store.get().expected.filter(i => i.aktiv).length;
  deacBtn.click();
  const confirmDlg = [...d3.querySelectorAll("dialog[open]")].pop();
  [...confirmDlg.querySelectorAll("button")].find(b => b.textContent.includes("Deaktivieren")).click();
  ok(w3.Store.get().expected.filter(i => i.aktiv).length === activeBefore - 1, "Posten deaktiviert → verschwindet aus der Liste");

  // --- Planung: getrennte Blöcke + erledigt/verknüpft ---
  const md6 = w3.Store.monthData("2026-06");
  md6.planned = [
    { id: "pm1", beschreibung: "ETF-Sparplan", typ: "ruecklage", betrag: -400, erledigt: false, txId: null },
    { id: "pm2", beschreibung: "Steuererstattung", typ: "einnahme", betrag: 250, erledigt: false, txId: null }
  ];
  w3.Store.commit(); w3.UI.render();
  const titles = [...d3.querySelectorAll(".card-toggle-title")].map(t => t.textContent);
  ok(titles.includes("Rücklagen & Sparen") && titles.includes("Zusatzeinnahmen") && titles.includes("Zusatzausgaben"), "Planung in drei getrennten Blöcken (Rücklagen | Zusatzeinnahmen | Zusatzausgaben)");
  function cardByTitle(t) {
    return [...d3.querySelectorAll(".card")].find(cd => { const x = cd.querySelector(".card-toggle-title"); return x && x.textContent === t; });
  }
  function inputValues(card) { return [...card.querySelectorAll("input")].map(i => i.value); }
  const rueckCard = cardByTitle("Rücklagen & Sparen");
  const geplCard = cardByTitle("Zusatzeinnahmen");
  ok(inputValues(rueckCard).includes("ETF-Sparplan") && !inputValues(rueckCard).includes("Steuererstattung"), "Rücklage liegt im Rücklagen-Block");
  ok(inputValues(geplCard).includes("Steuererstattung") && !inputValues(geplCard).includes("ETF-Sparplan"), "Zusatzeinnahme liegt im eigenen Block, getrennt von Zusatzausgaben");
  let c6 = w3.Logic.monthCockpit(w3.Store.get(), "2026-06");
  ok(c6.plan.offenRuecklage === -400 && c6.plan.offenEinnahme === 250, "Aufteilung nach Typ in der Monatsrechnung");
  const saldoBisher0 = c6.saldoBisher;
  // Rücklage manuell als erledigt markieren → wandert von "offen" nach "bisher"
  const chk = rueckCard.querySelector("input[type=checkbox]");
  chk.checked = true;
  chk.dispatchEvent(new w3.Event("change", { bubbles: true }));
  c6 = w3.Logic.monthCockpit(w3.Store.get(), "2026-06");
  ok(c6.plan.offenRuecklage === 0 && Math.abs(c6.plan.erledigtIstSum - (-400)) < 0.01, "erledigt (manuell) → zählt zu \u201EBisher gebucht\u201C");
  ok(Math.abs(c6.saldoBisher - (saldoBisher0 - 400)) < 0.01, "Saldo bisher enthält die erledigte Rücklage");
  ok(Math.abs(c6.prognoseSaldo - (c6.saldoBisher + c6.offenGesamt)) < 0.01, "Prognose bleibt konsistent (keine Doppelzählung)");
  // Geplante Einnahme mit Bankbuchung verknüpfen → zählt NICHT doppelt
  const progBefore = c6.prognoseSaldo;
  const linkSel = geplCard.querySelector("select option[value='']") ? [...geplCard.querySelectorAll("select")].find(sl => sl.options[0].textContent.includes("Bankbuchung")) : null;
  const anyIncomeTx = w3.Store.get().transactions.find(t => t.effMonat === "2026-06" && t.betrag > 0);
  linkSel.value = anyIncomeTx.id;
  linkSel.dispatchEvent(new w3.Event("change", { bubbles: true }));
  const pm2 = w3.Store.monthData("2026-06").planned.find(p => p.id === "pm2");
  ok(pm2.erledigt === true && pm2.txId === anyIncomeTx.id, "Planungseintrag mit Bankbuchung verknüpft");
  c6 = w3.Logic.monthCockpit(w3.Store.get(), "2026-06");
  ok(Math.abs(c6.plan.erledigtIstSum - (-400)) < 0.01 && c6.plan.erledigtBankCount === 1, "per Bank erledigt → zählt nicht doppelt (Bankbuchung steckt schon in den Einnahmen)");
  ok(Math.abs(c6.prognoseSaldo - (progBefore - 250)) < 0.01, "Prognose sinkt exakt um den nicht mehr offenen Planbetrag");
  ok(d3.querySelector("#view").textContent.includes("per Bank gebucht"), "Verknüpfung wird im Block angezeigt");
  // Verknüpfung übersteht Backup
  const dump3 = JSON.parse(JSON.stringify(w3.Store.get()));
  const fm2 = boot();
  fm2.win.Store.importBackup(dump3, "replace");
  const pm2r = fm2.win.Store.get().months["2026-06"].planned.find(p => p.id === "pm2");
  ok(pm2r.erledigt === true && pm2r.txId === anyIncomeTx.id, "Planungs-Verknüpfung übersteht Export→Import");
  ok(fm.errs.length === 0, "keine JS-Fehler in Abschnitt M");
}


console.log("\n== N) Neu: Saldo (alle Konten), Dashboard-Umbau, FI-Redesign ==");
{
  const fn = boot();
  const w4 = fn.win, d4 = fn.doc;
  w4.scrollTo = () => {};
  const cur = w4.U.currentMonth();
  const mdc = w4.Store.monthData(cur);
  mdc.giro = 2745.58; mdc.konto2 = 2.31; mdc.kkSaldo = -987.5;
  w4.Store.commit();

  // --- Saldo (alle Konten) im Monatscockpit ---
  w4.UI.go("monat", { month: cur });
  const cN = w4.Logic.monthCockpit(w4.Store.get(), cur);
  ok(Math.abs(cN.prognoseGesamt - (cN.prognoseGiro + 2.31 - 987.5)) < 0.01, "Saldo = Prognose Giro + 2. Konto + Kreditkarte", cN.prognoseGesamt);
  const ovT = d4.querySelector(".overview").textContent;
  ok(!ovT.includes("Verfügbar gesamt"), "\u201EVerfügbar gesamt\u201C entfernt");
  ok(ovT.includes("Prognose Girokonto") && ovT.includes("Saldo"), "neue Saldo-Zeile unter Prognose Girokonto");
  [...d4.querySelectorAll(".row-expander")].find(b => b.textContent.includes("Rechnung")).click();
  const calcT = d4.querySelector(".calc").textContent;
  ok(calcT.includes("= Saldo (alle Konten)") && calcT.includes("2. Konto") && calcT.includes("Kreditkarte"), "Rechnung führt bis zum Gesamt-Saldo weiter");

  // --- Dashboard: Kacheln, Kopfrechnung, Saldo ---
  w4.UI.go("dashboard");
  let dashT = d4.querySelector("#view").textContent;
  ok(!!d4.querySelector(".dash-hero-num"), "Dashboard: Saldo-Hero steht allein");
  ok(d4.querySelector(".dash-hero-num").textContent === w4.U.eur(cN.prognoseGesamt), "Dashboard-Saldo = Cockpit-Saldo (" + w4.U.eur(cN.prognoseGesamt) + ")");
  // Neue Vokabular- und Struktur-Prüfung: zwei Fluss-Gruppen statt 9 gleichrangiger Kacheln
  ok(dashT.includes("kommt noch dazu") && dashT.includes("geht noch ab"), "Fluss-Gruppen \u201Ekommt dazu\u201C / \u201Egeht ab\u201C vorhanden");
  ["Erwartete Einnahmen", "Zusatzeinnahmen", "Erwartete Fixkosten", "Erwartete Raten/Kredite", "Zusatzausgaben", "Rücklagen geplant"].forEach(tl =>
    ok(dashT.includes(tl), "Fluss-Zeile \u201E" + tl + "\u201C vorhanden (neues Vokabular)"));
  ok(!dashT.includes("Geplante Einnahmen") && !dashT.includes("Geplante Ausgaben"), "alte mehrdeutige Bezeichnung \u201EGeplante Einnahmen/Ausgaben\u201C verschwunden");
  // Neue "Bisher ausgegeben"-Kachel mit Prozent-Anteil variabel statt reiner "Variable Ausgaben"-Kachel
  const ausgTile = [...d4.querySelectorAll(".mini-card")].find(k => k.textContent.includes("Bisher ausgegeben"));
  ok(!!ausgTile && /€/.test(ausgTile.querySelector(".mini-num").textContent), "\u201EBisher ausgegeben\u201C-Kachel zeigt einen Betrag");
  ok(/%\s*variabel/.test(ausgTile.textContent), "… und den variablen Anteil in %");
  const cc4 = w4.Logic.monthCockpit(w4.Store.get(), cur);
  const bisherAusg4 = Math.round((cc4.fixIst + cc4.schuldIst + cc4.variableSum) * 100) / 100;
  const pct4 = bisherAusg4 !== 0 ? Math.round((cc4.variableSum / bisherAusg4) * 100) : 0;
  ok(ausgTile.textContent.includes(pct4 + " %"), "Prozentsatz korrekt berechnet (" + pct4 + " %)");
  [...d4.querySelectorAll(".row-expander")].find(b => b.textContent.includes("Wie setzt sich der Saldo")).click();
  const dc = d4.querySelector(".calc");
  ok(!!dc && dc.textContent.includes("= Saldo Monatsende") && dc.textContent.includes("Girokonto"), "Kopfrechnung im Dashboard aufklappbar");
  // Konsistenz: Summe der Rechnungszeilen = Saldo
  ok(dc.textContent.includes(w4.U.eur(cN.prognoseGesamt)), "Rechnung endet exakt beim Saldo");

  // --- Zukunftsmonate wie Excel ---
  dashT = d4.querySelector("#view").textContent;
  const nextYearDec = (parseInt(cur.slice(0,4),10) + 1);
  ok(dashT.includes("Dez " + String(nextYearDec).slice(2)), "Monatstabelle reicht bis Dez " + nextYearDec + " (wie Excel)");
  const rows4 = [...d4.querySelectorAll(".tbl tbody tr")];
  const futureRow = rows4.find(tr => tr.textContent.includes("Prognose") && tr.textContent.includes("Okt"));
  ok(!!futureRow, "Zukunftsmonate als \u201EPrognose\u201C markiert");
  const cOct = w4.Logic.monthCockpit(w4.Store.get(), cur.slice(0,4) + "-10");
  ok(Math.abs((cOct.einnahmenSum + cOct.restEin + cOct.plan.offenEinnahme) - 3968.35) < 0.01, "Zukunftsmonat zeigt erwartete Einnahmen 3.968,35 (wie Excel)");
  ok(futureRow.textContent.includes("3.968,35"), "… und die Tabelle zeigt sie an");

  // --- Zeitraum anpassen + Monat ausblenden ---
  w4.Store.get().ui.dashFrom = cur; w4.Store.get().ui.dashTo = cur.slice(0,4) + "-12";
  w4.Store.commit(); w4.UI.render();
  let monthBtns = [...d4.querySelectorAll(".tbl tbody tr")].length;
  const expected = 12 - parseInt(cur.slice(5,7),10) + 1;
  ok(monthBtns === expected, "Zeitraum-Filter greift (" + monthBtns + " Monate)", monthBtns + "≠" + expected);
  [...d4.querySelectorAll("button[title*='ausblenden']")][0].click();
  ok([...d4.querySelectorAll(".tbl tbody tr")].length === expected - 1, "Monat per 👁 ausgeblendet");
  const showBtn = [...d4.querySelectorAll("button")].find(b => b.textContent.includes("ausgeblendete"));
  ok(!!showBtn, "Hinweis auf ausgeblendete Monate mit Wieder-Einblenden");
  showBtn.click();
  ok([...d4.querySelectorAll(".tbl tbody tr")].length === expected, "alle Monate wieder da");
  w4.Store.get().ui.dashFrom = null; w4.Store.get().ui.dashTo = null; w4.Store.commit();

  // --- FI-Redesign ---
  w4.UI.go("fi");
  let fiT = d4.querySelector("#view").textContent;
  ok(fiT.includes("Die 4 %-Regel"), "4 %-Regel wird mit Live-Zahlen erklärt");
  ok(fiT.includes("So verteilt sich dein Geld"), "Wasserfall-Karte vorhanden");
  ok(d4.querySelectorAll("#view .fi-group").length === 8, "Annahmen in 8 Gruppen: Basis + Pflicht + 6 nummerierte Verteilungs-Schritte", d4.querySelectorAll("#view .fi-group").length);
  ok([...d4.querySelectorAll(".prio-badge")].map(b => b.textContent).join("|").includes("FIX RESERVIERT") && d4.querySelector("#view").textContent.includes("BIS ZIEL"), "Prioritäts-Badges (fix reserviert / bis Ziel / Rest) sichtbar");
  ok(d4.querySelectorAll("#view .fi-group .step-num").length === 6, "Schritt-Nummern 1–6 in den Annahmen (gleiche wie im Wasserfall)");
  ok(d4.querySelectorAll("#view .step-status").length === 6, "jeder Schritt zeigt eine Live-Zuteilungszeile");
  let fiText4 = d4.querySelector("#view").textContent;
  ok(fiText4.includes("fließen hier 2026 rein"), "Live-Zeilen beziehen sich auf das Wasserfall-Jahr (2026)");
  ok(fiText4.includes("Schritte 1–4 haben Vorrang") || fiText4.includes("gekappt"), "erklärt, warum der Notgroschen 2026 leer ausgeht (Vorrang)");
  ok(fiText4.includes("füllt sich ab 2028"), "… und ab wann er sich füllt");
  // Jahr im Wasserfall wechseln → Live-Zeilen folgen
  const ysel4 = [...d4.querySelectorAll(".card-toggle-row select")].find(sl => sl.options[0] && /^20\d\d$/.test(sl.options[0].textContent));
  ysel4.value = "2032"; ysel4.dispatchEvent(new w4.Event("change", { bubbles: true }));
  fiText4 = d4.querySelector("#view").textContent;
  ok(fiText4.includes("fließen hier 2032 rein"), "Jahreswechsel aktualisiert die Schritt-Zeilen");
  ok(fiText4.includes("Ziel erreicht seit 2031"), "Notgroschen 2032: \u201EZiel erreicht seit 2031\u201C");
  ok(fiText4.includes("KfW1 ist seit 2028 getilgt"), "Sondertilgung 2032: \u201Eseit 2028 getilgt, Schritt entfällt\u201C");
  ysel4.value = "2028"; ysel4.dispatchEvent(new w4.Event("change", { bubbles: true }));
  ok(d4.querySelectorAll(".wf-row").length >= 9, "Wasserfall mit Einnahmen→Frei→Verteilung");
  // Wasserfall-Konsistenz: Verteilung summiert sich zu \u201EFrei\u201C
  const fiRes = w4.Logic.runFI(w4.__effectiveFi(w4.Store.get()));
  const y0 = fiRes.years[0];
  const allocSum = y0.allocLebensqual + y0.allocSonder + y0.allocAutoKind + y0.allocHausEk + y0.allocNotgroschen + y0.allocEtf;
  ok(Math.abs(allocSum - y0.frei) < 0.01, "Verteilung summiert sich exakt zum freien Betrag (" + allocSum.toFixed(2) + ")");
  // Jahr wechseln → Wasserfall aktualisiert
  const ysel = [...d4.querySelectorAll(".card-toggle-row select")].find(sl => sl.options[0] && /^20\d\d$/.test(sl.options[0].textContent));
  ysel.value = "2028";
  ysel.dispatchEvent(new w4.Event("change", { bubbles: true }));
  ok(d4.querySelector("#view").textContent.includes("Jahr 2028"), "Jahres-Auswahl aktualisiert den Wasserfall");
  // Chips: Serien zu-/abschalten
  const chips = () => [...d4.querySelectorAll(".chip")];
  const strokesBefore = d4.querySelectorAll(".chart-line .stroke").length;
  chips().find(ch => ch.textContent.includes("Restschulden")).click();
  ok(d4.querySelectorAll(".chart-line .stroke").length === strokesBefore + 1, "Chip schaltet zusätzliche Linie ein");
  chips().find(ch => ch.textContent.includes("ETF")).click();
  ok(d4.querySelectorAll(".chart-line .stroke").length === strokesBefore, "Chip schaltet Linie wieder aus");
  ok(w4.Store.get().ui.fiSeries.schulden === true, "Serien-Auswahl wird gespeichert");
  // Gestapelte Verteilung + Gruppen-Tabellenkopf
  ok(!!d4.querySelector(".chart-bars"), "Verteilungs-Chart (gestapelt) vorhanden");
  // Jahresplan: Kompakt ist Standard, Detail zeigt gruppierten Kopf
  ok(!d4.querySelector(".tbl-grouprow"), "Jahresplan startet im Kompakt-Modus");
  [...d4.querySelectorAll(".chip")].find(c => c.textContent === "Alle Spalten").click();
  ok(d4.querySelector(".tbl-grouprow").textContent.includes("VERTEILUNG"), "Detail-Modus mit gruppiertem, farbigem Kopf");
  [...d4.querySelectorAll(".chip")].find(c => c.textContent === "Kompakt").click();
  ok(!d4.querySelector(".tbl-grouprow") && w4.Store.get().ui.fiTableMode === "kompakt", "zurück zu Kompakt, Wahl gespeichert");
  ok(fn.errs.length === 0, "keine JS-Fehler in Abschnitt N");
}


console.log("\n== O) Neu: Feld-Typen, Was-wäre-wenn, Urlaub abhaken, Rücklagen-Schnelleintrag ==");
{
  const fo = boot();
  const w5 = fo.win, d5 = fo.doc;
  w5.scrollTo = () => {};

  // --- Jahre ohne Tausenderpunkt ---
  w5.UI.go("fi");
  const startjahrFld = [...d5.querySelectorAll("#view label.fld")].find(l => l.textContent.includes("Startjahr"));
  ok(startjahrFld.querySelector("input").value === "2026", "Startjahr als 2026 (nicht 2.026)", startjahrFld.querySelector("input").value);
  // Tilgungsplan-Auswirkung
  const tilgToggleO = [...d5.querySelectorAll(".card-toggle")].find(b => b.textContent.includes("Tilgungspläne"));
  ok(tilgToggleO.textContent.includes("KfW1 getilgt 2028") && tilgToggleO.textContent.includes("KfW2 getilgt 2029"), "Tilgungspläne zeigen die Auswirkung (Tilgungsjahre) schon im Titel");
  tilgToggleO.click();
  ok(d5.querySelector("#view").textContent.includes("So wirken die Pläne"), "Erklärung, wie Pläne in Wasserfall & Jahresplan einfließen");

  // --- Hauskauf: Feld-Typen, Kacheln, Verknüpfung, Charts, Tooltips ---
  w5.UI.go("hauskauf");
  const hv = d5.querySelector("#view");
  ok(hv.querySelectorAll(".fld-fix").length >= 2, "gesetzliche Felder (🔒) eigen gestylt", hv.querySelectorAll(".fld-fix").length);
  ok(hv.querySelectorAll(".fld-schaetzung").length >= 3, "Schätzwert-Felder (💡) gestrichelt");
  const fixFld = hv.querySelector(".fld-fix input");
  fixFld.value = "6";
  fixFld.dispatchEvent(new w5.Event("change", { bubbles: true }));
  ok(Math.abs(w5.Store.get().hauskauf.grunderwerbSatz - 0.06) < 0.0001, "… bleiben trotzdem editierbar");
  w5.Store.get().hauskauf.grunderwerbSatz = 0.065; w5.Store.commit(); w5.UI.render();
  const eyebrows = [...d5.querySelectorAll("#view .figure-row .eyebrow")].map(e => e.textContent);
  ok(eyebrows.some(t => t.includes("EK-Sparrate")) && !eyebrows.some(t => t.includes("Monatsrate")), "Kachel: EK-Sparrate ersetzt Monatsrate");
  ok(d5.querySelectorAll("#view tr.res-tint").length >= 14, "Ergebnis-Zeilen farblich an Eingabe-Gruppen gekoppelt");
  const zinsFld = [...d5.querySelectorAll("#view label.fld")].find(l => l.textContent.includes("Zinssatz"));
  ok((zinsFld.getAttribute("title") || "").includes("Sollzins"), "Hover-Erklärtext am Zins-Feld");
  ok(d5.querySelector("#view").textContent.includes("Was-wäre-wenn"), "Was-wäre-wenn-Karte vorhanden");
  // interaktiver Explorer: Faktoren als Linien zuschaltbar, Achse in Jahren
  const wiCard = [...d5.querySelectorAll(".card")].find(c => c.textContent.includes("Was-wäre-wenn"));
  let strokes = () => wiCard.querySelectorAll(".chart-line .stroke").length;
  ok(strokes() === 2, "Standard: 2 Faktor-Linien (EK-Sparrate + Kaufpreis)", strokes());
  const axisYears = [...wiCard.querySelectorAll(".chart-line .axis")].map(t => t.textContent);
  ok(axisYears.some(t => /^20\d\d$/.test(t)), "y-Achse zeigt Jahreszahlen (2032 statt \u201E2k\u201C)", axisYears.join(","));
  ok(!axisYears.some(t => t.includes("€")), "… und keine €-Werte");
  const hoverTitles = [...wiCard.querySelectorAll(".chart-line title")].map(t => t.textContent);
  ok(hoverTitles.some(t => /Kaufjahr 20\d\d/.test(t) && !/Kaufjahr .*€/.test(t)), "Hover: \u201EKaufjahr 2039\u201C statt €-Format");
  ok(hoverTitles.some(t => t.includes("Kaufpreis") && t.includes("→")), "Hover nennt konkreten Faktor-Wert");
  // Faktor zuschalten
  [...wiCard.querySelectorAll(".chip")].find(c => c.textContent.includes("Zinssatz")).click();
  const wiCard2 = [...d5.querySelectorAll(".card")].find(c => c.textContent.includes("Was-wäre-wenn"));
  ok(wiCard2.querySelectorAll(".chart-line .stroke").length === 3, "Faktor-Chip schaltet dritte Linie zu");
  ok(w5.Store.get().ui.hkFactors.zins === true, "Faktor-Auswahl wird gespeichert");
  // Metrik wechseln → Monatsrate: Zins-Linie steigt, Sparrate-Linie flach
  [...wiCard2.querySelectorAll(".chip")].find(c => c.textContent === "Monatsrate").click();
  const wiCard3 = [...d5.querySelectorAll(".card")].find(c => c.textContent.includes("Was-wäre-wenn"));
  const hov3 = [...wiCard3.querySelectorAll(".chart-line title")].map(t => t.textContent);
  ok(hov3.some(t => t.includes("Monatsrate") && t.includes("€")), "Metrik-Wechsel auf Monatsrate wirkt");
  ok(wiCard3.textContent.includes("+10 %"), "Legende zeigt Hebelwirkung (±10 %) je Faktor");
  // Bereich dynamisch: Kaufpreis ändern → \u201Eheute\u201C-Wert in Legende folgt
  w5.Store.get().hauskauf.kaufpreis = 600000; w5.Store.commit(); w5.UI.render();
  const wiCard4 = [...d5.querySelectorAll(".card")].find(c => c.textContent.includes("Was-wäre-wenn"));
  ok(wiCard4.textContent.includes("600.000"), "Wertebereich/Legende folgen dem aktuellen Kaufpreis dynamisch");
  w5.Store.get().hauskauf.kaufpreis = 500000; w5.Store.get().ui.hkMetric = "kaufjahr"; w5.Store.commit(); w5.UI.render();
  // Sensitivität stimmt: Sparrate 2000 → früheres Kaufjahr als bei 1000
  const kjBei = (sp) => { const hh = JSON.parse(JSON.stringify(w5.Store.get().hauskauf)); hh.ekSparrate = sp; return w5.Logic.runHauskauf(hh).kaufjahr; };
  ok(kjBei(2000) < kjBei(1000), "höhere Sparrate → früheres Kaufjahr (" + kjBei(2000) + " < " + kjBei(1000) + ")");

  // --- Hochzeit: Positionen abhaken ---
  w5.UI.go("hochzeit");
  let ht = d5.querySelector("#view").textContent;
  ok(ht.includes("2.323,00"), "Noch zu zahlen = 2.323,00 (Flug + Auto bereits abgehakt)");
  ok(ht.includes("-32,51") || ht.includes("−32,51"), "Budget-Rest weiterhin −32,51 (Referenz hält)");
  const hotelRow = [...d5.querySelectorAll("#view tr")].find(tr => [...tr.querySelectorAll("input")].some(i => i.value === "Hotels"));
  const chk5 = hotelRow.querySelector("input[type=checkbox]");
  chk5.checked = true;
  chk5.dispatchEvent(new w5.Event("change", { bubbles: true }));
  const wRes = w5.Logic.runHochzeit(w5.Store.get().hochzeit);
  ok(Math.abs(wRes.urlaubOffen - 1100) < 0.01, "Hotels abgehakt → noch zu zahlen 1.100,00", wRes.urlaubOffen);
  ok(Math.abs(wRes.rest - (6000 - wRes.anteil - 1100)) < 0.01, "Budget-Rest rechnet mit dem neuen offenen Betrag");
  ok(Math.abs(wRes.urlaubTotal - 2678.62) < 0.02, "TOTAL bleibt unverändert (nur \u201Eoffen\u201C ändert sich)");
  const hotelChk2 = [...d5.querySelectorAll("#view tr")].find(tr => [...tr.querySelectorAll("input")].some(i => i.value === "Hotels")).querySelector("input[type=checkbox]");
  hotelChk2.checked = false; hotelChk2.dispatchEvent(new w5.Event("change", { bubbles: true }));

  // --- Dashboard: Rücklagen-Schnelleintrag ---
  w5.UI.go("dashboard");
  const cur5 = w5.U.currentMonth();
  const rQuick = d5.querySelector(".flow-quickadd");
  ok(!!rQuick, "Rücklagen-Schnelleintrag im Dashboard erhalten (nicht durch den Hero-Umbau verloren)");
  const rInp = rQuick.querySelector("input");
  rInp.value = "400";
  rQuick.querySelector("button").click();
  const pl5 = w5.Store.get().months[cur5].planned;
  ok(pl5.length === 1 && pl5[0].typ === "ruecklage" && pl5[0].betrag === -400, "Rücklage aus dem Dashboard in die Monats-Planung geschrieben");
  ok(d5.querySelector("#view").textContent.includes(w5.U.eur(-400)), "Kachel zeigt den neuen Wert sofort");
  w5.UI.go("monat", { month: cur5 });
  ok([...d5.querySelectorAll("#view input")].some(i => i.value === "Rücklage (aus Dashboard)"), "… und erscheint im Monat unter Rücklagen & Sparen");
  ok(fo.errs.length === 0, "keine JS-Fehler in Abschnitt O");
}


console.log("\n== P) Depot-Tracker im Dashboard ==");
{
  const fp = boot();
  const w6 = fp.win, d6 = fp.doc;
  w6.scrollTo = () => {};
  w6.UI.go("dashboard");
  const depCard = [...d6.querySelectorAll(".card")].find(c => c.textContent.includes("Depot-Tracker"));
  ok(!!depCard, "Depot-Tracker-Karte vorhanden");
  ok([...depCard.querySelectorAll("input")].some(i => i.value === "Trade Republic"), "Name \u201ETrade Republic\u201C (editierbar)");
  ok(depCard.textContent.includes("9.299") && depCard.textContent.includes("8.300") && depCard.textContent.includes("999"),
    "Default: 9.299 € in 5 Jahren (8.300 eingezahlt + 999 Zins)");
  ok(depCard.querySelectorAll(".chart-line .stroke").length === 2, "Chart: Depotwert + Eingezahlt-Linie");
  // Zeitraum & Zins editierbar → Wert reagiert
  const jahreFld = [...depCard.querySelectorAll("label.fld")].find(l => l.textContent.includes("Zeitraum"));
  ok(jahreFld.querySelector("input").value === "5", "Zeitraum als 5 (plain, kein €)");
  jahreFld.querySelector("input").value = "10";
  jahreFld.querySelector("input").dispatchEvent(new w6.Event("change", { bubbles: true }));
  ok(w6.Store.get().depot.jahre === 10, "Zeitraum auf 10 Jahre gespeichert");
  const r10 = w6.Logic.runDepot(w6.Store.get().depot);
  const depCard2 = [...d6.querySelectorAll(".card")].find(c => c.textContent.includes("Depot-Tracker"));
  ok(depCard2.textContent.includes(w6.U.eur(r10.endwert, { ganz: true })), "Endwert reagiert live auf den Zeitraum (" + w6.U.eur(r10.endwert, { ganz: true }) + ")");
  const zinsFld = [...depCard2.querySelectorAll("label.fld")].find(l => l.textContent.includes("Rendite"));
  zinsFld.querySelector("input").value = "7";
  zinsFld.querySelector("input").dispatchEvent(new w6.Event("change", { bubbles: true }));
  ok(w6.Store.get().depot.zins === 0.07, "Zinssatz 7 → 0,07 gespeichert");
  const r7 = w6.Logic.runDepot(w6.Store.get().depot);
  ok(r7.endwert > r10.endwert, "höherer Zins → höherer Endwert");
  const startFld = [...[...d6.querySelectorAll(".card")].find(c => c.textContent.includes("Depot-Tracker")).querySelectorAll("label.fld")].find(l => l.textContent.includes("Startwert"));
  startFld.querySelector("input").value = "2.500";
  startFld.querySelector("input").dispatchEvent(new w6.Event("change", { bubbles: true }));
  ok(w6.Store.get().depot.start === 2500, "Startwert mit deutschem Format eintragbar");
  // übersteht Backup
  const dmp = JSON.parse(JSON.stringify(w6.Store.get()));
  const fp2 = boot();
  fp2.win.Store.importBackup(dmp, "replace");
  ok(fp2.win.Store.get().depot.jahre === 10 && fp2.win.Store.get().depot.start === 2500, "Depot-Einstellungen überstehen Export→Import");
  ok(fp.errs.length === 0, "keine JS-Fehler in Abschnitt P");
}


console.log("\n== Q) Handy-Version (mobile/index.html) ==");
{
  const fq = boot(null, mobileHtml);
  const w7 = fq.win, d7 = fq.doc;
  w7.scrollTo = () => {};
  ok(fq.errs.length === 0, "mobile Build startet ohne JS-Fehler");
  ok(w7.APP_MODE === "mobile", "APP_MODE = mobile");
  ok(w7.Store.get().transactions.length === 188, "gleiche Codebasis: Seed-Daten identisch");

  // Budget-Panel ganz oben im Dashboard
  const view7 = d7.querySelector("#view");
  const panel = view7.querySelector(".budget-panel");
  ok(!!panel, "Budget-Panel vorhanden");
  ok(view7.querySelector(".card") === panel || view7.children[1] === panel || panel.previousElementSibling.classList.contains("page-head"), "… ganz oben (direkt unter der Überschrift)");
  ok(panel.textContent.includes(w7.U.monthLabel(w7.U.currentMonth())), "Monat vorausgewählt: aktueller Monat");

  // Kontostände eintragen → landen in den Monatswerten, Saldo erscheint
  const cur7 = w7.U.currentMonth();
  const kontoInputs = [...panel.querySelectorAll(".budget-konto input")];
  kontoInputs[0].value = "2.745,58"; kontoInputs[0].dispatchEvent(new w7.Event("change", { bubbles: true }));
  let panel2 = d7.querySelector(".budget-panel");
  [...panel2.querySelectorAll(".budget-konto input")][1].value = "2,31";
  [...panel2.querySelectorAll(".budget-konto input")][1].dispatchEvent(new w7.Event("change", { bubbles: true }));
  panel2 = d7.querySelector(".budget-panel");
  [...panel2.querySelectorAll(".budget-konto input")][2].value = "-987,5";
  [...panel2.querySelectorAll(".budget-konto input")][2].dispatchEvent(new w7.Event("change", { bubbles: true }));
  const md7 = w7.Store.get().months[cur7];
  ok(md7.giro === 2745.58 && md7.konto2 === 2.31 && md7.kkSaldo === -987.5, "alle drei Kontostände in den Monatswerten");
  const c7 = w7.Logic.monthCockpit(w7.Store.get(), cur7);
  panel2 = d7.querySelector(".budget-panel");
  ok(panel2.querySelector(".budget-saldo").textContent === w7.U.eur(c7.prognoseGesamt), "Hero zeigt Saldo Monatsende (alle Konten): " + w7.U.eur(c7.prognoseGesamt));
  [...panel2.querySelectorAll(".row-expander")].find(b => b.textContent.includes("Rechnung")).click();
  ok(d7.querySelector(".budget-panel .calc").textContent.includes("= Saldo Monatsende"), "Rechnung im Panel aufklappbar");

  // Quick-Add: Einnahme, Ausgabe, Rücklage → korrekt typisiert im Monat
  function quick(idx, desc, betrag) {
    const q = [...d7.querySelectorAll(".budget-quick")][idx];
    q.querySelectorAll("input")[0].value = desc;
    q.querySelectorAll("input")[1].value = betrag;
    q.querySelector("button").click();
  }
  quick(0, "Steuererstattung", "250");
  quick(1, "Geschenk", "120");           // Ausgabe: wird automatisch negativ
  quick(2, "ETF-Nachkauf", "400");       // Rücklage: automatisch negativ
  const pl7 = w7.Store.get().months[cur7].planned;
  ok(pl7.length === 3, "drei Planungseinträge angelegt");
  ok(pl7.find(p => p.beschreibung === "Steuererstattung").typ === "einnahme" && pl7.find(p => p.beschreibung === "Steuererstattung").betrag === 250, "Einnahme +250 korrekt");
  ok(pl7.find(p => p.beschreibung === "Geschenk").betrag === -120 && pl7.find(p => p.beschreibung === "Geschenk").typ === "ausgabe", "Ausgabe automatisch −120");
  ok(pl7.find(p => p.beschreibung === "ETF-Nachkauf").betrag === -400 && pl7.find(p => p.beschreibung === "ETF-Nachkauf").typ === "ruecklage", "Rücklage automatisch −400");
  // Saldo reagiert
  const c7b = w7.Logic.monthCockpit(w7.Store.get(), cur7);
  ok(Math.abs(c7b.prognoseGesamt - (c7.prognoseGesamt + 250 - 120 - 400)) < 0.01, "Saldo reagiert exakt auf die Planung (+250 −120 −400)");
  ok(d7.querySelector(".budget-panel .budget-saldo").textContent === w7.U.eur(c7b.prognoseGesamt), "Hero aktualisiert sich sofort");
  // Einträge erscheinen im Monatscockpit
  w7.UI.go("monat", { month: cur7 });
  const inputs7 = [...d7.querySelectorAll("#view input")].map(i => i.value);
  ok(inputs7.includes("Steuererstattung") && inputs7.includes("ETF-Nachkauf"), "Einträge erscheinen im Monatscockpit (getrennte Blöcke)");
  // Monatswechsel im Panel schreibt in den richtigen Monat
  w7.UI.go("dashboard");
  const nextM = w7.Logic.nextMonth(cur7);
  d7.querySelector(".budget-panel .month-nav button").nextElementSibling; // noop
  [...d7.querySelectorAll(".budget-panel .month-nav button")].find(b => b.getAttribute("aria-label") === "Folgemonat").click();
  const panel3 = d7.querySelector(".budget-panel");
  ok(panel3.textContent.includes(w7.U.monthLabel(nextM)), "Panel auf Folgemonat gewechselt");
  [...panel3.querySelectorAll(".budget-konto input")][0].value = "100";
  [...panel3.querySelectorAll(".budget-konto input")][0].dispatchEvent(new w7.Event("change", { bubbles: true }));
  ok(w7.Store.get().months[nextM].giro === 100 && w7.Store.get().months[cur7].giro === 2745.58, "Eintrag landet im gewählten Monat, nicht im aktuellen");
  ok(fq.errs.length === 0, "keine JS-Fehler in Abschnitt Q");

  // Desktop-Version zeigt das Panel NICHT
  const fdesk = boot();
  fdesk.win.scrollTo = () => {};
  ok(fdesk.win.APP_MODE === "desktop" && !fdesk.doc.querySelector(".budget-panel"), "Desktop-Version ohne Budget-Panel (Rest identisch)");
}


console.log("\n== R) Handy: Posten-Zuordnung als Karten erreichbar ==");
{
  const fr = boot(null, mobileHtml);
  const w8 = fr.win, d8 = fr.doc;
  w8.scrollTo = () => {};
  w8.UI.go("monat", { month: "2026-06" });
  // Keine breite Tabelle mehr, sondern Karten
  const postenCard = [...d8.querySelectorAll(".card")].find(c => { const t = c.querySelector(".card-toggle-title"); return t && t.textContent === "Erwartete Posten"; });
  ok(!!postenCard, "Posten-Karte vorhanden");
  ok(postenCard.querySelectorAll(".posten-card").length >= 17, "Posten als Einzel-Karten gerendert (kein 7-Spalten-Grid)", postenCard.querySelectorAll(".posten-card").length);
  ok(!postenCard.querySelector("table.tbl"), "keine breite Tabelle auf dem Handy");
  // Mietanteil-Karte finden, aufklappen
  const lauraCard = [...d8.querySelectorAll(".posten-card")].find(c => c.textContent.includes("Mietanteil Laura"));
  ok(!!lauraCard, "Karte \u201EMietanteil Laura\u201C");
  ok(lauraCard.textContent.includes("Erwartet") && lauraCard.textContent.includes("Tatsächlich") && lauraCard.textContent.includes("Δ"), "Karte zeigt Soll/Ist/Δ ohne Scrollen");
  const exp = lauraCard.querySelector(".row-expander");
  ok(!!exp, "Aufklapper direkt in der Karte (nicht rechts außerhalb)");
  exp.click();
  const lauraCard2 = [...d8.querySelectorAll(".posten-card")].find(c => c.textContent.includes("Mietanteil Laura"));
  const det = lauraCard2.querySelector(".pc-detail");
  ok(!!det, "Detail klappt in der Karte auf");
  const whos = [...det.querySelectorAll(".detail-tx .who")].map(x => x.textContent.slice(0, 12));
  ok(whos.filter(x => x.includes("Laura")).length >= 1, "zugeordnete Buchung(en) sichtbar", JSON.stringify(whos));
  ok([...det.querySelectorAll("button")].some(b => b.textContent.includes("Zuordnung lösen")), "\u201EZuordnung lösen\u201C erreichbar");
  // Typ & Betrag inline in der Karte editierbar
  ok(lauraCard2.querySelectorAll(".pc-edit select").length === 1 && lauraCard2.querySelectorAll(".pc-edit input").length === 1, "Typ & erwarteter Betrag inline in der Karte");
  // Sortierung per Dropdown
  const sortSel = postenCard.querySelector("select");
  ok(sortSel && [...sortSel.options].some(o => o.textContent.includes("Sortieren")), "Sortier-Dropdown statt Tabellen-Header");
  sortSel.value = "delta"; sortSel.dispatchEvent(new w8.Event("change", { bubbles: true }));
  ok(w8.Store.get().ui.postenSort.key === "delta", "Sortierung per Dropdown greift");
  // Zuordnung lösen funktioniert vom Handy aus
  const lauraCard3 = [...d8.querySelectorAll(".posten-card")].find(c => c.textContent.includes("Mietanteil Laura"));
  // wieder aufklappen falls Sort das zu gemacht hat
  if (!lauraCard3.querySelector(".pc-detail")) lauraCard3.querySelector(".row-expander").click();
  const det3 = [...d8.querySelectorAll(".posten-card")].find(c => c.textContent.includes("Mietanteil Laura")).querySelector(".pc-detail");
  const loesen = [...det3.querySelectorAll("button")].find(b => b.textContent.includes("Zuordnung lösen"));
  loesen.click();
  ok(w8.Store.get().transactions.some(t => t.matchOverride === "none"), "Zuordnung vom Handy aus gelöst");
  // Desktop bleibt Tabelle
  const fd = boot();
  fd.win.scrollTo = () => {};
  fd.win.UI.go("monat", { month: "2026-06" });
  ok(!fd.doc.querySelector(".posten-card") && !!fd.doc.querySelector("#view table.tbl"), "Desktop behält die Tabelle");
  ok(fr.errs.length === 0, "keine JS-Fehler in Abschnitt R");
}


console.log("\n== S) Batch 1: Namen, Fenstergröße-Fix, Farben zentralisiert ==");
{
  const fs1 = boot();
  const w9 = fs1.win, d9 = fs1.doc;
  w9.scrollTo = () => {};

  // --- Namen ---
  ok(d9.querySelector(".brand-mark").textContent === "FiPla", "App heißt jetzt FiPla");
  ok(!!d9.querySelector(".brand-icon svg"), "eigenes Icon neben dem Namen");
  ok([...d9.querySelectorAll(".nav button")].some(b => b.textContent.includes("Monat") && !b.textContent.includes("Monatscockpit")), "Sidebar zeigt \u201EMonat\u201C statt \u201EMonatscockpit\u201C");
  w9.UI.go("monat", { month: "2026-06" });
  ok(d9.querySelector(".page-title").textContent === "Monat", "Seitentitel \u201EMonat\u201C statt \u201EMonatscockpit\u201C");
  w9.UI.go("dashboard");
  ok(!d9.querySelector("#view").textContent.includes("Ist + noch Erwartetes"), "alte Dashboard-Unterzeile entfernt");

  // --- color-scheme: dark ---
  const cssTxt = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  ok(cssTxt.includes("color-scheme: dark"), "color-scheme: dark gesetzt (native Datum/Monat-Felder folgen jetzt dem Dark-Theme)");

  // --- Fenstergröße-Bug (1.10): Posten-Karten reagieren jetzt auf echte Breite, nicht auf APP_MODE-Text ---
  w9.UI.go("monat", { month: "2026-06" });
  ok(!d9.querySelector(".posten-card"), "Desktop-Build bei normaler Breite: weiterhin Tabelle");
  w9.matchMedia = (q) => ({ matches: true, media: q, addListener(){}, removeListener(){} }); // Fenster "schmal" simulieren
  w9.UI.go("monat", { month: "2026-06" }); // Neu rendern nötig, da isNarrow() zur Renderzeit geprüft wird
  ok(d9.querySelectorAll(".posten-card").length > 0, "… und schaltet auf Karten um, wenn das Fenster schmal ist (Bug behoben)");
  const postenCard9 = [...d9.querySelectorAll(".card")].find(c => c.querySelector(".card-toggle-title") && c.querySelector(".card-toggle-title").textContent === "Erwartete Posten");
  ok(!postenCard9.querySelector("table.tbl"), "… speziell die Posten-Liste zeigt keine Tabelle mehr bei schmalem Fenster (Einnahmen/Buchungen bleiben zurecht Tabellen)");

  // --- Farben zentralisiert (1.9): FI-Chips lesen jetzt CSS-Variablen statt fixer Hex-Werte ---
  const fiJs = fs.readFileSync(new URL("../js/views-fi.js", import.meta.url), "utf8");
  ok(!/#3DDC97|#FF7A66|#F87462/.test(fiJs), "views-fi.js enthält keine hartkodierten Hex-Farben mehr");
  ok(fiJs.includes('U.cssVar("--pos")'), "… liest stattdessen die zentralen CSS-Variablen");
  const hkJs = fs.readFileSync(new URL("../js/views-szenarien.js", import.meta.url), "utf8");
  ok(!/#F5B14C|#3DDC97/.test(hkJs.match(/var HK = \{[^}]*\}/)[0]), "Hauskauf-Farben ebenfalls zentralisiert");

  // --- Feld-Ausrichtung (1.8): Eingaben sitzen unabhängig von Label-Länge am Boden der Zelle ---
  ok(cssTxt.includes("label.fld > input, label.fld > select { margin-top: auto; }"), "Feld-Fix für unterschiedlich lange Labels vorhanden");

  ok(fs1.errs.length === 0, "keine JS-Fehler in Abschnitt S");
}

console.log("\n== T) Batch 1: Neuer Dashboard-Hero & Vokabular ==");
{
  const ft = boot();
  const w10 = ft.win, d10 = ft.doc;
  w10.scrollTo = () => {};
  const cur10 = w10.U.currentMonth();
  const md10 = w10.Store.monthData(cur10);
  md10.giro = 1000; md10.konto2 = 50; md10.kkSaldo = -20;
  w10.Store.commit();
  w10.UI.go("dashboard");
  const c10 = w10.Logic.monthCockpit(w10.Store.get(), cur10);

  ok(!!d10.querySelector(".dash-hero"), "Saldo-Hero-Block vorhanden");
  ok(d10.querySelector(".dash-hero-num").textContent === w10.U.eur(c10.prognoseGesamt), "Hero zeigt den korrekten Gesamt-Saldo");
  ok(d10.querySelectorAll(".flow-grp").length === 2, "genau zwei Fluss-Gruppen (kommt dazu / geht ab)");
  ok(d10.querySelectorAll(".mini-card").length === 3, "drei sekundäre Kontext-Kacheln (kleiner als der Hero)");

  // "Bisher ausgegeben" ersetzt "Variable Ausgaben" korrekt mit Summe + Prozentsatz
  const ausg = [...d10.querySelectorAll(".mini-card")].find(k => k.textContent.includes("Bisher ausgegeben"));
  const erwartet = Math.round((c10.fixIst + c10.schuldIst + c10.variableSum) * 100) / 100;
  ok(ausg.querySelector(".mini-num").textContent === w10.U.eur(erwartet), "\u201EBisher ausgegeben\u201C = Fixkosten + Schulden + Variabel zusammen");
  const erwPct = erwartet !== 0 ? Math.round((c10.variableSum / erwartet) * 100) : 0;
  ok(ausg.textContent.includes("davon " + erwPct + " % variabel"), "Prozent-Unterzeile motiviert korrekt (\u201Edavon X % variabel\u201C)");

  ok(ft.errs.length === 0, "keine JS-Fehler in Abschnitt T");
}


console.log("\n== U) Batch 2: Vorzeichen-Automatik, Verschieben, Wer schuldet wem ==");
{
  const fu = boot();
  const w11 = fu.win, d11 = fu.doc;
  w11.scrollTo = () => {};
  w11.UI.go("monat", { month: "2026-06" });

  // --- Automatisches Vorzeichen ---
  function addRow(cardTitle) {
    // Karte ist bei 0 Einträgen standardmäßig eingeklappt -> erst aufklappen
    var toggle = [...d11.querySelectorAll(".card-toggle")].find(b => { const t = b.querySelector(".card-toggle-title"); return t && t.textContent === cardTitle; });
    if (toggle && toggle.getAttribute("aria-expanded") === "false") toggle.click();
    const card = [...d11.querySelectorAll(".card")].find(c => { const t = c.querySelector(".card-toggle-title"); return t && t.textContent === cardTitle; });
    [...card.querySelectorAll("button")].find(b => b.textContent.includes("Eintrag")).click();
    return [...d11.querySelectorAll(".card")].find(c => { const t = c.querySelector(".card-toggle-title"); return t && t.textContent === cardTitle; });
  }
  let ausgCard = addRow("Zusatzausgaben");
  let lastRow = [...ausgCard.querySelectorAll("tbody tr")].filter(r => !r.classList.contains("item-detail")).pop();
  let betragInp = lastRow.querySelectorAll("input")[1]; // 0=Beschreibung, 1=Betrag
  betragInp.value = "120"; // positiv eingetippt
  betragInp.dispatchEvent(new w11.Event("change", { bubbles: true }));
  let entry = w11.Store.get().months["2026-06"].planned.slice(-1)[0];
  ok(entry.betrag === -120, "Zusatzausgabe: 120 eingetippt → automatisch −120 gespeichert", entry.betrag);

  let einCard = addRow("Zusatzeinnahmen");
  lastRow = [...einCard.querySelectorAll("tbody tr")].filter(r => !r.classList.contains("item-detail")).pop();
  betragInp = lastRow.querySelectorAll("input")[1];
  betragInp.value = "-50"; // negativ eingetippt bei Einnahme
  betragInp.dispatchEvent(new w11.Event("change", { bubbles: true }));
  entry = w11.Store.get().months["2026-06"].planned.slice(-1)[0];
  ok(entry.betrag === 50, "Zusatzeinnahme: −50 eingetippt → automatisch auf +50 korrigiert", entry.betrag);

  // --- Manuelle Übersteuerung (Sonderfall) ---
  const lockBtn = lastRow.querySelector(".btn.sm.ghost");
  lockBtn.click(); // auf "manuell" umstellen
  ok(w11.Store.get().months["2026-06"].planned.slice(-1)[0].vorzeichenManuell === true, "Vorzeichen-Sperre lässt sich für Sonderfälle lösen");
  let einCard2 = [...d11.querySelectorAll(".card")].find(c => { const t = c.querySelector(".card-toggle-title"); return t && t.textContent === "Zusatzeinnahmen"; });
  let lastRow2 = [...einCard2.querySelectorAll("tbody tr")].filter(r => !r.classList.contains("item-detail")).pop();
  let betragInp2 = lastRow2.querySelectorAll("input")[1];
  betragInp2.value = "-30";
  betragInp2.dispatchEvent(new w11.Event("change", { bubbles: true }));
  ok(w11.Store.get().months["2026-06"].planned.slice(-1)[0].betrag === -30, "… und im manuellen Modus bleibt −30 tatsächlich negativ (Sonderfall funktioniert)");

  // --- Notiz + Person über die "mehr"-Zeile ---
  const moreBtn = lastRow2.querySelector(".row-expander");
  moreBtn.click();
  let einCard3 = [...d11.querySelectorAll(".card")].find(c => { const t = c.querySelector(".card-toggle-title"); return t && t.textContent === "Zusatzeinnahmen"; });
  const detailRow = einCard3.querySelector("tr.item-detail");
  ok(!!detailRow && detailRow.textContent.includes("Person"), "Zusatzeinnahmen-Detail zeigt ein Person-Feld");
  ok(detailRow.textContent.includes("Notiz"), "… und ein Notiz-Feld");
  const personInp = [...detailRow.querySelectorAll("input")].find(i => i.previousSibling && i.previousSibling.textContent && i.previousSibling.textContent.includes("Person")) || detailRow.querySelectorAll("input")[0];
  personInp.value = "Laura";
  personInp.dispatchEvent(new w11.Event("change", { bubbles: true }));
  ok(w11.Store.get().months["2026-06"].planned.slice(-1)[0].person === "Laura", "Person wird gespeichert");

  // Rücklagen-Detail hat KEIN Person-Feld (macht dort keinen Sinn)
  let ruCard = addRow("Rücklagen & Sparen");
  let ruRow = [...ruCard.querySelectorAll("tbody tr")].filter(r => !r.classList.contains("item-detail")).pop();
  ruRow.querySelector(".row-expander").click();
  let ruCard2 = [...d11.querySelectorAll(".card")].find(c => { const t = c.querySelector(".card-toggle-title"); return t && t.textContent === "Rücklagen & Sparen"; });
  ok(!ruCard2.querySelector("tr.item-detail").textContent.includes("Person"), "Rücklagen-Detail zeigt bewusst KEIN Person-Feld");

  // --- Verschieben ---
  const md6b = w11.Store.monthData("2026-06");
  md6b.planned = [{ id: "mv1", beschreibung: "Testeintrag", typ: "einnahme", betrag: 77, erledigt: false, txId: null, person: "", notiz: "" }];
  w11.Store.commit(); w11.UI.render();
  const einCard4 = [...d11.querySelectorAll(".card")].find(c => { const t = c.querySelector(".card-toggle-title"); return t && t.textContent === "Zusatzeinnahmen"; });
  const moveInp = einCard4.querySelector('tbody tr select[title*="verschieben"]'); // Safari/WebKit hat keinen Monats-Picker -> <select> statt <input type="month">
  moveInp.value = "2026-09";
  moveInp.dispatchEvent(new w11.Event("change", { bubbles: true }));
  ok(w11.Store.get().months["2026-06"].planned.length === 0, "Eintrag ist aus Juni verschwunden");
  ok(w11.Store.get().months["2026-09"].planned.some(p => p.id === "mv1"), "… und taucht in September wieder auf, mit identischem Inhalt");

  // --- Wer schuldet wem: komplettes Szenario, End-to-End ---
  const fw = boot();
  const w12 = fw.win, d12 = fw.doc;
  w12.Store.monthData("2026-05").planned = [
    { id: "d1", beschreibung: "Anzahlung", typ: "einnahme", betrag: 96, erledigt: false, person: "Laura", notiz: "" },
    { id: "d2", beschreibung: "Amazon", typ: "ausgabe", betrag: -162.75, erledigt: false, person: "Laura", notiz: "Geschenk" }
  ];
  w12.Store.commit();
  w12.UI.go("monat", { month: "2026-06" }); // anderer Monat als die Einträge -> muss trotzdem erscheinen
  ok(!!d12.querySelector("#view").textContent.includes("Wer schuldet wem"), "\u201EWer schuldet wem\u201C-Block erscheint (Einträge liegen im Mai, wir sind im Juni)");
  ok(d12.querySelector("#view").textContent.includes("du schuldest Laura"), "Richtung korrekt: netto −66,75 → \u201Edu schuldest Laura\u201C");
  ok(d12.querySelector("#view").textContent.includes("66,75"), "Betrag korrekt: 66,75 €");
  const personToggle = [...d12.querySelectorAll(".person-row .row-expander")][0];
  personToggle.click();
  const personDetailTxt = d12.querySelector("#view").textContent;
  ok(personDetailTxt.includes("Anzahlung") && personDetailTxt.includes("Amazon") && personDetailTxt.includes("Geschenk"), "Aufklappen zeigt beide zugrundeliegenden Buchungen inkl. Notiz");

  // Ohne Personen-Einträge erscheint der Block gar nicht (keine leere, verwirrende Karte)
  const fEmpty = boot();
  fEmpty.win.scrollTo = () => {};
  fEmpty.win.UI.go("monat", { month: "2026-06" });
  ok(!fEmpty.doc.querySelector("#view").textContent.includes("Wer schuldet wem"), "Block bleibt unsichtbar, wenn keine Personen-Einträge existieren");

  ok(fu.errs.length === 0 && fw.errs.length === 0, "keine JS-Fehler in Abschnitt U");
}


console.log("\n== V) Batch 3: Verlauf getrennt, Kategorie-Trend ==");
{
  const fv = boot();
  const w13 = fv.win, d13 = fv.doc;
  w13.scrollTo = () => {};
  w13.UI.go("dashboard");
  const cur13 = w13.U.currentMonth();

  // --- Verlauf: zwei Serien, die sich exakt an "heute" berühren ---
  // (gezielt über die Karten-Überschrift finden, nicht per Index — der Depot-Tracker hat
  // ebenfalls ein .chart-line weiter oben auf der Seite)
  const verlaufCard = [...d13.querySelectorAll(".card")].find(c => { const h = c.querySelector(".card-title"); return h && h.textContent.includes("Verlauf") && !h.textContent.includes("Trade Republic"); });
  const strokes = verlaufCard.querySelector(".chart-line").querySelectorAll(".stroke");
  ok(strokes.length === 2, "Verlauf-Chart hat zwei Linien (Bisher + Prognose)");
  ok(strokes[1].getAttribute("stroke-dasharray") === "5 4", "die zweite (Prognose-)Linie ist gestrichelt");
  ok(!strokes[0].getAttribute("stroke-dasharray"), "die erste (Bisher-)Linie ist durchgezogen");
  // Beide Pfade müssen an der X-Position von "heute" denselben Punkt treffen (nahtloser Übergang)
  const dAttrBisher = strokes[0].getAttribute("d");
  const dAttrProg = strokes[1].getAttribute("d");
  const lastPointBisher = dAttrBisher.trim().split("L").pop().trim();
  const firstPointProg = dAttrProg.trim().split("L")[0].replace("M", "").trim();
  ok(lastPointBisher === firstPointProg, "Bisher-Linie endet exakt dort, wo die Prognose-Linie beginnt (kein Sprung/keine Lücke)", lastPointBisher + " vs " + firstPointProg);

  // --- Kategorie-Trend: nur Kategorien mit tatsächlichen variablen Ausgaben, größte zuerst ---
  const catCard = [...d13.querySelectorAll(".card")].find(c => c.textContent.includes("Kategorie-Trend"));
  ok(!!catCard, "Kategorie-Trend-Karte vorhanden");
  const c13 = w13.Logic.monthCockpit(w13.Store.get(), cur13);
  const parts13 = w13.Logic.byCategory(c13.variable, w13.Store.get().categories);
  if (parts13.length) {
    ok(catCard.textContent.includes(parts13[0].name), "größte Ausgaben-Kategorie (\u201E" + parts13[0].name + "\u201C) erscheint im Trend");
  }
  ok(catCard.querySelectorAll(".chart-line .stroke").length <= 5, "höchstens 5 Kategorien gleichzeitig (keine Überladung)");
  ok(!catCard.textContent.includes("Einnahmen vs. Ausgaben"), "alter Balken-Titel verschwunden");

  // --- Zukunftsmonate liefern keine Kategorie-Trend-Daten (nur bereits gebuchte Monate) ---
  const futureMonth = w13.Logic.nextMonth(w13.Logic.nextMonth(cur13));
  ok(!catCard.textContent.includes(w13.U.monthLabel(futureMonth, true)), "Kategorie-Trend zeigt keine Zukunftsmonate (nur Ist-Daten)");

  ok(fv.errs.length === 0, "keine JS-Fehler in Abschnitt V");
}


console.log("\n== W) Batch 4.1: Einstellungen (Akzentfarbe, Dichte, Startansicht) ==");
{
  const fw1 = boot();
  const w14 = fw1.win, d14 = fw1.doc;
  w14.scrollTo = () => {};
  w14.UI.go("backup");
  const settingsCard = [...d14.querySelectorAll(".card")].find(c => c.textContent.includes("Darstellung & Verhalten"));
  ok(!!settingsCard, "Einstellungen-Karte vorhanden");

  // Akzentfarbe
  const colorInp = settingsCard.querySelector("input[type=color]");
  colorInp.value = "#FF00AA";
  colorInp.dispatchEvent(new w14.Event("change", { bubbles: true }));
  ok(w14.Store.get().ui.prefs.accentColor === "#ff00aa" || w14.Store.get().ui.prefs.accentColor === "#FF00AA", "Akzentfarbe gespeichert");
  ok(w14.document.documentElement.style.getPropertyValue("--accent") !== "", "… und tatsächlich als CSS-Variable angewendet");

  // Dichte
  const compactChip = [...settingsCard.querySelectorAll(".chip")].find(c => c.textContent === "Kompakt");
  compactChip.click();
  ok(w14.Store.get().ui.prefs.density === "compact", "Dichte auf kompakt gestellt");
  ok(w14.document.body.classList.contains("density-compact"), "… CSS-Klasse density-compact gesetzt");

  // Startansicht
  const startSel = [...settingsCard.querySelectorAll("select")][0];
  startSel.value = "fi";
  startSel.dispatchEvent(new w14.Event("change", { bubbles: true }));
  ok(w14.Store.get().ui.prefs.startView === "fi", "Startansicht gespeichert");

  // Web-Build zeigt KEINE nativen Schalter (Darkmode/Touch-ID ergeben dort keinen Sinn)
  ok(!settingsCard.textContent.includes("Touch-ID"), "Web-Build: kein Touch-ID-Schalter sichtbar (nur native relevant)");

  // Migration: alte gespeicherte Zustände ohne prefs bekommen beim Laden Defaults
  const oldState = JSON.parse(JSON.stringify(w14.Store.get()));
  delete oldState.ui.prefs;
  const fw2 = boot({ "finanzplanung.v1": JSON.stringify(oldState) });
  ok(!!fw2.win.Store.get().ui.prefs && fw2.win.Store.get().ui.prefs.density === "comfortable", "alte Zustände ohne prefs bekommen beim Laden saubere Defaults");

  ok(fw1.errs.length === 0, "keine JS-Fehler in Abschnitt W");
}


console.log("\n== X) Batch 4.3: Undo (Rückgängig) ==");
{
  const fx = boot();
  const w15 = fx.win, d15 = fx.doc;
  w15.scrollTo = () => {};

  // --- Sonderposten löschen + Rückgängig ---
  w15.UI.go("monat", { month: "2026-06" });
  const md15 = w15.Store.monthData("2026-06");
  md15.planned = [{ id: "u1", beschreibung: "Testeintrag", typ: "einnahme", betrag: 42, erledigt: false, txId: null, person: "", notiz: "" }];
  w15.Store.commit(); w15.UI.render();
  const einCardX = [...d15.querySelectorAll(".card")].find(c => { const t = c.querySelector(".card-toggle-title"); return t && t.textContent === "Zusatzeinnahmen"; });
  einCardX.querySelector(".btn.sm.danger").click();
  ok(w15.Store.get().months["2026-06"].planned.length === 0, "Sonderposten gelöscht");
  const toastBtn = [...d15.querySelectorAll(".toast-action")].pop();
  ok(!!toastBtn, "Toast mit \u201ERückgängig\u201C-Aktion erscheint");
  toastBtn.click();
  const restored = w15.Store.get().months["2026-06"].planned;
  ok(restored.length === 1 && restored[0].id === "u1" && restored[0].betrag === 42, "Wiederhergestellt — exakt derselbe Eintrag");

  // --- Erwarteter Posten löschen + Rückgängig über das Panel ---
  const fx2 = boot();
  fx2.win.scrollTo = () => {};
  const w16 = fx2.win, d16 = fx2.doc;
  const stromItem = w16.Store.get().expected.find(i => i.beschreibung === "Strom");
  const stromId = stromItem.id;
  w16.UI.go("posten");
  const stromRow16 = [...d16.querySelectorAll("#view tr")].find(tr => [...tr.querySelectorAll("input")].some(i => i.value === "Strom"));
  stromRow16.querySelector(".btn.sm.danger").click();
  const confirmDlg16 = d16.querySelector("dialog[open]");
  [...confirmDlg16.querySelectorAll("button")].find(b => b.textContent === "Löschen").click();
  ok(!w16.Store.get().expected.some(i => i.id === stromId), "Posten \u201EStrom\u201C gelöscht");
  // Statt Toast: über das persistente Panel in Backup & Einstellungen wiederherstellen
  w16.UI.go("backup");
  const undoRow = [...d16.querySelectorAll(".person-row")].find(r => r.textContent.includes("Strom"));
  ok(!!undoRow, "\u201EKürzlich gelöscht\u201C-Panel zeigt den gelöschten Posten");
  undoRow.querySelector("button").click();
  ok(w16.Store.get().expected.some(i => i.id === stromId), "Posten über das Panel wiederhergestellt, gleiche ID");
  // Nach Wiederherstellung matcht der Posten wieder wie zuvor
  const c16 = w16.Logic.monthCockpit(w16.Store.get(), "2026-05");
  ok(Math.abs(c16.rows.find(r => r.item.id === stromId).ist - (-72)) < 0.01, "… und matcht wieder korrekt gegen die Mai-Buchung (−72 €)");

  // --- Kategorie löschen + Rückgängig, inkl. manuelleKat-Wiederherstellung ---
  const fx3 = boot();
  fx3.win.scrollTo = () => {};
  const w17 = fx3.win, d17 = fx3.doc;
  const st17 = w17.Store.get();
  // eine Buchung manuell auf "freizeit" setzen, um manuelleKat=true zu testen
  const anyTx = st17.transactions.find(t => t.kategorieId === "lebensmittel");
  anyTx.kategorieId = "freizeit"; anyTx.manuelleKat = true;
  const freizeitTxCount = st17.transactions.filter(t => t.kategorieId === "freizeit").length;
  w17.Store.commit({ recompute: true });
  w17.UI.go("posten");
  // Kategorie-Karten sind verschachtelt (äußere "Kategorien & Regeln"-Karte enthält die
  // einzelnen Kategorie-Karten, beide .card) — deshalb erst den äußeren Wrapper finden,
  // dann NUR darin nach der spezifischen Karte suchen (sonst träfe .find() den Wrapper
  // selbst und darin die FALSCHE — die erste — Kategorie).
  const catWrapper17 = [...d17.querySelectorAll(".card")].find(c => c.querySelector(".card-title") && c.querySelector(".card-title").textContent.includes("Kategorien & Regeln"));
  const freizeitCard = [...catWrapper17.querySelectorAll(".card")].find(c => [...c.querySelectorAll("input")].some(i => i.value === "Freizeit & Kultur"));
  ok(!!freizeitCard, "Kategorie-Karte \u201EFreizeit & Kultur\u201C gefunden");
  freizeitCard.querySelector("button[title=löschen]").click();
  const confirmDlg17 = d17.querySelector("dialog[open]");
  [...confirmDlg17.querySelectorAll("button")].find(b => b.textContent === "Löschen").click();
  ok(!w17.Store.get().categories.some(c => c.name === "Freizeit & Kultur"), "Kategorie gelöscht");
  // Da manuelleKat beim Löschen zurückgesetzt wird, matcht die Buchung automatisch neu —
  // hier korrekt wieder gegen "Lebensmittel" (Stichwort-Regel existiert noch), nicht blind
  // gegen "Sonstige Ausgabe". Das ist smarter als ein pauschaler Fallback.
  ok(w17.Store.get().transactions.find(t => t.id === anyTx.id).kategorieId === "lebensmittel", "betroffene Buchung matcht automatisch neu (\u201ELebensmittel\u201C, nicht \u201ESonstige\u201C)");
  ok(w17.Store.get().transactions.find(t => t.id === anyTx.id).manuelleKat === false, "… und ist wieder als automatisch (nicht manuell) markiert");
  const toastBtn17 = [...d17.querySelectorAll(".toast-action")].pop();
  toastBtn17.click();
  ok(w17.Store.get().categories.some(c => c.name === "Freizeit & Kultur"), "Kategorie wiederhergestellt");
  const restoredTx = w17.Store.get().transactions.find(t => t.id === anyTx.id);
  ok(restoredTx.kategorieId === "freizeit" && restoredTx.manuelleKat === true, "… und die Buchung bekommt exakt ihre vorherige Kategorie UND das manuelleKat-Flag zurück");

  ok(fx.errs.length === 0 && fx2.errs.length === 0 && fx3.errs.length === 0, "keine JS-Fehler in Abschnitt X");
}


console.log("\n== Y) Monats-Auswahl als <select> statt <input type=month> (Safari-Fix) ==");
{
  const fy = boot();
  const w18 = fy.win, d18 = fy.doc;
  w18.scrollTo = () => {};

  // --- Haupt-Navigator im Monatscockpit ---
  w18.UI.go("monat", { month: "2026-06" });
  const nav18 = d18.querySelector(".month-nav");
  ok(!nav18.querySelector("input[type=month]"), "Hauptnavigator: kein input[type=month] mehr");
  const navSel = nav18.querySelector("select");
  ok(!!navSel && navSel.value === "2026-06", "… stattdessen ein <select>, korrekt auf Juni 2026 vorausgewählt");
  ok(navSel.options.length >= 90, "genug Monate zur Auswahl (mind. 8 Jahre Spanne)", navSel.options.length);
  navSel.value = "2027-03";
  navSel.dispatchEvent(new w18.Event("change", { bubbles: true }));
  ok(w18.Store.get().ui.month === "2027-03", "Auswahl im Select navigiert korrekt zum gewählten Monat");

  // --- Dashboard-Zeitraum-Filter ---
  w18.UI.go("dashboard");
  const rangeBar18 = [...d18.querySelectorAll(".btn-row")].find(b => b.textContent.includes("Zeitraum"));
  ok(!rangeBar18.querySelector("input[type=month]"), "Dashboard-Zeitraum: kein input[type=month] mehr");
  const rangeSelects = rangeBar18.querySelectorAll("select");
  ok(rangeSelects.length === 2, "zwei <select> (von/bis) vorhanden");
  rangeSelects[1].value = "2026-09";
  rangeSelects[1].dispatchEvent(new w18.Event("change", { bubbles: true }));
  ok(w18.Store.get().ui.dashTo === "2026-09", "Bis-Auswahl setzt den Zeitraum korrekt");

  // --- Verschieben-Steuerung (Fable-Fix) bleibt weiterhin korrekt funktionsfähig ---
  const md18 = w18.Store.monthData("2026-06");
  md18.planned = [{ id: "y1", beschreibung: "Test", typ: "einnahme", betrag: 10, erledigt: false, txId: null, person: "", notiz: "" }];
  w18.Store.commit();
  w18.UI.go("monat", { month: "2026-06" });
  const einCardY = [...d18.querySelectorAll(".card")].find(c => { const t = c.querySelector(".card-toggle-title"); return t && t.textContent === "Zusatzeinnahmen"; });
  const moveSelY = einCardY.querySelector('select[title*="verschieben"]');
  ok(!!moveSelY, "Verschieben-Auswahl weiterhin als <select> mit dem erwarteten title vorhanden");
  moveSelY.value = "2026-10";
  moveSelY.dispatchEvent(new w18.Event("change", { bubbles: true }));
  ok(w18.Store.get().months["2026-10"].planned.some(p => p.id === "y1"), "Verschieben funktioniert weiterhin korrekt über das Select");

  ok(fy.errs.length === 0, "keine JS-Fehler in Abschnitt Y");
}

console.log("\n== Z) Drag-and-Drop CSV aufs Dock-Icon (B2) ==");
{
  const fz = boot();
  const w19 = fz.win, d19 = fz.doc;
  w19.scrollTo = () => {};
  ok(typeof w19.CsvImport === "undefined" || w19.CsvImport === undefined, "CsvImport ist im Web-Build nicht gesetzt (nichts Unerwartetes exponiert)");
  w19.UI.go("import");
  ok(typeof w19.CsvImport === "object" && typeof w19.CsvImport.importText === "function", "window.CsvImport.importText() wird beim Öffnen der Import-Ansicht bereitgestellt");
  const before19 = w19.Store.get().transactions.length;
  const csvText = "Buchungstag;Buchungstext;Verwendungszweck;Beguenstigter/Zahlungspflichtiger;Betrag;Waehrung;Info\n01.07.2026;KARTENZAHLUNG;Test;DROPTEST GMBH;-9,99;EUR;Umsatz gebucht\n";
  w19.CsvImport.importText(csvText);
  ok(w19.Store.get().transactions.length === before19 + 1, "importText() importiert eine Buchung genau wie der normale Datei-Dialog");
  ok(w19.Store.get().transactions.some(t => t.empfaenger === "DROPTEST GMBH"), "… mit korrektem Inhalt");
  ok(fz.errs.length === 0, "keine JS-Fehler in Abschnitt Z");
}


console.log("\n== AA) Design-Nachbesserung: enge Sonderposten-Kacheln behoben ==");
{
  const faa = boot();
  const w20 = faa.win, d20 = faa.doc;
  w20.scrollTo = () => {};
  w20.matchMedia = (q) => ({ matches: true, media: q, addListener(){}, removeListener(){} }); // Fenster "schmal" simulieren
  w20.UI.go("monat", { month: "2026-06" });
  const md20 = w20.Store.monthData("2026-06");
  md20.planned = [{ id: "aa1", beschreibung: "Steuererstattung", typ: "einnahme", betrag: 1234.56, erledigt: false, txId: null, person: "", notiz: "" }];
  w20.Store.commit(); w20.UI.render();

  const einCardAA = [...d20.querySelectorAll(".card")].find(c => { const t = c.querySelector(".card-toggle-title"); return t && t.textContent === "Zusatzeinnahmen"; });
  ok(!einCardAA.querySelector("table.tbl"), "Sonderposten bei schmalem Fenster: keine Tabelle mehr");
  ok(einCardAA.querySelectorAll(".posten-card").length === 1, "… stattdessen eine Karte pro Eintrag");
  const betragInpAA = einCardAA.querySelector(".posten-card input.inline-num");
  ok(betragInpAA.value.includes("1.234,56") || betragInpAA.value.includes("1234,56"), "Betrag vollständig sichtbar (nicht auf 2-3 Ziffern abgeschnitten)", betragInpAA.value);
  ok(einCardAA.querySelector(".posten-card select[title*=verschieben]"), "Verschieben-Auswahl weiterhin vorhanden, jetzt in eigener Zeile statt gequetschter Spalte");

  // Breites Fenster: weiterhin die Tabelle (kein Rückschritt für den Desktop-Fall)
  w20.matchMedia = (q) => ({ matches: false, media: q, addListener(){}, removeListener(){} });
  w20.UI.render();
  const einCardAA2 = [...d20.querySelectorAll(".card")].find(c => { const t = c.querySelector(".card-toggle-title"); return t && t.textContent === "Zusatzeinnahmen"; });
  ok(!!einCardAA2.querySelector("table.tbl") && !einCardAA2.querySelector(".posten-card"), "bei normaler Breite weiterhin die Tabelle, keine Karten");

  ok(faa.errs.length === 0, "keine JS-Fehler in Abschnitt AA");
}

console.log("\n== AB) Design-Nachbesserung: Posten & Kategorien bei schmalem Fenster ==");
{
  const fab = boot();
  const w21 = fab.win, d21 = fab.doc;
  w21.scrollTo = () => {};
  w21.matchMedia = (q) => ({ matches: true, media: q, addListener(){}, removeListener(){} });
  w21.UI.go("posten");
  const postenCardAB = [...d21.querySelectorAll(".card")].find(c => c.textContent.includes("Erwartete Posten"));
  ok(!postenCardAB.querySelector("table.tbl"), "Posten-Verwaltung bei schmalem Fenster: keine 8-Spalten-Tabelle mehr");
  ok(postenCardAB.querySelectorAll(".posten-card").length === 18, "… stattdessen 18 Karten (eine pro Posten)");
  const firstCard = postenCardAB.querySelector(".posten-card");
  ok(firstCard.querySelectorAll("select").length >= 2, "Typ- und Kategorie-Auswahl weiterhin bedienbar in der Karte");
  // Bearbeiten funktioniert weiterhin normal über die Karte
  const notizInp = [...firstCard.querySelectorAll("label.fld")].find(l => l.textContent.includes("Notiz")).querySelector("input");
  notizInp.value = "Testnotiz";
  notizInp.dispatchEvent(new w21.Event("change", { bubbles: true }));
  ok(w21.Store.get().expected[0].notiz === "Testnotiz", "Bearbeiten über die Karte schreibt korrekt in den Zustand");

  ok(fab.errs.length === 0, "keine JS-Fehler in Abschnitt AB");
}

console.log("\n== AC) Design-Nachbesserung: Startansicht-Feld & Scroll-Hinweis ==");
{
  const fac = boot();
  const w22 = fac.win, d22 = fac.doc;
  w22.scrollTo = () => {};
  w22.UI.go("backup");
  const settingsCardAC = [...d22.querySelectorAll(".card")].find(c => c.textContent.includes("Darstellung & Verhalten"));
  const startSelAC = [...settingsCardAC.querySelectorAll("select")][0];
  const startFld = startSelAC.closest("label.fld");
  ok(startFld.style.gridColumn === "span 2", "Startansicht-Feld bekommt mehr Breite (spannt 2 Spalten)");
  ok([...startSelAC.options].some(o => o.textContent === "Zuletzt geöffnet"), "gekürzte Option passt jetzt auch in schmalere Breiten");

  const cssTxtAC = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  ok(cssTxtAC.includes(".tbl-wrap {") && cssTxtAC.includes("local") && cssTxtAC.includes("scroll"), "Scroll-Schatten-CSS für .tbl-wrap vorhanden (zeigt an, wenn eine Tabelle noch mehr Inhalt zur Seite hat)");

  ok(fac.errs.length === 0, "keine JS-Fehler in Abschnitt AC");
}


console.log("\n== AD) Design-Nachbesserung Runde 2: Sonderposten-Tabelle bei halbbreiter Kachel ==");
{
  const fad = boot();
  const w23 = fad.win, d23 = fad.doc;
  w23.scrollTo = () => {};
  w23.UI.go("monat", { month: "2026-06" });
  const md23 = w23.Store.monthData("2026-06");
  md23.planned = [{ id: "ad1", beschreibung: "MV HZ", typ: "einnahme", betrag: 437.34, erledigt: false, txId: null, person: "", notiz: "" }];
  w23.Store.commit(); w23.UI.render();

  // Bei NORMALER Fensterbreite (nicht "schmal" laut matchMedia), aber die Sonderposten-Tabelle
  // sitzt trotzdem nur in der halben Breite (.grid.two) -> genau der von Fable gemeldete Fall.
  const einCardAD = [...d23.querySelectorAll(".card")].find(c => { const t = c.querySelector(".card-toggle-title"); return t && t.textContent === "Zusatzeinnahmen"; });
  const tblAD = einCardAD.querySelector("table.tbl");
  ok(!!tblAD && tblAD.classList.contains("tbl-roomy"), "Sonderposten-Tabelle hat die gezielte Mindestbreiten-Klasse (statt eine globale Regel für alle Tabellen)");

  // Andere .tbl-Tabellen in ähnlichen halbbreiten Kontexten sind NICHT betroffen — bewusst,
  // um keine unnötigen neuen Scrollbalken auf ungemeldeten Stellen zu riskieren.
  w23.UI.go("hauskauf");
  const anyTblHK = d23.querySelector("table.tbl");
  ok(!!anyTblHK && !anyTblHK.classList.contains("tbl-roomy"), "Hauskauf-Tabellen bleiben unverändert (kein ungeprüftes Blanket-Fix)");

  const cssTxtAD = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  ok(cssTxtAD.includes("table.tbl-roomy { min-width: 460px; }"), "CSS-Regel für die Mindestbreite vorhanden");
  ok(cssTxtAD.includes("input.inline-num") && cssTxtAD.match(/input\.inline-num\s*\{[^}]*min-width:\s*70px/), "Betragsfelder haben zusätzlich eine eigene Mindestbreite (zweite Absicherung)");

  ok(fad.errs.length === 0, "keine JS-Fehler in Abschnitt AD");
}


// --- Abschnitt AE: Vormerkung manuell bereinigen (hartnäckige Fälle mit verändertem Empfängertext) ---
{
  const fae = boot();
  const w = fae.win, d = fae.doc;
  w.Store.get().transactions.push(
    { id: "vgx1", datum: "2026-07-06", betrag: -4.99, empfaenger: "APPLE.COM/BILL CORK IE", zweck: "", text: "", info: "Umsatz vorgemerkt" },
    { id: "vgx2", datum: "2026-07-06", betrag: -4.99, empfaenger: "APPLE.COM.BILL/Hollyhill", zweck: "", text: "", info: "Umsatz gebucht" });
  w.Store.commit({ recompute: true });
  w.UI.go("monat", { month: "2026-07" });
  const cleanBtn = [...d.querySelectorAll("#view button")].find(b => (b.title || "").includes("Vormerkung"));
  ok(!!cleanBtn, "vorgemerkte Buchung zeigt Bereinigen-Knopf");
  cleanBtn.click();
  const dlgAE = d.querySelector("dialog.modal");
  ok(!!dlgAE && dlgAE.textContent.includes("Vormerkung bereinigen"), "Bereinigen-Dialog öffnet sich");
  const selAE = dlgAE.querySelector("select");
  ok(selAE && selAE.selectedOptions[0].textContent.includes("APPLE.COM.BILL/Hollyhill"), "gebuchter Zwilling (anderer Empfängertext!) ist vorausgewählt");
  [...dlgAE.querySelectorAll("button")].find(b => b.textContent.includes("Zuordnen")).click();
  ok(!w.Store.get().transactions.some(t2 => t2.id === "vgx1"), "Vormerkung ist entfernt");
  ok(w.Store.get().transactions.some(t2 => t2.id === "vgx2"), "die gebuchte Buchung bleibt erhalten");
  const undoAE = w.Store.getUndoStack()[0];
  ok(!!undoAE && undoAE.label.includes("Vormerkung"), "Undo-Eintrag wurde angelegt");
  w.Store.popUndo(undoAE.id);
  ok(w.Store.get().transactions.some(t2 => t2.id === "vgx1"), "Rückgängig stellt die Vormerkung wieder her");
  ok(fae.errs.length === 0, "keine JS-Fehler in Abschnitt AE");
}


// --- Abschnitt AF: Dashboard-Übersichtskarte mit Monatswähler + korrektem Alle-Konten-Saldo ---
{
  const faf = boot();
  const w = faf.win, d = faf.doc;
  const cur = w.U.currentMonth();
  const next = w.Logic.nextMonth(cur);
  // Folgemonat: Kontostände + Planung eintragen (wie Bonnis August-Fall)
  const mdN = w.Store.monthData(next);
  mdN.giro = 2782.55; mdN.konto2 = 2.31; mdN.kkSaldo = -260.23;
  mdN.planned.push({ id: "af1", beschreibung: "Rücklage", typ: "ruecklage", betrag: -1650, erledigt: false, txId: null });
  w.Store.commit({ recompute: true });
  w.UI.go("dashboard");
  ok(d.querySelector("#view .card-title").textContent.startsWith("Aktueller Monat"), "Karte zeigt standardmäßig den aktuellen Monat");
  const sel = d.querySelector("#view .card-title select");
  ok(!!sel, "Monatswähler sitzt im Kopf der Übersichts-Karte");
  // Folgemonat auswählen
  sel.value = next; sel.dispatchEvent(new w.Event("change", { bubbles: true }));
  const title2 = d.querySelector("#view .card-title").textContent;
  ok(title2.startsWith("Monat · "), "Titel wechselt zu \u201EMonat \u00B7 \u2026\u201C für nicht-aktuelle Monate");
  ok(title2.includes(w.U.monthLabel(next).trim()), "… und nennt den gewählten Monat");
  // Hero muss die Alle-Konten-Prognose zeigen (nicht die Spaltensumme), weil Kontostand eingetragen ist
  const ccN = w.Logic.monthCockpit(w.Store.get(), next);
  ok(ccN.prognoseGiro != null, "Testaufbau: Kontostand im Folgemonat vorhanden");
  ok(ccN.prognoseGesamt !== ccN.prognoseSaldo, "Testaufbau: Alle-Konten-Saldo unterscheidet sich von der Spaltensumme");
  const heroTxt = d.querySelector("#view .dash-hero-num").textContent;
  ok(heroTxt === w.U.eur(ccN.prognoseGesamt), "Hero zeigt die Alle-Konten-Prognose (" + w.U.eur(ccN.prognoseGesamt) + "), nicht die Spaltensumme");
  // Monatsübersicht-Tabelle unten: gleiche Wahrheit — Alle-Konten-Prognose statt Spaltensumme
  const rowAF = [...d.querySelectorAll("#view tr")].find(r => r.textContent.includes(w.U.monthLabel(next, true)));
  ok(!!rowAF, "Monatsübersicht-Tabelle hat eine Zeile für den Folgemonat");
  ok(rowAF.textContent.includes(w.U.eur(ccN.prognoseGesamt)), "Tabellen-Saldo zeigt die Alle-Konten-Prognose");
  // Monate OHNE Kontostand zeigen ihren EIGENEN Monats-Prognosewert (nie kumuliert, nie leer)
  const n2 = w.Logic.nextMonth(next);
  const ccN2 = w.Logic.monthCockpit(w.Store.get(), n2);
  ok(ccN2.prognoseGesamt == null, "Testaufbau: übernächster Monat hat keinen Kontostand");
  const rowAF2 = [...d.querySelectorAll("#view tr")].find(r => r.textContent.includes(w.U.monthLabel(n2, true)));
  ok(!!rowAF2, "Tabelle hat eine Zeile für den übernächsten Monat");
  ok(rowAF2.textContent.includes(w.U.eur(ccN2.prognoseSaldo)), "Monat ohne Kontostand zeigt seinen eigenen Prognose-Saldo");
  // Hero fällt ohne Kontostand auf die Monats-Prognose zurück statt leer zu sein
  const selAF2 = d.querySelector("#view .card-title select");
  selAF2.value = n2; selAF2.dispatchEvent(new w.Event("change", { bubbles: true }));
  const heroTxt2 = d.querySelector("#view .dash-hero-num").textContent;
  ok(heroTxt2 === w.U.eur(ccN2.prognoseSaldo), "Hero zeigt ohne Kontostand die Monats-Prognose, kein leerer Strich");
  // Heute-Knopf springt zurück
  const heute = [...d.querySelectorAll("#view .card-title button")].find(b => b.textContent === "Heute");
  ok(!!heute, "Heute-Knopf erscheint bei nicht-aktuellem Monat");
  heute.click();
  ok(d.querySelector("#view .card-title").textContent.startsWith("Aktueller Monat"), "Heute springt zur aktuellen Ansicht zurück");
  ok(faf.errs.length === 0, "keine JS-Fehler in Abschnitt AF");
}

console.log("\n" + pass + " bestanden, " + fail + " fehlgeschlagen");
process.exit(fail ? 1 : 0);
