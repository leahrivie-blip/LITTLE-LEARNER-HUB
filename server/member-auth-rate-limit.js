/**
 * In-memory rate limits for member password login and password-reset request.
 * Isolated from admin lockout and from the main store document.
 */
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function requestIp(request) {
  const forwarded = String(request?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(request?.socket?.remoteAddress || "").trim() || "unknown";
}

function pruneTimestamps(list, windowMs, nowMs) {
  const start = nowMs - windowMs;
  return (Array.isArray(list) ? list : []).filter((ts) => Number(ts) > start);
}

function envPositiveInt(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

function createMemberAuthRateLimit(overrides = {}) {
  const loginMaxFailed = overrides.loginMaxFailed ?? envPositiveInt("MEMBER_LOGIN_RATE_MAX", 8);
  const loginWindowMs = overrides.loginWindowMs ?? envPositiveInt("MEMBER_LOGIN_RATE_WINDOW_MS", 15 * 60 * 1000);
  const loginLockoutMs = overrides.loginLockoutMs ?? envPositiveInt("MEMBER_LOGIN_LOCKOUT_MS", 15 * 60 * 1000);
  const resetMax = overrides.resetMax ?? envPositiveInt("MEMBER_RESET_RATE_MAX", 3);
  const resetWindowMs = overrides.resetWindowMs ?? envPositiveInt("MEMBER_RESET_RATE_WINDOW_MS", 15 * 60 * 1000);
  const resetIpMax = overrides.resetIpMax ?? envPositiveInt("MEMBER_RESET_IP_RATE_MAX", 10);

  const loginFailures = new Map();
  const loginLockedUntil = new Map();
  const resetHits = new Map();

  function loginKey(ip, email) {
    return `${String(ip || "unknown")}|${normalizeEmail(email)}`;
  }

  function loginLockoutStatus(ip, email, nowMs = Date.now()) {
    const key = loginKey(ip, email);
    const until = loginLockedUntil.get(key) || 0;
    if (until > nowMs) {
      return { limited: true, retryAfterMs: until - nowMs };
    }
    return { limited: false, retryAfterMs: 0 };
  }

  function recordLoginFailure(ip, email, nowMs = Date.now()) {
    const key = loginKey(ip, email);
    const next = pruneTimestamps(loginFailures.get(key), loginWindowMs, nowMs);
    next.push(nowMs);
    loginFailures.set(key, next);
    if (next.length >= loginMaxFailed) {
      loginLockedUntil.set(key, nowMs + loginLockoutMs);
      return { limited: true, retryAfterMs: loginLockoutMs };
    }
    return { limited: false, retryAfterMs: 0, remaining: loginMaxFailed - next.length };
  }

  function recordLoginSuccess(ip, email) {
    const key = loginKey(ip, email);
    loginFailures.delete(key);
    loginLockedUntil.delete(key);
  }

  function resetStatus(ip, email, nowMs = Date.now()) {
    const emailKey = `email:${loginKey(ip, email)}`;
    const ipKey = `ip:${String(ip || "unknown")}`;
    const emailHits = pruneTimestamps(resetHits.get(emailKey), resetWindowMs, nowMs);
    const ipHits = pruneTimestamps(resetHits.get(ipKey), resetWindowMs, nowMs);
    if (emailHits.length >= resetMax) {
      return { limited: true, retryAfterMs: Math.max(0, (emailHits[0] + resetWindowMs) - nowMs) };
    }
    if (ipHits.length >= resetIpMax) {
      return { limited: true, retryAfterMs: Math.max(0, (ipHits[0] + resetWindowMs) - nowMs) };
    }
    return { limited: false, retryAfterMs: 0 };
  }

  function recordResetRequest(ip, email, nowMs = Date.now()) {
    const emailKey = `email:${loginKey(ip, email)}`;
    const ipKey = `ip:${String(ip || "unknown")}`;
    const emailHits = pruneTimestamps(resetHits.get(emailKey), resetWindowMs, nowMs);
    const ipHits = pruneTimestamps(resetHits.get(ipKey), resetWindowMs, nowMs);
    emailHits.push(nowMs);
    ipHits.push(nowMs);
    resetHits.set(emailKey, emailHits);
    resetHits.set(ipKey, ipHits);
    return resetStatus(ip, email, nowMs + 1);
  }

  return {
    loginMaxFailed,
    loginWindowMs,
    loginLockoutMs,
    resetMax,
    resetWindowMs,
    resetIpMax,
    requestIp,
    loginLockoutStatus,
    recordLoginFailure,
    recordLoginSuccess,
    resetStatus,
    recordResetRequest,
  };
}

module.exports = {
  createMemberAuthRateLimit,
  requestIp,
  normalizeEmail,
};
