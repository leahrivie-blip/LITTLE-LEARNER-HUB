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
const schema = require("../curriculum-operator-schema.js");
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
const REQUIRED_BACKUP_SOURCE = "pre-operator-jobs-stage2";
const BACKUP_KIND_FIXTURE = "fixture";
const BACKUP_KIND_PRODUCTION = "production";

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
  const storeFingerprint = options.storeFingerprint || stableSha256(store);
  return {
    runId: options.runId || newRunId(),
    capturedAt: nowIso(),
    productionBuildSha: options.productionBuildSha || null,
    storeUpdatedAt: options.storeUpdatedAt || null,
    storeUpdatedAtExact: options.storeUpdatedAtExact || null,
    storeFingerprint,
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
 * Build a Stage 2 backup proof object (metadata only; no lesson payloads).
 * Production-grade proofs must bind to the exact migration source.
 */
function buildBackupProof(parts = {}) {
  const kind = parts.kind === BACKUP_KIND_FIXTURE ? BACKUP_KIND_FIXTURE : BACKUP_KIND_PRODUCTION;
  return {
    kind,
    fixture: kind === BACKUP_KIND_FIXTURE,
    id: parts.id || null,
    verified: parts.verified === true,
    source: parts.source || REQUIRED_BACKUP_SOURCE,
    migrationRunId: parts.migrationRunId || null,
    productionBuildSha: parts.productionBuildSha || null,
    sourceJobCount: parts.sourceJobCount != null ? Number(parts.sourceJobCount) : null,
    sourceAggregateHash: parts.sourceAggregateHash || null,
    storeUpdatedAtExact: parts.storeUpdatedAtExact || null,
    storeFingerprint: parts.storeFingerprint || null,
    createdAt: parts.createdAt || nowIso(),
  };
}

function isFixtureBackupProof(backup) {
  return Boolean(
    backup
    && (backup.kind === BACKUP_KIND_FIXTURE || backup.fixture === true),
  );
}

function isProductionGradeBackupProof(backup) {
  if (!backup || typeof backup !== "object") return false;
  if (isFixtureBackupProof(backup)) return false;
  return Boolean(
    backup.id
    && backup.verified === true
    && backup.source === REQUIRED_BACKUP_SOURCE
    && backup.migrationRunId
    && backup.sourceJobCount != null
    && backup.sourceAggregateHash
    && backup.storeUpdatedAtExact
    && backup.storeFingerprint
    && backup.createdAt,
  );
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

/**
 * Strong backup↔source binding. Production-grade proofs cannot rely on verified:true alone.
 *
 * @param {object} backupProof
 * @param {object} sourceManifest
 * @param {{ allowFixture?: boolean, requireProductionGrade?: boolean, requireBuildBinding?: boolean }} [expectations]
 */
function assertBackupMatchesSource(backupProof, sourceManifest, expectations = {}) {
  assertBackupGate(backupProof);

  const requireProductionGrade = expectations.requireProductionGrade === true
    || (!expectations.allowFixture && !isFixtureBackupProof(backupProof));
  const allowFixture = expectations.allowFixture === true && isFixtureBackupProof(backupProof);

  // Source/type binding is checked before completeness so wrong-source fails closed clearly.
  const source = String(backupProof.source || "").trim();
  if (source && source !== REQUIRED_BACKUP_SOURCE) {
    const err = new Error(
      `Backup source/type mismatch: expected "${REQUIRED_BACKUP_SOURCE}", got "${source}".`,
    );
    err.code = "stage2_backup_wrong_source";
    throw err;
  }

  if (requireProductionGrade && isFixtureBackupProof(backupProof)) {
    const err = new Error("Production-grade backup gate refuses fixture backup proofs.");
    err.code = "stage2_backup_fixture_not_allowed";
    throw err;
  }

  if (requireProductionGrade && !isProductionGradeBackupProof(backupProof)) {
    const err = new Error(
      "Production-grade backup proof incomplete. "
      + "verified:true alone is insufficient — require source binding fields "
      + "(source, migrationRunId, sourceJobCount, sourceAggregateHash, "
      + "storeUpdatedAtExact, storeFingerprint, createdAt).",
    );
    err.code = "stage2_backup_proof_incomplete";
    throw err;
  }

  if (!allowFixture && !requireProductionGrade && !isFixtureBackupProof(backupProof)) {
    // Default non-fixture path still requires production-grade completeness.
    if (!isProductionGradeBackupProof(backupProof)) {
      const err = new Error(
        "Backup proof incomplete for non-fixture cutover gate "
        + "(verified:true alone is insufficient).",
      );
      err.code = "stage2_backup_proof_incomplete";
      throw err;
    }
  }

  if (requireProductionGrade && source !== REQUIRED_BACKUP_SOURCE) {
    const err = new Error(`Backup source/type missing or wrong; expected "${REQUIRED_BACKUP_SOURCE}".`);
    err.code = "stage2_backup_wrong_source";
    throw err;
  }

  if (backupProof.migrationRunId != null && sourceManifest?.runId
    && String(backupProof.migrationRunId) !== String(sourceManifest.runId)) {
    const err = new Error("Backup migration run id does not match source manifest run id.");
    err.code = "stage2_backup_run_id_mismatch";
    throw err;
  }
  if (requireProductionGrade
    && String(backupProof.migrationRunId || "") !== String(sourceManifest.runId || "")) {
    const err = new Error("Backup migration run id mismatch (required for production-grade proof).");
    err.code = "stage2_backup_run_id_mismatch";
    throw err;
  }

  if (backupProof.sourceJobCount != null
    && Number(backupProof.sourceJobCount) !== Number(sourceManifest.jobCount)) {
    const err = new Error(
      `Backup source job count mismatch: proof=${backupProof.sourceJobCount}, `
      + `manifest=${sourceManifest.jobCount}.`,
    );
    err.code = "stage2_backup_source_count_mismatch";
    throw err;
  }

  if (backupProof.sourceAggregateHash
    && String(backupProof.sourceAggregateHash) !== String(sourceManifest.aggregateHash)) {
    const err = new Error("Backup source aggregate hash mismatch.");
    err.code = "stage2_backup_source_hash_mismatch";
    throw err;
  }

  const manifestCas = String(
    sourceManifest.storeUpdatedAtExact || sourceManifest.storeUpdatedAt || "",
  );
  if (backupProof.storeUpdatedAtExact != null && manifestCas
    && String(backupProof.storeUpdatedAtExact) !== manifestCas) {
    const err = new Error("Backup CAS token (storeUpdatedAtExact) mismatch.");
    err.code = "stage2_backup_cas_mismatch";
    throw err;
  }
  if (requireProductionGrade
    && String(backupProof.storeUpdatedAtExact || "") !== manifestCas) {
    const err = new Error("Backup CAS token mismatch (required for production-grade proof).");
    err.code = "stage2_backup_cas_mismatch";
    throw err;
  }

  const requireBuild = expectations.requireBuildBinding === true
    || (requireProductionGrade && sourceManifest.productionBuildSha);
  if (requireBuild) {
    if (!backupProof.productionBuildSha
      || String(backupProof.productionBuildSha) !== String(sourceManifest.productionBuildSha || "")) {
      const err = new Error("Backup production build SHA mismatch or missing.");
      err.code = "stage2_backup_build_mismatch";
      throw err;
    }
  }

  if (requireProductionGrade && !backupProof.storeFingerprint) {
    const err = new Error("Backup store fingerprint absent (required for production-grade proof).");
    err.code = "stage2_backup_fingerprint_missing";
    throw err;
  }
  if (backupProof.storeFingerprint && sourceManifest.storeFingerprint
    && String(backupProof.storeFingerprint) !== String(sourceManifest.storeFingerprint)) {
    const err = new Error("Backup store fingerprint does not match source manifest.");
    err.code = "stage2_backup_fingerprint_mismatch";
    throw err;
  }

  if (requireProductionGrade && !backupProof.createdAt) {
    const err = new Error("Backup creation timestamp absent.");
    err.code = "stage2_backup_created_at_missing";
    throw err;
  }

  return true;
}

/**
 * Plan dedicated-table upserts from a source bag (NO WRITES).
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

function validateDestinationJobShape(dest, sourceFp) {
  if (!dest || typeof dest !== "object") return "missing_destination";
  if (!dest.id || String(dest.id) !== String(sourceFp.id)) return "id_mismatch";
  const rawStatus = String(dest.status || "").toLowerCase();
  if (!schema.JOB_STATUSES.includes(rawStatus)) return "invalid_status";
  const normalized = jobApi.normalizeOperatorJob(dest);
  if (!normalized.updatedAt) return "missing_updated_at";
  if (!normalized.createdAt) return "missing_created_at";
  if (normalized.hotStoreStub === true) return "dedicated_row_must_not_be_stub";
  if (!Array.isArray(normalized.lessonResults)) return "lesson_results_not_array";
  // Silent lessonResults wipe on a dedicated "newer" row is unsafe.
  if (Number(sourceFp.lessonResultsCount || 0) > 0 && normalized.lessonResults.length === 0) {
    return "lesson_results_regressed";
  }
  // Active source must not silently become a stubbed/empty shell while still "active".
  if (sourceFp.active && isActiveStatus(normalized.status) && normalized.hotStoreStub === true) {
    return "active_stubbed";
  }
  return null;
}

/**
 * Compare source fingerprints to dedicated destination jobs (normalized).
 * Destination-newer rows are NOT automatically cutover-safe — they remain
 * newerDestinationPendingReconcile until reconcileNewerDestinationsAgainstLive succeeds.
 */
function verifyDestinationAgainstSource(sourceManifest, destinationJobs) {
  const destById = new Map();
  for (const raw of destinationJobs || []) {
    const job = jobApi.normalizeOperatorJob(raw || {});
    if (job.id) destById.set(job.id, job);
  }

  const exactMatches = [];
  const newerDestinationPendingReconcile = [];
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
      const shapeIssue = validateDestinationJobShape(dest, fp);
      if (shapeIssue) {
        conflicts.push({
          id: fp.id,
          reason: "destination_newer_malformed",
          detail: shapeIssue,
          sourceUpdatedAt: fp.updatedAt,
          destinationUpdatedAt: destFp.updatedAt,
        });
        continue;
      }
      newerDestinationPendingReconcile.push({
        id: fp.id,
        sourceUpdatedAt: fp.updatedAt,
        destinationUpdatedAt: destFp.updatedAt,
        sourceHash: fp.hash,
        destinationHash: destFp.hash,
        sourceStatus: fp.status,
        destinationStatus: destFp.status,
        sourceLessonResultsCount: fp.lessonResultsCount,
        destinationLessonResultsCount: destFp.lessonResultsCount,
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

  const pendingCount = newerDestinationPendingReconcile.length;
  return {
    sourceCount: (sourceManifest.fingerprints || []).length,
    destinationCount: destById.size,
    matchedCount: exactMatches.length,
    exactMatches: exactMatches.length,
    newerDestination: pendingCount,
    newerDestinationPendingReconcileCount: pendingCount,
    newerDestinationPendingReconcile,
    newerDestinationReconciledCount: 0,
    newerDestinationReconciled: [],
    missingCount: missing.length,
    hashMismatchCount: hashMismatch.length,
    conflictCount: conflicts.length,
    missing,
    hashMismatch,
    conflicts,
    // Backward-compatible alias (pending only — not yet safe).
    newerDestinationDetails: newerDestinationPendingReconcile,
    cutoverAllowed:
      missing.length === 0
      && hashMismatch.length === 0
      && conflicts.length === 0
      && pendingCount === 0,
  };
}

/**
 * Explicitly validate destination-newer rows against the CURRENT live llh_store job state.
 *
 * Preferred Stage 2 rule:
 * 1. re-read live llh_store
 * 2. locate same job id
 * 3. compare live full payload to dedicated newer row
 * 4. hashes match → accept refreshed version
 * 5. live still newer → pending (migrate/reconcile then reverify)
 * 6. same/later timestamps disagree in payload → STOP unsafe conflict
 * 7. live still equals old preflight source → STOP / pending reconciliation
 */
function reconcileNewerDestinationsAgainstLive({
  verification,
  destinationJobs,
  liveStore,
} = {}) {
  if (!verification || typeof verification !== "object") {
    const err = new Error("Destination verification missing for newer-destination reconcile.");
    err.code = "stage2_verification_missing";
    throw err;
  }

  const pending = Array.isArray(verification.newerDestinationPendingReconcile)
    ? verification.newerDestinationPendingReconcile
    : [];
  if (pending.length === 0) {
    return {
      ...verification,
      newerDestinationPendingReconcileCount: 0,
      cutoverAllowed:
        verification.missingCount === 0
        && verification.hashMismatchCount === 0
        && verification.conflictCount === 0,
    };
  }

  const destById = new Map();
  for (const raw of destinationJobs || []) {
    const job = jobApi.normalizeOperatorJob(raw || {});
    if (job.id) destById.set(job.id, job);
  }
  const liveBag = jobApi.normalizeOperatorJobStore(liveStore?.curriculumOperatorJobs);
  const liveById = new Map();
  for (const job of liveBag.jobs || []) {
    if (job?.id) liveById.set(job.id, job);
  }

  const stillPending = [];
  const reconciled = [];
  const conflicts = [...(verification.conflicts || [])];

  for (const item of pending) {
    const dest = destById.get(item.id);
    const live = liveById.get(item.id);
    if (!dest) {
      conflicts.push({ id: item.id, reason: "destination_newer_missing_during_reconcile" });
      continue;
    }
    const shapeIssue = validateDestinationJobShape(dest, {
      id: item.id,
      lessonResultsCount: item.sourceLessonResultsCount,
      active: isActiveStatus(item.sourceStatus),
    });
    if (shapeIssue) {
      conflicts.push({
        id: item.id,
        reason: "destination_newer_malformed",
        detail: shapeIssue,
      });
      continue;
    }
    if (!live) {
      stillPending.push({
        ...item,
        reason: "live_job_missing_for_newer_destination",
      });
      continue;
    }

    const liveNorm = jobApi.normalizeOperatorJob(live);
    const destNorm = jobApi.normalizeOperatorJob(dest);
    const liveHash = stableSha256(liveNorm);
    const destHash = stableSha256(destNorm);
    const liveMs = Date.parse(liveNorm.updatedAt || "") || 0;
    const destMs = Date.parse(destNorm.updatedAt || "") || 0;
    const sourceMs = Date.parse(item.sourceUpdatedAt || "") || 0;

    if (liveHash === destHash) {
      reconciled.push({
        id: item.id,
        reason: "live_matches_destination",
        destinationHash: destHash,
        liveUpdatedAt: liveNorm.updatedAt,
      });
      continue;
    }

    if (liveMs === destMs && liveHash !== destHash) {
      conflicts.push({
        id: item.id,
        reason: "same_timestamp_hash_mismatch",
        liveHash,
        destinationHash: destHash,
        updatedAt: liveNorm.updatedAt,
      });
      continue;
    }

    if (liveMs > destMs) {
      stillPending.push({
        ...item,
        reason: "live_newer_needs_migrate",
        liveUpdatedAt: liveNorm.updatedAt,
        liveHash,
      });
      continue;
    }

    // Live still at/behind preflight source while dedicated claims newer → must reconcile first.
    if (liveHash === item.sourceHash || liveMs <= sourceMs) {
      stillPending.push({
        ...item,
        reason: "live_still_equals_old_source",
        liveUpdatedAt: liveNorm.updatedAt,
        liveHash,
      });
      continue;
    }

    conflicts.push({
      id: item.id,
      reason: "newer_destination_live_divergence",
      liveHash,
      destinationHash: destHash,
      sourceHash: item.sourceHash,
    });
  }

  const missingCount = verification.missingCount || 0;
  const hashMismatchCount = verification.hashMismatchCount || 0;
  const conflictCount = conflicts.length;
  const pendingCount = stillPending.length;

  return {
    ...verification,
    conflicts,
    conflictCount,
    newerDestinationPendingReconcile: stillPending,
    newerDestinationPendingReconcileCount: pendingCount,
    newerDestination: pendingCount,
    newerDestinationDetails: stillPending,
    newerDestinationReconciled: reconciled,
    newerDestinationReconciledCount: reconciled.length,
    matchedCount: (verification.exactMatches || 0) + reconciled.length,
    cutoverAllowed:
      missingCount === 0
      && hashMismatchCount === 0
      && conflictCount === 0
      && pendingCount === 0,
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
  if ((verification.newerDestinationPendingReconcileCount || 0) > 0) {
    const err = new Error(
      `Cutover blocked: ${verification.newerDestinationPendingReconcileCount} `
      + "destination-newer row(s) pending live reconciliation.",
    );
    err.code = "stage2_newer_destination_unreconciled";
    err.details = verification.newerDestinationPendingReconcile;
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
 * Fail-closed Postgres session read-only enforcement for Stage 2 preflight.
 * Does not issue any write DML against application tables.
 */
async function enforcePostgresSessionReadOnly(client) {
  if (!client || typeof client.query !== "function") {
    const err = new Error("Refusing Postgres preflight: client required for read-only enforcement.");
    err.code = "stage2_postgres_readonly_set_failed";
    throw err;
  }

  try {
    await client.query("SET default_transaction_read_only = on");
  } catch (error) {
    const err = new Error(
      `Refusing Postgres preflight: failed to SET default_transaction_read_only=on (${error.message || error}).`,
    );
    err.code = "stage2_postgres_readonly_set_failed";
    err.cause = error;
    throw err;
  }

  let defaultShow;
  try {
    defaultShow = await client.query("SHOW default_transaction_read_only");
  } catch (error) {
    const err = new Error(
      `Refusing Postgres preflight: failed to SHOW default_transaction_read_only (${error.message || error}).`,
    );
    err.code = "stage2_postgres_readonly_confirm_failed";
    err.cause = error;
    throw err;
  }
  const defaultVal = String(
    defaultShow?.rows?.[0]?.default_transaction_read_only
    ?? Object.values(defaultShow?.rows?.[0] || {})[0]
    ?? "",
  ).trim().toLowerCase();
  if (defaultVal !== "on") {
    const err = new Error(
      `Refusing Postgres preflight: default_transaction_read_only is "${defaultVal}", expected "on".`,
    );
    err.code = "stage2_postgres_readonly_confirm_failed";
    throw err;
  }

  try {
    await client.query("BEGIN READ ONLY");
  } catch (error) {
    const err = new Error(
      `Refusing Postgres preflight: BEGIN READ ONLY failed (${error.message || error}).`,
    );
    err.code = "stage2_postgres_readonly_set_failed";
    err.cause = error;
    throw err;
  }

  let txnShow;
  try {
    txnShow = await client.query("SHOW transaction_read_only");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    const err = new Error(
      `Refusing Postgres preflight: failed to SHOW transaction_read_only (${error.message || error}).`,
    );
    err.code = "stage2_postgres_readonly_confirm_failed";
    err.cause = error;
    throw err;
  }
  const txnVal = String(
    txnShow?.rows?.[0]?.transaction_read_only
    ?? Object.values(txnShow?.rows?.[0] || {})[0]
    ?? "",
  ).trim().toLowerCase();
  if (txnVal !== "on") {
    await client.query("ROLLBACK").catch(() => {});
    const err = new Error(
      `Refusing Postgres preflight: transaction_read_only is "${txnVal}", expected "on".`,
    );
    err.code = "stage2_postgres_readonly_confirm_failed";
    throw err;
  }

  return {
    readOnly: true,
    defaultTransactionReadOnly: defaultVal,
    transactionReadOnly: txnVal,
  };
}

/**
 * Explicitly end a Stage 2 read-only preflight transaction with ROLLBACK.
 * Fail closed if ROLLBACK cannot be completed — never silently continue.
 * Never issues COMMIT or write DML.
 */
async function endPostgresReadOnlyTransaction(client, { reason = "preflight_complete" } = {}) {
  if (!client || typeof client.query !== "function") {
    const err = new Error("Refusing Postgres preflight cleanup: client required for ROLLBACK.");
    err.code = "stage2_postgres_readonly_rollback_failed";
    throw err;
  }
  try {
    await client.query("ROLLBACK");
  } catch (error) {
    const err = new Error(
      `Refusing Postgres preflight cleanup: ROLLBACK failed (${error.message || error}).`,
    );
    err.code = "stage2_postgres_readonly_rollback_failed";
    err.cause = error;
    err.reason = reason;
    throw err;
  }
  return { rolledBack: true, reason };
}

/**
 * ROLLBACK (fail closed) then close the client. Used after read-only inspection.
 */
async function rollbackAndEndPostgresReadOnlyClient(client, options = {}) {
  if (!client) return { rolledBack: false, ended: false };
  try {
    await endPostgresReadOnlyTransaction(client, options);
  } catch (error) {
    await client.end().catch(() => {});
    throw error;
  }
  await client.end().catch(() => {});
  return { rolledBack: true, ended: true };
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
  liveStoreForReconcile = null,
  runId: providedRunId = null,
} = {}) {
  const runId = providedRunId || newRunId();
  const sourceManifest = buildSourceManifest(store, {
    runId,
    storeUpdatedAtExact: expectations.expectedStoreUpdatedAt
      || expectations.fixtureStoreUpdatedAtExact
      || "fixture-cas",
    productionBuildSha: expectations.expectedProductionBuildSha || "fixture-build",
  });
  assertBackupGate(backup);
  assertBackupMatchesSource(backup, sourceManifest, {
    allowFixture: true,
    requireProductionGrade: false,
  });
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
  let verification = verifyDestinationAgainstSource(sourceManifest, destinationJobs);
  if ((verification.newerDestinationPendingReconcileCount || 0) > 0) {
    verification = reconcileNewerDestinationsAgainstLive({
      verification,
      destinationJobs,
      liveStore: liveStoreForReconcile || store,
    });
  }
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
 * Same-timestamp divergent FULL payloads STOP (do not guess).
 * Hot-store stubs (hotStoreStub=true on the raw live row) may be restored from full backup.
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
  const liveRawJobs = Array.isArray(liveStore?.curriculumOperatorJobs?.jobs)
    ? liveStore.curriculumOperatorJobs.jobs
    : [];
  const byId = new Map();
  for (const job of backupBag.jobs) {
    if (job?.id) byId.set(job.id, job);
  }
  for (const liveRaw of liveRawJobs) {
    if (!liveRaw?.id) continue;
    const liveNorm = jobApi.normalizeOperatorJob(liveRaw);
    const backed = byId.get(liveNorm.id);
    if (!backed) {
      byId.set(liveNorm.id, liveNorm);
      continue;
    }
    const backedNorm = jobApi.normalizeOperatorJob(backed);
    const liveMs = Date.parse(liveNorm.updatedAt || "") || 0;
    const backedMs = Date.parse(backedNorm.updatedAt || "") || 0;
    const liveHash = stableSha256(liveNorm);
    const backedHash = stableSha256(backedNorm);
    if (liveMs > backedMs) {
      byId.set(liveNorm.id, liveNorm);
      continue;
    }
    if (liveMs === backedMs && liveHash !== backedHash) {
      // Compatibility stubs share updatedAt with the full backup row — restore full backup.
      if (liveRaw.hotStoreStub === true && backedNorm.hotStoreStub !== true) {
        continue; // keep backup already in map
      }
      const err = new Error(
        `Rollback blocked: same-timestamp divergent payloads for job ${liveNorm.id}.`,
      );
      err.code = "stage2_rollback_same_timestamp_conflict";
      err.details = {
        id: liveNorm.id,
        updatedAt: liveNorm.updatedAt,
        liveHash,
        backupHash: backedHash,
        liveHotStoreStub: liveRaw.hotStoreStub === true,
      };
      throw err;
    }
    // liveMs < backedMs → keep backup; equal hashes → either fine (keep backup already in map)
  }
  return {
    wrote: true,
    curriculumOperatorJobs: jobApi.normalizeOperatorJobStore({
      jobs: Array.from(byId.values()),
      updatedAt: nowIso(),
    }),
  };
}

/**
 * One-time maintenance CLI authorization for Stage 2 production apply.
 * Must be passed explicitly as a CLI flag value — NEVER read from env,
 * NEVER persisted, NEVER enables runtime/boot/HTTP cutover.
 */
const STAGE2_PRODUCTION_EXECUTION_AUTHORIZATION =
  "STAGE2-PRODUCTION-EXECUTION-AUTHORIZED-v1";

/**
 * Gate for --postgres --apply.
 * Missing token → stage2_production_apply_locked
 * Wrong token → stage2_production_authorization_invalid
 * Correct token → allow THIS process invocation only (caller still needs all other gates).
 */
function assertProductionApplyUnlocked(args = {}) {
  const provided = String(
    args.authorizeStage2ProductionExecution
    ?? args.authorizationToken
    ?? "",
  ).trim();

  if (!provided) {
    const err = new Error(
      "Stage 2 production Postgres apply is NOT unlocked. "
      + "Pass --authorize-stage2-production-execution <token> on the maintenance CLI "
      + "after explicit review. Authorization alone does nothing without --apply and all gates.",
    );
    err.code = "stage2_production_apply_locked";
    err.args = {
      apply: Boolean(args.apply),
      postgres: Boolean(args.postgres),
      confirmMigrate: Boolean(args.confirmMigrate),
      confirmCutover: Boolean(args.confirmCutover),
      authorizationProvided: false,
    };
    throw err;
  }

  if (provided !== STAGE2_PRODUCTION_EXECUTION_AUTHORIZATION) {
    const err = new Error(
      "Stage 2 production authorization token is invalid. "
      + "Refusing --postgres --apply.",
    );
    err.code = "stage2_production_authorization_invalid";
    err.args = {
      apply: Boolean(args.apply),
      postgres: Boolean(args.postgres),
      confirmMigrate: Boolean(args.confirmMigrate),
      confirmCutover: Boolean(args.confirmCutover),
      authorizationProvided: true,
    };
    throw err;
  }

  return {
    authorized: true,
    scope: "cli-process-only",
    persistent: false,
    runtimeCutoverEnabled: false,
  };
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
  REQUIRED_BACKUP_SOURCE,
  BACKUP_KIND_FIXTURE,
  BACKUP_KIND_PRODUCTION,
  LLH_STORE_UPDATED_AT_EXACT_SQL,
  newRunId,
  stableSha256,
  fingerprintJob,
  buildSourceManifest,
  buildBackupProof,
  isFixtureBackupProof,
  isProductionGradeBackupProof,
  planDedicatedMigration,
  validateDestinationJobShape,
  verifyDestinationAgainstSource,
  reconcileNewerDestinationsAgainstLive,
  assertCutoverVerificationGate,
  detectSourceDrift,
  buildHotBagPreview,
  assertActiveJobsRemainFull,
  assertBackupGate,
  assertBackupMatchesSource,
  assertExpectedSourceGates,
  enforcePostgresSessionReadOnly,
  endPostgresReadOnlyTransaction,
  rollbackAndEndPostgresReadOnlyClient,
  simulateStage2OnFixtureStore,
  simulateRollbackFromBackup,
  assertProductionApplyUnlocked,
  STAGE2_PRODUCTION_EXECUTION_AUTHORIZATION,
  buildAuditReport,
  byteLen,
};
