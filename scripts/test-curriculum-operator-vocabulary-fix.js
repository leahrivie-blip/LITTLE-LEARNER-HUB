#!/usr/bin/env node
/**
 * Vocabulary audit/classification + requested-outcome verification (opjob_6397).
 * Run: npm run test:curriculum-operator-vocabulary-fix
 */
"use strict";

const assert = require("node:assert/strict");
const auditApi = require("./curriculum-operator-audit.js");
const commandApi = require("./curriculum-operator-command.js");
const composer = require("./curriculum-operator-ai-composer.js");
const lessonRead = require("./curriculum-operator-lesson-read.js");
const enrichment = require("./teaching-kit-enrichment.js");
const orchestrator = require("./curriculum-operator-orchestrator.js");
const { applySurgicalLessonIdentityFields } = require("./curriculum-surgical-lesson-identity.js");
const teachingKit = require("./teaching-kit.js");

const LMW_ID = "cur-lp-549b80f61dfa8d79";
const MALFORMED_CARD = { word: "art, create, explore, build, sticky, paper, press, paint" };
const VALID_CARDS = [
  { word: "press", definition: "Push down firmly." },
  { word: "stick", definition: "Attach one thing to another." },
  { word: "build", definition: "Stack or connect pieces." },
  { word: "paint", definition: "Spread color on a surface." },
];

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function surgicalDailyPlansMerge(existingPlan, incomingPlan) {
  return applySurgicalLessonIdentityFields({
    ...existingPlan,
    teachingKit: Object.prototype.hasOwnProperty.call(incomingPlan, "teachingKit")
      ? incomingPlan.teachingKit
      : existingPlan.teachingKit,
    learningDomains: Object.prototype.hasOwnProperty.call(incomingPlan, "learningDomains")
      ? incomingPlan.learningDomains
      : existingPlan.learningDomains,
    vocabularyWords: Object.prototype.hasOwnProperty.call(incomingPlan, "vocabularyWords")
      ? incomingPlan.vocabularyWords
      : existingPlan.vocabularyWords,
    dailyPlans: incomingPlan.dailyPlans,
    updatedAt: incomingPlan.updatedAt || existingPlan.updatedAt,
  }, incomingPlan);
}

function reloadNormalizedPlan(plan) {
  const overlay = teachingKit.normalizedTeachingKitOverlay(plan.teachingKit);
  return {
    ...plan,
    vocabularyWords: String(plan.vocabularyWords || ""),
    teachingKit: overlay || plan.teachingKit,
  };
}

function auditVocab(plan) {
  const audit = auditApi.auditLesson(plan, { activities: [], resources: [] });
  return audit.weeklyContent.find((f) => f.field === "vocabularyWords");
}

console.log("1) malformed combined word card → MALFORMED / REPLACE");
{
  const plan = {
    id: LMW_ID,
    vocabularyWords: "",
    teachingKit: { vocabCards: [MALFORMED_CARD] },
    enrichmentDraft: { week: {}, activities: {} },
  };
  const quality = lessonRead.classifyVocabularyQuality(plan, {});
  ok(quality.state === "MALFORMED", "malformed legacy card detected");
  ok(!lessonRead.isValidVocabularyCard(MALFORMED_CARD), "combined-word card invalid");
  const field = auditVocab(plan);
  ok(field?.decision === "REPLACE", "audit requests REPLACE for malformed vocabulary");
}

console.log("\n2) comma-separated combined card invalid");
{
  ok(lessonRead.isCombinedVocabularyList("art, create, explore, build"), "comma list detected");
  ok(!lessonRead.isCombinedVocabularyList("sticky paper"), "multi-word concept stays valid");
  ok(lessonRead.isValidVocabularyCard({ word: "paint brush" }), "paint brush remains valid");
}

console.log("\n3) valid cards → KEEP");
{
  const plan = {
    id: LMW_ID,
    vocabularyWords: "press, stick, build, paint",
    teachingKit: { vocabCards: VALID_CARDS },
    enrichmentDraft: { week: {}, activities: {} },
  };
  ok(lessonRead.classifyVocabularyQuality(plan, {}).state === "VALID", "valid structured vocabulary");
  ok(auditVocab(plan)?.decision === "KEEP", "valid vocabulary stays KEEP");
}

console.log("\n4) valid cards + empty plan string → SYNC repair");
{
  const plan = {
    id: LMW_ID,
    vocabularyWords: "",
    teachingKit: { vocabCards: VALID_CARDS },
    enrichmentDraft: { week: {}, activities: {} },
  };
  ok(lessonRead.classifyVocabularyQuality(plan, {}).state === "SYNC_NEEDED", "sync needed when plan string empty");
  ok(auditVocab(plan)?.decision === "FILL", "audit requests FILL to synchronize plan string");
}

console.log("\n5) string present + cards missing → repair");
{
  const plan = {
    id: LMW_ID,
    vocabularyWords: "press, stick, build",
    teachingKit: {},
    enrichmentDraft: { week: {}, activities: {} },
  };
  const quality = lessonRead.classifyVocabularyQuality(plan, {});
  ok(quality.state === "MISSING", "string-only legacy without cards is incomplete");
  ok(auditVocab(plan)?.decision === "FILL" || auditVocab(plan)?.decision === "REPLACE",
    "audit requests structured card repair");
}

console.log("\n6) unknown card shapes invalid");
{
  ok(!lessonRead.isValidVocabularyCard(null), "null invalid");
  ok(!lessonRead.isValidVocabularyCard({}), "empty object invalid");
  ok(!lessonRead.isValidVocabularyCard({ foo: "press" }), "unsupported shape invalid");
}

console.log("\n7) duplicate normalization");
{
  const cards = lessonRead.dedupeValidVocabularyCards([
    { word: "Paint", definition: "A" },
    { word: " paint ", definition: "B" },
    { word: "stick", definition: "C" },
  ]);
  ok(cards.length === 2, "Paint/paint deduped to one card");
}

console.log("\n8) explicit vocab repair request overrides malformed KEEP");
{
  const plan = {
    id: LMW_ID,
    vocabularyWords: "",
    teachingKit: { vocabCards: [MALFORMED_CARD] },
    enrichmentDraft: { week: {}, activities: {} },
  };
  const command = {
    rawCommand: "Repair missing authoritative plan.vocabularyWords on the draft.",
  };
  const field = auditApi.auditLesson(plan, { activities: [], resources: [] }, {
    command,
    explicitVocabularyRepair: true,
  }).weeklyContent.find((f) => f.field === "vocabularyWords");
  ok(field?.decision === "REPLACE", "explicit repair keeps malformed vocabulary in repair queue");
  const work = composer.collectWorkItems(plan, [], auditApi.auditLesson(plan, { activities: [], resources: [] }, { command }), {
    command,
  });
  ok(work.weekRequests.some((r) => r.field === "vocabCards"), "composer receives vocabCards work item");
}

console.log("\n9) requested repair unsatisfied → completed_with_gaps signal");
{
  const command = {
    rawCommand: "Repair missing authoritative plan.vocabularyWords and learningDomains.",
  };
  const check = lessonRead.verifyConnectedAutoApplyPersistence({
    beforePlan: { id: LMW_ID, learningDomains: [], vocabularyWords: "", teachingKit: { vocabCards: [MALFORMED_CARD] } },
    afterPlan: {
      id: LMW_ID,
      learningDomains: ["Creative Arts", "Physical Development"],
      vocabularyWords: "",
      teachingKit: { vocabCards: [MALFORMED_CARD] },
    },
    requestedFieldSuccess: [{ field: "learningDomains", action: "FILL" }],
    command,
  });
  ok(check.ok === false, "requested vocabulary repair unsatisfied fails verification");
  ok(check.mismatches.some((m) => m.code === "REQUESTED_REPAIR_UNSATISFIED" && m.field === "vocabulary"),
    "REQUESTED_REPAIR_UNSATISFIED emitted for vocabulary");
}

console.log("\n10) accepted change lost in save → PERSISTENCE_MISMATCH");
{
  const check = lessonRead.verifyConnectedAutoApplyPersistence({
    beforePlan: { id: LMW_ID, vocabularyWords: "", teachingKit: {} },
    afterPlan: { id: LMW_ID, vocabularyWords: "", teachingKit: {} },
    requestedFieldSuccess: [{ field: "vocabCards", action: "FILL" }],
    command: { rawCommand: "repair vocabulary" },
  });
  ok(check.mismatches.some((m) => m.code === "PERSISTENCE_MISMATCH"), "composer-accepted vocab loss is persistence mismatch");
}

console.log("\n11) narrow domains+vocab scope does not queue milestones");
{
  const plan = {
    id: LMW_ID,
    teachingKit: { milestones: ["Uses two hands to explore materials."] },
    enrichmentDraft: { week: {}, activities: {} },
  };
  const audit = auditApi.auditLesson(plan, { activities: [], resources: [] }, {
    weeklyFieldScope: ["learningDomains", "vocabCards"],
  });
  const milestones = audit.weeklyContent.find((f) => f.field === "milestones");
  ok(milestones?.decision === "KEEP", "milestones forced KEEP when out of narrow scope");
  ok(milestones?.reason.includes("Out of scope"), "milestones marked out of scope");
}

console.log("\n12) milestones read from teachingKit when week empty");
{
  const plan = {
    id: LMW_ID,
    teachingKit: { milestones: ["Uses two hands.", "Invites a peer.", "Names one action word."] },
    enrichmentDraft: { week: {}, activities: {} },
  };
  const milestones = auditApi.auditLesson(plan, { activities: [], resources: [] })
    .weeklyContent.find((f) => f.field === "milestones");
  ok(milestones?.decision === "KEEP", "teachingKit milestones prevent false FILL");
}

console.log("\n13) true narrow text-only sets checkImages/checkPrintables false");
{
  const parsed = commandApi.parseOperatorCommand(
    "Fix only learning domains and vocabulary. Do not touch images, cover, printables, songs.",
    { phase: 7, lessonPlans: [{ id: LMW_ID, title: "Little Makers Workshop" }], currentlySelectedLessonId: LMW_ID },
  );
  ok(parsed.command.actions.checkImages === false, "narrow text-only → checkImages=false");
  ok(parsed.command.actions.checkPrintables === false, "narrow text-only → checkPrintables=false");
  ok(Array.isArray(parsed.command.actions.weeklyFieldScope), "weeklyFieldScope parsed");
}

console.log("\n14) audit images but don't replace preserves checkImages=true");
{
  const parsed = commandApi.parseOperatorCommand(
    "Audit images but do not replace them. Do not touch printables.",
    { phase: 7, lessonPlans: [{ id: LMW_ID }], currentlySelectedLessonId: LMW_ID },
  );
  ok(parsed.command.actions.checkImages === true, "audit-only images keeps checkImages=true");
  ok(parsed.command.actions.touchImages === false, "audit-only images keeps touchImages=false");
}

console.log("\n15) vocabulary connected merge→save→reload round-trip");
{
  const existingPlan = {
    id: LMW_ID,
    vocabularyWords: "",
    teachingKit: { vocabCards: [MALFORMED_CARD] },
    dailyPlans: { monday: { items: [] }, tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] } },
  };
  const merged = enrichment.mergeDraftIntoPlan(existingPlan, [], {
    week: { vocabCards: VALID_CARDS },
    activities: {},
  });
  const incoming = { ...merged.plan, __llhSurgicalDailyPlans: true, dailyPlans: merged.plan.dailyPlans };
  const persisted = surgicalDailyPlansMerge(existingPlan, incoming);
  const reloaded = reloadNormalizedPlan(persisted);
  ok(String(reloaded.vocabularyWords || "").includes("press"), "plan.vocabularyWords synchronized after round-trip");
  ok((reloaded.teachingKit?.vocabCards || []).length >= 4, "structured vocabCards persist");
  ok((reloaded.teachingKit?.vocabCards || []).every((card) => lessonRead.isValidVocabularyCard(card)),
    "all persisted cards valid");
}

console.log("\n16) learningDomains control case unchanged");
{
  const existingPlan = {
    id: LMW_ID,
    learningDomains: [],
    vocabularyWords: "",
    dailyPlans: { monday: { items: [] }, tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] } },
  };
  const merged = enrichment.mergeDraftIntoPlan(existingPlan, [], {
    week: { learningDomains: ["Creative Arts", "Physical Development"] },
    activities: {},
  });
  const incoming = { ...merged.plan, __llhSurgicalDailyPlans: true, dailyPlans: merged.plan.dailyPlans };
  const reloaded = reloadNormalizedPlan(surgicalDailyPlansMerge(existingPlan, incoming));
  ok((reloaded.learningDomains || []).length >= 2, "learningDomains control case still persists");
}

console.log("\n17) vocab-only scope soft-skips activity echoes when upgradeActivities=false");
{
  const ACT_DOT = "cur-act-0199336343c8c28e";
  const plan = {
    id: LMW_ID,
    title: "Little Makers Workshop",
    vocabularyWords: "",
    teachingKit: { vocabCards: [MALFORMED_CARD] },
    enrichmentDraft: { week: {}, activities: {} },
    dailyPlans: {
      monday: { items: [{ itemId: ACT_DOT, title: "Dot Marker Color Pops" }] },
      tuesday: { items: [] },
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    },
  };
  const activities = [{
    id: ACT_DOT,
    lessonPlanId: LMW_ID,
    title: "Dot Marker Color Pops",
    objective: "Children press dot markers while teachers name colors.",
  }];
  const audit = auditApi.auditLesson(plan, { activities, resources: [] }, {
    weeklyFieldScope: ["vocabCards"],
  });
  const work = composer.collectWorkItems(plan, activities, audit, {
    upgradeLesson: true,
    upgradeActivities: false,
    weeklyFieldScope: ["vocabCards"],
  });
  ok(work.activityRequests.length === 0, "no activity mutation requests in vocab-only scope");
  ok(work.activityKeep.some((k) => k.activityId === ACT_DOT), "lesson activities registered as KEEP");
  const raw = JSON.stringify({
    lessonId: LMW_ID,
    weeklyChanges: {
      vocabCards: {
        action: "REPLACE",
        value: VALID_CARDS,
      },
    },
    activities: [{ activityId: ACT_DOT, changes: { objective: { action: "KEEP", value: "echo" } } }],
  });
  const validated = composer.validateComposerOutput(raw, work, plan);
  ok(validated.ok, "activity echo does not fail vocab-only composer validation");
  ok(validated.plan?.weeklyChanges?.vocabCards, "vocabCards mutation still accepted");
  ok(
    validated.diagnostics?.rejected?.some((r) => r.reason === "unrequested_activity" && r.field === ACT_DOT),
    "activity echo recorded as unrequested_activity",
  );
}

console.log(`\n${passed} assertions passed.`);
