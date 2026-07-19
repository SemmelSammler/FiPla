/* views-posten.js — Erwartete Posten & Kategorie-Verwaltung */
"use strict";
(function () {
  var el = U.el, td = UI.td;

  UI.registerView("posten", function (host, state) {
    host.appendChild(UI.pageHead("Posten & Kategorien", "Wiederkehrende erwartete Posten und automatische Kategorie-Regeln"));

    /* ---------- Erwartete Posten ---------- */
    function catSelForItem(it) {
      var sel = el("select", {});
      state.categories.forEach(function (c) {
        sel.appendChild(el("option", { value: c.id, selected: c.id === it.kategorieId }, c.icon + " " + c.name));
      });
      sel.addEventListener("change", function () { it.kategorieId = sel.value; Store.commit({ recompute: true }); });
      return sel;
    }
    var itemRows = state.expected.map(function (it) {
      var row = el("tr", { style: it.aktiv ? "" : "opacity:.45" },
        td(UI.textInput(it.beschreibung, function (v) { it.beschreibung = v; Store.commit(); })),
        td((function () {
          var sel = el("select", {},
            ["Einnahme", "Fixkosten", "Schulden"].map(function (t) { return el("option", { value: t, selected: it.typ === t }, t); }));
          sel.addEventListener("change", function () { it.typ = sel.value; Store.commit({ recompute: true }); UI.render(); });
          return sel;
        })()),
        td(UI.numInput({ value: it.betrag, onchange: function (v) { it.betrag = v; Store.commit({ recompute: true }); UI.render(); } }), "r"),
        td(UI.textInput(it.suchbegriff, function (v) { it.suchbegriff = v.toLowerCase().trim(); Store.commit({ recompute: true }); UI.render(); }, { style: "font-family:var(--mono);font-size:13px" })),
        td(UI.numInput({ value: it.stichtag, min: 0, onchange: function (v) { it.stichtag = Math.round(v); Store.commit({ recompute: true }); UI.render(); } }), "r"),
        td(catSelForItem(it)),
        td(UI.textInput(it.notiz, function (v) { it.notiz = v; Store.commit(); })),
        td(itemActions(it), "r"));
      return row;
    });
    function itemActions(it) {
      return el("div", { class: "btn-row", style: "flex-wrap:nowrap" },
        el("button", {
          class: "btn sm ghost", title: it.aktiv ? "deaktivieren" : "aktivieren",
          onclick: function () { it.aktiv = !it.aktiv; Store.commit({ recompute: true }); UI.render(); }
        }, it.aktiv ? "⏸" : "▶"),
        el("button", {
          class: "btn sm danger", title: "löschen", onclick: function () {
            UI.confirmDialog({ title: "Posten löschen?", body: "\u201E" + it.beschreibung + "\u201C wird entfernt. Zugeordnete Buchungen werden neu kategorisiert.", okLabel: "Löschen", danger: true }, function (yes) {
              if (yes) {
                var idx = state.expected.indexOf(it);
                state.expected = state.expected.filter(function (x) { return x !== it; });
                Store.commit({ recompute: true });
                var undoEntry = Store.pushUndo("Posten \u201E" + it.beschreibung + "\u201C", function () {
                  state.expected.splice(Math.min(idx, state.expected.length), 0, it);
                  Store.commit({ recompute: true }); UI.render();
                });
                U.toast("Posten gelöscht.", "ok", { label: "Rückgängig", onClick: function () { Store.popUndo(undoEntry.id); } });
              }
              UI.render();
            });
          }
        }, "✕"));
    }
    // Bei schmalem Fenster (Mac-Fenster schmal gezogen): Karten statt einer
    // 8-Spalten-Tabelle, die sonst jedes Feld auf wenige Zeichen zusammenquetscht.
    var itemCards = state.expected.map(function (it) {
      return el("div", { class: "posten-card", style: it.aktiv ? "" : "opacity:.5" },
        el("div", { class: "pc-head" },
          UI.textInput(it.beschreibung, function (v) { it.beschreibung = v; Store.commit(); }, { style: "font-weight:600;border:0;background:none;padding:0;flex:1" }),
          itemActions(it)),
        el("div", { class: "pc-edit" },
          UI.field("Typ", (function () {
            var sel = el("select", {}, ["Einnahme", "Fixkosten", "Schulden"].map(function (t) { return el("option", { value: t, selected: it.typ === t }, t); }));
            sel.addEventListener("change", function () { it.typ = sel.value; Store.commit({ recompute: true }); UI.render(); });
            return sel;
          })()),
          UI.field("Erwartet €", UI.numInput({ value: it.betrag, onchange: function (v) { it.betrag = v; Store.commit({ recompute: true }); UI.render(); } }))),
        el("div", { class: "pc-edit" },
          UI.field("Suchbegriff", UI.textInput(it.suchbegriff, function (v) { it.suchbegriff = v.toLowerCase().trim(); Store.commit({ recompute: true }); UI.render(); }, { style: "font-family:var(--mono);font-size:13px" })),
          UI.field("Stichtag", UI.numInput({ value: it.stichtag, min: 0, onchange: function (v) { it.stichtag = Math.round(v); Store.commit({ recompute: true }); UI.render(); } }))),
        UI.field("Kategorie", catSelForItem(it)),
        UI.field("Notiz", UI.textInput(it.notiz, function (v) { it.notiz = v; Store.commit(); })));
    });
    host.appendChild(el("section", { class: "card" },
      el("h2", { class: "card-title" }, "Erwartete Posten ",
        el("span", { class: "hint" }, "Suchbegriff = Teilstring in Empfänger/Zweck · Stichtag: ab diesem Tag zählt die Buchung zum Folgemonat (0 = keine Verschiebung)")),
      UI.isNarrow() ? el("div", {}, itemCards) : UI.table(["Beschreibung", "Typ", { label: "Erwartet €", r: 1 }, "Suchbegriff", { label: "Stichtag", r: 1 }, "Kategorie", "Notiz", { label: "", r: 1 }], itemRows),
      el("div", { class: "btn-row", style: "margin-top:12px" },
        el("button", {
          class: "btn primary sm", onclick: function () {
            state.expected.push({ id: U.uid("exp"), beschreibung: "Neuer Posten", typ: "Fixkosten", betrag: 0, suchbegriff: "", stichtag: 0, notiz: "", aktiv: true, kategorieId: "sys-ausgabe" });
            Store.commit(); UI.render();
          }
        }, "＋ Posten hinzufügen"))));

    /* ---------- Kategorien ---------- */
    var catCards = state.categories.map(function (c) {
      var usage = state.transactions.filter(function (t) { return t.kategorieId === c.id; }).length;
      var kwHost = el("div", { style: "margin-top:8px" });
      (c.keywords || []).forEach(function (kw, i) {
        kwHost.appendChild(el("span", { class: "kw" }, kw,
          el("button", {
            title: "Regel entfernen", onclick: function () {
              c.keywords.splice(i, 1); Store.commit({ recompute: true }); UI.render();
            }
          }, "×")));
      });
      var addKw = el("input", { type: "text", placeholder: "＋ Stichwort (Enter)", style: "max-width:180px;font-family:var(--mono);font-size:12.5px;padding:4px 8px;margin-top:6px" });
      addKw.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && addKw.value.trim()) {
          c.keywords = c.keywords || [];
          c.keywords.push(addKw.value.trim().toLowerCase());
          Store.commit({ recompute: true }); UI.render();
        }
      });
      var head = el("div", { style: "display:flex;align-items:center;gap:9px;flex-wrap:wrap" },
        el("span", { class: "cat-dot", style: "background:" + c.farbe }),
        el("span", { style: "font-size:16px" }, c.icon),
        c.system
          ? el("strong", {}, c.name)
          : UI.textInput(c.name, function (v) { c.name = v; Store.commit(); UI.render(); }, { style: "max-width:220px;font-weight:600" }),
        el("span", { class: "pill" }, c.typ === "einnahme" ? "Einnahme" : "Ausgabe"),
        el("span", { class: "small muted" }, usage + " Buchungen"),
        el("span", { style: "flex:1" }),
        (function () {
          var inp = el("input", { type: "color", value: toHex(c.farbe), title: "Farbe", style: "width:34px;height:26px;padding:2px;background:none;border:1px solid var(--line);border-radius:7px" });
          inp.addEventListener("change", function () { c.farbe = inp.value; Store.commit(); UI.render(); });
          return inp;
        })(),
        c.system ? null : el("button", {
          class: "btn sm ghost", title: "Zusammenführen", onclick: function () { mergeDialog(state, c); }
        }, "⇄"),
        c.system ? null : el("button", {
          class: "btn sm danger", title: "löschen", onclick: function () {
            UI.confirmDialog({
              title: "Kategorie löschen?",
              body: "\u201E" + c.name + "\u201C wird gelöscht. " + usage + " Buchungen wandern nach \u201ESonstige\u201C. Erwartete Posten mit dieser Kategorie ebenfalls.",
              okLabel: "Löschen", danger: true
            }, function (yes) {
              if (yes) {
                var fallback = c.typ === "einnahme" ? "sys-einnahme" : "sys-ausgabe";
                var idx = state.categories.indexOf(c);
                var affectedTx = state.transactions.filter(function (t) { return t.kategorieId === c.id; }).map(function (t) { return { id: t.id, manuelleKat: t.manuelleKat }; });
                var affectedExp = state.expected.filter(function (it) { return it.kategorieId === c.id; }).map(function (it) { return it.id; });
                state.transactions.forEach(function (t) { if (t.kategorieId === c.id) { t.kategorieId = fallback; t.manuelleKat = false; } });
                state.expected.forEach(function (it) { if (it.kategorieId === c.id) it.kategorieId = fallback; });
                state.categories = state.categories.filter(function (x) { return x !== c; });
                Store.commit({ recompute: true });
                var undoEntry = Store.pushUndo("Kategorie \u201E" + c.name + "\u201C", function () {
                  state.categories.splice(Math.min(idx, state.categories.length), 0, c);
                  state.transactions.forEach(function (t) {
                    var found = affectedTx.find(function (a) { return a.id === t.id; });
                    if (found) { t.kategorieId = c.id; t.manuelleKat = found.manuelleKat; }
                  });
                  state.expected.forEach(function (it) { if (affectedExp.indexOf(it.id) !== -1) it.kategorieId = c.id; });
                  Store.commit({ recompute: true }); UI.render();
                });
                U.toast("Kategorie gelöscht.", "ok", { label: "Rückgängig", onClick: function () { Store.popUndo(undoEntry.id); } });
              }
              UI.render();
            });
          }
        }, "✕"));
      var det = c.system ? null : el("details", { class: "acc", style: "margin-top:8px" },
        el("summary", {}, "Regeln (" + (c.keywords || []).length + ")"),
        el("div", {}, kwHost, addKw));
      if (det && (c.keywords || []).length === 0) det.setAttribute("open", "");
      return el("div", { class: "card", style: "padding:12px 15px" }, head,
        c.system ? el("p", { class: "small muted", style: "margin:6px 0 0" }, "System-Kategorie für alles Unkategorisierte.") : det);
    });
    host.appendChild(el("section", { class: "card" },
      el("h2", { class: "card-title" }, "Kategorien & Regeln ",
        el("span", { class: "hint" }, "Stichwort-Treffer in Empfänger/Zweck → automatische Kategorie beim Import")),
      el("div", { class: "grid", style: "grid-template-columns:1fr" }, catCards),
      el("div", { class: "btn-row", style: "margin-top:12px" },
        el("button", {
          class: "btn primary sm", onclick: function () {
            state.categories.push({ id: U.uid("cat"), name: "Neue Kategorie", typ: "ausgabe", farbe: "#8B93FF", icon: "🏷", keywords: [] });
            Store.commit(); UI.render();
          }
        }, "＋ Ausgaben-Kategorie"),
        el("button", {
          class: "btn sm", onclick: function () {
            state.categories.push({ id: U.uid("cat"), name: "Neue Einnahme-Kategorie", typ: "einnahme", farbe: "#3DDC97", icon: "🏷", keywords: [] });
            Store.commit(); UI.render();
          }
        }, "＋ Einnahmen-Kategorie"))));
  });

  function toHex(color) {
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
    return "#8C99B4";
  }

  function mergeDialog(state, source) {
    var dlg = el("dialog", { class: "modal" });
    var targets = state.categories.filter(function (c) { return c !== source && c.typ === source.typ; });
    var sel = el("select", {}, targets.map(function (c) { return el("option", { value: c.id }, c.icon + " " + c.name); }));
    dlg.appendChild(el("h3", { style: "margin:0 0 8px" }, "\u201E" + source.name + "\u201C zusammenführen"));
    dlg.appendChild(el("p", { class: "muted small", style: "margin:0 0 10px" }, "Alle Buchungen, Regeln und Posten-Zuordnungen wandern in die Ziel-Kategorie. \u201E" + source.name + "\u201C wird danach gelöscht."));
    dlg.appendChild(sel);
    dlg.appendChild(el("div", { class: "btn-row", style: "justify-content:flex-end;margin-top:16px" },
      el("button", { class: "btn ghost", onclick: function () { dlg.close(); dlg.remove(); } }, "Abbrechen"),
      el("button", {
        class: "btn primary", onclick: function () {
          var target = state.categories.find(function (c) { return c.id === sel.value; });
          if (!target) return;
          state.transactions.forEach(function (t) { if (t.kategorieId === source.id) t.kategorieId = target.id; });
          state.expected.forEach(function (it) { if (it.kategorieId === source.id) it.kategorieId = target.id; });
          target.keywords = (target.keywords || []).concat(source.keywords || []);
          state.categories = state.categories.filter(function (x) { return x !== source; });
          Store.commit({ recompute: true });
          dlg.close(); dlg.remove();
          U.toast("Zusammengeführt in " + target.name, "ok");
          UI.render();
        }
      }, "Zusammenführen")));
    document.body.appendChild(dlg);
    dlg.showModal();
  }
})();
