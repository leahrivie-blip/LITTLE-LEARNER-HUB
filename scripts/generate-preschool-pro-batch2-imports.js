#!/usr/bin/env node
/**
 * Generate v3 import .txt files from preschool-pro-batch2-lesson-data.js
 * Run: node scripts/generate-preschool-pro-batch2-imports.js
 */
const fs = require("fs");
const path = require("path");
const { formatLessonPlan } = require("./lib/preschool-import-format.js");
const { LESSON_PLANS } = require("./lib/preschool-pro-batch2-lesson-data.js");

const OUT_DIR = path.join(__dirname, "curriculum-preschool-pro-batch2-imports");

const FILE_NAMES = [
  "11-preschool-animal-habitats-pro.txt",
  "12-preschool-construction-zone-pro.txt",
  "13-preschool-camping-adventure-pro.txt",
  "14-preschool-little-scientists-pro.txt",
  "15-preschool-amazing-insects-pro.txt",
  "16-preschool-inventors-workshop-pro.txt",
  "17-preschool-archaeology-adventure-pro.txt",
  "18-preschool-gardening-plant-life-pro.txt",
  "19-preschool-pet-pals-pro.txt",
  "20-preschool-zoo-adventure-pro.txt",
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
