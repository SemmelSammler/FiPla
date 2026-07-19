// Baut DREI Versionen aus derselben Codebasis:
//   dist/finanzplanung.html      — Desktop/Voll-Version (APP_MODE=desktop)
//   dist/mobile/index.html       — Handy-Version für Cloudflare Pages (APP_MODE=mobile)
//   dist/native/index.html       — macOS-App-Frontend für Tauri (APP_MODE=desktop-native)
const fs = require("fs");
const path = require("path");
const dir = __dirname;
const scripts = ["js/logic.js","js/defaults.js","js/seed.js","js/util.js","js/store.js","js/charts.js","js/ui-core.js","js/native.js","js/views-budget.js","js/views-dashboard.js","js/views-monat.js","js/views-import.js","js/views-posten.js","js/views-fi.js","js/views-szenarien.js","js/views-backup.js"];
const css = fs.readFileSync(path.join(dir,"styles.css"),"utf8");
const js = scripts.map(s=>"/* ===== "+s+" ===== */\n"+fs.readFileSync(path.join(dir,s),"utf8")).join("\n").replace(/<\/script>/gi,"<\\/script>");
const base = fs.readFileSync(path.join(dir,"index.html"),"utf8");

function emit(mode, outPath) {
  let html = base.replace("<!--STYLES-->", "<style>\n"+css+"\n</style>");
  html = html.replace("<!--SCRIPTS-->", "<script>window.APP_MODE="+JSON.stringify(mode)+";</script>\n<script>\n"+js+"\n</script>");
  if (mode === "mobile") {
    html = html.replace("<title>Finanzplanung · Cockpit</title>",
      '<title>Finanzplanung · Budget</title>\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">');
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  console.log(path.relative(dir, outPath)+":", (html.length/1024).toFixed(0)+" KB ("+mode+")");
}
emit("desktop", path.join(dir, "dist/finanzplanung.html"));
emit("mobile", path.join(dir, "dist/mobile/index.html"));
emit("desktop-native", path.join(dir, "dist/native/index.html"));
