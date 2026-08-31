#!/usr/bin/env node
/**
 * Stage 2 curriculumOperatorJobs offload CLI — DESIGN/TOOLING ONLY.
 *
 * DEFAULT: dry-run / preflight / preview (ZERO production writes).
 *
 *   node scripts/migrate-curriculum-operator-jobs-stage2.js --file store.json
 *   PRODUCTION_DATABASE_URL=... node scripts/migrate-curriculum-operator-jobs-stage2.js --postgres
 *
 * Fixture simulation (local only):
 *   ... --file store.json --simulate-fixture --confirm-migrate-operator-jobs
 *   ... --simulate-fixture --confirm-hot-store-cutover   # also rewrites fixture bag in memory/report
 *
 * PRODUCTION POSTGRES APPLY IS LOCKED in this PR:
 *   --postgres --apply  → always refused (assertProductionApplyUnlocked)
 *
 * Execution engine (still locked for production):
 *   scripts/lib/curriculum-operator-jobs-stage2-execute.js
 *
 * Never prints secrets or lesson content — ids/status/bytes/hashes only.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const stage2 = require("./lib/curriculum-operator-jobs-stage2.js");
const execute = require("./lib/curriculum-operator-jobs-stage2-execute.js");
const {
  createCurriculumOperatorJobStore,
} = require("../server/curriculum-operator-job-store.js");

function parseArgs(argv) {
  const args = {
    file: "",
    postgres: false,
    apply: false,
    confirmMigrate: false,
    confirmCutover: false,
    simulateFixture: false,
    recordId: "launch-store",
    out: "",
    backupId: "",
    expectedSourceCount: null,
    expectedSourceHash: "",
    expectedStoreUpdatedAt: "",
    expectedProductionBuildSha: "",
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--postgres") args.postgres = true;
    else if (a === "--file") args.file = String(argv[++i] || "");
    else if (a === "--apply") args.apply = true;
    else if (a === "--confirm-migrate-operator-jobs") args.confirmMigrate = true;
    else if (a === "--confirm-hot-store-cutover") args.confirmCutover = true;
    else if (a === "--simulate-fixture") args.simulateFixture = true;
    else if (a === "--record-id") args.recordId = String(argv[++i] || "launch-store");
    else if (a === "--out") args.out = String(argv[++i] || "");
    else if (a === "--backup-id") args.backupId = String(argv[++i] || "");
    else if (a === "--expected-source-count") args.expectedSourceCount = Number(argv[++i]);
    else if (a === "--expected-source-hash") args.expectedSourceHash = String(argv[++i] || "");
    else if (a === "--expected-store-updated-at") args.expectedStoreUpdatedAt = String(argv[++i] || "");
    else if (a === "--expected-production-build-sha") args.expectedProductionBuildSha = String(argv[++i] || "");
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function loadStoreFromFile(filePath) {
  const abs = path.resolve(filePath);
  const parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
  const store = parsed?.store && typeof parsed.store === "object" && !parsed.users
    ? parsed.store
    : parsed?.data && typeof parsed.data === "object" && !parsed.users
      ? parsed.data
      : parsed;
  if (!store || typeof store !== "object") throw new Error("File did not contain a store object");
  return { store, abs };
}

async function loadStoreFromPostgresReadOnly(recordId) {
  const url = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!url) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL required for --postgres");
  const { Client } = require("pg");
  const client = new Client({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    // Fail closed: refuse preflight unless session is proven read-only.
    const readOnly = await stage2.enforcePostgresSessionReadOnly(client);
    const result = await client.query(
      `SELECT data, updated_at, ${stage2.LLH_STORE_UPDATED_AT_EXACT_SQL} AS updated_at_exact
       FROM llh_store WHERE id = $1`,
      [recordId],
    );
    if (!result.rows.length) throw new Error(`No llh_store row for id=${recordId}`);
    let dedicatedCount = null;
    try {
      const t = await client.query("SELECT to_regclass('public.llh_curriculum_operator_jobs') AS reg");
      if (t.rows[0]?.reg) {
        const c = await client.query("SELECT COUNT(*)::int AS n FROM llh_curriculum_operator_jobs");
        dedicatedCount = c.rows[0].n;
      }
    } catch {
      dedicatedCount = null;
    }
    return {
      store: result.rows[0].data,
      storeUpdatedAt: result.rows[0].updated_at,
      storeUpdatedAtExact: result.rows[0].updated_at_exact,
      dedicatedCount,
      readOnly,
      client,
    };
  } catch (error) {
    // Error path: attempt ROLLBACK, end client, then propagate.
    // If ROLLBACK itself fails, fail closed with cleanup error (attach original).
    try {
      await stage2.endPostgresReadOnlyTransaction(client, { reason: "preflight_error" });
    } catch (rollbackError) {
      await client.end().catch(() => {});
      rollbackError.originalError = error;
      throw rollbackError;
    }
    await client.end().catch(() => {});
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || (!args.file && !args.postgres)) {
    console.log(`Stage 2 curriculumOperatorJobs tooling (DESIGN ONLY — production apply locked).

Usage (read-only / dry-run):
  node scripts/migrate-curriculum-operator-jobs-stage2.js --file store.json
  PRODUCTION_DATABASE_URL=... node scripts/migrate-curriculum-operator-jobs-stage2.js --postgres

Fixture simulation only:
  ... --file store.json --simulate-fixture --confirm-migrate-operator-jobs
  ... --simulate-fixture --confirm-hot-store-cutover

Production Postgres --apply is REFUSED in this PR.
`);
    process.exit(args.help ? 0 : 1);
  }

  // Runtime cutover must remain disabled.
  const runtimeStore = createCurriculumOperatorJobStore({ localFilePath: null });
  if (typeof runtimeStore.isHotStoreCutoverEnabled === "function"
    && runtimeStore.isHotStoreCutoverEnabled() !== false) {
    throw new Error("Safety abort: runtime isHotStoreCutoverEnabled must be false.");
  }

  if (args.apply && args.postgres) {
    // Final hard lock BEFORE any production connection / client factory.
    stage2.assertProductionApplyUnlocked(args);
    // Complete future wiring (unreachable until a separate unlock PR removes the lock above):
    await execute.prepareAndRunPostgresStage2Execution({
      apply: true,
      confirmMigrate: args.confirmMigrate,
      confirmCutover: args.confirmCutover,
      storeRecordId: args.recordId,
      expectedSourceCount: args.expectedSourceCount,
      expectedSourceHash: args.expectedSourceHash,
      expectedStoreUpdatedAt: args.expectedStoreUpdatedAt,
      expectedProductionBuildSha: args.expectedProductionBuildSha || process.env.RENDER_GIT_COMMIT || "",
      productionBuildSha: process.env.RENDER_GIT_COMMIT || args.expectedProductionBuildSha || "",
      // createClient intentionally default — never reached while lock throws.
    });
  }

  let store;
  let storeUpdatedAt = null;
  let storeUpdatedAtExact = null;
  let dedicatedCount = null;
  let pgClient = null;

  if (args.postgres) {
    const loaded = await loadStoreFromPostgresReadOnly(args.recordId);
    store = loaded.store;
    storeUpdatedAt = loaded.storeUpdatedAt;
    storeUpdatedAtExact = loaded.storeUpdatedAtExact;
    dedicatedCount = loaded.dedicatedCount;
    pgClient = loaded.client;
  } else {
    store = loadStoreFromFile(args.file).store;
  }

  const manifest = stage2.buildSourceManifest(store, {
    storeUpdatedAt,
    storeUpdatedAtExact,
    productionBuildSha: process.env.RENDER_GIT_COMMIT || null,
  });
  const preview = stage2.buildHotBagPreview(store);

  const report = {
    mode: args.simulateFixture ? "fixture-simulate" : "dry-run",
    wrote: false,
    productionApplyLocked: true,
    runtimeCutoverEnabled: false,
    source: args.postgres ? `postgres:${args.recordId}` : "file",
    dedicatedTableRowCount: dedicatedCount,
    preflight: {
      jobCount: manifest.jobCount,
      operatorSectionBytes: manifest.operatorSectionBytes,
      aggregateHash: manifest.aggregateHash,
      activeIds: manifest.activeIds,
      byStatus: manifest.byStatus,
      inventory: manifest.inventory,
      storeUpdatedAtExact: manifest.storeUpdatedAtExact,
    },
    preview: {
      beforeBytes: preview.beforeBytes,
      afterBytes: preview.afterBytes,
      bytesSaved: preview.bytesSaved,
      reductionPct: preview.reductionPct,
      hotJobCount: preview.hotJobCount,
      activeKeptFull: preview.activeKeptFull,
      terminalStubbed: preview.terminalStubbed,
    },
    gates: {
      backupIdRequired: true,
      expectedSourceCount: args.expectedSourceCount,
      expectedSourceHash: args.expectedSourceHash || null,
      expectedStoreUpdatedAt: args.expectedStoreUpdatedAt || null,
    },
    audit: stage2.buildAuditReport({
      runId: manifest.runId,
      productionCommit: manifest.productionBuildSha,
      preflightTimestamp: manifest.capturedAt,
      sourceCount: manifest.jobCount,
      sourceAggregateHash: manifest.aggregateHash,
      backupId: args.backupId || null,
      operatorBytesBefore: preview.beforeBytes,
      operatorBytesAfter: preview.afterBytes,
      activeJobIds: manifest.activeIds,
      terminalStubCount: preview.terminalStubbed,
      inventoryBefore: manifest.inventory,
      casBefore: storeUpdatedAtExact,
      rollbackReady: true,
    }),
  };

  if (!args.simulateFixture) {
    if (pgClient) {
      await stage2.rollbackAndEndPostgresReadOnlyClient(pgClient, { reason: "preflight_complete" });
      pgClient = null;
    }
    const text = JSON.stringify(report, null, 2);
    if (args.out) fs.writeFileSync(path.resolve(args.out), text);
    console.log(text);
    return;
  }

  // Fixture simulation path only.
  if (args.postgres) {
    throw new Error("Refusing --simulate-fixture with --postgres (fixture/local only).");
  }
  if (!args.confirmMigrate) {
    throw new Error("Fixture simulate requires --confirm-migrate-operator-jobs");
  }

  // Fixture-only proof — never treated as production-grade.
  const backup = stage2.buildBackupProof({
    kind: stage2.BACKUP_KIND_FIXTURE,
    id: args.backupId || `fixture-backup-${manifest.runId}`,
    verified: true,
    source: stage2.REQUIRED_BACKUP_SOURCE,
    migrationRunId: manifest.runId,
    productionBuildSha: manifest.productionBuildSha || "fixture-build",
    sourceJobCount: manifest.jobCount,
    sourceAggregateHash: manifest.aggregateHash,
    storeUpdatedAtExact: manifest.storeUpdatedAtExact || "fixture-cas",
    storeFingerprint: manifest.storeFingerprint || stage2.stableSha256(store),
    createdAt: new Date().toISOString(),
  });
  const simulation = await stage2.simulateStage2OnFixtureStore({
    store,
    backup,
    runId: manifest.runId,
    expectations: {
      expectedSourceCount: args.expectedSourceCount,
      expectedSourceHash: args.expectedSourceHash || undefined,
      expectedStoreUpdatedAt: args.expectedStoreUpdatedAt || undefined,
      fixtureStoreUpdatedAtExact: manifest.storeUpdatedAtExact || "fixture-cas",
      expectedProductionBuildSha: manifest.productionBuildSha || "fixture-build",
    },
    applyHotRewrite: args.confirmCutover === true,
  });

  report.mode = "fixture-simulate";
  report.wrote = simulation.wroteDedicated || simulation.wroteHotStore;
  report.simulation = {
    wroteDedicated: simulation.wroteDedicated,
    wroteHotStore: simulation.wroteHotStore,
    appliedCount: simulation.applied.length,
    skippedCount: simulation.skipped.length,
    verification: simulation.verification,
    inventoryAfter: simulation.inventoryAfter,
  };

  if (pgClient) {
    await stage2.rollbackAndEndPostgresReadOnlyClient(pgClient, { reason: "preflight_complete" });
    pgClient = null;
  }
  const text = JSON.stringify(report, null, 2);
  if (args.out) fs.writeFileSync(path.resolve(args.out), text);
  console.log(text);
}

main().catch((error) => {
  console.error("STAGE2 TOOL FAILED:", error.message || error);
  if (error.code) console.error("code:", error.code);
  process.exit(1);
});
