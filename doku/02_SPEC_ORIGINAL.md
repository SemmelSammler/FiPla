# Finanzplanung — macOS-App Spec (Entwurf)

Status: **Entwurf, offene Fragen markiert mit ❓** — bitte im Chat klären, dann final an Claude Code übergeben.

## 0. Ziel

Die bestehende Single-File-Web-App (`finanzplanung.html`, Vanilla JS, kein Framework) als
native-wirkende macOS-App verpacken. Die Finanzlogik ist bereits gegen die Original-Excel
validiert (335 Tests) — **dieser Teil wird nicht neu geschrieben, nur eingebettet.**

## 1. Architektur-Entscheidung

**Tauri v2** (Rust-Shell + bestehendes HTML/CSS/JS als Frontend in einer WKWebView).

Begründung: ~95 % des vorhandenen, getesteten Codes bleibt unverändert. Tauri liefert die
eigentlichen nativen Gewinne (Dateisystem, Menüband, Dialoge) bei kleinem Binary (~10 MB)
ohne App-Store-Zwang. Alternativen (Electron, natives Swift-Rewrite, reine PWA) wurden
verworfen — siehe Chat-Verlauf für die Abwägung.

## 2. Nicht-Ziele / rote Linien

- **`js/logic.js` (Berechnungs-Engine) wird nicht verändert**, außer explizit in einem
  Meilenstein gefordert. Alle FI-/Hauskauf-/Hochzeit-/Kinder-Berechnungen bleiben exakt wie
  im Web-Build.
- Kein Rewrite der UI-Views (`views-*.js`) — nur Anpassungen für native Integration
  (z. B. Backup-Export ruft einen nativen Dialog statt `URL.createObjectURL` auf).
- Die bestehenden Web-Builds (`finanzplanung.html`, `mobile/index.html`) bleiben erhalten
  und funktionsfähig — die macOS-App ist ein dritter Build aus derselben Codebasis, kein
  Ersatz.

## 3. Regressions-Gate (Pflicht nach jedem Meilenstein)

```
node test/logic.test.js     # muss 0 Fehler zeigen — Berechnungs-Referenzwerte
```
Zusätzlich: manuelle Smoke-Checkliste (Abschnitt 7) nach jedem Meilenstein.

## 4. Meilensteine

### M1 — Tauri-Grundgerüst
- `tauri init` um das bestehende `dist/`-Build herum, `APP_MODE="desktop-native"` (neuer
  dritter Modus, keine Verhaltensänderung ggü. `desktop`).
- `tauri dev` startet die App, UI ist pixelgleich zum bisherigen Desktop-Build.
- Fenstergröße/-titel, App-Icon (❓ Icon-Vorlage nötig, siehe Abschnitt 8).
- Abnahme: App startet, alle 9 Sidebar-Bereiche funktionieren wie im Browser.

### M2 — Datei-Speicherung statt localStorage
- Zustand als JSON unter `~/Library/Application Support/Finanzplanung/state.json`.
- Crash-sicher: in Temp-Datei schreiben, dann atomar umbenennen.
- Debounced Writes (wie bisher `store.js`, nur Ziel = Datei statt `localStorage.setItem`).
- Migration: beim ersten Start prüfen, ob ein Web-Backup importiert werden soll (Datei-Dialog
  anbieten), sonst Seed-Daten wie gehabt.
- Abnahme: App killen (nicht sauber beenden) → Daten beim nächsten Start noch da.

### M3 — Native Backup-Dialoge
- `Store.exportBackup()` nutzt `@tauri-apps/plugin-dialog` (Speichern-unter) statt
  Downloads-Ordner-Hack.
- `Store.importBackup()` nutzt natives Öffnen-Dialog.
- Abnahme: Export/Import-Zyklus wie bisher (Test-Referenz: identischer Zustand danach).

### M4 — Menüband & Tastenkürzel
- App-Menü (Über, Beenden), Datei-Menü ("CSV importieren…" ⌘I, "Backup exportieren…" ⌘S,
  "Backup importieren…" ⌘⇧O), Ansicht-Menü mit ⌘1–⌘9 für die Sidebar-Bereiche.
- Abnahme: alle Kürzel funktionieren, kein Konflikt mit Browser-Standardkürzeln nötig (nativ).

### M2b — iCloud-Sync (sicher, siehe Abschnitt 5b)
- Zustandsdatei liegt in `~/Library/Mobile Documents/.../Finanzplanung/state.json`
  statt in `Application Support` — iCloud synchronisiert Dateien in diesem Ordner automatisch.
- Konflikt-Erkennung wie in 5b beschrieben, bevor überschrieben wird.
- Abnahme: Änderung auf Gerät A erscheint nach Sync-Zeit auf Gerät B; simulierter Konflikt
  (Datei manuell ändern, während App offen) löst Warnung statt stillem Datenverlust aus.

### M5 — Politur (optional, priorisierbar, ohne Signierung)
- ❓ Touch-ID-Sperre beim Start (sinnvoll bei Finanzdaten — später entscheidbar)
- ❓ Native Benachrichtigungen (z. B. "3 Fixkosten-Posten seit 5 Tagen offen")
- System-Darkmode live folgen (aktuell fest dunkel — beibehalten oder an System koppeln?)
- Eigenes App-Icon

## 5. Entscheidungen (aus dem Chat geklärt)

1. **Verteilung:** nur für dich → keine Notarization nötig. Erststart: einmalig
   Rechtsklick → Öffnen (Gatekeeper-Warnung, danach nie wieder).
2. **Apple-Developer-Account:** nein → M5-Signierung entfällt komplett.
3. **Geräte-Sync:** iCloud gewünscht, aber **sicher** umgesetzt — siehe Abschnitt 5b.
   Nicht in M2 (lokale Datei), sondern als eigener Meilenstein M2b danach.
4. **Touch-ID:** noch offen — später entscheidbar, kein Blocker für M1–M4.
5. **Benachrichtigungen:** noch offen — später entscheidbar.
6. **App-Icon:** noch offen.
7. **Darkmode:** noch offen, kein Blocker.

## 5b. iCloud-Sync — sicheres Design (statt "hoffentlich klappt's")

Risiko bei naivem Sync: Zwei Geräte ändern die gleiche Datei "gleichzeitig" (z. B. App auf
Mac offen, gleichzeitig am Handy gebucht) → stiller Datenverlust, die zuletzt speichernde
Version gewinnt komplett.

Absicherung (Analogie: Bibliothekar prüft das Rückgabedatum vor dem Einbuchen):
- Beim **Laden** merkt sich die App einen Zeitstempel/Versionszähler aus der Datei.
- Beim **Speichern** vergleicht sie: ist die Datei auf der Platte inzwischen neuer als der
  gemerkte Stand (weil ein anderes Gerät zwischenzeitlich geschrieben hat)? Wenn ja: **nicht
  stumm überschreiben**, sondern Warnung zeigen + beide Stände als Backup-Dateien anbieten,
  damit nichts verloren geht.
- Für den Alltag (ein Gerät zur Zeit genutzt) unsichtbar — greift nur im Konfliktfall.

## 5c. Zusammenarbeit während der Umsetzung

- **Web-App-Inhalte** (Design, Berechnungen, neue Features) weiterhin hier im Chat mit
  Claude — läuft in einer Linux-Sandbox, kann kein natives macOS bauen.
- **Native Verpackung** (Rust/Tauri, Menüband, Dateidialoge) läuft lokal über **Claude Code**
  auf dem Mac — nur dort kann tatsächlich kompiliert und die App gestartet werden.
- Bei Fehlermeldungen aus Claude Code: einfach hier im Chat einfügen, gemeinsames Verständnis
  vor dem nächsten Fix-Versuch.
- Sicherheitsnetz: `node test/logic.test.js` läuft auch ohne Mac (reines JavaScript) und
  bleibt nach jedem Meilenstein Pflicht-Check gegen Regressionen in der Finanzlogik.

## 6. Signierung & Verteilung

Entfällt (siehe Abschnitt 5, Punkt 1+2) — kein Developer-Account, keine Notarization. Nur
lokale Nutzung mit einmaliger Gatekeeper-Bestätigung.

## 7. Manuelle Test-Checkliste (nach jedem Meilenstein)

- [ ] Fenster resize / Vollbild / zweiter Monitor
- [ ] Retina-Schärfe der SVG-Charts (Linien-, Balken-, Donut-Charts)
- [ ] Alle 9 Sidebar-Bereiche laden ohne Konsolenfehler
- [ ] CSV-Import per nativem Dateidialog
- [ ] Backup exportieren → App-Daten löschen → importieren → identischer Zustand
- [ ] App hart beenden (Force Quit) → Daten beim Neustart vorhanden
- [ ] Tastenkürzel aus dem Menüband
- [ ] Trackpad-Scroll in langen Tabellen (Buchungsliste, Jahresplan)

## 8. Assets / Vorbereitung

- ❓ App-Icon (1024×1024 PNG als Ausgangsbasis für alle macOS-Icon-Größen)
- Bestehende Codebasis: `js/*.js`, `styles.css`, `index.html`, `build.js`,
  `test/logic.test.js`, `test/e2e.test.mjs` (letztere gilt nur eingeschränkt für den
  nativen Build, siehe Abschnitt 3)

---
*Nächster Schritt: Abschnitt 5 im Chat mit Claude beantworten, Spec finalisieren,
dann als Auftrag an Claude Code (Fable oder Opus) übergeben — meilensteinweise, nicht
als ein Gesamt-Prompt.*
