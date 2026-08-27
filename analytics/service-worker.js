const CACHE_NAME = "ivanov-analytics-v28-filterrefresh2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20260818-5",
  "./summary-final.css?v=20260826-final",
  "./navigation.css?v=20260826-channels1",
  "./summary-channels.css?v=20260826-channels2",
  "./ads-live.css?v=20260826-ads1",
  "./channels-live.css?v=20260827-channels-live1",
  "./search-console-live.css?v=20260827-search-live1",
  "./dashboard.js?v=20260825-media",
  "./summary-loader.js?v=20260827-livefix3",
  "./summary-final.js?v=20260827-livefix3",
  "./navigation.js?v=20260826-channels1",
  "./summary-channels.js?v=20260827-sitepartition1",
  "./ads-live.js?v=20260826-ads1",
  "./channels-live.js?v=20260827-sitepartition1",
  "./search-console-live.js?v=20260827-filterrefresh1",
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
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(req).then(res => {const copy=res.clone();caches.open(CACHE_NAME).then(cache => cache.put(req,copy));return res}).catch(() => caches.match(req).then(cached => cached || caches.match("./index.html"))));
});