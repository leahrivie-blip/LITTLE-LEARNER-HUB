#!/usr/bin/env node
/**
 * Generate v3 import .txt files from preschool-pro-lesson-data.js
 * Run: node scripts/generate-preschool-pro-imports.js
 */
const fs = require("fs");
const path = require("path");
const { formatLessonPlan } = require("./lib/preschool-import-format.js");
const { LESSON_PLANS } = require("./lib/preschool-pro-lesson-data.js");

const OUT_DIR = path.join(__dirname, "curriculum-preschool-pro-imports");

const FILE_NAMES = [
  "01-preschool-fairy-tale-adventures-pro.txt",
  "02-preschool-dinosaur-discovery-pro.txt",
  "03-preschool-space-adventure-pro.txt",
  "04-preschool-stem-explorers-pro.txt",
  "05-preschool-transportation-adventures-pro.txt",
  "06-preschool-healthy-habits-pro.txt",
  "07-preschool-around-the-world-pro.txt",
  "08-preschool-ocean-explorers-pro.txt",
  "09-preschool-seasons-of-the-year-pro.txt",
  "10-preschool-kindergarten-readiness-pro.txt",
];

if (LESSON_PLANS.length !== FILE_NAMES.length) {
  console.error(`Expected ${FILE_NAMES.length} lesson plans, found ${LESSON_PLANS.length}`);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

FILE_NAMES.forEach((fileName, index) => {
  const plan = LESSON_PLANS[index];
  const outPath = path.join(OUT_DIR, fileName);
  const text = formatLessonPlan(plan, {
    planTier: "Pro",
    status: "published",
    ageGroup: "Preschool 3-5 Years",
  });
  fs.writeFileSync(outPath, text, "utf8");
  const activityCount = Object.values(plan.days || {}).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`Wrote ${fileName} (${plan.title}, ${activityCount} activities)`);
});

console.log(`\nSuccess: generated ${FILE_NAMES.length} import files in ${OUT_DIR}`);
