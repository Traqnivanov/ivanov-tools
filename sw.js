const CACHE_NAME = 'ir-офис-v1';
const URLS = [
  '/ivanov-tools/',
  '/ivanov-tools/index.html',
  '/ivanov-tools/calculator.html',
  '/ivanov-tools/room.html',
  '/ivanov-tools/offer.html',
  '/ivanov-tools/avansov-otchet.html',
  '/ivanov-tools/services.js',
  '/ivanov-tools/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).catch(() => caches.match('/ivanov-tools/'));
    })
  );
});
