/**
 * Dedicated lastSeenAt / featureUsage persistence — isolated from llh_store JSONB.
 *
 * High-volume logged-in page_view telemetry updates memory on every event (for Admin
 * "online now") but persists via small row upserts here instead of ~45MB full-store writes.
 */
const fs = require("node:fs");
const path = require("node:path");

const TABLE_NAME = "llh_user_activity_touch";
const PERSIST_RETRY_BACKOFF_MS = [50, 150, 400];
const MAX_PERSIST_RETRIES = 3;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
 * @param {FeatureUsageIncrements} increments
 * @returns {Record<string, number>}
 */
function normalizeIncrements(increments) {
  const out = {};
  Object.entries(increments || {}).forEach(([name, count]) => {
    const n = Number(count);
    if (name && Number.isFinite(n) && n > 0) out[name] = n;
  });
  return out;
}

/**
 * Deltas still needed so a retry after a committed-but-unacknowledged write does not double-count.
 *
 * @param {Record<string, unknown>} usageSnapshot feature_usage before this flush began
 * @param {Record<string, unknown>} currentUsage feature_usage read before this attempt
 * @param {FeatureUsageIncrements} requestedIncrements totals queued for this flush
 * @returns {FeatureUsageIncrements}
 */
function computeRemainingIncrements(usageSnapshot, currentUsage, requestedIncrements) {
  const snapshot = usageSnapshot && typeof usageSnapshot === "object" ? usageSnapshot : {};
  const current = currentUsage && typeof currentUsage === "object" ? currentUsage : {};
  const remaining = {};
  Object.entries(requestedIncrements || {}).forEach(([name, count]) => {
    const want = Number(count);
    if (!name || !Number.isFinite(want) || want <= 0) return;
    const applied = Number(current[name] || 0) - Number(snapshot[name] || 0);
    const left = want - (Number.isFinite(applied) ? applied : 0);
    if (left > 0) remaining[name] = left;
  });
  return remaining;
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} email
 * @returns {Promise<{ last_seen_at: string, feature_usage: Record<string, number> } | null>}
 */
async function loadActivityTouchRowPostgres(pool, email) {
  const cleanEmail = normalizeEmailLocal(email);
  if (!cleanEmail || !pool) return null;
  const result = await pool.query(
    `SELECT last_seen_at, feature_usage FROM ${TABLE_NAME} WHERE email = $1`,
    [cleanEmail],
  );
  const row = result.rows?.[0];
  if (!row) return null;
  const lastSeen = row.last_seen_at instanceof Date
    ? row.last_seen_at.toISOString()
    : String(row.last_seen_at || "");
  const usage = row.feature_usage && typeof row.feature_usage === "object" ? row.feature_usage : {};
  return { last_seen_at: lastSeen, feature_usage: usage };
}

/**
 * One upsert applies last_seen_at + feature_usage deltas exactly once (no INSERT+UPDATE double count).
 *
 * @param {import('pg').Pool} pool
 * @param {string} email
 * @param {string} lastSeenAtIso
 * @param {FeatureUsageIncrements} increments
 */
async function upsertActivityTouchPostgres(pool, email, lastSeenAtIso, increments) {
  const cleanEmail = normalizeEmailLocal(email);
  if (!cleanEmail) return;
  const delta = normalizeIncrements(increments);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO ${TABLE_NAME} (email, last_seen_at, feature_usage, updated_at)
       VALUES ($1, $2::timestamptz, $3::jsonb, NOW())
       ON CONFLICT (email) DO UPDATE SET
         last_seen_at = GREATEST(${TABLE_NAME}.last_seen_at, EXCLUDED.last_seen_at),
         feature_usage = (
           SELECT COALESCE(jsonb_object_agg(merged.key, to_jsonb(merged.total)), '{}'::jsonb)
           FROM (
             SELECT k AS key,
               COALESCE((${TABLE_NAME}.feature_usage->>k)::int, 0)
               + COALESCE((EXCLUDED.feature_usage->>k)::int, 0) AS total
             FROM (
               SELECT jsonb_object_keys(
                 COALESCE(${TABLE_NAME}.feature_usage, '{}'::jsonb) || EXCLUDED.feature_usage
               ) AS k
             ) keys
           ) merged
         ),
         updated_at = NOW()`,
      [cleanEmail, lastSeenAtIso, JSON.stringify(delta)],
    );
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * @param {{ lastSeenAt: string, increments: FeatureUsageIncrements }} target
 * @param {{ lastSeenAt: string, increments: FeatureUsageIncrements }} source
 */
function mergePendingEntries(target, source) {
  if (!source) return target;
  const seenMs = parseTimeMs(source.lastSeenAt);
  if (seenMs >= parseTimeMs(target.lastSeenAt)) target.lastSeenAt = source.lastSeenAt;
  Object.entries(source.increments || {}).forEach(([name, count]) => {
    const inc = Number(count);
    if (!name || !Number.isFinite(inc) || inc <= 0) return;
    target.increments[name] = Number(target.increments[name] || 0) + inc;
  });
  return target;
}

function createUserActivityTouchStore({
  localFilePath = null,
  debounceMs = Math.max(0, Number(process.env.STORE_WRITE_DEBOUNCE_MS ?? 2500)),
  persistMinIntervalMs = Math.max(
    0,
    Number(process.env.LAST_SEEN_STORE_PERSIST_MIN_INTERVAL_MS ?? 60 * 1000),
  ),
} = {}) {
  /** @type {import('pg').Pool | null} */
  let pool = null;
  let usingPostgres = false;
  /** When true, never write touch data to local JSON (production postgres mode). */
  let forbidLocalFileFallback = false;
  /** @type {Map<string, { lastSeenAt: string, increments: FeatureUsageIncrements }>} */
  const pendingByEmail = new Map();
  /** @type {Map<string, { lastSeenAt: string, increments: FeatureUsageIncrements }>} */
  const inFlightByEmail = new Map();
  /** @type {Map<string, number>} */
  const lastPersistScheduledAtByEmail = new Map();
  let debounceTimer = null;
  let debouncePending = false;
  let retryFlushTimer = null;

  function configure({
    pool: nextPool = null,
    usingPostgres: nextUsingPostgres = false,
    forbidLocalFileFallback: nextForbidLocal = false,
  } = {}) {
    pool = nextPool;
    usingPostgres = Boolean(nextUsingPostgres);
    forbidLocalFileFallback = Boolean(nextForbidLocal);
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
    if (!localFilePath || forbidLocalFileFallback) return {};
    try {
      if (!fs.existsSync(localFilePath)) return {};
      const parsed = JSON.parse(fs.readFileSync(localFilePath, "utf8"));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeLocalFile(rows) {
    if (!localFilePath || forbidLocalFileFallback) return;
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
    if (usingPostgres) {
      if (!pool) {
        const err = new Error("Postgres pool unavailable for user activity touch");
        err.code = "activity_touch_postgres_unavailable";
        throw err;
      }
      if (!entry.usageSnapshot) {
        const baseline = await loadActivityTouchRowPostgres(pool, cleanEmail);
        entry.usageSnapshot = baseline?.feature_usage && typeof baseline.feature_usage === "object"
          ? { ...baseline.feature_usage }
          : {};
      }
      const currentRow = await loadActivityTouchRowPostgres(pool, cleanEmail);
      const currentUsage = currentRow?.feature_usage || {};
      const delta = computeRemainingIncrements(
        entry.usageSnapshot,
        currentUsage,
        entry.increments,
      );
      const targetSeenMs = parseTimeMs(entry.lastSeenAt);
      const currentSeenMs = parseTimeMs(currentRow?.last_seen_at);
      if (Object.keys(delta).length === 0 && targetSeenMs <= currentSeenMs) return;
      await upsertActivityTouchPostgres(pool, cleanEmail, entry.lastSeenAt, delta);
      return;
    }
    if (forbidLocalFileFallback) {
      const err = new Error("Local file fallback disabled for user activity touch");
      err.code = "activity_touch_local_fallback_forbidden";
      throw err;
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

  async function persistWithRetries(email, entry) {
    let lastError;
    for (let attempt = 0; attempt <= MAX_PERSIST_RETRIES; attempt += 1) {
      try {
        await persistPendingEntry(email, entry);
        return;
      } catch (error) {
        lastError = error;
        if (attempt >= MAX_PERSIST_RETRIES) break;
        await sleep(PERSIST_RETRY_BACKOFF_MS[Math.min(attempt, PERSIST_RETRY_BACKOFF_MS.length - 1)]);
      }
    }
    throw lastError;
  }

  function requeueFailed(email, entry) {
    const cleanEmail = normalizeEmailLocal(email);
    if (!cleanEmail || !entry) return;
    const existing = pendingByEmail.get(cleanEmail);
    if (existing) {
      mergePendingEntries(existing, entry);
    } else {
      pendingByEmail.set(cleanEmail, {
        lastSeenAt: entry.lastSeenAt,
        increments: { ...entry.increments },
        usageSnapshot: entry.usageSnapshot ? { ...entry.usageSnapshot } : undefined,
      });
    }
  }

  function scheduleRetryFlush() {
    if (retryFlushTimer) return;
    retryFlushTimer = setTimeout(() => {
      retryFlushTimer = null;
      flushPending().catch(() => {});
    }, PERSIST_RETRY_BACKOFF_MS[0]);
  }

  async function flushPending() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    debouncePending = false;

    const emails = new Set([...inFlightByEmail.keys(), ...pendingByEmail.keys()]);
    for (const email of emails) {
      if (inFlightByEmail.has(email)) continue;
      const pending = pendingByEmail.get(email);
      if (!pending) continue;
      pendingByEmail.delete(email);
      inFlightByEmail.set(email, {
        lastSeenAt: pending.lastSeenAt,
        increments: { ...pending.increments },
        usageSnapshot: pending.usageSnapshot ? { ...pending.usageSnapshot } : undefined,
      });
    }

    for (const [email, entry] of [...inFlightByEmail.entries()]) {
      try {
        await persistWithRetries(email, entry);
        inFlightByEmail.delete(email);
      } catch (error) {
        console.warn("[user-activity-touch] persist failed after retries:", error.message || error);
        inFlightByEmail.delete(email);
        requeueFailed(email, entry);
        scheduleRetryFlush();
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
   * Queue durable activity touch (debounced per user). Memory should already be updated by caller.
   * @param {{ email: string, lastSeenAt: string, eventName: string }} touch
   */
  function scheduleActivityTouch({ email, lastSeenAt, eventName }) {
    if (!isUserActivityTouchPersistEnabled()) return;
    const cleanEmail = normalizeEmailLocal(email);
    const name = String(eventName || "").trim();
    if (!cleanEmail || !name) return;
    const now = Date.now();
    const lastScheduled = lastPersistScheduledAtByEmail.get(cleanEmail) || 0;
    if (
      persistMinIntervalMs > 0
      && now - lastScheduled < persistMinIntervalMs
    ) {
      return;
    }
    lastPersistScheduledAtByEmail.set(cleanEmail, now);

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

    const applyRow = (rowEmail, lastSeenAt, featureUsage) => {
      const cleanEmail = normalizeEmailLocal(rowEmail);
      if (!cleanEmail) return;
      let user = store.users[cleanEmail];
      if (!user) {
        const altKey = Object.keys(store.users).find(
          (key) => normalizeEmailLocal(key) === cleanEmail,
        );
        user = altKey ? store.users[altKey] : { email: cleanEmail };
      }
      if (!user.email) user.email = cleanEmail;
      const tableMs = parseTimeMs(lastSeenAt);
      const blobMs = parseTimeMs(user.lastSeenAt);
      if (tableMs > blobMs) user.lastSeenAt = lastSeenAt;
      user.featureUsage = mergeFeatureUsageMax(user.featureUsage, featureUsage);
      store.users[cleanEmail] = user;
      if (rowEmail !== cleanEmail && store.users[rowEmail] === user) {
        delete store.users[rowEmail];
      }
    };

    if (usingPostgres && pool) {
      const result = await pool.query(
        `SELECT email, last_seen_at, feature_usage FROM ${TABLE_NAME}`,
      );
      result.rows.forEach((row) => {
        const tableSeen = row.last_seen_at instanceof Date
          ? row.last_seen_at.toISOString()
          : String(row.last_seen_at || "");
        const tableUsage = row.feature_usage && typeof row.feature_usage === "object"
          ? row.feature_usage
          : {};
        applyRow(row.email, tableSeen, tableUsage);
      });
      return;
    }

    if (forbidLocalFileFallback) return;

    const raw = readLocalFile();
    Object.entries(raw).forEach(([email, row]) => {
      if (!row || typeof row !== "object") return;
      applyRow(email, row.lastSeenAt, row.featureUsage);
    });
  }

  return {
    configure,
    initTable,
    scheduleActivityTouch,
    hydrateIntoStore,
    flushPending,
    isEnabled: isUserActivityTouchPersistEnabled,
  };
}

module.exports = {
  createUserActivityTouchStore,
  isUserActivityTouchPersistEnabled,
  upsertActivityTouchPostgres,
  loadActivityTouchRowPostgres,
  computeRemainingIncrements,
  mergeFeatureUsageMax,
  TABLE_NAME,
};
