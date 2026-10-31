# BoSal als App: Web-App, Abgleich, Bauen

Stand 31.10.2026. BoSal ersetzt die alte Oberfläche. Der Quellcode liegt in `bosal/`.

## Aufbau

| Datei | Inhalt |
|---|---|
| `bosal/bosal.js` | die App (Monat, Offen, Ausgaben, Mehr, Kassensturz, Import, iPhone-Ansicht, Abgleich) |
| `bosal/zukunft.js`, `bosal/fiplan.js` | Zukunft und die FI-Rechnung |
| `bosal/sync.js` | Verschlüsselung und Server-Aufrufe des Abgleichs |
| `bosal/*.css` | Aussehen; `mobil.css` = iPhone-Ansicht (Design D, nur bei `html.is-phone`) |
| `bosal/build.cjs` | baut alles nach `web/` (index.html, Manifest, Service Worker, Icons) |
| `functions/api/sync/[id].js` | Server des Abgleichs (Cloudflare Pages Function, KV „BOSAL_SYNC“) |

Bauen: `node bosal/build.cjs` → `web/`. Mit `--demo` kommen Beispieldaten aus `js/seed.js` dazu
(nur lokal, nie hochladen). **Im Code stehen keine persönlichen Zahlen**; Daten kommen nur über
Backup, Import oder Abgleich in die App.

## iPhone-Ansicht

Unter 700 px Breite: Monat und Offen im Design D, Tab-Leiste (Monat · Offen · + · Ausgaben · Mehr),
„Neu eintragen“ als Blatt mit Ziffernblock. Zukunft liegt am Handy unter Mehr. Hell/Dunkel folgt
standardmäßig dem System.

## Abgleich (verschlüsselt)

- Ein Schlüssel mit 20 Zeichen (100 Bit Zufall) ergibt per SHA-256 die Ablage-ID und ein Schreib-Token,
  per PBKDF2 (200.000 Runden) den AES-GCM-Schlüssel. Daten werden vor dem Verschlüsseln mit gzip gepackt.
- Der Server speichert nur `{v, at, Hash des Tokens, verschlüsselter Block}`. Schreiben nur mit Token,
  nur auf dem aktuellen Stand (`v`), sonst 409 mit dem neueren Stand.
- Gerät: speichert 3 s nach einer Änderung, holt beim Start, beim Zurückkehren in die App und alle 2 Minuten.
  Haben beide Seiten Änderungen, fragt BoSal, welcher Stand gelten soll (kein Zusammenführen).
- Verbindungsdaten liegen getrennt unter `localStorage["bosal.sync"]` und werden nicht mit abgeglichen.

## Cloudflare (einmal einrichten)

Pages-Projekt mit GitHub verbunden: Build-Befehl `node bosal/build.cjs`, Ausgabe `web`.
KV-Namespace anlegen und im Pages-Projekt als `BOSAL_SYNC` binden. Kostenlos (Workers/KV Free).
