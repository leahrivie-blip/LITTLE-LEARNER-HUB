/**
 * Testing-link tokens for Phase 6 recipient links.
 *
 * Safety rules enforced here and by callers:
 * - Raw tokens are returned to the admin exactly once (create/regenerate) and
 *   are never stored. Only a SHA-256 hash is persisted on the assignment.
 * - Tokens expire and can be revoked/regenerated at any time.
 * - Testing links must never work on a live production host.
 * - Tokens must never be accepted via a query string on the server side —
 *   only a header (recipient client extracts it from the URL fragment,
 *   which browsers never send to the server or record in access logs).
 */

const crypto = require("node:crypto");

const RECIPIENT_TOKEN_HEADER = "x-llh-form-recipient-token";
const DEFAULT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, testing only

function nowIso() {
  return new Date().toISOString();
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken || ""), "utf8").digest("hex");
}

function generateRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Returns { rawToken, tokenHash, expiresAt } — caller persists only tokenHash
 * and expiresAt on the assignment, and returns rawToken to the admin once.
 */
function issueTestingLink({ ttlMs = DEFAULT_TOKEN_TTL_MS } = {}) {
  const rawToken = generateRawToken();
  return {
    rawToken,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + Math.max(60 * 1000, Number(ttlMs) || DEFAULT_TOKEN_TTL_MS)).toISOString(),
    createdAt: nowIso(),
  };
}

function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(String(a || ""), "hex");
  const bufB = Buffer.from(String(b || ""), "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function isExpired(expiresAt) {
  if (!expiresAt) return true;
  const expiry = new Date(expiresAt).getTime();
  return !Number.isFinite(expiry) || expiry <= Date.now();
}

/**
 * Verify a raw recipient-supplied token against an assignment's stored hash.
 * Returns { ok, reason }.
 */
function verifyTestingLinkToken(assignment, rawToken) {
  if (!assignment) return { ok: false, reason: "assignment_not_found" };
  if (!rawToken) return { ok: false, reason: "token_required" };
  if (!assignment.testingLinkTokenHash) return { ok: false, reason: "link_not_issued" };
  if (assignment.testingLinkRevoked === true) return { ok: false, reason: "link_revoked" };
  if (isExpired(assignment.testingLinkExpiresAt)) return { ok: false, reason: "link_expired" };
  const candidateHash = hashToken(rawToken);
  if (!timingSafeEqualHex(candidateHash, assignment.testingLinkTokenHash)) {
    return { ok: false, reason: "token_mismatch" };
  }
  return { ok: true, reason: "ok" };
}

/**
 * Extract the recipient token from a request. Only the dedicated header is
 * accepted — never a query string — so tokens never appear in server access
 * logs or get bookmarked/cached in browser history as part of the API path.
 */
function extractTokenFromRequest(request) {
  const headers = request && request.headers ? request.headers : {};
  if (headers && typeof headers.get === "function") {
    return String(headers.get(RECIPIENT_TOKEN_HEADER) || "").trim();
  }
  const found = Object.keys(headers || {}).find((name) => name.toLowerCase() === RECIPIENT_TOKEN_HEADER);
  return found ? String(headers[found] || "").trim() : "";
}

module.exports = {
  RECIPIENT_TOKEN_HEADER,
  DEFAULT_TOKEN_TTL_MS,
  hashToken,
  generateRawToken,
  issueTestingLink,
  isExpired,
  verifyTestingLinkToken,
  extractTokenFromRequest,
};
