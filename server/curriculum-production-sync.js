/**
 * Safe, non-destructive production → testing curriculum sync.
 *
 * HARD RULES:
 * - Never write to the production source.
 * - Never delete lesson plans from either environment.
 * - Never overwrite tester-created plans (same ID without productionSnapshot).
 * - On conflict: stop and report (no guessing).
 * - Always backup testing curriculum before applying changes.
 * - Idempotent: re-run updates changed production snapshots only.
 */
"use strict";

const crypto = require("crypto");

const SNAPSHOT_FLAG = "productionSnapshot";
const SOURCE_ORIGIN = "production_snapshot";

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

function contentHash(entity) {
  if (!entity || typeof entity !== "object") return "";
  const clone = { ...entity };
  // Ignore sync bookkeeping when comparing substantive content.
  delete clone[SNAPSHOT_FLAG];
  delete clone.productionSnapshotSyncedAt;
  delete clone.productionSnapshotSourceUpdatedAt;
  delete clone.productionSnapshotHash;
  delete clone.sourceOrigin;
  return crypto.createHash("sha256").update(stableStringify(clone)).digest("hex");
}

function isProductionSnapshot(plan) {
  return Boolean(plan && (plan[SNAPSHOT_FLAG] === true || plan.sourceOrigin === SOURCE_ORIGIN));
}

function isExplicitTesterOwned(plan) {
  if (!plan || typeof plan !== "object") return false;
  if (plan.testerOwned === true || plan.createdByTester === true) return true;
  const origin = String(plan.sourceOrigin || "").trim().toLowerCase();
  return origin === "tester" || origin === "testing" || origin === "tester_created";
}

function parseTimestamp(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Classify a testing lesson that shares a production ID.
 * - in_sync / outdated: safe to leave or update from production
 * - conflict: explicitly tester-owned (or strict mode locally-newer edits)
 *
 * Default catalog sync: production wins for shared IDs that are not explicitly
 * tester-owned. Testing often re-saved the same catalog later (newer updatedAt)
 * without creating a distinct tester lesson.
 */
function classifySharedLesson(testPlan, prodPlan, { strictConflicts = false } = {}) {
  const sameContent = contentHash(testPlan) === contentHash(prodPlan);
  if (isProductionSnapshot(testPlan)) {
    return sameContent ? "in_sync" : "outdated";
  }
  if (isExplicitTesterOwned(testPlan) && !sameContent) {
    return "conflict";
  }
  if (sameContent) return "outdated_marker";
  if (strictConflicts) {
    const testUpdated = parseTimestamp(testPlan.updatedAt || testPlan.productionSnapshotSyncedAt);
    const prodUpdated = parseTimestamp(prodPlan.updatedAt || prodPlan.publishedAt);
    if (testUpdated && prodUpdated && testUpdated > prodUpdated) return "conflict";
  }
  // Shared catalog ID without tester ownership → refresh from production.
  return "outdated";
}

function markProductionSnapshot(entity, { syncedAt } = {}) {
  if (!entity || typeof entity !== "object") return entity;
  const now = syncedAt || new Date().toISOString();
  const hash = contentHash(entity);
  return {
    ...entity,
    [SNAPSHOT_FLAG]: true,
    sourceOrigin: SOURCE_ORIGIN,
    productionSnapshotSyncedAt: now,
    productionSnapshotSourceUpdatedAt: String(entity.updatedAt || entity.createdAt || now),
    productionSnapshotHash: hash,
  };
}

function validateLessonPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object") return ["not an object"];
  if (!String(plan.id || "").trim()) errors.push("missing id");
  if (!String(plan.title || "").trim()) errors.push("missing title");
  if (!String(plan.age || "").trim()) errors.push("missing age");
  if (!String(plan.status || "").trim()) errors.push("missing status");
  if (plan.dailyPlans != null && typeof plan.dailyPlans !== "object") {
    errors.push("dailyPlans must be an object");
  }
  if (plan.books != null && !Array.isArray(plan.books)) errors.push("books must be an array");
  if (plan.songs != null && !Array.isArray(plan.songs)) errors.push("songs must be an array");
  return errors;
}

function indexById(list = []) {
  const map = new Map();
  const duplicates = [];
  for (const item of list || []) {
    const id = String(item?.id || "").trim();
    if (!id) continue;
    if (map.has(id)) duplicates.push(id);
    else map.set(id, item);
  }
  return { map, duplicates: [...new Set(duplicates)] };
}

function normalizeCurriculum(input) {
  const cur = input && typeof input === "object" ? input : {};
  return {
    lessonPlans: Array.isArray(cur.lessonPlans) ? cur.lessonPlans.filter(Boolean) : [],
    activities: Array.isArray(cur.activities) ? cur.activities.filter(Boolean) : [],
    resources: Array.isArray(cur.resources) ? cur.resources.filter(Boolean) : [],
    series: Array.isArray(cur.series) ? cur.series.filter(Boolean) : [],
    updatedAt: String(cur.updatedAt || ""),
  };
}

function compareCurriculum(productionCurriculum, testingCurriculum, options = {}) {
  const production = normalizeCurriculum(productionCurriculum);
  const testing = normalizeCurriculum(testingCurriculum);
  const prodPlans = indexById(production.lessonPlans);
  const testPlans = indexById(testing.lessonPlans);

  const missing = [];
  const outdated = [];
  const inSync = [];
  const conflicts = [];
  const testerOnly = [];

  for (const [id, prodPlan] of prodPlans.map) {
    const testPlan = testPlans.map.get(id);
    if (!testPlan) {
      missing.push({ id, title: prodPlan.title || id });
      continue;
    }
    const kind = classifySharedLesson(testPlan, prodPlan, options);
    if (kind === "conflict") {
      conflicts.push({
        id,
        title: testPlan.title || prodPlan.title || id,
        reason: isExplicitTesterOwned(testPlan)
          ? "Tester-owned lesson shares a production ID with different content."
          : "Testing lesson is newer than production and content differs — possible local edits.",
      });
      continue;
    }
    if (kind === "in_sync") {
      inSync.push(id);
      continue;
    }
    outdated.push({
      id,
      title: prodPlan.title || id,
      reason: kind === "outdated_marker" ? "missing_snapshot_marker" : "content_changed",
    });
  }

  for (const [id, testPlan] of testPlans.map) {
    if (!prodPlans.map.has(id)) {
      testerOnly.push({
        id,
        title: testPlan.title || id,
        productionSnapshot: isProductionSnapshot(testPlan),
      });
    }
  }

  return {
    productionLessonCount: production.lessonPlans.length,
    testingLessonCount: testing.lessonPlans.length,
    productionActivityCount: production.activities.length,
    testingActivityCount: testing.activities.length,
    productionResourceCount: production.resources.length,
    testingResourceCount: testing.resources.length,
    missing,
    outdated,
    inSyncCount: inSync.length,
    conflicts,
    testerOnly,
    duplicateProductionIds: prodPlans.duplicates,
    duplicateTestingIds: testPlans.duplicates,
    status: conflicts.length
      ? "conflict"
      : missing.length || outdated.length
        ? "needs_sync"
        : "in_sync",
  };
}

function relatedActivities(production, lessonPlanIds) {
  const idSet = new Set(lessonPlanIds);
  return (production.activities || []).filter((a) => idSet.has(String(a?.lessonPlanId || "")));
}

function relatedResources(production, lessonPlanIds) {
  const idSet = new Set(lessonPlanIds);
  return (production.resources || []).filter((r) => {
    const links = Array.isArray(r?.lessonPlanIds) ? r.lessonPlanIds : [];
    return links.some((id) => idSet.has(String(id || "")));
  });
}

function relatedSeries(production, lessonPlanIds) {
  const idSet = new Set(lessonPlanIds);
  return (production.series || []).filter((s) => {
    const weeks = Array.isArray(s?.weeks) ? s.weeks : [];
    return weeks.some((w) => idSet.has(String(w?.lessonPlanId || "")));
  });
}

/**
 * Build a merged testing curriculum + report. Does not mutate inputs.
 * When conflicts exist, returns { ok:false, aborted:true } with no nextCurriculum.
 */
function planCurriculumSync(productionCurriculum, testingCurriculum, { syncedAt, strictConflicts = false } = {}) {
  const production = normalizeCurriculum(productionCurriculum);
  const testing = normalizeCurriculum(testingCurriculum);
  const comparison = compareCurriculum(production, testing, { strictConflicts });
  const now = syncedAt || new Date().toISOString();

  const failedImports = [];
  const imported = [];
  const updated = [];
  const skipped = [];

  if (comparison.conflicts.length) {
    return {
      ok: false,
      aborted: true,
      reason: "conflict",
      comparison,
      failedImports,
      imported,
      updated,
      skipped,
      message: "Conflict detected — import stopped. Resolve conflicts before syncing.",
    };
  }

  if (comparison.duplicateProductionIds.length || comparison.duplicateTestingIds.length) {
    return {
      ok: false,
      aborted: true,
      reason: "duplicates",
      comparison,
      failedImports,
      imported,
      updated,
      skipped,
      message: "Duplicate lesson plan IDs detected — import stopped.",
    };
  }

  const testPlans = indexById(testing.lessonPlans).map;
  const testActs = indexById(testing.activities).map;
  const testRes = indexById(testing.resources).map;
  const testSeries = indexById(testing.series).map;

  const nextPlans = new Map(testPlans);
  const touchedLessonIds = [];

  for (const prodPlan of production.lessonPlans) {
    const id = String(prodPlan.id || "").trim();
    if (!id) {
      failedImports.push({ id: "", title: prodPlan.title || "", errors: ["missing id"] });
      continue;
    }
    const errors = validateLessonPlan(prodPlan);
    if (errors.length) {
      failedImports.push({ id, title: prodPlan.title || id, errors });
      continue;
    }

    const existing = nextPlans.get(id);
    if (!existing) {
      nextPlans.set(id, markProductionSnapshot(prodPlan, { syncedAt: now }));
      imported.push({ id, title: prodPlan.title || id });
      touchedLessonIds.push(id);
      continue;
    }

    const kind = classifySharedLesson(existing, prodPlan, { strictConflicts });
    if (kind === "conflict") {
      comparison.conflicts.push({
        id,
        title: existing.title || id,
        reason: "tester-owned or locally-newer conflict during apply",
      });
      return {
        ok: false,
        aborted: true,
        reason: "conflict",
        comparison,
        failedImports,
        imported,
        updated,
        skipped,
        message: "Conflict detected during apply — import stopped.",
      };
    }

    if (kind === "in_sync") {
      skipped.push({ id, title: prodPlan.title || id, reason: "unchanged" });
      continue;
    }

    // Update stale production copy / stamp snapshot marker.
    nextPlans.set(id, markProductionSnapshot(prodPlan, { syncedAt: now }));
    updated.push({ id, title: prodPlan.title || id });
    touchedLessonIds.push(id);
  }

  // Merge related activities/resources/series for touched + all production IDs being synced.
  // Always ensure activities for every production lesson exist when those lessons are present.
  const productionLessonIds = production.lessonPlans.map((p) => String(p.id || "")).filter(Boolean);
  const nextActs = new Map(testActs);
  const nextRes = new Map(testRes);
  const nextSeries = new Map(testSeries);

  let activitiesUpserted = 0;
  let resourcesUpserted = 0;
  let seriesUpserted = 0;

  for (const act of relatedActivities(production, productionLessonIds)) {
    const id = String(act.id || "").trim();
    if (!id) continue;
    const existing = nextActs.get(id);
    if (existing) {
      const kind = classifySharedLesson(existing, act, { strictConflicts });
      if (kind === "conflict") {
        comparison.conflicts.push({
          id,
          title: existing.title || id,
          reason: "Activity conflict: tester-owned content differs from production.",
        });
        return {
          ok: false,
          aborted: true,
          reason: "conflict",
          comparison,
          failedImports,
          imported,
          updated,
          skipped,
          message: "Activity conflict detected — import stopped.",
        };
      }
      if (kind === "in_sync") continue;
    }
    nextActs.set(id, markProductionSnapshot(act, { syncedAt: now }));
    activitiesUpserted += 1;
  }

  for (const res of relatedResources(production, productionLessonIds)) {
    const id = String(res.id || "").trim();
    if (!id) continue;
    const existing = nextRes.get(id);
    if (existing) {
      const kind = classifySharedLesson(existing, res, { strictConflicts });
      if (kind === "conflict") {
        comparison.conflicts.push({
          id,
          title: existing.title || id,
          reason: "Resource conflict: tester-owned content differs from production.",
        });
        return {
          ok: false,
          aborted: true,
          reason: "conflict",
          comparison,
          failedImports,
          imported,
          updated,
          skipped,
          message: "Resource conflict detected — import stopped.",
        };
      }
      if (kind === "in_sync") continue;
    }
    nextRes.set(id, markProductionSnapshot(res, { syncedAt: now }));
    resourcesUpserted += 1;
  }

  for (const series of relatedSeries(production, productionLessonIds)) {
    const id = String(series.id || "").trim();
    if (!id) continue;
    const existing = nextSeries.get(id);
    if (existing) {
      const kind = classifySharedLesson(existing, series, { strictConflicts });
      if (kind === "conflict") {
        comparison.conflicts.push({
          id,
          title: existing.title || id,
          reason: "Series conflict: tester-owned content differs from production.",
        });
        return {
          ok: false,
          aborted: true,
          reason: "conflict",
          comparison,
          failedImports,
          imported,
          updated,
          skipped,
          message: "Series conflict detected — import stopped.",
        };
      }
      if (kind === "in_sync") continue;
    }
    nextSeries.set(id, markProductionSnapshot(series, { syncedAt: now }));
    seriesUpserted += 1;
  }

  const nextCurriculum = {
    lessonPlans: [...nextPlans.values()],
    activities: [...nextActs.values()],
    resources: [...nextRes.values()],
    series: [...nextSeries.values()],
    updatedAt: now,
  };

  // Post-merge invariants
  const afterCompare = compareCurriculum(production, nextCurriculum);
  const disappeared = testing.lessonPlans
    .map((p) => String(p.id || ""))
    .filter((id) => id && !nextPlans.has(id));

  if (disappeared.length) {
    return {
      ok: false,
      aborted: true,
      reason: "would_delete",
      comparison,
      failedImports,
      imported,
      updated,
      skipped,
      message: "Safety stop: merge would remove existing testing lesson plans.",
      disappeared,
    };
  }

  return {
    ok: true,
    aborted: false,
    comparison,
    nextCurriculum,
    imported,
    updated,
    skipped,
    failedImports,
    activitiesUpserted,
    resourcesUpserted,
    seriesUpserted,
    touchedLessonIds,
    afterCompare,
    syncedAt: now,
    message: imported.length || updated.length
      ? `Ready to import ${imported.length} and update ${updated.length} lesson plan(s).`
      : "Already in sync — no lesson plan changes needed.",
  };
}

function buildSyncStatusSummary(comparison, meta = {}) {
  const lastSynced = meta.lastSyncedAt || null;
  const inSync = comparison.status === "in_sync";
  return {
    productionLessonCount: comparison.productionLessonCount,
    testingLessonCount: comparison.testingLessonCount,
    missingCount: comparison.missing.length,
    outdatedCount: comparison.outdated.length,
    conflictCount: comparison.conflicts.length,
    duplicateProductionCount: comparison.duplicateProductionIds.length,
    duplicateTestingCount: comparison.duplicateTestingIds.length,
    testerOnlyCount: comparison.testerOnly.length,
    lastSyncedAt: lastSynced,
    status: comparison.status,
    statusLabel: inSync
      ? "✓ In Sync"
      : comparison.status === "conflict"
        ? "⚠ Conflict — sync blocked"
        : "↻ Needs sync",
    ...meta,
  };
}

module.exports = {
  SNAPSHOT_FLAG,
  SOURCE_ORIGIN,
  contentHash,
  isProductionSnapshot,
  isExplicitTesterOwned,
  classifySharedLesson,
  markProductionSnapshot,
  validateLessonPlan,
  normalizeCurriculum,
  compareCurriculum,
  planCurriculumSync,
  buildSyncStatusSummary,
  relatedActivities,
  relatedResources,
  relatedSeries,
};
