#!/usr/bin/env node
/**
 * Connected auto-apply image persistence → editable draft lesson records.
 * Run: npm run test:curriculum-operator-image-direct-draft
 */
"use strict";

const assert = require("node:assert/strict");
const imagesApi = require("./curriculum-operator-images.js");
const enrichmentMedia = require("../server/enrichment-media.js");
const qaGate = require("./visual-attach-quality-gate.js");

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

const LESSON_ID = "cur-lp-img-direct";
const ACT_A = "cur-act-img-a";
const ACT_B = "cur-act-img-b";
const OLD_ASSET = "tk-enrich-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NEW_ASSET = "tk-enrich-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function fixturePng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH26AAAAAElFTkSuQmCC",
    "base64",
  );
}

function seedPlan(overrides = {}) {
  return {
    id: LESSON_ID,
    title: "Image Direct Draft Fixture",
    age: "Toddler 12–24 Months",
    plan: "Free",
    status: "draft",
    resourceIds: ["cur-res-1"],
    enrichmentDraft: { week: {}, activities: {} },
    dailyPlans: {
      monday: {
        items: [{
          itemId: "item-a",
          title: "Giant Floor Drawing Fixture",
          setupImageUrl: enrichmentMedia.publicEnrichmentMediaUrl(OLD_ASSET, "full"),
          setupMediaAssetId: OLD_ASSET,
        }],
      },
      tuesday: {
        items: [{
          itemId: "item-b",
          title: "Other Activity",
          setupImageUrl: "",
        }],
      },
    },
    ...overrides,
  };
}

function seedActivities() {
  return [
    {
      id: ACT_A,
      lessonPlanId: LESSON_ID,
      itemId: "item-a",
      title: "Giant Floor Drawing Fixture",
      dayOfWeek: "monday",
      materials: "Large roll paper, Chunky washable crayons",
      setup: "Paper on floor",
      steps: "Draw large marks",
      setupImageUrl: enrichmentMedia.publicEnrichmentMediaUrl(OLD_ASSET, "full"),
      setupMediaAssetId: OLD_ASSET,
    },
    {
      id: ACT_B,
      lessonPlanId: LESSON_ID,
      itemId: "item-b",
      title: "Other Activity",
      dayOfWeek: "tuesday",
      materials: "blocks",
      setup: "shelf",
      steps: "build",
      setupImageUrl: "",
    },
  ];
}

async function main() {
  console.log("Connected image direct-draft persistence");

  // URL helpers
  const publicUrls = imagesApi.canonicalPublicActivityImageUrls(NEW_ASSET, enrichmentMedia);
  ok(publicUrls.mediaUrl.startsWith("/api/media/enrichment-photos/"), "D/L: canonical URL is public media path");
  ok(!imagesApi.isAdminOnlyEnrichmentMediaUrl(publicUrls.mediaUrl), "L: not admin-only URL");
  ok(imagesApi.isAdminOnlyEnrichmentMediaUrl("/api/admin/media/enrichment-photos/tk-enrich-x?variant=full"),
    "admin URL detector works");

  ok(imagesApi.commandRequestsConnectedAutoApply({
    actions: { connectedUpgrade: true, connectedAutoApply: true, publish: false },
  }) === true, "E: connectedAutoApply true detected");
  ok(imagesApi.commandRequestsConnectedAutoApply({
    actions: { connectedUpgrade: true, connectedAutoApply: false },
  }) === false, "C: connectedAutoApply false preserved");
  ok(imagesApi.commandRequestsConnectedAutoApply({
    actions: { planOnly: true, connectedUpgrade: true },
  }) === false, "D: planOnly disables connected auto-apply");

  // A — PASS → real draft activity updated with public URL
  console.log("\nA. connectedAutoApply PASS → lesson records");
  const plan = seedPlan();
  const activities = seedActivities();
  const audit = {
    assetPlan: [{
      activityId: ACT_A,
      image: {
        decision: "REPLACE",
        reason: "pilot replace",
        concept: "floor drawing",
        existingUrl: activities[0].setupImageUrl,
      },
    }],
  };
  let uploadCalls = 0;
  const passRun = await imagesApi.runImagePlanForLesson({
    plan,
    activities,
    audit,
    limits: { maxImageGenerations: 3 },
    replaceBadImages: true,
    mockGenerate: true,
    preferPublicMediaUrls: true,
    command: { actions: { connectedUpgrade: true, connectedAutoApply: true } },
    visualAnalyzeFn: async ({ context }) => qaGate.mockVisionAnalyze(context, { mockScenario: "pass" }),
    callGenerate: async () => ({ buffer: fixturePng(), mimeType: "image/png" }),
    uploadFn: async () => {
      uploadCalls += 1;
      return {
        mediaAssetId: NEW_ASSET,
        mediaUrl: enrichmentMedia.enrichmentMediaUrl(NEW_ASSET, "full"),
        thumbUrl: enrichmentMedia.enrichmentMediaUrl(NEW_ASSET, "thumb"),
      };
    },
  });
  ok(passRun.ok && uploadCalls === 1, "A: generation uploaded once on PASS");
  ok(passRun.actions[0].status === "success", "A: action success");
  ok(passRun.actions[0].usedPublicMediaUrl === true, "A: action stored public media URL");
  ok(!imagesApi.isAdminOnlyEnrichmentMediaUrl(passRun.actions[0].mediaUrl), "A/L: no admin URL on action");

  const applied = imagesApi.applySuccessfulImageActionsToLessonRecords({
    plan,
    activities,
    actions: passRun.actions,
    enrichmentMediaApi: enrichmentMedia,
  });
  ok(applied.ok && applied.applied.length === 1, "A: applied to lesson records");
  const liveA = applied.activities.find((a) => a.id === ACT_A);
  const liveB = applied.activities.find((a) => a.id === ACT_B);
  ok(liveA.setupImageUrl === publicUrls.mediaUrl, "A/M: normal lesson payload has public URL");
  ok(liveA.setupMediaAssetId === NEW_ASSET, "K: old image replaced on same activity");
  ok(liveA.id === ACT_A && applied.plan.id === LESSON_ID, "F/G: same activity + lesson IDs");
  ok(applied.plan.plan === "Free" && applied.plan.status === "draft", "H/E: Free + draft preserved");
  ok(!liveB.setupImageUrl, "N: other activity untouched");
  ok(
    applied.plan.dailyPlans.monday.items[0].setupImageUrl === publicUrls.mediaUrl,
    "A: dailyPlans item updated for classic/Teaching Kit editor",
  );

  const mirrored = imagesApi.mirrorAppliedImagesIntoEnrichmentDraft(
    passRun.enrichmentDraft,
    applied.applied.map((row) => ({ ...row, lessonId: LESSON_ID, expectedLessonId: LESSON_ID })),
  );
  ok(mirrored.activities?.[ACT_A]?.setupImageUrl === publicUrls.mediaUrl, "A: enrichmentDraft keeps review image");
  ok(mirrored.previewReady === true, "A: draft marked previewReady for owner review");

  const verified = imagesApi.verifyConnectedImageJobRecords({
    beforePlan: plan,
    afterPlan: { ...applied.plan, enrichmentDraft: mirrored },
    afterActivities: applied.activities,
    actions: passRun.actions,
  });
  ok(verified.ok, "A: connected verification passes");

  console.log("\nA2. published lesson keeps images on the same lesson draft only");
  const publishedPlan = seedPlan({ status: "published" });
  const publishedActs = seedActivities();
  const publishedApply = imagesApi.applySuccessfulImageActionsToLessonRecords({
    plan: publishedPlan,
    activities: publishedActs,
    actions: passRun.actions,
    enrichmentMediaApi: enrichmentMedia,
  });
  const publishedDraft = imagesApi.mirrorAppliedImagesIntoEnrichmentDraft(
    { week: {}, activities: {} },
    publishedApply.applied.map((row) => ({ ...row, lessonId: LESSON_ID, expectedLessonId: LESSON_ID })),
  );
  const publishedVerify = imagesApi.verifyConnectedImageJobRecords({
    beforePlan: publishedPlan,
    afterPlan: { ...publishedPlan, enrichmentDraft: publishedDraft },
    afterActivities: publishedActs,
    actions: passRun.actions.map((action) => ({
      ...action,
      previousUrl: publishedActs.find((a) => a.id === action.activityId)?.setupImageUrl || "",
    })),
  });
  ok(publishedDraft.activities?.[ACT_A]?.setupImageUrl === publicUrls.mediaUrl, "A2: published lesson draft has new photo");
  ok(publishedActs.find((a) => a.id === ACT_A)?.setupImageUrl !== publicUrls.mediaUrl, "A2: published live activity unchanged");
  ok(publishedVerify.ok, "A2: published review-draft verification passes");

  // B — BLOCK → activity unchanged
  console.log("\nB. connectedAutoApply BLOCK → no mutation");
  let blockedUploads = 0;
  const blockRun = await imagesApi.runImagePlanForLesson({
    plan: seedPlan(),
    activities: seedActivities(),
    audit,
    limits: { maxImageGenerations: 3 },
    replaceBadImages: true,
    mockGenerate: true,
    preferPublicMediaUrls: true,
    command: { actions: { connectedUpgrade: true, connectedAutoApply: true } },
    visualAnalyzeFn: async ({ context }) => qaGate.mockVisionAnalyze(context, { mockScenario: "block_cartoon" }),
    callGenerate: async () => ({ buffer: fixturePng(), mimeType: "image/png" }),
    uploadFn: async () => {
      blockedUploads += 1;
      return {
        mediaAssetId: NEW_ASSET,
        mediaUrl: enrichmentMedia.enrichmentMediaUrl(NEW_ASSET, "full"),
        thumbUrl: enrichmentMedia.enrichmentMediaUrl(NEW_ASSET, "thumb"),
      };
    },
  });
  ok(!blockRun.ok, "B: image plan fails on QA BLOCK");
  ok(blockedUploads === 0, "B: BLOCK prevents upload");
  ok(blockRun.actions.some((a) => a.code === "visual_qa_blocked"), "B: tagged visual_qa_blocked");
  const blockedApply = imagesApi.applySuccessfulImageActionsToLessonRecords({
    plan: seedPlan(),
    activities: seedActivities(),
    actions: blockRun.actions,
    enrichmentMediaApi: enrichmentMedia,
  });
  ok(blockedApply.applied.length === 0, "B: no lesson-record mutation on BLOCK");

  // C — connectedAutoApply false → legacy enrichmentDraft admin URL path
  console.log("\nC. connectedAutoApply=false → legacy enrichmentDraft");
  const legacy = await imagesApi.runImagePlanForLesson({
    plan: seedPlan(),
    activities: seedActivities(),
    audit,
    limits: { maxImageGenerations: 3 },
    replaceBadImages: true,
    mockGenerate: true,
    preferPublicMediaUrls: false,
    command: { actions: { connectedAutoApply: false, generateImages: true } },
    visualAnalyzeFn: async ({ context }) => qaGate.mockVisionAnalyze(context, { mockScenario: "pass" }),
    callGenerate: async () => ({ buffer: fixturePng(), mimeType: "image/png" }),
    uploadFn: async () => ({
      mediaAssetId: NEW_ASSET,
      mediaUrl: enrichmentMedia.enrichmentMediaUrl(NEW_ASSET, "full"),
      thumbUrl: enrichmentMedia.enrichmentMediaUrl(NEW_ASSET, "thumb"),
    }),
  });
  ok(legacy.ok, "C: legacy path succeeds");
  ok(imagesApi.isAdminOnlyEnrichmentMediaUrl(legacy.actions[0].mediaUrl), "C: enrichmentDraft keeps admin URL");
  ok(legacy.enrichmentDraft.activities[ACT_A].setupImageUrl.includes("/api/admin/media/"),
    "C: draft still has admin media URL");

  // J — idempotent retry of successful action
  console.log("\nJ. idempotent resume skip");
  const first = passRun.actions[0];
  const second = await imagesApi.runImagePlanForLesson({
    plan: { ...applied.plan, enrichmentDraft: mirrored },
    activities: applied.activities,
    audit,
    limits: { maxImageGenerations: 3 },
    replaceBadImages: true,
    mockGenerate: true,
    preferPublicMediaUrls: true,
    command: { actions: { connectedUpgrade: true, connectedAutoApply: true } },
    alreadySucceededKeys: new Set([first.idempotencyKey]),
    visualAnalyzeFn: async ({ context }) => qaGate.mockVisionAnalyze(context, { mockScenario: "pass" }),
    callGenerate: async () => ({ buffer: fixturePng(), mimeType: "image/png" }),
    uploadFn: async () => {
      throw new Error("should not upload on resume");
    },
  });
  ok(second.actions[0].status === "skipped", "J: successful key resume-skipped");
  ok(second.generations === 0, "J: no duplicate generation");

  // I — no duplicate attachment (single primary setup image)
  ok(
    Object.keys(liveA).filter((k) => /setupImageUrl|setupMediaAssetId/.test(k)).length >= 2
    && liveA.setupImageUrl === publicUrls.mediaUrl,
    "I: one primary setup image field on activity",
  );

  console.log(`\n${passed} checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
