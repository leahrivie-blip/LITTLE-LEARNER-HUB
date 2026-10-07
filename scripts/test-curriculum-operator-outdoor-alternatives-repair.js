#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const staged = require("./curriculum-operator-staged-composer.js");
const outdoor = require("./curriculum-operator-outdoor-alternatives-repair.js");
const createApi = require("./curriculum-operator-create.js");
const fixture = require("./curriculum-operator-spring-planting-e2e-fixture.js");

const brief = {
  ...createApi.parseCreationBrief(fixture.EXPLICIT_CREATE_COMMAND).brief,
  title: "Spring Planting QA",
  theme: "Spring Planting",
  activityTarget: 15,
};

const blueprint = {
  lesson: { title: brief.title, theme: brief.theme, dailyFocus: {} },
  activityOutlines: [
    { outlineId: "theme-wed-02", name: "Plant Color Mixing", weekday: "wednesday", domain: "Art", concept: "Mix plant colors.", developmentalPurpose: "Explore color." },
    { outlineId: "theme-mon-01", name: "Seed Sorting", weekday: "monday", domain: "Math", concept: "Sort seeds.", developmentalPurpose: "Counting." },
  ],
};

function plantColorMixingActivity(overrides = {}) {
  return {
    outlineId: "theme-wed-02",
    title: "Plant Color Mixing",
    dayOfWeek: "wednesday",
    activityCategory: "Art",
    objective: "Children mix paint colors inspired by leaves and flowers using labeled trays and teacher coaching.",
    description: "Children compare leaf and flower colors, then mix paint on trays to match plant samples.",
    materials: "Color-mixing trays, labeled plant/leaf samples, washable paint, brushes, waterproof mats",
    preparation: "Pre-fill paint cups and place labeled plant samples beside each tray before children arrive.",
    setup: "Set two trays per table with mats and sample cards at child height.",
    steps: "Invite children to name a sample color, squeeze two paint dots, and stir with a brush to match.",
    teacherLanguage: "Which plant color are you trying to match?\nWhat happens when you add the green?",
    observationOpportunities: "Notice color language, grip, and whether children compare hues to the samples.",
    safetyNotes: "Use washable paint only; supervise spills and keep brushes out of mouths.",
    cleanupTips: "Rinse brushes and wipe mats before returning samples to the shelf.",
    indoorAlternatives: "Use the same color-mixing trays at an indoor art table with mats and labeled samples.",
    outdoorAlternatives: "Outside.",
    adaptations: "Offer fewer paint colors for children who need a simpler choice set.",
    extensions: "Invite children to paint a swatch card for their favorite mixed plant color.",
    vocabulary: "mix, color, leaf, flower, tray, brush, match, green",
    teacherTips: ["Limit paint cups to two colors at first.", "Model a slow stir before children try."],
    observationPrompts: ["What color words do they use?", "Do they compare the mix to the sample card?"],
    durationMinutes: 20,
    ...overrides,
  };
}

const shortOutdoor = plantColorMixingActivity();
assert.ok(
  staged.rejectGeneric("Plant Color Mixing.outdoorAlternatives", shortOutdoor.outdoorAlternatives),
  "Plant Color Mixing outdoorAlternatives too short fails validation",
);

const issueOutdoor = "Too short: Plant Color Mixing.outdoorAlternatives";
const plan = staged.planExpansionRepair([issueOutdoor], [shortOutdoor]);
assert.ok(
  plan.canRepair && plan.mappedRepairTargets.some((t) => (
    t.title === "Plant Color Mixing" && t.fields.some((f) => f.field === "outdoorAlternatives")
  )),
  "too_short outdoorAlternatives maps to Plant Color Mixing",
);

assert.match(
  staged.fieldRepairQualityInstruction("outdoorAlternatives", "too_short"),
  /EXPAND this field into a practical outdoor adaptation/i,
  "outdoorAlternatives too_short repair contract is activity-specific EXPAND",
);
assert.match(
  outdoor.outdoorAlternativesRepairQualityInstruction("too_short"),
  /≥8-word minimum/i,
  "repair contract preserves minimum-length expectation",
);

const synthOutdoor = outdoor.synthesizeActivitySpecificOutdoorAlternative(shortOutdoor, brief);
assert.ok(synthOutdoor && synthOutdoor.split(/\s+/).length >= 8, "outdoor synthesis meets word minimum");
assert.match(synthOutdoor, /color|mix|tray|plant/i, "outdoor synthesis is activity-specific for color mixing");
assert.ok(
  !outdoor.isShallowOutdoorAlternatives(synthOutdoor),
  "synthesized outdoor text is not shallow filler",
);
assert.ok(
  !staged.rejectGeneric("Plant Color Mixing.outdoorAlternatives", synthOutdoor),
  "synthesized outdoorAlternatives passes rejectGeneric",
);

const repairedBatch = staged.applyTargetedAlternativesTooShortSynthesis([shortOutdoor], brief);
assert.ok(
  !staged.rejectGeneric("Plant Color Mixing.outdoorAlternatives", repairedBatch[0].outdoorAlternatives),
  "batch synthesis fixes Plant Color Mixing outdoorAlternatives",
);
assert.equal(repairedBatch[0].objective, shortOutdoor.objective, "unrelated objective unchanged");
assert.equal(repairedBatch[0].indoorAlternatives, shortOutdoor.indoorAlternatives, "valid indoorAlternatives unchanged");

const rescuedRepair = staged.coalesceExpansionBatch(
  [shortOutdoor],
  { activities: [{ ...shortOutdoor, outdoorAlternatives: "Go out." }] },
  ["theme-wed-02"],
  blueprint,
  brief,
  [issueOutdoor],
);
assert.equal(rescuedRepair.ok, true, "targeted too_short outdoor repair coalesces with activity-specific synthesis");
assert.match(
  rescuedRepair.activities[0].outdoorAlternatives,
  /outdoor|shaded|color|tray/i,
  "coalesce outdoorAlternatives is activity-specific after synthesis",
);

const stubbornOutdoor = { ...shortOutdoor, outdoorAlternatives: "Tiny" };
assert.ok(
  staged.rejectGeneric("Plant Color Mixing.outdoorAlternatives", stubbornOutdoor.outdoorAlternatives),
  "too-short outdoorAlternatives fails rejectGeneric (blocks persist)",
);
const [noSynthFix] = outdoor.applyTargetedAlternativesTooShortSynthesis(
  [stubbornOutdoor],
  brief,
  { rejectGeneric: () => "Too short: blocked" },
);
assert.equal(
  noSynthFix.outdoorAlternatives,
  stubbornOutdoor.outdoorAlternatives,
  "synthesis does not persist when repaired text still fails validation",
);

const shallowOutdoor = "Do this outside on a mat with the same props and teacher nearby today.";
assert.ok(
  staged.rejectGeneric("Plant Color Mixing.outdoorAlternatives", shallowOutdoor),
  "shallow outdoor filler fails as generic even when ≥8 words",
);

const seedBrief = createApi.parseCreationBrief(fixture.EXPLICIT_CREATE_COMMAND).brief;
assert.ok(
  seedBrief.requestedActivities.some((a) => /seed growth/i.test(a)),
  "seed-growth request remains present on brief",
);
assert.equal(seedBrief.explicitPrintables.length, 1, "explicit printable remains limited to one pack");
assert.match(seedBrief.explicitPrintables[0].title, /Seed Growth Sequencing Cards/i);

console.log("Curriculum operator outdoorAlternatives repair checks passed.");
