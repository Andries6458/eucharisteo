/* Eucharisteo Financial Advisor — service worker (offline + installability) */
const CACHE = 'eucharisteo-advisor-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/js/app.js',
  './assets/js/config.js',
  './assets/js/fx.js',
  './assets/js/market.js',
  './assets/js/movers.js',
  './assets/js/allocation.js',
  './assets/js/advisor.js',
  './assets/js/store.js',
  './assets/js/sync.js',
  './assets/js/obsidian.js',
  './assets/js/vault-md.js',
  './assets/js/charts.js',
  './assets/js/tax/us.js',
  './assets/js/tax/za.js',
  './assets/js/tax/uk.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // live market/FX APIs must never be served stale from cache
  if (/frankfurter|finnhub|yahoo/.test(url.hostname)) return;

  // our own app shell: NETWORK-FIRST so new deploys show up immediately,
  // falling back to cache when offline
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return r;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then((m) => m || caches.match('./index.html')))
    );
    return;
  }

  // third-party static assets (fonts): cache-first
  e.respondWith(
    caches.match(req).then((m) => m || fetch(req).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return r;
    }))
  );
});
