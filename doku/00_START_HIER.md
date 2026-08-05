# FiPla — bitte zuerst lesen

Projektordner: **`~/Documents/FiPla`** · Repository: `github.com/SemmelSammler/FiPla` (privat)
Letzter Stand: **5. August 2026** · Alle Tests grün (116 + 367 + 39 + 8 = 530)

## Was liegt in `doku/`?

| Datei | Inhalt |
|---|---|
| `00_START_HIER.md` | Dieses Dokument |
| `01_UEBERGABE.md` | **Das Hauptdokument** — Projekt, Architektur, rote Linien, Fallstricke, offene Punkte |
| `02_SPEC_ORIGINAL.md` | Ursprüngliche Spezifikation der macOS-App (historisch, alle Meilensteine erledigt) |
| `03_ERSTER_PROMPT.md` | Fertiger Text zum Kopieren als erste Nachricht in einer neuen Sitzung |
| `04_STAND_2026-08-05.md` | Design-Audit von `styles.css` — der fachliche Ausgangspunkt für die nächste Aufgabe |
| `05_UMZUG_2026-08-05.md` | Umzug nach `~/Documents/FiPla`, Konfigurationsänderungen, aktuelle offene Entscheidung |

## In 3 Schritten loslegen

1. **`01_UEBERGABE.md` lesen** — dort steht alles Wesentliche über Architektur und Arbeitsweise.
2. **`05_UMZUG_2026-08-05.md` lesen** — Ordnerstruktur und was gerade offen ist.
   Bei Design-Themen zusätzlich `04_STAND_2026-08-05.md`.
3. **Umgebung prüfen**: `node build.js`, dann die drei JS-Testsuiten. Erwartet: 116 + 367 + 39
   Prüfungen ohne Fehler.

Der Quellcode ist **nicht** mehr als ZIP-Paket unterwegs — dieser Ordner *ist* das Repo, mit
vollständiger Historie. Frühere Fassungen dieses Dokuments erwähnten einen Unterordner `code/`;
den gibt es nicht mehr.

## ⚠️ Datenschutz — zwei getrennte Punkte

**1. `js/seed.js` enthält echte Spuren.** Die Beispieldaten sind aus einer echten
Excel-Tabelle abgeleitet: Arbeitgebername, Gläubiger, eine Vertragskontonummer, echte Beträge.

- Das Repository muss **privat** bleiben.
- Vor einer Veröffentlichung (öffentliches Repo, Code-Beispiel im Netz, App Store) muss
  `seed.js` durch rein erfundene Daten ersetzt werden.

**2. `daten/` enthält echte Finanzdaten** — ein Kontodaten-Backup und einen Zustand vor einer
Datenmigration. Der Ordner steht in `.gitignore` und ist deshalb **nicht** Teil des
Repositorys. Diesen `.gitignore`-Eintrag nie entfernen und nichts daraus in versionierte
Dateien kopieren.

Die **laufenden** Daten der App liegen woanders, nämlich in iCloud Drive bzw. im
localStorage des jeweiligen Builds — siehe `01_UEBERGABE.md`, Abschnitt „Wo liegen die Daten?".
