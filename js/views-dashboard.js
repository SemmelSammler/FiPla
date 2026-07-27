/* views-dashboard.js — Dashboard / Jahresübersicht */
"use strict";
(function () {
  var el = U.el, td = UI.td;

  function dataMonthBounds(state) {
    var keys = {};
    state.transactions.forEach(function (t) { keys[t.effMonat] = 1; });
    Object.keys(state.months).forEach(function (mk) {
      var m = state.months[mk];
      if (m && (m.giro != null || m.konto2 != null || m.kkSaldo != null || (m.planned || []).length)) keys[mk] = 1;
    });
    keys[U.currentMonth()] = 1;
    var list = Object.keys(keys).sort();
    return { first: list[0], last: list[list.length - 1] };
  }
  // Standard-Zeitraum wie im Excel: von den ersten Daten bis Dezember des Folgejahres
  function rangeOf(state) {
    var b = dataMonthBounds(state);
    var from = state.ui.dashFrom || b.first;
    var to = state.ui.dashTo || ((parseInt(U.currentMonth().slice(0, 4), 10) + 1) + "-12");
    if (Logic.cmpMonth(to, from) < 0) to = from;
    return { from: from, to: to };
  }

  function effectiveFi(state) {
    var a = JSON.parse(JSON.stringify(state.fi));
    if (a.hausEkZielAusHauskauf) a.hausEkZiel = Logic.runHauskauf(state.hauskauf).zielEk * (a.hausEkAnteil == null ? 0.5 : a.hausEkAnteil);
    return a;
  }
  window.__effectiveFi = effectiveFi;

  UI.registerView("dashboard", function (host, state) {
    state.ui.hiddenMonths = state.ui.hiddenMonths || {};
    var range = rangeOf(state);
    var allMonths = Logic.monthRange(range.from, range.to);
    var months = allMonths.filter(function (mk) { return !state.ui.hiddenMonths[mk]; });
    var hiddenCount = allMonths.length - months.length;
    var cur = U.currentMonth();
    // Die Übersichts-Karte oben kann einen beliebigen Monat zeigen (Wähler im Kopf);
    // Verlaufs-Charts unten bleiben bewusst am echten aktuellen Monat verankert.
    var dashMk = state.ui.dashMonth || cur;
    var cockpits = {};
    months.forEach(function (mk) { cockpits[mk] = Logic.monthCockpit(state, mk); });

    host.appendChild(UI.pageHead("Dashboard"));

    // Handy-Version: Budget-Panel ganz oben — Kontostände & Planung direkt eintragen
    if (window.APP_MODE === "mobile" && window.BudgetPanel) host.appendChild(window.BudgetPanel(state));

    /* ================= Aktueller Monat: Saldo als Hero + geordnete Gruppen ================= */
    var cc = Logic.monthCockpit(state, dashMk);
    var mdCur = state.months[dashMk] || {};
    var saldoNeu = cc.prognoseGesamt;
    state.ui.dashCalcOpen = state.ui.dashCalcOpen || false;

    function m(v, opts) { return el("span", { class: v > 0 ? "pos" : v < 0 ? "neg" : "muted" }, U.eur(v, opts)); }

    // Hero: Saldo steht allein, ruhig, groß — das ist die eine Zahl, die zählt
    var hero = el("div", { class: "dash-hero" },
      el("div", { class: "eyebrow" }, "Saldo Monatsende · alle Konten"),
      saldoNeu != null
        ? el("div", { class: "dash-hero-num " + (saldoNeu >= 0 ? "pos" : "neg") }, U.eur(saldoNeu))
        : el("div", { class: "dash-hero-num muted" }, "–"),
      el("div", { class: "small muted" },
        saldoNeu != null
          ? (mdCur.giro != null ? "Girokonto " + U.eur(mdCur.giro) + " · 2. Konto " + U.eur(mdCur.konto2 || 0) + " · Kreditkarte " + U.eur(mdCur.kkSaldo || 0) + " · + alles unten" : "")
          : "Girokonto im Monat eintragen, dann rechnet die Prognose los."));

    // Zwei Gruppen: was noch dazukommt / was noch abgeht — mit dem neuen, eindeutigen Vokabular
    function flowRow(label, sub, v) {
      return el("div", { class: "flow-row" },
        el("div", { class: "lbl" }, label, sub ? el("small", {}, sub) : null),
        el("div", { class: "val" }, m(v)));
    }
    var gZu = el("div", { class: "flow-grp zu" },
      el("h3", {}, "↑ kommt noch dazu"),
      flowRow("Erwartete Einnahmen", "wiederkehrend, noch nicht gebucht", cc.restEin),
      flowRow("Zusatzeinnahmen", "manuell eingetragen, noch offen", cc.plan.offenEinnahme));
    var gAb = el("div", { class: "flow-grp ab" },
      el("h3", {}, "↓ geht noch ab"),
      flowRow("Erwartete Fixkosten", cc.fix.open + " von " + cc.fix.total + " Posten offen", cc.restFix),
      flowRow("Erwartete Raten/Kredite", cc.schulden.open + " von " + cc.schulden.total + " Posten offen", cc.restSchuld),
      flowRow("Zusatzausgaben", "manuell eingetragen, noch offen", cc.plan.offenAusgabe),
      flowRow("Rücklagen geplant", cc.plan.erledigtCount ? cc.plan.erledigtCount + " bereits erledigt" : "noch offen", cc.plan.offenRuecklage),
      (function () {
        // Schnelleintrag: Rücklage direkt aus dem Dashboard in die Planung des aktuellen Monats schreiben
        var inp = UI.numInput({ value: null, allowEmpty: true, onchange: function () { } });
        inp.placeholder = "z. B. 400";
        var addBtn = el("button", {
          class: "btn sm", "aria-label": "Rücklage eintragen", title: "Rücklage in die Planung von " + U.monthLabel(dashMk) + " eintragen",
          onclick: function () {
            var v = U.parseInputNumber(inp.value);
            if (isNaN(v) || v === 0) { U.toast("Bitte einen Betrag eingeben.", "warn"); return; }
            if (v > 0) v = -v; // Rücklagen automatisch negativ (Batch 2 führt das global ein, hier schon vorweggenommen)
            Store.monthData(dashMk).planned.push({ id: U.uid("plan"), beschreibung: "Rücklage (aus Dashboard)", typ: "ruecklage", betrag: v, erledigt: false, txId: null });
            Store.commit();
            U.toast(U.eur(v) + " Rücklage für " + U.monthLabel(dashMk) + " eingetragen — im Monat editierbar.", "ok");
            UI.render();
          }
        }, "＋");
        return el("div", { class: "flow-quickadd" }, el("span", { class: "small muted" }, "Rücklage eintragen"), inp, addBtn);
      })());
    var flow = el("div", { class: "dash-flow" }, gZu, el("div", { class: "flow-arrow" }, "→"), gAb);

    // Sekundäre Kontext-Kacheln: kleiner, informativ statt gleichrangig zum Saldo
    var bisherAusgegeben = Math.round((cc.fixIst + cc.schuldIst + cc.variableSum) * 100) / 100;
    var variablerAnteil = bisherAusgegeben !== 0 ? Math.round((cc.variableSum / bisherAusgegeben) * 100) : 0;
    function mini(label, valueNode, sub) {
      return el("div", { class: "mini-card" },
        el("div", { class: "eyebrow" }, label),
        el("div", { class: "mini-num" }, valueNode),
        sub ? el("div", { class: "mini-sub" }, sub) : null);
    }
    var secRow = el("div", { class: "dash-secrow" },
      mini("Konten heute", mdCur.giro != null ? m((mdCur.giro || 0) + (mdCur.konto2 || 0) + (mdCur.kkSaldo || 0), { neutral: true }) : el("span", { class: "muted" }, "–"), "Stand jetzt, zur Einordnung"),
      mini("Bisher eingenommen", m(cc.einnahmenSum), cc.einnahmen.length + " Buchungen"),
      mini("Bisher ausgegeben", m(bisherAusgegeben), "davon " + variablerAnteil + " % variabel"));

    // Kopfrechnung: Saldo = Konten + alles Offene
    var calcHost = el("div", {});
    if (saldoNeu != null) {
      var open2 = !!state.ui.dashCalcOpen;
      calcHost.appendChild(el("button", {
        class: "row-expander", style: "margin-top:10px", "aria-expanded": open2 ? "true" : "false",
        onclick: function () { state.ui.dashCalcOpen = !open2; Store.commit(); UI.render(); }
      }, (open2 ? "▾" : "▸") + " Wie setzt sich der Saldo zusammen?"));
      if (open2) {
        var calc = el("div", { class: "calc", style: "max-width:520px" });
        function line(label, v, first) {
          if (!first && Math.abs(v) < 0.005) return;
          calc.appendChild(el("div", { class: "calc-line" },
            el("span", {}, (first ? "" : (v >= 0 ? "+ " : "− ")) + label),
            el("span", { class: "num " + (v > 0 ? "pos" : v < 0 ? "neg" : "muted") }, U.eur(first ? v : Math.abs(v)))));
        }
        line("Girokonto", mdCur.giro || 0, true);
        line("2. Konto", mdCur.konto2 || 0);
        line("Kreditkarte", mdCur.kkSaldo || 0);
        line("erwartete Einnahmen (offen)", cc.restEin);
        line("erwartete Fixkosten (offen)", cc.restFix);
        line("erwartete Raten/Kredite (offen)", cc.restSchuld);
        line("Zusatzeinnahmen", cc.plan.offenEinnahme);
        line("Zusatzausgaben", cc.plan.offenAusgabe);
        line("Rücklagen geplant", cc.plan.offenRuecklage);
        calc.appendChild(el("div", { class: "calc-line total" },
          el("span", {}, "= Saldo Monatsende"), el("span", { class: "num" }, U.eur(saldoNeu))));
        calcHost.appendChild(calc);
      }
    }

    var fiA = effectiveFi(state);
    var fi = Logic.runFI(fiA);
    // Monatswähler für die Übersichts-Karte; „Heute“ springt zurück zum aktuellen Monat
    var dashMonthSel = UI.monthSelect({
      value: dashMk, center: cur, back: 24, forward: 24,
      onChange: function (v) { if (v) { state.ui.dashMonth = v === cur ? null : v; Store.commit(); UI.render(); } }
    });
    dashMonthSel.style.maxWidth = "150px";
    dashMonthSel.style.flex = "0 0 auto";
    var curCard = el("section", { class: "card" },
      el("h2", { class: "card-title" }, (dashMk === cur ? "Aktueller Monat · " : "Monat · ") + U.monthLabel(dashMk),
        el("span", { class: "spacer", style: "flex:1" }),
        dashMonthSel,
        dashMk !== cur ? el("button", { class: "btn sm ghost", onclick: function () { state.ui.dashMonth = null; Store.commit(); UI.render(); } }, "Heute") : null,
        el("span", { style: "flex:1" }),
        el("button", { class: "btn primary sm", onclick: function () { UI.go("monat", { month: dashMk }); } }, "Zum Monat →")),
      hero, flow, secRow, calcHost);
    var fiCard = el("section", { class: "card" },
      el("h2", { class: "card-title" }, "FI-Planung ", el("span", { class: "hint" }, "4 %-Regel")),
      el("div", { class: "figure-row" },
        el("div", {}, el("div", { class: "eyebrow" }, "FI-Jahr"),
          el("div", { class: "big-figure pos" }, fi.fiJahr != null ? String(fi.fiJahr) : "—")),
        el("div", {}, el("div", { class: "eyebrow" }, "Alter"),
          el("div", { class: "big-figure" }, fi.fiAlter != null ? String(fi.fiAlter) : "—"))),
      el("p", { class: "small muted", style: "margin:10px 0 4px" },
        "Cashflow heute: ", el("span", { class: "num pos" }, U.eur(fi.cashflowHeute) + " / Monat"),
        " · Vermögen bei FI: ", el("span", { class: "num" }, U.eur(fi.vermoegenBeiFi, { ganz: true }))),
      el("div", { class: "btn-row", style: "margin-top:8px" },
        el("button", { class: "btn sm", onclick: function () { UI.go("fi"); } }, "Zur FI-Planung →")));

    /* ---- Depot-Tracker (Trade Republic) ---- */
    var dep = state.depot;
    var dr = Logic.runDepot(dep);
    function depField(label, key, cfg) {
      cfg = cfg || {};
      return UI.field(label, UI.numInput({
        value: dep[key], prozent: cfg.prozent, plain: cfg.plain,
        onchange: function (v) { dep[key] = v; Store.commit(); UI.render(); }
      }), cfg.after);
    }
    var depotCard = el("section", { class: "card" },
      el("h2", { class: "card-title" },
        UI.textInput(dep.name, function (v) { dep.name = v; Store.commit(); }, { style: "max-width:170px;font-weight:650;background:transparent;border-color:transparent;padding-left:0" }),
        el("span", { class: "hint" }, "Depot-Tracker · " + U.eur(dep.rate) + "/Mon über die Fixkosten")),
      el("div", { class: "figure-row" },
        el("div", {},
          el("div", { class: "eyebrow" }, "in " + Math.round(dep.jahre) + " Jahr" + (Math.round(dep.jahre) === 1 ? "" : "en") + " (" + U.pct(dep.zins, 0) + " p.a.)"),
          el("div", { class: "big-figure pos" }, U.eur(dr.endwert, { ganz: true })))),
      el("p", { class: "small muted", style: "margin:8px 0 12px" },
        "davon eingezahlt ", el("span", { class: "num" }, U.eur(dr.eingezahlt, { ganz: true })),
        " + Zinsgewinn ", el("span", { class: "num pos" }, U.eur(dr.zinsgewinn, { ganz: true })),
        " · monatliche Verzinsung"),
      Charts.multiLine({
        labels: dr.points.map(function (pt) { return pt.jahr === 0 ? "heute" : "+" + pt.jahr + " J."; }),
        series: [
          { name: "Depotwert", color: "#A78BFA", values: dr.points.map(function (pt) { return pt.wert; }),
            hover: function (i, v) { return (dr.points[i].jahr === 0 ? "heute" : "in " + dr.points[i].jahr + " Jahren") + " · Depotwert: " + U.eur(v); } },
          { name: "Eingezahlt", color: "#5EEAD4", dash: true, values: dr.points.map(function (pt) { return pt.eingezahlt; }),
            hover: function (i, v) { return (dr.points[i].jahr === 0 ? "heute" : "in " + dr.points[i].jahr + " Jahren") + " · eingezahlt: " + U.eur(v); } }
        ], height: 150, zeroLine: false
      }),
      el("div", { class: "fields", style: "margin-top:12px;grid-template-columns:repeat(2,1fr)" },
        depField("Startwert (aktueller Depotstand)", "start"),
        depField("Sparrate / Mon", "rate", { after: "läuft bei dir als Fixkosten-Dauerauftrag" }),
        depField("Rendite p.a.", "zins", { prozent: true }),
        depField("Zeitraum (Jahre)", "jahre", { plain: true })));

    host.appendChild(el("div", { class: "grid side" }, curCard,
      el("div", { style: "display:flex;flex-direction:column;gap:16px;min-width:0" }, fiCard, depotCard)));

    /* ================= Zeitraum & ausgeblendete Monate ================= */
    var fromInp = UI.monthSelect({
      value: range.from, center: U.currentMonth(), back: 48, forward: 48,
      onChange: function (v) { if (v) { state.ui.dashFrom = v; Store.commit(); UI.render(); } }
    });
    var toInp = UI.monthSelect({
      value: range.to, center: U.currentMonth(), back: 48, forward: 48,
      onChange: function (v) { if (v) { state.ui.dashTo = v; Store.commit(); UI.render(); } }
    });
    var rangeBar = el("div", { class: "btn-row", style: "margin-bottom:14px" },
      el("span", { class: "eyebrow" }, "Zeitraum"), fromInp, el("span", { class: "muted" }, "bis"), toInp,
      el("button", {
        class: "btn sm ghost", onclick: function () { state.ui.dashFrom = null; state.ui.dashTo = null; Store.commit(); UI.render(); }
      }, "Zurücksetzen"),
      hiddenCount ? el("button", {
        class: "btn sm ghost", onclick: function () { state.ui.hiddenMonths = {}; Store.commit(); UI.render(); U.toast("Alle Monate wieder eingeblendet.", "ok"); }
      }, "👁 " + hiddenCount + " ausgeblendete" + (hiddenCount === 1 ? "n Monat" : " Monate") + " zeigen") : null);
    host.appendChild(rangeBar);

    /* ================= Charts ================= */
    // 3.2: Verlauf — Vergangenheit (sicher, durchgezogen) optisch klar von der Prognose
    // (gestrichelt, dünner) getrennt, statt einer einzigen ununterscheidbaren Linie.
    var running = 0;
    var vals = months.map(function (mk) {
      running += cockpits[mk].prognoseSaldo;
      return Math.round(running * 100) / 100;
    });
    var bisherWerte = vals.map(function (v, i) { return Logic.cmpMonth(months[i], cur) <= 0 ? v : null; });
    var prognoseWerte = vals.map(function (v, i) { return Logic.cmpMonth(months[i], cur) >= 0 ? v : null; });
    var dots = [];
    months.forEach(function (mk, i) {
      var mm = state.months[mk];
      if (mm && mm.giro != null) dots.push({ index: i, y: mm.giro, color: "var(--warn)" });
    });
    var lineCard = el("section", { class: "card" },
      el("h2", { class: "card-title" }, "Verlauf ", el("span", { class: "hint" }, "durchgezogen = bisher · gestrichelt = reine Prognose · gelbe Punkte = manuelle Kontostände")),
      Charts.multiLine({
        labels: months.map(function (mk) { return U.monthLabel(mk, true); }),
        series: [
          { name: "Bisher", color: "var(--accent)", values: bisherWerte },
          { name: "Prognose", color: "var(--accent)", dash: true, values: prognoseWerte, hover: function (i, v) { return U.monthLabel(months[i], true) + " · Prognose: " + U.eur(v); } }
        ],
        dots: dots, zeroLine: true, fillFirst: false
      }));

    // 3.1: Kategorie-Ausgaben-Trend ersetzt "Einnahmen vs. Ausgaben" — die alten Balken
    // wiederholten in der Zukunft nur denselben Wert (0 € variable Ausgaben angenommen)
    // und zeigten kaum etwas Aussagekräftiges. Ein Trend über die tatsächlichen variablen
    // Ausgaben je Kategorie zeigt stattdessen echtes Verhalten (z. B. "Lebensmittel steigt").
    var pastMonths = months.filter(function (mk) { return Logic.cmpMonth(mk, cur) <= 0; });
    var catByMonth = {};
    pastMonths.forEach(function (mk) { catByMonth[mk] = Logic.byCategory(cockpits[mk].variable, state.categories); });
    var catTotals = {};
    pastMonths.forEach(function (mk) {
      catByMonth[mk].forEach(function (p) { catTotals[p.kategorieId] = (catTotals[p.kategorieId] || 0) + Math.abs(p.betrag); });
    });
    var topCatIds = Object.keys(catTotals).sort(function (a, b) { return catTotals[b] - catTotals[a]; }).slice(0, 5);
    var catSeries = topCatIds.map(function (kid, idx) {
      var cat = state.categories.find(function (c) { return c.id === kid; });
      return {
        name: cat ? (cat.icon + " " + cat.name) : "Unbekannt", color: cat ? cat.farbe : "#8C99B4",
        dash: idx > 0,
        values: pastMonths.map(function (mk) {
          var found = catByMonth[mk].find(function (p) { return p.kategorieId === kid; });
          return found ? Math.round(Math.abs(found.betrag) * 100) / 100 : 0;
        })
      };
    });
    var barCard = el("section", { class: "card" },
      el("h2", { class: "card-title" }, "Kategorie-Trend ", el("span", { class: "hint" }, "größte variable Ausgaben-Kategorien über die Zeit · nur bereits gebuchte Monate")),
      pastMonths.length >= 2 && catSeries.length
        ? Charts.multiLine({ labels: pastMonths.map(function (mk) { return U.monthLabel(mk, true); }), series: catSeries, fillFirst: false })
        : UI.emptyState("Noch nicht genug Monate mit variablen Ausgaben für einen Trend.", "📈"));
    host.appendChild(el("div", { class: "grid two" }, lineCard, barCard));

    /* ================= Monatstabelle (wie Excel: Zukunft mit erwarteten Werten) ================= */
    host.appendChild(UI.collapsibleCard({
      key: "dash.monate", title: "Monatsübersicht",
      hint: months.length + " Monate · Werte = bereits gebucht + noch erwartet · 👁 blendet einen Monat aus", defaultOpen: true
    }, function (body) {
      var trs = months.map(function (mk) {
        var c = cockpits[mk];
        var isCur = mk === cur;
        var isFuture = Logic.cmpMonth(mk, cur) > 0;
        var einn = Math.round((c.einnahmenSum + c.restEin + c.plan.offenEinnahme) * 100) / 100;
        var fix = Math.round((c.fixIst + c.restFix) * 100) / 100;
        var schuld = Math.round((c.schuldIst + c.restSchuld) * 100) / 100;
        var rueck = Math.round((c.plan.offenRuecklage + c.plan.erledigtRuecklageIst) * 100) / 100;
        return el("tr", { style: isCur ? "outline:1px solid var(--accent);outline-offset:-1px" : (isFuture ? "opacity:.82" : "") },
          td(el("div", { style: "display:flex;align-items:center;gap:4px" },
            el("button", { class: "btn sm ghost", style: "font-family:var(--mono)", onclick: function () { UI.go("monat", { month: mk }); } }, U.monthLabel(mk, true)),
            isFuture ? el("span", { class: "pill", title: "Zukunft: reine Prognose aus erwarteten Posten + Planung" }, "Prognose") : null)),
          td(UI.money(c.prognoseSaldo), "r num"),
          td(UI.money(einn), "r num"),
          td(UI.money(c.variableSum), "r num"),
          td(UI.money(fix), "r num"),
          td(UI.money(schuld), "r num"),
          td(UI.money(rueck, { neutral: true }), "r num"),
          td(el("span", { class: "small muted num" }, (c.fix.total - c.fix.open) + "/" + c.fix.total), "r"),
          td(el("button", {
            class: "row-expander", title: "Diesen Monat aus Dashboard & Charts ausblenden",
            onclick: function () { state.ui.hiddenMonths[mk] = true; Store.commit(); UI.render(); }
          }, "👁"), "r"));
      });
      body.appendChild(el("div", { class: "scroll-y" },
        UI.table(["Monat", { label: "Saldo", r: 1 }, { label: "Einnahmen", r: 1 }, { label: "Variabel", r: 1 }, { label: "Fixkosten", r: 1 }, { label: "Schulden", r: 1 }, { label: "Rücklagen", r: 1 }, { label: "Posten", r: 1 }, { label: "", r: 1 }], trs)));
    }));
  });
})();
