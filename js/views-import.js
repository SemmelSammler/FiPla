/* views-import.js — CSV-Import (Sparkasse) */
"use strict";
(function () {
  var el = U.el, td = UI.td;

  function readFileSmart(file, cb) {
    var fr = new FileReader();
    fr.onload = function () {
      var buf = fr.result;
      var utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      // Ersatzzeichen → vermutlich Windows-1252 (typisch für Sparkassen-Exporte)
      if (utf8.indexOf("\uFFFD") !== -1) {
        try { cb(new TextDecoder("windows-1252").decode(buf)); return; } catch (e) { /* fallthrough */ }
      }
      cb(utf8);
    };
    fr.onerror = function () { U.toast("Datei konnte nicht gelesen werden.", "err"); };
    fr.readAsArrayBuffer(file);
  }

  function handleFile(state, file, resultHost) {
    readFileSmart(file, function (text) { handleText(state, text, resultHost); });
  }

  /* Kern des Imports (Datei bereits als Text) \u2014 auch vom Dock-Drop der Mac-App genutzt */
  function handleText(state, text, resultHost) {
    (function () {
      var parsed = Logic.parseSparkasseCsv(text);
      if (!parsed.transactions.length) {
        U.clear(resultHost);
        resultHost.appendChild(el("div", { class: "callout warn" },
          "Keine Buchungen erkannt. " + (parsed.errors[0] || "")));
        return;
      }
      var res = Logic.dedupeImport(state.transactions, parsed.transactions);
      res.added.forEach(function (t) {
        t.id = U.uid("tx"); t.manuelleKat = false;
        Logic.enrichTx(t, state.expected, state.categories);
        state.transactions.push(t);
      });
      Store.commit();
      U.clear(resultHost);
      var matched = res.added.filter(function (t) { return t.match; }).length;
      var unkat = res.added.filter(function (t) { return t.kategorieId === "sys-einnahme" || t.kategorieId === "sys-ausgabe"; }).length;
      resultHost.appendChild(el("div", { class: "callout", style: "margin-bottom:12px" },
        el("strong", {}, res.added.length + " neue Buchungen importiert"),
        " · " + res.skipped + " bereits vorhanden (übersprungen)" +
        (res.removedVorgemerkt && res.removedVorgemerkt.length ? " · " + res.removedVorgemerkt.length + " überholte Vormerkung(en) entfernt" : "") +
        (parsed.errors.length ? " · " + parsed.errors.length + " Zeilen unlesbar" : "") +
        " — davon " + matched + " erwarteten Posten zugeordnet, " + unkat + " unkategorisiert."));
      if (res.added.length) {
        var trs = res.added.slice().sort(function (a, b) { return a.datum < b.datum ? 1 : -1; }).slice(0, 40).map(function (t) {
          return el("tr", {},
            td(el("span", { class: "num small" }, U.dateDE(t.datum))),
            td([el("div", { class: "cell-main" }, t.empfaenger || t.text || "—"), el("div", { class: "cell-sub" }, t.zweck || "")]),
            td(UI.categorySelect(state, t)),
            td(t.match ? el("span", { class: "badge ok" }, "Posten") : el("span", { class: "badge offen" }, "frei")),
            td(UI.money(t.betrag), "r num"));
        });
        resultHost.appendChild(el("div", { class: "scroll-y" },
          UI.table(["Datum", "Buchung", "Kategorie", "Match", { label: "Betrag", r: 1 }], trs)));
        if (res.added.length > 40) resultHost.appendChild(el("p", { class: "small muted" }, "… und " + (res.added.length - 40) + " weitere. Alle Buchungen findest du im Monatscockpit."));
      }
      U.toast(res.added.length + " neu · " + res.skipped + " übersprungen" +
        (res.removedVorgemerkt && res.removedVorgemerkt.length ? " · " + res.removedVorgemerkt.length + " Vormerkung(en) bereinigt" : ""), "ok");
    })();
  }

  UI.registerView("import", function (host, state) {
    host.appendChild(UI.pageHead("CSV-Import", "Sparkasse CSV-CAMT / MT940-Export · Semikolon oder Tab · deutsche Zahlen"));

    var resultHost = el("div", {});
    // Einstiegspunkt für den Dock-Drop der Mac-App (native.js ruft das nach UI.go("import") auf)
    window.CsvImport = { importText: function (text) { handleText(state, text, resultHost); } };
    var fileInput = el("input", { type: "file", accept: ".csv,.txt,.tsv,text/csv", style: "display:none" });
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) handleFile(state, fileInput.files[0], resultHost);
      fileInput.value = "";
    });
    var zone = el("div", { class: "dropzone", role: "button", tabindex: "0" },
      el("div", { class: "big" }, "⇪"),
      el("div", { style: "margin-top:6px;font-weight:600;color:var(--text)" }, "CSV-Datei hier ablegen"),
      el("div", { class: "small", style: "margin-top:4px" }, "oder klicken zum Auswählen · doppelte Buchungen werden automatisch übersprungen"));
    zone.addEventListener("click", function () { fileInput.click(); });
    zone.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
    ["dragenter", "dragover"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove("drag"); });
    });
    zone.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(state, f, resultHost);
    });

    host.appendChild(el("section", { class: "card" }, zone, fileInput));
    host.appendChild(el("section", { class: "card" },
      el("h2", { class: "card-title" }, "So funktioniert der Import"),
      el("ol", { class: "small muted", style: "margin:0;padding-left:20px;line-height:1.9" },
        el("li", {}, "Jede Buchung wird zuerst gegen die erwarteten Posten abgeglichen (Suchbegriff in Empfänger oder Verwendungszweck + Vorzeichen-Check)."),
        el("li", {}, "Bei Posten mit Stichtag wird der effektive Monat verschoben (z. B. Gehalt am 25. → Folgemonat)."),
        el("li", {}, "Ohne Posten-Treffer greifen deine Kategorie-Regeln (z. B. REWE → Lebensmittel)."),
        el("li", {}, "Der Rest landet in \u201ESonstige Einnahme/Ausgabe\u201C und kann direkt hier oder im Monatscockpit nachkategorisiert werden — auf Wunsch merkt sich die App daraus eine neue Regel."))));
    host.appendChild(resultHost);
  });
})();
