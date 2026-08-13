#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  reconcileStoreAfterUpdatedAtConflict,
  mergeLessonPlanPreferStaleFieldsAuthHistory,
} = require("../server/llh-store-updated-at-reconcile.js");

function makeFat(n) {
  return Array.from({ length: n }, (_, i) => ({
    versionId: `v-${n - i}`,
    kind: "draft",
    fingerprint: `fp-${n - i}`,
  }));
}

function testCurriculumMutationSurvivesWithPrunedHistory() {
  const auth = {
    users: { "a@x.com": { plan: "Free" } },
    foundingMembers: ["a@x.com"],
    siteContent: {
      curriculum: {
        lessonPlans: [{
          id: "plan-1",
          title: "Farm",
          weeklyOverview: "old-overview",
          objectives: "old-objectives",
          teachingKit: { binderTitle: "TK" },
          resourceIds: ["r1"],
          enrichmentDraft: { tip: "draft" },
          enrichmentPublishHistory: makeFat(5),
        }],
        activities: [{ id: "act-1", title: "A1" }],
        resources: [{ id: "r1", title: "Printable" }],
      },
    },
  };
  const stale = JSON.parse(JSON.stringify(auth));
  // Pre-prune cache still has fat history + NEW admin mutation.
  stale.siteContent.curriculum.lessonPlans[0].enrichmentPublishHistory = makeFat(12);
  stale.siteContent.curriculum.lessonPlans[0].weeklyOverview = "new-admin-overview";
  stale.siteContent.curriculum.lessonPlans[0].objectives = "new-admin-objectives";
  stale.siteContent.curriculum.lessonPlans[0].resourceIds = ["r1", "r2"];
  stale.siteContent.curriculum.resources.push({ id: "r2", title: "New Printable" });
  stale.siteContent.curriculum.lessonPlans[0].teachingKit = {
    binderTitle: "TK",
    activityNote: "edited-kit-activity",
  };

  const merged = reconcileStoreAfterUpdatedAtConflict(auth, stale);
  const plan = merged.siteContent.curriculum.lessonPlans[0];
  assert.equal(plan.enrichmentPublishHistory.length, 5, "history stays pruned");
  assert.equal(plan.weeklyOverview, "new-admin-overview", "weekly overview mutation preserved");
  assert.equal(plan.objectives, "new-admin-objectives", "objectives mutation preserved");
  assert.deepStrictEqual(plan.resourceIds, ["r1", "r2"], "printable linkage preserved");
  assert.equal(plan.teachingKit.activityNote, "edited-kit-activity", "TK edit preserved");
  assert.ok(
    merged.siteContent.curriculum.resources.some((r) => r.id === "r2"),
    "new resource preserved",
  );
  assert.deepStrictEqual(
    plan.enrichmentPublishHistory.map((e) => e.versionId),
    auth.siteContent.curriculum.lessonPlans[0].enrichmentPublishHistory.map((e) => e.versionId),
    "history versionIds come from authoritative pruned store",
  );
}

function testNoMutationKeepsAuthPlan() {
  const authPlan = {
    id: "p",
    weeklyOverview: "same",
    enrichmentPublishHistory: makeFat(5),
  };
  const stalePlan = {
    id: "p",
    weeklyOverview: "same",
    enrichmentPublishHistory: makeFat(12),
  };
  const merged = mergeLessonPlanPreferStaleFieldsAuthHistory(authPlan, stalePlan);
  assert.equal(merged.enrichmentPublishHistory.length, 5);
  assert.equal(merged.weeklyOverview, "same");
}

testCurriculumMutationSurvivesWithPrunedHistory();
testNoMutationKeepsAuthPlan();
console.log("All llh-store updated_at reconcile unit tests passed.");
