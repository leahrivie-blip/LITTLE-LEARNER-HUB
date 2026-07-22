/**
 * Phase 19 — performance helpers: lazy script load, pagination, request dedupe, org-scoped cache.
 */
(function initPlatformPerf(global) {
  const scriptPromises = new Map();
  const inflight = new Map();
  const cache = new Map();

  const EXPANSION_SCRIPTS = Object.freeze({
    "director-center": [
      "director-center-ui.js?v=20260722-phase8",
      "family-foundation-ui.js?v=20260722-phase8",
      "today-hub-ui.js?v=20260722-phase15",
      "provider-productivity-ui.js?v=20260722-phase21",
      "classroom-assistant-ui.js?v=20260722-classroom-assistant-v2",
      "staff-experience-ui.js?v=20260722-phase16",
      "billing-simulator-ui.js?v=20260722-phase17",
      "enrollment-ui.js?v=20260722-phase12-14-remediation",
      "records-center-ui.js?v=20260722-phase12-14-remediation",
      "licensing-center-ui.js?v=20260722-phase12-14-remediation",
    ],
    "forms-center": [
      "forms-center-ui.js?v=20260722-phase7",
      "ai-form-builder-ui.js?v=20260722-phase7",
      "forms-responses-ui.js?v=20260721-phase6",
    ],
    "family-hub": [
      "family-foundation-ui.js?v=20260722-phase8",
      "family-hub-ui.js?v=20260722-phase12-14-remediation",
      "family-updates-ui.js?v=20260722-phase10",
      "family-messaging-ui.js?v=20260722-phase11",
      "enrollment-ui.js?v=20260722-phase12-14-remediation",
      "records-center-ui.js?v=20260722-phase12-14-remediation",
      "licensing-center-ui.js?v=20260722-phase12-14-remediation",
    ],
    "testing-lab": [
      "testing-lab-ui.js?v=20260722-phase20",
    ],
  });

  function loadScript(src) {
    if (scriptPromises.has(src)) return scriptPromises.get(src);
    const existing = document.querySelector(`script[data-llh-perf-src="${src}"]`);
    if (existing) {
      const done = Promise.resolve();
      scriptPromises.set(src, done);
      return done;
    }
    const promise = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src.startsWith("/") || src.startsWith("http") ? src : `/${src.replace(/^\//, "")}`;
      // Prefer relative without leading slash for local static
      el.src = src;
      el.defer = true;
      el.dataset.llhPerfSrc = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(el);
    });
    scriptPromises.set(src, promise);
    return promise;
  }

  async function ensureViewScripts(viewName) {
    const list = EXPANSION_SCRIPTS[viewName] || [];
    for (const src of list) {
      await loadScript(src);
    }
    return true;
  }

  function paginate(items, { page = 1, pageSize = 25 } = {}) {
    const list = Array.isArray(items) ? items : [];
    const size = Math.min(100, Math.max(1, Number(pageSize) || 25));
    const pageNum = Math.max(1, Number(page) || 1);
    const start = (pageNum - 1) * size;
    return {
      items: list.slice(start, start + size),
      page: pageNum,
      pageSize: size,
      total: list.length,
      totalPages: Math.max(1, Math.ceil(list.length / size)),
      hasMore: start + size < list.length,
    };
  }

  function cacheKey({ organizationId, role, path, query }) {
    return [
      clean(organizationId),
      clean(role),
      clean(path),
      clean(query),
    ].join("|");
  }

  function clean(value) {
    return String(value ?? "").trim();
  }

  /**
   * Org/role-scoped GET cache. Never shares across organizations.
   */
  function cachedGet(keyParts, fetcher, { ttlMs = 15000 } = {}) {
    const key = cacheKey(keyParts);
    if (!keyParts.organizationId) {
      // Refuse unscoped cache to protect confidentiality boundaries
      return fetcher();
    }
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value);
    if (inflight.has(key)) return inflight.get(key);
    const pending = Promise.resolve()
      .then(fetcher)
      .then((value) => {
        cache.set(key, { at: Date.now(), value, organizationId: keyParts.organizationId });
        inflight.delete(key);
        return value;
      })
      .catch((error) => {
        inflight.delete(key);
        throw error;
      });
    inflight.set(key, pending);
    return pending;
  }

  function clearCacheForOrg(organizationId) {
    const org = clean(organizationId);
    for (const key of cache.keys()) {
      if (key.startsWith(`${org}|`)) cache.delete(key);
    }
  }

  function dedupe(key, fn) {
    if (inflight.has(key)) return inflight.get(key);
    const pending = Promise.resolve()
      .then(fn)
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
    return pending;
  }

  function measure(flow, fn) {
    const started = (global.performance && performance.now) ? performance.now() : Date.now();
    return Promise.resolve()
      .then(fn)
      .then((result) => {
        const ended = (global.performance && performance.now) ? performance.now() : Date.now();
        return {
          result,
          sample: {
            flow,
            durationMs: Math.round(ended - started),
            at: new Date().toISOString(),
          },
        };
      });
  }

  function lazyImageAttrs(src, { alt = "" } = {}) {
    return {
      src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "data-llh-src": src,
      loading: "lazy",
      decoding: "async",
      alt,
    };
  }

  function hydrateLazyImages(root = document) {
    const imgs = root.querySelectorAll("img[data-llh-src]");
    if (!("IntersectionObserver" in global)) {
      imgs.forEach((img) => {
        img.src = img.getAttribute("data-llh-src");
        img.removeAttribute("data-llh-src");
      });
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target;
        const real = img.getAttribute("data-llh-src");
        if (real) {
          img.src = real;
          img.removeAttribute("data-llh-src");
        }
        io.unobserve(img);
      }
    }, { rootMargin: "120px" });
    imgs.forEach((img) => io.observe(img));
  }

  global.LLHPlatformPerf = {
    EXPANSION_SCRIPTS,
    loadScript,
    ensureViewScripts,
    paginate,
    cachedGet,
    clearCacheForOrg,
    dedupe,
    measure,
    lazyImageAttrs,
    hydrateLazyImages,
    featureMarker: "phase19-platform-resilience",
  };
})(typeof window !== "undefined" ? window : globalThis);
