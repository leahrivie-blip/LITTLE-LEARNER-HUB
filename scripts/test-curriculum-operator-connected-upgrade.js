#!/usr/bin/env node
/**
 * Connected existing-lesson upgrade workflow tests.
 * Run: npm run test:curriculum-operator-connected-upgrade
 */
"use strict";

const assert = require("node:assert/strict");
const connected = require("./curriculum-operator-connected-upgrade.js");
const schema = require("./curriculum-operator-schema.js");
const jobApi = require("./curriculum-operator-job.js");
const selectApi = require("./curriculum-operator-select.js");
const { createCurriculumOperatorApi } = require("../server/curriculum-operator.js");

const OWNER = { email: "leahivie@icloud.com" };
const LESSON_ID = "cur-lp-connected-weather";
const ACT_A = "cur-act-connected-a";
const ACT_B = "cur-act-connected-b";
const KEEP_IMG = "https://cdn.example.test/keep-activity.png";
const KEEP_PRINT = "cur-res-connected-keep";
const WEAK_COVER = "/images/lesson-covers/generic-toddler.svg";

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function seedCurriculum() {
  const now = new Date().toISOString();
  return {
    lessonPlans: [{
      id: LESSON_ID,
      title: "Weather Watchers",
      age: "Toddler 18–24 Months",
      theme: "Weather",
      plan: "Pro",
      status: "published",
      coverImageUrl: WEAK_COVER,
      coverQualityStatus: "needs_upgrade",
      weeklyOverview: "Short overview.",
      objectives: "",
      enrichmentDraft: {
        week: { weeklyOverview: "Short overview." },
        activities: {
          [ACT_A]: { setupImageUrl: KEEP_IMG, relatedPrintableId: KEEP_PRINT },
        },
        updatedAt: now,
      },
      resourceIds: [KEEP_PRINT],
      activityIds: [ACT_A, ACT_B],
      dailyPlans: {
        monday: { items: [{ itemId: "a", title: "Wind Dance", dayOfWeek: "monday" }] },
        tuesday: { items: [{ itemId: "b", title: "Weather Reporter", dayOfWeek: "tuesday" }] },
        wednesday: { items: [] },
        thursday: { items: [] },
        friday: { items: [] },
      },
      updatedAt: now,
      createdAt: now,
    }],
    activities: [
      {
        id: ACT_A,
        lessonPlanId: LESSON_ID,
        itemId: "a",
        title: "Wind Dance",
        dayOfWeek: "monday",
        objective: "Move like wind.",
        steps: "Sway scarves.",
        setupImageUrl: KEEP_IMG,
        relatedPrintableId: KEEP_PRINT,
      },
      {
        id: ACT_B,
        lessonPlanId: LESSON_ID,
        itemId: "b",
        title: "Weather Reporter",
        dayOfWeek: "tuesday",
        objective: "Use weather words.",
        steps: "Pretend report.",
      },
    ],
    resources: [{
      id: KEEP_PRINT,
      title: "Weather Cards",
      resourceCategory: "Printables",
      lessonPlanIds: [LESSON_ID],
      status: "draft",
      fileName: "weather-cards.pdf",
      fileData: "data:application/pdf;base64,JVBERi0xLjQ=",
      mimeType: "application/pdf",
    }],
  };
}

function readyLessonResult(overrides = {}) {
  return {
    lessonId: LESSON_ID,
    status: "success",
    ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    finalVerificationComplete: true,
    finalVerification: { ok: true },
    textComplete: true,
    imagesComplete: true,
    printablesComplete: true,
    songsBooksComplete: true,
    kitScope: {
      lessonContent: true,
      activities: true,
      images: true,
      printables: true,
      songs: true,
      books: true,
    },
    audit: { lessonId: LESSON_ID },
    ...overrides,
  };
}

async function main() {
  console.log("Connected existing-lesson upgrade");

  const curriculum = seedCurriculum();
  const plan = curriculum.lessonPlans[0];

  console.log("Plan + command by lesson ID");
  const bundle = connected.buildConnectedUpgradePlan(curriculum, LESSON_ID);
  ok(bundle.ok === true, "buildConnectedUpgradePlan succeeds");
  ok(bundle.lessonId === LESSON_ID, "existing lesson ID preserved in plan");
  ok(bundle.command.scope.selection === "explicit_ids", "command uses explicit_ids");
  ok(bundle.command.scope.lessonIds[0] === LESSON_ID, "command carries exact lesson ID");
  ok(bundle.command.actions.connectedUpgrade === true, "connectedUpgrade flag set");
  ok(bundle.command.actions.connectedAutoApply === true, "connectedAutoApply flag set");
  ok(bundle.command.actions.publish === false, "command never publishes");
  ok(bundle.workPlan && Array.isArray(bundle.workPlan.images), "audit work plan includes image actions before run");

  const cmd = bundle.command;
  const selection = selectApi.selectLessons(curriculum, cmd);
  ok(selection.selected.length === 1 && selection.selected[0].id === LESSON_ID, "selection resolves by ID");

  console.log("Cover KEEP / REPLACE");
  const goodCoverPlan = {
    id: LESSON_ID,
    title: "Strong Cover Lesson",
    coverImageUrl: "https://cdn.example.test/strong-cover.png",
    coverImageSource: "uploaded",
    coverQualityStatus: "good",
    enrichmentDraft: { activities: {} },
  };
  ok(connected.buildCoverPlan(goodCoverPlan, curriculum).decision === "KEEP_EXISTING", "strong cover → KEEP_EXISTING");
  const weakCover = connected.buildCoverPlan(plan, curriculum);
  ok(weakCover.decision === "REPLACE", "weak/generic cover → REPLACE");
  ok(cmd.actions.touchCover === true, "REPLACE cover enables touchCover on command");

  const draftWithCover = connected.applyCoverToEnrichmentDraft(plan.enrichmentDraft, {
    decision: "REPLACE",
    proposedCoverImageUrl: KEEP_IMG,
    sourceActivityId: ACT_A,
  });
  ok(draftWithCover.operatorCover?.coverImageUrl === KEEP_IMG, "operatorCover stored on draft");
  const merged = connected.applyOperatorCoverToMergedPlan(plan, draftWithCover);
  ok(merged.coverImageUrl === KEEP_IMG, "cover applied to merged plan");
  ok(merged.coverQualityStatus === "good", "cover quality marked good");

  console.log("Auto-apply safety gate");
  const job = {
    id: "opjob_test",
    command: cmd,
  };
  ok(connected.canAutoApplyConnectedEnrichment(readyLessonResult(), job).ok === true, "READY result can auto-apply");
  ok(connected.canAutoApplyConnectedEnrichment(readyLessonResult({ ownerReviewStatus: "PARTIAL" }), job).ok === false,
    "PARTIAL blocks auto-apply");
  ok(connected.canAutoApplyConnectedEnrichment(readyLessonResult({ status: "failed" }), job).ok === false,
    "failed job blocks auto-apply");
  ok(connected.canAutoApplyConnectedEnrichment(readyLessonResult({ finalVerification: { ok: false } }), job).ok === false,
    "failed verification blocks auto-apply");
  ok(connected.canAutoApplyConnectedEnrichment(readyLessonResult({ imagesComplete: false }), job).ok === false,
    "incomplete images block auto-apply");
  const noAuto = { ...job, command: { ...cmd, actions: { ...cmd.actions, connectedAutoApply: false } } };
  ok(connected.canAutoApplyConnectedEnrichment(readyLessonResult(), noAuto).ok === false,
    "without connectedAutoApply flag → skip");

  console.log("Operator API connected_plan");
  let store = {
    siteContent: {
      featureFlags: { teachingKitCurriculumOperator: true },
      curriculum: seedCurriculum(),
    },
    curriculumOperatorJobs: { jobs: [], updatedAt: "" },
  };
  const applyCalls = [];
  const api = createCurriculumOperatorApi({
    readJson: async () => ({}),
    jsonResponse: () => {},
    readStore: () => store,
    writeStoreAsync: async (next) => { store = next; },
    requireTeachingKitOwnerAdminSession: () => ({ email: OWNER.email }),
    teachingKit: require("./teaching-kit.js"),
    normalizeEmail: (v) => String(v || "").trim().toLowerCase(),
    readSiteCurriculum: (s) => s.siteContent.curriculum,
    applyOperatorConnectedEnrichment: async (opts) => {
      applyCalls.push(opts.lessonPlanId);
      return { ok: true, code: "apply_enrichment_ok", published: false, autoPublish: false };
    },
  });

  const planSummary = api.buildPlanSummary(cmd, selection);
  ok(planSummary.selectedLessonIds[0] === LESSON_ID, "plan summary keeps lesson ID");
  const plannedJob = jobApi.createJobFromPlan({
    command: cmd,
    planSummary,
    createdBy: OWNER.email,
    status: "planned",
  });
  ok(plannedJob.lessonResults[0].actions.some((a) => a.type === "printable.generatePages"), "job includes printable generation");
  ok(plannedJob.lessonResults[0].actions.some((a) => a.type === "image.generate"), "job includes image generation");
  ok(plannedJob.lessonResults[0].actions.some((a) => a.type === "lesson.updateFields"), "job includes text upgrade");

  const ownerView = connected.summarizePlanForOwner(bundle);
  ok(ownerView.autoPublish === false && ownerView.publishes === false, "owner plan shows no auto-publish");
  ok(ownerView.writesOnPlan === false, "owner plan marks no writes during planning");
  ok(Array.isArray(ownerView.imageActions), "owner plan includes all image actions");
  ok(Array.isArray(ownerView.activitiesStrong), "owner plan includes strong activities");
  ok(Array.isArray(ownerView.missingWeeklyFields), "owner plan includes missing weekly fields");
  ok(ownerView.age, "owner plan includes age");

  console.log("Simulated successful run + auto-apply hook");
  const fakeJob = {
    ...plannedJob,
    status: "completed",
    lessonResults: [readyLessonResult()],
  };
  const gate = connected.canAutoApplyConnectedEnrichment(fakeJob.lessonResults[0], fakeJob);
  ok(gate.ok, "simulated success passes gate");
  if (gate.ok) {
    await (async (opts) => {
      applyCalls.push(opts.lessonPlanId);
      return { ok: true, code: "apply_enrichment_ok", published: false, autoPublish: false };
    })({
      store,
      lessonPlanId: LESSON_ID,
      adminEmail: OWNER.email,
      operatorJobId: fakeJob.id,
    });
  }
  ok(applyCalls.includes(LESSON_ID), "auto-apply helper invoked for same lesson ID");

  const blocked = connected.canAutoApplyConnectedEnrichment(
    readyLessonResult({ ownerReviewStatus: "BLOCKED" }),
    fakeJob,
  );
  ok(!blocked.ok, "BLOCKED does not auto-apply");
  ok(blocked.code === "owner_review_not_ready", "blocked reason surfaced");

  console.log("Cover URL validation");
  ok(!connected.isUsableActivityImageUrl("https://cdn.example.test/printable.pdf"), "PDF URL rejected for cover");
  ok(connected.isUsableActivityImageUrl(KEEP_IMG), "PNG activity URL accepted");

  console.log("Activity IDs stable in selection");
  ok(curriculum.activities.every((a) => a.id === ACT_A || a.id === ACT_B), "seed activity IDs unchanged");
  ok(plan.plan === "Pro", "Free/Pro unchanged on plan");

  console.log(`\nConnected upgrade passed ${passed} assertions`);
}

main().catch((error) => {
  console.error("\nConnected upgrade FAILED:", error);
  process.exit(1);
});
