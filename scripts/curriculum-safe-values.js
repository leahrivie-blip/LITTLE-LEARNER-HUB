/**
 * Defensive coercions for curriculum lesson plan render paths.
 * Browser: globalThis.CurriculumSafeValues
 * Node: module.exports
 */
(function curriculumSafeValuesModule() {
const CURRICULUM_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function curriculumAsString(value) {
  if (value == null) return "";
  return String(value).trim();
}

function curriculumAsStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => curriculumAsString(entry)).filter(Boolean);
  }
  const text = curriculumAsString(value);
  if (!text) return [];
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function curriculumAsObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function curriculumAsBookList(value) {
  return Array.isArray(value) ? value.map((book) => ({
    title: curriculumAsString(book?.title),
    author: curriculumAsString(book?.author),
    notes: curriculumAsString(book?.notes),
  })) : [];
}

function curriculumAsSongList(value) {
  return Array.isArray(value) ? value.map((song) => ({
    title: curriculumAsString(song?.title),
    notes: curriculumAsString(song?.notes),
  })) : [];
}

function emptyCurriculumDailyPlanDayForRender() {
  return {
    theme: "",
    objectives: "",
    learningDomains: [],
    materials: "",
    vocabulary: "",
    books: [],
    songs: [],
    circleTime: [],
    transitions: [],
    outdoorPlay: "",
    familyConnection: "",
    observations: [],
    adaptations: "",
    safetyNotes: "",
    items: [],
  };
}

function emptyCurriculumDailyPlansForRender() {
  return Object.fromEntries(CURRICULUM_WEEKDAYS.map((day) => [day, emptyCurriculumDailyPlanDayForRender()]));
}

function normalizeCurriculumDailyItemForRender(item = {}) {
  const entry = curriculumAsObject(item);
  return {
    itemId: curriculumAsString(entry.itemId),
    importKey: curriculumAsString(entry.importKey),
    activityCategory: curriculumAsString(entry.activityCategory) || "Open-Ended Exploration",
    title: curriculumAsString(entry.title),
    objective: curriculumAsString(entry.objective),
    description: curriculumAsString(entry.description),
    learningDomains: curriculumAsStringArray(entry.learningDomains),
    materials: curriculumAsString(entry.materials),
    setup: curriculumAsString(entry.setup),
    steps: curriculumAsString(entry.steps || entry.directions),
    teacherRole: curriculumAsString(entry.teacherRole),
    teacherLanguage: curriculumAsString(entry.teacherLanguage),
    learningGoals: curriculumAsStringArray(entry.learningGoals),
    observationOpportunities: curriculumAsString(entry.observationOpportunities),
    vocabulary: curriculumAsString(entry.vocabulary),
    extensions: curriculumAsString(entry.extensions),
    adaptations: curriculumAsString(entry.adaptations),
    safetyNotes: curriculumAsString(entry.safetyNotes),
    ageModifications: curriculumAsString(entry.ageModifications),
  };
}

function normalizeCurriculumDailyDayForRender(dayPlan = {}) {
  const entry = curriculumAsObject(dayPlan);
  return {
    theme: curriculumAsString(entry.theme),
    objectives: curriculumAsString(entry.objectives),
    learningDomains: curriculumAsStringArray(entry.learningDomains),
    materials: curriculumAsString(entry.materials),
    vocabulary: curriculumAsString(entry.vocabulary),
    books: curriculumAsBookList(entry.books),
    songs: curriculumAsSongList(entry.songs),
    circleTime: curriculumAsStringArray(entry.circleTime),
    transitions: curriculumAsStringArray(entry.transitions),
    outdoorPlay: curriculumAsString(entry.outdoorPlay),
    familyConnection: curriculumAsString(entry.familyConnection),
    observations: curriculumAsStringArray(entry.observations),
    adaptations: curriculumAsString(entry.adaptations),
    safetyNotes: curriculumAsString(entry.safetyNotes),
    items: Array.isArray(entry.items)
      ? entry.items.map((item) => normalizeCurriculumDailyItemForRender(item)).filter((item) => item.title)
      : [],
  };
}

function normalizeCurriculumLessonPlanForRender(plan = {}) {
  const entry = curriculumAsObject(plan);
  const dailyPlans = emptyCurriculumDailyPlansForRender();
  const inputDaily = curriculumAsObject(entry.dailyPlans);
  CURRICULUM_WEEKDAYS.forEach((day) => {
    dailyPlans[day] = normalizeCurriculumDailyDayForRender(inputDaily[day]);
  });
  return {
    id: curriculumAsString(entry.id),
    title: curriculumAsString(entry.title),
    age: curriculumAsString(entry.age) || "Preschool",
    theme: curriculumAsString(entry.theme),
    plan: curriculumAsString(entry.plan) || "Free",
    status: curriculumAsString(entry.status) || "draft",
    locked: Boolean(entry.locked),
    learningDomains: curriculumAsStringArray(entry.learningDomains),
    weeklyOverview: curriculumAsString(entry.weeklyOverview),
    objectives: curriculumAsString(entry.objectives),
    weeklyMaterials: curriculumAsString(entry.weeklyMaterials),
    vocabularyWords: curriculumAsString(entry.vocabularyWords),
    observationOpportunities: curriculumAsString(entry.observationOpportunities),
    adaptations: curriculumAsString(entry.adaptations),
    familyConnection: curriculumAsString(entry.familyConnection),
    books: curriculumAsBookList(entry.books),
    songs: curriculumAsSongList(entry.songs),
    dailyPlans,
    dailyActivityPreview: curriculumAsObject(entry.dailyActivityPreview),
    activityCount: Number(entry.activityCount) || 0,
    activityIds: curriculumAsStringArray(entry.activityIds),
    resourceIds: curriculumAsStringArray(entry.resourceIds),
    createdAt: curriculumAsString(entry.createdAt),
    updatedAt: curriculumAsString(entry.updatedAt),
  };
}

function curriculumAgeSelectOptions(selectedAge = "") {
  const age = curriculumAsString(selectedAge) || "Preschool";
  const base = ["Infant", "Toddler", "Preschool"];
  const options = base.includes(age) ? base : [...base, age];
  return options.map((option) => ({
    value: option,
    selected: option === age,
  }));
}

const api = {
  CURRICULUM_WEEKDAYS,
  curriculumAsString,
  curriculumAsStringArray,
  curriculumAsObject,
  curriculumAsBookList,
  curriculumAsSongList,
  emptyCurriculumDailyPlanDayForRender,
  emptyCurriculumDailyPlansForRender,
  normalizeCurriculumDailyItemForRender,
  normalizeCurriculumDailyDayForRender,
  normalizeCurriculumLessonPlanForRender,
  curriculumAgeSelectOptions,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
} else {
  globalThis.CurriculumSafeValues = api;
}
})();
