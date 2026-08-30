/**
 * Stage 2 curriculumOperatorJobs offload — design/tooling library.
 *
 * SAFE BY DEFAULT:
 * - Pure planning / verification helpers.
 * - Fixture/local simulation of migrate + hot rewrite.
 * - Production Postgres cutover apply is intentionally NOT unlocked here.
 *
 * Does not flip isHotStoreCutoverEnabled() in app runtime.
 * Does not print lesson content or secrets.
 */
"use strict";

const crypto = require("node:crypto");
const jobApi = require("../curriculum-operator-job.js");
const {
  buildHotStoreJobBag,
  isActiveStatus,
  isTerminalStatus,
  byteLen,
  HOT_STORE_RECENT_TERMINAL_LIMIT,
  createCurriculumOperatorJobStore,
} = require("../../server/curriculum-operator-job-store.js");

/** Exact CAS SQL projection — mirror enrichment-history-postgres-apply.js */
const LLH_STORE_UPDATED_AT_EXACT_SQL = "updated_at::text";

const ACTIVE_STATUSES = Object.freeze(["planned", "awaiting_confirm", "running", "paused"]);

function nowIso() {
  return new Date().toISOString();
}

function newRunId() {
  return `opjobs-stage2-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function stableSha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? null), "utf8").digest("hex");
}

function fingerprintJob(rawJob) {
  const job = jobApi.normalizeOperatorJob(rawJob || {});
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    createdBy: job.createdBy ? "[redacted]" : "",
    phase: job.phase,
    lessonResultsCount: Array.isArray(job.lessonResults) ? job.lessonResults.length : 0,
    logCount: Array.isArray(job.log) ? job.log.length : 0,
    active: isActiveStatus(job.status),
    terminal: isTerminalStatus(job.status),
    hash: stableSha256(job),
  };
}

function summarizeByStatus(jobs) {
  const out = {};
  for (const job of jobs) {
    const st = String(job.status || "unknown").toLowerCase();
    if (!out[st]) out[st] = { count: 0, bytes: 0 };
    out[st].count += 1;
    out[st].bytes += byteLen(job);
  }
  return out;
}

function buildSourceManifest(store, options = {}) {
  const bag = jobApi.normalizeOperatorJobStore(store?.curriculumOperatorJobs);
  const jobs = bag.jobs || [];
  const fingerprints = jobs.map(fingerprintJob).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const aggregateHash = stableSha256(
    fingerprints.map((f) => `${f.id}:${f.hash}`).join("\n"),
  );
  const activeIds = fingerprints.filter((f) => f.active).map((f) => f.id);
  const terminalIds = fingerprints.filter((f) => f.terminal).map((f) => f.id);
  return {
    runId: options.runId || newRunId(),
    capturedAt: nowIso(),
    productionBuildSha: options.productionBuildSha || null,
    storeUpdatedAt: options.storeUpdatedAt || null,
    storeUpdatedAtExact: options.storeUpdatedAtExact || null,
    llhStoreTextBytes: options.llhStoreTextBytes != null
      ? Number(options.llhStoreTextBytes)
      : byteLen(store),
    operatorSectionBytes: byteLen(bag),
    jobCount: jobs.length,
    byStatus: summarizeByStatus(jobs),
    activeIds,
    terminalIds,
    fingerprints,
    aggregateHash,
    inventory: {
      users: Object.keys(store?.users || {}).length,
      programData: Object.keys(store?.programData || {}).length,
      scheduleByUser: Object.keys(store?.scheduleByUser || {}).length,
      billingEvents: Array.isArray(store?.billingEvents) ? store.billingEvents.length : 0,
      lessonPlans: Array.isArray(store?.siteContent?.curriculum?.lessonPlans)
        ? store.siteContent.curriculum.lessonPlans.length
        : 0,
      activities: Array.isArray(store?.siteContent?.curriculum?.activities)
        ? store.siteContent.curriculum.activities.length
        : 0,
    },
  };
}

/**
 * Plan dedicated-table upserts from a source bag (NO WRITES).
 * Restart-safe / idempotent rules:
 * - missing destination → upsert
 * - exact equal (hash + updatedAt) → skip
 * - destination newer → keep destination (report; safe)
 * - source newer → upsert
 * - same updatedAt, different hash → unsafe conflict (block)
 *
 * @returns {{ plannedUpserts: object[], skips: object[], conflicts: object[], safe: boolean }}
 */
function planDedicatedMigration(sourceJobs, destinationById = new Map()) {
  const plannedUpserts = [];
  const skips = [];
  const conflicts = [];

  for (const raw of sourceJobs || []) {
    const job = jobApi.normalizeOperatorJob(raw || {});
    if (!job.id) continue;
    const sourceHash = stableSha256(job);
    const dest = destinationById.get(String(job.id));
    if (!dest) {
      plannedUpserts.push({ id: job.id, reason: "missing", sourceHash, job });
      continue;
    }
    const destJob = jobApi.normalizeOperatorJob(dest);
    const destHash = stableSha256(destJob);
    const srcMs = Date.parse(job.updatedAt || "") || 0;
    const destMs = Date.parse(destJob.updatedAt || "") || 0;
    if (srcMs === destMs && sourceHash === destHash) {
      skips.push({ id: job.id, reason: "exact_equal", sourceHash });
      continue;
    }
    if (destMs > srcMs) {
      conflicts.push({
        id: job.id,
        kind: "destination_newer",
        sourceUpdatedAt: job.updatedAt || "",
        destinationUpdatedAt: destJob.updatedAt || "",
        sourceHash,
        destinationHash: destHash,
      });
      continue;
    }
    if (srcMs === destMs && sourceHash !== destHash) {
      conflicts.push({
        id: job.id,
        kind: "unsafe_same_updated_at_hash_mismatch",
        sourceHash,
        destinationHash: destHash,
      });
      continue;
    }
    plannedUpserts.push({ id: job.id, reason: "source_newer", sourceHash, job });
  }

  const unsafe = conflicts.filter((c) => c.kind === "unsafe_same_updated_at_hash_mismatch");
  return {
    plannedUpserts,
    skips,
    conflicts,
    safe: unsafe.length === 0,
    plannedCount: plannedUpserts.length,
    skipCount: skips.length,
    conflictCount: conflicts.length,
  };
}

/**
 * Compare source fingerprints to dedicated destination jobs (normalized).
 */
function verifyDestinationAgainstSource(sourceManifest, destinationJobs) {
  const destById = new Map();
  for (const raw of destinationJobs || []) {
    const job = jobApi.normalizeOperatorJob(raw || {});
    if (job.id) destById.set(job.id, job);
  }

  const exactMatches = [];
  const newerDestination = [];
  const missing = [];
  const hashMismatch = [];
  const conflicts = [];

  for (const fp of sourceManifest.fingerprints || []) {
    const dest = destById.get(fp.id);
    if (!dest) {
      missing.push({ id: fp.id, status: fp.status });
      continue;
    }
    const destFp = fingerprintJob(dest);
    const srcMs = Date.parse(fp.updatedAt || "") || 0;
    const destMs = Date.parse(destFp.updatedAt || "") || 0;
    if (destFp.hash === fp.hash) {
      exactMatches.push({ id: fp.id });
      continue;
    }
    if (destMs > srcMs) {
      newerDestination.push({
        id: fp.id,
        sourceUpdatedAt: fp.updatedAt,
        destinationUpdatedAt: destFp.updatedAt,
        destinationHash: destFp.hash,
      });
      continue;
    }
    if (destMs < srcMs) {
      conflicts.push({
        id: fp.id,
        reason: "destination_older_hash_mismatch",
        sourceUpdatedAt: fp.updatedAt,
        destinationUpdatedAt: destFp.updatedAt,
      });
      hashMismatch.push({ id: fp.id, sourceHash: fp.hash, destinationHash: destFp.hash });
      continue;
    }
    hashMismatch.push({ id: fp.id, sourceHash: fp.hash, destinationHash: destFp.hash });
    conflicts.push({ id: fp.id, reason: "same_updated_at_hash_mismatch" });
  }

  return {
    sourceCount: (sourceManifest.fingerprints || []).length,
    destinationCount: destById.size,
    matchedCount: exactMatches.length + newerDestination.length,
    exactMatches: exactMatches.length,
    newerDestination: newerDestination.length,
    missingCount: missing.length,
    hashMismatchCount: hashMismatch.length,
    conflictCount: conflicts.length,
    missing,
    hashMismatch,
    conflicts,
    newerDestinationDetails: newerDestination,
    cutoverAllowed:
      missing.length === 0
      && hashMismatch.length === 0
      && conflicts.length === 0,
  };
}

function assertCutoverVerificationGate(verification) {
  if (!verification || typeof verification !== "object") {
    const err = new Error("Destination verification missing.");
    err.code = "stage2_verification_missing";
    throw err;
  }
  if (verification.missingCount > 0) {
    const err = new Error(`Cutover blocked: ${verification.missingCount} missing dedicated row(s).`);
    err.code = "stage2_missing_destination";
    err.details = verification.missing;
    throw err;
  }
  if (verification.hashMismatchCount > 0) {
    const err = new Error(`Cutover blocked: ${verification.hashMismatchCount} hash mismatch(es).`);
    err.code = "stage2_hash_mismatch";
    err.details = verification.hashMismatch;
    throw err;
  }
  if (verification.conflictCount > 0) {
    const err = new Error(`Cutover blocked: ${verification.conflictCount} unsafe conflict(s).`);
    err.code = "stage2_unsafe_conflict";
    err.details = verification.conflicts;
    throw err;
  }
  if (!verification.cutoverAllowed) {
    const err = new Error("Cutover blocked: verification gate failed.");
    err.code = "stage2_gate_failed";
    throw err;
  }
  return true;
}

function detectSourceDrift(sourceManifest, liveStore) {
  const live = buildSourceManifest(liveStore, {
    storeUpdatedAt: sourceManifest.storeUpdatedAt,
    storeUpdatedAtExact: sourceManifest.storeUpdatedAtExact,
  });
  const changed = live.aggregateHash !== sourceManifest.aggregateHash
    || live.jobCount !== sourceManifest.jobCount;
  return {
    changed,
    previousAggregateHash: sourceManifest.aggregateHash,
    liveAggregateHash: live.aggregateHash,
    previousCount: sourceManifest.jobCount,
    liveCount: live.jobCount,
    liveManifest: live,
  };
}

function buildHotBagPreview(store, options = {}) {
  const bag = jobApi.normalizeOperatorJobStore(store?.curriculumOperatorJobs);
  const capped = buildHotStoreJobBag(bag, {
    recentTerminalLimit: options.recentTerminalLimit ?? HOT_STORE_RECENT_TERMINAL_LIMIT,
  });
  const beforeBytes = byteLen(bag);
  const afterBytes = capped.stats.bytesAfter;
  const activeFull = (capped.bag.jobs || []).filter((j) => isActiveStatus(j.status));
  const stubs = (capped.bag.jobs || []).filter((j) => j.hotStoreStub === true);
  const activeUnsafe = activeFull.filter((j) => j.hotStoreStub === true);
  return {
    previewOnly: true,
    wrote: false,
    beforeBytes,
    afterBytes,
    bytesSaved: Math.max(0, beforeBytes - afterBytes),
    reductionPct: beforeBytes
      ? Math.round(((beforeBytes - afterBytes) / beforeBytes) * 10000) / 100
      : 0,
    hotJobCount: (capped.bag.jobs || []).length,
    activeKeptFull: activeFull.length,
    terminalStubbed: stubs.length,
    activeUnsafeStubCount: activeUnsafe.length,
    stats: capped.stats,
    bag: capped.bag,
  };
}

function assertActiveJobsRemainFull(hotBag) {
  const jobs = jobApi.normalizeOperatorJobStore(hotBag).jobs || [];
  for (const job of jobs) {
    if (!isActiveStatus(job.status)) continue;
    if (job.hotStoreStub === true) {
      const err = new Error(`Active job ${job.id} must not be a hotStoreStub.`);
      err.code = "stage2_active_stubbed";
      throw err;
    }
  }
  return true;
}

function assertBackupGate(backup) {
  if (!backup || typeof backup !== "object") {
    const err = new Error("Missing backup gate: verified llh_store_backups row required.");
    err.code = "stage2_backup_missing";
    throw err;
  }
  if (backup.verified !== true) {
    const err = new Error("Backup gate failed: backup.verified must be true.");
    err.code = "stage2_backup_unverified";
    throw err;
  }
  if (!backup.id) {
    const err = new Error("Backup gate failed: backup.id required.");
    err.code = "stage2_backup_id_missing";
    throw err;
  }
  return true;
}

function assertExpectedSourceGates(sourceManifest, expectations = {}) {
  if (expectations.expectedSourceCount != null) {
    const want = Number(expectations.expectedSourceCount);
    if (sourceManifest.jobCount !== want) {
      const err = new Error(
        `Source count mismatch: expected ${want}, got ${sourceManifest.jobCount}.`,
      );
      err.code = "stage2_source_count_mismatch";
      throw err;
    }
  }
  if (expectations.expectedSourceHash) {
    if (sourceManifest.aggregateHash !== String(expectations.expectedSourceHash)) {
      const err = new Error("Source aggregate hash mismatch.");
      err.code = "stage2_source_hash_mismatch";
      throw err;
    }
  }
  if (expectations.expectedStoreUpdatedAt) {
    const live = String(
      sourceManifest.storeUpdatedAtExact || sourceManifest.storeUpdatedAt || "",
    );
    if (live !== String(expectations.expectedStoreUpdatedAt)) {
      const err = new Error("llh_store updated_at expectation mismatch.");
      err.code = "stage2_store_updated_at_mismatch";
      throw err;
    }
  }
  return true;
}

/**
 * Simulate Stage 2 dedicated migrate + optional hot rewrite against a fixture store.
 * NEVER opens a production Postgres write connection.
 */
async function simulateStage2OnFixtureStore({
  store,
  backup,
  expectations = {},
  applyHotRewrite = false,
  operatorJobStore = null,
} = {}) {
  const runId = newRunId();
  const sourceManifest = buildSourceManifest(store, { runId });
  assertBackupGate(backup);
  assertExpectedSourceGates(sourceManifest, expectations);

  const jobStore = operatorJobStore || createCurriculumOperatorJobStore({ localFilePath: null });
  jobStore.configure({ intendedPostgres: false });
  await jobStore.loadFromStorage();

  const applied = [];
  const skipped = [];
  for (const job of jobApi.normalizeOperatorJobStore(store.curriculumOperatorJobs).jobs) {
    const result = await jobStore.upsertJob(job);
    if (result.skipped) skipped.push({ id: job.id, reason: result.reason });
    else applied.push({ id: job.id, status: job.status });
  }

  const destinationJobs = jobStore.listJobsSync({ limit: 500 });
  const verification = verifyDestinationAgainstSource(sourceManifest, destinationJobs);
  assertCutoverVerificationGate(verification);

  const drift = detectSourceDrift(sourceManifest, store);
  if (drift.changed) {
    const err = new Error("Source drifted during migration simulation; refresh and re-verify.");
    err.code = "stage2_source_drift";
    err.details = drift;
    throw err;
  }

  const preview = buildHotBagPreview(store);
  assertActiveJobsRemainFull(preview.bag);

  let hotWrote = false;
  let afterStore = store;
  if (applyHotRewrite) {
    afterStore = {
      ...store,
      curriculumOperatorJobs: preview.bag,
    };
    hotWrote = true;
  }

  return {
    runId,
    wroteDedicated: true,
    wroteHotStore: hotWrote,
    sourceManifest,
    applied,
    skipped,
    verification,
    preview,
    afterStore,
    inventoryBefore: sourceManifest.inventory,
    inventoryAfter: {
      users: Object.keys(afterStore?.users || {}).length,
      programData: Object.keys(afterStore?.programData || {}).length,
      scheduleByUser: Object.keys(afterStore?.scheduleByUser || {}).length,
      billingEvents: Array.isArray(afterStore?.billingEvents) ? afterStore.billingEvents.length : 0,
      lessonPlans: Array.isArray(afterStore?.siteContent?.curriculum?.lessonPlans)
        ? afterStore.siteContent.curriculum.lessonPlans.length
        : 0,
      activities: Array.isArray(afterStore?.siteContent?.curriculum?.activities)
        ? afterStore.siteContent.curriculum.activities.length
        : 0,
    },
  };
}

/**
 * Rollback simulation: restore full operator bag from backup; never overwrite newer live jobs.
 */
function simulateRollbackFromBackup({
  liveStore,
  backupStore,
  expectedLiveUpdatedAt = null,
  liveUpdatedAt = null,
} = {}) {
  if (expectedLiveUpdatedAt != null && liveUpdatedAt != null
    && String(expectedLiveUpdatedAt) !== String(liveUpdatedAt)) {
    const err = new Error("Rollback CAS failed: llh_store updated_at changed.");
    err.code = "stage2_rollback_cas_conflict";
    throw err;
  }
  const backupBag = jobApi.normalizeOperatorJobStore(backupStore?.curriculumOperatorJobs);
  const liveBag = jobApi.normalizeOperatorJobStore(liveStore?.curriculumOperatorJobs);
  const byId = new Map();
  for (const job of backupBag.jobs) {
    if (job?.id) byId.set(job.id, job);
  }
  for (const live of liveBag.jobs) {
    if (!live?.id) continue;
    const backed = byId.get(live.id);
    if (!backed) {
      byId.set(live.id, live);
      continue;
    }
    const liveMs = Date.parse(live.updatedAt || "") || 0;
    const backedMs = Date.parse(backed.updatedAt || "") || 0;
    if (liveMs > backedMs) byId.set(live.id, live);
  }
  return {
    wrote: true,
    curriculumOperatorJobs: jobApi.normalizeOperatorJobStore({
      jobs: Array.from(byId.values()),
      updatedAt: nowIso(),
    }),
  };
}

function assertProductionApplyUnlocked(args = {}) {
  const err = new Error(
    "Stage 2 production Postgres apply is NOT unlocked. "
    + "This design/tooling PR refuses --postgres --apply. "
    + "A future authorized maintenance PR must explicitly unlock cutover after review.",
  );
  err.code = "stage2_production_apply_locked";
  err.args = {
    apply: Boolean(args.apply),
    postgres: Boolean(args.postgres),
    confirmMigrate: Boolean(args.confirmMigrate),
    confirmCutover: Boolean(args.confirmCutover),
  };
  throw err;
}

function buildAuditReport(parts = {}) {
  return {
    kind: "curriculum_operator_jobs_stage2_audit",
    runId: parts.runId || null,
    productionCommit: parts.productionCommit || null,
    preflightTimestamp: parts.preflightTimestamp || null,
    sourceCount: parts.sourceCount ?? null,
    sourceAggregateHash: parts.sourceAggregateHash || null,
    backupId: parts.backupId || null,
    destinationCount: parts.destinationCount ?? null,
    verification: parts.verification || null,
    operatorBytesBefore: parts.operatorBytesBefore ?? null,
    operatorBytesAfter: parts.operatorBytesAfter ?? null,
    llhStoreBytesBefore: parts.llhStoreBytesBefore ?? null,
    llhStoreBytesAfter: parts.llhStoreBytesAfter ?? null,
    activeJobIds: parts.activeJobIds || [],
    terminalStubCount: parts.terminalStubCount ?? null,
    casBefore: parts.casBefore || null,
    casAfter: parts.casAfter || null,
    healthBefore: parts.healthBefore || null,
    healthAfter: parts.healthAfter || null,
    inventoryBefore: parts.inventoryBefore || null,
    inventoryAfter: parts.inventoryAfter || null,
    rollbackReady: parts.rollbackReady !== false,
    wroteProduction: false,
  };
}

module.exports = {
  ACTIVE_STATUSES,
  LLH_STORE_UPDATED_AT_EXACT_SQL,
  newRunId,
  stableSha256,
  fingerprintJob,
  buildSourceManifest,
  planDedicatedMigration,
  verifyDestinationAgainstSource,
  assertCutoverVerificationGate,
  detectSourceDrift,
  buildHotBagPreview,
  assertActiveJobsRemainFull,
  assertBackupGate,
  assertExpectedSourceGates,
  simulateStage2OnFixtureStore,
  simulateRollbackFromBackup,
  assertProductionApplyUnlocked,
  buildAuditReport,
  byteLen,
};
