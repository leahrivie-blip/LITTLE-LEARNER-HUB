/**
 * Infant Pro batch2 + Toddler Pro batch2/3 import targets (Gold-Standard ready files).
 * Skips Construction Zone stub.
 */
const fs = require("fs");
const path = require("path");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const INFANT_PRO_BATCH2_DIR = path.join(__dirname, "curriculum-infant-pro-batch2-imports");
const TODDLER_PRO_BATCH2_DIR = path.join(__dirname, "curriculum-toddler-pro-batch2-imports");
const TODDLER_PRO_BATCH3_DIR = path.join(__dirname, "curriculum-toddler-pro-batch3-imports");

const INFANT_TODDLER_PRO_BATCH_TARGETS = [
  // Infant Pro batch 2
  { file: "01-infant-zoo-animals-pro.txt", importDir: INFANT_PRO_BATCH2_DIR, stableId: "cur-lp-infant-zoo-animals", plan: "Pro", title: "Zoo Animals", ageFamily: "Infant" },
  { file: "02-infant-baby-sign-language-pro.txt", importDir: INFANT_PRO_BATCH2_DIR, stableId: "cur-lp-infant-baby-sign-language", plan: "Pro", title: "Baby Sign Language", ageFamily: "Infant" },
  { file: "03-infant-woodland-animals-pro.txt", importDir: INFANT_PRO_BATCH2_DIR, stableId: "cur-lp-infant-woodland-animals", plan: "Pro", title: "Woodland Animals", ageFamily: "Infant" },
  { file: "04-infant-pets-we-love-pro.txt", importDir: INFANT_PRO_BATCH2_DIR, stableId: "cur-lp-infant-pets-we-love", plan: "Pro", title: "Pets We Love", ageFamily: "Infant" },
  { file: "05-infant-texture-adventures-pro.txt", importDir: INFANT_PRO_BATCH2_DIR, stableId: "cur-lp-infant-texture-adventures", plan: "Pro", title: "Texture Adventures", ageFamily: "Infant" },
  { file: "06-infant-move-and-groove-babies-pro.txt", importDir: INFANT_PRO_BATCH2_DIR, stableId: "cur-lp-infant-move-and-groove-babies", plan: "Pro", title: "Move & Groove Babies", ageFamily: "Infant" },
  // Toddler Pro batch 2 (skip construction zone stub)
  { file: "02-toddler-farm-stem-pro.txt", importDir: TODDLER_PRO_BATCH2_DIR, stableId: "cur-lp-toddler-farm-stem", plan: "Pro", title: "Farm STEM", ageFamily: "Toddler" },
  { file: "03-toddler-little-bakers-pro.txt", importDir: TODDLER_PRO_BATCH2_DIR, stableId: "cur-lp-toddler-little-bakers", plan: "Pro", title: "Little Bakers", ageFamily: "Toddler" },
  { file: "04-toddler-transportation-builders-pro.txt", importDir: TODDLER_PRO_BATCH2_DIR, stableId: "cur-lp-toddler-transportation-builders", plan: "Pro", title: "Transportation Builders", ageFamily: "Toddler" },
  { file: "05-toddler-little-scientists-pro.txt", importDir: TODDLER_PRO_BATCH2_DIR, stableId: "cur-lp-toddler-little-scientists-stem", plan: "Pro", title: "Little Scientists", ageFamily: "Toddler" },
  // Toddler Pro batch 3
  { file: "01-toddler-amazing-insects-pro.txt", importDir: TODDLER_PRO_BATCH3_DIR, stableId: "cur-lp-toddler-amazing-insects", plan: "Pro", title: "Amazing Insects", ageFamily: "Toddler" },
  { file: "02-toddler-nature-explorers-pro.txt", importDir: TODDLER_PRO_BATCH3_DIR, stableId: "cur-lp-toddler-nature-explorers", plan: "Pro", title: "Nature Explorers", ageFamily: "Toddler" },
  { file: "03-toddler-rainbow-science-pro.txt", importDir: TODDLER_PRO_BATCH3_DIR, stableId: "cur-lp-toddler-rainbow-science", plan: "Pro", title: "Rainbow Science", ageFamily: "Toddler" },
  { file: "04-toddler-busy-builders-pro.txt", importDir: TODDLER_PRO_BATCH3_DIR, stableId: "cur-lp-toddler-busy-builders", plan: "Pro", title: "Busy Builders", ageFamily: "Toddler" },
  { file: "05-toddler-weather-lab-pro.txt", importDir: TODDLER_PRO_BATCH3_DIR, stableId: "cur-lp-toddler-weather-lab", plan: "Pro", title: "Weather Lab", ageFamily: "Toddler" },
  { file: "06-toddler-apple-orchard-adventures-pro.txt", importDir: TODDLER_PRO_BATCH3_DIR, stableId: "cur-lp-toddler-apple-orchard-adventures", plan: "Pro", title: "Apple Orchard Adventures", ageFamily: "Toddler" },
  { file: "07-toddler-pond-life-explorers-pro.txt", importDir: TODDLER_PRO_BATCH3_DIR, stableId: "cur-lp-toddler-pond-life-explorers", plan: "Pro", title: "Pond Life Explorers", ageFamily: "Toddler" },
  { file: "08-toddler-growing-gardens-stem-pro.txt", importDir: TODDLER_PRO_BATCH3_DIR, stableId: "cur-lp-toddler-growing-gardens-stem", plan: "Pro", title: "Growing Gardens STEM", ageFamily: "Toddler" },
  { file: "09-toddler-space-explorers-stem-pro.txt", importDir: TODDLER_PRO_BATCH3_DIR, stableId: "cur-lp-toddler-space-explorers-stem", plan: "Pro", title: "Space Explorers STEM", ageFamily: "Toddler" },
  { file: "10-toddler-fossil-hunters-pro.txt", importDir: TODDLER_PRO_BATCH3_DIR, stableId: "cur-lp-toddler-fossil-hunters", plan: "Pro", title: "Fossil Hunters", ageFamily: "Toddler" },
];

function parseBatchLessonImport(text, { itemIdPrefix = "item" } = {}) {
  const parsed = parseCurriculumLessonPlanImport(text);
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
      itemId: item.itemId || `${itemIdPrefix}-${day}-${index + 1}`,
    }));
    activityCount += items.length;
    dailyPlans[day] = {
      theme: sourceDay.theme || "",
      objectives: sourceDay.objectives || "",
      materials: sourceDay.materials || "",
      vocabulary: sourceDay.vocabulary || "",
      books: sourceDay.books || [],
      songs: sourceDay.songs || [],
      circleTime: sourceDay.circleTime || [],
      outdoorPlay: sourceDay.outdoorPlay || "",
      observations: sourceDay.observations || [],
      adaptations: sourceDay.adaptations || "",
      safetyNotes: sourceDay.safetyNotes || "",
      learningDomains: sourceDay.learningDomains || [],
      items,
    };
  });
  return {
    ...data,
    dailyPlans,
    _activityCount: activityCount,
  };
}

function readInfantToddlerProBatchTarget(target) {
  const filePath = path.join(target.importDir, target.file);
  const text = fs.readFileSync(filePath, "utf8");
  const prefix = target.stableId.replace(/^cur-lp-/, "");
  const parsed = parseBatchLessonImport(text, { itemIdPrefix: `item-${prefix}` });
  return {
    ...parsed,
    id: target.stableId,
    plan: target.plan || "Pro",
    status: "published",
  };
}

function infantToddlerProBatchPlansMissing(curriculum, targets = INFANT_TODDLER_PRO_BATCH_TARGETS) {
  const plans = curriculum?.lessonPlans || [];
  return targets.filter((target) => !plans.some((plan) => plan.id === target.stableId));
}

module.exports = {
  INFANT_PRO_BATCH2_DIR,
  TODDLER_PRO_BATCH2_DIR,
  TODDLER_PRO_BATCH3_DIR,
  INFANT_TODDLER_PRO_BATCH_TARGETS,
  parseBatchLessonImport,
  readInfantToddlerProBatchTarget,
  infantToddlerProBatchPlansMissing,
};
