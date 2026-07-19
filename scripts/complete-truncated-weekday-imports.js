#!/usr/bin/env node
/**
 * Merge theme-matched weekday activities into truncated jul2026 import sources,
 * write completed import libraries, and print a coverage report.
 *
 * Run: node scripts/complete-truncated-weekday-imports.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
const { BLUEPRINTS } = require("./lib/truncated-week-completion-data.js");

const ROOT = path.join(__dirname, "..");
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const SAMPLE_ROOT = path.join(__dirname, "curriculum-import-samples");
const OUT_DIRS = {
  "toddler-batch-jul2026": path.join(__dirname, "curriculum-toddler-core-imports"),
  "infant-batch-jul2026": path.join(__dirname, "curriculum-infant-core-imports"),
};

const DEFAULT_ADAPT = "Offer larger materials, shorter turns, and hand-over-hand support when needed.";
const DEFAULT_SAFE = "Supervise closely and keep materials developmentally safe for the age group.";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function multiline(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function formatListField(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean).join("\n");
  return multiline(value);
}

function enrichItem(item) {
  const next = { ...item };
  if (!multiline(next.adaptations)) next.adaptations = DEFAULT_ADAPT;
  if (!multiline(next.safetyNotes)) next.safetyNotes = DEFAULT_SAFE;
  if (!multiline(next.setup) && multiline(next.materials)) {
    next.setup = "Prepare materials in a child-ready space before inviting participation.";
  }
  return next;
}

function formatActivityBlock(item) {
  const goals = Array.isArray(item.learningGoals)
    ? item.learningGoals.map((g) => `- ${g}`).join("\n")
    : formatListField(item.learningGoals);
  const steps = multiline(item.steps || item.directions);
  return [
    "ACTIVITY_NAME:",
    item.title,
    "",
    "CATEGORY:",
    item.activityCategory || "Open-Ended Exploration",
    "",
    "OBJECTIVE:",
    multiline(item.objective),
    "",
    "DESCRIPTION:",
    multiline(item.description),
    "",
    "MATERIALS:",
    formatListField(item.materials),
    "",
    "SETUP:",
    multiline(item.setup),
    "",
    "TEACHER_ROLE:",
    multiline(item.teacherRole),
    "",
    "DIRECTIONS:",
    steps,
    "",
    "LEARNING_GOALS:",
    goals,
    "",
    "OBSERVATION_OPPORTUNITIES:",
    formatListField(item.observationOpportunities),
    "",
    "ADAPTATIONS:",
    multiline(item.adaptations) || DEFAULT_ADAPT,
    "",
    "SAFETY_NOTES:",
    multiline(item.safetyNotes) || DEFAULT_SAFE,
    "",
  ].join("\n");
}

function formatDaySection(day, dayPlan) {
  const label = day.toUpperCase();
  const theme = multiline(dayPlan.theme);
  const objectives = multiline(dayPlan.objectives);
  const materials = multiline(dayPlan.materials);
  const vocabulary = multiline(dayPlan.vocabulary);
  const domains = Array.isArray(dayPlan.learningDomains) ? dayPlan.learningDomains.join(", ") : "";
  const circle = formatListField(dayPlan.circleTime);
  const outdoor = multiline(dayPlan.outdoorPlay);
  const observations = formatListField(dayPlan.observations);
  const adaptations = multiline(dayPlan.adaptations);
  const safety = multiline(dayPlan.safetyNotes);
  const items = Array.isArray(dayPlan.items) ? dayPlan.items.map(enrichItem) : [];
  const parts = [`${label}:`, ""];
  if (theme) parts.push("DAILY_THEME:", theme, "");
  if (objectives) parts.push("DAILY_OBJECTIVES:", objectives, "");
  if (domains) parts.push("DAILY_LEARNING_DOMAINS:", domains, "");
  if (materials) parts.push("DAILY_MATERIALS:", materials, "");
  if (vocabulary) parts.push("DAILY_VOCABULARY:", vocabulary, "");
  if (circle) parts.push("CIRCLE_TIME:", circle, "");
  if (outdoor) parts.push("OUTDOOR_PLAY:", outdoor, "");
  if (observations) parts.push("DAILY_OBSERVATIONS:", observations, "");
  if (adaptations) parts.push("DAILY_ADAPTATIONS:", adaptations, "");
  if (safety) parts.push("SAFETY_NOTES:", safety, "");
  for (const item of items) {
    parts.push(formatActivityBlock(item));
  }
  return parts.join("\n");
}

function formatBooks(books) {
  return (Array.isArray(books) ? books : [])
    .map((book) => {
      const title = typeof book === "string" ? book : book?.title;
      const author = typeof book === "object" ? book?.author : "";
      if (!title) return "";
      return author ? `${title} | ${author}` : title;
    })
    .filter(Boolean)
    .join("\n");
}

function formatSongs(songs) {
  return (Array.isArray(songs) ? songs : [])
    .map((song) => (typeof song === "string" ? song : song?.title))
    .filter(Boolean)
    .join("\n");
}

function formatLessonFile(plan, blueprint) {
  const domains = Array.isArray(plan.learningDomains) ? plan.learningDomains.join("\n") : "";
  const parts = [
    "TITLE:",
    plan.title,
    "",
    "AGE_GROUP:",
    plan.age,
    "",
    "THEME:",
    plan.theme || plan.title,
    "",
    "PLAN:",
    blueprint.plan || plan.plan || "Pro",
    "",
    "STATUS:",
    "published",
    "",
    "LEARNING_DOMAINS:",
    domains,
    "",
    "WEEKLY_OVERVIEW:",
    multiline(plan.weeklyOverview),
    "",
    "LEARNING_OBJECTIVES:",
    multiline(plan.objectives),
    "",
    "WEEKLY_MATERIALS:",
    multiline(plan.weeklyMaterials),
    "",
    "VOCABULARY:",
    multiline(plan.vocabularyWords),
    "",
    "BOOKS:",
    formatBooks(plan.books),
    "",
    "SONGS:",
    formatSongs(plan.songs),
    "",
    "FAMILY_CONNECTION:",
    multiline(plan.familyConnection),
    "",
    "OBSERVATION_OPPORTUNITIES:",
    multiline(plan.observationOpportunities),
    "",
    "ADAPTATIONS:",
    multiline(plan.adaptations) || DEFAULT_ADAPT,
    "",
  ];

  for (const day of WEEKDAYS) {
    parts.push(formatDaySection(day, plan.dailyPlans[day] || { items: [] }));
  }
  return `${parts.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function mergePlan(stableId, blueprint) {
  const sourcePath = path.join(SAMPLE_ROOT, blueprint.sourceDir, blueprint.sourceFile);
  const raw = fs.readFileSync(sourcePath, "utf8");
  const parsed = parseCurriculumLessonPlanImport(raw, { allowIncompleteWeekdays: true });
  if (!parsed.ok || !parsed.data) {
    throw new Error(`${stableId}: parse failed — ${(parsed.errors || []).join("; ")}`);
  }
  const plan = parsed.data;
  const dailyPlans = { ...plan.dailyPlans };
  for (const day of WEEKDAYS) {
    const existing = dailyPlans[day] || { items: [] };
    const existingItems = (Array.isArray(existing.items) ? existing.items : []).map(enrichItem);
    const extras = Array.isArray(blueprint.days?.[day]) ? blueprint.days[day] : [];
    const theme = blueprint.dayThemes?.[day] || existing.theme || "";
    // Avoid duplicate titles when re-running.
    const seen = new Set(existingItems.map((item) => String(item.title || "").toLowerCase()));
    const mergedExtras = extras.filter((item) => !seen.has(String(item.title || "").toLowerCase()));
    const dayTheme = theme || existing.theme || `${plan.theme || plan.title}: ${day}`;
    const dayObjectives = existing.objectives
      || (dayTheme ? `Explore ${dayTheme} through play-based, age-appropriate activities.` : multiline(plan.objectives).split("\n").slice(0, 3).join("\n"));
    dailyPlans[day] = {
      ...existing,
      theme: dayTheme,
      objectives: dayObjectives,
      learningDomains: (Array.isArray(existing.learningDomains) && existing.learningDomains.length)
        ? existing.learningDomains
        : (plan.learningDomains || []).slice(0, 4),
      materials: existing.materials || plan.weeklyMaterials || "",
      vocabulary: existing.vocabulary || plan.vocabularyWords || "",
      circleTime: (Array.isArray(existing.circleTime) && existing.circleTime.length)
        ? existing.circleTime
        : [
          `Welcome song connected to ${plan.theme || plan.title}.`,
          `Talk about today's focus: ${dayTheme}.`,
          "Invite children to share one idea or movement.",
        ],
      outdoorPlay: existing.outdoorPlay
        || `Outdoor play connected to ${plan.theme || plan.title}: movement, observation, and fresh-air exploration with close supervision.`,
      observations: (Array.isArray(existing.observations) && existing.observations.length)
        ? existing.observations
        : [
          "Engagement and interest in theme play",
          "Use of theme vocabulary",
          "Motor skills and social interaction",
        ],
      adaptations: existing.adaptations || plan.adaptations || DEFAULT_ADAPT,
      safetyNotes: existing.safetyNotes || DEFAULT_SAFE,
      items: [...existingItems, ...mergedExtras],
    };
  }
  return {
    ...plan,
    id: stableId,
    plan: blueprint.plan || plan.plan,
    status: "published",
    dailyPlans,
  };
}

function weekdayCounts(plan) {
  return Object.fromEntries(
    WEEKDAYS.map((day) => [day, Array.isArray(plan.dailyPlans?.[day]?.items) ? plan.dailyPlans[day].items.length : 0]),
  );
}

function main() {
  Object.values(OUT_DIRS).forEach(ensureDir);
  const report = [];
  for (const [stableId, blueprint] of Object.entries(BLUEPRINTS)) {
    const merged = mergePlan(stableId, blueprint);
    const counts = weekdayCounts(merged);
    const missing = WEEKDAYS.filter((day) => !counts[day]);
    if (missing.length) {
      throw new Error(`${stableId} still missing ${missing.join(",")}`);
    }
    const outDir = OUT_DIRS[blueprint.sourceDir];
    const outName = blueprint.sourceFile.replace(/\.txt$/, "") + "-complete.txt";
    // Prefer stable, readable filenames matching targets.
    const fileName = `${stableId.replace(/^cur-lp-/, "")}.txt`;
    const outPath = path.join(outDir, fileName);
    fs.writeFileSync(outPath, formatLessonFile(merged, blueprint), "utf8");
    // Re-parse to confirm importability.
    const check = parseCurriculumLessonPlanImport(fs.readFileSync(outPath, "utf8"));
    if (!check.ok) {
      throw new Error(`${stableId}: rewritten file failed parse: ${(check.errors || []).join("; ")}`);
    }
    const checkCounts = weekdayCounts(check.data);
    report.push({
      id: stableId,
      file: path.relative(ROOT, outPath),
      title: merged.title,
      age: merged.age,
      plan: blueprint.plan,
      counts: checkCounts,
      total: WEEKDAYS.reduce((sum, day) => sum + checkCounts[day], 0),
      altName: outName,
    });
    console.log(`OK ${stableId} → ${path.relative(ROOT, outPath)} (${JSON.stringify(checkCounts)})`);
  }
  const reportPath = path.join("/opt/cursor/artifacts", "truncated-week-completion-report.json");
  ensureDir(path.dirname(reportPath));
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), plans: report }, null, 2));
  console.log(`\nCompleted ${report.length} lesson plans.`);
  console.log(`Report: ${reportPath}`);
}

main();
