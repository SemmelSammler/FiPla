/* store.js — Zustand, Persistenz (localStorage bzw. Datei in der Mac-App), Backup */
"use strict";
var Store = (function () {
  var KEY = "finanzplanung.v1";
  var state = null;
  var memoryOnly = false;
  var listeners = [];

  // Mac-App (Tauri): Zustand liegt als Datei in ~/Library/Application Support/Finanzplanung/
  // statt im localStorage. Im Browser (desktop/mobile) ist NATIVE immer false.
  var NATIVE = (typeof window !== "undefined") && window.APP_MODE === "desktop-native"
    && window.__TAURI__ && window.__TAURI__.core;
  function invoke(cmd, args) { return window.__TAURI__.core.invoke(cmd, args); }

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  // "Kürzlich gelöscht": lebt bewusst NICHT in `state`, damit nichts davon je gespeichert
  // wird oder die Backup-Datei aufbläht — gilt nur für die laufende Sitzung.
  var undoStack = [];
  function pushUndo(label, restoreFn) {
    var entry = { id: "undo-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7), label: label, restore: restoreFn, at: Date.now() };
    undoStack.push(entry);
    if (undoStack.length > 8) undoStack.shift();
    return entry;
  }
  function popUndo(id) {
    var idx = undoStack.findIndex(function (u) { return u.id === id; });
    if (idx === -1) return false;
    var u = undoStack[idx];
    undoStack.splice(idx, 1);
    u.restore();
    return true;
  }
  function getUndoStack() { return undoStack.slice().reverse(); }

  function freshState() {
    var s = {
      version: 1,
      createdAt: new Date().toISOString(),
      transactions: deepClone(SEED.transactions),
      expected: deepClone(SEED.expected),
      categories: deepClone(DEFAULTS.categories),
      months: {},
      fi: deepClone(DEFAULTS.fi),
      hauskauf: deepClone(DEFAULTS.hauskauf),
      hochzeit: deepClone(DEFAULTS.hochzeit),
      kinder: deepClone(DEFAULTS.kinder),
      depot: deepClone(DEFAULTS.depot),
      ui: {
        month: U.currentMonth(), view: "dashboard",
        prefs: { accentColor: null, density: "comfortable", startView: "last", followSystemTheme: true, touchIdEnabled: true }
      }
    };
    Logic.enrichAll(s);
    return s;
  }

  function storageAvailable() {
    try {
      var k = "__fp_test__";
      localStorage.setItem(k, "1"); localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  /* Einstiegspunkt beim App-Start. Ruft done(info) auf, sobald der Zustand steht.
     Browser: synchron über localStorage (Verhalten unverändert).
     Mac-App: asynchron aus state.json; info.firstRun = true, wenn noch keine Datei existiert. */
  function afterLoad(info) {
    var prefs = state.ui.prefs || {};
    if (prefs.startView && prefs.startView !== "last") state.ui.view = prefs.startView;
    applyPrefs();
    return info;
  }
  function init(done) {
    if (!NATIVE) { load(); done(afterLoad({})); return; }
    invoke("load_state").then(function (raw) {
      if (raw == null) {
        // Erststart: Seed-Daten laden und sofort als Datei anlegen
        state = freshState();
        persist();
        done(afterLoad({ firstRun: true }));
        return;
      }
      try {
        state = migrate(JSON.parse(raw));
        Logic.enrichAll(state);
        done(afterLoad({}));
      } catch (e) {
        // Datei unlesbar → beiseite legen (state.json.defekt-…), nicht überschreiben
        console.error("state.json unlesbar, lege Sicherung an:", e);
        invoke("rescue_state").catch(function () {});
        state = freshState();
        persist();
        done(afterLoad({ rescued: true }));
      }
    }).catch(function (e) {
      // Datei nicht lesbar (z. B. Rechteproblem): nur im Speicher arbeiten, nichts überschreiben
      console.error("Laden aus Datei fehlgeschlagen:", e);
      memoryOnly = true;
      state = freshState();
      done(afterLoad({ loadError: true }));
    });
  }

  function load() {
    if (!storageAvailable()) {
      memoryOnly = true;
      state = freshState();
      return state;
    }
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        state = migrate(JSON.parse(raw));
        Logic.enrichAll(state);
      } else {
        state = freshState();
        persist();
      }
    } catch (e) {
      console.error("Laden fehlgeschlagen, starte mit Beispieldaten:", e);
      state = freshState();
    }
    return state;
  }

  function migrate(s) {
    // Fehlende Felder gegen Defaults auffüllen (macht künftige Versionen robust)
    var d = freshState();
    ["transactions", "expected", "categories", "months", "fi", "hauskauf", "hochzeit", "kinder", "depot", "ui"].forEach(function (k) {
      if (s[k] == null) s[k] = d[k];
    });
    Object.keys(d.fi).forEach(function (k) { if (s.fi[k] == null) s.fi[k] = d.fi[k]; });
    Object.keys(d.hauskauf).forEach(function (k) { if (s.hauskauf[k] == null) s.hauskauf[k] = d.hauskauf[k]; });
    Object.keys(d.kinder).forEach(function (k) { if (s.kinder[k] == null) s.kinder[k] = d.kinder[k]; });
    Object.keys(d.hochzeit).forEach(function (k) { if (s.hochzeit[k] == null) s.hochzeit[k] = d.hochzeit[k]; });
    (s.hochzeit.urlaub || []).forEach(function (u) { if (u.bezahlt == null) u.bezahlt = false; });
    if (!s.ui.month) s.ui.month = U.currentMonth();
    if (!s.ui.prefs) s.ui.prefs = {};
    var prefDefaults = { accentColor: null, density: "comfortable", startView: "last", followSystemTheme: true, touchIdEnabled: true };
    Object.keys(prefDefaults).forEach(function (k) { if (s.ui.prefs[k] === undefined) s.ui.prefs[k] = prefDefaults[k]; });
    s.version = 1;
    return s;
  }

  var persist = U.debounce(function () {
    if (memoryOnly) return;
    if (NATIVE) {
      // Datei-Schreiben passiert crash-sicher auf der Rust-Seite (Temp-Datei + atomares Umbenennen).
      // Antwort "conflict": Datei wurde extern geändert (anderes Gerät via iCloud) → Dialog statt Überschreiben.
      invoke("save_state", { json: JSON.stringify(state) }).then(function (res) {
        if (res === "conflict" && window.NativeGlue) NativeGlue.handleConflict();
      }).catch(function (e) {
        console.error("Speichern in Datei fehlgeschlagen:", e);
        U.toast("Speichern fehlgeschlagen — Änderungen ggf. nicht gesichert!", "warn");
      });
      return;
    }
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.error("Speichern fehlgeschlagen:", e); U.toast("Speichern fehlgeschlagen – Speicher voll?", "warn"); }
  }, 250);

  function applyPrefs() {
    if (typeof document === "undefined" || !state) return;
    var prefs = state.ui.prefs || {};
    var root = document.documentElement;
    if (prefs.accentColor) { root.style.setProperty("--accent", prefs.accentColor); root.style.setProperty("--accent-dim", prefs.accentColor + "26"); }
    else { root.style.removeProperty("--accent"); root.style.removeProperty("--accent-dim"); }
    document.body.classList.toggle("density-compact", prefs.density === "compact");
    if (window.NativeGlue && window.NativeGlue.applyThemePref) window.NativeGlue.applyThemePref(prefs.followSystemTheme);
    if (window.NativeGlue && window.NativeGlue.mirrorTouchIdPref) window.NativeGlue.mirrorTouchIdPref(prefs.touchIdEnabled);
  }
  function commit(opts) {
    if (opts && opts.recompute) Logic.enrichAll(state);
    persist();
    applyPrefs();
    listeners.forEach(function (fn) { fn(state); });
  }
  function onChange(fn) { listeners.push(fn); }

  function monthData(mk) {
    if (!state.months[mk]) state.months[mk] = { giro: null, konto2: null, kkSaldo: null, kkDatum: "", planned: [] };
    if (!state.months[mk].planned) state.months[mk].planned = [];
    return state.months[mk];
  }

  /* ---------- Backup ---------- */
  function exportBackup() {
    var payload = deepClone(state);
    payload.exportedAt = new Date().toISOString();
    payload.app = "Finanzplanung";
    var name = "finanzplanung-backup-" + U.todayIso() + ".json";
    U.download(name, JSON.stringify(payload, null, 1));
    // Mac-App: U.download ist nativ überschrieben (Speichern-Dialog) und meldet selbst
    if (!NATIVE) U.toast("Backup exportiert: " + name, "ok");
  }
  function validateBackup(obj) {
    return obj && typeof obj === "object" && Array.isArray(obj.transactions) && Array.isArray(obj.expected) && obj.version >= 1;
  }
  // mode: "replace" | "merge"
  function importBackup(obj, mode) {
    if (!validateBackup(obj)) throw new Error("Datei ist kein gültiges Finanzplanung-Backup.");
    if (mode === "replace") {
      state = migrate(deepClone(obj));
      Logic.enrichAll(state);
    } else {
      // Merge: Transaktionen dedupliziert zusammenführen, Rest aus Backup übernehmen falls neuer
      var res = Logic.dedupeImport(state.transactions, deepClone(obj.transactions));
      res.added.forEach(function (t) { if (!t.id) t.id = U.uid("tx"); state.transactions.push(t); });
      ["expected", "categories", "fi", "hauskauf", "hochzeit", "kinder"].forEach(function (k) { state[k] = deepClone(obj[k]); });
      if (obj.depot) state.depot = deepClone(obj.depot);
      Object.keys(obj.months || {}).forEach(function (mk) { state.months[mk] = deepClone(obj.months[mk]); });
      Logic.enrichAll(state);
    }
    commit();
    return true;
  }
  function resetToSeed() {
    state = freshState();
    commit();
  }

  /* Extern geänderten Stand übernehmen (Konflikt-Lösung „anderes Gerät gewinnt“).
     Kein persist — die Datei auf der Platte IST bereits dieser Stand. */
  function adoptExternal(raw) {
    state = migrate(JSON.parse(raw));
    Logic.enrichAll(state);
    listeners.forEach(function (fn) { fn(state); });
  }

  return {
    init: init, load: load, get: function () { return state; }, commit: commit, onChange: onChange,
    monthData: monthData, exportBackup: exportBackup, importBackup: importBackup,
    resetToSeed: resetToSeed, adoptExternal: adoptExternal,
    isMemoryOnly: function () { return memoryOnly; },
    isNative: function () { return !!NATIVE; },
    pushUndo: pushUndo, popUndo: popUndo, getUndoStack: getUndoStack,
    applyPrefs: applyPrefs
  };
})();
