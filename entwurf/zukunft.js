/* BoSal — Zukunft (FI-Planung), so wie sie heute rechnet: Logic.runFI unverändert.
   Aufbau als Geschichte in 4 Schritten + Annahmen + 7 Prüfpunkte mit Live-Beispielen. */
(function () {
  "use strict";
  var zu = { year: null, edit: false, open: {} };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function yearWhen(r, f) { var y = r.years.find(f); return y ? y.jahr : null; }
  function fiCap(y) { return y.notgroschen + y.hausEk + y.etf; }

  var TOEPFE = [
    { k: "allocEtf", name: "ETF-Mindestbetrag", will: function (a) { return a.etfMindest; }, art: "gespart", min: true },
    { k: "allocLebensqual", name: "Lebensqualität", will: function (a) { return a.lebensqualitaet; }, art: "ausgegeben" },
    { k: "allocSonder", name: "KfW-Sondertilgung", will: function (a) { return a.kfw1Sonder; }, art: "getilgt" },
    { k: "allocAutoKind", name: "Auto + Kind", will: function (a) { return a.autoPauschale + a.kindSparrate; }, art: "ausgegeben" },
    { k: "allocHausEk", name: "Haus-Eigenkapital", will: function (a) { return a.hausEkRate; }, art: "gespart", ziel: "hausEkZiel" },
    { k: "allocNotgroschen", name: "Notgroschen", will: function (a) { return a.notgroschenRate; }, art: "gespart", ziel: "notgroschenZiel" },
    { k: "allocEtf", name: "ETF: der ganze Rest", will: null, art: "gespart", rest: true }
  ];

  function render(c) {
    var L = c.L, a = c.state.fi, r = L.runFI(a), eur = c.eur, eur0 = c.eur0, money = c.money, btn = c.btn, esc = c.esc;
    var years = r.years, first = years[0].jahr, last = years[years.length - 1].jahr;
    if (zu.year == null || zu.year < first || zu.year > last) zu.year = first;
    var y = years.find(function (x) { return x.jahr === zu.year; }), fiY = years.find(function (x) { return x.jahr === r.fiJahr; });

    /* ---------- Kopf ---------- */
    var hero = '<div class="card hero z-hero"><div class="hero-label">Finanziell frei ab</div><div class="z-hero-row"><div class="hero-num num">' + (r.fiJahr || "–") + '</div><div class="z-hero-age">mit <b>' + r.fiAlter + "</b> Jahren</div></div>" +
      '<div class="hero-sub">Ab dann bringen 4 % deines Ersparten pro Jahr so viel, wie deine Fixkosten im Jahr kosten.</div>' +
      '<div class="hero-split"><div><span class="k">Frei pro Monat heute</span>' + money(r.cashflowHeute, "") + '</div><div><span class="k">Vermögen heute</span>' + money(r.vermoegenHeute, "") + '</div><div><span class="k">Vermögen ' + r.fiJahr + "</span>" + money(fiY ? fiY.vermoegen : 0, "") + "</div></div></div>";

    var slider = '<div class="card z-year"><div class="z-year-top"><span class="muted small">Schritte 1–4 zeigen das Jahr</span><b class="z-year-v">' + zu.year + ' <span class="muted">· du bist ' + y.alter + "</span></b></div>" +
      '<input type="range" min="' + first + '" max="' + last + '" value="' + zu.year + '" data-act="zYear" aria-label="Jahr wählen">' +
      '<div class="z-year-btns">' + [first, first + 1, first + 2, r.fiJahr, Math.min(last, r.fiJahr + 10)].filter(function (v, i, arr) { return v && arr.indexOf(v) === i; }).map(function (v) {
        return '<button class="chip' + (v === zu.year ? " on" : "") + '" data-act="zSetYear" data-y="' + v + '">' + v + (v === r.fiJahr ? " · frei" : "") + "</button>";
      }).join("") + "</div></div>";

    /* ---------- Schritt 1: was ist frei ---------- */
    var monatsTxt = y.monate < 12 ? " (" + y.monate + " Monate gerechnet)" : "";
    var s1 = step(1, "Was ist pro Monat frei?", "Im Jahr " + y.jahr + monatsTxt,
      '<ul class="calc">' +
      calcRow("Einnahmen netto", y.einnahmen, y.jahr === first ? "dein Startwert" : "+" + fmtP(a.wachstumEinnahmen) + " pro Jahr, höchstens " + eur0(a.einnahmenDeckel)) +
      calcRow("Fixkosten", -y.fixkosten, y.jahr === first ? "dein Startwert" : "+" + fmtP(a.wachstumFix) + " pro Jahr, höchstens " + eur0(a.fixkostenDeckel)) +
      calcRow("KfW-Pflichtraten", -(y.kfw1Pfl + y.kfw2Pfl), y.kfw1Pfl + y.kfw2Pfl ? "laut Tilgungsplan " + y.jahr : "Kredite sind abbezahlt") +
      calcRow("Lebensereignisse", y.eventsMon, y.eventsMon ? "Betrag des Jahres ÷ 12" : "keine mit Betrag in diesem Jahr") +
      '<li class="calc-total"><span>Frei pro Monat</span>' + money(y.frei) + "</li></ul>");

    /* ---------- Schritt 2: Verteilung ---------- */
    var bud = y.frei, rows = TOEPFE.map(function (t, i) {
      var got, will;
      if (t.min) { got = Math.min(a.etfMindest, Math.max(0, y.frei)); will = a.etfMindest; }
      else if (t.rest) { got = Math.max(0, y.allocEtf - Math.min(a.etfMindest, Math.max(0, y.frei))); will = null; }
      else { got = y[t.k]; will = t.will(a); }
      var note = "";
      if (t.ziel) { var stand = t.k === "allocHausEk" ? y.hausEk : y.notgroschen; if (stand >= a[t.ziel] - 0.5) note = "Ziel " + eur0(a[t.ziel]) + " erreicht"; else note = "Stand Ende " + y.jahr + ": " + eur0(stand) + " von " + eur0(a[t.ziel]); }
      if (t.k === "allocSonder" && y.kfw1 >= -0.5 && !got) note = "KfW 1 ist abbezahlt";
      return { i: i + 1, t: t, got: got, will: will, note: note };
    });
    var maxW = rows.reduce(function (m, x) { return Math.max(m, x.will || x.got); }, 1);
    var s2 = step(2, "Wie wird das Freie verteilt?", "Von oben nach unten: jeder Topf bekommt seinen Betrag, solange noch Geld da ist",
      '<ol class="pots">' + rows.map(function (x) {
        var full = x.will == null || x.got >= x.will - 0.5, w = x.will || x.got || 0;
        return '<li class="pot art-' + x.t.art + (x.got < 0.5 ? " empty" : "") + '"><span class="pot-n">' + x.i + '</span><div class="pot-main"><div class="pot-top"><span class="pot-name">' + x.t.name + '</span><span class="pot-tag">' + x.t.art + '</span></div>' +
          '<div class="pot-bar"><span class="pot-will" style="width:' + (w / maxW * 100).toFixed(1) + '%"></span><span class="pot-got" style="width:' + (x.got / maxW * 100).toFixed(1) + '%"></span></div>' +
          (x.note ? '<div class="pot-note muted small">' + esc(x.note) + "</div>" : "") + '</div><div class="pot-v"><b class="num">' + eur0(x.got) + "</b>" + (x.will != null && !full ? '<span class="muted small">von ' + eur0(x.will) + "</span>" : "") + "</div></li>";
      }).join("") + '</ol><div class="legend-row small muted"><span class="lg-dot art-gespart"></span>gespart <span class="lg-dot art-getilgt"></span>Schulden getilgt <span class="lg-dot art-ausgegeben"></span>ausgegeben</div>');

    /* ---------- Schritt 3: Wachstum ---------- */
    var s3 = step(3, "Wie wächst dein Vermögen?", "Bestände am Ende jedes Jahres",
      stackChart(years, zu.year, r.fiJahr) +
      '<div class="z-legend small"><span><i style="background:var(--c-etf)"></i>ETF (+' + fmtP(a.etfRendite) + ' p. a.)</span><span><i style="background:var(--c-hek)"></i>Haus-EK (0 %)</span><span><i style="background:var(--c-ng)"></i>Notgroschen (' + fmtP(a.notgroschenZins) + ')</span><span><i style="background:var(--c-kfw)"></i>KfW-Schulden</span></div>' +
      '<ul class="calc">' + calcRow("Notgroschen", y.notgroschen) + calcRow("Haus-Eigenkapital", y.hausEk) + calcRow("ETF", y.etf) + calcRow("KfW-Schulden", y.kfw1 + y.kfw2) +
      '<li class="calc-total"><span>Vermögen Ende ' + y.jahr + "</span>" + money(y.vermoegen) + "</li></ul>");

    /* ---------- Schritt 4: FI-Test ---------- */
    var cap = fiCap(y), ertrag = cap * 0.04, bedarf = y.fixkosten * 12, ok = ertrag >= bedarf;
    var s4 = step(4, "Wann bist du frei?", "Frei bist du, sobald 4 % deines Ersparten die Fixkosten eines Jahres decken",
      fiChart(years, zu.year, r.fiJahr) +
      '<div class="z-legend small"><span><i style="background:var(--accent)"></i>4 % deines Ersparten pro Jahr</span><span><i style="background:var(--neg)"></i>Fixkosten × 12</span></div>' +
      '<ul class="calc">' + calcRow("Erspartes (Notgroschen + Haus-EK + ETF)", cap) + calcRow("davon 4 % pro Jahr", ertrag) + calcRow("Fixkosten × 12", -bedarf) +
      '<li class="calc-total ' + (ok ? "ok" : "") + '"><span>' + y.jahr + (ok ? ": frei ✓" : ": noch nicht frei") + "</span>" + (ok ? money(ertrag - bedarf) : '<span class="num neg">es fehlen ' + eur0(bedarf - ertrag) + "</span>") + "</li></ul>" +
      '<p class="muted small">Gebraucht werden ' + eur0(bedarf / 0.04) + " Erspartes (Fixkosten × 12 ÷ 4 %).</p>");

    /* ---------- Annahmen ---------- */
    var groups = [
      ["Start", [["startjahr", "Startjahr", "j"], ["startalter", "Alter im Startjahr", "j"], ["monateJahr1", "Monate im 1. Jahr", "j"], ["endalter", "Rechnen bis Alter", "j"]]],
      ["Einnahmen & Fixkosten", [["einnahmen", "Einnahmen netto / Monat", "€"], ["wachstumEinnahmen", "Wachstum Einnahmen", "%"], ["einnahmenDeckel", "Einnahmen höchstens", "€"], ["fixkosten", "Fixkosten / Monat", "€"], ["wachstumFix", "Wachstum Fixkosten", "%"], ["fixkostenDeckel", "Fixkosten höchstens", "€"]]],
      ["Töpfe", [["etfMindest", "ETF-Mindestbetrag", "€"], ["lebensqualitaet", "Lebensqualität", "€"], ["kfw1Sonder", "KfW-Sondertilgung", "€"], ["autoPauschale", "Auto-Pauschale", "€"], ["kindSparrate", "Kind-Sparrate", "€"], ["hausEkRate", "Haus-EK / Monat", "€"], ["hausEkZiel", "Haus-EK-Ziel", "€"], ["notgroschenRate", "Notgroschen / Monat", "€"], ["notgroschenZiel", "Notgroschen-Ziel", "€"]]],
      ["Startbestände & Rendite", [["etfStart", "ETF heute", "€"], ["notgroschenStart", "Notgroschen heute", "€"], ["hausEkStart", "Haus-EK heute", "€"], ["kfw1Rest", "KfW 1 Restschuld", "€"], ["kfw2Rest", "KfW 2 Restschuld", "€"], ["etfRendite", "ETF-Rendite p. a.", "%"], ["notgroschenZins", "Notgroschen-Zins p. a.", "%"]]]
    ];
    var ann = '<div class="card"><div class="card-head"><h2>Deine Annahmen</h2>' + btn(zu.edit ? "Fertig" : "Bearbeiten", "zEdit", "", zu.edit ? "btn-primary" : "") + '</div><div class="ann-grid">' + groups.map(function (g) {
      return '<div class="ann-g"><h3>' + g[0] + '</h3><dl class="kv">' + g[1].map(function (f) {
        var v = a[f[0]], shown = f[2] === "%" ? c.fmt.format(v * 100) + " %" : f[2] === "j" ? String(v) : eur(v);
        return "<div><dt>" + f[1] + "</dt><dd>" + (zu.edit ? '<input class="in-num" inputmode="decimal" data-act="zFi" data-k="' + f[0] + '" data-t="' + f[2] + '" value="' + (f[2] === "%" ? c.fmt.format(v * 100) : f[2] === "j" ? v : c.fmt.format(v)) + '">' : '<span class="num">' + shown + "</span>") + "</dd></div>";
      }).join("") + "</dl></div>";
    }).join("") + '</div><p class="muted small">Haus-EK-Ziel kommt heute aus dem Hauskauf-Szenario (' + (a.hausEkZielAusHauskauf ? "gekoppelt" : "nicht gekoppelt") + "). KfW-Tilgungspläne und Lebensereignisse lasse ich im Entwurf unverändert.</p></div>";

    /* ---------- Prüfpunkte ---------- */
    var checks = pruefpunkte(c, a, r);
    var pp = '<div class="card"><h2>7 Prüfpunkte: was an dieser Rechnung auffällt</h2><p class="muted small">Jeder Punkt rechnet live mit deinen Annahmen. Ändere oben etwas, dann ändern sich auch die Beispiele.</p><div class="pp-list">' + checks.map(function (p, i) {
      var open = zu.open[i] !== false && (zu.open[i] || i === 0);
      return '<details class="pp ' + p.kind + '"' + (open ? " open" : "") + ' data-pp="' + i + '"><summary><span class="pp-n">' + (i + 1) + '</span><span class="pp-t">' + p.title + '</span><span class="pp-k">' + (p.kind === "fehler" ? "Rechenfehler" : "Annahme") + "</span></summary>" +
        '<div class="pp-b"><div class="pp-col"><h4>Was passiert</h4><p>' + p.was + '</p></div><div class="pp-col"><h4>Beispiel mit deinen Zahlen</h4>' + p.bsp + '</div><div class="pp-col pp-res"><h4>Folge</h4><p>' + p.folge + "</p></div></div></details>";
    }).join("") + "</div></div>";

    return '<h1 class="page-t">Zukunft</h1><p class="lead muted">So rechnet die FI-Planung heute, Schritt für Schritt. Noch ist nichts geändert.</p>' +
      '<div class="z-top">' + hero + slider + "</div>" + '<div class="z-steps">' + s1 + s2 + s3 + s4 + "</div>" + ann + pp;

    function calcRow(label, v, hint) { return '<li><span>' + label + (hint ? ' <em class="muted">' + esc(hint) + "</em>" : "") + "</span>" + money(v) + "</li>"; }
    function fmtP(v) { return c.fmt.format(v * 100).replace(/,00$/, "") + " %"; }
  }

  function step(n, title, sub, body) {
    return '<section class="card z-step"><div class="z-step-h"><span class="z-n">' + n + '</span><div><h2>' + title + '</h2><p class="muted small">' + sub + "</p></div></div>" + body + "</section>";
  }

  /* ---------- Diagramme ---------- */
  function scale(years, vals) {
    var W = 640, H = 220, P = 30, minY = Math.min(0, Math.min.apply(null, vals)), maxY = Math.max.apply(null, vals);
    return {
      W: W, H: H, P: P, minY: minY, maxY: maxY,
      X: function (i) { return P + (i / (years.length - 1)) * (W - P * 2); },
      Y: function (v) { return H - P - ((v - minY) / (maxY - minY || 1)) * (H - P * 2); }
    };
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
    var tops = years.map(function (y) { return y.notgroschen + y.hausEk + y.etf; }), bots = years.map(function (y) { return y.kfw1 + y.kfw2; });
    var s = scale(years, tops.concat(bots));
    function area(lo, hi, cls) {
      var up = years.map(function (y, i) { return s.X(i).toFixed(1) + " " + s.Y(hi(y)).toFixed(1); }), dn = years.map(function (y, i) { return s.X(i).toFixed(1) + " " + s.Y(lo(y)).toFixed(1); }).reverse();
      return '<path class="' + cls + '" d="M' + up.join(" L") + " L" + dn.join(" L") + ' Z"/>';
    }
    return '<svg class="chart z-chart" viewBox="0 0 ' + s.W + " " + s.H + '" preserveAspectRatio="none" role="img" aria-label="Vermögensentwicklung">' +
      area(function () { return 0; }, function (y) { return y.notgroschen; }, "a-ng") +
      area(function (y) { return y.notgroschen; }, function (y) { return y.notgroschen + y.hausEk; }, "a-hek") +
      area(function (y) { return y.notgroschen + y.hausEk; }, function (y) { return y.notgroschen + y.hausEk + y.etf; }, "a-etf") +
      area(function (y) { return y.kfw1 + y.kfw2; }, function () { return 0; }, "a-kfw") + marks(s, years, sel, fiJ) + "</svg>";
  }
  function fiChart(years, sel, fiJ) {
    var e = years.map(function (y) { return fiCap(y) * 0.04; }), b = years.map(function (y) { return y.fixkosten * 12; });
    var s = scale(years, e.concat(b));
    function line(vals, cls) { return '<path class="' + cls + '" d="' + vals.map(function (v, i) { return (i ? "L" : "M") + s.X(i).toFixed(1) + " " + s.Y(v).toFixed(1); }).join(" ") + '"/>'; }
    return '<svg class="chart z-chart" viewBox="0 0 ' + s.W + " " + s.H + '" preserveAspectRatio="none" role="img" aria-label="FI-Test">' + line(b, "l-bedarf") + line(e, "l-ertrag") + marks(s, years, sel, fiJ) + "</svg>";
  }

  /* ---------- Die 7 Prüfpunkte, live berechnet ---------- */
  function pruefpunkte(c, a, r) {
    var L = c.L, eur0 = c.eur0, esc = c.esc, base = r.fiJahr;
    function run(mod) { var b = clone(a); mod(b); return L.runFI(b); }
    function cmp(rows) { return '<table class="pp-tbl"><tbody>' + rows.map(function (x) { return "<tr><td>" + x[0] + '</td><td class="num">' + x[1] + "</td></tr>"; }).join("") + "</tbody></table>"; }
    var lastFix = r.years[r.years.length - 1].fixkosten, extra = a.lebensqualitaet + a.autoPauschale + a.kindSparrate;
    var p1 = yearWhen(r, function (y) { return fiCap(y) * 0.04 >= (y.fixkosten + extra) * 12; });
    var p2 = yearWhen(r, function (y) { return (y.notgroschen + y.etf) * 0.04 >= y.fixkosten * 12; });
    var evY = a.startjahr + 2, evs = [-20000, -30000, -40000].map(function (ev) {
      var rr = run(function (b) { b.events = [{ jahr: evY, beschreibung: "Test", betrag: ev }]; });
      var y0 = r.years.find(function (y) { return y.jahr === evY; }), y1 = rr.years.find(function (y) { return y.jahr === evY; });
      return [ev, y0.vermoegen - y1.vermoegen, y0.allocLebensqual - y1.allocLebensqual + y0.allocAutoKind - y1.allocAutoKind];
    });
    var bisFi = r.years.filter(function (y) { return y.jahr <= base; });
    var lq = bisFi.reduce(function (s, y) { return s + y.allocLebensqual * y.monate; }, 0), ak = bisFi.reduce(function (s, y) { return s + y.allocAutoKind * y.monate; }, 0);
    var kindTotal = a.kindSparrate * bisFi.reduce(function (s, y) { return s + y.monate; }, 0);
    var ex = c.state.expected.filter(function (i) { return i.aktiv; });
    function sumT(t) { return ex.filter(function (i) { return i.typ === t; }).reduce(function (s, i) { return s + i.betrag; }, 0); }
    var mEin = sumT("Einnahme"), mFix = -sumT("Fixkosten"), mKred = -sumT("Schulden");
    var r6 = run(function (b) { b.einnahmen = mEin; b.fixkosten = mFix; b.fixkostenDeckel = Math.max(b.fixkostenDeckel, mFix * 1.3); });
    var now = new Date(), rest = 12 - now.getMonth();
    var r7 = run(function (b) { b.monateJahr1 = rest; });
    var r5 = run(function (b) { b.notgroschenStart = 10000; b.etfStart = 5000; });
    var autoEv = (a.events || []).filter(function (e) { return !Number(e.betrag); }).length;

    return [
      { kind: "annahme", title: "Der FI-Test zählt nur die Fixkosten",
        was: "Frei bist du laut Rechnung, wenn 4 % deines Ersparten die <b>Fixkosten</b> decken. Lebensqualität (" + eur0(a.lebensqualitaet) + ") und Auto + Kind (" + eur0(a.autoPauschale + a.kindSparrate) + ") zählen nicht mit, obwohl du davon lebst.",
        bsp: cmp([["Gebraucht, nur Fixkosten (" + eur0(lastFix) + "/Monat)", eur0(lastFix * 12 / 0.04)], ["Gebraucht, mit Lebensqualität und Auto + Kind (" + eur0(lastFix + extra) + "/Monat)", eur0((lastFix + extra) * 12 / 0.04)], ["FI-Jahr heute", base], ["FI-Jahr mit allen Ausgaben", p1 || "nie (bis " + r.years[r.years.length - 1].jahr + ")"]]),
        folge: "Das FI-Jahr ist eher zu früh. Mit allen laufenden Ausgaben wärst du " + (p1 ? (p1 - base) + " Jahre später" : "im Rechenzeitraum gar nicht") + " frei." },
      { kind: "annahme", title: "Das Haus-Eigenkapital zählt zum FI-Vermögen",
        was: "Das Geld fürs Haus wird angespart, bis das Ziel erreicht ist. Danach bleibt es für immer stehen, ohne Zinsen, und zählt beim FI-Test mit. Ein Hauskauf passiert in der Rechnung nie.",
        bsp: cmp([["Haus-EK im FI-Jahr " + base, eur0((r.years.find(function (y) { return y.jahr === base; }) || {}).hausEk || 0)], ["FI-Jahr heute", base], ["FI-Jahr ohne Haus-EK", p2 || "nie"]]),
        folge: "Kaufst du das Haus wirklich, ist das Geld weg und das FI-Jahr verschiebt sich. Kaufst du nie, liegt es zinslos herum." },
      { kind: "fehler", title: "Große Lebensereignisse verschwinden still",
        was: "Ein Ereignis wird durch 12 geteilt und vom Freien abgezogen. Zuerst schrumpfen dadurch die Töpfe unten (ETF-Rest, Notgroschen, Haus-EK), dann Auto + Kind und Lebensqualität. Ist das Ereignis größer als das Freie, wird der Rest <b>nirgends</b> abgezogen.",
        bsp: '<p class="small">Test: ein Ereignis im Jahr ' + evY + ".</p>" + cmp(evs.map(function (e) { return ["Ereignis " + eur0(e[0]) + " → Vermögen sinkt um", eur0(e[1])]; })) +
          '<p class="small muted">Erwartet wäre, dass das Vermögen um den vollen Betrag sinkt. Ab einer Grenze ändert sich gar nichts mehr. Außerdem werden bis zu ' + eur0(evs[0][2] * 12) + " Lebensqualität und Auto + Kind „gespart“, die du in Wirklichkeit trotzdem ausgibst.</p>",
        folge: "Ein teures Ereignis macht dich in der Rechnung kaum ärmer. Heute fällt das nicht auf, weil " + autoEv + " von " + (a.events || []).length + " Ereignissen auf 0 € stehen." },
      { kind: "annahme", title: "Auto + Kind und Lebensqualität sind reine Ausgaben",
        was: "Beide Töpfe werden jeden Monat ausgegeben. Auch die <b>Kind-Sparrate</b> (" + eur0(a.kindSparrate) + "/Monat) wird nirgends angespart, obwohl sie „Sparrate“ heißt.",
        bsp: cmp([["Lebensqualität bis " + base, eur0(lq)], ["Auto + Kind bis " + base, eur0(ak)], ["davon Kind-Sparrate", eur0(kindTotal)], ["davon irgendwo angespart", "0 €"]]),
        folge: "Soll die Kind-Sparrate ein echtes Polster werden, braucht sie einen eigenen Topf. Sonst ist sie nur ein Name für eine Ausgabe." },
      { kind: "annahme", title: "Die Startbestände stehen auf 0",
        was: "ETF, Notgroschen und Haus-EK starten bei 0 €. Dein Tagesgeld und ein Depot fehlen also. „Vermögen heute“ zeigt nur die KfW-Schulden.",
        bsp: cmp([["Vermögen heute", eur0(r.vermoegenHeute)], ["Beispiel: 10.000 € Notgroschen + 5.000 € ETF", eur0(r5.vermoegenHeute)], ["FI-Jahr heute → mit Beispiel", base + " → " + r5.fiJahr]]),
        folge: "Ohne echte Startwerte ist der Plan zu pessimistisch, und „Vermögen heute“ sagt wenig aus." },
      { kind: "annahme", title: "Die Zahlen passen nicht zum Monat",
        was: "Die Zukunft hat eigene Werte für Einnahmen und Fixkosten. Sie passen nicht zu deinen festen Posten im Monat.",
        bsp: cmp([["Einnahmen: Zukunft · Monat", eur0(a.einnahmen) + " · " + eur0(mEin)], ["Fixkosten: Zukunft · Monat", eur0(a.fixkosten) + " · " + eur0(mFix)], ["Kredite: Zukunft · Monat", eur0(r.years[0].kfw1Pfl + r.years[0].kfw2Pfl) + " · " + eur0(mKred)], ["FI-Jahr mit den Monatszahlen", (r6.fiJahr || "nie") + " statt " + base]]),
        folge: "Beide Bereiche leben nebeneinander her. Welche Zahlen stimmen, weiß nur die Monatsplanung." },
      { kind: "annahme", title: "Das erste Jahr hat fest " + a.monateJahr1 + " Monate",
        was: "Wie viele Monate 2026 noch gerechnet werden, ist fest eingetippt und wandert nicht mit dem Kalender mit.",
        bsp: cmp([["Eingetragen", a.monateJahr1 + " Monate"], ["Heute (" + now.toLocaleDateString("de-DE", { month: "long" }) + ") wären es", rest + " Monate"], ["FI-Jahr heute → mit " + rest + " Monaten", base + " → " + r7.fiJahr]]),
        folge: "Schon ein Monat Unterschied kann das FI-Jahr verschieben. Und im Januar stimmt das Startjahr nicht mehr." }
    ];
  }

  /* ---------- Ereignisse ---------- */
  function handle(c, a, d, el) {
    if (a === "zSetYear") { zu.year = +d.y; return true; }
    if (a === "zEdit") { zu.edit = !zu.edit; return true; }
    return false;
  }
  function change(c, el) {
    if (el.dataset.act === "zYear") { zu.year = +el.value; return true; }
    if (el.dataset.act === "zFi") {
      var n = c.parseNum(el.value); if (isNaN(n)) return true;
      if (el.dataset.t === "%") n = n / 100;
      c.mark("Annahme geändert"); c.state.fi[el.dataset.k] = n; return true;
    }
    return false;
  }
  window.BoSalZukunft = { render: render, handle: handle, change: change, zu: zu };
})();
