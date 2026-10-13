/**
 * Age-band and safety validation for guided owner-supplied activities (deterministic).
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const knowledge = require("./curriculum-operator-childcare-knowledge.js");
const knowledgeProfile = require("./curriculum-operator-knowledge-profile.js");

function text(value, max = 2000) {
  return schema.text(value, max);
}

const CHOKING_RE = /\b(bead|popcorn|grape|hot dog|coin|button battery|small marble|tiny pom|sequin)\b/i;
const SCISSOR_RE = /\b(scissor|cut out|cutting worksheet)\b/i;
const FOOD_RE = /\b(taste|snack|peanut|nut|dairy|allerg|food)\b/i;
const WATER_RE = /\b(water table|sink play|splash|pool|water bead)\b/i;
const OUTDOOR_RE = /\b(outdoor|playground|climb|tricycle)\b/i;
const SENSORY_RE = /\b(slime|glitter|shaving cream|scented)\b/i;
const INFANT_BAD_RE = /\b(worksheet|write the letter|essay|independent research|tiny bead)\b/i;

function validateActivityIdea({ ageBand, title, materialsText = "", ownerInstructions = "" }) {
  const blob = `${title} ${materialsText} ${ownerInstructions}`.toLowerCase();
  const band = knowledge.mapSchemaAgeBand(ageBand);
  const safetyWarnings = [];
  const uncertainties = [];
  const flags = [];

  if (ageBand === "infant" && INFANT_BAD_RE.test(blob)) {
    flags.push("infant_inappropriate");
    safetyWarnings.push(`"${title}" may not fit infants 0–12 months (worksheets/precise tools).`);
  }
  if ((ageBand === "infant" || ageBand === "toddler") && CHOKING_RE.test(blob)) {
    flags.push("choking_risk");
    safetyWarnings.push(`Review choking hazards for "${title}" with ${band.label}.`);
  }
  if (SCISSOR_RE.test(blob) && (ageBand === "infant" || ageBand === "young_toddler")) {
    flags.push("scissors_unlikely");
    safetyWarnings.push(`Scissors/cutting may be inappropriate for ${band.label} without explicit owner override.`);
  }
  if (FOOD_RE.test(blob) && !/allerg/i.test(blob)) {
    uncertainties.push(`Food-related activity "${title}" — confirm allergy policies and substitutions.`);
  }
  if (WATER_RE.test(blob)) {
    safetyWarnings.push(`Water play in "${title}" requires active supervision per ${band.label}.`);
    flags.push("water_supervision");
  }
  if (OUTDOOR_RE.test(blob)) {
    flags.push("outdoor_supervision");
  }
  if (SENSORY_RE.test(blob) && ageBand === "infant") {
    uncertainties.push(`Sensory materials in "${title}" — confirm mouthing-safe options for infants.`);
  }
  if (!ageBand) {
    uncertainties.push(`Age band missing — cannot fully validate "${title}".`);
  }

  const profileSafety = knowledgeProfile.safetyFlagsFromKnowledge({
    ageBand,
    title,
    materialsText,
    ownerInstructions,
  });
  profileSafety.flags.forEach((f) => flags.push(f));
  profileSafety.notes.forEach((n) => safetyWarnings.push(n));

  return {
    title,
    ok: !flags.includes("infant_inappropriate"),
    flags,
    safetyWarnings,
    uncertainties,
  };
}

function validateGuidedBrief(brief) {
  const ageBand = text(brief?.ageBand, 40).toLowerCase();
  const activities = schema.asArray(brief?.ownerMaterials?.activities);
  const perActivity = activities.map((a) => validateActivityIdea({
    ageBand,
    title: a.title,
    materialsText: schema.asArray(brief?.ownerMaterials?.materials).join(" "),
    ownerInstructions: text(a.ownerInstructions, 500),
  }));
  const allWarnings = perActivity.flatMap((r) => r.safetyWarnings);
  const allUncertainties = perActivity.flatMap((r) => r.uncertainties);
  const hardFails = perActivity.filter((r) => !r.ok);
  return {
    ok: hardFails.length === 0,
    ageBand,
    ageLabel: knowledge.mapSchemaAgeBand(ageBand).label,
    perActivity,
    safetyWarnings: [...new Set(allWarnings)],
    uncertainties: [...new Set(allUncertainties)],
    needsOwnerInput: !ageBand ? ["age_band"] : [],
  };
}

function validateLessonActivities({ brief, activities = [] }) {
  const ageBand = text(brief?.ageBand, 40).toLowerCase();
  const issues = [];
  const safetyWarnings = [];
  const uncertainties = [];
  schema.asArray(activities).forEach((act) => {
    const r = validateActivityIdea({
      ageBand,
      title: text(act.title, 180),
      materialsText: text(act.materials, 600),
      ownerInstructions: "",
    });
    r.flags.forEach((f) => issues.push(`${f}:${act.id || act.title}`));
    safetyWarnings.push(...r.safetyWarnings);
    uncertainties.push(...r.uncertainties);
    const missing = [];
    if (!text(act.objective, 20)) missing.push("objective");
    if (!text(act.steps, 20)) missing.push("steps");
    if (!text(act.safetyNotes, 10)) missing.push("safetyNotes");
    if (brief?.guidedWorkflow && missing.length) {
      issues.push(`missing_fields:${act.id || act.title}:${missing.join(",")}`);
    }
  });
  return {
    ok: issues.filter((i) => !i.startsWith("missing_fields")).length === 0,
    issues,
    safetyWarnings: [...new Set(safetyWarnings)],
    uncertainties: [...new Set(uncertainties)],
  };
}

function readyForOwnerReviewGates({
  ownerReviewStatus,
  contentPersistenceIncomplete,
  printableOk = true,
  imagesOk = true,
  requiredPrintableFailed = false,
  hardValidationOk = true,
} = {}) {
  if (contentPersistenceIncomplete === true) return false;
  if (requiredPrintableFailed) return false;
  if (!printableOk || !imagesOk) return false;
  if (!hardValidationOk) return false;
  return text(ownerReviewStatus, 40).toUpperCase() === "READY_FOR_OWNER_REVIEW";
}

module.exports = {
  validateActivityIdea,
  validateGuidedBrief,
  validateLessonActivities,
  readyForOwnerReviewGates,
};
