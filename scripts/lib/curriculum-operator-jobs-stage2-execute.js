/**
 * Stage 2 curriculumOperatorJobs OFFLOAD — EXECUTION ENGINE.
 *
 * Implements the reviewed production-capable maintenance sequence from PR #800.
 *
 * HARD LOCK (this PR):
 *   assertProductionApplyUnlocked() ALWAYS throws for --postgres --apply.
 *   A separate tiny authorization PR is required to unlock production execution.
 *
 * Normal app runtime is unchanged: isHotStoreCutoverEnabled() stays false.
 * No HTTP route / boot migration / env unlock switch.
 */
"use strict";

const crypto = require("node:crypto");
const jobApi = require("../curriculum-operator-job.js");
const stage2 = require("./curriculum-operator-jobs-stage2.js");
const {
  createCurriculumOperatorJobStore,
  buildHotStoreJobBag,
  isActiveStatus,
} = require("../../server/curriculum-operator-job-store.js");

/** Matches server/index.js + enrichment-history-postgres-apply.js */
const FOUNDING_ADVISORY_LOCK_NS = 87442201;

const POSTGRES_SELECT_STORE_ROW = `
SELECT id, data, updated_at, ${stage2.LLH_STORE_UPDATED_AT_EXACT_SQL} AS updated_at_exact
FROM llh_store
WHERE id = $1
LIMIT 1
`;

const POSTGRES_SELECT_STORE_ROW_FOR_UPDATE = `
SELECT id, data, updated_at, ${stage2.LLH_STORE_UPDATED_AT_EXACT_SQL} AS updated_at_exact
FROM llh_store
WHERE id = $1
FOR UPDATE
`;

const POSTGRES_UPDATE_STORE_IF_UNCHANGED = `
UPDATE llh_store
SET data = $2::jsonb, updated_at = NOW()
WHERE id = $1 AND updated_at IS NOT DISTINCT FROM $3::timestamptz
RETURNING id, updated_at, ${stage2.LLH_STORE_UPDATED_AT_EXACT_SQL} AS updated_at_exact
`;

function resolveStoreRecordId(env = process.env) {
  return String(env.LLH_STORE_RECORD_ID || "launch-store").trim() || "launch-store";
}

function normalizeUpdatedAtExact(value) {
  return String(value ?? "").trim();
}

function inventorySnapshot(store) {
  return {
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
  };
}

function backupInventoryCounts(store) {
  return {
    users: Object.keys(store?.users || {}).length,
    messages: Array.isArray(store?.messages) ? store.messages.length : 0,
    foundingMembers: Array.isArray(store?.foundingMembers) ? store.foundingMembers.length : 0,
    notifications: Array.isArray(store?.notifications) ? store.notifications.length : 0,
    supportTickets: Array.isArray(store?.supportTickets) ? store.supportTickets.length : 0,
  };
}

/**
 * Operator-jobs-only transform invariant (curriculum/users/billing/etc unchanged).
 */
function assertOperatorJobsOnlyTransform(beforeStore, afterStore) {
  const beforeKeys = Object.keys(beforeStore || {}).sort();
  const afterKeys = Object.keys(afterStore || {}).sort();
  if (JSON.stringify(beforeKeys) !== JSON.stringify(afterKeys)) {
    throw new Error("Safety abort: top-level store keys changed.");
  }
  for (const key of beforeKeys) {
    if (key === "curriculumOperatorJobs") continue;
    if (JSON.stringify(beforeStore[key] ?? null) !== JSON.stringify(afterStore[key] ?? null)) {
      const err = new Error(`Safety abort: unexpected top-level field changed: ${key}`);
      err.code = "stage2_operator_jobs_only_violation";
      throw err;
    }
  }
  return true;
}

/**
 * Create durable llh_store_backups row bound to the exact source store.
 * Mirrors server createLogicalStoreBackup semantics (verified flag + fingerprint bind).
 */
async function createDurableStage2Backup(client, store, {
  runId,
  productionBuildSha = null,
  storeUpdatedAtExact = null,
  sourceManifest = null,
} = {}) {
  if (!client || typeof client.query !== "function") {
    const err = new Error("Durable backup requires a Postgres client.");
    err.code = "stage2_backup_client_missing";
    throw err;
  }
  if (!store || typeof store !== "object") {
    const err = new Error("Durable backup requires the exact source store.");
    err.code = "stage2_backup_store_missing";
    throw err;
  }

  const counts = backupInventoryCounts(store);
  const source = stage2.REQUIRED_BACKUP_SOURCE;
  const id = `backup_${new Date().toISOString().replace(/[:.]/g, "-")}_${source}`;
  const payload = JSON.stringify(store);
  const storeFingerprint = stage2.stableSha256(store);

  await client.query(
    `INSERT INTO llh_store_backups (
      id, source, user_count, message_count, founding_count,
      notification_count, support_ticket_count, verified, data
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,$8::jsonb)`,
    [
      id,
      source,
      counts.users,
      counts.messages,
      counts.foundingMembers,
      counts.notifications,
      counts.supportTickets,
      payload,
    ],
  );

  const verify = await client.query(
    `SELECT id, created_at, source, verified, user_count, message_count, founding_count, data
     FROM llh_store_backups WHERE id = $1`,
    [id],
  );
  const row = verify.rows[0];
  if (!row) {
    const err = new Error(`Backup insert verification failed: ${id}`);
    err.code = "stage2_backup_verify_failed";
    throw err;
  }
  const countsOk = Number(row.user_count) === counts.users
    && Number(row.message_count) === counts.messages
    && Number(row.founding_count) === counts.foundingMembers;
  const fpOk = stage2.stableSha256(row.data) === storeFingerprint;
  if (!countsOk || !fpOk) {
    const err = new Error("Backup verification failed: counts/fingerprint mismatch.");
    err.code = "stage2_backup_verify_failed";
    throw err;
  }
  await client.query("UPDATE llh_store_backups SET verified = TRUE WHERE id = $1", [id]);

  const manifest = sourceManifest || stage2.buildSourceManifest(store, {
    runId,
    productionBuildSha,
    storeUpdatedAtExact,
    storeFingerprint,
  });

  const proof = stage2.buildBackupProof({
    kind: stage2.BACKUP_KIND_PRODUCTION,
    id,
    verified: true,
    source,
    migrationRunId: runId || manifest.runId,
    productionBuildSha: productionBuildSha || manifest.productionBuildSha,
    sourceJobCount: manifest.jobCount,
    sourceAggregateHash: manifest.aggregateHash,
    storeUpdatedAtExact: storeUpdatedAtExact || manifest.storeUpdatedAtExact,
    storeFingerprint,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  });

  stage2.assertBackupMatchesSource(proof, {
    ...manifest,
    runId: proof.migrationRunId,
    storeUpdatedAtExact: proof.storeUpdatedAtExact,
    storeFingerprint,
    productionBuildSha: proof.productionBuildSha,
  }, { requireProductionGrade: true, requireBuildBinding: Boolean(proof.productionBuildSha) });

  return {
    backupId: id,
    proof,
    storeFingerprint,
    verified: true,
  };
}

/**
 * Idempotent dedicated migration. Never hot-caps. Stops on unsafe same-timestamp conflicts.
 */
async function migrateHistoricalJobsToDedicated({
  sourceJobs,
  operatorJobStore,
} = {}) {
  if (!operatorJobStore) {
    const err = new Error("Dedicated operator job store required for migration.");
    err.code = "stage2_job_store_missing";
    throw err;
  }
  const jobs = Array.isArray(sourceJobs) ? sourceJobs : [];
  const existing = operatorJobStore.listJobsSync({ limit: 500 });
  const destById = new Map(existing.map((j) => [String(j.id), j]));
  const plan = stage2.planDedicatedMigration(jobs, destById);
  if (!plan.safe) {
    const err = new Error("Dedicated migration blocked: unsafe same-timestamp hash conflicts.");
    err.code = "stage2_migration_unsafe_conflict";
    err.details = plan.conflicts.filter((c) => c.kind === "unsafe_same_updated_at_hash_mismatch");
    throw err;
  }

  const applied = [];
  const skipped = [];
  for (const item of plan.plannedUpserts) {
    const result = await operatorJobStore.upsertJob(item.job);
    if (result.skipped) skipped.push({ id: item.id, reason: result.reason });
    else applied.push({ id: item.id, reason: item.reason });
  }
  for (const s of plan.skips) skipped.push(s);
  for (const c of plan.conflicts) {
    if (c.kind === "destination_newer") skipped.push({ id: c.id, reason: "destination_newer" });
  }

  const destinationJobs = operatorJobStore.listJobsSync({ limit: 500 });
  return {
    applied,
    skipped,
    plannedCount: plan.plannedCount,
    destinationJobs,
    wroteHotStore: false,
  };
}

/**
 * Verify destination + reconcile newer rows against live store. Fail closed.
 */
function verifyAndReconcileDestination({
  sourceManifest,
  destinationJobs,
  liveStore,
} = {}) {
  let verification = stage2.verifyDestinationAgainstSource(sourceManifest, destinationJobs);
  if ((verification.newerDestinationPendingReconcileCount || 0) > 0) {
    verification = stage2.reconcileNewerDestinationsAgainstLive({
      verification,
      destinationJobs,
      liveStore,
    });
  }
  stage2.assertCutoverVerificationGate(verification);
  return verification;
}

/**
 * Conditional CAS hot-bag rewrite. Operator-jobs section only.
 */
async function applyHotBagCasRewrite({
  client,
  storeRecordId = resolveStoreRecordId(),
  sourceStore,
  sourceUpdatedAtExact,
  sourceFingerprint,
  sourceAggregateHash,
  sourceJobCount,
  hotBag,
  backupId,
} = {}) {
  if (!client) {
    const err = new Error("CAS rewrite requires Postgres client.");
    err.code = "stage2_cas_client_missing";
    throw err;
  }
  if (!backupId) {
    const err = new Error("CAS rewrite requires verified backup id.");
    err.code = "stage2_backup_missing";
    throw err;
  }
  const casToken = normalizeUpdatedAtExact(sourceUpdatedAtExact);
  if (!casToken) {
    const err = new Error("CAS rewrite requires exact updated_at::text token.");
    err.code = "stage2_cas_token_missing";
    throw err;
  }
  if (!sourceFingerprint || !sourceAggregateHash) {
    const err = new Error("CAS rewrite requires source fingerprint and aggregate hash.");
    err.code = "stage2_cas_source_binding_missing";
    throw err;
  }

  const nextStore = {
    ...sourceStore,
    curriculumOperatorJobs: hotBag,
  };
  assertOperatorJobsOnlyTransform(sourceStore, nextStore);
  stage2.assertActiveJobsRemainFull(hotBag);
  const nextFingerprint = stage2.stableSha256(nextStore);
  const payload = JSON.stringify(nextStore);

  let writeCount = 0;
  let casAfter = null;
  await client.query("BEGIN");
  try {
    await client.query(
      "SELECT pg_advisory_xact_lock($1, hashtext($2))",
      [FOUNDING_ADVISORY_LOCK_NS, `founding:${storeRecordId}`],
    );
    const locked = await client.query(POSTGRES_SELECT_STORE_ROW_FOR_UPDATE, [storeRecordId]);
    if (!locked.rows.length) {
      const err = new Error(`llh_store row missing under lock (${storeRecordId}).`);
      err.code = "stage2_cas_row_missing";
      throw err;
    }
    const live = locked.rows[0];
    const liveExact = normalizeUpdatedAtExact(live.updated_at_exact);
    if (!liveExact || liveExact !== casToken) {
      const err = new Error(
        `CAS conflict: live updated_at_exact "${liveExact}" != expected "${casToken}".`,
      );
      err.code = "stage2_cas_conflict";
      throw err;
    }
    if (stage2.stableSha256(live.data) !== sourceFingerprint) {
      const err = new Error("CAS conflict: store fingerprint changed since preflight.");
      err.code = "stage2_cas_fingerprint_mismatch";
      throw err;
    }
    const liveManifest = stage2.buildSourceManifest(live.data, {
      storeUpdatedAtExact: liveExact,
      storeFingerprint: stage2.stableSha256(live.data),
    });
    if (liveManifest.jobCount !== Number(sourceJobCount)
      || liveManifest.aggregateHash !== String(sourceAggregateHash)) {
      const err = new Error("CAS conflict: operator source count/hash changed under lock.");
      err.code = "stage2_cas_source_drift";
      throw err;
    }

    const updated = await client.query(
      POSTGRES_UPDATE_STORE_IF_UNCHANGED,
      [storeRecordId, payload, casToken],
    );
    if (!updated.rowCount) {
      const err = new Error("CAS UPDATE affected 0 rows (concurrency mismatch).");
      err.code = "stage2_cas_conflict";
      throw err;
    }
    writeCount = 1;
    casAfter = normalizeUpdatedAtExact(updated.rows[0]?.updated_at_exact);
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw error;
  }

  const reread = await client.query(POSTGRES_SELECT_STORE_ROW, [storeRecordId]);
  const after = reread.rows[0]?.data;
  if (!after || stage2.stableSha256(after) !== nextFingerprint) {
    const err = new Error(
      `HARD FAILURE: post-write fingerprint mismatch. Restore from backup ${backupId} may be required.`,
    );
    err.code = "stage2_post_write_verification_failed";
    err.backupId = backupId;
    throw err;
  }
  try {
    assertOperatorJobsOnlyTransform(sourceStore, after);
    stage2.assertActiveJobsRemainFull(after.curriculumOperatorJobs);
  } catch (error) {
    const err = new Error(
      `HARD FAILURE: post-write invariant failed (${error.message}). `
      + `Restore from backup ${backupId} may be required.`,
    );
    err.code = "stage2_post_write_verification_failed";
    err.backupId = backupId;
    err.cause = error;
    throw err;
  }

  return {
    wrote: true,
    writeCount,
    casAfter,
    afterStore: after,
    operatorBytesAfter: stage2.byteLen(after.curriculumOperatorJobs),
    llhStoreBytesAfter: stage2.byteLen(after),
    inventoryAfter: inventorySnapshot(after),
  };
}

/**
 * Production rollback path (CAS). Leaves dedicated rows intact by default.
 */
async function applyStage2RollbackCas({
  client,
  storeRecordId = resolveStoreRecordId(),
  liveStore,
  backupStore,
  expectedLiveUpdatedAtExact,
  backupId,
} = {}) {
  if (!client) {
    const err = new Error("Rollback requires Postgres client.");
    err.code = "stage2_rollback_client_missing";
    throw err;
  }
  if (!backupId) {
    const err = new Error("Rollback requires verified backup id.");
    err.code = "stage2_backup_missing";
    throw err;
  }
  const casToken = normalizeUpdatedAtExact(expectedLiveUpdatedAtExact);
  if (!casToken) {
    const err = new Error("Rollback requires exact live CAS token.");
    err.code = "stage2_cas_token_missing";
    throw err;
  }

  // Merge in-memory first (throws on same-timestamp full divergence).
  const merged = stage2.simulateRollbackFromBackup({
    liveStore,
    backupStore,
    expectedLiveUpdatedAt: casToken,
    liveUpdatedAt: casToken,
  });
  const nextStore = {
    ...liveStore,
    curriculumOperatorJobs: merged.curriculumOperatorJobs,
  };
  assertOperatorJobsOnlyTransform(liveStore, nextStore);
  const nextFingerprint = stage2.stableSha256(nextStore);
  const liveFingerprint = stage2.stableSha256(liveStore);
  const payload = JSON.stringify(nextStore);

  let writeCount = 0;
  let casAfter = null;
  await client.query("BEGIN");
  try {
    await client.query(
      "SELECT pg_advisory_xact_lock($1, hashtext($2))",
      [FOUNDING_ADVISORY_LOCK_NS, `founding:${storeRecordId}`],
    );
    const locked = await client.query(POSTGRES_SELECT_STORE_ROW_FOR_UPDATE, [storeRecordId]);
    if (!locked.rows.length) {
      const err = new Error(`Rollback: llh_store missing under lock (${storeRecordId}).`);
      err.code = "stage2_cas_row_missing";
      throw err;
    }
    const live = locked.rows[0];
    const liveExact = normalizeUpdatedAtExact(live.updated_at_exact);
    if (!liveExact || liveExact !== casToken) {
      const err = new Error("Rollback CAS conflict: llh_store updated_at changed.");
      err.code = "stage2_rollback_cas_conflict";
      throw err;
    }
    if (stage2.stableSha256(live.data) !== liveFingerprint) {
      const err = new Error("Rollback CAS conflict: live store fingerprint changed.");
      err.code = "stage2_rollback_cas_conflict";
      throw err;
    }
    const updated = await client.query(
      POSTGRES_UPDATE_STORE_IF_UNCHANGED,
      [storeRecordId, payload, casToken],
    );
    if (!updated.rowCount) {
      const err = new Error("Rollback CAS UPDATE affected 0 rows.");
      err.code = "stage2_rollback_cas_conflict";
      throw err;
    }
    writeCount = 1;
    casAfter = normalizeUpdatedAtExact(updated.rows[0]?.updated_at_exact);
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw error;
  }

  const reread = await client.query(POSTGRES_SELECT_STORE_ROW, [storeRecordId]);
  const after = reread.rows[0]?.data;
  if (!after || stage2.stableSha256(after) !== nextFingerprint) {
    const err = new Error(
      `HARD FAILURE: rollback post-write fingerprint mismatch. Backup ${backupId}.`,
    );
    err.code = "stage2_post_write_verification_failed";
    err.backupId = backupId;
    throw err;
  }

  return {
    wrote: true,
    writeCount,
    casAfter,
    afterStore: after,
    dedicatedRowsIntact: true,
  };
}

/**
 * Full Stage 2 execution pipeline.
 *
 * mode:
 *   - "fixture": in-process / mock client — may apply for tests
 *   - "postgres": real DB — --apply ALWAYS blocked by assertProductionApplyUnlocked in this PR
 */
async function runStage2Execution(options = {}) {
  const {
    mode = "fixture",
    apply = false,
    confirmMigrate = false,
    confirmCutover = false,
    client = null,
    store: inputStore = null,
    storeUpdatedAtExact = null,
    productionBuildSha = null,
    storeRecordId = resolveStoreRecordId(),
    operatorJobStore = null,
    expectedSourceCount = null,
    expectedSourceHash = null,
    expectedStoreUpdatedAt = null,
    skipBackupCreate = false,
    preexistingBackupProof = null,
    runId: providedRunId = null,
  } = options;

  // FINAL HARD LOCK — production Postgres apply remains impossible in this PR.
  if (mode === "postgres" && apply) {
    stage2.assertProductionApplyUnlocked({
      apply: true,
      postgres: true,
      confirmMigrate,
      confirmCutover,
    });
  }

  if (apply && !confirmMigrate) {
    const err = new Error("Apply requires --confirm-migrate-operator-jobs.");
    err.code = "stage2_confirm_migrate_required";
    throw err;
  }
  if (apply && confirmCutover && !confirmMigrate) {
    const err = new Error("Hot-store cutover requires migrate confirmation.");
    err.code = "stage2_confirm_migrate_required";
    throw err;
  }

  const runId = providedRunId || stage2.newRunId();
  let store = inputStore;
  let casExact = storeUpdatedAtExact;

  if (mode === "postgres" && client && !store) {
    const row = await client.query(POSTGRES_SELECT_STORE_ROW, [storeRecordId]);
    if (!row.rows[0]?.data) {
      throw new Error(`No llh_store row for id=${storeRecordId}`);
    }
    store = row.rows[0].data;
    casExact = normalizeUpdatedAtExact(row.rows[0].updated_at_exact);
  }
  if (!store || typeof store !== "object") {
    const err = new Error("Stage 2 execution requires a source store.");
    err.code = "stage2_store_missing";
    throw err;
  }
  if (!casExact) casExact = "fixture-cas";

  // 1–2 Preflight + source manifest
  const sourceManifest = stage2.buildSourceManifest(store, {
    runId,
    productionBuildSha,
    storeUpdatedAtExact: casExact,
  });
  stage2.assertExpectedSourceGates(sourceManifest, {
    expectedSourceCount,
    expectedSourceHash: expectedSourceHash || undefined,
    expectedStoreUpdatedAt: expectedStoreUpdatedAt || undefined,
  });

  const auditBase = {
    runId,
    productionCommit: productionBuildSha,
    preflightTimestamp: sourceManifest.capturedAt,
    sourceCount: sourceManifest.jobCount,
    sourceAggregateHash: sourceManifest.aggregateHash,
    inventoryBefore: inventorySnapshot(store),
    casBefore: casExact,
    operatorBytesBefore: sourceManifest.operatorSectionBytes,
    llhStoreBytesBefore: sourceManifest.llhStoreTextBytes,
    activeJobIds: sourceManifest.activeIds,
    wroteProduction: false,
  };

  if (!apply) {
    const preview = stage2.buildHotBagPreview(store);
    return {
      mode,
      wrote: false,
      phase: "preflight",
      sourceManifest,
      preview,
      audit: stage2.buildAuditReport({
        ...auditBase,
        operatorBytesAfter: preview.afterBytes,
        terminalStubCount: preview.terminalStubbed,
      }),
    };
  }

  // 3–4 Durable backup BEFORE any dedicated migration write
  let backupResult = null;
  if (preexistingBackupProof) {
    stage2.assertBackupMatchesSource(preexistingBackupProof, sourceManifest, {
      requireProductionGrade: preexistingBackupProof.kind !== stage2.BACKUP_KIND_FIXTURE,
      allowFixture: preexistingBackupProof.kind === stage2.BACKUP_KIND_FIXTURE,
      requireBuildBinding: Boolean(productionBuildSha),
    });
    backupResult = {
      backupId: preexistingBackupProof.id,
      proof: preexistingBackupProof,
      verified: true,
      storeFingerprint: preexistingBackupProof.storeFingerprint,
    };
  } else if (!skipBackupCreate) {
    if (!client) {
      // Fixture path without client: synthesize durable-shaped proof bound to source,
      // but still require an explicit create hook when client is present.
      const err = new Error(
        "Backup creation requires Postgres client (or preexistingBackupProof for fixture).",
      );
      err.code = "stage2_backup_client_missing";
      throw err;
    }
    try {
      backupResult = await createDurableStage2Backup(client, store, {
        runId,
        productionBuildSha,
        storeUpdatedAtExact: casExact,
        sourceManifest,
      });
    } catch (error) {
      if (!error.code) error.code = "stage2_backup_verify_failed";
      throw error;
    }
  } else {
    const err = new Error("Missing backup gate: verified backup required before migration.");
    err.code = "stage2_backup_missing";
    throw err;
  }

  // 5 Migrate dedicated (no hot-cap)
  const jobStore = operatorJobStore || createCurriculumOperatorJobStore({ localFilePath: null });
  if (!operatorJobStore) {
    if (mode === "postgres" && client) {
      jobStore.configure({
        pool: { query: (...args) => client.query(...args) },
        intendedPostgres: true,
      });
      if (typeof jobStore.initTable === "function") {
        await jobStore.initTable();
      }
    } else {
      jobStore.configure({ intendedPostgres: false });
    }
    await jobStore.loadFromStorage();
  }

  const sourceJobs = jobApi.normalizeOperatorJobStore(store.curriculumOperatorJobs).jobs;
  const migration = await migrateHistoricalJobsToDedicated({
    sourceJobs,
    operatorJobStore: jobStore,
  });

  // 6–8 Destination verify + reconcile
  let liveForReconcile = store;
  if (mode === "postgres" && client) {
    const fresh = await client.query(POSTGRES_SELECT_STORE_ROW, [storeRecordId]);
    if (fresh.rows[0]?.data) liveForReconcile = fresh.rows[0].data;
  }
  let verification = verifyAndReconcileDestination({
    sourceManifest,
    destinationJobs: migration.destinationJobs,
    liveStore: liveForReconcile,
  });

  // 9–10 Drift detection; remigrate/reverify if needed
  const drift = stage2.detectSourceDrift(sourceManifest, liveForReconcile);
  if (drift.changed) {
    const refreshedManifest = drift.liveManifest;
    const remigrate = await migrateHistoricalJobsToDedicated({
      sourceJobs: jobApi.normalizeOperatorJobStore(liveForReconcile.curriculumOperatorJobs).jobs,
      operatorJobStore: jobStore,
    });
    verification = verifyAndReconcileDestination({
      sourceManifest: refreshedManifest,
      destinationJobs: remigrate.destinationJobs,
      liveStore: liveForReconcile,
    });
    store = liveForReconcile;
    Object.assign(sourceManifest, refreshedManifest);
  }

  // 11 Hot-bag preview (no write yet)
  const preview = stage2.buildHotBagPreview(store);
  stage2.assertActiveJobsRemainFull(preview.bag);

  if (!confirmCutover) {
    return {
      mode,
      wrote: true,
      wroteDedicated: true,
      wroteHotStore: false,
      phase: "migrated_verified_preview",
      backup: backupResult,
      migration,
      verification,
      preview,
      audit: stage2.buildAuditReport({
        ...auditBase,
        backupId: backupResult.backupId,
        destinationCount: verification.destinationCount,
        verification,
        operatorBytesAfter: preview.afterBytes,
        terminalStubCount: preview.terminalStubbed,
        rollbackReady: true,
      }),
    };
  }

  // 12–16 CAS hot rewrite (requires confirmCutover). For postgres still locked above.
  if (!client) {
    // Fixture in-memory cutover without SQL client
    const afterStore = {
      ...store,
      curriculumOperatorJobs: preview.bag,
    };
    assertOperatorJobsOnlyTransform(store, afterStore);
    return {
      mode,
      wrote: true,
      wroteDedicated: true,
      wroteHotStore: true,
      phase: "fixture_hot_rewrite",
      backup: backupResult,
      migration,
      verification,
      preview,
      afterStore,
      audit: stage2.buildAuditReport({
        ...auditBase,
        backupId: backupResult.backupId,
        destinationCount: verification.destinationCount,
        verification,
        operatorBytesAfter: preview.afterBytes,
        llhStoreBytesAfter: stage2.byteLen(afterStore),
        inventoryAfter: inventorySnapshot(afterStore),
        terminalStubCount: preview.terminalStubbed,
        rollbackReady: true,
        wroteProduction: false,
      }),
    };
  }

  const casWrite = await applyHotBagCasRewrite({
    client,
    storeRecordId,
    sourceStore: store,
    sourceUpdatedAtExact: casExact,
    sourceFingerprint: sourceManifest.storeFingerprint,
    sourceAggregateHash: sourceManifest.aggregateHash,
    sourceJobCount: sourceManifest.jobCount,
    hotBag: preview.bag,
    backupId: backupResult.backupId,
  });

  // 17–18 Post-write audit
  const hotJobs = jobApi.normalizeOperatorJobStore(casWrite.afterStore.curriculumOperatorJobs).jobs;
  const stubs = hotJobs.filter((j) => j.hotStoreStub === true);
  const activeFull = hotJobs.filter((j) => isActiveStatus(j.status));
  const dual = jobStore.mergeWithLegacyBag(casWrite.afterStore.curriculumOperatorJobs);

  return {
    mode,
    wrote: true,
    wroteDedicated: true,
    wroteHotStore: true,
    phase: "hot_rewrite_complete",
    backup: backupResult,
    migration,
    verification,
    preview,
    casWrite,
    afterStore: casWrite.afterStore,
    postWrite: {
      hotJobCount: hotJobs.length,
      activeFullCount: activeFull.length,
      terminalStubCount: stubs.length,
      dualReadJobCount: dual.jobs.length,
      dualReadHistoricalFull: dual.jobs.filter((j) => (j.lessonResults || []).length > 0).length,
    },
    audit: stage2.buildAuditReport({
      ...auditBase,
      backupId: backupResult.backupId,
      destinationCount: verification.destinationCount,
      verification,
      operatorBytesAfter: casWrite.operatorBytesAfter,
      llhStoreBytesAfter: casWrite.llhStoreBytesAfter,
      inventoryAfter: casWrite.inventoryAfter,
      casAfter: casWrite.casAfter,
      terminalStubCount: stubs.length,
      rollbackReady: true,
      wroteProduction: mode === "postgres",
    }),
  };
}

module.exports = {
  FOUNDING_ADVISORY_LOCK_NS,
  POSTGRES_SELECT_STORE_ROW,
  POSTGRES_SELECT_STORE_ROW_FOR_UPDATE,
  POSTGRES_UPDATE_STORE_IF_UNCHANGED,
  resolveStoreRecordId,
  normalizeUpdatedAtExact,
  inventorySnapshot,
  assertOperatorJobsOnlyTransform,
  createDurableStage2Backup,
  migrateHistoricalJobsToDedicated,
  verifyAndReconcileDestination,
  applyHotBagCasRewrite,
  applyStage2RollbackCas,
  runStage2Execution,
};
