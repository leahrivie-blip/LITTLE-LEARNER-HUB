#!/usr/bin/env node
/**
 * Teaching-card realistic prompt construction tests.
 * Run: node scripts/test-teaching-card-realistic-prompt.js
 *
 * Does not generate pixels, mutate printables, or touch production assets.
 */
"use strict";

const assert = require("node:assert/strict");
const teaching = require("./lib/visual-production-teaching-card-prompt.js");
const briefModel = require("./visual-production-brief.js");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function assertCardPrompt(title, expectations) {
  const built = teaching.buildTeachingCardImagePrompt({
    title,
    ageBand: "preschool",
    setting: "daycare",
    visualStyle: "TEACHING_CARD_REALISTIC",
  });
  const prompt = built.generationPrompt;
  const lower = prompt.toLowerCase();

  ok(built.visualStyle === "TEACHING_CARD_REALISTIC", `${title}: uses TEACHING_CARD_REALISTIC`);
  ok(built.preset === "teaching_card_realistic", `${title}: preset is teaching_card_realistic`);
  ok(built.styleValid === true, `${title}: styleValid`);
  ok(built.validationErrors.length === 0, `${title}: no validation errors`);
  ok(prompt !== title && prompt.length > title.length + 80, `${title}: prompt is not raw title only`);
  ok(/realistic candid daycare|realistic daycare|realistic preschool/i.test(prompt), `${title}: requests realistic daycare imagery`);
  ok(/flat vector|bubble characters|circle heads|rectangle bodies/i.test(prompt), `${title}: forbids flat vector / bubble people`);
  ok(!/require emoji|use cartoon|draw stick figures/i.test(prompt), `${title}: does not require cartoon/emoji style`);
  for (const snippet of expectations.mustInclude || []) {
    ok(lower.includes(snippet.toLowerCase()), `${title}: includes “${snippet}”`);
  }
  for (const snippet of expectations.mustNotInclude || []) {
    ok(!lower.includes(snippet.toLowerCase()), `${title}: excludes “${snippet}”`);
  }
  const gate = teaching.validateTeachingCardPromptConfig(built);
  ok(gate.ok, `${title}: validateTeachingCardPromptConfig passes`);
  return built;
}

function main() {
  console.log("\nTeaching-card realistic prompt tests\n");

  ok(briefModel.VISUAL_STYLES.includes("TEACHING_CARD_REALISTIC"), "VISUAL_STYLES includes TEACHING_CARD_REALISTIC");
  ok(briefModel.REALISTIC_STYLES.has("TEACHING_CARD_REALISTIC"), "TEACHING_CARD_REALISTIC is a realistic style");
  ok(typeof briefModel.buildTeachingCardImagePrompt === "function", "brief model exports buildTeachingCardImagePrompt");

  const share = assertCardPrompt("Share a Turn", {
    mustInclude: ["toy", "hand"],
  });
  ok(/handing|exchange|receiving|offer/i.test(share.sceneDescription), "Share a Turn: concrete child/toy exchange scene");

  const carry = assertCardPrompt("Help Carry", {
    mustInclude: ["carry"],
  });
  ok(/bin|foam block|carrying/i.test(carry.sceneDescription), "Help Carry: children/hands carrying classroom item");

  const clean = assertCardPrompt("Clean Up", {
    mustInclude: ["basket"],
  });
  ok(/placing|toy|storage|basket|cleanup/i.test(clean.sceneDescription), "Clean Up: placing toys into storage");

  const cheer = assertCardPrompt("Cheer a Friend", {
    mustInclude: ["clap"],
  });
  ok(/clapping|clap|encouragement|blocks/i.test(cheer.sceneDescription), "Cheer a Friend: natural clapping/encouragement");
  ok(!/emoji/i.test(cheer.generationPrompt) || /avoid[\s\S]*emoji/i.test(cheer.generationPrompt), "Cheer a Friend: emoji only appears as forbidden");

  // Hands fallback preferred over flat vector people
  const hands = teaching.buildTeachingCardImagePrompt({
    title: "Share a Turn",
    preferHandsFallback: true,
    visualStyle: "TEACHING_CARD_REALISTIC",
  });
  ok(hands.fallbackMode === "hands_and_objects", "Share a Turn hands fallback mode");
  ok(/hands/i.test(hands.sceneDescription), "hands fallback describes realistic hands");
  ok(!/circle head|rectangle body|bubble/i.test(hands.sceneDescription), "hands fallback is not bubble people");

  // Wrong style rejected by validator
  const bad = teaching.validateTeachingCardPromptConfig({
    visualStyle: "CLEAN_PRINTABLE",
    generationPrompt: "clean flat printable",
  });
  ok(bad.ok === false, "CLEAN_PRINTABLE fails teaching-card config validation");
  ok(bad.errors.includes("missing_teaching_card_realistic_preset"), "reports missing teaching_card_realistic preset");

  // Brief integration: short kindness/action labels resolve to teaching-card realistic
  const briefShare = briefModel.createVisualBriefFromInstruction({
    lessonId: "cur-lp-test-teaching-card",
    instruction: `Share a Turn:
Kindness mission cards.
Teaching card realistic.`,
  });
  ok(briefShare.visualStyle === "TEACHING_CARD_REALISTIC", "brief Share a Turn → TEACHING_CARD_REALISTIC");
  ok(briefShare.assetType === "PRINTABLE_CARDS", "brief Share a Turn → PRINTABLE_CARDS");
  ok(/toy|hand|exchange|handing/i.test(briefShare.generationPrompt), "brief prompt has concrete exchange scene");
  ok(/flat vector|bubble characters|circle heads/i.test(briefShare.generationPrompt), "brief prompt forbids bubble/vector people");
  ok(briefShare.teachingCardPreset === "teaching_card_realistic", "brief stores teachingCardPreset");
  ok(briefShare.realismLevel === "teaching_card_realistic", "brief realismLevel is teaching_card_realistic");

  const briefCarry = briefModel.createVisualBriefFromInstruction({
    lessonId: "cur-lp-test-teaching-card",
    instruction: `Help Carry:
Action cards.`,
  });
  ok(briefCarry.visualStyle === "TEACHING_CARD_REALISTIC", "brief Help Carry → TEACHING_CARD_REALISTIC");
  ok(/bin|foam|carry/i.test(briefCarry.generationPrompt), "brief Help Carry scene is concrete");

  // Unrelated paths unchanged: farm activity stays REALISTIC_CLASSROOM
  const farm = briefModel.createVisualBriefFromInstruction({
    lessonId: "cur-lp-test-visual-production",
    instruction: `Farm Sensory Bin:
Activity image.
Realistic daycare setup.
No children.
Clear shallow sensory bin filled with oats.`,
  });
  ok(farm.assetType === "ACTIVITY_IMAGE", "farm remains ACTIVITY_IMAGE");
  ok(farm.visualStyle === "REALISTIC_CLASSROOM", "farm remains REALISTIC_CLASSROOM");
  ok(farm.teachingCardPreset === "", "farm has no teaching-card preset");

  // Unrelated printable page stays CLEAN_PRINTABLE
  const apple = briefModel.createVisualBriefFromInstruction({
    lessonId: "cur-lp-test-visual-production",
    instruction: `Apple Handprint Tree:
Printable.
White page.
Simple brown tree trunk centered near bottom.
Large completely blank area above trunk for children's red/orange/yellow handprints.`,
  });
  ok(apple.visualStyle === "CLEAN_PRINTABLE", "apple handprint remains CLEAN_PRINTABLE");
  ok(apple.assetType === "PRINTABLE_PAGE" || apple.assetType === "HANDPRINT_FOOTPRINT_TEMPLATE", "apple remains printable/template asset");

  // Explicit CLEAN_PRINTABLE printable cards (vocab/object packs) stay flat when not a teaching-card concept
  const colorCards = briefModel.createVisualBriefFromInstruction({
    lessonId: "cur-lp-test-visual-production",
    assetType: "PRINTABLE_CARDS",
    visualStyle: "CLEAN_PRINTABLE",
    instruction: `Color Matching Cards:
Printable cards.
Clean printable.
Flat 2D illustration.
Red ball, blue block, yellow cup on white backgrounds.`,
  });
  ok(colorCards.visualStyle === "CLEAN_PRINTABLE", "object printable cards can still use CLEAN_PRINTABLE when explicit");

  console.log(`\n${passed} assertions passed.\n`);
}

main();
