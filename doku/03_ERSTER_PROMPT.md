# Erste Nachricht für den neuen Chat

Den Text unterhalb der Linie kopieren und im neuen Chat als erste Nachricht senden —
zusammen mit dem entpackten Übergabepaket (bzw. in dem Ordner, in dem es liegt).

---

Ich übernehme ein laufendes Projekt in diesen Chat. Im Übergabepaket findest du alles dazu.

**Bitte zuerst lesen, bevor du irgendetwas tust:**
1. `00_START_HIER.md`
2. `01_UEBERGABE.md` — das Hauptdokument (Architektur, rote Linien, Fallstricke)

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

**Zum Einstieg bitte:**
1. Bestätige mir kurz, dass du den Stand verstanden hast — in eigenen Worten, damit ich
   sehe, dass die Übergabe angekommen ist.
2. Prüfe, ob die Umgebung funktioniert: Baue das Projekt (`node build.js`) und lass alle
   Testsuiten laufen. Erwartet sind 116 + 367 + 39 Prüfungen, alle ohne Fehler.
3. Sag mir Bescheid, wenn etwas fehlt oder nicht läuft — dann klären wir das, bevor wir
   an Inhalten arbeiten.
