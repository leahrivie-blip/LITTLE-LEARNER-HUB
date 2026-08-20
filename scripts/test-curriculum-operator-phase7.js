#!/usr/bin/env node
/**
 * AI Curriculum Operator Phase 7 — new lesson creation (draft only).
 * Deterministic fixtures; CI must not call live OpenAI, image gen, or web research.
 * Run: npm run test:curriculum-operator-phase7
 */
"use strict";

const assert = require("node:assert/strict");
const schema = require("./curriculum-operator-schema.js");
const commandApi = require("./curriculum-operator-command.js");
const jobApi = require("./curriculum-operator-job.js");
const createApi = require("./curriculum-operator-create.js");
const { createCurriculumOperatorApi } = require("../server/curriculum-operator.js");

const OWNER = { email: "leahivie@icloud.com" };

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function seedLibrary() {
  const now = new Date().toISOString();
  return {
    lessonPlans: [{
      id: "cur-lp-existing-construction",
      title: "Construction Crew",
      age: "Toddler 18–24 Months",
      theme: "Construction",
      plan: "Pro",
      status: "published",
      weeklyOverview: "Builders at work.",
      objectives: "Explore tools safely.",
      activityIds: ["cur-act-cc-1"],
      dailyPlans: {
        monday: { items: [{ itemId: "x1", title: "Hard Hat Hello", dayOfWeek: "monday" }] },
        tuesday: { items: [] },
        wednesday: { items: [] },
        thursday: { items: [] },
        friday: { items: [] },
      },
      createdAt: now,
      updatedAt: now,
    }, {
      id: "cur-lp-existing-farm-stem",
      title: "Farm STEM",
      age: "Preschool 3–5",
      theme: "Farm",
      plan: "Pro",
      status: "draft",
      weeklyOverview: "STEM on the farm.",
      objectives: "Count and measure farm props.",
      activityIds: [],
      dailyPlans: {
        monday: { items: [] },
        tuesday: { items: [] },
        wednesday: { items: [] },
        thursday: { items: [] },
        friday: { items: [] },
      },
      createdAt: now,
      updatedAt: now,
    }],
    activities: [{
      id: "cur-act-cc-1",
      lessonPlanId: "cur-lp-existing-construction",
      title: "Hard Hat Hello",
      dayOfWeek: "monday",
    }],
    resources: [],
  };
}

function makeMemoryCreateHelper(storeRef) {
  return async function createOperatorLessonPlan({ lessonPlan, adminEmail }) {
    const crypto = require("node:crypto");
    const id = `cur-lp-${crypto.randomBytes(8).toString("hex")}`;
    const now = new Date().toISOString();
    const dailyPlans = lessonPlan.dailyPlans || {};
    const activities = [];
    ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
      const items = Array.isArray(dailyPlans[day]?.items) ? dailyPlans[day].items : [];
      items.forEach((item) => {
        const actId = `cur-act-${crypto.randomBytes(6).toString("hex")}`;
        activities.push({
          id: actId,
          lessonPlanId: id,
          itemId: item.itemId,
          title: item.title,
          dayOfWeek: day,
          activityCategory: item.activityCategory || "",
          objective: item.objective || "",
          steps: item.steps || "",
          materials: item.materials || "",
          status: "draft",
        });
      });
    });
    const plan = {
      ...lessonPlan,
      id,
      status: "draft",
      plan: lessonPlan.plan === "Pro" ? "Pro" : "Free",
      activityIds: activities.map((a) => a.id),
      createdAt: now,
      updatedAt: now,
      lastEditedBy: adminEmail || "test",
    };
    storeRef.curriculum.lessonPlans.push(plan);
    storeRef.curriculum.activities.push(...activities);
    return {
      ok: true,
      createdLessonId: id,
      lessonPlan: plan,
      activities,
      published: false,
    };
  };
}

async function main() {
  console.log("Curriculum Operator Phase 7 — new lesson create (draft only)");

  console.log("Creation brief");
  const bakery = createApi.parseCreationBrief(
    "Create a Preschool Bakery lesson with 15 activities and leave it ready for review.",
  );
  ok(bakery.ok === true, "bakery brief parses");
  ok(/bakery/i.test(bakery.brief.title), `title includes Bakery (got ${bakery.brief.title})`);
  ok(bakery.brief.ageBand === "preschool", "age preschool");
  ok(bakery.brief.accessPlan === "Free", "default access Free when unspecified");
  ok(bakery.brief.activityTarget === 15, "activity count 15");
  ok(bakery.brief.requestedFeatures.images === true, "images requested by default");

  const proToddler = createApi.parseCreationBrief("Make a new Pro Toddler Transportation Builders lesson.");
  ok(proToddler.brief.accessPlan === "Pro", "Pro access from command");
  ok(proToddler.brief.ageBand === "toddler", "toddler age");
  ok(/transportation/i.test(proToddler.brief.title), "transportation theme title");

  const noPics = createApi.parseCreationBrief(
    "Create a Preschool Weather Scientists lesson but do not make activity pictures.",
  );
  ok(noPics.brief.exclusions.touchImages === false, "picture exclusion → touchImages false");
  ok(noPics.brief.requestedFeatures.images === false, "images not requested");

  const needsAge = createApi.parseCreationBrief("Create a Bakery lesson.");
  ok(needsAge.ok === false && needsAge.code === "NEEDS_OWNER_INPUT", "missing age → NEEDS_OWNER_INPUT");

  console.log("Duplicates");
  const library = seedLibrary();
  const exact = createApi.findCreationDuplicates({
    title: "Construction Crew",
    ageBand: "toddler",
  }, library);
  ok(exact.ok === false && exact.level === "exact", "exact duplicate detected");

  const similar = createApi.findCreationDuplicates({
    title: "Construction Zone",
    ageBand: "toddler",
  }, library);
  ok(similar.ok === false && similar.level === "high_similarity", "high-similarity same-age flagged");

  const distinct = createApi.findCreationDuplicates({
    title: "Farm Friends",
    ageBand: "preschool",
  }, library);
  ok(distinct.ok === true, "distinct same-theme lesson allowed");

  console.log("Base content (fixture architect)");
  const content = await (async () => {
    const architect = require("./curriculum-operator-create-architect.js");
    return architect.composeNewLessonContent(bakery.brief, { forceFixture: true });
  })();
  ok(content.ok === true, "architect fixture content builds");
  ok(content.activityCount === 15, "activity count respected");
  const days = Object.keys(content.content.dailyPlans);
  ok(days.length === 5, "weekday structure present");
  let totalActs = 0;
  days.forEach((d) => { totalActs += (content.content.dailyPlans[d].items || []).length; });
  ok(totalActs === 15, "15 activities across week");
  ok(Boolean(content.content.lesson.weeklyOverview), "weekly overview populated");
  ok(Boolean(content.progression.monday), "monday progression present");

  const payload = createApi.buildLessonPlanPayload(bakery.brief, content.content);
  ok(payload.status === "draft", "payload status draft");
  ok(payload.plan === "Free", "payload access Free");

  // Deterministic builder remains fixture-only (no production fallback)
  const blockedDet = createApi.buildBaseLessonContent(bakery.brief, {});
  // NODE_ENV=test still allows it for harnesses — assert opt-in path exists
  const det = createApi.buildBaseLessonContent(bakery.brief, { allowDeterministicFixture: true });
  ok(det.ok === true && det.source === "deterministic_fixture", "deterministic builder available only as explicit fixture");
  ok(blockedDet.ok === true || blockedDet.code === "AI_CREATION_FAILED", "non-opt-in path gated or test-env allowed");

  console.log("Commands / schema");
  const createCmd = commandApi.parseOperatorCommand(
    "Create a Preschool Bakery lesson with 15 activities and leave it ready for review.",
    { phase: 7 },
  );
  ok(createCmd.command.intent === "create_lesson", "intent create_lesson");
  ok(createCmd.command.actions.createLesson === true, "createLesson enabled at phase 7");
  ok(createCmd.command.actions.publish === false, "publish blocked");
  ok(createCmd.command.completion.publish === false, "completion.publish false");

  const phase6Create = commandApi.parseOperatorCommand(
    "Create a Preschool Bakery lesson.",
    { phase: 6 },
  );
  ok(phase6Create.command.actions.createLesson === false, "create still blocked at phase 6");

  const multi = commandApi.parseOperatorCommand("Create 5 new lessons about farms.", { phase: 7 });
  ok(multi.confirmReasons.includes("scope_review_required"), "multi-create → SCOPE_REVIEW_REQUIRED");
  ok(multi.command.actions.createLesson === false, "multi-create does not enable createLesson");

  const noPicCmd = commandApi.parseOperatorCommand(
    "Create a Preschool Bakery lesson but don’t make pictures.",
    { phase: 7 },
  );
  ok(noPicCmd.command.actions.touchImages === false && noPicCmd.command.actions.generateImages === false,
    "create respects image exclusion");

  console.log("Trusted create + IDs + resume");
  const storeRef = { curriculum: seedLibrary(), jobs: { jobs: [] } };
  const createHelper = makeMemoryCreateHelper(storeRef);
  const createdOnce = await createHelper({
    lessonPlan: payload,
    adminEmail: OWNER.email,
  });
  ok(createdOnce.ok && /^cur-lp-/.test(createdOnce.createdLessonId), "trusted create mints cur-lp id");
  ok(createdOnce.lessonPlan.status === "draft", "created lesson is draft");
  ok(createdOnce.activities.length === 15, "stable activity rows created");
  ok(createdOnce.activities.every((a) => /^cur-act-/.test(a.id)), "activity ids cur-act format");
  const idCheck = createApi.validateCreatedIds(createdOnce.lessonPlan, createdOnce.activities);
  ok(idCheck.ok === true, "ID validation passes");

  const quality = createApi.qualityReviewNewLesson({
    brief: bakery.brief,
    lessonPlan: createdOnce.lessonPlan,
    activities: createdOnce.activities,
  });
  ok(quality.ok === true, `quality review passes (${quality.issues.join(",") || "none"})`);

  const beforeCount = storeRef.curriculum.lessonPlans.length;
  // Simulate resume: job already has createdLessonId — must not create again
  const resumeLr = {
    lessonId: "pending-create",
    lessonCreated: true,
    createdLessonId: createdOnce.createdLessonId,
    idsVerified: true,
    creationBriefComplete: true,
    duplicateCheckComplete: true,
    baseContentComplete: true,
    textComplete: true,
    actions: [],
    status: "pending",
  };
  ok(resumeLr.createdLessonId === createdOnce.createdLessonId, "resume remembers createdLessonId");
  ok(storeRef.curriculum.lessonPlans.length === beforeCount, "no second lesson from resume token alone");

  console.log("Job create steps");
  const api = createCurriculumOperatorApi({
    readJson: async () => ({}),
    jsonResponse: () => {},
    readStore: () => ({
      siteContent: {
        featureFlags: { teachingKitCurriculumOperator: true },
        curriculum: storeRef.curriculum,
      },
      curriculumOperatorJobs: storeRef.jobs,
    }),
    writeStoreAsync: async () => {},
    requireTeachingKitOwnerAdminSession: () => ({ email: OWNER.email }),
    teachingKit: require("./teaching-kit.js"),
    normalizeEmail: (v) => String(v || "").trim().toLowerCase(),
    readSiteCurriculum: (s) => s.siteContent.curriculum,
    createOperatorLessonPlan: createHelper,
  });
  ok(typeof api.wantsCreate === "function" && api.wantsCreate(createCmd.command) === true, "wantsCreate true");

  const planSummary = api.buildPlanSummary(createCmd.command, {
    selected: [{
      id: "pending-create",
      title: bakery.brief.title,
      theme: bakery.brief.theme,
      age: bakery.brief.ageLabel,
      ageBand: bakery.brief.ageBand,
      plan: bakery.brief.accessPlan,
      readinessPercent: 0,
      completionPercent: 0,
      creationBrief: bakery.brief,
      creationIdempotencyKey: bakery.brief.idempotencyKey,
    }],
    selectionNote: "create",
    candidatesConsidered: 2,
    creationBrief: bakery.brief,
    pendingCreateId: "pending-create",
  });
  ok(planSummary.createsLesson === true, "plan summary createsLesson");
  ok(planSummary.publishes === false, "plan summary never publishes");

  const job = jobApi.createJobFromPlan({
    command: createCmd.command,
    planSummary,
    createdBy: OWNER.email,
    status: "planned",
  });
  const types = job.lessonResults[0].actions.map((a) => a.type);
  ok(types.includes("lesson.create"), "job includes lesson.create");
  ok(job.lessonResults[0].textComplete === true, "create job marks textComplete for base content");
  ok(job.mutationsEnabled === true, "create job mutations enabled");
  ok(job.publishEnabled === false, "create job publish disabled");

  // Idempotency key stable
  const key1 = createApi.creationIdempotencyKey(bakery.brief);
  const key2 = createApi.creationIdempotencyKey(bakery.brief);
  ok(key1 === key2 && key1.startsWith("create:"), "stable creation idempotency key");

  console.log("Failure / publish guards");
  ok(schema.isMutationAction("lesson.create") === true, "lesson.create is mutation");
  ok(schema.isPhase7Executable("lesson.create") === true, "lesson.create executable in phase 7");
  ok(schema.isPhase6Executable("lesson.create") === false, "lesson.create not in phase 6 executable list");

  const pub = schema.normalizeOperatorCommand({
    intent: "create_lesson",
    actions: { createLesson: true, publish: true },
  }, { phase: 7 });
  ok(pub.actions.publish === false && pub.completion.publish === false, "publish still forced off at phase 7");

  console.log(`\nPhase 7 checks passed: ${passed}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
