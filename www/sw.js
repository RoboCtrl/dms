/**
 * Service worker providing an offline app shell. Caches core assets on install
 * and serves cache-first with a network fallback.
 */
const CACHE = "dms-v16";
const ASSETS = [
  ".",
  "index.html",
  "css/styles.css",
  "manifest.webmanifest",
  "js/app.js",
  "js/catalog.js",
  "js/catalog-import.js",
  "js/db.js",
  "js/store.js",
  "js/settings.js",
  "js/theme.js",
  "js/viewport.js",
  "js/scanner.js",
  "js/freeze.js",
  "js/util/freeze-controller.js",
  "js/util/freeze-mask.js",
  "js/util/crop-region.js",
  "js/util/catalog-match.js",
  "js/util/grouping.js",
  "js/util/format.js",
  "js/util/icon.js",
  "js/util/scan-gate.js",
  "js/util/manual-catalog.js",
  "js/ui/catalog-section.js",
  "js/ui/history-panel.js",
  "js/ui/options-menu.js",
  "js/ui/bottom-bar.js",
  "js/ui/toast.js",
  "js/ui/preview-overlay.js",
  "js/ui/manage-db.js",
  "js/ui/manual-entries.js",
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
