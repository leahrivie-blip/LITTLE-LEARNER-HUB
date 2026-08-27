#!/usr/bin/env node
/**
 * Visual production planning layer tests.
 * Run: npm run test:visual-production-plan
 *
 * Prompt/planning only — does not generate pixels or mutate production assets.
 */
"use strict";

const assert = require("node:assert/strict");
const plan = require("./lib/visual-production-plan.js");
const briefModel = require("./visual-production-brief.js");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function main() {
  console.log("\nVisual production planning tests\n");

  ok(typeof plan.planVisualProduction === "function", "planVisualProduction exported");
  ok(typeof briefModel.planVisualProduction === "function", "brief model re-exports planner");

  // TEST: Toddler truck painting
  const truck = plan.planVisualProduction({
    activityTitle: "Construction Truck Track Painting",
    ageBand: "Toddler 12–24 months",
    activityCategory: "Art",
    materials: "chunky toy trucks, washable paint, large butcher paper",
    whatChildrenDo: "Roll trucks through paint to make tracks on large paper",
    objective: "Explore cause/effect and large-motor mark making",
    useVisualPlan: true,
  });
  ok(truck.printableNeed === "PRINTABLE_NOT_NEEDED", "truck painting: printable not needed");
  ok(truck.plannedStyle === "PROCESS_ART_EXAMPLE" || truck.plannedStyle === "REALISTIC_ACTIVITY_PHOTO", "truck painting: realistic/process art style");
  ok(/truck|paint|paper/i.test(truck.sceneDescription), "truck painting: scene includes truck + paint + paper");
  ok(truck.ageBand === "toddler_12_24", "truck painting: toddler age band");
  ok(/worksheet|pencil|writing/i.test(truck.generationPrompt) === false || /no .*worksheet|avoid .*worksheet/i.test(truck.generationPrompt), "truck painting: no preschool worksheet requirement");
  ok(!/mandatory printable|must create printable/i.test(truck.generationPrompt), "truck painting: does not force a printable");

  // TEST: Share a Turn card
  const share = plan.planVisualProduction({
    activityTitle: "Share a Turn",
    ageBand: "preschool",
    activityCategory: "Social-Emotional",
    setSize: 12,
  });
  ok(share.printableNeed === "PRINTABLE_HELPFUL" || share.printableNeed === "PRINTABLE_REQUIRED", "Share a Turn: printable helpful/required");
  ok(/handing|exchange|toy|truck/i.test(share.sceneDescription), "Share a Turn: concrete toy exchange");
  ok(share.plannedStyle === "TEACHING_CARD_REALISTIC" || /ILLUSTRATION/.test(share.plannedStyle), "Share a Turn: realistic or educational illustration");
  ok(/bubble|circle head|rectangle body|Canva/i.test(share.generationPrompt), "Share a Turn: forbids bubble/geometric people");
  ok(/vary|diversity|skin tones|hair/i.test(share.diversityContext), "Share a Turn: set-level diversity instructions");
  ok(!/put every demographic|force all diversity dimensions into (this|each|every) (single )?image/i.test(share.diversityContext), "Share a Turn: diversity is set-level not tokenized");

  // TEST: Construction matching printable
  const matchCards = plan.planVisualProduction({
    activityTitle: "Construction Matching Cards",
    ageBand: "preschool",
    activityDescription: "Children match construction vehicle picture cards",
    materials: "matching picture cards",
    assetType: "PRINTABLE_CARDS",
    selectedStyle: "SOFT_EDUCATIONAL_ILLUSTRATION",
    setSize: 8,
  });
  ok(matchCards.printableNeed === "PRINTABLE_REQUIRED" || matchCards.printableNeed === "PRINTABLE_HELPFUL", "matching: printable warranted");
  ok(matchCards.plannedStyle === "SOFT_EDUCATIONAL_ILLUSTRATION", "matching: consistent educational illustration style");
  ok(/small printable-card size|readable at small|one primary subject/i.test(matchCards.generationPrompt), "matching: readable at small size");
  ok(/clutter|background/i.test(matchCards.generationPrompt), "matching: avoids complex background clutter");

  // TEST: Toddler block-carrying activity
  const carry = plan.planVisualProduction({
    activityTitle: "Block Carrying",
    ageBand: "Toddler 12–24 months",
    activityCategory: "Movement",
    materials: "lightweight large foam blocks",
    whatChildrenDo: "Carry one large lightweight block across the room",
  });
  ok(carry.printableNeed === "PRINTABLE_NOT_NEEDED", "block carrying: no automatic printable");
  ok(/REALISTIC|PROCESS/.test(carry.plannedStyle), "block carrying: realistic activity image can be suggested");
  ok(/lightweight|foam|block/i.test(carry.sceneDescription + carry.generationPrompt), "block carrying: lightweight toddler-safe blocks");

  // TEST: illustrated printable quality rules
  const illustrated = plan.buildVisualProductionPrompt({
    activityTitle: "Cheer a Friend",
    ageBand: "preschool",
    selectedStyle: "SOFT_EDUCATIONAL_ILLUSTRATION",
    sceneDescription: "One child clapping for a friend who finished stacking blocks",
    assetType: "PRINTABLE_CARDS",
    setSize: 6,
  });
  ok(/illustration/i.test(illustrated.generationPrompt), "illustrated: cartoons/illustration permitted");
  ok(/bubble heads|circle-head|Canva|clip art/i.test(illustrated.generationPrompt), "illustrated: bubble-vector fallback prohibited");
  ok(/hand-drawn|educational illustration|believable human proportions/i.test(illustrated.generationPrompt), "illustrated: educational illustration rules included");

  // TEST: resource set diversity
  const diversity = plan.buildDiversityContext({ setSize: 12 });
  ok(/across this set/i.test(diversity), "diversity: set-level instruction");
  ok(/do not force every demographic/i.test(diversity), "diversity: not all dimensions in every image");

  // TEST: age accuracy
  const toddlerPrompt = plan.planVisualProduction({
    activityTitle: "Sponge Brick Printing",
    ageBand: "toddler_12_24",
    materials: "large rectangular sponge, washable red paint, butcher paper",
  });
  ok(toddlerPrompt.ageBand === "toddler_12_24", "brick printing: toddler age");
  ok(/sponge|paint|paper|brick/i.test(toddlerPrompt.sceneDescription), "brick printing: materials in scene");
  ok(/No kindergarten worksheets|no .*worksheet|Avoid tiny/i.test(toddlerPrompt.generationPrompt), "age accuracy: toddler prompt blocks worksheets");

  // Clean Up scene normalization
  const clean = plan.normalizeScene({ activityTitle: "Clean Up" });
  ok(/basket|toy|cleanup|clean/i.test(clean.sceneDescription), "Clean Up normalized scene");

  // Community helper
  const helpers = plan.planVisualProduction({
    activityTitle: "Community Helper Pretend Play",
    ageBand: "preschool",
    activityCategory: "Dramatic Play",
    whatChildrenDo: "Pretend to be community helpers with simple props",
  });
  ok(helpers.printableNeed === "PRINTABLE_HELPFUL", "community helpers: printable helpful");
  ok(/dramatic|badge|menu|sign|helper/i.test(helpers.suggestedFormat + helpers.visualPurpose), "community helpers: dramatic-play format");

  // Owner override preserved
  const override = plan.planVisualProduction({
    activityTitle: "Block Carrying",
    ageBand: "toddler_12_24",
    printableNeed: "PRINTABLE_HELPFUL",
    selectedStyle: "REALISTIC_OBJECT_PHOTO",
  });
  ok(override.printableNeed === "PRINTABLE_HELPFUL", "owner printableNeed override works");
  ok(override.plannedStyle === "REALISTIC_OBJECT_PHOTO", "owner style override works");

  // Brief integration with useVisualPlan does not break farm path without plan flag
  const farm = briefModel.createVisualBriefFromInstruction({
    lessonId: "cur-lp-test",
    instruction: `Farm Sensory Bin:
Activity image.
Realistic daycare setup.
No children.
Clear shallow sensory bin filled with oats.`,
  });
  ok(farm.visualStyle === "REALISTIC_CLASSROOM", "farm path unchanged without useVisualPlan");
  ok(!farm.plannedVisualStyle, "farm has empty plannedVisualStyle when unplanned");

  const plannedBrief = briefModel.createVisualBriefFromInstruction({
    lessonId: "cur-lp-test",
    useVisualPlan: true,
    ageBand: "Toddler 12–24 months",
    materials: "chunky trucks, washable paint, large paper",
    instruction: `Construction Truck Track Painting:
Activity image.`,
  });
  ok(plannedBrief.printableNeed === "PRINTABLE_NOT_NEEDED", "planned brief stores printableNeed");
  ok(plannedBrief.plannedSceneDescription.length > 20, "planned brief stores scene");
  ok(plannedBrief.visualPlanVersion === plan.PLAN_VERSION, "planned brief stores plan version");

  // Research guidance never instructs copying
  ok(/never copy/i.test(helpers.researchGuidance) || /never copy/i.test(matchCards.researchGuidance), "research guidance forbids copying external designs");

  console.log(`\n${passed} assertions passed.\n`);
}

main();
