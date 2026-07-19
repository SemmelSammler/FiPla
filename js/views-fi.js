/* views-fi.js — FI-Planung (Finanzielle Unabhängigkeit) */
"use strict";
(function () {
  var el = U.el, td = UI.td;

  // Ein Farbsystem für alles: Annahmen-Gruppen, Wasserfall, Charts und Tabelle
  // Farben kommen aus dem zentralen CSS-Farbsystem (styles.css :root), nicht mehr fest im JS —
  // so folgt der Wasserfall/die Charts automatisch jeder späteren Umfärbung der App.
  var C = {
    einnahmen: U.cssVar("--pos"), fixkosten: U.cssVar("--neg"), kredite: U.cssVar("--step-kredite"),
    lebensqual: U.cssVar("--step-lebensqual"), autokind: U.cssVar("--step-autokind"), sonder: U.cssVar("--step-kredite"),
    hausek: U.cssVar("--warn"), notgroschen: U.cssVar("--step-notgroschen"), etf: U.cssVar("--step-etf"), vermoegen: U.cssVar("--pos")
  };

  UI.registerView("fi", function (host, state) {
    var a = state.fi;
    var eff = window.__effectiveFi(state);
    var fi = Logic.runFI(eff);
    state.ui.fiSeries = state.ui.fiSeries || { vermoegen: true, etf: true, sparziele: false, schulden: false };
    var ser = state.ui.fiSeries;

    host.appendChild(UI.pageHead("FI-Planung",
      "Jahr für Jahr: Einnahmen − Kosten = frei · frei wird nach fester Reihenfolge verteilt · reagiert live auf jede Änderung"));

    /* ================= Cockpit + 4 %-Regel erklärt ================= */
    var fiRow = fi.fiJahr != null ? fi.years.find(function (y) { return y.jahr === fi.fiJahr; }) : null;
    var zielKapital = eff.fixkostenDeckel * 12 / 0.04;
    host.appendChild(el("section", { class: "card" },
      el("div", { class: "figure-row" },
        el("div", {}, el("div", { class: "eyebrow" }, "FI-Jahr"),
          el("div", { class: "big-figure pos" }, fi.fiJahr != null ? String(fi.fiJahr) : "nicht erreicht")),
        el("div", {}, el("div", { class: "eyebrow" }, "Alter bei FI"),
          el("div", { class: "big-figure" }, fi.fiAlter != null ? String(fi.fiAlter) : "—")),
        el("div", {}, el("div", { class: "eyebrow" }, "Vermögen heute"),
          el("div", { class: "big-figure " + (fi.vermoegenHeute < 0 ? "neg" : "") }, U.eur(fi.vermoegenHeute, { ganz: true }))),
        el("div", {}, el("div", { class: "eyebrow" }, "Vermögen bei FI"),
          el("div", { class: "big-figure" }, fi.vermoegenBeiFi != null ? U.eur(fi.vermoegenBeiFi, { ganz: true }) : "—")),
        el("div", {}, el("div", { class: "eyebrow" }, "Cashflow heute / Mon"),
          el("div", { class: "big-figure pos" }, U.eur(fi.cashflowHeute)))),
      el("div", { class: "callout", style: "margin-top:14px" },
        el("strong", {}, "Die 4 %-Regel: "),
        "FI ist erreicht, sobald (Notgroschen + Haus-EK + ETF) × 4 % deine Jahres-Fixkosten deckt. Bei ",
        el("span", { class: "num" }, U.eur(eff.fixkostenDeckel) + " × 12 = " + U.eur(eff.fixkostenDeckel * 12, { ganz: true })),
        " pro Jahr brauchst du also ca. ",
        el("strong", { class: "num" }, U.eur(zielKapital, { ganz: true })),
        " Kapital.",
        fiRow ? el("span", {}, " " + fi.fiJahr + " hast du " + U.eur(fiRow.notgroschen + fiRow.hausEk + fiRow.etf, { ganz: true }) + " — Check ✓.") : "")));

    /* ================= Hauptgrafik: dynamisch, Serien zuschaltbar ================= */
    var labels = fi.years.map(function (y) { return String(y.jahr); });
    var series = [];
    if (ser.vermoegen) series.push({ name: "Vermögen gesamt", color: C.vermoegen, values: fi.years.map(function (y) { return Math.round(y.vermoegen); }) });
    if (ser.etf) series.push({ name: "ETF", color: C.etf, values: fi.years.map(function (y) { return Math.round(y.etf); }) });
    if (ser.sparziele) {
      series.push({ name: "Notgroschen", color: C.notgroschen, dash: true, values: fi.years.map(function (y) { return Math.round(y.notgroschen); }) });
      series.push({ name: "Haus-EK", color: C.hausek, dash: true, values: fi.years.map(function (y) { return Math.round(y.hausEk); }) });
    }
    if (ser.schulden) series.push({ name: "KfW-Restschuld", color: C.kredite, dash: true, values: fi.years.map(function (y) { return Math.round(y.kfw1 + y.kfw2); }) });
    var markers = [];
    if (fi.fiJahr != null && ser.vermoegen) markers.push({ seriesIdx: 0, index: fi.years.findIndex(function (y) { return y.jahr === fi.fiJahr; }), label: "FI " + fi.fiJahr, color: "var(--pos)" });
    function chip(key, label, color) {
      return el("button", {
        class: "chip" + (ser[key] ? " on" : ""), style: ser[key] ? "border-color:" + color + ";color:" + color : "",
        onclick: function () { ser[key] = !ser[key]; Store.commit(); UI.render(); }
      }, el("span", { class: "chip-dot", style: "background:" + color }), label);
    }
    host.appendChild(el("section", { class: "card" },
      el("h2", { class: "card-title" }, "Vermögensentwicklung ",
        el("span", { class: "hint" }, "klick auf die Chips, um Linien ein-/auszublenden · Hover zeigt Werte")),
      el("div", { class: "btn-row", style: "margin-bottom:10px" },
        chip("vermoegen", "Vermögen gesamt", C.vermoegen),
        chip("etf", "ETF", C.etf),
        chip("sparziele", "Notgroschen & Haus-EK", C.notgroschen),
        chip("schulden", "Restschulden", C.kredite)),
      series.length
        ? Charts.multiLine({ labels: labels, series: series, markers: markers, zeroLine: true, height: 280 })
        : el("p", { class: "muted small" }, "Mindestens eine Linie einschalten.")));

    /* ================= Annahmen (gruppiert & farbig) + Jahr-Wasserfall ================= */
    function f(label, key, cfg) {
      cfg = cfg || {};
      return UI.field(label, UI.numInput({
        value: a[key], prozent: cfg.prozent, plain: cfg.plain,
        onchange: function (v) { a[key] = v; Store.commit(); UI.render(); }
      }), cfg.after, { kind: cfg.kind, tip: cfg.tip });
    }
    function group(title, color, explain, fields) {
      return el("div", { class: "fi-group", style: "border-left-color:" + color },
        el("div", { class: "fi-group-head" },
          el("span", { class: "fi-group-title", style: "color:" + color }, title),
          el("span", { class: "small muted" }, explain)),
        el("div", { class: "fields" }, fields));
    }
    // Jahr-Detail: der Wasserfall eines wählbaren Jahres
    var selYear = state.ui.fiYear && fi.years.some(function (y) { return y.jahr === state.ui.fiYear; })
      ? state.ui.fiYear : fi.years[0].jahr;
    var Y = fi.years.find(function (y) { return y.jahr === selYear; });
    var yearSel = el("select", { style: "max-width:110px;font-family:var(--mono)" },
      fi.years.map(function (y) { return el("option", { value: y.jahr, selected: y.jahr === selYear }, String(y.jahr)); }));
    yearSel.addEventListener("change", function () { state.ui.fiYear = parseInt(yearSel.value, 10); Store.commit(); UI.render(); });

    var hausEkToggle = el("input", { type: "checkbox", checked: !!a.hausEkZielAusHauskauf, id: "hek-link" });
    hausEkToggle.addEventListener("change", function () { a.hausEkZielAusHauskauf = hausEkToggle.checked; Store.commit(); UI.render(); });
    var anteilInp = UI.numInput({ value: a.hausEkAnteil == null ? 0.5 : a.hausEkAnteil, prozent: true, onchange: function (v) { a.hausEkAnteil = v; Store.commit(); UI.render(); } });
    anteilInp.style.maxWidth = "76px";
    var hausEkZielField = a.hausEkZielAusHauskauf
      ? UI.field("Haus-EK-Ziel (live aus Hauskauf)", el("div", { class: "num", style: "padding:7px 10px;background:var(--bg-soft);border:1px solid var(--line);border-radius:9px;text-align:right;color:" + C.hausek }, U.eur(eff.hausEkZiel)), "Ziel-EK × Anteil")
      : f("Haus-EK-Ziel (manuell)", "hausEkZiel");

    var annahmen = UI.collapsibleCard({ key: "fi.annahmen", title: "Annahmen", hint: "gleiche Nummern & Farben wie im Wasserfall · Live-Zahlen pro Schritt für das dort gewählte Jahr (" + selYear + ")", defaultOpen: true }, function (body) {
      function stepTitle(nr, text, color, badge, badgeHint) {
        return el("div", { class: "fi-group-head" },
          nr != null ? el("span", { class: "step-num", style: "background:" + color }, String(nr)) : null,
          el("span", { class: "fi-group-title", style: "color:" + color }, text),
          badge ? el("span", { class: "prio-badge", title: badgeHint || "" }, badge) : null);
      }
      function grp(color, headNode, fields, note, statusNode) {
        return el("div", { class: "fi-group", style: "border-left-color:" + color },
          headNode,
          note ? el("p", { class: "small muted", style: "margin:0 0 10px" }, note) : null,
          el("div", { class: "fields" }, fields),
          statusNode || null);
      }
      // Live-Zeile pro Schritt: was fließt im gewählten Jahr wirklich, und warum (nicht)?
      function firstYear(pred) { var y = fi.years.find(pred); return y ? y.jahr : null; }
      var kfw1Weg = firstYear(function (y) { return y.kfw1 >= -0.005; });
      var hekVoll = firstYear(function (y) { return y.hausEk >= eff.hausEkZiel - 0.01; });
      var ngVoll = firstYear(function (y) { return y.notgroschen >= eff.notgroschenZiel - 0.01; });
      var ngStart = firstYear(function (y) { return y.allocNotgroschen > 0.005; });
      function stepStatus(color, alloc, wunsch, reason) {
        var full = alloc >= wunsch - 0.005;
        return el("div", { class: "step-status" },
          el("span", { class: "num", style: "color:" + color + ";font-weight:700" }, U.eur(alloc) + " / Mon"),
          el("span", { class: "small muted" }, " fließen hier " + selYear + " rein" +
            (reason ? " — " + reason : (full ? "" : " — gekappt: die Schritte davor haben Vorrang"))));
      }
      body.appendChild(grp(C.einnahmen,
        stepTitle(null, "Basis: Einnahmen & Fixkosten", C.einnahmen),
        [f("Startjahr", "startjahr", { plain: true }), f("Startalter", "startalter", { plain: true }), f("Monate im 1. Jahr", "monateJahr1", { plain: true }),
        f("Einnahmen netto / Mon", "einnahmen"), f("Wachstum Einnahmen p.a.", "wachstumEinnahmen", { prozent: true }),
        f("Deckel Einnahmen / Mon", "einnahmenDeckel", { kind: "schaetzung", tip: "Plateau für die Fernprognose — ab hier wachsen die Einnahmen nicht weiter." }),
        f("Fixkosten / Mon", "fixkosten"), f("Wachstum Fixkosten p.a.", "wachstumFix", { prozent: true }),
        f("Deckel Fixkosten / Mon", "fixkostenDeckel", { kind: "schaetzung", tip: "Plateau — bestimmt auch das FI-Ziel (Deckel × 12 / 4 %)." })],
        "Einnahmen − Fixkosten − KfW-Pflichtraten = dein freies Geld. Erst danach beginnt die Verteilung."));
      body.appendChild(grp(C.kredite,
        stepTitle(null, "Immer zuerst: KfW-Pflichtraten", C.kredite, "PFLICHT", "geht vor allem anderen vom Einkommen ab"),
        [f("KfW1-Restschuld heute", "kfw1Rest"), f("KfW2-Restschuld", "kfw2Rest")],
        "Die monatlichen Pflichtraten stehen in den Tilgungsplänen weiter unten und mindern direkt das Freie."));
      body.appendChild(grp(C.lebensqual,
        stepTitle(1, "Lebensqualität", C.lebensqual, "FIX RESERVIERT", "wird immer zuerst aus dem Freien reserviert"),
        [f("Lebensqualität fix / Mon", "lebensqualitaet", { tip: "Freizeit, Urlaub, Restaurants — bewusst fest eingeplant, damit der Plan realistisch bleibt." })],
        null, stepStatus(C.lebensqual, Y.allocLebensqual, eff.lebensqualitaet)));
      body.appendChild(grp(C.sonder,
        stepTitle(2, "KfW1-Sondertilgung", C.sonder, "SOLANGE SCHULD", "läuft nur, bis KfW1 getilgt ist — danach fließt das Geld automatisch weiter"),
        [f("Sondertilgung / Mon (max.)", "kfw1Sonder")],
        null, stepStatus(C.sonder, Y.allocSonder, eff.kfw1Sonder,
          Y.allocSonder < 0.005 && kfw1Weg && selYear >= kfw1Weg ? "KfW1 ist seit " + kfw1Weg + " getilgt, der Schritt entfällt" : null)));
      body.appendChild(grp(C.autokind,
        stepTitle(3, "Auto + Kind", C.autokind, "FIX RESERVIERT"),
        [f("Auto-Pauschale / Mon", "autoPauschale"), f("Kind-Sparrate / Mon", "kindSparrate")],
        null, stepStatus(C.autokind, Y.allocAutoKind, eff.autoPauschale + eff.kindSparrate)));
      body.appendChild(grp(C.hausek,
        stepTitle(4, "Haus-Eigenkapital", C.hausek, "BIS ZIEL", "stoppt automatisch, wenn das Ziel erreicht ist"),
        [hausEkZielField, f("Haus-EK-Sparrate / Mon", "hausEkRate"),
        UI.field("Kopplung an Hauskauf", el("div", { style: "display:flex;align-items:center;gap:8px;padding:6px 0" },
          hausEkToggle, el("label", { for: "hek-link", class: "small muted" }, "Ziel aus Hauskauf ×"), anteilInp, el("span", { class: "small muted" }, "%")))],
        null, stepStatus(C.hausek, Y.allocHausEk, eff.hausEkRate,
          Y.allocHausEk < 0.005 && hekVoll && selYear >= hekVoll ? "Ziel erreicht seit " + hekVoll
            : (Y.allocHausEk < eff.hausEkRate - 0.005 ? "gekappt: Schritte 1–3 haben Vorrang" : (hekVoll ? "voll — Ziel wird " + hekVoll + " erreicht" : null)))));
      body.appendChild(grp(C.notgroschen,
        stepTitle(5, "Notgroschen", C.notgroschen, "BIS ZIEL", "wird erst befüllt, wenn nach den Schritten davor noch Geld übrig ist"),
        [f("Notgroschen-Ziel", "notgroschenZiel"), f("Notgroschen-Sparrate / Mon", "notgroschenRate"),
        f("Notgroschen-Zins p.a.", "notgroschenZins", { prozent: true })],
        null, stepStatus(C.notgroschen, Y.allocNotgroschen, eff.notgroschenRate,
          Y.allocNotgroschen < 0.005
            ? (ngVoll && selYear >= ngVoll ? "Ziel erreicht seit " + ngVoll
              : "kein Budget mehr — Schritte 1–4 haben Vorrang" + (ngStart ? "; füllt sich ab " + ngStart : ""))
            : (ngVoll ? "voll — Ziel wird " + ngVoll + " erreicht" : null))));
      body.appendChild(grp(C.etf,
        stepTitle(6, "ETF", C.etf, "REST", "bekommt alles, was übrig bleibt — mindestens den Mindestbetrag"),
        [f("ETF-Mindestbetrag / Mon", "etfMindest", { tip: "Wird vorab reserviert, damit der ETF nie leer ausgeht." }),
        f("ETF-Rendite p.a.", "etfRendite", { prozent: true, kind: "schaetzung", tip: "Langfristige reale Renditeannahme. Historisch 5–7 % nominal für breite Welt-ETFs — bewusst konservativ wählen." }),
        f("ETF-Startbestand", "etfStart")],
        null, stepStatus(C.etf, Y.allocEtf, Y.allocEtf, "der komplette Rest nach den Schritten 1–5")));
    });
    function wfBar(label, value, color, hint, max) {
      var w = Math.max(0, Math.min(100, Math.abs(value) / max * 100));
      return el("div", { class: "wf-row", title: hint || "" },
        el("div", { class: "wf-label" }, label),
        el("div", { class: "wf-track" }, el("div", { class: "wf-fill", style: "width:" + w.toFixed(1) + "%;background:" + color })),
        el("div", { class: "wf-val num" }, U.eur(value)));
    }
    var maxScale = Math.max(Y.einnahmen, 1);
    var waterfall = UI.collapsibleCard({
      key: "fi.wasserfall", title: "So verteilt sich dein Geld", hint: "monatlich, im gewählten Jahr — genau die Reihenfolge, mit der die Engine rechnet",
      defaultOpen: true, right: yearSel
    }, function (body) {
      body.appendChild(el("div", { class: "eyebrow", style: "margin-bottom:6px" }, "1 · Was reinkommt und fest weggeht"));
      body.appendChild(wfBar("Einnahmen", Y.einnahmen, C.einnahmen, "netto pro Monat", maxScale));
      body.appendChild(wfBar("− Fixkosten", -Y.fixkosten, C.fixkosten, "Miete, Verträge, Abos …", maxScale));
      if (Y.kfw1Pfl + Y.kfw2Pfl > 0) body.appendChild(wfBar("− KfW-Pflichtraten", -(Y.kfw1Pfl + Y.kfw2Pfl), C.kredite, "aus den Tilgungsplänen", maxScale));
      if (Math.abs(Y.eventsMon) >= 0.5) body.appendChild(wfBar("± Lebensereignisse", Y.eventsMon, "#CBD5E1", "Jahresbetrag / 12", maxScale));
      body.appendChild(el("div", { class: "wf-row wf-total" },
        el("div", { class: "wf-label" }, "= Frei verfügbar"),
        el("div", { class: "wf-track" }, el("div", { class: "wf-fill", style: "width:" + Math.min(100, Y.frei / maxScale * 100).toFixed(1) + "%;background:var(--text);opacity:.85" })),
        el("div", { class: "wf-val num pos" }, U.eur(Y.frei))));
      body.appendChild(el("div", { class: "eyebrow", style: "margin:14px 0 6px" }, "2 · … und wie das Freie verteilt wird (feste Priorität)"));
      var steps = [
        ["Lebensqualität", Y.allocLebensqual, C.lebensqual, "reserviert für Freizeit & Urlaub"],
        ["KfW-Sondertilgung", Y.allocSonder, C.sonder, "nur solange Restschuld da ist"],
        ["Auto + Kind", Y.allocAutoKind, C.autokind, "Pauschale + Kind-Sparrate"],
        ["Haus-Eigenkapital", Y.allocHausEk, C.hausek, "bis das Haus-EK-Ziel erreicht ist"],
        ["Notgroschen", Y.allocNotgroschen, C.notgroschen, "bis das Notgroschen-Ziel erreicht ist"],
        ["ETF (Rest, min. " + U.eur(eff.etfMindest, { ganz: true }) + ")", Y.allocEtf, C.etf, "alles, was übrig bleibt"]
      ];
      steps.forEach(function (st, i) {
        var row = wfBar(st[0], st[1], st[2], st[3], Math.max(Y.frei, 1));
        row.firstChild.insertBefore(el("span", { class: "step-num", style: "background:" + st[2] }, String(i + 1)), row.firstChild.firstChild);
        row.firstChild.style.display = "flex"; row.firstChild.style.alignItems = "center";
        body.appendChild(row);
      });
      body.appendChild(el("p", { class: "small muted", style: "margin:12px 0 0" },
        "Jahr " + Y.jahr + " (Alter " + Y.alter + ", " + Y.monate + " Monate): Bestände am Jahresende — Notgroschen ",
        el("span", { class: "num", style: "color:" + C.notgroschen }, U.eur(Y.notgroschen, { ganz: true })),
        " · Haus-EK ", el("span", { class: "num", style: "color:" + C.hausek }, U.eur(Y.hausEk, { ganz: true })),
        " · ETF ", el("span", { class: "num", style: "color:" + C.etf }, U.eur(Y.etf, { ganz: true })),
        " · Restschuld ", el("span", { class: "num", style: "color:" + C.kredite }, U.eur(Y.kfw1 + Y.kfw2, { ganz: true })),
        " → Vermögen ", el("strong", { class: "num" }, U.eur(Y.vermoegen, { ganz: true })), "."));
    });
    host.appendChild(el("div", { class: "grid two" }, annahmen, waterfall));

    /* ================= Verteilung über die Jahre (gestapelt) ================= */
    host.appendChild(UI.collapsibleCard({
      key: "fi.verteilung", title: "Verteilung des freien Budgets über die Jahre",
      hint: "monatliche Zuteilungen, gestapelt — man sieht, wann Ziele voll sind und der ETF übernimmt", defaultOpen: true
    }, function (body) {
      var sub = fi.years.filter(function (y) { return y.jahr <= (fi.fiJahr || fi.years[fi.years.length - 1].jahr) + 3; });
      body.appendChild(Charts.stackedBars({
        labels: sub.map(function (y) { return String(y.jahr); }),
        series: [
          { name: "Lebensqualität", color: C.lebensqual, values: sub.map(function (y) { return y.allocLebensqual; }) },
          { name: "KfW-Sondertilgung", color: C.sonder, values: sub.map(function (y) { return y.allocSonder; }) },
          { name: "Auto + Kind", color: C.autokind, values: sub.map(function (y) { return y.allocAutoKind; }) },
          { name: "Haus-EK", color: C.hausek, values: sub.map(function (y) { return y.allocHausEk; }) },
          { name: "Notgroschen", color: C.notgroschen, values: sub.map(function (y) { return y.allocNotgroschen; }) },
          { name: "ETF", color: C.etf, values: sub.map(function (y) { return y.allocEtf; }) }
        ], height: 230
      }));
      body.appendChild(el("div", { class: "btn-row", style: "margin-top:10px;flex-wrap:wrap" },
        [["Lebensqualität", C.lebensqual], ["Sondertilgung", C.sonder], ["Auto+Kind", C.autokind], ["Haus-EK", C.hausek], ["Notgroschen", C.notgroschen], ["ETF", C.etf]].map(function (x) {
          return el("span", { class: "small muted", style: "display:inline-flex;align-items:center;gap:6px" },
            el("span", { class: "swatch", style: "background:" + x[1] + ";width:10px;height:10px;border-radius:3px;display:inline-block" }), x[0]);
        })));
    }));

    /* ================= Tilgungspläne & Lebensereignisse ================= */
    function planTable(title, planKey, defaultKey) {
      var plan = a[planKey];
      var years = Object.keys(plan).map(Number).sort(function (x, y) { return x - y; });
      var rows = years.map(function (jahr) {
        return el("tr", {},
          td(el("span", { class: "num" }, String(jahr))),
          td(UI.numInput({ value: plan[jahr], onchange: function (v) { plan[jahr] = v; Store.commit(); UI.render(); } }), "r"),
          td(el("button", { class: "btn sm danger", "aria-label": "Jahr " + jahr + " löschen", onclick: function () { delete plan[jahr]; Store.commit(); UI.render(); } }, "✕"), "r"));
      });
      var newYear = el("input", { type: "text", inputmode: "numeric", placeholder: "Jahr", class: "inline-num", style: "max-width:90px" });
      return el("div", { class: "card", style: "padding:13px 15px;border-left:3px solid " + C.kredite },
        el("h3", { style: "margin:0 0 10px;font-size:14px" }, title),
        UI.table(["Jahr", { label: "Pflichtrate / Mon", r: 1 }, { label: "", r: 1 }], rows),
        el("div", { class: "btn-row", style: "margin-top:10px" },
          newYear,
          el("button", {
            class: "btn sm", onclick: function () {
              var j = parseInt(newYear.value, 10);
              if (j >= 2000 && j <= 2100) { plan[j] = 0; Store.commit(); UI.render(); }
              else U.toast("Bitte gültiges Jahr eingeben.", "warn");
            }
          }, "＋ Jahr"),
          el("span", { style: "flex:1" }),
          el("span", { class: "small muted" }, "sonst: "),
          (function () {
            var inp = UI.numInput({ value: a[defaultKey], onchange: function (v) { a[defaultKey] = v; Store.commit(); UI.render(); } });
            inp.style.maxWidth = "90px"; return inp;
          })()),
        el("p", { class: "small muted", style: "margin:8px 0 0" }, "Rate wird automatisch auf die Restschuld gekappt; bei Restschuld 0 → Rate 0."));
    }
    // Auswirkung der Pläne: Tilgungsjahr + wie sie in die Rechnung fließen
    function payoffYear(getter) {
      for (var i = 0; i < fi.years.length; i++) { if (getter(fi.years[i]) >= -0.005) return fi.years[i].jahr; }
      return null;
    }
    var kfw1Ende = payoffYear(function (y) { return y.kfw1; });
    var kfw2Ende = payoffYear(function (y) { return y.kfw2; });
    host.appendChild(UI.collapsibleCard({
      key: "fi.tilgung", title: "Tilgungspläne KfW1 & KfW2",
      hint: "KfW1 getilgt " + (kfw1Ende || "—") + " · KfW2 getilgt " + (kfw2Ende || "—") + " — ändert sich live mit den Raten", defaultOpen: false
    }, function (body) {
      body.appendChild(el("div", { class: "callout", style: "margin-bottom:12px" },
        el("strong", {}, "So wirken die Pläne: "),
        "Die Pflichtrate des jeweiligen Jahres geht ", el("em", {}, "vor"), " der Verteilung vom Einkommen ab (Zeile \u201E− KfW-Pflichtraten\u201C im Wasserfall und Spalte \u201EKfW Pfl\u201C im Jahresplan). Dazu kommt Schritt 2 der Verteilung: die Sondertilgung von bis zu " + U.eur(eff.kfw1Sonder) + "/Mon auf KfW1. Mit den aktuellen Werten ist ",
        el("strong", { style: "color:" + C.kredite }, "KfW1 Ende " + (kfw1Ende || "—")), " und ",
        el("strong", { style: "color:" + C.kredite }, "KfW2 Ende " + (kfw2Ende || "—")), " getilgt — ab dann fließt das frei werdende Geld automatisch in die nächsten Schritte (Haus-EK, Notgroschen, ETF)."));
      body.appendChild(el("div", { class: "grid two" },
        planTable("Tilgungsplan KfW1 (Studienkredit)", "kfw1Plan", "kfw1PlanDefault"),
        planTable("Tilgungsplan KfW2", "kfw2Plan", "kfw2PlanDefault")));
    }));

    var evRows = a.events.slice().sort(function (x, y) { return x.jahr - y.jahr; }).map(function (ev) {
      return el("tr", {},
        td(UI.numInput({ value: ev.jahr, plain: true, onchange: function (v) { ev.jahr = Math.round(v); Store.commit(); UI.render(); } })),
        td(UI.textInput(ev.beschreibung, function (v) { ev.beschreibung = v; Store.commit(); })),
        td(UI.numInput({ value: ev.betrag, onchange: function (v) { ev.betrag = v; Store.commit(); UI.render(); } }), "r"),
        td(el("button", {
          class: "btn sm danger", "aria-label": "Ereignis \u201E" + (ev.beschreibung || "ohne Titel") + "\u201C löschen", onclick: function () {
            a.events = a.events.filter(function (x) { return x !== ev; });
            Store.commit(); UI.render();
          }
        }, "✕"), "r"));
    });
    var evTotal = a.events.reduce(function (s, e) { return s + (Number(e.betrag) || 0); }, 0);
    host.appendChild(UI.collapsibleCard({
      key: "fi.events", title: "Lebensereignisse",
      hint: "Betrag negativ = Kosten · wird im Jahr auf 12 Monate verteilt und mindert das Freie",
      defaultOpen: a.events.some(function (e) { return (Number(e.betrag) || 0) !== 0; })
    }, function (body) {
      body.appendChild(UI.table([{ label: "Jahr" }, "Ereignis", { label: "Betrag", r: 1 }, { label: "", r: 1 }], evRows,
        el("tr", {}, td("Total"), td(""), td(UI.money(evTotal), "r num"), td(""))));
      body.appendChild(el("div", { class: "btn-row", style: "margin-top:10px" },
        el("button", {
          class: "btn sm", onclick: function () {
            a.events.push({ jahr: new Date().getFullYear() + 1, beschreibung: "Neues Ereignis", betrag: 0 });
            Store.commit(); UI.render();
          }
        }, "＋ Ereignis")));
    }));

    /* ================= Jahresplan (gruppierte, farbige Spalten) ================= */
    var exportBtn = el("button", {
      class: "btn sm", onclick: function () {
        var head = ["Jahr", "Alter", "Einnahmen/Mon", "Fixkosten/Mon", "KfW-Pflicht/Mon", "Frei/Mon", "Lebensqual", "Sondertilgung", "Auto+Kind", "HausEK-Zut", "Notgroschen-Zut", "ETF-Zut", "Notgroschen", "HausEK", "KfW-Rest", "ETF", "Vermögen", "FI"];
        var lines = [head.join(";")].concat(fi.years.map(function (y) {
          return [y.jahr, y.alter, y.einnahmen, y.fixkosten, y.kfw1Pfl + y.kfw2Pfl, y.frei, y.allocLebensqual, y.allocSonder, y.allocAutoKind, y.allocHausEk, y.allocNotgroschen, y.allocEtf, y.notgroschen, y.hausEk, y.kfw1 + y.kfw2, y.etf, y.vermoegen, y.fi ? "1" : "0"]
            .map(function (v) { return typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : v; }).join(";");
        }));
        U.download("fi-planung-" + U.todayIso() + ".csv", lines.join("\n"), "text/csv");
      }
    }, "⇓ CSV");
    host.appendChild(UI.collapsibleCard({
      key: "fi.jahresplan", title: "Jahresplan",
      hint: "monatliche Beträge · Bestände zum Jahresende", defaultOpen: true, right: exportBtn
    }, function (body) {
      var kompakt = state.ui.fiTableMode !== "detail";
      body.appendChild(el("div", { class: "btn-row", style: "margin-bottom:10px" },
        el("button", { class: "chip" + (kompakt ? " on" : ""), onclick: function () { state.ui.fiTableMode = "kompakt"; Store.commit(); UI.render(); } }, "Kompakt"),
        el("button", { class: "chip" + (!kompakt ? " on" : ""), onclick: function () { state.ui.fiTableMode = "detail"; Store.commit(); UI.render(); } }, "Alle Spalten"),
        el("span", { class: "small muted" }, kompakt ? "das Wesentliche: was frei ist, was in den ETF geht, was daraus wird" : "volle Rechnung — Spaltenfarben & Trennlinien gliedern Cashflow · Verteilung · Bestände")));
      function num(v, opts) {
        if (Math.abs(v) < 0.005) return el("span", { class: "num small zero" }, "–");
        return el("span", { class: "num small" }, U.eur(v, opts));
      }
      var tbody = el("tbody", {});
      if (kompakt) {
        fi.years.forEach(function (y) {
          var isFiYear = y.jahr === fi.fiJahr;
          tbody.appendChild(el("tr", { style: isFiYear ? "outline:1.5px solid var(--pos);outline-offset:-1px" : "" },
            td(el("span", { class: "num cell-main" }, String(y.jahr))),
            td(el("span", { class: "num small muted" }, String(y.alter)), "r"),
            td(el("span", { class: "num small cell-main" }, U.eur(y.frei)), "r col-sep"),
            td(num(y.allocEtf), "r"),
            td(num(y.kfw1 + y.kfw2, { ganz: true }), "r col-sep"),
            td(num(y.etf, { ganz: true }), "r"),
            td(el("span", { class: "num cell-main " + (y.vermoegen < 0 ? "neg" : "") }, U.eur(y.vermoegen, { ganz: true })), "r"),
            td(y.fi ? el("span", { class: "badge ok" }, "FI") : "", "r")));
        });
        var headK = el("tr", {},
          el("th", {}, "Jahr"), el("th", { class: "r" }, "Alter"),
          el("th", { class: "r col-sep" }, "Frei / Mon"), el("th", { class: "r", style: "color:" + C.etf }, "→ ETF / Mon"),
          el("th", { class: "r col-sep", style: "color:" + C.kredite }, "KfW Rest"), el("th", { class: "r", style: "color:" + C.etf }, "ETF Ende"),
          el("th", { class: "r" }, "Vermögen"), el("th", { class: "r" }, "FI"));
        body.appendChild(el("div", { class: "scroll-y", style: "max-height:520px" },
          el("div", { class: "tbl-wrap" }, el("table", { class: "tbl" }, el("thead", {}, headK), tbody))));
      } else {
        function cs(color) { return "border-bottom:2px solid " + color + ";color:" + color; }
        var groupHead = el("tr", { class: "tbl-grouprow" },
          el("th", { colspan: "2" }, ""),
          el("th", { colspan: "4", class: "r col-sep", style: cs(C.einnahmen) }, "CASHFLOW / MON"),
          el("th", { colspan: "4", class: "r col-sep", style: cs(C.etf) }, "VERTEILUNG / MON"),
          el("th", { colspan: "5", class: "r col-sep", style: cs(C.hausek) }, "BESTÄNDE ENDE JAHR"),
          el("th", {}, ""));
        var head = el("tr", {},
          el("th", {}, "Jahr"), el("th", { class: "r" }, "Alter"),
          el("th", { class: "r col-sep" }, "Einn."), el("th", { class: "r" }, "Fix"), el("th", { class: "r" }, "KfW Pfl"), el("th", { class: "r" }, "Frei"),
          el("th", { class: "r col-sep", style: "color:" + C.sonder }, "Sonder"), el("th", { class: "r", style: "color:" + C.hausek }, "Haus-EK"),
          el("th", { class: "r", style: "color:" + C.notgroschen }, "Notgr"), el("th", { class: "r", style: "color:" + C.etf }, "ETF"),
          el("th", { class: "r col-sep", style: "color:" + C.notgroschen }, "Notgr"), el("th", { class: "r", style: "color:" + C.hausek }, "Haus-EK"),
          el("th", { class: "r", style: "color:" + C.kredite }, "KfW Rest"), el("th", { class: "r", style: "color:" + C.etf }, "ETF"),
          el("th", { class: "r" }, "Vermögen"), el("th", { class: "r" }, "FI"));
        fi.years.forEach(function (y) {
          var isFiYear = y.jahr === fi.fiJahr;
          tbody.appendChild(el("tr", { style: isFiYear ? "outline:1.5px solid var(--pos);outline-offset:-1px" : "" },
            td(el("span", { class: "num cell-main" }, String(y.jahr))),
            td(el("span", { class: "num small muted" }, String(y.alter)), "r"),
            td(num(y.einnahmen), "r col-sep"), td(num(y.fixkosten), "r"), td(num(y.kfw1Pfl + y.kfw2Pfl), "r"),
            td(el("span", { class: "num small cell-main" }, U.eur(y.frei)), "r"),
            td(num(y.allocSonder), "r col-sep"), td(num(y.allocHausEk), "r"),
            td(num(y.allocNotgroschen), "r"), td(num(y.allocEtf), "r"),
            td(num(y.notgroschen, { ganz: true }), "r col-sep"), td(num(y.hausEk, { ganz: true }), "r"),
            td(el("span", { class: "num small " + ((y.kfw1 + y.kfw2) < -0.005 ? "neg" : "zero") }, (y.kfw1 + y.kfw2) < -0.005 ? U.eur(y.kfw1 + y.kfw2, { ganz: true }) : "–"), "r"),
            td(num(y.etf, { ganz: true }), "r"),
            td(el("span", { class: "num cell-main " + (y.vermoegen < 0 ? "neg" : "") }, U.eur(y.vermoegen, { ganz: true })), "r"),
            td(y.fi ? el("span", { class: "badge ok" }, "FI") : "", "r")));
        });
        body.appendChild(el("div", { class: "scroll-y", style: "max-height:520px" },
          el("div", { class: "tbl-wrap" }, el("table", { class: "tbl" }, el("thead", {}, groupHead, head), tbody))));
        body.appendChild(el("p", { class: "small muted", style: "margin:10px 0 0" },
          "Zuteilungen für Lebensqualität (" + U.eur(eff.lebensqualitaet) + ") und Auto+Kind (" + U.eur(eff.autoPauschale + eff.kindSparrate) + ") sind konstant und deshalb nicht als Spalte aufgeführt — sie stecken in \u201EFrei\u201C und im Wasserfall oben."));
      }
    }));
  });
})();
