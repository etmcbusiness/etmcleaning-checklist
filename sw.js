// ETMCLEANING Checklist — Service Worker
// Local desktop dev (localhost / 127.0.0.1): app.js skips registration and unregisters so
// edits load without stale precache — no need to bump CACHE_VERSION or push to test.
// Opt in on localhost: ?sw=1   Opt out anywhere: ?nosw=1 (unregister only).
// Bumps the version below to invalidate the cache and force users to get
// the latest files on their next visit.
const CACHE_VERSION = 'v100';
const CACHE_NAME = 'etm-checklist-' + CACHE_VERSION;

const PRECACHE_URLS = [
  './',
  './index.html',
  './one-off-cleaning.html',
  './one-off-janitorial-checklist.html',
  './one-off-window-checklist.html',
  './one-off.js',
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
  './est-time.js',
  './log.js',
  './master-log.js',
  './manifest.json',
  './cubano-sharp.otf',
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

// Cache-first, revalidate in the background: every request is answered instantly from
// the installed cache (no waiting on the network, ever, on the critical path — a slow
// or stalled connection can no longer delay rendering or leave scripts un-attached when
// the user starts tapping). A fetch always runs alongside it to refresh the cache for
// next time; the existing install/activate + controllerchange reload (see app.js) is
// what surfaces that fresh copy, so nothing here needs to block on the network.
function cacheFirstAndRevalidate(req, fallbackReq) {
  return caches.match(req).then((cached) => {
    const revalidate = fetch(req)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      })
      .catch(() => undefined);

    if (cached) return cached;
    return revalidate.then((response) => {
      if (response) return response;
      return fallbackReq ? caches.match(fallbackReq) : undefined;
    });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation =
    req.mode === 'navigate' || req.destination === 'document';

  if (isNavigation) {
    event.respondWith(cacheFirstAndRevalidate(req, './index.html'));
    return;
  }

  const path = url.pathname;
  if (/\.(?:css|js)$/i.test(path)) {
    event.respondWith(cacheFirstAndRevalidate(req, null));
    return;
  }

  event.respondWith(cacheFirstAndRevalidate(req, './index.html'));
});
