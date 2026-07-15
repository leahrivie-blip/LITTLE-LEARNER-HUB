/**
 * Toddler holiday Pro curriculum import targets (Easter, Fourth of July, New Year's).
 */
const fs = require("fs");
const path = require("path");
const parser = require("./curriculum-lesson-import-parser.js");
require("./curriculum-lesson-import-v4.js");

const TODDLER_HOLIDAY_IMPORT_DIR = path.join(__dirname, "curriculum-toddler-holiday-imports");

const TODDLER_HOLIDAY_IMPORT_TARGETS = [
  {
    file: "01-toddler-easter-eggstravaganza-pro.txt",
    stableId: "cur-lp-toddler-easter-eggstravaganza",
    plan: "Pro",
    title: "Easter Eggstravaganza",
    dayThemes: {
      monday: "Easter Exploration",
      tuesday: "Bunnies",
      wednesday: "Eggs & Chicks",
      thursday: "Pastel Creations",
      friday: "Easter Celebration",
    },
  },
  {
    file: "02-toddler-fourth-of-july-stars-stripes-pro.txt",
    stableId: "cur-lp-toddler-fourth-of-july-stars-stripes",
    plan: "Pro",
    title: "Fourth of July Stars & Stripes",
    dayThemes: {
      monday: "Red White & Blue",
      tuesday: "Stars",
      wednesday: "Colors & Fireworks",
      thursday: "Flags & Fun",
      friday: "Celebration Day",
    },
  },
  {
    file: "03-toddler-new-years-little-celebrations-pro.txt",
    stableId: "cur-lp-toddler-new-years-little-celebrations",
    plan: "Pro",
    title: "New Year's Little Celebrations",
    dayThemes: {
      monday: "Party Time",
      tuesday: "Fireworks & Fun",
      wednesday: "Countdown",
      thursday: "Memories",
      friday: "Happy New Year",
    },
  },
];

function parseToddlerHolidayLessonImport(text, { itemIdPrefix = "item", dayThemes = {} } = {}) {
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
    age: "Toddler",
    dailyPlans,
    _activityCount: activityCount,
  };
}

function readToddlerHolidayImportTarget(target) {
  const importDir = target.importDir || TODDLER_HOLIDAY_IMPORT_DIR;
  const filePath = path.join(importDir, target.file);
  const text = fs.readFileSync(filePath, "utf8");
  const prefix = target.stableId.replace(/^cur-lp-/, "");
  const parsed = parseToddlerHolidayLessonImport(text, {
    itemIdPrefix: `item-${prefix}`,
    dayThemes: target.dayThemes || {},
  });
  return {
    ...parsed,
    id: target.stableId,
    title: target.title || parsed.title,
    plan: target.plan || "Pro",
    status: "published",
    age: "Toddler",
  };
}

function toddlerHolidayPlansMissing(curriculum, targets = TODDLER_HOLIDAY_IMPORT_TARGETS) {
  const plans = curriculum?.lessonPlans || [];
  return targets.filter((target) => !plans.some((plan) => plan.id === target.stableId));
}

module.exports = {
  TODDLER_HOLIDAY_IMPORT_DIR,
  TODDLER_HOLIDAY_IMPORT_TARGETS,
  parseToddlerHolidayLessonImport,
  readToddlerHolidayImportTarget,
  toddlerHolidayPlansMissing,
};
