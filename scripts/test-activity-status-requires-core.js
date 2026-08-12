#!/usr/bin/env node
/**
 * Regression: sidebar activityStatus must not say "complete" when core fields are blank.
 */
"use strict";

const assert = require("node:assert/strict");
const enrichment = require("./teaching-kit-enrichment.js");

const baseActivity = {
  id: "cur-act-test-core-gate",
  itemId: "item-test-core-gate",
  title: "Rainbow Scarf Visual Tracking",
  dayOfWeek: "monday",
  activityCategory: "Sensory Play",
  objective: "Develop visual tracking skills using colorful moving objects.",
  description: "Infants observe brightly colored scarves moving through their visual field.",
  materials: "Rainbow scarves\nSoft floor mat",
  setup: "Place infants comfortably on a floor mat in a quiet area.",
  steps: "1. Position infant comfortably.\n2. Hold scarf within visual range.\n3. Slowly move scarf.",
  safetyNotes: "Supervise closely.",
  observationOpportunities: "Follows scarf with eyes",
  // Intentionally blank core fields:
  ageModifications: "",
  durationMinutes: null,
  preparation: "",
  teacherLanguage: "",
  cleanupTips: "",
};

const tipOnlyDraft = {
  teacherTips: ["Cleanup tip that used to mark Complete"],
  observationPrompts: ["Looks at scarf"],
  vocabulary: ["look"],
  imageRequirement: "not_needed",
};

const statusTipOnly = enrichment.activityStatus(baseActivity, tipOnlyDraft);
assert.notEqual(
  statusTipOnly,
  "complete",
  "tips/photos alone must not mark Complete while recommended age/duration/prep/language/cleanup are blank",
);
assert.equal(statusTipOnly, "in_progress");

const completeDraft = {
  ...tipOnlyDraft,
  ageModifications: "Infant 0–6 months",
  durationMinutes: 3,
  preparation: "Choose one clean scarf.\nInspect for loose threads.",
  teacherLanguage: "Look at the bright scarf.\nYou watched it!",
  cleanupTips: "Sanitize if mouthed.",
  dayOfWeek: "monday",
  title: baseActivity.title,
  activityCategory: baseActivity.activityCategory,
  objective: baseActivity.objective,
  description: baseActivity.description,
  materials: baseActivity.materials,
  setup: baseActivity.setup,
  steps: baseActivity.steps,
  safetyNotes: baseActivity.safetyNotes,
  observationOpportunities: baseActivity.observationOpportunities,
};

const core = enrichment.computeActivityCompletion(baseActivity, completeDraft, { age: "Infant 0–6 Months" });
assert.equal(core.percent, 100, "core fields should be complete in fixture");
const statusFull = enrichment.activityStatus(baseActivity, completeDraft);
assert.equal(statusFull, "complete", "core + tips + images-not-needed should be complete");

console.log("OK test-activity-status-requires-core");
