/**
 * Testing-only Sentry foundation (server).
 *
 * Enabled only when:
 *   - SENTRY_DSN_TESTING is set
 *   - SITE_URL / request host is NOT live production
 *   - SENTRY_TESTING_ENABLED is not explicitly "false"
 *
 * Never enables session replay, screenshots, or PII. If Sentry is not
 * configured, every helper is a no-op and the site works normally.
 */
"use strict";

const https = require("node:https");
const http = require("node:http");
const { URL } = require("node:url");
const {
  buildSafeEvent,
  rateLimitGate,
  sanitizePathname,
  sanitizeQuery,
  cleanText,
} = require("../scripts/testing-sentry-sanitize.js");

function createTestingSentry({
  getGitSha = () => "",
  isLiveProduction = () => false,
  env = process.env,
} = {}) {
  const recentErrors = [];
  const rateState = { windowStartedAt: 0, count: 0 };
  const MAX_RECENT = 40;

  function configured() {
    if (String(env.SENTRY_TESTING_ENABLED || "true").toLowerCase() === "false") return false;
    if (isLiveProduction()) return false;
    return Boolean(String(env.SENTRY_DSN_TESTING || "").trim());
  }

  function parseDsn(dsn) {
    try {
      const url = new URL(dsn);
      const publicKey = url.username;
      const projectId = url.pathname.replace(/^\//, "");
      if (!publicKey || !projectId) return null;
      return {
        publicKey,
        projectId,
        host: url.host,
        protocol: url.protocol === "http:" ? "http:" : "https:",
      };
    } catch {
      return null;
    }
  }

  function pushRecent(event) {
    recentErrors.unshift(event);
    if (recentErrors.length > MAX_RECENT) recentErrors.length = MAX_RECENT;
  }

  function listRecentErrors() {
    return recentErrors.slice(0, 20);
  }

  function sentryStoreUrl(parsed) {
    return `${parsed.protocol}//${parsed.host}/api/${parsed.projectId}/store/`;
  }

  function postToSentry(safeEvent) {
    const dsn = String(env.SENTRY_DSN_TESTING || "").trim();
    const parsed = parseDsn(dsn);
    if (!parsed) return Promise.resolve({ ok: false, reason: "invalid_dsn" });
    const payload = JSON.stringify({
      message: safeEvent.message || safeEvent.errorType,
      level: "error",
      platform: "node",
      environment: "testing",
      release: safeEvent.deployedCommit || undefined,
      tags: {
        page: safeEvent.page || "unknown",
        role_category: safeEvent.roleCategory || "unknown",
        device: safeEvent.device || "unknown",
        source: safeEvent.source || "server",
        testing_only: "true",
      },
      extra: {
        fakeOrganizationId: safeEvent.fakeOrganizationId || "",
        timingMs: safeEvent.timingMs,
        errorType: safeEvent.errorType,
      },
      timestamp: Math.floor(Date.now() / 1000),
    });
    const auth = `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=llh-testing-sentry/1.0`;
    return new Promise((resolve) => {
      try {
        const url = new URL(sentryStoreUrl(parsed));
        const transport = url.protocol === "http:" ? http : https;
        const req = transport.request(
          {
            hostname: url.hostname,
            port: url.port || (url.protocol === "http:" ? 80 : 443),
            path: url.pathname,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
              "X-Sentry-Auth": auth,
            },
            timeout: 4000,
          },
          (res) => {
            res.resume();
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode });
          },
        );
        req.on("error", () => resolve({ ok: false, reason: "network" }));
        req.on("timeout", () => {
          try { req.destroy(); } catch { /* */ }
          resolve({ ok: false, reason: "timeout" });
        });
        req.write(payload);
        req.end();
      } catch {
        resolve({ ok: false, reason: "exception" });
      }
    });
  }

  async function captureSafeEvent(partial = {}) {
    if (!configured()) {
      // Still keep a tiny in-memory ring for Admin Health when DSN is absent.
      const localOnly = buildSafeEvent({ ...partial, deployedCommit: partial.deployedCommit || getGitSha() });
      pushRecent(localOnly);
      return { ok: true, sent: false, event: localOnly };
    }
    if (!rateLimitGate(rateState, { windowMs: 60_000, maxPerWindow: 20 })) {
      return { ok: false, reason: "rate_limited" };
    }
    const event = buildSafeEvent({
      ...partial,
      deployedCommit: partial.deployedCommit || getGitSha(),
    });
    pushRecent(event);
    const result = await postToSentry(event);
    return { ok: true, sent: Boolean(result.ok), event, transport: result };
  }

  function expressErrorMiddleware() {
    return function testingSentryErrorMiddleware(error, request, response, next) {
      try {
        captureSafeEvent({
          errorType: error?.name || "ExpressError",
          message: error?.message || "Unhandled Express error",
          page: sanitizePathname(request?.url || ""),
          role: "",
          device: "server",
          source: "server",
        }).catch(() => {});
      } catch { /* never break the response path */ }
      if (typeof next === "function") next(error);
    };
  }

  function installProcessHandlers() {
    if (!configured()) return;
    process.on("unhandledRejection", (reason) => {
      captureSafeEvent({
        errorType: "UnhandledRejection",
        message: reason?.message || String(reason || "rejection"),
        page: "process",
        device: "server",
        source: "server",
      }).catch(() => {});
    });
  }

  function publicConfig() {
    return {
      enabled: configured(),
      // Never expose the DSN to the browser — browser errors POST to our
      // sanitized intake endpoint instead.
      clientIntake: configured() ? "/api/testing-health/client-error" : "",
      note: configured()
        ? "Testing Sentry is active (sanitized events only)."
        : "Testing Sentry is not configured — the site works normally without it.",
    };
  }

  function sanitizeClientPayload(body = {}) {
    return buildSafeEvent({
      errorType: body.errorType || "BrowserError",
      message: body.message || "",
      deployedCommit: getGitSha(),
      page: body.page || "",
      role: body.role || "",
      device: body.device || "",
      fakeOrganizationId: body.fakeOrganizationId || "",
      timingMs: body.timingMs,
      source: "browser",
    });
  }

  return {
    configured,
    captureSafeEvent,
    expressErrorMiddleware,
    installProcessHandlers,
    publicConfig,
    listRecentErrors,
    sanitizeClientPayload,
    sanitizePathname,
    sanitizeQuery,
    cleanText,
  };
}

module.exports = { createTestingSentry };
