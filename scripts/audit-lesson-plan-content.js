#!/usr/bin/env node
/**
 * Full lesson plan content completeness audit.
 * Scans curriculum import libraries (and optionally live admin/public payloads).
 *
 * Usage:
 *   node scripts/audit-lesson-plan-content.js
 *   LLH_PROD_URL=https://little-learner-hub.onrender.com node scripts/audit-lesson-plan-content.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.LLH_ARTIFACT_DIR || "/opt/cursor/artifacts/july-rebuild-audits";
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const PLACEHOLDER_RE = /lorem ipsum|\btodo\b|\btbd\b|placeholder|coming soon|\[insert|xxx+|FIXME|TODO:/i;

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
  const issues = [];
  const title = plan?.title || "(untitled)";
  const id = plan?.id || source;
  const dailyPlans = plan?.dailyPlans || {};

  if (!String(plan?.title || "").trim()) issues.push({ severity: "high", code: "missing_title", detail: "Missing title" });
  if (!String(plan?.age || "").trim()) issues.push({ severity: "high", code: "missing_age", detail: "Missing age group" });
  if (!String(plan?.weeklyOverview || plan?.description || "").trim()) {
    issues.push({ severity: "medium", code: "missing_overview", detail: "Missing weekly overview" });
  }
  const objectives = Array.isArray(plan?.objectives) ? plan.objectives : [];
  if (!objectives.length && !String(plan?.objectives || "").trim()) {
    issues.push({ severity: "medium", code: "missing_objectives", detail: "Missing learning objectives" });
  }
  const weeklyMaterials = plan?.weeklyMaterials || plan?.materials || "";
  const weeklyMaterialsText = Array.isArray(weeklyMaterials) ? weeklyMaterials.join(" ") : String(weeklyMaterials || "");
  if (!weeklyMaterialsText.trim()) {
    issues.push({ severity: "medium", code: "missing_weekly_materials", detail: "Missing weekly materials" });
  }

  let totalActivities = 0;
  const titlesByDay = {};
  for (const day of DAYS) {
    const dayPlan = dailyPlans[day] || {};
    const items = Array.isArray(dayPlan.items) ? dayPlan.items : [];
    titlesByDay[day] = [];
    if (!items.length) {
      issues.push({ severity: "high", code: "empty_weekday", detail: `${day}: no activities` });
      continue;
    }
    items.forEach((item, index) => {
      totalActivities += 1;
      const name = String(item.title || item.name || "").trim();
      titlesByDay[day].push(name.toLowerCase());
      if (!name) issues.push({ severity: "high", code: "missing_activity_title", detail: `${day}#${index + 1}: missing activity name` });
      const directions = String(item.steps || item.directions || "").trim();
      if (!directions) issues.push({ severity: "high", code: "missing_directions", detail: `${day}: "${name || "activity"}" missing directions` });
      const materials = String(item.materials || "").trim();
      if (!materials) issues.push({ severity: "medium", code: "missing_activity_materials", detail: `${day}: "${name || "activity"}" missing materials` });
      const blob = [name, directions, materials, item.description, item.setup, item.teacherRole].join(" ");
      if (PLACEHOLDER_RE.test(blob)) {
        issues.push({ severity: "high", code: "placeholder", detail: `${day}: "${name || "activity"}" contains placeholder text` });
      }
    });
    const seen = new Map();
    titlesByDay[day].forEach((t) => {
      if (!t) return;
      seen.set(t, (seen.get(t) || 0) + 1);
    });
    for (const [t, count] of seen) {
      if (count > 1) issues.push({ severity: "medium", code: "duplicate_activity", detail: `${day}: "${t}" repeated ${count} times` });
    }
  }

  if (totalActivities === 0) {
    issues.push({ severity: "critical", code: "no_activities", detail: "Plan has no weekday activities at all (overview-only risk)" });
  }

  const textBlob = JSON.stringify(plan);
  if (PLACEHOLDER_RE.test(textBlob)) {
    if (!issues.some((i) => i.code === "placeholder")) {
      issues.push({ severity: "high", code: "placeholder", detail: "Plan JSON contains placeholder markers" });
    }
  }

  return {
    id,
    title,
    age: plan?.age || "",
    plan: plan?.plan || "",
    source,
    activityCount: totalActivities,
    issueCount: issues.length,
    issues,
  };
}

function main() {
  ensureDir(OUT_DIR);
  const importDirs = [
    "scripts/curriculum-preschool-free-imports",
    "scripts/curriculum-preschool-pro-imports",
    "scripts/curriculum-preschool-pro-batch2-imports",
    "scripts/curriculum-phase-2f-imports",
    "scripts/curriculum-infant-imports",
    "scripts/curriculum-toddler-imports",
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
        issues: [{ severity: "critical", code: "parse_failed", detail: (parsed.errors || []).join("; ") || "parse failed" }],
      });
      continue;
    }
    results.push(auditPlan(parsed.data, path.relative(ROOT, file)));
  }

  const incomplete = results.filter((r) => r.issueCount > 0);
  const critical = results.filter((r) => r.issues.some((i) => i.severity === "critical"));
  const overviewOnly = results.filter((r) => r.issues.some((i) => i.code === "no_activities" || i.code === "empty_weekday"));

  const summary = {
    scannedFiles: files.length,
    completePlans: results.length - incomplete.length,
    incompletePlans: incomplete.length,
    criticalPlans: critical.length,
    overviewOnlyRisk: overviewOnly.length,
    parseFailures: parseFailures.length,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    summary,
    incomplete: incomplete.map((r) => ({
      title: r.title,
      age: r.age,
      plan: r.plan,
      source: r.source,
      activityCount: r.activityCount,
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
    `## Summary`,
    ``,
    `- Scanned import files: **${summary.scannedFiles}**`,
    `- Complete: **${summary.completePlans}**`,
    `- Incomplete: **${summary.incompletePlans}**`,
    `- Critical: **${summary.criticalPlans}**`,
    `- Empty-weekday / overview-only risk: **${summary.overviewOnlyRisk}**`,
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
      md.push(`- Age: ${plan.age || "—"} · Tier: ${plan.plan || "—"} · Activities: ${plan.activityCount}`);
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
