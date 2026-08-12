#!/usr/bin/env node
/**
 * Dry-run (default) maintenance tool for enrichmentPublishHistory retention.
 *
 * Default: READ-ONLY — never writes the store.
 * Optional apply (requires explicit --apply) is for separate owner approval only.
 * This task must NOT run --apply against production.
 *
 * Usage:
 *   node scripts/prune-enrichment-publish-history.js
 *   node scripts/prune-enrichment-publish-history.js --store-path=/path/to/store.json
 *   PRODUCTION_DATABASE_URL=... node scripts/prune-enrichment-publish-history.js --from-postgres
 *   node scripts/prune-enrichment-publish-history.js --apply   # writes local/json path only when set
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

function byteLen(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function parseArgs(argv) {
  const out = {
    apply: false,
    fromPostgres: false,
    storePath: "",
    json: false,
  };
  for (const arg of argv) {
    if (arg === "--apply") out.apply = true;
    else if (arg === "--from-postgres") out.fromPostgres = true;
    else if (arg === "--json") out.json = true;
    else if (arg.startsWith("--store-path=")) out.storePath = arg.slice("--store-path=".length);
  }
  return out;
}

async function loadStore(args) {
  if (args.fromPostgres) {
    const url = String(process.env.PRODUCTION_DATABASE_URL || "").trim();
    if (!url) {
      throw new Error("PRODUCTION_DATABASE_URL is required with --from-postgres");
    }
    const client = new Client({
      connectionString: url,
      ssl: url.includes("localhost") || url.includes("127.0.0.1")
        ? undefined
        : { rejectUnauthorized: false },
      statement_timeout: 180000,
    });
    await client.connect();
    try {
      const result = await client.query(
        "SELECT id, data FROM llh_store ORDER BY CASE WHEN id = 'launch-store' THEN 0 ELSE 1 END LIMIT 1",
      );
      if (!result.rows[0]?.data) throw new Error("No llh_store row found");
      return {
        store: result.rows[0].data,
        source: `postgres:${result.rows[0].id}`,
        writablePath: "",
      };
    } finally {
      await client.end();
    }
  }

  const storePath = args.storePath
    || process.env.LLH_STORE_PATH
    || path.join(__dirname, "..", "server", "data", "launch-store.json");
  if (!fs.existsSync(storePath)) {
    throw new Error(`Store file not found: ${storePath}`);
  }
  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  return { store, source: storePath, writablePath: storePath };
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
      draftUntouched: plan.enrichmentDraft,
      teachingKitUntouched: plan.teachingKit,
    });
  }

  perPlan.sort((a, b) => b.bytesBefore - a.bytesBefore);

  const storeBytesBefore = byteLen(store);
  // Project full-store size by cloning only history arrays (do not mutate caller's store).
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const loaded = await loadStore(args);
  const report = analyze(loaded.store);
  report.source = loaded.source;
  report.applyRequested = args.apply;
  report.wrote = false;

  if (args.apply) {
    if (args.fromPostgres || !loaded.writablePath) {
      throw new Error(
        "Refusing --apply for Postgres / non-writable sources. "
        + "Production prune requires separate owner approval and a controlled apply path.",
      );
    }
    const clone = JSON.parse(JSON.stringify(loaded.store));
    pruneEnrichmentPublishHistoryInStore(clone);
    // Prove current draft / published / TK / resources untouched for a sample plan.
    const beforePlans = loaded.store.siteContent?.curriculum?.lessonPlans || [];
    const afterPlans = clone.siteContent?.curriculum?.lessonPlans || [];
    for (let i = 0; i < beforePlans.length; i += 1) {
      const b = beforePlans[i];
      const a = afterPlans.find((p) => p.id === b.id) || afterPlans[i];
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
      if (JSON.stringify(b.resourceIds ?? null) !== JSON.stringify(a.resourceIds ?? null)) {
        throw new Error(`Safety abort: resourceIds changed for ${b.id}`);
      }
    }
    fs.writeFileSync(loaded.writablePath, JSON.stringify(clone, null, 2));
    report.wrote = true;
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("Enrichment publish-history retention dry-run");
  console.log(`Source: ${report.source}`);
  console.log(`Retention limit: ${report.retentionLimit}`);
  console.log(`Apply mode: ${report.applyRequested ? (report.wrote ? "WROTE local file" : "requested") : "OFF (read-only)"}`);
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
}

main().catch((error) => {
  console.error("FAIL:", error.message || error);
  process.exit(1);
});
