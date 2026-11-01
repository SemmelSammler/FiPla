// Obol bauen: node bosal/build.cjs [Zielordner] [--demo]
// Schreibt die App als Web-App in einen Ordner (Standard: web/): index.html, Manifest, Service Worker, Icons.
// Derselbe Ordner dient als Oberfläche der Desktop-App (Tauri) und wird von Cloudflare Pages ausgeliefert.
// Ohne --demo enthält die App KEINE Daten: weder seed.js noch persönliche Zukunft-Werte aus defaults.js.
// Mit --demo kommen die Beispieldaten aus js/seed.js dazu (nur lokal zum Ausprobieren, nie hochladen).
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const here = __dirname, repo = path.join(here, "..");
const args = process.argv.slice(2), demo = args.includes("--demo");
const out = path.resolve(repo, args.find((a) => !a.startsWith("--")) || "web");
const read = (f) => fs.readFileSync(path.join(repo, f), "utf8");

// Aus defaults.js nur die Kategorien übernehmen (die Zukunft-Werte darin sind persönliche Zahlen)
const D = require(path.join(repo, "js/defaults.js"));
const defaults = demo ? read("js/defaults.js") : "window.DEFAULTS = " + JSON.stringify({ categories: D.categories }) + ";";
const js = [read("js/logic.js"), defaults, demo ? read("js/seed.js") : "",
  read("bosal/fiplan.js"), read("bosal/zukunft.js"), read("bosal/sync.js"), read("bosal/bosal.js")].join("\n");
const css = ["basis.css", "bosal.css", "zukunft.css", "mobil.css"].map((f) => read("bosal/" + f)).join("\n");
const version = crypto.createHash("sha256").update(js + css).digest("hex").slice(0, 10);

const html = `<!doctype html><html lang="de" data-design="weich"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Obol</title>
<meta name="theme-color" content="#111216">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Obol">
<link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icons/apple-touch-icon.png"><link rel="icon" href="icons/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>${css}</style></head><body><div class="app" id="app"></div>
<script>${js.replace(/<\/script>/gi, "<\\/script>")}</script>
<script>if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js");</script>
</body></html>`;

const manifest = {
  name: "Obol", short_name: "Obol", lang: "de", start_url: "./", scope: "./", display: "standalone",
  background_color: "#111216", theme_color: "#111216",
  icons: [
    { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
  ]
};
// Offline: die Seite immer zuerst frisch aus dem Netz (damit Updates sofort ankommen), sonst aus dem Speicher.
// Der Abgleich (/api/) läuft nie über den Speicher.
const sw = `const CACHE = "bosal-${version}";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.includes("/api/")) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});
`;

fs.mkdirSync(path.join(out, "icons"), { recursive: true });
fs.writeFileSync(path.join(out, "index.html"), html);
fs.writeFileSync(path.join(out, "manifest.webmanifest"), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(out, "sw.js"), sw);
for (const f of fs.readdirSync(path.join(here, "icons"))) fs.copyFileSync(path.join(here, "icons", f), path.join(out, "icons", f));
console.log(out + "/index.html", (html.length / 1024).toFixed(0) + " KB", demo ? "(mit Beispieldaten)" : "(ohne Daten)", "Version " + version);
