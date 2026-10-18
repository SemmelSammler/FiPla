/* views-backup.js — Backup & Einstellungen */
"use strict";
(function () {
  var el = U.el;

  /* Import-Dialog (Zusammenführen/Ersetzen). Auf IIFE-Ebene, damit auch das
     native Menüband (⌘⇧O) ihn öffnen kann — Verhalten unverändert. */
  function askImportMode(obj) {
    var dlg = el("dialog", { class: "modal" });
    function close() { dlg.close(); dlg.remove(); }
    function run(mode) {
      try {
        Store.importBackup(obj, mode);
        close();
        U.toast(mode === "replace" ? "Backup importiert — Zustand ersetzt." : "Backup zusammengeführt.", "ok");
        UI.render();
      } catch (e) { U.toast(String(e.message || e), "err"); }
    }
    dlg.appendChild(el("h3", { style: "margin:0 0 8px" }, "Backup importieren"));
    dlg.appendChild(el("p", { class: "muted small", style: "margin:0 0 6px" },
      "Gefunden: " + ((obj.transactions || []).length) + " Buchungen, " + ((obj.expected || []).length) + " Posten" +
      (obj.exportedAt ? " · exportiert am " + U.dateDE(obj.exportedAt.slice(0, 10)) : "") + "."));
    dlg.appendChild(el("p", { class: "small", style: "margin:0 0 16px;color:var(--warn)" },
      "„Ersetzen“ überschreibt alle aktuellen Daten unwiderruflich."));
    dlg.appendChild(el("div", { class: "btn-row", style: "justify-content:flex-end" },
      el("button", { class: "btn ghost", onclick: close }, "Abbrechen"),
      el("button", { class: "btn", onclick: function () { run("merge"); } }, "Zusammenführen"),
      el("button", { class: "btn danger", onclick: function () {
        UI.confirmDialog({ title: "Wirklich ersetzen?", body: "Der aktuelle Zustand wird vollständig durch das Backup ersetzt.", okLabel: "Ja, ersetzen", danger: true }, function (yes) {
          if (yes) run("replace");
        });
      } }, "Ersetzen")));
    document.body.appendChild(dlg);
    dlg.showModal();
  }
  window.BackupImport = askImportMode;

  UI.registerView("backup", function (host, state) {
    var loc = Store.isNative() && window.NativeGlue ? NativeGlue.stateLocation() : null;
    host.appendChild(UI.pageHead("Backup & Einstellungen",
      Store.isNative()
        ? (loc && loc.indexOf("Mobile Documents") !== -1
          ? "Daten liegen in deinem iCloud Drive (Ordner „Finanzplanung“) und synchronisieren automatisch"
          : "Daten liegen als Datei unter " + (loc || "…"))
        : "Daten liegen nur in diesem Browser (localStorage) — Geräte-Wechsel per Backup-Datei"));

    if (Store.isMemoryOnly()) {
      host.appendChild(el("div", { class: "callout warn", style: "margin-bottom:16px" },
        "⚠️ Dieser Browser erlaubt kein dauerhaftes Speichern (localStorage blockiert). Änderungen gehen beim Schließen verloren — bitte regelmäßig ein Backup exportieren."));
    }

    /* ---- Darstellung & Verhalten ---- */
    var prefs = state.ui.prefs;
    var VIEW_LABELS = [["dashboard", "Dashboard"], ["monat", "Monat"], ["import", "CSV-Import"], ["posten", "Posten & Kategorien"], ["fi", "FI-Planung"], ["hauskauf", "Hauskauf"], ["hochzeit", "Hochzeit"], ["kinder", "Kinder"], ["backup", "Backup & Einstellungen"]];
    host.appendChild(el("section", { class: "card" },
      el("h2", { class: "card-title" }, "Darstellung & Verhalten"),
      el("div", { class: "fields" },
        UI.field("Akzentfarbe", (function () {
          var wrap = el("div", { style: "display:flex;gap:8px;align-items:center" });
          var inp = el("input", { type: "color", value: prefs.accentColor || "#8B93FF", style: "width:48px;height:34px;padding:2px;background:none;border:1px solid var(--line);border-radius:9px" });
          inp.addEventListener("change", function () { prefs.accentColor = inp.value; Store.commit(); UI.render(); });
          var reset = el("button", { class: "btn sm ghost", onclick: function () { prefs.accentColor = null; Store.commit(); UI.render(); } }, "Standard");
          wrap.appendChild(inp); wrap.appendChild(reset);
          return wrap;
        })(), "gilt für Buttons, Links, Akzent-Elemente app-weit"),
        UI.field("Dichte", (function () {
          var wrap = el("div", { class: "btn-row" });
          [["comfortable", "Komfortabel"], ["compact", "Kompakt"]].forEach(function (o) {
            wrap.appendChild(el("button", {
              class: "chip" + (prefs.density === o[0] ? " on" : ""),
              onclick: function () { prefs.density = o[0]; Store.commit(); UI.render(); }
            }, o[1]));
          });
          return wrap;
        })(), "kompakt = weniger Abstand, mehr auf einen Blick"),
        (function () {
          var startFld = UI.field("Startansicht", (function () {
            var sel = el("select", {}, el("option", { value: "last", selected: prefs.startView === "last" }, "Zuletzt geöffnet"),
              VIEW_LABELS.map(function (v) { return el("option", { value: v[0], selected: prefs.startView === v[0] }, v[1]); }));
            sel.addEventListener("change", function () { prefs.startView = sel.value; Store.commit(); });
            return sel;
          })(), "welche Seite beim App-Start zuerst erscheint");
          // Braucht mehr Platz als die 170px-Standardbreite der anderen Felder, sonst
          // wird der Options-Text im geschlossenen <select> abgeschnitten.
          startFld.style.gridColumn = "span 2";
          startFld.style.maxWidth = "260px";
          return startFld;
        })()),
      Store.isNative() ? el("div", { class: "fields", style: "margin-top:14px;padding-top:14px;border-top:1px solid var(--line)" },
        UI.field("Erscheinungsbild", (function () {
          var wrap = el("label", { style: "display:flex;align-items:center;gap:8px;padding:7px 0" });
          var chk = el("input", { type: "checkbox", checked: prefs.followSystemTheme !== false });
          chk.addEventListener("change", function () { prefs.followSystemTheme = chk.checked; Store.commit(); UI.render(); U.toast(chk.checked ? "Folgt jetzt dem System-Erscheinungsbild." : "Bleibt fest dunkel, unabhängig vom System.", "ok"); });
          wrap.appendChild(chk); wrap.appendChild(el("span", { class: "small" }, "Dem System (hell/dunkel) folgen"));
          return wrap;
        })(), "aus = immer dunkel, unabhängig von macOS"),
        NativeGlue.unlockSupported() ? UI.field("Sicherheit", (function () {
          var wrap = el("label", { style: "display:flex;align-items:center;gap:8px;padding:7px 0" });
          var chk = el("input", { type: "checkbox", checked: prefs.touchIdEnabled !== false });
          chk.addEventListener("change", function () {
            prefs.touchIdEnabled = chk.checked; Store.commit();
            U.toast(chk.checked ? "Touch-ID-Sperre aktiviert — gilt ab dem nächsten Start." : "Touch-ID-Sperre deaktiviert — gilt ab dem nächsten Start.", "ok");
          });
          wrap.appendChild(chk); wrap.appendChild(el("span", { class: "small" }, "Touch-ID-Sperre beim Start"));
          return wrap;
        })(), "bei Finanzdaten empfohlen · Änderung wirkt beim nächsten Start") : null) : null));

    var undoList = Store.getUndoStack();
    if (undoList.length) {
      host.appendChild(el("section", { class: "card" },
        el("h2", { class: "card-title" }, "Kürzlich gelöscht ", el("span", { class: "hint" }, "nur für diese Sitzung — verschwindet beim Neustart")),
        undoList.map(function (u) {
          return el("div", { class: "person-row" },
            el("span", { class: "small muted", style: "flex:1" }, u.label),
            el("button", {
              class: "btn sm", onclick: function () { Store.popUndo(u.id); UI.render(); U.toast("Wiederhergestellt.", "ok"); }
            }, "↩ Wiederherstellen"));
        })));
    }

    var txCount = state.transactions.length;
    var monthsWithData = Object.keys(state.months).length;
    host.appendChild(el("section", { class: "card" },
      el("h2", { class: "card-title" }, "Aktueller Datenbestand"),
      el("div", { class: "grid kpi" },
        UI.kpi("Buchungen", el("span", {}, String(txCount)), ""),
        UI.kpi("Erwartete Posten", el("span", {}, String(state.expected.length)), state.expected.filter(function (i) { return i.aktiv; }).length + " aktiv"),
        UI.kpi("Kategorien", el("span", {}, String(state.categories.length)), ""),
        UI.kpi("Monate mit manuellen Daten", el("span", {}, String(monthsWithData)), "Kontostände / Planung"))));

    /* ---- Export ---- */
    host.appendChild(el("section", { class: "card" },
      el("h2", { class: "card-title" }, "⇓ Backup exportieren"),
      el("p", { class: "small muted", style: "margin:0 0 12px" },
        "Lädt eine JSON-Datei mit dem kompletten App-Zustand herunter (Buchungen, Posten, Kategorien, Monatsdaten, alle Planungs-Annahmen). Diese Datei kannst du z. B. per AirDrop oder Cloud-Ordner auf ein anderes Gerät übertragen und dort importieren."),
      el("button", { class: "btn good", onclick: function () { Store.exportBackup(); } }, "⇓ Backup exportieren")));

    /* ---- Import ---- */
    var fileInput = el("input", { type: "file", accept: ".json,application/json", style: "display:none" });
    fileInput.addEventListener("change", function () {
      var f = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        var obj;
        try { obj = JSON.parse(fr.result); }
        catch (e) { U.toast("Datei ist kein gültiges JSON.", "err"); return; }
        askImportMode(obj);
      };
      fr.readAsText(f);
    });
    host.appendChild(el("section", { class: "card" },
      el("h2", { class: "card-title" }, "⇪ Backup importieren"),
      el("p", { class: "small muted", style: "margin:0 0 12px" },
        "\u201EZusammenführen\u201C ergänzt neue Buchungen (dedupliziert) und übernimmt Einstellungen/Planung aus dem Backup. \u201EErsetzen\u201C stellt exakt den Stand der Datei her."),
      el("button", { class: "btn", onclick: function () {
        if (Store.isNative()) NativeGlue.pickBackup(askImportMode);
        else fileInput.click();
      } }, "⇪ Backup-Datei wählen"),
      fileInput));

    /* ---- Beispieldaten / Reset ---- */
    host.appendChild(el("section", { class: "card" },
      el("h2", { class: "card-title" }, "Beispieldaten & Zurücksetzen"),
      el("p", { class: "small muted", style: "margin:0 0 12px" },
        "Stellt den Auslieferungszustand wieder her: 188 Buchungen (Mär–Jun 2026) und 18 erwartete Posten aus der Original-Excel, plus alle Standard-Annahmen der Planungs-Module."),
      el("button", {
        class: "btn danger", onclick: function () {
          UI.confirmDialog({
            title: "Auf Beispieldaten zurücksetzen?",
            body: "Alle aktuellen Daten in diesem Browser werden durch den Startzustand ersetzt. Vorher ggf. ein Backup exportieren!",
            okLabel: "Zurücksetzen", danger: true
          }, function (yes) {
            if (yes) { Store.resetToSeed(); U.toast("Beispieldaten geladen.", "ok"); }
            UI.render();
          });
        }
      }, "↺ Beispieldaten laden (Reset)")));

    host.appendChild(el("section", { class: "card" },
      el("h2", { class: "card-title" }, "Hinweise"),
      el("ul", { class: "small muted", style: "margin:0;padding-left:20px;line-height:1.9" },
        el("li", {}, "Die App funktioniert komplett offline — einfach die HTML-Datei im Browser öffnen (gerne als Lesezeichen oder \u201EZum Home-Bildschirm\u201C)."),
        el("li", {}, "Daten werden pro Browser/Gerät gespeichert. Für den Abgleich zwischen Laptop und Handy: Backup exportieren → Datei übertragen → importieren."),
        el("li", {}, "Beim Löschen der Browser-Daten (Cache/Website-Daten) gehen auch die App-Daten verloren — regelmäßige Backups lohnen sich."))));
  });
})();
