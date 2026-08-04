#!/usr/bin/env node
/**
 * Teaching Kit — publish readiness gates + AI selection/validation (fixture-only).
 * Run: npm run test:teaching-kit-publish-gates-ai-state
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const quality = require("./teaching-kit-quality-review.js");
const enrichmentAi = require("../server/enrichment-ai.js");

const ROOT = path.join(__dirname, "..");
let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

function main() {
  const editorJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  ok(editorJs.includes("function aiSuggestionCounts"), "AI selection counter helper present");
  ok(editorJs.includes("data-ai-selection-counts"), "AI counts rendered in tray");
  ok(editorJs.includes("Counts inconsistent"), "inconsistent selection disables bulk accept");
  ok(editorJs.includes("ownerPublishOverride"), "owner override payload wired");
  ok(editorJs.includes("data-publish-override"), "owner override UI present");
  ok(editorJs.includes("publishReadinessLabel") || editorJs.includes("data-publish-readiness"), "readiness label in UI");

  const mid = {
    id: "qa-mid-gate",
    title: "QA Mid Gate",
    theme: "Weather",
    age: "Preschool",
    weeklyOverview: "A short weather week with play.",
    objectives: "Look",
    books: [],
    songs: [],
    familyConnection: "",
    enrichmentDraft: {
      week: { objectives: "Look at clouds", weeklyOverview: "A short weather week with play invitations." },
      activities: { a1: { teacherTips: [] } },
    },
    dailyPlans: { monday: [{ id: "a1", title: "Cloud Watch", category: "science" }] },
  };
  const report = quality.buildQualityReport(mid, [{ id: "a1", title: "Cloud Watch" }], mid.enrichmentDraft);
  ok(report.publishReadiness === "blocked", "mid kit blocked");
  ok(report.blocksPublish === true, "blocksPublish aligns with blocked");
  ok(report.publishReadinessLabel === "Blocked", "Blocked label");
  ok((report.blockingIssues || []).length >= 2, "serious gaps elevated to blockers");

  // AI validation rejects bad future output without touching curriculum
  const bad = enrichmentAi.filterValidatedSuggestions([
    { category: "teacher_tips", proposedText: "TODO: engage learners and unlock potential!!!" },
    { category: "books", proposedText: "A Book", title: "[book title]", author: "TBD" },
    { category: "teacher_tips", proposedText: "Offer tongs for sorting." },
    { category: "teacher_tips", proposedText: "Offer tongs for sorting." },
    { category: "observation_prompts", proposedText: "Does the child point to a cloud shape?" },
  ], {});
  ok(bad.suggestions.length === 2, `keeps only valid tips/obs (got ${bad.suggestions.length})`);
  ok(bad.rejected.some((r) => r.reason === "generic_filler" || r.reason === "placeholder" || r.reason === "doubled_punctuation"), "rejects filler/placeholder");
  ok(bad.rejected.some((r) => r.reason === "repeated_tip" || r.reason === "invented_book_author" || r.reason === "invented_book_title"), "rejects repeat/invented book");

  const prompt = enrichmentAi.buildEnrichmentAiSystemPrompt();
  ok(/never invent books/i.test(prompt) || /Do not invent books/i.test(prompt), "prompt bans invented books");
  ok(/placeholder/i.test(prompt), "prompt bans placeholders");
  ok(/repeat the same tip/i.test(prompt), "prompt bans repeated tips");

  console.log(`PASS teaching-kit publish gates + AI state (${passed} asserts)`);
}

try {
  main();
} catch (error) {
  console.error("FAIL teaching-kit publish gates + AI state:", error.message || error);
  process.exit(1);
}
