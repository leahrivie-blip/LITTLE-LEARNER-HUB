#!/usr/bin/env node
/**
 * Flexible learning-domain importer mapping tests.
 * Run: node scripts/test-learning-domain-mapping.js
 */
const assert = require("node:assert/strict");
const domains = require("./curriculum-learning-domains.js");
require("./curriculum-lesson-import-parser.js");
const parser = require("./curriculum-lesson-import-parser.js");
require("./curriculum-lesson-import-v4.js");
const v4 = require("./curriculum-lesson-import-v4.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    failed += 1;
  }
}

test("Math variants map to official Math", () => {
  for (const wording of ["Math", "Mathematics", "Early Math", "math", "MATH", "Numbers", "Counting"]) {
    const result = domains.resolveLearningDomainsWithConfidence(wording);
    assert.deepEqual(result.domains, ["Math"], wording);
    assert.equal(result.mappings[0].confidence === "high" || result.mappings[0].confidence === "medium", true);
  }
});

test("Math and Science splits into two official domains", () => {
  const result = domains.resolveLearningDomainsWithConfidence("Math and Science");
  assert.deepEqual(result.domains, ["Math", "Science"]);
});

test("Fine-motor and SEL aliases", () => {
  assert.deepEqual(domains.parseLearningDomainsList("Fine-motor"), ["Physical Development"]);
  assert.deepEqual(domains.parseLearningDomainsList("SEL"), ["Social Emotional"]);
  assert.deepEqual(domains.parseLearningDomainsList("social emotional"), ["Social Emotional"]);
});

test("Literacy/Language and Music & Movement map to official domains", () => {
  assert.deepEqual(domains.parseLearningDomainsList("Literacy/Language"), ["Language & Literacy"]);
  assert.deepEqual(domains.parseLearningDomainsList("Music & Movement"), ["Creative Arts"]);
  assert.deepEqual(domains.parseLearningDomainsList("Pretend Play"), ["Creative Arts"]);
});

test("Movement stays low-confidence / needs review", () => {
  const result = domains.resolveLearningDomainsWithConfidence("Movement");
  assert.equal(result.domains.length, 0);
  assert.equal(result.mappings[0].confidence, "low");
  assert.ok(result.unmatched.length);
});

test("Misspelling mathematicss maps medium confidence to Math", () => {
  const result = domains.resolveLearningDomainsWithConfidence("mathematicss");
  assert.deepEqual(result.domains, ["Math"]);
  assert.equal(result.mappings[0].confidence, "medium");
});

test("Custom synonym overrides builtin map", () => {
  const result = domains.resolveLearningDomainsWithConfidence("Number Fun", {
    synonyms: [{ from: "Number Fun", to: "Math" }],
  });
  assert.deepEqual(result.domains, ["Math"]);
});

test("Parser exports parseLearningDomainsList and resolves Math", () => {
  assert.deepEqual(parser.parseLearningDomainsList("Math"), ["Math"]);
  assert.deepEqual(parser.parseLearningDomainsList("Mathematics"), ["Math"]);
});

test("V4 Smart Import maps LEARNING_DOMAINS Math instead of raw-splitting", () => {
  const sample = `
Title:
Math Makers Week
Age Group:
Preschool
Theme:
Early Math
Learning Domains:
Math, Science
Weekly Overview:
Children explore counting.
Learning Objectives:
Count to five.
Monday
Daily Theme:
Counting Day
Activity: Count the Blocks
Category:
Fine Motor
Description:
Children count blocks.
Materials:
Blocks
Directions:
1. Count together.
Teacher Role:
Model counting.
Learning Goals:
Number sense
`;
  const parseFn = v4.parseCurriculumLessonPlanImportV4
    || globalThis.CurriculumLessonImportParser?.parseCurriculumLessonPlanImportV4;
  assert.ok(typeof parseFn === "function", "V4 parser missing");
  const parsed = parseFn(sample);
  const data = parsed?.data || parsed;
  assert.ok(data, "expected parse data");
  assert.ok((data.learningDomains || []).includes("Math"), JSON.stringify(data.learningDomains));
  assert.ok((data.learningDomains || []).includes("Science"), JSON.stringify(data.learningDomains));
  assert.ok(!(data.learningDomains || []).includes("Mathematics"));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
