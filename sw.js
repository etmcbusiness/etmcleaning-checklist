// ETMCLEANING Checklist — Service Worker
// While developing: open any page with ?nosw=1 to unregister workers and avoid stale caches.
// Bumps the version below to invalidate the cache and force users to get
// the latest files on their next visit.
const CACHE_VERSION = 'v50';
const CACHE_NAME = 'etm-checklist-' + CACHE_VERSION;

const PRECACHE_URLS = [
  './',
  './index.html',
  './ramsey-rd.html',
  './ramsey-rd-checklist.html',
  './ramsey-rd-log.html',
  './capital-eye-care.html',
  './capital-eye-care-checklist.html',
  './capital-eye-care-log.html',
  './belterra-eye-care.html',
  './belterra-eye-care-checklist.html',
  './belterra-eye-care-log.html',
  './the-commune.html',
  './the-commune-checklist.html',
  './the-commune-log.html',
  './innerhouse.html',
  './innerhouse-checklist.html',
  './innerhouse-log.html',
  './mreyedr-congress.html',
  './mreyedr-congress-checklist.html',
  './mreyedr-congress-log.html',
  './warehouse.html',
  './styles.css',
  './checklist.js',
  './media-db.js',
  './backup-restore.js',
  './alarm-reveal.js',
  './log.js',
  './manifest.json',
  './icons/app-icon.png',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './icons/favicon.svg',
  './sounds/task.mp3',
  './sounds/milestone-25.mp3',
  './sounds/milestone-50.mp3',
  './sounds/milestone-75.mp3',
  './sounds/milestone-100.mp3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch(() => {
            /* One bad URL must not fail the whole install (missing file / offline). */
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML navigations: network first so the installed PWA picks up new pages when online
  // (cache-first would keep serving an old precached index forever).
  const isNavigation =
    req.mode === 'navigate' || req.destination === 'document';

  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(req)
            .then((c) => c || caches.match('./index.html'))
        )
    );
    return;
  }

  // CSS/JS: network-first when online so every page gets the same freshly deployed
  // styles and scripts (cache-first here left the dashboard HTML updated but old styles.css).
  const path = url.pathname;
  if (/\.(?:css|js)$/i.test(path)) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => cached || caches.match('./index.html'));
      return cached || network;
    })
  );
});
