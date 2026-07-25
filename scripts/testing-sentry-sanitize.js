/**
 * Shared sanitization for testing-only Sentry / diagnostic reporting.
 *
 * NEVER include: passwords, tokens, cookies, headers, API keys, URLs with
 * tokens, session replay, screenshots, child/family/staff names, message /
 * form / medical / billing content, or raw request bodies.
 */
"use strict";

const SENSITIVE_QUERY_KEYS = /^(token|access_token|refresh_token|adminToken|authorization|password|passwd|secret|api[_-]?key|session|cookie|code|otp)$/i;
const SENSITIVE_PATH = /(token|password|secret|key|session)=/i;

function cleanText(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function sanitizePathname(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ""), "http://local.invalid");
    const path = url.pathname || "/";
    // Drop query + hash entirely — tokens often live there.
    if (SENSITIVE_PATH.test(path)) return "[redacted-path]";
    return cleanText(path, 180);
  } catch {
    return "[invalid-url]";
  }
}

function sanitizeQuery(rawSearch) {
  try {
    const params = new URLSearchParams(String(rawSearch || "").replace(/^\?/, ""));
    const out = [];
    for (const [key] of params.entries()) {
      if (SENSITIVE_QUERY_KEYS.test(key)) out.push(`${key}=[redacted]`);
      else out.push(`${key}=[omitted]`);
    }
    return out.slice(0, 12).join("&");
  } catch {
    return "";
  }
}

function roleCategory(role) {
  const value = cleanText(role, 80).toLowerCase();
  if (!value) return "unknown";
  if (/admin|platform/.test(value)) return "admin";
  if (/parent|guardian|family/.test(value)) return "parent";
  if (/staff|teacher|assistant|director/.test(value)) return "staff";
  if (/owner|provider|home.?daycare/.test(value)) return "provider";
  if (/tester|fake/.test(value)) return "tester";
  return "other";
}

function deviceBucket(userAgent = "", width = 0) {
  const ua = String(userAgent || "").toLowerCase();
  if (/ipad|tablet/.test(ua) || (width >= 600 && width < 1100)) return "tablet";
  if (/mobi|iphone|android/.test(ua) || (width > 0 && width < 600)) return "phone";
  return "computer";
}

function sanitizeErrorMessage(message) {
  let text = cleanText(message, 240);
  text = text.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]");
  text = text.replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, "[redacted-email]");
  text = text.replace(/[?&](token|adminToken|access_token|password|code)=[^&\s]*/gi, "[$1=redacted]");
  return text;
}

/**
 * Build a safe event payload for Sentry / Admin Health.
 * Only the allow-listed fields below may leave the process.
 */
function buildSafeEvent({
  errorType = "error",
  message = "",
  deployedCommit = "",
  page = "",
  role = "",
  device = "",
  fakeOrganizationId = "",
  timingMs = null,
  source = "server",
} = {}) {
  return {
    errorType: cleanText(errorType, 80) || "error",
    message: sanitizeErrorMessage(message),
    deployedCommit: cleanText(deployedCommit, 40),
    page: cleanText(page, 120),
    roleCategory: roleCategory(role),
    device: cleanText(device, 40) || "unknown",
    fakeOrganizationId: /fake|example\.invalid|org_/i.test(String(fakeOrganizationId || ""))
      ? cleanText(fakeOrganizationId, 160)
      : "",
    timingMs: Number.isFinite(Number(timingMs)) ? Math.max(0, Math.round(Number(timingMs))) : null,
    source: source === "browser" ? "browser" : "server",
    at: new Date().toISOString(),
  };
}

function rateLimitGate(state, { windowMs = 60_000, maxPerWindow = 20 } = {}) {
  const now = Date.now();
  state.windowStartedAt = state.windowStartedAt || now;
  state.count = state.count || 0;
  if (now - state.windowStartedAt > windowMs) {
    state.windowStartedAt = now;
    state.count = 0;
  }
  if (state.count >= maxPerWindow) return false;
  state.count += 1;
  return true;
}

module.exports = {
  cleanText,
  sanitizePathname,
  sanitizeQuery,
  roleCategory,
  deviceBucket,
  sanitizeErrorMessage,
  buildSafeEvent,
  rateLimitGate,
  SENSITIVE_QUERY_KEYS,
};
