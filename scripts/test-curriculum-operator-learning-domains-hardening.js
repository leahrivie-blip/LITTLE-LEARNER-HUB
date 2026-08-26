#!/usr/bin/env node
/**
 * Operator learningDomains hardening + LMW synthetic regression.
 * Run: npm run test:curriculum-operator-learning-domains-hardening
 */
"use strict";

const assert = require("node:assert/strict");
const composer = require("./curriculum-operator-ai-composer.js");
const upgradeApi = require("./curriculum-operator-upgrade.js");
const auditApi = require("./curriculum-operator-audit.js");
const learningDomainsApi = require("./curriculum-learning-domains.js");
const commandApi = require("./curriculum-operator-command.js");
const orchestrator = require("./curriculum-operator-orchestrator.js");
const schema = require("./curriculum-operator-schema.js");

const LMW_ID = "cur-lp-549b80f61dfa8d79";
const ACT_STRONG = "cur-act-0a02697c73ccac85";
const ACT_WEAK = "cur-act-374ff7ad30144089";

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function lmwPlan() {
  return {
    id: LMW_ID,
    title: "Little Makers Workshop",
    age: "Toddler 12–24 Months",
    theme: "Little Makers Workshop",
    plan: "Free",
    status: "draft",
    learningDomains: [],
    weeklyOverview: "Young toddlers explore process art and early building through drawing, paint, sticky collage, cardboard, tape, play dough, and safe recycled materials.",
    objectives: "Explore art and building materials through safe hands-on play.\nStrengthen hands and fingers through grasping, pressing, squeezing, sticking, and rolling.",
    weeklyMaterials: "Large paper rolls; chunky crayons; painter's tape\nWashable paint, sponges, big brushes, smocks",
    teacherPreparation: "Cover floors; stage one invitation at a time",
    familyConnection: "Share one process photo or artwork and explain that toddler art is about exploring materials.",
    enrichmentDraft: { week: {}, activities: {} },
    dailyPlans: {
      monday: { items: [{ itemId: "a1", title: "Giant Floor Drawing", dayOfWeek: "monday" }] },
      tuesday: { items: [{ itemId: "a2", title: "Sponge Squish Painting", dayOfWeek: "tuesday" }] },
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    },
    activityIds: [ACT_STRONG, ACT_WEAK],
  };
}

function lmwActivities() {
  return [
    {
      id: ACT_STRONG,
      lessonPlanId: LMW_ID,
      title: "Giant Floor Drawing",
      dayOfWeek: "monday",
      objective: "Children explore large-scale mark making on paper with chunky crayons while teachers narrate actions.",
      materials: "Large paper roll, chunky crayons, painter's tape",
      description: "Invite toddlers to make marks on floor paper while teachers stay nearby.",
      setup: "Tape paper to floor with painter's tape.",
      steps: "1. Invite children. 2. Model one mark. 3. Narrate actions.",
    },
    {
      id: ACT_WEAK,
      lessonPlanId: LMW_ID,
      title: "Recycled Creation Station",
      dayOfWeek: "friday",
      objective: "Children explore safe recycled materials with teacher support.",
      materials: "",
      description: "",
      setup: "",
      steps: "",
    },
  ];
}

function lmwAudit(plan, curriculum) {
  return auditApi.auditLesson(plan, curriculum);
}

console.log("1) Shared learningDomains normalization");
function testSharedNormalization() {
  const aliases = [
    ["Art", "Literacy", "Fine Motor"],
    ["social-emotional", "language and literacy", "math"],
    ["Creative Arts", "Physical Development"],
  ];
  aliases.forEach(([a, b, c]) => {
    const norm = learningDomainsApi.normalizeLearningDomainsValue([a, b, c]);
    ok(norm.ok === true, `aliases normalize: ${a}, ${b}, ${c}`);
    ok(norm.value.includes("Creative Arts") || norm.value.includes("Language & Literacy") || norm.value.includes("Physical Development"),
      `canonical values present for ${a}, ${b}, ${c}`);
  });

  ok(learningDomainsApi.normalizeLearningDomainsValue([]).repairable === true, "empty [] is repairable");
  ok(learningDomainsApi.normalizeLearningDomainsValue(["Not A Domain"]).ok === false, "unknown domain rejected");
  ok(learningDomainsApi.normalizeLearningDomainsValue(null).repairable === true, "null treated as empty/repairable");
  ok(learningDomainsApi.normalizeLearningDomainsValue({ bad: true }).ok === false, "object type rejected");
  ok(learningDomainsApi.normalizeLearningDomainsValue(["Art", "Art", "Creative Arts"]).value.length === 1, "duplicates removed");
}

console.log("\n2) Composer alias acceptance (production failure shape)");
function testComposerAliasAcceptance() {
  const plan = lmwPlan();
  const audit = {
    weeklyContent: [{ field: "learningDomains", decision: "FILL", reason: "Empty", preview: "" }],
    activityClassifications: [],
    songs: [],
    books: { decision: "KEEP" },
  };
  const work = composer.collectWorkItems(plan, lmwActivities(), audit, {
    upgradeLesson: true,
    upgradeActivities: false,
    touchSongs: false,
    touchBooks: false,
  });

  const raw = JSON.stringify({
    lessonId: LMW_ID,
    weeklyChanges: {
      learningDomains: {
        action: "FILL",
        value: ["Art", "Literacy", "Social-Emotional", "Fine Motor"],
      },
    },
    activities: [],
  });
  const validated = composer.validateComposerOutput(raw, work, plan);
  ok(validated.ok === true, "alias learningDomains accepted without repair");
  ok(validated.plan.weeklyChanges.learningDomains.value.includes("Creative Arts"), "Art → Creative Arts");
  ok(validated.plan.weeklyChanges.learningDomains.value.includes("Language & Literacy"), "Literacy → Language & Literacy");
  ok(validated.plan.weeklyChanges.learningDomains.value.includes("Social Emotional"), "Social-Emotional → Social Emotional");
  ok(validated.plan.weeklyChanges.learningDomains.value.includes("Physical Development"), "Fine Motor → Physical Development");
}

console.log("\n3) Empty learningDomains bounded repair");
async function testEmptyRepair() {
  const plan = lmwPlan();
  const audit = lmwAudit(plan, { activities: lmwActivities(), resources: [] });
  let aiCalls = 0;
  const composed = await composer.composeUpgradeContent({
    plan,
    activities: lmwActivities(),
    audit,
    callAi: async (_sys, user) => {
      aiCalls += 1;
      if (aiCalls === 1) {
        return JSON.stringify({
          lessonId: LMW_ID,
          weeklyChanges: {
            learningDomains: { action: "FILL", value: [] },
            vocabCards: { action: "FILL", value: ["press", "stick", "roll", "squeeze"] },
          },
          activities: [],
        });
      }
      return composer.buildOperatorAiFixtureResponse(user);
    },
    touchSongs: false,
    touchBooks: false,
  });
  ok(composed.ok === true, "empty learningDomains repaired in bounded second pass");
  ok(composed.repairUsed === true, "repair pass used");
  ok(composed.usage.repairCalls === 1, "exactly one repair call");
  ok(composed.validatedPlan?.weeklyChanges?.learningDomains?.value?.length >= 2,
    "repaired learningDomains has canonical values");
  ok(composed.validatedPlan?.weeklyChanges?.vocabCards, "vocabCards preserved from first pass");
}

console.log("\n4) Invalid learningDomains still blocks");
function testInvalidBlocks() {
  const plan = lmwPlan();
  const audit = {
    weeklyContent: [{ field: "learningDomains", decision: "FILL", reason: "Empty", preview: "" }],
    activityClassifications: [],
    songs: [],
    books: { decision: "KEEP" },
  };
  const work = composer.collectWorkItems(plan, [], audit, {
    upgradeLesson: true,
    upgradeActivities: false,
    touchSongs: false,
    touchBooks: false,
  });
  const raw = JSON.stringify({
    lessonId: LMW_ID,
    weeklyChanges: {
      learningDomains: { action: "FILL", value: ["Quantum Physics", "Underwater Basket Weaving"] },
    },
    activities: [],
  });
  const validated = composer.validateComposerOutput(raw, work, plan, { collectRepairableThinFailures: true });
  ok(validated.ok === false, "unsupported domains block job");
  ok(validated.code === "invalid_change", "invalid_change code for unknown domains");
  ok(String(validated.error).includes("learningDomains"), "structured learningDomains error");
}

console.log("\n5) Failed validation leaves draft unchanged (atomicity)");
async function testAtomicity() {
  const plan = lmwPlan();
  const audit = lmwAudit(plan, { activities: lmwActivities(), resources: [] });
  const beforeDraft = JSON.stringify(plan.enrichmentDraft);
  const built = await upgradeApi.buildUpgradeDraft(plan, { activities: lmwActivities(), resources: [] }, audit, {
    callAi: async () => JSON.stringify({
      lessonId: LMW_ID,
      weeklyChanges: {
        learningDomains: { action: "FILL", value: ["Not A Real Domain"] },
      },
      activities: [],
    }),
    touchSongs: false,
    touchBooks: false,
  });
  ok(built.aiFailed === true, "invalid domains fail upgrade");
  ok(JSON.stringify(built.enrichmentDraft || {}) === beforeDraft || built.changed.length === 0,
    "failed validation does not mutate draft");
}

console.log("\n6) LMW command routing synthetic regression");
function testLmwRouting() {
  const raw = [
    `Continue upgrading the EXISTING lesson plan: Little Makers Workshop Lesson ID: ${LMW_ID}`,
    "Keep Free, keep draft, do not publish, save directly to editable draft.",
    "Repair learning domains and vocabulary. Do not touch printables.",
    "Replace weak activity images. REALISTIC_LESSON_COVER.",
  ].join(" ");
  const parsed = commandApi.parseOperatorCommand(raw, {
    phase: 7,
    lessonPlans: [{ id: LMW_ID, title: "Little Makers Workshop", plan: "Free", age: "Toddler 12–24 Months" }],
    currentlySelectedLessonId: null,
  });
  const actions = parsed.command.actions;
  ok(actions.connectedUpgrade === true, "connectedUpgrade=true");
  ok(actions.connectedAutoApply === true, "connectedAutoApply=true");
  ok(actions.touchPrintables === false, "touchPrintables=false");
  ok(actions.generatePrintables !== true, "generatePrintables=false");
  ok(actions.checkPrintables !== true, "checkPrintables=false");
  ok(actions.touchCover === true, "touchCover=true");
  const scope = orchestrator.normalizeKitScopeFlags(actions);
  ok(scope.printables === false, "printables excluded from kit scope");
  ok(scope.locks.printables === true, "printables locked");
}

console.log("\n7) System prompt lists approved domains");
function testSystemPrompt() {
  const sys = composer.buildComposerSystemPrompt("Toddler 12–24 Months");
  ok(/Social Emotional/.test(sys) && /Creative Arts/.test(sys), "system prompt includes approved domain labels");
}

console.log("\n8) Contract fuzz inputs");
function testFuzz() {
  const cases = [
    { input: null, expectRepairable: true },
    { input: [], expectRepairable: true },
    { input: [""], expectRepairable: true },
    { input: ["  art  ", "ART", "Creative Arts"], expectOk: true, expectCount: 1 },
    { input: ["social emotional development"], expectOk: true },
    { input: { x: 1 }, expectOk: false, expectRepairable: false },
  ];
  cases.forEach((row, idx) => {
    const norm = learningDomainsApi.normalizeLearningDomainsValue(row.input);
    if (row.expectOk) {
      ok(norm.ok === true, `fuzz ${idx}: accepts normalized input`);
      if (row.expectCount) ok(norm.value.length === row.expectCount, `fuzz ${idx}: deduped count`);
    } else if (row.expectRepairable) {
      ok(norm.repairable === true, `fuzz ${idx}: repairable empty input`);
    } else {
      ok(norm.ok === false && norm.repairable === false, `fuzz ${idx}: hard reject`);
    }
  });
}

async function main() {
  testSharedNormalization();
  testComposerAliasAcceptance();
  testInvalidBlocks();
  await testEmptyRepair();
  await testAtomicity();
  testLmwRouting();
  testSystemPrompt();
  testFuzz();
  console.log(`\n${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
