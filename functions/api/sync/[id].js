// BoSal-Abgleich (Cloudflare Pages Function). Speichert pro Ablage-ID einen verschlüsselten Datenblock im
// KV-Speicher „BOSAL_SYNC“. Der Server kann die Daten nicht lesen: Ver- und Entschlüsselung passieren auf dem Gerät.
// Schreiben darf nur, wer das Token kennt, mit dem die Ablage angelegt wurde (gespeichert wird nur sein Hash).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Bosal-Token",
  "Access-Control-Max-Age": "86400"
};
const MAX_BYTES = 20 * 1024 * 1024;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
async function sha(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequest({ request, env, params }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const id = String(params.id || "");
  if (!/^[a-f0-9]{32}$/.test(id)) return json({ error: "Ungültige Ablage-ID" }, 400);
  if (!env.BOSAL_SYNC) return json({ error: "KV-Speicher BOSAL_SYNC ist nicht verbunden" }, 500);

  const raw = await env.BOSAL_SYNC.get(id);
  const cur = raw ? JSON.parse(raw) : null;

  if (request.method === "GET") {
    return cur ? json({ v: cur.v, at: cur.at, blob: cur.blob }) : json({ error: "Noch nichts gespeichert" }, 404);
  }
  if (request.method === "PUT") {
    const token = request.headers.get("X-Bosal-Token") || "";
    if (token.length < 32) return json({ error: "Token fehlt" }, 401);
    const th = await sha(token);
    if (cur && cur.th !== th) return json({ error: "Falsches Token" }, 403);
    const text = await request.text();
    if (text.length > MAX_BYTES) return json({ error: "Zu groß" }, 413);
    let body;
    try { body = JSON.parse(text); } catch (e) { return json({ error: "Kein JSON" }, 400); }
    if (!body || !body.blob || typeof body.v !== "number") return json({ error: "Unvollständig" }, 400);
    // Nur speichern, wenn die Änderung auf dem aktuellen Stand beruht; sonst bekommt das Gerät den neuen Stand zurück
    if ((cur ? cur.v : 0) !== body.v) return json({ error: "Konflikt", v: cur.v, at: cur.at, blob: cur.blob }, 409);
    const next = { v: (cur ? cur.v : 0) + 1, at: Date.now(), th, blob: body.blob };
    await env.BOSAL_SYNC.put(id, JSON.stringify(next));
    return json({ v: next.v, at: next.at });
  }
  return json({ error: "Nicht erlaubt" }, 405);
}
