const crypto = require("node:crypto");

const PASSWORD_RESET_TTL_MS = 2 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

function ensureEmailAuthStore(store) {
  store.emailAuth = store.emailAuth && typeof store.emailAuth === "object" ? store.emailAuth : {};
  store.emailAuth.tokens = Array.isArray(store.emailAuth.tokens) ? store.emailAuth.tokens : [];
  return store.emailAuth;
}

function pruneTokens(store, nowMs = Date.now()) {
  const auth = ensureEmailAuthStore(store);
  auth.tokens = auth.tokens.filter((row) => {
    const expiresAt = new Date(row?.expiresAt || 0).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return false;
    return !row.usedAt;
  });
  return auth.tokens;
}

function createToken(store, {
  email,
  purpose,
  ttlMs,
  meta = {},
} = {}) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !purpose || !ttlMs) return null;
  const now = Date.now();
  const auth = ensureEmailAuthStore(store);
  pruneTokens(store, now);
  auth.tokens = auth.tokens.filter((row) => !(row.email === cleanEmail && row.purpose === purpose));
  const plainToken = crypto.randomBytes(24).toString("base64url");
  auth.tokens.unshift({
    id: `emtok-${now.toString(36)}-${crypto.randomBytes(4).toString("hex")}`,
    email: cleanEmail,
    purpose: String(purpose),
    tokenHash: hashToken(plainToken),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    usedAt: "",
    meta: meta && typeof meta === "object" ? meta : {},
  });
  auth.tokens = auth.tokens.slice(0, 5000);
  return {
    token: plainToken,
    expiresAt: new Date(now + ttlMs).toISOString(),
  };
}

function inspectToken(store, plainToken, purpose) {
  if (!plainToken || !purpose) return { ok: false, reason: "missing" };
  const tokenHash = hashToken(plainToken);
  const now = Date.now();
  const tokens = pruneTokens(store, now);
  const row = tokens.find((item) => item.tokenHash === tokenHash && item.purpose === purpose);
  if (!row) return { ok: false, reason: "missing" };
  const expiresAt = new Date(row.expiresAt || 0).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return { ok: false, reason: "expired" };
  if (row.usedAt) return { ok: false, reason: "used" };
  return {
    ok: true,
    row,
    email: row.email,
    expiresAt: row.expiresAt,
    meta: row.meta || {},
  };
}

function consumeToken(store, plainToken, purpose) {
  const inspected = inspectToken(store, plainToken, purpose);
  if (!inspected.ok || !inspected.row) return inspected;
  inspected.row.usedAt = new Date().toISOString();
  return inspected;
}

module.exports = {
  PASSWORD_RESET_TTL_MS,
  EMAIL_VERIFICATION_TTL_MS,
  normalizeEmail,
  ensureEmailAuthStore,
  pruneTokens,
  createToken,
  inspectToken,
  consumeToken,
};
