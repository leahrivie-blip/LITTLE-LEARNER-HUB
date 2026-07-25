/**
 * Testing-only automated bug detector (browser).
 *
 * Collects sanitized technical failures and POSTs to /api/auto-bugs/ingest.
 * Never sends passwords, tokens, childcare content, medical data, payment
 * data, messages, or form answers.
 */
(function initAutoBugClient(global) {
  if (global.__LLH_AUTO_BUG_CLIENT__) return;
  global.__LLH_AUTO_BUG_CLIENT__ = true;

  const state = {
    enabled: false,
    intake: "",
    installed: false,
    recentPaths: [],
    rateCount: 0,
    rateWindowStarted: 0,
    bootWatchStarted: false,
  };

  const PERF_THRESHOLD_MS = 8000;
  const DUPLICATE_WINDOW_MS = 4000;
  const DUPLICATE_COUNT = 4;

  function isProductionHost() {
    try {
      const host = String(global.location?.hostname || "").toLowerCase();
      if (!host || host === "localhost" || host === "127.0.0.1") return false;
      return host === "littlelearnershubbyleah.com" || host.endsWith(".littlelearnershubbyleah.com");
    } catch {
      return true;
    }
  }

  function clean(value, max) {
    return String(value ?? "").trim().slice(0, max);
  }

  function sanitizeMessage(message) {
    return clean(message, 240)
      .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
      .replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
      .replace(/[?&](token|adminToken|access_token|password|code)=[^&\s]*/gi, "[$1=redacted]");
  }

  function sanitizeStack(stack) {
    return String(stack || "")
      .split("\n")
      .map((line) => sanitizeMessage(line)
        .replace(/file:\/\/\/[^\s)]+/gi, "[file]")
        .replace(/\/(?:Users|home)\/[^\s:)]+/gi, "[path]")
        .replace(/\?[^:\s)]+/g, ""))
      .filter(Boolean)
      .slice(0, 12)
      .join("\n")
      .slice(0, 2400);
  }

  function deviceBucket() {
    const width = global.innerWidth || 0;
    if (width && width < 600) return "phone";
    if (width && width < 1100) return "tablet";
    return "computer";
  }

  function currentPage() {
    try {
      return document.querySelector(".active-view")?.id?.replace("view-", "")
        || clean((global.location?.hash || "").replace(/^#/, ""), 80)
        || "unknown";
    } catch {
      return "unknown";
    }
  }

  function currentRole() {
    try {
      if (typeof testingFeedbackCurrentRole === "function") return testingFeedbackCurrentRole();
    } catch { /* */ }
    return "";
  }

  function fakeOrgId() {
    try {
      const account = typeof currentAccount === "function" ? currentAccount() : null;
      const id = account?.organizationId || account?.orgId || "";
      if (/fake|example\.invalid|org_/i.test(String(id))) return clean(id, 160);
    } catch { /* */ }
    return "";
  }

  function allowRate() {
    const now = Date.now();
    if (now - state.rateWindowStarted > 60_000) {
      state.rateWindowStarted = now;
      state.rateCount = 0;
    }
    if (state.rateCount >= 20) return false;
    state.rateCount += 1;
    return true;
  }

  function pathnameOnly(url) {
    try {
      const u = new URL(url, global.location?.origin || "http://local.invalid");
      return clean(u.pathname, 180);
    } catch {
      return "[invalid-url]";
    }
  }

  async function send(partial) {
    if (!state.enabled || !state.intake || isProductionHost()) return;
    if (!allowRate()) return;
    const payload = {
      errorType: clean(partial.errorType || "other", 80),
      message: sanitizeMessage(partial.message || ""),
      page: clean(partial.page || currentPage(), 120),
      role: clean(partial.role || currentRole(), 80),
      deviceBrowser: clean(partial.device || deviceBucket(), 40),
      fakeOrganizationId: fakeOrgId(),
      timingMs: Number.isFinite(partial.timingMs) ? Math.round(partial.timingMs) : null,
      sanitizedStack: sanitizeStack(partial.stack || ""),
      source: "browser",
      testingEnvironment: /localhost|127\.0\.0\.1/.test(String(global.location?.hostname || "")) ? "local" : "testing",
      host: clean(global.location?.hostname, 120),
    };
    try {
      await fetch(state.intake, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch { /* never break the app for telemetry */ }
    try {
      if (global.LLHTestingSentry?.recordConsole) {
        global.LLHTestingSentry.recordConsole(partial.errorType || "error", payload.message);
      }
    } catch { /* */ }
  }

  function noteRequest(path, status, ms) {
    const now = Date.now();
    state.recentPaths.unshift({ path, status, ms, at: now });
    if (state.recentPaths.length > 40) state.recentPaths.length = 40;
    const dupes = state.recentPaths.filter((row) => row.path === path && now - row.at < DUPLICATE_WINDOW_MS);
    if (dupes.length >= DUPLICATE_COUNT) {
      send({
        errorType: "duplicate_request",
        message: `Repeated duplicate request to ${path} (${dupes.length}x in ${DUPLICATE_WINDOW_MS}ms)`,
        page: currentPage(),
      });
    }
  }

  function installHooks() {
    if (state.installed) return;
    state.installed = true;

    global.addEventListener("error", (event) => {
      send({
        errorType: "browser_exception",
        message: event?.message || event?.error?.message || "window.error",
        stack: event?.error?.stack || "",
      });
    });
    global.addEventListener("unhandledrejection", (event) => {
      const reason = event?.reason;
      send({
        errorType: "browser_exception",
        message: reason?.message || String(reason || "unhandledrejection"),
        stack: reason?.stack || "",
      });
    });

    const originalFetch = global.fetch;
    if (typeof originalFetch === "function") {
      global.fetch = async function llhAutoBugFetch(input, init) {
        const started = Date.now();
        const url = typeof input === "string" ? input : input?.url || "";
        const path = pathnameOnly(url);
        try {
          const response = await originalFetch.call(this, input, init);
          const ms = Date.now() - started;
          if (path.startsWith("/api/")) noteRequest(path, response.status, ms);
          if (response && response.status >= 500) {
            send({
              errorType: "failed_api",
              message: `API ${response.status} for ${path}`,
              timingMs: ms,
            });
          } else if (response && response.status === 403 && /permission|forbidden|role|admin|testing-lab|director/i.test(path)) {
            send({
              errorType: "permission_role_mismatch",
              message: `Permission denial (403) for ${path} while role category may expect access`,
              timingMs: ms,
            });
          }
          if (ms >= PERF_THRESHOLD_MS && path.startsWith("/api/")) {
            send({
              errorType: "performance_threshold",
              message: `API slower than ${PERF_THRESHOLD_MS}ms: ${path}`,
              timingMs: ms,
            });
          }
          return response;
        } catch (error) {
          const ms = Date.now() - started;
          if (path.startsWith("/api/")) {
            noteRequest(path, 0, ms);
            send({
              errorType: "failed_api",
              message: `Network failure for ${path}`,
              timingMs: ms,
              stack: error?.stack || "",
            });
          }
          throw error;
        }
      };
    }

    const originalConsoleError = console.error;
    console.error = function llhAutoBugConsoleError(...args) {
      try {
        const message = args.map((arg) => {
          if (arg == null) return "";
          if (typeof arg === "string") return arg;
          if (arg && arg.message) return arg.message;
          return "";
        }).filter(Boolean).join(" ").slice(0, 240);
        if (message && !/favicon|ResizeObserver|Download the React DevTools/i.test(message)) {
          send({ errorType: "console_error", message, stack: args.find((a) => a && a.stack)?.stack || "" });
        }
        if (/offline|sync failed|failedSaves|flush/i.test(message)) {
          send({ errorType: "offline_sync_failure", message });
        }
        if (/database|postgres|ECONNREFUSED|store (read|write) failed/i.test(message)) {
          send({ errorType: "database_failure", message });
        }
      } catch { /* */ }
      return originalConsoleError.apply(this, args);
    };
  }

  function watchBootTimeout() {
    if (state.bootWatchStarted) return;
    state.bootWatchStarted = true;
    const started = Date.now();
    const timer = global.setInterval(() => {
      try {
        if (document.getElementById("bootFailedRetryOverlay")) {
          send({
            errorType: "app_boot_timeout",
            message: "App boot failed/timeout retry screen shown",
            timingMs: Date.now() - started,
          });
          global.clearInterval(timer);
          return;
        }
        if (Date.now() - started > 45000) global.clearInterval(timer);
      } catch {
        global.clearInterval(timer);
      }
    }, 1500);
  }

  function reportBrokenRoute(viewId) {
    send({
      errorType: "broken_route",
      message: `Broken or missing route/view: ${clean(viewId, 80)}`,
      page: clean(viewId, 120) || currentPage(),
    });
  }

  function reportOfflineSyncFailure(message) {
    send({
      errorType: "offline_sync_failure",
      message: sanitizeMessage(message || "Offline sync failure"),
    });
  }

  async function refreshConfig() {
    if (isProductionHost()) {
      state.enabled = false;
      return;
    }
    try {
      const res = await fetch("/api/auto-bugs/client-config", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      state.enabled = Boolean(data?.enabled && data?.intake);
      state.intake = state.enabled ? String(data.intake) : "";
      if (state.enabled) {
        installHooks();
        watchBootTimeout();
      }
    } catch {
      state.enabled = false;
    }
  }

  global.LLHAutoBug = {
    refreshConfig,
    send,
    reportBrokenRoute,
    reportOfflineSyncFailure,
  };

  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", () => { refreshConfig(); }, { once: true });
  } else {
    refreshConfig();
  }
}(typeof window !== "undefined" ? window : globalThis));
