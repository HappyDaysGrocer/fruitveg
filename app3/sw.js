/* Happy Days v3 IN-HOUSE service worker.
   Network-first with cache fallback for same-origin GETs. Costs/finance
   are NEVER cached in a static file — they load over authenticated Firebase
   reads at runtime, so nothing sensitive lives in this cache. */

const CACHE = 'hd3-v36';

/* App shell (scope-relative). catalog.js is the cost-free product list;
   the secure cost overlay loads from the locked /catalog node post-login. */
const PRECACHE = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/store.js',
  './js/catalog.js',
  './js/home.js',
  './js/orders.js',
  './js/money.js',
  './js/buyrun.js',
  './js/searchBar.js',
  './js/stock.js',
  './js/boxes.js',
  './catalog.js',
  './manifest.webmanifest'
];

/* Shared root assets (outside scope but same origin) — best effort:
   a missing one must not brick the install. (No financial data here.) */
const PRECACHE_EXTRA = [
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
          .filter((n) => (n.startsWith('hd2-') || n.startsWith('hd3-')) && n !== CACHE)
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
    // cache:'no-store' bypasses the browser's HTTP cache so an online device
    // ALWAYS gets the freshest file the instant it's deployed — no more stale
    // app3 screens after an update (matches the root sw.js). The Cache API copy
    // below is kept only as the OFFLINE fallback.
    const res = await fetch(req, { cache: 'no-store' });
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
