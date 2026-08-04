#!/usr/bin/env node
/**
 * Phase 6 — AI specificity validator + duplicate detection (future output only).
 * Run: npm run test:ai-specificity-phase6
 */
const assert = require("node:assert/strict");
const enrichmentAi = require("../server/enrichment-ai.js");

function fixturePlan(overrides = {}) {
  return {
    title: "ZZ QA Disposable AI Specificity Fixture",
    theme: "Ocean Shells",
    age: overrides.age || "Preschool",
    objectives: "Name shell textures and practice gentle sorting",
    weeklyOverview: "",
    ...overrides,
  };
}

function fixtureActivity(overrides = {}) {
  return {
    id: overrides.id || "qa-act-1",
    title: overrides.title || "Shell Sort Tray",
    materials: overrides.materials || "shells, tongs, sorted bowls",
    objective: overrides.objective || "sort shells by size",
    dayOfWeek: overrides.dayOfWeek || "Monday",
    steps: "1. Look at shells. 2. Sort with tongs. 3. Share one texture word.",
    ...overrides,
  };
}

function assertRejects(items, ctx, reason) {
  const result = enrichmentAi.filterValidatedSuggestions(items, ctx);
  assert.ok(
    result.rejected.some((row) => row.reason === reason),
    `expected reject reason ${reason}, got ${JSON.stringify(result.rejected)}`,
  );
  return result;
}

// --- Generic boilerplate rejected ---
{
  const ctx = { plan: fixturePlan(), activity: fixtureActivity() };
  assertRejects([
    { category: "adaptations", proposedText: "Offer a simpler choice, larger pieces, or hand-over-hand support for emerging skills." },
  ], ctx, "generic_filler");
  assertRejects([
    { category: "extensions", proposedText: "Invite families to find one related object at home and describe it at drop-off." },
  ], ctx, "generic_filler");
  assertRejects([
    { category: "substitutions", need: "specialty prop", use: "a classroom picture card or recycled box", proposedText: "No specialty prop → use a classroom picture card or recycled box" },
  ], ctx, "generic_filler");
  assertRejects([{ category: "vocabulary", proposedText: "explore" }], ctx, "generic_vocabulary");
  assertRejects([{ category: "vocabulary", proposedText: "gentle" }], ctx, "generic_vocabulary");
  assertRejects([
    { category: "books", title: "Ocean Shells Read-Aloud Favorite", author: "Classroom Collection", proposedText: "x" },
  ], ctx, "invented_book_author");
}

// --- Specificity: needs ≥2 anchors when context is rich ---
{
  const ctx = { plan: fixturePlan(), activity: fixtureActivity() };
  const vague = enrichmentAi.filterValidatedSuggestions([
    { category: "teacher_tips", proposedText: "Smile and wait patiently near the table." },
  ], ctx);
  assert.equal(vague.suggestions.length, 0, "vague tip rejected when anchors exist");
  assert.ok(vague.rejected.some((r) => r.reason === "lacks_specificity"));

  const specific = enrichmentAi.filterValidatedSuggestions([
    { category: "teacher_tips", proposedText: "For Shell Sort Tray, set shells and tongs at child height before Monday circle." },
  ], ctx);
  assert.equal(specific.suggestions.length, 1, "anchored tip kept");
}

// --- Duplicate detection across categories ---
{
  const ctx = { plan: fixturePlan(), activity: fixtureActivity() };
  const dup = enrichmentAi.filterValidatedSuggestions([
    { category: "family_connection", proposedText: "Ask families about one Ocean Shells moment from Shell Sort Tray." },
    { category: "extensions", proposedText: "Ask families about one Ocean Shells moment from Shell Sort Tray." },
    { category: "indoor_alternatives", proposedText: "Keep Shell Sort Tray indoors with shells on a quiet tray." },
    { category: "indoor_alternatives", proposedText: "Keep Shell Sort Tray indoors with shells on a quiet tray." },
  ], ctx);
  assert.ok(dup.rejected.some((r) => r.reason === "repeated_tip"), "duplicates rejected");
  assert.ok(dup.suggestions.length >= 1, "first unique rows kept");
}

// --- Library search books allowed; invented titles blocked ---
{
  const ctx = { plan: fixturePlan(), activity: fixtureActivity() };
  const search = enrichmentAi.filterValidatedSuggestions([
    {
      category: "books",
      title: "Search your classroom library for an Ocean Shells read-aloud",
      author: "Library search (unverified title)",
      questions: "What shell texture do you notice?",
      proposedText: "Search your classroom library for an Ocean Shells read-aloud",
    },
  ], ctx);
  assert.equal(search.suggestions.length, 1, "library search suggestion kept");
}

// --- Offline fixtures stay specific across age groups / sparse input ---
const ages = ["Infant", "Toddler", "Preschool"];
const beforeSamples = [];
const afterSamples = [];

for (const age of ages) {
  const plan = fixturePlan({
    age,
    weeklyOverview: age === "Infant" ? "" : "Children study ocean shells.",
  });
  const activities = [
    fixtureActivity({
      id: "qa-mon",
      title: "Shell Sort Tray",
      dayOfWeek: "Monday",
      materials: age === "Infant" ? "soft shell toys" : "shells, tongs, bowls",
    }),
    fixtureActivity({
      id: "qa-tue",
      title: "Shell Sound Match",
      dayOfWeek: "Tuesday",
      materials: "shell cards, basket",
      objective: "match shell sounds",
    }),
  ];

  // Synthetic "before" boilerplate pack (legacy generics) for duplicate-rate comparison.
  const legacy = activities.flatMap((activity) => ([
    { category: "adaptations", proposedText: "Offer a simpler choice, larger pieces, or hand-over-hand support for emerging skills.", activityKey: activity.id },
    { category: "extensions", proposedText: "Invite families to find one related object at home and describe it at drop-off.", activityKey: activity.id },
    { category: "teacher_tips", proposedText: "Offer a simpler choice, larger pieces, or hand-over-hand support for emerging skills.", activityKey: activity.id },
    { category: "family_connection", proposedText: "Invite families to find one related object at home and describe it at drop-off." },
    { category: "indoor_alternatives", proposedText: "Use a tabletop tray and quiet voices when outdoor space is unavailable.", activityKey: activity.id },
  ]));
  beforeSamples.push(enrichmentAi.measureSuggestionDuplicateRate(legacy));

  const pack = enrichmentAi.getLessonTeacherFixturePack({
    plan,
    activities,
    scope: "lesson",
    draftActivities: {},
    weekDraft: {},
  });
  assert.ok(pack.suggestions.length >= 8, `${age}: fixture pack has suggestions`);
  assert.ok(pack.suggestions.some((s) => s.category === "books"), `${age}: books present`);
  assert.ok(
    pack.suggestions.some((s) => /library search|search your classroom library/i.test(String(s.proposedText || ""))),
    `${age}: book is library search, not invented`,
  );
  assert.ok(!pack.suggestions.some((s) => /offer a simpler choice/i.test(String(s.proposedText || ""))), `${age}: no simpler-choice boilerplate`);
  assert.ok(!pack.suggestions.some((s) => /^explore$/i.test(String(s.proposedText || "").trim())), `${age}: no explore vocab`);
  assert.ok(!pack.suggestions.some((s) => /^gentle$/i.test(String(s.proposedText || "").trim())), `${age}: no gentle vocab`);

  const contentLike = pack.suggestions.filter((s) => [
    "teacher_tips", "observation_prompts", "adaptations", "extensions",
    "indoor_alternatives", "outdoor_alternatives", "family_connection",
  ].includes(s.category));
  contentLike.forEach((row) => {
    const anchors = enrichmentAi.collectLessonAnchors({ plan, activities }, row);
    const hits = anchors.filter((a) => String(row.proposedText || "").toLowerCase().includes(a)).length;
    assert.ok(hits >= 2, `${age}/${row.category} needs ≥2 anchors (got ${hits}): ${row.proposedText}`);
  });

  afterSamples.push(enrichmentAi.measureSuggestionDuplicateRate(pack.suggestions));
}

const beforeRate = beforeSamples.reduce((sum, row) => sum + row.rate, 0) / beforeSamples.length;
const afterRate = afterSamples.reduce((sum, row) => sum + row.rate, 0) / afterSamples.length;
assert.ok(afterRate < beforeRate, `duplicate rate reduced (${beforeRate} -> ${afterRate})`);
assert.ok(afterRate <= 0.15, `after duplicate rate low (got ${afterRate})`);

// Prompt rules mention specificity + no invented books
const prompt = enrichmentAi.buildEnrichmentAiSystemPrompt();
assert.match(prompt, /at least TWO lesson-specific anchors/i);
assert.match(prompt, /Do not invent books/i);
assert.match(prompt, /library-search suggestion/i);
assert.match(prompt, /public-domain songs/i);

// Empty weekdays / sparse plan still yields usable week suggestions without fabricating books
{
  const plan = fixturePlan({ theme: "Rain", title: "ZZ QA Sparse Rain Fixture" });
  const week = enrichmentAi.buildFixtureSuggestions({
    plan,
    activity: fixtureActivity({ title: "Rain Listen", materials: "rain stick" }),
    scope: "week",
    activityDraft: {},
    weekDraft: {},
  });
  assert.ok(week.length >= 5, "sparse week suggestions");
  assert.ok(week.some((s) => s.category === "songs"), "songs present");
  assert.ok(
    week.every((s) => s.category !== "books" || /search your classroom library/i.test(String(s.proposedText || s.proposedValue?.title || ""))),
    "no fabricated book titles",
  );
}

console.log(`PASS ai-specificity-phase6 (beforeDupRate=${beforeRate.toFixed(3)} afterDupRate=${afterRate.toFixed(3)})`);
