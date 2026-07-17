#!/usr/bin/env node
/**
 * Audit + repair readiness for Teacher Weekly Planner (no empty cells).
 * Run: node scripts/audit-teacher-weekly-planner.js
 */
const fs = require("fs");
const path = require("path");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
require("./lesson-plan-weekly-export.js");
const {
  buildTeacherPlannerDays,
  validateTeacherPlannerDays,
  repairLessonPlanForPlanner,
  auditPlanPlannerReadiness,
} = require("./llh-teacher-weekly-planner.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = "/opt/cursor/artifacts";
const REPORT_JSON = path.join(OUT_DIR, "teacher-weekly-planner-audit.json");
const REPORT_MD = path.join(OUT_DIR, "teacher-weekly-planner-audit.md");

const IMPORT_DIRS = [
  "scripts/curriculum-preschool-free-imports",
  "scripts/curriculum-preschool-pro-imports",
  "scripts/curriculum-preschool-pro-batch2-imports",
  "scripts/curriculum-preschool-holiday-imports",
  "scripts/curriculum-preschool-summer-imports",
  "scripts/curriculum-preschool-priority-imports",
  "scripts/curriculum-phase-2f-imports",
  "scripts/curriculum-infant-imports",
  "scripts/curriculum-infant-summer-imports",
  "scripts/curriculum-infant-holiday-imports",
  "scripts/curriculum-toddler-imports",
  "scripts/curriculum-toddler-pro-imports",
  "scripts/curriculum-toddler-holiday-imports",
  "scripts/curriculum-import-samples",
].map((rel) => path.join(ROOT, rel));

function walkTxtFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTxtFiles(full, acc);
    else if (entry.isFile() && entry.name.endsWith(".txt")) acc.push(full);
  }
  return acc;
}

function countDayGaps(plan) {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const gaps = [];
  days.forEach((day) => {
    const dayPlan = plan.dailyPlans?.[day] || {};
    const items = Array.isArray(dayPlan.items) ? dayPlan.items : [];
    const circle = Array.isArray(dayPlan.circleTime) ? dayPlan.circleTime.filter(Boolean) : [];
    if (!String(dayPlan.theme || plan.theme || "").trim()) gaps.push(`${day}: missing theme`);
    if (!circle.length) gaps.push(`${day}: missing circle time`);
    if (items.length < 3) gaps.push(`${day}: only ${items.length} activities`);
    if (!String(dayPlan.outdoorPlay || "").trim()) gaps.push(`${day}: missing outdoor play`);
    if (!(Array.isArray(dayPlan.books) && dayPlan.books.length) && !(Array.isArray(plan.books) && plan.books.length)) {
      gaps.push(`${day}: missing book`);
    }
  });
  return gaps;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = IMPORT_DIRS.flatMap((dir) => walkTxtFiles(dir));
  const rows = [];
  let parseFailures = 0;

  files.forEach((file) => {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = parseCurriculumLessonPlanImport(raw);
    if (!parsed.ok || !parsed.data) {
      parseFailures += 1;
      rows.push({
        source: path.relative(ROOT, file),
        title: path.basename(file),
        age: "",
        parseOk: false,
        sourceGaps: ["parse_failed"],
        readyBeforeRepair: false,
        readyAfterRepair: false,
        missingBefore: ["parse_failed"],
        missingAfter: ["parse_failed"],
      });
      return;
    }
    const plan = parsed.data;
    const readiness = auditPlanPlannerReadiness(plan);
    rows.push({
      source: path.relative(ROOT, file),
      title: readiness.title,
      age: readiness.age || plan.age || "",
      parseOk: true,
      sourceGaps: countDayGaps(plan),
      readyBeforeRepair: readiness.readyBeforeRepair,
      readyAfterRepair: readiness.readyAfterRepair,
      missingBefore: readiness.missingBefore,
      missingAfter: readiness.missingAfter,
    });
  });

  // Prove ocean sample densifies to zero empty cells.
  const oceanPath = path.join(ROOT, "scripts/curriculum-import-samples/ocean-explorers-chatgpt-format.txt");
  const ocean = parseCurriculumLessonPlanImport(fs.readFileSync(oceanPath, "utf8"));
  const oceanBuilt = buildTeacherPlannerDays(repairLessonPlanForPlanner(ocean.data), { validate: true });
  const oceanValidation = validateTeacherPlannerDays(oceanBuilt.days);
  if (!oceanValidation.ok) {
    throw new Error(`Ocean sample planner still incomplete: ${oceanValidation.message}`);
  }

  const needingRepair = rows.filter((row) => row.parseOk && !row.readyBeforeRepair);
  const stillBroken = rows.filter((row) => row.parseOk && !row.readyAfterRepair);
  const byAge = ["Infant", "Toddler", "Preschool"].map((age) => {
    const ageRows = rows.filter((row) => String(row.age).toLowerCase().includes(age.toLowerCase()));
    return {
      age,
      total: ageRows.length,
      incompleteSource: ageRows.filter((row) => row.sourceGaps.length).length,
      readyBefore: ageRows.filter((row) => row.readyBeforeRepair).length,
      readyAfter: ageRows.filter((row) => row.readyAfterRepair).length,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    scannedFiles: files.length,
    parseFailures,
    readyBeforeRepair: rows.filter((row) => row.readyBeforeRepair).length,
    readyAfterRepair: rows.filter((row) => row.readyAfterRepair).length,
    needingRepair: needingRepair.length,
    stillBrokenAfterRepair: stillBroken.length,
    byAge,
    oceanSampleComplete: oceanValidation.ok,
    incompleteSources: needingRepair.map((row) => ({
      title: row.title,
      age: row.age,
      source: row.source,
      sourceGaps: row.sourceGaps,
      missingBefore: row.missingBefore,
    })),
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  const md = [
    "# Teacher Weekly Planner Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Scanned files: **${report.scannedFiles}**`,
    `- Ready before repair: **${report.readyBeforeRepair}**`,
    `- Ready after autofill/repair: **${report.readyAfterRepair}**`,
    `- Source plans needing densify/repair: **${report.needingRepair}**`,
    `- Still broken after repair: **${report.stillBrokenAfterRepair}**`,
    `- Ocean sample complete: **${report.oceanSampleComplete}**`,
    "",
    "## By age group",
    "",
    ...byAge.map((entry) => `- **${entry.age}**: ${entry.total} plans · ${entry.incompleteSource} source gaps · ${entry.readyAfter}/${entry.total} ready after repair`),
    "",
    "## Root cause",
    "",
    "Sparse `activitySlots` (category preference left null holes), missing daily circle/outdoor fields, and single-activity weekdays caused empty planner boxes. Runtime repair densifies every Mon–Fri cell before PDF generation; export shaping no longer leaves slot holes.",
    "",
    "## Plans with source gaps (before autofill)",
    "",
    ...(report.incompleteSources.length
      ? report.incompleteSources.slice(0, 40).map((row) => `- **${row.title}** (${row.age}) — ${row.sourceGaps.slice(0, 4).join("; ")}`)
      : ["- None"]),
    "",
  ].join("\n");
  fs.writeFileSync(REPORT_MD, md);

  console.log(JSON.stringify({
    scannedFiles: report.scannedFiles,
    readyBeforeRepair: report.readyBeforeRepair,
    readyAfterRepair: report.readyAfterRepair,
    needingRepair: report.needingRepair,
    stillBrokenAfterRepair: report.stillBrokenAfterRepair,
    oceanSampleComplete: report.oceanSampleComplete,
    reportJson: REPORT_JSON,
    reportMd: REPORT_MD,
  }, null, 2));

  if (report.stillBrokenAfterRepair > 0 || !report.oceanSampleComplete) {
    process.exit(1);
  }
}

main();
