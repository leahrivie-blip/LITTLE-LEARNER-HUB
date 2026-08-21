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

  // --- Verification hardening (allowed mutations, idempotency, scope, draft-only) ---
  console.log("Verification hardening");

  const genTwice = { calls: 0, prompts: [] };
  const upTwice = { calls: 0 };
  const firstPass = await imagesApi.runImagePlanForLesson({
    plan,
    activities: curriculum.activities,
    audit,
    limits: { maxImageGenerations: 40 },
    replaceBadImages: true,
    callGenerate: mockGenerateFactory(genTwice),
    uploadFn: mockUploadFactory(upTwice),
  });
  ok(firstPass.ok && firstPass.generations >= 1, "first image pass generates");
  const firstUrls = JSON.stringify(firstPass.enrichmentDraft.activities);
  const succeededKeys = new Set(
    firstPass.actions.filter((a) => a.status === "success").map((a) => a.idempotencyKey),
  );
  const genBeforeSecond = genTwice.calls;
  const upBeforeSecond = upTwice.calls;
  const secondPass = await imagesApi.runImagePlanForLesson({
    plan: { ...plan, enrichmentDraft: firstPass.enrichmentDraft },
    activities: curriculum.activities,
    audit: auditApi.auditLesson({ ...plan, enrichmentDraft: firstPass.enrichmentDraft }, curriculum),
    limits: { maxImageGenerations: 40 },
    replaceBadImages: true,
    callGenerate: mockGenerateFactory(genTwice),
    uploadFn: mockUploadFactory(upTwice),
    alreadySucceededKeys: succeededKeys,
  });
  ok(genTwice.calls === genBeforeSecond, "second identical run does not regenerate");
  ok(upTwice.calls === upBeforeSecond, "second identical run does not re-upload");
  ok(secondPass.generations === 0, "second run consumes zero generation budget");
  ok(JSON.stringify(secondPass.enrichmentDraft.activities) === firstUrls, "second run does not change media URLs");

  const jobVerifyOk = imagesApi.verifyImageJobDraft({
    beforePlan: plan,
    afterPlan: { ...plan, enrichmentDraft: firstPass.enrichmentDraft },
    actions: firstPass.actions,
  });
  ok(jobVerifyOk.ok, "allowed-mutation verification passes for legitimate sibling writes");
  ok(jobVerifyOk.allowedMutations.length === firstPass.counts.SUCCESS, "allowed set matches successful writes");

  const tampered = JSON.parse(JSON.stringify(firstPass.enrichmentDraft));
  tampered.activities[ACT_KEEP].setupImageUrl = "https://cdn.example.test/UNEXPECTED.png";
  const jobVerifyBad = imagesApi.verifyImageJobDraft({
    beforePlan: plan,
    afterPlan: { ...plan, enrichmentDraft: tampered },
    actions: firstPass.actions,
  });
  ok(!jobVerifyBad.ok, "unexpected KEEP media mutation is detected");
  ok(
    jobVerifyBad.failed.some((f) => /media_locked|noop_/i.test(f.code || "")),
    "failure cites locked/noop media check",
  );

  const textTampered = JSON.parse(JSON.stringify(firstPass.enrichmentDraft));
  if (!textTampered.activities[ACT_KEEP]) textTampered.activities[ACT_KEEP] = {};
  textTampered.activities[ACT_KEEP].steps = "Hijacked steps during image job";
  const nonMediaBad = imagesApi.verifyImageJobDraft({
    beforePlan: plan,
    afterPlan: { ...plan, enrichmentDraft: textTampered },
    actions: firstPass.actions,
  });
  ok(!nonMediaBad.ok, "non-media activity field mutation is detected");

  const titleTamperedPlan = {
    ...plan,
    title: "Hijacked Title",
    enrichmentDraft: firstPass.enrichmentDraft,
  };
  const titleBad = imagesApi.verifyImageJobDraft({
    beforePlan: plan,
    afterPlan: titleTamperedPlan,
    actions: firstPass.actions,
  });
  ok(!titleBad.ok, "lesson title mutation is detected");

  // Soft budget assessor still flags over-budget raw plans (safety net).
  // Ordinary runImagePlanForLesson must self-budget instead of SCOPE_REVIEW.
  const softCurriculum = seedCurriculum();
  const softPlan = softCurriculum.lessonPlans[0];
  const softActs = [];
  for (let i = 0; i < 12; i += 1) {
    const id = `cur-act-soft-${i}`;
    softActs.push({
      id,
      lessonPlanId: LESSON_ID,
      itemId: `soft${i}`,
      title: `Process Art Station ${i}`,
      dayOfWeek: "monday",
      category: "Art",
      objective: `Children will explore paint process art station ${i} with washable paint.`,
      materials: "Paint, paper, trays",
      setup: "Cover table; set trays.",
      steps: "1. Dip. 2. Stamp. 3. Describe.",
      imageRequirement: "required",
    });
  }
  softCurriculum.activities = softActs;
  softPlan.activityIds = softActs.map((a) => a.id);
  softPlan.enrichmentDraft = { week: {}, activities: {} };
  softPlan.dailyPlans = {
    monday: { items: softActs.map((a) => ({ itemId: a.itemId, title: a.title, dayOfWeek: "monday" })) },
    tuesday: { items: [] },
    wednesday: { items: [] },
    thursday: { items: [] },
    friday: { items: [] },
  };
  const softAudit = auditApi.auditLesson(softPlan, softCurriculum);
  const softRawActions = imagesApi.buildImageActionsFromAudit(softPlan, softActs, softAudit, {});
  const softPlanned = imagesApi.plannedGenerationCount(softRawActions);
  const softScope = imagesApi.assessImageScope({
    actions: softRawActions,
    lessonCount: 1,
    limits: { maxImageGenerations: 40 },
  });
  ok(softPlanned > 8, "soft fixture plans more generations than soft per-lesson budget");
  ok(softScope.ok === false && softScope.code === "SCOPE_REVIEW_REQUIRED", "raw assessor still flags over soft budget");
  const softGen = { calls: 0, prompts: [] };
  const softRun = await imagesApi.runImagePlanForLesson({
    plan: softPlan,
    activities: softActs,
    audit: softAudit,
    limits: { maxImageGenerations: 40 },
    lessonCount: 1,
    command: { rawCommand: "Finish this lesson and leave it ready for review. Do not publish." },
    callGenerate: mockGenerateFactory(softGen),
    uploadFn: mockUploadFactory({ calls: 0 }),
    mockGenerate: true,
  });
  ok(softRun.code !== "SCOPE_REVIEW_REQUIRED", "ordinary over-soft plan does not SCOPE_REVIEW after budgeting");
  ok(softRun.ok === true, "budgeted soft run succeeds");
  ok(softRun.generations <= 8 && softGen.calls <= 8, "soft budget caps actual generations at 8");
  ok(softRun.imageBudgetDiagnostics?.imageBudgetApplied === true, "imageBudgetApplied when candidates exceed budget");
  ok(
    softRun.imageBudgetDiagnostics?.finalGenerateCount + softRun.imageBudgetDiagnostics?.finalReplaceCount <= 8,
    "final GENERATE+REPLACE <= soft budget",
  );
  ok(
    schema.asArray(softRun.imageBudgetDiagnostics?.budgetDeferredActivityIds).length === softPlanned - 8,
    "excess candidates deferred, not dropped from plan",
  );
  ok(
    softRun.actions.filter((a) => a.decision === "NOT_NEEDED" && a.budgetDeferred).length === softPlanned - 8,
    "deferred candidates become typed NOT_NEEDED",
  );
  ok(
    softRun.actions.every((a) => a.decision !== "NOT_NEEDED" || a.reason),
    "NOT_NEEDED decisions retain reasons",
  );

  // --- Image soft-budget unit suite (15 / 11 / 8) ---
  const budgetSoftMax = imagesApi.SOFT_IMAGE_GENERATIONS_PER_LESSON;
  ok(budgetSoftMax === 8, "central soft max remains 8 (not raised)");

  function makeBudgetAction(id, decision, extra = {}) {
    return {
      activityId: id,
      activityTitle: extra.title || id,
      field: "setupImageUrl",
      decision,
      reason: extra.reason || `${decision} for ${id}`,
      materials: extra.materials || "",
      setup: extra.setup || "",
      ...extra,
    };
  }

  // 15 activities, 11 write candidates, budget 8
  const fifteenActs = [];
  for (let i = 0; i < 15; i += 1) fifteenActs.push({ id: `cur-act-bud-${String(i).padStart(2, "0")}`, title: `Act ${i}` });
  const elevenWrites = [
    makeBudgetAction("cur-act-bud-00", "REPLACE", { reason: "broken placeholder URL", title: "Broken setup" }),
    makeBudgetAction("cur-act-bud-01", "GENERATE", {
      title: "Invitation to Play Bakery Sensory Lab",
      materials: "flour bins trays scoops bowls spoons cups mats labels",
      setup: "Multi-step unusual sensory lab station layout",
      reason: "difficult multi-step setup needs visual",
    }),
    makeBudgetAction("cur-act-bud-02", "GENERATE", {
      title: "Process Art Mural Collage",
      category: "Art",
      reason: "finished process art example visual",
    }),
    makeBudgetAction("cur-act-bud-03", "GENERATE", {
      title: "Counted Tray Station",
      materials: "cups bowls spoons tongs mats trays labels cards beads",
      reason: "complex materials layout",
    }),
    makeBudgetAction("cur-act-bud-04", "GENERATE", {
      title: "Dramatic Play Bakery Counter",
      reason: "classroom implementation teacher value",
    }),
    makeBudgetAction("cur-act-bud-05", "GENERATE", { title: "Paint Mixing Table", reason: "optional art station" }),
    makeBudgetAction("cur-act-bud-06", "GENERATE", { title: "Dough Rolling Table", reason: "optional dough" }),
    makeBudgetAction("cur-act-bud-07", "GENERATE", { title: "Cookie Stamp Center", reason: "optional stamp" }),
    makeBudgetAction("cur-act-bud-08", "GENERATE", { title: "Flour Scoop Bin", reason: "lower priority optional" }),
    makeBudgetAction("cur-act-bud-09", "GENERATE", { title: "Cupcake Liner Sort", reason: "lower priority optional" }),
    makeBudgetAction("cur-act-bud-10", "GENERATE", { title: "Pretend Oven Cue", reason: "lower priority optional" }),
    makeBudgetAction("cur-act-bud-11", "KEEP", { reason: "existing useful image" }),
    makeBudgetAction("cur-act-bud-12", "NOT_NEEDED", { reason: "simple song" }),
    makeBudgetAction("cur-act-bud-13", "NOT_NEEDED", { reason: "simple transition" }),
    makeBudgetAction("cur-act-bud-14", "KEEP", { reason: "existing useful image 2" }),
  ];
  ok(elevenWrites.filter((a) => ["GENERATE", "REPLACE"].includes(a.decision)).length === 11, "fixture has 11 image write candidates");
  ok(fifteenActs.length === 15, "fixture has 15 activities");

  const budgetedOnce = imagesApi.applyImageGenerationSoftBudget(elevenWrites, {
    softMax: budgetSoftMax,
    activities: fifteenActs,
  });
  const budgetedTwice = imagesApi.applyImageGenerationSoftBudget(elevenWrites, {
    softMax: budgetSoftMax,
    activities: fifteenActs,
  });
  const writesAfter = budgetedOnce.actions.filter((a) => ["GENERATE", "REPLACE"].includes(a.decision));
  ok(writesAfter.length <= 8, "15/11/8 → final new generation count <= 8");
  ok(writesAfter.length === 8, "exactly 8 write decisions retained when 11 candidates");
  ok(budgetedOnce.diagnostics.imageCandidatesTotal === 11, "diagnostics imageCandidatesTotal=11");
  ok(budgetedOnce.diagnostics.imageBudget === 8, "diagnostics imageBudget=8");
  ok(budgetedOnce.diagnostics.plannedKeepCount === 2, "KEEP count unchanged and does not consume budget");
  ok(budgetedOnce.diagnostics.plannedGenerateCountBeforeBudget === 10, "plannedGenerateCountBeforeBudget");
  ok(budgetedOnce.diagnostics.plannedReplaceCountBeforeBudget === 1, "plannedReplaceCountBeforeBudget");
  ok(budgetedOnce.diagnostics.budgetSelectedActivityIds.length === 8, "budgetSelectedActivityIds length 8");
  ok(budgetedOnce.diagnostics.budgetDeferredActivityIds.length === 3, "budgetDeferredActivityIds length 3");
  ok(budgetedOnce.diagnostics.imageBudgetApplied === true, "imageBudgetApplied true for over-budget plan");
  ok(
    budgetedOnce.diagnostics.budgetSelectedActivityIds.includes("cur-act-bud-00"),
    "necessary REPLACE retained at top priority",
  );
  ok(
    budgetedOnce.diagnostics.budgetSelectedActivityIds.includes("cur-act-bud-01"),
    "difficult-setup GENERATE retained",
  );
  ok(
    budgetedOnce.diagnostics.budgetDeferredActivityIds.every((id) => (
      ["cur-act-bud-08", "cur-act-bud-09", "cur-act-bud-10"].includes(id)
    )),
    "lowest-priority optional candidates deferred",
  );
  ok(
    budgetedOnce.actions.filter((a) => a.budgetDeferred).every((a) => (
      a.decision === "NOT_NEEDED"
      && /image_budget_priority/.test(a.reason)
      && a.priorDecision === "GENERATE"
    )),
    "deferred become typed NOT_NEEDED with image_budget_priority",
  );
  ok(
    JSON.stringify(budgetedOnce.diagnostics.budgetSelectedActivityIds)
      === JSON.stringify(budgetedTwice.diagnostics.budgetSelectedActivityIds)
    && JSON.stringify(budgetedOnce.diagnostics.budgetDeferredActivityIds)
      === JSON.stringify(budgetedTwice.diagnostics.budgetDeferredActivityIds),
    "selection is deterministic across identical inputs",
  );
  ok(
    budgetedOnce.actions.filter((a) => a.decision === "KEEP").length === 2,
    "KEEP images remain KEEP and do not consume generation budget",
  );
  ok(
    new Set(budgetedOnce.diagnostics.budgetSelectedActivityIds).size === 8,
    "no duplicate generation requests among selected",
  );
  ok(
    budgetedOnce.actions.every((a) => /^cur-act-bud-/.test(a.activityId)),
    "image activity IDs remain exact activity IDs",
  );

  // <=8 candidates unchanged
  const seven = elevenWrites.slice(0, 7);
  const sevenBudget = imagesApi.applyImageGenerationSoftBudget(seven, { softMax: 8, activities: fifteenActs });
  ok(sevenBudget.diagnostics.imageBudgetApplied === false, "<=8 candidates remain unchanged (no deferral)");
  ok(sevenBudget.diagnostics.finalGenerateCount + sevenBudget.diagnostics.finalReplaceCount === 7, "seven writes stay seven");

  // exactly 8 candidates unchanged
  const eight = elevenWrites.slice(0, 8);
  const eightBudget = imagesApi.applyImageGenerationSoftBudget(eight, { softMax: 8, activities: fifteenActs });
  ok(eightBudget.diagnostics.imageBudgetApplied === false, "exactly 8 candidates remain unchanged");
  ok(eightBudget.diagnostics.finalGenerateCount + eightBudget.diagnostics.finalReplaceCount === 8, "eight writes stay eight");

  // Explicit full-coverage request still SCOPE_REVIEW
  const fullCoverageRun = await imagesApi.runImagePlanForLesson({
    plan: softPlan,
    activities: softActs,
    audit: softAudit,
    limits: { maxImageGenerations: 40 },
    lessonCount: 1,
    command: {
      rawCommand: "Generate a unique image for all 15 activities and leave ready for review. Do not publish.",
    },
    callGenerate: mockGenerateFactory({ calls: 0, prompts: [] }),
    uploadFn: mockUploadFactory({ calls: 0 }),
  });
  ok(fullCoverageRun.code === "SCOPE_REVIEW_REQUIRED", "explicit full image coverage still requires scope review");
  ok(fullCoverageRun.generations === 0, "explicit over-soft request does not generate");
  ok(fullCoverageRun.imageBudgetDiagnostics?.explicitFullCoverage === true, "diagnostics mark explicitFullCoverage");

  // Hard max still blocks (after soft budget, planned still above hard)
  const hardBlockRun = await imagesApi.runImagePlanForLesson({
    plan: softPlan,
    activities: softActs,
    audit: softAudit,
    limits: { maxImageGenerations: 5 },
    lessonCount: 1,
    command: { rawCommand: "Finish this lesson." },
    callGenerate: mockGenerateFactory({ calls: 0, prompts: [] }),
    uploadFn: mockUploadFactory({ calls: 0 }),
  });
  // softMax=8, hardMax=5: after soft budget → 8 writes still exceeds hard max 5 → block
  ok(hardBlockRun.ok === false, "hard max still blocks oversized plans");
  ok(hardBlockRun.imageBudgetDiagnostics?.blockedByHardMax === true, "diagnostics mark blockedByHardMax");
  ok(hardBlockRun.generations === 0, "hard max block spends zero generations");
  ok(
    (hardBlockRun.imageBudgetDiagnostics?.finalGenerateCount
      + hardBlockRun.imageBudgetDiagnostics?.finalReplaceCount) <= 8,
    "hard-max path still applied soft budget first",
  );

  // No image-per-activity: 15 activities never force 15 writes after budget
  ok(
    budgetedOnce.diagnostics.finalGenerateCount + budgetedOnce.diagnostics.finalReplaceCount < 15,
    "no image-per-activity behavior under soft budget",
  );

  // Printables independence: deferred image does not invent printable decisions
  ok(
    budgetedOnce.actions.every((a) => a.printableDecision == null && a.printable == null),
    "image budget path does not invent printable decisions",
  );

  // commandRequestsFullImageCoverage helper
  ok(
    imagesApi.commandRequestsFullImageCoverage({
      rawCommand: "Generate a unique image for all activities",
    }) === true,
    "full-coverage detector matches explicit all-activities request",
  );
  ok(
    imagesApi.commandRequestsFullImageCoverage({
      rawCommand: "Create a Preschool bakery lesson with 15 activities and leave it ready for review. Do not publish.",
    }) === false,
    "normal create command is not treated as full image coverage",
  );

  const hardCounter = { calls: 0, prompts: [] };
  const hardRun = await imagesApi.runImagePlanForLesson({
    plan,
    activities: curriculum.activities,
    audit,
    limits: { maxImageGenerations: 1 },
    replaceBadImages: true,
    callGenerate: mockGenerateFactory(hardCounter),
    uploadFn: mockUploadFactory({ calls: 0 }),
  });
  ok(hardCounter.calls <= 1, "hard max checked before each generation call");
  ok(hardRun.generations <= 1, "hard maxImageGenerations not exceeded");

  // Draft-save failure leaves prior draft intact
  let storeFail = {
    siteContent: {
      featureFlags: { teachingKitCurriculumOperator: true },
      curriculum: seedCurriculum(),
    },
    curriculumOperatorJobs: { jobs: [], updatedAt: "" },
  };
  const keepBeforeFail = storeFail.siteContent.curriculum.lessonPlans[0].enrichmentDraft.activities[ACT_KEEP].setupImageUrl;
  const badBeforeFail = storeFail.siteContent.curriculum.lessonPlans[0].enrichmentDraft.activities[ACT_BAD].setupImageUrl;
  const publishedBodyBefore = {
    weeklyOverview: storeFail.siteContent.curriculum.lessonPlans[0].weeklyOverview,
    status: storeFail.siteContent.curriculum.lessonPlans[0].status,
    setupOnCatalog: storeFail.siteContent.curriculum.activities.find((a) => a.id === ACT_KEEP).setupImageUrl,
  };
  const apiFail = createCurriculumOperatorApi({
    readJson: async () => ({}),
    jsonResponse: () => {},
    readStore: () => storeFail,
    writeStoreAsync: async (next) => { storeFail = next; },
    requireTeachingKitOwnerAdminSession: () => ({ email: OWNER.email }),
    teachingKit: require("./teaching-kit.js"),
    normalizeEmail: (v) => String(v || "").trim().toLowerCase(),
    readSiteCurriculum: (s) => s.siteContent.curriculum,
    generateOperatorImage: mockGenerateFactory({ calls: 0, prompts: [] }),
    persistEnrichmentPhoto: async () => ({ persistent: true, storage: "test" }),
    enrichmentMedia: {
      enrichmentMediaAssetId: () => `asset-fail-${Date.now()}`,
      enrichmentMediaUrl: (id, variant) => `https://cdn.example.test/${id}-${variant}.png`,
      buildEnrichmentVariants: async (buffer) => ({
        full: { buffer, mimeType: "image/png" },
        thumb: { buffer, mimeType: "image/png" },
      }),
    },
    saveOperatorEnrichmentDraft: async () => ({ ok: false, error: "simulated_draft_save_failure" }),
  });
  const failCmd = schema.normalizeOperatorCommand({
    rawCommand: "Fix pictures",
    intent: "finish_images",
    scope: { selection: "explicit_ids", lessonIds: [LESSON_ID], count: 1 },
    actions: { generateImages: true, replaceBadImages: true, saveDraft: true },
    completion: { phase: 3 },
  }, { phase: 3 });
  const failJob = jobApi.createJobFromPlan({
    command: failCmd,
    planSummary: apiFail.buildPlanSummary(failCmd, selectApi.selectLessons(storeFail.siteContent.curriculum, failCmd)),
    createdBy: OWNER.email,
    status: "running",
  });
  const failFinished = await apiFail.runJob(failJob, storeFail, OWNER.email);
  ok(failFinished.progress.failed === 1, "draft save failure records failed lesson");
  const afterFailPlan = storeFail.siteContent.curriculum.lessonPlans[0];
  ok(afterFailPlan.enrichmentDraft.activities[ACT_KEEP].setupImageUrl === keepBeforeFail, "save failure preserves KEEP image");
  ok(afterFailPlan.enrichmentDraft.activities[ACT_BAD].setupImageUrl === badBeforeFail, "save failure preserves REPLACE original");
  ok(afterFailPlan.weeklyOverview === publishedBodyBefore.weeklyOverview, "published weeklyOverview unchanged after save failure");
  ok(afterFailPlan.status === publishedBodyBefore.status, "publish status unchanged after save failure");
  ok(
    storeFail.siteContent.curriculum.activities.find((a) => a.id === ACT_KEEP).setupImageUrl === publishedBodyBefore.setupOnCatalog,
    "catalog/published activity image unchanged",
  );

  // Exact-id attach: refuse title/index style mismatch by using wrong id
  const wrongIdAttach = imagesApi.attachImageToEnrichmentDraft(
    { activities: { [ACT_PAINT]: { objective: "keep me" } } },
    {
      lessonId: LESSON_ID,
      expectedLessonId: LESSON_ID,
      activityId: "paint", // itemId-like, not cur-act id
      field: "setupImageUrl",
      mediaAssetId: "x",
      mediaUrl: "https://cdn.example.test/x.png",
      thumbUrl: "https://cdn.example.test/x-t.png",
    },
  );
  ok(wrongIdAttach.ok === true, "attach keys by provided activityId string only (no title remap)");
  ok(!wrongIdAttach.enrichmentDraft.activities[ACT_PAINT].setupImageUrl, "does not attach onto real activity via title/itemId guess");
  ok(wrongIdAttach.enrichmentDraft.activities.paint?.setupImageUrl, "writes only to the exact id key supplied");
  ok(wrongIdAttach.enrichmentDraft.activities[ACT_PAINT].objective === "keep me", "non-target activity fields untouched");

  // Prompt quality samples
  const skyPrompt = imagesApi.buildActivityImagePrompt({
    plan,
    activity: curriculum.activities.find((a) => a.id === ACT_PAINT),
    draftActivity: {},
    field: "setupImageUrl",
  });
  ok(/Paint the Real Sky/i.test(skyPrompt) && /paint|paper|brush/i.test(skyPrompt), "Paint the Real Sky prompt is activity-specific");
  ok(!/cute|clipart|cartoon weather/i.test(skyPrompt), "Paint the Real Sky prompt avoids generic clipart framing");

  console.log(`\nPhase 3 passed ${passed} assertions`);
}

main().catch((error) => {
  console.error("\nPhase 3 FAILED:", error);
  process.exit(1);
});
