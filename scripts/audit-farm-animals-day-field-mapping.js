#!/usr/bin/env node
/**
 * Report-only audit of Farm Animals day-field placement.
 * Does NOT rewrite or publish curriculum.
 *
 * Usage:
 *   node scripts/audit-farm-animals-day-field-mapping.js [path-to-lesson-plan.json]
 */
const fs = require("node:fs");
const path = require("node:path");
const {
  auditLessonDayFieldMappings,
} = require("./curriculum-day-field-mapping.js");

const ROOT = path.join(__dirname, "..");
const DEFAULT_SOURCES = [
  "/opt/cursor/artifacts/farm-tk-audit/lesson-plan.json",
  path.join(ROOT, "artifacts/farm-tk-audit/lesson-plan.json"),
];
const OUT_DIR = process.env.AUDIT_OUT_DIR
  || path.join("/opt/cursor/artifacts", "signed-in-nav-feedback-print");

function loadPlan(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return raw.lessonPlan || raw.plan || raw;
}

function main() {
  const argPath = process.argv[2];
  const source = argPath
    || DEFAULT_SOURCES.find((candidate) => fs.existsSync(candidate));
  if (!source) {
    console.error("No Farm Animals lesson-plan.json found. Pass a path.");
    process.exit(2);
  }
  const plan = loadPlan(source);
  if (!/farm animals/i.test(String(plan.title || "")) && !String(plan.id || "").includes("farm-animals")) {
    console.warn(`Warning: plan title/id does not look like Farm Animals (${plan.title || plan.id})`);
  }
  const audit = auditLessonDayFieldMappings(plan);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outJson = path.join(OUT_DIR, "farm-animals-day-field-mapping-audit.json");
  const outMd = path.join(OUT_DIR, "farm-animals-day-field-mapping-audit.md");
  fs.writeFileSync(outJson, JSON.stringify({ source, audit }, null, 2));

  const lines = [
    "# Farm Animals day-field mapping audit",
    "",
    `Source: \`${source}\``,
    `Plan: **${audit.title || "(untitled)"}** (\`${audit.planId || ""}\`)`,
    `Issues: **${audit.issueCount}** across days: ${audit.daysWithIssues.join(", ") || "(none)"}`,
    "",
    "This audit does **not** rewrite or publish curriculum content.",
    "",
  ];
  for (const day of audit.days) {
    lines.push(`## ${day.day}`);
    lines.push("");
    const fields = day.fields || {};
    for (const key of ["circleTime", "outdoorPlay", "familyConnection", "observations", "safetyNotes", "schedule", "adaptations"]) {
      if (fields[key]) lines.push(`- **${key}:** ${fields[key].replace(/\s+/g, " ").slice(0, 220)}`);
    }
    lines.push("");
    if (!day.issues.length) {
      lines.push("_No placement issues detected for this day._");
      lines.push("");
      continue;
    }
    for (const issue of day.issues) {
      lines.push(`- \`${issue.code}\` on **${issue.field}**: ${issue.message}`);
      lines.push(`  - Expected: ${issue.expected}`);
      lines.push(`  - Evidence: ${issue.evidence}`);
    }
    lines.push("");
  }
  fs.writeFileSync(outMd, `${lines.join("\n")}\n`);
  console.log(JSON.stringify({
    ok: audit.ok,
    issueCount: audit.issueCount,
    daysWithIssues: audit.daysWithIssues,
    outJson,
    outMd,
  }, null, 2));
  // Exit 0 even when issues exist — this is a report, not a rewrite gate for this PR.
  process.exit(0);
}

main();
