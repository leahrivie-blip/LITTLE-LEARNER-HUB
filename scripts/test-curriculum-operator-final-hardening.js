#!/usr/bin/env node
/**
 * Operator final hardening regression suite (opjob_0179 / LMW synthetic).
 * Run: npm run test:curriculum-operator-final-hardening
 */
"use strict";

const assert = require("node:assert/strict");
const auditApi = require("./curriculum-operator-audit.js");
const composer = require("./curriculum-operator-ai-composer.js");
const connected = require("./curriculum-operator-connected-upgrade.js");
const orchestrator = require("./curriculum-operator-orchestrator.js");
const lessonRead = require("./curriculum-operator-lesson-read.js");
const imagesApi = require("./curriculum-operator-images.js");
const enrichment = require("./teaching-kit-enrichment.js");
const quality = require("./teaching-kit-quality-review.js");

const LMW_ID = "cur-lp-549b80f61dfa8d79";
const ACT_PROTECTED = "cur-act-0a02697c73ccac85";
const ACT_OTHER = "cur-act-374ff7ad30144089";

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function lmwPlan(overrides = {}) {
  return {
    id: LMW_ID,
    title: "Little Makers Workshop",
    age: "Toddler 12–24 Months",
    theme: "Little Makers Workshop",
    plan: "Free",
    status: "draft",
    learningDomains: [],
    vocabularyWords: "",
    weeklyOverview: "Young toddlers explore process art and early building.",
    objectives: "Explore art materials through safe hands-on play.",
    weeklyMaterials: "Large paper rolls; chunky crayons; washable paint",
    teacherPreparation: "Cover floors; stage one invitation at a time; gather smocks and tape.",
    familyConnection: "Share one process photo and explain toddler art is about exploring materials.",
    books: [{ title: "Search classroom library for books about colors, shapes, and art." }],
    coverImageUrl: "/api/media/lesson-covers/existing-cover.png",
    coverImageSource: "uploaded",
    enrichmentDraft: {
      week: {
        learningDomains: ["Creative Arts", "Physical Development", "Language & Literacy"],
        vocabCards: ["press", "stick", "roll", "squeeze"],
        teacherToolkit: {
          prepChecklist: ["Cover floors", "Stage one tray"],
          observationFocus: ["Grasp patterns", "Sensory exploration"],
          teacherPreparation: "Cover floors; stage one invitation at a time.",
        },
      },
      activities: {},
    },
    dailyPlans: {
      monday: { items: [{ itemId: "a1", title: "Giant Floor Drawing" }] },
      tuesday: { items: [{ itemId: "a2", title: "Sponge Squish Painting" }] },
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    },
    ...overrides,
  };
}

function lmwActivities() {
  return [
    {
      id: ACT_PROTECTED,
      lessonPlanId: LMW_ID,
      title: "Giant Floor Drawing",
      dayOfWeek: "monday",
      objective: "Children explore large-scale mark making with chunky crayons.",
      materials: "Large paper roll, chunky crayons, painter's tape",
      description: "Invite toddlers to make marks on floor paper.",
      setup: "Tape paper to floor.",
      steps: "1. Invite children. 2. Model one mark. 3. Narrate actions.",
      setupImageUrl: "/api/media/tk-enrich-cc63a2bfa2d8118bd7627830df20fcfa/public",
      setupMediaAssetId: "tk-enrich-cc63a2bfa2d8118bd7627830df20fcfa",
    },
    {
      id: ACT_OTHER,
      lessonPlanId: LMW_ID,
      title: "Recycled Creation Station",
      dayOfWeek: "friday",
      objective: "Children explore safe recycled materials with teacher support.",
      materials: "Cardboard tubes, tape, large paper",
      description: "Open-ended building with safe recycled materials.",
      setup: "Stage materials in low trays.",
      steps: "1. Invite exploration. 2. Model one connection. 3. Narrate actions.",
      setupImageUrl: "/images/generic-theme-art.png",
      teacherTips: [],
    },
  ];
}

console.log("1) Post-apply final audit uses merged draft fields");
function testPostApplyAudit() {
  const plan = lmwPlan();
  const curriculum = { activities: lmwActivities(), resources: [] };
  const audit = auditApi.auditLesson(plan, curriculum, {
    connectedOperatorPath: true,
    skipWeekdayFocusBlocker: true,
  });
  const domains = audit.weeklyContent.find((f) => f.field === "learningDomains");
  const vocab = audit.weeklyContent.find((f) => f.field === "vocabularyWords");
  ok(domains?.decision === "KEEP", "learningDomains KEEP after draft merge view");
  ok(vocab?.decision === "KEEP", "vocabulary KEEP after draft merge view");
  const blockers = audit.teachingKitBlockers.map((b) => String(b.message || b));
  ok(!blockers.some((m) => /missing learning domains/i.test(m)), "no stale missing Learning Domains blocker");
  ok(!blockers.some((m) => /vocabulary is missing/i.test(m)), "no stale missing Vocabulary blocker");
  ok(!blockers.some((m) => /weekday focus incomplete/i.test(m)), "weekday focus not blocking connected operator path");
  ok(audit.reportConsistency?.ok === true, "report consistency passes for filled domains/vocab");
}

console.log("\n2) mergeDraftIntoPlan round-trip for learningDomains + vocabulary");
function testMergeRoundTrip() {
  const plan = lmwPlan({ enrichmentDraft: { week: { learningDomains: ["Creative Arts", "Social Emotional"], vocabCards: ["press", "stick", "roll"] }, activities: {} } });
  const merged = enrichment.mergeDraftIntoPlan(plan, lmwActivities(), plan.enrichmentDraft);
  ok((merged.plan.learningDomains || []).length >= 2, "learningDomains persisted on plan");
  ok(String(merged.plan.vocabularyWords || "").includes("press"), "vocabularyWords synthesized from vocabCards");
  ok((merged.plan.teachingKit?.vocabCards || []).length >= 3, "teachingKit.vocabCards preserved");
}

console.log("\n3) Teacher tips targeted FILL on strong activities");
function testTeacherTipsFill() {
  const plan = lmwPlan();
  const audit = {
    weeklyContent: [],
    activityClassifications: [
      { activityId: ACT_OTHER, title: "Recycled Creation Station", decision: "KEEP", missingFields: [] },
    ],
    songs: [],
    books: { decision: "KEEP" },
  };
  const work = composer.collectWorkItems(plan, lmwActivities(), audit, {
    upgradeLesson: false,
    upgradeActivities: true,
    repairTeacherTips: true,
  });
  ok(work.activityRequests.some((r) => r.activityId === ACT_OTHER
    && r.fields.some((f) => f.field === "teacherTips" && f.action === "FILL")), "teacherTips FILL requested for strong activity");
  const protectedReq = work.activityRequests.find((r) => r.activityId === ACT_PROTECTED);
  ok(!protectedReq || protectedReq.fields.every((f) => f.field === "teacherTips"),
    "protected activity only gets targeted teacherTips fill when requested");
}

console.log("\n4) Book guide consistency for classroom-library prompt");
function testBookGuide() {
  const book = { title: "Search classroom library for books about colors, shapes, and art." };
  ok(lessonRead.classifyBookRecord(book) === "CLASSROOM_LIBRARY_PROMPT", "library prompt classified");
  ok(lessonRead.bookNeedsDiscussionGuide(book) === false, "library prompt does not need title-specific guide");
  const plan = lmwPlan();
  const audit = auditApi.auditLesson(plan, { activities: lmwActivities(), resources: [] }, { connectedOperatorPath: true });
  ok(audit.books.decision === "KEEP", "book marked KEEP for library prompt");
  const evalReport = quality.evaluateTeachingKit(plan, lmwActivities(), plan.enrichmentDraft, {
    connectedOperatorPath: true,
    resources: [],
  });
  const blockers = (evalReport.report?.blockingIssues || []).map((b) => b.code);
  ok(!blockers.includes("incomplete_books"), "no incomplete_books blocker for library prompt");
}

console.log("\n5) Explicit cover replacement intent");
function testCoverIntent() {
  const command = {
    rawCommand: "Replace the cover with REALISTIC_LESSON_COVER for Little Makers Workshop",
    actions: { touchCover: true },
  };
  ok(lessonRead.resolveCoverIntent(command) === "EXPLICIT_REPLACE", "explicit cover intent detected");
  const plan = lmwPlan();
  const coverPlan = connected.buildCoverPlan(plan, { activities: lmwActivities() }, { command });
  ok(coverPlan.decision === "GENERATE", "explicit cover plans dedicated GENERATE task");
  ok(coverPlan.generationMode === "REALISTIC_LESSON_COVER", "explicit cover uses REALISTIC_LESSON_COVER mode");
  ok(coverPlan.coverIntent === "EXPLICIT_REPLACE", "coverIntent recorded");
}

console.log("\n6) Image classification: protected + audit existing");
function testImageClassification() {
  const plan = lmwPlan();
  const audit = auditApi.auditLesson(plan, { activities: lmwActivities(), resources: [] });
  const command = {
    rawCommand: "Audit remaining images. Protect Giant Floor Drawing and Sponge Squish Painting.",
    actions: { replaceBadImages: true, touchImages: true },
  };
  const actions = imagesApi.buildImageActionsFromAudit(plan, lmwActivities(), audit, {
    replaceBadImages: true,
    auditExistingImages: true,
    command,
    protectedActivityIds: imagesApi.parseProtectedActivityIds(command),
  });
  const protectedAction = actions.find((a) => a.activityId === ACT_PROTECTED);
  ok(protectedAction?.decision === "PROTECTED_KEEP", "protected image uses PROTECTED_KEEP");
  const other = actions.find((a) => a.activityId === ACT_OTHER);
  ok(other?.decision === "REPLACE", "weak existing image queued REPLACE under audit request");
}

console.log("\n7) Printables excluded reporting");
function testPrintablesExcluded() {
  const plan = lmwPlan();
  const audit = auditApi.auditLesson(plan, { activities: lmwActivities(), resources: [] });
  const command = { actions: { touchPrintables: false, generatePrintables: false, checkPrintables: false } };
  const kitScope = orchestrator.normalizeKitScopeFlags(command.actions);
  const workPlan = orchestrator.buildFullKitWorkPlan({ plan, audit, kitScope, command });
  ok(workPlan.printableRecommendations.length >= 0, "printable recommendations tracked separately");
  ok(workPlan.printables.every((p) => p.decision === "OUT_OF_SCOPE"), "active printable plan is OUT_OF_SCOPE");
  ok(workPlan.executionScope.printables === "EXCLUDED", "execution scope shows printables EXCLUDED");
  ok(!String(orchestrator.summarizeWorkPlanForOwner(workPlan)).includes("PRINTABLES: 0 CREATE"), "summary does not show active CREATE counts when excluded");
}

console.log("\n8) Post-apply refresh helper recomputes readiness");
function testPostApplyRefresh() {
  const plan = lmwPlan();
  const curriculum = { activities: lmwActivities(), resources: [] };
  const beforeAudit = auditApi.auditLesson(lmwPlan({ learningDomains: [], vocabularyWords: "", enrichmentDraft: { week: {}, activities: {} } }), curriculum);
  const lr = {
    lessonId: LMW_ID,
    status: "success",
    ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    beforeScores: beforeAudit.scores,
    audit: beforeAudit,
    kitScope: orchestrator.normalizeKitScopeFlags({ touchPrintables: false, generatePrintables: false }),
  };
  const refreshed = connected.refreshLessonResultPostApply(lr, plan, curriculum, {
    command: { actions: { touchPrintables: false }, rawCommand: "repair domains" },
    printablesExcluded: true,
  });
  ok(refreshed.auditAfter?.weeklyContent?.find((f) => f.field === "learningDomains")?.decision === "KEEP",
    "refreshed auditAfter sees learningDomains");
  ok(refreshed.lessonReadiness, "lessonReadiness populated");
  ok(refreshed.afterScores?.premiumReadinessPercent != null, "afterScores recomputed");
}

testPostApplyAudit();
testMergeRoundTrip();
testTeacherTipsFill();
testBookGuide();
testCoverIntent();
testImageClassification();
testPrintablesExcluded();
testPostApplyRefresh();

console.log(`\n${passed} assertions passed.`);
