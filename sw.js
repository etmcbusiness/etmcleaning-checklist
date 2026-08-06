// ETMCLEANING Checklist — Service Worker
// Local desktop dev (localhost / 127.0.0.1): app.js skips registration and unregisters so
// edits load without stale precache — no need to bump CACHE_VERSION or push to test.
// Opt in on localhost: ?sw=1   Opt out anywhere: ?nosw=1 (unregister only).
// Bumps the version below to invalidate the cache and force users to get
// the latest files on their next visit.
const CACHE_VERSION = 'v93';
const CACHE_NAME = 'etm-checklist-' + CACHE_VERSION;

const PRECACHE_URLS = [
  './',
  './index.html',
  './cleaning-calendar.html',
  './all-cleanings-log.html',
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
  './tanuki-games.html',
  './tanuki-games-checklist.html',
  './tanuki-games-log.html',
  './advanced-eye-care-surgery.html',
  './advanced-eye-care-surgery-checklist.html',
  './advanced-eye-care-surgery-log.html',
  './innovative-eye-care.html',
  './innovative-eye-care-checklist.html',
  './innovative-eye-care-log.html',
  './bastrop-family-eye-care.html',
  './bastrop-family-eye-care-checklist.html',
  './bastrop-family-eye-care-log.html',
  './tanuki-games-windows.html',
  './tanuki-games-windows-checklist.html',
  './tanuki-games-windows-log.html',
  './lush-6th-st.html',
  './lush-6th-st-checklist.html',
  './lush-6th-st-log.html',
  './lush-domain.html',
  './lush-domain-checklist.html',
  './lush-domain-log.html',
  './mreyedr-congress.html',
  './mreyedr-congress-checklist.html',
  './mreyedr-congress-log.html',
  './mreyedr-hutto.html',
  './mreyedr-hutto-checklist.html',
  './mreyedr-hutto-log.html',
  './warehouse.html',
  './bee-cave-vision.html',
  './bee-cave-vision-checklist.html',
  './bee-cave-vision-log.html',
  './mikas-airbnb.html',
  './mikas-airbnb-checklist.html',
  './mikas-airbnb-log.html',
  './myeyedr-domain.html',
  './myeyedr-domain-checklist.html',
  './myeyedr-domain-log.html',
  './myeyedr-seaholm.html',
  './myeyedr-seaholm-checklist.html',
  './myeyedr-seaholm-log.html',
  './thrift-s-congress.html',
  './thrift-s-congress-checklist.html',
  './thrift-s-congress-log.html',
  './config.js',
  './styles.css',
  './checklist.js',
  './media-db.js',
  './backup-restore.js',
  './alarm-reveal.js',
  './log.js',
  './master-log.js',
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

// Network-first, but never lets a slow/stalled connection block rendering: races the
// network fetch against a short timeout and falls back to whatever is cached (still
// updating the cache in the background once/if the network response does arrive).
const NETWORK_TIMEOUT_MS = 3000;

function networkFirstWithTimeout(req, fallbackReq) {
  return caches.match(req).then((cached) => {
    return new Promise((resolve) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        if (cached) {
          settled = true;
          resolve(cached);
        } else if (fallbackReq) {
          caches.match(fallbackReq).then((c) => {
            if (settled) return;
            settled = true;
            resolve(c);
          });
        }
      }, NETWORK_TIMEOUT_MS);

      fetch(req)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(response);
          }
        })
        .catch(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (cached) {
            resolve(cached);
          } else if (fallbackReq) {
            caches.match(fallbackReq).then((c) => resolve(c));
          } else {
            resolve(undefined);
          }
        });
    });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML navigations: network first so the installed PWA picks up new pages when online
  // (cache-first would keep serving an old precached index forever) — but capped by a
  // timeout so a slow/stalled connection falls back to cache instead of hanging.
  const isNavigation =
    req.mode === 'navigate' || req.destination === 'document';

  if (isNavigation) {
    event.respondWith(networkFirstWithTimeout(req, './index.html'));
    return;
  }

  // CSS/JS: network-first when online so every page gets the same freshly deployed
  // styles and scripts (cache-first here left the dashboard HTML updated but old styles.css),
  // same timeout cap as navigations.
  const path = url.pathname;
  if (/\.(?:css|js)$/i.test(path)) {
    event.respondWith(networkFirstWithTimeout(req, null));
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
