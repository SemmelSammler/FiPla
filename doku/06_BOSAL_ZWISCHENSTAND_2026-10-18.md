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
3. Lebensereignisse voll verrechnet (ETF → Notgroschen → Haus-EK → Fehlbetrag), nicht mehr ÷ 12
4. Kinder-Sparen ist ein eigener Spartopf, Auto bleibt Ausgabe
5. Hinweis auf fehlende Startbestände, neues Feld „Kinder-Sparen heute“
6. Einnahmen und Fixkosten standardmäßig live aus einem Monat (abhakbar), „von Hand“ möglich
7. Startjahr und Restmonate aus dem heutigen Datum, Alter aus dem Geburtsjahr
8. Deckel nie unter dem Startwert
9. Neu gefunden: Beim Erreichen eines Ziels verschwand der Überschuss (bei den Beispieldaten 4.245 €)

Mit den Beispieldaten: alte Rechnung frei 2042 (mit 45), korrigiert 2052 (mit 55).
Hauptgründe: höherer Lebensbedarf (1), Fixkosten aus dem Monat (6), Haus-EK nicht mitgezählt (2).
