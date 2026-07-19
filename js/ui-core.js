/* ui-core.js — Shell, Navigation, gemeinsame Bausteine */
"use strict";
var UI = (function () {
  var el = U.el;
  var views = {};       // name → render(container, state)
  var NAV = [
    { group: "Übersicht" },
    { id: "dashboard", label: "Dashboard", ico: "◧" },
    { id: "monat", label: "Monat", ico: "▦" },
    { group: "Daten" },
    { id: "import", label: "CSV-Import", ico: "⇪" },
    { id: "posten", label: "Posten & Kategorien", ico: "❖" },
    { group: "Planung" },
    { id: "fi", label: "FI-Planung", ico: "⤒" },
    { id: "hauskauf", label: "Hauskauf", ico: "⌂" },
    { id: "hochzeit", label: "Hochzeit", ico: "❤" },
    { id: "kinder", label: "Kinder", ico: "☺" },
    { group: "System" },
    { id: "backup", label: "Backup & Einstellungen", ico: "⛃" }
  ];

  function registerView(name, render) { views[name] = render; }
  // Ersetzt den früheren festen "APP_MODE === mobile"-Vergleich: reagiert auf die ECHTE
  // Fensterbreite, damit z. B. ein schmal gezogenes natives Mac-Fenster ebenfalls die
  // übersichtlichere Karten-Darstellung bekommt statt einer gequetschten Tabelle.
  function isNarrow() {
    try { return window.matchMedia("(max-width: 860px)").matches; }
    catch (e) { return window.APP_MODE === "mobile"; }
  }

  function currentView() { return Store.get().ui.view || "dashboard"; }
  var scrollToTopNext = false;
  function go(name, opts) {
    var s = Store.get();
    s.ui.view = name;
    if (opts && opts.month) s.ui.month = opts.month;
    scrollToTopNext = true;
    Store.commit();
    render();
  }

  var lastNarrow = null;
  function watchResize() {
    var handler = U.debounce(function () {
      var now = isNarrow();
      if (now !== lastNarrow) { lastNarrow = now; render(); }
    }, 150);
    window.addEventListener("resize", handler);
  }
  function buildShell() {
    var root = document.getElementById("app");
    U.clear(root);
    var side = el("aside", { class: "sidebar" },
      el("div", { class: "brand" },
        el("span", { class: "brand-icon", "aria-hidden": "true" },
          el("svg", { viewBox: "0 0 24 24", width: "20", height: "20" },
            (function () { var s = document.createElementNS("http://www.w3.org/2000/svg", "path"); s.setAttribute("d", "M4 16 L9 10 L13 13 L20 5"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2.4"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); return s; })())),
        el("span", { class: "brand-mark" }, "FiPla")),
      el("nav", { class: "nav", id: "nav" }));
    var top = el("header", { class: "topbar" },
      el("div", { class: "topbar-row" },
        el("span", { class: "brand-icon", "aria-hidden": "true" },
          el("svg", { viewBox: "0 0 24 24", width: "18", height: "18" },
            (function () { var s = document.createElementNS("http://www.w3.org/2000/svg", "path"); s.setAttribute("d", "M4 16 L9 10 L13 13 L20 5"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2.4"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); return s; })())),
        el("span", { class: "brand-mark", style: "font-family:var(--mono);font-weight:700;color:var(--pos)" }, "FiPla")),
      el("div", { class: "tabs", id: "tabs" }));
    var main = el("main", { class: "main", id: "view" });
    root.appendChild(side);
    root.appendChild(el("div", { style: "min-width:0" }, top, main));
    renderNav();
    lastNarrow = isNarrow();
    watchResize();
  }

  function renderNav() {
    var active = currentView();
    var nav = document.getElementById("nav"), tabs = document.getElementById("tabs");
    U.clear(nav); U.clear(tabs);
    NAV.forEach(function (item) {
      if (item.group) { nav.appendChild(el("div", { class: "nav-group" }, item.group)); return; }
      nav.appendChild(el("button", {
        class: item.id === active ? "active" : "", onclick: function () { go(item.id); }
      }, el("span", { class: "ico" }, item.ico), item.label));
      tabs.appendChild(el("button", {
        class: item.id === active ? "active" : "", onclick: function () { go(item.id); }
      }, item.label));
    });
    // aktiven Tab in Sicht scrollen
    var act = tabs.querySelector("button.active");
    if (act && act.scrollIntoView) act.scrollIntoView({ inline: "center", block: "nearest" });
  }

  function render() {
    // Scroll-Position über das Neu-Rendern hinweg erhalten (sonst springt die
    // Seite nach jeder Eingabe an den Anfang). Nur bei Navigation nach oben.
    var y = scrollToTopNext ? 0 : (window.scrollY || window.pageYOffset || 0);
    scrollToTopNext = false;
    renderNav();
    var host = document.getElementById("view");
    U.clear(host);
    var fn = views[currentView()] || views.dashboard;
    fn(host, Store.get());
    window.scrollTo(0, y);
    if (window.requestAnimationFrame) requestAnimationFrame(function () { window.scrollTo(0, y); });
  }

  /* Auf-/zuklappbare Karte; Zustand wird pro Karte gespeichert.
     cfg: { key, title, hint, defaultOpen, right? } · build() liefert den Inhalt erst bei geöffneter Karte */
  function collapsibleCard(cfg, build) {
    var s = Store.get();
    s.ui.collapsed = s.ui.collapsed || {};
    var open = s.ui.collapsed[cfg.key] == null ? (cfg.defaultOpen !== false) : !s.ui.collapsed[cfg.key];
    var chev = el("span", { class: "chev", "aria-hidden": "true" }, open ? "▾" : "▸");
    var head = el("button", {
      class: "card-toggle", "aria-expanded": open ? "true" : "false",
      onclick: function () { s.ui.collapsed[cfg.key] = open; Store.commit(); render(); }
    }, chev, el("span", { class: "card-toggle-title" }, cfg.title),
      cfg.hint ? el("span", { class: "hint" }, cfg.hint) : null);
    var headRow = el("div", { class: "card-toggle-row" }, head);
    if (cfg.right) headRow.appendChild(cfg.right);
    var card = el("section", { class: "card" + (open ? "" : " collapsed") }, headRow);
    if (open) {
      var body = el("div", { class: "card-body" });
      build(body);
      card.appendChild(body);
    }
    return card;
  }

  /* ---------- Bausteine ---------- */
  function pageHead(title, sub, rightNodes) {
    var head = el("div", { class: "page-head" },
      el("div", {}, el("h1", { class: "page-title" }, title), sub ? el("p", { class: "page-sub" }, sub) : null),
      el("div", { class: "spacer" }));
    (rightNodes || []).forEach(function (n) { head.appendChild(n); });
    return head;
  }

  function kpi(label, valueNode, sub, cls) {
    return el("div", { class: "kpi-card" },
      el("div", { class: "eyebrow" }, label),
      el("div", { class: "kpi-value " + (cls || "") }, valueNode),
      sub ? el("div", { class: "kpi-sub" }, sub) : null);
  }
  function money(v, opts) {
    var cls = v > 0 ? "pos" : v < 0 ? "neg" : "";
    if (opts && opts.neutral) cls = "";
    return el("span", { class: "num " + cls }, U.eur(v, opts));
  }
  function statusBadge(status) {
    var map = { ok: ["ok", "passt"], abweichung: ["abweichung", "Abweichung"], offen: ["offen", "offen"] };
    var m = map[status] || map.offen;
    return el("span", { class: "badge " + m[0] }, m[1]);
  }

  // Editierbares Zahlenfeld: cfg {value, onchange, prozent, ganz, min, hint}
  function numInput(cfg) {
    var val = cfg.prozent ? (cfg.value * 100) : cfg.value;
    var shown = "";
    if (val != null && !isNaN(val)) {
      shown = cfg.plain
        ? String(Math.round(val))                                            // Jahre, Anzahlen: 2026 statt 2.026
        : (Math.round(val * 10000) / 10000).toLocaleString("de-DE", { maximumFractionDigits: 4 });
    }
    var inp = el("input", {
      type: "text", inputmode: cfg.plain ? "numeric" : "decimal", class: "inline-num",
      value: shown
    });
    function apply() {
      var n = U.parseInputNumber(inp.value);
      if (isNaN(n)) { inp.value = ""; if (cfg.allowEmpty) { cfg.onchange(null); return; } n = 0; }
      if (cfg.prozent) n = n / 100;
      if (cfg.min != null && n < cfg.min) n = cfg.min;
      cfg.onchange(n);
    }
    inp.addEventListener("change", apply);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { inp.blur(); } });
    return inp;
  }
  // kind: "fix" (🔒 gesetzlich/gegeben) | "verhandelbar" (⚙️) | "schaetzung" (💡) | default = deine Eingabe
  function field(labelText, inputNode, after, opts) {
    opts = opts || {};
    var cls = "fld " + (opts.kind ? "fld-" + opts.kind : "blau");
    var badge = opts.kind === "fix" ? "🔒" : opts.kind === "verhandelbar" ? "⚙️" : opts.kind === "schaetzung" ? "💡" : null;
    var lbl = el("span", {}, labelText, badge ? el("span", { class: "fld-badge", title: opts.kindHint || "" }, " " + badge) : null);
    var node = el("label", { class: cls, title: opts.tip || "" },
      lbl, inputNode,
      after ? el("div", { class: "after" }, after) : null);
    return node;
  }
  function textInput(value, onchange, attrs) {
    var inp = el("input", Object.assign({ type: "text", value: value == null ? "" : value }, attrs || {}));
    inp.addEventListener("change", function () { onchange(inp.value); });
    return inp;
  }

  function categorySelect(state, tx) {
    var sel = el("select", { class: "select-cat" });
    var groups = { einnahme: el("optgroup", { label: "Einnahmen" }), ausgabe: el("optgroup", { label: "Ausgaben" }) };
    state.categories.forEach(function (c) {
      var o = el("option", { value: c.id }, c.icon + " " + c.name);
      if (c.id === tx.kategorieId) o.selected = true;
      groups[c.typ].appendChild(o);
    });
    sel.appendChild(groups.einnahme); sel.appendChild(groups.ausgabe);
    sel.addEventListener("change", function () {
      tx.kategorieId = sel.value;
      tx.manuelleKat = true;
      Store.commit();
      offerRule(state, tx);
    });
    return sel;
  }

  // Nach manueller Kategorisierung: Regel für Empfänger merken?
  function offerRule(state, tx) {
    var cat = state.categories.find(function (c) { return c.id === tx.kategorieId; });
    if (!cat || cat.system) { render(); return; }
    var kwRaw = (tx.empfaenger || tx.zweck || "").split("/")[0].trim().toLowerCase().slice(0, 30).trim();
    if (!kwRaw) { render(); return; }
    if ((cat.keywords || []).indexOf(kwRaw) !== -1) { render(); return; }
    confirmDialog({
      title: "Regel merken?",
      body: "Sollen Buchungen mit \u201E" + kwRaw + "\u201C künftig automatisch als " + cat.icon + " " + cat.name + " kategorisiert werden?",
      okLabel: "Regel speichern", cancelLabel: "Nur diese Buchung"
    }, function (yes) {
      if (yes) {
        cat.keywords = cat.keywords || [];
        cat.keywords.push(kwRaw);
        Store.commit({ recompute: true });
        U.toast("Regel gespeichert: \u201E" + kwRaw + "\u201C → " + cat.name, "ok");
      }
      render();
    });
  }

  function confirmDialog(cfg, cb) {
    var dlg = el("dialog", { class: "modal" });
    var done = false;
    function finish(v) { if (done) return; done = true; dlg.close(); dlg.remove(); cb(v); }
    dlg.appendChild(el("h3", { style: "margin:0 0 8px" }, cfg.title));
    dlg.appendChild(el("p", { class: "muted", style: "margin:0 0 16px" }, cfg.body));
    dlg.appendChild(el("div", { class: "btn-row", style: "justify-content:flex-end" },
      el("button", { class: "btn ghost", onclick: function () { finish(false); } }, cfg.cancelLabel || "Abbrechen"),
      el("button", { class: "btn " + (cfg.danger ? "danger" : "primary"), onclick: function () { finish(true); } }, cfg.okLabel || "OK")));
    dlg.addEventListener("close", function () { finish(false); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  function printButton(label) {
    return el("button", {
      class: "btn sm ghost", "aria-label": "Diese Ansicht drucken", title: "Drucken oder als PDF sichern (über den Systemdruck-Dialog)",
      onclick: function () { window.print(); }
    }, "🖨 " + (label || "Drucken"));
  }
  // Einheitlicher Leerzustand: gleiche Stimme, gleiches Symbol, statt fünf leicht
  // unterschiedlicher Formulierungen quer durch die App.
  function emptyState(text, icon) {
    return el("div", { class: "empty-state" }, el("span", { class: "ico" }, icon || "◌"), el("span", {}, text));
  }
  // Monats-Auswahl als <select> statt <input type="month"> — Safari/WebKit
  // (= die Mac-App) hat keinen nativen Monats-Picker, das Input wäre dort nur
  // ein unbegleitetes Textfeld. cfg: { value, onChange, center, back, forward,
  // placeholder, attrs }. `center` ist bewusst fix (Standard: heute), nicht der
  // gerade angezeigte Monat — sonst würde sich der erreichbare Bereich bei
  // jeder Navigation verschieben statt stabil zu bleiben.
  function monthSelect(cfg) {
    var center = cfg.center || U.currentMonth();
    var y0 = parseInt(center.slice(0, 4), 10), m0 = parseInt(center.slice(5, 7), 10);
    var back = cfg.back != null ? cfg.back : 48, forward = cfg.forward != null ? cfg.forward : 48;
    var sel = el("select", cfg.attrs || {});
    if (cfg.placeholder) sel.appendChild(el("option", { value: "" }, cfg.placeholder));
    for (var off = -back; off <= forward; off++) {
      var d = new Date(y0, m0 - 1 + off, 1);
      var key = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
      sel.appendChild(el("option", { value: key, selected: key === cfg.value }, U.monthLabel(key)));
    }
    sel.addEventListener("change", function () { cfg.onChange(sel.value); });
    return sel;
  }
  function table(headers, rows, footRow) {
    var thead = el("thead", {}, el("tr", {}, headers.map(function (h) {
      return el("th", { class: h.r ? "r" : "" }, h.label != null ? h.label : h);
    })));
    var tbody = el("tbody", {}, rows);
    var t = el("table", { class: "tbl" }, thead, tbody);
    if (footRow) t.appendChild(el("tfoot", {}, footRow));
    return el("div", { class: "tbl-wrap" }, t);
  }
  function td(content, cls) { return el("td", { class: cls || "" }, content); }

  return {
    registerView: registerView, buildShell: buildShell, render: render, go: go,
    pageHead: pageHead, kpi: kpi, money: money, statusBadge: statusBadge,
    numInput: numInput, field: field, textInput: textInput, collapsibleCard: collapsibleCard, isNarrow: isNarrow, emptyState: emptyState, printButton: printButton, monthSelect: monthSelect,
    categorySelect: categorySelect, confirmDialog: confirmDialog, table: table, td: td
  };
})();
