#!/usr/bin/env node
/**
 * Visual prompt builder — asset-mode regression (prompts only, no image generation).
 * Run: npm run test:visual-prompt-builder
 */
"use strict";

const assert = require("node:assert/strict");
const builder = require("./visual-prompt-builder.js");
const images = require("./curriculum-operator-images.js");
const printableVisuals = require("./curriculum-operator-printable-visuals.js");

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function act(overrides = {}) {
  return {
    title: "Rolling Paint Tracks",
    category: "Art",
    objective: "Roll toy cars through washable paint to make tracks on paper.",
    description: "Children push cars through paint on a tray and onto paper.",
    materials: "Toy cars\nWashable paint\nPaper\nTrays\nSmocks",
    setup: "Low table with tray, paper taped beside tray, smocks nearby.",
    steps: "1. Dip wheels\n2. Roll on paper\n3. Change colors\n4. Wash hands",
    ...overrides,
  };
}

function plan(overrides = {}) {
  return {
    id: "cur-lp-fixture-lesson",
    title: "Maker Lab Fixture",
    age: "Toddler 12–24 Months",
    theme: "Making",
    ...overrides,
  };
}

function assertSpecificPhoto(bundle, activityTitle) {
  ok(/Documentary-style realistic/i.test(bundle.generationPrompt), `${activityTitle}: documentary standard`);
  ok(new RegExp(activityTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(bundle.generationPrompt),
    `${activityTitle}: title in prompt`);
  ok(/Exclude:/i.test(bundle.generationPrompt), `${activityTitle}: exclusions present`);
  ok(!builder.isGenericLegacyActivityPrompt(bundle.generationPrompt),
    `${activityTitle}: not legacy generic opener`);
  ok(builder.assessPromptQuality(bundle).ok, `${activityTitle}: quality assessment passes`);
}

function main() {
  console.log("Visual prompt builder tests");

  // Activity categories / ages
  assertSpecificPhoto(builder.buildVisualPrompt({
    assetMode: builder.ASSET_MODES.REALISTIC_ACTIVITY_PHOTO,
    ageBand: "Toddler 12–24 Months",
    activityTitle: "Dot Marker Color Pops Fixture",
    materials: "Dot markers, large paper, smocks",
    setup: "Low toddler table with large paper and chunky dot markers.",
    steps: "Press markers to make large colored circles.",
  }), "Dot Marker Color Pops Fixture");

  assertSpecificPhoto(builder.buildVisualPrompt({
    assetMode: builder.ASSET_MODES.REALISTIC_ACTIVITY_PHOTO,
    ageBand: "Infant 0–6 Months",
    activityTitle: "Scarf Pull Sensory",
    materials: "Scarves, basket",
    setup: "Floor mat with scarves in a soft basket.",
    steps: "Reach and pull scarves with teacher nearby.",
  }), "Scarf Pull Sensory");

  assertSpecificPhoto(builder.buildVisualPrompt({
    assetMode: builder.ASSET_MODES.REALISTIC_ACTIVITY_PHOTO,
    ageBand: "Preschool 3–4 Years",
    activityTitle: "Block Bridge Builders",
    materials: "Unit blocks, animals",
    setup: "Block area with bridge challenge cards.",
    steps: "Stack blocks to span two stools.",
  }), "Block Bridge Builders");

  assertSpecificPhoto(builder.buildVisualPrompt({
    assetMode: builder.ASSET_MODES.REALISTIC_ACTIVITY_PHOTO,
    ageBand: "Toddler 12–24 Months",
    activityTitle: "Toy Vet Clinic",
    materials: "Stuffed animals, bandages, bowls",
    setup: "Dramatic play vet table with props.",
    steps: "Wrap bandage; place animal in bed.",
  }), "Toy Vet Clinic");

  // Operator wrapper uses builder
  const wrapped = images.buildActivityImagePrompt({
    plan: plan(),
    activity: act({ title: "Paint the Real Sky" }),
    draftActivity: {},
    field: "setupImageUrl",
  });
  ok(/Paint the Real Sky/i.test(wrapped), "operator wrapper includes activity title");
  ok(/washable|paint|paper|tray/i.test(wrapped), "operator wrapper includes materials");
  ok(!/Realistic childcare classroom photograph for a /i.test(wrapped), "operator wrapper drops legacy opener");

  // Missing context reporting
  const sparse = builder.validatePromptContext({ activityTitle: "Only Title" });
  ok(!sparse.ok && sparse.missing.includes("materials_or_setup"), "missing materials/setup reported");

  // Unknown cross-lesson leak guard is upstream; prompt builder uses provided fields only
  const lessonA = builder.buildVisualPrompt({
    assetMode: builder.ASSET_MODES.REALISTIC_ACTIVITY_PHOTO,
    lessonTitle: "Lesson A",
    activityTitle: "Lesson A Activity",
    materials: "Blocks",
    setup: "Block shelf",
    steps: "Stack blocks",
  });
  ok(!/Lesson B/i.test(lessonA.generationPrompt), "no foreign lesson title in prompt");

  // Printable matrix (13 modes)
  const matrix = [
    ["REALISTIC_ACTIVITY_PHOTO", { assetMode: "REALISTIC_ACTIVITY_PHOTO", ageBand: "Toddler 12–24 Months", activityTitle: "Art Tray", materials: "Paint", setup: "Tray", steps: "Paint" }],
    ["REALISTIC_LESSON_COVER", { assetMode: "REALISTIC_LESSON_COVER", lessonTitle: "Weather Watchers", ageBand: "Preschool 3–4 Years", representativeActivityTitle: "Cloud Bin" }],
    ["TEACHING_CARD_ILLUSTRATED", { assetMode: "TEACHING_CARD_ILLUSTRATED", ageBand: "Preschool 3–4 Years", visualConcept: "happy face", printablePurpose: "emotion card" }],
    ["PICTURE_CARD_REALISTIC", { assetMode: "PICTURE_CARD_REALISTIC", ageBand: "Toddler 12–24 Months", visualConcept: "cardboard tube", printableTitle: "Maker Cards" }],
    ["ACTION_CARD_ILLUSTRATED", { assetMode: "ACTION_CARD_ILLUSTRATED", visualConcept: "squeeze play dough" }],
    ["VISUAL_STRIP", { assetMode: "VISUAL_STRIP", stepIndex: 2, stepLabel: "Add seed" }],
    ["DRAMATIC_PLAY_VISUAL", { assetMode: "DRAMATIC_PLAY_VISUAL", visualConcept: "Paint Station", ageBand: "Toddler 12–24 Months" }],
    ["MATCHING_SORTING_CARD", { assetMode: "MATCHING_SORTING_CARD", visualConcept: "rain boots", printablePurpose: "weather clothing match" }],
    ["HIGH_CONTRAST_INFANT", { assetMode: "HIGH_CONTRAST_INFANT", visualConcept: "bold spiral" }],
    ["PRINTABLE_CUTOUT", { assetMode: "PRINTABLE_CUTOUT", visualConcept: "large red apple", ageBand: "Preschool 3–4 Years" }],
    ["TEACHER_DOCUMENTATION_CARD", { assetMode: "TEACHER_DOCUMENTATION_CARD", ageBand: "Toddler 12–24 Months" }],
    ["printable wrapper", null],
    ["resolve action mode", { visualConcept: "stack blocks", printableTitle: "Prompt Cards" }],
  ];

  matrix.slice(0, 11).forEach(([label, input]) => {
    const bundle = builder.buildVisualPrompt(input);
    ok(Boolean(bundle.generationPrompt), `${label} produces prompt`);
    ok(bundle.negativePrompt.length > 20, `${label} has exclusions`);
    ok(bundle.textGeneratedByModel === false, `${label} text-free by default`);
  });

  const wrapperPrompt = printableVisuals.buildVisualPrompt({
    visualConcept: "cardboard tube",
    printableTitle: "Recycled Creation Station Cards",
    ageBand: "Toddler 12–24 Months",
    purpose: "Sorting cards for recycled materials",
    name: "cardboard tube",
  });
  ok(/cardboard tube/i.test(wrapperPrompt), "printable wrapper includes visual concept");
  ok(/embedded text|text-free|No embedded text/i.test(wrapperPrompt), "printable wrapper forbids generated text");

  const resolved = builder.resolvePrintableAssetMode({ visualConcept: "squeeze", printableTitle: "Process Prompt Cards" });
  ok(resolved === builder.ASSET_MODES.ACTION_CARD_ILLUSTRATED, "action concept resolves to action card mode");

  // Before/after guard
  ok(builder.isGenericLegacyActivityPrompt(
    "Realistic childcare classroom photograph for a Toddler 12–24 Months activity. Activity: “X”.",
  ), "detects legacy generic opener");

  console.log(`\n${passed} checks passed`);
}

main();
