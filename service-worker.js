const CACHE_NAME = "llh-shell-v42-import-v4";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css?v=20260715-import-v4",
  "/styles/llh-design-tokens.css?v=20260713-ds",
  "/styles/llh-homepage.css?v=20260715-tablet2",
  "/styles/llh-library-browse.css?v=20260715-signup-fix",
  "/scripts/curriculum-safe-values.js?v=20260712-v3-render-fix",
  "/scripts/curriculum-lesson-import-parser.js?v=20260715-import-v4",
  "/scripts/curriculum-lesson-import-v4.js?v=20260715-import-v4",
  "/scripts/curriculum-import-preview.js?v=20260715-import-v4",
  "/scripts/curriculum-lesson-viewer-render.js?v=20260715-preview-cta-fix",
  "/scripts/llh-schedule.js?v=20260714-prod-priority-fixes",
  "/scripts/llh-lesson-docx.js?v=20260714-lesson-docx",
  "/app.js?v=20260715-import-v4",
  "/site.webmanifest",
  "/images/icons/icon-192.svg",
  "/images/icons/icon-512.svg",
  "/images/leah-founder.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((error) => {
        // Never block SW install if one shell asset fails — still activate so
        // clients can escape a stuck stale cache from older versions.
        console.warn("[llh-sw] shell precache incomplete", error);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isNetworkFirstRequest(request, requestUrl) {
  if (request.mode === "navigate") return true;
  const path = requestUrl.pathname;
  if (path === "/" || path.endsWith(".html")) return true;
  if (path.endsWith(".js") || path.endsWith(".css") || path.endsWith(".webmanifest")) return true;
  if (path.startsWith("/api/")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // Always prefer network for HTML/JS/CSS/API so deploys and Admin data are not stuck
  // behind a stale shell. Fall back to cache only when offline.
  if (isNetworkFirstRequest(event.request, requestUrl)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/index.html")))
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
