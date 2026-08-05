// Mini-Static-Server für den Browser-Check der dist-Builds
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = "/Users/semmelsammler/Documents/Finanzen/finanzplanung-quellcode/dist";
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".css": "text/css" };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(8123, () => console.log("dist-server on http://localhost:8123"));
