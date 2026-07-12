#!/usr/bin/env node
/**
 * Build scripts/lib/preschool-pro-lesson-data.js from raw paste text.
 * Run: node scripts/build-preschool-pro-lesson-data.js
 */
const fs = require("fs");
const path = require("path");
const { parsePreschoolProRaw, readPreschoolProRawPaste } = require("./lib/parse-preschool-pro-raw.js");

const OUT_PATH = path.join(__dirname, "lib/preschool-pro-lesson-data.js");

const raw = readPreschoolProRawPaste();
const plans = parsePreschoolProRaw(raw);

if (plans.length !== 10) {
  console.error(`Expected 10 lesson plans, parsed ${plans.length}`);
  process.exit(1);
}

const body = `module.exports = { LESSON_PLANS: ${JSON.stringify(plans, null, 2)} };\n`;
fs.writeFileSync(OUT_PATH, body, "utf8");

plans.forEach((plan) => {
  const count = Object.values(plan.days || {}).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`${plan.title}: ${count} activities`);
});
console.log(`\nWrote ${OUT_PATH}`);
