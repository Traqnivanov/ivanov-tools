const CACHE_NAME = "ivanov-analytics-v73-stage5at";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20260818-5",
  "./summary-final.css?v=20260826-final",
  "./navigation.css?v=20260829-stage5ac",
  "./summary-channels.css?v=20260826-channels2",
  "./ads-live.css?v=20260826-ads1",
  "./channels-live.css?v=20260827-channels-live1",
  "./search-console-live.css?v=20260827-search-live1",
  "./periods.js?v=20260829-stage5p",
  "./dashboard.js?v=20260827-stage1e",
  "./dashboard-loader.js?v=20260829-stage5at",
  "./event-source.js?v=20260829-stage5m",
  "./source-health.js?v=20260829-stage5r",
  "./summary-loader.js?v=20260829-stage5aj",
  "./summary-final.js?v=20260827-livefix3",
  "./navigation.js?v=20260827-stage1d",
  "./summary-channels.js?v=20260829-stage5al",
  "./summary-storage.js?v=20260829-stage5ar",
  "./ads-live.js?v=20260829-stage5y",
  "./channel-config.js?v=20260827-stage1f",
  "./channel-api.js?v=20260829-stage5e",
  "./channels-live.js?v=20260829-stage5e",
  "./business-live.js?v=20260829-stage5ai",
  "./search-console-live.js?v=20260829-stage5ag",
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

  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) {
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(req, copy)));
      }
      return res;
    } catch (error) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === "navigate" || req.destination === "document") {
        const shell = await caches.match("./index.html");
        if (shell) return shell;
      }
      throw error;
    }
  })());
});
