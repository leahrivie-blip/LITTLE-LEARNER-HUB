#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const guidedImage = require("./curriculum-operator-guided-image-spec.js");
const images = require("./curriculum-operator-images.js");
const qaGate = require("./visual-attach-quality-gate.js");
const ageSafety = require("./curriculum-operator-guided-age-safety.js");

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

const brief = {
  guidedWorkflow: true,
  rawCommand: "Use this picture as a reference for the activity image. Exact picture instructions: no logos, match reference composition only.",
  ownerMaterials: {
    activities: [{ title: "pumpkin color sorting" }],
    ownerInstructions: ["Picture: no logos or text overlays, match the reference composition only"],
    images: [{ kind: "activity_reference", instructions: "reference" }],
  },
  requestedActivities: ["pumpkin color sorting", "a Halloween story walk"],
};

const pumpkin = { id: "cur-act-pumpkin", title: "Pumpkin color sorting", materials: "Paint", setup: "Bins", steps: "Sort" };
const storyWalk = {
  id: "cur-act-story",
  title: "Halloween Story Walk",
  materials: "5 large story sheets, crayons",
  setup: "Story pages along a floor path.",
  steps: "Walk and read each story stop.",
};

console.log("Guided owner brief scoping");
ok(
  /reference composition/i.test(guidedImage.guidedOwnerBriefForActivity({ brief, activity: pumpkin, concept: "Sort pumpkins.", field: "setupImageUrl" })),
  "reference composition kept on reference-target activity",
);
const storyBrief = guidedImage.guidedOwnerBriefForActivity({
  brief,
  activity: storyWalk,
  concept: "Story walk setup.",
  field: "setupImageUrl",
});
ok(!/match the reference composition only/i.test(storyBrief), "reference composition stripped from non-target activity");
ok(/story walk/i.test(storyBrief), "story walk activity-specific guidance");

console.log("Visual QA retry brief");
const retry = guidedImage.visualQaRetryOwnerBrief({
  blockReasons: ["Depicts a different activity than requested.", "materials_reasonably_match: only coloring sheets visible"],
  error: "blocked",
}, "Base brief.");
ok(/CORRECTION REQUIRED/i.test(retry) && /coloring sheets/i.test(retry), "QA feedback appended for retry prompt");

console.log("Image pipeline — QA block then retry pass");
(async () => {
  const plan = {
    id: "cur-lp-guided-img",
    title: "Halloween QA",
    age: "Preschool 3–5",
    enrichmentDraft: { week: {}, activities: {} },
  };
  const creationBrief = {
    ...brief,
    theme: "Halloween",
    title: "Halloween QA",
  };
  const audit = {
    assetPlan: [
      {
        activityId: pumpkin.id,
        image: { decision: "GENERATE", concept: "Pumpkin sorting table.", reason: "setup" },
      },
      {
        activityId: storyWalk.id,
        image: { decision: "GENERATE", concept: "Story walk path.", reason: "setup" },
      },
    ],
  };

  let genCalls = 0;
  let storyWalkQaPasses = 0;
  const run = await images.runImagePlanForLesson({
    plan,
    activities: [pumpkin, storyWalk],
    audit,
    creationBrief,
    limits: { maxImageGenerations: 8 },
    mockGenerate: true,
    visualAnalyzeFn: async ({ context }) => {
      if (/Story Walk/i.test(context.activityTitle || "")) {
        storyWalkQaPasses += 1;
        if (storyWalkQaPasses === 1) {
          return qaGate.mockVisionAnalyze(context, { mockScenario: "block_materials" });
        }
      }
      return qaGate.mockVisionAnalyze(context, { mockScenario: "pass" });
    },
    callGenerate: async () => {
      genCalls += 1;
      return { buffer: Buffer.alloc(128, 1), mimeType: "image/png" };
    },
    uploadFn: async ({ activityKey }) => ({
      mediaAssetId: `tk-enrich-${activityKey}`,
      mediaUrl: `https://cdn.example.test/${activityKey}.png`,
      thumbUrl: `https://cdn.example.test/${activityKey}-t.png`,
    }),
  });

  ok(run.ok, "guided image plan succeeds after QA retry");
  ok(genCalls >= 3, "regenerates failed activity once");
  ok(run.actions.filter((a) => a.status === "success").length === 2, "both activities attached");
  ok(!run.actions.some((a) => a.status === "failed"), "no failed image actions");

  console.log("Upload failure fails closed");
  const uploadFail = await images.runImagePlanForLesson({
    plan: { ...plan, enrichmentDraft: { week: {}, activities: {} } },
    activities: [pumpkin],
    audit: { assetPlan: [{ activityId: pumpkin.id, image: { decision: "GENERATE", concept: "x" } }] },
    limits: { maxImageGenerations: 3 },
    mockGenerate: true,
    skipVisualAttachQa: true,
    visualAnalyzeFn: async () => qaGate.mockVisionAnalyze({}, { mockScenario: "pass" }),
    callGenerate: async () => ({ buffer: Buffer.alloc(128, 2), mimeType: "image/png" }),
    uploadFn: async () => { throw new Error("upload rejected"); },
  });
  ok(!uploadFail.ok && uploadFail.actions[0].status === "failed", "upload failure fails closed");

  console.log("READY gate");
  ok(
    !ageSafety.readyForOwnerReviewGates({
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
      contentPersistenceIncomplete: false,
      printableOk: true,
      imagesOk: false,
    }),
    "failed required image blocks READY_FOR_OWNER_REVIEW",
  );

  console.log(`\nGuided image spec passed ${passed} assertions`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
