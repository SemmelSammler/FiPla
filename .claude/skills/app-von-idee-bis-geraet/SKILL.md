---
name: app-von-idee-bis-geraet
description: Eine eigene App-Idee von der ersten Skizze bis auf iPhone, Windows und Mac bringen – kostenlos, ohne App Store, mit der App-Vorlage (Repo SemmelSammler/app-vorlage). Nutzen, wenn der Nutzer eine neue App-Idee hat, eine App "für sich" bauen will, einen Prototyp als Artefakt testen möchte oder eine Web-App als iPhone-App (PWA) bzw. Windows-/Mac-App ausrollen und zwischen Geräten abgleichen will.
---

# Von der Idee bis aufs Gerät

Bewährter Weg aus dem Projekt Obol (Finanz-App, 2026). Ziel: private App für die eigenen Geräte, 0 € laufende Kosten, wenig Technik-Aufwand für den Nutzer.

## Der Nutzer
- Anfänger, Deutsch. **Sehr kurze Antworten**, einfache Worte, Beispiele statt Fachbegriffe, genaue Klick-Anleitungen, am Ende Tabelle/Stichpunkte.
- Widerspruch ist erwünscht. Begründet widersprechen, nie still abweichen. Erst erklären, dann bauen, wenn etwas Neues/Unklares ansteht.
- Design: extrem kritisch. Saubere Ausrichtung, alles auf einen Bildschirm, nichts läuft über, kein „billiger“ Look. Dunkler Modus gefällt.
- Vor jedem großen Bau-Schritt **Varianten als Artefakt zeigen** und wählen lassen (bei Obol: A/B/C, dann Mischung D).

## Ablauf

| # | Phase | Ergebnis | Wer macht was |
|---|---|---|---|
| 1 | Idee klären | 1 Absatz: wer, wofür, welche Daten, welche Geräte | Chat |
| 2 | Prototyp | Klickbare HTML-Seite mit **ausgedachten** Beispieldaten | Claude, Artefakt |
| 3 | Iterieren | Funktionen, 2–4 Design-Varianten, Usability mit echten Daten (nur lokal!) | gemeinsam |
| 4 | Aus der Vorlage anlegen | Neues privates Repo aus **SemmelSammler/app-vorlage** | Nutzer: „Use this template“ (1 Klick), Claude: Rest |
| 5 | Idee einbauen | `app/app.js` (Platzhalter „Einträge“ ersetzen), `app.config.json`, `app/icon.svg` | Claude |
| 6 | Prüfen | `node test/check.cjs`, `node test/klicktest.cjs`, Bilder ansehen | Claude |
| 7 | Ins Netz | Cloudflare Pages + KV `SYNC_KV` (ANLEITUNG.md Abschnitt 2) | Nutzer klickt, Claude führt an – oder Claude selbst mit Token |
| 8 | Geräte | iPhone: Zum Home-Bildschirm. Windows/Mac: Actions-Lauf „Apps bauen“ | Nutzer |
| 9 | Feinschliff | Name, Icon (Varianten als Artefakt), Handy-Details | gemeinsam |

## Die App-Vorlage (SemmelSammler/app-vorlage)
Fertig drin, meist unverändert übernehmen:
- **Speichern** (`localStorage`, Schlüssel `<id>.daten.v1`), **Backup** (Download bzw. Tauri-Speicherdialog).
- **Abgleich**: `app/sync.js` + `functions/api/sync/[id].js`. 20-Zeichen-Schlüssel → Ablage-ID, Schreib-Token, AES-GCM (PBKDF2, Salz pro App-ID), gzip. Versionsnummer, bei Konflikt Dialog „anderes Gerät / meine Version“.
- **Handy-Ansicht**: `html.is-phone` unter 700 px, Tab-Leiste, Bottom-Sheet-Fenster, Notch-sicher (`env(safe-area-inset-*)`, Abdeckstreifen `.notch`).
- **Design-Regeln**: `app/tokens.css` (Farben hell/dunkel, Abstände `--s1…--s8`, Radien, Schriftgrößen). Neue Regeln nur damit.
- **Build**: `node build.cjs [--demo]` → `web/`; übernimmt Name/Version/ID aus `app.config.json` auch in `src-tauri/tauri.conf.json`.
- **Desktop**: Tauri v2 (`frontendDist ../web`), Abgleich-Server aus `app.config.json` → `server`. Workflow `.github/workflows/apps-build.yml` (Windows .exe, Mac universal .dmg, ad-hoc signiert), startet bei Änderungen in `src-tauri/` oder per Hand.
- **Tests**: `test/check.cjs` (keine Beispiel-/Privatdaten im Build – private Begriffe in `daten/verboten.txt`, Syntax, Abgleich-Server), `test/klicktest.cjs` (Computer trägt ein → iPhone erhält es; Screenshots in `test/bilder/`), `tools/server.mjs` (lokaler Server inkl. Abgleich).

## Stolperfallen (alle schon passiert)
- **`<name>.pages.dev` ist weltweit einmalig.** Ist der Name vergeben, hängt Cloudflare ein Kürzel an (`bosal-2t8`); unter `bosal.pages.dev` lief eine fremde Seite. Echte Adresse im Projekt nachsehen.
- Cloudflare „Create application“ führt standardmäßig zu **Workers**. Für Pages: Link ganz unten „Looking to deploy Pages?“.
- Diese Cloud-Umgebung erreicht `*.pages.dev` nur, wenn es unter Allowed domains steht. Sonst den Nutzer prüfen lassen (`/api/sync/000…0`).
- **Notch**: Bei `black-translucent` läuft Inhalt unter die Uhr. Keine Regel mit `!important` darf den oberen Abstand überschreiben (war der Fehler bei Obol).
- **Persönliche Daten** nie in Code/Build. Bei Obol mussten sie am Ende mühsam entfernt werden.
- **GitHub**: Repos anlegen und Tags/Releases sind für Claude gesperrt → Nutzer legt Repo an (Template-Knopf), Downloads kommen als Actions-Artefakte (90 Tage). `workflow_dispatch` geht nur aus dem Standard-Branch. Mac-Minuten zählen 10-fach → nicht bei jedem Push bauen.
- Unsignierte Apps: Windows „Weitere Informationen → Trotzdem ausführen“, Mac „Datenschutz & Sicherheit → Dennoch öffnen“.
- `<a download>` geht im Mac-Fenster nicht → Tauri-Befehl `save_file_dialog`.
- Desktop hat keinen http-Ursprung (Mac `tauri://`, Windows `http://tauri.localhost`) → Abgleich braucht feste Server-Adresse.
- Playwright: Buttons mit `button:text-is("…")` treffen, `text=` greift auch Überschriften. Neuzeichnen darf Debounce-Timer nicht zurücksetzen.
- `id` und Speicher-Schlüssel nach dem ersten echten Einsatz nie ändern (bei Obol blieben sie deshalb `bosal.*`).

## Verbesserungen gegenüber Obol (in der Vorlage umgesetzt bzw. vorbereitet)
| Verbesserung | Stand |
|---|---|
| Startvorlage statt alles neu | ✅ app-vorlage |
| Private Daten ab Tag 1 getrennt (`--demo`, `daten/`, `verboten.txt`) | ✅ |
| Design-Regeln von Anfang an (`tokens.css`) | ✅ |
| Klick-Test vor dem Push | ✅ `test/klicktest.cjs` |
| Vorschau-Links (jeder Branch eigene Adresse, live nur `main`) | ✅ macht Cloudflare automatisch, in ANLEITUNG erklärt |
| Claude deployt/prüft selbst (Token + Allowed domains) | 📝 ANLEITUNG Abschnitt 5, Nutzer muss es einmal freigeben |
| Auto-Update der Desktop-Apps | ⏳ bewusst weggelassen (Tauri-Updater braucht Signier-Schlüssel) – einbauen, wenn Neuinstallieren nervt |

## Wann dieser Weg nicht passt
- Push-Mitteilungen, Widgets, Kamera-Scanner, Apple Watch → echte iPhone-App (Swift), Apple-Konto 99 €/Jahr.
- Mehrere Personen bearbeiten dieselben Daten gleichzeitig → Datenbank mit Zusammenführen (z. B. Cloudflare D1) statt „ein verschlüsselter Block pro Schlüssel“.
