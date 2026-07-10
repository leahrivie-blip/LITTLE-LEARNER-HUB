#!/usr/bin/env node
/**
 * One-time safe converter: legacy ===SECTION=== import files -> colon-header format.
 * Preserves parsed content; does not touch legacy-backward-compat-sample.txt.
 */
const fs = require("fs");
const path = require("path");
const {
  parseCurriculumLessonPlanImport,
  formatCurriculumLessonPlanImport,
} = require("./curriculum-lesson-import-parser.js");

const IMPORT_DIR = path.join(__dirname, "curriculum-phase-2f-imports");
const SKIP = new Set(["legacy-backward-compat-sample.txt"]);

function main() {
  const files = fs.readdirSync(IMPORT_DIR).filter((file) => file.endsWith(".txt") && !SKIP.has(file));
  files.forEach((file) => {
    const filePath = path.join(IMPORT_DIR, file);
    const text = fs.readFileSync(filePath, "utf8");
    const parsed = parseCurriculumLessonPlanImport(text);
    if (!parsed.ok) {
      throw new Error(`${file}: ${parsed.errors.join(" ")}`);
    }
    const formatted = formatCurriculumLessonPlanImport(parsed.data);
    fs.writeFileSync(filePath, formatted);
    console.log(`Converted ${file} (${parsed.data._activityCount} activities)`);
  });
}

main();
