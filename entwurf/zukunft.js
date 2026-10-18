/* BoSal — Zukunft mit der korrigierten Rechnung (fiplan.js). Die alte Rechnung (Logic.runFI)
   läuft nur noch zum Vergleich mit. */
(function () {
  "use strict";
  var zu = { year: null, edit: false, open: {}, src: null, pick: null, vlMode: "jahr", vlStart: null, vlInhalt: "ein" };
  var MON = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  var MONL = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // Neue Felder mit sinnvollen Startwerten ergänzen (alte Daten bleiben gültig)
  function ensure(a) {
    if (a.geburtsjahr == null) a.geburtsjahr = a.startjahr - a.startalter;
    if (a.fiBedarf == null) a.fiBedarf = { lq: true, auto: true };
    if (a.kindStart == null) a.kindStart = 0;
    if (a.ausMonat == null) a.ausMonat = true;
    if (a.hauskaufJahr === undefined) a.hauskaufJahr = null;
    if (a.fehlZins == null) a.fehlZins = 0.06;
    // Studienkredite neu aufgesetzt nach den KfW-Kontoauszügen vom 03.10.2026
    if (!a.kfwV2) {
      a.kfwStand = "2026-10";
      a.kfw1Rest = 14121.29; a.kfw1Zins = 0.0746; a.kfw1Rate = 500; a.kfw1Ab = null;
      a.kfw2Rest = 5403.58; a.kfw2Zins = 0.0414; a.kfw2Rate = 100; a.kfw2Ab = "2027-01";   // Rate und Start KfW 2: Annahme, bitte prüfen
      a.kfwV2 = true;
    }
    if (a.sparAb === undefined) a.sparAb = "2027-03";
    if (a.erhoehungMonat == null) a.erhoehungMonat = 5;
  }
  function mkLabel(v) { if (!v) return null; var p = String(v).split("-"); return MONL[+p[1] - 1] + " " + p[0]; }
  // Einnahmen/Fixkosten live aus dem Monat (Korrektur 6)
  function monthValues(c, a) {
    var mk = zu.src || c.state.active;
    var items = c.state.expected.filter(function (i) { return i.aktiv && i.typ !== "Schulden"; });
    if (!zu.pick) { zu.pick = {}; items.forEach(function (i) { zu.pick[i.id] = true; }); }
    // Geteilte Kosten: Einnahmen „Anteil von anderen“ sind kein Gehalt, sie senken deine geteilten Fixkosten
    items.forEach(function (i) {
      if (i.typ === "Einnahme" && i.anteilVon == null) i.anteilVon = /anteil/i.test(i.beschreibung);
      if (i.typ === "Fixkosten" && i.geteilt == null) i.geteilt = /miete|strom|internet|gas\b|wasser|nebenkosten|rundfunk/i.test(i.beschreibung);
    });
    var on = items.filter(function (i) { return zu.pick[i.id]; }), v = function (i) { return c.sollOf(mk, i); };
    var sum = function (l) { return Math.round(l.reduce(function (s, i) { return s + Math.abs(v(i)); }, 0) * 100) / 100; };
    var lohn = sum(on.filter(function (i) { return i.typ === "Einnahme" && !i.anteilVon; })), erst = sum(on.filter(function (i) { return i.typ === "Einnahme" && i.anteilVon; }));
    var geteilt = sum(on.filter(function (i) { return i.typ === "Fixkosten" && i.geteilt; })), allein = sum(on.filter(function (i) { return i.typ === "Fixkosten" && !i.geteilt; }));
    var r2 = function (x) { return Math.round(x * 100) / 100; };
    return { mk: mk, items: items, ein: lohn, fix: r2(allein + geteilt - erst), erst: erst, geteilt: geteilt, allein: allein, meinGeteilt: r2(geteilt - erst) };
  }
  function inputs(c) {
    var a = c.state.fi; ensure(a);
    var x = clone(a);
    if (a.ausMonat) { var mv = monthValues(c, a); x.einnahmen = mv.ein; x.fixkosten = mv.fix; }
    return x;
  }

  var POTS = [
    { name: "ETF-Mindestbetrag", art: "gespart", got: "allocEtfMin", sk: "etfMin", will: function (a) { return a.etfMindest; } },
    { name: "Lebensqualität", art: "ausgegeben", got: "allocLebensqual", sk: "lebensqual", will: function (a) { return a.lebensqualitaet; } },
    { name: "KfW-Sondertilgung", art: "getilgt", got: "allocSonder", sk: "sonder", will: function (a) { return a.kfw1Sonder; } },
    { name: "Auto", art: "ausgegeben", got: "allocAuto", sk: "auto", will: function (a) { return a.autoPauschale; } },
    { name: "Kredit zurückzahlen", art: "getilgt", got: "allocKredit", sk: "kredit", will: null, kredit: true },
    { name: "Kinder-Sparen", art: "gespart", got: "allocKind", sk: "kind", wk: "kind", will: function (a) { return a.kindSparrate; }, stock: "kind" },
    { name: "Haus-Eigenkapital", art: "gespart", got: "allocHausEk", sk: "hausEk", wk: "hek", will: function (a) { return a.hausEkRate; }, stock: "hausEk", ziel: "hausEkZiel" },
    { name: "Notgroschen", art: "gespart", got: "allocNotgroschen", sk: "notgroschen", wk: "ng", will: function (a) { return a.notgroschenRate; }, stock: "notgroschen", ziel: "notgroschenZiel" },
    { name: "ETF: der ganze Rest", art: "gespart", got: "allocEtfRest", sk: "etfRest", wk: "etf", will: null, stock: "etf" },
    { name: "Nicht verplant (vor dem Sparstart)", art: "frei", got: "allocUnverplant", sk: "unverplant", will: null, vor: true }
  ];

  // Töpfe mit Nummern; die Kredit-Zeile erscheint nur, wenn es je einen Fehlbetrag gibt
  function potsFor(years) {
    var used = years.some(function (y) { return y.sums.kredit > 0.5; }), vor = years.some(function (y) { return y.sums.unverplant > 0.5; }), n = 0;
    return POTS.filter(function (p) { return (!p.kredit || used) && (!p.vor || vor); }).map(function (p) { return { p: p, nr: p.kredit ? "!" : p.vor ? "–" : String(++n) }; });
  }

  function render(c) {
    var a = inputs(c), r = window.BoSalFI.run(a), old = c.L.runFI(c.state.fi);
    var eur = c.eur, eur0 = c.eur0, money = c.money, esc = c.esc, years = r.years, first = years[0].jahr, last = years[years.length - 1].jahr;
    if (zu.year == null || zu.year < first || zu.year > last) zu.year = first;
    var y = years.find(function (x) { return x.jahr === zu.year; }), fiY = years.find(function (x) { return x.jahr === r.fiJahr; });

    var hero = '<div class="card hero z-hero"><div class="hero-label">Finanziell frei ab</div><div class="z-hero-row"><div class="hero-num num">' + (r.fiJahr || "–") + '</div><div class="z-hero-age">' + (r.fiAlter ? "mit <b>" + r.fiAlter + "</b> Jahren" : "nicht bis " + last) + "</div></div>" +
      '<div class="hero-sub">Ab dann bezahlt dein Erspartes deine laufenden Kosten, ohne weniger zu werden. <span class="z-old">alte Rechnung: ' + old.fiJahr + "</span></div>" +
      '<div class="hero-split"><div><span class="k">Frei pro Monat heute</span>' + money(r.cashflowHeute, "") + '</div><div><span class="k">Vermögen heute</span>' + money(r.vermoegenHeute, "") + '</div><div><span class="k">Vermögen ' + (r.fiJahr || last) + "</span>" + money((fiY || years[years.length - 1]).vermoegen, "") + "</div></div></div>";

    var slider = '<div class="card z-year"><div class="z-year-top"><span class="muted small">Die Schritte zeigen das Jahr</span><b class="z-year-v">' + zu.year + ' <span class="muted">· du bist ' + y.alter + "</span></b></div>" +
      '<input type="range" min="' + first + '" max="' + last + '" value="' + zu.year + '" data-act="zYear" aria-label="Jahr wählen">' +
      '<div class="z-year-btns">' + [first, first + 1, first + 2, r.fiJahr, r.fiJahr ? Math.min(last, r.fiJahr + 10) : null].filter(function (v, i, arr) { return v && arr.indexOf(v) === i; }).map(function (v) {
        return '<button class="chip' + (v === zu.year ? " on" : "") + '" data-act="zSetYear" data-y="' + v + '">' + v + (v === r.fiJahr ? " · frei" : "") + "</button>";
      }).join("") + "</div>" + sparAbCtl(c, c.state.fi) + "</div>";

    /* Schritt 1 */
    var s1 = step(1, "Was ist pro Monat frei?", "Im Jahr " + y.jahr + (y.monate < 12 ? " (noch " + y.monate + " Monate ab heute)" : ""),
      '<ul class="calc">' +
      row(a.ausMonat ? "Deine Einnahmen netto" : "Einnahmen netto", y.einnahmen, (y.jahr === first ? (a.ausMonat ? "aus " + c.mLabel(monthValues(c, a).mk, true) + (monthValues(c, a).erst ? ", ohne Anteile von anderen" : "") : "von Hand eingetragen") :
        y.erhoehung ? "bis " + MONL[a.erhoehungMonat - 2 < 0 ? 11 : a.erhoehungMonat - 2] + " " + eur0(y.einnVor) + ", ab " + MONL[a.erhoehungMonat - 1] + " " + eur0(y.einnNach) + " (+" + pct(a.wachstumEinnahmen) + "). Oben steht der Schnitt" : "höchstens " + eur0(Math.max(a.einnahmenDeckel, a.einnahmen)) + " erreicht")) +
      row(a.ausMonat && monthValues(c, a).erst ? "Deine Fixkosten" : "Fixkosten", -y.fixkosten, y.jahr === first ? (a.ausMonat ? (monthValues(c, a).erst ? "dein Anteil: geteilte Kosten minus " + c.eur0(monthValues(c, a).erst) + " von anderen" : "aus dem Monat") : "von Hand eingetragen") : "+" + pct(a.wachstumFix) + " pro Jahr, höchstens " + eur0(Math.max(a.fixkostenDeckel, a.fixkosten))) +
      row("KfW-Raten", -(y.kfw1Pfl + y.kfw2Pfl), y.kfw1Pfl + y.kfw2Pfl || y.kfw1 + y.kfw2 < -0.5 ? (y.kfwZins > 0.5 ? "Zinsen " + y.jahr + " insgesamt " + eur0(y.kfwZins) + ", der Rest tilgt" : "Rate laut Kontoauszug") : "Kredite sind abbezahlt") +
      '<li class="calc-total"><span>Frei pro Monat</span>' + money(y.frei) + "</li></ul>" +
      '<p class="muted small">Anschaffungen stecken nicht hier drin. Sie werden im jeweiligen Monat voll vom Ersparten abgezogen (Karte „Anschaffungen“ direkt unter Schritt 2).</p>');

    /* Schritt 2 */
    var PL = potsFor(years).filter(function (x) { return !x.p.kredit || y[x.p.got] > 0.5; });
    var maxW = PL.reduce(function (m, x) { return Math.max(m, x.p.will ? x.p.will(a) : y[x.p.got]); }, 1);
    var s2 = step(2, "Wie wird das Freie verteilt?", "Von oben nach unten: jeder Topf bekommt seinen Betrag, solange noch Geld da ist",
      (y.vorSpar ? '<p class="note">Sparen ab ' + mkLabel(a.sparAb) + ": In " + (y.vorSpar === y.monate ? "allen " : "") + y.vorSpar + " Monaten dieses Jahres bekommen die Töpfe noch nichts, auch Lebensqualität, Auto und Sondertilgung nicht. Nur die KfW-Rate läuft. Was frei ist, steht unter „Nicht verplant“ und zählt nicht zum Vermögen.</p>" : "") +
      (y.months.some(function (m) { return m.pausiert; }) ? '<p class="note">In diesem Jahr läuft ein Kredit aus einer Anschaffung. Solange er offen ist, pausieren die Spartöpfe und ihr Geld zahlt den Kredit zurück. Die Werte sind Durchschnitte pro Monat.</p>' : "") +
      '<ol class="pots">' + PL.map(function (x) {
        var p = x.p, got = y[p.got], will = p.will ? p.will(a) : null, full = will == null || got >= will - 0.5, note = "";
        if (p.ziel) { var st = y[p.stock]; note = (p.stock === "hausEk" && y.hekEingesetzt) ? "Haus gekauft: " + eur0(y.hekEingesetzt) + " eingesetzt" : st >= a[p.ziel] - 0.5 ? "Ziel " + eur0(a[p.ziel]) + " erreicht" : "Stand Ende " + y.jahr + ": " + eur0(st) + " von " + eur0(a[p.ziel]); }
        if (p.got === "allocSonder" && y.kfw1 >= -0.5 && !got) note = "KfW 1 ist abbezahlt";
        var w = will || got || 0;
        return '<li class="pot art-' + p.art + (got < 0.5 ? " empty" : "") + '"><span class="pot-n">' + x.nr + '</span><div class="pot-main"><div class="pot-top"><span class="pot-name">' + p.name + '</span><span class="pot-tag">' + p.art + '</span></div>' +
          '<div class="pot-bar"><span class="pot-will" style="width:' + (w / maxW * 100).toFixed(1) + '%"></span><span class="pot-got" style="width:' + (got / maxW * 100).toFixed(1) + '%"></span></div>' +
          (note ? '<div class="pot-note muted small">' + esc(note) + "</div>" : "") + '</div><div class="pot-v"><b class="num">' + eur0(got) + "</b>" + (will != null && !full ? '<span class="muted small">von ' + eur0(will) + "</span>" : "") + "</div></li>";
      }).join("") + '</ol><div class="legend-row small muted"><span class="lg-dot art-gespart"></span>gespart <span class="lg-dot art-getilgt"></span>Schulden getilgt <span class="lg-dot art-ausgegeben"></span>ausgegeben</div>');

    /* Schritt 3 */
    var ev = y.events, pd = y.eventPaid;
    var evTxt = ev < 0 ? "bezahlt aus " + [pd.etf ? "ETF-Depot " + eur0(pd.etf) : "", pd.ng ? "Notgroschen " + eur0(pd.ng) : "", pd.hek ? "Haus-EK " + eur0(pd.hek) : "", pd.kind ? "Kinder-Sparen " + eur0(pd.kind) : "", pd.fehl ? "⚠ Kredit " + eur0(pd.fehl) : ""].filter(Boolean).join(", ") : ev > 0 ? "kommt in den ETF" : "";
    var s3 = step(3, "Wie wächst dein Vermögen?", "Bestände am Ende jedes Jahres",
      stackChart(years, zu.year, r.fiJahr) +
      '<div class="z-legend small"><span><i style="background:var(--c-etf)"></i>ETF (+' + pct(a.etfRendite) + ')</span><span><i style="background:var(--c-hek)"></i>Haus-EK</span><span><i style="background:var(--c-kind)"></i>Kinder-Sparen</span><span><i style="background:var(--c-ng)"></i>Notgroschen</span><span><i style="background:var(--c-kfw)"></i>KfW-Schulden</span></div>' +
      '<ul class="calc">' + (ev ? row("Anschaffungen " + y.jahr, ev, evTxt) : "") + row("Für die Freiheit (Notgroschen + ETF)", y.fiCap) + row("Zweckgebunden (Haus-EK + Kinder-Sparen)", y.hausEk + y.kind) + row("KfW-Schulden", y.kfw1 + y.kfw2) + (y.schuld > 0.5 ? row("Offener Kredit aus Anschaffungen", -y.schuld) : "") +
      '<li class="calc-total"><span>Vermögen Ende ' + y.jahr + "</span>" + money(y.vermoegen) + "</li></ul>");

    /* Schritt 4 */
    var cap = y.fiCap, ertrag = cap * 0.04, bedarf = y.bedarf * 12, ok = ertrag >= bedarf, p4 = Math.max(0, Math.min(1, ertrag / bedarf));
    var bed = a.fiBedarf;
    var s4 = step(4, "Wann bist du frei?", "Die Idee in einem Satz: Dein Erspartes bezahlt deine laufenden Kosten, ohne dass es weniger wird",
      '<div class="z-explain"><p><b>Die Faustregel:</b> Von deinem Ersparten darfst du jedes Jahr <b>4 %</b> nehmen. Weil das Geld weiter Zinsen bringt, wird es dadurch auf lange Sicht nicht weniger.</p><p><b>Frei bist du</b>, sobald diese 4 % deine laufenden Kosten fürs ganze Jahr bezahlen. Haus-EK und Kinder-Sparen zählen nicht mit, das Geld ist für etwas anderes gedacht.</p></div>' +
      '<div class="z-bedarf"><span class="small"><b>Was soll dein Erspartes später bezahlen?</b></span><label class="chk2"><input type="checkbox" checked disabled> Fixkosten</label>' +
      '<label class="chk2"><input type="checkbox" data-act="zBed" data-k="lq"' + (bed.lq ? " checked" : "") + "> Lebensqualität (" + eur0(a.lebensqualitaet) + ")</label>" +
      '<label class="chk2"><input type="checkbox" data-act="zBed" data-k="auto"' + (bed.auto ? " checked" : "") + "> Auto (" + eur0(a.autoPauschale) + ")</label></div>" +
      '<div class="z-prog"><div class="z-prog-top"><span><b>' + y.jahr + ":</b> dein Erspartes deckt " + Math.round(p4 * 100) + ' % deiner laufenden Kosten</span><b class="' + (ok ? "pos" : "") + '">' + (ok ? "frei ✓" : "noch nicht frei") + '</b></div><div class="z-prog-bar"><span style="width:' + (p4 * 100).toFixed(1) + '%"></span></div></div>' +
      '<ul class="calc">' + row("Dein Erspartes für die Freiheit", cap, "Notgroschen + ETF" + (y.schuld > 0.5 ? " − offener Kredit" : "")) + row("4 % davon: so viel darfst du pro Jahr nehmen", ertrag, "= " + eur0(ertrag / 12) + " pro Monat") + row("Deine laufenden Kosten fürs ganze Jahr", -bedarf, eur0(y.bedarf) + " × 12 Monate") +
      '<li class="calc-total ' + (ok ? "ok" : "") + '"><span>' + (ok ? "Reicht, du bist frei" : "Reicht noch nicht") + "</span>" + (ok ? money(ertrag - bedarf) : '<span class="num neg">es fehlen ' + eur0(bedarf - ertrag) + " pro Jahr</span>") + "</li></ul>" +
      '<p class="muted small">Damit es reicht, brauchst du ' + eur0(bedarf / 0.04) + " Erspartes für die Freiheit.</p>" + fiChart(years, zu.year, r.fiJahr) +
      '<div class="z-legend small"><span><i style="background:var(--accent)"></i>so viel darfst du pro Jahr nehmen (4 %)</span><span><i style="background:var(--neg)"></i>so viel kosten deine laufenden Kosten pro Jahr</span></div>');

    return '<h1 class="page-t">Zukunft</h1><p class="lead muted">Die korrigierte Rechnung. Ganz unten steht, was gegenüber der alten Rechnung geändert ist.</p>' +
      '<div class="z-top">' + hero + slider + "</div>" + '<div class="z-steps">' + s1 + s2 + "</div>" + events(c, a, r) + standCard(c, a, years, y) + verlaufCard(c, a, years, r.fiJahr) +
      '<div class="z-steps">' + s3 + s4 + "</div>" + annahmen(c, a, r) + korrekturen(c, a, r, old);

    function row(label, v, hint) { return "<li><span>" + label + (hint ? ' <em class="muted">' + esc(hint) + "</em>" : "") + "</span>" + money(v) + "</li>"; }
    function pct(v) { return c.fmt.format(v * 100).replace(/,00$/, "") + " %"; }
  }

  // „Sparen ab“: Monat und Jahr, jederzeit änderbar
  function sparAbCtl(c, src) {
    var v = src.sparAb, p = v ? String(v).split("-") : null;
    return '<div class="z-spar"><span class="small"><b>Sparen ab</b></span>' +
      '<select data-act="zMk" data-k="sparAb" data-part="m" aria-label="Monat">' + (p ? "" : '<option value="" selected>sofort</option>') + MONL.map(function (m, i) { return '<option value="' + (i + 1) + '"' + (p && +p[1] === i + 1 ? " selected" : "") + ">" + m + "</option>"; }).join("") + "</select>" +
      '<input class="in-num" inputmode="numeric" data-act="zMk" data-k="sparAb" data-part="y" value="' + (p ? p[0] : "") + '" placeholder="Jahr" aria-label="Jahr">' +
      (v ? c.btn("sofort", "zSparSofort", "", "btn-sm btn-ghost") : "") + "</div>";
  }

  function step(n, title, sub, body) {
    return '<section class="card z-step"><div class="z-step-h"><span class="z-n">' + n + '</span><div><h2>' + title + '</h2><p class="muted small">' + sub + "</p></div></div>" + body + "</section>";
  }

  /* ---------- Alle Töpfe Ende Jahr (mit Entnahmen für Anschaffungen) ---------- */
  function standCard(c, a, years, y) {
    var eur0 = c.eur0, upto = years.filter(function (x) { return x.jahr <= y.jahr; });
    function sum(k) { return upto.reduce(function (s, x) { return s + x.sums[k]; }, 0); }
    function wdSum(k) { return upto.reduce(function (s, x) { return s + x.wd[k]; }, 0); }
    function bar(v, max) { return '<div class="st-bar"><span style="width:' + Math.max(0, Math.min(100, v / (max || 1) * 100)).toFixed(1) + '%"></span></div>'; }
    var kfwStart = Math.abs(a.kfw1Rest || 0) + Math.abs(a.kfw2Rest || 0), kfwNow = Math.max(0, -(y.kfw1 + y.kfw2)) || 0;
    var verb = { gespart: "eingezahlt", ausgegeben: "ausgegeben", getilgt: "zusätzlich getilgt", frei: "nicht verplant" };
    var rows = potsFor(years).map(function (x) {
      var p = x.p, goal = "";
      if (p.got === "allocSonder") goal = "<span>Restschuld KfW " + eur0(kfwNow) + " von " + eur0(kfwStart) + "</span>" + bar(kfwStart - kfwNow, kfwStart);
      else if (p.ziel) goal = "<span>" + eur0(y[p.stock]) + " von " + eur0(a[p.ziel]) + "</span>" + bar(y[p.stock], a[p.ziel]);
      else if (p.stock === "etf") goal = "<span>ETF-Depot gesamt " + eur0(y.etf) + " (Töpfe 1 + 8, mit Rendite)</span>";
      else if (p.stock) goal = "<span>Stand " + eur0(y[p.stock]) + "</span>";
      var w = p.wk ? y.wd[p.wk] : 0, wAll = p.wk ? wdSum(p.wk) : 0;
      var wTxt = p.wk ? (wAll > 0.5 ? '<span class="num neg">−' + eur0(wAll) + "</span>" + (w > 0.5 ? '<em class="muted small">davon ' + y.jahr + ": −" + eur0(w) + "</em>" : "") : '<span class="muted">–</span>') : '<span class="muted small">' + (p.got === "allocEtfMin" ? "→ ETF-Rest" : "") + "</span>";
      if (p.kredit) goal = y.schuld > 0.5 ? '<span class="neg">noch offen: ' + eur0(y.schuld) + "</span>" : "<span>zurückgezahlt</span>";
      return '<tr class="art-' + p.art + '"><td><span class="pot-n">' + x.nr + '</span></td><td><b>' + p.name + '</b> <span class="pot-tag">' + p.art + '</span></td><td class="r num">' + eur0(y[p.got]) + '</td><td class="r"><span class="num">' + eur0(sum(p.sk)) + '</span> <em class="muted small">' + verb[p.art] + '</em></td><td class="r st-wd">' + wTxt + '</td><td class="st-goal">' + (goal || '<span class="muted small">–</span>') + "</td></tr>";
    }).join("");
    var cost = -upto.reduce(function (s, x) { return s + Math.min(0, x.events); }, 0), costY = -Math.min(0, y.events), fehl = wdSum("fehl");
    var evRow = '<tr class="st-ev"><td><span class="pot-n">€</span></td><td><b>Anschaffungen</b></td><td class="r num">' + (costY ? "−" + eur0(costY) + '<em class="muted small">im Jahr</em>' : "–") + '</td><td class="r"><span class="num">' + (cost ? "−" + eur0(cost) : "–") + '</span> <em class="muted small">bezahlt</em></td><td class="r st-wd">' + (fehl > 0.5 ? '<span class="num neg">' + eur0(fehl) + '</span><em class="muted small">davon als Kredit (Fehlbetrag)</em>' : "") + '</td><td class="st-goal muted small">bezahlt aus den Töpfen in der Spalte „für Anschaffungen entnommen“</td></tr>';
    return '<div class="card z-stand"><div class="card-head"><h2>Alle Töpfe Ende ' + y.jahr + '</h2><span class="muted small">Jahr oben ändern</span></div><div class="vt-wrap"><table class="st-tbl"><thead><tr><th></th><th>Topf</th><th class="r">pro Monat ' + y.jahr + '</th><th class="r">bis Ende ' + y.jahr + ' insgesamt</th><th class="r">für Anschaffungen entnommen</th><th>Stand / Ziel</th></tr></thead><tbody>' + rows + evRow + "</tbody></table></div>" +
      '<p class="muted small">„pro Monat“ ist der Durchschnitt des Jahres. Der ETF-Mindestbetrag (1) und der ETF-Rest (8) liegen im selben ETF-Depot, Entnahmen stehen deshalb beim ETF-Rest.</p></div>';
  }

  /* ---------- Töpfe als Tabelle: Zeitraum (Jahre/Monate) × Inhalt (Einzahlungen/Kontostände) ---------- */
  var STOCKS = [
    { name: "Kinder-Sparen", k: "kind", art: "gespart" },
    { name: "Haus-EK", k: "hek", yk: "hausEk", art: "gespart" },
    { name: "Notgroschen", k: "ng", yk: "notgroschen", art: "gespart" },
    { name: "ETF-Depot", k: "etf", art: "gespart", sub: "Töpfe ETF-Mindest + ETF-Rest" },
    { name: "Kredit aus Anschaffungen", k: "schuld", art: "ausgegeben", neg: true },
    { name: "KfW-Restschuld", k: "kfw", art: "getilgt", neg: true }
  ];
  function verlaufCard(c, a, years, fiJ) {
    var eur0 = c.eur0, mode = zu.vlMode, inhalt = zu.vlInhalt, cols, head, nav, note;
    var y = years.find(function (x) { return x.jahr === zu.year; });
    if (mode === "jahr") {
      var first = years[0].jahr, last = years[years.length - 1].jahr, start = zu.vlStart != null ? zu.vlStart : zu.year - ((zu.year - first) % 10);
      start = Math.max(first, Math.min(start, last - 9));
      cols = years.filter(function (x) { return x.jahr >= start && x.jahr < start + 10; }).map(function (x) {
        return { label: x.jahr, sel: x.jahr === zu.year, fi: x.jahr === fiJ, y: x, alloc: x.sums, wd: x.wd, ev: x.events, pausiert: x.months.some(function (m) { return m.pausiert; }),
          stand: { kind: x.kind, hek: x.hausEk, ng: x.notgroschen, etf: x.etf, schuld: x.schuld, kfw: x.kfw1 + x.kfw2 } };
      });
      head = cols.map(function (x) { return '<th class="' + (x.sel ? "sel" : "") + '"><button class="linkrow" data-act="zSetYear" data-y="' + x.label + '">' + x.label + (x.fi ? "<em>frei</em>" : "") + "</button></th>"; }).join("");
      nav = c.btn("‹ früher", "zVl", ' data-s="' + (start - 10) + '"', "btn-sm") + '<span class="muted small">' + start + "–" + Math.min(last, start + 9) + "</span>" + c.btn("später ›", "zVl", ' data-s="' + (start + 10) + '"', "btn-sm");
    } else {
      cols = MON.map(function (m, i) {
        var d = y.months.find(function (mm) { return mm.monat === i + 1; });
        return d ? { label: m, d: d, alloc: d.alloc, wd: d.wd, ev: d.events, pausiert: d.pausiert, stand: d.stand } : { label: m, off: true };
      });
      head = cols.map(function (x) { return "<th" + (x.off ? ' class="off"' : "") + ">" + x.label + "</th>"; }).join("");
      nav = c.btn("‹ " + (zu.year - 1), "zSetYear", ' data-y="' + (zu.year - 1) + '"', "btn-sm") + "<b>" + zu.year + "</b>" + c.btn((zu.year + 1) + " ›", "zSetYear", ' data-y="' + (zu.year + 1) + '"', "btn-sm");
    }
    var per = mode === "jahr" ? "im Jahr" : "im Monat";
    var rowsDef, body = "";
    if (inhalt === "ein") {
      rowsDef = potsFor(years);
      var max = 1; rowsDef.forEach(function (x) { cols.forEach(function (cc) { if (!cc.off) max = Math.max(max, cc.alloc[x.p.sk]); }); });
      body = rowsDef.map(function (x) {
        var p = x.p, sum = 0;
        var tds = cols.map(function (cc) {
          if (cc.off) return '<td class="off">–</td>';
          var v = cc.alloc[p.sk]; sum += v;
          var monthly = mode === "jahr" ? cc.y[p.got] : v, full = !p.will || monthly >= p.will(a) - 0.5, al = v > 0.5 ? Math.round(12 + v / max * 48) : 0;
          var paused = cc.pausiert && p.art === "gespart" && v < 0.5, vorS = !p.vor && !p.kredit && v < 0.5 && (cc.d ? cc.d.vorSpar : cc.y && cc.y.vorSpar === cc.y.monate);
          return '<td class="' + (v < 0.5 ? (paused ? "zero paused" : vorS ? "zero vor" : "zero") : full ? "full" : "part") + (cc.sel ? " sel" : "") + '" style="--al:' + al + '%"' + (paused ? ' title="pausiert wegen Kredit"' : "") + ">" + (v < 0.5 ? (paused ? "Pause" : vorS ? "noch nicht" : "–") : eur0(v).replace(" €", "")) + "</td>";
        }).join("");
        return '<tr class="art-' + p.art + (p.kredit ? " vt-kredit" : "") + '"><th class="vt-name"><span class="pot-n">' + x.nr + "</span><span><b>" + p.name + '</b><em class="muted">' + (p.kredit ? "zahlt den Kredit zurück" : p.vor ? "Freies vor dem Sparstart" : p.will ? "will " + eur0(p.will(a)) + "/Monat" : "bekommt den Rest") + "</em></span></th>" + tds + '<td class="vt-sum num">' + eur0(sum) + "</td></tr>";
      }).join("");
      note = "Was jeder Topf " + per + " bekommt. Entnahmen für Anschaffungen siehst du unter „Kontostände“.";
    } else {
      rowsDef = STOCKS.filter(function (st) { return st.k !== "schuld" || years.some(function (yy) { return yy.schuld > 0.5 || yy.wd.fehl > 0.5; }); });
      var mx = 1; rowsDef.forEach(function (st) { cols.forEach(function (cc) { if (!cc.off) mx = Math.max(mx, Math.abs(cc.stand[st.k])); }); });
      body = rowsDef.map(function (st) {
        var tds = cols.map(function (cc) {
          if (cc.off) return '<td class="off">–</td>';
          var v = cc.stand[st.k], w = st.k === "schuld" ? (cc.wd.fehl || 0) : (cc.wd[st.k] || 0), al = Math.abs(v) > 0.5 ? Math.round(10 + Math.abs(v) / mx * 45) : 0;
          var txt = Math.abs(v) < 0.5 ? "0" : eur0(Math.abs(v)).replace(" €", "");
          var mark = w > 0.5 ? '<span class="vt-wd">' + (st.k === "schuld" ? "+" : "−") + eur0(w).replace(" €", "") + "</span>" : "";
          return '<td class="' + (Math.abs(v) < 0.5 ? "zero" : "full") + (w > 0.5 ? " haswd" : "") + (cc.sel ? " sel" : "") + '" style="--al:' + al + '%">' + (st.neg && Math.abs(v) > 0.5 ? "−" : "") + txt + mark + "</td>";
        }).join("");
        return '<tr class="art-' + st.art + '"><th class="vt-name"><span class="pot-n">' + (st.neg ? "−" : "€") + "</span><span><b>" + st.name + '</b><em class="muted">' + (st.sub || (st.neg ? "Schulden" : "Stand")) + "</em></span></th>" + tds + '<td class="vt-sum"></td></tr>';
      }).join("");
      note = "Stand am Ende " + (mode === "jahr" ? "jedes Jahres" : "jedes Monats") + ". Rote Zahl darunter: so viel wurde " + per + " für Anschaffungen entnommen. Beim Kredit: so viel kam dazu.";
    }
    var evSum = 0, evTds = cols.map(function (cc) { if (cc.off) return '<td class="off">–</td>'; var v = -Math.min(0, cc.ev); evSum += v; return '<td class="' + (v > 0.5 ? "ev" : "zero") + (cc.sel ? " sel" : "") + '">' + (v > 0.5 ? "−" + eur0(v).replace(" €", "") : "–") + "</td>"; }).join("");
    body += '<tr class="vt-evrow"><th class="vt-name"><span class="pot-n">🛒</span><span><b>Anschaffungen</b><em class="muted">' + (inhalt === "ein" ? "Kosten " + per : "Kosten " + per) + "</em></span></th>" + evTds + '<td class="vt-sum num">' + (evSum ? "−" + eur0(evSum) : "") + "</td></tr>";
    return '<div class="card z-verlauf"><div class="card-head"><h2>So entwickeln sich die Töpfe</h2><div class="vt-tg">' +
      '<div class="seg seg-sm"><button class="seg-b' + (inhalt === "ein" ? " on" : "") + '" data-act="zVlInhalt" data-m="ein">Einzahlungen</button><button class="seg-b' + (inhalt === "stand" ? " on" : "") + '" data-act="zVlInhalt" data-m="stand">Kontostände</button></div>' +
      '<div class="seg seg-sm"><button class="seg-b' + (mode === "jahr" ? " on" : "") + '" data-act="zVlMode" data-m="jahr">Jahre</button><button class="seg-b' + (mode === "monat" ? " on" : "") + '" data-act="zVlMode" data-m="monat">Monate</button></div></div></div>' +
      '<div class="vt-nav">' + nav + "</div>" + '<div class="vt-wrap"><table class="vt"><thead><tr><th></th>' + head + '<th class="vt-sum">' + (inhalt === "ein" ? "Summe" : "") + "</th></tr></thead><tbody>" + body + "</tbody></table></div>" +
      '<p class="muted small">' + c.esc(note) + "</p>" + anschaffungStory(c, a, years, y) + "</div>";
  }

  /* Was bei einer Anschaffung passiert, in ganzen Sätzen */
  function anschaffungStory(c, a, years, y) {
    var eur0 = c.eur0, list = y.eventDetails || [];
    if (!list.length) return '<div class="story empty muted small">Im Jahr ' + y.jahr + " gibt es keine Anschaffung.</div>";
    var NAMES = { ng: "Notgroschen", etf: "ETF-Depot", hek: "Haus-EK", kind: "Kinder-Sparen" };
    var all = []; years.forEach(function (yy) { yy.months.forEach(function (m) { all.push({ jahr: yy.jahr, m: m }); }); });
    return '<div class="story"><h3>Was ' + y.jahr + " bei den Anschaffungen passiert</h3>" + list.map(function (d) {
      var e = c.state.fi.events[d.index] || {}, title = MONL[d.monat - 1] + " " + y.jahr + " · " + c.esc(e.beschreibung || "Anschaffung");
      if (d.betrag > 0) return '<div class="st-ev"><b>' + title + '</b><p>+' + eur0(d.betrag) + " kommen ins ETF-Depot (" + eur0(d.before.etf) + " → " + eur0(d.after.etf) + ").</p></div>";
      var order = window.BoSalFI.ORDER[d.quelle] || window.BoSalFI.ORDER.auto, rest = -d.betrag, steps = [];
      order.forEach(function (k, i) {
        var had = Math.max(0, d.before[k]), took = d.paid[k];
        if (rest < 0.5) return;
        if (had < 0.5) steps.push('<li><span class="sn">' + (i + 1) + "</span><b>" + NAMES[k] + "</b> ist leer, hier gibt es nichts.</li>");
        else steps.push('<li><span class="sn">' + (i + 1) + "</span><b>" + NAMES[k] + "</b>: " + eur0(took) + " entnommen" + (took >= had - 0.5 ? " (alles, was drin war)" : "") + ". Stand " + eur0(had) + " → " + eur0(had - took) + ". Noch offen: " + eur0(rest - took) + ".</li>");
        rest -= took;
      });
      var kredit = "";
      if (d.paid.fehl > 0.5) {
        var startIdx = all.findIndex(function (x) { return x.jahr === y.jahr && x.m.monat === d.monat; }), end = null;
        for (var i = startIdx + 1; i < all.length; i++) if (all[i].m.stand.schuld < 0.5) { end = all[i]; break; }
        kredit = '<li class="kr"><span class="sn">!</span><b>Es fehlen ' + eur0(d.paid.fehl) + ".</b> Das wird ein Kredit (" + c.fmt.format(a.fehlZins * 100).replace(/,00$/, "") + " % Zins). Bis er zurückgezahlt ist, pausieren alle Spartöpfe und zahlen ihn ab" + (end ? ": zurückgezahlt voraussichtlich im <b>" + MONL[end.m.monat - 1] + " " + end.jahr + "</b>. Danach sparen die Töpfe wieder normal." : ", das reicht bis zum Ende der Rechnung nicht.") + "</li>";
      }
      return '<div class="st-ev"><b>' + title + " · Kosten " + eur0(-d.betrag) + '</b><p class="muted small">Bezahlt in dieser Reihenfolge' + (d.quelle !== "auto" ? " (von dir gewählt)" : "") + ":</p><ol class=\"st-steps\">" + steps.join("") + kredit + "</ol></div>";
    }).join("") + "</div>";
  }

  /* ---------- Annahmen ---------- */
  function annahmen(c, a, r) {
    var src = c.state.fi, eur = c.eur;
    var groups = [
      ["Start", [["geburtsjahr", "Geburtsjahr", "j"], ["endalter", "Rechnen bis Alter", "j"], ["sparAb", "Sparen ab (leer = sofort)", "mk"]]],
      ["Startwerte im ersten Jahr: Einnahmen & Fixkosten", [["einnahmen", "Einnahmen netto / Monat", "€", src.ausMonat], ["wachstumEinnahmen", "Gehaltserhöhung pro Jahr", "%"], ["erhoehungMonat", "Gehaltserhöhung jeweils ab", "mon"], ["einnahmenDeckel", "Einnahmen höchstens", "€"], ["fixkosten", "Fixkosten / Monat", "€", src.ausMonat], ["wachstumFix", "Wachstum Fixkosten", "%"], ["fixkostenDeckel", "Fixkosten höchstens", "€"]]],
      ["Töpfe (so viel will jeder pro Monat)", [["etfMindest", "ETF-Mindestbetrag", "€"], ["lebensqualitaet", "Lebensqualität", "€"], ["kfw1Sonder", "KfW-Sondertilgung", "€"], ["autoPauschale", "Auto", "€"], ["kindSparrate", "Kinder-Sparen", "€"], ["hausEkRate", "Haus-EK", "€"], ["hausEkZiel", "Haus-EK-Ziel", "€"], ["hauskaufJahr", "Hauskauf im Jahr (leer = nie)", "j0"], ["notgroschenRate", "Notgroschen", "€"], ["notgroschenZiel", "Notgroschen-Ziel", "€"]]],
      ["Was du heute schon hast · Zinsen", [["etfStart", "ETF heute", "€"], ["notgroschenStart", "Notgroschen heute", "€"], ["hausEkStart", "Haus-EK heute", "€"], ["kindStart", "Kinder-Sparen heute", "€"], ["etfRendite", "ETF-Rendite p. a.", "%"], ["notgroschenZins", "Notgroschen-Zins p. a.", "%"], ["fehlZins", "Kreditzins, falls Geld fehlt", "%"]]],
      ["Studienkredite (laut KfW-Kontoauszug)", [["kfwStand", "Stand vom (Monat, Rate schon abgebucht)", "mk"], ["kfw1Rest", "KfW 1: Restschuld", "€"], ["kfw1Zins", "KfW 1: Zins p. a.", "%"], ["kfw1Rate", "KfW 1: Monatsrate", "€"], ["kfw1Ab", "KfW 1: Rate ab (leer = läuft)", "mk"],
        ["kfw2Rest", "KfW 2: Restschuld inkl. aufgeschobener Zinsen", "€"], ["kfw2Zins", "KfW 2: Zins p. a.", "%"], ["kfw2Rate", "KfW 2: Monatsrate", "€"], ["kfw2Ab", "KfW 2: Rate ab (leer = läuft)", "mk"]]]
    ];
    var html = '<div class="card"><div class="card-head"><h2>Deine Annahmen</h2>' + c.btn(zu.edit ? "Fertig" : "Bearbeiten", "zEdit", "", zu.edit ? "btn-primary" : "") + '</div>' +
      '<p class="muted small">Startjahr ' + r.startjahr + " und " + r.monateJahr1 + " Restmonate kommen automatisch aus dem heutigen Datum. Dein Alter rechnet sich aus dem Geburtsjahr.</p>" +
      ((src.etfStart || 0) + (src.notgroschenStart || 0) + (src.hausEkStart || 0) === 0 ? '<p class="note">Du hast noch keine Startbestände eingetragen. Trag unter „Was du heute schon hast“ dein Tagesgeld (Notgroschen) und dein Depot (ETF) ein, sonst ist der Plan zu pessimistisch.</p>' : "") +
      '<div class="ann-grid">' + groups.map(function (g) {
        return '<div class="ann-g"><h3>' + g[0] + '</h3><dl class="kv">' + g[1].map(function (f) {
          var v = f[3] ? a[f[0]] : src[f[0]], lock = f[3];
          var mkTxt = function (x) { var q = String(x).split("-"); return q[1] + "." + q[0]; };
          var shown = f[2] === "mon" ? MONL[(v || 1) - 1] : f[2] === "mk" ? (v ? mkLabel(v) : f[0] === "sparAb" ? "sofort" : f[0] === "kfwStand" ? "–" : "läuft schon") : v == null || v === "" ? "–" : f[2] === "%" ? c.fmt.format(v * 100) + " %" : f[2][0] === "j" ? String(v) : eur(v);
          var inp = '<input class="in-num" inputmode="decimal" data-act="zFi" data-k="' + f[0] + '" data-t="' + f[2] + '"' + (f[2] === "mk" ? ' placeholder="MM.JJJJ"' : "") + ' value="' + (v == null || v === "" ? "" : f[2] === "mk" ? mkTxt(v) : f[2] === "%" ? c.fmt.format(v * 100) : (f[2][0] === "j" || f[2] === "mon") ? v : c.fmt.format(v)) + '">';
          return "<div><dt>" + f[1] + (lock ? ' <em class="muted small">aus dem Monat</em>' : "") + "</dt><dd>" + (zu.edit && !lock ? inp : '<span class="num">' + shown + "</span>") + "</dd></div>";
        }).join("") + "</dl></div>";
      }).join("") + "</div>" + fromMonth(c, a) + "</div>";
    return html;
  }

  function fromMonth(c, a) {
    var src = c.state.fi, mv = monthValues(c, a), months = c.months(), eur = c.eur;
    function line(i, tag) {
      var val = Math.abs(c.sollOf(mv.mk, i));
      return '<div class="fm-i' + (zu.pick[i.id] ? "" : " off") + '"><input type="checkbox" data-act="zPick" data-id="' + i.id + '"' + (zu.pick[i.id] ? " checked" : "") + ' aria-label="mitrechnen"> <span>' + c.esc(i.beschreibung) + "</span>" + (tag || "") + '<span class="num muted">' + eur(val) + "</span></div>";
    }
    function sw(i, k, labelOn, labelOff) { return '<button class="fm-tag' + (i[k] ? " on" : "") + '" data-act="zTag" data-id="' + i.id + '" data-k="' + k + '" title="umschalten">' + (i[k] ? labelOn : labelOff) + "</button>"; }
    var ein = mv.items.filter(function (i) { return i.typ === "Einnahme"; }), fix = mv.items.filter(function (i) { return i.typ === "Fixkosten"; });
    var lohn = ein.filter(function (i) { return !i.anteilVon; }), erst = ein.filter(function (i) { return i.anteilVon; });
    var geteilt = fix.filter(function (i) { return i.geteilt; }), allein = fix.filter(function (i) { return !i.geteilt; });
    var pct = mv.geteilt ? Math.round(mv.meinGeteilt / mv.geteilt * 100) : 0;
    var body = '<div class="fm-cols"><div><h4>Deine Einnahmen</h4>' + lohn.map(function (i) { return line(i, sw(i, "anteilVon", "Anteil von anderen", "mein Geld")); }).join("") +
      '<div class="fm-sum"><span>Einnahmen netto</span>' + eur(mv.ein) + "</div>" +
      (erst.length ? '<p class="muted small fm-hint">' + erst.map(function (i) { return "„" + c.esc(i.beschreibung) + "“"; }).join(", ") + " ist kein Einkommen, sondern ein Anteil an euren gemeinsamen Kosten. Es steht deshalb rechts bei den geteilten Kosten.</p>" : "") +
      '</div><div><h4>Deine Fixkosten</h4>' +
      (geteilt.length || erst.length ? '<div class="fm-grp"><div class="fm-grp-h">Geteilte Kosten</div>' + geteilt.map(function (i) { return line(i, sw(i, "geteilt", "geteilt", "nur ich")); }).join("") +
        '<div class="fm-sub"><span>zusammen</span><span class="num">' + eur(mv.geteilt) + "</span></div>" +
        erst.map(function (i) { return line(i, sw(i, "anteilVon", "Anteil von anderen", "mein Geld")).replace('<span class="num muted">', '<span class="num muted">− '); }).join("") +
        '<div class="fm-sub fm-mine"><span>dein Anteil' + (pct ? " (" + pct + " %)" : "") + '</span><span class="num">' + eur(mv.meinGeteilt) + "</span></div></div>" : "") +
      '<div class="fm-grp"><div class="fm-grp-h">Nur deine</div>' + allein.map(function (i) { return line(i, sw(i, "geteilt", "geteilt", "nur ich")); }).join("") +
        '<div class="fm-sub"><span>zusammen</span><span class="num">' + eur(mv.allein) + "</span></div></div>" +
      '<div class="fm-sum"><span>Fixkosten (dein Anteil)</span>' + eur(mv.fix) + "</div></div></div>" +
      '<p class="muted small">Mit Häkchen wird der Posten mitgerechnet. Die kleinen Schalter sortieren um: „geteilt“ ↔ „nur ich“, „mein Geld“ ↔ „Anteil von anderen“. ' +
      "Frei pro Monat bleibt gleich. Es ändert sich, was als Einkommen wächst und was dein Erspartes später bezahlen muss.</p>";
    return '<div class="fm-box"><div class="fm-head"><b>Einnahmen & Fixkosten</b><div class="seg seg-sm"><button class="seg-b' + (src.ausMonat ? " on" : "") + '" data-act="zAus" data-v="1">aus dem Monat</button><button class="seg-b' + (!src.ausMonat ? " on" : "") + '" data-act="zAus" data-v="0">von Hand</button></div></div>' +
      (src.ausMonat ? '<div class="fm-b"><label class="fm-m"><span>Monat</span><select data-act="zSrc">' + months.map(function (m) { return '<option value="' + m + '"' + (m === mv.mk ? " selected" : "") + ">" + c.mLabel(m, true) + "</option>"; }).join("") + "</select></label>" + body +
        '<p class="muted small">Verknüpft: Änderst du im Monat einen festen Posten, ändert sich auch die Zukunft. Kredite rechnet die Zukunft über die Tilgungspläne.</p></div>'
        : '<p class="muted small fm-b">Du trägst Einnahmen und Fixkosten oben unter „Bearbeiten“ selbst ein.</p>') + "</div>";
  }

  /* ---------- Anschaffungen: jede zeigt genau, woher das Geld kommt ---------- */
  var MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  var QUELLEN = [["auto", "automatisch (Notgroschen → ETF → Haus-EK)"], ["etf", "nur ETF-Depot"], ["ng", "nur Notgroschen"], ["hek", "nur Haus-EK"], ["kind", "nur Kinder-Sparen"]];
  var TOPF = { etf: ["ETF-Depot", "var(--c-etf)"], ng: ["Notgroschen", "var(--c-ng)"], hek: ["Haus-EK", "var(--c-hek)"], kind: ["Kinder-Sparen", "var(--c-kind)"], fehl: ["Kredit (fehlt)", "var(--neg)"] };
  function events(c, a, r) {
    var src = c.state.fi, eur0 = c.eur0, list = (src.events || []).map(function (e, i) { return { e: e, i: i }; }).sort(function (x, y) { return x.e.jahr - y.e.jahr || (Number(x.e.monat) || 1) - (Number(y.e.monat) || 1) || x.i - y.i; });
    var withAmt = list.filter(function (x) { return Number(x.e.betrag); }), without = list.filter(function (x) { return !Number(x.e.betrag); });
    function detailFor(x) {
      var y = r.years.find(function (yy) { return yy.jahr === Number(x.e.jahr); });
      return y ? (y.eventDetails || []).find(function (d) { return d.index === x.i; }) : null;
    }
    function inputsRow(x) {
      return '<div class="ev-in"><select class="ev-mo" data-act="zEv" data-i="' + x.i + '" data-f="monat" aria-label="Monat">' + MONATE.map(function (m, i) { return '<option value="' + (i + 1) + '"' + ((Number(x.e.monat) || 1) === i + 1 ? " selected" : "") + ">" + m + "</option>"; }).join("") + "</select>" +
        '<input class="in-num ev-j" inputmode="numeric" data-act="zEv" data-i="' + x.i + '" data-f="jahr" value="' + x.e.jahr + '" aria-label="Jahr">' +
        '<input class="ev-t" data-act="zEv" data-i="' + x.i + '" data-f="beschreibung" value="' + c.esc(x.e.beschreibung || "") + '" aria-label="Beschreibung">' +
        '<input class="in-num" inputmode="decimal" data-act="zEv" data-i="' + x.i + '" data-f="betrag" value="' + c.fmt.format(Number(x.e.betrag) || 0) + '" aria-label="Betrag">' +
        (Number(x.e.betrag) < 0 ? '<select data-act="zEv" data-i="' + x.i + '" data-f="quelle" aria-label="Bezahlen aus">' + QUELLEN.map(function (q) { return '<option value="' + q[0] + '"' + ((x.e.quelle || "auto") === q[0] ? " selected" : "") + ">" + q[1] + "</option>"; }).join("") + "</select>" : "") +
        c.btn("✕", "zEvDel", ' data-i="' + x.i + '"', "btn-sm btn-ghost") + "</div>";
    }
    function card(x) {
      var d = detailFor(x), b = Number(x.e.betrag) || 0, body;
      if (!d) body = '<p class="muted small">Liegt außerhalb der Rechnung (' + r.years[0].jahr + "–" + r.years[r.years.length - 1].jahr + ").</p>";
      else if (b > 0) body = '<p class="small">Kommt im ' + MONATE[d.monat - 1] + " ins <b>ETF-Depot</b>: " + eur0(d.before.etf) + " → " + eur0(d.after.etf) + "</p>";
      else {
        var srcKeys = window.BoSalFI.ORDER[d.quelle] || window.BoSalFI.ORDER.auto;
        var keys = srcKeys.filter(function (k) { return d.paid[k] > 0.5 || d.quelle !== "auto"; }).concat(d.paid.fehl > 0.5 ? ["fehl"] : []);
        var shownAfter = function (k) { return d.after[k]; };
        var bar = '<div class="ev-bar">' + keys.filter(function (k) { return d.paid[k] > 0.5; }).map(function (k) { return '<span style="width:' + (d.paid[k] / -b * 100).toFixed(1) + "%;background:" + TOPF[k][1] + '" title="' + TOPF[k][0] + " " + eur0(d.paid[k]) + '"></span>'; }).join("") + "</div>";
        var rows = keys.map(function (k) {
          return "<tr><td><i style=\"background:" + TOPF[k][1] + '"></i>' + TOPF[k][0] + '</td><td class="num">' + eur0(d.paid[k]) + "</td><td class=\"num muted\">" + (k === "fehl" ? "wird ein Kredit" : eur0(d.before[k]) + " → " + eur0(shownAfter(k)) + (d.before[k] < 0.5 ? " (leer)" : "")) + "</td></tr>";
        }).join("");
        body = bar + '<table class="ev-tbl"><thead><tr><th>bezahlt aus</th><th>Betrag</th><th>Stand ' + MONATE[d.monat - 1] + " " + x.e.jahr + ": vorher → nachher</th></tr></thead><tbody>" + rows + "</tbody></table>" +
          (d.paid.fehl > 0.5 ? '<p class="note">' + eur0(d.paid.fehl) + " fehlen im " + MONATE[d.monat - 1] + " " + x.e.jahr + ". Das wird ein Kredit. Bis er zurückgezahlt ist, pausieren alle Spartöpfe (Details unter „So entwickeln sich die Töpfe“).</p>" : "");
      }
      return '<li class="ev-card' + (d && d.paid.fehl > 0.5 ? " warn" : "") + '">' + inputsRow(x) + body + "</li>";
    }
    return '<div class="card"><div class="card-head"><h2>Anschaffungen</h2><span class="muted small">Monat, Jahr, Kosten mit Minus, z. B. −20.000 für ein Auto</span></div>' +
      '<p class="muted small">Bezahlt wird im gewählten Monat, nachdem die Sparraten dieses Monats eingezahlt sind. Es gibt nur <b>ein</b> ETF-Depot: Die Töpfe 1 (ETF-Mindestbetrag) und 8 (ETF-Rest) zahlen beide dort ein. Wird der Notgroschen angezapft, füllt er sich in den Monaten danach wieder auf.</p>' +
      '<ul class="ev-cards">' + withAmt.map(card).join("") + "</ul>" +
      (without.length ? '<details class="ev-empty" data-pp="evEmpty"' + (zu.open.evEmpty ? " open" : "") + '><summary>' + without.length + " Anschaffungen ohne Betrag (zählen nicht)</summary><ul class=\"ev-cards\">" + without.map(function (x) { return '<li class="ev-card">' + inputsRow(x) + "</li>"; }).join("") + "</ul></details>" : "") +
      c.btn("＋ Anschaffung", "zEvAdd", "", "btn-sm") + "</div>";
  }

  /* ---------- Was korrigiert wurde: alt gegen neu, live ---------- */
  function korrekturen(c, a, r, old) {
    var L = c.L, eur0 = c.eur0, src = c.state.fi;
    function runNew(mod) { var b = clone(a); if (mod) mod(b); return window.BoSalFI.run(b); }
    function runOld(mod) { var b = clone(src); if (mod) mod(b); return L.runFI(b); }
    function t(rows) { return '<table class="pp-tbl"><thead><tr><th></th><th>vorher</th><th>jetzt</th></tr></thead><tbody>' + rows.map(function (x) { return "<tr><td>" + x[0] + '</td><td class="num">' + x[1] + '</td><td class="num">' + x[2] + "</td></tr>"; }).join("") + "</tbody></table>"; }
    var evY = r.startjahr + 2;
    var o3 = runOld(function (b) { b.events = [{ jahr: evY, betrag: -20000 }]; }), n3 = runNew(function (b) { b.events = [{ jahr: evY, monat: 12, betrag: -20000 }]; });
    var n3b = runNew(function (b) { b.events = []; }), o3b = runOld(function (b) { b.events = []; });
    function at(rr, j) { return rr.years.find(function (y) { return y.jahr === j; }) || { vermoegen: 0 }; }
    var lostOld = 0, pH = src.hausEkStart || 0, pN = src.notgroschenStart || 0;
    old.years.forEach(function (y) { lostOld += pH + y.allocHausEk * y.monate - y.hausEk + pN * (1 + src.notgroschenZins) + y.allocNotgroschen * y.monate - y.notgroschen; pH = y.hausEk; pN = y.notgroschen; });
    var oldFiRow = old.years.find(function (y) { return y.jahr === old.fiJahr; }) || {};
    var fiRow = r.years.find(function (y) { return y.jahr === r.fiJahr; }) || r.years[r.years.length - 1];
    var items = [
      ["FI-Test misst deinen ganzen Lebensbedarf", "Nur die Fixkosten zählten, Lebensqualität und Auto nicht.", "Du wählst in Schritt 4, was dein Erspartes später bezahlen soll. Standard: Fixkosten + Lebensqualität + Auto.",
        t([["Laufende Kosten pro Monat (letztes Jahr)", eur0(old.years[old.years.length - 1].fixkosten), eur0(r.years[r.years.length - 1].bedarf)], ["Gebrauchtes Erspartes", eur0(old.years[old.years.length - 1].fixkosten * 12 / 0.04), eur0(r.years[r.years.length - 1].bedarf * 12 / 0.04)]])],
      ["Haus-EK zählt nicht mehr zur Freiheit", "Das Haus-Geld zählte beim FI-Test mit und blieb für immer liegen.", "Haus-EK und Kinder-Sparen sind zweckgebunden und zählen nicht mit. Optional: ein Kaufjahr, dann wird das Haus-EK eingesetzt.",
        t([["Haus-EK im FI-Jahr mitgezählt", eur0(oldFiRow.hausEk || 0), "0 €"], ["Kaufjahr", "–", src.hauskaufJahr || "nicht gesetzt"]])],
      ["Anschaffungen werden voll verrechnet", "Ein Ereignis wurde ÷ 12 vom Freien abgezogen, teils nur für die Restmonate, und kürzte Lebensqualität und Auto. Der Rest verschwand.", "Der volle Betrag wird im gewählten Monat vom Ersparten abgezogen: Notgroschen, dann ETF, dann Haus-EK (pro Anschaffung änderbar). Reicht es nicht, wird der Rest ein Kredit und alle Spartöpfe pausieren, bis er zurückgezahlt ist.",
        t([["Test: −20.000 € im Jahr " + evY + " → Vermögen sinkt um", eur0(at(o3b, evY).vermoegen - at(o3, evY).vermoegen), eur0(at(n3b, evY).vermoegen - at(n3, evY).vermoegen)]])],
      ["Kinder-Sparen ist ein echter Topf", "Die „Kind-Sparrate“ wurde jeden Monat ausgegeben.", "Auto bleibt eine Ausgabe, Kinder-Sparen wird angespart und hat einen Stand.",
        t([["Kinder-Sparen im FI-Jahr", "0 €", eur0(fiRow.kind)]])],
      ["Startbestände", "Alles startete bei 0 €, ohne Hinweis.", "Die Rechnung ist gleich, aber BoSal weist dich auf fehlende Startbestände hin. Dazu kommt das Feld „Kinder-Sparen heute“.",
        t([["Vermögen heute", eur0(old.vermoegenHeute), eur0(r.vermoegenHeute)]])],
      ["Einnahmen und Fixkosten kommen aus dem Monat", "Die Zukunft hatte eigene Zahlen, die nicht zum Monat passten.", "Standard: verknüpft mit einem Monat, du hakst ab, welche Posten zählen. „Von Hand“ geht weiterhin.",
        t([["Einnahmen / Monat", eur0(src.einnahmen), eur0(a.einnahmen)], ["Fixkosten / Monat", eur0(src.fixkosten), eur0(a.fixkosten)]])],
      ["Startjahr und Monate folgen dem Kalender", "Startjahr " + src.startjahr + " mit " + src.monateJahr1 + " Monaten war fest eingetragen.", "Startjahr und Restmonate kommen aus dem heutigen Datum, das Alter aus dem Geburtsjahr.",
        t([["Startjahr / Monate", src.startjahr + " / " + src.monateJahr1, r.startjahr + " / " + r.monateJahr1]])],
      ["Deckel nie unter dem Startwert", "Lag ein Startwert über dem Deckel, fiel er im 2. Jahr plötzlich auf den Deckel.", "Ein Deckel begrenzt nur das Wachstum. Liegt der Startwert darüber, bleibt er stehen.",
        t([["Fixkosten im 2. Jahr bei Startwert " + eur0(a.fixkosten), eur0(Math.min(src.fixkostenDeckel, a.fixkosten * (1 + src.wachstumFix))), eur0(r.years[1] ? r.years[1].fixkosten : 0)]])],
      ["Kein Geld verschwindet beim Erreichen eines Ziels", "Im Jahr, in dem Haus-EK oder Notgroschen das Ziel erreichten, bekamen sie trotzdem den vollen Betrag. Der Überschuss war weg.", "Ein Topf bekommt nur, was bis zum Ziel fehlt. Der Rest fließt in die nächsten Töpfe.",
        t([["Verschwundenes Geld über alle Jahre", eur0(lostOld), "0 €"]])],
      ["KfW-Kredite mit Zinsen", "Die ganze Rate zählte als Tilgung, Zinsen gab es nicht. Die Raten kamen aus einem Plan pro Jahr.", "Stand, Zins und Rate kommen aus dem Kontoauszug. Jeden Monat kommen Zinsen dazu (Saldo × Zins ÷ 12, wie bei der KfW), die Rate geht ab. Bei KfW 2 wachsen die Zinsen weiter, bis die Rate startet.",
        t([["KfW-Zinsen insgesamt", "0 €", eur0(r.years.reduce(function (s2, y) { return s2 + y.kfwZins; }, 0))], ["KfW 1 abbezahlt", payoff(old, "kfw1"), payoff(r, "kfw1")], ["KfW 2 abbezahlt", payoff(old, "kfw2"), payoff(r, "kfw2")]])]
    ];
    function payoff(rr, k) { var y0 = rr.years.find(function (y) { return y[k] > -0.5; }); return y0 ? String(y0.jahr) : "nicht bis " + rr.years[rr.years.length - 1].jahr; }
    return '<div class="card"><h2>Was gegenüber der alten Rechnung korrigiert ist</h2>' +
      '<div class="kz-sum"><div><span class="muted small">alte Rechnung</span><b>' + (old.fiJahr || "–") + "</b><span class=\"muted small\">mit " + old.fiAlter + '</span></div><span class="kz-arrow">→</span><div><span class="muted small">korrigiert</span><b>' + (r.fiJahr || "nie") + '</b><span class="muted small">' + (r.fiAlter ? "mit " + r.fiAlter : "bis " + r.years[r.years.length - 1].jahr) + "</span></div></div>" +
      '<div class="pp-list">' + items.map(function (x, i) {
        return '<details class="pp kz"' + (zu.open[i] ? " open" : "") + ' data-pp="' + i + '"><summary><span class="pp-n">' + (i + 1) + '</span><span class="pp-t">' + x[0] + '</span><span class="pp-k ok">korrigiert</span></summary>' +
          '<div class="pp-b"><div class="pp-col"><h4>Vorher</h4><p>' + x[1] + '</p></div><div class="pp-col"><h4>Jetzt</h4><p>' + x[2] + '</p></div><div class="pp-col"><h4>Beispiel</h4>' + x[3] + "</div></div></details>";
      }).join("") + "</div></div>";
  }

  /* ---------- Diagramme (unverändert, Überarbeitung folgt) ---------- */
  function scale(years, vals) {
    var W = 640, H = 220, P = 30, minY = Math.min(0, Math.min.apply(null, vals)), maxY = Math.max.apply(null, vals);
    return { W: W, H: H, P: P, minY: minY, maxY: maxY, X: function (i) { return P + (i / (years.length - 1)) * (W - P * 2); }, Y: function (v) { return H - P - ((v - minY) / (maxY - minY || 1)) * (H - P * 2); } };
  }
  function marks(s, years, sel, fiJ) {
    var out = "", si = years.findIndex(function (y) { return y.jahr === sel; }), fi = years.findIndex(function (y) { return y.jahr === fiJ; });
    if (fi >= 0) out += '<line class="ch-fi" x1="' + s.X(fi) + '" x2="' + s.X(fi) + '" y1="' + s.P + '" y2="' + (s.H - s.P) + '"/><text class="ch-lbl" x="' + (s.X(fi) + 6) + '" y="' + (s.P + 4) + '">frei ' + fiJ + "</text>";
    if (si >= 0) out += '<line class="ch-sel" x1="' + s.X(si) + '" x2="' + s.X(si) + '" y1="' + s.P + '" y2="' + (s.H - s.P) + '"/>';
    [0, Math.floor((years.length - 1) / 2), years.length - 1].forEach(function (i) { out += '<text class="ch-x" x="' + s.X(i) + '" y="' + (s.H - 8) + '" text-anchor="middle">' + years[i].jahr + "</text>"; });
    if (s.minY < 0) out += '<line class="ch-zero" x1="' + s.P + '" x2="' + (s.W - s.P) + '" y1="' + s.Y(0) + '" y2="' + s.Y(0) + '"/>';
    return out;
  }
  function stackChart(years, sel, fiJ) {
    var tops = years.map(function (y) { return Math.max(0, y.notgroschen) + y.kind + y.hausEk + Math.max(0, y.etf); }), bots = years.map(function (y) { return y.kfw1 + y.kfw2 + Math.min(0, y.etf); });
    var s = scale(years, tops.concat(bots));
    function area(lo, hi, cls) {
      var up = years.map(function (y, i) { return s.X(i).toFixed(1) + " " + s.Y(hi(y)).toFixed(1); }), dn = years.map(function (y, i) { return s.X(i).toFixed(1) + " " + s.Y(lo(y)).toFixed(1); }).reverse();
      return '<path class="' + cls + '" d="M' + up.join(" L") + " L" + dn.join(" L") + ' Z"/>';
    }
    var ng = function (y) { return Math.max(0, y.notgroschen); }, k = function (y) { return ng(y) + y.kind; }, h = function (y) { return k(y) + y.hausEk; };
    return '<svg class="chart z-chart" viewBox="0 0 ' + s.W + " " + s.H + '" preserveAspectRatio="none" role="img" aria-label="Vermögensentwicklung">' +
      area(function () { return 0; }, ng, "a-ng") + area(ng, k, "a-kind") + area(k, h, "a-hek") + area(h, function (y) { return h(y) + Math.max(0, y.etf); }, "a-etf") +
      area(function (y) { return y.kfw1 + y.kfw2 + Math.min(0, y.etf); }, function () { return 0; }, "a-kfw") + marks(s, years, sel, fiJ) + "</svg>";
  }
  function fiChart(years, sel, fiJ) {
    var e = years.map(function (y) { return Math.max(0, y.fiCap * 0.04); }), b = years.map(function (y) { return y.bedarf * 12; });
    var s = scale(years, e.concat(b));
    function line(vals, cls) { return '<path class="' + cls + '" d="' + vals.map(function (v, i) { return (i ? "L" : "M") + s.X(i).toFixed(1) + " " + s.Y(v).toFixed(1); }).join(" ") + '"/>'; }
    return '<svg class="chart z-chart" viewBox="0 0 ' + s.W + " " + s.H + '" preserveAspectRatio="none" role="img" aria-label="FI-Test">' + line(b, "l-bedarf") + line(e, "l-ertrag") + marks(s, years, sel, fiJ) + "</svg>";
  }

  /* ---------- Ereignisse ---------- */
  function handle(c, act, d) {
    var a = c.state.fi; ensure(a);
    if (act === "zSetYear") { zu.year = +d.y; zu.vlStart = null; return true; }
    if (act === "zEdit") { zu.edit = !zu.edit; return true; }
    if (act === "zVlMode") { zu.vlMode = d.m; return true; }
    if (act === "zVl") { zu.vlStart = +d.s; return true; }
    if (act === "zVlInhalt") { zu.vlInhalt = d.m; return true; }
    if (act === "zAus") { c.mark("Quelle für Startwerte geändert"); if (d.v === "0" && a.ausMonat) { var mv = monthValues(c, a); a.einnahmen = mv.ein; a.fixkosten = mv.fix; } a.ausMonat = d.v === "1"; return true; }
    if (act === "zSparSofort") { c.mark("Sparstart: sofort"); a.sparAb = null; return true; }
    if (act === "zTag") { var it = c.state.expected.find(function (x) { return x.id === d.id; }); c.mark("Posten umsortiert"); it[d.k] = !it[d.k]; return true; }
    if (act === "zEvAdd") { c.mark("Anschaffung hinzugefügt"); (a.events = a.events || []).push({ jahr: new Date().getFullYear() + 1, monat: 1, beschreibung: "Neue Anschaffung", betrag: -1000 }); return true; }
    if (act === "zEvDel") { c.mark("Anschaffung gelöscht"); a.events.splice(+d.i, 1); return true; }
    return false;
  }
  function change(c, el) {
    var a = c.state.fi, act = el.dataset.act; ensure(a);
    if (act === "zYear") { zu.year = +el.value; zu.vlStart = null; return true; }
    if (act === "zSrc") { zu.src = el.value; return true; }
    if (act === "zPick") { zu.pick[el.dataset.id] = el.checked; return true; }
    if (act === "zBed") { c.mark("Lebensbedarf geändert"); a.fiBedarf[el.dataset.k] = el.checked; return true; }
    if (act === "zEv") {
      var e = a.events[+el.dataset.i], f = el.dataset.f; c.mark("Anschaffung geändert");
      if (f === "beschreibung" || f === "quelle") e[f] = el.value; else { var n2 = c.parseNum(el.value); if (!isNaN(n2)) e[f] = f === "jahr" || f === "monat" ? Math.round(n2) : n2; }
      return true;
    }
    if (act === "zMk") {
      var cur = a[el.dataset.k] ? String(a[el.dataset.k]).split("-") : [String(new Date().getFullYear()), String(new Date().getMonth() + 1)];
      var val = parseInt(el.value, 10); if (isNaN(val)) return true;
      if (el.dataset.part === "m") cur[1] = String(val); else { if (val < 2000 || val > 2100) return true; cur[0] = String(val); }
      c.mark("Sparstart geändert"); a[el.dataset.k] = cur[0] + "-" + String(+cur[1]).padStart(2, "0"); return true;
    }
    if (act === "zFi") {
      var t = el.dataset.t, raw = el.value.trim();
      if (t === "mon") { var mo = Math.round(c.parseNum(raw)); if (mo >= 1 && mo <= 12) { c.mark("Annahme geändert"); a.erhoehungMonat = mo; } return true; }
      if (t === "mk") {
        if (raw === "") { c.mark("Annahme geändert"); a[el.dataset.k] = el.dataset.k === "kfwStand" ? a.kfwStand : null; return true; }
        var mm = raw.match(/^(\d{1,2})\D+(\d{4})$/); if (!mm || +mm[1] < 1 || +mm[1] > 12) return true;
        c.mark("Annahme geändert"); a[el.dataset.k] = mm[2] + "-" + String(+mm[1]).padStart(2, "0"); return true;
      }
      if (t === "j0" && raw === "") { c.mark("Annahme geändert"); a[el.dataset.k] = null; return true; }
      var n = c.parseNum(raw); if (isNaN(n)) return true;
      if (t === "%") n = n / 100; if (t[0] === "j") n = Math.round(n);
      c.mark("Annahme geändert"); a[el.dataset.k] = n; return true;
    }
    return false;
  }
  window.BoSalZukunft = { render: render, handle: handle, change: change, zu: zu };
})();
