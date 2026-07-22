/**
 * Phase 19 — reliability helpers: save states, drafts, offline, retry, unsaved guard.
 * Drafts are scoped and never restored across user/org/child/classroom/record.
 */
(function initPlatformResilience(global) {
  const SAVE_STATES = Object.freeze(["idle", "saving", "saved", "unsaved", "retrying", "failed"]);
  const SECRET_RE = /(password|passwd|token|secret|signature|ssn|medical|diagnosis|allerg|privateNote|messageBody|api[_-]?key|authorization|bearer)/i;

  function clean(value, max = 500) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function buildDraftScopeKey(scope = {}) {
    return [
      "llh-draft",
      clean(scope.surface, 40) || "unknown",
      clean(scope.organizationId, 80) || "no-org",
      clean(scope.userId, 80) || "no-user",
      clean(scope.childId, 80) || "no-child",
      clean(scope.classroomId, 80) || "no-classroom",
      clean(scope.recordId, 80) || "no-record",
    ].join("::");
  }

  function scopesMatch(a = {}, b = {}) {
    return ["surface", "organizationId", "userId", "childId", "classroomId", "recordId"]
      .every((key) => clean(a[key], 80) === clean(b[key], 80));
  }

  function sanitizePayload(payload) {
    if (!payload || typeof payload !== "object") return {};
    const out = Array.isArray(payload) ? [] : {};
    for (const [key, value] of Object.entries(payload)) {
      if (SECRET_RE.test(key)) continue;
      out[key] = value;
    }
    return out;
  }

  function sanitizeError(error, extras = {}) {
    return {
      at: new Date().toISOString(),
      code: clean(error?.code || error?.name || "error", 80),
      message: clean(error?.message || "Something went wrong.", 240),
      surface: clean(extras.surface, 60),
      organizationId: clean(extras.organizationId, 80),
      networkState: extras.networkState || detectNetworkState(),
      testingOnly: true,
      noSecrets: true,
    };
  }

  function detectNetworkState() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
    return "online";
  }

  function createSaveController({ statusEl, onStateChange } = {}) {
    let state = "idle";
    let inFlight = false;
    let dirty = false;

    function setState(next) {
      if (!SAVE_STATES.includes(next)) return;
      state = next;
      if (statusEl) {
        const labels = {
          idle: "",
          saving: "Saving…",
          saved: "Saved",
          unsaved: "Unsaved changes",
          retrying: "Retrying…",
          failed: "Save failed — try again",
        };
        statusEl.textContent = labels[next] || "";
        statusEl.setAttribute("data-save-state", next);
        statusEl.setAttribute("role", "status");
        statusEl.setAttribute("aria-live", "polite");
      }
      if (typeof onStateChange === "function") onStateChange(next);
      if (global.LLHPlatformA11y && (next === "saved" || next === "failed")) {
        global.LLHPlatformA11y.announce(statusEl?.textContent || next, { assertive: next === "failed" });
      }
    }

    function markDirty() {
      dirty = true;
      if (state !== "saving" && state !== "retrying") setState("unsaved");
    }

    async function run(saveFn, { retry = true } = {}) {
      if (inFlight) return { ok: false, code: "double_submit_blocked", state };
      inFlight = true;
      setState(state === "failed" && retry ? "retrying" : "saving");
      try {
        if (detectNetworkState() === "offline") {
          throw Object.assign(new Error("You appear to be offline. Changes were not saved."), { code: "offline" });
        }
        const result = await saveFn();
        dirty = false;
        setState("saved");
        return { ok: true, result, state };
      } catch (error) {
        setState("failed");
        const sanitized = sanitizeError(error);
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[LLH save]", sanitized.code, sanitized.message);
        }
        return { ok: false, error: sanitized, state };
      } finally {
        inFlight = false;
      }
    }

    function isDirty() {
      return dirty;
    }

    return { setState, markDirty, run, isDirty, getState: () => state };
  }

  const draftStore = {
    save(scope, payload) {
      const key = buildDraftScopeKey(scope);
      const record = {
        scopeKey: key,
        scope: { ...scope },
        payload: sanitizePayload(payload),
        updatedAt: new Date().toISOString(),
        testingOnly: true,
      };
      try {
        global.localStorage?.setItem(key, JSON.stringify(record));
      } catch { /* quota */ }
      return record;
    },
    load(scope) {
      const key = buildDraftScopeKey(scope);
      try {
        const raw = global.localStorage?.getItem(key);
        if (!raw) return null;
        const record = JSON.parse(raw);
        if (!scopesMatch(record.scope || {}, scope)) return null;
        return record;
      } catch {
        return null;
      }
    },
    clear(scope) {
      const key = buildDraftScopeKey(scope);
      try { global.localStorage?.removeItem(key); } catch { /* ignore */ }
    },
  };

  let unsavedGuardAttached = false;
  const dirtyControllers = new Set();

  function registerUnsavedGuard(controller) {
    dirtyControllers.add(controller);
    if (unsavedGuardAttached) return;
    unsavedGuardAttached = true;
    global.addEventListener("beforeunload", (event) => {
      for (const c of dirtyControllers) {
        if (c && c.isDirty && c.isDirty()) {
          event.preventDefault();
          event.returnValue = "";
          return;
        }
      }
    });
  }

  async function withRetry(fn, { attempts = 2, delayMs = 400 } = {}) {
    let lastError = null;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await fn(i);
      } catch (error) {
        lastError = error;
        if (i < attempts - 1) {
          await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
        }
      }
    }
    throw lastError;
  }

  function networkBannerHtml(state) {
    const messages = {
      offline: "You are offline. Changes will not save until you reconnect.",
      slow: "Network seems slow. Please wait — do not submit twice.",
      timeout: "The request timed out. Nothing was saved. Try again.",
      server_error: "The server had a problem. Nothing was saved. Try again.",
    };
    const msg = messages[state];
    if (!msg) return "";
    return `<div class="llh-network-banner" role="alert" data-network-state="${state}">${msg} <button type="button" class="ghost-button" data-llh-try-again>Try Again</button></div>`;
  }

  global.LLHPlatformResilience = {
    SAVE_STATES,
    buildDraftScopeKey,
    scopesMatch,
    sanitizePayload,
    sanitizeError,
    detectNetworkState,
    createSaveController,
    draftStore,
    registerUnsavedGuard,
    withRetry,
    networkBannerHtml,
    featureMarker: "phase19-platform-resilience",
  };
})(typeof window !== "undefined" ? window : globalThis);
