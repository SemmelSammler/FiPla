// BoSal-Entwurf bauen:  node entwurf/build.cjs . entwurf/BoSal-Entwurf.html
// Die erzeugte HTML-Datei enthält die Daten aus js/seed.js (echte Spuren) und wird deshalb
// nicht versioniert (siehe .gitignore).
const fs = require("fs"), path = require("path");
const repo = process.argv[2], out = process.argv[3], here = __dirname;
const js = ["js/logic.js", "js/defaults.js", "js/seed.js"].map(f => fs.readFileSync(path.join(repo, f), "utf8")).join("\n") + "\n" + fs.readFileSync(path.join(here, "zukunft.js"), "utf8") + "\n" + fs.readFileSync(path.join(here, "bosal.js"), "utf8");
const css = fs.readFileSync(path.join(here, "basis.css"), "utf8") + "\n" + fs.readFileSync(path.join(here, "bosal.css"), "utf8") + "\n" + fs.readFileSync(path.join(here, "zukunft.css"), "utf8");
const html = `<!doctype html><html lang="de" data-design="weich"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BoSal · Entwurf 2</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>${css}</style></head><body><div class="app" id="app"></div><script>${js.replace(/<\/script>/gi, "<\\/script>")}</script></body></html>`;
fs.writeFileSync(out, html); console.log(out, (html.length / 1024).toFixed(0) + " KB");
