/* fiplan.js — korrigierte FI-Rechnung für BoSal. Eigene Datei: js/logic.js bleibt unverändert.
   Gleiche Grundidee wie Logic.runFI (Jahr für Jahr, Wasserfall-Verteilung, 4-%-Regel),
   aber mit den 8 Korrekturen aus den Prüfpunkten:
   1  FI-Test misst den ganzen Lebensbedarf (Fixkosten + gewählte laufende Ausgaben)
   2  Haus-EK zählt nicht zum FI-Kapital; optional Kaufjahr, dann wird es eingesetzt
   3  Lebensereignisse werden voll verrechnet: aus ETF, Notgroschen, Haus-EK, Rest als Fehlbetrag
   9  Ist ein Ziel fast erreicht, bekommt der Topf nur den fehlenden Rest (kein Geld verschwindet)
   4  Kind-Sparrate ist ein eigener Spartopf, Auto bleibt Ausgabe
   5  Startbestände: unverändert Eingabe (Hinweis in der Oberfläche)
   6  Einnahmen/Fixkosten können live aus dem Monat kommen (macht die Oberfläche)
   7  Startjahr und Restmonate folgen dem heutigen Datum, Alter aus dem Geburtsjahr
   8  Deckel begrenzen nur das Wachstum, nie unter den Startwert                       */
(function (root) {
  "use strict";
  function planRate(plan, jahr, fallback) {
    if (plan && Object.prototype.hasOwnProperty.call(plan, jahr)) return Number(plan[jahr]) || 0;
    return Number(fallback) || 0;
  }

  function run(a, opt) {
    opt = opt || {};
    var today = opt.today || new Date();
    var startjahr = today.getFullYear();
    var monateJahr1 = 12 - today.getMonth();                       // inkl. laufendem Monat
    var geburtsjahr = a.geburtsjahr || (a.startjahr - a.startalter);
    var bedarfMit = a.fiBedarf || { lq: true, auto: true };

    var ng = a.notgroschenStart || 0, hek = a.hausEkStart || 0, kind = a.kindStart || 0, etf = a.etfStart || 0;
    var kfw1 = -Math.abs(a.kfw1Rest || 0), kfw2 = -Math.abs(a.kfw2Rest || 0);
    var einn = a.einnahmen, fix = a.fixkosten;
    var einnCap = Math.max(a.einnahmenDeckel || 0, a.einnahmen), fixCap = Math.max(a.fixkostenDeckel || 0, a.fixkosten);
    var endYear = geburtsjahr + a.endalter;
    var years = [], fiJahr = null, hekGekauft = false;

    for (var jahr = startjahr; jahr <= endYear; jahr++) {
      var first = jahr === startjahr, monate = first ? monateJahr1 : 12;
      if (!first) {
        einn = Math.min(einnCap, einn * (1 + a.wachstumEinnahmen));
        fix = Math.min(fixCap, fix * (1 + a.wachstumFix));
      }
      var kfw1Pfl = kfw1 < 0 ? Math.min(planRate(a.kfw1Plan, jahr, a.kfw1PlanDefault), -kfw1) : 0;
      var kfw2Pfl = kfw2 < 0 ? Math.min(planRate(a.kfw2Plan, jahr, a.kfw2PlanDefault), -kfw2) : 0;
      var frei = einn - fix - kfw1Pfl - kfw2Pfl;

      // Wasserfall (Ereignisse beeinflussen ihn nicht mehr)
      var budget = frei;
      function take(want) { var g = Math.max(0, Math.min(want, budget)); budget -= g; return g; }
      var etfFloor = take(a.etfMindest);
      var lq = take(a.lebensqualitaet);
      var sonder = kfw1 < 0 ? take(Math.min(a.kfw1Sonder, (-kfw1) - kfw1Pfl)) : 0;
      var auto = take(a.autoPauschale);
      var kindAlloc = take(a.kindSparrate);
      var hekAlloc = (!hekGekauft && hek < a.hausEkZiel) ? take(Math.min(a.hausEkRate, (a.hausEkZiel - hek) / monate)) : 0;
      var ngAlloc = ng < a.notgroschenZiel ? take(Math.min(a.notgroschenRate, (a.notgroschenZiel - ng) / monate)) : 0;
      var etfRest = Math.max(0, budget);

      // Bestände fortschreiben
      ng = ng * (1 + a.notgroschenZins) + ngAlloc * monate;
      hek = hek + hekAlloc * monate;
      kind = kind * (1 + (a.kindZins || 0)) + kindAlloc * monate;
      kfw1 = Math.min(0, kfw1 + (kfw1Pfl + sonder) * monate);
      kfw2 = Math.min(0, kfw2 + kfw2Pfl * monate);
      etf = etf * (1 + a.etfRendite) + (etfFloor + etfRest) * monate * (1 + a.etfRendite / 2);

      // Hauskauf: Eigenkapital wird eingesetzt und ist danach weg
      var hekEingesetzt = 0;
      if (a.hauskaufJahr && jahr === Number(a.hauskaufJahr) && !hekGekauft) { hekEingesetzt = hek; hek = 0; hekGekauft = true; }

      // Lebensereignisse: voller Betrag, Kosten zuerst aus ETF, dann Notgroschen, Rest = Fehlbetrag
      // Lebensereignisse einzeln, voller Betrag. Quelle pro Ereignis wählbar (Standard: ETF → Notgroschen → Haus-EK).
      // Reicht das nicht, entsteht ein Fehlbetrag: das ETF-Depot wird negativ (= du müsstest dir Geld leihen).
      var ORDER = { auto: ["etf", "ng", "hek"], etf: ["etf"], ng: ["ng"], hek: ["hek"], kind: ["kind"] };
      var evSum = 0, paid = { etf: 0, ng: 0, hek: 0, kind: 0, fehl: 0 }, evDetails = [];
      (a.events || []).forEach(function (e, idx) {
        if (Number(e.jahr) !== jahr) return;
        var amt = Number(e.betrag) || 0; if (!amt) return;
        var st = { etf: etf, ng: ng, hek: hek, kind: kind }, before = { etf: etf, ng: ng, hek: hek, kind: kind };
        var p = { etf: 0, ng: 0, hek: 0, kind: 0, fehl: 0 };
        if (amt > 0) { st.etf += amt; p.etf = -amt; }
        else {
          var need = -amt;
          (ORDER[e.quelle] || ORDER.auto).forEach(function (k) { var t = Math.min(need, Math.max(0, st[k])); st[k] -= t; p[k] += t; need -= t; });
          p.fehl = need; st.etf -= need;
        }
        etf = st.etf; ng = st.ng; hek = st.hek; kind = st.kind; evSum += amt;
        Object.keys(p).forEach(function (k) { paid[k] += p[k]; });
        evDetails.push({ index: idx, betrag: amt, quelle: e.quelle || "auto", paid: p, before: before, after: { etf: etf, ng: ng, hek: hek, kind: kind } });
      });

      var fiCap = ng + etf;                                             // ohne Haus-EK und Kinder-Topf
      var bedarf = fix + (bedarfMit.lq ? a.lebensqualitaet : 0) + (bedarfMit.auto ? a.autoPauschale : 0);
      var fi = fiCap * 0.04 >= bedarf * 12;
      if (fi && fiJahr === null) fiJahr = jahr;

      years.push({
        jahr: jahr, alter: jahr - geburtsjahr, monate: monate, einnahmen: einn, fixkosten: fix, kfw1Pfl: kfw1Pfl, kfw2Pfl: kfw2Pfl, frei: frei,
        allocEtfMin: etfFloor, allocLebensqual: lq, allocSonder: sonder, allocAuto: auto, allocKind: kindAlloc, allocHausEk: hekAlloc, allocNotgroschen: ngAlloc, allocEtfRest: etfRest,
        notgroschen: ng, hausEk: hek, kind: kind, etf: etf, kfw1: kfw1, kfw2: kfw2, hekEingesetzt: hekEingesetzt,
        events: evSum, eventPaid: paid, eventDetails: evDetails, fiCap: fiCap, bedarf: bedarf, fi: fi,
        vermoegen: ng + hek + kind + etf + kfw1 + kfw2
      });
    }
    var fiRow = fiJahr !== null ? years.find(function (y) { return y.jahr === fiJahr; }) : null;
    return {
      years: years, fiJahr: fiJahr, fiAlter: fiRow ? fiRow.alter : null, startjahr: startjahr, monateJahr1: monateJahr1, geburtsjahr: geburtsjahr,
      vermoegenHeute: (a.notgroschenStart || 0) + (a.hausEkStart || 0) + (a.kindStart || 0) + (a.etfStart || 0) - Math.abs(a.kfw1Rest || 0) - Math.abs(a.kfw2Rest || 0),
      vermoegenBeiFi: fiRow ? fiRow.vermoegen : null, cashflowHeute: years.length ? years[0].frei : 0,
      deckelAngehoben: { einnahmen: a.einnahmen > (a.einnahmenDeckel || 0), fixkosten: a.fixkosten > (a.fixkostenDeckel || 0) }
    };
  }
  root.BoSalFI = { run: run };
})(typeof self !== "undefined" ? self : this);
