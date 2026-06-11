/* Happy Days v2 service worker.
   Strategy: network-first with cache fallback for same-origin GETs,
   so the app always shows fresh data online and still works offline.
   Cross-origin requests (Firebase REST, identity toolkit) pass through
   untouched — store.js owns offline behaviour for data via local mirrors. */

const CACHE = 'hd2-v1';

/* App shell (scope-relative). */
const PRECACHE = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/store.js',
  './js/catalog.js',
  './js/orders.js',
  './manifest.webmanifest'
];

/* Shared root assets (outside scope but same origin) — best effort:
   a missing one must not brick the install. */
const PRECACHE_EXTRA = [
  '../shopProducts.js',
  '../happydays-wordmark.png',
  '../happydays-icons.png',
  '../icon-192.png',
  '../icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(PRECACHE);
      await Promise.allSettled(PRECACHE_EXTRA.map((u) => cache.add(u)));
      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith('hd2-') && n !== CACHE)
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // never touch PATCH/POST

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // Firebase etc. pass through

  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());       // keep offline copy fresh
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {                        // SPA shell fallback
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return new Response('Offline', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}
