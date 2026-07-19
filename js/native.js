/* native.js — Glue-Code für die Mac-App (Tauri, APP_MODE = "desktop-native").
   In den Web-Builds (desktop/mobile) ist alles hier wirkungslos. */
"use strict";
var NativeGlue = (function () {
  function active() {
    return window.APP_MODE === "desktop-native" && !!window.__TAURI__;
  }
  function invoke(cmd, args) { return window.__TAURI__.core.invoke(cmd, args); }

  /* Nur die Mac-App folgt dem System-Hell/Dunkel-Modus (styles.css reagiert auf
     html.theme-auto). Web-Builds bleiben unverändert fest dunkel. Die Klasse wird erst
     gesetzt/entfernt, sobald der Zustand geladen ist und die Einstellung feststeht
     (siehe applyThemePref, aufgerufen von Store.applyPrefs) — vorher ist die Präferenz
     schlicht noch nicht bekannt. */
  function applyThemePref(follow) {
    document.documentElement.classList.toggle("theme-auto", active() && follow !== false);
  }

  /* Touch-ID-Sperre beim Start: Inhalt bleibt verdeckt, bis macOS entsperrt.
     Auf Macs ohne Touch ID fragt macOS automatisch das Anmelde-Passwort ab.
     Abschaltbar in den Einstellungen. Da diese Entscheidung VOR dem eigentlichen
     Laden des Zustands fallen muss (der Zustand selbst liegt ja hinter der Sperre),
     wird die Präferenz zusätzlich in localStorage gespiegelt — die eigentliche
     Quelle bleibt state.ui.prefs.touchIdEnabled, gespiegelt bei jedem applyPrefs(). */
  function requiresUnlock() {
    if (!active()) return false;
    try { return localStorage.getItem("fipla.touchIdEnabled") !== "false"; }
    catch (e) { return true; }
  }
  function mirrorTouchIdPref(enabled) {
    try { localStorage.setItem("fipla.touchIdEnabled", enabled === false ? "false" : "true"); }
    catch (e) { /* localStorage nicht verfügbar — Sperre bleibt sicherheitshalber an */ }
  }
  function unlock(done) {
    var el = U.el;
    var retry = el("button", { class: "btn primary", style: "display:none" }, "🔒 Entsperren");
    var overlay = el("div", {
      style: "position:fixed;inset:0;z-index:9999;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px"
    },
      el("span", { style: "font-family:var(--mono);font-weight:700;font-size:26px;letter-spacing:2px;color:var(--pos)" }, "FINANZ"),
      el("span", { class: "muted" }, "Mit Touch ID entsperren"),
      retry);
    function attempt() {
      retry.style.display = "none";
      invoke("authenticate").then(function (ok) {
        if (ok) { overlay.remove(); done(); }
        else { retry.style.display = ""; }
      }).catch(function (e) {
        console.error("Touch ID:", e);
        overlay.remove(); done();
        U.toast("Touch ID nicht verfügbar — App startet ohne Sperre.", "warn");
      });
    }
    retry.addEventListener("click", attempt);
    document.body.appendChild(overlay);
    attempt();
  }

  /* Sync-Konflikt (Datei extern geändert, während die App offen war):
     nie stumm überschreiben — Nutzer entscheidet, Verlierer-Stand wird gesichert. */
  var conflictOpen = false;
  function handleConflict() {
    if (conflictOpen) return;
    conflictOpen = true;
    var el = U.el;
    var dlg = el("dialog", { class: "modal" });
    function done() { dlg.close(); dlg.remove(); }
    dlg.addEventListener("close", function () { conflictOpen = false; });
    dlg.appendChild(el("h3", { style: "margin:0 0 8px" }, "⚠️ Sync-Konflikt erkannt"));
    dlg.appendChild(el("p", { class: "muted", style: "margin:0 0 6px;max-width:460px" },
      "Die Datendatei wurde geändert, während die App offen war — vermutlich von einem " +
      "anderen Gerät über iCloud. Nichts geht verloren: Die nicht gewählte Version wird " +
      "als Kopie im Datenordner gesichert."));
    dlg.appendChild(el("div", { class: "btn-row", style: "justify-content:flex-end;margin-top:14px" },
      el("button", { class: "btn ghost", onclick: done }, "Später entscheiden"),
      el("button", { class: "btn", onclick: function () {
        invoke("resolve_conflict_take_theirs", { json: JSON.stringify(Store.get()) }).then(function (content) {
          Store.adoptExternal(content);
          done(); UI.render();
          U.toast("Stand vom anderen Gerät übernommen — deine Sitzung liegt als Kopie im Datenordner.", "ok");
        }).catch(function (e) { done(); U.toast("Übernehmen fehlgeschlagen: " + e, "err"); });
      } }, "Anderen Stand übernehmen"),
      el("button", { class: "btn primary", onclick: function () {
        invoke("resolve_conflict_keep_mine", { json: JSON.stringify(Store.get()) }).then(function () {
          done();
          U.toast("Deine Version gilt — der andere Stand liegt als Kopie im Datenordner.", "ok");
        }).catch(function (e) { done(); U.toast("Speichern fehlgeschlagen: " + e, "err"); });
      } }, "Meine Version behalten")));
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  /* Datei-Export: statt Browser-Download ein natives „Sichern unter“.
     Ersetzt U.download zentral — gilt damit für Backup- UND CSV-Export. */
  if (active()) {
    U.download = function (filename, text) {
      invoke("save_file_dialog", { contents: text, defaultName: filename })
        .then(function (path) {
          if (path) U.toast("Gespeichert: " + path, "ok");
          // abgebrochen (path == null): bewusst keine Meldung
        })
        .catch(function (e) { U.toast("Speichern fehlgeschlagen: " + e, "err"); });
    };
  }

  /* Menüband: eigene Menüpunkte (Datei/Ansicht) kommen als Event "menu" aus Rust.
     Vordefinierte Punkte (Beenden, Kopieren, Vollbild …) erledigt macOS direkt. */
  if (active()) {
    window.__TAURI__.event.listen("menu", function (e) {
      var id = String(e.payload || "");
      if (id.indexOf("view:") === 0) { UI.go(id.slice(5)); return; }
      if (id === "backup-export") { Store.exportBackup(); return; }
      if (id === "backup-import") {
        pickBackup(function (obj) { window.BackupImport(obj); });
        return;
      }
      if (id === "csv-import") {
        UI.go("import");
        // Dateiwähler direkt öffnen, falls WebKit das ohne Klick-Geste zulässt
        var inp = document.querySelector('#view input[type="file"]');
        if (inp) inp.click();
      }
    });
  }

  /* CSV per Drag-and-Drop aufs Dock-Icon (oder „Öffnen mit“): Rust puffert die
     Pfade und meldet sich per Event "open-files". Ablauf: Pfade abholen → Bytes
     lesen (gleiche Encoding-Erkennung wie beim Datei-Dialog) → zur Import-Ansicht
     wechseln → denselben Import-Fluss anstoßen. */
  function importDroppedFiles() {
    invoke("take_pending_open_files").then(function (paths) {
      (paths || []).forEach(function (p) {
        if (!/\.(csv|tsv|txt)$/i.test(p)) { U.toast("Keine CSV-Datei: " + p, "warn"); return; }
        invoke("read_file_bytes", { path: p }).then(function (bytes) {
          var text = U.decodeCsvBytes(new Uint8Array(bytes).buffer);
          UI.go("import");
          if (window.CsvImport) CsvImport.importText(text);
        }).catch(function (e) { U.toast("Datei nicht lesbar: " + e, "err"); });
      });
    }).catch(function () {});
  }
  if (active()) {
    window.__TAURI__.event.listen("open-files", importDroppedFiles);
  }

  /* Natives „Öffnen“ für Backup-Dateien; done(obj) nur bei gültigem JSON. */
  function pickBackup(done) {
    invoke("pick_backup").then(function (content) {
      if (content == null) return; // abgebrochen
      var obj;
      try { obj = JSON.parse(content); }
      catch (e) { U.toast("Datei ist kein gültiges JSON.", "err"); return; }
      done(obj);
    }).catch(function (e) { U.toast("Öffnen fehlgeschlagen: " + e, "err"); });
  }

  /* Erststart der Mac-App (noch keine state.json): anbieten, ein Backup
     aus der Web-App zu importieren — sonst bleiben die Seed-Daten. */
  function offerMigration() {
    UI.confirmDialog({
      title: "Willkommen in der Mac-App!",
      body: "Möchtest du ein Backup aus der Web-App importieren (JSON-Datei)? " +
        "Sonst startet die App mit Beispieldaten — importieren geht später jederzeit " +
        "unter „Backup & Einstellungen“.",
      okLabel: "Backup importieren…", cancelLabel: "Mit Beispieldaten starten"
    }, function (yes) {
      if (!yes) return;
      pickBackup(function (obj) {
        try {
          Store.importBackup(obj, "replace");
          U.toast("Backup importiert — deine Daten sind jetzt in der Mac-App.", "ok");
        } catch (e) {
          U.toast(String(e.message || e), "err");
        }
        UI.render();
      });
    });
  }

  var stateLocation = null;
  function afterBoot(info) {
    if (!active() || !info) return;
    invoke("state_location").then(function (p) { stateLocation = p; }).catch(function () {});
    importDroppedFiles(); // Datei wurde evtl. schon VOR dem App-Start aufs Icon gezogen
    if (info.firstRun) offerMigration();
    if (info.rescued) {
      U.toast("Die Datendatei war beschädigt und wurde als Sicherung beiseitegelegt " +
        "(state.json.defekt-…). Die App startet mit Beispieldaten.", "warn");
    }
    if (info.loadError) {
      U.toast("Datendatei nicht lesbar — Änderungen werden in dieser Sitzung NICHT gespeichert!", "warn");
    }
  }

  return {
    active: active, afterBoot: afterBoot, pickBackup: pickBackup,
    requiresUnlock: requiresUnlock, unlock: unlock, handleConflict: handleConflict,
    applyThemePref: applyThemePref, mirrorTouchIdPref: mirrorTouchIdPref,
    stateLocation: function () { return stateLocation; }
  };
})();
