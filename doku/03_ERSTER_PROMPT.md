# Erste Nachricht für eine neue Sitzung

Die neue Sitzung **im Ordner `~/Documents/FiPla` starten** (nicht darüber, nicht in einem
anderen Projekt — sonst greifen fremde Hooks und die falsche Dev-Server-Konfiguration).
Dann den Text unterhalb der Linie kopieren und als erste Nachricht senden.

---

Ich übernehme ein laufendes Projekt. Die Übergabe liegt im Ordner `doku/`.

**Bitte zuerst lesen, bevor du irgendetwas tust:**
1. `doku/00_START_HIER.md`
2. `doku/01_UEBERGABE.md` — das Hauptdokument (Architektur, rote Linien, Fallstricke)
3. `doku/05_UMZUG_2026-08-05.md` — Ordnerstruktur und die aktuell offene Entscheidung
4. `doku/04_STAND_2026-08-05.md` — das Design-Audit, unsere nächste Aufgabe

**Zum Projekt in einem Satz:** FiPla ist mein persönliches Finanz-Cockpit — Vanilla
JavaScript ohne Framework, das als Web-App **und** als native macOS-App (Tauri v2) aus
derselben Codebasis gebaut wird.

**Wichtig für die Zusammenarbeit:**
- Ich bin Programmier-Anfänger. Bitte auf Deutsch antworten und vor größeren Schritten
  kurz in einfachen Worten erklären, was du tust und warum.
- `js/logic.js` ist die validierte Berechnungs-Engine und wird **nicht** verändert, außer
  ich beauftrage es ausdrücklich.
- Nach jeder Änderung bitte alle Testsuiten laufen lassen und mir das Ergebnis zeigen
  (`node test/logic.test.js`, `node test/e2e.test.mjs`, `node test/native.test.mjs`,
  und bei Rust-Änderungen `cargo test` in `src-tauri/`).
- Bitte nichts außerhalb des besprochenen Auftrags ändern — lieber vorschlagen und
  nachfragen.
- Widerspruch ist erwünscht: wenn du meinen Auftrag kritisch siehst oder es anders machen
  würdest, sag es mit einer kurzen Begründung, statt es still umzusetzen oder still
  abzuweichen.
- In `daten/` liegen echte Finanzdaten. Nicht anfassen, nichts daraus in versionierte
  Dateien kopieren.

**Zum Einstieg bitte:**
1. Bestätige mir kurz in eigenen Worten, dass der Stand angekommen ist — besonders, was die
   nächste Aufgabe ist und welche Entscheidung dafür noch offen ist.
2. Prüfe, ob die Umgebung funktioniert: `node build.js` und alle Testsuiten.
   Erwartet sind 116 + 367 + 39 Prüfungen, alle ohne Fehler.
3. Sag mir Bescheid, wenn etwas fehlt oder nicht läuft — dann klären wir das, bevor wir an
   Inhalten arbeiten.

**Unsere nächste Aufgabe:** die drei Design-Skalen (Schriftgrößen, Abstände, Eckradien) als
Tokens in `styles.css` anlegen und die bestehenden Regeln darauf umstellen. Frag mich als
Erstes nach der offenen Entscheidung zu `.big-figure` (34px als eigene Stufe oder Wachstum
auf 40px) — sie steht in `doku/05_UMZUG_2026-08-05.md` mit beiden Argumenten.
