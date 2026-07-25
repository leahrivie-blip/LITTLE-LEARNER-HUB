/**
 * Testing-only browser error reporter.
 *
 * Posts sanitized events to /api/testing-health/client-error (server forwards
 * to Sentry when configured). Never sends tokens, bodies, names, or URLs with
 * secrets. No-op on production hosts and when intake is disabled.
 */
(function initTestingSentryClient(global) {
  if (global.__LLH_TESTING_SENTRY_CLIENT__) return;
  global.__LLH_TESTING_SENTRY_CLIENT__ = true;

  const state = {
    enabled: false,
    intake: "",
    installed: false,
    recentConsole: [],
    recentFailed: [],
    rateCount: 0,
    rateWindowStarted: 0,
  };

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

  function deviceBucket() {
    const width = global.innerWidth || 0;
    if (width && width < 600) return "phone";
    if (width && width < 1100) return "tablet";
    return "computer";
  }

  function currentPage() {
    try {
      return document.querySelector(".active-view")?.id?.replace("view-", "") || "unknown";
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
    if (state.rateCount >= 15) return false;
    state.rateCount += 1;
    return true;
  }

  function recordConsole(type, message) {
    state.recentConsole.unshift({
      type: clean(type, 40),
      message: sanitizeMessage(message),
      at: new Date().toISOString(),
    });
    if (state.recentConsole.length > 12) state.recentConsole.length = 12;
  }

  function recordFailedRequest(entry) {
    state.recentFailed.unshift(entry);
    if (state.recentFailed.length > 12) state.recentFailed.length = 12;
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
      errorType: clean(partial.errorType || "BrowserError", 80),
      message: sanitizeMessage(partial.message || ""),
      page: clean(partial.page || currentPage(), 120),
      role: clean(partial.role || currentRole(), 80),
      device: clean(partial.device || deviceBucket(), 40),
      fakeOrganizationId: fakeOrgId(),
      timingMs: Number.isFinite(partial.timingMs) ? Math.round(partial.timingMs) : null,
    };
    try {
      await fetch(state.intake, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch { /* never break the app for telemetry */ }
  }

  function installHooks() {
    if (state.installed) return;
    state.installed = true;
    global.addEventListener("error", (event) => {
      const message = event?.message || event?.error?.message || "window.error";
      recordConsole("error", message);
      send({ errorType: event?.error?.name || "WindowError", message });
    });
    global.addEventListener("unhandledrejection", (event) => {
      const reason = event?.reason;
      const message = reason?.message || String(reason || "unhandledrejection");
      recordConsole("unhandledrejection", message);
      send({ errorType: "UnhandledRejection", message });
    });
    const originalFetch = global.fetch;
    if (typeof originalFetch === "function") {
      global.fetch = async function llhInstrumentedFetch(input, init) {
        const started = Date.now();
        const url = typeof input === "string" ? input : input?.url || "";
        try {
          const response = await originalFetch.call(this, input, init);
          if (response && response.status >= 400) {
            recordFailedRequest({
              name: pathnameOnly(url),
              status: response.status,
              at: new Date().toISOString(),
              ms: Date.now() - started,
            });
          }
          return response;
        } catch (error) {
          recordFailedRequest({
            name: pathnameOnly(url),
            status: 0,
            at: new Date().toISOString(),
            ms: Date.now() - started,
          });
          throw error;
        }
      };
    }
  }

  async function refreshConfig() {
    if (isProductionHost()) {
      state.enabled = false;
      return;
    }
    try {
      const res = await fetch("/api/testing-health/sentry-config", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      state.enabled = Boolean(data?.enabled && data?.clientIntake);
      state.intake = state.enabled ? String(data.clientIntake) : "";
      if (state.enabled) installHooks();
    } catch {
      state.enabled = false;
    }
  }

  /** Snapshot for Testing Feedback bug reports — sanitized only. */
  function diagnosticSnapshot() {
    return {
      online: typeof navigator !== "undefined" ? Boolean(navigator.onLine) : true,
      recentFailedRequests: state.recentFailed.slice(0, 8).map((item) => ({
        name: clean(item.name, 180),
        status: Number(item.status) || 0,
        at: clean(item.at, 40),
      })),
      recentConsoleErrors: state.recentConsole.slice(0, 8).map((item) => ({
        type: clean(item.type, 40),
        message: sanitizeMessage(item.message),
        at: clean(item.at, 40),
      })),
    };
  }

  global.LLHTestingSentry = {
    refreshConfig,
    send,
    diagnosticSnapshot,
    recordConsole,
    recordFailedRequest,
  };

  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", () => { refreshConfig(); }, { once: true });
  } else {
    refreshConfig();
  }
}(typeof window !== "undefined" ? window : globalThis));
