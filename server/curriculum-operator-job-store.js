/**
 * Dedicated curriculum-operator job persistence — Stage 1 offload from hot llh_store.
 *
 * Why: curriculumOperatorJobs (~4.58 MB / 53 jobs in production) was rewritten on every
 * full-store upsert. Historical completed/failed/cancelled jobs dominate that mass via
 * lessonResults. This module stores FULL job payloads in llh_curriculum_operator_jobs
 * (or a local side file) and lets the hot blob keep only a capped compatibility view.
 *
 * Safety:
 * - Dual-read: dedicated first, fall back to llh_store bag.
 * - Dual-write: full job → dedicated; capped bag → llh_store ONLY after verified success.
 * - Cap NEVER drops active/resumable jobs (planned|awaiting_confirm|running|paused).
 * - backendMode (postgres|local-file|memory) is separate from readiness (isReady).
 * - Postgres mode NEVER uses local side-file as a durability substitute.
 * - Fail-closed when dedicated Postgres persistence is required and writes fail / not ready.
 * - Does not mutate curriculum, users, billing, programData, or enrichmentPublishHistory.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const jobApi = require("../scripts/curriculum-operator-job.js");
const schema = require("../scripts/curriculum-operator-schema.js");

const ACTIVE_STATUSES = Object.freeze(["planned", "awaiting_confirm", "running", "paused"]);
const TERMINAL_STATUSES = Object.freeze(["completed", "completed_with_gaps", "failed", "cancelled"]);
/** Max terminal job stubs retained in the hot llh_store compatibility bag. */
const HOT_STORE_RECENT_TERMINAL_LIMIT = 10;
const HOT_STORE_LOG_KEEP = 5;

function byteLen(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function isActiveStatus(status) {
  return ACTIVE_STATUSES.includes(String(status || "").toLowerCase());
}

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(String(status || "").toLowerCase());
}

/**
 * Slim representation for terminal jobs inside llh_store.
 * Drops lessonResults / heavy logs — those live in dedicated storage.
 */
function toHotStoreStub(job) {
  const normalized = jobApi.normalizeOperatorJob(job || {});
  return {
    id: normalized.id,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    createdBy: normalized.createdBy,
    status: normalized.status,
    phase: normalized.phase,
    mutationsEnabled: normalized.mutationsEnabled === true,
    publishEnabled: false,
    progress: normalized.progress,
    costCounters: normalized.costCounters,
    ownerSummary: schema.text(normalized.ownerSummary, 500),
    command: normalized.command && typeof normalized.command === "object"
      ? {
        intent: normalized.command.intent || null,
        selection: normalized.command.selection || null,
        completion: normalized.command.completion || null,
      }
      : null,
    lessonResults: [],
    log: schema.asArray(normalized.log).slice(-HOT_STORE_LOG_KEEP).map((entry) => ({
      at: entry.at,
      level: entry.level,
      message: schema.text(entry.message, 200),
      lessonId: entry.lessonId || null,
    })),
    hotStoreStub: true,
  };
}

/**
 * Build the bounded compatibility bag for llh_store.
 * - All active/resumable jobs retained in FULL form.
 * - Terminal jobs: newest HOT_STORE_RECENT_TERMINAL_LIMIT as stubs only.
 */
function buildHotStoreJobBag(jobsInput, options = {}) {
  const recentTerminalLimit = Math.max(
    0,
    Number(options.recentTerminalLimit ?? HOT_STORE_RECENT_TERMINAL_LIMIT) || 0,
  );
  const bag = jobApi.normalizeOperatorJobStore(
    Array.isArray(jobsInput) ? { jobs: jobsInput } : (jobsInput || {}),
  );
  const active = [];
  const terminal = [];
  for (const job of bag.jobs) {
    if (isActiveStatus(job.status)) active.push(job);
    else if (isTerminalStatus(job.status)) terminal.push(job);
    else active.push(job); // unknown → treat as active (fail-safe keep)
  }
  terminal.sort((a, b) => (Date.parse(b.updatedAt || "") || 0) - (Date.parse(a.updatedAt || "") || 0));
  const keptTerminal = terminal.slice(0, recentTerminalLimit).map(toHotStoreStub);
  const next = jobApi.normalizeOperatorJobStore({
    jobs: [...active, ...keptTerminal],
    updatedAt: bag.updatedAt || jobApi.nowIso(),
  });
  // normalizeOperatorJob strips unknown fields; re-apply stub marker for consumers/tests.
  const stubIds = new Set(keptTerminal.map((j) => j.id));
  for (const job of next.jobs) {
    if (stubIds.has(job.id)) job.hotStoreStub = true;
  }
  return {
    bag: next,
    stats: {
      inputCount: bag.jobs.length,
      activeKeptFull: active.length,
      terminalStubbed: keptTerminal.length,
      terminalDroppedFromHotStore: Math.max(0, terminal.length - keptTerminal.length),
      bytesBefore: byteLen(bag),
      bytesAfter: byteLen(next),
    },
  };
}

/**
 * Create dedicated operator-job persistence.
 *
 * backendMode (intended durable target) is separate from readiness:
 * - "postgres": production / DATABASE_PROVIDER=postgres — NEVER uses localFilePath
 * - "local-file": intentional local-json/dev/test only
 * - "memory": in-process only (tests)
 *
 * Hot-store stubbing is allowed only when canSafelyCapHotStore() is true
 * (intended backend ready AND table/file initialized). Postgres unavailability
 * must preserve full llh_store jobs — never silently substitute the side file.
 */
function createCurriculumOperatorJobStore({ localFilePath = null } = {}) {
  let pool = null;
  /** @type {"postgres"|"local-file"|"memory"} */
  let mode = localFilePath ? "local-file" : "memory";
  let tableReady = false;
  let initialized = false;
  /** @type {Map<string, object>} */
  const memory = new Map();

  function resolveLocalFileAllowed() {
    // Local side-file is ONLY valid when intentionally not in postgres mode.
    return Boolean(localFilePath) && mode === "local-file";
  }

  /**
   * @param {{ pool?: object|null, intendedPostgres?: boolean, usingPostgres?: boolean }} [opts]
   * intendedPostgres / usingPostgres select MODE, not readiness.
   * Passing intendedPostgres:true keeps postgres mode even when pool is null/down.
   */
  function configure({
    pool: nextPool = null,
    intendedPostgres,
    usingPostgres,
  } = {}) {
    pool = nextPool;
    const wantPostgres = intendedPostgres !== undefined
      ? Boolean(intendedPostgres)
      : usingPostgres !== undefined
        ? Boolean(usingPostgres)
        : mode === "postgres";

    if (wantPostgres) {
      mode = "postgres";
      // Temporary unavailability must NOT flip to local-file.
      if (!pool) {
        tableReady = false;
        initialized = false;
      }
      return;
    }

    mode = localFilePath ? "local-file" : "memory";
    tableReady = false;
    // local/memory readiness is established by loadFromStorage
  }

  function backendMode() {
    return mode;
  }

  function isReady() {
    if (mode === "postgres") return Boolean(pool && tableReady && initialized);
    if (mode === "local-file") return Boolean(resolveLocalFileAllowed() && initialized);
    return initialized === true;
  }

  /**
   * Stage 1: historical hot-store cutover is ALWAYS disabled.
   * Stage 2 (explicit migration tooling) is the only authorized path to enable cutover
   * after dry-run → backup → migrate → verify. Normal runtime must never flip this.
   */
  function isHotStoreCutoverEnabled() {
    return false;
  }

  /** True when dedicated backend can accept verified full-job writes (not the same as cutover). */
  function canSafelyPersistDedicated() {
    return isReady();
  }

  /**
   * True only when dedicated persistence is ready AND Stage-2 cutover has been authorized.
   * Stage 1 always returns false.
   */
  function canSafelyCapHotStore() {
    return canSafelyPersistDedicated() && isHotStoreCutoverEnabled();
  }

  /** @deprecated Prefer canSafelyPersistDedicated / canSafelyCapHotStore. */
  function isConfigured() {
    return canSafelyPersistDedicated();
  }

  function requiresDurableBackend() {
    return mode === "postgres";
  }

  function readLocalFile() {
    if (!resolveLocalFileAllowed()) return {};
    try {
      if (!fs.existsSync(localFilePath)) return {};
      const parsed = JSON.parse(fs.readFileSync(localFilePath, "utf8"));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeLocalFile() {
    // HARD GUARD: never write side-file while intended backend is postgres.
    if (!resolveLocalFileAllowed()) return;
    try {
      fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
      const out = {};
      for (const [id, job] of memory.entries()) out[id] = job;
      fs.writeFileSync(localFilePath, JSON.stringify({ jobs: out, updatedAt: jobApi.nowIso() }));
    } catch (error) {
      console.warn("[curriculum-operator-job-store] local file write failed:", error.message);
    }
  }

  async function initTable() {
    if (mode !== "postgres") {
      tableReady = false;
      return { ok: true, backend: mode };
    }
    if (!pool) {
      tableReady = false;
      initialized = false;
      return { ok: false, backend: "postgres", reason: "pool_unavailable" };
    }
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS llh_curriculum_operator_jobs (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_by TEXT NOT NULL DEFAULT '',
          phase INTEGER NOT NULL DEFAULT 1,
          data JSONB NOT NULL
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS llh_curriculum_operator_jobs_status_updated_idx
        ON llh_curriculum_operator_jobs (status, updated_at DESC)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS llh_curriculum_operator_jobs_updated_idx
        ON llh_curriculum_operator_jobs (updated_at DESC)
      `);
      tableReady = true;
      return { ok: true, backend: "postgres" };
    } catch (error) {
      tableReady = false;
      initialized = false;
      throw error;
    }
  }

  async function loadFromStorage() {
    memory.clear();
    if (mode === "postgres") {
      if (!pool || !tableReady) {
        initialized = false;
        return { loaded: 0, backend: "postgres", ready: false };
      }
      const result = await pool.query(
        "SELECT id, data FROM llh_curriculum_operator_jobs ORDER BY updated_at DESC LIMIT 500",
      );
      for (const row of result.rows) {
        const job = jobApi.normalizeOperatorJob(row.data || { id: row.id });
        if (job.id) memory.set(job.id, job);
      }
      initialized = true;
      return { loaded: memory.size, backend: "postgres", ready: true };
    }

    // Intentional local/dev only — never reached when mode === "postgres".
    if (mode === "local-file") {
      const local = readLocalFile();
      const jobsObj = local.jobs && typeof local.jobs === "object" ? local.jobs : {};
      for (const value of Object.values(jobsObj)) {
        const job = jobApi.normalizeOperatorJob(value);
        if (job.id) memory.set(job.id, job);
      }
      initialized = true;
      return { loaded: memory.size, backend: "local-file", ready: true };
    }

    initialized = true;
    return { loaded: 0, backend: "memory", ready: true };
  }

  function getJobSync(id) {
    const key = schema.text(id, 80);
    if (!key) return null;
    return memory.get(key) || null;
  }

  async function getJob(id) {
    const key = schema.text(id, 80);
    if (!key) return null;
    if (memory.has(key)) return memory.get(key);
    if (mode === "postgres" && pool && tableReady) {
      const result = await pool.query(
        "SELECT data FROM llh_curriculum_operator_jobs WHERE id = $1",
        [key],
      );
      if (!result.rows.length) return null;
      const job = jobApi.normalizeOperatorJob(result.rows[0].data);
      memory.set(job.id, job);
      return job;
    }
    return null;
  }

  function listJobsSync({ status = null, limit = 100 } = {}) {
    const max = Math.max(1, Math.min(500, Number(limit) || 100));
    let jobs = Array.from(memory.values());
    if (status) {
      const want = String(status).toLowerCase();
      jobs = jobs.filter((j) => String(j.status || "").toLowerCase() === want);
    }
    jobs.sort((a, b) => (Date.parse(b.updatedAt || "") || 0) - (Date.parse(a.updatedAt || "") || 0));
    return jobs.slice(0, max);
  }

  async function loadDestinationJob(id) {
    if (mode === "postgres" && pool) {
      const result = await pool.query(
        "SELECT data FROM llh_curriculum_operator_jobs WHERE id = $1",
        [id],
      );
      if (!result.rows.length) return null;
      const job = jobApi.normalizeOperatorJob(result.rows[0].data);
      memory.set(job.id, job);
      return job;
    }
    return memory.get(id) || null;
  }

  /**
   * Upsert one job. Never overwrites a newer dedicated row with older data.
   * Never caches an older incoming job when Postgres rejected the update.
   */
  async function upsertJob(rawJob, { allowOlder = false } = {}) {
    const job = jobApi.normalizeOperatorJob(rawJob || {});
    if (!job.id) {
      const err = new Error("Operator job id is required.");
      err.code = "operator_job_id_required";
      throw err;
    }

    if (mode === "postgres" && (!pool || !tableReady)) {
      const err = new Error("Dedicated operator-job Postgres backend is not ready.");
      err.code = "operator_job_backend_not_ready";
      throw err;
    }

    const existing = memory.get(job.id) || null;
    if (existing && !allowOlder) {
      const existingMs = Date.parse(existing.updatedAt || "") || 0;
      const nextMs = Date.parse(job.updatedAt || "") || 0;
      if (existingMs > nextMs) {
        return { job: existing, skipped: true, reason: "destination_newer" };
      }
    }

    if (mode === "postgres") {
      try {
        const result = await pool.query(
          `INSERT INTO llh_curriculum_operator_jobs
             (id, status, created_at, updated_at, created_by, phase, data)
           VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5, $6, $7::jsonb)
           ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at,
             created_by = EXCLUDED.created_by,
             phase = EXCLUDED.phase,
             data = EXCLUDED.data
           WHERE llh_curriculum_operator_jobs.updated_at <= EXCLUDED.updated_at
           RETURNING data`,
          [
            job.id,
            job.status,
            job.createdAt,
            job.updatedAt,
            job.createdBy || "",
            Number(job.phase) || 1,
            JSON.stringify(job),
          ],
        );
        if (!result.rows.length) {
          // Destination row is newer (WHERE failed) or unexpected no-op — do NOT cache older input.
          const dest = await loadDestinationJob(job.id);
          if (dest) {
            return { job: dest, skipped: true, reason: "destination_newer" };
          }
          const err = new Error("Dedicated operator-job upsert returned no row.");
          err.code = "operator_job_persist_failed";
          throw err;
        }
        const persisted = jobApi.normalizeOperatorJob(result.rows[0].data || job);
        memory.set(persisted.id, persisted);
        return { job: persisted, skipped: false };
      } catch (error) {
        if (error?.code === "operator_job_persist_failed" || error?.code === "operator_job_backend_not_ready") {
          throw error;
        }
        const err = new Error(`Dedicated operator-job persist failed: ${error.message || error}`);
        err.code = "operator_job_persist_failed";
        err.cause = error;
        throw err;
      }
    }

    // local-file / memory only
    memory.set(job.id, job);
    if (mode === "local-file") writeLocalFile();
    return { job, skipped: false };
  }

  async function upsertJobs(jobs, options = {}) {
    const list = Array.isArray(jobs) ? jobs : [];
    const results = [];
    for (const job of list) {
      results.push(await upsertJob(job, options));
    }
    return results;
  }

  /**
   * Merge dedicated jobs with a legacy llh_store bag (fallback for unmigrated ids).
   * Dedicated wins on id collision when updatedAt is newer or equal.
   */
  function mergeWithLegacyBag(legacyBag) {
    const legacy = jobApi.normalizeOperatorJobStore(legacyBag || {});
    const byId = new Map();
    for (const job of legacy.jobs) {
      if (job?.id) byId.set(job.id, job);
    }
    for (const job of memory.values()) {
      const existing = byId.get(job.id);
      if (!existing) {
        byId.set(job.id, job);
        continue;
      }
      const existingMs = Date.parse(existing.updatedAt || "") || 0;
      const nextMs = Date.parse(job.updatedAt || "") || 0;
      if (nextMs >= existingMs) byId.set(job.id, job);
    }
    return jobApi.normalizeOperatorJobStore({
      jobs: Array.from(byId.values()),
      updatedAt: jobApi.nowIso(),
    });
  }

  return {
    configure,
    initTable,
    loadFromStorage,
    getJob,
    getJobSync,
    listJobsSync,
    upsertJob,
    upsertJobs,
    mergeWithLegacyBag,
    backendMode,
    isReady,
    isHotStoreCutoverEnabled,
    canSafelyPersistDedicated,
    canSafelyCapHotStore,
    isConfigured,
    requiresDurableBackend,
    // test helpers
    _memorySize: () => memory.size,
    _clearMemory: () => memory.clear(),
    _localFilePath: () => localFilePath,
  };
}

/**
 * Jobs newly created or whose updatedAt advanced vs the prior llh_store bag.
 * Used so ordinary Stage-1 writes dual-write ONLY the mutation — never bulk-seed
 * the entire legacy history into the dedicated table.
 */
function selectJobsChangedInWrite(previousBag, nextBag) {
  const previous = jobApi.normalizeOperatorJobStore(previousBag || {});
  const next = jobApi.normalizeOperatorJobStore(nextBag || {});
  const prevById = new Map();
  for (const job of previous.jobs) {
    if (job?.id) prevById.set(job.id, job);
  }
  const changed = [];
  for (const job of next.jobs) {
    if (!job?.id) continue;
    const prev = prevById.get(job.id);
    if (!prev) {
      changed.push(job);
      continue;
    }
    const prevMs = Date.parse(prev.updatedAt || "") || 0;
    const nextMs = Date.parse(job.updatedAt || "") || 0;
    if (nextMs > prevMs) changed.push(job);
  }
  return changed;
}

module.exports = {
  createCurriculumOperatorJobStore,
  buildHotStoreJobBag,
  toHotStoreStub,
  selectJobsChangedInWrite,
  isActiveStatus,
  isTerminalStatus,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  HOT_STORE_RECENT_TERMINAL_LIMIT,
  byteLen,
};
