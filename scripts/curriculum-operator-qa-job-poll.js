"use strict";

const schema = require("./curriculum-operator-schema.js");

const TERMINAL_JOB_STATUSES = Object.freeze([
  "completed",
  "failed",
  "cancelled",
  "blocked",
]);

const ACTIVE_JOB_STATUSES = Object.freeze([
  "planned",
  "awaiting_confirm",
  "running",
  "paused",
]);

const DEFAULT_POLL_INTERVAL_MS = 15000;
const DEFAULT_CREATE_SUBMIT_TIMEOUT_MS = 180000;

function parseCreateSubmitTimeoutMs(raw = process.env.LLH_QA_CREATE_SUBMIT_TIMEOUT_MS) {
  if (raw == null || raw === "") return DEFAULT_CREATE_SUBMIT_TIMEOUT_MS;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_CREATE_SUBMIT_TIMEOUT_MS;
  return n;
}

function normalizeJobRow(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: schema.text(row.id, 80),
    status: schema.text(row.status, 40).toLowerCase(),
    updatedAt: schema.text(row.updatedAt, 40),
    rawCommand: schema.text(row.rawCommand, 4000),
    progress: row.progress && typeof row.progress === "object" ? row.progress : null,
  };
}

/**
 * Match operator jobs tied to a Spring Planting QA session (list + dedicated rows surfaced via get).
 */
function jobMatchesQaSession(row, { operatorSessionId, disposableTitle }) {
  const cmd = String(row?.rawCommand || "");
  const session = schema.text(operatorSessionId, 120);
  const title = schema.text(disposableTitle, 240);
  if (title && cmd.includes(title)) return true;
  if (session && cmd.includes(session)) return true;
  return false;
}

function findJobsForQaSession(jobs, { operatorSessionId, disposableTitle }) {
  const opts = { operatorSessionId, disposableTitle };
  return schema.asArray(jobs)
    .map(normalizeJobRow)
    .filter(Boolean)
    .filter((row) => jobMatchesQaSession(row, opts))
    .sort((a, b) => (Date.parse(b.updatedAt || "") || 0) - (Date.parse(a.updatedAt || "") || 0));
}

function pickBestJobMatch(candidates) {
  if (!candidates.length) return null;
  return candidates[0];
}

function isTerminalJobStatus(status) {
  return TERMINAL_JOB_STATUSES.includes(schema.text(status, 40).toLowerCase());
}

function isActiveJobStatus(status) {
  return ACTIVE_JOB_STATUSES.includes(schema.text(status, 40).toLowerCase());
}

function summarizeCreateJob(job) {
  const normalized = job && typeof job === "object" ? job : {};
  const lr = schema.asArray(normalized.lessonResults)[0] || {};
  return {
    jobId: schema.text(normalized.id, 80),
    jobStatus: schema.text(normalized.status, 40).toLowerCase(),
    error: schema.text(normalized.error || lr.error, 500) || null,
    code: schema.text(normalized.code || lr.code, 80) || null,
    createdLessonId: schema.text(lr.createdLessonId, 160) || null,
    ownerReviewStatus: schema.text(lr.ownerReviewStatus, 80) || null,
    lessonCreated: lr.lessonCreated === true,
    lrStatus: schema.text(lr.status, 40).toLowerCase(),
    contentPersistenceIncomplete: normalized.contentPersistenceIncomplete === true
      || lr.contentPersistenceIncomplete === true,
    lessonResults: normalized.lessonResults,
    activityRepairCalls: normalized.costCounters?.activityRepairCalls,
    activityExpansionCalls: normalized.costCounters?.activityExpansionCalls,
    batchState: lr.activityExpansionBatches || normalized.activityExpansionBatches,
  };
}

function createJobSucceeded(summary) {
  if (!summary || !isTerminalJobStatus(summary.jobStatus)) return false;
  if (summary.jobStatus !== "completed") return false;
  return summary.lessonCreated === true && Boolean(summary.createdLessonId);
}

/**
 * @param {object} options
 * @param {() => Promise<object[]>} options.listJobs
 * @param {(jobId: string) => Promise<object|null>} options.getJob
 * @param {() => Promise<object|null>} [options.getSessionContext]
 * @param {string} options.operatorSessionId
 * @param {string} options.disposableTitle
 * @param {number} options.deadlineMs absolute timestamp
 * @param {number} [options.pollIntervalMs]
 */
async function resolveAndPollCreateJob(options) {
  const pollIntervalMs = options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
  const operatorSessionId = schema.text(options.operatorSessionId, 120);
  const disposableTitle = schema.text(options.disposableTitle, 240);
  const listJobs = options.listJobs;
  const getJob = options.getJob;
  const getSessionContext = options.getSessionContext;

  let lastCandidates = [];
  let lastContext = null;

  while (Date.now() < options.deadlineMs) {
    if (typeof getSessionContext === "function") {
      try {
        lastContext = await getSessionContext();
        const hintedId = schema.text(lastContext?.latestDraftJobId, 80);
        if (hintedId) {
          const hinted = await getJob(hintedId);
          if (hinted?.id) {
            const summary = summarizeCreateJob(hinted);
            if (isTerminalJobStatus(summary.jobStatus)) {
              return { ok: true, job: hinted, summary, resolvedVia: "context_latestDraftJobId" };
            }
            if (isActiveJobStatus(summary.jobStatus)) {
              lastCandidates = [{ id: hinted.id, status: summary.jobStatus, updatedAt: hinted.updatedAt, rawCommand: hinted.command?.rawCommand }];
            }
          }
        }
      } catch {
        // context_get is best-effort
      }
    }

    const jobs = await listJobs();
    lastCandidates = findJobsForQaSession(jobs, { operatorSessionId, disposableTitle });
    const best = pickBestJobMatch(lastCandidates);
    if (best?.id) {
      const full = await getJob(best.id);
      if (full?.id) {
        const summary = summarizeCreateJob(full);
        if (isTerminalJobStatus(summary.jobStatus)) {
          return { ok: true, job: full, summary, resolvedVia: "operatorSessionId_list_get" };
        }
        if (isActiveJobStatus(summary.jobStatus)) {
          // keep polling active job
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return {
    ok: false,
    code: "create_job_poll_timeout",
    operatorSessionId,
    disposableTitle,
    lastCandidates,
    lastContext,
  };
}

function findActiveQaSessionJobs(jobs, { operatorSessionId, disposableTitle }) {
  return findJobsForQaSession(jobs, { operatorSessionId, disposableTitle })
    .filter((row) => isActiveJobStatus(row.status));
}

module.exports = {
  TERMINAL_JOB_STATUSES,
  ACTIVE_JOB_STATUSES,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_CREATE_SUBMIT_TIMEOUT_MS,
  parseCreateSubmitTimeoutMs,
  jobMatchesQaSession,
  findJobsForQaSession,
  pickBestJobMatch,
  isTerminalJobStatus,
  isActiveJobStatus,
  summarizeCreateJob,
  createJobSucceeded,
  resolveAndPollCreateJob,
  findActiveQaSessionJobs,
};
