/* views-budget.js — Budget-Panel (Herzstück der Handy-Version, ganz oben im Dashboard)
   Gemeinsame Codebasis: wird nur gerendert, wenn window.APP_MODE === "mobile". */
"use strict";
(function () {
  var el = U.el;

  window.BudgetPanel = function (state) {
    var mk = state.ui.budgetMonth || U.currentMonth();
    if (!/^\d{4}-\d{2}$/.test(mk)) mk = U.currentMonth();
    var md = Store.monthData(mk);
    var c = Logic.monthCockpit(state, mk);
    var wrap = el("div", {});

    /* ---- Monat wählen ---- */
    function goM(m) { state.ui.budgetMonth = m; Store.commit(); UI.render(); }
    wrap.appendChild(el("div", { class: "month-nav", style: "margin-bottom:12px;justify-content:center" },
      el("button", { class: "btn icon", "aria-label": "Vormonat", onclick: function () { goM(Logic.prevMonth(mk)); } }, "‹"),
      el("div", { class: "month-label" }, U.monthLabel(mk)),
      el("button", { class: "btn icon", "aria-label": "Folgemonat", onclick: function () { goM(Logic.nextMonth(mk)); } }, "›"),
      mk !== U.currentMonth() ? el("button", { class: "btn sm ghost", onclick: function () { goM(U.currentMonth()); } }, "Heute") : null));

    /* ---- Hero: Saldo Monatsende ---- */
    var hero = el("div", { class: "budget-hero" });
    if (c.prognoseGesamt != null) {
      hero.appendChild(el("div", { class: "eyebrow" }, "Saldo Monatsende · alle Konten"));
      hero.appendChild(el("div", { class: "budget-saldo " + (c.prognoseGesamt >= 0 ? "pos" : "neg") }, U.eur(c.prognoseGesamt)));
      hero.appendChild(el("div", { class: "small muted" },
        "Prognose Girokonto ", el("span", { class: "num" }, U.eur(c.prognoseGiro)),
        " · noch offen & geplant ", el("span", { class: "num " + (c.offenGesamt >= 0 ? "pos" : "neg") }, U.eur(c.offenGesamt))));
      var calcOpen = !!state.ui.budgetCalcOpen;
      hero.appendChild(el("button", {
        class: "row-expander", style: "margin-top:6px", "aria-expanded": calcOpen ? "true" : "false",
        onclick: function () { state.ui.budgetCalcOpen = !calcOpen; Store.commit(); UI.render(); }
      }, (calcOpen ? "▾" : "▸") + " Rechnung"));
      if (calcOpen) {
        var calc = el("div", { class: "calc", style: "text-align:left" });
        function line(label, v, first) {
          if (!first && Math.abs(v) < 0.005) return;
          calc.appendChild(el("div", { class: "calc-line" },
            el("span", {}, (first ? "" : (v >= 0 ? "+ " : "− ")) + label),
            el("span", { class: "num " + (v > 0 ? "pos" : v < 0 ? "neg" : "muted") }, U.eur(first ? v : Math.abs(v)))));
        }
        line("Girokonto", md.giro || 0, true);
        line("2. Konto", md.konto2 || 0);
        line("Kreditkarte", md.kkSaldo || 0);
        line("erwartete Einnahmen (offen)", c.restEin);
        line("erwartete Fixkosten (offen)", c.restFix);
        line("erwartete Schulden (offen)", c.restSchuld);
        line("Zusatzeinnahmen", c.plan.offenEinnahme);
        line("Zusatzausgaben", c.plan.offenAusgabe);
        line("Rücklagen geplant", c.plan.offenRuecklage);
        calc.appendChild(el("div", { class: "calc-line total" },
          el("span", {}, "= Saldo Monatsende"), el("span", { class: "num" }, U.eur(c.prognoseGesamt))));
        hero.appendChild(calc);
      }
    } else {
      hero.appendChild(el("div", { class: "eyebrow" }, "Saldo Monatsende"));
      hero.appendChild(el("div", { class: "budget-saldo muted" }, "–"));
      hero.appendChild(el("div", { class: "small muted" }, "Girokonto unten eintragen, dann rechnet die Prognose los."));
    }
    wrap.appendChild(hero);

    /* ---- Konten eintragen ---- */
    function kontoInput(key, label, sub) {
      var inp = UI.numInput({
        value: md[key], allowEmpty: true,
        onchange: function (v) { md[key] = v; Store.commit(); UI.render(); }
      });
      inp.placeholder = "eintragen …";
      return el("div", { class: "budget-konto" },
        el("div", { class: "lbl" }, el("div", {}, label), sub ? el("small", { class: "muted" }, sub) : null),
        inp);
    }
    var kkDatum = el("input", { type: "date", value: md.kkDatum || "" });
    kkDatum.addEventListener("change", function () { md.kkDatum = kkDatum.value; Store.commit(); });
    wrap.appendChild(el("div", { class: "budget-sec" },
      el("div", { class: "eyebrow", style: "margin-bottom:8px" }, "Kontostände · " + U.monthLabel(mk, true)),
      kontoInput("giro", "Girokonto", "Sparkasse · Basis der Prognose"),
      kontoInput("konto2", "2. Konto", "Tagesgeld / DKB"),
      kontoInput("kkSaldo", "Kreditkarte", "offener Saldo, negativ"),
      el("div", { class: "budget-konto" },
        el("div", { class: "lbl" }, el("div", {}, "Letzte KK-Abrechnung")), kkDatum)));

    /* ---- Schnell planen: Einnahme / Ausgabe / Rücklage ---- */
    function quickAdd(typ, label, hint, sign) {
      var desc = el("input", { type: "text", placeholder: label + " …" });
      var betrag = el("input", { type: "text", inputmode: "decimal", class: "inline-num", placeholder: hint });
      function add() {
        var v = U.parseInputNumber(betrag.value);
        if (isNaN(v) || v === 0) { U.toast("Bitte einen Betrag eingeben.", "warn"); return; }
        if (sign < 0 && v > 0) v = -v;   // Ausgaben/Rücklagen automatisch negativ
        if (sign > 0 && v < 0) v = -v;
        md.planned.push({ id: U.uid("plan"), beschreibung: desc.value.trim() || label, typ: typ, betrag: Math.round(v * 100) / 100, erledigt: false, txId: null });
        Store.commit();
        U.toast(U.eur(v) + " als " + label + " für " + U.monthLabel(mk, true) + " eingeplant.", "ok");
        UI.render();
      }
      betrag.addEventListener("keydown", function (e) { if (e.key === "Enter") add(); });
      return el("div", { class: "budget-quick" },
        desc, betrag,
        el("button", { class: "btn sm primary", "aria-label": label + " hinzufügen", onclick: add }, "＋"));
    }
    var sec = el("div", { class: "budget-sec" },
      el("div", { class: "eyebrow", style: "margin-bottom:8px" }, "Für " + U.monthLabel(mk, true) + " einplanen"),
      el("div", { class: "small muted", style: "margin-bottom:4px" }, "Zusatzeinnahme"),
      quickAdd("einnahme", "Zusatzeinnahme", "z. B. 250", 1),
      el("div", { class: "small muted", style: "margin:8px 0 4px" }, "Zusatzausgabe"),
      quickAdd("ausgabe", "Zusatzausgabe", "z. B. 120", -1),
      el("div", { class: "small muted", style: "margin:8px 0 4px" }, "Rücklage / Sparen"),
      quickAdd("ruecklage", "Rücklage", "z. B. 400", -1));

    // Bestehende Planungseinträge des Monats (kompakt, abhak-/löschbar)
    if ((md.planned || []).length) {
      var list = el("div", { style: "margin-top:12px" });
      var typLabel = { einnahme: "Einnahme", ausgabe: "Ausgabe", ruecklage: "Rücklage" };
      md.planned.forEach(function (p) {
        var chk = el("input", { type: "checkbox", checked: !!p.erledigt, title: "erledigt" });
        chk.addEventListener("change", function () { p.erledigt = chk.checked; if (!chk.checked) p.txId = null; Store.commit(); UI.render(); });
        list.appendChild(el("div", { class: "detail-tx", style: p.erledigt ? "opacity:.6" : "" },
          chk,
          el("span", { class: "pill" }, typLabel[p.typ] || p.typ),
          el("span", { class: "who" }, p.beschreibung || "—"),
          el("span", { class: "num small " + (p.betrag > 0 ? "pos" : "neg") }, U.eur(p.betrag)),
          el("button", {
            class: "btn sm danger", "aria-label": "löschen", onclick: function () {
              md.planned = md.planned.filter(function (x) { return x !== p; });
              Store.commit(); UI.render();
            }
          }, "✕")));
      });
      sec.appendChild(list);
    }
    wrap.appendChild(sec);

    return el("section", { class: "card budget-panel" },
      el("h2", { class: "card-title" }, "Budget ",
        el("span", { class: "hint" }, "Kontostände & Planung → direkt in die Monatswerte")),
      wrap);
  };
})();
