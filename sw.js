// ETMCLEANING Checklist — Service Worker
// While developing: open any page with ?nosw=1 to unregister workers and avoid stale caches.
// Bumps the version below to invalidate the cache and force users to get
// the latest files on their next visit.
const CACHE_VERSION = 'v27';
const CACHE_NAME = 'etm-checklist-' + CACHE_VERSION;

const PRECACHE_URLS = [
  './',
  './index.html',
  './ramsey-rd.html',
  './ramsey-rd-checklist.html',
  './ramsey-rd-log.html',
  './warehouse.html',
  './styles.css',
  './checklist.js',
  './media-db.js',
  './log.js',
  './manifest.json',
  './icons/app-icon.png',
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
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
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
