#!/usr/bin/env node
/**
 * Dry-run (default) maintenance tool for enrichmentPublishHistory retention.
 *
 * Default: READ-ONLY — never writes the store.
 *
 * Local JSON apply:
 *   node scripts/prune-enrichment-publish-history.js --store-path=/path/to/store.json --apply
 *
 * Postgres dry-run:
 *   PRODUCTION_DATABASE_URL=... node scripts/prune-enrichment-publish-history.js --from-postgres --json
 *
 * Controlled Postgres apply (requires EXTRA confirmation + verified backup id):
 *   PRODUCTION_DATABASE_URL=... node scripts/prune-enrichment-publish-history.js \
 *     --from-postgres --apply --confirm-postgres-prune \
 *     --backup-id=backup_... --json
 *
 * --from-postgres --apply without --confirm-postgres-prune is refused.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const {
  ENRICHMENT_HISTORY_RETENTION_LIMIT,
  trimEnrichmentPublishHistory,
  pruneEnrichmentPublishHistoryInStore,
} = require("../server/enrichment-publish-history.js");

/** Matches server/index.js storeRecordId default. */
function resolveStoreRecordId(env = process.env) {
  return String(env.LLH_STORE_RECORD_ID || "launch-store").trim() || "launch-store";
}

/** Matches server/index.js FOUNDING_ADVISORY_LOCK_NS. */
const FOUNDING_ADVISORY_LOCK_NS = 87442201;

/**
 * Exact-document update with updated_at precondition.
 * Used instead of the foundingMembers-merging UPSERT so a history-only prune
 * cannot rewrite unrelated membership arrays or bypass stale-state protection.
 */
const POSTGRES_UPDATE_STORE_IF_UNCHANGED = `
UPDATE llh_store
SET data = $2::jsonb, updated_at = NOW()
WHERE id = $1 AND updated_at IS NOT DISTINCT FROM $3::timestamptz
RETURNING id, updated_at
`;

function byteLen(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function stableFingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function parseArgs(argv) {
  const out = {
    apply: false,
    fromPostgres: false,
    confirmPostgresPrune: false,
    backupId: "",
    storePath: "",
    json: false,
  };
  for (const arg of argv) {
    if (arg === "--apply") out.apply = true;
    else if (arg === "--from-postgres") out.fromPostgres = true;
    else if (arg === "--confirm-postgres-prune") out.confirmPostgresPrune = true;
    else if (arg === "--json") out.json = true;
    else if (arg.startsWith("--store-path=")) out.storePath = arg.slice("--store-path=".length);
    else if (arg.startsWith("--backup-id=")) out.backupId = arg.slice("--backup-id=".length).trim();
  }
  return out;
}

function createPgClient(connectionString) {
  const url = String(connectionString || "").trim();
  if (!url) throw new Error("PRODUCTION_DATABASE_URL is required with --from-postgres");
  return new Client({
    connectionString: url,
    ssl: url.includes("localhost") || url.includes("127.0.0.1")
      ? undefined
      : { rejectUnauthorized: false },
    statement_timeout: 180000,
  });
}

/**
 * @param {import("pg").Client} client
 * @param {string} storeRecordId
 */
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
 * Verify backup exists in llh_store_backups and is verified + predates apply.
 * @param {import("pg").Client} client
 * @param {string} backupId
 * @param {Date|string|number} sourceUpdatedAt
 */
async function verifyPostgresBackup(client, backupId, sourceUpdatedAt) {
  const id = String(backupId || "").trim();
  if (!id) {
    throw new Error("Refusing Postgres apply: --backup-id is required.");
  }
  if (!/^backup_\d{4}-\d{2}-\d{2}T/.test(id)) {
    throw new Error(
      "Refusing Postgres apply: --backup-id must be a real llh_store_backups id "
      + "(expected prefix backup_<ISO-timestamp>_...).",
    );
  }
  const result = await client.query(
    `SELECT id, created_at, source, verified
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
  if (!Number.isFinite(backupCreatedMs)) {
    throw new Error(`Refusing Postgres apply: backup created_at unreadable: ${id}`);
  }
  // Backup must predate this apply moment (recovery point already exists).
  if (backupCreatedMs > Date.now() + 1000) {
    throw new Error(`Refusing Postgres apply: backup timestamp is in the future: ${id}`);
  }
  // sourceUpdatedAt is accepted for API symmetry / future checks; concurrency uses updated_at.
  void sourceUpdatedAt;
  return {
    id: row.id,
    createdAt: row.created_at,
    source: row.source,
    verified: true,
  };
}

/**
 * Ensure only enrichmentPublishHistory arrays changed; everything else identical.
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
  const beforeSiteKeys = Object.keys(beforeSite).sort();
  const afterSiteKeys = Object.keys(afterSite).sort();
  if (JSON.stringify(beforeSiteKeys) !== JSON.stringify(afterSiteKeys)) {
    throw new Error("Safety abort: siteContent keys changed.");
  }
  for (const key of beforeSiteKeys) {
    if (key === "curriculum") continue;
    if (JSON.stringify(beforeSite[key] ?? null) !== JSON.stringify(afterSite[key] ?? null)) {
      throw new Error(`Safety abort: siteContent.${key} changed.`);
    }
  }

  const beforeCur = beforeSite.curriculum || {};
  const afterCur = afterSite.curriculum || {};
  const beforeCurKeys = Object.keys(beforeCur).sort();
  const afterCurKeys = Object.keys(afterCur).sort();
  if (JSON.stringify(beforeCurKeys) !== JSON.stringify(afterCurKeys)) {
    throw new Error("Safety abort: curriculum keys changed.");
  }
  for (const key of beforeCurKeys) {
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
    if (String(b.id || "") !== String(a.id || "")) {
      throw new Error(`Safety abort: lesson plan id/order changed at index ${i}`);
    }
    const bHist = Array.isArray(b.enrichmentPublishHistory) ? b.enrichmentPublishHistory : [];
    const aHist = Array.isArray(a.enrichmentPublishHistory) ? a.enrichmentPublishHistory : [];
    const expected = trimEnrichmentPublishHistory(bHist);
    if (JSON.stringify(aHist) !== JSON.stringify(expected)) {
      throw new Error(`Safety abort: history trim mismatch for ${b.id}`);
    }
    for (const entry of aHist) {
      if (!entry || !String(entry.versionId || "").trim()) {
        throw new Error(`Safety abort: retained history missing versionId on ${b.id}`);
      }
    }
    if (JSON.stringify(b.enrichmentDraft ?? null) !== JSON.stringify(a.enrichmentDraft ?? null)) {
      throw new Error(`Safety abort: enrichmentDraft changed for ${b.id}`);
    }
    if (JSON.stringify(b.enrichmentPublished ?? null) !== JSON.stringify(a.enrichmentPublished ?? null)) {
      throw new Error(`Safety abort: enrichmentPublished changed for ${b.id}`);
    }
    if (JSON.stringify(b.teachingKit ?? null) !== JSON.stringify(a.teachingKit ?? null)) {
      throw new Error(`Safety abort: teachingKit changed for ${b.id}`);
    }
    if (JSON.stringify(b.dailyPlans ?? null) !== JSON.stringify(a.dailyPlans ?? null)) {
      throw new Error(`Safety abort: dailyPlans changed for ${b.id}`);
    }
    if (JSON.stringify(b.activities ?? null) !== JSON.stringify(a.activities ?? null)) {
      throw new Error(`Safety abort: activities changed for ${b.id}`);
    }
    if (JSON.stringify(b.resourceIds ?? null) !== JSON.stringify(a.resourceIds ?? null)) {
      throw new Error(`Safety abort: resourceIds changed for ${b.id}`);
    }
    if (JSON.stringify(b.resources ?? null) !== JSON.stringify(a.resources ?? null)) {
      throw new Error(`Safety abort: resources changed for ${b.id}`);
    }
    // Cover / media reference fields commonly used on plans.
    for (const mediaKey of [
      "coverImage", "coverImageUrl", "imageUrl", "mediaAssetId", "coverMediaAssetId",
      "thumbnailUrl", "heroImage", "setupMediaAssetId",
    ]) {
      if (JSON.stringify(b[mediaKey] ?? null) !== JSON.stringify(a[mediaKey] ?? null)) {
        throw new Error(`Safety abort: ${mediaKey} changed for ${b.id}`);
      }
    }
    // Strip history and require the rest of the plan object identical.
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

function analyze(store) {
  const plans = Array.isArray(store?.siteContent?.curriculum?.lessonPlans)
    ? store.siteContent.curriculum.lessonPlans
    : [];
  const perPlan = [];
  let historyEntriesBefore = 0;
  let historyEntriesAfter = 0;
  let historyBytesBefore = 0;
  let historyBytesAfter = 0;
  let plansWithHistory = 0;

  for (const plan of plans) {
    if (!plan || typeof plan !== "object") continue;
    const before = Array.isArray(plan.enrichmentPublishHistory) ? plan.enrichmentPublishHistory : [];
    if (!before.length) continue;
    plansWithHistory += 1;
    const after = trimEnrichmentPublishHistory(before);
    const beforeBytes = byteLen(before);
    const afterBytes = byteLen(after);
    historyEntriesBefore += before.length;
    historyEntriesAfter += after.length;
    historyBytesBefore += beforeBytes;
    historyBytesAfter += afterBytes;
    perPlan.push({
      id: plan.id || "",
      title: String(plan.title || "").slice(0, 80),
      before: before.length,
      after: after.length,
      removed: Math.max(0, before.length - after.length),
      bytesBefore: beforeBytes,
      bytesAfter: afterBytes,
      bytesSaved: Math.max(0, beforeBytes - afterBytes),
      retainedVersionIds: after.map((e) => e.versionId),
    });
  }

  perPlan.sort((a, b) => b.bytesBefore - a.bytesBefore);

  const storeBytesBefore = byteLen(store);
  const projected = JSON.parse(JSON.stringify(store));
  pruneEnrichmentPublishHistoryInStore(projected);
  const storeBytesAfter = byteLen(projected);

  return {
    retentionLimit: ENRICHMENT_HISTORY_RETENTION_LIMIT,
    totalLessonPlans: plans.length,
    plansWithHistory,
    historyEntriesBefore,
    historyEntriesAfter,
    historyEntriesRemoved: Math.max(0, historyEntriesBefore - historyEntriesAfter),
    historyBytesBefore,
    historyBytesAfter,
    historyBytesSaved: Math.max(0, historyBytesBefore - historyBytesAfter),
    storeBytesBefore,
    storeBytesAfter,
    storeBytesSaved: Math.max(0, storeBytesBefore - storeBytesAfter),
    storeReductionPct: storeBytesBefore
      ? Number(((1 - storeBytesAfter / storeBytesBefore) * 100).toFixed(2))
      : 0,
    largest10: perPlan.slice(0, 10).map((p) => ({
      id: p.id,
      title: p.title,
      before: p.before,
      after: p.after,
      removed: p.removed,
      bytesSaved: p.bytesSaved,
      mbSaved: Number((p.bytesSaved / (1024 * 1024)).toFixed(3)),
      retainedVersionIds: p.retainedVersionIds,
    })),
    projectedFingerprint: stableFingerprint(projected),
  };
}

function applyLocalJsonPrune(sourceStore, writablePath) {
  const clone = JSON.parse(JSON.stringify(sourceStore));
  pruneEnrichmentPublishHistoryInStore(clone);
  assertHistoryOnlyTransform(sourceStore, clone);
  fs.writeFileSync(writablePath, JSON.stringify(clone, null, 2));
  return clone;
}

/**
 * Controlled Postgres apply. Performs exactly one UPDATE when all gates pass.
 * @param {object} options
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

  const backup = await verifyPostgresBackup(client, backupId, sourceUpdatedAt);

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
    const liveUpdatedMs = new Date(live.updated_at).getTime();
    const sourceUpdatedMs = new Date(sourceUpdatedAt).getTime();
    if (!Number.isFinite(liveUpdatedMs) || !Number.isFinite(sourceUpdatedMs)
      || liveUpdatedMs !== sourceUpdatedMs) {
      throw new Error(
        "Refusing Postgres apply: stale-state precondition failed "
        + `(live updated_at ${String(live.updated_at)} != source ${String(sourceUpdatedAt)}).`,
      );
    }
    const liveFingerprint = stableFingerprint(live.data);
    if (liveFingerprint !== sourceFingerprint) {
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

  // Post-write verification from authoritative Postgres row.
  const reread = await loadPostgresStoreRow(client, storeRecordId);
  const rereadFingerprint = stableFingerprint(reread.store);
  if (rereadFingerprint !== prunedFingerprint) {
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

  const rereadAnalysis = analyze(reread.store);
  if (rereadAnalysis.historyEntriesBefore !== stats.entriesAfter) {
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
    rereadFingerprint,
    stats,
    storeId: storeRecordId,
    newUpdatedAt: reread.updatedAt,
  };
}

async function loadStore(args, deps = {}) {
  if (args.fromPostgres) {
    const storeRecordId = resolveStoreRecordId(deps.env || process.env);
    const client = deps.client || createPgClient(
      (deps.env || process.env).PRODUCTION_DATABASE_URL,
    );
    const ownsClient = !deps.client;
    if (ownsClient) await client.connect();
    try {
      const loaded = await loadPostgresStoreRow(client, storeRecordId);
      return {
        ...loaded,
        writablePath: "",
        client,
        ownsClient,
        storeRecordId,
        fromPostgres: true,
      };
    } catch (error) {
      if (ownsClient) {
        try { await client.end(); } catch { /* ignore */ }
      }
      throw error;
    }
  }

  const storePath = args.storePath
    || process.env.LLH_STORE_PATH
    || path.join(__dirname, "..", "server", "data", "launch-store.json");
  if (!fs.existsSync(storePath)) {
    throw new Error(`Store file not found: ${storePath}`);
  }
  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  return {
    store,
    source: storePath,
    writablePath: storePath,
    fromPostgres: false,
    client: null,
    ownsClient: false,
    storeRecordId: "",
    updatedAt: null,
    fingerprint: stableFingerprint(store),
  };
}

async function run(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const loaded = await loadStore(args, deps);
  const report = analyze(loaded.store);
  report.source = loaded.source;
  report.applyRequested = args.apply;
  report.confirmPostgresPrune = args.confirmPostgresPrune;
  report.backupId = args.backupId || null;
  report.wrote = false;
  report.postgresWriteCount = 0;

  try {
    if (args.apply) {
      if (args.fromPostgres || loaded.fromPostgres) {
        if (!args.confirmPostgresPrune) {
          throw new Error(
            "Refusing --apply for Postgres / non-writable sources. "
            + "Production prune requires --confirm-postgres-prune and a verified --backup-id.",
          );
        }
        if (!loaded.client) {
          throw new Error("Refusing Postgres apply: database client unavailable.");
        }
        const applyResult = await applyControlledPostgresPrune({
          client: loaded.client,
          storeRecordId: loaded.storeRecordId,
          sourceStore: loaded.store,
          sourceUpdatedAt: loaded.updatedAt,
          sourceFingerprint: loaded.fingerprint,
          backupId: args.backupId,
          confirmPostgresPrune: args.confirmPostgresPrune,
        });
        report.wrote = true;
        report.postgresWriteCount = applyResult.postgresWriteCount;
        report.backup = applyResult.backup;
        report.prunedFingerprint = applyResult.prunedFingerprint;
        report.postWriteVerified = true;
        report.newUpdatedAt = applyResult.newUpdatedAt;
        report.liveCacheNote = (
          "Postgres row updated. Restart the web service after apply so the in-memory "
          + "storeCache reloads the pruned document and cannot overwrite it on the next write."
        );
        // Refresh size metrics from the pruned truth.
        const after = analyze(
          (await loadPostgresStoreRow(loaded.client, loaded.storeRecordId)).store,
        );
        report.historyEntriesAfter = after.historyEntriesBefore; // already pruned
        report.historyBytesAfter = after.historyBytesBefore;
        report.storeBytesAfter = after.storeBytesBefore;
        report.storeBytesSaved = Math.max(0, report.storeBytesBefore - report.storeBytesAfter);
        report.historyBytesSaved = Math.max(0, report.historyBytesBefore - report.historyBytesAfter);
        report.historyEntriesRemoved = Math.max(
          0,
          report.historyEntriesBefore - report.historyEntriesAfter,
        );
        report.storeReductionPct = report.storeBytesBefore
          ? Number(((1 - report.storeBytesAfter / report.storeBytesBefore) * 100).toFixed(2))
          : 0;
      } else {
        if (!loaded.writablePath) {
          throw new Error("Refusing --apply: no writable local store path.");
        }
        applyLocalJsonPrune(loaded.store, loaded.writablePath);
        report.wrote = true;
      }
    }
  } finally {
    if (loaded.ownsClient && loaded.client) {
      try { await loaded.client.end(); } catch { /* ignore */ }
    }
  }

  return report;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const report = await run(argv);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  console.log("Enrichment publish-history retention");
  console.log(`Source: ${report.source}`);
  console.log(`Retention limit: ${report.retentionLimit}`);
  console.log(
    `Apply mode: ${
      report.applyRequested
        ? (report.wrote ? (report.postgresWriteCount ? "WROTE postgres" : "WROTE local file") : "requested")
        : "OFF (read-only)"
    }`,
  );
  console.log("");
  console.log(`Lesson plans: ${report.totalLessonPlans}`);
  console.log(`Plans with history: ${report.plansWithHistory}`);
  console.log(`History entries before → after: ${report.historyEntriesBefore} → ${report.historyEntriesAfter} (removed ${report.historyEntriesRemoved})`);
  console.log(`History bytes before → after: ${report.historyBytesBefore} → ${report.historyBytesAfter} (saved ${report.historyBytesSaved})`);
  console.log(`Full store bytes before → after: ${report.storeBytesBefore} → ${report.storeBytesAfter}`);
  console.log(`Estimated store savings: ${report.storeBytesSaved} bytes (${report.storeReductionPct}%)`);
  console.log(`Estimated store savings MB: ${(report.storeBytesSaved / (1024 * 1024)).toFixed(2)} MB`);
  console.log("");
  console.log("Largest 10 histories:");
  for (const row of report.largest10) {
    console.log(
      `- ${row.title || row.id}: before ${row.before} → after ${row.after} `
      + `(saved ${(row.bytesSaved / (1024 * 1024)).toFixed(3)} MB)`,
    );
  }
  return report;
}

if (require.main === module) {
  main().catch((error) => {
    console.error("FAIL:", error.message || error);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  resolveStoreRecordId,
  FOUNDING_ADVISORY_LOCK_NS,
  POSTGRES_UPDATE_STORE_IF_UNCHANGED,
  stableFingerprint,
  analyze,
  assertHistoryOnlyTransform,
  verifyPostgresBackup,
  loadPostgresStoreRow,
  applyControlledPostgresPrune,
  applyLocalJsonPrune,
  run,
  main,
};
