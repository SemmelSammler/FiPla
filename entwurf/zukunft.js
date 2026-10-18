/* BoSal — Zukunft mit der korrigierten Rechnung (fiplan.js). Die alte Rechnung (Logic.runFI)
   läuft nur noch zum Vergleich mit. */
(function () {
  "use strict";
  var zu = { year: null, edit: false, open: {}, src: null, pick: null, vlMode: "jahr", vlStart: null };
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // Neue Felder mit sinnvollen Startwerten ergänzen (alte Daten bleiben gültig)
  function ensure(a) {
    if (a.geburtsjahr == null) a.geburtsjahr = a.startjahr - a.startalter;
    if (a.fiBedarf == null) a.fiBedarf = { lq: true, auto: true };
    if (a.kindStart == null) a.kindStart = 0;
    if (a.ausMonat == null) a.ausMonat = true;
    if (a.hauskaufJahr === undefined) a.hauskaufJahr = null;
  }
  // Einnahmen/Fixkosten live aus dem Monat (Korrektur 6)
  function monthValues(c, a) {
    var mk = zu.src || c.state.active;
    var items = c.state.expected.filter(function (i) { return i.aktiv && i.typ !== "Schulden"; });
    if (!zu.pick) { zu.pick = {}; items.forEach(function (i) { zu.pick[i.id] = true; }); }
    var ein = 0, fix = 0;
    items.forEach(function (i) { if (!zu.pick[i.id]) return; var v = c.sollOf(mk, i); if (i.typ === "Einnahme") ein += v; else fix += -v; });
    return { mk: mk, items: items, ein: Math.round(ein * 100) / 100, fix: Math.round(fix * 100) / 100 };
  }
  function inputs(c) {
    var a = c.state.fi; ensure(a);
    var x = clone(a);
    if (a.ausMonat) { var mv = monthValues(c, a); x.einnahmen = mv.ein; x.fixkosten = mv.fix; }
    return x;
  }

  var POTS = [
    { name: "ETF-Mindestbetrag", art: "gespart", got: "allocEtfMin", will: function (a) { return a.etfMindest; } },
    { name: "Lebensqualität", art: "ausgegeben", got: "allocLebensqual", will: function (a) { return a.lebensqualitaet; } },
    { name: "KfW-Sondertilgung", art: "getilgt", got: "allocSonder", will: function (a) { return a.kfw1Sonder; } },
    { name: "Auto", art: "ausgegeben", got: "allocAuto", will: function (a) { return a.autoPauschale; } },
    { name: "Kinder-Sparen", art: "gespart", got: "allocKind", will: function (a) { return a.kindSparrate; }, stock: "kind" },
    { name: "Haus-Eigenkapital", art: "gespart", got: "allocHausEk", will: function (a) { return a.hausEkRate; }, stock: "hausEk", ziel: "hausEkZiel" },
    { name: "Notgroschen", art: "gespart", got: "allocNotgroschen", will: function (a) { return a.notgroschenRate; }, stock: "notgroschen", ziel: "notgroschenZiel" },
    { name: "ETF: der ganze Rest", art: "gespart", got: "allocEtfRest", will: null, stock: "etf" }
  ];

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
      }).join("") + "</div></div>";

    /* Schritt 1 */
    var s1 = step(1, "Was ist pro Monat frei?", "Im Jahr " + y.jahr + (y.monate < 12 ? " (noch " + y.monate + " Monate ab heute)" : ""),
      '<ul class="calc">' +
      row("Einnahmen netto", y.einnahmen, y.jahr === first ? (a.ausMonat ? "aus dem Monat " + c.mLabel(monthValues(c, a).mk, true) : "von Hand eingetragen") : "+" + pct(a.wachstumEinnahmen) + " pro Jahr, höchstens " + eur0(Math.max(a.einnahmenDeckel, a.einnahmen))) +
      row("Fixkosten", -y.fixkosten, y.jahr === first ? (a.ausMonat ? "aus dem Monat" : "von Hand eingetragen") : "+" + pct(a.wachstumFix) + " pro Jahr, höchstens " + eur0(Math.max(a.fixkostenDeckel, a.fixkosten))) +
      row("KfW-Pflichtraten", -(y.kfw1Pfl + y.kfw2Pfl), y.kfw1Pfl + y.kfw2Pfl ? "laut Tilgungsplan " + y.jahr : "Kredite sind abbezahlt") +
      '<li class="calc-total"><span>Frei pro Monat</span>' + money(y.frei) + "</li></ul>" +
      '<p class="muted small">Lebensereignisse stecken nicht mehr hier drin. Sie werden in Schritt 3 voll vom Ersparten abgezogen.</p>');

    /* Schritt 2 */
    var maxW = POTS.reduce(function (m, p) { return Math.max(m, p.will ? p.will(a) : y[p.got]); }, 1);
    var s2 = step(2, "Wie wird das Freie verteilt?", "Von oben nach unten: jeder Topf bekommt seinen Betrag, solange noch Geld da ist",
      '<ol class="pots">' + POTS.map(function (p, i) {
        var got = y[p.got], will = p.will ? p.will(a) : null, full = will == null || got >= will - 0.5, note = "";
        if (p.ziel) { var st = y[p.stock]; note = (p.stock === "hausEk" && y.hekEingesetzt) ? "Haus gekauft: " + eur0(y.hekEingesetzt) + " eingesetzt" : st >= a[p.ziel] - 0.5 ? "Ziel " + eur0(a[p.ziel]) + " erreicht" : "Stand Ende " + y.jahr + ": " + eur0(st) + " von " + eur0(a[p.ziel]); }
        if (p.got === "allocSonder" && y.kfw1 >= -0.5 && !got) note = "KfW 1 ist abbezahlt";
        var w = will || got || 0;
        return '<li class="pot art-' + p.art + (got < 0.5 ? " empty" : "") + '"><span class="pot-n">' + (i + 1) + '</span><div class="pot-main"><div class="pot-top"><span class="pot-name">' + p.name + '</span><span class="pot-tag">' + p.art + '</span></div>' +
          '<div class="pot-bar"><span class="pot-will" style="width:' + (w / maxW * 100).toFixed(1) + '%"></span><span class="pot-got" style="width:' + (got / maxW * 100).toFixed(1) + '%"></span></div>' +
          (note ? '<div class="pot-note muted small">' + esc(note) + "</div>" : "") + '</div><div class="pot-v"><b class="num">' + eur0(got) + "</b>" + (will != null && !full ? '<span class="muted small">von ' + eur0(will) + "</span>" : "") + "</div></li>";
      }).join("") + '</ol><div class="legend-row small muted"><span class="lg-dot art-gespart"></span>gespart <span class="lg-dot art-getilgt"></span>Schulden getilgt <span class="lg-dot art-ausgegeben"></span>ausgegeben</div>');

    /* Schritt 3 */
    var ev = y.events, pd = y.eventPaid;
    var evTxt = ev < 0 ? "bezahlt aus " + [pd.etf ? "ETF-Depot " + eur0(pd.etf) : "", pd.ng ? "Notgroschen " + eur0(pd.ng) : "", pd.hek ? "Haus-EK " + eur0(pd.hek) : "", pd.kind ? "Kinder-Sparen " + eur0(pd.kind) : "", pd.fehl ? "⚠ Fehlbetrag " + eur0(pd.fehl) : ""].filter(Boolean).join(", ") : ev > 0 ? "kommt in den ETF" : "";
    var s3 = step(3, "Wie wächst dein Vermögen?", "Bestände am Ende jedes Jahres",
      stackChart(years, zu.year, r.fiJahr) +
      '<div class="z-legend small"><span><i style="background:var(--c-etf)"></i>ETF (+' + pct(a.etfRendite) + ')</span><span><i style="background:var(--c-hek)"></i>Haus-EK</span><span><i style="background:var(--c-kind)"></i>Kinder-Sparen</span><span><i style="background:var(--c-ng)"></i>Notgroschen</span><span><i style="background:var(--c-kfw)"></i>KfW-Schulden</span></div>' +
      '<ul class="calc">' + (ev ? row("Lebensereignisse " + y.jahr, ev, evTxt) : "") + row("Für die Freiheit (Notgroschen + ETF)", y.fiCap) + row("Zweckgebunden (Haus-EK + Kinder-Sparen)", y.hausEk + y.kind) + row("KfW-Schulden", y.kfw1 + y.kfw2) +
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
      '<ul class="calc">' + row("Dein Erspartes für die Freiheit", cap, "Notgroschen + ETF") + row("4 % davon: so viel darfst du pro Jahr nehmen", ertrag, "= " + eur0(ertrag / 12) + " pro Monat") + row("Deine laufenden Kosten fürs ganze Jahr", -bedarf, eur0(y.bedarf) + " × 12 Monate") +
      '<li class="calc-total ' + (ok ? "ok" : "") + '"><span>' + (ok ? "Reicht, du bist frei" : "Reicht noch nicht") + "</span>" + (ok ? money(ertrag - bedarf) : '<span class="num neg">es fehlen ' + eur0(bedarf - ertrag) + " pro Jahr</span>") + "</li></ul>" +
      '<p class="muted small">Damit es reicht, brauchst du ' + eur0(bedarf / 0.04) + " Erspartes für die Freiheit.</p>" + fiChart(years, zu.year, r.fiJahr) +
      '<div class="z-legend small"><span><i style="background:var(--accent)"></i>so viel darfst du pro Jahr nehmen (4 %)</span><span><i style="background:var(--neg)"></i>so viel kosten deine laufenden Kosten pro Jahr</span></div>');

    return '<h1 class="page-t">Zukunft</h1><p class="lead muted">Die korrigierte Rechnung. Ganz unten steht, was gegenüber der alten Rechnung geändert ist.</p>' +
      '<div class="z-top">' + hero + slider + "</div>" + '<div class="z-steps">' + s1 + s2 + "</div>" + standCard(c, a, years, y) + verlaufCard(c, a, years, r.fiJahr) +
      '<div class="z-steps">' + s3 + s4 + "</div>" + annahmen(c, a, r) + events(c, a, r) + korrekturen(c, a, r, old);

    function row(label, v, hint) { return "<li><span>" + label + (hint ? ' <em class="muted">' + esc(hint) + "</em>" : "") + "</span>" + money(v) + "</li>"; }
    function pct(v) { return c.fmt.format(v * 100).replace(/,00$/, "") + " %"; }
  }

  function step(n, title, sub, body) {
    return '<section class="card z-step"><div class="z-step-h"><span class="z-n">' + n + '</span><div><h2>' + title + '</h2><p class="muted small">' + sub + "</p></div></div>" + body + "</section>";
  }

  /* ---------- Alle Töpfe Ende Jahr ---------- */
  function standCard(c, a, years, y) {
    var eur0 = c.eur0, upto = years.filter(function (x) { return x.jahr <= y.jahr; });
    function sum(k) { return upto.reduce(function (s, x) { return s + x[k] * x.monate; }, 0); }
    function bar(v, max) { return '<div class="st-bar"><span style="width:' + Math.max(0, Math.min(100, v / (max || 1) * 100)).toFixed(1) + '%"></span></div>'; }
    var kfwStart = Math.abs(a.kfw1Rest || 0) + Math.abs(a.kfw2Rest || 0), kfwNow = Math.max(0, -(y.kfw1 + y.kfw2)) || 0;
    var verb = { gespart: "eingezahlt", ausgegeben: "ausgegeben", getilgt: "zusätzlich getilgt" };
    return '<div class="card z-stand"><div class="card-head"><h2>Alle Töpfe Ende ' + y.jahr + '</h2><span class="muted small">Jahr oben ändern</span></div><div class="vt-wrap"><table class="st-tbl"><thead><tr><th></th><th>Topf</th><th class="r">pro Monat ' + y.jahr + '</th><th class="r">bis Ende ' + y.jahr + ' insgesamt</th><th>Stand / Ziel</th></tr></thead><tbody>' + POTS.map(function (p, i) {
      var goal = "";
      if (p.got === "allocSonder") goal = "<span>Restschuld KfW " + eur0(kfwNow) + " von " + eur0(kfwStart) + "</span>" + bar(kfwStart - kfwNow, kfwStart);
      else if (p.ziel) goal = "<span>" + eur0(y[p.stock]) + " von " + eur0(a[p.ziel]) + "</span>" + bar(y[p.stock], a[p.ziel]);
      else if (p.stock === "etf") goal = "<span>ETF gesamt " + eur0(y.etf) + " (mit Rendite)</span>";
      else if (p.stock) goal = "<span>Stand " + eur0(y[p.stock]) + "</span>";
      return '<tr class="art-' + p.art + '"><td><span class="pot-n">' + (i + 1) + '</span></td><td><b>' + p.name + '</b> <span class="pot-tag">' + p.art + '</span></td><td class="r num">' + eur0(y[p.got]) + '</td><td class="r"><span class="num">' + eur0(sum(p.got)) + '</span> <em class="muted small">' + verb[p.art] + '</em></td><td class="st-goal">' + (goal || '<span class="muted small">–</span>') + "</td></tr>";
    }).join("") + "</tbody></table></div></div>";
  }

  /* ---------- Töpfe als Tabelle: Jahre oder Monate ---------- */
  function verlaufCard(c, a, years, fiJ) {
    var eur0 = c.eur0, mode = zu.vlMode, cols, head, cell, nav, note;
    if (mode === "jahr") {
      var first = years[0].jahr, last = years[years.length - 1].jahr, start = zu.vlStart != null ? zu.vlStart : zu.year - ((zu.year - first) % 10);
      start = Math.max(first, Math.min(start, last - 9));
      cols = years.filter(function (x) { return x.jahr >= start && x.jahr < start + 10; });
      head = cols.map(function (x) { return '<th class="' + (x.jahr === zu.year ? "sel" : "") + '"><button class="linkrow" data-act="zSetYear" data-y="' + x.jahr + '">' + x.jahr + (x.jahr === fiJ ? "<em>frei</em>" : "") + "</button></th>"; }).join("");
      cell = function (p, x) { return { v: x[p.got] * x.monate, full: !p.will || x[p.got] >= p.will(a) - 0.5, sel: x.jahr === zu.year }; };
      nav = '<div class="vt-nav">' + c.btn("‹ früher", "zVl", ' data-s="' + (start - 10) + '"', "btn-sm") + '<span class="muted small">' + start + "–" + Math.min(last, start + 9) + " von " + first + "–" + last + "</span>" + c.btn("später ›", "zVl", ' data-s="' + (start + 10) + '"', "btn-sm") + "</div>";
      note = "Summe pro Jahr. Das erste Jahr zählt nur die " + years[0].monate + " Monate ab heute. Jahreszahl antippen wählt das Jahr.";
    } else {
      var y = years.find(function (x) { return x.jahr === zu.year; }), firstM = 12 - y.monate;
      cols = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"].map(function (m, i) { return { m: m, on: i >= firstM }; });
      head = cols.map(function (x) { return "<th" + (x.on ? "" : ' class="off"') + ">" + x.m + "</th>"; }).join("");
      cell = function (p, x) { return x.on ? { v: y[p.got], full: !p.will || y[p.got] >= p.will(a) - 0.5 } : null; };
      nav = '<div class="vt-nav">' + c.btn("‹ " + (zu.year - 1), "zSetYear", ' data-y="' + (zu.year - 1) + '"', "btn-sm") + "<b>" + zu.year + "</b>" + c.btn((zu.year + 1) + " ›", "zSetYear", ' data-y="' + (zu.year + 1) + '"', "btn-sm") + "</div>";
      note = "Betrag pro Monat in " + zu.year + ". Die Rechnung kennt einen Wert pro Jahr, deshalb sind die Monate eines Jahres gleich.";
    }
    var max = 1; POTS.forEach(function (p) { cols.forEach(function (x) { var k = cell(p, x); if (k) max = Math.max(max, k.v); }); });
    var body = POTS.map(function (p, i) {
      var sum = 0;
      var tds = cols.map(function (x) {
        var k = cell(p, x); if (!k) return '<td class="off">–</td>';
        sum += k.v; var al = k.v > 0.5 ? Math.round(12 + k.v / max * 48) : 0;
        return '<td class="' + (k.v < 0.5 ? "zero" : k.full ? "full" : "part") + (k.sel ? " sel" : "") + '" style="--al:' + al + '%">' + (k.v < 0.5 ? "–" : eur0(k.v).replace(" €", "")) + "</td>";
      }).join("");
      return '<tr class="art-' + p.art + '"><th class="vt-name"><span class="pot-n">' + (i + 1) + "</span><span><b>" + p.name + '</b><em class="muted">' + (p.will ? "will " + eur0(p.will(a)) + "/Monat" : "bekommt den Rest") + "</em></span></th>" + tds + '<td class="vt-sum num">' + eur0(sum) + "</td></tr>";
    }).join("");
    return '<div class="card z-verlauf"><div class="card-head"><h2>So entwickeln sich die Töpfe</h2><div class="seg seg-sm"><button class="seg-b' + (mode === "jahr" ? " on" : "") + '" data-act="zVlMode" data-m="jahr">Jahre</button><button class="seg-b' + (mode === "monat" ? " on" : "") + '" data-act="zVlMode" data-m="monat">Monate</button></div></div>' +
      nav + '<div class="vt-wrap"><table class="vt"><thead><tr><th></th>' + head + '<th class="vt-sum">Summe</th></tr></thead><tbody>' + body + "</tbody></table></div>" +
      '<div class="legend-row small muted"><span class="vt-lg full"></span>bekommt alles, was er will <span class="vt-lg part"></span>bekommt nur einen Teil <span class="vt-lg zero">–</span>bekommt nichts</div><p class="muted small">' + c.esc(note) + "</p></div>";
  }

  /* ---------- Annahmen ---------- */
  function annahmen(c, a, r) {
    var src = c.state.fi, eur = c.eur;
    var groups = [
      ["Start", [["geburtsjahr", "Geburtsjahr", "j"], ["endalter", "Rechnen bis Alter", "j"]]],
      ["Startwerte im ersten Jahr: Einnahmen & Fixkosten", [["einnahmen", "Einnahmen netto / Monat", "€", src.ausMonat], ["wachstumEinnahmen", "Wachstum Einnahmen", "%"], ["einnahmenDeckel", "Einnahmen höchstens", "€"], ["fixkosten", "Fixkosten / Monat", "€", src.ausMonat], ["wachstumFix", "Wachstum Fixkosten", "%"], ["fixkostenDeckel", "Fixkosten höchstens", "€"]]],
      ["Töpfe (so viel will jeder pro Monat)", [["etfMindest", "ETF-Mindestbetrag", "€"], ["lebensqualitaet", "Lebensqualität", "€"], ["kfw1Sonder", "KfW-Sondertilgung", "€"], ["autoPauschale", "Auto", "€"], ["kindSparrate", "Kinder-Sparen", "€"], ["hausEkRate", "Haus-EK", "€"], ["hausEkZiel", "Haus-EK-Ziel", "€"], ["hauskaufJahr", "Hauskauf im Jahr (leer = nie)", "j0"], ["notgroschenRate", "Notgroschen", "€"], ["notgroschenZiel", "Notgroschen-Ziel", "€"]]],
      ["Was du heute schon hast · Rendite", [["etfStart", "ETF heute", "€"], ["notgroschenStart", "Notgroschen heute", "€"], ["hausEkStart", "Haus-EK heute", "€"], ["kindStart", "Kinder-Sparen heute", "€"], ["kfw1Rest", "KfW 1 Restschuld", "€"], ["kfw2Rest", "KfW 2 Restschuld", "€"], ["etfRendite", "ETF-Rendite p. a.", "%"], ["notgroschenZins", "Notgroschen-Zins p. a.", "%"]]]
    ];
    var html = '<div class="card"><div class="card-head"><h2>Deine Annahmen</h2>' + c.btn(zu.edit ? "Fertig" : "Bearbeiten", "zEdit", "", zu.edit ? "btn-primary" : "") + '</div>' +
      '<p class="muted small">Startjahr ' + r.startjahr + " und " + r.monateJahr1 + " Restmonate kommen automatisch aus dem heutigen Datum. Dein Alter rechnet sich aus dem Geburtsjahr.</p>" +
      ((src.etfStart || 0) + (src.notgroschenStart || 0) + (src.hausEkStart || 0) === 0 ? '<p class="note">Du hast noch keine Startbestände eingetragen. Trag unter „Was du heute schon hast“ dein Tagesgeld (Notgroschen) und dein Depot (ETF) ein, sonst ist der Plan zu pessimistisch.</p>' : "") +
      '<div class="ann-grid">' + groups.map(function (g) {
        return '<div class="ann-g"><h3>' + g[0] + '</h3><dl class="kv">' + g[1].map(function (f) {
          var v = f[3] ? a[f[0]] : src[f[0]], lock = f[3];
          var shown = v == null || v === "" ? "–" : f[2] === "%" ? c.fmt.format(v * 100) + " %" : f[2][0] === "j" ? String(v) : eur(v);
          var inp = '<input class="in-num" inputmode="decimal" data-act="zFi" data-k="' + f[0] + '" data-t="' + f[2] + '" value="' + (v == null ? "" : f[2] === "%" ? c.fmt.format(v * 100) : f[2][0] === "j" ? v : c.fmt.format(v)) + '">';
          return "<div><dt>" + f[1] + (lock ? ' <em class="muted small">aus dem Monat</em>' : "") + "</dt><dd>" + (zu.edit && !lock ? inp : '<span class="num">' + shown + "</span>") + "</dd></div>";
        }).join("") + "</dl></div>";
      }).join("") + "</div>" + fromMonth(c, a) + "</div>";
    return html;
  }

  function fromMonth(c, a) {
    var src = c.state.fi, mv = monthValues(c, a), months = c.months();
    function list(typ) {
      return mv.items.filter(function (i) { return i.typ === typ; }).map(function (i) {
        return '<label class="fm-i"><input type="checkbox" data-act="zPick" data-id="' + i.id + '"' + (zu.pick[i.id] ? " checked" : "") + "> <span>" + c.esc(i.beschreibung) + '</span><span class="num muted">' + c.eur(c.sollOf(mv.mk, i)) + "</span></label>";
      }).join("");
    }
    return '<div class="fm-box"><div class="fm-head"><b>Einnahmen & Fixkosten</b><div class="seg seg-sm"><button class="seg-b' + (src.ausMonat ? " on" : "") + '" data-act="zAus" data-v="1">aus dem Monat</button><button class="seg-b' + (!src.ausMonat ? " on" : "") + '" data-act="zAus" data-v="0">von Hand</button></div></div>' +
      (src.ausMonat ? '<div class="fm-b"><label class="fm-m"><span>Monat</span><select data-act="zSrc">' + months.map(function (m) { return '<option value="' + m + '"' + (m === mv.mk ? " selected" : "") + ">" + c.mLabel(m, true) + "</option>"; }).join("") + "</select></label>" +
        '<div class="fm-cols"><div><h4>Einnahmen</h4>' + list("Einnahme") + '<div class="fm-sum">= ' + c.eur(mv.ein) + '</div></div><div><h4>Fixkosten</h4>' + list("Fixkosten") + '<div class="fm-sum">= ' + c.eur(mv.fix) + "</div></div></div>" +
        '<p class="muted small">Verknüpft: Änderst du im Monat einen festen Posten, ändert sich auch die Zukunft. Kredite rechnet die Zukunft über die Tilgungspläne.</p></div>'
        : '<p class="muted small fm-b">Du trägst Einnahmen und Fixkosten oben unter „Bearbeiten“ selbst ein.</p>') + "</div>";
  }

  /* ---------- Lebensereignisse: jedes zeigt genau, woher das Geld kommt ---------- */
  var QUELLEN = [["auto", "automatisch (ETF → Notgroschen → Haus-EK)"], ["etf", "nur ETF-Depot"], ["ng", "nur Notgroschen"], ["hek", "nur Haus-EK"], ["kind", "nur Kinder-Sparen"]];
  var TOPF = { etf: ["ETF-Depot", "var(--c-etf)"], ng: ["Notgroschen", "var(--c-ng)"], hek: ["Haus-EK", "var(--c-hek)"], kind: ["Kinder-Sparen", "var(--c-kind)"], fehl: ["Fehlbetrag", "var(--neg)"] };
  function events(c, a, r) {
    var src = c.state.fi, eur0 = c.eur0, list = (src.events || []).map(function (e, i) { return { e: e, i: i }; }).sort(function (x, y) { return x.e.jahr - y.e.jahr || x.i - y.i; });
    var withAmt = list.filter(function (x) { return Number(x.e.betrag); }), without = list.filter(function (x) { return !Number(x.e.betrag); });
    function detailFor(x) {
      var y = r.years.find(function (yy) { return yy.jahr === Number(x.e.jahr); });
      return y ? (y.eventDetails || []).find(function (d) { return d.index === x.i; }) : null;
    }
    function inputsRow(x) {
      return '<div class="ev-in"><input class="in-num ev-j" inputmode="numeric" data-act="zEv" data-i="' + x.i + '" data-f="jahr" value="' + x.e.jahr + '" aria-label="Jahr">' +
        '<input class="ev-t" data-act="zEv" data-i="' + x.i + '" data-f="beschreibung" value="' + c.esc(x.e.beschreibung || "") + '" aria-label="Beschreibung">' +
        '<input class="in-num" inputmode="decimal" data-act="zEv" data-i="' + x.i + '" data-f="betrag" value="' + c.fmt.format(Number(x.e.betrag) || 0) + '" aria-label="Betrag">' +
        (Number(x.e.betrag) < 0 ? '<select data-act="zEv" data-i="' + x.i + '" data-f="quelle" aria-label="Bezahlen aus">' + QUELLEN.map(function (q) { return '<option value="' + q[0] + '"' + ((x.e.quelle || "auto") === q[0] ? " selected" : "") + ">" + q[1] + "</option>"; }).join("") + "</select>" : "") +
        c.btn("✕", "zEvDel", ' data-i="' + x.i + '"', "btn-sm btn-ghost") + "</div>";
    }
    function card(x) {
      var d = detailFor(x), b = Number(x.e.betrag) || 0, body;
      if (!d) body = '<p class="muted small">Liegt außerhalb der Rechnung (' + r.years[0].jahr + "–" + r.years[r.years.length - 1].jahr + ").</p>";
      else if (b > 0) body = '<p class="small">Kommt ins <b>ETF-Depot</b>: ' + eur0(d.before.etf) + " → " + eur0(d.after.etf) + "</p>";
      else {
        var srcKeys = { auto: ["etf", "ng", "hek"], etf: ["etf"], ng: ["ng"], hek: ["hek"], kind: ["kind"] }[d.quelle] || ["etf", "ng", "hek"];
        var keys = srcKeys.filter(function (k) { return d.paid[k] > 0.5 || d.quelle !== "auto"; }).concat(d.paid.fehl > 0.5 ? ["fehl"] : []);
        var shownAfter = function (k) { return k === "etf" ? d.after.etf + d.paid.fehl : d.after[k]; };
        var bar = '<div class="ev-bar">' + keys.filter(function (k) { return d.paid[k] > 0.5; }).map(function (k) { return '<span style="width:' + (d.paid[k] / -b * 100).toFixed(1) + "%;background:" + TOPF[k][1] + '" title="' + TOPF[k][0] + " " + eur0(d.paid[k]) + '"></span>'; }).join("") + "</div>";
        var rows = keys.map(function (k) {
          return "<tr><td><i style=\"background:" + TOPF[k][1] + '"></i>' + TOPF[k][0] + '</td><td class="num">' + eur0(d.paid[k]) + "</td><td class=\"num muted\">" + (k === "fehl" ? "musst du dir leihen" : eur0(d.before[k]) + " → " + eur0(shownAfter(k)) + (d.before[k] < 0.5 ? " (leer)" : "")) + "</td></tr>";
        }).join("");
        body = bar + '<table class="ev-tbl"><thead><tr><th>bezahlt aus</th><th>Betrag</th><th>Stand Ende ' + x.e.jahr + ": vorher → nachher</th></tr></thead><tbody>" + rows + "</tbody></table>" +
          (d.paid.fehl > 0.5 ? '<p class="note">' + eur0(d.paid.fehl) + " fehlen in " + x.e.jahr + ". Die Rechnung führt sie als Minus im ETF-Depot weiter, als hättest du dir das Geld zur ETF-Rendite geliehen. Die folgenden Jahre zahlen es zurück.</p>" : "");
      }
      return '<li class="ev-card' + (d && d.paid.fehl > 0.5 ? " warn" : "") + '">' + inputsRow(x) + body + "</li>";
    }
    return '<div class="card"><div class="card-head"><h2>Lebensereignisse</h2><span class="muted small">Kosten mit Minus eintragen, z. B. −20.000 für ein Auto</span></div>' +
      '<p class="muted small">Wichtig: Es gibt nur <b>ein</b> ETF-Depot. Die Töpfe 1 (ETF-Mindestbetrag) und 8 (ETF-Rest) zahlen beide dort ein. Kosten werden am Ende des Jahres bezahlt, also nachdem die Sparraten des Jahres eingezahlt sind.</p>' +
      '<ul class="ev-cards">' + withAmt.map(card).join("") + "</ul>" +
      (without.length ? '<details class="ev-empty"' + (zu.evEmptyOpen ? " open" : "") + '><summary>' + without.length + " Ereignisse ohne Betrag (zählen nicht)</summary><ul class=\"ev-cards\">" + without.map(function (x) { return '<li class="ev-card">' + inputsRow(x) + "</li>"; }).join("") + "</ul></details>" : "") +
      c.btn("＋ Ereignis", "zEvAdd", "", "btn-sm") + "</div>";
  }

  /* ---------- Was korrigiert wurde: alt gegen neu, live ---------- */
  function korrekturen(c, a, r, old) {
    var L = c.L, eur0 = c.eur0, src = c.state.fi;
    function runNew(mod) { var b = clone(a); if (mod) mod(b); return window.BoSalFI.run(b); }
    function runOld(mod) { var b = clone(src); if (mod) mod(b); return L.runFI(b); }
    function t(rows) { return '<table class="pp-tbl"><thead><tr><th></th><th>vorher</th><th>jetzt</th></tr></thead><tbody>' + rows.map(function (x) { return "<tr><td>" + x[0] + '</td><td class="num">' + x[1] + '</td><td class="num">' + x[2] + "</td></tr>"; }).join("") + "</tbody></table>"; }
    var evY = r.startjahr + 2;
    var o3 = runOld(function (b) { b.events = [{ jahr: evY, betrag: -20000 }]; }), n3 = runNew(function (b) { b.events = [{ jahr: evY, betrag: -20000 }]; });
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
      ["Lebensereignisse werden voll verrechnet", "Ein Ereignis wurde ÷ 12 vom Freien abgezogen, teils nur für die Restmonate, und kürzte Lebensqualität und Auto. Der Rest verschwand.", "Der volle Betrag wird vom Ersparten abgezogen: ETF, dann Notgroschen, dann Haus-EK. Reicht es nicht, siehst du den Fehlbetrag.",
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
        t([["Verschwundenes Geld über alle Jahre", eur0(lostOld), "0 €"]])]
    ];
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
    if (act === "zAus") { c.mark("Quelle für Startwerte geändert"); if (d.v === "0" && a.ausMonat) { var mv = monthValues(c, a); a.einnahmen = mv.ein; a.fixkosten = mv.fix; } a.ausMonat = d.v === "1"; return true; }
    if (act === "zEvAdd") { c.mark("Ereignis hinzugefügt"); (a.events = a.events || []).push({ jahr: new Date().getFullYear() + 1, beschreibung: "Neues Ereignis", betrag: -1000 }); return true; }
    if (act === "zEvDel") { c.mark("Ereignis gelöscht"); a.events.splice(+d.i, 1); return true; }
    return false;
  }
  function change(c, el) {
    var a = c.state.fi, act = el.dataset.act; ensure(a);
    if (act === "zYear") { zu.year = +el.value; zu.vlStart = null; return true; }
    if (act === "zSrc") { zu.src = el.value; return true; }
    if (act === "zPick") { zu.pick[el.dataset.id] = el.checked; return true; }
    if (act === "zBed") { c.mark("Lebensbedarf geändert"); a.fiBedarf[el.dataset.k] = el.checked; return true; }
    if (act === "zEv") {
      var e = a.events[+el.dataset.i], f = el.dataset.f; c.mark("Ereignis geändert");
      if (f === "beschreibung" || f === "quelle") e[f] = el.value; else { var n2 = c.parseNum(el.value); if (!isNaN(n2)) e[f] = f === "jahr" ? Math.round(n2) : n2; }
      return true;
    }
    if (act === "zFi") {
      var t = el.dataset.t, raw = el.value.trim();
      if (t === "j0" && raw === "") { c.mark("Annahme geändert"); a[el.dataset.k] = null; return true; }
      var n = c.parseNum(raw); if (isNaN(n)) return true;
      if (t === "%") n = n / 100; if (t[0] === "j") n = Math.round(n);
      c.mark("Annahme geändert"); a[el.dataset.k] = n; return true;
    }
    return false;
  }
  window.BoSalZukunft = { render: render, handle: handle, change: change, zu: zu };
})();
