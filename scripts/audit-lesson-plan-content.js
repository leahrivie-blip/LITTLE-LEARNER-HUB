#!/usr/bin/env node
/**
 * Full lesson plan content completeness + curriculum standards audit.
 * Scans curriculum import libraries (and optionally live admin/public payloads).
 *
 * Enforces Little Learner Hub Curriculum Standards:
 * - Developmental appropriateness heuristics by age band
 * - Gold-standard weekly / daily / activity field completeness
 * - Required age-group plan components (toddler + preschool)
 *
 * Usage:
 *   node scripts/audit-lesson-plan-content.js
 *   LLH_PROD_URL=https://little-learner-hub.onrender.com node scripts/audit-lesson-plan-content.js
 */
const fs = require("fs");
const path = require("path");
const {
  auditLessonPlanAgainstStandards,
} = require("./curriculum-standards.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.LLH_ARTIFACT_DIR || "/opt/cursor/artifacts/july-rebuild-audits";

let parseCurriculumLessonPlanImport;
try {
  ({ parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js"));
} catch (error) {
  console.error("Parser unavailable:", error.message);
  process.exit(1);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function walkTxtFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTxtFiles(full, acc);
    else if (entry.isFile() && entry.name.endsWith(".txt")) acc.push(full);
  }
  return acc;
}

function auditPlan(plan, source) {
  const result = auditLessonPlanAgainstStandards(plan, { source });
  return {
    ...result,
    plan: plan?.plan || "",
  };
}

function main() {
  ensureDir(OUT_DIR);
  const importDirs = [
    "scripts/curriculum-preschool-free-imports",
    "scripts/curriculum-preschool-pro-imports",
    "scripts/curriculum-preschool-pro-batch2-imports",
    "scripts/curriculum-preschool-holiday-imports",
    "scripts/curriculum-preschool-summer-imports",
    "scripts/curriculum-preschool-priority-imports",
    "scripts/curriculum-phase-2f-imports",
    "scripts/curriculum-infant-imports",
    "scripts/curriculum-infant-core-imports",
    "scripts/curriculum-infant-summer-imports",
    "scripts/curriculum-infant-holiday-imports",
    "scripts/curriculum-toddler-imports",
    "scripts/curriculum-toddler-core-imports",
    "scripts/curriculum-toddler-pro-imports",
    "scripts/curriculum-toddler-holiday-imports",
  ].map((rel) => path.join(ROOT, rel));

  const files = importDirs.flatMap((dir) => walkTxtFiles(dir));
  const results = [];
  const parseFailures = [];

  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = parseCurriculumLessonPlanImport(raw);
    if (!parsed.ok || !parsed.data) {
      parseFailures.push({ source: path.relative(ROOT, file), errors: parsed.errors || ["parse failed"] });
      results.push({
        id: path.basename(file),
        title: path.basename(file),
        source: path.relative(ROOT, file),
        activityCount: 0,
        issueCount: 1,
        blockingIssueCount: 1,
        complete: false,
        issues: [{ severity: "critical", code: "parse_failed", detail: (parsed.errors || []).join("; ") || "parse failed" }],
      });
      continue;
    }
    results.push(auditPlan(parsed.data, path.relative(ROOT, file)));
  }

  const incomplete = results.filter((r) => !r.complete || r.issueCount > 0);
  const critical = results.filter((r) => r.issues.some((i) => i.severity === "critical"));
  const overviewOnly = results.filter((r) => r.issues.some((i) => i.code === "no_activities" || i.code === "empty_weekday"));
  const ageInappropriate = results.filter((r) => r.issues.some((i) => i.code === "age_inappropriate" || i.code === "missing_age_component"));
  const goldGaps = results.filter((r) => r.issues.some((i) => i.code === "missing_gold_field" || i.code === "insufficient_directions"));

  const summary = {
    scannedFiles: files.length,
    completePlans: results.filter((r) => r.complete).length,
    incompletePlans: incomplete.length,
    criticalPlans: critical.length,
    overviewOnlyRisk: overviewOnly.length,
    ageAppropriatenessFlags: ageInappropriate.length,
    goldStandardGaps: goldGaps.length,
    parseFailures: parseFailures.length,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    standards: "Little Learner Hub Curriculum Standards (gold standard + age bands)",
    summary,
    incomplete: incomplete.map((r) => ({
      title: r.title,
      age: r.age,
      ageBand: r.ageBand,
      plan: r.plan,
      source: r.source,
      activityCount: r.activityCount,
      componentCoverage: r.componentCoverage,
      issues: r.issues,
    })),
    parseFailures,
  };

  fs.writeFileSync(path.join(OUT_DIR, "lesson-content-audit.json"), JSON.stringify(report, null, 2));

  const md = [
    `# Lesson Plan Content Audit`,
    ``,
    `Generated: ${report.generatedAt}`,
    ``,
    `Standards: ${report.standards}`,
    ``,
    `## Summary`,
    ``,
    `- Scanned import files: **${summary.scannedFiles}**`,
    `- Complete (gold standard): **${summary.completePlans}**`,
    `- Incomplete: **${summary.incompletePlans}**`,
    `- Critical: **${summary.criticalPlans}**`,
    `- Empty-weekday / overview-only risk: **${summary.overviewOnlyRisk}**`,
    `- Age-appropriateness / missing component flags: **${summary.ageAppropriatenessFlags}**`,
    `- Gold-standard field gaps: **${summary.goldStandardGaps}**`,
    `- Parse failures: **${summary.parseFailures}**`,
    ``,
    `## Incomplete plans`,
    ``,
  ];
  if (!incomplete.length) {
    md.push("_No incomplete plans found in scanned import libraries._", "");
  } else {
    for (const plan of incomplete.slice(0, 200)) {
      md.push(`### ${plan.title || plan.source}`);
      md.push(`- Source: \`${plan.source}\``);
      md.push(`- Age: ${plan.age || "—"} · Band: ${plan.ageBand || "—"} · Tier: ${plan.plan || "—"} · Activities: ${plan.activityCount}`);
      for (const issue of plan.issues) {
        md.push(`- **[${issue.severity}]** ${issue.code}: ${issue.detail}`);
      }
      md.push("");
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, "lesson-content-audit.md"), md.join("\n"));

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report: ${path.join(OUT_DIR, "lesson-content-audit.md")}`);
  if (summary.criticalPlans > 0) process.exitCode = 1;
}

main();
