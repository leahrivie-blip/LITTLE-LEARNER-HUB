#!/usr/bin/env node
/**
 * Phase 2 Smart Lesson Plan Importer tests.
 * Run: npm run test:smart-import
 */
const assert = require("node:assert/strict");

require("./curriculum-lesson-import-parser.js");
require("./curriculum-lesson-import-v4.js");
require("./curriculum-learning-domains.js");
require("./lesson-plan-cover-catalog.js");
require("./lesson-plan-covers.js");
const smart = require("./smart-lesson-import.js");
const domains = require("./curriculum-learning-domains.js");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const informalApple = `
Preschool Apple Week
Focus on counting, colors, fine motor, science, and vocabulary.
Monday: Apple investigation
Tuesday: Apple counting
Wednesday: Apple painting
Thursday: Taste test
Friday: Apple pie dramatic play
`;

const structured = `
TITLE: Ocean Explorers Week
AGE_GROUP: Toddler
THEME: Ocean
LEARNING_DOMAINS: Math, Literacy, Science
OBJECTIVES: Explore ocean animals
WEEKLY_MATERIALS: Water table, shells
Monday
ACTIVITY_NAME: Wave Table
DESCRIPTION: Scoop and pour
MATERIALS: Water table
DIRECTIONS:
1. Invite children.
2. Scoop and pour.
Tuesday
ACTIVITY_NAME: Shell Sort
DESCRIPTION: Sort shells
MATERIALS: Shells
DIRECTIONS:
1. Offer shells.
2. Sort by size.
Wednesday
ACTIVITY_NAME: Fish Song
DESCRIPTION: Sing and move
MATERIALS: Music
DIRECTIONS:
1. Sing.
2. Move like fish.
Thursday
ACTIVITY_NAME: Blue Paint
DESCRIPTION: Paint waves
MATERIALS: Paint
DIRECTIONS:
1. Offer blue paint.
2. Paint waves.
Friday
ACTIVITY_NAME: Ocean Story
DESCRIPTION: Read together
MATERIALS: Book
DIRECTIONS:
1. Read.
2. Talk about fish.
`;

const multiNatural = `
Preschool Apple Week
Monday: Apple investigation
Tuesday: Apple counting

Toddler Pumpkin Week
Monday: Pumpkin wash
Tuesday: Pumpkin roll
`;

test("domain aliases understand meaning-based wording", () => {
  const cases = [
    ["Counting", "Math"],
    ["Number Recognition", "Math"],
    ["Numeracy", "Math"],
    ["Patterns", "Math"],
    ["Measurement", "Math"],
    ["Cognitive Math", "Math"],
    ["Vocabulary", "Language & Literacy"],
    ["Books", "Language & Literacy"],
    ["Investigation", "Science"],
    ["Nature", "Science"],
    ["STEM", "Science"],
    ["Grasping", "Physical Development"],
    ["Cutting", "Physical Development"],
    ["Outdoor Play", "Physical Development"],
    ["Self-regulation", "Social Emotional"],
    ["Painting", "Creative Arts"],
    ["Crafts", "Creative Arts"],
    ["Dramatic Play", "Creative Arts"],
  ];
  cases.forEach(([wording, expected]) => {
    const result = domains.resolveLearningDomainsWithConfidence(wording);
    assert.ok(result.domains.includes(expected), `${wording} → ${result.domains.join(",")}`);
  });
});

test("informal apple week paste organizes into a reviewable plan", () => {
  const result = smart.importSmartPaste(informalApple, { mode: "v5" });
  assert.equal(result.chunkCount, 1);
  assert.ok(result.reviews.length === 1);
  const review = result.reviews[0];
  assert.ok(review.plan.title.toLowerCase().includes("apple") || review.plan.theme.toLowerCase().includes("apple"), review.plan.title);
  assert.ok(review.dayCount >= 1, `days=${review.dayCount}`);
  assert.ok(review.suggestions.length >= 1, "should suggest missing fields");
  assert.ok(review.fieldStatuses.some((f) => ["missing", "ai-suggested", "needs-review", "complete"].includes(f.status)));
  const domainsFromFocus = smart.inferDomainsFromProse({
    title: "Preschool Apple Week",
    theme: "Apple Week",
    weeklyOverview: "Focus on counting, colors, fine motor, science, and vocabulary.",
  });
  assert.ok(domainsFromFocus.domains.includes("Math"), domainsFromFocus.domains.join(","));
  assert.ok(domainsFromFocus.domains.includes("Science"), domainsFromFocus.domains.join(","));
});

test("structured import keeps weekday activities and validates publish gaps", () => {
  const result = smart.importSmartPaste(structured, { mode: "v5" });
  const review = result.reviews[0];
  assert.ok(review.dayCount >= 4, `days=${review.dayCount}`);
  assert.ok(review.activityCount >= 4, `activities=${review.activityCount}`);
  const publishErrors = smart.validateForPublish({ ...review.plan, coverImageUrl: "" });
  assert.ok(publishErrors.some((err) => /cover/i.test(err)));
});

test("bulk split detects multiple natural-language plans", () => {
  const chunks = smart.splitLessonPlanChunks(multiNatural);
  assert.ok(chunks.length >= 2, `chunks=${chunks.length}`);
  const result = smart.importSmartPaste(multiNatural, { mode: "v5" });
  assert.ok(result.reviews.length >= 2, `reviews=${result.reviews.length}`);
});

test("suggestions stay unaccepted until review approval", () => {
  const result = smart.importSmartPaste(informalApple, { mode: "v5" });
  const review = result.reviews[0];
  assert.ok(review.suggestions.every((s) => s.accepted === false));
  const accepted = review.suggestions.map((s) => ({ ...s, accepted: true }));
  const next = smart.applyAcceptedSuggestions(review.plan, accepted);
  assert.ok(String(next.objectives || "").length || String(next.weeklyMaterials || "").length);
});

test("bulk actions set age/plan and generate covers", () => {
  const result = smart.importSmartPaste(informalApple, { mode: "v5" });
  let reviews = smart.applyBulkAction(result.reviews, "set-age", { age: "Toddler" });
  assert.equal(reviews[0].plan.age, "Toddler");
  reviews = smart.applyBulkAction(reviews, "set-plan", { plan: "Pro" });
  assert.equal(reviews[0].plan.plan, "Pro");
  reviews = smart.applyBulkAction(reviews, "generate-covers");
  assert.ok(reviews[0].plan.coverImageUrl.includes("/images/lesson-covers/"), reviews[0].plan.coverImageUrl);
});

test("assistant commands update drafts and report changes", () => {
  const result = smart.importSmartPaste(informalApple, { mode: "v5" });
  const { reviews, changes } = smart.runAssistantCommand("Make this more play-based.", result.reviews);
  assert.ok(changes.length >= 1);
  assert.ok(String(reviews[0].plan.weeklyOverview || "").toLowerCase().includes("play-based"));
  const infant = smart.runAssistantCommand("Create an infant version.", reviews);
  assert.ok(infant.reviews.length >= reviews.length);
});

test("tags and primary collection are suggested from content", () => {
  const plan = {
    title: "Apple Science Week",
    theme: "Apples",
    learningDomains: ["Math", "Science", "Language & Literacy"],
    age: "Preschool",
    plan: "Free",
  };
  const tags = smart.suggestTags(plan);
  assert.ok(tags.includes("Math") || tags.includes("Science") || tags.includes("Literacy"), tags.join(","));
  assert.equal(smart.suggestPrimaryCollection(plan), "Preschool");
});

console.log(process.exitCode ? "Smart import tests finished with failures." : "All smart import tests passed.");
