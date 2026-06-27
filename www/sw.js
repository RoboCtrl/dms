/**
 * Service worker providing an offline app shell. Caches core assets on install
 * and serves cache-first with a network fallback.
 */
const CACHE = "dms-v2";
const ASSETS = [
  ".",
  "index.html",
  "css/styles.css",
  "manifest.webmanifest",
  "js/app.js",
  "js/db.js",
  "js/store.js",
  "js/settings.js",
  "js/theme.js",
  "js/scanner.js",
  "js/util/format.js",
  "js/util/icon.js",
  "js/util/scan-gate.js",
  "js/ui/history-panel.js",
  "js/ui/options-menu.js",
  "js/ui/bottom-bar.js",
  "vendor/zxing/zxing.min.js",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request)),
  );
});
