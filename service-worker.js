const CACHE_NAME = "llh-shell-v15-calendar-week-hub";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css?v=20260714-calendar-week-hub",
  "/styles/llh-design-tokens.css?v=20260713-ds",
  "/scripts/llh-schedule.js?v=20260714-calendar-day-notes",
  "/app.js?v=20260714-calendar-week-hub",
  "/site.webmanifest",
  "/images/icons/icon-192.svg",
  "/images/icons/icon-512.svg",
  "/images/leah-founder.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") return response;
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        return response;
      });
    })
  );
});
