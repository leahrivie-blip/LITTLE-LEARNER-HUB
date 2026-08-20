/**
 * Infant holiday Pro curriculum import targets (Easter, Fourth of July, New Year's).
 */
const fs = require("fs");
const path = require("path");
const parser = require("./curriculum-lesson-import-parser.js");
require("./curriculum-lesson-import-v4.js");

const INFANT_HOLIDAY_IMPORT_DIR = path.join(__dirname, "curriculum-infant-holiday-imports");

const INFANT_HOLIDAY_IMPORT_TARGETS = [
  {
    file: "01-infant-easter-exploration-pro.txt",
    stableId: "cur-lp-infant-easter-exploration",
    plan: "Pro",
    title: "Easter Exploration",
    dayThemes: {
      monday: "Pastel Colors",
      tuesday: "Bunnies",
      wednesday: "Eggs",
      thursday: "Chicks & Spring",
      friday: "Easter Celebration",
    },
  },
  {
    file: "02-infant-fourth-of-july-celebration-pro.txt",
    stableId: "cur-lp-infant-fourth-of-july-celebration",
    plan: "Pro",
    title: "Fourth of July Celebration",
    dayThemes: {
      monday: "Red White & Blue",
      tuesday: "Stars",
      wednesday: "Flags",
      thursday: "Patriotic Sensory",
      friday: "Celebration Day",
    },
  },
  {
    file: "03-infant-new-years-celebration-pro.txt",
    stableId: "cur-lp-infant-new-years-celebration",
    plan: "Pro",
    title: "New Year's Celebration",
    dayThemes: {
      monday: "Sparkle",
      tuesday: "Stars",
      wednesday: "Celebration Faces",
      thursday: "Party Sensory",
      friday: "Happy New Year",
    },
  },
];

function parseInfantHolidayLessonImport(text, { itemIdPrefix = "item", dayThemes = {} } = {}) {
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
    age: "Infant",
    dailyPlans,
    _activityCount: activityCount,
  };
}

function readInfantHolidayImportTarget(target) {
  const importDir = target.importDir || INFANT_HOLIDAY_IMPORT_DIR;
  const filePath = path.join(importDir, target.file);
  const text = fs.readFileSync(filePath, "utf8");
  const prefix = target.stableId.replace(/^cur-lp-/, "");
  const parsed = parseInfantHolidayLessonImport(text, {
    itemIdPrefix: `item-${prefix}`,
    dayThemes: target.dayThemes || {},
  });
  return {
    ...parsed,
    id: target.stableId,
    title: target.title || parsed.title,
    plan: target.plan || "Pro",
    status: "published",
    age: "Infant",
  };
}

function infantHolidayPlansMissing(curriculum, targets = INFANT_HOLIDAY_IMPORT_TARGETS) {
  const { seedTargetsMissing } = require("./curriculum-deleted-lesson-tombstones.js");
  return seedTargetsMissing(curriculum, targets);
}

module.exports = {
  INFANT_HOLIDAY_IMPORT_DIR,
  INFANT_HOLIDAY_IMPORT_TARGETS,
  parseInfantHolidayLessonImport,
  readInfantHolidayImportTarget,
  infantHolidayPlansMissing,
};
