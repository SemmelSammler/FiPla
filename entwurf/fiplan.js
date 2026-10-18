/* fiplan.js — korrigierte FI-Rechnung für BoSal. Eigene Datei: js/logic.js bleibt unverändert.
   Rechnet Monat für Monat (Einnahmen und Raten wachsen jährlich), fasst für die Anzeige pro Jahr zusammen.
   Korrekturen gegenüber Logic.runFI:
   1  FI-Test misst den Lebensbedarf (Fixkosten + gewählte laufende Ausgaben)
   2  Haus-EK zählt nicht zum FI-Kapital; optional Kaufjahr, dann wird es eingesetzt
   3  Anschaffungen werden voll verrechnet, im gewählten Monat, aus wählbaren Töpfen
      (Standard: Notgroschen → ETF → Haus-EK). Reicht das nicht, wird der Rest als Kredit geführt:
      Bis er zurückgezahlt ist, pausieren alle Spartöpfe und ihr Geld tilgt den Kredit.
   4  Kinder-Sparen ist ein eigener Spartopf, Auto bleibt Ausgabe
   5  Startbestände: unverändert Eingabe (Hinweis in der Oberfläche)
   6  Einnahmen/Fixkosten können live aus dem Monat kommen (macht die Oberfläche)
   7  Startmonat folgt dem heutigen Datum, Alter aus dem Geburtsjahr
   8  Deckel begrenzen nur das Wachstum, nie unter den Startwert
   9  Ein Topf bekommt nur, was bis zum Ziel fehlt (kein Geld verschwindet)          */
(function (root) {
  "use strict";
  var ORDER = { auto: ["ng", "etf", "hek"], etf: ["etf"], ng: ["ng"], hek: ["hek"], kind: ["kind"] };
  var ALLOC = ["etfMin", "lebensqual", "sonder", "auto", "kredit", "kind", "hausEk", "notgroschen", "etfRest"];
  function planRate(plan, jahr, fallback) {
    if (plan && Object.prototype.hasOwnProperty.call(plan, jahr)) return Number(plan[jahr]) || 0;
    return Number(fallback) || 0;
  }
  function mRate(p) { return Math.pow(1 + (p || 0), 1 / 12) - 1; }

  function run(a, opt) {
    opt = opt || {};
    var today = opt.today || new Date();
    var startjahr = today.getFullYear(), startMonat = today.getMonth() + 1;
    var geburtsjahr = a.geburtsjahr || (a.startjahr - a.startalter);
    var bedarfMit = a.fiBedarf || { lq: true, auto: true };
    var rEtf = mRate(a.etfRendite), rNg = mRate(a.notgroschenZins), rKind = mRate(a.kindZins), rKredit = mRate(a.fehlZins == null ? 0.06 : a.fehlZins);

    var S = { ng: a.notgroschenStart || 0, hek: a.hausEkStart || 0, kind: a.kindStart || 0, etf: a.etfStart || 0, schuld: 0 };
    var kfw1 = -Math.abs(a.kfw1Rest || 0), kfw2 = -Math.abs(a.kfw2Rest || 0);
    var einn = a.einnahmen, fix = a.fixkosten;
    var einnCap = Math.max(a.einnahmenDeckel || 0, a.einnahmen), fixCap = Math.max(a.fixkostenDeckel || 0, a.fixkosten);
    var endYear = geburtsjahr + a.endalter;
    var years = [], fiJahr = null, hekGekauft = false;

    for (var jahr = startjahr; jahr <= endYear; jahr++) {
      var first = jahr === startjahr;
      if (!first) { einn = Math.min(einnCap, einn * (1 + a.wachstumEinnahmen)); fix = Math.min(fixCap, fix * (1 + a.wachstumFix)); }
      var months = [], sums = {}, wd = { ng: 0, etf: 0, hek: 0, kind: 0, fehl: 0 }, evDetails = [], hekEingesetzt = 0, evSum = 0;
      ALLOC.forEach(function (k) { sums[k] = 0; });
      var pfl1Sum = 0, pfl2Sum = 0, freiSum = 0;

      for (var m = first ? startMonat : 1; m <= 12; m++) {
        var p1 = kfw1 < 0 ? Math.min(planRate(a.kfw1Plan, jahr, a.kfw1PlanDefault), -kfw1) : 0;
        var p2 = kfw2 < 0 ? Math.min(planRate(a.kfw2Plan, jahr, a.kfw2PlanDefault), -kfw2) : 0;
        var frei = einn - fix - p1 - p2, budget = frei;
        var take = function (want) { var g = Math.max(0, Math.min(want, budget)); budget -= g; return g; };
        var al = { etfMin: 0, kredit: 0, kind: 0, hausEk: 0, notgroschen: 0, etfRest: 0 };
        S.schuld = S.schuld * (1 + rKredit);
        if (S.schuld < 0.005) S.schuld = 0;
        var pausiertStart = S.schuld > 0;
        if (!pausiertStart) al.etfMin = take(a.etfMindest);
        al.lebensqual = take(a.lebensqualitaet);
        al.sonder = kfw1 + p1 < 0 ? take(Math.min(a.kfw1Sonder, -(kfw1 + p1))) : 0;
        al.auto = take(a.autoPauschale);
        if (S.schuld > 0) { al.kredit = take(S.schuld); S.schuld -= al.kredit; }   // Kredit zuerst: Spartöpfe pausieren
        var pausiert = S.schuld > 0.005;
        if (!pausiert) {
          if (pausiertStart) al.etfMin = take(a.etfMindest);               // Kredit in diesem Monat getilgt: wieder normal sparen
          al.kind = take(a.kindSparrate);
          al.hausEk = (!hekGekauft && S.hek < a.hausEkZiel) ? take(Math.min(a.hausEkRate, a.hausEkZiel - S.hek)) : 0;
          al.notgroschen = S.ng < a.notgroschenZiel ? take(Math.min(a.notgroschenRate, a.notgroschenZiel - S.ng)) : 0;
          al.etfRest = Math.max(0, budget);
        }

        S.ng = S.ng * (1 + rNg) + al.notgroschen;
        S.hek += al.hausEk;
        S.kind = S.kind * (1 + rKind) + al.kind;
        S.etf = S.etf * (1 + rEtf) + al.etfMin + al.etfRest;
        kfw1 = Math.min(0, kfw1 + p1 + al.sonder);
        kfw2 = Math.min(0, kfw2 + p2);

        // Anschaffungen in diesem Monat (alte Einträge ohne Monat: Januar)
        var mWd = { ng: 0, etf: 0, hek: 0, kind: 0, fehl: 0 }, mEv = 0;
        (a.events || []).forEach(function (e, idx) {
          var em = Number(e.monat) || 1;
          if (first && em < startMonat) em = startMonat;               // liegt in der Vergangenheit → frühestens jetzt
          if (Number(e.jahr) !== jahr || em !== m) return;
          var amt = Number(e.betrag) || 0; if (!amt) return;
          var before = { ng: S.ng, etf: S.etf, hek: S.hek, kind: S.kind, schuld: S.schuld }, p = { ng: 0, etf: 0, hek: 0, kind: 0, fehl: 0 };
          if (amt > 0) { S.etf += amt; p.etf = -amt; }
          else {
            var need = -amt;
            (ORDER[e.quelle] || ORDER.auto).forEach(function (k) { var t = Math.min(need, Math.max(0, S[k])); S[k] -= t; p[k] += t; need -= t; });
            p.fehl = need; S.schuld += need;                           // Fehlbetrag wird zum Kredit
          }
          Object.keys(p).forEach(function (k) { if (p[k] > 0) { mWd[k] += p[k]; wd[k] += p[k]; } });
          mEv += amt; evSum += amt;
          evDetails.push({ index: idx, monat: m, betrag: amt, quelle: e.quelle || "auto", paid: p, before: before, after: { ng: S.ng, etf: S.etf, hek: S.hek, kind: S.kind, schuld: S.schuld } });
        });
        if (a.hauskaufJahr && jahr === Number(a.hauskaufJahr) && m === (Number(a.hauskaufMonat) || 12) && !hekGekauft) { hekEingesetzt = S.hek; S.hek = 0; hekGekauft = true; }

        ALLOC.forEach(function (k) { sums[k] += al[k]; });
        pfl1Sum += p1; pfl2Sum += p2; freiSum += frei;
        months.push({ monat: m, frei: frei, alloc: al, wd: mWd, events: mEv, pausiert: pausiert, kreditOffen: S.schuld > 0.005, stand: { ng: S.ng, etf: S.etf, hek: S.hek, kind: S.kind, schuld: S.schuld, kfw: kfw1 + kfw2 } });
      }

      var n = months.length, avg = function (v) { return v / n; };
      var fiCap = S.ng + S.etf - S.schuld, bedarf = fix + (bedarfMit.lq ? a.lebensqualitaet : 0) + (bedarfMit.auto ? a.autoPauschale : 0);
      var fi = fiCap * 0.04 >= bedarf * 12;
      if (fi && fiJahr === null) fiJahr = jahr;
      years.push({
        jahr: jahr, alter: jahr - geburtsjahr, monate: n, months: months, einnahmen: einn, fixkosten: fix,
        kfw1Pfl: avg(pfl1Sum), kfw2Pfl: avg(pfl2Sum), frei: avg(freiSum),
        allocEtfMin: avg(sums.etfMin), allocLebensqual: avg(sums.lebensqual), allocSonder: avg(sums.sonder), allocAuto: avg(sums.auto),
        allocKind: avg(sums.kind), allocKredit: avg(sums.kredit), allocHausEk: avg(sums.hausEk), allocNotgroschen: avg(sums.notgroschen), allocEtfRest: avg(sums.etfRest),
        sums: sums, wd: wd, schuld: S.schuld, notgroschen: S.ng, hausEk: S.hek, kind: S.kind, etf: S.etf, kfw1: kfw1, kfw2: kfw2, hekEingesetzt: hekEingesetzt,
        events: evSum, eventPaid: wd, eventDetails: evDetails, fiCap: fiCap, bedarf: bedarf, fi: fi,
        vermoegen: S.ng + S.hek + S.kind + S.etf - S.schuld + kfw1 + kfw2
      });
    }
    var fiRow = fiJahr !== null ? years.find(function (y) { return y.jahr === fiJahr; }) : null;
    return {
      years: years, fiJahr: fiJahr, fiAlter: fiRow ? fiRow.alter : null, startjahr: startjahr, startMonat: startMonat, monateJahr1: years.length ? years[0].monate : 0, geburtsjahr: geburtsjahr,
      vermoegenHeute: (a.notgroschenStart || 0) + (a.hausEkStart || 0) + (a.kindStart || 0) + (a.etfStart || 0) - Math.abs(a.kfw1Rest || 0) - Math.abs(a.kfw2Rest || 0),
      vermoegenBeiFi: fiRow ? fiRow.vermoegen : null, cashflowHeute: years.length ? years[0].months[0].frei : 0
    };
  }
  root.BoSalFI = { run: run, ORDER: ORDER };
})(typeof self !== "undefined" ? self : this);
