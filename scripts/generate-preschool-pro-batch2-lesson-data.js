#!/usr/bin/env node
/**
 * Build scripts/lib/preschool-pro-batch2-lesson-data.js
 * Run: node scripts/generate-preschool-pro-batch2-lesson-data.js
 */
const fs = require("fs");
const path = require("path");
const { generateLessonPlans } = require("./lib/preschool-pro-batch2-generator.js");

const OUT_PATH = path.join(__dirname, "lib/preschool-pro-batch2-lesson-data.js");
const plans = generateLessonPlans();

if (plans.length !== 10) {
  console.error(`Expected 10 lesson plans, generated ${plans.length}`);
  process.exit(1);
}

plans.forEach((plan) => {
  const count = Object.values(plan.days || {}).reduce((sum, arr) => sum + arr.length, 0);
  if (count !== 15) {
    console.error(`${plan.title}: expected 15 activities, got ${count}`);
    process.exit(1);
  }
});

const body = `module.exports = { LESSON_PLANS: ${JSON.stringify(plans, null, 2)} };\n`;
fs.writeFileSync(OUT_PATH, body, "utf8");

plans.forEach((plan) => {
  const count = Object.values(plan.days).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`${plan.title}: ${count} activities`);
});
console.log(`\nWrote ${OUT_PATH}`);
