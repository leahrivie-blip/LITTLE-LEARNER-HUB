"use strict";

const schema = require("./curriculum-operator-schema.js");
const jobApi = require("./curriculum-operator-job.js");

const DEFAULT_LOOKUP_ATTEMPTS = 5;
const DEFAULT_LOOKUP_DELAY_MS = 40;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safe diagnostics for async dispatch (no secrets / prompts / PII).
 */
function buildDispatchDiagnostic({
  jobId,
  phase,
  lookupAttempts,
  foundVia,
  dedicatedBackendReady,
  hotBagCount,
  errorCode,
  message,
}) {
  return {
    jobId: schema.text(jobId, 80),
    phase: Number(phase) || null,
    lookupAttempts: Number(lookupAttempts) || 0,
    foundVia: schema.text(foundVia, 40) || null,
    dedicatedBackendReady: dedicatedBackendReady === true,
    hotBagCount: Number.isFinite(hotBagCount) ? hotBagCount : null,
    errorCode: schema.text(errorCode, 80) || null,
    message: schema.text(message, 500) || null,
    at: jobApi.nowIso(),
  };
}

/**
 * Count lesson.create (or any) steps that left pending with no async progress.
 */
function countLessonActionProgress(job) {
  const lr = schema.asArray(job?.lessonResults)[0] || {};
  const actions = schema.asArray(lr.actions);
  let pending = 0;
  let running = 0;
  let success = 0;
  let failed = 0;
  for (const step of actions) {
    const status = schema.text(step?.status, 20).toLowerCase();
    if (status === "pending") pending += 1;
    else if (status === "running") running += 1;
    else if (status === "success") success += 1;
    else if (status === "failed") failed += 1;
  }
  return { pending, running, success, failed, total: actions.length };
}

function hasZeroExecutionProgress(job) {
  const counts = countLessonActionProgress(job);
  return counts.total > 0 && counts.running === 0 && counts.success === 0 && counts.failed === 0;
}

/**
 * Resolve a job for the async worker: snapshot first, then hot bag, then dedicated get with retries.
 *
 * @param {object} deps
 * @param {() => object} deps.readStore
 * @param {(store: object, jobId: string) => Promise<object|null>} deps.resolveJobById
 * @param {{ getJob?: (id: string) => Promise<object|null>, canSafelyPersistDedicated?: () => boolean }|null} deps.operatorJobStore
 * @param {string} jobId
 * @param {object|null} jobSnapshot
 */
async function resolveJobForAsyncDispatch(deps, {
  jobId,
  jobSnapshot = null,
  maxAttempts = DEFAULT_LOOKUP_ATTEMPTS,
  delayMs = DEFAULT_LOOKUP_DELAY_MS,
} = {}) {
  const id = schema.text(jobId, 80);
  if (!id) {
    return {
      job: null,
      diagnostic: buildDispatchDiagnostic({
        jobId,
        lookupAttempts: 0,
        errorCode: "async_dispatch_invalid_job_id",
        message: "Async dispatch requires a job id.",
      }),
    };
  }

  if (jobSnapshot && typeof jobSnapshot === "object" && schema.text(jobSnapshot.id, 80) === id) {
    return {
      job: jobApi.normalizeOperatorJob(jobSnapshot),
      diagnostic: buildDispatchDiagnostic({
        jobId: id,
        lookupAttempts: 0,
        foundVia: "ack_snapshot",
        dedicatedBackendReady: deps.operatorJobStore?.canSafelyPersistDedicated?.() === true,
      }),
    };
  }

  let lastHotCount = 0;
  let dedicatedReady = false;
  const attempts = Math.max(1, Number(maxAttempts) || DEFAULT_LOOKUP_ATTEMPTS);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const store = deps.readStore();
    const bag = store?.curriculumOperatorJobs;
    const jobs = schema.asArray(bag?.jobs);
    lastHotCount = jobs.length;
    dedicatedReady = deps.operatorJobStore?.canSafelyPersistDedicated?.() === true;

    // eslint-disable-next-line no-await-in-loop
    const resolved = await deps.resolveJobById(store, id);
    if (resolved?.id === id) {
      return {
        job: resolved,
        diagnostic: buildDispatchDiagnostic({
          jobId: id,
          lookupAttempts: attempt,
          foundVia: attempt === 1 ? "resolve_job_by_id" : "resolve_job_by_id_retry",
          dedicatedBackendReady: dedicatedReady,
          hotBagCount: lastHotCount,
        }),
      };
    }

    if (typeof deps.operatorJobStore?.getJob === "function") {
      // eslint-disable-next-line no-await-in-loop
      const dedicated = await deps.operatorJobStore.getJob(id);
      if (dedicated?.id === id) {
        return {
          job: dedicated,
          diagnostic: buildDispatchDiagnostic({
            jobId: id,
            lookupAttempts: attempt,
            foundVia: "dedicated_get_job",
            dedicatedBackendReady: dedicatedReady,
            hotBagCount: lastHotCount,
          }),
        };
      }
    }

    if (attempt < attempts) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(delayMs);
    }
  }

  return {
    job: null,
    diagnostic: buildDispatchDiagnostic({
      jobId: id,
      lookupAttempts: attempts,
      foundVia: null,
      dedicatedBackendReady: dedicatedReady,
      hotBagCount: lastHotCount,
      errorCode: "async_dispatch_job_unresolved",
      message: "Async worker could not resolve the acknowledged job; failing closed instead of leaving a running stub.",
    }),
  };
}

/**
 * Mark a job terminal when async dispatch cannot run (fail-closed).
 */
function buildAsyncDispatchFailureJob(job, { errorCode, message, diagnostic }) {
  const base = jobApi.normalizeOperatorJob(job || {});
  const code = schema.text(errorCode, 80) || "async_dispatch_failed";
  const detail = schema.text(message, 500) || "Async operator dispatch failed.";
  base.status = "failed";
  base.error = detail;
  base.code = code;
  jobApi.appendLog(
    base,
    `Async dispatch failed (${code}): ${detail}`,
    "error",
  );
  if (diagnostic && typeof diagnostic === "object") {
    jobApi.appendLog(
      base,
      `Async dispatch diagnostic: ${JSON.stringify({
        lookupAttempts: diagnostic.lookupAttempts,
        foundVia: diagnostic.foundVia,
        dedicatedBackendReady: diagnostic.dedicatedBackendReady,
        hotBagCount: diagnostic.hotBagCount,
        errorCode: diagnostic.errorCode,
      })}`,
      "error",
    );
  }
  const lr = schema.asArray(base.lessonResults)[0];
  if (lr) {
    lr.status = "failed";
    lr.error = detail;
    lr.code = code;
    base.lessonResults = [lr, ...base.lessonResults.slice(1)];
  }
  return base;
}

module.exports = {
  DEFAULT_LOOKUP_ATTEMPTS,
  DEFAULT_LOOKUP_DELAY_MS,
  buildDispatchDiagnostic,
  countLessonActionProgress,
  hasZeroExecutionProgress,
  resolveJobForAsyncDispatch,
  buildAsyncDispatchFailureJob,
};
