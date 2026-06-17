/* Eucharisteo Invoice Tracker — service worker (offline + installability) */
const CACHE = 'eucharisteo-tracker-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/js/app.js',
  './assets/js/store.js',
  './assets/js/calc.js',
  './assets/js/export.js',
  './assets/js/config.js',
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

  // never cache Firestore/Auth API traffic — must hit the network live
  if (/firebaseio|googleapis|firebase|identitytoolkit|firestore/.test(url.hostname)) return;

  // network-first for our own HTML so updates show up
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return r;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  // cache-first for everything else (assets + CDN libs/fonts) with runtime fill
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok && (url.origin === location.origin || /gstatic|sheetjs|cloudflare|jsdelivr/.test(url.hostname))) {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return r;
    }).catch(() => hit))
  );
});
