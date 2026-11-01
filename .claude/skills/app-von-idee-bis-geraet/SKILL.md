---
name: app-von-idee-bis-geraet
description: Eine eigene App-Idee von der ersten Skizze bis auf iPhone, Windows und Mac bringen – kostenlos, ohne App Store. Nutzen, wenn der Nutzer eine neue App-Idee hat, eine App "für sich" bauen will, einen Prototyp als Artefakt testen möchte oder eine bestehende Web-App als iPhone-App (PWA) bzw. Windows-/Mac-App ausrollen und zwischen Geräten abgleichen will.
---

# Von der Idee bis aufs Gerät

Bewährter Ablauf aus dem Projekt Obol (Finanz-App, 2026). Ziel: private App für die eigenen Geräte, 0 € laufende Kosten, wenig Technik-Aufwand für den Nutzer.

## Der Nutzer
- Anfänger, Deutsch, will **sehr kurze Antworten**, genaue Klick-Anleitungen, Tabellen/Stichpunkte am Ende.
- Widerspruch ist erwünscht. Begründet widersprechen, nicht still abweichen.
- Design: extrem kritisch, saubere Ausrichtung, alles auf einen Bildschirm, nichts läuft über, kein „billiger“ Look. Dunkler Modus gefällt.
- Vor jedem großen Bau-Schritt: **Varianten als Artefakt zeigen** und wählen lassen (bei Obol: A/B/C, dann Mischung D).

## Phasen

| # | Phase | Ergebnis | Werkzeug |
|---|---|---|---|
| 1 | Idee klären | 1 Absatz: wer, wofür, welche Daten, welche Geräte | Chat |
| 2 | Prototyp | Eine HTML-Datei mit Beispieldaten, sofort klickbar | Artefakt |
| 3 | Iterieren | Funktionen, Design-Varianten, Usability mit **echten** Daten testen | Artefakt + Design-Canvas |
| 4 | Aufräumen | Persönliche Daten raus aus dem Code, Build-Skript, Tests | Repo |
| 5 | Web-App | PWA (Manifest, Service Worker, Icons) auf Cloudflare Pages | Cloudflare (gratis) |
| 6 | Abgleich | Ende-zu-Ende verschlüsselt über Pages Function + KV | Cloudflare (gratis) |
| 7 | Geräte | iPhone: „Zum Home-Bildschirm“. Windows/Mac: Tauri-Hülle, gebaut von GitHub Actions | GitHub (gratis) |
| 8 | Feinschliff | Name, Icon, letzte Handy-Details | Artefakt |

## Technik-Bausteine (aus Obol übernehmen, liegt im Repo SemmelSammler/FiPla)
- **Eine Oberfläche für alles**: Vanilla-JS + CSS, Build-Skript schreibt `web/` (index.html, manifest, sw.js, icons). Vorlage: `bosal/build.cjs`.
- **Handy-Ansicht** per `matchMedia("(max-width: 700px)")` und Klasse `html.is-phone`; Tab-Leiste unten, Eingabe als Bottom-Sheet.
- **Daten**: `localStorage` pro Gerät + Backup-Export als JSON.
- **Abgleich**: `bosal/sync.js` (Schlüssel 20 Zeichen → ID, Schreib-Token, AES-GCM via PBKDF2, gzip) und `functions/api/sync/[id].js` (KV, Versionsnummer, 409 bei Konflikt). Konflikt-Dialog statt Zusammenführen.
- **Desktop**: Tauri v2, `frontendDist: ../web`, eigener Standard-Server für den Abgleich (Desktop hat keinen http-Ursprung). Workflow: `.github/workflows/apps-build.yml` (Windows .exe, Mac universal .dmg, ad-hoc signiert).

## Cloudflare einrichten (Nutzer klickt, Claude prüft)
1. Workers & Pages → Create application → **ganz unten „Looking to deploy Pages?“** (nicht „Continue with GitHub“ = Workers).
2. Repo wählen, Framework **None**, Build-Befehl `node <pfad>/build.cjs`, Ausgabe `web`.
3. KV-Namespace anlegen, im Pages-Projekt unter Settings → Bindings verbinden, neu deployen.
4. Prüfen: `https://<projekt>.pages.dev/api/sync/000…0` muss `{"error":"Noch nichts gespeichert"}` liefern.

## Stolperfallen (alle schon passiert)
- **`<name>.pages.dev` ist weltweit eindeutig.** Ist der Name vergeben, hängt Cloudflare ein Kürzel an (`bosal-2t8`). Echte Adresse im Projekt nachsehen, nie raten.
- Diese Cloud-Umgebung erreicht `*.pages.dev` nur, wenn es unter Allowed domains steht. Sonst Nutzer selbst prüfen lassen.
- **iPhone-Notch**: mit `black-translucent` läuft Inhalt unter die Uhr. Oberen Abstand `env(safe-area-inset-top)` setzen und prüfen, dass keine ältere Regel mit `!important` ihn überschreibt.
- **Persönliche Daten** gehören nie in den Code und nie in den gehosteten Build. Beispieldaten nur lokal (`--demo`).
- **GitHub Actions**: `workflow_dispatch` geht nur, wenn der Workflow im Standard-Branch liegt. Sonst per Push mit `paths:`-Filter auslösen. Nicht bei jedem Push bauen: Mac-Minuten zählen 10-fach (2.000 Freiminuten/Monat).
- Tags/Releases anlegen kann blockiert sein → Downloads als Actions-Artefakte (90 Tage gültig).
- Unsignierte Apps: Windows „Weitere Informationen → Trotzdem ausführen“, Mac „Datenschutz & Sicherheit → Dennoch öffnen“.
- Download-Links (`<a download>`) gehen im Mac-Webview nicht → Speichern über Tauri-Dialog.
- Beim Testen mit Playwright: Debounce-Timer nicht durch Neuzeichnen zurücksetzen lassen (Sync feuerte nie).

## Verbesserungen für das nächste Projekt
1. **Startvorlage** (Template-Repo) mit Build, PWA, Abgleich, Tauri und Workflow fertig → neue App startet direkt bei Phase 2.
2. **Datenschutz ab Tag 1**: Beispieldaten von Anfang an getrennt, nichts Echtes ins Repo.
3. **Vorschau-Links**: Cloudflare baut jeden Branch als eigene Vorschau-Adresse; live nur `main`.
4. **Desktop-Updates ohne Neuinstallation** (Tauri-Updater), sonst nach jeder Änderung neu herunterladen.
5. **Claude darf selbst deployen und prüfen**: Cloudflare-API-Token (nur Pages + KV) als Secret, `*.pages.dev` und `api.cloudflare.com` freigeben.
6. **Kurzer Klick-Test** (Playwright) vor jedem Deploy.
7. **Design-Tokens früh festlegen** (Farben, Abstände, Schrift), dann gibt es weniger Ausricht-Korrekturen.

## Wann dieser Weg nicht passt
- Push-Mitteilungen, Widgets, Kamera-Scanner, Apple Watch → echte iPhone-App (Swift) nötig, Apple-Konto 99 €/Jahr.
- Viele Nutzer oder geteilte Daten mit Zusammenführen → richtige Datenbank (z. B. Cloudflare D1) statt „ein verschlüsselter Block pro Schlüssel“.
