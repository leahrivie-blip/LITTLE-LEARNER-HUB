#!/usr/bin/env node
/**
 * Upgrade curriculum import lesson plans to Little Learner Hub Curriculum Standards.
 *
 * Usage:
 *   node scripts/upgrade-curriculum-to-standards.js
 *   DRY_RUN=1 node scripts/upgrade-curriculum-to-standards.js
 */
const fs = require("fs");
const path = require("path");
const {
  parseCurriculumLessonPlanImport,
  formatCurriculumLessonPlanImport,
} = require("./curriculum-lesson-import-parser.js");
const { auditLessonPlanAgainstStandards } = require("./curriculum-standards.js");
const { enrichCurriculumImportPlan } = require("./curriculum-import-enrich.js");

const ROOT = path.join(__dirname, "..");
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const IMPORT_DIRS = [
  "scripts/curriculum-preschool-free-imports",
  "scripts/curriculum-preschool-pro-imports",
  "scripts/curriculum-preschool-pro-batch2-imports",
  "scripts/curriculum-preschool-holiday-imports",
  "scripts/curriculum-preschool-summer-imports",
  "scripts/curriculum-preschool-priority-imports",
  "scripts/curriculum-toddler-pro-imports",
  "scripts/curriculum-toddler-holiday-imports",
  "scripts/curriculum-phase-2f-imports",
  "scripts/curriculum-infant-summer-imports",
  "scripts/curriculum-infant-holiday-imports",
].map((rel) => path.join(ROOT, rel));

const SKIP_FILES = new Set(["legacy-backward-compat-sample.txt"]);

function walkTxtFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTxtFiles(full, acc);
    else if (entry.isFile() && entry.name.endsWith(".txt") && !SKIP_FILES.has(entry.name)) acc.push(full);
  }
  return acc;
}

function processFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseCurriculumLessonPlanImport(raw);
  if (!parsed.data) {
    return { rel, status: "skip", reason: (parsed.errors || []).join("; ") || "no data" };
  }

  const before = auditLessonPlanAgainstStandards(parsed.data, { source: rel });
  const enriched = enrichCurriculumImportPlan(parsed.data, { inventMedia: true, source: rel });
  const upgraded = enriched.plan;
  const after = enriched.audit || auditLessonPlanAgainstStandards(upgraded, { source: rel });

  const newAgeHits = after.issues.filter((i) => i.code === "age_inappropriate");
  if (newAgeHits.length) {
    return {
      rel,
      status: "blocked",
      reason: newAgeHits.map((i) => i.detail).join(" | "),
      beforeIssues: before.issueCount,
      afterIssues: after.issueCount,
    };
  }

  const text = formatCurriculumLessonPlanImport(upgraded);
  if (!DRY_RUN) fs.writeFileSync(filePath, text, "utf8");

  return {
    rel,
    status: after.complete ? "complete" : "improved",
    beforeIssues: before.issueCount,
    afterIssues: after.issueCount,
    age: upgraded.age,
    theme: upgraded.theme,
    remaining: after.complete ? [] : after.issues.slice(0, 8).map((i) => i.detail),
  };
}

function main() {
  const files = IMPORT_DIRS.flatMap((dir) => walkTxtFiles(dir));
  const results = files.map(processFile);
  const summary = {
    dryRun: DRY_RUN,
    scanned: results.length,
    complete: results.filter((r) => r.status === "complete").length,
    improved: results.filter((r) => r.status === "improved").length,
    blocked: results.filter((r) => r.status === "blocked").length,
    skipped: results.filter((r) => r.status === "skip").length,
  };
  console.log(JSON.stringify({ summary, results }, null, 2));
  if (summary.blocked) process.exitCode = 1;
}

main();
