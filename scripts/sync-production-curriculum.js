#!/usr/bin/env node
/**
 * Safe production → testing curriculum sync (CLI).
 *
 * Never writes to production. Always backups testing curriculum first.
 *
 * Usage:
 *   node scripts/sync-production-curriculum.js --dry-run \
 *     --source-db-url-file /tmp/llh-db/prod.url \
 *     --target-db-url-file /tmp/llh-db/test.url
 *
 *   node scripts/sync-production-curriculum.js --apply \
 *     --source-db-url-file /tmp/llh-db/prod.url \
 *     --target-db-url-file /tmp/llh-db/test.url
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");
const sync = require("../server/curriculum-production-sync");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/curriculum-prod-sync";
const STORE_ID = process.env.LLH_STORE_RECORD_ID || "launch-store";

function parseArgs(argv) {
  const out = { dryRun: true, apply: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--apply") { out.apply = true; out.dryRun = false; }
    else if (a === "--source-db-url") out.sourceDbUrl = argv[++i];
    else if (a === "--target-db-url") out.targetDbUrl = argv[++i];
    else if (a === "--source-db-url-file") out.sourceDbUrlFile = argv[++i];
    else if (a === "--target-db-url-file") out.targetDbUrlFile = argv[++i];
    else if (a === "--source-file") out.sourceFile = argv[++i];
    else if (a === "--report") out.reportPath = argv[++i];
  }
  return out;
}

function readUrl(args, fileKey, urlKey, envKey) {
  if (args[urlKey]) return String(args[urlKey]).trim();
  if (args[fileKey]) return fs.readFileSync(args[fileKey], "utf8").trim();
  if (process.env[envKey]) return String(process.env[envKey]).trim();
  return "";
}

function assertDistinctDatabases(sourceUrl, targetUrl) {
  const sh = new URL(sourceUrl).hostname;
  const th = new URL(targetUrl).hostname;
  if (!sh || !th) throw new Error("Could not parse database hostnames.");
  if (sh === th) {
    throw new Error(`Refusing sync: source and target resolve to the same host (${sh}).`);
  }
}

async function withClient(connectionString, fn, { readOnly = false } = {}) {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await client.connect();
  try {
    if (readOnly) {
      await client.query("BEGIN READ ONLY");
      try {
        return await fn(client);
      } finally {
        await client.query("ROLLBACK").catch(() => {});
      }
    }
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function loadCurriculumFromDb(connectionString, { readOnly = true } = {}) {
  return withClient(connectionString, async (client) => {
    const result = await client.query(
      "SELECT data FROM llh_store WHERE id = $1",
      [STORE_ID],
    );
    if (!result.rows[0]?.data) throw new Error(`Store row missing for id=${STORE_ID}`);
    const store = result.rows[0].data;
    const curriculum = store?.siteContent?.curriculum || {};
    return { store, curriculum: sync.normalizeCurriculum(curriculum) };
  }, { readOnly });
}

function loadCurriculumFromFile(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (raw?.siteContent?.curriculum) {
    return {
      store: raw,
      curriculum: sync.normalizeCurriculum(raw.siteContent.curriculum),
    };
  }
  if (raw?.curriculum?.siteContent?.curriculum) {
    return {
      store: raw,
      curriculum: sync.normalizeCurriculum(raw.curriculum.siteContent.curriculum),
    };
  }
  if (raw?.lessonPlans) {
    return { store: null, curriculum: sync.normalizeCurriculum(raw) };
  }
  throw new Error(`Unrecognized curriculum file shape: ${filePath}`);
}

async function backupTestingCurriculum(client, curriculum) {
  const id = `curriculum_sync_${new Date().toISOString().replace(/[:.]/g, "-")}_${crypto.randomBytes(3).toString("hex")}`;
  const payload = {
    purpose: "pre-production-curriculum-sync",
    exportedAt: new Date().toISOString(),
    curriculum,
  };
  // Prefer dedicated curriculum sync backup table-less approach: store in llh_store_backups if present.
  const table = await client.query(
    "SELECT 1 FROM information_schema.tables WHERE table_name = 'llh_store_backups' LIMIT 1",
  );
  if (table.rows.length) {
    await client.query(
      `INSERT INTO llh_store_backups (
        id, source, user_count, message_count, founding_count, notification_count, support_ticket_count, verified, data
      ) VALUES ($1,$2,0,0,0,0,0,TRUE,$3::jsonb)`,
      [id, "curriculum_production_sync", JSON.stringify({ siteContent: { curriculum: payload.curriculum }, _curriculumSyncBackup: payload })],
    );
  }
  const dir = path.join(ARTIFACT_DIR, "backups");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return { id, filePath };
}

async function applyCurriculum(client, nextCurriculum, meta) {
  await client.query("BEGIN");
  try {
    const result = await client.query(
      "SELECT data FROM llh_store WHERE id = $1 FOR UPDATE",
      [STORE_ID],
    );
    if (!result.rows[0]?.data) throw new Error("Target store row missing.");
    const store = result.rows[0].data;
    const beforePlans = (store.siteContent?.curriculum?.lessonPlans || []).length;
    const beforeIds = new Set(
      (store.siteContent?.curriculum?.lessonPlans || []).map((p) => String(p.id || "")).filter(Boolean),
    );

    store.siteContent = store.siteContent && typeof store.siteContent === "object" ? store.siteContent : {};
    store.siteContent.curriculum = nextCurriculum;
    store.siteContent.updatedAt = nextCurriculum.updatedAt;
    store.siteContent.playBasedCurriculum = true;
    store.curriculumProductionSync = {
      ...(store.curriculumProductionSync || {}),
      lastSyncedAt: meta.syncedAt,
      lastReport: meta.reportSummary,
      productionLessonCount: meta.productionLessonCount,
      testingLessonCount: nextCurriculum.lessonPlans.length,
      updatedAt: meta.syncedAt,
    };

    const afterIds = new Set(nextCurriculum.lessonPlans.map((p) => String(p.id || "")).filter(Boolean));
    for (const id of beforeIds) {
      if (!afterIds.has(id)) {
        throw new Error(`Safety abort: lesson ${id} would disappear.`);
      }
    }
    if (nextCurriculum.lessonPlans.length < beforePlans) {
      throw new Error("Safety abort: lesson plan count would shrink.");
    }

    await client.query(
      "UPDATE llh_store SET data = $2::jsonb, updated_at = NOW() WHERE id = $1",
      [STORE_ID, JSON.stringify(store)],
    );
    await client.query("COMMIT");
    return store;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function verifyTarget(connectionString, productionCurriculum, expectedMinPlans) {
  const { curriculum } = await loadCurriculumFromDb(connectionString, { readOnly: true });
  const comparison = sync.compareCurriculum(productionCurriculum, curriculum);
  const snapshotCount = curriculum.lessonPlans.filter((p) => sync.isProductionSnapshot(p)).length;
  return {
    testingLessonCount: curriculum.lessonPlans.length,
    expectedMinPlans,
    snapshotCount,
    comparison,
    ok:
      comparison.missing.length === 0
      && comparison.conflicts.length === 0
      && comparison.duplicateTestingIds.length === 0
      && curriculum.lessonPlans.length >= expectedMinPlans,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const sourceUrl = readUrl(args, "sourceDbUrlFile", "sourceDbUrl", "SOURCE_DATABASE_URL");
  const targetUrl = readUrl(args, "targetDbUrlFile", "targetDbUrl", "TARGET_DATABASE_URL");

  let production;
  if (args.sourceFile) {
    production = loadCurriculumFromFile(args.sourceFile).curriculum;
  } else {
    if (!sourceUrl) throw new Error("Provide --source-db-url / --source-db-url-file or --source-file");
    if (!targetUrl) throw new Error("Provide --target-db-url / --target-db-url-file");
    assertDistinctDatabases(sourceUrl, targetUrl);
    console.log("[sync] Loading production curriculum (READ ONLY)…");
    production = (await loadCurriculumFromDb(sourceUrl, { readOnly: true })).curriculum;
  }

  if (!targetUrl && !args.dryRun) {
    throw new Error("Apply mode requires a target database URL.");
  }

  console.log("[sync] Loading testing curriculum…");
  const testingBundle = targetUrl
    ? await loadCurriculumFromDb(targetUrl, { readOnly: true })
    : { curriculum: sync.normalizeCurriculum({ lessonPlans: [], activities: [], resources: [], series: [] }) };
  const testing = testingBundle.curriculum;

  const productionCountBefore = production.lessonPlans.length;
  const testingCountBefore = testing.lessonPlans.length;
  console.log(`[sync] Production lessons: ${productionCountBefore}`);
  console.log(`[sync] Testing lessons: ${testingCountBefore}`);

  const plan = sync.planCurriculumSync(production, testing);
  const summary = sync.buildSyncStatusSummary(plan.comparison, {
    lastSyncedAt: testingBundle.store?.curriculumProductionSync?.lastSyncedAt || null,
    mode: args.apply ? "apply" : "dry-run",
  });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.apply ? "apply" : "dry-run",
    productionLessonCountBefore: productionCountBefore,
    testingLessonCountBefore: testingCountBefore,
    summary,
    comparison: {
      status: plan.comparison.status,
      missing: plan.comparison.missing,
      outdated: plan.comparison.outdated,
      conflicts: plan.comparison.conflicts,
      duplicateProductionIds: plan.comparison.duplicateProductionIds,
      duplicateTestingIds: plan.comparison.duplicateTestingIds,
      testerOnlyCount: plan.comparison.testerOnly.length,
    },
    imported: plan.imported || [],
    updated: plan.updated || [],
    skippedCount: (plan.skipped || []).length,
    failedImports: plan.failedImports || [],
    activitiesUpserted: plan.activitiesUpserted || 0,
    resourcesUpserted: plan.resourcesUpserted || 0,
    seriesUpserted: plan.seriesUpserted || 0,
    aborted: Boolean(plan.aborted),
    message: plan.message,
    productionUnchanged: true,
  };

  console.log(`[sync] Status: ${summary.statusLabel}`);
  console.log(`[sync] Missing: ${summary.missingCount}, outdated: ${summary.outdatedCount}, conflicts: ${summary.conflictCount}`);

  if (plan.aborted) {
    const reportPath = args.reportPath || path.join(ARTIFACT_DIR, "sync-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.error(`[sync] ABORTED: ${plan.message}`);
    console.error(`[sync] Report: ${reportPath}`);
    process.exitCode = 2;
    return;
  }

  if (!args.apply) {
    const reportPath = args.reportPath || path.join(ARTIFACT_DIR, "sync-report-dry-run.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`[sync] Dry-run only. Report: ${reportPath}`);
    console.log(`[sync] Would import ${plan.imported.length}, update ${plan.updated.length}.`);
    return;
  }

  console.log("[sync] Creating testing curriculum backup…");
  const backup = await withClient(targetUrl, (client) => backupTestingCurriculum(client, testing), { readOnly: false });
  report.backup = backup;
  console.log(`[sync] Backup: ${backup.id}`);

  console.log("[sync] Applying merge to testing database ONLY…");
  await withClient(targetUrl, (client) => applyCurriculum(client, plan.nextCurriculum, {
    syncedAt: plan.syncedAt,
    productionLessonCount: productionCountBefore,
    reportSummary: {
      imported: plan.imported.length,
      updated: plan.updated.length,
      failed: plan.failedImports.length,
      status: "applied",
    },
  }), { readOnly: false });

  // Re-read production to confirm unchanged.
  if (sourceUrl) {
    const prodAfter = (await loadCurriculumFromDb(sourceUrl, { readOnly: true })).curriculum;
    report.productionLessonCountAfter = prodAfter.lessonPlans.length;
    report.productionUnchanged = prodAfter.lessonPlans.length === productionCountBefore;
    if (!report.productionUnchanged) {
      console.error("[sync] ALERT: production lesson count changed during sync — investigate immediately.");
      process.exitCode = 3;
    }
  }

  const verification = await verifyTarget(targetUrl, production, productionCountBefore);
  report.verification = {
    ok: verification.ok,
    testingLessonCount: verification.testingLessonCount,
    snapshotCount: verification.snapshotCount,
    missingAfter: verification.comparison.missing,
    conflictsAfter: verification.comparison.conflicts,
    duplicatesAfter: verification.comparison.duplicateTestingIds,
  };
  report.testingLessonCountAfter = verification.testingLessonCount;
  report.summary = sync.buildSyncStatusSummary(verification.comparison, {
    lastSyncedAt: plan.syncedAt,
    mode: "apply",
  });

  const reportPath = args.reportPath || path.join(ARTIFACT_DIR, "sync-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Markdown summary for humans
  const mdPath = path.join(ROOT, "docs/audits/CURRICULUM_PRODUCTION_SYNC_REPORT.md");
  const md = [
    "# Curriculum Production → Testing Sync Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Counts",
    "",
    `| Environment | Before | After |`,
    `|---|---:|---:|`,
    `| Production | ${report.productionLessonCountBefore} | ${report.productionLessonCountAfter ?? report.productionLessonCountBefore} |`,
    `| Testing | ${report.testingLessonCountBefore} | ${report.testingLessonCountAfter} |`,
    "",
    `Status: **${report.summary.statusLabel}**`,
    "",
    `Last synced: ${report.summary.lastSyncedAt || "—"}`,
    "",
    "## Safety",
    "",
    `- Production unmodified: ${report.productionUnchanged ? "yes" : "NO"}`,
    `- Backup id: \`${report.backup?.id || "—"}\``,
    `- Conflicts: ${report.comparison.conflicts.length}`,
    `- Failed imports: ${report.failedImports.length}`,
    `- Missing after sync: ${(report.verification?.missingAfter || []).length}`,
    `- Duplicates after sync: ${(report.verification?.duplicatesAfter || []).length}`,
    "",
    "## Changes",
    "",
    `- Imported: ${report.imported.length}`,
    `- Updated: ${report.updated.length}`,
    `- Activities upserted: ${report.activitiesUpserted}`,
    `- Resources upserted: ${report.resourcesUpserted}`,
    `- Series upserted: ${report.seriesUpserted}`,
    "",
    report.imported.length
      ? `### Imported IDs\n\n${report.imported.map((x) => `- \`${x.id}\` — ${x.title}`).join("\n")}`
      : "",
    "",
    "Testing site only. Production was not written.",
    "",
  ].filter(Boolean).join("\n");
  fs.writeFileSync(mdPath, md);

  console.log(`[sync] Done. Testing lessons: ${report.testingLessonCountAfter}`);
  console.log(`[sync] Report: ${reportPath}`);
  console.log(`[sync] Markdown: ${mdPath}`);
  if (!verification.ok || !report.productionUnchanged) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[sync] FATAL:", error.message || error);
  process.exitCode = 1;
});
