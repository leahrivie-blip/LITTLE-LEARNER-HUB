/**
 * Phase 20 — Security checklist + rate-limit helpers (testing-safe).
 * Not a formal security certification. Secrets never logged.
 */

const crypto = require("node:crypto");

const PHASE = 20;
const FEATURE_MARKER = "phase20-security-migration-readiness";
const TESTING_BANNER = "Private Testing Environment — Fake Data Only";

const SECRET_RE = /(password|passwd|token|secret|signature|ssn|medical|diagnosis|allerg|privateNote|messageBody|messageContent|api[_-]?key|authorization|bearer|creditCard|cardNumber)/i;

const SECURITY_CHECKLIST = Object.freeze([
  { id: "auth_sessions", label: "Authentication and session handling", status: "hardened", note: "Admin Bearer sessions; query tokens rejected on expansion routes." },
  { id: "role_permissions", label: "Role and permission enforcement", status: "hardened", note: "Org permissions + expansion gates; wrong-role denials tested across phases." },
  { id: "isolation", label: "Organization / classroom / child / staff / guardian isolation", status: "hardened", note: "Cross-org denials in Phase 1–19 suites." },
  { id: "guardian_states", label: "Restricted / suspended / ended / pickup-only guardians", status: "hardened", note: "Family foundation + Hub handlers enforce access levels." },
  { id: "url_api", label: "Direct URL and API protection", status: "hardened", note: "Production locks + feature flags + verified admin for Lab." },
  { id: "files_docs", label: "File and document access", status: "hardened", note: "Private file routes; no public URLs for records media." },
  { id: "signatures", label: "Signature and private-record protection", status: "hardened", note: "Recipient token header-only; signatures not logged." },
  { id: "rate_limits", label: "Rate limiting for sensitive actions", status: "hardened", note: "Admin login + Testing Lab sensitive POSTs rate-limited in Phase 20." },
  { id: "uploads", label: "Input validation and upload restrictions", status: "hardened", note: "Existing file validation in updates/messaging/records." },
  { id: "csrf_injection", label: "CSRF / injection / unsafe redirects / authorization", status: "partial", note: "Bearer-based APIs; no cookie-session CSRF tokens. Professional review still needed for legacy cookie surfaces." },
  { id: "log_secrets", label: "Secret / PII exposure in logs and errors", status: "hardened", note: "sanitizeErrorForLog strips secrets; Lab failed-saves sanitized." },
  { id: "lab_prod_reject", label: "Fake-account and Testing Lab production rejection", status: "hardened", note: "production_preview_rejected on live host." },
  { id: "flag_locks", label: "Feature-flag production locks", status: "hardened", note: "expansion-feature-flags force OFF on live production." },
  { id: "session_expiry", label: "Safe session expiration and logout", status: "hardened", note: "Admin logout clears session; role preview expires." },
]);

/** In-memory rate buckets (per process). Testing-safe; not a distributed limiter. */
const rateBuckets = new Map();

function cleanText(value, max = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function sanitizeErrorForLog(input = {}) {
  const out = {
    at: nowIso(),
    code: cleanText(input.code || input.name || "error", 80),
    message: cleanText(input.message || "Request failed.", 240),
    surface: cleanText(input.surface, 60),
    testingOnly: true,
    noSecrets: true,
  };
  if (input.statusCode != null) out.statusCode = Number(input.statusCode) || 0;
  for (const key of Object.keys(input || {})) {
    if (SECRET_RE.test(key)) continue;
  }
  return out;
}

/**
 * Simple sliding-window rate limit.
 * @returns {{ allowed: boolean, retryAfterSec: number, remaining: number }}
 */
function checkRateLimit(key, { limit = 10, windowMs = 60_000 } = {}) {
  const id = cleanText(key, 160) || "anonymous";
  const now = Date.now();
  let bucket = rateBuckets.get(id);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    bucket = { windowStart: now, count: 0 };
  }
  bucket.count += 1;
  rateBuckets.set(id, bucket);
  const remaining = Math.max(0, limit - bucket.count);
  if (bucket.count > limit) {
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - bucket.windowStart)) / 1000));
    return { allowed: false, retryAfterSec, remaining: 0, windowMs, limit };
  }
  return { allowed: true, retryAfterSec: 0, remaining, windowMs, limit };
}

function resetRateLimitForTests() {
  rateBuckets.clear();
}

function clientKeyFromRequest(request, suffix = "") {
  const headers = request?.headers || {};
  const xf = String(headers["x-forwarded-for"] || headers["X-Forwarded-For"] || "").split(",")[0].trim();
  const ip = xf || String(headers["x-real-ip"] || request?.socket?.remoteAddress || "local");
  return `${ip}|${suffix}`;
}

function buildSecurityReviewSummary() {
  const hardened = SECURITY_CHECKLIST.filter((c) => c.status === "hardened").length;
  const partial = SECURITY_CHECKLIST.filter((c) => c.status === "partial").length;
  return {
    ok: true,
    phase: PHASE,
    featureMarker: FEATURE_MARKER,
    testingBanner: TESTING_BANNER,
    formalCertification: false,
    summary: {
      hardened,
      partial,
      total: SECURITY_CHECKLIST.length,
      note: "Automated and code-level hardenings only. Not a formal penetration test or certification.",
    },
    checklist: SECURITY_CHECKLIST,
    remainingProfessionalReview: [
      "Independent penetration test before production go-live",
      "Cookie/session CSRF strategy for any non-Bearer browser forms",
      "Full threat model for file storage and signature retention",
      "Secrets management audit for hosting environment variables",
      "Abuse monitoring / distributed rate limiting in production infrastructure",
    ],
    at: nowIso(),
  };
}

module.exports = {
  PHASE,
  FEATURE_MARKER,
  TESTING_BANNER,
  SECRET_RE,
  SECURITY_CHECKLIST,
  cleanText,
  nowIso,
  newId,
  sanitizeErrorForLog,
  checkRateLimit,
  resetRateLimitForTests,
  clientKeyFromRequest,
  buildSecurityReviewSummary,
};
