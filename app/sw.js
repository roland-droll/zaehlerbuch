/* Service Worker: hält alle Programmdateien und Modelle im Cache, damit das Zählerbuch ohne Netz startet.
   Bei jeder Änderung an den Dateien STAND hochzählen, sonst bekommen installierte Apps die neue Fassung nicht. */
const STAND = "zaehlerbuch-3";
const DATEIEN = [
  "./", "index.html", "app.css", "manifest.webmanifest",
  "js/app.js", "js/netz.js", "js/suche.js", "js/erkenner.js",
  "modelle/ziffer.json", "modelle/ziffer.bin", "modelle/zeiger.json", "modelle/zeiger.bin", "modelle/LIZENZ-AI-on-the-edge.md",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(STAND).then(c => c.addAll(DATEIEN)));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(namen => Promise.all(namen.filter(n => n.startsWith("zaehlerbuch-") && n !== STAND).map(n => caches.delete(n))))
      .then(() => self.clients.claim()));
});

self.addEventListener("message", e => { if (e.data === "uebernehmen") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(r, { ignoreSearch: true }).then(treffer => {
      if (treffer) return treffer;
      return fetch(r).catch(() => (r.mode === "navigate" ? caches.match("index.html") : Response.error()));
    }));
});
