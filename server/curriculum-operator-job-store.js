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
 * - Dual-write: full job → dedicated; capped bag → llh_store via caller writeStoreAsync.
 * - Cap NEVER drops active/resumable jobs (planned|awaiting_confirm|running|paused).
 * - Fail-closed when dedicated persistence is required (Postgres mode) and writes fail.
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

function createCurriculumOperatorJobStore({ localFilePath = null } = {}) {
  let pool = null;
  let usingPostgres = false;
  /** @type {Map<string, object>} */
  const memory = new Map();

  function configure({ pool: nextPool = null, usingPostgres: nextUsingPostgres = false } = {}) {
    pool = nextPool;
    usingPostgres = Boolean(nextUsingPostgres);
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

  function writeLocalFile() {
    if (!localFilePath) return;
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
    if (!usingPostgres || !pool) return;
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
  }

  async function loadFromStorage() {
    memory.clear();
    if (usingPostgres && pool) {
      const result = await pool.query(
        "SELECT id, data FROM llh_curriculum_operator_jobs ORDER BY updated_at DESC LIMIT 500",
      );
      for (const row of result.rows) {
        const job = jobApi.normalizeOperatorJob(row.data || { id: row.id });
        if (job.id) memory.set(job.id, job);
      }
      return { loaded: memory.size, backend: "postgres" };
    }
    const local = readLocalFile();
    const jobsObj = local.jobs && typeof local.jobs === "object" ? local.jobs : {};
    for (const value of Object.values(jobsObj)) {
      const job = jobApi.normalizeOperatorJob(value);
      if (job.id) memory.set(job.id, job);
    }
    return { loaded: memory.size, backend: localFilePath ? "local-file" : "memory" };
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
    if (usingPostgres && pool) {
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

  /**
   * Upsert one job. Never overwrites a newer dedicated row with older data.
   */
  async function upsertJob(rawJob, { allowOlder = false } = {}) {
    const job = jobApi.normalizeOperatorJob(rawJob || {});
    if (!job.id) {
      const err = new Error("Operator job id is required.");
      err.code = "operator_job_id_required";
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

    if (usingPostgres && pool) {
      try {
        await pool.query(
          `INSERT INTO llh_curriculum_operator_jobs
             (id, status, created_at, updated_at, created_by, phase, data)
           VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5, $6, $7::jsonb)
           ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at,
             created_by = EXCLUDED.created_by,
             phase = EXCLUDED.phase,
             data = EXCLUDED.data
           WHERE llh_curriculum_operator_jobs.updated_at <= EXCLUDED.updated_at`,
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
      } catch (error) {
        const err = new Error(`Dedicated operator-job persist failed: ${error.message || error}`);
        err.code = "operator_job_persist_failed";
        err.cause = error;
        throw err;
      }
    }

    memory.set(job.id, job);
    if (!usingPostgres) writeLocalFile();
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

  function isConfigured() {
    return Boolean((usingPostgres && pool) || localFilePath);
  }

  function requiresDurableBackend() {
    return usingPostgres === true;
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
    isConfigured,
    requiresDurableBackend,
    // test helpers
    _memorySize: () => memory.size,
    _clearMemory: () => memory.clear(),
  };
}

module.exports = {
  createCurriculumOperatorJobStore,
  buildHotStoreJobBag,
  toHotStoreStub,
  isActiveStatus,
  isTerminalStatus,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  HOT_STORE_RECENT_TERMINAL_LIMIT,
  byteLen,
};
