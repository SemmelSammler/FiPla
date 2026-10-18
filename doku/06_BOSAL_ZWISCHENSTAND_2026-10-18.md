# BoSal: Zwischenstand vom 18. Oktober 2026

FiPla wird zu **BoSal** umgebaut. Bisher gibt es nur einen klickbaren Entwurf, das echte Tool
ist noch unverändert. Dieses Dokument hält fest, was entschieden ist und was offen ist.

## Was in dieser Sitzung fertig wurde

| Was | Stand |
|---|---|
| Windows-Version | läuft. Installer per GitHub Actions („Windows-Build“), in `main` gemergt |
| Speichern unter Windows | Fehler behoben („Access is denied“ beim fsync) |
| Hochzeit-Tab | entfernt (Branch `claude/adoring-babbage-ofozq5`, noch nicht in `main`) |
| BoSal-Entwurf | 4 Runden, Quellcode in `entwurf/` |

Entwurf bauen: `node entwurf/build.cjs . entwurf/BoSal-Entwurf.html`, dann die Datei im Browser
öffnen. Die gebaute Datei enthält die Daten aus `seed.js` und wird deshalb nicht versioniert.

## Entscheidungen

- **Name:** BoSal
- **Design:** „Weich“ (rund, freundlich, schwebende Navigation unten), mit wählbaren
  Farbpaletten: Violett, Ozean, Wald, Koralle, Sand, Nacht (dunkel)
- **Navigation:** Monat · Offen · Ausgaben · Zukunft · Mehr
- **Hauskauf und Kinder** bleiben erhalten und werden später umgebaut

## Die Kernlogik: so nutzt der Nutzer die App

Die wichtigste Zahl ist **„Übrig bis Monatsende“**. Das ist ein Kassensturz, keine
Monatsbilanz:

```
  Geld auf den Konten (Giro + 2. Konto + Kreditkarte, von Hand eingetippt)
+ feste Einnahmen, die noch nicht gebucht sind
− Fixkosten und Raten, die noch nicht abgebucht sind
− aus dem Vormonat noch offen (nur bei frühem Monatsstart)
± offene Posten (mir geschuldet, ich schulde, schwebend, Rücklagen, geplant)
± zwischen Monaten verschoben
= Übrig
```

- Ob ein fester Posten schon abgebucht ist, erkennt die App am Suchbegriff im CSV-Import.
  Der Stichtag ordnet Buchungen dem richtigen Monat zu (Gehalt am 26.10. zählt für November).
- **Regel:** Kontostand eintippen und CSV importieren müssen zum gleichen Zeitpunkt passieren,
  sonst werden Fixkosten doppelt abgezogen. BoSal macht daraus einen Schritt („Kassensturz“)
  und warnt, wenn ein Kontostand ohne neuen Import geändert wird.
- Das Tagesgeldkonto und das Sparkonto für Rücklagen tauchen in der App nicht auf.
- Die Kreditkarte wird einmal im Monat komplett vom Girokonto abgebucht.

## Neue Bausteine im Entwurf

| Baustein | Verhalten |
|---|---|
| **Budgetmonat** | Hängt nicht am Kalender. „November starten“ geht jederzeit, auch früher. Der alte Monat wird mit seinem Endstand eingefroren |
| **Früher Start** | Nicht abgebuchte feste Posten des alten Monats wandern als „Aus Oktober noch offen“ mit und fallen weg, sobald die Abbuchung importiert ist |
| **Zurück zum Vormonat** | Macht den Start rückgängig, mit den Kontoständen von damals. Neue Einträge bleiben erhalten |
| **Offene Posten** | 5 Arten: mir geschuldet, ich schulde (beide mit Person), schwebend, Rücklage, geplant (mit Zielmonat). Alles Offene wandert automatisch in den nächsten Monat mit |
| **Abgleich beim Import** | BoSal schlägt vor, welche Buchung einen offenen Posten erledigt (gleicher Betrag, gleiche Richtung, Name passt). Erst nach der Bestätigung gilt er als erledigt. Das verhindert doppeltes Zählen |
| **Teilen** | Jede Ausgabe ist teilbar, auch feste Posten. Ausnahmen: Kreditkarten-Abrechnung, Rückzahlungen, Rücklagen. Teilen legt „Person schuldet mir“ an |
| **Ausgaben „Mein Anteil“** | Geteiltes wird herausgerechnet, „von anderen bezahlt“ wird hinzugezählt. Rückzahlungen gelten nicht als Einnahme, Rücklagen nicht als Ausgabe, die Kreditkarten-Sammelsumme ist ausgeblendet |
| **Kommende Monate** | Vorschau, bearbeitbar wie der aktuelle Monat: feste Posten nur für diesen Monat ändern oder „entfällt“, Geplantes, Verschiebungen |
| **Zwischen Monaten verschieben** | Betrag von Monat A nach B. B bekommt ihn dazu, in A wird er abgezogen. Geht in beide Richtungen |
| **Rückgängig / Wiederholen** | ↶ ↷ oben, Strg+Z / Strg+Umschalt+Z, bis zu 50 Schritte. Zusätzlich „wieder öffnen“ bei erledigten Posten |
| **Sortieren** | Unsortierte Buchungen einzeln zuordnen. „Immer so“ legt eine Regel an und sortiert Ähnliches gleich mit |

## Offen und später

- **Kreditkarten-CSV:** Import nur für die Ausgaben-Auswertung, die Abrechnung auf dem
  Girokonto wird dann ausgeblendet. Möglich wäre auch, den offenen Kreditkarten-Betrag daraus
  zu berechnen statt ihn einzutippen.
- **Backlog:** Abgleich Mac ↔ PC (OneDrive/Dropbox), Windows-Sperre (PIN/Windows Hello),
  automatisches Backup
- **Echter Umbau:** Der Entwurf rechnet mit `logic.js`. Monatsabweichungen fester Posten,
  offene Posten, Abgleich und Teilen brauchen neue Funktionen. Ob `logic.js` dafür erweitert
  wird (rein additiv) oder eine neue Datei entsteht, muss der Nutzer entscheiden (rote Linie).
- **Datenübernahme:** Die bisherigen „geplanten Einnahmen/Ausgaben“ mit Person werden zu
  „mir geschuldet“ bzw. „ich schulde“. Rücklagen werden zu Rücklagen. Der Rest wird erst beim
  Umbau sauber zugeordnet, eine automatische Zuordnung ist nicht eindeutig.

## Zukunft (Stand Entwurf 6)

- Die heutige FI-Rechnung (`Logic.runFI`) ist im Entwurf Schritt für Schritt erklärt, mit
  Jahreswahl, Übersicht „Alle Töpfe Ende Jahr“, Verlauf der 7 Töpfe, eintragbaren
  Lebensereignissen und Startwerten aus einem Monat.
- 7 Prüfpunkte sind live gerechnet. Punkt 3 (große Ereignisse verschwinden) ist ein echter
  Rechenfehler. Zusätzlich aufgefallen: Liegt der Startwert über dem Deckel, fallen
  Fixkosten bzw. Einnahmen ab dem 2. Jahr auf den Deckel.
- **Merkposten:** Die Diagramme (Vermögen, FI-Test) gefallen, sollen aber noch überarbeitet
  werden. Nicht ohne Rücksprache ändern.
- Nächster Schritt: Der Nutzer entscheidet pro Prüfpunkt „so lassen“ oder „ändern“.

## Korrigierte FI-Rechnung (Entwurf 8)

Neue Datei `entwurf/fiplan.js` (`BoSalFI.run`), `js/logic.js` bleibt unverändert. Korrigiert:

1. FI-Test misst den Lebensbedarf: Fixkosten + wählbar Lebensqualität und Auto
2. Haus-EK zählt nicht zum FI-Kapital, optional mit Kaufjahr
3. Anschaffungen (früher „Lebensereignisse“) voll verrechnet, im gewählten Monat, Standard Notgroschen → ETF → Haus-EK, Rest als Fehlbetrag. Rechnung läuft dafür in Monatsschritten
4. Kinder-Sparen ist ein eigener Spartopf, Auto bleibt Ausgabe
5. Hinweis auf fehlende Startbestände, neues Feld „Kinder-Sparen heute“
6. Einnahmen und Fixkosten standardmäßig live aus einem Monat (abhakbar), „von Hand“ möglich
7. Startjahr und Restmonate aus dem heutigen Datum, Alter aus dem Geburtsjahr
8. Deckel nie unter dem Startwert
9. Neu gefunden: Beim Erreichen eines Ziels verschwand der Überschuss (bei den Beispieldaten 4.245 €)

Mit den Beispieldaten: alte Rechnung frei 2042 (mit 45), korrigiert 2052 (mit 55).
Hauptgründe: höherer Lebensbedarf (1), Fixkosten aus dem Monat (6), Haus-EK nicht mitgezählt (2).

## Anschaffungen und Kredit (Entwurf 11)

- Fehlt Geld für eine Anschaffung, wird der Rest ein **Kredit** (Annahme „Kreditzins“, Standard 6 %).
  Solange er offen ist, **pausieren alle Spartöpfe** (ETF-Mindest, Kinder, Haus-EK, Notgroschen,
  ETF-Rest) und ihr Geld tilgt den Kredit. Lebensqualität, Auto und KfW-Sondertilgung laufen weiter.
- „So entwickeln sich die Töpfe“ trennt **Einzahlungen** (was jeder Topf bekommt, mit „Pause“)
  von **Kontoständen** (Stand je Topf, Entnahmen rot). Darunter erklärt „Was bei den
  Anschaffungen passiert“ jede Anschaffung Schritt für Schritt.

## Dein Anteil und Reihenfolge (Entwurf 12)

- **KfW-Sondertilgung** läuft auch während eines Kredits weiter (Entscheidung des Nutzers).
- **Annahmen „aus dem Monat“** rechnen mit deinem Anteil: Einnahmen mit dem Schalter „Anteil von
  anderen“ (z. B. Mietanteil Laura) zählen nicht als Einkommen, sondern senken die als „geteilt“
  markierten Fixkosten (Miete, Strom, Internet). Frei pro Monat bleibt gleich; es ändert sich, was
  als Einkommen wächst und was das Ersparte später bezahlen muss (FI-Bedarf).
- Nicht mehr aktuelle Posten (Baloise BU, Fitness, PS Plus, Nintendo Online) sind im Entwurf entfernt.
- Karte „Anschaffungen“ steht direkt unter Schritt 1 und 2.
- Behoben: Das Monats-Auswahlfeld einer Anschaffung schloss sich sofort wieder, wenn vorher ein
  anderes Feld geändert wurde (die Seite wurde neu gezeichnet, während das Auswahlfeld aufging).

## Studienkredite und Sparstart (Entwurf 13)

- **KfW neu aufgesetzt** nach den Kontoauszügen vom 03.10.2026 (Korrektur 10: vorher keine Zinsen):
  KfW 1: 14.121,29 €, 7,46 %, 500 €/Monat. KfW 2: 4.800 € + 603,58 € aufgeschobene Zinsen =
  5.403,58 €, 4,14 %, noch keine Rate. **Annahme, vom Nutzer zu prüfen:** KfW 2 ab Januar 2027 mit
  100 €/Monat. Zinsen pro Monat = Saldo × Zins ÷ 12. Bis zum Auszugsmonat ist die Rate schon im Saldo.
  Der alte Tilgungsplan pro Jahr (`kfw1Plan`/`kfw2Plan`) wird von der neuen Rechnung nicht mehr genutzt.
- **Sparen ab** (Standard März 2027, jederzeit änderbar im Jahr-Kasten und in den Annahmen): Vorher
  bekommen ETF, Kinder-Sparen, Haus-EK und Notgroschen nichts. Lebensqualität, Auto, KfW-Rate und
  KfW-Sondertilgung laufen. Das übrige Freie steht als „Nicht verplant“ da und zählt nicht zum Vermögen.

## Feste Posten, Sparstart, Gehaltserhöhung (Entwurf 14)

- **Feste Posten** im Entwurf wie in der App des Nutzers (18.10.2026): Gehalt 3.427,74, Mietanteil
  Laura 538, Miete 1.003,01, Strom 72, Internet 86,89, Handy 24,99, Spotify 21,99, Zahnzusatz 21,70,
  Amazon 8,99, Apple 2,99, Lebensmittel 300, KfW 500. Monat und Zukunft ergeben beide 1.923,18 € frei.
  In der echten App steht Spotify versehentlich mit **+21,99** (als Einnahme) – dort korrigieren.
- **Sparen ab** gilt jetzt für alle Töpfe, auch Lebensqualität, Auto und Sondertilgung. Vorher laufen
  nur KfW-Rate und ggf. ein Kredit aus Anschaffungen.
- **Gehaltserhöhung** jeweils ab einem Monat (Annahme „Gehaltserhöhung jeweils ab“, Standard Mai).
  Fixkosten steigen weiter im Januar.
