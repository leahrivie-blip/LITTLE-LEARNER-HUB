/**
 * Preschool holiday Pro curriculum import targets (Easter, Fourth of July, New Year's).
 */
const fs = require("fs");
const path = require("path");
const parser = require("./curriculum-lesson-import-parser.js");
require("./curriculum-lesson-import-v4.js");

const PRESCHOOL_HOLIDAY_IMPORT_DIR = path.join(__dirname, "curriculum-preschool-holiday-imports");

const PRESCHOOL_HOLIDAY_IMPORT_TARGETS = [
  {
    file: "01-preschool-easter-eggs-chicks-spring-science-pro.txt",
    stableId: "cur-lp-preschool-easter-eggs-chicks-spring-science",
    plan: "Pro",
    title: "Easter Eggs, Chicks & Spring Science",
    dayThemes: {
      monday: "Egg Investigations",
      tuesday: "Chick Life Cycles",
      wednesday: "Engineering & Art",
      thursday: "Seeds & Patterns",
      friday: "Spring Celebration",
    },
  },
  {
    file: "02-preschool-fourth-of-july-stars-stripes-community-heroes-pro.txt",
    stableId: "cur-lp-preschool-fourth-of-july-stars-stripes-community-heroes",
    plan: "Pro",
    title: "Fourth of July Stars, Stripes & Community Heroes",
    dayThemes: {
      monday: "Patriotic Symbols",
      tuesday: "Community Heroes",
      wednesday: "Fireworks Science",
      thursday: "Parade Builders",
      friday: "Celebration Day",
    },
  },
  {
    file: "03-preschool-new-years-goal-setters-big-dreams-pro.txt",
    stableId: "cur-lp-preschool-new-years-goal-setters-big-dreams",
    plan: "Pro",
    title: "New Year's Goal Setters & Big Dreams",
    dayThemes: {
      monday: "Memories & Reflection",
      tuesday: "Dreams & Goals",
      wednesday: "Growth Challenges",
      thursday: "Future Self",
      friday: "Celebration Day",
    },
  },
];

function parsePreschoolHolidayLessonImport(text, { itemIdPrefix = "item", dayThemes = {} } = {}) {
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

function readPreschoolHolidayImportTarget(target) {
  const importDir = target.importDir || PRESCHOOL_HOLIDAY_IMPORT_DIR;
  const filePath = path.join(importDir, target.file);
  const text = fs.readFileSync(filePath, "utf8");
  const prefix = target.stableId.replace(/^cur-lp-/, "");
  const parsed = parsePreschoolHolidayLessonImport(text, {
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

function preschoolHolidayPlansMissing(curriculum, targets = PRESCHOOL_HOLIDAY_IMPORT_TARGETS) {
  const { seedTargetsMissing } = require("./curriculum-deleted-lesson-tombstones.js");
  return seedTargetsMissing(curriculum, targets);
}

module.exports = {
  PRESCHOOL_HOLIDAY_IMPORT_DIR,
  PRESCHOOL_HOLIDAY_IMPORT_TARGETS,
  parsePreschoolHolidayLessonImport,
  readPreschoolHolidayImportTarget,
  preschoolHolidayPlansMissing,
};
