/**
 * Shared preschool curriculum import targets and parse helper.
 */
const fs = require("fs");
const path = require("path");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const IMPORT_DIR = path.join(__dirname, "curriculum-preschool-free-imports");

const PRESCHOOL_IMPORT_TARGETS = [
  { file: "01-preschool-colors-everywhere-free.txt", stableId: "cur-lp-preschool-colors-everywhere" },
  { file: "02-preschool-all-about-me-free.txt", stableId: "cur-lp-preschool-all-about-me" },
  { file: "03-preschool-letters-and-sounds-free.txt", stableId: "cur-lp-preschool-letters-and-sounds" },
  { file: "04-preschool-numbers-everywhere-free.txt", stableId: "cur-lp-preschool-numbers-everywhere" },
  { file: "05-preschool-feelings-and-emotions-free.txt", stableId: "cur-lp-preschool-feelings-and-emotions" },
  { file: "06-preschool-community-helpers-free.txt", stableId: "cur-lp-preschool-community-helpers" },
  { file: "07-preschool-shapes-around-us-free.txt", stableId: "cur-lp-preschool-shapes-around-us" },
  { file: "08-preschool-weather-watchers-free.txt", stableId: "cur-lp-preschool-weather-watchers" },
  { file: "09-preschool-farm-animals-free.txt", stableId: "cur-lp-preschool-farm-animals" },
  { file: "10-preschool-five-senses-free.txt", stableId: "cur-lp-preschool-five-senses" },
];

function parsePreschoolLessonImport(text, { itemIdPrefix = "item" } = {}) {
  const parsed = parseCurriculumLessonPlanImport(text);
  if (!parsed.ok) {
    throw new Error(parsed.errors.join(" "));
  }
  const data = parsed.data || {};
  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const dailyPlans = {};
  let activityCount = 0;
  weekdays.forEach((day) => {
    const items = (data.dailyPlans?.[day]?.items || []).map((item, index) => ({
      ...item,
      itemId: `${itemIdPrefix}-${day}-${index + 1}`,
    }));
    activityCount += items.length;
    dailyPlans[day] = { items };
  });
  return {
    ...data,
    dailyPlans,
    _activityCount: activityCount,
  };
}

function readPreschoolImportTarget(target) {
  const filePath = path.join(IMPORT_DIR, target.file);
  const text = fs.readFileSync(filePath, "utf8");
  const prefix = target.stableId.replace(/^cur-lp-/, "");
  const parsed = parsePreschoolLessonImport(text, { itemIdPrefix: `item-${prefix}` });
  return {
    ...parsed,
    id: target.stableId,
    plan: "Free",
    status: "published",
  };
}

function preschoolPlansMissing(curriculum) {
  const plans = curriculum?.lessonPlans || [];
  return PRESCHOOL_IMPORT_TARGETS.filter((target) => !plans.some((plan) => plan.id === target.stableId));
}

module.exports = {
  IMPORT_DIR,
  PRESCHOOL_IMPORT_TARGETS,
  parsePreschoolLessonImport,
  readPreschoolImportTarget,
  preschoolPlansMissing,
};
