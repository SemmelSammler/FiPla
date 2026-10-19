/* BoSal — Zukunft mit der korrigierten Rechnung (fiplan.js). Die alte Rechnung (Logic.runFI)
   läuft nur noch zum Vergleich mit. */
(function () {
  "use strict";
  var zu = { year: null, edit: false, open: {}, src: null, pick: null, vlMode: "monat", vlStart: null, vlInhalt: "stand", vtMonat: null };
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

    /* Schritt 3 */
    var ev = y.events, pd = y.eventPaid;
    var evTxt = ev < 0 ? "bezahlt aus " + [pd.etf ? "ETF-Depot " + eur0(pd.etf) : "", pd.ng ? "Notgroschen " + eur0(pd.ng) : "", pd.hek ? "Haus-EK " + eur0(pd.hek) : "", pd.kind ? "Kinder-Sparen " + eur0(pd.kind) : "", pd.fehl ? "⚠ Kredit " + eur0(pd.fehl) : ""].filter(Boolean).join(", ") : ev > 0 ? "kommt in den ETF" : "";
    var s3 = step(null, "Wie wächst dein Vermögen?", "Bestände am Ende jedes Jahres",
      stackChart(years, zu.year, r.fiJahr) +
      '<div class="z-legend small"><span><i style="background:var(--c-etf)"></i>ETF (+' + pct(a.etfRendite) + ')</span><span><i style="background:var(--c-hek)"></i>Haus-EK</span><span><i style="background:var(--c-kind)"></i>Kinder-Sparen</span><span><i style="background:var(--c-ng)"></i>Notgroschen</span><span><i style="background:var(--c-kfw)"></i>KfW-Schulden</span></div>' +
      '<ul class="calc">' + (ev ? row("Anschaffungen " + y.jahr, ev, evTxt) : "") + row("Für die Freiheit (Notgroschen + ETF)", y.fiCap) + row("Zweckgebunden (Haus-EK + Kinder-Sparen)", y.hausEk + y.kind) + row("KfW-Schulden", y.kfw1 + y.kfw2) + (y.schuld > 0.5 ? row("Offener Kredit aus Anschaffungen", -y.schuld) : "") +
      '<li class="calc-total"><span>Vermögen Ende ' + y.jahr + "</span>" + money(y.vermoegen) + "</li></ul>");

    /* Schritt 4 */
    var cap = y.fiCap, ertrag = cap * 0.04, bedarf = y.bedarf * 12, ok = ertrag >= bedarf, p4 = Math.max(0, Math.min(1, ertrag / bedarf));
    var bed = a.fiBedarf;
    var s4 = step(null, "Wann bist du frei?", "Die Idee in einem Satz: Dein Erspartes bezahlt deine laufenden Kosten, ohne dass es weniger wird",
      '<div class="z-explain"><p><b>Die Faustregel:</b> Von deinem Ersparten darfst du jedes Jahr <b>4 %</b> nehmen. Weil das Geld weiter Zinsen bringt, wird es dadurch auf lange Sicht nicht weniger.</p><p><b>Frei bist du</b>, sobald diese 4 % deine laufenden Kosten fürs ganze Jahr bezahlen. Haus-EK und Kinder-Sparen zählen nicht mit, das Geld ist für etwas anderes gedacht.</p></div>' +
      '<div class="z-bedarf"><span class="small"><b>Was soll dein Erspartes später bezahlen?</b></span><label class="chk2"><input type="checkbox" checked disabled> Fixkosten</label>' +
      '<label class="chk2"><input type="checkbox" data-act="zBed" data-k="lq"' + (bed.lq ? " checked" : "") + "> Lebensqualität (" + eur0(a.lebensqualitaet) + ")</label>" +
      '<label class="chk2"><input type="checkbox" data-act="zBed" data-k="auto"' + (bed.auto ? " checked" : "") + "> Auto (" + eur0(a.autoPauschale) + ")</label></div>" +
      '<div class="z-prog"><div class="z-prog-top"><span><b>' + y.jahr + ":</b> dein Erspartes deckt " + Math.round(p4 * 100) + ' % deiner laufenden Kosten</span><b class="' + (ok ? "pos" : "") + '">' + (ok ? "frei ✓" : "noch nicht frei") + '</b></div><div class="z-prog-bar"><span style="width:' + (p4 * 100).toFixed(1) + '%"></span></div></div>' +
      '<ul class="calc">' + row("Dein Erspartes für die Freiheit", cap, "Notgroschen + ETF" + (y.schuld > 0.5 ? " − offener Kredit" : "")) + row("4 % davon: so viel darfst du pro Jahr nehmen", ertrag, "= " + eur0(ertrag / 12) + " pro Monat") + row("Deine laufenden Kosten fürs ganze Jahr", -bedarf, eur0(y.bedarf) + " × 12 Monate") +
      '<li class="calc-total ' + (ok ? "ok" : "") + '"><span>' + (ok ? "Reicht, du bist frei" : "Reicht noch nicht") + "</span>" + (ok ? money(ertrag - bedarf) : '<span class="num neg">es fehlen ' + eur0(bedarf - ertrag) + " pro Jahr</span>") + "</li></ul>" +
      '<p class="muted small">Damit es reicht, brauchst du ' + eur0(bedarf / 0.04) + " Erspartes für die Freiheit.</p>" + fiChart(years, zu.year, r.fiJahr) +
      '<div class="z-legend small"><span><i style="background:var(--accent)"></i>so viel darfst du pro Jahr nehmen (4 %)</span><span><i style="background:var(--neg)"></i>so viel kosten deine laufenden Kosten pro Jahr</span></div>');

    return '<h1 class="page-t">Zukunft</h1><p class="lead muted">Wann bist du finanziell frei, und wie kommst du dahin? Oben wählst du das Jahr, alles darunter zeigt dieses Jahr.</p>' +
      '<div class="z-stack"><div class="z-top">' + hero + slider + "</div>" + freiCard(c, a, y, first) + topfCard(c, a, years, r.fiJahr) + events(c, a, r) + annahmen(c, a, r) +
      '<div class="z-pair">' + s3 + s4 + "</div>" + verteilungCard(c, a, y) + "</div>";

    function row(label, v, hint) { return "<li><span>" + label + (hint ? ' <em class="muted">' + esc(hint) + "</em>" : "") + "</span>" + money(v) + "</li>"; }
    function pct(v) { return c.fmt.format(v * 100).replace(/,00$/, "") + " %"; }
  }
  function pctTxt(c, v) { return c.fmt.format(v * 100).replace(/,00$/, "") + " %"; }

  /* ---------- Was ist pro Monat frei? Gleiche Aufteilung wie in den Annahmen ---------- */
  function freiCard(c, a, y, first) {
    var eur = c.eur, eur0 = c.eur0, esc = c.esc, mv = a.ausMonat ? monthValues(c, a) : null;
    var fF = a.fixkosten ? y.fixkosten / a.fixkosten : 1;           // Wachstum der Fixkosten seit dem Start
    function li(label, v, hint, cls) { return '<li class="' + (cls || "") + '"><span>' + label + (hint ? '<em class="muted">' + esc(hint) + "</em>" : "") + '</span><span class="num">' + eur(v) + "</span></li>"; }
    function names(list) { return list.map(function (i) { return i.beschreibung; }).join(", "); }
    function box(title, items, sumLabel, sum, foot) { return '<div class="zf-box"><h3>' + title + '</h3><ul class="zf-l">' + items + '</ul><div class="zf-sum"><span>' + sumLabel + '</span><span class="num">' + eur(sum) + "</span></div>" + (foot ? '<p class="muted small">' + esc(foot) + "</p>" : "") + "</div>"; }
    var on = mv ? mv.items.filter(function (i) { return zu.pick[i.id]; }) : [];
    var lohn = on.filter(function (i) { return i.typ === "Einnahme" && !i.anteilVon; }), erst = on.filter(function (i) { return i.typ === "Einnahme" && i.anteilVon; });
    var get = on.filter(function (i) { return i.typ === "Fixkosten" && i.geteilt; }), allein = on.filter(function (i) { return i.typ === "Fixkosten" && !i.geteilt; });
    var bisM = MONL[(a.erhoehungMonat + 10) % 12], abM = MONL[a.erhoehungMonat - 1], lohnN = lohn.length ? names(lohn) : "Einnahmen netto";
    var einItems = y.erhoehung ? li(esc(lohnN) + " bis " + bisM, y.einnVor) + li(esc(lohnN) + " ab " + abM, y.einnNach, "+" + pctTxt(c, a.wachstumEinnahmen) + " Gehaltserhöhung") : li(esc(lohnN), y.einnahmen, y.jahr === first ? (mv ? "aus " + c.mLabel(mv.mk, true) : "von Hand eingetragen") : "Deckel " + eur0(Math.max(a.einnahmenDeckel, a.einnahmen)) + " erreicht");
    var ein = box("Deine Einnahmen", einItems, y.erhoehung ? "im Schnitt " + y.jahr : "pro Monat", y.einnahmen, erst.length ? names(erst) + " zählt nicht als Einkommen, sondern senkt eure geteilten Kosten." : "");
    var fixItems = mv && (get.length || erst.length) ?
      li("Geteilte Kosten", mv.geteilt * fF, names(get)) + li("− Anteil von anderen", -mv.erst * fF, names(erst)) + li("= dein Anteil", mv.meinGeteilt * fF, mv.geteilt ? Math.round(mv.meinGeteilt / mv.geteilt * 100) + " % der geteilten Kosten" : "", "zf-mine") + li("Nur deine", mv.allein * fF, allein.length + " Posten")
      : li("Fixkosten", y.fixkosten, mv ? "aus " + c.mLabel(mv.mk, true) : "von Hand eingetragen");
    var fix = box(mv && (get.length || erst.length) ? "Deine Fixkosten (dein Anteil)" : "Fixkosten", fixItems, "pro Monat", y.fixkosten, y.jahr > first ? "+" + pctTxt(c, a.wachstumFix) + " pro Jahr seit " + first + ", höchstens " + eur0(Math.max(a.fixkostenDeckel, a.fixkosten)) : "");
    var k1Weg = y.kfw1 > -0.5, k2Weg = y.kfw2 > -0.5;
    var kfwItems = li("KfW 1", y.kfw1Pfl, (k1Weg ? (y.kfw1Pfl > 0.5 ? "im Schnitt, abbezahlt " + y.jahr : "abbezahlt") : pctTxt(c, a.kfw1Zins) + " Zins")) +
      li("KfW 2", y.kfw2Pfl, k2Weg ? (y.kfw2Pfl > 0.5 ? "im Schnitt, abbezahlt " + y.jahr : "abbezahlt") : y.kfw2Pfl > 0.5 ? pctTxt(c, a.kfw2Zins) + " Zins" + (y.kfw2Pfl < (a.kfw2Rate || 0) - 0.5 ? ", Rate ab " + mkLabel(a.kfw2Ab) : "") : "noch keine Rate, ab " + (mkLabel(a.kfw2Ab) || "?"));
    var kfw = box("KfW-Raten", kfwItems, "pro Monat", y.kfw1Pfl + y.kfw2Pfl, y.kfwZins > 0.5 ? "Davon Zinsen " + y.jahr + ": " + eur0(y.kfwZins) + " im Jahr. Der Rest tilgt." : "");
    return '<section class="card z-frei"><div class="card-head"><div><h2>Was ist pro Monat frei?</h2><p class="muted small">Im Jahr ' + y.jahr + (y.monate < 12 ? ", noch " + y.monate + " Monate ab heute" : "") + ". Gleiche Aufteilung wie unter „Deine Annahmen“.</p></div></div>" +
      '<div class="zf-grid">' + ein + fix + kfw + "</div>" +
      '<div class="zf-total"><span class="num">' + eur(y.einnahmen) + " − " + eur(y.fixkosten) + " − " + eur(y.kfw1Pfl + y.kfw2Pfl) + '</span><span>= <b class="num pos">' + eur(y.frei) + "</b> frei pro Monat</span></div>" +
      '<p class="muted small">Anschaffungen stecken hier nicht drin. Sie werden im jeweiligen Monat vom Ersparten bezahlt (Karte „Anschaffungen“).</p></section>';
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
    return '<section class="card z-step"><div class="z-step-h">' + (n ? '<span class="z-n">' + n + "</span>" : "") + '<div><h2>' + title + '</h2><p class="muted small">' + sub + "</p></div></div>" + body + "</section>";
  }

  /* ---------- Deine Töpfe: gleiche Zeilen für Kontostände und Einzahlungen ---------- */
  var ROWS = [
    { g: "Gespart" },
    { nr: "1", name: "ETF-Depot", art: "gespart", ein: function (al) { return al.etfMin + al.etfRest; }, st: "etf", wd: "etf", subE: function (a, e) { return "mind. " + e(a.etfMindest) + ", dazu der Rest"; }, subS: function (a) { return "mit " + Math.round(a.etfRendite * 100) + " % Rendite"; } },
    { nr: "2", name: "Notgroschen", art: "gespart", ein: function (al) { return al.notgroschen; }, st: "ng", wd: "ng", will: "notgroschenRate", ziel: "notgroschenZiel" },
    { nr: "3", name: "Haus-EK", art: "gespart", ein: function (al) { return al.hausEk; }, st: "hek", wd: "hek", will: "hausEkRate", ziel: "hausEkZiel" },
    { nr: "4", name: "Kinder-Sparen", art: "gespart", ein: function (al) { return al.kind; }, st: "kind", wd: "kind", will: "kindSparrate" },
    { g: "Schulden" },
    { nr: "5", name: "KfW-Studienkredite", art: "getilgt", ein: function (al) { return al.sonder; }, st: "kfw", neg: true, subE: function (a, e) { return "Sondertilgung, will " + e(a.kfw1Sonder); }, subS: function () { return "Restschuld KfW 1 + 2"; } },
    { nr: "!", name: "Kredit aus Anschaffungen", art: "ausgegeben", ein: function (al) { return al.kredit; }, st: "schuld", neg: true, only: "kredit", subE: function () { return "Rückzahlung"; }, subS: function () { return "noch offen"; } },
    { g: "Ausgegeben" },
    { nr: "6", name: "Lebensqualität", art: "ausgegeben", ein: function (al) { return al.lebensqual; }, will: "lebensqualitaet", none: "wird jeden Monat ausgegeben, kein Kontostand" },
    { nr: "7", name: "Auto", art: "ausgegeben", ein: function (al) { return al.auto; }, will: "autoPauschale", none: "wird jeden Monat ausgegeben, kein Kontostand" },
    { nr: "–", name: "Nicht verplant", art: "frei", ein: function (al) { return al.unverplant; }, only: "vor", subE: function () { return "vor dem Sparstart"; }, subS: function () { return "vor dem Sparstart"; }, none: "zählt nicht zum Vermögen" }
  ];
  function topfCard(c, a, years, fiJ) {
    var eur0 = c.eur0, mode = zu.vlMode, inhalt = zu.vlInhalt, cols, head, nav;
    var y = years.find(function (x) { return x.jahr === zu.year; }), n0 = function (v) { return eur0(v).replace(" €", ""); };
    if (mode === "jahr") {
      var first = years[0].jahr, last = years[years.length - 1].jahr, start = zu.vlStart != null ? zu.vlStart : zu.year - ((zu.year - first) % 10);
      start = Math.max(first, Math.min(start, last - 9));
      cols = years.filter(function (x) { return x.jahr >= start && x.jahr < start + 10; }).map(function (x) {
        return { label: x.jahr, sel: x.jahr === zu.year, fi: x.jahr === fiJ, y: x, alloc: x.sums, wd: x.wd, ev: x.events, pausiert: x.months.some(function (m) { return m.pausiert; }), vor: x.vorSpar === x.monate,
          stand: { kind: x.kind, hek: x.hausEk, ng: x.notgroschen, etf: x.etf, schuld: x.schuld, kfw: x.kfw1 + x.kfw2 } };
      });
      head = cols.map(function (x) { return '<th class="' + (x.sel ? "sel" : "") + '"><button class="linkrow" data-act="zSetYear" data-y="' + x.label + '">' + x.label + (x.fi ? "<em>frei</em>" : "") + "</button></th>"; }).join("");
      nav = c.btn("‹ früher", "zVl", ' data-s="' + (start - 10) + '"', "btn-sm") + '<span class="muted small">' + start + "–" + Math.min(last, start + 9) + "</span>" + c.btn("später ›", "zVl", ' data-s="' + (start + 10) + '"', "btn-sm");
    } else {
      cols = MON.map(function (m, i) {
        var d = y.months.find(function (mm) { return mm.monat === i + 1; });
        return d ? { label: m, d: d, alloc: d.alloc, wd: d.wd, ev: d.events, pausiert: d.pausiert, vor: d.vorSpar, stand: d.stand } : { label: m, off: true };
      });
      head = cols.map(function (x) { return "<th" + (x.off ? ' class="off"' : "") + ">" + x.label + "</th>"; }).join("");
      nav = c.btn("‹ " + (zu.year - 1), "zSetYear", ' data-y="' + (zu.year - 1) + '"', "btn-sm") + "<b>" + zu.year + "</b>" + c.btn((zu.year + 1) + " ›", "zSetYear", ' data-y="' + (zu.year + 1) + '"', "btn-sm");
    }
    var per = mode === "jahr" ? "im Jahr" : "im Monat", nCols = cols.length + 2;
    var used = { kredit: years.some(function (yy) { return yy.sums.kredit > 0.5 || yy.schuld > 0.5; }), vor: years.some(function (yy) { return yy.sums.unverplant > 0.5; }) };
    var rows = ROWS.filter(function (rw) { return !rw.only || used[rw.only]; });
    var mx = 1;
    rows.forEach(function (rw) { if (rw.g) return; cols.forEach(function (cc) { if (cc.off) return; mx = Math.max(mx, Math.abs(inhalt === "ein" ? rw.ein(cc.alloc) : rw.st ? cc.stand[rw.st] : 0)); }); });
    var body = rows.map(function (rw) {
      if (rw.g) return '<tr class="vt-grp"><th colspan="' + nCols + '">' + rw.g + "</th></tr>";
      var sub = inhalt === "ein" ? (rw.subE ? rw.subE(a, eur0) : rw.will ? "will " + eur0(a[rw.will]) + "/Monat" : "") : (rw.subS ? rw.subS(a) : rw.ziel ? "Ziel " + eur0(a[rw.ziel]) : rw.st ? "Stand" : "");
      var name = '<th class="vt-name"><span class="pot-n">' + rw.nr + "</span><span><b>" + rw.name + '</b><em class="muted">' + c.esc(sub) + "</em></span></th>";
      if (inhalt !== "ein" && !rw.st) return '<tr class="art-' + rw.art + ' vt-none">' + name + '<td colspan="' + (cols.length + 1) + '" class="vt-nostand">' + rw.none + "</td></tr>";
      var sum = 0;
      var tds = cols.map(function (cc) {
        if (cc.off) return '<td class="off">–</td>';
        if (inhalt === "ein") {
          var v = rw.ein(cc.alloc); sum += v;
          var al = v > 0.5 ? Math.round(14 + v / mx * 46) : 0;
          var vorS = v < 0.5 && cc.vor && rw.nr !== "!" && rw.nr !== "–", paused = v < 0.5 && !vorS && cc.pausiert && rw.art === "gespart";
          return '<td class="' + (v < 0.5 ? (paused ? "zero paused" : vorS ? "zero vor" : "zero") : "full") + '" style="--al:' + al + '%"' + (paused ? ' title="pausiert, ein Kredit wird zurückgezahlt"' : "") + ">" + (v < 0.5 ? (paused ? "Pause" : vorS ? "noch nicht" : "–") : n0(v)) + "</td>";
        }
        var sv = cc.stand[rw.st], w = rw.st === "schuld" ? (cc.wd.fehl || 0) : rw.wd ? (cc.wd[rw.wd] || 0) : 0, al2 = Math.abs(sv) > 0.5 ? Math.round(12 + Math.abs(sv) / mx * 44) : 0;
        var mark = w > 0.5 ? '<span class="vt-wd">' + (rw.st === "schuld" ? "+" : "−") + n0(w) + "</span>" : "";
        return '<td class="' + (Math.abs(sv) < 0.5 ? "zero" : "full") + '" style="--al:' + al2 + '%">' + (Math.abs(sv) < 0.5 ? "0" : (rw.neg ? "−" : "") + n0(Math.abs(sv))) + mark + "</td>";
      }).join("");
      return '<tr class="art-' + rw.art + '">' + name + tds + '<td class="vt-sum num">' + (inhalt === "ein" ? eur0(sum) : "") + "</td></tr>";
    }).join("");
    var evSum = 0, evTds = cols.map(function (cc) { if (cc.off) return '<td class="off">–</td>'; var v = -Math.min(0, cc.ev); evSum += v; return '<td class="' + (v > 0.5 ? "ev" : "zero") + '">' + (v > 0.5 ? "−" + n0(v) : "–") + "</td>"; }).join("");
    body += '<tr class="vt-grp"><th colspan="' + nCols + '">Anschaffungen</th></tr><tr class="vt-evrow"><th class="vt-name"><span class="pot-n">🛒</span><span><b>Anschaffungen</b><em class="muted">Kosten ' + per + "</em></span></th>" + evTds + '<td class="vt-sum num">' + (evSum ? "−" + eur0(evSum) : "") + "</td></tr>";
    var note = inhalt === "ein" ? "Was jeder Topf " + per + " aus dem freien Geld bekommt. „Pause“: ein Kredit aus einer Anschaffung wird zurückgezahlt. „noch nicht“: vor dem Sparstart."
      : "Kontostand am Ende " + (mode === "jahr" ? "jedes Jahres" : "jedes Monats") + ". Rote Zahl darunter: so viel wurde " + per + " für Anschaffungen entnommen.";
    return '<div class="card z-verlauf"><div class="card-head"><div><h2>Deine Töpfe</h2><p class="muted small">' + (inhalt === "ein" ? "Einzahlungen " + per : "Kontostände") + (mode === "monat" ? " · " + zu.year : "") + '</p></div><div class="vt-tg">' +
      '<div class="seg seg-sm"><button class="seg-b' + (inhalt === "stand" ? " on" : "") + '" data-act="zVlInhalt" data-m="stand">Kontostände</button><button class="seg-b' + (inhalt === "ein" ? " on" : "") + '" data-act="zVlInhalt" data-m="ein">Einzahlungen</button></div>' +
      '<div class="seg seg-sm"><button class="seg-b' + (mode === "monat" ? " on" : "") + '" data-act="zVlMode" data-m="monat">Monate</button><button class="seg-b' + (mode === "jahr" ? " on" : "") + '" data-act="zVlMode" data-m="jahr">Jahre</button></div></div></div>' +
      '<div class="vt-nav">' + nav + "</div>" + '<div class="vt-wrap"><table class="vt"><thead><tr><th></th>' + head + '<th class="vt-sum">' + (inhalt === "ein" ? "Summe" : "") + "</th></tr></thead><tbody>" + body + "</tbody></table></div>" +
      '<p class="muted small">' + c.esc(note) + "</p>" + anschaffungStory(c, a, years, y) + "</div>";
  }

  /* ---------- So wird ein Monat verteilt (zuklappbar, ganz unten) ---------- */
  var WF = [
    { k: "etfMin", nr: "1", name: "ETF-Depot: Mindestbetrag", art: "gespart", will: "etfMindest" },
    { k: "lebensqual", nr: "6", name: "Lebensqualität", art: "ausgegeben", will: "lebensqualitaet" },
    { k: "sonder", nr: "5", name: "KfW-Sondertilgung", art: "getilgt", will: "kfw1Sonder" },
    { k: "auto", nr: "7", name: "Auto", art: "ausgegeben", will: "autoPauschale" },
    { k: "kredit", nr: "!", name: "Kredit aus Anschaffungen", art: "ausgegeben", only: true },
    { k: "kind", nr: "4", name: "Kinder-Sparen", art: "gespart", will: "kindSparrate" },
    { k: "hausEk", nr: "3", name: "Haus-EK", art: "gespart", will: "hausEkRate", ziel: "hausEkZiel", st: "hek" },
    { k: "notgroschen", nr: "2", name: "Notgroschen", art: "gespart", will: "notgroschenRate", ziel: "notgroschenZiel", st: "ng" },
    { k: "etfRest", nr: "1", name: "ETF-Depot: der ganze Rest", art: "gespart" },
    { k: "unverplant", nr: "–", name: "Nicht verplant", art: "frei", only: true }
  ];
  function verteilungCard(c, a, y) {
    var eur = c.eur, ms = y.months;
    var mNr = zu.vtMonat && ms.some(function (m) { return m.monat === zu.vtMonat; }) ? zu.vtMonat : (ms.find(function (m) { return !m.vorSpar; }) || ms[0]).monat;
    var d = ms.find(function (m) { return m.monat === mNr; }), run = d.frei, rows = "";
    WF.forEach(function (w) {
      var got = d.alloc[w.k] || 0, will = w.will ? a[w.will] : null;
      if (w.only && got < 0.5) return;
      var before = run; run -= got;
      var hint;
      if (d.vorSpar && w.k !== "kredit" && w.k !== "unverplant") hint = "vor dem Sparstart";
      else if (d.pausiert && w.art === "gespart" && got < 0.5) hint = "Pause, der Kredit wird zurückgezahlt";
      else if (w.k === "etfRest") hint = got > 0.5 ? "alles, was übrig ist" : "es ist nichts übrig";
      else if (w.k === "unverplant") hint = "liegt ungenutzt, zählt nicht zum Vermögen";
      else if (w.k === "kredit") hint = "geht vor allen Spartöpfen";
      else if (will == null || got >= will - 0.5) hint = "✓ voll";
      else if (before < will - 0.5 && got >= before - 0.5) hint = "das Geld reicht nicht";
      else if (w.ziel) hint = got < 0.5 ? "Ziel " + c.eur0(a[w.ziel]) + " erreicht" : "nur noch bis zum Ziel";
      else if (w.k === "sonder") hint = got < 0.5 ? "KfW 1 ist abbezahlt" : "nur noch die Restschuld";
      else hint = "";
      rows += '<tr class="art-' + w.art + (got < 0.5 ? " wf-zero" : "") + '"><td><span class="pot-n">' + w.nr + "</span></td><td><b>" + w.name + '</b></td><td class="r num muted">' + (will != null ? eur(will) : "") + '</td><td class="r num"><b>' + eur(got) + '</b></td><td class="r num muted">' + eur(Math.max(0, run)) + '</td><td class="muted small">' + c.esc(hint) + "</td></tr>";
    });
    var sel = '<select data-act="zVtM" aria-label="Monat">' + ms.map(function (m) { return '<option value="' + m.monat + '"' + (m.monat === mNr ? " selected" : "") + ">" + MONL[m.monat - 1] + " " + y.jahr + "</option>"; }).join("") + "</select>";
    return '<details class="card z-wf" data-pp="wf"' + (zu.open.wf ? " open" : "") + '><summary><div><h2>So wird das Freie verteilt</h2><p class="muted small">Für einen Monat: Wer bekommt wie viel, in welcher Reihenfolge, und warum manchmal weniger.</p></div><span class="z-wf-t">aufklappen</span></summary>' +
      '<div class="z-wf-b"><div class="z-wf-top"><label class="small">Monat ' + sel + '</label><span>Frei in diesem Monat: <b class="num">' + eur(d.frei) + "</b></span></div>" +
      '<div class="vt-wrap"><table class="wf-tbl"><thead><tr><th></th><th>Topf (in dieser Reihenfolge)</th><th class="r">will</th><th class="r">bekommt</th><th class="r">danach übrig</th><th>warum</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<p class="muted small">Die Nummern sind dieselben wie in „Deine Töpfe“. Das ETF-Depot (1) kommt zweimal vor: Der Mindestbetrag zuerst, ganz am Ende bekommt es alles, was übrig ist.</p></div></details>';
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
      '<p class="muted small">Bezahlt wird im gewählten Monat, nachdem die Sparraten dieses Monats eingezahlt sind. Es gibt nur <b>ein</b> ETF-Depot: Topf 1 bekommt den Mindestbetrag und alles, was am Ende übrig ist. Wird der Notgroschen angezapft, füllt er sich in den Monaten danach wieder auf.</p>' +
      '<ul class="ev-cards">' + withAmt.map(card).join("") + "</ul>" +
      (without.length ? '<details class="ev-empty" data-pp="evEmpty"' + (zu.open.evEmpty ? " open" : "") + '><summary>' + without.length + " Anschaffungen ohne Betrag (zählen nicht)</summary><ul class=\"ev-cards\">" + without.map(function (x) { return '<li class="ev-card">' + inputsRow(x) + "</li>"; }).join("") + "</ul></details>" : "") +
      c.btn("＋ Anschaffung", "zEvAdd", "", "btn-sm") + "</div>";
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
    if (act === "zVtM") { zu.vtMonat = +el.value; return true; }
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
