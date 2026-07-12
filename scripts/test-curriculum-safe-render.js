#!/usr/bin/env node
/**
 * Regression: curriculum render paths must not throw on legacy/missing field shapes.
 * Run: node scripts/test-curriculum-safe-render.js
 */
const fs = require("fs");
const path = require("path");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
const safeValues = require("./curriculum-safe-values.js");
globalThis.CurriculumSafeValues = safeValues;
const viewer = require("./curriculum-lesson-viewer-render.js");
const previewMod = require("./curriculum-import-preview.js");

const ROOT = path.join(__dirname, "..");
const V3_FULL = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
const V1_LEGACY = path.join(ROOT, "scripts/curriculum-phase-2f-imports/01-infant-soft-sounds-free.txt");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoThrow(label, fn) {
  try {
    const result = fn();
    assert(!/Render failed/i.test(String(result || "")), `${label}: output mentions Render failed`);
    return result;
  } catch (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

function buildLegacyStringFieldsPlan(basePlan) {
  const plan = JSON.parse(JSON.stringify(basePlan));
  plan.learningDomains = "Science, Language & Literacy";
  plan.observationOpportunities = "Watch for curiosity.";
  const item = plan.dailyPlans.monday.items[0];
  item.learningGoals = "Goal one\nGoal two";
  item.learningDomains = "Physical Development, Social Emotional";
  item.objective = "Practice sorting.";
  item.description = "Short description.";
  item.observationOpportunities = "Note persistence.";
  item.setup = "Prepare bins.";
  item.teacherRole = "Model language.";
  item.steps = "1. Invite children.\n2. Observe.";
  plan.dailyPlans.monday.learningDomains = "Creative Arts";
  return plan;
}

function buildMissingOptionalPlan(basePlan) {
  const plan = safeValues.normalizeCurriculumLessonPlanForRender(basePlan);
  const item = plan.dailyPlans.monday.items[0];
  item.objective = "";
  item.description = "";
  item.observationOpportunities = "";
  item.setup = "";
  item.teacherRole = "";
  item.learningGoals = [];
  item.learningDomains = [];
  plan.observationOpportunities = "";
  plan.books = [];
  plan.songs = [];
  return plan;
}

function simulateAdminEditorRowHtml(item) {
  const goals = safeValues.curriculumAsStringArray(item.learningGoals);
  return goals.join("\n");
}

function simulateImportPreviewDomains(data) {
  return safeValues.curriculumAsStringArray(data.learningDomains).join(", ");
}

function main() {
  console.log("1) v3 brand-new lesson plan render safety");
  const v3Parsed = parseCurriculumLessonPlanImport(fs.readFileSync(V3_FULL, "utf8"), { existingItemIds: new Map() });
  assert(v3Parsed.ok, "v3 sample should parse");
  const v3Plan = safeValues.normalizeCurriculumLessonPlanForRender(v3Parsed.data);
  assertNoThrow("v3 viewer html", () => viewer.renderCurriculumLessonPlanHtml(v3Plan, { mode: "screen" }));
  assertNoThrow("v3 print html", () => viewer.renderCurriculumLessonPlanHtml(v3Plan, { mode: "print" }));
  assertNoThrow("v3 editor learning goals", () => simulateAdminEditorRowHtml(v3Plan.dailyPlans.monday.items[0]));
  assertNoThrow("v3 import preview domains", () => simulateImportPreviewDomains(v3Plan));

  console.log("2) legacy v1 lesson plan render safety");
  const v1Parsed = parseCurriculumLessonPlanImport(fs.readFileSync(V1_LEGACY, "utf8"), { existingItemIds: new Map() });
  assert(v1Parsed.ok, "v1 sample should parse");
  const v1Plan = safeValues.normalizeCurriculumLessonPlanForRender(v1Parsed.data);
  assertNoThrow("v1 viewer html", () => viewer.renderCurriculumLessonPlanHtml(v1Plan));

  console.log("3) legacy string-field shapes must not crash render helpers");
  const legacyPlan = buildLegacyStringFieldsPlan(v1Plan);
  assertNoThrow("legacy editor learning goals", () => simulateAdminEditorRowHtml(legacyPlan.dailyPlans.monday.items[0]));
  assertNoThrow("legacy import preview domains", () => simulateImportPreviewDomains(legacyPlan));
  assertNoThrow("legacy viewer html", () => viewer.renderCurriculumLessonPlanHtml(safeValues.normalizeCurriculumLessonPlanForRender(legacyPlan)));

  console.log("4) missing optional fields must render empty sections safely");
  const minimalPlan = buildMissingOptionalPlan(v3Plan);
  assertNoThrow("minimal viewer html", () => viewer.renderCurriculumLessonPlanHtml(minimalPlan));
  const preview = previewMod.buildCurriculumImportPreview(v1Parsed, {
    formatVersion: 1,
    existingPlans: [],
    editingLessonPlanId: "",
    existingActivities: [],
    proposedLessonPlanId: "test-plan",
  });
  assert(preview.canConfirm, "v1 preview should confirm");
  assertNoThrow("minimal activity card", () => viewer.curriculumLessonDayActivityCardHtml("plan-id", minimalPlan.dailyPlans.monday.items[0]));

  console.log("\nAll curriculum safe-render regression checks passed.");
}

try {
  main();
} catch (error) {
  console.error("\nFAIL:", error.message);
  process.exitCode = 1;
}
