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
   9  Ein Topf bekommt nur, was bis zum Ziel fehlt (kein Geld verschwindet)
   10 KfW-Kredite mit Zinsen (Stand laut Kontoauszug, Zins, Monatsrate, Rate ab); vorher wurde
      die ganze Rate als Tilgung gerechnet
   11 Sparen ab: Vor diesem Monat läuft nur, was laufen muss (KfW-Rate, Kredit aus Anschaffungen).
      Alle Töpfe (auch Lebensqualität, Auto, Sondertilgung) starten erst dann, das Freie bleibt unverplant
   12 Gehaltserhöhung jeweils ab einem Monat (Standard Mai), Fixkosten steigen im Januar  */
(function (root) {
  "use strict";
  var ORDER = { auto: ["ng", "etf", "hek"], etf: ["etf"], ng: ["ng"], hek: ["hek"], kind: ["kind"] };
  var ALLOC = ["etfMin", "lebensqual", "sonder", "auto", "kredit", "kind", "notgroschen", "hausEk", "etfRest", "unverplant"];
  function mRate(p) { return Math.pow(1 + (p || 0), 1 / 12) - 1; }
  function ymNum(s) { if (!s) return null; var p = String(s).split("-"); return +p[0] * 12 + (+p[1] - 1); }   // "2027-03" → Monatszahl

  function run(a, opt) {
    opt = opt || {};
    var today = opt.today || new Date();
    var startjahr = today.getFullYear(), startMonat = today.getMonth() + 1;
    var geburtsjahr = a.geburtsjahr || (a.startjahr - a.startalter);
    var bedarfMit = a.fiBedarf || { lq: true, auto: true };
    var rEtf = mRate(a.etfRendite), rNg = mRate(a.notgroschenZins), rKind = mRate(a.kindZins), rKredit = mRate(a.fehlZins == null ? 0.06 : a.fehlZins);

    var S = { ng: a.notgroschenStart || 0, hek: a.hausEkStart || 0, kind: a.kindStart || 0, etf: a.etfStart || 0, schuld: 0 };
    var kfw1 = -Math.abs(a.kfw1Rest || 0), kfw2 = -Math.abs(a.kfw2Rest || 0);
    var standYm = ymNum(a.kfwStand), sparYm = ymNum(a.sparAb), ab1 = ymNum(a.kfw1Ab), ab2 = ymNum(a.kfw2Ab);
    // Eine KfW-Rate pro Monat: Zinsen (Saldo × Zins / 12, wie die KfW rechnet) kommen dazu, die Rate geht ab.
    // Bis zum Monat des Kontoauszugs ist die Rate schon im Saldo verbucht: Sie kostet Geld, ändert den Saldo aber nicht.
    function kfwMonat(rest, zins, rate, ab, ym) {
      var aktiv = ab == null || ym >= ab;
      if (standYm != null && ym <= standYm) return { rest: rest, pay: aktiv && rest < 0 ? rate : 0, zins: 0 };
      var z = rest < 0 ? -rest * (zins || 0) / 12 : 0; rest -= z;
      var pay = aktiv && rest < 0 ? Math.min(rate || 0, -rest) : 0;
      return { rest: rest + pay, pay: pay, zins: z };
    }
    var einn = a.einnahmen, fix = a.fixkosten;
    var einnCap = Math.max(a.einnahmenDeckel || 0, a.einnahmen), fixCap = Math.max(a.fixkostenDeckel || 0, a.fixkosten);
    var endYear = geburtsjahr + a.endalter;
    var years = [], fiJahr = null, hekGekauft = false;

    for (var jahr = startjahr; jahr <= endYear; jahr++) {
      var first = jahr === startjahr;
      if (!first) fix = Math.min(fixCap, fix * (1 + a.wachstumFix));
      var erhM = Number(a.erhoehungMonat) || 1, einnSum = 0, einnVor = einn;
      var months = [], sums = {}, wd = { ng: 0, etf: 0, hek: 0, kind: 0, fehl: 0 }, evDetails = [], hekEingesetzt = 0, evSum = 0;
      ALLOC.forEach(function (k) { sums[k] = 0; });
      var pfl1Sum = 0, pfl2Sum = 0, freiSum = 0, zinsSum = 0, vorSpar = 0;

      for (var m = first ? startMonat : 1; m <= 12; m++) {
        var ym = jahr * 12 + m - 1, vor = sparYm != null && ym < sparYm;
        if (m === erhM && !(first && m === startMonat)) einn = Math.min(einnCap, einn * (1 + a.wachstumEinnahmen));   // Gehaltserhöhung
        einnSum += einn;
        var k1 = kfwMonat(kfw1, a.kfw1Zins, a.kfw1Rate, ab1, ym), k2 = kfwMonat(kfw2, a.kfw2Zins, a.kfw2Rate, ab2, ym);
        kfw1 = k1.rest; kfw2 = k2.rest; zinsSum += k1.zins + k2.zins;
        var p1 = k1.pay, p2 = k2.pay;
        var frei = einn - fix - p1 - p2, budget = frei;
        var take = function (want) { var g = Math.max(0, Math.min(want, budget)); budget -= g; return g; };
        var al = { etfMin: 0, kredit: 0, kind: 0, hausEk: 0, notgroschen: 0, etfRest: 0, unverplant: 0 };
        S.schuld = S.schuld * (1 + rKredit);
        if (S.schuld < 0.005) S.schuld = 0;
        var pausiertStart = S.schuld > 0;
        if (!pausiertStart && !vor) al.etfMin = take(a.etfMindest);
        al.lebensqual = vor ? 0 : take(a.lebensqualitaet);
        al.sonder = !vor && kfw1 < -0.005 ? take(Math.min(a.kfw1Sonder, -kfw1)) : 0;
        al.auto = vor ? 0 : take(a.autoPauschale);
        if (S.schuld > 0) { al.kredit = take(S.schuld); S.schuld -= al.kredit; }   // Kredit zuerst: Spartöpfe pausieren
        var pausiert = S.schuld > 0.005;
        if (vor) { al.unverplant = Math.max(0, budget); vorSpar++; }       // vor dem Sparstart: nichts sparen
        else if (!pausiert) {
          if (pausiertStart) al.etfMin = take(a.etfMindest);               // Kredit in diesem Monat getilgt: wieder normal sparen
          al.kind = take(a.kindSparrate);
          al.notgroschen = S.ng < a.notgroschenZiel ? take(Math.min(a.notgroschenRate, a.notgroschenZiel - S.ng)) : 0;   // Notgroschen vor Haus-EK
          al.hausEk = (!hekGekauft && S.hek < a.hausEkZiel) ? take(Math.min(a.hausEkRate, a.hausEkZiel - S.hek)) : 0;
          al.etfRest = Math.max(0, budget);
        }

        S.ng = S.ng * (1 + rNg) + al.notgroschen;
        S.hek += al.hausEk;
        S.kind = S.kind * (1 + rKind) + al.kind;
        S.etf = S.etf * (1 + rEtf) + al.etfMin + al.etfRest;
        kfw1 = Math.min(0, kfw1 + al.sonder);
        if (kfw1 > -0.005) kfw1 = 0; if (kfw2 > -0.005) kfw2 = 0;

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
        months.push({ monat: m, frei: frei, alloc: al, wd: mWd, events: mEv, pausiert: pausiert && !vor, vorSpar: vor, kfwZins: k1.zins + k2.zins, p1: p1, p2: p2, kreditOffen: S.schuld > 0.005, stand: { ng: S.ng, etf: S.etf, hek: S.hek, kind: S.kind, schuld: S.schuld, kfw: kfw1 + kfw2 } });
      }

      var n = months.length, avg = function (v) { return v / n; };
      var fiCap = S.ng + S.etf - S.schuld, bedarf = fix + (bedarfMit.lq ? a.lebensqualitaet : 0) + (bedarfMit.auto ? a.autoPauschale : 0);
      var fi = fiCap * 0.04 >= bedarf * 12;
      if (fi && fiJahr === null) fiJahr = jahr;
      years.push({
        jahr: jahr, alter: jahr - geburtsjahr, monate: n, months: months, einnahmen: einnSum / n, einnVor: einnVor, einnNach: einn, erhoehung: einn > einnVor + 0.005, fixkosten: fix,
        kfw1Pfl: avg(pfl1Sum), kfw2Pfl: avg(pfl2Sum), frei: avg(freiSum),
        allocEtfMin: avg(sums.etfMin), allocLebensqual: avg(sums.lebensqual), allocSonder: avg(sums.sonder), allocAuto: avg(sums.auto),
        allocKind: avg(sums.kind), allocKredit: avg(sums.kredit), allocHausEk: avg(sums.hausEk), allocNotgroschen: avg(sums.notgroschen), allocEtfRest: avg(sums.etfRest), allocUnverplant: avg(sums.unverplant), kfwZins: zinsSum, vorSpar: vorSpar,
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
