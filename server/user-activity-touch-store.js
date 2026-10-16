/**
 * Dedicated lastSeenAt / featureUsage persistence — isolated from llh_store JSONB.
 *
 * High-volume logged-in page_view telemetry updates memory on every event (for Admin
 * "online now") but persists via small row upserts here instead of ~45MB full-store writes.
 */
const fs = require("node:fs");
const path = require("node:path");

const TABLE_NAME = "llh_user_activity_touch";

/** @typedef {{ [eventName: string]: number }} FeatureUsageIncrements */

/**
 * @param {string | undefined} raw
 * @returns {boolean}
 */
function isUserActivityTouchPersistEnabled(raw = process.env.USER_ACTIVITY_TOUCH_PERSIST) {
  return ["1", "true", "yes", "on"].includes(String(raw || "").trim().toLowerCase());
}

function normalizeEmailLocal(email) {
  return String(email || "").trim().toLowerCase();
}

function parseTimeMs(iso) {
  const ms = new Date(iso || "").getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * @param {Record<string, unknown> | null | undefined} usage
 * @param {Record<string, unknown> | null | undefined} patch
 * @returns {Record<string, number>}
 */
function mergeFeatureUsageMax(usage, patch) {
  const out = {};
  const a = usage && typeof usage === "object" ? usage : {};
  const b = patch && typeof patch === "object" ? patch : {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach((key) => {
    const left = Number(a[key] || 0);
    const right = Number(b[key] || 0);
    if (!Number.isFinite(left) && !Number.isFinite(right)) return;
    out[key] = Math.max(Number.isFinite(left) ? left : 0, Number.isFinite(right) ? right : 0);
  });
  return out;
}

/**
 * @param {import('pg').Pool | null} pool
 * @param {string} email
 * @param {string} lastSeenAtIso
 * @param {FeatureUsageIncrements} increments
 */
async function upsertActivityTouchPostgres(pool, email, lastSeenAtIso, increments) {
  const cleanEmail = normalizeEmailLocal(email);
  if (!cleanEmail) return;
  const seenMs = parseTimeMs(lastSeenAtIso);
  const initialUsage = {};
  Object.entries(increments || {}).forEach(([name, count]) => {
    const n = Number(count);
    if (name && Number.isFinite(n) && n > 0) initialUsage[name] = n;
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO ${TABLE_NAME} (email, last_seen_at, feature_usage, updated_at)
       VALUES ($1, $2::timestamptz, $3::jsonb, NOW())
       ON CONFLICT (email) DO UPDATE SET
         last_seen_at = GREATEST(${TABLE_NAME}.last_seen_at, EXCLUDED.last_seen_at),
         updated_at = NOW()`,
      [cleanEmail, lastSeenAtIso, JSON.stringify(initialUsage)],
    );
    for (const [eventName, delta] of Object.entries(increments || {})) {
      const inc = Number(delta);
      if (!eventName || !Number.isFinite(inc) || inc <= 0) continue;
      // eslint-disable-next-line no-await-in-loop -- bounded small key set per debounced flush
      await client.query(
        `UPDATE ${TABLE_NAME}
         SET feature_usage = jsonb_set(
           COALESCE(feature_usage, '{}'::jsonb),
           ARRAY[$2::text],
           to_jsonb(COALESCE((feature_usage->>$2)::int, 0) + $3::int),
           true
         ),
         updated_at = NOW()
         WHERE email = $1`,
        [cleanEmail, eventName, inc],
      );
    }
    if (seenMs > 0) {
      await client.query(
        `UPDATE ${TABLE_NAME}
         SET last_seen_at = GREATEST(last_seen_at, $2::timestamptz),
             updated_at = NOW()
         WHERE email = $1`,
        [cleanEmail, lastSeenAtIso],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * @param {Record<string, unknown>} store
 * @param {string} email
 * @param {string} lastSeenAtIso
 * @param {FeatureUsageIncrements} increments
 */
function mergeTouchIntoLocalUser(store, email, lastSeenAtIso, increments) {
  if (!store || typeof store !== "object") return;
  const cleanEmail = normalizeEmailLocal(email);
  if (!cleanEmail) return;
  store.users = store.users || {};
  const existing = store.users[cleanEmail] || store.users[email] || { email: cleanEmail };
  const seenMs = parseTimeMs(lastSeenAtIso);
  const blobMs = parseTimeMs(existing.lastSeenAt);
  const updates = { ...existing, email: existing.email || cleanEmail };
  if (seenMs > blobMs) updates.lastSeenAt = lastSeenAtIso;
  const mergedUsage = { ...(updates.featureUsage && typeof updates.featureUsage === "object" ? updates.featureUsage : {}) };
  Object.entries(increments || {}).forEach(([name, count]) => {
    const inc = Number(count);
    if (!name || !Number.isFinite(inc) || inc <= 0) return;
    mergedUsage[name] = Number(mergedUsage[name] || 0) + inc;
  });
  updates.featureUsage = mergedUsage;
  store.users[cleanEmail] = updates;
  if (email !== cleanEmail && store.users[email]) {
    store.users[email] = updates;
  }
}

function createUserActivityTouchStore({
  localFilePath = null,
  debounceMs = Math.max(0, Number(process.env.STORE_WRITE_DEBOUNCE_MS ?? 2500)),
} = {}) {
  /** @type {import('pg').Pool | null} */
  let pool = null;
  let usingPostgres = false;
  /** @type {Map<string, { lastSeenAt: string, increments: FeatureUsageIncrements }>} */
  const pendingByEmail = new Map();
  let debounceTimer = null;
  let debouncePending = false;

  function configure({ pool: nextPool = null, usingPostgres: nextUsingPostgres = false } = {}) {
    pool = nextPool;
    usingPostgres = Boolean(nextUsingPostgres);
  }

  async function initTable() {
    if (!usingPostgres || !pool) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        email TEXT PRIMARY KEY,
        last_seen_at TIMESTAMPTZ NOT NULL,
        feature_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS llh_user_activity_touch_last_seen_idx
       ON ${TABLE_NAME} (last_seen_at DESC)`,
    );
  }

  function readLocalFile() {
    if (!localFilePath) return {};
    try {
      if (!fs.existsSync(localFilePath)) return {};
      const parsed = JSON.parse(fs.readFileSync(localFilePath, "utf8"));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeLocalFile(rows) {
    if (!localFilePath) return;
    try {
      fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
      fs.writeFileSync(localFilePath, JSON.stringify(rows, null, 2));
    } catch (error) {
      console.warn("[user-activity-touch] local file write failed:", error.message);
    }
  }

  async function persistPendingEntry(email, entry) {
    const cleanEmail = normalizeEmailLocal(email);
    if (!cleanEmail || !entry) return;
    if (usingPostgres && pool) {
      await upsertActivityTouchPostgres(pool, cleanEmail, entry.lastSeenAt, entry.increments);
      return;
    }
    const raw = readLocalFile();
    const prev = raw[cleanEmail] && typeof raw[cleanEmail] === "object" ? raw[cleanEmail] : {};
    const prevSeenMs = parseTimeMs(prev.lastSeenAt);
    const nextSeenMs = parseTimeMs(entry.lastSeenAt);
    const mergedIncrements = { ...(prev.featureUsage || {}) };
    Object.entries(entry.increments || {}).forEach(([name, count]) => {
      const inc = Number(count);
      if (!name || !Number.isFinite(inc) || inc <= 0) return;
      mergedIncrements[name] = Number(mergedIncrements[name] || 0) + inc;
    });
    raw[cleanEmail] = {
      lastSeenAt: nextSeenMs >= prevSeenMs ? entry.lastSeenAt : prev.lastSeenAt,
      featureUsage: mergedIncrements,
      updatedAt: new Date().toISOString(),
    };
    writeLocalFile(raw);
  }

  async function flushPending() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (!debouncePending && pendingByEmail.size === 0) return;
    debouncePending = false;
    const batch = new Map(pendingByEmail);
    pendingByEmail.clear();
    for (const [email, entry] of batch.entries()) {
      try {
        // eslint-disable-next-line no-await-in-loop -- one row per active user per debounce window
        await persistPendingEntry(email, entry);
      } catch (error) {
        console.warn("[user-activity-touch] persist failed:", error.message || error);
      }
    }
  }

  function scheduleFlush() {
    if (debounceTimer) return;
    debouncePending = true;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      flushPending().catch(() => {});
    }, debounceMs);
  }

  /**
   * Queue durable activity touch (debounced). Memory should already be updated by caller.
   * @param {{ email: string, lastSeenAt: string, eventName: string }} touch
   */
  function scheduleActivityTouch({ email, lastSeenAt, eventName }) {
    if (!isUserActivityTouchPersistEnabled()) return;
    const cleanEmail = normalizeEmailLocal(email);
    const name = String(eventName || "").trim();
    if (!cleanEmail || !name) return;
    const seenIso = String(lastSeenAt || new Date().toISOString());
    let entry = pendingByEmail.get(cleanEmail);
    if (!entry) {
      entry = { lastSeenAt: seenIso, increments: {} };
      pendingByEmail.set(cleanEmail, entry);
    }
    const seenMs = parseTimeMs(seenIso);
    if (seenMs >= parseTimeMs(entry.lastSeenAt)) entry.lastSeenAt = seenIso;
    entry.increments[name] = Number(entry.increments[name] || 0) + 1;
    scheduleFlush();
  }

  /**
   * Merge authoritative touch rows into store.users without downgrading newer blob fields.
   * @param {Record<string, unknown>} store
   */
  async function hydrateIntoStore(store) {
    if (!store || typeof store !== "object") return;
    if (!isUserActivityTouchPersistEnabled()) return;
    store.users = store.users || {};

    if (usingPostgres && pool) {
      const result = await pool.query(
        `SELECT email, last_seen_at, feature_usage FROM ${TABLE_NAME}`,
      );
      result.rows.forEach((row) => {
        const email = normalizeEmailLocal(row.email);
        if (!email) return;
        const user = store.users[email] || store.users[row.email] || { email };
        const tableSeen = row.last_seen_at instanceof Date
          ? row.last_seen_at.toISOString()
          : String(row.last_seen_at || "");
        const blobMs = parseTimeMs(user.lastSeenAt);
        const tableMs = parseTimeMs(tableSeen);
        if (tableMs > blobMs) user.lastSeenAt = tableSeen;
        const tableUsage = row.feature_usage && typeof row.feature_usage === "object"
          ? row.feature_usage
          : {};
        user.featureUsage = mergeFeatureUsageMax(user.featureUsage, tableUsage);
        store.users[email] = user;
      });
      return;
    }

    const raw = readLocalFile();
    Object.entries(raw).forEach(([email, row]) => {
      if (!row || typeof row !== "object") return;
      const cleanEmail = normalizeEmailLocal(email);
      const user = store.users[cleanEmail] || store.users[email] || { email: cleanEmail };
      const tableMs = parseTimeMs(row.lastSeenAt);
      const blobMs = parseTimeMs(user.lastSeenAt);
      if (tableMs > blobMs) user.lastSeenAt = row.lastSeenAt;
      user.featureUsage = mergeFeatureUsageMax(user.featureUsage, row.featureUsage);
      store.users[cleanEmail] = user;
    });
  }

  return {
    configure,
    initTable,
    scheduleActivityTouch,
    hydrateIntoStore,
    flushPending,
    mergeTouchIntoLocalUser,
    isEnabled: isUserActivityTouchPersistEnabled,
  };
}

module.exports = {
  createUserActivityTouchStore,
  isUserActivityTouchPersistEnabled,
  TABLE_NAME,
};
