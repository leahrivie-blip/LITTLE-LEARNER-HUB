#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const createApi = require("./curriculum-operator-create.js");
const architect = require("./curriculum-operator-create-architect.js");
const fixture = require("./curriculum-operator-spring-planting-e2e-fixture.js");

const explicitBrief = createApi.parseCreationBrief(fixture.EXPLICIT_CREATE_COMMAND).brief;
assert.ok(
  explicitBrief.requestedActivities.some((a) => /seed growth/i.test(a)),
  "brief carries seed growth requested activity",
);

const bakeryBrief = createApi.parseCreationBrief(
  "Create a Preschool bakery lesson with 15 activities and leave it ready for review.",
).brief;

// Gate unchanged: partial title match fails closed
const missingGate = architect.validateRequestedActivities(
  ["seed growth"],
  ["Planting Seeds"],
);
assert.equal(missingGate.ok, false, "requested_activity_missing still fails without full term match");
assert.deepEqual(missingGate.missing, ["seed growth"]);

const passingGate = architect.validateRequestedActivities(
  ["seed growth"],
  ["Seed Growth Activity"],
);
assert.equal(passingGate.ok, true, "full term match passes gate");

const blueprint = {
  activityOutlines: [
    {
      outlineId: "outline-seed-01",
      name: "Planting Seeds",
      weekday: "monday",
      domain: "Science / STEM",
      concept: "Children plant seeds and observe sprouting over the week.",
      developmentalPurpose: "Build science vocabulary and sequencing skills.",
      expectedAssetIntent: { image: "GENERATE", printable: "CREATE", reason: "Owner printable." },
    },
    {
      outlineId: "outline-bakery-02",
      name: "Bakery Counting",
      weekday: "tuesday",
      domain: "Math",
      concept: "Children count pretend bakery items.",
      developmentalPurpose: "Practice one-to-one correspondence.",
      expectedAssetIntent: { image: "NOT_NEEDED", printable: "NOT_NEEDED", reason: "N/A" },
    },
  ],
};

const alignedBlueprint = architect.alignBlueprintOutlinesForRequestedActivities(blueprint, explicitBrief);
assert.match(
  alignedBlueprint.activityOutlines[0].name,
  /Seed Growth Activity/i,
  "explicit printable outline renamed for validation-safe title",
);

const expanded = [
  {
    outlineId: "outline-seed-01",
    title: "Planting Seeds",
    dayOfWeek: "monday",
    activityCategory: "Science / STEM",
    objective: "Children sequence seed, sprout, and plant growth with picture cards.",
    description: "Preschoolers order seed-to-sprout-to-plant stages and discuss changes.",
    materials: "Seeds, soil cups, sequencing cards, trays.",
    preparation: "Pre-cut cards and stage soil cups.",
    setup: "Place sequencing cards in order at a table.",
    steps: "Invite children to match real seeds to each growth stage card.",
    teacherLanguage: "What do you notice?\nWhich stage comes next?\nTell me about your seed.",
    observationOpportunities: "Note vocabulary for sprout and plant.",
    safetyNotes: "Supervise soil and keep seeds away from mouths.",
    cleanupTips: "Wipe trays and store cards in labeled envelopes.",
    indoorAlternatives: "Use felt board seed pieces indoors.",
    outdoorAlternatives: "Plant seeds in the garden bed.",
    adaptations: "Offer larger cards for fine-motor support.",
    extensions: "Add a journal drawing of each stage.",
    vocabulary: "seed, sprout, plant, soil, grow",
    teacherTips: ["Model the first card match.", "Keep groups to four children."],
    observationPrompts: ["Which stage was hardest to name?", "How did they describe growth?"],
    preliminaryAssetIntent: { image: "GENERATE", printable: "CREATE", reason: "Owner printable." },
  },
  {
    outlineId: "outline-bakery-02",
    title: "Bakery Counting",
    dayOfWeek: "tuesday",
    activityCategory: "Math",
    objective: "Children count bakery props to five.",
    description: "Count muffins and trays together.",
    materials: "Muffin tins, pretend muffins.",
    preparation: "Set out trays.",
    setup: "Place tins on a math mat.",
    steps: "Count each muffin into the tin.",
    teacherLanguage: "How many?\nCan you count with me?\nWhat comes next?",
    observationOpportunities: "Listen for number words.",
    safetyNotes: "Check for small-piece allergies.",
    cleanupTips: "Return props to the basket.",
    indoorAlternatives: "Use felt muffins.",
    outdoorAlternatives: "Count stones in buckets.",
    adaptations: "Offer number cards.",
    extensions: "Compare two tray totals.",
    vocabulary: "count, muffin, tray, more, less",
    teacherTips: ["Pause between numbers.", "Celebrate attempts."],
    observationPrompts: ["Did they use one-to-one touch?", "Which number was tricky?"],
    preliminaryAssetIntent: { image: "NOT_NEEDED", printable: "NOT_NEEDED", reason: "N/A" },
  },
];

const alignedExpanded = architect.alignExpandedActivitiesForRequestedActivities(
  expanded,
  alignedBlueprint,
  explicitBrief,
);
assert.match(alignedExpanded[0].title, /Seed Growth Activity/i, "expanded CREATE activity aligned to requested hint");
assert.equal(alignedExpanded[1].title, "Bakery Counting", "unrelated explicit activity unchanged");

const alignedGate = architect.validateRequestedActivities(
  explicitBrief.requestedActivities,
  alignedExpanded.map((a) => a.title),
);
assert.equal(alignedGate.ok, true, "aligned expanded activities pass requested activity gate");

const unrelatedAligned = architect.alignExpandedActivitiesForRequestedActivities(
  expanded,
  blueprint,
  bakeryBrief,
);
assert.equal(unrelatedAligned[0].title, "Planting Seeds", "bakery brief does not rename seed activity");

(async () => {
  const springBrief = {
    ...explicitBrief,
    title: "Spring Planting QA Disposable test-run",
    theme: "Spring Planting",
    activityTarget: 15,
    ageLabel: "Preschool 3–5",
  };
  const composed = await architect.composeNewLessonContent(springBrief, { forceFixture: true });
  assert.equal(composed.ok, true, "fixture staged compose succeeds for explicit spring planting brief");
  const titles = [];
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
    const items = composed.content?.dailyPlans?.[day]?.items || [];
    items.forEach((item) => titles.push(item.title));
  });
  assert.ok(
    titles.some((t) => /seed/i.test(t) && /growth/i.test(t)),
    "fixture path includes seed-growth activity title in final assembly",
  );

  const qaTitle = fixture.buildDisposableSpringPlantingQaTitle("regression");
  const qaCmd = fixture.buildExplicitCreateCommand(qaTitle);
  const qaBrief = createApi.parseCreationBrief(qaCmd).brief;
  assert.equal(qaBrief.title, qaTitle, "unique QA title preserved in brief");

  console.log("Curriculum operator seed growth requested activity checks passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
