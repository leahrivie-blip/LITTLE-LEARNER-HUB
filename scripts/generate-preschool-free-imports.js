#!/usr/bin/env node
/**
 * Generate v3 import .txt files from preschool-free-lesson-data.js
 * Run: node scripts/generate-preschool-free-imports.js
 */
const fs = require("fs");
const path = require("path");
const { formatLessonPlan } = require("./lib/preschool-import-format.js");
const { LESSON_PLANS } = require("./lib/preschool-free-lesson-data.js");

const OUT_DIR = path.join(__dirname, "curriculum-preschool-free-imports");

const FILE_NAMES = [
  "01-preschool-colors-everywhere-free.txt",
  "02-preschool-all-about-me-free.txt",
  "03-preschool-letters-and-sounds-free.txt",
  "04-preschool-numbers-everywhere-free.txt",
  "05-preschool-feelings-and-emotions-free.txt",
  "06-preschool-community-helpers-free.txt",
  "07-preschool-shapes-around-us-free.txt",
  "08-preschool-weather-watchers-free.txt",
  "09-preschool-farm-animals-free.txt",
  "10-preschool-five-senses-free.txt",
];

if (LESSON_PLANS.length !== FILE_NAMES.length) {
  console.error(`Expected ${FILE_NAMES.length} lesson plans, found ${LESSON_PLANS.length}`);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

FILE_NAMES.forEach((fileName, index) => {
  const plan = LESSON_PLANS[index];
  const outPath = path.join(OUT_DIR, fileName);
  const text = formatLessonPlan(plan);
  fs.writeFileSync(outPath, text, "utf8");
  const activityCount = Object.values(plan.days || {}).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`Wrote ${fileName} (${plan.title}, ${activityCount} activities)`);
});

console.log(`\nSuccess: generated ${FILE_NAMES.length} import files in ${OUT_DIR}`);
