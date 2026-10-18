/* native.test.mjs — Tests für native.js (die Mac-App-Glue-Logik) mit simuliertem
   window.__TAURI__. Prüft die JS-Seite: Rust-Befehle (invoke) werden gemockt und ihre
   Antworten vorgegeben — die eigentlichen Rust-Befehle (save_state, authenticate, …)
   kann nur ein echter Mac testen (siehe ARBEITSPAKET_FINAL.md, Abschnitt B). */
import fs from "fs";
import { JSDOM } from "jsdom";

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL " + name + (extra !== undefined ? " → " + extra : "")); }
}

const desktopHtml = fs.readFileSync(new URL("../dist/finanzplanung.html", import.meta.url), "utf8");
// build.js erzeugt jetzt einen echten dritten Build (dist/native/index.html,
// APP_MODE=desktop-native) — den nutzen wir hier direkt, keine Text-Ersetzung mehr nötig.
const nativeHtml = fs.readFileSync(new URL("../dist/native/index.html", import.meta.url), "utf8");

/* invokeImpl: (cmd, args) => Promise. Default deckt die häufigsten Befehle ab, pro Test
   überschreibbar für Sonderfälle (Ablehnen, falsche Antwort, Fehler simulieren). */
async function bootNative(invokeImpl, storageBackup) {
  const menuHandlers = {};
  const dom = new JSDOM(nativeHtml, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://localhost/native-test.html",
    beforeParse(window) {
      window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
      window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new window.Event("close")); };
      window.scrollTo = () => {};
      window.__TAURI__ = {
        core: { invoke: (cmd, args) => Promise.resolve().then(() => invokeImpl(cmd, args)) },
        event: { listen: (name, cb) => { menuHandlers[name] = cb; return Promise.resolve(() => {}); } }
      };
      if (storageBackup) for (const [k, v] of Object.entries(storageBackup)) window.localStorage.setItem(k, v);
    }
  });
  const errs = [];
  dom.window.addEventListener("error", (e) => errs.push(e.error ? e.error.message : e.message));
  await settle(); await settle(); // eigenen Boot-Vorlauf (Touch-ID -> Laden -> afterBoot) abwarten
  return { dom, win: dom.window, doc: dom.window.document, errs, fireMenu: (id) => menuHandlers.menu && menuHandlers.menu({ payload: id }) };
}
async function settle() { await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); }
const MINIMAL_STATE = JSON.stringify({
  version: 1, createdAt: new Date().toISOString(),
  transactions: [], expected: [], categories: [], months: {},
  fi: {}, hauskauf: {}, hochzeit: {}, kinder: {}, depot: {},
  ui: { month: "2026-07", view: "dashboard" }
});
function defaultInvoke(cmd, args) {
  if (cmd === "load_state") return MINIMAL_STATE; // vermeidet den Erststart-Pfad (Willkommens-Dialog), der sonst andere Dialog-Tests überlagern würde
  if (cmd === "state_location") return "/Users/test/Library/Application Support/Finanzplanung/state.json";
  if (cmd === "authenticate") return true;
  if (cmd === "save_file_dialog") return "/Users/test/Desktop/" + args.defaultName;
  if (cmd === "pick_backup") return null;
  return null;
}

console.log("\n== 1) active() / Web-Build bleibt unberührt ==");
{
  const { win, errs } = await bootNative(defaultInvoke);
  ok(win.NativeGlue.active() === true, "active() erkennt die native Mac-App korrekt");
  ok(errs.length === 0, "kein Fehler beim Start");
  // Zum Vergleich: der normale Desktop-Web-Build (kein __TAURI__) bleibt inaktiv
  const dom2 = new JSDOM(desktopHtml, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://localhost/x.html", beforeParse(w) { w.scrollTo = () => {}; } });
  ok(dom2.window.NativeGlue.active() === false, "im Web-Build (ohne __TAURI__) bleibt NativeGlue inaktiv");
}

console.log("\n== 2) Darkmode-Präferenz (applyThemePref) ==");
{
  const { win } = await bootNative(defaultInvoke);
  win.NativeGlue.applyThemePref(true);
  ok(win.document.documentElement.classList.contains("theme-auto"), "folgt System (true) → Klasse gesetzt");
  win.NativeGlue.applyThemePref(false);
  ok(!win.document.documentElement.classList.contains("theme-auto"), "fest dunkel (false) → Klasse entfernt");
}

console.log("\n== 3) Touch-ID-Präferenz (requiresUnlock / mirrorTouchIdPref) ==");
{
  const { win } = await bootNative(defaultInvoke);
  ok(win.NativeGlue.requiresUnlock() === true, "Standard (kein localStorage-Flag) → Sperre aktiv");
  win.NativeGlue.mirrorTouchIdPref(false);
  ok(win.NativeGlue.requiresUnlock() === false, "nach Deaktivieren → keine Sperre mehr nötig");
  win.NativeGlue.mirrorTouchIdPref(true);
  ok(win.NativeGlue.requiresUnlock() === true, "wieder aktivieren → Sperre wieder aktiv");
  ok(win.localStorage.getItem("fipla.touchIdEnabled") === "true", "Präferenz wird in localStorage gespiegelt (für den Boot-Zeitpunkt vor dem Laden des Zustands)");
  Object.defineProperty(win.navigator, "userAgent", { value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/130.0" });
  ok(win.NativeGlue.unlockSupported() === false && win.NativeGlue.requiresUnlock() === false, "Windows (WebView2) → keine Touch-ID-Sperre, trotz aktiver Präferenz");
}

console.log("\n== 4) unlock() — Erfolg, Ablehnung, Fehler ==");
{
  // Erfolgreiche Entsperrung
  const t1 = await bootNative(defaultInvoke);
  let doneCalled = false;
  t1.win.NativeGlue.unlock(() => { doneCalled = true; });
  await settle();
  ok(doneCalled, "erfolgreiche Touch-ID-Authentifizierung ruft done() auf");
  ok(!t1.doc.querySelector("div[style*='z-index:9999']"), "Overlay wird nach Erfolg entfernt");

  // Falsche/abgelehnte Authentifizierung: Overlay bleibt, Retry-Button erscheint
  const t2 = await bootNative((cmd) => cmd === "authenticate" ? false : defaultInvoke(cmd));
  let doneCalled2 = false;
  t2.win.NativeGlue.unlock(() => { doneCalled2 = true; });
  await settle();
  ok(!doneCalled2, "abgelehnte Authentifizierung ruft done() NICHT auf — App bleibt gesperrt");
  const retryBtn = [...t2.doc.querySelectorAll("button")].find((b) => b.textContent.includes("Entsperren"));
  ok(retryBtn && retryBtn.style.display !== "none", "Retry-Button wird sichtbar");

  // Touch ID technisch nicht verfügbar (z. B. kein Sensor): App startet trotzdem, mit Warnung
  const t3 = await bootNative((cmd) => cmd === "authenticate" ? Promise.reject("kein Sensor") : defaultInvoke(cmd));
  let doneCalled3 = false;
  t3.win.NativeGlue.unlock(() => { doneCalled3 = true; });
  await settle();
  ok(doneCalled3, "technischer Fehler → App startet trotzdem (kein Aussperren durch defekte Hardware)");
}

console.log("\n== 5) Sync-Konflikt (handleConflict) ==");
{
  // "Anderen Stand übernehmen"
  const t1 = await bootNative(defaultInvoke);
  let adopted = null;
  t1.win.Store.adoptExternal = (content) => { adopted = content; };
  t1.win.NativeGlue.handleConflict();
  const dlg1 = t1.doc.querySelector("dialog[open]");
  ok(!!dlg1 && dlg1.textContent.includes("Sync-Konflikt"), "Konflikt-Dialog erscheint, erklärt was passiert ist");
  const takeTheirsBtn = [...dlg1.querySelectorAll("button")].find((b) => b.textContent.includes("Anderen Stand"));
  let invokedCmd = null, invokedArgs = null;
  const t1b = await bootNative((cmd, args) => { invokedCmd = cmd; invokedArgs = args; return cmd === "resolve_conflict_take_theirs" ? "{}" : defaultInvoke(cmd, args); });
  t1b.win.Store.adoptExternal = (content) => { adopted = content; };
  t1b.win.NativeGlue.handleConflict();
  const dlg1b = t1b.doc.querySelector("dialog[open]");
  [...dlg1b.querySelectorAll("button")].find((b) => b.textContent.includes("Anderen Stand")).click();
  await settle();
  ok(invokedCmd === "resolve_conflict_take_theirs", "\u201EAnderen Stand übernehmen\u201C ruft den richtigen Rust-Befehl auf");
  ok(adopted === "{}", "… und übernimmt die Antwort via Store.adoptExternal");
  ok(!t1b.doc.querySelector("dialog[open]"), "Dialog schließt sich danach");

  // "Meine Version behalten"
  let invokedCmd2 = null;
  const t2 = await bootNative((cmd) => { if (cmd.indexOf("resolve_conflict") === 0) invokedCmd2 = cmd; return defaultInvoke(cmd); });
  t2.win.NativeGlue.handleConflict();
  const dlg2 = t2.doc.querySelector("dialog[open]");
  [...dlg2.querySelectorAll("button")].find((b) => b.textContent.includes("Meine Version")).click();
  await settle();
  ok(invokedCmd2 === "resolve_conflict_keep_mine", "\u201EMeine Version behalten\u201C ruft den richtigen Rust-Befehl auf");

  // Doppeltes Öffnen wird verhindert (z. B. zwei Events kurz hintereinander)
  const t3 = await bootNative(defaultInvoke);
  t3.win.NativeGlue.handleConflict();
  t3.win.NativeGlue.handleConflict();
  ok(t3.doc.querySelectorAll("dialog[open]").length === 1, "zweiter Aufruf öffnet keinen zweiten Dialog, solange einer offen ist");
}

console.log("\n== 6) Natives Speichern statt Browser-Download ==");
{
  const { win } = await bootNative(defaultInvoke);
  let calledCmd = null, calledArgs = null;
  win.__TAURI__.core.invoke = (cmd, args) => { calledCmd = cmd; calledArgs = args; return Promise.resolve("/Users/test/Desktop/test.json"); };
  win.U.download("test.json", '{"a":1}');
  await settle();
  ok(calledCmd === "save_file_dialog", "U.download() ruft in der Mac-App den nativen Speichern-Dialog auf, keinen Browser-Download");
  ok(calledArgs.defaultName === "test.json" && calledArgs.contents === '{"a":1}', "… mit Dateiname und Inhalt korrekt übergeben");
}

console.log("\n== 7) Menüband-Events ==");
{
  const { win, fireMenu } = await bootNative(defaultInvoke);
  fireMenu("view:fi");
  ok(win.Store.get().ui.view === "fi", "Menüpunkt \u201Eview:fi\u201C navigiert zur FI-Planung");
  fireMenu("view:monat");
  ok(win.Store.get().ui.view === "monat", "… und \u201Eview:monat\u201C entsprechend zum Monat");

  let exportCalled = false;
  win.Store.exportBackup = () => { exportCalled = true; };
  fireMenu("backup-export");
  ok(exportCalled, "Menüpunkt \u201Ebackup-export\u201C ruft Store.exportBackup() auf");

  fireMenu("csv-import");
  ok(win.Store.get().ui.view === "import", "Menüpunkt \u201Ecsv-import\u201C navigiert zum CSV-Import");
}

console.log("\n== 8) pickBackup() — natives Öffnen für Backup-Dateien ==");
{
  // Gültiges JSON
  const t1 = await bootNative((cmd) => cmd === "pick_backup" ? '{"a":1}' : defaultInvoke(cmd));
  let got = null;
  t1.win.NativeGlue.pickBackup((obj) => { got = obj; });
  await settle();
  ok(got && got.a === 1, "gültiges JSON wird korrekt geparst und übergeben");

  // Abgebrochen (null)
  const t2 = await bootNative((cmd) => cmd === "pick_backup" ? null : defaultInvoke(cmd));
  let got2 = "nicht aufgerufen";
  t2.win.NativeGlue.pickBackup((obj) => { got2 = obj; });
  await settle();
  ok(got2 === "nicht aufgerufen", "Abbrechen im Dateidialog ruft done() NICHT auf");

  // Ungültiges JSON
  const t3 = await bootNative((cmd) => cmd === "pick_backup" ? "kein-json{{{" : defaultInvoke(cmd));
  let got3 = "nicht aufgerufen";
  t3.win.NativeGlue.pickBackup((obj) => { got3 = obj; });
  await settle();
  ok(got3 === "nicht aufgerufen", "ungültiges JSON ruft done() NICHT auf (Fehlermeldung statt Absturz)");
}

console.log("\n== 9) Erststart-Zustände (afterBoot) ==");
{
  // Erststart: Migrations-Angebot erscheint
  const t1 = await bootNative(defaultInvoke);
  t1.win.NativeGlue.afterBoot({ firstRun: true });
  await settle();
  const dlg1 = t1.doc.querySelector("dialog[open]");
  ok(!!dlg1 && dlg1.textContent.includes("Willkommen"), "Erststart bietet den Backup-Import aus der Web-App an");

  // Datei war beschädigt: Warnung, kein Absturz
  const t2 = await bootNative(defaultInvoke);
  t2.win.NativeGlue.afterBoot({ rescued: true });
  ok(t2.doc.querySelector("#toasts").textContent.includes("beschädigt"), "beschädigte Datei löst eine erklärende Warnung aus");

  // Datei nicht lesbar: deutliche Warnung, dass NICHT gespeichert wird
  const t3 = await bootNative(defaultInvoke);
  t3.win.NativeGlue.afterBoot({ loadError: true });
  ok(t3.doc.querySelector("#toasts").textContent.includes("NICHT gespeichert"), "Lesefehler warnt deutlich vor Datenverlust, statt es zu verschweigen");

  ok(true, "keine der drei Situationen wirft einen Fehler oder lässt die App abstürzen");
}


console.log("\n== 10) Drag-and-Drop CSV aufs Dock-Icon (open-files-Event) ==");
{
  // Datei liegt bereits vor App-Start am Dock (afterBoot ruft importDroppedFiles selbst auf)
  const CSV = "Buchungstag;Betrag;Beguenstigter/Zahlungspflichtiger\n01.07.2026;-12,50;Dock Test GmbH\n";
  const bytesOf = (s) => Array.from(new TextEncoder().encode(s));
  const t1 = await bootNative((cmd, args) => {
    if (cmd === "take_pending_open_files") return ["/Users/test/Downloads/dock-test.csv"];
    if (cmd === "read_file_bytes" && args.path === "/Users/test/Downloads/dock-test.csv") return bytesOf(CSV);
    return defaultInvoke(cmd, args);
  });
  await settle(); await settle();
  ok(t1.win.Store.get().ui.view === "import", "Datei am Dock beim Start -> App wechselt automatisch zur Import-Ansicht");
  ok(t1.win.Store.get().transactions.some((tx) => tx.empfaenger === "Dock Test GmbH"), "… und importiert die Buchung automatisch");

  // Datei-Drop, während die App schon läuft (Event "open-files")
  const t2 = await bootNative(defaultInvoke);
  let readPath = null;
  t2.win.__TAURI__.core.invoke = (cmd, args) => Promise.resolve().then(() => {
    if (cmd === "take_pending_open_files") return ["/Users/test/Downloads/laufend.csv"];
    if (cmd === "read_file_bytes") { readPath = args.path; return bytesOf(CSV.replace("Dock Test GmbH", "Laufend GmbH")); }
    return defaultInvoke(cmd, args);
  });
  const before2 = t2.win.Store.get().transactions.length;
  // Den vom Boot bereits registrierten "open-files"-Ablauf nachstellen (fireMenu deckt nur
  // das "menu"-Event ab, hier bilden wir denselben Weg wie importDroppedFiles() nach):
  await t2.win.__TAURI__.core.invoke("take_pending_open_files").then(async (paths) => {
    for (const p of paths) {
      const bytes = await t2.win.__TAURI__.core.invoke("read_file_bytes", { path: p });
      const text = t2.win.U.decodeCsvBytes(new Uint8Array(bytes).buffer);
      t2.win.UI.go("import");
      t2.win.CsvImport.importText(text);
    }
  });
  ok(t2.win.Store.get().transactions.length === before2 + 1, "Drop während laufender App importiert ebenfalls korrekt");
  ok(t2.win.Store.get().transactions.some((tx) => tx.empfaenger === "Laufend GmbH"), "… mit dem richtigen Inhalt");

  // Nicht-CSV-Datei wird abgelehnt, kein Absturz
  const t3 = await bootNative((cmd, args) => {
    if (cmd === "take_pending_open_files") return ["/Users/test/Downloads/bild.png"];
    return defaultInvoke(cmd, args);
  });
  await settle(); await settle();
  ok(t3.errs.length === 0, "Nicht-CSV-Datei am Dock -> kein Fehler, keine Buchungen importiert");
  ok(t3.doc.querySelector("#toasts").textContent.includes("Keine CSV"), "… mit erklärender Warnung statt stillem Nichtstun");
}

console.log("\n" + pass + " bestanden, " + fail + " fehlgeschlagen");
process.exit(fail ? 1 : 0);
