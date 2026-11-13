/* InsectEye service worker.
   Versioning: this file is registered as sw.js?v=<CACHE_VERSION>, so the
   version lives in the registration URL. Bumping CACHE_VERSION in the HTML
   (the existing release ritual) creates a new registration, a new cache name,
   and a clean sweep of old caches — this file itself never needs editing. */
'use strict';

var VERSION = new URL(self.location.href).searchParams.get('v') || 'v0';
var CACHE = 'insecteye-' + VERSION;
var CORE = ['./', './manifest.webmanifest',
            './icon-192.png', './icon-512.png',
            './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* addAll is atomic; icons failing (e.g. not yet uploaded) should not
         block offline for the app itself, so cache the shell first. */
      return c.add('./').then(function () {
        return Promise.all(CORE.slice(1).map(function (u) {
          return c.add(u).catch(function () {});
        }));
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf('insecteye-') === 0 && k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Stale-while-revalidate for same-origin GETs: the orchard gets an instant
   cached load, the network refreshes the cache in the background, and the
   next launch has the update. Cross-origin (source links) passes through. */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  var key = (req.mode === 'navigate') ? './' : req;
  /* The refresh is one promise covering fetch AND cache write, and the event
     is kept alive until it settles — otherwise, when a cached copy answers
     first, the browser may stop the worker mid-refresh and the update is lost. */
  var cacheP = caches.open(CACHE);
  var refresh = cacheP.then(function (c) {
    return fetch(req).then(function (res) {
      if (!res || !res.ok) return res;
      var done = function () { return res; };
      return c.put(key, res.clone()).then(done, done);   /* a full cache must not fail the page */
    });
  });
  e.waitUntil(refresh.catch(function () {}));
  e.respondWith(
    cacheP.then(function (c) { return c.match(key); }).then(function (cached) {
      return cached || refresh;
    })
  );
});
