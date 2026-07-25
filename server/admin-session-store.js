/**
 * Dedicated admin session storage — isolated from the main application document.
 *
 * Root cause this fixes: admin login previously stored its session token inside
 * store.adminSessions, which lives in the SAME single JSONB document as users,
 * curriculum, messages, billing, etc. Every login therefore re-serialized and
 * rewrote the ENTIRE multi-MB store just to persist one new session row, and
 * every authenticated admin request re-cloned the entire store just to check
 * whether one token existed (see validAdminToken() -> readStore() ->
 * structuredClone(storeCache)).
 *
 * This module keeps sessions in their own Postgres table (llh_admin_sessions) or,
 * in local-json/test mode, their own small side file — never inside the shared
 * store document. Validation is served from an in-memory map (loaded at boot and
 * kept in sync on every create/revoke), so authenticated requests no longer touch
 * the main store at all for the auth check itself.
 *
 * Password/access-code verification is NOT handled here and is unchanged by this
 * module — callers still verify credentials themselves (see server/index.js
 * handleAdminLogin) and only call create() once credentials are already valid.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const SESSION_ID_BYTES = 32; // 256-bit random token
const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h idle expiry
const DEFAULT_LOCKOUT_MAX_ATTEMPTS = 6;
const DEFAULT_LOCKOUT_WINDOW_MS = 10 * 60 * 1000; // failed attempts counted within this window
const DEFAULT_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // lockout length once tripped
const PRUNE_INTERVAL_MS = 10 * 60 * 1000;

function normalizeEmailLocal(email) {
  return String(email || "").trim().toLowerCase();
}

function nowMs() {
  return Date.now();
}

/**
 * Factory so tests can create isolated instances (no shared module-level state
 * leaking between test files or between the real server and tests).
 */
function createAdminSessionStore({
  localFilePath = null,
  sessionTtlMs = DEFAULT_SESSION_TTL_MS,
  lockoutMaxAttempts = DEFAULT_LOCKOUT_MAX_ATTEMPTS,
  lockoutWindowMs = DEFAULT_LOCKOUT_WINDOW_MS,
  lockoutDurationMs = DEFAULT_LOCKOUT_DURATION_MS,
} = {}) {
  // token -> { email, createdAt (ms), expiresAt (ms), lastValidatedAt (ms), revokedAt (ms|null) }
  const sessions = new Map();
  const failedAttempts = new Map(); // normalizedEmail -> array of attempt timestamps (ms)
  const lockedUntil = new Map(); // normalizedEmail -> ms timestamp
  let pool = null;
  let usingPostgres = false;
  let migrated = false;
  let pruneTimer = null;

  function configure({ pool: nextPool = null, usingPostgres: nextUsingPostgres = false } = {}) {
    pool = nextPool;
    usingPostgres = Boolean(nextUsingPostgres);
  }

  async function initTable() {
    if (!usingPostgres || !pool) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS llh_admin_sessions (
        token TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        last_validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMPTZ
      )
    `);
    await pool.query("CREATE INDEX IF NOT EXISTS llh_admin_sessions_email_idx ON llh_admin_sessions (email)");
  }

  function readLocalFile() {
    if (!localFilePath) return {};
    try {
      if (!fs.existsSync(localFilePath)) return {};
      const raw = fs.readFileSync(localFilePath, "utf8");
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeLocalFile() {
    if (!localFilePath) return;
    try {
      fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
      const out = {};
      sessions.forEach((session, token) => {
        out[token] = session;
      });
      fs.writeFileSync(localFilePath, JSON.stringify(out));
    } catch (error) {
      console.warn("[admin-session-store] local file write failed:", error.message);
    }
  }

  /** Load persisted sessions into the in-memory map at boot. */
  async function loadFromStorage() {
    sessions.clear();
    if (usingPostgres && pool) {
      const result = await pool.query(
        "SELECT token, email, created_at, expires_at, last_validated_at, revoked_at FROM llh_admin_sessions WHERE revoked_at IS NULL AND expires_at > NOW()",
      );
      result.rows.forEach((row) => {
        sessions.set(row.token, {
          email: row.email,
          createdAt: new Date(row.created_at).getTime(),
          expiresAt: new Date(row.expires_at).getTime(),
          lastValidatedAt: new Date(row.last_validated_at).getTime(),
          revokedAt: null,
        });
      });
      return;
    }
    const raw = readLocalFile();
    const now = nowMs();
    Object.entries(raw).forEach(([token, session]) => {
      if (!session || session.revokedAt || !Number.isFinite(session.expiresAt) || session.expiresAt <= now) return;
      sessions.set(token, session);
    });
  }

  /**
   * One-time, idempotent migration of legacy sessions that were stored inside
   * store.adminSessions (the shared document). Safe to call on every boot — it
   * only inserts tokens that are not already present in the new session store,
   * so an admin who was already logged in via the OLD mechanism keeps working
   * without being forced to log back in, and running this twice never
   * duplicates or corrupts anything.
   */
  async function migrateLegacySessions(legacySessions) {
    if (migrated) return { migratedCount: 0, alreadyMigrated: true };
    migrated = true;
    const entries = Object.entries(legacySessions && typeof legacySessions === "object" ? legacySessions : {});
    if (!entries.length) return { migratedCount: 0, alreadyMigrated: false };
    const now = nowMs();
    let migratedCount = 0;
    for (const [token, legacy] of entries) {
      if (!token || !legacy?.email) continue;
      if (sessions.has(token)) continue; // already migrated in a prior boot
      const createdAt = Number.isFinite(new Date(legacy.createdAt).getTime())
        ? new Date(legacy.createdAt).getTime()
        : now;
      // Legacy sessions never expired. Grant a fresh full TTL from migration time
      // rather than an already-expired stamp, so no currently-logged-in admin is
      // unexpectedly logged out purely because of this migration.
      const expiresAt = now + sessionTtlMs;
      const session = {
        email: normalizeEmailLocal(legacy.email),
        createdAt,
        expiresAt,
        lastValidatedAt: now,
        revokedAt: null,
      };
      sessions.set(token, session);
      if (usingPostgres && pool) {
        // eslint-disable-next-line no-await-in-loop -- migration runs once at boot, not on a request path
        await pool.query(
          `INSERT INTO llh_admin_sessions (token, email, created_at, expires_at, last_validated_at)
           VALUES ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0), to_timestamp($5 / 1000.0))
           ON CONFLICT (token) DO NOTHING`,
          [token, session.email, createdAt, expiresAt, now],
        );
      }
      migratedCount += 1;
    }
    if (!usingPostgres) writeLocalFile();
    if (migratedCount) {
      console.log(`[admin-session-store] migrated ${migratedCount} legacy admin session(s) into dedicated storage`);
    }
    return { migratedCount, alreadyMigrated: false };
  }

  /**
   * Creates a new session. This is the ONLY write on the login path, and it
   * writes exactly one row/record — never the main application store. Also
   * satisfies "rotation after successful authentication": every successful
   * login always mints a brand-new, independent random token; nothing about a
   * prior token is reused or extended.
   */
  async function create(email) {
    const token = `admin_${crypto.randomBytes(SESSION_ID_BYTES).toString("hex")}`;
    const now = nowMs();
    const session = {
      email: normalizeEmailLocal(email),
      createdAt: now,
      expiresAt: now + sessionTtlMs,
      lastValidatedAt: now,
      revokedAt: null,
    };
    sessions.set(token, session);
    if (usingPostgres && pool) {
      try {
        await pool.query(
          `INSERT INTO llh_admin_sessions (token, email, created_at, expires_at, last_validated_at)
           VALUES ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0), to_timestamp($5 / 1000.0))`,
          [token, session.email, session.createdAt, session.expiresAt, session.lastValidatedAt],
        );
      } catch (error) {
        // Degrade like the rest of the app does on a Postgres blip: keep the
        // session valid for this running process (already in the in-memory map)
        // and fall back to the local file as a durability net, rather than
        // failing a login outright because of a transient database write error.
        console.warn("[admin-session-store] Postgres write failed on create — session kept in memory + local fallback:", error.message);
        writeLocalFile();
      }
    } else {
      writeLocalFile();
    }
    return token;
  }

  /**
   * Pure in-memory check — no I/O, no store clone. This is what replaces
   * validAdminToken()'s previous readStore() (a full-store structuredClone) on
   * every single authenticated admin request.
   */
  function validate(token) {
    const clean = String(token || "").trim();
    if (!clean) return null;
    const session = sessions.get(clean);
    if (!session || session.revokedAt) return null;
    if (!Number.isFinite(session.expiresAt) || session.expiresAt <= nowMs()) {
      sessions.delete(clean);
      return null;
    }
    return session;
  }

  /**
   * Soft-touch lastValidatedAt (sliding expiration) and persist it, but only for
   * the single session row — never the main store. The persistence itself is
   * fire-and-forget from the caller's perspective (does not block the response);
   * callers that need a durability guarantee (create/revoke) already await those
   * separately.
   */
  function touch(token) {
    const clean = String(token || "").trim();
    const session = sessions.get(clean);
    if (!session) return;
    const now = nowMs();
    session.lastValidatedAt = now;
    session.expiresAt = now + sessionTtlMs; // sliding idle-timeout window
    if (usingPostgres && pool) {
      pool.query(
        "UPDATE llh_admin_sessions SET last_validated_at = NOW(), expires_at = to_timestamp($2 / 1000.0) WHERE token = $1",
        [clean, session.expiresAt],
      ).catch((error) => {
        console.warn("[admin-session-store] touch persist failed (session stays valid in memory):", error.message);
      });
    } else {
      writeLocalFile();
    }
  }

  async function revoke(token) {
    const clean = String(token || "").trim();
    if (!clean) return false;
    const existed = sessions.delete(clean);
    if (usingPostgres && pool) {
      try {
        await pool.query("DELETE FROM llh_admin_sessions WHERE token = $1", [clean]);
      } catch (error) {
        console.warn("[admin-session-store] Postgres delete failed on revoke (session already removed from memory):", error.message);
      }
    } else {
      writeLocalFile();
    }
    return existed;
  }

  async function revokeAllForEmail(email) {
    const target = normalizeEmailLocal(email);
    let count = 0;
    sessions.forEach((session, token) => {
      if (session.email === target) {
        sessions.delete(token);
        count += 1;
      }
    });
    if (usingPostgres && pool) {
      try {
        await pool.query("DELETE FROM llh_admin_sessions WHERE email = $1", [target]);
      } catch (error) {
        console.warn("[admin-session-store] Postgres delete failed on revokeAllForEmail:", error.message);
      }
    } else {
      writeLocalFile();
    }
    return count;
  }

  async function prune() {
    const now = nowMs();
    let removed = 0;
    sessions.forEach((session, token) => {
      if (session.revokedAt || !Number.isFinite(session.expiresAt) || session.expiresAt <= now) {
        sessions.delete(token);
        removed += 1;
      }
    });
    if (usingPostgres && pool) {
      await pool.query("DELETE FROM llh_admin_sessions WHERE expires_at <= NOW() OR revoked_at IS NOT NULL");
    } else if (removed) {
      writeLocalFile();
    }
    return removed;
  }

  function startPruneScheduler() {
    if (pruneTimer) return;
    pruneTimer = setInterval(() => { prune().catch(() => {}); }, PRUNE_INTERVAL_MS);
    if (typeof pruneTimer.unref === "function") pruneTimer.unref();
  }

  function stopPruneScheduler() {
    if (pruneTimer) clearInterval(pruneTimer);
    pruneTimer = null;
  }

  // ─── Login rate limiting / lockout ──────────────────────────────────────
  // Intentionally in-memory only (not persisted): a lockout resetting on a
  // process restart is an acceptable, documented trade-off, and avoids adding
  // another store write to a security-sensitive hot path.
  function recordFailedAttempt(email) {
    const key = normalizeEmailLocal(email);
    const now = nowMs();
    const attempts = (failedAttempts.get(key) || []).filter((t) => now - t < lockoutWindowMs);
    attempts.push(now);
    failedAttempts.set(key, attempts);
    if (attempts.length >= lockoutMaxAttempts) {
      lockedUntil.set(key, now + lockoutDurationMs);
    }
  }

  function recordSuccessfulAttempt(email) {
    const key = normalizeEmailLocal(email);
    failedAttempts.delete(key);
    lockedUntil.delete(key);
  }

  function lockoutStatus(email) {
    const key = normalizeEmailLocal(email);
    const until = lockedUntil.get(key);
    const now = nowMs();
    if (!until || until <= now) {
      if (until) lockedUntil.delete(key);
      return { lockedOut: false, retryAfterMs: 0 };
    }
    return { lockedOut: true, retryAfterMs: until - now };
  }

  return {
    configure,
    initTable,
    loadFromStorage,
    migrateLegacySessions,
    create,
    validate,
    touch,
    revoke,
    revokeAllForEmail,
    prune,
    startPruneScheduler,
    stopPruneScheduler,
    recordFailedAttempt,
    recordSuccessfulAttempt,
    lockoutStatus,
    // Test/introspection only — never used by production request handlers.
    _debugSessionCount: () => sessions.size,
    _debugSessions: () => sessions,
  };
}

module.exports = {
  createAdminSessionStore,
  SESSION_ID_BYTES,
  DEFAULT_SESSION_TTL_MS,
  DEFAULT_LOCKOUT_MAX_ATTEMPTS,
  DEFAULT_LOCKOUT_WINDOW_MS,
  DEFAULT_LOCKOUT_DURATION_MS,
  normalizeEmailLocal,
};
