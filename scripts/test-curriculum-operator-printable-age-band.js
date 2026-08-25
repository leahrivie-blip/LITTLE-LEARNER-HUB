#!/usr/bin/env node
/**
 * Printable age_band inheritance from parent lesson records.
 * Run: npm run test:curriculum-operator-printable-age-band
 */
"use strict";

const assert = require("node:assert/strict");
const schema = require("./curriculum-operator-schema.js");
const createApi = require("./curriculum-operator-create.js");
const commandApi = require("./curriculum-operator-command.js");
const printablesApi = require("./curriculum-operator-printables.js");
const ageBandApi = require("./curriculum-operator-printable-age-band.js");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

const infantLesson = {
  id: "cur-lp-age-infant",
  title: "Black White Discovery",
  age: "Infant 0–12 Months",
  plan: "Free",
};

const toddlerLmw = {
  id: "cur-lp-549b80f61dfa8d79",
  title: "Little Makers Workshop",
  age: "Toddler 12–24 Months",
  plan: "Free",
};

const preschoolLesson = {
  id: "cur-lp-age-preschool",
  title: "Farm Animals",
  age: "Preschool 3–5",
  plan: "Pro",
};

const missingAgeLesson = {
  id: "cur-lp-age-missing",
  title: "Mystery Lesson",
  age: "",
  plan: "Free",
};

const mixedAgeLesson = {
  id: "cur-lp-age-mixed",
  title: "Mixed Studio",
  age: "Mixed Ages",
  plan: "Free",
};

console.log("resolvePrintableAgeBand — canonical inheritance");
{
  const infant = ageBandApi.resolvePrintableAgeBand(infantLesson);
  ok(infant.ok === true && infant.ageBand === "infant", "infant lesson resolves infant");

  const toddler = ageBandApi.resolvePrintableAgeBand(toddlerLmw);
  ok(toddler.ok === true && toddler.ageBand === "toddler", "Little Makers Workshop resolves toddler");
  ok(toddler.ageLabel === "Toddler 12–24 Months", "Little Makers keeps stored age label");

  const preschool = ageBandApi.resolvePrintableAgeBand(preschoolLesson);
  ok(preschool.ok === true && preschool.ageBand === "preschool", "preschool lesson resolves preschool");

  const mixed = ageBandApi.resolvePrintableAgeBand(mixedAgeLesson);
  ok(mixed.ok === true && mixed.ageBand === "mixed", "mixed ages label resolves mixed");
}

console.log("\nLegacy field normalization");
{
  const legacy = ageBandApi.resolvePrintableAgeBand({
    id: "cur-lp-legacy",
    title: "Legacy Toddler",
    ageGroup: "Toddler",
  });
  ok(legacy.ok === true && legacy.ageBand === "toddler", "legacy ageGroup normalizes to toddler");
}

console.log("\nMissing age fallback");
{
  const missing = ageBandApi.resolvePrintableAgeBand(missingAgeLesson);
  ok(missing.ok === false, "missing age returns not ok");
  ok((missing.needsOwnerInput || []).includes("age_band"), "missing age needs age_band owner input");
  ok(missing.debug?.lessonId === "cur-lp-age-missing", "missing age debug includes lesson ID");
  ok(Array.isArray(missing.debug?.acceptedAgeBands), "missing age debug lists accepted bands");

  const ownerErr = ageBandApi.buildPrintableAgeBandOwnerInputError(missing);
  ok(ownerErr.error === "Needs owner input: age_band", "owner input error message preserved");
  ok(ownerErr.reason === "normalization_failed_no_canonical_age_band", "owner input includes reason");
}

console.log("\nWrong-lesson isolation");
{
  const activity = { id: "cur-act-other", age: "Preschool 3–5" };
  const resolved = ageBandApi.resolvePrintableAgeBand(toddlerLmw, { activity });
  ok(resolved.ageBand === "toddler", "parent lesson age wins over different activity age");
}

console.log("\nbuildPrintableSpec inherits parent lesson age_band");
{
  const activity = { id: "cur-act-maker", title: "Recycled Creation Station", age: "" };
  const spec = printablesApi.buildPrintableSpec({
    plan: toddlerLmw,
    activity,
    planItem: {
      activityId: activity.id,
      printable: {
        decision: "CREATE",
        title: "Recycled Creation Station Cards",
        type: "sorting_cards",
        purpose: "Sort recycled materials during the creation station invitation.",
      },
    },
    decision: "CREATE",
  });
  ok(spec.ageBand === "toddler", "printable spec stores canonical toddler age_band");
  ok(spec.ageBandLabel === "Toddler 12–24 Months", "printable spec keeps parent age label");
}

console.log("\nOperator command routing — printable on existing lesson");
{
  const cmd = "Create Maker Station Signs printable for Little Makers Workshop teaching kit";
  ok(createApi.isCreateLessonCommand(cmd) === false, "printable teaching-kit command is not create-lesson");
  const parsed = commandApi.parseOperatorCommand(cmd, { phase: 7 });
  ok(parsed.command.actions.createLesson === false, "printable teaching-kit command does not set createLesson");
  ok(parsed.command.actions.generatePrintables === true, "printable teaching-kit command enables generatePrintables");

  const brief = createApi.parseCreationBrief(cmd, { defaultAccessPlan: "Free" });
  ok(brief.needsOwnerInput.includes("age_band") === false || brief.ok === false,
    "misclassified create brief no longer the printable gate when createLesson is false");
}

console.log("\nLittle Makers printable commands before/after gate");
{
  const commands = [
    "Generate Maker Station Signs printable for Little Makers Workshop",
    "Create Process Maker Prompt Cards printable for Little Makers Workshop teaching kit",
    "Generate Recycled Creation Station Cards printable for Little Makers Workshop",
  ];
  for (const raw of commands) {
    const parsed = commandApi.parseOperatorCommand(raw, { phase: 4 });
    ok(parsed.command.actions.createLesson !== true, `no createLesson for: ${raw.slice(0, 48)}…`);
    ok(parsed.command.actions.generatePrintables === true, `printables enabled for: ${raw.slice(0, 48)}…`);
    const resolved = ageBandApi.resolvePrintableAgeBand(toddlerLmw);
    ok(resolved.ok && resolved.ageBand === "toddler", `LMW age resolves for: ${raw.slice(0, 48)}…`);
  }
}

console.log("\nReplace retains parent lesson context");
{
  const activity = { id: "cur-act-replace", title: "Build a Home for a Toy", age: "" };
  const spec = printablesApi.buildPrintableSpec({
    plan: toddlerLmw,
    activity,
    planItem: {
      activityId: activity.id,
      printable: {
        decision: "REPLACE",
        title: "Build a Home for a Toy Dramatic Play Pack",
        type: "dramatic_play_pack",
        purpose: "Props for dramatic play building.",
        existingResourceIds: ["cur-res-old"],
      },
    },
    decision: "REPLACE",
    existingResourceIds: ["cur-res-old"],
  });
  ok(spec.ageBand === "toddler", "replace spec inherits toddler age_band from parent lesson");
}

console.log(`\n${passed} assertions passed.`);
