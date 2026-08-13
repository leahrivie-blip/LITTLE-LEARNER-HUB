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
 * Controlled Postgres apply (extra confirm + verified backup required):
 *   PRODUCTION_DATABASE_URL=... node scripts/prune-enrichment-publish-history.js \
 *     --from-postgres --apply --confirm-postgres-prune \
 *     --backup-id=backup_... --json
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const {
  ENRICHMENT_HISTORY_RETENTION_LIMIT,
  trimEnrichmentPublishHistory,
  pruneEnrichmentPublishHistoryInStore,
} = require("../server/enrichment-publish-history.js");
const {
  resolveStoreRecordId,
  stableFingerprint,
  assertHistoryOnlyTransform,
  loadPostgresStoreRow,
  applyControlledPostgresPrune,
} = require("./lib/enrichment-history-postgres-apply.js");

function byteLen(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
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
  };
}

function applyLocalJsonPrune(sourceStore, writablePath) {
  const clone = JSON.parse(JSON.stringify(sourceStore));
  pruneEnrichmentPublishHistoryInStore(clone);
  assertHistoryOnlyTransform(sourceStore, clone);
  fs.writeFileSync(writablePath, JSON.stringify(clone, null, 2));
  return clone;
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
    if (!args.apply) return report;

    if (args.fromPostgres || loaded.fromPostgres) {
      if (!args.confirmPostgresPrune) {
        throw new Error(
          "Refusing --apply for Postgres / non-writable sources. "
          + "Production prune requires --confirm-postgres-prune and a verified --backup-id.",
        );
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
        "Postgres row updated under updated_at CAS. A Render restart is still recommended "
        + "so storeCache reloads promptly; correctness no longer depends on restart timing "
        + "because stale full-store writes are rejected/reconciled by updated_at concurrency."
      );
      const after = analyze(
        (await loadPostgresStoreRow(loaded.client, loaded.storeRecordId)).store,
      );
      report.historyEntriesAfter = after.historyEntriesBefore;
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
      return report;
    }

    if (!loaded.writablePath) {
      throw new Error("Refusing --apply: no writable local store path.");
    }
    applyLocalJsonPrune(loaded.store, loaded.writablePath);
    report.wrote = true;
    return report;
  } finally {
    if (loaded.ownsClient && loaded.client) {
      try { await loaded.client.end(); } catch { /* ignore */ }
    }
  }
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
  console.log(`History entries before → after: ${report.historyEntriesBefore} → ${report.historyEntriesAfter}`);
  console.log(`Full store bytes before → after: ${report.storeBytesBefore} → ${report.storeBytesAfter}`);
  for (const row of report.largest10) {
    console.log(`- ${row.title || row.id}: ${row.before} → ${row.after}`);
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
  analyze,
  run,
  main,
  applyLocalJsonPrune,
  // Re-export apply helpers for tests.
  ...require("./lib/enrichment-history-postgres-apply.js"),
};
