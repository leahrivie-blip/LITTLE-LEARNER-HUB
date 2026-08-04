/**
 * Safe admin analytics diagnostics (Phase 8).
 * No tokens, passwords, payment data, or full customer records.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHAdminAnalyticsDiagnostics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function text(value, max = 220) {
    return String(value == null ? "" : value).trim().slice(0, max);
  }

  function safeMessage(value, max = 220) {
    return text(value, max * 2)
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
      .replace(/\b(password|token|secret|authorization)\s*[:=]\s*\S+/gi, "$1=[redacted]")
      .slice(0, max);
  }

  function createCorrelationId() {
    return `aan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function classifyFailure({
    httpStatus = 0,
    code = "",
    message = "",
    aborted = false,
    offline = false,
    invalidJson = false,
    timeoutSeconds = 25,
  } = {}) {
    if (aborted) {
      return {
        safeErrorCode: "timeout",
        retryable: true,
        safeErrorMessage: `Analytics timed out after ${timeoutSeconds}s. Tap Retry.`,
      };
    }
    if (offline || /failed to fetch|networkerror|load failed|offline/i.test(message)) {
      return {
        safeErrorCode: "network_offline",
        retryable: true,
        safeErrorMessage: "Network unavailable. Check connection and tap Retry.",
      };
    }
    if (invalidJson) {
      return {
        safeErrorCode: "invalid_json",
        retryable: true,
        safeErrorMessage: `Admin analytics returned HTTP ${httpStatus || "?"} with non-JSON body (often a crash/OOM). Tap Retry.`,
      };
    }
    const status = Number(httpStatus) || 0;
    if (status === 401) {
      return {
        safeErrorCode: text(code, 60) || "unauthorized",
        retryable: false,
        safeErrorMessage: safeMessage(message) || "Admin session expired. Unlock Admin again.",
      };
    }
    if (status === 403) {
      return {
        safeErrorCode: text(code, 60) || "forbidden",
        retryable: false,
        safeErrorMessage: safeMessage(message) || "Admin analytics access denied.",
      };
    }
    if (status === 404) {
      return {
        safeErrorCode: text(code, 60) || "not_found",
        retryable: true,
        safeErrorMessage: safeMessage(message) || "Analytics endpoint not found. Tap Retry after deploy settles.",
      };
    }
    if (status === 429) {
      return {
        safeErrorCode: text(code, 60) || "rate_limited",
        retryable: true,
        safeErrorMessage: safeMessage(message) || "Too many analytics requests. Wait a moment and tap Retry.",
      };
    }
    if (status >= 500) {
      return {
        safeErrorCode: text(code, 60) || "server_error",
        retryable: true,
        safeErrorMessage: safeMessage(message) || `Server error HTTP ${status}. Tap Retry.`,
      };
    }
    return {
      safeErrorCode: text(code, 60) || "client_error",
      retryable: status === 0 || status >= 500,
      safeErrorMessage: safeMessage(message) || "Could not load admin analytics.",
    };
  }

  function buildDiagnostic(partial = {}) {
    const classified = classifyFailure({
      ...partial,
      timeoutSeconds: partial.timeoutSeconds || 25,
    });
    return {
      endpoint: text(partial.endpoint || "/api/admin/analytics", 160),
      httpStatus: Number(partial.httpStatus) || 0,
      safeErrorCode: classified.safeErrorCode,
      safeErrorMessage: classified.safeErrorMessage,
      requestCorrelationId: text(partial.requestCorrelationId || "", 80),
      timestamp: text(partial.timestamp || new Date().toISOString(), 40),
      adminSection: text(partial.adminSection || "insights", 40),
      retryability: classified.retryable ? "retryable" : "not_retryable",
    };
  }

  function formatLogLine(kind, diagnostic) {
    return `[admin-analytics:client] ${text(kind, 40)} ${JSON.stringify(buildDiagnostic(diagnostic))}`;
  }

  return {
    createCorrelationId,
    safeMessage,
    classifyFailure,
    buildDiagnostic,
    formatLogLine,
  };
});
