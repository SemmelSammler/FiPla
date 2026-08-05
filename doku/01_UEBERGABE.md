# FiPla — Projektübergabe

Stand: **19. Juli 2026**, Commit `ddf942d` · Repository: `github.com/SemmelSammler/FiPla` (privat)

---

## 1. Was ist FiPla?

Ein persönliches Finanz-Cockpit für **einen einzigen Nutzer** (im Folgenden „der Nutzer").
Ursprung: eine gewachsene Excel-Tabelle, die in eine App überführt wurde. Die App plant und
überwacht:

- **Monatscockpit** — Soll/Ist-Abgleich von wiederkehrenden Posten gegen echte Bankbuchungen
- **CSV-Import** — Sparkassen-Export (CAMT/MT940), mit Duplikat-Erkennung und Auto-Kategorisierung
- **FI-Planung** — „Financial Independence" nach der 4-%-Regel, Jahr-für-Jahr-Simulation
- **Szenarien** — Hauskauf, Hochzeit, Kinder (je mit eigener Berechnungslogik)
- **Depot-Tracker**, **Backup/Restore**, **Personen-Übersicht** (private Forderungen/Schulden)

Es gibt **drei Builds aus einer Codebasis**:

| Build | Datei | `window.APP_MODE` | Zweck |
|---|---|---|---|
| Desktop-Web | `dist/finanzplanung.html` | `"desktop"` | Einzeldatei, offline im Browser |
| Mobil-Web | `dist/mobile/index.html` | `"mobile"` | Handy (Cloudflare Pages) |
| macOS-App | `dist/native/index.html` | `"desktop-native"` | Frontend der Tauri-App |

---

## 2. Technischer Aufbau

**Frontend:** Vanilla JavaScript, **kein Framework, kein Build-Tool, keine Abhängigkeiten.**
`build.js` (Node, ~25 Zeilen) klebt CSS + alle `js/*.js` in `index.html` und schreibt die drei
Builds. Das ist der gesamte „Bundler". Reihenfolge der Skripte in `build.js` ist relevant.

**Frontend-Struktur** (`js/`, ~4.400 Zeilen gesamt):

| Datei | Rolle |
|---|---|
| `logic.js` | **Berechnungs-Engine.** Rein funktional, kein DOM. Siehe rote Linie unten. |
| `store.js` | Zustand, Persistenz-Weiche (localStorage ↔ Datei), Backup, Undo-Stapel |
| `defaults.js`, `seed.js` | Standard-Annahmen und Beispieldaten |
| `util.js` | Formatierung (deutsche Zahlen/Datum), DOM-Helfer `U.el`, Toasts, Download |
| `charts.js` | SVG-Charts von Hand (Linie, Balken, Donut) — keine Chart-Bibliothek |
| `ui-core.js` | Shell, Navigation, gemeinsame Bausteine (`UI.field`, `UI.table`, `UI.monthSelect` …) |
| `views-*.js` | Je eine Ansicht, registriert sich via `UI.registerView("<id>", fn)` |
| `native.js` | **Nur macOS-App**: Touch-ID-Sperre, Menü-Events, Dock-Drop, Sync-Konflikt-Dialog. In den Web-Builds komplett inert (`NativeGlue.active()` ist dort `false`). |

**Native Hülle:** Tauri v2 (Rust) in `src-tauri/`. Fenster 1440×900 (min. 700×600),
Identifier `de.finanzplanung.desktop`, natives Menüband mit ⌘1–⌘9 für die neun Bereiche.

**Rust-Befehle** (`src-tauri/src/lib.rs`), aufrufbar aus JS via `window.__TAURI__.core.invoke`:

```
load_state · save_state · rescue_state
resolve_conflict_keep_mine · resolve_conflict_take_theirs
state_location · take_pending_open_files · read_file_bytes
authenticate · save_file_dialog · pick_backup
```

Die Kernfunktionen der Speicher-Schicht sind bewusst **pfad-basiert und ohne Tauri-Typen**
geschrieben, damit `cargo test` sie ohne laufende App prüfen kann. Die `#[tauri::command]`-
Funktionen sind nur dünne Hüllen darum.

**Touch-ID:** Ein winziger Swift-Helfer (`src-tauri/helper/touchid.swift`, kompiliert nach
`src-tauri/bin/touchid-helper`) fragt `LocalAuthentication` ab. Exit-Code 0 = entsperrt,
1 = abgebrochen, 2 = nicht verfügbar. Das Binary ist eingecheckt, damit ein frischer Checkout
sofort baut. Neu bauen falls nötig:
`swiftc -O -o src-tauri/bin/touchid-helper src-tauri/helper/touchid.swift`

---

## 3. Rote Linien (nicht verhandelbar ohne Rückfrage)

1. **`js/logic.js` wird nicht angefasst**, außer der Nutzer beauftragt es ausdrücklich.
   Die Engine ist gegen die Original-Excel validiert. Wenn eine Änderung dort unvermeidlich
   ist: vorher sagen, rein additiv arbeiten, und **beweisen**, dass alle bisherigen
   Referenz-Tests unverändert bestehen (die alten Tests gegen die neue Engine laufen lassen).
2. **Die beiden Web-Builds bleiben funktionsfähig.** Die Mac-App ist ein dritter Build,
   kein Ersatz. Änderungen für die App dürfen `desktop`/`mobile` nicht verändern.
3. **`seed.js` enthält echte Datenspuren** → Repo bleibt privat (siehe `00_START_HIER.md`).
4. **Nach jeder Änderung laufen alle Testsuiten** (siehe unten). Grün ist Pflicht, nicht Kür.

---

## 4. Bauen, Testen, Starten

Alle Befehle im Projektordner `~/Documents/FiPla/`:

```bash
node build.js              # erzeugt alle drei Builds in dist/
node test/logic.test.js    # 116 Prüfungen — Berechnungs-Referenzwerte
node test/e2e.test.mjs     # 367 Prüfungen — komplette UI in jsdom
node test/native.test.mjs  # 39 Prüfungen — native.js mit simuliertem Tauri
npm run tauri dev          # Mac-App im Entwicklungsmodus (baut Frontend automatisch mit)
npm run tauri build        # Release-Bundle → src-tauri/target/release/bundle/macos/
cd src-tauri && cargo test # 8 Rust-Tests der Datei-Speicherung
```

**Gesamt: 522 automatische Prüfungen** (116 + 367 + 39 in JS, 8 in Rust). Alle grün.

Voraussetzungen: Node 22, Rust (rustup, stabil), Xcode Command Line Tools.
`test/e2e.test.mjs` und `test/native.test.mjs` brauchen `jsdom`. Es steht bewusst **nicht**
in der `package.json` (die soll schlank bleiben); bei Bedarf:
`npm install --no-save jsdom`

**Release installieren** (was der Nutzer als „die App" kennt):

```bash
npm run tauri build
rm -rf /Applications/Finanzplanung.app
cp -R src-tauri/target/release/bundle/macos/Finanzplanung.app /Applications/
open -a Finanzplanung
```

Wichtig: Vor dem Build eine laufende Instanz beenden (`pkill -x finanzplanung`), sonst
konkurrieren zwei Instanzen um dieselbe Zustandsdatei und lösen Sync-Konflikt-Dialoge aus.
Bundle-Ziel steht auf `["app"]` — DMG-Bundling scheitert ohne interaktive Sitzung und wird
nicht gebraucht. Keine Signierung, keine Notarisierung (bewusste Entscheidung: nur
Eigennutzung).

---

## 5. Wo liegen die Daten?

| Kontext | Ort |
|---|---|
| Web-Builds | `localStorage`, Schlüssel `finanzplanung.v1` |
| macOS-App | `~/Library/Mobile Documents/com~apple~CloudDocs/Finanzplanung/state.json` (iCloud Drive) |
| Fallback ohne iCloud | `~/Library/Application Support/Finanzplanung/state.json` |

**Schreiben ist crash-sicher:** Temp-Datei → `fsync` → atomares Umbenennen. Es existiert nie
eine halb geschriebene Datei.

**Sync-Konflikt-Schutz:** Beim Laden merkt sich Rust den Zeitstempel der Datei. Weicht er
beim Speichern ab (anderes Gerät hat via iCloud geschrieben), antwortet `save_state` mit
`"conflict"` statt zu überschreiben. Das Frontend zeigt dann einen Dialog; die **nicht**
gewählte Version wird als `state.json.konflikt-*.json` gesichert. Eine unlesbare Datei wird
als `state.json.defekt-<ts>` beiseitegelegt, nie überschrieben.

**Für Tests/Experimente niemals die echte `state.json` benutzen.** Stattdessen entweder im
Browser-Build arbeiten (eigener localStorage) oder mit gesetztem `HOME` auf einen
Wegwerf-Ordner starten — so wurden hier alle Datei-Tests gefahren.

---

## 6. Fallstricke, die uns Zeit gekostet haben

Diese Punkte sind teuer erkauft — bitte lesen, bevor etwas Ähnliches gebaut wird.

1. **WebKit hat keinen Monats-Picker.** `<input type="month">` ist in Safari/der Mac-App
   nur ein nacktes Textfeld (in Chrome dagegen ein Kalender — deshalb fällt es im
   Web-Chat nicht auf). Lösung: `UI.monthSelect(...)` aus `ui-core.js` verwenden.
   Generell: **Alles, was „im Browser funktioniert", in der echten App gegenprüfen.**
2. **`html { color-scheme: dark }` ist global gesetzt.** Der Hell-Modus-Block muss
   `color-scheme: light` explizit gegensetzen, sonst rendert WebKit native Bedienelemente
   (Dropdowns, Picker) schwarz auf hell.
3. **`prognoseGesamt` ist `null`, wenn kein Kontostand eingetragen ist** — nicht etwa gleich
   `prognoseSaldo`. Vor Verwendung immer auf `null` prüfen. Allgemein: die Null-Semantik von
   Logic-Feldern im Code nachlesen, nicht annehmen.
4. **Die Saldo-Regel im Dashboard** (mehrfach missverstanden, jetzt endgültig):
   *Jeder Monat zeigt seinen **eigenen** Saldo* — mit Kontostand `prognoseGesamt`
   (alle Konten), ohne Kontostand `prognoseSaldo` (Monats-Prognose). **Nie kumulieren,
   nie leer lassen.** Einzige Ausnahme: der Verlaufs-Chart kumuliert bewusst und verankert
   sich dabei an Monaten mit echtem Kontostand.
5. **Beispielzahlen des Nutzers immer gegen die echten Daten verifizieren.** Ein hier
   gemachter Fehler: aus einer genannten Zahl wurde rückwärts eine Formel konstruiert, die
   zufällig passte — und damit eine falsche Logik gebaut. Erst nachrechnen, dann bauen.
6. **Vorgemerkte Bankbuchungen.** Die Bank bucht Vormerkungen später endgültig — teils mit
   anderem Buchungstag *und* verändertem Empfängertext. Der automatische Abgleich
   (`Logic.reconcileVorgemerkt`) greift bewusst nur bei klaren Fällen (gleicher Empfänger
   + Betrag, ≤ 7 Tage, max. eine Vormerkung pro Buchung), weil sonst echte Zwillingskäufe
   fälschlich verschmelzen. Für die krummen Fälle gibt es das manuelle Werkzeug: ✓-Knopf
   neben dem „vorgemerkt"-Badge in der Buchungsliste.
7. **Enge Kacheln.** In halbbreiten Karten (`grid.two`) quetscht die Tabelle Eingabefelder,
   statt zu überlaufen. Gegenmittel im Projekt: `table.tbl-roomy { min-width: 460px }` plus
   `input.inline-num { min-width: 70px }`, dazu die Scroll-Schatten an `.tbl-wrap`.

---

## 7. Zusammenarbeit mit dem Nutzer

- **Sprache: Deutsch.** Der Nutzer ist **Programmier-Anfänger** — Fachbegriffe kurz erklären,
  gern mit Analogien.
- **Vor größeren Schritten in einfachen Worten sagen, was passiert und warum.**
- **Meilensteinweise arbeiten**, nicht alles auf einmal. Nicht ungefragt den Umfang erweitern:
  fällt etwas Sinnvolles außerhalb des Auftrags auf → vorschlagen, nicht einfach machen.
- **Nach jedem Schritt Tests laufen lassen und das Ergebnis zeigen.**
- Der Nutzer prüft selbst am Bildschirm und meldet Fehler oft per Screenshot. Diese
  Rückmeldungen sind zuverlässig — bei Widerspruch zwischen „Test grün" und Screenshot
  hat der Screenshot recht, dann fehlt eine Testabdeckung.
- Ehrlich sein, wenn etwas nicht geprüft werden konnte (z. B. Zwei-Geräte-Sync mit nur
  einem Gerät). Lieber Grenzen benennen als Sicherheit vortäuschen.

---

## 8. Historie in Kurzform

**Native Verpackung** (abgeschlossen): M1 Tauri-Grundgerüst · M2 Datei-Speicherung statt
localStorage · M3 native Backup-Dialoge · M4 Menüband und Tastenkürzel · M2b iCloud-Sync mit
Konflikt-Schutz · M5 Politur (Touch-ID, System-Darkmode, eigenes Icon).
Bewusst **nicht** gebaut: Signierung/Notarisierung, native Benachrichtigungen,
Spotlight-Integration, Quick-Look-Vorschau.

**Design-Überarbeitung** (abgeschlossen): Acht Batches, ursprünglich als ZIP-Dateien aus
einem parallelen Chat geliefert, hier jeweils geprüft und eingespielt. Dabei entstanden:
Umbenennung zu „FiPla", Personen-Übersicht, Einstellungen (Akzentfarbe, Dichte,
Startansicht, Theme, Touch-ID an/aus), Undo-Stapel, Scroll-Schatten.

**Danach lokal ergänzt:** Vormerkungs-Abgleich + manuelles Bereinigen-Werkzeug,
Dashboard-Monatswähler, korrekte Saldo-Anzeige.

**Arbeitsweise heute:** Der ZIP-Austausch ist durch Git abgelöst. Nach jedem geprüften
Stand wird committet und nach GitHub gepusht.

---

## 9. Offene Punkte

**Klein / kosmetisch**
- Status-Dropdown in den Sonderposten-Kacheln bleibt schmal („… od"); es öffnet korrekt
  mit vollem Text.
- In „Posten & Kategorien" schneiden die Spalten Notiz, Typ und Kategorie noch ab.

**Bewusst verschoben** (Nutzer-Entscheidung, jederzeit nachrüstbar)
- Native Benachrichtigungen (z. B. „3 Fixkosten-Posten seit 5 Tagen offen") — braucht erst
  ein Konzept, wann und wie oft.
- Heller Modus existiert nur als Ableitung des dunklen Schemas; ein eigens gestaltetes
  helles Design wäre ein eigener Meilenstein.

**Nie unter echten Bedingungen getestet**
- Der iCloud-Sync zwischen **zwei** Geräten (es gibt nur einen Mac). Der Konflikt-Schutz
  selbst ist getestet — der eigentliche Geräte-zu-Gerät-Abgleich nicht.
- `authenticate` (Touch-ID) öffnet eine macOS-Systemabfrage und ist nicht automatisiert
  testbar; geprüft wird nur, dass der Helfer gefunden und ausführbar ist.

---

## 10. Umgebung und Werkzeuge

- macOS 26.5.2 (Apple Silicon), Node 22.14, Rust 1.97.1, Tauri 2.11.
- **Projektordner: `~/Documents/FiPla`** — gleichzeitig die Wurzel des Git-Repositorys.
  Eine Sitzung startet hier, dann liegt alles Nötige darunter. (Umzug am 05.08.2026 aus
  `~/Documents/Finanzen/finanzplanung-quellcode`; Details in `05_UMZUG_2026-08-05.md`.)
- `daten/` — **echte Finanzdaten des Nutzers** (Backup und Zustand vor der
  Vormerkungs-Bereinigung). Steht in `.gitignore` und darf dort nie herausgenommen werden.
- `tools/gh` — GitHub-Kommandozeile als Einzeldatei (kein Homebrew auf diesem Mac).
  Anmeldung ist eingerichtet, `git push` läuft ohne Nachfrage. Nicht versioniert (37 MB).
  Achtung: `gh auth login` verarbeitet keine per Pipe zugeführten Eingaben — falls eine
  Neuanmeldung nötig wird, muss der Nutzer sie im eigenen Terminal durchführen.
- `tools/serve.js` — Mini-Webserver, um `dist/` im Browser zu prüfen
  (`node tools/serve.js`, dann `http://localhost:8123/finanzplanung.html`).
- `.claude/launch.json` — Konfiguration für das Browser-Panel, zeigt auf `tools/serve.js`.
