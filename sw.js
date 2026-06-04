/* Happy Days FruitVeg — service worker
   Strategy: NETWORK-FIRST, and for the app files we bypass the browser's HTTP
   cache entirely (cache:'no-store') so you ALWAYS get the freshest copy when
   online. This is what kills the "stale/cached old copy" problem. When offline,
   it falls back to the last cached copy so the app still opens at the market. */
var CACHE = 'mandi-cache-v2';

self.addEventListener('install', function (e) {
  self.skipWaiting(); // activate the new worker immediately
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
                            .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var req = e.request;

  // Page loads + code/data files: pull straight from the server, ignoring the
  // browser's HTTP cache. Other assets (icons, etc.) use a normal network fetch.
  var fresh = (req.mode === 'navigate') || /\.(?:html|js|json)(?:[?#]|$)/i.test(req.url);
  var go = fresh ? fetch(req.url, { cache: 'no-store' }) : fetch(req);

  e.respondWith(
    go.then(function (resp) {
      var copy = resp.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return resp;
    }).catch(function () {
      return caches.match(req);
    })
  );
});
