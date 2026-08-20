#!/usr/bin/env node
/**
 * AI Curriculum Operator Phase 6 — full Teaching Kit orchestration.
 * Deterministic fixtures; CI must not call live OpenAI or live image APIs.
 * Run: npm run test:curriculum-operator-phase6
 */
"use strict";

const assert = require("node:assert/strict");
const schema = require("./curriculum-operator-schema.js");
const commandApi = require("./curriculum-operator-command.js");
const orchestrator = require("./curriculum-operator-orchestrator.js");
const jobApi = require("./curriculum-operator-job.js");
const selectApi = require("./curriculum-operator-select.js");
const auditApi = require("./curriculum-operator-audit.js");
const { createCurriculumOperatorApi } = require("../server/curriculum-operator.js");

const OWNER = { email: "leahivie@icloud.com" };
const LESSON_ID = "cur-lp-operator-phase6-weather";
const ACT_A = "cur-act-p6-a";
const ACT_B = "cur-act-p6-b";
const KEEP_IMG = "https://cdn.example.test/p6-keep.png";
const KEEP_PRINT = "cur-res-p6-keep";

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
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
      weeklyOverview: "Explore weather through play.",
      objectives: "Notice weather words.",
      coverImageUrl: "https://cdn.example.test/cover-locked.png",
      enrichmentDraft: {
        week: {
          weeklyOverview: "Explore weather through play.",
          printableIds: [KEEP_PRINT],
          songs: [{
            title: "Morning Weather Song",
            linkedWeekday: "monday",
            rightsStatus: "original",
            allowPrintLyrics: true,
            lyrics: "Clouds and sun,\nSing with me!",
          }],
          books: [{
            title: "What Will the Weather Be?",
            author: "Lynda DeWitt",
            whyThisBook: "Supports weather observation.",
            afterReadingQuestions: ["Which weather word can we use?", "What should we notice first?"],
          }],
        },
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
        title: "Wind Dance",
        dayOfWeek: "monday",
        category: "Movement",
        objective: "Move like wind.",
        steps: "Sway scarves.",
        setupImageUrl: KEEP_IMG,
        relatedPrintableId: KEEP_PRINT,
      },
      {
        id: ACT_B,
        lessonPlanId: LESSON_ID,
        title: "Weather Reporter",
        dayOfWeek: "tuesday",
        category: "Dramatic Play",
        objective: "Use weather words.",
        steps: "Pretend report.",
      },
    ],
    resources: [{
      id: KEEP_PRINT,
      title: "Weather Cards",
      resourceCategory: "Printables",
      resourceType: "picture_cards",
      lessonPlanIds: [LESSON_ID],
      status: "draft",
      fileName: "weather-cards.pdf",
      fileData: "data:application/pdf;base64,JVBERi0xLjQ=",
      pageCount: 1,
      mimeType: "application/pdf",
    }],
  };
}

async function main() {
  console.log("Curriculum Operator Phase 6 — full kit orchestration");

  console.log("Commands / exclusions");
  const finish = commandApi.parseOperatorCommand(
    "Finish Weather Watchers and get it ready for me to review.",
    { phase: 6 },
  );
  ok(finish.command.intent === "finish_full_kit", "finish → finish_full_kit");
  ok(finish.command.actions.upgradeLesson === true, "finish enables text");
  ok(finish.command.actions.generateSongsBooks === true, "finish enables songs/books");
  ok(finish.command.actions.generateImages === true, "finish enables images");
  ok(finish.command.actions.generatePrintables === true, "finish enables printables");
  ok(finish.command.actions.publish === false, "publish blocked");
  ok(finish.command.actions.createLesson === false, "lesson.create blocked");
  ok(finish.command.actions.touchCover === false, "cover locked by default");

  const noPics = commandApi.parseOperatorCommand(
    "Finish this lesson but do not touch pictures.",
    { phase: 6, currentlySelectedLessonId: LESSON_ID },
  );
  ok(noPics.command.actions.touchImages === false && noPics.command.actions.generateImages === false,
    "don’t touch pictures → image lock");

  const keepPrint = commandApi.parseOperatorCommand(
    "Finish this lesson but keep the current printables.",
    { phase: 6, currentlySelectedLessonId: LESSON_ID },
  );
  ok(keepPrint.command.actions.touchPrintables === false && keepPrint.command.actions.generatePrintables === false,
    "keep printables → printable lock");

  const textOnly = commandApi.parseOperatorCommand(
    "Only fix the lesson text for Weather Watchers.",
    { phase: 6 },
  );
  ok(textOnly.command.actions.upgradeLesson === true, "text-only upgrades text");
  ok(textOnly.command.actions.generateImages === false
    && textOnly.command.actions.generatePrintables === false
    && textOnly.command.actions.generateSongsBooks === false,
    "text-only locks assets/songs/books");

  const exceptBooks = commandApi.parseOperatorCommand(
    "Do everything except books for Weather Watchers.",
    { phase: 6 },
  );
  ok(exceptBooks.command.actions.touchBooks === false, "except books locks books");

  const batch = commandApi.parseOperatorCommand(
    "Upgrade the 5 weakest Toddler Pro lessons and leave them ready for review.",
    { phase: 6 },
  );
  ok(batch.command.scope.selection === "lowest_readiness", "batch weakest selection");
  ok(batch.command.scope.count === 5, "batch count 5");
  ok(batch.command.scope.ageBand === "toddler" && batch.command.scope.plan === "Pro", "batch age/plan filters");
  ok(batch.command.intent === "upgrade_batch" || batch.command.intent === "finish_full_kit", "batch full-kit intent");

  console.log("Schema phase isolation");
  const p5 = schema.normalizeOperatorCommand({
    intent: "finish_songs_books",
    actions: { generateSongsBooks: true, generateImages: true, generatePrintables: true },
  }, { phase: 5 });
  ok(p5.actions.generateSongsBooks === true && p5.actions.generateImages === false && p5.actions.generatePrintables === false,
    "phase 5 still songs/books only");

  const p4 = schema.normalizeOperatorCommand({
    intent: "finish_printables",
    actions: { generatePrintables: true, generateImages: true },
  }, { phase: 4 });
  ok(p4.actions.generatePrintables === true && p4.actions.generateImages === false, "phase 4 printables only");

  const p6 = schema.normalizeOperatorCommand({
    intent: "finish_full_kit",
    actions: {
      upgradeLesson: true,
      upgradeActivities: true,
      generateSongsBooks: true,
      generateImages: true,
      generatePrintables: true,
      touchImages: false,
    },
  }, { phase: 6 });
  ok(p6.actions.generateImages === false, "phase 6 respects immutable image lock");
  ok(p6.actions.generatePrintables === true && p6.actions.generateSongsBooks === true, "phase 6 keeps other scopes");

  console.log("Work plan + classification");
  const curriculum = seedCurriculum();
  const plan = curriculum.lessonPlans[0];
  const audit = auditApi.auditLesson(plan, curriculum);
  const kitScope = orchestrator.normalizeKitScopeFlags({
    upgradeLesson: true,
    upgradeActivities: true,
    generateSongsBooks: true,
    generateImages: true,
    generatePrintables: false,
    touchPrintables: false,
    touchCover: false,
  });
  const workPlan = orchestrator.buildFullKitWorkPlan({ plan, audit, kitScope });
  ok(workPlan.cover === "LOCKED", "cover locked in work plan");
  ok(workPlan.kitScope.locks.printables === true, "printable lock in kitScope");
  ok(Array.isArray(workPlan.executionOrder) && workPlan.executionOrder[0] === "PARSE_COMMAND", "execution order present");
  ok(workPlan.executionOrder.indexOf("UPGRADE_TEXT")
    < workPlan.executionOrder.indexOf("SONGS_BOOKS"), "text before songs/books");
  ok(workPlan.executionOrder.indexOf("SONGS_BOOKS")
    < workPlan.executionOrder.indexOf("IMAGES"), "songs/books before images");
  ok(workPlan.executionOrder.indexOf("IMAGES")
    < workPlan.executionOrder.indexOf("PRINTABLES"), "images before printables");

  ok(orchestrator.classifyFullKitOwnerReview({
    kitScope,
    textOk: true,
    textRan: true,
    songsBooksOk: true,
    songsBooksRan: true,
    imagesOk: true,
    imagesRan: true,
    printablesOk: true,
    printablesRan: false,
    finalVerificationOk: true,
  }) === "READY_FOR_OWNER_REVIEW", "READY when enabled phases succeed");

  ok(orchestrator.classifyFullKitOwnerReview({
    kitScope,
    textOk: true,
    textRan: true,
    songsBooksOk: true,
    songsBooksRan: true,
    imagesOk: false,
    imagesRan: true,
    printablesOk: true,
    printablesRan: false,
    finalVerificationOk: true,
    partialErrors: ["image failed"],
  }) === "PARTIAL", "image failure → PARTIAL");

  ok(orchestrator.classifyFullKitOwnerReview({
    kitScope,
    textOk: false,
    textRan: true,
    finalVerificationOk: true,
  }) === "BLOCKED", "text failure → BLOCKED");

  const verified = orchestrator.verifyFullKitStoredState({
    beforePlan: plan,
    afterPlan: plan,
    kitScope,
  });
  ok(verified.ok === true, "identity verification passes on unchanged plan");

  const mutated = JSON.parse(JSON.stringify(plan));
  mutated.age = "Preschool 3–5";
  ok(orchestrator.verifyFullKitStoredState({
    beforePlan: plan,
    afterPlan: mutated,
    kitScope,
  }).ok === false, "age mutation fails verification");

  const coverMut = JSON.parse(JSON.stringify(plan));
  coverMut.coverImageUrl = "https://cdn.example.test/CHANGED-COVER.png";
  ok(orchestrator.verifyFullKitStoredState({
    beforePlan: plan,
    afterPlan: coverMut,
    kitScope,
  }).ok === false, "cover mutation fails when locked");

  const imgLockScope = orchestrator.normalizeKitScopeFlags({
    touchImages: false,
    generateImages: false,
  });
  const imgMut = JSON.parse(JSON.stringify(plan));
  imgMut.enrichmentDraft.activities[ACT_A].setupImageUrl = "https://cdn.example.test/CHANGED.png";
  ok(orchestrator.verifyFullKitStoredState({
    beforePlan: plan,
    afterPlan: imgMut,
    kitScope: imgLockScope,
  }).ok === false, "image lock detects mutation");

  console.log("Job steps / order");
  const fullCmd = schema.normalizeOperatorCommand({
    rawCommand: "Finish Weather Watchers.",
    intent: "finish_full_kit",
    scope: { selection: "explicit_ids", lessonIds: [LESSON_ID], count: 1, titles: ["Weather Watchers"] },
    actions: {
      upgradeLesson: true,
      upgradeActivities: true,
      generateSongsBooks: true,
      generateImages: true,
      generatePrintables: true,
      saveDraft: true,
      touchImages: true,
      touchPrintables: true,
    },
    completion: { phase: 6 },
  }, { phase: 6 });
  const selection = selectApi.selectLessons(curriculum, fullCmd);
  const api = createCurriculumOperatorApi({
    readJson: async () => ({}),
    jsonResponse: () => {},
    readStore: () => ({ siteContent: { featureFlags: { teachingKitCurriculumOperator: true }, curriculum }, curriculumOperatorJobs: { jobs: [] } }),
    writeStoreAsync: async () => {},
    requireTeachingKitOwnerAdminSession: () => ({ email: OWNER.email }),
    teachingKit: require("./teaching-kit.js"),
    normalizeEmail: (v) => String(v || "").trim().toLowerCase(),
    readSiteCurriculum: (s) => s.siteContent.curriculum,
  });
  const planSummary = api.buildPlanSummary(fullCmd, selection);
  ok(planSummary.phase >= 6, "plan summary phase 6");
  ok(planSummary.generatesImages && planSummary.generatesPrintables && planSummary.generatesSongsBooks, "plan enables all permitted scopes");
  ok(planSummary.publishes === false && planSummary.createsLesson === false, "plan never publish/create");
  ok(Array.isArray(planSummary.selectedLessonIds) && planSummary.selectedLessonIds[0] === LESSON_ID, "selected IDs recorded");

  const job = jobApi.createJobFromPlan({
    command: fullCmd,
    planSummary,
    createdBy: OWNER.email,
    status: "planned",
  });
  const types = job.lessonResults[0].actions.map((a) => a.type);
  const idxText = types.indexOf("lesson.updateFields");
  const idxSong = types.indexOf("song.upsert");
  const idxImg = types.indexOf("image.generate");
  const idxPr = types.indexOf("printable.generatePages");
  ok(idxText >= 0 && idxSong >= 0 && idxImg >= 0 && idxPr >= 0, "job includes text/songs/images/printables");
  ok(idxText < idxSong && idxSong < idxImg && idxImg < idxPr, "job step order text → songs → images → printables");

  const lockedImgCmd = schema.normalizeOperatorCommand({
    ...fullCmd,
    actions: { ...fullCmd.actions, touchImages: false, generateImages: false },
  }, { phase: 6 });
  const lockedJob = jobApi.createJobFromPlan({
    command: lockedImgCmd,
    planSummary: api.buildPlanSummary(lockedImgCmd, selection),
    createdBy: OWNER.email,
  });
  ok(!lockedJob.lessonResults[0].actions.some((a) => String(a.type).startsWith("image.")),
    "image lock removes image steps");
  ok(lockedJob.lessonResults[0].actions.some((a) => a.type === "song.upsert"), "image lock keeps songs");

  console.log("Exclusion persistence after normalize");
  const excl = orchestrator.parseExclusionHints("Finish Weather Watchers. Do not touch songs. Keep the existing printables.");
  ok(excl.flags.touchSongs === false && excl.flags.touchPrintables === false, "exclusion hints parsed");
  const resumedFlags = orchestrator.normalizeKitScopeFlags({
    generateSongsBooks: true,
    generatePrintables: true,
    generateImages: true,
    touchSongs: false,
    touchPrintables: false,
    touchImages: true,
    upgradeLesson: true,
  });
  ok(resumedFlags.locks.songs && resumedFlags.locks.printables && !resumedFlags.locks.images,
    "exclusions immutable in kitScope");
  ok(resumedFlags.songs === false && resumedFlags.printables === false && resumedFlags.images === true,
    "locked scopes cannot be overridden by generate flags");

  console.log("Batch isolation / scope");
  const scopeOk = orchestrator.assessFullKitScope({
    lessonCount: 5,
    workPlans: [workPlan, workPlan, workPlan, workPlan, workPlan],
    limits: { maxLessons: 10, hardMaxLessons: 20, maxImageGenerations: 40, maxPrintableGenerations: 30 },
  });
  ok(scopeOk.ok === true, "normal batch scope ok");
  const scopeBig = orchestrator.assessFullKitScope({
    lessonCount: 25,
    limits: { maxLessons: 10, hardMaxLessons: 20 },
  });
  ok(scopeBig.ok === false && scopeBig.code === "SCOPE_REVIEW_REQUIRED", "oversized batch → SCOPE_REVIEW_REQUIRED");

  console.log("Operator wants* gates");
  ok(api.wantsImages(fullCmd) === true, "wantsImages true for phase 6");
  ok(api.wantsPrintables(fullCmd) === true, "wantsPrintables true for phase 6");
  ok(api.wantsSongsBooks(fullCmd) === true, "wantsSongsBooks true for phase 6");
  ok(api.wantsImages(lockedImgCmd) === false, "wantsImages false when locked");
  const p5cmd = schema.normalizeOperatorCommand({
    intent: "finish_songs_books",
    actions: { generateSongsBooks: true, generateImages: true, saveDraft: true },
    completion: { phase: 5 },
  }, { phase: 5 });
  ok(api.wantsImages(p5cmd) === false && api.wantsSongsBooks(p5cmd) === true, "phase 5 wants* unchanged");

  console.log(`\nPhase 6 passed ${passed} assertions`);
}

main().catch((error) => {
  console.error("\nPhase 6 FAILED:", error);
  process.exit(1);
});
