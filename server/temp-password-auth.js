/**
 * One-user / admin-issued temporary password helpers.
 * Stores only SHA-256 hashes (same digest the client localPasswordHash uses).
 * Never logs or returns plaintext except from the intentional issue response.
 */
const crypto = require("node:crypto");

const MEMBER_SESSION_PREFIX = "llh_member_";
const TEMP_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;
const MEMBER_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

// One-shot sealed apply for tclashley@icloud.com — plaintext is NOT stored here.
// Applied once on boot into launch-store; self-disables via appliedOneShotTempPasswordId.
const ONE_SHOT_TEMP_PASSWORD = {
  id: "tclashley-temp-20260716",
  email: "tclashley@icloud.com",
  passwordHash: "32e66922c69e682ca81052fef5007dccbec1bd5036a2c2c30004a60554824d49",
};

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPasswordSha256(password) {
  return crypto.createHash("sha256").update(String(password || ""), "utf8").digest("hex");
}

function generateTemporaryPassword() {
  const raw = crypto.randomBytes(18).toString("base64url");
  return `${raw.slice(0, 4)}-${raw.slice(4, 10)}-${raw.slice(10, 16)}-Aa1!`;
}

function ensureMemberSessions(store) {
  if (!store.memberSessions || typeof store.memberSessions !== "object") {
    store.memberSessions = {};
  }
  return store.memberSessions;
}

function publicAuthFlags(user = {}) {
  return {
    mustChangePassword: Boolean(user.mustChangePassword),
    serverPasswordAuth: Boolean(user.serverPasswordAuth),
    tempPasswordExpiresAt: user.tempPasswordExpiresAt || "",
    tempPasswordActive: Boolean(user.tempPasswordHash) && Boolean(user.mustChangePassword),
  };
}

function tempPasswordStillValid(user, now = Date.now()) {
  if (!user?.tempPasswordHash || !user.mustChangePassword) return false;
  if (user.tempPasswordConsumedAt) return false;
  const expiresAt = new Date(user.tempPasswordExpiresAt || 0).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  return true;
}

function applyTempPasswordToUser(user, {
  passwordHash,
  now = new Date(),
  expiresAt = null,
} = {}) {
  const issuedAt = now.toISOString();
  const expiry = expiresAt || new Date(now.getTime() + TEMP_PASSWORD_TTL_MS).toISOString();
  return {
    ...user,
    // Auth-only fields — never touch plan / founding / promo / role / lesson data.
    tempPasswordHash: passwordHash,
    tempPasswordIssuedAt: issuedAt,
    tempPasswordExpiresAt: expiry,
    tempPasswordConsumedAt: "",
    mustChangePassword: true,
    serverPasswordAuth: true,
    updatedAt: issuedAt,
  };
}

function clearTempPasswordFields(user, { keepServerPasswordAuth = true } = {}) {
  return {
    ...user,
    tempPasswordHash: "",
    tempPasswordIssuedAt: "",
    tempPasswordExpiresAt: "",
    tempPasswordConsumedAt: "",
    mustChangePassword: false,
    serverPasswordAuth: keepServerPasswordAuth ? true : Boolean(user.serverPasswordAuth),
    updatedAt: new Date().toISOString(),
  };
}

function applyOneShotTempPasswordIfNeeded(store) {
  const email = normalizeEmail(ONE_SHOT_TEMP_PASSWORD.email);
  store.users = store.users || {};
  const existing = store.users[email] || { email };
  if (existing.appliedOneShotTempPasswordId === ONE_SHOT_TEMP_PASSWORD.id) {
    return { applied: false, reason: "already_applied", email };
  }
  // Preserve every non-auth field (plan, founding, lessons live client-side, etc.).
  const next = applyTempPasswordToUser(existing, {
    passwordHash: ONE_SHOT_TEMP_PASSWORD.passwordHash,
  });
  next.appliedOneShotTempPasswordId = ONE_SHOT_TEMP_PASSWORD.id;
  store.users[email] = next;
  return { applied: true, email, expiresAt: next.tempPasswordExpiresAt };
}

function createMemberSession(store, email, purpose = "server-password") {
  const sessions = ensureMemberSessions(store);
  const token = `${MEMBER_SESSION_PREFIX}${crypto.randomBytes(24).toString("hex")}`;
  const now = Date.now();
  sessions[token] = {
    email: normalizeEmail(email),
    purpose,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + MEMBER_SESSION_TTL_MS).toISOString(),
  };
  // Opportunistic cleanup of expired sessions (small map).
  Object.entries(sessions).forEach(([key, session]) => {
    const exp = new Date(session?.expiresAt || 0).getTime();
    if (!Number.isFinite(exp) || exp <= now) delete sessions[key];
  });
  return token;
}

function resolveMemberSession(store, authHeader = "") {
  const header = String(authHeader || "");
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token.startsWith(MEMBER_SESSION_PREFIX)) return null;
  const session = store.memberSessions?.[token];
  if (!session?.email) return null;
  const exp = new Date(session.expiresAt || 0).getTime();
  if (!Number.isFinite(exp) || exp <= Date.now()) {
    delete store.memberSessions[token];
    return null;
  }
  return { token, email: normalizeEmail(session.email), purpose: session.purpose || "", uid: `member-${session.email}` };
}

function revokeMemberSession(store, token) {
  if (!token || !store.memberSessions) return;
  delete store.memberSessions[token];
}

function verifyServerPasswordLogin(user, password) {
  const cleanUser = user || {};
  const hash = hashPasswordSha256(password);
  if (!hash || hash.length < 32) return { ok: false, error: "Invalid password." };

  if (tempPasswordStillValid(cleanUser)) {
    if (hash !== cleanUser.tempPasswordHash) {
      return { ok: false, error: "The email or password did not match. Please try again." };
    }
    return {
      ok: true,
      mode: "temporary",
      mustChangePassword: true,
      flags: publicAuthFlags(cleanUser),
    };
  }

  if (cleanUser.mustChangePassword && cleanUser.tempPasswordHash) {
    return { ok: false, error: "That temporary password has expired. Please contact support for a new one." };
  }

  if (cleanUser.serverPasswordAuth && cleanUser.passwordHash) {
    if (hash !== cleanUser.passwordHash) {
      return { ok: false, error: "The email or password did not match. Please try again." };
    }
    return {
      ok: true,
      mode: "server",
      mustChangePassword: Boolean(cleanUser.mustChangePassword),
      flags: publicAuthFlags(cleanUser),
    };
  }

  return { ok: false, error: "The email or password did not match. Please try again." };
}

module.exports = {
  MEMBER_SESSION_PREFIX,
  ONE_SHOT_TEMP_PASSWORD,
  normalizeEmail,
  hashPasswordSha256,
  generateTemporaryPassword,
  publicAuthFlags,
  tempPasswordStillValid,
  applyTempPasswordToUser,
  clearTempPasswordFields,
  applyOneShotTempPasswordIfNeeded,
  createMemberSession,
  resolveMemberSession,
  revokeMemberSession,
  verifyServerPasswordLogin,
  ensureMemberSessions,
};
