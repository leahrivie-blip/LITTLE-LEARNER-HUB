#!/usr/bin/env node
/**
 * Child Profiles / Daily Logs / Documentation Helpers grounding + guards.
 * Run: npm run test:profiles-logs-docs
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

function extractFunction(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  if (start < 0) throw new Error(`Could not find ${name}`);
  let i = source.indexOf("{", start);
  let depth = 0;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

function loadHelpers() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const sandbox = {
    console,
    aiAgeGroupOptions: ["Infant", "Young Toddler", "Older Toddler", "Preschool", "School Age"],
    normalizeAgeGroup: (value) => {
      const text = String(value || "").trim();
      if (!text) return "";
      if (/infant/i.test(text)) return "Infant";
      if (/young\s*toddler/i.test(text)) return "Young Toddler";
      if (/older\s*toddler|^toddler$/i.test(text)) return "Older Toddler";
      if (/preschool|pre-?k/i.test(text)) return "Preschool";
      if (/school/i.test(text)) return "School Age";
      return "";
    },
    toneCopy: (_tone, pairs) => (pairs.find((p) => p[0] === "warm") || pairs[0])[1],
    ageGroupProfile(rawAge) {
      if (!rawAge) {
        return {
          lessonMaterials: "Not enough detail provided",
          lessonObjectives: ["Not enough detail provided"],
          lessonPlanDays: [["Open Play", "- Not enough detail provided"]],
          activityTitle: "Activity",
          activityDuration: "Not enough detail provided",
          activityMaterials: "Not enough detail provided",
          activityInstructions: ["Not enough detail provided"],
          activityGoals: ["Not enough detail provided"],
          activitySafety: "Not enough detail provided",
          activityExtensions: "Not enough detail provided",
        };
      }
      return {
        lessonMaterials: "blocks",
        lessonObjectives: ["Explore"],
        lessonPlanDays: [["Circle", "- Sit"], ["Art", "- Paint"], ["Sensory", "- Feel"], ["Music", "- Sing"], ["Outdoor", "- Run"]],
        activityTitle: "Play",
        activityDuration: "15 minutes",
        activityMaterials: "cups",
        activityInstructions: ["Invite play"],
        activityGoals: ["Practice"],
        activitySafety: "Stay close",
        activityExtensions: "Offer more",
      };
    },
    emptyCurriculumDailyPlans() {
      return { monday: { items: [] }, tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] } };
    },
    CURRICULUM_WEEKDAYS: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    formatCurriculumLessonPlanImportText(plan) {
      return JSON.stringify(plan);
    },
    buildDailyReportTags() { return []; },
  };
  const names = [
    "normalizeAiAgeGroup",
    "isPlaceholderChildName",
    "goalProgressPercent",
    "sanitizeDocHelperDraftText",
    "generateDailyReport",
    "generateBehaviorDocumentation",
    "generateActivity",
    "generateLessonPlan",
  ];
  const script = `"use strict";\n${names.map((name) => extractFunction(appJs, name)).join("\n")}`;
  vm.runInNewContext(script, sandbox, { timeout: 5000 });
  return sandbox;
}

function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  ok(appJs.includes("function isPlaceholderChildName"), "placeholder name helper present");
  ok(appJs.includes("function sanitizeDocHelperDraftText"), "markdown sanitize helper present");
  ok(appJs.includes("docHelperGenerating"), "duplicate generation lock present");
  ok(appJs.includes("syncDocHelperAgeField"), "age field sync present");
  ok(appJs.includes("document creations left"), "Free limit explained before generate");
  ok(/Group Log[\s\S]{0,160}disabled/.test(appJs), "zero-child group actions disabled");
  ok(appJs.includes("No care records are logged for this day yet"), "print-all empty-day warning present");
  ok(appJs.includes("will not invent preschool"), "no-preschool invention copy present");
  ok(appJs.includes("${summary.completed} logged (goal ${summary.goal})")
    || appJs.includes("logged (goal"), "monthly progress avoids 6/4 display");
  ok(appJs.includes("Math.min(completed, goal)"), "monthly percent caps completed against goal");

  const h = loadHelpers();
  ok(h.normalizeAiAgeGroup("") === "", "blank age stays blank");
  ok(h.normalizeAiAgeGroup("Preschool") === "Preschool", "known age preserved");
  ok(h.normalizeAiAgeGroup("mystery") === "", "unknown age not invented");
  ok(h.isPlaceholderChildName("Your Name") === true, "blocks Your Name");
  ok(h.isPlaceholderChildName("[Your Name]") === true, "blocks bracket placeholder");
  ok(h.isPlaceholderChildName("New Child") === true, "blocks New Child");
  ok(h.isPlaceholderChildName("Ava Rivera") === false, "allows real name");
  ok(h.goalProgressPercent("progress") === 0, "bare progress word is not 50%");
  ok(h.goalProgressPercent("45%") === 45, "numeric progress works");
  ok(h.goalProgressPercent("complete") === 100, "complete maps to 100");

  const daily = h.generateDailyReport({ note: "Painted with watercolors.", age: "", childExplicitlySelected: false });
  ok(!/Preschool/i.test(daily), "daily report does not invent Preschool");
  ok(!/happy and engaged/i.test(daily), "daily report does not invent mood");
  ok(!/Free Play, Group Activities/i.test(daily), "daily report does not invent Free Play filler");
  ok(/Not enough detail provided/i.test(daily), "daily report uses missing-detail wording");

  const behavior = h.generateBehaviorDocumentation({ note: "Needed help waiting.", age: "", childExplicitlySelected: false });
  ok(!/Preschool/i.test(behavior), "behavior doc does not invent Preschool");
  ok(/Not enough detail provided/i.test(behavior), "behavior doc marks missing facts");

  const activity = h.generateActivity({ note: "Sorting cups", age: "" });
  ok(/Choose an age group/i.test(activity), "activity asks for age when missing");
  ok(!/Age Group:\s*Preschool/i.test(activity) && !/^Preschool\b/m.test(activity), "activity does not invent Preschool age");

  const lesson = h.generateLessonPlan({ theme: "Weather", age: "" });
  ok(/Choose an age group/i.test(lesson), "lesson asks for age when missing");
  ok(!/Age Group:\s*Preschool/i.test(lesson) && !/"age":"Preschool"/i.test(lesson), "lesson does not invent Preschool age");

  const cleaned = h.sanitizeDocHelperDraftText("## Heading\n\nHello!!\n\n\n\nWorld");
  ok(!cleaned.includes("##"), "strips markdown headings");
  ok(!cleaned.includes("!!"), "collapses doubled punctuation");

  console.log(`PASS profiles/logs/docs (${passed} asserts)`);
}

try {
  main();
} catch (error) {
  console.error("FAIL profiles/logs/docs:", error.message || error);
  process.exit(1);
}
