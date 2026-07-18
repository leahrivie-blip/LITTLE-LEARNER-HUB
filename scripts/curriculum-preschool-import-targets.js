/**
 * Shared preschool curriculum import targets and parse helper.
 */
const fs = require("fs");
const path = require("path");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const FREE_IMPORT_DIR = path.join(__dirname, "curriculum-preschool-free-imports");
const PRO_IMPORT_DIR = path.join(__dirname, "curriculum-preschool-pro-imports");
const PRO_BATCH2_IMPORT_DIR = path.join(__dirname, "curriculum-preschool-pro-batch2-imports");

const PRESCHOOL_FREE_IMPORT_TARGETS = [
  // Curated Free sample keeps All About Me, Community Helpers, Weather Watchers, Farm Animals.
  // Remaining former Free preschool plans move to Pro so Free stays a high-quality preview.
  { file: "01-preschool-colors-everywhere-free.txt", stableId: "cur-lp-preschool-colors-everywhere", plan: "Pro", importDir: FREE_IMPORT_DIR },
  { file: "02-preschool-all-about-me-free.txt", stableId: "cur-lp-preschool-all-about-me", plan: "Free", importDir: FREE_IMPORT_DIR },
  { file: "03-preschool-letters-and-sounds-free.txt", stableId: "cur-lp-preschool-letters-and-sounds", plan: "Pro", importDir: FREE_IMPORT_DIR },
  { file: "04-preschool-numbers-everywhere-free.txt", stableId: "cur-lp-preschool-numbers-everywhere", plan: "Pro", importDir: FREE_IMPORT_DIR },
  { file: "05-preschool-feelings-and-emotions-free.txt", stableId: "cur-lp-preschool-feelings-and-emotions", plan: "Pro", importDir: FREE_IMPORT_DIR },
  { file: "06-preschool-community-helpers-free.txt", stableId: "cur-lp-preschool-community-helpers", plan: "Free", importDir: FREE_IMPORT_DIR },
  { file: "07-preschool-shapes-around-us-free.txt", stableId: "cur-lp-preschool-shapes-around-us", plan: "Pro", importDir: FREE_IMPORT_DIR },
  { file: "08-preschool-weather-watchers-free.txt", stableId: "cur-lp-preschool-weather-watchers", plan: "Free", importDir: FREE_IMPORT_DIR },
  { file: "09-preschool-farm-animals-free.txt", stableId: "cur-lp-preschool-farm-animals", plan: "Free", importDir: FREE_IMPORT_DIR },
  { file: "10-preschool-five-senses-free.txt", stableId: "cur-lp-preschool-five-senses", plan: "Pro", importDir: FREE_IMPORT_DIR },
];

const PRESCHOOL_PRO_IMPORT_TARGETS = [
  { file: "01-preschool-fairy-tale-adventures-pro.txt", stableId: "cur-lp-preschool-fairy-tale-adventures", plan: "Pro", importDir: PRO_IMPORT_DIR },
  { file: "02-preschool-dinosaur-discovery-pro.txt", stableId: "cur-lp-preschool-dinosaur-discovery", plan: "Pro", importDir: PRO_IMPORT_DIR },
  { file: "03-preschool-space-adventure-pro.txt", stableId: "cur-lp-preschool-space-adventure", plan: "Pro", importDir: PRO_IMPORT_DIR },
  { file: "04-preschool-stem-explorers-pro.txt", stableId: "cur-lp-preschool-stem-explorers", plan: "Pro", importDir: PRO_IMPORT_DIR },
  { file: "05-preschool-transportation-adventures-pro.txt", stableId: "cur-lp-preschool-transportation-adventures", plan: "Pro", importDir: PRO_IMPORT_DIR },
  { file: "06-preschool-healthy-habits-pro.txt", stableId: "cur-lp-preschool-healthy-habits", plan: "Pro", importDir: PRO_IMPORT_DIR },
  { file: "07-preschool-around-the-world-pro.txt", stableId: "cur-lp-preschool-around-the-world", plan: "Pro", importDir: PRO_IMPORT_DIR },
  { file: "08-preschool-ocean-explorers-pro.txt", stableId: "cur-lp-preschool-ocean-explorers", plan: "Pro", importDir: PRO_IMPORT_DIR },
  { file: "09-preschool-seasons-of-the-year-pro.txt", stableId: "cur-lp-preschool-seasons-of-the-year", plan: "Pro", importDir: PRO_IMPORT_DIR },
  { file: "10-preschool-kindergarten-readiness-pro.txt", stableId: "cur-lp-preschool-kindergarten-readiness", plan: "Pro", importDir: PRO_IMPORT_DIR },
];

const PRESCHOOL_PRO_BATCH2_IMPORT_TARGETS = [
  { file: "11-preschool-animal-habitats-pro.txt", stableId: "cur-lp-preschool-animal-habitats", plan: "Pro", importDir: PRO_BATCH2_IMPORT_DIR },
  { file: "12-preschool-construction-zone-pro.txt", stableId: "cur-lp-preschool-construction-zone", plan: "Pro", importDir: PRO_BATCH2_IMPORT_DIR },
  { file: "13-preschool-camping-adventure-pro.txt", stableId: "cur-lp-preschool-camping-adventure", plan: "Pro", importDir: PRO_BATCH2_IMPORT_DIR },
  { file: "14-preschool-little-scientists-pro.txt", stableId: "cur-lp-preschool-little-scientists", plan: "Pro", importDir: PRO_BATCH2_IMPORT_DIR },
  { file: "15-preschool-amazing-insects-pro.txt", stableId: "cur-lp-preschool-amazing-insects", plan: "Pro", importDir: PRO_BATCH2_IMPORT_DIR },
  { file: "16-preschool-inventors-workshop-pro.txt", stableId: "cur-lp-preschool-inventors-workshop", plan: "Pro", importDir: PRO_BATCH2_IMPORT_DIR },
  { file: "17-preschool-archaeology-adventure-pro.txt", stableId: "cur-lp-preschool-archaeology-adventure", plan: "Pro", importDir: PRO_BATCH2_IMPORT_DIR },
  { file: "18-preschool-gardening-plant-life-pro.txt", stableId: "cur-lp-preschool-gardening-plant-life", plan: "Pro", importDir: PRO_BATCH2_IMPORT_DIR },
  { file: "19-preschool-pet-pals-pro.txt", stableId: "cur-lp-preschool-pet-pals", plan: "Pro", importDir: PRO_BATCH2_IMPORT_DIR },
  { file: "20-preschool-zoo-adventure-pro.txt", stableId: "cur-lp-preschool-zoo-adventure", plan: "Pro", importDir: PRO_BATCH2_IMPORT_DIR },
];

const PRESCHOOL_IMPORT_TARGETS = [
  ...PRESCHOOL_FREE_IMPORT_TARGETS,
  ...PRESCHOOL_PRO_IMPORT_TARGETS,
  ...PRESCHOOL_PRO_BATCH2_IMPORT_TARGETS,
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
  const importDir = target.importDir || FREE_IMPORT_DIR;
  const filePath = path.join(importDir, target.file);
  const text = fs.readFileSync(filePath, "utf8");
  const prefix = target.stableId.replace(/^cur-lp-/, "");
  const parsed = parsePreschoolLessonImport(text, { itemIdPrefix: `item-${prefix}` });
  return {
    ...parsed,
    id: target.stableId,
    plan: target.plan || "Free",
    status: "published",
  };
}

function preschoolPlansMissing(curriculum, targets = PRESCHOOL_IMPORT_TARGETS) {
  const plans = curriculum?.lessonPlans || [];
  return targets.filter((target) => !plans.some((plan) => plan.id === target.stableId));
}

module.exports = {
  FREE_IMPORT_DIR,
  PRO_IMPORT_DIR,
  PRO_BATCH2_IMPORT_DIR,
  PRESCHOOL_FREE_IMPORT_TARGETS,
  PRESCHOOL_PRO_IMPORT_TARGETS,
  PRESCHOOL_PRO_BATCH2_IMPORT_TARGETS,
  PRESCHOOL_IMPORT_TARGETS,
  parsePreschoolLessonImport,
  readPreschoolImportTarget,
  preschoolPlansMissing,
};
