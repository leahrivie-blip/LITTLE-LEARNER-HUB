const CACHE_NAME = "llh-shell-v88-email-system-repair";
const OFFLINE_URL = "/offline.html";
const APP_SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/styles.css?v=20260718-email-system-repair",
  "/styles/llh-design-tokens.css?v=20260713-ds",
  "/styles/llh-homepage.css?v=20260716-hero-mock-fix",
  "/styles/llh-library-browse.css?v=20260717-netflix-cover-cards",
  "/styles/llh-messaging.css?v=20260717-admin-notif-pwa",
  "/scripts/curriculum-safe-values.js?v=20260712-v3-render-fix",
  "/scripts/lesson-plan-cover-catalog.js?v=20260717-netflix-cover-cards",
  "/scripts/lesson-plan-covers.js?v=20260717-netflix-cover-cards",
  "/scripts/curriculum-standards.js?v=20260716-curriculum-standards",
  "/scripts/curriculum-import-enrich.js?v=20260716-curriculum-standards",
  "/scripts/curriculum-lesson-import-parser.js?v=20260716-curriculum-standards",
  "/scripts/curriculum-lesson-import-v4.js?v=20260716-curriculum-standards",
  "/scripts/curriculum-import-preview.js?v=20260716-curriculum-standards",
  "/scripts/llh-copyright.js?v=20260717-more-menu",
  "/scripts/curriculum-lesson-viewer-render.js?v=20260717-more-menu",
  "/scripts/llh-schedule.js?v=20260714-prod-priority-fixes",
  "/scripts/llh-lesson-docx.js?v=20260714-lesson-docx",
  "/scripts/lesson-plan-weekly-export.js?v=20260717-more-menu",
  "/scripts/llh-teacher-weekly-planner.js?v=20260717-more-menu",
  "/scripts/free-curriculum-sample.js?v=20260718-email-system-repair",
  "/scripts/free-plan-grandfathering.js?v=20260718-email-system-repair",
  "/app.js?v=20260718-email-system-repair",
  "/comms-center.js?v=20260718-email-system-repair",
  "/site.webmanifest",
  "/images/icons/icon-192.svg",
  "/images/icons/icon-512.svg",
  "/images/icons/icon-192.png",
  "/images/icons/icon-512.png",
  "/images/icons/badge-72.png",
  "/images/leah-founder.jpg",
  "/images/lesson-covers/default.svg",
  "/images/lesson-covers/generic-infant.svg",
  "/images/lesson-covers/generic-toddler.svg",
  "/images/lesson-covers/generic-preschool.svg",
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
  return false;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // Never cache /api/ — messages, notifications, and admin data must always be live.
  // A stale cached inbox/conversation is worse than a brief offline error.
  if (requestUrl.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({ error: "offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })),
    );
    return;
  }

  // Always prefer network for HTML/JS/CSS so deploys are not stuck behind a stale shell.
  // Fall back to cache only when offline.
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
        .catch(() => caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === "navigate") {
            // Offline-safe fallback: previously-visited shell first, then a
            // minimal offline page so navigation never hard-fails.
            return caches.match("/index.html").then((shell) => shell || caches.match(OFFLINE_URL));
          }
          return undefined;
        }))
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

// ─── Web Push ───────────────────────────────────────────────────────────────
// Push payloads are always short, generic copy (see server/messaging-lib.js
// pushCopyForNotification) — never private message bodies. Tapping the
// notification opens (or focuses) the app on the correct conversation/view.
self.addEventListener("push", (event) => {
  let payload = { title: "Little Learner Hub", body: "You have a new notification.", data: {} };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text() || payload.body;
  }
  const options = {
    body: payload.body,
    icon: payload.icon || "/images/icons/icon-192.png",
    badge: payload.badge || "/images/icons/badge-72.png",
    data: payload.data || {},
    tag: payload.data?.type || "llh-notification",
  };
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/?view=messages";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const targetPath = new URL(targetUrl, self.location.origin).pathname + new URL(targetUrl, self.location.origin).search;
      const existing = clients.find((c) => {
        const clientUrl = new URL(c.url);
        return clientUrl.origin === self.location.origin;
      });
      if (existing) {
        return existing.navigate(targetUrl).then(() => existing.focus()).catch(() => existing.focus());
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
