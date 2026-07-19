/* views-monat.js — Monat */
"use strict";
(function () {
  var el = U.el, td = UI.td;

  function statusOfTx(t) {
    if (t.effMonat !== t.monat) return { label: "aus " + U.monthLabel(t.monat, true) + " verschoben", cls: "info" };
    if ((t.info || "").toLowerCase().indexOf("vorgemerkt") !== -1) return { label: "vorgemerkt", cls: "abweichung" };
    return { label: "gebucht", cls: "ok" };
  }
  function suchbegriffFor(tx) {
    return (tx.empfaenger || tx.zweck || "").split("/")[0].trim().toLowerCase().slice(0, 30).trim();
  }

  /* Dialog: Buchung einem Posten zuordnen ODER als neuen wiederkehrenden Posten anlegen */
  function txActionDialog(state, tx) {
    var dlg = el("dialog", { class: "modal", style: "max-width:min(94vw,560px)" });
    function close() { dlg.close(); dlg.remove(); }
    dlg.appendChild(el("h3", { style: "margin:0 0 4px" }, "Buchung zuordnen"));
    dlg.appendChild(el("p", { class: "small muted", style: "margin:0 0 14px" },
      U.dateDE(tx.datum) + " · " + (tx.empfaenger || tx.text || "—") + " · ", UI.money(tx.betrag)));

    // A) Bestehendem Posten zuordnen
    var wantSign = tx.betrag < 0 ? -1 : 1;
    var items = state.expected.filter(function (i) { return i.aktiv && (i.betrag < 0 ? -1 : 1) === wantSign; });
    var sel = el("select", {},
      el("option", { value: "" }, "— Posten wählen —"),
      items.map(function (i) {
        return el("option", { value: i.id, selected: tx.itemId === i.id }, i.beschreibung + " (" + i.typ + ", " + U.eur(i.betrag) + ")");
      }));
    dlg.appendChild(el("div", { class: "dlg-sec" },
      el("div", { class: "eyebrow", style: "margin-bottom:6px" }, "Bestehendem Posten zuordnen"),
      el("div", { class: "btn-row" }, sel,
        el("button", {
          class: "btn sm primary", onclick: function () {
            if (!sel.value) { U.toast("Bitte einen Posten wählen.", "warn"); return; }
            var item = state.expected.find(function (i) { return i.id === sel.value; });
            tx.matchOverride = item.id;
            Store.commit({ recompute: true });
            U.toast("Zugeordnet zu \u201E" + item.beschreibung + "\u201C" +
              (tx.effMonat !== tx.monat ? " — zählt wegen Stichtag zum " + U.monthLabel(tx.effMonat, true) + "." : "."), "ok");
            close(); UI.render();
          }
        }, "Zuordnen"),
        tx.itemId ? el("button", {
          class: "btn sm ghost", onclick: function () {
            tx.matchOverride = "none"; tx.manuelleKat = false;
            Store.commit({ recompute: true });
            U.toast("Zuordnung gelöst.", "ok"); close(); UI.render();
          }
        }, "Zuordnung lösen") : null)));

    // B) Neuen wiederkehrenden Posten anlegen
    var typSel = el("select", {},
      el("option", { value: "Einnahme", selected: tx.betrag >= 0 }, "Einnahme"),
      el("option", { value: "Fixkosten", selected: tx.betrag < 0 }, "Fixkosten"),
      el("option", { value: "Schulden" }, "Schulden"));
    var nameInp = el("input", { type: "text", value: (tx.empfaenger || tx.text || "").split("/")[0].trim().slice(0, 40) });
    var betragInp = UI.numInput({ value: tx.betrag, onchange: function () { } });
    var suchInp = el("input", { type: "text", value: suchbegriffFor(tx), style: "font-family:var(--mono);font-size:13px" });
    var stichInp = UI.numInput({ value: 0, min: 0, onchange: function () { } });
    dlg.appendChild(el("div", { class: "dlg-sec" },
      el("div", { class: "eyebrow", style: "margin-bottom:6px" }, "Oder: neu als wiederkehrenden Posten deklarieren"),
      el("div", { class: "fields", style: "grid-template-columns:repeat(auto-fill,minmax(140px,1fr))" },
        UI.field("Typ", typSel), UI.field("Beschreibung", nameInp),
        UI.field("Erwartet €/Mon", betragInp), UI.field("Suchbegriff", suchInp),
        UI.field("Stichtag (0 = aus)", stichInp)),
      el("p", { class: "small muted", style: "margin:8px 0 10px" },
        "Der Posten erscheint ab sofort in jedem Monat unter \u201EErwartete Posten\u201C; passende Buchungen (Suchbegriff + Vorzeichen) werden automatisch zugeordnet."),
      el("button", {
        class: "btn sm good", onclick: function () {
          var betrag = U.parseInputNumber(betragInp.value); if (isNaN(betrag)) betrag = tx.betrag;
          var stich = Math.max(0, Math.round(U.parseInputNumber(stichInp.value) || 0));
          var typ = typSel.value;
          var item = {
            id: U.uid("exp"), beschreibung: nameInp.value.trim() || "Neuer Posten", typ: typ,
            betrag: betrag, suchbegriff: (suchInp.value || "").toLowerCase().trim(), stichtag: stich,
            notiz: "aus Buchung angelegt", aktiv: true,
            kategorieId: tx.manuelleKat ? tx.kategorieId : (typ === "Einnahme" ? "sys-einnahme" : typ === "Schulden" ? "schulden" : "sys-ausgabe")
          };
          state.expected.push(item);
          tx.matchOverride = item.id; // diese Buchung sicher zuordnen, auch wenn der Suchbegriff (noch) nicht greift
          Store.commit({ recompute: true });
          U.toast("Wiederkehrender Posten \u201E" + item.beschreibung + "\u201C angelegt.", "ok");
          close(); UI.render();
        }
      }, "＋ Posten anlegen & zuordnen")));

    dlg.appendChild(el("div", { class: "btn-row", style: "justify-content:flex-end;margin-top:6px" },
      el("button", { class: "btn ghost", onclick: close }, "Schließen")));
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  /* Dialog: hartnäckige Vormerkung von Hand einer bereits gebuchten Buchung zuordnen
     und entfernen — für Fälle, in denen die Bank beim endgültigen Buchen Empfänger,
     Betrag oder Datum so verändert hat, dass der automatische Vormerkungs-Abgleich
     (Logic.reconcileVorgemerkt) bewusst nicht greifen darf. */
  function mergeVorgemerktDialog(state, tx) {
    function isVg(t) { return ((t.info || "").toLowerCase().indexOf("vorgemerkt") !== -1); }
    var cands = state.transactions.filter(function (t) {
      if (t === tx || isVg(t)) return false;
      if ((t.betrag < 0) !== (tx.betrag < 0)) return false;
      return Math.abs(new Date(t.datum) - new Date(tx.datum)) <= 10 * 86400000;
    }).sort(function (a, b) {
      var ea = a.betrag === tx.betrag ? 0 : 1, eb = b.betrag === tx.betrag ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return Math.abs(new Date(a.datum) - new Date(tx.datum)) - Math.abs(new Date(b.datum) - new Date(tx.datum));
    });
    var dlg = el("dialog", { class: "modal", style: "max-width:min(94vw,560px)" });
    function close() { dlg.close(); dlg.remove(); }
    dlg.appendChild(el("h3", { style: "margin:0 0 4px" }, "Vormerkung bereinigen"));
    dlg.appendChild(el("p", { class: "small muted", style: "margin:0 0 12px" },
      U.dateDE(tx.datum) + " · " + (tx.empfaenger || tx.text || "—") + " · ", UI.money(tx.betrag)));
    if (!cands.length) {
      dlg.appendChild(el("p", { class: "small", style: "margin:0 0 14px;color:var(--warn)" },
        "Keine gebuchte Buchung mit gleichem Vorzeichen im Umfeld (±10 Tage) gefunden — zum Schutz vor Versehen wird ohne Gegenstück nichts entfernt."));
      dlg.appendChild(el("div", { class: "btn-row", style: "justify-content:flex-end" },
        el("button", { class: "btn ghost", onclick: close }, "Schließen")));
    } else {
      dlg.appendChild(el("p", { class: "small muted", style: "margin:0 0 8px" },
        "Wurde diese Vormerkung von der Bank bereits endgültig gebucht? Wähle die zugehörige gebuchte Buchung — die Vormerkung wird dann entfernt (rückgängig machbar)."));
      var sel = el("select", { style: "max-width:100%" }, cands.slice(0, 40).map(function (t, i) {
        return el("option", { value: t.id, selected: i === 0 },
          U.dateDE(t.datum) + " · " + (t.empfaenger || t.text || "?").slice(0, 34) + " · " + U.eur(t.betrag) +
          (t.betrag === tx.betrag ? "" : " — anderer Betrag!"));
      }));
      dlg.appendChild(el("div", { class: "dlg-sec" }, sel));
      dlg.appendChild(el("div", { class: "btn-row", style: "justify-content:flex-end;margin-top:12px" },
        el("button", { class: "btn ghost", onclick: close }, "Abbrechen"),
        el("button", {
          class: "btn primary", onclick: function () {
            var idx = state.transactions.indexOf(tx);
            if (idx === -1) { close(); return; }
            state.transactions.splice(idx, 1);
            var undoEntry = Store.pushUndo("Vormerkung „" + (tx.empfaenger || tx.text || "?").slice(0, 24) + "“", function () {
              state.transactions.splice(Math.min(idx, state.transactions.length), 0, tx);
              Store.commit({ recompute: true }); UI.render();
            });
            Store.commit({ recompute: true });
            U.toast("Vormerkung entfernt — die Buchung zählt nur noch einmal.", "ok",
              { label: "Rückgängig", onClick: function () { Store.popUndo(undoEntry.id); } });
            close(); UI.render();
          }
        }, "Zuordnen & Vormerkung entfernen")));
    }
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  UI.registerView("monat", function (host, state) {
    var mk = state.ui.month || U.currentMonth();
    var c = Logic.monthCockpit(state, mk);
    var md = Store.monthData(mk);
    state.ui.openItems = state.ui.openItems || {};
    state.ui.openCalc = state.ui.openCalc || {};

    /* ---- Kopf mit Monats-Navigation ---- */
    var monthInput = UI.monthSelect({
      value: mk, center: U.currentMonth(), back: 48, forward: 48,
      onChange: function (v) { if (v) UI.go("monat", { month: v }); }
    });
    var nav = el("div", { class: "month-nav" },
      el("button", { class: "btn icon", "aria-label": "Vormonat", onclick: function () { UI.go("monat", { month: Logic.prevMonth(mk) }); } }, "‹"),
      el("div", { class: "month-label" }, U.monthLabel(mk)),
      el("button", { class: "btn icon", "aria-label": "Folgemonat", onclick: function () { UI.go("monat", { month: Logic.nextMonth(mk) }); } }, "›"),
      monthInput,
      mk !== U.currentMonth() ? el("button", { class: "btn sm ghost", onclick: function () { UI.go("monat", { month: U.currentMonth() }); } }, "Heute") : null);
    host.appendChild(UI.pageHead("Monat", "Buchungen nach effektivem Monat · Stichtag-Verschiebung aktiv", [nav, UI.printButton()]));

    /* ---- Posten-Heartbeat ---- */
    var strip = el("div", { class: "strip", title: "Status aller erwarteten Posten" });
    c.rows.forEach(function (r) {
      var i = el("i", { class: r.status });
      i.title = r.item.beschreibung + ": " + (r.status === "offen" ? "offen" : r.status === "ok" ? "passt" : "Abweichung");
      strip.appendChild(i);
    });
    host.appendChild(el("div", { class: "card", style: "padding:12px 18px" },
      el("div", { style: "display:flex;align-items:center;gap:14px;flex-wrap:wrap" },
        el("span", { class: "eyebrow" }, "Posten-Status"), strip,
        el("span", { class: "small muted" },
          c.fix.open + " von " + c.fix.total + " Fixkosten offen · " +
          c.schulden.open + " von " + c.schulden.total + " Schulden offen · " +
          c.einnahmenPosten.open + " von " + c.einnahmenPosten.total + " Einnahmen offen"))));

    /* ================= Monatsübersicht: Konten + Monatsrechnung ================= */
    function ovRow(label, valueNode, sub, total) {
      return el("div", { class: "ov-row" + (total ? " total" : "") },
        el("div", { class: "lbl" }, label, sub ? el("small", {}, sub) : null),
        valueNode);
    }
    function ovVal(v, opts) {
      var cls = v > 0 ? "pos" : v < 0 ? "neg" : "muted";
      if (opts && opts.neutral) cls = "";
      return el("div", { class: "val " + cls }, v == null ? "–" : U.eur(v));
    }
    function ovInput(key, placeholder) {
      var inp = UI.numInput({ value: md[key], allowEmpty: true, onchange: function (v) { md[key] = v; Store.commit(); UI.render(); } });
      inp.placeholder = placeholder || "eintragen …";
      return inp;
    }
    var kkDatum = el("input", { type: "date", value: md.kkDatum || "", style: "max-width:150px" });
    kkDatum.addEventListener("change", function () { md.kkDatum = kkDatum.value; Store.commit(); });

    var gKonten = el("div", { class: "ov-group" },
      el("span", { class: "eyebrow" }, "Konten · manuell"),
      ovRow("Girokonto", ovInput("giro"), "Sparkasse · Basis der Prognose"),
      ovRow("2. Konto", ovInput("konto2"), "Tagesgeld / DKB"),
      ovRow("Kreditkarte", ovInput("kkSaldo"), "offener Saldo (negativ)"),
      ovRow("Letzte KK-Abrechnung", kkDatum));

    // Monatsrechnung: jede Zeile = Kategorie, Spalten = Bisher | Noch offen | Monat gesamt
    function mr(v, dashIfZero) {
      if (v == null || (dashIfZero && Math.abs(v) < 0.005)) return el("td", { class: "r num" }, el("span", { class: "muted" }, "–"));
      return el("td", { class: "r num" }, el("span", { class: "num " + (v > 0 ? "pos" : v < 0 ? "neg" : "muted") }, U.eur(v)));
    }
    function mrRow(label, sub, ist, offen, cls) {
      var ges = (ist || 0) + (offen || 0);
      return el("tr", { class: cls || "" },
        el("td", {}, el("div", { class: "cell-main" }, label), sub ? el("div", { class: "cell-sub" }, sub) : null),
        mr(ist, true), mr(offen, true), mr(Math.round(ges * 100) / 100, ist == null && offen == null));
    }
    var pl = c.plan;
    var rows = [
      mrRow("Einnahmen", c.einnahmen.length + " Buchungen · " + c.restEinCount + " Posten offen/teilweise", c.einnahmenSum, c.restEin),
      mrRow("Fixkosten", (c.fix.total - c.fix.open) + " von " + c.fix.total + " Posten gebucht", c.fixIst, c.restFix),
      mrRow("Schulden / Raten", (c.schulden.total - c.schulden.open) + " von " + c.schulden.total + " Posten gebucht", c.schuldIst, c.restSchuld),
      mrRow("Variable Ausgaben", c.variable.length + " Buchungen · nicht planbar", c.variableSum, null),
      mrRow("Zusatzeinnahmen", "manuell, noch offen", null, pl.offenEinnahme),
      mrRow("Zusatzausgaben", "manuell, noch offen", null, pl.offenAusgabe),
      mrRow("Rücklagen / Sparen", pl.erledigtCount ? pl.erledigtCount + " erledigt (" + pl.erledigtBankCount + " per Bank)" : "manuelle Planung", pl.erledigtIstSum, pl.offenRuecklage)
    ];
    var totalRow = el("tr", { class: "mr-total" },
      el("td", {}, el("div", { class: "cell-main" }, "Saldo"), el("div", { class: "cell-sub" }, "Summe der Spalten")),
      mr(c.saldoBisher), mr(c.offenGesamt), mr(c.prognoseSaldo));

    // Prognose Girokonto mit aufklappbarer Rechnung
    var calcOpen = !!state.ui.openCalc[mk];
    var progNode = el("div", {});
    if (md.giro != null) {
      var toggleCalc = el("button", {
        class: "row-expander", "aria-expanded": calcOpen ? "true" : "false",
        onclick: function () { state.ui.openCalc[mk] = !calcOpen; Store.commit(); UI.render(); }
      }, (calcOpen ? "▾" : "▸") + " Rechnung");
      progNode.appendChild(el("div", { class: "ov-row total", style: "border-top:0" },
        el("div", { class: "lbl" }, "Prognose Girokonto Monatsende",
          el("small", {}, "Girokonto + Spalte \u201ENoch offen\u201C — 2. Konto & Kreditkarte bleiben außen vor")),
        toggleCalc,
        el("div", { class: "val", title: "Girokonto " + U.eur(md.giro) + " + noch offen " + U.eur(c.offenGesamt) }, U.eur(c.prognoseGiro))));
      progNode.appendChild(el("div", { class: "ov-row total", style: "border-top:0" },
        el("div", { class: "lbl" }, "Saldo",
          el("small", {}, "Prognose Girokonto + 2. Konto + Kreditkarte — dein Stand über alle Konten am Monatsende")),
        el("div", { class: "val " + (c.prognoseGesamt > 0 ? "pos" : c.prognoseGesamt < 0 ? "neg" : ""), title: "Prognose Girokonto " + U.eur(c.prognoseGiro) + " + 2. Konto " + U.eur(md.konto2 || 0) + " + Kreditkarte " + U.eur(md.kkSaldo || 0) }, U.eur(c.prognoseGesamt))));
      if (calcOpen) {
        var calc = el("div", { class: "calc" });
        function calcLine(label, v, first) {
          calc.appendChild(el("div", { class: "calc-line" },
            el("span", {}, (first ? "" : (v >= 0 ? "+ " : "− ")) + label),
            el("span", { class: "num " + (v > 0 ? "pos" : v < 0 ? "neg" : "muted") }, U.eur(first ? v : Math.abs(v)))));
        }
        calcLine("Girokonto (eingetragen)", md.giro, true);
        if (Math.abs(c.restEin) >= 0.005) calcLine("erwartete Einnahmen (offen)", c.restEin);
        if (Math.abs(c.restFix) >= 0.005) calcLine("erwartete Fixkosten (offen)", c.restFix);
        if (Math.abs(c.restSchuld) >= 0.005) calcLine("erwartete Schulden (offen)", c.restSchuld);
        if (Math.abs(pl.offenEinnahme) >= 0.005) calcLine("geplante Einnahmen", pl.offenEinnahme);
        if (Math.abs(pl.offenAusgabe) >= 0.005) calcLine("geplante Ausgaben", pl.offenAusgabe);
        if (Math.abs(pl.offenRuecklage) >= 0.005) calcLine("geplante Rücklagen", pl.offenRuecklage);
        calc.appendChild(el("div", { class: "calc-line total" },
          el("span", {}, "= Prognose Girokonto"),
          el("span", { class: "num" }, U.eur(c.prognoseGiro))));
        if (md.konto2 != null && Math.abs(md.konto2) >= 0.005) calcLine("2. Konto (Stand)", md.konto2);
        if (md.kkSaldo != null && Math.abs(md.kkSaldo) >= 0.005) calcLine("Kreditkarte (Stand)", md.kkSaldo);
        calc.appendChild(el("div", { class: "calc-line total" },
          el("span", {}, "= Saldo (alle Konten)"),
          el("span", { class: "num" }, U.eur(c.prognoseGesamt))));
        progNode.appendChild(calc);
      }
    } else {
      progNode.appendChild(el("p", { class: "small muted", style: "margin:8px 2px 0" },
        "Girokonto-Stand links eintragen → Prognose Girokonto Monatsende erscheint hier."));
    }

    var gRechnung = el("div", { class: "ov-group ov-wide" },
      el("span", { class: "eyebrow" }, "Monatsrechnung · " + U.monthLabel(mk, true)),
      el("div", { class: "tbl-wrap" }, el("table", { class: "tbl mr" },
        el("thead", {}, el("tr", {},
          el("th", {}, ""), el("th", { class: "r" }, "Bisher gebucht"),
          el("th", { class: "r" }, "Noch offen / geplant"), el("th", { class: "r" }, "Monat gesamt"))),
        el("tbody", {}, rows),
        el("tfoot", {}, totalRow))),
      progNode);

    host.appendChild(el("section", { class: "card" },
      el("h2", { class: "card-title" }, "Monatsübersicht ",
        el("span", { class: "hint" }, "Zeile für Zeile: was schon gebucht ist + was noch kommt = Monat gesamt")),
      el("div", { class: "overview ov-13" }, gKonten, gRechnung)));

    /* ================= Erwartete Posten: sortierbar, editierbar, mit Aktionen ================= */
    host.appendChild(UI.collapsibleCard({
      key: "monat.posten", title: "Erwartete Posten",
      hint: "Soll/Ist-Abgleich · Typ & Betrag direkt editierbar · Zeile aufklappen für Zuordnung", defaultOpen: true
    }, function (body) {
      var sort = state.ui.postenSort || { key: "typ", dir: 1 };
      function sortBtn(label, key) {
        var active = sort.key === key;
        var th = el("th", { class: (label === "" ? "" : "") + (key === "beschreibung" ? "" : "r") });
        th.appendChild(el("button", {
          class: "th-sort" + (active ? " active" : ""),
          onclick: function () {
            state.ui.postenSort = { key: key, dir: active ? -sort.dir : 1 };
            Store.commit(); UI.render();
          }
        }, label, el("span", { class: "arrow" }, active ? (sort.dir === 1 ? " ↑" : " ↓") : " ⇅")));
        return th;
      }
      var typOrder = { Einnahme: 0, Fixkosten: 1, Schulden: 2 };
      var sorted = c.rows.slice().sort(function (a, b) {
        var va, vb;
        switch (sort.key) {
          case "beschreibung": va = a.item.beschreibung.toLowerCase(); vb = b.item.beschreibung.toLowerCase(); break;
          case "typ": va = typOrder[a.item.typ]; vb = typOrder[b.item.typ]; break;
          case "soll": va = a.soll; vb = b.soll; break;
          case "ist": va = a.ist; vb = b.ist; break;
          case "delta": va = a.ist !== 0 ? a.ist - a.soll : 0; vb = b.ist !== 0 ? b.ist - b.soll : 0; break;
          case "status": var so = { offen: 0, abweichung: 1, ok: 2 }; va = so[a.status]; vb = so[b.status]; break;
          default: va = 0; vb = 0;
        }
        if (va < vb) return -sort.dir;
        if (va > vb) return sort.dir;
        return a.item.beschreibung.localeCompare(b.item.beschreibung);
      });

      // ---- gemeinsam: Typ-Auswahl, Soll-Feld, Detail-Inhalt (Buchungen + Zuordnen/Lösen/Deaktivieren) ----
      function typSelFor(it) {
        var sel = el("select", { style: "min-width:104px" },
          ["Einnahme", "Fixkosten", "Schulden"].map(function (t) { return el("option", { value: t, selected: it.typ === t }, t); }));
        sel.addEventListener("change", function () {
          it.typ = sel.value;
          Store.commit({ recompute: true }); UI.render();
          U.toast("\u201E" + it.beschreibung + "\u201C ist jetzt Typ " + it.typ + ".", "ok");
        });
        return sel;
      }
      function sollFor(it) {
        var inp = UI.numInput({
          value: it.betrag, onchange: function (v) {
            var oldSign = it.betrag < 0 ? -1 : 1, newSign = v < 0 ? -1 : 1;
            it.betrag = v;
            Store.commit({ recompute: true }); UI.render();
            if (oldSign !== newSign) U.toast("Achtung: Vorzeichen geändert — das Matching prüft das Vorzeichen.", "warn");
          }
        });
        inp.style.maxWidth = "120px";
        return inp;
      }
      // Baut den aufgeklappten Detailbereich (Buchungen nachvollziehen, lösen, zuordnen, deaktivieren)
      function detailFor(it) {
        var itemTxs = Logic.itemTxsForMonth(state, it, mk);
        var detail = el("div", {});
        if (itemTxs.length) {
          itemTxs.forEach(function (t) {
            detail.appendChild(el("div", { class: "detail-tx" },
              el("span", { class: "num small muted" }, U.dateDE(t.datum)),
              el("span", { class: "who" }, (t.empfaenger || t.text || "—"),
                t.matchOverride && t.matchOverride !== "none" ? el("span", { class: "pill", style: "margin-left:8px" }, "manuell zugeordnet") : null,
                t.effMonat !== t.monat ? el("span", { class: "pill", style: "margin-left:8px" }, "verschoben (Stichtag)") : null),
              UI.money(t.betrag),
              el("button", {
                class: "btn sm ghost", title: "Diese Buchung zählt danach nicht mehr zu diesem Posten",
                onclick: function () {
                  t.matchOverride = "none"; t.manuelleKat = false;
                  Store.commit({ recompute: true });
                  U.toast("Zuordnung gelöst — Buchung zählt jetzt als " + (t.betrag >= 0 ? "freie Einnahme" : "variable Ausgabe") + ".", "ok");
                  UI.render();
                }
              }, "Zuordnung lösen")));
          });
        } else {
          detail.appendChild(el("p", { class: "small muted", style: "margin:2px 0 0" }, "Noch keine Buchung zugeordnet."));
        }
        var wantSign = it.betrag < 0 ? -1 : 1;
        var candidates = state.transactions.filter(function (t) {
          return (t.effMonat === mk || t.monat === mk) && (t.betrag < 0 ? -1 : 1) === wantSign && t.itemId !== it.id;
        }).sort(function (a, b) { return a.datum < b.datum ? 1 : -1; });
        var actions = el("div", { class: "assign-row" });
        if (candidates.length) {
          var sel = el("select", {}, el("option", { value: "" }, "Buchung wählen …"),
            candidates.slice(0, 60).map(function (t) {
              return el("option", { value: t.id },
                U.dateDE(t.datum) + " · " + (t.empfaenger || t.text || "?").slice(0, 44) + " · " + U.eur(t.betrag) +
                (t.itemId ? " (bisher: anderer Posten)" : ""));
            }));
          actions.appendChild(sel);
          actions.appendChild(el("button", {
            class: "btn sm", onclick: function () {
              var t = state.transactions.find(function (x) { return x.id === sel.value; });
              if (!t) { U.toast("Bitte eine Buchung wählen.", "warn"); return; }
              t.matchOverride = it.id;
              Store.commit({ recompute: true });
              if (it.stichtag > 0 && Logic.dayOfMonth(t.datum) >= it.stichtag && t.effMonat !== mk) {
                U.toast("Zugeordnet — wegen Stichtag " + it.stichtag + " zählt die Buchung zum Folgemonat.", "warn");
              } else {
                U.toast("Buchung dem Posten \u201E" + it.beschreibung + "\u201C zugeordnet.", "ok");
              }
              UI.render();
            }
          }, "＋ Zuordnen"));
        }
        actions.appendChild(el("span", { style: "flex:1" }));
        actions.appendChild(el("button", {
          class: "btn sm danger", title: "Der Posten wird deaktiviert und verschwindet aus dieser Liste; seine Buchungen zählen als frei",
          onclick: function () {
            UI.confirmDialog({
              title: "Nicht mehr als wiederkehrenden Posten führen?",
              body: "\u201E" + it.beschreibung + "\u201C wird deaktiviert und taucht in keinem Monat mehr auf. Die Buchungen zählen dann als freie Einnahmen/variable Ausgaben. Reaktivieren jederzeit unter \u201EPosten & Kategorien\u201C.",
              okLabel: "Deaktivieren", danger: true
            }, function (yes) {
              if (yes) {
                it.aktiv = false;
                Store.commit({ recompute: true });
                U.toast("\u201E" + it.beschreibung + "\u201C deaktiviert.", "ok");
              }
              UI.render();
            });
          }
        }, "Kein Posten mehr"));
        detail.appendChild(actions);
        return detail;
      }
      function toggleBtn(it, itemCount) {
        var openKey = mk + "|" + it.id;
        var isOpen = !!state.ui.openItems[openKey];
        return el("button", {
          class: "row-expander", "aria-expanded": isOpen ? "true" : "false",
          title: "Zugeordnete Buchungen & Aktionen",
          onclick: function () { state.ui.openItems[openKey] = !isOpen; Store.commit(); UI.render(); }
        }, (isOpen ? "▾ " : "▸ ") + itemCount + " Bchg.");
      }

      if (UI.isNarrow()) {
        // ---- Handy: Karten statt breiter Tabelle (kein Horizontal-Scroll, Zuordnung gut erreichbar) ----
        var sortSel = el("select", {},
          [["typ", "Typ"], ["beschreibung", "Name"], ["soll", "Erwartet"], ["ist", "Tatsächlich"], ["delta", "Abweichung"], ["status", "Status"]]
            .map(function (o) { return el("option", { value: o[0], selected: sort.key === o[0] }, "Sortieren: " + o[1]); }));
        sortSel.addEventListener("change", function () { state.ui.postenSort = { key: sortSel.value, dir: 1 }; Store.commit(); UI.render(); });
        body.appendChild(el("div", { class: "btn-row", style: "margin-bottom:10px" }, sortSel,
          el("button", { class: "btn sm ghost", title: "Sortierrichtung", onclick: function () { state.ui.postenSort = { key: sort.key, dir: -sort.dir }; Store.commit(); UI.render(); } }, sort.dir === 1 ? "↑" : "↓")));
        sorted.forEach(function (r) {
          var it = r.item;
          var itemTxs = Logic.itemTxsForMonth(state, it, mk);
          var isOpen = !!state.ui.openItems[mk + "|" + it.id];
          var abw = r.ist !== 0 ? r.ist - r.soll : null;
          var card = el("div", { class: "posten-card" },
            el("div", { class: "pc-head" },
              el("div", { class: "pc-title" }, el("span", { class: "cell-main" }, it.beschreibung),
                el("span", { class: "pill", style: "margin-left:7px" }, it.typ)),
              UI.statusBadge(r.status)),
            el("div", { class: "pc-figures" },
              el("div", {}, el("div", { class: "eyebrow" }, "Erwartet"), UI.money(r.soll)),
              el("div", {}, el("div", { class: "eyebrow" }, "Tatsächlich"), r.ist !== 0 ? UI.money(r.ist) : el("span", { class: "muted" }, "–")),
              el("div", {}, el("div", { class: "eyebrow" }, "Δ"), abw != null && Math.abs(abw) >= 0.01 ? el("span", { class: "num " + (Math.abs(abw) > Math.abs(r.soll) * 0.5 ? "warncol" : "muted") }, (abw > 0 ? "+" : "") + U.eur(abw)) : el("span", { class: "muted" }, "–"))),
            el("div", { class: "pc-edit" },
              el("label", { class: "fld" }, el("span", {}, "Typ"), typSelFor(it)),
              el("label", { class: "fld" }, el("span", {}, "Erwartet €"), sollFor(it))),
            el("div", { style: "margin-top:8px" }, toggleBtn(it, itemTxs.length)));
          if (isOpen) card.appendChild(el("div", { class: "pc-detail" }, detailFor(it)));
          body.appendChild(card);
        });
      } else {
        // ---- Desktop: 7-Spalten-Tabelle (sortierbare Header) ----
        var tbody = el("tbody", {});
        sorted.forEach(function (r) {
          var it = r.item;
          var itemTxs = Logic.itemTxsForMonth(state, it, mk);
          var isOpen = !!state.ui.openItems[mk + "|" + it.id];
          var abw = r.ist !== 0 ? r.ist - r.soll : null;
          tbody.appendChild(el("tr", {},
            td([el("div", { class: "cell-main" }, it.beschreibung), el("div", { class: "cell-sub" }, it.notiz || "")]),
            td(typSelFor(it)),
            td(sollFor(it), "r"),
            td(r.ist !== 0 ? UI.money(r.ist) : el("span", { class: "muted" }, "–"), "r num"),
            td(abw != null && Math.abs(abw) >= 0.01 ? el("span", { class: "num small " + (Math.abs(abw) > Math.abs(r.soll) * 0.5 ? "warncol" : "muted") }, (abw > 0 ? "+" : "") + U.eur(abw)) : "", "r num"),
            td(UI.statusBadge(r.status), "r"),
            td(toggleBtn(it, itemTxs.length), "r")));
          if (isOpen) tbody.appendChild(el("tr", { class: "item-detail" }, el("td", { colspan: "7" }, detailFor(it))));
        });
        var thead = el("thead", {}, el("tr", {},
          sortBtn("Beschreibung", "beschreibung"), sortBtn("Typ", "typ"), sortBtn("Erwartet", "soll"),
          sortBtn("Tatsächlich", "ist"), sortBtn("Δ", "delta"), sortBtn("Status", "status"),
          el("th", { class: "r" }, "Buchungen")));
        body.appendChild(el("div", { class: "tbl-wrap" }, el("table", { class: "tbl" }, thead, tbody)));
      }
    }));

    /* ================= Variable Ausgaben + Einnahmen ================= */
    var varParts = Logic.byCategory(c.variable, state.categories);
    var varCard = UI.collapsibleCard({
      key: "monat.variabel", title: "Variable Ausgaben", hint: "ohne erwartete Posten", defaultOpen: true
    }, function (body) {
      body.appendChild(el("div", { class: "figure-row", style: "margin-bottom:12px" },
        el("div", {}, el("div", { class: "eyebrow" }, "Summe"), el("div", { class: "big-figure neg" }, U.eur(c.variableSum)))));
      if (c.variable.length) {
        body.appendChild(el("div", { class: "donut-flex" },
          el("div", { class: "donut-box" }, Charts.donut(varParts, 148)),
          el("div", { class: "legend" }, varParts.slice(0, 8).map(function (p) {
            return el("div", { class: "row" },
              el("span", { class: "swatch", style: "background:" + p.farbe }),
              el("span", { class: "name" }, p.icon + " " + p.name),
              el("span", { class: "num small" }, U.eur(p.betrag)));
          }))));
      } else {
        body.appendChild(UI.emptyState("Keine variablen Ausgaben in diesem Monat.", "✓"));
      }
    });
    var einCard = UI.collapsibleCard({
      key: "monat.einnahmen", title: "Einnahmen", hint: "", defaultOpen: true
    }, function (body) {
      body.appendChild(el("div", { class: "figure-row", style: "margin-bottom:12px" },
        el("div", {}, el("div", { class: "eyebrow" }, "Summe"), el("div", { class: "big-figure pos" }, U.eur(c.einnahmenSum)))));
      body.appendChild(c.einnahmen.length
        ? el("div", { class: "scroll-y" }, UI.table(["Datum", "Quelle", { label: "Betrag", r: 1 }],
          c.einnahmen.slice().sort(function (a, b) { return b.datum < a.datum ? -1 : 1; }).map(function (t) {
            return el("tr", {}, td(el("span", { class: "num small" }, U.dateDE(t.datum))),
              td([el("div", { class: "cell-main" }, t.empfaenger || t.text || "—"), el("div", { class: "cell-sub" }, t.zweck || "")]),
              td(UI.money(t.betrag), "r num"));
          })))
        : UI.emptyState("Keine Einnahmen in diesem Monat.", "◌"));
    });
    host.appendChild(el("div", { class: "grid two" }, varCard, einCard));

    /* ================= Planung: Rücklagen | Geplante Ein-/Ausgaben (getrennt) ================= */
    // sign: 1 = Zusatzeinnahme (automatisch +), -1 = Zusatzausgabe/Rücklage (automatisch −).
    // Automatik greift, bis der Nutzer das Vorzeichen für eine Zeile bewusst manuell stellt
    // (Sonderfall: z. B. eine Rücklagen-Entnahme, die positiv zählen soll).
    function signedAmountInput(p, sign) {
      var lockBtn = el("button", {
        class: "btn sm ghost", style: "padding:3px 8px;font-size:12px;flex:0 0 auto",
        title: p.vorzeichenManuell
          ? "Vorzeichen wird manuell gehalten — klicken für automatisch (" + (sign > 0 ? "+" : "−") + ")"
          : "Vorzeichen automatisch (" + (sign > 0 ? "+" : "−") + ") — klicken zum manuellen Übersteuern",
        onclick: function () { p.vorzeichenManuell = !p.vorzeichenManuell; Store.commit(); UI.render(); }
      }, p.vorzeichenManuell ? "✎" : "🔒");
      var inp = UI.numInput({
        value: p.betrag,
        onchange: function (v) {
          if (!p.vorzeichenManuell && v !== 0) {
            var s = v < 0 ? -1 : 1;
            if (s !== sign) v = -v;
          }
          p.betrag = v; Store.commit(); UI.render();
        }
      });
      return el("div", { style: "display:flex;align-items:center;gap:5px;justify-content:flex-end" }, inp, lockBtn);
    }
    // Auf jeder Sonderposten-Zeile: Eintrag in einen anderen Monat verschieben (statt ihn
    // beim Monatswechsel unbemerkt aus dem Blick zu verlieren — z. B. für offene private
    // Forderungen, die über den aktuellen Monat hinaus bestehen bleiben).
    function moveControl(p) {
      // Bewusst ein <select> statt <input type="month">: Safari/WebKit (= Mac-App)
      // hat keinen nativen Monats-Picker — das Input wäre dort nur ein Textfeld.
      var inp = el("select", { title: "In einen anderen Monat verschieben", style: "max-width:130px;font-size:12px;padding:4px 6px" },
        el("option", { value: "" }, "Monat wählen …"));
      for (var off = -3; off <= 12; off++) {
        if (off === 0) continue;
        var d = new Date(parseInt(mk.slice(0, 4), 10), parseInt(mk.slice(5, 7), 10) - 1 + off, 1);
        var key = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
        inp.appendChild(el("option", { value: key }, U.monthLabel(key, true)));
      }
      inp.addEventListener("change", function () {
        var target = inp.value;
        if (!target || target === mk) return;
        // Wichtig: aus dem ECHTEN md.planned entfernen, nicht aus einer gefilterten Kopie —
        // sonst würde der Eintrag kopiert statt verschoben.
        var idx = md.planned.indexOf(p);
        if (idx === -1) return;
        md.planned.splice(idx, 1);
        Store.monthData(target).planned.push(p);
        Store.commit();
        U.toast("\u201E" + (p.beschreibung || "Eintrag") + "\u201C nach " + U.monthLabel(target, true) + " verschoben.", "ok");
        UI.render();
      });
      return inp;
    }

    function planCard(cfgKey, title, hint, typ, sign, showPerson) {
      var entries = (md.planned || []).filter(function (p) { return p.typ === typ; });
      return UI.collapsibleCard({
        key: cfgKey, title: title, hint: hint, defaultOpen: entries.length > 0
      }, function (body) {
        var monthTxs = c.txs.slice().sort(function (a, b) { return a.datum < b.datum ? 1 : -1; });

        // ---- geteilte Bausteine, für Tabellen- UND Karten-Darstellung gleichermaßen ----
        function buildStatusCell(p) {
          if (p.erledigt && p.txId) {
            var lt = state.transactions.find(function (t) { return t.id === p.txId; });
            return el("div", {},
              el("span", { class: "badge ok" }, "per Bank gebucht"),
              el("div", { class: "cell-sub" }, lt ? U.dateDE(lt.datum) + " · " + (lt.empfaenger || "").slice(0, 24) + " · " + U.eur(lt.betrag) : "Buchung nicht mehr gefunden"),
              el("button", { class: "btn sm ghost", style: "margin-top:4px", onclick: function () { p.erledigt = false; p.txId = null; Store.commit(); UI.render(); } }, "Verknüpfung lösen"));
          }
          var chk = el("input", { type: "checkbox", checked: !!p.erledigt, id: "chk-" + p.id, title: "manuell als erledigt markieren" });
          chk.addEventListener("change", function () { p.erledigt = chk.checked; p.txId = null; Store.commit(); UI.render(); });
          var linkSel = el("select", { style: "max-width:100%;font-size:12px;padding:4px 6px" },
            el("option", { value: "" }, "… oder Bankbuchung verknüpfen"),
            monthTxs.slice(0, 80).map(function (t) {
              return el("option", { value: t.id }, U.dateDE(t.datum) + " · " + (t.empfaenger || t.text || "?").slice(0, 24) + " · " + U.eur(t.betrag));
            }));
          linkSel.addEventListener("change", function () {
            if (!linkSel.value) return;
            p.erledigt = true; p.txId = linkSel.value;
            Store.commit(); UI.render();
            U.toast("Verknüpft — die Bankbuchung zählt, der Eintrag nicht mehr doppelt.", "ok");
          });
          return el("div", { style: "display:flex;flex-direction:column;gap:5px" },
            el("label", { style: "display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted)", for: "chk-" + p.id }, chk, p.erledigt ? "erledigt (manuell)" : "offen"),
            p.erledigt ? null : linkSel);
        }
        function buildDetail(p) {
          var detail = el("div", { class: "assign-row", style: "flex-wrap:wrap" });
          if (showPerson) {
            detail.appendChild(UI.field("Person (macht daraus eine Forderung/Verbindlichkeit)",
              UI.textInput(p.person || "", function (v) { p.person = v; Store.commit(); UI.render(); }, { placeholder: "z. B. Laura" })));
          }
          detail.appendChild(UI.field("Notiz",
            UI.textInput(p.notiz || "", function (v) { p.notiz = v; Store.commit(); }, { placeholder: "optional" })));
          return detail;
        }
        function buildDeleteBtn(p) {
          return el("button", {
            class: "btn sm danger", "aria-label": "löschen", onclick: function () {
              var idx = md.planned.indexOf(p);
              md.planned = md.planned.filter(function (x) { return x !== p; });
              Store.commit();
              var undoEntry = Store.pushUndo("\u201E" + (p.beschreibung || "Eintrag") + "\u201C", function () {
                md.planned.splice(Math.min(idx, md.planned.length), 0, p);
                Store.commit(); UI.render();
              });
              U.toast("\u201E" + (p.beschreibung || "Eintrag") + "\u201C gelöscht.", "ok", { label: "Rückgängig", onClick: function () { Store.popUndo(undoEntry.id); } });
              UI.render();
            }
          }, "✕");
        }

        var offenS = entries.filter(function (p) { return !p.erledigt; }).reduce(function (s, p) { return s + (Number(p.betrag) || 0); }, 0);

        if (!entries.length) {
          body.appendChild(UI.emptyState("Keine Einträge für " + U.monthLabel(mk) + ".", "◌"));
        } else if (UI.isNarrow()) {
          // ---- Handy/schmales Fenster: Karten statt einer zu engen 6-Spalten-Tabelle ----
          entries.forEach(function (p) {
            var isOpen = !!state.ui.planDetail[p.id];
            var card = el("div", { class: "posten-card", style: p.erledigt ? "opacity:.72" : "" },
              el("div", { class: "pc-head" },
                UI.textInput(p.beschreibung, function (v) { p.beschreibung = v; Store.commit(); }, { style: "font-weight:600;border:0;background:none;padding:0;flex:1" }),
                buildDeleteBtn(p)),
              el("div", { style: "margin:9px 0" }, signedAmountInput(p, sign)),
              el("div", { style: "margin-bottom:9px" }, buildStatusCell(p)),
              el("div", { class: "btn-row", style: "flex-wrap:nowrap" },
                moveControl(p),
                el("button", {
                  class: "row-expander", "aria-expanded": isOpen ? "true" : "false", title: showPerson ? "Person & Notiz" : "Notiz",
                  onclick: function () { state.ui.planDetail[p.id] = !isOpen; Store.commit(); UI.render(); }
                }, (isOpen ? "▾" : "▸") + " " + (p.person ? "👤" : (p.notiz ? "📝" : "mehr")))));
            if (isOpen) card.appendChild(el("div", { class: "pc-detail" }, buildDetail(p)));
            body.appendChild(card);
          });
          body.appendChild(el("div", { class: "flow-row total", style: "margin-top:4px" },
            el("span", {}, "Noch offen"), el("span", { class: "val" }, UI.money(Math.round(offenS * 100) / 100))));
        } else {
          // ---- Normale Breite: Tabelle ----
          var tbody = el("tbody", {});
          entries.forEach(function (p) {
            var isOpen = !!state.ui.planDetail[p.id];
            tbody.appendChild(el("tr", { style: p.erledigt ? "opacity:.72" : "" },
              td(UI.textInput(p.beschreibung, function (v) { p.beschreibung = v; Store.commit(); })),
              td(signedAmountInput(p, sign), "r"),
              td(buildStatusCell(p)),
              td(moveControl(p), "r"),
              td(el("button", {
                class: "row-expander", "aria-expanded": isOpen ? "true" : "false", title: showPerson ? "Person & Notiz" : "Notiz",
                onclick: function () { state.ui.planDetail[p.id] = !isOpen; Store.commit(); UI.render(); }
              }, (isOpen ? "▾" : "▸") + " " + (p.person ? "👤" : (p.notiz ? "📝" : "mehr"))), "r"),
              td(buildDeleteBtn(p), "r")));
            if (isOpen) tbody.appendChild(el("tr", { class: "item-detail" }, el("td", { colspan: "6" }, buildDetail(p))));
          });
          body.appendChild(el("div", { class: "tbl-wrap" }, el("table", { class: "tbl tbl-roomy" },
            el("thead", {}, el("tr", {}, el("th", {}, "Beschreibung"), el("th", { class: "r" }, "Betrag"), el("th", {}, "Status"), el("th", { class: "r" }, "Verschieben"), el("th", { class: "r" }, ""), el("th", { class: "r" }, ""))),
            tbody,
            el("tfoot", {}, el("tr", {}, td("Noch offen"), td(UI.money(Math.round(offenS * 100) / 100), "r num"), td(""), td(""), td(""), td(""))))));
        }
        body.appendChild(el("div", { class: "btn-row", style: "margin-top:10px" },
          el("button", {
            class: "btn sm", onclick: function () {
              md.planned.push({ id: U.uid("plan"), beschreibung: "", typ: typ, betrag: 0, erledigt: false, txId: null, person: "", notiz: "", vorzeichenManuell: false });
              Store.commit(); UI.render();
            }
          }, "＋ Eintrag")));
      });
    }
    state.ui.planDetail = state.ui.planDetail || {};
    host.appendChild(planCard("monat.ruecklagen", "Rücklagen & Sparen", "geplant → Prognose · erledigt → \u201EBisher gebucht\u201C · Betrag automatisch negativ", "ruecklage", -1, false));
    host.appendChild(el("div", { class: "grid two" },
      planCard("monat.zusatzeinnahmen", "Zusatzeinnahmen", "manuell · Betrag automatisch positiv · Person → Forderung", "einnahme", 1, true),
      planCard("monat.zusatzausgaben", "Zusatzausgaben", "manuell · Betrag automatisch negativ · Person → Verbindlichkeit", "ausgabe", -1, true)));

    /* ---- Wer schuldet wem: Netto-Übersicht über alle Monate, nur wenn Einträge existieren ---- */
    var personen = Logic.personSummary(state);
    if (personen.length) {
      host.appendChild(UI.collapsibleCard({
        key: "monat.personen", title: "Wer schuldet wem",
        hint: "aus Zusatzeinnahmen/-ausgaben mit Person, über alle Monate hinweg, nur offene Einträge", defaultOpen: true
      }, function (body) {
        personen.forEach(function (pe) {
          var openKey = "person-" + pe.person;
          var isOpen = !!state.ui.planDetail[openKey];
          var richtungText = Math.abs(pe.netto) < 0.005 ? "ausgeglichen"
            : pe.netto > 0 ? pe.person + " schuldet dir" : "du schuldest " + pe.person;
          var row = el("div", { class: "person-row" },
            el("button", {
              class: "row-expander", "aria-expanded": isOpen ? "true" : "false",
              onclick: function () { state.ui.planDetail[openKey] = !isOpen; Store.commit(); UI.render(); }
            }, (isOpen ? "▾" : "▸") + " " + pe.person),
            el("span", { class: "small muted", style: "flex:1" }, richtungText),
            el("span", { class: "num " + (pe.netto > 0 ? "pos" : pe.netto < 0 ? "neg" : "muted"), style: "font-weight:700" }, U.eur(Math.abs(pe.netto))));
          body.appendChild(row);
          if (isOpen) {
            var det = el("div", { style: "margin:0 0 10px 20px" });
            pe.entries.forEach(function (en) {
              det.appendChild(el("div", { class: "detail-tx" },
                el("span", { class: "num small muted" }, U.monthLabel(en.monat, true)),
                el("span", { class: "who" }, en.beschreibung || "—", en.notiz ? el("span", { class: "cell-sub" }, en.notiz) : null),
                el("span", { class: "num small " + (en.betrag > 0 ? "pos" : "neg") }, U.eur(en.betrag))));
            });
            body.appendChild(det);
          }
        });
      }));
    }

    /* ================= Buchungsliste ================= */
    host.appendChild(UI.collapsibleCard({
      key: "monat.buchungen", title: "Buchungen",
      hint: c.txs.length + " im effektiven Monat " + U.monthLabel(mk, true) + " · ⇄ = Posten zuordnen/anlegen", defaultOpen: true
    }, function (body) {
      var search = el("input", { type: "search", placeholder: "Suchen (Empfänger, Zweck, Betrag) …", value: state.ui.txQuery || "" });
      var catSel = el("select", {}, el("option", { value: "" }, "Alle Kategorien"),
        state.categories.map(function (cat) { return el("option", { value: cat.id, selected: cat.id === (state.ui.txCat || "") }, cat.icon + " " + cat.name); }));
      var txHost = el("div", {});
      function drawTxTable() {
        U.clear(txHost);
        var qq = (state.ui.txQuery || "").toLowerCase();
        var cf = state.ui.txCat || "";
        var txs = c.txs.slice().sort(function (a, b) { return a.datum < b.datum ? 1 : -1; })
          .filter(function (t) {
            if (cf && t.kategorieId !== cf) return false;
            if (!qq) return true;
            return ((t.empfaenger || "") + " " + (t.zweck || "") + " " + (t.text || "") + " " + t.betrag).toLowerCase().indexOf(qq) !== -1;
          });
        var trs = txs.map(function (t) {
          var st = statusOfTx(t);
          var item = t.itemId ? state.expected.find(function (i) { return i.id === t.itemId; }) : null;
          return el("tr", {},
            td(el("span", { class: "num small" }, U.dateDE(t.datum))),
            td([el("div", { class: "cell-main" }, t.empfaenger || t.text || "—"),
            el("div", { class: "cell-sub" }, t.zweck || "")]),
            td(UI.categorySelect(state, t)),
            td(item
              ? el("button", { class: "pill pill-btn", title: "Posten: " + item.beschreibung + " — klicken zum Ändern", onclick: function () { txActionDialog(state, t); } }, "❖ " + item.beschreibung.slice(0, 18))
              : el("button", { class: "btn sm ghost", title: "Einem Posten zuordnen oder neuen wiederkehrenden Posten anlegen", onclick: function () { txActionDialog(state, t); } }, "⇄ Posten")),
            td(st.label === "vorgemerkt"
              ? el("div", { style: "display:flex;align-items:center;gap:6px" },
                el("span", { class: "badge " + st.cls }, st.label),
                el("button", {
                  class: "btn sm ghost", title: "Bereits endgültig gebucht? Vormerkung der gebuchten Buchung zuordnen und entfernen",
                  onclick: function () { mergeVorgemerktDialog(state, t); }
                }, "✓"))
              : el("span", { class: "badge " + st.cls }, st.label)),
            td(UI.money(t.betrag), "r num"));
        });
        txHost.appendChild(txs.length
          ? el("div", { class: "scroll-y" }, UI.table(["Datum", "Buchung", "Kategorie", "Posten", "Status", { label: "Betrag", r: 1 }], trs))
          : UI.emptyState("Keine Buchungen" + (qq || cf ? " für diesen Filter" : "") + " in " + U.monthLabel(mk) + ".", "🔍"));
      }
      search.addEventListener("input", U.debounce(function () { state.ui.txQuery = search.value; Store.commit(); drawTxTable(); }, 200));
      catSel.addEventListener("change", function () { state.ui.txCat = catSel.value; Store.commit(); drawTxTable(); });
      drawTxTable();
      body.appendChild(el("div", { class: "searchbar", style: "margin-bottom:10px" }, search, catSel));
      body.appendChild(txHost);
    }));
  });
})();
