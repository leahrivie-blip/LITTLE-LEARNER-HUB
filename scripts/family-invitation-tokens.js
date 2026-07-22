/**
 * Secure invitation tokens for Phase 8 family account invitations.
 * Raw tokens are never stored — only SHA-256 hashes. Production must reject
 * testing accept modes. Tokens expire and are revocable.
 */

const crypto = require("node:crypto");

const INVITATION_TOKEN_HEADER = "x-llh-family-invitation-token";
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken || ""), "utf8").digest("hex");
}

function generateRawToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function issueInvitationToken({ ttlMs = DEFAULT_TTL_MS } = {}) {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS)).toISOString();
  return { rawToken, tokenHash, expiresAt };
}

function verifyInvitationToken(invitation, rawToken) {
  if (!invitation || !rawToken) return { ok: false, code: "missing_token" };
  if (invitation.status === "revoked") return { ok: false, code: "invitation_revoked" };
  if (invitation.status === "accepted") return { ok: false, code: "invitation_already_accepted" };
  if (!invitation.tokenHash || invitation.tokenHash !== hashToken(rawToken)) {
    return { ok: false, code: "invalid_token" };
  }
  const expires = new Date(invitation.expiresAt || 0).getTime();
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    return { ok: false, code: "invitation_expired" };
  }
  if (invitation.status !== "pending") return { ok: false, code: "invitation_not_pending" };
  return { ok: true };
}

function extractTokenFromRequest(request) {
  const headers = request && request.headers ? request.headers : {};
  if (typeof headers.get === "function") {
    return String(headers.get(INVITATION_TOKEN_HEADER) || "").trim();
  }
  const key = Object.keys(headers).find((name) => name.toLowerCase() === INVITATION_TOKEN_HEADER);
  return key ? String(headers[key] || "").trim() : "";
}

module.exports = {
  INVITATION_TOKEN_HEADER,
  hashToken,
  generateRawToken,
  issueInvitationToken,
  verifyInvitationToken,
  extractTokenFromRequest,
};
