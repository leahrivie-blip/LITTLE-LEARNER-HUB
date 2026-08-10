#!/usr/bin/env node
/**
 * Unit coverage for age / choking safety + blank observation gates.
 * Disposable / offline — no production data.
 *
 * Run: npm run test:ai-age-safety
 */
const assert = require("node:assert/strict");
const ai = require("./ai-age-safety.js");

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

const ages = [
  "Infant 0-6 months",
  "Infant 6-12 months",
  "Young Toddler",
  "Toddler",
  "Preschool",
  "Mixed Ages",
];

console.log("normalizeAgeGroup");
ok(ai.normalizeAgeGroup("Infant (0–6 months)") === "Infant 0-6 months", "0–6 months");
ok(ai.normalizeAgeGroup("Infant 6-12 months") === "Infant 6-12 months", "6–12 months");
ok(ai.normalizeAgeGroup("Young Toddler") === "Young Toddler", "Young Toddler");
ok(ai.normalizeAgeGroup("Mixed-age classroom") === "Mixed Ages", "Mixed Ages");

console.log("choking / material blocks");
for (const age of ["Infant 0-6 months", "Infant 6-12 months", "Young Toddler", "Mixed Ages", "Toddler"]) {
  const hazards = [
    "Sort loose buttons by color",
    "Bead threading tray",
    "Count coins into a cup",
    "Pom-pom sensory bin",
    "Dried beans scooping",
    "Small magnets on a tray",
    "Collect small caps",
    "Water beads exploration",
  ];
  for (const line of hazards) {
    const gate = ai.validateAiContentForAge(line, age);
    ok(gate.blocked === true, `${age} blocks “${line.split(" ")[0]}…”`);
  }
  ok(gateHasSub(age), `${age} offers safe substitutions`);
}

function gateHasSub(age) {
  const gate = ai.validateAiContentForAge("Bead threading with loose buttons", age);
  return gate.alternatives.some((a) => /stacking rings|jumbo|fabric|sealed/i.test(a));
}

console.log("preschool allows developmentally typical scissors copy");
{
  const gate = ai.validateAiContentForAge("Practice cutting along thick lines with child scissors", "Preschool");
  ok(gate.blocked === false, "preschool cutting not blocked by under-3 choke list alone");
}

console.log("safe young toddler materials allowed");
{
  const gate = ai.validateAiContentForAge(
    "Offer large stacking rings, jumbo blocks, and sealed sensory containers.",
    "Young Toddler",
  );
  ok(gate.blocked === false, "large safe materials allowed for Young Toddler");
}

console.log("blank / vague / contradictory / minimal observation inputs");
{
  const blank = ai.validateObservationInput("", { tool: "observation" });
  ok(!blank.ok && blank.code === "blank_observation", "blank blocked");

  const vague = ai.validateObservationInput("child was good", { tool: "observation" });
  ok(!vague.ok, "vague blocked");

  const noAction = ai.validateObservationInput("Beautiful morning in the classroom today.", { tool: "observation" });
  ok(!noAction.ok, "no observed action blocked");

  const minimal = ai.validateObservationInput("Stacked three jumbo blocks during free play.", { tool: "observation" });
  ok(minimal.ok, "minimal observed action allowed");

  const contradictoryNote = "Child sat quietly the whole time and also ran across the room stacking towers.";
  const contra = ai.validateObservationInput(contradictoryNote, { tool: "observation" });
  ok(contra.ok, "contradictory-but-observed note is allowed through (provider owns facts)");

  const nonObs = ai.validateObservationInput("", { tool: "parent-message" });
  ok(nonObs.ok, "blank parent-message not forced through observation-only gate");

  const blankParent = ai.validateDocumentationInput("", { tool: "parent-message" });
  ok(!blankParent.ok && blankParent.code === "blank_documentation", "blank parent-message blocked by documentation gate");

  const blankDaily = ai.validateDocumentationInput("", { tool: "daily-log" });
  ok(!blankDaily.ok, "blank daily-log blocked by documentation gate");

  const wsDaily = ai.validateDocumentationInput("  \n\t ", { tool: "daily" });
  ok(!wsDaily.ok, "whitespace-only daily blocked");

  const validDaily = ai.validateDocumentationInput("Ate a cheese sandwich and built with blocks after nap.", { tool: "daily" });
  ok(validDaily.ok, "valid daily notes accepted");

  const unknownBlank = ai.validateDocumentationInput("", { tool: "unknown" });
  ok(!unknownBlank.ok, "unknown tool blank cannot bypass documentation gate");
}

console.log("sanitize residue");
{
  const cleaned = ai.sanitizeProviderFacingCopy("Hello\nLeave blank if not needed.\n### Title\n[Your Name]");
  ok(!/Leave blank if not needed/i.test(cleaned), "strips leave-blank residue");
  ok(!cleaned.includes("###"), "strips markdown heading");
  ok(!/\[Your Name\]/i.test(cleaned), "strips placeholder");
}

console.log(`\nAll ${passed} ai-age-safety assertions passed.`);
