#!/usr/bin/env node
/**
 * Attach-time visual quality gate — prompt-only / mock vision QA (no live image generation).
 * Run: npm run test:visual-attach-quality-gate
 */
"use strict";

const assert = require("node:assert/strict");
const qaGate = require("./visual-attach-quality-gate.js");
const images = require("./curriculum-operator-images.js");
const printableVisuals = require("./curriculum-operator-printable-visuals.js");
const promptBuilder = require("./visual-prompt-builder.js");

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

const FIXTURE_BUFFER = printableVisuals.fixturePngBuffer();

async function testConsolidation() {
  console.log("Conservative verdict consolidation");
  const kind = "activity_photo";
  const base = {};
  qaGate.ACTIVITY_QA_CHECKS.forEach((id) => {
    base[id] = { id, pass: true, confidence: "high", note: "ok" };
  });
  const passAssessment = qaGate.normalizeVisionAssessment({
    checks: Object.fromEntries(qaGate.ACTIVITY_QA_CHECKS.map((id) => [id, { pass: true, confidence: "high" }])),
    blockReasons: [],
    recommendedVerdict: "PASS",
  }, kind);
  ok(qaGate.consolidateAttachVerdict(passAssessment, kind).verdict === qaGate.VERDICT.PASS,
    "all-high-confidence passes consolidate to PASS");

  const cartoonFail = { ...base };
  cartoonFail.not_cartoon_when_realistic_requested = {
    id: "not_cartoon_when_realistic_requested",
    pass: false,
    confidence: "high",
    note: "cartoon detected",
  };
  const cartoonAssessment = {
    checks: cartoonFail,
    blockReasons: [],
    recommendedVerdict: "BLOCK",
    parseOk: true,
  };
  ok(qaGate.consolidateAttachVerdict(cartoonAssessment, kind).verdict === qaGate.VERDICT.BLOCK,
    "critical cartoon failure blocks attach");

  const lowConf = { ...base };
  lowConf.depicts_requested_activity = {
    id: "depicts_requested_activity",
    pass: true,
    confidence: "low",
    note: "uncertain",
  };
  ok(qaGate.consolidateAttachVerdict({
    checks: lowConf,
    blockReasons: [],
    recommendedVerdict: "PASS",
    parseOk: true,
  }, kind).reviewRequired === true, "low confidence on critical check requires review/block");
}

async function testMockAssessments() {
  console.log("Mock vision assessments");
  const activityContext = {
    kind: "activity_photo",
    assetMode: promptBuilder.ASSET_MODES.REALISTIC_ACTIVITY_PHOTO,
    activityTitle: "Giant Floor Drawing",
    materials: "Large roll paper, Chunky washable crayons",
    setup: "Paper on floor with crayons in basket.",
    steps: "Children draw large marks on paper.",
    ageBand: "Toddler 12–24 Months",
  };

  const passResult = await qaGate.assessVisualAttachQuality({
    buffer: FIXTURE_BUFFER,
    context: activityContext,
    mock: true,
  });
  ok(passResult.ok && passResult.verdict === qaGate.VERDICT.PASS,
    "mock activity photo passes by default");
  ok(passResult.checks.length === qaGate.ACTIVITY_QA_CHECKS.length,
    "activity QA returns full check list");

  const cartoonBlock = await qaGate.assessVisualAttachQuality({
    buffer: FIXTURE_BUFFER,
    context: activityContext,
    mock: true,
    mockScenario: "block_cartoon",
  });
  ok(!cartoonBlock.ok && cartoonBlock.verdict === qaGate.VERDICT.BLOCK,
    "mock cartoon defect blocks realistic activity photo");
  ok(cartoonBlock.blockReasons.some((r) => /cartoon|not_cartoon/i.test(r)),
    "cartoon block includes reason");

  const printableContext = {
    kind: "printable_visual",
    assetMode: promptBuilder.ASSET_MODES.ACTION_CARD_ILLUSTRATED,
    printableTitle: "Process Maker Prompt Cards",
    visualSubject: "squeeze play dough",
    visualConcept: "squeeze play dough",
    ageBand: "Toddler 12–24 Months",
  };
  const printablePass = await qaGate.assessVisualAttachQuality({
    buffer: FIXTURE_BUFFER,
    context: printableContext,
    mock: true,
  });
  ok(printablePass.ok, "mock printable visual passes by default");

  const textBlock = await qaGate.assessVisualAttachQuality({
    buffer: FIXTURE_BUFFER,
    context: printableContext,
    mock: true,
    mockScenario: "block_text",
  });
  ok(!textBlock.ok && textBlock.code !== "visual_generation_failed",
    "baked text blocks printable attach");
  ok(textBlock.blockReasons.length > 0, "printable text block exposes reasons");

  const tiny = await qaGate.assessVisualAttachQuality({
    buffer: Buffer.from("tiny"),
    context: activityContext,
    mock: true,
  });
  ok(!tiny.ok && /buffer/i.test(tiny.error || ""), "tiny buffer blocked before analyze");
}

async function testImagePipelineIntegration() {
  console.log("Activity image pipeline integration");
  const plan = {
    id: "cur-lp-qa-gate-fixture",
    title: "Little Makers Workshop",
    age: "Toddler 12–24 Months",
    enrichmentDraft: { week: {}, activities: {} },
  };
  const activity = {
    id: "cur-act-qa-gate",
    title: "Giant Floor Drawing",
    category: "Art",
    materials: "Large roll paper, Chunky washable crayons",
    setup: "Paper taped to floor with crayons in low basket.",
    steps: "Children make large marks on paper.",
  };
  const audit = {
    assetPlan: [{
      activityId: activity.id,
      image: {
        decision: "GENERATE",
        reason: "Missing setup photo.",
        concept: "Floor drawing invitation with large paper and chunky crayons.",
      },
    }],
  };

  let uploadCalls = 0;
  const blocked = await images.runImagePlanForLesson({
    plan,
    activities: [activity],
    audit,
    limits: { maxImageGenerations: 5 },
    mockGenerate: true,
    visualAnalyzeFn: async ({ context }) => qaGate.mockVisionAnalyze(context, { mockScenario: "block_cartoon" }),
    uploadFn: async () => {
      uploadCalls += 1;
      return {
        mediaAssetId: "should-not-upload",
        mediaUrl: "https://cdn.example.test/should-not-upload.png",
        thumbUrl: "https://cdn.example.test/should-not-upload-t.png",
      };
    },
  });
  ok(!blocked.ok, "visual QA block fails image plan");
  ok(blocked.actions.some((a) => a.code === "visual_qa_blocked"), "failed action tagged visual_qa_blocked");
  ok(uploadCalls === 0, "blocked image never uploaded");

  let passUploads = 0;
  const passed = await images.runImagePlanForLesson({
    plan,
    activities: [activity],
    audit,
    limits: { maxImageGenerations: 5 },
    mockGenerate: true,
    visualAnalyzeFn: async ({ context }) => qaGate.mockVisionAnalyze(context, { mockScenario: "pass" }),
    uploadFn: async () => {
      passUploads += 1;
      return {
        mediaAssetId: "tk-enrich-qa-pass",
        mediaUrl: "https://cdn.example.test/qa-pass.png",
        thumbUrl: "https://cdn.example.test/qa-pass-t.png",
      };
    },
  });
  ok(passed.ok && passUploads === 1, "visual QA pass allows upload/attach");
  ok(passed.enrichmentDraft?.activities?.[activity.id]?.setupImageUrl?.includes("qa-pass"),
    "passed QA attaches media URL");
}

async function testPrintablePipelineIntegration() {
  console.log("Printable visual pipeline integration");
  const spec = {
    lessonId: "cur-lp-qa-gate-fixture",
    activityIds: ["cur-act-qa-gate"],
    title: "Process Maker Prompt Cards",
    purpose: "Prompt cards for maker actions.",
    pages: [{
      index: 1,
      type: "picture_cards",
      visualMode: "generated_asset",
      items: [{
        name: "squeeze play dough",
        visualConcept: "squeeze play dough",
      }],
    }],
  };
  const blocked = await printableVisuals.materializePrintableVisuals({
    spec,
    plan: { id: "cur-lp-qa-gate-fixture", age: "Toddler 12–24 Months" },
    activity: { id: "cur-act-qa-gate", title: "Sponge Squish Painting" },
    forceFixture: false,
    generateVisual: async () => ({ buffer: FIXTURE_BUFFER }),
    visualAnalyzeFn: async ({ context }) => qaGate.mockVisionAnalyze(context, { mockScenario: "block_subject" }),
  });
  ok(!blocked.ok && blocked.code === "visual_qa_blocked", "printable QA block stops materialize");

  const passed = await printableVisuals.materializePrintableVisuals({
    spec,
    plan: { id: "cur-lp-qa-gate-fixture", age: "Toddler 12–24 Months" },
    activity: { id: "cur-act-qa-gate", title: "Sponge Squish Painting" },
    forceFixture: false,
    generateVisual: async () => ({ buffer: FIXTURE_BUFFER }),
    visualAnalyzeFn: async ({ context }) => qaGate.mockVisionAnalyze(context, { mockScenario: "pass" }),
  });
  ok(passed.ok && passed.usage.generations === 1, "printable QA pass embeds generated visual");
}

async function testPromptFixturesStillSeparate() {
  console.log("Prompt builder modes remain separate from QA");
  const photoBundle = promptBuilder.buildVisualPrompt({
    assetMode: promptBuilder.ASSET_MODES.REALISTIC_ACTIVITY_PHOTO,
    ageBand: "Toddler 12–24 Months",
    activityTitle: "Sticky Wall Collage",
    materials: "Contact paper, Scraps, Tape",
    setup: "Sticky wall at child height.",
    steps: "Press scraps onto sticky wall.",
  });
  ok(qaGate.isRealisticActivityMode(photoBundle.assetMode), "activity photo mode flagged realistic");
  const printableMode = promptBuilder.resolvePrintableAssetMode({
    printableTitle: "Maker Station Signs",
    visualConcept: "paint station classroom sign icon",
  });
  ok(!qaGate.isRealisticActivityMode(printableMode), "printable dramatic-play mode is not activity photo");
}

async function main() {
  console.log("Visual attach quality gate tests");
  await testConsolidation();
  await testMockAssessments();
  await testImagePipelineIntegration();
  await testPrintablePipelineIntegration();
  await testPromptFixturesStillSeparate();
  console.log(`\n${passed} checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
