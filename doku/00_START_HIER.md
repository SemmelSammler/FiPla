# Übergabepaket FiPla — bitte zuerst lesen

Stand: **19. Juli 2026** · Commit `ddf942d` · Alle Tests grün (116 + 367 + 39 + 8)

## Was ist in diesem Paket?

| Datei / Ordner | Inhalt |
|---|---|
| `00_START_HIER.md` | Dieses Dokument |
| `01_UEBERGABE.md` | **Das Hauptdokument** — Projekt, Architektur, rote Linien, Fallstricke, offene Punkte |
| `02_SPEC_ORIGINAL.md` | Die ursprüngliche Spezifikation der macOS-App (historisch, alle Meilensteine erledigt) |
| `03_ERSTER_PROMPT.md` | Fertiger Text zum Kopieren als erste Nachricht im neuen Chat |
| `code/` | Vollständiger Quellcode-Schnappschuss (ohne generierte Ordner) |

## In 3 Schritten loslegen

1. **`01_UEBERGABE.md` lesen** — dort steht alles Wesentliche.
2. **Code entpacken**: Der Ordner `code/` ist der komplette Projektstand. Er entspricht
   exakt dem privaten GitHub-Repository `github.com/SemmelSammler/FiPla` (Commit `ddf942d`).
   Wenn das Repo erreichbar ist, ist `git clone` der bessere Weg — dann ist auch die
   Historie dabei.
3. **`03_ERSTER_PROMPT.md`** in den neuen Chat kopieren.

## ⚠️ Wichtiger Datenschutz-Hinweis

Die Datei `code/js/seed.js` enthält **Beispieldaten, die aus einer echten Excel-Tabelle
abgeleitet wurden**. Darin stehen echte Spuren: Arbeitgebername, Gläubiger, eine
Vertragskontonummer, echte Beträge.

- Das Paket und jedes daraus entstehende Repository müssen **privat** bleiben.
- Vor einer Veröffentlichung (öffentliches Repo, Code-Beispiel im Netz, App-Store)
  muss `seed.js` durch rein erfundene Daten ersetzt werden.

Die **laufenden** Finanzdaten des Nutzers sind **nicht** in diesem Paket. Sie liegen
ausschließlich lokal auf seinem Mac (siehe `01_UEBERGABE.md`, Abschnitt „Wo liegen die
Daten"). Kein Backup, kein Export und keine `state.json` ist hier enthalten.
