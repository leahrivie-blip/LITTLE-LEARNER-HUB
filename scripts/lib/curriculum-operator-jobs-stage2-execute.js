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
 * Required gates for future production Postgres apply (validated before connect).
 */
function assertPostgresProductionExecutionGates(options = {}) {
  const missing = [];
  if (options.confirmMigrate !== true) missing.push("--confirm-migrate-operator-jobs");
  if (options.confirmCutover === true && options.confirmMigrate !== true) {
    missing.push("--confirm-migrate-operator-jobs (required with cutover)");
  }
  if (options.expectedSourceCount == null || !Number.isFinite(Number(options.expectedSourceCount))) {
    missing.push("--expected-source-count");
  }
  if (!options.expectedSourceHash) missing.push("--expected-source-hash");
  if (!options.expectedStoreUpdatedAt) missing.push("--expected-store-updated-at");
  if (!options.expectedProductionBuildSha && !options.productionBuildSha) {
    missing.push("--expected-production-build-sha");
  }
  if (missing.length) {
    const err = new Error(
      `Refusing production Stage 2 execution: missing required gates: ${missing.join(", ")}.`,
    );
    err.code = "stage2_production_gates_incomplete";
    err.missing = missing;
    throw err;
  }
  return true;
}

function defaultCreatePostgresClient(connectionString) {
  const { Client } = require("pg");
  return new Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
}

/**
 * Connect + load production llh_store + exact CAS + dedicated job store adapter.
 * Does NOT unlock apply. Injectable createClient for tests.
 */
async function preparePostgresStage2ExecutionContext(options = {}) {
  const {
    createClient = defaultCreatePostgresClient,
    connectionString = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL || "",
    storeRecordId = resolveStoreRecordId(),
    productionBuildSha = null,
    expectedProductionBuildSha = null,
  } = options;

  if (!connectionString) {
    const err = new Error("PRODUCTION_DATABASE_URL or DATABASE_URL required for Postgres Stage 2 execution.");
    err.code = "stage2_postgres_url_missing";
    throw err;
  }

  const wantBuild = String(expectedProductionBuildSha || productionBuildSha || "").trim();
  const liveBuild = String(productionBuildSha || process.env.RENDER_GIT_COMMIT || "").trim();
  if (wantBuild && liveBuild && wantBuild !== liveBuild) {
    const err = new Error(
      `Production build SHA mismatch: expected ${wantBuild}, live ${liveBuild}.`,
    );
    err.code = "stage2_production_build_mismatch";
    throw err;
  }

  const client = typeof createClient === "function"
    ? await createClient(connectionString)
    : createClient;
  if (!client || typeof client.connect !== "function" || typeof client.query !== "function") {
    const err = new Error("Postgres Stage 2 execution requires a connected client factory.");
    err.code = "stage2_postgres_client_invalid";
    throw err;
  }

  await client.connect();
  try {
    const row = await client.query(POSTGRES_SELECT_STORE_ROW, [storeRecordId]);
    if (!row.rows[0]?.data) {
      const err = new Error(`No llh_store row for id=${storeRecordId}`);
      err.code = "stage2_store_missing";
      throw err;
    }
    const store = row.rows[0].data;
    const storeUpdatedAtExact = normalizeUpdatedAtExact(row.rows[0].updated_at_exact);
    if (!storeUpdatedAtExact) {
      const err = new Error("llh_store updated_at::text CAS token missing.");
      err.code = "stage2_cas_token_missing";
      throw err;
    }

    const operatorJobStore = createCurriculumOperatorJobStore({ localFilePath: null });
    operatorJobStore.configure({
      pool: { query: (...args) => client.query(...args) },
      intendedPostgres: true,
    });
    await operatorJobStore.initTable();
    await operatorJobStore.loadFromStorage();

    return {
      client,
      store,
      storeUpdatedAtExact,
      storeRecordId,
      operatorJobStore,
      productionBuildSha: wantBuild || liveBuild || null,
      connected: true,
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    try { await client.end(); } catch { /* ignore */ }
    throw error;
  }
}

/**
 * Complete future production wiring helper.
 * CLI must still call assertProductionApplyUnlocked BEFORE this in the current PR.
 * Defense in depth: this helper also locks before any connection factory call.
 */
async function prepareAndRunPostgresStage2Execution(options = {}) {
  // FINAL HARD LOCK — before any connection / client factory (when apply requested).
  if (options.apply === true) {
    stage2.assertProductionApplyUnlocked({
      apply: true,
      postgres: true,
      confirmMigrate: options.confirmMigrate === true,
      confirmCutover: options.confirmCutover === true,
    });
  }

  assertPostgresProductionExecutionGates(options);

  let client = null;
  try {
    const context = await preparePostgresStage2ExecutionContext({
      createClient: options.createClient,
      connectionString: options.connectionString,
      storeRecordId: options.storeRecordId || resolveStoreRecordId(),
      productionBuildSha: options.productionBuildSha,
      expectedProductionBuildSha: options.expectedProductionBuildSha,
    });
    client = context.client;

    const result = await runStage2Execution({
      mode: "postgres",
      apply: options.apply === true,
      confirmMigrate: options.confirmMigrate === true,
      confirmCutover: options.confirmCutover === true,
      client: context.client,
      store: context.store,
      storeUpdatedAtExact: context.storeUpdatedAtExact,
      productionBuildSha: context.productionBuildSha,
      storeRecordId: context.storeRecordId,
      operatorJobStore: context.operatorJobStore,
      expectedSourceCount: options.expectedSourceCount,
      expectedSourceHash: options.expectedSourceHash,
      expectedStoreUpdatedAt: options.expectedStoreUpdatedAt || context.storeUpdatedAtExact,
      expectedProductionBuildSha: options.expectedProductionBuildSha || context.productionBuildSha,
      runId: options.runId || null,
    });
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    try { await client.end(); } catch { /* ignore */ }
    client = null;
    return result;
  } catch (error) {
    if (client) {
      try { await client.query("ROLLBACK"); } catch { /* ignore */ }
      try { await client.end(); } catch { /* ignore */ }
      client = null;
    }
    throw error;
  }
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
    expectedProductionBuildSha = null,
    skipBackupCreate = false,
    preexistingBackupProof = null,
    runId: providedRunId = null,
    // Explicit fixture-only escape hatch — NEVER set for production path.
    allowPostBackupDriftContinue = false,
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

  if (mode === "postgres" && apply) {
    assertPostgresProductionExecutionGates({
      confirmMigrate,
      confirmCutover,
      expectedSourceCount,
      expectedSourceHash,
      expectedStoreUpdatedAt,
      expectedProductionBuildSha: expectedProductionBuildSha || productionBuildSha,
      productionBuildSha,
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
  const effectiveBuildSha = expectedProductionBuildSha || productionBuildSha || null;

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

  const sourceManifest = stage2.buildSourceManifest(store, {
    runId,
    productionBuildSha: effectiveBuildSha,
    storeUpdatedAtExact: casExact,
  });
  stage2.assertExpectedSourceGates(sourceManifest, {
    expectedSourceCount,
    expectedSourceHash: expectedSourceHash || undefined,
    expectedStoreUpdatedAt: expectedStoreUpdatedAt || undefined,
  });
  if (expectedProductionBuildSha || (mode === "postgres" && apply)) {
    const want = String(expectedProductionBuildSha || effectiveBuildSha || "");
    const got = String(sourceManifest.productionBuildSha || "");
    if (!want || want !== got) {
      const err = new Error("Production build SHA expectation mismatch.");
      err.code = "stage2_production_build_mismatch";
      throw err;
    }
  }

  const auditBase = {
    runId,
    productionCommit: effectiveBuildSha,
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

  let backupResult = null;
  if (preexistingBackupProof) {
    stage2.assertBackupMatchesSource(preexistingBackupProof, sourceManifest, {
      requireProductionGrade: preexistingBackupProof.kind !== stage2.BACKUP_KIND_FIXTURE,
      allowFixture: preexistingBackupProof.kind === stage2.BACKUP_KIND_FIXTURE,
      requireBuildBinding: Boolean(effectiveBuildSha),
    });
    backupResult = {
      backupId: preexistingBackupProof.id,
      proof: preexistingBackupProof,
      verified: true,
      storeFingerprint: preexistingBackupProof.storeFingerprint,
    };
  } else if (!skipBackupCreate) {
    if (!client) {
      const err = new Error(
        "Backup creation requires Postgres client (or preexistingBackupProof for fixture).",
      );
      err.code = "stage2_backup_client_missing";
      throw err;
    }
    try {
      backupResult = await createDurableStage2Backup(client, store, {
        runId,
        productionBuildSha: effectiveBuildSha,
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

  let liveForReconcile = store;
  let liveCasExact = casExact;
  if (client) {
    const fresh = await client.query(POSTGRES_SELECT_STORE_ROW, [storeRecordId]);
    if (fresh.rows[0]?.data) {
      liveForReconcile = fresh.rows[0].data;
      liveCasExact = normalizeUpdatedAtExact(fresh.rows[0].updated_at_exact) || casExact;
    }
  }
  let verification = verifyAndReconcileDestination({
    sourceManifest,
    destinationJobs: migration.destinationJobs,
    liveStore: liveForReconcile,
  });

  const drift = stage2.detectSourceDrift(sourceManifest, liveForReconcile);
  const casDrift = liveCasExact && casExact && String(liveCasExact) !== String(casExact);
  if (drift.changed || casDrift) {
    // Production-grade path: NEVER authorize hot cutover under a backup bound to
    // an earlier source snapshot. Operator must rerun preflight + fresh backup.
    // Fixture-only escape hatch may remigrate/rebind for simulation tests.
    if (allowPostBackupDriftContinue === true && mode === "fixture") {
      await migrateHistoricalJobsToDedicated({
        sourceJobs: jobApi.normalizeOperatorJobStore(liveForReconcile.curriculumOperatorJobs).jobs,
        operatorJobStore: jobStore,
      });
      const refreshedManifest = drift.liveManifest || stage2.buildSourceManifest(liveForReconcile, {
        runId,
        productionBuildSha: effectiveBuildSha,
        storeUpdatedAtExact: liveCasExact,
      });
      verification = verifyAndReconcileDestination({
        sourceManifest: refreshedManifest,
        destinationJobs: jobStore.listJobsSync({ limit: 500 }),
        liveStore: liveForReconcile,
      });
      store = liveForReconcile;
      casExact = liveCasExact;
      Object.assign(sourceManifest, refreshedManifest);
    } else {
      const err = new Error(
        "Source drifted after verified backup; fresh preflight + fresh durable backup required before cutover.",
      );
      err.code = "stage2_source_drift_requires_fresh_backup";
      err.details = {
        backupId: backupResult.backupId,
        previousAggregateHash: sourceManifest.aggregateHash,
        liveAggregateHash: drift.liveAggregateHash || null,
        previousCas: casExact,
        liveCas: liveCasExact,
        wroteHotStore: false,
      };
      throw err;
    }
  }

  const preview = stage2.buildHotBagPreview(store);
  stage2.assertActiveJobsRemainFull(preview.bag);

  stage2.assertBackupMatchesSource(backupResult.proof, sourceManifest, {
    requireProductionGrade: backupResult.proof.kind !== stage2.BACKUP_KIND_FIXTURE,
    allowFixture: backupResult.proof.kind === stage2.BACKUP_KIND_FIXTURE
      || backupResult.proof.fixture === true,
    requireBuildBinding: Boolean(effectiveBuildSha),
  });

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

  if (!client) {
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
  assertPostgresProductionExecutionGates,
  defaultCreatePostgresClient,
  preparePostgresStage2ExecutionContext,
  prepareAndRunPostgresStage2Execution,
  createDurableStage2Backup,
  migrateHistoricalJobsToDedicated,
  verifyAndReconcileDestination,
  applyHotBagCasRewrite,
  applyStage2RollbackCas,
  runStage2Execution,
};
