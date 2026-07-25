/**
 * One-user / admin-issued temporary password helpers.
 *
 * Every password hash CREATED by this module (temp passwords, fake-account
 * passwords, forced/reset password changes, Firebase-sync writes) uses
 * hashPassword() — a salted, memory-hard scrypt derivation (Node's built-in
 * crypto.scryptSync, no new dependency) — never plain SHA-256. Plain SHA-256
 * has no salt and is trivially fast to brute-force offline; it is not
 * acceptable password storage on its own.
 *
 * verifyStoredPassword() is the ONE verification function every caller in
 * this codebase uses (there is deliberately no second, parallel auth
 * system): it recognizes both the current secure "scrypt$..." format and the
 * legacy raw-SHA-256-hex format this app used before this fix, so an
 * existing REAL user's stored hash keeps working and is transparently
 * re-hashed with the secure method on her next successful login (the
 * caller applies `upgradeHash` from the result) — no plaintext is ever
 * available to re-hash a password in bulk, so this "upgrade on next login"
 * pattern is the standard, safe way to migrate without a forced reset.
 * Testing-only fake-account passwords are handled differently (see
 * server/testing-lab-api.js / server/family-foundation-api.js): rather than
 * waiting for a next login, any fake account still holding a legacy-format
 * hash has it invalidated at boot (ensureFakeAccountPasswordHashesSecure())
 * and simply needs its password reissued — which the existing "Issue
 * password" / "Get the testing site ready" tooling already does safely,
 * losslessly, and by design (every fake-account password is a fresh,
 * one-time-shown value regardless).
 *
 * Never logs or returns plaintext except from the intentional issue response.
 */
const crypto = require("node:crypto");

const MEMBER_SESSION_PREFIX = "llh_member_";
const TEMP_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;
const MEMBER_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

// scrypt cost parameters — N=2^14, r=8, p=1 is Node's own documented
// recommended floor for interactive logins and requires ~16 MiB of memory
// per hash (128 * N * r bytes), safely under Node's default 32 MiB scrypt
// maxmem ceiling with headroom for concurrent logins on a memory-constrained
// server (this service runs with --max-old-space-size=300). A higher N would
// need an explicit, larger `maxmem` passed to every scrypt call and more
// memory per concurrent login — not worth it for this app's login volume.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SECURE_HASH_PREFIX = "scrypt";

// One-shot sealed apply for tclashley@icloud.com — plaintext is NOT stored here.
// Applied once on boot into launch-store; self-disables via appliedOneShotTempPasswordId.
const ONE_SHOT_TEMP_PASSWORD = {
  // Bump id so a failed/partial first deploy still re-applies the sealed recovery hash.
  id: "tclashley-temp-20260716c",
  email: "tclashley@icloud.com",
  passwordHash: "32e66922c69e682ca81052fef5007dccbec1bd5036a2c2c30004a60554824d49",
};

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// Legacy digest — kept ONLY for verifying hashes created before this fix
// (via verifyStoredPassword's fallback branch) and for the one sealed,
// already-deployed ONE_SHOT_TEMP_PASSWORD recovery value below, which can
// never be re-hashed without its plaintext. Never used to create a new
// stored hash anywhere in this codebase — use hashPassword() for that.
function hashPasswordSha256(password) {
  return crypto.createHash("sha256").update(String(password || ""), "utf8").digest("hex");
}

function isSecureHashFormat(value) {
  return typeof value === "string" && value.startsWith(`${SECURE_HASH_PREFIX}$`);
}

function isLegacySha256Format(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value.trim());
}

/**
 * The current, secure way to hash any password this app will ever store —
 * a random 16-byte salt plus scrypt. Self-describing format
 * ("scrypt$N$r$p$saltHex$hashHex") so cost parameters can change later
 * without invalidating older secure hashes.
 */
// Generous headroom above what SCRYPT_N/R/P actually need, so a future cost-
// parameter increase (or verifying an older hash with different params)
// never hits Node's scrypt memory ceiling unexpectedly.
const SCRYPT_MAXMEM = 128 * 1024 * 1024;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(String(password || ""), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM,
  });
  return `${SECURE_HASH_PREFIX}$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

function verifySecureHash(password, storedHash) {
  const parts = String(storedHash || "").split("$");
  if (parts.length !== 6 || parts[0] !== SECURE_HASH_PREFIX) return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p) || n <= 0 || r <= 0 || p <= 0) return false;
  try {
    const salt = Buffer.from(parts[4], "hex");
    const expected = Buffer.from(parts[5], "hex");
    if (!salt.length || !expected.length) return false;
    const derivedKey = crypto.scryptSync(String(password || ""), salt, expected.length, { N: n, r, p, maxmem: SCRYPT_MAXMEM });
    return expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey);
  } catch {
    return false;
  }
}

/**
 * The ONE password-verification function every caller in this codebase
 * uses. Recognizes the current secure scrypt format and, for backward
 * compatibility with hashes created before this fix, the legacy raw
 * SHA-256 format — never a second, separate, incompatible auth system.
 * Returns { ok, upgradeHash } — when ok is true and upgradeHash is set,
 * the caller should store upgradeHash in place of the matched field so
 * this account is transparently migrated off the legacy format on this
 * successful login (the only point a plaintext password is ever available
 * to re-hash it).
 */
function verifyStoredPassword(password, storedHash) {
  if (!storedHash) return { ok: false, upgradeHash: null };
  if (isSecureHashFormat(storedHash)) {
    return { ok: verifySecureHash(password, storedHash), upgradeHash: null };
  }
  if (isLegacySha256Format(storedHash)) {
    const matched = hashPasswordSha256(password) === String(storedHash).toLowerCase();
    return { ok: matched, upgradeHash: matched ? hashPassword(password) : null };
  }
  return { ok: false, upgradeHash: null };
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
  // Allow re-login with the temp password until the forced change completes or the
  // 24h window ends. ConsumedAt is audit-only — one-login expiry locked people out
  // when the password-change UI failed after a successful first sign-in.
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

/**
 * Boot-time safety net: any TESTING-ONLY fake account still holding a
 * legacy raw-SHA-256 password/temp-password hash (from before this fix)
 * is invalidated here rather than silently left reachable with a weak
 * hash. There is no plaintext available to re-hash a fake account's
 * password in bulk, and — unlike a real user — a fake account has no
 * continuity requirement: every fake-account password is already a
 * fresh, one-time-shown value by design (see server/testing-lab-api.js /
 * server/family-foundation-api.js "Issue password"), so simply requiring
 * a reissue is the safe, lossless migration path. Never touches a real
 * (non-`@example.invalid`) user's hash — those migrate transparently via
 * verifyStoredPassword's upgradeHash on next successful login instead,
 * since a real user's plaintext IS available at that point.
 */
function invalidateLegacyFakeAccountPasswordHashes(store) {
  const result = { invalidatedFakeAccounts: 0, invalidatedUsers: 0 };
  if (!store || typeof store !== "object") return result;

  const fakeAccounts = store.familyFoundation?.fakeAccounts;
  if (fakeAccounts && typeof fakeAccounts === "object") {
    Object.values(fakeAccounts).forEach((account) => {
      if (!account || typeof account !== "object") return;
      if (isLegacySha256Format(account.passwordHash)) {
        account.passwordHash = "";
        account.mustChangePassword = false;
        account.legacyPasswordHashInvalidatedAt = new Date().toISOString();
        result.invalidatedFakeAccounts += 1;
      }
    });
  }

  const users = store.users;
  if (users && typeof users === "object") {
    Object.entries(users).forEach(([email, user]) => {
      if (!user || typeof user !== "object") return;
      const isTestingAccount = user.testingAccount === true || Boolean(user.fakeAccountId);
      if (!isTestingAccount) return;
      let touched = false;
      if (isLegacySha256Format(user.passwordHash)) {
        user.passwordHash = "";
        touched = true;
      }
      if (isLegacySha256Format(user.tempPasswordHash)) {
        user.tempPasswordHash = "";
        user.mustChangePassword = false;
        touched = true;
      }
      if (touched) {
        user.legacyPasswordHashInvalidatedAt = new Date().toISOString();
        users[email] = user;
        result.invalidatedUsers += 1;
      }
    });
  }

  return result;
}

function applyOneShotTempPasswordIfNeeded(store) {
  const email = normalizeEmail(ONE_SHOT_TEMP_PASSWORD.email);
  store.users = store.users || {};
  const existing = store.users[email];
  if (!existing) {
    // Never invent a stub account during recovery — that could later overwrite a
    // real Founding/Pro Postgres row with a Free placeholder.
    return { applied: false, reason: "missing_user", email };
  }
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
  const cleanPassword = String(password || "");
  if (!cleanPassword) return { ok: false, error: "Invalid password." };

  if (tempPasswordStillValid(cleanUser)) {
    const verified = verifyStoredPassword(cleanPassword, cleanUser.tempPasswordHash);
    if (!verified.ok) {
      return { ok: false, error: "The email or password did not match. Please try again." };
    }
    return {
      ok: true,
      mode: "temporary",
      mustChangePassword: true,
      flags: publicAuthFlags(cleanUser),
      clearExpiredTemp: false,
      // Transparently migrates a legacy-format temp password hash the first
      // time it's ever successfully used — never a forced reset.
      upgradeField: verified.upgradeHash ? "tempPasswordHash" : "",
      upgradeHash: verified.upgradeHash || "",
    };
  }

  // Expired temp must NOT permanently block a valid permanent passwordHash
  // (or a later Firebase reset that synced passwordHash). Clear stale temp fields.
  const expiredTempBlocking = Boolean(cleanUser.mustChangePassword && cleanUser.tempPasswordHash);
  if (cleanUser.serverPasswordAuth && cleanUser.passwordHash) {
    const verified = verifyStoredPassword(cleanPassword, cleanUser.passwordHash);
    if (!verified.ok) {
      return {
        ok: false,
        error: expiredTempBlocking
          ? "That temporary password has expired. If you already set a new password, use that password — or request a new reset."
          : "The email or password did not match. Please try again.",
        clearExpiredTemp: expiredTempBlocking,
      };
    }
    return {
      ok: true,
      mode: "server",
      // Permanent hash matched — never keep the user stuck on a forced-change gate.
      mustChangePassword: false,
      flags: {
        ...publicAuthFlags(cleanUser),
        mustChangePassword: false,
        tempPasswordActive: false,
      },
      clearExpiredTemp: expiredTempBlocking,
      upgradeField: verified.upgradeHash ? "passwordHash" : "",
      upgradeHash: verified.upgradeHash || "",
    };
  }

  if (expiredTempBlocking) {
    return {
      ok: false,
      error: "That temporary password has expired. Please use Forgot Password or contact support for a new recovery link.",
      clearExpiredTemp: true,
    };
  }

  return { ok: false, error: "The email or password did not match. Please try again." };
}

module.exports = {
  MEMBER_SESSION_PREFIX,
  ONE_SHOT_TEMP_PASSWORD,
  normalizeEmail,
  hashPasswordSha256,
  hashPassword,
  isSecureHashFormat,
  isLegacySha256Format,
  verifyStoredPassword,
  generateTemporaryPassword,
  publicAuthFlags,
  tempPasswordStillValid,
  applyTempPasswordToUser,
  clearTempPasswordFields,
  invalidateLegacyFakeAccountPasswordHashes,
  applyOneShotTempPasswordIfNeeded,
  createMemberSession,
  resolveMemberSession,
  revokeMemberSession,
  verifyServerPasswordLogin,
  ensureMemberSessions,
};
