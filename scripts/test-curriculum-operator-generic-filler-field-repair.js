#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const staged = require("./curriculum-operator-staged-composer.js");
const createApi = require("./curriculum-operator-create.js");
const fixture = require("./curriculum-operator-spring-planting-e2e-fixture.js");

const brief = {
  ...createApi.parseCreationBrief(fixture.EXPLICIT_CREATE_COMMAND).brief,
  title: "Spring Planting QA",
  theme: "Spring Planting",
  activityTarget: 5,
  ageLabel: "Preschool 3–5",
};

const blueprint = {
  lesson: { title: brief.title, theme: brief.theme, dailyFocus: {} },
  activityOutlines: [
    { outlineId: "theme-thu-01", name: "Watering Plants", weekday: "thursday", domain: "Science", concept: "Children water plants carefully.", developmentalPurpose: "Build care skills." },
    { outlineId: "theme-mon-02", name: "Soil Exploration", weekday: "monday", domain: "STEM", concept: "Children compare soil types.", developmentalPurpose: "Build observation skills." },
  ],
};

function baseActivity(overrides) {
  return {
    outlineId: "theme-thu-01",
    title: "Watering Plants",
    dayOfWeek: "thursday",
    activityCategory: "Science",
    objective: "Children practice watering classroom plants with small cans.",
    description: "Children fill small watering cans and pour water at the base of potted plants.",
    materials: "Small watering cans, potted plants, tray, sponge",
    preparation: "Fill a low basin with water and place plants on a tray.",
    setup: "Set cans and plants at child height on a waterproof mat.",
    steps: "Set out materials. Encourage children to participate. Let children explore.",
    teacherLanguage: "How does the soil feel before you water?\nWhere should the water go?\nWhat changes after you pour?",
    observationOpportunities: "Notice grip, pour control, and language about wet and dry.",
    safetyNotes: "Supervise children closely.",
    cleanupTips: "Wipe the mat and return cans to the shelf.",
    indoorAlternatives: "Use a sensory table indoors with small cups instead of large cans.",
    outdoorAlternatives: "Water garden beds outdoors with teacher-led turns.",
    adaptations: "Offer smaller cans for children who need two-hand support.",
    extensions: "Compare how much water two pots absorb.",
    vocabulary: "water, pour, soil, plant, dry",
    teacherTips: ["Model a slow pour first.", "Keep one plant as a dry example."],
    observationPrompts: ["How do they aim the spout?", "Do they describe the soil change?"],
    durationMinutes: 20,
    age: brief.ageLabel,
    ...overrides,
  };
}

const wateringGenericSafety = baseActivity({});
assert.ok(
  staged.rejectGeneric("Watering Plants.safetyNotes", wateringGenericSafety.safetyNotes),
  "generic Watering Plants safetyNotes fails validation",
);

const soilGenericSteps = baseActivity({
  outlineId: "theme-mon-02",
  title: "Soil Exploration",
  dayOfWeek: "monday",
  materials: "Sand, clay, potting soil, spoons, trays",
  steps: "Set out materials. Encourage children to participate. Let children explore.",
});
assert.ok(
  staged.rejectGeneric("Soil Exploration.steps", soilGenericSteps.steps),
  "generic Soil Exploration steps fails validation",
);

const wateringSynth = staged.synthesizeActivitySpecificGenericField(wateringGenericSafety, "safetyNotes", brief);
assert.ok(wateringSynth && wateringSynth.length > 40, "watering safety synthesis is substantive");
assert.ok(
  !staged.rejectGeneric("Watering Plants.safetyNotes", wateringSynth),
  "synthesized watering safetyNotes passes generic gate",
);
assert.match(wateringSynth, /water|spill|slip/i, "watering safety mentions water-related risk");

const soilSynth = staged.synthesizeActivitySpecificGenericField(soilGenericSteps, "steps", brief);
assert.ok(soilSynth && soilSynth.split(",").length >= 3, "soil steps synthesis has multiple steps");
assert.ok(
  !staged.rejectGeneric("Soil Exploration.steps", soilSynth),
  "synthesized soil steps pass generic gate",
);
assert.match(soilSynth, /soil|texture|sample/i, "soil steps mention soil exploration");

const stillGeneric = staged.synthesizeActivitySpecificGenericField(
  { ...wateringGenericSafety, materials: "", setup: "", description: "" },
  "safetyNotes",
  brief,
);
assert.ok(
  stillGeneric && !staged.rejectGeneric("Watering Plants.safetyNotes", stillGeneric),
  "fallback synthesis still passes when materials sparse",
);

const repaired = staged.applyTargetedGenericFillerFieldSynthesis(
  [wateringGenericSafety, soilGenericSteps],
  brief,
);
assert.ok(
  !staged.rejectGeneric("Watering Plants.safetyNotes", repaired[0].safetyNotes),
  "batch synthesis fixes watering safetyNotes",
);
assert.ok(
  !staged.rejectGeneric("Soil Exploration.steps", repaired[1].steps),
  "batch synthesis fixes soil steps",
);
assert.equal(repaired[0].objective, wateringGenericSafety.objective, "unrelated objective unchanged");

const issues = [
  "Generic filler in Watering Plants.safetyNotes",
  "Generic filler in Soil Exploration.steps",
];
assert.equal(
  staged.expansionQualityIssuesAreOnlyGenericFillerFollowup(issues, repaired),
  true,
  "only generic filler on follow-up fields is follow-up repairable",
);
assert.ok(
  staged.fieldRepairQualityInstruction("steps", "generic_filler").includes("REPLACE"),
  "steps generic_filler repair contract is REPLACE",
);

const seedBrief = createApi.parseCreationBrief(fixture.EXPLICIT_CREATE_COMMAND).brief;
assert.ok(
  seedBrief.requestedActivities.some((a) => /seed growth/i.test(a)),
  "seed-growth request still present on brief",
);
assert.equal(seedBrief.explicitPrintables.length, 1, "explicit printable request preserved");

const ids = ["theme-thu-01", "theme-mon-02"];
const prior = [wateringGenericSafety, soilGenericSteps];
const merged = staged.coalesceExpansionBatch(
  prior,
  { activities: prior },
  ids,
  blueprint,
  brief,
  issues,
);
assert.ok(
  merged.activities.every((a) => {
    if (a.title === "Watering Plants") {
      return !staged.rejectGeneric("Watering Plants.safetyNotes", a.safetyNotes);
    }
    if (a.title === "Soil Exploration") {
      return !staged.rejectGeneric("Soil Exploration.steps", a.steps);
    }
    return true;
  }),
  "coalesce applies synthesis for targeted generic fields",
);

const badRepair = staged.coalesceExpansionBatch(
  prior,
  {
    activities: prior.map((a) => (
      a.title === "Watering Plants"
        ? { ...a, safetyNotes: "Watch children during play." }
        : a
    )),
  },
  ["theme-thu-01"],
  blueprint,
  brief,
  ["Generic filler in Watering Plants.safetyNotes"],
);
assert.ok(
  staged.rejectGeneric("Watering Plants.safetyNotes", badRepair.activities[0].safetyNotes) === null
    || !/Generic filler/i.test(staged.rejectGeneric("Watering Plants.safetyNotes", badRepair.activities[0].safetyNotes) || ""),
  "still-generic AI repair is replaced or fails closed with synthesis",
);

assert.equal(
  staged.synthesizeActivitySpecificGenericField(wateringGenericSafety, "objective", brief),
  null,
  "synthesis does not run for unrelated fields",
);

const genericDescriptionAct = baseActivity({
  description: "Children will explore materials through play.",
});
const descIssues = ["Generic filler in Watering Plants.description"];
const descMerged = staged.coalesceExpansionBatch(
  [genericDescriptionAct],
  { activities: [{ ...genericDescriptionAct, description: "Children will learn about plants." }] },
  ["theme-thu-01"],
  blueprint,
  brief,
  descIssues,
);
assert.equal(descMerged.ok, false, "generic description repair stays blocked without synthesis shortcut");

console.log("Curriculum operator generic filler field repair checks passed.");
