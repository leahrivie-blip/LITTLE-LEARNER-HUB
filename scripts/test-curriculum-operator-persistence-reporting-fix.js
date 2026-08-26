#!/usr/bin/env node
/**
 * Operator persistence + reporting regression suite (opjob_c6f5a37ce9074b56 / LMW).
 * Run: npm run test:curriculum-operator-persistence-reporting-fix
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const auditApi = require("./curriculum-operator-audit.js");
const commandApi = require("./curriculum-operator-command.js");
const composer = require("./curriculum-operator-ai-composer.js");
const connected = require("./curriculum-operator-connected-upgrade.js");
const lessonRead = require("./curriculum-operator-lesson-read.js");
const imagesApi = require("./curriculum-operator-images.js");
const enrichment = require("./teaching-kit-enrichment.js");
const quality = require("./teaching-kit-quality-review.js");
const teachingKit = require("./teaching-kit.js");
const { applySurgicalLessonIdentityFields } = require("./curriculum-surgical-lesson-identity.js");

const LMW_ID = "cur-lp-549b80f61dfa8d79";
const ACT_PROTECTED = "cur-act-0a02697c73ccac85";
const ACT_OTHER = "cur-act-374ff7ad30144089";

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function surgicalDailyPlansMerge(existingPlan, incomingPlan) {
  return applySurgicalLessonIdentityFields({
    ...existingPlan,
    teachingKit: Object.prototype.hasOwnProperty.call(incomingPlan, "teachingKit")
      ? incomingPlan.teachingKit
      : existingPlan.teachingKit,
    weeklyOverview: Object.prototype.hasOwnProperty.call(incomingPlan, "weeklyOverview")
      ? incomingPlan.weeklyOverview
      : existingPlan.weeklyOverview,
    objectives: Object.prototype.hasOwnProperty.call(incomingPlan, "objectives")
      ? incomingPlan.objectives
      : existingPlan.objectives,
    familyConnection: Object.prototype.hasOwnProperty.call(incomingPlan, "familyConnection")
      ? incomingPlan.familyConnection
      : existingPlan.familyConnection,
    weeklyMaterials: Object.prototype.hasOwnProperty.call(incomingPlan, "weeklyMaterials")
      ? incomingPlan.weeklyMaterials
      : existingPlan.weeklyMaterials,
    books: Object.prototype.hasOwnProperty.call(incomingPlan, "books")
      ? incomingPlan.books
      : existingPlan.books,
    songs: Object.prototype.hasOwnProperty.call(incomingPlan, "songs")
      ? incomingPlan.songs
      : existingPlan.songs,
    learningDomains: Object.prototype.hasOwnProperty.call(incomingPlan, "learningDomains")
      ? incomingPlan.learningDomains
      : existingPlan.learningDomains,
    vocabularyWords: Object.prototype.hasOwnProperty.call(incomingPlan, "vocabularyWords")
      ? incomingPlan.vocabularyWords
      : existingPlan.vocabularyWords,
    coverImageUrl: Object.prototype.hasOwnProperty.call(incomingPlan, "coverImageUrl")
      ? incomingPlan.coverImageUrl
      : existingPlan.coverImageUrl,
    coverImageSource: Object.prototype.hasOwnProperty.call(incomingPlan, "coverImageSource")
      ? incomingPlan.coverImageSource
      : existingPlan.coverImageSource,
    coverQualityStatus: Object.prototype.hasOwnProperty.call(incomingPlan, "coverQualityStatus")
      ? incomingPlan.coverQualityStatus
      : existingPlan.coverQualityStatus,
    dailyPlans: incomingPlan.dailyPlans,
    updatedAt: incomingPlan.updatedAt || existingPlan.updatedAt,
  }, incomingPlan);
}

function reloadNormalizedPlan(plan) {
  const overlay = teachingKit.normalizedTeachingKitOverlay(plan.teachingKit);
  return {
    ...plan,
    learningDomains: Array.isArray(plan.learningDomains) ? plan.learningDomains.slice() : [],
    vocabularyWords: String(plan.vocabularyWords || ""),
    teachingKit: overlay || plan.teachingKit,
  };
}

function lmwActivities() {
  return [
    {
      id: ACT_PROTECTED,
      lessonPlanId: LMW_ID,
      title: "Giant Floor Drawing",
      dayOfWeek: "monday",
      teacherTips: ["Offer one crayon at a time."],
    },
    {
      id: ACT_OTHER,
      lessonPlanId: LMW_ID,
      title: "Recycled Creation Station",
      dayOfWeek: "friday",
      teacherTips: ["Keep recycled pieces large and soft."],
    },
  ];
}

function weeklyDraftFixture() {
  return {
    week: {
      learningDomains: ["Creative Arts", "Physical Development"],
      vocabCards: [
        { word: "press", definition: "Push down firmly." },
        { word: "stick", definition: "Attach one thing to another." },
        { word: "build", definition: "Stack or connect pieces." },
      ],
      milestones: ["Uses two hands to explore materials.", "Names one action word.", "Invites a peer to play."],
      teacherPreparation: "Cover floors; stage one invitation at a time; gather smocks and tape.",
      teacherToolkit: {
        prepChecklist: ["Cover floors", "Stage one tray"],
        observationFocus: ["Grasp patterns", "Sensory exploration"],
        teacherPreparation: "Cover floors; stage one invitation at a time.",
      },
    },
    activities: {},
  };
}

async function main() {
console.log("1) merge → surgical persist → reload keeps domains/vocab/milestones");
{
  const existingPlan = {
    id: LMW_ID,
    title: "Little Makers Workshop",
    plan: "Free",
    status: "draft",
    learningDomains: [],
    vocabularyWords: "",
    dailyPlans: { monday: { items: [] }, tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] } },
  };
  const merged = enrichment.mergeDraftIntoPlan(existingPlan, lmwActivities(), weeklyDraftFixture());
  const incoming = {
    ...merged.plan,
    __llhSurgicalDailyPlans: true,
    dailyPlans: merged.plan.dailyPlans,
  };
  const persisted = surgicalDailyPlansMerge(existingPlan, incoming);
  const reloaded = reloadNormalizedPlan(persisted);
  ok((reloaded.learningDomains || []).join(", ").includes("Creative Arts"), "learningDomains survive surgical persist/reload");
  ok(String(reloaded.vocabularyWords || "").includes("press"), "vocabularyWords survive surgical persist/reload");
  ok((reloaded.teachingKit?.vocabCards || []).length >= 3, "teachingKit.vocabCards survive normalization");
  ok((reloaded.teachingKit?.milestones || []).length >= 3, "milestones control case persists");
}

console.log("\n2) teacherTips canonical reader + no false missing_tips blocker");
{
  const act = lmwActivities()[1];
  const tips = lessonRead.getActivityTeacherTips(act, { teacherTips: act.teacherTips }, {});
  ok(tips.length > 0, "canonical reader finds activity teacherTips");
  const plan = {
    id: LMW_ID,
    title: "Little Makers Workshop",
    age: "Toddler 12–24 Months",
    teacherPreparation: "Cover floors; stage one invitation at a time; gather smocks and tape.",
    teachingKit: {
      teacherToolkit: {
        prepChecklist: ["Cover floors", "Stage one tray"],
        teacherPreparation: "Cover floors; stage one invitation at a time.",
      },
    },
    dailyPlans: {
      monday: { items: [{ itemId: "a1", title: "Giant Floor Drawing", teacherTips: ["Offer one crayon at a time."] }] },
      tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] },
    },
  };
  const acts = lmwActivities().map((a) => ({
    ...a,
    dailyPlanItem: plan.dailyPlans.monday.items[0],
  }));
  const report = quality.buildQualityReport(plan, acts, { week: {}, activities: {} }, { connectedOperatorPath: true });
  ok(!report.findings.some((f) => f.code === "missing_tips"), "audit reports 0 missing teacherTips when tips exist");
}

console.log("\n3) targeted teacherTips request removes KEEP conflict");
{
  const plan = { id: LMW_ID, enrichmentDraft: { week: {}, activities: {} } };
  const audit = {
    weeklyContent: [],
    activityClassifications: [{ activityId: ACT_OTHER, title: "Recycled Creation Station", decision: "KEEP", missingFields: [] }],
    songs: [],
    books: { decision: "KEEP" },
  };
  const acts = [{ id: ACT_OTHER, lessonPlanId: LMW_ID, title: "Recycled Creation Station", teacherTips: [] }];
  const work = composer.collectWorkItems(plan, acts, audit, { repairTeacherTips: true });
  ok(work.activityRequests.some((r) => r.activityId === ACT_OTHER
    && r.fields.some((f) => f.field === "teacherTips")), "teacherTips FILL requested");
  ok(!work.activityKeep.some((k) => k.activityId === ACT_OTHER), "targeted teacherTips request removes activity from KEEP list");
}

console.log("\n4) PROTECTED_KEEP wins over NOT_NEEDED");
{
  const plan = { id: LMW_ID, enrichmentDraft: { week: {}, activities: {} } };
  const audit = auditApi.auditLesson(plan, { activities: lmwActivities(), resources: [] });
  const command = {
    rawCommand: "Protect Giant Floor Drawing (PROTECTED_KEEP).",
    actions: { protectedActivityIds: [ACT_PROTECTED] },
  };
  const actions = imagesApi.buildImageActionsFromAudit(plan, lmwActivities(), audit, { command });
  const protectedAction = actions.find((a) => a.activityId === ACT_PROTECTED);
  ok(protectedAction?.decision === "PROTECTED_KEEP", "protected image classified PROTECTED_KEEP");
  const counts = imagesApi.summarizeImageActions(actions);
  ok((counts.PROTECTED_KEEP || 0) >= 1, "PROTECTED_KEEP counted separately");
}

console.log("\n5) explicit cover creates dedicated generation task (not activity reuse)");
{
  const command = {
    rawCommand: "Create a NEW realistic lesson cover REALISTIC_LESSON_COVER.",
    actions: { touchCover: true },
  };
  const plan = {
    id: LMW_ID,
    title: "Little Makers Workshop",
    age: "Toddler 12–24 Months",
    coverImageUrl: "/api/media/lesson-covers/lesson-cover-old.png",
  };
  const coverPlan = connected.buildCoverPlan(plan, { activities: lmwActivities() }, { command });
  ok(coverPlan.decision === "GENERATE", "EXPLICIT_REPLACE schedules GENERATE");
  ok(coverPlan.generationMode === "REALISTIC_LESSON_COVER", "generation mode is REALISTIC_LESSON_COVER");
  ok(!coverPlan.proposedCoverImageUrl, "explicit cover does not auto-reuse activity photo URL");
}

console.log("\n6) dedicated cover generation persists lesson-cover media path");
{
  process.env.VISUAL_PRODUCTION_MOCK_GENERATE = "1";
  const plan = { id: LMW_ID, title: "Little Makers Workshop", age: "Toddler 12–24 Months", theme: "Makers" };
  const coverPlan = connected.buildCoverPlan(plan, { activities: lmwActivities() }, {
    command: { rawCommand: "REALISTIC_LESSON_COVER", actions: { touchCover: true } },
  });
  const result = await connected.runDedicatedLessonCoverGeneration({
    plan,
    curriculum: { activities: lmwActivities() },
    coverPlan,
    persistCoverFn: async ({ buffer }) => ({
      ok: true,
      id: "lesson-cover-test1234567890ab",
      url: "/api/media/lesson-covers/lesson-cover-test1234567890ab",
      buffer,
    }),
  });
  ok(result.ok === true, "dedicated cover generation succeeds with mock");
  ok(/^lesson-cover-/.test(result.coverPlan.operatorCover.coverMediaAssetId), "cover uses lesson-cover media id");
  ok(result.coverPlan.operatorCover.coverImageUrl.includes("/api/media/lesson-covers/"), "cover URL uses lesson-cover path");
  const merged = connected.applyOperatorCoverToMergedPlan({ id: LMW_ID }, {
    operatorCover: result.coverPlan.operatorCover,
  });
  ok(merged.coverImageUrl.includes("/api/media/lesson-covers/"), "merged plan stores lesson-cover URL");
}

console.log("\n7) teacher prep shared predicate removes consistency contradiction");
{
  const plan = {
    id: LMW_ID,
    teacherPreparation: "Cover floors; stage one invitation at a time; gather smocks and tape.",
    teachingKit: {
      teacherToolkit: {
        prepChecklist: ["Cover floors", "Stage one tray"],
        teacherPreparation: "Cover floors; stage one invitation at a time.",
      },
    },
  };
  ok(lessonRead.isTeacherPreparationSubstantial(plan, {}), "shared predicate marks substantial prep");
  const audit = auditApi.auditLesson(plan, { activities: lmwActivities(), resources: [] }, { connectedOperatorPath: true });
  const prep = audit.weeklyContent.find((f) => f.field === "teacherPreparation");
  ok(prep?.decision === "KEEP", "audit marks teacherPreparation KEEP when substantial");
  const report = quality.buildQualityReport(plan, lmwActivities(), { week: {}, activities: {} }, { connectedOperatorPath: true });
  ok(!report.findings.some((f) => f.code === "weak_teacher_prep"), "quality review does not flag weak prep");
  ok(audit.reportConsistency?.ok === true, "reportConsistency passes for substantial prep");
}

console.log("\n8) persistence mismatch + persisted diff reporting");
{
  const before = { id: LMW_ID, learningDomains: [], vocabularyWords: "", teachingKit: {} };
  const after = { id: LMW_ID, learningDomains: [], vocabularyWords: "", teachingKit: { milestones: ["m1"] } };
  const check = lessonRead.verifyConnectedAutoApplyPersistence({
    beforePlan: before,
    afterPlan: after,
    requestedFieldSuccess: [
      { field: "learningDomains", action: "FILL" },
      { field: "vocabCards", action: "FILL" },
    ],
    command: {
      rawCommand: "Repair missing authoritative plan.learningDomains and plan.vocabularyWords on the draft.",
    },
  });
  ok(check.ok === false, "missing domains/vocab detected as persistence mismatch");
  ok(check.mismatches.some((m) => m.code === "PERSISTENCE_MISMATCH"), "PERSISTENCE_MISMATCH emitted");
  const unsatisfied = lessonRead.verifyConnectedAutoApplyPersistence({
    beforePlan: before,
    afterPlan: after,
    requestedFieldSuccess: [{ field: "learningDomains", action: "FILL" }],
    command: {
      rawCommand: "Repair missing authoritative plan.vocabularyWords and plan.learningDomains on the draft.",
    },
  });
  ok(unsatisfied.mismatches.some((m) => m.code === "REQUESTED_REPAIR_UNSATISFIED" && m.field === "vocabulary"),
    "REQUESTED_REPAIR_UNSATISFIED emitted when vocab repair never ran");
  ok(check.persistedDiff.some((p) => p.startsWith("teachingKit.milestones")), "persisted diff reflects actual stored changes");
}

console.log("\n9) text-only command exclusions");
{
  const parsed = commandApi.parseOperatorCommand(
    "Fix the remaining text/content only. Do not touch images, cover, printables, songs.",
    { phase: 7, lessonPlans: [{ id: LMW_ID, title: "Little Makers Workshop" }], currentlySelectedLessonId: LMW_ID },
  );
  const actions = parsed.command.actions || {};
  ok(actions.textOnly === true, "text/content only → textOnly=true");
  ok(actions.generateImages === false, "text-only → generateImages=false");
  ok(actions.touchImages === false, "text-only → touchImages=false");
  ok(actions.touchCover === false, "text-only → touchCover=false");
  ok(actions.generatePrintables === false, "text-only → generatePrintables=false");
  ok(actions.touchPrintables === false, "text-only → touchPrintables=false");
}

console.log("\n10) surgical save wiring includes learningDomains + vocabularyWords");
{
  const src = fs.readFileSync(path.join(__dirname, "..", "server", "index.js"), "utf8");
  ok(src.includes("learningDomains: Object.prototype.hasOwnProperty.call(incomingPlan, \"learningDomains\")"),
    "writeSiteCurriculumTouched copies learningDomains on surgical path");
  ok(src.includes("vocabularyWords: Object.prototype.hasOwnProperty.call(incomingPlan, \"vocabularyWords\")"),
    "writeSiteCurriculumTouched copies vocabularyWords on surgical path");
}

console.log(`\n${passed} assertions passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
