/* EyeBreak service worker — offline shell + notification click handling.
 *
 * NO scheduling lives here: browsers freeze service-worker timers, so all
 * reminder logic runs in the page (js/timer.js). The SW only precaches the
 * static shell and focuses/opens the app when a notification is clicked.
 *
 * Bump CACHE_VERSION on EVERY asset change, or installed clients keep
 * serving the old files.
 */

var CACHE_VERSION = 'eyebreak-v1';

/* All URLs relative — the app is served from a subpath on GitHub Pages. */
var PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/settings.js',
  './js/sound.js',
  './js/exercises.js',
  './js/timer.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) { return cache.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          if (key !== CACHE_VERSION) return caches.delete(key);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* Cache-first for same-origin GET requests, network fallback. */
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (cached) {
      return cached || fetch(req);
    })
  );
});

/* Clicking the reminder notification focuses the app (or opens it). */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          if ('focus' in clientList[i]) return clientList[i].focus();
        }
        return self.clients.openWindow('./');
      })
  );
});
