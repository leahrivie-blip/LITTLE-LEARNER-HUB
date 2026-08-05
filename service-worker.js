const CACHE_NAME = "llh-shell-v179-js-split-r5";
const SHELL_VERSION = "20260804-js-split-r5";
const OFFLINE_URL = "/offline.html";
// Longer timeout so slow Render cold starts do not fall back to a stale HTML shell.
const NETWORK_TIMEOUT_MS = 8000;
// Keep precache minimal. Never precache index.html or app.js — those caused
// mismatched Admin/homepage shells after deploys (release blocker on testing).
const APP_SHELL = [
  "/offline.html",
  "/site.webmanifest",
  "/images/icons/icon-192.svg",
  "/images/icons/icon-512.svg",
  "/images/icons/icon-192.png",
  "/images/icons/icon-512.png",
  "/images/icons/badge-72.png",
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
  if (event.data && event.data.type === "CLEAR_ALL_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    );
  }
});

function isShellAssetRequest(requestUrl) {
  const path = requestUrl.pathname;
  return path.endsWith(".js")
    || path.endsWith(".css")
    || path.endsWith(".webmanifest")
    || path.endsWith(".svg")
    || path.endsWith(".png")
    || path.endsWith(".jpg")
    || path.endsWith(".jpeg")
    || path.endsWith(".webp")
    || path.endsWith(".woff2");
}

function isNavigationRequest(request, requestUrl) {
  if (request.mode === "navigate") return true;
  const path = requestUrl.pathname;
  return path === "/" || path.endsWith(".html") || path === "/admin" || path.startsWith("/admin/");
}

function networkWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

function isValidShellAssetResponse(requestUrl, response) {
  if (!response || response.status !== 200 || response.type !== "basic") return false;
  const assetPath = requestUrl.pathname;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (assetPath.endsWith(".css")) return contentType.includes("text/css");
  if (assetPath.endsWith(".js")) return contentType.includes("javascript") || contentType.includes("ecmascript");
  if (assetPath.endsWith(".webmanifest")) return contentType.includes("json");
  if (assetPath.endsWith(".html") || assetPath === "/") return contentType.includes("html");
  if (/\.(png|jpg|jpeg|webp|svg)$/.test(assetPath)) return contentType.startsWith("image/");
  return true;
}

function putInCache(request, response) {
  const url = new URL(request.url);
  // Never cache HTML navigations — always prefer live deploy HTML.
  if (isNavigationRequest(request, url)) return;
  // Never cache the giant app bundle or Teaching Kit / admin packs in SW.
  if (/\/app\.js(?:\?|$)/.test(url.pathname + url.search)) return;
  if (/teaching-kit|admin-workspace|admin-insights|comms-center/.test(url.pathname)) return;
  if (!isValidShellAssetResponse(url, response)) return;
  const cloned = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned)).catch(() => {});
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

  // Versioned shell assets: network-first so deploys never serve a stale CSS/JS shell
  // that mismatches fresh HTML (the root cause of unstyled first loads).
  if (isShellAssetRequest(requestUrl)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (isValidShellAssetResponse(requestUrl, response)) {
            putInCache(event.request, response);
          }
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  // HTML: network-only. Stale cached index.html was the Admin "only shows Admin" bug.
  if (isNavigationRequest(event.request, requestUrl)) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL)),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        putInCache(event.request, response);
        return response;
      });
    }),
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
