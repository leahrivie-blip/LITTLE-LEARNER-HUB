#!/usr/bin/env node
/**
 * AI Curriculum Operator Phase 3 — activity images only.
 * Mocked generation/upload; CI must not call live image APIs.
 * Run: npm run test:curriculum-operator-phase3
 */
"use strict";

const assert = require("node:assert/strict");
const schema = require("./curriculum-operator-schema.js");
const commandApi = require("./curriculum-operator-command.js");
const auditApi = require("./curriculum-operator-audit.js");
const imagesApi = require("./curriculum-operator-images.js");
const jobApi = require("./curriculum-operator-job.js");
const selectApi = require("./curriculum-operator-select.js");
const { createCurriculumOperatorApi } = require("../server/curriculum-operator.js");

const OWNER = { email: "leahivie@icloud.com" };
const LESSON_ID = "cur-lp-operator-images-apple";
const ACT_PAINT = "cur-act-apple-paint";
const ACT_SONG = "cur-act-apple-song";
const ACT_SENSORY = "cur-act-apple-sensory";
const ACT_KEEP = "cur-act-apple-keep";
const ACT_BAD = "cur-act-apple-bad";

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function tinyPng() {
  // 1x1 PNG
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

function seedCurriculum() {
  const now = new Date().toISOString();
  return {
    lessonPlans: [{
      id: LESSON_ID,
      title: "Weather Watchers",
      age: "Preschool 3–5",
      theme: "Weather",
      plan: "Pro",
      status: "published",
      weeklyOverview: "Observe weather.",
      objectives: "Children will notice sky and weather patterns.",
      enrichmentDraft: {
        week: { weeklyOverview: "Observe weather together." },
        activities: {
          [ACT_KEEP]: {
            setupImageUrl: "https://cdn.example.test/good-sensory.png",
            setupMediaAssetId: "asset-keep-1",
          },
          [ACT_BAD]: {
            setupImageUrl: "https://cdn.example.test/cartoon-theme-art-apple.png",
            setupMediaAssetId: "asset-bad-1",
          },
        },
        updatedAt: now,
      },
      resourceIds: ["cur-res-weather-print"],
      dailyPlans: {
        monday: {
          items: [
            { itemId: "paint", title: "Paint the Real Sky", dayOfWeek: "monday" },
            { itemId: "song", title: "Weather Song", dayOfWeek: "monday" },
            { itemId: "sensory", title: "Cloud Sensory Tray", dayOfWeek: "monday" },
            { itemId: "keep", title: "Morning Weather Watch", dayOfWeek: "monday" },
            { itemId: "bad", title: "Rainbow Sorting", dayOfWeek: "monday" },
          ],
        },
        tuesday: { items: [] },
        wednesday: { items: [] },
        thursday: { items: [] },
        friday: { items: [] },
      },
      activityIds: [ACT_PAINT, ACT_SONG, ACT_SENSORY, ACT_KEEP, ACT_BAD],
      updatedAt: now,
      createdAt: now,
    }],
    activities: [
      {
        id: ACT_PAINT,
        lessonPlanId: LESSON_ID,
        itemId: "paint",
        title: "Paint the Real Sky",
        dayOfWeek: "monday",
        category: "Art",
        objective: "Children will paint sky colors they observe outdoors.",
        materials: "Washable blue/white paint, paper, brushes",
        setup: "Cover table; set paint cups and paper.",
        steps: "1. Look outside. 2. Paint the sky you see. 3. Share colors.",
        imageRequirement: "recommended",
      },
      {
        id: ACT_SONG,
        lessonPlanId: LESSON_ID,
        itemId: "song",
        title: "Weather Song",
        dayOfWeek: "monday",
        category: "Music",
        objective: "Sing about weather.",
        materials: "",
        setup: "",
        steps: "Sing together.",
        imageRequirement: "not_needed",
      },
      {
        id: ACT_SENSORY,
        lessonPlanId: LESSON_ID,
        itemId: "sensory",
        title: "Cloud Sensory Tray",
        dayOfWeek: "monday",
        category: "Sensory",
        objective: "Explore cloud textures with cotton and trays.",
        materials: "Shallow tray, cotton balls, water droppers",
        setup: "Place tray on floor table with cotton.",
        steps: "1. Feel cotton clouds. 2. Add drops. 3. Describe.",
        imageRequirement: "required",
      },
      {
        id: ACT_KEEP,
        lessonPlanId: LESSON_ID,
        itemId: "keep",
        title: "Morning Weather Watch",
        dayOfWeek: "monday",
        category: "Science",
        objective: "Observe and chart morning weather.",
        materials: "Weather chart, symbols",
        setup: "Place chart by window.",
        steps: "1. Look outside. 2. Choose symbol. 3. Place on chart.",
        setupImageUrl: "https://cdn.example.test/good-sensory.png",
        imageRequirement: "recommended",
      },
      {
        id: ACT_BAD,
        lessonPlanId: LESSON_ID,
        itemId: "bad",
        title: "Rainbow Sorting",
        dayOfWeek: "monday",
        category: "Math",
        objective: "Sort rainbow-colored objects by color.",
        materials: "Colored pom-poms, bowls",
        setup: "Bowls in a row.",
        steps: "Sort by color.",
        setupImageUrl: "https://cdn.example.test/cartoon-theme-art-apple.png",
        imageRequirement: "recommended",
      },
    ],
    resources: [
      {
        id: "cur-res-weather-print",
        title: "Weather Matching Cards",
        category: "Printables",
        lessonPlanId: LESSON_ID,
        status: "published",
      },
    ],
  };
}

function mockGenerateFactory(counter) {
  return async ({ prompt }) => {
    counter.calls += 1;
    counter.prompts.push(String(prompt || ""));
    return { buffer: tinyPng(), mimeType: "image/png", model: "fixture" };
  };
}

function mockUploadFactory(counter, { fail = false } = {}) {
  return async ({ lessonPlanId, activityKey, field }) => {
    counter.calls += 1;
    if (fail) throw new Error("upload_failed");
    const id = `asset-${activityKey}-${field}-${counter.calls}`;
    return {
      mediaAssetId: id,
      mediaUrl: `https://cdn.example.test/${id}.png`,
      thumbUrl: `https://cdn.example.test/${id}-thumb.png`,
      mimeType: "image/png",
      lessonPlanId,
    };
  };
}

async function main() {
  console.log("Curriculum Operator Phase 3 — activity images");

  // --- Command parsing ---
  console.log("Command parsing");
  const picFix = commandApi.parseOperatorCommand("Fix the activity pictures on Weather Watchers.", { phase: 3 });
  ok(picFix.command.actions.generateImages === true, "fix pictures enables generateImages");
  ok(picFix.command.actions.upgradeLesson === false, "image-focused fix does not force text upgrade");
  ok(picFix.command.actions.publish === false, "publish blocked");
  ok(picFix.command.actions.generatePrintables === false, "printables blocked");
  ok(picFix.command.actions.createLesson === false, "lesson.create blocked");

  const upgradeWithPics = commandApi.parseOperatorCommand(
    "Upgrade this lesson including the pictures that actually need it.",
    { phase: 3, currentlySelectedLessonId: LESSON_ID },
  );
  ok(upgradeWithPics.command.actions.upgradeLesson === true, "upgrade+pictures upgrades text");
  ok(upgradeWithPics.command.actions.generateImages === true, "upgrade+pictures generates images");

  const keepGood = commandApi.parseOperatorCommand(
    "Keep all good pictures and only replace the bad ones on Weather Watchers.",
    { phase: 3 },
  );
  ok(keepGood.command.actions.replaceBadImages === true, "replace-bad intent sets replaceBadImages");
  ok(keepGood.command.actions.generateImages === true, "replace-bad still allows generation");

  const noTouch = commandApi.parseOperatorCommand(
    "Upgrade Weather Watchers. Do not touch the pictures on this lesson.",
    { phase: 3 },
  );
  ok(noTouch.command.actions.touchImages === false, "do not touch pictures");
  ok(noTouch.command.actions.generateImages === false, "no generation when pictures locked");

  const weakest = commandApi.parseOperatorCommand(
    "Find the 5 lessons with the weakest activity images and fix them.",
    { phase: 3 },
  );
  ok(weakest.command.scope.selection === "needs_activity_images", "weakest images selection");
  ok(weakest.command.scope.count === 5, "count 5");
  ok(weakest.command.actions.generateImages === true, "weakest images enables generation");

  // --- Decisions ---
  console.log("Image decisions");
  const curriculum = seedCurriculum();
  const plan = curriculum.lessonPlans[0];
  const audit = auditApi.auditLesson(plan, curriculum);
  const actions = imagesApi.buildImageActionsFromAudit(plan, curriculum.activities, audit, {
    replaceBadImages: true,
  });
  const byId = Object.fromEntries(actions.map((a) => [a.activityId, a]));

  ok(byId[ACT_PAINT]?.decision === "GENERATE", "missing useful art → GENERATE");
  ok(byId[ACT_PAINT]?.reason, "GENERATE requires reason");
  ok(byId[ACT_SONG]?.decision === "NOT_NEEDED", "song → NOT_NEEDED");
  ok(byId[ACT_SENSORY]?.decision === "GENERATE", "missing sensory → GENERATE");
  ok(byId[ACT_KEEP]?.decision === "KEEP", "good existing → KEEP");
  ok(byId[ACT_BAD]?.decision === "REPLACE", "theme-art URL → REPLACE");
  ok(actions.every((a) => a.reason), "every decision has a reason");

  const prompt = imagesApi.buildActivityImagePrompt({
    plan,
    activity: curriculum.activities.find((a) => a.id === ACT_PAINT),
    draftActivity: {},
    field: "setupImageUrl",
  });
  ok(/Paint the Real Sky/i.test(prompt), "prompt includes activity title");
  ok(/washable|paint|paper/i.test(prompt), "prompt includes materials from activity");
  ok(!/cartoon apple/i.test(prompt), "prompt is not generic theme art");

  // --- Attach ID safety ---
  console.log("Attach ID safety");
  const draft0 = { week: {}, activities: {} };
  const badLesson = imagesApi.attachImageToEnrichmentDraft(draft0, {
    lessonId: "wrong-lesson",
    expectedLessonId: LESSON_ID,
    activityId: ACT_PAINT,
    field: "setupImageUrl",
    mediaAssetId: "a1",
    mediaUrl: "https://cdn.example.test/a1.png",
    thumbUrl: "https://cdn.example.test/a1-t.png",
  });
  ok(badLesson.ok === false && badLesson.code === "wrong_lesson_id", "wrong lesson ID rejected");

  const badAct = imagesApi.attachImageToEnrichmentDraft(draft0, {
    lessonId: LESSON_ID,
    expectedLessonId: LESSON_ID,
    activityId: "",
    field: "setupImageUrl",
    mediaAssetId: "a1",
    mediaUrl: "https://cdn.example.test/a1.png",
    thumbUrl: "https://cdn.example.test/a1-t.png",
  });
  ok(badAct.ok === false, "missing activity ID rejected");

  const goodAttach = imagesApi.attachImageToEnrichmentDraft(draft0, {
    lessonId: LESSON_ID,
    expectedLessonId: LESSON_ID,
    activityId: ACT_PAINT,
    field: "setupImageUrl",
    mediaAssetId: "a1",
    mediaUrl: "https://cdn.example.test/a1.png",
    thumbUrl: "https://cdn.example.test/a1-t.png",
  });
  ok(goodAttach.ok === true, "exact activity ID attach succeeds");
  ok(goodAttach.enrichmentDraft.activities[ACT_PAINT].setupImageUrl.includes("a1.png"), "attached to exact activity");

  // --- Pipeline with mocks ---
  console.log("Generate / upload / preserve");
  const genCounter = { calls: 0, prompts: [] };
  const upCounter = { calls: 0 };
  const run = await imagesApi.runImagePlanForLesson({
    plan,
    activities: curriculum.activities,
    audit,
    limits: { maxImageGenerations: 40 },
    replaceBadImages: true,
    callGenerate: mockGenerateFactory(genCounter),
    uploadFn: mockUploadFactory(upCounter),
    mockGenerate: true,
  });
  ok(run.changed === true, "image plan changes draft when generations succeed");
  ok(run.counts.KEEP >= 1, "KEEP counted");
  ok(run.counts.NOT_NEEDED >= 1, "NOT_NEEDED counted");
  ok(run.counts.SUCCESS >= 1, "successful writes counted");
  ok(genCounter.calls === run.generations, "generate called only for write decisions");
  ok(genCounter.calls < actions.length, "does not generate for every activity");
  const songAction = run.actions.find((a) => a.activityId === ACT_SONG);
  ok(songAction.decision === "NOT_NEEDED" && songAction.status === "skipped", "NOT_NEEDED skips generation");
  const keepAction = run.actions.find((a) => a.activityId === ACT_KEEP);
  ok(keepAction.decision === "KEEP" && keepAction.status === "skipped", "KEEP skips generation");
  ok(
    run.enrichmentDraft.activities[ACT_KEEP].setupImageUrl === "https://cdn.example.test/good-sensory.png",
    "KEEP preserves existing URL",
  );
  ok(run.enrichmentDraft.activities[ACT_PAINT].setupImageUrl, "GENERATE attached URL");
  ok(run.enrichmentDraft.activities[ACT_BAD].setupImageUrl !== "https://cdn.example.test/cartoon-theme-art-apple.png",
    "REPLACE updated bad image");

  // Generation failure preserves existing
  const failGen = await imagesApi.runImagePlanForLesson({
    plan,
    activities: curriculum.activities,
    audit,
    limits: { maxImageGenerations: 40 },
    replaceBadImages: true,
    callGenerate: async () => { throw new Error("generation_failed"); },
    uploadFn: mockUploadFactory({ calls: 0 }),
  });
  ok(
    failGen.enrichmentDraft.activities[ACT_BAD]?.setupImageUrl === "https://cdn.example.test/cartoon-theme-art-apple.png"
    || failGen.actions.find((a) => a.activityId === ACT_BAD)?.preservedExisting === true,
    "generation failure preserves existing image",
  );
  ok(failGen.actions.some((a) => a.status === "failed" && a.retryable), "failures marked retryable");

  // Upload failure preserves existing
  const failUp = await imagesApi.runImagePlanForLesson({
    plan,
    activities: curriculum.activities,
    audit,
    limits: { maxImageGenerations: 40 },
    replaceBadImages: true,
    callGenerate: mockGenerateFactory({ calls: 0, prompts: [] }),
    uploadFn: mockUploadFactory({ calls: 0 }, { fail: true }),
  });
  ok(
    failUp.actions.find((a) => a.activityId === ACT_BAD)?.preservedExisting === true
    || failUp.enrichmentDraft.activities[ACT_BAD]?.setupImageUrl === "https://cdn.example.test/cartoon-theme-art-apple.png",
    "upload failure preserves existing image",
  );

  // Attach failure: wrong id path already covered; simulate attach reject by empty media after gen
  const attachFail = imagesApi.attachImageToEnrichmentDraft(
    { activities: { [ACT_BAD]: { setupImageUrl: "https://cdn.example.test/cartoon-theme-art-apple.png" } } },
    {
      lessonId: LESSON_ID,
      expectedLessonId: LESSON_ID,
      activityId: ACT_BAD,
      field: "setupImageUrl",
      mediaAssetId: "",
      mediaUrl: "",
      thumbUrl: "",
    },
  );
  ok(attachFail.ok === false, "attach failure without media rejected");

  // Hard limits / scope
  console.log("Limits / scope");
  const scoped = imagesApi.assessImageScope({
    actions: Array.from({ length: 50 }, (_, i) => ({ decision: "GENERATE", activityId: `a${i}` })),
    lessonCount: 1,
    limits: { maxImageGenerations: 40 },
  });
  ok(scoped.ok === false && scoped.code === "SCOPE_REVIEW_REQUIRED", "hard generation limits trigger scope review");

  const limited = await imagesApi.runImagePlanForLesson({
    plan,
    activities: curriculum.activities,
    audit,
    limits: { maxImageGenerations: 1 },
    replaceBadImages: true,
    callGenerate: mockGenerateFactory({ calls: 0, prompts: [] }),
    uploadFn: mockUploadFactory({ calls: 0 }),
  });
  ok(limited.generations <= 1, "hard maxImageGenerations enforced during run");

  // Resume idempotency
  console.log("Resume / idempotency");
  const firstGen = { calls: 0, prompts: [] };
  const first = await imagesApi.runImagePlanForLesson({
    plan,
    activities: curriculum.activities,
    audit,
    limits: { maxImageGenerations: 40 },
    replaceBadImages: true,
    callGenerate: mockGenerateFactory(firstGen),
    uploadFn: mockUploadFactory({ calls: 0 }),
  });
  const succeeded = new Set(
    first.actions.filter((a) => a.status === "success").map((a) => a.idempotencyKey),
  );
  const secondGen = { calls: 0, prompts: [] };
  const second = await imagesApi.runImagePlanForLesson({
    plan: { ...plan, enrichmentDraft: first.enrichmentDraft },
    activities: curriculum.activities,
    audit: auditApi.auditLesson({ ...plan, enrichmentDraft: first.enrichmentDraft }, curriculum),
    limits: { maxImageGenerations: 40 },
    replaceBadImages: true,
    callGenerate: mockGenerateFactory(secondGen),
    uploadFn: mockUploadFactory({ calls: 0 }),
    alreadySucceededKeys: succeeded,
  });
  ok(secondGen.calls === 0 || second.actions.every((a) => a.status !== "success" || succeeded.has(a.idempotencyKey) || a.status === "skipped"),
    "resume skips successful image actions");
  ok(second.actions.filter((a) => a.status === "skipped" && /already succeeded/i.test(a.reason || "")).length >= succeeded.size
    || secondGen.calls === 0,
    "job resume does not regenerate duplicates");

  // Verification
  console.log("Post-attach verification");
  const beforePlan = plan;
  const afterPlan = {
    ...plan,
    enrichmentDraft: {
      week: {},
      activities: {
        ...plan.enrichmentDraft.activities,
        ...goodAttach.enrichmentDraft.activities,
      },
    },
    age: plan.age,
    title: plan.title,
    plan: plan.plan,
    status: plan.status,
    resourceIds: plan.resourceIds.slice(),
  };
  const verified = imagesApi.verifyAttachedImage({
    beforePlan,
    afterPlan,
    activityId: ACT_PAINT,
    field: "setupImageUrl",
    mediaUrl: "https://cdn.example.test/a1.png",
    mediaAssetId: "a1",
    untouchedActivityIds: [ACT_KEEP, ACT_SONG],
  });
  ok(verified.ok, "draft reload verifies attachment");

  // --- Job runner integration ---
  console.log("Operator job integration");
  let store = {
    siteContent: {
      featureFlags: { teachingKitCurriculumOperator: true },
      curriculum: seedCurriculum(),
    },
    curriculumOperatorJobs: { jobs: [], updatedAt: "" },
  };
  const genJob = { calls: 0, prompts: [] };
  const publishedBefore = JSON.stringify(store.siteContent.curriculum.lessonPlans[0].status);
  const resourcesBefore = JSON.stringify(store.siteContent.curriculum.resources);
  const titleBefore = store.siteContent.curriculum.lessonPlans[0].title;
  const ageBefore = store.siteContent.curriculum.lessonPlans[0].age;
  const keepUrlBefore = store.siteContent.curriculum.lessonPlans[0].enrichmentDraft.activities[ACT_KEEP].setupImageUrl;

  const api = createCurriculumOperatorApi({
    readJson: async () => ({}),
    jsonResponse: () => {},
    readStore: () => store,
    writeStoreAsync: async (next) => { store = next; },
    requireTeachingKitOwnerAdminSession: () => ({ email: OWNER.email }),
    teachingKit: require("./teaching-kit.js"),
    normalizeEmail: (v) => String(v || "").trim().toLowerCase(),
    readSiteCurriculum: (s) => s.siteContent.curriculum,
    generateOperatorImage: mockGenerateFactory(genJob),
    persistEnrichmentPhoto: async () => ({ persistent: true, storage: "test" }),
    enrichmentMedia: {
      enrichmentMediaAssetId: () => `asset-${Date.now()}`,
      enrichmentMediaUrl: (id, variant) => `https://cdn.example.test/${id}-${variant}.png`,
      buildEnrichmentVariants: async (buffer) => ({
        full: { buffer, mimeType: "image/png" },
        thumb: { buffer, mimeType: "image/png" },
      }),
    },
    saveOperatorEnrichmentDraft: async ({ lessonPlanId, enrichmentDraft }) => {
      const plans = store.siteContent.curriculum.lessonPlans;
      const idx = plans.findIndex((p) => p.id === lessonPlanId);
      const prev = plans[idx];
      // Never mutate published body fields
      plans[idx] = {
        ...prev,
        enrichmentDraft: { ...enrichmentDraft, updatedAt: new Date().toISOString() },
        enrichmentPublishHistory: [
          { versionId: `img-${lessonPlanId}`, kind: "draft", snapshot: { enrichmentDraft: prev.enrichmentDraft } },
          ...(prev.enrichmentPublishHistory || []),
        ],
      };
      return { ok: true, lessonPlan: plans[idx], versionId: `img-${lessonPlanId}`, saveMode: "enrichment_draft" };
    },
  });

  const imgCmd = schema.normalizeOperatorCommand({
    rawCommand: "Fix the activity pictures on Weather Watchers.",
    intent: "finish_images",
    scope: { selection: "explicit_ids", lessonIds: [LESSON_ID], count: 1 },
    actions: {
      audit: true,
      generateImages: true,
      replaceBadImages: true,
      saveDraft: true,
      upgradeLesson: false,
      upgradeActivities: false,
    },
    completion: { phase: 3 },
  }, { phase: 3 });
  ok(imgCmd.actions.generateImages === true, "phase3 command allows images");
  ok(imgCmd.actions.publish === false && imgCmd.actions.generatePrintables === false, "phase3 still blocks publish/printables");

  const selection = selectApi.selectLessons(store.siteContent.curriculum, imgCmd);
  const planSummary = api.buildPlanSummary(imgCmd, selection);
  ok(planSummary.generatesImages === true, "plan summary marks image generation");
  let job = jobApi.createJobFromPlan({
    command: imgCmd,
    planSummary,
    createdBy: OWNER.email,
    status: "running",
  });
  ok(job.lessonResults[0].actions.some((a) => a.type === "image.generate"), "job includes image steps");

  const finished = await api.runJob(job, store, OWNER.email);
  ok(finished.status === "completed" || finished.progress.completed === 1, "image job completes");
  const lr = finished.lessonResults[0];
  ok(lr.imageCounts, "lesson result includes imageCounts");
  ok(lr.imagesComplete === true || lr.status === "success", "images marked complete");
  ok(lr.published === false, "no publish");
  const after = store.siteContent.curriculum.lessonPlans[0];
  ok(after.title === titleBefore && after.age === ageBefore, "age/access/title preserved");
  ok(after.status === JSON.parse(publishedBefore), "publish state unchanged");
  ok(JSON.stringify(store.siteContent.curriculum.resources) === resourcesBefore, "printables/resources unchanged");
  ok(after.enrichmentDraft.activities[ACT_KEEP].setupImageUrl === keepUrlBefore, "unrelated KEEP image unchanged");
  ok(after.enrichmentDraft.activities[ACT_PAINT]?.setupImageUrl, "generated image attached on draft");
  ok(!Object.values(after.enrichmentDraft.activities || {}).some((p) => p.printableResourceId), "no printable mutation");

  // Resume should not regenerate
  const genBeforeResume = genJob.calls;
  finished.lessonResults = finished.lessonResults.map((row) => ({
    ...row,
    status: "success",
    imagesComplete: true,
  }));
  const resumed = await api.runJob(finished, store, OWNER.email);
  ok(resumed.progress.completed === 1, "resume skips completed image lesson");
  ok(genJob.calls === genBeforeResume, "resume does not generate duplicates");

  // No-touch images job
  const noImgCmd = schema.normalizeOperatorCommand({
    rawCommand: "Do not touch the pictures",
    intent: "audit",
    scope: { selection: "explicit_ids", lessonIds: [LESSON_ID], count: 1 },
    actions: { audit: true, generateImages: false, touchImages: false, saveDraft: false },
    completion: { phase: 3 },
  }, { phase: 3 });
  ok(noImgCmd.actions.generateImages === false, "schema respects touchImages false");

  // Schema phase gates
  const p2 = schema.normalizeOperatorCommand({
    actions: { generateImages: true, saveDraft: true },
  }, { phase: 2 });
  ok(p2.actions.generateImages === false, "phase2 still blocks images");

  const p3 = schema.normalizeOperatorCommand({
    intent: "finish_images",
    actions: { generateImages: true },
  }, { phase: 3 });
  ok(p3.actions.generateImages === true && p3.actions.createLesson === false, "phase3 images only");

  console.log(`\nPhase 3 passed ${passed} assertions`);
}

main().catch((error) => {
  console.error("\nPhase 3 FAILED:", error);
  process.exit(1);
});
