/**
 * Controlled Postgres apply helpers for enrichmentPublishHistory prune.
 * Kept separate so scripts/prune-enrichment-publish-history.js stays thin.
 */
"use strict";

const crypto = require("crypto");
const {
  trimEnrichmentPublishHistory,
  pruneEnrichmentPublishHistoryInStore,
} = require("../../server/enrichment-publish-history.js");

/** Matches server/index.js FOUNDING_ADVISORY_LOCK_NS. */
const FOUNDING_ADVISORY_LOCK_NS = 87442201;

const POSTGRES_UPDATE_STORE_IF_UNCHANGED = `
UPDATE llh_store
SET data = $2::jsonb, updated_at = NOW()
WHERE id = $1 AND updated_at IS NOT DISTINCT FROM $3::timestamptz
RETURNING id, updated_at
`;

function resolveStoreRecordId(env = process.env) {
  return String(env.LLH_STORE_RECORD_ID || "launch-store").trim() || "launch-store";
}

function stableFingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

/**
 * History-only transform invariant: everything except enrichmentPublishHistory identical.
 * @param {object} beforeStore
 * @param {object} afterStore
 */
function assertHistoryOnlyTransform(beforeStore, afterStore) {
  const beforeKeys = Object.keys(beforeStore || {}).sort();
  const afterKeys = Object.keys(afterStore || {}).sort();
  if (JSON.stringify(beforeKeys) !== JSON.stringify(afterKeys)) {
    throw new Error("Safety abort: top-level store keys changed.");
  }
  for (const key of beforeKeys) {
    if (key === "siteContent") continue;
    if (JSON.stringify(beforeStore[key] ?? null) !== JSON.stringify(afterStore[key] ?? null)) {
      throw new Error(`Safety abort: unexpected top-level field changed: ${key}`);
    }
  }

  const beforeSite = beforeStore.siteContent || {};
  const afterSite = afterStore.siteContent || {};
  for (const key of Object.keys(beforeSite).sort()) {
    if (key === "curriculum") continue;
    if (JSON.stringify(beforeSite[key] ?? null) !== JSON.stringify(afterSite[key] ?? null)) {
      throw new Error(`Safety abort: siteContent.${key} changed.`);
    }
  }
  const beforeCur = beforeSite.curriculum || {};
  const afterCur = afterSite.curriculum || {};
  for (const key of Object.keys(beforeCur).sort()) {
    if (key === "lessonPlans") continue;
    if (JSON.stringify(beforeCur[key] ?? null) !== JSON.stringify(afterCur[key] ?? null)) {
      throw new Error(`Safety abort: curriculum.${key} changed.`);
    }
  }

  const beforePlans = Array.isArray(beforeCur.lessonPlans) ? beforeCur.lessonPlans : [];
  const afterPlans = Array.isArray(afterCur.lessonPlans) ? afterCur.lessonPlans : [];
  if (beforePlans.length !== afterPlans.length) {
    throw new Error("Safety abort: lesson plan count changed.");
  }
  for (let i = 0; i < beforePlans.length; i += 1) {
    const b = beforePlans[i] || {};
    const a = afterPlans.find((p) => p && p.id === b.id) || afterPlans[i] || {};
    const bHist = Array.isArray(b.enrichmentPublishHistory) ? b.enrichmentPublishHistory : [];
    const aHist = Array.isArray(a.enrichmentPublishHistory) ? a.enrichmentPublishHistory : [];
    if (JSON.stringify(aHist) !== JSON.stringify(trimEnrichmentPublishHistory(bHist))) {
      throw new Error(`Safety abort: history trim mismatch for ${b.id}`);
    }
    if (aHist.some((e) => !e || !String(e.versionId || "").trim())) {
      throw new Error(`Safety abort: retained history missing versionId on ${b.id}`);
    }
    const strip = (plan) => {
      const clone = { ...plan };
      delete clone.enrichmentPublishHistory;
      return clone;
    };
    if (JSON.stringify(strip(b)) !== JSON.stringify(strip(a))) {
      throw new Error(`Safety abort: non-history plan fields changed for ${b.id}`);
    }
  }
}

/**
 * Verify backup is in the same DB, verified, predates apply, and cryptographically
 * bound to the exact source store document being pruned.
 * @param {import("pg").Client} client
 * @param {string} backupId
 * @param {object} currentStore
 */
async function verifyPostgresBackup(client, backupId, currentStore) {
  const id = String(backupId || "").trim();
  if (!id) throw new Error("Refusing Postgres apply: --backup-id is required.");
  if (!/^backup_\d{4}-\d{2}-\d{2}T/.test(id)) {
    throw new Error(
      "Refusing Postgres apply: --backup-id must be a real llh_store_backups id "
      + "(expected prefix backup_<ISO-timestamp>_...).",
    );
  }
  // Load full backup document so we can SHA-256 bind it to the exact source store.
  // Metadata counts alone are insufficient (same IDs/counts can differ in content).
  const result = await client.query(
    `SELECT id, created_at, source, verified,
            user_count, message_count, founding_count, data
     FROM llh_store_backups
     WHERE id = $1
     LIMIT 1`,
    [id],
  );
  if (!result.rows.length) {
    throw new Error(`Refusing Postgres apply: backup not found: ${id}`);
  }
  const row = result.rows[0];
  if (row.verified !== true) {
    throw new Error(`Refusing Postgres apply: backup is not verified: ${id}`);
  }
  const backupCreatedMs = new Date(row.created_at).getTime();
  if (!Number.isFinite(backupCreatedMs) || backupCreatedMs > Date.now() + 1000) {
    throw new Error(`Refusing Postgres apply: backup created_at invalid/future: ${id}`);
  }
  if (!String(row.source || "").trim()) {
    throw new Error(`Refusing Postgres apply: backup source missing: ${id}`);
  }
  if (!row.data || typeof row.data !== "object") {
    throw new Error(`Refusing Postgres apply: backup data missing for ${id}`);
  }

  const sourceFingerprint = stableFingerprint(currentStore);
  const backupFingerprint = stableFingerprint(row.data);
  if (backupFingerprint !== sourceFingerprint) {
    throw new Error(
      "Refusing Postgres apply: backup store fingerprint does not match the exact source "
      + "store being pruned (same lesson IDs/counts are not sufficient). "
      + `backupFp=${backupFingerprint.slice(0, 12)}… sourceFp=${sourceFingerprint.slice(0, 12)}…`,
    );
  }

  return {
    id: row.id,
    createdAt: row.created_at,
    source: row.source,
    verified: true,
    storeFingerprint: backupFingerprint,
    userCount: Number(row.user_count),
  };
}

async function loadPostgresStoreRow(client, storeRecordId) {
  const result = await client.query(
    "SELECT id, data, updated_at FROM llh_store WHERE id = $1 LIMIT 1",
    [storeRecordId],
  );
  if (!result.rows[0]?.data) {
    throw new Error(`No llh_store row found for id=${storeRecordId}`);
  }
  const row = result.rows[0];
  return {
    store: row.data,
    storeId: String(row.id),
    updatedAt: row.updated_at,
    source: `postgres:${row.id}`,
    fingerprint: stableFingerprint(row.data),
  };
}

/**
 * Controlled Postgres prune apply: one conditional UPDATE + post-write verify.
 */
async function applyControlledPostgresPrune(options) {
  const {
    client,
    storeRecordId = resolveStoreRecordId(),
    sourceStore,
    sourceUpdatedAt,
    sourceFingerprint,
    backupId,
    confirmPostgresPrune,
  } = options;

  if (!confirmPostgresPrune) {
    throw new Error(
      "Refusing --apply for Postgres / non-writable sources. "
      + "Production prune requires --confirm-postgres-prune and a verified --backup-id.",
    );
  }
  if (!sourceStore || typeof sourceStore !== "object") {
    throw new Error("Refusing Postgres apply: source store missing.");
  }
  if (!sourceUpdatedAt) {
    throw new Error("Refusing Postgres apply: source updated_at missing (concurrency token).");
  }
  if (!sourceFingerprint) {
    throw new Error("Refusing Postgres apply: source fingerprint missing.");
  }

  const backup = await verifyPostgresBackup(client, backupId, sourceStore);
  const pruned = JSON.parse(JSON.stringify(sourceStore));
  const stats = pruneEnrichmentPublishHistoryInStore(pruned);
  assertHistoryOnlyTransform(sourceStore, pruned);
  const prunedFingerprint = stableFingerprint(pruned);
  const payload = JSON.stringify(pruned);

  let writeCount = 0;
  await client.query("BEGIN");
  try {
    await client.query(
      "SELECT pg_advisory_xact_lock($1, hashtext($2))",
      [FOUNDING_ADVISORY_LOCK_NS, `founding:${storeRecordId}`],
    );
    const locked = await client.query(
      "SELECT id, data, updated_at FROM llh_store WHERE id = $1 FOR UPDATE",
      [storeRecordId],
    );
    if (!locked.rows.length) {
      throw new Error(`Refusing Postgres apply: llh_store row missing under lock (${storeRecordId}).`);
    }
    const live = locked.rows[0];
    if (new Date(live.updated_at).getTime() !== new Date(sourceUpdatedAt).getTime()) {
      throw new Error(
        "Refusing Postgres apply: stale-state precondition failed "
        + `(live updated_at ${String(live.updated_at)} != source ${String(sourceUpdatedAt)}).`,
      );
    }
    if (stableFingerprint(live.data) !== sourceFingerprint) {
      throw new Error(
        "Refusing Postgres apply: store fingerprint changed since dry-run/read "
        + "(concurrency mismatch).",
      );
    }
    const updated = await client.query(
      POSTGRES_UPDATE_STORE_IF_UNCHANGED,
      [storeRecordId, payload, sourceUpdatedAt],
    );
    if (!updated.rowCount) {
      throw new Error(
        "Refusing Postgres apply: UPDATE affected 0 rows (updated_at concurrency mismatch).",
      );
    }
    writeCount = 1;
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw error;
  }

  const reread = await loadPostgresStoreRow(client, storeRecordId);
  if (stableFingerprint(reread.store) !== prunedFingerprint) {
    const err = new Error(
      "HARD FAILURE: Postgres write succeeded but post-write store fingerprint mismatch. "
      + `Restore from backup ${backup.id} may be required.`,
    );
    err.code = "post_write_verification_failed";
    err.backupId = backup.id;
    throw err;
  }
  try {
    assertHistoryOnlyTransform(sourceStore, reread.store);
  } catch (error) {
    const err = new Error(
      `HARD FAILURE: post-write invariant check failed (${error.message}). `
      + `Restore from backup ${backup.id} may be required.`,
    );
    err.code = "post_write_verification_failed";
    err.backupId = backup.id;
    throw err;
  }
  if (stats.entriesAfter !== countHistoryEntries(reread.store)) {
    const err = new Error(
      "HARD FAILURE: post-write history entry count mismatch. "
      + `Restore from backup ${backup.id} may be required.`,
    );
    err.code = "post_write_verification_failed";
    err.backupId = backup.id;
    throw err;
  }

  return {
    wrote: true,
    postgresWriteCount: writeCount,
    backup,
    prunedFingerprint,
    rereadFingerprint: stableFingerprint(reread.store),
    stats,
    storeId: storeRecordId,
    newUpdatedAt: reread.updatedAt,
  };
}

function countHistoryEntries(store) {
  const plans = store?.siteContent?.curriculum?.lessonPlans;
  if (!Array.isArray(plans)) return 0;
  return plans.reduce(
    (sum, plan) => sum + (Array.isArray(plan?.enrichmentPublishHistory)
      ? plan.enrichmentPublishHistory.length
      : 0),
    0,
  );
}

module.exports = {
  FOUNDING_ADVISORY_LOCK_NS,
  POSTGRES_UPDATE_STORE_IF_UNCHANGED,
  resolveStoreRecordId,
  stableFingerprint,
  assertHistoryOnlyTransform,
  verifyPostgresBackup,
  loadPostgresStoreRow,
  applyControlledPostgresPrune,
  countHistoryEntries,
};
