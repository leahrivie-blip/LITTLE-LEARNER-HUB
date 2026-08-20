/**
 * Preschool Pro high-value priority curriculum import targets.
 * Growing batch: Construction Engineers, then remaining priority themes as pasted.
 */
const fs = require("fs");
const path = require("path");
const parser = require("./curriculum-lesson-import-parser.js");
require("./curriculum-lesson-import-v4.js");

const PRESCHOOL_PRIORITY_IMPORT_DIR = path.join(__dirname, "curriculum-preschool-priority-imports");

const PRESCHOOL_PRIORITY_IMPORT_TARGETS = [
  {
    file: "01-preschool-construction-engineers-pro.txt",
    stableId: "cur-lp-preschool-construction-engineers",
    plan: "Pro",
    title: "Construction Engineers",
    dayThemes: {
      monday: "Construction Site Setup",
      tuesday: "Towers & Tools",
      wednesday: "Bridges & Measurement",
      thursday: "Roads & Vehicles",
      friday: "City Build Celebration",
    },
  },
];

function parsePreschoolPriorityLessonImport(text, { itemIdPrefix = "item", dayThemes = {} } = {}) {
  const parsed = parser.parseCurriculumLessonPlanImport(text, { mode: "v4" });
  if (!parsed.ok) {
    throw new Error((parsed.errors || []).join(" "));
  }
  const data = parsed.data || {};
  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const dailyPlans = {};
  let activityCount = 0;
  weekdays.forEach((day) => {
    const sourceDay = data.dailyPlans?.[day] || {};
    const items = (sourceDay.items || []).map((item, index) => ({
      ...item,
      itemId: `${itemIdPrefix}-${day}-${index + 1}`,
    }));
    activityCount += items.length;
    dailyPlans[day] = {
      theme: dayThemes[day] || sourceDay.theme || "",
      objectives: sourceDay.objectives || "",
      materials: sourceDay.materials || "",
      vocabulary: sourceDay.vocabulary || "",
      books: sourceDay.books || [],
      songs: sourceDay.songs || [],
      items,
    };
  });
  return {
    ...data,
    age: "Preschool",
    dailyPlans,
    _activityCount: activityCount,
  };
}

function readPreschoolPriorityImportTarget(target) {
  const importDir = target.importDir || PRESCHOOL_PRIORITY_IMPORT_DIR;
  const filePath = path.join(importDir, target.file);
  const text = fs.readFileSync(filePath, "utf8");
  const prefix = target.stableId.replace(/^cur-lp-/, "");
  const parsed = parsePreschoolPriorityLessonImport(text, {
    itemIdPrefix: `item-${prefix}`,
    dayThemes: target.dayThemes || {},
  });
  return {
    ...parsed,
    id: target.stableId,
    title: target.title || parsed.title,
    plan: target.plan || "Pro",
    status: "published",
    age: "Preschool",
  };
}

function preschoolPriorityPlansMissing(curriculum, targets = PRESCHOOL_PRIORITY_IMPORT_TARGETS) {
  const { seedTargetsMissing } = require("./curriculum-deleted-lesson-tombstones.js");
  return seedTargetsMissing(curriculum, targets);
}

module.exports = {
  PRESCHOOL_PRIORITY_IMPORT_DIR,
  PRESCHOOL_PRIORITY_IMPORT_TARGETS,
  parsePreschoolPriorityLessonImport,
  readPreschoolPriorityImportTarget,
  preschoolPriorityPlansMissing,
};
