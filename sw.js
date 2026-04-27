const CACHE = 'ir-office-v2';
const PRECACHE = [
  '/',
  '/index.html',
  '/calculator.html',
  '/room.html',
  '/offer.html',
  '/avansov-otchet.html',
  '/profiles.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Инсталация — кешира всички файлове предварително
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Активиране — изтрива стари кешове
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — мрежа първо, при неуспех кеш
self.addEventListener('fetch', e => {
  // Firebase и CDN заявки — само мрежа, без кеш
  if (e.request.url.includes('firebasejs') ||
      e.request.url.includes('googleapis') ||
      e.request.url.includes('gstatic') ||
      e.request.url.includes('cdnjs') ||
      e.request.url.includes('jsdelivr') ||
      e.request.url.includes('fonts.')) {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Кешира успешен отговор
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
