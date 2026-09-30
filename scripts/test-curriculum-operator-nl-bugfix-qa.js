#!/usr/bin/env node
/**
 * Regression suite for Curriculum Operator NL bug-fix pass (printable-only,
 * cover-only, negated research-only, published FREE filter, negated publish).
 * Run: NODE_ENV=test node scripts/test-curriculum-operator-nl-bugfix-qa.js
 */
"use strict";

const assert = require("node:assert/strict");
const commandApi = require("./curriculum-operator-command.js");
const targetsApi = require("./curriculum-operator-semantic-targets.js");
const signalsApi = require("./curriculum-operator-semantic-signals.js");
const allowlistApi = require("./curriculum-operator-mutation-allowlist.js");

const WEATHER = "cur-lp-weather-watchers";
const COLORS = "cur-lp-aaaaaaaaaaaaaaaa";
const LMW = "cur-lp-549b80f61dfa8d79";
const FARM = "cur-lp-preschool-farm-animals";

const CATALOG = [
  { id: WEATHER, title: "Weather Watchers", plan: "Pro", status: "published", age: "Toddler 18–24 Months" },
  { id: COLORS, title: "Colors All Around Us", plan: "Free", status: "published", age: "Preschool 3–5 Years" },
  { id: LMW, title: "Little Makers Workshop", plan: "Free", status: "draft", age: "Toddler 12–24 Months" },
  { id: FARM, title: "Farm Animals", plan: "Free", status: "published", age: "Preschool 3–5 Years" },
  { id: "cur-lp-toddler-farm-friends", title: "Toddler Farm Friends", plan: "Free", status: "published", age: "Toddler 12–24 Months" },
  { id: "cur-lp-zoo-animals-adventure", title: "Zoo Animals Adventure", plan: "Pro", status: "published", age: "Preschool 3–5 Years" },
  { id: "cur-lp-bbbbbbbbbbbbbbbb", title: "Bugs & Butterflies", plan: "Free", status: "published", age: "Preschool 3–5 Years" },
  { id: "cur-lp-cccccccccccccccc", title: "New Year's Little Celebrations", plan: "Free", status: "published", age: "Toddler 12–24 Months" },
  { id: "cur-lp-dddddddddddddddd", title: "Toddler Pro Studio", plan: "Pro", status: "published", age: "Toddler 12–24 Months" },
  { id: "cur-lp-archived-free-dup", title: "Old Free Colors Copy", plan: "Free", status: "archived", age: "Preschool 3–5 Years" },
  { id: "cur-lp-colors-duplicate-copy", title: "Colors All Around Us (copy)", plan: "Free", status: "draft", age: "Preschool 3–5 Years" },
];

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function parse(raw, lessonPlans = CATALOG) {
  return commandApi.parseOperatorCommand(raw, { phase: 7, lessonPlans });
}

function collectionRows(raw, lessonPlans = CATALOG) {
  const signals = signalsApi.extractSignals(raw);
  return targetsApi.resolveTargets({
    signals,
    parsedTitles: [],
    parsedLessonIds: [],
    lessonPlans,
    currentlySelectedLessonId: null,
    context: {},
  }).rows || [];
}

console.log("Bug 1 — printable-only cannot become image-only");
{
  const raw = "Little Makers Workshop needs better printables. Fix the printables only and leave everything else alone.";
  const p = parse(raw);
  const a = p.command.actions;
  ok(p.command.scope.lessonIds[0] === LMW, "C resolves LMW");
  ok(a.createLesson !== true, "C not create");
  ok(a.generatePrintables === true, "C generatePrintables");
  ok(a.replaceBadImages !== true, "C no replaceBadImages");
  ok(a.generateImages !== true, "C no generateImages");
  ok(a.touchCover !== true, "C no cover");
  ok(a.generateSongsBooks !== true, "C no songs/books");
  ok(a.publish !== true, "C no publish");
  ok(a.composeReviewDraft === true, "C composeReviewDraft");
  ok(p.interpretation?.primary === "PRINTABLE_WORK", "C primary PRINTABLE_WORK");
  ok(p.interpretation?.primary !== "ACTIVITY_IMAGE_REPAIR", "C not image repair");
}

console.log("\nBug 2 — cover-only natural language");
[
  "Change the Farm Animals cover picture to a realistic farm animal photo. Don't change anything else.",
  "Replace the cover photo on Farm Animals.",
  "Fix only the cover image for Farm Animals.",
].forEach((raw) => {
  const p = parse(raw);
  const a = p.command.actions;
  ok(p.command.scope.lessonIds[0] === FARM, `cover resolves Farm Animals: ${raw.slice(0, 40)}`);
  ok(a.createLesson !== true, `cover not create: ${raw.slice(0, 40)}`);
  ok(a.touchCover === true, `cover touchCover: ${raw.slice(0, 40)}`);
  ok(a.generateImages !== true, `cover no activity generateImages: ${raw.slice(0, 40)}`);
  ok(a.replaceBadImages !== true, `cover no replaceBadImages: ${raw.slice(0, 40)}`);
  ok(a.generatePrintables !== true, `cover no printables: ${raw.slice(0, 40)}`);
  ok(a.generateSongsBooks !== true, `cover no songs/books: ${raw.slice(0, 40)}`);
  ok(a.publish !== true, `cover no publish: ${raw.slice(0, 40)}`);
  ok(a.composeReviewDraft === true || a.saveDraft === true, `cover draft save: ${raw.slice(0, 40)}`);
  ok(p.interpretation?.primary === "COVER_WORK", `cover primary COVER_WORK: ${raw.slice(0, 40)}`);
  ok(p.command.completion?.mutationsEnabled === true, `cover runnable: ${raw.slice(0, 40)}`);
});
{
  const image = parse("Go through Colors All Around Us and fix the pictures that are bad. Keep the good ones. Don't change the lesson plan.",
    CATALOG.filter((row) => row.id !== "cur-lp-colors-duplicate-copy"));
  ok(image.interpretation?.primary === "ACTIVITY_IMAGE_REPAIR", "ordinary activity-image command still works");
  ok(image.command.actions.touchCover !== true, "ordinary image command does not touch cover");
}

console.log("\nBug 3 — negated research-only");
[
  "Research the best ways to teach toddlers about emotions. Don't make or change a lesson yet.",
  "Research colors but do not create anything.",
  "Research weather ideas and don't change my existing lesson.",
  "Research only. I may make a lesson later.",
].forEach((raw) => {
  const p = parse(raw);
  ok(p.command.intent === "research_only", `research_only: ${raw.slice(0, 50)}`);
  ok(p.command.actions.createLesson !== true, `no create: ${raw.slice(0, 50)}`);
  ok(p.command.completion?.mutationsEnabled !== true, `no mutations: ${raw.slice(0, 50)}`);
  ok(!(p.confirmReasons || []).some((r) => /research_then_/.test(r)), `no staged confirm: ${raw.slice(0, 50)}`);
  ok(p.command.actions.publish !== true, `no publish: ${raw.slice(0, 50)}`);
});
{
  const create = parse("Research good activities for toddlers learning colors, then make me a lesson from what you find.");
  ok(create.command.intent === "research_then_create", "research then create still stages");
  ok((create.confirmReasons || []).includes("research_then_lesson_confirmation_required"), "create confirm required");
  const update = parse("Research better weather activities and then use what you find to improve Weather Watchers.");
  ok(update.command.intent === "research_then_update", "research then update still stages");
  ok(update.command.scope.lessonIds.includes(WEATHER), "update keeps Weather Watchers");
}

console.log("\nBug 4 — published FREE excludes drafts");
{
  const published = "Go through my published FREE lesson plans and replace bad activity images. Keep the good ones.";
  const p = parse(published);
  const rows = collectionRows(published);
  ok(p.command.scope.plan === "Free", "published FREE plan Free");
  ok(p.interpretation?.primary === "ACTIVITY_IMAGE_REPAIR", "published FREE image repair");
  ok(rows.every((row) => row.status === "published"), "published FREE rows are published only");
  ok(rows.every((row) => row.plan === "Free"), "published FREE rows are Free");
  ok(!rows.some((row) => row.id === LMW), "published FREE excludes LMW draft");
  ok(!rows.some((row) => row.id === "cur-lp-colors-duplicate-copy"), "published FREE excludes draft copy");
  ok(!rows.some((row) => row.id === "cur-lp-dddddddddddddddd"), "published FREE excludes Pro");
  ok(!(p.confirmReasons || []).includes("ambiguous_scope"), "intentional collection is not ambiguous_scope");
  ok(p.ambiguous !== true, "intentional collection not ambiguous");

  const allFree = "Go through all FREE lessons and replace bad activity images.";
  const allRows = collectionRows(allFree);
  ok(allRows.some((row) => row.status === "draft"), "all FREE may include drafts");
}

console.log("\nBug 5 — don't publish must not create publish_requested");
{
  const raw = "Can you go through Little Makers Workshop completely and fix anything that looks unfinished or weak? Make sure the activities make sense for toddlers 12 to 24 months, check the pictures, books and songs, and make useful printables if it needs them. Keep anything that's already good and don't publish it. I just want it ready for me to look over.";
  const p = parse(raw);
  ok(p.command.scope.lessonIds[0] === LMW, "N resolves LMW");
  ok(p.command.actions.publish !== true, "N publish false");
  ok(!(p.confirmReasons || []).includes("publish_requested"), "N no publish_requested");
  ok(p.command.actions.createLesson !== true, "N not create");
  const explicit = parse("Publish this lesson");
  ok((explicit.confirmReasons || []).includes("publish_requested"), "affirmative publish still flags publish_requested");
}

console.log("\nBaseline regressions A/B/F/G/H/L + typo E");
{
  const a = parse("Fix Weather Watchers. Go through the lesson and improve anything weak or missing, but don't change things that are already good. Leave it ready for me to review.");
  ok(a.command.scope.lessonIds[0] === WEATHER && a.command.actions.createLesson !== true, "A update Weather Watchers");
  ok(a.command.actions.publish !== true, "A no publish");

  const b = parse(
    "Go through Colors All Around Us and fix the pictures that are bad or don't match the activities. Keep the good ones. Don't change the lesson plan.",
    CATALOG.filter((row) => row.id !== "cur-lp-colors-duplicate-copy"),
  );
  ok(b.interpretation?.primary === "ACTIVITY_IMAGE_REPAIR", "B image-only");
  ok(b.command.actions.generatePrintables !== true, "B no printables");

  const f = parse("Only fix the vocabulary in Little Makers Workshop. Nothing else.");
  ok(f.interpretation?.primary === "VOCABULARY_WORK", "F vocab-only");
  ok((f.command.actions.weeklyFieldScope || []).includes("vocabCards"), "F vocab scope");

  const g = parse("Improve Weather Watchers but don't touch the pictures or printables.");
  ok(g.command.actions.generateImages !== true && g.command.actions.generatePrintables !== true, "G exclusions hard");

  const h = parse("Make me a toddler lesson plan about pets with activities, realistic activity pictures, and matching printables.");
  ok(h.command.actions.createLesson === true, "H create");
  ok(h.command.actions.publish !== true, "H no publish");

  const l = parse("Fix the animal lesson.");
  ok(l.ambiguous === true || (l.confirmReasons || []).includes("ambiguous_scope"), "L fail-closed");
  ok(l.command.actions.createLesson !== true, "L no create");

  const e = parse("fix the picures in my preshool farm animlas lesson but dont mess with anything else");
  ok(e.command.scope.lessonIds[0] === FARM, "E uniquely resolves preschool Farm Animals");
  ok(e.interpretation?.primary === "ACTIVITY_IMAGE_REPAIR", "E image-only");
  ok(e.command.actions.generatePrintables !== true, "E no printables");
  ok(e.command.actions.publish !== true, "E no publish");
}

console.log("\nAllowlist / publish safety");
{
  const c = parse("Little Makers Workshop needs better printables. Fix the printables only and leave everything else alone.");
  const al = allowlistApi.buildMutationAllowlist(c.command, { lessonIds: [LMW] });
  ok(al.publishAllowed !== true, "printable allowlist publish denied");
  ok(al.assets?.printables === true, "printable allowlist allows printables");
  ok(al.assets?.images !== true, "printable allowlist denies images");
}

console.log(`\nNL bugfix QA passed ${passed} assertions.`);
