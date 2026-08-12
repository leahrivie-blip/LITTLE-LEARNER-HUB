#!/usr/bin/env node
/**
 * Focused tests for enrichmentPublishHistory retention (Phase A).
 * Run: NODE_ENV=test node scripts/test-enrichment-publish-history-retention.js
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  ENRICHMENT_HISTORY_RETENTION_LIMIT,
  trimEnrichmentPublishHistory,
  prependEnrichmentPublishHistory,
  pruneEnrichmentPublishHistoryInStore,
  isDraftLikeHistoryEntry,
  isRollbackWorthyHistoryEntry,
} = require("../server/enrichment-publish-history.js");

const ROOT = path.join(__dirname, "..");

function entry(overrides = {}) {
  return {
    versionId: overrides.versionId || `v-${Math.random().toString(16).slice(2, 10)}`,
    kind: overrides.kind || "publish",
    publishedAt: overrides.publishedAt || "2026-08-12T00:00:00.000Z",
    publishedBy: overrides.publishedBy || "owner@example.com",
    fingerprint: overrides.fingerprint || `fp-${overrides.versionId || "x"}`,
    lessonPlanId: overrides.lessonPlanId || "cur-lp-test",
    rollbackOf: overrides.rollbackOf || "",
    snapshot: overrides.snapshot !== undefined
      ? overrides.snapshot
      : { dailyPlans: { monday: { items: [] } }, familyConnection: "keep" },
  };
}

function makePlan(history) {
  return {
    id: "cur-lp-test",
    title: "Retention Test Lesson",
    teachingKit: { title: "TK Keep", completeness: "ready" },
    enrichmentDraft: { week: { familyConnection: "draft-live" }, activities: { a1: { teacherTips: ["tip"] } } },
    enrichmentPublished: { familyConnection: "published-live" },
    dailyPlans: { monday: { items: [{ itemId: "item-1", title: "Core" }] } },
    resourceIds: ["cur-res-keep"],
    enrichmentPublishHistory: history,
  };
}

function run() {
  assert.equal(ENRICHMENT_HISTORY_RETENTION_LIMIT, 5, "retention limit is 5");

  // 1. Empty history
  assert.deepEqual(trimEnrichmentPublishHistory([]), []);
  assert.deepEqual(trimEnrichmentPublishHistory(null), []);

  // 2. Below limit unchanged (publish-only)
  const below = [entry({ versionId: "p1" }), entry({ versionId: "p2" }), entry({ versionId: "p3" })];
  const belowTrimmed = trimEnrichmentPublishHistory(below);
  assert.equal(belowTrimmed.length, 3);
  assert.deepEqual(belowTrimmed.map((e) => e.versionId), ["p1", "p2", "p3"]);

  // 3. Exactly limit unchanged
  const exact = [1, 2, 3, 4, 5].map((n) => entry({ versionId: `p${n}`, fingerprint: `fp${n}` }));
  assert.equal(trimEnrichmentPublishHistory(exact).length, 5);
  assert.deepEqual(trimEnrichmentPublishHistory(exact).map((e) => e.versionId), exact.map((e) => e.versionId));

  // 4–6. Above limit keeps newest 5 publish; preserves order + versionIds
  const above = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => entry({
    versionId: `pub-${n}`,
    publishedAt: `2026-08-0${n}T00:00:00.000Z`,
    fingerprint: `fp-pub-${n}`,
  }));
  const trimmedAbove = trimEnrichmentPublishHistory(above);
  assert.equal(trimmedAbove.length, 5);
  assert.deepEqual(trimmedAbove.map((e) => e.versionId), ["pub-1", "pub-2", "pub-3", "pub-4", "pub-5"]);
  assert.equal(trimmedAbove[0].publishedAt, above[0].publishedAt);

  // Prefer publish over draft noise
  const mixed = [
    entry({ versionId: "d-new", kind: "draft", fingerprint: "fd1", snapshot: { enrichmentDraft: { x: 1 } } }),
    entry({ versionId: "p1", kind: "publish", fingerprint: "fp1" }),
    entry({ versionId: "d2", kind: "draft", fingerprint: "fd2", snapshot: { enrichmentDraft: { x: 2 } } }),
    entry({ versionId: "p2", kind: "publish", fingerprint: "fp2" }),
    entry({ versionId: "p3", kind: "publish", fingerprint: "fp3" }),
    entry({ versionId: "p4", kind: "publish", fingerprint: "fp4" }),
    entry({ versionId: "p5", kind: "publish", fingerprint: "fp5" }),
    entry({ versionId: "p6", kind: "publish", fingerprint: "fp6" }),
  ];
  const mixedTrimmed = trimEnrichmentPublishHistory(mixed);
  assert.equal(mixedTrimmed.length, 5);
  assert.ok(mixedTrimmed.every((e) => e.kind === "publish"), "full publish set fills the 5 slots");
  assert.deepEqual(mixedTrimmed.map((e) => e.versionId), ["p1", "p2", "p3", "p4", "p5"]);

  // Draft-only: keep up to 5 newest drafts
  const draftsOnly = [1, 2, 3, 4, 5, 6, 7].map((n) => entry({
    versionId: `d${n}`,
    kind: "draft",
    fingerprint: `draft-fp-${n}`,
    snapshot: { enrichmentDraft: { n } },
  }));
  const draftsTrimmed = trimEnrichmentPublishHistory(draftsOnly);
  assert.equal(draftsTrimmed.length, 5);
  assert.deepEqual(draftsTrimmed.map((e) => e.versionId), ["d1", "d2", "d3", "d4", "d5"]);

  // Mixed under limit: keep publishes + at most 1 draft
  const underMixed = [
    entry({ versionId: "d1", kind: "draft", fingerprint: "df1", snapshot: { enrichmentDraft: {} } }),
    entry({ versionId: "p1", kind: "publish", fingerprint: "pf1" }),
    entry({ versionId: "d2", kind: "draft", fingerprint: "df2", snapshot: { enrichmentDraft: {} } }),
    entry({ versionId: "p2", kind: "publish", fingerprint: "pf2" }),
  ];
  const underMixedTrimmed = trimEnrichmentPublishHistory(underMixed);
  assert.equal(underMixedTrimmed.filter((e) => e.kind === "publish").length, 2);
  assert.equal(underMixedTrimmed.filter((e) => e.kind === "draft").length, 1);
  assert.equal(underMixedTrimmed[0].versionId, "d1", "newest draft kept when room remains");

  // 12. Consecutive duplicate fingerprints collapsed
  const dupes = [
    entry({ versionId: "a", fingerprint: "same" }),
    entry({ versionId: "b", fingerprint: "same" }),
    entry({ versionId: "c", fingerprint: "other" }),
  ];
  const deduped = trimEnrichmentPublishHistory(dupes);
  assert.deepEqual(deduped.map((e) => e.versionId), ["a", "c"]);

  // Kind helpers
  assert.equal(isDraftLikeHistoryEntry(entry({ kind: "draft", snapshot: { enrichmentDraft: {} } })), true);
  assert.equal(isDraftLikeHistoryEntry(entry({ kind: "draft_review", snapshot: { enrichmentDraft: {} } })), true);
  assert.equal(isRollbackWorthyHistoryEntry(entry({ kind: "publish" })), true);
  assert.equal(isRollbackWorthyHistoryEntry(entry({ kind: "rollback" })), true);
  assert.equal(isRollbackWorthyHistoryEntry(entry({ kind: "draft", snapshot: { enrichmentDraft: {} } })), false);

  // 7–11, 13: prune in store leaves live fields untouched; retained IDs usable for rollback
  const fatHistory = [1, 2, 3, 4, 5, 6, 7].map((n) => entry({
    versionId: `keep-${n}`,
    fingerprint: `kfp-${n}`,
    publishedAt: `2026-08-1${n}T00:00:00.000Z`,
  }));
  const store = {
    siteContent: {
      curriculum: {
        lessonPlans: [makePlan(fatHistory)],
        activities: [{ id: "act-1", title: "A" }],
        resources: [{ id: "cur-res-keep", title: "R" }],
      },
    },
  };
  const beforeDraft = JSON.stringify(store.siteContent.curriculum.lessonPlans[0].enrichmentDraft);
  const beforePublished = JSON.stringify(store.siteContent.curriculum.lessonPlans[0].enrichmentPublished);
  const beforeTk = JSON.stringify(store.siteContent.curriculum.lessonPlans[0].teachingKit);
  const beforeDaily = JSON.stringify(store.siteContent.curriculum.lessonPlans[0].dailyPlans);
  const beforeResources = JSON.stringify(store.siteContent.curriculum.resources);
  const stats = pruneEnrichmentPublishHistoryInStore(store);
  const plan = store.siteContent.curriculum.lessonPlans[0];
  assert.equal(stats.entriesBefore, 7);
  assert.equal(stats.entriesAfter, 5);
  assert.equal(plan.enrichmentPublishHistory.length, 5);
  assert.deepEqual(plan.enrichmentPublishHistory.map((e) => e.versionId), ["keep-1", "keep-2", "keep-3", "keep-4", "keep-5"]);
  assert.equal(JSON.stringify(plan.enrichmentDraft), beforeDraft);
  assert.equal(JSON.stringify(plan.enrichmentPublished), beforePublished);
  assert.equal(JSON.stringify(plan.teachingKit), beforeTk);
  assert.equal(JSON.stringify(plan.dailyPlans), beforeDaily);
  assert.equal(JSON.stringify(store.siteContent.curriculum.resources), beforeResources);
  // Rollback identity: find by versionId (not index)
  const targetId = "keep-3";
  const found = plan.enrichmentPublishHistory.find((e) => e.versionId === targetId);
  assert.ok(found, "retained versionId still addressable");
  assert.ok(found.snapshot, "retained snapshot present for rollback");

  // 14. New publish cannot exceed limit
  let hist = [];
  for (let i = 0; i < 12; i += 1) {
    hist = prependEnrichmentPublishHistory(hist, entry({
      versionId: `new-${i}`,
      fingerprint: `nfp-${i}`,
      kind: "publish",
    }));
    assert.ok(hist.length <= ENRICHMENT_HISTORY_RETENTION_LIMIT, `length capped at step ${i}`);
  }
  assert.equal(hist.length, 5);
  assert.equal(hist[0].versionId, "new-11", "newest publish remains first");

  // 15. Draft prepend keeps draft semantics but still respects retention
  let draftHist = [
    entry({ versionId: "pub-live", kind: "publish", fingerprint: "pl" }),
  ];
  draftHist = prependEnrichmentPublishHistory(draftHist, entry({
    versionId: "draft-1",
    kind: "draft",
    fingerprint: "d1",
    snapshot: { enrichmentDraft: { week: {} } },
  }));
  assert.equal(draftHist.length, 2);
  assert.equal(draftHist[0].kind, "draft");

  // 16–17. Dry-run script performs zero writes + reports byte reduction
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-hist-"));
  const storePath = path.join(tmpDir, "store.json");
  const fixture = {
    siteContent: {
      curriculum: {
        lessonPlans: [
          makePlan([1, 2, 3, 4, 5, 6, 7, 8].map((n) => entry({
            versionId: `fixture-${n}`,
            fingerprint: `ff-${n}`,
            snapshot: { dailyPlans: { monday: { items: [{ title: `snap-${n}`, pad: "x".repeat(2000) }] } } },
          }))),
        ],
        activities: [],
        resources: [],
      },
    },
  };
  fs.writeFileSync(storePath, JSON.stringify(fixture));
  const beforeMtime = fs.statSync(storePath).mtimeMs;
  const beforeRaw = fs.readFileSync(storePath);
  const dry = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts/prune-enrichment-publish-history.js"), `--store-path=${storePath}`, "--json"],
    { encoding: "utf8" },
  );
  assert.equal(dry.status, 0, dry.stderr || dry.stdout);
  const afterRaw = fs.readFileSync(storePath);
  assert.ok(beforeRaw.equals(afterRaw), "dry-run must not modify store file bytes");
  assert.equal(fs.statSync(storePath).mtimeMs, beforeMtime, "dry-run must not touch mtime");
  const dryReport = JSON.parse(dry.stdout);
  assert.equal(dryReport.applyRequested, false);
  assert.equal(dryReport.wrote, false);
  assert.ok(dryReport.storeBytesSaved > 0, "projected byte savings calculated");
  assert.ok(dryReport.historyEntriesRemoved >= 3, "entries projected removed");
  assert.equal(dryReport.retentionLimit, 5);

  // Source wiring: writers use prepend helper; no 250 retention constant
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(serverJs, /prependEnrichmentPublishHistory/);
  assert.match(serverJs, /enrichment-publish-history/);
  assert.doesNotMatch(serverJs, /ENRICHMENT_HISTORY_LIMIT = 250/);
  assert.match(serverJs, /ENRICHMENT_HISTORY_RETENTION_LIMIT/);
  const draftReviewJs = fs.readFileSync(path.join(ROOT, "server/curriculum-draft-review.js"), "utf8");
  assert.match(draftReviewJs, /prependEnrichmentPublishHistory/);
  assert.doesNotMatch(draftReviewJs, /\.slice\(0, 40\)/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("All enrichment publish-history retention tests passed.");
}

try {
  run();
} catch (error) {
  console.error("FAIL:", error.message);
  console.error(error.stack);
  process.exit(1);
}
