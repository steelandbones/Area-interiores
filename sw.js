/* Service worker: guarda la app en el dispositivo para que funcione sin conexión. Sube VERSION en cada cambio. */
const VERSION = "presupuestos-v2";
const FILES = [
  "./", "./index.html", "./login.js", "./main.js", "./app.js", "./app.css", "./manifest.webmanifest",
  "./vendor/jspdf.umd.min.js", "./vendor/pdf-fonts.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png", "./icons/favicon-32.png",
  "./fonts/cormorant-garamond-latin-400-italic.woff2",
  "./fonts/cormorant-garamond-latin-400-normal.woff2",
  "./fonts/cormorant-garamond-latin-500-italic.woff2",
  "./fonts/cormorant-garamond-latin-500-normal.woff2",
  "./fonts/cormorant-garamond-latin-600-normal.woff2",
  "./fonts/fonts.css",
  "./fonts/jost-latin-300-normal.woff2",
  "./fonts/jost-latin-400-normal.woff2",
  "./fonts/jost-latin-500-normal.woff2",
  "./fonts/jost-latin-600-normal.woff2",
  "./fonts/manrope-latin-400-normal.woff2",
  "./fonts/manrope-latin-500-normal.woff2",
  "./fonts/manrope-latin-600-normal.woff2",
  "./fonts/manrope-latin-700-normal.woff2",
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    // la página: primero la red (para coger cambios), si no hay conexión, la copia guardada
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put("./index.html", c)); return r; })
      .catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
