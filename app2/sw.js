/* Happy Days v2 service worker.
   Strategy: network-first with cache fallback for same-origin GETs,
   so the app always shows fresh data online and still works offline.
   Cross-origin requests (Firebase REST, identity toolkit) pass through
   untouched — store.js owns offline behaviour for data via local mirrors. */

const CACHE = 'hd2-v3';   // bump on any shell change to force a clean refresh on every device

/* App shell (scope-relative). catalog.js is the PUBLIC cost-free product
   list — the customer app never loads the root shopProducts.js (which
   carries purchase costs), so it is deliberately NOT cached here. */
const PRECACHE = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/store.js',
  './js/catalog.js',
  './js/orders.js',
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
      // 'reload' bypasses the HTTP cache so a new SW always precaches the
      // freshly-deployed shell (never a stale copy held by the browser/CDN).
      const fresh = (u) => fetch(new Request(u, { cache: 'reload' }))
        .then((r) => { if (r && r.ok) return cache.put(u, r); })
        .catch(() => {});
      await Promise.all(PRECACHE.map(fresh));
      await Promise.allSettled(PRECACHE_EXTRA.map(fresh));
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
    // 'no-cache' = always revalidate with the server, so a new deploy shows
    // up on the next load instead of being masked by the browser HTTP cache.
    const res = await fetch(req, { cache: 'no-cache' });
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
