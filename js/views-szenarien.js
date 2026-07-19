/* views-szenarien.js — Hauskauf, Hochzeit, Kinder */
"use strict";
(function () {
  var el = U.el, td = UI.td;

  /* =================== HAUSKAUF =================== */
  // Farb-Verknüpfung Eingabe-Gruppe ↔ Ergebnis-Zeilen
  // Farben aus dem zentralen CSS-System, statt fest im JS (siehe views-fi.js für denselben Ansatz)
  var HK = { kauf: U.cssVar("--warn"), extras: U.cssVar("--hk-extras"), fin: U.cssVar("--accent"), ek: U.cssVar("--pos"), miete: U.cssVar("--hk-miete") };

  UI.registerView("hauskauf", function (host, state) {
    var h = state.hauskauf;
    var r = Logic.runHauskauf(h);
    host.appendChild(UI.pageHead("Hauskauf-Szenario", "Bestandshaus NRW · Ziel-Eigenkapital fließt live in die FI-Planung · Farben verbinden Eingaben und Ergebnisse", [UI.printButton()]));

    host.appendChild(el("section", { class: "card" },
      el("div", { class: "figure-row" },
        el("div", {}, el("div", { class: "eyebrow", style: "color:" + HK.ek }, "EK-Sparrate / Mon"),
          el("div", { class: "big-figure", style: "color:" + HK.ek }, U.eur(h.ekSparrate))),
        el("div", {}, el("div", { class: "eyebrow", style: "color:" + HK.miete }, "Gesamtbelastung / Mon"),
          el("div", { class: "big-figure neg" }, U.eur(r.belastung))),
        el("div", {}, el("div", { class: "eyebrow", style: "color:" + HK.kauf }, "Ziel-Eigenkapital"),
          el("div", { class: "big-figure", style: "color:" + HK.kauf }, U.eur(r.zielEk, { ganz: true }))),
        el("div", {}, el("div", { class: "eyebrow" }, "Frühestes Kaufjahr"),
          el("div", { class: "big-figure pos" }, r.kaufjahr != null ? String(r.kaufjahr) : "—")))));

    function f(label, key, cfg) {
      cfg = cfg || {};
      return UI.field(label, UI.numInput({
        value: h[key], prozent: cfg.prozent, plain: cfg.plain,
        onchange: function (v) { h[key] = v; Store.commit(); UI.render(); }
      }), cfg.after, { kind: cfg.kind, tip: cfg.tip, kindHint: cfg.kindHint });
    }
    function grp(title, color, fields, note) {
      return el("div", { class: "fi-group", style: "border-left-color:" + color },
        el("div", { class: "fi-group-head" },
          el("span", { class: "fi-group-title", style: "color:" + color }, title),
          note ? el("span", { class: "small muted" }, note) : null),
        el("div", { class: "fields" }, fields));
    }

    var eingaben = UI.collapsibleCard({
      key: "hk.eingaben", title: "Eingaben",
      hint: "blau = deine Entscheidung · 🔒 amber = gesetzlich/gegeben · 💡 gestrichelt = Schätzwert", defaultOpen: true
    }, function (body) {
      body.appendChild(grp("Kauf & Kaufnebenkosten", HK.kauf, [
        f("Kaufpreis Bestandshaus", "kaufpreis", { kind: "verhandelbar", kindHint: "verhandelbar", tip: "Der Angebotspreis ist Verhandlungssache — 5–10 % unter Angebot sind bei Bestand oft drin." }),
        f("Grunderwerbsteuer %", "grunderwerbSatz", { prozent: true, kind: "fix", kindHint: "gesetzlich", tip: "Landessteuer beim Immobilienkauf. NRW: 6,5 % des Kaufpreises — nicht verhandelbar." }),
        f("Notar + Grundbuch %", "notarSatz", { prozent: true, kind: "fix", kindHint: "gesetzlich (GNotKG)", tip: "Gebühren nach Gerichts- und Notarkostengesetz, ca. 1,5–2 % des Kaufpreises. Ohne Notar kein Eigentum." }),
        f("Makler %", "maklerSatz", { prozent: true, kind: "verhandelbar", kindHint: "geteilt & gedeckelt", tip: "Seit 2020 wird die Provision geteilt; Käuferanteil in NRW üblich 3,57 % inkl. MwSt. Bei provisionsfreien Objekten: 0." })
      ], "bestimmt die Gesamt-Anschaffung"));
      body.appendChild(grp("Renovierung & Extras", HK.extras, [
        f("Renovierung sofort", "renovierung", { kind: "schaetzung", tip: "Bad, Böden, Malerarbeiten direkt nach Einzug." }),
        f("Energetische Sanierung", "sanierung", { kind: "schaetzung", tip: "Heizung, Dämmung, Fenster — oft KfW-/BAFA-förderbar." }),
        f("Umzug, Möbel, Garten", "umzug", { kind: "schaetzung" })
      ], "kommt auf die Anschaffung obendrauf"));
      body.appendChild(grp("Finanzierung", HK.fin, [
        f("EK-Quote (Ziel)", "ekQuote", { prozent: true, kind: "verhandelbar", kindHint: "Bank-Faustregel", tip: "Banken wollen meist 20 % Eigenkapital (mind. die Kaufnebenkosten). Weniger EK → schlechterer Zins." }),
        f("Zinssatz p.a.", "zins", { prozent: true, kind: "schaetzung", tip: "Sollzins der Bank für z. B. 10–15 Jahre Zinsbindung. Hängt von Marktlage, Beleihung und Bonität ab — Angebote vergleichen!" }),
        f("Tilgung Start p.a.", "tilgung", { prozent: true, kind: "verhandelbar", tip: "Anfängliche Tilgung: wie viel % der Kreditsumme du im 1. Jahr zurückzahlst. Höher = schneller schuldenfrei, aber höhere Rate. Zins + Tilgung = Annuität." })
      ], "ergibt Kreditsumme, Rate & Laufzeit"));
      body.appendChild(grp("Eigenkapital-Aufbau", HK.ek, [
        f("EK heute", "ekHeute", { tip: "Was ihr heute schon für den Hauskauf zur Seite habt." }),
        f("EK-Sparrate (zu zweit) / Mon", "ekSparrate", { tip: "Eure gemeinsame monatliche Sparrate fürs Haus — der größte Hebel fürs Kaufjahr." }),
        f("Aktuelles Jahr", "aktuellesJahr", { plain: true })
      ], "bestimmt das früheste Kaufjahr"));
      body.appendChild(grp("Vergleich zur Miete", HK.miete, [
        f("Aktuelle Miete + NK (zu zweit)", "mieteAktuell", { tip: "Eure heutige Warmmiete — Vergleichsbasis für die Mehrbelastung." })
      ]));
    });

    function resRow(label, value, tint, hint, strong) {
      var tr = el("tr", { class: "res-tint", style: "--tint:" + (tint || "transparent") },
        td(el("span", { class: strong ? "cell-main" : "" }, label)),
        td(el("span", { class: "num " + (strong ? "cell-main" : "") }, value), "r"),
        td(el("span", { class: "small muted" }, hint || "")));
      return tr;
    }
    var ergebnisse = el("section", { class: "card" },
      el("h2", { class: "card-title" }, "Ergebnisse ", el("span", { class: "hint" }, "Farbstreifen = zugehörige Eingabe-Gruppe")),
      UI.table(["", { label: "", r: 1 }, ""], [
        resRow("Kaufpreis", U.eur(h.kaufpreis), HK.kauf),
        resRow("Grunderwerbsteuer (" + U.pct(h.grunderwerbSatz) + ")", U.eur(r.grunderwerb), HK.kauf),
        resRow("Notar + Grundbuch (" + U.pct(h.notarSatz) + ")", U.eur(r.notar), HK.kauf),
        resRow("Makler (" + U.pct(h.maklerSatz, 2) + ")", U.eur(r.makler), HK.kauf),
        resRow("Renovierung + Sanierung + Umzug", U.eur(h.renovierung + h.sanierung + h.umzug), HK.extras),
        resRow("Gesamt-Anschaffung", U.eur(r.gesamt), HK.kauf, "", true),
        resRow("Ziel-Eigenkapital (" + U.pct(h.ekQuote, 0) + ")", U.eur(r.zielEk), HK.fin, "→ live in FI-Planung", true),
        resRow("Finanzierungsbetrag", U.eur(r.finanzierung), HK.fin, "Anschaffung − Eigenkapital"),
        resRow("Annuität p.a.", U.eur(r.annuitaet), HK.fin, "Kredit × (Zins + Tilgung)"),
        resRow("Monatsrate", U.eur(r.monatsrate), HK.fin, "Annuität / 12"),
        resRow("Geschätzte Laufzeit", U.num(Math.round(r.laufzeit * 10) / 10) + " Jahre", HK.fin, "Standard-Annuitätenformel"),
        resRow("Nebenkosten / Mon", U.eur(r.nkSum), HK.miete, "Tabelle unten"),
        resRow("Gesamtbelastung / Mon", U.eur(r.belastung), HK.miete, "p. P.: " + U.eur(r.belastungPP), true),
        resRow("Mehrbelastung ggü. Miete / Mon", U.eur(r.mehrMtl), HK.miete, "Belastung − heutige Miete"),
        resRow("Mehrbelastung p.a.", U.eur(r.mehrJaehrlich), HK.miete)
      ]));
    host.appendChild(el("div", { class: "grid two" }, eingaben, ergebnisse));

    /* ---- EK-Check + Was-wäre-wenn-Diagramme ---- */
    var ek = el("section", { class: "card" },
      el("h2", { class: "card-title" }, "EK-Check ", el("span", { class: "hint" }, U.pct(h.ekQuote, 0) + "-Regel")),
      r.luecke > 0
        ? el("div", {},
          el("div", { class: "callout warn", style: "margin-bottom:10px" }, "⚠️ Lücke: ", el("strong", { class: "num" }, U.eur(r.luecke, { ganz: true }))),
          Charts.progress(h.ekHeute, r.zielEk, HK.ek),
          el("p", { class: "small muted", style: "margin:10px 0 0" },
            "Bei ", el("span", { class: "num" }, U.eur(h.ekSparrate)), " / Monat: noch ",
            el("span", { class: "num" }, U.num(Math.round(r.jahreBisEk * 10) / 10)), " Jahre → frühestes Kaufjahr ",
            el("strong", { class: "num pos" }, String(r.kaufjahr)), "."))
        : el("div", { class: "callout" }, "✓ Ziel-Eigenkapital erreicht."));

    // Was-wäre-wenn: interaktiver Explorer — Faktoren zuschaltbar, Bereich dynamisch um deine Werte
    state.ui.hkFactors = state.ui.hkFactors || { ekSparrate: true, kaufpreis: true, ekQuote: false, ekHeute: false, extras: false, zins: false };
    state.ui.hkMetric = state.ui.hkMetric || "kaufjahr";
    var HF = state.ui.hkFactors;
    var metric = state.ui.hkMetric;
    var PCT = [-40, -30, -20, -10, 0, 10, 20, 30, 40];
    var extrasNow = h.renovierung + h.sanierung + h.umzug;
    var FACTORS = [
      { key: "ekSparrate", name: "EK-Sparrate", color: HK.ek, now: h.ekSparrate, fmt: function (v) { return U.eur(v) + "/Mon"; },
        apply: function (hh, v) { hh.ekSparrate = Math.max(50, v); } },
      { key: "kaufpreis", name: "Kaufpreis", color: HK.kauf, now: h.kaufpreis, fmt: function (v) { return U.eur(v, { ganz: true }); },
        apply: function (hh, v) { hh.kaufpreis = Math.max(50000, v); } },
      { key: "ekQuote", name: "EK-Quote", color: HK.fin, now: h.ekQuote, fmt: function (v) { return U.pct(v, 0); },
        apply: function (hh, v) { hh.ekQuote = Math.max(0.05, v); } },
      { key: "ekHeute", name: "EK heute", color: "#5EEAD4", now: Math.max(h.ekHeute, 1000), fmt: function (v) { return U.eur(v, { ganz: true }); },
        apply: function (hh, v) { hh.ekHeute = Math.max(0, v); }, note: h.ekHeute <= 0 ? "Basis 1.000 € angenommen, da EK heute = 0" : null },
      { key: "extras", name: "Renovierung & Extras", color: HK.extras, now: extrasNow, fmt: function (v) { return U.eur(v, { ganz: true }); },
        apply: function (hh, v) { var f = extrasNow > 0 ? v / extrasNow : 0; hh.renovierung = h.renovierung * f; hh.sanierung = h.sanierung * f; hh.umzug = h.umzug * f; } },
      { key: "zins", name: "Zinssatz", color: "#FB7185", now: h.zins, fmt: function (v) { return U.pct(v); },
        apply: function (hh, v) { hh.zins = Math.max(0.001, v); } }
    ];
    function metricOf(res) {
      if (metric === "rate") return res.monatsrate;
      if (metric === "belastung") return res.belastung;
      return res.kaufjahr == null ? NaN : res.kaufjahr;
    }
    var whatIf = UI.collapsibleCard({
      key: "hk.whatif", title: "Was-wäre-wenn",
      hint: "x-Achse = Änderung des Faktors ggü. heute · Punkt = heute · Hover zeigt konkrete Werte", defaultOpen: true
    }, function (body) {
      // Ziel-Metrik wählen
      function mChip(key, label) {
        return el("button", {
          class: "chip" + (metric === key ? " on" : ""),
          onclick: function () { state.ui.hkMetric = key; Store.commit(); UI.render(); }
        }, label);
      }
      body.appendChild(el("div", { class: "btn-row", style: "margin-bottom:6px" },
        el("span", { class: "eyebrow" }, "Zeige"), mChip("kaufjahr", "Frühestes Kaufjahr"), mChip("rate", "Monatsrate"), mChip("belastung", "Gesamtbelastung")));
      // Faktoren zuschalten
      body.appendChild(el("div", { class: "btn-row", style: "margin-bottom:10px" },
        el("span", { class: "eyebrow" }, "Faktoren"),
        FACTORS.map(function (fa) {
          return el("button", {
            class: "chip" + (HF[fa.key] ? " on" : ""), style: HF[fa.key] ? "border-color:" + fa.color + ";color:" + fa.color : "",
            onclick: function () { HF[fa.key] = !HF[fa.key]; Store.commit(); UI.render(); }
          }, el("span", { class: "chip-dot", style: "background:" + fa.color }), fa.name);
        })));
      var active = FACTORS.filter(function (fa) { return HF[fa.key]; });
      if (!active.length) { body.appendChild(el("p", { class: "muted small" }, "Mindestens einen Faktor einschalten.")); return; }
      var labels = PCT.map(function (pc) { return pc === 0 ? "heute" : (pc > 0 ? "+" : "−") + Math.abs(pc) + " %"; });
      var series = active.map(function (fa) {
        var vals = PCT.map(function (pc) {
          var hh = JSON.parse(JSON.stringify(h));
          fa.apply(hh, fa.now * (1 + pc / 100));
          return metricOf(Logic.runHauskauf(hh));
        });
        return {
          name: fa.name, color: fa.color, values: vals,
          hover: function (i, v) {
            var val = fa.now * (1 + PCT[i] / 100);
            var mLabel = metric === "kaufjahr" ? "Kaufjahr " + Math.round(v) : (metric === "rate" ? "Monatsrate " + U.eur(v) : "Belastung " + U.eur(v));
            return fa.name + " " + fa.fmt(val) + " → " + mLabel;
          }
        };
      });
      body.appendChild(Charts.multiLine({
        labels: labels, series: series, height: 230, fillFirst: false,
        yFmt: metric === "kaufjahr" ? function (v) { return String(Math.round(v)); } : undefined,
        markers: [{ seriesIdx: 0, index: 4, label: "heute", color: active[0].color }]
      }));
      // Live-Legende mit konkreten Werten + Hebelwirkung (±10 %)
      body.appendChild(el("div", { class: "legend", style: "margin-top:10px" }, active.map(function (fa, i) {
        var v0 = series[i].values[4], vP = series[i].values[5];
        var delta = (isNaN(v0) || isNaN(vP)) ? null : vP - v0;
        var deltaTxt = delta == null ? "" :
          metric === "kaufjahr"
            ? (Math.abs(delta) < 0.5 ? "±10 % ändert das Kaufjahr kaum" : "+10 % → " + (delta > 0 ? "+" : "") + Math.round(delta) + " Jahr" + (Math.abs(Math.round(delta)) === 1 ? "" : "e"))
            : "+10 % → " + (delta > 0 ? "+" : "−") + U.eur(Math.abs(delta));
        return el("div", { class: "row" },
          el("span", { class: "swatch", style: "background:" + fa.color }),
          el("span", { class: "name" }, fa.name + " heute: " + fa.fmt(fa.now) + (fa.note ? " (" + fa.note + ")" : "")),
          el("span", { class: "num small muted" }, deltaTxt));
      })));
    });
    host.appendChild(el("div", { class: "grid two" }, ek, whatIf));

    /* ---- Nebenkosten ---- */
    host.appendChild(UI.collapsibleCard({ key: "hk.nebenkosten", title: "Laufende Nebenkosten / Mon", hint: "Summe: " + U.eur(r.nkSum), defaultOpen: false }, function (body) {
      var nkRows = h.nebenkosten.map(function (nk) {
        return el("tr", {},
          td(UI.textInput(nk.name, function (v) { nk.name = v; Store.commit(); })),
          td(UI.numInput({ value: nk.betrag, onchange: function (v) { nk.betrag = v; Store.commit(); UI.render(); } }), "r"),
          td(el("span", { class: "small muted", title: nk.hint || "" }, nk.hint || "")),
          td(el("button", {
            class: "btn sm danger", "aria-label": "Nebenkosten-Position \u201E" + (nk.name || "ohne Namen") + "\u201C löschen", onclick: function () {
              h.nebenkosten = h.nebenkosten.filter(function (x) { return x !== nk; });
              Store.commit(); UI.render();
            }
          }, "✕"), "r"));
      });
      body.appendChild(UI.table(["Position", { label: "€ / Mon", r: 1 }, "Hinweis", { label: "", r: 1 }], nkRows,
        el("tr", {}, td("Summe"), td(UI.money(-r.nkSum), "r num"), td(""), td(""))));
      body.appendChild(el("div", { class: "btn-row", style: "margin-top:10px" },
        el("button", {
          class: "btn sm", onclick: function () {
            h.nebenkosten.push({ name: "Neue Position", betrag: 0, hint: "💡" });
            Store.commit(); UI.render();
          }
        }, "＋ Position")));
    }));
  });

  /* =================== HOCHZEIT =================== */
  UI.registerView("hochzeit", function (host, state) {
    var w = state.hochzeit;
    var r = Logic.runHochzeit(w);
    host.appendChild(UI.pageHead("Hochzeit-Planer", "Kosten, Flitterwochen und Budget", [UI.printButton()]));

    // Kopfzeile
    var datum = el("input", { type: "date", value: w.datum || "" });
    datum.addEventListener("change", function () { w.datum = datum.value; Store.commit(); });
    host.appendChild(el("section", { class: "card" },
      el("div", { class: "fields" },
        UI.field("Datum", datum),
        UI.field("Personen", UI.numInput({ value: w.personen, plain: true, onchange: function (v) { w.personen = Math.round(v); Store.commit(); UI.render(); } })),
        UI.field("Caterer", UI.textInput(w.caterer, function (v) { w.caterer = v; Store.commit(); })))));

    // Budget-Übersicht
    var restCls = r.rest < 0 ? "neg" : "pos";
    host.appendChild(el("section", { class: "card" },
      el("h2", { class: "card-title" }, "Budget-Übersicht"),
      el("div", { class: "grid kpi" },
        el("div", { class: "kpi-card" }, el("div", { class: "eyebrow" }, "Gespart (Budget)"),
          UI.numInput({ value: w.budget, onchange: function (v) { w.budget = v; Store.commit(); UI.render(); } })),
        UI.kpi("− Kosten Hochzeit (mein Anteil)", UI.money(-r.anteil), "Brutto / 2 bei 50/50-Teilung"),
        UI.kpi("− Urlaub noch zu zahlen", UI.money(-r.urlaubOffen), "berechnet: alle nicht abgehakten Urlaubs-Positionen"),
        UI.kpi("= Was bleibt übrig?", el("span", { class: restCls }, U.eur(r.rest)), r.rest < 0 ? "Budget überschritten" : "im Budget", restCls)),
      r.rest < 0 ? el("div", { class: "callout warn", style: "margin-top:12px" }, "⚠️ Das gesparte Budget reicht aktuell nicht — Differenz: ", el("strong", { class: "num" }, U.eur(r.rest))) : null));

    // Kosten-Tabelle
    function statusSel(it) {
      var opts = ["Angebot vorhanden", "Zu bestellen", "Bestellt", "Bezahlt"];
      var sel = el("select", {}, opts.map(function (o) { return el("option", { value: o, selected: it.status === o }, o); }));
      if (opts.indexOf(it.status) === -1) sel.appendChild(el("option", { value: it.status, selected: true }, it.status));
      sel.addEventListener("change", function () { it.status = sel.value; Store.commit(); });
      return sel;
    }
    var rows = w.items.map(function (it) {
      var brutto = Logic.hochzeitBrutto(it);
      return el("tr", {},
        td([el("div", { class: "cell-main" }, it.icon + " " + it.bereich),
        el("div", { class: "cell-sub" }, "")]),
        td(UI.textInput(it.beschreibung, function (v) { it.beschreibung = v; Store.commit(); }, { style: "min-width:160px" })),
        td(statusSel(it)),
        td(UI.numInput({ value: it.netto, allowEmpty: true, onchange: function (v) { it.netto = v; Store.commit(); UI.render(); } }), "r"),
        td(el("div", { style: "display:flex;flex-direction:column;gap:2px;align-items:flex-end" },
          UI.numInput({ value: it.brutto, allowEmpty: true, onchange: function (v) { it.brutto = v; Store.commit(); UI.render(); } }),
          it.brutto == null || it.brutto === "" ? el("span", { class: "small muted num" }, "auto: " + U.eur(brutto)) : null), "r"),
        td(UI.textInput(it.notiz, function (v) { it.notiz = v; Store.commit(); }, { style: "min-width:120px" })),
        td(el("button", {
          class: "btn sm danger", "aria-label": "Kosten-Position \u201E" + (it.bereich || "ohne Bereich") + "\u201C löschen", onclick: function () {
            w.items = w.items.filter(function (x) { return x !== it; });
            Store.commit(); UI.render();
          }
        }, "✕"), "r"));
    });
    host.appendChild(UI.collapsibleCard({ key: "hz.kosten", title: "Kosten", hint: "Brutto leer lassen → automatisch Netto × 1,19 (19 % MwSt.)", defaultOpen: true }, function (body) {
      body.appendChild(el("div", { class: "scroll-y", style: "max-height:560px" },
        UI.table(["Bereich", "Beschreibung", "Status", { label: "Netto €", r: 1 }, { label: "Brutto €", r: 1 }, "Notiz", { label: "", r: 1 }], rows,
          el("tr", {}, td("GESAMT"), td(""), td(""),
            td(UI.money(r.netto, { neutral: true }), "r num"),
            td(UI.money(r.brutto, { neutral: true }), "r num"),
            td(el("span", { class: "num" }, "Anteil (÷2): " + U.eur(r.anteil))), td("")))));
      body.appendChild(el("div", { class: "btn-row", style: "margin-top:10px" },
        el("button", {
          class: "btn primary sm", onclick: function () {
            w.items.push({ id: U.uid("w"), icon: "📌", bereich: "Neue Position", beschreibung: "", status: "Zu bestellen", netto: null, brutto: 0, notiz: "" });
            Store.commit(); UI.render();
          }
        }, "＋ Position")));
    }));

    // Flitterwochen
    var uRows = w.urlaub.map(function (u) {
      var chk = el("input", { type: "checkbox", checked: !!u.bezahlt, title: "abhaken = bezahlt → zählt nicht mehr zu \u201ENoch zu zahlen\u201C" });
      chk.addEventListener("change", function () { u.bezahlt = chk.checked; Store.commit(); UI.render(); });
      return el("tr", { style: u.bezahlt ? "opacity:.62" : "" },
        td(el("div", { style: "display:flex;align-items:center;gap:9px" }, chk,
          u.bezahlt ? el("span", { class: "badge ok" }, "bezahlt") : el("span", { class: "badge offen" }, "offen"))),
        td(UI.textInput(u.name, function (v) { u.name = v; Store.commit(); })),
        td(UI.numInput({ value: u.betrag, onchange: function (v) { u.betrag = v; Store.commit(); UI.render(); } }), "r"),
        td(el("button", {
          class: "btn sm danger", "aria-label": "Urlaubsposition \u201E" + (u.name || "ohne Namen") + "\u201C löschen", onclick: function () {
            w.urlaub = w.urlaub.filter(function (x) { return x !== u; });
            Store.commit(); UI.render();
          }
        }, "✕"), "r"));
    });
    host.appendChild(UI.collapsibleCard({ key: "hz.urlaub", title: "✈️ Flitterwochen / Urlaub", hint: "Total: " + U.eur(r.urlaubTotal) + " · noch zu zahlen: " + U.eur(r.urlaubOffen), defaultOpen: true }, function (body) {
      body.appendChild(el("div", { style: "margin-bottom:10px;max-width:240px" },
        UI.field("Reiseziel", UI.textInput(w.urlaubZiel, function (v) { w.urlaubZiel = v; Store.commit(); }))));
      body.appendChild(UI.table(["Status", "Position", { label: "Kosten €", r: 1 }, { label: "", r: 1 }], uRows,
        [el("tr", {}, td("TOTAL"), td(""), td(UI.money(-r.urlaubTotal), "r num"), td("")),
        el("tr", {}, td(el("strong", {}, "Noch zu zahlen")), td(el("span", { class: "small muted" }, "fließt oben ins Budget")), td(el("span", { class: "num warncol", style: "font-weight:700" }, U.eur(r.urlaubOffen)), "r"), td(""))]));
      body.appendChild(el("div", { class: "btn-row", style: "margin-top:10px" },
        el("button", {
          class: "btn sm", onclick: function () {
            w.urlaub.push({ id: U.uid("u"), icon: "•", name: "Neue Position", betrag: 0, bezahlt: false });
            Store.commit(); UI.render();
          }
        }, "＋ Position")));
    }));
  });

  /* =================== KINDER =================== */
  UI.registerView("kinder", function (host, state) {
    var k = state.kinder;
    var r = Logic.runKinder(k);
    host.appendChild(UI.pageHead("Kinder-Szenario", "Kosten pro Kind und Familien-Belastung (NRW)", [UI.printButton()]));

    host.appendChild(el("section", { class: "card" },
      el("div", { class: "figure-row" },
        el("div", {}, el("div", { class: "eyebrow" }, "Gesamt pro Kind (25 J.)"),
          el("div", { class: "big-figure" }, U.eur(r.proKind, { ganz: true }))),
        el("div", {}, el("div", { class: "eyebrow" }, "Alle " + k.anzahl + " Kinder"),
          el("div", { class: "big-figure" }, U.eur(r.alleKinder, { ganz: true }))),
        el("div", {}, el("div", { class: "eyebrow" }, "Dein Anteil (50 %)"),
          el("div", { class: "big-figure warncol" }, U.eur(r.deinAnteil, { ganz: true }))))));

    function f(label, key, cfg) {
      cfg = cfg || {};
      return UI.field(label, UI.numInput({
        value: k[key], prozent: cfg.prozent, plain: cfg.plain,
        onchange: function (v) { k[key] = v; Store.commit(); UI.render(); }
      }), cfg.after);
    }
    var eingaben = UI.collapsibleCard({ key: "ki.eingaben", title: "Eingaben", hint: "alle Beträge mtl. pro Kind", defaultOpen: true }, function (body) {
      body.appendChild(el("div", { class: "fields" },
        f("0–3 Jahre", "kosten0_3", { after: "💡 realistisch 300–500 €" }),
        f("3–6 Jahre", "kosten3_6", { after: "💡 Kita, Essen, Kleidung" }),
        f("6–10 Jahre", "kosten6_10", { after: "💡 OGS, Schulbedarf, Sport" }),
        f("10–18 Jahre", "kosten10_18", { after: "💡 teuerste Phase" }),
        f("18–25 Jahre", "kosten18_25", { after: "💡 Unterhaltspflicht" }),
        f("Kindergeld / Mon", "kindergeld", { after: "🔒 Staat" }),
        f("Elterngeld Ø / Mon", "elterngeld", { after: "🔒 nur ~14 Monate" }),
        f("Anzahl Kinder", "anzahl", { plain: true }),
        f("Altersabstand (Jahre)", "abstand", { plain: true }),
        f("Geschwister-Rabatt", "rabatt", { prozent: true, after: "⚙️ üblich 80–90 %" }),
        f("Sparrate pro Kind / Mon", "sparrate", { after: "💡 Studium/Führerschein" })));
    });

    function row(label, value, hint, cls) {
      return el("tr", {}, td(label), td(el("span", { class: "num " + (cls || "") }, value), "r"), td(el("span", { class: "small muted" }, hint || "")));
    }
    var ergebnisse = el("section", { class: "card" },
      el("h2", { class: "card-title" }, "Ergebnisse"),
      el("h3", { class: "eyebrow", style: "margin:4px 0 6px" }, "Netto-Belastung pro Kind & Phase (mtl.)"),
      UI.table(["", { label: "", r: 1 }, ""], [
        row("0–3 Jahre", U.eur(r.netto.p0), "Kosten − Kindergeld"),
        row("3–6 Jahre", U.eur(r.netto.p3)),
        row("6–10 Jahre", U.eur(r.netto.p6)),
        row("10–18 Jahre", U.eur(r.netto.p10)),
        row("18–25 Jahre", U.eur(r.netto.p18)),
        row("Schnitt 0–25 (gewichtet)", U.eur(r.schnitt), "pro Monat über 25 Jahre", "cell-main")
      ]),
      el("h3", { class: "eyebrow", style: "margin:16px 0 6px" }, "Gesamtkosten pro Kind (über 25 J.)"),
      UI.table(["", { label: "", r: 1 }, ""], [
        row("Direkte Kosten netto", U.eur(r.direkt)),
        row("Elterngeld-Bonus (~14 Mon.)", U.eur(r.elternBonus), "Einmal-Bonus", "pos"),
        row("Rücklage / Sparplan (25 J.)", U.eur(r.ruecklage)),
        row("Gesamt pro Kind", U.eur(r.proKind), "", "cell-main")
      ]),
      el("h3", { class: "eyebrow", style: "margin:16px 0 6px" }, "Familien-Belastung mtl. (Peaks)"),
      UI.table(["", { label: "", r: 1 }, ""], [
        row("Phase: beide klein (0–6)", U.eur(r.peaks.beideKlein), "inkl. Sparraten"),
        row("Phase: Schule (6–18)", U.eur(r.peaks.schule), "gewichtet"),
        row("Phase: Teenager-Peak (10–18)", U.eur(r.peaks.teenager), "teuerste Phase", "warncol"),
        row("Phase: Studium (18–25)", U.eur(r.peaks.studium), "kein Geschwister-Rabatt"),
        row("Schnitt über alle Phasen", U.eur(r.peaks.schnittAlle), "", "cell-main")
      ]),
      el("p", { class: "small muted", style: "margin:12px 0 0" }, "Geschwister-Logik: 1. Kind voll, weitere Kinder × Rabattfaktor auf die Kosten (nicht auf Kindergeld/Rücklage). Quellen: Statistisches Bundesamt, Düsseldorfer Tabelle, KiBiz NRW."));
    host.appendChild(el("div", { class: "grid two" }, eingaben, ergebnisse));
  });
})();
