const CACHE_NAME = "ivanov-analytics-v16-facebook1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20260818-5",
  "./summary-final.css?v=20260826-final",
  "./navigation.css?v=20260826-business1",
  "./dashboard.js?v=20260825-media",
  "./summary-final.js?v=20260826-final",
  "./navigation.js?v=20260826-facebook1",
  "./firebase-config.js?v=20260818-5",
  "./sites.js?v=20260818-5",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Firebase and other remote requests should stay network-first.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then(cached => cached || caches.match("./index.html")))
  );
});