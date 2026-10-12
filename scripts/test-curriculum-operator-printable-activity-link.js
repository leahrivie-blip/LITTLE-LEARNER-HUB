#!/usr/bin/env node
/**
 * Regression: printable ↔ persisted activity linkage (post-save verification).
 */
"use strict";

const assert = require("assert");
const printablesApi = require("./curriculum-operator-printables.js");
const allowlistApi = require("./curriculum-operator-mutation-allowlist.js");

const LESSON = "cur-lp-link-test";
const ACT_A = "cur-act-aaa111";
const ACT_B = "cur-act-bbb222";
const ACT_TEMP = "item-temp-seed";
const RES = "cur-res-print-link";

function basePlan(enrichmentDraft) {
  return {
    id: LESSON,
    title: "Link Test Lesson",
    age: "Preschool",
    plan: "Pro",
    status: "draft",
    weeklyOverview: "Overview",
    enrichmentDraft,
  };
}

function successAction(activityId, resourceId = RES) {
  return {
    status: "success",
    decision: "CREATE",
    activityId,
    resourceId,
    title: "Story Walk Cards",
    spec: { title: "Story Walk Cards", resourceType: "sequencing_cards" },
  };
}

console.log("Printable activity link — unit linkage");

{
  const draft = { week: { printableIds: [] }, activities: { [ACT_TEMP]: { relatedPrintableId: RES } } };
  const activity = { id: ACT_A, itemId: ACT_TEMP, title: "Halloween Story Walk" };
  const linked = printablesApi.linkPrintableIntoEnrichmentDraft(draft, {
    lessonId: LESSON,
    expectedLessonId: LESSON,
    activityId: ACT_A,
    resourceId: RES,
    title: "Story Walk Cards",
    activityRecord: activity,
  });
  assert.ok(linked.ok, linked.error || "link ok");
  assert.equal(linked.enrichmentDraft.activities[ACT_A].relatedPrintableId, RES);
  assert.equal(linked.enrichmentDraft.activities[ACT_TEMP]?.relatedPrintableId, undefined,
    "temp itemId key cleared after remap to persisted id");
  assert.ok(linked.enrichmentDraft.week.printableIds.includes(RES));
}

{
  const merged = printablesApi.readActivityRelatedPrintableId(
    { [ACT_TEMP]: { relatedPrintableId: "old" }, [ACT_A]: { relatedPrintableId: RES } },
    ACT_A,
    { id: ACT_A, itemId: ACT_TEMP },
  );
  assert.equal(merged, RES, "persisted id wins over itemId patch merge");
}

console.log("Printable activity link — post-save verification");

{
  const before = basePlan({ week: { printableIds: [] }, activities: {} });
  const after = basePlan({
    week: { printableIds: [RES] },
    activities: { [ACT_A]: { relatedPrintableId: RES, relatedPrintableTitle: "Cards" } },
  });
  const resources = [{
    id: RES,
    title: "Story Walk Cards",
    fileName: "story-walk.pdf",
    status: "draft",
    lessonPlanIds: [LESSON],
    description: `Pack\nOperator activityId=${ACT_A}`,
  }];
  const verify = printablesApi.verifyPrintableJobDraft({
    beforePlan: before,
    afterPlan: after,
    actions: [successAction(ACT_A)],
    resourcesAfter: resources,
    activities: [{ id: ACT_A, title: "Story Walk" }],
  });
  assert.ok(verify.ok, verify.failed?.map((f) => f.code).join(", "));
}

{
  const after = basePlan({
    week: { printableIds: [RES] },
    activities: { [ACT_TEMP]: { relatedPrintableId: RES } },
  });
  const verify = printablesApi.verifyPrintableJobDraft({
    beforePlan: basePlan({ week: {}, activities: {} }),
    afterPlan: after,
    actions: [successAction(ACT_A)],
    resourcesAfter: [{ id: RES, title: "T", fileName: "t.pdf", status: "draft", lessonPlanIds: [LESSON] }],
    activities: [{ id: ACT_A, itemId: ACT_TEMP, title: "Story Walk" }],
  });
  assert.ok(verify.ok, "itemId-only draft patch resolves via persisted activity record");
}

{
  const after = basePlan({
    week: { printableIds: [RES] },
    activities: {
      [ACT_A]: { relatedPrintableId: RES },
      [ACT_B]: { title: "Similar Story Walk Name" },
    },
  });
  const verify = printablesApi.verifyPrintableJobDraft({
    beforePlan: basePlan({ week: {}, activities: {} }),
    afterPlan: after,
    actions: [successAction(ACT_A)],
    resourcesAfter: [{ id: RES, title: "T", fileName: "t.pdf", status: "draft", lessonPlanIds: [LESSON] }],
    activities: [
      { id: ACT_A, title: "Halloween Story Walk" },
      { id: ACT_B, title: "Halloween Story Walk Copy" },
    ],
  });
  assert.ok(verify.ok, "title similarity on other activity must not satisfy linkage");
}

{
  const after = basePlan({
    week: { printableIds: [RES] },
    activities: { [ACT_B]: { relatedPrintableId: RES } },
  });
  const verify = printablesApi.verifyPrintableJobDraft({
    beforePlan: basePlan({ week: {}, activities: {} }),
    afterPlan: after,
    actions: [successAction(ACT_A)],
    resourcesAfter: [{ id: RES, title: "T", fileName: "t.pdf", status: "draft", lessonPlanIds: [LESSON] }],
    activities: [{ id: ACT_A, title: "Target" }, { id: ACT_B, title: "Wrong" }],
  });
  assert.ok(!verify.ok);
  assert.ok(verify.failed.some((f) => f.code.startsWith("activity_link_")), "wrong activity rejected");
}

{
  const after = basePlan({ week: { printableIds: [RES] }, activities: {} });
  const verify = printablesApi.verifyPrintableJobDraft({
    beforePlan: basePlan({ week: {}, activities: {} }),
    afterPlan: after,
    actions: [successAction(ACT_A)],
    resourcesAfter: [{ id: RES, title: "T", fileName: "t.pdf", status: "draft", lessonPlanIds: [LESSON] }],
    activities: [{ id: ACT_A }],
  });
  assert.ok(!verify.ok);
  assert.ok(
    verify.failed.some((f) => f.code === `activity_link_${ACT_A}` || f.code === `activity_link_lesson_only_${RES}`),
    "lesson-level printableIds without activity link rejected",
  );
}

{
  const after = basePlan({
    week: { printableIds: [RES] },
    activities: { [ACT_A]: { relatedPrintableId: "cur-res-other" } },
  });
  const verify = printablesApi.verifyPrintableJobDraft({
    beforePlan: basePlan({ week: {}, activities: { [ACT_A]: { relatedPrintableId: "cur-res-stale" } } }),
    afterPlan: after,
    actions: [successAction(ACT_A, RES)],
    resourcesAfter: [{ id: RES, title: "T", fileName: "t.pdf", status: "draft", lessonPlanIds: [LESSON] }],
    activities: [{ id: ACT_A }],
  });
  assert.ok(!verify.ok, "stale/wrong resource on activity fails closed");
}

console.log("Printable activity link — mutation allowlist persists relatedPrintableId");

{
  const allowlist = allowlistApi.buildMutationAllowlist({
    actions: {
      generatePrintables: true,
      touchPrintables: true,
      upgradeActivities: true,
      publish: false,
    },
    scope: { lessonIds: [LESSON] },
  });
  assert.ok(allowlist.assets.printables, "printables asset enabled");
  const gate = allowlistApi.validateEnrichmentDraftSave({
    beforeDraft: { week: { printableIds: [] }, activities: { [ACT_A]: {} } },
    afterDraft: {
      week: { printableIds: [RES] },
      activities: { [ACT_A]: { relatedPrintableId: RES, relatedPrintableTitle: "Cards" } },
    },
    allowlist,
    lessonId: LESSON,
    stage: "printables.save",
  });
  assert.equal(
    gate.filteredDraft.activities[ACT_A].relatedPrintableId,
    RES,
    "relatedPrintableId survives guarded draft save filter",
  );
  assert.ok(gate.violations.length === 0 || !gate.stripped, "no strip of printable activity fields");
}

console.log("OK — printable activity link regression tests passed");
console.log("(Two-page letter PDF validation: run test:curriculum-operator-printable-pdf-validate)");
