/**
 * Dedicated lastSeenAt / featureUsage persistence — isolated from llh_store JSONB.
 *
 * High-volume logged-in page_view telemetry updates memory on every event (for Admin
 * "online now") but persists via small row upserts here instead of ~45MB full-store writes.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const TABLE_NAME = "llh_user_activity_touch";
const TABLE_BATCH_NAME = "llh_user_activity_touch_batch";
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

function newTouchOperationId() {
  return `touch-${crypto.randomUUID()}`;
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string} email
 * @param {string} lastSeenAtIso
 * @param {FeatureUsageIncrements} increments
 */
async function mergeActivityTouchRowPostgres(db, email, lastSeenAtIso, increments) {
  const cleanEmail = normalizeEmailLocal(email);
  const delta = normalizeIncrements(increments);
  if (!cleanEmail || Object.keys(delta).length === 0) return;
  await db.query(
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
}

/**
 * Durable batch ledger: each operation_id applies feature deltas at most once per process retry.
 *
 * @param {import('pg').Pool} pool
 * @param {string} operationId
 * @param {string} email
 * @param {string} lastSeenAtIso
 * @param {FeatureUsageIncrements} increments
 * @returns {Promise<{ alreadyApplied: boolean, skippedEmpty?: boolean }>}
 */
async function applyActivityTouchBatchPostgres(pool, operationId, email, lastSeenAtIso, increments) {
  const cleanEmail = normalizeEmailLocal(email);
  const opId = String(operationId || "").trim();
  const delta = normalizeIncrements(increments);
  if (!cleanEmail || !opId) return { alreadyApplied: false, skippedEmpty: true };
  if (Object.keys(delta).length === 0) return { alreadyApplied: false, skippedEmpty: true };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ins = await client.query(
      `INSERT INTO ${TABLE_BATCH_NAME} (operation_id, email, last_seen_at, feature_usage)
       VALUES ($1, $2, $3::timestamptz, $4::jsonb)
       ON CONFLICT (operation_id) DO NOTHING
       RETURNING operation_id`,
      [opId, cleanEmail, lastSeenAtIso, JSON.stringify(delta)],
    );
    if (!ins.rows?.length) {
      await client.query("COMMIT");
      return { alreadyApplied: true };
    }
    await mergeActivityTouchRowPostgres(client, cleanEmail, lastSeenAtIso, delta);
    await client.query("COMMIT");
    return { alreadyApplied: false };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} email
 * @param {string} lastSeenAtIso
 * @param {FeatureUsageIncrements} increments
 */
async function upsertActivityTouchPostgres(pool, email, lastSeenAtIso, increments) {
  await applyActivityTouchBatchPostgres(
    pool,
    newTouchOperationId(),
    email,
    lastSeenAtIso,
    increments,
  );
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
 * @param {{ operationId: string, lastSeenAt: string, increments: FeatureUsageIncrements } | undefined} target
 * @param {{ operationId: string, lastSeenAt: string, increments: FeatureUsageIncrements }} source
 */
function mergeRequeueBatch(target, source) {
  if (!source?.operationId) return target;
  if (!target) {
    return {
      operationId: source.operationId,
      lastSeenAt: source.lastSeenAt,
      increments: { ...source.increments },
    };
  }
  const seenMs = parseTimeMs(source.lastSeenAt);
  if (seenMs >= parseTimeMs(target.lastSeenAt)) target.lastSeenAt = source.lastSeenAt;
  if (target.operationId !== source.operationId) {
    mergePendingIncrements(target.increments, source.increments);
    return target;
  }
  mergePendingIncrements(target.increments, source.increments);
  return target;
}

function mergePendingIncrements(target, source) {
  if (!source) return target;
  Object.entries(source).forEach(([name, count]) => {
    const inc = Number(count);
    if (!name || !Number.isFinite(inc) || inc <= 0) return;
    target[name] = Number(target[name] || 0) + inc;
  });
  return target;
}

function mergePendingEntries(target, source) {
  if (!source) return target;
  const seenMs = parseTimeMs(source.lastSeenAt);
  if (seenMs >= parseTimeMs(target.lastSeenAt)) target.lastSeenAt = source.lastSeenAt;
  mergePendingIncrements(target.increments, source.increments);
  return target;
}

/**
 * @param {{ lastSeenAt: string, increments: FeatureUsageIncrements, requeue?: { operationId: string, lastSeenAt: string, increments: FeatureUsageIncrements } }} pending
 * @returns {Array<{ operationId: string, lastSeenAt: string, increments: FeatureUsageIncrements }>}
 */
function collectFlushJobs(pending) {
  /** @type {Array<{ operationId: string, lastSeenAt: string, increments: FeatureUsageIncrements }>} */
  const jobs = [];
  if (pending.requeue?.operationId) {
    const inc = normalizeIncrements(pending.requeue.increments);
    if (Object.keys(inc).length) {
      jobs.push({
        operationId: pending.requeue.operationId,
        lastSeenAt: pending.requeue.lastSeenAt,
        increments: inc,
      });
    }
  }
  const fresh = normalizeIncrements(pending.increments);
  if (Object.keys(fresh).length) {
    jobs.push({
      operationId: newTouchOperationId(),
      lastSeenAt: pending.lastSeenAt,
      increments: fresh,
    });
  }
  return jobs;
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
  /** @type {Map<string, boolean>} */
  const inFlightByEmail = new Map();
  /** @type {Map<string, number>} */
  const lastPersistScheduledAtByEmail = new Map();
  let debounceTimer = null;
  let debouncePending = false;
  let retryFlushTimer = null;
  let flushInProgress = false;
  let flushRunAgain = false;
  /** @type {Promise<void> | null} */
  let flushPromise = null;

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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE_BATCH_NAME} (
        operation_id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL,
        feature_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS llh_user_activity_touch_batch_email_idx
       ON ${TABLE_BATCH_NAME} (email)`,
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

  async function persistFlushJob(email, job) {
    const cleanEmail = normalizeEmailLocal(email);
    if (!cleanEmail || !job) return;
    if (usingPostgres) {
      if (!pool) {
        const err = new Error("Postgres pool unavailable for user activity touch");
        err.code = "activity_touch_postgres_unavailable";
        throw err;
      }
      const opId = String(job.operationId || "").trim() || newTouchOperationId();
      const result = await applyActivityTouchBatchPostgres(
        pool,
        opId,
        cleanEmail,
        job.lastSeenAt,
        job.increments,
      );
      if (result.skippedEmpty) return;
      if (result.alreadyApplied) return;
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
    const nextSeenMs = parseTimeMs(job.lastSeenAt);
    const mergedIncrements = { ...(prev.featureUsage || {}) };
    mergePendingIncrements(mergedIncrements, job.increments);
    raw[cleanEmail] = {
      lastSeenAt: nextSeenMs >= prevSeenMs ? job.lastSeenAt : prev.lastSeenAt,
      featureUsage: mergedIncrements,
      updatedAt: new Date().toISOString(),
    };
    writeLocalFile(raw);
  }

  async function persistWithRetries(email, job) {
    let lastError;
    for (let attempt = 0; attempt <= MAX_PERSIST_RETRIES; attempt += 1) {
      try {
        await persistFlushJob(email, job);
        return;
      } catch (error) {
        lastError = error;
        if (attempt >= MAX_PERSIST_RETRIES) break;
        await sleep(PERSIST_RETRY_BACKOFF_MS[Math.min(attempt, PERSIST_RETRY_BACKOFF_MS.length - 1)]);
      }
    }
    throw lastError;
  }

  function requeueFailed(email, job) {
    const cleanEmail = normalizeEmailLocal(email);
    if (!cleanEmail || !job?.operationId) return;
    const failedBatch = {
      operationId: job.operationId,
      lastSeenAt: job.lastSeenAt,
      increments: { ...job.increments },
    };
    const existing = pendingByEmail.get(cleanEmail);
    if (existing) {
      existing.requeue = mergeRequeueBatch(existing.requeue, failedBatch);
      const seenMs = parseTimeMs(job.lastSeenAt);
      if (seenMs >= parseTimeMs(existing.lastSeenAt)) existing.lastSeenAt = job.lastSeenAt;
    } else {
      pendingByEmail.set(cleanEmail, {
        lastSeenAt: job.lastSeenAt,
        increments: {},
        requeue: failedBatch,
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

  async function runFlushPass() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    debouncePending = false;

    let progressed = false;
    for (const email of [...pendingByEmail.keys()]) {
      if (inFlightByEmail.has(email)) continue;
      const pending = pendingByEmail.get(email);
      if (!pending) continue;
      const jobs = collectFlushJobs(pending);
      if (!jobs.length) {
        pendingByEmail.delete(email);
        continue;
      }
      pendingByEmail.delete(email);
      inFlightByEmail.set(email, true);
      progressed = true;
      try {
        for (const job of jobs) {
          try {
            await persistWithRetries(email, job);
          } catch (error) {
            console.warn("[user-activity-touch] persist failed after retries:", error.message || error);
            requeueFailed(email, job);
            scheduleRetryFlush();
          }
        }
      } finally {
        inFlightByEmail.delete(email);
      }
    }
    return progressed;
  }

  async function flushPending() {
    if (flushInProgress) {
      flushRunAgain = true;
      return flushPromise || Promise.resolve();
    }
    flushInProgress = true;
    flushPromise = (async () => {
      try {
        do {
          flushRunAgain = false;
          let progressed = false;
          do {
            progressed = await runFlushPass();
          } while (progressed);
        } while (flushRunAgain || pendingByEmail.size > 0);
      } finally {
        flushInProgress = false;
        flushPromise = null;
      }
    })();
    return flushPromise;
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
      entry = { lastSeenAt: seenIso, increments: {}, requeue: undefined };
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
      let altKey = null;
      if (!user) {
        altKey = Object.keys(store.users).find(
          (key) => normalizeEmailLocal(key) === cleanEmail,
        ) || null;
        user = altKey ? store.users[altKey] : { email: cleanEmail };
      }
      if (!user.email) user.email = cleanEmail;
      const tableMs = parseTimeMs(lastSeenAt);
      const blobMs = parseTimeMs(user.lastSeenAt);
      if (tableMs > blobMs) user.lastSeenAt = lastSeenAt;
      user.featureUsage = mergeFeatureUsageMax(user.featureUsage, featureUsage);
      store.users[cleanEmail] = user;
      if (altKey && altKey !== cleanEmail) delete store.users[altKey];
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
  applyActivityTouchBatchPostgres,
  loadActivityTouchRowPostgres,
  mergeFeatureUsageMax,
  collectFlushJobs,
  mergeRequeueBatch,
  TABLE_NAME,
  TABLE_BATCH_NAME,
};
