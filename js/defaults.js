/* defaults.js — Standard-Kategorien, Regeln und Modul-Annahmen */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DEFAULTS = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var categories = [
    // System-Kategorien (nicht löschbar)
    { id: "sys-einnahme", name: "Sonstige Einnahme", typ: "einnahme", farbe: "#8C99B4", icon: "＋", keywords: [], system: true },
    { id: "sys-ausgabe", name: "Sonstige Ausgabe", typ: "ausgabe", farbe: "#8C99B4", icon: "−", keywords: [], system: true },
    // Einnahmen
    { id: "gehalt", name: "Gehalt", typ: "einnahme", farbe: "#34D399", icon: "💼", keywords: [] },
    { id: "mietanteil", name: "Mietanteil", typ: "einnahme", farbe: "#5EEAD4", icon: "🤝", keywords: [] },
    { id: "erstattung", name: "Erstattung", typ: "einnahme", farbe: "#86EFAC", icon: "↩", keywords: ["erstattung", "rueckzahlung", "gutschrift stadtwerke"] },
    { id: "verkauf", name: "Verkauf & Sonstiges", typ: "einnahme", farbe: "#A7F3D0", icon: "🏷", keywords: ["ticketswap", "kleinanzeigen", "ebay"] },
    // Ausgaben
    { id: "wohnen", name: "Wohnen & Energie", typ: "ausgabe", farbe: "#F5B14C", icon: "🏠", keywords: [] },
    { id: "lebensmittel", name: "Lebensmittel", typ: "ausgabe", farbe: "#4ADE80", icon: "🛒", keywords: ["rewe", "edeka", "lidl", "aldi", "netto marken", "penny", "kaufland", "nahkauf", "denns"] },
    { id: "restaurants", name: "Restaurants & Lieferdienste", typ: "ausgabe", farbe: "#FB923C", icon: "🍽", keywords: ["lieferando", "restaurant", "grill", "pizzeria", "mcdonald", "burger", "doener", "sushi", "cafe ", "baeckerei", "backerei"] },
    { id: "shopping", name: "Shopping", typ: "ausgabe", farbe: "#F472B6", icon: "🛍", keywords: ["amazon", "amzn", "zalando", "h&m", "media markt", "saturn", "riverty"] },
    { id: "mobilitaet", name: "Mobilität", typ: "ausgabe", farbe: "#60A5FA", icon: "🚆", keywords: ["db vertrieb", "deutsche bahn", "uber", "bolt", "aral", "shell", "esso", "jet tank", "flixbus", "aseag"] },
    { id: "abos", name: "Abos & Digitales", typ: "ausgabe", farbe: "#A78BFA", icon: "📱", keywords: ["netflix", "apple.com", "google", "steam", "playstation", "disney"] },
    { id: "vertraege", name: "Verträge & Kommunikation", typ: "ausgabe", farbe: "#818CF8", icon: "📄", keywords: [] },
    { id: "versicherung", name: "Versicherungen", typ: "ausgabe", farbe: "#2DD4BF", icon: "🛡", keywords: ["versicherung", "oerag", "rechtsschutz", "huk", "allianz"] },
    { id: "gesundheit", name: "Gesundheit & Fitness", typ: "ausgabe", farbe: "#34D399", icon: "💪", keywords: ["apotheke", "arzt", "physio"] },
    { id: "freizeit", name: "Freizeit & Kultur", typ: "ausgabe", farbe: "#FBBF24", icon: "🎟", keywords: ["kino", "eventim", "ticket", "museum", "theater", "spotify family"] },
    { id: "sparen", name: "Sparen & Investieren", typ: "ausgabe", farbe: "#38BDF8", icon: "📈", keywords: ["trade republic", "scalable", "depot"] },
    { id: "schulden", name: "Schulden & Kredite", typ: "ausgabe", farbe: "#F87462", icon: "🏦", keywords: [] },
    { id: "bargeld", name: "Bargeld", typ: "ausgabe", farbe: "#CBD5E1", icon: "💶", keywords: ["geldautomat", "ga nr", "bargeldausz"] }
  ];

  var fi = {
    startjahr: 2026, startalter: 29, endalter: 72, monateJahr1: 4,
    einnahmen: 3430.35, wachstumEinnahmen: 0.03, einnahmenDeckel: 4500,
    fixkosten: 1154, wachstumFix: 0.02, fixkostenDeckel: 1400,
    etfRendite: 0.05, notgroschenZins: 0,
    notgroschenZiel: 15000, notgroschenRate: 400, notgroschenStart: 0,
    hausEkZiel: 64535, hausEkZielAusHauskauf: true, hausEkAnteil: 0.5, hausEkRate: 500, hausEkStart: 0,
    kfw1Sonder: 500, kindSparrate: 200,
    kfw1Rest: 14951.97, kfw2Rest: 4800,
    autoPauschale: 200, lebensqualitaet: 600, etfMindest: 50, etfStart: 0,
    kfw1Plan: { 2026: 500, 2027: 400, 2028: 200, 2029: 100 }, kfw1PlanDefault: 500,
    kfw2Plan: { 2026: 0, 2027: 100, 2028: 200, 2029: 100 }, kfw2PlanDefault: 0,
    events: [
      { jahr: 2027, beschreibung: "Auto", betrag: 0 },
      { jahr: 2028, beschreibung: "Urlaub Groß", betrag: 0 },
      { jahr: 2030, beschreibung: "Hochzeit", betrag: 0 },
      { jahr: 2031, beschreibung: "Kind 1 Erstausstattung", betrag: 0 },
      { jahr: 2033, beschreibung: "Kind 2 Erstausstattung", betrag: 0 },
      { jahr: 2034, beschreibung: "Auto Ersatz", betrag: 0 },
      { jahr: 2038, beschreibung: "Möbel neu", betrag: 0 },
      { jahr: 2041, beschreibung: "Auto Ersatz", betrag: 0 },
      { jahr: 2045, beschreibung: "Reise Groß", betrag: 0 },
      { jahr: 2048, beschreibung: "Auto Ersatz", betrag: 0 },
      { jahr: 2055, beschreibung: "Reise Groß", betrag: 0 }
    ]
  };

  var hauskauf = {
    kaufpreis: 500000, grunderwerbSatz: 0.065, notarSatz: 0.02, maklerSatz: 0.0357,
    renovierung: 30000, sanierung: 40000, umzug: 15000,
    ekQuote: 0.20, zins: 0.042, tilgung: 0.03, ekHeute: 0,
    nebenkosten: [
      { name: "Grundsteuer", betrag: 50, hint: "🔒 Pflicht (Gemeinde)" },
      { name: "Gebäudeversicherung", betrag: 50, hint: "⚙️ dringend empfohlen" },
      { name: "Hausrat + Elementar", betrag: 25, hint: "⚙️ empfohlen" },
      { name: "Heizung", betrag: 200, hint: "💡 Verbrauch" },
      { name: "Strom", betrag: 120, hint: "💡 Verbrauch" },
      { name: "Wasser / Abwasser", betrag: 60, hint: "🔒 Pflicht (Versorger)" },
      { name: "Müll / Straßenreinigung", betrag: 30, hint: "🔒 Pflicht (Gemeinde)" },
      { name: "Schornsteinfeger", betrag: 10, hint: "🔒 Pflicht (Kehrordnung)" },
      { name: "Rücklage Instandhaltung", betrag: 120, hint: "⚙️ empfohlen (1 €/m²)" },
      { name: "Garten / Wartung", betrag: 40, hint: "💡 optional" }
    ],
    mieteAktuell: 1150, ekSparrate: 1000, aktuellesJahr: 2026
  };

  var hochzeit = {
    datum: "2026-07-25", personen: 70, caterer: "KERRES Catering GmbH",
    budget: 6000, urlaubZiel: "Montenegro",
    items: [
      { id: "w01", icon: "🍽️", bereich: "Catering / Speisen", beschreibung: "Kerres Catering – Buffet inkl. Vorspeise, Haupt, Nachspeise", status: "Angebot vorhanden", netto: 2337.40, brutto: null, notiz: "65 Personen à 35,96 €" },
      { id: "w02", icon: "🥗", bereich: "Mitternachtssnack", beschreibung: "Chili sin Carne + Käseauswahl", status: "Angebot vorhanden", netto: 126, brutto: null, notiz: "15 Portionen je" },
      { id: "w03", icon: "🍽️", bereich: "Geschirr & Besteck", beschreibung: "Buffet-, Kaffee-, Käse-, Kuchengedeck inkl. Reinigung", status: "Angebot vorhanden", netto: 313.95, brutto: null, notiz: "65 Personen à 4,83 €" },
      { id: "w04", icon: "🥂", bereich: "Gläser", beschreibung: "Long-, Wein-, Wasser-, Sekt-, Bierglas inkl. Reinigung", status: "Angebot vorhanden", netto: 102.70, brutto: null, notiz: "65 Personen à 1,58 €" },
      { id: "w05", icon: "⚙️", bereich: "Geräte & Zubehör", beschreibung: "Theke, Zapfanlage, Kaffeemaschine etc.", status: "Angebot vorhanden", netto: 172, brutto: null, notiz: "inkl. Kohlensäure" },
      { id: "w06", icon: "🪑", bereich: "Mobiliar", beschreibung: "Buffet-/Runde Tische, Bierzeltgarnituren, Stehtische", status: "Angebot vorhanden", netto: 282, brutto: null, notiz: "5+2+7+6 Stück" },
      { id: "w07", icon: "🚚", bereich: "Logistik", beschreibung: "Transport, Auf-/Abbau, Reinigung", status: "Angebot vorhanden", netto: 350, brutto: null, notiz: "Pauschale" },
      { id: "w08", icon: "🍺", bereich: "Bier", beschreibung: "30 Liter (Fass) – Val Dieu", status: "Zu bestellen", netto: 120, brutto: 120, notiz: "Einmalpreis" },
      { id: "w09", icon: "🍻", bereich: "Bier Alternative", beschreibung: "50 Liter (Fass) – Jupiler", status: "Zu bestellen", netto: 170, brutto: 170, notiz: "Einmalpreis" },
      { id: "w10", icon: "🍷", bereich: "Wein", beschreibung: "10 Flaschen (Referenzmenge) – 8/2 Weiß/Rot", status: "Zu bestellen", netto: null, brutto: 100, notiz: "" },
      { id: "w11", icon: "🍊", bereich: "Aperol", beschreibung: "äquiv. 10 Fl. Wein", status: "Zu bestellen", netto: null, brutto: 80, notiz: "" },
      { id: "w12", icon: "🍋", bereich: "Lillet", beschreibung: "äquiv. 10 Fl. Wein", status: "Zu bestellen", netto: null, brutto: 75, notiz: "" },
      { id: "w13", icon: "🍹", bereich: "Praise the Sun", beschreibung: "äquiv. 10 Fl. Wein", status: "Zu bestellen", netto: null, brutto: 90, notiz: "" },
      { id: "w14", icon: "🎂", bereich: "Hochzeitstorte", beschreibung: "vom Kunden (eigene Beschaffung)", status: "Zu bestellen", netto: null, brutto: 300, notiz: "" },
      { id: "w15", icon: "💐", bereich: "Deko & Blumen", beschreibung: "", status: "Zu bestellen", netto: null, brutto: 500, notiz: "" },
      { id: "w16", icon: "👥", bereich: "Personal", beschreibung: "", status: "Zu bestellen", netto: null, brutto: 600, notiz: "" },
      { id: "w17", icon: "🎵", bereich: "Musik / DJ", beschreibung: "", status: "Zu bestellen", netto: null, brutto: 200, notiz: "" },
      { id: "w18", icon: "📸", bereich: "Fotograf", beschreibung: "", status: "Zu bestellen", netto: null, brutto: 600, notiz: "" },
      { id: "w19", icon: "🧯", bereich: "Puffer", beschreibung: "", status: "Zu bestellen", netto: null, brutto: 200, notiz: "" }
    ],
    urlaub: [
      { id: "u01", icon: "✈️", name: "Flug", betrag: 133.98, bezahlt: true },
      { id: "u02", icon: "🏨", name: "Hotels", betrag: 1223, bezahlt: false },
      { id: "u03", icon: "🚗", name: "Auto", betrag: 221.64, bezahlt: true },
      { id: "u04", icon: "🍽️", name: "Essen", betrag: 700, bezahlt: false },
      { id: "u05", icon: "🏄", name: "Aktivitäten", betrag: 300, bezahlt: false },
      { id: "u06", icon: "⛽", name: "Sprit", betrag: 100, bezahlt: false }
    ]
  };

  var kinder = {
    kosten0_3: 400, kosten3_6: 400, kosten6_10: 400, kosten10_18: 500, kosten18_25: 600,
    kindergeld: 255, elterngeld: 600, anzahl: 2, abstand: 3, rabatt: 0.85, sparrate: 50
  };

  var depot = { name: "Trade Republic", start: 1100, rate: 120, zins: 0.04, jahre: 5 };

  return { categories: categories, fi: fi, hauskauf: hauskauf, hochzeit: hochzeit, kinder: kinder, depot: depot };
});
