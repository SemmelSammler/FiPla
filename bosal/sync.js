/* BoSal-Abgleich: verschlüsselt auf dem Gerät, der Server sieht nur Datensalat.
   Ein Schlüssel (20 Zeichen) ergibt drei Dinge: die Ablage-ID, ein Schreib-Token und den AES-Schlüssel.
   Wer den Schlüssel nicht hat, kann die Daten weder lesen noch überschreiben. */
(function (root) {
  "use strict";
  var enc = new TextEncoder(), dec = new TextDecoder();
  var ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // ohne 0/O und 1/I, damit man nichts verwechselt
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }
  function b64(u8) { var s = ""; for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { var bin = atob(s), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }
  function sha(s) { return crypto.subtle.digest("SHA-256", enc.encode(s)).then(hex); }
  function norm(k) { return String(k || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function valid(k) { var n = norm(k); return n.length === 20 && n.split("").every(function (c) { return ALPHA.indexOf(c) !== -1; }); }
  function pretty(k) { return norm(k).match(/.{1,4}/g).join("-"); }
  function newKey() { var r = crypto.getRandomValues(new Uint8Array(20)), k = ""; for (var i = 0; i < 20; i++) k += ALPHA[r[i] % 32]; return pretty(k); }   // 100 Bit Zufall

  var cache = {};
  function derive(key) {
    var n = norm(key);
    if (cache[n]) return cache[n];
    cache[n] = Promise.all([sha("bosal-id:" + n), sha("bosal-token:" + n),
      crypto.subtle.importKey("raw", enc.encode(n), "PBKDF2", false, ["deriveKey"]).then(function (base) {
        return crypto.subtle.deriveKey({ name: "PBKDF2", salt: enc.encode("bosal-sync-v1"), iterations: 200000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      })]).then(function (r) { return { id: r[0].slice(0, 32), token: r[1], aes: r[2] }; });
    return cache[n];
  }
  function pipe(bytes, stream) { return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  function seal(obj, aes) {
    var raw = enc.encode(JSON.stringify(obj)), z = typeof CompressionStream === "function";
    return (z ? pipe(raw, new CompressionStream("gzip")) : Promise.resolve(raw)).then(function (data) {
      var iv = crypto.getRandomValues(new Uint8Array(12));
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, aes, data).then(function (ct) { return { f: 1, z: z, iv: b64(iv), ct: b64(new Uint8Array(ct)) }; });
    });
  }
  function open(blob, aes) {
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(blob.iv) }, aes, unb64(blob.ct)).then(function (pt) {
      var u8 = new Uint8Array(pt);
      if (!blob.z) return u8;
      if (typeof DecompressionStream !== "function") throw new Error("Dieser Browser kann die Daten nicht entpacken. Bitte aktualisieren.");
      return pipe(u8, new DecompressionStream("gzip"));
    }).then(function (u8) { return JSON.parse(dec.decode(u8)); });
  }
  function url(server, id) { return String(server || "").replace(/\/+$/, "") + "/api/sync/" + id; }
  function req(method, server, keys, body) {
    var o = { method: method, headers: { "Content-Type": "application/json", "X-Bosal-Token": keys.token }, cache: "no-store" };
    if (body) o.body = JSON.stringify(body);
    return fetch(url(server, keys.id), o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; });
    });
  }
  // Holen: null = noch nichts gespeichert; sonst { v, at, data }
  function pull(server, key) {
    return derive(key).then(function (keys) {
      return req("GET", server, keys).then(function (j) {
        if (j.status === 404) return null;
        if (j.status !== 200) throw new Error(j.error || "Server antwortet mit " + j.status);
        return open(j.blob, keys.aes).then(function (data) { return { v: j.v, at: j.at, data: data }; }, function () { throw new Error("Der Schlüssel passt nicht zu den gespeicherten Daten."); });
      });
    });
  }
  // Speichern: v = Stand, auf dem die Änderung beruht. Antwort { ok, v, at } oder { conflict, remote }
  function push(server, key, v, data) {
    return derive(key).then(function (keys) {
      return seal(data, keys.aes).then(function (blob) {
        return req("PUT", server, keys, { v: v, blob: blob }).then(function (j) {
          if (j.status === 200) return { ok: true, v: j.v, at: j.at };
          if (j.status === 409) return open(j.blob, keys.aes).then(function (d) { return { conflict: true, remote: { v: j.v, at: j.at, data: d } }; });
          if (j.status === 403) throw new Error("Unter diesem Schlüssel speichert schon jemand anderes.");
          throw new Error(j.error || "Server antwortet mit " + j.status);
        });
      });
    });
  }
  // Schneller Fingerabdruck, um Änderungen zu erkennen
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ":" + str.length; }
  root.BoSalSync = { newKey: newKey, valid: valid, pretty: pretty, pull: pull, push: push, hash: hash };
})(typeof self !== "undefined" ? self : this);
